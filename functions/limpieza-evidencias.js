const crypto = require("node:crypto");
const { rutaArchivoOT } = require("./evidencias-ot");
const { actualizarReserva } = require("./cuota-storage");

function rutasEvidencias(datos, bucketName, otId) {
  const rutas = new Set();
  function agregar(valor) {
    const url = typeof valor === "string" ? valor : valor?.url;
    if (typeof url !== "string") return;
    try {
      const ruta = rutaArchivoOT(url, bucketName, otId);
      if (!ruta.split("/").some(p => !p || [".", ".."].includes(p))) rutas.add(ruta);
    } catch (_) { /* Un enlace externo nunca es candidato de limpieza. */ }
  }
  function recorrer(valor, camino = "", profundidad = 0) {
    if (!valor || typeof valor !== "object" || profundidad > 25) return;
    for (const [clave, contenido] of Object.entries(valor)) {
      if (Array.isArray(contenido) && (["fotos", "documentos", "evidencias"].includes(clave) ||
          camino === "/despacho" && ["preparacion", "final"].includes(clave))) contenido.forEach(agregar);
      recorrer(contenido, `${camino}/${clave}`, profundidad + 1);
    }
  }
  recorrer(datos);
  return rutas;
}

async function limpiarEvidenciasRetiradas({ db, bucket, otId, anterior, actual }) {
  if (!anterior?.empresaId || !anterior.sucursalId || anterior.empresaId !== actual?.empresaId || anterior.sucursalId !== actual?.sucursalId) return;
  const nuevas = rutasEvidencias(actual, bucket.name, otId);
  const retiradas = [...rutasEvidencias(anterior, bucket.name, otId)].filter(r => !nuevas.has(r));
  const errores = [];
  for (const ruta of retiradas) {
    const tarea = db.collection("limpiezasEvidencias").doc(crypto.createHash("sha256").update(ruta).digest("hex"));
    let registro, protegida = false;
    await db.runTransaction(async tx => {
      const vigente = await tx.get(db.collection("ots").doc(otId));
      const papelera = await tx.get(db.collection("otsPapelera").doc(otId));
      const previa = await tx.get(tarea);
      const copias = [vigente.data(), papelera.data()?.orden].filter(Boolean);
      protegida = copias.some(ot => ot.empresaId !== anterior.empresaId || ot.sucursalId !== anterior.sucursalId || rutasEvidencias(ot, bucket.name, otId).has(ruta));
      if (protegida) return;
      registro = previa.data() || { empresaId: anterior.empresaId, sucursalId: anterior.sucursalId, otId, ruta, estado: "pendiente" };
      if (registro.estado !== "completada") tx.set(tarea, { ...registro, estado: "pendiente", actualizadoEnMs: Date.now() });
    });
    if (protegida || registro.estado === "completada") continue;
    try {
      let metadata;
      try { [metadata] = await bucket.file(ruta).getMetadata(); }
      catch (error) { if (Number(error.code) !== 404) throw error; }
      if (metadata) {
        registro = { ...registro, reservaId: metadata.metadata?.cuotaEmpresaId === anterior.empresaId ? metadata.metadata?.cuotaReservaId || null : null };
        await db.runTransaction(async tx => tx.set(tarea, { ...registro, estado: "pendiente" }));
        await bucket.file(ruta, { generation: metadata.generation }).delete({ ignoreNotFound: true });
      }
      if (registro.reservaId) await actualizarReserva({ db, empresaId: anterior.empresaId, id: registro.reservaId, eliminar: true });
      await db.runTransaction(async tx => tx.set(tarea, { ...registro, estado: "completada", actualizadoEnMs: Date.now() }));
    } catch (error) {
      await db.runTransaction(async tx => tx.set(tarea, { ...registro, estado: "pendiente", error: String(error.code || error.name), actualizadoEnMs: Date.now() }));
      errores.push(error);
    }
  }
  if (errores.length) throw errores[0];
}

module.exports = { rutasEvidencias, limpiarEvidenciasRetiradas };
