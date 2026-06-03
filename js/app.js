const usuario = JSON.parse(
  localStorage.getItem("usuarioActivo")
);

if (!usuario) {
  window.location.replace("index.html");
}

import { db, auth, storage } from "./firebase-config.js";

import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL,
  getBytes
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

console.log("🔥 Firebase conectado correctamente");
console.log(db);
console.log(auth);
console.log(storage);

// =======================
// VARIABLES GLOBALES
// =======================
let ot = null;
let listaOTs = [];


// =======================
// VALIDAR ROLES
// =======================
function esJefeTaller() {
  return usuario && usuario.rol === "jefe_taller";
}

function esUsuarioTaller() {
  return usuario && usuario.rol === "usuario_taller";
}

// =======================
// APLICAR PERMISOS VISUALES
// =======================
function aplicarPermisosRol() {

  if (!usuario) return;

  if (esUsuarioTaller()) {
    document
      .querySelectorAll(".solo-jefe")
      .forEach(el => {
        el.style.display = "none";
      });
  }

  if (esJefeTaller()) {
    document
      .querySelectorAll(".solo-usuario")
      .forEach(el => {
        el.style.display = "none";
      });
  }
}

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

function habilitarTab(nombre) {
  const tab = document.querySelector(`[data-tab="${nombre}"]`);
  if (!tab) {
    console.warn("Tab no encontrada:", nombre);
    return;
  }
  tab.classList.remove("disabled");
}

function habilitarTabsPlanificacionJefe() {

  if (!esJefeTaller()) return;

  habilitarTab("ingreso");
  habilitarTab("evaluacion");
  habilitarTab("overhaul");
  habilitarTab("pruebas");
  habilitarTab("despacho");

  console.log("Tabs desbloqueadas para planificación Jefe de Taller ✅");
}

// =======================
// INGRESO (CARGAR EXCEL)
// =======================
function cargarIngreso() {

  const file = document.getElementById("excelIngreso").files[0];

  if (!file) return alert("Debes subir el Excel");

  const reader = new FileReader();

  reader.onload = function(e) {

    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const checklist = json
      .flat()
      .filter(x => x)
      .map(x => ({
        item: x,
        ok: false,
        fotos: [],
        comentarios: []
      }));

    ot.ingreso = checklist;

    guardarCambiosOT();
    renderIngreso();
  };

  reader.readAsArrayBuffer(file);
}

// =======================
// RENDER INGRESO
// =======================
function renderIngreso() {

  const cont = document.getElementById("listaIngreso");
  if (!cont) return;

  cont.innerHTML = "";

  if (!ot.ingreso) return;

  ot.ingreso.forEach((item, i) => {

      // 🔥 NORMALIZAR DATOS ANTIGUOS
    if (!item.comentarios) item.comentarios = [];
    if (!item.fotos) item.fotos = [];

    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <label>
        <input type="checkbox" ${item.ok ? "checked" : ""} onchange="toggleIngreso(${i})">
        ${item.item}
      </label>

      <input 
        type="file"
        accept="image/*"
        multiple
        onchange="subirFotoIngreso(event, ${i})"
>
      <div id="fotos-ingreso-${i}"></div>

      <hr>

      <input id="tecnico-${i}" placeholder="Técnico">
      <input id="comentario-${i}" placeholder="Trabajo realizado">

      <button onclick="agregarComentarioItem(${i})">Agregar</button>

      <div id="comentarios-ingreso-${i}"></div>
    `;

    cont.appendChild(div);

    mostrarFotosIngreso(i);
    renderComentariosItem(i);
  });
}

// =======================
// CHECK
// =======================
function toggleIngreso(i) {
  if (OTBloqueada()) return;

  ot.ingreso[i].ok = !ot.ingreso[i].ok;

  actualizarEstadoGanttDesdeChecklist();

  guardarCambiosOT();

  if (ot.gantt?.actividades?.length) {
    renderCartaGantt();
  }
}

// =======================
// FOTOS
// =======================
async function subirFotoIngreso(e, i) {

  if (OTBloqueada()) return;

  const files = Array.from(e.target.files);

  if (!files.length) return;

  try {

    if (!ot.ingreso[i].fotos) {
      ot.ingreso[i].fotos = [];
    }

    for (const file of files) {

      const imagenBlob = await comprimirImagenBlob(file);

      console.log("Imagen optimizada:", {
        originalKB: Math.round(file.size / 1024),
        optimizadaKB: Math.round(imagenBlob.size / 1024)
      });

      const imagenComprimida = new File(
        [imagenBlob],
        `ingreso_${Date.now()}.jpg`,
        { type: "image/jpeg" }
      );

      const urlFoto = await subirArchivoStorage(
        imagenComprimida,
        "ingreso",
        i
      );

      ot.ingreso[i].fotos.push(urlFoto);
    }

    await guardarCambiosOT();

    mostrarFotosIngreso(i);

    e.target.value = "";

  } catch (error) {
    console.error("Error subiendo fotos ingreso:", error);
    alert("Error al subir las imágenes de ingreso");
  }
}

function mostrarFotosIngreso(i) {

  const div = document.getElementById(`fotos-ingreso-${i}`);
  if (!div) return;

  div.innerHTML = "";

  ot.ingreso[i].fotos.forEach((foto, index) => {

    const cont = document.createElement("div");
    cont.className = "foto-box";

    const img = document.createElement("img");
    img.src = foto;
    img.style.cursor = "pointer";
    img.onclick = () => verImagenModal(foto);
    img.width = 100;

    const btn = document.createElement("button");
    btn.innerHTML = "&times;";

    btn.className = "btn-delete-img";

    btn.onclick = () => eliminarFotoIngreso(i, index);

    cont.appendChild(img);
    cont.appendChild(btn);

    div.appendChild(cont);
  });
}

function eliminarFotoIngreso(i, index) {

  if (OTBloqueada()) return;

  if (!confirm("¿Eliminar foto?")) return;

  ot.ingreso[i].fotos.splice(index, 1);

  guardarCambiosOT();
  mostrarFotosIngreso(i);
}

// =======================
// COMENTARIOS
// =======================
function agregarComentarioItem(i) {

  if (OTBloqueada()) return;

  const nombre = document.getElementById(`tecnico-${i}`).value;
  const texto = document.getElementById(`comentario-${i}`).value;

  if (!nombre || !texto) {
    alert("Completa técnico y comentario");
    return;
  }

  ot.ingreso[i].comentarios.push({
  nombre,
  texto,
  fecha: new Date().toLocaleString(),
  rol: usuario?.rol || "usuario_taller",

  atendido: esJefeTaller() ? false : true,
  respuestaUsuario: "",
  atendidoPor: "",
  fechaAtendido: ""
});

if (esJefeTaller()) {
  ot.alertaJefe = true;
}

  guardarCambiosOT();
  renderComentariosItem(i);

  document.getElementById(`tecnico-${i}`).value = "";
  document.getElementById(`comentario-${i}`).value = "";
}

function renderComentariosItem(i) {

  const cont = document.getElementById(`comentarios-ingreso-${i}`);
  if (!cont) return;

  cont.innerHTML = "";

  // 🔥 SOLUCIÓN CLAVE
  if (!ot.ingreso[i].comentarios) {
    ot.ingreso[i].comentarios = [];
  }

  ot.ingreso[i].comentarios.forEach((c, index) => {

    const div = document.createElement("div");
    div.className = c.rol === "jefe_taller"
  ? "comentario-card comentario-jefe"
  : "comentario-card";

    div.innerHTML = `
  <strong>👨‍🔧 ${c.nombre}</strong>
  <p class="comentario-fecha">${c.fecha}</p>
  <p>${c.texto}</p>

  ${
    c.rol === "jefe_taller" && c.atendido !== true && esUsuarioTaller()
      ? `<button 
          class="btn-success"
          onclick="responderComentarioJefe('ingreso', ${i}, ${index})">
          ✅ Responder observación
        </button>`
      : ""
  }

  ${
    c.rol === "jefe_taller" && c.atendido === true
      ? `<div class="respuesta-observacion">
          <strong>✅ Respondido por ${c.atendidoPor || "Usuario Taller"}</strong>
          <p>${c.respuestaUsuario || ""}</p>
          <small>${c.fechaAtendido || ""}</small>
        </div>`
      : ""
  }

  ${
  esJefeTaller()
    ? `<button 
        class="btn-delete-comment"
        onclick="eliminarComentarioIngreso(${i}, ${index})">
        🗑
      </button>`
    : ""
}
`;

    cont.appendChild(div);
  });
}

function eliminarComentarioIngreso(i, index) {

  if (OTBloqueada()) return;

  if (!confirm("¿Eliminar comentario?")) return;

  ot.ingreso[i].comentarios.splice(index, 1);

  guardarCambiosOT();
  renderComentariosItem(i);
}

// =======================
// VALIDAR INGRESO
// =======================
function validarIngresoCompleto() {

  if (!ot.ingreso.length) return alert("Carga checklist"), false;

  const ok = ot.ingreso.every(i => i.ok);
  const fotos = ot.ingreso.every(i => i.fotos.length > 0);
  const comentarios = ot.ingreso.every(i => i.comentarios && i.comentarios.length > 0);

  if (!ok) return alert("Checklist incompleto"), false;
  if (!fotos) return alert("Debes ingresar evidencia fotografica"), false;
  if (!comentarios) return alert("Debes ingresar comentarios"), false;

  return true;
}

// =======================
// APROBAR INGRESO
// =======================
function aprobarIngreso() {

  if (!validarIngresoCompleto()) return;

  ot.ingresoAprobado = true;

  ot.estado = obtenerEstadoOT(ot);

  guardarCambiosOT();

  habilitarTab("evaluacion");

  alert("Ingreso completado ✅");
}

// =======================
// GUARDAR INGRESO
// =======================
function guardarIngreso() {

  if (!ot) {
    alert("No hay OT cargada");
    return;
  }

  guardarCambiosOT();

  alert("Progreso guardado correctamente ✅");
}

// =======================
// GUARDAR
// =======================
async function guardarCambiosOT() {

  if (!ot) return;

  const id = localStorage.getItem("otActiva");

  if (!id) {
    alert("No hay OT activa");
    return;
  }

  try {

    ot.estado = obtenerEstadoOT(ot);

    await updateDoc(doc(db, "ots", id), {
      ...ot,
      estado: ot.estado,
      fechaActualizacion: serverTimestamp()
    });

    console.log("OT actualizada en Firebase ✅");

  } catch (error) {
    console.error("Error guardando OT:", error);
    alert("Error al guardar cambios en Firebase");
  }
}

function obtenerEstadoOT(ot) {

  if (!ot) return "INGRESO";

  if (ot.estado === "CERRADA" || ot.cerrada === true) {
    return "CERRADA";
  }

  if (!ot.ingresoAprobado) return "INGRESO";

  // Evaluación todavía no tiene decisión del jefe
  if (!ot.evaluacionAprobada) return "EVALUACION";

  // Si evaluación fue rechazada, saltar directo a despacho
  if (ot.overhaulRequerido === false) return "DESPACHO";

  // Si evaluación fue aprobada, sigue overhaul normal
  if (ot.overhaulRequerido === true && !ot.overhaulAprobado) {
    return "OVERHAUL";
  }

  if (!ot.pruebasAprobado) return "PRUEBAS";

  return "DESPACHO";
}

// =======================
// BLOQUEO OT CERRADA
// =======================
function OTBloqueada() {
  return ot && (ot.estado === "CERRADA" || ot.cerrada === true);
}

// =======================
// APLICAR MODO SOLO LECTURA
// =======================
function aplicarModoSoloLectura() {

  if (!OTBloqueada()) return;

  document
    .querySelectorAll("input, textarea, select, button")
    .forEach(el => {

      if (
        el.classList.contains("tab") ||
        el.classList.contains("permitido-bloqueo")
      ) return;

      el.disabled = true;
      el.style.opacity = "0.45";
      el.style.cursor = "not-allowed";
    });

  document
    .querySelectorAll('input[type="file"]')
    .forEach(file => {
      file.disabled = true;
      file.style.pointerEvents = "none";
      file.style.opacity = "0.45";
    });

  console.log("🔒 OT cerrada: modo solo lectura aplicado");
}

function cargarEvaluacion() {
  const file = document.getElementById("excelEvaluacion").files[0];

  if (!file) {
    alert("Debes subir el Excel");
    return;
  }

  const reader = new FileReader();

  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const checklist = json
      .flat()
      .filter(x => x)
      .map(x => ({
        item: x,
        ok: false,
        fotos: [],
        comentarios: []
      }));

    // ✅ GUARDAR BIEN EN LA OT
    ot.evaluacion = checklist;

    // ✅ GUARDAR BIEN EN LOCALSTORAGE
    guardarCambiosOT();

    renderEvaluacion();
  };

  reader.readAsArrayBuffer(file);
}

async function subirFotoEvaluacion(e, i) {

  if (OTBloqueada()) return;

  const files = Array.from(e.target.files);

  if (!files.length) return;

  try {

    if (!ot.evaluacion[i].fotos) {
      ot.evaluacion[i].fotos = [];
    }

    for (const file of files) {

      const imagenBlob = await comprimirImagenBlob(file);

      console.log("Imagen optimizada:", {
        originalKB: Math.round(file.size / 1024),
        optimizadaKB: Math.round(imagenBlob.size / 1024)
      });

      const imagenComprimida = new File(
        [imagenBlob],
        `evaluacion_${Date.now()}.jpg`,
        { type: "image/jpeg" }
      );

      const urlFoto = await subirArchivoStorage(
        imagenComprimida,
        "evaluacion",
        i
      );

      ot.evaluacion[i].fotos.push(urlFoto);
    }

    await guardarCambiosOT();

    mostrarFotosEvaluacion(i);

    e.target.value = "";

  } catch (error) {
    console.error("Error subiendo fotos evaluación:", error);
    alert("Error al subir las imágenes de evaluación");
  }
} 

function renderEvaluacion() {

  const cont = document.getElementById("listaEvaluacion");
  if (!cont) return;

  cont.innerHTML = "";

  if (!ot.evaluacion) return;

  ot.evaluacion.forEach((item, i) => {

    // 🔥 NORMALIZAR
    if (!item.fotos) item.fotos = [];
    if (!item.comentarios) item.comentarios = [];

    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <label>
        <input type="checkbox" ${item.ok ? "checked" : ""} onchange="toggleEvaluacion(${i})">
        ${item.item}
      </label>

      <input 
        type="file"
        accept="image/*"
        multiple    
        onchange="subirFotoEvaluacion(event, ${i})"
      >

      <div id="fotos-evaluacion-${i}"></div>

      <hr>

      <input id="tecnico-eval-${i}" placeholder="Técnico">
      <input id="comentario-eval-${i}" placeholder="Trabajo realizado">

      <button onclick="agregarComentarioEvaluacion(${i})">Agregar</button>

      <div id="comentarios-evaluacion-${i}"></div>
    `;

    cont.appendChild(div);

    mostrarFotosEvaluacion(i);
    renderComentariosEvaluacion(i);
  });
}

