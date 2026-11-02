// Escapar al mostrar, no al guardar: los formularios y Firestore conservan
// el texto original y evitan codificaciones dobles al volver a editarlo.
export function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

// Para los controles heredados con onclick: una cadena de JavaScript válida
// y después un atributo HTML válido. Escapar solo comillas no es suficiente.
export function argumentoHtml(valor) {
    return escaparHtml(JSON.stringify(String(valor ?? "")));
}

export function urlSegura(valor) {
    if (typeof valor !== "string" || !valor.trim()) return "";
    try {
        const url = new URL(valor.trim(), globalThis.location?.href || "https://vectaria.invalid/");
        return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch (_) {
        return "";
    }
}
