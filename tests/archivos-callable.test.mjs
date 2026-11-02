import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import { getStorage, connectStorageEmulator, ref, getBytes, getMetadata, uploadBytes } from "firebase/storage";
import { doc, setDoc, updateDoc, getDoc } from "firebase/firestore";

test("una OT de nombres libres completa sus etapas y aprobaciones mediante callables reales", {timeout:180000},async()=>{
  const projectId="demo-overtrack";
  const entorno=await initializeTestEnvironment({projectId,firestore:{host:"127.0.0.1",port:8080},storage:{host:"127.0.0.1",port:9199}});
  const bucket=ref(entorno.unauthenticatedContext().storage(),"archivo").bucket;
  const app=initializeApp({projectId,apiKey:"demo-key",storageBucket:bucket},`libre-${randomUUID()}`);
  try {
    const auth=getAuth(app);connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});
    const cuenta=await createUserWithEmailAndPassword(auth,`${randomUUID()}@example.test`,"PruebaLocal123!");
    const usuario={uid:cuenta.user.uid,nombre:"Jefe",activo:true,rol:"jefe_taller",empresaId:"empresa-libre",sucursalId:"s-libre"};
    const perfil=rol=>entorno.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),"usuarios",usuario.uid),{rol}));
    await entorno.withSecurityRulesDisabled(async c=>{
      const db=c.firestore();
      await setDoc(doc(db,"usuarios",usuario.uid),usuario);
      await setDoc(doc(db,"empresas",usuario.empresaId),{activa:true,storageCuotaVersion:1,storageUsadoBytes:0,storageReservadoBytes:0,storageArchivos:0,maxStorageGB:1});
      await setDoc(doc(db,"sucursales",usuario.sucursalId),{empresaId:usuario.empresaId,activa:true});
      await setDoc(doc(db,"sucursales",usuario.sucursalId,"plantillasSucursal","libre"),{empresaId:usuario.empresaId,sucursalId:usuario.sucursalId,activa:true,gama:"GX",nombre:"Flujo propio",archivoRuta:`empresas/${usuario.empresaId}/sucursales/${usuario.sucursalId}/plantillas/libre/original.xlsx`});
    });
    const funciones=getFunctions(app,"us-central1");connectFunctionsEmulator(funciones,"127.0.0.1",5001);
    const crear=httpsCallable(funciones,"crearOTFlujoLibre"), cambiar=httpsCallable(funciones,"actualizarOTFlujoLibre"),subir=httpsCallable(funciones,"subirArchivoOT");
    const XLSX=createRequire(import.meta.url)("xlsx"),libro=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro,XLSX.utils.aoa_to_sheet([["Desarmar"]]),"Desarme personalizado");
    XLSX.utils.book_append_sheet(libro,XLSX.utils.aoa_to_sheet([["Verificar"]]),"Control y entrega");
    await perfil("admin_sucursal");
    await httpsCallable(funciones,"subirArchivoEmpresa")({ruta:`empresas/${usuario.empresaId}/sucursales/${usuario.sucursalId}/plantillas/libre/original.xlsx`,contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",base64:XLSX.write(libro,{type:"buffer",bookType:"xlsx"}).toString("base64")});
    await perfil("jefe_taller");
    const vista=(await httpsCallable(funciones,"obtenerPlantillaFlujoLibre")({plantillaId:"libre"})).data;
    assert.deepEqual(vista.etapas.map(e=>e.nombre),["Desarme personalizado","Control y entrega"]);
    const solicitud={solicitudId:randomUUID(),plantillaId:"libre",huellaPlantilla:vista.huellaPlantilla,equipo:"GX",serie:"123",cliente:"Cliente",os:"FLUJO-LIBRE",aprobaciones:["e_0"]};
    const {id}=(await crear(solicitud)).data;
    assert.equal((await crear(solicitud)).data.id,id);
    await assert.rejects(cambiar({otId:id,accion:"marcar",etapaId:"e_1",itemIndex:0,ok:true}),{code:"functions/failed-precondition"});
    for(const etapaId of ["e_0","e_1"]) {
      await perfil("tecnico");
      await cambiar({otId:id,accion:"marcar",etapaId,itemIndex:0,ok:true});
      await cambiar({otId:id,accion:"comentar",etapaId,itemIndex:0,texto:"Realizado",comentarioId:randomUUID()});
      const {url}=(await subir({otId:id,etapa:`personalizada_${etapaId}`,itemIndex:0,subidaId:randomUUID(),nombre:"prueba.jpg",contentType:"image/jpeg",base64:Buffer.from([255,216,255]).toString("base64")})).data;
      await cambiar({otId:id,accion:"adjuntar",etapaId,itemIndex:0,url,nombre:"prueba.jpg"});
      await assert.rejects(httpsCallable(funciones,"eliminarArchivoOT")({otId:id,url}),{code:"functions/failed-precondition"});
      if(etapaId==="e_0") {
        await assert.rejects(cambiar({otId:id,accion:"completar",etapaId}),{code:"functions/permission-denied"});
        await perfil("jefe_taller");
      }
      await cambiar({otId:id,accion:"completar",etapaId});
    }
    await assert.rejects(cambiar({otId:id,accion:"cerrar"}),{code:"functions/permission-denied"});
    await perfil("jefe_taller");await cambiar({otId:id,accion:"cerrar"});
    await entorno.withSecurityRulesDisabled(async c=>{
      const ot=(await getDoc(doc(c.firestore(),"ots",id))).data();
      assert.equal(ot.cerrada,true);assert.equal(ot.fechaCreacion.toDate() instanceof Date,true);
      assert.deepEqual(ot.etapasPersonalizadas.map(e=>e.nombre),["Desarme personalizado","Control y entrega"]);
      assert.equal(ot.etapasPersonalizadas.every(e=>e.completada && e.items[0].fotos.length===1),true);
      assert.equal((await getDoc(doc(c.firestore(),"otsResumen",id))).data().cerrada,true);
    });
    await assert.rejects(cambiar({otId:id,accion:"marcar",etapaId:"e_1",itemIndex:0,ok:false}),{code:"functions/failed-precondition"});
    await httpsCallable(funciones,"enviarOTPapelera")({otId:id});await httpsCallable(funciones,"restaurarOTPapelera")({otId:id});
    await entorno.withSecurityRulesDisabled(async c=>assert.equal((await getDoc(doc(c.firestore(),"ots",id))).data().etapasPersonalizadas.length,2));
  } finally {await deleteApp(app);await entorno.cleanup();}
});

