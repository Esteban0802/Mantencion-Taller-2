import { abrirWizard } from "./components/wizard.js";

import { db } from "./firebase-config.js";

import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let empresas = [];

window.abrirModalEmpresa = function () {
  abrirWizard({
    titulo: "Crear Empresa",
    pasos: [
      {
        titulo: "Empresa",
        render: () => `
          <label for="wizEmpresaNombre">Nombre empresa</label>
          <input type="text" id="wizEmpresaNombre">

          <label for="wizEmpresaRut">RUT</label>
          <input type="text" id="wizEmpresaRut">

          <label for="wizEmpresaGiro">Giro</label>
          <input type="text" id="wizEmpresaGiro">
        `,
        collect: () => {
          const nombre = document.getElementById("wizEmpresaNombre").value.trim();
          const rut = document.getElementById("wizEmpresaRut").value.trim();
          const giro = document.getElementById("wizEmpresaGiro").value.trim();

          if (!nombre || !rut) {
            alert("Nombre y RUT son obligatorios");
            return false;
          }

          return { nombre, rut, giro };
        }
      },
      {
        titulo: "Contacto",
        render: () => `
          <label for="wizEmpresaCorreo">Correo contacto</label>
          <input type="email" id="wizEmpresaCorreo">

          <label for="wizEmpresaTelefono">Teléfono</label>
          <input type="text" id="wizEmpresaTelefono">

          <label for="wizEmpresaCiudad">Ciudad</label>
          <input type="text" id="wizEmpresaCiudad">
        `,
        collect: () => ({
          correo: document.getElementById("wizEmpresaCorreo").value.trim(),
          telefono: document.getElementById("wizEmpresaTelefono").value.trim(),
          ciudad: document.getElementById("wizEmpresaCiudad").value.trim()
        })
      },
      {
        titulo: "Plan",
        render: () => `
          <label for="wizEmpresaPlan">Plan</label>
          <select id="wizEmpresaPlan">
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
        `,
        collect: () => ({
          plan: document.getElementById("wizEmpresaPlan").value
        })
      },
      {
        titulo: "Resumen",
        render: (datos) => `
          <h3>Resumen de Empresa</h3>
          <p><strong>Nombre:</strong> ${datos.nombre}</p>
          <p><strong>RUT:</strong> ${datos.rut}</p>
          <p><strong>Giro:</strong> ${datos.giro || "-"}</p>
          <p><strong>Correo:</strong> ${datos.correo || "-"}</p>
          <p><strong>Teléfono:</strong> ${datos.telefono || "-"}</p>
          <p><strong>Ciudad:</strong> ${datos.ciudad || "-"}</p>
          <p><strong>Plan:</strong> ${datos.plan}</p>
        `
      }
    ],
    onFinish: crearEmpresaDesdeWizard
  });
};



async function crearEmpresaDesdeWizard(datos) {
  try {
    const nuevaEmpresa = {
      nombre: datos.nombre,
      rut: datos.rut,
      giro: datos.giro || "",
      telefono: datos.telefono || "",
      correo: datos.correo,
      sitioWeb: "",
      direccion: "",
      ciudad: datos.ciudad || "",
      pais: "Chile",

      logo: "",

      colorPrimario: "#2563eb",
      colorSecundario: "#f97316",

      plan: datos.plan,

      activa: true,

      maxUsuarios: datos.plan === "enterprise" ? 200 : datos.plan === "professional" ? 50 : 10,
      maxSucursales: datos.plan === "enterprise" ? 20 : datos.plan === "professional" ? 5 : 1,
      maxStorageGB: datos.plan === "enterprise" ? 100 : datos.plan === "professional" ? 25 : 5,

      observaciones: "",

      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp()
    };

    await addDoc(collection(db, "empresas"), nuevaEmpresa);

    alert("Empresa creada correctamente");
    await cargarEmpresas();

  } catch (error) {
    console.error("Error creando empresa:", error);
    alert("Error al crear empresa");
  }
}


function renderEmpresas() {
  const cont = document.getElementById("listaEmpresas");
  if (!cont) return;

  if (!empresas.length) {
    cont.innerHTML = `<p>No hay empresas registradas.</p>`;
    return;
  }

  cont.innerHTML = empresas.map(emp => `
    <div class="empresa-card">

      <div class="empresa-info">
        <h3>${emp.nombre || "Empresa sin nombre"}</h3>

        <div class="empresa-meta">
          <span>RUT: ${emp.rut || "-"}</span>
          <span>Plan: ${emp.plan || "-"}</span>
          <span>Usuarios máx: ${emp.maxUsuarios || "-"}</span>
          <span>Sucursales máx: ${emp.maxSucursales || "-"}</span>
          <span>Storage: ${emp.maxStorageGB || "-"} GB</span>
        </div>

        <p>${emp.correo || "Sin correo registrado"}</p>
      </div>

      <div class="empresa-actions">
        <span class="empresa-estado ${emp.activa ? "activa" : "inactiva"}">
          ${emp.activa ? "Activa" : "Inactiva"}
        </span>

        <button class="btn-primary" onclick="verEmpresa('${emp.id}')">
            Administrar
        </button>

        <button class="btn-danger" onclick="eliminarEmpresa('${emp.id}')">
          Eliminar
        </button>
      </div>

    </div>
  `).join("");
}


async function cargarEmpresas() {
  const cont = document.getElementById("listaEmpresas");
  if (!cont) return;

  cont.innerHTML = "Cargando empresas...";

  try {
    const snap = await getDocs(collection(db, "empresas"));

    empresas = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    renderEmpresas();
    renderKPIs();

  } catch (error) {
    console.error("Error cargando empresas:", error);
    cont.innerHTML = "<p>Error cargando empresas.</p>";
  }
}



function renderKPIs() {
  const totalEmpresas = document.getElementById("totalEmpresas");
  const totalUsuarios = document.getElementById("totalUsuarios");
  const totalSucursales = document.getElementById("totalSucursales");
  const totalOS = document.getElementById("totalOS");

  if (totalEmpresas) totalEmpresas.textContent = empresas.length;
  if (totalUsuarios) totalUsuarios.textContent = "0";
  if (totalSucursales) totalSucursales.textContent = "0";
  if (totalOS) totalOS.textContent = "0";
}

window.logout = function () {
  localStorage.removeItem("usuarioActivo");
  window.location.href = "index.html";
};

document.addEventListener("DOMContentLoaded", cargarEmpresas);



window.verEmpresa = function (empresaId) {
  window.location.href = `empresa-admin.html?id=${empresaId}`;
};

window.eliminarEmpresa = async function (empresaId) {
  const confirmar = confirm("¿Eliminar esta empresa de prueba?");

  if (!confirmar) return;

  alert("Luego conectaremos la eliminación con Firestore.");
};