const usuario = JSON.parse(
  localStorage.getItem("usuarioActivo")
);

if (!usuario) {
  window.location.replace("index.html");
}

import { db } from "./firebase-config.js";

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot
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

  const usuarioActivo = JSON.parse(
    localStorage.getItem("usuarioActivo")
  );

  if (!usuarioActivo) {
    window.location.replace("index.html");
    return;
  }

  const q = query(
    collection(db, "ots"),
    where("empresaId", "==", usuarioActivo.empresaId),
    where("sucursalId", "==", usuarioActivo.sucursalId),
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
    renderEstadoTaller(listaFiltrada);
    renderAlertasDashboard(listaFiltrada);
    renderProximosDespachos(listaFiltrada);
    renderGanttTaller(listaFiltrada);

    console.log(
      "Dashboard actualizado por sucursal ✅",
      usuarioActivo.sucursalId,
      listaOTs
    );

  }, (error) => {
    console.error("Error escuchando OTs:", error);
    alert("Error al cargar OTs desde Firebase");
  });
}

function estaOTAtrasada(o) {

  if (!o) return false;

  if (o.cerrada === true || o.estado === "CERRADA") {
    return false;
  }

  if (!o.gantt || !o.gantt.fechaTermino) {
    return false;
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const fechaTermino = new Date(o.gantt.fechaTermino + "T00:00:00");
  fechaTermino.setHours(0, 0, 0, 0);

  return hoy > fechaTermino;
}

function diasAtrasoOT(o) {

  if (!estaOTAtrasada(o)) return 0;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const fechaTermino = new Date(o.gantt.fechaTermino + "T00:00:00");
  fechaTermino.setHours(0, 0, 0, 0);

  const diferencia = hoy - fechaTermino;

  return Math.floor(diferencia / (1000 * 60 * 60 * 24));
}

// =======================
// RENDER TABLA
// =======================
function renderTabla(lista = listaOTs) {

  const cont = document.getElementById("cardsOT");
  if (!cont) return;

  cont.innerHTML = "";

  lista.forEach((o) => {

    const estado = obtenerEstadoOT(o);
    const progreso = calcularProgreso(o);

    const atrasada = estaOTAtrasada(o);
    const diasAtraso = diasAtrasoOT(o);

    const fechaEntrega =
      o.gantt?.fechaTermino
        ? formatearFechaCorta(
            new Date(o.gantt.fechaTermino + "T00:00:00")
          )
        : "Sin fecha";

    const badgesOT = renderBadgesOT(o, estado, atrasada, diasAtraso);

    const card = document.createElement("div");

    card.className = `
      ot-card-pro
      ${atrasada ? "atrasada" : ""}
    `;

    card.innerHTML = `

      <div class="ot-card-top">

        <div>
          <h3>${o.os || "Sin OS"}</h3>
          <span>${o.equipo || "Equipo sin nombre"}</span>
        </div>

        <div class="estado-card ${estado.toLowerCase()}">
          ${estado}
        </div>

      </div>

      <div class="ot-card-cliente">
        👤 ${o.cliente || "Cliente no definido"}
      </div>

      <div class="ot-card-badges">
        ${badgesOT}
      </div>

      <div class="ot-card-progress">

        <div class="progress-bar">
          <div
            class="progress"
            style="width:${progreso}%"
          ></div>
        </div>

        <small>${progreso}% completado</small>

      </div>

      <div class="mini-gantt">

        ${renderMiniGantt(estado)}

      </div>

      <div class="ot-card-footer">

        <div>
          📅 ${fechaEntrega}
        </div>

        ${
          atrasada
            ? `<div class="badge-atraso">
                ⚠ ${diasAtraso} día(s)
              </div>`
            : ""
        }

      </div>

      <div class="ot-card-actions">

        <button
          class="btn-card-open"
          onclick="abrirOT(${listaOTs.indexOf(o)})"
        >
          Abrir OT
        </button>

      </div>
    `;

    cont.appendChild(card);
  });
}

function renderMiniGantt(estadoActual) {

  const etapas = [
    "INGRESO",
    "EVALUACION",
    "OVERHAUL",
    "PRUEBAS",
    "DESPACHO"
  ];

  const indexActual = etapas.indexOf(estadoActual);

  return etapas.map((etapa, i) => {

    let clase = "mini-gantt-pendiente";

    if (i < indexActual) {
      clase = "mini-gantt-completo";
    }

    if (i === indexActual) {
      clase = "mini-gantt-activo";
    }

    return `
      <div class="mini-gantt-row">

        <span>${etapa}</span>

        <div class="mini-gantt-bar">

          <div class="${clase}"></div>

        </div>

      </div>
    `;
  }).join("");
}

function renderBadgesOT(o, estado, atrasada, diasAtraso) {

  const badges = [];

  if (atrasada) {
    badges.push(`
      <span class="ot-badge badge-rojo">
        🔴 Atrasada ${diasAtraso} día(s)
      </span>
    `);
  } else if (o.gantt?.fechaTermino) {
    badges.push(`
      <span class="ot-badge badge-verde">
        🟢 En tiempo
      </span>
    `);
  }

  if (o.gantt?.diasRepuestos > 0 && estado !== "CERRADA") {
    badges.push(`
      <span class="ot-badge badge-naranjo">
        📦 Repuestos
      </span>
    `);
  }

  if (estado === "PRUEBAS") {
    badges.push(`
      <span class="ot-badge badge-morado">
        🧪 Pruebas
      </span>
    `);
  }

  if (estado === "DESPACHO") {
    badges.push(`
      <span class="ot-badge badge-cyan">
        🚚 Despacho
      </span>
    `);
  }

  if (o.alertaJefe) {
    badges.push(`
      <span class="ot-badge badge-amarillo">
        ⚠ Observación
      </span>
    `);
  }

  return badges.join("");
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
  document.getElementById("kpiAtrasadas").textContent =
  listaOTs.filter(o => estaOTAtrasada(o)).length;
}

function renderEstadoTaller(lista = listaOTs) {

  const estados = {
    INGRESO: 0,
    EVALUACION: 0,
    OVERHAUL: 0,
    PRUEBAS: 0,
    DESPACHO: 0
  };

  lista.forEach(ot => {
    const estado = obtenerEstadoOT(ot);

    if (estados[estado] !== undefined) {
      estados[estado]++;
    }
  });

  const ingreso = document.getElementById("estadoIngreso");
  const evaluacion = document.getElementById("estadoEvaluacion");
  const overhaul = document.getElementById("estadoOverhaul");
  const pruebas = document.getElementById("estadoPruebas");
  const despacho = document.getElementById("estadoDespacho");

  if (ingreso) ingreso.textContent = estados.INGRESO;
  if (evaluacion) evaluacion.textContent = estados.EVALUACION;
  if (overhaul) overhaul.textContent = estados.OVERHAUL;
  if (pruebas) pruebas.textContent = estados.PRUEBAS;
  if (despacho) despacho.textContent = estados.DESPACHO;
}

function renderAlertasDashboard(lista = listaOTs) {

  const cont = document.getElementById("alertasDashboard");
  if (!cont) return;

  cont.innerHTML = "";

  const alertas = [];

  lista.forEach(ot => {

    const estado = obtenerEstadoOT(ot);

    if (estaOTAtrasada(ot)) {
      alertas.push({
        tipo: "atraso",
        texto: `⚠ ${ot.os || "OS sin número"} atrasada ${diasAtrasoOT(ot)} día(s)`
      });
    }

    if (ot.gantt?.diasRepuestos > 0 && estado !== "CERRADA") {
      alertas.push({
        tipo: "repuestos",
        texto: `📦 ${ot.os || "OS sin número"} tiene espera de repuestos`
      });
    }

    if (estado === "PRUEBAS" && !ot.pruebasAprobado) {
      alertas.push({
        tipo: "pruebas",
        texto: `🧪 ${ot.os || "OS sin número"} tiene pruebas pendientes de aprobación`
      });
    }

    if (estado === "DESPACHO" && !ot.cerrada) {
      alertas.push({
        tipo: "despacho",
        texto: `🚚 ${ot.os || "OS sin número"} está pendiente de cierre/despacho`
      });
    }

    if (ot.alertaJefe) {
      alertas.push({
        tipo: "jefe",
        texto: `👨‍💼 ${ot.os || "OS sin número"} tiene observaciones del Jefe de Taller`
      });
    }
  });

  if (alertas.length === 0) {
    cont.innerHTML = `<p class="sin-alertas">Sin alertas activas.</p>`;
    return;
  }

  alertas.slice(0, 6).forEach(alerta => {
    const div = document.createElement("div");
    div.className = "alerta-dashboard-item";
    div.textContent = alerta.texto;
    cont.appendChild(div);
  });
}

function renderProximosDespachos(lista = listaOTs) {

  const cont = document.getElementById("listaProximosDespachos");
  if (!cont) return;

  cont.innerHTML = "";

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const despachos = lista
    .filter(ot => ot.gantt?.fechaTermino && obtenerEstadoOT(ot) !== "CERRADA")
    .map(ot => {

      const fecha = new Date(ot.gantt.fechaTermino + "T00:00:00");
      fecha.setHours(0, 0, 0, 0);

      const diff = Math.ceil(
        (fecha - hoy) / (1000 * 60 * 60 * 24)
      );

      return {
        ot,
        fecha,
        diff
      };
    })
    .sort((a, b) => a.fecha - b.fecha)
    .slice(0, 5);

  if (despachos.length === 0) {
    cont.innerHTML = `<p class="sin-alertas">No hay despachos programados.</p>`;
    return;
  }

  despachos.forEach(item => {

    let badge = "";
    let clase = "";

    if (item.diff < 0) {
      badge = `🔴 Atrasada ${Math.abs(item.diff)} día(s)`;
      clase = "badge-despacho-atrasado";
    } else if (item.diff <= 2) {
      badge = `🟡 ${item.diff === 0 ? "Hoy" : item.diff + " día(s)"}`;
      clase = "badge-despacho-riesgo";
    } else {
      badge = `🟢 ${item.diff} día(s)`;
      clase = "badge-despacho-ok";
    }

    const div = document.createElement("div");
    div.className = "despacho-item-pro";

    div.innerHTML = `
      <strong>${item.ot.os || "—"}</strong>
      <span>${item.ot.equipo || "Equipo sin nombre"} | ${formatearFechaCorta(item.fecha)}</span>
      <b class="${clase}">${badge}</b>
    `;

    cont.appendChild(div);
  });
}

function renderGanttTaller(lista = listaOTs) {

  const cont = document.getElementById("ganttTaller");
  if (!cont) return;

  cont.innerHTML = "";

  const otsConGantt = lista
    .filter(ot => ot.gantt?.fechaInicio && ot.gantt?.fechaTermino)
    .filter(ot => obtenerEstadoOT(ot) !== "CERRADA")
    .slice(0, 8);

  if (otsConGantt.length === 0) {
    cont.innerHTML = `<p class="sin-alertas">No hay Cartas Gantt activas.</p>`;
    return;
  }

  const fechasInicio = otsConGantt.map(ot =>
    new Date(ot.gantt.fechaInicio + "T00:00:00")
  );

  const fechasTermino = otsConGantt.map(ot =>
    new Date(ot.gantt.fechaTermino + "T00:00:00")
  );

  const inicioGlobal = new Date(Math.min(...fechasInicio));
  const terminoGlobal = new Date(Math.max(...fechasTermino));

  const diasTotales = Math.max(
    1,
    Math.ceil((terminoGlobal - inicioGlobal) / (1000 * 60 * 60 * 24))
  );

  const wrapper = document.createElement("div");
  wrapper.className = "gantt-taller-wrapper";

  wrapper.innerHTML = `
    <div class="gantt-taller-header">
      <span>${formatearFechaCorta(inicioGlobal)}</span>
      <span>${formatearFechaCorta(terminoGlobal)}</span>
    </div>
  `;

  otsConGantt.forEach(ot => {

    const estado = obtenerEstadoOT(ot);
    const atrasada = estaOTAtrasada(ot);

    const inicio = new Date(ot.gantt.fechaInicio + "T00:00:00");
    const termino = new Date(ot.gantt.fechaTermino + "T00:00:00");

    const diffInicio = Math.max(
      0,
      Math.ceil((inicio - inicioGlobal) / (1000 * 60 * 60 * 24))
    );

    const duracion = Math.max(
      1,
      Math.ceil((termino - inicio) / (1000 * 60 * 60 * 24))
    );

    let left = (diffInicio / diasTotales) * 100;
    let width = (duracion / diasTotales) * 100;

    if (left + width > 100) {
      width = 100 - left;
    }

    width = Math.max(4, width);

    const row = document.createElement("div");
    row.className = `gantt-taller-row ${atrasada ? "atrasada" : ""}`;

    row.innerHTML = `
      <div class="gantt-taller-info">
        <strong>${ot.os || "Sin OS"}</strong>
        <span>${ot.equipo || "Equipo"}</span>
      </div>

      <div class="gantt-taller-track">
        <div
          class="gantt-taller-bar ${estado.toLowerCase()}"
          style="left:${left}%; width:${width}%;">
          ${estado}
        </div>
      </div>
    `;

    wrapper.appendChild(row);
  });

  cont.appendChild(wrapper);
}

function formatearFechaCorta(fecha) {
  return fecha.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).replace(".", "");
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
  renderEstadoTaller(listaFiltrada);
  renderAlertasDashboard(listaFiltrada);
  renderProximosDespachos(listaFiltrada);
  renderGanttTaller(listaFiltrada);
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