function toggleEvaluacion(i) {
  if (OTBloqueada()) return;

  ot.ingreso[i].ok = !ot.ingreso[i].ok;

  actualizarEstadoGanttDesdeChecklist();

  guardarCambiosOT();

  if (ot.gantt?.actividades?.length) {
    renderCartaGantt();
  }
}


function mostrarFotosEvaluacion(i) {

  const div = document.getElementById(`fotos-evaluacion-${i}`);
  if (!div) return;

  div.innerHTML = "";

  ot.evaluacion[i].fotos.forEach((foto, index) => {

    const cont = document.createElement("div");
    cont.className = "foto-box";

    const img = document.createElement("img");
    img.src = foto;
    img.style.cursor = "pointer";
    img.onclick = () => verImagenModal(foto);
    img.width = 100;

    const btn = document.createElement("button");
    btn.innerHTML = "&times;";

    btn.className = "btn-delete-img";

    btn.onclick = () => eliminarFotoEvaluacion(i, index);

    cont.appendChild(img);
    cont.appendChild(btn);

    div.appendChild(cont);
  });
}

function eliminarFotoEvaluacion(i, index) {

  if (OTBloqueada()) return;

  if (!confirm("¿Eliminar foto?")) return;

  ot.evaluacion[i].fotos.splice(index, 1);

  guardarCambiosOT();
  mostrarFotosEvaluacion(i);
}

function agregarComentarioEvaluacion(i) {

  if (OTBloqueada()) return;

  const nombre = document.getElementById(`tecnico-eval-${i}`).value;
  const texto = document.getElementById(`comentario-eval-${i}`).value;

  if (!nombre || !texto) {
    alert("Completa técnico y comentario");
    return;
  }

  ot.evaluacion[i].comentarios.push({
  nombre,
  texto,
  fecha: new Date().toLocaleString(),
  rol: usuario?.rol || "usuario_taller",

  atendido: esJefeTaller() ? false : true,
  respuestaUsuario: "",
  atendidoPor: "",
  fechaAtendido: ""
});

if (esJefeTaller()) {
  ot.alertaJefe = true;
}

  guardarCambiosOT();
  renderComentariosEvaluacion(i);

  document.getElementById(`tecnico-eval-${i}`).value = "";
  document.getElementById(`comentario-eval-${i}`).value = "";
}

function renderComentariosEvaluacion(i) {

  const cont = document.getElementById(`comentarios-evaluacion-${i}`);
  if (!cont) return;

  cont.innerHTML = "";

  const comentarios = ot.evaluacion[i].comentarios || [];

  comentarios.forEach((c, index) => {

    const div = document.createElement("div");
    div.className = c.rol === "jefe_taller"
  ? "comentario-card comentario-jefe"
  : "comentario-card";

    div.innerHTML = `
  <strong>👨‍🔧 ${c.nombre}</strong>
  <p class="comentario-fecha">${c.fecha}</p>
  <p>${c.texto}</p>

  ${
    c.rol === "jefe_taller" && c.atendido !== true && esUsuarioTaller()
      ? `<button 
          class="btn-success"
          onclick="responderComentarioJefe('evaluacion', ${i}, ${index})">
          ✅ Responder observación
        </button>`
      : ""
  }

  ${
    c.rol === "jefe_taller" && c.atendido === true
      ? `<div class="respuesta-observacion">
          <strong>✅ Respondido por ${c.atendidoPor || "Usuario Taller"}</strong>
          <p>${c.respuestaUsuario || ""}</p>
          <small>${c.fechaAtendido || ""}</small>
        </div>`
      : ""
  }

  ${
  esJefeTaller()
    ? `<button 
        class="btn-delete-comment"
        onclick="eliminarComentarioEvaluacion(${i}, ${index})">
        🗑
      </button>`
    : ""
}
`;

    cont.appendChild(div);
  });
}

function validarEvaluacionCompleta() {

  if (!ot.evaluacion || ot.evaluacion.length === 0) {
    alert("Debes cargar checklist");
    return false;
  }

  const checklist = ot.evaluacion.every(i => i.ok);
  const fotos = ot.evaluacion.every(i => i.fotos && i.fotos.length > 0);
  const comentarios = ot.evaluacion.every(i => i.comentarios && i.comentarios.length > 0);

  if (!checklist) {
    alert("Checklist incompleto");
    return false;
  }

  if (!fotos) {
    alert("Debes subir evidencia fotográfica en todos los ítems");
    return false;
  }

  if (!comentarios) {
    alert("Todos los ítems deben tener comentarios");
    return false;
  }

  return true;
}

function eliminarComentarioEvaluacion(i, index) {

  if (OTBloqueada()) return;

  if (!confirm("¿Eliminar comentario?")) return;

  ot.evaluacion[i].comentarios.splice(index, 1);

  guardarCambiosOT();
  renderComentariosEvaluacion(i);
}


function aprobarEvaluacion() {

  if (!esJefeTaller()) {
  alert("Solo Jefe de Taller puede aprobar");
  return;
}

  // 🔥 VALIDACIÓN COMPLETA
  if (!validarEvaluacionCompleta()) return;

  ot.evaluacionAprobada = true;

  ot.estado = obtenerEstadoOT(ot);

  guardarCambiosOT();

  habilitarTab("overhaul");

  alert("Evaluación aprobada correctamente ✅");
}

// =======================
// DECISIÓN JEFE TALLER - EVALUACIÓN
// =======================
async function subirDocumentoDecisionEvaluacion(file, resultado) {

  const urlArchivo = await subirArchivoStorage(
    file,
    `decision_evaluacion_${resultado.toLowerCase()}`,
    "documentos"
  );

  return {
    nombre: file.name,
    tipo: file.type,
    url: urlArchivo,
    fecha: new Date().toLocaleString()
  };
}

async function aprobarOverhaulDesdeEvaluacion() {

  if (OTBloqueada()) return;

  if (!esJefeTaller()) {
    alert("Solo Jefe de Taller puede aprobar Overhaul desde Evaluación");
    return;
  }

  if (!validarEvaluacionCompleta()) return;

  const comentario = document
    .getElementById("comentarioDecisionEvaluacion")
    .value
    .trim();

  const inputDocs = document.getElementById("docsDecisionEvaluacion");
  const files = inputDocs.files;

  if (!comentario) {
    alert("Debes ingresar comentario de aprobación");
    return;
  }

  if (!files.length) {
    alert("Debes cargar al menos un documento de evidencia");
    return;
  }

  try {

    const documentos = [];

    for (let file of files) {
      const docSubido = await subirDocumentoDecisionEvaluacion(
        file,
        "APROBADO"
      );

      documentos.push(docSubido);
    }

    ot.decisionEvaluacion = {
      resultado: "APROBADO",
      comentario,
      documentos,
      usuario: usuario?.nombre || "Jefe Taller",
      rol: usuario?.rol || "jefe_taller",
      fecha: new Date().toLocaleString()
    };

    ot.evaluacionAprobada = true;
    ot.overhaulRequerido = true;

    ot.estado = obtenerEstadoOT(ot);

    await guardarCambiosOT();

    renderComentarioDecisionEvaluacion();

    habilitarTab("overhaul");
    cambiarTab("overhaul");

    alert("Overhaul aprobado. Se habilita etapa OVERHAUL ✅");

  } catch (error) {
    console.error("Error aprobando Overhaul:", error);
    alert("Error al guardar decisión de evaluación");
  }
}

