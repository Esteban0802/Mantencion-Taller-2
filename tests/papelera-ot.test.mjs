import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { moverOT, eliminarDefinitivamenteOT, procesarPapelera } = createRequire(import.meta.url)("../functions/papelera-ot.js");

const jefe = { uid: "j", activo: true, rol: "jefe_taller", empresaId: "e", sucursalId: "s" };
const orden = { empresaId: "e", sucursalId: "s", os: "OS 1", cerrada: true, estado: "CERRADA", ingreso: [{ comentarios: [{ creadoPorUid: "t", texto: "Original" }], evidencias: ["https://ejemplo.test/foto"] }] };

function entornoBorrado() {
  const datos = new Map(Object.entries({
    "otsPapelera/o": { empresaId: "e", sucursalId: "s", orden },
    "empresas/e": { activa: true, storageUsadoBytes: 10, storageArchivos: 1 },
    "sucursales/s": { empresaId: "e", activa: true },
    "empresas/e/reservasAlmacenamiento/r": { ruta: "ots/o/foto.png", bytes: 10, estado: "confirmada" },
    "inventario/repuesto": { recibido: true }
  }));
  let serial=0;
  const ref=(ruta,filtros=[])=>({ ruta, doc:id=>ref(`${ruta}/${id || ++serial}`), collection:n=>ref(`${ruta}/${n}`),
    orderBy:()=>ref(ruta,filtros),limit:()=>ref(ruta,filtros),
    where:(campo,op,valor)=>ref(ruta,[...filtros,{campo,op,valor}]),
    get:async()=>filtros.length ? {docs:[...datos].filter(([p,d])=>p.startsWith(`${ruta}/`) && filtros.every(f=>f.op==='>=' ? d[f.campo]>=f.valor : f.op==='<=' ? d[f.campo]<=f.valor : d[f.campo]<f.valor)).map(([p,d])=>({id:p.split('/').at(-1),ref:ref(p),data:()=>d}))} : {exists:datos.has(ruta),data:()=>datos.get(ruta)} });
  const db={collection:ref,runTransaction:async fn=>{
    const cambios=[];
    await fn({get:r=>r.get(),set:(r,d)=>cambios.push(()=>datos.set(r.ruta,d)),create:(r,d)=>cambios.push(()=>datos.set(r.ruta,d)),delete:r=>cambios.push(()=>datos.delete(r.ruta)),update:(r,d)=>cambios.push(()=>datos.set(r.ruta,{...datos.get(r.ruta),...d}))});
    cambios.forEach(f=>f());
  }};
  const archivos=new Set(['ots/o/foto.png','ots/otra/foto.png']);
  let fallar=false;
  const bucket={getFiles:async({prefix})=>[[...archivos].filter(n=>n.startsWith(prefix)).map(name=>({name,delete:async()=>{if(fallar)throw Error('Storage no disponible');archivos.delete(name);}}))]};
  return {db,bucket,datos,archivos,fallar:valor=>{fallar=valor;}};
}

const dia=86400000;
test('papelera automática avisa desde los 10 días y borra a los 15, nunca antes',async()=>{
  const e=entornoBorrado(),inicio=Date.UTC(2026,10,1);
  e.datos.get('otsPapelera/o').eliminadoEn=new Date(inicio);
  assert.equal((await procesarPapelera({...e,ahora:inicio+10*dia-1})).avisadas,0);
  assert.equal((await procesarPapelera({...e,ahora:inicio+10*dia})).avisadas,1);
  assert.equal((await procesarPapelera({...e,ahora:inicio+15*dia-1})).eliminadas,0);
  assert.equal((await procesarPapelera({...e,ahora:inicio+15*dia})).eliminadas,1);
  assert.equal(e.datos.has('otsPapelera/o'),false);
  assert.ok([...e.datos.values()].some(d=>d.origen==='borrado_automatico_papelera' && d.rol==='sistema'));
});

test('revisiones cada cinco días conservan aviso previo aunque no coincidan con el vencimiento',async()=>{
  const e=entornoBorrado(),inicio=Date.UTC(2026,10,1);
  e.datos.get('otsPapelera/o').eliminadoEn=new Date(inicio);
  assert.equal((await procesarPapelera({...e,ahora:inicio+9*dia})).avisadas,0);
  assert.equal((await procesarPapelera({...e,ahora:inicio+14*dia})).avisadas,1);
  assert.equal(e.datos.get('otsPapelera/o').ultimaRevisionPapeleraEn.getTime(),inicio+14*dia);
  assert.equal(e.datos.get('otsPapelera/o').proximaRevisionPapeleraEn.getTime(),inicio+19*dia);
  assert.equal(e.datos.get('otsPapelera/o').avisoEliminacionEn.getTime(),inicio+14*dia);
  assert.equal(e.datos.has('otsPapelera/o'),true);
  assert.equal((await procesarPapelera({...e,ahora:inicio+19*dia})).eliminadas,1);
});

