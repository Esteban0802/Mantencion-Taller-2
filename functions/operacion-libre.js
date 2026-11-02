const fallo=(code,message)=>{throw Object.assign(Error(message),{code});};
const texto=(v,n=180)=>typeof v==='string'?v.trim().slice(0,n):'';
const {planificar}=require('./planificacion-libre');
function etapaOperacion(ot) {
  const i=ot.etapasPersonalizadas.findIndex(e=>e.requiereAprobacion);
  return i>=0 && ot.etapasPersonalizadas[i].decision?.resultado==='aprobada' ? ot.etapasPersonalizadas[i+1] : null;
}
async function inventario(tx,db,ot,os) {
  const snap=await tx.get(db.collection('inventarioItems').where('empresaId','==',ot.empresaId).where('sucursalId','==',ot.sucursalId));
  return snap.docs.filter(d=>texto(d.data().datos?.OS).toLocaleLowerCase('es')===os.toLocaleLowerCase('es')).map(d=>{
    const r=d.data(),v=r.datos || {};
    return {inventarioItemId:d.id,codigo:texto(v.NP),descripcion:texto(v.DESCRIPCION,500),cantidad:texto(String(v.CANTIDAD ?? '')),recibidoInventario:r.recibido===true,usado:false,comentario:'',tecnico:'',fecha:''};
  });
}
async function aplicarOperacion({tx,db,ot,usuario,datos,ahora}) {
  const jefe=usuario.rol==='jefe_taller';
  if(datos.accion==='identificacion') {
    if(!jefe)fallo('permission-denied','Solo el Jefe de Taller puede modificar los datos.');
    const valores=Object.fromEntries(['equipo','serie','cliente','os'].map(k=>[k,texto(datos[k])]));
    if(Object.values(valores).some(v=>!v))fallo('invalid-argument','Completa equipo, serie, cliente y OS.');
    const cambioOS=valores.os!==ot.os;
    if(cambioOS && ot.repuestos?.items?.some(i=>i.usado))fallo('failed-precondition','La OS tiene repuestos utilizados. Revisa su registro antes de cambiarla.');
    if(cambioOS)ot.repuestos={items:await inventario(tx,db,ot,valores.os),origen:'inventario',inventarioOS:valores.os};
    ot.historialIdentificacion=[...(ot.historialIdentificacion || []),{anterior:Object.fromEntries(Object.keys(valores).map(k=>[k,ot[k]])),uid:usuario.uid,fecha:ahora}];
    Object.assign(ot,valores);return;
  }
  const etapa=etapaOperacion(ot);
  if(!etapa)fallo('failed-precondition','Primero se debe aprobar el servicio.');
  const empresa=(await tx.get(db.collection('empresas').doc(ot.empresaId))).data();
  const modulo=datos.accion==='guardarGantt'?'gantt':'repuestos';
  if(empresa.modulos?.[modulo]===false)fallo('permission-denied','El módulo no está habilitado.');
  const gestionaRepuestos=['sincronizarRepuestos','usarRepuesto','guardarRepuestos'].includes(datos.accion);
  if(!gestionaRepuestos && (etapa.completada || ot.etapasPersonalizadas.find(e=>!e.completada)?.id!==etapa.id))fallo('failed-precondition','Esta etapa ya está protegida.');
  if(datos.accion==='sincronizarRepuestos') {
    const nuevos=await inventario(tx,db,ot,ot.os);
    const anteriores=ot.repuestos?.items || [];
    ot.repuestos={items:nuevos.map(i=>{const a=anteriores.find(a=>a.inventarioItemId===i.inventarioItemId);return {...i,usado:i.recibidoInventario && a?.usado===true,comentario:a?.comentario || '',tecnico:a?.tecnico || '',fecha:a?.fecha || ''};}),origen:'inventario',inventarioOS:ot.os};return;
  }
  if(datos.accion==='usarRepuesto') {
    const item=ot.repuestos?.items?.find(i=>i.inventarioItemId===datos.itemId);
    if(!item || typeof datos.usado!=='boolean')fallo('invalid-argument','Repuesto no válido.');
    const actuales=await inventario(tx,db,ot,ot.os);
    if(datos.usado && !actuales.some(i=>i.inventarioItemId===item.inventarioItemId && i.recibidoInventario))fallo('failed-precondition','El repuesto todavía no está recibido en Inventario.');
    Object.assign(item,{usado:datos.usado,comentario:texto(datos.comentario,1000),tecnico:usuario.nombre || usuario.rol,fecha:ahora});return;
  }
  if(datos.accion==='guardarRepuestos') {
    if(!Array.isArray(datos.items) || datos.items.length>2000 || new Set(datos.items.map(i=>i?.itemId)).size!==datos.items.length)fallo('invalid-argument','Listado de repuestos no válido.');
    const actuales=await inventario(tx,db,ot,ot.os);
    for(const cambio of datos.items) {
      const item=ot.repuestos?.items?.find(i=>i.inventarioItemId===cambio?.itemId);
      if(!item || typeof cambio.usado!=='boolean')fallo('invalid-argument','Repuesto no válido.');
      if(cambio.usado && !actuales.some(i=>i.inventarioItemId===cambio.itemId && i.recibidoInventario))fallo('failed-precondition','Hay repuestos pendientes de recepción. Actualiza el listado.');
      Object.assign(item,{usado:cambio.usado,comentario:texto(cambio.comentario,1000),
        tecnico:cambio.usado ? (item.usado && item.tecnico || usuario.nombre || usuario.rol) : '',fecha:cambio.usado ? (item.usado && item.fecha || ahora) : ''});
    }
    return;
  }
  if(datos.accion==='guardarGantt') {
    if(!jefe)fallo('permission-denied','Solo el Jefe de Taller puede editar la carta Gantt.');
    ot.gantt=planificar(ot,datos,usuario,ahora);return;
  }
  fallo('invalid-argument','Acción no válida.');
}
module.exports={aplicarOperacion,etapaOperacion,inventario};
