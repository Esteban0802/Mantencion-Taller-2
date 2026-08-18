let getOT = null;
let getUsuario = null;

let guardarCambiosOT = null;
let OTBloqueada = null;

let esJefeTaller = null;
let esUsuarioTaller = null;
let puedeEliminarComentario = null;

let agregarBitacora = null;

let renderIngreso = null;
let renderEvaluacion = null;
let renderOverhaul = null;
let renderChecklist = null;


/**
 * Inicializa las dependencias necesarias para el módulo.
 */
export function inicializarModuloComentarios(dependencias = {}) {

    getOT = dependencias.getOT;
    getUsuario = dependencias.getUsuario;

    guardarCambiosOT = dependencias.guardarCambiosOT;
    OTBloqueada = dependencias.OTBloqueada;

    esJefeTaller = dependencias.esJefeTaller;
    esUsuarioTaller = dependencias.esUsuarioTaller;
    puedeEliminarComentario =
        dependencias.puedeEliminarComentario;

    agregarBitacora = dependencias.agregarBitacora;

    renderIngreso = dependencias.renderIngreso;
    renderEvaluacion = dependencias.renderEvaluacion;
    renderOverhaul = dependencias.renderOverhaul;
    renderChecklist = dependencias.renderChecklist;

    if (typeof getOT !== "function") {
        throw new Error(
            "comentarios.js requiere una función getOT"
        );
    }

    if (typeof getUsuario !== "function") {
        throw new Error(
            "comentarios.js requiere una función getUsuario"
        );
    }

    if (typeof guardarCambiosOT !== "function") {
        throw new Error(
            "comentarios.js requiere guardarCambiosOT"
        );
    }
}


/* =========================================================
   UTILIDADES INTERNAS
========================================================= */

function obtenerOT() {
    return getOT?.() || null;
}

function obtenerUsuario() {
    return getUsuario?.() || null;
}

