import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createRequire } from "node:module";
import { procesarLibroPlantilla } from "../js/plantillas-excel.js";
import { etapasDePlantilla, etapasDeOT, actualizarVisibilidadFlujo } from "../js/flujo-etapas.js";

import {
  aplicarPermisosRol,
  esJefeTaller,
  esUsuarioTaller,
  inicializarPermisos,
  puedeEliminarComentario,
} from "../js/modulos/core/permisos.js";
import { puedeAbrirOT, puedeCrearOT } from "../js/permisos.js";

function usarUsuario(usuario) {
  inicializarPermisos({ getUsuario: () => usuario });
}

test("Nueva OT comienza vacía y retira solo su borrador; una OT existente conserva sus datos", async () => {
  const fuente=await readFile(new URL("../js/app.js",import.meta.url),"utf8");
  const inicio=fuente.indexOf("function inicializarFormularioNuevaOT()"),fin=fuente.indexOf('window.addEventListener("pageshow"',inicio);
  const campos=Object.fromEntries(["equipo","serie","gamaEquipo","cliente","os"].map(id=>[id,{value:"Datos de una prueba anterior"}]));
  const panel={hidden:false,open:true,dataset:{plantilla:"anterior",firma:"anterior"}},resumen={},boton={disabled:true},checks=[{checked:true}];
  const clave="borrador-propio",memoria=new Map([[clave,"anterior"],["borrador-otra-cuenta","conservar"]]);
  const solicitudes=new Map([["overtrack:flujo-libre:u","anterior"],["overtrack:creacion-ot:e:u","anterior"],["overtrack:flujo-libre:otro","conservar"]]);
  const c=vm.createContext({ot:null,usuario:{uid:"u",empresaId:"e"},claveBorradorIdentificacion:clave,
    sessionStorage:{removeItem:k=>solicitudes.delete(k)},
    localStorage:{getItem:k=>memoria.get(k)||null,removeItem:k=>memoria.delete(k)},
    document:{getElementById:id=>campos[id] || ({configAprobacionesOT:panel,resumenAprobacionesOT:resumen,btnGuardarDatosOT:boton})[id],querySelectorAll:()=>checks}});
  vm.runInContext(fuente.slice(inicio,fin),c);c.inicializarFormularioNuevaOT();
  assert.equal(Object.values(campos).every(c=>c.value===""),true);
  assert.equal(memoria.has(clave),false);assert.equal(memoria.get("borrador-otra-cuenta"),"conservar");
  assert.deepEqual([...solicitudes.entries()],[["overtrack:flujo-libre:otro","conservar"]]);
  assert.equal(panel.hidden,true);assert.equal(panel.open,false);assert.equal(checks[0].checked,false);
  assert.equal(resumen.textContent,"Sin aprobaciones");assert.equal(boton.disabled,false);
  for(const existente of ["cargada","pendiente-de-carga"]) {
    campos.equipo.value="Equipo de la OT existente";memoria.set(clave,"conservar mientras edita");
    c.ot=existente==="cargada"?{id:"ot-1"}:null;
    if(existente==="pendiente-de-carga")memoria.set("otActiva","ot-1");
    c.inicializarFormularioNuevaOT();
    assert.equal(campos.equipo.value,"Equipo de la OT existente");assert.equal(memoria.get(clave),"conservar mientras edita");
  }
});

test("el flujo permanece oculto hasta que la OT exista, incluso con una gama seleccionada", () => {
  const propiedades = new Map();
  const timeline = { style: { setProperty: (k,v) => propiedades.set(k,v), removeProperty: k => propiedades.delete(k) } };
  for (const ot of [null, {}, { plantillaMantenimientoId: "seleccionada" }]) {
    actualizarVisibilidadFlujo(timeline, ot);
    assert.equal(timeline.hidden, true);
    assert.equal(propiedades.get("display"), "none");
  }
  actualizarVisibilidadFlujo(timeline, {id:"guardada"});
  assert.equal(timeline.hidden,false); assert.equal(propiedades.has("display"),false);
});

test("la nueva OT utiliza las etapas de su plantilla dentro de los módulos contratados", () => {
  const plantilla = { etapasHabilitadas: {ingreso:true,evaluacion:false,mantencion:true,pruebas:false,despacho:false}, checklists:{ingreso:["Revisión"],mantencion:["Motor"]} };
  assert.deepEqual(etapasDePlantilla(plantilla, {mantencion:false}), {ingreso:true,evaluacion:false,mantencion:false,pruebas:false,despacho:false});
  assert.deepEqual(etapasDePlantilla({checklists:{evaluacion:["Revisión"]}},{}), {ingreso:false,evaluacion:true,mantencion:false,pruebas:false,despacho:false});
});

