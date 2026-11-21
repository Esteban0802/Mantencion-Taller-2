import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

test("la adaptación de datos preserva originales y exige sus versiones exactas",()=>{
  const {prepararEscrituras}=createRequire(import.meta.url)("../scripts/aplicar-aislamiento-sucursales.cjs");
  const original={updateTime:"2026-11-21T12:00:00Z",fields:{estado:{stringValue:"publicada"},snapshotPublicado:{arrayValue:{values:[]}}}};
  const writes=prepararEscrituras({pendientes:[],plan:[{origen:"antes",destino:"despues",sucursalId:"s",original}]});
  assert.equal(writes.length,2);
  assert.deepEqual(writes[0].currentDocument,{exists:false});
  assert.equal(writes[0].update.fields.snapshotPublicado,original.fields.snapshotPublicado);
  assert.equal(writes[1].update.fields.estado.stringValue,"migrada");
  assert.equal(writes[1].currentDocument.updateTime,original.updateTime);
  assert.ok(writes.every(w=>!w.delete));
  assert.throws(()=>prepararEscrituras({pendientes:["ambiguo"],plan:[]}),/ambiguos/);
});

test("la consulta de programación exige sucursal salvo la supervisión del administrador de empresa",()=>{
  const source=readFileSync(new URL("../js/programacion.js",import.meta.url),"utf8");
  const codigo=source.match(/function filtrosAmbitoProgramacion\(\) \{[\s\S]*?\n\}/)[0];
  const ejecutar=usuario=>vm.runInNewContext(`${codigo};filtrosAmbitoProgramacion()`,{usuario,empresaId:"e",where:(campo,op,valor)=>({campo,valor})});
  for(const rol of ["planificador","sheq","tecnico","bodeguero","admin_sucursal"]){
    assert.throws(()=>ejecutar({rol}),/sucursal asignada/);
    assert.equal(ejecutar({rol,sucursalId:"s"})[1].valor,"s");
  }
  assert.equal(ejecutar({rol:"admin_empresa"}).length,1);
});

async function publicarSucursal({sucursalId="s",ajeno=false}={}){
  const source=readFileSync(new URL("../functions/index.js",import.meta.url),"utf8");
  const inicio=source.indexOf('exports.publicarProgramacion = onCall(CALLABLE_OPTIONS, async request => {');
  const fin=source.indexOf('\n});',inicio);
  const cuerpo=source.slice(inicio,fin).split('async request => {')[1];
  const lecturas=[],escrituras=[];
  const datos={programaciones:[{id:"a",empresaId:"e",sucursalId:"s",fecha:"2026-11-02",usuarioIds:[ajeno?"otro":"u"]},{id:"ajena",empresaId:"e",sucursalId:"otra",fecha:"2026-11-02",usuarioIds:["otro"]}],usuarios:[{id:"u",empresaId:"e",sucursalId:"s",rol:"tecnico",activo:true},{id:"otro",empresaId:"e",sucursalId:"otra",rol:"tecnico",activo:true}],programacionConfirmaciones:[]};
  function coleccion(nombre,filtros=[]){return {
    where:(campo,op,valor)=>coleccion(nombre,[...filtros,{campo,valor}]),
    get:async()=>{lecturas.push({nombre,filtros});return {docs:(datos[nombre]||[]).filter(d=>filtros.every(f=>d[f.campo]===f.valor)).map(d=>({id:d.id,data:()=>d,ref:{path:`${nombre}/${d.id}`}}))};},
    doc:id=>({path:`${nombre}/${id}`,get:async()=>({exists:nombre==="sucursales",data:()=>nombre==="sucursales"?{empresaId:"e",activa:true}:{}})})
  };}
  const contexto={obtenerSolicitante:async()=>({uid:"p",rol:"planificador",empresaId:"e",sucursalId}),texto:v=>v||"",HttpsError:class extends Error {constructor(code,m){super(m);this.code=code;}},exigirEmpresaOperativa:async()=>({data:()=>({})}),db:{collection:coleccion,batch:()=>({set:(ref,data)=>escrituras.push({ref,data}),delete:ref=>escrituras.push({ref}),commit:async()=>{}})},programacionPublicable:d=>({id:d.id,...d.data()}),idsProgramacion:d=>d.usuarioIds||[],correoValido:()=>false,FieldValue:{serverTimestamp:()=>0},registrarAuditoria:async()=>{},Set,Map,Date,JSON};
  const ejecutar=vm.runInNewContext(`(async request=>{${cuerpo}\n})`,contexto);
  await ejecutar({data:{empresaId:"e",semanaInicio:"2026-11-02",sucursalId:"otra"}});
  return {lecturas,escrituras};
}

