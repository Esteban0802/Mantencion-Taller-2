const CLAVES = ["ingreso", "evaluacion", "mantencion", "pruebas", "despacho"];

export function etapasDePlantilla(plantilla, modulos = {}) {
  return Object.fromEntries(CLAVES.map(clave => {
    const configurada = plantilla.etapasHabilitadas?.[clave];
    const tieneChecklist = Array.isArray(plantilla.checklists?.[clave]) && plantilla.checklists[clave].length > 0;
    // Las plantillas antiguas marcaban Despacho por el plan, sin leer esa hoja.
    const presente = Array.isArray(plantilla.hojasExcel) ? plantilla.hojasExcel.includes(clave) : tieneChecklist;
    return [clave, modulos[clave] !== false && configurada !== false && presente];
  }));
}

export function etapasDeOT(ot, modulos = {}) {
  return Object.fromEntries(CLAVES.map(clave => [clave,
    typeof ot?.etapasHabilitadas?.[clave] === "boolean"
      ? ot.etapasHabilitadas[clave] : modulos[clave] !== false
  ]));
}

export function actualizarVisibilidadFlujo(timeline, ot) {
  if (!timeline) return;
  timeline.hidden = !ot?.id;
  if (timeline.hidden) timeline.style.setProperty("display", "none", "important");
  else timeline.style.removeProperty("display");
}
