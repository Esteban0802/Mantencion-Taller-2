import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

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
    usuario: { uid: "nuevo" }, empresaId: "empresa", semanaInicio: 0,
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
  const ejecutar = () => vm.runInContext(`${funcion}; cargarSemana();`, contexto);
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
      {campo:"semanaInicio",operador:"==",valor:"2026-10-26"},
      ...(!borradores?[{campo:"estado",operador:"==",valor:"publicada"}]:[])
    ]);
    assert.equal(semana.at(-1).limite,1);
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
