import {
  capturarBorradoresFormulario,
  restaurarBorradoresFormulario
} from "./core/utilidades.js";
import { programarRenderDiferido } from "./core/renderDiferido.js?v=20261007-2";
import { actualizarTarjetaChecklist } from "./core/actualizacionParcial.js?v=20261007-1";

/**
 * Inicializa el módulo de Pruebas.
 *
 * El módulo no accede directamente a variables globales de app.js.
 * Todas sus dependencias se reciben desde inicializarModuloPruebas().
 */
export function inicializarModuloPruebas(servicios = {}) {
let avancePruebasEnCurso = false;

  const {
    getOT,
    getUsuario,
    guardarCambiosOT,
    autoguardarCambiosOT,
    renderProgresoEtapa,
    itemCompleto,
    OTBloqueada,
    esJefeTaller,
    esUsuarioTaller,
    puedeEliminarComentario,
    actualizarEstadoGanttDesdeChecklist,
    recalcularGanttAutomatico,
    renderCartaGantt,
    comprimirImagenBlob,
    subirArchivoStorage,
    eliminarArchivoStorage,
    verImagenModal,
    actualizarAlertaJefe,
    obtenerEstadoOT,
    habilitarTab,
    cambiarTab,
    navegarSiguienteEtapa,
    responderComentarioJefe,
    aprobacionesHabilitadas,
    agregarBitacora
  } = servicios;

  const esArchivoPdf = archivo => archivo?.type === "application/pdf" || /\.pdf$/i.test(archivo?.name || "");
  const prepararEvidencia = async (archivo, prefijo) => {
    if (esArchivoPdf(archivo)) return archivo;
    try {
      return new File([await comprimirImagenBlob(archivo)], `${prefijo}_${Date.now()}.jpg`, { type: "image/jpeg" });
    } catch (error) {
      console.warn("La imagen se subirá en su formato original:", archivo.name, error);
      return archivo;
    }
  };
  const esUrlPdf = url => /\.pdf(?:\?|$)/i.test(String(url || ""));
  const crearVistaEvidencia = (url, descripcion) => {
    if (esUrlPdf(url)) {
      const enlace = document.createElement("a");
      enlace.className = "evidencia-pdf-card";
      enlace.href = url;
      enlace.target = "_blank";
      enlace.rel = "noopener";
      enlace.setAttribute("aria-label", `${descripcion}: abrir PDF`);
      enlace.innerHTML = "<span>PDF</span><small>Ver documento</small>";
      return enlace;
    }
    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = descripcion;
    img.src = url;
    img.width = 100;
    img.onclick = () => verImagenModal(url);
    return img;
  };

  const alert = (mensaje) => {
    const texto = String(mensaje || "");
    const tipo = /correctamente|completad[ao]|aprobad[ao]|guardad[ao]/i.test(texto)
      ? "exito"
      : /error|no fue posible|no hay os|no hay ot|no se encontró/i.test(texto)
        ? "error"
        : "advertencia";
    const titulo = tipo === "exito"
      ? "Operación completada"
      : tipo === "error"
        ? "No fue posible completar la acción"
        : "Revisa la información";

    if (window.OverTrackUI?.mostrarMensaje) {
      return window.OverTrackUI.mostrarMensaje({ titulo, mensaje: texto, tipo });
    }

    window.alert(texto);
    return Promise.resolve(true);
  };

  const confirmarEliminacion = (elemento) => {
    if (window.OverTrackUI?.confirmarAccion) {
      return window.OverTrackUI.confirmarAccion({
        titulo: `Eliminar ${elemento}`,
        mensaje: `Este elemento (${elemento}) se eliminará de la orden de trabajo.`,
        tipo: "advertencia",
        textoConfirmar: "Eliminar",
        textoCancelar: "Cancelar",
        peligrosa: true
      });
    }

    return Promise.resolve(window.confirm(`¿Eliminar ${elemento}?`));
  };

  validarDependencias({
    getOT,
    getUsuario,
    guardarCambiosOT,
    autoguardarCambiosOT,
    renderProgresoEtapa,
    itemCompleto,
    OTBloqueada,
    esJefeTaller,
    esUsuarioTaller,
    puedeEliminarComentario,
    actualizarEstadoGanttDesdeChecklist,
    recalcularGanttAutomatico,
    renderCartaGantt,
    comprimirImagenBlob,
    subirArchivoStorage,
    eliminarArchivoStorage,
    verImagenModal,
    actualizarAlertaJefe,
    obtenerEstadoOT,
    habilitarTab,
    cambiarTab,
    navegarSiguienteEtapa,
    responderComentarioJefe,
    aprobacionesHabilitadas,
    agregarBitacora
  });

  exponerFuncionesGlobales();

  console.log("🧩 Módulo Pruebas inicializado correctamente");

  return {
    cargarChecklist,
    renderChecklist,
    togglePrueba,
    subirFotoPrueba,
    agregarComentarioPrueba,
    renderComentariosPrueba,
    eliminarComentarioPrueba,
    mostrarFotosPrueba,
    eliminarFotoPrueba,
    guardarPruebas,
    aprobarPruebas,
    finalizarPruebasSinAprobacion,
    validarPruebasCompleto
  };


/**
 * Comprueba que app.js haya entregado las funciones necesarias.
 */
function validarDependencias(requeridas) {

  Object.entries(requeridas).forEach(([nombre, valor]) => {
    if (typeof valor !== "function") {
      throw new Error(
        `Módulo Pruebas: falta la dependencia "${nombre}"`
      );
    }
  });
}


/**
 * Mantiene operativos los onclick y onchange declarados en flujo.html.
 */
function exponerFuncionesGlobales() {
window.cargarChecklist = cargarChecklist;
window.renderChecklist = renderChecklist;
window.togglePrueba = togglePrueba;
window.subirFotoPrueba = subirFotoPrueba;
window.eliminarFotoPrueba = eliminarFotoPrueba;
window.agregarComentarioPrueba = agregarComentarioPrueba;
window.eliminarComentarioPrueba = eliminarComentarioPrueba;
window.guardarPruebas = guardarPruebas;
window.aprobarPruebas = aprobarPruebas;
window.finalizarPruebasSinAprobacion = finalizarPruebasSinAprobacion;

}


// =======================
// CARGAR CHECKLIST
// =======================

function obtenerChecklistPruebas(ot) {
  if (!ot) return [];

  // Compatibilidad con OT creadas por plantillas antes de unificar Pruebas.
  // Esas OT guardaban el checklist directamente como un arreglo.
  if (Array.isArray(ot.pruebas)) {
    ot.pruebas = { general: ot.pruebas };
  }

  if (!ot.pruebas || typeof ot.pruebas !== "object") {
    ot.pruebas = { general: [] };
  }

  if (!Array.isArray(ot.pruebas.general)) {
    const mecanicas = Array.isArray(ot.pruebas.mecanico) ? ot.pruebas.mecanico : [];
    const electricas = Array.isArray(ot.pruebas.electrico) ? ot.pruebas.electrico : [];
    ot.pruebas.general = [...mecanicas, ...electricas];
  }

  return ot.pruebas.general;
}

function cargarChecklist() {

  const ot = getOT();

  if (!ot) {
    alert("No hay OS cargada");
    return;
  }

  const input = document.getElementById("excelPruebas");
  const file = input?.files?.[0];

  if (!file) {
    alert("Debes subir el Excel");
    return;
  }

  if (!/\.xlsx?$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
    alert("Selecciona un archivo Excel válido de máximo 5 MB.");
    input.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = async function (event) {
    const pruebasAnteriores = ot.pruebas && typeof ot.pruebas === "object"
      ? { ...ot.pruebas, general: ot.pruebas.general }
      : ot.pruebas;
    let checklistReemplazado = false;

    try {

      const data = new Uint8Array(event.target.result);

      const workbook = XLSX.read(data, {
        type: "array"
      });

      const sheet =
        workbook.Sheets[workbook.SheetNames[0]];

      const json = XLSX.utils.sheet_to_json(sheet, {
        header: 1
      });

      const checklist = json
        .flat()
        .filter(item => item !== null && item !== undefined && String(item).trim() !== "")
        .slice(0, 400)
        .map(item => ({
          item: String(item).trim().slice(0, 240),
          ok: false,
          fotos: [],
          comentarios: [],
          fecha: null
        }));

      if (!checklist.length) throw new Error("El archivo Excel no contiene ítems válidos.");

      if (!ot.pruebas || typeof ot.pruebas !== "object") ot.pruebas = {};
      ot.pruebas.general = checklist;
      checklistReemplazado = true;

      const guardado = await guardarCambiosOT();
      if (!guardado) throw new Error("No fue posible guardar el checklist en la OT.");

      renderChecklist("general");

    } catch (error) {
      if (checklistReemplazado) ot.pruebas = pruebasAnteriores;

      console.error(
        "Error cargando checklist de pruebas:",
        error
      );

      alert("No fue posible procesar el Excel de pruebas");
    }
  };

  reader.onerror = function (error) {
    console.error("Error leyendo Excel:", error);
    alert("No fue posible leer el archivo Excel");
  };

  reader.readAsArrayBuffer(file);
}


// =======================
// RENDER
// =======================

function renderChecklist(tipo = "general") {

  const ot = getOT();

  if (!ot) return;

  tipo = "general";
  const cont = document.getElementById("listaPruebas");

  if (!cont) return;

  const lista = obtenerChecklistPruebas(ot);

  renderProgresoEtapa(
    "progresoPruebas",
    lista
  );

  cont.innerHTML = "";
  cont.className = "checklist-pro-grid";

  lista.forEach((item, index) => {

    if (!Array.isArray(item.comentarios)) {
      item.comentarios = [];
    }

    if (!Array.isArray(item.fotos)) {
      item.fotos = [];
    }

    const completado = itemCompleto(item);
    const cantidadFotos = item.fotos.length;
    const cantidadComentarios = item.comentarios.length;

    const div = document.createElement("div");

    div.className =
      `checklist-card ${completado ? "completed" : ""}`;
    div.dataset.checklistIndex = String(index);

    div.innerHTML = `
      <div class="checklist-card-header">

        <div class="checklist-card-title">

          <input
            type="checkbox"
            class="checklist-card-check"
            ${item.ok ? "checked" : ""}
            onchange="togglePrueba('${tipo}', ${index})"
          >

          <h4>${item.item}</h4>

        </div>

        <span
          class="checklist-status ${
            completado ? "done" : "pending"
          }"
        >
          ${completado ? "Completado" : "Pendiente"}
        </span>

      </div>

      <div class="checklist-card-footer">

        <span class="checklist-mini-badge">
          📷 ${cantidadFotos} evidencia(s)
        </span>

        <span class="checklist-mini-badge">
          💬 ${cantidadComentarios} comentario(s)
        </span>

      </div>

      <div class="checklist-upload-box">

        <label class="btn-upload-pro">
          📷 Agregar evidencias

          <input
            type="file"
            accept="image/*,.pdf,application/pdf"
            multiple
            onchange="subirFotoPrueba(
              event,
              '${tipo}',
              ${index}
            )"
          >

        </label>

      </div>

      <div
        id="fotos-${tipo}-${index}"
        class="checklist-fotos-pro"
      ></div>

      <div class="checklist-comment-box checklist-comment-box--single">
        <input
          id="comentario-${tipo}-${index}"
          placeholder="Trabajo realizado"
        >

        <button
          type="button"
          onclick="agregarComentarioPrueba(
            '${tipo}',
            ${index}
          )"
        >
          Agregar Comentario
        </button>

      </div>

      <div id="comentarios-${tipo}-${index}"></div>
    `;

    cont.appendChild(div);

    programarRenderDiferido(div, () => {
      mostrarFotosPrueba(tipo, index);
      renderComentariosPrueba(tipo, index);
    });
  });
}


// =======================
// CHECK
// =======================

function togglePrueba(tipo, index) {

  const ot = getOT();

  if (!ot || OTBloqueada()) return;

  const item = ot.pruebas?.[tipo]?.[index];

  if (!item) {
    console.warn(
      "No se encontró el ítem de pruebas:",
      tipo,
      index
    );

    return;
  }

  item.ok = !item.ok;

  actualizarEstadoGanttDesdeChecklist();
  recalcularGanttAutomatico();

  autoguardarCambiosOT();

  actualizarTarjetaChecklist("listaPruebas", index, item, itemCompleto);
  renderProgresoEtapa("progresoPruebas", obtenerChecklistPruebas(ot));

  if (ot.gantt?.actividades?.length) {
    renderCartaGantt();
  }
}


// =======================
// FOTOGRAFÍAS
// =======================

async function subirFotoPrueba(event, tipo, index) {

  const ot = getOT();

  if (!ot || OTBloqueada()) return;

  const files = Array.from(
    event.target.files || []
  );

  if (!files.length) return;

  let item = null;
  let fotosOriginales = [];
  const urlsSubidasEnEsteIntento = [];

  try {

    obtenerChecklistPruebas(ot);

    item = ot.pruebas?.[tipo]?.[index];

    if (!item) {
      throw new Error(
        "No se encontró el ítem de pruebas"
      );
    }

    if (!Array.isArray(item.fotos)) {
      item.fotos = [];
    }

    fotosOriginales = [...item.fotos];

    for (const file of files) {
      const archivoEvidencia = await prepararEvidencia(file, `pruebas_${tipo}`);

      const urlFoto =
        await subirArchivoStorage(
          archivoEvidencia,
          `pruebas_${tipo}`,
          index
        );

      if (!urlFoto) throw new Error("La fotografía no obtuvo una URL válida");

      urlsSubidasEnEsteIntento.push(urlFoto);
      item.fotos.push(urlFoto);
    }

    const guardado = await guardarCambiosOT();
    if (!guardado) {
      throw new Error("No fue posible confirmar las fotografías en la OT.");
    }

    const borradores = capturarBorradoresFormulario("listaPruebas");
    renderChecklist(tipo);
    restaurarBorradoresFormulario("listaPruebas", borradores);

    event.target.value = "";

  } catch (error) {

    await Promise.allSettled(
      urlsSubidasEnEsteIntento.map(url => eliminarArchivoStorage(url))
    );
    if (item) item.fotos = fotosOriginales;
    event.target.value = "";

    console.error(
      "Error subiendo foto de pruebas:",
      error
    );

    alert(`No se completó la carga de ${files.length} fotografía(s). No se agregó ninguna evidencia del lote.`);
  }
}


function mostrarFotosPrueba(tipo, index) {

  const ot = getOT();

  const div = document.getElementById(
    `fotos-${tipo}-${index}`
  );

  if (!ot || !div) return;

  div.innerHTML = "";

  const fotos =
    ot.pruebas?.[tipo]?.[index]?.fotos || [];

  fotos.forEach((foto, fotoIndex) => {

    const container =
      document.createElement("div");

    container.className = "foto-box";

    const vista = crearVistaEvidencia(foto, `Evidencia ${fotoIndex + 1} de pruebas`);

    const btn = document.createElement("button");

    btn.type = "button";
    btn.innerHTML = "&times;";
    btn.className = "btn-delete-img";

    btn.onclick = () =>
      eliminarFotoPrueba(
        tipo,
        index,
        fotoIndex
      );

    container.appendChild(vista);
    container.appendChild(btn);

    div.appendChild(container);
  });
}


async function eliminarFotoPrueba(
  tipo,
  index,
  fotoIndex
) {

  const ot = getOT();

  if (!ot || OTBloqueada()) return;

  if (!(await confirmarEliminacion("evidencia"))) {
    return;
  }

  const fotos =
    ot.pruebas?.[tipo]?.[index]?.fotos;

  if (!Array.isArray(fotos)) return;

  const urlFoto = fotos[fotoIndex];

  if (!urlFoto) return;

  try {
    fotos.splice(fotoIndex, 1);

    const guardado = await guardarCambiosOT();
    if (!guardado) {
      fotos.splice(fotoIndex, 0, urlFoto);
      return;
    }

    await eliminarArchivoStorage(urlFoto);

    renderChecklist(tipo);

  } catch (error) {

    console.error(
      "Error eliminando evidencia de pruebas:",
      error
    );

    alert("No fue posible eliminar la evidencia");
  }
}


// =======================
// COMENTARIOS
// =======================

async function agregarComentarioPrueba(tipo, index) {

  const ot = getOT();
  const usuario = getUsuario();

  if (!ot || OTBloqueada()) return;

  const item = ot.pruebas?.[tipo]?.[index];

  if (!item) return;

  const inputComentario = document.getElementById(
    `comentario-${tipo}-${index}`
  );

  const nombre = usuario?.nombre || usuario?.email || "Usuario";
  const texto = inputComentario?.value?.trim();

  if (!texto) {
    alert("Ingresa el trabajo realizado");
    return;
  }

  if (!Array.isArray(item.comentarios)) {
    item.comentarios = [];
  }

  const cantidadComentariosAnterior = item.comentarios.length;
  const alertaJefeAnterior = ot.alertaJefe;
  const fechaAnterior = item.fecha;

  item.comentarios.push({
    nombre,
    texto,
    fecha: new Date().toLocaleString(),
    rol: usuario?.rol || "tecnico",
    creadoPorUid: usuario?.uid || "",
    creadoPorNombre: usuario?.nombre || nombre,
    atendido: esJefeTaller() ? false : true,
    respuestaUsuario: "",
    atendidoPor: "",
    fechaAtendido: ""
  });

  if (esJefeTaller()) {
    ot.alertaJefe = true;
  }

  if (!item.fecha) {
    item.fecha = new Date().toLocaleString();
  }

  if (inputComentario) inputComentario.value = "";

  const guardado = await guardarCambiosOT();
  if (!guardado) {
    item.comentarios.splice(cantidadComentariosAnterior);
    ot.alertaJefe = alertaJefeAnterior;
    item.fecha = fechaAnterior;
    if (inputComentario) inputComentario.value = texto;
    return;
  }

  renderChecklist(tipo);
}


function renderComentariosPrueba(tipo, index) {

  const ot = getOT();

  const cont = document.getElementById(
    `comentarios-${tipo}-${index}`
  );

  if (!ot || !cont) return;

  cont.innerHTML = "";

  const comentarios =
    ot.pruebas?.[tipo]?.[index]?.comentarios || [];

  comentarios.forEach((comentario, comentarioIndex) => {

    const div = document.createElement("div");

    div.className =
      ["jefe_taller", "admin_sucursal"].includes(comentario.rol)
        ? "comentario-card comentario-jefe"
        : "comentario-card";

    div.innerHTML = `
      <strong>👨‍🔧 ${comentario.nombre}</strong>

      <p class="comentario-fecha">
        ${comentario.fecha}
      </p>

      <p>${comentario.texto}</p>

      ${
        ["jefe_taller", "admin_sucursal"].includes(comentario.rol) &&
        comentario.atendido !== true &&
        esUsuarioTaller()
          ? `
            <button
              type="button"
              class="btn-success"
              onclick="responderComentarioJefe(
                'pruebas',
                ${index},
                ${comentarioIndex},
                '${tipo}'
              )"
            >
              ✅ Responder observación
            </button>
          `
          : ""
      }

      ${
        ["jefe_taller", "admin_sucursal"].includes(comentario.rol) &&
        comentario.atendido === true
          ? `
            <div class="respuesta-observacion">

              <strong>
                ✅ Respondido por ${
                  comentario.atendidoPor ||
                  "Técnico"
                }
              </strong>

              <p>
                ${comentario.respuestaUsuario || ""}
              </p>

              <small>
                ${comentario.fechaAtendido || ""}
              </small>

            </div>
          `
          : ""
      }

      ${
        puedeEliminarComentario(comentario)
          ? `
            <button
              type="button"
              class="btn-delete-comment"
              onclick="eliminarComentarioPrueba(
                '${tipo}',
                ${index},
                ${comentarioIndex}
              )"
            >
              🗑
            </button>
          `
          : ""
      }
    `;

    cont.appendChild(div);
  });
}


