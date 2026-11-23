import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dbMemoria } from "./helpers/db-memoria.mjs";
import { detectarColumnasServicio, detectarFilaServicio, analizarFilasServicio, prepararImportacionServicio } from "../js/inventario-servicio-excel.js";
const {gestionarServicio,resumenServicio}=createRequire(import.meta.url)("../functions/inventario-servicio.js");
const {subirArchivoEmpresa,eliminarArchivoEmpresa}=createRequire(import.meta.url)("../functions/archivos-empresa.js");

function entorno(){
  const base={activo:true,empresaId:"e",sucursalId:"s"};
  const usuarios={jefe:{...base,uid:"jefe",rol:"jefe_taller",nombre:"Jefe"},plan:{...base,uid:"plan",rol:"planificador"},bodega:{...base,uid:"bodega",rol:"bodeguero",nombre:"Bodega"},tecnico:{...base,uid:"tecnico",rol:"tecnico",nombre:"Técnico"}};
  const db=dbMemoria({"empresas/e":{activa:true,modulos:{inventario:true}},"sucursales/s":{empresaId:"e",activa:true},...Object.fromEntries(Object.values(usuarios).map(u=>[`usuarios/${u.uid}`,u]))});
  const bucket={name:"bucket",file:ruta=>({getMetadata:async()=>[{contentType:"image/jpeg",generation:"1",metadata:{creadoPorUid:"bodega",cuotaEmpresaId:"e",firebaseStorageDownloadTokens:"token"}}],delete:async()=>{throw Error("No debe eliminar evidencia de un movimiento confirmado");}})};
  const orden={accion:"crear",ordenId:"os-1",cliente:"Cliente",os:"OS-100",equipo:"GA",serie:"123",items:[{id:"filtro",np:"NP1",descripcion:"Filtro",cantidad:3}]};
  const operar=(datos,rol="bodega")=>gestionarServicio({db,bucket,usuario:usuarios[rol],datos,ahora:Date.parse("2026-11-22T15:00:00Z")});
  const mover=(accion,id,cantidad=1,extra={})=>({accion,ordenId:"os-1",movimientoId:id,lineas:[{itemId:"filtro",cantidad}],rutas:[`empresas/e/inventarioServicio/s/os-1/${id}/foto.jpg`],...(accion==="recibir"?{fechaRecepcion:"2026-11-21"}:{retiraId:"tecnico"}),...extra});
  return {db,bucket,usuarios,orden,operar,mover};
}

test("Servicio conserva recepciones y retiros parciales con fechas, evidencia y ambos responsables",async()=>{
  const e=entorno();await e.operar(e.orden,"jefe");
  await e.operar(e.mover("recibir","r1",2));await e.operar(e.mover("retirar","t1",1));
  const o=e.db.documentos.get("inventarioServicio/os-1");
  assert.equal(o.disponible,1);assert.equal(o.recibido,2);assert.equal(o.retirado,1);assert.equal(o.estado,"Retiro parcial");
  const recepcion=e.db.documentos.get("inventarioServicioMovimientos/os-1_r1");
  assert.equal(recepcion.fechaRecepcion,"2026-11-21");assert.equal(recepcion.recibidoPor,"bodega");
  assert.equal(recepcion.fechaRegistro,Date.parse("2026-11-22T15:00:00Z"));assert.equal(recepcion.evidencias.length,1);
  const retiro=e.db.documentos.get("inventarioServicioMovimientos/os-1_t1");
  assert.equal(retiro.retiraId,"tecnico");assert.equal(retiro.registradoPor,"bodega");assert.equal(retiro.retiraNombre,"Técnico");
  await e.operar(e.mover("recibir","r2",1));await e.operar(e.mover("retirar","t2",2));
  assert.equal(e.db.documentos.get("inventarioServicio/os-1").estado,"Retirado");
  assert.equal(e.db.documentos.get("inventarioServicio/os-1").disponible,0);
});

test("un reintento no duplica cantidades ni movimientos y un identificador reutilizado con otros datos se rechaza",async()=>{
  const e=entorno();await e.operar(e.orden,"plan");await e.operar(e.orden,"plan");
  const datos=e.mover("recibir","r1",2);await e.operar(datos);const r=await e.operar(datos);
  assert.equal(r.repetido,true);assert.equal(e.db.documentos.get("inventarioServicio/os-1").recibido,2);
  await assert.rejects(e.operar(e.mover("recibir","r1",1)),{code:"already-exists"});
});