function escaparHTML(valor) {

    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function crearComentario(nombre, texto) {

    const usuario = obtenerUsuario();

    return {
        nombre: nombre || usuario?.nombre || "Usuario",
        texto: texto.trim(),
        fecha: new Date().toLocaleString(),
        rol: usuario?.rol || "usuario_taller",
        creadoPorUid: usuario?.uid || "",
        creadoPorNombre:
            usuario?.nombre ||
            nombre ||
            "Usuario",
        atendido: esJefeTaller?.() ? false : true,
        respuestaUsuario: "",
        atendidoPor: "",
        fechaAtendido: ""
    };
}

function obtenerListaEtapa(etapa, tipo = null) {

    const ot = obtenerOT();

    if (!ot) return null;

    switch (etapa) {

        case "ingreso":
            return ot.ingreso;

        case "evaluacion":
            return ot.evaluacion;

        case "overhaul":
            return ot.overhaul;

        case "pruebas":
            return ot.pruebas?.[tipo];

        default:
            return null;
    }
}

function ejecutarRenderEtapa(etapa, tipo = null) {

    if (etapa === "ingreso") {
        if (typeof renderIngreso === "function") {
            renderIngreso();
        } else {
            window.renderIngreso?.();
        }
    }

    if (etapa === "evaluacion") {
        if (typeof renderEvaluacion === "function") {
            renderEvaluacion();
        } else {
            window.renderEvaluacion?.();
        }
    }

    if (etapa === "overhaul") {
        if (typeof renderOverhaul === "function") {
            renderOverhaul();
        } else {
            window.renderOverhaul?.();
        }
    }

    if (etapa === "pruebas") {
        if (typeof renderChecklist === "function") {
            renderChecklist(tipo);
        } else {
            window.renderChecklist?.(tipo);
        }
    }
}


/* =========================================================
   ALERTAS Y OBSERVACIONES DEL JEFE
========================================================= */

export function existenComentariosJefePendientes(ot) {

    if (!ot) return false;

    const revisarLista = lista => {

        return Array.isArray(lista) &&
            lista.some(item =>
                Array.isArray(item?.comentarios) &&
                item.comentarios.some(comentario =>
                    comentario?.rol === "jefe_taller" &&
                    comentario?.atendido !== true
                )
            );
    };

    const revisarComentariosDirectos = comentarios => {

        return Array.isArray(comentarios) &&
            comentarios.some(comentario =>
                comentario?.rol === "jefe_taller" &&
                comentario?.atendido !== true
            );
    };

    return (
        revisarLista(ot.ingreso) ||
        revisarLista(ot.evaluacion) ||
        revisarLista(ot.overhaul) ||
        revisarLista(ot.pruebas?.mecanico) ||
        revisarLista(ot.pruebas?.electrico) ||
        revisarComentariosDirectos(
            ot.despacho?.comentariosPreparacion
        ) ||
        revisarComentariosDirectos(
            ot.despacho?.comentariosFinal
        )
    );
}

export function actualizarAlertaJefe() {

    const ot = obtenerOT();

    if (!ot) return;

    ot.alertaJefe =
        existenComentariosJefePendientes(ot);
}

export async function responderComentarioJefe(
    etapa,
    itemIndex,
    comentarioIndex,
    tipo = null
) {

    if (OTBloqueada?.()) return;

    if (!esUsuarioTaller?.()) {
        alert(
            "Solo Usuario Taller puede responder observaciones"
        );
        return;
    }

    const respuesta = prompt(
        "Respuesta a la observación del Jefe:"
    );

    if (!respuesta?.trim()) {
        alert("Debes ingresar una respuesta");
        return;
    }

    const lista = obtenerListaEtapa(etapa, tipo);

    const comentario =
        lista?.[itemIndex]
            ?.comentarios?.[comentarioIndex];

    if (!comentario) {
        alert("No se encontró el comentario");
        return;
    }

    const usuario = obtenerUsuario();

    comentario.atendido = true;
    comentario.respuestaUsuario =
        respuesta.trim();

    comentario.atendidoPor =
        usuario?.nombre || "Usuario Taller";

    comentario.fechaAtendido =
        new Date().toLocaleString();

    actualizarAlertaJefe();

    await guardarCambiosOT();

    ejecutarRenderEtapa(etapa, tipo);

    alert("Observación atendida ✅");
}


/* =========================================================
   INGRESO
========================================================= */

export async function agregarComentarioItem(i) {

    if (OTBloqueada?.()) return;

    const ot = obtenerOT();

    const item = ot?.ingreso?.[i];

    if (!item) {
        alert("No se encontró el ítem de Ingreso");
        return;
    }

    const inputNombre =
        document.getElementById(`tecnico-${i}`);

    const inputTexto =
        document.getElementById(`comentario-${i}`);

    const nombre = inputNombre?.value?.trim();
    const texto = inputTexto?.value?.trim();

    if (!nombre || !texto) {
        alert("Completa técnico y comentario");
        return;
    }

    if (!Array.isArray(item.comentarios)) {
        item.comentarios = [];
    }

    item.comentarios.push(
        crearComentario(nombre, texto)
    );

    if (esJefeTaller?.()) {
        ot.alertaJefe = true;
    }

    if (typeof agregarBitacora === "function") {
        agregarBitacora(
            "Comentario agregado",
            `Ingreso: ${item.item || "Ítem"}`
        );
    }

    if (inputTexto) {
        inputTexto.value = "";
    }

    await guardarCambiosOT();

    ejecutarRenderEtapa("ingreso");
}

export function renderComentariosItem(i) {

    const ot = obtenerOT();

    const item = ot?.ingreso?.[i];

    const contenedor =
        document.getElementById(
            `comentarios-ingreso-${i}`
        );

    if (!item || !contenedor) return;

    if (!Array.isArray(item.comentarios)) {
        item.comentarios = [];
    }

    contenedor.innerHTML = "";

    item.comentarios.forEach(
        (comentario, comentarioIndex) => {

            const tarjeta =
                crearTarjetaComentario({
                    comentario,
                    responder: {
                        etapa: "ingreso",
                        itemIndex: i,
                        comentarioIndex
                    },
                    eliminar: {
                        funcion:
                            "eliminarComentarioIngreso",
                        argumentos:
                            `${i}, ${comentarioIndex}`
                    }
                });

            contenedor.appendChild(tarjeta);
        }
    );
}

export async function eliminarComentarioIngreso(
    i,
    comentarioIndex
) {

    if (OTBloqueada?.()) return;

    const ot = obtenerOT();

    const comentarios =
        ot?.ingreso?.[i]?.comentarios;

    if (!Array.isArray(comentarios)) return;

    if (!confirm("¿Eliminar comentario?")) {
        return;
    }

    comentarios.splice(comentarioIndex, 1);

    actualizarAlertaJefe();

    await guardarCambiosOT();

    ejecutarRenderEtapa("ingreso");
}


/* =========================================================
   EVALUACIÓN
========================================================= */

export async function agregarComentarioEvaluacion(i) {

    if (OTBloqueada?.()) return;

    const ot = obtenerOT();

    const item = ot?.evaluacion?.[i];

    if (!item) {
        alert(
            "No se encontró el ítem de Evaluación"
        );
        return;
    }

    const inputNombre =
        document.getElementById(
            `tecnico-eval-${i}`
        );

    const inputTexto =
        document.getElementById(
            `comentario-eval-${i}`
        );

    const nombre = inputNombre?.value?.trim();
    const texto = inputTexto?.value?.trim();

    if (!nombre || !texto) {
        alert("Completa técnico y comentario");
        return;
    }

    if (!Array.isArray(item.comentarios)) {
        item.comentarios = [];
    }

    item.comentarios.push(
        crearComentario(nombre, texto)
    );

    if (esJefeTaller?.()) {
        ot.alertaJefe = true;
    }

    if (inputTexto) {
        inputTexto.value = "";
    }

    await guardarCambiosOT();

    ejecutarRenderEtapa("evaluacion");
}

export function renderComentariosEvaluacion(i) {

    const ot = obtenerOT();

    const item = ot?.evaluacion?.[i];

    const contenedor =
        document.getElementById(
            `comentarios-evaluacion-${i}`
        );

    if (!item || !contenedor) return;

    if (!Array.isArray(item.comentarios)) {
        item.comentarios = [];
    }

    contenedor.innerHTML = "";

    item.comentarios.forEach(
        (comentario, comentarioIndex) => {

            const tarjeta =
                crearTarjetaComentario({
                    comentario,
                    responder: {
                        etapa: "evaluacion",
                        itemIndex: i,
                        comentarioIndex
                    },
                    eliminar: {
                        funcion:
                            "eliminarComentarioEvaluacion",
                        argumentos:
                            `${i}, ${comentarioIndex}`
                    }
                });

            contenedor.appendChild(tarjeta);
        }
    );
}

export async function eliminarComentarioEvaluacion(
    i,
    comentarioIndex
) {

    if (OTBloqueada?.()) return;

    const ot = obtenerOT();

    const comentarios =
        ot?.evaluacion?.[i]?.comentarios;

    if (!Array.isArray(comentarios)) return;

    if (!confirm("¿Eliminar comentario?")) {
        return;
    }

    comentarios.splice(comentarioIndex, 1);

    actualizarAlertaJefe();

    await guardarCambiosOT();

    ejecutarRenderEtapa("evaluacion");
}


/* =========================================================
   DESPACHO
========================================================= */

export function prepararComentariosDespacho() {

    const ot = obtenerOT();

    if (!ot) return;

    if (!ot.despacho) {
        ot.despacho = {
            preparacion: [],
            final: []
        };
    }

    if (
        !Array.isArray(
            ot.despacho.comentariosPreparacion
        )
    ) {
        ot.despacho.comentariosPreparacion = [];
    }

    if (
        !Array.isArray(
            ot.despacho.comentariosFinal
        )
    ) {
        ot.despacho.comentariosFinal = [];
    }
}

function obtenerComentariosDespacho(tipo) {

    const ot = obtenerOT();

    prepararComentariosDespacho();

    if (!ot?.despacho) return null;

    return tipo === "preparacion"
        ? ot.despacho.comentariosPreparacion
        : ot.despacho.comentariosFinal;
}

export async function agregarComentarioDespacho(
    tipo
) {

    if (OTBloqueada?.()) return;

    prepararComentariosDespacho();

    const inputId =
        tipo === "preparacion"
            ? "comentarioDespachoPrep"
            : "comentarioDespachoFinal";

    const input =
        document.getElementById(inputId);

    const texto = input?.value?.trim();

    if (!texto) {
        alert("Debes ingresar un comentario");
        return;
    }

    const usuario = obtenerUsuario();

    const comentario = crearComentario(
        usuario?.nombre || "Usuario",
        texto
    );

    const lista =
        obtenerComentariosDespacho(tipo);

    if (!lista) return;

    lista.push(comentario);

    const ot = obtenerOT();

    if (esJefeTaller?.()) {
        ot.alertaJefe = true;
    }

    input.value = "";

    await guardarCambiosOT();

    renderComentariosDespacho(tipo);
}

export function renderComentariosDespacho(tipo) {

    prepararComentariosDespacho();

    const contenedorId =
        tipo === "preparacion"
            ? "comentarios-despacho-preparacion"
            : "comentarios-despacho-final";

    const contenedor =
        document.getElementById(contenedorId);

    if (!contenedor) return;

    const lista =
        obtenerComentariosDespacho(tipo);

    contenedor.innerHTML = "";

    lista?.forEach(
        (comentario, comentarioIndex) => {

            const tarjeta =
                crearTarjetaComentario({
                    comentario,
                    responderDespacho: {
                        tipo,
                        comentarioIndex
                    },
                    eliminar: {
                        funcion:
                            "eliminarComentarioDespacho",
                        argumentos:
                            `'${tipo}', ${comentarioIndex}`
                    }
                });

            contenedor.appendChild(tarjeta);
        }
    );
}

export async function responderComentarioJefeDespacho(
    tipo,
    comentarioIndex
) {

    if (OTBloqueada?.()) return;

    if (!esUsuarioTaller?.()) {
        alert(
            "Solo Usuario Taller puede responder observaciones"
        );
        return;
    }

    const respuesta = prompt(
        "Respuesta a la observación del Jefe:"
    );

    if (!respuesta?.trim()) {
        alert("Debes ingresar una respuesta");
        return;
    }

    const lista =
        obtenerComentariosDespacho(tipo);

    const comentario =
        lista?.[comentarioIndex];

    if (!comentario) {
        alert("No se encontró el comentario");
        return;
    }

    const usuario = obtenerUsuario();

    comentario.atendido = true;
    comentario.respuestaUsuario =
        respuesta.trim();

    comentario.atendidoPor =
        usuario?.nombre || "Usuario Taller";

    comentario.fechaAtendido =
        new Date().toLocaleString();

    actualizarAlertaJefe();

    await guardarCambiosOT();

    renderComentariosDespacho(tipo);

    alert("Observación atendida ✅");
}

export async function eliminarComentarioDespacho(
    tipo,
    comentarioIndex
) {

    if (OTBloqueada?.()) return;

    const lista =
        obtenerComentariosDespacho(tipo);

    if (!lista?.[comentarioIndex]) return;

    if (!confirm("¿Eliminar comentario?")) {
        return;
    }

    lista.splice(comentarioIndex, 1);

    actualizarAlertaJefe();

    await guardarCambiosOT();

    renderComentariosDespacho(tipo);
}


/* =========================================================
   RENDER GENÉRICO
========================================================= */

function crearTarjetaComentario({
    comentario,
    responder = null,
    responderDespacho = null,
    eliminar = null
}) {

    const tarjeta = document.createElement("div");

    tarjeta.className =
        comentario?.rol === "jefe_taller"
            ? "comentario-card comentario-jefe"
            : "comentario-card";

    const nombre =
        escaparHTML(
            comentario?.nombre || "Usuario"
        );

    const fecha =
        escaparHTML(comentario?.fecha || "");

    const texto =
        escaparHTML(comentario?.texto || "");

    let botonResponder = "";

    if (
        comentario?.rol === "jefe_taller" &&
        comentario?.atendido !== true &&
        esUsuarioTaller?.()
    ) {

        if (responder) {
            botonResponder = `
                <button
                    type="button"
                    class="btn-success"
                    onclick="responderComentarioJefe(
                        '${responder.etapa}',
                        ${responder.itemIndex},
                        ${responder.comentarioIndex}
                    )"
                >
                    ✅ Responder observación
                </button>
            `;
        }

        if (responderDespacho) {
            botonResponder = `
                <button
                    type="button"
                    class="btn-success"
                    onclick="responderComentarioJefeDespacho(
                        '${responderDespacho.tipo}',
                        ${responderDespacho.comentarioIndex}
                    )"
                >
                    ✅ Responder observación
                </button>
            `;
        }
    }

    let bloqueRespuesta = "";

    if (
        comentario?.rol === "jefe_taller" &&
        comentario?.atendido === true
    ) {

        const atendidoPor =
            escaparHTML(
                comentario?.atendidoPor ||
                "Usuario Taller"
            );

        const respuesta =
            escaparHTML(
                comentario?.respuestaUsuario || ""
            );

        const fechaAtendido =
            escaparHTML(
                comentario?.fechaAtendido || ""
            );

        bloqueRespuesta = `
            <div class="respuesta-observacion">
                <strong>
                    ✅ Respondido por ${atendidoPor}
                </strong>

                <p>${respuesta}</p>

                <small>${fechaAtendido}</small>
            </div>
        `;
    }

    let botonEliminar = "";

    if (
        eliminar &&
        puedeEliminarComentario?.(comentario)
    ) {
        botonEliminar = `
            <button
                type="button"
                class="btn-delete-comment"
                onclick="${eliminar.funcion}(
                    ${eliminar.argumentos}
                )"
            >
                🗑
            </button>
        `;
    }

    tarjeta.innerHTML = `
        <strong>👨‍🔧 ${nombre}</strong>

        <p class="comentario-fecha">
            ${fecha}
        </p>

        <p>${texto}</p>

        ${botonResponder}

        ${bloqueRespuesta}

        ${botonEliminar}
    `;

    return tarjeta;
}