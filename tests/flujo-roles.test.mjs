import assert from "node:assert/strict";
import test from "node:test";

import {
  aplicarPermisosRol,
  esJefeTaller,
  esUsuarioTaller,
  inicializarPermisos,
  puedeEliminarComentario,
} from "../js/modulos/core/permisos.js";

function usarUsuario(usuario) {
  inicializarPermisos({ getUsuario: () => usuario });
}

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
