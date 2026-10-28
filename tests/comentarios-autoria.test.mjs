import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validarComentariosOT, etapasOT, autorizarEtapasOT } = require("../functions/comentarios-ot.js");
const usuario = { uid: "tecnico", rol: "tecnico", empresaId: "e", sucursalId: "s" };
const propio = { creadoPorUid: "tecnico", rol: "tecnico", texto: "Trabajo", fecha: "hoy" };
const ajeno = { creadoPorUid: "otro", rol: "supervisor", texto: "Original", fecha: "ayer" };
const observacion = { creadoPorUid: "jefe", rol: "jefe_taller", texto: "Corregir", atendido: false };
const respuesta = { ...observacion, atendido: true, respuestaUsuario: "Corregido", atendidoPor: "Técnico", atendidoPorUid: "tecnico", fechaAtendido: "hoy" };
const ubicaciones = {
  ingreso: lista => ({ ingreso: [{ comentarios: lista }] }),
  evaluacion: lista => ({ evaluacion: [{ comentarios: lista }] }),
  overhaul: lista => ({ overhaul: [{ comentarios: lista }] }),
  pruebasGeneral: lista => ({ pruebas: { general: [{ comentarios: lista }] } }),
  pruebasMecanicas: lista => ({ pruebas: { mecanico: [{ comentarios: lista }] } }),
  pruebasElectricas: lista => ({ pruebas: { electrico: [{ comentarios: lista }] } }),
  despachoPreparacion: lista => ({ despacho: { comentariosPreparacion: lista } }),
  despachoFinal: lista => ({ despacho: { comentariosFinal: lista } })
};

for (const [etapa, datos] of Object.entries(ubicaciones)) {
  test(`${etapa}: conserva ajenos y permite crear, editar y eliminar propios`, () => {
    assert.doesNotThrow(() => validarComentariosOT(datos([ajeno]), datos([ajeno, propio]), usuario));
    assert.doesNotThrow(() => validarComentariosOT(datos([ajeno, propio]), datos([ajeno, { ...propio, texto: "Corregido" }]), usuario));
    assert.doesNotThrow(() => validarComentariosOT(datos([ajeno, propio]), datos([ajeno]), usuario));
    for (const rol of ["tecnico", "supervisor", "jefe_taller"]) {
      const actor = { ...usuario, rol };
      assert.throws(() => validarComentariosOT(datos([ajeno]), datos([]), actor));
      assert.throws(() => validarComentariosOT(datos([ajeno]), {}, actor));
      assert.throws(() => validarComentariosOT(datos([ajeno]), datos([{ ...ajeno, texto: "Alterado" }]), actor));
      assert.throws(() => validarComentariosOT(datos([ajeno]), datos([{ ...ajeno, creadoPorUid: "tecnico" }]), actor));
    }
  });
}

test("rechaza suplantación, duplicación y comentarios sin autor nuevos", () => {
  for (const comentario of [ajeno, { texto: "Anónimo" }, { ...propio, rol: "jefe_taller" }]) {
    assert.throws(() => validarComentariosOT({}, ubicaciones.ingreso([comentario]), usuario));
  }
  assert.throws(() => validarComentariosOT(ubicaciones.ingreso([ajeno]), ubicaciones.ingreso([ajeno, ajeno]), usuario));
});

test("conserva comentarios antiguos sin UID y listas reordenadas", () => {
  const antiguo = { texto: "Histórico", rol: "tecnico" };
  assert.doesNotThrow(() => validarComentariosOT(ubicaciones.ingreso([antiguo, ajeno]), ubicaciones.ingreso([ajeno, antiguo]), usuario));
  assert.throws(() => validarComentariosOT(ubicaciones.ingreso([antiguo]), ubicaciones.ingreso([]), usuario));
});

