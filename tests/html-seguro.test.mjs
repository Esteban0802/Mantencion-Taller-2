import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { escaparHtml, argumentoHtml, urlSegura } from "../js/html-seguro.js";
import { identidadDeSucursal } from "../js/configuracion-alcance.js";
import { esFlujoLibre, progresoLibre } from "../js/flujo-libre-modelo.js";
const { parseFragment } = createRequire(import.meta.url)("parse5");

test("configuración de sucursal renderiza solo identidad y plantillas, sin opciones de empresa", async () => {
  const m = await modulo("js/empresa/configuracion-sucursal.js", "admin_sucursal");
  m.contexto.identidadDeSucursal = identidadDeSucursal;
  const cont = m.contexto.document.getElementById("vistaEmpresaContenido");
  cont.querySelector = selector => m.contexto.document.getElementById(selector.replace(/^#/, ""));
  const cambios = [];
  m.contexto.doc = (_, ...ruta) => ruta;
  m.contexto.updateDoc = async (ruta, datos) => cambios.push({ ruta, datos });
  m.contexto.serverTimestamp = () => 0;
  m.contexto.getDoc = async () => ({ exists: () => true, data: () => ({ empresaId: "empresa", activa: true, nombre: ataque }) });
  await m.contexto.renderConfiguracionSucursal({ db: {}, usuario: { rol: "admin_sucursal", empresaId: "empresa", sucursalId: "sucursal", uid: "yo" }, empresa: { id: "empresa", activa: true }, procesarExcel: async () => ({}) });
  const html = m.nodos.get("vistaEmpresaContenido").innerHTML;
  const nodos = elementos(html);
  assert.equal(nodos.filter(n => n.attrs?.some(a => a.name === "role" && a.value === "tab")).length, 2);
  for (const id of ["configEmpresaNombre", "btnRecalcularStorage", "btnExportarEmpresa", "btnSolicitarCancelacion"]) assert.equal(nodos.some(n => n.attrs?.some(a => a.name === "id" && a.value === id)), false);
  assert.ok(texto(html).includes(ataque));
  assert.equal(nodos.some(n => n.attrs?.some(a => a.name === "onerror")), false);
  const picker = m.contexto.document.getElementById("sucursalColorPrimarioPicker");
  const color = m.contexto.document.getElementById("sucursalColorPrimario");
  picker.value = "#123456"; picker.eventos.input();
  assert.equal(color.value, "#123456");
  color.value = "#abcdef"; color.eventos.input();
  assert.equal(picker.value, "#abcdef");
  color.value = "incorrecto";
  await m.nodos.get("formIdentidadSucursal").eventos.submit({ preventDefault() {}, submitter: {} });
  assert.equal(cambios.length, 0);
  color.value = "#123456";
  m.contexto.document.getElementById("sucursalColorSecundario").value = "#abcdef";
  await m.nodos.get("formIdentidadSucursal").eventos.submit({ preventDefault() {}, submitter: {} });
  assert.deepEqual(cambios[0].ruta, ["sucursales", "sucursal"]);
  assert.deepEqual(Object.keys(cambios[0].datos).sort(), ["fechaActualizacion", "identidadVisual"]);
});

const ataque = `O'Higgins & "Compañía" <img src=x onerror="globalThis.ataque=true"> \${globalThis.ataque=true}`;
function elementos(html) {
  const lista = [];
  function visitar(nodo) { lista.push(nodo); (nodo.childNodes || []).forEach(visitar); }
  visitar(parseFragment(html));
  return lista;
}
const texto = html => elementos(html).filter(n => n.nodeName === "#text").map(n => n.value).join("");
function sinEtiquetasInyectadas(html) {
  const nodos = elementos(html);
  assert.equal(nodos.some(n => ["script", "img", "svg", "iframe", "object"].includes(n.tagName)), false);
  assert.equal(nodos.some(n => (n.attrs || []).some(a => ["onerror", "onfocus", "onload", "onmouseover"].includes(a.name))), false);
}

async function modulo(ruta, rol = "admin_empresa") {
  const nodos = new Map();
  function elemento() { return { innerHTML: "", textContent: "", value: "", style: {}, dataset: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(tipo, accion) { this.eventos ||= {}; this.eventos[tipo] = accion; }, setAttribute() {}, removeAttribute() {}, remove() {}, focus() {},
    querySelector: () => elemento(), querySelectorAll: () => [], appendChild(hijo) { this.children.push(hijo); },
    append(...hijos) { this.children.push(...hijos); }, replaceChildren() { this.children = []; } }; }
  const documentos = [{ id: ataque, data: () => ({ nombre: ataque, codigo: ataque, activa: true }) }];
  const usuario = { uid: "yo", rol, empresaId: "empresa", sucursalId: "sucursal" };
  const llamadas = [];
  const contexto = vm.createContext({
    escaparHtml, argumentoHtml, urlSegura, esFlujoLibre, progresoLibre, app: {}, db: {}, auth: { currentUser: { uid: "yo" } },
    getFunctions: () => ({}), httpsCallable: (_, nombre) => async datos => { llamadas.push({ nombre, datos }); return { data: {} }; },
    getStorage: () => ({}), getDocs: async () => ({ docs: documentos }), getDoc: async () => documentos[0],
    query: () => ({}), collection: () => ({}), doc: () => ({}), where: () => ({}), limit: () => ({}), startAfter: () => ({}),
    protegerPagina: () => usuario, cerrarSesion() {}, moduloActivo: () => true, obtenerModulosEmpresa: () => ({}),
    abrirWizard: opciones => { contexto.wizard = opciones; },
    localStorage: { getItem: () => JSON.stringify(usuario) },
    window: { empresaIdActualAdmin: "empresa", empresaActualAdmin: {}, addEventListener() {}, alert() {}, location: {} },
    document: {
      getElementById(id) { if (!nodos.has(id)) nodos.set(id, elemento()); return nodos.get(id); },
      createElement: elemento, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
      body: { appendChild() {} }
    },
    console, URL, setTimeout, clearTimeout
  });
  let fuente = await readFile(new URL(`../${ruta}`, import.meta.url), "utf8");
  // Ejecutar el módulo de interfaz real con servicios externos simulados;
  // sus eventos DOM no se disparan durante la carga del módulo.
  fuente = fuente.replace(/^import[\s\S]*?;\r?\n/gm, "").replace(/^export /gm, "");
  vm.runInContext(fuente, contexto, { filename: ruta });
  return { contexto, nodos, llamadas, ejecutar: codigo => vm.runInContext(codigo, contexto) };
}

test('recepción de tarjeta separa sucursales y no bloquea por rechazo del servicio',async()=>{
  const m=await modulo('js/dashboard.js','jefe_taller');
  m.ejecutar(`empresaActualDashboard={id:'empresa'};inventarioAlertasCargado=true;inventarioPorOSDashboard=new Map([
    ['s:os-1',[{recibido:true},{recibido:false}]],['otra:os-1',[{recibido:true}]]]);`);
  const r=m.ejecutar(`obtenerRecepcionTarjeta({os:'OS-1',sucursalId:'s'})`);
  assert.equal(r.porcentaje,50);assert.equal(r.pendientes,1);
  assert.match(m.ejecutar(`renderRecepcionTarjeta({os:'OS-1',sucursalId:'s'})`),/Cierre bloqueado/);
  assert.doesNotMatch(m.ejecutar(`renderRecepcionTarjeta({os:'OS-1',sucursalId:'s',servicioRechazado:true})`),/Cierre bloqueado/);
  assert.equal(m.ejecutar(`obtenerRecepcionTarjeta({os:'OS-1',sucursalId:'otra'}).porcentaje`),100);
  m.ejecutar(`inventarioAlertasCargado=false;`);
  assert.equal(m.ejecutar(`obtenerRecepcionTarjeta({os:'OS-1',sucursalId:'s'})`),null);
});
test('gráficos cuentan todos los estados pero promedian únicamente OT abiertas y resuelven lista vacía',async()=>{
  const m=await modulo('js/dashboard.js','jefe_taller');const graficos=[];
  m.contexto.Chart=function(canvas,config){graficos.push(config);this.destroy=()=>{};};
  m.contexto.listaPrueba=[
    {flujoVersion:2,cerrada:false,etapaActualNombre:'Control propio',etapasPersonalizadas:[{total:2,completados:1,completada:false}]},
    {flujoVersion:2,cerrada:true,etapasPersonalizadas:[{total:2,completados:2,completada:true}]},
    {flujoVersion:2,cerrada:false,etapaActualNombre:'Pendiente de cierre',etapasPersonalizadas:[{total:2,completados:0,completada:true}]}
  ];
  m.ejecutar('renderGraficos(listaPrueba)');
  assert.equal(graficos[0].data.datasets[0].data.reduce((n,c)=>n+c,0),3);
  assert.ok(graficos[0].data.labels.includes('Control propio'));
  assert.ok(graficos[0].data.labels.includes('Pendiente de cierre'));
  assert.equal(graficos[1].data.datasets[0].data[0],75);
  m.contexto.listaPrueba=[m.contexto.listaPrueba[0]];m.ejecutar('renderGraficos(listaPrueba)');
  assert.equal(graficos[3].data.datasets[0].data[0],50);
  m.contexto.listaPrueba.push({cerrada:false,ingresoAprobado:false,ingreso:[]});m.ejecutar('renderGraficos(listaPrueba)');
  assert.equal(graficos[4].data.datasets[0].data.reduce((n,c)=>n+c,0),2);
  assert.ok(graficos[4].data.labels.includes('INGRESO'));
  m.contexto.listaPrueba=[];m.ejecutar('renderGraficos(listaPrueba)');
  assert.equal(graficos.length,7);
  assert.equal(m.nodos.get('graficoProgreso').hidden,true);
  assert.equal(m.nodos.get('detalleProgresoGlobal').textContent,'No hay OT abiertas');
  m.contexto.listaPrueba=[{cerrada:true,estado:'CERRADA'}];m.ejecutar('renderGraficos(listaPrueba)');
  assert.equal(graficos.length,8);assert.equal(m.nodos.get('graficoProgreso').hidden,true);
  m.contexto.listaPrueba=[{flujoVersion:2,cerrada:false,etapasPersonalizadas:[{total:1,completados:0,completada:false}]}];m.ejecutar('renderGraficos(listaPrueba)');
  assert.equal(m.nodos.get('graficoProgreso').hidden,false);assert.equal(graficos[9].data.datasets[0].data[0],0);
});
test("el escape conserva nombres, entidades, comillas y caracteres especiales como texto", () => {
  for (const valor of [ataque, "<script>alert(1)</script>", "&lt;texto&gt;", "Álvaro — Ñandú", "`\\\"'", "<svg onload=alert(1)>"]) {
    const html = `<span>${escaparHtml(valor)}</span>`;
    sinEtiquetasInyectadas(html);
    assert.equal(texto(html), valor);
  }
  assert.equal(escaparHtml(null), "");
  assert.equal(escaparHtml(123), "123");
});

test("plazo de papelera distingue vencimiento individual y extensión por aviso tardío", async () => {
  const m = await modulo("js/ordenes.js", "jefe_taller");
  const inicio = Date.UTC(2026, 10, 1), dia = 86400000;
  m.contexto.datos = { eliminadoEn: { toDate: () => new Date(inicio) } };
  m.contexto.ahora = inicio + 12 * dia;
  assert.equal(m.ejecutar('plazoPapelera(datos, ahora).dias'), 3);
  assert.equal(m.ejecutar('plazoPapelera(datos, ahora).urgente'), false);
  m.contexto.datos.avisoEliminacionEn = { toDate: () => new Date(inicio + 20 * dia) };
  m.contexto.ahora = inicio + 22 * dia;
  assert.match(m.ejecutar('plazoPapelera(datos, ahora).texto'), /Aviso registrado/);
  const mensaje = m.ejecutar('plazoPapelera(datos, ahora).texto');
  m.contexto.ahora += dia;
  assert.equal(m.ejecutar('plazoPapelera(datos, ahora).texto'), mensaje);
  m.contexto.datos = {};
  assert.equal(m.ejecutar('plazoPapelera(datos, ahora)'), null);
});

test("la papelera muestra nombres como texto y carga solo una página por consulta", async () => {
  const m = await modulo("js/ordenes.js", "jefe_taller");
  const consultas = [];
  m.contexto.limit = cantidad => { consultas.push(cantidad); return {}; };
  m.contexto.getDocs = async () => ({ size: 1, empty: false, docs: [{ id: "ot", data: () => ({ os: ataque, equipo: ataque }) }] });
  m.contexto.puedeCrearOT = () => true;
  await m.ejecutar('empresaActual = { id: "empresa" }; cargarPapelera();');
  const lista = m.nodos.get("listaPapeleraOT");
  const informacion = lista.children[0].children[0];
  assert.equal(informacion.children[1].textContent, ataque);
  assert.equal(informacion.children[2].textContent, ataque);
  assert.equal(informacion.children[1].innerHTML, "");
  assert.equal(lista.children[0].children[1].textContent, "Restaurar OT");
  assert.deepEqual(consultas, [20]);
  assert.equal(m.nodos.get("masPapeleraOT").hidden, true);
});

test("los argumentos de botones permanecen literales tras el análisis HTML y JavaScript", () => {
  for (const id of [ataque, `');globalThis.ataque=true;//`, `");globalThis.ataque=true;//`, "\n\\\u2028&"] ) {
    const boton = elementos(`<button onclick="accion(${argumentoHtml(id)})">Acción</button>`).find(n => n.tagName === "button");
    const manejador = boton.attrs.find(a => a.name === "onclick").value;
    const llamadas = [];
    const contexto = { accion: valor => llamadas.push(valor), ataque: false };
    vm.runInNewContext(manejador, contexto);
    assert.deepEqual(llamadas, [id]); assert.equal(contexto.ataque, false);
  }
});

test("los enlaces bloquean esquemas ejecutables y permiten documentos HTTP y HTTPS", () => {
  for (const url of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\nscript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "file:///C:/secreto", "blob:https://example.com/id"]) assert.equal(urlSegura(url), "");
  assert.equal(urlSegura("https://firebasestorage.googleapis.com/v0/b/bucket/o/foto.jpg?alt=media&token=abc"), "https://firebasestorage.googleapis.com/v0/b/bucket/o/foto.jpg?alt=media&token=abc");
  assert.equal(urlSegura("http://localhost/documento.pdf"), "http://localhost/documento.pdf");
  assert.equal(urlSegura(null), "");
});

test("la tabla real de usuarios muestra datos hostiles como texto y conserva los botones", async () => {
  const m = await modulo("js/empresa/usuarios.js");
  m.contexto.lista = [{ uid: ataque, empresaId: "empresa", nombreCompleto: ataque, correo: ataque, rol: "tecnico", sucursalId: ataque, activo: true }];
  m.ejecutar('sucursalesEmpresa = [{ id: lista[0].sucursalId, nombre: lista[0].nombreCompleto }]; renderTablaUsuariosEmpresa(lista);');
  const html = m.nodos.get("tablaUsuariosEmpresa").innerHTML;
  sinEtiquetasInyectadas(html); assert.ok(texto(html).includes(ataque));
  const botones = elementos(html).filter(n => n.tagName === "button");
  const recibidos = [];
  for (const boton of botones) {
    const evento = boton.attrs.find(a => a.name === "onclick").value;
    vm.runInNewContext(evento, { abrirAsignacionSucursal: uid => recibidos.push(uid), cambiarEstadoUsuarioEmpresa: uid => recibidos.push(uid), eliminarUsuarioEmpresa: uid => recibidos.push(uid) });
  }
  assert.equal(recibidos.length, 3); assert.ok(recibidos.every(uid => uid === ataque));
});

test("el resumen y las sucursales del asistente de usuario conservan el texto original", async () => {
  const m = await modulo("js/empresa/usuarios.js");
  await m.contexto.window.abrirWizardUsuario();
  const resumen = m.contexto.wizard.pasos[3].render({ nombre: ataque, apellido: ataque, correo: ataque, rol: ataque, sucursalId: ataque });
  sinEtiquetasInyectadas(resumen); assert.ok(texto(resumen).includes(ataque));
  const opciones = m.contexto.wizard.pasos[2].render();
  sinEtiquetasInyectadas(opciones);
  assert.equal(elementos(opciones).filter(n => n.tagName === "option").at(-1).attrs.find(a => a.name === "value").value, ataque);
  const datos = m.contexto.wizard.pasos[0].collect({ querySelector: () => ({ value: ataque }) });
  assert.equal(datos.nombre, ataque); assert.equal(datos.correo, ataque);
});

test("tabla y resumen de sucursales no convierten los campos en etiquetas", async () => {
  const m = await modulo("js/empresa/sucursales.js");
  m.contexto.datos = { id: ataque, nombre: ataque, codigo: ataque, ciudad: ataque, direccion: ataque, activa: true };
  m.ejecutar("sucursalesEmpresa = [datos]; renderTablaSucursales();");
  const html = m.nodos.get("tablaSucursalesEmpresa").innerHTML;
  sinEtiquetasInyectadas(html); assert.ok(texto(html).includes(ataque));
  m.contexto.window.abrirWizardSucursal();
  const resumen = m.contexto.wizard.pasos.at(-1).render(m.contexto.datos);
  sinEtiquetasInyectadas(resumen); assert.ok(texto(resumen).includes(ataque));
});

test("los datos generales de empresa se muestran sin interpretar HTML", async () => {
  const m = await modulo("js/empresa-admin.js");
  m.contexto.renderIndicadorAlmacenamiento = () => "";
  m.contexto.datos = { nombre: ataque, rut: ataque, correo: ataque, pais: ataque, plan: ataque, maxUsuarios: ataque, maxSucursales: ataque, maxStorageGB: ataque };
  m.ejecutar("empresaActual = datos; renderVistaDashboardEmpresa();");
  const html = m.nodos.get("vistaEmpresaContenido").innerHTML;
  sinEtiquetasInyectadas(html); assert.ok(texto(html).includes(ataque));
});

test("una observación con interpolación de JavaScript se entrega al visor como dato literal", async () => {
  const m = await modulo("js/dashboard.js", "tecnico");
  m.contexto.datos = { alertaJefe: true, ingreso: [{ comentarios: [{ rol: "jefe_taller", texto: ataque, atendido: false }] }] };
  const html = m.ejecutar('empresaActualDashboard = {}; renderBadgesOT(datos, "INGRESO", false, 0);');
  sinEtiquetasInyectadas(html);
  const boton = elementos(html).find(n => (n.attrs || []).some(a => a.name === "data-observacion"));
  const observacion = boton.attrs.find(a => a.name === "data-observacion").value;
  let recibido;
  assert.ok(observacion.includes(ataque));
  // Invocar con el mismo this que usa el navegador.
  const evento = new vm.Script(`(function(){${boton.attrs.find(a => a.name === "onclick").value}})`);
  evento.runInNewContext({ abrirPopoverObservacion: valor => { recibido = valor; } }).call({ dataset: { observacion } });
  assert.equal(recibido, observacion);
});

test("el panel deshabilita los cambios de estado sin alcance y bloquea llamadas manuales", async () => {
  const m = await modulo("js/empresa/usuarios.js", "admin_sucursal");
  for (const datos of [
    { uid: "otro", rol: "admin_empresa", sucursalId: "sucursal" },
    { uid: "otro", rol: "admin_sucursal", sucursalId: "sucursal" },
    { uid: "otro", rol: "tecnico", sucursalId: "otra" },
    { uid: "otro", rol: "tecnico" },
    { uid: "yo", rol: "tecnico", sucursalId: "sucursal" },
    { uid: "otro", rol: "tecnico", sucursalId: "sucursal", suspendidoPorSucursal: true }
  ]) {
    m.contexto.datos = { ...datos, empresaId: "empresa", activo: true };
    m.ejecutar("usuariosEmpresa = [datos]; renderTablaUsuariosEmpresa(usuariosEmpresa);");
    const boton = elementos(m.nodos.get("tablaUsuariosEmpresa").innerHTML).find(n => (n.attrs || []).some(a => a.name === "onclick" && a.value.startsWith("cambiarEstadoUsuarioEmpresa(")));
    assert.ok(boton.attrs.some(a => a.name === "disabled"));
    await m.contexto.window.cambiarEstadoUsuarioEmpresa(datos.uid, false);
    assert.deepEqual(m.llamadas, []);
  }
  m.contexto.datos = { uid: "otro", rol: "tecnico", empresaId: "empresa", sucursalId: "sucursal", activo: true };
  m.ejecutar("renderTablaUsuariosEmpresa([datos]);");
  const boton = elementos(m.nodos.get("tablaUsuariosEmpresa").innerHTML).find(n => (n.attrs || []).some(a => a.name === "onclick" && a.value.startsWith("cambiarEstadoUsuarioEmpresa(")));
  assert.equal(boton.attrs.some(a => a.name === "disabled"), false);
});
