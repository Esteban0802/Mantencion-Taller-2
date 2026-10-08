import { protegerPagina, cerrarSesion as cerrarSesionGlobal } from "./session.js?v=20261007-1";

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
} from "./modulos/core/permisos.js";


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
} from "./modulos/repuestos.js";


import {
    inicializarModuloInformePDF
} from "./modulos/informePDF.js?v=20261007-1";


import {
    inicializarModuloGantt,
    recalcularGanttAutomatico,
    renderCartaGantt,
    renderCartaGanttProject,
    actualizarEstadoGanttDesdeChecklist
} from "./modulos/gantt.js";


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
  "tecnico"
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

function aprobacionesHabilitadas() {
  return aprobacionesActivas;
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

function configurarInterfazAprobaciones() {
  const decisionEvaluacion = document.getElementById("decisionEvaluacionJefe");
  const continuarEvaluacion = document.getElementById("btnContinuarEvaluacionSinAprobacion");
  const aprobarPruebas = document.getElementById("btnAprobarPruebasJefe");
  const finalizarPruebas = document.getElementById("btnFinalizarPruebasSinAprobacion");

  if (decisionEvaluacion) decisionEvaluacion.style.display = aprobacionesActivas ? "" : "none";
  if (continuarEvaluacion) continuarEvaluacion.style.display = aprobacionesActivas ? "none" : "inline-flex";
  if (aprobarPruebas) aprobarPruebas.style.display = aprobacionesActivas ? "" : "none";
  if (finalizarPruebas) finalizarPruebas.style.display = aprobacionesActivas ? "none" : "inline-flex";
}

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

    aprobacionesActivas = modulosEmpresa.aprobaciones !== false;
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
  } catch (error) {
    console.error("No fue posible cargar las gamas de equipo:", error);
    selector.innerHTML = '<option value="">No fue posible cargar las gamas</option>';
  }
}

async function guardarDatosOS() {

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
      osGenerica: ot.osGenerica
    };

    if (botonGuardarDatos) {
      botonGuardarDatos.disabled = true;
      botonGuardarDatos.textContent = "Guardando...";
    }

    try {
      ot.equipo = equipo;
      ot.serie = serie;
      ot.cliente = cliente;
      ot.os = osIngresada || ot.os || generarNumeroOTGenerico();
      ot.osGenerica = /^OT-AUTO-/.test(ot.os);

      const guardado = await guardarCambiosOT();
      if (!guardado) {
        Object.assign(ot, datosAnteriores);
        return;
      }

      cargarDatosIdentificacionOT();
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

      ingresoAprobado: false,
      evaluacionAprobada: false,
      overhaulAprobado: false,
      pruebasAprobado: false,

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
    repuestosHabilitados
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
  restaurarBorradorIdentificacion();
  ["equipo", "serie", "gamaEquipo", "cliente", "os"].forEach(id => {
    const campo = document.getElementById(id);
    campo?.addEventListener(id === "gamaEquipo" ? "change" : "input", guardarBorradorIdentificacion);
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
// ABRIR DOCUMENTO (MODAL)
// =======================
function abrirDocumento(doc) {

  const modal = document.getElementById("modalDoc");
  const visor = document.getElementById("visorDoc");

  if (!modal || !visor) {
    console.error("Modal o visor no existen en el HTML");
    return;
  }

  visor.src = doc.url || doc.data;
  modal.style.display = "block";
}

function cerrarModal() {
  const modal = document.getElementById("modalDoc");
  const visor = document.getElementById("visorDoc");

  modal.style.display = "none";
  visor.src = "";
}

window.onclick = function(e) {
  const modal = document.getElementById("modalDoc");

  if (e.target === modal) {
    cerrarModal();
  }
};

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
    aprobacionesHabilitadas() &&
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
      aprobacionesHabilitadas() &&
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

window.cerrarModal = cerrarModal;
window.cerrarImagen = cerrarImagen;

window.verImagenModal = verImagenModal;
