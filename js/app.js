// =======================
// VARIABLES GLOBALES
// =======================
let ot = null;
let usuario = { rol: "admin" }; // cambia a "tecnico" para probar

// =======================
// TABS
// =======================
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    if (tab.classList.contains("disabled")) return;

    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".content").forEach(c => c.classList.remove("active"));

    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  });
});

function habilitarTab(nombre) {
  document.querySelector(`[data-tab="${nombre}"]`).classList.remove("disabled");
}

// =======================
// CREAR OT (LEE EXCEL)
// =======================
function crearOT() {
  const equipo = document.getElementById("equipo").value;
  const serie = document.getElementById("serie").value;
  const file = document.getElementById("excelIngreso").files[0];

  if (!file) return alert("Sube Excel");

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
        fotos: []
      }));

    // 🔥 OBTENER LISTA ACTUAL
    let listaOTs = JSON.parse(localStorage.getItem("ots")) || [];

    const nueva = {
      id: Date.now(),
      equipo,
      serie,
      estado: "evaluacion",
      evaluacion: checklist,
      overhaul: [],
      pruebas: null,
      despacho: null
    };

    listaOTs.push(nueva);

    // 🔥 GUARDAR LISTA COMPLETA
    localStorage.setItem("ots", JSON.stringify(listaOTs));

    alert("OT creada correctamente");

    // 🔥 VOLVER AL DASHBOARD
    window.location.href = "dashboard.html";
  };

  reader.readAsArrayBuffer(file);
}

