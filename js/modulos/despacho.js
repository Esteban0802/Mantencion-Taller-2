export function inicializarModuloDespacho(deps) {

    const {
        getOT,
        getUsuario,
        guardarCambiosOT,
        OTBloqueada,
        esJefeTaller,
        esUsuarioTaller,
        puedeEliminarComentario,
        subirArchivoStorage,
        actualizarAlertaJefe
    } = deps;

    const ot = () => getOT();
    const usuario = () => getUsuario();


// =======================
// SUBIR DOCUMENTOS POR SECCIÓN
// =======================
async function subirDocsSeccion(tipo) {

    if (OTBloqueada()) return;

    const inputId = tipo === "preparacion"
        ? "docsPreparacion"
        : "docsFinal";

    const input = document.getElementById(inputId);

    if (!input || !input.files.length) {
        alert("Selecciona archivos");
        return;
    }

    if (!ot().despacho) {

        ot().despacho = {

            preparacion: [],
            final: []

        };

    }

    if (!ot().despacho.preparacion)
        ot().despacho.preparacion = [];

    if (!ot().despacho.final)
        ot().despacho.final = [];

    try {

        for (const file of input.files) {

            const urlArchivo = await subirArchivoStorage(

                file,

                tipo === "preparacion"
                    ? "despacho_preparacion"
                    : "despacho_final",

                "documentos"

            );

            ot().despacho[tipo].push({

                nombre: file.name,
                tipo: file.type,
                url: urlArchivo,
                fecha: new Date().toLocaleString()

            });

        }

        await guardarCambiosOT();

        renderDocsSeccion("preparacion");
        renderDocsSeccion("final");

        input.value = "";

    }

    catch (error) {

        console.error(error);

        alert("Error al subir documento");

    }

}


// =======================
// RENDER DOCUMENTOS
// =======================
function renderDocsSeccion(tipo) {

    const contId = tipo === "preparacion"
        ? "listaDocsPrep"
        : "listaDocsFinal";

    const cont = document.getElementById(contId);

    if (!cont) return;

    cont.innerHTML = "";

    cont.className = "docs-pro-grid";

    if (!ot().despacho || !ot().despacho[tipo]) return;

    ot().despacho[tipo].forEach((doc, index) => {

        const div = document.createElement("div");

        div.className = "doc-card-pro";

        div.innerHTML = `

        <div class="doc-card-left">

            <div class="doc-card-icon">
                📄
            </div>

            <div class="doc-card-info">

                <h4>${doc.nombre || "Documento sin nombre"}</h4>

                <span>

                    Documento de ${tipo === "preparacion"
                        ? "preparación"
                        : "despacho final"}

                </span>

            </div>

        </div>

        <div class="doc-card-actions">

            <button
                class="btn-doc-view permitido-bloqueo"
                onclick="abrirDocSeccion(event,'${tipo}',${index})">

                👁 Ver

            </button>

            <button
                class="btn-doc-delete"
                onclick="eliminarDocSeccion(event,'${tipo}',${index})">

                🗑 Eliminar

            </button>

        </div>

        `;

        cont.appendChild(div);

    });

}


function abrirDocSeccion(e, tipo, index) {

    e.stopPropagation();

    abrirDocumento(ot().despacho[tipo][index]);

}

function eliminarDocSeccion(e, tipo, index) {

    e.stopPropagation();

    if (!confirm("¿Eliminar este documento?")) return;

    ot().despacho[tipo].splice(index, 1);

    guardarCambiosOT();

    renderDocsSeccion(tipo);

}


// =======================
// ABRIR DOCUMENTO (MODAL)
// =======================
function abrirDocumento(doc) {

    const modal = document.getElementById("modalDoc");
    const visor = document.getElementById("visorDoc");

    if (!modal || !visor) {
        console.error("Modal o visor no existen en el HTML");
        return;
    }

    visor.src = doc.url || doc.data;
    modal.style.display = "block";
}

function cerrarModal() {

    const modal = document.getElementById("modalDoc");
    const visor = document.getElementById("visorDoc");

    if (!modal || !visor) return;

    modal.style.display = "none";
    visor.src = "";
}

window.onclick = function (e) {

    const modal = document.getElementById("modalDoc");

    if (e.target === modal) {
        cerrarModal();
    }

};

// =======================
// GUARDAR DESPACHO
// =======================
function guardarDespacho() {

    if (!ot()) {
        alert("No hay OT cargada");
        return;
    }

    if (!ot().despacho) {
        alert("No hay datos en despacho");
        return;
    }

    guardarCambiosOT();

    alert("Progreso de DESPACHO guardado ✅");

}

// =======================
// VALIDAR DESPACHO
// =======================
function validarDespachoCompleto() {

    if (!ot().despacho) {

        alert("Falta información de despacho");
        return false;

    }

    const prep = ot().despacho.preparacion?.length > 0;
    const final = ot().despacho.final?.length > 0;

    if (!prep) {

        alert("Faltan documentos de preparación");
        return false;

    }

    if (!final) {

        alert("Faltan documentos de despacho final");
        return false;

    }

    return true;

}


// =======================
// PREPARAR COMENTARIOS
// =======================
function prepararComentariosDespacho() {

    if (!ot().despacho) {

        ot().despacho = {

            preparacion: [],
            final: []

        };

    }

    if (!ot().despacho.comentariosPreparacion)
        ot().despacho.comentariosPreparacion = [];

    if (!ot().despacho.comentariosFinal)
        ot().despacho.comentariosFinal = [];

}


// =======================
// AGREGAR COMENTARIO
// =======================
async function agregarComentarioDespacho(tipo) {

    if (OTBloqueada()) return;

    prepararComentariosDespacho();

    const inputId = tipo === "preparacion"
        ? "comentarioDespachoPrep"
        : "comentarioDespachoFinal";

    const input = document.getElementById(inputId);

    if (!input || !input.value.trim()) {
        alert("Debes ingresar un comentario");
        return;
    }

    const comentario = {
        nombre: usuario()?.nombre || "Usuario",
        texto: input.value.trim(),
        fecha: new Date().toLocaleString(),
        rol: usuario()?.rol || "usuario_taller",
        atendido: esJefeTaller() ? false : true,
        respuestaUsuario: "",
        atendidoPor: "",
        fechaAtendido: ""
    };

    if (tipo === "preparacion") {
        ot().despacho.comentariosPreparacion.push(comentario);
    } else {
        ot().despacho.comentariosFinal.push(comentario);
    }

    if (esJefeTaller()) {
        ot().alertaJefe = true;
    }

    input.value = "";

    await guardarCambiosOT();

    renderComentariosDespacho(tipo);

}


// =======================
// RENDER COMENTARIOS
// =======================
function renderComentariosDespacho(tipo) {

    prepararComentariosDespacho();

    const contId = tipo === "preparacion"
        ? "comentarios-despacho-preparacion"
        : "comentarios-despacho-final";

    const cont = document.getElementById(contId);

    if (!cont) return;

    const lista = tipo === "preparacion"
        ? ot().despacho.comentariosPreparacion
        : ot().despacho.comentariosFinal;

    cont.innerHTML = "";

    lista.forEach((c, index) => {

        const div = document.createElement("div");

        div.className =
            c.rol === "jefe_taller"
                ? "comentario-card comentario-jefe"
                : "comentario-card";

        div.innerHTML = `

<strong>👨‍🔧 ${c.nombre}</strong>

<p class="comentario-fecha">
${c.fecha}
</p>

<p>${c.texto}</p>

${
c.rol === "jefe_taller" &&
c.atendido !== true &&
esUsuarioTaller()

?

`<button
class="btn-success"
onclick="responderComentarioJefeDespacho('${tipo}',${index})">

✅ Responder observación

</button>`

: ""

}

${
c.rol === "jefe_taller" &&
c.atendido === true

?

`<div class="respuesta-observacion">

<strong>

✅ Respondido por ${c.atendidoPor || "Usuario Taller"}

</strong>

<p>${c.respuestaUsuario || ""}</p>

<small>${c.fechaAtendido || ""}</small>

</div>`

: ""

}

${
puedeEliminarComentario(c)

?

`<button
class="btn-delete-comment"
onclick="eliminarComentarioDespacho('${tipo}',${index})">

🗑

</button>`

: ""

}

`;

        cont.appendChild(div);

    });

}


// =======================
// RESPONDER OBSERVACIÓN
// =======================
async function responderComentarioJefeDespacho(tipo, index) {

    if (OTBloqueada()) return;

    if (!esUsuarioTaller()) {
        alert("Solo Usuario Taller puede responder observaciones");
        return;
    }

    prepararComentariosDespacho();

    const respuesta = prompt("Respuesta a la observación del Jefe:");

    if (!respuesta || !respuesta.trim()) {
        alert("Debes ingresar una respuesta");
        return;
    }

    const lista = tipo === "preparacion"
        ? ot().despacho.comentariosPreparacion
        : ot().despacho.comentariosFinal;

    const comentario = lista[index];

    if (!comentario) {
        alert("No se encontró el comentario");
        return;
    }

    comentario.atendido = true;
    comentario.respuestaUsuario = respuesta.trim();
    comentario.atendidoPor = usuario()?.nombre || "Usuario Taller";
    comentario.fechaAtendido = new Date().toLocaleString();

    actualizarAlertaJefe();

    await guardarCambiosOT();

    renderComentariosDespacho(tipo);

    alert("Observación atendida ✅");

}


// =======================
// ELIMINAR COMENTARIO
// =======================
async function eliminarComentarioDespacho(tipo, index) {

    if (OTBloqueada()) return;

    prepararComentariosDespacho();

    const lista = tipo === "preparacion"
        ? ot().despacho.comentariosPreparacion
        : ot().despacho.comentariosFinal;

    lista.splice(index, 1);

    actualizarAlertaJefe();

    await guardarCambiosOT();

    renderComentariosDespacho(tipo);

}


// =======================
// EXPORTAR A WINDOW
// =======================

window.subirDocsSeccion = subirDocsSeccion;
window.renderDocsSeccion = renderDocsSeccion;
window.abrirDocSeccion = abrirDocSeccion;
window.eliminarDocSeccion = eliminarDocSeccion;

window.abrirDocumento = abrirDocumento;
window.cerrarModal = cerrarModal;

window.guardarDespacho = guardarDespacho;
window.validarDespachoCompleto = validarDespachoCompleto;

window.agregarComentarioDespacho = agregarComentarioDespacho;
window.renderComentariosDespacho = renderComentariosDespacho;
window.responderComentarioJefeDespacho = responderComentarioJefeDespacho;
window.eliminarComentarioDespacho = eliminarComentarioDespacho;

}