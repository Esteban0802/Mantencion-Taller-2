async function limpiarExportaciones({ bucket, ahora = Date.now() }) {
  const resultado = { revisadas: 0, eliminadas: 0 };
  let pageToken;
  do {
    const [archivos, siguiente] = await bucket.getFiles({
      prefix: "exportaciones/", autoPaginate: false, maxResults: 100,
      ...(pageToken ? { pageToken } : {})
    });
    for (const archivo of archivos) {
      // No depender únicamente del filtro del listado para una eliminación.
      if (!archivo.name.startsWith("exportaciones/")) continue;
      const [metadata] = await archivo.getMetadata();
      resultado.revisadas++;
      const expira = Date.parse(metadata.metadata?.expiresAt || "");
      if (metadata.metadata?.temporalExport === "true" && Number.isFinite(expira) && expira <= ahora) {
        await archivo.delete({ ignoreNotFound: true });
        resultado.eliminadas++;
      }
    }
    pageToken = siguiente?.pageToken;
  } while (pageToken);
  return resultado;
}
module.exports = { limpiarExportaciones };
