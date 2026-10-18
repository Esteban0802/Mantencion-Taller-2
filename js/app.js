import { protegerPagina, cerrarSesion as cerrarSesionGlobal } from "./session.js?v=20261017-1";

import { db, auth, storage } from "./firebase-config.js";


import {
  getOT as getOTContexto,
  setOT as setOTContexto,
  getListaOTs as getListaOTsContexto,
  NOMBRES_ETAPAS as NOMBRES_ETAPAS_CONTEXTO
} from "./modulos/contexto.js";


import {
  inicializarModuloIngreso
} from "./modulos/ingreso.js?v=20261007-3";


import {
  inicializarModuloEvaluacion
} from "./modulos/evaluacion.js?v=20261007-3";


import {
  inicializarModuloOverhaul
} from "./modulos/overhaul.js?v=20261007-3";


import {
  inicializarModuloPruebas
} from "./modulos/pruebas.js?v=20261007-3";


import {
  inicializarModuloDespacho
} from "./modulos/despacho.js";


import {
  inicializarUtilidades,
  OTBloqueada,
  itemCompleto,
  renderProgresoEtapa
} from "./modulos/core/utilidades.js";


import {
    habilitarTab,
    deshabilitarTab,
    cambiarTab
} from "./modulos/core/tabs.js";


import {
    inicializarPermisos,
    esJefeTaller,
    esUsuarioTaller,
    puedeEliminarComentario,
    aplicarPermisosRol
} from "./modulos/core/permisos.js?v=20261014-1";


import {
    inicializarBitacora,
    agregarBitacora
} from "./modulos/core/bitacora.js";


import {
    subirArchivoStorage,
    eliminarArchivoStorage
} from "./modulos/core/storage.js?v=20261007-4";


import {
    verImagenModal,
    cerrarImagen,
    comprimirImagenBlob
} from "./modulos/core/imagenes.js?v=20261007-1";


import {
    inicializarOTService,
    guardarCambiosOT,
    autoguardarCambiosOT,
    obtenerEstadoOT
} from "./modulos/core/otService.js?v=20261007-2";

import { guardarResumenOT } from "./modulos/core/resumenOT.js";


import {
    inicializarModuloComentarios,
    actualizarAlertaJefe,
    responderComentarioJefe,

    renderComentariosItem,
    renderComentariosEvaluacion,
    renderComentariosDespacho
} from "./modulos/comentarios.js";


import {
    inicializarModuloRepuestos
} from "./modulos/repuestos.js?v=20261017-3";


import {
    inicializarModuloInformePDF
} from "./modulos/informePDF.js?v=20261018-2";


import {
    inicializarModuloGantt,
    recalcularGanttAutomatico,
    renderCartaGantt,
    renderCartaGanttProject,
    actualizarEstadoGanttDesdeChecklist
} from "./modulos/gantt.js?v=20261018-3";


import {
    inicializarModuloUI,
    mostrarAlerta,
    renderUsuarioActivo,
    aplicarModoSoloLectura
} from "./modulos/ui.js";






const usuario = protegerPagina([
  "super_admin",
  "admin_empresa",
  "admin_sucursal",
  "jefe_taller",
  "supervisor",
  "tecnico",
  "planificador"
]);

if (!usuario) throw new Error("Acceso no autorizado");

window.cerrarSesion = function () {
  cerrarSesionGlobal();
};

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  ref,
  getBytes
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

console.log("🔥 Firebase conectado correctamente");
console.log(db);
console.log(auth);
console.log(storage);


console.log("🧩 Contexto Vectaria cargado correctamente", {
  ot: getOTContexto(),
  listaOTs: getListaOTsContexto(),
  etapas: NOMBRES_ETAPAS_CONTEXTO
});


// =======================
// VARIABLES GLOBALES
// =======================
let ot = getOTContexto();
let aprobacionesActivas = true;
let aprobacionesLegadoActivas = true;
let reportesPDFActivos = true;

function notificarFlujo(mensaje, titulo = "Atención", tipo = "advertencia") {
  if (window.OverTrackUI?.mostrarMensaje) {
    return window.OverTrackUI.mostrarMensaje({ titulo, mensaje, tipo });
  }

  window.alert(mensaje);
  return Promise.resolve(true);
}
let ganttActivo = true;
let repuestosActivos = true;
let plantillasMantenimiento = [];
let creacionOTEnCurso = false;
let ordenesInventarioDisponibles = [];
let detenerInventarioTiempoReal = null;
let etapasActivas = {
  ingreso: true,
  evaluacion: true,
  mantencion: true,
  pruebas: true,
  despacho: true
};

const ORDEN_ETAPAS = ["ingreso", "evaluacion", "overhaul", "pruebas", "despacho"];
const MODULO_POR_TAB = {
  ingreso: "ingreso",
  evaluacion: "evaluacion",
  overhaul: "mantencion",
  pruebas: "pruebas",
  despacho: "despacho"
};

function etapaHabilitada(tab) {
  const modulo = MODULO_POR_TAB[tab] || tab;
  return etapasActivas[modulo] !== false;
}

function obtenerEtapasHabilitadas() {
  return { ...etapasActivas };
}

function obtenerSiguienteEtapa(tabActual) {
  const indice = ORDEN_ETAPAS.indexOf(tabActual);
  return ORDEN_ETAPAS.slice(indice + 1).find(etapaHabilitada) || null;
}

function navegarSiguienteEtapa(tabActual) {
  const siguiente = obtenerSiguienteEtapa(tabActual);

  if (!siguiente) {
    notificarFlujo(
      "La etapa quedó completada. La OT ya puede cerrarse desde esta sección por el Jefe de Taller.",
      "Flujo completado",
      "exito"
    );
    return null;
  }

  habilitarTab(siguiente);
  cambiarTab(siguiente);
  return siguiente;
}

function configurarInterfazEtapas() {
  document.querySelectorAll("[data-etapa]").forEach(elemento => {
    const activo = etapaHabilitada(elemento.dataset.etapa);
    if (activo) {
      elemento.style.removeProperty("display");
    } else {
      elemento.style.setProperty("display", "none", "important");
    }
  });

  document.querySelectorAll(".tabs .tab[data-etapa]").forEach((tab, indice) => {
    const numero = tab.querySelector(".tab-dot");
    if (numero && etapaHabilitada(tab.dataset.tab)) {
      const visibles = [...document.querySelectorAll(".tabs .tab[data-etapa]")]
        .filter(item => etapaHabilitada(item.dataset.tab));
      numero.textContent = String(visibles.indexOf(tab) + 2);
    }
  });

  // Crear OT siempre ocupa una posición; las demás columnas corresponden
  // únicamente a las etapas operativas visibles.
  const timeline = document.querySelector(".tabs-timeline-pro");
  if (timeline) {
    const etapasVisibles = ORDEN_ETAPAS.filter(etapaHabilitada).length;
    timeline.style.setProperty("--columnas-flujo", String(etapasVisibles + 1));
  }

  const evaluacionRechazada =
    etapaHabilitada("evaluacion") &&
    ot?.evaluacionAprobada === true &&
    ot?.overhaulRequerido === false;
  const ultimaEtapa = evaluacionRechazada
    ? (etapaHabilitada("despacho") ? "despacho" : "evaluacion")
    : ([...ORDEN_ETAPAS].reverse().find(etapaHabilitada) || null);
  document.querySelectorAll("[data-cierre-etapa]").forEach(boton => {
    const visible = esJefeTaller() && boton.dataset.cierreEtapa === ultimaEtapa;
    if (visible) {
      boton.style.removeProperty("display");
    } else {
      boton.style.setProperty("display", "none", "important");
    }
  });
}

function aprobacionEtapaHabilitada(etapa) {
  if (!aprobacionesActivas || etapa === "ingreso") return false;
  if (ot?.aprobacionesPorEtapa && typeof ot.aprobacionesPorEtapa === "object") {
    return ot.aprobacionesPorEtapa[etapa] === true;
  }
  // Compatibilidad con OT anteriores a la configuración por etapa.
  return aprobacionesLegadoActivas && ["evaluacion", "pruebas"].includes(etapa);
}

function aprobacionesHabilitadas(etapa = "") {
  return etapa ? aprobacionEtapaHabilitada(etapa) : aprobacionesActivas;
}

