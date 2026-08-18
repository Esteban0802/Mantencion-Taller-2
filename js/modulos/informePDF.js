let getOT = null;
let getUsuario = null;

let obtenerEstadoOTServicio = null;
let convertirImagenABase64Servicio = null;

let ot = null;
let usuario = null;

const NOMBRES_ETAPAS = {
    ingreso: "Ingreso",
    evaluacion: "Evaluación",
    overhaul: "Mantención",
    pruebasMecanicas: "Pruebas Mecánicas",
    pruebasElectricas: "Pruebas Eléctricas",
    despachoPreparacion: "Despacho Preparación",
    despachoFinal: "Despacho Final"
};


export function inicializarModuloInformePDF(
    dependencias = {}
) {

    getOT = dependencias.getOT;
    getUsuario = dependencias.getUsuario;

    obtenerEstadoOTServicio =
        dependencias.obtenerEstadoOT;

    convertirImagenABase64Servicio =
        dependencias.convertirImagenABase64;

    if (typeof getOT !== "function") {
        throw new Error(
            "informePDF.js requiere una función getOT"
        );
    }

    if (typeof getUsuario !== "function") {
        throw new Error(
            "informePDF.js requiere una función getUsuario"
        );
    }

    if (
        typeof obtenerEstadoOTServicio !==
        "function"
    ) {
        throw new Error(
            "informePDF.js requiere obtenerEstadoOT"
        );
    }

    if (
        typeof convertirImagenABase64Servicio !==
        "function"
    ) {
        throw new Error(
            "informePDF.js requiere convertirImagenABase64"
        );
    }
}


function sincronizarContexto() {

    ot = getOT?.() || null;
    usuario = getUsuario?.() || null;
}


function obtenerEstadoOT(ordenServicio) {

    return obtenerEstadoOTServicio(
        ordenServicio
    );
}


async function convertirImagenABase64(url) {

    return await convertirImagenABase64Servicio(
        url
    );
}


function formatearFecha(fecha) {

    if (!fecha) return "-";

    return new Date(fecha)
        .toLocaleDateString("es-CL");
}


function obtenerFechaInicioGantt() {

    if (ot?.gantt?.fechaInicio) {

        return formatearFecha(
            new Date(
                ot.gantt.fechaInicio +
                "T00:00:00"
            )
        );
    }

    if (ot?.fechaCreacion?.seconds) {

        return formatearFecha(
            new Date(
                ot.fechaCreacion.seconds *
                1000
            )
        );
    }

    return "-";
}


function obtenerFechaTerminoGantt() {

    if (ot?.gantt?.fechaTermino) {

        return formatearFecha(
            new Date(
                ot.gantt.fechaTermino +
                "T00:00:00"
            )
        );
    }

    return "-";
}



const configInformeEmpresa = {
  nombre: "OVERTRACK",
  subtitulo: "Sistema de Gestión de Mantenimiento",
  logo: "./img/pdf/logo.png",
  portada: "./img/pdf/portada.jpg",
  colorPrincipal: [249, 115, 22],
  colorFondo: [15, 23, 42],
  colorTexto: [255, 255, 255],
  colorTextoSuave: [203, 213, 225],
  textoPortada: "Informe final de servicio técnico y mantenimiento.",
  textoCierre: "Documento generado automáticamente por Overtrack.",
  textoResumenTecnico:
  "Se deja constancia del avance del servicio realizado sobre el equipo indicado. Las actividades ejecutadas, evidencias fotográficas y observaciones técnicas quedan registradas en el presente informe como respaldo del proceso de mantenimiento."
};


const PDF_LAYOUT = {
  margenX: 18,
  headerAlto: 32,
  tituloY: 42,
  lineaTituloY: 48,
  contenidoY: 60,
  footerY: 282,
  colorCard: [30, 41, 59],
  colorTabla: [15, 23, 42],
  colorLinea: [51, 65, 85]
};


export function obtenerResumenEjecutivoInforme() {

    sincronizarContexto();

  const etapas = [
    ot.ingreso || [],
    ot.evaluacion || [],
    ot.overhaul || [],
    ot.pruebas?.mecanico || [],
    ot.pruebas?.electrico || [],
    ot.despacho?.preparacion || [],
    ot.despacho?.final || []
  ];

  const todasActividades = etapas.flat();

  const totalActividades = todasActividades.length;

  const actividadesCompletadas = todasActividades.filter(
    item => item.ok === true || item.completado === true
  ).length;

  const totalComentarios = todasActividades.reduce((acc, item) => {
    return acc + (item.comentarios?.length || 0);
  }, 0);

  const totalFotos = todasActividades.reduce((acc, item) => {
    return acc + (item.fotos?.length || 0);
  }, 0);

  const avance =
    totalActividades > 0
      ? Math.round((actividadesCompletadas / totalActividades) * 100)
      : 0;

  const fechaInicio = obtenerFechaInicioGantt();
  const fechaTermino = obtenerFechaTerminoGantt();

  return {
    totalActividades,
    actividadesCompletadas,
    totalComentarios,
    totalFotos,
    avance,
    estado: ot.estado || "-",
    fechaInicio,
    fechaTermino
  };
}



