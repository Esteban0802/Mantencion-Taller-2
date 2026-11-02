const crypto = require("node:crypto");
const { aplicarOperacion, inventario, etapaOperacion } = require('./operacion-libre');
const { rutaArchivoOT } = require("./evidencias-ot");
const { prepararPlantilla } = require("./plantilla-libre");
const fallo = (code, mensaje) => { throw Object.assign(Error(mensaje), { code }); };
const texto = (valor, max) => typeof valor === "string" ? valor.trim().slice(0, max) : "";
const roles = ["jefe_taller", "supervisor", "tecnico"];
const bloqueados = ["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"];

async function contexto(tx, db, usuario) {
  if (!usuario?.uid || !usuario.activo || !roles.includes(usuario.rol) || !usuario.empresaId || !usuario.sucursalId) fallo("permission-denied", "No puedes modificar esta OT.");
  const [empresa, sucursal] = await Promise.all([
    tx.get(db.collection("empresas").doc(usuario.empresaId)), tx.get(db.collection("sucursales").doc(usuario.sucursalId))
  ]);
  if (!empresa.exists || empresa.data().activa === false || bloqueados.includes(empresa.data().suscripcion?.estado) ||
      !sucursal.exists || sucursal.data().activa !== true || sucursal.data().empresaId !== usuario.empresaId) fallo("failed-precondition", "La empresa o sucursal no permite cambios.");
  if (empresa.data().modulos?.ordenesServicio === false || empresa.data().modulos?.checklists === false) fallo("permission-denied", "El módulo de órdenes de trabajo no está habilitado.");
  return empresa.data();
}

function etapasDePlantilla(plantilla) {
  if (plantilla.flujoVersion !== 2 || !Array.isArray(plantilla.etapas) || !plantilla.etapas.length || plantilla.etapas.length > 50) fallo("invalid-argument", "La plantilla no contiene un flujo válido.");
  let total = 0;
  const etapas = plantilla.etapas.map((e, i) => {
    const nombre = texto(e.nombre, 100);
    if (!nombre || !Array.isArray(e.items) || !e.items.length || e.items.length > 400) fallo("invalid-argument", "Una etapa de la plantilla no tiene actividades válidas.");
    const items = e.items.map(item => {
      const nombreItem = texto(typeof item === "string" ? item : item.item, 240);
      if (!nombreItem) fallo("invalid-argument", "Hay una actividad vacía en la plantilla.");
      return { item: nombreItem, ok: false, fotos: [], comentarios: [] };
    });
    total += items.length;
    return { id: `e_${i}`, nombre, items, completada: false, requiereAprobacion: false };
  });
  if (total > 2000) fallo("invalid-argument", "La plantilla supera las 2.000 actividades por OT.");
  return etapas;
}

function resumen(ot) {
  const claves = ["empresaId", "sucursalId", "os", "equipo", "serie", "cliente", "estado", "cerrada", "creadoPor", "creadoPorNombre", "fechaCreacion", "fechaActualizacion", "revision", "flujoVersion", "etapaActualNombre", "plantillaMantenimientoNombre"];
  const camposGantt=['fechaInicio','fechaTermino','fechaSolicitudRepuestos','diasRepuestos','fechaRecepcionEstimada','comentarioRepuestos'];
  return { ...Object.fromEntries(claves.map(k => [k, ot[k] ?? null])), resumenVersion:3,
    servicioRechazado:ot.etapasPersonalizadas.some(e=>e.decision?.resultado==='rechazada' && e.decision.pasarUltima===true),
    gantt:ot.gantt ? Object.fromEntries(camposGantt.map(k=>[k,ot.gantt[k] ?? null])) : null,
    etapasPersonalizadas: ot.etapasPersonalizadas.map(e => ({
    id: e.id, nombre: e.nombre, total: e.items.length, completados: e.items.filter(i => i.ok).length,
    completada: e.completada, requiereAprobacion: e.requiereAprobacion, listaParaRevision: !e.completada && e.requiereAprobacion && itemsCompletos(e)
  })) };
}

function huella(etapas) {
  return crypto.createHash("sha256").update(JSON.stringify(etapas.map(e=>({nombre:e.nombre,items:e.items.map(i=>i.item)})))).digest("hex");
}