test("permite responder al jefe sin modificar ni borrar su comentario", () => {
  for (const rol of ["tecnico", "supervisor"]) {
    assert.doesNotThrow(() => validarComentariosOT(ubicaciones.ingreso([observacion]), ubicaciones.ingreso([respuesta]), { ...usuario, rol }));
  }
  for (const alterado of [{ ...respuesta, texto: "Alterado" }, { ...respuesta, atendidoPorUid: "otro" }, { ...respuesta, respuestaUsuario: "" }]) {
    assert.throws(() => validarComentariosOT(ubicaciones.ingreso([observacion]), ubicaciones.ingreso([alterado]), usuario));
  }
  assert.throws(() => validarComentariosOT(ubicaciones.ingreso([respuesta]), ubicaciones.ingreso([{ ...respuesta, respuestaUsuario: "Otra respuesta" }]), usuario));
});

test("rechaza estructuras inválidas y quitar un ítem con comentarios ajenos", () => {
  assert.throws(() => validarComentariosOT({}, { ingreso: [{ comentarios: "mal" }] }, usuario));
  assert.throws(() => validarComentariosOT(ubicaciones.ingreso([ajeno]), { ingreso: [] }, usuario));
});

function baseFicticia(ot) {
  const escritos = [];
  const referencia = ruta => ({ collection: nombre => referencia(`${ruta}/${nombre}`), doc: id => referencia(`${ruta}/${id}`), ruta });
  return {
    escritos,
    collection: nombre => referencia(nombre),
    runTransaction: fn => fn({
      get: async () => ({ exists: Boolean(ot), data: () => ot }),
      set: (ref, datos) => escritos.push({ ruta: ref.ruta, datos })
    })
  };
}

test("la autorización guarda el estado anterior y el propuesto del usuario autenticado", async () => {
  const anterior = { empresaId: "e", sucursalId: "s", estado: "INGRESO", ...ubicaciones.ingreso([ajeno]) };
  const db = baseFicticia(anterior);
  const etapas = ubicaciones.ingreso([ajeno, propio]);
  await autorizarEtapasOT({ db, usuario, otId: "ot", etapas, venceEn: 123 });
  assert.equal(db.escritos.length, 2);
  assert.equal(db.escritos[0].ruta, "ots/ot/validacionesComentarios/tecnico/versiones/anterior");
  assert.deepEqual(db.escritos[0].datos.etapas, etapasOT(anterior));
  assert.deepEqual(db.escritos[1].datos.etapas, etapasOT(etapas));
});

test("no emite autorización fuera de alcance, para OT cerrada ni para borrar ajenos", async () => {
  const base = { empresaId: "e", sucursalId: "s", ...ubicaciones.ingreso([ajeno]) };
  for (const ot of [{ ...base, empresaId: "otra" }, { ...base, sucursalId: "otra" }, { ...base, cerrada: true }, { ...base, estado: "CERRADA" }, base]) {
    const db = baseFicticia(ot);
    await assert.rejects(autorizarEtapasOT({ db, usuario, otId: "ot", etapas: {}, venceEn: 123 }));
    assert.equal(db.escritos.length, 0);
  }
  for (const rol of ["admin_empresa", "admin_sucursal", "super_admin", "planificador"]) {
    const db = baseFicticia(base);
    await assert.rejects(autorizarEtapasOT({ db, usuario: { ...usuario, rol }, otId: "ot", etapas: base, venceEn: 123 }));
    assert.equal(db.escritos.length, 0);
  }
});

test("solo el jefe puede autorizar los comentarios iniciales de una OT propia", async () => {
  for (const rol of ["tecnico", "supervisor", "jefe_taller"]) {
    const db = baseFicticia(null);
    const resultado = autorizarEtapasOT({ db, usuario: { ...usuario, rol }, otId: "nueva", etapas: {}, empresaId: "e", sucursalId: "s", venceEn: 123 });
    if (rol === "jefe_taller") await resultado;
    else await assert.rejects(resultado);
  }
});
