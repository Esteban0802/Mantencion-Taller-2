let getUsuario = () => null;

export function inicializarPermisos(config) {
    getUsuario = config.getUsuario;
}

export function esJefeTaller() {
    const usuario = getUsuario();
    return usuario && ["jefe_taller", "admin_sucursal"].includes(usuario.rol);
}

export function esUsuarioTaller() {
    const usuario = getUsuario();
    return usuario && usuario.rol === "usuario_taller";
}

export function puedeEliminarComentario(c) {

    if (!c) return false;

    if (esJefeTaller()) return true;

    if (esUsuarioTaller() && ["jefe_taller", "admin_sucursal"].includes(c.rol)) {
        return false;
    }

    if (esUsuarioTaller() && c.rol === "usuario_taller") {
        return true;
    }

    return false;
}

export function aplicarPermisosRol() {

    const usuario = getUsuario();

    if (!usuario) return;

    if (usuario.rol === "admin_empresa") {
        document.querySelectorAll(".solo-jefe, .solo-usuario")
            .forEach(el => el.style.display = "none");
        return;
    }

    if (esUsuarioTaller()) {
        document.querySelectorAll(".solo-jefe")
            .forEach(el => el.style.display = "none");
    }

    if (esJefeTaller()) {
        document.querySelectorAll(".solo-usuario")
            .forEach(el => el.style.display = "none");
    }
}
