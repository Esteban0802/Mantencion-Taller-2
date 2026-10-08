import assert from "node:assert/strict";
import test from "node:test";

import { estadoDocumentoAcreditacion, evaluarEntidadEnContrato, evaluarRequisito } from "../js/sheq-acreditacion.js";

const hoy = new Date("2026-10-03T12:00:00");
const contrato = {
  id: "contrato-a",
  requisitosPersonal: ["Examen ocupacional", "Inducción del mandante"],
  requisitosVehiculos: ["Revisión técnica"]
};

test("no acredita cuando falta un requisito obligatorio", () => {
  const resultado = evaluarEntidadEnContrato({
    tipo: "persona",
    entidadId: "persona-a",
    contrato,
    hoy,
    documentos: [{ entidadTipo: "persona", entidadId: "persona-a", tipoDocumento: "Examen ocupacional", estado: "aprobado", fechaVencimiento: "2027-01-01" }]
  });
  assert.equal(resultado.key, "vencido");
  assert.equal(resultado.texto, "No acreditado");
  assert.equal(resultado.detalles[1].key, "faltante");
});

test("un documento general vigente puede acreditar varias faenas", () => {
  const documentos = [{ entidadTipo: "persona", entidadId: "persona-a", tipoDocumento: "EXAMEN OCUPACIONAL", estado: "aprobado", fechaVencimiento: "2027-02-01", contratoId: "" }];
  const resultado = evaluarRequisito("Examen ocupacional", documentos, "contrato-b", hoy);
  assert.equal(resultado.key, "vigente");
});

test("un documento de otra faena no satisface el requisito", () => {
  const documentos = [{ entidadTipo: "persona", entidadId: "persona-a", tipoDocumento: "Examen ocupacional", estado: "aprobado", fechaVencimiento: "2027-01-01", contratoId: "contrato-b" }];
  const resultado = evaluarRequisito("Examen ocupacional", documentos, "contrato-a", hoy);
  assert.equal(resultado.key, "faltante");
});

test("informa observación cuando un requisito está próximo a vencer", () => {
  const resultado = evaluarEntidadEnContrato({
    tipo: "persona",
    entidadId: "persona-a",
    contrato: { ...contrato, requisitosPersonal: ["Examen ocupacional"] },
    hoy,
    documentos: [{ entidadTipo: "persona", entidadId: "persona-a", tipoDocumento: "Examen ocupacional", estado: "aprobado", fechaVencimiento: "2026-10-20" }]
  });
  assert.equal(resultado.key, "proximo");
  assert.equal(resultado.texto, "Con observaciones");
});

test("genera una alerta temprana desde 90 días antes del vencimiento", () => {
  const aNoventaDias = estadoDocumentoAcreditacion({ estado: "aprobado", fechaVencimiento: "2027-01-01" }, hoy);
  const aNoventaYUnDias = estadoDocumentoAcreditacion({ estado: "aprobado", fechaVencimiento: "2027-01-02" }, hoy);
  assert.equal(aNoventaDias.key, "aviso");
  assert.equal(aNoventaDias.dias, 90);
  assert.equal(aNoventaYUnDias.key, "vigente");
});

test("la vigencia se calcula por fecha aunque el registro antiguo figure pendiente", () => {
  const hoy = new Date("2026-10-03T12:00:00");
  const estado = estadoDocumentoAcreditacion({ estado: "pendiente", fechaVencimiento: "2027-02-01" }, hoy);
  assert.equal(estado.key, "vigente");
  assert.equal(estado.texto, "Vigente");
});

test("prefiere un documento vigente sobre una copia histórica vencida", () => {
  const documentos = [
    { entidadTipo: "persona", entidadId: "persona-a", tipoDocumento: "Examen ocupacional", estado: "aprobado", fechaVencimiento: "2026-01-01" },
    { entidadTipo: "persona", entidadId: "persona-a", tipoDocumento: "Examen ocupacional", estado: "aprobado", fechaVencimiento: "2027-02-01" }
  ];
  assert.equal(evaluarRequisito("Examen ocupacional", documentos, "contrato-a", hoy).key, "vigente");
});
