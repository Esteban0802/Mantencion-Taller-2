import { db, storage } from "./firebase-config.js";
import { protegerPagina, cerrarSesion } from "./session.js?v=20261004-1";
import { moduloActivo } from "./modulos.js";
import { evaluarCuotaStorage, mensajeCuotaStorage } from "./storage-quota.js";
import { estadoDocumentoAcreditacion, evaluarEntidadEnContrato, peorEvaluacion } from "./sheq-acreditacion.js?v=20261007-1";
import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

const usuario = protegerPagina(["super_admin", "admin_empresa", "admin_sucursal", "jefe_taller", "planificador", "sheq"]);
if (!usuario) throw new Error("Acceso no autorizado");

const $ = id => document.getElementById(id);
const escapar = valor => String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const rolesEdicion = ["super_admin", "sheq"];
const puedeEditar = rolesEdicion.includes(usuario.rol);
let empresa = null, empresaId = "", sucursales = [], usuarios = [], contratos = [], vehiculos = [], documentos = [];

const catalogoDocumentosPersonal = {
  "Identificación y relación laboral": ["Cédula de identidad", "Contrato de trabajo", "Anexo de contrato", "Descripción o perfil de cargo", "Certificado de afiliación AFP", "Certificado de afiliación Fonasa o Isapre", "Comprobante de cotizaciones previsionales"],
  "Seguridad y prevención de riesgos": ["Inducción general de seguridad", "Inducción específica de la empresa", "Inducción específica de la faena", "Registro de información de riesgos laborales", "Capacitación sobre riesgos del cargo", "Registro de entrega de elementos de protección personal", "Recepción del Reglamento Interno de Orden, Higiene y Seguridad", "Procedimiento de trabajo seguro", "Capacitación de emergencias", "Capacitación de uso de extintores", "Registro de difusión de protocolos de seguridad"],
  "Salud ocupacional": ["Examen preocupacional", "Examen ocupacional periódico", "Certificado de aptitud para el cargo", "Examen de altura física", "Examen de altura geográfica", "Examen psicosensotécnico", "Audiometría", "Espirometría", "Evaluación musculoesquelética", "Examen para exposición a sílice", "Examen para exposición a ruido", "Evaluación de vigilancia ocupacional", "Test de alcohol y drogas"],
  "Licencias y competencias": ["Licencia de conducir", "Hoja de vida del conductor", "Certificado de operador de maquinaria", "Licencia SEC", "Certificación de soldador", "Curso de trabajo en altura", "Curso de espacios confinados", "Curso de bloqueo y etiquetado", "Curso de izaje y rigger", "Certificación de operador de grúa", "Certificación de andamios", "Manejo de sustancias peligrosas", "Primeros auxilios", "Manejo defensivo", "Certificación técnica del fabricante"],
  "Faena o cliente": ["Credencial de acceso a faena", "Autorización de ingreso", "Curso interno del cliente", "Acreditación de competencias del cliente", "Recepción del reglamento del cliente", "Autorización para conducir dentro de faena", "Permiso para trabajos críticos", "Certificado de antecedentes", "Título profesional o técnico", "Certificado de experiencia"]
};

const catalogoDocumentosVehiculos = {
  "Documentación legal": ["Certificado de inscripción o padrón", "Revisión técnica", "Certificado de emisiones contaminantes", "Permiso de circulación", "SOAP", "Seguro adicional", "Certificado de homologación individual", "Autorización notarial del propietario"],
  "Identificación y características": ["Ficha técnica del vehículo", "Fotografías del vehículo", "Número de chasis y motor", "Certificado de antigüedad", "Registro de kilometraje"],
  "Seguridad y equipamiento": ["Checklist de ingreso a faena", "Inspección interna del vehículo", "Certificado o inspección de extintor", "Registro de botiquín", "Registro de kit de emergencia", "Certificado de cinturones de seguridad", "Certificado de jaula antivuelco", "Certificado de láminas de seguridad", "Certificado de baliza y pértiga", "Certificado de GPS", "Certificado de cuñas y conos", "Inspección de neumáticos"],
  "Mantención y condición técnica": ["Plan de mantenimiento preventivo", "Última mantención preventiva", "Registro de reparaciones", "Certificado de frenos", "Certificado de dirección", "Certificado de suspensión", "Certificado de sistema eléctrico", "Control de fugas y fluidos", "Certificado de calibración de equipos instalados"],
  "Faena o cliente": ["Acreditación vehicular del cliente", "Autorización de ingreso a faena", "Permiso de circulación interna", "Inspección del mandante", "Certificación para transporte de sustancias peligrosas", "Resolución sanitaria de transporte", "Certificado de desinfección", "Autorización para transporte de personal", "Certificado de operador asociado"]
};

function mensaje(titulo, texto, tipo = "info") { return window.OverTrackUI.mostrarMensaje({ titulo, mensaje: texto, tipo }); }
function fechaISO(valor) { if (!valor) return ""; if (typeof valor === "string") return valor.slice(0, 10); if (valor.toDate) return valor.toDate().toISOString().slice(0, 10); return ""; }
function fechaVisible(valor) { const iso = fechaISO(valor); return iso ? new Intl.DateTimeFormat("es-CL").format(new Date(`${iso}T12:00:00`)) : "Sin vencimiento"; }
function fechaHoraVisible(valor) { if (!valor) return "Sin fecha"; const fecha = typeof valor === "string" ? new Date(valor) : valor.toDate ? valor.toDate() : new Date(valor); return Number.isNaN(fecha.valueOf()) ? "Sin fecha" : new Intl.DateTimeFormat("es-CL", { dateStyle:"short", timeStyle:"short" }).format(fecha); }
function diasHasta(valor) { const iso = fechaISO(valor); if (!iso) return null; const hoy = new Date(); hoy.setHours(0,0,0,0); return Math.ceil((new Date(`${iso}T00:00:00`) - hoy) / 86400000); }
function listaLineas(valor) { return String(valor || "").split("\n").map(v => v.trim()).filter(Boolean); }
function nombreSucursal(id) { return sucursales.find(s => s.id === id)?.nombre || "Todas / Sin sucursal"; }
function ubicacionContrato(contrato) { return contrato?.ubicacion || contrato?.faena || contrato?.nombre || "Sin ubicación"; }
function nombreContrato(id) { const c = contratos.find(item => item.id === id); return c ? `${c.cliente} · ${ubicacionContrato(c)}` : "Aplicación general"; }
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
    estado: item.estado || "aprobado",
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
  if (!docs.length) return { key: "vencido", texto: "No acreditado" };
  const estados = docs.map(estadoDocumento);
  if (estados.some(e => e.key === "vencido")) return { key: "vencido", texto: "No habilitado" };
  if (estados.some(e => ["aviso", "critico", "proximo"].includes(e.key))) return { key: "proximo", texto: "Con observaciones" };
  return { key: "vigente", texto: "Habilitado" };
}