function obtenerAprobacionesSeleccionadas() {
  return Object.fromEntries(["evaluacion", "mantencion", "pruebas", "despacho"].map(etapa => [
    etapa,
    Boolean(document.querySelector(`[data-aprobacion-etapa="${etapa}"]`)?.checked)
  ]));
}

function actualizarResumenAprobaciones() {
  const seleccionadas = Object.entries(obtenerAprobacionesSeleccionadas())
    .filter(([, activa]) => activa)
    .map(([etapa]) => ({ evaluacion: "Evaluación", mantencion: "Mantención", pruebas: "Pruebas", despacho: "Despacho" }[etapa]));
  const resumen = document.getElementById("resumenAprobacionesOT");
  if (resumen) resumen.textContent = seleccionadas.length ? seleccionadas.join(", ") : "Sin aprobaciones";
}

function renderDecisionEtapa(etapa) {
  const nombres = { mantencion: "Mantención", pruebas: "Pruebas", despacho: "Despacho" };
  const campos = { mantencion: "decisionMantencion", pruebas: "decisionPruebas", despacho: "decisionDespacho" };
  const contenedor = document.getElementById(`decision${nombres[etapa]?.replace("ó", "o")}Guardada`);
  const decision = ot?.[campos[etapa]];
  if (!contenedor) return;
  contenedor.replaceChildren();
  if (!decision) return;

  const tarjeta = document.createElement("div");
  tarjeta.className = "decision-evaluacion-guardada";
  const resultado = document.createElement("strong");
  resultado.textContent = decision.resultado || "-";
  const detalle = document.createElement("span");
  detalle.textContent = `${decision.usuario || "-"} · ${decision.fecha || "-"}`;
  const comentario = document.createElement("p");
  comentario.textContent = decision.comentario || "-";
  const evidencias = document.createElement("small");
  evidencias.textContent = `${decision.documentos?.length || 0} evidencia(s)`;
  tarjeta.append(resultado, detalle, comentario, evidencias);
  contenedor.appendChild(tarjeta);
}

function reportesPDFHabilitados() {
  return reportesPDFActivos;
}

function ganttHabilitado() {
  return ganttActivo;
}

function repuestosHabilitados() {
  return repuestosActivos;
}

function actualizarOpcionesAprobacionPorPlantilla() {
  const selectorAprobaciones = document.getElementById("configAprobacionesOT");
  const plantillaId = document.getElementById("gamaEquipo")?.value || "";
  const plantilla = plantillasMantenimiento.find(item => item.id === plantillaId);
  const etapasDisponibles = {
    evaluacion: normalizarChecklistPlantilla(plantilla?.checklists?.evaluacion).length > 0,
    mantencion: normalizarChecklistPlantilla(plantilla?.checklists?.mantencion).length > 0,
    pruebas: normalizarChecklistPlantilla(plantilla?.checklists?.pruebas).length > 0,
    despacho: plantilla?.etapasHabilitadas?.despacho === true
  };

  let cantidadDisponibles = 0;
  document.querySelectorAll("[data-aprobacion-etapa]").forEach(campo => {
    const etapa = campo.dataset.aprobacionEtapa;
    const disponible = Boolean(plantilla && etapasDisponibles[etapa] && etapasActivas[etapa] !== false);
    const contenedor = campo.closest("label");
    if (contenedor) contenedor.hidden = !disponible;
    if (!disponible) campo.checked = false;
    if (disponible) cantidadDisponibles += 1;
  });

  if (selectorAprobaciones) {
    selectorAprobaciones.hidden = !(
      aprobacionesActivas &&
      esJefeTaller() &&
      !ot?.id &&
      plantilla &&
      cantidadDisponibles > 0
    );
    if (selectorAprobaciones.hidden) selectorAprobaciones.open = false;
  }
  actualizarResumenAprobaciones();
}

function configurarInterfazAprobaciones() {
  actualizarOpcionesAprobacionPorPlantilla();
  const decisionEvaluacion = document.getElementById("decisionEvaluacionJefe");
  const continuarEvaluacion = document.getElementById("btnContinuarEvaluacionSinAprobacion");
  const decisionMantencion = document.getElementById("decisionMantencionJefe");
  const continuarMantencion = document.getElementById("btnContinuarMantencionSinAprobacion");
  const decisionPruebas = document.getElementById("decisionPruebasJefe");
  const finalizarPruebas = document.getElementById("btnFinalizarPruebasSinAprobacion");
  const decisionDespacho = document.getElementById("decisionDespachoJefe");

  const requiereEvaluacion = aprobacionEtapaHabilitada("evaluacion");
  const requiereMantencion = aprobacionEtapaHabilitada("mantencion");
  const requierePruebas = aprobacionEtapaHabilitada("pruebas");
  const requiereDespacho = aprobacionEtapaHabilitada("despacho");
  if (decisionEvaluacion) decisionEvaluacion.style.display = requiereEvaluacion ? "" : "none";
  if (continuarEvaluacion) continuarEvaluacion.style.display = requiereEvaluacion ? "none" : "inline-flex";
  if (decisionMantencion) decisionMantencion.hidden = !requiereMantencion;
  if (continuarMantencion) continuarMantencion.style.display = requiereMantencion ? "none" : "inline-flex";
  if (decisionPruebas) decisionPruebas.hidden = !requierePruebas;
  if (finalizarPruebas) finalizarPruebas.style.display = requierePruebas ? "none" : "inline-flex";
  if (decisionDespacho) decisionDespacho.hidden = !requiereDespacho;
  renderDecisionEtapa("mantencion");
  renderDecisionEtapa("pruebas");
  renderDecisionEtapa("despacho");
}

function validarEtapaParaDecision(etapa) {
  const listas = {
    mantencion: ot?.overhaul || [],
    pruebas: Array.isArray(ot?.pruebas) ? ot.pruebas : (ot?.pruebas?.general || [])
  };
  if (etapa === "despacho") {
    if (!ot?.despacho?.preparacion?.length || !ot?.despacho?.final?.length) {
      notificarFlujo("Debes completar la documentación de preparación y despacho final.", "Despacho incompleto", "advertencia");
      return false;
    }
    return true;
  }
  const lista = listas[etapa];
  if (!Array.isArray(lista) || !lista.length) {
    notificarFlujo("La etapa no contiene actividades para revisar.", "Checklist incompleto", "advertencia");
    return false;
  }
  const pendiente = lista.findIndex(item => !itemCompleto(item));
  if (pendiente >= 0) {
    notificarFlujo(`Debes completar la actividad ${pendiente + 1}, incluyendo evidencia y comentario técnico.`, "Checklist incompleto", "advertencia");
    return false;
  }
  return true;
}

