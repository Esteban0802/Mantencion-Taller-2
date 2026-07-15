import { protegerPagina, cerrarSesion } from "./session.js";
import { abrirWizard } from "./components/wizard.js";

import { db, firebaseConfig } from "./firebase-config.js";

import {
  collection,
  addDoc,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
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

const usuarioActivo = protegerPagina(["super_admin"]);
if (!usuarioActivo) throw new Error("Acceso no autorizado");

let empresas = [];

function generarPasswordTemporal(longitud = 12) {
  const mayusculas = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const minusculas = "abcdefghijkmnopqrstuvwxyz";
  const numeros = "23456789";
  const simbolos = "!@#$%&*";
  const todos = mayusculas + minusculas + numeros + simbolos;

  let password = "";

  // Garantiza al menos un carácter de cada tipo
  password += mayusculas[Math.floor(Math.random() * mayusculas.length)];
  password += minusculas[Math.floor(Math.random() * minusculas.length)];
  password += numeros[Math.floor(Math.random() * numeros.length)];
  password += simbolos[Math.floor(Math.random() * simbolos.length)];

  while (password.length < longitud) {
    password += todos[Math.floor(Math.random() * todos.length)];
  }

  // Mezcla los caracteres
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

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
          <label for="wizEmpresaCorreo">Correo de contacto</label>
          <input type="email" id="wizEmpresaCorreo">

          <label for="wizEmpresaTelefono">Teléfono</label>
          <input type="text" id="wizEmpresaTelefono">

          <label for="wizEmpresaCiudad">Ciudad</label>
          <input type="text" id="wizEmpresaCiudad">
        `,
        collect: () => {
          const correo = document.getElementById("wizEmpresaCorreo").value.trim();
          const telefono = document.getElementById("wizEmpresaTelefono").value.trim();
          const ciudad = document.getElementById("wizEmpresaCiudad").value.trim();

          if (!correo) {
            alert("El correo de contacto es obligatorio");
            return false;
          }

          return { correo, telefono, ciudad };
        }
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
        titulo: "Módulos",
        render: () => `
          <div class="modulos-grid">
            ${crearSwitchModulo("dashboard", "Dashboard", true)}
            ${crearSwitchModulo("usuarios", "Usuarios", true)}
            ${crearSwitchModulo("sucursales", "Sucursales", true)}
            ${crearSwitchModulo("ordenesServicio", "Órdenes de Servicio", true)}
            ${crearSwitchModulo("checklists", "Checklists", true)}
            ${crearSwitchModulo("evidencias", "Evidencias Fotográficas", true)}
            ${crearSwitchModulo("comentarios", "Comentarios", true)}
            ${crearSwitchModulo("aprobaciones", "Aprobaciones", true)}
            ${crearSwitchModulo("gantt", "Carta Gantt", true)}
            ${crearSwitchModulo("despacho", "Despacho", true)}
            ${crearSwitchModulo("reportesPDF", "Reportes PDF", true)}
            ${crearSwitchModulo("clientes", "Clientes", false)}
            ${crearSwitchModulo("equipos", "Equipos", false)}
            ${crearSwitchModulo("inventario", "Inventario", false)}
            ${crearSwitchModulo("ia", "IA", false)}
          </div>
        `,
        collect: () => ({
          modulos: obtenerModulosSeleccionados()
        })
      },
      {
        titulo: "Administrador",
        render: () => `
          <label for="wizAdminNombre">Nombre</label>
          <input type="text" id="wizAdminNombre">

          <label for="wizAdminApellido">Apellido</label>
          <input type="text" id="wizAdminApellido">

          <label for="wizAdminCorreo">Correo de acceso</label>
          <input type="email" id="wizAdminCorreo">
        `,
        collect: () => {
          const adminNombre = document.getElementById("wizAdminNombre").value.trim();
          const adminApellido = document.getElementById("wizAdminApellido").value.trim();
          const adminCorreo = document.getElementById("wizAdminCorreo").value.trim();

          if (!adminNombre || !adminCorreo) {
            alert("Nombre y correo del administrador son obligatorios");
            return false;
          }

          return {
            adminNombre,
            adminApellido,
            adminCorreo
          };
        }
      },
      {
        titulo: "Resumen",
        render: (datos) => `
          <h3>Resumen de creación</h3>

          <p><strong>Empresa:</strong> ${datos.nombre}</p>
          <p><strong>RUT:</strong> ${datos.rut}</p>
          <p><strong>Plan:</strong> ${datos.plan}</p>
          <p><strong>Administrador:</strong> ${datos.adminNombre} ${datos.adminApellido || ""}</p>
          <p><strong>Correo de acceso:</strong> ${datos.adminCorreo}</p>

          <div class="resumen-modulos">
            <strong>Módulos activos:</strong>
            <p>
              ${Object.entries(datos.modulos || {})
                .filter(([, activo]) => activo)
                .map(([nombre]) => nombre)
                .join(", ")}
            </p>
          </div>
        `
      }
    ],
    onFinish: crearEmpresaCompletaDesdeWizard
  });
};


function crearSwitchModulo(key, label, activoInicial) {
  return `
    <label class="modulo-switch-card">
      <div>
        <strong>${label}</strong>
      </div>

      <input
        type="checkbox"
        data-modulo="${key}"
        ${activoInicial ? "checked" : ""}
      >
    </label>
  `;
}

function obtenerModulosSeleccionados() {
  const modulos = {};

  document
    .querySelectorAll("[data-modulo]")
    .forEach(input => {
      modulos[input.dataset.modulo] = input.checked;
    });

  return modulos;
}


async function crearEmpresaCompletaDesdeWizard(datos) {
  let secondaryApp = null;

  try {
    const passwordTemporal = generarPasswordTemporal();

    const limitesPlan = obtenerLimitesPlan(datos.plan);

    const nuevaEmpresa = {
      nombre: datos.nombre,
      rut: datos.rut,
      giro: datos.giro || "",

      correo: datos.correo,
      telefono: datos.telefono || "",
      ciudad: datos.ciudad || "",
      direccion: "",
      pais: "Chile",
      sitioWeb: "",

      logo: "",
      colorPrimario: "#2563eb",
      colorSecundario: "#f97316",

      plan: datos.plan,
      activa: true,
      estado: "activa",

      maxUsuarios: limitesPlan.maxUsuarios,
      maxSucursales: limitesPlan.maxSucursales,
      maxStorageGB: limitesPlan.maxStorageGB,

      modulos: datos.modulos || {},

      creadoPor: usuarioActivo.uid,
      creadoPorNombre:
        usuarioActivo.nombre ||
        usuarioActivo.nombreCompleto ||
        "Super Administrador",

      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp()
    };

    // 1. Crear empresa
    const empresaRef = await addDoc(
      collection(db, "empresas"),
      nuevaEmpresa
    );

    const empresaId = empresaRef.id;

    // 2. Crear usuario en una instancia secundaria
    secondaryApp = initializeApp(
      firebaseConfig,
      `secondary-admin-${Date.now()}`
    );

    const secondaryAuth = getAuth(secondaryApp);

    const credencial = await createUserWithEmailAndPassword(
      secondaryAuth,
      datos.adminCorreo,
      passwordTemporal
    );

    const uidAdmin = credencial.user.uid;

    // 3. Crear perfil en Firestore
    const adminData = {
      uid: uidAdmin,

      empresaId,
      sucursalId: "",

      nombre: datos.adminNombre,
      apellido: datos.adminApellido || "",
      nombreCompleto:
        `${datos.adminNombre} ${datos.adminApellido || ""}`.trim(),

      correo: datos.adminCorreo,
      telefono: "",
      cargo: "Administrador de Empresa",

      rol: "admin_empresa",
      activo: true,
      foto: "",

      primerIngreso: true,
      debeCambiarPassword: true,

      creadoPor: usuarioActivo.uid,
      creadoPorNombre:
        usuarioActivo.nombre ||
        usuarioActivo.nombreCompleto ||
        "Super Administrador",

      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp(),
      ultimoAcceso: null,

      permisos: {
        crearOS: true,
        cargarChecklist: true,
        aprobarIngreso: true,
        aprobarEvaluacion: true,
        aprobarMantencion: true,
        aprobarPruebas: true,
        cerrarOS: true,
        administrarUsuarios: true,
        administrarEmpresa: true
      }
    };

    await setDoc(
      doc(db, "usuarios", uidAdmin),
      adminData
    );

    // 4. Cerrar sesión secundaria
    await signOut(secondaryAuth);
    await deleteApp(secondaryApp);
    secondaryApp = null;

    // 5. Actualizar listado
    await cargarEmpresas();

    // 6. Mostrar credenciales
    mostrarResultadoCreacionEmpresa({
      empresaId,
      empresaNombre: datos.nombre,
      administrador:
        `${datos.adminNombre} ${datos.adminApellido || ""}`.trim(),
      correo: datos.adminCorreo,
      passwordTemporal
    });

  } catch (error) {
    console.error("Error creando empresa completa:", error);

    if (secondaryApp) {
      try {
        await deleteApp(secondaryApp);
      } catch (cleanupError) {
        console.error(
          "Error cerrando instancia secundaria:",
          cleanupError
        );
      }
    }

    let mensaje = "No se pudo crear la empresa completa.";

    if (error.code === "auth/email-already-in-use") {
      mensaje =
        "El correo del Administrador ya está registrado en Firebase Authentication.";
    }

    if (error.code === "auth/invalid-email") {
      mensaje =
        "El correo del Administrador no tiene un formato válido.";
    }

    if (error.code === "auth/weak-password") {
      mensaje =
        "La contraseña temporal generada no cumple los requisitos.";
    }

    alert(mensaje);
  }
}



function obtenerLimitesPlan(plan) {
  if (plan === "enterprise") {
    return {
      maxUsuarios: 200,
      maxSucursales: 20,
      maxStorageGB: 100
    };
  }

  if (plan === "professional") {
    return {
      maxUsuarios: 50,
      maxSucursales: 5,
      maxStorageGB: 25
    };
  }

  return {
    maxUsuarios: 10,
    maxSucursales: 1,
    maxStorageGB: 5
  };
}



function mostrarResultadoCreacionEmpresa({
  empresaNombre,
  administrador,
  correo,
  passwordTemporal
}) {
  const overlay = document.createElement("div");
  overlay.className = "resultado-empresa-overlay";

  overlay.innerHTML = `
    <div class="resultado-empresa-box">

      <div class="resultado-icono">✓</div>

      <h2>Empresa creada correctamente</h2>

      <p class="resultado-subtitulo">
        La empresa y su Administrador fueron creados exitosamente.
      </p>

      <div class="resultado-credenciales">

        <div>
          <span>Empresa</span>
          <strong>${empresaNombre}</strong>
        </div>

        <div>
          <span>Administrador</span>
          <strong>${administrador}</strong>
        </div>

        <div>
          <span>Correo de acceso</span>
          <strong>${correo}</strong>
        </div>

        <div>
          <span>Contraseña temporal</span>

          <div class="password-temporal-box">
            <strong id="passwordTemporalCreada">
              ${passwordTemporal}
            </strong>

            <button
              type="button"
              class="btn-primary"
              id="btnCopiarCredenciales"
            >
              Copiar
            </button>
          </div>
        </div>

      </div>

      <div class="resultado-aviso">
        El usuario deberá cambiar esta contraseña durante su primer acceso.
      </div>

      <div class="resultado-actions">
        <button
          type="button"
          class="btn-primary"
          id="btnCerrarResultadoEmpresa"
        >
          Finalizar
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(overlay);

  overlay
    .querySelector("#btnCopiarCredenciales")
    .addEventListener("click", async () => {
      const texto = [
        "Credenciales de acceso a OverTrack",
        "",
        `Empresa: ${empresaNombre}`,
        `Administrador: ${administrador}`,
        `Correo: ${correo}`,
        `Contraseña temporal: ${passwordTemporal}`
      ].join("\n");

      try {
        await navigator.clipboard.writeText(texto);
        alert("Credenciales copiadas correctamente.");
      } catch (error) {
        console.error("Error copiando credenciales:", error);
        alert(
          "No fue posible copiar automáticamente. Copia las credenciales manualmente."
        );
      }
    });

  overlay
    .querySelector("#btnCerrarResultadoEmpresa")
    .addEventListener("click", () => {
      overlay.remove();
    });
}



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
  cerrarSesion();
};

document.addEventListener("DOMContentLoaded", cargarEmpresas);



window.verEmpresa = function (empresaId) {
  window.location.href = `empresa-admin.html?id=${empresaId}`;
};

window.eliminarEmpresa = async function (empresaId) {
  const confirmar = confirm(
    "¿Eliminar esta empresa?\n\nEsta acción eliminará el registro de la empresa en Firestore."
  );

  if (!confirmar) return;

  try {
    await deleteDoc(doc(db, "empresas", empresaId));

    alert("Empresa eliminada correctamente");
    await cargarEmpresas();

  } catch (error) {
    console.error("Error eliminando empresa:", error);
    alert("No se pudo eliminar la empresa.");
  }
};