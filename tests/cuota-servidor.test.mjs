import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dbMemoria } from "./helpers/db-memoria.mjs";
import { resumenAlmacenamiento, renderIndicadorAlmacenamiento } from "../js/storage-indicador.js";
const { reservarCuota, actualizarReserva, subirConCuota } = createRequire(import.meta.url)("../functions/cuota-storage.js");
const { subirArchivoEmpresa } = createRequire(import.meta.url)("../functions/archivos-empresa.js");
const { conciliarReservas } = createRequire(import.meta.url)("../functions/conciliacion-reservas.js");

function habilitarConsultaReservas(db) {
  const consultas=[];
  function consulta(filtros=[],cursor=null,tope=100) {
    return {
      where:(campo,operador,valor)=>consulta([...filtros,{campo,operador,valor}],cursor,tope),
      orderBy:()=>consulta(filtros,cursor,tope),limit:n=>consulta(filtros,cursor,n),
      startAfter:doc=>consulta(filtros,doc,tope),
      get:async()=>{
        consultas.push(filtros);
        const docs=[...db.documentos].filter(([p,d])=>p.split('/').at(-2)==='reservasAlmacenamiento' && filtros.every(f=>f.operador==='=='?d[f.campo]===f.valor:d[f.campo]<=f.valor))
          .map(([path,d])=>({id:path.split('/').at(-1),ref:{path},data:()=>structuredClone(d)}))
          .sort((a,b)=>a.data().creadaEn-b.data().creadaEn || a.ref.path.localeCompare(b.ref.path));
        return {docs:docs.filter(d=>!cursor || d.data().creadaEn>cursor.data().creadaEn || d.data().creadaEn===cursor.data().creadaEn && d.ref.path>cursor.ref.path).slice(0,tope)};
      }
    };
  }
  db.collectionGroup=nombre=>{assert.equal(nombre,'reservasAlmacenamiento');return consulta();};
  return consultas;
}

test('conciliación consulta solo reservas pendientes antiguas y confirma o libera su cuota',async()=>{
  const e=entorno();e.empresa.maxStorageGB=1;const ahora=Date.now();
  const faltante=await reservarCuota(e),presente=await reservarCuota({...e,ruta:'ots/ot/presente'}),reciente=await reservarCuota({...e,ruta:'ots/ot/reciente'});
  for(const id of [faltante,presente])e.db.documentos.get(`empresas/e/reservasAlmacenamiento/${id}`).creadaEn=ahora-11*60000;
  const consultas=habilitarConsultaReservas(e.db),consultadas=[];
  const bucket={file:ruta=>({getMetadata:async()=>{
    consultadas.push(ruta);if(ruta===e.ruta)throw Object.assign(Error('No existe'),{code:404});
    return [{metadata:{cuotaReservaId:presente,cuotaEmpresaId:'e'}}];
  }})};
  const resultado=await conciliarReservas({db:e.db,bucket,ahora});
  assert.equal(resultado.revisadas,2);assert.equal(resultado.errores,0);
  assert.equal(e.db.documentos.get(`empresas/e/reservasAlmacenamiento/${faltante}`).estado,'eliminada');
  assert.equal(e.db.documentos.get(`empresas/e/reservasAlmacenamiento/${presente}`).estado,'confirmada');
  assert.equal(e.db.documentos.get(`empresas/e/reservasAlmacenamiento/${reciente}`).estado,'reservada');
  assert.equal(e.empresa.storageReservadoBytes,6);assert.equal(e.empresa.storageUsadoBytes,6);
  assert.equal(consultadas.includes('ots/ot/reciente'),false);
  assert.ok(consultas[0].some(f=>f.campo==='estado' && f.valor==='reservada'));
  await conciliarReservas({db:e.db,bucket,ahora});assert.equal(consultadas.length,2);
});

test('una consulta vacía no recorre empresas ni consulta Storage',async()=>{
  const e=entorno(),consultas=habilitarConsultaReservas(e.db);
  const resultado=await conciliarReservas({db:e.db,bucket:{file:()=>{throw Error('No debe tocar Storage');}}});
  assert.equal(resultado.revisadas,0);assert.equal(consultas.length,1);
});