test("al reabrir una OT se conservan sus etapas guardadas, con compatibilidad para órdenes antiguas", () => {
  const guardadas = {ingreso:true,evaluacion:false,mantencion:true,pruebas:false,despacho:false};
  assert.deepEqual(etapasDeOT({etapasHabilitadas:guardadas},{ingreso:false,evaluacion:true}),guardadas);
  assert.deepEqual(etapasDeOT({}, {pruebas:false}), {ingreso:true,evaluacion:true,mantencion:true,pruebas:false,despacho:true});
});

test("seleccionar gama abre las aprobaciones reales y elimina selecciones de etapas ajenas", async () => {
  const fuente = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const extraer = (inicio, fin) => fuente.slice(fuente.indexOf(`function ${inicio}(`), fuente.indexOf(`function ${fin}(`));
  const panel = {hidden:true,open:false,dataset:{}}, gama = {value:"motor"}, resumen = {};
  const campos = ["ingreso","evaluacion","mantencion","pruebas","despacho"].map(etapa => {
    const label = {};
    return {dataset:{aprobacionEtapa:etapa},checked:false,closest:()=>label};
  });
  const contexto = vm.createContext({
    document:{getElementById:id=>({configAprobacionesOT:panel,gamaEquipo:gama,resumenAprobacionesOT:resumen})[id],querySelectorAll:()=>campos,querySelector:selector=>campos.find(c=>selector.includes(`"${c.dataset.aprobacionEtapa}"`))},
    etapasDePlantilla, etapasActivas:{}, aprobacionesActivas:true, esJefeTaller:()=>true, ot:null,
    plantillasMantenimiento:[{id:"motor",hojasExcel:["ingreso","evaluacion","mantencion"],etapasHabilitadas:{ingreso:true,evaluacion:true,mantencion:true,pruebas:false,despacho:false}}, {id:"bomba",hojasExcel:["pruebas","despacho"],etapasHabilitadas:{ingreso:false,evaluacion:false,mantencion:false,pruebas:true,despacho:true}}]
  });
  vm.runInContext(extraer("obtenerAprobacionesSeleccionadas","renderDecisionEtapa") + extraer("actualizarOpcionesAprobacionPorPlantilla","configurarInterfazAprobaciones"),contexto);
  contexto.actualizarOpcionesAprobacionPorPlantilla();
  assert.equal(panel.open,true); assert.equal(panel.hidden,false);
  assert.deepEqual(campos.map(c=>c.closest().hidden),[false,false,false,true,true]);
  campos[0].checked=true; campos[1].checked=true; campos[2].checked=true;
  contexto.actualizarResumenAprobaciones();
  assert.equal(resumen.textContent,"Ingreso, Evaluación, Mantención");
  assert.equal(contexto.obtenerAprobacionesSeleccionadas().ingreso,true);
  assert.equal(contexto.obtenerAprobacionesSeleccionadas().mantencion,true);
  panel.open=false; // El usuario puede cerrar el panel sin que cada actualización lo reabra.
  contexto.actualizarOpcionesAprobacionPorPlantilla(); assert.equal(panel.open,false);
  gama.value="bomba";
  contexto.actualizarOpcionesAprobacionPorPlantilla();
  assert.equal(panel.open,true);
  assert.deepEqual(campos.map(c=>c.checked),[false,false,false,false,false]);
  assert.deepEqual(campos.map(c=>c.disabled),[true,true,true,false,false]);
  assert.equal(resumen.textContent,"Sin aprobaciones");
  gama.value=""; contexto.actualizarOpcionesAprobacionPorPlantilla();
  assert.equal(panel.hidden,true); assert.equal(panel.open,false);
});

test("la acción de Ingreso exige al jefe cuando corresponde y restaura el estado si falla el guardado", async () => {
  const fuente = await readFile(new URL("../js/modulos/ingreso.js",import.meta.url),"utf8");
  const funcion = fuente.slice(fuente.indexOf("async function aprobarIngreso()"),fuente.indexOf("window.cargarIngreso ="));
  for (const [requiere,jefe,guardado] of [[true,false,true],[true,true,true],[false,false,true],[true,true,false]]) {
    const ot={ingresoAprobado:false,estado:"INGRESO"}; let guardados=0,avances=0;
    const c=vm.createContext({aprobacionIngresoEnCurso:false,getOT:()=>ot,OTBloqueada:()=>false,
      aprobacionesHabilitadas:()=>requiere,esJefeTaller:()=>jefe,validarIngresoCompleto:()=>true,
      mostrarAlerta:()=>{},document:{querySelectorAll:()=>[]},obtenerEstadoOT:()=>"EVALUACION",
      guardarCambiosOT:async()=>{guardados++;return guardado;},navegarSiguienteEtapa:()=>{avances++;}});
    vm.runInContext(funcion,c); await c.aprobarIngreso();
    assert.equal(guardados,requiere && !jefe ? 0 : 1);
    const finaliza=(!requiere || jefe) && guardado;
    assert.equal(ot.ingresoAprobado,finaliza); assert.equal(avances,finaliza?1:0);
    if(!finaliza) assert.equal(ot.estado,"INGRESO");
  }
});

