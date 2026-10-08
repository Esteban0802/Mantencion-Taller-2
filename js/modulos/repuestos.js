/**
 * Inicializa las dependencias del módulo de repuestos.
 */
export function inicializarModuloRepuestos(servicios = {}) {

    const {
        getOT,
        getUsuario,
        guardarCambiosOT,
        OTBloqueada,
        esJefeTaller,
        repuestosHabilitados
    } = servicios;

    const alert = (mensaje) => {
        const texto = String(mensaje || "");
        const tipo = /correctamente|guardad[ao]|cargad[ao]/i.test(texto)
            ? "exito"
            : /error|no fue posible|no hay una os|no hay repuestos/i.test(texto)
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

    validarDependencias({
        getOT,
        getUsuario,
        guardarCambiosOT,
        OTBloqueada,
        esJefeTaller,
        repuestosHabilitados
    });


/* =========================================================
   UTILIDADES INTERNAS
========================================================= */

function obtenerOT() {
    return getOT?.() || null;
}

function obtenerUsuario() {
    return getUsuario?.() || null;
}

function validarModuloRepuestos() {
    if (repuestosHabilitados?.() === true) {
        return true;
    }

    alert(
        "El módulo Repuestos no está habilitado para esta empresa."
    );

    return false;
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

function cargarRepuestosExcel() {

    if (!validarModuloRepuestos()) return;

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

    if (!/\.xlsx?$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
        alert("Selecciona un archivo Excel válido de máximo 5 MB");
        input.value = "";
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
                .slice(0, 400)
                .map(fila => ({
                    codigo: String(fila[0] ?? "").trim().slice(0, 120),
                    descripcion: String(fila[1] ?? "").trim().slice(0, 240),
                    cantidad: String(fila[2] ?? "").trim().slice(0, 40),
                    usado: false,
                    comentario: "",
                    tecnico: "",
                    fecha: ""
                }))
                .filter(repuesto => repuesto.codigo || repuesto.descripcion);

            if (!repuestos.length) {
                alert(
                    "El archivo no contiene repuestos válidos"
                );
                return;
            }

            const codigos = repuestos.map(item => item.codigo.toLowerCase()).filter(Boolean);
            if (new Set(codigos).size !== codigos.length) {
                throw new Error("El archivo contiene códigos de repuesto duplicados");
            }

            const cantidadInvalida = repuestos.find(item =>
                item.cantidad !== "" &&
                (!Number.isFinite(Number(item.cantidad.replace(",", "."))) || Number(item.cantidad.replace(",", ".")) < 0)
            );
            if (cantidadInvalida) {
                throw new Error(`Cantidad inválida para el repuesto ${cantidadInvalida.codigo || cantidadInvalida.descripcion}`);
            }

            const ot = obtenerOT();
            const usuario = obtenerUsuario();

            if (!ot) {
                alert("No hay una OS cargada");
                return;
            }

            const repuestosAnteriores = ot.repuestos;
            ot.repuestos = {
                items: repuestos,
                cargadoPor:
                    usuario?.nombre ||
                    "Jefe Taller",
                fechaCarga:
                    new Date().toLocaleString()
            };

            const guardado = await guardarCambiosOT();
            if (!guardado) {
                ot.repuestos = repuestosAnteriores;
                return;
            }

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

function abrirModalRepuestos() {

    if (!validarModuloRepuestos()) return;

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

function cerrarModalRepuestos() {

    const modal =
        document.getElementById("modalRepuestos");

    if (modal) {
        modal.style.display = "none";
    }
}


/* =========================================================
   RENDERIZADO
========================================================= */

function renderRepuestosModal() {

    if (repuestosHabilitados?.() !== true) return;

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

async function guardarRepuestosUsados() {

    if (!validarModuloRepuestos()) return;

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
    const itemsAnteriores = items.map(item => ({ ...item }));

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
                "Técnico";

            if (!estabaUsado || !repuesto.fecha) {
                repuesto.fecha =
                    new Date().toLocaleString();
            }

        } else {

            repuesto.tecnico = "";
            repuesto.fecha = "";
        }
    });

    const guardado = await guardarCambiosOT();
    if (!guardado) {
        ot.repuestos.items = itemsAnteriores;
        renderRepuestosModal();
        return;
    }

    alert(
        "Repuestos guardados correctamente ✅"
    );

    cerrarModalRepuestos();
}


/* =========================================================
   FUNCIONES EXPUESTAS AL HTML
========================================================= */

window.cargarRepuestosExcel =
    cargarRepuestosExcel;

window.abrirModalRepuestos =
    abrirModalRepuestos;

window.cerrarModalRepuestos =
    cerrarModalRepuestos;

window.renderRepuestosModal =
    renderRepuestosModal;

window.guardarRepuestosUsados =
    guardarRepuestosUsados;

console.log(
    "📦 Módulo Repuestos inicializado correctamente"
);

}


function validarDependencias(dependencias) {

    Object.entries(dependencias).forEach(
        ([nombre, valor]) => {

            if (typeof valor !== "function") {
                throw new Error(
                    `Repuestos: falta la dependencia ${nombre}.`
                );
            }
        }
    );
}
