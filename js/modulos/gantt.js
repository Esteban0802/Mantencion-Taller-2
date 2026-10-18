let getOT = null;
let getUsuario = null;

let guardarCambiosOTServicio = null;
let esJefeTallerServicio = null;
let reportesPDFHabilitadosServicio = null;
let ganttHabilitadoServicio = null;

let ot = null;
let usuario = null;

let etapasGanttColapsadas = {};
let recalculandoGantt = false;
let ganttZoom = 100;

const alert = (mensaje) => {
    const texto = String(mensaje || "");
    const tipo = /correctamente|guardad[ao]|generad[ao]/i.test(texto)
        ? "exito"
        : /error|no existe|no hay os/i.test(texto)
            ? "error"
            : "advertencia";
    const titulo = tipo === "exito"
        ? "Operación completada"
        : tipo === "error"
            ? "No fue posible completar la acción"
            : "Revisa la planificación";

    if (window.OverTrackUI?.mostrarMensaje) {
        return window.OverTrackUI.mostrarMensaje({ titulo, mensaje: texto, tipo });
    }

    window.alert(texto);
    return Promise.resolve(true);
};


const NOMBRES_ETAPAS = {
    ingreso: "Ingreso",
    evaluacion: "Evaluación",
    overhaul: "Mantención",
    pruebas: "Pruebas",
    despacho: "Despacho",
    despachoPreparacion: "Despacho Preparación",
    despachoFinal: "Despacho Final"
};


export function inicializarModuloGantt(
    dependencias = {}
) {

    getOT = dependencias.getOT;
    getUsuario = dependencias.getUsuario;

    guardarCambiosOTServicio =
        dependencias.guardarCambiosOT;

    esJefeTallerServicio =
        dependencias.esJefeTaller;

    reportesPDFHabilitadosServicio =
        dependencias.reportesPDFHabilitados;

    ganttHabilitadoServicio =
        dependencias.ganttHabilitado;

    validarDependencias({
        getOT,
        getUsuario,
        guardarCambiosOT: guardarCambiosOTServicio,
        esJefeTaller: esJefeTallerServicio,
        reportesPDFHabilitados: reportesPDFHabilitadosServicio,
        ganttHabilitado: ganttHabilitadoServicio
    });

    sincronizarContexto();

    exponerFuncionesGlobales();

    console.log(
        "📦 Módulo Gantt inicializado correctamente"
    );
}


function validarDependencias(dependencias) {

    Object.entries(dependencias).forEach(
        ([nombre, valor]) => {

            if (typeof valor !== "function") {
                throw new Error(
                    `Gantt: falta la dependencia ${nombre}.`
                );
            }
        }
    );
}


function exponerFuncionesGlobales() {

    window.abrirModalGantt = abrirModalGantt;
    window.cerrarModalGantt = cerrarModalGantt;
    window.cerrarModalGanttVisual =
        cerrarModalGanttVisual;

    window.volverFormularioGantt =
        volverFormularioGantt;

    window.generarCartaGantt = generarCartaGantt;
    window.recalcularGanttAutomatico =
        recalcularGanttAutomatico;

    window.cargarGanttGuardado = cargarGanttGuardado;
    window.renderCartaGantt = renderCartaGantt;
    window.renderCartaGanttProject =
        renderCartaGanttProject;

    window.toggleEtapaGantt = toggleEtapaGantt;
    window.zoomGantt = zoomGantt;
    window.irHoyGantt = irHoyGantt;

    window.actualizarEstadoGanttDesdeChecklist =
        actualizarEstadoGanttDesdeChecklist;

    window.descargarGanttExcel =
        descargarGanttExcel;

    window.descargarGanttPDFProfesional =
        descargarGanttPDFProfesional;
}


function sincronizarContexto() {

    ot = getOT?.() || null;
    usuario = getUsuario?.() || null;
}


async function guardarCambiosOT() {

    sincronizarContexto();

    return await guardarCambiosOTServicio();
}


function esJefeTaller() {

    return esJefeTallerServicio?.() === true;
}




export function abrirModalGantt() {

    sincronizarContexto();

  if (!ganttHabilitadoServicio()) {
    alert("El módulo Carta Gantt no está habilitado para esta empresa.");
    return;
  }

  const modalForm = document.getElementById("modalGantt");
  const modalVisual = document.getElementById("modalGanttVisual");

if (ot.gantt && ot.gantt.actividades?.length) {
  cargarFormularioGantt();
  cargarFechasGanttEnFormulario();

  renderCartaGanttProject();

  modalVisual.style.display = "flex";

  return;
}

  if (!esJefeTaller()) {
    alert("La Carta Gantt todavía no ha sido creada por el Jefe de Taller.");
    return;
  }

  // 🔥 PRIMER INGRESO
  cargarFormularioGantt();

  modalForm.style.display = "flex";
}

function cargarFormularioGantt() {

  if (!ot?.gantt) return;

  const setValue = (id, valor) => {
    const el = document.getElementById(id);

    if (el) {
      el.value = valor ?? "";
    }
  };

  setValue("ganttFechaInicio", ot.gantt.fechaInicio);
  setValue("ganttFechaTermino", ot.gantt.fechaTermino);
  setValue("ganttFechaSolicitudRepuestos", ot.gantt.fechaSolicitudRepuestos);
  setValue("ganttDiasRepuestos", ot.gantt.diasRepuestos || 0);
  setValue("ganttComentarioRepuestos", ot.gantt.comentarioRepuestos || "");
}


function cargarFechasGanttEnFormulario() {

  if (!ot?.gantt) return;

  const setValue = (id, value) => {
    const input = document.getElementById(id);

    if (input && value) {
      input.value = String(value).slice(0, 10);
    }
  };

  if (Array.isArray(ot.gantt.etapas)) {

    const getEtapa = nombre =>
      ot.gantt.etapas.find(e => e.etapa === nombre);

    const cargarEtapa = (nombre, idInicio, idTermino) => {

      const etapa = getEtapa(nombre);

      if (!etapa) return;

      setValue(idInicio, etapa.inicio);
      setValue(idTermino, etapa.termino);
    };

    cargarEtapa(
      "Ingreso",
      "ganttIngresoInicio",
      "ganttIngresoTermino"
    );

    cargarEtapa(
      "Evaluación",
      "ganttEvaluacionInicio",
      "ganttEvaluacionTermino"
    );

    cargarEtapa(
      NOMBRES_ETAPAS.overhaul,
      "ganttOverhaulInicio",
      "ganttOverhaulTermino"
    );

    const pruebasMecanicasAnterior = getEtapa("Pruebas Mecánicas");
    const pruebasElectricasAnterior = getEtapa("Pruebas Eléctricas");
    const etapasPruebasAnteriores = [pruebasMecanicasAnterior, pruebasElectricasAnterior].filter(Boolean);
    const etapaPruebas = getEtapa("Pruebas") || (etapasPruebasAnteriores.length ? {
      inicio: etapasPruebasAnteriores.map(etapa => etapa.inicio).sort()[0],
      termino: etapasPruebasAnteriores.map(etapa => etapa.termino).sort().at(-1)
    } : null);
    if (etapaPruebas) {
      setValue("ganttPruebasInicio", etapaPruebas.inicio);
      setValue("ganttPruebasTermino", etapaPruebas.termino);
    }

    cargarEtapa(
      NOMBRES_ETAPAS.despacho,
      "ganttDespachoInicio",
      "ganttDespachoTermino"
    );
  }
}


export function cerrarModalGantt() {
  const modal = document.getElementById("modalGantt");
  if (modal) modal.style.display = "none";
}

function sumarDias(fecha, dias) {

  const nueva = new Date(fecha);

  let diasAgregados = 0;

  while (diasAgregados < dias) {

    nueva.setDate(nueva.getDate() + 1);

    const diaSemana = nueva.getDay();

    // 0 = domingo
    // 6 = sábado

    if (diaSemana !== 0 && diaSemana !== 6) {
      diasAgregados++;
    }
  }

  return nueva;
}

function formatearFecha(fecha) {
  return new Date(fecha).toLocaleDateString("es-CL");
}

