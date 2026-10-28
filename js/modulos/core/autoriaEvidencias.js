import { auth, storage } from "../../firebase-config.js";
import { getMetadata, ref } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

const autores = new Map();

export async function puedeEliminarArchivoStorage(url) {
    const uid = auth.currentUser?.uid;
    if (!uid || !url) return false;
    try {
        const archivo = ref(storage, url);
        const clave = `${uid}:${archivo.bucket}:${archivo.fullPath}`;
        if (!autores.has(clave)) {
            const metadata = await getMetadata(archivo);
            autores.set(clave, metadata.customMetadata?.creadoPorUid || "");
        }
        return auth.currentUser?.uid === uid && autores.get(clave) === uid;
    } catch (_) {
        return false;
    }
}

export function protegerBotonEliminarEvidencia(boton, url) {
    boton.hidden = true;
    boton.style.display = "none";
    boton.title = "Solo puedes eliminar tus propias evidencias";
    puedeEliminarArchivoStorage(url).then(permitido => {
        boton.hidden = !permitido;
        if (permitido) {
            boton.style.removeProperty("display");
            boton.removeAttribute("title");
        }
    });
}
