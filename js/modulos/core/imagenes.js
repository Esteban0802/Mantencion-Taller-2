export function verImagenModal(src) {

    const modal = document.getElementById("modalImagen");
    const img = document.getElementById("imgExpandida");

    if (!modal || !img) {
        console.warn("No se encontró el modal de imágenes");
        return;
    }

    img.src = src;
    modal.style.display = "block";
}

export function cerrarImagen() {

    const modal = document.getElementById("modalImagen");

    if (!modal) return;

    modal.style.display = "none";
}

export function comprimirImagenBlob(
    file,
    calidad = 0.72,
    maxWidth = 1280
) {

    return new Promise(async (resolve, reject) => {

        if (!file || !file.type.startsWith("image/")) {
            reject("El archivo no es una imagen válida");
            return;
        }

        const procesarImagen = img => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) { reject("No se pudo procesar la imagen"); return; }
            let width = img.width;
            let height = img.height;
            if (width > maxWidth) {
                height = Math.round(height * (maxWidth / width));
                width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            if (typeof img.close === "function") img.close();
            canvas.toBlob(blob => {
                if (!blob) { reject("No se pudo comprimir la imagen"); return; }
                resolve(blob.size < file.size ? blob : file);
            }, "image/jpeg", calidad);
        };

        if (typeof createImageBitmap === "function") {
            try {
                const bitmap = await createImageBitmap(file);
                procesarImagen(bitmap);
                return;
            } catch (_) {
                // Algunos navegadores no decodifican HEIC/HEIF; se usa el método compatible.
            }
        }

        const reader = new FileReader();

        reader.onload = (event) => {

            const img = new Image();

            img.onload = () => {

                procesarImagen(img);
            };

            img.onerror = () => {
                reject("No se pudo leer la imagen");
            };

            img.src = event.target.result;
        };

        reader.onerror = () => {
            reject("Error al leer el archivo");
        };

        reader.readAsDataURL(file);
    });
}

const FORMATOS_FOTO_OPTIMIZABLES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/avif"
]);

/**
 * Reduce fotografías antes de subirlas. Si el navegador no puede decodificar
 * el formato (por ejemplo, algunos HEIC/HEIF), conserva el archivo original.
 * Los documentos PDF, Word y Excel nunca se modifican.
 */
export async function optimizarFotoParaCarga(file, opciones = {}) {
    const tipo = String(file?.type || "").toLowerCase();
    if (!file || !FORMATOS_FOTO_OPTIMIZABLES.has(tipo)) {
        return { archivo: file, optimizado: false, bytesOriginales: Number(file?.size || 0), bytesFinales: Number(file?.size || 0) };
    }

    try {
        const blob = await comprimirImagenBlob(file, opciones.calidad ?? 0.72, opciones.maxWidth ?? 1280);
        if (!blob || blob === file || blob.size >= file.size) {
            return { archivo: file, optimizado: false, bytesOriginales: file.size, bytesFinales: file.size };
        }
        const nombreBase = String(file.name || "foto").replace(/\.[^.]+$/, "");
        const archivo = new File([blob], `${nombreBase}.jpg`, {
            type: "image/jpeg",
            lastModified: file.lastModified || Date.now()
        });
        return { archivo, optimizado: true, bytesOriginales: file.size, bytesFinales: archivo.size };
    } catch (error) {
        console.warn("La fotografía se subirá en su formato original porque no pudo optimizarse.", error);
        return { archivo: file, optimizado: false, bytesOriginales: file.size, bytesFinales: file.size };
    }
}
