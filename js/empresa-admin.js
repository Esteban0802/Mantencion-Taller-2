import { renderVistaUsuariosEmpresa } from "./empresa/usuarios.js";
import { renderVistaSucursalesEmpresa } from "./empresa/sucursales.js";
import { app, db } from "./firebase-config.js";
import { protegerPagina, cerrarSesion } from "./session.js?v=20261004-1";
import { aplicarModulosEnInterfaz, moduloActivo, obtenerModulosEmpresa} from "./modulos.js";
import { evaluarCuotaStorage, mensajeCuotaStorage } from "./storage-quota.js";

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getCountFromServer,
  getDocs,
  addDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const storage = getStorage();
const functions = getFunctions(app, "us-central1");
const recalcularAlmacenamientoSeguro = httpsCallable(
  functions,
  "recalcularAlmacenamientoEmpresa"
);
const generarExportacionEmpresaSegura = httpsCallable(
  functions,
  "generarExportacionEmpresa"
);
const solicitarCancelacionEmpresaSegura = httpsCallable(
  functions,
  "solicitarCancelacionEmpresa"
);

const usuarioActivo = protegerPagina([
    "super_admin",
    "admin_empresa",
    "admin_sucursal",
    "jefe_taller"
]);

if (!usuarioActivo) throw new Error("Acceso no autorizado");

let empresaActual = null;
let empresaIdActual = null;
let plantillasMantenimientoActuales = [];

const alert = (mensaje) => {
  const texto = String(mensaje || "");
  const tipo = /correctamente|actualizad[ao]|guardad[ao]/i.test(texto)
    ? "exito"
    : /error|no fue posible|no existe|no se encontró|no se recibió/i.test(texto)
      ? "error"
      : "advertencia";
  const titulo = tipo === "exito"
    ? "Operación completada"
    : tipo === "error"
      ? "No fue posible completar la acción"
      : "Revisa la información";

  if (window.OverTrackUI?.mostrarMensaje) {
    return window.OverTrackUI.mostrarMensaje({ titulo, mensaje: texto, tipo });
  }

  window.alert(texto);
  return Promise.resolve(true);
};

const confirmarAccionAdmin = ({ titulo, mensaje, textoConfirmar = "Confirmar", peligrosa = false }) => {
  if (window.OverTrackUI?.confirmarAccion) {
    return window.OverTrackUI.confirmarAccion({
      titulo,
      mensaje,
      tipo: "advertencia",
      textoConfirmar,
      textoCancelar: "Cancelar",
      peligrosa
    });
  }

  return Promise.resolve(window.confirm(mensaje));
};

function obtenerEmpresaIdURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

async function validarAccesoEmpresa() {

  if (!usuarioActivo) {
    window.location.href = "index.html";
    return false;
  }

  empresaIdActual = obtenerEmpresaIdURL();

  if (!empresaIdActual) {
    await alert("No se recibió ID de empresa");
    window.location.href = "index.html";
    return false;
  }

  if (usuarioActivo.rol === "super_admin") {
    return true;
  }

  if (
    ["admin_empresa", "admin_sucursal"].includes(usuarioActivo.rol) &&
    usuarioActivo.empresaId === empresaIdActual
  ) {
    return true;
  }

  await alert("No tienes permiso para acceder a esta empresa.");

  if (usuarioActivo.rol === "jefe_taller") {
    window.location.href = "dashboard.html";
  } else {
    window.location.href = "index.html";
  }

  return false;
}

async function cargarEmpresa() {
  if (!(await validarAccesoEmpresa())) return;

  try {
    const refEmpresa = doc(db, "empresas", empresaIdActual);
    const snap = await getDoc(refEmpresa);

    if (!snap.exists()) {
      await alert("La empresa no existe");
      window.location.href = "index.html";
      return;
    }

    empresaActual = {
      id: snap.id,
      ...snap.data()
    };

    window.empresaActualAdmin = empresaActual;
    window.empresaIdActualAdmin = empresaActual.id;
    window.modulosEmpresaActual = empresaActual.modulos || {};

    aplicarModulosEnInterfaz(empresaActual);

    renderEmpresa();

  } catch (error) {
    console.error("Error cargando empresa:", error);
    alert("Error al cargar empresa");
  }
}

function renderEmpresa() {

    document.getElementById("nombreEmpresa").textContent =
        empresaActual.nombre || "Empresa";

    document.getElementById("tituloEmpresa").textContent =
        empresaActual.nombre || "Administrador de Empresa";


    configurarMenuSegunRol();

    renderBotonSalida();

    if (empresaEnPeriodoDeSalida()) {
      aplicarAccesoSoloRespaldo();
      renderVistaConfiguracionEmpresa();
    } else {
      renderKPIsEmpresa();
      cargarKPIsEmpresa();
      renderVistaDashboardEmpresa();
    }
}

function empresaEnPeriodoDeSalida() {
  return ["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"]
    .includes(empresaActual?.suscripcion?.estado);
}

function aplicarAccesoSoloRespaldo() {
  ["menuDashboardEmpresa", "menuUsuariosEmpresa", "menuSucursalesEmpresa", "menuSistemaOperacional", "menuModulosEmpresa"]
    .forEach(id => { const elemento = document.getElementById(id); if (elemento) elemento.style.display = "none"; });
  const configuracion = document.getElementById("menuConfiguracionEmpresa");
  configuracion?.classList.add("active");
  const kpis = document.getElementById("kpiEmpresaGrid");
  if (kpis) kpis.innerHTML = "";
  const descripcion = document.getElementById("descripcionPanelEmpresa");
  if (descripcion) descripcion.textContent = "Acceso limitado a la descarga del respaldo antes del cierre del servicio.";
}


function renderBotonSalida() {
  const btn = document.getElementById("btnSalidaEmpresa");
  if (!btn) return;

  if (usuarioActivo.rol === "super_admin") {
    btn.textContent = "Volver";
    btn.onclick = () => {
      window.location.href = "super-admin.html";
    };
  } else {
    btn.textContent = "Cerrar sesión";
    btn.onclick = () => {
      cerrarSesion();
    };
  }
}


function configurarMenuSegunRol() {
  const menuModulos = document.getElementById("menuModulosEmpresa");
  const esAdminSucursal = usuarioActivo.rol === "admin_sucursal";
  const descripcion = document.getElementById("descripcionPanelEmpresa");

  if (descripcion) {
    descripcion.textContent = esAdminSucursal
      ? "Gestión de usuarios y operación de tu sucursal."
      : "Gestión completa de la empresa seleccionada.";
  }

  [
    "menuSucursalesEmpresa",
    "menuConfiguracionEmpresa"
  ].forEach(id => {
    const elemento = document.getElementById(id);
    if (elemento) elemento.style.display = esAdminSucursal ? "none" : "";
  });

  if (!menuModulos) return;

  if (usuarioActivo.rol === "super_admin") {
    menuModulos.style.display = "";
  } else {
    menuModulos.style.display = "none";
  }
}