function obtenerEstadoEtapasInforme() {

  return [
    {
      nombre: "Ingreso",
      estado: ot.ingresoAprobado ? "Completada" : "Pendiente"
    },
    {
      nombre: "Evaluación",
      estado: ot.evaluacionAprobada ? "Completada" : "Pendiente"
    },
    {
      nombre: "Mantención",
      estado: ot.overhaulAprobado
      ? "Completada"
      : (ot.estado === "OVERHAUL" ? "En Proceso" : "Pendiente")
    },
    {
      nombre: "Pruebas Mecánicas",
      estado: ot.pruebasAprobado
        ? "Completada"
        : (ot.estado === "PRUEBAS" ? "En Proceso" : "Pendiente")
    },
    {
      nombre: "Pruebas Eléctricas",
      estado: ot.pruebasAprobado
        ? "Completada"
        : (ot.estado === "PRUEBAS" ? "En Proceso" : "Pendiente")
    },
    {
      nombre: "Despacho",
      estado: ot.cerrada
        ? "Completada"
        : (ot.estado === "DESPACHO" ? "En Proceso" : "Pendiente")
    }
  ];
}



function generarConclusionTecnicaInforme() {
  const resumen = obtenerResumenEjecutivoInforme();
  const estado = obtenerEstadoOT(ot);

  const base = `
Durante el proceso de mantenimiento del equipo ${ot?.equipo || "-"}, asociado a la Orden de Servicio N° ${ot?.os || "-"}, se han registrado ${resumen.totalActividades} actividades, ${resumen.totalFotos} evidencia(s) fotográfica(s) y ${resumen.totalComentarios} comentario(s) técnico(s), alcanzando un avance general de ${resumen.avance}%.
`;

  const textosPorEstado = {
    INGRESO: `
Actualmente el servicio se encuentra en etapa de Ingreso. En esta fase se registra la recepción inicial del equipo, sus condiciones de llegada, antecedentes principales y evidencias asociadas al ingreso al taller.
`,

    EVALUACION: `
Actualmente el servicio se encuentra en etapa de Evaluación. Se está desarrollando el diagnóstico técnico del equipo, registrando observaciones, evidencias fotográficas y antecedentes necesarios para definir el alcance de la intervención.
`,

    EVALUACIÓN: `
Actualmente el servicio se encuentra en etapa de Evaluación. Se está desarrollando el diagnóstico técnico del equipo, registrando observaciones, evidencias fotográficas y antecedentes necesarios para definir el alcance de la intervención.
`,

    OVERHAUL: `
Actualmente el servicio se encuentra en etapa de Overhaul. Las etapas previas han permitido levantar antecedentes técnicos y el equipo se encuentra en proceso de intervención conforme a la planificación establecida.
`,

    PRUEBAS: `
Actualmente el servicio se encuentra en etapa de Pruebas. Las actividades de intervención se encuentran finalizadas o en proceso de validación, ejecutándose pruebas mecánicas y eléctricas para verificar el correcto funcionamiento del equipo.
`,

    DESPACHO: `
Actualmente el servicio se encuentra en etapa de Despacho. El equipo se encuentra en proceso de preparación final para entrega al cliente, posterior a las actividades de intervención y validación técnica.
`,

    CERRADA: `
El servicio de mantenimiento ha sido completado satisfactoriamente. Las etapas definidas fueron ejecutadas y registradas en el sistema, incluyendo evidencias fotográficas, observaciones técnicas y validaciones correspondientes.
`
  };

  const textoEstado =
    textosPorEstado[estado] ||
    `Actualmente el servicio se encuentra en estado ${estado}. La información contenida en este informe corresponde al avance registrado hasta la fecha de emisión.`;

  return `${base}\n${textoEstado}\nEl presente informe constituye respaldo técnico del servicio realizado y permite mantener trazabilidad del proceso.`;
}



function crearPaginaBaseInforme(doc, config, titulo) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Fondo
  doc.setFillColor(...config.colorFondo);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // Título de sección
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...config.colorTexto);
  doc.text(titulo, PDF_LAYOUT.margenX, PDF_LAYOUT.tituloY);

  // Línea naranja
  doc.setDrawColor(...config.colorPrincipal);
  doc.setLineWidth(1);
  doc.line(
    PDF_LAYOUT.margenX,
    PDF_LAYOUT.lineaTituloY,
    pageWidth - PDF_LAYOUT.margenX,
    PDF_LAYOUT.lineaTituloY
  );

  return PDF_LAYOUT.contenidoY;
}


