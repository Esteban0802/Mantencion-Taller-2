import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { identidadDeSucursal, combinarPlantillasSucursal } from "../js/configuracion-alcance.js";
import { dbMemoria } from "./helpers/db-memoria.mjs";
import { conectarDesgloseAlmacenamiento } from "../js/almacenamiento-sucursales.js";
const { subirArchivoEmpresa } = createRequire(import.meta.url)("../functions/archivos-empresa.js");
const { limpiarIdentidadAnterior } = createRequire(import.meta.url)("../functions/limpieza-identidad.js");

function entornoLimpieza(sucursal = false) {
  const prefijo = sucursal ? 'empresas/e/sucursales/s/informe/' : 'empresas/e/informe/';
  const anterior = {logoRuta:prefijo+'logo-viejo',portadaRuta:prefijo+'portada-vieja'};
  const actual = {logoRuta:prefijo+'logo-nuevo',portadaRuta:prefijo+'portada-nueva'};
  const db = dbMemoria({'empresas/e':{activa:true,brandingInforme:actual,storageUsadoBytes:20,storageArchivos:2},
    'sucursales/s':{empresaId:'e',identidadVisual:{brandingInforme:actual}}});
  const archivos = new Map();
  for (const [i,ruta] of Object.values(anterior).entries()) {
    archivos.set(ruta,{generation:'1',metadata:{cuotaEmpresaId:'e',cuotaReservaId:'r'+i}});
    db.documentos.set('empresas/e/reservasAlmacenamiento/r'+i,{bytes:10,estado:'confirmada'});
  }
  for(const ruta of Object.values(actual)) archivos.set(ruta,{generation:'1'});
  let fallo = false;
  const bucket = {file:ruta=>({getMetadata:async()=>{
    if(!archivos.has(ruta))throw Object.assign(Error('No existe'),{code:404});
    return [archivos.get(ruta)];
  },delete:async()=>{archivos.delete(ruta);if(fallo)throw Error('Respuesta de Storage interrumpida');}})};
  return {db,bucket,empresaId:'e',sucursalId:sucursal?'s':null,anterior,actual,archivos,fallar:v=>{fallo=v;}};
}

test('reemplazar logo y portada elimina ambos anteriores y libera cuota sin tocar las imágenes nuevas',async()=>{
  for(const sucursal of [false,true]) {
    const e=entornoLimpieza(sucursal);
    await limpiarIdentidadAnterior(e);
    assert.deepEqual([...e.archivos.keys()].sort(),Object.values(e.actual).sort());
    assert.equal(e.db.documentos.get('empresas/e').storageUsadoBytes,0);
    assert.equal(e.db.documentos.get('empresas/e').storageArchivos,0);
    await limpiarIdentidadAnterior(e);
    assert.equal(e.db.documentos.get('empresas/e').storageUsadoBytes,0);
    assert.equal([...e.db.documentos].filter(([k,v])=>k.startsWith('limpiezasIdentidad/') && v.estado==='completada').length,2);
  }
});

test('un fallo después del borrado conserva la reserva para reintentar y terminar la limpieza',async()=>{
  const e=entornoLimpieza(true);e.fallar(true);
  await assert.rejects(limpiarIdentidadAnterior(e));
  assert.ok([...e.db.documentos].some(([k,v])=>k.startsWith('limpiezasIdentidad/') && v.estado==='pendiente' && v.reservaId));
  assert.equal(e.db.documentos.get('empresas/e').storageUsadoBytes,20);
  e.fallar(false);await limpiarIdentidadAnterior(e);
  assert.equal(e.db.documentos.get('empresas/e').storageUsadoBytes,0);
  assert.deepEqual([...e.archivos.keys()].sort(),Object.values(e.actual).sort());
});

test('cambiar solo el logo conserva la portada y restablecer la identidad retira ambas imágenes propias',async()=>{
  const e=entornoLimpieza(true);
  e.actual.portadaRuta=e.anterior.portadaRuta;
  e.db.documentos.get('sucursales/s').identidadVisual.brandingInforme=e.actual;
  await limpiarIdentidadAnterior(e);
  assert.equal(e.archivos.has(e.anterior.logoRuta),false);
  assert.equal(e.archivos.has(e.anterior.portadaRuta),true);
  const restablecer=entornoLimpieza(true);
  delete restablecer.db.documentos.get('sucursales/s').identidadVisual;
  await limpiarIdentidadAnterior({...restablecer,actual:undefined});
  assert.equal(restablecer.archivos.has(restablecer.anterior.logoRuta),false);
  assert.equal(restablecer.archivos.has(restablecer.anterior.portadaRuta),false);
});