function obtenerActividadesDesdeChecklist(
  etapa,
  checklist,
  fechaInicio,
  diasPorItem = 1
) {

  const actividades = [];

  if (!checklist || checklist.length === 0) {
    return actividades;
  }

  let fechaCursor = new Date(fechaInicio);

  checklist.forEach((item) => {

    actividades.push({
      etapa,
      actividad: item.item,
      inicio: fechaCursor.toISOString(),
      termino: sumarDias(fechaCursor, diasPorItem).toISOString(),
      duracion: diasPorItem,

      estado: item.ok
        ? "Completado"
        : "Planificado"
    });

    fechaCursor = sumarDias(
      fechaCursor,
      diasPorItem
    );

  });

  return actividades;
}

function obtenerActividadesDesdeChecklistDistribuido(
  etapa,
  checklist,
  fechaInicio,
  fechaTermino
) {

  const actividades = [];

  if (!checklist || checklist.length === 0) {
    return actividades;
  }

  const cantidadItems = checklist.length;
  const inicioRango = new Date(fechaInicio);
  const terminoRango = new Date(`${normalizarFechaGantt(fechaTermino)}T00:00:00`);
  const diasHabilesDisponibles = [];

  for (
    let cursor = new Date(inicioRango);
    cursor <= terminoRango;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const diaSemana = cursor.getDay();

    if (diaSemana !== 0 && diaSemana !== 6) {
      diasHabilesDisponibles.push(new Date(cursor));
    }
  }

  // Si toda la etapa cae en fin de semana, se conserva la fecha inicial
  // impuesta en vez de desplazar las tareas fuera de su rango.
  if (diasHabilesDisponibles.length === 0) {
    diasHabilesDisponibles.push(new Date(inicioRango));
  }

  const cantidadDias = diasHabilesDisponibles.length;

  checklist.forEach((item, indice) => {
    const indiceInicio = Math.min(
      cantidadDias - 1,
      Math.floor((indice * cantidadDias) / cantidadItems)
    );
    const finExclusivo = Math.floor(
      ((indice + 1) * cantidadDias) / cantidadItems
    );
    const indiceTermino = Math.min(
      cantidadDias - 1,
      Math.max(indiceInicio, finExclusivo - 1)
    );
    const inicioActividad = diasHabilesDisponibles[indiceInicio];
    const terminoActividad = diasHabilesDisponibles[indiceTermino];
    const duracion = indiceTermino - indiceInicio + 1;

    actividades.push({
      etapa,
      actividad: item.item || "Actividad",
      inicio: inicioActividad.toISOString(),
      termino: terminoActividad.toISOString(),
      duracion,
      estado: item.ok ? "Completado" : "Planificado"
    });
  });

  return actividades;
}


export function cerrarModalGanttVisual() {
  const modal = document.getElementById("modalGanttVisual");
  if (modal) modal.style.display = "none";
}

export function volverFormularioGantt() {

    sincronizarContexto();

  if (!esJefeTaller()) {
    alert("Solo el Jefe de Taller puede modificar la Carta Gantt.");
    return;
  }

  const visual = document.getElementById("modalGanttVisual");
  const form = document.getElementById("modalGantt");

  if (visual) visual.style.display = "none";
  if (form) form.style.display = "flex";

  cargarFormularioGantt();
  cargarFechasGanttEnFormulario();
}


function normalizarFechaGantt(fecha) {
  if (!fecha) return "";

  // Si viene como ISO:
  // 2026-07-18T00:00:00.000Z
  if (String(fecha).includes("T")) {
    return String(fecha).split("T")[0];
  }

  // Si ya viene como YYYY-MM-DD
  return String(fecha);
}



