// =======================
// VARIABLES GLOBALES
// =======================
let ot = null;
let listaOTs = [];
let usuario = { rol: "admin" };

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

      <input type="file" onchange="subirFotoIngreso(event, ${i})">
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
function subirFotoIngreso(e, i) {

  const file = e.target.files[0];
  const reader = new FileReader();

  reader.onload = function() {
    ot.ingreso[i].fotos.push(reader.result);
    guardarCambiosOT();
    mostrarFotosIngreso(i);
  };

  reader.readAsDataURL(file);
}

function mostrarFotosIngreso(i) {

  const div = document.getElementById(`fotos-ingreso-${i}`);
  if (!div) return;

  div.innerHTML = "";

  ot.ingreso[i].fotos.forEach((foto, index) => {

    const cont = document.createElement("div");
    cont.style.position = "relative";
    cont.style.display = "inline-block";

    const img = document.createElement("img");
    img.src = foto;
    img.width = 100;

    const btn = document.createElement("button");
    btn.innerText = "❌";

    btn.style.position = "absolute";
    btn.style.top = "0";
    btn.style.right = "0";

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
    div.className = "item";

    div.innerHTML = `
      <strong>${c.nombre}</strong> - <small>${c.fecha}</small>
      <p>${c.texto}</p>
      <button onclick="eliminarComentarioIngreso(${i}, ${index})">🗑</button>
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
    lista[index] = ot;
  }

  localStorage.setItem("ots", JSON.stringify(lista));
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

function subirFotoEvaluacion(e, i) {
  const file = e.target.files[0];
  const reader = new FileReader();

  reader.onload = function() {
    ot.evaluacion[i].fotos.push(reader.result);

    guardarCambiosOT(); // 🔥 CLAVE

    mostrarFotosEvaluacion(i);
  };

  reader.readAsDataURL(file);
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

      <input type="file" onchange="subirFotoEvaluacion(event, ${i})">
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
    cont.style.position = "relative";
    cont.style.display = "inline-block";

    const img = document.createElement("img");
    img.src = foto;
    img.width = 100;

    const btn = document.createElement("button");
    btn.innerText = "❌";

    btn.style.position = "absolute";
    btn.style.top = "0";
    btn.style.right = "0";

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
    div.className = "item";

    div.innerHTML = `
      <strong>${c.nombre}</strong> - <small>${c.fecha}</small>
      <p>${c.texto}</p>
      <button onclick="eliminarComentarioEvaluacion(${i}, ${index})">🗑</button>
    `;

    cont.appendChild(div);
  });
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

  const completo = ot.evaluacion.every(i => i.ok);

  if (!completo) {
    alert("Debes completar todo el checklist");
    return;
  }

  // 🔥 IMPORTANTE
  ot.evaluacionAprobada = true;

  guardarCambiosOT();

  habilitarTab("overhaul");

  alert("Evaluación aprobada");
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

      <input type="file" onchange="subirFotoOverhaul(event, ${i})">

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

function subirFotoOverhaul(e, i) {
  const file = e.target.files[0];
  const reader = new FileReader();

  reader.onload = function() {
    ot.overhaul[i].fotos.push(reader.result);
    guardarCambiosOT();
    mostrarFotosOverhaul(i);
  };

  reader.readAsDataURL(file);
}

function mostrarFotosOverhaul(i) {
  const div = document.getElementById(`fotos-overhaul-${i}`);
  if (!div) return;

  div.innerHTML = "";

  (ot.overhaul[i].fotos || []).forEach((f, index) => {

    const container = document.createElement("div");

    const img = document.createElement("img");
    img.src = f;
    img.width = 100;

    const btn = document.createElement("button");
    btn.innerText = "❌";

    btn.onclick = () => {
      ot.overhaul[i].fotos.splice(index, 1);
      guardarCambiosOT();
      mostrarFotosOverhaul(i);
    };

    container.appendChild(img);
    container.appendChild(btn);

    div.appendChild(container);
  });
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
    div.className = "item";

    div.innerHTML = `
      <strong>${c.nombre}</strong> - <small>${c.fecha}</small>
      <p>${c.texto}</p>
      <button onclick="eliminarComentarioOverhaul(${i}, ${index})">🗑</button>
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

      <input type="file" onchange="subirFotoPrueba(event, '${tipo}', ${i})">

      <div id="fotos-${tipo}-${i}"></div>

      <hr>

      <input id="tecnico-${tipo}-${i}" placeholder="Técnico">
      <input id="comentario-${tipo}-${i}" placeholder="Trabajo realizado">

      <button onclick="agregarComentarioPrueba('${tipo}', ${i})">Agregar</button>

      <div id="comentarios-${tipo}-${i}"></div>

      <small>📅 ${fechaTexto}</small>
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

function subirFotoPrueba(e, tipo, i) {
  const file = e.target.files[0];
  const reader = new FileReader();

  reader.onload = function() {
    ot.pruebas[tipo][i].fotos.push(reader.result);
    mostrarFotosPrueba(tipo, i);
    guardarCambiosOT();
  };

  reader.readAsDataURL(file);
}

function mostrarFotosPrueba(tipo, i) {
  const div = document.getElementById(`fotos-${tipo}-${i}`);
  if (!div) return;

  div.innerHTML = "";

  ot.pruebas[tipo][i].fotos.forEach(f => {
    const img = document.createElement("img");
    img.src = f;
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
    div.className = "item";

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between;">
        <div>
          <strong>${c.nombre}</strong> - <small>${c.fecha}</small>
          <p>${c.texto}</p>
        </div>

        <button onclick="eliminarComentarioPrueba('${tipo}', ${i}, ${index})"
          style="background:red; color:white; border:none; border-radius:5px;">
          🗑
        </button>
      </div>
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
    container.style.position = "relative";
    container.style.display = "inline-block";
    container.style.margin = "5px";

    const img = document.createElement("img");
    img.src = foto;
    img.width = 100;

    const btn = document.createElement("button");
    btn.innerText = "❌";

    btn.style.position = "absolute";
    btn.style.top = "0";
    btn.style.right = "0";
    btn.style.background = "red";
    btn.style.color = "white";

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

  guardarCambiosOT();

  habilitarTab("despacho");

  alert("PRUEBAS aprobadas, se habilita DESPACHO");
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
      <span>${doc.nombre}</span>

      <div>
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

function validarDespachoCompleto() {

  if (!ot.despacho) return false;

  const prep = ot.despacho.preparacion?.length > 0;
  const final = ot.despacho.final?.length > 0;

  return prep && final;
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

  if (!ot.despacho) return false;

  const prep = ot.despacho.preparacion?.length > 0;
  const final = ot.despacho.final?.length > 0;
  const docs = ot.despacho.documentos?.length > 0;

  if (!prep || !final || !docs) {
    alert("Faltan documentos en despacho");
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
  const doc = new jsPDF();

  const logo = "./img/LOGO COLOR pn.png";

  let y = 20;

  // =======================
  // 🔷 HEADER
  // =======================
  function header() {

    // Logo
    doc.addImage(logo, "PNG", 10, 8, 40, 15);

    // Título
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("ORDEN DE SERVICIO", 105, 15, { align: "center" });

    // Línea
    doc.setDrawColor(0);
    doc.line(10, 25, 200, 25);

    y = 30;
  }

  header();

  // =======================
  // 🔷 DATOS GENERALES
  // =======================
  function seccionTitulo(texto) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(texto, 10, y);
    y += 6;
  }

  function textoNormal(txt) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(txt, 10, y);
    y += 5;
  }

  function saltoPagina() {
    if (y > 270) {
      doc.addPage();
      header();
    }
  }

  seccionTitulo("DATOS GENERALES");

  textoNormal(`Equipo: ${ot.equipo}`);
  textoNormal(`Serie: ${ot.serie}`);
  textoNormal(`Cliente: ${ot.cliente}`);
  textoNormal(`OS: ${ot.os}`);
  textoNormal(`Estado: ${ot.estado}`);
  textoNormal(`Fecha: ${new Date().toLocaleString()}`);

  y += 5;

  // =======================
  // 🔷 FUNCIÓN IMÁGENES
  // =======================
  function agregarImagen(img) {
    try {
      saltoPagina();
      doc.addImage(img, "JPEG", 10, y, 60, 40);
      y += 45;
    } catch (e) {
      console.warn("Error imagen", e);
    }
  }

  // =======================
  // 🔹 SECCIÓN GENÉRICA
  // =======================
  function renderSeccion(nombre, data) {

    if (!data || data.length === 0) return;

    saltoPagina();
    y += 5;

    seccionTitulo(nombre);

    data.forEach(item => {

      saltoPagina();

      doc.setFont("helvetica", "bold");
      doc.text(`✔ ${item.item}`, 10, y);
      y += 5;

      doc.setFont("helvetica", "normal");

      // comentarios
      if (item.comentarios) {
        item.comentarios.forEach(c => {
          doc.text(`- ${c.nombre}: ${c.texto}`, 12, y);
          y += 5;
        });
      }

      // fotos
      if (item.fotos) {
        item.fotos.forEach(f => agregarImagen(f));
      }

      y += 3;
    });
  }

  // =======================
  // 🔷 SECCIONES
  // =======================
  renderSeccion("INGRESO", ot.ingreso);
  renderSeccion("EVALUACIÓN", ot.evaluacion);
  renderSeccion("OVERHAUL", ot.overhaul);

  // =======================
  // 🔷 PRUEBAS
  // =======================
  if (ot.pruebas) {

    saltoPagina();
    seccionTitulo("PRUEBAS");

    ["mecanico", "electrico"].forEach(tipo => {

      const lista = ot.pruebas[tipo];
      if (!lista) return;

      doc.setFont("helvetica", "bold");
      doc.text(tipo.toUpperCase(), 10, y);
      y += 5;

      lista.forEach(item => {

        saltoPagina();

        doc.setFont("helvetica", "normal");
        doc.text(`✔ ${item.item}`, 12, y);
        y += 5;

        if (item.fotos) {
          item.fotos.forEach(f => agregarImagen(f));
        }

        y += 3;
      });

    });
  }

  // =======================
  // 🔷 DESPACHO
  // =======================
  if (ot.despacho?.documentos) {

    saltoPagina();
    seccionTitulo("DOCUMENTOS");

    ot.despacho.documentos.forEach(d => {
      textoNormal(`📄 ${d.nombre}`);
    });
  }

  // =======================
  // 🔷 FIRMA
  // =======================
  saltoPagina();

  y += 10;

  doc.line(20, y, 90, y);
  doc.line(110, y, 180, y);

  y += 5;

  doc.text("Técnico", 40, y);
  doc.text("Cliente", 140, y);

  // =======================
  // 🔷 FOOTER
  // =======================
  const totalPages = doc.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    doc.setFontSize(8);
    doc.text(
      `Página ${i} de ${totalPages}`,
      200,
      290,
      { align: "right" }
    );
  }

  // =======================
  // 🔚 EXPORTAR
  // =======================
  doc.save(`OT_${ot.os}.pdf`);
}