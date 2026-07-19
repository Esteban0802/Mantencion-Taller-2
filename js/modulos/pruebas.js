let getOT;
let getUsuario;

let guardarCambiosOT;
let autoguardarCambiosOT;

let renderProgresoEtapa;
let itemCompleto;

let OTBloqueada;
let esJefeTaller;
let esUsuarioTaller;
let puedeEliminarComentario;

let actualizarEstadoGanttDesdeChecklist;
let recalcularGanttAutomatico;
let renderCartaGantt;

let comprimirImagenBlob;
let subirArchivoStorage;
let eliminarArchivoStorage;
let verImagenModal;

let actualizarAlertaJefe;
let obtenerEstadoOT;
let habilitarTab;
let cambiarTab;
let responderComentarioJefe;


/**
 * Inicializa el módulo de Pruebas.
 *
 * El módulo no accede directamente a variables globales de app.js.
 * Todas sus dependencias se reciben desde inicializarModuloPruebas().
 */
export function inicializarModuloPruebas(dependencias = {}) {

  getOT = dependencias.getOT;
  getUsuario = dependencias.getUsuario;

  guardarCambiosOT = dependencias.guardarCambiosOT;
  autoguardarCambiosOT = dependencias.autoguardarCambiosOT;

  renderProgresoEtapa = dependencias.renderProgresoEtapa;
  itemCompleto = dependencias.itemCompleto;

  OTBloqueada = dependencias.OTBloqueada;
  esJefeTaller = dependencias.esJefeTaller;
  esUsuarioTaller = dependencias.esUsuarioTaller;
  puedeEliminarComentario = dependencias.puedeEliminarComentario;

  actualizarEstadoGanttDesdeChecklist =
    dependencias.actualizarEstadoGanttDesdeChecklist;

  recalcularGanttAutomatico =
    dependencias.recalcularGanttAutomatico;

  renderCartaGantt = dependencias.renderCartaGantt;

  comprimirImagenBlob = dependencias.comprimirImagenBlob;
  subirArchivoStorage = dependencias.subirArchivoStorage;
  eliminarArchivoStorage = dependencias.eliminarArchivoStorage;
  verImagenModal = dependencias.verImagenModal;

  actualizarAlertaJefe = dependencias.actualizarAlertaJefe;
  obtenerEstadoOT = dependencias.obtenerEstadoOT;
  habilitarTab = dependencias.habilitarTab;
  cambiarTab = dependencias.cambiarTab;
  responderComentarioJefe = dependencias.responderComentarioJefe;

  validarDependencias();

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
    validarPruebasCompleto
  };
}


/**
 * Comprueba que app.js haya entregado las funciones necesarias.
 */
function validarDependencias() {

  const requeridas = {
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
    responderComentarioJefe
  };

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

}


// =======================
// CARGAR CHECKLIST
// =======================