function contratoActivo(contrato) {
  return !contrato.fechaTermino || (diasHasta(contrato.fechaTermino) ?? 0) >= 0;
}

function entidadCorrespondeContrato(tipo, entidad, contrato) {
  const ids = tipo === "vehiculo" ? contrato.vehiculoIds : contrato.personalIds;
  return Array.isArray(ids) && ids.includes(entidad?.id);
}

function evaluacionesEntidad(tipo, id) {
  const entidad = tipo === "vehiculo" ? vehiculos.find(item => item.id === id) : usuarios.find(item => item.id === id);
  return contratos
    .filter(contrato => contratoActivo(contrato) && entidadCorrespondeContrato(tipo, entidad, contrato))
    .map(contrato => ({ contrato, ...evaluarEntidadEnContrato({ tipo, entidadId: id, contrato, documentos }) }));
}

function estadoEntidad(tipo, id) {
  const evaluaciones = evaluacionesEntidad(tipo, id).filter(item => item.key !== "sin-requisitos");
  return peorEvaluacion(evaluaciones) || { key: "pendiente", texto: "Sin asignación" };
}

function resumenFaenas(tipo, id) {
  const evaluaciones = evaluacionesEntidad(tipo, id).filter(item => item.key !== "sin-requisitos");
  return {
    total: evaluaciones.length,
    habilitadas: evaluaciones.filter(item => item.key === "vigente").length,
    observadas: evaluaciones.filter(item => item.key === "proximo").length,
    bloqueadas: evaluaciones.filter(item => item.key === "vencido").length
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
  const prioridad = { faltante: 7, vencido: 7, critico: 4, proximo: 3, aviso: 2 };
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
  opciones($("vehiculoSucursal"), opsSuc, "Sin sucursal");
  actualizarEntidadesDocumento();
}

function actualizarEntidadesDocumento() {
  const select = $("documentoEntidadId");
  const personas = usuarios.map(u => `<option value="${escapar(u.id)}" data-tipo="persona">${escapar(`${nombreUsuario(u)} · ${u.rol || "Sin cargo"}`)}</option>`).join("");
  const unidades = vehiculos.map(v => `<option value="${escapar(v.id)}" data-tipo="vehiculo">${escapar(`${v.patente} · ${v.marca || ""} ${v.modelo || ""}`.trim())}</option>`).join("");
  select.innerHTML = `<option value="">Seleccionar trabajador o vehículo</option><optgroup label="Trabajadores">${personas}</optgroup><optgroup label="Vehículos">${unidades}</optgroup>`;
}

function renderPanel() {
  const personalEstados = usuarios.map(u => estadoEntidad("persona", u.id));
  const vehiculosEstados = vehiculos.map(v => estadoEntidad("vehiculo", v.id));
  const estadosDoc = documentos.map(d => ({ doc:d, estado:estadoDocumento(d) }));
  const vencidos = estadosDoc.filter(x => x.estado.key === "vencido");
  const proximos = estadosDoc.filter(x => ["aviso", "proximo", "critico"].includes(x.estado.key));
  const observaciones = estadosDoc.filter(x => ["aviso", "proximo", "critico", "vencido"].includes(x.estado.key));
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
      const grave = ["faltante", "vencido"].includes(item.detalle.key);
      return `<div class="sheq-alert ${grave ? "sheq-alarm-missing" : "proximo"}"><i></i><div><strong>${escapar(item.detalle.requisito)}</strong><small>${escapar(nombreUsuario(item.entidad))} · ${escapar(ubicacionContrato(item.contrato))} · ${escapar(item.detalle.texto)}</small></div><time>${item.detalle.documento ? escapar(fechaVisible(item.detalle.documento.fechaVencimiento)) : "Faltante"}</time></div>`;
    }
    return `<div class="sheq-alert ${item.estado.key === "vencido" ? "" : item.estado.key === "aviso" ? "aviso" : "proximo"}"><i></i><div><strong>${escapar(item.doc.tipoDocumento)}</strong><small>${escapar(nombreEntidad(item.doc.entidadTipo,item.doc.entidadId))} · ${escapar(item.estado.texto)}</small></div><time>${escapar(fechaVisible(item.doc.fechaVencimiento))}</time></div>`;
  }).join("") : '<div class="sheq-empty">No existen vencimientos ni requisitos faltantes.</div>';
  const evaluados = personalEstados.length + vehiculosEstados.length, habilitados = [...personalEstados,...vehiculosEstados].filter(e => e.key === "vigente").length;
  const porcentaje = evaluados ? Math.round(habilitados * 100 / evaluados) : 0;
  $("porcentajeCumplimiento").textContent = `${porcentaje}%`; $("barraCumplimiento").style.width = `${porcentaje}%`;
  $("resumenCumplimiento").innerHTML = `<div><span>Personal evaluado</span><strong>${personalEstados.length}</strong></div><div><span>Vehículos evaluados</span><strong>${vehiculosEstados.length}</strong></div><div><span>Contratos activos</span><strong>${contratos.filter(c => !c.fechaTermino || (diasHasta(c.fechaTermino) ?? 0) >= 0).length}</strong></div><div><span>Documentos registrados</span><strong>${documentos.length}</strong></div>`;
}

