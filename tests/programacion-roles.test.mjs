import assert from "node:assert/strict";
import test from "node:test";

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
