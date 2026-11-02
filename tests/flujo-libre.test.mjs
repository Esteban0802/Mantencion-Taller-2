import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { dbMemoria } from "./helpers/db-memoria.mjs";
import { progresoLibre, gruposLibresInforme, esFlujoLibre } from "../js/flujo-libre-modelo.js";
import { crearVistaFlujoLibre } from "../js/flujo-libre-html.js";
import { cargarEvidencias } from "../js/flujo-libre-cargas.js";
import { crearPDFGantt } from '../js/flujo-libre-gantt-pdf.js';
import { imagenesVisor } from '../js/visor-evidencias.js';
test('visor de evidencias admite imágenes con URL segura y mantiene separados los PDF',()=>{
  const imagenes=imagenesVisor([{tipo:'image/png',url:'https://example.com/foto.png',nombre:'Foto'},
    {tipo:'application/pdf',url:'https://example.com/documento.pdf'},
    {tipo:'image/png',url:'javascript:alert(1)'}]);
  assert.equal(imagenes.length,1);assert.equal(imagenes[0].nombre,'Foto');
});
import { vistaOperacion, vistaIdentificacion } from '../js/flujo-libre-operacion.js';
import { vistaAccesos, filasGantt, filasPrincipalesGantt, periodoGantt, fechaRecepcion, posicionHoyGantt } from '../js/flujo-libre-ventanas.js';
test('indicador Hoy usa el día local, centra su columna y detecta fechas fuera del período',()=>{
  const periodo={inicio:'2026-11-01',fin:'2026-11-03'};
  assert.deepEqual(posicionHoyGantt(periodo,new Date(2026,10,2,23,50)),{fecha:'2026-11-02',proporcion:.5});
  assert.equal(posicionHoyGantt(periodo,new Date(2026,9,31)),null);
  assert.equal(posicionHoyGantt(periodo,new Date(2026,10,4)),null);
  assert.equal(posicionHoyGantt({inicio:'2026-11-01',fin:'2026-11-01'},new Date(2026,10,1)).proporcion,.5);
});
test('recepción estimada suma días hábiles y valida fechas y plazos',()=>{
  assert.equal(fechaRecepcion('2026-07-17',60),'2026-10-09');
  assert.equal(fechaRecepcion('2026-10-30',1),'2026-11-02');
  assert.equal(fechaRecepcion('2026-10-30',0),'2026-10-30');
  assert.equal(fechaRecepcion('',2),'');assert.equal(fechaRecepcion('2026-02-30',1),'');
  assert.equal(fechaRecepcion('2026-10-30',-1),'');assert.equal(fechaRecepcion('2026-10-30',1.5),'');
});

test("carga múltiple conserva éxitos, procesa imágenes y PDF y limpia adjuntos fallidos",async()=>{
  const archivos=[{name:"foto.jpg"},{name:"error.pdf"},{name:"documento.pdf"},{name:"rechazado.png"}];
  const eventos=[],eliminados=[];
  const resultado=await cargarEvidencias({archivos,
    subir:async a=>{eventos.push(`subir:${a.name}`);if(a.name==="rechazado.png")throw Error("Cuota agotada");return a.name;},
    adjuntar:async(a)=>{eventos.push(`adjuntar:${a.name}`);if(a.name==="error.pdf")throw Error("No se pudo guardar");},
    eliminar:async url=>{eliminados.push(url);}
  });
  assert.equal(resultado.guardados,2);
  assert.deepEqual(resultado.fallidos.map(f=>f.nombre),["error.pdf","rechazado.png"]);
  assert.deepEqual(eliminados,["error.pdf"]);
  assert.deepEqual(eventos.slice(0,4),["subir:foto.jpg","adjuntar:foto.jpg","subir:error.pdf","adjuntar:error.pdf"]);
});
import { procesarLibroPlantilla } from "../js/plantillas-excel.js";
import { etapasDePlantilla as etapasLegado } from "../js/flujo-etapas.js";
const require=createRequire(import.meta.url);
const {crearOT,actualizarOT,obtenerPlantilla,etapasDePlantilla}=require("../functions/flujo-libre.js");
const {subirArchivoOT,eliminarArchivoOT}=require("../functions/archivos-ot.js");
const {rutasEvidencias,limpiarEvidenciasRetiradas}=require("../functions/limpieza-evidencias.js");

function entornoLimpiezaEvidencias() {
  const ruta='ots/ot/personalizada_e_0/item_0/foto.jpg';
  const url=`https://firebasestorage.googleapis.com/v0/b/bucket/o/${encodeURIComponent(ruta)}?alt=media&token=t`;
  const anterior={empresaId:'e',sucursalId:'s',flujoVersion:2,etapasPersonalizadas:[{items:[{fotos:[{url}],comentarios:[]}]}]};
  const actual=structuredClone(anterior);actual.etapasPersonalizadas[0].items[0].fotos=[];
  const db=dbMemoria({'ots/ot':actual,'empresas/e':{storageUsadoBytes:10,storageArchivos:1},
    'empresas/e/reservasAlmacenamiento/r':{bytes:10,estado:'confirmada'}});
  const archivos=new Set([ruta,'ots/otra/archivo.pdf']);let fallar=false;
  const bucket={name:'bucket',file:r=>({getMetadata:async()=>{
    if(!archivos.has(r))throw Object.assign(Error('No existe'),{code:404});
    return [{generation:'1',metadata:{cuotaEmpresaId:'e',cuotaReservaId:'r'}}];
  },delete:async()=>{archivos.delete(r);if(fallar)throw Error('Conexión interrumpida');}})};
  return {db,bucket,otId:'ot',anterior,actual,ruta,url,archivos,fallar:v=>{fallar=v;}};
}

test('evidencia retirada se borra de Storage y libera cuota, conservando archivos de otra OT',async()=>{
  const e=entornoLimpiezaEvidencias();
  await limpiarEvidenciasRetiradas(e);
  assert.deepEqual([...e.archivos],['ots/otra/archivo.pdf']);
  assert.equal(e.db.documentos.get('empresas/e').storageUsadoBytes,0);
  await limpiarEvidenciasRetiradas(e);
  assert.equal(e.db.documentos.get('empresas/e').storageArchivos,0);
});