test('OT antiguas reciben tres días de aviso y un fallo se puede reintentar',async()=>{
  const e=entornoBorrado(),ahora=Date.UTC(2026,10,1);
  e.datos.get('otsPapelera/o').eliminadoEn=new Date(ahora-30*dia);
  assert.equal((await procesarPapelera({...e,ahora})).avisadas,1);
  assert.equal((await procesarPapelera({...e,ahora:ahora+3*dia-1})).eliminadas,0);
  e.fallar(true);
  assert.equal((await procesarPapelera({...e,ahora:ahora+3*dia,registrarError:()=>{}})).errores,1);
  e.fallar(false);
  assert.equal((await procesarPapelera({...e,ahora:ahora+3*dia})).eliminadas,1);
});

test('borrado automático revalida vencimiento y respeta OT restauradas y empresas bloqueadas',async()=>{
  const e=entornoBorrado(),ahora=Date.UTC(2026,10,1);
  Object.assign(e.datos.get('otsPapelera/o'),{eliminadoEn:new Date(ahora-14*dia),avisoEliminacionEn:new Date(ahora-3*dia)});
  await assert.rejects(eliminarDefinitivamenteOT({...e,usuario:jefe,otId:'o',automatico:true,ahora}),{code:'failed-precondition'});
  e.datos.get('otsPapelera/o').eliminadoEn=new Date(ahora-15*dia);
  e.datos.get('empresas/e').activa=false;
  assert.equal((await procesarPapelera({...e,ahora,registrarError:()=>{}})).errores,1);
  assert.equal(e.archivos.size,2);
  e.datos.delete('otsPapelera/o');
  assert.equal((await procesarPapelera({...e,ahora})).eliminadas,0);
});

test('eliminación definitiva borra solo sus archivos, libera cuota y conserva inventario',async()=>{
  const e=entornoBorrado();
  await eliminarDefinitivamenteOT({...e,usuario:jefe,otId:'o'});
  assert.equal(e.datos.has('otsPapelera/o'),false);
  assert.deepEqual([...e.archivos],['ots/otra/foto.png']);
  assert.equal(e.datos.get('empresas/e').storageUsadoBytes,0);
  assert.equal(e.datos.get('empresas/e').storageArchivos,0);
  assert.equal(e.datos.get('empresas/e/reservasAlmacenamiento/r').estado,'eliminada');
  assert.equal(e.datos.get('inventario/repuesto').recibido,true);
  assert.equal(e.datos.get('otsEliminadas/o').empresaId,'e');
  assert.ok([...e.datos.values()].some(d=>d.accion==='ot_eliminada_definitivamente'));
});

test('eliminación definitiva rechaza otros roles, ámbitos, OT activas y sucursal inactiva',async()=>{
  for(const cambio of [{rol:'tecnico'},{rol:'admin_empresa'},{activo:false},{empresaId:'otra'},{sucursalId:'otra'}]){
    const e=entornoBorrado();const antes=[...e.datos];
    await assert.rejects(eliminarDefinitivamenteOT({...e,usuario:{...jefe,...cambio},otId:'o'}),{code:'permission-denied'});
    assert.deepEqual([...e.datos],antes);assert.equal(e.archivos.size,2);
  }
  for(const [ruta,dato] of [['ots/o',orden],['sucursales/s',{empresaId:'e',activa:false}]]){
    const e=entornoBorrado();e.datos.set(ruta,dato);
    await assert.rejects(eliminarDefinitivamenteOT({...e,usuario:jefe,otId:'o'}),{code:'failed-precondition'});
    assert.equal(e.archivos.size,2);
  }
});

