import { renderVistaUsuariosEmpresa } from "./empresa/usuarios.js";

import { db } from "./firebase-config.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let empresaActual = null;
let empresaIdActual = null;

function obtenerEmpresaIdURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

async function cargarEmpresa() {
  empresaIdActual = obtenerEmpresaIdURL();

  if (!empresaIdActual) {
    alert("No se recibió ID de empresa");
    window.location.href = "super-admin.html";
    return;
  }

  try {
    const refEmpresa = doc(db, "empresas", empresaIdActual);
    const snap = await getDoc(refEmpresa);

    if (!snap.exists()) {
      alert("La empresa no existe");
      window.location.href = "super-admin.html";
      return;
    }

    empresaActual = {
      id: snap.id,
      ...snap.data()
    };

    window.empresaActualAdmin = empresaActual;
    window.empresaIdActualAdmin = empresaActual.id;

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

  renderVistaDashboardEmpresa();
}


window.cambiarVistaEmpresa = function (vista, elemento) {
  document.querySelectorAll(".sidebar li").forEach(li => {
    li.classList.remove("active");
  });

  if (elemento) {
    elemento.classList.add("active");
  }

  if (vista === "dashboard") {
    renderVistaDashboardEmpresa();
  }

  if (vista === "usuarios") {
    renderVistaUsuariosEmpresa();
  }

  if (vista === "sucursales") {
    renderVistaPlaceholder("Sucursales", "Aquí administraremos las sucursales de la empresa.");
  }

  if (vista === "clientes") {
    renderVistaPlaceholder("Clientes", "Aquí administraremos los clientes asociados a la empresa.");
  }

  if (vista === "equipos") {
    renderVistaPlaceholder("Equipos", "Aquí administraremos los equipos y activos del cliente.");
  }

  if (vista === "configuracion") {
    renderVistaPlaceholder("Configuración", "Aquí administraremos datos, colores, logo y plan de la empresa.");
  }
};



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



window.volverSuperAdmin = function () {
  window.location.href = "super-admin.html";
};

document.addEventListener("DOMContentLoaded", cargarEmpresa);
