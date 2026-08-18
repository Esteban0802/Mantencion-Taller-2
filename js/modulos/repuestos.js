let getOT = null;
let getUsuario = null;

let guardarCambiosOT = null;
let OTBloqueada = null;
let esJefeTaller = null;


/**
 * Inicializa las dependencias del módulo de repuestos.
 */
export function inicializarModuloRepuestos(dependencias = {}) {

    getOT = dependencias.getOT;
    getUsuario = dependencias.getUsuario;

    guardarCambiosOT =
        dependencias.guardarCambiosOT;

    OTBloqueada =
        dependencias.OTBloqueada;

    esJefeTaller =
        dependencias.esJefeTaller;

    if (typeof getOT !== "function") {
        throw new Error(
            "repuestos.js requiere una función getOT"
        );
    }

    if (typeof getUsuario !== "function") {
        throw new Error(
            "repuestos.js requiere una función getUsuario"
        );
    }

    if (typeof guardarCambiosOT !== "function") {
        throw new Error(
            "repuestos.js requiere guardarCambiosOT"
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


/* =========================================================
   CARGAR EXCEL
========================================================= */

export function cargarRepuestosExcel() {

    if (!esJefeTaller?.()) {
        alert(
            "Solo Jefe de Taller puede cargar repuestos"
        );
        return;
    }

    const input =
        document.getElementById("excelRepuestos");

    const file = input?.files?.[0];

    if (!file) {
        alert(
            "Debes subir un archivo Excel de repuestos"
        );
        return;
    }

    const reader = new FileReader();

    reader.onload = async event => {

        try {

            const data =
                new Uint8Array(event.target.result);

            const workbook =
                XLSX.read(data, {
                    type: "array"
                });

            const primeraHoja =
                workbook.SheetNames[0];

            const sheet =
                workbook.Sheets[primeraHoja];

            const filas =
                XLSX.utils.sheet_to_json(
                    sheet,
                    {
                        header: 1
                    }
                );

            const repuestos = filas
                .slice(1)
                .filter(fila =>
                    Array.isArray(fila) &&
                    fila.some(valor =>
                        String(valor ?? "").trim() !== ""
                    )
                )
                .map(fila => ({
                    codigo: fila[0] || "",
                    descripcion: fila[1] || "",
                    cantidad: fila[2] || "",
                    usado: false,
                    comentario: "",
                    tecnico: "",
                    fecha: ""
                }));

            if (!repuestos.length) {
                alert(
                    "El archivo no contiene repuestos válidos"
                );
                return;
            }

            const ot = obtenerOT();
            const usuario = obtenerUsuario();

            if (!ot) {
                alert("No hay una OS cargada");
                return;
            }

            ot.repuestos = {
                items: repuestos,
                cargadoPor:
                    usuario?.nombre ||
                    "Jefe Taller",
                fechaCarga:
                    new Date().toLocaleString()
            };

            await guardarCambiosOT();

            if (input) {
                input.value = "";
            }

            alert(
                "Listado de repuestos cargado correctamente ✅"
            );

        } catch (error) {

            console.error(
                "Error cargando Excel de repuestos:",
                error
            );

            alert(
                "No fue posible procesar el archivo de repuestos"
            );
        }
    };

    reader.onerror = error => {

        console.error(
            "Error leyendo Excel de repuestos:",
            error
        );

        alert(
            "No fue posible leer el archivo seleccionado"
        );
    };

    reader.readAsArrayBuffer(file);
}


/* =========================================================
   MODAL
========================================================= */

export function abrirModalRepuestos() {

    const ot = obtenerOT();

    const items =
        ot?.repuestos?.items;

    if (
        !Array.isArray(items) ||
        items.length === 0
    ) {
        alert(
            "No hay listado de repuestos cargado"
        );
        return;
    }

    renderRepuestosModal();

    const modal =
        document.getElementById("modalRepuestos");

    if (modal) {
        modal.style.display = "block";
    }
}

export function cerrarModalRepuestos() {

    const modal =
        document.getElementById("modalRepuestos");

    if (modal) {
        modal.style.display = "none";
    }
}


/* =========================================================
   RENDERIZADO
========================================================= */

export function renderRepuestosModal() {

    const ot = obtenerOT();

    const contenedor =
        document.getElementById(
            "listaRepuestosModal"
        );

    if (!contenedor) return;

    const items =
        ot?.repuestos?.items;

    contenedor.innerHTML = "";

    if (
        !Array.isArray(items) ||
        items.length === 0
    ) {
        contenedor.innerHTML = `
            <p class="mensaje-vacio">
                No hay repuestos cargados.
            </p>
        `;

        return;
    }

    const tabla =
        document.createElement("div");

    tabla.className = "tabla-repuestos";

    tabla.innerHTML = `
        <div class="tabla-repuestos-header">
            <div>Usado</div>
            <div>Código</div>
            <div>Descripción</div>
            <div>Cantidad</div>
            <div>Comentario</div>
        </div>
    `;

    items.forEach((repuesto, index) => {

        const fila =
            document.createElement("div");

        fila.className =
            "tabla-repuestos-row";

        const bloqueada =
            OTBloqueada?.() === true;

        fila.innerHTML = `
            <div>
                <input
                    type="checkbox"
                    id="rep-check-${index}"
                    ${repuesto.usado ? "checked" : ""}
                    ${bloqueada ? "disabled" : ""}
                >
            </div>

            <div>
                ${escaparHTML(
                    repuesto.codigo || "-"
                )}
            </div>

            <div>
                ${escaparHTML(
                    repuesto.descripcion || "-"
                )}
            </div>

            <div>
                ${escaparHTML(
                    repuesto.cantidad || "-"
                )}
            </div>

            <div>
                <input
                    type="text"
                    id="rep-com-${index}"
                    placeholder="Comentario"
                    value="${escaparHTML(
                        repuesto.comentario || ""
                    )}"
                    ${bloqueada ? "disabled" : ""}
                >
            </div>
        `;

        tabla.appendChild(fila);
    });

    contenedor.appendChild(tabla);
}


/* =========================================================
   GUARDAR USO DE REPUESTOS
========================================================= */

export async function guardarRepuestosUsados() {

    if (OTBloqueada?.()) {
        alert(
            "La OS está cerrada. No se pueden editar repuestos."
        );
        return;
    }

    const ot = obtenerOT();

    const items =
        ot?.repuestos?.items;

    if (!Array.isArray(items)) {
        alert("No hay repuestos cargados");
        return;
    }

    const usuario = obtenerUsuario();

    items.forEach((repuesto, index) => {

        const checkbox =
            document.getElementById(
                `rep-check-${index}`
            );

        const inputComentario =
            document.getElementById(
                `rep-com-${index}`
            );

        if (!checkbox) return;

        const estabaUsado =
            repuesto.usado === true;

        repuesto.usado =
            checkbox.checked;

        repuesto.comentario =
            inputComentario?.value?.trim() || "";

        if (repuesto.usado) {

            repuesto.tecnico =
                usuario?.nombre ||
                "Usuario Taller";

            if (!estabaUsado || !repuesto.fecha) {
                repuesto.fecha =
                    new Date().toLocaleString();
            }

        } else {

            repuesto.tecnico = "";
            repuesto.fecha = "";
        }
    });

    await guardarCambiosOT();

    alert(
        "Repuestos guardados correctamente ✅"
    );

    cerrarModalRepuestos();
}