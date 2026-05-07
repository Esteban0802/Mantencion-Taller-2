// =======================
// VARIABLES GLOBALES
// =======================
let ot = null;
let listaOTs = [];
let usuario = {
  nombre: "Esteban",
  rol: "admin",
  sucursal: "Antofagasta"
};

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
function guardarDatosOS() {

  const equipo = document.getElementById("equipo").value;
  const serie = document.getElementById("serie").value;
  const cliente = document.getElementById("cliente").value;
  const os = document.getElementById("os").value;

  if (!equipo || !serie || !cliente || !os) {
    alert("Completa todos los campos");
    return;
  }

  let listaOTs = JSON.parse(localStorage.getItem("ots")) || [];

  const nueva = {
    id: Date.now(),
    equipo,
    serie,
    cliente,
    os,
    estado: "INGRESO",
    ingreso: [],
    evaluacion: [],
    overhaul: [],
    pruebas: null,
    despacho: null
  };

  listaOTs.push(nueva);

  localStorage.setItem("ots", JSON.stringify(listaOTs));
  localStorage.setItem("otActiva", nueva.id);

  // 🔥 REDIRECCIÓN
  window.location.href = "index.html";
}

function habilitarTab(nombre) {
  const tab = document.querySelector(`[data-tab="${nombre}"]`);
  if (!tab) {
    console.warn("Tab no encontrada:", nombre);
    return;
  }
  tab.classList.remove("disabled");
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
        capture="environment"
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
  ot.ingreso[i].ok = !ot.ingreso[i].ok;
  guardarCambiosOT();
}

// =======================
// FOTOS
// =======================
async function subirFotoIngreso(e, i) {

  const file = e.target.files[0];

  if (!file) return;

  // 🔥 COMPRESIÓN
  const imagenComprimida =
    await comprimirImagen(file);

  ot.ingreso[i].fotos.push(imagenComprimida);

  guardarCambiosOT();

  mostrarFotosIngreso(i);
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

  if (!confirm("¿Eliminar foto?")) return;

  ot.ingreso[i].fotos.splice(index, 1);

  guardarCambiosOT();
  mostrarFotosIngreso(i);
}

// =======================
// COMENTARIOS
// =======================
function agregarComentarioItem(i) {

  const nombre = document.getElementById(`tecnico-${i}`).value;
  const texto = document.getElementById(`comentario-${i}`).value;

  if (!nombre || !texto) {
    alert("Completa técnico y comentario");
    return;
  }

  ot.ingreso[i].comentarios.push({
    nombre,
    texto,
    fecha: new Date().toLocaleString()
  });

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
    div.className = "comentario-card";

    div.innerHTML = `
      <strong>👨‍🔧${c.nombre}</strong>
      <p class="comentario-fecha">${c.fecha}</p>
      <p>${c.texto}</p>
      <button 
        class="btn-delete-comment"
        onclick="eliminarComentarioIngreso(${i}, ${index})">
        🗑
      </button>
    `;

    cont.appendChild(div);
  });
}

