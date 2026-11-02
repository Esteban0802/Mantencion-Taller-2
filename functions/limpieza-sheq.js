const crypto = require("node:crypto");
const { actualizarReserva } = require("./cuota-storage");

function rutasDocumento(datos, bucketName) {
  const rutas = new Set();
  for (const version of [datos, ...(Array.isArray(datos?.historial) ? datos.historial : [])]) {
    if (!version) continue;
    let ruta = version.archivoRuta;
    if (!ruta && version.archivoUrl) {
      try {
        const url = new URL(version.archivoUrl), m = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
        if (url.protocol === "https:" && url.hostname === "firebasestorage.googleapis.com" && m && decodeURIComponent(m[1]) === bucketName) ruta = decodeURIComponent(m[2]);
      } catch (_) { /* No se eliminan enlaces externos. */ }
    }
    if (typeof ruta === "string" && ruta) rutas.add(ruta);
  }
  return rutas;
}

function rutaPermitida(ruta, empresaId) {
  const partes = ruta.split("/");
  return partes.length === 6 && partes.every(p => p && ![".", ".."].includes(p)) &&
    partes[0] === "empresas" && partes[1] === empresaId && partes[2] === "sheq" && ["persona", "vehiculo"].includes(partes[3]);
}

async function limpiarRutasSheq({ db, bucket, empresaId, rutas }) {
  const errores = [];
  for (const ruta of new Set(rutas)) {
    if (!rutaPermitida(ruta, empresaId)) continue;
    const actuales = await db.collection("sheqDocumentos").where("empresaId", "==", empresaId).get();
    if (actuales.docs.some(d => rutasDocumento(d.data(), bucket.name).has(ruta))) continue;
    const tarea = db.collection("limpiezasSheq").doc(crypto.createHash("sha256").update(ruta).digest("hex"));
    let registro;
    await db.runTransaction(async tx => {
      const previa = await tx.get(tarea);
      registro = previa.data() || { empresaId, ruta, estado: "pendiente" };
      if (registro.estado !== "completada") tx.set(tarea, { ...registro, estado: "pendiente", actualizadoEnMs: Date.now() });
    });
    if (registro.estado === "completada") continue;
    try {
      let metadata;
      try { [metadata] = await bucket.file(ruta).getMetadata(); }
      catch (error) { if (Number(error.code) !== 404) throw error; }
      if (metadata) {
        registro = { ...registro, reservaId: metadata.metadata?.cuotaEmpresaId === empresaId ? metadata.metadata?.cuotaReservaId || null : null };
        await db.runTransaction(async tx => tx.set(tarea, { ...registro, estado: "pendiente" }));
        await bucket.file(ruta, { generation: metadata.generation }).delete({ ignoreNotFound: true });
      }
      if (registro.reservaId) await actualizarReserva({ db, empresaId, id: registro.reservaId, eliminar: true });
      await db.runTransaction(async tx => tx.set(tarea, { ...registro, estado: "completada", actualizadoEnMs: Date.now() }));
    } catch (error) {
      await db.runTransaction(async tx => tx.set(tarea, { ...registro, estado: "pendiente", error: String(error.code || error.name), actualizadoEnMs: Date.now() }));
      errores.push(error);
    }
  }
  if (errores.length) throw errores[0];
}

async function limpiarDocumentoSheq({ db, bucket, anterior, actual }) {
  if (!anterior?.empresaId || actual && anterior.empresaId !== actual.empresaId) return;
  const conservadas = rutasDocumento(actual, bucket.name);
  const rutas = [...rutasDocumento(anterior, bucket.name)].filter(r => !conservadas.has(r));
  await limpiarRutasSheq({ db, bucket, empresaId: anterior.empresaId, rutas });
}

async function limpiarVehiculoSheq({ db, bucket, vehiculoId, anterior }) {
  if (!anterior?.empresaId || !vehiculoId || vehiculoId.includes("/")) return;
  const actual = await db.collection("sheqVehiculos").doc(vehiculoId).get();
  if (actual.exists) return;
  const prefix = `empresas/${anterior.empresaId}/sheq/vehiculo/${vehiculoId}/`;
  const tarea = db.collection("limpiezasVehiculosSheq").doc(crypto.createHash("sha256").update(prefix).digest("hex"));
  const [archivos] = await bucket.getFiles({ prefix });
  let registro;
  await db.runTransaction(async tx => {
    const previa = await tx.get(tarea);
    registro = previa.data() || { empresaId: anterior.empresaId, vehiculoId, estado: "pendiente", rutas: archivos.map(a => a.name).filter(r => r.startsWith(prefix)) };
    if (registro.estado !== "completada") tx.set(tarea, registro);
  });
  if (registro.estado === "completada") return;
  await limpiarRutasSheq({ db, bucket, empresaId: anterior.empresaId, rutas: registro.rutas });
  await db.runTransaction(async tx => tx.set(tarea, { ...registro, estado: "completada", actualizadoEnMs: Date.now() }));
}

module.exports = { rutasDocumento, limpiarDocumentoSheq, limpiarVehiculoSheq };