function renderPersonal() {
  const buscar = $("buscarPersonalSheq").value.trim().toLowerCase();
  const lista = usuarios.filter(u => [nombreUsuario(u),u.rut,u.rol,nombreSucursal(u.sucursalId)].join(" ").toLowerCase().includes(buscar));
  $("tablaPersonalSheq").innerHTML = lista.length ? lista.map(u => { const docs=documentos.filter(d=>d.entidadTipo==="persona"&&d.entidadId===u.id), e=estadoEntidad("persona",u.id), f=resumenFaenas("persona",u.id); return `<tr><td><strong>${escapar(nombreUsuario(u))}</strong><small>${escapar(u.email || "")}</small></td><td>${escapar(u.rut || "Sin RUT")}</td><td>${escapar(u.rol || "Sin cargo")}</td><td>${escapar(nombreSucursal(u.sucursalId))}</td><td>${docs.length}</td><td><strong>${f.habilitadas}/${f.total}</strong><small class="sheq-faena-resumen">${f.bloqueadas} no acreditada(s)</small></td><td><span class="sheq-status ${e.key}">${e.texto}</span></td><td><div class="sheq-row-actions"><button class="sheq-action" data-matriz-persona="${u.id}">Ver faenas</button>${puedeEditar?`<button class="sheq-action" data-documento-persona="${u.id}">Agregar documento</button><button class="sheq-action" data-ver-documentos-persona="${u.id}">Ver documentos</button>`:""}</div></td></tr>`; }).join("") : '<tr><td colspan="8" class="sheq-empty">No se encontraron trabajadores.</td></tr>';
}

function renderVehiculos() {
  $("tablaVehiculosSheq").innerHTML = vehiculos.length ? vehiculos.map(v => { const docs=documentos.filter(d=>d.entidadTipo==="vehiculo"&&d.entidadId===v.id),e=estadoEntidad("vehiculo",v.id),asignados=contratos.filter(c=>entidadCorrespondeContrato("vehiculo",v,c)).map(c=>nombreContrato(c.id)); return `<tr><td><strong>${escapar(v.patente)}</strong><small>${escapar(v.tipo || "")}</small></td><td>${escapar(`${v.marca||""} ${v.modelo||""}`.trim() || "Sin detalle")}</td><td>${escapar(nombreSucursal(v.sucursalId))}</td><td>${escapar(asignados.join(", ") || "Sin asignación")}</td><td>${docs.length}</td><td><span class="sheq-status ${e.key}">${e.texto}</span></td><td>${puedeEditar?`<div class="sheq-row-actions"><button class="sheq-action" data-editar-vehiculo="${v.id}">Editar</button><button class="sheq-action" data-documento-vehiculo="${v.id}">Agregar documento</button><button class="sheq-action" data-ver-documentos-vehiculo="${v.id}">Ver documentos</button></div>`:"Consulta"}</td></tr>`; }).join("") : '<tr><td colspan="7" class="sheq-empty">Aún no se registran vehículos.</td></tr>';
}

function renderContratos() {
  $("listaContratosSheq").innerHTML = contratos.length ? contratos.map(c => {
    const rp = c.requisitosPersonal || [], rv = c.requisitosVehiculos || [];
    const personas = usuarios.filter(u => entidadCorrespondeContrato("persona", u, c)).map(u => evaluarEntidadEnContrato({tipo:"persona", entidadId:u.id, contrato:c, documentos}));
    const unidades = vehiculos.filter(v => entidadCorrespondeContrato("vehiculo", v, c)).map(v => evaluarEntidadEnContrato({tipo:"vehiculo", entidadId:v.id, contrato:c, documentos}));
    const evaluaciones = [...personas, ...unidades].filter(e => e.key !== "sin-requisitos");
    const ok = evaluaciones.filter(e => e.key === "vigente").length;
    const obs = evaluaciones.filter(e => e.key === "proximo").length;
    const no = evaluaciones.filter(e => e.key === "vencido").length;
    const finalizado = (diasHasta(c.fechaTermino) ?? 1) < 0;
    return `<article class="sheq-contract"><header><div><h4>${escapar(c.cliente)} · ${escapar(ubicacionContrato(c))}</h4></div><span class="sheq-status ${finalizado ? "vencido" : "vigente"}">${finalizado ? "Finalizado" : "Activo"}</span></header><div class="sheq-contract-dates"><span>Inicio: ${escapar(fechaVisible(c.fechaInicio))}</span><span>Término: ${escapar(fechaVisible(c.fechaTermino))}</span></div><div class="sheq-requirements"><div><strong>Personal</strong><small>${rp.length} requisito(s) · ${(c.personalIds || []).length} asignado(s)</small></div><div><strong>Vehículos</strong><small>${rv.length} requisito(s) · ${(c.vehiculoIds || []).length} asignado(s)</small></div></div><div class="sheq-contract-compliance"><div><strong>${ok}</strong><small>Acreditados</small></div><div><strong>${obs}</strong><small>Con observaciones</small></div><div><strong>${no}</strong><small>No acreditados</small></div></div><div class="sheq-contract-actions"><button class="sheq-action" data-matriz-contrato="${c.id}">Ver matriz</button>${puedeEditar ? `<button class="sheq-action" data-asignar-contrato="${c.id}">Asignar</button><button class="sheq-action" data-editar-contrato="${c.id}">Editar</button><button class="sheq-action danger" data-eliminar-contrato="${c.id}">Eliminar</button>` : ""}</div></article>`;
  }).join("") : '<div class="sheq-empty">Crea el primer contrato o faena para comenzar.</div>';
}

function renderDocumentos() {
  const buscar=$("buscarDocumentoSheq").value.trim().toLowerCase(), filtro=$("filtroEstadoDocumento").value;
  const lista=documentos.filter(d=>{const e=estadoDocumento(d),cumpleFiltro=!filtro||(filtro==="aviso"?["aviso","proximo","critico"].includes(e.key):e.key===filtro);return (!buscar||[d.tipoDocumento,nombreEntidad(d.entidadTipo,d.entidadId),nombreContrato(d.contratoId)].join(" ").toLowerCase().includes(buscar))&&cumpleFiltro;});
  $("tablaDocumentosSheq").innerHTML=lista.length?lista.map(d=>{const e=estadoDocumento(d),versiones=(d.historial||[]).length;return `<tr><td><strong>${escapar(nombreEntidad(d.entidadTipo,d.entidadId))}</strong><small>${d.entidadTipo==="vehiculo"?"Vehículo":"Trabajador"}</small></td><td>${escapar(d.tipoDocumento)}${versiones?`<small>${versiones} versión(es) anterior(es)</small>`:""}</td><td>${escapar(nombreContrato(d.contratoId))}</td><td>${escapar(fechaVisible(d.fechaVencimiento))}</td><td><span class="sheq-status ${e.key}">${escapar(e.texto)}</span></td><td>${d.archivoUrl?`<a href="${escapar(d.archivoUrl)}" target="_blank" rel="noopener">Ver archivo</a>`:"Sin archivo"}</td><td><button class="sheq-action" data-historial-documento="${d.id}">Historial</button> ${puedeEditar?`<button class="sheq-action" data-editar-documento="${d.id}">Revisar</button> <button class="sheq-action danger" data-eliminar-documento="${d.id}">Eliminar</button>`:""}</td></tr>`;}).join(""):'<tr><td colspan="7" class="sheq-empty">No se encontraron documentos.</td></tr>';
}

