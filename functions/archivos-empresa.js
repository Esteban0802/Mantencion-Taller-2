const crypto = require("node:crypto");
const { contenidoArchivo } = require("./archivos-ot");
const { subirConCuota, actualizarReserva } = require("./cuota-storage");
function fallo(code, mensaje) { throw Object.assign(new Error(mensaje), { code }); }
async function contexto({ db, usuario, ruta }) {
  if (typeof ruta !== "string" || ruta.length > 900 || ruta.split("/").some(parte => !parte || [".", ".."].includes(parte))) fallo("invalid-argument", "Ruta no válida.");
  const [raiz, empresaId, grupo, sucursal] = ruta.split("/");
  if (raiz !== "empresas" || !usuario?.activo || (usuario.rol !== "super_admin" && usuario.empresaId !== empresaId)) fallo("permission-denied", "No puedes administrar estos archivos.");
  const empresaSnap = await db.collection("empresas").doc(empresaId).get();
  const empresa = empresaSnap.data();
  if (!empresaSnap.exists || empresa.activa === false || ["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"].includes(empresa.suscripcion?.estado)) fallo("failed-precondition", "La empresa solo permite consultar y descargar archivos.");
  let tipos = [], maximo = 20 * 1024 ** 2, permitido = false;
  const imagenes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif"];
  if (grupo === "informe" && ruta.split("/").length === 4) {
    permitido = ["super_admin", "admin_empresa"].includes(usuario.rol);
    tipos = imagenes.slice(0,3); maximo = 5 * 1024 ** 2;
  } else if (grupo === "plantillas") {
    permitido = usuario.rol === "admin_empresa";
    tipos = ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]; maximo = 5 * 1024 ** 2;
  } else if (grupo === "sheq") {
    permitido = usuario.rol === "sheq" && empresa.modulos?.sheq !== false;
    tipos = [...imagenes, "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  } else if (grupo === "inventario") {
    permitido = ["jefe_taller", "planificador"].includes(usuario.rol) && usuario.sucursalId === sucursal && empresa.modulos?.inventario !== false;
    tipos = [...imagenes, "application/pdf"];
  }
  if (!permitido) fallo("permission-denied", "No tienes permiso para modificar este archivo.");
  return { empresaId, tipos, maximo };
}
async function subirArchivoEmpresa({ db, bucket, usuario, datos }) {
  const { empresaId, tipos, maximo } = await contexto({ db, usuario, ruta: datos.ruta });
  const bytes = contenidoArchivo(datos.base64, datos.contentType, tipos);
  if (bytes.length >= maximo) fallo("invalid-argument", "El archivo supera el tamaño permitido para esta sección.");
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const metadata = await subirConCuota({ db, bucket, empresaId, ruta: datos.ruta, bytes, uid: usuario.uid, hash,
    contentType: datos.contentType, verificar: () => contexto({ db, usuario, ruta: datos.ruta }) });
  const token = String(metadata.metadata.firebaseStorageDownloadTokens).split(",")[0];
  return { url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(datos.ruta)}?alt=media&token=${token}` };
}
async function eliminarArchivoEmpresa({ db, bucket, usuario, datos }) {
  await contexto({ db, usuario, ruta: datos.ruta });
  const archivo = bucket.file(datos.ruta);
  let metadata;
  try { [metadata] = await archivo.getMetadata(); }
  catch (e) { if (Number(e.code) === 404) return { ok: true }; throw e; }
  await contexto({ db, usuario, ruta: datos.ruta });
  await bucket.file(datos.ruta, { generation: metadata.generation }).delete({ ignoreNotFound: true });
  if (metadata.metadata?.cuotaReservaId) await actualizarReserva({ db, empresaId: metadata.metadata.cuotaEmpresaId, id: metadata.metadata.cuotaReservaId, eliminar: true });
  return { ok: true };
}
module.exports = { subirArchivoEmpresa, eliminarArchivoEmpresa };
