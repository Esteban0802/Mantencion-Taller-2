const usuario = JSON.parse(
  localStorage.getItem("usuarioActivo")
);

if (!usuario) {
  window.location.replace("index.html");
}

import { db } from "./firebase-config.js";

import {
  collection,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let listaOTs = [];
let listaFiltrada = [];

// =======================
// ESTADO AUTOMÁTICO
// =======================
function obtenerEstadoOT(ot) {

  if (!ot) return "INGRESO";

  if (ot.estado === "CERRADA" || ot.cerrada === true) {
    return "CERRADA";
  }

  if (!ot.ingresoAprobado) return "INGRESO";

  if (!ot.evaluacionAprobada) return "EVALUACION";

  if (ot.overhaulRequerido === false) return "DESPACHO";

  if (ot.overhaulRequerido === true && !ot.overhaulAprobado) {
    return "OVERHAUL";
  }

  if (!ot.pruebasAprobado) return "PRUEBAS";

  return "DESPACHO";
}

// =======================
// PROGRESO AUTOMÁTICO
// =======================
function calcularProgreso(ot) {
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

// =======================
// CARGAR TODAS LAS OT
// =======================
window.onload = () => {
  renderUsuarioActivo();

  escucharOTsTiempoReal();

  document.querySelectorAll(".sidebar li").forEach(item => {
    item.addEventListener("click", function() {
      document.querySelectorAll(".sidebar li").forEach(i => i.classList.remove("active"));
      this.classList.add("active");
    });
  });

};

function escucharOTsTiempoReal() {

  const q = query(
    collection(db, "ots"),
    orderBy("fechaCreacion", "desc")
  );

  onSnapshot(q, (snapshot) => {

    listaOTs = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    listaFiltrada = [...listaOTs];

    renderTabla(listaFiltrada);
    calcularKPIs(listaFiltrada);
    renderGraficos(listaFiltrada);

    console.log("Dashboard actualizado en tiempo real ✅", listaOTs);

  }, (error) => {
    console.error("Error escuchando OTs:", error);
    alert("Error al cargar OTs desde Firebase");
  });
}

// =======================
// RENDER TABLA
// =======================
function renderTabla(lista = listaOTs) {
  const tbody = document.getElementById("tablaOT");
  if (!tbody) return;

  tbody.innerHTML = "";

  lista.forEach((o, i) => {

    const estado = obtenerEstadoOT(o);
    const progreso = calcularProgreso(o);

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${o.os || "—"}</td>
      <td>${o.equipo || "—"}</td>
      <td>${o.serie || "—"}</td>

      <td class="estado ${estado.toLowerCase()}">${estado}</td>

      <td>
        <div class="progress-bar">
          <div class="progress" style="width:${progreso}%"></div>
        </div>
        <small>${progreso}%</small>
      </td>

      <td>
  <button class="btn-icon" onclick="abrirOT(${listaOTs.indexOf(o)})">👁</button>

  ${
  o.alertaJefe
    ? `<button
          class="alerta-jefe-dashboard"
          title="Ver comentarios del Jefe de Taller"
          onclick='mostrarAlertasJefe(${JSON.stringify(o)})'
       >
          ⚠
       </button>`
    : ""
}
</td>
    `;

    tbody.appendChild(tr);
  });
}

function pintarEstado(ot) {

  const estado = obtenerEstadoOT(ot);

  const colores = {
    INGRESO: "#6c757d",
    EVALUACION: "#ffc107",
    OVERHAUL: "#0d6efd",
    PRUEBAS: "#6f42c1",
    DESPACHO: "#20c997",
    CERRADA: "#198754"
  };

  return `
    <span style="
      background:${colores[estado]};
      color:white;
      padding:5px 10px;
      border-radius:12px;
      font-size:12px;
      font-weight:bold;
    ">
      ${estado}
    </span>
  `;
}

// =======================
// KPI
// =======================
function calcularKPIs(lista = listaOTs) {
  let total = lista.length;
  let proceso = 0;
  let cerradas = 0;

  lista.forEach(ot => {
    const estado = obtenerEstadoOT(ot);

    if (estado === "CERRADA") {
      cerradas++;
    } else {
      proceso++;
    }
  });

  document.getElementById("kpiTotal").textContent = total;
  document.getElementById("kpiProceso").textContent = proceso;
  document.getElementById("kpiCerradas").textContent = cerradas;
}

// =======================
// ABRIR OT
// =======================
function abrirOT(index) {
  const ot = listaOTs[index];

  if (!ot) {
    alert("No se encontró la OT");
    return;
  }

  localStorage.setItem("otActiva", ot.id);
  window.location.href = "flujo.html";
}

window.abrirOT = abrirOT;


// =======================
// NUEVA OT
// =======================
function nuevaOT() {
  localStorage.removeItem("otActiva");
  window.location.href = "flujo.html";
}

window.nuevaOT = nuevaOT;

// =======================
// IR DASHBOARD
// =======================
function irDashboard() {
  window.location.href = "dashboard.html";
}

window.irDashboard = irDashboard;

function filtrarOTs() {
  const texto = document.getElementById("inputBuscar").value.toLowerCase();

  listaFiltrada = listaOTs.filter(ot => {

    const os = (ot.os || "").toLowerCase();
    const equipo = (ot.equipo || "").toLowerCase();
    const serie = (ot.serie || "").toLowerCase();

    return (
      os.includes(texto) ||
      equipo.includes(texto) ||
      serie.includes(texto)
    );
  });

  renderTabla(listaFiltrada);
  calcularKPIs(listaFiltrada);
}

window.filtrarOTs = filtrarOTs;

let chartEstados = null;
let chartProgreso = null;

function renderGraficos(lista = listaOTs) {

  const estadosCount = {
    INGRESO: 0,
    EVALUACION: 0,
    OVERHAUL: 0,
    PRUEBAS: 0,
    DESPACHO: 0,
    CERRADA: 0
  };

  let progresoTotal = 0;

  lista.forEach(ot => {

    const estado = obtenerEstadoOT(ot);
    estadosCount[estado]++;

    progresoTotal += calcularProgreso(ot);
  });

  const promedio = lista.length ? (progresoTotal / lista.length) : 0;

  // 🔥 DESTRUIR GRÁFICOS ANTES (IMPORTANTE)
  if (chartEstados) chartEstados.destroy();
  if (chartProgreso) chartProgreso.destroy();

  // 📊 GRAFICO ESTADOS
chartEstados = new Chart(document.getElementById("graficoEstados"), {
  type: "doughnut",
  data: {
    labels: Object.keys(estadosCount),
    datasets: [{
      data: Object.values(estadosCount),
      backgroundColor: [
        "#6c757d",  // gris ingreso
        "#f39c12",  // evaluacion
        "#007bff",  // overhaul
        "#8e44ad",  // pruebas
        "#16a085",  // despacho
        "#2ecc71"   // cerrada
      ],
      borderColor: "#ffffff", // 🔥 bordes blancos
      borderWidth: 2
    }]
  },
  options: {
    plugins: {
      legend: {
        labels: {
          color: "#ffffff" // 🔥 texto blanco
        }
      }
    }
  }
});

  // 📊 GRAFICO PROGRESO
  chartProgreso = new Chart(document.getElementById("graficoProgreso"), {
    type: "bar",
    data: {
      labels: ["Progreso Promedio"],
      datasets: [{
        data: [promedio],
        backgroundColor: ["#00c853"]
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          max: 100
        }
      }
    }
  });
}

window.addEventListener("storage", () => {
  const data = localStorage.getItem("ots");
  if (data) {
    listaOTs = JSON.parse(data);
    listaFiltrada = [...listaOTs];

    renderTabla(listaFiltrada);
    calcularKPIs(listaFiltrada);
    renderGraficos(listaFiltrada);
  }
});

function renderUsuarioActivo() {
  const usuarioActivo = JSON.parse(localStorage.getItem("usuarioActivo"));

  if (!usuarioActivo) return;

  const nombre = document.getElementById("usuarioNombre");
  const rol = document.getElementById("usuarioRol");

  if (nombre) {
    nombre.textContent = usuarioActivo.nombre || "Usuario";
  }

  if (rol) {
    if (usuarioActivo.rol === "jefe_taller") {
      rol.textContent = "Jefe Taller";
    } else if (usuarioActivo.rol === "usuario_taller") {
      rol.textContent = "Usuario Taller";
    } else {
      rol.textContent = usuarioActivo.rol || "Sin rol";
    }
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

window.abrirOT = abrirOT;
window.nuevaOT = nuevaOT;
window.irDashboard = irDashboard;
window.filtrarOTs = filtrarOTs;

// =========================
// MODAL ALERTAS JEFE
// =========================

function mostrarAlertasJefe(ot) {

  const lista = document.getElementById("listaAlertasJefe");
  if (!lista) return;

  lista.innerHTML = "";

  const alertas = new Set();

  const tienePendientesJefe = (items) => {
    return Array.isArray(items) && items.some(item =>
      Array.isArray(item.comentarios) &&
      item.comentarios.some(c =>
        c.rol === "jefe_taller" &&
        c.atendido !== true
      )
    );
  };

  const tienePendientesDirectos = (comentarios) => {
    return Array.isArray(comentarios) &&
      comentarios.some(c =>
        c.rol === "jefe_taller" &&
        c.atendido !== true
      );
  };

  if (tienePendientesJefe(ot.ingreso)) {
    alertas.add("📥 Ingreso");
  }

  if (tienePendientesJefe(ot.evaluacion)) {
    alertas.add("📋 Evaluación");
  }

  if (tienePendientesJefe(ot.overhaul)) {
    alertas.add("🔧 Overhaul");
  }

  if (tienePendientesJefe(ot.pruebas?.mecanico)) {
    alertas.add("🛠 Pruebas Mecánicas");
  }

  if (tienePendientesJefe(ot.pruebas?.electrico)) {
    alertas.add("⚡ Pruebas Eléctricas");
  }

  if (
    tienePendientesDirectos(ot.despacho?.comentariosPreparacion) ||
    tienePendientesDirectos(ot.despacho?.comentariosFinal)
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

// =========================
// CERRAR MODAL
// =========================

function cerrarModalAlertas() {

  document.getElementById("modalAlertasJefe").style.display = "none";
}

// =========================
// HACER FUNCIONES GLOBALES
// =========================

window.mostrarAlertasJefe = mostrarAlertasJefe;
window.cerrarModalAlertas = cerrarModalAlertas;