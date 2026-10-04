import { abrirWizard } from "../components/wizard.js";
import { app, auth, db } from "../firebase-config.js";

import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const functions = getFunctions(app, "us-central1");
const crearUsuarioEmpresaSeguro = httpsCallable(functions, "crearUsuarioEmpresa");
const cambiarEstadoUsuarioSeguro = httpsCallable(functions, "cambiarEstadoUsuario");
const actualizarSucursalUsuarioSeguro = httpsCallable(functions, "actualizarSucursalUsuario");
const eliminarUsuarioEmpresaSeguro = httpsCallable(functions, "eliminarUsuarioEmpresa");

let usuariosEmpresa = [];
let sucursalesEmpresa = [];
const usuarioActivo = JSON.parse(localStorage.getItem("usuarioActivo") || "null");

const alert = (mensaje) => {
  const texto = String(mensaje || "");
  const tipo = /correctamente|cread[ao]|activad[ao]|desactivad[ao]|eliminad[ao]/i.test(texto)
    ? "exito"
    : /error|no fue posible|no se encontró/i.test(texto)
      ? "error"
      : "advertencia";
  const titulo = tipo === "exito" ? "Operación completada" : tipo === "error" ? "No fue posible completar la acción" : "Revisa la información";
  if (window.OverTrackUI?.mostrarMensaje) return window.OverTrackUI.mostrarMensaje({ titulo, mensaje: texto, tipo });
  window.alert(texto);
  return Promise.resolve(true);
};

const confirmarUsuario = ({ titulo, mensaje, textoConfirmar, peligrosa = false }) => {
  if (window.OverTrackUI?.confirmarAccion) return window.OverTrackUI.confirmarAccion({ titulo, mensaje, tipo: "advertencia", textoConfirmar, textoCancelar: "Cancelar", peligrosa });
  return Promise.resolve(window.confirm(mensaje));
};


function asegurarEstilosCredencialesTemporales() {
  if (document.getElementById("estilosCredencialesTemporales")) return;

  const estilos = document.createElement("style");
  estilos.id = "estilosCredencialesTemporales";
  estilos.textContent = `
    .credenciales-overlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(15, 23, 42, 0.58);
      backdrop-filter: blur(4px);
    }

    .credenciales-modal {
      width: min(520px, 100%);
      padding: 26px;
      border: 1px solid #d7e2ec;
      border-radius: 20px;
      background: #ffffff;
      box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24);
      color: #0f1f33;
    }

    .credenciales-modal h2 { margin: 0 0 8px; }
    .credenciales-modal > p { margin: 0 0 20px; color: #607d8b; }

    .credencial-grupo { margin-bottom: 14px; }
    .credencial-grupo label {
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 700;
    }

    .credencial-campo {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
    }

    .credencial-campo input {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      padding: 11px 12px;
      border: 1px solid #cbd9e5;
      border-radius: 10px;
      background: #f7fafc;
      color: #0f1f33;
      font: inherit;
    }

    .credencial-copiar,
    .credencial-copiar-todo,
    .credencial-cerrar {
      padding: 10px 14px;
      border: 0;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 700;
    }

    .credencial-copiar,
    .credencial-cerrar { background: #1565c0; color: #fff; }
    .credencial-copiar-todo { background: #8bc34a; color: #102033; }

    .credencial-aviso {
      margin: 18px 0;
      padding: 12px 14px;
      border: 1px solid #f2c46d;
      border-radius: 10px;
      background: #fff8e8;
      color: #8a5a00;
      font-size: 13px;
      line-height: 1.45;
    }

    .credencial-estado { min-height: 20px; color: #16803c; font-size: 13px; }
    .credencial-acciones { display: flex; justify-content: flex-end; gap: 10px; }

    @media (max-width: 520px) {
      .credencial-campo { grid-template-columns: 1fr; }
      .credencial-acciones { flex-direction: column; }
    }
  `;

  document.head.appendChild(estilos);
}


