export function obtenerUsuarioActivo() {
  return JSON.parse(localStorage.getItem("usuarioActivo"));
}

export function cerrarSesion() {
  localStorage.removeItem("usuarioActivo");
  localStorage.removeItem("otActiva");
  sessionStorage.clear();
  window.location.replace("index.html");
}

export function protegerPagina(rolesPermitidos = []) {
  const usuario = obtenerUsuarioActivo();

  if (!usuario) {
    window.location.replace("index.html");
    return null;
  }

  if (!usuario.activo) {
    alert("Tu usuario está inactivo.");
    cerrarSesion();
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
      window.location.replace(`empresa-admin.html?id=${usuario.empresaId}`);
      break;

    case "admin_sucursal":
    case "jefe_taller":
    case "usuario_taller":
      window.location.replace("dashboard.html");
      break;

    default:
      window.location.replace("index.html");
  }
}