test('evidencia interrumpida después del borrado se reintenta y descuenta la cuota una sola vez',async()=>{
  const e=entornoLimpiezaEvidencias();e.fallar(true);
  await assert.rejects(limpiarEvidenciasRetiradas(e));
  assert.ok([...e.db.documentos].some(([k,v])=>k.startsWith('limpiezasEvidencias/') && v.estado==='pendiente'));
  assert.equal(e.db.documentos.get('empresas/e').storageUsadoBytes,10);
  e.fallar(false);await limpiarEvidenciasRetiradas(e);
  assert.equal(e.db.documentos.get('empresas/e').storageUsadoBytes,0);
});

test('limpieza respeta evidencias compartidas, decisiones, papelera y eventos atrasados',async()=>{
  for(const lugar of ['actividad','decision','papelera']){
    const e=entornoLimpiezaEvidencias();
    if(lugar==='actividad')e.db.documentos.set('ots/ot',e.anterior);
    if(lugar==='decision')e.db.documentos.get('ots/ot').decision={evidencias:[e.url]};
    if(lugar==='papelera'){e.db.documentos.delete('ots/ot');e.db.documentos.set('otsPapelera/ot',{orden:e.anterior});}
    await limpiarEvidenciasRetiradas(e);
    assert.equal(e.archivos.has(e.ruta),true);
    assert.equal(e.db.documentos.get('empresas/e').storageUsadoBytes,10);
  }
});

test('limpieza reconoce fotos, PDF de despacho y listas antiguas sin procesar comentarios ni enlaces externos',async()=>{
  const e=entornoLimpiezaEvidencias();
  const datos={ingreso:[{fotos:[e.url]}],despacho:{preparacion:[{url:e.url}],final:[e.url]},
    decision:{evidencias:[e.url]},comentarios:[{texto:e.url}],documentos:['https://example.com/foto.jpg']};
  assert.deepEqual([...rutasEvidencias(datos,'bucket','ot')],[e.ruta]);
  assert.equal(rutasEvidencias({comentarios:[{texto:e.url}]},'bucket','ot').size,0);
  assert.equal(rutasEvidencias(datos,'otro-bucket','ot').size,0);
  assert.equal(rutasEvidencias(datos,'bucket','otra-ot').size,0);
  e.anterior={empresaId:'e',sucursalId:'s',ingreso:[{fotos:[e.url]}]};
  e.actual={empresaId:'e',sucursalId:'s',ingreso:[{fotos:[]}]};
  e.db.documentos.set('ots/ot',e.actual);
  await limpiarEvidenciasRetiradas(e);
  assert.equal(e.archivos.has(e.ruta),false);
});

test('eliminar un comentario lo retira de Firestore sin invocar almacenamiento',async()=>{
  const e=entorno();const {id}=await crearOT(e),comentarioId=randomUUID();
  await mutar(e,id,'comentar','e_0',{itemIndex:0,texto:'Eliminar este texto',comentarioId});
  const anterior=structuredClone(orden(e,id));
  await mutar(e,id,'quitarComentario','e_0',{itemIndex:0,comentarioId});
  assert.equal(orden(e,id).etapasPersonalizadas[0].items[0].comentarios.length,0);
  await limpiarEvidenciasRetiradas({db:e.db,bucket:{name:'bucket',file:()=>{throw Error('No debe consultar Storage');}},otId:id,anterior,actual:orden(e,id)});
});

test('una evidencia en limpieza no puede volver a adjuntarse mediante una URL antigua',async()=>{
  const e=entorno();const {id}=await crearOT(e);
  const ruta=`ots/${id}/personalizada_e_0/item_0/foto.jpg`;
  const {createHash}=require('node:crypto');
  e.db.documentos.set(`limpiezasEvidencias/${createHash('sha256').update(ruta).digest('hex')}`,{estado:'pendiente'});
  await assert.rejects(mutar(e,id,'adjuntar','e_0',{itemIndex:0,url:`https://firebasestorage.googleapis.com/v0/b/bucket/o/${encodeURIComponent(ruta)}?alt=media&token=token`}),{code:'failed-precondition'});
  assert.equal(orden(e,id).etapasPersonalizadas[0].items[0].fotos.length,0);
});
const XLSX=require("xlsx");
const jefe={uid:"j",nombre:"Jefe",activo:true,rol:"jefe_taller",empresaId:"e",sucursalId:"s"};
const tecnico={...jefe,uid:"t",nombre:"Técnico",rol:"tecnico"};
function entorno() {
  const plantilla={empresaId:"e",sucursalId:"s",flujoVersion:2,activa:true,gama:"GX",nombre:"Proceso propio",version:1,
    etapas:[{id:"e_0",nombre:"Recepción especial",items:[{item:"Recibir equipo"}]},{id:"e_1",nombre:"Desarme e inspección",items:[{item:"Desarmar"}]},{id:"e_2",nombre:"Entrega final",items:[{item:"Entregar"}]}]};
  const db=dbMemoria({"empresas/e":{activa:true,maxStorageGB:1,storageCuotaVersion:1},"sucursales/s":{empresaId:"e",activa:true},"sucursales/otra":{empresaId:"e",activa:true},"sucursales/s/plantillasSucursal/p":plantilla});
  const bucket={name:"bucket",file:()=>({getMetadata:async()=>[{contentType:"image/jpeg",metadata:{creadoPorUid:"t",firebaseStorageDownloadTokens:"token"}}]})};
  const datos={plantillaId:"p",solicitudId:randomUUID(),equipo:"Compresor",serie:"123",cliente:"Cliente",os:"PRUEBA",aprobaciones:["e_1"]};
  return {db,bucket,datos,usuario:jefe,plantilla};
}
const orden=(e,id)=>e.db.documentos.get(`ots/${id}`);