function abrirListaDocumentos(tipo, id) {
  const lista = documentos.filter(item => item.entidadTipo === tipo && item.entidadId === id);
  $("listaDocumentosTitulo").textContent = `Documentos de ${nombreEntidad(tipo, id)}`;
  $("listaDocumentosSubtitulo").textContent = `${lista.length} documento(s) registrado(s)`;
  $("listaDocumentosEntidad").innerHTML = lista.length ? lista.map(item => {
    const estado = estadoDocumento(item);
    return `<article class="sheq-documento-entidad-item"><div class="sheq-documento-entidad-info"><strong>${escapar(item.tipoDocumento || "Documento sin nombre")}</strong><small>Inicio: ${escapar(fechaVisible(item.fechaEmision))} · Vencimiento: ${escapar(fechaVisible(item.fechaVencimiento))}</small><span class="sheq-status ${estado.key}">${escapar(estado.texto)}</span></div><div class="sheq-documento-entidad-acciones">${item.archivoUrl ? `<a class="sheq-action" href="${escapar(item.archivoUrl)}" target="_blank" rel="noopener">Ver archivo</a>` : '<span class="sheq-sin-archivo">Sin archivo</span>'}${puedeEditar ? `<button class="sheq-action" data-editar-documento="${item.id}" data-desde-lista-documentos>Modificar</button><button class="sheq-action danger" data-eliminar-documento="${item.id}" data-desde-lista-documentos>Borrar</button>` : ""}</div></article>`;
  }).join("") : '<div class="sheq-empty">Todavía no se han agregado documentos.</div>';
  abrirModal("modalListaDocumentos");
}

document.addEventListener("click", evento => {
  const boton = evento.target.closest("button");
  if (!boton) return;
  if (boton.dataset.verDocumentosPersona) abrirListaDocumentos("persona", boton.dataset.verDocumentosPersona);
  if (boton.dataset.verDocumentosVehiculo) abrirListaDocumentos("vehiculo", boton.dataset.verDocumentosVehiculo);
  if (boton.hasAttribute("data-desde-lista-documentos")) cerrarModal("modalListaDocumentos");
});

function bloqueMatriz(titulo, subtitulo, evaluacion) {
  const filas = evaluacion.detalles.length ? evaluacion.detalles.map(detalle => `<div class="sheq-matriz-requisito"><strong>${escapar(detalle.requisito)}</strong><span class="sheq-status ${detalle.key}">${escapar(detalle.texto)}</span><small>${detalle.documento ? `${escapar(detalle.documento.tipoDocumento)} · ${escapar(fechaVisible(detalle.documento.fechaVencimiento))}` : "Debe cargarse y aprobarse"}</small></div>`).join("") : '<div class="sheq-matriz-vacio">Este contrato todavía no tiene requisitos definidos.</div>';
  return `<article class="sheq-matriz-bloque"><header><div><h3>${escapar(titulo)}</h3><p>${escapar(subtitulo)}</p></div><span class="sheq-status ${evaluacion.key}">${escapar(evaluacion.texto)}</span></header><div class="sheq-matriz-lista">${filas}</div></article>`;
}

function abrirMatrizContrato(id) {
  const contrato = contratos.find(item => item.id === id);
  if (!contrato) return;
  $("matrizTitulo").textContent = `${contrato.cliente} · ${ubicacionContrato(contrato)}`;
  $("matrizSubtitulo").textContent = "Cumplimiento de personal y vehículos";
  const bloquesPersonal = usuarios
    .filter(item => entidadCorrespondeContrato("persona", item, contrato))
    .map(item => bloqueMatriz(nombreUsuario(item), `${item.rol || "Sin cargo"} · ${nombreSucursal(item.sucursalId)}`, evaluarEntidadEnContrato({ tipo: "persona", entidadId: item.id, contrato, documentos })));
  const bloquesVehiculos = vehiculos
    .filter(item => entidadCorrespondeContrato("vehiculo", item, contrato))
    .map(item => bloqueMatriz(item.patente, `${item.marca || ""} ${item.modelo || ""}`.trim() || "Vehículo", evaluarEntidadEnContrato({ tipo: "vehiculo", entidadId: item.id, contrato, documentos })));
  $("matrizContenido").innerHTML = [...bloquesPersonal, ...bloquesVehiculos].join("") || '<div class="sheq-matriz-vacio">No hay personal ni vehículos aplicables a esta faena.</div>';
  abrirModal("modalMatriz");
}

