export function identidadDeSucursal(empresa = {}, sucursal = {}) {
  const propia = sucursal.identidadVisual || {};
  return {
    ...empresa,
    colorPrimario: propia.colorPrimario || empresa.colorPrimario,
    colorSecundario: propia.colorSecundario || empresa.colorSecundario,
    brandingInforme: { ...(empresa.brandingInforme || {}), ...(propia.brandingInforme || {}) }
  };
}

export function combinarPlantillasSucursal(generales = [], propias = []) {
  // El primer argumento se conserva por compatibilidad; ya no se heredan generales.
  return propias.filter(p => p.activa !== false)
    .sort((a, b) => String(a.gama || "").localeCompare(String(b.gama || ""), "es"));
}
