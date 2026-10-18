import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const raiz = process.cwd();
const destino = path.join(raiz, "dist");
const carpetasPublicas = ["css", "img", "js"];
const archivosPublicos = [];
const cspGitHubPages = "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.googleapis.com https://*.googleusercontent.com; font-src 'self' data:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com; media-src 'self' blob: https://firebasestorage.googleapis.com https://*.googleapis.com; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests";
const dependenciasPublicas = [
  ["node_modules/chart.js/dist/chart.umd.min.js", "chart.umd.min.js"],
  ["node_modules/xlsx/dist/xlsx.full.min.js", "xlsx.full.min.js"],
  ["node_modules/jspdf/dist/jspdf.umd.min.js", "jspdf.umd.min.js"],
  ["node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js", "jspdf.plugin.autotable.min.js"],
  ["node_modules/html2canvas/dist/html2canvas.min.js", "html2canvas.min.js"]
];
const reemplazosCdn = new Map([
  ["https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js", "vendor/chart.umd.min.js"],
  ["https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", "vendor/xlsx.full.min.js"],
  ["https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", "vendor/jspdf.umd.min.js"],
  ["https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js", "vendor/jspdf.plugin.autotable.min.js"],
  ["https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", "vendor/html2canvas.min.js"]
]);

function esRespaldo(nombre) {
  const valor = nombre.toLowerCase();
  return valor.includes(".backup") || valor.includes(".pre-") || valor.endsWith(".log");
}

async function copiarArchivo(origen, destinoArchivo) {
  await mkdir(path.dirname(destinoArchivo), { recursive: true });
  await cp(origen, destinoArchivo);
}

async function incorporarCspEnHtml(ruta) {
  let contenido = await readFile(ruta, "utf8");
  for (const [externa, local] of reemplazosCdn) contenido = contenido.replaceAll(externa, local);
  if (!/http-equiv=["']Content-Security-Policy["']/i.test(contenido)) {
    if (!/<head(?:\s[^>]*)?>/i.test(contenido)) throw new Error(`No se encontró <head> en ${path.basename(ruta)}.`);
    const meta = `\n  <meta http-equiv="Content-Security-Policy" content="${cspGitHubPages}">`;
    contenido = contenido.replace(/<head(?:\s[^>]*)?>/i, coincidencia => `${coincidencia}${meta}`);
  }
  await writeFile(ruta, contenido, "utf8");
}

async function copiarCarpetaPublica(nombre) {
  const origen = path.join(raiz, nombre);
  const salida = path.join(destino, nombre);
  await cp(origen, salida, {
    recursive: true,
    filter: archivo => !esRespaldo(path.basename(archivo))
  });
}

async function validarReferenciasLocales() {
  const faltantes = [];
  const html = (await readdir(destino)).filter(nombre => nombre.endsWith(".html"));
  const patron = /(?:src|href)=["']([^"'#?]+)["']/g;

  for (const archivo of html) {
    const contenido = await readFile(path.join(destino, archivo), "utf8");
    if (/https:\/\/(?:cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)/i.test(contenido)) {
      throw new Error(`${archivo} conserva una dependencia externa no autorizada.`);
    }
    for (const coincidencia of contenido.matchAll(patron)) {
      const referencia = coincidencia[1];
      if (/^(?:https?:|data:|mailto:|tel:|javascript:)/i.test(referencia)) continue;
      const ruta = path.resolve(destino, referencia.replace(/^\//, ""));
      try {
        await stat(ruta);
      } catch {
        faltantes.push(`${archivo}: ${referencia}`);
      }
    }
  }

  if (faltantes.length) {
    throw new Error(`El paquete contiene referencias locales faltantes:\n${faltantes.join("\n")}`);
  }
}

await rm(destino, { recursive: true, force: true });
await mkdir(destino, { recursive: true });

const raizArchivos = await readdir(raiz, { withFileTypes: true });
for (const entrada of raizArchivos) {
  if (!entrada.isFile() || !entrada.name.endsWith(".html") || esRespaldo(entrada.name)) continue;
  await copiarArchivo(path.join(raiz, entrada.name), path.join(destino, entrada.name));
}

for (const carpeta of carpetasPublicas) await copiarCarpetaPublica(carpeta);
for (const archivo of archivosPublicos) {
  await copiarArchivo(path.join(raiz, archivo), path.join(destino, archivo));
}
for (const [origen, nombre] of dependenciasPublicas) {
  await copiarArchivo(path.join(raiz, origen), path.join(destino, "vendor", nombre));
}

for (const archivo of (await readdir(destino)).filter(nombre => nombre.endsWith(".html"))) {
  await incorporarCspEnHtml(path.join(destino, archivo));
}

await validarReferenciasLocales();

const incluidos = await readdir(destino);
console.log(`Paquete de producción creado en ${destino}`);
console.log(`Contenido principal: ${incluidos.join(", ")}`);
