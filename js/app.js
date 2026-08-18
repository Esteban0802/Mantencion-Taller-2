import { protegerPagina, cerrarSesion as cerrarSesionGlobal } from "./session.js";

import { db, auth, storage } from "./firebase-config.js";


import {
  getOT as getOTContexto,
  setOT as setOTContexto,
  getListaOTs as getListaOTsContexto,
  setListaOTs as setListaOTsContexto,
  NOMBRES_ETAPAS as NOMBRES_ETAPAS_CONTEXTO
} from "./modulos/contexto.js";


import {
  inicializarModuloIngreso
} from "./modulos/ingreso.js";


import {
  inicializarModuloEvaluacion
} from "./modulos/evaluacion.js";


import {
  inicializarModuloOverhaul
} from "./modulos/overhaul.js";


import {
  inicializarModuloPruebas
} from "./modulos/pruebas.js";


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
} from "./modulos/core/storage.js";


import {
    verImagenModal,
    cerrarImagen,
    comprimirImagenBlob
} from "./modulos/core/imagenes.js";


import {
    inicializarOTService,
    guardarCambiosOT,
    autoguardarCambiosOT,
    obtenerEstadoOT,
    mostrarEstadoAutoguardado
} from "./modulos/core/otService.js";


import {
    inicializarModuloComentarios,
    existenComentariosJefePendientes,
    actualizarAlertaJefe,
    responderComentarioJefe,

    agregarComentarioItem,
    renderComentariosItem,
    eliminarComentarioIngreso,

    agregarComentarioEvaluacion,
    renderComentariosEvaluacion,
    eliminarComentarioEvaluacion,

    prepararComentariosDespacho,
    agregarComentarioDespacho,
    renderComentariosDespacho,
    responderComentarioJefeDespacho,
    eliminarComentarioDespacho
} from "./modulos/comentarios.js";


import {
    inicializarModuloRepuestos,
    cargarRepuestosExcel,
    abrirModalRepuestos,
    cerrarModalRepuestos,
    renderRepuestosModal,
    guardarRepuestosUsados
} from "./modulos/repuestos.js";


import {
    inicializarModuloInformePDF,
    generarInformeFinalPDF,
    obtenerResumenEjecutivoInforme,
    obtenerResumenEvidenciasInforme
} from "./modulos/informePDF.js";


import {
    inicializarModuloGantt,

    abrirModalGantt,
    cerrarModalGantt,
    cerrarModalGanttVisual,
    volverFormularioGantt,

    generarCartaGantt,
    recalcularGanttAutomatico,
    cargarGanttGuardado,

    renderCartaGantt,
    renderCartaGanttProject,
    toggleEtapaGantt,

    descargarGanttExcel,
    descargarGanttPDFProfesional,

    zoomGantt,
    irHoyGantt,

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
  "usuario_taller"
]);

if (!usuario) throw new Error("Acceso no autorizado");

window.cerrarSesion = function () {
  cerrarSesionGlobal();
};

const NOMBRES_ETAPAS = {
  ingreso: "Ingreso",
  evaluacion: "Evaluación",
  overhaul: "Mantención",
  pruebasMecanicas: "Pruebas Mecánicas",
  pruebasElectricas: "Pruebas Eléctricas",
  despachoPreparacion: "Despacho Preparación",
  despachoFinal: "Despacho Final"
};