window.cambiarVistaEmpresa = function (vista, elemento) {
  if (empresaEnPeriodoDeSalida() && vista !== "configuracion") {
    alert("Durante el periodo de cancelación solo está disponible la configuración y descarga del respaldo.");
    return;
  }
  const moduloPorVista = {
    dashboard: "dashboard",
    usuarios: "usuarios",
    sucursales: "sucursales",
    clientes: "clientes",
    equipos: "equipos"
  };

  const moduloRequerido = moduloPorVista[vista];

  if (
    moduloRequerido &&
    !moduloActivo(empresaActual, moduloRequerido)
  ) {
    alert(
      "Este módulo no está habilitado para la empresa."
    );

    return;
  }

  document.querySelectorAll(".sidebar li").forEach(li => {
    li.classList.remove("active");
  });

  if (elemento) {
    elemento.classList.add("active");
  }

  if (vista === "dashboard") {
    renderVistaDashboardEmpresa();
    return;
  }

  if (vista === "usuarios") {
    renderVistaUsuariosEmpresa();
    return;
  }

  if (vista === "sucursales") {
    renderVistaSucursalesEmpresa();
    return;
  }

  if (vista === "clientes") {
    renderVistaPlaceholder(
      "Clientes",
      "Aquí administraremos los clientes asociados a la empresa."
    );

    return;
  }

  if (vista === "equipos") {
    renderVistaPlaceholder(
      "Equipos",
      "Aquí administraremos los equipos y activos del cliente."
    );

    return;
  }

  if (vista === "modulos") {
  if (usuarioActivo.rol !== "super_admin") {
    alert("Solo el Super Administrador puede configurar módulos.");
    return;
  }

  renderVistaModulosEmpresa();
  return;
}

  if (vista === "configuracion") {
    renderVistaConfiguracionEmpresa();
    return;
  }
};


const CATALOGO_KPI_EMPRESA = [
  {
    modulo: "usuarios",
    titulo: "Usuarios",
    id: "kpiUsuarios"
  },
  {
    modulo: "sucursales",
    titulo: "Sucursales",
    id: "kpiSucursales"
  },
  {
    modulo: "clientes",
    titulo: "Clientes",
    id: "kpiClientes"
  },
  {
    modulo: "equipos",
    titulo: "Equipos",
    id: "kpiEquipos"
  }
];


function renderKPIsEmpresa() {
  const cont = document.getElementById("kpiEmpresaGrid");

  if (!cont || !empresaActual) return;

  const kpisActivos = CATALOGO_KPI_EMPRESA.filter(kpi =>
    moduloActivo(empresaActual, kpi.modulo) &&
    (usuarioActivo.rol !== "admin_sucursal" || kpi.modulo === "usuarios")
  );

  if (!kpisActivos.length) {
    cont.innerHTML = "";
    cont.style.display = "none";
    return;
  }

  cont.style.display = "grid";

  cont.innerHTML = kpisActivos
    .map(kpi => `
      <div class="kpi-card">
        <h3>${kpi.titulo}</h3>
        <strong id="${kpi.id}">0</strong>
      </div>
    `)
    .join("");
}



window.irSistemaOperacional = function () {
  if (!usuarioActivo) {
    window.location.href = "index.html";
    return;
  }

  if (!empresaActual?.id) {
    alert("No se encontró la empresa activa.");
    return;
  }

  if (!moduloActivo(empresaActual, "ordenesServicio")) {
    alert(
      "El módulo de Órdenes de Servicio no está habilitado para esta empresa."
    );
    return;
  }

  // Conserva la empresa que el superadministrador está gestionando.
  // Se usa sessionStorage porque este contexto solo debe durar durante
  // la navegación de la pestaña actual y no modifica la sesión del usuario.
  sessionStorage.setItem(
    "empresaIdOperacionAdmin",
    empresaActual.id
  );

  window.location.href = "dashboard.html";
};

window.irProgramacionSemanal = function () {
  if (!empresaActual?.id) {
    alert("No se encontró la empresa activa.");
    return;
  }

  if (!moduloActivo(empresaActual, "programacion")) {
    alert("El módulo de Programación semanal no está habilitado para esta empresa.");
    return;
  }

  sessionStorage.setItem("empresaIdOperacionAdmin", empresaActual.id);
  window.location.href = "programacion.html";
};

window.irModuloSheq = function () {
  if (!empresaActual?.id) {
    alert("No se encontró la empresa activa.");
    return;
  }
  if (!moduloActivo(empresaActual, "sheq")) {
    alert("El módulo SHEQ no está habilitado para esta empresa.");
    return;
  }
  sessionStorage.setItem("empresaIdOperacionAdmin", empresaActual.id);
  window.location.href = "sheq.html";
};




async function cargarKPIsEmpresa() {
  if (!empresaActual?.id) return;

  const empresaId = empresaActual.id;

  const consultas = [];

  if (moduloActivo(empresaActual, "usuarios")) {
    consultas.push(
      cargarConteoKPI({
        coleccion: "usuarios",
        empresaId,
        elementoId: "kpiUsuarios"
      })
    );
  }

  if (usuarioActivo.rol !== "admin_sucursal" && moduloActivo(empresaActual, "sucursales")) {
    consultas.push(
      cargarConteoKPI({
        coleccion: "sucursales",
        empresaId,
        elementoId: "kpiSucursales"
      })
    );
  }

  if (usuarioActivo.rol !== "admin_sucursal" && moduloActivo(empresaActual, "clientes")) {
    consultas.push(
      cargarConteoKPI({
        coleccion: "clientes",
        empresaId,
        elementoId: "kpiClientes"
      })
    );
  }

  if (usuarioActivo.rol !== "admin_sucursal" && moduloActivo(empresaActual, "equipos")) {
    consultas.push(
      cargarConteoKPI({
        coleccion: "equipos",
        empresaId,
        elementoId: "kpiEquipos"
      })
    );
  }

  await Promise.allSettled(consultas);
}



async function cargarConteoKPI({
  coleccion,
  empresaId,
  elementoId
}) {
  const elemento = document.getElementById(elementoId);

  if (!elemento) return;

  elemento.textContent = "…";

  try {
    const restricciones = [where("empresaId", "==", empresaId)];
    if (usuarioActivo.rol === "admin_sucursal" && coleccion === "usuarios") {
      restricciones.push(where("sucursalId", "==", usuarioActivo.sucursalId));
    }
    const consulta = query(collection(db, coleccion), ...restricciones);

    const resultado = await getCountFromServer(consulta);

    elemento.textContent = resultado.data().count;

  } catch (error) {

  if (error.code === "permission-denied") {

    console.warn(
      `KPI ${coleccion}: pendiente configurar permisos de Firestore.`
    );

  } else {

    console.error(
      `Error cargando KPI de ${coleccion}:`,
      error
    );

  }

  elemento.textContent = "0";

}
}




function renderVistaDashboardEmpresa() {
  const cont = document.getElementById("vistaEmpresaContenido");
  if (!cont) return;

  cont.innerHTML = `
    <div class="section-header">
      <h2>Información General</h2>
    </div>

    <div class="empresa-datos-grid">

      <div class="dato-box">
        <span>Nombre</span>
        <strong>${empresaActual.nombre || "-"}</strong>
      </div>

      <div class="dato-box">
        <span>RUT</span>
        <strong>${empresaActual.rut || "-"}</strong>
      </div>

      <div class="dato-box">
        <span>Correo</span>
        <strong>${empresaActual.correo || "-"}</strong>
      </div>

      <div class="dato-box">
        <span>Plan</span>
        <strong>${empresaActual.plan || "-"}</strong>
      </div>

      <div class="dato-box">
        <span>Estado</span>
        <strong>${empresaActual.activa ? "Activa" : "Inactiva"}</strong>
      </div>

      <div class="dato-box">
        <span>País</span>
        <strong>${empresaActual.pais || "-"}</strong>
      </div>

      <div class="dato-box">
        <span>Máx. usuarios</span>
        <strong>${empresaActual.maxUsuarios || "-"}</strong>
      </div>

      <div class="dato-box">
        <span>Máx. sucursales</span>
        <strong>${empresaActual.maxSucursales || "-"}</strong>
      </div>

      <div class="dato-box">
        <span>Storage</span>
        <strong>${empresaActual.maxStorageGB || "-"} GB</strong>
      </div>

    </div>
  `;
}