test('una solicitud antigua no recrea una OT eliminada definitivamente',async()=>{
  const e=entorno();const {id}=await crearOT(e);
  e.db.documentos.delete(`ots/${id}`);
  e.db.documentos.set(`otsEliminadas/${id}`,{empresaId:'e',sucursalId:'s'});
  await assert.rejects(crearOT(e),{code:'failed-precondition'});
  assert.equal(e.db.documentos.has(`ots/${id}`),false);
});
test('repuestos pueden registrarse después de completar etapas, hasta el cierre de la OT',async()=>{
  const e=entorno();const {id}=await crearOT(e);const ot=orden(e,id);
  ot.etapasPersonalizadas.forEach(et=>et.completada=true);
  ot.etapasPersonalizadas[1].decision={resultado:'aprobada'};
  ot.repuestos={items:[{inventarioItemId:'r',recibidoInventario:false,usado:false}]};
  e.db.documentos.set('inventarioItems/r',{empresaId:'e',sucursalId:'s',recibido:true,datos:{OS:'PRUEBA',NP:'FILTRO'}});
  await mutar(e,id,'sincronizarRepuestos','e_2');
  await mutar(e,id,'guardarRepuestos','e_2',{items:[{itemId:'r',usado:true,comentario:'Instalado tras recepción'}]});
  assert.equal(orden(e,id).repuestos.items[0].usado,true);
  await assert.rejects(mutar(e,id,'guardarGantt','e_2',{etapas:[]},jefe),/protegida/);
  await mutar(e,id,'cerrar',undefined,{},jefe);
  await assert.rejects(mutar(e,id,'guardarRepuestos','e_2',{items:[{itemId:'r',usado:false}]}),/cerrada/);
});
test('avance cuenta etapas resueltas por rechazo sin marcar como hechas sus actividades',()=>{
  const ot={flujoVersion:2,cerrada:false,etapasPersonalizadas:[
    {completada:true,items:[{ok:true}]},{completada:true,omitidaPorRechazo:true,items:[{ok:false}]},{completada:false,items:[{ok:false}]}]};
  assert.equal(progresoLibre(ot),67);
  ot.etapasPersonalizadas[2].completada=true;ot.etapasPersonalizadas[2].items[0].ok=true;
  assert.equal(progresoLibre(ot),100);assert.equal(ot.etapasPersonalizadas[1].items[0].ok,false);
  const resumen={...ot,etapasPersonalizadas:ot.etapasPersonalizadas.map(e=>({completada:e.completada,total:e.items.length,completados:e.items.filter(i=>i.ok).length}))};
  assert.equal(progresoLibre(resumen),100);
});
test('cierre comprueba recepción real de Inventario incluso con copia local desactualizada',async()=>{
  const e=entorno();const {id}=await crearOT(e);const ot=orden(e,id);
  ot.etapasPersonalizadas.forEach(et=>et.completada=true);
  ot.repuestos={items:[{inventarioItemId:'r',recibidoInventario:true,usado:true}]};
  e.db.documentos.set('inventarioItems/r',{empresaId:'e',sucursalId:'s',recibido:false,datos:{OS:'PRUEBA',NP:'FILTRO'}});
  await assert.rejects(mutar(e,id,'cerrar',undefined,{},jefe),/pendiente.*recepción/);
  await assert.rejects(mutar(e,id,'validarCierre',undefined,{},jefe),/pendiente.*recepción/);
  assert.equal(orden(e,id).cerrada,false);
  e.db.documentos.get('inventarioItems/r').recibido=true;
  const revisionAntes=orden(e,id).revision;
  await mutar(e,id,'validarCierre',undefined,{},jefe);
  assert.equal(orden(e,id).cerrada,false);assert.equal(orden(e,id).revision,revisionAntes);
  orden(e,id).repuestos.items[0].recibidoInventario=false;
  await mutar(e,id,'cerrar',undefined,{},jefe);
  assert.equal(orden(e,id).cerrada,true);assert.equal(orden(e,id).repuestos.items[0].recibidoInventario,true);
});
test('rechazo con salto a última etapa permite devolver equipo sin esperar repuestos',async()=>{
  const e=entorno();const {id}=await crearOT(e);const ot=orden(e,id);
  ot.etapasPersonalizadas.forEach(et=>et.completada=true);
  ot.etapasPersonalizadas[1].decision={resultado:'rechazada',pasarUltima:true};
  ot.repuestos={items:[{inventarioItemId:'r',recibidoInventario:false}]};
  e.db.documentos.set('inventarioItems/r',{empresaId:'e',sucursalId:'s',recibido:false,datos:{OS:'PRUEBA'}});
  await mutar(e,id,'cerrar',undefined,{},jefe);assert.equal(orden(e,id).cerrada,true);
});
test('Cerrar OT solo aparece al jefe en la última etapa de un flujo completado',async()=>{
  const e=entorno();const {id}=await crearOT(e);const ot={id,...orden(e,id)};
  ot.etapasPersonalizadas.forEach(et=>et.completada=true);
  for(const seleccionado of ['crear','e_0','e_1'])assert.doesNotMatch(crearVistaFlujoLibre({ot,usuario:jefe,seleccionado}).html,/data-cerrar/);
  assert.match(crearVistaFlujoLibre({ot,usuario:jefe,seleccionado:'e_2'}).html,/data-cerrar/);
  assert.doesNotMatch(crearVistaFlujoLibre({ot,usuario:tecnico,seleccionado:'e_2'}).html,/data-cerrar/);
  ot.etapasPersonalizadas[0].completada=false;
  assert.doesNotMatch(crearVistaFlujoLibre({ot,usuario:jefe,seleccionado:'e_2'}).html,/data-cerrar/);
  ot.etapasPersonalizadas[0].completada=true;ot.cerrada=true;
  assert.doesNotMatch(crearVistaFlujoLibre({ot,usuario:jefe,seleccionado:'e_2'}).html,/data-cerrar/);
});
test('resumen del panel incluye planificación y se repara sin cambiar avance ni revisión',async()=>{
  const e=entorno();const {id}=await crearOT(e);const ot=orden(e,id);
  ot.gantt={fechaInicio:'2026-11-02',fechaTermino:'2026-11-20',fechaSolicitudRepuestos:'2026-11-02',diasRepuestos:3,fechaRecepcionEstimada:'2026-11-05',actividades:[{nombre:'Detalle'}]};
  const revision=ot.revision;
  await mutar(e,id,'sincronizarResumen',undefined,{},jefe);
  const resumen=e.db.documentos.get(`otsResumen/${id}`);
  assert.equal(resumen.gantt.fechaTermino,'2026-11-20');assert.equal(resumen.gantt.fechaInicio,'2026-11-02');
  assert.equal(resumen.gantt.actividades,undefined);assert.equal(orden(e,id).revision,revision);
  assert.equal(orden(e,id).etapasPersonalizadas[0].completada,false);
  assert.equal(orden(e,id).resumenVersion,3);
  await assert.rejects(mutar(e,id,'sincronizarResumen',undefined,{}, {...jefe,sucursalId:'otra'}),{code:'permission-denied'});
});
test('la etapa actual permanece habilitada al consultar etapas anteriores, incluida la última',async()=>{
  const e=entorno();const {id}=await crearOT(e);const ot={id,...orden(e,id)};
  ot.etapasPersonalizadas[0].completada=true;ot.etapasPersonalizadas[1].completada=true;
  for(const rol of ['jefe_taller','tecnico','supervisor','admin_empresa','admin_sucursal','planificador']) {
    const html=crearVistaFlujoLibre({ot,usuario:{...tecnico,rol},seleccionado:'e_0'}).html;
    const boton=html.match(/<button[^>]*data-etapa-libre="e_2"[^>]*>/)[0];
    assert.match(boton,/class="tab enabled"/);assert.doesNotMatch(boton,/\bdisabled\b/);
  }
  ot.etapasPersonalizadas[1].completada=false;
  const html=crearVistaFlujoLibre({ot,usuario:tecnico,seleccionado:'e_0'}).html;
  assert.match(html, /data-etapa-libre="e_1" class="tab enabled"/);
  assert.match(html, /data-etapa-libre="e_2" class="tab disabled"[^>]*disabled/);
});
test('PDF Gantt dibuja barras vectoriales y pagina sin omitir etapas',()=>{
  const {jsPDF}=require('jspdf');let barras=0;
  function Documento(opciones){const pdf=new jsPDF(opciones);const dibujar=pdf.roundedRect.bind(pdf);pdf.roundedRect=(...args)=>{barras++;return dibujar(...args);};return pdf;}
  const filas=Array.from({length:20},(_,i)=>({nombre:`Etapa ${i+1}`,inicio:'2026-11-02',fin:'2026-11-10',tipo:i===3?'espera':'etapa',duracion:7,avance:50}));
  const pdf=crearPDFGantt({jsPDF:Documento,ot:{os:'OS-PDF',equipo:'GX7'},filas,periodo:{inicio:'2026-11-02',fin:'2026-11-10'}});
  assert.equal(barras,20);assert.ok(pdf.getNumberOfPages()>1);
  const contenido=Buffer.from(pdf.output('arraybuffer')).toString('latin1');assert.match(contenido,/Etapa 20/);assert.match(contenido,/Espera de repuestos/);
});
test('espera de repuestos aparece antes de la operación y amplía el calendario y las exportaciones',()=>{
  const ot={etapasPersonalizadas:[{id:'e_0',nombre:'Revisión',requiereAprobacion:true,decision:{resultado:'aprobada'},items:[]},{id:'e_1',nombre:'Trabajo',items:[]}],gantt:{fechaInicio:'2026-11-02',fechaTermino:'2026-11-03',fechaSolicitudRepuestos:'2026-10-30',diasRepuestos:3,fechaRecepcionEstimada:'2026-11-04',etapas:[]}};
  const filas=filasGantt(ot);assert.deepEqual(filas.map(f=>f.tipo),['etapa','espera','etapa']);
  assert.equal(filas[1].duracion,3);assert.equal(filas[1].fin,'2026-11-04');
  assert.deepEqual(periodoGantt(ot),{inicio:'2026-10-30',fin:'2026-11-04'});
  delete ot.gantt.fechaRecepcionEstimada;
  assert.equal(filasGantt(ot)[1].fin,'2026-11-04');
  ot.gantt.diasRepuestos=0;assert.equal(filasGantt(ot).some(f=>f.tipo==='espera'),false);
});
test('Gantt distribuye actividades en días hábiles y calcula espera de repuestos',()=>{
  const {planificar}=require('../functions/planificacion-libre.js');
  const ot={etapasPersonalizadas:[{id:'e_0',nombre:'Limpieza propia',items:[{item:'A'},{item:'B'},{item:'C'}]}]};
  const datos={etapas:[{id:'e_0',inicio:'2026-11-06',fin:'2026-11-10'}],fechaInicio:'2026-11-06',fechaTermino:'2026-11-10',fechaSolicitudRepuestos:'2026-11-06',diasRepuestos:2,comentarioRepuestos:'Entrega parcial'};
  const plan=planificar(ot,datos,jefe,123);
  assert.deepEqual(plan.actividades.map(a=>a.inicio),['2026-11-06','2026-11-09','2026-11-10']);
  assert.equal(plan.fechaRecepcionEstimada,'2026-11-10');
  assert.equal(plan.etapas[0].duracion,3);
  assert.throws(()=>planificar(ot,{...datos,fechaTermino:'2026-11-08'},jefe,1),{code:'invalid-argument'});
  assert.throws(()=>planificar(ot,{...datos,diasRepuestos:-1},jefe,1),{code:'invalid-argument'});
  assert.throws(()=>planificar(ot,{...datos,etapas:[{id:'e_0',inicio:'2026-11-07',fin:'2026-11-08'}]},jefe,1),{code:'invalid-argument'});
});
test('guardar repuestos registra comentarios, responsable y fecha, y rechaza recepción pendiente',async()=>{
  const e=entorno();const {id}=await crearOT(e);const o=orden(e,id);
  o.etapasPersonalizadas[0].completada=true;o.etapasPersonalizadas[1].completada=true;o.etapasPersonalizadas[1].decision={resultado:'aprobada'};
  e.db.documentos.set('inventarioItems/a',{empresaId:'e',sucursalId:'s',recibido:true,datos:{OS:'PRUEBA',NP:'FILTRO'}});
  e.db.documentos.set('inventarioItems/b',{empresaId:'e',sucursalId:'s',recibido:false,datos:{OS:'PRUEBA',NP:'PENDIENTE'}});
  await mutar(e,id,'sincronizarRepuestos','e_2');
  await assert.rejects(mutar(e,id,'guardarRepuestos','e_2',{items:[{itemId:'a',usado:true},{itemId:'b',usado:true}]}),{code:'failed-precondition'});
  assert.equal(orden(e,id).repuestos.items[0].usado,false);
  await mutar(e,id,'guardarRepuestos','e_2',{items:[{itemId:'a',usado:true,comentario:'Instalado'}]});
  const rep=orden(e,id).repuestos.items[0];assert.equal(rep.comentario,'Instalado');assert.equal(rep.tecnico,'Técnico');assert.ok(rep.fecha);
  await mutar(e,id,'guardarRepuestos','e_2',{items:[{itemId:'a',usado:false,comentario:'Retirado'}]});
  assert.equal(orden(e,id).repuestos.items[0].tecnico,'');
  const ot=orden(e,id);assert.match(vistaAccesos(ot,ot.etapasPersonalizadas[2],jefe,false),/Ver carta Gantt/);
  assert.equal(vistaAccesos(ot,ot.etapasPersonalizadas[0],jefe,false),'');
});
test('filas Gantt reflejan avance actual y omisiones sin modificar el checklist',()=>{
  const ot={etapasPersonalizadas:[{id:'e_0',nombre:'Etapa propia',items:[{ok:true},{ok:false}],completada:false}],gantt:{etapas:[{id:'e_0',inicio:'2026-11-02',fin:'2026-11-03'}],actividades:[{etapaId:'e_0',itemIndex:1,nombre:'B',inicio:'2026-11-03',fin:'2026-11-03'}]}};
  assert.equal(filasGantt(ot)[0].avance,50);assert.equal(filasGantt(ot)[1].avance,0);
  assert.equal(filasPrincipalesGantt(ot).length,1);
  assert.equal(filasPrincipalesGantt(ot)[0].tipo,'etapa');
  ot.etapasPersonalizadas[0].items[1].ok=true;assert.equal(filasGantt(ot)[1].avance,100);
});
test('identificación editable solo por jefe y repuestos restringidos a OS y sucursal',async()=>{
  const e=entorno();const {id}=await crearOT(e);
  e.db.documentos.set('inventarioItems/a',{empresaId:'e',sucursalId:'s',recibido:true,datos:{OS:'OS-2',NP:'N1',DESCRIPCION:'Filtro',CANTIDAD:2}});
  e.db.documentos.set('inventarioItems/b',{empresaId:'e',sucursalId:'otra',recibido:true,datos:{OS:'OS-2',NP:'AJENO'}});
  const valores={equipo:'Nuevo',serie:'456',cliente:'Otro cliente',os:'OS-2'};
  await assert.rejects(mutar(e,id,'identificacion',undefined,valores,tecnico),{code:'permission-denied'});
  await mutar(e,id,'identificacion',undefined,valores,jefe);
  const ot=orden(e,id);assert.equal(ot.equipo,'Nuevo');assert.equal(ot.repuestos.items.length,1);assert.equal(ot.repuestos.items[0].codigo,'N1');
  assert.equal(ot.historialIdentificacion[0].anterior.equipo,'Compresor');
  assert.equal(ot.etapasPersonalizadas[0].completada,false);
  await assert.rejects(mutar(e,id,'guardarGantt',undefined,{etapas:[]},jefe),{code:'failed-precondition'});
});
test('aprobación habilita repuestos y Gantt en la etapa siguiente, con permisos y fechas válidas',async()=>{
  const e=entorno();const {id}=await crearOT(e);
  e.db.documentos.set('inventarioItems/a',{empresaId:'e',sucursalId:'s',recibido:true,datos:{OS:'PRUEBA',NP:'N1'}});
  const ot=orden(e,id);ot.etapasPersonalizadas[0].completada=true;ot.etapasPersonalizadas[1].completada=true;ot.etapasPersonalizadas[1].decision={resultado:'aprobada'};
  await mutar(e,id,'sincronizarRepuestos','e_2');
  await mutar(e,id,'usarRepuesto','e_2',{itemId:'a',usado:true});
  assert.equal(orden(e,id).repuestos.items[0].usado,true);
  await assert.rejects(mutar(e,id,'identificacion',undefined,{equipo:'E',serie:'S',cliente:'C',os:'DISTINTA'},jefe),{code:'failed-precondition'});
  const etapas=ot.etapasPersonalizadas.map(e=>({id:e.id,inicio:'2026-11-01',fin:'2026-11-03'}));
  await assert.rejects(mutar(e,id,'guardarGantt','e_2',{etapas},tecnico),{code:'permission-denied'});
  await assert.rejects(mutar(e,id,'guardarGantt','e_2',{etapas:etapas.map(f=>({...f,fin:'2026-02-30'}))},jefe),{code:'invalid-argument'});
  await mutar(e,id,'guardarGantt','e_2',{etapas},jefe);
  assert.equal(orden(e,id).gantt.etapas[2].nombre,'Entrega final');
  assert.equal(e.db.documentos.get(`otsResumen/${id}`).gantt.fechaTermino,'2026-11-03');
  const html=vistaOperacion(orden(e,id),ot.etapasPersonalizadas[2],jefe,false);
  assert.match(html,/N1/);assert.match(html,/data-guardar-gantt/);
  assert.doesNotMatch(vistaOperacion(orden(e,id),ot.etapasPersonalizadas[0],jefe,false),/Carta Gantt/);
  assert.doesNotMatch(vistaOperacion(orden(e,id),ot.etapasPersonalizadas[2],{rol:'admin_empresa'},false),/data-guardar-gantt/);
  assert.match(vistaIdentificacion(orden(e,id),false),/Datos de identificación/);
});
test("decisiones del jefe: rechazo con salto conserva última etapa pendiente y registra omisiones",async()=>{
  for(const pasarUltima of [false,true]) {
    const e=entorno();e.datos.aprobaciones=["e_0"];const {id}=await crearOT(e);
    await completarItem(e,id,"e_0");
    const o=orden(e,id);o.etapasPersonalizadas[0].items[0].fotos[0].creadoPorUid=jefe.uid;
    const evidencias=[o.etapasPersonalizadas[0].items[0].fotos[0].url];
    e.bucket.file=()=>({getMetadata:async()=>[{metadata:{creadoPorUid:jefe.uid,firebaseStorageDownloadTokens:"token"}}]});
    const extras={comentario:"Servicio no autorizado por el cliente",evidencias,pasarUltima};
    await assert.rejects(mutar(e,id,"rechazar","e_0",extras,tecnico),{code:"permission-denied"});
    await assert.rejects(mutar(e,id,"rechazar","e_0",{...extras,comentario:""},jefe),{code:"invalid-argument"});
    await assert.rejects(mutar(e,id,"rechazar","e_0",{...extras,evidencias:["https://otro"]},jefe),{code:"invalid-argument"});
    await mutar(e,id,"rechazar","e_0",extras,jefe);
    const final=orden(e,id);assert.equal(final.etapasPersonalizadas[0].decision.resultado,"rechazada");
    assert.equal(e.db.documentos.get(`otsResumen/${id}`).servicioRechazado,pasarUltima);
    assert.equal(final.etapasPersonalizadas[1].omitidaPorRechazo===true,pasarUltima);
    assert.equal(final.etapasPersonalizadas.at(-1).completada,false);
    assert.equal(final.etapaActualNombre,final.etapasPersonalizadas[pasarUltima ? 2 : 0].nombre);
    await assert.rejects(mutar(e,id,"cerrar",undefined,{},jefe),{code:"failed-precondition"});
  }
});
test("aprobar registra comentario y responsable sin omitir trabajo",async()=>{
  const e=entorno();e.datos.aprobaciones=["e_0"];const {id}=await crearOT(e);await completarItem(e,id,"e_0");
  const item=orden(e,id).etapasPersonalizadas[0].items[0];item.fotos[0].creadoPorUid=jefe.uid;
  e.bucket.file=()=>({getMetadata:async()=>[{metadata:{creadoPorUid:jefe.uid,firebaseStorageDownloadTokens:"token"}}]});
  await mutar(e,id,"aprobar","e_0",{comentario:"Cliente autoriza",evidencias:[item.fotos[0].url],pasarUltima:false},jefe);
  assert.equal(orden(e,id).etapasPersonalizadas[0].decision.uid,jefe.uid);
  assert.equal(orden(e,id).etapasPersonalizadas[1].completada,false);
});
const mutar=(e,id,accion,etapaId="e_0",extras={},usuario=tecnico)=>actualizarOT({...e,usuario,datos:{otId:id,accion,etapaId,...extras}});
async function completarItem(e,id,etapaId,usuario=tecnico) {
  await mutar(e,id,"marcar",etapaId,{itemIndex:0,ok:true},usuario);
  await mutar(e,id,"comentar",etapaId,{itemIndex:0,texto:"Trabajo realizado",comentarioId:randomUUID()},usuario);
  const ruta=`ots/${id}/personalizada_${etapaId}/item_0/foto.jpg`;
  await mutar(e,id,"adjuntar",etapaId,{itemIndex:0,url:`https://firebasestorage.googleapis.com/v0/b/bucket/o/${encodeURIComponent(ruta)}?alt=media&token=token`,nombre:"foto.jpg"},tecnico);
}