function abrirMatrizPersona(id) {
  const persona = usuarios.find(item => item.id === id);
  if (!persona) return;
  $("matrizTitulo").textContent = nombreUsuario(persona);
  $("matrizSubtitulo").textContent = "Acreditación independiente para cada contrato o faena aplicable";
  const bloques = evaluacionesEntidad("persona", id).map(evaluacion => bloqueMatriz(`${evaluacion.contrato.cliente} · ${ubicacionContrato(evaluacion.contrato)}`, "Requisitos de la faena", evaluacion));
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
    return `<article class="sheq-historial-item"><div><strong>Versión anterior ${historial.length - posicion}</strong><small>${escapar(fechaHoraVisible(version.fechaModificacion))} · ${escapar(nombreResponsable(version.modificadoPor))}</small></div><p><strong>${escapar(version.motivo || "Modificación sin motivo registrado")}</strong><small>${escapar(version.tipoDocumento || "Documento")} · ${escapar(fechaVisible(version.fechaVencimiento))}</small></p><div class="sheq-historial-acciones">${version.archivoUrl && !version.archivoEliminado ? `<a class="sheq-action" href="${escapar(version.archivoUrl)}" target="_blank" rel="noopener">Ver archivo</a>` : "Archivo eliminado"}${puedePurgar ? `<button class="sheq-action danger" data-purgar-version="${id}" data-version-indice="${indice}">Eliminar archivo</button>` : ""}</div></article>`;
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
function abrirModal(id){$(id).hidden=false;document.body.style.overflow="hidden";} function cerrarModal(id){$(id).hidden=true;document.body.style.overflow=document.querySelector(".sheq-modal:not([hidden])")?"hidden":"";}
function limpiarForm(id){$(id).reset();$(id).querySelectorAll('input[type="hidden"]').forEach(i=>i.value="");}

function renderCatalogoRequisitos(tipo, seleccionados = []) {
  const catalogo = tipo === "personal" ? catalogoDocumentosPersonal : catalogoDocumentosVehiculos;
  const contenedor = $(tipo === "personal" ? "listaRequisitosPersonal" : "listaRequisitosVehiculos");
  const seleccion = new Set(seleccionados);
  const catalogados = new Set(Object.values(catalogo).flat());
  const adicionales = seleccionados.filter(item => !catalogados.has(item));
  const grupos = adicionales.length ? [...Object.entries(catalogo), ["Documentos anteriores o personalizados", adicionales]] : Object.entries(catalogo);
  contenedor.innerHTML = grupos.map(([grupo, items]) => `<section class="sheq-requisitos-grupo"><h4>${escapar(grupo)}</h4>${items.map(item => `<label><input type="checkbox" value="${escapar(item)}" ${seleccion.has(item) ? "checked" : ""}><span>${escapar(item)}</span></label>`).join("")}</section>`).join("");
  actualizarResumenRequisitos(tipo);
}

function requisitosSeleccionados(tipo) {
  const contenedor = $(tipo === "personal" ? "listaRequisitosPersonal" : "listaRequisitosVehiculos");
  return Array.from(contenedor.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.value);
}

function actualizarResumenRequisitos(tipo) {
  const seleccionados = requisitosSeleccionados(tipo);
  const boton = $(tipo === "personal" ? "requisitosPersonalBoton" : "requisitosVehiculosBoton");
  boton.querySelector("span").textContent = seleccionados.length ? `${seleccionados.length} documento(s) seleccionado(s)` : "Seleccionar documentos";
  boton.classList.toggle("con-seleccion", seleccionados.length > 0);
}

function cerrarSelectoresRequisitos(excepto = "") {
  ["personal", "vehiculos"].forEach(tipo => {
    if (tipo === excepto) return;
    const menu = $(tipo === "personal" ? "requisitosPersonalMenu" : "requisitosVehiculosMenu");
    const boton = $(tipo === "personal" ? "requisitosPersonalBoton" : "requisitosVehiculosBoton");
    menu.hidden = true;
    boton.setAttribute("aria-expanded", "false");
  });
}

document.addEventListener("click", evento => {
  const trigger = evento.target.closest(".sheq-requisitos-trigger");
  if (trigger) {
    const tipo = trigger.id === "requisitosPersonalBoton" ? "personal" : "vehiculos";
    const menu = $(tipo === "personal" ? "requisitosPersonalMenu" : "requisitosVehiculosMenu");
    const abrir = menu.hidden;
    cerrarSelectoresRequisitos(tipo);
    menu.hidden = !abrir;
    trigger.setAttribute("aria-expanded", String(abrir));
    return;
  }
  const limpiar = evento.target.closest("[data-limpiar-requisitos]");
  if (limpiar) {
    const tipo = limpiar.dataset.limpiarRequisitos;
    const contenedor = $(tipo === "personal" ? "listaRequisitosPersonal" : "listaRequisitosVehiculos");
    contenedor.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = false; });
    actualizarResumenRequisitos(tipo);
    return;
  }
  if (!evento.target.closest(".sheq-requisitos-selector")) cerrarSelectoresRequisitos();
});

document.addEventListener("change", evento => {
  const selector = evento.target.closest("[data-selector-requisitos]");
  if (selector && evento.target.matches('input[type="checkbox"]')) actualizarResumenRequisitos(selector.dataset.selectorRequisitos);
});

function abrirContrato(item=null){limpiarForm("formContrato");$("contratoId").value=item?.id||"";$("contratoCliente").value=item?.cliente||"";$("contratoUbicacion").value=item?.ubicacion||item?.faena||item?.nombre||"";$("contratoInicio").value=fechaISO(item?.fechaInicio);$("contratoTermino").value=fechaISO(item?.fechaTermino);renderCatalogoRequisitos("personal",item?.requisitosPersonal||[]);renderCatalogoRequisitos("vehiculos",item?.requisitosVehiculos||[]);cerrarSelectoresRequisitos();abrirModal("modalContrato");}
function abrirVehiculo(item=null){limpiarForm("formVehiculo");if(item){$("vehiculoId").value=item.id;$("vehiculoPatente").value=item.patente||"";$("vehiculoTipo").value=item.tipo||"Camioneta";$("vehiculoMarca").value=item.marca||"";$("vehiculoModelo").value=item.modelo||"";$("vehiculoAnio").value=item.anio||"";$("vehiculoPropietario").value=item.propietario||"";$("vehiculoSucursal").value=item.sucursalId||"";$("vehiculoEquipamiento").value=item.equipamiento||"";}abrirModal("modalVehiculo");}

function requisitosFaltantes(tipo, entidadId, contrato) {
  return evaluarEntidadEnContrato({ tipo, entidadId, contrato, documentos }).detalles.filter(item => ["faltante", "vencido"].includes(item.key)).map(item => item.requisito);
}

function itemAsignacion(tipo, entidad, contrato) {
  const faltantes = requisitosFaltantes(tipo, entidad.id, contrato);
  const asignados = tipo === "vehiculo" ? contrato.vehiculoIds || [] : contrato.personalIds || [];
  const titulo = tipo === "vehiculo" ? entidad.patente : nombreUsuario(entidad);
  const subtitulo = tipo === "vehiculo" ? `${entidad.marca || ""} ${entidad.modelo || ""}`.trim() || entidad.tipo || "Vehículo" : `${entidad.rol || "Sin cargo"} · ${entidad.rut || "Sin RUT"}`;
  const faltantesHtml = faltantes.length ? `<div class="sheq-asignacion-faltantes">${faltantes.slice(0, 4).map(item => `<span>${escapar(item)}</span>`).join("")}${faltantes.length > 4 ? `<span>+${faltantes.length - 4} más</span>` : ""}</div>` : '<small class="sheq-asignacion-ok">Documentación completa</small>';
  return `<article class="sheq-asignacion-item" data-busqueda="${escapar(`${titulo} ${subtitulo}`.toLowerCase())}"><input type="checkbox" data-asignacion-tipo="${tipo}" value="${escapar(entidad.id)}" ${asignados.includes(entidad.id) ? "checked" : ""} aria-label="Asignar ${escapar(titulo)}"><div class="sheq-asignacion-info"><strong>${escapar(titulo)}</strong><small>${escapar(subtitulo)}</small>${faltantesHtml}</div>${faltantes.length ? `<button type="button" class="sheq-action" data-cargar-faltantes="${escapar(entidad.id)}" data-entidad-tipo="${tipo}">Cargar faltantes</button>` : ""}</article>`;
}