import {
  collection,
  addDoc,
  doc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL,
  getBytes,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

console.log("🔥 Firebase conectado correctamente");
console.log(db);
console.log(auth);
console.log(storage);


console.log("🧩 Contexto OverTrack cargado correctamente", {
  ot: getOTContexto(),
  listaOTs: getListaOTsContexto(),
  etapas: NOMBRES_ETAPAS_CONTEXTO
});


// =======================
// VARIABLES GLOBALES
// =======================
let ot = getOTContexto();
let listaOTs = getListaOTsContexto();


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
    renderHeaderOTPro
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
// COMPRESIÓN DE IMÁGENES
// =======================
function comprimirImagen(file, calidad = 0.7, maxWidth = 1600) {

  return new Promise((resolve) => {

    const reader = new FileReader();

    reader.readAsDataURL(file);

    reader.onload = (event) => {

      const img = new Image();

      img.src = event.target.result;

      img.onload = () => {

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        let width = img.width;
        let height = img.height;

        // 🔥 REDIMENSIONAR
        if (width > maxWidth) {

          height *= maxWidth / width;
          width = maxWidth;

        }

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);

        // 🔥 COMPRESIÓN JPEG
        const compressedBase64 =
          canvas.toDataURL("image/jpeg", calidad);

        resolve(compressedBase64);

      };

    };

  });
}

// =======================
// CREAR OS
// =======================
async function guardarDatosOS() {

  const equipo = document.getElementById("equipo").value.trim();
  const serie = document.getElementById("serie").value.trim();
  const cliente = document.getElementById("cliente").value.trim();
  const os = document.getElementById("os").value.trim();

  if (!equipo || !serie || !cliente || !os) {
    alert("Completa todos los campos");
    return;
  }

  try {

    const nuevaOT = {
      equipo,
      serie,
      cliente,
      os,

      empresaId: usuario.empresaId,
      sucursalId: usuario.sucursalId,
      creadoPor: usuario.uid,
      creadoPorNombre: usuario.nombre,
      creadoPorRol: usuario.rol,

      estado: "INGRESO",


      ingreso: [],
      evaluacion: [],
      overhaul: [],
      pruebas: null,
      despacho: null,

      ingresoAprobado: false,
      evaluacionAprobada: false,
      overhaulAprobado: false,
      pruebasAprobado: false,

      cerrada: false,

      creadoPor: "usuario_taller",
      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, "ots"), nuevaOT);

    localStorage.setItem("otActiva", docRef.id);

    alert("OS creada correctamente ✅");

    window.location.href = "flujo.html";

  } catch (error) {
    console.error("Error creando OS:", error);
    alert("Error al crear la OS en Firebase");
  }
}

window.guardarDatosOS = guardarDatosOS;



function habilitarTabsPlanificacionJefe() {

  if (!esJefeTaller()) return;

  habilitarTab("ingreso");
  habilitarTab("evaluacion");
  habilitarTab("overhaul");
  habilitarTab("pruebas");
  habilitarTab("despacho");

  console.log("Tabs desbloqueadas para planificación Jefe de Taller ✅");
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
    esJefeTaller
});


inicializarModuloInformePDF({

    getOT: () => ot,
    getUsuario: () => usuario,

    obtenerEstadoOT,
    convertirImagenABase64
});


inicializarModuloGantt({

    getOT: () => ot,
    getUsuario: () => usuario,

    guardarCambiosOT,
    esJefeTaller
});





inicializarModuloIngreso({

    getOT: () => ot,
    getUsuario: () => usuario,

    guardarCambiosOT,
    autoguardarCambiosOT,

    renderProgresoEtapa,
    itemCompleto,

    mostrarFotosIngreso: (...args) => window.mostrarFotosIngreso(...args),
    renderComentariosItem,

    OTBloqueada,

    agregarBitacora,

    actualizarEstadoGanttDesdeChecklist,
    recalcularGanttAutomatico,
    renderCartaGantt,

    verImagenModal,

    obtenerEstadoOT,
    habilitarTab,

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

    renderComentarioDecisionEvaluacion

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
  habilitarTab
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

  responderComentarioJefe

});


