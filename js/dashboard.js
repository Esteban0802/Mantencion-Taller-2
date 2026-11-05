import { esFlujoLibre, progresoLibre } from "./flujo-libre-modelo.js?v=20261101-1";
import { escaparHtml } from "./html-seguro.js";
import { protegerPagina, cerrarSesion, leerEmpresaInicial } from "./session.js?v=20261104-1";

import {
  obtenerModulosEmpresa,
  moduloActivo
} from "./modulos.js?v=20261018-2";


import {
  puedeVerDashboard,
  puedeVerOrdenesServicio,
  puedeCrearOT,
  puedeAbrirOT,
  puedeVerGantt,
  puedeVerDespacho,
  puedeVerReportes,
  puedeEntrarPanelEmpresa
} from "./permisos.js?v=20261029-1";


const usuario = protegerPagina([
  "admin_empresa",
  "admin_sucursal",
  "jefe_taller",
  "supervisor",
  "tecnico",
  "planificador"
]);

if (!usuario) throw new Error("Acceso no autorizado");

import { db } from "./firebase-config.js";

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getCountFromServer
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let listaOTs = [];
let listaFiltrada = [];
let empresaActualDashboard = null;
let modulosDashboard = {};
let cancelarEscuchaOTs = null;
let consultaCerradasDashboard = null;
let cantidadCerradasDashboard = null;
let versionConteoDashboard = 0;
let cancelarEscuchaInventarioAlertas = null;
let inventarioAlertasCargado = false;
let inventarioPorOSDashboard = new Map();

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
  if (esFlujoLibre(ot)) return ot.cerrada ? "CERRADA" : "EN_PROCESO";

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
  if (esFlujoLibre(ot)) return progresoLibre(ot);
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
async function iniciarDashboard() {
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

  if (!empresaCargada) {
    window.OverTrackUI?.finalizarCargaPagina?.();
    return;
  }

  aplicarModulosDashboard();
  configurarNavegacionPorPermisos();
  iniciarInventarioAlertasTiempoReal();

  if (
    puedeVerOrdenesServicio(
      usuario,
      empresaActualDashboard
    )
  ) {
    escucharOTsTiempoReal();
  } else {
    mostrarDashboardSinOrdenes();
    window.OverTrackUI?.finalizarCargaPagina?.();
  }
}

function normalizarClaveOS(valor = "") {
  return String(valor).trim().toLocaleLowerCase("es");
}

function repuestoInventarioRecibido(item = {}) {
  return item.recibido === true || (
    item.recibido == null &&
    ["Completa", "Despachada", "Recepción Cliente"].includes(item.estado)
  );
}