test('limpieza ignora imágenes todavía usadas y rutas de otra empresa, sucursal o inventario',async()=>{
  const e=entornoLimpieza(true);
  const antes=[...e.archivos];
  await limpiarIdentidadAnterior({...e,actual:e.anterior});
  await limpiarIdentidadAnterior({...e,anterior:{logoRuta:'empresas/otra/informe/logo',portadaRuta:'empresas/e/inventario/s/foto'}});
  e.db.documentos.get('sucursales/s').identidadVisual.brandingInforme=e.anterior;
  await limpiarIdentidadAnterior(e);
  assert.deepEqual([...e.archivos],antes);
  const general=entornoLimpieza();
  general.db.documentos.get('sucursales/s').identidadVisual.brandingInforme=general.anterior;
  await limpiarIdentidadAnterior(general);
  assert.equal(general.archivos.size,4);
});

test("la identidad propia hereda la empresa sin modificarla ni otras sucursales", () => {
  const empresa = { nombre: "Empresa", colorPrimario: "#123456", brandingInforme: { logoUrl: "empresa", portadaUrl: "portada" }, maxUsuarios: 10 };
  const propia = { identidadVisual: { colorPrimario: "#abcdef", brandingInforme: { logoUrl: "sucursal" }, nombre: "No aplicar", maxUsuarios: 999 } };
  const antes = structuredClone(empresa);
  const resultado = identidadDeSucursal(empresa, propia);
  assert.equal(resultado.colorPrimario, "#abcdef");
  assert.deepEqual(resultado.brandingInforme, { logoUrl: "sucursal", portadaUrl: "portada" });
  assert.equal(resultado.nombre, "Empresa"); assert.equal(resultado.maxUsuarios, 10);
  assert.equal(identidadDeSucursal(empresa, {}).brandingInforme.logoUrl, "empresa");
  assert.deepEqual(empresa, antes);
});

test("las plantillas disponibles son exclusivamente las activas de la sucursal", () => {
  const generales = [{ id: "global", gama: "Bómba" }, { id: "otra", gama: "Motor" }];
  const propias = [{ id: "local", gamaNormalizada: "bomba" }, { id: "inactiva", gama: "Motor", activa: false }];
  assert.deepEqual(combinarPlantillasSucursal(generales, propias).map(p => p.id), ["local"]);
  assert.deepEqual(combinarPlantillasSucursal(generales, []).map(p => p.id), []);
  assert.equal(generales[0].id, "global");
});

const { obtenerDesglose } = createRequire(import.meta.url)("../functions/desglose-storage.js");
function datosDesglose() {
  const datos = {
    sucursales: [{ id: "s", nombre: "Santiago" }, { id: "v", nombre: "Valdivia" }],
    ots: [{ id: "activa", sucursalId: "s" }, { id: "antigua" }],
    otsPapelera: [{ id: "papelera", sucursalId: "s" }]
  };
  const archivos = [
    ["empresas/e/sucursales/s/plantillas/p/a.xlsx", 10], ["empresas/e/inventario/v/manual.pdf", 20],
    ["empresas/e/informe/logo.png", 30], ["ots/activa/foto.jpg", 40], ["ots/papelera/foto.jpg", 50], ["ots/antigua/foto.jpg", 60]
  ];
  const db = { collection: nombre => ({ where: (_, op, empresaId) => { assert.equal(op, "=="); assert.equal(empresaId, "e"); return { get: async () => ({ docs: datos[nombre].map(({id, ...d}) => ({ id, data: () => d })) }) }; } }) };
  const bucket = { getFiles: async ({prefix}) => [archivos.filter(([n]) => n.startsWith(prefix)).map(([name,size])=>({ name, metadata:{size:String(size)} }))] };
  return { db, bucket, empresaId: "e" };
}
test("el desglose separa sucursales, archivos generales, antiguos y papelera sin duplicar", async () => {
  const r = await obtenerDesglose({ ...datosDesglose(), usuario: { activo:true, rol:"admin_empresa", empresaId:"e" } });
  assert.deepEqual(r.sucursales.map(s=>[s.sucursalId,s.bytes,s.archivos,s.papeleraBytes]), [["s",100,3,50],["v",20,1,0]]);
  assert.deepEqual(r.generales,{bytes:30,archivos:1});
  assert.deepEqual(r.sinSucursal,{bytes:60,archivos:1});
});
test("el administrador de sucursal solo recibe su consumo; se rechazan perfiles ajenos", async () => {
  const usuario = { activo:true, rol:"admin_sucursal", empresaId:"e", sucursalId:"s" };
  const r = await obtenerDesglose({ ...datosDesglose(), usuario });
  assert.deepEqual(r.sucursales.map(s=>s.sucursalId),["s"]);
  assert.equal(r.generales,undefined); assert.equal(r.sinSucursal,undefined);
  for(const cambio of [{activo:false},{rol:"tecnico"},{empresaId:"otra"},{sucursalId:""},{sucursalId:"ajena"}]) {
    await assert.rejects(obtenerDesglose({...datosDesglose(),usuario:{...usuario,...cambio}}),{code:"permission-denied"});
  }
});

