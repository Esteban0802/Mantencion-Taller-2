import { app, auth, db } from "./firebase-config.js";
import { protegerPagina, cerrarSesion } from "./session.js?v=20261004-2";
import { moduloActivo } from "./modulos.js";
import {
  etiquetaRolProgramacion,
  grupoProgramacionUsuario,
  usuariosDisponiblesPorGrupo
} from "./programacion-roles.js";
import { estadoDocumentoAcreditacion } from "./sheq-acreditacion.js?v=20261004-2";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const functions = getFunctions(app, "us-central1");
const publicarProgramacionSegura = httpsCallable(functions, "publicarProgramacion");

const usuario = protegerPagina([
  "super_admin",
  "admin_empresa",
  "admin_sucursal",
  "jefe_taller",
  "planificador",
  "supervisor",
  "tecnico",
  "sheq",
  "usuario_taller"
]);

if (!usuario) throw new Error("Acceso no autorizado");

const PUEDE_EDITAR = ["super_admin", "planificador"].includes(usuario.rol);
const PUEDE_VER_PROGRAMACION_COMPLETA = ["super_admin", "admin_empresa", "admin_sucursal", "jefe_taller", "planificador"].includes(usuario.rol);
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

let empresa = null;
let empresaId = "";
let semanaInicio = obtenerLunes(new Date());
let grupoActivo = "tecnico";
let usuariosEmpresa = [];
let sucursalesEmpresa = [];
let asignacionesEmpresa = [];
let asignacionesSemana = [];
let documentosSheq = [];
let vehiculosSheq = [];
let estadoSemanaActual = "borrador";

const $ = id => document.getElementById(id);