test("Excel de nombres libres conserva nombres, orden y actividades sin imponer etapas fijas",()=>{
  const w=XLSX.utils.book_new();
  for(const nombre of ["Desarme","Control de tolerancias","Limpieza final","Prueba 1","Ajuste","Prueba 2","Entrega"]) XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([[`Actividad de ${nombre}`]]),nombre);
  const p=procesarLibroPlantilla(XLSX.read(XLSX.write(w,{type:"buffer",bookType:"xlsx"})),{},XLSX.utils);
  assert.equal(p.flujoVersion,2);assert.equal(p.etapas.length,7);assert.deepEqual(p.etapas.map(e=>e.nombre),w.SheetNames);
  assert.equal(p.etapas[1].items[0].item,"Actividad de Control de tolerancias");
  assert.throws(()=>procesarLibroPlantilla(w,{checklists:false},XLSX.utils),/no está habilitado/);
});

test("crear OT copia la plantilla de su sucursal, conserva el orden y es idempotente",async()=>{
  const e=entorno();const {id}=await crearOT(e);
  const o=orden(e,id);assert.deepEqual(o.etapasPersonalizadas.map(e=>e.nombre),e.plantilla.etapas.map(e=>e.nombre));
  assert.deepEqual(o.etapasPersonalizadas.map(e=>e.requiereAprobacion),[false,true,false]);
  assert.equal(o.etapaActualNombre,"Recepción especial");
  e.plantilla.etapas[0].nombre="Cambio posterior";
  assert.equal(orden(e,id).etapasPersonalizadas[0].nombre,"Recepción especial");
  assert.deepEqual(await crearOT(e),{id});assert.equal(orden(e,id).revision,1);
  e.db.documentos.set(`otsPapelera/${id}`,{orden:o});e.db.documentos.delete(`ots/${id}`);
  await assert.rejects(crearOT(e),{code:"failed-precondition"});
});

