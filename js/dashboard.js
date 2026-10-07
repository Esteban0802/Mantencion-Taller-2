import { protegerPagina, cerrarSesion } from "./session.js?v=20261004-2";

import {
  obtenerModulosEmpresa,
  moduloActivo
} from "./modulos.js";


import {
  puedeVerDashboard,
  puedeVerOrdenesServicio,
  puedeCrearOT,
  puedeAbrirOT,
  puedeVerGantt,
  puedeVerDespacho,
  puedeVerReportes,
  puedeEntrarPanelEmpresa
} from "./permisos.js";


const usuario = protegerPagina([
  "super_admin",
  "admin_empresa",
  "admin_sucursal",
  "jefe_taller",
  "usuario_taller",
  "supervisor",
  "tecnico",
  "planificador"
]);

if (!usuario) throw new Error("Acceso no autorizado");

import { db } from "./firebase-config.js";
import { asegurarResumenesOT } from "./modulos/core/resumenOT.js";

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let listaOTs = [];
let listaFiltrada = [];
let empresaActualDashboard = null;
let modulosDashboard = {};
let cancelarEscuchaOTs = null;

const ETAPAS_DASHBOARD = [
  { key: "INGRESO", modulo: "ingreso", label: "INGRESO", estadoId: "estadoIngreso", color: "#6c757d" },
  { key: "EVALUACION", modulo: "evaluacion", label: "EVALUACIÓN", estadoId: "estadoEvaluacion", color: "#f39c12" },
  { key: "OVERHAUL", modulo: "mantencion", label: "MANTENCIÓN", estadoId: "estadoOverhaul", color: "#007bff" },
  { key: "PRUEBAS", modulo: "pruebas", label: "PRUEBAS", estadoId: "estadoPruebas", color: "#8e44ad" },
  { key: "DESPACHO", modulo: "despacho", label: "DESPACHO", estadoId: "estadoDespacho", color: "#16a085" }
];

function notificarDashboard(mensaje, titulo = "Atención", tipo = "advertencia") {
  if (window.OverTrackUI?.mostrarMensaje) {
    return window.OverTrackUI.mostrarMensaje({ titulo, mensaje, tipo });
  }

  window.alert(mensaje);
  return Promise.resolve(true);
}

function etapaDashboardActiva(nombreModulo) {
  return modulosDashboard[nombreModulo] !== false;
}

function obtenerEtapasDashboardActivas() {
  return ETAPAS_DASHBOARD.filter(etapa => etapaDashboardActiva(etapa.modulo));
}

function obtenerNombreEstado(estado) {
  if (estado === "CERRADA") return "CERRADA";
  return ETAPAS_DASHBOARD.find(etapa => etapa.key === estado)?.label || estado;
}

// =======================
// ESTADO AUTOMÁTICO
// =======================
function obtenerEstadoOT(ot) {

  if (!ot) return "INGRESO";

  if (ot.estado === "CERRADA" || ot.cerrada === true) {
    return "CERRADA";
  }

  if (etapaDashboardActiva("ingreso") && !ot.ingresoAprobado) return "INGRESO";

  if (etapaDashboardActiva("evaluacion") && !ot.evaluacionAprobada) return "EVALUACION";

  if (etapaDashboardActiva("evaluacion") && ot.overhaulRequerido === false) {
    return etapaDashboardActiva("despacho") ? "DESPACHO" : "EVALUACION";
  }

  if (etapaDashboardActiva("mantencion") && !ot.overhaulAprobado) {
    return "OVERHAUL";
  }

  if (etapaDashboardActiva("pruebas") && !ot.pruebasAprobado) return "PRUEBAS";

  if (etapaDashboardActiva("despacho")) return "DESPACHO";

  return obtenerEtapasDashboardActivas().at(-1)?.key || "INGRESO";
}

// =======================
// PROGRESO AUTOMÁTICO
// =======================
function calcularProgreso(ot) {
  if (ot?.cerrada === true || ot?.estado === "CERRADA") return 100;

  const etapasActivas = obtenerEtapasDashboardActivas();
  if (etapasActivas.length === 0) return 0;

  const progresoEtapas = calcularProgresoEtapasOT(ot);
  const total = etapasActivas.reduce(
    (suma, etapa) => suma + (progresoEtapas[etapa.key] || 0),
    0
  );

  return Math.round(total / etapasActivas.length);
}

// =======================
// CARGAR TODAS LAS OT
// =======================
window.onload = async () => {
  renderUsuarioActivo();

  const btnPanelEmpresa =
    document.getElementById("btnPanelEmpresa");

  if (btnPanelEmpresa) {
    btnPanelEmpresa.style.display =
      usuario.rol === "admin_empresa"
        ? "block"
        : "none";
  }

  document.querySelectorAll(".sidebar li").forEach(item => {
    item.addEventListener("click", function () {
      document
        .querySelectorAll(".sidebar li")
        .forEach(i => i.classList.remove("active"));

      this.classList.add("active");
    });
  });

  const empresaCargada =
    await cargarConfiguracionEmpresaDashboard();

  if (!empresaCargada) return;

  aplicarModulosDashboard();
  configurarNavegacionPorPermisos();

  if (
    puedeVerOrdenesServicio(
      usuario,
      empresaActualDashboard
    )
  ) {
    escucharOTsTiempoReal();
  } else {
    mostrarDashboardSinOrdenes();
  }
};


