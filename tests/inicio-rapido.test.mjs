import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const leer = ruta=>readFile(new URL(`../${ruta}`,import.meta.url),"utf8");
const programa = await leer("js/programacion.js");
const dashboard = await leer("js/dashboard.js");
const excel = await leer("js/cargar-excel.js");
const turno = ()=>new Promise(r=>setImmediate(r));
function pendiente(){let resolver,rechazar;const promesa=new Promise((r,j)=>{resolver=r;rechazar=j;});return {promesa,resolver,rechazar};}

function entornoProgramacion({ habilitada=true, borradores=false }={}) {
  const usuarios=pendiente(),sheq=pendiente(),operativos=pendiente(),semana=pendiente(),asignaciones=pendiente(),confirmaciones=pendiente();
  const llamadas=[],mensajes=[];let renders=0,finales=0;
  const contexto=vm.createContext({Promise,Set,console:{error(){},warn(){}},
    configurarInterfaz(){},auth:{authStateReady:async()=>{},currentUser:{uid:"u"}},
    cargarEmpresa:async()=>{llamadas.push("empresa");return habilitada;},actualizarNavegacionProgramacion:()=>llamadas.push("navegacion"),
    cargarUsuariosYSucursales:()=>{llamadas.push("usuarios");return usuarios.promesa;},
    cargarDocumentosSheq:()=>{llamadas.push("sheq");return sheq.promesa;},
    cargarDatosOperativosProgramacion:()=>{llamadas.push("operativos");return operativos.promesa;},
    actualizarSelectoresAsignacion:()=>llamadas.push("selectores"),
    window:{OverTrackUI:{finalizarCargaPagina:()=>{finales++;}}},
    $:()=>({style:{},innerHTML:"",textContent:""}),escapar:String,
    mostrarMensaje:m=>mensajes.push(m),
    db:{},empresaId:"e",usuario:{uid:"u"},semanaInicio:new Date("2026-11-02"),fechaISO:()=>"2026-11-02",sumarDias:()=>new Date("2026-11-08"),
    ES_TRABAJADOR_CON_SEMANA_PERSONAL:false,PUEDE_VER_BORRADORES:borradores,
    doc:(_db,c)=>({c}),collection:(_db,c)=>({c}),where(){},limit(){},query:(c)=>c,
    getDoc:()=>{llamadas.push("semana");return semana.promesa;},
    getDocs:q=>{
      const esSemana=q.c==="programacionSemanas";
      llamadas.push(esSemana?"semana":"asignaciones");
      return esSemana?semana.promesa:asignaciones.promesa;
    },
    cargarConfirmacionesSemana:()=>{llamadas.push("confirmaciones");return borradores?confirmaciones.promesa:Promise.resolve();},
    actualizarEncabezadoSemana(){},renderCuadro:()=>{renders++;},
    asignacionesEmpresa:[],asignacionesSemana:[],turnosEmergenciaSemana:new Set(),estadoSemanaActual:"borrador"
  });
  const cargar=programa.match(/async function cargarSemana\([\s\S]*?\) \{[\s\S]*?\n\}/)[0];
  const iniciar=programa.slice(programa.lastIndexOf("async function iniciar()"),programa.lastIndexOf("\niniciar();"));
  vm.runInContext(`${cargar}\n${iniciar}`,contexto);
  return {contexto,llamadas,mensajes,usuarios,sheq,operativos,semana,asignaciones,confirmaciones,renders:()=>renders,finales:()=>finales};
}

test("Programación consulta usuarios, SHEQ, datos y semana a la vez, pero renderiza después de reunirlos",async()=>{
  const e=entornoProgramacion(),inicio=e.contexto.iniciar();await turno();
  assert.deepEqual(e.llamadas,["empresa","navegacion","usuarios","sheq","operativos","semana"]);
  e.semana.resolver({docs:[{data:()=>({estado:"publicada",asignaciones:[{id:"a",fecha:"2026-11-02"}]})}]});
  await turno();assert.equal(e.renders(),0);
  e.usuarios.resolver();e.operativos.resolver();await turno();assert.equal(e.renders(),0);
  e.sheq.resolver();await inicio;
  assert.equal(e.renders(),1);assert.equal(e.finales(),1);assert.equal(e.mensajes.length,1);
  assert.equal(e.contexto.asignacionesSemana[0].id,"a");
  assert.ok(e.llamadas.indexOf("selectores")>e.llamadas.indexOf("semana"));
});