export async function generarCartaGantt(
    modo = "manual"
) {

    sincronizarContexto();

  if (!esJefeTaller()) {
    alert("Solo Jefe de Taller puede generar Carta Gantt");
    return;
  }

  if (!ot) {
    alert("No hay OS cargada");
    return;
  }

  const fechaInicioInput =
  modo === "manual"
    ? document.getElementById("ganttFechaInicio").value
    : ot.gantt?.fechaInicio;

const fechaTerminoInput =
  modo === "manual"
    ? document.getElementById("ganttFechaTermino").value
    : ot.gantt?.fechaTermino;

const diasRepuestos =
  modo === "manual"
    ? Number(document.getElementById("ganttDiasRepuestos").value || 0)
    : Number(ot.gantt?.diasRepuestos || 0);

const fechaSolicitudRepuestos =
  modo === "manual"
    ? document.getElementById("ganttFechaSolicitudRepuestos").value
    : ot.gantt?.fechaSolicitudRepuestos;

const comentarioRepuestos =
  modo === "manual"
    ? document.getElementById("ganttComentarioRepuestos").value.trim()
    : ot.gantt?.comentarioRepuestos || "";

  if (!fechaInicioInput || !fechaTerminoInput) {
  if (modo === "manual") {
    alert("Debes indicar fecha inicio y término");
  } else {
    console.warn(
      "No se recalculó la Carta Gantt: faltan fecha de inicio o término."
    );
  }

  return false;
}

  const fechaTermino =
  new Date(
    fechaTerminoInput + "T00:00:00"
  );  

  let etapasManuales = [];

if (modo === "manual") {

  etapasManuales = [
    leerEtapaManual(
      "Ingreso",
      "ganttIngresoInicio",
      "ganttIngresoTermino"
    ),

    leerEtapaManual(
      "Evaluación",
      "ganttEvaluacionInicio",
      "ganttEvaluacionTermino"
    ),

    leerEtapaManual(
      NOMBRES_ETAPAS.overhaul,
      "ganttOverhaulInicio",
      "ganttOverhaulTermino"
    ),

    leerEtapaManual(
      "Pruebas",
      "ganttPruebasInicio",
      "ganttPruebasTermino"
    ),

    leerEtapaManual(
      NOMBRES_ETAPAS.despacho,
      "ganttDespachoInicio",
      "ganttDespachoTermino"
    )
  ];

  if (etapasManuales.some(etapa => etapa === null)) {
    alert("Debes completar las fechas de todas las etapas");
    return false;
  }

} else {

  etapasManuales = Array.isArray(ot.gantt?.etapas)
    ? ot.gantt.etapas.map(etapa => ({
        etapa: etapa.etapa,
        inicio: normalizarFechaGantt(etapa.inicio),
        termino: normalizarFechaGantt(etapa.termino)
      }))
    : [];

  if (etapasManuales.length === 0) {
    console.warn(
      "No se recalculó la Carta Gantt: no existe una planificación previa."
    );

    return false;
  }
}

  const etapaConRangoInvalido = etapasManuales.find(etapa => {
    const inicio = new Date(`${etapa.inicio}T00:00:00`);
    const termino = new Date(`${etapa.termino}T00:00:00`);

    return Number.isNaN(inicio.getTime()) ||
      Number.isNaN(termino.getTime()) ||
      termino < inicio;
  });

  if (etapaConRangoInvalido) {
    const mensaje = `La fecha de término de ${etapaConRangoInvalido.etapa} no puede ser anterior a su fecha de inicio.`;

    if (modo === "manual") {
      alert(mensaje);
    } else {
      console.warn(`No se recalculó la Carta Gantt: ${mensaje}`);
    }

    return false;
  }

  const diasTotales =
    Math.ceil(
      (fechaTermino - new Date(fechaInicioInput + "T00:00:00")) /
      (1000 * 60 * 60 * 24)
  );

  if (diasTotales <= 0) {
  if (modo === "manual") {
    alert(
      "La fecha término debe ser mayor a la fecha inicio"
    );
  } else {
    console.warn(
      "No se recalculó la Carta Gantt: rango de fechas inválido."
    );
  }

  return false;
}

  const actividades = [];

  const crear = (etapa, actividad, inicio, duracion, estado = "Planificado") => {
    const termino = sumarDias(inicio, duracion - 1);

    return {
      etapa,
      actividad,
      inicio: inicio.toISOString(),
      termino: termino.toISOString(),
      duracion: Number(duracion),
      estado
    };
  };


  const etapasPlanificadas = [];

function agregarEtapaPlanificada(etapa, inicio, duracion, tipoDias = "habiles") {
  const inicioEtapa = new Date(inicio);

  const terminoEtapa =
    tipoDias === "corridos"
      ? sumarDiasNaturales(inicioEtapa, duracion - 1)
      : sumarDias(inicioEtapa, duracion - 1);

  etapasPlanificadas.push({
    etapa,
    inicio: inicioEtapa.toISOString(),
    termino: terminoEtapa.toISOString(),
    duracion,
    tipoDias
  });
}

// =========================
// INGRESO
// =========================

console.log("Modo:", modo);
console.log("Etapas:", etapasManuales);

console.log("Gantt:", ot.gantt);


console.log("=== ETAPAS DISPONIBLES ===");

etapasManuales.forEach(etapa => {
    console.log(etapa);
});


const etapaIngreso =
  obtenerEtapaManual(
    etapasManuales,
    "Ingreso"
  );


console.log("Resultado de obtenerEtapaManual:", etapaIngreso);

const inicioIngreso =
  new Date(
    etapaIngreso.inicio + "T00:00:00"
  );

const diasIngreso =
  diasEntreFechasHabiles(
    etapaIngreso.inicio,
    etapaIngreso.termino
  );

agregarEtapaPlanificada(
  "Ingreso",
  inicioIngreso,
  diasIngreso
);

const ingresoActs =
  obtenerActividadesDesdeChecklistDistribuido(
    "Ingreso",
    ot.ingreso,
    inicioIngreso,
    etapaIngreso.termino
  );

actividades.push(...ingresoActs);

// =========================
// EVALUACIÓN
// =========================

const etapaEvaluacion =
  obtenerEtapaManual(
    etapasManuales,
    "Evaluación"
  );

const inicioEvaluacion =
  new Date(
    etapaEvaluacion.inicio + "T00:00:00"
  );

const diasEvaluacion =
  diasEntreFechasHabiles(
    etapaEvaluacion.inicio,
    etapaEvaluacion.termino
  );

agregarEtapaPlanificada(
  "Evaluación",
  inicioEvaluacion,
  diasEvaluacion
);

const evalActs =
  obtenerActividadesDesdeChecklistDistribuido(
    "Evaluación",
    ot.evaluacion,
    inicioEvaluacion,
    etapaEvaluacion.termino
  );

actividades.push(...evalActs);

// =========================
// REPUESTOS
// =========================
if (diasRepuestos > 0) {

  if (!fechaSolicitudRepuestos) {
  if (modo === "manual") {
    alert(
      "Debes ingresar la fecha solicitud repuestos"
    );
  } else {
    console.warn(
      "No se recalculó la Carta Gantt: falta la fecha de solicitud de repuestos."
    );
  }

  return false;
}

  const inicioRepuestos = new Date(
    fechaSolicitudRepuestos + "T00:00:00"
  );

  const terminoRepuestos = sumarDiasNaturales(
    inicioRepuestos,
    diasRepuestos - 1
  );

  actividades.push({
    etapa: "Repuestos",
    actividad: comentarioRepuestos || "Espera repuestos",
    inicio: inicioRepuestos.toISOString(),
    termino: terminoRepuestos.toISOString(),
    duracion: diasRepuestos,
    estado: "Espera"
  });
}

// =========================
// OVERHAUL
// =========================

const etapaOverhaul =
  obtenerEtapaManual(
    etapasManuales,
    NOMBRES_ETAPAS.overhaul
  ) ||
  obtenerEtapaManual(
    etapasManuales,
    "Overhaul"
  );

if (!etapaOverhaul) {
  console.warn("No se encontró la etapa Mantención en la Carta Gantt");
  return false;
}

const inicioOverhaul =
  new Date(
    etapaOverhaul.inicio + "T00:00:00"
  );

const diasOverhaul =
  diasEntreFechasHabiles(
    etapaOverhaul.inicio,
    etapaOverhaul.termino
  );

agregarEtapaPlanificada(
  NOMBRES_ETAPAS.overhaul,
  inicioOverhaul,
  diasOverhaul
);

const overhaulActs =
  obtenerActividadesDesdeChecklistDistribuido(
    NOMBRES_ETAPAS.overhaul,
    ot.overhaul,
    inicioOverhaul,
    etapaOverhaul.termino
  );

actividades.push(...overhaulActs);

// =========================
// PRUEBAS
// =========================

const pruebasMecanicasAnterior = obtenerEtapaManual(etapasManuales, "Pruebas Mecánicas");
const pruebasElectricasAnterior = obtenerEtapaManual(etapasManuales, "Pruebas Eléctricas");
const etapasPruebasAnteriores = [pruebasMecanicasAnterior, pruebasElectricasAnterior].filter(Boolean);
const etapaPruebas = obtenerEtapaManual(etapasManuales, "Pruebas") || (etapasPruebasAnteriores.length ? {
  inicio: etapasPruebasAnteriores.map(etapa => etapa.inicio).sort()[0],
  termino: etapasPruebasAnteriores.map(etapa => etapa.termino).sort().at(-1)
} : null);

const inicioPruebas = new Date(etapaPruebas.inicio + "T00:00:00");
const diasPruebas = diasEntreFechasHabiles(etapaPruebas.inicio, etapaPruebas.termino);

agregarEtapaPlanificada("Pruebas", inicioPruebas, diasPruebas);

const listaPruebas = Array.isArray(ot.pruebas?.general)
  ? ot.pruebas.general
  : [...(ot.pruebas?.mecanico || []), ...(ot.pruebas?.electrico || [])];

const pruebasActs = obtenerActividadesDesdeChecklistDistribuido(
  "Pruebas",
  listaPruebas,
  inicioPruebas,
  etapaPruebas.termino
);

actividades.push(...pruebasActs);

// =========================
// DESPACHO
// =========================

// Las cartas antiguas no tenían planificación manual de Despacho. Durante
// su recálculo se conserva compatibilidad usando la fecha final existente.
const etapaDespacho = obtenerEtapaManual(etapasManuales, NOMBRES_ETAPAS.despacho) || {
  inicio: fechaTerminoInput,
  termino: fechaTerminoInput
};

const inicioDespacho = new Date(etapaDespacho.inicio + "T00:00:00");
const terminoDespacho = new Date(etapaDespacho.termino + "T00:00:00");

if (terminoDespacho > fechaTermino) {
  fechaTermino.setTime(terminoDespacho.getTime());
}

// Despacho es la última etapa del proyecto. Si la fecha general ingresada es
// posterior, se extiende esta etapa hasta esa fecha para que ambas coincidan.
const terminoDespachoEfectivo = new Date(fechaTermino);
const diasDespacho = Math.max(
  1,
  calcularDiasHabilesEntreIncluyendoFinal(
    inicioDespacho,
    terminoDespachoEfectivo
  )
);

agregarEtapaPlanificada(
  NOMBRES_ETAPAS.despacho,
  inicioDespacho,
  diasDespacho
);

actividades.push(crear(
  NOMBRES_ETAPAS.despacho,
  "Preparación, documentación y entrega final",
  inicioDespacho,
  diasDespacho,
  ot.despachoAprobado === true || ot.cerrada === true ? "Completado" : "Planificado"
));

const ultimaActividad =
  actividades
    .filter(a => a.etapa !== "Repuestos")
    .map(a => new Date(a.termino).getTime());

//const fechaFinalTrabajo = new Date(Math.max(...ultimaActividad));

//if (fechaFinalTrabajo > fechaTermino) {
  //alert(
    //"La planificación técnica supera la fecha término ingresada. Aumenta la fecha final o reduce actividades."
  //);
  //return;
//}


// 🔥 Ajustar también la etapa visual planificada
const ultimaEtapaTecnica = [...etapasPlanificadas]
  .reverse()
  .find(e => e.etapa !== "Repuestos");

if (ultimaEtapaTecnica) {
  ultimaEtapaTecnica.termino = fechaTermino.toISOString();

  ultimaEtapaTecnica.duracion =
    Math.max(
      1,
      calcularDiasHabilesEntreIncluyendoFinal(
        new Date(ultimaEtapaTecnica.inicio),
        fechaTermino
      )
    );
}

  ot.gantt = {
  fechaInicio: fechaInicioInput,
  fechaTermino: normalizarFechaGantt(fechaTermino.toISOString()),
  fechaDespachoEstimada: fechaTermino.toISOString(),
  fechaSolicitudRepuestos,
  diasRepuestos,
  comentarioRepuestos,
  creadoPor: usuario?.nombre || "Jefe Taller",
  fechaCreacion: new Date().toLocaleString(),
  actividades,
  etapas: etapasPlanificadas
};

  await guardarCambiosOT();

  if (modo === "manual") {

  const form = document.getElementById("modalGantt");
  const visual = document.getElementById("modalGanttVisual");

  if (form) form.style.display = "none";
  if (visual) visual.style.display = "flex";

  renderCartaGanttProject();

  alert("Carta Gantt guardada correctamente ✅");

} else {

  renderCartaGanttProject();

}
}