test("la papelera restaura una OT cerrada y sus archivos usando callables reales", { timeout: 120000 }, async () => {
  const projectId = "demo-overtrack";
  const entorno = await initializeTestEnvironment({ projectId, firestore: { host: "127.0.0.1", port: 8080 }, storage: { host: "127.0.0.1", port: 9199 } });
  const bucket = ref(entorno.unauthenticatedContext().storage(), "archivo").bucket;
  const app = initializeApp({ projectId, apiKey: "demo-key", storageBucket: bucket }, `papelera-${randomUUID()}`);
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    const cuenta = await createUserWithEmailAndPassword(auth, `${randomUUID()}@example.test`, "PruebaLocal123!");
    const usuario = { uid: cuenta.user.uid, activo: true, rol: "jefe_taller", empresaId: "empresa-papelera", sucursalId: "s-papelera" };
    const otId = `papelera-${randomUUID()}`;
    const original = { empresaId: usuario.empresaId, sucursalId: usuario.sucursalId, cerradoPor: usuario.uid, estado: "CERRADA", cerrada: true, os: "Prueba de restauración", ingreso: [{ comentarios: [{ creadoPorUid: usuario.uid, texto: "Conservar" }] }] };
    await entorno.withSecurityRulesDisabled(async contexto => {
      const db = contexto.firestore();
      await setDoc(doc(db, "usuarios", usuario.uid), usuario);
      await setDoc(doc(db, "empresas", usuario.empresaId), { activa: true, storageCuotaVersion: 1, storageUsadoBytes: 0, storageReservadoBytes: 0, storageArchivos: 0, maxStorageGB: 1 });
      await setDoc(doc(db, "sucursales", usuario.sucursalId), { empresaId: usuario.empresaId, activa: true });
      await setDoc(doc(db, "ots", otId), { ...original, estado: "INGRESO", cerrada: false });
      await setDoc(doc(db, "otsResumen", otId), { empresaId: usuario.empresaId, sucursalId: usuario.sucursalId, os: original.os, cerrada: true });
    });
    const funciones = getFunctions(app, "us-central1"); connectFunctionsEmulator(funciones, "127.0.0.1", 5001);
    const subida = (await httpsCallable(funciones, "subirArchivoOT")({ otId, etapa: "ingreso", itemIndex: 0, subidaId: randomUUID(), nombre: "original.jpg", contentType: "image/jpeg", base64: Buffer.from([255,216,255]).toString("base64") })).data;
    const bucketReal = new URL(subida.url).pathname.match(/^\/v0\/b\/([^/]+)\/o\//)[1];
    const rutaReal = decodeURIComponent(new URL(subida.url).pathname.split("/o/")[1]);
    original.ingreso[0].evidencias = [subida.url];
    await entorno.withSecurityRulesDisabled(contexto => setDoc(doc(contexto.firestore(), "ots", otId), original));
    await httpsCallable(funciones, "enviarOTPapelera")({ otId });
    await entorno.withSecurityRulesDisabled(async contexto => {
      assert.equal((await getDoc(doc(contexto.firestore(), "ots", otId))).exists(), false);
      assert.deepEqual((await getDoc(doc(contexto.firestore(), "otsPapelera", otId))).data().orden, original);
      assert.deepEqual(new Uint8Array(await getBytes(ref(contexto.storage(`gs://${bucketReal}`), rutaReal))), new Uint8Array([255,216,255]));
    });
    await assert.rejects(httpsCallable(funciones, "enviarOTPapelera")({ otId }), { code: "functions/not-found" });
    await entorno.withSecurityRulesDisabled(async contexto => {
      await updateDoc(doc(contexto.firestore(), "usuarios", usuario.uid), { rol: "admin_empresa" });
      await updateDoc(doc(contexto.firestore(), "empresas", usuario.empresaId), { storageCuotaVersion: 0 });
    });
    const medicion = (await httpsCallable(funciones, "recalcularAlmacenamientoEmpresa")({ empresaId: usuario.empresaId })).data;
    assert.equal(medicion.totalBytes, 3, "La cuota conserva los archivos de la papelera");
    await entorno.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "usuarios", usuario.uid), { rol: "jefe_taller" }));
    await httpsCallable(funciones, "restaurarOTPapelera")({ otId });
    await entorno.withSecurityRulesDisabled(async contexto => {
      assert.deepEqual((await getDoc(doc(contexto.firestore(), "ots", otId))).data(), original);
      assert.equal((await getDoc(doc(contexto.firestore(), "otsPapelera", otId))).exists(), false);
      assert.equal((await getDoc(doc(contexto.firestore(), "otsResumen", otId))).data().cerrada, true);
    });
  } finally { await deleteApp(app); await entorno.cleanup(); }
});