async function eliminarComentarioPrueba(
  tipo,
  index,
  comentarioIndex
) {

  const ot = getOT();

  if (!ot || OTBloqueada()) return;

  if (!(await confirmarEliminacion("comentario"))) {
    return;
  }

  const comentarios =
    ot.pruebas?.[tipo]?.[index]?.comentarios;

  if (!Array.isArray(comentarios)) {
    alert("No se encontró el comentario");
    return;
  }

  const comentarioEliminado = comentarios[comentarioIndex];
  const alertaJefeAnterior = ot.alertaJefe;
  comentarios.splice(comentarioIndex, 1);

  actualizarAlertaJefe();

  const guardado = await guardarCambiosOT();
  if (!guardado) {
    comentarios.splice(comentarioIndex, 0, comentarioEliminado);
    ot.alertaJefe = alertaJefeAnterior;
    return;
  }

  renderChecklist(tipo);
}


// =======================
// GUARDAR
// =======================

async function guardarPruebas() {

  const ot = getOT();

  if (!ot) {
    alert("No hay OT cargada");
    return;
  }

  const guardado = await guardarCambiosOT();

  if (!guardado) return;

  alert("Progreso de PRUEBAS guardado ✅");
}


// =======================
// APROBAR
// =======================

async function aprobarPruebas() {

  if (avancePruebasEnCurso) return;

  const ot = getOT();

  if (!ot || OTBloqueada()) return;

  if (!aprobacionesHabilitadas()) {
    alert("El módulo Aprobaciones está deshabilitado para esta empresa");
    return;
  }

  if (!esJefeTaller()) {
    alert("Solo Jefe de Taller puede aprobar pruebas");
    return;
  }

  if (!validarPruebasCompleto()) return;

  avancePruebasEnCurso = true;
  const botones = Array.from(document.querySelectorAll(
    '[onclick*="aprobarPruebas"], [onclick*="finalizarPruebasSinAprobacion"]'
  ));
  botones.forEach(boton => { boton.disabled = true; });
  const pruebasAprobadoAnterior = ot.pruebasAprobado;
  const estadoAnterior = ot.estado;

  try {

  ot.pruebasAprobado = true;
  ot.estado = obtenerEstadoOT(ot);

  const guardado = await guardarCambiosOT();
  if (!guardado) {
    ot.pruebasAprobado = pruebasAprobadoAnterior;
    ot.estado = estadoAnterior;
    return;
  }

  navegarSiguienteEtapa("pruebas");

  alert("Pruebas aprobadas ✅");
  } finally {
    avancePruebasEnCurso = false;
    botones.forEach(boton => { boton.disabled = false; });
  }
}


