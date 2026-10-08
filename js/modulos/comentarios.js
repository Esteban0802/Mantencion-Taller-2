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
const respuestasEnCurso = new Set();

const alert = (mensaje) => {
    const texto = String(mensaje || "");
    const tipo = /atendida|correctamente/i.test(texto)
        ? "exito"
        : /no se encontró|error/i.test(texto)
            ? "error"
            : "advertencia";
    const titulo = tipo === "exito"
        ? "Observación actualizada"
        : tipo === "error"
            ? "Comentario no disponible"
            : "Revisa la información";

    if (window.OverTrackUI?.mostrarMensaje) {
        return window.OverTrackUI.mostrarMensaje({ titulo, mensaje: texto, tipo });
    }

    window.alert(texto);
    return Promise.resolve(true);
};

const confirmarEliminarComentario = () => {
    if (window.OverTrackUI?.confirmarAccion) {
        return window.OverTrackUI.confirmarAccion({
            titulo: "Eliminar comentario",
            mensaje: "El comentario se eliminará de esta orden de trabajo.",
            tipo: "advertencia",
            textoConfirmar: "Eliminar",
            textoCancelar: "Cancelar",
            peligrosa: true
        });
    }

    return Promise.resolve(window.confirm("¿Eliminar comentario?"));
};


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

    validarDependencias({
        getOT,
        getUsuario,
        guardarCambiosOT,
        OTBloqueada,
        esJefeTaller,
        esUsuarioTaller,
        puedeEliminarComentario,
        agregarBitacora,
        renderIngreso,
        renderEvaluacion,
        renderOverhaul,
        renderChecklist
    });

    exponerFuncionesGlobales();

    console.log(
        "📦 Módulo Comentarios inicializado correctamente"
    );
}


function validarDependencias(dependencias) {

    Object.entries(dependencias).forEach(
        ([nombre, valor]) => {

            if (typeof valor !== "function") {
                throw new Error(
                    `Comentarios: falta la dependencia ${nombre}.`
                );
            }
        }
    );
}


