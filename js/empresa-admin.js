import { renderVistaUsuariosEmpresa } from "./empresa/usuarios.js";
import { db } from "./firebase-config.js";
import { protegerPagina, cerrarSesion } from "./session.js";
import { aplicarModulosEnInterfaz, moduloActivo, obtenerModulosEmpresa} from "./modulos.js";

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getCountFromServer
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const usuarioActivo = protegerPagina([
    "super_admin",
    "admin_empresa",
    "admin_sucursal",
    "jefe_taller",
    "usuario_taller"
]);

if (!usuarioActivo) throw new Error("Acceso no autorizado");

let empresaActual = null;
let empresaIdActual = null;

function obtenerEmpresaIdURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function validarAccesoEmpresa() {

  if (!usuarioActivo) {
    window.location.href = "index.html";
    return false;
  }

  empresaIdActual = obtenerEmpresaIdURL();

  if (!empresaIdActual) {
    alert("No se recibió ID de empresa");
    window.location.href = "index.html";
    return false;
  }

  if (usuarioActivo.rol === "super_admin") {
    return true;
  }

  if (
    usuarioActivo.rol === "admin_empresa" &&
    usuarioActivo.empresaId === empresaIdActual
  ) {
    return true;
  }

  alert("No tienes permiso para acceder a esta empresa.");

  if (
    usuarioActivo.rol === "jefe_taller" ||
    usuarioActivo.rol === "usuario_taller"
  ) {
    window.location.href = "dashboard.html";
  } else {
    window.location.href = "index.html";
  }

  return false;
}

async function cargarEmpresa() {
  if (!validarAccesoEmpresa()) return;

  try {
    const refEmpresa = doc(db, "empresas", empresaIdActual);
    const snap = await getDoc(refEmpresa);

    if (!snap.exists()) {
      alert("La empresa no existe");
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

    renderKPIsEmpresa();
    cargarKPIsEmpresa();
    renderVistaDashboardEmpresa();
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

  if (!menuModulos) return;

  if (usuarioActivo.rol === "super_admin") {
    menuModulos.style.display = "";
  } else {
    menuModulos.style.display = "none";
  }
}


window.cambiarVistaEmpresa = function (vista, elemento) {
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
    renderVistaPlaceholder(
      "Sucursales",
      "Aquí administraremos las sucursales de la empresa."
    );

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
    renderVistaPlaceholder(
      "Configuración",
      "Aquí administraremos datos, módulos, colores, logo y plan de la empresa."
    );
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
    moduloActivo(empresaActual, kpi.modulo)
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

  window.location.href = "dashboard.html";
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

  if (moduloActivo(empresaActual, "sucursales")) {
    consultas.push(
      cargarConteoKPI({
        coleccion: "sucursales",
        empresaId,
        elementoId: "kpiSucursales"
      })
    );
  }

  if (moduloActivo(empresaActual, "clientes")) {
    consultas.push(
      cargarConteoKPI({
        coleccion: "clientes",
        empresaId,
        elementoId: "kpiClientes"
      })
    );
  }

  if (moduloActivo(empresaActual, "equipos")) {
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
    const consulta = query(
      collection(db, coleccion),
      where("empresaId", "==", empresaId)
    );

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
    nombre: "Órdenes de Servicio",
    descripcion: "Creación, seguimiento y cierre de órdenes de servicio.",
    icono: "📋"
  },
  {
    key: "checklists",
    nombre: "Checklists",
    descripcion: "Listas de verificación por etapa del proceso de mantención.",
    icono: "✅"
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
              ${modulos[modulo.key] ? "checked" : ""}
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

  const confirmar = confirm(
    `¿Guardar la nueva configuración de módulos para ${empresaActual.nombre}?`
  );

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


document.addEventListener("DOMContentLoaded", cargarEmpresa);
