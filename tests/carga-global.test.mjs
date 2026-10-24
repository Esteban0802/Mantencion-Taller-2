import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const leer = ruta => readFile(new URL(`../${ruta}`, import.meta.url), "utf8");

test("todas las pantallas principales cargan el indicador global", async () => {
  const paginas = [
    "dashboard.html", "flujo.html", "ordenes.html", "inventario.html",
    "programacion.html", "sheq.html", "empresa-admin.html", "super-admin.html"
  ];

  for (const pagina of paginas) {
    const html = await leer(pagina);
    assert.match(html, /js\/components\/notificaciones\.js\?v=20261022-3/, pagina);
  }
});

test("los botones internos del sidebar no dejan una carga global bloqueada", async () => {
  const codigo = await leer("js/components/notificaciones.js");
  assert.doesNotMatch(codigo, /closest\("\.sidebar li:not\(\.active\)"\)/);
});

test("cada módulo principal finaliza su carga inicial", async () => {
  const modulos = [
    "js/dashboard.js", "js/app.js", "js/ordenes.js", "js/inventario.js",
    "js/programacion.js", "js/sheq.js", "js/empresa-admin.js", "js/super-admin.js"
  ];

  for (const modulo of modulos) {
    const codigo = await leer(modulo);
    assert.match(codigo, /finalizarCargaPagina/, modulo);
  }
});
