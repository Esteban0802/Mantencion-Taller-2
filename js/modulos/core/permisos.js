let getUsuario = () => null;
const ROLES_OPERATIVOS = ["supervisor", "tecnico"];

export function inicializarPermisos(config) {
    getUsuario = config.getUsuario;
}

export function esJefeTaller() {
    const usuario = getUsuario();
    return usuario && usuario.rol === "jefe_taller";
}

export function esUsuarioTaller() {
    const usuario = getUsuario();
    return usuario && ROLES_OPERATIVOS.includes(usuario.rol);
}

export function puedeEliminarComentario(c) {

    if (!c) return false;

    if (esJefeTaller()) return true;

    if (esUsuarioTaller() && ["jefe_taller", "admin_sucursal"].includes(c.rol)) {
        return false;
    }

    // Cada trabajador puede eliminar solamente sus propios comentarios.
    const usuario = getUsuario();
    if (
        esUsuarioTaller() &&
        ROLES_OPERATIVOS.includes(c.rol) &&
        (!c.creadoPorUid || c.creadoPorUid === usuario?.uid)
    ) {
        return true;
    }

    return false;
}

export function aplicarPermisosRol() {

    const usuario = getUsuario();

    if (!usuario) return;

    if (["admin_empresa", "admin_sucursal"].includes(usuario.rol)) {
        document.querySelectorAll(".solo-jefe, .solo-usuario")
            .forEach(el => el.style.display = "none");
        document.querySelectorAll("input, textarea, select, button").forEach(el => {
            if (el.classList.contains("tab") || el.classList.contains("permitido-bloqueo")) return;
            el.disabled = true;
            el.style.opacity = "0.55";
            el.style.cursor = "not-allowed";
        });
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
