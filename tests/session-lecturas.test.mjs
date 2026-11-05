import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const fuente=(await readFile(new URL("../js/session.js",import.meta.url),"utf8"))
  .replace(/import\s+[\s\S]*?\s+from\s+["'][^"']+["'];/g,"").replaceAll("export ","");
const turno=()=>new Promise(r=>setImmediate(r));
const snapshot=datos=>({exists:()=>true,data:()=>datos});
function pendiente(){let resolver,rechazar;const promesa=new Promise((r,j)=>{resolver=r;rechazar=j;});return {promesa,resolver,rechazar};}

function entorno(lector=null){
  const perfil={uid:"u",empresaId:"e",sucursalId:"s",rol:"tecnico",activo:true,debeCambiarPassword:false};
  const empresa={suscripcion:{estado:"activa"}};
  const almacen=new Map([["usuarioActivo",JSON.stringify(perfil)]]),consultas=[],rutas=[],avisos=[];
  const auth={currentUser:{uid:"u",email:""}};
  let verificar,cierres=0,recargas=0;
  const contexto=vm.createContext({auth,db:{},console:{error(){},warn(){}},
    getFunctions(){},httpsCallable:()=>async()=>{},EmailAuthProvider:{},
    onAuthStateChanged:(_auth,fn)=>{verificar=fn;},
    doc:(_db,...partes)=>({path:partes.join("/")}),getDoc:ref=>{
      consultas.push(ref.path);
      return lector?lector(ref):Promise.resolve(snapshot(ref.path.startsWith("usuarios/")?perfil:empresa));
    },signOut:async()=>{cierres++;},alert:m=>avisos.push(m),
    localStorage:{getItem:k=>almacen.get(k)||null,setItem:(k,v)=>almacen.set(k,v),removeItem:k=>almacen.delete(k)},
    sessionStorage:{clear(){}},document:{addEventListener(){},hidden:false},
    window:{addEventListener(){},setInterval(){return 1;},clearInterval(){},
      setTimeout:fn=>{fn();return 1;},
      location:{pathname:"/dashboard.html",replace:ruta=>rutas.push(ruta),reload:()=>{recargas++;}}}
  });
  vm.runInContext(fuente,contexto);
  return {contexto,auth,perfil,empresa,consultas,rutas,avisos,almacen,verificar:()=>verificar(auth.currentUser),cierres:()=>cierres,recargas:()=>recargas};
}

test("sesión y módulo comparten solo la lectura pendiente de la misma empresa y cuenta",async()=>{
  const p=pendiente(),e=entorno(()=>p.promesa);
  const a=e.contexto.leerEmpresaInicial("e"),b=e.contexto.leerEmpresaInicial("e");
  assert.equal(a,b);assert.deepEqual(e.consultas,["empresas/e"]);
  p.resolver(snapshot({activa:true}));await a;await turno();
  await e.contexto.leerEmpresaInicial("e");assert.equal(e.consultas.length,2);
});

test("las lecturas de otras empresas o cuentas no se mezclan y los errores permiten reintentar",async()=>{
  const p=pendiente(),e=entorno(()=>p.promesa.then(valor=>valor));
  const a=e.contexto.leerEmpresaInicial("e");
  const otra=e.contexto.leerEmpresaInicial("otra");assert.notEqual(a,otra);
  e.auth.currentUser={uid:"otro"};assert.notEqual(e.contexto.leerEmpresaInicial("e"),a);
  p.resolver(snapshot({}));await turno();
  let falla=true;
  const error=entorno(()=>falla?Promise.reject(Error("Sin conexión")):Promise.resolve(snapshot({})));
  await assert.rejects(error.contexto.leerEmpresaInicial("e"),/Sin conexión/);
  falla=false;await error.contexto.leerEmpresaInicial("e");assert.equal(error.consultas.length,2);
});

test("la verificación de sesión comparte una lectura de empresa en curso pero vuelve a leer el perfil",async()=>{
  const p=pendiente();let perfil;
  const e=entorno(ref=>ref.path.startsWith("usuarios/")?Promise.resolve(snapshot(perfil)):p.promesa);
  perfil=e.perfil;
  const modulo=e.contexto.leerEmpresaInicial("e"),sesion=e.verificar();await turno();
  assert.equal(e.consultas.filter(r=>r==="empresas/e").length,1);
  p.resolver(snapshot({suscripcion:{estado:"activa"}}));await Promise.all([modulo,sesion]);
  await e.verificar();
  assert.equal(e.consultas.filter(r=>r==="usuarios/u").length,2);
  assert.equal(e.consultas.filter(r=>r==="empresas/e").length,2);
});

test("usuario inactivo, cambio de rol y cambio obligatorio de contraseña conservan sus controles",async()=>{
  const inactivo=entorno();inactivo.perfil.activo=false;await inactivo.verificar();
  assert.equal(inactivo.cierres(),1);assert.ok(inactivo.rutas.includes("index.html"));
  const rol=entorno();rol.perfil.rol="planificador";await rol.verificar();
  assert.equal(rol.recargas(),1);assert.equal(JSON.parse(rol.almacen.get("usuarioActivo")).rol,"planificador");
  const password=entorno();password.perfil.debeCambiarPassword=true;await password.verificar();
  assert.ok(password.rutas.includes("cambiar-password.html"));
});

test("una empresa en cancelación sigue bloqueando a trabajadores y deriva al administrador a su panel",async()=>{
  const tecnico=entorno();tecnico.empresa.suscripcion.estado="cancelada";await tecnico.verificar();
  assert.equal(tecnico.cierres(),1);assert.ok(tecnico.rutas.includes("index.html"));
  const admin=entorno();admin.perfil.rol="admin_empresa";admin.empresa.suscripcion.estado="periodo_exportacion";
  await admin.verificar();assert.ok(admin.rutas.includes("empresa-admin.html?id=e"));
});

test("una lectura antigua que termina después del cierre no elimina una petición nueva",async()=>{
  const antigua=pendiente(),nueva=pendiente();let llamadas=0;
  const e=entorno(()=>++llamadas===1?antigua.promesa:nueva.promesa);
  const inicial=e.contexto.leerEmpresaInicial("e");e.contexto.limpiarSesionLocal();
  const actual=e.contexto.leerEmpresaInicial("e");antigua.resolver(snapshot({}));await inicial;
  assert.equal(e.contexto.leerEmpresaInicial("e"),actual);assert.equal(e.consultas.length,2);
  nueva.resolver(snapshot({}));await actual;
});