async function cargarConfiguracionEmpresaDashboard() {
  try {
    if (!usuario) {
      window.location.replace("index.html");
      return false;
    }

    if (usuario.rol === "super_admin") {
      const empresaIdOperacion =
        sessionStorage.getItem("empresaIdOperacionAdmin");

      if (!empresaIdOperacion) {
        await notificarDashboard("No se encontró la empresa seleccionada.", "Empresa no disponible", "error");
        window.location.replace("super-admin.html");
        return false;
      }

      const empresaRef = doc(
        db,
        "empresas",
        empresaIdOperacion
      );

      const empresaSnap = await getDoc(empresaRef);

      if (!empresaSnap.exists()) {
        sessionStorage.removeItem("empresaIdOperacionAdmin");
        await notificarDashboard("La empresa seleccionada ya no existe.", "Empresa no disponible", "error");
        window.location.replace("super-admin.html");
        return false;
      }

      empresaActualDashboard = {
        id: empresaSnap.id,
        ...empresaSnap.data()
      };

      modulosDashboard =
        obtenerModulosEmpresa(empresaActualDashboard);

      window.empresaActualDashboard =
        empresaActualDashboard;

      window.modulosDashboard =
        modulosDashboard;

      return true;
    }

    if (!usuario.empresaId) {
      await notificarDashboard("El usuario no tiene una empresa asignada.", "Acceso incompleto", "error");
      cerrarSesion();
      return false;
    }

    const empresaRef = doc(
      db,
      "empresas",
      usuario.empresaId
    );

    const empresaSnap = await getDoc(empresaRef);

    if (!empresaSnap.exists()) {
      await notificarDashboard("No se encontró la empresa asociada al usuario.", "Empresa no disponible", "error");
      cerrarSesion();
      return false;
    }

    empresaActualDashboard = {
      id: empresaSnap.id,
      ...empresaSnap.data()
    };

    modulosDashboard =
      obtenerModulosEmpresa(empresaActualDashboard);

    window.empresaActualDashboard =
      empresaActualDashboard;

    window.modulosDashboard =
      modulosDashboard;

    return true;

  } catch (error) {
    console.error(
      "Error cargando configuración de empresa:",
      error
    );

    await notificarDashboard(
      "No fue posible cargar la configuración de la empresa.",
      "Error de carga",
      "error"
    );

    return false;
  }
}



function mostrarElemento(id, mostrar, displayVisible = "") {
  const elemento = document.getElementById(id);

  if (!elemento) return;

  elemento.style.display = mostrar
    ? displayVisible
    : "none";
}

function aplicarModulosDashboard() {
  if (!empresaActualDashboard) return;

  document.querySelectorAll("[data-etapa-dashboard]").forEach(elemento => {
    elemento.style.display = etapaDashboardActiva(elemento.dataset.etapaDashboard)
      ? ""
      : "none";
  });

  const tieneDashboard =
    puedeVerDashboard(
      usuario,
      empresaActualDashboard
    );

  const tieneOrdenes =
    puedeVerOrdenesServicio(
      usuario,
      empresaActualDashboard
    );

  const tieneGantt =
    puedeVerGantt(
      usuario,
      empresaActualDashboard
    );

  const tieneDespacho =
    puedeVerDespacho(
      usuario,
      empresaActualDashboard
    );

  const tieneReportes =
    puedeVerReportes(
      usuario,
      empresaActualDashboard
    );

  mostrarElemento(
    "panelHeroDashboard",
    tieneDashboard
  );

  mostrarElemento(
    "panelKPIs",
    tieneDashboard && tieneOrdenes,
    "grid"
  );

  mostrarElemento(
    "panelEstadoTaller",
    tieneDashboard && tieneOrdenes,
    "grid"
  );

  mostrarElemento(
    "panelBuscadorOT",
    tieneOrdenes
  );

  mostrarElemento(
    "panelOTs",
    tieneOrdenes
  );

  mostrarElemento(
    "panelGraficos",
    tieneDashboard && tieneOrdenes,
    "grid"
  );

  mostrarElemento(
    "panelDespachos",
    tieneDespacho
  );

  mostrarElemento(
    "panelGantt",
    tieneGantt
  );
}