test("plantillas antiguas se leen desde su Excel original, recuperando nombres y hojas que no se guardaron",async()=>{
  const e=entorno(),w=XLSX.utils.book_new();
  for(const nombre of ["Inspeccion especial","Overhaul GX propio","Verificacion final"]) XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([[`Actividad ${nombre}`]]),nombre);
  const bytes=XLSX.write(w,{type:"buffer",bookType:"xlsx"});
  delete e.plantilla.flujoVersion;delete e.plantilla.etapas;
  e.plantilla.archivoRuta="empresas/e/sucursales/s/plantillas/p/original.xlsx";
  e.bucket.file=ruta=>{assert.equal(ruta,e.plantilla.archivoRuta);return {getMetadata:async()=>[{size:String(bytes.length)}],download:async()=>[bytes]};};
  const vista=await obtenerPlantilla({...e,datos:{plantillaId:"p"}});
  assert.deepEqual(vista.etapas.map(e=>e.nombre),w.SheetNames);
  assert.equal(e.plantilla.flujoVersion,undefined); // Leer no modifica la configuración de sucursal.
  await assert.rejects(crearOT({...e,datos:{...e.datos,huellaPlantilla:"otra"}}),{code:"failed-precondition"});
  const {id}=await crearOT({...e,datos:{...e.datos,huellaPlantilla:vista.huellaPlantilla}});
  assert.deepEqual(orden(e,id).etapasPersonalizadas.map(e=>e.nombre),w.SheetNames);
  e.plantilla.archivoRuta="empresas/e/sucursales/otra/plantillas/p/original.xlsx";
  e.bucket.file=()=>{throw Error("No debe leer otra sucursal");};
  await assert.rejects(obtenerPlantilla({...e,datos:{plantillaId:"p"}}),{code:"failed-precondition"});
});

