const crypto = require("node:crypto");
const { subirConCuota, actualizarReserva } = require("./cuota-storage");
const { rutaArchivoOT } = require("./evidencias-ot");
const ESTADOS_BLOQUEADOS = new Set(["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"]);
const MAX_BYTES = 20 * 1024 * 1024;

function rechazar(code, mensaje) {
  throw Object.assign(new Error(mensaje), { code });
}

async function exigirContextoArchivo({ db, usuario, otId }) {
  if (!usuario?.uid || usuario.activo !== true || !["jefe_taller", "supervisor", "tecnico"].includes(usuario.rol)) {
    rechazar("permission-denied", "No puedes modificar archivos de OT.");
  }
  if (typeof otId !== "string" || !otId || otId.length > 128 || otId.includes("/")) {
    rechazar("invalid-argument", "La OT no es válida.");
  }
  const ot = await db.collection("ots").doc(otId).get();
  if (!ot.exists) rechazar("not-found", "La OT no existe.");
  const orden = ot.data();
  if (!usuario.empresaId || !usuario.sucursalId || usuario.empresaId !== orden.empresaId || usuario.sucursalId !== orden.sucursalId) {
    rechazar("permission-denied", "No puedes modificar archivos de otra empresa o sucursal.");
  }
  const empresa = await db.collection("empresas").doc(orden.empresaId).get();
  if (!empresa.exists || empresa.data().activa === false || ESTADOS_BLOQUEADOS.has(empresa.data().suscripcion?.estado)) {
    rechazar("failed-precondition", "La empresa está inactiva o en cancelación. Solo permite consultar y descargar archivos.");
  }
  if (orden.cerrada === true || String(orden.estado || "").toUpperCase() === "CERRADA") {
    rechazar("failed-precondition", "La OT está cerrada y no permite modificar archivos.");
  }
  return { empresaId: orden.empresaId };
}

function contenidoArchivo(base64, tipo, permitidos = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif", "application/pdf"]) {
  if (typeof base64 !== "string" || !base64 || base64.length > Math.ceil(MAX_BYTES / 3) * 4 ||
      base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(base64)) {
    rechazar("invalid-argument", "El archivo está vacío, no es válido o supera los 20 MB.");
  }
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > MAX_BYTES || bytes.toString("base64") !== base64) {
    rechazar("invalid-argument", "El archivo no es válido o supera los 20 MB.");
  }
  const cabecera = bytes.subarray(0, 128);
  const ascii = cabecera.toString("latin1");
  const firmas = {
    "application/msword": () => cabecera.subarray(0, 8).equals(Buffer.from([208,207,17,224,161,177,26,225])),
    "application/vnd.ms-excel": () => cabecera.subarray(0, 8).equals(Buffer.from([208,207,17,224,161,177,26,225])),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": () => bytes.subarray(0,4).equals(Buffer.from([80,75,3,4])) && bytes.includes(Buffer.from("word/")),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": () => bytes.subarray(0,4).equals(Buffer.from([80,75,3,4])) && bytes.includes(Buffer.from("xl/")),
    "image/jpeg": () => cabecera.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
    "image/png": () => cabecera.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/webp": () => ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP",
    "application/pdf": () => ascii.startsWith("%PDF-"),
    "image/heic": () => ascii.slice(4, 8) === "ftyp" && /heic|heix|hevc|hevx|heim|heis|mif1|msf1/.test(ascii.slice(8)),
    "image/heif": () => ascii.slice(4, 8) === "ftyp" && /heic|heix|hevc|hevx|heim|heis|mif1|msf1/.test(ascii.slice(8)),
    "image/avif": () => ascii.slice(4, 8) === "ftyp" && /avif|avis/.test(ascii.slice(8))
  };
  if (!permitidos.includes(tipo) || !Object.hasOwn(firmas, tipo) || !firmas[tipo]()) {
    rechazar("invalid-argument", "El contenido del archivo no coincide con un formato permitido.");
  }
  return bytes;
}

async function metadataOpcional(archivo) {
  try { return (await archivo.getMetadata())[0]; }
  catch (error) { if (Number(error.code) === 404) return null; throw error; }
}

async function subirArchivoOT({ db, bucket, usuario, datos }) {
  const { empresaId } = await exigirContextoArchivo({ db, usuario, otId: datos.otId });
  if (!/^(ingreso|evaluacion|overhaul|pruebas_(general|mecanico|electrico)|despacho_(preparacion|final)|decision_evaluacion_(aprobado|rechazado))$/.test(datos.etapa || "") ||
      !/^(documentos|0|[1-9][0-9]{0,5})$/.test(String(datos.itemIndex)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(datos.subidaId || "")) {
    rechazar("invalid-argument", "El destino del archivo no es válido.");
  }
  const bytes = contenidoArchivo(datos.base64, datos.contentType);
  const nombre = String(datos.nombre || "archivo").replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 180) || "archivo";
  const ruta = `ots/${datos.otId}/${datos.etapa}/item_${datos.itemIndex}/${datos.subidaId}_${nombre}`;
  const archivo = bucket.file(ruta);
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  let metadata = await metadataOpcional(archivo);
  if (!metadata) {
    metadata = await subirConCuota({ db, bucket, empresaId, ruta, bytes, uid: usuario.uid, hash,
      contentType: datos.contentType, verificar: () => exigirContextoArchivo({ db, usuario, otId: datos.otId }) });
  }
  if (metadata.metadata?.creadoPorUid !== usuario.uid || metadata.metadata?.sha256 !== hash || metadata.contentType !== datos.contentType) {
    rechazar("permission-denied", "No puedes reemplazar un archivo existente con esta carga.");
  }
  await exigirContextoArchivo({ db, usuario, otId: datos.otId });
  if (metadata.metadata?.cuotaReservaId) await actualizarReserva({ db, empresaId, id: metadata.metadata.cuotaReservaId });
  const token = String(metadata.metadata.firebaseStorageDownloadTokens || "").split(",")[0];
  if (!token) rechazar("internal", "No fue posible obtener el enlace del archivo.");
  return { url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(ruta)}?alt=media&token=${token}`, bytes: bytes.length };
}

async function eliminarArchivoOT({ db, bucket, usuario, datos }) {
  await exigirContextoArchivo({ db, usuario, otId: datos.otId });
  let ruta;
  try { ruta = rutaArchivoOT(datos.url, bucket.name, datos.otId); }
  catch (_) { rechazar("invalid-argument", "El archivo no pertenece a esta OT."); }
  const metadata = await metadataOpcional(bucket.file(ruta));
  if (!metadata) return { ok: true };
  if (metadata.metadata?.creadoPorUid !== usuario.uid) {
    rechazar("permission-denied", "Solo puedes eliminar tus propias evidencias. Los archivos sin autor identificado están protegidos.");
  }
  await exigirContextoArchivo({ db, usuario, otId: datos.otId });
  await bucket.file(ruta, { generation: metadata.generation }).delete({ ignoreNotFound: true });
  if (metadata.metadata?.cuotaReservaId) await actualizarReserva({ db, empresaId: metadata.metadata.cuotaEmpresaId, id: metadata.metadata.cuotaReservaId, eliminar: true });
  return { ok: true };
}

module.exports = { exigirContextoArchivo, contenidoArchivo, subirArchivoOT, eliminarArchivoOT, MAX_BYTES };
