import { app } from "./firebase-config.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const funciones = getFunctions(app, "us-central1");
const subir = httpsCallable(funciones, "subirArchivoEmpresa", { timeout: 120000 });
const eliminar = httpsCallable(funciones, "eliminarArchivoEmpresa");

export async function uploadBytes(referencia, archivo, metadata = {}) {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    let binario = "";
    for (let i = 0; i < bytes.length; i += 32768) binario += String.fromCharCode(...bytes.subarray(i, i + 32768));
    await subir({ ruta: referencia.fullPath, base64: btoa(binario), contentType: metadata.contentType || archivo.type });
    return { ref: referencia };
}

export async function deleteObject(referencia) {
    await eliminar({ ruta: referencia.fullPath });
}