async function rechazarOverhaulDesdeEvaluacion() {

  if (OTBloqueada()) return;

  if (!esJefeTaller()) {
    alert("Solo Jefe de Taller puede rechazar Overhaul desde Evaluación");
    return;
  }

  if (!validarEvaluacionCompleta()) return;

  const comentario = document
    .getElementById("comentarioDecisionEvaluacion")
    .value
    .trim();

  const inputDocs = document.getElementById("docsDecisionEvaluacion");
  const files = inputDocs.files;

  if (!comentario) {
    alert("Debes ingresar comentario de rechazo");
    return;
  }

  if (!files.length) {
    alert("Debes cargar al menos un documento de evidencia");
    return;
  }

  try {

    const documentos = [];

    for (let file of files) {
      const docSubido = await subirDocumentoDecisionEvaluacion(
        file,
        "RECHAZADO"
      );

      documentos.push(docSubido);
    }

    ot.decisionEvaluacion = {
      resultado: "RECHAZADO",
      comentario,
      documentos,
      usuario: usuario?.nombre || "Jefe Taller",
      rol: usuario?.rol || "jefe_taller",
      fecha: new Date().toLocaleString()
    };

    ot.evaluacionAprobada = true;
    ot.overhaulRequerido = false;

    // Saltamos etapas que no aplican
    ot.overhaulAprobado = true;
    ot.pruebasAprobado = true;

    if (!ot.despacho) {
      ot.despacho = {
        preparacion: [],
        final: []
      };
    }

    ot.estado = obtenerEstadoOT(ot);

    await guardarCambiosOT();

    renderComentarioDecisionEvaluacion();

    habilitarTab("despacho");
    cambiarTab("despacho");

    alert("Overhaul rechazado. La OS pasa a DESPACHO ✅");

  } catch (error) {
    console.error("Error rechazando Overhaul:", error);
    alert("Error al guardar decisión de evaluación");
  }
}

function renderDocsDecisionEvaluacionPreview() {
  const cont = document.getElementById("listaDocsDecisionEvaluacion");
  const input = document.getElementById("docsDecisionEvaluacion");

  if (!cont) return;

  cont.innerHTML = "";

  // 1) Mostrar documentos ya guardados en Firebase
  const docsGuardados = ot?.decisionEvaluacion?.documentos || [];

  docsGuardados.forEach((doc, index) => {
    const div = document.createElement("div");
    div.className = "doc-item";

    div.innerHTML = `
      <div class="doc-left">
        <span class="doc-icon">📄</span>
        <span class="doc-name">${doc.nombre}</span>
      </div>

      <div class="doc-actions">
        <button
          type="button"
          class="permitido-bloqueo"
          onclick="abrirDocumentoDecisionEvaluacion(${index})">
          👁
        </button>
      </div>
    `;

    cont.appendChild(div);
  });

  // 2) Mostrar archivos nuevos seleccionados, antes de aprobar/rechazar
  if (!input || !input.files.length) return;

  Array.from(input.files).forEach((file) => {
    const div = document.createElement("div");
    div.className = "doc-item";

    const urlTemp = URL.createObjectURL(file);

    div.innerHTML = `
      <div class="doc-left">
        <span class="doc-icon">📄</span>
        <span class="doc-name">${file.name}</span>
      </div>

      <div class="doc-actions">
        <button
          type="button"
          class="permitido-bloqueo"
          onclick="abrirArchivoTemporal('${urlTemp}')">
          👁
        </button>
      </div>
    `;

    cont.appendChild(div);
  });
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
// GUARDAR EVALUACIÓN
// =======================
function guardarEvaluacion() {

  if (!ot) {
    alert("No hay OT cargada");
    return;
  }

  guardarCambiosOT();

  alert("Evaluación guardada correctamente ✅");
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
    renderIngreso();
    habilitarTab("ingreso");
  }

  if (ot.ingresoAprobado) {
    habilitarTab("evaluacion");
  }

  if (ot.evaluacion?.length > 0) {
    renderEvaluacion();
    habilitarTab("evaluacion");
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
    renderOverhaul();
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

  if (esJefeTaller()) {
  habilitarTabsPlanificacionJefe();
}

if (ot.gantt) {
  renderCartaGantt();
}

const btnGantt =
  document.getElementById("btnGantt");

if (btnGantt) {

  btnGantt.innerHTML =
    ot.gantt?.actividades?.length
      ? "📊 Ver Carta Gantt"
      : "📊 Crear Carta Gantt";
}

aplicarModoSoloLectura();
aplicarPermisosRol();
renderUsuarioActivo();
};

function cambiarTab(nombre) {

  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".content").forEach(c => c.classList.remove("active"));

  const tab = document.querySelector(`[data-tab="${nombre}"]`);
  const content = document.getElementById(nombre);

  if (tab) tab.classList.add("active");
  if (content) content.classList.add("active");
}

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
// OVERHAUL (FIX COMPLETO)
// =======================

function cargarOverhaul() {

  const file = document.getElementById("excelOverhaul").files[0];

  if (!file) {
    alert("Debes subir el Excel de Overhaul");
    return;
  }

  const reader = new FileReader();

  reader.onload = function(e) {

    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const checklist = json
      .flat()
      .filter(x => x)
      .map(x => ({
        item: x,
        ok: false,
        fotos: [],
        comentarios: []
      }));

    ot.overhaul = checklist;

    guardarCambiosOT();

    renderOverhaul();
  };

  reader.readAsArrayBuffer(file);
}

