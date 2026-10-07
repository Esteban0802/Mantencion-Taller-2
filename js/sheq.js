import { db, storage } from "./firebase-config.js";
import { protegerPagina, cerrarSesion } from "./session.js?v=20261004-1";
import { moduloActivo } from "./modulos.js";
import { evaluarCuotaStorage, mensajeCuotaStorage } from "./storage-quota.js";
import { estadoDocumentoAcreditacion, evaluarEntidadEnContrato, peorEvaluacion } from "./sheq-acreditacion.js?v=20261004-2";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

const usuario = protegerPagina(["super_admin", "admin_empresa", "admin_sucursal", "jefe_taller", "planificador", "sheq"]);
if (!usuario) throw new Error("Acceso no autorizado");

const $ = id => document.getElementById(id);
const escapar = valor => String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const rolesEdicion = ["super_admin", "sheq"];
const puedeEditar = rolesEdicion.includes(usuario.rol);
let empresa = null, empresaId = "", sucursales = [], usuarios = [], contratos = [], vehiculos = [], documentos = [];

function mensaje(titulo, texto, tipo = "info") { return window.OverTrackUI.mostrarMensaje({ titulo, mensaje: texto, tipo }); }
function fechaISO(valor) { if (!valor) return ""; if (typeof valor === "string") return valor.slice(0, 10); if (valor.toDate) return valor.toDate().toISOString().slice(0, 10); return ""; }
function fechaVisible(valor) { const iso = fechaISO(valor); return iso ? new Intl.DateTimeFormat("es-CL").format(new Date(`${iso}T12:00:00`)) : "Sin vencimiento"; }
function fechaHoraVisible(valor) { if (!valor) return "Sin fecha"; const fecha = typeof valor === "string" ? new Date(valor) : valor.toDate ? valor.toDate() : new Date(valor); return Number.isNaN(fecha.valueOf()) ? "Sin fecha" : new Intl.DateTimeFormat("es-CL", { dateStyle:"short", timeStyle:"short" }).format(fecha); }
function diasHasta(valor) { const iso = fechaISO(valor); if (!iso) return null; const hoy = new Date(); hoy.setHours(0,0,0,0); return Math.ceil((new Date(`${iso}T00:00:00`) - hoy) / 86400000); }
function listaLineas(valor) { return String(valor || "").split("\n").map(v => v.trim()).filter(Boolean); }
function nombreSucursal(id) { return sucursales.find(s => s.id === id)?.nombre || "Todas / Sin sucursal"; }
function nombreContrato(id) { const c = contratos.find(item => item.id === id); return c ? `${c.cliente} · ${c.nombre}${c.faena ? ` · ${c.faena}` : ""}` : "Aplicación general"; }
function nombreUsuario(item) { return item.nombre || item.displayName || item.email || item.id; }
function nombreEntidad(tipo, id) { return tipo === "vehiculo" ? (vehiculos.find(v => v.id === id)?.patente || "Vehículo") : nombreUsuario(usuarios.find(u => u.id === id) || { id }); }
function nombreResponsable(id) { if (!id) return "Sin identificar"; if (id === usuario.uid) return usuario.nombre || usuario.email || "Usuario actual"; return nombreUsuario(usuarios.find(u => u.id === id) || { id }); }

function versionDocumento(item, motivo) {
  return {
    tipoDocumento: item.tipoDocumento || "",
    entidadTipo: item.entidadTipo || "persona",
    entidadId: item.entidadId || "",
    contratoId: item.contratoId || "",
    fechaEmision: fechaISO(item.fechaEmision),
    fechaVencimiento: fechaISO(item.fechaVencimiento),
    estado: item.estado || "pendiente",
    observaciones: item.observaciones || "",
    archivoUrl: item.archivoUrl || "",
    archivoRuta: item.archivoRuta || "",
    modificadoPor: usuario.uid,
    fechaModificacion: new Date().toISOString(),
    motivo
  };
}

function estadoDocumento(item) {
  return estadoDocumentoAcreditacion(item);
}

function estadoDocumentalEntidad(tipo, id) {
  const docs = documentos.filter(d => d.entidadTipo === tipo && d.entidadId === id);
  if (!docs.length) return { key: "sin-documentos", texto: "Pendiente" };
  const estados = docs.map(estadoDocumento);
  if (estados.some(e => ["vencido", "rechazado"].includes(e.key))) return { key: "vencido", texto: "No habilitado" };
  if (estados.some(e => ["pendiente", "observado"].includes(e.key))) return { key: "pendiente", texto: "Pendiente" };
  if (estados.some(e => ["aviso", "critico", "proximo"].includes(e.key))) return { key: "proximo", texto: "Con observaciones" };
  return { key: "vigente", texto: "Habilitado" };
}

function contratoActivo(contrato) {
  return !contrato.fechaTermino || (diasHasta(contrato.fechaTermino) ?? 0) >= 0;
}

function entidadCorrespondeContrato(tipo, entidad, contrato) {
  if (tipo === "persona" && Array.isArray(contrato.personalIds)) return contrato.personalIds.includes(entidad?.id);
  if (!contrato.sucursalId) return true;
  return entidad?.sucursalId === contrato.sucursalId;
}

function evaluacionesEntidad(tipo, id) {
  const entidad = tipo === "vehiculo" ? vehiculos.find(item => item.id === id) : usuarios.find(item => item.id === id);
  return contratos
    .filter(contrato => contratoActivo(contrato) && entidadCorrespondeContrato(tipo, entidad, contrato))
    .map(contrato => ({ contrato, ...evaluarEntidadEnContrato({ tipo, entidadId: id, contrato, documentos }) }));
}