test("dos retiros simultáneos no pueden superar lo recibido",async()=>{
  const e=entorno();await e.operar(e.orden,"jefe");await e.operar(e.mover("recibir","r",3));
  const r=await Promise.allSettled([e.operar(e.mover("retirar","t1",2)),e.operar(e.mover("retirar","t2",2))]);
  assert.equal(r.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(e.db.documentos.get("inventarioServicio/os-1").disponible,1);
  assert.equal(e.db.documentos.has("inventarioServicioMovimientos/os-1_t1") !== e.db.documentos.has("inventarioServicioMovimientos/os-1_t2"),true);
});

test("rechaza excesos, fracciones, líneas repetidas, fechas futuras y movimientos sin evidencia",async()=>{
  const e=entorno();await e.operar(e.orden,"jefe");
  for(const datos of [e.mover("recibir","x",4),e.mover("recibir","x",.5),e.mover("retirar","x",1),e.mover("recibir","x",1,{rutas:[]}),e.mover("recibir","x",1,{fechaRecepcion:"2026-11-23"}),e.mover("recibir","x",1,{fechaRecepcion:"2026-02-30"}),e.mover("recibir","x",1,{lineas:[{itemId:"filtro",cantidad:1},{itemId:"filtro",cantidad:1}]})]){
    await assert.rejects(e.operar(datos));
    assert.equal(e.db.documentos.get("inventarioServicio/os-1").recibido,0);
  }
});

test("Bodega puede crear y corregir Servicio antes de sus movimientos; los otros roles no registran recepciones",async()=>{
  const e=entorno();await e.operar(e.orden,"jefe");
  await e.operar({...e.orden,ordenId:"creada-por-bodega"});
  assert.equal(e.db.documentos.get("inventarioServicio/creada-por-bodega").creadoPor,"bodega");
  for(const rol of ["jefe","plan","tecnico"])await assert.rejects(e.operar(e.mover("recibir","r",1),rol),{code:"permission-denied"});
  await e.operar({...e.orden,accion:"editar",version:1,cliente:"Corregido"},"plan");
  await assert.rejects(e.operar({...e.orden,accion:"editar",version:1},"jefe"),{code:"failed-precondition"});
  await e.operar(e.mover("recibir","r",1));
  await assert.rejects(e.operar({...e.orden,accion:"editar",version:3},"jefe"),{code:"failed-precondition"});
});

test("Excel detecta encabezados, conserva referencias históricas y no acepta cantidades ambiguas",()=>{
  const encabezados=["Cliente","OS","Equipo","Serie","NP","Descripción","Cantidad","Fecha de recepción","Quién recibe","Fecha de retiro"];
  const mapa=detectarColumnasServicio(encabezados);
  assert.equal(detectarFilaServicio([["Inventario"],[],encabezados]),2);
  const resultado=analizarFilasServicio([["Cliente","OS-1","GA","00123","00042","Filtro",3,"20-11-2026","Roger","21-11-2026"]],mapa);
  assert.equal(resultado.validas[0].serie,"00123");assert.equal(resultado.validas[0].np,"00042");
  assert.equal(resultado.validas[0].fechaRecepcion,"20-11-2026");assert.equal(resultado.validas[0].recibio,"Roger");
  for(const cantidad of ["1.000","1,000",0,-1,"2.5"]){
    const r=analizarFilasServicio([["C","OS","E","S","N","D",cantidad]],mapa);assert.equal(r.errores.length,1);
  }
  assert.throws(()=>analizarFilasServicio([],{}),/Asocia/);
  assert.throws(()=>analizarFilasServicio(Array(501).fill([]),mapa),/500/);
});

test("reimportar Excel produce los mismos identificadores aunque cambie el orden de las filas",async()=>{
  const datos={empresaId:"e",sucursalId:"s",archivo:"stock.xlsx",hoja:"Servicio"};
  const filas=[{cliente:"C",os:"OS",equipo:"GA",serie:"S",np:"NP2",descripcion:"Filtro",cantidad:2,numero:2},
    {cliente:"C",os:"OS",equipo:"GA",serie:"S",np:"NP1",descripcion:"Válvula",cantidad:1,numero:3}];
  const a=await prepararImportacionServicio(filas,datos),b=await prepararImportacionServicio([...filas].reverse(),datos);
  assert.equal(a[0].ordenId,b[0].ordenId);assert.deepEqual(a[0].items,b[0].items);
  const ajena=await prepararImportacionServicio(filas,{...datos,sucursalId:"otra"});assert.notEqual(a[0].ordenId,ajena[0].ordenId);
});

test("la importación conserva su origen sin inventar recepción, retiro ni disponibilidad y es idempotente",async()=>{
  const e=entorno();
  const datos={...e.orden,referenciaExcel:{archivo:"historico.xlsx",hoja:"Servicios",filas:[{numero:2,fechaRecepcion:"20-11-2026",recibio:"Nombre del archivo",fechaIngreso:"21-11-2026",fechaRetiro:"21-11-2026",retira:"Histórico"}]}};
  await e.operar(datos);const r=await e.operar(datos);assert.equal(r.repetido,true);
  const o=e.db.documentos.get("inventarioServicio/os-1");assert.equal(o.disponible,0);assert.equal(o.recibido,0);assert.equal(o.retirado,0);
  assert.equal(o.referenciaExcel.importadoPor,"bodega");assert.equal(o.referenciaExcel.filas[0].recibio,"Nombre del archivo");
  assert.equal([...e.db.documentos.keys()].filter(p=>p.startsWith("inventarioServicioMovimientos/")).length,0);
  await assert.rejects(e.operar({...datos,ordenId:"ajena"},"plan"),{code:"permission-denied"});
});

test("rechaza usuarios, OS, trabajadores y evidencias de otra empresa o sucursal",async()=>{
  for(const cambio of ["orden","usuario","retira","archivo"]){
    const e=entorno();await e.operar(e.orden,"jefe");
    let datos=e.mover("recibir","r",1);
    if(cambio==="orden")e.db.documentos.get("inventarioServicio/os-1").sucursalId="ajena";
    if(cambio==="usuario")e.db.documentos.get("usuarios/bodega").sucursalId="ajena";
    if(cambio==="retira"){
      await e.operar(datos);datos=e.mover("retirar","t",1);e.db.documentos.get("usuarios/tecnico").empresaId="ajena";
    }
    if(cambio==="archivo")datos.rutas=["empresas/e/inventarioServicio/ajena/os-1/r/foto.jpg"];
    await assert.rejects(e.operar(datos),{code:"permission-denied"});
  }
});

test("empresa bloqueada, módulo deshabilitado o sucursal inactiva no permiten movimientos",async()=>{
  for(const destino of ["cancelada","modulo","sucursal"]){
    const e=entorno();await e.operar(e.orden,"jefe");
    if(destino==="cancelada")e.db.documentos.get("empresas/e").suscripcion={estado:"cancelada"};
    if(destino==="modulo")e.db.documentos.get("empresas/e").modulos.inventario=false;
    if(destino==="sucursal")e.db.documentos.get("sucursales/s").activa=false;
    await assert.rejects(e.operar(e.mover("recibir","r",1)));
  }
});

test("ningún archivo respaldando un movimiento confirmado puede reemplazarse o eliminarse",async()=>{
  const e=entorno();await e.operar(e.orden,"jefe");await e.operar(e.mover("recibir","r",1));
  const datos={ruta:"empresas/e/inventarioServicio/s/os-1/r/foto.jpg",contentType:"image/jpeg",base64:Buffer.from([255,216,255]).toString("base64")};
  for(const fn of [subirArchivoEmpresa,eliminarArchivoEmpresa])await assert.rejects(fn({db:e.db,bucket:e.bucket,usuario:e.usuarios.bodega,datos}),{code:"permission-denied"});
});

test("el resumen distingue lo disponible de lo esperado y no considera terminado un retiro con recepción pendiente",()=>{
  assert.equal(resumenServicio([{cantidad:3,recibido:2,retirado:2}]).estado,"Retiro parcial");
  assert.equal(resumenServicio([{cantidad:3,recibido:0,retirado:0}]).estado,"Pendiente de recepción");
});
