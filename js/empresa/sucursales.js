import { abrirWizard } from "../components/wizard.js";
import { app, db } from "../firebase-config.js";

import {
  collection,
  doc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const functions = getFunctions(app, "us-central1");
const crearSucursalEmpresaSegura = httpsCallable(functions, "crearSucursalEmpresa");
const cambiarEstadoSucursalSeguro = httpsCallable(functions, "cambiarEstadoSucursal");

let sucursalesEmpresa = [];

const alert = (mensaje) => {
  const texto = String(mensaje || "");
  const tipo = /correctamente|creada/i.test(texto) ? "exito" : /error|no fue posible|no se encontró/i.test(texto) ? "error" : "advertencia";
  const titulo = tipo === "exito" ? "Operación completada" : tipo === "error" ? "No fue posible completar la acción" : "Revisa la información";
  if (window.OverTrackUI?.mostrarMensaje) return window.OverTrackUI.mostrarMensaje({ titulo, mensaje: texto, tipo });
  window.alert(texto);
  return Promise.resolve(true);
};

const confirmarSucursal = ({ titulo, mensaje, textoConfirmar }) => {
  if (window.OverTrackUI?.confirmarAccion) return window.OverTrackUI.confirmarAccion({ titulo, mensaje, tipo: "advertencia", textoConfirmar, textoCancelar: "Cancelar" });
  return Promise.resolve(window.confirm(mensaje));
};

export function renderVistaSucursalesEmpresa() {
  const cont = document.getElementById("vistaEmpresaContenido");
  if (!cont) return;

  cont.innerHTML = `
    <div class="section-header usuarios-header">
      <div>
        <h2>Sucursales</h2>
        <p class="section-subtitle">
          Administra los talleres o ubicaciones operativas de la empresa.
        </p>
      </div>

      <button class="btn-primary" onclick="abrirWizardSucursal()">
        + Crear Sucursal
      </button>
    </div>

    <div class="tabla-wrapper mobile-card-table">
      <table class="tabla-admin">
        <thead>
          <tr>
            <th>Sucursal</th>
            <th>Código</th>
            <th>Ciudad</th>
            <th>Dirección</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody id="tablaSucursalesEmpresa">
          <tr>
            <td colspan="6" class="tabla-vacia">Cargando sucursales...</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  cargarSucursalesEmpresa();
}

async function cargarSucursalesEmpresa() {
  const empresaId = window.empresaIdActualAdmin;
  const tbody = document.getElementById("tablaSucursalesEmpresa");
  if (!empresaId || !tbody) return;

  try {
    const consulta = query(
      collection(db, "sucursales"),
      where("empresaId", "==", empresaId)
    );

    const snap = await getDocs(consulta);
    sucursalesEmpresa = snap.docs.map(documento => ({
      id: documento.id,
      ...documento.data()
    }));

    sucursalesEmpresa.sort((a, b) =>
      (a.nombre || "").localeCompare(b.nombre || "", "es")
    );

    renderTablaSucursales();

    const kpi = document.getElementById("kpiSucursales");
    if (kpi) kpi.textContent = sucursalesEmpresa.length;

  } catch (error) {
    console.error("Error cargando sucursales:", error);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="tabla-vacia">Error cargando sucursales.</td>
      </tr>
    `;
  }
}

