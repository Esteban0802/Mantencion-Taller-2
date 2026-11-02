import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { dbMemoria } from "./helpers/db-memoria.mjs";
const { rutasDocumento, limpiarDocumentoSheq, limpiarVehiculoSheq } = createRequire(import.meta.url)("../functions/limpieza-sheq.js");

function entornoLimpiezaSheq(tipo='persona') {
  const prefix=`empresas/e/sheq/${tipo}/entidad/`;
  const anterior={empresaId:'e',entidadTipo:tipo,entidadId:'entidad',archivoRuta:prefix+'actual.pdf',observaciones:'Nota',historial:[{archivoRuta:prefix+'anterior.jpg',observaciones:'Nota histórica'}]};
  const db=dbMemoria({'empresas/e':{storageUsadoBytes:20,storageArchivos:2}});
  const archivos=new Map();
  for(const [i,ruta] of [...rutasDocumento(anterior,'bucket')].entries()){
    archivos.set(ruta,{generation:'1',metadata:{cuotaEmpresaId:'e',cuotaReservaId:'r'+i}});
    db.documentos.set('empresas/e/reservasAlmacenamiento/r'+i,{bytes:10,estado:'confirmada'});
  }
  archivos.set('empresas/otra/sheq/persona/entidad/ajeno.pdf',{});
  let fallo=false;
  const bucket={name:'bucket',getFiles:async({prefix})=>[[...archivos.keys()].filter(name=>name.startsWith(prefix)).map(name=>({name}))],
    file:ruta=>({getMetadata:async()=>{if(!archivos.has(ruta))throw Object.assign(Error('No existe'),{code:404});return [archivos.get(ruta)];},
      delete:async()=>{archivos.delete(ruta);if(fallo)throw Error('Respuesta perdida');}})};
  return {db,bucket,anterior,actual:undefined,archivos,fallar:v=>{fallo=v;}};
}

test('eliminación SHEQ retira archivo vigente e históricos y libera cuota sin tocar otra empresa',async()=>{
  const e=entornoLimpiezaSheq();await limpiarDocumentoSheq(e);
  assert.equal(e.archivos.size,1);
  assert.equal(e.db.documentos.get('empresas/e').storageUsadoBytes,0);
  await limpiarDocumentoSheq(e);
  assert.equal(e.db.documentos.get('empresas/e').storageArchivos,0);
});

test('actualizar SHEQ conserva versiones históricas; purgar una versión elimina únicamente su archivo',async()=>{
  const e=entornoLimpiezaSheq();
  e.actual={...e.anterior,archivoRuta:'empresas/e/sheq/persona/entidad/nuevo.pdf',historial:[...e.anterior.historial,{archivoRuta:e.anterior.archivoRuta}]};
  e.db.documentos.set('sheqDocumentos/doc',e.actual);
  await limpiarDocumentoSheq(e);assert.equal(e.archivos.size,3);
  const antes=structuredClone(e.actual);
  e.actual.historial=e.actual.historial.slice(1);
  await limpiarDocumentoSheq({...e,anterior:antes});
  assert.equal(e.archivos.has(e.anterior.historial[0].archivoRuta),false);
  assert.equal(e.archivos.has(e.anterior.archivoRuta),true);
});

test('SHEQ conserva archivos referenciados por otro documento y rechaza rutas de inventario y otras empresas',async()=>{
  const e=entornoLimpiezaSheq();e.db.documentos.set('sheqDocumentos/compartido',e.anterior);
  await limpiarDocumentoSheq(e);assert.equal(e.archivos.size,3);
  await limpiarDocumentoSheq({...e,anterior:{empresaId:'e',archivoRuta:'empresas/otra/sheq/persona/entidad/ajeno.pdf',historial:[{archivoRuta:'empresas/e/inventario/s/archivo.jpg'}]}});
  assert.equal(e.archivos.size,3);
});

test('SHEQ reintenta un fallo posterior al borrado sin descontar cuota dos veces',async()=>{
  const e=entornoLimpiezaSheq();e.fallar(true);
  await assert.rejects(limpiarDocumentoSheq(e));
  assert.equal(e.db.documentos.get('empresas/e').storageUsadoBytes,20);
  e.fallar(false);await limpiarDocumentoSheq(e);
  assert.equal(e.db.documentos.get('empresas/e').storageUsadoBytes,0);
});

test('retirar observaciones sin retirar archivos no realiza operaciones de Storage',async()=>{
  const e=entornoLimpiezaSheq();
  e.actual={...e.anterior,observaciones:''};
  await limpiarDocumentoSheq({...e,bucket:{name:'bucket',file:()=>{throw Error('No debe tocar archivos');}}});
  assert.equal(e.archivos.size,3);
  assert.equal(e.db.documentos.get('empresas/e').storageUsadoBytes,20);
});

test('vehículo eliminado conserva el listado de archivos para completar un reintento',async()=>{
  const e=entornoLimpiezaSheq('vehiculo');e.fallar(true);
  await assert.rejects(limpiarVehiculoSheq({...e,vehiculoId:'entidad'}));
  e.fallar(false);await limpiarVehiculoSheq({...e,vehiculoId:'entidad'});
  assert.equal(e.db.documentos.get('empresas/e').storageUsadoBytes,0);
  assert.equal(e.archivos.size,1);
  const protegido=entornoLimpiezaSheq('vehiculo');protegido.db.documentos.set('sheqVehiculos/entidad',{empresaId:'e'});
  await limpiarVehiculoSheq({...protegido,vehiculoId:'entidad'});
  assert.equal(protegido.archivos.size,3);
});

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

test("un documento nuevo pendiente no acredita hasta ser validado", () => {
  const estado = estadoDocumentoAcreditacion({ estado: "pendiente", validacionExplicita: true, fechaVencimiento: "2027-02-01" }, hoy);
  assert.equal(estado.key, "vencido");
  assert.equal(estado.texto, "Pendiente de validación");
});

test("un examen observado muestra aptitud con restricciones", () => {
  const estado = estadoDocumentoAcreditacion({ estado: "observado", validacionExplicita: true, fechaVencimiento: "2027-02-01" }, hoy);
  assert.equal(estado.key, "proximo");
  assert.equal(estado.texto, "Apto con restricciones");
});

test("un documento rechazado no acredita aunque conserve vigencia", () => {
  const estado = estadoDocumentoAcreditacion({ estado: "rechazado", validacionExplicita: true, fechaVencimiento: "2027-02-01" }, hoy);
  assert.equal(estado.key, "vencido");
  assert.equal(estado.texto, "No acreditado");
});

test("prefiere un documento vigente sobre una copia histórica vencida", () => {
  const documentos = [
    { entidadTipo: "persona", entidadId: "persona-a", tipoDocumento: "Examen ocupacional", estado: "aprobado", fechaVencimiento: "2026-01-01" },
    { entidadTipo: "persona", entidadId: "persona-a", tipoDocumento: "Examen ocupacional", estado: "aprobado", fechaVencimiento: "2027-02-01" }
  ];
  assert.equal(evaluarRequisito("Examen ocupacional", documentos, "contrato-a", hoy).key, "vigente");
});
