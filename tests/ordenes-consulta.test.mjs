import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { crearBusquedaOT, coincideTextoOT } from "../js/ordenes-consulta.js";

const fuente = await readFile(new URL("../js/ordenes.js",import.meta.url),"utf8");
const dashboard = await readFile(new URL("../js/dashboard.js",import.meta.url),"utf8");

function entorno(rol = "jefe_taller", datos = [], { demorarConteo = false } = {}) {
  const campos = new Map();
  const eventos = [];
  const llamadas = [];
  const escuchas = [];
  const conteosPendientes = [];
  const nodo = id => {
    if (!campos.has(id)) campos.set(id, {value:id==="estadoOrdenes"?"todas":"",textContent:"",innerHTML:"",hidden:false,
      disabled:false,style:{},addEventListener:(tipo,fn)=>eventos.push({id,tipo,fn}),setAttribute(){}});
    return campos.get(id);
  };
  const normalizar = (base,...restricciones) => ({ coleccion:base.coleccion, restricciones:[...(base.restricciones||[]),...restricciones] });
  const aplicar = consulta => {
    let docs = datos.map(d=>({ id:d.id, data:()=>({...d}), ref:{id:d.id} }));
    for (const f of consulta.restricciones.filter(r=>r.tipo==="where")) {
      docs = docs.filter(d=>{
        const v=f.campo.split(".").reduce((o,k)=>o?.[k], d.data());
        return f.op==="==" ? v===f.valor : typeof v===typeof f.valor && (f.op===">" ? v>f.valor : v<f.valor);
      });
    }
    const ordenes = consulta.restricciones.filter(r=>r.tipo==="order");
    docs.sort((a,b)=>{
      for(const o of ordenes){const leer=d=>o.campo.split(".").reduce((v,k)=>v?.[k],d.data());const av=leer(a),bv=leer(b);if(av!==bv)return (av<bv?-1:1)*(o.direccion==="desc"?-1:1);}
      return b.id.localeCompare(a.id);
    });
    const cursor = consulta.restricciones.find(r=>r.tipo==="cursor")?.valor;
    if(cursor)docs=docs.slice(docs.findIndex(d=>d.id===cursor.id)+1);
    const limite = consulta.restricciones.find(r=>r.tipo==="limit")?.valor;
    if(limite)docs=docs.slice(0,limite);
    return {docs,size:docs.length,docChanges:()=>docs.map(doc=>({type:"added",doc}))};
  };
  const contexto = vm.createContext({
    console:{warn(){},error(){}},db:{},Date,Set,Map,Promise,
    protegerPagina:()=>({rol,empresaId:"e",sucursalId:"s",activo:true}),
    getFunctions(){},httpsCallable:()=>async()=>{},
    window:{addEventListener:(tipo,fn)=>eventos.push({id:"window",tipo,fn}),OverTrackUI:{finalizarCargaPagina(){}},scrollTo(){}},
    document:{getElementById:nodo,querySelector:()=>nodo("menu"),addEventListener(){},body:{classList:{contains(){return false;},toggle(){}}}},
    collection:(_db,coleccion)=>({coleccion}),query:normalizar,
    where:(campo,op,valor)=>({tipo:"where",campo,op,valor}),orderBy:(campo,direccion)=>({tipo:"order",campo,direccion}),
    limit:valor=>({tipo:"limit",valor}),startAfter:valor=>({tipo:"cursor",valor}),
    getCountFromServer:async q=>{
      llamadas.push({tipo:"count",q});const n=aplicar(q).size;
      if (demorarConteo) return new Promise((resolve,reject)=>conteosPendientes.push({resolver:(count=n)=>resolve({data:()=>({count})}),rechazar:reject}));
      return {data:()=>({count:n})};
    },
    getDocs:async q=>{llamadas.push({tipo:"get",q});return aplicar(q);},
    onSnapshot:(q,fn)=>{const escucha={q,fn,activa:true};escuchas.push(escucha);llamadas.push({tipo:"listen",q});fn(aplicar(q));return ()=>{escucha.activa=false;};},
    coincideTextoOT,crearBusquedaOT,moduloActivo:()=>true,puedeEntrarPanelEmpresa:()=>true,puedeCrearOT:()=>false,
    cerrarSesion(){},alert(){},
  });
  vm.runInContext(fuente.replace(/import\s+[\s\S]*?\s+from\s+["'][^"']+["'];/g,""),contexto);
  vm.runInContext('empresaActual={id:"e"};',contexto);
  const leer = expresion=>vm.runInContext(expresion,contexto);
  return {contexto,nodo,llamadas,eventos,escuchas,leer,conteosPendientes,emitir:()=>escuchas.filter(e=>e.activa).forEach(e=>e.fn(aplicar(e.q)))};
}