function filtrarAsignacion(tipo) {
  const entrada = $(tipo === "persona" ? "buscarAsignacionPersonal" : "buscarAsignacionVehiculos").value.trim().toLowerCase();
  const lista = $(tipo === "persona" ? "listaAsignacionPersonal" : "listaAsignacionVehiculos");
  lista.querySelectorAll(".sheq-asignacion-item").forEach(item => { item.hidden = Boolean(entrada) && !item.dataset.busqueda.includes(entrada); });
}

function abrirAsignacion(id) {
  const contrato = contratos.find(item => item.id === id);
  if (!contrato) return;
  $("asignacionContratoId").value = id;
  $("asignacionTitulo").textContent = `Asignar · ${contrato.cliente} · ${ubicacionContrato(contrato)}`;
  $("asignacionResumen").textContent = `${(contrato.personalIds || []).length} trabajador(es) y ${(contrato.vehiculoIds || []).length} vehículo(s) asignados. Los documentos generales ya cargados también se consideran.`;
  $("buscarAsignacionPersonal").value = "";
  $("buscarAsignacionVehiculos").value = "";
  $("listaAsignacionPersonal").innerHTML = usuarios.length ? usuarios.map(item => itemAsignacion("persona", item, contrato)).join("") : '<div class="sheq-asignacion-vacio">No hay trabajadores disponibles.</div>';
  $("listaAsignacionVehiculos").innerHTML = vehiculos.length ? vehiculos.map(item => itemAsignacion("vehiculo", item, contrato)).join("") : '<div class="sheq-asignacion-vacio">No hay vehículos registrados.</div>';
  abrirModal("modalAsignacion");
}

async function guardarAsignacion(e) {
  e.preventDefault();
  const id = $("asignacionContratoId").value;
  const personalIds = Array.from(document.querySelectorAll('[data-asignacion-tipo="persona"]:checked')).map(item => item.value);
  const vehiculoIds = Array.from(document.querySelectorAll('[data-asignacion-tipo="vehiculo"]:checked')).map(item => item.value);
  await updateDoc(doc(db, "sheqContratos", id), { personalIds, vehiculoIds, actualizadoPor:usuario.uid, fechaActualizacion:serverTimestamp() });
  cerrarModal("modalAsignacion");
  await recargar("Asignación actualizada");
}

function actualizarRutDocumento() {
  const select = $("documentoEntidadId");
  const opcion = select.options[select.selectedIndex];
  const tipo = opcion?.dataset.tipo || "persona";
  $("documentoEntidadTipo").value = tipo;
  const rut = $("documentoRut");
  if (tipo === "persona") {
    const persona = usuarios.find(item => item.id === select.value);
    rut.disabled = false;
    rut.placeholder = "Ej.: 12.345.678-9";
    rut.value = persona?.rut || "";
  } else {
    rut.value = "";
    rut.disabled = true;
    rut.placeholder = "No aplica a vehículos";
  }
}

function crearFilaDocumento(item = null) {
  const fila = document.createElement("article");
  fila.className = "sheq-documento-fila";
  fila.dataset.documentoId = item?.id || "";
  fila.innerHTML = `<div class="sheq-documento-fila-numero" aria-hidden="true"></div><label class="sheq-documento-nombre-campo">Documento<input class="documento-nombre" maxlength="120" placeholder="Nombre del documento" required ${item?.requisito ? "readonly" : ""} value="${escapar(item?.tipoDocumento || "")}"></label><label class="sheq-fecha-inicio-campo">Fecha de inicio<input class="documento-inicio" type="date" value="${escapar(fechaISO(item?.fechaEmision))}"></label><label class="sheq-fecha-final-campo">Fecha final<input class="documento-final" type="date" value="${escapar(fechaISO(item?.fechaVencimiento))}"></label><label class="sheq-archivo-campo">Adjuntar documento<span class="sheq-archivo-control"><input class="documento-archivo" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" ${item?.requisito ? "required" : ""}><span class="sheq-archivo-boton">Seleccionar archivo</span><span class="sheq-archivo-nombre">Ningún archivo seleccionado</span></span><small>${item?.archivoUrl ? "Se conservará el archivo actual si no adjuntas otro." : "PDF, imagen o documento (máx. 20 MB)."}</small></label>${item?.id ? "" : '<button type="button" class="sheq-quitar-documento" aria-label="Quitar documento">Quitar</button>'}`;
  fila.querySelector(".documento-archivo").addEventListener("change", evento => {
    const nombre = evento.target.files[0]?.name || "Ningún archivo seleccionado";
    fila.querySelector(".sheq-archivo-nombre").textContent = nombre;
  });
  $("listaDocumentacion").appendChild(fila);
  actualizarNumeracionDocumentos();
  fila.querySelector(".documento-nombre").focus();
}

function actualizarNumeracionDocumentos() {
  $("listaDocumentacion").querySelectorAll(".sheq-documento-fila").forEach((fila, indice) => {
    fila.querySelector(".sheq-documento-fila-numero").textContent = String(indice + 1);
  });
}

function abrirDocumento(item=null,preset={}) {
  limpiarForm("formDocumento");
  $("formDocumento").dataset.contratoId = preset.contratoId || item?.contratoId || "";
  actualizarEntidadesDocumento();
  $("listaDocumentacion").innerHTML = "";
  $("documentoMotivoCampo").hidden = !item;
  $("documentoMotivo").required = Boolean(item);
  if (item) {
    $("documentoId").value = item.id;
    $("documentoEntidadId").value = item.entidadId || "";
    $("documentoObservaciones").value = item.observaciones || "";
    crearFilaDocumento(item);
  } else {
    if (preset.id) $("documentoEntidadId").value = preset.id;
    const requisitos = Array.isArray(preset.requisitos) ? preset.requisitos : [];
    if (requisitos.length) requisitos.forEach(tipoDocumento => crearFilaDocumento({ tipoDocumento, requisito:true }));
    else crearFilaDocumento();
  }
  actualizarRutDocumento();
  abrirModal("modalDocumento");
}