// =======================
// VALIDACIÓN
// =======================

function validarPruebasCompleto() {

  const ot = getOT();

  if (!ot?.pruebas) {
    alert("Faltan pruebas funcionales");
    return false;
  }

  const tipos = ["general"];

  for (const tipo of tipos) {

    const lista = obtenerChecklistPruebas(ot);

    if (!Array.isArray(lista) || lista.length === 0) {
      alert("Falta cargar el checklist de pruebas");
      return false;
    }

    for (
      let index = 0;
      index < lista.length;
      index++
    ) {

      const item = lista[index];

      if (!item.ok) {
        alert(
          `Falta marcar como realizado el ítem ${
            index + 1
          } en pruebas`
        );

        return false;
      }

      if (
        !Array.isArray(item.fotos) ||
        item.fotos.length === 0
      ) {
        alert(
          `Falta evidencia fotográfica en el ítem ${
            index + 1
          } de pruebas`
        );

        return false;
      }

      const comentariosTecnicos =
        (item.comentarios || []).filter(
          comentario =>
            !["jefe_taller", "admin_sucursal"].includes(comentario.rol)
        );

      if (comentariosTecnicos.length === 0) {
        alert(
          `Falta comentario técnico en el ítem ${
            index + 1
          } de pruebas`
        );

        return false;
      }

      const observacionesPendientes =
        (item.comentarios || []).some(
          comentario =>
            ["jefe_taller", "admin_sucursal"].includes(comentario.rol) &&
            comentario.atendido !== true
        );

      if (observacionesPendientes) {
        alert(
          `Existen observaciones pendientes del ` +
          `Jefe de Taller en pruebas, ` +
          `ítem ${index + 1}`
        );

        return false;
      }
    }
  }

  return true;
}


