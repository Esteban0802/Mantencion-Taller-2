const dia=86400000;
const fallo=message=>{throw Object.assign(Error(message),{code:'invalid-argument'});};
const fecha=v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
function diasHabiles(inicio,fin) {
  const dias=[];
  for(let t=Date.parse(inicio);t<=Date.parse(fin);t+=dia)if(![0,6].includes(new Date(t).getUTCDay()))dias.push(new Date(t).toISOString().slice(0,10));
  return dias;
}
function planificar(ot,datos,usuario,ahora) {
  const filas=datos.etapas;
  if(!Array.isArray(filas) || filas.length!==ot.etapasPersonalizadas.length || filas.some((f,i)=>!f || f.id!==ot.etapasPersonalizadas[i].id || !fecha(f.inicio) || !fecha(f.fin) || f.inicio>f.fin || Date.parse(f.fin)-Date.parse(f.inicio)>3660*dia))fallo('Indica fechas válidas para todas las etapas (máximo diez años).');
  const inicio=datos.fechaInicio || filas.reduce((a,f)=>f.inicio<a?f.inicio:a,filas[0].inicio);
  const fin=datos.fechaTermino || filas.reduce((a,f)=>f.fin>a?f.fin:a,filas[0].fin);
  if(!fecha(inicio) || !fecha(fin) || inicio>fin || Date.parse(fin)-Date.parse(inicio)>3660*dia || filas.some(f=>f.inicio<inicio || f.fin>fin))fallo('Las fechas de las etapas deben estar dentro del período general.');
  const espera=datos.diasRepuestos ?? 0;
  if(!Number.isInteger(espera) || espera<0 || espera>3650 || datos.fechaSolicitudRepuestos && !fecha(datos.fechaSolicitudRepuestos))fallo('Revisa la fecha de solicitud y los días de espera de repuestos.');
  const actividades=[];
  const etapas=filas.map((f,i)=>{
    const etapa=ot.etapasPersonalizadas[i],dias=diasHabiles(f.inicio,f.fin);
    if(!dias.length)fallo(`La etapa ${etapa.nombre} debe incluir al menos un día hábil.`);
    etapa.items.forEach((item,j)=>{
      const desde=Math.min(dias.length-1,Math.floor(j*dias.length/etapa.items.length));
      const hasta=Math.max(desde,Math.min(dias.length-1,Math.ceil((j+1)*dias.length/etapa.items.length)-1));
      actividades.push({etapaId:etapa.id,itemIndex:j,etapa:etapa.nombre,nombre:item.item,inicio:dias[desde],fin:dias[hasta],duracion:hasta-desde+1});
    });
    return {id:f.id,nombre:etapa.nombre,inicio:f.inicio,fin:f.fin,duracion:dias.length};
  });
  let fechaRecepcionEstimada='';
  if(datos.fechaSolicitudRepuestos) {
    let t=Date.parse(datos.fechaSolicitudRepuestos),restantes=espera;
    while(restantes>0){t+=dia;if(![0,6].includes(new Date(t).getUTCDay()))restantes--;}
    fechaRecepcionEstimada=new Date(t).toISOString().slice(0,10);
  }
  return {fechaInicio:inicio,fechaTermino:fin,fechaSolicitudRepuestos:datos.fechaSolicitudRepuestos || '',diasRepuestos:espera,
    comentarioRepuestos:typeof datos.comentarioRepuestos==='string'?datos.comentarioRepuestos.trim().slice(0,2000):'',fechaRecepcionEstimada,
    etapas,actividades,actualizadoPor:usuario.uid,creadoPor:usuario.nombre || usuario.rol,fechaActualizacion:ahora};
}
module.exports={planificar,diasHabiles};