function agregarHeaderInforme(doc, config, pageNumber, totalPages) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Fondo del encabezado
  doc.setFillColor(...config.colorFondo);
  doc.rect(0, 0, pageWidth, 28, "F");

  // Marca
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...config.colorTexto);
  doc.text(config.nombre || "OVERTRACK", 18, 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...config.colorTextoSuave);
  doc.text(config.subtitulo || "Sistema de Gestión de Mantenimiento", 18, 16);

  // Datos dinámicos de la OS
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...config.colorTexto);

  doc.text(`OS: ${ot?.os || "-"}`, 95, 10);
  doc.text(`Cliente: ${ot?.cliente || "-"}`, 95, 16);
  doc.text(`Equipo: ${ot?.equipo || "-"}`, 95, 22);

  // Número de página
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...config.colorPrincipal);

  doc.text(
    `Página ${pageNumber} de ${totalPages}`,
    pageWidth - 18,
    16,
    { align: "right" }
  );
}


function agregarFooterInforme(doc, config, pageNumber, totalPages) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setDrawColor(...config.colorPrincipal);
  doc.setLineWidth(0.35);
  doc.line(18, pageHeight - 18, pageWidth - 18, pageHeight - 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...config.colorTexto);
  doc.text(config.nombre || "OVERTRACK", 18, pageHeight - 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...config.colorTextoSuave);

  doc.text("Informe Final de Servicio", 55, pageHeight - 11);
  doc.text("Versión 1.0", 110, pageHeight - 11);
  doc.text(new Date().toLocaleDateString("es-CL"), 145, pageHeight - 11);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...config.colorPrincipal);

  doc.text(
    `Página ${pageNumber} de ${totalPages}`,
    pageWidth - 18,
    pageHeight - 11,
    { align: "right" }
  );
}


function aplicarHeadersInforme(doc, config) {
  const totalPages = doc.getNumberOfPages();

  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);

    agregarHeaderInforme(doc, config, i, totalPages);
    agregarFooterInforme(doc, config, i, totalPages);
  }
}


async function crearPortadaInforme(doc, config) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const estado = obtenerEstadoOT(ot) || ot?.estado || "-";
  const fechaEmision = new Date().toLocaleDateString("es-CL");

  // Fondo
  doc.setFillColor(...config.colorFondo);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // Banda superior
  doc.setFillColor(2, 6, 23);
  doc.rect(0, 0, pageWidth, 42, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...config.colorTexto);
  doc.text(config.nombre || "OVERTRACK", 18, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...config.colorTextoSuave);
  doc.text(config.subtitulo || "Sistema de Gestión de Mantenimiento", 18, 26);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...config.colorPrincipal);
  doc.text("INFORME FINAL DE SERVICIO", pageWidth - 18, 18, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...config.colorTextoSuave);
  doc.text(`Fecha emisión: ${fechaEmision}`, pageWidth - 18, 26, { align: "right" });

  doc.setDrawColor(...config.colorPrincipal);
  doc.setLineWidth(1.2);
  doc.line(18, 42, pageWidth - 18, 42);

  // Título principal
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(...config.colorTexto);
  doc.text("INFORME TÉCNICO", pageWidth / 2, 76, { align: "center" });

  doc.setFontSize(16);
  doc.setTextColor(...config.colorPrincipal);
  doc.text(`ORDEN DE SERVICIO N° ${ot?.os || "-"}`, pageWidth / 2, 88, {
    align: "center"
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...config.colorTextoSuave);
  doc.text(
    config.textoPortada || "Informe final de servicio técnico y mantenimiento.",
    pageWidth / 2,
    100,
    { align: "center" }
  );

  const fotoPortada = await obtenerFotoPortadaInforme();

if (fotoPortada) {

    const imgW = 100;
    const imgH = 60;

    const imgX = (pageWidth - imgW) / 2;
    const imgY = 110;

    // Marco
    doc.setFillColor(45,55,75);

    doc.roundedRect(
        imgX - 3,
        imgY - 3,
        imgW + 6,
        imgH + 6,
        4,
        4,
        "F"
    );

    doc.addImage(
        fotoPortada,
        "JPEG",
        imgX,
        imgY,
        imgW,
        imgH
    );

}

  // Card datos principales
  const boxX = 24;
  const boxY = 176;
  const boxW = pageWidth - 48;
  const boxH = 86;

  doc.setFillColor(...PDF_LAYOUT.colorCard);
  doc.roundedRect(boxX, boxY, boxW, boxH, 6, 6, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...config.colorTexto);
  doc.text("DATOS PRINCIPALES DEL SERVICIO", boxX + 10, boxY + 14);

  doc.setDrawColor(...config.colorPrincipal);
  doc.setLineWidth(0.6);
  doc.line(boxX + 10, boxY + 20, boxX + boxW - 10, boxY + 20);

  const datos = [
    ["Cliente", ot?.cliente || "-"],
    ["Equipo", ot?.equipo || "-"],
    ["Serie", ot?.serie || "-"],
    ["Orden de Servicio", ot?.os || "-"],
    ["Fecha Inicio", obtenerFechaInicioGantt()],
    ["Fecha Término", obtenerFechaTerminoGantt()]
  ];

  let y = boxY + 34;

  datos.forEach(([label, valor], index) => {
    const colX = index % 2 === 0 ? boxX + 10 : boxX + boxW / 2 + 6;

    if (index % 2 === 0 && index > 0) {
      y += 14;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...config.colorPrincipal);
    doc.text(label.toUpperCase(), colX, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...config.colorTexto);
    doc.text(String(valor), colX, y + 6);
  });

  // Footer portada
  doc.setDrawColor(...config.colorPrincipal);
  doc.setLineWidth(0.8);
  doc.line(24, pageHeight - 32, pageWidth - 24, pageHeight - 32);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...config.colorTexto);
  doc.text("OVERTRACK", pageWidth / 2, pageHeight - 23, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...config.colorTextoSuave);
  doc.text(
    config.subtitulo || "Sistema de Gestión de Mantenimiento",
    pageWidth / 2,
    pageHeight - 16,
    { align: "center" }
  );
}