test("las callables cargan hasta 20 MB, bloquean cancelación y conservan descarga", { timeout: 120000 }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || "demo-overtrack";
  assert.ok(projectId.startsWith("demo-"), "Esta prueba solo puede utilizar un proyecto demo");
  const entorno = await initializeTestEnvironment({ projectId,
    firestore: { host: "127.0.0.1", port: 8080 }, storage: { host: "127.0.0.1", port: 9199 }
  });
  const bucket = ref(entorno.unauthenticatedContext().storage(), "archivo").bucket;
  const app = initializeApp({ projectId, apiKey: "demo-key", storageBucket: bucket }, `archivos-${randomUUID()}`);
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    const cuenta = await createUserWithEmailAndPassword(auth, `${randomUUID()}@example.test`, "PruebaLocal123!");
    await entorno.withSecurityRulesDisabled(async contexto => {
      await setDoc(doc(contexto.firestore(), "usuarios", cuenta.user.uid), { uid: cuenta.user.uid, rol: "tecnico", activo: true, empresaId: "empresa-archivos", sucursalId: "s" });
      await setDoc(doc(contexto.firestore(), "empresas", "empresa-archivos"), { activa: true, storageCuotaVersion: 1, storageUsadoBytes: 0, storageReservadoBytes: 0, storageArchivos: 0, maxStorageGB: 1, suscripcion: { estado: "activa" } });
      await setDoc(doc(contexto.firestore(), "ots", "ot-archivos"), { empresaId: "empresa-archivos", sucursalId: "s", estado: "INGRESO", cerrada: false });
    });
    const funciones = getFunctions(app, "us-central1");
    connectFunctionsEmulator(funciones, "127.0.0.1", 5001);
    const subir = httpsCallable(funciones, "subirArchivoOT", { timeout: 120000 });
    const eliminar = httpsCallable(funciones, "eliminarArchivoOT");
    const datos = { otId: "ot-archivos", etapa: "ingreso", itemIndex: 0, subidaId: randomUUID(), nombre: "foto.jpg", contentType: "image/jpeg", base64: Buffer.from([255,216,255]).toString("base64") };
    const resultado = (await subir(datos)).data;
    const bucketReal = new URL(resultado.url).pathname.match(/^\/v0\/b\/([^/]+)\/o\//)[1];
    const storage = getStorage(app, `gs://${bucketReal}`);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    const archivoRef = url => ref(storage, decodeURIComponent(new URL(url).pathname.split("/o/")[1]));
    assert.deepEqual(new Uint8Array(await getBytes(archivoRef(resultado.url))), new Uint8Array([255,216,255]));
    assert.equal((await getMetadata(archivoRef(resultado.url))).customMetadata.creadoPorUid, cuenta.user.uid);
    assert.equal((await subir(datos)).data.url, resultado.url);
    await assert.rejects(uploadBytes(archivoRef(resultado.url), new Uint8Array([255,216,255]), { contentType: "image/jpeg", customMetadata: { creadoPorUid: cuenta.user.uid } }));

    const bytes = Buffer.alloc(20 * 1024 * 1024); bytes.set([255,216,255]);
    const grande = (await subir({ ...datos, subidaId: randomUUID(), base64: bytes.toString("base64") })).data;
    assert.equal((await getMetadata(archivoRef(grande.url))).size, bytes.length);
    await eliminar({ otId: datos.otId, url: grande.url });

    await entorno.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "empresas", "empresa-archivos"), { maxStorageGB: 10 / 1024 ** 3 }));
    const simultaneas = await Promise.allSettled([1,2].map(() => subir({ ...datos, subidaId: randomUUID(), base64: Buffer.from([255,216,255,0,0,0]).toString("base64") })));
    assert.equal(simultaneas.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(simultaneas.find(r => r.status === "rejected").reason.code, "functions/resource-exhausted");
    await eliminar({ otId: datos.otId, url: simultaneas.find(r => r.status === "fulfilled").value.data.url });
    await entorno.withSecurityRulesDisabled(async contexto => {
      const empresa = (await getDoc(doc(contexto.firestore(), "empresas", "empresa-archivos"))).data();
      assert.equal(empresa.storageUsadoBytes, 3);
      assert.equal(empresa.storageReservadoBytes, 0);
      assert.equal(empresa.storageArchivos, 1);
      await updateDoc(doc(contexto.firestore(), "empresas", "empresa-archivos"), { maxStorageGB: 1 });
    });

    await entorno.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "empresas", "empresa-archivos"), { activa: true, suscripcion: { estado: "cancelada" } }));
    await assert.rejects(subir({ ...datos, subidaId: randomUUID() }), { code: "functions/failed-precondition" });
    await assert.rejects(eliminar({ otId: datos.otId, url: resultado.url }), { code: "functions/failed-precondition" });
    assert.equal((await getBytes(archivoRef(resultado.url))).byteLength, 3);

    await entorno.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "empresas", "empresa-archivos"), { activa: true, suscripcion: { estado: "activa" } }));
    await eliminar({ otId: datos.otId, url: resultado.url });
    await assert.rejects(getMetadata(archivoRef(resultado.url)), { code: "storage/object-not-found" });
    await entorno.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "usuarios", cuenta.user.uid), { rol: "admin_empresa" }));
    const subirEmpresa = httpsCallable(funciones, "subirArchivoEmpresa");
    const eliminarEmpresa = httpsCallable(funciones, "eliminarArchivoEmpresa");
    const rutaLogo = "empresas/empresa-archivos/informe/logo.png";
    const imagen = (await subirEmpresa({ ruta: rutaLogo, contentType: "image/png", base64: Buffer.from([137,80,78,71,13,10,26,10]).toString("base64") })).data;
    assert.equal((await getMetadata(archivoRef(imagen.url))).size, 8);
    await entorno.withSecurityRulesDisabled(async contexto => {
      assert.equal((await getDoc(doc(contexto.firestore(), "empresas", "empresa-archivos"))).data().storageUsadoBytes, 8);
    });
    await eliminarEmpresa({ ruta: rutaLogo });
    await entorno.withSecurityRulesDisabled(async contexto => {
      assert.equal((await getDoc(doc(contexto.firestore(), "empresas", "empresa-archivos"))).data().storageUsadoBytes, 0);
      assert.equal((await getDoc(doc(contexto.firestore(), "empresas", "empresa-archivos"))).data().storageReservadoBytes, 0);
    });
    await entorno.withSecurityRulesDisabled(async contexto => {
      await setDoc(doc(contexto.firestore(), "empresas", "empresa-anterior"), { activa: true, maxStorageGB: 1 });
      await updateDoc(doc(contexto.firestore(), "usuarios", cuenta.user.uid), { empresaId: "empresa-anterior" });
      const bytes = Buffer.alloc(16); bytes.set([137,80,78,71,13,10,26,10]);
      await uploadBytes(ref(contexto.storage(`gs://${bucketReal}`), "empresas/empresa-anterior/informe/anterior.png"), bytes, { contentType: "image/png" });
    });
    const nuevaImagen = { ruta: "empresas/empresa-anterior/informe/nueva.png", contentType: "image/png", base64: Buffer.from([137,80,78,71,13,10,26,10]).toString("base64") };
    await assert.rejects(subirEmpresa(nuevaImagen), { code: "functions/failed-precondition" });
    const medir = httpsCallable(funciones, "recalcularAlmacenamientoEmpresa", { timeout: 120000 });
    const medicion = (await medir({ empresaId: "empresa-anterior" })).data;
    assert.equal(medicion.totalBytes, 16); assert.equal(medicion.totalArchivos, 1);
    await subirEmpresa(nuevaImagen);
    const actualizada = (await medir({ empresaId: "empresa-anterior" })).data;
    assert.equal(actualizada.totalBytes, 24); assert.equal(actualizada.totalArchivos, 2);
    await signOut(auth);
    await assert.rejects(subir({ ...datos, subidaId: randomUUID() }), { code: "functions/unauthenticated" });
  } finally {
    await deleteApp(app);
    await entorno.cleanup();
  }
});