function escapar(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function obtenerLunes(fecha) {
  const resultado = new Date(fecha);
  resultado.setHours(0, 0, 0, 0);
  const dia = resultado.getDay();
  resultado.setDate(resultado.getDate() - (dia === 0 ? 6 : dia - 1));
  return resultado;
}

function sumarDias(fecha, cantidad) {
  const resultado = new Date(fecha);
  resultado.setDate(resultado.getDate() + cantidad);
  return resultado;
}

function fechaISO(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function fechaCorta(fecha) {
  return `${fecha.getDate()} ${MESES[fecha.getMonth()]}`;
}

function numeroSemana(fecha) {
  const objetivo = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dia = objetivo.getUTCDay() || 7;
  objetivo.setUTCDate(objetivo.getUTCDate() + 4 - dia);
  const inicioAnio = new Date(Date.UTC(objetivo.getUTCFullYear(), 0, 1));
  return Math.ceil((((objetivo - inicioAnio) / 86400000) + 1) / 7);
}

function nombreUsuario(perfil) {
  return perfil.nombreCompleto || perfil.nombre || perfil.email || "Usuario";
}

function grupoUsuario(perfil) {
  return grupoProgramacionUsuario(perfil);
}

function etiquetaRol(perfil) {
  return etiquetaRolProgramacion(perfil);
}

function puedeVerAsignacion(asignacion) {
  if (grupoActivo === "mi-semana") return asignacion.usuarioIds?.includes(usuario.uid) || asignacion.supervisorIds?.includes(usuario.uid) || asignacion.sheqIds?.includes(usuario.uid);
  if (grupoActivo === "supervisor") return Boolean(asignacion.supervisorIds?.length);
  if (grupoActivo === "sheq") return asignacion.grupo === "sheq" || Boolean(asignacion.sheqIds?.length);
  return asignacion.grupo === grupoActivo;
}

function usuariosVisibles() {
  if (grupoActivo === "mi-semana") {
    return usuariosEmpresa.filter(item => item.id === usuario.uid);
  }

  const idsAsignados = new Set(
    asignacionesSemana
      .filter(puedeVerAsignacion)
      .flatMap(asignacion => {
        if (grupoActivo === "supervisor") return asignacion.supervisorIds || [];
        if (grupoActivo === "sheq") return [
          ...(asignacion.grupo === "sheq" ? (asignacion.usuarioIds || []) : []),
          ...(asignacion.sheqIds || [])
        ];
        return asignacion.usuarioIds || [];
      })
  );

  return usuariosEmpresa.filter(item =>
    (item.activo !== false && grupoUsuario(item) === grupoActivo) || idsAsignados.has(item.id)
  );
}

async function cargarEmpresa() {
  empresaId = usuario.rol === "super_admin"
    ? sessionStorage.getItem("empresaIdOperacionAdmin") || ""
    : usuario.empresaId || "";

  if (!empresaId) throw new Error("No se encontró la empresa asociada.");

  const snap = await getDoc(doc(db, "empresas", empresaId));
  if (!snap.exists()) throw new Error("La empresa no existe.");

  empresa = { id: snap.id, ...snap.data() };

  if (!moduloActivo(empresa, "programacion")) {
    alert("El módulo de Programación semanal no está habilitado para esta empresa.");
    window.location.replace(usuario.rol === "super_admin" ? "super-admin.html" : usuario.rol === "bodeguero" ? "inventario.html" : "dashboard.html");
    return false;
  }

  $("nombreEmpresaProgramacion").textContent = empresa.nombre || "Empresa";
  return true;
}

async function cargarUsuariosYSucursales() {
  if (!PUEDE_VER_PROGRAMACION_COMPLETA) {
    const perfilSnap = await getDoc(doc(db, "usuarios", usuario.uid));
    usuariosEmpresa = perfilSnap.exists()
      ? [{ id: perfilSnap.id, ...perfilSnap.data() }]
      : [{ id: usuario.uid, ...usuario }];
  } else {
    const restriccionesUsuarios = [where("empresaId", "==", empresaId)];
    if (["admin_sucursal", "jefe_taller", "planificador"].includes(usuario.rol) && usuario.sucursalId) {
      restriccionesUsuarios.push(where("sucursalId", "==", usuario.sucursalId));
    }
    const usuariosSnap = await getDocs(
      query(collection(db, "usuarios"), ...restriccionesUsuarios)
    );
    usuariosEmpresa = usuariosSnap.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => nombreUsuario(a).localeCompare(nombreUsuario(b), "es"));
  }

  actualizarSelectoresAsignacion();
}

function opcionUsuario(item, seleccionado = false, noDisponible = false, deshabilitado = false) {
  const estado = noDisponible ? " · ya asignado en esta fecha" : "";
  return `<option value="${escapar(item.id)}"${seleccionado ? " selected" : ""}${deshabilitado ? " disabled" : ""}>${escapar(nombreUsuario(item))} · ${escapar(etiquetaRol(item))}${estado}</option>`;
}

function idsOcupadosEnFecha(fecha, asignacionExcluida = "") {
  const ocupados = new Set();
  if (!fecha) return ocupados;
  asignacionesEmpresa.forEach(item => {
    if (item.id === asignacionExcluida || item.fecha !== fecha) return;
    [
      ...(item.usuarioIds || []),
      ...(item.supervisorIds || []),
      ...(item.sheqIds || [])
    ].forEach(id => ocupados.add(id));
  });
  return ocupados;
}

function idsUsuariosSeleccionados() {
  return [...new Set(Array.from(document.querySelectorAll(".asignacion-usuario-select"))
    .map(selector => selector.value)
    .filter(Boolean))];
}

function opcionesTrabajador(trabajadores, seleccionado = "", trabajadoresGuardados = [], idsOcupados = new Set()) {
  const disponibles = [...trabajadores];
  trabajadoresGuardados.forEach(item => {
    if (!disponibles.some(disponible => disponible.id === item.id)) disponibles.push(item);
  });
  const etiquetaInicial = disponibles.length ? "Selecciona un trabajador" : "No hay trabajadores disponibles";
  return `<option value="">${etiquetaInicial}</option>${disponibles
    .map(item => {
      const fueraDelGrupo = !trabajadores.some(disponible => disponible.id === item.id);
      const ocupado = idsOcupados.has(item.id);
      return opcionUsuario(item, item.id === seleccionado, fueraDelGrupo || ocupado, ocupado);
    })
    .join("")}`;
}

function crearFilaTrabajador(trabajadores, seleccionado = "", trabajadoresGuardados = [], removible = true, idsOcupados = new Set()) {
  const fila = document.createElement("div");
  fila.className = "fila-asignacion-usuario";
  fila.innerHTML = `<select class="asignacion-usuario-select" required>${opcionesTrabajador(trabajadores, seleccionado, trabajadoresGuardados, idsOcupados)}</select>${removible ? '<button type="button" class="btn-quitar-trabajador" aria-label="Quitar trabajador">Quitar</button>' : ""}`;
  return fila;
}

function renderSelectoresTrabajadores(trabajadores, idsSeleccionados = [], trabajadoresGuardados = [], idsOcupados = new Set()) {
  const lista = $("listaAsignacionUsuarios");
  const ids = idsSeleccionados.length ? idsSeleccionados : [""];
  lista.innerHTML = "";
  ids.forEach((id, indice) => {
    const fila = crearFilaTrabajador(trabajadores, id, trabajadoresGuardados, indice > 0, idsOcupados);
    const selector = fila.querySelector("select");
    if (indice === 0) selector.id = "asignacionUsuarios";
    lista.appendChild(fila);
  });
}

function ordenesServicioAsignacion(asignacion = {}) {
  if (Array.isArray(asignacion.ordenesServicio) && asignacion.ordenesServicio.length) {
    return asignacion.ordenesServicio.map((item, indice) => ({
      numero: String(item.numero || "").trim(),
      equipo: String(item.equipo || "").trim(),
      actividad: String(item.actividad || (indice === 0 ? asignacion.actividad || "" : "")).trim(),
      observacion: String(item.observacion || "").trim(),
      cerrada: item.cerrada === true
    }));
  }
  if (asignacion.ot || asignacion.equipo || asignacion.actividad) {
    return [{ numero: asignacion.ot || "", equipo: asignacion.equipo || "", actividad: asignacion.actividad || "", observacion: "", cerrada: false }];
  }
  return [];
}

function crearFilaOs(item = {}, removible = true) {
  const fila = document.createElement("div");
  fila.className = `fila-asignacion-os${item.cerrada ? " os-cerrada" : ""}`;
  fila.innerHTML = `<input type="text" class="asignacion-os-numero" placeholder="Número de OS" value="${escapar(item.numero || "")}" required><input type="text" class="asignacion-os-equipo" placeholder="Equipo, modelo o serie" value="${escapar(item.equipo || "")}"><input type="text" class="asignacion-os-actividad" placeholder="Actividad" value="${escapar(item.actividad || "")}" required><input type="text" class="asignacion-os-observacion" placeholder="Observación" value="${escapar(item.observacion || "")}"><label class="control-cerrar-os"><input type="checkbox" class="asignacion-os-cerrada"${item.cerrada ? " checked" : ""}><span>Cerrar OS</span></label>${removible ? '<button type="button" class="btn-quitar-os" aria-label="Quitar OS">Quitar</button>' : ""}`;
  return fila;
}

function renderOrdenesServicio(items = []) {
  const lista = $("listaAsignacionOs");
  lista.innerHTML = "";
  items.forEach((item, indice) => {
    const fila = crearFilaOs(item, true);
    if (indice === 0) {
      fila.querySelector(".asignacion-os-numero").id = "asignacionOt";
      fila.querySelector(".asignacion-os-equipo").id = "asignacionEquipo";
      fila.querySelector(".asignacion-os-actividad").id = "asignacionActividad";
    }
    lista.appendChild(fila);
  });
}

function ordenesServicioFormulario() {
  return Array.from(document.querySelectorAll(".fila-asignacion-os"))
    .map(fila => ({
      numero: fila.querySelector(".asignacion-os-numero")?.value.trim() || "",
      equipo: fila.querySelector(".asignacion-os-equipo")?.value.trim() || "",
      actividad: fila.querySelector(".asignacion-os-actividad")?.value.trim() || "",
      observacion: fila.querySelector(".asignacion-os-observacion")?.value.trim() || "",
      cerrada: fila.querySelector(".asignacion-os-cerrada")?.checked === true
    }))
    .filter(item => item.numero || item.equipo || item.actividad || item.observacion);
}

function nombreVehiculo(item) {
  return [item.patente, item.marca, item.modelo].filter(Boolean).join(" · ") || "Vehículo";
}

function prepararSelectorVehiculos(seleccionado = "") {
  const select = $("asignacionVehiculo");
  if (!select) return;
  select.innerHTML = `<option value="">Sin vehículo asignado</option>${vehiculosSheq
    .map(item => `<option value="${escapar(item.id)}"${item.id === seleccionado ? " selected" : ""}>${escapar(nombreVehiculo(item))}</option>`)
    .join("")}`;
}

function actualizarResumenTrabajadores() {
  const contenedor = $("resumenAsignacionUsuarios");
  if (!contenedor) return;
  const seleccionados = idsUsuariosSeleccionados();
  if (!seleccionados.length) {
    contenedor.textContent = "Ningún trabajador seleccionado.";
    return;
  }
  const nombres = seleccionados
    .map(id => usuariosEmpresa.find(item => item.id === id))
    .filter(Boolean)
    .map(nombreUsuario);
  contenedor.textContent = `${seleccionados.length} trabajador(es) seleccionado(s): ${nombres.join(", ")}.`;
}

function actualizarSelectoresAsignacion({ usuariosSeleccionados = [], usuarioSeleccionado = "", supervisorSeleccionado = "", sheqSeleccionado = "" } = {}) {
  const grupo = $("asignacionGrupo").value || "tecnico";
  const fecha = $("asignacionFecha").value;
  const idsOcupados = idsOcupadosEnFecha(fecha, $("asignacionId").value);
  const idsSeleccionados = new Set([
    ...usuariosSeleccionados,
    ...(usuarioSeleccionado ? [usuarioSeleccionado] : [])
  ].filter(Boolean));
  const trabajadores = usuariosDisponiblesPorGrupo(usuariosEmpresa, grupo);
  const supervisores = usuariosDisponiblesPorGrupo(usuariosEmpresa, "supervisor");
  const asesoresSheq = usuariosDisponiblesPorGrupo(usuariosEmpresa, "sheq");
  const trabajadoresGuardados = usuariosEmpresa.filter(item => idsSeleccionados.has(item.id));
  const supervisorGuardado = usuariosEmpresa.find(item => item.id === supervisorSeleccionado);
  const sheqGuardado = usuariosEmpresa.find(item => item.id === sheqSeleccionado);

  renderSelectoresTrabajadores(trabajadores, [...idsSeleccionados], trabajadoresGuardados, idsOcupados);
  const cantidadOcupados = trabajadores.filter(item => idsOcupados.has(item.id)).length;
  const ayuda = $("ayudaAsignacionUsuarios");
  if (ayuda) {
    ayuda.textContent = cantidadOcupados
      ? `${cantidadOcupados} trabajador(es) ya tiene(n) una asignación en esta fecha y aparecen deshabilitados.`
      : "Todos los trabajadores mostrados están disponibles en esta fecha.";
  }

  $("asignacionSupervisor").innerHTML = `<option value="">Sin supervisor asignado</option>${supervisores
    .map(item => opcionUsuario(item, item.id === supervisorSeleccionado))
    .join("")}${supervisorGuardado && !supervisores.some(item => item.id === supervisorGuardado.id)
      ? opcionUsuario(supervisorGuardado, true, true)
      : ""}`;

  $("asignacionSheq").innerHTML = `<option value="">Sin asesor SHEQ asignado</option>${asesoresSheq
    .map(item => opcionUsuario(item, item.id === sheqSeleccionado))
    .join("")}${sheqGuardado && !asesoresSheq.some(item => item.id === sheqGuardado.id)
      ? opcionUsuario(sheqGuardado, true, true)
      : ""}`;
  actualizarResumenTrabajadores();
  actualizarAlertaSheqTrabajador();
}

async function cargarDocumentosSheq() {
  documentosSheq = [];
  vehiculosSheq = [];
  if (!PUEDE_EDITAR || !moduloActivo(empresa, "sheq")) return;
  try {
    const [documentosSnap, vehiculosSnap] = await Promise.all([
      getDocs(query(collection(db, "sheqDocumentos"), where("empresaId", "==", empresaId))),
      getDocs(query(collection(db, "sheqVehiculos"), where("empresaId", "==", empresaId)))
    ]);
    documentosSheq = documentosSnap.docs.map(item => ({ id: item.id, ...item.data() }));
    vehiculosSheq = vehiculosSnap.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => nombreVehiculo(a).localeCompare(nombreVehiculo(b), "es"));
    prepararSelectorVehiculos();
  } catch (error) {
    console.warn("No se pudieron consultar los datos SHEQ para Programación:", error);
  }
}