async function registrarDecisionEtapa(etapa, resultado) {
  if (!ot || OTBloqueada() || !aprobacionEtapaHabilitada(etapa)) return;
  if (!esJefeTaller()) {
    await notificarFlujo("Solo el Jefe de Taller puede registrar esta decisión.", "Acceso restringido", "advertencia");
    return;
  }
  if (!validarEtapaParaDecision(etapa)) return;
  const sufijos = { mantencion: "Mantencion", pruebas: "Pruebas", despacho: "Despacho" };
  const camposDecision = { mantencion: "decisionMantencion", pruebas: "decisionPruebas", despacho: "decisionDespacho" };
  const camposAprobado = { mantencion: "overhaulAprobado", pruebas: "pruebasAprobado", despacho: "despachoAprobado" };
  const tabs = { mantencion: "overhaul", pruebas: "pruebas", despacho: "despacho" };
  const sufijo = sufijos[etapa];
  const comentario = document.getElementById(`comentarioDecision${sufijo}`)?.value.trim();
  const archivos = [...(document.getElementById(`docsDecision${sufijo}`)?.files || [])];
  if (!comentario || !archivos.length) {
    await notificarFlujo("Ingresa un comentario y adjunta al menos una evidencia.", "Antecedentes obligatorios", "advertencia");
    return;
  }
  const botones = [...document.querySelectorAll(`#decision${sufijo}Jefe button`)];
  botones.forEach(boton => { boton.disabled = true; });
  const campoDecision = camposDecision[etapa];
  const campoAprobado = camposAprobado[etapa];
  const anterior = { decision: ot[campoDecision], aprobado: ot[campoAprobado], estado: ot.estado };
  const urls = [];
  try {
    const documentos = [];
    for (const archivo of archivos) {
      const url = await subirArchivoStorage(archivo, `decision_${etapa}_${resultado.toLowerCase()}`, "documentos");
      urls.push(url);
      documentos.push({ nombre: archivo.name, tipo: archivo.type, url, fecha: new Date().toLocaleString("es-CL") });
    }
    ot[campoDecision] = {
      resultado,
      comentario,
      documentos,
      usuario: usuario?.nombre || "Jefe Taller",
      rol: usuario?.rol || "jefe_taller",
      fecha: new Date().toLocaleString("es-CL")
    };
    ot[campoAprobado] = resultado === "APROBADO";
    ot.estado = obtenerEstadoOT(ot);
    agregarBitacora(`Etapa ${resultado === "APROBADO" ? "aprobada" : "rechazada"}`, `${sufijo}: ${comentario}`);
    const guardado = await guardarCambiosOT();
    if (!guardado) throw new Error("No fue posible guardar la decisión.");
    configurarInterfazAprobaciones();
    if (resultado === "APROBADO" && etapa !== "despacho") navegarSiguienteEtapa(tabs[etapa]);
    await notificarFlujo(
      resultado === "APROBADO"
        ? (etapa === "despacho" ? "Despacho aprobado. La OT ya puede cerrarse." : `${sufijo} aprobada. Se habilitó la siguiente etapa.`)
        : `${sufijo} rechazada. La etapa queda pendiente para realizar correcciones.`,
      resultado === "APROBADO" ? "Aprobación registrada" : "Etapa rechazada",
      resultado === "APROBADO" ? "exito" : "advertencia"
    );
  } catch (error) {
    await Promise.allSettled(urls.map(url => eliminarArchivoStorage(url)));
    ot[campoDecision] = anterior.decision;
    ot[campoAprobado] = anterior.aprobado;
    ot.estado = anterior.estado;
    console.error("No fue posible registrar la decisión:", error);
    await notificarFlujo(error.message || "Intenta nuevamente.", "No se pudo guardar", "error");
  } finally {
    botones.forEach(boton => { boton.disabled = false; });
  }
}

window.registrarDecisionEtapa = registrarDecisionEtapa;

function configurarInterfazReportesPDF() {
  const botonInforme = document.getElementById("btnGenerarInformePDF");

  if (botonInforme) {
    const intervencionOmitida =
      ot?.evaluacionAprobada === true &&
      ot?.overhaulRequerido === false;

    const ultimaEtapaActiva = [...ORDEN_ETAPAS]
      .reverse()
      .find(etapa => {
        if (intervencionOmitida && (etapa === "overhaul" || etapa === "pruebas")) {
          return false;
        }

        return etapaHabilitada(etapa);
      });

    const contenedorDestino = ultimaEtapaActiva
      ? document.querySelector(`#${ultimaEtapaActiva} > .card`)
      : document.querySelector("#crear > .card");

    if (contenedorDestino && botonInforme.parentElement !== contenedorDestino) {
      contenedorDestino.appendChild(botonInforme);
    }
  }

  document.querySelectorAll("[data-modulo-reportes-pdf]").forEach(elemento => {
    if (reportesPDFActivos) {
      elemento.style.removeProperty("display");
      return;
    }

    elemento.style.setProperty("display", "none", "important");
  });
}

function configurarInterfazGantt() {
  document.querySelectorAll("[data-modulo-gantt]").forEach(elemento => {
    if (ganttActivo) {
      elemento.style.removeProperty("display");
      return;
    }

    elemento.style.setProperty("display", "none", "important");
  });
  document.querySelectorAll("[data-gantt-edicion]").forEach(elemento => {
    elemento.hidden = !esJefeTaller();
  });
}

function configurarInterfazRepuestos() {
  document.querySelectorAll("[data-modulo-repuestos]").forEach(elemento => {
    if (repuestosActivos) {
      elemento.style.removeProperty("display");
      return;
    }

    elemento.style.setProperty("display", "none", "important");
  });
}

async function cargarConfiguracionAprobaciones() {
  const empresaId = ot?.empresaId || usuario?.empresaId;
  if (!empresaId) {
    aprobacionesActivas = true;
    aprobacionesLegadoActivas = true;
    reportesPDFActivos = true;
    ganttActivo = true;
    repuestosActivos = true;
    etapasActivas = { ingreso: true, evaluacion: true, mantencion: true, pruebas: true, despacho: true };
    configurarInterfazAprobaciones();
    configurarInterfazReportesPDF();
    configurarInterfazGantt();
    configurarInterfazRepuestos();
    configurarInterfazEtapas();
    return;
  }

  try {
    const empresaSnap = await getDoc(doc(db, "empresas", empresaId));
    const modulosEmpresa = empresaSnap.exists()
      ? empresaSnap.data()?.modulos || {}
      : {};

    // Las OT nuevas ya no dependen de un módulo global de la empresa.
    // El valor histórico solo se conserva para OT antiguas sin configuración por etapa.
    aprobacionesActivas = true;
    aprobacionesLegadoActivas = modulosEmpresa.aprobaciones !== false;
    reportesPDFActivos = modulosEmpresa.reportesPDF !== false;
    ganttActivo = modulosEmpresa.gantt !== false;
    repuestosActivos = modulosEmpresa.repuestos !== false;
    etapasActivas = {
      ingreso: modulosEmpresa.ingreso !== false,
      evaluacion: modulosEmpresa.evaluacion !== false,
      mantencion: modulosEmpresa.mantencion !== false,
      pruebas: modulosEmpresa.pruebas !== false,
      despacho: modulosEmpresa.despacho !== false
    };
  } catch (error) {
    console.error("No fue posible consultar la configuración de módulos:", error);
    aprobacionesActivas = true;
    aprobacionesLegadoActivas = true;
    reportesPDFActivos = true;
    ganttActivo = true;
    repuestosActivos = true;
    etapasActivas = { ingreso: true, evaluacion: true, mantencion: true, pruebas: true, despacho: true };
  }

  configurarInterfazAprobaciones();
  configurarInterfazReportesPDF();
  configurarInterfazGantt();
  configurarInterfazRepuestos();
  configurarInterfazEtapas();
}


inicializarUtilidades({
    getOT: () => ot
});

inicializarPermisos({
    getUsuario: () => usuario
});

inicializarBitacora({
    getOT: () => ot,
    getUsuario: () => usuario
});

inicializarOTService({
    getOT: () => ot,
    renderHeaderOTPro,
    getEtapasHabilitadas: obtenerEtapasHabilitadas
});



// =======================
// VALIDAR ROLES
// =======================


// =======================
// TABS
// =======================
document.addEventListener("DOMContentLoaded", () => {

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {

      if (tab.classList.contains("disabled")) return;

      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".content").forEach(c => c.classList.remove("active"));

      tab.classList.add("active");
      document.getElementById(tab.dataset.tab).classList.add("active");
    });
  });

});

// =======================
// CREAR / EDITAR OT
// =======================
function generarNumeroOTGenerico() {
  const ahora = new Date();
  const fecha = [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, "0"),
    String(ahora.getDate()).padStart(2, "0")
  ].join("");
  const sufijo = Date.now().toString(36).slice(-5).toUpperCase();

  return `OT-AUTO-${fecha}-${sufijo}`;
}

const claveBorradorIdentificacion =
  `overtrack:borrador-ot:${usuario.empresaId || "sin-empresa"}:${usuario.uid || "sin-usuario"}`;

function guardarBorradorIdentificacion() {
  if (ot?.id || localStorage.getItem("otActiva")) return;
  const borrador = {};
  ["equipo", "serie", "gamaEquipo", "cliente", "os"].forEach(id => {
    borrador[id] = document.getElementById(id)?.value || "";
  });
  borrador.fecha = Date.now();
  localStorage.setItem(claveBorradorIdentificacion, JSON.stringify(borrador));
}