test("flujo completo: orden secuencial, aprobación del jefe, cierre y resumen coherente",async()=>{
  const e=entorno();const {id}=await crearOT(e);
  await assert.rejects(mutar(e,id,"marcar","e_1",{itemIndex:0,ok:true}),{code:"failed-precondition"});
  await assert.rejects(mutar(e,id,"completar"),{code:"failed-precondition"});
  await completarItem(e,id,"e_0");await mutar(e,id,"completar");
  assert.equal(orden(e,id).etapaActualNombre,"Desarme e inspección");
  await assert.rejects(mutar(e,id,"marcar","e_0",{itemIndex:0,ok:false}),{code:"failed-precondition"});
  await completarItem(e,id,"e_1");
  await assert.rejects(mutar(e,id,"completar","e_1"),{code:"permission-denied"});
  await mutar(e,id,"completar","e_1",{},jefe);
  await assert.rejects(mutar(e,id,"cerrar",undefined,{},jefe),{code:"failed-precondition"});
  await completarItem(e,id,"e_2");await mutar(e,id,"completar","e_2");
  await assert.rejects(mutar(e,id,"cerrar"),{code:"permission-denied"});
  await mutar(e,id,"cerrar",undefined,{},jefe);
  assert.equal(orden(e,id).cerrada,true);assert.equal(orden(e,id).estado,"CERRADA");
  assert.equal(e.db.documentos.get(`otsResumen/${id}`).etapasPersonalizadas.length,3);
  assert.equal(progresoLibre(orden(e,id)),100);
  assert.equal(gruposLibresInforme(orden(e,id))[1].nombre,"Desarme e inspección");
  await assert.rejects(mutar(e,id,"marcar","e_2",{itemIndex:0,ok:false}),{code:"failed-precondition"});
});