function actualizarAlertaSheqTrabajador() {
  const contenedor = $("alertaSheqProgramacion");
  if (!contenedor) return;
  const usuarioIds = [...new Set([
    ...idsUsuariosSeleccionados(),
    $("asignacionSupervisor")?.value || "",
    $("asignacionSheq")?.value || ""
  ].filter(Boolean))];
  const alertasPersonas = usuarioIds.flatMap(usuarioId => {
    const perfil = usuariosEmpresa.find(item => item.id === usuarioId);
    return documentosSheq
      .filter(item => item.entidadTipo === "persona" && item.entidadId === usuarioId)
      .map(documento => ({
        documento,
        estado: estadoDocumentoAcreditacion(documento),
        nombre: nombreUsuario(perfil || {})
      }));
  });
  const vehiculoId = $("asignacionVehiculo")?.value || "";
  const vehiculo = vehiculosSheq.find(item => item.id === vehiculoId);
  const alertasVehiculo = vehiculoId ? documentosSheq
    .filter(item => item.entidadTipo === "vehiculo" && item.entidadId === vehiculoId)
    .map(documento => ({
      documento,
      estado: estadoDocumentoAcreditacion(documento),
      nombre: nombreVehiculo(vehiculo || {})
    })) : [];
  const alertas = [...alertasPersonas, ...alertasVehiculo];
  const vencidos = alertas.filter(item => item.estado.key === "vencido");
  const proximos = alertas.filter(item => ["aviso", "proximo", "critico"].includes(item.estado.key));
  if ((!usuarioIds.length && !vehiculoId) || (!vencidos.length && !proximos.length)) {
    contenedor.hidden = true;
    contenedor.innerHTML = "";
    return;
  }
  const afectados = vencidos.length ? vencidos : proximos;
  const entidadesAfectadas = [...new Set(afectados.map(item => item.nombre))];
  const nombres = afectados.slice(0, 3).map(item => `${item.nombre}: ${item.documento.tipoDocumento || "Documento"}`).join(", ");
  const restantes = afectados.length > 3 ? ` y ${afectados.length - 3} más` : "";
  const esVencido = vencidos.length > 0;
  contenedor.className = `alerta-sheq-programacion ${esVencido ? "vencido" : "proximo"}`;
  contenedor.innerHTML = `<strong>${esVencido ? "Alerta SHEQ" : "Aviso SHEQ"}</strong><span>${entidadesAfectadas.length} persona(s) o vehículo(s) presenta(n) ${afectados.length} documento(s) ${esVencido ? "vencido(s)" : "próximo(s) a vencer"}: ${escapar(nombres)}${escapar(restantes)}. La asignación puede continuar.</span>`;
  contenedor.hidden = false;
}

