const { HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");

const ESTADOS_BLOQUEADOS = ["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"];
const DIA = 24 * 60 * 60 * 1000;
function fechaMs(valor) {
  const ms = typeof valor?.toMillis === "function" ? valor.toMillis() : valor instanceof Date ? valor.getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}

async function moverOT({ db, usuario, otId, restaurar = false }) {
  if (usuario?.activo !== true || usuario.rol !== "jefe_taller" || !usuario.empresaId || !usuario.sucursalId) {
    throw new HttpsError("permission-denied", "Solo el Jefe de Taller de la sucursal puede administrar esta papelera.");
  }
  if (typeof otId !== "string" || !otId || otId.includes("/") || otId.length > 128) {
    throw new HttpsError("invalid-argument", "La orden no es válida.");
  }
  const orden = db.collection("ots").doc(otId);
  const copia = db.collection("otsPapelera").doc(otId);
  const resumen = db.collection("otsResumen").doc(otId);
  const log = db.collection("logsSistema").doc();
  await db.runTransaction(async tx => {
    const original = await tx.get(orden);
    const archivo = await tx.get(copia);
    const resumenActual = await tx.get(resumen);
    const datos = restaurar ? archivo.data()?.orden : original.data();
    if (restaurar && archivo.data()?.borradoPendiente) {
      throw new HttpsError("failed-precondition", "Esta OT está en eliminación definitiva. Reintenta su eliminación; ya no puede restaurarse.");
    }
    if (!(restaurar ? archivo.exists : original.exists)) {
      throw new HttpsError("not-found", "La orden ya no está disponible en esta ubicación.");
    }
    if (!datos || datos.empresaId !== usuario.empresaId || datos.sucursalId !== usuario.sucursalId ||
        (restaurar && (archivo.data().empresaId !== usuario.empresaId || archivo.data().sucursalId !== usuario.sucursalId))) {
      throw new HttpsError("permission-denied", "La orden pertenece a otra empresa o sucursal.");
    }
    if (restaurar ? original.exists : archivo.exists) {
      throw new HttpsError("already-exists", "Existe otro registro con este identificador. No se sobrescribió información.");
    }
    const empresa = await tx.get(db.collection("empresas").doc(usuario.empresaId));
    const sucursal = await tx.get(db.collection("sucursales").doc(usuario.sucursalId));
    const estado = empresa.data()?.suscripcion?.estado;
    if (!empresa.exists || empresa.data().activa === false || ESTADOS_BLOQUEADOS.includes(estado) ||
        !sucursal.exists || sucursal.data().activa !== true || sucursal.data().empresaId !== usuario.empresaId) {
      throw new HttpsError("failed-precondition", "La empresa o sucursal no permite esta operación.");
    }
    if (restaurar) {
      tx.create(orden, datos);
      tx.delete(copia);
      tx.set(resumen, archivo.data().resumen || {
        empresaId: datos.empresaId, sucursalId: datos.sucursalId, os: datos.os || "",
        equipo: datos.equipo || "", cliente: datos.cliente || "", estado: datos.estado || "INGRESO",
        cerrada: datos.cerrada === true, fechaCreacion: datos.fechaCreacion || null
      });
    } else {
      tx.create(copia, {
        empresaId: datos.empresaId, sucursalId: datos.sucursalId,
        os: datos.os || "Sin OS", equipo: datos.equipo || "", orden: datos,
        resumen: resumenActual.exists ? resumenActual.data() : null,
        eliminadoPorUid: usuario.uid, eliminadoEn: FieldValue.serverTimestamp()
      });
      tx.delete(orden);
      tx.delete(resumen);
    }
    tx.create(log, {
      version: 1, origen: "cloud_function", empresaId: usuario.empresaId,
      sucursalId: usuario.sucursalId, usuarioId: usuario.uid, rol: usuario.rol,
      accion: restaurar ? "ot_restaurada" : "ot_enviada_papelera", objetivoId: otId,
      fecha: FieldValue.serverTimestamp()
    });
  });
  return { ok: true };
}

async function eliminarDefinitivamenteOT({ db, bucket, usuario, otId, automatico = false, ahora = Date.now() }) {
  if (usuario?.activo !== true || usuario.rol !== "jefe_taller" || !usuario.empresaId || !usuario.sucursalId) {
    throw new HttpsError("permission-denied", "Solo el Jefe de Taller de la sucursal puede eliminar esta OT.");
  }
  if (typeof otId !== "string" || !otId || otId.includes("/") || otId.length > 128) {
    throw new HttpsError("invalid-argument", "La orden no es válida.");
  }
  const copia = db.collection("otsPapelera").doc(otId);
  const orden = db.collection("ots").doc(otId);
  const log = db.collection("logsSistema").doc();
  await db.runTransaction(async tx => {
    const archivo = await tx.get(copia);
    const original = await tx.get(orden);
    if (!archivo.exists) throw new HttpsError("not-found", "La OT ya no está en la papelera.");
    const datos = archivo.data();
    if (automatico && (fechaMs(datos.eliminadoEn) === null || fechaMs(datos.eliminadoEn) + 15 * DIA > ahora ||
        fechaMs(datos.avisoEliminacionEn) === null || fechaMs(datos.avisoEliminacionEn) + 3 * DIA > ahora)) {
      throw new HttpsError("failed-precondition", "La OT no ha completado su plazo de conservación y aviso previo.");
    }
    if (datos.empresaId !== usuario.empresaId || datos.sucursalId !== usuario.sucursalId ||
        datos.orden?.empresaId !== usuario.empresaId || datos.orden?.sucursalId !== usuario.sucursalId) {
      throw new HttpsError("permission-denied", "La OT pertenece a otra empresa o sucursal.");
    }
    if (original.exists) throw new HttpsError("failed-precondition", "La OT está activa y no puede eliminarse desde la papelera.");
    const empresa = await tx.get(db.collection("empresas").doc(usuario.empresaId));
    const sucursal = await tx.get(db.collection("sucursales").doc(usuario.sucursalId));
    if (!empresa.exists || empresa.data().activa === false || ESTADOS_BLOQUEADOS.includes(empresa.data().suscripcion?.estado) ||
        !sucursal.exists || sucursal.data().activa !== true || sucursal.data().empresaId !== usuario.empresaId) {
      throw new HttpsError("failed-precondition", "La empresa o sucursal no permite esta operación.");
    }
    tx.set(copia, { ...datos, borradoPendiente: true });
  });
  // El bloqueo transaccional impide restaurar mientras Storage se vacía.
  // Las reservas se liberan después de vaciar Storage; un fallo permite reintentar.
  const prefix = `ots/${otId}/`;
  const [archivos] = await bucket.getFiles({ prefix });
  for (const archivo of archivos) {
    if (!archivo.name.startsWith(prefix)) throw new HttpsError("failed-precondition", "Ruta de archivo inesperada.");
    await archivo.delete({ ignoreNotFound: true });
  }
  const reservas = await db.collection("empresas").doc(usuario.empresaId).collection("reservasAlmacenamiento")
    .where("ruta", ">=", prefix).where("ruta", "<", `${prefix}\uf8ff`).get();
  const { actualizarReserva } = require("./cuota-storage");
  for (const reserva of reservas.docs) {
    await actualizarReserva({ db, empresaId: usuario.empresaId, id: reserva.id, eliminar: true });
  }
  await db.runTransaction(async tx => {
    const archivo = await tx.get(copia);
    if (!archivo.exists) return;
    if (!archivo.data().borradoPendiente) throw new HttpsError("failed-precondition", "La eliminación cambió de estado.");
    tx.delete(copia);
    // Referencia mínima para contabilizar eventos de Storage que lleguen tarde.
    tx.set(db.collection("otsEliminadas").doc(otId), { empresaId: usuario.empresaId, sucursalId: usuario.sucursalId });
    tx.create(log, { accion: "ot_eliminada_definitivamente", objetivoId: otId,
      empresaId: usuario.empresaId, sucursalId: usuario.sucursalId, usuarioId: usuario.uid,
      rol: automatico ? "sistema" : usuario.rol, origen: automatico ? "borrado_automatico_papelera" : "cloud_function", fecha: FieldValue.serverTimestamp() });
  });
  return { ok: true };
}

async function procesarPapelera({ db, bucket, ahora = Date.now(), eliminar = eliminarDefinitivamenteOT, registrarError = console.error }) {
  let cursor = null;
  const resultado = { avisadas: 0, eliminadas: 0, errores: 0 };
  do {
    let consulta = db.collection("otsPapelera").where("eliminadoEn", "<=", new Date(ahora - 10 * DIA)).orderBy("eliminadoEn").limit(50);
    if (cursor) consulta = consulta.startAfter(cursor);
    const pagina = await consulta.get();
    for (const documento of pagina.docs) {
      try {
        const datos = documento.data();
        if (fechaMs(datos.eliminadoEn) === null) continue;
        await db.runTransaction(async tx => {
          const actual = await tx.get(documento.ref);
          if (!actual.exists) return;
          tx.set(documento.ref, { ...actual.data(), ultimaRevisionPapeleraEn: new Date(ahora), proximaRevisionPapeleraEn: new Date(ahora + 5 * DIA) });
        });
        if (fechaMs(datos.avisoEliminacionEn) === null) {
          await db.runTransaction(async tx => {
            const actual = await tx.get(documento.ref);
            if (!actual.exists || fechaMs(actual.data().avisoEliminacionEn) !== null) return;
            tx.set(documento.ref, { ...actual.data(), avisoEliminacionEn: new Date(ahora) });
          });
          resultado.avisadas++;
          continue;
        }
        if (fechaMs(datos.eliminadoEn) + 15 * DIA > ahora || fechaMs(datos.avisoEliminacionEn) + 3 * DIA > ahora) continue;
        await eliminar({ db, bucket, otId: documento.id, automatico: true, ahora,
          usuario: { uid: "sistema-papelera", activo: true, rol: "jefe_taller", empresaId: datos.empresaId, sucursalId: datos.sucursalId } });
        resultado.eliminadas++;
      } catch (error) {
        resultado.errores++;
        registrarError("procesarPapelera", documento.id, error.code || error.name);
      }
    }
    cursor = pagina.docs.length === 50 ? pagina.docs.at(-1) : null;
  } while (cursor);
  return resultado;
}

module.exports = { moverOT, eliminarDefinitivamenteOT, procesarPapelera };