// =======================
// FINALIZAR SIN APROBACIÓN
// =======================
async function finalizarPruebasSinAprobacion() {

  if (avancePruebasEnCurso) return;

  const ot = getOT();

  if (!ot || OTBloqueada()) return;

  if (aprobacionesHabilitadas()) {
    alert("Esta empresa requiere aprobación del Jefe de Taller");
    return;
  }

  if (!validarPruebasCompleto()) return;

  avancePruebasEnCurso = true;
  const botones = Array.from(document.querySelectorAll(
    '[onclick*="aprobarPruebas"], [onclick*="finalizarPruebasSinAprobacion"]'
  ));
  botones.forEach(boton => { boton.disabled = true; });
  const estadoAnterior = {
    pruebasAprobado: ot.pruebasAprobado,
    decisionPruebas: ot.decisionPruebas,
    estado: ot.estado,
    bitacora: Array.isArray(ot.bitacora) ? [...ot.bitacora] : null
  };

  try {
    ot.pruebasAprobado = true;
    ot.decisionPruebas = {
      resultado: "NO REQUERIDA",
      comentario: "La empresa tiene deshabilitado el módulo Aprobaciones.",
      usuario: getUsuario()?.nombre || "Usuario",
      rol: getUsuario()?.rol || "tecnico",
      fecha: new Date().toLocaleString()
    };
    ot.estado = obtenerEstadoOT(ot);

    agregarBitacora(
      "Pruebas completadas sin aprobación",
      "El módulo Aprobaciones está deshabilitado. La OT continúa al siguiente paso habilitado."
    );

    const guardado = await guardarCambiosOT();
    if (!guardado) throw new Error("No fue posible confirmar la etapa de Pruebas.");

    const siguiente = navegarSiguienteEtapa("pruebas");

    if (siguiente) {
      alert("Pruebas completadas. Se habilita la siguiente etapa ✅");
    }

  } catch (error) {
    ot.pruebasAprobado = estadoAnterior.pruebasAprobado;
    ot.decisionPruebas = estadoAnterior.decisionPruebas;
    ot.estado = estadoAnterior.estado;
    if (estadoAnterior.bitacora) ot.bitacora = estadoAnterior.bitacora;
    else delete ot.bitacora;
    console.error("Error finalizando Pruebas sin aprobación:", error);
    alert("No fue posible finalizar la etapa de Pruebas");
  } finally {
    avancePruebasEnCurso = false;
    botones.forEach(boton => { boton.disabled = false; });
  }
}

}
