import { auth, db, storage } from "../../firebase-config.js";
import { getOT } from "../contexto.js";
import { evaluarCuotaStorage, mensajeCuotaStorage } from "../../storage-quota.js";
import { medirAsync } from "./rendimiento.js";

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
const CONTEXTO_CACHE_MS = 30000;
let contextoCargaCache = null;

function tipoContenidoArchivo(file) {
    const tipoDeclarado = String(file?.type || "").toLowerCase();
    if (tipoDeclarado === "image/jpg") return "image/jpeg";
    if (tipoDeclarado) return tipoDeclarado;

    const extension = String(file?.name || "").split(".").pop().toLowerCase();
    return {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        gif: "image/gif",
        bmp: "image/bmp",
        avif: "image/avif",
        svg: "image/svg+xml",
        tif: "image/tiff",
        tiff: "image/tiff",
        heic: "image/heic",
        heif: "image/heif",
        pdf: "application/pdf"
    }[extension] || "";
}

function errorStorageReintentable(error) {
    return [
        "storage/retry-limit-exceeded",
        "storage/unknown",
        "storage/server-file-wrong-size"
    ].includes(error?.code) || !navigator.onLine;
}

async function subirConReintentos(archivoRef, file, metadata, maximoIntentos = 3) {
    let ultimoError = null;
    for (let intento = 1; intento <= maximoIntentos; intento++) {
        try {
            return await uploadBytes(archivoRef, file, metadata);
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

async function validarCuotaAntesDeSubir(file, otId, contexto = null) {
    const otActual = getOT();
    let empresaId = otActual?.empresaId || "";
    if (!empresaId) {
        const otSnap = await getDoc(doc(db, "ots", otId));
        empresaId = otSnap.exists() ? otSnap.data()?.empresaId || "" : "";
    }
    if (!empresaId) throw new Error("No fue posible identificar la empresa de la OT.");

    let empresa = contexto?.empresa || null;
    if (!empresa) {
        const empresaSnap = await getDoc(doc(db, "empresas", empresaId));
        if (!empresaSnap.exists()) throw new Error("No se encontró la empresa de la OT.");
        empresa = empresaSnap.data();
    }
    const resultado = evaluarCuotaStorage({
        usadoBytes: Number(empresa.storageUsadoBytes || 0) + bytesSubidosEnSesion,
        maxStorageGB: empresa.maxStorageGB,
        nuevoBytes: file.size
    });
    const mensaje = mensajeCuotaStorage(resultado);
    if (!resultado.permitido) throw new Error(mensaje);
    if (mensaje) alert(mensaje);
}

async function validarContextoCarga(otId, file) {
    const uidAutenticado = auth.currentUser?.uid || "";
    if (!uidAutenticado) throw new Error("La sesión de Firebase no está activa. Cierra sesión e ingresa nuevamente.");

    let usuarioLocal = null;
    try { usuarioLocal = JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch (_) {}
    if (usuarioLocal?.uid && usuarioLocal.uid !== uidAutenticado) {
        throw new Error("La sesión local no corresponde al usuario autenticado. Cierra sesión e ingresa nuevamente.");
    }

    const claveCache = `${uidAutenticado}:${otId}`;
    if (contextoCargaCache?.clave === claveCache && contextoCargaCache.expira > Date.now()) {
        return {
            ...contextoCargaCache.valor,
            tipo: tipoContenidoArchivo(file) || "sin tipo"
        };
    }

    const [perfilSnap, otSnap] = await Promise.all([
        getDoc(doc(db, "usuarios", uidAutenticado)),
        getDoc(doc(db, "ots", otId))
    ]);
    if (!perfilSnap.exists()) throw new Error("No existe el perfil de acceso del usuario autenticado.");
    if (!otSnap.exists()) throw new Error("No se encontró la OT asociada a la evidencia.");

    const perfil = perfilSnap.data();
    const orden = otSnap.data();
    if (perfil.activo !== true) throw new Error("El usuario no está activo para cargar evidencias.");
    if (perfil.empresaId !== orden.empresaId) throw new Error("El usuario y la OT pertenecen a empresas diferentes.");
    if (!["super_admin", "admin_empresa"].includes(perfil.rol) && perfil.sucursalId !== orden.sucursalId) {
        throw new Error("El usuario y la OT pertenecen a sucursales diferentes.");
    }
    if (orden.cerrada === true || String(orden.estado || "").toUpperCase() === "CERRADA") {
        throw new Error("La OT está cerrada y no permite agregar evidencias.");
    }

    const empresaSnap = await getDoc(doc(db, "empresas", orden.empresaId));
    if (!empresaSnap.exists()) throw new Error("No se encontró la empresa asociada a la OT.");
    if (empresaSnap.data().activa === false) throw new Error("La empresa está inactiva y no permite nuevas cargas.");

    const contexto = {
        rol: perfil.rol || "sin rol",
        sucursalUsuario: perfil.sucursalId || "sin sucursal",
        sucursalOt: orden.sucursalId || "sin sucursal",
        tipo: tipoContenidoArchivo(file) || "sin tipo",
        empresa: empresaSnap.data()
    };
    contextoCargaCache = {
        clave: claveCache,
        expira: Date.now() + CONTEXTO_CACHE_MS,
        valor: contexto
    };
    return contexto;
}

/**
 * Mantiene la misma estructura de almacenamiento
 * utilizada originalmente por OverTrack.
 */
async function subirArchivoStorageInterno(file, etapa, itemIndex) {

    const otId = localStorage.getItem("otActiva");

    if (!otId) {
        alert("No hay OT activa");
        return null;
    }

    if (!file) {
        throw new Error("No se recibió ningún archivo");
    }

    const contentType = tipoContenidoArchivo(file);
    if (!contentType) {
        throw new Error("No fue posible identificar el tipo del archivo seleccionado.");
    }

    const contextoCarga = await validarContextoCarga(otId, file);
    await validarCuotaAntesDeSubir(file, otId, contextoCarga);

    const nombreArchivo = `${Date.now()}_${file.name}`;

    const ruta =
        `ots/${otId}/${etapa}/item_${itemIndex}/${nombreArchivo}`;

    const archivoRef = ref(storage, ruta);

    try {
        await subirConReintentos(archivoRef, file, { contentType });
    } catch (error) {
        if (error?.code === "storage/unauthorized") {
            console.error("Contexto rechazado por Firebase Storage:", contextoCarga);
            throw new Error(`Firebase rechazó la carga aunque los datos locales coinciden. Rol: ${contextoCarga.rol}; sucursal usuario: ${contextoCarga.sucursalUsuario}; sucursal OT: ${contextoCarga.sucursalOt}; archivo: ${contextoCarga.tipo}.`);
        }
        throw error;
    }

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

export async function subirArchivoStorage(file, etapa, itemIndex) {
    if (window.OverTrackUI?.ejecutarConCarga) {
        return window.OverTrackUI.ejecutarConCarga(
            () => medirAsync("Carga de archivo", () => subirArchivoStorageInterno(file, etapa, itemIndex)),
            "Cargando archivo…"
        );
    }
    return medirAsync("Carga de archivo", () => subirArchivoStorageInterno(file, etapa, itemIndex));
}

async function eliminarArchivoStorageInterno(urlArchivo) {

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

export async function eliminarArchivoStorage(urlArchivo) {
    if (window.OverTrackUI?.ejecutarConCarga) {
        return window.OverTrackUI.ejecutarConCarga(
            () => medirAsync("Eliminación de archivo", () => eliminarArchivoStorageInterno(urlArchivo)),
            "Eliminando archivo…"
        );
    }
    return medirAsync("Eliminación de archivo", () => eliminarArchivoStorageInterno(urlArchivo));
}
