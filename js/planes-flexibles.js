export const MODULOS_COMERCIALES = Object.freeze([
  { key: "inventario_repuestos", nombre: "Inventario y repuestos", flags: ["inventario", "repuestos"] },
  { key: "programacion", nombre: "Programación del personal", flags: ["programacion"] },
  { key: "gantt", nombre: "Carta Gantt y exportaciones", flags: ["gantt", "reportesPDF"] },
  { key: "sheq", nombre: "SHEQ y acreditaciones", flags: ["sheq"] },
  { key: "analitica", nombre: "Analítica y alertas", flags: ["analitica", "alertas"] },
  { key: "aprobaciones", nombre: "Aprobaciones avanzadas", flags: ["aprobaciones"] }
]);

export const MODULOS_NUCLEO = Object.freeze([
  "dashboard", "usuarios", "sucursales", "ordenesServicio", "checklists",
  "ingreso", "evaluacion", "mantencion", "pruebas", "despacho",
  "evidencias", "comentarios", "clientes", "equipos"
]);

export const PLANES_FLEXIBLES_BASE = Object.freeze([
  {
    id: "esencial", nombre: "Esencial",
    descripcion: "Para talleres pequeños que necesitan digitalizar y ordenar sus OT.",
    maxUsuarios: 25, maxOTMensuales: 75, maxSucursales: 1, maxStorageGB: 25,
    maxModulosElegibles: 2, precioMensualNeto: 390000, precioAnualNeto: 4000000,
    modulosIncluidos: ["inventario_repuestos", "gantt"], destacado: false
  },
  {
    id: "profesional", nombre: "Profesional",
    descripcion: "Para talleres medianos que coordinan distintas áreas y requieren mayor control.",
    maxUsuarios: 60, maxOTMensuales: 180, maxSucursales: 2, maxStorageGB: 75,
    maxModulosElegibles: 5, precioMensualNeto: 790000, precioAnualNeto: 8200000,
    modulosIncluidos: ["inventario_repuestos", "programacion", "gantt", "sheq", "aprobaciones"],
    destacado: true
  },
  {
    id: "operacion", nombre: "Operación",
    descripcion: "Para una operación mediana con el flujo completo del taller.",
    maxUsuarios: 100, maxOTMensuales: 300, maxSucursales: 3, maxStorageGB: 150,
    maxModulosElegibles: 6, precioMensualNeto: 1200000, precioAnualNeto: 12000000,
    modulosIncluidos: MODULOS_COMERCIALES.map(item => item.key), destacado: false
  },
  {
    id: "corporativo", nombre: "Corporativo",
    descripcion: "Para organizaciones con varias sucursales, faenas o empresas relacionadas.",
    maxUsuarios: 250, maxOTMensuales: 1000, maxSucursales: 10, maxStorageGB: 500,
    maxModulosElegibles: 6, precioMensualNeto: 1800000, precioAnualNeto: 21600000,
    modulosIncluidos: MODULOS_COMERCIALES.map(item => item.key), destacado: false
  }
]);

export function normalizarModulosContratados(valor = []) {
  const permitidos = new Set(MODULOS_COMERCIALES.map(item => item.key));
  return [...new Set(Array.isArray(valor) ? valor : [])].filter(key => permitidos.has(key));
}

export function inferirModulosContratados(modulos = {}) {
  return MODULOS_COMERCIALES
    .filter(modulo => modulo.flags.some(flag => modulos?.[flag] === true))
    .map(modulo => modulo.key);
}

export function expandirModulosContratados(seleccion = []) {
  const contratados = normalizarModulosContratados(seleccion);
  const modulos = {};
  MODULOS_NUCLEO.forEach(key => { modulos[key] = true; });
  MODULOS_COMERCIALES.forEach(modulo => {
    const activo = contratados.includes(modulo.key);
    modulo.flags.forEach(flag => { modulos[flag] = activo; });
  });
  modulos.ia = false;
  return modulos;
}

export function validarSeleccionModulos(seleccion, maximo) {
  const normalizados = normalizarModulosContratados(seleccion);
  const limite = Math.max(0, Number(maximo || 0));
  return {
    valida: true,
    excedeReferencia: limite > 0 && normalizados.length > limite,
    seleccion: normalizados,
    maximo: limite
  };
}