test("Programación respeta la habilitación de empresa y un fallo de usuarios no muestra datos parciales",async()=>{
  const bloqueado=entornoProgramacion({habilitada:false});await bloqueado.contexto.iniciar();
  assert.deepEqual(bloqueado.llamadas,["empresa"]);assert.equal(bloqueado.renders(),0);
  const e=entornoProgramacion(),inicio=e.contexto.iniciar();await turno();
  e.semana.resolver({docs:[{data:()=>({estado:"publicada"})}]});
  e.usuarios.rechazar(Error("Sin permiso para usuarios"));e.sheq.resolver();e.operativos.resolver();
  await inicio;assert.equal(e.renders(),0);assert.equal(e.finales(),1);
  assert.match(e.mensajes.at(-1),/Sin permiso/);
});

test("la consulta de borradores reúne semana, asignaciones y confirmaciones en paralelo",async()=>{
  const e=entornoProgramacion({borradores:true}),carga=e.contexto.cargarSemana();
  assert.deepEqual(e.llamadas,["semana","asignaciones","confirmaciones"]);
  e.semana.resolver({docs:[{data:()=>({estado:"borrador"})}]});
  e.asignaciones.resolver({docs:[{id:"a",data:()=>({fecha:"2026-11-02"})}]});await turno();
  assert.equal(e.renders(),0);e.confirmaciones.resolver();await carga;assert.equal(e.renders(),1);
});

test("el panel inicia con el DOM listo sin esperar la carga de imágenes",()=>{
  for(const estado of ["loading","interactive","complete"]){
    let inicios=0;const eventos={};
    const contexto=vm.createContext({document:{readyState:estado,addEventListener:(n,fn)=>{eventos[n]=fn;}},iniciarDashboard:()=>{inicios++;}});
    const codigo=dashboard.slice(dashboard.lastIndexOf('if (document.readyState === "loading")'));
    vm.runInContext(codigo,contexto);
    if(estado==="loading"){assert.equal(inicios,0);eventos.DOMContentLoaded();}
    assert.equal(inicios,1);
  }
});

function entornoExcel(){
  const scripts=[],temporizadores=new Map();let ultimo=0;
  const window={setTimeout:fn=>{temporizadores.set(++ultimo,fn);return ultimo;},clearTimeout:id=>temporizadores.delete(id)};
  const document={baseURI:"https://ejemplo.test/vectaria/inventario.html",querySelector:()=>({dataset:{excelSrc:"vendor/xlsx.full.min.js"}}),
    createElement:()=>({remove(){this.retirado=true;}}),head:{appendChild:script=>scripts.push(script)}};
  const cargar=vm.runInNewContext(`${excel.replace("export ","")}\n;cargarExcel`,{window,document,URL,Promise,Error});
  return {window,scripts,temporizadores,cargar};
}

test("Excel no se descarga al entrar y solicitudes simultáneas comparten una única carga",async()=>{
  const e=entornoExcel();assert.equal(e.scripts.length,0);
  const primera=e.cargar(),segunda=e.cargar();assert.equal(primera,segunda);assert.equal(e.scripts.length,1);
  assert.equal(e.scripts[0].src,"https://ejemplo.test/vectaria/vendor/xlsx.full.min.js");
  const libreria={utils:{}};e.window.XLSX=libreria;e.scripts[0].onload();
  assert.equal(await primera,libreria);assert.equal(await e.cargar(),libreria);
  assert.equal(e.scripts.length,1);assert.equal(e.temporizadores.size,0);
});

test("un fallo o vencimiento de Excel limpia la carga y permite reintentar",async()=>{
  for(const modo of ["error","timeout","incompleta"]){
    const e=entornoExcel(),primera=e.cargar();
    if(modo==="error")e.scripts[0].onerror();
    else if(modo==="timeout")[...e.temporizadores.values()][0]();
    else e.scripts[0].onload();
    await assert.rejects(primera,/Excel/);assert.equal(e.scripts[0].retirado,true);
    const segunda=e.cargar();e.window.XLSX={utils:{}};e.scripts[1].onload();
    assert.equal(await segunda,e.window.XLSX);assert.equal(e.temporizadores.size,0);
  }
});