// =======================
// EVALUACION
// =======================
function cargarEvaluacion() {
  const cont = document.getElementById("listaEvaluacion");
  cont.innerHTML = "";

  ot.evaluacion.forEach((item, i) => {
    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <label>
        <input type="checkbox" onchange="toggleItem(${i})" ${item.ok ? "checked" : ""}>
        ${item.item}
      </label>
      <input type="file" onchange="subirFoto(event, ${i})">
      <div id="fotos-${i}"></div>
    `;

    cont.appendChild(div);
    mostrarFotos(i);
  });
}

function toggleItem(i) {
  ot.evaluacion[i].ok = !ot.evaluacion[i].ok;
  guardarCambiosOT();
}

function subirFoto(e, i) {
  const file = e.target.files[0];
  const reader = new FileReader();

  reader.onload = function() {
    ot.evaluacion[i].fotos.push(reader.result);
    mostrarFotos(i);
    localStorage.setItem("ot", JSON.stringify(ot));
  };

  reader.readAsDataURL(file);

  guardarCambiosOT();
}

function mostrarFotos(i) {
  const div = document.getElementById(`fotos-${i}`);
  div.innerHTML = "";

  ot.evaluacion[i].fotos.forEach(f => {
    const img = document.createElement("img");
    img.src = f;
    img.width = 100;
    div.appendChild(img);
  });
}

function guardarEvaluacion() {
  guardarCambiosOT();
  alert("Evaluación guardada");
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

  ot.aprobada = true;
  guardarCambiosOT();

  habilitarTab("overhaul");
  alert("Evaluación aprobada");
}

// =======================
// OVERHAUL (LEE EXCEL)
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
      .filter(item => item)
      .map(item => ({
        item: item,
        ok: false,
        fotos: []
      }));

    ot.overhaul = checklist;

    localStorage.setItem("ot", JSON.stringify(ot));

    renderOverhaul();
  };

  reader.readAsArrayBuffer(file);
}

function renderOverhaul() {
  const cont = document.getElementById("listaOverhaul");
  cont.innerHTML = "";

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
    `;

    cont.appendChild(div);
    mostrarFotosOverhaul(i);
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
    mostrarFotosOverhaul(i);
    guardarCambiosOT();
  };

  reader.readAsDataURL(file);
}

function mostrarFotosOverhaul(i) {
  const div = document.getElementById(`fotos-overhaul-${i}`);
  div.innerHTML = "";

  ot.overhaul[i].fotos.forEach(f => {
    const img = document.createElement("img");
    img.src = f;
    img.width = 100;
    div.appendChild(img);
  });
}

// =======================
// INICIO (RECARGA DATOS)
// =======================
window.onload = () => {

  const id = localStorage.getItem("otActiva");
  const data = localStorage.getItem("ots");

  if (!data) return;

  listaOTs = JSON.parse(data);

  // 👉 SI NO HAY OT ACTIVA → es nueva
  if (!id) return;

  // 👉 BUSCAR OT ACTIVA
  ot = listaOTs.find(o => o.id == id);

  if (!ot) return;

  // =========================
  // RESTAURAR FLUJO COMPLETO
  // =========================

  // 👉 EVALUACION
  habilitarTab("evaluacion");
  cargarEvaluacion();

  // 👉 OVERHAUL
  if (ot.aprobada) {
    habilitarTab("overhaul");
  }

  if (ot.overhaul && ot.overhaul.length > 0) {
    renderOverhaul();
  }

  // 👉 PRUEBAS
  if (ot.overhaulAprobado) {
    habilitarTab("pruebas");
  }

  if (ot.pruebas) {
    if (ot.pruebas.mecanico?.length > 0) {
      renderChecklist("mecanico");
    }

    if (ot.pruebas.electrico?.length > 0) {
      renderChecklist("electrico");
    }
  }

  // 👉 DESPACHO
  if (ot.pruebasAprobado) {
    habilitarTab("despacho");
  }

  // 👉 CHECKLIST DESPACHO (si existen)
  if (ot.despacho) {

    if (ot.despacho.preparacion?.length > 0) {
      renderDespacho("preparacion");
    }

    if (ot.despacho.final?.length > 0) {
      renderDespacho("final");
    }

    // 🔥 DOCUMENTOS (LO IMPORTANTE)
    if (ot.despacho.documentos?.length > 0) {
      mostrarDocs();
    }
  }

};

// =======================
// GUARDAR OVERHAUL
// =======================
function guardarOverhaul() {
  guardarCambiosOT();
  alert("Overhaul guardado");
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

  const completo = ot.overhaul.every(i => i.ok);

  if (!completo) {
    alert("Debes completar todo el checklist de Overhaul");
    return;
  }

  ot.overhaulAprobado = true;

  guardarCambiosOT();

  habilitarTab("pruebas");

  alert("Overhaul aprobado, se habilita PRUEBAS");
}

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
        fotos: []
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

function renderChecklist(tipo) {
  const cont = document.getElementById(
    tipo === "mecanico" ? "listaMecanico" : "listaElectrico"
  );

  cont.innerHTML = "";

  ot.pruebas[tipo].forEach((item, i) => {
    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <label>
        <input type="checkbox" onchange="togglePrueba('${tipo}', ${i})" ${item.ok ? "checked" : ""}>
        ${item.item}
      </label>
      <input type="file" onchange="subirFotoPrueba(event, '${tipo}', ${i})">
      <div id="fotos-${tipo}-${i}"></div>
    `;

    cont.appendChild(div);
    mostrarFotosPrueba(tipo, i);
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
  div.innerHTML = "";

  ot.pruebas[tipo][i].fotos.forEach(f => {
    const img = document.createElement("img");
    img.src = f;
    img.width = 100;
    div.appendChild(img);
  });
}

function guardarPruebas() {
  localStorage.setItem("ot", JSON.stringify(ot));
  alert("Pruebas guardadas");
}

function aprobarPruebas() {
  if (usuario.rol !== "admin") {
    alert("Solo admin puede aprobar");
    return;
  }

  if (!ot.pruebas) {
    alert("Debes cargar los checklist");
    return;
  }

  const mecCompleto = ot.pruebas.mecanico.every(i => i.ok);
  const elecCompleto = ot.pruebas.electrico.every(i => i.ok);

  if (!mecCompleto || !elecCompleto) {
    alert("Debes completar ambos checklist");
    return;
  }

  ot.pruebasAprobado = true;

  guardarCambiosOT();

  habilitarTab("despacho");

  alert("Pruebas aprobadas, se habilita DESPACHO");
}

function cargarChecklistDespacho(tipo) {
  const inputId = tipo === "preparacion" ? "excelPrep" : "excelFinal";
  const file = document.getElementById(inputId).files[0];

  if (!file) return alert("Sube el Excel");

  const reader = new FileReader();

  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const checklist = json.flat().filter(x => x).map(x => ({
      item: x,
      ok: false
    }));

    if (!ot.despacho) {
      ot.despacho = { preparacion: [], final: [], documentos: [] };
    }

    ot.despacho[tipo] = checklist;

    guardarCambiosOT();

    renderDespacho(tipo);
  };

  reader.readAsArrayBuffer(file);
}

function renderDespacho(tipo) {
  const cont = document.getElementById(
    tipo === "preparacion" ? "listaPreparacion" : "listaFinal"
  );

  cont.innerHTML = "";

  ot.despacho[tipo].forEach((item, i) => {
    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <label>
        <input type="checkbox" onchange="toggleDespacho('${tipo}', ${i})" ${item.ok ? "checked" : ""}>
        ${item.item}
      </label>
    `;

    cont.appendChild(div);
  });
}

function toggleDespacho(tipo, i) {
  ot.despacho[tipo][i].ok = !ot.despacho[tipo][i].ok;
  guardarCambiosOT();
}

function subirDocumentos() {
  const input = document.getElementById("inputDocs");
  const files = input.files;

  if (!files.length) {
    alert("Selecciona archivos");
    return;
  }

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

    reader.readAsDataURL(file); // 🔥 IMPORTANTE: NO XLSX
  }

  // limpiar input
  input.value = "";
}

