import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const flujo = await readFile(new URL("../flujo.html", import.meta.url), "utf8");

test("el flujo de la OT no ofrece cargas locales de checklist o repuestos", () => {
  const elementosObsoletos = [
    "excelIngreso",
    "excelEvaluacion",
    "excelOverhaul",
    "excelPruebas",
    "excelRepuestos",
    "cargarIngreso()",
    "cargarEvaluacion()",
    "cargarOverhaul()",
    "cargarChecklist(",
    "cargarRepuestosExcel()",
    "Cargar listado de repuestos"
  ];

  elementosObsoletos.forEach(elemento => {
    assert.equal(
      flujo.includes(elemento),
      false,
      `flujo.html no debe volver a incluir ${elemento}`
    );
  });
});