export function obtenerResumenEvidenciasInforme() {

    sincronizarContexto();

  const etapas = [
    { nombre: "Ingreso", lista: ot.ingreso || [] },
    { nombre: "Evaluación", lista: ot.evaluacion || [] },
    { nombre: NOMBRES_ETAPAS.overhaul, lista: ot.overhaul || [] },
    { nombre: "Pruebas Mecánicas", lista: ot.pruebas?.mecanico || [] },
    { nombre: "Pruebas Eléctricas", lista: ot.pruebas?.electrico || [] },
    { nombre: "Despacho Preparación", lista: ot.despacho?.preparacion || [] },
    { nombre: "Despacho Final", lista: ot.despacho?.final || [] }
  ];

  return etapas.map(etapa => {
    const fotos = etapa.lista.reduce(
      (acc, item) => acc + (item.fotos?.length || 0),
      0
    );

    const comentarios = etapa.lista.reduce(
      (acc, item) => acc + (item.comentarios?.length || 0),
      0
    );

    const actividades = etapa.lista.length;

    return {
      etapa: etapa.nombre,
      actividades,
      fotos,
      comentarios
    };
  });
}




function crearResumenEjecutivoInforme(doc, config) {
  const pageWidth = doc.internal.pageSize.getWidth();

  const resumen = obtenerResumenEjecutivoInforme();

  const inicioY = crearPaginaBaseInforme(
    doc,
    config,
    "RESUMEN EJECUTIVO"
  );

  // Estado actual
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...config.colorTextoSuave);

  doc.text(
    `Estado actual del servicio: ${resumen.estado}`,
    PDF_LAYOUT.margenX,
    inicioY
  );

  // Cards KPI
  const cards = [
    ["Actividades", resumen.totalActividades],
    ["Completadas", resumen.actividadesCompletadas],
    ["Comentarios", resumen.totalComentarios],
    ["Fotografías", resumen.totalFotos],
    ["Avance", `${resumen.avance}%`],
    ["Estado", resumen.estado]
  ];

  const cardW = 54;
  const cardH = 30;
  const gap = 8;

  let x = PDF_LAYOUT.margenX;
  let y = inicioY + 12;

  cards.forEach((card, index) => {
    if (index === 3) {
      x = PDF_LAYOUT.margenX;
      y += cardH + gap;
    }

    doc.setFillColor(...PDF_LAYOUT.colorCard);
    doc.roundedRect(x, y, cardW, cardH, 4, 4, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...config.colorTextoSuave);
    doc.text(card[0], x + 5, y + 9);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...config.colorTexto);
    doc.text(String(card[1]), x + 5, y + 22);

    x += cardW + gap;
  });

  // Barra de avance general
  const barraX = PDF_LAYOUT.margenX;
  const barraY = y + cardH + 28;
  const barraW = pageWidth - PDF_LAYOUT.margenX * 2;
  const barraH = 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...config.colorTexto);
  doc.text("Avance general del servicio", barraX, barraY - 6);

  doc.setFillColor(...PDF_LAYOUT.colorCard);
  doc.roundedRect(barraX, barraY, barraW, barraH, 4, 4, "F");

  const avanceW = Math.max(4, (resumen.avance / 100) * barraW);

  doc.setFillColor(...config.colorPrincipal);
  doc.roundedRect(barraX, barraY, avanceW, barraH, 4, 4, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);

  doc.text(
    `${resumen.avance}%`,
    barraX + barraW / 2,
    barraY + 8.5,
    { align: "center" }
  );

  // Fechas
  const fechasY = barraY + 30;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...config.colorTextoSuave);

  doc.text(`Fecha inicio: ${resumen.fechaInicio}`, PDF_LAYOUT.margenX, fechasY);
  doc.text(`Fecha término estimada: ${resumen.fechaTermino}`, 95, fechasY);

  // Estado de etapas
  const etapas = obtenerEstadoEtapasInforme();

  // ===============================
