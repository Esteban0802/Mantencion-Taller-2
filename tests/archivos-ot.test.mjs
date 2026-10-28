import { dbMemoria } from "./helpers/db-memoria.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const { subirArchivoOT, eliminarArchivoOT, contenidoArchivo, MAX_BYTES } = createRequire(import.meta.url)("../functions/archivos-ot.js");

function entorno() {
  const empresa = { storageCuotaVersion: 1, storageUsadoBytes: 0, storageReservadoBytes: 0, activa: true, suscripcion: { estado: "activa" } };
  const ot = { empresaId: "e", sucursalId: "s", cerrada: false, estado: "INGRESO" };
  const usuario = { uid: "yo", activo: true, rol: "tecnico", empresaId: "e", sucursalId: "s" };
  const archivos = new Map();
  const cambios = [];
  const db = dbMemoria({ "empresas/e": empresa, "ots/ot": ot });
  const bucket = { name: "bucket", file: (ruta, opciones = {}) => ({
    getMetadata: async () => {
      if (!archivos.has(ruta)) throw Object.assign(new Error("No existe"), { code: 404 });
      return [archivos.get(ruta)];
    },
    save: async (bytes, opcionesCarga) => {
      assert.equal(opcionesCarga.preconditionOpts.ifGenerationMatch, 0);
      if (archivos.has(ruta)) throw Object.assign(new Error("Ya existe"), { code: 412 });
      archivos.set(ruta, { ...opcionesCarga.metadata, size: bytes.length, generation: "1" });
      cambios.push("subir");
    },
    delete: async () => {
      assert.equal(opciones.generation, archivos.get(ruta)?.generation);
      archivos.delete(ruta);
      cambios.push("eliminar");
    }
  }) };
  const datos = { otId: "ot", etapa: "ingreso", itemIndex: 0, subidaId: randomUUID(), nombre: "foto.jpg", contentType: "image/jpeg", base64: Buffer.from([255, 216, 255]).toString("base64") };
  return { empresa, ot, usuario, archivos, cambios, db, bucket, datos };
}

test("carga y elimina archivos propios conservando la autoría verificada", async () => {
  for (const rol of ["tecnico", "supervisor", "jefe_taller"]) {
    const e = entorno(); e.usuario.rol = rol;
    const resultado = await subirArchivoOT(e);
    assert.match(resultado.url, /^https:\/\/firebasestorage\.googleapis\.com/);
    assert.equal([...e.archivos.values()][0].metadata.creadoPorUid, "yo");
    await eliminarArchivoOT({ ...e, datos: { otId: "ot", url: resultado.url } });
    assert.deepEqual(e.cambios, ["subir", "eliminar"]);
  }
});

for (const estado of ["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"]) {
  test(`${estado}: bloquea nuevas cargas y eliminaciones incluso con activa=true`, async () => {
    const e = entorno();
    const resultado = await subirArchivoOT(e);
    e.empresa.suscripcion.estado = estado;
    await assert.rejects(subirArchivoOT({ ...e, datos: { ...e.datos, subidaId: randomUUID() } }), { code: "failed-precondition" });
    await assert.rejects(eliminarArchivoOT({ ...e, datos: { otId: "ot", url: resultado.url } }), { code: "failed-precondition" });
    assert.deepEqual(e.cambios, ["subir"]);
    e.empresa.suscripcion.estado = "activa";
    await eliminarArchivoOT({ ...e, datos: { otId: "ot", url: resultado.url } });
    assert.equal(e.archivos.size, 0);
  });
}

test("bloquea empresas inactivas y cuentas, roles, sucursales y OT no habilitadas", async () => {
  for (const cambiar of [
    e => { e.empresa.activa = false; }, e => { e.usuario.activo = false; },
    e => { e.usuario.empresaId = "otra"; }, e => { e.usuario.sucursalId = "otra"; },
    e => { e.usuario.sucursalId = ""; }, e => { e.ot.cerrada = true; },
    e => { e.ot.estado = "CERRADA"; },
    ...["admin_empresa", "admin_sucursal", "super_admin", "planificador", "bodeguero", "sheq"].map(rol => e => { e.usuario.rol = rol; })
  ]) {
    const e = entorno(); cambiar(e);
    await assert.rejects(subirArchivoOT(e));
    assert.deepEqual(e.cambios, []);
  }
});

test("no puede eliminar archivos ajenos, antiguos sin autor ni archivos de otra OT", async () => {
  for (const autor of ["otro", ""]) {
    const e = entorno(); const resultado = await subirArchivoOT(e);
    [...e.archivos.values()][0].metadata.creadoPorUid = autor;
    await assert.rejects(eliminarArchivoOT({ ...e, datos: { otId: "ot", url: resultado.url } }), { code: "permission-denied" });
    assert.deepEqual(e.cambios, ["subir"]);
  }
  const e = entorno();
  await assert.rejects(eliminarArchivoOT({ ...e, datos: { otId: "ot", url: "https://firebasestorage.googleapis.com/v0/b/bucket/o/ots%2Fotra%2Ffoto.jpg" } }), { code: "invalid-argument" });
});

test("los reintentos no duplican archivos ni permiten sobrescribir otra carga", async () => {
  const e = entorno();
  const primero = await subirArchivoOT(e);
  assert.deepEqual(await subirArchivoOT(e), primero);
  assert.deepEqual(e.cambios, ["subir"]);
  await assert.rejects(subirArchivoOT({ ...e, datos: { ...e.datos, base64: Buffer.from([255, 216, 255, 1]).toString("base64") } }), { code: "permission-denied" });
  [...e.archivos.values()][0].metadata.creadoPorUid = "otro";
  await assert.rejects(subirArchivoOT(e), { code: "permission-denied" });
});

test("si se cancela durante la carga se retira el archivo nuevo y se rechaza la operación", async () => {
  const e = entorno();
  const file = e.bucket.file;
  e.bucket.file = (...args) => {
    const archivo = file(...args);
    return { ...archivo, save: async (...parametros) => {
      await archivo.save(...parametros);
      e.empresa.activa = false;
    } };
  };
  await assert.rejects(subirArchivoOT(e), { code: "failed-precondition" });
  assert.equal(e.archivos.size, 0);
  assert.deepEqual(e.cambios, ["subir", "eliminar"]);
});

test("verifica firma, formato, codificación y límite de 20 MB en el servidor", () => {
  for (const [base64, tipo] of [["", "image/jpeg"], ["%%%", "image/jpeg"], ["AAAA====", "image/jpeg"], [Buffer.from("<svg/>").toString("base64"), "image/jpeg"], [Buffer.from([255,216,255]).toString("base64"), "image/svg+xml"]]) {
    assert.throws(() => contenidoArchivo(base64, tipo), { code: "invalid-argument" });
  }
  const bytes = Buffer.alloc(MAX_BYTES); bytes.set([255, 216, 255]);
  assert.equal(contenidoArchivo(bytes.toString("base64"), "image/jpeg").length, MAX_BYTES);
  assert.throws(() => contenidoArchivo(Buffer.concat([bytes, Buffer.from([0])]).toString("base64"), "image/jpeg"), { code: "invalid-argument" });
});

test("rechaza destinos manipulados sin escribir archivos", async () => {
  for (const cambio of [{ otId: "../otra" }, { etapa: "../otra" }, { itemIndex: "../otro" }, { subidaId: "inventado" }]) {
    const e = entorno();
    await assert.rejects(subirArchivoOT({ ...e, datos: { ...e.datos, ...cambio } }), { code: "invalid-argument" });
    assert.deepEqual(e.cambios, []);
  }
});
