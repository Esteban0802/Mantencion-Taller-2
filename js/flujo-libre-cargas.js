export async function cargarEvidencias({ archivos, subir, adjuntar, eliminar, progreso }) {
  const fallidos = [];
  let guardados = 0;
  for (const [indice, archivo] of archivos.entries()) {
    progreso?.(indice + 1, archivos.length);
    try {
      const url = await subir(archivo);
      try { await adjuntar(archivo, url); }
      catch (error) { await eliminar(url).catch(() => {}); throw error; }
      guardados++;
    } catch (error) {
      fallidos.push({ nombre: archivo.name, mensaje: error.message || "No fue posible cargar el archivo." });
    }
  }
  return { guardados, fallidos };
}