test("el visor consulta solo al pulsar, escapa nombres y permite actualizar", async () => {
  let pulsar, llamadas = 0;
  const boton = { addEventListener: (_, fn) => { pulsar = fn; } }, resultado = {};
  const contenedor = { querySelector: s => s === "button" ? boton : resultado };
  conectarDesgloseAlmacenamiento({ contenedor, empresaId:"e", limiteGB:1, consultar: async datos => {
    assert.deepEqual(datos,{empresaId:"e"}); llamadas++;
    return {data:{medidoEn:0,sucursales:[{nombre:'<img src=x onerror=alert(1)>',bytes:100,archivos:1,papeleraBytes:50}]}};
  }});
  assert.equal(llamadas,0);
  await pulsar();
  assert.equal(llamadas,1); assert.equal(boton.disabled,false);
  assert.match(resultado.innerHTML,/&lt;img/); assert.doesNotMatch(resultado.innerHTML,/<img/);
  assert.match(resultado.innerHTML,/papelera/);
  await pulsar(); assert.equal(llamadas,2);
});

test("el visor informa que el servidor pendiente de publicación aún no ofrece el desglose", async () => {
  let pulsar;
  const boton={addEventListener:(_,fn)=>{pulsar=fn;}},resultado={};
  conectarDesgloseAlmacenamiento({contenedor:{querySelector:s=>s==="button"?boton:resultado},empresaId:"e",consultar:async()=>{throw {code:"functions/not-found"};}});
  await pulsar();
  assert.match(resultado.textContent,/publique/); assert.equal(boton.disabled,false);
});

test("las cargas del administrador de sucursal respetan rama, empresa, estado y cuota compartida", async () => {
  const usuario = { uid: "u", activo: true, rol: "admin_sucursal", empresaId: "e", sucursalId: "s" };
  const db = dbMemoria({ "empresas/e": { activa: true, storageCuotaVersion: 1, maxStorageGB: 1 }, "sucursales/s": { activa: true, empresaId: "e" }, "sucursales/otra": { activa: true, empresaId: "e" } });
  await assert.rejects(subirArchivoEmpresa({ db, bucket: {}, usuario: { ...usuario, rol: "admin_empresa" }, datos: { ruta: "empresas/e/plantillas/p/a.xlsx" } }), { code: "permission-denied" });
  for (const ruta of ["empresas/e/sucursales/s/informe/logo", "empresas/e/sucursales/s/plantillas/p/a.xlsx"]) {
    const tipo = ruta.endsWith("xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "image/png";
    const bytes = tipo === "image/png" ? Buffer.from([137,80,78,71,13,10,26,10]) : Buffer.from([80,75,3,4,120,108,47]);
    let metadata;
    const archivo = { save: async (_, opciones) => { metadata = { ...opciones.metadata, generation: "1" }; }, getMetadata: async () => { if (!metadata) throw Object.assign(Error("Falta"), { code: 404 }); return [metadata]; } };
    const bucket = { name: "prueba", file: () => archivo };
    const datos = { ruta, contentType: tipo, base64: bytes.toString("base64") };
    await subirArchivoEmpresa({ db, bucket, usuario, datos });
    for (const cambio of [{ sucursalId: "otra" }, { empresaId: "otra" }, { rol: "tecnico" }, { activo: false }]) {
      await assert.rejects(subirArchivoEmpresa({ db, bucket, usuario: { ...usuario, ...cambio }, datos }), { code: "permission-denied" });
    }
  }
  for (const ruta of ["empresas/e/informe/logo", "empresas/e/plantillas/p/a.xlsx", "empresas/e/sucursales/otra/informe/logo", "empresas/e/sucursales/s/no-permitido/x"]) {
    await assert.rejects(subirArchivoEmpresa({ db, usuario, bucket: {}, datos: { ruta } }), { code: "permission-denied" });
  }
  db.documentos.get("sucursales/s").activa = false;
  await assert.rejects(subirArchivoEmpresa({ db, usuario, bucket: {}, datos: { ruta: "empresas/e/sucursales/s/informe/logo" } }), { code: "permission-denied" });
});