async function obtenerPlantilla({db,bucket,usuario,datos}) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(datos.plantillaId || "")) fallo("invalid-argument","Plantilla no válida.");
  return db.runTransaction(async tx=>{
    await contexto(tx,db,usuario);
    const snapshot=await tx.get(db.collection("sucursales").doc(usuario.sucursalId).collection("plantillasSucursal").doc(datos.plantillaId));
    if (!snapshot.exists || snapshot.data().activa===false || snapshot.data().empresaId!==usuario.empresaId || snapshot.data().sucursalId!==usuario.sucursalId) fallo("not-found","La plantilla no está disponible en tu sucursal.");
    const preparada=await prepararPlantilla(snapshot.data(),{bucket,empresaId:usuario.empresaId,sucursalId:usuario.sucursalId,plantillaId:datos.plantillaId});
    const etapas=etapasDePlantilla(preparada);
    return {flujoVersion:2,etapas:etapas.map(e=>({id:e.id,nombre:e.nombre,items:e.items.map(i=>({item:i.item}))})),huellaPlantilla:huella(etapas)};
  });
}

async function crearOT({ db, bucket, usuario, datos, ahora = Date.now() }) {
  if (usuario?.rol !== "jefe_taller") fallo("permission-denied", "Solo el Jefe de Taller puede crear una OT.");
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(datos.plantillaId || "") || !/^[0-9a-f-]{36}$/i.test(datos.solicitudId || "")) fallo("invalid-argument", "La solicitud no es válida.");
  const identificacion = Object.fromEntries(["equipo", "serie", "cliente", "os"].map(k => [k, texto(datos[k], 180)]));
  if (!identificacion.equipo || !identificacion.serie || !identificacion.cliente || !identificacion.os) fallo("invalid-argument", "Completa la identificación de la OT.");
  const id = crypto.createHash("sha256").update(`${usuario.uid}:${datos.solicitudId}`).digest("hex").slice(0, 40);
  const ref = db.collection("ots").doc(id);
  await db.runTransaction(async tx => {
    const empresa = await contexto(tx, db, usuario);
    const [actual, plantilla, papelera] = await Promise.all([tx.get(ref), tx.get(db.collection("sucursales").doc(usuario.sucursalId).collection("plantillasSucursal").doc(datos.plantillaId)),tx.get(db.collection("otsPapelera").doc(id))]);
    if (papelera.exists) fallo("failed-precondition", "Esta solicitud ya creó una OT que fue enviada a papelera.");
    const eliminada = await tx.get(db.collection("otsEliminadas").doc(id));
    if (eliminada.exists) fallo("failed-precondition", "Esta solicitud corresponde a una OT eliminada definitivamente. Inicia una nueva OT.");
    if (actual.exists) {
      if (actual.data().creadoPor !== usuario.uid || actual.data().empresaId !== usuario.empresaId || actual.data().sucursalId !== usuario.sucursalId) fallo("permission-denied", "Solicitud de otra cuenta o sucursal.");
      return;
    }
    if (!plantilla.exists || plantilla.data().activa === false || plantilla.data().empresaId !== usuario.empresaId || plantilla.data().sucursalId !== usuario.sucursalId) fallo("not-found", "La plantilla no está disponible en esta sucursal.");
    const p = await prepararPlantilla(plantilla.data(),{bucket,empresaId:usuario.empresaId,sucursalId:usuario.sucursalId,plantillaId:datos.plantillaId}), etapas = etapasDePlantilla(p);
    if (datos.huellaPlantilla && datos.huellaPlantilla !== huella(etapas)) fallo("failed-precondition","La plantilla cambió. Vuelve a seleccionar la gama antes de crear la OT.");
    const ids = new Set(etapas.map(e => e.id));
    if (!Array.isArray(datos.aprobaciones) || datos.aprobaciones.some(id => !ids.has(id))) fallo("invalid-argument", "Las aprobaciones no corresponden a la plantilla.");
    const permiteAprobaciones = Array.isArray(empresa.modulosContratados) ? empresa.modulosContratados.includes("aprobaciones") : empresa.modulos?.aprobaciones !== false;
    if (datos.aprobaciones.length && !permiteAprobaciones) fallo("permission-denied", "El plan no permite aprobaciones.");
    etapas.forEach(e => { e.requiereAprobacion = datos.aprobaciones.includes(e.id); });
    const ot = { ...identificacion, flujoVersion: 2, etapasPersonalizadas: etapas,
      empresaId: usuario.empresaId, sucursalId: usuario.sucursalId, creadoPor: usuario.uid,
      creadoPorNombre: usuario.nombre || "Jefe de Taller", creadoPorRol: usuario.rol,
      gamaEquipo: p.gama || "", plantillaMantenimientoId: `sucursal:${datos.plantillaId}`, plantillaMantenimientoNombre: p.nombre || "",
      plantillaHuella: huella(etapas), plantillaArchivoRuta: p.archivoRuta || "",
      plantillaMantenimientoVersion: p.version || 1, estado: "EN_PROCESO", etapaActualNombre: etapas[0].nombre, cerrada: false,
      revision: 1, fechaCreacion: new Date(ahora), fechaActualizacion: new Date(ahora) };
    if (Buffer.byteLength(JSON.stringify(ot)) > 650000) fallo("invalid-argument", "La plantilla supera el tamaño admitido para una OT.");
    tx.set(ref, ot); tx.set(db.collection("otsResumen").doc(id), resumen(ot));
  });
  return { id };
}