inicializarModuloDespacho({

    getOT: () => ot,
    getUsuario: () => usuario,

    guardarCambiosOT,

    OTBloqueada,

    esJefeTaller,
    esUsuarioTaller,

    puedeEliminarComentario,

    subirArchivoStorage,

    actualizarAlertaJefe

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

  // Ingreso siempre habilitado cuando existe OT
  habilitarTab("ingreso");

  // Jefe Taller puede planificar/ver todas
  if (esJefeTaller()) {
    habilitarTab("evaluacion");
    habilitarTab("overhaul");
    habilitarTab("pruebas");
    habilitarTab("despacho");
    return;
  }

  // Usuario Taller sigue el flujo real
  if (ot.ingresoAprobado) {
    habilitarTab("evaluacion");
  }

  if (ot.evaluacionAprobada && ot.overhaulRequerido === true) {
    habilitarTab("overhaul");
  }

  if (ot.overhaulRequerido === true && ot.overhaulAprobado) {
    habilitarTab("pruebas");
  }

  if (ot.pruebasAprobado || ot.overhaulRequerido === false) {
    habilitarTab("despacho");
  }
}





// =======================
// GUARDAR
// =======================












function estaOTAtrasada(ot) {

  if (!ot) return false;

  // Si está cerrada, no cuenta como atrasada
  if (ot.cerrada === true || ot.estado === "CERRADA") {
    return false;
  }

  // Si no tiene Carta Gantt, no se puede calcular atraso
  if (!ot.gantt || !ot.gantt.fechaTermino) {
    return false;
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const fechaTermino = new Date(ot.gantt.fechaTermino + "T00:00:00");
  fechaTermino.setHours(0, 0, 0, 0);

  return hoy > fechaTermino;
}

function diasAtrasoOT(ot) {

  if (!estaOTAtrasada(ot)) return 0;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const fechaTermino = new Date(ot.gantt.fechaTermino + "T00:00:00");
  fechaTermino.setHours(0, 0, 0, 0);

  const diferencia =
    hoy - fechaTermino;

  return Math.floor(
    diferencia / (1000 * 60 * 60 * 24)
  );
}


// =======================
// APLICAR MODO SOLO LECTURA
// =======================





function aprobarEvaluacion() {

  if (!esJefeTaller()) {
  alert("Solo Jefe de Taller puede aprobar");
  return;
}

  // 🔥 VALIDACIÓN COMPLETA
  if (!window.validarEvaluacionCompleta()) return;

  ot.evaluacionAprobada = true;

  ot.estado = obtenerEstadoOT(ot);

  guardarCambiosOT();

  habilitarTab("overhaul");

  alert("Evaluación aprobada correctamente ✅");
}







function abrirDocumentoDecisionEvaluacion(index) {
  const doc = ot?.decisionEvaluacion?.documentos?.[index];

  if (!doc) return;

  abrirDocumento({
    nombre: doc.nombre,
    tipo: doc.tipo,
    url: doc.url
  });
}

function renderComentarioDecisionEvaluacion() {
  const cont = document.getElementById("comentarioDecisionEvaluacionGuardado");
  if (!cont) return;

  cont.innerHTML = "";

  if (!ot.decisionEvaluacion?.comentario) return;

  const div = document.createElement("div");
  div.className = "comentario-card comentario-jefe";

  div.innerHTML = `
    <strong>👨‍💼 ${ot.decisionEvaluacion.usuario || "Jefe Taller"}</strong>
    <p class="comentario-fecha">${ot.decisionEvaluacion.fecha || ""}</p>
    <p>${ot.decisionEvaluacion.comentario}</p>

    ${
  esJefeTaller()
    ? `<button 
        class="btn-delete-comment"
        onclick="eliminarComentarioDecisionEvaluacion()">
        🗑
      </button>`
    : ""
}
  `;

  cont.appendChild(div);
}

async function eliminarComentarioDecisionEvaluacion() {
  if (OTBloqueada()) return;

  if (!esJefeTaller()) {
    alert("Solo Jefe de Taller puede eliminar este comentario");
    return;
  }

  if (!confirm("¿Eliminar comentario de decisión de evaluación?")) return;

  ot.decisionEvaluacion.comentario = "";

  actualizarAlertaJefe();

  await guardarCambiosOT();
  renderComentarioDecisionEvaluacion();
}

function abrirArchivoTemporal(url) {
  const modal = document.getElementById("modalDoc");
  const visor = document.getElementById("visorDoc");

  if (!modal || !visor) return;

  visor.src = url;
  modal.style.display = "block";
}


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
      alert("La OT no existe en Firebase");
      localStorage.removeItem("otActiva");
      cambiarTab("crear");
      return;
    }

    ot = {
      id: otSnap.id,
      ...otSnap.data()
    };


    setOTContexto(ot);


    console.log("OT cargada desde Firebase:", ot);

  } catch (error) {
    console.error("Error cargando OT:", error);
    alert("Error al cargar la OT desde Firebase");
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
    renderDocsDecisionEvaluacionPreview();
    renderComentarioDecisionEvaluacion();
  }

  // ✅ SI EVALUACIÓN FUE APROBADA PARA OVERHAUL
  if (ot.evaluacionAprobada && ot.overhaulRequerido === true) {
    habilitarTab("overhaul");
  }

  // ✅ SI EVALUACIÓN FUE RECHAZADA → DIRECTO A DESPACHO
  if (ot.evaluacionAprobada && ot.overhaulRequerido === false) {
    habilitarTab("despacho");
  }

  if (ot.overhaul?.length > 0 && ot.overhaulRequerido === true) {
    window.renderOverhaul();
    habilitarTab("overhaul");
  }

  if (ot.overhaulRequerido === true && ot.overhaulAprobado) {
    habilitarTab("pruebas");
  }

  if (ot.pruebas && ot.overhaulRequerido === true) {
    if (ot.pruebas.mecanico?.length > 0) {
      renderChecklist("mecanico");
    }

    if (ot.pruebas.electrico?.length > 0) {
      renderChecklist("electrico");
    }

  }

  if (
    ot.pruebasAprobado ||
    ot.overhaulRequerido === false
  ) {
    habilitarTab("despacho");
  }

  if (ot.despacho) {
    if (ot.despacho.preparacion?.length > 0) {
      renderDocsSeccion("preparacion");
    }

    if (ot.despacho.final?.length > 0) {
      renderDocsSeccion("final");
    }

    renderComentariosDespacho("preparacion");
    renderComentariosDespacho("final");
  }

  // =========================
  // FORZAR TAB ACTIVO CORRECTO
  // =========================

  if (!ot.ingreso || ot.ingreso.length === 0) {
    habilitarTab("ingreso");
    cambiarTab("ingreso");
  }

  else if (!ot.ingresoAprobado) {
    habilitarTab("ingreso");
    cambiarTab("ingreso");
  }

  else if (ot.ingresoAprobado && !ot.evaluacionAprobada) {
    habilitarTab("evaluacion");
    cambiarTab("evaluacion");
  }

  // ✅ RECHAZO DE OVERHAUL → DESPACHO
  else if (ot.evaluacionAprobada && ot.overhaulRequerido === false) {
    habilitarTab("despacho");
    cambiarTab("despacho");
  }

  // ✅ APROBADO PARA OVERHAUL
  else if (
    ot.evaluacionAprobada &&
    ot.overhaulRequerido === true &&
    !ot.overhaulAprobado
  ) {
    habilitarTab("overhaul");
    cambiarTab("overhaul");
  }

  else if (
    ot.overhaulRequerido === true &&
    ot.overhaulAprobado &&
    !ot.pruebasAprobado
  ) {
    habilitarTab("pruebas");
    cambiarTab("pruebas");
  }

  else if (
    ot.pruebasAprobado ||
    ot.overhaulRequerido === false
  ) {
    habilitarTab("despacho");
    cambiarTab("despacho");
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
renderUsuarioActivo();
};