function renderOverhaul() {

  const cont = document.getElementById("listaOverhaul");

  if (!cont) return;

  cont.innerHTML = "";

  if (!ot.overhaul) return;

  ot.overhaul.forEach((item, i) => {

    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <label>
        <input type="checkbox" onchange="toggleOverhaul(${i})" ${item.ok ? "checked" : ""}>
        ${item.item}
      </label>

      <input 
        type="file"
        accept="image/*"
        multiple
        onchange="subirFotoOverhaul(event, ${i})"
      >


      <div id="fotos-overhaul-${i}"></div>

      <hr>

      <input id="tec-overhaul-${i}" placeholder="Técnico">
      <input id="com-overhaul-${i}" placeholder="Trabajo realizado">

      <button onclick="agregarComentarioOverhaul(${i})">Agregar</button>

      <div id="comentarios-overhaul-${i}"></div>
    `;

    cont.appendChild(div);

    mostrarFotosOverhaul(i);
    renderComentariosOverhaul(i);
  });
}

function toggleOverhaul(i) {
   if (OTBloqueada()) return;

  ot.ingreso[i].ok = !ot.ingreso[i].ok;

  actualizarEstadoGanttDesdeChecklist();

  guardarCambiosOT();

  if (ot.gantt?.actividades?.length) {
    renderCartaGantt();
  }
}

async function subirFotoOverhaul(e, i) {

  if (OTBloqueada()) return;

  const files = Array.from(e.target.files);

  if (!files.length) return;

  try {

    if (!ot.overhaul[i].fotos) {
      ot.overhaul[i].fotos = [];
    }

    for (const file of files) {

      const imagenBlob = await comprimirImagenBlob(file);

      console.log("Imagen optimizada:", {
        originalKB: Math.round(file.size / 1024),
        optimizadaKB: Math.round(imagenBlob.size / 1024)
      });

      const imagenComprimida = new File(
        [imagenBlob],
        `overhaul_${Date.now()}.jpg`,
        { type: "image/jpeg" }
      );

      const urlFoto = await subirArchivoStorage(
        imagenComprimida,
        "overhaul",
        i
      );

      ot.overhaul[i].fotos.push(urlFoto);
    }

    await guardarCambiosOT();

    mostrarFotosOverhaul(i);

    e.target.value = "";

  } catch (error) {
    console.error("Error subiendo fotos overhaul:", error);
    alert("Error al subir las imágenes de Overhaul");
  }
}

function mostrarFotosOverhaul(i) {

  const div = document.getElementById(`fotos-overhaul-${i}`);
  if (!div) return;

  div.innerHTML = "";

  (ot.overhaul[i].fotos || []).forEach((foto, index) => {

    const container = document.createElement("div");
    container.className = "foto-box";

    const img = document.createElement("img");
    img.src = foto; // ✅ CORRECTO
    img.width = 100;
    img.style.cursor = "pointer";
    img.onclick = () => verImagenModal(foto);
    img.width = 100;


    const btn = document.createElement("button");
    btn.innerHTML = "&times;";

    btn.className = "btn-delete-img";

    btn.onclick = () => eliminarFotoOverhaul(i, index);

    container.appendChild(img);
    container.appendChild(btn);

    div.appendChild(container);
  });
}

function eliminarFotoOverhaul(i, index) {

  if (OTBloqueada()) return;

  const confirmar = confirm("¿Eliminar foto?");
  if (!confirmar) return;

  if (!ot.overhaul[i].fotos) return;

  ot.overhaul[i].fotos.splice(index, 1);

  guardarCambiosOT();

  mostrarFotosOverhaul(i);
}

function agregarComentarioOverhaul(i) {

  if (OTBloqueada()) return;

  const nombre = document.getElementById(`tec-overhaul-${i}`).value;
  const texto = document.getElementById(`com-overhaul-${i}`).value;

  if (!nombre || !texto) {
    alert("Completa técnico y comentario");
    return;
  }

  if (!ot.overhaul[i].comentarios) {
    ot.overhaul[i].comentarios = [];
  }

  ot.overhaul[i].comentarios.push({
  nombre,
  texto,
  fecha: new Date().toLocaleString(),
  rol: usuario?.rol || "usuario_taller",

  atendido: esJefeTaller() ? false : true,
  respuestaUsuario: "",
  atendidoPor: "",
  fechaAtendido: ""
});

if (esJefeTaller()) {
  ot.alertaJefe = true;
}

  guardarCambiosOT();

  renderComentariosOverhaul(i);

  document.getElementById(`tec-overhaul-${i}`).value = "";
  document.getElementById(`com-overhaul-${i}`).value = "";
}

function renderComentariosOverhaul(i) {

  const cont = document.getElementById(`comentarios-overhaul-${i}`);
  if (!cont) return;

  cont.innerHTML = "";

  (ot.overhaul[i].comentarios || []).forEach((c, index) => {

    const div = document.createElement("div");
    div.className = c.rol === "jefe_taller"
  ? "comentario-card comentario-jefe"
  : "comentario-card";

    div.innerHTML = `
  <strong>👨‍🔧 ${c.nombre}</strong>
  <p class="comentario-fecha">${c.fecha}</p>
  <p>${c.texto}</p>

  ${
    c.rol === "jefe_taller" && c.atendido !== true && esUsuarioTaller()
      ? `<button 
          class="btn-success"
          onclick="responderComentarioJefe('overhaul', ${i}, ${index})">
          ✅ Responder observación
        </button>`
      : ""
  }

  ${
    c.rol === "jefe_taller" && c.atendido === true
      ? `<div class="respuesta-observacion">
          <strong>✅ Respondido por ${c.atendidoPor || "Usuario Taller"}</strong>
          <p>${c.respuestaUsuario || ""}</p>
          <small>${c.fechaAtendido || ""}</small>
        </div>`
      : ""
  }

  ${
  esJefeTaller()
    ? `<button 
        class="btn-delete-comment"
        onclick="eliminarComentarioOverhaul(${i}, ${index})">
        🗑
      </button>`
    : ""
}
`;

    cont.appendChild(div);
  });
}

function eliminarComentarioOverhaul(i, index) {

  if (OTBloqueada()) return;

  if (!confirm("¿Eliminar registro?")) return;

  ot.overhaul[i].comentarios.splice(index, 1);

  guardarCambiosOT();
  renderComentariosOverhaul(i);
}

// =======================
// GUARDAR OVERHAUL
// =======================
function guardarOverhaul() {

  if (!ot) {
    alert("No hay OT cargada");
    return;
  }

  guardarCambiosOT();

  alert("Progreso de Overhaul guardado ✅");
}

// =======================
// APROBAR OVERHAUL
// =======================
function aprobarOverhaul() {


  if (!ot.overhaul || ot.overhaul.length === 0) {
    alert("Debes cargar el checklist primero");
    return;
  }

  // ✅ validar checklist completo
  const checklistCompleto = ot.overhaul.every(i => i.ok);

  if (!checklistCompleto) {
    alert("Debes completar todo el checklist");
    return;
  }

  // ✅ validar fotos
  const conFotos = ot.overhaul.every(i => i.fotos && i.fotos.length > 0);

  if (!conFotos) {
    alert("Debes subir evidencia en todos los ítems");
    return;
  }

  // 🔥 (opcional pero recomendado)
  const conComentarios = ot.overhaul.every(
    i => i.comentarios && i.comentarios.length > 0
  );

  if (!conComentarios) {
    alert("Todos los ítems deben tener comentario del técnico");
    return;
  }

  // ✅ aprobar
  ot.overhaulAprobado = true;

  ot.estado = obtenerEstadoOT(ot);

  guardarCambiosOT();

  habilitarTab("pruebas");

  alert("Overhaul aprobado, se habilita PRUEBAS");
}

// =======================
// REPUESTOS OVERHAUL
// =======================

function cargarRepuestosExcel() {

  if (!esJefeTaller()) {
    alert("Solo Jefe de Taller puede cargar repuestos");
    return;
  }

  const file = document.getElementById("excelRepuestos").files[0];

  if (!file) {
    alert("Debes subir un archivo Excel de repuestos");
    return;
  }

  const reader = new FileReader();

  reader.onload = async function(e) {

    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const json = XLSX.utils.sheet_to_json(sheet, {
      header: 1
    });

    const repuestos = json
      .slice(1)
      .filter(row => row.length > 0)
      .map(row => ({
        codigo: row[0] || "",
        descripcion: row[1] || "",
        cantidad: row[2] || "",
        usado: false,
        comentario: "",
        tecnico: "",
        fecha: ""
      }));

    ot.repuestos = {
      items: repuestos,
      cargadoPor: usuario?.nombre || "Jefe Taller",
      fechaCarga: new Date().toLocaleString()
    };

    await guardarCambiosOT();

    alert("Listado de repuestos cargado correctamente ✅");
  };

  reader.readAsArrayBuffer(file);
}

function abrirModalRepuestos() {

  if (!ot.repuestos || !ot.repuestos.items || ot.repuestos.items.length === 0) {
    alert("No hay listado de repuestos cargado");
    return;
  }

  renderRepuestosModal();

  document.getElementById("modalRepuestos").style.display = "block";
}

function cerrarModalRepuestos() {
  document.getElementById("modalRepuestos").style.display = "none";
}

function renderRepuestosModal() {

  const cont = document.getElementById("listaRepuestosModal");
  if (!cont) return;

  cont.innerHTML = "";

  const tabla = document.createElement("div");
  tabla.className = "tabla-repuestos";

  tabla.innerHTML = `
    <div class="tabla-repuestos-header">
      <div>Usado</div>
      <div>Código</div>
      <div>Descripción</div>
      <div>Cantidad</div>
      <div>Comentario</div>
    </div>
  `;

  ot.repuestos.items.forEach((rep, index) => {

    const row = document.createElement("div");
    row.className = "tabla-repuestos-row";

    row.innerHTML = `
      <div>
        <input 
          type="checkbox"
          id="rep-check-${index}"
          ${rep.usado ? "checked" : ""}
          ${OTBloqueada() ? "disabled" : ""}
        >
      </div>

      <div>${rep.codigo || "-"}</div>

      <div>${rep.descripcion || "-"}</div>

      <div>${rep.cantidad || "-"}</div>

      <div>
        <input
          type="text"
          id="rep-com-${index}"
          placeholder="Comentario"
          value="${rep.comentario || ""}"
          ${OTBloqueada() ? "disabled" : ""}
        >
      </div>
    `;

    tabla.appendChild(row);
  });

  cont.appendChild(tabla);
}

async function guardarRepuestosUsados() {

  if (OTBloqueada()) {
    alert("La OS está cerrada. No se pueden editar repuestos.");
    return;
  }

  if (!ot.repuestos || !ot.repuestos.items) {
    alert("No hay repuestos cargados");
    return;
  }

  ot.repuestos.items.forEach((rep, index) => {
    const check = document.getElementById(`rep-check-${index}`);
    const comentario = document.getElementById(`rep-com-${index}`);

    rep.usado = check.checked;
    rep.comentario = comentario.value.trim();

    if (rep.usado) {
      rep.tecnico = usuario?.nombre || "Usuario Taller";
      rep.fecha = new Date().toLocaleString();
    }
  });

  await guardarCambiosOT();

  alert("Repuestos guardados correctamente ✅");

  cerrarModalRepuestos();
}

// =========================
// CARTA GANTT OVERHAUL
// =========================

function abrirModalGantt() {

  const modalForm = document.getElementById("modalGantt");
  const modalVisual = document.getElementById("modalGanttVisual");

  // 🔥 SI YA EXISTE GANTT
  if (ot.gantt && ot.gantt.actividades?.length) {

    renderCartaGantt();

    modalVisual.style.display = "flex";

    return;
  }

  // 🔥 PRIMER INGRESO
  cargarFormularioGantt();

  modalForm.style.display = "flex";
}

function cargarFormularioGantt() {

  if (!ot.gantt) return;

  document.getElementById("fechaInicioGantt").value =
    ot.gantt.fechaInicio || "";

  document.getElementById("fechaTerminoGantt").value =
    ot.gantt.fechaTermino || "";

  document.getElementById("diasRepuestos").value =
    ot.gantt.diasRepuestos || 0;

  document.getElementById("comentarioRepuestos").value =
    ot.gantt.comentarioRepuestos || "";
}

function cerrarModalGantt() {
  const modal = document.getElementById("modalGantt");
  if (modal) modal.style.display = "none";
}

function sumarDias(fecha, dias) {

  const nueva = new Date(fecha);

  let diasAgregados = 0;

  while (diasAgregados < dias) {

    nueva.setDate(nueva.getDate() + 1);

    const diaSemana = nueva.getDay();

    // 0 = domingo
    // 6 = sábado

    if (diaSemana !== 0 && diaSemana !== 6) {
      diasAgregados++;
    }
  }

  return nueva;
}

function formatearFecha(fecha) {
  return new Date(fecha).toLocaleDateString("es-CL");
}

function obtenerActividadesDesdeChecklist(
  etapa,
  checklist,
  fechaInicio,
  diasPorItem = 1
) {

  const actividades = [];

  if (!checklist || checklist.length === 0) {
    return actividades;
  }

  let fechaCursor = new Date(fechaInicio);

  checklist.forEach((item) => {

    actividades.push({
      etapa,
      actividad: item.item,
      inicio: fechaCursor.toISOString(),
      termino: sumarDias(fechaCursor, diasPorItem).toISOString(),
      duracion: diasPorItem,

      estado: item.ok
        ? "Completado"
        : "Planificado"
    });

    fechaCursor = sumarDias(
      fechaCursor,
      diasPorItem
    );

  });

  return actividades;
}

function obtenerActividadesDesdeChecklistDistribuido(
  etapa,
  checklist,
  fechaInicio,
  diasTotalesEtapa
) {

  const actividades = [];

  if (!checklist || checklist.length === 0) {
    return actividades;
  }

  let fechaCursor = new Date(fechaInicio);

  const cantidadItems = checklist.length;

  const duracionBase =
    Math.floor(diasTotalesEtapa / cantidadItems);

  let diasSobrantes =
    diasTotalesEtapa % cantidadItems;

  checklist.forEach((item) => {

    let duracion =
      Math.max(1, duracionBase);

    if (diasSobrantes > 0) {
      duracion += 1;
      diasSobrantes--;
    }

    actividades.push({
      etapa,
      actividad: item.item || "Actividad",
      inicio: fechaCursor.toISOString(),
      termino: sumarDias(fechaCursor, duracion - 1).toISOString(),
      duracion,
      estado: item.ok ? "Completado" : "Planificado"
    });

    fechaCursor = sumarDias(fechaCursor, duracion);
  });

  return actividades;
}


function cerrarModalGanttVisual() {
  const modal = document.getElementById("modalGanttVisual");
  if (modal) modal.style.display = "none";
}

function volverFormularioGantt() {
  const visual = document.getElementById("modalGanttVisual");
  const form = document.getElementById("modalGantt");

  if (visual) visual.style.display = "none";
  if (form) form.style.display = "flex";

  cargarGanttGuardado();
}

async function generarCartaGantt() {

  if (!esJefeTaller()) {
    alert("Solo Jefe de Taller puede generar Carta Gantt");
    return;
  }

  if (!ot) {
    alert("No hay OS cargada");
    return;
  }

  const fechaInicioInput = document.getElementById("ganttFechaInicio").value;
  const fechaTerminoInput = document.getElementById("ganttFechaTermino").value;
  const diasRepuestos = Number(document.getElementById("ganttDiasRepuestos").value || 0);
  const comentarioRepuestos = document.getElementById("ganttComentarioRepuestos").value.trim();

  if (!fechaInicioInput || !fechaTerminoInput) {
    alert("Debes indicar fecha inicio y término");
    return;
  }

  let fechaCursor = new Date(fechaInicioInput + "T00:00:00");
  const fechaTermino = new Date(fechaTerminoInput + "T00:00:00");

  const diferenciaMs = fechaTermino - fechaCursor;
  const diasTotales = Math.ceil(diferenciaMs / (1000 * 60 * 60 * 24));

  if (diasTotales <= 0) {
    alert("La fecha término debe ser mayor a la fecha inicio");
    return;
  }

  const actividades = [];

  const crear = (etapa, actividad, inicio, duracion, estado = "Planificado") => {
    const termino = sumarDias(inicio, duracion - 1);

    return {
      etapa,
      actividad,
      inicio: inicio.toISOString(),
      termino: termino.toISOString(),
      duracion: Number(duracion),
      estado
    };
  };


// =========================
// DISTRIBUCIÓN DE DÍAS
// =========================

const totalDiasPlan =
  Math.ceil(
    (fechaTermino - new Date(fechaInicioInput + "T00:00:00")) /
    (1000 * 60 * 60 * 24)
  );

const diasIngreso = 4;
const diasPruebasMecanicas = 3;
const diasPruebasElectricas = 3;

const diasFijos =
  diasIngreso +
  diasRepuestos +
  diasPruebasMecanicas +
  diasPruebasElectricas;

let diasRestantes =
  totalDiasPlan - diasFijos;

if (diasRestantes < 2) {
  alert("El rango de fechas es muy corto para distribuir la planificación");
  return;
}

const diasEvaluacion =
  Math.max(1, Math.floor(diasRestantes * 0.45));

const diasOverhaul =
  Math.max(1, diasRestantes - diasEvaluacion);

// =========================
// INGRESO
// =========================
const ingresoActs =
  obtenerActividadesDesdeChecklistDistribuido(
    "Ingreso",
    ot.ingreso,
    fechaCursor,
    diasIngreso
  );

actividades.push(...ingresoActs);
fechaCursor = sumarDias(fechaCursor, diasIngreso);

// =========================
// EVALUACIÓN
// =========================
const evalActs =
  obtenerActividadesDesdeChecklistDistribuido(
    "Evaluación",
    ot.evaluacion,
    fechaCursor,
    diasEvaluacion
  );

actividades.push(...evalActs);
fechaCursor = sumarDias(fechaCursor, diasEvaluacion);

// =========================
// REPUESTOS
// =========================
if (diasRepuestos > 0) {

  actividades.push(
    crear(
      "Repuestos",
      comentarioRepuestos || "Espera repuestos",
      fechaCursor,
      diasRepuestos,
      "Espera"
    )
  );

  fechaCursor = sumarDias(fechaCursor, diasRepuestos);
}

// =========================
// OVERHAUL
// =========================
const overhaulActs =
  obtenerActividadesDesdeChecklistDistribuido(
    "Overhaul",
    ot.overhaul,
    fechaCursor,
    diasOverhaul
  );

actividades.push(...overhaulActs);
fechaCursor = sumarDias(fechaCursor, diasOverhaul);

// =========================
// PRUEBAS MECÁNICAS
// =========================
const pruebasMec =
  obtenerActividadesDesdeChecklistDistribuido(
    "Pruebas Mecánicas",
    ot.pruebas?.mecanico,
    fechaCursor,
    diasPruebasMecanicas
  );

actividades.push(...pruebasMec);
fechaCursor = sumarDias(fechaCursor, diasPruebasMecanicas);

// =========================
// PRUEBAS ELÉCTRICAS
// =========================
const pruebasElec =
  obtenerActividadesDesdeChecklistDistribuido(
    "Pruebas Eléctricas",
    ot.pruebas?.electrico,
    fechaCursor,
    diasPruebasElectricas
  );

actividades.push(...pruebasElec);
fechaCursor = sumarDias(fechaCursor, diasPruebasElectricas);

  ot.gantt = {
    fechaInicio: fechaInicioInput,
    fechaTermino: fechaTerminoInput,
    fechaDespachoEstimada: fechaTermino.toISOString(),
    diasRepuestos,
    comentarioRepuestos,
    creadoPor: usuario?.nombre || "Jefe Taller",
    fechaCreacion: new Date().toLocaleString(),
    actividades
  };

  await guardarCambiosOT();

  const form = document.getElementById("modalGantt");
  const visual = document.getElementById("modalGanttVisual");

  if (form) form.style.display = "none";
  if (visual) visual.style.display = "flex";


renderCartaGantt();

document.getElementById("modalGantt").style.display = "none";

document.getElementById("modalGanttVisual").style.display = "flex";

  alert("Carta Gantt guardada correctamente ✅");
}

function cargarGanttGuardado() {

  const cont = document.getElementById("ganttResultado");

  if (!ot?.gantt) {
    if (cont) cont.innerHTML = "";
    return;
  }

  const g = ot.gantt;

  const fecha = document.getElementById("ganttFechaInicio");
  const termino = document.getElementById("ganttFechaTermino");
  const rep = document.getElementById("ganttDiasRepuestos");
  const com = document.getElementById("ganttComentarioRepuestos");

  if (fecha) fecha.value = g.fechaInicio || "";
  if (termino) termino.value = g.fechaTermino || "";
  if (rep) rep.value = g.diasRepuestos || 0;
  if (com) com.value = g.comentarioRepuestos || "";

  renderCartaGantt();
}

function renderCartaGantt() {

  const cont = document.getElementById("ganttResultado");
  if (!cont) return;

  if (!ot?.gantt?.actividades?.length) {
    cont.innerHTML = `<p class="sin-alertas">No existe Carta Gantt generada.</p>`;
    return;
  }

  const g = ot.gantt;
  const actividades = g.actividades;

  const fechaInicio = new Date(g.fechaInicio + "T00:00:00");
  const fechaTermino = new Date(g.fechaTermino + "T00:00:00");

  const diasTotales = Math.max(
  1,
  calcularDiasHabilesEntre(
    fechaInicio,
    fechaTermino
  )
);

  const colores = {
    Ingreso: "azul",
    Evaluación: "azul",
    Repuestos: "naranjo",
    Overhaul: "verde",
    "Pruebas Mecánicas": "morado",
    "Pruebas Eléctricas": "morado",
    Pruebas: "morado",
    Despacho: "cyan"
  };

  const meses = generarMesesGantt(fechaInicio, fechaTermino);
  const semanas = generarSemanasGantt(fechaInicio, fechaTermino);
  const anchoSemana = 86;
  const anchoTimeline = Math.max(760, semanas.length * anchoSemana);

  cont.innerHTML = `
    <div class="gantt-dashboard gantt-pro-dashboard">

      <div class="gantt-summary-grid gantt-summary-compact">

        <div class="gantt-summary-card azul">
          <span>🗓️ Fecha inicio</span>
          <strong>${formatearFecha(fechaInicio)}</strong>
        </div>

        <div class="gantt-summary-card verde">
          <span>🏁 Fecha estimada despacho</span>
          <strong>${formatearFecha(fechaTermino)}</strong>
        </div>

        <div class="gantt-summary-card morado">
          <span>⏱ Duración total estimada</span>
          <strong>${diasTotales} días</strong>
          <small>Días hábiles</small>
        </div>

        <div class="gantt-summary-card naranjo">
          <span>👤 Creado por</span>
          <strong>${g.creadoPor || "Jefe Taller"}</strong>
        </div>

      </div>

      <div class="gantt-section-header">
        <h3>📊 Línea de tiempo planificada</h3>

        <div class="gantt-tools">
          <span>Zoom</span>
          <button type="button" onclick="zoomGantt(-10)">−</button>
          <strong id="ganttZoomLabel">100%</strong>
          <button type="button" onclick="zoomGantt(10)">+</button>
          <button type="button" onclick="irHoyGantt()">📅 Hoy</button>
        </div>
      </div>

      <div class="gantt-board gantt-board-pro">
        <div class="gantt-board-inner">

        <div class="gantt-board-header gantt-board-header-pro">
          <div>Etapa</div>
          <div>Actividad</div>

          <div class="gantt-timeline-head" style="width:${anchoTimeline}px;">
            <div class="gantt-months">
              ${meses.map(m => `
                <span style="width:${m.width}%">${m.label}</span>
              `).join("")}
            </div>

            <div class="gantt-weeks">
              ${semanas.map(s => `
                <span>${s}</span>
              `).join("")}
            </div>
          </div>
        </div>

        ${actividades.map((act, index) => {

          const inicio = new Date(act.inicio);
          const termino = new Date(act.termino);

          const diffInicio =
          calcularDiasHabilesEntre(
            fechaInicio,
            inicio
          );

          const duracion = Math.max(1, act.duracion || 1);

          let left = (diffInicio / diasTotales) * 100;

              // Evita que una actividad quede fuera del timeline
              if (left > 97) {
                left = 97;
              }

              let width = (duracion / diasTotales) * 100;

              // Recorta si se pasa del final
              if (left + width > 100) {
                width = 100 - left;
              }

              // Ancho mínimo visible
              width = Math.max(3, width);


          const completado = act.estado === "Completado";

          const color = completado
            ? "completado"
            : colores[act.etapa] || "azul";

          return `
            <div class="gantt-board-row gantt-board-row-pro">

              <div>
                <span class="gantt-dot ${color}"></span>
                ${act.etapa}
              </div>

              <div>${act.actividad}</div>

              <div class="gantt-board-track gantt-track-pro" style="width:${anchoTimeline}px;">

                ${
                  index > 0
                    ? `<span class="gantt-link"></span>`
                    : ""
                }

                <div
                  class="gantt-board-bar ${color}"
                  style="left:${left}%; width:${width}%;">
                  ${completado ? "✓" : duracion + "d"}
                </div>

              </div>

            </div>
          `;
        }).join("")}

      </div>
      </div>

      <div class="gantt-legend">
        <span><b class="azul"></b> Ingreso</span>
        <span><b class="naranjo"></b> Repuestos</span>
        <span><b class="verde"></b> Overhaul</span>
        <span><b class="morado"></b> Pruebas</span>
        <span><b class="cyan"></b> Despacho</span>
      </div>

      <div class="gantt-note">
        ℹ Esta planificación es estimada. Las fechas reales pueden variar según avance del trabajo y disponibilidad de repuestos.
      </div>

    </div>
  `;
}


function actualizarEstadoGanttDesdeChecklist() {

  if (!ot?.gantt?.actividades?.length) return;

  const buscarItem = (etapa, actividad) => {

    let lista = [];

    if (etapa === "Ingreso") lista = ot.ingreso || [];
    if (etapa === "Evaluación") lista = ot.evaluacion || [];
    if (etapa === "Overhaul") lista = ot.overhaul || [];
    if (etapa === "Pruebas Mecánicas") lista = ot.pruebas?.mecanico || [];
    if (etapa === "Pruebas Eléctricas") lista = ot.pruebas?.electrico || [];

    return lista.find(item => item.item === actividad);
  };

  ot.gantt.actividades.forEach(act => {

    if (act.etapa === "Repuestos") return;

    const item = buscarItem(act.etapa, act.actividad);

    if (item) {
      act.estado = item.ok ? "Completado" : "Planificado";
    }
  });
}

let ganttZoom = 100;

function zoomGantt(valor) {
  ganttZoom += valor;

  if (ganttZoom < 80) ganttZoom = 80;
  if (ganttZoom > 150) ganttZoom = 150;

  const label = document.getElementById("ganttZoomLabel");
  if (label) label.textContent = `${ganttZoom}%`;

  const baseSemana = 86;
  const semanas = document.querySelectorAll(".gantt-weeks span").length;

  const nuevoAncho =
    Math.max(760, semanas * baseSemana * (ganttZoom / 100));

  document
    .querySelectorAll(".gantt-timeline-head, .gantt-track-pro")
    .forEach(el => {
      el.style.width = `${nuevoAncho}px`;
    });
}

function irHoyGantt() {
  const board = document.querySelector(".gantt-board-pro");
  if (!board) return;

  board.scrollTop = 0;
  board.scrollLeft = 0;
}

function generarMesesGantt(inicio, termino) {

  const meses = [];
  const totalMs = termino - inicio;

  let cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);

  while (cursor <= termino) {

    const inicioMes = new Date(cursor);
    const finMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

    const desde = inicioMes < inicio ? inicio : inicioMes;
    const hasta = finMes > termino ? termino : finMes;

    const width =
      ((hasta - desde) / totalMs) * 100;

    meses.push({
      label: cursor.toLocaleDateString("es-CL", {
        month: "long",
        year: "numeric"
      }).toUpperCase(),
      width: Math.max(width, 8)
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return meses;
}

function generarSemanasGantt(inicio, termino) {

  const semanas = [];
  const cursor = new Date(inicio);

  while (cursor <= termino) {

    const desde = new Date(cursor);
    const hasta = sumarDiasNaturales(desde, 4);

    const diaDesde = String(desde.getDate()).padStart(2, "0");
    const diaHasta = String(hasta.getDate()).padStart(2, "0");

    const mes = hasta
      .toLocaleDateString("es-CL", { month: "short" })
      .replace(".", "");

    semanas.push(
      `${diaDesde} - ${diaHasta} ${mes}`
    );

    cursor.setDate(cursor.getDate() + 7);
  }

  return semanas;
}

function sumarDiasNaturales(fecha, dias) {
  const nueva = new Date(fecha);
  nueva.setDate(nueva.getDate() + dias);
  return nueva;
}

function calcularDiasHabilesEntre(fechaInicio, fechaFin) {

  let contador = 0;

  const actual = new Date(fechaInicio);

  while (actual < fechaFin) {

    const dia = actual.getDay();

    if (dia !== 0 && dia !== 6) {
      contador++;
    }

    actual.setDate(actual.getDate() + 1);
  }

  return contador;
}


// =======================
// CARGAR CHECKLIST PRUEBAS
// =======================
function cargarChecklist(tipo) {

  const inputId = tipo === "mecanico" ? "excelMecanico" : "excelElectrico";
  const file = document.getElementById(inputId).files[0];

  if (!file) {
    alert("Debes subir el Excel");
    return;
  }

  const reader = new FileReader();

  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const checklist = json
      .flat()
      .filter(item => item)
      .map(item => ({
        item: item,
        ok: false,
        fotos: [],
        comentarios: [], // 🔥 PRO
        fecha: null
      }));

    if (!ot.pruebas) {
      ot.pruebas = { mecanico: [], electrico: [] };
    }

    ot.pruebas[tipo] = checklist;

    guardarCambiosOT();

    renderChecklist(tipo);
  };

  reader.readAsArrayBuffer(file);
}

// =======================
// RENDER PRUEBAS
// =======================
function renderChecklist(tipo) {

  const cont = document.getElementById(
    tipo === "mecanico" ? "listaMecanico" : "listaElectrico"
  );

  if (!cont) return;

  cont.innerHTML = "";

  if (!ot.pruebas || !ot.pruebas[tipo]) return;

  ot.pruebas[tipo].forEach((item, i) => {

    const fechaTexto = item.fecha 
      ? new Date(item.fecha).toLocaleString()
      : "Sin registro";

    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <label>
        <input type="checkbox" onchange="togglePrueba('${tipo}', ${i})" ${item.ok ? "checked" : ""}>
        ${item.item}
      </label>


      <input 
        type="file"
        accept="image/*"
        multiple
        onchange="subirFotoPrueba(event, '${tipo}', ${i})"
      >

      <div id="fotos-${tipo}-${i}"></div>

      <hr>

      <input id="tecnico-${tipo}-${i}" placeholder="Técnico">
      <input id="comentario-${tipo}-${i}" placeholder="Trabajo realizado">

      <button onclick="agregarComentarioPrueba('${tipo}', ${i})">Agregar</button>

      <div id="comentarios-${tipo}-${i}"></div>
    `;

    cont.appendChild(div);

    mostrarFotosPrueba(tipo, i);
    renderComentariosPrueba(tipo, i);
  });
}

