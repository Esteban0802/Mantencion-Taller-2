import { storage } from "../../firebase-config.js";

import {
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

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

    const nombreArchivo = `${Date.now()}_${file.name}`;

    const ruta =
        `ots/${otId}/${etapa}/item_${itemIndex}/${nombreArchivo}`;

    const archivoRef = ref(storage, ruta);

    await uploadBytes(archivoRef, file);

    return await getDownloadURL(archivoRef);
}

export async function eliminarArchivoStorage(urlArchivo) {

    if (!urlArchivo) return;

    try {

        const archivoRef = ref(storage, urlArchivo);

        await deleteObject(archivoRef);

        console.log("Archivo eliminado de Firebase Storage ✅");

    } catch (error) {

        console.warn(
            "No se pudo eliminar archivo de Storage:",
            error
        );

    }
}