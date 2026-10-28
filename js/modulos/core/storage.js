import { app, auth, db } from "../../firebase-config.js";
import { getOT } from "../contexto.js";
import { evaluarCuotaStorage, mensajeCuotaStorage } from "../../storage-quota.js";
import { medirAsync } from "./rendimiento.js";
import { validarFirmaArchivo } from "../../file-validation.js";
import { puedeEliminarArchivoStorage } from "./autoriaEvidencias.js";

import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const funcionesArchivos = getFunctions(app, "us-central1");
const subirArchivoSeguro = httpsCallable(funcionesArchivos, "subirArchivoOT", { timeout: 120000 });
const eliminarArchivoSeguro = httpsCallable(funcionesArchivos, "eliminarArchivoOT", { timeout: 120000 });

const CONTEXTO_CACHE_MS = 5 * 60 * 1000;
let contextoCargaCache = null;
let contextoCargaPendiente = null;

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
        avif: "image/avif",
        heic: "image/heic",
        heif: "image/heif",
        pdf: "application/pdf"
    }[extension] || "";
}

const TIPOS_EVIDENCIA_OT = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/avif",
    "application/pdf"
]);

function errorCargaReintentable(error) {
    return [
        "functions/unavailable",
        "functions/deadline-exceeded",
        "functions/internal"
    ].includes(error?.code) || !navigator.onLine;
}

async function subirConReintentos(datos, maximoIntentos = 3) {
    let ultimoError = null;
    for (let intento = 1; intento <= maximoIntentos; intento++) {
        try {
            return (await subirArchivoSeguro(datos)).data;
        } catch (error) {
            ultimoError = error;
            if (intento === maximoIntentos || !errorCargaReintentable(error)) throw error;
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

    const empresaSnap = await getDoc(doc(db, "empresas", empresaId));
    if (!empresaSnap.exists()) throw new Error("No se encontró la empresa de la OT.");
    const empresa = empresaSnap.data();
    const resultado = evaluarCuotaStorage({
        usadoBytes: Number(empresa.storageUsadoBytes || 0) + Number(empresa.storageReservadoBytes || 0),
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

    if (contextoCargaPendiente?.clave === claveCache) {
        const contexto = await contextoCargaPendiente.promesa;
        return { ...contexto, tipo: tipoContenidoArchivo(file) || "sin tipo" };
    }

    const promesaContexto = (async () => {
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
        if (empresaSnap.data().activa === false ||
            ["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"].includes(empresaSnap.data().suscripcion?.estado)) {
            throw new Error("La empresa está inactiva o en cancelación. Solo permite consultar y descargar archivos.");
        }

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
    })();
    contextoCargaPendiente = { clave: claveCache, promesa: promesaContexto };
    try {
        return await promesaContexto;
    } finally {
        if (contextoCargaPendiente?.promesa === promesaContexto) contextoCargaPendiente = null;
    }
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
    if (!TIPOS_EVIDENCIA_OT.has(contentType)) {
        throw new Error("Formato no permitido. Adjunta una foto JPG, PNG, WebP, HEIC, HEIF o AVIF, o un archivo PDF.");
    }
    if (file.size > 20 * 1024 * 1024) {
        throw new Error("El archivo supera el máximo permitido de 20 MB.");
    }
    await validarFirmaArchivo(file, contentType);

    const contextoCarga = await validarContextoCarga(otId, file);
    await validarCuotaAntesDeSubir(file, otId, contextoCarga);

    const bytes = new Uint8Array(await file.arrayBuffer());
    let binario = "";
    for (let indice = 0; indice < bytes.length; indice += 32768) {
        binario += String.fromCharCode(...bytes.subarray(indice, indice + 32768));
    }
    const respuesta = await subirConReintentos({
        otId, etapa, itemIndex, nombre: file.name, contentType,
        subidaId: crypto.randomUUID(), base64: btoa(binario)
    });
    const urlArchivo = respuesta.url;
    if (!urlArchivo) throw new Error("El servidor no devolvió el enlace del archivo.");
    return urlArchivo;
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

    if (!(await puedeEliminarArchivoStorage(urlArchivo))) {
        await alert("Solo puedes eliminar tus propias evidencias. Los archivos sin autor identificado están protegidos.");
        return false;
    }

    const otId = localStorage.getItem("otActiva");
    if (!otId) return false;

    for (let intento = 1; intento <= 3; intento++) {
        try {
            await eliminarArchivoSeguro({ otId, url: urlArchivo });

            console.log("Archivo eliminado de Firebase Storage ✅");
            return true;
        } catch (error) {
            if (error?.code === "storage/object-not-found") {
                return true;
            }

            if (intento === 3 || ["functions/permission-denied", "functions/failed-precondition", "functions/invalid-argument"].includes(error?.code)) {
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
