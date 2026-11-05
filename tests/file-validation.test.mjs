import assert from "node:assert/strict";
import { test } from "node:test";
import { File } from "node:buffer";
import { validarFirmaArchivo } from "../js/file-validation.js";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const codigoImagenes = (await readFile(new URL("../js/modulos/core/imagenes.js", import.meta.url), "utf8")).replaceAll("export ", "");
const codigoStorage = await readFile(new URL("../js/modulos/core/storage.js", import.meta.url), "utf8");
const codigoCarga = codigoStorage.slice(codigoStorage.indexOf("async function subirArchivoStorageInterno("), codigoStorage.indexOf("export async function subirArchivoStorage("));

function cargaConOptimizacion({ compatible = true, bytesSalida = 100 } = {}) {
  const observadas = { dimensiones: [], cuotas: [], cargas: [] };
  const { optimizarFotoParaCarga } = runInNewContext(`${codigoImagenes}\n;({optimizarFotoParaCarga})`, {
    File, console: { warn() {} },
    createImageBitmap: async () => {
      if (!compatible) throw Error("Formato no decodificable");
      return { width: 4000, height: 3000, close() {} };
    },
    FileReader: class { readAsDataURL() { this.onerror(); } },
    document: { createElement: () => {
      if (!compatible) throw Error("Formato no decodificable");
      const canvas = { getContext: () => ({ drawImage() {} }), toBlob: (callback, tipo, calidad) => {
        observadas.dimensiones.push([canvas.width, canvas.height, tipo, calidad]);
        callback(new Blob([Uint8Array.from([255,216,255]), new Uint8Array(bytesSalida - 3)], { type: tipo }));
      } };
      return canvas;
    } }
  });
  const subir = runInNewContext(`${codigoCarga}\n;subirArchivoStorageInterno`, {
    File, Uint8Array, String, crypto: { randomUUID: () => "subida" }, btoa: s => Buffer.from(s, "binary").toString("base64"),
    localStorage: { getItem: () => "ot" }, alert() {},
    tipoContenidoArchivo: f => f.type || ({ jpg: "image/jpeg", pdf: "application/pdf" }[f.name.split(".").at(-1)] || ""),
    TIPOS_EVIDENCIA_OT: new Set(["image/jpeg", "image/png", "image/heic", "application/pdf"]),
    validarFirmaArchivo, optimizarFotoParaCarga,
    validarContextoCarga: async () => ({}),
    validarCuotaAntesDeSubir: async f => observadas.cuotas.push(f.size),
    subirConReintentos: async datos => { observadas.cargas.push(datos); return { url: "https://evidencia" }; }
  });
  return { subir, observadas };
}

test("el flujo dinámico comprime antes de medir cuota y envía JPEG reducido incluso sin MIME original", async () => {
  for (const tipo of ["image/png", ""]) {
    const { subir, observadas } = cargaConOptimizacion();
    const bytes = tipo ? [137,80,78,71,13,10,26,10] : [255,216,255];
    const foto = new File([Uint8Array.from(bytes), new Uint8Array(2000)], tipo ? "foto.png" : "foto.jpg", { type: tipo });
    await subir(foto, "personalizada_entrada", 0);
    assert.equal(observadas.cuotas[0], 100);
    assert.deepEqual(Array.from(observadas.dimensiones[0]), [1280,960,"image/jpeg",0.72]);
    assert.equal(observadas.cargas[0].contentType, "image/jpeg");
    assert.equal(observadas.cargas[0].nombre, "foto.jpg");
    assert.equal(Buffer.from(observadas.cargas[0].base64, "base64").length, 100);
  }
});

test("PDF, fotos incompatibles y fotos que no reducen su tamaño conservan sus bytes", async () => {
  for (const caso of [
    { archivo: new File(["%PDF-1.7"], "manual.pdf", { type: "application/pdf" }) },
    { archivo: new File([Uint8Array.from([255,216,255]), new Uint8Array(200)], "foto.jpg", { type: "image/jpeg" }), compatible: false },
    { archivo: new File([Uint8Array.from([255,216,255])], "foto.jpg", { type: "image/jpeg" }), bytesSalida: 100 }
  ]) {
    const { subir, observadas } = cargaConOptimizacion(caso);
    await subir(caso.archivo, "personalizada_revision", 0);
    assert.equal(observadas.cuotas[0], caso.archivo.size);
    assert.equal(observadas.cargas[0].base64, Buffer.from(await caso.archivo.arrayBuffer()).toString("base64"));
    assert.equal(observadas.cargas[0].contentType, caso.archivo.type);
  }
});

test("la optimización no permite eludir firmas ni el máximo de 20 MiB de entrada", async () => {
  const { subir, observadas } = cargaConOptimizacion();
  await assert.rejects(subir(new File(["<html>"], "falsa.jpg", { type: "image/jpeg" }), "personalizada_entrada", 0), /no coincide/);
  await assert.rejects(subir(new File([new Uint8Array(20*1024*1024+1)], "grande.jpg", { type: "image/jpeg" }), "personalizada_entrada", 0), /máximo/);
  assert.equal(observadas.cargas.length, 0);
  assert.equal(observadas.cuotas.length, 0);
});

function archivo(bytes, nombre, tipo) {
  return new File([Uint8Array.from(bytes)], nombre, { type: tipo });
}

test("acepta una imagen JPEG con firma válida", async () => {
  await validarFirmaArchivo(archivo([0xff, 0xd8, 0xff, 0xe0], "foto.jpg", "image/jpeg"));
});

test("rechaza un ejecutable renombrado como JPEG", async () => {
  await assert.rejects(
    validarFirmaArchivo(archivo([0x4d, 0x5a, 0x90, 0x00], "foto.jpg", "image/jpeg")),
    /no coincide con su formato/
  );
});

test("acepta PDF con firma válida", async () => {
  await validarFirmaArchivo(new File(["%PDF-1.7\n"], "documento.pdf", { type: "application/pdf" }));
});

test("rechaza HTML renombrado como PDF", async () => {
  await assert.rejects(
    validarFirmaArchivo(new File(["<html></html>"], "documento.pdf", { type: "application/pdf" })),
    /no coincide con su formato/
  );
});

test("acepta contenedor XLSX que contiene la estructura xl", async () => {
  const contenido = [0x50, 0x4b, 0x03, 0x04, ...Buffer.from("[Content_Types].xml xl/workbook.xml")];
  await validarFirmaArchivo(archivo(contenido, "plantilla.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
});

test("rechaza ZIP genérico renombrado como XLSX", async () => {
  const contenido = [0x50, 0x4b, 0x03, 0x04, ...Buffer.from("archivo.txt")];
  await assert.rejects(
    validarFirmaArchivo(archivo(contenido, "plantilla.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")),
    /no coincide con su formato/
  );
});

