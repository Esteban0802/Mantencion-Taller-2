import { auth, db } from "./firebase-config.js";


import {
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const btnLogin = document.getElementById("btnLogin");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginError = document.getElementById("loginError");

btnLogin.addEventListener("click", iniciarSesion);

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
  const password = passwordInput.value.trim();

  if (!email || !password) {
    loginError.textContent = "Ingresa correo y contraseña.";
    return;
  }

  try {
    const credencial = await signInWithEmailAndPassword(auth, email, password);
    const uid = credencial.user.uid;

    const usuarioRef = doc(db, "usuarios", uid);
    const usuarioSnap = await getDoc(usuarioRef);

    if (!usuarioSnap.exists()) {
      loginError.textContent = "Usuario autenticado, pero sin perfil en Firestore.";
      return;
    }

    const usuario = usuarioSnap.data();

    localStorage.setItem("usuarioActivo", JSON.stringify({
      uid,
      email,
      nombre: usuario.nombre,
      rol: usuario.rol,
      empresaId: usuario.empresaId,
      sucursalId: usuario.sucursalId,
      activo: usuario.activo
    }));

    // Redirección según el rol

switch (usuario.rol) {

  case "super_admin":
    window.location.href = "super-admin.html";
    break;

  case "admin_empresa":
    window.location.href = `empresa-admin.html?id=${usuario.empresaId}`;
    break;

  case "admin_sucursal":
    window.location.href = "dashboard.html";
    break;

  case "jefe_taller":
    window.location.href = "dashboard.html";
    break;

  case "usuario_taller":
    window.location.href = "dashboard.html";
    break;

  default:
    loginError.textContent = "Rol no válido.";
}

  } catch (error) {
    console.error(error);
    loginError.textContent = "Correo o contraseña incorrectos.";
  }
}