test('un error desconocido de Storage conserva la reserva y una confirmación concurrente no se revierte',async()=>{
  for(const confirmar of [false,true]){
    const e=entorno(),ahora=Date.now(),id=await reservarCuota(e);
    e.db.documentos.get(`empresas/e/reservasAlmacenamiento/${id}`).creadaEn=ahora-11*60000;
    habilitarConsultaReservas(e.db);
    const bucket={file:()=>({getMetadata:async()=>{
      if(confirmar)await actualizarReserva({...e,id});
      throw Object.assign(Error('Consulta'),{code:confirmar?404:503});
    }})};
    await conciliarReservas({db:e.db,bucket,ahora,registrarError:()=>{}});
    assert.equal(e.empresa.storageUsadoBytes,confirmar?6:0);
    assert.equal(e.empresa.storageReservadoBytes,confirmar?0:6);
    assert.equal(e.db.documentos.get(`empresas/e/reservasAlmacenamiento/${id}`).estado,confirmar?'confirmada':'reservada');
  }
});

test('conciliación pagina más de cien pendientes y no procesa colecciones ajenas',async()=>{
  const e=entorno(),ahora=Date.now();e.empresa.storageReservadoBytes=101;
  for(let i=0;i<101;i++)e.db.documentos.set(`empresas/e/reservasAlmacenamiento/r${String(i).padStart(3,'0')}`,{empresaId:'e',creadaEn:ahora-11*60000,estado:'reservada',ruta:`ots/ot/${i}`,bytes:1});
  e.db.documentos.set('otra/e/reservasAlmacenamiento/ajena',{empresaId:'e',creadaEn:ahora-11*60000,estado:'reservada',ruta:'ajena',bytes:1});
  const consultas=habilitarConsultaReservas(e.db);
  const bucket={file:ruta=>({getMetadata:async()=>{assert.notEqual(ruta,'ajena');throw Object.assign(Error('No existe'),{code:404});}})};
  const resultado=await conciliarReservas({db:e.db,bucket,ahora,registrarError:()=>{}});
  assert.equal(resultado.revisadas,101);assert.equal(resultado.errores,1);
  assert.equal(consultas.length,2);assert.equal(e.empresa.storageReservadoBytes,0);
});
function entorno() {
  const empresa = { activa: true, storageCuotaVersion: 1, storageUsadoBytes: 0, storageReservadoBytes: 0, maxStorageGB: 10 / 1024 ** 3 };
  return { empresa, db: dbMemoria({ "empresas/e": empresa }), empresaId: "e", ruta: "ots/ot/foto", bytes: 6, uid: "u", hash: "hash" };
}

