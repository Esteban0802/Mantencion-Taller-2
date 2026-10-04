function textoNormalizado(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function fechaISO(valor) {
  if (!valor) return "";
  if (typeof valor === "string") return valor.slice(0, 10);
  if (typeof valor.toDate === "function") return valor.toDate().toISOString().slice(0, 10);
  if (valor instanceof Date && !Number.isNaN(valor.valueOf())) return valor.toISOString().slice(0, 10);
  return "";
}

function diasHasta(valor, hoy = new Date()) {
  const iso = fechaISO(valor);
  if (!iso) return null;
  const base = new Date(hoy);
  base.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(`${iso}T00:00:00`) - base) / 86400000);
}

export function estadoDocumentoAcreditacion(documento, hoy = new Date()) {
  const dias = diasHasta(documento?.fechaVencimiento, hoy);
  if (dias !== null && dias < 0) return { key: "vencido", texto: "Vencido", dias };
  if (documento?.estado === "rechazado") return { key: "rechazado", texto: "Rechazado", dias };
  if (documento?.estado === "observado") return { key: "observado", texto: "Observado", dias };
  if (documento?.estado !== "aprobado") return { key: "pendiente", texto: "Pendiente", dias };
  if (dias !== null && dias <= 15) return { key: "critico", texto: `Vence en ${dias} días`, dias };
  if (dias !== null && dias <= 30) return { key: "proximo", texto: `Vence en ${dias} días`, dias };
  if (dias !== null && dias <= 90) return { key: "aviso", texto: `Vence en ${dias} días`, dias };
  return { key: "vigente", texto: "Vigente", dias };
}

const calidadDocumento = {
  vigente: 0,
  aviso: 1,
  proximo: 2,
  critico: 3,
  pendiente: 4,
  observado: 5,
  rechazado: 6,
  vencido: 7
};

export function evaluarRequisito(requisito, documentos, contratoId, hoy = new Date()) {
  const buscado = textoNormalizado(requisito);
  const candidatos = documentos
    .filter(item => textoNormalizado(item.tipoDocumento) === buscado)
    .filter(item => !item.contratoId || item.contratoId === contratoId)
    .map(documento => ({ documento, estado: estadoDocumentoAcreditacion(documento, hoy) }))
    .sort((a, b) => calidadDocumento[a.estado.key] - calidadDocumento[b.estado.key]);

  if (!candidatos.length) {
    return { requisito, key: "faltante", texto: "Documento faltante", documento: null };
  }

  return { requisito, ...candidatos[0].estado, documento: candidatos[0].documento };
}

export function evaluarEntidadEnContrato({ tipo, entidadId, contrato, documentos, hoy = new Date() }) {
  const requisitos = tipo === "vehiculo" ? contrato?.requisitosVehiculos || [] : contrato?.requisitosPersonal || [];
  const propios = documentos.filter(item => item.entidadTipo === tipo && item.entidadId === entidadId);
  const detalles = requisitos.map(requisito => evaluarRequisito(requisito, propios, contrato?.id || "", hoy));

  if (!requisitos.length) {
    return { key: "sin-requisitos", texto: "Sin requisitos definidos", total: 0, cumplidos: 0, detalles };
  }

  const claves = detalles.map(item => item.key);
  let key = "vigente";
  let texto = "Habilitado";
  if (claves.some(item => ["faltante", "vencido", "rechazado"].includes(item))) {
    key = "vencido";
    texto = "No acreditado";
  } else if (claves.some(item => ["pendiente", "observado"].includes(item))) {
    key = "pendiente";
    texto = "Pendiente";
  } else if (claves.some(item => ["aviso", "critico", "proximo"].includes(item))) {
    key = "proximo";
    texto = "Con observaciones";
  }

  const cumplidos = detalles.filter(item => ["vigente", "aviso", "proximo", "critico"].includes(item.key)).length;
  return { key, texto, total: requisitos.length, cumplidos, detalles };
}

export function peorEvaluacion(evaluaciones) {
  const prioridad = { vencido: 5, pendiente: 4, proximo: 3, vigente: 2, "sin-requisitos": 1 };
  return [...evaluaciones].sort((a, b) => (prioridad[b.key] || 0) - (prioridad[a.key] || 0))[0] || null;
}

export { textoNormalizado };