function togglePrueba(tipo, i) {
  if (OTBloqueada()) return;

  ot.pruebas[tipo][i].ok = !ot.pruebas[tipo][i].ok;

  actualizarEstadoGanttDesdeChecklist();

  guardarCambiosOT();

  if (ot.gantt?.actividades?.length) {
    renderCartaGantt();
  }
}

async function subirFotoPrueba(e, tipo, i) {

  if (OTBloqueada()) return;

  const files = Array.from(e.target.files);

  if (!files.length) return;

  try {

    if (!ot.pruebas) {
      ot.pruebas = { mecanico: [], electrico: [] };
    }

    if (!ot.pruebas[tipo][i].fotos) {
      ot.pruebas[tipo][i].fotos = [];
    }

    for (const file of files) {

      const imagenBlob = await comprimirImagenBlob(file);

      console.log(
        "Imagen optimizada:",
        {
          originalKB: Math.round(file.size / 1024),
          optimizadaKB: Math.round(imagenBlob.size / 1024)
        }
      );

      const imagenComprimida = new File(
        [imagenBlob],
        `pruebas_${tipo}_${Date.now()}.jpg`,
        { type: "image/jpeg" }
      );

      const urlFoto = await subirArchivoStorage(
        imagenComprimida,
        `pruebas_${tipo}`,
        i
      );

      ot.pruebas[tipo][i].fotos.push(urlFoto);
    }

    await guardarCambiosOT();

    mostrarFotosPrueba(tipo, i);

    e.target.value = "";

  } catch (error) {

    console.error("Error subiendo foto prueba:", error);

    alert("Error al subir imágenes de pruebas");
  }
}