function itemsCompletos(etapa) {
  return etapa.items.length > 0 && etapa.items.every(i => i.ok === true && i.fotos.length > 0 && i.comentarios.length > 0);
}

async function verificarEvidencias(etapa,bucket,otId) {
  await Promise.all(etapa.items.map(async item=>{
    for (const foto of item.fotos) {
      let ruta;
      try {ruta=rutaArchivoOT(foto.url,bucket.name,otId);} catch(_){continue;}
      try {
        const [metadata]=await bucket.file(ruta).getMetadata();
        if (metadata.metadata?.creadoPorUid===foto.creadoPorUid && String(metadata.metadata?.firebaseStorageDownloadTokens || "").split(",").includes(new URL(foto.url).searchParams.get("token"))) return;
      } catch(error) {if(Number(error.code)!==404)throw error;}
    }
    fallo("failed-precondition","Una actividad no tiene una evidencia disponible. Vuelve a adjuntar su archivo antes de completar la etapa.");
  }));
}

async function actualizarOT({ db, bucket, usuario, datos, ahora = Date.now() }) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(datos.otId || "")) fallo("invalid-argument", "OT no válida.");
  const ref = db.collection("ots").doc(datos.otId);
  return db.runTransaction(async tx => {
    await contexto(tx, db, usuario);
    const snap = await tx.get(ref);
    if (!snap.exists) fallo("not-found", "La OT no existe.");
    const ot = { ...snap.data(), etapasPersonalizadas: structuredClone(snap.data().etapasPersonalizadas) };
    if(ot.repuestos)ot.repuestos=structuredClone(ot.repuestos);
    if (ot.empresaId !== usuario.empresaId || ot.sucursalId !== usuario.sucursalId || ot.flujoVersion !== 2) fallo("permission-denied", "La OT pertenece a otra sucursal o utiliza otro flujo.");
    if(datos.accion==='sincronizarResumen') {
      tx.set(db.collection('otsResumen').doc(datos.otId),resumen(ot));
      tx.update(ref,{resumenVersion:3});return {ok:true};
    }
    if (ot.cerrada) {
      if (datos.accion === "cerrar" && usuario.rol === "jefe_taller") return { ok:true };
      fallo("failed-precondition", "La OT está cerrada.");
    }
    const etapas = ot.etapasPersonalizadas;
    const etapa = etapas.find(e => e.id === datos.etapaId);
    const activa = etapas.find(e => !e.completada);
    if (["identificacion","sincronizarRepuestos","usarRepuesto","guardarRepuestos","guardarGantt"].includes(datos.accion)) {
      await aplicarOperacion({tx,db,ot,usuario,datos,ahora});
    } else if (["cerrar","validarCierre"].includes(datos.accion)) {
      if (usuario.rol !== "jefe_taller") fallo("permission-denied", "Solo el Jefe de Taller puede cerrar la OT.");
      if (activa) fallo("failed-precondition", `No puedes cerrar la OT. Etapas pendientes de completar o aprobar: ${etapas.filter(e=>!e.completada).map(e=>e.nombre).join(', ')}.`);
      const rechazo=etapas.some(e=>e.decision?.resultado==='rechazada' && e.decision.pasarUltima===true);
      if(!rechazo && ot.repuestos) {
        const actuales=await inventario(tx,db,ot,ot.os);
        const pendientes=actuales.filter(i=>!i.recibidoInventario);
        const faltantes=(ot.repuestos.items || []).filter(i=>!actuales.some(a=>a.inventarioItemId===i.inventarioItemId));
        if(pendientes.length)fallo('failed-precondition',`No puedes cerrar la OT: hay ${pendientes.length} repuesto(s) pendiente(s) de recepción en Inventario.`);
        if(faltantes.length)fallo('failed-precondition','No puedes cerrar la OT: algunos repuestos vinculados ya no están en la OS de Inventario. Revisa su registro.');
        ot.repuestos.items=actuales.map(i=>({...i,...(ot.repuestos.items || []).find(a=>a.inventarioItemId===i.inventarioItemId),recibidoInventario:i.recibidoInventario}));
      }
      if(datos.accion==='validarCierre')return {ok:true};
      ot.cerrada = true; ot.estado = "CERRADA"; ot.fechaCierre = new Date(ahora); ot.cerradoPor = usuario.uid;
    } else {
      if (!etapa || etapa !== activa) fallo("failed-precondition", "Solo puedes modificar la etapa actual. Las etapas completadas están protegidas.");
      const item = Number.isInteger(datos.itemIndex) ? etapa.items[datos.itemIndex] : null;
      if (["aprobar", "rechazar"].includes(datos.accion)) {
        if (usuario.rol !== "jefe_taller" || !etapa.requiereAprobacion) fallo("permission-denied", "Solo el Jefe de Taller puede decidir en una etapa con aprobación.");
        const comentario = texto(datos.comentario,3000);
        const evidencias = datos.evidencias;
        if (!comentario || !Array.isArray(evidencias) || !evidencias.length || evidencias.length > 20 || evidencias.some(url=>typeof url !== "string" || !etapa.items.some(i=>i.fotos.some(f=>f.url===url && f.creadoPorUid===usuario.uid)))) fallo("invalid-argument", "Ingresa un comentario y adjunta evidencias propias para la decisión.");
        if (!itemsCompletos(etapa)) fallo("failed-precondition", "Completa las actividades antes de registrar la decisión.");
        await verificarEvidencias(etapa,bucket,datos.otId);
        await verificarEvidencias({items:evidencias.map(url=>({fotos:[etapa.items.flatMap(i=>i.fotos).find(f=>f.url===url)]}))},bucket,datos.otId);
        if (typeof datos.pasarUltima !== "boolean") fallo("invalid-argument", "Selecciona el destino del rechazo.");
        etapa.decision = { resultado:datos.accion === "aprobar" ? "aprobada" : "rechazada", comentario, evidencias, usuario:usuario.nombre || usuario.rol, uid:usuario.uid, fecha:ahora, pasarUltima:datos.accion === "rechazar" && datos.pasarUltima };
        if (datos.accion === "aprobar" && etapaOperacion(ot) && !ot.repuestos) ot.repuestos={items:await inventario(tx,db,ot,ot.os),origen:'inventario',inventarioOS:ot.os};
        if (datos.accion === "aprobar" || datos.pasarUltima && etapa !== etapas.at(-1)) {
          etapa.completada=true; etapa.completadaPor=usuario.uid; etapa.completadaEn=ahora;
          if (datos.accion === "rechazar") for (const omitida of etapas.slice(etapas.indexOf(etapa)+1,-1)) {
            omitida.completada=true; omitida.omitidaPorRechazo=true; omitida.omitidaPor=usuario.uid; omitida.omitidaEn=ahora;
          }
        }
      } else if (datos.accion === "completar") {
        if (etapa.requiereAprobacion && usuario.rol !== "jefe_taller") fallo("permission-denied", "Esta etapa requiere aprobación del Jefe de Taller.");
        if (!itemsCompletos(etapa)) fallo("failed-precondition", "Completa todas las actividades con evidencia y comentario antes de continuar.");
        await verificarEvidencias(etapa,bucket,datos.otId);
        etapa.completada = true; etapa.completadaPor = usuario.uid; etapa.completadaEn = ahora;
      } else {
        if (!item) fallo("invalid-argument", "Actividad no válida.");
        if (datos.accion === "marcar") {
          if (typeof datos.ok !== "boolean") fallo("invalid-argument", "Estado no válido.");
          item.ok = datos.ok;
        } else if (datos.accion === "comentar") {
          const mensaje = texto(datos.texto, 3000);
          if (!mensaje || !/^[0-9a-f-]{36}$/i.test(datos.comentarioId || "")) fallo("invalid-argument", "Escribe un comentario válido.");
          if (!item.comentarios.some(c => c.id === datos.comentarioId)) item.comentarios.push({ id: datos.comentarioId, texto: mensaje, creadoPorUid: usuario.uid, usuario: usuario.nombre || usuario.rol, rol: usuario.rol, fecha: ahora });
        } else if (datos.accion === "quitarComentario") {
          const c = item.comentarios.find(c => c.id === datos.comentarioId);
          if (c && c.creadoPorUid !== usuario.uid) fallo("permission-denied", "Solo puedes eliminar tus propios comentarios.");
          item.comentarios = item.comentarios.filter(c => c.id !== datos.comentarioId);
        } else if (datos.accion === "adjuntar") {
          let ruta;
          try { ruta = rutaArchivoOT(datos.url, bucket.name, datos.otId); } catch (_) { fallo("invalid-argument", "Evidencia no válida."); }
          if (!ruta.startsWith(`ots/${datos.otId}/personalizada_${etapa.id}/item_${datos.itemIndex}/`)) fallo("invalid-argument", "El archivo no pertenece a esta actividad.");
          const limpiezaId = crypto.createHash("sha256").update(ruta).digest("hex");
          const limpieza = await tx.get(db.collection("limpiezasEvidencias").doc(limpiezaId));
          if (limpieza.exists) fallo("failed-precondition", "Esta evidencia se está eliminando o ya fue eliminada. Vuelve a cargar el archivo.");
          const [metadata] = await bucket.file(ruta).getMetadata();
          if (metadata.metadata?.creadoPorUid !== usuario.uid) fallo("permission-denied", "Solo puedes adjuntar tus propias evidencias.");
          const token = String(metadata.metadata.firebaseStorageDownloadTokens || "").split(",")[0];
          if (!token) fallo("failed-precondition", "El archivo no tiene un enlace válido.");
          const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(ruta)}?alt=media&token=${token}`;
          if (!item.fotos.some(f => f.url === url)) item.fotos.push({ url, nombre: texto(datos.nombre,180) || "Evidencia", tipo: metadata.contentType || "", creadoPorUid: usuario.uid });
        } else if (datos.accion === "quitarEvidencia") {
          const f = item.fotos.find(f => f.url === datos.url);
          if (f && f.creadoPorUid !== usuario.uid) fallo("permission-denied", "Solo puedes quitar tus propias evidencias.");
          item.fotos = item.fotos.filter(f => f.url !== datos.url);
        } else fallo("invalid-argument", "Acción no válida.");
      }
      ot.etapaActualNombre = etapas.find(e => !e.completada)?.nombre || "Pendiente de cierre";
    }
    ot.resumenVersion=3;
    ot.revision++; ot.fechaActualizacion = new Date(ahora);
    if (Buffer.byteLength(JSON.stringify(ot)) > 850000) fallo("resource-exhausted", "La OT alcanzó su capacidad de registros. Reduce el texto del comentario.");
    tx.set(ref, ot); tx.set(db.collection("otsResumen").doc(datos.otId), resumen(ot));
    return { ok:true };
  });
}
module.exports = { crearOT, actualizarOT, obtenerPlantilla, etapasDePlantilla, itemsCompletos, resumen };
