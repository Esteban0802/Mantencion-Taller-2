const MODULOS_PREDETERMINADOS = {
  dashboard: true,
  usuarios: true,
  sucursales: true,
  clientes: false,
  equipos: false,

  ordenesServicio: true,
  checklists: true,
  evidencias: true,
  comentarios: true,
  aprobaciones: true,
  gantt: true,
  despacho: true,
  reportesPDF: true,

  inventario: false,
  ia: false
};

/**
 * Devuelve todos los módulos de la empresa,
 * combinados con los valores predeterminados.
 */
export function obtenerModulosEmpresa(empresa) {
  return {
    ...MODULOS_PREDETERMINADOS,
    ...(empresa?.modulos || {})
  };
}

/**
 * Comprueba si un módulo está activo.
 */
export function moduloActivo(empresa, nombreModulo) {
  const modulos = obtenerModulosEmpresa(empresa);

  return modulos[nombreModulo] === true;
}

/**
 * Muestra u oculta elementos que tengan:
 * data-modulo="nombreDelModulo"
 */
export function aplicarModulosEnInterfaz(empresa) {
  const modulos = obtenerModulosEmpresa(empresa);

  document.querySelectorAll("[data-modulo]").forEach(elemento => {
    const nombreModulo = elemento.dataset.modulo;
    const activo = modulos[nombreModulo] === true;

    elemento.style.display = activo ? "" : "none";
  });
}