// ESTADO DE LAS ETAPAS
// ===============================

const tituloEtapasY = fechasY + 18;

doc.setFont("helvetica", "bold");
doc.setFontSize(14);
doc.setTextColor(...config.colorTexto);

doc.text(
    "Estado de las Etapas",
    PDF_LAYOUT.margenX,
    tituloEtapasY
);

// línea decorativa
doc.setDrawColor(...config.colorPrincipal);
doc.setLineWidth(0.5);

doc.line(
    PDF_LAYOUT.margenX,
    tituloEtapasY + 3,
    pageWidth - PDF_LAYOUT.margenX,
    tituloEtapasY + 3
);

// separación entre título y contenido
let yEtapa = tituloEtapasY + 12;  

  etapas.forEach(etapa => {

    let colorEstado = [148,163,184];

    if (etapa.estado === "Completada")
        colorEstado = [34,197,94];

    if (etapa.estado === "En Proceso")
        colorEstado = [249,115,22];

    // indicador
    doc.setFillColor(...colorEstado);

    doc.circle(
        PDF_LAYOUT.margenX + 2,
        yEtapa - 2,
        2,
        "F"
    );

    // nombre etapa
    doc.setFont("helvetica","bold");
    doc.setFontSize(10);
    doc.setTextColor(...config.colorTexto);

    doc.text(
        etapa.nombre,
        PDF_LAYOUT.margenX + 10,
        yEtapa
    );

    // estado alineado a la derecha
    doc.setFont("helvetica","bold");
    doc.setTextColor(...colorEstado);

    doc.text(
        etapa.estado,
        pageWidth - PDF_LAYOUT.margenX,
        yEtapa,
        {
            align:"right"
        }
    );

    yEtapa += 9;

});
}



function nombreEtapaVisible(etapa) {
  if (!etapa) return "";

  const nombre = String(etapa);

  if (nombre.toLowerCase().includes("overhaul")) {
    return nombre.replace(/overhaul/gi, "Mantención");
  }

  return nombre;
}


function crearResumenTecnicoInforme(doc, config) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const inicioY = crearPaginaBaseInforme(
  doc,
  config,
  "RESUMEN TÉCNICO DEL SERVICIO"
);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...config.colorTextoSuave);

  const texto = doc.splitTextToSize(
    config.textoResumenTecnico || "Sin resumen técnico registrado.",
    pageWidth - 36
  );

  doc.text(texto, 18, inicioY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...config.colorTexto);
  doc.text("Datos principales del servicio", 18, inicioY + 34);

  const datos = [
    ["Cliente", ot?.cliente || "-"],
    ["Equipo", ot?.equipo || "-"],
    ["Serie", ot?.serie || "-"],
    ["Orden de Servicio", ot?.os || "-"],
    ["Estado actual", ot?.estado || "-"],
    ["Fecha inicio", obtenerFechaInicioGantt()],
    ["Fecha término estimada", obtenerFechaTerminoGantt()]
  ];

  doc.autoTable({
    startY: inicioY + 44,
    head: [["Campo", "Detalle"]],
    body: datos,
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
      fillColor: config.colorPrincipal,
      textColor: [17, 24, 39],
      fontStyle: "bold"
    },
    alternateRowStyles: {
      fillColor: [30, 41, 59]
    }
  });

  doc.setFontSize(8);
  doc.setTextColor(...config.colorTextoSuave);

}


