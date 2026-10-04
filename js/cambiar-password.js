import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut,
  updatePassword
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const nuevaInput = document.getElementById("nuevaPassword");
const confirmarInput = document.getElementById("confirmarPassword");
const btnCambiar = document.getElementById("btnCambiarPassword");
const passwordError = document.getElementById("passwordError");
const passwordMensaje = document.getElementById("passwordMensaje");

let perfilActual = null;

btnCambiar.addEventListener("click", cambiarPassword);

for (const input of [nuevaInput, confirmarInput]) {
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") cambiarPassword();
  });
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    localStorage.removeItem("usuarioActivo");
    window.location.replace("index.html");
    return;
  }

  try {
    const perfilSnap = await getDoc(doc(db, "usuarios", user.uid));

    if (!perfilSnap.exists() || perfilSnap.data().activo !== true) {
      await salirAlLogin();
      return;
    }

    perfilActual = perfilSnap.data();

    if (perfilActual.debeCambiarPassword !== true) {
      redirigirPorRol(perfilActual);
    }
  } catch (error) {
    console.error("No fue posible verificar el perfil:", error);
    passwordError.textContent = "No fue posible verificar tu cuenta.";
  }
});

function passwordValida(password) {
  return (
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

async function cambiarPassword() {
  const nueva = nuevaInput.value;
  const confirmar = confirmarInput.value;

  passwordError.textContent = "";
  passwordMensaje.textContent = "";

  if (!auth.currentUser || !perfilActual) {
    passwordError.textContent = "La sesión no está disponible. Inicia sesión nuevamente.";
    return;
  }

  if (!passwordValida(nueva)) {
    passwordError.textContent = "La contraseña no cumple todos los requisitos.";
    return;
  }

  if (nueva !== confirmar) {
    passwordError.textContent = "Las contraseñas no coinciden.";
    return;
  }

  btnCambiar.disabled = true;

  try {
    await updatePassword(auth.currentUser, nueva);

    await updateDoc(doc(db, "usuarios", auth.currentUser.uid), {
      debeCambiarPassword: false,
      fechaActualizacion: serverTimestamp()
    });

    const usuarioLocal = JSON.parse(
      localStorage.getItem("usuarioActivo") || "{}"
    );

    usuarioLocal.debeCambiarPassword = false;
    localStorage.setItem("usuarioActivo", JSON.stringify(usuarioLocal));

    passwordMensaje.textContent = "Contraseña actualizada correctamente.";
    setTimeout(() => redirigirPorRol(perfilActual), 700);

  } catch (error) {
    console.error("Error cambiando contraseña:", error);

    if (error.code === "auth/requires-recent-login") {
      passwordError.textContent = "La sesión expiró. Inicia sesión nuevamente.";
      setTimeout(salirAlLogin, 1200);
      return;
    }

    passwordError.textContent = "No fue posible cambiar la contraseña.";
  } finally {
    btnCambiar.disabled = false;
  }
}

function redirigirPorRol(perfil) {
  switch (perfil.rol) {
    case "super_admin":
      window.location.replace("super-admin.html");
      break;
    case "admin_empresa":
      window.location.replace(`empresa-admin.html?id=${perfil.empresaId}`);
      break;
    case "admin_sucursal":
    case "jefe_taller":
    case "usuario_taller":
    case "supervisor":
    case "tecnico":
    case "planificador":
      window.location.replace("dashboard.html");
      break;
    case "bodeguero":
      window.location.replace("inventario.html");
      break;
    case "sheq":
      window.location.replace("sheq.html");
      break;
    default:
      salirAlLogin();
  }
}

async function salirAlLogin() {
  localStorage.removeItem("usuarioActivo");
  try {
    await signOut(auth);
  } finally {
    window.location.replace("index.html");
  }
}
