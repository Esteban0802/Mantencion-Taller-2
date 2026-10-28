const { isDeepStrictEqual } = require("node:util");

function listasEvidencias(datos) {
  const listas = new Map();
  function recorrer(valor, ruta = "", profundidad = 0) {
    if (profundidad > 25) throw new Error("Estructura de evidencias demasiado profunda.");
    if (!valor || typeof valor !== "object") return;
    for (const [clave, contenido] of Object.entries(valor)) {
      const destino = `${ruta}/${clave}`;
      if (["fotos", "documentos"].includes(clave) ||
          (ruta === "/despacho" && ["preparacion", "final"].includes(clave))) {
        if (contenido == null) continue;
        if (!Array.isArray(contenido) || contenido.some(item =>
          typeof item !== "string" && (!item || typeof item.url !== "string"))) {
          throw new Error("La lista de evidencias no es válida.");
        }
        listas.set(destino, contenido);
      } else recorrer(contenido, destino, profundidad + 1);
    }
  }
  recorrer(datos);
  return listas;
}

function rutaArchivoOT(url, bucketName, otId) {
  const archivo = new URL(url);
  const coincidencia = archivo.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if (archivo.protocol !== "https:" || archivo.hostname !== "firebasestorage.googleapis.com" ||
      !coincidencia || decodeURIComponent(coincidencia[1]) !== bucketName) {
    throw new Error("La evidencia no pertenece al almacenamiento de la aplicación.");
  }
  const ruta = decodeURIComponent(coincidencia[2]);
  if (!ruta.startsWith(`ots/${otId}/`)) throw new Error("La evidencia no pertenece a esta OT.");
  return ruta;
}

async function validarEvidenciasOT(anterior, nuevo, usuario, { otId, bucketName, obtenerAutorArchivo } = {}) {
  const antes = listasEvidencias(anterior);
  const despues = listasEvidencias(nuevo);
  const autores = new Map();
  async function exigirAutor(evidencia) {
    const url = typeof evidencia === "string" ? evidencia : evidencia.url;
    const ruta = rutaArchivoOT(url, bucketName, otId);
    if (typeof obtenerAutorArchivo !== "function") throw new Error("No se pudo verificar la autoría de la evidencia.");
    if (!autores.has(ruta)) autores.set(ruta, await obtenerAutorArchivo(ruta));
    if (autores.get(ruta) !== usuario.uid) {
      throw new Error("Solo puedes agregar, modificar o quitar tus propias evidencias. Los archivos sin autor identificado están protegidos.");
    }
  }
  for (const ruta of new Set([...antes.keys(), ...despues.keys()])) {
    const restantes = [...(despues.get(ruta) || [])];
    for (const evidencia of antes.get(ruta) || []) {
      const indice = restantes.findIndex(item => isDeepStrictEqual(item, evidencia));
      if (indice >= 0) restantes.splice(indice, 1);
      else await exigirAutor(evidencia);
    }
    for (const evidencia of restantes) await exigirAutor(evidencia);
  }
}

module.exports = { listasEvidencias, rutaArchivoOT, validarEvidenciasOT };