test("roles, sucursales, cancelación y plan protegen el flujo libre",async()=>{
  for(const cambio of [{rol:"tecnico"},{rol:"admin_empresa"},{activo:false},{empresaId:"otra"},{sucursalId:"otra"}]) {
    const e=entorno();await assert.rejects(crearOT({...e,usuario:{...jefe,...cambio}}));
  }
  for(const estado of ["cancelacion_solicitada","periodo_exportacion","pendiente_eliminacion","cancelada"]) {
    const e=entorno();e.db.documentos.get("empresas/e").suscripcion={estado};await assert.rejects(crearOT(e),{code:"failed-precondition"});
  }
  const e=entorno();e.db.documentos.get("empresas/e").modulos={aprobaciones:false};await assert.rejects(crearOT(e),{code:"permission-denied"});
  e.db.documentos.get("empresas/e").modulos={aprobaciones:true};e.db.documentos.get("empresas/e").modulosContratados=[];
  await assert.rejects(crearOT(e),{code:"permission-denied"});
  e.db.documentos.get("empresas/e").modulosContratados=["aprobaciones"];
  const {id}=await crearOT(e);
  for(const cambio of [{rol:"admin_empresa"},{rol:"admin_sucursal"},{rol:"planificador"},{rol:"super_admin"},{activo:false},{sucursalId:"otra"}]) {
    await assert.rejects(mutar(e,id,"marcar","e_0",{itemIndex:0,ok:true},{...tecnico,...cambio}));
  }
  await assert.rejects(crearOT({...e,datos:{...e.datos,solicitudId:randomUUID(),aprobaciones:["etapa-inventada"]}}),{code:"invalid-argument"});
  assert.throws(()=>etapasDePlantilla({flujoVersion:2,etapas:[{nombre:"Vacía",items:[]}]}),{code:"invalid-argument"});
});

test("comentarios y evidencias respetan autoría, etapa y actividad",async()=>{
  const e=entorno();const {id}=await crearOT(e);const comentarioId=randomUUID();
  await mutar(e,id,"comentar","e_0",{itemIndex:0,texto:"Texto",comentarioId});
  await mutar(e,id,"comentar","e_0",{itemIndex:0,texto:"Texto",comentarioId});
  assert.equal(orden(e,id).etapasPersonalizadas[0].items[0].comentarios.length,1);
  await assert.rejects(mutar(e,id,"quitarComentario","e_0",{itemIndex:0,comentarioId},jefe),{code:"permission-denied"});
  await mutar(e,id,"quitarComentario","e_0",{itemIndex:0,comentarioId});
  await completarItem(e,id,"e_0");
  const f=orden(e,id).etapasPersonalizadas[0].items[0].fotos[0];
  await assert.rejects(eliminarArchivoOT({...e,usuario:tecnico,datos:{otId:id,url:f.url}}),{code:"failed-precondition"});
  await assert.rejects(mutar(e,id,"quitarEvidencia","e_0",{itemIndex:0,url:f.url},jefe),{code:"permission-denied"});
  await assert.rejects(mutar(e,id,"adjuntar","e_0",{itemIndex:0,url:"https://evil.invalid/a"}),{code:"invalid-argument"});
  await assert.rejects(mutar(e,id,"adjuntar","e_0",{itemIndex:0,url:f.url.replace("personalizada_e_0","personalizada_e_1")}),{code:"invalid-argument"});
  const previo=e.bucket.file;
  e.bucket.file=()=>({getMetadata:async()=>{throw Object.assign(Error("Falta"),{code:404});}});
  await assert.rejects(mutar(e,id,"completar"),{code:"failed-precondition"});
  e.bucket.file=previo;
});

test("archivos de etapas completadas o futuras no pueden subirse ni borrarse",async()=>{
  const e=entorno();const {id}=await crearOT(e);
  await assert.rejects(subirArchivoOT({...e,usuario:tecnico,datos:{otId:id,etapa:"personalizada_e_1",itemIndex:0,subidaId:randomUUID()}}),{code:"invalid-argument"});
  await completarItem(e,id,"e_0");const url=orden(e,id).etapasPersonalizadas[0].items[0].fotos[0].url;
  await mutar(e,id,"completar");
  await assert.rejects(eliminarArchivoOT({...e,usuario:tecnico,datos:{otId:id,url}}),{code:"failed-precondition"});
});

test("la vista usa nombres libres seguros, limita el avance y oculta acciones de administradores",async()=>{
  const e=entorno();const {id}=await crearOT(e);const ot={id,...orden(e,id)};
  ot.etapasPersonalizadas[0].nombre='<img src=x onerror="alert(1)">';
  const propia=crearVistaFlujoLibre({ot,usuario:tecnico,seleccionado:"e_0"}).html;
  assert.match(propia,/&lt;img/);assert.doesNotMatch(propia,/<img src=x/);
  assert.match(propia,/data-etapa-libre="e_1"[^>]*disabled/);
  const vistaJefe=crearVistaFlujoLibre({ot,usuario:jefe,seleccionado:"e_1"}).html;
  assert.match(vistaJefe,/data-etapa-libre="e_1"[^>]*aria-current="step"/);
  assert.doesNotMatch(vistaJefe,/data-etapa-libre="[^"]+"[^>]*\bdisabled\b/);
  assert.doesNotMatch(vistaJefe,/data-subir|data-comentar|data-completar/);
  const consulta=crearVistaFlujoLibre({ot,usuario:{...jefe,rol:"admin_sucursal"},seleccionado:"e_0"}).html;
  assert.match(consulta,/data-marcar="0"[^>]*disabled/);
  assert.doesNotMatch(consulta,/data-subir|data-comentar|data-completar|data-cerrar/);
});

