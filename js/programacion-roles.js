export const GRUPOS_PROGRAMACION = ["tecnico", "supervisor", "sheq"];

export function grupoProgramacionUsuario(perfil = {}) {
  if (GRUPOS_PROGRAMACION.includes(perfil.cargoProgramacion)) {
    return perfil.cargoProgramacion;
  }

  if (["tecnico", "usuario_taller"].includes(perfil.rol)) return "tecnico";
  if (["supervisor", "jefe_taller"].includes(perfil.rol)) return "supervisor";
  if (perfil.rol === "sheq") return "sheq";
  return null;
}

export function etiquetaRolProgramacion(perfil = {}) {
  const grupo = grupoProgramacionUsuario(perfil);
  if (grupo === "sheq") return "SHEQ";
  if (grupo === "supervisor") return perfil.rol === "jefe_taller" ? "Jefe de taller" : "Supervisor";
  if (grupo === "tecnico") return "Técnico";
  if (perfil.rol === "admin_empresa") return "Administrador de empresa";
  if (perfil.rol === "admin_sucursal") return "Administrador de sucursal";
  if (perfil.rol === "planificador") return "Planificador";
  if (perfil.rol === "bodeguero") return "Bodeguero";
  return "Sin grupo de programación";
}

export function usuariosDisponiblesPorGrupo(usuarios = [], grupo) {
  return usuarios.filter(usuario => usuario.activo !== false && grupoProgramacionUsuario(usuario) === grupo);
}
