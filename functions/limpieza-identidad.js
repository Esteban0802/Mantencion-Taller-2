const crypto = require("node:crypto");
const { actualizarReserva } = require("./cuota-storage");

const rutasBranding = datos => [datos?.logoRuta, datos?.portadaRuta].filter(r => typeof r === "string" && r);

async function limpiarIdentidadAnterior({ db, bucket, empresaId, sucursalId = null, anterior, actual }) {
  const prefijo = sucursalId ? `empresas/${empresaId}/sucursales/${sucursalId}/informe/` : `empresas/${empresaId}/informe/`;
  const referencia = db.collection(sucursalId ? "sucursales" : "empresas").doc(sucursalId || empresaId);
  const pendientes = [...new Set(rutasBranding(anterior))].filter(r => !rutasBranding(actual).includes(r));
  for (const ruta of pendientes) {
    // Un evento de configuración jamás puede borrar inventario, otra sucursal ni otra empresa.
    if (!ruta.startsWith(prefijo) || !ruta.slice(prefijo.length) || ruta.slice(prefijo.length).includes("/") || ruta.split("/").some(p => [".", ".."].includes(p))) continue;
    const id = crypto.createHash("sha256").update(ruta).digest("hex");
    const tarea = db.collection("limpiezasIdentidad").doc(id);
    const vigente = await referencia.get();
    const datos = vigente.data();
    if (sucursalId && datos?.empresaId !== empresaId) continue;
    const branding = sucursalId ? datos?.identidadVisual?.brandingInforme : datos?.brandingInforme;
    if (rutasBranding(branding).includes(ruta)) continue;
    // No retirar una imagen general si alguna sucursal todavía la referencia explícitamente.
    if (!sucursalId) {
      const sucursales = await db.collection("sucursales").where("empresaId", "==", empresaId).get();
      if (sucursales.docs.some(s => rutasBranding(s.data().identidadVisual?.brandingInforme).includes(ruta))) continue;
    }
    let registro;
    await db.runTransaction(async tx => {
      const previa = await tx.get(tarea);
      registro = previa.data() || { empresaId, sucursalId, ruta, estado: "pendiente" };
      if (registro.estado !== "completada") tx.set(tarea, { ...registro, estado: "pendiente", actualizadoEnMs: Date.now() });
    });
    if (registro.estado === "completada") continue;
    try {
      let metadata;
      try { [metadata] = await bucket.file(ruta).getMetadata(); }
      catch (error) { if (Number(error.code) !== 404) throw error; }
      if (metadata) {
        const reservaId = metadata.metadata?.cuotaEmpresaId === empresaId ? metadata.metadata?.cuotaReservaId : null;
        registro = { ...registro, reservaId: reservaId || null };
        await db.runTransaction(async tx => tx.set(tarea, { ...registro, estado: "pendiente" }));
        await bucket.file(ruta, { generation: metadata.generation }).delete({ ignoreNotFound: true });
      }
      // La reserva persiste aunque falle justo después de borrar el objeto de Storage.
      if (registro.reservaId) await actualizarReserva({ db, empresaId, id: registro.reservaId, eliminar: true });
      await db.runTransaction(async tx => tx.set(tarea, { ...registro, estado: "completada", actualizadoEnMs: Date.now() }));
    } catch (error) {
      await db.runTransaction(async tx => tx.set(tarea, { ...registro, estado: "pendiente", error: String(error.code || error.name), actualizadoEnMs: Date.now() }));
      throw error;
    }
  }
}

module.exports = { limpiarIdentidadAnterior };