function obtenerFotosInforme() {
  const etapas = [
    { nombre: "Ingreso", lista: ot.ingreso || [] },
    { nombre: "Evaluación", lista: ot.evaluacion || [] },
    { nombre: NOMBRES_ETAPAS.overhaul, lista: ot.overhaul || [] },
    { nombre: "Pruebas Mecánicas", lista: ot.pruebas?.mecanico || [] },
    { nombre: "Pruebas Eléctricas", lista: ot.pruebas?.electrico || [] },
    { nombre: "Despacho Preparación", lista: ot.despacho?.preparacion || [] },
    { nombre: "Despacho Final", lista: ot.despacho?.final || [] }
  ];

  const fotos = [];

  etapas.forEach(etapa => {
    const totalItems = etapa.lista.length;

    etapa.lista.forEach((item, index) => {
      const comentario =
        item.comentarios?.length
          ? item.comentarios[item.comentarios.length - 1]?.texto
          : "";

      const fecha =
        item.comentarios?.length
          ? item.comentarios[item.comentarios.length - 1]?.fecha
          : new Date().toLocaleDateString("es-CL");

      (item.fotos || []).forEach((foto, fotoIndex) => {
        fotos.push({
          etapa: nombreEtapaVisible(etapa.nombre),
          actividad: item.item || item.texto || `Ítem ${index + 1}`,
          url: foto,
          numero: fotoIndex + 1,
          evidenciaNumero: fotos.length + 1,
          itemNumero: index + 1,
          totalItems,
          completada: !!item.ok,
          fecha,
          comentario
        });
      });
    });
  });

  return fotos;
}




async function obtenerFotoPortadaInforme() {
  const etapas = [
    ot.ingreso || [],
    ot.evaluacion || [],
    ot.overhaul || [],
    ot.pruebas?.mecanico || [],
    ot.pruebas?.electrico || [],
    ot.despacho?.preparacion || [],
    ot.despacho?.final || []
  ];

  for (const lista of etapas) {
    for (const item of lista) {
      if (item.fotos && item.fotos.length > 0) {
        const url = item.fotos[0];

        if (!url) continue;

        if (url.startsWith("http")) {
          return await convertirImagenABase64(url);
        }

        return url;
      }
    }
  }

  return null;
}


function obtenerColorEtapaPDF(etapa) {
  const nombre = String(etapa || "").toLowerCase();

  if (nombre.includes("ingreso")) return [59, 130, 246];
  if (nombre.includes("evaluación") || nombre.includes("evaluacion")) return [245, 158, 11];
  if (nombre.includes("overhaul")) return [168, 85, 247];
  if (nombre.includes("pruebas")) return [249, 115, 22];
  if (nombre.includes("despacho")) return [34, 197, 94];

  return [249, 115, 22];
}



function formatearFechaSoloDia(fecha) {
  if (!fecha) return "-";

  // Si ya viene como texto tipo "22-06-2026, 3:36:39 p. m."
  if (typeof fecha === "string") {
    return fecha.split(",")[0].trim();
  }

  try {
    return new Date(fecha).toLocaleDateString("es-CL");
  } catch (error) {
    return "-";
  }
}



function limitarLineasPDF(doc, texto, ancho, maxLineas) {
  const lineas = doc.splitTextToSize(texto || "", ancho);

  if (lineas.length <= maxLineas) {
    return lineas;
  }

  const recortadas = lineas.slice(0, maxLineas);
  recortadas[maxLineas - 1] = recortadas[maxLineas - 1] + "...";

  return recortadas;
}



function dibujarCardFotografica(doc, config, fotoBase64, foto, x, y) {
  const cardW = 84;
  const cardH = 94;

  const imgX = x + 4;
  const imgY = y + 12;
  const imgW = 76;
  const imgH = 38;

  const colorEtapa = obtenerColorEtapaPDF(foto.etapa);

  // Card
  doc.setFillColor(...PDF_LAYOUT.colorCard);
  doc.roundedRect(x, y, cardW, cardH, 4, 4, "F");

  // Banda etapa
  doc.setFillColor(...colorEtapa);
  doc.roundedRect(x + 4, y + 4, 34, 8, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(foto.etapa.toUpperCase(), x + 6, y + 9.5);

  // Badge foto
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(x + cardW - 20, y + 4, 16, 8, 2, 2, "F");

  doc.setFontSize(7);
  doc.setTextColor(...config.colorTexto);
  doc.text(
    String(foto.evidenciaNumero || foto.numero || "").padStart(2, "0"),
    x + cardW - 12,
    y + 9.5,
    { align: "center" }
  );

  // Imagen
  doc.addImage(
    fotoBase64,
    "JPEG",
    imgX,
    imgY,
    imgW,
    imgH
  );

  // Separador
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.25);
  doc.line(x + 4, y + 55, x + cardW - 4, y + 55);

  // Ítem
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.3);
  doc.setTextColor(...config.colorTexto);
  doc.text(
    `Ítem de Inspección ${foto.itemNumero} de ${foto.totalItems}`,
    x + 4,
    y + 61
  );

  // Estado
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...config.colorTextoSuave);

  doc.text(
    foto.completada ? "✓ Completada" : "Pendiente",
    x + 4,
    y + 68
  );

  // Fecha sin hora
  doc.text(
    `Fecha: ${formatearFechaSoloDia(foto.fecha)}`,
    x + 4,
    y + 74
  );

  // Observación
  const comentario =
    foto.comentario ||
    foto.actividad ||
    "Sin observación registrada.";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.setTextColor(...colorEtapa);
  doc.text("Observación Técnica:", x + 4, y + 81);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...config.colorTextoSuave);

  const lineasComentario = limitarLineasPDF(
    doc,
    comentario,
    cardW - 8,
    3
  );

  doc.text(
    lineasComentario,
    x + 4,
    y + 87
  );
}