function restaurarBorradorIdentificacion() {
  if (ot?.id || localStorage.getItem("otActiva")) return;
  try {
    const borrador = JSON.parse(localStorage.getItem(claveBorradorIdentificacion) || "null");
    if (!borrador || Date.now() - Number(borrador.fecha || 0) > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(claveBorradorIdentificacion);
      return;
    }
    ["equipo", "serie", "cliente", "os"].forEach(id => {
      const campo = document.getElementById(id);
      if (campo && !campo.value) campo.value = borrador[id] || "";
    });
    const selector = document.getElementById("gamaEquipo");
    if (selector && [...selector.options].some(opcion => opcion.value === borrador.gamaEquipo)) {
      selector.value = borrador.gamaEquipo;
    }
  } catch (error) {
    console.warn("No fue posible restaurar el borrador de la OT:", error);
    localStorage.removeItem(claveBorradorIdentificacion);
  }
}

function cargarDatosIdentificacionOT() {
  if (!ot) return;

  const campos = {
    equipo: ot.equipo || "",
    serie: ot.serie || "",
    gamaEquipo: ot.gamaEquipo || "",
    cliente: ot.cliente || "",
    os: ot.os || ""
  };

  Object.entries(campos).forEach(([id, valor]) => {
    const input = document.getElementById(id);
    if (input) input.value = valor;
  });

  const boton = document.getElementById("btnGuardarDatosOT");
  if (boton) boton.textContent = "Guardar cambios";

  const selectorGama = document.getElementById("gamaEquipo");
  if (selectorGama) selectorGama.disabled = true;
}

function normalizarChecklistPlantilla(items) {
  return (Array.isArray(items) ? items : []).map(item => ({
    item: String(item?.item || item || "").trim(),
    ok: false,
    fotos: [],
    comentarios: [],
    fecha: null
  })).filter(item => item.item);
}

async function cargarGamasDisponibles() {
  const selector = document.getElementById("gamaEquipo");
  if (!selector || !usuario?.empresaId) return;

  try {
    const consulta = query(
      collection(db, "plantillasMantenimiento"),
      where("empresaId", "==", usuario.empresaId)
    );
    const snapshot = await getDocs(consulta);
    plantillasMantenimiento = snapshot.docs
      .map(documento => ({ id: documento.id, ...documento.data() }))
      .filter(plantilla => plantilla.activa !== false)
      .sort((a, b) => String(a.gama || "").localeCompare(String(b.gama || ""), "es"));

    selector.innerHTML = '<option value="">Seleccionar gama de equipo</option>';
    plantillasMantenimiento.forEach(plantilla => {
      const opcion = document.createElement("option");
      opcion.value = plantilla.id;
      opcion.textContent = String(plantilla.gama || "Gama sin nombre");
      selector.appendChild(opcion);
    });

    if (ot?.plantillaMantenimientoId) selector.value = ot.plantillaMantenimientoId;
    if (!plantillasMantenimiento.length) {
      document.getElementById("ayudaGamaEquipo").textContent =
        "No existen gamas con una plantilla activa. Solicita al administrador que configure una.";
    }
    actualizarOpcionesAprobacionPorPlantilla();
  } catch (error) {
    console.error("No fue posible cargar las gamas de equipo:", error);
    selector.innerHTML = '<option value="">No fue posible cargar las gamas</option>';
  }
}

async function cargarOSInventarioDisponibles() {
  const lista = document.getElementById("osInventarioOpciones");
  if (!lista || !usuario?.empresaId || !usuario?.sucursalId) return;

  try {
    const snapshot = await getDocs(query(
      collection(db, "inventarioItems"),
      where("empresaId", "==", usuario.empresaId),
      where("sucursalId", "==", usuario.sucursalId)
    ));
    actualizarOrdenesInventarioDesdeSnapshot(snapshot);
  } catch (error) {
    console.warn("No fue posible cargar las OS disponibles desde Inventario:", error);
    ordenesInventarioDisponibles = [];
    lista.replaceChildren();
  }
}

function actualizarOrdenesInventarioDesdeSnapshot(snapshot) {
    const ordenes = new Map();
    snapshot.docs.forEach(documento => {
      const registro = documento.data() || {};
      const datos = registro.datos || {};
      const numero = String(datos.OS || "").trim();
      if (!numero) return;
      const clave = numero.toLocaleLowerCase("es");
      if (!ordenes.has(clave)) {
        ordenes.set(clave, {
          numero,
          cliente: String(datos.CLIENTE || "").trim(),
          equipo: String(datos.EQUIPO || "").trim(),
          serie: String(datos.SERIE || "").trim(),
          repuestos: []
        });
      }
      ordenes.get(clave).repuestos.push({
        inventarioItemId: documento.id,
        codigo: String(datos.NP || "").trim(),
        descripcion: String(datos.DESCRIPCION || "").trim(),
        cantidad: String(datos.CANTIDAD ?? "").trim(),
        recibidoInventario: registro.recibido === true
      });
    });

    ordenesInventarioDisponibles = [...ordenes.values()]
      .sort((a, b) => a.numero.localeCompare(b.numero, "es", { numeric: true }));
    renderOpcionesOSInventario();
}

function iniciarInventarioTiempoReal() {
  if (!usuario?.empresaId || !usuario?.sucursalId) return;

  detenerInventarioTiempoReal?.();
  const consulta = query(
    collection(db, "inventarioItems"),
    where("empresaId", "==", usuario.empresaId),
    where("sucursalId", "==", usuario.sucursalId)
  );

  detenerInventarioTiempoReal = onSnapshot(consulta, snapshot => {
    actualizarOrdenesInventarioDesdeSnapshot(snapshot);

    if (!ot?.os) return;
    const listado = crearListadoRepuestosInventario(ot.os, ot.repuestos);
    if (!listado) return;

    ot.repuestos = listado;
    const visualGantt = document.getElementById("modalGanttVisual");
    if (visualGantt && visualGantt.style.display !== "none") {
      renderCartaGanttProject();
    }
  }, error => {
    console.warn("No fue posible mantener Inventario actualizado en tiempo real:", error);
  });
}

