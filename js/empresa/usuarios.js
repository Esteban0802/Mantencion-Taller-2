import { abrirWizard } from "../components/wizard.js";
import { db, firebaseConfig } from "../firebase-config.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  initializeApp,
  deleteApp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

let usuariosEmpresa = [];

export function renderVistaUsuariosEmpresa() {
  const cont = document.getElementById("vistaEmpresaContenido");
  if (!cont) return;

  cont.innerHTML = `
    <div class="section-header usuarios-header">
      <div>
        <h2>Usuarios de la Empresa</h2>
        <p class="section-subtitle">
          Administra administradores, jefes de taller y técnicos asociados a esta empresa.
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
        <option value="jefe_taller">Jefe de Taller</option>
        <option value="usuario_taller">Usuario Taller</option>
      </select>
    </div>

    <div class="tabla-wrapper">
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
    const q = query(
      collection(db, "usuarios"),
      where("empresaId", "==", empresaId)
    );

    const snap = await getDocs(q);

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

  tbody.innerHTML = lista.map(usuario => `
    <tr>
      <td>
        <strong>${usuario.nombreCompleto || usuario.nombre || "-"}</strong>
      </td>

      <td>${usuario.correo || "-"}</td>

      <td>
        <span class="badge-rol">
          ${formatearRol(usuario.rol)}
        </span>
      </td>

      <td>${usuario.sucursalId || "Sin sucursal"}</td>

      <td>
        <span class="${usuario.activo ? "badge-activo" : "badge-inactivo"}">
          ${usuario.activo ? "Activo" : "Inactivo"}
        </span>
      </td>

      <td>
        <button class="btn-primary" onclick="verUsuarioEmpresa('${usuario.uid}')">
          Ver
        </button>
      </td>
    </tr>
  `).join("");
}

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

window.verUsuarioEmpresa = function (uid) {
  alert("Próximamente veremos detalle del usuario: " + uid);
};

window.abrirWizardUsuario = function () {
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
        collect: () => {
          const nombre = document.getElementById("wizNombreUsuario").value.trim();
          const apellido = document.getElementById("wizApellidoUsuario").value.trim();
          const correo = document.getElementById("wizCorreoUsuario").value.trim();

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
            <option value="admin_empresa">Administrador Empresa</option>
            <option value="admin_sucursal">Administrador Sucursal</option>
            <option value="jefe_taller">Jefe de Taller</option>
            <option value="usuario_taller">Técnico</option>
          </select>
        `,
        collect: () => ({
          rol: document.getElementById("wizRolUsuario").value
        })
      },
      {
        titulo: "Sucursal",
        render: () => `
          <label for="wizSucursalUsuario">Sucursal</label>
          <select id="wizSucursalUsuario">
            <option value="">Sin sucursal asignada</option>
          </select>

          <p class="section-subtitle">
            Más adelante cargaremos aquí las sucursales reales de la empresa.
          </p>
        `,
        collect: () => ({
          sucursalId: document.getElementById("wizSucursalUsuario").value
        })
      },
      {
        titulo: "Resumen",
        render: (datos) => `
          <h3>Resumen</h3>
          <p><strong>Nombre:</strong> ${datos.nombre} ${datos.apellido || ""}</p>
          <p><strong>Correo:</strong> ${datos.correo}</p>
          <p><strong>Rol:</strong> ${formatearRol(datos.rol)}</p>
          <p><strong>Sucursal:</strong> ${datos.sucursalId || "Sin sucursal"}</p>
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

    const passwordTemporal = "OverTrack123";

    const secondaryApp = initializeApp(
      firebaseConfig,
      "secondary-" + Date.now()
    );

    const secondaryAuth = getAuth(secondaryApp);

    const cred = await createUserWithEmailAndPassword(
      secondaryAuth,
      datos.correo,
      passwordTemporal
    );

    const uid = cred.user.uid;

    const usuarioData = {
      uid,
      empresaId,
      sucursalId: datos.sucursalId || "",

      nombre: datos.nombre,
      apellido: datos.apellido || "",
      nombreCompleto: `${datos.nombre} ${datos.apellido || ""}`.trim(),

      correo: datos.correo,
      telefono: "",
      cargo: "",

      rol: datos.rol,
      foto: "",
      activo: true,

      creadoPor: "super_admin",
      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp(),
      ultimoAcceso: null,

      permisos: obtenerPermisosPorRol(datos.rol)
    };

    await setDoc(doc(db, "usuarios", uid), usuarioData);

    await signOut(secondaryAuth);
    await deleteApp(secondaryApp);

    alert(
      "Usuario creado correctamente.\n\nCorreo: " +
      datos.correo +
      "\nContraseña temporal: " +
      passwordTemporal
    );

    await cargarUsuariosEmpresa();

  } catch (error) {
    console.error("Error creando usuario:", error);
    alert("Error al crear usuario: " + error.message);
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
    cargarChecklist: false,
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
  return rol || "-";
}