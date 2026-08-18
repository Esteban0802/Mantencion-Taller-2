import { db } from "../../firebase-config.js";

import {
    doc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let getOT = null;
let renderHeaderOT = null;
let timerAutoguardado = null;

export function inicializarOTService({
    getOT: obtenerOT,
    renderHeaderOTPro = null
}) {

    if (typeof obtenerOT !== "function") {
        throw new Error(
            "otService requiere una función getOT"
        );
    }

    getOT = obtenerOT;
    renderHeaderOT = renderHeaderOTPro;
}

export function obtenerEstadoOT(ot) {

    if (!ot) return "INGRESO";

    if (
        ot.estado === "CERRADA" ||
        ot.cerrada === true
    ) {
        return "CERRADA";
    }

    if (!ot.ingresoAprobado) {
        return "INGRESO";
    }

    if (!ot.evaluacionAprobada) {
        return "EVALUACION";
    }

    if (ot.overhaulRequerido === false) {
        return "DESPACHO";
    }

    if (
        ot.overhaulRequerido === true &&
        !ot.overhaulAprobado
    ) {
        return "OVERHAUL";
    }

    if (!ot.pruebasAprobado) {
        return "PRUEBAS";
    }

    return "DESPACHO";
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

    window.hideAutoSave = setTimeout(() => {
        elemento.style.opacity = "0";
    }, 2500);

    elemento.style.opacity = "1";
}

export async function guardarCambiosOT(
    silencioso = false
) {

    const ot = getOT?.();

    if (!ot) return;

    const id = localStorage.getItem("otActiva");

    if (!id) {

        if (!silencioso) {
            alert("No hay OT activa");
        }

        return;
    }

    try {

        ot.estado = obtenerEstadoOT(ot);

        const datosActualizar =
            JSON.parse(JSON.stringify(ot));

        delete datosActualizar.id;

        datosActualizar.fechaActualizacion =
            serverTimestamp();


        await updateDoc(
            doc(db, "ots", id),
            datosActualizar
        );

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

    } catch (error) {

        console.error(
            "Error guardando OT:",
            error
        );

        if (!silencioso) {
            alert(
                "Error al guardar cambios en Firebase"
            );
        }

        mostrarEstadoAutoguardado(
            "Error al guardar",
            "error"
        );
    }
}

export function autoguardarCambiosOT(
    delay = 700
) {

    const ot = getOT?.();

    if (!ot) return;

    clearTimeout(timerAutoguardado);

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