function irACrearOS() {

  cambiarTab("crear");

}

function validarOverhaulCompleto() {

  if (!ot.overhaul || ot.overhaul.length === 0) {
    alert("Debes cargar checklist");
    return false;
  }

  const checklist = ot.overhaul.every(i => i.ok);
  const fotos = ot.overhaul.every(i => i.fotos && i.fotos.length > 0);
  const comentarios = ot.overhaul.every(i => i.comentarios && i.comentarios.length > 0);

  if (!checklist) {
    alert("Checklist incompleto");
    return false;
  }

  if (!fotos) {
    alert("Faltan evidencias fotográficas");
    return false;
  }

  if (!comentarios) {
    alert("Faltan comentarios");
    return false;
  }

  return true;
}


// =======================
// REPUESTOS OVERHAUL
// =======================











// =========================
// CARTA GANTT OVERHAUL
// =========================





// =======================
// SUBIR DOCUMENTOS POR SECCIÓN
// =======================
async function subirDocsSeccion(tipo) {

  if (OTBloqueada()) return;

  const inputId = tipo === "preparacion" ? "docsPreparacion" : "docsFinal";
  const input = document.getElementById(inputId);

  if (!input || !input.files.length) {
    alert("Selecciona archivos");
    return;
  }

  if (!ot.despacho) {
    ot.despacho = {
      preparacion: [],
      final: []
    };
  }

  if (!ot.despacho.preparacion) ot.despacho.preparacion = [];
  if (!ot.despacho.final) ot.despacho.final = [];

  try {

    for (let file of input.files) {

      const urlArchivo = await subirArchivoStorage(
        file,
        tipo === "preparacion" ? "despacho_preparacion" : "despacho_final",
        "documentos"
      );

      const nuevoDoc = {
        nombre: file.name,
        tipo: file.type,
        url: urlArchivo,
        fecha: new Date().toLocaleString()
      };

      ot.despacho[tipo].push(nuevoDoc);
    }

    await guardarCambiosOT();

    renderDocsSeccion("preparacion");
    renderDocsSeccion("final");

    input.value = "";

  } catch (error) {
    console.error("Error subiendo documento despacho:", error);
    alert("Error al subir documento");
  }
}

