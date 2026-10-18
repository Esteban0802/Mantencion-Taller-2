import {
  auth,
  db
} from "./firebase-config.js";

import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const INACTIVIDAD_MAXIMA_MS = 3 * 60 * 60 * 1000;
const AVISO_INACTIVIDAD_MS = 5 * 60 * 1000;
const CLAVE_ULTIMA_ACTIVIDAD = "overtrackUltimaActividad";
const CLAVE_SESION_UID = "overtrackSesionUid";
const CLAVE_CIERRE_EVENTO = "overtrackCierreSesionEvento";
const CLAVE_ULTIMO_CIERRE = "overtrackUltimoCierreSesion";
const registrarCierreSesionSeguro = httpsCallable(getFunctions(undefined, "us-central1"), "registrarCierreSesion");
let controlInactividadIniciado = false;
let advertenciaInactividadVisible = false;
let cierreEnCurso = false;
let ultimaActividadLocal = 0;
let ultimaSincronizacionActividad = 0;
let intervaloInactividad = null;


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
  localStorage.removeItem(CLAVE_ULTIMA_ACTIVIDAD);
  localStorage.removeItem(CLAVE_SESION_UID);
  sessionStorage.clear();
}


async function registrarMotivoCierre(motivo) {
  try {
    await Promise.race([
      registrarCierreSesionSeguro({ motivo }),
      new Promise(resolve => window.setTimeout(resolve, 1500))
    ]);
  } catch (error) {
    console.warn("No fue posible registrar el cierre de sesión en auditoría:", error);
  }
}


function guardarMotivoCierreLocal(motivo) {
  localStorage.setItem(CLAVE_ULTIMO_CIERRE, JSON.stringify({ motivo, fecha: new Date().toISOString() }));
}


export async function cerrarSesion(motivo = "manual") {
  if (typeof motivo !== "string") motivo = "manual";
  if (cierreEnCurso) return;
  cierreEnCurso = true;
  const usuario = obtenerUsuarioActivo();
  if (intervaloInactividad) window.clearInterval(intervaloInactividad);
  localStorage.setItem(CLAVE_CIERRE_EVENTO, JSON.stringify({ uid: usuario?.uid || "", motivo, fecha: Date.now() }));
  await registrarMotivoCierre(motivo);
  limpiarSesionLocal();
  guardarMotivoCierreLocal(motivo);

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


export async function reautenticarAccionCritica(descripcion = "realizar esta operación") {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser?.email) throw new Error("No existe una sesión válida para confirmar tu identidad.");
  const token = await firebaseUser.getIdTokenResult();
  const autenticadoEn = Number(token.claims?.auth_time || 0) * 1000;
  if (Date.now() - autenticadoEn < 15 * 60 * 1000) return true;

  const password = window.OverTrackUI?.solicitarTexto
    ? await window.OverTrackUI.solicitarTexto({
        titulo: "Confirma tu identidad",
        mensaje: `Ingresa nuevamente tu contraseña para ${descripcion}.`,
        tipo: "advertencia",
        etiqueta: "Contraseña actual",
        textoConfirmar: "Confirmar identidad",
        textoCancelar: "Cancelar",
        peligrosa: true,
        tipoCampo: "password"
      })
    : window.prompt(`Ingresa nuevamente tu contraseña para ${descripcion}.`);
  if (!password) return false;
  try {
    await reauthenticateWithCredential(firebaseUser, EmailAuthProvider.credential(firebaseUser.email, password));
    await firebaseUser.getIdToken(true);
    registrarActividad(true);
    return true;
  } catch (error) {
    if (window.OverTrackUI?.mostrarMensaje) {
      await window.OverTrackUI.mostrarMensaje({ titulo: "Identidad no confirmada", mensaje: "La contraseña no es correcta o la sesión ya no es válida.", tipo: "error" });
    }
    return false;
  }
}


function registrarActividad(force = false) {
  if (advertenciaInactividadVisible || cierreEnCurso) return;
  const ahora = Date.now();
  ultimaActividadLocal = ahora;
  if (force || ahora - ultimaSincronizacionActividad >= 15000) {
    ultimaSincronizacionActividad = ahora;
    localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(ahora));
  }
}


async function mostrarAdvertenciaInactividad() {
  if (advertenciaInactividadVisible || cierreEnCurso) return;
  advertenciaInactividadVisible = true;
  const opciones = {
    titulo: "Sesión próxima a cerrarse",
    mensaje: "No se ha detectado actividad. Tu sesión se cerrará en 5 minutos para proteger la información.",
    tipo: "advertencia",
    textoConfirmar: "Mantener sesión",
    textoCancelar: "Cerrar sesión"
  };
  const continuar = window.OverTrackUI?.confirmarAccion
    ? await window.OverTrackUI.confirmarAccion(opciones)
    : window.confirm(`${opciones.mensaje}\n\nAceptar para mantener la sesión.`);
  if (cierreEnCurso) return;
  if (continuar) {
    advertenciaInactividadVisible = false;
    registrarActividad(true);
  } else {
    await cerrarSesion("cierre_desde_aviso_inactividad");
  }
}


function iniciarControlInactividad(usuario) {
  if (controlInactividadIniciado || !usuario?.uid) return;
  controlInactividadIniciado = true;
  const uidAnterior = localStorage.getItem(CLAVE_SESION_UID);
  const actividadGuardada = Number(localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD) || 0);
  if (uidAnterior !== usuario.uid || !actividadGuardada) {
    localStorage.setItem(CLAVE_SESION_UID, usuario.uid);
    registrarActividad(true);
  } else {
    ultimaActividadLocal = actividadGuardada;
  }

  ["pointerdown", "mousemove", "keydown", "scroll", "touchstart"].forEach(evento => {
    window.addEventListener(evento, () => registrarActividad(), { passive: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) registrarActividad(true);
  });
  window.addEventListener("storage", evento => {
    if (evento.key === CLAVE_ULTIMA_ACTIVIDAD) {
      ultimaActividadLocal = Math.max(ultimaActividadLocal, Number(evento.newValue || 0));
    }
    if (evento.key === CLAVE_CIERRE_EVENTO && evento.newValue && !cierreEnCurso) {
      cierreEnCurso = true;
      limpiarSesionLocal();
      signOut(auth).catch(() => {}).finally(() => window.location.replace("index.html"));
    }
  });

  intervaloInactividad = window.setInterval(() => {
    const compartida = Number(localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD) || 0);
    const transcurrido = Date.now() - Math.max(ultimaActividadLocal, compartida);
    if (transcurrido >= INACTIVIDAD_MAXIMA_MS) {
      cerrarSesion("inactividad");
    } else if (transcurrido >= INACTIVIDAD_MAXIMA_MS - AVISO_INACTIVIDAD_MS) {
      mostrarAdvertenciaInactividad();
    }
  }, 5000);
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

  iniciarControlInactividad(usuario);

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