function leerEtapaManual(nombre, idInicio, idTermino) {
  const inicio = document.getElementById(idInicio)?.value;
  const termino = document.getElementById(idTermino)?.value;

  if (!inicio || !termino) {
    return null;
  }

  return {
    etapa: nombre,
    inicio,
    termino
  };
}

function obtenerEtapaManual(etapasManuales, nombre) {
  return etapasManuales.find(e => e.etapa === nombre);
}

function diasEntreFechasHabiles(inicioStr, terminoStr) {
  return calcularDiasHabilesEntreIncluyendoFinal(
    new Date(inicioStr + "T00:00:00"),
    new Date(terminoStr + "T00:00:00")
  );
}


export async function recalcularGanttAutomatico() {

    sincronizarContexto();

  if (!esJefeTaller()) return;
  if (recalculandoGantt) return;
  if (!ot?.gantt?.actividades?.length) return;

  try {
    recalculandoGantt = true;

    await generarCartaGantt("automatico");

    console.log("Carta Gantt recalculada automáticamente ✅");

  } catch (error) {
    console.error("Error recalculando Carta Gantt:", error);
  } finally {
    recalculandoGantt = false;
  }
}

export function cargarGanttGuardado() {

    sincronizarContexto();

  const cont = document.getElementById("ganttResultado");

  if (!ot?.gantt) {
    if (cont) cont.innerHTML = "";
    return;
  }

  const g = ot.gantt;

  const fecha = document.getElementById("ganttFechaInicio");
  const termino = document.getElementById("ganttFechaTermino");
  const rep = document.getElementById("ganttDiasRepuestos");
  const com = document.getElementById("ganttComentarioRepuestos");

  if (fecha) fecha.value = g.fechaInicio || "";
  if (termino) termino.value = g.fechaTermino || "";
  if (rep) rep.value = g.diasRepuestos || 0;
  if (com) com.value = g.comentarioRepuestos || "";

  renderCartaGantt();
}



export function renderCartaGantt() {

    sincronizarContexto();

  const cont = document.getElementById("ganttResultado");
  if (!cont) return;

  if (!ot?.gantt?.actividades?.length) {
    cont.innerHTML = `<p class="sin-alertas">No existe Carta Gantt generada.</p>`;
    return;
  }

  const g = ot.gantt;
  const actividades = g.actividades;

  const fechaInicio = new Date(g.fechaInicio + "T00:00:00");
const fechaTerminoReal = new Date(g.fechaTermino + "T00:00:00");

// Buscar la última fecha real de todas las actividades
const ultimaFechaActividad = new Date(
  Math.max(
    fechaTerminoReal.getTime(),
    ...actividades.map(act =>
      new Date(act.termino).getTime()
    )
  )
);

// Fecha visual con margen extra real
const fechaTerminoVisual = sumarDiasNaturales(
  ultimaFechaActividad,
  14
);

const diasTotales = Math.max(
  1,
  calcularDiasHabilesEntre(
    fechaInicio,
    fechaTerminoVisual
  )
);

  const colores = {
    Ingreso: "azul",
    Evaluación: "azul",
    Repuestos: "naranjo",
    Overhaul: "verde",
    "Pruebas Mecánicas": "morado",
    "Pruebas Eléctricas": "morado",
    Pruebas: "morado",
    Despacho: "cyan"
  };

  const meses = generarMesesGantt(fechaInicio, fechaTerminoVisual);
  const semanas = generarSemanasGantt(fechaInicio, fechaTerminoVisual);
  const anchoSemana = 86;
  const anchoTimeline = Math.max(760, semanas.length * anchoSemana);

  cont.innerHTML = `
    <div class="gantt-dashboard gantt-pro-dashboard">

      <div class="gantt-summary-grid gantt-summary-compact">

        <div class="gantt-summary-card azul">
          <span>🗓️ Fecha inicio</span>
          <strong>${formatearFecha(fechaInicio)}</strong>
        </div>

        <div class="gantt-summary-card verde">
          <span>🏁 Fecha estimada despacho</span>
          <strong>${formatearFecha(fechaTerminoReal)}</strong>
        </div>

        <div class="gantt-summary-card morado">
          <span>⏱ Duración total estimada</span>
          <strong>${diasTotales} días</strong>
          <small>Días hábiles</small>
        </div>

        <div class="gantt-summary-card naranjo">
          <span>👤 Creado por</span>
          <strong>${g.creadoPor || "Jefe Taller"}</strong>
        </div>

      </div>

      <div class="gantt-section-header">
        <h3>📊 Línea de tiempo planificada</h3>

        <div class="gantt-tools">
          <span>Zoom</span>
          <button type="button" onclick="zoomGantt(-10)">−</button>
          <strong id="ganttZoomLabel">100%</strong>
          <button type="button" onclick="zoomGantt(10)">+</button>
          <button type="button" onclick="irHoyGantt()">📅 Hoy</button>
        </div>
      </div>

      <div class="gantt-board gantt-board-pro">
        <div class="gantt-board-inner">

        <div class="gantt-board-header gantt-board-header-pro">
          <div>Etapa</div>
          <div>Actividad</div>

          <div class="gantt-timeline-head" style="width:${anchoTimeline}px;">
            <div class="gantt-months">
              ${meses.map(m => `
                <span style="width:${m.width}%">${m.label}</span>
              `).join("")}
            </div>

            <div class="gantt-weeks">
              ${semanas.map(s => `
                <span>${s}</span>
              `).join("")}
            </div>
          </div>
        </div>

        ${actividades.map((act, index) => {

          const inicio = new Date(act.inicio);
          const termino = new Date(act.termino);

          const MS_DIA = 1000 * 60 * 60 * 24;

const totalDiasVisual = Math.max(
  1,
  Math.ceil((fechaTerminoVisual - fechaInicio) / MS_DIA)
);

const diffInicio = Math.max(
  0,
  Math.ceil((inicio - fechaInicio) / MS_DIA)
);

const diffTermino = Math.max(
  diffInicio + 1,
  Math.ceil((termino - fechaInicio) / MS_DIA) + 1
);

const duracionVisual = Math.max(
  1,
  diffTermino - diffInicio
);

let left = (diffInicio / totalDiasVisual) * 100;
let width = (duracionVisual / totalDiasVisual) * 100;

// Si la actividad queda muy al final, no dejarla fuera de pantalla
if (left > 94) {
  left = 94;
}

// Evitar que la barra se corte al borde derecho
if (left + width > 96) {
  width = 96 - left;
}

// Ancho mínimo visible
width = Math.max(2, width);

const duracion = Math.max(
  1,
  act.duracion || duracionVisual
);


          const completado = act.estado === "Completado";

          const color = completado
            ? "completado"
            : colores[act.etapa] || "azul";

          return `
            <div class="gantt-board-row gantt-board-row-pro">

              <div>
                <span class="gantt-dot ${color}"></span>
                ${act.etapa}
              </div>

              <div>${act.actividad}</div>

              <div class="gantt-board-track gantt-track-pro" style="width:${anchoTimeline}px;">

                ${
                  index > 0
                    ? `<span class="gantt-link"></span>`
                    : ""
                }

                <div
                  class="gantt-board-bar ${color}"
                  style="left:${left}%; width:${width}%;">
                  ${completado ? "✓" : duracion + "d"}
                </div>

              </div>

            </div>
          `;
        }).join("")}

      </div>
      </div>

      <div class="gantt-legend">
        <span><b class="azul"></b> Ingreso</span>
        <span><b class="naranjo"></b> Repuestos</span>
        <span><b class="verde"></b> Mantención</span>
        <span><b class="morado"></b> Pruebas</span>
        <span><b class="cyan"></b> Despacho</span>
      </div>

      <div class="gantt-note">
        ℹ Esta planificación es estimada. Las fechas reales pueden variar según avance del trabajo y disponibilidad de repuestos.
      </div>

    </div>
  `;
}