async function cargarSemana() {
  mostrarMensaje("Cargando programación...");
  const inicio = fechaISO(semanaInicio);
  const fin = fechaISO(sumarDias(semanaInicio, 6));

  const semanasSnap = await getDocs(query(collection(db, "programacionSemanas"), where("empresaId", "==", empresaId)));
  const semanaGuardada = semanasSnap.docs
    .map(item => item.data())
    .find(item => item.semanaInicio === inicio);
  estadoSemanaActual = semanaGuardada?.estado || "borrador";
  actualizarEncabezadoSemana();

  if (!PUEDE_EDITAR && estadoSemanaActual !== "publicada") {
    asignacionesSemana = [];
    mostrarMensaje("La programación de esta semana todavía no ha sido publicada.");
    $("resumenProgramacion").textContent = "Programación pendiente de publicación";
    return;
  }

  const asignacionesSnap = await getDocs(query(collection(db, "programaciones"), where("empresaId", "==", empresaId)));
  asignacionesEmpresa = asignacionesSnap.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .sort((a, b) => `${a.fecha}_${a.cliente || ""}`.localeCompare(`${b.fecha}_${b.cliente || ""}`));
  asignacionesSemana = asignacionesEmpresa.filter(item => item.fecha >= inicio && item.fecha <= fin);
  renderCuadro();
}

function marcarSemanaBorrador(batch, inicio) {
  batch.set(doc(db, "programacionSemanas", `${empresaId}_${inicio}`), {
    empresaId,
    semanaInicio: inicio,
    estado: "borrador",
    actualizadoPor: usuario.uid,
    fechaActualizacion: serverTimestamp()
  }, { merge: true });
}

function actualizarEncabezadoSemana() {
  const termino = sumarDias(semanaInicio, 6);
  $("tituloSemana").textContent = `Semana ${numeroSemana(semanaInicio)}`;
  $("rangoSemana").textContent = `${fechaCorta(semanaInicio)} – ${fechaCorta(termino)} ${termino.getFullYear()}`;
  $("estadoSemana").textContent = estadoSemanaActual === "publicada" ? "Publicada" : "Borrador";
  $("estadoSemana").className = `estado-semana ${estadoSemanaActual}`;
  $("btnPublicarSemana").textContent = estadoSemanaActual === "publicada" ? "Actualizar publicación" : "Publicar semana";
}

function mostrarMensaje(texto) {
  $("mensajeProgramacion").textContent = texto;
  $("mensajeProgramacion").style.display = "block";
  $("programacionCuadro").innerHTML = "";
}

function asignacionesCelda(fecha, usuarioId) {
  return asignacionesSemana.filter(item =>
    item.fecha === fecha &&
    (grupoActivo === "mi-semana"
      ? item.usuarioIds?.includes(usuarioId) || item.supervisorIds?.includes(usuarioId) || item.sheqIds?.includes(usuarioId)
      : grupoActivo === "supervisor"
      ? item.supervisorIds?.includes(usuarioId)
      : grupoActivo === "sheq"
        ? item.sheqIds?.includes(usuarioId) || (item.grupo === "sheq" && item.usuarioIds?.includes(usuarioId))
        : item.usuarioIds?.includes(usuarioId)) &&
    puedeVerAsignacion(item)
  );
}

function renderBloque(asignacion) {
  const ordenes = ordenesServicioAsignacion(asignacion).filter(item => item.numero || item.equipo || item.actividad || item.observacion);
  const vehiculo = vehiculosSheq.find(item => item.id === asignacion.vehiculoId);
  const filas = [
    ["Cliente", asignacion.cliente],
    ["Modalidad", [asignacion.contrato ? "Contrato" : "", asignacion.fixPrice ? "Fix Price" : ""].filter(Boolean).join(" · ")],
    ["Vehículo", asignacion.vehiculoNombre || (vehiculo ? nombreVehiculo(vehiculo) : "")],
    ["Indicación", asignacion.observaciones]
  ].filter(([, valor]) => valor);
  return `
    <article class="bloque-asignacion ${escapar(asignacion.tipo || "terreno")}" data-asignacion-id="${escapar(asignacion.id)}" tabindex="0">
      ${filas.map(([etiqueta, valor]) => `<div class="asignacion-dato"><strong>${etiqueta}</strong><span>${escapar(valor)}</span></div>`).join("")}
      ${ordenes.length ? `<div class="asignacion-os-lista">${ordenes.map(item => `<div class="asignacion-os-item${item.cerrada ? " os-cerrada" : ""}"><strong>OS</strong><span>${escapar([item.numero, item.equipo, item.actividad, item.observacion ? `Obs: ${item.observacion}` : ""].filter(Boolean).join(" · "))}${item.cerrada ? ' · <b class="indicacion-cerrar-os">Cerrar OS</b>' : ""}</span></div>`).join("")}</div>` : ""}
    </article>
  `;
}

