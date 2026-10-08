import { db } from "../../firebase-config.js";
import { guardarResumenOT } from "./resumenOT.js";
import { iniciarMedicion } from "./rendimiento.js";

import {
    doc,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let getOT = null;
let renderHeaderOT = null;
let getEtapasHabilitadas = null;
let timerAutoguardado = null;
let cambiosPendientes = false;
let guardadoEnCurso = false;
let listenersRecuperacionRegistrados = false;

function valoresIguales(valorA, valorB) {
    if (Object.is(valorA, valorB)) return true;
    try {
        return JSON.stringify(valorA) === JSON.stringify(valorB);
    } catch (_) {
        return false;
    }
}

function actualizarEstadoConexion() {
    const elemento = document.getElementById("estadoConexion");
    if (!elemento) return;
    const enLinea = navigator.onLine;
    elemento.textContent = enLinea ? "En línea" : "Sin conexión";
    elemento.className = `estado-conexion ${enLinea ? "en-linea" : "sin-conexion"}`;
}

const alert = (mensaje) => {
    const texto = String(mensaje || "");

    if (window.OverTrackUI?.mostrarMensaje) {
        return window.OverTrackUI.mostrarMensaje({
            titulo: "No fue posible guardar",
            mensaje: texto,
            tipo: "error"
        });
    }

    window.alert(texto);
    return Promise.resolve(true);
};

export function inicializarOTService({
    getOT: obtenerOT,
    renderHeaderOTPro = null,
    getEtapasHabilitadas: obtenerEtapasHabilitadas = null
}) {

    if (typeof obtenerOT !== "function") {
        throw new Error(
            "otService requiere una función getOT"
        );
    }

    getOT = obtenerOT;
    renderHeaderOT = renderHeaderOTPro;
    getEtapasHabilitadas = obtenerEtapasHabilitadas;

    if (!listenersRecuperacionRegistrados) {
        window.addEventListener("beforeunload", evento => {
            if (!cambiosPendientes && !guardadoEnCurso) return;
            evento.preventDefault();
            evento.returnValue = "";
        });

        window.addEventListener("online", () => {
            actualizarEstadoConexion();
            if (cambiosPendientes && !guardadoEnCurso) {
                guardarCambiosOT(true);
            }
        });
        window.addEventListener("offline", actualizarEstadoConexion);
        document.addEventListener("DOMContentLoaded", actualizarEstadoConexion, { once: true });
        actualizarEstadoConexion();

        listenersRecuperacionRegistrados = true;
    }
}

export function obtenerEstadoOT(ot) {

    if (!ot) return "INGRESO";

    if (
        ot.estado === "CERRADA" ||
        ot.cerrada === true
    ) {
        return "CERRADA";
    }

    const etapas = typeof getEtapasHabilitadas === "function"
        ? getEtapasHabilitadas()
        : { ingreso: true, evaluacion: true, mantencion: true, pruebas: true, despacho: true };

    if (etapas.ingreso !== false && !ot.ingresoAprobado) {
        return "INGRESO";
    }

    if (etapas.evaluacion !== false && !ot.evaluacionAprobada) {
        return "EVALUACION";
    }

    if (etapas.evaluacion !== false && ot.overhaulRequerido === false) {
        // Si Despacho está deshabilitado, la OT permanece en Evaluación
        // hasta que el Jefe de Taller utilice el cierre explícito.
        return etapas.despacho !== false ? "DESPACHO" : "EVALUACION";
    }

    if (etapas.mantencion !== false && !ot.overhaulAprobado) {
        return "OVERHAUL";
    }

    if (etapas.pruebas !== false && !ot.pruebasAprobado) {
        return "PRUEBAS";
    }

    if (etapas.despacho !== false) {
        return "DESPACHO";
    }

    // Mantiene la OT en la última etapa operativa habilitada hasta que
    // se implemente y confirme su cierre definitivo.
    if (etapas.pruebas !== false) return "PRUEBAS";
    if (etapas.mantencion !== false) return "OVERHAUL";
    if (etapas.evaluacion !== false) return "EVALUACION";
    return etapas.ingreso !== false ? "INGRESO" : "SIN_ETAPAS";
}

export function mostrarEstadoAutoguardado(
    texto,
    tipo = "ok"
) {

    const elemento =
        document.getElementById("estadoAutoguardado");

    if (!elemento) return;

    elemento.textContent = texto;
    elemento.className =
        `estado-autoguardado ${tipo}`;

    clearTimeout(window.hideAutoSave);

    if (tipo !== "error") {
        window.hideAutoSave = setTimeout(() => {
            elemento.style.opacity = "0";
        }, 2500);
    }

    elemento.style.opacity = "1";
}

export async function guardarCambiosOT(
    silencioso = false
) {

    const ot = getOT?.();

    if (!ot) return false;

    const id = localStorage.getItem("otActiva");

    if (!id) {

        if (!silencioso) {
            alert("No hay OT activa");
        }

        return false;
    }

    const cargaUI = window.OverTrackUI?.iniciarCarga?.("Guardando cambios de la OT…");
    const finalizarMedicion = iniciarMedicion("Guardado parcial de OT");

    try {

        guardadoEnCurso = true;

        ot.estado = obtenerEstadoOT(ot);

        const datosActualizar =
            JSON.parse(JSON.stringify(ot));

        delete datosActualizar.id;

        const revisionLocal = Math.max(0, Number(ot.revision || 0));
        const nuevaRevision = revisionLocal + 1;

        await runTransaction(db, async transaction => {
            const referencia = doc(db, "ots", id);
            const snapshot = await transaction.get(referencia);
            if (!snapshot.exists()) throw new Error("OT_NO_EXISTE");

            const revisionRemota = Math.max(0, Number(snapshot.data()?.revision || 0));
            if (revisionRemota !== revisionLocal) throw new Error("OT_MODIFICADA_POR_OTRO_USUARIO");

            const datosRemotos = snapshot.data() || {};
            const cambiosParciales = {};
            Object.entries(datosActualizar).forEach(([campo, valor]) => {
                if (campo === "revision" || campo === "fechaActualizacion") return;
                if (!valoresIguales(valor, datosRemotos[campo])) cambiosParciales[campo] = valor;
            });

            transaction.update(referencia, {
                ...cambiosParciales,
                fechaActualizacion: serverTimestamp(),
                revision: nuevaRevision
            });
        });

        ot.revision = nuevaRevision;
        await guardarResumenOT(id, ot).catch(error => {
            console.warn("La OT fue guardada, pero su resumen se sincronizará más adelante.", error);
        });

        console.log(
            "OT actualizada en Firebase ✅"
        );

        if (typeof renderHeaderOT === "function") {
            renderHeaderOT();
        }

        mostrarEstadoAutoguardado(
            "Cambios guardados",
            "ok"
        );

        cambiosPendientes = false;
        guardadoEnCurso = false;

        return true;

    } catch (error) {

        console.error(
            "Error guardando OT:",
            error
        );

        const conflicto = error?.message === "OT_MODIFICADA_POR_OTRO_USUARIO";

        if (!silencioso) {
            alert(conflicto
                ? "La OT fue modificada desde otro dispositivo. Recarga la página antes de continuar para no sobrescribir esos cambios."
                : "Error al guardar cambios en Firebase");
        }

        mostrarEstadoAutoguardado(
            conflicto
                ? "Hay cambios más recientes. Recarga la OT"
                : navigator.onLine
                ? "No se pudo guardar. Intenta nuevamente"
                : "Sin conexión. Los cambios siguen pendientes",
            "error"
        );

        cambiosPendientes = true;
        guardadoEnCurso = false;

        return false;
    } finally {
        finalizarMedicion();
        window.OverTrackUI?.finalizarCarga?.(cargaUI);
    }
}

export function autoguardarCambiosOT(
    delay = 700
) {

    const ot = getOT?.();

    if (!ot) return;

    clearTimeout(timerAutoguardado);

    cambiosPendientes = true;

    mostrarEstadoAutoguardado(
        "Guardando cambios...",
        "guardando"
    );

    timerAutoguardado = setTimeout(
        async () => {
            await guardarCambiosOT(true);
        },
        delay
    );
}