const ordenes = n => Array.from({length:n},(_,i)=>({id:`ot${String(i).padStart(3,"0")}`,empresaId:"e",sucursalId:"s",cerrada:false,
  estado:"EN_PROCESO",os:`OT-${i}`,fechaCreacion:1000-i,fechaActualizacion:9999-i,gantt:{fechaTermino:"2020-01-01"}}));

test("la paginación consulta 21 resúmenes y usa cursor sin duplicar o saltar órdenes",async()=>{
  const e=entorno("jefe_taller",ordenes(45));
  await e.leer("escucharOrdenes()");
  const ids=()=>Array.from(e.leer("listaVisible.map(o=>o.id)"));
  const primera=ids();assert.equal(primera.length,20);
  assert.equal(e.leer("totalOrdenes"),45);
  await e.leer("cargarPaginaOrdenes(2)");const segunda=ids();
  await e.leer("cargarPaginaOrdenes(3)");const tercera=ids();
  assert.equal(tercera.length,5);assert.equal(e.leer("hayMasOrdenes"),false);
  assert.deepEqual([...primera,...segunda,...tercera],ordenes(45).map(d=>d.id));
  await e.leer("cargarPaginaOrdenes(1)");assert.deepEqual(ids(),primera);
  for(const {q} of e.llamadas.filter(c=>c.tipo==="listen")){
    assert.equal(q.coleccion,"otsResumen");assert.equal(q.restricciones.find(r=>r.tipo==="limit").valor,21);
    assert.ok(q.restricciones.some(r=>r.campo==="empresaId"&&r.valor==="e"));
    assert.ok(q.restricciones.some(r=>r.campo==="sucursalId"&&r.valor==="s"));
  }
});

test("la primera página aparece aunque el conteo sea lento o falle",async()=>{
  const e=entorno("tecnico",ordenes(45),{demorarConteo:true});
  await e.leer("escucharOrdenes()");
  assert.equal(e.leer("listaVisible.length"),20);
  assert.equal(e.leer("cargandoOrdenes"),false);
  assert.equal(e.leer("totalOrdenes"),null);
  e.conteosPendientes[0].rechazar(Error("Conteo no disponible"));
  await new Promise(r=>setImmediate(r));
  assert.equal(e.leer("listaVisible.length"),20);
  assert.equal(e.leer("hayMasOrdenes"),true);
});

test("un conteo lento de una consulta anterior no sobrescribe el filtro actual",async()=>{
  const datos=ordenes(21);datos[0].cerrada=true;
  const e=entorno("tecnico",datos,{demorarConteo:true});await e.leer("escucharOrdenes()");
  e.nodo("estadoOrdenes").value="cerradas";await e.leer("cargarPaginaOrdenes(1,true)");
  e.conteosPendientes[1].resolver();await new Promise(r=>setImmediate(r));
  e.conteosPendientes[0].resolver(999);await new Promise(r=>setImmediate(r));
  assert.equal(e.leer("totalOrdenes"),1);assert.equal(e.leer("listaVisible.length"),1);
});