async function guardarContrato(e){e.preventDefault();const id=$("contratoId").value,ubicacion=$("contratoUbicacion").value.trim(),fechaInicio=$("contratoInicio").value,fechaTermino=$("contratoTermino").value;if(fechaTermino<fechaInicio)throw new Error("La fecha de término no puede ser anterior a la fecha de inicio.");const datos={empresaId,cliente:$("contratoCliente").value.trim(),ubicacion,fechaInicio,fechaTermino,requisitosPersonal:requisitosSeleccionados("personal"),requisitosVehiculos:requisitosSeleccionados("vehiculos"),actualizadoPor:usuario.uid,fechaActualizacion:serverTimestamp()};if(id)await updateDoc(doc(db,"sheqContratos",id),{...datos,nombre:deleteField(),faena:deleteField(),sucursalId:deleteField()});else await addDoc(collection(db,"sheqContratos"),{...datos,personalIds:[],vehiculoIds:[],creadoPor:usuario.uid,fechaCreacion:serverTimestamp()});cerrarSelectoresRequisitos();cerrarModal("modalContrato");await recargar("Contrato guardado");}
async function guardarVehiculo(e){e.preventDefault();const id=$("vehiculoId").value,datos={empresaId,patente:$("vehiculoPatente").value.trim().toUpperCase(),tipo:$("vehiculoTipo").value,marca:$("vehiculoMarca").value.trim(),modelo:$("vehiculoModelo").value.trim(),anio:Number($("vehiculoAnio").value)||null,propietario:$("vehiculoPropietario").value.trim(),sucursalId:$("vehiculoSucursal").value,equipamiento:$("vehiculoEquipamiento").value.trim(),actualizadoPor:usuario.uid,fechaActualizacion:serverTimestamp()};if(id)await updateDoc(doc(db,"sheqVehiculos",id),{...datos,contratoId:deleteField()});else await addDoc(collection(db,"sheqVehiculos"),{...datos,creadoPor:usuario.uid,fechaCreacion:serverTimestamp()});cerrarModal("modalVehiculo");await recargar("Vehículo guardado");}
async function guardarDocumento(e){
  e.preventDefault();
  const entidadId=$("documentoEntidadId").value,entidadTipo=$("documentoEntidadTipo").value;
  if(!entidadId)throw new Error("Debes seleccionar el trabajador o vehículo asociado.");
  const filas=Array.from($("listaDocumentacion").querySelectorAll(".sheq-documento-fila"));
  if(!filas.length)throw new Error("Debes agregar al menos un documento.");
  const motivo=$("documentoMotivo").value.trim();
  if($("documentoId").value&&!motivo)throw new Error("Debes indicar el motivo de la modificación.");
  const nuevosArchivos=[];
  const preparados=[];
  let rutNoActualizado=false;
  let bytesAcumulados=0;
  try{
    for(const [indice,fila] of filas.entries()){
      const id=fila.dataset.documentoId||"",anterior=id?documentos.find(d=>d.id===id):null;
      const tipoDocumento=fila.querySelector(".documento-nombre").value.trim();
      const archivo=fila.querySelector(".documento-archivo").files[0];
      const fechaInicio=fila.querySelector(".documento-inicio").value,fechaFinal=fila.querySelector(".documento-final").value;
      if(!tipoDocumento)throw new Error(`Debes escribir el nombre del documento ${indice+1}.`);
      if(fechaInicio&&fechaFinal&&fechaFinal<fechaInicio)throw new Error(`La fecha final de “${tipoDocumento}” no puede ser anterior a la fecha de inicio.`);
      let archivoUrl=anterior?.archivoUrl||"",archivoRuta=anterior?.archivoRuta||"";
      if(archivo){
        if(archivo.size>20*1024*1024)throw new Error(`El archivo de “${tipoDocumento}” supera el máximo de 20 MB.`);
        bytesAcumulados+=archivo.size;
        const cuota=evaluarCuotaStorage({usadoBytes:empresa.storageUsadoBytes||0,maxStorageGB:empresa.maxStorageGB,nuevoBytes:bytesAcumulados});
        const aviso=mensajeCuotaStorage(cuota);
        if(!cuota.permitido)throw new Error(aviso);
        if(aviso&&indice===filas.length-1)await mensaje("Uso de almacenamiento",aviso,"advertencia");
        const seguro=archivo.name.replace(/[^a-zA-Z0-9._-]/g,"_");
        archivoRuta=`empresas/${empresaId}/sheq/${entidadTipo}/${entidadId}/${Date.now()}_${indice}_${seguro}`;
        nuevosArchivos.push(archivoRuta);
        const storageRef=ref(storage,archivoRuta);
        await uploadBytes(storageRef,archivo);
        archivoUrl=await getDownloadURL(storageRef);
      }
      preparados.push({id,anterior,datos:{empresaId,entidadTipo,entidadId,tipoDocumento,contratoId:anterior?.contratoId||$("formDocumento").dataset.contratoId||"",fechaEmision:fechaInicio,fechaVencimiento:fechaFinal,estado:"aprobado",observaciones:$("documentoObservaciones").value.trim(),archivoUrl,archivoRuta,historial:anterior?[...(anterior.historial||[]),versionDocumento(anterior,motivo)]:[],actualizadoPor:usuario.uid,fechaActualizacion:serverTimestamp()}});
    }
    const batch=writeBatch(db);
    for(const preparado of preparados){
      if(preparado.id)batch.update(doc(db,"sheqDocumentos",preparado.id),preparado.datos);
      else batch.set(doc(collection(db,"sheqDocumentos")),{...preparado.datos,creadoPor:usuario.uid,fechaCreacion:serverTimestamp()});
    }
    await batch.commit();
    if(entidadTipo==="persona"){
      const rut=$("documentoRut").value.trim();
      const persona=usuarios.find(item=>item.id===entidadId);
      if(rut!==(persona?.rut||"")){
        try{await updateDoc(doc(db,"usuarios",entidadId),{rut,fechaActualizacion:serverTimestamp()});}
        catch(errorRut){rutNoActualizado=true;console.warn("Los documentos se guardaron, pero el RUT no pudo actualizarse.",errorRut);}
      }
    }
  }catch(error){
    for(const ruta of nuevosArchivos){try{await deleteObject(ref(storage,ruta));}catch(limpiezaError){console.error("No se pudo limpiar la carga fallida",limpiezaError);}}
    throw error;
  }
  cerrarModal("modalDocumento");
  const resultado=filas.length>1?`${filas.length} documentos guardados`:$("documentoId").value?"Documento actualizado y versión anterior archivada":"Documento guardado";
  await recargar(rutNoActualizado?`${resultado}. El RUT quedará pendiente hasta publicar las reglas de Firestore.`:resultado);
}