function configurarNavegacionPorPermisos() {
  const rol = usuario.rol;
  const esAdministradorConsulta = ["admin_empresa", "admin_sucursal"].includes(rol);
  const esPlanificador = rol === "planificador";
  const esTrabajador = ["usuario_taller", "supervisor", "tecnico"].includes(rol);
  const btnPanelEmpresa =
    document.getElementById("btnPanelEmpresa");

  const menuNuevaOT =
    document.getElementById("menuNuevaOT");

  const menuDashboard =
    document.getElementById(
      "menuDashboardOperacional"
    );
  const menuOrdenes = document.getElementById("menuOrdenes");
  const menuInventario = document.getElementById("menuInventario");
  const menuProgramacion = document.getElementById("menuProgramacion");
  const menuSheq = document.getElementById("menuSheq");

  if (btnPanelEmpresa) {
    btnPanelEmpresa.style.display =
      puedeEntrarPanelEmpresa(
        usuario,
        empresaActualDashboard
      )
        ? ""
        : "none";
  }

  if (menuNuevaOT) {
    menuNuevaOT.style.display =
      puedeCrearOT(
        usuario,
        empresaActualDashboard
      )
        ? ""
        : "none";
  }

  if (menuDashboard) {
    menuDashboard.style.display =
      puedeVerDashboard(
        usuario,
        empresaActualDashboard
      )
        ? ""
        : "none";
  }

  if (menuOrdenes) {
    menuOrdenes.style.display = puedeVerOrdenesServicio(usuario, empresaActualDashboard)
      ? ""
      : "none";
  }

  if (menuInventario) {
    menuInventario.style.display = moduloActivo(empresaActualDashboard, "inventario") &&
      (["super_admin"].includes(rol) || esAdministradorConsulta || esPlanificador)
      ? ""
      : "none";
  }

  if (menuProgramacion) {
    menuProgramacion.style.display = moduloActivo(empresaActualDashboard, "programacion") &&
      (rol === "super_admin" || esAdministradorConsulta || esPlanificador || esTrabajador)
      ? ""
      : "none";
  }
  if (menuSheq) {
    menuSheq.style.display = moduloActivo(empresaActualDashboard, "sheq") && ["super_admin", "admin_empresa", "admin_sucursal", "planificador"].includes(rol)
      ? ""
      : "none";
  }
}




function renderizarDashboardOperacional(lista = listaOTs) {
  if (!empresaActualDashboard) return;

  const tieneDashboard =
    moduloActivo(empresaActualDashboard, "dashboard");

  const tieneOrdenes =
    moduloActivo(empresaActualDashboard, "ordenesServicio");

  const tieneGantt =
    moduloActivo(empresaActualDashboard, "gantt");

  const tieneDespacho =
    moduloActivo(empresaActualDashboard, "despacho");

  const tieneReportes =
    moduloActivo(empresaActualDashboard, "reportesPDF");

  if (tieneOrdenes) {
    renderTabla(obtenerOTsRecientes(lista));
  }

  if (tieneDashboard && tieneOrdenes) {
    calcularKPIs(lista);
    renderEstadoTaller(lista);
    renderAlertasDashboard(lista);
  }

  if (tieneDashboard && tieneOrdenes) {
    renderGraficos(lista);
  } else {
    destruirGraficosDashboard();
  }

  if (tieneOrdenes && tieneDespacho) {
    renderProximosDespachos(lista);
  }

  if (tieneOrdenes && tieneGantt) {
    renderGanttTaller(lista);
  }

  actualizarEstadoCargaDashboard(false);
}

function actualizarEstadoCargaDashboard(cargando, error = false) {
  const panelKPIs = document.getElementById("panelKPIs");
  const cardsOT = document.getElementById("cardsOT");
  const estadoTaller = document.getElementById("estadoTallerLista");

  [panelKPIs, cardsOT, estadoTaller].forEach(elemento => {
    if (!elemento) return;
    elemento.setAttribute("aria-busy", cargando ? "true" : "false");
  });

  if (!error) return;

  ["kpiTotal", "kpiProceso", "kpiAtrasadas", "kpiCerradas"].forEach(id => {
    const elemento = document.getElementById(id);
    if (elemento) {
      elemento.textContent = "—";
      elemento.setAttribute("aria-label", "Información no disponible");
    }
  });

  ETAPAS_DASHBOARD.forEach(etapa => {
    const elemento = document.getElementById(etapa.estadoId);
    if (elemento) elemento.textContent = "—";
  });

  if (cardsOT) {
    cardsOT.innerHTML = '<p class="sin-alertas estado-error-dashboard">No fue posible cargar las órdenes. Intenta actualizar la página.</p>';
  }

  const alertas = document.getElementById("alertasDashboard");
  if (alertas) {
    alertas.innerHTML = '<p class="sin-alertas estado-error-dashboard">No fue posible cargar las alertas.</p>';
  }
}



function mostrarDashboardSinOrdenes() {
  listaOTs = [];
  listaFiltrada = [];

  const contenidoPrincipal =
    document.querySelector(".main-content");

  if (!contenidoPrincipal) return;

  const aviso = document.createElement("div");

  aviso.id = "avisoModuloOrdenesInactivo";
  aviso.className = "card";
  aviso.innerHTML = `
    <div class="panel-header-pro">
      <div>
        <h3>Órdenes de Servicio no habilitadas</h3>

        <p class="sin-alertas">
          Esta empresa no tiene contratado el módulo de
          Órdenes de Servicio.
        </p>
      </div>
    </div>
  `;

  contenidoPrincipal.appendChild(aviso);
}