function renderCuadro() {
  const personas = usuariosVisibles();
  const cuadro = $("programacionCuadro");
  $("mensajeProgramacion").style.display = "none";

  if (!personas.length) {
    mostrarMensaje(grupoActivo === "mi-semana" ? "Tu usuario no está disponible en esta empresa." : "No hay trabajadores en este grupo. Puedes asignarlos desde Nueva asignación.");
    $("resumenProgramacion").textContent = "0 personas · 0 asignaciones";
    return;
  }

  cuadro.style.gridTemplateColumns = `118px repeat(${personas.length}, minmax(185px, 1fr))`;
  let html = `<div class="programacion-celda encabezado"><strong>Equipo</strong><small>Semana ${numeroSemana(semanaInicio)}</small></div>`;

  personas.forEach(persona => {
    html += `<div class="programacion-celda encabezado"><strong>${escapar(nombreUsuario(persona))}</strong><small>${escapar(etiquetaRol(persona))}</small></div>`;
  });

  DIAS.forEach((nombreDia, indice) => {
    const fecha = sumarDias(semanaInicio, indice);
    const iso = fechaISO(fecha);
    html += `<div class="programacion-celda programacion-dia"><strong>${nombreDia}</strong><span>${fechaCorta(fecha)}</span></div>`;

    personas.forEach(persona => {
      const bloques = asignacionesCelda(iso, persona.id);
      html += `<div class="programacion-celda">${bloques.length ? bloques.map(renderBloque).join("") : '<div class="celda-vacia">Sin asignación</div>'}</div>`;
    });
  });

  cuadro.innerHTML = html;
  cuadro.querySelectorAll("[data-asignacion-id]").forEach(elemento => {
    const abrir = () => abrirAsignacion(elemento.dataset.asignacionId);
    elemento.addEventListener("click", abrir);
    elemento.addEventListener("keydown", evento => {
      if (evento.key === "Enter" || evento.key === " ") abrir();
    });
  });

  const asignacionesVisibles = asignacionesSemana.filter(puedeVerAsignacion);
  $("resumenProgramacion").textContent = `${personas.length} persona(s) · ${asignacionesVisibles.length} asignación(es)`;
}

function abrirModal(id) {
  const modal = $(id);
  modal.classList.add("abierto");
  modal.setAttribute("aria-hidden", "false");
}

function cerrarModal(id) {
  const modal = $(id);
  modal.classList.remove("abierto");
  modal.setAttribute("aria-hidden", "true");
}

function limpiarFormulario() {
  $("formAsignacion").reset();
  $("asignacionId").value = "";
  $("asignacionFecha").value = fechaISO(semanaInicio);
  $("asignacionGrupo").value = grupoActivo === "mi-semana" ? "tecnico" : grupoActivo;
  actualizarSelectoresAsignacion();
  renderOrdenesServicio();
  prepararSelectorVehiculos();
  $("tituloModalAsignacion").textContent = "Nueva asignación";
  $("btnEliminarAsignacion").style.display = "none";
  actualizarAlertaSheqTrabajador();
}

function abrirNuevaAsignacion() {
  limpiarFormulario();
  if (grupoActivo === "mi-semana") {
    $("asignacionUsuarios").value = usuario.uid;
    actualizarResumenTrabajadores();
    actualizarAlertaSheqTrabajador();
  }
  abrirModal("modalAsignacion");
}

function abrirAsignacion(id) {
  const asignacion = asignacionesSemana.find(item => item.id === id);
  if (!asignacion) return;

  if (!PUEDE_EDITAR) {
    alert(`${asignacion.cliente || "Asignación"}\n${asignacion.actividad || ""}`);
    return;
  }

  $("asignacionId").value = asignacion.id;
  $("asignacionFecha").value = asignacion.fecha || "";
  $("asignacionGrupo").value = asignacion.grupo || "tecnico";
  actualizarSelectoresAsignacion({
    usuariosSeleccionados: asignacion.usuarioIds || [],
    supervisorSeleccionado: asignacion.supervisorIds?.[0] || "",
    sheqSeleccionado: asignacion.sheqIds?.[0] || ""
  });
  $("asignacionTipo").value = asignacion.tipo || "terreno";
  $("asignacionCliente").value = asignacion.cliente || "";
  $("asignacionContrato").checked = asignacion.contrato === true;
  $("asignacionFixPrice").checked = asignacion.fixPrice === true;
  renderOrdenesServicio(ordenesServicioAsignacion(asignacion));
  prepararSelectorVehiculos(asignacion.vehiculoId || "");
  $("asignacionObservaciones").value = asignacion.observaciones || "";
  actualizarAlertaSheqTrabajador();
  $("tituloModalAsignacion").textContent = "Editar asignación";
  $("btnEliminarAsignacion").style.display = "";
  abrirModal("modalAsignacion");
}