test("cada rol conserva su alcance y los filtros se aplican antes de paginar",async()=>{
  const datos=[...ordenes(30),{...ordenes(1)[0],id:"otra-sucursal",sucursalId:"otra"},{...ordenes(1)[0],id:"otra-empresa",empresaId:"ajena"}];
  datos[0].cerrada=true;datos[0].estado="CERRADA";
  for(const rol of ["admin_empresa","admin_sucursal","jefe_taller","supervisor","tecnico","planificador"]){
    const e=entorno(rol,datos);await e.leer("escucharOrdenes()");
    assert.equal(e.leer("totalOrdenes"),rol==="admin_empresa"?31:30);
    e.nodo("estadoOrdenes").value="cerradas";await e.leer("cargarPaginaOrdenes(1,true)");
    assert.equal(e.leer("totalOrdenes"),1);assert.equal(e.leer("listaVisible[0].id"),"ot000");
    e.nodo("estadoOrdenes").value="atrasadas";await e.leer("cargarPaginaOrdenes(1,true)");
    assert.equal(e.leer("totalOrdenes"),rol==="admin_empresa"?30:29);
    assert.ok(e.leer('listaVisible.every(o=>o.empresaId==="e" && !o.cerrada)'));
  }
});

test("la búsqueda encuentra fragmentos fuera de la primera página y no consulta al escribir",async()=>{
  const datos=ordenes(85);datos[64].cliente="Empresa Santiago";
  const e=entorno("tecnico",datos);await e.leer("escucharOrdenes()");
  e.leer("configurarInterfaz()");
  assert.equal(e.eventos.some(x=>x.id==="buscarOrdenes"&&x.tipo==="input"),false);
  e.nodo("buscarOrdenes").value="SANTIA";
  await e.leer('textoAplicado="santia";cargarPaginaOrdenes(1,true)');
  assert.equal(e.leer("listaVisible[0].id"),"ot064");assert.equal(e.leer("totalOrdenes"),1);
  assert.equal(e.leer("hayMasOrdenes"),false);
  assert.equal(e.llamadas.filter(c=>c.tipo==="get").length,5);
});

test("la búsqueda reutiliza bloques al volver y no confunde una página con el total",async()=>{
  const datos=ordenes(85);let lecturas=0;
  const buscar=crearBusquedaOT({coincide:()=>true,leerBloque:async cursor=>{
    lecturas++;const inicio=cursor||0;const docs=datos.slice(inicio,inicio+20);return {docs,cursor:inicio+docs.length,fin:docs.length<20};
  }});
  const p1=await buscar(1);assert.equal(p1.total,null);assert.equal(p1.hayMas,true);
  assert.equal(lecturas,2);
  await buscar(2);const antes=lecturas;await buscar(1);assert.equal(lecturas,antes);
  const ultima=await buscar(5);assert.equal(ultima.total,85);assert.equal(ultima.registros.length,5);assert.equal(ultima.hayMas,false);
});

test("una búsqueda cancelada no publica resultados y un error de lectura se puede reintentar",async()=>{
  let resolver,vigente=true;
  const buscar=crearBusquedaOT({coincide:()=>true,vigente:()=>vigente,leerBloque:()=>new Promise(r=>{resolver=r;})});
  const pendiente=buscar(1);vigente=false;resolver({docs:ordenes(1),fin:true});assert.equal(await pendiente,null);
  let falla=true;
  const reintento=crearBusquedaOT({coincide:()=>true,leerBloque:async()=>{if(falla)throw Error("Sin conexión");return {docs:ordenes(1),fin:true};}});
  await assert.rejects(reintento(1),/Sin conexión/);falla=false;assert.equal((await reintento(1)).total,1);
});

test("el total en pantalla se actualiza al retirar una orden y una página vacía vuelve al inicio",async()=>{
  const datos=ordenes(21),e=entorno("tecnico",datos);await e.leer("escucharOrdenes()");
  await e.leer("cargarPaginaOrdenes(2)");datos.pop();e.emitir();
  await new Promise(r=>setImmediate(r));
  assert.equal(e.leer("pagina"),1);assert.equal(e.leer("totalOrdenes"),20);
  assert.equal(e.escuchas.filter(x=>x.activa).length,1);
});

