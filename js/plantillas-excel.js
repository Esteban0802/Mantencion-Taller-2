export const ETAPAS_EXCEL = [
  { key: "ingreso", nombre: "Ingreso", aliases: ["ingreso"] },
  { key: "evaluacion", nombre: "Evaluación", aliases: ["evaluacion"] },
  { key: "mantencion", nombre: "Mantención", aliases: ["mantencion", "mantenimiento", "overhaul"] },
  { key: "pruebas", nombre: "Pruebas", aliases: ["pruebas", "prueba"] },
  { key: "despacho", nombre: "Despacho", aliases: ["despacho"] }
];
const normalizar = valor => String(valor).trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export function procesarLibroPlantilla(workbook, modulos, utils) {
  if (modulos.checklists === false) throw Error("El módulo de checklists no está habilitado.");
  if (!workbook.SheetNames.length || workbook.SheetNames.length > 50) throw Error("El archivo debe tener entre 1 y 50 etapas.");
  const etapas = workbook.SheetNames.map((nombre, i) => {
    const filas = utils.sheet_to_json(workbook.Sheets[nombre], { header: 1 }).flat()
      .map(v => String(v ?? "").trim()).filter(Boolean);
    if (!filas.length) throw Error(`La hoja ${nombre} está vacía. Cada hoja debe contener las actividades de su etapa.`);
    if (filas.length > 400 || filas.some(v => v.length > 240)) throw Error(`La hoja ${nombre} supera 400 actividades o contiene una actividad de más de 240 caracteres.`);
    return { id: `e_${i}`, nombre, items: filas.map(item => ({ item })) };
  });
  const totalLibre = etapas.reduce((n, e) => n + e.items.length, 0);
  if (totalLibre > 2000) throw Error("El archivo supera las 2.000 actividades.");
  const checklists = {}, etapasHabilitadas = {}, hojasExcel = [], ignoradas = [];
  for (const etapa of ETAPAS_EXCEL) {
    const nombre = workbook.SheetNames.find(n => etapa.aliases.includes(normalizar(n)));
    const activa = Boolean(nombre) && modulos[etapa.key] === true;
    etapasHabilitadas[etapa.key] = activa;
    if (nombre) hojasExcel.push(etapa.key);
    if (nombre && !activa) ignoradas.push(etapa.nombre);
    const items = activa ? utils.sheet_to_json(workbook.Sheets[nombre], { header: 1 }).flat()
      .map(v => String(v ?? "").trim()).filter(Boolean).slice(0, 400).map(item => ({ item: item.slice(0, 240) })) : [];
    if (activa && !items.length) throw Error(`La hoja ${etapa.nombre} está vacía.`);
    checklists[etapa.key] = items;
  }
  const total = Object.values(checklists).reduce((suma, items) => suma + items.length, 0);
  return { checklists, etapasHabilitadas, hojasExcel, total: totalLibre, ignoradas, flujoVersion: 2, etapas };
}