async function guardarAsignacion(evento) {
  evento.preventDefault();
  if (!PUEDE_EDITAR) return;

  const usuarioIds = idsUsuariosSeleccionados();
  const supervisorId = $("asignacionSupervisor").value;
  const sheqId = $("asignacionSheq").value;
  if (!usuarioIds.length) {
    alert("Selecciona al menos un trabajador.");
    return;
  }

  const fecha = $("asignacionFecha").value;
  const participantesSeleccionados = [
    ...usuarioIds.map(id => ({ id, rol: "Técnico" })),
    ...(supervisorId ? [{ id: supervisorId, rol: "Supervisor" }] : []),
    ...(sheqId ? [{ id: sheqId, rol: "SHEQ" }] : [])
  ];
  const idsParticipantesSeleccionados = new Set(participantesSeleccionados.map(item => item.id));
  const idsConConflicto = new Set();
  asignacionesEmpresa.forEach(item => {
    if (item.id === $("asignacionId").value || item.fecha !== fecha) return;
    const idsAsignados = [
      ...(item.usuarioIds || []),
      ...(item.supervisorIds || []),
      ...(item.sheqIds || [])
    ];
    idsAsignados.forEach(id => {
      if (idsParticipantesSeleccionados.has(id)) idsConConflicto.add(id);
    });
  });

  if (idsConConflicto.size) {
    const personasConConflicto = participantesSeleccionados
      .filter((item, indice, lista) => idsConConflicto.has(item.id) && lista.findIndex(otro => otro.id === item.id) === indice)
      .map(item => {
        const perfil = usuariosEmpresa.find(usuarioEmpresa => usuarioEmpresa.id === item.id);
        return `${nombreUsuario(perfil || {})} (${item.rol})`;
      });
    const nombresConConflicto = personasConConflicto
      .join(", ");
    const mensajeConflicto = idsConConflicto.size === 1
      ? `${nombresConConflicto || "La persona seleccionada"} ya tiene otra asignación durante este día. Puedes volver al formulario o guardar ambas actividades.`
      : `${nombresConConflicto || "Algunas personas seleccionadas"} ya tienen otra asignación durante este día. Puedes volver al formulario o guardar ambas actividades.`;
    const continuar = window.OverTrackUI?.confirmarAccion
      ? await window.OverTrackUI.confirmarAccion({
          titulo: "Asignación existente",
          mensaje: mensajeConflicto,
          tipo: "advertencia",
          textoConfirmar: "Guardar de todas formas",
          textoCancelar: "Volver al formulario"
        })
      : confirm(`${mensajeConflicto} ¿Deseas guardar de todas formas?`);
    if (!continuar) return;
  }

  const ordenesServicio = ordenesServicioFormulario();
  const vehiculoId = $("asignacionVehiculo").value;
  const vehiculo = vehiculosSheq.find(item => item.id === vehiculoId);
  const datos = {
    empresaId,
    semanaInicio: fechaISO(obtenerLunes(new Date(`${fecha}T12:00:00`))),
    fecha,
    grupo: $("asignacionGrupo").value,
    usuarioIds,
    supervisorIds: supervisorId ? [supervisorId] : [],
    sheqIds: sheqId ? [sheqId] : [],
    tipo: $("asignacionTipo").value,
    cliente: $("asignacionCliente").value.trim(),
    contrato: $("asignacionContrato").checked,
    fixPrice: $("asignacionFixPrice").checked,
    actividad: ordenesServicio[0]?.actividad || "",
    ordenesServicio,
    ot: ordenesServicio[0]?.numero || "",
    equipo: ordenesServicio[0]?.equipo || "",
    vehiculoId,
    vehiculoNombre: vehiculo ? nombreVehiculo(vehiculo) : "",
    observaciones: $("asignacionObservaciones").value.trim(),
    actualizadoPor: usuario.uid,
    fechaActualizacion: serverTimestamp()
  };

  const boton = $("btnGuardarAsignacion");
  boton.disabled = true;
  boton.textContent = "Guardando...";

  try {
    const id = $("asignacionId").value;
    const batch = writeBatch(db);
    const asignacionAnterior = id ? asignacionesSemana.find(item => item.id === id) : null;
    if (id) {
      batch.update(doc(db, "programaciones", id), datos);
    } else {
      batch.set(doc(collection(db, "programaciones")), {
        ...datos,
        creadoPor: usuario.uid,
        fechaCreacion: serverTimestamp()
      });
    }
    marcarSemanaBorrador(batch, datos.semanaInicio);
    if (asignacionAnterior?.semanaInicio && asignacionAnterior.semanaInicio !== datos.semanaInicio) {
      marcarSemanaBorrador(batch, asignacionAnterior.semanaInicio);
    }
    await batch.commit();
    cerrarModal("modalAsignacion");
    await cargarSemana();
  } catch (error) {
    console.error("No fue posible guardar la asignación:", error);
    alert("No fue posible guardar. Verifica que las reglas de Programación estén publicadas en Firebase.");
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar asignación";
  }
}

async function eliminarAsignacion() {
  const id = $("asignacionId").value;
  if (!id || !PUEDE_EDITAR || !confirm("¿Eliminar esta asignación?")) return;

  try {
    const asignacion = asignacionesSemana.find(item => item.id === id);
    const batch = writeBatch(db);
    batch.delete(doc(db, "programaciones", id));
    marcarSemanaBorrador(batch, asignacion?.semanaInicio || fechaISO(semanaInicio));
    await batch.commit();
    cerrarModal("modalAsignacion");
    await cargarSemana();
  } catch (error) {
    console.error("No fue posible eliminar la asignación:", error);
    alert("No fue posible eliminar la asignación.");
  }
}

async function publicarSemana() {
  if (!PUEDE_EDITAR) return;
  if (!asignacionesSemana.length) {
    alert("Agrega al menos una asignación antes de publicar.");
    return;
  }

  const mensajePublicacion = empresa?.envioCorreosProgramacion === true
    ? "¿Publicar esta semana? La primera publicación enviará la programación completa; las siguientes notificarán solo los cambios a las personas afectadas."
    : "¿Publicar esta semana en modo de prueba? La programación quedará visible, pero no se enviarán correos.";
  if (!confirm(mensajePublicacion)) return;

  const inicio = fechaISO(semanaInicio);
  const boton = $("btnPublicarSemana");
  boton.disabled = true;
  boton.textContent = "Publicando...";
  try {
    const respuesta = await publicarProgramacionSegura({ empresaId, semanaInicio: inicio });
    const resultado = respuesta.data || {};
    estadoSemanaActual = "publicada";
    actualizarEncabezadoSemana();
    const resumen = resultado.modoPrueba
      ? `Semana publicada en modo de prueba. Se detectaron ${resultado.cambios || 0} cambio(s) para ${resultado.destinatariosPotenciales || 0} usuario(s), pero no se enviaron correos.`
      : resultado.primeraPublicacion
        ? `Programación completa preparada para ${resultado.destinatarios || 0} destinatario(s).`
        : resultado.cambios
          ? `${resultado.cambios} cambio(s) preparado(s) para ${resultado.destinatarios || 0} destinatario(s).`
          : "Semana publicada sin cambios que notificar.";
    alert(`${resumen}${resultado.sinCorreo ? ` ${resultado.sinCorreo} usuario(s) no tiene(n) un correo válido.` : ""}`);
  } catch (error) {
    console.error("No fue posible publicar la semana:", error);
    alert(error?.message || "No fue posible publicar la semana.");
  } finally {
    boton.disabled = false;
    actualizarEncabezadoSemana();
  }
}

function idsPersonaPorGrupo(asignacion, grupo) {
  if (grupo === "supervisor") return asignacion.supervisorIds || [];
  if (grupo === "sheq") return [
    ...(asignacion.grupo === "sheq" ? (asignacion.usuarioIds || []) : []),
    ...(asignacion.sheqIds || [])
  ];
  return asignacion.grupo === "tecnico" ? (asignacion.usuarioIds || []) : [];
}

function personasVistaCorreo(grupo) {
  const idsConAsignacion = new Set(asignacionesSemana.flatMap(item => idsPersonaPorGrupo(item, grupo)));
  return usuariosEmpresa.filter(item =>
    (item.activo !== false && grupoUsuario(item) === grupo) || idsConAsignacion.has(item.id)
  );
}