function crearPaginaEvidenciasInforme(doc, config) {
  const evidencias = obtenerResumenEvidenciasInforme();

  const totalActividades = evidencias.reduce(
    (acc, e) => acc + e.actividades,
    0
  );

  const totalFotos = evidencias.reduce(
    (acc, e) => acc + e.fotos,
    0
  );

  const totalComentarios = evidencias.reduce(
    (acc, e) => acc + e.comentarios,
    0
  );

  const inicioY = crearPaginaBaseInforme(
    doc,
    config,
    "EVIDENCIAS DEL SERVICIO"
  );

  // Subtítulo
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...config.colorTextoSuave);

  doc.text(
    "Resumen de actividades, fotografías y comentarios registrados por etapa.",
    PDF_LAYOUT.margenX,
    inicioY
  );

  // Tabla
  const body = evidencias.map(e => [
    e.etapa,
    e.actividades,
    e.fotos,
    e.comentarios
  ]);

  doc.autoTable({
    startY: inicioY + 12,
    head: [[
      "Etapa",
      "Actividades",
      "Fotografías",
      "Comentarios"
    ]],
    body,
    theme: "grid",
    styles: {
      fillColor: PDF_LAYOUT.colorTabla,
      textColor: [255, 255, 255],
      lineColor: PDF_LAYOUT.colorLinea,
      lineWidth: 0.2,
      fontSize: 9,
      cellPadding: 3
    },
    headStyles: {
      fillColor: config.colorPrincipal,
      textColor: [17, 24, 39],
      fontStyle: "bold"
    },
    alternateRowStyles: {
      fillColor: PDF_LAYOUT.colorCard
    },
    margin: {
      left: PDF_LAYOUT.margenX,
      right: PDF_LAYOUT.margenX
    }
  });

  const yTotales = doc.lastAutoTable.finalY + 16;

  // Cards totales
  const cards = [
    ["Total Actividades", totalActividades],
    ["Total Fotografías", totalFotos],
    ["Total Comentarios", totalComentarios]
  ];

  const cardW = 54;
  const cardH = 28;
  const gap = 10;

  let x = PDF_LAYOUT.margenX;

  cards.forEach(card => {
    doc.setFillColor(...PDF_LAYOUT.colorCard);
    doc.roundedRect(x, yTotales, cardW, cardH, 4, 4, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...config.colorTextoSuave);
    doc.text(card[0], x + 5, yTotales + 9);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...config.colorTexto);
    doc.text(String(card[1]), x + 5, yTotales + 22);

    x += cardW + gap;
  });
}




async function crearGaleriaFotograficaInforme(doc, config) {
  const fotos = obtenerFotosInforme();

  if (!fotos.length) return;

  const pageHeight = doc.internal.pageSize.getHeight();

  doc.addPage();

  let inicioY = crearPaginaBaseInforme(
    doc,
    config,
    "BITÁCORA FOTOGRÁFICA DEL SERVICIO"
  );

  const cardW = 84;
  const cardH = 94;
  const gapX = 12;
  const gapY = 8;

  const col1 = PDF_LAYOUT.margenX;
  const col2 = col1 + cardW + gapX;

  let y = inicioY;
  let col = 0;

  for (let i = 0; i < fotos.length; i++) {
    const foto = fotos[i];

    const x = col === 0 ? col1 : col2;

    if (y + cardH > pageHeight - 28) {
      doc.addPage();

      inicioY = crearPaginaBaseInforme(
        doc,
        config,
        "BITÁCORA FOTOGRÁFICA DEL SERVICIO"
      );

      y = inicioY;
      col = 0;
    }

    try {
      const fotoBase64 =
        foto.url.startsWith("http")
          ? await convertirImagenABase64(foto.url)
          : foto.url;

      if (fotoBase64) {
        dibujarCardFotografica(
          doc,
          config,
          fotoBase64,
          foto,
          x,
          y
        );
      }

    } catch (error) {
      console.warn("No se pudo agregar foto al informe:", error);
    }

    if (col === 0) {
      col = 1;
    } else {
      col = 0;
      y += cardH + gapY;
    }
  }
}