function exponerFuncionesGlobales() {

    window.responderComentarioJefe =
        responderComentarioJefe;

    window.agregarComentarioItem =
        agregarComentarioItem;

    window.renderComentariosItem =
        renderComentariosItem;

    window.eliminarComentarioIngreso =
        eliminarComentarioIngreso;

    window.agregarComentarioEvaluacion =
        agregarComentarioEvaluacion;

    window.renderComentariosEvaluacion =
        renderComentariosEvaluacion;

    window.eliminarComentarioEvaluacion =
        eliminarComentarioEvaluacion;

    window.agregarComentarioDespacho =
        agregarComentarioDespacho;

    window.renderComentariosDespacho =
        renderComentariosDespacho;

    window.responderComentarioJefeDespacho =
        responderComentarioJefeDespacho;

    window.eliminarComentarioDespacho =
        eliminarComentarioDespacho;
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
        rol: usuario?.rol || "tecnico",
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
                    ["jefe_taller", "admin_sucursal"].includes(comentario?.rol) &&
                    comentario?.atendido !== true
                )
            );
    };

    const revisarComentariosDirectos = comentarios => {

        return Array.isArray(comentarios) &&
            comentarios.some(comentario =>
                ["jefe_taller", "admin_sucursal"].includes(comentario?.rol) &&
                comentario?.atendido !== true
            );
    };

    return (
        revisarLista(ot.ingreso) ||
        revisarLista(ot.evaluacion) ||
        revisarLista(ot.overhaul) ||
        revisarLista(Array.isArray(ot.pruebas?.general)
            ? ot.pruebas.general
            : [...(ot.pruebas?.mecanico || []), ...(ot.pruebas?.electrico || [])]) ||
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
    tipo = null,
    respuestaDirecta = null
) {

    if (OTBloqueada?.()) return;

    if (!esUsuarioTaller?.()) {
        alert(
            "Solo un técnico o supervisor puede responder observaciones"
        );
        return;
    }

    const respuesta = respuestaDirecta ?? prompt(
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

    const claveRespuesta = `${etapa}:${tipo || "general"}:${itemIndex}:${comentarioIndex}`;
    if (respuestasEnCurso.has(claveRespuesta)) return;
    respuestasEnCurso.add(claveRespuesta);

    const usuario = obtenerUsuario();

    const estadoAnterior = {
        atendido: comentario.atendido,
        respuestaUsuario: comentario.respuestaUsuario,
        atendidoPor: comentario.atendidoPor,
        fechaAtendido: comentario.fechaAtendido,
        alertaJefe: obtenerOT()?.alertaJefe
    };

    try {
        comentario.atendido = true;
        comentario.respuestaUsuario =
            respuesta.trim();

        comentario.atendidoPor =
            usuario?.nombre || "Técnico";

        comentario.fechaAtendido =
            new Date().toLocaleString();

        actualizarAlertaJefe();

        const guardado = await guardarCambiosOT();
        if (!guardado) {
            comentario.atendido = estadoAnterior.atendido;
            comentario.respuestaUsuario = estadoAnterior.respuestaUsuario;
            comentario.atendidoPor = estadoAnterior.atendidoPor;
            comentario.fechaAtendido = estadoAnterior.fechaAtendido;
            const ot = obtenerOT();
            if (ot) ot.alertaJefe = estadoAnterior.alertaJefe;
            return;
        }

        ejecutarRenderEtapa(etapa, tipo);

        alert("Observación atendida ✅");
    } finally {
        respuestasEnCurso.delete(claveRespuesta);
    }
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

    const inputTexto =
        document.getElementById(`comentario-${i}`);

    const usuario = obtenerUsuario();
    const nombre = usuario?.nombre || usuario?.email || "Usuario";
    const texto = inputTexto?.value?.trim();

    if (!texto) {
        alert("Ingresa el trabajo realizado");
        return;
    }

    if (!Array.isArray(item.comentarios)) {
        item.comentarios = [];
    }

    const cantidadComentariosAnterior = item.comentarios.length;
    const alertaJefeAnterior = ot.alertaJefe;
    const bitacoraAnterior = Array.isArray(ot.bitacora) ? [...ot.bitacora] : null;

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

    const guardado = await guardarCambiosOT();
    if (!guardado) {
        item.comentarios.splice(cantidadComentariosAnterior);
        ot.alertaJefe = alertaJefeAnterior;
        if (bitacoraAnterior) ot.bitacora = bitacoraAnterior;
        else delete ot.bitacora;
        if (inputTexto) inputTexto.value = texto;
        return;
    }

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

    if (!(await confirmarEliminarComentario())) {
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

    const inputTexto =
        document.getElementById(
            `comentario-eval-${i}`
        );

    const usuario = obtenerUsuario();
    const nombre = usuario?.nombre || usuario?.email || "Usuario";
    const texto = inputTexto?.value?.trim();

    if (!texto) {
        alert("Ingresa el trabajo realizado");
        return;
    }

    if (!Array.isArray(item.comentarios)) {
        item.comentarios = [];
    }

    const cantidadComentariosAnterior = item.comentarios.length;
    const alertaJefeAnterior = ot.alertaJefe;

    item.comentarios.push(
        crearComentario(nombre, texto)
    );

    if (esJefeTaller?.()) {
        ot.alertaJefe = true;
    }

    if (inputTexto) {
        inputTexto.value = "";
    }

    const guardado = await guardarCambiosOT();
    if (!guardado) {
        item.comentarios.splice(cantidadComentariosAnterior);
        ot.alertaJefe = alertaJefeAnterior;
        if (inputTexto) inputTexto.value = texto;
        return;
    }

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

    if (!(await confirmarEliminarComentario())) {
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
            "Solo un técnico o supervisor puede responder observaciones"
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

    const claveRespuesta = `despacho:${tipo}:${comentarioIndex}`;
    if (respuestasEnCurso.has(claveRespuesta)) return;
    respuestasEnCurso.add(claveRespuesta);

    const usuario = obtenerUsuario();

    const estadoAnterior = {
        atendido: comentario.atendido,
        respuestaUsuario: comentario.respuestaUsuario,
        atendidoPor: comentario.atendidoPor,
        fechaAtendido: comentario.fechaAtendido,
        alertaJefe: obtenerOT()?.alertaJefe
    };

    try {
        comentario.atendido = true;
        comentario.respuestaUsuario =
            respuesta.trim();

        comentario.atendidoPor =
            usuario?.nombre || "Técnico";

        comentario.fechaAtendido =
            new Date().toLocaleString();

        actualizarAlertaJefe();

        const guardado = await guardarCambiosOT();
        if (!guardado) {
            comentario.atendido = estadoAnterior.atendido;
            comentario.respuestaUsuario = estadoAnterior.respuestaUsuario;
            comentario.atendidoPor = estadoAnterior.atendidoPor;
            comentario.fechaAtendido = estadoAnterior.fechaAtendido;
            const ot = obtenerOT();
            if (ot) ot.alertaJefe = estadoAnterior.alertaJefe;
            return;
        }

        renderComentariosDespacho(tipo);

        alert("Observación atendida ✅");
    } finally {
        respuestasEnCurso.delete(claveRespuesta);
    }
}

export async function eliminarComentarioDespacho(
    tipo,
    comentarioIndex
) {

    if (OTBloqueada?.()) return;

    const ot = obtenerOT();
    const lista =
        obtenerComentariosDespacho(tipo);

    if (!lista?.[comentarioIndex]) return;

    if (!(await confirmarEliminarComentario())) {
        return;
    }

    const comentarioEliminado = lista[comentarioIndex];
    const alertaJefeAnterior = ot?.alertaJefe;
    lista.splice(comentarioIndex, 1);

    actualizarAlertaJefe();

    const guardado = await guardarCambiosOT();
    if (!guardado) {
        lista.splice(comentarioIndex, 0, comentarioEliminado);
        if (ot) ot.alertaJefe = alertaJefeAnterior;
        return;
    }

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
        ["jefe_taller", "admin_sucursal"].includes(comentario?.rol)
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
        ["jefe_taller", "admin_sucursal"].includes(comentario?.rol) &&
        comentario?.atendido !== true &&
        esUsuarioTaller?.()
    ) {

        if (responder) {
            botonResponder = `
                <div class="respuesta-observacion-form">
                    <input
                        type="text"
                        class="input-respuesta-observacion"
                        placeholder="Respuesta a la observación"
                    >
                    <button
                        type="button"
                        class="btn-success btn-responder-observacion"
                    >
                        ✅ Enviar respuesta
                    </button>
                </div>
            `;
        }

        if (responderDespacho) {
            botonResponder = `
                <button
                    type="button"
                    class="btn-success btn-responder-observacion-despacho"
                >
                    ✅ Responder observación
                </button>
            `;
        }
    }

    let bloqueRespuesta = "";

    if (
        ["jefe_taller", "admin_sucursal"].includes(comentario?.rol) &&
        comentario?.atendido === true
    ) {

        const atendidoPor =
            escaparHTML(
                comentario?.atendidoPor ||
                "Técnico"
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

    tarjeta.querySelector(".btn-responder-observacion")?.addEventListener("click", () => {
        const respuestaTexto = tarjeta
            .querySelector(".input-respuesta-observacion")
            ?.value?.trim();

        if (!respuestaTexto) {
            alert("Debes ingresar una respuesta");
            return;
        }

        responderComentarioJefe(
            responder.etapa,
            responder.itemIndex,
            responder.comentarioIndex,
            null,
            respuestaTexto
        );
    });

    tarjeta.querySelector(".btn-responder-observacion-despacho")?.addEventListener("click", () => {
        responderComentarioJefeDespacho(
            responderDespacho.tipo,
            responderDespacho.comentarioIndex
        );
    });

    return tarjeta;
}