test("publicar usa la sucursal del perfil y no publica ni modifica datos de otra sucursal",async()=>{
  const e=await publicarSucursal();
  assert.ok(e.lecturas.every(l=>l.filtros.some(f=>f.campo==="sucursalId"&&f.valor==="s")));
  assert.equal(e.escrituras.length,2);
  assert.ok(e.escrituras.every(w=>w.data.sucursalId==="s"));
  assert.ok(e.escrituras.some(w=>w.ref.path==="programacionSemanas/e_s_2026-11-02"));
  assert.ok(e.escrituras.every(w=>!w.ref.path.includes("otro")));
});

test("publicar rechaza perfiles sin sucursal y participantes de otra sucursal",async()=>{
  await assert.rejects(publicarSucursal({sucursalId:""}),{code:"permission-denied"});
  await assert.rejects(publicarSucursal({ajeno:true}),{code:"failed-precondition"});
});

import {
  etiquetaRolProgramacion,
  grupoProgramacionUsuario,
  usuariosDisponiblesPorGrupo
} from "../js/programacion-roles.js";

test("clasifica los roles definitivos en su grupo de programación", () => {
  assert.equal(grupoProgramacionUsuario({ rol: "tecnico" }), "tecnico");
  assert.equal(grupoProgramacionUsuario({ rol: "supervisor" }), "supervisor");
  assert.equal(grupoProgramacionUsuario({ rol: "jefe_taller" }), "supervisor");
  assert.equal(grupoProgramacionUsuario({ rol: "sheq" }), "sheq");
  assert.equal(grupoProgramacionUsuario({ rol: "planificador" }), null);
});

test("cargoProgramacion permite una asignación operacional explícita", () => {
  assert.equal(grupoProgramacionUsuario({ rol: "planificador", cargoProgramacion: "supervisor" }), "supervisor");
  assert.equal(etiquetaRolProgramacion({ rol: "planificador", cargoProgramacion: "supervisor" }), "Supervisor");
});

test("los selectores solo ofrecen usuarios activos del grupo solicitado", () => {
  const usuarios = [
    { id: "t1", rol: "tecnico", activo: true },
    { id: "t2", rol: "tecnico", activo: false },
    { id: "s1", rol: "supervisor", activo: true },
    { id: "j1", rol: "jefe_taller", activo: true },
    { id: "p1", rol: "planificador", activo: true }
  ];

  assert.deepEqual(usuariosDisponiblesPorGrupo(usuarios, "tecnico").map(item => item.id), ["t1"]);
  assert.deepEqual(usuariosDisponiblesPorGrupo(usuarios, "supervisor").map(item => item.id), ["s1", "j1"]);
});

test("la cobertura semanal conserva solo los tres indicadores solicitados", () => {
  const source = readFileSync(new URL("../js/programacion.js", import.meta.url), "utf8");
  assert.match(source, /Sin programación/);
  assert.match(source, /Ausentes esta semana/);
  assert.match(source, /Lecturas confirmadas/);
  assert.doesNotMatch(source, /<span>Sobrecargados<\/span>/);
  assert.doesNotMatch(source, /<span>Días libres disponibles<\/span>/);
});

test("la vista de correo distingue trabajo, ausencia y día libre", () => {
  const source = readFileSync(new URL("../js/programacion.js", import.meta.url), "utf8");
  assert.match(source, /usuarioAusenteEnFecha\(persona\.id, iso\)/);
  assert.match(source, /correo-ausencia/);
  assert.match(source, /Día libre/);
});