test("el PDF real incluye las etapas libres y las actividades en su orden",async()=>{
  const e=entorno();const {id}=await crearOT(e);const ot={id,...orden(e,id)};
  ot.etapasPersonalizadas[0].nombre="Desarme propio";ot.etapasPersonalizadas[1].nombre="Control dimensional";
  const {jsPDF}=require("jspdf");require("jspdf-autotable").applyPlugin(jsPDF);
  let salida;const errores=[];
  function Documento(...args){const d=new jsPDF(...args);d.save=()=>{salida=Buffer.from(d.output("arraybuffer"));};return d;}
  const boton={dataset:{},addEventListener(){}};
  const contexto=vm.createContext({esFlujoLibre,gruposLibresInforme,
    window:{jspdf:{jsPDF:Documento},alert:mensaje=>errores.push(mensaje)},
    document:{getElementById:()=>boton},console:{log(){},warn(){},error:e=>errores.push(String(e))},setTimeout,clearTimeout});
  let fuente=await readFile(new URL("../js/modulos/informePDF.js",import.meta.url),"utf8");
  fuente=fuente.replace(/^import[\s\S]*?;\r?\n/gm,"").replace(/^export /gm,"");
  vm.runInContext(fuente,contexto);
  contexto.inicializarModuloInformePDF({getOT:()=>ot,getUsuario:()=>jefe,obtenerEstadoOT:()=>"Desarme propio",convertirImagenABase64:async()=>null,
    reportesPDFHabilitados:()=>true,obtenerEtapasHabilitadas:()=>({}),obtenerConfiguracionEmpresaInforme:async()=>({nombre:"Empresa"})});
  const resumen=contexto.window.obtenerResumenEjecutivoInforme();assert.equal(resumen.totalActividades,3);
  await contexto.window.generarPDF();
  assert.deepEqual(errores,[]);assert.ok(salida?.length>1000);
  const contenido=salida.toString("latin1");assert.match(contenido,/Desarme propio/);assert.match(contenido,/Control dimensional/);assert.match(contenido,/Entrega final/);
});

async function controlesGama(plantillas) {
  const fuente=await readFile(new URL("../js/app.js",import.meta.url),"utf8");
  const extraer=(inicio,fin)=>fuente.slice(fuente.indexOf(inicio),fuente.indexOf(fin));
  function nodo(tag="div") {return {tag,dataset:{},children:[],checked:false,disabled:false,hidden:false,addEventListener(){},
    append(...hijos){for(const h of hijos){h.parent=this;this.children.push(h);}},appendChild(h){this.append(h);},replaceChildren(){this.children=[];},closest(){return this.parent;}};}
  const opciones=nodo(),panel={dataset:{},hidden:true,open:false,querySelector:()=>opciones},gama={value:plantillas[0].id},resumen={},boton={disabled:false};
  const campos=()=>{const resultado=[];function recorrer(n){if(n.dataset.aprobacionEtapa)resultado.push(n);n.children.forEach(recorrer);}recorrer(opciones);return resultado;};
  const contexto=vm.createContext({document:{createElement:nodo,getElementById:id=>({configAprobacionesOT:panel,gamaEquipo:gama,resumenAprobacionesOT:resumen,btnGuardarDatosOT:boton})[id],querySelectorAll:()=>campos(),querySelector:s=>campos().find(c=>s.includes(`"${c.dataset.aprobacionEtapa}"`))},
    plantillasMantenimiento:plantillas,etapasActivas:{},aprobacionesActivas:true,esJefeTaller:()=>true,ot:null,localStorage:{getItem:()=>null},
    etapasDePlantilla:etapasLegado,notificarFlujo:async()=>{}});
  vm.runInContext(extraer("function obtenerAprobacionesSeleccionadas(","function renderDecisionEtapa(")+extraer("async function asegurarEtapasDeGama(","function configurarInterfazAprobaciones("),contexto);
  return {contexto,campos,panel,gama,resumen,boton,opciones};
}

test("el selector usa cualquier nombre, limpia elecciones al cambiar la plantilla y reconoce un cambio de versión",async()=>{
  const plantilla={id:"a",huellaPlantilla:"v1",flujoVersion:2,etapas:[{nombre:'Desarme <img src=x>'},{nombre:"Control de tolerancias"},{nombre:"Entrega especial"}]};
  const c=await controlesGama([plantilla,{id:"legado",checklists:{ingreso:["Revisar"]}}]);
  c.contexto.actualizarOpcionesAprobacionPorPlantilla();
  assert.equal(c.panel.open,true);assert.equal(c.campos().length,3);
  assert.deepEqual(c.campos().map(n=>n.dataset.nombreEtapa),plantilla.etapas.map(e=>e.nombre));
  c.campos()[1].checked=true;c.contexto.actualizarResumenAprobaciones();assert.equal(c.resumen.textContent,"Control de tolerancias");
  assert.equal(c.contexto.obtenerAprobacionesSeleccionadas().e_1,true);
  plantilla.huellaPlantilla="v2";plantilla.etapas=[{nombre:"Secuencia nueva"}];c.contexto.actualizarOpcionesAprobacionPorPlantilla();
  assert.equal(c.campos().length,1);assert.equal(c.campos()[0].checked,false);assert.equal(c.campos()[0].dataset.nombreEtapa,"Secuencia nueva");
  c.gama.value="legado";c.contexto.actualizarOpcionesAprobacionPorPlantilla();
  assert.equal(c.campos().length,5);assert.equal(c.campos()[0].dataset.aprobacionEtapa,"ingreso");assert.equal(c.campos()[0].disabled,false);
});

test("una lectura tardía de la gama anterior no reemplaza las etapas de la gama actual",async()=>{
  const c=await controlesGama([{id:"sucursal:a"},{id:"sucursal:b"}]),respuestas={};
  c.contexto.obtenerPlantillaLibre=({plantillaId})=>new Promise(resolve=>{respuestas[plantillaId]=resolve;});
  const primera=c.contexto.asegurarEtapasDeGama();assert.equal(c.boton.disabled,true);
  c.gama.value="sucursal:b";const segunda=c.contexto.asegurarEtapasDeGama();
  respuestas.b({data:{flujoVersion:2,huellaPlantilla:"b1",etapas:[{nombre:"Etapa B"}]}});await segunda;
  assert.equal(c.campos()[0].dataset.nombreEtapa,"Etapa B");assert.equal(c.boton.disabled,false);
  respuestas.a({data:{flujoVersion:2,huellaPlantilla:"a1",etapas:[{nombre:"Etapa A"}]}});await primera;
  assert.equal(c.campos()[0].dataset.nombreEtapa,"Etapa B");assert.equal(c.boton.disabled,false);
});
