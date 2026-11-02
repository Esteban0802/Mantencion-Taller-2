const {isDeepStrictEqual}=require('node:util');
const {etapasOT}=require('./comentarios-ot');
const fallo=mensaje=>{throw Object.assign(Error(mensaje),{code:'permission-denied'});};
async function responderObservacion({db,usuario,datos,ahora=Date.now()}) {
  if(!['tecnico','supervisor'].includes(usuario.rol) || !usuario.empresaId || !usuario.sucursalId)fallo('Solo un técnico o supervisor puede responder observaciones.');
  if(typeof datos.respuesta!=='string' || !datos.respuesta.trim() || datos.respuesta.length>3000 || !Number.isInteger(datos.comentarioIndex) || datos.comentarioIndex<0)fallo('Respuesta no válida.');
  const campo=datos.etapa;
  if(!['ingreso','evaluacion','overhaul','pruebas','despacho'].includes(campo))fallo('Etapa no válida.');
  const ref=db.collection('ots').doc(datos.otId);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);if(!snap.exists)fallo('La OT no existe.');
    const ot=snap.data();
    const resumenRef=db.collection('otsResumen').doc(datos.otId),resumen=await tx.get(resumenRef);
    const sucursal=await tx.get(db.collection('sucursales').doc(usuario.sucursalId));
    if(!sucursal.exists || sucursal.data().activa!==true || sucursal.data().empresaId!==usuario.empresaId || ot.empresaId!==usuario.empresaId || ot.sucursalId!==usuario.sucursalId || ot.cerrada || ot.estado==='CERRADA' || ot.flujoVersion===2)fallo('No puedes responder en esta OT.');
    const etapa=structuredClone(ot[campo]);let lista;
    if(campo==='despacho') {
      if(!['preparacion','final'].includes(datos.tipo))fallo('Tipo de despacho no válido.');
      lista=etapa?.[datos.tipo==='preparacion'?'comentariosPreparacion':'comentariosFinal'];
    } else {
      if(!Number.isInteger(datos.itemIndex) || datos.itemIndex<0)fallo('Actividad no válida.');
      if(campo==='pruebas' && !['general','mecanico','electrico'].includes(datos.tipo))fallo('Tipo de prueba no válido.');
      lista=(campo==='pruebas'?etapa?.[datos.tipo]:etapa)?.[datos.itemIndex]?.comentarios;
    }
    const c=lista?.[datos.comentarioIndex];
    if(!c || !['jefe_taller','admin_sucursal'].includes(c.rol) || !datos.referencia || ['texto','fecha','creadoPorUid','rol'].some(k=>!isDeepStrictEqual(c[k],datos.referencia[k])))fallo('La observación cambió. Recarga la OT antes de responder.');
    if(c.atendido===true) {
      if(c.atendidoPorUid===usuario.uid && c.respuestaUsuario===datos.respuesta.trim())return {respuesta:c,revision:ot.revision,alertaJefe:ot.alertaJefe};
      fallo('Esta observación ya fue respondida.');
    }
    Object.assign(c,{atendido:true,respuestaUsuario:datos.respuesta.trim(),atendidoPor:usuario.nombre || 'Técnico',atendidoPorUid:usuario.uid,fechaAtendido:new Date(ahora).toISOString()});
    const nuevo={...ot,[campo]:etapa};
    const pendientes=valor=>valor && typeof valor==='object' && (Array.isArray(valor)?valor.some(pendientes):['jefe_taller','admin_sucursal'].includes(valor.rol) && valor.atendido!==true || Object.values(valor).some(pendientes));
    const alertaJefe=Boolean(pendientes(etapasOT(nuevo))),revision=Math.max(0,Number(ot.revision || 0))+1;
    tx.update(ref,{[campo]:etapa,alertaJefe,revision,fechaActualizacion:new Date(ahora)});
    if(resumen.exists)tx.update(resumenRef,{alertaJefe,revision,fechaActualizacion:new Date(ahora)});
    return {respuesta:c,revision,alertaJefe};
  });
}
module.exports={responderObservacion};
