let listaOTs = [];
let listaFiltrada = [];

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

      <td>
        <span class="estado ${estado.toLowerCase()}">
          ${estado}
        </span>
      </td>

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