function renderTablaSucursales() {
  const tbody = document.getElementById("tablaSucursalesEmpresa");
  if (!tbody) return;

  if (!sucursalesEmpresa.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <div class="empty-icon">🏭</div>
            <h3>No existen sucursales todavía</h3>
            <p>Crea la primera ubicación operativa de la empresa.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = sucursalesEmpresa.map(sucursal => `
    <tr>
      <td data-label="Sucursal"><strong>${sucursal.nombre || "-"}</strong></td>
      <td data-label="Código">${sucursal.codigo || "-"}</td>
      <td data-label="Ciudad">${sucursal.ciudad || "-"}</td>
      <td data-label="Dirección">${sucursal.direccion || "-"}</td>
      <td data-label="Estado">
        <span class="${sucursal.activa ? "badge-activo" : "badge-inactivo"}">
          ${sucursal.activa ? "Activa" : "Inactiva"}
        </span>
      </td>
      <td data-label="Acciones">
        <div class="table-actions">
          <button
            class="${sucursal.activa ? "btn-danger" : "btn-primary"}"
            onclick="cambiarEstadoSucursal('${sucursal.id}', ${!sucursal.activa})"
          >
            ${sucursal.activa ? "Desactivar" : "Activar"}
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

window.abrirWizardSucursal = function () {
  const empresa = window.empresaActualAdmin;
  const maxSucursales = Number(empresa?.maxSucursales || 0);

  if (maxSucursales && sucursalesEmpresa.length >= maxSucursales) {
    alert(`La empresa alcanzó el máximo de ${maxSucursales} sucursales de su plan.`);
    return;
  }

  abrirWizard({
    titulo: "Crear Sucursal",
    pasos: [
      {
        titulo: "Identificación",
        render: () => `
          <label for="wizSucursalNombre">Nombre de la sucursal</label>
          <input type="text" id="wizSucursalNombre">

          <label for="wizSucursalCodigo">Código interno</label>
          <input type="text" id="wizSucursalCodigo" placeholder="STGO-01">
        `,
        collect: () => {
          const nombre = document.getElementById("wizSucursalNombre").value.trim();
          const codigo = document
            .getElementById("wizSucursalCodigo")
            .value.trim()
            .toUpperCase();

          if (!nombre || !codigo) {
            alert("Nombre y código son obligatorios");
            return false;
          }

          if (sucursalesEmpresa.some(item =>
            (item.codigo || "").toUpperCase() === codigo
          )) {
            alert("Ya existe una sucursal con ese código");
            return false;
          }

          return { nombre, codigo };
        }
      },
      {
        titulo: "Ubicación",
        render: () => `
          <label for="wizSucursalCiudad">Ciudad</label>
          <input type="text" id="wizSucursalCiudad">

          <label for="wizSucursalDireccion">Dirección</label>
          <input type="text" id="wizSucursalDireccion">

          <label for="wizSucursalTelefono">Teléfono</label>
          <input type="text" id="wizSucursalTelefono">
        `,
        collect: () => {
          const ciudad = document.getElementById("wizSucursalCiudad").value.trim();
          const direccion = document.getElementById("wizSucursalDireccion").value.trim();
          const telefono = document.getElementById("wizSucursalTelefono").value.trim();

          if (!ciudad) {
            alert("La ciudad es obligatoria");
            return false;
          }

          return { ciudad, direccion, telefono };
        }
      },
      {
        titulo: "Resumen",
        render: datos => `
          <h3>Resumen</h3>
          <p><strong>Nombre:</strong> ${datos.nombre}</p>
          <p><strong>Código:</strong> ${datos.codigo}</p>
          <p><strong>Ciudad:</strong> ${datos.ciudad}</p>
          <p><strong>Dirección:</strong> ${datos.direccion || "-"}</p>
        `
      }
    ],
    onFinish: crearSucursal
  });
};

async function crearSucursal(datos) {
  const empresaId = window.empresaIdActualAdmin;
  if (!empresaId) {
    alert("No se encontró la empresa actual");
    return;
  }

  try {
    await crearSucursalEmpresaSegura({
      empresaId,
      nombre: datos.nombre,
      codigo: datos.codigo,
      ciudad: datos.ciudad,
      direccion: datos.direccion || "",
      telefono: datos.telefono || ""
    });

    alert("Sucursal creada correctamente");
    await cargarSucursalesEmpresa();

  } catch (error) {
    console.error("Error creando sucursal:", error);
    alert(error?.message || "No fue posible crear la sucursal");
  }
}

window.cambiarEstadoSucursal = async function (sucursalId, nuevoEstado) {
  const sucursal = sucursalesEmpresa.find(item => item.id === sucursalId);
  if (!sucursal) return;

  const accion = nuevoEstado ? "activar" : "desactivar";
  if (!(await confirmarSucursal({
    titulo: `${nuevoEstado ? "Activar" : "Desactivar"} sucursal`,
    mensaje: nuevoEstado
      ? `¿Deseas ${accion} ${sucursal.nombre}? Sus trabajadores recuperarán el acceso operativo.`
      : `¿Deseas ${accion} ${sucursal.nombre}? Solo será posible si no tiene OT abiertas. Sus trabajadores conservarán sus cuentas, pero perderán temporalmente el acceso operativo.`,
    textoConfirmar: nuevoEstado ? "Activar" : "Desactivar"
  }))) return;

  try {
    await cambiarEstadoSucursalSeguro({
      sucursalId,
      activa: nuevoEstado
    });

    alert(nuevoEstado
      ? "Sucursal activada correctamente"
      : "Sucursal desactivada correctamente");
    await cargarSucursalesEmpresa();

  } catch (error) {
    console.error("Error cambiando estado de sucursal:", error);
    alert(error?.message || "No fue posible cambiar el estado de la sucursal");
  }
};
