import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { validarEvidenciasOT, rutaArchivoOT } = createRequire(import.meta.url)("../functions/evidencias-ot.js");

const usuario = { uid: "yo" };
const url = nombre => `https://firebasestorage.googleapis.com/v0/b/bucket/o/${encodeURIComponent(`ots/ot/ingreso/${nombre}`)}?alt=media&token=token`;
const propio = url("propio.pdf");
const ajeno = url("ajeno.pdf");
const antiguo = url("antiguo.pdf");
const opciones = { otId: "ot", bucketName: "bucket", obtenerAutorArchivo: async ruta => ruta.endsWith("propio.pdf") ? "yo" : ruta.endsWith("ajeno.pdf") ? "otro" : "" };
const ubicaciones = {
  ingreso: fotos => ({ ingreso: [{ fotos }] }),
  evaluacion: fotos => ({ evaluacion: [{ fotos }] }),
  overhaul: fotos => ({ overhaul: [{ fotos }] }),
  pruebasGeneral: fotos => ({ pruebas: { general: [{ fotos }] } }),
  pruebasMecanicas: fotos => ({ pruebas: { mecanico: [{ fotos }] } }),
  pruebasElectricas: fotos => ({ pruebas: { electrico: [{ fotos }] } }),
  despachoPreparacion: fotos => ({ despacho: { preparacion: fotos.map(url => ({ url, nombre: "Archivo" })) } }),
  despachoFinal: fotos => ({ despacho: { final: fotos.map(url => ({ url, nombre: "Archivo" })) } }),
  decisionEvaluacion: fotos => ({ decisionEvaluacion: { documentos: fotos.map(url => ({ url })) } }),
  decisionMantencion: fotos => ({ decisionMantencion: { documentos: fotos.map(url => ({ url })) } }),
  decisionPruebas: fotos => ({ decisionPruebas: { documentos: fotos.map(url => ({ url })) } }),
  decisionDespacho: fotos => ({ decisionDespacho: { documentos: fotos.map(url => ({ url })) } })
};

for (const [nombre, datos] of Object.entries(ubicaciones)) {
  test(`${nombre}: permite adjuntar y quitar propios y conserva ajenos`, async () => {
    await validarEvidenciasOT(datos([ajeno]), datos([ajeno, propio]), usuario, opciones);
    await validarEvidenciasOT(datos([ajeno, propio]), datos([ajeno]), usuario, opciones);
    await assert.rejects(validarEvidenciasOT(datos([ajeno]), datos([]), usuario, opciones));
    await assert.rejects(validarEvidenciasOT(datos([ajeno]), {}, usuario, opciones));
    await assert.rejects(validarEvidenciasOT(datos([]), datos([ajeno]), usuario, opciones));
  });
}

test("no usa autoría enviada dentro del documento ni permite reclamar archivos antiguos", async () => {
  await assert.rejects(validarEvidenciasOT({}, { despacho: { final: [{ url: ajeno, creadoPorUid: "yo" }] } }, usuario, opciones));
  await assert.rejects(validarEvidenciasOT(ubicaciones.ingreso([antiguo]), {}, usuario, opciones));
  await validarEvidenciasOT(ubicaciones.ingreso([antiguo]), ubicaciones.ingreso([antiguo, propio]), usuario, opciones);
});

test("no admite archivos de otra OT, otro bucket o servidores externos", async () => {
  for (const invalida of [propio.replace("/b/bucket/", "/b/otro/"), url("x").replace("ots%2Fot%2F", "ots%2Fotra%2F"), "https://example.com/a.pdf", "gs://bucket/ots/ot/a.pdf"]) {
    await assert.rejects(validarEvidenciasOT({}, ubicaciones.ingreso([invalida]), usuario, opciones));
  }
  assert.equal(rutaArchivoOT(propio, "bucket", "ot"), "ots/ot/ingreso/propio.pdf");
});

test("impide sustituir datos de una evidencia ajena o cambiar su token", async () => {
  const antes = { despacho: { final: [{ url: ajeno, nombre: "Original" }] } };
  await assert.rejects(validarEvidenciasOT(antes, { despacho: { final: [{ url: ajeno, nombre: "Alterado" }] } }, usuario, opciones));
  await assert.rejects(validarEvidenciasOT(ubicaciones.ingreso([ajeno]), ubicaciones.ingreso([ajeno.replace("token=token", "token=otro")]), usuario, opciones));
});

test("preserva enlaces antiguos sin consultar metadata y falla cerrado si Storage no responde", async () => {
  await validarEvidenciasOT(ubicaciones.ingreso(["https://antiguo.example/foto.jpg"]), ubicaciones.ingreso(["https://antiguo.example/foto.jpg"]), usuario);
  await assert.rejects(validarEvidenciasOT(ubicaciones.ingreso([propio]), {}, usuario, { ...opciones, obtenerAutorArchivo: async () => { throw new Error("No disponible"); } }));
  await assert.rejects(validarEvidenciasOT({}, ubicaciones.ingreso([propio]), usuario));
});

test("reordenar evidencias no borra ni atribuye evidencias ajenas", async () => {
  await validarEvidenciasOT(ubicaciones.ingreso([ajeno, propio]), ubicaciones.ingreso([propio, ajeno]), usuario, opciones);
  await assert.rejects(validarEvidenciasOT(ubicaciones.ingreso([ajeno]), ubicaciones.ingreso([ajeno, ajeno]), usuario, opciones));
});