export function renderCartaGanttProject() {

    sincronizarContexto();

  const cont = document.getElementById("ganttResultado");
  if (!cont) return;

  if (!ot?.gantt?.actividades?.length) {
    cont.innerHTML = `<p class="sin-alertas">No existe Carta Gantt generada.</p>`;
    return;
  }

  const g = ot.gantt;
  const actividades = g.actividades;
  const grupos = agruparActividadesPorEtapa(actividades);
  
  let etapasProject =
    calcularEtapasGanttProject(actividades);

    if (Array.isArray(g.etapas)) {
      etapasProject = etapasProject.map(etapa => {
        const plan = g.etapas.find(e => e.etapa === etapa.etapa);

        if (!plan) return etapa;

        return {
          ...etapa,
          inicio: new Date(plan.inicio),
          termino: new Date(plan.termino),
          duracion: plan.duracion
        };
      });
}
  etapasProject.forEach(grupo => {
    if (etapasGanttColapsadas[grupo.etapa] === undefined) {
      etapasGanttColapsadas[grupo.etapa] = true;
    }
  });
  const MS_DIA = 1000 * 60 * 60 * 24;


  const fechaInicioGlobal =
  new Date(g.fechaInicio + "T00:00:00");

  const fechaFinGlobal =
  new Date(g.fechaTermino + "T00:00:00");

  const totalDias = Math.max(
    1,
    Math.ceil((fechaFinGlobal - fechaInicioGlobal) / MS_DIA) + 1
  );

  const anchoDia = 24;
  const totalSemanas = Math.ceil(totalDias / 7);
  const anchoSemana = anchoDia * 7;
  const anchoTimeline = Math.max(900, totalDias * anchoDia + 120);

  const semanas = [];

  for (let i = 0; i < totalSemanas; i++) {
    const inicioSemana = sumarDiasNaturales(fechaInicioGlobal, i * 7);
    const finSemana = sumarDiasNaturales(inicioSemana, 6);

    semanas.push({
      inicio: inicioSemana,
      fin: finSemana,
      label: `${inicioSemana.toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short"
      }).replace(".", "")} - ${finSemana.toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short"
      }).replace(".", "")}`
    });
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const posicionHoy =
  hoy >= fechaInicioGlobal && hoy <= fechaFinGlobal
    ? Math.ceil((hoy - fechaInicioGlobal) / MS_DIA) * anchoDia
    : null;

  const colores = {
    Ingreso: "azul",
    Evaluación: "azul",
    Repuestos: "naranjo",
    Overhaul: "verde",
    "Pruebas Mecánicas": "morado",
    "Pruebas Eléctricas": "morado",
    Pruebas: "morado",
    Despacho: "cyan"
  };

  cont.innerHTML = `
    <div class="gantt-project">

      <div class="gantt-project-summary">

        <div>
          <span>Inicio</span>
          <strong>${formatearFecha(fechaInicioGlobal)}</strong>
        </div>

        <div>
          <span>Término estimado</span>
          <strong>${formatearFecha(new Date(g.fechaTermino + "T00:00:00"))}</strong>
        </div>

        <div>
          <span>Actividades</span>
          <strong>${actividades.length}</strong>
        </div>

        <div>
          <span>Duración visual</span>
          <strong>${totalDias} días</strong>
        </div>

      </div>

      <p class="gantt-mobile-hint" aria-hidden="true">
        Desliza la carta para recorrer las fechas
      </p>

      <div class="gantt-project-scroll">

        <div class="gantt-project-table" style="--timeline-width:${anchoTimeline}px; --gantt-info-width:520px;">

          <div class="gantt-project-row gantt-project-row-head">

            <div class="gantt-project-info head">
              <div>Etapa</div>
              <div>Actividad</div>
              <div>Inicio</div>
              <div>Fin</div>
              <div>Dur.</div>
            </div>

            <div class="gantt-project-timeline-head" style="width:${anchoTimeline}px;">

              <div class="gantt-project-weeks">
                ${semanas.map(s => `
                  <span style="width:${anchoSemana}px">
                    ${s.label}
                  </span>
                `).join("")}
              </div>

            </div>

          </div>

          <div class="gantt-project-body">

            ${
              posicionHoy !== null
                ? `<div 
                    class="gantt-project-hoy-line"
                    style="left: calc(var(--gantt-info-width, 520px) + ${posicionHoy}px);">
                    <span>HOY</span>
                  </div>`
                : ""
            }

            ${etapasProject.map(grupo => {

  return `

    <div class="gantt-etapa-group">

      <div 
        class="gantt-etapa-title"
        onclick="toggleEtapaGantt('${grupo.etapa}')"
      >
        <span>
          ${etapasGanttColapsadas[grupo.etapa] ? "▶" : "▼"}
        </span>

        <strong>${grupo.etapa}</strong>

        <small>${grupo.actividades.length} actividad(es)</small>
      </div>

      ${(() => {

  let inicio = new Date(grupo.inicio);
let termino = new Date(grupo.termino);

// No permitir que la barra salga del rango visual del proyecto
if (inicio < fechaInicioGlobal) {
  inicio = new Date(fechaInicioGlobal);
}

if (termino > fechaFinGlobal) {
  termino = new Date(fechaFinGlobal);
}

  const diasDesdeInicio =
  Math.ceil(
    (inicio - fechaInicioGlobal) / MS_DIA
  );

const diasDuracion =
  Math.ceil(
    (termino - inicio) / MS_DIA
  ) + 1;

const left = diasDesdeInicio * anchoDia;

let width = diasDuracion * anchoDia;

// ancho mínimo pequeño solo para que se vea
width = Math.max(18, width);

if (left + width > anchoTimeline - 80) {
  width = anchoTimeline - left - 80;
}

width = Math.max(18, width);

  let color = "pendiente";
  let textoBarra = `${grupo.porcentaje}% completado`;

  if (grupo.etapa === "Repuestos") {
    color = "repuestos";
    const resumen = obtenerResumenRepuestosInventario();
    textoBarra = resumen.total > 0
      ? `${resumen.recibidos} de ${resumen.total} recibidos · ${grupo.porcentaje}%`
      : "Sin repuestos vinculados";
  } else if (grupo.porcentaje >= 100) {
    color = "completado";
  } else if (grupo.porcentaje > 0) {
    color = "proceso";
  }

  return `

    <div class="gantt-project-row gantt-project-row-main">

      <div class="gantt-project-info gantt-project-info-main">

        <div class="gantt-etapa-main-title">
          ${grupo.etapa}
        </div>

        <div>
          ${grupo.etapa === "Repuestos" && obtenerResumenRepuestosInventario().total > 0
            ? `${obtenerResumenRepuestosInventario().total} repuesto(s)`
            : `${grupo.total} actividad(es)`}
        </div>

        <div>
          ${formatearFechaGanttCorta(inicio)}
        </div>

        <div>
          ${formatearFechaGanttCorta(termino)}
        </div>

        <div>
          ${grupo.porcentaje}%
        </div>

      </div>

      <div class="gantt-project-track" style="width:${anchoTimeline}px;">

        <div
          class="gantt-project-bar-etapa ${color}"
          style="left:${left}px; width:${width}px;"
        >
          <div 
            class="gantt-project-bar-fill"
            style="width:${grupo.porcentaje}%;">
          </div>

          <span>${textoBarra}</span>
        </div>

      </div>

    </div>

  `;
})()}

      ${
        etapasGanttColapsadas[grupo.etapa]
          ? ""
          : grupo.actividades.map((act) => {

        const inicio = new Date(act.inicio);
        const termino = new Date(act.termino);

        const diffInicio = Math.max(
          0,
          Math.ceil((inicio - fechaInicioGlobal) / MS_DIA)
        );

        const diffTermino = Math.max(
          diffInicio + 1,
          Math.ceil((termino - fechaInicioGlobal) / MS_DIA) + 1
        );

        const diasActividad = Math.max(
          1,
          diffTermino - diffInicio
        );

        const completado = act.estado === "Completado";

        const atrasada =
          !completado &&
          termino < hoy;

        let color = colores[act.etapa] || "azul";

        if (completado) color = "completado";
        if (atrasada) color = "atrasado";

        const duracion = Math.max(
          1,
          act.duracion || diasActividad
        );

        return `
          <div class="gantt-project-row">

            <div class="gantt-project-info">

              <div class="gantt-etapa-empty"></div>

              <div title="${act.actividad}">
                ${act.actividad}
              </div>

              <div>${formatearFechaGanttCorta(inicio)}</div>

              <div>${formatearFechaGanttCorta(termino)}</div>

              <div>${duracion}d</div>

            </div>

            <div class="gantt-project-track gantt-project-track-detail"
                style="width:${anchoTimeline}px;">

              <div class="gantt-detail-line"></div>

            </div>

          </div>
        `;
      }).join("")
}

    </div>

  `;
}).join("")}

          </div>

        </div>

      </div>

    </div>
  `;
}

export function descargarGanttExcel() {

    sincronizarContexto();
  if (!ot?.gantt?.actividades?.length) {
    alert("No existe Carta Gantt para exportar");
    return;
  }

  const inicioProyecto = new Date(ot.gantt.fechaInicio + "T00:00:00");
  const terminoProyecto = new Date(ot.gantt.fechaTermino + "T00:00:00");

  const semanas = [];
  let cursor = new Date(inicioProyecto);

  while (cursor <= terminoProyecto) {
    const inicioSemana = new Date(cursor);
    const finSemana = new Date(cursor);
    finSemana.setDate(finSemana.getDate() + 6);

    semanas.push({
      inicio: inicioSemana,
      fin: finSemana,
      label:
        inicioSemana.toLocaleDateString("es-CL", {
          day: "2-digit",
          month: "short"
        }).replace(".", "") +
        " - " +
        finSemana.toLocaleDateString("es-CL", {
          day: "2-digit",
          month: "short"
        }).replace(".", "")
    });

    cursor.setDate(cursor.getDate() + 7);
  }

  let etapasProject =
    calcularEtapasGanttProject(ot.gantt.actividades);

  if (Array.isArray(ot.gantt.etapas)) {
    etapasProject = etapasProject.map(etapa => {
      const plan = ot.gantt.etapas.find(e => e.etapa === etapa.etapa);

      if (!plan) return etapa;

      return {
        ...etapa,
        inicio: new Date(plan.inicio),
        termino: new Date(plan.termino),
        duracion: plan.duracion
      };
    });
  }

  const encabezados = [
    "Etapa",
    "Inicio",
    "Término",
    "Duración",
    "Actividades",
    "Avance",
    ...semanas.map(s => s.label)
  ];

  const filas = etapasProject.map(etapa => {
    const inicio = new Date(etapa.inicio);
    const termino = new Date(etapa.termino);

    const fila = [
      etapa.etapa || "",
      formatearFecha(inicio),
      formatearFecha(termino),
      etapa.duracion || "",
      etapa.total || etapa.actividades?.length || 0,
      `${etapa.porcentaje || 0}%`
    ];

    semanas.forEach(s => {
      const cruza =
        inicio <= s.fin &&
        termino >= s.inicio;

      fila.push(cruza ? 1 : "");
    });

    return fila;
  });

  const data = [encabezados, ...filas];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);

  const coloresEtapa = {
  "Ingreso": "4472C4",
  "Evaluación": "5B9BD5",
  "Repuestos": "ED7D31",
  [NOMBRES_ETAPAS.overhaul]: "70AD47",
  "Pruebas": "7030A0",
  "Pruebas Mecánicas": "7030A0",
  "Pruebas Eléctricas": "8E44AD",
  "Despacho": "00B0F0"
};

for (let r = 1; r < data.length; r++) {

  const etapa = data[r][0];
  const color = coloresEtapa[etapa] || "808080";

  for (let c = 6; c < data[r].length; c++) {

    const cellRef =
      XLSX.utils.encode_cell({ r, c });

    const cell = ws[cellRef];

    if (!cell || cell.v !== 1) continue;

    cell.v = "";

    cell.s = {
      fill: {
        fgColor: { rgb: color }
      }
    };
  }
}

  ws["!cols"] = [
    { wch: 22 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    ...semanas.map(() => ({ wch: 14 }))
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Carta Gantt");

  XLSX.writeFile(
    wb,
    `Carta_Gantt_${ot.os || "Proyecto"}.xlsx`
  );
}





export function descargarGanttPDFProfesional() {

    sincronizarContexto();

  if (!reportesPDFHabilitadosServicio()) {
    alert("El módulo Informe PDF no está habilitado para esta empresa.");
    return;
  }

  if (!ot?.gantt?.actividades?.length) {
    alert("No existe Carta Gantt para exportar");
    return;
  }

  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const inicioProyecto = new Date(ot.gantt.fechaInicio + "T00:00:00");
  const terminoProyecto = new Date(ot.gantt.fechaTermino + "T00:00:00");

  let etapasProject = calcularEtapasGanttProject(ot.gantt.actividades);

  if (Array.isArray(ot.gantt.etapas)) {
    etapasProject = etapasProject.map(etapa => {
      const plan = ot.gantt.etapas.find(e => e.etapa === etapa.etapa);
      if (!plan) return etapa;

      return {
        ...etapa,
        inicio: new Date(plan.inicio),
        termino: new Date(plan.termino),
        duracion: plan.duracion
      };
    });
  }

  const COLORES = {
    navy: [12, 41, 70],
    blue: [22, 131, 232],
    blueDark: [19, 93, 158],
    green: [31, 169, 96],
    amber: [231, 154, 19],
    red: [215, 72, 88],
    ink: [23, 61, 93],
    muted: [103, 128, 148],
    border: [205, 221, 232],
    soft: [245, 249, 252],
    white: [255, 255, 255]
  };

  const coloresEtapa = {
    "Ingreso": [43, 126, 214],
    "Evaluación": [70, 154, 216],
    "Repuestos": [231, 154, 19],
    [NOMBRES_ETAPAS.overhaul]: [94, 171, 75],
    "Pruebas": [124, 71, 173],
    "Pruebas Mecánicas": [124, 71, 173],
    "Pruebas Eléctricas": [146, 86, 187],
    "Despacho": [0, 166, 214]
  };

  const aclarar = (color, proporcion = 0.78) =>
    color.map(canal => Math.round(canal + (255 - canal) * proporcion));

  const formatearFechaPDF = fecha =>
    new Date(fecha).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC"
    });

  const dibujarMarca = (x, y) => {
    pdf.setFillColor(...COLORES.blue);
    pdf.roundedRect(x, y, 9, 9, 2, 2, "F");
    pdf.setFillColor(...COLORES.white);
    pdf.rect(x + 2.2, y + 2.2, 1.2, 4.6, "F");
    pdf.rect(x + 4.1, y + 1.4, 1.2, 5.4, "F");
    pdf.rect(x + 6, y + 3, 1.2, 3.8, "F");
  };

  const dibujarEncabezado = (titulo, subtitulo) => {
    pdf.setFillColor(...COLORES.white);
    pdf.rect(0, 0, 297, 210, "F");
    pdf.setFillColor(...COLORES.navy);
    pdf.rect(0, 0, 297, 32, "F");
    pdf.setFillColor(...COLORES.blue);
    pdf.rect(0, 31, 297, 1, "F");
    dibujarMarca(14, 10);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(...COLORES.white);
    pdf.text(titulo, 27, 15.5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(205, 225, 240);
    pdf.text(subtitulo, 27, 22);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...COLORES.white);
    pdf.text("VECTARIA", 283, 15, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.8);
    pdf.setTextColor(163, 197, 220);
    pdf.text("CONTROL OPERACIONAL", 283, 21, { align: "right" });
  };

  const dibujarTarjeta = (x, y, ancho, etiqueta, valor, color) => {
    pdf.setFillColor(...COLORES.white);
    pdf.setDrawColor(...COLORES.border);
    pdf.roundedRect(x, y, ancho, 16, 2.5, 2.5, "FD");
    pdf.setFillColor(...color);
    pdf.roundedRect(x, y, 2.4, 16, 1.2, 1.2, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.5);
    pdf.setTextColor(...COLORES.muted);
    pdf.text(etiqueta.toUpperCase(), x + 5, y + 5.3);
    pdf.setFontSize(10);
    pdf.setTextColor(...COLORES.ink);
    const valorCorto = pdf.splitTextToSize(String(valor || "-"), ancho - 9)[0];
    pdf.text(valorCorto, x + 5, y + 11.8);
  };

  const dibujarResumen = (y) => {
    const separacion = 3;
    const ancho = (269 - separacion * 3) / 4;
    dibujarTarjeta(14, y, ancho, "Orden de servicio", ot.os || "-", COLORES.blue);
    dibujarTarjeta(14 + ancho + separacion, y, ancho, "Equipo", ot.equipo || "-", COLORES.green);
    dibujarTarjeta(14 + (ancho + separacion) * 2, y, ancho, "Cliente", ot.cliente || "-", [124, 71, 173]);
    dibujarTarjeta(
      14 + (ancho + separacion) * 3,
      y,
      ancho,
      "Periodo planificado",
      `${formatearFechaPDF(inicioProyecto)} - ${formatearFechaPDF(terminoProyecto)}`,
      COLORES.amber
    );
  };

  const estadoAvance = porcentaje => {
    if (porcentaje >= 100) return "Completado";
    if (porcentaje > 0) return "En progreso";
    return "Pendiente";
  };

  dibujarEncabezado(
    "Carta Gantt",
    "Resumen ejecutivo de planificación, fechas y avance por etapa"
  );
  dibujarResumen(39);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...COLORES.ink);
  pdf.text("Resumen por etapa", 14, 64);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...COLORES.muted);
  pdf.text("Las fechas y porcentajes corresponden al último estado registrado de la OT.", 14, 69);

  const body = etapasProject.map(e => [
    e.etapa,
    formatearFechaPDF(e.inicio),
    formatearFechaPDF(e.termino),
    e.duracion || "",
    e.total || e.actividades?.length || 0,
    `${e.porcentaje || 0}% · ${estadoAvance(e.porcentaje || 0)}`
  ]);

  pdf.autoTable({
    startY: 74,
    head: [["Etapa", "Inicio", "Término", "Duración", "Actividades", "Avance"]],
    body,
    theme: "grid",
    margin: { left: 14, right: 14 },
    styles: {
      fillColor: COLORES.white,
      textColor: COLORES.ink,
      lineColor: COLORES.border,
      lineWidth: 0.18,
      fontSize: 8.5,
      cellPadding: 3.2,
      valign: "middle"
    },
    headStyles: {
      fillColor: COLORES.navy,
      textColor: COLORES.white,
      fontStyle: "bold"
    },
    alternateRowStyles: {
      fillColor: COLORES.soft
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 58 },
      1: { cellWidth: 40 },
      2: { cellWidth: 40 },
      3: { halign: "center", cellWidth: 33 },
      4: { halign: "center", cellWidth: 40 },
      5: { halign: "center", cellWidth: 58 }
    },
    didParseCell: data => {
      if (data.section !== "body" || data.column.index !== 5) return;
      const porcentaje = etapasProject[data.row.index]?.porcentaje || 0;
      data.cell.styles.fontStyle = "bold";
      data.cell.styles.textColor = porcentaje >= 100
        ? COLORES.green
        : porcentaje > 0
          ? COLORES.blueDark
          : COLORES.muted;
    },
    didDrawCell: data => {
      if (data.section !== "body" || data.column.index !== 0) return;
      const etapa = etapasProject[data.row.index]?.etapa;
      const color = coloresEtapa[etapa] || COLORES.muted;
      pdf.setFillColor(...color);
      pdf.rect(data.cell.x, data.cell.y, 1.5, data.cell.height, "F");
    }
  });

  // ===============================