function cargarChecklist(tipo) {

  const ot = getOT();

  if (!ot) {
    alert("No hay OS cargada");
    return;
  }

  const inputId =
    tipo === "mecanico"
      ? "excelMecanico"
      : "excelElectrico";

  const input = document.getElementById(inputId);
  const file = input?.files?.[0];

  if (!file) {
    alert("Debes subir el Excel");
    return;
  }

  const reader = new FileReader();

  reader.onload = async function (event) {

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
        .filter(item => item)
        .map(item => ({
          item,
          ok: false,
          fotos: [],
          comentarios: [],
          fecha: null
        }));

      if (!ot.pruebas) {
        ot.pruebas = {
          mecanico: [],
          electrico: []
        };
      }

      ot.pruebas[tipo] = checklist;

      await guardarCambiosOT();

      renderChecklist(tipo);

    } catch (error) {

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

function renderChecklist(tipo) {

  const ot = getOT();

  if (!ot) return;

  const contId =
    tipo === "mecanico"
      ? "listaMecanico"
      : "listaElectrico";

  const progresoId =
    tipo === "mecanico"
      ? "progresoMecanico"
      : "progresoElectrico";

  const cont = document.getElementById(contId);

  if (!cont) return;

  const lista = ot.pruebas?.[tipo] || [];

  renderProgresoEtapa(
    progresoId,
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
            accept="image/*"
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

      <div class="checklist-comment-box">

        <input
          id="tecnico-${tipo}-${index}"
          placeholder="Técnico"
        >

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

    mostrarFotosPrueba(tipo, index);
    renderComentariosPrueba(tipo, index);
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

  renderChecklist(tipo);

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

  try {

    if (!ot.pruebas) {
      ot.pruebas = {
        mecanico: [],
        electrico: []
      };
    }

    const item = ot.pruebas?.[tipo]?.[index];

    if (!item) {
      throw new Error(
        "No se encontró el ítem de pruebas"
      );
    }

    if (!Array.isArray(item.fotos)) {
      item.fotos = [];
    }

    for (const file of files) {

      const imagenBlob =
        await comprimirImagenBlob(file);

      const imagenComprimida = new File(
        [imagenBlob],
        `pruebas_${tipo}_${Date.now()}.jpg`,
        {
          type: "image/jpeg"
        }
      );

      const urlFoto =
        await subirArchivoStorage(
          imagenComprimida,
          `pruebas_${tipo}`,
          index
        );

      item.fotos.push(urlFoto);
    }

    await guardarCambiosOT();

    renderChecklist(tipo);

    event.target.value = "";

  } catch (error) {

    console.error(
      "Error subiendo foto de pruebas:",
      error
    );

    alert("Error al subir imágenes de pruebas");
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

    const img = document.createElement("img");

    img.src = foto;
    img.width = 100;
    img.style.cursor = "pointer";
    img.onclick = () => verImagenModal(foto);

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

    container.appendChild(img);
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

  if (!confirm("¿Eliminar esta evidencia?")) {
    return;
  }

  const fotos =
    ot.pruebas?.[tipo]?.[index]?.fotos;

  if (!Array.isArray(fotos)) return;

  const urlFoto = fotos[fotoIndex];

  if (!urlFoto) return;

  try {

    await eliminarArchivoStorage(urlFoto);

    fotos.splice(fotoIndex, 1);

    await guardarCambiosOT();

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

function agregarComentarioPrueba(tipo, index) {

  const ot = getOT();
  const usuario = getUsuario();

  if (!ot || OTBloqueada()) return;

  const item = ot.pruebas?.[tipo]?.[index];

  if (!item) return;

  const inputTecnico = document.getElementById(
    `tecnico-${tipo}-${index}`
  );

  const inputComentario = document.getElementById(
    `comentario-${tipo}-${index}`
  );

  const nombre = inputTecnico?.value?.trim();
  const texto = inputComentario?.value?.trim();

  if (!nombre || !texto) {
    alert("Completa técnico y comentario");
    return;
  }

  if (!Array.isArray(item.comentarios)) {
    item.comentarios = [];
  }

  item.comentarios.push({
    nombre,
    texto,
    fecha: new Date().toLocaleString(),
    rol: usuario?.rol || "usuario_taller",
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

  guardarCambiosOT();

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
      comentario.rol === "jefe_taller"
        ? "comentario-card comentario-jefe"
        : "comentario-card";

    div.innerHTML = `
      <strong>👨‍🔧 ${comentario.nombre}</strong>

      <p class="comentario-fecha">
        ${comentario.fecha}
      </p>

      <p>${comentario.texto}</p>

      ${
        comentario.rol === "jefe_taller" &&
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
        comentario.rol === "jefe_taller" &&
        comentario.atendido === true
          ? `
            <div class="respuesta-observacion">

              <strong>
                ✅ Respondido por ${
                  comentario.atendidoPor ||
                  "Usuario Taller"
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


function eliminarComentarioPrueba(
  tipo,
  index,
  comentarioIndex
) {

  const ot = getOT();

  if (!ot || OTBloqueada()) return;

  if (!confirm("¿Eliminar este registro?")) {
    return;
  }

  const comentarios =
    ot.pruebas?.[tipo]?.[index]?.comentarios;

  if (!Array.isArray(comentarios)) {
    alert("No se encontró el comentario");
    return;
  }

  comentarios.splice(comentarioIndex, 1);

  actualizarAlertaJefe();

  guardarCambiosOT();

  renderChecklist(tipo);
}


// =======================
// GUARDAR
// =======================

function guardarPruebas() {

  const ot = getOT();

  if (!ot) {
    alert("No hay OT cargada");
    return;
  }

  guardarCambiosOT();

  alert("Progreso de PRUEBAS guardado ✅");
}


// =======================
// APROBAR
// =======================

async function aprobarPruebas() {

  const ot = getOT();

  if (!ot || OTBloqueada()) return;

  if (!esJefeTaller()) {
    alert("Solo Jefe de Taller puede aprobar pruebas");
    return;
  }

  if (!validarPruebasCompleto()) return;

  ot.pruebasAprobado = true;
  ot.estado = obtenerEstadoOT(ot);

  await guardarCambiosOT();

  habilitarTab("despacho");
  cambiarTab("despacho");

  alert("Pruebas aprobadas ✅");
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

  const tipos = [
    "mecanico",
    "electrico"
  ];

  for (const tipo of tipos) {

    const lista = ot.pruebas[tipo];

    if (!Array.isArray(lista) || lista.length === 0) {
      alert(`Falta cargar checklist ${tipo}`);
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
          } en pruebas ${tipo}`
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
          } de pruebas ${tipo}`
        );

        return false;
      }

      const comentariosTecnicos =
        (item.comentarios || []).filter(
          comentario =>
            comentario.rol !== "jefe_taller"
        );

      if (comentariosTecnicos.length === 0) {
        alert(
          `Falta comentario técnico en el ítem ${
            index + 1
          } de pruebas ${tipo}`
        );

        return false;
      }

      const observacionesPendientes =
        (item.comentarios || []).some(
          comentario =>
            comentario.rol === "jefe_taller" &&
            comentario.atendido !== true
        );

      if (observacionesPendientes) {
        alert(
          `Existen observaciones pendientes del ` +
          `Jefe de Taller en pruebas ${tipo}, ` +
          `ítem ${index + 1}`
        );

        return false;
      }
    }
  }

  return true;
}