let listaOTs = [];

// =======================
// ESTADO AUTOMÁTICO
// =======================
function obtenerEstadoOT(ot) {
  if (ot.estado === "CERRADA") return "CERRADA";

  if (!ot.aprobada) return "EVALUACION";

  if (ot.aprobada && !ot.overhaulAprobado) return "OVERHAUL";

  if (ot.overhaulAprobado && !ot.pruebasAprobado) return "PRUEBAS";

  if (ot.pruebasAprobado) return "DESPACHO";

  return "INGRESO";
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

  renderTabla();
  calcularKPIs();

  // Sidebar activo
  document.querySelectorAll(".sidebar li").forEach(item => {
    item.addEventListener("click", function() {
      document.querySelectorAll(".sidebar li").forEach(i => i.classList.remove("active"));
      this.classList.add("active");
    });
  });
};

// =======================
// RENDER TABLA
// =======================
function renderTabla() {
  const tbody = document.getElementById("tablaOT");
  if (!tbody) return;

  tbody.innerHTML = "";

  listaOTs.forEach((o, i) => {

    const estado = obtenerEstadoOT(o);
    const progreso = calcularProgreso(o);

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>OT-${o.id}</td>
      <td>${o.equipo}</td>
      <td>${o.serie}</td>

      <td>${estado}</td>

      <td>
        <div class="progress-bar">
          <div class="progress" style="width:${progreso}%"></div>
        </div>
        <small>${progreso}%</small>
      </td>

      <td>
        <button class="btn-icon" onclick="abrirOT(${i})">👁</button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

// =======================
// KPI
// =======================
function calcularKPIs() {
  let total = listaOTs.length;
  let proceso = 0;
  let cerradas = 0;

  listaOTs.forEach(ot => {
    const estado = obtenerEstadoOT(ot);

    if (estado === "CERRADA") {
      cerradas++;
    } else {
      proceso++;
    }
  });

  const kpiTotal = document.getElementById("kpiTotal");
  const kpiProceso = document.getElementById("kpiProceso");
  const kpiCerradas = document.getElementById("kpiCerradas");

  if (kpiTotal) kpiTotal.textContent = total;
  if (kpiProceso) kpiProceso.textContent = proceso;
  if (kpiCerradas) kpiCerradas.textContent = cerradas;
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