import test from "node:test";
import assert from "node:assert/strict";
import {
  MODULOS_COMERCIALES,
  MODULOS_NUCLEO,
  PLANES_FLEXIBLES_BASE,
  expandirModulosContratados,
  normalizarModulosContratados,
  validarSeleccionModulos
} from "../js/planes-flexibles.js";
import { moduloActivo, obtenerModulosEmpresa } from "../js/modulos.js";

test("el catálogo contiene los cuatro planes comerciales definidos", () => {
  assert.deepEqual(
    PLANES_FLEXIBLES_BASE.map(plan => plan.id),
    ["esencial", "profesional", "operacion", "corporativo"]
  );
});

test("cada plan conserva sus límites comerciales", () => {
  const esencial = PLANES_FLEXIBLES_BASE.find(plan => plan.id === "esencial");
  const profesional = PLANES_FLEXIBLES_BASE.find(plan => plan.id === "profesional");
  const operacion = PLANES_FLEXIBLES_BASE.find(plan => plan.id === "operacion");
  assert.deepEqual(
    [esencial.maxUsuarios, esencial.maxOTMensuales, esencial.maxSucursales, esencial.maxStorageGB, esencial.maxModulosElegibles],
    [25, 75, 1, 25, 2]
  );
  assert.deepEqual(
    [profesional.maxUsuarios, profesional.maxOTMensuales, profesional.maxSucursales, profesional.maxStorageGB, profesional.maxModulosElegibles],
    [60, 180, 2, 75, 5]
  );
  assert.deepEqual(
    [operacion.maxUsuarios, operacion.maxOTMensuales, operacion.maxSucursales, operacion.maxStorageGB, operacion.maxModulosElegibles],
    [100, 300, 3, 150, 6]
  );
});

test("los módulos contratados se expanden a permisos internos sin apagar el núcleo", () => {
  const modulos = expandirModulosContratados(["inventario_repuestos", "gantt"]);
  MODULOS_NUCLEO.forEach(key => assert.equal(modulos[key], true));
  assert.equal(modulos.inventario, true);
  assert.equal(modulos.repuestos, true);
  assert.equal(modulos.gantt, true);
  assert.equal(modulos.reportesPDF, true);
  assert.equal(modulos.sheq, false);
  assert.equal(modulos.programacion, false);
});

test("se eliminan módulos desconocidos y duplicados sin bloquear una selección sobre la referencia", () => {
  assert.deepEqual(
    normalizarModulosContratados(["gantt", "gantt", "desconocido"]),
    ["gantt"]
  );
  const seleccion = MODULOS_COMERCIALES.slice(0, 3).map(modulo => modulo.key);
  assert.equal(validarSeleccionModulos(seleccion, 2).valida, true);
  assert.equal(validarSeleccionModulos(seleccion, 2).excedeReferencia, true);
  assert.equal(validarSeleccionModulos(seleccion, 3).excedeReferencia, false);
  assert.deepEqual(validarSeleccionModulos(seleccion, 2).seleccion, seleccion);
});

test("la selección flexible prevalece sobre indicadores antiguos del módulo", () => {
  const empresa = {
    modulosContratados: ["inventario_repuestos"],
    modulos: { inventario: true, repuestos: true, sheq: true }
  };

  assert.equal(moduloActivo(empresa, "inventario"), true);
  assert.equal(moduloActivo(empresa, "sheq"), false);
  assert.equal(obtenerModulosEmpresa(empresa).ordenesServicio, true);
});

test("cada módulo flexible activa solamente sus capacidades asociadas", () => {
  for (const modulo of MODULOS_COMERCIALES) {
    const empresa = {
      modulosContratados: [modulo.key],
      modulos: Object.fromEntries(MODULOS_COMERCIALES.flatMap(item =>
        item.flags.map(flag => [flag, true])
      ))
    };

    for (const candidato of MODULOS_COMERCIALES) {
      for (const flag of candidato.flags) {
        assert.equal(
          moduloActivo(empresa, flag),
          candidato.key === modulo.key,
          `${modulo.key} no debe habilitar ${flag}`
        );
      }
    }
  }
});