async function escucharOTsTiempoReal() {
  const usuarioActivo = JSON.parse(localStorage.getItem("usuarioActivo"));

  if (!usuarioActivo) {
    window.location.replace("index.html");
    return;
  }

  if (!usuarioActivo.empresaId && usuarioActivo.rol !== "super_admin") {
    notificarDashboard("Usuario sin empresa asignada.", "Acceso incompleto", "error")
      .then(() => window.location.replace("index.html"));
    return;
  }

  let restricciones = [];

  if (usuarioActivo.rol === "super_admin") {
    if (!empresaActualDashboard?.id) {
      notificarDashboard("No se encontró la empresa seleccionada.", "Empresa no disponible", "error");
      return;
    }

    restricciones = [where("empresaId", "==", empresaActualDashboard.id)];

    console.log(
      "Dashboard empresa (super_admin):",
      empresaActualDashboard.id
    );

  } else {
    restricciones = [
      where("empresaId", "==", usuarioActivo.empresaId)
    ];

    if (usuarioActivo.rol !== "admin_empresa") {
      if (!usuarioActivo.sucursalId) {
        notificarDashboard("Tu usuario no tiene una sucursal asignada.", "Sucursal requerida", "error");
        return;
      }
      restricciones.push(where("sucursalId", "==", usuarioActivo.sucursalId));
    }

    console.log("Dashboard empresa:", usuarioActivo.empresaId);
  }

  let coleccionListado = "otsResumen";
  try {
    await asegurarResumenesOT(restricciones);
  } catch (error) {
    console.warn("No fue posible preparar los resúmenes de OT; se usará la colección completa.", error);
    coleccionListado = "ots";
  }

  const q = query(
    collection(db, coleccionListado),
    ...restricciones,
    orderBy("fechaCreacion", "desc")
  );

  onSnapshot(q, (snapshot) => {
    listaOTs = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    listaFiltrada = [...listaOTs];

    renderizarDashboardOperacional(listaFiltrada);

  }, (error) => {
    console.error("Error escuchando OTs:", error);
    actualizarEstadoCargaDashboard(false, true);
  });
}