function crearConclusionTecnicaInforme(doc, config) {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.addPage();

  const inicioY = crearPaginaBaseInforme(
    doc,
    config,
    "CONCLUSIÓN TÉCNICA"
  );

  const conclusion = generarConclusionTecnicaInforme();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...config.colorTextoSuave);

  const texto = doc.splitTextToSize(
    conclusion,
    pageWidth - PDF_LAYOUT.margenX * 2
  );

  doc.text(
    texto,
    PDF_LAYOUT.margenX,
    inicioY
  );
}



function crearPaginaFirmasInforme(doc, config) {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.addPage();

  const inicioY = crearPaginaBaseInforme(
    doc,
    config,
    "APROBACIONES Y CIERRE DEL SERVICIO"
  );

  // Datos superiores específicos
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...config.colorTextoSuave);

  doc.text(`Fecha emisión: ${new Date().toLocaleDateString("es-CL")}`, PDF_LAYOUT.margenX, inicioY);
  doc.text(`Estado: ${obtenerEstadoOT(ot) || ot?.estado || "-"}`, 95, inicioY);

  // Tarjeta certificación
  const boxX = PDF_LAYOUT.margenX;
  const boxY = inicioY + 14;
  const boxW = pageWidth - PDF_LAYOUT.margenX * 2;
  const boxH = 54;

  doc.setFillColor(...PDF_LAYOUT.colorCard);
  doc.roundedRect(boxX, boxY, boxW, boxH, 4, 4, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...config.colorTexto);
  doc.text("CERTIFICACIÓN DEL SERVICIO", boxX + 8, boxY + 12);

  const textoCertificacion =
    "Se certifica que la información contenida en el presente informe corresponde a las actividades registradas durante la ejecución de la Orden de Servicio. Este documento constituye respaldo técnico del trabajo realizado hasta la fecha de emisión.";

  const lineasCertificacion = doc.splitTextToSize(textoCertificacion, boxW - 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...config.colorTextoSuave);
  doc.text(lineasCertificacion, boxX + 8, boxY + 24);

  const dibujarFirma = (x, y, w, h, titulo, nombre, cargo, etiquetaFirma) => {
    doc.setFillColor(...PDF_LAYOUT.colorCard);
    doc.roundedRect(x, y, w, h, 5, 5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...config.colorTexto);
    doc.text(titulo, x + 7, y + 11);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...config.colorTextoSuave);

    doc.text(`Nombre: ${nombre || "________________"}`, x + 7, y + 22);
    doc.text(`Cargo: ${cargo || "________________"}`, x + 7, y + 30);
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-CL")}`, x + 7, y + 38);

    doc.setDrawColor(...config.colorPrincipal);
    doc.setLineWidth(0.7);
    doc.line(x + 9, y + h - 16, x + w - 9, y + h - 16);

    doc.setFontSize(7);
    doc.setTextColor(...config.colorTextoSuave);
    doc.text(etiquetaFirma || "Firma", x + w / 2, y + h - 10, {
      align: "center"
    });
  };

  const nombreUsuario = usuario?.nombre || "Jefe Taller";

  // Firmas superiores
  dibujarFirma(
    PDF_LAYOUT.margenX,
    inicioY + 86,
    82,
    62,
    "Responsable Técnico",
    nombreUsuario,
    "Técnico responsable",
    "Firma / Nombre"
  );

  dibujarFirma(
    110,
    inicioY + 86,
    82,
    62,
    "Jefe de Taller",
    nombreUsuario,
    "Aprobación interna",
    "Firma / Nombre"
  );

  // Firma cliente
  dibujarFirma(
    50,
    inicioY + 158,
    110,
    48,
    "Cliente",
    ot?.cliente || "Cliente",
    "Recepción conforme",
    "Firma / Recepción conforme"
  );
}


export async function generarInformeFinalPDF() {

    sincronizarContexto();
    
  if (!ot) {
    alert("No hay OS cargada");
    return;
  }

  const { jsPDF } = window.jspdf;

  const doc = new jsPDF("p", "mm", "a4");

  await crearPortadaInforme(doc, configInformeEmpresa);

  doc.addPage();
  crearResumenEjecutivoInforme(doc, configInformeEmpresa);

  doc.addPage();
  crearResumenTecnicoInforme(doc, configInformeEmpresa);

  doc.addPage();
  crearPaginaEvidenciasInforme(doc, configInformeEmpresa);

  await crearGaleriaFotograficaInforme(doc, configInformeEmpresa);

  crearConclusionTecnicaInforme(doc, configInformeEmpresa);

  crearPaginaFirmasInforme(doc, configInformeEmpresa);

  aplicarHeadersInforme(doc, configInformeEmpresa);

  doc.save(`Informe_Final_${ot.os || "OS"}.pdf`);
}