async function copiarTextoSeguro(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(texto);
    return;
  }

  const auxiliar = document.createElement("textarea");
  auxiliar.value = texto;
  auxiliar.setAttribute("readonly", "");
  auxiliar.style.position = "fixed";
  auxiliar.style.opacity = "0";
  document.body.appendChild(auxiliar);
  auxiliar.select();

  const copiado = document.execCommand("copy");
  auxiliar.remove();

  if (!copiado) throw new Error("No fue posible copiar el texto");
}


function mostrarCredencialesTemporales(correo, passwordTemporal) {
  asegurarEstilosCredencialesTemporales();

  document.querySelector(".credenciales-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "credenciales-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "tituloCredencialesTemporales");
  overlay.innerHTML = `
    <div class="credenciales-modal">
      <h2 id="tituloCredencialesTemporales">Usuario creado correctamente</h2>
      <p>Entrega estas credenciales iniciales al nuevo usuario.</p>

      <div class="credencial-grupo">
        <label for="credencialCorreo">Correo</label>
        <div class="credencial-campo">
          <input id="credencialCorreo" type="text" readonly>
          <button type="button" class="credencial-copiar" data-copiar="correo">Copiar</button>
        </div>
      </div>

      <div class="credencial-grupo">
        <label for="credencialPassword">Contraseña temporal</label>
        <div class="credencial-campo">
          <input id="credencialPassword" type="text" readonly>
          <button type="button" class="credencial-copiar" data-copiar="password">Copiar</button>
        </div>
      </div>

      <div class="credencial-aviso">
        Guarda o copia la contraseña ahora. Por seguridad, no volverá a mostrarse al cerrar esta ventana.
      </div>

      <div class="credencial-estado" aria-live="polite"></div>

      <div class="credencial-acciones">
        <button type="button" class="credencial-copiar-todo">Copiar ambas credenciales</button>
        <button type="button" class="credencial-cerrar">Cerrar</button>
      </div>
    </div>
  `;

  const inputCorreo = overlay.querySelector("#credencialCorreo");
  const inputPassword = overlay.querySelector("#credencialPassword");
  const estado = overlay.querySelector(".credencial-estado");
  inputCorreo.value = correo;
  inputPassword.value = passwordTemporal;

  async function copiar(texto, mensaje) {
    try {
      await copiarTextoSeguro(texto);
      estado.textContent = mensaje;
    } catch (error) {
      console.error("Error copiando credenciales:", error);
      estado.textContent = "No fue posible copiar automáticamente. Selecciona el texto manualmente.";
    }
  }

  overlay.querySelector('[data-copiar="correo"]').onclick = () =>
    copiar(correo, "Correo copiado.");

  overlay.querySelector('[data-copiar="password"]').onclick = () =>
    copiar(passwordTemporal, "Contraseña temporal copiada.");

  overlay.querySelector(".credencial-copiar-todo").onclick = () =>
    copiar(
      `Correo: ${correo}\nContraseña temporal: ${passwordTemporal}`,
      "Correo y contraseña copiados."
    );

  const cerrar = () => overlay.remove();
  overlay.querySelector(".credencial-cerrar").onclick = cerrar;
  overlay.addEventListener("click", event => {
    if (event.target === overlay) cerrar();
  });

  document.body.appendChild(overlay);
  inputPassword.focus();
  inputPassword.select();
}


