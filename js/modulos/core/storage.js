import { db, storage } from "../../firebase-config.js";
import { getOT } from "../contexto.js";
import { evaluarCuotaStorage, mensajeCuotaStorage } from "../../storage-quota.js";

import {
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let bytesSubidosEnSesion = 0;
const bytesPorUrlSesion = new Map();

function errorStorageReintentable(error) {
    return [
        "storage/retry-limit-exceeded",
        "storage/unknown",
        "storage/server-file-wrong-size"
    ].includes(error?.code) || !navigator.onLine;
}

async function subirConReintentos(archivoRef, file, maximoIntentos = 3) {
    let ultimoError = null;
    for (let intento = 1; intento <= maximoIntentos; intento++) {
        try {
            return await uploadBytes(archivoRef, file);
        } catch (error) {
            ultimoError = error;
            if (intento === maximoIntentos || !errorStorageReintentable(error)) throw error;
            await new Promise(resolve => setTimeout(resolve, 500 * (2 ** (intento - 1))));
        }
    }
    throw ultimoError;
}

const alert = (mensaje) => {
    const texto = String(mensaje || "");
    const tipo = /no hay ot|no fue posible|superó|límite/i.test(texto)
        ? "error"
        : "advertencia";
    const titulo = tipo === "error"
        ? "Archivo no disponible"
        : "Uso de almacenamiento";

    if (window.OverTrackUI?.mostrarMensaje) {
        return window.OverTrackUI.mostrarMensaje({ titulo, mensaje: texto, tipo });
    }

    window.alert(texto);
    return Promise.resolve(true);
};

async function validarCuotaAntesDeSubir(file, otId) {
    const otActual = getOT();
    let empresaId = otActual?.empresaId || "";
    if (!empresaId) {
        const otSnap = await getDoc(doc(db, "ots", otId));
        empresaId = otSnap.exists() ? otSnap.data()?.empresaId || "" : "";
    }
    if (!empresaId) throw new Error("No fue posible identificar la empresa de la OT.");

    const empresaSnap = await getDoc(doc(db, "empresas", empresaId));
    if (!empresaSnap.exists()) throw new Error("No se encontró la empresa de la OT.");
    const empresa = empresaSnap.data();
    const resultado = evaluarCuotaStorage({
        usadoBytes: Number(empresa.storageUsadoBytes || 0) + bytesSubidosEnSesion,
        maxStorageGB: empresa.maxStorageGB,
        nuevoBytes: file.size
    });
    const mensaje = mensajeCuotaStorage(resultado);
    if (!resultado.permitido) throw new Error(mensaje);
    if (mensaje) alert(mensaje);
}

/**
 * Mantiene la misma estructura de almacenamiento
 * utilizada originalmente por OverTrack.
 */
export async function subirArchivoStorage(file, etapa, itemIndex) {

    const otId = localStorage.getItem("otActiva");

    if (!otId) {
        alert("No hay OT activa");
        return null;
    }

    if (!file) {
        throw new Error("No se recibió ningún archivo");
    }

    await validarCuotaAntesDeSubir(file, otId);

    const nombreArchivo = `${Date.now()}_${file.name}`;

    const ruta =
        `ots/${otId}/${etapa}/item_${itemIndex}/${nombreArchivo}`;

    const archivoRef = ref(storage, ruta);

    await subirConReintentos(archivoRef, file);

    try {
        const urlArchivo = await getDownloadURL(archivoRef);
        const bytesArchivo = Math.max(0, Number(file.size || 0));
        bytesSubidosEnSesion += bytesArchivo;
        bytesPorUrlSesion.set(urlArchivo, bytesArchivo);
        return urlArchivo;
    } catch (error) {
        await deleteObject(archivoRef).catch(() => {});
        throw error;
    }
}

export async function eliminarArchivoStorage(urlArchivo) {

    if (!urlArchivo) return false;

    const archivoRef = ref(storage, urlArchivo);

    for (let intento = 1; intento <= 3; intento++) {
        try {
            await deleteObject(archivoRef);

            const bytesArchivo = bytesPorUrlSesion.get(urlArchivo) || 0;
            bytesSubidosEnSesion = Math.max(0, bytesSubidosEnSesion - bytesArchivo);
            bytesPorUrlSesion.delete(urlArchivo);

            console.log("Archivo eliminado de Firebase Storage ✅");
            return true;
        } catch (error) {
            if (error?.code === "storage/object-not-found") {
                const bytesArchivo = bytesPorUrlSesion.get(urlArchivo) || 0;
                bytesSubidosEnSesion = Math.max(0, bytesSubidosEnSesion - bytesArchivo);
                bytesPorUrlSesion.delete(urlArchivo);
                return true;
            }

            if (intento === 3) {
                console.warn("No se pudo eliminar archivo de Storage:", error);
                return false;
            }

            await new Promise(resolve => setTimeout(resolve, intento * 250));
        }
    }

    return false;
}