function agregarComentarioPrueba(tipo, i) {

  if (OTBloqueada()) return;

  const nombre = document.getElementById(`tecnico-${tipo}-${i}`).value;
  const texto = document.getElementById(`comentario-${tipo}-${i}`).value;

  if (!nombre || !texto) {
    alert("Completa técnico y comentario");
    return;
  }

  if (!ot.pruebas[tipo][i].comentarios) {
    ot.pruebas[tipo][i].comentarios = [];
  }

  const fecha = new Date().toLocaleString();

  ot.pruebas[tipo][i].comentarios.push({
  nombre,
  texto,
  fecha: new Date().toLocaleString(),
  rol: usuario?.rol || "usuario_taller",

  atendido: esJefeTaller() ? false : true,
  respuestaUsuario: "",
  atendidoPor: "",
  fechaAtendido: ""
});

if (esJefeTaller()) {
  ot.alertaJefe = true;
}
else if (esUsuarioTaller()) {
  ot.alertaJefe = false;
}

  // 🔥 guardar fecha del item
  if (!ot.pruebas[tipo][i].fecha) {
    ot.pruebas[tipo][i].fecha = new Date();
  }

  guardarCambiosOT();

  renderComentariosPrueba(tipo, i);

  // limpiar inputs
  document.getElementById(`tecnico-${tipo}-${i}`).value = "";
  document.getElementById(`comentario-${tipo}-${i}`).value = "";
}

function existenComentariosJefePendientes(ot) {

  const revisarLista = (lista) => {
    return Array.isArray(lista) && lista.some(item =>
      Array.isArray(item.comentarios) &&
      item.comentarios.some(c =>
        c.rol === "jefe_taller" && c.atendido !== true
      )
    );
  };

  const revisarComentariosDirectos = (comentarios) => {
  return Array.isArray(comentarios) &&
    comentarios.some(c =>
      c.rol === "jefe_taller" &&
      c.atendido !== true
    );
};

  return (
    revisarLista(ot.ingreso) ||
    revisarLista(ot.evaluacion) ||
    revisarLista(ot.overhaul) ||
    revisarLista(ot.pruebas?.mecanico) ||
    revisarLista(ot.pruebas?.electrico) ||
    revisarComentariosDirectos(ot.despacho?.comentariosPreparacion) ||
    revisarComentariosDirectos(ot.despacho?.comentariosFinal)
  );
}

function actualizarAlertaJefe() {
  ot.alertaJefe = existenComentariosJefePendientes(ot);
}

async function responderComentarioJefe(etapa, itemIndex, comentarioIndex, tipo = null) {

  if (OTBloqueada()) return;

  if (!esUsuarioTaller()) {
    alert("Solo Usuario Taller puede responder observaciones");
    return;
  }

  const respuesta = prompt("Respuesta a la observación del Jefe:");

  if (!respuesta || !respuesta.trim()) {
    alert("Debes ingresar una respuesta");
    return;
  }

  let lista;

  if (etapa === "ingreso") {
    lista = ot.ingreso;
  }

  if (etapa === "evaluacion") {
    lista = ot.evaluacion;
  }

  if (etapa === "overhaul") {
    lista = ot.overhaul;
  }

  if (etapa === "pruebas") {
    lista = ot.pruebas?.[tipo];
  }

  const comentario = lista?.[itemIndex]?.comentarios?.[comentarioIndex];

  if (!comentario) {
    alert("No se encontró el comentario");
    return;
  }

  comentario.atendido = true;
  comentario.respuestaUsuario = respuesta.trim();
  comentario.atendidoPor = usuario?.nombre || "Usuario Taller";
  comentario.fechaAtendido = new Date().toLocaleString();

  actualizarAlertaJefe();

  await guardarCambiosOT();

  if (etapa === "ingreso") renderIngreso();
  if (etapa === "evaluacion") renderEvaluacion();
  if (etapa === "overhaul") renderOverhaul();
  if (etapa === "pruebas") renderChecklist(tipo);

  alert("Observación atendida ✅");
}

function renderComentariosPrueba(tipo, i) {

  const cont = document.getElementById(`comentarios-${tipo}-${i}`);
  if (!cont) return;

  cont.innerHTML = "";

  const comentarios = ot.pruebas[tipo][i].comentarios || [];

  comentarios.forEach((c, index) => {

    const div = document.createElement("div");
    div.className = c.rol === "jefe_taller"
  ? "comentario-card comentario-jefe"
  : "comentario-card";

    div.innerHTML = `
  <strong>👨‍🔧 ${c.nombre}</strong>
  <p class="comentario-fecha">${c.fecha}</p>
  <p>${c.texto}</p>

  ${
    c.rol === "jefe_taller" && c.atendido !== true && esUsuarioTaller()
      ? `<button 
          class="btn-success"
          onclick="responderComentarioJefe('pruebas', ${i}, ${index}, '${tipo}')">
          ✅ Responder observación
        </button>`
      : ""
  }

  ${
    c.rol === "jefe_taller" && c.atendido === true
      ? `<div class="respuesta-observacion">
          <strong>✅ Respondido por ${c.atendidoPor || "Usuario Taller"}</strong>
          <p>${c.respuestaUsuario || ""}</p>
          <small>${c.fechaAtendido || ""}</small>
        </div>`
      : ""
  }

  ${
  esJefeTaller()
    ? `<button 
        class="btn-delete-comment"
        onclick="eliminarComentarioPrueba(${i}, ${index})">
        🗑
      </button>`
    : ""
}
`;

    cont.appendChild(div);
  });
}

function eliminarComentarioPrueba(tipo, i, index) {

  if (OTBloqueada()) return;

  const confirmar = confirm("¿Eliminar este registro?");
  if (!confirmar) return;

  ot.pruebas[tipo][i].comentarios.splice(index, 1);

  guardarCambiosOT();

  renderComentariosPrueba(tipo, i);
}

function mostrarFotosPrueba(tipo, i) {

  const div = document.getElementById(`fotos-${tipo}-${i}`);
  if (!div) return;

  div.innerHTML = "";

  ot.pruebas[tipo][i].fotos.forEach((foto, index) => {

    const container = document.createElement("div");
    container.className = "foto-box";

    const img = document.createElement("img");
    img.src = foto;
    img.style.cursor = "pointer";
    img.onclick = () => verImagenModal(foto);
    img.width = 100;

    const btn = document.createElement("button");
    btn.innerHTML = "&times;";

    btn.className = "btn-delete-img";

    btn.onclick = () => eliminarFotoPrueba(tipo, i, index);

    container.appendChild(img);
    container.appendChild(btn);

    div.appendChild(container);
  });
}

function eliminarFotoPrueba(tipo, i, index) {

  if (OTBloqueada()) return;

  const confirmar = confirm("¿Eliminar esta evidencia?");
  if (!confirmar) return;

  ot.pruebas[tipo][i].fotos.splice(index, 1);

  guardarCambiosOT();

  mostrarFotosPrueba(tipo, i);
}

// =======================
// GUARDAR PRUEBAS
// =======================
function guardarPruebas() {

  if (!ot) {
    alert("No hay OT cargada");
    return;
  }

  guardarCambiosOT();

  alert("Progreso de PRUEBAS guardado ✅");
}