function iniciarInventarioAlertasTiempoReal() {
  cancelarEscuchaInventarioAlertas?.();
  cancelarEscuchaInventarioAlertas = null;
  inventarioAlertasCargado = false;
  inventarioPorOSDashboard = new Map();

  if (!moduloActivo(empresaActualDashboard, "inventario") ||
      !(moduloActivo(empresaActualDashboard, "alertas") || moduloActivo(empresaActualDashboard, "repuestos")) ||
      !empresaActualDashboard?.id) return;

  const restricciones = [where("empresaId", "==", empresaActualDashboard.id)];
  if (!['super_admin', 'admin_empresa'].includes(usuario?.rol) && usuario?.sucursalId) {
    restricciones.push(where("sucursalId", "==", usuario.sucursalId));
  }

  cancelarEscuchaInventarioAlertas = onSnapshot(
    query(collection(db, "inventarioItems"), ...restricciones),
    snapshot => {
      const agrupados = new Map();
      snapshot.docs.forEach(documento => {
        const item = documento.data() || {};
        const numeroOS = String(item.datos?.OS || "").trim();
        if (!numeroOS) return;
        const clave = `${item.sucursalId}:${normalizarClaveOS(numeroOS)}`;
        if (!agrupados.has(clave)) agrupados.set(clave, []);
        agrupados.get(clave).push(item);
      });
      inventarioPorOSDashboard = agrupados;
      inventarioAlertasCargado = true;
      renderTabla(obtenerOTsRecientes(listaFiltrada));
      renderAlertasDashboard(listaFiltrada);
    },
    error => {
      inventarioAlertasCargado = false;
      renderTabla(obtenerOTsRecientes(listaFiltrada));
      console.warn("No fue posible actualizar las alertas de Inventario:", error);
      renderAlertasDashboard(listaFiltrada);
    }
  );
}


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

      const empresaSnap = await leerEmpresaInicial(empresaIdOperacion);

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

    const empresaSnap = await leerEmpresaInicial(usuario.empresaId);

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

  const tieneAnalitica = moduloActivo(empresaActualDashboard, "analitica");
  const tieneAlertas = moduloActivo(empresaActualDashboard, "alertas");

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
    tieneDashboard && tieneOrdenes && (tieneAnalitica || tieneAlertas),
    "grid"
  );

  mostrarElemento(
    "panelAnaliticaEstado",
    tieneDashboard && tieneOrdenes && tieneAnalitica
  );

  mostrarElemento(
    "panelAlertasTaller",
    tieneDashboard && tieneOrdenes && tieneAlertas
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
    tieneDashboard && tieneOrdenes && tieneAnalitica,
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
  const esJefeTaller = rol === "jefe_taller";
  const esTrabajador = ["supervisor", "tecnico"].includes(rol);
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
      (["super_admin"].includes(rol) || esAdministradorConsulta || esPlanificador || esJefeTaller)
      ? ""
      : "none";
  }

  if (menuProgramacion) {
    menuProgramacion.style.display = moduloActivo(empresaActualDashboard, "programacion") &&
      (rol === "super_admin" || esAdministradorConsulta || esPlanificador || esJefeTaller || esTrabajador)
      ? ""
      : "none";
  }
  if (menuSheq) {
    menuSheq.style.display = moduloActivo(empresaActualDashboard, "sheq") && ["super_admin", "admin_empresa", "admin_sucursal", "jefe_taller", "planificador"].includes(rol)
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

  const tieneAnalitica = moduloActivo(empresaActualDashboard, "analitica");
  const tieneAlertas = moduloActivo(empresaActualDashboard, "alertas");

  if (tieneOrdenes) {
    renderTabla(obtenerOTsRecientes(lista));
  }

  if (tieneDashboard && tieneOrdenes) {
    calcularKPIs(lista);
    if (tieneAnalitica) renderEstadoTaller(lista);
    if (tieneAlertas) renderAlertasDashboard(lista);
  }

  if (tieneDashboard && tieneOrdenes && tieneAnalitica) {
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

  cancelarEscuchaOTs?.();
  consultaCerradasDashboard = query(collection(db,"otsResumen"), ...restricciones, where("cerrada","==",true));
  const q = query(
    collection(db, "otsResumen"),
    ...restricciones,
    where("cerrada", "==", false),
    orderBy("fechaCreacion", "desc")
  );

  let primeraCarga = true;
  cancelarEscuchaOTs = onSnapshot(q, (snapshot) => {
    listaOTs = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    filtrarOTs();
    if (primeraCarga || snapshot.docChanges().some(c=>c.type!=="modified")) actualizarConteoCerradasDashboard();
    primeraCarga = false;
    window.OverTrackUI?.finalizarCargaPagina?.();

  }, (error) => {
    console.error("Error escuchando OTs:", error);
    actualizarEstadoCargaDashboard(false, true);
    window.OverTrackUI?.finalizarCargaPagina?.();
  });
}

async function actualizarConteoCerradasDashboard() {
  if (!consultaCerradasDashboard) return;
  const version = ++versionConteoDashboard;
  try {
    const conteo = await getCountFromServer(consultaCerradasDashboard);
    if (version !== versionConteoDashboard) return;
    cantidadCerradasDashboard = conteo.data().count;
  } catch (error) {
    if (version !== versionConteoDashboard) return;
    cantidadCerradasDashboard = null;
    console.warn("No fue posible actualizar el total de OT cerradas:", error);
  }
  renderizarDashboardOperacional(listaFiltrada);
}

window.addEventListener("focus", actualizarConteoCerradasDashboard);
window.addEventListener("pagehide", () => {
  versionConteoDashboard++;
  cancelarEscuchaOTs?.();
  cancelarEscuchaInventarioAlertas?.();
});
window.addEventListener("pageshow", evento => {
  if (evento.persisted && empresaActualDashboard) {
    iniciarInventarioAlertasTiempoReal();
    escucharOTsTiempoReal();
  }
});




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
    const estadoVisible = esFlujoLibre(o) ? escaparHtml(o.etapaActualNombre || "En proceso") : obtenerNombreEstado(estado);
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
          <h3>${escaparHtml(o.os || "Sin OS")}</h3>
          <span>${escaparHtml(o.equipo || "Equipo sin nombre")}</span>
        </div>

        <div class="estado-card ${estado.toLowerCase()}">
          ${escaparHtml(estadoVisible)}
        </div>

      </div>

      <div class="ot-card-cliente">
        👤 ${escaparHtml(o.cliente || "Cliente no definido")}
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

        <small>${progreso===100 && obtenerRecepcionTarjeta(o)?.pendientes>0 && !o.servicioRechazado ? "Trabajo completado · Repuestos pendientes" : `${progreso}% del trabajo completado`}</small>

      </div>

      ${moduloActivo(empresaActualDashboard, "gantt") ? `<div class="mini-gantt">${renderMiniGantt(o)}</div>` : ""}
      ${renderRecepcionTarjeta(o)}

      <div class="ot-card-footer">

        <div>
          📅 ${escaparHtml(fechaEntrega)}
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
  if (esFlujoLibre(ot)) return Object.fromEntries(ot.etapasPersonalizadas.map(e=>[e.id,e.completada?100:Math.round(100*(e.completados??e.items?.filter(i=>i.ok).length??0)/(e.total??e.items?.length??1))]));
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
  const etapas = esFlujoLibre(ot) ? ot.etapasPersonalizadas.map(e=>({key:e.id,label:e.nombre})) : obtenerEtapasDashboardActivas();

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
        <span>${escaparHtml(etapa.label)}</span>

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

function obtenerRecepcionTarjeta(ot) {
  if(!inventarioAlertasCargado || !moduloActivo(empresaActualDashboard,'repuestos'))return null;
  const items=inventarioPorOSDashboard.get(`${ot.sucursalId}:${normalizarClaveOS(ot.os)}`) || [];
  if(!items.length)return null;
  const recibidos=items.filter(repuestoInventarioRecibido).length;
  return {total:items.length,recibidos,pendientes:items.length-recibidos,porcentaje:Math.round(recibidos/items.length*100)};
}
function renderRecepcionTarjeta(ot) {
  const r=obtenerRecepcionTarjeta(ot);if(!r)return '';
  return `<div class="ot-recepcion-repuestos ${r.pendientes?'pendiente':'completa'}"><div><strong>Recepción de repuestos</strong><b>${r.porcentaje}%</b></div><div class="ot-recepcion-barra"><span style="width:${r.porcentaje}%"></span></div><small>${r.recibidos} de ${r.total} recibidos${r.pendientes && !ot.servicioRechazado && !ot.cerrada?' · Cierre bloqueado':''}</small></div>`;
}
function renderBadgesOT(o, estado, atrasada, diasAtraso) {

  const badges = [];
  const revisionPendiente = obtenerEtapaListaParaRevision(o);
  const requiereCorreccion = Boolean(o.alertaJefe && obtenerResumenObservacionesJefe(o));
  const recepcion=obtenerRecepcionTarjeta(o);
  if(recepcion?.pendientes>0 && estado!=='CERRADA')badges.push(`<span class="ot-badge badge-amarillo">Repuestos pendientes: ${recepcion.pendientes}</span>`);

  if (revisionPendiente) {
    badges.push(`
      <span class="ot-badge badge-azul">
        ${esAutoridadSucursal() ? "✓ Revisar" : "◷ En revisión"}: ${escaparHtml(revisionPendiente)}
      </span>
    `);
  }

  if (requiereCorreccion && usuario?.rol === "tecnico") {
    badges.push(`
      <span class="ot-badge badge-amarillo">
        ⚠ Requiere corrección
      </span>
    `);
  }

  if (atrasada) {
    badges.push(`
      <span class="ot-badge badge-rojo">
        ⏱ ${escaparHtml(diasAtraso || 0)} día(s) atraso
      </span>
    `);
  }

  if (!recepcion?.pendientes && esperaRepuestosActiva(o) && estado !== "CERRADA") {
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
    badges.push(`
      <button 
        type="button"
        class="ot-badge badge-amarillo badge-observacion-btn"
        data-observacion="${escaparHtml(resumenObservaciones)}"
        onclick="abrirPopoverObservacion(this.dataset.observacion)"
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
      ${escaparHtml(item)}
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
      ${obtenerNombreEstado(estado)}
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
  const total = listaOTs.length + (cantidadCerradasDashboard || 0);
  animarNumero("kpiProceso", listaOTs.filter(o=>obtenerEstadoOT(o)!=="CERRADA").length);
  animarNumero("kpiAtrasadas", listaOTs.filter(o=>estaOTAtrasada(o)).length);
  if (cantidadCerradasDashboard === null) {
    document.getElementById("kpiTotal").textContent = "—";
    document.getElementById("kpiCerradas").textContent = "—";
  } else {
    animarNumero("kpiTotal", total);
    animarNumero("kpiCerradas", cantidadCerradasDashboard);
  }
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



function obtenerEstadoEsperaRepuestos(ot) {
  if (!etapaDashboardActiva("repuestos") || !etapaDashboardActiva("gantt")) {
    return { activa: false };
  }

  if (!ot?.gantt || ot.cerrada === true || ot.estado === "CERRADA") {
    return { activa: false };
  }

  const registrosInventario = inventarioPorOSDashboard.get(`${ot.sucursalId}:${normalizarClaveOS(ot.os)}`) || [];
  if (inventarioAlertasCargado && registrosInventario.length > 0) {
    const recibidos = registrosInventario.filter(repuestoInventarioRecibido).length;
    const pendientes = Math.max(0, registrosInventario.length - recibidos);
    if (pendientes === 0) return { activa: false, total: registrosInventario.length, recibidos, pendientes: 0 };

    const estadoFecha = calcularFechaEsperaRepuestos(ot);
    return {
      activa: true,
      total: registrosInventario.length,
      recibidos,
      pendientes,
      ...estadoFecha
    };
  }

  const estadoFecha = calcularFechaEsperaRepuestos(ot);
  return estadoFecha.configurada
    ? { activa: true, total: 0, recibidos: 0, pendientes: null, ...estadoFecha }
    : { activa: false };
}

function calcularFechaEsperaRepuestos(ot) {
  if (!ot?.gantt) return { configurada: false, vencida: false, diasAtraso: 0 };

  const dias = Number(ot.gantt.diasRepuestos || 0);
  const fechaSolicitud = ot.gantt.fechaSolicitudRepuestos;

  if (!dias || dias <= 0 || !fechaSolicitud) {
    return { configurada: false, vencida: false, diasAtraso: 0 };
  }

  const inicio = new Date(fechaSolicitud + "T00:00:00");
  const fechaLlegada = new Date(inicio);
  fechaLlegada.setDate(fechaLlegada.getDate() + dias);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const diferencia = Math.floor((hoy - fechaLlegada) / (1000 * 60 * 60 * 24));
  return {
    configurada: true,
    fechaLlegada,
    vencida: diferencia > 0,
    diasAtraso: Math.max(0, diferencia)
  };
}

function esperaRepuestosActiva(ot) {
  return obtenerEstadoEsperaRepuestos(ot).activa === true;
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

    if (esTrabajadorTaller() && ot.alertaJefe && resumenCorreccion) {
      alertas.push({
        tipo: "correccion",
        indiceOT,
        titulo: "Corrección solicitada",
        texto: `${ot.os || "OS sin número"} · ${resumenCorreccion}`,
        accion: "Corregir etapa",
        destinoEtapa: obtenerEtapaObservacionPendiente(ot)
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

    const esperaRepuestos = obtenerEstadoEsperaRepuestos(ot);
    if (esperaRepuestos.activa && estado !== "CERRADA") {
      const detalleRecepcion = esperaRepuestos.pendientes == null
        ? "Recepción pendiente"
        : `${esperaRepuestos.pendientes} de ${esperaRepuestos.total} pendiente(s)`;
      alertas.push({
        tipo: esperaRepuestos.vencida ? "repuestos-vencidos" : "repuestos",
        indiceOT,
        titulo: esperaRepuestos.vencida ? "Repuestos atrasados" : "Espera de repuestos",
        texto: `${ot.os || "OS sin número"} · ${detalleRecepcion}${esperaRepuestos.vencida ? ` · ${esperaRepuestos.diasAtraso} día(s)` : ""}`,
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
        titulo: "Observación pendiente",
        texto: ot.os || "OS sin número",
        accion: "Ver observación",
        resumenObservacion: resumenCorreccion
      });
    }
  });

  if (alertas.length === 0) {
    cont.innerHTML = `<p class="sin-alertas">Sin alertas activas.</p>`;
    return;
  }

  const crearAlerta = alerta => {
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
    boton.addEventListener("click", () => {
      if (alerta.resumenObservacion) {
        abrirPopoverObservacion(alerta.resumenObservacion);
        return;
      }
      abrirOT(alerta.indiceOT, alerta.destinoEtapa || "");
    });
    return boton;
  };

  alertas.slice(0, 6).forEach(alerta => cont.appendChild(crearAlerta(alerta)));

  if (alertas.length > 6) {
    const restantes = alertas.slice(6);
    const botonMas = document.createElement("button");
    botonMas.type = "button";
    botonMas.className = "alertas-dashboard-mas";
    botonMas.textContent = `Mostrar ${restantes.length} alerta(s) más`;
    botonMas.addEventListener("click", () => {
      restantes.forEach(alerta => cont.insertBefore(crearAlerta(alerta), botonMas));
      botonMas.remove();
    });
    cont.appendChild(botonMas);
  }
}

function esAutoridadSucursal() {
  return ["jefe_taller", "admin_sucursal"].includes(usuario?.rol);
}

function esTrabajadorTaller() {
  return ["tecnico", "supervisor"].includes(usuario?.rol);
}

function obtenerEtapaObservacionPendiente(ot) {
  const tienePendiente = lista => Array.isArray(lista) && lista.some(item =>
    (item?.comentarios || []).some(comentario =>
      ["jefe_taller", "admin_sucursal"].includes(comentario?.rol) &&
      comentario?.atendido !== true
    )
  );

  if (etapaDashboardActiva("ingreso") && tienePendiente(ot?.ingreso)) return "ingreso";
  if (etapaDashboardActiva("evaluacion") && tienePendiente(ot?.evaluacion)) return "evaluacion";
  if (etapaDashboardActiva("mantencion") && tienePendiente(ot?.overhaul)) return "overhaul";
  if (etapaDashboardActiva("pruebas") && tienePendiente(obtenerListaPruebas(ot))) return "pruebas";
  if (etapaDashboardActiva("despacho")) return "despacho";
  return "";
}

function obtenerEtapaListaParaRevision(ot) {
  if (esFlujoLibre(ot)) {
    const e=ot.etapasPersonalizadas.find(e=>!e.completada);
    const lista=e?.listaParaRevision ?? e?.items?.every(i=>i.ok && i.fotos?.length && i.comentarios?.length);
    return e?.requiereAprobacion && lista ? e.nombre : "";
  }
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
      <div class="despacho-identidad"><small>ORDEN DE TRABAJO</small><strong>${escaparHtml(item.ot.os || "—")}</strong></div>
      <span class="despacho-fecha"><strong>${escaparHtml(item.ot.equipo || "Equipo sin nombre")}</strong><small>Entrega estimada · ${escaparHtml(formatearFechaCorta(item.fecha))}</small></span>
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

    <div class="gantt-taller-header">
      <span>${formatearFechaCorta(inicioGlobal)}</span>
      <span>${formatearFechaCorta(terminoGlobal)}</span>
    </div>
  `;

  otsConGantt.forEach(ot => {

    const estado = obtenerEstadoOT(ot);
    const estadoVisible = esFlujoLibre(ot) ? ot.etapaActualNombre || "En proceso" : obtenerNombreEstado(estado);
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
        <small>ORDEN DE TRABAJO</small>
        <strong>${escaparHtml(ot.os || "Sin OS")}</strong>
        <span>${escaparHtml(ot.equipo || "Equipo")}</span>
      </div>

      <div class="gantt-taller-track">
        ${diffHoy >= 0 && diffHoy <= diasTotales ? `<span class="gantt-panel-hoy ${posicionHoy>80?'gantt-panel-hoy-derecha':posicionHoy<20?'gantt-panel-hoy-izquierda':''}" style="left:${posicionHoy}%" aria-label="Hoy, ${escaparHtml(formatearFechaCorta(hoy))}"><span>HOY · ${escaparHtml(formatearFechaCorta(hoy))}</span></span>` : ""}
        <div
          class="gantt-taller-bar ${atrasada ? "atrasada" : estado.toLowerCase()}"
          style="left:${left}%; width:${width}%"

          data-gantt="${escaparHtml(JSON.stringify({
              os: ot.os || "Sin OS",
              equipo: ot.equipo || "Sin equipo",
              estado: estadoVisible,
              inicio: formatearFechaCorta(inicio),
              termino: formatearFechaCorta(termino),
              progreso: calcularProgreso(ot)
            }))}"
            onclick="abrirPopoverGanttDesdeElemento(this)"
        >
          <span class="gantt-panel-avance" style="width:${Math.max(0,Math.min(100,calcularProgreso(ot)))}%"></span>
          <span class="gantt-panel-texto">${escaparHtml(atrasada ? "ATRASADA" : estadoVisible)} · ${calcularProgreso(ot)}%</span>
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

  const progreso = Math.max(0, Math.min(100, Number(data.progreso) || 0));
  const textoSeguro = valor => String(valor ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  cont.innerHTML = `
    <div class="gantt-pop-resumen">
      <section class="gantt-pop-identidad">
        <span>Orden de servicio</span>
        <strong>${textoSeguro(data.os)}</strong>
        <small>${textoSeguro(data.equipo)}</small>
      </section>

      <section class="gantt-pop-estado">
        <span>Estado actual</span>
        <strong>${textoSeguro(data.estado)}</strong>
      </section>

      <div class="gantt-pop-fechas">
        <section>
          <span>Inicio</span>
          <strong>${textoSeguro(data.inicio)}</strong>
        </section>
        <section>
          <span>Término estimado</span>
          <strong>${textoSeguro(data.termino)}</strong>
        </section>
      </div>

      <section class="gantt-pop-progreso">
        <div>
          <span>Avance de la OT</span>
          <strong>${progreso}%</strong>
        </div>
        <div class="gantt-pop-progreso-barra" role="progressbar" aria-label="Avance de la OT" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progreso}">
          <i style="width:${progreso}%"></i>
        </div>
      </section>
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
function abrirOT(index, destinoEtapa = "") {
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
  if (destinoEtapa) {
    localStorage.setItem("otDestinoEtapa", destinoEtapa);
  } else {
    localStorage.removeItem("otDestinoEtapa");
  }
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
  const canvasEstados = document.getElementById("graficoEstados");
  const avisoCerradas = document.getElementById("avisoTotalCerradas");
  if (canvasEstados) canvasEstados.hidden = cantidadCerradasDashboard === null;
  if (avisoCerradas) avisoCerradas.hidden = cantidadCerradasDashboard !== null;

  const estadosGraficos = [
    ...(lista.some(ot=>!esFlujoLibre(ot)) ? obtenerEtapasDashboardActivas() : []),
    { key: "CERRADA", label: "CERRADA", color: "#2ecc71" }
  ];

  const estadosCount = Object.fromEntries(
    estadosGraficos.map(etapa => [etapa.key, 0])
  );
  estadosCount.CERRADA = cantidadCerradasDashboard || 0;

  lista.forEach(ot => {

    let estado = obtenerEstadoOT(ot);
    if(esFlujoLibre(ot) && estado!=='CERRADA') {
      const nombre=ot.etapaActualNombre || ot.etapasPersonalizadas.find(e=>!e.completada)?.nombre || 'Pendiente de cierre';
      estado=`PERSONALIZADA:${nombre.trim().toLocaleLowerCase('es')}`;
      if(estadosCount[estado]===undefined) {
        const colores=['#1688e7','#1c9b83','#8661c5','#df9c32','#527b9c','#ce7183'];
        estadosGraficos.push({key:estado,label:nombre,color:colores[estadosGraficos.filter(e=>e.key.startsWith('PERSONALIZADA:')).length%colores.length]});
        estadosCount[estado]=0;
      }
    }
    if(estadosCount[estado]===undefined){estadosGraficos.push({key:estado,label:obtenerNombreEstado(estado),color:'#607d8b'});estadosCount[estado]=0;}
    if (estadosCount[estado] !== undefined) {
      estadosCount[estado]++;
    }

  });

  const abiertas=lista.filter(ot=>ot.cerrada!==true && ot.estado!=='CERRADA' && obtenerEstadoOT(ot)!=='CERRADA');
  const progresoTotal=abiertas.reduce((total,ot)=>total+calcularProgreso(ot),0);
  const promedio = abiertas.length ? Math.round(progresoTotal / abiertas.length * 100) / 100 : 0;
  const porcentajeVisible=document.getElementById('porcentajeProgresoAbiertas');
  if(porcentajeVisible)porcentajeVisible.textContent=abiertas.length ? `${promedio.toLocaleString('es-CL', { maximumFractionDigits: 2 })}%` : '—';
  const cantidadVisible=document.getElementById('cantidadOTAbiertas');
  if(cantidadVisible)cantidadVisible.textContent=`${abiertas.length} OT ${abiertas.length===1 ? 'abierta' : 'abiertas'}`;
  const detalleProgreso=document.getElementById('detalleProgresoGlobal');
  if(detalleProgreso)detalleProgreso.textContent=abiertas.length ? `Promedio del trabajo de ${abiertas.length} OT ${abiertas.length===1 ? 'abierta' : 'abiertas'} del listado. La recepción de repuestos se muestra por separado en cada tarjeta.` : 'No hay OT abiertas';
  const canvasProgreso=document.getElementById('graficoProgreso');
  if(canvasProgreso)canvasProgreso.hidden=abiertas.length===0;

  // 🔥 DESTRUIR GRÁFICOS ANTES (IMPORTANTE)
  if (chartEstados) chartEstados.destroy();
  if (chartProgreso) {chartProgreso.destroy();chartProgreso=null;}

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
  if(!abiertas.length)return;
  chartProgreso = new Chart(document.getElementById("graficoProgreso"), {
    type: "bar",
    data: {
      labels: ["OT abiertas"],
      datasets: [{
        label: "Avance promedio del trabajo",
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

window.addEventListener("storage", actualizarConteoCerradasDashboard);

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
  } else if (usuarioActivo.rol === "supervisor") {
    rol.textContent = "Supervisor";
  } else if (usuarioActivo.rol === "tecnico") {
    rol.textContent = "Técnico";
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
    alertas.add("🔧 Mantención");
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
      div.textContent = alerta;
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
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciarDashboard, { once: true });
} else {
  iniciarDashboard();
}
