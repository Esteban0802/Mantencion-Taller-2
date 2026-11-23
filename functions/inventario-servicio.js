const crypto = require("node:crypto");
const fallo = (code, message) => { throw Object.assign(new Error(message), { code }); };
const idValido = v => typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const texto = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";
const nombre = u => u.nombreCompleto || u.nombre || "Usuario";
const ESTADOS_BLOQUEADOS = ["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"];

function resumenServicio(items) {
  const esperado = items.reduce((n, i) => n + i.cantidad, 0);
  const recibido = items.reduce((n, i) => n + i.recibido, 0);
  const retirado = items.reduce((n, i) => n + i.retirado, 0);
  return { esperado, recibido, retirado, disponible: recibido - retirado,
    estado: !recibido ? "Pendiente de recepción" : retirado === recibido && recibido === esperado ? "Retirado" :
      retirado > 0 ? "Retiro parcial" : "Disponible" };
}

function normalizarItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 100) fallo("invalid-argument", "Agrega entre 1 y 100 repuestos.");
  const ids = new Set();
  return items.map(i => {
    if (!idValido(i.id) || ids.has(i.id) || !texto(i.np,100) || !texto(i.descripcion,300) ||
      !Number.isSafeInteger(i.cantidad) || i.cantidad < 1 || i.cantidad > 1000000) {
      fallo("invalid-argument", "Revisa NP, descripción y cantidades enteras de los repuestos.");
    }
    ids.add(i.id);
    return { id:i.id, np:texto(i.np,100), descripcion:texto(i.descripcion,300), cantidad:i.cantidad };
  });
}

