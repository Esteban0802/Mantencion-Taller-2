import { auth, db } from "./firebase-config.js";


import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const btnLogin = document.getElementById("btnLogin");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginError = document.getElementById("loginError");
const loginMensaje = document.getElementById("loginMensaje");
const btnMostrarRecuperacion = document.getElementById("btnMostrarRecuperacion");
const panelRecuperacion = document.getElementById("panelRecuperacion");
const btnRecuperarPassword = document.getElementById("btnRecuperarPassword");

btnLogin.addEventListener("click", iniciarSesion);
btnMostrarRecuperacion.addEventListener("click", mostrarRecuperacion);
btnRecuperarPassword.addEventListener("click", recuperarPassword);

emailInput.addEventListener("keydown", function(e) {
  if (e.key === "Enter") {
    iniciarSesion();
  }
});

passwordInput.addEventListener("keydown", function(e) {
  if (e.key === "Enter") {
    iniciarSesion();
  }
});

async function iniciarSesion() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    loginError.textContent = "Ingresa correo y contraseña.";
    return;
  }

  loginError.textContent = "";
  loginMensaje.textContent = "";
  btnLogin.disabled = true;
  const cargaUI = window.OverTrackUI?.iniciarCarga?.("Validando tus credenciales…");

  try {
    const credencial = await signInWithEmailAndPassword(auth, email, password);
    const uid = credencial.user.uid;

    const usuarioRef = doc(db, "usuarios", uid);
    const usuarioSnap = await getDoc(usuarioRef);

    if (!usuarioSnap.exists()) {
      await signOut(auth);
      loginError.textContent = "No fue posible iniciar sesión.";
      return;
    }

    const usuario = usuarioSnap.data();

    if (usuario.activo !== true) {
      await signOut(auth);
      loginError.textContent = "No fue posible iniciar sesión.";
      return;
    }

    localStorage.setItem("usuarioActivo", JSON.stringify({
      uid,
      email,
      nombre: usuario.nombre,
      rol: usuario.rol,
      empresaId: usuario.empresaId,
      sucursalId: usuario.sucursalId,
      activo: usuario.activo,
      debeCambiarPassword: usuario.debeCambiarPassword === true
    }));

    if (usuario.debeCambiarPassword === true) {
      window.location.replace("cambiar-password.html");
      return;
    }

    // Redirección según el rol

switch (usuario.rol) {

  case "super_admin":
    window.location.href = "super-admin.html";
    break;

  case "admin_empresa":
    window.location.href = "dashboard.html";
    break;

  case "admin_sucursal":
    window.location.href = "dashboard.html";
    break;

  case "jefe_taller":
    window.location.href = "dashboard.html";
    break;

  case "supervisor":
  case "tecnico":
    window.location.href = "dashboard.html";
    break;

  case "planificador":
    window.location.href = "programacion.html";
    break;

  case "bodeguero":
    window.location.href = "inventario.html";
    break;

  case "sheq":
    window.location.href = "sheq.html";
    break;

  default:
    loginError.textContent = "Rol no válido.";
}

  } catch (error) {
    console.error(error);
    loginError.textContent = "Correo o contraseña incorrectos.";
  } finally {
    btnLogin.disabled = false;
    window.OverTrackUI?.finalizarCarga?.(cargaUI);
  }
}

function mostrarRecuperacion() {
  panelRecuperacion.hidden = !panelRecuperacion.hidden;
  btnMostrarRecuperacion.setAttribute(
    "aria-expanded",
    String(!panelRecuperacion.hidden)
  );
  loginError.textContent = "";
  loginMensaje.textContent = "";
}

async function recuperarPassword() {
  const email = emailInput.value.trim();

  loginError.textContent = "";
  loginMensaje.textContent = "";

  if (!email) {
    loginError.textContent = "Ingresa tu correo para recuperar la contraseña.";
    emailInput.focus();
    return;
  }

  btnRecuperarPassword.disabled = true;
  const cargaUI = window.OverTrackUI?.iniciarCarga?.("Enviando instrucciones…");

  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    // No revelamos si el correo está o no registrado.
    console.warn("Solicitud de recuperación procesada:", error.code || error);
  } finally {
    btnRecuperarPassword.disabled = false;
    window.OverTrackUI?.finalizarCarga?.(cargaUI);
    loginMensaje.textContent =
      "Si el correo pertenece a una cuenta habilitada, recibirás instrucciones para recuperar el acceso.";
  }
}
