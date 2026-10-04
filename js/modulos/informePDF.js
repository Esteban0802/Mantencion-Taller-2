export function inicializarModuloInformePDF(
    servicios = {}
) {

    const {
        getOT,
        getUsuario,
        obtenerEstadoOT: obtenerEstadoOTServicio,
        convertirImagenABase64:
            convertirImagenABase64Servicio,
        reportesPDFHabilitados,
        obtenerEtapasHabilitadas:
            obtenerEtapasHabilitadasServicio,
        obtenerConfiguracionEmpresaInforme
    } = servicios;

    const alert = (mensaje) => {
        const texto = String(mensaje || "");
        const tipo = /no fue posible|no hay os/i.test(texto)
            ? "error"
            : "advertencia";
        const titulo = tipo === "error"
            ? "No fue posible generar el informe"
            : "Informe no disponible";

        if (window.OverTrackUI?.mostrarMensaje) {
            return window.OverTrackUI.mostrarMensaje({ titulo, mensaje: texto, tipo });
        }

        window.alert(texto);
        return Promise.resolve(true);
    };

    validarDependencias({
        getOT,
        getUsuario,
        obtenerEstadoOT: obtenerEstadoOTServicio,
        convertirImagenABase64:
            convertirImagenABase64Servicio,
        reportesPDFHabilitados,
        obtenerEtapasHabilitadas:
            obtenerEtapasHabilitadasServicio,
        obtenerConfiguracionEmpresaInforme
    });

let ot = null;
let usuario = null;
const cacheImagenesInforme = new Map();
const TIEMPO_MAXIMO_IMAGEN_INFORME_MS = 15000;

const NOMBRES_ETAPAS = {
    ingreso: "Ingreso",
    evaluacion: "Evaluación",
    overhaul: "Mantención",
    pruebas: "Pruebas",
    despacho: "Despacho",
    despachoPreparacion: "Despacho Preparación",
    despachoFinal: "Despacho Final"
};


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

    if (!url) return null;
    if (cacheImagenesInforme.has(url)) return await cacheImagenesInforme.get(url);

    const carga = new Promise(resolve => {
        const temporizador = setTimeout(() => {
            console.warn("La imagen excedió el tiempo máximo de carga para el informe:", url);
            resolve(null);
        }, TIEMPO_MAXIMO_IMAGEN_INFORME_MS);

        Promise.resolve(convertirImagenABase64Servicio(url))
            .then(resultado => {
                clearTimeout(temporizador);
                resolve(resultado || null);
            })
            .catch(error => {
                clearTimeout(temporizador);
                console.warn("No se pudo cargar una imagen para el informe:", error);
                resolve(null);
            });
    });

    cacheImagenesInforme.set(url, carga);
    return await carga;
}


function formatearFecha(fecha) {
    if (!fecha) return "-";

    let valor = fecha;

    if (typeof fecha?.toDate === "function") {
        valor = fecha.toDate();
    } else if (typeof fecha?.seconds === "number") {
        valor = new Date(fecha.seconds * 1000);
    } else if (typeof fecha === "string") {
        const partes = fecha.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);

        if (partes) {
            return `${partes[1].padStart(2, "0")}-${partes[2].padStart(2, "0")}-${partes[3]}`;
        }

        valor = new Date(fecha);
    }

    const fechaNormalizada = valor instanceof Date ? valor : new Date(valor);

    if (Number.isNaN(fechaNormalizada.getTime())) return "-";

    const dia = String(fechaNormalizada.getDate()).padStart(2, "0");
    const mes = String(fechaNormalizada.getMonth() + 1).padStart(2, "0");

    return `${dia}-${mes}-${fechaNormalizada.getFullYear()}`;
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


function obtenerFechaCierreReal() {
    if (!ot?.cerrada && String(ot?.estado || "").toUpperCase() !== "CERRADA") {
        return "-";
    }

    return formatearFecha(ot?.fechaCierre || ot?.fechaActualizacion);
}


function obtenerEtapasActivasInforme() {
    return obtenerEtapasHabilitadasServicio?.() || {
        ingreso: true,
        evaluacion: true,
        mantencion: true,
        pruebas: true,
        despacho: true
    };
}


function etapaInformeHabilitada(etapa) {
    return obtenerEtapasActivasInforme()[etapa] !== false;
}


function evaluacionRechazadaSinMantencion() {
    return etapaInformeHabilitada("evaluacion") &&
        ot?.evaluacionAprobada === true &&
        ot?.overhaulRequerido === false;
}

function obtenerListaPruebasInforme() {
    if (Array.isArray(ot?.pruebas?.general)) return ot.pruebas.general;
    return [
        ...(Array.isArray(ot?.pruebas?.mecanico) ? ot.pruebas.mecanico : []),
        ...(Array.isArray(ot?.pruebas?.electrico) ? ot.pruebas.electrico : [])
    ];
}


