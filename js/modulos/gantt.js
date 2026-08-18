let getOT = null;
let getUsuario = null;

let guardarCambiosOTServicio = null;
let esJefeTallerServicio = null;

let ot = null;
let usuario = null;

let etapasGanttColapsadas = {};
let recalculandoGantt = false;
let ganttZoom = 100;


const NOMBRES_ETAPAS = {
    ingreso: "Ingreso",
    evaluacion: "Evaluación",
    overhaul: "Mantención",
    pruebasMecanicas: "Pruebas Mecánicas",
    pruebasElectricas: "Pruebas Eléctricas",
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

    if (typeof getOT !== "function") {
        throw new Error(
            "gantt.js requiere una función getOT"
        );
    }

    if (typeof guardarCambiosOTServicio !== "function") {
        throw new Error(
            "gantt.js requiere guardarCambiosOT"
        );
    }

    sincronizarContexto();
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

  const modalForm = document.getElementById("modalGantt");
  const modalVisual = document.getElementById("modalGanttVisual");

if (ot.gantt && ot.gantt.actividades?.length) {
  cargarFormularioGantt();
  cargarFechasGanttEnFormulario();

  renderCartaGanttProject();

  modalVisual.style.display = "flex";

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

    cargarEtapa(
      "Pruebas Mecánicas",
      "ganttPruebasMecanicasInicio",
      "ganttPruebasMecanicasTermino"
    );

    cargarEtapa(
      "Pruebas Eléctricas",
      "ganttPruebasElectricasInicio",
      "ganttPruebasElectricasTermino"
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
  diasTotalesEtapa
) {

  const actividades = [];

  if (!checklist || checklist.length === 0) {
    return actividades;
  }

  let fechaCursor = new Date(fechaInicio);

  const cantidadItems = checklist.length;

  const duracionBase =
    Math.floor(diasTotalesEtapa / cantidadItems);

  let diasSobrantes =
    diasTotalesEtapa % cantidadItems;

  checklist.forEach((item) => {

    let duracion =
      Math.max(1, duracionBase);

    if (diasSobrantes > 0) {
      duracion += 1;
      diasSobrantes--;
    }

    actividades.push({
      etapa,
      actividad: item.item || "Actividad",
      inicio: fechaCursor.toISOString(),
      termino: sumarDias(fechaCursor, duracion - 1).toISOString(),
      duracion,
      estado: item.ok ? "Completado" : "Planificado"
    });

    fechaCursor = sumarDias(fechaCursor, duracion);
  });

  return actividades;
}


export function cerrarModalGanttVisual() {
  const modal = document.getElementById("modalGanttVisual");
  if (modal) modal.style.display = "none";
}

export function volverFormularioGantt() {

    sincronizarContexto();

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

  if (!esJefeTaller() && modo === "manual") {
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
      "Pruebas Mecánicas",
      "ganttPruebasMecanicasInicio",
      "ganttPruebasMecanicasTermino"
    ),

    leerEtapaManual(
      "Pruebas Eléctricas",
      "ganttPruebasElectricasInicio",
      "ganttPruebasElectricasTermino"
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
    diasIngreso
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
    diasEvaluacion
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
  console.warn("No se encontró la etapa Overhaul en la Carta Gantt");
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
    diasOverhaul
  );

actividades.push(...overhaulActs);

// =========================
// PRUEBAS MECÁNICAS
// =========================

const etapaPruebasMecanicas =
  obtenerEtapaManual(
    etapasManuales,
    "Pruebas Mecánicas"
  );

const inicioPruebasMecanicas =
  new Date(
    etapaPruebasMecanicas.inicio + "T00:00:00"
  );

const diasPruebasMecanicas =
  diasEntreFechasHabiles(
    etapaPruebasMecanicas.inicio,
    etapaPruebasMecanicas.termino
  );

agregarEtapaPlanificada(
  "Pruebas Mecánicas",
  inicioPruebasMecanicas,
  diasPruebasMecanicas
);

const pruebasMec =
  obtenerActividadesDesdeChecklistDistribuido(
    "Pruebas Mecánicas",
    ot.pruebas?.mecanico,
    inicioPruebasMecanicas,
    diasPruebasMecanicas
  );

actividades.push(...pruebasMec);

// =========================
// PRUEBAS ELÉCTRICAS
// =========================

const etapaPruebasElectricas =
  obtenerEtapaManual(
    etapasManuales,
    "Pruebas Eléctricas"
  );

const inicioPruebasElectricas =
  new Date(
    etapaPruebasElectricas.inicio + "T00:00:00"
  );

const diasPruebasElectricas =
  diasEntreFechasHabiles(
    etapaPruebasElectricas.inicio,
    etapaPruebasElectricas.termino
  );

agregarEtapaPlanificada(
  "Pruebas Eléctricas",
  inicioPruebasElectricas,
  diasPruebasElectricas
);

const pruebasElec =
  obtenerActividadesDesdeChecklistDistribuido(
    "Pruebas Eléctricas",
    ot.pruebas?.electrico,
    inicioPruebasElectricas,
    diasPruebasElectricas
  );

actividades.push(...pruebasElec);

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
  fechaTermino: fechaTerminoInput,
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
        <span><b class="verde"></b> Overhaul</span>
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

      <div class="gantt-project-scroll">

        <div class="gantt-project-table" style="--timeline-width:${anchoTimeline}px;">

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
                    style="left: calc(680px + ${posicionHoy}px);">
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
    textoBarra = `${grupo.actividades[0]?.duracion || 0} días corridos`;
    grupo.porcentaje = 100;
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
          ${grupo.total} actividad(es)
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

  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, 297, 210, "F");

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  pdf.text("OVERTRACK - Carta Gantt", 14, 16);

  pdf.setFontSize(10);
  pdf.setTextColor(203, 213, 225);
  pdf.text(`OS: ${ot.os || "-"}`, 14, 24);
  pdf.text(`Equipo: ${ot.equipo || "-"}`, 55, 24);
  pdf.text(`Cliente: ${ot.cliente || "-"}`, 105, 24);
  pdf.text(`Inicio: ${formatearFecha(inicioProyecto)}`, 190, 24);
  pdf.text(`Término: ${formatearFecha(terminoProyecto)}`, 235, 24);

  const body = etapasProject.map(e => [
    e.etapa,
    formatearFecha(new Date(e.inicio)),
    formatearFecha(new Date(e.termino)),
    e.duracion || "",
    e.total || e.actividades?.length || 0,
    `${e.porcentaje || 0}%`
  ]);

  pdf.autoTable({
    startY: 34,
    head: [["Etapa", "Inicio", "Término", "Duración", "Actividades", "Avance"]],
    body,
    theme: "grid",
    styles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      lineColor: [51, 65, 85],
      lineWidth: 0.2,
      fontSize: 9,
      cellPadding: 3
    },
    headStyles: {
      fillColor: [249, 115, 22],
      textColor: [17, 24, 39],
      fontStyle: "bold"
    },
    alternateRowStyles: {
      fillColor: [30, 41, 59]
    }
  });

  // ===============================
// PÁGINA 2: CARTA GANTT VISUAL
// ===============================

pdf.addPage();

pdf.setFillColor(15, 23, 42);
pdf.rect(0, 0, 297, 210, "F");

pdf.setTextColor(255, 255, 255);
pdf.setFontSize(18);
pdf.text("Carta Gantt Visual por Etapas", 14, 16);

pdf.setFontSize(10);
pdf.setTextColor(203, 213, 225);
pdf.text(`OS: ${ot.os || "-"}`, 14, 24);
pdf.text(`Cliente: ${ot.cliente || "-"}`, 55, 24);
pdf.text(`Equipo: ${ot.equipo || "-"}`, 115, 24);

const coloresEtapa = {
  "Ingreso": [68, 114, 196],
  "Evaluación": [91, 155, 213],
  "Repuestos": [237, 125, 49],
  [NOMBRES_ETAPAS.overhaul]: [112, 173, 71],
  "Pruebas Mecánicas": [112, 48, 160],
  "Pruebas Eléctricas": [142, 68, 173],
  "Despacho": [0, 176, 240]
};

const xNombre = 14;
const xTimeline = 65;
const yInicio = 42;
const altoFila = 14;
const anchoTimeline = 205;

const totalMs = terminoProyecto - inicioProyecto;

pdf.setTextColor(249, 115, 22);
pdf.setFontSize(9);
pdf.text(formatearFecha(inicioProyecto), xTimeline, 34);
pdf.text(formatearFecha(terminoProyecto), xTimeline + anchoTimeline - 25, 34);

etapasProject.forEach((etapa, index) => {
  const y = yInicio + index * altoFila;

  const inicio = new Date(etapa.inicio);
  const termino = new Date(etapa.termino);

  const offsetMs = inicio - inicioProyecto;
  const duracionMs = termino - inicio;

  const left = Math.max(0, (offsetMs / totalMs) * anchoTimeline);
  const width = Math.max(4, (duracionMs / totalMs) * anchoTimeline);

  const color = coloresEtapa[etapa.etapa] || [100, 116, 139];

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(9);
  pdf.text(etapa.etapa, xNombre, y + 4);

  pdf.setFillColor(30, 41, 59);
  pdf.roundedRect(xTimeline, y, anchoTimeline, 7, 2, 2, "F");

  pdf.setFillColor(color[0], color[1], color[2]);
  pdf.roundedRect(xTimeline + left, y, width, 7, 2, 2, "F");

  pdf.setTextColor(203, 213, 225);
  pdf.setFontSize(7);
  pdf.text(`${etapa.porcentaje || 0}%`, xTimeline + left + width + 2, y + 5);
});

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

    const total = grupo.actividades.length;

    const porcentaje =
      calcularPorcentajeEtapaReal(grupo.etapa);

    const completadas = Math.round(
      (porcentaje / 100) * total
    );

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

  if (etapa === "Pruebas Mecánicas") {
    return calcularPorcentajeChecklist(ot.pruebas?.mecanico);
  }

  if (etapa === "Pruebas Eléctricas") {
    return calcularPorcentajeChecklist(ot.pruebas?.electrico);
  }

  if (etapa === "Repuestos") {
    return 0;
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

  if (!ot?.gantt?.actividades?.length) return;

  const buscarItem = (etapa, actividad) => {

    let lista = [];

    if (etapa === "Ingreso") lista = ot.ingreso || [];
    if (etapa === "Evaluación") lista = ot.evaluacion || [];
    if (etapa === "Overhaul") lista = ot.overhaul || [];
    if (etapa === "Pruebas Mecánicas") lista = ot.pruebas?.mecanico || [];
    if (etapa === "Pruebas Eléctricas") lista = ot.pruebas?.electrico || [];

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