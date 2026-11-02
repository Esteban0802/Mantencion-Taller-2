import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { actualizarFlujoLibre } from "./flujo-libre-api.js?v=20261031-1";
import { crearVistaFlujoLibre } from "./flujo-libre-html.js?v=20261101-4";
import { cargarEvidencias } from "./flujo-libre-cargas.js";
import { abrirVisorEvidencias } from './visor-evidencias.js?v=20261101-2';
import { etapaOperacion } from './flujo-libre-operacion.js';
import { vistaAccesos, instalarVentanas } from './flujo-libre-ventanas.js?v=20261101-3';

export async function montarFlujoLibre({ db, usuario, otInicial, alCambiar, subirArchivo, eliminarArchivo, generarPDF, modulos={} }) {
  document.querySelectorAll(".content,.tabs-timeline-pro,#headerOTPro").forEach(e=>e.style.setProperty("display","none","important"));
  const root=document.createElement("section"); root.className="flujo-libre";
  document.querySelector(".tabs-timeline-pro").before(root);
  const formulario=document.getElementById('crear');
  const ubicacionFormulario=document.createComment('Formulario original de identificación');
  formulario.before(ubicacionFormulario);
  let ot=otInicial, seleccionado=ot.etapasPersonalizadas.find(e=>!e.completada)?.id || ot.etapasPersonalizadas.at(-1).id, ocupado=false;
  const borradores=new Map();
  const aviso=mensaje=>window.OverTrackUI?.mostrarMensaje ? window.OverTrackUI.mostrarMensaje({titulo:"Orden de trabajo",mensaje,tipo:"info"}) : window.alert(mensaje);
  async function ejecutar(accion) {
    if(ocupado)return; ocupado=true; render();
    try {await accion();} catch(error) {await aviso(error.message || "No fue posible guardar el cambio.");}
    finally{ocupado=false;render();}
  }
  const enviar=(accion,etapaId,extra={})=>actualizarFlujoLibre({otId:ot.id,accion,etapaId,...extra});
  async function confirmar(mensaje) {
    return window.OverTrackUI?.confirmarAccion ? window.OverTrackUI.confirmarAccion({titulo:"Confirmar",mensaje,textoConfirmar:"Confirmar",textoCancelar:"Cancelar",peligrosa:true}) : window.confirm(mensaje);
  }
  function render() {
    const editor=document.activeElement;
    const foco=root.contains(editor) ? editor?.dataset.texto : undefined;
    const posicion=foco !== undefined ? [editor.selectionStart,editor.selectionEnd] : null;
    const {html,etapa:e}=crearVistaFlujoLibre({ot,usuario,seleccionado,ocupado,borradores,generarPDF});
    const creando=seleccionado==='crear' && usuario.rol==='jefe_taller';
    ubicacionFormulario.after(formulario);
    formulario.style.setProperty('display','none','important');
    root.innerHTML=html;
    root.querySelectorAll('[data-ver-imagen]').forEach(a=>a.onclick=event=>{
      event.preventDefault();
      const [i,j]=a.dataset.verImagen.split(':').map(Number);
      abrirVisorEvidencias(e.items[i].fotos,e.items[i].fotos[j].url);
    });
    if(creando) {
      const contenido=root.querySelector('.libre-contenido');
      contenido.replaceChildren(formulario);
      formulario.style.removeProperty('display');
      formulario.classList.add('active');
    }
    if(!creando) {
      const contenido=root.querySelector('.checklist-pro-grid');
      contenido?.insertAdjacentHTML('beforebegin',vistaAccesos(ot,e,usuario,ocupado,modulos));
    }
    instalarVentanas({root,getOT:()=>ot,usuario,modulos,aviso,enviar:async(accion,etapaId,datos)=>{
      await enviar(accion,etapaId,datos);
      const actualizado=await getDoc(doc(db,'ots',ot.id));
      if(actualizado.exists()){ot={...actualizado.data(),id:actualizado.id};alCambiar(ot);}
    }});
    root.querySelector('[data-guardar-identificacion]')?.addEventListener('click',()=>{
      const valores=Object.fromEntries([...root.querySelectorAll('[data-identificacion]')].map(c=>[c.dataset.identificacion,c.value.trim()]));
      ejecutar(async()=>{await enviar('identificacion',undefined,valores);await aviso('Los datos de la OT se actualizaron correctamente.');});
    });
    root.querySelector('[data-sincronizar-repuestos]')?.addEventListener('click',()=>ejecutar(()=>enviar('sincronizarRepuestos',e.id)));
    root.querySelectorAll('[data-usar-repuesto]').forEach(c=>c.onchange=()=>{const usado=c.checked;ejecutar(()=>enviar('usarRepuesto',e.id,{itemId:c.dataset.usarRepuesto,usado}));});
    root.querySelector('[data-guardar-gantt]')?.addEventListener('click',()=>{
      const etapas=ot.etapasPersonalizadas.map(et=>({id:et.id,inicio:root.querySelector(`[data-gantt-inicio="${et.id}"]`).value,fin:root.querySelector(`[data-gantt-fin="${et.id}"]`).value}));
      ejecutar(()=>enviar('guardarGantt',e.id,{etapas}));
    });
    root.querySelector('[data-decision-texto]')?.addEventListener('input',event=>borradores.set(`${e.id}:decision`,event.target.value));
    root.querySelectorAll('[data-decidir]').forEach(b=>b.onclick=()=>{
      const comentario=String(borradores.get(`${e.id}:decision`) || '').trim();
      const archivos=Array.from(root.querySelector('[data-decision-archivos]')?.files || []);
      const pasarUltima=b.dataset.decidir==='rechazar';
      if(!comentario || !archivos.length)return aviso('Ingresa un comentario y selecciona al menos un documento de respaldo.');
      ejecutar(async()=>{
        if(!await confirmar(b.dataset.decidir==='rechazar' ? `¿Rechazar el servicio? ${pasarUltima ? 'Se omitirá el trabajo intermedio y pasará a la última etapa.' : 'Permanecerá en esta etapa para revisión.'}` : '¿Aprobar el servicio y continuar?'))return;
        const evidencias=[];
        const resultado=await cargarEvidencias({archivos,
          subir:archivo=>subirArchivo(archivo,`personalizada_${e.id}`,0),
          adjuntar:async(archivo,url)=>{await enviar('adjuntar',e.id,{itemIndex:0,url,nombre:archivo.name});evidencias.push(url);},eliminar:eliminarArchivo});
        if(resultado.fallidos.length)throw Error('No se registró la decisión porque algunos respaldos fallaron. Los archivos cargados se conservaron en la primera actividad. Vuelve a seleccionar los documentos e inténtalo nuevamente.');
        await enviar(b.dataset.decidir,e.id,{comentario,evidencias,pasarUltima});
        borradores.delete(`${e.id}:decision`);
      });
    });
    root.querySelectorAll("[data-etapa-libre]").forEach(b=>b.onclick=()=>{seleccionado=b.dataset.etapaLibre;render();});
    root.querySelector("[data-pdf]")?.addEventListener("click",()=>ejecutar(generarPDF));
    root.querySelectorAll("[data-texto]").forEach(t=>t.oninput=()=>borradores.set(`${e.id}:${t.dataset.texto}`,t.value));
    root.querySelectorAll("[data-marcar]").forEach(c=>c.onchange=()=>{const valor=c.checked; ejecutar(()=>enviar("marcar",e.id,{itemIndex:Number(c.dataset.marcar),ok:valor}));});
    root.querySelectorAll("[data-comentar]").forEach(b=>b.onclick=()=>ejecutar(async()=>{
      const i=Number(b.dataset.comentar), texto=borradores.get(`${e.id}:${i}`)||"";
      if(!texto.trim())return aviso("Escribe un comentario.");
      await enviar("comentar",e.id,{itemIndex:i,texto,comentarioId:crypto.randomUUID()});borradores.delete(`${e.id}:${i}`);
    }));
    root.querySelectorAll("[data-subir]").forEach(input=>input.onchange=()=>{
      const archivos=Array.from(input.files || []), i=Number(input.dataset.subir);if(!archivos.length)return;
      ejecutar(async()=>{
        const resultado=await cargarEvidencias({archivos,
          subir:archivo=>subirArchivo(archivo,`personalizada_${e.id}`,i),
          adjuntar:(archivo,url)=>enviar("adjuntar",e.id,{itemIndex:i,url,nombre:archivo.name}),
          eliminar:eliminarArchivo,
          progreso:(actual,total)=>{const estado=root.querySelector('[role="status"].libre-guardando');if(estado)estado.textContent=`Cargando evidencia ${actual} de ${total}…`;}
        });
        if(resultado.fallidos.length) await aviso(`${resultado.guardados} de ${archivos.length} evidencias guardadas. No se pudieron cargar:\n${resultado.fallidos.map(f=>`${f.nombre}: ${f.mensaje}`).join("\n")}`);
      });
    });
    root.querySelectorAll("[data-quitar-foto]").forEach(b=>b.onclick=()=>ejecutar(async()=>{
      if(!await confirmar("¿Eliminar tu evidencia de esta actividad?"))return;
      const [i,j]=b.dataset.quitarFoto.split(":").map(Number),url=e.items[i].fotos[j].url;
      await enviar("quitarEvidencia",e.id,{itemIndex:i,url});
    }));
    root.querySelectorAll("[data-quitar-comentario]").forEach(b=>b.onclick=()=>ejecutar(async()=>{
      if(!await confirmar("¿Eliminar tu comentario?"))return;
      const [i,id]=b.dataset.quitarComentario.split(":");await enviar("quitarComentario",e.id,{itemIndex:Number(i),comentarioId:id});
    }));
    root.querySelector("[data-completar]")?.addEventListener("click",()=>ejecutar(async()=>{
      if(!await confirmar(`${e.requiereAprobacion?"¿Aprobar":"¿Completar"} la etapa ${e.nombre}? Las actividades quedarán protegidas.`))return;
      await enviar("completar",e.id);
    }));
    root.querySelector("[data-cerrar]")?.addEventListener("click",()=>ejecutar(async()=>{
      await enviar('validarCierre');
      if(await confirmar("¿Cerrar esta OT? Quedará disponible solo para consulta."))await enviar("cerrar");
    }));
    if(foco !== undefined) {
      const nuevo=root.querySelector(`[data-texto="${foco}"]`);
      if(nuevo){nuevo.focus();nuevo.setSelectionRange(...posicion);}
    }
  }
  render();
  if(ot.resumenVersion!==3 && ['jefe_taller','tecnico','supervisor'].includes(usuario.rol)) {
    await ejecutar(()=>enviar('sincronizarResumen'));
  }
  const operacionInicial=etapaOperacion(ot);
  if(operacionInicial && !operacionInicial.completada && !ot.repuestos && !ot.cerrada && modulos.repuestos!==false && ['jefe_taller','tecnico','supervisor'].includes(usuario.rol)) {
    await ejecutar(()=>enviar('sincronizarRepuestos',operacionInicial.id));
  }
  const cancelar=onSnapshot(doc(db,"ots",ot.id),snapshot=>{
    if(!snapshot.exists()){aviso("La OT ya no está disponible.");return;}
    const anterior=ot.etapasPersonalizadas.find(e=>!e.completada)?.id;
    ot={...snapshot.data(),id:snapshot.id};alCambiar(ot);
    const siguiente=ot.etapasPersonalizadas.find(e=>!e.completada)?.id;
    if(seleccionado===anterior && siguiente)seleccionado=siguiente;
    render();
    document.querySelector('.libre-modal[data-gantt-visual]')?.dispatchEvent(new Event('actualizar-gantt'));
  },error=>aviso(error.message));
  window.addEventListener("pagehide",cancelar,{once:true});
}
