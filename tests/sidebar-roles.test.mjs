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

test("el Planificador conserva Inventario y SHEQ al navegar entre módulos", async () => {
  const [preload, inventarioJs, programacionJs, sheqJs, reglasFirestore, reglasStorage] = await Promise.all([
    leer("js/sidebar-preload.js"),
    leer("js/inventario.js"),
    leer("js/programacion.js"),
    leer("js/sheq.js"),
    leer("firestore.rules"),
    leer("storage.rules")
  ]);

  assert.match(preload, /planificador:\s*\[[^\]]*"inventario"[^\]]*"sheq"[^\]]*"programacion"/);
  assert.match(programacionJs, /actualizarNavegacionProgramacion\(\);\s*\n\s*await cargarUsuariosYSucursales/);
  assert.match(programacionJs, /menuSheqProgramacion[\s\S]*?"planificador"/);
  assert.match(programacionJs, /menuInventarioProgramacion[\s\S]*?"planificador"/);
  assert.match(inventarioJs, /puedeEditar\s*=\s*\[[^\]]*"jefe_taller"[^\]]*"planificador"/);
  assert.match(sheqJs, /const rolesEdicion\s*=\s*\["sheq"\]/);
  assert.match(reglasFirestore, /hasRole\(\['jefe_taller', 'planificador'\]\)/);
  assert.match(reglasFirestore, /function canReadSheq[\s\S]*?'planificador'/);
  assert.match(reglasFirestore, /function canManageSheq[\s\S]*?hasRole\(\['sheq'\]\)/);
  assert.match(reglasStorage, /function canManageInventory[\s\S]*?'jefe_taller', 'planificador'/);
});

test("el Administrador de Sucursal conserva su Panel Empresa", async () => {
  const [inventario, programacion] = await Promise.all([
    leer("js/inventario.js"),
    leer("js/programacion.js")
  ]);

  assert.match(inventario, /\["super_admin", "admin_empresa", "admin_sucursal"\]/);
  assert.match(programacion, /\["super_admin", "admin_empresa", "admin_sucursal"\]/);
});