function eliminarComentarioIngreso(i, index) {

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

  alert("Ingreso aprobado");
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
function guardarCambiosOT() {

  const lista = JSON.parse(localStorage.getItem("ots")) || [];

  const index = lista.findIndex(o => o.id === ot.id);

  if (index !== -1) {

    // 🔥 ACTUALIZAR ESTADO ANTES DE GUARDAR
    ot.estado = obtenerEstadoOT(ot);

    lista[index] = ot;
  }

  localStorage.setItem("ots", JSON.stringify(lista));

    // 🔥 ACTUALIZAR UI EN TIEMPO REAL
  actualizarPipeline();

  // 🔥 FORZAR REFRESH VISUAL
window.dispatchEvent(new Event("storage"));
}

function obtenerEstadoOT(ot) {

  if (!ot) return "INGRESO";

  if (!ot.ingresoAprobado) return "INGRESO";
  if (!ot.evaluacionAprobada) return "EVALUACION";
  if (!ot.overhaulAprobado) return "OVERHAUL";
  if (!ot.pruebasAprobado) return "PRUEBAS";

  if (!ot.despacho) return "DESPACHO";

  return "CERRADA";
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

  const file = e.target.files[0];

  if (!file) return;

  const imagenComprimida =
    await comprimirImagen(file);

  ot.overhaul[i].fotos.push(imagenComprimida);

  guardarCambiosOT();

  mostrarFotosEvaluacion(i);
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
        capture="environment"
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
  ot.evaluacion[i].ok = !ot.evaluacion[i].ok;
  guardarCambiosOT();
}

function subirFotoEvaluacion(e, i) {

  const file = e.target.files[0];
  const reader = new FileReader();

  reader.onload = function() {
    ot.evaluacion[i].fotos.push(reader.result);
    guardarCambiosOT();
    mostrarFotosEvaluacion(i);
  };

  reader.readAsDataURL(file);
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

  if (!confirm("¿Eliminar foto?")) return;

  ot.evaluacion[i].fotos.splice(index, 1);

  guardarCambiosOT();
  mostrarFotosEvaluacion(i);
}

function agregarComentarioEvaluacion(i) {

  const nombre = document.getElementById(`tecnico-eval-${i}`).value;
  const texto = document.getElementById(`comentario-eval-${i}`).value;

  if (!nombre || !texto) {
    alert("Completa técnico y comentario");
    return;
  }

  ot.evaluacion[i].comentarios.push({
    nombre,
    texto,
    fecha: new Date().toLocaleString()
  });

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
    div.className = "comentario-card";

    div.innerHTML = `
      <strong>👨‍🔧${c.nombre}</strong>
      <p class="comentario-fecha">${c.fecha}</p>
      <p>${c.texto}</p>
      <button 
        class="btn-delete-comment"
        onclick="eliminarComentarioEvaluacion(${i}, ${index})">
        🗑
      </button>
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

  if (!confirm("¿Eliminar comentario?")) return;

  ot.evaluacion[i].comentarios.splice(index, 1);

  guardarCambiosOT();
  renderComentariosEvaluacion(i);
}


function aprobarEvaluacion() {

  if (usuario.rol !== "admin") {
    alert("Solo admin puede aprobar");
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
window.onload = () => {

  const id = localStorage.getItem("otActiva");
  const data = localStorage.getItem("ots");

  if (!data) return;

  listaOTs = JSON.parse(data);

  if (!id) return;

  ot = listaOTs.find(o => o.id == id);

  if (!ot) return;

  // =========================
  // RESTAURAR FLUJO CORRECTO
  // =========================

  // 👉 INGRESO
  if (ot.ingreso && ot.ingreso.length > 0) {
    renderIngreso();
    habilitarTab("ingreso");
  }

  if (ot.ingresoAprobado) {
    habilitarTab("evaluacion");
  }

  // 👉 EVALUACIÓN
  if (ot.evaluacion && ot.evaluacion.length > 0) {
    renderEvaluacion();
    habilitarTab("evaluacion");
  }

  if (ot.evaluacionAprobada) {
    habilitarTab("overhaul");
  }

  // 👉 OVERHAUL
  if (ot.overhaul && ot.overhaul.length > 0) {
    renderOverhaul();
    habilitarTab("overhaul");
  }

  if (ot.overhaulAprobado) {
    habilitarTab("pruebas");
  }

  // 👉 PRUEBAS
  if (ot.pruebas) {
    if (ot.pruebas.mecanico?.length > 0) {
      renderChecklist("mecanico");
    }

    if (ot.pruebas.electrico?.length > 0) {
      renderChecklist("electrico");
    }
  }

  if (ot.pruebasAprobado) {
    habilitarTab("despacho");
  }

  // 👉 DESPACHO
  if (ot.despacho) {

    if (ot.despacho.preparacion?.length > 0) {
      renderDocsSeccion("preparacion");
    }

    if (ot.despacho.final?.length > 0) {
      renderDocsSeccion("final");
    }

    if (ot.despacho.documentos?.length > 0) {
      mostrarDocs();
    }
  }

  // 🔥 FORZAR FLUJO VISUAL
if (ot) {

  // 👉 SI NO HA EMPEZADO INGRESO
  if (!ot.ingreso || ot.ingreso.length === 0) {
    habilitarTab("ingreso");
    cambiarTab("ingreso");
  }

  // 👉 SI YA ESTÁ EN INGRESO
  else if (ot.ingreso && !ot.ingresoAprobado) {
    habilitarTab("ingreso");
    cambiarTab("ingreso");
  }

  // 👉 SI INGRESO APROBADO → EVALUACION
  else if (ot.ingresoAprobado && !ot.evaluacionAprobada) {
    habilitarTab("evaluacion");
    cambiarTab("evaluacion");
  }

  // 👉 SI EVALUACION APROBADA → OVERHAUL
  else if (ot.evaluacionAprobada && !ot.overhaulAprobado) {
    habilitarTab("overhaul");
    cambiarTab("overhaul");
  }

  // 👉 SI OVERHAUL APROBADO → PRUEBAS
  else if (ot.overhaulAprobado && !ot.pruebasAprobado) {
    habilitarTab("pruebas");
    cambiarTab("pruebas");
  }

  // 👉 SI PRUEBAS APROBADAS → DESPACHO
  else if (ot.pruebasAprobado) {
    habilitarTab("despacho");
    cambiarTab("despacho");
  }

}

actualizarPipeline();

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
        capture="environment"
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
  ot.overhaul[i].ok = !ot.overhaul[i].ok;
  guardarCambiosOT();
}

async function subirFotoOverhaul(e, i) {

  const file = e.target.files[0];

  if (!file) return;

  const imagenComprimida =
    await comprimirImagen(file);

  ot.overhaul[i].fotos.push(imagenComprimida);

  guardarCambiosOT();

  mostrarFotosOverhaul(i);
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

  const confirmar = confirm("¿Eliminar foto?");
  if (!confirmar) return;

  if (!ot.overhaul[i].fotos) return;

  ot.overhaul[i].fotos.splice(index, 1);

  guardarCambiosOT();

  mostrarFotosOverhaul(i);
}

function agregarComentarioOverhaul(i) {

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
    fecha: new Date().toLocaleString()
  });

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
    div.className = "comentario-card";

    div.innerHTML = `
      <strong>👨‍🔧${c.nombre}</strong>
      <p class="comentario-fecha">${c.fecha}</p>
      <p>${c.texto}</p>
      <button 
        class="btn-delete-comment"
        onclick="eliminarComentarioOverhaul(${i}, ${index})">
        🗑
      </button>
    `;

    cont.appendChild(div);
  });
}

function eliminarComentarioOverhaul(i, index) {

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

  if (usuario.rol !== "admin") {
    alert("Solo admin puede aprobar");
    return;
  }

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
        capture="environment"
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
  ot.pruebas[tipo][i].ok = !ot.pruebas[tipo][i].ok;
  guardarCambiosOT();
}

async function subirFotoPrueba(e, i) {

  const file = e.target.files[0];

  if (!file) return;

  const imagenComprimida =
    await comprimirImagen(file);

  ot.overhaul[i].fotos.push(imagenComprimida);

  guardarCambiosOT();

  mostrarFotosPrueba(i);
}

function mostrarFotosPrueba(tipo, i) {
  const div = document.getElementById(`fotos-${tipo}-${i}`);
  if (!div) return;

  div.innerHTML = "";

  ot.pruebas[tipo][i].fotos.forEach(f => {
    const img = document.createElement("img");
    img.src = foto;
    img.style.cursor = "pointer";
    img.onclick = () => verImagenModal(foto);
    img.width = 100;
    div.appendChild(img);
  });
}

function agregarComentarioPrueba(tipo, i) {

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
    fecha
  });

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

function renderComentariosPrueba(tipo, i) {

  const cont = document.getElementById(`comentarios-${tipo}-${i}`);
  if (!cont) return;

  cont.innerHTML = "";

  const comentarios = ot.pruebas[tipo][i].comentarios || [];

  comentarios.forEach((c, index) => {

    const div = document.createElement("div");
    div.className = "comentario-card";

    div.innerHTML = `
      <strong>👨‍🔧${c.nombre}</strong>
      <p class="comentario-fecha">${c.fecha}</p>
      <p>${c.texto}</p>
      <button 
        class="btn-delete-comment"
        onclick="eliminarComentarioPrueba('${tipo}', ${i}, ${index})">
        🗑
      </button>
    `;

    cont.appendChild(div);
  });
}

function eliminarComentarioPrueba(tipo, i, index) {

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
function aprobarPruebas() {

  if (usuario.rol !== "admin") {
    alert("Solo admin puede aprobar");
    return;
  }

  if (!ot.pruebas) {
    alert("Debes cargar los checklist");
    return;
  }

  const tipos = ["mecanico", "electrico"];

  for (let tipo of tipos) {

    const lista = ot.pruebas[tipo];

    if (!lista || lista.length === 0) {
      alert(`Falta checklist ${tipo}`);
      return;
    }

    // ✅ checklist completo
    const completo = lista.every(i => i.ok);

    // ✅ fotos obligatorias
    const conFotos = lista.every(i => i.fotos && i.fotos.length > 0);

    // ✅ comentarios obligatorios
    const conComentarios = lista.every(
      i => i.comentarios && i.comentarios.length > 0
    );

    if (!completo || !conFotos || !conComentarios) {
      alert(`Checklist ${tipo} incompleto`);
      return;
    }
  }

  // ✅ aprobar
  ot.pruebasAprobado = true;

  ot.estado = obtenerEstadoOT(ot);

  guardarCambiosOT();

  habilitarTab("despacho");

  alert("PRUEBAS aprobadas, se habilita DESPACHO");
}

function validarPruebasCompleto() {

  if (!ot.pruebas) {
    alert("Debes cargar los checklist de pruebas");
    return false;
  }

  const tipos = ["mecanico", "electrico"];

  for (let tipo of tipos) {

    const lista = ot.pruebas[tipo];

    if (!lista || lista.length === 0) {
      alert(`Falta checklist ${tipo}`);
      return false;
    }

    const checklist = lista.every(i => i.ok);
    const fotos = lista.every(i => i.fotos && i.fotos.length > 0);
    const comentarios = lista.every(i => i.comentarios && i.comentarios.length > 0);

    if (!checklist) {
      alert(`Checklist ${tipo} incompleto`);
      return false;
    }

    if (!fotos) {
      alert(`Faltan evidencias en ${tipo}`);
      return false;
    }

    if (!comentarios) {
      alert(`Faltan comentarios en ${tipo}`);
      return false;
    }
  }

  return true;
}


// =======================
// SUBIR DOCUMENTOS POR SECCIÓN
// =======================
function subirDocsSeccion(tipo) {

  const inputId = tipo === "preparacion" ? "docsPrep" : "docsFinal";
  const input = document.getElementById(inputId);
  const files = input.files;

  if (!files.length) {
    alert("Selecciona archivos");
    return;
  }

  if (!ot.despacho) {
    ot.despacho = { preparacion: [], final: [] };
  }

  if (!ot.despacho[tipo]) {
    ot.despacho[tipo] = [];
  }

  for (let file of files) {
    const reader = new FileReader();

    reader.onload = function() {

      ot.despacho[tipo].push({
        nombre: file.name,
        tipo: file.type,
        data: reader.result
      });

      guardarCambiosOT();
      renderDocsSeccion(tipo);
    };

    reader.readAsDataURL(file);
  }

  input.value = "";
}

// =======================
// RENDER DOCUMENTOS SECCIÓN
// =======================
function renderDocsSeccion(tipo) {

  const contId = tipo === "preparacion" ? "listaDocsPrep" : "listaDocsFinal";
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
        <button onclick="abrirDocSeccion(event, '${tipo}', ${index})">👁</button>
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

  visor.src = doc.data;
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
  const docs = ot.despacho.documentos?.length > 0;

  if (!prep) {
    alert("Faltan documentos de preparación");
    return false;
  }

  if (!final) {
    alert("Faltan documentos de despacho final");
    return false;
  }

  if (!docs) {
    alert("Faltan documentos generales");
    return false;
  }

  return true;
}

// =======================
// CERRAR OT
// =======================
function cerrarOT() {

  if (!ot) {
    alert("No hay OT cargada");
    return;
  }

  const confirmar = confirm("¿Seguro que deseas cerrar la OT?");
  if (!confirmar) return;

  // 🔥 VALIDACIÓN TOTAL
  if (!validarOTCompleta()) return;

  ot.estado = "CERRADA";
  ot.fechaCierre = new Date().toLocaleString();

  guardarCambiosOT();

  alert("OT FINALIZADA COMPLETAMENTE ✅");

  localStorage.removeItem("otActiva");
  window.location.href = "dashboard.html";
}

// =======================
// VALIDACIÓN COMPLETA OT
// =======================
function validarOTCompleta() {

  // 🔹 INGRESO
  if (!ot.ingreso || ot.ingreso.length === 0) {
    alert("Falta completar INGRESO");
    return false;
  }

  const ingresoOk = ot.ingreso.every(i => i.ok);
  const ingresoFotos = ot.ingreso.every(i => i.fotos?.length > 0);
  const ingresoComentarios = ot.ingreso.every(i => i.comentarios?.length > 0);

  if (!ingresoOk || !ingresoFotos || !ingresoComentarios) {
    alert("INGRESO incompleto");
    return false;
  }

  // 🔹 EVALUACIÓN
  if (!ot.evaluacion || ot.evaluacion.length === 0) {
    alert("Falta EVALUACIÓN");
    return false;
  }

  const evalOk = ot.evaluacion.every(i => i.ok);
  const evalFotos = ot.evaluacion.every(i => i.fotos?.length > 0);
  const evalComentarios = ot.evaluacion.every(i => i.comentarios?.length > 0);

  if (!evalOk || !evalFotos || !evalComentarios) {
    alert("EVALUACIÓN incompleta");
    return false;
  }

  // 🔹 OVERHAUL
  if (!ot.overhaul || ot.overhaul.length === 0) {
    alert("Falta OVERHAUL");
    return false;
  }

  const overOk = ot.overhaul.every(i => i.ok);
  const overFotos = ot.overhaul.every(i => i.fotos?.length > 0);

  if (!overOk || !overFotos) {
    alert("OVERHAUL incompleto");
    return false;
  }

  // 🔹 PRUEBAS
  if (!ot.pruebas) {
    alert("Faltan PRUEBAS");
    return false;
  }

  const tipos = ["mecanico", "electrico"];

  for (let tipo of tipos) {
    const lista = ot.pruebas[tipo];

    if (!lista || lista.length === 0) {
      alert(`Falta checklist ${tipo}`);
      return false;
    }

    const completo = lista.every(i => i.ok);
    const conFotos = lista.every(i => i.fotos?.length > 0);
    const conComentarios = lista.every(i => i.comentarios?.length > 0);

    if (!completo || !conFotos || !conComentarios) {
      alert(`PRUEBAS ${tipo} incompleto`);
      return false;
    }
  }

  // 🔹 DESPACHO
  if (!ot.despacho) {
    alert("Falta DESPACHO");
    return false;
  }

  const prep = ot.despacho.preparacion?.length > 0;
  const final = ot.despacho.final?.length > 0;
  const docs = ot.despacho.documentos?.length > 0;

  if (!prep || !final || !docs) {
    alert("DESPACHO incompleto");
    return false;
  }

  return true;
}

// =======================
// SUBIR DOCUMENTOS GENERALES
// =======================
function subirDocumentos() {

  const input = document.getElementById("inputDocs");
  const files = input.files;

  if (!files.length) {
    alert("Selecciona archivos");
    return;
  }

  if (!ot) {
    alert("No hay OT cargada");
    return;
  }

  // 🔥 asegurar estructura
  if (!ot.despacho) {
    ot.despacho = { preparacion: [], final: [], documentos: [] };
  }

  if (!ot.despacho.documentos) {
    ot.despacho.documentos = [];
  }

  for (let file of files) {

    const reader = new FileReader();

    reader.onload = function() {

      ot.despacho.documentos.push({
        nombre: file.name,
        tipo: file.type,
        data: reader.result
      });

      guardarCambiosOT();
      mostrarDocs();
    };

    reader.readAsDataURL(file);
  }

  // limpiar input
  input.value = "";
}

function abrirDocumentoDesdeLista(e, index) {
  e.stopPropagation();
  abrirDocumento(ot.despacho.documentos[index]);
}

function eliminarDocumento(e, index) {

  e.stopPropagation();

  const confirmar = confirm("¿Eliminar documento?");
  if (!confirmar) return;

  if (!ot?.despacho?.documentos) return;

  ot.despacho.documentos.splice(index, 1);

  guardarCambiosOT();

  mostrarDocs();
}

function mostrarDocs() {

  const cont = document.getElementById("listaDocs");
  if (!cont) return;

  cont.innerHTML = "";

  if (!ot?.despacho?.documentos) return;

  ot.despacho.documentos.forEach((doc, index) => {

    const div = document.createElement("div");
    div.className = "doc-item";

    div.innerHTML = `
      <div class="doc-left">
        <span class="doc-icon">📄</span>
        <span class="doc-name">${doc.nombre}</span>
      </div>

      <div class="doc-actions">
        <button onclick="abrirDocumentoDesdeLista(event, ${index})">👁</button>
        <button onclick="eliminarDocumento(event, ${index})">🗑</button>
      </div>
    `;

    cont.appendChild(div);
  });
}

// =======================
// GENERAR PDF
// =======================
// =======================
// GENERAR PDF CON FOTOS
// =======================
function generarPDF() {

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
function renderBloqueServicio(tituloSeccion, lista) {

  if (!lista || lista.length === 0) return;

  titulo(tituloSeccion);

  lista.forEach((item, index) => {

    checkPage();

    // =========================
    // ITEM
    // =========================
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");

    doc.text(`${index + 1}. ${item.item}`, 10, y);

    y += 8;

    // =========================
    // COMENTARIOS
    // =========================
    if (item.comentarios?.length > 0) {

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");

      doc.text("Trabajos realizados:", 15, y);

      y += 6;

      item.comentarios.forEach(c => {

        doc.setFont("helvetica", "normal");

        const texto =
          `• ${c.nombre}: ${c.texto}`;

        const split = doc.splitTextToSize(texto, 170);

        doc.text(split, 20, y);

        y += split.length * 5 + 3;

      });
    }

    // =========================
    // FOTOS
    // =========================
    if (item.fotos?.length > 0) {

      y += 5;

      doc.setFont("helvetica", "bold");

      doc.text("Evidencias fotográficas:", 15, y);

      y += 10;

      let x = 15;
      let col = 0;

      item.fotos.forEach(foto => {

        checkPage();

        try {

          // Marco
          doc.setDrawColor(180);
          doc.rect(x - 1, y - 1, 57, 42);

          // Imagen
          doc.addImage(
            foto,
            "JPEG",
            x,
            y,
            55,
            40
          );

        } catch(e) {
          console.warn(e);
        }

        col++;

        if (col === 3) {

          col = 0;
          x = 15;
          y += 48;

        } else {

          x += 58;
        }

      });

      y += 55;
    }

    y += 10;

  });

}

// =========================
// INGRESO
// =========================
renderBloqueServicio(
  "3. INGRESO",
  ot.ingreso
);

// =========================
// EVALUACIÓN
// =========================
renderBloqueServicio(
  "4. EVALUACIÓN",
  ot.evaluacion
);

// =========================
// OVERHAUL
// =========================
renderBloqueServicio(
  "5. OVERHAUL",
  ot.overhaul
);

// =========================
// PRUEBAS MECÁNICAS
// =========================
if (ot.pruebas?.mecanico) {

  renderBloqueServicio(
    "6. PRUEBAS MECÁNICAS",
    ot.pruebas.mecanico
  );

}

// =========================
// PRUEBAS ELÉCTRICAS
// =========================
if (ot.pruebas?.electrico) {

  renderBloqueServicio(
    "7. PRUEBAS ELÉCTRICAS",
    ot.pruebas.electrico
  );

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

function actualizarPipeline() {

  const estado = obtenerEstadoOT(ot);

  const orden = [
    "INGRESO",
    "EVALUACION",
    "OVERHAUL",
    "PRUEBAS",
    "DESPACHO",
    "CERRADA"
  ];

  orden.forEach((step, i) => {

    const el = document.getElementById("step-" + step.toLowerCase());
    if (!el) return;

    el.classList.remove("active", "done");

    const indexEstado = orden.indexOf(estado);

    if (i < indexEstado) {
      el.classList.add("done");
    } else if (i === indexEstado) {
      el.classList.add("active");
    }

  });
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