function estadoEntidad(tipo, id) {
  const evaluaciones = evaluacionesEntidad(tipo, id).filter(item => item.key !== "sin-requisitos");
  return peorEvaluacion(evaluaciones) || estadoDocumentalEntidad(tipo, id);
}

function resumenFaenas(tipo, id) {
  const evaluaciones = evaluacionesEntidad(tipo, id).filter(item => item.key !== "sin-requisitos");
  return {
    total: evaluaciones.length,
    habilitadas: evaluaciones.filter(item => item.key === "vigente").length,
    observadas: evaluaciones.filter(item => item.key === "proximo").length,
    bloqueadas: evaluaciones.filter(item => ["pendiente", "vencido"].includes(item.key)).length
  };
}

function alertasMatriz() {
  const alertas = [];
  for (const contrato of contratos.filter(contratoActivo)) {
    for (const trabajador of usuarios.filter(item => entidadCorrespondeContrato("persona", item, contrato))) {
      const evaluacion = evaluarEntidadEnContrato({ tipo: "persona", entidadId: trabajador.id, contrato, documentos });
      for (const detalle of evaluacion.detalles.filter(item => item.key !== "vigente")) {
        alertas.push({ contrato, entidad: trabajador, detalle });
      }
    }
  }
  const prioridad = { faltante: 7, vencido: 7, rechazado: 6, pendiente: 5, observado: 5, critico: 4, proximo: 3, aviso: 2 };
  return alertas.sort((a, b) => (prioridad[b.detalle.key] || 0) - (prioridad[a.detalle.key] || 0));
}

