import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const leer = ruta => readFile(new URL(`../${ruta}`, import.meta.url), "utf8");

test("el Jefe de Taller conserva sus accesos al cambiar de módulo", async () => {
  const [preload, inventario, programacion, sheq] = await Promise.all([
    leer("js/sidebar-preload.js"),
    leer("inventario.html"),
    leer("programacion.html"),
    leer("sheq.html")
  ]);

  assert.match(preload, /jefe_taller:\s*\[[^\]]*"inventario"[^\]]*"sheq"[^\]]*"programacion"[^\]]*"nueva"/);
  assert.match(inventario, /id="menuNuevaOTInventario"/);
  assert.match(programacion, /id="menuNuevaOTProgramacion"/);
  assert.match(sheq, /id="menuNuevaOTSheq"/);
});

test("el Administrador de Sucursal conserva su Panel Empresa", async () => {
  const [inventario, programacion] = await Promise.all([
    leer("js/inventario.js"),
    leer("js/programacion.js")
  ]);

  assert.match(inventario, /\["super_admin", "admin_empresa", "admin_sucursal"\]/);
  assert.match(programacion, /\["super_admin", "admin_empresa", "admin_sucursal"\]/);
});