// =======================
// APROBAR PRUEBAS
// =======================
async function aprobarPruebas() {

  if (OTBloqueada()) return;

  if (!esJefeTaller()) {
    alert("Solo Jefe de Taller puede aprobar pruebas");
    return;
  }

  if (!validarPruebasCompleto()) return;

  ot.pruebasAprobado = true;

  ot.estado = obtenerEstadoOT(ot);

  await guardarCambiosOT();

  habilitarTab("despacho");

  cambiarTab("despacho");

  alert("Pruebas aprobadas ✅");
}

function validarPruebasCompleto() {

  if (!ot.pruebas) {
    alert("Faltan pruebas funcionales");
    return false;
  }

  const tipos = ["mecanico", "electrico"];

  for (let tipo of tipos) {

    const lista = ot.pruebas[tipo];

    if (!lista || lista.length === 0) {
      alert(`Falta cargar checklist ${tipo}`);
      return false;
    }

    for (let i = 0; i < lista.length; i++) {

      const item = lista[i];

      if (!item.ok) {
        alert(`Falta marcar como realizado el ítem ${i + 1} en pruebas ${tipo}`);
        return false;
      }

      if (!item.fotos || item.fotos.length === 0) {
        alert(`Falta evidencia fotográfica en el ítem ${i + 1} de pruebas ${tipo}`);
        return false;
      }

      const comentariosTecnicos = (item.comentarios || []).filter(c =>
        c.rol !== "jefe_taller"
      );

      if (comentariosTecnicos.length === 0) {
        alert(`Falta comentario técnico en el ítem ${i + 1} de pruebas ${tipo}`);
        return false;
      }

      const observacionesPendientes = (item.comentarios || []).some(c =>
        c.rol === "jefe_taller" && c.atendido !== true
      );

      if (observacionesPendientes) {
        alert(`Existen observaciones pendientes del Jefe de Taller en pruebas ${tipo}, ítem ${i + 1}`);
        return false;
      }
    }
  }

  return true;
}


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

  if (!ot.despacho || !ot.despacho[tipo]) return;

  ot.despacho[tipo].forEach((doc, index) => {

    const div = document.createElement("div");
    div.className = "doc-item";

    div.innerHTML = `
      <div class="doc-left">
        <span class="doc-icon">📄</span>
        <span class="doc-name">${doc.nombre}</span>
      </div>

      <div class="doc-actions">
        <button 
          class="permitido-bloqueo"
          onclick="abrirDocSeccion(event, '${tipo}', ${index})">
          👁
        </button>
        <button onclick="eliminarDocSeccion(event, '${tipo}', ${index})">🗑</button>
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

function prepararComentariosDespacho() {
  if (!ot.despacho) {
    ot.despacho = {
      preparacion: [],
      final: []
    };
  }

  if (!ot.despacho.comentariosPreparacion) {
    ot.despacho.comentariosPreparacion = [];
  }

  if (!ot.despacho.comentariosFinal) {
    ot.despacho.comentariosFinal = [];
  }
}

async function agregarComentarioDespacho(tipo) {

  if (OTBloqueada()) return;

  prepararComentariosDespacho();

  const inputId = tipo === "preparacion"
    ? "comentarioDespachoPrep"
    : "comentarioDespachoFinal";

  const input = document.getElementById(inputId);

  if (!input || !input.value.trim()) {
    alert("Debes ingresar un comentario");
    return;
  }

  const comentario = {
    nombre: usuario?.nombre || "Usuario",
    texto: input.value.trim(),
    fecha: new Date().toLocaleString(),
    rol: usuario?.rol || "usuario_taller",
    atendido: esJefeTaller() ? false : true,
    respuestaUsuario: "",
    atendidoPor: "",
    fechaAtendido: ""
  };

  if (tipo === "preparacion") {
    ot.despacho.comentariosPreparacion.push(comentario);
  } else {
    ot.despacho.comentariosFinal.push(comentario);
  }

  if (esJefeTaller()) {
    ot.alertaJefe = true;
  }

  input.value = "";

  await guardarCambiosOT();

  renderComentariosDespacho(tipo);
}

function renderComentariosDespacho(tipo) {

  prepararComentariosDespacho();

  const contId = tipo === "preparacion"
    ? "comentarios-despacho-preparacion"
    : "comentarios-despacho-final";

  const cont = document.getElementById(contId);
  if (!cont) return;

  const lista = tipo === "preparacion"
    ? ot.despacho.comentariosPreparacion
    : ot.despacho.comentariosFinal;

  cont.innerHTML = "";

  lista.forEach((c, index) => {

    const div = document.createElement("div");

    div.className = c.rol === "jefe_taller"
      ? "comentario-card comentario-jefe"
      : "comentario-card";

    div.innerHTML = `
      <strong>👨‍🔧 ${c.nombre}</strong>
      <p class="comentario-fecha">${c.fecha}</p>
      <p>${c.texto}</p>

      ${
        c.rol === "jefe_taller" && c.atendido !== true && esUsuarioTaller()
          ? `<button 
              class="btn-success"
              onclick="responderComentarioJefeDespacho('${tipo}', ${index})">
              ✅ Responder observación
            </button>`
          : ""
      }

      ${
        c.rol === "jefe_taller" && c.atendido === true
          ? `<div class="respuesta-observacion">
              <strong>✅ Respondido por ${c.atendidoPor || "Usuario Taller"}</strong>
              <p>${c.respuestaUsuario || ""}</p>
              <small>${c.fechaAtendido || ""}</small>
            </div>`
          : ""
      }

      ${
  esJefeTaller()
    ? `<button 
        class="btn-delete-comment"
        onclick="eliminarComentarioDespacho('${tipo}', ${index})">
        🗑
      </button>`
    : ""
}
    `;

    cont.appendChild(div);
  });
}

async function responderComentarioJefeDespacho(tipo, index) {

  if (OTBloqueada()) return;

  if (!esUsuarioTaller()) {
    alert("Solo Usuario Taller puede responder observaciones");
    return;
  }

  prepararComentariosDespacho();

  const respuesta = prompt("Respuesta a la observación del Jefe:");

  if (!respuesta || !respuesta.trim()) {
    alert("Debes ingresar una respuesta");
    return;
  }

  const lista = tipo === "preparacion"
    ? ot.despacho.comentariosPreparacion
    : ot.despacho.comentariosFinal;

  const comentario = lista[index];

  if (!comentario) {
    alert("No se encontró el comentario");
    return;
  }

  comentario.atendido = true;
  comentario.respuestaUsuario = respuesta.trim();
  comentario.atendidoPor = usuario?.nombre || "Usuario Taller";
  comentario.fechaAtendido = new Date().toLocaleString();

  actualizarAlertaJefe();

  await guardarCambiosOT();

  renderComentariosDespacho(tipo);

  alert("Observación atendida ✅");
}

async function eliminarComentarioDespacho(tipo, index) {

  if (OTBloqueada()) return;

  prepararComentariosDespacho();

  const lista = tipo === "preparacion"
    ? ot.despacho.comentariosPreparacion
    : ot.despacho.comentariosFinal;

  lista.splice(index, 1);

  actualizarAlertaJefe();

  await guardarCambiosOT();

  renderComentariosDespacho(tipo);
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
    const imagenRef = ref(storage, url);

    const bytes = await getBytes(imagenRef);

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
    console.warn("No se pudo convertir imagen desde Storage:", error);
    return null;
  }
}



// =======================
// GENERAR PDF
// =======================
// =======================
// GENERAR PDF CON FOTOS
// =======================
async function generarPDF() {

  if (!ot) {
    alert("No hay OT cargada");
    return;
  }

  const { jsPDF } = window.jspdf;

  const doc = new jsPDF("p", "mm", "a4");

  // =========================
  // CONFIG
  // =========================
  const logo = "./img/pdf/logo.png";
  const portada = "./img/pdf/portada.jpg";

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  let y = 20;

  // =========================
  // PORTADA
  // =========================
function crearPortada() {

  // Fondo blanco
  doc.setFillColor(255,255,255);
  doc.rect(0,0,pageWidth,pageHeight,"F");

  // =========================
  // LOGO SUPERIOR
  // =========================
  doc.addImage(logo, "PNG", 20, 15, 35, 12);

  // =========================
  // TEXTO SUPERIOR DERECHO
  // =========================
  doc.setFontSize(8);
  doc.setTextColor(100);

  doc.text(
    `Informe final ${ot.equipo || ""}`,
    185,
    18,
    { align:"right" }
  );

  doc.text(
    new Date().toLocaleDateString("es-CL"),
    185,
    23,
    { align:"right" }
  );

  // =========================
  // TÍTULO EMPRESA
  // =========================
  doc.setFont("helvetica","bold");
  doc.setFontSize(18);
  doc.setTextColor(20);

  doc.text(
    "ATLAS COPCO CHILE S.P.A",
    pageWidth/2,
    55,
    { align:"center" }
  );

  // =========================
  // LÍNEA SUPERIOR IMAGEN
  // =========================
  doc.setDrawColor(0,140,190);
  doc.setLineWidth(2);

  doc.line(30, 75, 180, 75);

  // =========================
  // IMAGEN CENTRAL
  // =========================
  doc.addImage(
    portada,
    "JPEG",
    30,
    78,
    150,
    70
  );

  // =========================
  // LÍNEA INFERIOR IMAGEN
  // =========================
  doc.line(30, 155, 180, 155);

  // =========================
  // TITULO CENTRAL
  // =========================
  doc.setFontSize(20);
  doc.setFont("helvetica","bold");

  doc.text(
    "INFORME FINAL",
    pageWidth/2,
    185,
    { align:"center" }
  );

  // EQUIPO
  doc.setFontSize(16);

  doc.text(
    `${ot.equipo || ""}`,
    pageWidth/2,
    197,
    { align:"center" }
  );

  // CLIENTE
  doc.text(
    `${ot.cliente || ""}`,
    pageWidth/2,
    209,
    { align:"center" }
  );

  // =========================
  // DATOS EXTRA
  // =========================
  doc.setFontSize(11);
  doc.setFont("helvetica","normal");

  doc.text(
    `OS: ${ot.os || "-"}`,
    pageWidth/2,
    225,
    { align:"center" }
  );

  doc.text(
    `SERIE: ${ot.serie || "-"}`,
    pageWidth/2,
    233,
    { align:"center" }
  );

  // =========================
  // FOOTER
  // =========================
  doc.setFontSize(8);
  doc.setTextColor(120);

  doc.text(
    "Sistema de Gestión de Mantención",
    pageWidth/2,
    285,
    { align:"center" }
  );
}

  crearPortada();

  // =========================
  // NUEVA PÁGINA
  // =========================
  doc.addPage();

  // =========================
  // HEADER
  // =========================
  function header() {

    // Logo
    doc.addImage(logo, "PNG", 10, 8, 40, 12);

    // Línea superior
    doc.setDrawColor(200);
    doc.line(10, 24, 200, 24);

    // Texto derecha
    doc.setFontSize(9);
    doc.setTextColor(90);

    doc.text(
      `Informe OT ${ot.os || "-"}`,
      200,
      12,
      { align:"right" }
    );

    doc.text(
      `${ot.cliente || "-"}`,
      200,
      17,
      { align:"right" }
    );

    doc.text(
      new Date().toLocaleDateString("es-CL"),
      200,
      22,
      { align:"right" }
    );

    y = 35;
  }

  // =========================
  // FOOTER
  // =========================
  function footer(page) {

    doc.setDrawColor(220);
    doc.line(10, 285, 200, 285);

    doc.setFontSize(8);
    doc.setTextColor(100);

    doc.text(
      "Sistema de Gestión de Mantención",
      10,
      290
    );

    doc.text(
      `Página ${page}`,
      200,
      290,
      { align:"right" }
    );
  }

  // =========================
  // CONTROL PÁGINAS
  // =========================
  function checkPage() {

    if (y > 260) {

      footer(doc.getNumberOfPages());

      doc.addPage();

      header();
    }
  }

  // =========================
  // TITULOS
  // =========================
  function titulo(txt) {

    checkPage();

    doc.setFontSize(16);
    doc.setTextColor(20,20,20);
    doc.setFont("helvetica","bold");

    doc.text(txt, 10, y);

    y += 10;
  }

  // =========================
  // TEXTO
  // =========================
  function parrafo(txt) {

  checkPage();

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const maxWidth = 180;

  const lineas = doc.splitTextToSize(txt, maxWidth);

  lineas.forEach((linea, index) => {

    // última línea NO justificar
    if (index === lineas.length - 1) {

      doc.text(linea, 10, y);

    } else {

      justificarTexto(linea, 10, y, maxWidth);

    }

    y += 5;
  });

  y += 5;
}

function justificarTexto(texto, x, y, ancho) {

  const palabras = texto.split(" ");

  if (palabras.length < 2) {
    doc.text(texto, x, y);
    return;
  }

  const textoSinEspacios = palabras.join("");

  const anchoTexto =
    doc.getTextWidth(textoSinEspacios);

  const espacioTotal =
    ancho - anchoTexto;

  const espacioEntrePalabras =
    espacioTotal / (palabras.length - 1);

  let offsetX = x;

  palabras.forEach((palabra, i) => {

    doc.text(palabra, offsetX, y);

    offsetX +=
      doc.getTextWidth(palabra) +
      espacioEntrePalabras;

  });
}

  // =========================
  // DATOS GENERALES
  // =========================
  header();

  titulo("1. DATOS GENERALES");

  doc.autoTable({
    startY: y,
    theme: "grid",
    styles: {
      fontSize: 10
    },
    headStyles: {
      fillColor: [40,40,40]
    },
    body: [
      ["Equipo", ot.equipo || "-"],
      ["Serie", ot.serie || "-"],
      ["Cliente", ot.cliente || "-"],
      ["OS", ot.os || "-"],
      ["Estado", ot.estado || "-"]
    ]
  });

  y = doc.lastAutoTable.finalY + 15;

  // =========================
  // RESUMEN
  // =========================
  titulo("2. RESUMEN DEL SERVICIO");

  parrafo(
  `Adjuntamos informe final correspondiente a mantenimiento Overhaul realizado a equipo compresor de aire Atlas Copco ${ot.equipo || "-"}, serie ${ot.serie || "-"}, perteneciente a ${ot.cliente || "-"}.`
  );
  parrafo(
    "Daremos paso al detalle de las condiciones observadas en vuestro equipo."
  );
  parrafo(
  `Servicio realizado por Post Venta Compressor Technique Service, Sucursal Atlas Copco ${usuario.sucursal || "-"}.`
);

  // =========================
// BLOQUE SERVICIO
// =========================
async function renderBloqueServicio(tituloSeccion, lista) {

  if (!lista || lista.length === 0) return;

  titulo(tituloSeccion);

  for (const [index, item] of lista.entries()) {

    checkPage();

    // =========================
    // ITEM
    // =========================
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");

    doc.text(
      `${index + 1}. ${item.item}`,
      10,
      y
    );

    y += 8;

    // =========================
    // COMENTARIOS
    // =========================
    // =========================
// COMENTARIOS SOLO TÉCNICOS
// =========================
const comentariosTecnicos =
  (item.comentarios || []).filter(
    c => c.rol !== "jefe_taller"
  );

if (comentariosTecnicos.length > 0) {

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");

  doc.text(
    "Trabajos realizados:",
    15,
    y
  );

  y += 6;

  comentariosTecnicos.forEach(c => {

    doc.setFont("helvetica", "normal");

    const texto =
      `• ${c.nombre}: ${c.texto}`;

    const split =
      doc.splitTextToSize(texto, 170);

    doc.text(split, 20, y);

    y += split.length * 5 + 3;

  });

}
    // =========================
    // GALERÍA PROFESIONAL
    // =========================
    if (item.fotos?.length > 0) {

      y += 5;

      doc.setFont("helvetica", "bold");

      doc.text(
        "Evidencias fotográficas:",
        15,
        y
      );

      y += 10;
    
    
      // =========================
// CONFIGURACIÓN GALERÍA
// =========================
const espacioX = 8;

const anchoImg = 55;
const altoImg = 40;

const columnas = 3;

// 🔥 CALCULAR ANCHO TOTAL GRID
const anchoTotal =
  (columnas * anchoImg) +
  ((columnas - 1) * espacioX);

// 🔥 CENTRAR AUTOMÁTICAMENTE
const margenX =
  (pageWidth - anchoTotal) / 2;
      for (let fotoIndex = 0; fotoIndex < item.fotos.length; fotoIndex++) {

  const foto = item.fotos[fotoIndex];

  const fila = Math.floor(fotoIndex / columnas);
  const columna = fotoIndex % columnas;

  const posX = margenX + (columna * (anchoImg + espacioX));
  const posY = y + (fila * (altoImg + 12));

  if (posY + altoImg > 250) {
    footer(doc.getNumberOfPages());
    doc.addPage();
    header();
    y = 40;
  }

  try {
    const fotoBase64 =
  foto.startsWith("http")
    ? await convertirImagenABase64(foto)
    : foto;

if (!fotoBase64) continue;

    doc.setDrawColor(180);

    doc.roundedRect(
      posX - 1,
      posY - 1,
      anchoImg + 2,
      altoImg + 2,
      2,
      2
    );

    doc.addImage(
      fotoBase64,
      "JPEG",
      posX,
      posY,
      anchoImg,
      altoImg
    );

  } catch (e) {
    console.warn("No se pudo agregar imagen al PDF:", e);
  }
}

      // =========================
      // AJUSTAR ALTURA FINAL
      // =========================
      const filasTotales =
        Math.ceil(item.fotos.length / columnas);

      y += filasTotales * (altoImg + 12);

      y += 10;
    }

    y += 15;

  }

}

// =========================
// INGRESO
// =========================
await renderBloqueServicio("3. INGRESO", ot.ingreso);

// =========================
// EVALUACIÓN
// =========================
await renderBloqueServicio("4. EVALUACIÓN", ot.evaluacion);

// =========================
// OVERHAUL
// =========================
await renderBloqueServicio("5. OVERHAUL", ot.overhaul);

// =========================
// PRUEBAS MECÁNICAS
// =========================
if (ot.pruebas?.mecanico) {

  await renderBloqueServicio("6. PRUEBAS MECÁNICAS", ot.pruebas.mecanico);

}

// =========================
// PRUEBAS ELÉCTRICAS
// =========================
if (ot.pruebas?.electrico) {

  await renderBloqueServicio("7. PRUEBAS ELÉCTRICAS", ot.pruebas.electrico);

}

  // =========================
  // RESUMEN FINAL
  // =========================
  titulo("9. CONCLUSIONES");

  parrafo(
  "El equipo queda operativo posterior a las actividades de mantenimiento realizadas por personal técnico especializado de Atlas Copco Compressor Technique Service."
);

parrafo(
  "Todas las actividades fueron ejecutadas según procedimiento técnico y registradas en el presente informe."
);

parrafo(
  "Se recomienda continuar con el plan de mantenimiento preventivo del equipo para asegurar continuidad operacional y confiabilidad."
);


  // =========================
  // FOOTERS FINALES
  // =========================
  const totalPages = doc.getNumberOfPages();

  for (let i = 2; i <= totalPages; i++) {

    doc.setPage(i);

    footer(i);
  }

  // =========================
  // EXPORTAR
  // =========================
  doc.save(`Informe_${ot.os}.pdf`);
}




function mostrarAlerta(msg, tipo = "error") {

  const div = document.createElement("div");

  div.className = "alerta " + tipo;
  div.innerText = msg;

  document.body.appendChild(div);

  setTimeout(() => div.remove(), 3000);
}

function verImagenModal(src) {
  const modal = document.getElementById("modalImagen");
  const img = document.getElementById("imgExpandida");

  img.src = src;
  modal.style.display = "block";
}

function cerrarImagen() {
  document.getElementById("modalImagen").style.display = "none";
}

// =======================
// COMPRIMIR IMAGEN COMO BLOB
// =======================
function comprimirImagenBlob(file, calidad = 0.72, maxWidth = 1280) {
  return new Promise((resolve, reject) => {

    if (!file || !file.type.startsWith("image/")) {
      reject("El archivo no es una imagen válida");
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width));
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject("No se pudo comprimir la imagen");
              return;
            }

            resolve(blob);
          },
          "image/jpeg",
          calidad
        );
      };

      img.onerror = () => {
        reject("No se pudo leer la imagen");
      };

      img.src = event.target.result;
    };

    reader.onerror = () => {
      reject("Error al leer el archivo");
    };

    reader.readAsDataURL(file);
  });
}

// =======================
// SUBIR ARCHIVO A STORAGE
// =======================
async function subirArchivoStorage(file, etapa, itemIndex) {

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

function renderUsuarioActivo() {

  if (!usuario) return;

  const nombre = document.getElementById("usuarioNombre");
  const rol = document.getElementById("usuarioRol");

  if (nombre) {
    nombre.textContent = usuario.nombre || "Usuario";
  }

  if (rol) {
    rol.textContent = usuario.rol || "Sin rol";
  }
}

function cerrarSesion() {

  const confirmar = confirm(
    "¿Estás seguro de que deseas cerrar sesión?"
  );

  if (!confirmar) return;

  localStorage.removeItem("usuarioActivo");
  localStorage.removeItem("otActiva");

  sessionStorage.clear();

  window.location.replace("index.html");
}

window.cerrarSesion = cerrarSesion;


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

window.cargarIngreso = cargarIngreso;
window.guardarIngreso = guardarIngreso;
window.aprobarIngreso = aprobarIngreso;

window.cargarEvaluacion = cargarEvaluacion;
window.guardarEvaluacion = guardarEvaluacion;
window.aprobarEvaluacion = aprobarEvaluacion;

window.cargarOverhaul = cargarOverhaul;
window.guardarOverhaul = guardarOverhaul;
window.aprobarOverhaul = aprobarOverhaul;

window.cargarChecklist = cargarChecklist;
window.guardarPruebas = guardarPruebas;
window.aprobarPruebas = aprobarPruebas;

window.subirDocsSeccion = subirDocsSeccion;
window.guardarDespacho = guardarDespacho;
window.cerrarOT = cerrarOT;

window.generarPDF = generarPDF;

window.cerrarModal = cerrarModal;
window.cerrarImagen = cerrarImagen;


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

window.toggleOverhaul = toggleOverhaul;
window.subirFotoOverhaul = subirFotoOverhaul;
window.eliminarFotoOverhaul = eliminarFotoOverhaul;
window.agregarComentarioOverhaul = agregarComentarioOverhaul;
window.eliminarComentarioOverhaul = eliminarComentarioOverhaul;

window.togglePrueba = togglePrueba;
window.subirFotoPrueba = subirFotoPrueba;
window.eliminarFotoPrueba = eliminarFotoPrueba;
window.agregarComentarioPrueba = agregarComentarioPrueba;
window.eliminarComentarioPrueba = eliminarComentarioPrueba;

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