async function gestionarServicio({ db, bucket, usuario, datos, ahora = Date.now() }) {
  if (!usuario?.activo || !usuario.empresaId || !usuario.sucursalId ||
    !["jefe_taller","planificador","bodeguero"].includes(usuario.rol)) fallo("permission-denied", "No puedes modificar este inventario.");
  if (!idValido(datos.ordenId)) fallo("invalid-argument", "La orden no es válida.");
  const ordenRef = db.collection("inventarioServicio").doc(datos.ordenId);
  const accion = datos.accion;
  const movimiento = ["recibir","retirar"].includes(accion);
  if (!movimiento && !["crear","editar"].includes(accion)) fallo("invalid-argument", "La operación no es válida.");
  if (movimiento && usuario.rol !== "bodeguero") {
    fallo("permission-denied", "Tu perfil no puede realizar esta operación.");
  }
  if (movimiento && !idValido(datos.movimientoId)) fallo("invalid-argument", "El movimiento no es válido.");
  let evidencias = [];
  let huella;
  if (movimiento) {
    if (!Array.isArray(datos.lineas) || !datos.lineas.length || datos.lineas.length > 100 ||
      new Set(datos.lineas.map(i=>i.itemId)).size !== datos.lineas.length ||
      datos.lineas.some(i=>!idValido(i.itemId) || !Number.isSafeInteger(i.cantidad) || i.cantidad <= 0)) {
      fallo("invalid-argument", "Selecciona repuestos y cantidades enteras mayores que cero.");
    }
    if (!Array.isArray(datos.rutas) || !datos.rutas.length || datos.rutas.length > 10 || new Set(datos.rutas).size !== datos.rutas.length) {
      fallo("invalid-argument", "Adjunta entre 1 y 10 evidencias del movimiento.");
    }
    if (accion === "recibir") {
      const fecha = datos.fechaRecepcion;
      const valida = typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha) &&
        Number.isFinite(Date.parse(fecha)) && new Date(fecha).toISOString().slice(0,10) === fecha;
      const hoyChile = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(ahora);
      if (!valida || fecha > hoyChile || fecha < "2000-01-01") fallo("invalid-argument", "La fecha real de recepción no puede estar en el futuro.");
    }
    huella = crypto.createHash("sha256").update(JSON.stringify({accion,lineas:datos.lineas,rutas:datos.rutas,fechaRecepcion:datos.fechaRecepcion || "",retiraId:datos.retiraId || ""})).digest("hex");
    const prefijo = `empresas/${usuario.empresaId}/inventarioServicio/${usuario.sucursalId}/${datos.ordenId}/${datos.movimientoId}/`;
    for (const ruta of datos.rutas) {
      if (typeof ruta !== "string" || !ruta.startsWith(prefijo) || !ruta.slice(prefijo.length) || ruta.slice(prefijo.length).includes("/") || ruta.split("/").some(p=>[".",".."].includes(p))) {
        fallo("permission-denied", "La evidencia no corresponde a este movimiento.");
      }
      const [meta] = await bucket.file(ruta).getMetadata();
      if (meta.metadata?.creadoPorUid !== usuario.uid || meta.metadata?.cuotaEmpresaId !== usuario.empresaId) fallo("permission-denied", "La evidencia no pertenece al usuario.");
      const token = String(meta.metadata?.firebaseStorageDownloadTokens || "").split(",")[0];
      if (!token) fallo("failed-precondition", "No se pudo verificar la evidencia.");
      evidencias.push({ruta,nombre:ruta.slice(prefijo.length).replace(/^[^_]+_/,""),tipo:meta.contentType || "application/octet-stream",
        url:`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(ruta)}?alt=media&token=${encodeURIComponent(token)}`});
    }
  }
  return db.runTransaction(async tx => {
    const [perfilSnap, empresaSnap, sucursalSnap, ordenSnap] = await Promise.all([
      tx.get(db.collection("usuarios").doc(usuario.uid)),tx.get(db.collection("empresas").doc(usuario.empresaId)),
      tx.get(db.collection("sucursales").doc(usuario.sucursalId)),tx.get(ordenRef)
    ]);
    const perfil=perfilSnap.data(), empresa=empresaSnap.data(), sucursal=sucursalSnap.data();
    if (!perfilSnap.exists || perfil.activo !== true || perfil.rol !== usuario.rol || perfil.empresaId !== usuario.empresaId || perfil.sucursalId !== usuario.sucursalId ||
      !sucursalSnap.exists || sucursal.empresaId !== usuario.empresaId || sucursal.activa === false) fallo("permission-denied", "La asignación del usuario o sucursal cambió.");
    if (!empresaSnap.exists || empresa.activa === false || ESTADOS_BLOQUEADOS.includes(empresa.suscripcion?.estado) || empresa.modulos?.inventario === false) {
      fallo("failed-precondition", "La empresa no permite operar en Inventario.");
    }
    const orden=ordenSnap.data();
    if (ordenSnap.exists && (orden.empresaId !== usuario.empresaId || orden.sucursalId !== usuario.sucursalId)) fallo("permission-denied", "La OS pertenece a otra empresa o sucursal.");
    if (accion === "crear" || accion === "editar") {
      const identificacion = Object.fromEntries(["cliente","os","equipo","serie"].map(k=>[k,texto(datos[k],180)]));
      if (Object.values(identificacion).some(v=>!v)) fallo("invalid-argument", "Completa cliente, OS, equipo y serie.");
      const nuevos=normalizarItems(datos.items);
      let referenciaExcel = null;
      if (datos.referenciaExcel != null) {
        if (accion !== "crear" || usuario.rol !== "bodeguero") fallo("permission-denied", "Solo Bodega puede importar el inventario de Servicio.");
        const origen=datos.referenciaExcel;
        if (!origen || typeof origen !== "object" || !texto(origen.archivo,180) || !texto(origen.hoja,100) ||
          !Array.isArray(origen.filas) || !origen.filas.length || origen.filas.length>100) fallo("invalid-argument", "Revisa el origen de la importación.");
        referenciaExcel={archivo:texto(origen.archivo,180),hoja:texto(origen.hoja,100),
          filas:origen.filas.map(f=>{
            if (!Number.isSafeInteger(f.numero) || f.numero<1 || f.numero>1000000) fallo("invalid-argument", "La fila de origen no es válida.");
            return {numero:f.numero,...Object.fromEntries(["fechaRecepcion","fechaIngreso","recibio","fechaRetiro","retira"].map(k=>[k,texto(String(f[k] ?? ""),180)]))};
          }),importadoPor:usuario.uid,importadoPorNombre:nombre(perfil),fechaImportacion:ahora};
      }
      if (accion === "crear" && ordenSnap.exists) {
        if (orden.creadoPor === usuario.uid && Object.keys(identificacion).every(k=>orden[k]===identificacion[k]) &&
          JSON.stringify(orden.items.map(({id,np,descripcion,cantidad})=>({id,np,descripcion,cantidad})))===JSON.stringify(nuevos)) return {ok:true,ordenId:datos.ordenId,repetido:true};
        fallo("already-exists", "Esta orden ya existe. Actualiza el listado.");
      }
      if (accion === "editar" && (!ordenSnap.exists || datos.version !== orden.version)) fallo("failed-precondition", "La OS cambió. Recarga sus datos antes de editar.");
      if (accion === "editar" && orden.items.some(i=>i.recibido>0 || i.retirado>0)) fallo("failed-precondition", "La OS ya tiene movimientos. Sus datos se conservan para mantener la trazabilidad.");
      const items=nuevos.map(i=>({...i,recibido:0,retirado:0}));
      tx.set(ordenRef,{...identificacion,empresaId:usuario.empresaId,sucursalId:usuario.sucursalId,items,...resumenServicio(items),
        version:(orden?.version || 0)+1,creadoPor:orden?.creadoPor || usuario.uid,fechaIngreso:orden?.fechaIngreso ?? ahora,
        ...(referenciaExcel ? {referenciaExcel} : orden?.referenciaExcel ? {referenciaExcel:orden.referenciaExcel} : {}),
        actualizadoPor:usuario.uid,fechaActualizacion:ahora});
      return {ok:true,ordenId:datos.ordenId};
    }
    if (!ordenSnap.exists) fallo("not-found", "La OS no existe.");
    const movRef=db.collection("inventarioServicioMovimientos").doc(`${datos.ordenId}_${datos.movimientoId}`);
    const previo=await tx.get(movRef);
    if (previo.exists) {
      if (previo.data().huella !== huella || previo.data().registradoPor !== usuario.uid) fallo("already-exists", "El identificador corresponde a otro movimiento.");
      return {ok:true,ordenId:datos.ordenId,movimientoId:datos.movimientoId,repetido:true};
    }
    let retira=null;
    if (accion === "retirar") {
      if (!idValido(datos.retiraId)) fallo("invalid-argument", "Selecciona quién retira.");
      const snap=await tx.get(db.collection("usuarios").doc(datos.retiraId));retira=snap.data();
      if (!snap.exists || retira.activo !== true || retira.empresaId !== usuario.empresaId || retira.sucursalId !== usuario.sucursalId ||
        !["tecnico","supervisor","jefe_taller"].includes(retira.rol)) fallo("permission-denied", "El trabajador debe estar activo y pertenecer a esta sucursal.");
    }
    const items=orden.items.map(i=>({...i}));
    const lineas=datos.lineas.map(l=>{
      const i=items.find(i=>i.id===l.itemId);
      if (!i || l.cantidad > (accion === "recibir" ? i.cantidad-i.recibido : i.recibido-i.retirado)) fallo("failed-precondition", "La cantidad supera lo pendiente de recepción o lo disponible para retiro. Actualiza la OS.");
      i[accion === "recibir" ? "recibido" : "retirado"]+=l.cantidad;
      return {itemId:i.id,np:i.np,descripcion:i.descripcion,cantidad:l.cantidad};
    });
    tx.update(ordenRef,{items,...resumenServicio(items),version:orden.version+1,fechaActualizacion:ahora,actualizadoPor:usuario.uid,
      ...(accion === "recibir" ? {ultimaRecepcion:datos.fechaRecepcion} : {ultimoRetiro:ahora})});
    tx.set(movRef,{ordenId:datos.ordenId,movimientoId:datos.movimientoId,empresaId:usuario.empresaId,sucursalId:usuario.sucursalId,
      tipo:accion === "recibir" ? "recepcion" : "retiro",lineas,evidencias,fechaRegistro:ahora,
      ...(accion === "recibir" ? {fechaRecepcion:datos.fechaRecepcion,recibidoPor:usuario.uid,recibidoPorNombre:nombre(perfil)} :
        {fechaRetiro:ahora,retiraId:datos.retiraId,retiraNombre:nombre(retira)}),
      registradoPor:usuario.uid,registradoPorNombre:nombre(perfil),huella});
    return {ok:true,ordenId:datos.ordenId,movimientoId:datos.movimientoId};
  });
}
module.exports={gestionarServicio,resumenServicio};