async function recargar(texto){[usuarios,contratos,vehiculos,documentos]=await Promise.all([cargarUsuarios(),obtenerColeccion("sheqContratos"),obtenerColeccion("sheqVehiculos"),obtenerColeccion("sheqDocumentos")]);usuarios=usuarios.filter(u=>u.activo!==false&&u.rol!=="super_admin");renderTodo();await mensaje("Cambios guardados",texto,"exito");}
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

function enlazarEventos(){document.querySelectorAll(".sheq-tabs button").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".sheq-tabs button,.sheq-vista").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelector(`[data-panel="${b.dataset.vista}"]`).classList.add("active");}));document.querySelectorAll("[data-cerrar-modal]").forEach(b=>b.addEventListener("click",()=>cerrarModal(b.dataset.cerrarModal)));$("documentoEntidadId").addEventListener("change",actualizarRutDocumento);$("btnAgregarDocumentacion").addEventListener("click",()=>crearFilaDocumento());$("listaDocumentacion").addEventListener("click",evento=>{const boton=evento.target.closest(".sheq-quitar-documento");if(!boton)return;boton.closest(".sheq-documento-fila").remove();actualizarNumeracionDocumentos();});$("buscarPersonalSheq").addEventListener("input",renderPersonal);$("buscarDocumentoSheq").addEventListener("input",renderDocumentos);$("filtroEstadoDocumento").addEventListener("change",renderDocumentos);$("buscarAsignacionPersonal").addEventListener("input",()=>filtrarAsignacion("persona"));$("buscarAsignacionVehiculos").addEventListener("input",()=>filtrarAsignacion("vehiculo"));$("btnNuevoContrato").addEventListener("click",()=>abrirContrato());$("btnNuevoVehiculo").addEventListener("click",()=>abrirVehiculo());$("btnNuevoDocumento").addEventListener("click",()=>abrirDocumento());$("btnExportarSheq").addEventListener("click",exportarCSV);$("formContrato").addEventListener("submit",e=>guardarContrato(e).catch(error=>mensaje("No se pudo guardar",error.message,"error")));$("formAsignacion").addEventListener("submit",e=>guardarAsignacion(e).catch(error=>mensaje("No se pudo asignar",error.message,"error")));$("formVehiculo").addEventListener("submit",e=>guardarVehiculo(e).catch(error=>mensaje("No se pudo guardar",error.message,"error")));$("formDocumento").addEventListener("submit",e=>guardarDocumento(e).catch(error=>mensaje("No se pudo guardar",error.message,"error")));document.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.editarContrato)abrirContrato(contratos.find(x=>x.id===b.dataset.editarContrato));if(b.dataset.asignarContrato)abrirAsignacion(b.dataset.asignarContrato);if(b.dataset.cargarFaltantes){const contrato=contratos.find(x=>x.id===$("asignacionContratoId").value);const tipo=b.dataset.entidadTipo,id=b.dataset.cargarFaltantes;const requisitos=requisitosFaltantes(tipo,id,contrato);abrirDocumento(null,{tipo,id,contratoId:contrato.id,requisitos});}if(b.dataset.eliminarContrato)eliminar("sheqContratos",b.dataset.eliminarContrato,"Se eliminará el contrato o faena. Los documentos conservarán su historial.");if(b.dataset.editarVehiculo)abrirVehiculo(vehiculos.find(x=>x.id===b.dataset.editarVehiculo));if(b.dataset.documentoPersona)abrirDocumento(null,{tipo:"persona",id:b.dataset.documentoPersona});if(b.dataset.documentoVehiculo)abrirDocumento(null,{tipo:"vehiculo",id:b.dataset.documentoVehiculo});if(b.dataset.matrizPersona)abrirMatrizPersona(b.dataset.matrizPersona);if(b.dataset.matrizContrato)abrirMatrizContrato(b.dataset.matrizContrato);if(b.dataset.historialDocumento)abrirHistorialDocumento(b.dataset.historialDocumento);if(b.dataset.purgarVersion)eliminarArchivoHistorico(b.dataset.purgarVersion,Number(b.dataset.versionIndice)).catch(error=>mensaje("No se pudo eliminar",error.message,"error"));if(b.dataset.editarDocumento)abrirDocumento(documentos.find(x=>x.id===b.dataset.editarDocumento));if(b.dataset.eliminarDocumento)eliminarDocumentoCompleto(b.dataset.eliminarDocumento).catch(error=>mensaje("No se pudo eliminar",error.message,"error"));});[$("btnSalirSheq"),$("btnSalirSheqTop")].forEach(b=>b.addEventListener("click",cerrarSesion));const toggle=document.querySelector(".mobile-menu-toggle"),back=document.querySelector(".mobile-menu-backdrop"),side=$("sheqSidebar");const cerrar=()=>{side.classList.remove("open");back.classList.remove("active");toggle.setAttribute("aria-expanded","false")};toggle.addEventListener("click",()=>{side.classList.toggle("open");back.classList.toggle("active");toggle.setAttribute("aria-expanded",String(side.classList.contains("open")))});back.addEventListener("click",cerrar);}

async function iniciar(){try{if(!await cargarBase())return;$("usuarioNombre").textContent=usuario.nombre||usuario.email||"Usuario";$("usuarioRol").textContent=usuario.rol;$("menuDashboardSheq").style.display=usuario.rol==="sheq"?"none":"";$("menuPanelEmpresaSheq").style.display=["super_admin","admin_empresa","admin_sucursal"].includes(usuario.rol)?"":"none";$("menuPanelEmpresaSheq").onclick=()=>location.href=`empresa-admin.html?id=${empresaId}`;$("menuProgramacionSheq").style.display=moduloActivo(empresa,"programacion")?"":"none";if(!puedeEditar)[$("btnNuevoContrato"),$("btnNuevoVehiculo"),$("btnNuevoDocumento")].forEach(b=>b.hidden=true);enlazarEventos();renderTodo();}catch(error){console.error(error);await mensaje("No se pudo abrir SHEQ",error.message||"Intenta nuevamente.","error");}}
iniciar();
