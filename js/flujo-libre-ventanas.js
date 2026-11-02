import { escaparHtml as esc } from './html-seguro.js';
import { etapaOperacion } from './flujo-libre-operacion.js';
import { crearPDFGantt } from './flujo-libre-gantt-pdf.js';

const operativo=u=>['jefe_taller','supervisor','tecnico'].includes(u.rol);
const editable=(ot,u)=>operativo(u) && !ot.cerrada && etapaOperacion(ot)?.id===ot.etapasPersonalizadas.find(e=>!e.completada)?.id;
export const puedeEditarRepuestos=(ot,u)=>operativo(u) && !ot.cerrada && Boolean(etapaOperacion(ot));
export function fechaRecepcion(solicitud,dias) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(solicitud || '') || !Number.isInteger(dias) || dias<0 || dias>3650)return '';
  let t=Date.parse(solicitud);
  if(!Number.isFinite(t) || new Date(t).toISOString().slice(0,10)!==solicitud)return '';
  for(let restantes=dias;restantes>0;) {t+=86400000;if(![0,6].includes(new Date(t).getUTCDay()))restantes--;}
  return new Date(t).toISOString().slice(0,10);
}
export function vistaAccesos(ot,e,usuario,ocupado,modulos={}) {
  if(etapaOperacion(ot)?.id!==e.id)return '';
  return `<div class="libre-accesos-operacion">${modulos.repuestos!==false?'<button type="button" class="btn-primary" data-abrir-repuestos>Repuestos</button>':''}${modulos.gantt!==false?'<button type="button" class="btn-primary" data-abrir-gantt>Ver carta Gantt</button>':''}</div>`;
}
export function filasGantt(ot) {
  const filas=[];
  const g=ot.gantt || {},destino=etapaOperacion(ot)?.id;
  const solicitud=g.fechaSolicitudRepuestos;
  let recepcion=g.fechaRecepcionEstimada;
  if(solicitud && !recepcion && Number.isInteger(g.diasRepuestos) && g.diasRepuestos>0 && g.diasRepuestos<=3650) {
    let t=Date.parse(solicitud),restantes=g.diasRepuestos;
    while(Number.isFinite(t) && restantes>0){t+=86400000;if(![0,6].includes(new Date(t).getUTCDay()))restantes--;}
    if(Number.isFinite(t))recepcion=new Date(t).toISOString().slice(0,10);
  }
  const espera=solicitud && recepcion && g.diasRepuestos>0 ? {tipo:'espera',id:'espera-repuestos',nombre:'Espera de repuestos',inicio:solicitud,fin:recepcion,duracion:g.diasRepuestos,avance:0,estado:ot.repuestos?.items?.length && ot.repuestos.items.every(i=>i.recibidoInventario)?'Repuestos recibidos':'Pendiente de recepción'} : null;
  for(const etapa of ot.etapasPersonalizadas) {
    if(espera && etapa.id===destino)filas.push(espera);
    const plan=ot.gantt?.etapas?.find(f=>f.id===etapa.id);
    const progreso=etapa.items.length?Math.round(etapa.items.filter(i=>i.ok).length/etapa.items.length*100):0;
    filas.push({tipo:'etapa',id:etapa.id,nombre:etapa.nombre,inicio:plan?.inicio || '',fin:plan?.fin || '',duracion:plan?.duracion || '',avance:progreso,estado:etapa.omitidaPorRechazo?'Omitida por rechazo':etapa.completada?'Completada':'En progreso'});
    (ot.gantt?.actividades || []).filter(a=>a.etapaId===etapa.id).forEach(a=>filas.push({...a,tipo:'actividad',id:etapa.id,avance:etapa.items[a.itemIndex]?.ok?100:0,estado:etapa.items[a.itemIndex]?.ok?'Completada':'Pendiente'}));
  }
  if(espera && !destino)filas.unshift(espera);
  return filas;
}
export function periodoGantt(ot) {
  const filas=filasGantt(ot);
  return {inicio:[ot.gantt.fechaInicio,...filas.map(f=>f.inicio)].filter(Boolean).sort()[0],fin:[ot.gantt.fechaTermino,...filas.map(f=>f.fin)].filter(Boolean).sort().at(-1)};
}
export function filasPrincipalesGantt(ot) {
  return filasGantt(ot).filter(f=>f.tipo!=='actividad');
}
export function posicionHoyGantt(periodo,fecha=new Date()) {
  const hoy=[fecha.getFullYear(),String(fecha.getMonth()+1).padStart(2,'0'),String(fecha.getDate()).padStart(2,'0')].join('-');
  const inicio=Date.parse(periodo.inicio),fin=Date.parse(periodo.fin),actual=Date.parse(hoy);
  if(!Number.isFinite(actual) || actual<inicio || actual>fin)return null;
  return {fecha:hoy,proporcion:(actual-inicio+43200000)/(fin-inicio+86400000)};
}
export function instalarVentanas({root,getOT,usuario,enviar,aviso,modulos={}}) {
  let dialogo=null,host=null,zoom=1,guardando=false,hoyVisible=false;
  function cerrar(){if(guardando)return;dialogo?.close();host?.remove();dialogo=null;host=null;}
  function abrir(titulo,contenido) {
    cerrar();host=document.createElement('section');host.className='flujo-libre';
    host.innerHTML=`<dialog class="libre-modal" aria-label="${esc(titulo)}"><header><div><small>ORDEN ${esc(getOT().os)}</small><h2>${esc(titulo)}</h2></div><button type="button" data-cerrar-modal aria-label="Cerrar ventana">×</button></header><div class="libre-modal-contenido">${contenido}</div></dialog>`;
    document.body.append(host);dialogo=host.querySelector('dialog');dialogo.querySelector('[data-cerrar-modal]').onclick=cerrar;
    dialogo.addEventListener('cancel',event=>{event.preventDefault();cerrar();});dialogo.showModal();
  }
  async function guardar(accion,datos) {
    if(guardando)return false;
    guardando=true;dialogo.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=true);
    try {await enviar(accion,etapaOperacion(getOT()).id,datos);guardando=false;cerrar();await aviso('Cambios guardados correctamente.');return true;}
    catch(error){guardando=false;dialogo?.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=n.dataset.bloqueado==='true');await aviso(error.message || 'No se pudieron guardar los cambios.');return false;}
  }
  root.querySelector('[data-abrir-repuestos]')?.addEventListener('click',async()=>{
    if(modulos.repuestos===false)return;
    if(puedeEditarRepuestos(getOT(),usuario)) {
      try {await enviar('sincronizarRepuestos',etapaOperacion(getOT()).id);}catch(error){await aviso(error.message);return;}
    }
    const ot=getOT(),puede=puedeEditarRepuestos(ot,usuario),items=ot.repuestos?.items || [];
    abrir('Control de repuestos',`<p>Revisa la recepción y registra los repuestos utilizados de esta OS.</p><div class="libre-tabla-scroll"><table><thead><tr><th>Usado</th><th>Código</th><th>Descripción</th><th>Cantidad</th><th>Disponibilidad</th><th>Comentario</th><th>Responsable / fecha</th></tr></thead><tbody>${items.map((i,n)=>`<tr><td><input type="checkbox" data-repuesto="${n}" ${i.usado?'checked':''} data-bloqueado="${!puede || !i.recibidoInventario}" ${!puede || !i.recibidoInventario?'disabled':''}></td><td>${esc(i.codigo)}</td><td>${esc(i.descripcion)}</td><td>${esc(i.cantidad)}</td><td><span class="libre-stock ${i.recibidoInventario?'disponible':'pendiente'}">${i.recibidoInventario?'Disponible':'Pendiente de recepción'}</span></td><td><input data-repuesto-comentario="${n}" maxlength="1000" value="${esc(i.comentario)}" data-bloqueado="${!puede || !i.recibidoInventario}" ${!puede || !i.recibidoInventario?'disabled':''}></td><td>${esc(i.tecnico)}<small>${i.fecha?esc(typeof i.fecha==='number'?new Date(i.fecha).toLocaleString('es-CL'):i.fecha):''}</small></td></tr>`).join('')}</tbody></table></div>${items.length?'':'<p>No hay repuestos vinculados a esta OS.</p>'}${puede && items.length?'<footer><button type="button" class="btn-success" data-guardar-repuestos>Guardar repuestos</button></footer>':''}`);
    dialogo.classList.add('libre-modal-repuestos');
    dialogo.querySelector('.libre-modal-contenido > p')?.insertAdjacentHTML('afterend',`<div class="libre-repuestos-resumen"><span><strong>${items.length}</strong> repuestos</span><span class="disponibles"><strong>${items.filter(i=>i.recibidoInventario).length}</strong> disponibles</span><span class="pendientes"><strong>${items.filter(i=>!i.recibidoInventario).length}</strong> pendientes de recepción</span></div>`);
    dialogo.querySelector('footer')?.insertAdjacentHTML('afterbegin','<small>Solo puedes registrar el uso de repuestos recibidos en Inventario.</small>');
    dialogo.querySelector('[data-guardar-repuestos]')?.addEventListener('click',()=>{
      const cambios=items.filter(i=>i.recibidoInventario).map(i=>{const n=items.indexOf(i);return {itemId:i.inventarioItemId,usado:dialogo.querySelector(`[data-repuesto="${n}"]`).checked,comentario:dialogo.querySelector(`[data-repuesto-comentario="${n}"]`).value};});
      guardar('guardarRepuestos',{items:cambios});
    });
  });
  function formularioGantt() {
    const ot=getOT(),g=ot.gantt || {};
    const campo=(id,titulo,tipo,valor)=>`<label>${titulo}<input data-plan="${id}" type="${tipo}" value="${esc(valor ?? '')}" ${tipo==='number'?'min="0" max="3650"':''}></label>`;
    abrir('Planificar carta Gantt',`<div class="libre-plan-intro"><span aria-hidden="true">▦</span><div><strong>Organiza el trabajo de esta OT</strong><p>Define las fechas y el tiempo de espera de repuestos. Las actividades se distribuirán de lunes a viernes.</p></div></div>
      <div class="libre-plan-superior"><section class="libre-plan-seccion"><h3><span>01</span> Período del servicio</h3><p>Establece el inicio y el término de la planificación.</p><div class="libre-plan-campos">${campo('fechaInicio','Inicio general','date',g.fechaInicio)}${campo('fechaTermino','Término general','date',g.fechaTermino)}</div></section>
      <section class="libre-plan-seccion"><h3><span>02</span> Disponibilidad de repuestos</h3><p>Incluye los plazos que puedan afectar al servicio.</p><div class="libre-plan-campos">${campo('fechaSolicitudRepuestos','Fecha de solicitud','date',g.fechaSolicitudRepuestos)}${campo('diasRepuestos','Espera en días hábiles','number',g.diasRepuestos || 0)}</div><label>Observaciones<textarea data-plan="comentarioRepuestos" maxlength="2000" placeholder="Ej.: entrega parcial o fecha confirmada por el proveedor">${esc(g.comentarioRepuestos || '')}</textarea></label></section></div>
      <section class="libre-plan-seccion libre-plan-etapas"><h3><span>03</span> Fechas por etapa <small>${ot.etapasPersonalizadas.length} etapas</small></h3><p>Programa cada etapa dentro del período general del servicio.</p><div class="libre-tabla-scroll"><table><thead><tr><th>Etapa del trabajo</th><th>Fecha de inicio</th><th>Fecha de término</th></tr></thead><tbody>${ot.etapasPersonalizadas.map((e,i)=>{const f=g.etapas?.find(f=>f.id===e.id);return `<tr><td><span class="libre-plan-numero">${String(i+1).padStart(2,'0')}</span><strong>${esc(e.nombre)}</strong></td><td><input type="date" aria-label="Inicio de ${esc(e.nombre)}" data-inicio="${e.id}" value="${esc(f?.inicio || '')}"></td><td><input type="date" aria-label="Término de ${esc(e.nombre)}" data-fin="${e.id}" value="${esc(f?.fin || '')}"></td></tr>`;}).join('')}</tbody></table></div></section>
      <footer class="libre-plan-pie"><small>La carta mostrará las etapas y actividades del checklist.</small><button type="button" class="btn-primary" data-generar-gantt>Generar carta Gantt →</button></footer>`);
    dialogo.classList.add('libre-modal-planificacion');
    const solicitud=dialogo.querySelector('[data-plan="fechaSolicitudRepuestos"]');
    const espera=dialogo.querySelector('[data-plan="diasRepuestos"]');
    const resultado=document.createElement('div');resultado.className='libre-recepcion-estimada';resultado.setAttribute('role','status');
    resultado.innerHTML='<span>Fecha estimada de recepción</span><strong></strong><small>Cálculo de lunes a viernes. No considera feriados.</small>';
    solicitud.closest('.libre-plan-campos').after(resultado);
    const actualizarRecepcion=()=>{
      const fecha=fechaRecepcion(solicitud.value,espera.value.trim()===''?NaN:Number(espera.value));
      resultado.querySelector('strong').textContent=fecha ? fecha.split('-').reverse().join('-') : 'Completa la solicitud y los días de espera';
    };
    solicitud.addEventListener('input',actualizarRecepcion);espera.addEventListener('input',actualizarRecepcion);actualizarRecepcion();
    dialogo.querySelector('[data-generar-gantt]').onclick=async()=>{
      const datos=Object.fromEntries([...dialogo.querySelectorAll('[data-plan]')].map(n=>[n.dataset.plan,n.value]));datos.diasRepuestos=Number(datos.diasRepuestos);
      datos.etapas=ot.etapasPersonalizadas.map(e=>({id:e.id,inicio:dialogo.querySelector(`[data-inicio="${e.id}"]`).value,fin:dialogo.querySelector(`[data-fin="${e.id}"]`).value}));
      if(await guardar('guardarGantt',datos))visualizar();
    };
  }
  function exportarPDF() {
    const ot=getOT(),filas=filasPrincipalesGantt(ot);
    crearPDFGantt({jsPDF:window.jspdf.jsPDF,ot,filas,periodo:periodoGantt(ot)}).save(`Gantt-${ot.os.replace(/[^a-zA-Z0-9_-]/g,'_')}.pdf`);
  }
  function visualizar() {
    const ot=getOT(),g=ot.gantt,filas=filasPrincipalesGantt(ot),periodo=periodoGantt(ot),inicio=Date.parse(periodo.inicio),dias=Math.max(1,(Date.parse(periodo.fin)-inicio)/86400000+1),ancho=Math.max(600,dias*24*zoom);
    const calendario=`<div class="libre-gantt-fila"><div class="libre-gantt-nombre"><strong>Etapa / actividad</strong></div><div class="libre-gantt-calendario" style="width:${ancho}px">${Array.from({length:Math.ceil(dias)},(_,i)=>i % Math.max(1,Math.ceil(60/(ancho/dias)))===0 ? `<small style="position:absolute;left:${i/dias*100}%;top:18px">${new Date(inicio+i*86400000).toISOString().slice(5,10)}</small>` : "").join("")}</div></div>`;
    const barra=(f,clase='')=>`<div class="libre-gantt-fila"><div class="libre-gantt-nombre"><strong>${esc(f.nombre)}</strong><small>${esc(f.inicio)} → ${esc(f.fin)} · ${f.tipo === "espera" ? `${f.duracion} días hábiles` : `${f.avance ?? 0}%`} · ${esc(f.estado || '')}</small></div><div class="libre-gantt-calendario" style="width:${ancho}px"><span class="libre-gantt-barra ${clase}" style="left:${Math.max(0,(Date.parse(f.inicio)-inicio)/86400000/dias*100)}%;width:${Math.max(.2,((Date.parse(f.fin)-Date.parse(f.inicio))/86400000+1)/dias*100)}%"><i style="width:${f.avance || 0}%"></i></span></div></div>`;
    abrir('Carta Gantt',`<div class="libre-gantt-herramientas">${usuario.rol==='jefe_taller' && editable(ot,usuario)?'<button type="button" data-editar-gantt>Editar planificación</button>':''}<button type="button" data-zoom="menos" aria-label="Alejar">−</button><span>${Math.round(zoom*100)}%</span><button type="button" data-zoom="mas" aria-label="Acercar">+</button><button type="button" data-hoy>Hoy</button><button type="button" data-exportar="pdf">Descargar PDF</button></div><p>${esc(g.fechaInicio)} → ${esc(g.fechaTermino)} · Etapas principales · Avance actualizado desde el checklist</p>${g.fechaSolicitudRepuestos?`<p>Solicitud de repuestos: ${esc(g.fechaSolicitudRepuestos)} · Espera: ${g.diasRepuestos} días hábiles · Recepción estimada: ${esc(g.fechaRecepcionEstimada || '')}</p>`:''}${g.comentarioRepuestos?`<p>${esc(g.comentarioRepuestos)}</p>`:''}<div class="libre-gantt-scroll"><div style="min-width:${ancho+280}px">${calendario}${filas.map(f=>barra(f,f.tipo)).join('')}</div></div>`);
    dialogo.querySelector('[data-editar-gantt]')?.addEventListener('click',formularioGantt);
    dialogo.classList.add('libre-modal-gantt-visual');
    dialogo.dataset.ganttVisual='true';
    dialogo.addEventListener('actualizar-gantt',visualizar,{once:true});
    dialogo.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>{zoom=Math.max(.25,Math.min(4,zoom+(b.dataset.zoom==='mas'?.25:-.25)));visualizar();});
    function marcarHoy(centrar=false) {
      const posicion=posicionHoyGantt(periodo);
      if(!posicion){if(centrar)aviso('La fecha de hoy está fuera del período mostrado en esta carta Gantt.');return;}
      hoyVisible=true;
      dialogo.querySelectorAll('.libre-gantt-hoy').forEach(n=>n.remove());
      dialogo.querySelectorAll('.libre-gantt-calendario').forEach((n,i)=>{
        const marca=document.createElement('span');marca.className='libre-gantt-hoy';marca.style.left=`${posicion.proporcion*100}%`;marca.setAttribute('aria-hidden','true');
        if(i===0){const etiqueta=document.createElement('strong');etiqueta.textContent=`Hoy ${posicion.fecha.split('-').reverse().join('-')}`;marca.append(etiqueta);}
        n.append(marca);
      });
      const boton=dialogo.querySelector('[data-hoy]');boton.classList.add('libre-hoy-activo');boton.setAttribute('aria-label',`Mostrar hoy, ${posicion.fecha}`);
      if(centrar){const scroll=dialogo.querySelector('.libre-gantt-scroll');scroll.scrollLeft=Math.max(0,posicion.proporcion*ancho-Math.max(0,scroll.clientWidth-280)/2);}
    }
    dialogo.querySelector('[data-hoy]').onclick=()=>marcarHoy(true);
    if(hoyVisible)marcarHoy();
    dialogo.querySelector('[data-exportar="pdf"]').onclick=()=>{try{exportarPDF();}catch(error){aviso('No se pudo exportar la planificación. '+error.message);}};
  }
  root.querySelector('[data-abrir-gantt]')?.addEventListener('click',()=>{
    if(modulos.gantt===false)return;
    if(getOT().gantt?.etapas?.length)visualizar();
    else if(usuario.rol==='jefe_taller' && editable(getOT(),usuario))formularioGantt();
    else aviso('La Carta Gantt todavía no ha sido creada por el Jefe de Taller.');
  });
}
