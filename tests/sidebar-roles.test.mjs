import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const leer = ruta => readFile(new URL(`../${ruta}`, import.meta.url), "utf8");

test("el Jefe de Taller conserva sus accesos al cambiar de módulo", async () => {
  const [preload, inventario, programacion, sheq] = await Promise.all([
    leer("js/sidebar-preload.js"),
    leer("inventario.html"),
    leer("programacion.html"),
    leer("sheq.html")
  ]);

  assert.match(preload, /jefe_taller:\s*\[[^\]]*"inventario"[^\]]*"sheq"[^\]]*"programacion"[^\]]*"nueva"/);
  assert.match(inventario, /id="menuNuevaOTInventario"/);
  assert.match(programacion, /id="menuNuevaOTProgramacion"/);
  assert.match(sheq, /id="menuNuevaOTSheq"/);
});

test("el Planificador conserva Inventario y SHEQ al navegar entre módulos", async () => {
  const [preload, inventarioJs, programacionJs, sheqJs, reglasFirestore, reglasStorage] = await Promise.all([
    leer("js/sidebar-preload.js"),
    leer("js/inventario.js"),
    leer("js/programacion.js"),
    leer("js/sheq.js"),
    leer("firestore.rules"),
    leer("storage.rules")
  ]);

  assert.match(preload, /planificador:\s*\[[^\]]*"inventario"[^\]]*"sheq"[^\]]*"programacion"/);
  assert.match(programacionJs, /actualizarNavegacionProgramacion\(\);\s*\n\s*await cargarUsuariosYSucursales/);
  assert.match(programacionJs, /menuSheqProgramacion[\s\S]*?"planificador"/);
  assert.match(programacionJs, /menuInventarioProgramacion[\s\S]*?"planificador"/);
  assert.match(inventarioJs, /puedeEditar\s*=\s*\[[^\]]*"jefe_taller"[^\]]*"planificador"/);
  assert.match(sheqJs, /const rolesEdicion\s*=\s*\["sheq"\]/);
  assert.match(reglasFirestore, /hasRole\(\['jefe_taller', 'planificador'\]\)/);
  assert.match(reglasFirestore, /function canReadSheq[\s\S]*?'planificador'/);
  assert.match(reglasFirestore, /function canManageSheq[\s\S]*?hasRole\(\['sheq'\]\)/);
  assert.match(reglasStorage, /function canManageInventory[\s\S]*?'jefe_taller', 'planificador'/);
});

test("el Administrador de Sucursal conserva su Panel Empresa", async () => {
  const [inventario, programacion] = await Promise.all([
    leer("js/inventario.js"),
    leer("js/programacion.js")
  ]);

  assert.match(inventario, /\["super_admin", "admin_empresa", "admin_sucursal"\]/);
  assert.match(programacion, /\["super_admin", "admin_empresa", "admin_sucursal"\]/);
});

test("el Administrador de Sucursal solo puede eliminar usuarios comunes de su sucursal", async () => {
  const [usuarios, funciones] = await Promise.all([
    leer("js/empresa/usuarios.js"),
    leer("functions/index.js")
  ]);

  assert.match(usuarios, /const puedeEliminar = puedeEliminarUsuarioEmpresa\(usuario\)/);
  assert.match(usuarios, /usuario\.sucursalId === usuarioActivo\.sucursalId/);
  assert.match(funciones, /objetivo\.sucursalId !== solicitante\.sucursalId/);
  assert.match(funciones, /\["admin_empresa", "admin_sucursal"\]\.includes\(objetivo\.rol\)/);
  assert.match(funciones, /Solo puedes eliminar usuarios no administrativos de tu sucursal/);
});

