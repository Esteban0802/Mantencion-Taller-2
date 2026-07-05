import { db, firebaseConfig } from "../firebase-config.js";

import {
  doc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
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



import { abrirWizard } from "../components/wizard.js";

import { db } from "../firebase-config.js";

import {
  collection,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";


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
      >

      <select id="filtroRolUsuario">
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
            <td colspan="6">
              <div class="empty-state">
                <div class="empty-icon">👥</div>
                <h3>No existen usuarios todavía</h3>
                <p>Presiona “Crear Usuario” para agregar administradores, jefes o técnicos.</p>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

window.abrirWizardUsuario = function () {
  abrirWizard({
    titulo: "Crear Usuario",
    pasos: [
        {
            titulo: "Datos",

            render: () => `
            <label>Nombre</label>

            <input type="text" id="wizNombreUsuario">

            <label>Apellido</label>

            <input type="text" id="wizApellidoUsuario">

            <label>Correo</label>

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
          <label>Rol</label>
          <select id="wizRolUsuario">
            <option value="admin_empresa">Administrador Empresa</option>
            <option value="jefe_taller">Jefe de Taller</option>
            <option value="usuario_taller">Usuario Taller</option>
          </select>
        `,
        collect: () => {
          return {
            rol: document.getElementById("wizRolUsuario").value
          };
        }
      },
      {
        titulo: "Sucursal",
        render: () => `
          <label>Sucursal</label>
          <select id="wizSucursalUsuario">
            <option value="">Sin sucursal asignada</option>
          </select>

          <p class="section-subtitle">
            Más adelante cargaremos aquí las sucursales reales de la empresa.
          </p>
        `,
        collect: () => {
          return {
            sucursalId: document.getElementById("wizSucursalUsuario").value
          };
        }
      },
      {
        titulo: "Resumen",
        render: (datos) => `
          <h3>Resumen</h3>

          <p><strong>Nombre:</strong> ${datos.nombre} ${datos.apellido || ""}</p>
          <p><strong>Correo:</strong> ${datos.correo}</p>
          <p><strong>Rol:</strong> ${datos.rol}</p>
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

    const passwordTemporal = datos.password || "OverTrack123";

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

    alert("Usuario creado correctamente");

  } catch (error) {
    console.error("Error creando usuario:", error);
    alert("Error al crear usuario: " + error.message);
  }
}

function obtenerPermisosPorRol(rol) {
  if (rol === "admin_empresa") {
    return {
      crearOS: true,
      aprobarIngreso: true,
      aprobarEvaluacion: true,
      aprobarMantencion: true,
      aprobarPruebas: true,
      cerrarOS: true,
      administrarUsuarios: true
    };
  }

  if (rol === "jefe_taller") {
    return {
      crearOS: true,
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
    aprobarIngreso: false,
    aprobarEvaluacion: false,
    aprobarMantencion: false,
    aprobarPruebas: false,
    cerrarOS: false,
    administrarUsuarios: false
  };
}