async function obtenerColeccion(nombre) {
  const snap = await getDocs(query(collection(db, nombre), where("empresaId", "==", empresaId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function cargarSucursales() {
  if (["super_admin", "admin_empresa"].includes(usuario.rol)) return obtenerColeccion("sucursales");
  if (!usuario.sucursalId) return [];
  const snap = await getDoc(doc(db, "sucursales", usuario.sucursalId));
  return snap.exists() ? [{ id: snap.id, ...snap.data() }] : [];
}

async function cargarUsuarios() {
  const filtros = [where("empresaId", "==", empresaId)];
  if (!["super_admin", "admin_empresa"].includes(usuario.rol) && usuario.sucursalId) filtros.push(where("sucursalId", "==", usuario.sucursalId));
  const snap = await getDocs(query(collection(db, "usuarios"), ...filtros));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function cargarBase() {
  empresaId = usuario.rol === "super_admin" ? sessionStorage.getItem("empresaIdOperacionAdmin") || "" : usuario.empresaId || "";
  if (!empresaId) throw new Error("No se encontró la empresa activa.");
  const empresaSnap = await getDoc(doc(db, "empresas", empresaId));
  if (!empresaSnap.exists()) throw new Error("La empresa no existe.");
  empresa = { id: empresaSnap.id, ...empresaSnap.data() };
  if (!moduloActivo(empresa, "sheq")) { await mensaje("Módulo no habilitado", "SHEQ no está habilitado para esta empresa.", "advertencia"); location.replace("dashboard.html"); return false; }
  [sucursales, usuarios, contratos, vehiculos, documentos] = await Promise.all([cargarSucursales(), cargarUsuarios(), obtenerColeccion("sheqContratos"), obtenerColeccion("sheqVehiculos"), obtenerColeccion("sheqDocumentos")]);
  sucursales = sucursales.filter(s => s.activa !== false);
  usuarios = usuarios.filter(u => u.activo !== false && u.rol !== "super_admin");
  contratos.sort((a,b) => String(a.cliente).localeCompare(String(b.cliente)));
  vehiculos.sort((a,b) => String(a.patente).localeCompare(String(b.patente)));
  documentos.sort((a,b) => fechaISO(a.fechaVencimiento).localeCompare(fechaISO(b.fechaVencimiento)));
  return true;
}

function opciones(select, items, etiqueta, incluirVacio = true) {
  select.innerHTML = (incluirVacio ? `<option value="">${escapar(etiqueta)}</option>` : "") + items.map(i => `<option value="${escapar(i.id)}">${escapar(i.texto)}</option>`).join("");
}

function prepararSelectores() {
  const opsSuc = sucursales.map(s => ({ id:s.id, texto:s.nombre || s.codigo || s.id }));
  [$("contratoSucursal"), $("vehiculoSucursal")].forEach(s => opciones(s, opsSuc, s.id === "contratoSucursal" ? "Todas las sucursales" : "Sin sucursal"));
  const opsCon = contratos.map(c => ({ id:c.id, texto:nombreContrato(c.id) }));
  [$("vehiculoContrato"), $("documentoContrato")].forEach(s => opciones(s, opsCon, s.id === "documentoContrato" ? "Aplicación general" : "Sin contrato"));
  opciones($("contratoPersonal"), usuarios.map(u => ({ id:u.id, texto:`${nombreUsuario(u)} · ${u.rol || "Sin cargo"} · ${nombreSucursal(u.sucursalId)}` })), "", false);
  actualizarEntidadesDocumento();
}

function actualizarEntidadesDocumento() {
  const tipo = $("documentoEntidadTipo").value;
  const items = tipo === "vehiculo" ? vehiculos.map(v => ({ id:v.id, texto:`${v.patente} · ${v.marca || ""} ${v.modelo || ""}` })) : usuarios.map(u => ({ id:u.id, texto:`${nombreUsuario(u)} · ${u.rol || "Sin cargo"}` }));
  opciones($("documentoEntidadId"), items, `Seleccionar ${tipo === "vehiculo" ? "vehículo" : "trabajador"}`);
}

function renderPanel() {
  const personalEstados = usuarios.map(u => estadoEntidad("persona", u.id));
  const vehiculosEstados = vehiculos.map(v => estadoEntidad("vehiculo", v.id));
  const estadosDoc = documentos.map(d => ({ doc:d, estado:estadoDocumento(d) }));
  const vencidos = estadosDoc.filter(x => x.estado.key === "vencido");
  const proximos = estadosDoc.filter(x => ["aviso", "proximo", "critico"].includes(x.estado.key));
  const observaciones = estadosDoc.filter(x => ["observado", "rechazado", "pendiente"].includes(x.estado.key));
  $("kpiPersonalAcreditado").textContent = personalEstados.filter(e => e.key === "vigente").length;
  $("kpiPersonalPendiente").textContent = personalEstados.filter(e => e.key !== "vigente").length;
  $("kpiVencidos").textContent = vencidos.length; $("kpiPorVencer").textContent = proximos.length;
  $("kpiVehiculos").textContent = vehiculosEstados.filter(e => e.key === "vigente").length; $("kpiObservaciones").textContent = observaciones.length;
  const faltantesFaena = alertasMatriz();
  const alertasDocumentales = [...vencidos, ...proximos].map(item => ({ tipo: "documento", ...item }));
  const alertas = [...faltantesFaena.map(item => ({ tipo: "matriz", ...item })), ...alertasDocumentales].slice(0, 8);
  $("resumenAlertas").textContent = `${faltantesFaena.length + vencidos.length + proximos.length} alerta(s)`;
  $("listaAlertas").innerHTML = alertas.length ? alertas.map(item => {
    if (item.tipo === "matriz") {
      const grave = ["faltante", "vencido", "rechazado"].includes(item.detalle.key);
      return `<div class="sheq-alert ${grave ? "sheq-alarm-missing" : "proximo"}"><i></i><div><strong>${escapar(item.detalle.requisito)}</strong><small>${escapar(nombreUsuario(item.entidad))} · ${escapar(item.contrato.faena || item.contrato.nombre)} · ${escapar(item.detalle.texto)}</small></div><time>${item.detalle.documento ? escapar(fechaVisible(item.detalle.documento.fechaVencimiento)) : "Faltante"}</time></div>`;
    }
    return `<div class="sheq-alert ${item.estado.key === "vencido" ? "" : item.estado.key === "aviso" ? "aviso" : "proximo"}"><i></i><div><strong>${escapar(item.doc.tipoDocumento)}</strong><small>${escapar(nombreEntidad(item.doc.entidadTipo,item.doc.entidadId))} · ${escapar(item.estado.texto)}</small></div><time>${escapar(fechaVisible(item.doc.fechaVencimiento))}</time></div>`;
  }).join("") : '<div class="sheq-empty">No existen vencimientos ni requisitos pendientes.</div>';
  const evaluados = personalEstados.length + vehiculosEstados.length, habilitados = [...personalEstados,...vehiculosEstados].filter(e => e.key === "vigente").length;
  const porcentaje = evaluados ? Math.round(habilitados * 100 / evaluados) : 0;
  $("porcentajeCumplimiento").textContent = `${porcentaje}%`; $("barraCumplimiento").style.width = `${porcentaje}%`;
  $("resumenCumplimiento").innerHTML = `<div><span>Personal evaluado</span><strong>${personalEstados.length}</strong></div><div><span>Vehículos evaluados</span><strong>${vehiculosEstados.length}</strong></div><div><span>Contratos activos</span><strong>${contratos.filter(c => !c.fechaTermino || (diasHasta(c.fechaTermino) ?? 0) >= 0).length}</strong></div><div><span>Documentos registrados</span><strong>${documentos.length}</strong></div>`;
}

function renderPersonal() {
  const buscar = $("buscarPersonalSheq").value.trim().toLowerCase();
  const lista = usuarios.filter(u => [nombreUsuario(u),u.rut,u.rol,nombreSucursal(u.sucursalId)].join(" ").toLowerCase().includes(buscar));
  $("tablaPersonalSheq").innerHTML = lista.length ? lista.map(u => { const docs=documentos.filter(d=>d.entidadTipo==="persona"&&d.entidadId===u.id), e=estadoEntidad("persona",u.id), f=resumenFaenas("persona",u.id); return `<tr><td><strong>${escapar(nombreUsuario(u))}</strong><small>${escapar(u.email || "")}</small></td><td>${escapar(u.rut || "Sin RUT")}</td><td>${escapar(u.rol || "Sin cargo")}</td><td>${escapar(nombreSucursal(u.sucursalId))}</td><td>${docs.length}</td><td><strong>${f.habilitadas}/${f.total}</strong><small class="sheq-faena-resumen">${f.bloqueadas} no acreditada(s)</small></td><td><span class="sheq-status ${e.key}">${e.texto}</span></td><td><button class="sheq-action" data-matriz-persona="${u.id}">Ver faenas</button> ${puedeEditar?`<button class="sheq-action" data-documento-persona="${u.id}">Agregar documento</button>`:""}</td></tr>`; }).join("") : '<tr><td colspan="8" class="sheq-empty">No se encontraron trabajadores.</td></tr>';
}

function renderVehiculos() {
  $("tablaVehiculosSheq").innerHTML = vehiculos.length ? vehiculos.map(v => { const docs=documentos.filter(d=>d.entidadTipo==="vehiculo"&&d.entidadId===v.id),e=estadoEntidad("vehiculo",v.id); return `<tr><td><strong>${escapar(v.patente)}</strong><small>${escapar(v.tipo || "")}</small></td><td>${escapar(`${v.marca||""} ${v.modelo||""}`.trim() || "Sin detalle")}</td><td>${escapar(nombreSucursal(v.sucursalId))}</td><td>${escapar(nombreContrato(v.contratoId))}</td><td>${docs.length}</td><td><span class="sheq-status ${e.key}">${e.texto}</span></td><td>${puedeEditar?`<button class="sheq-action" data-editar-vehiculo="${v.id}">Editar</button> <button class="sheq-action" data-documento-vehiculo="${v.id}">Documento</button>`:"Consulta"}</td></tr>`; }).join("") : '<tr><td colspan="7" class="sheq-empty">Aún no se registran vehículos.</td></tr>';
}

function renderContratos() {
  $("listaContratosSheq").innerHTML = contratos.length ? contratos.map(c => { const rp=c.requisitosPersonal||[],rv=c.requisitosVehiculos||[], personas=usuarios.filter(u=>entidadCorrespondeContrato("persona",u,c)).map(u=>evaluarEntidadEnContrato({tipo:"persona",entidadId:u.id,contrato:c,documentos})).filter(e=>e.key!=="sin-requisitos"), ok=personas.filter(e=>e.key==="vigente").length, obs=personas.filter(e=>e.key==="proximo").length, no=personas.filter(e=>["pendiente","vencido"].includes(e.key)).length; return `<article class="sheq-contract"><header><div><h4>${escapar(c.cliente)} · ${escapar(c.nombre)}</h4><p>${escapar(c.faena || "Sin faena específica")} · ${escapar(nombreSucursal(c.sucursalId))}</p></div><span class="sheq-status ${(diasHasta(c.fechaTermino)??1)<0?"vencido":"vigente"}">${(diasHasta(c.fechaTermino)??1)<0?"Finalizado":"Activo"}</span></header><div class="sheq-contract-dates"><span>Inicio: ${escapar(fechaVisible(c.fechaInicio))}</span><span>Término: ${escapar(fechaVisible(c.fechaTermino))}</span></div><div class="sheq-requirements"><div><strong>Personal</strong><small>${rp.length} requisito(s)</small></div><div><strong>Vehículos</strong><small>${rv.length} requisito(s)</small></div></div><div class="sheq-contract-compliance"><div><strong>${ok}</strong><small>Acreditados</small></div><div><strong>${obs}</strong><small>Con observaciones</small></div><div><strong>${no}</strong><small>No acreditados</small></div></div><div class="sheq-contract-actions"><button class="sheq-action" data-matriz-contrato="${c.id}">Ver matriz</button>${puedeEditar?`<button class="sheq-action" data-editar-contrato="${c.id}">Editar</button><button class="sheq-action danger" data-eliminar-contrato="${c.id}">Eliminar</button>`:""}</div></article>`; }).join("") : '<div class="sheq-empty">Crea el primer contrato o faena para comenzar.</div>';
}

function renderDocumentos() {
  const buscar=$("buscarDocumentoSheq").value.trim().toLowerCase(), filtro=$("filtroEstadoDocumento").value;
  const lista=documentos.filter(d=>{const e=estadoDocumento(d);return (!buscar||[d.tipoDocumento,nombreEntidad(d.entidadTipo,d.entidadId),nombreContrato(d.contratoId)].join(" ").toLowerCase().includes(buscar))&&(!filtro||(filtro==="aprobado"?["vigente","aviso","proximo","critico"].includes(e.key):e.key===filtro));});
  $("tablaDocumentosSheq").innerHTML=lista.length?lista.map(d=>{const e=estadoDocumento(d),versiones=(d.historial||[]).length;return `<tr><td><strong>${escapar(nombreEntidad(d.entidadTipo,d.entidadId))}</strong><small>${d.entidadTipo==="vehiculo"?"Vehículo":"Trabajador"}</small></td><td>${escapar(d.tipoDocumento)}${versiones?`<small>${versiones} versión(es) anterior(es)</small>`:""}</td><td>${escapar(nombreContrato(d.contratoId))}</td><td>${escapar(fechaVisible(d.fechaVencimiento))}</td><td><span class="sheq-status ${e.key}">${escapar(e.texto)}</span></td><td>${d.archivoUrl?`<a href="${escapar(d.archivoUrl)}" target="_blank" rel="noopener">Ver archivo</a>`:"Sin archivo"}</td><td><button class="sheq-action" data-historial-documento="${d.id}">Historial</button> ${puedeEditar?`<button class="sheq-action" data-editar-documento="${d.id}">Revisar</button> <button class="sheq-action danger" data-eliminar-documento="${d.id}">Eliminar</button>`:""}</td></tr>`;}).join(""):'<tr><td colspan="7" class="sheq-empty">No se encontraron documentos.</td></tr>';
}

function bloqueMatriz(titulo, subtitulo, evaluacion) {
  const filas = evaluacion.detalles.length ? evaluacion.detalles.map(detalle => `<div class="sheq-matriz-requisito"><strong>${escapar(detalle.requisito)}</strong><span class="sheq-status ${detalle.key}">${escapar(detalle.texto)}</span><small>${detalle.documento ? `${escapar(detalle.documento.tipoDocumento)} · ${escapar(fechaVisible(detalle.documento.fechaVencimiento))}` : "Debe cargarse y aprobarse"}</small></div>`).join("") : '<div class="sheq-matriz-vacio">Este contrato todavía no tiene requisitos definidos.</div>';
  return `<article class="sheq-matriz-bloque"><header><div><h3>${escapar(titulo)}</h3><p>${escapar(subtitulo)}</p></div><span class="sheq-status ${evaluacion.key}">${escapar(evaluacion.texto)}</span></header><div class="sheq-matriz-lista">${filas}</div></article>`;
}

function abrirMatrizContrato(id) {
  const contrato = contratos.find(item => item.id === id);
  if (!contrato) return;
  $("matrizTitulo").textContent = `${contrato.cliente} · ${contrato.nombre}`;
  $("matrizSubtitulo").textContent = `${contrato.faena || "Sin faena específica"} · cumplimiento de personal y vehículos`;
  const bloquesPersonal = usuarios
    .filter(item => entidadCorrespondeContrato("persona", item, contrato))
    .map(item => bloqueMatriz(nombreUsuario(item), `${item.rol || "Sin cargo"} · ${nombreSucursal(item.sucursalId)}`, evaluarEntidadEnContrato({ tipo: "persona", entidadId: item.id, contrato, documentos })));
  const bloquesVehiculos = vehiculos
    .filter(item => entidadCorrespondeContrato("vehiculo", item, contrato) && (!item.contratoId || item.contratoId === contrato.id))
    .map(item => bloqueMatriz(item.patente, `${item.marca || ""} ${item.modelo || ""}`.trim() || "Vehículo", evaluarEntidadEnContrato({ tipo: "vehiculo", entidadId: item.id, contrato, documentos })));
  $("matrizContenido").innerHTML = [...bloquesPersonal, ...bloquesVehiculos].join("") || '<div class="sheq-matriz-vacio">No hay personal ni vehículos aplicables a esta faena.</div>';
  abrirModal("modalMatriz");
}

function abrirMatrizPersona(id) {
  const persona = usuarios.find(item => item.id === id);
  if (!persona) return;
  $("matrizTitulo").textContent = nombreUsuario(persona);
  $("matrizSubtitulo").textContent = "Acreditación independiente para cada contrato o faena aplicable";
  const bloques = evaluacionesEntidad("persona", id).map(evaluacion => bloqueMatriz(`${evaluacion.contrato.cliente} · ${evaluacion.contrato.nombre}`, evaluacion.contrato.faena || "Sin faena específica", evaluacion));
  $("matrizContenido").innerHTML = bloques.join("") || '<div class="sheq-matriz-vacio">No existen contratos activos aplicables a este trabajador.</div>';
  abrirModal("modalMatriz");
}

function abrirHistorialDocumento(id) {
  const item = documentos.find(documento => documento.id === id);
  if (!item) return;
  $("historialDocumentoTitulo").textContent = `${item.tipoDocumento} · ${nombreEntidad(item.entidadTipo, item.entidadId)}`;
  const actual = `<article class="sheq-historial-item"><div><strong>Versión actual</strong><small>${escapar(fechaHoraVisible(item.fechaActualizacion || item.fechaCreacion))} · ${escapar(nombreResponsable(item.actualizadoPor || item.creadoPor))}</small></div><p>${escapar(item.observaciones || "Sin observaciones")}</p><div class="sheq-historial-acciones">${item.archivoUrl ? `<a class="sheq-action" href="${escapar(item.archivoUrl)}" target="_blank" rel="noopener">Ver archivo</a>` : "Sin archivo"}</div></article>`;
  const historial = item.historial || [];
  const anteriores = historial.map((version, indice) => ({ version, indice })).reverse().map(({ version, indice }, posicion) => {
    const puedePurgar = puedeEditar && version.archivoRuta && version.archivoRuta !== item.archivoRuta && !version.archivoEliminado;
    return `<article class="sheq-historial-item"><div><strong>Versión anterior ${historial.length - posicion}</strong><small>${escapar(fechaHoraVisible(version.fechaModificacion))} · ${escapar(nombreResponsable(version.modificadoPor))}</small></div><p><strong>${escapar(version.motivo || "Modificación sin motivo registrado")}</strong><small>${escapar(version.tipoDocumento || "Documento")} · ${escapar(fechaVisible(version.fechaVencimiento))} · ${escapar(version.estado || "pendiente")}</small></p><div class="sheq-historial-acciones">${version.archivoUrl && !version.archivoEliminado ? `<a class="sheq-action" href="${escapar(version.archivoUrl)}" target="_blank" rel="noopener">Ver archivo</a>` : "Archivo eliminado"}${puedePurgar ? `<button class="sheq-action danger" data-purgar-version="${id}" data-version-indice="${indice}">Eliminar archivo</button>` : ""}</div></article>`;
  }).join("");
  $("historialDocumentoContenido").innerHTML = actual + (anteriores || '<div class="sheq-matriz-vacio">Este documento todavía no tiene modificaciones.</div>');
  abrirModal("modalHistorialDocumento");
}

async function eliminarArchivoHistorico(id, indice) {
  const item = documentos.find(documento => documento.id === id);
  const historial = [...(item?.historial || [])];
  const version = historial[indice];
  if (!item || !version?.archivoRuta || version.archivoRuta === item.archivoRuta) return;
  const ok = await window.OverTrackUI.confirmarAccion({ titulo:"Eliminar archivo histórico", mensaje:"Se eliminará permanentemente este archivo anterior. Los datos de auditoría se conservarán.", tipo:"advertencia", textoConfirmar:"Eliminar archivo", textoCancelar:"Cancelar", peligrosa:true });
  if (!ok) return;
  try { await deleteObject(ref(storage, version.archivoRuta)); } catch (error) { if (error.code !== "storage/object-not-found") throw error; }
  const fechaEliminacion = new Date().toISOString();
  historial.forEach(registro => {
    if (registro.archivoRuta === version.archivoRuta) {
      registro.archivoUrl = "";
      registro.archivoRuta = "";
      registro.archivoEliminado = true;
      registro.archivoEliminadoPor = usuario.uid;
      registro.fechaEliminacionArchivo = fechaEliminacion;
    }
  });
  await updateDoc(doc(db, "sheqDocumentos", id), { historial, actualizadoPor:usuario.uid, fechaActualizacion:serverTimestamp() });
  documentos = await obtenerColeccion("sheqDocumentos");
  renderTodo();
  abrirHistorialDocumento(id);
  await mensaje("Archivo eliminado", "El archivo histórico fue eliminado y la auditoría se conservó.", "exito");
}

function renderTodo(){prepararSelectores();renderPanel();renderPersonal();renderVehiculos();renderContratos();renderDocumentos();}
function abrirModal(id){$(id).hidden=false;document.body.style.overflow="hidden";} function cerrarModal(id){$(id).hidden=true;document.body.style.overflow="";}
function limpiarForm(id){$(id).reset();$(id).querySelectorAll('input[type="hidden"]').forEach(i=>i.value="");}

function abrirContrato(item=null){limpiarForm("formContrato");if(item){$("contratoId").value=item.id;$("contratoCliente").value=item.cliente||"";$("contratoNombre").value=item.nombre||"";$("contratoFaena").value=item.faena||"";$("contratoSucursal").value=item.sucursalId||"";$("contratoInicio").value=fechaISO(item.fechaInicio);$("contratoTermino").value=fechaISO(item.fechaTermino);$("contratoRequisitosPersonal").value=(item.requisitosPersonal||[]).join("\n");$("contratoRequisitosVehiculos").value=(item.requisitosVehiculos||[]).join("\n");const seleccionados=Array.isArray(item.personalIds)?item.personalIds:null;Array.from($("contratoPersonal").options).forEach(opcion=>{opcion.selected=seleccionados?seleccionados.includes(opcion.value):entidadCorrespondeContrato("persona",usuarios.find(u=>u.id===opcion.value),item);});}abrirModal("modalContrato");}
function abrirVehiculo(item=null){limpiarForm("formVehiculo");if(item){$("vehiculoId").value=item.id;$("vehiculoPatente").value=item.patente||"";$("vehiculoTipo").value=item.tipo||"Camioneta";$("vehiculoMarca").value=item.marca||"";$("vehiculoModelo").value=item.modelo||"";$("vehiculoAnio").value=item.anio||"";$("vehiculoPropietario").value=item.propietario||"";$("vehiculoSucursal").value=item.sucursalId||"";$("vehiculoContrato").value=item.contratoId||"";$("vehiculoEquipamiento").value=item.equipamiento||"";}abrirModal("modalVehiculo");}

function actualizarTipoDocumentoPersonalizado(limpiar=true){const personalizado=$("documentoTipo").value==="__otro__";$("documentoTipoOtroCampo").hidden=!personalizado;$("documentoTipoOtro").required=personalizado;if(!personalizado&&limpiar)$("documentoTipoOtro").value="";}
function valorTipoDocumento(){return $("documentoTipo").value==="__otro__"?$("documentoTipoOtro").value.trim():$("documentoTipo").value.trim();}
function cerrarMenuTipoDocumento(){$("documentoTipoMenu").hidden=true;$("documentoTipoBoton").setAttribute("aria-expanded","false");}
function actualizarVistaTipoDocumento(){const select=$("documentoTipo"),opcion=select.options[select.selectedIndex],texto=opcion?.textContent||"Seleccionar tipo documental";$("documentoTipoBoton").querySelector("span").textContent=texto;$("documentoTipoMenu").querySelectorAll("button").forEach(boton=>boton.classList.toggle("active",boton.dataset.value===select.value));}
function prepararSelectorTipoDocumento(){const select=$("documentoTipo"),menu=$("documentoTipoMenu"),boton=$("documentoTipoBoton");menu.innerHTML=Array.from(select.options).map(opcion=>`<button type="button" role="option" data-value="${escapar(opcion.value)}">${escapar(opcion.textContent)}</button>`).join("");boton.addEventListener("click",()=>{const abrir=menu.hidden;menu.hidden=!abrir;boton.setAttribute("aria-expanded",String(abrir));});menu.addEventListener("click",evento=>{const opcion=evento.target.closest("button[data-value]");if(!opcion)return;select.value=opcion.dataset.value;select.dispatchEvent(new Event("change"));cerrarMenuTipoDocumento();boton.focus();});document.addEventListener("click",evento=>{if(!evento.target.closest(".sheq-document-type-picker"))cerrarMenuTipoDocumento();});document.addEventListener("keydown",evento=>{if(evento.key==="Escape")cerrarMenuTipoDocumento();});actualizarVistaTipoDocumento();}
function abrirDocumento(item=null,preset={}){limpiarForm("formDocumento");$("documentoEntidadTipo").value=item?.entidadTipo||preset.tipo||"persona";actualizarEntidadesDocumento();$("documentoMotivoCampo").hidden=!item;$("documentoMotivo").required=Boolean(item);$("documentoArchivoActual").textContent="";$("documentoTipoOtroCampo").hidden=true;$("documentoTipoOtro").required=false;if(item){$("documentoId").value=item.id;$("documentoEntidadId").value=item.entidadId||"";const tipo=item.tipoDocumento||"";const tipoRegistrado=Array.from($("documentoTipo").options).some(opcion=>opcion.value===tipo);$("documentoTipo").value=tipoRegistrado?tipo:"__otro__";if(!tipoRegistrado)$("documentoTipoOtro").value=tipo;actualizarTipoDocumentoPersonalizado(false);$("documentoContrato").value=item.contratoId||"";$("documentoEmision").value=fechaISO(item.fechaEmision);$("documentoVencimiento").value=fechaISO(item.fechaVencimiento);$("documentoEstado").value=item.estado||"pendiente";$("documentoObservaciones").value=item.observaciones||"";$("documentoArchivoActual").textContent=item.archivoUrl?"Si no seleccionas otro archivo, se conservará el actual.":"Actualmente no existe un archivo adjunto.";}else if(preset.id){$("documentoEntidadId").value=preset.id;}actualizarVistaTipoDocumento();cerrarMenuTipoDocumento();abrirModal("modalDocumento");}

async function guardarContrato(e){e.preventDefault();const id=$("contratoId").value,datos={empresaId,cliente:$("contratoCliente").value.trim(),nombre:$("contratoNombre").value.trim(),faena:$("contratoFaena").value.trim(),sucursalId:$("contratoSucursal").value,fechaInicio:$("contratoInicio").value,fechaTermino:$("contratoTermino").value,personalIds:Array.from($("contratoPersonal").selectedOptions).map(opcion=>opcion.value),requisitosPersonal:listaLineas($("contratoRequisitosPersonal").value),requisitosVehiculos:listaLineas($("contratoRequisitosVehiculos").value),actualizadoPor:usuario.uid,fechaActualizacion:serverTimestamp()};if(id)await updateDoc(doc(db,"sheqContratos",id),datos);else await addDoc(collection(db,"sheqContratos"),{...datos,creadoPor:usuario.uid,fechaCreacion:serverTimestamp()});cerrarModal("modalContrato");await recargar("Contrato guardado");}
async function guardarVehiculo(e){e.preventDefault();const id=$("vehiculoId").value,datos={empresaId,patente:$("vehiculoPatente").value.trim().toUpperCase(),tipo:$("vehiculoTipo").value,marca:$("vehiculoMarca").value.trim(),modelo:$("vehiculoModelo").value.trim(),anio:Number($("vehiculoAnio").value)||null,propietario:$("vehiculoPropietario").value.trim(),sucursalId:$("vehiculoSucursal").value,contratoId:$("vehiculoContrato").value,equipamiento:$("vehiculoEquipamiento").value.trim(),actualizadoPor:usuario.uid,fechaActualizacion:serverTimestamp()};if(id)await updateDoc(doc(db,"sheqVehiculos",id),datos);else await addDoc(collection(db,"sheqVehiculos"),{...datos,creadoPor:usuario.uid,fechaCreacion:serverTimestamp()});cerrarModal("modalVehiculo");await recargar("Vehículo guardado");}
async function guardarDocumento(e){
  e.preventDefault();
  const id=$("documentoId").value,archivo=$("documentoArchivo").files[0],anterior=id?documentos.find(d=>d.id===id):null;
  const tipoDocumento=valorTipoDocumento();
  if(!tipoDocumento)throw new Error("Debes seleccionar o especificar el tipo documental.");
  const motivo=$("documentoMotivo").value.trim();
  if(anterior&&!motivo)throw new Error("Debes indicar el motivo de la modificación.");
  let archivoUrl=anterior?.archivoUrl||"",archivoRuta=anterior?.archivoRuta||"",archivoNuevoRuta="";
  if(archivo){
    if(archivo.size>20*1024*1024)throw new Error("El archivo supera el máximo de 20 MB.");
    const cuota=evaluarCuotaStorage({usadoBytes:empresa.storageUsadoBytes||0,maxStorageGB:empresa.maxStorageGB,nuevoBytes:archivo.size});
    const aviso=mensajeCuotaStorage(cuota);
    if(!cuota.permitido)throw new Error(aviso);
    if(aviso)await mensaje("Uso de almacenamiento",aviso,"advertencia");
    const seguro=archivo.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    archivoRuta=`empresas/${empresaId}/sheq/${$("documentoEntidadTipo").value}/${$("documentoEntidadId").value}/${Date.now()}_${seguro}`;
    archivoNuevoRuta=archivoRuta;
    const storageRef=ref(storage,archivoRuta);
    await uploadBytes(storageRef,archivo);
    archivoUrl=await getDownloadURL(storageRef);
  }
  const historial=anterior?[...(anterior.historial||[]),versionDocumento(anterior,motivo)]:[];
  const datos={empresaId,entidadTipo:$("documentoEntidadTipo").value,entidadId:$("documentoEntidadId").value,tipoDocumento,contratoId:$("documentoContrato").value,fechaEmision:$("documentoEmision").value,fechaVencimiento:$("documentoVencimiento").value,estado:$("documentoEstado").value,observaciones:$("documentoObservaciones").value.trim(),archivoUrl,archivoRuta,historial,actualizadoPor:usuario.uid,fechaActualizacion:serverTimestamp()};
  try{
    if(id)await updateDoc(doc(db,"sheqDocumentos",id),datos);else await addDoc(collection(db,"sheqDocumentos"),{...datos,creadoPor:usuario.uid,fechaCreacion:serverTimestamp()});
  }catch(error){
    if(archivoNuevoRuta){try{await deleteObject(ref(storage,archivoNuevoRuta));}catch(limpiezaError){console.error("No se pudo limpiar la carga fallida",limpiezaError);}}
    throw error;
  }
  cerrarModal("modalDocumento");
  await recargar(anterior?"Documento actualizado y versión anterior archivada":"Documento guardado");
}

async function recargar(texto){contratos=await obtenerColeccion("sheqContratos");vehiculos=await obtenerColeccion("sheqVehiculos");documentos=await obtenerColeccion("sheqDocumentos");renderTodo();await mensaje("Cambios guardados",texto,"exito");}
async function eliminar(nombre,id,texto){const ok=await window.OverTrackUI.confirmarAccion({titulo:"Confirmar eliminación",mensaje:texto,tipo:"advertencia",textoConfirmar:"Eliminar",textoCancelar:"Cancelar",peligrosa:true});if(!ok)return;await deleteDoc(doc(db,nombre,id));await recargar("El registro fue eliminado.");}

async function eliminarDocumentoCompleto(id){
  const item=documentos.find(documento=>documento.id===id);
  if(!item)return;
  const ok=await window.OverTrackUI.confirmarAccion({titulo:"Eliminar documento",mensaje:"Se eliminarán permanentemente el registro, el archivo actual y todos sus archivos históricos. Esta acción no se puede deshacer.",tipo:"advertencia",textoConfirmar:"Eliminar todo",textoCancelar:"Cancelar",peligrosa:true});
  if(!ok)return;
  const rutas=[item.archivoRuta,...(item.historial||[]).map(version=>version.archivoRuta)].filter(Boolean);
  for(const ruta of new Set(rutas)){
    try{await deleteObject(ref(storage,ruta));}catch(error){if(error.code!=="storage/object-not-found")throw error;}
  }
  await deleteDoc(doc(db,"sheqDocumentos",id));
  await recargar("El documento y todos sus archivos fueron eliminados.");
}

function exportarCSV(){const filas=[["Entidad","Tipo entidad","Documento","Contrato/faena","Emisión","Vencimiento","Estado","Observaciones"],...documentos.map(d=>[nombreEntidad(d.entidadTipo,d.entidadId),d.entidadTipo,d.tipoDocumento,nombreContrato(d.contratoId),fechaISO(d.fechaEmision),fechaISO(d.fechaVencimiento),estadoDocumento(d).texto,d.observaciones||""])];const csv=filas.map(f=>f.map(v=>`"${String(v).replaceAll('"','""')}"`).join(";")).join("\r\n");const blob=new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`Acreditaciones_SHEQ_${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);}

function enlazarEventos(){document.querySelectorAll(".sheq-tabs button").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".sheq-tabs button,.sheq-vista").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelector(`[data-panel="${b.dataset.vista}"]`).classList.add("active");}));document.querySelectorAll("[data-cerrar-modal]").forEach(b=>b.addEventListener("click",()=>cerrarModal(b.dataset.cerrarModal)));$("documentoEntidadTipo").addEventListener("change",actualizarEntidadesDocumento);$("buscarPersonalSheq").addEventListener("input",renderPersonal);$("buscarDocumentoSheq").addEventListener("input",renderDocumentos);$("filtroEstadoDocumento").addEventListener("change",renderDocumentos);$("btnNuevoContrato").addEventListener("click",()=>abrirContrato());$("btnNuevoVehiculo").addEventListener("click",()=>abrirVehiculo());$("btnNuevoDocumento").addEventListener("click",()=>abrirDocumento());$("btnExportarSheq").addEventListener("click",exportarCSV);$("formContrato").addEventListener("submit",e=>guardarContrato(e).catch(error=>mensaje("No se pudo guardar",error.message,"error")));$("formVehiculo").addEventListener("submit",e=>guardarVehiculo(e).catch(error=>mensaje("No se pudo guardar",error.message,"error")));$("formDocumento").addEventListener("submit",e=>guardarDocumento(e).catch(error=>mensaje("No se pudo guardar",error.message,"error")));document.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.editarContrato)abrirContrato(contratos.find(x=>x.id===b.dataset.editarContrato));if(b.dataset.eliminarContrato)eliminar("sheqContratos",b.dataset.eliminarContrato,"Se eliminará el contrato o faena. Los documentos conservarán su historial.");if(b.dataset.editarVehiculo)abrirVehiculo(vehiculos.find(x=>x.id===b.dataset.editarVehiculo));if(b.dataset.documentoPersona)abrirDocumento(null,{tipo:"persona",id:b.dataset.documentoPersona});if(b.dataset.documentoVehiculo)abrirDocumento(null,{tipo:"vehiculo",id:b.dataset.documentoVehiculo});if(b.dataset.matrizPersona)abrirMatrizPersona(b.dataset.matrizPersona);if(b.dataset.matrizContrato)abrirMatrizContrato(b.dataset.matrizContrato);if(b.dataset.historialDocumento)abrirHistorialDocumento(b.dataset.historialDocumento);if(b.dataset.purgarVersion)eliminarArchivoHistorico(b.dataset.purgarVersion,Number(b.dataset.versionIndice)).catch(error=>mensaje("No se pudo eliminar",error.message,"error"));if(b.dataset.editarDocumento)abrirDocumento(documentos.find(x=>x.id===b.dataset.editarDocumento));if(b.dataset.eliminarDocumento)eliminarDocumentoCompleto(b.dataset.eliminarDocumento).catch(error=>mensaje("No se pudo eliminar",error.message,"error"));});[$("btnSalirSheq"),$("btnSalirSheqTop")].forEach(b=>b.addEventListener("click",cerrarSesion));const toggle=document.querySelector(".mobile-menu-toggle"),back=document.querySelector(".mobile-menu-backdrop"),side=$("sheqSidebar");const cerrar=()=>{side.classList.remove("open");back.classList.remove("active");toggle.setAttribute("aria-expanded","false")};toggle.addEventListener("click",()=>{side.classList.toggle("open");back.classList.toggle("active");toggle.setAttribute("aria-expanded",String(side.classList.contains("open")))});back.addEventListener("click",cerrar);}

async function iniciar(){try{if(!await cargarBase())return;$("usuarioNombre").textContent=usuario.nombre||usuario.email||"Usuario";$("usuarioRol").textContent=usuario.rol;$("menuDashboardSheq").style.display=usuario.rol==="sheq"?"none":"";$("menuPanelEmpresaSheq").style.display=["super_admin","admin_empresa","admin_sucursal"].includes(usuario.rol)?"":"none";$("menuPanelEmpresaSheq").onclick=()=>location.href=`empresa-admin.html?id=${empresaId}`;$("menuProgramacionSheq").style.display=moduloActivo(empresa,"programacion")?"":"none";if(!puedeEditar)[$("btnNuevoContrato"),$("btnNuevoVehiculo"),$("btnNuevoDocumento")].forEach(b=>b.hidden=true);prepararSelectorTipoDocumento();$("documentoTipo").addEventListener("change",()=>{actualizarTipoDocumentoPersonalizado();actualizarVistaTipoDocumento();});enlazarEventos();renderTodo();}catch(error){console.error(error);await mensaje("No se pudo abrir SHEQ",error.message||"Intenta nuevamente.","error");}}
iniciar();
