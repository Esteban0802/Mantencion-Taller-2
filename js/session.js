import {
  auth,
  db
} from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


export function obtenerUsuarioActivo() {
  try {
    return JSON.parse(
      localStorage.getItem("usuarioActivo")
    );
  } catch (error) {
    console.warn(
      "Sesión local inválida:",
      error
    );

    localStorage.removeItem("usuarioActivo");
    return null;
  }
}


function limpiarSesionLocal() {
  localStorage.removeItem("usuarioActivo");
  localStorage.removeItem("otActiva");
  sessionStorage.clear();
}


export async function cerrarSesion() {
  limpiarSesionLocal();

  try {
    await signOut(auth);
  } catch (error) {
    console.warn(
      "No fue posible cerrar la sesión en Firebase:",
      error
    );
  } finally {
    window.location.replace("index.html");
  }
}


export function protegerPagina(rolesPermitidos = []) {
  const usuario = obtenerUsuarioActivo();

  if (!usuario) {
    window.location.replace("index.html");
    return null;
  }

  if (!usuario.uid || usuario.activo !== true) {
    alert("Tu sesión no es válida o el usuario está inactivo.");
    cerrarSesion();
    return null;
  }

  if (usuario.debeCambiarPassword === true) {
    window.location.replace("cambiar-password.html");
    return null;
  }

  if (!rolesPermitidos.includes(usuario.rol)) {
    alert("No tienes permiso para acceder a esta sección.");
    redirigirPorRol(usuario);
    return null;
  }

  return usuario;
}


export function redirigirPorRol(usuario) {
  if (!usuario) {
    window.location.replace("index.html");
    return;
  }

  switch (usuario.rol) {
    case "super_admin":
      window.location.replace("super-admin.html");
      break;

    case "admin_empresa":
    case "admin_sucursal":
    case "jefe_taller":
    case "usuario_taller":
    case "supervisor":
    case "tecnico":
      window.location.replace("dashboard.html");
      break;

    case "planificador":
      window.location.replace("programacion.html");
      break;

    case "bodeguero":
      window.location.replace("inventario.html");
      break;

    case "sheq":
      window.location.replace("sheq.html");
      break;

    default:
      limpiarSesionLocal();
      window.location.replace("index.html");
  }
}


function usuarioCambio(usuarioLocal, usuarioVerificado) {
  return (
    usuarioLocal?.uid !== usuarioVerificado.uid ||
    usuarioLocal?.rol !== usuarioVerificado.rol ||
    usuarioLocal?.empresaId !== usuarioVerificado.empresaId ||
    usuarioLocal?.sucursalId !== usuarioVerificado.sucursalId ||
    usuarioLocal?.activo !== usuarioVerificado.activo ||
    usuarioLocal?.debeCambiarPassword !== usuarioVerificado.debeCambiarPassword
  );
}

function empresaEnPeriodoDeSalida(empresa = {}) {
  return ["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"]
    .includes(empresa.suscripcion?.estado);
}

async function aplicarRestriccionCancelacion(usuario) {
  if (!usuario.empresaId || usuario.rol === "super_admin") return false;
  const empresaSnap = await getDoc(doc(db, "empresas", usuario.empresaId));
  if (!empresaSnap.exists() || !empresaEnPeriodoDeSalida(empresaSnap.data())) return false;

  if (usuario.rol !== "admin_empresa") {
    alert("La empresa se encuentra en periodo de cancelación. El acceso operativo está bloqueado.");
    await cerrarSesion();
    return true;
  }

  const pagina = window.location.pathname.split("/").pop() || "";
  if (pagina !== "empresa-admin.html") {
    window.location.replace(`empresa-admin.html?id=${usuario.empresaId}`);
    return true;
  }
  return false;
}


// Verifica en segundo plano que la sesión local corresponda
// al usuario autenticado y al perfil vigente en Firestore.
onAuthStateChanged(auth, async firebaseUser => {
  const usuarioLocal = obtenerUsuarioActivo();

  if (!firebaseUser) {
    if (usuarioLocal) {
      limpiarSesionLocal();
      window.location.replace("index.html");
    }

    return;
  }

  if (!usuarioLocal || usuarioLocal.uid !== firebaseUser.uid) {
    limpiarSesionLocal();
    await signOut(auth);
    window.location.replace("index.html");
    return;
  }

  try {
    const perfilSnap = await getDoc(
      doc(db, "usuarios", firebaseUser.uid)
    );

    if (!perfilSnap.exists()) {
      await cerrarSesion();
      return;
    }

    const perfil = perfilSnap.data();

    const usuarioVerificado = {
      uid: firebaseUser.uid,
      email: firebaseUser.email || usuarioLocal.email || "",
      nombre:
        perfil.nombreCompleto ||
        perfil.nombre ||
        usuarioLocal.nombre ||
        "Usuario",
      rol: perfil.rol,
      empresaId: perfil.empresaId || "",
      sucursalId: perfil.sucursalId || "",
      activo: perfil.activo === true,
      debeCambiarPassword: perfil.debeCambiarPassword === true
    };

    if (await aplicarRestriccionCancelacion(usuarioVerificado)) return;

    if (!usuarioVerificado.activo) {
      alert("Tu usuario está inactivo.");
      await cerrarSesion();
      return;
    }

    if (
      usuarioVerificado.debeCambiarPassword &&
      !window.location.pathname.endsWith("/cambiar-password.html")
    ) {
      localStorage.setItem(
        "usuarioActivo",
        JSON.stringify(usuarioVerificado)
      );
      window.location.replace("cambiar-password.html");
      return;
    }

    if (usuarioCambio(usuarioLocal, usuarioVerificado)) {
      localStorage.setItem(
        "usuarioActivo",
        JSON.stringify(usuarioVerificado)
      );

      // La recarga obliga a ejecutar nuevamente protegerPagina
      // con el rol y empresa verificados en Firestore.
      window.location.reload();
    }
  } catch (error) {
    console.error(
      "No fue posible verificar la sesión:",
      error
    );
  }
});
