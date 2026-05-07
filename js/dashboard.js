
let listaOTs = [];
let listaFiltrada = [];

// =======================
// ESTADO AUTOMÁTICO
// =======================
function obtenerEstadoOT(ot) {
  if (!ot) return "INGRESO";

  if (!ot.ingresoAprobado) return "INGRESO";
  if (!ot.evaluacionAprobada) return "EVALUACION";
  if (!ot.overhaulAprobado) return "OVERHAUL";
  if (!ot.pruebasAprobado) return "PRUEBAS";

  if (!ot.despacho) return "DESPACHO";

  return "CERRADA";
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
  const data = localStorage.getItem("ots");

  if (data) {
    listaOTs = JSON.parse(data);
  }

  listaFiltrada = [...listaOTs];

  renderTabla(listaFiltrada);
  calcularKPIs(listaFiltrada);

  // Sidebar activo
  document.querySelectorAll(".sidebar li").forEach(item => {
    item.addEventListener("click", function() {
      document.querySelectorAll(".sidebar li").forEach(i => i.classList.remove("active"));
      this.classList.add("active");
    });
  });

  renderGraficos(listaFiltrada);
};

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

  localStorage.setItem("otActiva", ot.id);
  window.location.href = "index.html";
}

// =======================
// NUEVA OT
// =======================
function nuevaOT() {
  localStorage.removeItem("otActiva");
  window.location.href = "index.html";
}

// =======================
// IR DASHBOARD
// =======================
function irDashboard() {
  window.location.href = "dashboard.html";
}

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