test("los permisos de eliminación se verifican en interfaz y servidor", async () => {
  const ui = await leer("js/empresa/usuarios.js");
  const servidor = await leer("functions/index.js");
  const helper = ui.match(/function puedeEliminarUsuarioEmpresa\(usuario\) \{[\s\S]*?\n\}/)[0];
  const empresa = servidor.match(/function puedeAdministrarEmpresa\(solicitante, empresaId\) \{[\s\S]*?\n\}/)[0];
  const handler = servidor.match(/exports.eliminarUsuarioEmpresa = onCall\(CALLABLE_OPTIONS, async request => \{([\s\S]*?)\n\}\);/)[1];
  for (const rolAdmin of ["admin_sucursal", "admin_empresa"]) {
    for (const rol of ["tecnico", "supervisor", "jefe_taller", "planificador", "bodeguero", "sheq", "admin_empresa", "admin_sucursal", "super_admin"]) {
      for (const sucursalId of ["s1", "s2", undefined]) {
        for (const empresaId of ["e1", "e2"]) {
          for (const uid of ["otro", "yo"]) {
            const solicitante = { uid: "yo", rol: rolAdmin, empresaId: "e1", sucursalId: sucursalId === undefined ? undefined : "s1" };
            const objetivo = { uid, rol, sucursalId, empresaId };
            const permitido = uid !== "yo" && empresaId === "e1" && rol !== "super_admin" &&
              (rolAdmin === "admin_empresa" || (sucursalId === "s1" && !["admin_empresa", "admin_sucursal"].includes(rol)));
            assert.equal(vm.runInNewContext(`${helper}; puedeEliminarUsuarioEmpresa(objetivo)`, {
              usuarioActivo: solicitante, objetivo, auth: { currentUser: { uid: "yo" } }, window: { empresaIdActualAdmin: "e1" }
            }), permitido);
            const eliminados = [];
            const ref = { get: async () => ({ exists: true, data: () => objetivo }), delete: async () => eliminados.push("perfil") };
            class HttpsError extends Error { constructor(code, mensaje) { super(mensaje); this.code = code; } }
            const ejecutar = vm.runInNewContext(`${empresa}; (async request => {${handler}})`, {
              obtenerSolicitante: async () => solicitante, exigirAutenticacionReciente: () => {}, texto: valor => valor,
              db: { collection: () => ({ doc: () => ref }) }, HttpsError,
              exigirEmpresaOperativa: async () => {}, registrarAuditoria: async () => {},
              auth: { deleteUser: async () => eliminados.push("cuenta") }
            });
            if (permitido) await ejecutar({ data: { usuarioId: uid } });
            else await assert.rejects(ejecutar({ data: { usuarioId: uid } }), error => ["permission-denied", "failed-precondition"].includes(error.code));
            assert.deepEqual(eliminados, permitido ? ["cuenta", "perfil"] : []);
          }
        }
      }
    }
  }
});

test("la creación rechaza sucursales ajenas y roles administrativos para admin_sucursal", async () => {
  const source = await leer("functions/index.js");
  const empresa = source.match(/function puedeAdministrarEmpresa\(solicitante, empresaId\) \{[\s\S]*?\n\}/)[0];
  const roles = source.match(/function validarRolCreable\(solicitante, rol\) \{[\s\S]*?\n\}/)[0];
  const prefijo = source.match(/exports.crearUsuarioEmpresa = onCall\(CALLABLE_OPTIONS, async request => \{([\s\S]*?)  const temporal = passwordTemporal\(\);/)[1];
  for (const rol of ["tecnico", "admin_empresa", "admin_sucursal"]) {
    for (const sucursalId of ["s1", "s2", ""]) {
      const ejecutar = vm.runInNewContext(`${empresa}; ${roles}; (async request => {${prefijo} return true;})`, {
        obtenerSolicitante: async () => ({ rol: "admin_sucursal", empresaId: "e1", sucursalId: "s1" }),
        texto: valor => valor || "", correoValido: () => true,
        ROLES_EMPRESA: ["tecnico", "admin_empresa", "admin_sucursal"],
        validarCupoUsuariosEmpresa: async () => {}, HttpsError: Error,
        db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ empresaId: "e1" }) }) }) }) }
      });
      const resultado = ejecutar({ data: { empresaId: "e1", nombre: "Usuario", correo: "u@example.com", rol, sucursalId } });
      if (rol === "tecnico" && sucursalId === "s1") assert.equal(await resultado, true);
      else await assert.rejects(resultado);
    }
  }
});