const XLSX = createRequire(import.meta.url)("xlsx");
function libroDePrueba(hojas) {
  const libro = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), nombre);
  return XLSX.read(XLSX.write(libro, { type:"buffer", bookType:"xlsx" }));
}
const todosLosModulos = {ingreso:true,evaluacion:true,mantencion:true,pruebas:true,despacho:true};
test("Excel GX produce sus cuatro etapas reales, incluso si el plan incluye Despacho", () => {
  const libro = libroDePrueba({INGRESO:[["Guía"]],EVALUACION:[["Revisar motor"]],MANTENCION:[["Cambiar aceite"]],PRUEBAS:[["Mantención Válvula Check"],["Mantención Válvula Admisión"],["Mantención Válvula Termostática"]]});
  const p=procesarLibroPlantilla(libro,todosLosModulos,XLSX.utils);
  assert.deepEqual(p.hojasExcel,["ingreso","evaluacion","mantencion","pruebas"]);
  assert.deepEqual(p.etapasHabilitadas,{...todosLosModulos,despacho:false});
  assert.equal(p.total,6); assert.equal(p.checklists.pruebas.length,3);
  assert.deepEqual(etapasDePlantilla(p,todosLosModulos),p.etapasHabilitadas);
  // Compatibilidad con GX cargada antes de corregir el importador.
  assert.deepEqual(etapasDePlantilla({checklists:p.checklists,etapasHabilitadas:todosLosModulos},todosLosModulos),p.etapasHabilitadas);
});
test("Excel reducido no exige hojas ajenas, respeta módulos y detecta Despacho explícito", () => {
  const p=procesarLibroPlantilla(libroDePrueba({" Evaluación ":[["Medir"]],Despacho:[["Entregar"]]}),todosLosModulos,XLSX.utils);
  assert.deepEqual(p.etapasHabilitadas,{ingreso:false,evaluacion:true,mantencion:false,pruebas:false,despacho:true});
  assert.equal(p.checklists.despacho[0].item,"Entregar");
  const restringida=procesarLibroPlantilla(libroDePrueba({Ingreso:[["Recibir"]],Pruebas:[["Probar"]]}),{...todosLosModulos,pruebas:false},XLSX.utils);
  assert.equal(restringida.etapasHabilitadas.pruebas,false); assert.deepEqual(restringida.ignoradas,["Pruebas"]);
  assert.throws(()=>procesarLibroPlantilla(libroDePrueba({Ingreso:[]}),todosLosModulos,XLSX.utils),/vacía/);
  const libre=procesarLibroPlantilla(libroDePrueba({"Desarme previo":[["Desarmar"]],"Inspección especial":[["Medir"]]}),todosLosModulos,XLSX.utils);
  assert.deepEqual(libre.etapas.map(e=>e.nombre),["Desarme previo","Inspección especial"]);
  assert.equal(libre.flujoVersion,2);
});

test("Jefe de Taller conserva las facultades de aprobación", () => {
  usarUsuario({ uid: "jefe-1", rol: "jefe_taller" });
  assert.equal(esJefeTaller(), true);
  assert.equal(esUsuarioTaller(), false);
});

for (const rol of ["supervisor", "tecnico"]) {
  test(`${rol} es reconocido como trabajador operativo`, () => {
    usarUsuario({ uid: `${rol}-1`, rol });
    assert.equal(esJefeTaller(), false);
    assert.equal(esUsuarioTaller(), true);
  });

  test(`${rol} puede eliminar su comentario y no el de otro trabajador`, () => {
    usarUsuario({ uid: `${rol}-1`, rol });
    assert.equal(puedeEliminarComentario({ rol, creadoPorUid: `${rol}-1` }), true);
    assert.equal(puedeEliminarComentario({ rol, creadoPorUid: `${rol}-2` }), false);
    assert.equal(puedeEliminarComentario({ rol: "jefe_taller", creadoPorUid: "jefe-1" }), false);
  });
}

test("la aplicación de permisos no falla sin usuario cargado", () => {
  usarUsuario(null);
  assert.doesNotThrow(() => aplicarPermisosRol());
});

test("Planificador puede abrir una OT, pero no crearla", () => {
  const usuario = {
    uid: "planificador-1",
    rol: "planificador",
    sucursalId: "sucursal-1",
    empresaId: "empresa-1",
    activo: true,
  };
  const empresa = {
    id: "empresa-1",
    modulos: { ordenesServicio: true },
  };

  assert.equal(puedeAbrirOT(usuario, empresa), true);
  assert.equal(puedeCrearOT(usuario, empresa), false);
});