// PÁGINA 2: CARTA GANTT VISUAL
// ===============================

  pdf.addPage();
  dibujarEncabezado(
    "Cronograma visual",
    "Distribución temporal y estado de avance de las etapas de la OT"
  );
  dibujarResumen(39);

  const xNombre = 14;
  const anchoNombre = 66;
  const xTimeline = 87;
  const yInicio = 78;
  const altoFila = 18;
  const anchoTimeline = 196;
  const totalMs = Math.max(1, terminoProyecto - inicioProyecto);

  pdf.setFillColor(...COLORES.soft);
  pdf.setDrawColor(...COLORES.border);
  pdf.roundedRect(14, 61, 269, 10, 2, 2, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...COLORES.ink);
  pdf.text("ETAPA", 18, 67.2);
  pdf.text("LINEA DE TIEMPO DEL PROYECTO", xTimeline, 67.2);
  pdf.setTextColor(...COLORES.blueDark);
  pdf.text(formatearFechaPDF(inicioProyecto), xTimeline, 74);
  pdf.text(formatearFechaPDF(terminoProyecto), xTimeline + anchoTimeline, 74, { align: "right" });

  const divisiones = 6;
  for (let i = 0; i <= divisiones; i++) {
    const x = xTimeline + (anchoTimeline / divisiones) * i;
    pdf.setDrawColor(225, 235, 242);
    pdf.setLineWidth(0.2);
    pdf.line(x, yInicio - 2, x, yInicio + etapasProject.length * altoFila - 3);
  }