// =======================
// RENDER DOCUMENTOS SECCIÓN
// =======================
function renderDocsSeccion(tipo) {

  const contId = tipo === "preparacion"
    ? "listaDocsPrep"
    : "listaDocsFinal";

  const cont = document.getElementById(contId);
  if (!cont) return;

  cont.innerHTML = "";
  cont.className = "docs-pro-grid";

  if (!ot.despacho || !ot.despacho[tipo]) return;

  ot.despacho[tipo].forEach((doc, index) => {

    const div = document.createElement("div");
    div.className = "doc-card-pro";

    div.innerHTML = `
      <div class="doc-card-left">

        <div class="doc-card-icon">
          📄
        </div>

        <div class="doc-card-info">
          <h4>${doc.nombre || "Documento sin nombre"}</h4>
          <span>Documento de ${tipo === "preparacion" ? "preparación" : "despacho final"}</span>
        </div>

      </div>

      <div class="doc-card-actions">

        <button 
          class="btn-doc-view permitido-bloqueo"
          onclick="abrirDocSeccion(event, '${tipo}', ${index})">
          👁 Ver
        </button>

        <button 
          class="btn-doc-delete"
          onclick="eliminarDocSeccion(event, '${tipo}', ${index})">
          🗑 Eliminar
        </button>

      </div>
    `;

    cont.appendChild(div);
  });
}

function abrirDocSeccion(e, tipo, index) {
  e.stopPropagation();
  abrirDocumento(ot.despacho[tipo][index]);
}

function eliminarDocSeccion(e, tipo, index) {
  e.stopPropagation();

  const confirmar = confirm("¿Eliminar este documento?");
  if (!confirmar) return;

  ot.despacho[tipo].splice(index, 1);

  guardarCambiosOT();
  renderDocsSeccion(tipo);
}


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
function guardarDespacho() {

  if (!ot) {
    alert("No hay OT cargada");
    return;
  }

  if (!ot.despacho) {
    alert("No hay datos en despacho");
    return;
  }

  guardarCambiosOT();

  alert("Progreso de DESPACHO guardado ✅");
}

