const crypto = require("node:crypto");
const VERSION = 1;
function error(code, mensaje) { throw Object.assign(new Error(mensaje), { code }); }
function referencias(db, empresaId, id) {
  const empresa = db.collection("empresas").doc(empresaId);
  return { empresa, reserva: empresa.collection("reservasAlmacenamiento").doc(id) };
}
async function reservarCuota({ db, empresaId, ruta, bytes, uid, hash }) {
  const id = crypto.createHash("sha256").update(ruta).digest("hex");
  const refs = referencias(db, empresaId, id);
  await db.runTransaction(async tx => {
    const [empresa, reserva] = await Promise.all([tx.get(refs.empresa), tx.get(refs.reserva)]);
    const datos = empresa.data();
    if (!empresa.exists || datos.storageCuotaVersion !== VERSION || datos.storageRecalculando) {
      error("failed-precondition", "El administrador debe medir el uso de almacenamiento desde Configuración antes de nuevas cargas.");
    }
    if (datos.activa === false || ["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"].includes(datos.suscripcion?.estado)) {
      error("failed-precondition", "La empresa no permite nuevas cargas.");
    }
    if (reserva.exists) {
      const actual = reserva.data();
      if (actual.uid !== uid || actual.hash !== hash || actual.bytes !== bytes || actual.estado === "eliminada") {
        error("failed-precondition", "Esta carga ya finalizó o no coincide. Selecciona nuevamente el archivo.");
      }
      return;
    }
    const usado = Math.max(0, Number(datos.storageUsadoBytes || 0));
    const reservado = Math.max(0, Number(datos.storageReservadoBytes || 0));
    const limite = Math.max(0, Number(datos.maxStorageGB || 0)) * 1024 ** 3;
    if (![usado, reservado, limite].every(Number.isFinite)) error("failed-precondition", "La configuración de almacenamiento no es válida.");
    if (limite && usado + reservado + bytes >= limite) {
      error("resource-exhausted", "La carga supera el almacenamiento disponible de la empresa. Libera espacio o solicita ampliar el plan.");
    }
    tx.update(refs.empresa, { storageReservadoBytes: reservado + bytes });
    tx.set(refs.reserva, { empresaId, ruta, bytes, uid, hash, estado: "reservada", creadaEn: Date.now() });
  });
  return id;
}
async function actualizarReserva({ db, empresaId, id, eliminar = false }) {
  const refs = referencias(db, empresaId, id);
  await db.runTransaction(async tx => {
    const [empresa, reserva] = await Promise.all([tx.get(refs.empresa), tx.get(refs.reserva)]);
    if (!empresa.exists || !reserva.exists) return;
    const datos = empresa.data(), carga = reserva.data();
    if (carga.estado === "eliminada" || (!eliminar && carga.estado === "confirmada")) return;
    const bytes = Number(carga.bytes || 0);
    const pendiente = carga.estado === "reservada";
    tx.update(refs.empresa, {
      storageReservadoBytes: Math.max(0, Number(datos.storageReservadoBytes || 0) - (pendiente ? bytes : 0)),
      storageUsadoBytes: Math.max(0, Number(datos.storageUsadoBytes || 0) + (eliminar ? (pendiente ? 0 : -bytes) : bytes)),
      storageArchivos: Math.max(0, Number(datos.storageArchivos || 0) + (eliminar ? (pendiente ? 0 : -1) : 1)),
      storageActualizadoEnMs: Date.now()
    });
    tx.update(refs.reserva, { estado: eliminar ? "eliminada" : "confirmada", actualizadaEn: Date.now() });
  });
}
async function subirConCuota({ db, bucket, empresaId, ruta, bytes, uid, hash, contentType, verificar }) {
  const archivo = bucket.file(ruta);
  const id = await reservarCuota({ db, empresaId, ruta, bytes: bytes.length, uid, hash });
  const metadata = { creadoPorUid: uid, sha256: hash, cuotaEmpresaId: empresaId, cuotaReservaId: id, firebaseStorageDownloadTokens: crypto.randomUUID() };
  let creado = false;
  try {
    await verificar();
    try {
      await archivo.save(bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType, metadata } });
      creado = true;
    } catch (e) { if (Number(e.code) !== 412) throw e; }
    const [actual] = await archivo.getMetadata();
    if (actual.metadata?.creadoPorUid !== uid || actual.metadata?.sha256 !== hash || actual.metadata?.cuotaReservaId !== id || actual.contentType !== contentType) {
      error("permission-denied", "No puedes reemplazar un archivo existente.");
    }
    try { await verificar(); }
    catch (e) {
      if (creado) await bucket.file(ruta, { generation: actual.generation }).delete({ ignoreNotFound: true });
      throw e;
    }
    await actualizarReserva({ db, empresaId, id });
    return actual;
  } catch (e) {
    // Nunca liberar espacio si el resultado de Storage es desconocido.
    try { await archivo.getMetadata(); }
    catch (consulta) {
      if (Number(consulta.code) === 404) await actualizarReserva({ db, empresaId, id, eliminar: true });
    }
    throw e;
  }
}
module.exports = { reservarCuota, actualizarReserva, subirConCuota };