etapasProject.forEach((etapa, index) => {
  const y = yInicio + index * altoFila;

  const inicio = new Date(etapa.inicio);
  const termino = new Date(etapa.termino);

  const offsetMs = inicio - inicioProyecto;
  const duracionMs = termino - inicio;

  const left = Math.max(0, (offsetMs / totalMs) * anchoTimeline);
  const width = Math.min(
    anchoTimeline - left,
    Math.max(5, (Math.max(86400000, duracionMs) / totalMs) * anchoTimeline)
  );

  const color = coloresEtapa[etapa.etapa] || [100, 116, 139];
  const porcentaje = etapa.porcentaje || 0;
  const estado = estadoAvance(porcentaje);

  pdf.setFillColor(index % 2 === 0 ? 248 : 243, index % 2 === 0 ? 251 : 248, index % 2 === 0 ? 253 : 251);
  pdf.roundedRect(14, y - 2, 269, 14, 2, 2, "F");
  pdf.setFillColor(...color);
  pdf.roundedRect(xNombre, y + 0.5, 3, 8, 1, 1, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...COLORES.ink);
  pdf.setFontSize(8.2);
  pdf.text(etapa.etapa, xNombre + 6, y + 4);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...COLORES.muted);
  pdf.setFontSize(6.5);
  pdf.text(`${porcentaje}% - ${estado}`, xNombre + 6, y + 8.3);

  pdf.setFillColor(...aclarar(color, 0.79));
  pdf.setDrawColor(...color);
  pdf.setLineWidth(0.35);
  pdf.roundedRect(xTimeline + left, y, width, 9, 2.2, 2.2, "FD");

  if (porcentaje > 0) {
    const anchoAvance = Math.max(2.5, width * Math.min(100, porcentaje) / 100);
    pdf.setFillColor(...color);
    pdf.roundedRect(xTimeline + left, y, anchoAvance, 9, 2.2, 2.2, "F");
  }

  const etiqueta = porcentaje > 0 ? `${porcentaje}%` : "Pendiente";
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.2);
  pdf.setTextColor(...COLORES.ink);
  const textoX = Math.min(xTimeline + left + width + 2, 281);
  pdf.text(etiqueta, textoX, y + 5.8, { align: textoX >= 281 ? "right" : "left" });
});

  const totalPaginas = pdf.getNumberOfPages();

  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    pdf.setPage(pagina);
    pdf.setDrawColor(...COLORES.border);
    pdf.line(14, 199, 283, 199);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.8);
    pdf.setTextColor(...COLORES.muted);
    pdf.text("Documento generado por Vectaria - Control operacional", 14, 204);
    pdf.text(`Página ${pagina} de ${totalPaginas}`, 283, 204, { align: "right" });
  }

  pdf.save(`Carta_Gantt_${ot.os || "Proyecto"}.pdf`);
}




