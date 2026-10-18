import assert from "node:assert/strict";
import { test } from "node:test";
import { File } from "node:buffer";
import { validarFirmaArchivo } from "../js/file-validation.js";

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