function estaOTAtrasada(o) {

  if (!o) return false;

  if (!etapaDashboardActiva("gantt")) return false;

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

  if (lista.length === 0) {
    cont.innerHTML = '<p class="sin-alertas">No hay órdenes activas recientes.</p>';
    return;
  }

  lista.forEach((o) => {

    const estado = obtenerEstadoOT(o);
    const estadoVisible = obtenerNombreEstado(estado);
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

    card.className = "ot-card";

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
          ${estadoVisible}
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

        ${renderMiniGantt(o)}

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
          type="button"
          class="btn-card-open"
          data-ot-index="${listaOTs.indexOf(o)}"
        >
          Abrir OT
        </button>

      </div>
    `;

    cont.appendChild(card);

    card.querySelector(".btn-card-open")?.addEventListener("click", () => {
      abrirOT(listaOTs.indexOf(o));
    });
  });
}



function calcularPorcentajeLista(lista = []) {
  if (!Array.isArray(lista) || lista.length === 0) return 0;

  const completados = lista.filter(item => item.ok === true).length;

  return Math.round((completados / lista.length) * 100);
}

function obtenerListaPruebas(ot) {
  if (Array.isArray(ot?.pruebas?.general)) return ot.pruebas.general;
  return [
    ...(Array.isArray(ot?.pruebas?.mecanico) ? ot.pruebas.mecanico : []),
    ...(Array.isArray(ot?.pruebas?.electrico) ? ot.pruebas.electrico : [])
  ];
}

function calcularProgresoEtapasOT(ot) {
  if (ot?.cerrada === true || ot?.estado === "CERRADA") {
    return {
      INGRESO: 100,
      EVALUACION: 100,
      OVERHAUL: 100,
      PRUEBAS: 100,
      DESPACHO: 100
    };
  }

  const ingreso = ot.ingresoAprobado
    ? 100
    : calcularPorcentajeLista(ot.ingreso || []);
  const evaluacion = ot.evaluacionAprobada
    ? 100
    : calcularPorcentajeLista(ot.evaluacion || []);
  const mantencion = ot.overhaulAprobado
    ? 100
    : calcularPorcentajeLista(ot.overhaul || []);

  const pruebas = ot.pruebasAprobado
    ? 100
    : calcularPorcentajeLista(obtenerListaPruebas(ot));

  const despachoPreparacion = calcularPorcentajeLista(ot.despacho?.preparacion || []);
  const despachoFinal = calcularPorcentajeLista(ot.despacho?.final || []);

  const despachoListas = [
    despachoPreparacion,
    despachoFinal
  ].filter(p => p > 0);

  const despacho = despachoListas.length
    ? Math.round(despachoListas.reduce((a, b) => a + b, 0) / despachoListas.length)
    : 0;

  return {
    INGRESO: ingreso,
    EVALUACION: evaluacion,
    OVERHAUL: mantencion,
    PRUEBAS: pruebas,
    DESPACHO: despacho
  };
}



function renderMiniGantt(ot) {
  const etapas = obtenerEtapasDashboardActivas();

  const progresoEtapas = calcularProgresoEtapasOT(ot);

  return etapas.map(etapa => {
    const porcentaje = progresoEtapas[etapa.key] || 0;

    let clase = "mini-gantt-pendiente";

    if (porcentaje === 100) {
      clase = "mini-gantt-completo";
    } else if (porcentaje > 0) {
      clase = "mini-gantt-activo";
    }

    return `
      <div class="mini-gantt-row">
        <span>${etapa.label}</span>

        <div class="mini-gantt-bar">
          <div
            class="${clase}"
            style="width:${porcentaje}%"
          ></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderBadgesOT(o, estado, atrasada, diasAtraso) {

  const badges = [];
  const revisionPendiente = obtenerEtapaListaParaRevision(o);
  const requiereCorreccion = Boolean(o.alertaJefe && obtenerResumenObservacionesJefe(o));

  if (revisionPendiente) {
    badges.push(`
      <span class="ot-badge badge-azul">
        ${esAutoridadSucursal() ? "✓ Revisar" : "◷ En revisión"}: ${revisionPendiente}
      </span>
    `);
  }

  if (requiereCorreccion && esTecnicoTaller()) {
    badges.push(`
      <span class="ot-badge badge-amarillo">
        ⚠ Requiere corrección
      </span>
    `);
  }

  if (atrasada) {
    badges.push(`
      <span class="ot-badge badge-rojo">
        ⏱ ${diasAtraso || 0} día(s) atraso
      </span>
    `);
  }

  if (esperaRepuestosActiva(o) && estado !== "CERRADA") {
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

  const resumenObservaciones = obtenerResumenObservacionesJefe(o);

  if (o.alertaJefe && resumenObservaciones) {
    const resumenObs = resumenObservaciones
      .replace(/`/g, "'")
      .replace(/"/g, "&quot;");

    badges.push(`
      <button 
        type="button"
        class="ot-badge badge-amarillo badge-observacion-btn"
        onclick="abrirPopoverObservacion(\`${resumenObs}\`)"
      >
        ⚠ Observación
      </button>
    `);
  }

  return badges.join("");
}

function obtenerResumenObservacionesJefe(ot) {

  const observaciones = [];

  const revisarItems = (etapa, lista) => {
    if (!Array.isArray(lista)) return;

    lista.forEach(item => {
      (item.comentarios || []).forEach(c => {
        if (["jefe_taller", "admin_sucursal"].includes(c.rol) && c.atendido !== true) {
          observaciones.push(`${etapa}: ${c.texto}`);
        }
      });
    });
  };

  if (etapaDashboardActiva("ingreso")) revisarItems("Ingreso", ot.ingreso);
  if (etapaDashboardActiva("evaluacion")) revisarItems("Evaluación", ot.evaluacion);
  if (etapaDashboardActiva("mantencion")) revisarItems("Mantención", ot.overhaul);

  if (etapaDashboardActiva("pruebas")) {
    revisarItems("Pruebas", obtenerListaPruebas(ot));
  }

  if (etapaDashboardActiva("despacho")) {
    (ot.despacho?.comentariosPreparacion || []).forEach(c => {
      if (["jefe_taller", "admin_sucursal"].includes(c.rol) && c.atendido !== true) {
        observaciones.push(`Despacho Preparación: ${c.texto}`);
      }
    });

    (ot.despacho?.comentariosFinal || []).forEach(c => {
      if (["jefe_taller", "admin_sucursal"].includes(c.rol) && c.atendido !== true) {
        observaciones.push(`Despacho Final: ${c.texto}`);
      }
    });
  }

  return observaciones.join(" | ");
}


function abrirPopoverObservacion(texto) {

  const modal = document.getElementById("popoverObservacion");
  const cont = document.getElementById("popoverObservacionTexto");

  if (!modal || !cont) return;

  const items = texto.split("|").map(t => t.trim()).filter(Boolean);

  cont.innerHTML = items.map(item => `
    <div class="popover-obs-item">
      ${item}
    </div>
  `).join("");

  modal.style.display = "flex";
}

function cerrarPopoverObservacion() {
  const modal = document.getElementById("popoverObservacion");
  if (modal) modal.style.display = "none";
}

window.abrirPopoverObservacion = abrirPopoverObservacion;
window.cerrarPopoverObservacion = cerrarPopoverObservacion;


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

function animarNumero(id, valorFinal) {
  const el = document.getElementById(id);
  if (!el) return;

  const valorActual = Number(el.textContent) || 0;
  const duracion = 700;
  const inicio = performance.now();

  function actualizar(tiempo) {
    const progreso = Math.min((tiempo - inicio) / duracion, 1);
    const valor = Math.round(
      valorActual + (valorFinal - valorActual) * progreso
    );

    el.textContent = valor;
    el.setAttribute("aria-label", String(valor));

    if (progreso < 1) {
      requestAnimationFrame(actualizar);
    }
  }

  requestAnimationFrame(actualizar);
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

  const atrasadas = lista.filter(o => estaOTAtrasada(o)).length;

  animarNumero("kpiTotal", total);
  animarNumero("kpiProceso", proceso);
  animarNumero("kpiAtrasadas", atrasadas);
  animarNumero("kpiCerradas", cerradas);
}

function renderEstadoTaller(lista = listaOTs) {
  const etapasActivas = obtenerEtapasDashboardActivas();
  const estados = Object.fromEntries(etapasActivas.map(etapa => [etapa.key, 0]));

  lista.forEach(ot => {
    const estado = obtenerEstadoOT(ot);

    if (estados[estado] !== undefined) {
      estados[estado]++;
    }
  });

  etapasActivas.forEach(etapa => {
    const contador = document.getElementById(etapa.estadoId);
    if (contador) contador.textContent = estados[etapa.key] || 0;
  });
}

function obtenerOTsRecientes(lista = []) {
  return lista
    .filter(ot => obtenerEstadoOT(ot) !== "CERRADA")
    .sort((a, b) => obtenerMarcaTiempoOT(b) - obtenerMarcaTiempoOT(a))
    .slice(0, 6);
}

function obtenerMarcaTiempoOT(ot) {
  const valor = ot?.fechaActualizacion || ot?.actualizadoEn || ot?.fechaCreacion;
  if (valor?.toMillis) return valor.toMillis();
  if (valor?.toDate) return valor.toDate().getTime();

  const fecha = valor ? new Date(valor) : null;
  return fecha && !Number.isNaN(fecha.getTime()) ? fecha.getTime() : 0;
}



function esperaRepuestosActiva(ot) {
  if (!etapaDashboardActiva("repuestos") || !etapaDashboardActiva("gantt")) {
    return false;
  }

  if (!ot?.gantt) return false;

  const dias = Number(ot.gantt.diasRepuestos || 0);
  const fechaSolicitud = ot.gantt.fechaSolicitudRepuestos;

  if (!dias || dias <= 0 || !fechaSolicitud) return false;

  const inicio = new Date(fechaSolicitud + "T00:00:00");
  const fechaLlegada = new Date(inicio);
  fechaLlegada.setDate(fechaLlegada.getDate() + dias);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  return hoy <= fechaLlegada;
}



function renderAlertasDashboard(lista = listaOTs) {
  const cont = document.getElementById("alertasDashboard");
  if (!cont) return;

  cont.innerHTML = "";

  if (lista.length === 0) {
    cont.innerHTML = '<p class="sin-alertas">Sin alertas activas.</p>';
    return;
  }
  const alertas = [];

  lista.forEach(ot => {
    const estado = obtenerEstadoOT(ot);
    const indiceOT = listaOTs.indexOf(ot);
    const etapaRevision = obtenerEtapaListaParaRevision(ot);
    const resumenCorreccion = obtenerResumenObservacionesJefe(ot);

    if (esAutoridadSucursal() && etapaRevision) {
      alertas.push({
        tipo: "revision",
        indiceOT,
        titulo: "Etapa lista para revisión",
        texto: `${ot.os || "OS sin número"} · ${etapaRevision}`,
        accion: "Revisar OT"
      });
    }

    if (esTecnicoTaller() && ot.alertaJefe && resumenCorreccion) {
      alertas.push({
        tipo: "correccion",
        indiceOT,
        titulo: "Corrección solicitada",
        texto: `${ot.os || "OS sin número"} · ${resumenCorreccion}`,
        accion: "Corregir etapa"
      });
    }

    if (estaOTAtrasada(ot)) {
      alertas.push({
        tipo: "atraso",
        indiceOT,
        titulo: "Orden atrasada",
        texto: `${ot.os || "OS sin número"} · ${diasAtrasoOT(ot)} día(s) de atraso`,
        accion: "Abrir OT"
      });
    }

    if (esperaRepuestosActiva(ot) && estado !== "CERRADA") {
      alertas.push({
        tipo: "repuestos",
        indiceOT,
        titulo: "Espera de repuestos",
        texto: ot.os || "OS sin número",
        accion: "Abrir OT"
      });
    }

    if (etapaDashboardActiva("despacho") && estado === "DESPACHO" && !ot.cerrada) {
      alertas.push({
        tipo: "despacho",
        indiceOT,
        titulo: "Pendiente de cierre",
        texto: `${ot.os || "OS sin número"} · Despacho`,
        accion: "Abrir OT"
      });
    }

    if (esAutoridadSucursal() && ot.alertaJefe && resumenCorreccion) {
      alertas.push({
        tipo: "jefe",
        indiceOT,
        titulo: "Respuesta técnica pendiente",
        texto: ot.os || "OS sin número",
        accion: "Ver observación"
      });
    }
  });

  if (alertas.length === 0) {
    cont.innerHTML = `<p class="sin-alertas">Sin alertas activas.</p>`;
    return;
  }

  alertas.slice(0, 6).forEach(alerta => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = `alerta-dashboard-item alerta-${alerta.tipo}`;
    const contenido = document.createElement("span");
    contenido.className = "alerta-dashboard-contenido";
    const titulo = document.createElement("strong");
    titulo.textContent = alerta.titulo;
    const detalle = document.createElement("small");
    detalle.textContent = alerta.texto;
    const accion = document.createElement("span");
    accion.className = "alerta-dashboard-accion";
    accion.textContent = `${alerta.accion} →`;
    contenido.append(titulo, detalle);
    boton.append(contenido, accion);
    boton.addEventListener("click", () => abrirOT(alerta.indiceOT));
    cont.appendChild(boton);
  });
}

function esAutoridadSucursal() {
  return ["jefe_taller", "admin_sucursal"].includes(usuario?.rol);
}

function esTecnicoTaller() {
  return usuario?.rol === "usuario_taller";
}

function obtenerEtapaListaParaRevision(ot) {
  const estado = obtenerEstadoOT(ot);
  const progreso = calcularProgresoEtapasOT(ot);
  const etapas = [
    { estado: "INGRESO", modulo: "ingreso", nombre: "Ingreso", aprobada: ot.ingresoAprobado },
    { estado: "EVALUACION", modulo: "evaluacion", nombre: "Evaluación", aprobada: ot.evaluacionAprobada },
    { estado: "OVERHAUL", modulo: "mantencion", nombre: "Mantención", aprobada: ot.overhaulAprobado },
    { estado: "PRUEBAS", modulo: "pruebas", nombre: "Pruebas", aprobada: ot.pruebasAprobado }
  ];
  const etapa = etapas.find(item =>
    item.estado === estado &&
    etapaDashboardActiva(item.modulo) &&
    item.aprobada !== true &&
    progreso[item.estado] === 100
  );
  return etapa?.nombre || "";
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

  const hoy = new Date();
    hoy.setHours(0,0,0,0);

    const diffHoy = Math.ceil(
      (hoy - inicioGlobal) / (1000 * 60 * 60 * 24)
    );

    let posicionHoy = (diffHoy / diasTotales) * 100;

    if (posicionHoy < 0) posicionHoy = 0;
    if (posicionHoy > 100) posicionHoy = 100;

  wrapper.innerHTML = `

    <div class="gantt-hoy-line"
        style="left:calc(194px + ${posicionHoy}%);">
      <span>HOY</span>
    </div>

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
          class="gantt-taller-bar ${atrasada ? "atrasada" : estado.toLowerCase()}"
          style="left:${left}%; width:${width}%"

          data-gantt='${JSON.stringify({
              os: ot.os || "Sin OS",
              equipo: ot.equipo || "Sin equipo",
              estado,
              inicio: formatearFechaCorta(inicio),
              termino: formatearFechaCorta(termino),
              progreso: calcularProgreso(ot)
            }).replace(/'/g, "&#39;")}'
            onclick="abrirPopoverGanttDesdeElemento(this)"
        >
          ${atrasada ? "ATRASADA" : estado}
        </div>
      </div>
    `;

    wrapper.appendChild(row);
  });

  cont.appendChild(wrapper);
}


function abrirPopoverGantt(data) {

  const modal = document.getElementById("popoverGantt");
  const cont = document.getElementById("popoverGanttInfo");

  if (!modal || !cont) return;

  cont.innerHTML = `

    <div class="gantt-pop-grid">

      <div>
        <span>OS</span>
        <strong>${data.os}</strong>
      </div>

      <div>
        <span>Equipo</span>
        <strong>${data.equipo}</strong>
      </div>

      <div>
        <span>Estado</span>
        <strong>${data.estado}</strong>
      </div>

      <div>
        <span>Inicio</span>
        <strong>${data.inicio}</strong>
      </div>

      <div>
        <span>Término</span>
        <strong>${data.termino}</strong>
      </div>

      <div>
        <span>Progreso</span>
        <strong>${data.progreso}%</strong>
      </div>

    </div>
  `;

  modal.style.display = "flex";
}



function volverPanelEmpresa() {
  if (
    !puedeEntrarPanelEmpresa(
      usuario,
      empresaActualDashboard
    )
  ) {
    notificarDashboard(
      "No tienes permiso para acceder al Panel de Empresa.",
      "Acceso restringido",
      "advertencia"
    );

    return;
  }

  const empresaId = empresaActualDashboard?.id;

  if (!empresaId) {
    notificarDashboard("No se encontró la empresa seleccionada.", "Empresa no disponible", "error")
      .then(() => { window.location.href = "super-admin.html"; });
    return;
  }

  window.location.href =
    `empresa-admin.html?id=${encodeURIComponent(empresaId)}`;
}

window.volverPanelEmpresa = volverPanelEmpresa;



function abrirPopoverGanttDesdeElemento(el) {
  try {
    const data = JSON.parse(
      el.getAttribute("data-gantt")
    );

    abrirPopoverGantt(data);

  } catch (error) {
    console.error("Error leyendo datos del Gantt:", error);
  }
}

window.abrirPopoverGanttDesdeElemento = abrirPopoverGanttDesdeElemento;

function cerrarPopoverGantt() {

  const modal = document.getElementById("popoverGantt");

  if (modal) {
    modal.style.display = "none";
  }
}

window.abrirPopoverGantt = abrirPopoverGantt;
window.cerrarPopoverGantt = cerrarPopoverGantt;

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
  if (
    !puedeAbrirOT(
      usuario,
      empresaActualDashboard
    )
  ) {
    notificarDashboard(
      "No tienes permiso para abrir Órdenes de Servicio.",
      "Acceso restringido",
      "advertencia"
    );

    return;
  }

  const ot = listaOTs[index];

  if (!ot) {
    notificarDashboard("No se encontró la orden de trabajo.", "OT no disponible", "error");
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
  if (
    !puedeCrearOT(
      usuario,
      empresaActualDashboard
    )
  ) {
    notificarDashboard(
      "No tienes permiso para crear Órdenes de Servicio.",
      "Acceso restringido",
      "advertencia"
    );

    return;
  }

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

function irOrdenes() {
  window.location.href = "ordenes.html";
}

function irInventario() {
  window.location.href = "inventario.html";
}

function irProgramacion() {
  window.location.href = "programacion.html";
}

function irSheq() {
  window.location.href = "sheq.html";
}


window.volverPanelEmpresa = volverPanelEmpresa;



window.irDashboard = irDashboard;
window.irOrdenes = irOrdenes;
window.irInventario = irInventario;
window.irProgramacion = irProgramacion;
window.irSheq = irSheq;

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

  renderizarDashboardOperacional(listaFiltrada);
}

window.filtrarOTs = filtrarOTs;

let chartEstados = null;
let chartProgreso = null;


function destruirGraficosDashboard() {
  if (chartEstados) {
    chartEstados.destroy();
    chartEstados = null;
  }

  if (chartProgreso) {
    chartProgreso.destroy();
    chartProgreso = null;
  }
}



function renderGraficos(lista = listaOTs) {

  const estadosGraficos = [
    ...obtenerEtapasDashboardActivas(),
    { key: "CERRADA", label: "CERRADA", color: "#2ecc71" }
  ];

  const estadosCount = Object.fromEntries(
    estadosGraficos.map(etapa => [etapa.key, 0])
  );

  let progresoTotal = 0;

  lista.forEach(ot => {

    const estado = obtenerEstadoOT(ot);
    if (estadosCount[estado] !== undefined) {
      estadosCount[estado]++;
    }

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
    labels: estadosGraficos.map(etapa => etapa.label),
    datasets: [{
      data: estadosGraficos.map(etapa => estadosCount[etapa.key]),
      backgroundColor: estadosGraficos.map(etapa => etapa.color),
      borderColor: "#ffffff", // 🔥 bordes blancos
      borderWidth: 2
    }]
  },
  options: {
    plugins: {
      legend: {
        labels: {
          color: "#405766"
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
        label: "Progreso promedio",
        data: [promedio],
        backgroundColor: ["#1565c0"],
        borderRadius: 8
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            color: "#607d8b"
          },
          grid: {
            color: "rgba(96, 125, 139, 0.12)"
          }
        },
        x: {
          ticks: {
            color: "#607d8b"
          },
          grid: {
            display: false
          }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: "#405766"
          }
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
  if (usuarioActivo.rol === "super_admin") {
    rol.textContent = "Super Admin";
  } else if (usuarioActivo.rol === "admin_empresa") {
    rol.textContent = "Admin Empresa";
  } else if (usuarioActivo.rol === "admin_sucursal") {
  rol.textContent = "Admin Sucursal";
  } else if (usuarioActivo.rol === "jefe_taller") {
    rol.textContent = "Jefe Taller";
  } else if (usuarioActivo.rol === "usuario_taller") {
    rol.textContent = "Usuario Taller";
  } else {
    rol.textContent = usuarioActivo.rol || "Sin rol";
  }
}
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
        ["jefe_taller", "admin_sucursal"].includes(c.rol) &&
        c.atendido !== true
      )
    );
  };

  const tienePendientesDirectos = (comentarios) => {
    return Array.isArray(comentarios) &&
      comentarios.some(c =>
        ["jefe_taller", "admin_sucursal"].includes(c.rol) &&
        c.atendido !== true
      );
  };

  if (etapaDashboardActiva("ingreso") && tienePendientesJefe(ot.ingreso)) {
    alertas.add("📥 Ingreso");
  }

  if (etapaDashboardActiva("evaluacion") && tienePendientesJefe(ot.evaluacion)) {
    alertas.add("📋 Evaluación");
  }

  if (etapaDashboardActiva("mantencion") && tienePendientesJefe(ot.overhaul)) {
    alertas.add("🔧 Overhaul");
  }

  if (etapaDashboardActiva("pruebas") && tienePendientesJefe(obtenerListaPruebas(ot))) {
    alertas.add("🧪 Pruebas");
  }

  if (
    etapaDashboardActiva("despacho") &&
    (
      tienePendientesDirectos(ot.despacho?.comentariosPreparacion) ||
      tienePendientesDirectos(ot.despacho?.comentariosFinal)
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

function configurarMenuMovilDashboard() {
  const boton = document.querySelector(".mobile-menu-toggle");
  const fondo = document.querySelector(".mobile-menu-backdrop");
  const sidebar = document.getElementById("dashboardSidebar");
  if (!boton || !fondo || !sidebar) return;

  const cambiarEstado = (abierto) => {
    document.body.classList.toggle("menu-mobile-open", abierto);
    boton.setAttribute("aria-expanded", String(abierto));
    boton.setAttribute("aria-label", abierto
      ? "Cerrar menú de navegación"
      : "Abrir menú de navegación");
  };

  boton.addEventListener("click", () => {
    cambiarEstado(!document.body.classList.contains("menu-mobile-open"));
  });
  fondo.addEventListener("click", () => cambiarEstado(false));
  sidebar.addEventListener("click", (evento) => {
    if (evento.target.closest("li") || evento.target.closest(".mobile-menu-logout")) cambiarEstado(false);
  });
  sidebar.addEventListener("keydown", (evento) => {
    const opcion = evento.target.closest('[role="button"]');
    if (!opcion || (evento.key !== "Enter" && evento.key !== " ")) return;
    evento.preventDefault();
    opcion.click();
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") cambiarEstado(false);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 1024) cambiarEstado(false);
  });
}

document.addEventListener("DOMContentLoaded", configurarMenuMovilDashboard);
