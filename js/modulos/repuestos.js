/**
 * Inicializa las dependencias del módulo de repuestos.
 */
export function inicializarModuloRepuestos(servicios = {}) {

    const {
        getOT,
        getUsuario,
        guardarCambiosOT,
        OTBloqueada,
        repuestosHabilitados,
        sincronizarRepuestosInventario
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
        repuestosHabilitados,
        sincronizarRepuestosInventario
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
   MODAL
========================================================= */

async function abrirModalRepuestos() {

    if (!validarModuloRepuestos()) return;

    try {
        await sincronizarRepuestosInventario?.();
    } catch (error) {
        console.warn("No fue posible actualizar la recepción de repuestos desde Inventario:", error);
    }

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

    const totalDisponibles = items.filter(item => !item.inventarioItemId || item.recibidoInventario === true).length;
    const totalPendientes = items.length - totalDisponibles;

    tabla.innerHTML = `
        <div class="repuestos-modal-summary">
            <div><span>Total</span><strong>${items.length}</strong></div>
            <div class="available"><span>Disponibles</span><strong>${totalDisponibles}</strong></div>
            <div class="pending"><span>Pendientes de recepción</span><strong>${totalPendientes}</strong></div>
        </div>
        <div class="tabla-repuestos-header">
            <div>Usado</div>
            <div>Código</div>
            <div>Descripción</div>
            <div>Cantidad</div>
            <div>Estado</div>
            <div>Comentario</div>
        </div>
    `;

    items.forEach((repuesto, index) => {

        const fila =
            document.createElement("div");

        fila.className =
            "tabla-repuestos-row";

        const pendienteRecepcion = Boolean(repuesto.inventarioItemId) && repuesto.recibidoInventario !== true;
        const bloqueada = OTBloqueada?.() === true || pendienteRecepcion;
        if (pendienteRecepcion) fila.classList.add("repuesto-pendiente-recepcion");

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
                <span class="repuesto-estado ${pendienteRecepcion ? "pendiente" : "disponible"}">
                    ${pendienteRecepcion ? "Pendiente de recepción" : "Disponible"}
                </span>
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

        const pendienteRecepcion = Boolean(repuesto.inventarioItemId) && repuesto.recibidoInventario !== true;
        if (pendienteRecepcion) {
            repuesto.usado = false;
            repuesto.tecnico = "";
            repuesto.fecha = "";
            return;
        }

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