function mostrarDocs() {
  const cont = document.getElementById("listaDocs");
  cont.innerHTML = "";

  if (!ot.despacho || !ot.despacho.documentos) return;

  ot.despacho.documentos.forEach(doc => {
    const div = document.createElement("div");
    div.className = "doc-item";

    div.innerHTML = `
      <span>${doc.nombre}</span>
      <span>📄</span>
    `;

    div.onclick = () => abrirDocumento(doc);

    cont.appendChild(div);
  });
}

function abrirDocumento(doc) {
  const win = window.open();
  win.document.write(`
    <iframe src="${doc.data}" style="width:100%; height:100%; border:none;"></iframe>
  `);
}

function guardarDespacho() {
  localStorage.setItem("ot", JSON.stringify(ot));
  alert("Despacho guardado");
}

function cerrarOT() {
  if (!ot.despacho) return alert("Falta despacho");

  const prepOk = ot.despacho.preparacion.every(i => i.ok);
  const finalOk = ot.despacho.final.every(i => i.ok);

  if (!prepOk || !finalOk) {
    alert("Completa todos los checklist");
    return;
  }

  if (ot.despacho.documentos.length === 0) {
    alert("Debes subir documentos");
    return;
  }

  ot.estado = "CERRADA";

  guardarCambiosOT();

  alert("OT FINALIZADA ✅");
}

function guardarCambiosOT() {
  const index = listaOTs.findIndex(o => o.id === ot.id);

  if (index !== -1) {
    listaOTs[index] = ot;
    localStorage.setItem("ots", JSON.stringify(listaOTs));
  }
}

function obtenerEstadoOT(ot) {

  if (ot.estado === "CERRADA") return "CERRADA";

  if (!ot.aprobada) return "EVALUACION";

  if (ot.aprobada && !ot.overhaulAprobado) return "OVERHAUL";

  if (ot.overhaulAprobado && !ot.pruebasAprobado) return "PRUEBAS";

  if (ot.pruebasAprobado) return "DESPACHO";

  return "INGRESO";
}


