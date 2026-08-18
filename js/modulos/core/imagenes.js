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

    return new Promise((resolve, reject) => {

        if (!file || !file.type.startsWith("image/")) {
            reject("El archivo no es una imagen válida");
            return;
        }

        const reader = new FileReader();

        reader.onload = (event) => {

            const img = new Image();

            img.onload = () => {

                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");

                if (!ctx) {
                    reject("No se pudo procesar la imagen");
                    return;
                }

                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round(
                        height * (maxWidth / width)
                    );

                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                ctx.drawImage(
                    img,
                    0,
                    0,
                    width,
                    height
                );

                canvas.toBlob(
                    (blob) => {

                        if (!blob) {
                            reject("No se pudo comprimir la imagen");
                            return;
                        }

                        resolve(blob);
                    },
                    "image/jpeg",
                    calidad
                );
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