function validarDespachoCompleto() {

  if (!ot.despacho) {
    alert("Falta información de despacho");
    return false;
  }

  const prep = ot.despacho.preparacion?.length > 0;
  const final = ot.despacho.final?.length > 0;

  if (!prep) {
    alert("Faltan documentos de preparación");
    return false;
  }

  if (!final) {
    alert("Faltan documentos de despacho final");
    return false;
  }


  return true;
}











// =======================
// CERRAR OT
// =======================
async function cerrarOT() {

  if (!ot) {
    alert("No hay OT cargada");
    return;
  }

  if (!esJefeTaller()) {
    alert("Solo Jefe de Taller puede cerrar la OS");
    return;
  }

  const confirmar = confirm("¿Seguro que deseas cerrar la OT?");
  if (!confirmar) return;

  if (!validarOTCompleta()) return;

  ot.estado = "CERRADA";
  ot.cerrada = true;
  ot.fechaCierre = new Date().toLocaleString();

  await guardarCambiosOT();

  aplicarModoSoloLectura();

  alert("OT FINALIZADA COMPLETAMENTE ✅");

  localStorage.removeItem("otActiva");
  window.location.href = "dashboard.html";
}

// =======================
// DECISIÓN JEFE TALLER - PRUEBAS
// =======================


