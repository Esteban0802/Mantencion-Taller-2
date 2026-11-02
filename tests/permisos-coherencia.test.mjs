import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import * as permisos from "../js/permisos.js";

const leer = ruta => readFile(new URL(`../${ruta}`, import.meta.url), "utf8");
const empresa = { id: "e1" };
const roles = ["super_admin", "admin_empresa", "admin_sucursal", "jefe_taller", "supervisor", "tecnico", "planificador", "bodeguero", "sheq", "desconocido"];

test("la matriz de OT separa lectura, trabajo y administración", () => {
  for (const rol of roles) {
    const usuario = { uid: "yo", activo: true, empresaId: "e1", sucursalId: "s1", rol };
    const lectura = ["admin_empresa", "admin_sucursal", "jefe_taller", "supervisor", "tecnico", "planificador"].includes(rol);
    const trabajo = ["jefe_taller", "supervisor", "tecnico"].includes(rol);
    for (const nombre of ["puedeVerDashboard", "puedeVerOrdenesServicio", "puedeAbrirOT", "puedeVerChecklists", "puedeVerGantt", "puedeVerDespacho", "puedeVerReportes"]) {
      assert.equal(permisos[nombre](usuario, empresa), lectura, `${nombre}: ${rol}`);
    }
    assert.equal(permisos.puedeCrearOT(usuario, empresa), rol === "jefe_taller");
    assert.equal(permisos.puedeCargarChecklists(usuario, empresa), trabajo);
    assert.equal(permisos.puedeCompletarChecklists(usuario, empresa), trabajo);
    assert.equal(permisos.puedeEntrarPanelEmpresa(usuario, empresa), ["super_admin", "admin_empresa", "admin_sucursal"].includes(rol));
    assert.equal(permisos.puedeAdministrarUsuarios(usuario, empresa), ["super_admin", "admin_empresa", "admin_sucursal"].includes(rol));
    for (const activo of [false, undefined, null]) {
      for (const nombre of ["puedeAbrirOT", "puedeCrearOT", "puedeEntrarPanelEmpresa", "puedeAdministrarUsuarios"]) assert.equal(permisos[nombre]({ ...usuario, activo }, empresa), false);
    }
    assert.equal(permisos.puedeAbrirOT(usuario, { id: "otra" }), false);
    assert.equal(permisos.puedeAbrirOT({ ...usuario, sucursalId: "" }, empresa), rol === "admin_empresa");
    assert.equal(permisos.puedeAbrirOT(usuario, { ...empresa, modulos: { ordenesServicio: false } }), false);
  }
});

test("los permisos informativos de los perfiles nuevos no prometen trabajo a lectores", async () => {
  const fuente = await leer("functions/index.js");
  const funcion = fuente.match(/function permisosPorRol\(rol\) \{[\s\S]*?\n\}/)[0];
  for (const rol of roles) {
    const p = vm.runInNewContext(`${funcion}; permisosPorRol(rol)`, { rol });
    assert.equal(p.crearOS, rol === "jefe_taller", rol);
    assert.equal(p.cargarChecklist, ["jefe_taller", "supervisor", "tecnico"].includes(rol), rol);
    for (const campo of ["aprobarIngreso", "aprobarEvaluacion", "aprobarMantencion", "aprobarPruebas", "cerrarOS"]) assert.equal(p[campo], rol === "jefe_taller", `${rol}: ${campo}`);
  }
});

test("la empresa en cancelación conserva lectura pero no ofrece crear ni completar OT", () => {
  const usuario = { uid: "yo", activo: true, rol: "jefe_taller", empresaId: "e1", sucursalId: "s1" };
  for (const estado of ["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"]) {
    const cancelada = { ...empresa, activa: true, suscripcion: { estado } };
    assert.equal(permisos.puedeAbrirOT(usuario, cancelada), true);
    for (const nombre of ["puedeCrearOT", "puedeCargarChecklists", "puedeCompletarChecklists"]) assert.equal(permisos[nombre](usuario, cancelada), false);
  }
  assert.equal(permisos.puedeCrearOT(usuario, { ...empresa, activa: false }), false);
});

test("cambiar estado valida rol, empresa y sucursal antes de modificar Auth o Firestore", async () => {
  const fuente = await leer("functions/index.js");
  const helper = fuente.match(/function puedeAdministrarEmpresa\(solicitante, empresaId\) \{[\s\S]*?\n\}/)[0];
  const handler = fuente.match(/exports.cambiarEstadoUsuario = onCall\(CALLABLE_OPTIONS, async request => \{([\s\S]*?)\n\}\);/)[1];
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  for (const rolSolicitante of ["admin_sucursal", "admin_empresa", "tecnico"]) {
    for (const sucursal of ["s1", "s2", "", undefined]) {
      for (const rol of ["tecnico", "admin_empresa", "admin_sucursal", "super_admin"]) {
        for (const empresaId of ["e1", "e2"]) {
          const solicitante = { uid: "yo", rol: rolSolicitante, empresaId: "e1", sucursalId: sucursal === "" || sucursal === undefined ? sucursal : "s1" };
          const objetivo = { uid: "otro", rol, empresaId, sucursalId: sucursal, activo: true };
          const cambios = [];
          const ejecutar = vm.runInNewContext(`${helper}; (async request => {${handler}})`, {
            obtenerSolicitante: async () => solicitante, texto: valor => valor, HttpsError,
            exigirAutenticacionReciente() {}, exigirEmpresaOperativa: async () => {}, registrarAuditoria: async () => {},
            db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => objetivo }), update: async () => cambios.push("perfil") }) }) },
            auth: { getUser: async () => ({ disabled: false }), updateUser: async () => cambios.push("cuenta"), revokeRefreshTokens: async () => {} },
            FieldValue: { serverTimestamp: () => 0 }, console
          });
          const permitido = empresaId === "e1" && rol !== "super_admin" && (rolSolicitante === "admin_empresa" || (rolSolicitante === "admin_sucursal" && sucursal === "s1" && rol === "tecnico"));
          const resultado = ejecutar({ data: { usuarioId: "otro", activo: false } });
          if (permitido) await resultado;
          else await assert.rejects(resultado, e => e.code === "permission-denied");
          assert.deepEqual(cambios, permitido ? ["cuenta", "perfil"] : []);
        }
      }
    }
  }
});
