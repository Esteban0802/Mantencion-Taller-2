import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const leer = ruta => readFile(new URL(`../${ruta}`, import.meta.url), "utf8");

test("el menú de empresa oculta la operación al Super Admin", async () => {
  const codigo = await leer("js/empresa-admin.js");
  assert.match(codigo, /const esSuperAdmin = usuarioActivo\.rol === "super_admin"/);
  for (const id of ["menuSistemaOperacional", "menuProgramacionEmpresa", "menuSheqEmpresa"]) {
    assert.match(codigo, new RegExp(`"${id}"`));
  }
  assert.match(codigo, /elemento\.hidden = esSuperAdmin/);
  assert.match(codigo, /elemento\.style\.display = esSuperAdmin \? "none" : ""/);
  assert.match(codigo, /aplicarModulosEnInterfaz\(empresaActual\);\s*configurarMenuSegunRol\(\);/);
  assert.match(codigo, /usuarioActivo\.rol === "admin_empresa" \? `/);
});

test("el Super Admin no puede abrir rutas operativas directamente", async () => {
  const archivos = [
    "js/dashboard.js",
    "js/ordenes.js",
    "js/inventario.js",
    "js/programacion.js",
    "js/sheq.js",
    "js/app.js"
  ];

  for (const archivo of archivos) {
    const codigo = await leer(archivo);
    const declaracion = codigo.match(/const usuario = protegerPagina\(\[([\s\S]*?)\]\);/);
    assert.ok(declaracion, `${archivo} debe proteger su acceso por rol`);
    assert.doesNotMatch(declaracion[1], /super_admin/, `${archivo} no debe admitir al Super Admin`);
  }
});

test("la precarga del menú no expone módulos operativos al Super Admin", async () => {
  const codigo = await leer("js/sidebar-preload.js");
  assert.match(codigo, /super_admin:\s*\[\]/);
});

test("las Cloud Functions no habilitan operaciones empresariales al Super Admin", async () => {
  const codigo = await leer("functions/index.js");
  const exportacion = codigo.match(/exports\.generarExportacionEmpresa[\s\S]*?exports\.publicarProgramacion/);
  const programacion = codigo.match(/exports\.publicarProgramacion[\s\S]*?exports\.limpiarExportacionesExpiradas/);
  assert.ok(exportacion, "debe existir la función de exportación");
  assert.ok(programacion, "debe existir la función de publicación");
  assert.doesNotMatch(exportacion[0], /solicitante\.rol\s*!==\s*"super_admin"/);
  assert.doesNotMatch(programacion[0], /solicitante\.rol\s*!==\s*"super_admin"/);
});

test("las reglas no incluyen al Super Admin en accesos operacionales", async () => {
  const [firestore, storage] = await Promise.all([
    leer("firestore.rules"),
    leer("storage.rules"),
  ]);
  for (const funcion of ["canReadBranchData", "canReadSheq", "canManageSheq", "canManageProgramming", "canReadProgrammingDraft"]) {
    const bloque = firestore.match(new RegExp(`function ${funcion}\\([^)]*\\) \\{([\\s\\S]*?)\\n    \\}`));
    assert.ok(bloque, `debe existir ${funcion}`);
    assert.doesNotMatch(bloque[1], /isSuperAdmin/);
  }
  for (const funcion of ["canAccessOT", "canManageOT", "canReadSheq", "canManageSheq", "canReadInventory", "canManageInventory"]) {
    const bloque = storage.match(new RegExp(`function ${funcion}\\([^)]*\\) \\{([\\s\\S]*?)\\n    \\}`));
    assert.ok(bloque, `debe existir ${funcion}`);
    assert.doesNotMatch(bloque[1], /isSuperAdmin/);
  }
});
