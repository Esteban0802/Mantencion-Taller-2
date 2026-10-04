import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

const origen = process.env.HOSTING_ORIGIN || "http://127.0.0.1:5000";
const paginas = [
  "/",
  "/dashboard.html",
  "/empresa-admin.html",
  "/flujo.html",
  "/inventario.html",
  "/sheq.html",
  "/ordenes.html",
  "/super-admin.html",
  "/cambiar-password.html",
];

for (const ruta of paginas) {
  test(`Hosting entrega ${ruta}`, async () => {
    const respuesta = await fetch(`${origen}${ruta}`);
    assert.equal(respuesta.status, 200);
    assert.match(respuesta.headers.get("content-type") || "", /text\/html/);
  });
}

test("la configuración incluye los encabezados de seguridad", async () => {
  const configuracion = JSON.parse(await readFile("firebase.json", "utf8"));
  const encabezados = configuracion.hosting.headers
    .flatMap(regla => regla.headers)
    .map(({ key, value }) => `${key}:${value}`);
  assert.ok(encabezados.includes("X-Content-Type-Options:nosniff"));
  assert.ok(encabezados.includes("X-Frame-Options:SAMEORIGIN"));
  assert.ok(encabezados.includes("Referrer-Policy:strict-origin-when-cross-origin"));
  assert.ok(encabezados.includes("Permissions-Policy:camera=(self), microphone=(), geolocation=()"));
});

test("Hosting no publica la configuración interna", async () => {
  for (const ruta of ["/firebase.json", "/.htaccess", "/package.json"]) {
    const respuesta = await fetch(`${origen}${ruta}`);
    assert.equal(respuesta.status, 404, `${ruta} no debe ser público`);
  }
});