test("los KPI incluyen las cerradas sin usar la lista filtrada ni cargar su detalle",()=>{
  const numeros={},nodos={kpiTotal:{},kpiCerradas:{}};
  const contexto=vm.createContext({listaOTs:[{cerrada:false},{cerrada:false,atrasada:true}],cantidadCerradasDashboard:8,
    obtenerEstadoOT:o=>o.cerrada?"CERRADA":"EN_PROCESO",estaOTAtrasada:o=>o.atrasada,
    animarNumero:(id,n)=>{numeros[id]=n;},document:{getElementById:id=>nodos[id]}});
  const codigo=dashboard.slice(dashboard.indexOf("function calcularKPIs("),dashboard.indexOf("function renderEstadoTaller("));
  vm.runInContext(codigo+'\ncalcularKPIs([]);',contexto);
  assert.deepEqual(numeros,{kpiProceso:2,kpiAtrasadas:1,kpiTotal:10,kpiCerradas:8});
  vm.runInContext('cantidadCerradasDashboard=null;calcularKPIs([]);',contexto);
  assert.equal(nodos.kpiTotal.textContent,"—");assert.equal(nodos.kpiCerradas.textContent,"—");
});

test("el panel escucha solo abiertas y cuenta cerradas sin volver a contarlas por cada comentario",async()=>{
  const consultas=[],eventos={};let callback,conteos=0;
  const usuario={rol:"tecnico",empresaId:"e",sucursalId:"s"};
  const contexto=vm.createContext({usuario,empresaActualDashboard:{id:"e"},console:{log(){},warn(){}},
    localStorage:{getItem:()=>JSON.stringify(usuario)},window:{addEventListener:(n,fn)=>{eventos[n]=fn;},OverTrackUI:{finalizarCargaPagina(){}}},
    collection:(_db,nombre)=>({nombre}),query:(coleccion,...filtros)=>({coleccion,filtros}),
    where:(campo,op,valor)=>({campo,op,valor}),orderBy:(campo,direccion)=>({campo,direccion}),db:{},
    getCountFromServer:async q=>{conteos++;consultas.push(q);return {data:()=>({count:7})};},
    onSnapshot:(q,fn)=>{consultas.push(q);callback=fn;return ()=>{};},
    cancelarEscuchaOTs:null,consultaCerradasDashboard:null,cantidadCerradasDashboard:null,versionConteoDashboard:0,
    listaOTs:[],listaFiltrada:[],filtrarOTs(){},renderizarDashboardOperacional(){},
  });
  const codigo=dashboard.slice(dashboard.indexOf("async function escucharOTsTiempoReal("),dashboard.indexOf("function estaOTAtrasada("));
  vm.runInContext(codigo,contexto);await contexto.escucharOTsTiempoReal();
  callback({docs:[],docChanges:()=>[]});await new Promise(r=>setImmediate(r));
  assert.equal(conteos,1);assert.equal(contexto.cantidadCerradasDashboard,7);
  assert.ok(consultas[0].filtros.some(f=>f.campo==="cerrada"&&f.valor===false));
  assert.ok(consultas[1].filtros.some(f=>f.campo==="cerrada"&&f.valor===true));
  for(const q of consultas){assert.ok(q.filtros.some(f=>f.campo==="empresaId"&&f.valor==="e"));assert.ok(q.filtros.some(f=>f.campo==="sucursalId"&&f.valor==="s"));}
  callback({docs:[],docChanges:()=>[{type:"modified"}]});await new Promise(r=>setImmediate(r));assert.equal(conteos,1);
  callback({docs:[],docChanges:()=>[{type:"removed"}]});await new Promise(r=>setImmediate(r));assert.equal(conteos,2);
  await eventos.focus();assert.equal(conteos,3);
});