export function renderVistaUsuariosEmpresa() {
  const cont = document.getElementById("vistaEmpresaContenido");
  if (!cont) return;

  cont.innerHTML = `
    <div class="section-header usuarios-header">
      <div>
        <h2>Usuarios de la Empresa</h2>
        <p class="section-subtitle">
          Administra responsables de empresa, administradores de sucursal, jefes de taller y técnicos.
        </p>
      </div>

      <button class="btn-primary" onclick="abrirWizardUsuario()">
        + Crear Usuario
      </button>
    </div>

    <div class="toolbar-usuarios">
      <input
        type="text"
        id="buscarUsuarioEmpresa"
        placeholder="Buscar usuario por nombre o correo..."
        oninput="filtrarUsuariosEmpresa()"
      >

      <select id="filtroRolUsuario" onchange="filtrarUsuariosEmpresa()">
        <option value="">Todos los roles</option>
        <option value="admin_empresa">Administrador Empresa</option>
        <option value="admin_sucursal">Administrador Sucursal</option>
        <option value="jefe_taller">Jefe de Taller</option>
        <option value="supervisor">Supervisor</option>
        <option value="tecnico">Técnico</option>
        <option value="planificador">Planificador</option>
        <option value="bodeguero">Bodeguero</option>
        <option value="sheq">SHEQ</option>
      </select>
    </div>

    <div class="tabla-wrapper mobile-card-table">
      <table class="tabla-admin">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Correo</th>
            <th>Rol</th>
            <th>Sucursal</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>

        <tbody id="tablaUsuariosEmpresa">
          <tr>
            <td colspan="6" class="tabla-vacia">Cargando usuarios...</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  cargarUsuariosEmpresa();
}

async function cargarUsuariosEmpresa() {
  const empresaId = window.empresaIdActualAdmin;
  const tbody = document.getElementById("tablaUsuariosEmpresa");

  if (!empresaId || !tbody) return;

  try {
    const restriccionesUsuarios = [where("empresaId", "==", empresaId)];
    if (usuarioActivo?.rol === "admin_sucursal") {
      restriccionesUsuarios.push(where("sucursalId", "==", usuarioActivo.sucursalId));
    }
    const q = query(collection(db, "usuarios"), ...restriccionesUsuarios);

    const promesaSucursales = usuarioActivo?.rol === "admin_sucursal"
      ? getDoc(doc(db, "sucursales", usuarioActivo.sucursalId))
      : getDocs(query(
          collection(db, "sucursales"),
          where("empresaId", "==", empresaId)
        ));

    const [snap, snapSucursales] = await Promise.all([
      getDocs(q),
      promesaSucursales
    ]);

    const documentosSucursales = usuarioActivo?.rol === "admin_sucursal"
      ? (snapSucursales.exists() ? [snapSucursales] : [])
      : snapSucursales.docs;
    sucursalesEmpresa = documentosSucursales.map(documento => ({
      id: documento.id,
      ...documento.data()
    }));

    usuariosEmpresa = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    renderTablaUsuariosEmpresa(usuariosEmpresa);

    const kpiUsuarios = document.getElementById("kpiUsuarios");
    if (kpiUsuarios) kpiUsuarios.textContent = usuariosEmpresa.length;

  } catch (error) {
    console.error("Error cargando usuarios:", error);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="tabla-vacia">
          Error cargando usuarios.
        </td>
      </tr>
    `;
  }
}

