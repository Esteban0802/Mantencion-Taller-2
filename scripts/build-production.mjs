import { cp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const raiz = process.cwd();
const destino = path.join(raiz, "dist");
const carpetasPublicas = ["css", "img", "js"];
const archivosPublicos = [];

function esRespaldo(nombre) {
  const valor = nombre.toLowerCase();
  return valor.includes(".backup") || valor.includes(".pre-") || valor.endsWith(".log");
}

async function copiarArchivo(origen, destinoArchivo) {
  await mkdir(path.dirname(destinoArchivo), { recursive: true });
  await cp(origen, destinoArchivo);
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

await validarReferenciasLocales();

const incluidos = await readdir(destino);
console.log(`Paquete de producción creado en ${destino}`);
console.log(`Contenido principal: ${incluidos.join(", ")}`);