const CATALOGO_MODULOS = [
  {
    key: "dashboard",
    nombre: "Dashboard",
    descripcion: "Panel principal con indicadores, métricas y estado operacional.",
    icono: "📊"
  },
  {
    key: "usuarios",
    nombre: "Usuarios",
    descripcion: "Administración de usuarios, roles y accesos de la empresa.",
    icono: "👥"
  },
  {
    key: "sucursales",
    nombre: "Sucursales",
    descripcion: "Permite administrar diferentes talleres o ubicaciones.",
    icono: "🏭"
  },
  {
    key: "ordenesServicio",
    nombre: "Crear OT",
    descripcion: "Creación permanente de órdenes de servicio y punto inicial del flujo.",
    icono: "📋",
    obligatorio: true
  },
  {
    key: "checklists",
    nombre: "Checklists",
    descripcion: "Listas de verificación por etapa del proceso de mantención.",
    icono: "✅"
  },
  {
    key: "ingreso",
    nombre: "Ingreso",
    descripcion: "Recepción, inspección inicial y registro de ingreso del equipo.",
    icono: "📥"
  },
  {
    key: "evaluacion",
    nombre: "Evaluación",
    descripcion: "Diagnóstico y evaluación técnica previa a la intervención.",
    icono: "🔎"
  },
  {
    key: "mantencion",
    nombre: "Mantención",
    descripcion: "Ejecución y registro de los trabajos de mantención.",
    icono: "🛠️"
  },
  {
    key: "pruebas",
    nombre: "Pruebas",
    descripcion: "Pruebas mecánicas y eléctricas posteriores a la mantención.",
    icono: "🧪"
  },
  {
    key: "evidencias",
    nombre: "Evidencias Fotográficas",
    descripcion: "Carga y almacenamiento de fotografías y evidencias técnicas.",
    icono: "📷"
  },
  {
    key: "comentarios",
    nombre: "Comentarios",
    descripcion: "Comentarios, observaciones y respuestas dentro de las etapas.",
    icono: "💬"
  },
  {
    key: "aprobaciones",
    nombre: "Aprobaciones",
    descripcion: "Control de aprobación por etapa y según el rol del usuario.",
    icono: "🔐"
  },
  {
    key: "repuestos",
    nombre: "Repuestos",
    descripcion: "Carga, consulta y registro de repuestos utilizados en Mantención.",
    icono: "📦"
  },
  {
    key: "gantt",
    nombre: "Carta Gantt",
    descripcion: "Visualización de planificación, duración y avance de trabajos.",
    icono: "📅"
  },
  {
    key: "despacho",
    nombre: "Despacho",
    descripcion: "Preparación, documentación y cierre del proceso de despacho.",
    icono: "🚚"
  },
  {
    key: "reportesPDF",
    nombre: "Reportes PDF",
    descripcion: "Generación de informes técnicos y reportes finales.",
    icono: "📄"
  },
  {
    key: "clientes",
    nombre: "Clientes",
    descripcion: "Administración de clientes asociados a la empresa.",
    icono: "🤝"
  },
  {
    key: "equipos",
    nombre: "Equipos",
    descripcion: "Registro y trazabilidad de equipos y activos de clientes.",
    icono: "⚙️"
  },
  {
    key: "inventario",
    nombre: "Inventario",
    descripcion: "Control de repuestos, materiales, entradas y salidas.",
    icono: "📦"
  },
  {
    key: "programacion",
    nombre: "Programación semanal",
    descripcion: "Planificación semanal de técnicos, supervisores y personal SHEQ.",
    icono: "🗓️"
  },
  {
    key: "sheq",
    nombre: "SHEQ y Acreditaciones",
    descripcion: "Control de personal, vehículos, contratos, documentos y vigencias.",
    icono: "🛡️"
  },
  {
    key: "ia",
    nombre: "Inteligencia Artificial",
    descripcion: "Funciones inteligentes de asistencia y análisis técnico.",
    icono: "🤖"
  }
];

function renderVistaModulosEmpresa() {
  const cont = document.getElementById("vistaEmpresaContenido");

  if (!cont || !empresaActual) return;

  if (usuarioActivo.rol !== "super_admin") {
    cont.innerHTML = `
      <div class="empty-state">
        <h3>Acceso restringido</h3>
        <p>No tienes permisos para configurar módulos.</p>
      </div>
    `;

    return;
  }

  const modulos = obtenerModulosEmpresa(empresaActual);

  cont.innerHTML = `
    <div class="section-header modulos-section-header">
      <div>
        <h2>Configuración de Módulos</h2>

        <p class="section-subtitle">
          Activa o desactiva las funcionalidades disponibles para
          <strong>${empresaActual.nombre || "esta empresa"}</strong>.
        </p>
      </div>

      <button
        type="button"
        class="btn-primary"
        id="btnGuardarModulosEmpresa"
      >
        Guardar cambios
      </button>
    </div>

    <div class="modulos-admin-grid">
      ${CATALOGO_MODULOS.map(modulo => `
        <label class="modulo-admin-card">
          <div class="modulo-admin-icono">
            ${modulo.icono}
          </div>

          <div class="modulo-admin-info">
            <strong>${modulo.nombre}</strong>
            <p>${modulo.descripcion}</p>
          </div>

          <div class="switch-modulo">
            <input
              type="checkbox"
              data-config-modulo="${modulo.key}"
              ${(modulo.obligatorio || modulos[modulo.key]) ? "checked" : ""}
              ${modulo.obligatorio ? "disabled" : ""}
            >

            <span class="switch-slider"></span>
          </div>
        </label>
      `).join("")}
    </div>

    <div class="modulos-admin-aviso">
      Los cambios se aplicarán cuando los usuarios recarguen la aplicación
      o vuelvan a iniciar sesión.
    </div>
  `;

  document
    .getElementById("btnGuardarModulosEmpresa")
    ?.addEventListener("click", guardarModulosEmpresa);
}



