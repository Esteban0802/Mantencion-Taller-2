import assert from "node:assert/strict";
import test from "node:test";

import { evaluarCuotaStorage } from "../js/storage-quota.js";

const GB = 1024 * 1024 * 1024;

test("permite una carga bajo el 80 por ciento", () => {
  const resultado = evaluarCuotaStorage({ usadoBytes: 3 * GB, maxStorageGB: 5, nuevoBytes: 0 });
  assert.equal(resultado.permitido, true);
  assert.equal(resultado.nivel, "normal");
});

test("avisa al alcanzar el 80 por ciento", () => {
  const resultado = evaluarCuotaStorage({ usadoBytes: 4 * GB, maxStorageGB: 5, nuevoBytes: 0 });
  assert.equal(resultado.permitido, true);
  assert.equal(resultado.nivel, "preventivo");
});

test("genera advertencia crítica desde el 90 por ciento", () => {
  const resultado = evaluarCuotaStorage({ usadoBytes: 4.5 * GB, maxStorageGB: 5, nuevoBytes: 0 });
  assert.equal(resultado.permitido, true);
  assert.equal(resultado.nivel, "critico");
});

test("bloquea una carga que alcanza exactamente el total contratado", () => {
  const resultado = evaluarCuotaStorage({ usadoBytes: 4 * GB, maxStorageGB: 5, nuevoBytes: GB });
  assert.equal(resultado.permitido, false);
  assert.equal(resultado.nivel, "bloqueado");
});

test("bloquea una carga que supera el total contratado", () => {
  const resultado = evaluarCuotaStorage({ usadoBytes: 5 * GB, maxStorageGB: 5, nuevoBytes: 1 });
  assert.equal(resultado.permitido, false);
  assert.equal(resultado.nivel, "bloqueado");
});