test("las ausencias pueden abrirse desde el calendario y actualizarse", () => {
  const source = readFileSync(new URL("../js/programacion.js", import.meta.url), "utf8");
  assert.match(source, /data-ausencia-id/);
  assert.match(source, /abrirEdicionAusenciaProgramacion/);
  assert.match(source, /updateDoc\(doc\(db, "programacionAusencias", ausenciaId\)/);
});

function cargarSemanaPersonal(documentos, error = null, { personal = true, borradores = false } = {}) {
  const source = readFileSync(new URL("../js/programacion.js", import.meta.url), "utf8");
  const funcion = source.match(/async function cargarSemana\([\s\S]*?\) \{[\s\S]*?\n\}/)[0];
  const nodos = new Map(); const consultas = []; const mensajes = [];
  let renders = 0;
  const contexto = vm.createContext({
    ES_TRABAJADOR_CON_SEMANA_PERSONAL: personal, PUEDE_VER_BORRADORES: borradores,
    usuario: { uid: "nuevo", sucursalId: "sucursal", rol: "tecnico" }, empresaId: "empresa", semanaInicio: 0,
    db: {}, estadoSemanaActual: "borrador", asignacionesEmpresa: [], asignacionesSemana: [],
    fechaISO: valor => valor === 0 ? "2026-10-26" : "2026-11-01", sumarDias: (_, dias) => dias,
    mostrarMensaje: texto => mensajes.push(texto), actualizarEncabezadoSemana() {},
    collection: (_, nombre) => ({ nombre }), where: (campo, operador, valor) => ({ campo, operador, valor }),
    limit: cantidad => ({ limite: cantidad }), query: (...partes) => partes,
    getDocs: async consulta => { consultas.push(consulta); if (error) throw error; return { docs: documentos.map(data => ({ data: () => data })) }; },
    getDoc: () => { throw Error("No debe leer una semana general ni un borrador"); },
    cargarConfirmacionesSemana: async () => {}, renderCuadro: () => { renders++; },
    $: id => { if (!nodos.has(id)) nodos.set(id, {}); return nodos.get(id); }
  });
  const ejecutar = () => vm.runInContext(`${source.match(/function filtrosAmbitoProgramacion\(\) \{[\s\S]*?\n\}/)[0]}
${funcion}; cargarSemana();`, contexto);
  return { contexto, consultas, mensajes, nodos, ejecutar, renders: () => renders };
}

test("usuario sin copia personal ve semana pendiente sin solicitar borradores", async () => {
  const e = cargarSemanaPersonal([]);
  await e.ejecutar();
  assert.equal(e.consultas.length, 1);
  assert.equal(e.consultas[0][0].nombre, "programacionPublicadaUsuarios");
  const filtros = e.consultas[0].slice(1).filter(p => p.campo);
  assert.deepEqual(filtros, [
    { campo: "empresaId", operador: "==", valor: "empresa" },
    { campo: "sucursalId", operador: "==", valor: "sucursal" },
    { campo: "usuarioId", operador: "==", valor: "nuevo" },
    { campo: "estado", operador: "==", valor: "publicada" },
    { campo: "semanaInicio", operador: "==", valor: "2026-10-26" }
  ]);
  assert.equal(e.consultas[0].at(-1).limite, 1);
  assert.match(e.mensajes.at(-1), /Todavía no tienes una programación publicada/);
  assert.equal(e.nodos.get("confirmacionProgramacion").hidden, true);
  assert.equal(e.renders(), 0);
});

test("una semana general inexistente se consulta por empresa y fecha sin lectura directa denegada",async()=>{
  for(const borradores of [true,false]) {
    const e=cargarSemanaPersonal([],null,{personal:false,borradores});await e.ejecutar();
    const semana=e.consultas.find(c=>c[0].nombre==="programacionSemanas");
    assert.ok(semana);
    const filtros=semana.slice(1).filter(f=>f.campo);
    assert.deepEqual(filtros,[
      {campo:"empresaId",operador:"==",valor:"empresa"},
      {campo:"sucursalId",operador:"==",valor:"sucursal"},
      {campo:"semanaInicio",operador:"==",valor:"2026-10-26"},
      ...(!borradores?[{campo:"estado",operador:"==",valor:"publicada"}]:[])
    ]);
    if (borradores) assert.equal(semana.at(-1).limite,1);
    assert.equal(e.contexto.estadoSemanaActual,"borrador");
    assert.equal(e.renders(),borradores?1:0);
  }
});

test("la copia publicada sigue mostrando las asignaciones del trabajador", async () => {
  const asignacion = { id: "a", fecha: "2026-10-27" };
  const e = cargarSemanaPersonal([{ estado: "publicada", asignaciones: [asignacion] }]);
  await e.ejecutar();
  assert.equal(e.contexto.estadoSemanaActual, "publicada");
  assert.equal(e.contexto.asignacionesSemana[0].id, "a");
  assert.equal(e.renders(), 1);
});

test("un rechazo real de permisos no se oculta consultando la semana general", async () => {
  const error = Object.assign(new Error("Sin permiso"), { code: "permission-denied" });
  const e = cargarSemanaPersonal([], error);
  await assert.rejects(e.ejecutar(), e => e === error);
  assert.equal(e.consultas.length, 1);
});