function normalizarBusquedaOS(valor = "") {
  return String(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function renderOpcionesOSInventario(filtro = "") {
  const lista = document.getElementById("osInventarioOpciones");
  const vacio = document.getElementById("osInventarioVacio");
  if (!lista) return;
  const busqueda = normalizarBusquedaOS(filtro);
  const resultados = ordenesInventarioDisponibles.filter(orden =>
    !busqueda || normalizarBusquedaOS([orden.numero, orden.cliente, orden.equipo, orden.serie].join(" ")).includes(busqueda)
  );

  lista.replaceChildren();
  resultados.forEach(orden => {
    const opcion = document.createElement("button");
    opcion.type = "button";
    opcion.className = "os-inventory-option";
    opcion.setAttribute("role", "option");
    const numero = document.createElement("strong");
    numero.textContent = orden.numero;
    const detalle = document.createElement("small");
    detalle.textContent = [
      orden.cliente,
      orden.equipo,
      orden.serie,
      `${orden.repuestos.length} repuesto${orden.repuestos.length === 1 ? "" : "s"}`
    ].filter(Boolean).join(" · ");
    opcion.append(numero, detalle);
    opcion.addEventListener("click", () => {
      const input = document.getElementById("os");
      if (input) {
        input.value = orden.numero;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      cerrarSelectorOSInventario();
    });
    lista.appendChild(opcion);
  });
  if (vacio) vacio.hidden = resultados.length > 0;
}

function abrirSelectorOSInventario({ mostrarTodo = false } = {}) {
  const panel = document.getElementById("osInventarioPanel");
  const input = document.getElementById("os");
  const boton = document.getElementById("btnAlternarOSInventario");
  if (!panel || !input) return;
  renderOpcionesOSInventario(mostrarTodo ? "" : input.value);
  panel.hidden = false;
  input.setAttribute("aria-expanded", "true");
  boton?.setAttribute("aria-expanded", "true");
}

function cerrarSelectorOSInventario() {
  const panel = document.getElementById("osInventarioPanel");
  const input = document.getElementById("os");
  const boton = document.getElementById("btnAlternarOSInventario");
  if (panel) panel.hidden = true;
  input?.setAttribute("aria-expanded", "false");
  boton?.setAttribute("aria-expanded", "false");
}

function configurarSelectorOSInventario() {
  const selector = document.getElementById("selectorOSInventario");
  const input = document.getElementById("os");
  const boton = document.getElementById("btnAlternarOSInventario");
  const panel = document.getElementById("osInventarioPanel");
  if (!selector || !input || !boton || !panel) return;

  input.addEventListener("focus", () => abrirSelectorOSInventario({ mostrarTodo: true }));
  input.addEventListener("input", () => abrirSelectorOSInventario());
  boton.addEventListener("click", () => {
    if (panel.hidden) {
      abrirSelectorOSInventario({ mostrarTodo: true });
      input.focus();
    } else {
      cerrarSelectorOSInventario();
    }
  });
  document.addEventListener("click", evento => {
    if (!selector.contains(evento.target)) cerrarSelectorOSInventario();
  });
  selector.addEventListener("keydown", evento => {
    if (evento.key === "Escape") cerrarSelectorOSInventario();
  });
}

function crearListadoRepuestosInventario(numeroOS, repuestosActuales = null) {
  const clave = normalizarBusquedaOS(numeroOS);
  const orden = ordenesInventarioDisponibles.find(item => normalizarBusquedaOS(item.numero) === clave);
  if (!orden?.repuestos?.length) return null;

  const anteriores = Array.isArray(repuestosActuales?.items) ? repuestosActuales.items : [];
  const buscarAnterior = repuesto => anteriores.find(item =>
    (repuesto.inventarioItemId && item.inventarioItemId === repuesto.inventarioItemId) ||
    (!repuesto.inventarioItemId && normalizarBusquedaOS(item.codigo) === normalizarBusquedaOS(repuesto.codigo))
  );
  const items = orden.repuestos.map(repuesto => {
    const anterior = buscarAnterior(repuesto);
    return {
      ...repuesto,
      usado: repuesto.recibidoInventario === true && anterior?.usado === true,
      comentario: String(anterior?.comentario || ""),
      tecnico: String(anterior?.tecnico || ""),
      fecha: String(anterior?.fecha || "")
    };
  });

  return {
    items,
    origen: "inventario",
    inventarioOS: orden.numero,
    cargadoPor: repuestosActuales?.cargadoPor || "Inventario",
    fechaCarga: repuestosActuales?.fechaCarga || new Date().toLocaleString("es-CL")
  };
}

async function sincronizarRepuestosInventarioOT() {
  if (!ot?.os) return null;
  if (!ordenesInventarioDisponibles.length) {
    await cargarOSInventarioDisponibles();
  }
  const listado = crearListadoRepuestosInventario(ot.os, ot.repuestos);
  if (listado) ot.repuestos = listado;
  return listado;
}

async function guardarDatosOS() {

  if (!esJefeTaller()) {
    await notificarFlujo(
      "Solo el Jefe de Taller puede modificar los datos de identificación de la OT.",
      "Acceso restringido",
      "advertencia"
    );
    return;
  }

  const equipo = document.getElementById("equipo").value.trim();
  const serie = document.getElementById("serie").value.trim();
  const plantillaId = document.getElementById("gamaEquipo")?.value || "";
  const cliente = document.getElementById("cliente").value.trim();
  const osIngresada = document.getElementById("os").value.trim();

  if (!equipo || !serie || !cliente || (!ot?.id && !plantillaId)) {
    notificarFlujo("Completa equipo, serie, gama y cliente para continuar.", "Datos obligatorios", "advertencia");
    return;
  }

  if (OTBloqueada()) {
    notificarFlujo("La OT está cerrada y solo puede consultarse.", "OT en modo de consulta", "info");
    return;
  }

  // Si ya existe una OT, este formulario edita únicamente sus datos de
  // identificación y conserva intacto todo el avance operacional.
  if (ot?.id) {
    if (creacionOTEnCurso) return;
    creacionOTEnCurso = true;
    const botonGuardarDatos = document.getElementById("btnGuardarDatosOT");
    const datosAnteriores = {
      equipo: ot.equipo,
      serie: ot.serie,
      cliente: ot.cliente,
      os: ot.os,
      osGenerica: ot.osGenerica,
      repuestos: ot.repuestos
    };

    if (botonGuardarDatos) {
      botonGuardarDatos.disabled = true;
      botonGuardarDatos.textContent = "Guardando...";
    }

    try {
      ot.equipo = equipo;
      ot.serie = serie;
      ot.cliente = cliente;
      // Si el Jefe de Taller elimina la OS, se reemplaza por una nueva OS
      // automática. No se debe recuperar silenciosamente el número anterior.
      ot.os = osIngresada || generarNumeroOTGenerico();
      ot.osGenerica = !osIngresada;
      const repuestosInventario = crearListadoRepuestosInventario(ot.os, ot.repuestos);
      if (repuestosInventario) {
        ot.repuestos = repuestosInventario;
      } else if (ot.repuestos?.origen === "inventario" && normalizarBusquedaOS(ot.repuestos.inventarioOS) !== normalizarBusquedaOS(ot.os)) {
        delete ot.repuestos;
      }

      const guardado = await guardarCambiosOT();
      if (!guardado) {
        Object.assign(ot, datosAnteriores);
        cargarDatosIdentificacionOT();
        renderHeaderOTPro();
        return;
      }

      setOTContexto(ot);
      cargarDatosIdentificacionOT();
      renderHeaderOTPro();
      await notificarFlujo("Los datos de la OT se actualizaron correctamente.", "Cambios guardados", "exito");
    } finally {
      creacionOTEnCurso = false;
      if (botonGuardarDatos) {
        botonGuardarDatos.disabled = false;
        botonGuardarDatos.textContent = "Guardar cambios";
      }
    }
    return;
  }

  const os = osIngresada || generarNumeroOTGenerico();
  const repuestosInventario = crearListadoRepuestosInventario(os);
  const plantilla = plantillasMantenimiento.find(item => item.id === plantillaId);
  if (!plantilla) {
    notificarFlujo("La gama seleccionada no tiene una plantilla activa disponible.", "Plantilla no disponible", "error");
    return;
  }
  const checklists = plantilla.checklists || {};
  const etapasOT = { ...etapasActivas };
  const etapasChecklist = [
    { key: "ingreso", nombre: "Ingreso" },
    { key: "evaluacion", nombre: "Evaluación" },
    { key: "mantencion", nombre: "Mantención" },
    { key: "pruebas", nombre: "Pruebas" }
  ];
  const etapasFaltantes = etapasChecklist
    .filter(etapa => etapasOT[etapa.key] && !normalizarChecklistPlantilla(checklists[etapa.key]).length)
    .map(etapa => etapa.nombre);

  if (etapasFaltantes.length) {
    notificarFlujo(
      `La plantilla seleccionada no contiene las etapas activas: ${etapasFaltantes.join(", ")}. El administrador debe actualizarla.`,
      "Plantilla incompleta",
      "error"
    );
    return;
  }

  if (creacionOTEnCurso) return;
  creacionOTEnCurso = true;
  const botonGuardarDatos = document.getElementById("btnGuardarDatosOT");
  if (botonGuardarDatos) {
    botonGuardarDatos.disabled = true;
    botonGuardarDatos.textContent = "Creando OT...";
  }

  const estadoInicial = ORDEN_ETAPAS
    .filter(etapaHabilitada)
    .map(etapa => ({
      ingreso: "INGRESO",
      evaluacion: "EVALUACION",
      overhaul: "OVERHAUL",
      pruebas: "PRUEBAS",
      despacho: "DESPACHO"
    }[etapa]))
    .find(Boolean) || "INGRESO";

  try {

    const nuevaOT = {
      equipo,
      serie,
      cliente,
      os,
      osGenerica: !osIngresada,

      gamaEquipo: plantilla.gama,
      plantillaMantenimientoId: plantilla.id,
      plantillaMantenimientoNombre: plantilla.nombre,
      plantillaMantenimientoVersion: Number(plantilla.version || 1),
      aprobacionesPorEtapa: aprobacionesActivas && esJefeTaller()
        ? obtenerAprobacionesSeleccionadas()
        : { evaluacion: false, mantencion: false, pruebas: false, despacho: false },
      etapasConActividad: {
        evaluacion: false,
        mantencion: false,
        pruebas: false,
        despacho: false
      },

      empresaId: usuario.empresaId,
      sucursalId: usuario.sucursalId,
      creadoPor: usuario.uid,
      creadoPorNombre: usuario.nombre,
      creadoPorRol: usuario.rol,

      estado: estadoInicial,

      etapasHabilitadas: etapasOT,


      ingreso: etapasOT.ingreso ? normalizarChecklistPlantilla(checklists.ingreso) : [],
      evaluacion: etapasOT.evaluacion ? normalizarChecklistPlantilla(checklists.evaluacion) : [],
      overhaul: etapasOT.mantencion ? normalizarChecklistPlantilla(checklists.mantencion) : [],
      pruebas: {
        general: etapasOT.pruebas ? normalizarChecklistPlantilla(checklists.pruebas) : []
      },
      despacho: null,
      ...(repuestosInventario ? { repuestos: repuestosInventario } : {}),

      ingresoAprobado: false,
      evaluacionAprobada: false,
      overhaulAprobado: false,
      pruebasAprobado: false,
      despachoAprobado: false,

      cerrada: false,

      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp()
    };

    const claveCreacionPendiente = `overtrack:creacion-ot:${usuario.empresaId}:${usuario.uid}`;
    const idPendiente = sessionStorage.getItem(claveCreacionPendiente);
    const docRef = idPendiente
      ? doc(db, "ots", idPendiente)
      : doc(collection(db, "ots"));

    sessionStorage.setItem(claveCreacionPendiente, docRef.id);
    await setDoc(docRef, nuevaOT);
    await guardarResumenOT(docRef.id, nuevaOT, { actualizarFecha: false }).catch(error => {
      console.warn("La OT fue creada, pero su resumen se sincronizará más adelante.", error);
    });
    sessionStorage.removeItem(claveCreacionPendiente);
    localStorage.removeItem(claveBorradorIdentificacion);

    localStorage.setItem("otActiva", docRef.id);

    await notificarFlujo(
      osIngresada
        ? "OT creada correctamente ✅"
        : `OT creada correctamente con el número automático ${os} ✅`,
      "OT creada",
      "exito"
    );

    window.location.href = "flujo.html";

  } catch (error) {
    console.error("Error creando OT:", error);
    notificarFlujo("No fue posible crear la OT. Intenta nuevamente.", "Error al crear la OT", "error");
  } finally {
    creacionOTEnCurso = false;
    if (botonGuardarDatos) {
      botonGuardarDatos.disabled = false;
      botonGuardarDatos.textContent = "Siguiente";
    }
  }
}

inicializarModuloComentarios({

    getOT: () => ot,
    getUsuario: () => usuario,

    guardarCambiosOT,
    OTBloqueada,

    esJefeTaller,
    esUsuarioTaller,
    puedeEliminarComentario,

    agregarBitacora,

    renderIngreso: () =>
        window.renderIngreso?.(),

    renderEvaluacion: () =>
        window.renderEvaluacion?.(),

    renderOverhaul: () =>
        window.renderOverhaul?.(),

    renderChecklist: tipo =>
        window.renderChecklist?.(tipo)
});


inicializarModuloRepuestos({

    getOT: () => ot,
    getUsuario: () => usuario,

    guardarCambiosOT,

    OTBloqueada,
    esJefeTaller,
    repuestosHabilitados,
    sincronizarRepuestosInventario: sincronizarRepuestosInventarioOT
});


inicializarModuloInformePDF({

    getOT: () => ot,
    getUsuario: () => usuario,

    obtenerEstadoOT,
    convertirImagenABase64,
    reportesPDFHabilitados,
    obtenerEtapasHabilitadas,
    obtenerConfiguracionEmpresaInforme: async () => {
      const empresaId = ot?.empresaId || usuario?.empresaId;
      if (!empresaId) return null;
      const empresaSnap = await getDoc(doc(db, "empresas", empresaId));
      return empresaSnap.exists() ? empresaSnap.data() : null;
    }
});

function configurarMenuMovilFlujo() {
  const boton = document.querySelector(".mobile-menu-toggle");
  const fondo = document.querySelector(".mobile-menu-backdrop");
  const menu = document.getElementById("flowMobileMenu");
  if (!boton || !fondo || !menu) return;

  const cambiarEstado = (abierto) => {
    document.body.classList.toggle("menu-mobile-open", abierto);
    boton.setAttribute("aria-expanded", String(abierto));
    boton.setAttribute("aria-label", abierto
      ? "Cerrar menú de navegación"
      : "Abrir menú de navegación");
  };

  boton.addEventListener("click", () => {
    cambiarEstado(!document.body.classList.contains("menu-mobile-open"));
  });
  fondo.addEventListener("click", () => cambiarEstado(false));
  menu.addEventListener("click", (evento) => {
    if (evento.target.closest("button")) cambiarEstado(false);
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") cambiarEstado(false);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) cambiarEstado(false);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await cargarConfiguracionAprobaciones();
  await cargarGamasDisponibles();
  iniciarInventarioTiempoReal();
  configurarSelectorOSInventario();
  document.querySelectorAll("[data-aprobacion-etapa]").forEach(campo => {
    campo.addEventListener("change", actualizarResumenAprobaciones);
  });
  actualizarResumenAprobaciones();
  restaurarBorradorIdentificacion();
  actualizarOpcionesAprobacionPorPlantilla();
  ["equipo", "serie", "gamaEquipo", "cliente", "os"].forEach(id => {
    const campo = document.getElementById(id);
    if (id === "gamaEquipo") {
      campo?.addEventListener("change", () => {
        guardarBorradorIdentificacion();
        actualizarOpcionesAprobacionPorPlantilla();
      });
    } else {
      campo?.addEventListener("input", guardarBorradorIdentificacion);
    }
  });
});

document.addEventListener("DOMContentLoaded", configurarMenuMovilFlujo);


inicializarModuloGantt({

    getOT: () => ot,
    getUsuario: () => usuario,

    guardarCambiosOT,
    esJefeTaller,
    reportesPDFHabilitados,
    ganttHabilitado
});





inicializarModuloIngreso({

    getOT: () => ot,

    guardarCambiosOT,
    autoguardarCambiosOT,

    renderProgresoEtapa,
    itemCompleto,

    renderComentariosItem,

    OTBloqueada,
    esJefeTaller,

    agregarBitacora,

    actualizarEstadoGanttDesdeChecklist,
    recalcularGanttAutomatico,
    renderCartaGantt,

    verImagenModal,

    obtenerEstadoOT,
    habilitarTab,
    navegarSiguienteEtapa,

    eliminarArchivoStorage,
    subirArchivoStorage,
    comprimirImagenBlob,
    mostrarAlerta

});

inicializarModuloEvaluacion({

    getOT: () => ot,

    guardarCambiosOT,
    autoguardarCambiosOT,

    renderProgresoEtapa,
    itemCompleto,

    renderComentariosEvaluacion,

    OTBloqueada,

    actualizarEstadoGanttDesdeChecklist,
    recalcularGanttAutomatico,
    renderCartaGantt,

    verImagenModal,

    eliminarArchivoStorage,
    subirArchivoStorage,
    comprimirImagenBlob,

    getUsuario: () => usuario,

    esJefeTaller,
    obtenerEstadoOT,
    habilitarTab,
    cambiarTab,
    navegarSiguienteEtapa,

    aprobacionesHabilitadas,
    agregarBitacora,

    abrirDocumento

});


inicializarModuloOverhaul({
  getOT: () => ot,
  getUsuario: () => usuario,

  guardarCambiosOT,
  autoguardarCambiosOT,

  renderProgresoEtapa,
  itemCompleto,

  OTBloqueada,
  esJefeTaller,
  esUsuarioTaller,
  puedeEliminarComentario,

  actualizarEstadoGanttDesdeChecklist,
  recalcularGanttAutomatico,
  renderCartaGantt,

  comprimirImagenBlob,
  subirArchivoStorage,
  eliminarArchivoStorage,
  verImagenModal,

  actualizarAlertaJefe,
  obtenerEstadoOT,
  habilitarTab,
  navegarSiguienteEtapa
});


inicializarModuloPruebas({

  getOT: () => ot,
  getUsuario: () => usuario,

  guardarCambiosOT,
  autoguardarCambiosOT,

  renderProgresoEtapa,
  itemCompleto,

  OTBloqueada,
  esJefeTaller,
  esUsuarioTaller,
  puedeEliminarComentario,

  actualizarEstadoGanttDesdeChecklist,
  recalcularGanttAutomatico,
  renderCartaGantt,

  comprimirImagenBlob,
  subirArchivoStorage,
  eliminarArchivoStorage,
  verImagenModal,

  actualizarAlertaJefe,
  obtenerEstadoOT,

  habilitarTab,
  cambiarTab,
  navegarSiguienteEtapa,

  responderComentarioJefe,
  aprobacionesHabilitadas,
  agregarBitacora

});


inicializarModuloDespacho({

    getOT: () => ot,
    getUsuario: () => usuario,

    guardarCambiosOT,

    OTBloqueada,
    esJefeTaller,

    subirArchivoStorage,
    eliminarArchivoStorage,

    abrirDocumento,
    validarOTCompleta,
    aplicarModoSoloLectura

});


inicializarModuloUI({
    getOT: () => ot,
    getUsuario: () => usuario,
    OTBloqueada
});












// =======================
// CHECK
// =======================


// =======================
// FOTOS
// =======================




function configurarTabsSegunFlujo() {

  if (!ot) return;

  // Primero bloqueamos todas las etapas operativas
  deshabilitarTab("evaluacion");
  deshabilitarTab("overhaul");
  deshabilitarTab("pruebas");
  deshabilitarTab("despacho");

  if (etapaHabilitada("ingreso")) {
    habilitarTab("ingreso");
  }

  // Jefe Taller puede planificar/ver todas
  if (esJefeTaller()) {
    ORDEN_ETAPAS.filter(etapaHabilitada).forEach(habilitarTab);
    return;
  }

  // Supervisor y técnico siguen el flujo real
  if (ot.ingresoAprobado && etapaHabilitada("evaluacion")) {
    habilitarTab("evaluacion");
  }

  if (etapaHabilitada("overhaul") && ot.evaluacionAprobada && ot.overhaulRequerido === true) {
    habilitarTab("overhaul");
  }

  if (etapaHabilitada("pruebas") && ot.overhaulRequerido === true && ot.overhaulAprobado) {
    habilitarTab("pruebas");
  }

  if (etapaHabilitada("despacho") && (ot.pruebasAprobado || ot.overhaulRequerido === false)) {
    habilitarTab("despacho");
  }

  // Habilita además la etapa calculada cuando existen etapas omitidas.
  const tabEstado = {
    INGRESO: "ingreso",
    EVALUACION: "evaluacion",
    OVERHAUL: "overhaul",
    PRUEBAS: "pruebas",
    DESPACHO: "despacho"
  }[obtenerEstadoOT(ot)];
  if (tabEstado && etapaHabilitada(tabEstado)) habilitarTab(tabEstado);
}





// =======================
// GUARDAR
// =======================












// =======================
// INIT
// =======================
window.onload = async () => {

  const id = localStorage.getItem("otActiva");

  if (!id) {
    cambiarTab("crear");
    renderUsuarioActivo();
    aplicarPermisosRol();
    return;
  }

  try {
    const otRef = doc(db, "ots", id);
    const otSnap = await getDoc(otRef);

    if (!otSnap.exists()) {
      await notificarFlujo("La orden de trabajo ya no existe o no está disponible.", "OT no disponible", "error");
      localStorage.removeItem("otActiva");
      cambiarTab("crear");
      return;
    }

    ot = {
      id: otSnap.id,
      ...otSnap.data()
    };


    setOTContexto(ot);

    await cargarConfiguracionAprobaciones();

    cargarDatosIdentificacionOT();


    console.log("OT cargada desde Firebase:", ot);

  } catch (error) {
    console.error("Error cargando OT:", error);
    await notificarFlujo("No fue posible cargar la orden de trabajo.", "Error de carga", "error");
    return;
  }

  // =========================
  // RESTAURAR SECCIONES
  // =========================

  if (ot.ingreso?.length > 0) {
    window.renderIngreso();
    habilitarTab("ingreso");
  }

  if (ot.ingresoAprobado) {
    habilitarTab("evaluacion");
  }

  if (ot.evaluacion?.length > 0) {
    window.renderEvaluacion();
    window.renderDocsDecisionEvaluacionPreview();
    window.renderComentarioDecisionEvaluacion();
  }

  // ✅ SI EVALUACIÓN FUE APROBADA PARA OVERHAUL
  if (ot.evaluacionAprobada && ot.overhaulRequerido === true) {
    habilitarTab("overhaul");
  }

  // ✅ SI EVALUACIÓN FUE RECHAZADA → DIRECTO A DESPACHO
  if (ot.evaluacionAprobada && ot.overhaulRequerido === false) {
    habilitarTab("despacho");
  }

  if (ot.overhaul?.length > 0 && etapaHabilitada("overhaul")) {
    window.renderOverhaul();
    habilitarTab("overhaul");
  }

  if (etapaHabilitada("pruebas") && ot.overhaulAprobado) {
    habilitarTab("pruebas");
  }

  if (ot.pruebas && etapaHabilitada("pruebas")) {
    const pruebas = Array.isArray(ot.pruebas)
      ? ot.pruebas
      : Array.isArray(ot.pruebas.general)
      ? ot.pruebas.general
      : [...(ot.pruebas.mecanico || []), ...(ot.pruebas.electrico || [])];
    if (pruebas.length > 0) window.renderChecklist("general");

  }

  if (etapaHabilitada("despacho") && obtenerEstadoOT(ot) === "DESPACHO") {
    habilitarTab("despacho");
  }

  if (ot.despacho) {
    if (ot.despacho.preparacion?.length > 0) {
      window.renderDocsSeccion("preparacion");
    }

    if (ot.despacho.final?.length > 0) {
      window.renderDocsSeccion("final");
    }

    renderComentariosDespacho("preparacion");
    renderComentariosDespacho("final");
  }

  // Seleccionar la etapa activa considerando únicamente módulos habilitados.
  const tabPorEstado = {
    INGRESO: "ingreso",
    EVALUACION: "evaluacion",
    OVERHAUL: "overhaul",
    PRUEBAS: "pruebas",
    DESPACHO: "despacho"
  };
  const tabActiva = tabPorEstado[obtenerEstadoOT(ot)] || "ingreso";
  habilitarTab(tabActiva);
  cambiarTab(tabActiva);

  const destinoSolicitado = localStorage.getItem("otDestinoEtapa");
  localStorage.removeItem("otDestinoEtapa");
  if (destinoSolicitado && etapaHabilitada(destinoSolicitado)) {
    habilitarTab(destinoSolicitado);
    cambiarTab(destinoSolicitado);
  }

  configurarTabsSegunFlujo();

if (ot.gantt) {
  renderCartaGanttProject();
}

const btnGantt =
  document.getElementById("btnGantt");

if (btnGantt) {

  btnGantt.innerHTML =
    ot.gantt?.actividades?.length
      ? "📊 Ver Carta Gantt"
      : "📊 Crear Carta Gantt";
}

renderHeaderOTPro();

aplicarModoSoloLectura();
aplicarPermisosRol();
configurarInterfazAprobaciones();
configurarInterfazReportesPDF();
configurarInterfazGantt();
configurarInterfazRepuestos();
configurarInterfazEtapas();
renderUsuarioActivo();
};



// =======================
// ABRIR DOCUMENTO EN EL VISOR NATIVO DEL NAVEGADOR
// =======================
function abrirDocumento(doc) {
  const urlDocumento = doc?.url || doc?.data;

  if (!urlDocumento) {
    console.error("El documento no tiene una URL disponible");
    return;
  }

  const enlace = document.createElement("a");
  enlace.href = urlDocumento;
  enlace.target = "_blank";
  enlace.rel = "noopener noreferrer";
  enlace.setAttribute("aria-label", `Abrir ${doc?.nombre || "documento"} en una pestaña nueva`);
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
}

// =======================
// GUARDAR DESPACHO
// =======================














// =======================
// CERRAR OT
// =======================

// =======================
// DECISIÓN JEFE TALLER - PRUEBAS
// =======================


// =======================
// VALIDACIÓN COMPLETA OT
// =======================
function validarOTCompleta() {

  function validarLista(nombreEtapa, lista) {
    if (!lista || lista.length === 0) {
      notificarFlujo(`Falta completar la etapa ${nombreEtapa}.`, "OT incompleta", "advertencia");
      return false;
    }

    for (let i = 0; i < lista.length; i++) {
      const item = lista[i];

      if (!item.ok) {
        notificarFlujo(`${nombreEtapa}: falta marcar el ítem ${i + 1}.`, "Checklist incompleto", "advertencia");
        return false;
      }

      if (!item.fotos || item.fotos.length === 0) {
        notificarFlujo(`${nombreEtapa}: falta una fotografía en el ítem ${i + 1}.`, "Evidencia pendiente", "advertencia");
        return false;
      }

      const comentariosTecnicos = (item.comentarios || []).filter(c =>
        !["jefe_taller", "admin_sucursal"].includes(c.rol)
      );

      if (comentariosTecnicos.length === 0) {
        notificarFlujo(`${nombreEtapa}: falta un comentario técnico en el ítem ${i + 1}.`, "Comentario pendiente", "advertencia");
        return false;
      }

      const obsPendiente = (item.comentarios || []).some(c =>
        ["jefe_taller", "admin_sucursal"].includes(c.rol) && c.atendido !== true
      );

      if (obsPendiente) {
        notificarFlujo(`${nombreEtapa}: hay observaciones del Jefe pendientes en el ítem ${i + 1}.`, "Observaciones pendientes", "advertencia");
        return false;
      }
    }

    return true;
  }

  if (etapaHabilitada("ingreso") && !validarLista("INGRESO", ot.ingreso)) {
    return false;
  }

  if (etapaHabilitada("evaluacion") && !validarLista("EVALUACIÓN", ot.evaluacion)) {
    return false;
  }

  if (
    etapaHabilitada("evaluacion") &&
    aprobacionesHabilitadas("evaluacion") &&
    !ot.evaluacionAprobada
  ) {
    notificarFlujo("Falta la decisión del Jefe de Taller en Evaluación.", "Aprobación pendiente", "advertencia");
    return false;
  }

  const evaluacionRechazada =
    etapaHabilitada("evaluacion") &&
    ot.evaluacionAprobada &&
    ot.overhaulRequerido === false;

  if (!evaluacionRechazada) {
    if (
      etapaHabilitada("overhaul") &&
      !validarLista("MANTENCIÓN", ot.overhaul)
    ) {
      return false;
    }

    if (etapaHabilitada("overhaul") && aprobacionesHabilitadas("mantencion") && !ot.overhaulAprobado) {
      notificarFlujo("Falta la aprobación de Mantención por el Jefe de Taller.", "Aprobación pendiente", "advertencia");
      return false;
    }

    if (etapaHabilitada("pruebas")) {
      const pruebas = Array.isArray(ot.pruebas)
        ? ot.pruebas
        : Array.isArray(ot.pruebas?.general)
        ? ot.pruebas.general
        : [...(ot.pruebas?.mecanico || []), ...(ot.pruebas?.electrico || [])];
      if (!validarLista("PRUEBAS", pruebas)) return false;
    }

    if (
      etapaHabilitada("pruebas") &&
      aprobacionesHabilitadas("pruebas") &&
      !ot.pruebasAprobado
    ) {
      notificarFlujo("Falta la aprobación de Pruebas por el Jefe de Taller.", "Aprobación pendiente", "advertencia");
      return false;
    }
  }

  if (etapaHabilitada("despacho")) {
    if (!ot.despacho) {
      notificarFlujo("Falta completar la etapa de Despacho.", "OT incompleta", "advertencia");
      return false;
    }

    if (!ot.despacho.preparacion || ot.despacho.preparacion.length === 0) {
      notificarFlujo("Despacho: falta la documentación de Preparación.", "Documentación pendiente", "advertencia");
      return false;
    }

    if (!ot.despacho.final || ot.despacho.final.length === 0) {
      notificarFlujo("Despacho: falta la documentación de Despacho Final.", "Documentación pendiente", "advertencia");
      return false;
    }

    if (aprobacionesHabilitadas("despacho") && !ot.despachoAprobado) {
      notificarFlujo("Falta la aprobación de Despacho por el Jefe de Taller.", "Aprobación pendiente", "advertencia");
      return false;
    }

    const obsDespachoPrep = (ot.despacho.comentariosPreparacion || []).some(c =>
      ["jefe_taller", "admin_sucursal"].includes(c.rol) && c.atendido !== true
    );

    const obsDespachoFinal = (ot.despacho.comentariosFinal || []).some(c =>
      ["jefe_taller", "admin_sucursal"].includes(c.rol) && c.atendido !== true
    );

    if (obsDespachoPrep || obsDespachoFinal) {
      notificarFlujo("Despacho: existen observaciones del Jefe pendientes.", "Observaciones pendientes", "advertencia");
      return false;
    }
  }

  return true;
}

async function convertirImagenABase64(url) {
  try {
    let storageRef;

    if (url.startsWith("https://firebasestorage.googleapis.com")) {
      storageRef = ref(storage, url);
    } else {
      storageRef = ref(storage, url);
    }

    const bytes = await getBytes(storageRef);

    const blob = new Blob([bytes], {
      type: "image/jpeg"
    });

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;

      reader.readAsDataURL(blob);
    });

  } catch (error) {
    console.error("Error convirtiendo imagen a base64:", error);
    return null;
  }
}



function calcularProgresoOTFlujo(ot) {
  const estado = obtenerEstadoOT(ot);

  const ultimaEtapaActiva = [...ORDEN_ETAPAS].reverse().find(etapaHabilitada);
  const estadoUltimaEtapa = {
    ingreso: "INGRESO",
    evaluacion: "EVALUACION",
    overhaul: "OVERHAUL",
    pruebas: "PRUEBAS",
    despacho: "DESPACHO"
  }[ultimaEtapaActiva];
  const ultimaEtapaFinalizada = {
    ingreso: ot.ingresoAprobado === true,
    evaluacion: ot.evaluacionAprobada === true,
    overhaul: ot.overhaulAprobado === true,
    pruebas: ot.pruebasAprobado === true,
    despacho: false
  }[ultimaEtapaActiva];

  if (estado === estadoUltimaEtapa && ultimaEtapaFinalizada) {
    return 90;
  }

  switch (estado) {
    case "EVALUACION": return 25;
    case "OVERHAUL": return 50;
    case "PRUEBAS": return 75;
    case "DESPACHO": return 90;
    case "CERRADA": return 100;
    default: return 10;
  }
}

function renderHeaderOTPro() {

  if (!ot) return;

  const header = document.getElementById("headerOTPro");
  if (!header) return;

  const estado = obtenerEstadoOT(ot);
  const progreso = calcularProgresoOTFlujo(ot);

  const numero = document.getElementById("headerOTNumero");
  const equipo = document.getElementById("headerOTEquipo");
  const cliente = document.getElementById("headerOTCliente");
  const serie = document.getElementById("headerOTSerie");
  const estadoEl = document.getElementById("headerOTEstado");
  const entrega = document.getElementById("headerOTEntrega");
  const progresoTexto = document.getElementById("headerOTProgresoTexto");
  const progresoBarra = document.getElementById("headerOTProgresoBarra");

  if (numero) numero.textContent = ot.os || "Sin OS";
  if (equipo) equipo.textContent = ot.equipo || "—";
  if (cliente) cliente.textContent = ot.cliente || "—";
  if (serie) serie.textContent = ot.serie || "—";

  if (estadoEl) {
    estadoEl.textContent = estado;
    estadoEl.className = `header-ot-estado ${estado.toLowerCase()}`;
  }

  if (entrega) {
    entrega.textContent = ot.gantt?.fechaTermino
      ? new Date(ot.gantt.fechaTermino + "T00:00:00")
          .toLocaleDateString("es-CL")
      : "Sin fecha";
  }

  if (progresoTexto) progresoTexto.textContent = `${progreso}%`;
  if (progresoBarra) progresoBarra.style.width = `${progreso}%`;

  header.style.display = "block";
}




// =======================
// FUNCIONES GLOBALES PARA HTML
// =======================
window.guardarDatosOS = guardarDatosOS;

window.cerrarImagen = cerrarImagen;

window.verImagenModal = verImagenModal;
