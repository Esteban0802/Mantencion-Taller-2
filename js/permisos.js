import { moduloActivo } from "./modulos.js";

const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN_EMPRESA: "admin_empresa",
  ADMIN_SUCURSAL: "admin_sucursal",
  JEFE_TALLER: "jefe_taller",
  USUARIO_TALLER: "usuario_taller"
};

function usuarioValido(usuario) {
  return Boolean(
    usuario &&
    usuario.uid &&
    usuario.activo !== false
  );
}

export function tieneRol(
  usuario,
  rolesPermitidos = []
) {
  if (!usuarioValido(usuario)) return false;

  return rolesPermitidos.includes(usuario.rol);
}

export function perteneceAEmpresa(
  usuario,
  empresa
) {
  if (!usuarioValido(usuario) || !empresa) {
    return false;
  }

  if (usuario.rol === ROLES.SUPER_ADMIN) {
    return true;
  }

  return Boolean(
    usuario.empresaId &&
    empresa.id &&
    usuario.empresaId === empresa.id
  );
}

export function puedeUsarModulo(
  usuario,
  empresa,
  nombreModulo
) {
  if (!usuarioValido(usuario) || !empresa) {
    return false;
  }

  if (!perteneceAEmpresa(usuario, empresa)) {
    return false;
  }

  return moduloActivo(
    empresa,
    nombreModulo
  );
}

export function puedeVerDashboard(
  usuario,
  empresa
) {
  return puedeUsarModulo(
    usuario,
    empresa,
    "dashboard"
  );
}

export function puedeVerOrdenesServicio(
  usuario,
  empresa
) {
  return puedeUsarModulo(
    usuario,
    empresa,
    "ordenesServicio"
  );
}

export function puedeCrearOT(
  usuario,
  empresa
) {
  if (
    !puedeVerOrdenesServicio(usuario, empresa)
  ) {
    return false;
  }

  return tieneRol(usuario, [
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN_EMPRESA,
    ROLES.ADMIN_SUCURSAL,
    ROLES.JEFE_TALLER,
    ROLES.USUARIO_TALLER
  ]);
}

export function puedeAbrirOT(
  usuario,
  empresa
) {
  if (
    !puedeVerOrdenesServicio(usuario, empresa)
  ) {
    return false;
  }

  return tieneRol(usuario, [
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN_EMPRESA,
    ROLES.ADMIN_SUCURSAL,
    ROLES.JEFE_TALLER,
    ROLES.USUARIO_TALLER
  ]);
}



export function puedeVerChecklists(
  usuario,
  empresa
) {
  return (
    puedeVerOrdenesServicio(usuario, empresa) &&
    puedeUsarModulo(
      usuario,
      empresa,
      "checklists"
    )
  );
}

export function puedeCargarChecklists(
  usuario,
  empresa
) {
  if (
    !puedeVerChecklists(usuario, empresa)
  ) {
    return false;
  }

  return tieneRol(usuario, [
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN_EMPRESA,
    ROLES.ADMIN_SUCURSAL,
    ROLES.JEFE_TALLER
  ]);
}

export function puedeCompletarChecklists(
  usuario,
  empresa
) {
  if (
    !puedeVerChecklists(usuario, empresa)
  ) {
    return false;
  }

  return tieneRol(usuario, [
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN_EMPRESA,
    ROLES.ADMIN_SUCURSAL,
    ROLES.JEFE_TALLER,
    ROLES.USUARIO_TALLER
  ]);
}




export function puedeVerGantt(
  usuario,
  empresa
) {
  return (
    puedeVerOrdenesServicio(usuario, empresa) &&
    puedeUsarModulo(usuario, empresa, "gantt")
  );
}

export function puedeVerDespacho(
  usuario,
  empresa
) {
  return (
    puedeVerOrdenesServicio(usuario, empresa) &&
    puedeUsarModulo(usuario, empresa, "despacho")
  );
}

export function puedeVerReportes(
  usuario,
  empresa
) {
  return (
    puedeVerOrdenesServicio(usuario, empresa) &&
    puedeUsarModulo(
      usuario,
      empresa,
      "reportesPDF"
    )
  );
}

export function puedeEntrarPanelEmpresa(
  usuario,
  empresa
) {
  if (!perteneceAEmpresa(usuario, empresa)) {
    return false;
  }

  return tieneRol(usuario, [
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN_EMPRESA
  ]);
}

export function puedeConfigurarModulos(
  usuario
) {
  return tieneRol(usuario, [
    ROLES.SUPER_ADMIN
  ]);
}

export function puedeAdministrarUsuarios(
  usuario,
  empresa
) {
  if (
    !puedeUsarModulo(
      usuario,
      empresa,
      "usuarios"
    )
  ) {
    return false;
  }

  return tieneRol(usuario, [
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN_EMPRESA,
    ROLES.ADMIN_SUCURSAL
  ]);
}