function obtenerGruposActividadesInforme() {
    const grupos = [];
    const omitirIntervencion = evaluacionRechazadaSinMantencion();

    if (etapaInformeHabilitada("ingreso")) {
        grupos.push({ key: "ingreso", nombre: NOMBRES_ETAPAS.ingreso, lista: ot?.ingreso || [] });
    }

    if (etapaInformeHabilitada("evaluacion")) {
        grupos.push({ key: "evaluacion", nombre: NOMBRES_ETAPAS.evaluacion, lista: ot?.evaluacion || [] });
    }

    if (etapaInformeHabilitada("mantencion") && !omitirIntervencion) {
        grupos.push({ key: "mantencion", nombre: NOMBRES_ETAPAS.overhaul, lista: ot?.overhaul || [] });
    }

    if (etapaInformeHabilitada("pruebas") && !omitirIntervencion) {
        grupos.push({ key: "pruebas", nombre: NOMBRES_ETAPAS.pruebas, lista: obtenerListaPruebasInforme() });
    }

    if (etapaInformeHabilitada("despacho")) {
        grupos.push({
            key: "despacho",
            nombre: NOMBRES_ETAPAS.despacho,
            lista: [
                ...(ot?.despacho?.preparacion || []),
                ...(ot?.despacho?.final || [])
            ],
            comentariosDirectos: [
                ...(ot?.despacho?.comentariosPreparacion || []),
                ...(ot?.despacho?.comentariosFinal || [])
            ],
            completarPorPresencia: true
        });
    }

    return grupos;
}


function actividadInformeCompletada(item, grupo) {
    if (grupo?.completarPorPresencia) return Boolean(item);

    return item?.ok === true || item?.completado === true;
}



const CONFIG_INFORME_PREDETERMINADA = {
  nombre: "VECTARIA",
  subtitulo: "Tu operación, en una misma dirección.",
  logo: "./img/vectaria-symbol-official.png",
  portada: "./img/pdf/portada.jpg",
  colorPrincipal: [21, 101, 192],
  colorSecundario: [139, 195, 74],
  colorFondo: [13, 27, 42],
  colorTexto: [255, 255, 255],
  colorTextoSuave: [203, 213, 225],
  textoPortada: "Informe final de servicio técnico y mantenimiento.",
  textoCierre: "Documento generado automáticamente por Vectaria.",
  textoResumenTecnico:
  "Se deja constancia del avance del servicio realizado sobre el equipo indicado. Las actividades ejecutadas, evidencias fotográficas y observaciones técnicas quedan registradas en el presente informe como respaldo del proceso de mantenimiento."
};

