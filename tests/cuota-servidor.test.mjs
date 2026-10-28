import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dbMemoria } from "./helpers/db-memoria.mjs";
import { resumenAlmacenamiento, renderIndicadorAlmacenamiento } from "../js/storage-indicador.js";
const { reservarCuota, actualizarReserva, subirConCuota } = createRequire(import.meta.url)("../functions/cuota-storage.js");
const { subirArchivoEmpresa } = createRequire(import.meta.url)("../functions/archivos-empresa.js");
function entorno() {
  const empresa = { activa: true, storageCuotaVersion: 1, storageUsadoBytes: 0, storageReservadoBytes: 0, maxStorageGB: 10 / 1024 ** 3 };
  return { empresa, db: dbMemoria({ "empresas/e": empresa }), empresaId: "e", ruta: "ots/ot/foto", bytes: 6, uid: "u", hash: "hash" };
}

test("las cargas concurrentes comparten una reserva atómica y no superan el límite", async () => {
  const e = entorno();
  const resultados = await Promise.allSettled([reservarCuota(e), reservarCuota({ ...e, ruta: "ots/ot/otra" })]);
  assert.equal(resultados.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(resultados.find(r => r.status === "rejected").reason.code, "resource-exhausted");
  assert.equal(e.empresa.storageReservadoBytes, 6);
  assert.equal(e.empresa.storageUsadoBytes, 0);
});

test("confirmaciones y eliminaciones repetidas o fuera de orden no duplican el uso", async () => {
  const e = entorno(), id = await reservarCuota(e);
  await reservarCuota(e);
  assert.equal(e.empresa.storageReservadoBytes, 6);
  await actualizarReserva({ ...e, id }); await actualizarReserva({ ...e, id });
  assert.equal(e.empresa.storageUsadoBytes, 6); assert.equal(e.empresa.storageArchivos, 1);
  assert.equal(e.empresa.storageReservadoBytes, 0);
  await actualizarReserva({ ...e, id, eliminar: true }); await actualizarReserva({ ...e, id, eliminar: true });
  await actualizarReserva({ ...e, id });
  assert.equal(e.empresa.storageUsadoBytes, 0); assert.equal(e.empresa.storageArchivos, 0);
  const otro = entorno(), otroId = await reservarCuota(otro);
  await actualizarReserva({ ...otro, id: otroId, eliminar: true });
  await actualizarReserva({ ...otro, id: otroId });
  assert.equal(otro.empresa.storageUsadoBytes, 0); assert.equal(otro.empresa.storageReservadoBytes, 0);
});

test("cuenta uso anterior y reservas; rechaza llegar al límite y datos sin medir", async () => {
  for (const cambiar of [e => { e.empresa.storageUsadoBytes = 4; }, e => { e.empresa.storageReservadoBytes = 4; }]) {
    const e = entorno(); cambiar(e);
    await assert.rejects(reservarCuota(e), { code: "resource-exhausted" });
  }
  for (const cambiar of [e => { delete e.empresa.storageCuotaVersion; }, e => { e.empresa.storageRecalculando = 123; }]) {
    const e = entorno(); cambiar(e);
    await assert.rejects(reservarCuota(e), { code: "failed-precondition" });
    assert.equal(e.empresa.storageReservadoBytes, 0);
  }
});

test("un fallo confirmado de carga libera la reserva y un resultado desconocido la conserva", async () => {
  for (const codigo of [404, 503]) {
    const e = entorno();
    const bucket = { file: () => ({ save: async () => { throw Object.assign(new Error("Fallo"), { code: 503 }); },
      getMetadata: async () => { throw Object.assign(new Error("Consulta"), { code: codigo }); } }) };
    await assert.rejects(subirConCuota({ ...e, bytes: Buffer.alloc(6), bucket, verificar: async () => {} }));
    assert.equal(e.empresa.storageReservadoBytes, codigo === 404 ? 0 : 6);
    assert.equal(e.empresa.storageUsadoBytes, 0);
  }
});

test("todos los grupos de archivos de empresa usan la cuota y respetan los roles", async () => {
  const casos = [
    ["admin_empresa", "informe/logo.png", "image/png", Buffer.from([137,80,78,71,13,10,26,10])],
    ["admin_empresa", "plantillas/p.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Buffer.from([80,75,3,4,120,108,47])],
    ["sheq", "sheq/documento.pdf", "application/pdf", Buffer.from("%PDF-1.4")],
    ["jefe_taller", "inventario/s/documento.pdf", "application/pdf", Buffer.from("%PDF-1.4")]
  ];
  for (const [rol, ruta, contentType, bytes] of casos) {
    const e = entorno(); e.empresa.storageUsadoBytes = 9;
    const usuario = { uid: "u", activo: true, empresaId: "e", sucursalId: "s", rol };
    const datos = { ruta: `empresas/e/${ruta}`, contentType, base64: bytes.toString("base64") };
    const bucket = { file: () => { throw new Error("No debe llegar a Storage"); } };
    // La reserva se rechaza antes de guardar: comprobar con un archivo sin efectos.
    const sinGuardar = { file: () => ({ save: async () => { throw new Error("No debe guardar"); } }) };
    await assert.rejects(subirArchivoEmpresa({ db: e.db, bucket: sinGuardar, usuario, datos }), { code: "resource-exhausted" });
    await assert.rejects(subirArchivoEmpresa({ db: e.db, bucket, usuario: { ...usuario, rol: "tecnico" }, datos }), { code: "permission-denied" });
  }
});

test("el visor muestra usado, disponible, reservas y avisos sin ocultar exceso de cuota", () => {
  const base = { storageCuotaVersion: 1, maxStorageGB: 1, storageUsadoBytes: .8 * 1024 ** 3, storageReservadoBytes: .1 * 1024 ** 3 };
  const resumen = resumenAlmacenamiento(base);
  assert.equal(resumen.nivel, "critico"); assert.ok(Math.abs(resumen.disponible - .1 * 1024 ** 3) < 1);
  assert.match(renderIndicadorAlmacenamiento(base), /en cargas pendientes/);
  assert.match(renderIndicadorAlmacenamiento({ ...base, storageUsadoBytes: 1.2 * 1024 ** 3, storageReservadoBytes: 0 }), /120.0%/);
  assert.match(renderIndicadorAlmacenamiento({}), /Medición pendiente/);
  assert.doesNotMatch(renderIndicadorAlmacenamiento({}), /0 B.*usados/);
  assert.match(renderIndicadorAlmacenamiento({ ...base, maxStorageGB: 0 }), /Sin límite definido/);
});