async function guardarModulosEmpresa() {
  if (!empresaActual || usuarioActivo.rol !== "super_admin") return;

  const boton = document.getElementById("btnGuardarModulosEmpresa");

  const modulosActualizados = {};

  document
    .querySelectorAll("[data-config-modulo]")
    .forEach(input => {
      modulosActualizados[input.dataset.configModulo] = input.checked;
    });

  const etapasOperativas = ["ingreso", "evaluacion", "mantencion", "pruebas", "despacho"];
  if (!etapasOperativas.some(etapa => modulosActualizados[etapa] === true)) {
    await window.OverTrackUI.mostrarMensaje({
      titulo: "Flujo incompleto",
      mensaje: "Debes mantener activa al menos una etapa operativa: Ingreso, Evaluación, Mantención, Pruebas o Despacho.",
      tipo: "advertencia"
    });
    return;
  }
  const confirmar = await confirmarAccionAdmin({
    titulo: "Guardar configuración de módulos",
    mensaje: `Se aplicará la nueva configuración de módulos para ${empresaActual.nombre}.`,
    textoConfirmar: "Guardar cambios"
  });

  if (!confirmar) return;

  try {
    if (boton) {
      boton.disabled = true;
      boton.textContent = "Guardando...";
    }

    await updateDoc(
      doc(db, "empresas", empresaActual.id),
      {
        modulos: modulosActualizados,
        fechaActualizacion: serverTimestamp()
      }
    );

    empresaActual.modulos = modulosActualizados;

    window.empresaActualAdmin = empresaActual;
    window.modulosEmpresaActual = modulosActualizados;

    aplicarModulosEnInterfaz(empresaActual);

    renderKPIsEmpresa();

    await cargarKPIsEmpresa();

    alert("Módulos actualizados correctamente.");

    renderVistaModulosEmpresa();

  } catch (error) {
    console.error("Error actualizando módulos:", error);
    alert("No fue posible actualizar los módulos.");

    if (boton) {
      boton.disabled = false;
      boton.textContent = "Guardar cambios";
    }
  }
}