export function toggleEtapaGantt(etapa) {

    sincronizarContexto();
  etapasGanttColapsadas[etapa] =
    !etapasGanttColapsadas[etapa];

  renderCartaGanttProject();
}


function agruparActividadesPorEtapa(actividades) {

  const grupos = [];

  actividades.forEach(act => {
    let grupo = grupos.find(g => g.etapa === act.etapa);

    if (!grupo) {
      grupo = {
        etapa: act.etapa,
        actividades: []
      };

      grupos.push(grupo);
    }

    grupo.actividades.push(act);
  });

  return grupos;
}


function calcularEtapasGanttProject(actividades) {

  const grupos = agruparActividadesPorEtapa(actividades);

  return grupos.map(grupo => {

    const fechasInicio = grupo.actividades.map(a =>
      new Date(a.inicio).getTime()
    );

    const fechasTermino = grupo.actividades.map(a =>
      new Date(a.termino).getTime()
    );

    const inicio = new Date(Math.min(...fechasInicio));
    const termino = new Date(Math.max(...fechasTermino));

    let total = grupo.actividades.length;

    const porcentaje =
      calcularPorcentajeEtapaReal(grupo.etapa);

    let completadas = Math.round(
      (porcentaje / 100) * total
    );

    if (grupo.etapa === "Repuestos") {
      const resumen = obtenerResumenRepuestosInventario();
      if (resumen.total > 0) {
        total = resumen.total;
        completadas = resumen.recibidos;
      }
    }

    return {
      etapa: grupo.etapa,
      actividades: grupo.actividades,
      inicio,
      termino,
      total,
      completadas,
      porcentaje
    };
  });
}


function calcularPorcentajeChecklist(lista) {

  if (!Array.isArray(lista) || lista.length === 0) {
    return 0;
  }

  const completados = lista.filter(item => {

    const check = item.ok === true;
    const fotos = Array.isArray(item.fotos) && item.fotos.length > 0;
    const comentarios = Array.isArray(item.comentarios) && item.comentarios.length > 0;

    return check && fotos && comentarios;

  }).length;

  return Math.round(
    (completados / lista.length) * 100
  );
}

function obtenerResumenRepuestosInventario() {
  const items = Array.isArray(ot?.repuestos?.items)
    ? ot.repuestos.items
    : [];

  const cantidad = item => {
    const valor = Number(String(item?.cantidad ?? "").replace(",", "."));
    return Number.isFinite(valor) && valor > 0 ? valor : 1;
  };
  const total = items.reduce((suma, item) => suma + cantidad(item), 0);
  const recibidos = items
    .filter(item => item.recibidoInventario === true)
    .reduce((suma, item) => suma + cantidad(item), 0);

  return {
    total,
    recibidos,
    pendientes: Math.max(0, total - recibidos),
    porcentaje: total > 0
      ? Math.round((recibidos / total) * 100)
      : 0
  };
}


function calcularPorcentajeEtapaReal(etapa) {

  if (!ot) return 0;

  if (etapa === "Ingreso") {
    return calcularPorcentajeChecklist(ot.ingreso);
  }

  if (etapa === "Evaluación") {
    return calcularPorcentajeChecklist(ot.evaluacion);
  }

  if (etapa === NOMBRES_ETAPAS.overhaul) {
    return calcularPorcentajeChecklist(ot.overhaul);
  }

  if (etapa === "Pruebas" || etapa === "Pruebas Mecánicas" || etapa === "Pruebas Eléctricas") {
    const lista = Array.isArray(ot.pruebas?.general)
      ? ot.pruebas.general
      : [...(ot.pruebas?.mecanico || []), ...(ot.pruebas?.electrico || [])];
    return calcularPorcentajeChecklist(lista);
  }

  if (etapa === "Repuestos") {
    return obtenerResumenRepuestosInventario().porcentaje;
  }

  return 0;
}


function formatearFechaGanttCorta(fecha) {
  return fecha.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit"
  });
}


export function actualizarEstadoGanttDesdeChecklist() {

    sincronizarContexto();

  if (!esJefeTaller()) return;
  if (!ot?.gantt?.actividades?.length) return;

  const buscarItem = (etapa, actividad) => {

    let lista = [];

    if (etapa === "Ingreso") lista = ot.ingreso || [];
    if (etapa === "Evaluación") lista = ot.evaluacion || [];
    if (["Overhaul", NOMBRES_ETAPAS.overhaul].includes(etapa)) lista = ot.overhaul || [];
    if (etapa === "Pruebas" || etapa === "Pruebas Mecánicas" || etapa === "Pruebas Eléctricas") {
      lista = Array.isArray(ot.pruebas?.general)
        ? ot.pruebas.general
        : [...(ot.pruebas?.mecanico || []), ...(ot.pruebas?.electrico || [])];
    }

    return lista.find(item => item.item === actividad);
  };

  ot.gantt.actividades.forEach(act => {

    if (act.etapa === "Repuestos") return;

    const item = buscarItem(act.etapa, act.actividad);

    if (item) {
      act.estado = item.ok ? "Completado" : "Planificado";
    }
  });
}


export function zoomGantt(valor) {
  ganttZoom += valor;

  if (ganttZoom < 80) ganttZoom = 80;
  if (ganttZoom > 150) ganttZoom = 150;

  const label = document.getElementById("ganttZoomLabel");
  if (label) label.textContent = `${ganttZoom}%`;

  const baseSemana = 86;
  const semanas = document.querySelectorAll(".gantt-weeks span").length;

  const nuevoAncho =
    Math.max(760, semanas * baseSemana * (ganttZoom / 100));

  document
    .querySelectorAll(".gantt-timeline-head, .gantt-track-pro")
    .forEach(el => {
      el.style.width = `${nuevoAncho}px`;
    });
}

export function irHoyGantt() {
  const board = document.querySelector(".gantt-board-pro");
  if (!board) return;

  board.scrollTop = 0;
  board.scrollLeft = 0;
}

function generarMesesGantt(inicio, termino) {

  const meses = [];
  const totalMs = termino - inicio;

  let cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);

  while (cursor <= termino) {

    const inicioMes = new Date(cursor);
    const finMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

    const desde = inicioMes < inicio ? inicio : inicioMes;
    const hasta = finMes > termino ? termino : finMes;

    const width =
      ((hasta - desde) / totalMs) * 100;

    meses.push({
      label: cursor.toLocaleDateString("es-CL", {
        month: "long",
        year: "numeric"
      }).toUpperCase(),
      width: Math.max(width, 8)
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return meses;
}

function generarSemanasGantt(inicio, termino) {

  const semanas = [];
  const cursor = new Date(inicio);

  while (cursor <= termino) {

    const desde = new Date(cursor);
    const hasta = sumarDiasNaturales(desde, 4);

    const diaDesde = String(desde.getDate()).padStart(2, "0");
    const diaHasta = String(hasta.getDate()).padStart(2, "0");

    const mes = hasta
      .toLocaleDateString("es-CL", { month: "short" })
      .replace(".", "");

    semanas.push(
      `${diaDesde} - ${diaHasta} ${mes}`
    );

    cursor.setDate(cursor.getDate() + 7);
  }

  return semanas;
}

function sumarDiasNaturales(fecha, dias) {
  const nueva = new Date(fecha);
  nueva.setDate(nueva.getDate() + dias);
  return nueva;
}

function calcularDiasHabilesEntre(fechaInicio, fechaFin) {

  let contador = 0;

  const actual = new Date(fechaInicio);

  while (actual < fechaFin) {

    const dia = actual.getDay();

    if (dia !== 0 && dia !== 6) {
      contador++;
    }

    actual.setDate(actual.getDate() + 1);
  }

  return contador;
}

function calcularDiasHabilesEntreIncluyendoFinal(inicio, fin) {
  let contador = 0;
  const actual = new Date(inicio);

  while (actual <= fin) {
    const dia = actual.getDay();

    if (dia !== 0 && dia !== 6) {
      contador++;
    }

    actual.setDate(actual.getDate() + 1);
  }

  return contador;
}