test("las cargas concurrentes comparten una reserva atómica y no superan el límite", async () => {
  const e = entorno();
  const resultados = await Promise.allSettled([reservarCuota(e), reservarCuota({ ...e, ruta: "ots/ot/otra" })]);
  assert.equal(resultados.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(resultados.find(r => r.status === "rejected").reason.code, "resource-exhausted");
  assert.equal(e.empresa.storageReservadoBytes, 6);
  assert.equal(e.empresa.storageUsadoBytes, 0);
});

test("confirmaciones y eliminaciones repetidas o fuera de orden no duplican el uso", async () => {
  const e = entorno(), id = await reservarCuota(e);
  await reservarCuota(e);
  assert.equal(e.empresa.storageReservadoBytes, 6);
  await actualizarReserva({ ...e, id }); await actualizarReserva({ ...e, id });
  assert.equal(e.empresa.storageUsadoBytes, 6); assert.equal(e.empresa.storageArchivos, 1);
  assert.equal(e.empresa.storageReservadoBytes, 0);
  await actualizarReserva({ ...e, id, eliminar: true }); await actualizarReserva({ ...e, id, eliminar: true });
  await actualizarReserva({ ...e, id });
  assert.equal(e.empresa.storageUsadoBytes, 0); assert.equal(e.empresa.storageArchivos, 0);
  const otro = entorno(), otroId = await reservarCuota(otro);
  await actualizarReserva({ ...otro, id: otroId, eliminar: true });
  await actualizarReserva({ ...otro, id: otroId });
  assert.equal(otro.empresa.storageUsadoBytes, 0); assert.equal(otro.empresa.storageReservadoBytes, 0);
});

test("cuenta uso anterior y reservas; rechaza llegar al límite y datos sin medir", async () => {
  for (const cambiar of [e => { e.empresa.storageUsadoBytes = 4; }, e => { e.empresa.storageReservadoBytes = 4; }]) {
    const e = entorno(); cambiar(e);
    await assert.rejects(reservarCuota(e), { code: "resource-exhausted" });
  }
  for (const cambiar of [e => { delete e.empresa.storageCuotaVersion; }, e => { e.empresa.storageRecalculando = 123; }]) {
    const e = entorno(); cambiar(e);
    await assert.rejects(reservarCuota(e), { code: "failed-precondition" });
    assert.equal(e.empresa.storageReservadoBytes, 0);
  }
});

test("un fallo confirmado de carga libera la reserva y un resultado desconocido la conserva", async () => {
  for (const codigo of [404, 503]) {
    const e = entorno();
    const bucket = { file: () => ({ save: async () => { throw Object.assign(new Error("Fallo"), { code: 503 }); },
      getMetadata: async () => { throw Object.assign(new Error("Consulta"), { code: codigo }); } }) };
    await assert.rejects(subirConCuota({ ...e, bytes: Buffer.alloc(6), bucket, verificar: async () => {} }));
    assert.equal(e.empresa.storageReservadoBytes, codigo === 404 ? 0 : 6);
    assert.equal(e.empresa.storageUsadoBytes, 0);
  }
});

test("todos los grupos de archivos de empresa usan la cuota y respetan los roles", async () => {
  const casos = [
    ["admin_empresa", "informe/logo.png", "image/png", Buffer.from([137,80,78,71,13,10,26,10])],
    ["sheq", "sheq/documento.pdf", "application/pdf", Buffer.from("%PDF-1.4")],
    ["jefe_taller", "inventario/s/documento.pdf", "application/pdf", Buffer.from("%PDF-1.4")]
  ];
  for (const [rol, ruta, contentType, bytes] of casos) {
    const e = entorno(); e.empresa.storageUsadoBytes = 9;
    const usuario = { uid: "u", activo: true, empresaId: "e", sucursalId: "s", rol };
    const datos = { ruta: `empresas/e/${ruta}`, contentType, base64: bytes.toString("base64") };
    const bucket = { file: () => { throw new Error("No debe llegar a Storage"); } };
    // La reserva se rechaza antes de guardar: comprobar con un archivo sin efectos.
    const sinGuardar = { file: () => ({ save: async () => { throw new Error("No debe guardar"); } }) };
    await assert.rejects(subirArchivoEmpresa({ db: e.db, bucket: sinGuardar, usuario, datos }), { code: "resource-exhausted" });
    await assert.rejects(subirArchivoEmpresa({ db: e.db, bucket, usuario: { ...usuario, rol: "tecnico" }, datos }), { code: "permission-denied" });
  }
});

test("el visor muestra usado, disponible, reservas y avisos sin ocultar exceso de cuota", () => {
  const base = { storageCuotaVersion: 1, maxStorageGB: 1, storageUsadoBytes: .8 * 1024 ** 3, storageReservadoBytes: .1 * 1024 ** 3 };
  const resumen = resumenAlmacenamiento(base);
  assert.equal(resumen.nivel, "critico"); assert.ok(Math.abs(resumen.disponible - .1 * 1024 ** 3) < 1);
  assert.match(renderIndicadorAlmacenamiento(base), /en cargas pendientes/);
  assert.match(renderIndicadorAlmacenamiento({ ...base, storageUsadoBytes: 1.2 * 1024 ** 3, storageReservadoBytes: 0 }), /120.0%/);
  assert.match(renderIndicadorAlmacenamiento({}), /Medición pendiente/);
  assert.doesNotMatch(renderIndicadorAlmacenamiento({}), /0 B.*usados/);
  assert.match(renderIndicadorAlmacenamiento({ ...base, maxStorageGB: 0 }), /Sin límite definido/);
});