function hexadecimalARgb(valor, respaldo) {
  const coincidencia = String(valor || "").trim().match(/^#([0-9a-f]{6})$/i);
  if (!coincidencia) return respaldo;
  const numero = Number.parseInt(coincidencia[1], 16);
  return [(numero >> 16) & 255, (numero >> 8) & 255, numero & 255];
}

function colorEsClaro(color) {
  const [r, g, b] = color.map(canal => Number(canal || 0) / 255);
  const convertir = canal => canal <= 0.03928
    ? canal / 12.92
    : Math.pow((canal + 0.055) / 1.055, 2.4);
  return 0.2126 * convertir(r) + 0.7152 * convertir(g) + 0.0722 * convertir(b) > 0.48;
}

async function obtenerConfigInformeEmpresa() {
  let empresa = null;
  try {
    empresa = await obtenerConfiguracionEmpresaInforme();
  } catch (error) {
    console.warn("No fue posible cargar la identidad del informe; se usará Vectaria.", error);
  }

  const branding = empresa?.brandingInforme || {};
  const colorFondo = hexadecimalARgb(
    empresa?.colorPrimario,
    CONFIG_INFORME_PREDETERMINADA.colorFondo
  );
  const colorAcento = hexadecimalARgb(
    empresa?.colorSecundario,
    CONFIG_INFORME_PREDETERMINADA.colorPrincipal
  );
  const fondoClaro = colorEsClaro(colorFondo);

  PDF_LAYOUT.colorCard = fondoClaro ? [244, 247, 251] : [30, 41, 59];
  PDF_LAYOUT.colorTabla = fondoClaro ? [255, 255, 255] : [15, 23, 42];
  PDF_LAYOUT.colorLinea = fondoClaro ? [203, 213, 225] : [51, 65, 85];

  return {
    ...CONFIG_INFORME_PREDETERMINADA,
    nombre: empresa?.nombre || CONFIG_INFORME_PREDETERMINADA.nombre,
    logo: branding.logoUrl || null,
    portada: branding.portadaUrl || null,
    colorPrincipal: colorAcento,
    colorSecundario: colorFondo,
    colorFondo,
    colorTexto: fondoClaro ? [15, 23, 42] : [255, 255, 255],
    colorTextoSuave: fondoClaro ? [71, 85, 105] : [203, 213, 225],
    colorTextoAcento: colorEsClaro(colorAcento) ? [15, 23, 42] : [255, 255, 255]
  };
}

async function cargarImagenInforme(url) {
  if (!url) return null;
  try {
    return url.startsWith("http") ? await convertirImagenABase64(url) : url;
  } catch (error) {
    console.warn("No fue posible cargar una imagen corporativa del informe.", error);
    return null;
  }
}

function formatoImagenInforme(imagen) {
  const valor = String(imagen || "").toLowerCase();
  if (valor.includes("image/png") || valor.endsWith(".png")) return "PNG";
  if (valor.includes("image/webp") || valor.endsWith(".webp")) return "WEBP";
  return "JPEG";
}


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


function obtenerResumenEjecutivoInforme() {

    sincronizarContexto();

  const grupos = obtenerGruposActividadesInforme();
  const todasActividades = grupos.flatMap(grupo =>
    grupo.lista.map(item => ({ item, grupo }))
  );

  const totalActividades = todasActividades.length;

  const ordenCerrada = ot?.cerrada === true || String(ot?.estado || "").toUpperCase() === "CERRADA";
  const actividadesCompletadas = ordenCerrada
    ? totalActividades
    : todasActividades.filter(({ item, grupo }) => actividadInformeCompletada(item, grupo)).length;

  const totalComentarios = todasActividades.reduce((acc, { item }) => {
    return acc + (item.comentarios?.length || 0);
  }, 0);

  const totalFotos = todasActividades.reduce((acc, { item }) => {
    return acc + (item.fotos?.length || 0);
  }, 0);

  const avance =
    totalActividades > 0
      ? Math.round((actividadesCompletadas / totalActividades) * 100)
      : 0;

  const fechaInicio = obtenerFechaInicioGantt();
  const fechaTerminoEstimada = obtenerFechaTerminoGantt();
  const fechaCierre = obtenerFechaCierreReal();

  return {
    totalActividades,
    actividadesCompletadas,
    totalComentarios,
    totalFotos,
    avance,
    estado: ot.estado || "-",
    fechaInicio,
    fechaTerminoEstimada,
    fechaCierre
  };
}



function obtenerEstadoEtapasInforme() {
  const estadoActual = String(ot?.estado || "").toUpperCase();
  const ordenCerrada = ot?.cerrada === true || estadoActual === "CERRADA";
  const etapas = [];
  const omitirIntervencion = evaluacionRechazadaSinMantencion();

  const resolverEstado = (lista, aprobada, estadoProceso, completarPorPresencia = false) => {
    if (ordenCerrada || aprobada === true) return "Completada";

    if (lista.length > 0 && lista.every(item => completarPorPresencia || actividadInformeCompletada(item))) {
        return "Completada";
    }

    return estadoActual === estadoProceso ? "En Proceso" : "Pendiente";
  };

  if (etapaInformeHabilitada("ingreso")) {
    etapas.push({ nombre: NOMBRES_ETAPAS.ingreso, estado: resolverEstado(ot?.ingreso || [], ot?.ingresoAprobado, "INGRESO") });
  }

  if (etapaInformeHabilitada("evaluacion")) {
    etapas.push({ nombre: NOMBRES_ETAPAS.evaluacion, estado: resolverEstado(ot?.evaluacion || [], ot?.evaluacionAprobada, "EVALUACION") });
  }

  if (etapaInformeHabilitada("mantencion") && !omitirIntervencion) {
    etapas.push({ nombre: NOMBRES_ETAPAS.overhaul, estado: resolverEstado(ot?.overhaul || [], ot?.overhaulAprobado, "OVERHAUL") });
  }

  if (etapaInformeHabilitada("pruebas") && !omitirIntervencion) {
    etapas.push({ nombre: NOMBRES_ETAPAS.pruebas, estado: resolverEstado(obtenerListaPruebasInforme(), ot?.pruebasAprobado, "PRUEBAS") });
  }

  if (etapaInformeHabilitada("despacho")) {
    const documentos = [...(ot?.despacho?.preparacion || []), ...(ot?.despacho?.final || [])];
    etapas.push({ nombre: "Despacho", estado: resolverEstado(documentos, ot?.cerrada, "DESPACHO", true) });
  }

  return etapas;
}



function generarConclusionTecnicaInforme() {
  const resumen = obtenerResumenEjecutivoInforme();
  const estado = obtenerEstadoOT(ot);

  const base = `
Durante el proceso de mantenimiento del equipo ${ot?.equipo || "-"}, asociado a la Orden de Servicio N° ${ot?.os || "-"}, se han registrado ${resumen.totalActividades} actividades y ${resumen.totalFotos} evidencia(s) fotográfica(s), alcanzando un avance general de ${resumen.avance}%.
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
  doc.text(config.nombre || "VECTARIA", 18, 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...config.colorTextoSuave);
  doc.text(config.subtitulo || "Gestión de Mantenimiento", 18, 16);

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
  doc.text(config.nombre || "VECTARIA", 18, pageHeight - 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...config.colorTextoSuave);

  doc.text("Informe Final de Servicio", 55, pageHeight - 11);
  doc.text("Versión 1.0", 110, pageHeight - 11);
  doc.text(formatearFecha(new Date()), 145, pageHeight - 11);

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
  const fechaEmision = formatearFecha(new Date());

  // Fondo
  doc.setFillColor(...config.colorFondo);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  const logoCorporativo = await cargarImagenInforme(config.logo);
  if (logoCorporativo) {
    try {
      doc.addImage(
        logoCorporativo,
        formatoImagenInforme(logoCorporativo),
        18,
        8,
        38,
        18,
        undefined,
        "FAST"
      );
    } catch (error) {
      console.warn("El logo del informe no pudo incorporarse.", error);
    }
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...config.colorTexto);
    doc.text(config.nombre || "VECTARIA", 18, 18);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...config.colorTextoSuave);
  doc.text(config.subtitulo || "Gestión de Mantenimiento", logoCorporativo ? 60 : 18, 26);

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

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...config.colorTextoSuave);
  doc.text(
    config.textoPortada || "Informe final de servicio técnico y mantenimiento.",
    pageWidth / 2,
    90,
    { align: "center" }
  );

  const fotoPortada = await obtenerFotoPortadaInforme(config);

if (fotoPortada) {

    const imgW = 100;
    const imgH = 60;

    const imgX = (pageWidth - imgW) / 2;
    const imgY = 102;

    // Marco fotográfico sutil
    doc.setDrawColor(...config.colorPrincipal);
    doc.setLineWidth(0.35);
    doc.roundedRect(
        imgX - 1,
        imgY - 1,
        imgW + 2,
        imgH + 2,
        2,
        2,
        "S"
    );

    doc.addImage(
        fotoPortada,
        formatoImagenInforme(fotoPortada),
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

  const ordenCerrada = ot?.cerrada === true ||
    String(ot?.estado || "").toUpperCase() === "CERRADA";

  const datos = [
    ["Cliente", ot?.cliente || "-"],
    ["Equipo", ot?.equipo || "-"],
    ["Serie", ot?.serie || "-"],
    ["Orden de Servicio", ot?.os || "-"],
    ["Fecha Inicio", obtenerFechaInicioGantt()],
    [
      ordenCerrada ? "Fecha Cierre" : "Fecha Término Estimada",
      ordenCerrada ? obtenerFechaCierreReal() : obtenerFechaTerminoGantt()
    ]
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
    doc.text(config.nombre || "VECTARIA", pageWidth / 2, pageHeight - 23, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...config.colorTextoSuave);
  doc.text(
    config.subtitulo || "Gestión de Mantenimiento",
    pageWidth / 2,
    pageHeight - 16,
    { align: "center" }
  );
}



function obtenerResumenEvidenciasInforme() {

    sincronizarContexto();

  const etapas = obtenerGruposActividadesInforme();

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
  const ordenCerrada = ot?.cerrada === true || String(ot?.estado || "").toUpperCase() === "CERRADA";
  const textoTermino = ordenCerrada
    ? `Fecha cierre real: ${resumen.fechaCierre}`
    : `Fecha término estimada: ${resumen.fechaTerminoEstimada}`;

  doc.text(textoTermino, 95, fechasY);

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

  dibujarParrafoJustificado(
    doc,
    config.textoResumenTecnico || "Sin resumen técnico registrado.",
    18,
    inicioY,
    pageWidth - 36
  );

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
    ["Fecha término estimada", obtenerFechaTerminoGantt()],
    ["Fecha de cierre real", obtenerFechaCierreReal()]
  ];

  doc.autoTable({
    startY: inicioY + 44,
    head: [["Campo", "Detalle"]],
    body: datos,
    theme: "grid",
    styles: {
      fillColor: PDF_LAYOUT.colorTabla,
      textColor: config.colorTexto,
      lineColor: PDF_LAYOUT.colorLinea,
      lineWidth: 0.2,
      fontSize: 9,
      cellPadding: 3
    },
    headStyles: {
      fillColor: config.colorPrincipal,
      textColor: config.colorTextoAcento,
      fontStyle: "bold"
    },
    alternateRowStyles: {
      fillColor: PDF_LAYOUT.colorCard
    }
  });

  doc.setFontSize(8);
  doc.setTextColor(...config.colorTextoSuave);

}


function obtenerFotosInforme() {
  const etapas = obtenerGruposActividadesInforme();

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
          : formatearFecha(new Date());

      (item.fotos || []).forEach((foto, fotoIndex) => {
        fotos.push({
          etapa: nombreEtapaVisible(etapa.nombre),
          actividad: item.item || item.texto || `Ítem ${index + 1}`,
          url: foto,
          numero: fotoIndex + 1,
          evidenciaNumero: fotos.length + 1,
          itemNumero: index + 1,
          totalItems,
          completada: actividadInformeCompletada(item, etapa),
          fecha,
          comentario
        });
      });
    });
  });

  return fotos;
}




async function obtenerFotoPortadaInforme(config) {
  const portadaCorporativa = await cargarImagenInforme(config?.portada);
  if (portadaCorporativa) return portadaCorporativa;

  const etapas = obtenerGruposActividadesInforme().map(grupo => grupo.lista);

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
  if (nombre.includes("overhaul") || nombre.includes("mantención") || nombre.includes("mantencion")) {
    return [168, 85, 247];
  }
  if (nombre.includes("pruebas")) return [249, 115, 22];
  if (nombre.includes("despacho")) return [34, 197, 94];

  return [249, 115, 22];
}



function formatearFechaSoloDia(fecha) {
  if (!fecha) return "-";

  return formatearFecha(fecha);
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

function dibujarParrafoJustificado(doc, texto, x, y, ancho, opciones = {}) {
  const factorLinea = opciones.lineHeightFactor || 1.35;
  const altoLinea = (doc.getFontSize() / doc.internal.scaleFactor) * factorLinea;
  const parrafos = String(texto || "")
    .trim()
    .split(/\r?\n+/)
    .map(parrafo => parrafo.trim())
    .filter(Boolean);
  let posicionY = y;
  let totalLineas = 0;

  parrafos.forEach((parrafo, indiceParrafo) => {
    const lineas = doc.splitTextToSize(parrafo, ancho);
    lineas.forEach((linea, indiceLinea) => {
      const esUltimaLinea = indiceLinea === lineas.length - 1;
      doc.text(linea, x, posicionY, esUltimaLinea
        ? {}
        : { align: "justify", maxWidth: ancho });
      posicionY += altoLinea;
      totalLineas += 1;
    });

    if (indiceParrafo < parrafos.length - 1) posicionY += altoLinea * 0.45;
  });

  return { totalLineas, posicionY };
}


function obtenerDimensionesImagenPDF(doc, imagen, anchoMaximo, altoMaximo) {
  try {
    const propiedades = doc.getImageProperties(imagen);
    const escala = Math.min(
      anchoMaximo / propiedades.width,
      altoMaximo / propiedades.height
    );

    return {
      ancho: propiedades.width * escala,
      alto: propiedades.height * escala
    };
  } catch (error) {
    return {
      ancho: anchoMaximo,
      alto: altoMaximo
    };
  }
}


function obtenerNombreEtapaCompacto(etapa) {
  const nombre = String(etapa || "");
  const nombreNormalizado = nombre.toLowerCase();

  if (nombreNormalizado.includes("pruebas mec")) return "PRUEBAS MEC.";
  if (nombreNormalizado.includes("pruebas el")) return "PRUEBAS ELÉC.";
  if (nombreNormalizado.includes("despacho prepar")) return "DESPACHO PREP.";
  if (nombreNormalizado.includes("despacho final")) return "DESPACHO FINAL";

  return nombre.toUpperCase();
}



function normalizarFotografiaInforme(fotoBase64, anchoDestino = 1200, altoDestino = 800) {
  return new Promise((resolve) => {
    const imagen = new Image();

    imagen.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = anchoDestino;
        canvas.height = altoDestino;

        const contexto = canvas.getContext("2d");
        const escala = Math.max(
          anchoDestino / imagen.naturalWidth,
          altoDestino / imagen.naturalHeight
        );
        const anchoEscalado = imagen.naturalWidth * escala;
        const altoEscalado = imagen.naturalHeight * escala;

        contexto.fillStyle = "#07132b";
        contexto.fillRect(0, 0, anchoDestino, altoDestino);
        contexto.drawImage(
          imagen,
          (anchoDestino - anchoEscalado) / 2,
          (altoDestino - altoEscalado) / 2,
          anchoEscalado,
          altoEscalado
        );

        resolve(canvas.toDataURL("image/jpeg", 0.9));
      } catch (error) {
        console.warn("No se pudo normalizar una fotografía del informe:", error);
        resolve(fotoBase64);
      }
    };

    imagen.onerror = () => resolve(fotoBase64);
    imagen.src = fotoBase64;
  });
}


async function dibujarCardFotografica(doc, config, fotoBase64, x, y, cardW, cardH) {
  const margenMarco = 1.2;
  const fotoNormalizada = await normalizarFotografiaInforme(fotoBase64);

  // Galería limpia: todas las evidencias usan el mismo formato 3:2.
  doc.setFillColor(...config.colorFondo);
  doc.roundedRect(x, y, cardW, cardH, 2, 2, "F");
  doc.setDrawColor(...PDF_LAYOUT.colorLinea);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, cardW, cardH, 2, 2, "S");

  doc.addImage(
    fotoNormalizada,
    "JPEG",
    x + margenMarco,
    y + margenMarco,
    cardW - margenMarco * 2,
    cardH - margenMarco * 2
  );
}


function crearPaginaEvidenciasInforme(doc, config) {
  const evidencias = obtenerResumenEvidenciasInforme();
  const pageWidth = doc.internal.pageSize.getWidth();

  const totalActividades = evidencias.reduce(
    (acc, e) => acc + e.actividades,
    0
  );

  const totalFotos = evidencias.reduce(
    (acc, e) => acc + e.fotos,
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
    "Resumen de actividades y fotografías registradas por etapa.",
    PDF_LAYOUT.margenX,
    inicioY
  );

  // Tabla
  const body = evidencias.map(e => [
    e.etapa,
    e.actividades,
    e.fotos
  ]);

  doc.autoTable({
    startY: inicioY + 12,
    head: [[
      "Etapa",
      "Actividades",
      "Fotografías"
    ]],
    body,
    theme: "grid",
    styles: {
      fillColor: PDF_LAYOUT.colorTabla,
      textColor: config.colorTexto,
      lineColor: PDF_LAYOUT.colorLinea,
      lineWidth: 0.2,
      fontSize: 9,
      cellPadding: 3
    },
    headStyles: {
      fillColor: config.colorPrincipal,
      textColor: config.colorTextoAcento,
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
    ["Total Fotografías", totalFotos]
  ];

  const cardH = 28;
  const gap = 8;
  const anchoDisponible = pageWidth - PDF_LAYOUT.margenX * 2;
  const cardW = (anchoDisponible - gap * (cards.length - 1)) / cards.length;

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




function esComentarioInternoInforme(comentario) {
  const rol = String(comentario?.rol || "").toLowerCase();
  return ["jefe_taller", "jefe taller", "admin_sucursal", "admin sucursal"].includes(rol);
}

function obtenerComentariosEtapaInforme(grupo) {
  const comentarios = [];
  const agregar = (comentario, actividad = "") => {
    const texto = String(comentario?.texto || "").trim();
    if (!texto || esComentarioInternoInforme(comentario)) return;
    comentarios.push(actividad ? `${actividad}: ${texto}` : texto);
  };

  (grupo?.lista || []).forEach((item, index) => {
    const actividad = item?.item || item?.texto || `Actividad ${index + 1}`;
    (item?.comentarios || []).forEach(comentario => agregar(comentario, actividad));
  });
  (grupo?.comentariosDirectos || []).forEach(comentario => agregar(comentario));

  return [...new Set(comentarios)];
}

function obtenerFotosRepresentativasEtapa(grupo, maximo = 4) {
  const seleccionadas = [];
  const adicionales = [];
  const totalItems = grupo?.lista?.length || 0;

  (grupo?.lista || []).forEach((item, index) => {
    const fotosItem = Array.isArray(item?.fotos) ? item.fotos.filter(Boolean) : [];
    const crearRegistro = (url, fotoIndex) => ({
      etapa: nombreEtapaVisible(grupo.nombre),
      actividad: item?.item || item?.texto || `Actividad ${index + 1}`,
      url,
      numero: fotoIndex + 1,
      itemNumero: index + 1,
      totalItems,
      completada: actividadInformeCompletada(item, grupo),
      fecha: item?.fechaActualizacion || item?.fecha || ot?.fechaActualizacion || new Date()
    });

    if (fotosItem[0]) seleccionadas.push(crearRegistro(fotosItem[0], 0));
    fotosItem.slice(1).forEach((url, fotoIndex) => {
      adicionales.push(crearRegistro(url, fotoIndex + 1));
    });
  });

  const resultado = [...seleccionadas.slice(0, maximo)];
  if (resultado.length < maximo) {
    resultado.push(...adicionales.slice(0, maximo - resultado.length));
  }

  return resultado.map((foto, index) => ({ ...foto, evidenciaNumero: index + 1 }));
}

function dibujarResumenEtapaInforme(doc, config, grupo, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const ancho = pageWidth - PDF_LAYOUT.margenX * 2;
  const total = grupo.lista.length;
  const completadas = grupo.lista.filter(item => actividadInformeCompletada(item, grupo)).length;
  const avance = total ? Math.round((completadas / total) * 100) : 0;
  const colorEtapa = obtenerColorEtapaPDF(grupo.nombre);

  doc.setFillColor(...PDF_LAYOUT.colorCard);
  doc.roundedRect(PDF_LAYOUT.margenX, y, ancho, 25, 4, 4, "F");
  doc.setFillColor(...colorEtapa);
  doc.roundedRect(PDF_LAYOUT.margenX, y, 2, 25, 1, 1, "F");

  const datos = [
    ["ACTIVIDADES", total],
    ["COMPLETADAS", completadas],
    ["AVANCE", `${avance}%`]
  ];
  const anchoColumna = ancho / datos.length;
  datos.forEach(([etiqueta, valor], index) => {
    const centroX = PDF_LAYOUT.margenX + anchoColumna * index + anchoColumna / 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...config.colorTextoSuave);
    doc.text(etiqueta, centroX, y + 8, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...config.colorTexto);
    doc.text(String(valor), centroX, y + 18, { align: "center" });
  });

  return y + 34;
}

function agregarPaginaEtapaInforme(doc, config, nombre, continuacion = false) {
  doc.addPage();
  return crearPaginaBaseInforme(
    doc,
    config,
    `${nombreEtapaVisible(nombre).toUpperCase()}${continuacion ? " - CONTINUACIÓN" : ""}`
  );
}

async function crearGaleriaFotograficaInforme(doc, config) {
  const grupos = obtenerGruposActividadesInforme();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const anchoTexto = doc.internal.pageSize.getWidth() - PDF_LAYOUT.margenX * 2;
  const columnas = 3;
  const gapX = 6;
  const gapY = 6;
  const cardW = (anchoTexto - gapX * (columnas - 1)) / columnas;
  const cardH = cardW * 2 / 3;

  const gruposPreparados = await Promise.all(
    grupos.map(async grupo => {
      const fotos = obtenerFotosRepresentativasEtapa(grupo, 9);
      const fotosPreparadas = await Promise.all(
        fotos.map(async foto => ({
          ...foto,
          fotoBase64: foto.url?.startsWith("http")
            ? await convertirImagenABase64(foto.url)
            : foto.url
        }))
      );
      return { grupo, fotos, fotosPreparadas };
    })
  );

  for (const { grupo, fotos, fotosPreparadas } of gruposPreparados) {
    const comentarios = obtenerComentariosEtapaInforme(grupo);
    let y = agregarPaginaEtapaInforme(doc, config, grupo.nombre);
    y = dibujarResumenEtapaInforme(doc, config, grupo, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...config.colorTexto);
    doc.text("OBSERVACIONES DE LA ETAPA", PDF_LAYOUT.margenX, y);
    y += 7;

    if (!comentarios.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...config.colorTextoSuave);
      doc.text("Sin observaciones operativas registradas.", PDF_LAYOUT.margenX, y);
      y += 10;
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...config.colorTextoSuave);
      const altoLinea = (doc.getFontSize() / doc.internal.scaleFactor) * 1.3;

      for (const comentario of comentarios) {
        const lineas = doc.splitTextToSize(comentario, anchoTexto - 8);
        const altoComentario = lineas.length * altoLinea + 4;
        if (y + altoComentario > pageHeight - 28) {
          y = agregarPaginaEtapaInforme(doc, config, grupo.nombre, true);
        }
        doc.setFillColor(...obtenerColorEtapaPDF(grupo.nombre));
        doc.circle(PDF_LAYOUT.margenX + 1.5, y - 1.2, 0.8, "F");
        doc.text(lineas, PDF_LAYOUT.margenX + 6, y);
        y += altoComentario;
      }
    }

    if (!fotos.length) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(...config.colorTextoSuave);
      doc.text("Sin fotografías registradas en esta etapa.", PDF_LAYOUT.margenX, y + 5);
      continue;
    }

    if (y + 12 + cardH > pageHeight - 28) {
      y = agregarPaginaEtapaInforme(doc, config, grupo.nombre, true);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...config.colorTexto);
    doc.text("FOTOGRAFÍAS REPRESENTATIVAS", PDF_LAYOUT.margenX, y + 2);
    y += 10;

    for (let inicioFila = 0; inicioFila < fotosPreparadas.length; inicioFila += columnas) {
      const fotosFila = fotosPreparadas.slice(inicioFila, inicioFila + columnas);

      if (y + cardH > pageHeight - 28) {
        y = agregarPaginaEtapaInforme(doc, config, grupo.nombre, true);
      }

      const anchoFila = fotosFila.length * cardW + (fotosFila.length - 1) * gapX;
      const inicioX = (pageWidth - anchoFila) / 2;

      for (let indice = 0; indice < fotosFila.length; indice += 1) {
        const foto = fotosFila[indice];
        const x = inicioX + indice * (cardW + gapX);

        try {
          const fotoBase64 = foto.fotoBase64;
          if (fotoBase64) {
            await dibujarCardFotografica(doc, config, fotoBase64, x, y, cardW, cardH);
          }
        } catch (error) {
          console.warn("No se pudo agregar foto representativa al informe:", error);
        }
      }

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

  dibujarParrafoJustificado(
    doc,
    conclusion,
    PDF_LAYOUT.margenX,
    inicioY,
    pageWidth - PDF_LAYOUT.margenX * 2
  );
}


function obtenerResponsablesInforme() {
  const participantes = [];

  const agregarParticipante = (nombre, rol) => {
    if (!nombre) return;

    participantes.push({
      nombre: String(nombre).trim(),
      rol: String(rol || "").toLowerCase()
    });
  };

  (ot?.bitacora || []).forEach(registro => {
    agregarParticipante(registro?.usuario, registro?.rol);
  });

  obtenerGruposActividadesInforme().forEach(grupo => {
    grupo.lista.forEach(item => {
      (item?.comentarios || []).forEach(comentario => {
        agregarParticipante(
          comentario?.usuario || comentario?.nombre,
          comentario?.rol
        );
      });
    });
  });

  agregarParticipante(ot?.creadoPorNombre, ot?.creadoPorRol);
  agregarParticipante(ot?.decisionEvaluacion?.usuario, ot?.decisionEvaluacion?.rol);
  agregarParticipante(ot?.decisionPruebas?.usuario, ot?.decisionPruebas?.rol);
  agregarParticipante(ot?.cerradoPorNombre, ot?.cerradoPorRol);

  const buscarPorRol = roles => participantes.find(participante =>
    roles.some(rol => participante.rol.includes(rol))
  )?.nombre || "";

  const usuarioActualEsJefe = String(usuario?.rol || "").toLowerCase().includes("jefe");
  const usuarioActualEsTecnico = ["usuario_taller", "tecnico", "técnico"].some(rol =>
    String(usuario?.rol || "").toLowerCase().includes(rol)
  );

  return {
    tecnico:
      buscarPorRol(["usuario_taller", "tecnico", "técnico"]) ||
      (usuarioActualEsTecnico ? usuario?.nombre : "") ||
      "",
    jefeTaller:
      ot?.cerradoPorNombre ||
      buscarPorRol(["jefe_taller", "jefe taller"]) ||
      (usuarioActualEsJefe ? usuario?.nombre : "") ||
      ""
  };
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

  doc.text(`Fecha emisión: ${formatearFecha(new Date())}`, PDF_LAYOUT.margenX, inicioY);
  doc.text(`Estado: ${obtenerEstadoOT(ot) || ot?.estado || "-"}`, 95, inicioY);

  // Tarjeta certificación
  const boxX = PDF_LAYOUT.margenX;
  const boxY = inicioY + 14;
  const boxW = pageWidth - PDF_LAYOUT.margenX * 2;
  const boxH = 58;

  doc.setFillColor(...PDF_LAYOUT.colorCard);
  doc.roundedRect(boxX, boxY, boxW, boxH, 4, 4, "F");
  doc.setDrawColor(...PDF_LAYOUT.colorLinea);
  doc.setLineWidth(0.25);
  doc.roundedRect(boxX, boxY, boxW, boxH, 4, 4, "S");
  doc.setFillColor(...config.colorPrincipal);
  doc.roundedRect(boxX, boxY, 2, boxH, 1, 1, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...config.colorTexto);
  doc.text("CERTIFICACIÓN DEL SERVICIO", boxX + 8, boxY + 12);

  const textoCertificacion =
    "Se certifica que la información contenida en el presente informe corresponde a las actividades registradas durante la ejecución de la Orden de Servicio. Este documento constituye respaldo técnico del trabajo realizado hasta la fecha de emisión.";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...config.colorTextoSuave);
  dibujarParrafoJustificado(
    doc,
    textoCertificacion,
    boxX + 8,
    boxY + 25,
    boxW - 16,
    { lineHeightFactor: 1.4 }
  );

  const fechaDocumento = obtenerFechaCierreReal() !== "-"
    ? obtenerFechaCierreReal()
    : formatearFecha(new Date());

  const dibujarFirma = (x, y, w, h, titulo, tipoResponsable) => {
    doc.setFillColor(...PDF_LAYOUT.colorCard);
    doc.roundedRect(x, y, w, h, 5, 5, "F");
    doc.setDrawColor(...PDF_LAYOUT.colorLinea);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, w, h, 5, 5, "S");

    doc.setFillColor(...config.colorPrincipal);
    doc.roundedRect(x, y, w, 2, 1, 1, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...config.colorTexto);
    doc.text(titulo, x + 8, y + 13);

    doc.setFontSize(6.2);
    doc.setTextColor(...config.colorPrincipal);
    doc.text(tipoResponsable.toUpperCase(), x + 8, y + 19);

    doc.setFillColor(...config.colorFondo);
    doc.roundedRect(x + 7, y + 24, w - 14, 25, 3, 3, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.setTextColor(...config.colorTextoSuave);
    doc.text("NOMBRE", x + 11, y + 31);
    doc.text("CARGO", x + 11, y + 42);

    doc.setDrawColor(...PDF_LAYOUT.colorLinea);
    doc.setLineWidth(0.3);
    doc.line(x + 11, y + 37, x + w - 11, y + 37);
    doc.line(x + 11, y + 48, x + w - 11, y + 48);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...config.colorTextoSuave);
    doc.text(`Fecha: ${fechaDocumento}`, x + 8, y + 57);

    doc.setDrawColor(...config.colorPrincipal);
    doc.setLineWidth(0.45);
    doc.line(x + 10, y + h - 14, x + w - 10, y + h - 14);

    doc.setFontSize(6.5);
    doc.setTextColor(...config.colorTextoSuave);
    doc.text("FIRMA Y NOMBRE", x + w / 2, y + h - 8, {
      align: "center"
    });
  };

  const firmaGap = 10;
  const firmaW = (boxW - firmaGap) / 2;
  const firmaY = boxY + boxH + 18;
  const firmaH = 82;

  dibujarFirma(
    boxX,
    firmaY,
    firmaW,
    firmaH,
    "Responsable Técnico",
    "Ejecución del servicio"
  );

  dibujarFirma(
    boxX + firmaW + firmaGap,
    firmaY,
    firmaW,
    firmaH,
    "Jefe de Taller",
    "Revisión y aprobación"
  );
}


async function generarInformeFinalPDF() {

  const boton = document.getElementById("btnGenerarInformePDF");

  if (boton?.dataset.generandoPdf === "true") return;

  sincronizarContexto();

  if (!reportesPDFHabilitados()) {
    alert("El módulo Informe PDF no está habilitado para esta empresa.");
    return;
  }

  if (!ot) {
    alert("No hay OS cargada");
    return;
  }

  if (!window.jspdf?.jsPDF) {
    alert("No fue posible cargar el generador PDF. Recarga la página e inténtalo nuevamente.");
    return;
  }

  if (boton) {
    boton.dataset.generandoPdf = "true";
    boton.disabled = true;
    boton.textContent = "Generando informe…";
  }

  try {
    cacheImagenesInforme.clear();
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF("p", "mm", "a4");

    const configInformeEmpresa = await obtenerConfigInformeEmpresa();

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
  } catch (error) {
    console.error("Error generando informe PDF:", error);
    alert("No fue posible generar el informe PDF. Revisa la conexión y vuelve a intentarlo.");
  } finally {
    if (boton) {
      boton.dataset.generandoPdf = "false";
      boton.disabled = false;
      boton.textContent = "Generar PDF";
    }
  }
}


window.generarPDF = generarInformeFinalPDF;

const botonGenerarPDF = document.getElementById("btnGenerarInformePDF");
if (botonGenerarPDF && botonGenerarPDF.dataset.eventoPdfAsignado !== "true") {
    botonGenerarPDF.dataset.eventoPdfAsignado = "true";
    botonGenerarPDF.addEventListener("click", generarInformeFinalPDF);
}

window.obtenerResumenEjecutivoInforme =
    obtenerResumenEjecutivoInforme;

window.obtenerResumenEvidenciasInforme =
    obtenerResumenEvidenciasInforme;

console.log(
    "📦 Módulo Informe PDF inicializado correctamente"
);

}


function validarDependencias(dependencias) {

    Object.entries(dependencias).forEach(
        ([nombre, valor]) => {

            if (typeof valor !== "function") {
                throw new Error(
                    `Informe PDF: falta la dependencia ${nombre}.`
                );
            }
        }
    );
}