// =======================
// VALIDACIÓN COMPLETA OT
// =======================
function validarOTCompleta() {

  function validarLista(nombreEtapa, lista) {
    if (!lista || lista.length === 0) {
      alert(`Falta ${nombreEtapa}`);
      return false;
    }

    for (let i = 0; i < lista.length; i++) {
      const item = lista[i];

      if (!item.ok) {
        alert(`${nombreEtapa}: falta marcar el ítem ${i + 1}`);
        return false;
      }

      if (!item.fotos || item.fotos.length === 0) {
        alert(`${nombreEtapa}: falta foto en el ítem ${i + 1}`);
        return false;
      }

      const comentariosTecnicos = (item.comentarios || []).filter(c =>
        c.rol !== "jefe_taller"
      );

      if (comentariosTecnicos.length === 0) {
        alert(`${nombreEtapa}: falta comentario técnico en el ítem ${i + 1}`);
        return false;
      }

      const obsPendiente = (item.comentarios || []).some(c =>
        c.rol === "jefe_taller" && c.atendido !== true
      );

      if (obsPendiente) {
        alert(`${nombreEtapa}: hay observaciones del Jefe pendientes en el ítem ${i + 1}`);
        return false;
      }
    }

    return true;
  }

  if (!validarLista("INGRESO", ot.ingreso)) return false;
  if (!validarLista("EVALUACIÓN", ot.evaluacion)) return false;

  if (!ot.evaluacionAprobada) {
    alert("Falta decisión del Jefe de Taller en Evaluación");
    return false;
  }

  if (ot.overhaulRequerido !== false) {
    if (!validarLista("OVERHAUL", ot.overhaul)) return false;

    if (!validarLista("PRUEBAS MECÁNICAS", ot.pruebas?.mecanico)) return false;
    if (!validarLista("PRUEBAS ELÉCTRICAS", ot.pruebas?.electrico)) return false;

    if (!ot.pruebasAprobado) {
      alert("Falta aprobación de Pruebas por Jefe de Taller");
      return false;
    }
  }

  if (!ot.despacho) {
    alert("Falta DESPACHO");
    return false;
  }

  if (!ot.despacho.preparacion || ot.despacho.preparacion.length === 0) {
    alert("DESPACHO: falta documentación de Preparación");
    return false;
  }

  if (!ot.despacho.final || ot.despacho.final.length === 0) {
    alert("DESPACHO: falta documentación de Despacho Final");
    return false;
  }

  const obsDespachoPrep = (ot.despacho.comentariosPreparacion || []).some(c =>
    c.rol === "jefe_taller" && c.atendido !== true
  );

  const obsDespachoFinal = (ot.despacho.comentariosFinal || []).some(c =>
    c.rol === "jefe_taller" && c.atendido !== true
  );

  if (obsDespachoPrep || obsDespachoFinal) {
    alert("DESPACHO: existen observaciones del Jefe pendientes");
    return false;
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



// =======================
// GENERAR PDF
// =======================
// =======================
// GENERAR PDF CON FOTOS
// =======================









// =======================
// COMPRIMIR IMAGEN COMO BLOB
// =======================


// =======================
// SUBIR ARCHIVO A STORAGE
// =======================
/*async function subirArchivoStorage(file, etapa, itemIndex) {

  const otId = localStorage.getItem("otActiva");

  if (!otId) {
    alert("No hay OT activa");
    return null;
  }

  const nombreArchivo = `${Date.now()}_${file.name}`;

  const ruta = `ots/${otId}/${etapa}/item_${itemIndex}/${nombreArchivo}`;

  const archivoRef = ref(storage, ruta);

  await uploadBytes(archivoRef, file);

  const url = await getDownloadURL(archivoRef);

  return url;
}

async function eliminarArchivoStorage(urlArchivo) {

  if (!urlArchivo) return;

  try {
    const archivoRef = ref(storage, urlArchivo);

    await deleteObject(archivoRef);

    console.log("Archivo eliminado de Firebase Storage ✅");

  } catch (error) {
    console.warn("No se pudo eliminar archivo de Storage:", error);
  }
}*/



function calcularProgresoOTFlujo(ot) {
  const estado = obtenerEstadoOT(ot);

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




function mostrarAlertasJefe(ot) {

  const lista = document.getElementById("listaAlertasJefe");
  if (!lista) return;

  lista.innerHTML = "";

  const alertas = new Set();

  // 🔥 INGRESO
  if (
    ot.ingreso?.some(item =>
      item.comentarios?.some(c => c.rol === "jefe_taller")
    )
  ) {
    alertas.add("📥 Ingreso");
  }

  // 🔥 EVALUACIÓN
  if (
    (
      ot.decisionEvaluacion?.comentario &&
      ot.decisionEvaluacion.comentario.trim() !== ""
    ) ||
    ot.evaluacion?.some(item =>
      item.comentarios?.some(c => c.rol === "jefe_taller")
    )
  ) {
    alertas.add("📋 Evaluación");
  }

  // 🔥 OVERHAUL
  if (
    ot.overhaul?.some(item =>
      item.comentarios?.some(c => c.rol === "jefe_taller")
    )
  ) {
    alertas.add("🔧 Overhaul");
  }

  // 🔥 PRUEBAS MECÁNICAS
  if (
    ot.pruebas?.mecanico?.some(item =>
      item.comentarios?.some(c => c.rol === "jefe_taller")
    )
  ) {
    alertas.add("🛠 Pruebas Mecánicas");
  }

  // 🔥 PRUEBAS ELÉCTRICAS
  if (
    ot.pruebas?.electrico?.some(item =>
      item.comentarios?.some(c => c.rol === "jefe_taller")
    )
  ) {
    alertas.add("⚡ Pruebas Eléctricas");
  }

  // 🔥 DESPACHO
if (

  // comentarios generales
  ot.despacho?.comentarios?.some(
    c => c.rol === "jefe_taller"
  )

  ||

  // preparación
  ot.despacho?.preparacion?.some(item =>
    item.comentarios?.some(
      c => c.rol === "jefe_taller"
    )
  )

  ||

  // despacho final
  ot.despacho?.final?.some(item =>
    item.comentarios?.some(
      c => c.rol === "jefe_taller"
    )
  )

) {

  alertas.add("📦 Despacho");

}

  if (alertas.size === 0) {
    lista.innerHTML = `
      <p class="sin-alertas">
        No existen comentarios pendientes.
      </p>
    `;
  } else {
    alertas.forEach(alerta => {
      const div = document.createElement("div");
      div.className = "alerta-item";
      div.innerHTML = alerta;
      lista.appendChild(div);
    });
  }

  document.getElementById("modalAlertasJefe").style.display = "flex";
}

function cerrarModalAlertas() {
  document.getElementById("modalAlertasJefe").style.display = "none";
}

// =======================
// FUNCIONES GLOBALES PARA HTML
// =======================
window.guardarDatosOS = guardarDatosOS;

window.guardarIngreso = guardarIngreso;
window.aprobarIngreso = aprobarIngreso;

window.guardarEvaluacion = guardarEvaluacion;
window.aprobarEvaluacion = aprobarEvaluacion;



window.subirDocsSeccion = subirDocsSeccion;
window.guardarDespacho = guardarDespacho;
window.cerrarOT = cerrarOT;

window.cerrarModal = cerrarModal;
window.cerrarImagen = cerrarImagen;

window.verImagenModal = verImagenModal;


window.toggleIngreso = toggleIngreso;
window.subirFotoIngreso = subirFotoIngreso;
window.eliminarFotoIngreso = eliminarFotoIngreso;
window.agregarComentarioItem = agregarComentarioItem;
window.eliminarComentarioIngreso = eliminarComentarioIngreso;

window.toggleEvaluacion = toggleEvaluacion;
window.subirFotoEvaluacion = subirFotoEvaluacion;
window.eliminarFotoEvaluacion = eliminarFotoEvaluacion;
window.agregarComentarioEvaluacion = agregarComentarioEvaluacion;
window.eliminarComentarioEvaluacion = eliminarComentarioEvaluacion;


window.abrirDocSeccion = abrirDocSeccion;
window.eliminarDocSeccion = eliminarDocSeccion;
window.verImagenModal = verImagenModal;

window.aprobarOverhaulDesdeEvaluacion = aprobarOverhaulDesdeEvaluacion;
window.rechazarOverhaulDesdeEvaluacion = rechazarOverhaulDesdeEvaluacion;

window.renderDocsDecisionEvaluacionPreview = renderDocsDecisionEvaluacionPreview;
window.abrirArchivoTemporal = abrirArchivoTemporal;

window.abrirDocumentoDecisionEvaluacion = abrirDocumentoDecisionEvaluacion;

window.eliminarComentarioDecisionEvaluacion = eliminarComentarioDecisionEvaluacion;

window.cargarRepuestosExcel = cargarRepuestosExcel;
window.abrirModalRepuestos = abrirModalRepuestos;
window.cerrarModalRepuestos = cerrarModalRepuestos;
window.guardarRepuestosUsados = guardarRepuestosUsados;
window.renderRepuestosModal = renderRepuestosModal;

window.subirDocsSeccion = subirDocsSeccion;

window.responderComentarioJefe = responderComentarioJefe;

window.agregarComentarioDespacho = agregarComentarioDespacho;
window.renderComentariosDespacho = renderComentariosDespacho;
window.responderComentarioJefeDespacho = responderComentarioJefeDespacho;
window.eliminarComentarioDespacho = eliminarComentarioDespacho;

window.abrirModalGantt = abrirModalGantt;
window.cerrarModalGantt = cerrarModalGantt;
window.generarCartaGantt = generarCartaGantt;

window.cerrarModalGanttVisual = cerrarModalGanttVisual;
window.volverFormularioGantt = volverFormularioGantt;

window.zoomGantt = zoomGantt;
window.irHoyGantt = irHoyGantt;

window.renderCartaGanttProject = renderCartaGanttProject;
window.toggleEtapaGantt = toggleEtapaGantt;

window.recalcularGanttAutomatico = recalcularGanttAutomatico;

window.generarPDF = generarInformeFinalPDF;

window.obtenerResumenEjecutivoInforme = obtenerResumenEjecutivoInforme;

window.renderComentariosItem = renderComentariosItem;

window.renderComentariosEvaluacion = renderComentariosEvaluacion;

window.cargarGanttGuardado = cargarGanttGuardado;

window.renderCartaGantt = renderCartaGantt;

window.actualizarEstadoGanttDesdeChecklist = actualizarEstadoGanttDesdeChecklist;

window.descargarGanttExcel = descargarGanttExcel;

window.descargarGanttPDFProfesional = descargarGanttPDFProfesional;