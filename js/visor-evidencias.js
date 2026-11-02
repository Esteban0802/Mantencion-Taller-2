import { urlSegura } from './html-seguro.js';
export function imagenesVisor(evidencias) {
  return (evidencias || []).filter(f=>f.tipo?.startsWith('image/') && urlSegura(f.url)).map(f=>({...f,url:urlSegura(f.url)}));
}
export function abrirVisorEvidencias(evidencias,urlInicial) {
  const imagenes=imagenesVisor(evidencias);
  if(!imagenes.length)return;
  document.querySelector('[data-visor-evidencias]')?.remove();
  const host=document.createElement('section');host.className='flujo-libre';host.dataset.visorEvidencias='';
  host.innerHTML='<dialog class="visor-imagen-simple" aria-label="Imagen de evidencia. Escape para cerrar; flechas para cambiar de imagen."><button type="button" class="visor-cerrar-accesible" aria-label="Cerrar imagen">Cerrar</button><img alt="" hidden><p role="status">Cargando imagen…</p></dialog>';
  document.body.append(host);
  const dialogo=host.querySelector('dialog'),img=host.querySelector('img'),estado=host.querySelector('[role="status"]');
  let indice=Math.max(0,imagenes.findIndex(f=>f.url===urlInicial));
  const cerrar=()=>{dialogo.close();host.remove();};
  function mostrar(){
    img.hidden=true;estado.hidden=false;estado.textContent='Cargando imagen…';
    img.alt=imagenes[indice].nombre || 'Imagen de evidencia';img.src=imagenes[indice].url;
  }
  img.onload=()=>{img.hidden=false;estado.hidden=true;};
  img.onerror=()=>{img.hidden=true;estado.hidden=false;estado.textContent='No se pudo mostrar la imagen. Pulsa fuera o presiona Escape para cerrar.';};
  host.querySelector('button').onclick=cerrar;
  dialogo.onclick=event=>{if(event.target!==img)cerrar();};
  dialogo.addEventListener('cancel',e=>{e.preventDefault();cerrar();});
  dialogo.addEventListener('keydown',e=>{
    const paso=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;
    if(paso){e.preventDefault();const siguiente=indice+paso;if(siguiente>=0 && siguiente<imagenes.length){indice=siguiente;mostrar();}}
  });
  dialogo.showModal();mostrar();
}