function renderTablaUsuariosEmpresa(lista) {
  const tbody = document.getElementById("tablaUsuariosEmpresa");
  if (!tbody) return;

  if (!lista.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <div class="empty-icon">👥</div>
            <h3>No existen usuarios todavía</h3>
            <p>Presiona “Crear Usuario” para agregar administradores, jefes o técnicos.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = lista.map(usuario => {
    const requiereSucursal = ["admin_sucursal", "jefe_taller", "usuario_taller", "supervisor", "tecnico", "planificador", "bodeguero", "sheq"].includes(usuario.rol);
    const pendienteSucursal = requiereSucursal && !usuario.sucursalId;
    const puedeCambiarSucursal = ["super_admin", "admin_empresa"].includes(usuarioActivo?.rol) && requiereSucursal;

    return `
    <tr>
      <td data-label="Usuario">
        <strong>${usuario.nombreCompleto || usuario.nombre || "-"}</strong>
      </td>

      <td data-label="Correo">${usuario.correo || "-"}</td>

      <td data-label="Rol">
        <span class="badge-rol">
          ${formatearRol(usuario.rol)}
        </span>
      </td>

      <td data-label="Sucursal">${nombreSucursal(usuario.sucursalId)}</td>

      <td data-label="Estado">
        <span class="${!usuario.activo || pendienteSucursal ? "badge-inactivo" : "badge-activo"}">
          ${usuario.suspendidoPorSucursal
            ? "Sucursal inactiva"
            : !usuario.activo
              ? "Inactivo"
              : pendienteSucursal
                ? "Pendiente de asignación"
                : "Activo"}
        </span>
      </td>

      <td data-label="Acciones">
        <div class="table-actions">
          ${puedeCambiarSucursal ? `
            <button class="btn-secondary" onclick="abrirAsignacionSucursal('${usuario.uid}')">
              ${usuario.sucursalId ? "Cambiar sucursal" : "Asignar sucursal"}
            </button>
          ` : ""}
          <button
            class="${usuario.activo ? "btn-danger" : "btn-primary"}"
            onclick="cambiarEstadoUsuarioEmpresa('${usuario.uid}', ${!usuario.activo})"
            ${usuario.suspendidoPorSucursal
              ? "disabled title=\"Activa la sucursal para recuperar su acceso\""
              : auth.currentUser?.uid === usuario.uid
                ? "disabled title=\"No puedes desactivar tu propia cuenta\""
                : ""}
          >
            ${usuario.suspendidoPorSucursal ? "Acceso suspendido" : usuario.activo ? "Desactivar" : "Activar"}
          </button>
          ${auth.currentUser?.uid !== usuario.uid ? `
            <button class="btn-danger" onclick="eliminarUsuarioEmpresa('${usuario.uid}')">
              Eliminar
            </button>
          ` : ""}
        </div>
      </td>
    </tr>
  `;
  }).join("");
}

function asegurarEstilosAsignacionSucursal() {
  if (document.getElementById("estilosAsignacionSucursal")) return;
  const estilos = document.createElement("style");
  estilos.id = "estilosAsignacionSucursal";
  estilos.textContent = `
    .asignacion-overlay {
      position: fixed; inset: 0; z-index: 10000; display: flex;
      align-items: center; justify-content: center; padding: 20px;
      background: rgba(15, 23, 42, .58); backdrop-filter: blur(4px);
    }
    .asignacion-modal {
      width: min(520px, 100%); padding: 26px; border: 1px solid #d7e2ec;
      border-radius: 20px; background: #fff; color: #0f1f33;
      box-shadow: 0 24px 70px rgba(15, 23, 42, .24);
    }
    .asignacion-modal h2 { margin: 0 0 8px; }
    .asignacion-modal p { margin: 0 0 20px; color: #607d8b; line-height: 1.5; }
    .asignacion-modal label { display: block; margin-bottom: 7px; font-weight: 700; }
    .asignacion-modal select {
      width: 100%; box-sizing: border-box; padding: 12px 14px;
      border: 1px solid #cbd9e5; border-radius: 10px; background: #fff;
      color: #0f1f33; font: inherit;
    }
    .asignacion-aviso {
      margin-top: 16px; padding: 12px 14px; border: 1px solid #b9d7f5;
      border-radius: 10px; background: #eef7ff; color: #315a7d;
      font-size: 13px; line-height: 1.45;
    }
    .asignacion-acciones { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
    .asignacion-acciones button { padding: 10px 16px; border-radius: 10px; font-weight: 700; cursor: pointer; }
    .asignacion-cancelar { border: 1px solid #cbd9e5; background: #fff; color: #334155; }
    .asignacion-guardar { border: 0; background: #1565c0; color: #fff; }
    @media (max-width: 520px) { .asignacion-acciones { flex-direction: column-reverse; } }
  `;
  document.head.appendChild(estilos);
}

window.abrirAsignacionSucursal = function (uid) {
  const usuario = usuariosEmpresa.find(item => item.uid === uid);
  if (!usuario) {
    alert("No se encontró el usuario seleccionado");
    return;
  }

  asegurarEstilosAsignacionSucursal();
  document.querySelector(".asignacion-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "asignacion-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="asignacion-modal">
      <h2>${usuario.sucursalId ? "Cambiar sucursal" : "Asignar sucursal"}</h2>
      <p>${usuario.nombreCompleto || usuario.nombre || usuario.correo}</p>
      <label for="sucursalUsuarioSeleccionada">Sucursal</label>
      <select id="sucursalUsuarioSeleccionada">
        <option value="">Sin sucursal asignada</option>
        ${sucursalesEmpresa
          .filter(sucursal => sucursal.activa === true)
          .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"))
          .map(sucursal => `
            <option value="${sucursal.id}" ${sucursal.id === usuario.sucursalId ? "selected" : ""}>
              ${sucursal.nombre} (${sucursal.codigo || sucursal.id})
            </option>
          `).join("")}
      </select>
      <div class="asignacion-aviso">
        Si queda sin sucursal, podrá ingresar al sistema pero no tendrá acceso operativo a las órdenes de trabajo.
        Su historial anterior no será modificado.
      </div>
      <div class="asignacion-acciones">
        <button type="button" class="asignacion-cancelar">Cancelar</button>
        <button type="button" class="asignacion-guardar">Guardar asignación</button>
      </div>
    </div>
  `;

  const cerrar = () => overlay.remove();
  overlay.querySelector(".asignacion-cancelar").addEventListener("click", cerrar);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) cerrar();
  });
  overlay.querySelector(".asignacion-guardar").addEventListener("click", async () => {
    const nuevaSucursalId = overlay.querySelector("#sucursalUsuarioSeleccionada").value;
    if (nuevaSucursalId === (usuario.sucursalId || "")) {
      cerrar();
      return;
    }

    const destino = nombreSucursal(nuevaSucursalId);
    const confirmado = await confirmarUsuario({
      titulo: nuevaSucursalId ? "Confirmar asignación" : "Dejar usuario sin sucursal",
      mensaje: nuevaSucursalId
        ? `El usuario tendrá acceso operativo a ${destino}. Su historial anterior se conservará.`
        : "El usuario quedará pendiente de asignación y sin acceso operativo a las órdenes de trabajo.",
      textoConfirmar: "Confirmar"
    });
    if (!confirmado) return;

    const boton = overlay.querySelector(".asignacion-guardar");
    boton.disabled = true;
    boton.textContent = "Guardando...";
    try {
      await actualizarSucursalUsuarioSeguro({ usuarioId: uid, sucursalId: nuevaSucursalId });
      cerrar();
      await alert("Sucursal actualizada correctamente");
      await cargarUsuariosEmpresa();
    } catch (error) {
      console.error("Error actualizando la sucursal del usuario:", error);
      await alert(error?.message || "No fue posible actualizar la sucursal");
      boton.disabled = false;
      boton.textContent = "Guardar asignación";
    }
  });

  document.body.appendChild(overlay);
  overlay.querySelector("#sucursalUsuarioSeleccionada").focus();
};

window.filtrarUsuariosEmpresa = function () {
  const texto = document.getElementById("buscarUsuarioEmpresa")?.value.toLowerCase() || "";
  const rol = document.getElementById("filtroRolUsuario")?.value || "";

  const filtrados = usuariosEmpresa.filter(usuario => {
    const coincideTexto =
      (usuario.nombreCompleto || "").toLowerCase().includes(texto) ||
      (usuario.correo || "").toLowerCase().includes(texto);

    const coincideRol = !rol || usuario.rol === rol;

    return coincideTexto && coincideRol;
  });

  renderTablaUsuariosEmpresa(filtrados);
};

window.cambiarEstadoUsuarioEmpresa = async function (uid, nuevoEstado) {
  const usuario = usuariosEmpresa.find(item => item.uid === uid);

  if (!usuario) {
    alert("No se encontró el usuario seleccionado");
    return;
  }

  if (auth.currentUser?.uid === uid && nuevoEstado === false) {
    alert("No puedes desactivar tu propia cuenta");
    return;
  }

  const accion = nuevoEstado ? "activar" : "desactivar";
  const nombre =
    usuario.nombreCompleto || usuario.nombre || usuario.correo || "este usuario";

  const confirmado = await confirmarUsuario({
    titulo: `${nuevoEstado ? "Activar" : "Desactivar"} usuario`,
    mensaje: `¿Deseas ${accion} a ${nombre}?`,
    textoConfirmar: nuevoEstado ? "Activar" : "Desactivar"
  });

  if (!confirmado) return;

  try {
    await cambiarEstadoUsuarioSeguro({
      usuarioId: uid,
      activo: nuevoEstado
    });

    alert(
      nuevoEstado
        ? "Usuario activado correctamente"
        : "Usuario desactivado correctamente"
    );

    await cargarUsuariosEmpresa();

  } catch (error) {
    console.error("Error cambiando estado del usuario:", error);
    alert(error?.message || "No fue posible cambiar el estado del usuario");
  }
};

window.eliminarUsuarioEmpresa = async function (uid) {
  const usuario = usuariosEmpresa.find(item => item.uid === uid);
  if (!usuario) {
    alert("No se encontró el usuario seleccionado");
    return;
  }

  if (auth.currentUser?.uid === uid) {
    alert("No puedes eliminar tu propia cuenta");
    return;
  }

  const nombre = usuario.nombreCompleto || usuario.correo || "este usuario";
  if (!(await confirmarUsuario({
    titulo: "Eliminar usuario",
    mensaje: `Se eliminará definitivamente a ${nombre}. Esta acción no se puede deshacer.`,
    textoConfirmar: "Eliminar",
    peligrosa: true
  }))) {
    return;
  }

  try {
    await eliminarUsuarioEmpresaSeguro({ usuarioId: uid });
    alert("Usuario eliminado correctamente");
    await cargarUsuariosEmpresa();
  } catch (error) {
    console.error("Error eliminando usuario:", error);
    alert(error?.message || "No fue posible eliminar el usuario");
  }
};

window.abrirWizardUsuario = async function () {
  try {
    const empresaId = window.empresaIdActualAdmin;
    const resultadoSucursales = usuarioActivo?.rol === "admin_sucursal"
      ? await getDoc(doc(db, "sucursales", usuarioActivo.sucursalId))
      : await getDocs(query(
          collection(db, "sucursales"),
          where("empresaId", "==", empresaId)
        ));
    const documentosSucursales = usuarioActivo?.rol === "admin_sucursal"
      ? (resultadoSucursales.exists() ? [resultadoSucursales] : [])
      : resultadoSucursales.docs;
    sucursalesEmpresa = documentosSucursales
      .map(documento => ({ id: documento.id, ...documento.data() }))
      .filter(sucursal => sucursal.activa === true)
      .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
  } catch (error) {
    console.error("Error cargando sucursales para el usuario:", error);
    alert("No fue posible cargar las sucursales");
    return;
  }

  abrirWizard({
    titulo: "Crear Usuario",
    pasos: [
      {
        titulo: "Datos",
        render: () => `
          <label for="wizNombreUsuario">Nombre</label>
          <input type="text" id="wizNombreUsuario">

          <label for="wizApellidoUsuario">Apellido</label>
          <input type="text" id="wizApellidoUsuario">

          <label for="wizCorreoUsuario">Correo</label>
          <input type="email" id="wizCorreoUsuario">
        `,
        collect: contenido => {
          const nombre = contenido.querySelector("#wizNombreUsuario").value.trim();
          const apellido = contenido.querySelector("#wizApellidoUsuario").value.trim();
          const correo = contenido.querySelector("#wizCorreoUsuario").value.trim();

          if (!nombre || !correo) {
            alert("Nombre y correo son obligatorios");
            return false;
          }

          return { nombre, apellido, correo };
        }
      },
      {
        titulo: "Rol",
        render: () => `
          <label for="wizRolUsuario">Rol</label>
          <select id="wizRolUsuario">
            ${usuarioActivo?.rol !== "admin_sucursal" ? `
              <option value="admin_empresa">Administrador Empresa</option>
              <option value="admin_sucursal">Administrador Sucursal</option>
            ` : ""}
            <option value="jefe_taller">Jefe de Taller</option>
            <option value="supervisor">Supervisor</option>
            <option value="tecnico">Técnico</option>
            <option value="planificador">Planificador</option>
            <option value="bodeguero">Bodeguero</option>
            <option value="sheq">SHEQ</option>
          </select>
        `,
        collect: contenido => ({
          rol: contenido.querySelector("#wizRolUsuario").value
        })
      },
      {
        titulo: "Sucursal",
        render: () => `
          <label for="wizSucursalUsuario">Sucursal</label>
          <select id="wizSucursalUsuario">
            ${usuarioActivo?.rol !== "admin_sucursal"
              ? `<option value="">Sin sucursal asignada</option>`
              : ""}
            ${sucursalesEmpresa.map(sucursal => `
              <option value="${sucursal.id}">
                ${sucursal.nombre} (${sucursal.codigo || sucursal.id})
              </option>
            `).join("")}
          </select>
        `,
        collect: contenido => ({
          sucursalId: contenido.querySelector("#wizSucursalUsuario").value
        })
      },
      {
        titulo: "Resumen",
        render: (datos) => `
          <h3>Resumen</h3>
          <p><strong>Nombre:</strong> ${datos.nombre} ${datos.apellido || ""}</p>
          <p><strong>Correo:</strong> ${datos.correo}</p>
          <p><strong>Rol:</strong> ${formatearRol(datos.rol)}</p>
          <p><strong>Sucursal:</strong> ${nombreSucursal(datos.sucursalId)}</p>
        `
      }
    ],
    onFinish: async (datos) => {
      await crearUsuarioEmpresaFirebase(datos);
    }
  });
};

async function crearUsuarioEmpresaFirebase(datos) {
  try {
    const empresaId = window.empresaIdActualAdmin;

    if (!empresaId) {
      alert("No se encontró la empresa actual");
      return;
    }

    const respuesta = await crearUsuarioEmpresaSeguro({
      empresaId,
      nombre: datos.nombre,
      apellido: datos.apellido || "",
      correo: datos.correo,
      rol: datos.rol,
      sucursalId: datos.sucursalId || ""
    });

    const passwordTemporal = respuesta.data.passwordTemporal;

    mostrarCredencialesTemporales(
      datos.correo,
      passwordTemporal
    );

    await cargarUsuariosEmpresa();

  } catch (error) {
    console.error("Error creando usuario:", error);
    const mensaje = error?.message || "Error desconocido";
    alert(
      error?.code === "functions/resource-exhausted"
        ? mensaje
        : "Error al crear usuario: " + mensaje
    );
  }
}

function obtenerPermisosPorRol(rol) {
  if (rol === "admin_empresa") {
    return {
      crearOS: true,
      cargarChecklist: true,
      aprobarIngreso: true,
      aprobarEvaluacion: true,
      aprobarMantencion: true,
      aprobarPruebas: true,
      cerrarOS: true,
      administrarUsuarios: true
    };
  }

  if (rol === "admin_sucursal") {
    return {
      crearOS: true,
      cargarChecklist: true,
      aprobarIngreso: true,
      aprobarEvaluacion: true,
      aprobarMantencion: true,
      aprobarPruebas: true,
      cerrarOS: true,
      administrarUsuarios: true,
      administrarSucursal: true
    };
  }

  if (rol === "jefe_taller") {
    return {
      crearOS: true,
      cargarChecklist: true,
      aprobarIngreso: true,
      aprobarEvaluacion: true,
      aprobarMantencion: true,
      aprobarPruebas: true,
      cerrarOS: true,
      administrarUsuarios: false
    };
  }

  return {
    crearOS: false,
    cargarChecklist: true,
    aprobarIngreso: false,
    aprobarEvaluacion: false,
    aprobarMantencion: false,
    aprobarPruebas: false,
    cerrarOS: false,
    administrarUsuarios: false
  };
}

function formatearRol(rol) {
  if (rol === "admin_empresa") return "Admin Empresa";
  if (rol === "admin_sucursal") return "Admin Sucursal";
  if (rol === "jefe_taller") return "Jefe Taller";
  if (rol === "usuario_taller") return "Técnico";
  if (rol === "supervisor") return "Supervisor";
  if (rol === "tecnico") return "Técnico";
  if (rol === "planificador") return "Planificador";
  if (rol === "bodeguero") return "Bodeguero";
  if (rol === "sheq") return "SHEQ";
  return rol || "-";
}

function nombreSucursal(sucursalId) {
  if (!sucursalId) return "Sin sucursal";
  const sucursal = sucursalesEmpresa.find(item => item.id === sucursalId);
  return sucursal?.nombre || "Sucursal no encontrada";
}