test('un fallo mantiene la papelera bloqueada y permite reintentar sin descontar cuota dos veces',async()=>{
  const e=entornoBorrado();e.fallar(true);
  await assert.rejects(eliminarDefinitivamenteOT({...e,usuario:jefe,otId:'o'}));
  assert.equal(e.datos.get('otsPapelera/o').borradoPendiente,true);
  assert.equal(e.datos.get('empresas/e').storageUsadoBytes,10);
  await assert.rejects(moverOT({db:e.db,usuario:jefe,otId:'o',restaurar:true}),{code:'failed-precondition'});
  e.fallar(false);
  await eliminarDefinitivamenteOT({...e,usuario:jefe,otId:'o'});
  await assert.rejects(eliminarDefinitivamenteOT({...e,usuario:jefe,otId:'o'}),{code:'not-found'});
  assert.equal(e.datos.get('empresas/e').storageUsadoBytes,0);
});
function entorno(extra = {}, fallar = false) {
  const datos = new Map(Object.entries({ "ots/o": orden, "otsResumen/o": { empresaId: "e", sucursalId: "s", os: "OS 1", cerrada: true }, "empresas/e": { activa: true }, "sucursales/s": { empresaId: "e", activa: true }, ...extra }));
  let serial = 0;
  const db = { collection: nombre => ({ doc: id => `${nombre}/${id || ++serial}` }), runTransaction: async callback => {
    const pendientes = [];
    await callback({ get: async ref => ({ exists: datos.has(ref), data: () => datos.get(ref) }), create: (ref, valor) => pendientes.push([ref, valor]), set: (ref, valor) => pendientes.push([ref, valor]), delete: ref => pendientes.push([ref, undefined]) });
    if (fallar) throw Error("Fallo de commit");
    for (const [ref, valor] of pendientes) { if (valor === undefined) datos.delete(ref); else datos.set(ref, valor); }
  } };
  return { db, datos };
}

test("enviar y restaurar conserva la OT cerrada, su autoría, evidencias e identificador", async () => {
  const e = entorno();
  await moverOT({ db: e.db, usuario: jefe, otId: "o" });
  assert.equal(e.datos.has("ots/o"), false);
  assert.equal(e.datos.has("otsResumen/o"), false);
  assert.deepEqual(e.datos.get("otsPapelera/o").orden, orden);
  assert.equal(e.datos.get("otsPapelera/o").eliminadoPorUid, "j");
  await moverOT({ db: e.db, usuario: jefe, otId: "o", restaurar: true });
  assert.deepEqual(e.datos.get("ots/o"), orden);
  assert.equal(e.datos.get("otsResumen/o").cerrada, true);
  assert.equal(e.datos.has("otsPapelera/o"), false);
  assert.deepEqual([...e.datos].filter(([k]) => k.startsWith("logsSistema/")).map(([,v]) => v.accion), ["ot_enviada_papelera", "ot_restaurada"]);
});

test("rechaza cuentas, roles y ámbitos ajenos sin modificar registros", async () => {
  for (const cambio of [{ rol: "admin_empresa" }, { rol: "admin_sucursal" }, { rol: "super_admin" }, { rol: "tecnico" }, { activo: false }, { empresaId: "otra" }, { sucursalId: "otra" }, { sucursalId: "" }]) {
    for (const restaurar of [false, true]) {
      const e = entorno({ "otsPapelera/o": { empresaId: "e", sucursalId: "s", orden } });
      const antes = [...e.datos];
      await assert.rejects(moverOT({ db: e.db, usuario: { ...jefe, ...cambio }, otId: "o", restaurar }), err => err.code === "permission-denied");
      assert.deepEqual([...e.datos], antes);
    }
  }
});

test("cancelación, sucursal inactiva, colisiones y fallos de commit conservan los datos", async () => {
  for (const extra of [
    { "empresas/e": { activa: false } },
    ...["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"].map(estado => ({ "empresas/e": { activa: true, suscripcion: { estado } } })),
    { "sucursales/s": { empresaId: "e", activa: false } },
    { "otsPapelera/o": { empresaId: "e", sucursalId: "s", orden } }
  ]) {
    const e = entorno(extra); const antes = [...e.datos];
    await assert.rejects(moverOT({ db: e.db, usuario: jefe, otId: "o" }));
    assert.deepEqual([...e.datos], antes);
  }
  const e = entorno({}, true); const antes = [...e.datos];
  await assert.rejects(moverOT({ db: e.db, usuario: jefe, otId: "o" }));
  assert.deepEqual([...e.datos], antes);
  const colision = entorno({ "otsPapelera/o": { empresaId: "e", sucursalId: "s", orden } });
  await assert.rejects(moverOT({ db: colision.db, usuario: jefe, otId: "o", restaurar: true }), { code: "already-exists" });
  for (const otId of ["", "x/y", null]) await assert.rejects(moverOT({ db: e.db, usuario: jefe, otId }), { code: "invalid-argument" });
});

test("restaurar tampoco elude la cancelación ni la desactivación de sucursal", async () => {
  for (const extra of [
    { "sucursales/s": { empresaId: "e", activa: false } },
    ...["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"].map(estado => ({ "empresas/e": { activa: true, suscripcion: { estado } } }))
  ]) {
    const e = entorno({ ...extra, "otsPapelera/o": { empresaId: "e", sucursalId: "s", orden } });
    e.datos.delete("ots/o");
    const antes = [...e.datos];
    await assert.rejects(moverOT({ db: e.db, usuario: jefe, otId: "o", restaurar: true }), { code: "failed-precondition" });
    assert.deepEqual([...e.datos], antes);
  }
});