function detalleOperacionalCorreo(asignacion) {
  const detalles = ordenesServicioAsignacion(asignacion)
    .filter(item => item.numero || item.equipo || item.actividad || item.observacion)
    .map(item => `OS ${[item.numero, item.equipo, item.actividad, item.observacion ? `Obs: ${item.observacion}` : ""].filter(Boolean).join(" · ")}${item.cerrada ? " · Cerrar OS" : ""}`);
  const modalidad = [asignacion.contrato ? "Contrato" : "", asignacion.fixPrice ? "Fix Price" : ""].filter(Boolean).join(" · ");
  if (modalidad) detalles.unshift(`Modalidad ${modalidad}`);
  if (asignacion.vehiculoNombre) detalles.push(`Vehículo ${asignacion.vehiculoNombre}`);
  return detalles.map(item => `<br>${escapar(item)}`).join("");
}

function companerosAsignacionCorreo(asignacion, destinatarioId) {
  const participantes = [
    ...(asignacion.usuarioIds || []).map(id => ({ id, rol: "Técnico" })),
    ...(asignacion.supervisorIds || []).map(id => ({ id, rol: "Supervisor" })),
    ...(asignacion.sheqIds || []).map(id => ({ id, rol: "SHEQ" }))
  ];
  const vistos = new Set();
  const companeros = participantes
    .filter(item => item.id !== destinatarioId && !vistos.has(item.id) && vistos.add(item.id))
    .map(item => {
      const perfil = usuariosEmpresa.find(usuarioEmpresa => usuarioEmpresa.id === item.id);
      return `${nombreUsuario(perfil || {})} (${item.rol})`;
    });
  return companeros.length
    ? `<br><strong>Trabajará con:</strong> ${escapar(companeros.join(", "))}`
    : "";
}

function renderVistaCorreo(grupo = "tecnico", personaId = "") {
  const grupos = [
    ["tecnico", "Técnicos"],
    ["supervisor", "Supervisores"],
    ["sheq", "SHEQ"]
  ];
  const personas = personasVistaCorreo(grupo);
  const persona = personas.find(item => item.id === personaId) || personas[0] || null;
  const asignaciones = persona
    ? asignacionesSemana.filter(item => idsPersonaPorGrupo(item, grupo).includes(persona.id))
    : [];

  $("vistaCorreoContenido").innerHTML = `
    <div class="correo-navegacion" role="tablist" aria-label="Grupos de programación">
      ${grupos.map(([valor, etiqueta]) => `<button type="button" class="${valor === grupo ? "active" : ""}" data-correo-grupo="${valor}">${etiqueta}</button>`).join("")}
    </div>
    ${personas.length ? `
      <div class="correo-personas" role="tablist" aria-label="Personas del grupo">
        ${personas.map(item => `<button type="button" class="${item.id === persona?.id ? "active" : ""}" data-correo-persona="${escapar(item.id)}">${escapar(nombreUsuario(item))}</button>`).join("")}
      </div>
      <div class="correo-programacion-individual">
        <div class="correo-encabezado"><h3>Programación individual · Semana ${numeroSemana(semanaInicio)}</h3><p>${escapar(nombreUsuario(persona))} · ${escapar(etiquetaRol(persona))} · ${escapar(empresa?.nombre || "Empresa")}</p></div>
        <div class="correo-cuerpo">
          ${asignaciones.length ? asignaciones.map(item => `
            <div class="correo-dia"><strong>${escapar(DIAS[Math.max(0, Math.round((new Date(`${item.fecha}T12:00:00`) - semanaInicio) / 86400000))])} ${escapar(fechaCorta(new Date(`${item.fecha}T12:00:00`)))}</strong><p>${escapar(item.cliente || "Sin cliente")}${detalleOperacionalCorreo(item)}${companerosAsignacionCorreo(item, persona.id)}${item.observaciones ? `<br>${escapar(item.observaciones)}` : ""}</p></div>
          `).join("") : '<div class="correo-vacio">Esta persona todavía no tiene asignaciones durante la semana seleccionada.</div>'}
        </div>
      </div>
    ` : '<div class="correo-vacio">No hay personas disponibles en este grupo.</div>'}
  `;

  $("vistaCorreoContenido").querySelectorAll("[data-correo-grupo]").forEach(boton => {
    boton.addEventListener("click", () => renderVistaCorreo(boton.dataset.correoGrupo));
  });
  $("vistaCorreoContenido").querySelectorAll("[data-correo-persona]").forEach(boton => {
    boton.addEventListener("click", () => renderVistaCorreo(grupo, boton.dataset.correoPersona));
  });
}

function abrirVistaCorreo() {
  renderVistaCorreo("tecnico");
  abrirModal("modalCorreoProgramacion");
}