function escaparAtributo(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function puedeEditarConfiguracionEmpresa() {
  return ["super_admin", "admin_empresa"].includes(usuarioActivo.rol);
}

function formatearAlmacenamiento(bytes) {
  const total = Math.max(0, Number(bytes || 0));
  if (total < 1024 * 1024 * 1024) {
    return `${(total / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(total / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function recalcularAlmacenamientoEmpresa() {
  const boton = document.getElementById("btnRecalcularStorage");
  if (!empresaActual?.id || !boton) return;
  boton.disabled = true;
  boton.textContent = "Calculando...";
  try {
    const resultado = await recalcularAlmacenamientoSeguro({
      empresaId: empresaActual.id
    });
    empresaActual.storageUsadoBytes = Number(resultado.data?.totalBytes || 0);
    empresaActual.storageArchivos = Number(resultado.data?.totalArchivos || 0);
    window.empresaActualAdmin = empresaActual;
    renderVistaConfiguracionEmpresa();
  } catch (error) {
    console.error("Error recalculando almacenamiento:", error);
    alert(error?.message || "No fue posible calcular el almacenamiento.");
    boton.disabled = false;
    boton.textContent = "Recalcular uso";
  }
}

async function descargarExportacionEmpresa() {
  const boton = document.getElementById("btnExportarEmpresa");
  if (!boton || !empresaActual?.id) return;
  const confirmado = await confirmarAccionAdmin({
    titulo: "Generar respaldo completo",
    mensaje: "Se preparará un ZIP con las OT, resúmenes PDF, fotografías, documentos y registros de la empresa. Las OT cerradas no serán modificadas. El enlace estará disponible durante 72 horas.",
    textoConfirmar: "Generar respaldo"
  });
  if (!confirmado) return;

  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Preparando respaldo…";
  try {
    const resultado = await generarExportacionEmpresaSegura({ empresaId: empresaActual.id });
    const datos = resultado.data || {};
    if (!datos.url) throw new Error("No se recibió el enlace de descarga.");
    const enlace = document.createElement("a");
    enlace.href = datos.url;
    enlace.download = datos.nombreArchivo || "Respaldo_Vectaria.zip";
    enlace.rel = "noopener";
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    const resumen = datos.resumen || {};
    await alert(`Respaldo generado correctamente: ${resumen.ots || 0} OT y ${resumen.archivos || 0} archivos. La descarga permanecerá disponible durante 72 horas.`);
  } catch (error) {
    console.error("Error generando exportación:", error);
    await alert(error?.message || "No fue posible preparar el respaldo completo.");
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

async function solicitarCancelacionEmpresa() {
  if (!empresaActual?.id || usuarioActivo.rol !== "admin_empresa") return;
  const confirmado = await confirmarAccionAdmin({
    titulo: "Solicitar cancelación",
    mensaje: "La operación del taller quedará bloqueada y tendrás 30 días para descargar el respaldo completo. La eliminación no será automática: deberá realizarla manualmente el superadministrador después del plazo.",
    textoConfirmar: "Solicitar cancelación",
    peligrosa: true
  });
  if (!confirmado) return;
  try {
    const resultado = await solicitarCancelacionEmpresaSegura({ empresaId: empresaActual.id });
    empresaActual.activa = false;
    empresaActual.estado = "cancelacion_solicitada";
    empresaActual.suscripcion = { ...(empresaActual.suscripcion || {}), estado: "periodo_exportacion" };
    empresaActual.cancelacion = {
      ...(empresaActual.cancelacion || {}),
      estado: "periodo_exportacion",
      fechaSolicitud: resultado.data?.fechaSolicitud,
      fechaLimiteExportacion: resultado.data?.fechaLimiteExportacion,
      eliminacionManual: true
    };
    aplicarAccesoSoloRespaldo();
    renderVistaConfiguracionEmpresa();
    await alert("Cancelación registrada. Dispones de 30 días para generar y descargar el respaldo completo.");
  } catch (error) {
    console.error("Error solicitando cancelación:", error);
    await alert(error?.message || "No fue posible registrar la cancelación.");
  }
}

function renderVistaConfiguracionEmpresa() {
  const cont = document.getElementById("vistaEmpresaContenido");
  if (!cont || !empresaActual) return;

  const editable = puedeEditarConfiguracionEmpresa();
  const deshabilitado = editable ? "" : "disabled";
  const modulosActivos = CATALOGO_MODULOS
    .filter(modulo => obtenerModulosEmpresa(empresaActual)[modulo.key])
    .map(modulo => modulo.nombre);
  const etapasChecklistActivas = obtenerEtapasChecklistActivasEmpresa();
  const storageUsadoBytes = Math.max(0, Number(empresaActual.storageUsadoBytes || 0));
  const storageMaxBytes = Math.max(0, Number(empresaActual.maxStorageGB || 0)) * 1024 * 1024 * 1024;
  const storagePorcentaje = storageMaxBytes
    ? Math.min(100, (storageUsadoBytes / storageMaxBytes) * 100)
    : 0;
  const cancelacionActiva = empresaEnPeriodoDeSalida();
  const fechaLimiteCancelacion = empresaActual.cancelacion?.fechaLimiteExportacion
    ? new Date(empresaActual.cancelacion.fechaLimiteExportacion).toLocaleDateString("es-CL")
    : "-";

  cont.innerHTML = `
    <div class="section-header configuracion-header">
      <div>
        <h2>Configuración de la Empresa</h2>
        <p class="section-subtitle">
          Actualiza la información operativa y la identidad visual básica.
        </p>
      </div>
      ${editable ? `
        <button type="button" class="btn-primary" id="btnGuardarConfiguracionEmpresa">
          Guardar cambios
        </button>
      ` : ""}
    </div>

    ${cancelacionActiva ? `
      <div class="config-info-note config-cancellation-note">
        <strong>Periodo de exportación por cancelación.</strong>
        La operación está bloqueada. Puedes descargar respaldos hasta el ${fechaLimiteCancelacion}.
        La empresa no se eliminará automáticamente; el superadministrador deberá hacerlo manualmente.
      </div>
    ` : ""}

    ${!editable ? `
      <div class="config-info-note">
        Tu perfil puede consultar esta configuración, pero no modificarla.
      </div>
    ` : ""}

    <div class="config-tabs" role="tablist" aria-label="Secciones de configuración">
      <button type="button" class="config-tab active" data-config-tab="general">Configuración general</button>
      <button type="button" class="config-tab" data-config-tab="plantillas">Plantillas de mantenimiento</button>
    </div>

    <div id="configPanelGeneral" class="configuracion-grid">
      <section class="config-panel">
        <h3>Datos generales</h3>
        <div class="config-form-grid">
          <label>
            <span>Nombre de la empresa</span>
            <input id="configEmpresaNombre" type="text" maxlength="120"
              value="${escaparAtributo(empresaActual.nombre)}" ${deshabilitado}>
          </label>
          <label>
            <span>RUT</span>
            <input type="text" value="${escaparAtributo(empresaActual.rut || "-")}" disabled>
            <small>El RUT solo puede gestionarse desde el superadministrador.</small>
          </label>
          <label>
            <span>Correo de contacto</span>
            <input id="configEmpresaCorreo" type="email" maxlength="160"
              value="${escaparAtributo(empresaActual.correo)}" ${deshabilitado}>
          </label>
          <label>
            <span>Teléfono</span>
            <input id="configEmpresaTelefono" type="text" maxlength="40"
              value="${escaparAtributo(empresaActual.telefono)}" ${deshabilitado}>
          </label>
          <label>
            <span>Ciudad</span>
            <input id="configEmpresaCiudad" type="text" maxlength="80"
              value="${escaparAtributo(empresaActual.ciudad)}" ${deshabilitado}>
          </label>
          <label>
            <span>País</span>
            <input id="configEmpresaPais" type="text" maxlength="80"
              value="${escaparAtributo(empresaActual.pais)}" ${deshabilitado}>
          </label>
          <label class="config-full-width">
            <span>Dirección</span>
            <input id="configEmpresaDireccion" type="text" maxlength="180"
              value="${escaparAtributo(empresaActual.direccion)}" ${deshabilitado}>
          </label>
        </div>
      </section>

      <section class="config-panel config-panel-identidad">
        <h3>Identidad visual</h3>
        <div class="color-config-row">
          <label>
            <span>Color primario</span>
            <div class="color-field">
              <input id="configColorPrimarioPicker" type="color"
                value="${escaparAtributo(empresaActual.colorPrimario || "#1565c0")}" ${deshabilitado}>
              <input id="configColorPrimario" type="text" maxlength="7"
                value="${escaparAtributo(empresaActual.colorPrimario || "#1565c0")}" ${deshabilitado}>
            </div>
          </label>
          <label>
            <span>Color secundario</span>
            <div class="color-field">
              <input id="configColorSecundarioPicker" type="color"
                value="${escaparAtributo(empresaActual.colorSecundario || "#8bc34a")}" ${deshabilitado}>
              <input id="configColorSecundario" type="text" maxlength="7"
                value="${escaparAtributo(empresaActual.colorSecundario || "#8bc34a")}" ${deshabilitado}>
            </div>
          </label>
        </div>
        <div class="branding-informe-grid">
          <label class="branding-upload-card">
            <span>Logo para informes</span>
            <div class="branding-preview branding-preview-logo">
              ${empresaActual?.brandingInforme?.logoUrl
                ? `<img src="${escaparAtributo(empresaActual.brandingInforme.logoUrl)}" alt="Logo actual del informe">`
                : `<strong>Logo predeterminado de Vectaria</strong>`}
            </div>
            <input id="configLogoInforme" type="file" accept="image/png,image/jpeg,image/webp" ${deshabilitado}>
            <small>PNG, JPG o WebP. Máximo 2 MB. Se recomienda fondo transparente.</small>
            ${editable && empresaActual?.brandingInforme?.logoUrl ? `
              <button type="button" class="btn-eliminar-branding" id="btnEliminarLogoInforme">
                Eliminar logo personalizado
              </button>
            ` : ""}
          </label>

          <label class="branding-upload-card">
            <span>Imagen de portada</span>
            <div class="branding-preview branding-preview-portada">
              ${empresaActual?.brandingInforme?.portadaUrl
                ? `<img src="${escaparAtributo(empresaActual.brandingInforme.portadaUrl)}" alt="Portada actual del informe">`
                : `<strong>Se usará la primera evidencia disponible</strong>`}
            </div>
            <input id="configPortadaInforme" type="file" accept="image/png,image/jpeg,image/webp" ${deshabilitado}>
            <small>PNG, JPG o WebP. Máximo 5 MB. Formato horizontal recomendado.</small>
            ${editable && empresaActual?.brandingInforme?.portadaUrl ? `
              <button type="button" class="btn-eliminar-branding" id="btnEliminarPortadaInforme">
                Eliminar portada personalizada
              </button>
            ` : ""}
          </label>
        </div>
        <div class="config-info-note">
          Esta identidad se aplica solamente a los informes PDF de la empresa.
          No modifica la imagen general de Vectaria.
        </div>
      </section>

      <section class="config-panel">
        <h3>Plan y límites</h3>
        <div class="config-summary-grid">
          <div><span>Plan</span><strong>${empresaActual.plan || "-"}</strong></div>
          <div><span>Usuarios</span><strong>${empresaActual.maxUsuarios || "-"}</strong></div>
          <div><span>Sucursales</span><strong>${empresaActual.maxSucursales || "-"}</strong></div>
          <div><span>Storage contratado</span><strong>${empresaActual.maxStorageGB || "-"} GB</strong></div>
          <div><span>Storage utilizado</span><strong>${formatearAlmacenamiento(storageUsadoBytes)}</strong></div>
          <div><span>Archivos</span><strong>${Number(empresaActual.storageArchivos || 0)}</strong></div>
        </div>
        <div class="storage-usage" aria-label="Uso de almacenamiento">
          <div class="storage-usage-bar"><span style="width:${storagePorcentaje.toFixed(2)}%"></span></div>
          <small>${storagePorcentaje.toFixed(1)}% utilizado</small>
        </div>
        ${editable ? `<button type="button" class="btn-secondary" id="btnRecalcularStorage">Recalcular uso</button>` : ""}
        <p class="config-helper">El plan y sus límites solo pueden modificarse desde el panel del superadministrador.</p>
      </section>

      <section class="config-panel">
        <h3>Módulos habilitados</h3>
        <div class="config-module-list">
          ${modulosActivos.length
            ? modulosActivos.map(nombre => `<span>${nombre}</span>`).join("")
            : "<p>No hay módulos habilitados.</p>"}
        </div>
        <p class="config-helper">${modulosActivos.length} módulo(s) activo(s).</p>
      </section>

      ${["super_admin", "admin_empresa"].includes(usuarioActivo.rol) ? `
        <section class="config-panel config-export-panel">
          <div class="config-export-icon" aria-hidden="true">⇩</div>
          <div class="config-export-content">
            <h3>Exportación y respaldo</h3>
            <p>Descarga una copia organizada de toda la información de la empresa para entrega, migración o cierre del servicio.</p>
            <ul>
              <li>Índices CSV compatibles con Excel y respaldo íntegro en JSON.</li>
              <li>Resumen PDF, fotografías y documentos originales de cada OT.</li>
              <li>Usuarios, sucursales, clientes, equipos, inventario, programación, acreditaciones SHEQ, plantillas y pagos.</li>
            </ul>
            <div class="config-export-note">No modifica ni desbloquea las OT cerradas. El archivo temporal se elimina automáticamente después de 72 horas.</div>
          </div>
          <button type="button" class="btn-primary config-export-button" id="btnExportarEmpresa">Generar respaldo ZIP</button>
        </section>
        ${usuarioActivo.rol === "admin_empresa" && !cancelacionActiva ? `
          <section class="config-panel config-cancel-subscription">
            <div>
              <h3>Cancelar suscripción</h3>
              <p>Bloquea la operación y habilita un periodo de 30 días para descargar el respaldo antes de que el superadministrador pueda eliminar la empresa manualmente.</p>
            </div>
            <button type="button" class="btn-danger" id="btnSolicitarCancelacion">Solicitar cancelación</button>
          </section>
        ` : ""}
      ` : ""}
    </div>

    <div id="configPanelPlantillas" class="plantillas-panel" hidden>
      <div class="plantillas-encabezado">
        <h3>Plantillas de mantenimiento</h3>
        <p>Asocia cada gama de equipo con el checklist que se aplicará automáticamente al crear una OT.</p>
      </div>
      <div class="plantillas-grid">
        <form id="formPlantillaMantenimiento" class="config-panel plantilla-form">
          <h3>Crear plantilla</h3>
          <label><span>Equipo o gama</span>
            <input id="plantillaGama" type="text" maxlength="100" placeholder="Ej.: Bombas centrífugas" required ${deshabilitado}>
          </label>
          <label><span>Nombre de la plantilla</span>
            <input id="plantillaNombre" type="text" maxlength="140" placeholder="Ej.: Mantenimiento integral de bombas" required ${deshabilitado}>
          </label>
          <label><span>Archivo de checklist</span>
            <div class="plantilla-upload-zone">
              <strong>Archivo Excel del flujo completo</strong>
              <span>Hojas requeridas: ${etapasChecklistActivas.map(etapa => etapa.nombre).join(", ") || "ninguna etapa de checklist habilitada"}.</span>
              <input id="plantillaArchivo" type="file" accept=".xlsx,.xls" required ${deshabilitado}>
            </div>
          </label>
          ${editable ? '<button type="submit" class="btn-primary">Guardar plantilla</button>' : ''}
        </form>
        <section class="config-panel plantillas-listado">
          <div class="plantillas-listado-header">
            <h3>Plantillas configuradas</h3>
            <input id="buscarPlantilla" type="search" placeholder="Buscar por equipo o gama...">
          </div>
          <div id="listaPlantillasMantenimiento" class="plantillas-items"><p class="config-helper">Cargando plantillas...</p></div>
          <div class="config-info-note">Las nuevas OT utilizarán la versión activa. Las órdenes existentes conservarán su checklist original.</div>
        </section>
      </div>
    </div>
  `;

  conectarTabsConfiguracion();
  cargarPlantillasMantenimiento();

  if (!editable) return;

  conectarCamposColor("configColorPrimarioPicker", "configColorPrimario");
  conectarCamposColor("configColorSecundarioPicker", "configColorSecundario");
  conectarPreviewImagen("configLogoInforme", ".branding-preview-logo");
  conectarPreviewImagen("configPortadaInforme", ".branding-preview-portada");
  document.getElementById("btnEliminarLogoInforme")
    ?.addEventListener("click", () => eliminarImagenInforme("logo"));
  document.getElementById("btnEliminarPortadaInforme")
    ?.addEventListener("click", () => eliminarImagenInforme("portada"));
  document.getElementById("btnGuardarConfiguracionEmpresa")
    ?.addEventListener("click", guardarConfiguracionEmpresa);
  document.getElementById("btnRecalcularStorage")
    ?.addEventListener("click", recalcularAlmacenamientoEmpresa);
  document.getElementById("btnExportarEmpresa")
    ?.addEventListener("click", descargarExportacionEmpresa);
  document.getElementById("btnSolicitarCancelacion")
    ?.addEventListener("click", solicitarCancelacionEmpresa);
  document.getElementById("formPlantillaMantenimiento")
    ?.addEventListener("submit", guardarPlantillaMantenimiento);
}

function conectarTabsConfiguracion() {
  document.querySelectorAll("[data-config-tab]").forEach(boton => {
    boton.addEventListener("click", () => {
      const plantillas = boton.dataset.configTab === "plantillas";
      document.querySelectorAll("[data-config-tab]").forEach(item => item.classList.toggle("active", item === boton));
      document.getElementById("configPanelGeneral").hidden = plantillas;
      document.getElementById("configPanelPlantillas").hidden = !plantillas;
      const guardarGeneral = document.getElementById("btnGuardarConfiguracionEmpresa");
      if (guardarGeneral) guardarGeneral.hidden = plantillas;
    });
  });
}

const ETAPAS_CHECKLIST_PLANTILLA = [
  { key: "ingreso", nombre: "Ingreso", aliases: ["ingreso"] },
  { key: "evaluacion", nombre: "Evaluación", aliases: ["evaluacion"] },
  { key: "mantencion", nombre: "Mantención", aliases: ["mantencion", "mantenimiento", "overhaul"] },
  { key: "pruebas", nombre: "Pruebas", aliases: ["pruebas", "prueba"] }
];

function obtenerEtapasChecklistActivasEmpresa() {
  const modulos = obtenerModulosEmpresa(empresaActual);
  return ETAPAS_CHECKLIST_PLANTILLA.filter(etapa => modulos[etapa.key] === true);
}

function normalizarTextoPlantilla(valor) {
  return String(valor || "").trim().toLocaleLowerCase("es")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function itemsDesdeHoja(hoja) {
  if (!hoja) return [];
  return XLSX.utils.sheet_to_json(hoja, { header: 1 }).flat()
    .map(valor => String(valor ?? "").trim()).filter(Boolean).slice(0, 400)
    .map(item => ({ item: item.slice(0, 240) }));
}

function buscarHoja(workbook, aliases) {
  const nombre = workbook.SheetNames.find(item => aliases.includes(normalizarTextoPlantilla(item)));
  return nombre ? workbook.Sheets[nombre] : null;
}

async function procesarExcelPlantilla(archivo) {
  if (!window.XLSX) throw new Error("No fue posible cargar el lector de archivos Excel.");
  const workbook = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
  const modulos = obtenerModulosEmpresa(empresaActual);
  const checklists = {};
  const faltantes = [];
  const ignoradas = [];

  ETAPAS_CHECKLIST_PLANTILLA.forEach(etapa => {
    const items = itemsDesdeHoja(buscarHoja(workbook, etapa.aliases));
    const activa = modulos[etapa.key] === true;

    if (activa && !items.length) faltantes.push(etapa.nombre);
    if (!activa && items.length) ignoradas.push(etapa.nombre);
    checklists[etapa.key] = activa ? items : [];
  });

  if (faltantes.length) {
    throw new Error(`Faltan hojas requeridas o están vacías: ${faltantes.join(", ")}.`);
  }

  const total = Object.values(checklists).reduce((suma, items) => suma + items.length, 0);
  if (!total) throw new Error("La empresa no tiene etapas de checklist activas o el Excel no contiene actividades válidas.");

  const etapasHabilitadas = {
    ingreso: modulos.ingreso === true,
    evaluacion: modulos.evaluacion === true,
    mantencion: modulos.mantencion === true,
    pruebas: modulos.pruebas === true,
    despacho: modulos.despacho === true
  };

  return { checklists, total, etapasHabilitadas, ignoradas };
}

async function cargarPlantillasMantenimiento() {
  const lista = document.getElementById("listaPlantillasMantenimiento");
  if (!lista || !empresaActual?.id) return;
  try {
    const consulta = query(collection(db, "plantillasMantenimiento"), where("empresaId", "==", empresaActual.id));
    const snapshot = await getDocs(consulta);
    plantillasMantenimientoActuales = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(a.gama || "").localeCompare(String(b.gama || ""), "es"));
    renderPlantillasMantenimiento();
    document.getElementById("buscarPlantilla")?.addEventListener("input", renderPlantillasMantenimiento);
  } catch (error) {
    console.error("Error cargando plantillas:", error);
    lista.innerHTML = '<p class="config-helper">No fue posible cargar las plantillas.</p>';
  }
}

function renderPlantillasMantenimiento() {
  const lista = document.getElementById("listaPlantillasMantenimiento");
  if (!lista) return;
  const filtro = normalizarTextoPlantilla(document.getElementById("buscarPlantilla")?.value);
  const items = plantillasMantenimientoActuales.filter(item => !filtro || normalizarTextoPlantilla(`${item.gama} ${item.nombre}`).includes(filtro));
  if (!items.length) {
    lista.innerHTML = '<p class="plantillas-vacio">Aún no hay plantillas configuradas para esta empresa.</p>';
    return;
  }
  lista.innerHTML = items.map(item => `
    <article class="plantilla-item">
      <div class="plantilla-item-icon">▤</div>
      <div class="plantilla-item-info"><strong>${escaparAtributo(item.gama)}</strong><span>${escaparAtributo(item.nombre)}</span><small>Versión ${Number(item.version || 1)} · ${Number(item.totalActividades || 0)} actividades</small></div>
      <span class="plantilla-estado ${item.activa === false ? "inactiva" : ""}">${item.activa === false ? "INACTIVA" : "ACTIVA"}</span>
      ${puedeEditarConfiguracionEmpresa() ? `<button type="button" class="btn-secondary" data-eliminar-plantilla="${item.id}">Eliminar</button>` : ""}
    </article>`).join("");
  lista.querySelectorAll("[data-eliminar-plantilla]").forEach(boton => boton.addEventListener("click", () => eliminarPlantillaMantenimiento(boton.dataset.eliminarPlantilla)));
}

async function guardarPlantillaMantenimiento(evento) {
  evento.preventDefault();
  if (!empresaActual || !puedeEditarConfiguracionEmpresa()) return;
  const gama = document.getElementById("plantillaGama").value.trim();
  const nombre = document.getElementById("plantillaNombre").value.trim();
  const archivo = document.getElementById("plantillaArchivo").files?.[0];
  if (!gama || !nombre || !archivo) return alert("Completa la gama, el nombre y selecciona el archivo Excel.");
  if (archivo.size > 5 * 1024 * 1024) return alert("El archivo Excel no puede superar 5 MB.");
  const gamaNormalizada = normalizarTextoPlantilla(gama);
  if (plantillasMantenimientoActuales.some(item => item.activa !== false && item.gamaNormalizada === gamaNormalizada)) return alert("Ya existe una plantilla activa para esta gama.");
  const boton = evento.submitter;
  let documentoCreado = null;
  let referenciaArchivoCreado = null;
  try {
    boton.disabled = true; boton.textContent = "Procesando...";
    const { checklists, total, etapasHabilitadas, ignoradas } = await procesarExcelPlantilla(archivo);
    documentoCreado = await addDoc(collection(db, "plantillasMantenimiento"), {
      empresaId: empresaActual.id, gama, gamaNormalizada, nombre, version: 1, activa: true,
      checklists, etapasHabilitadas, totalActividades: total, archivoNombre: archivo.name,
      creadoPor: usuarioActivo.uid, fechaCreacion: serverTimestamp(), fechaActualizacion: serverTimestamp()
    });
    const ruta = `empresas/${empresaActual.id}/plantillas/${documentoCreado.id}/${Date.now()}-${archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const referencia = storageRef(storage, ruta);
    referenciaArchivoCreado = referencia;
    await uploadBytes(referencia, archivo, { contentType: archivo.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await updateDoc(documentoCreado, { archivoRuta: ruta, archivoUrl: await getDownloadURL(referencia) });
    evento.target.reset(); await cargarPlantillasMantenimiento();
    const avisoIgnoradas = ignoradas.length
      ? `\n\nSe ignoraron hojas de módulos desactivados: ${ignoradas.join(", ")}.`
      : "";
    alert(`Plantilla guardada correctamente. Ya está disponible al crear una OT.${avisoIgnoradas}`);
  } catch (error) {
    console.error("Error guardando plantilla:", error);
    if (referenciaArchivoCreado) await deleteObject(referenciaArchivoCreado).catch(() => {});
    if (documentoCreado) await deleteDoc(documentoCreado).catch(() => {});
    alert(error?.message || "No fue posible guardar la plantilla.");
  } finally {
    boton.disabled = false; boton.textContent = "Guardar plantilla";
  }
}

async function eliminarPlantillaMantenimiento(id) {
  const plantilla = plantillasMantenimientoActuales.find(item => item.id === id);
  if (!plantilla) return;
  const confirmado = await confirmarAccionAdmin({
    titulo: "Eliminar plantilla",
    mensaje: `Se eliminará la plantilla de ${plantilla.gama}. Las OT existentes conservarán su checklist.`,
    textoConfirmar: "Eliminar",
    peligrosa: true
  });
  if (!confirmado) return;
  try {
    if (plantilla.archivoRuta) await deleteObject(storageRef(storage, plantilla.archivoRuta)).catch(() => {});
    await deleteDoc(doc(db, "plantillasMantenimiento", id));
    await cargarPlantillasMantenimiento();
  } catch (error) {
    console.error("Error eliminando plantilla:", error); alert("No fue posible eliminar la plantilla.");
  }
}

function conectarPreviewImagen(inputId, selectorPreview) {
  const input = document.getElementById(inputId);
  const preview = document.querySelector(selectorPreview);
  if (!input || !preview) return;

  input.addEventListener("change", () => {
    const archivo = input.files?.[0];
    if (!archivo) return;
    const urlTemporal = URL.createObjectURL(archivo);
    preview.innerHTML = `<img src="${urlTemporal}" alt="Vista previa">`;
  });
}

function validarImagenInforme(archivo, maxMB, nombreCampo) {
  if (!archivo) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(archivo.type)) {
    throw new Error(`${nombreCampo}: selecciona una imagen PNG, JPG o WebP.`);
  }
  if (archivo.size > maxMB * 1024 * 1024) {
    throw new Error(`${nombreCampo}: el archivo no puede superar ${maxMB} MB.`);
  }
}

async function subirImagenInforme(archivo, nombreBase) {
  const resultadoCuota = evaluarCuotaStorage({
    usadoBytes: empresaActual.storageUsadoBytes,
    maxStorageGB: empresaActual.maxStorageGB,
    nuevoBytes: archivo.size
  });
  const mensajeCuota = mensajeCuotaStorage(resultadoCuota);
  if (!resultadoCuota.permitido) throw new Error(mensajeCuota);
  if (mensajeCuota) alert(mensajeCuota);

  const extension = archivo.name.split(".").pop()?.toLowerCase() || "img";
  const ruta = `empresas/${empresaActual.id}/informe/${nombreBase}.${extension}`;
  const referencia = storageRef(storage, ruta);
  await uploadBytes(referencia, archivo, { contentType: archivo.type });
  return {
    url: await getDownloadURL(referencia),
    ruta
  };
}

async function eliminarImagenInforme(tipo) {
  if (!empresaActual || !puedeEditarConfiguracionEmpresa()) return;

  const esLogo = tipo === "logo";
  const titulo = esLogo ? "logo" : "portada";
  const campoUrl = esLogo ? "logoUrl" : "portadaUrl";
  const campoRuta = esLogo ? "logoRuta" : "portadaRuta";
  const ruta = empresaActual?.brandingInforme?.[campoRuta];

  const mensaje = esLogo
    ? "¿Eliminar el logo personalizado? Los informes volverán a usar la identidad predeterminada de Vectaria."
    : "¿Eliminar la portada personalizada? Los informes volverán a utilizar la primera evidencia disponible.";

  const confirmado = await confirmarAccionAdmin({
    titulo: esLogo ? "Eliminar logo personalizado" : "Eliminar portada personalizada",
    mensaje,
    textoConfirmar: "Eliminar",
    peligrosa: true
  });
  if (!confirmado) return;

  const boton = document.getElementById(
    esLogo ? "btnEliminarLogoInforme" : "btnEliminarPortadaInforme"
  );

  try {
    if (boton) {
      boton.disabled = true;
      boton.textContent = "Eliminando...";
    }

    if (ruta) {
      try {
        await deleteObject(storageRef(storage, ruta));
      } catch (errorStorage) {
        if (errorStorage?.code !== "storage/object-not-found") throw errorStorage;
      }
    }

    const brandingInforme = { ...(empresaActual.brandingInforme || {}) };
    delete brandingInforme[campoUrl];
    delete brandingInforme[campoRuta];

    await updateDoc(doc(db, "empresas", empresaActual.id), {
      brandingInforme,
      fechaActualizacion: serverTimestamp()
    });

    empresaActual.brandingInforme = brandingInforme;
    window.empresaActualAdmin = empresaActual;
    alert(`La imagen de ${titulo} fue eliminada correctamente.`);
    renderVistaConfiguracionEmpresa();
  } catch (error) {
    console.error(`Error eliminando ${titulo} del informe:`, error);
    alert(`No fue posible eliminar la imagen de ${titulo}.`);
    if (boton) {
      boton.disabled = false;
      boton.textContent = esLogo
        ? "Eliminar logo personalizado"
        : "Eliminar portada personalizada";
    }
  }
}

function conectarCamposColor(pickerId, textoId) {
  const picker = document.getElementById(pickerId);
  const texto = document.getElementById(textoId);
  if (!picker || !texto) return;

  picker.addEventListener("input", () => {
    texto.value = picker.value;
  });

  texto.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(texto.value.trim())) {
      picker.value = texto.value.trim();
    }
  });
}

async function guardarConfiguracionEmpresa() {
  if (!empresaActual || !puedeEditarConfiguracionEmpresa()) return;

  const boton = document.getElementById("btnGuardarConfiguracionEmpresa");
  const datos = {
    nombre: document.getElementById("configEmpresaNombre").value.trim(),
    correo: document.getElementById("configEmpresaCorreo").value.trim(),
    telefono: document.getElementById("configEmpresaTelefono").value.trim(),
    ciudad: document.getElementById("configEmpresaCiudad").value.trim(),
    pais: document.getElementById("configEmpresaPais").value.trim(),
    direccion: document.getElementById("configEmpresaDireccion").value.trim(),
    colorPrimario: document.getElementById("configColorPrimario").value.trim().toLowerCase(),
    colorSecundario: document.getElementById("configColorSecundario").value.trim().toLowerCase()
  };

  if (!datos.nombre || !datos.correo) {
    alert("Nombre y correo de contacto son obligatorios.");
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)) {
    alert("Ingresa un correo de contacto válido.");
    return;
  }

  if (!/^#[0-9a-f]{6}$/i.test(datos.colorPrimario) || !/^#[0-9a-f]{6}$/i.test(datos.colorSecundario)) {
    alert("Los colores deben usar el formato hexadecimal #RRGGBB.");
    return;
  }

  try {
    if (boton) {
      boton.disabled = true;
      boton.textContent = "Guardando...";
    }

    const archivoLogo = document.getElementById("configLogoInforme")?.files?.[0];
    const archivoPortada = document.getElementById("configPortadaInforme")?.files?.[0];
    validarImagenInforme(archivoLogo, 2, "Logo del informe");
    validarImagenInforme(archivoPortada, 5, "Portada del informe");

    const rutaLogoAnterior = empresaActual?.brandingInforme?.logoRuta;
    const rutaPortadaAnterior = empresaActual?.brandingInforme?.portadaRuta;
    const brandingInforme = {
      ...(empresaActual.brandingInforme || {})
    };

    if (archivoLogo) {
      const subida = await subirImagenInforme(archivoLogo, "logo");
      brandingInforme.logoUrl = subida.url;
      brandingInforme.logoRuta = subida.ruta;
    }

    if (archivoPortada) {
      const subida = await subirImagenInforme(archivoPortada, "portada");
      brandingInforme.portadaUrl = subida.url;
      brandingInforme.portadaRuta = subida.ruta;
    }

    await updateDoc(doc(db, "empresas", empresaActual.id), {
      ...datos,
      brandingInforme,
      fechaActualizacion: serverTimestamp()
    });

    const rutasAntiguas = [
      archivoLogo && rutaLogoAnterior !== brandingInforme.logoRuta
        ? rutaLogoAnterior
        : null,
      archivoPortada && rutaPortadaAnterior !== brandingInforme.portadaRuta
        ? rutaPortadaAnterior
        : null
    ].filter(Boolean);

    for (const rutaAntigua of rutasAntiguas) {
      try {
        await deleteObject(storageRef(storage, rutaAntigua));
      } catch (errorStorage) {
        if (errorStorage?.code !== "storage/object-not-found") {
          console.warn("No fue posible limpiar una imagen corporativa anterior.", errorStorage);
        }
      }
    }

    Object.assign(empresaActual, datos, { brandingInforme });
    window.empresaActualAdmin = empresaActual;
    document.getElementById("nombreEmpresa").textContent = empresaActual.nombre;
    document.getElementById("tituloEmpresa").textContent = empresaActual.nombre;

    alert("Configuración actualizada correctamente.");
    renderVistaConfiguracionEmpresa();
  } catch (error) {
    console.error("Error actualizando configuración:", error);
    alert(error?.message || "No fue posible guardar la configuración.");
    if (boton) {
      boton.disabled = false;
      boton.textContent = "Guardar cambios";
    }
  }
}



function renderVistaPlaceholder(titulo, texto) {
  const cont = document.getElementById("vistaEmpresaContenido");
  if (!cont) return;

  cont.innerHTML = `
    <div class="section-header">
      <h2>${titulo}</h2>
    </div>

    <p>${texto}</p>
  `;
}


function configurarMenuMovilEmpresa() {
  const boton = document.querySelector(".mobile-menu-toggle");
  const fondo = document.querySelector(".mobile-menu-backdrop");
  const sidebar = document.getElementById("empresaAdminSidebar");
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
    if (evento.target.closest("li") || evento.target.closest("#btnSalidaEmpresa")) cambiarEstado(false);
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
    if (window.innerWidth > 900) cambiarEstado(false);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  configurarMenuMovilEmpresa();
  cargarEmpresa();
});