function configurarInterfaz() {
  $("usuarioNombreProgramacion").textContent = usuario.nombre || usuario.email || "Usuario";
  $("usuarioRolProgramacion").textContent = usuario.rol || "Rol";
  $("accionesEdicionProgramacion").style.display = PUEDE_EDITAR ? "flex" : "none";
  $("menuPanelEmpresaProgramacion").style.display = ["super_admin", "admin_empresa"].includes(usuario.rol) ? "" : "none";
  const esUsuarioSheq = usuario.rol === "sheq";
  const esBodeguero = usuario.rol === "bodeguero";
  $("menuDashboardProgramacion").style.display = esUsuarioSheq || esBodeguero ? "none" : "";
  $("menuOrdenesProgramacion").style.display = esUsuarioSheq || esBodeguero ? "none" : "";
  $("menuSheqProgramacion").style.display = ["sheq", "planificador", "admin_empresa", "admin_sucursal"].includes(usuario.rol) ? "" : "none";
  $("menuInventarioProgramacion").style.display = ["planificador", "admin_empresa", "admin_sucursal", "bodeguero"].includes(usuario.rol) ? "" : "none";
  if (!PUEDE_VER_PROGRAMACION_COMPLETA) {
    grupoActivo = "mi-semana";
    document.querySelectorAll("[data-grupo]").forEach(boton => {
      const esMiSemana = boton.dataset.grupo === "mi-semana";
      boton.hidden = !esMiSemana;
      boton.classList.toggle("active", esMiSemana);
    });
  }

  $("btnSemanaAnterior").addEventListener("click", async () => {
    semanaInicio = sumarDias(semanaInicio, -7);
    await cargarSemana();
  });
  $("btnSemanaSiguiente").addEventListener("click", async () => {
    semanaInicio = sumarDias(semanaInicio, 7);
    await cargarSemana();
  });
  $("btnNuevaAsignacion").addEventListener("click", abrirNuevaAsignacion);
  $("btnVistaCorreo").addEventListener("click", abrirVistaCorreo);
  $("btnPublicarSemana").addEventListener("click", publicarSemana);
  $("formAsignacion").addEventListener("submit", guardarAsignacion);
  $("asignacionFecha").addEventListener("change", () => {
    const ocupados = idsOcupadosEnFecha($("asignacionFecha").value, $("asignacionId").value);
    const seleccionadosDisponibles = idsUsuariosSeleccionados().filter(id => !ocupados.has(id));
    actualizarSelectoresAsignacion({
      usuariosSeleccionados: seleccionadosDisponibles,
      supervisorSeleccionado: $("asignacionSupervisor").value,
      sheqSeleccionado: $("asignacionSheq").value
    });
  });
  $("asignacionGrupo").addEventListener("change", () => actualizarSelectoresAsignacion({
    supervisorSeleccionado: $("asignacionSupervisor").value,
    sheqSeleccionado: $("asignacionSheq").value
  }));
  $("listaAsignacionUsuarios").addEventListener("change", evento => {
    if (!evento.target.matches(".asignacion-usuario-select")) return;
    const repetido = evento.target.value && Array.from(document.querySelectorAll(".asignacion-usuario-select"))
      .some(selector => selector !== evento.target && selector.value === evento.target.value);
    if (repetido) {
      evento.target.value = "";
      alert("Este trabajador ya fue agregado a la asignación.");
    }
    actualizarResumenTrabajadores();
    actualizarAlertaSheqTrabajador();
  });
  $("listaAsignacionUsuarios").addEventListener("click", evento => {
    const boton = evento.target.closest(".btn-quitar-trabajador");
    if (!boton) return;
    boton.closest(".fila-asignacion-usuario")?.remove();
    actualizarResumenTrabajadores();
    actualizarAlertaSheqTrabajador();
  });
  $("btnAgregarTrabajador").addEventListener("click", () => {
    const grupo = $("asignacionGrupo").value || "tecnico";
    const trabajadores = usuariosDisponiblesPorGrupo(usuariosEmpresa, grupo);
    const ocupados = idsOcupadosEnFecha($("asignacionFecha").value, $("asignacionId").value);
    $("listaAsignacionUsuarios").appendChild(crearFilaTrabajador(trabajadores, "", [], true, ocupados));
    $("listaAsignacionUsuarios").lastElementChild?.querySelector("select")?.focus();
  });
  $("btnAgregarOs").addEventListener("click", () => {
    $("listaAsignacionOs").appendChild(crearFilaOs());
    $("listaAsignacionOs").lastElementChild?.querySelector(".asignacion-os-numero")?.focus();
  });
  $("listaAsignacionOs").addEventListener("change", evento => {
    if (!evento.target.matches(".asignacion-os-cerrada")) return;
    evento.target.closest(".fila-asignacion-os")?.classList.toggle("os-cerrada", evento.target.checked);
  });
  $("listaAsignacionOs").addEventListener("click", evento => {
    const boton = evento.target.closest(".btn-quitar-os");
    if (boton) boton.closest(".fila-asignacion-os")?.remove();
  });
  $("asignacionVehiculo").addEventListener("change", actualizarAlertaSheqTrabajador);
  $("asignacionSupervisor").addEventListener("change", actualizarAlertaSheqTrabajador);
  $("asignacionSheq").addEventListener("change", actualizarAlertaSheqTrabajador);
  $("btnEliminarAsignacion").addEventListener("click", eliminarAsignacion);

  document.querySelectorAll("[data-cerrar-modal]").forEach(boton => {
    boton.addEventListener("click", () => cerrarModal(boton.dataset.cerrarModal));
  });
  document.querySelectorAll(".modal-programacion").forEach(modal => {
    modal.addEventListener("click", evento => {
      if (evento.target === modal) cerrarModal(modal.id);
    });
  });
  document.querySelectorAll("[data-grupo]").forEach(boton => {
    boton.addEventListener("click", () => {
      document.querySelectorAll("[data-grupo]").forEach(item => item.classList.remove("active"));
      boton.classList.add("active");
      grupoActivo = boton.dataset.grupo;
      renderCuadro();
    });
  });

  const toggle = document.querySelector(".mobile-menu-toggle");
  const backdrop = document.querySelector(".mobile-menu-backdrop");
  const cerrarMenu = () => document.body.classList.remove("menu-mobile-open");
  toggle?.addEventListener("click", () => document.body.classList.toggle("menu-mobile-open"));
  backdrop?.addEventListener("click", cerrarMenu);
}

window.volverDashboard = () => { window.location.href = "dashboard.html"; };
window.volverOrdenes = () => { window.location.href = "ordenes.html"; };
window.volverSheq = () => { window.location.href = "sheq.html"; };
window.volverInventario = () => { window.location.href = "inventario.html"; };
window.volverPanelEmpresa = () => { window.location.href = `empresa-admin.html?id=${empresaId}`; };
window.cerrarSesionProgramacion = cerrarSesion;

async function iniciar() {
  configurarInterfaz();
  try {
    await auth.authStateReady();
    if (!auth.currentUser) throw new Error("Firebase todavía no reconoce la sesión. Vuelve a iniciar sesión.");
    if (!await cargarEmpresa()) return;
    await cargarUsuariosYSucursales();
    await cargarDocumentosSheq();
    await cargarSemana();
  } catch (error) {
    console.error("Error iniciando Programación semanal:", error);
    const detalle = error?.code === "permission-denied"
      ? "Sin permiso para consultar usuarios"
      : (error.message || "No se pudieron cargar los usuarios");
    if ($("asignacionUsuarios")) $("asignacionUsuarios").innerHTML = `<option value="">${escapar(detalle)}</option>`;
    if ($("asignacionSupervisor")) $("asignacionSupervisor").innerHTML = `<option value="">${escapar(detalle)}</option>`;
    if ($("asignacionSheq")) $("asignacionSheq").innerHTML = `<option value="">${escapar(detalle)}</option>`;
    mostrarMensaje(error.message || "No fue posible cargar el módulo.");
  }
}

iniciar();
