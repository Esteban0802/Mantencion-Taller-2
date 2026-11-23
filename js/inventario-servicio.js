import { app, db, storage } from "./firebase-config.js";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, startAfter, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { ref } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { uploadBytes, deleteObject } from "./storage-seguro.js";
import { escaparHtml as esc, urlSegura } from "./html-seguro.js";
import { optimizarFotoParaCarga } from "./modulos/core/imagenes.js";
import { validarFirmaArchivo } from "./file-validation.js";
import { abrirVisorEvidencias } from "./visor-evidencias.js";
import { cargarExcel } from "./cargar-excel.js";
import { CAMPOS_SERVICIO_EXCEL, detectarColumnasServicio, detectarFilaServicio, analizarFilasServicio, prepararImportacionServicio } from "./inventario-servicio-excel.js";

const guardar = httpsCallable(getFunctions(app,"us-central1"),"gestionarInventarioServicio",{timeout:120000});
const uuid = () => crypto.randomUUID();
const fecha = valor => valor ? new Date(typeof valor === "string" && valor.length === 10 ? valor + "T12:00:00" : valor).toLocaleString("es-CL",typeof valor === "string" && valor.length === 10 ? {dateStyle:"medium"} : {dateStyle:"medium",timeStyle:"short"}) : "—";
const hoy = () => new Intl.DateTimeFormat("en-CA",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const claseEstado = estado => estado === "Retirado" ? "retirado" : estado.includes("parcial") ? "parcial" : "";
const boton = (texto, atributo, secundario = false) => `<button type="button" class="btn-${secundario ? "secondary" : "primary"}-inventario" ${atributo}>${texto}</button>`;

export function iniciarInventarioServicio({ root, obtenerContexto }) {
  root.classList.add("servicio-inventario");
  let ordenes=[],cursor=null,hayMas=false,ambito="",busqueda="",solicitud=0,ocupado=false;
  const contexto=()=>obtenerContexto();
  const puedeCrear=()=>["jefe_taller","planificador","bodeguero"].includes(contexto().usuario.rol);
  const puedeMover=()=>contexto().usuario.rol === "bodeguero";
  const clavePendiente=id=>`vectaria_servicio_${contexto().usuario.uid}_${contexto().empresaId}_${contexto().sucursalId}_${id}`;
  const filtros=()=>[where("empresaId","==",contexto().empresaId),where("sucursalId","==",contexto().sucursalId)];
  function pendiente(id) { try { return JSON.parse(sessionStorage.getItem(clavePendiente(id)) || "null"); } catch { return null; } }
  function mostrarError(nodo,error){nodo.textContent=error.message || "No se pudo completar la operación. Intenta nuevamente.";}

  function render() {
    const lista=ordenes.filter(o=>[o.cliente,o.os,o.equipo,o.serie].join(" ").toLocaleLowerCase("es").includes(busqueda.toLocaleLowerCase("es")));
    root.innerHTML=`<div class="servicio-cabecera"><div><h3>Repuestos para servicio en terreno</h3><p>Recepción y entrega de repuestos, con respaldo de cada movimiento.</p></div><div class="servicio-acciones">${puedeMover()?boton("Cargar Excel","data-excel-servicio",true):""}${puedeCrear()?boton(puedeMover()?"+ Registrar llegada":"+ Preparar OS","data-crear-servicio"):""}</div></div>
      <div class="servicio-toolbar"><input type="search" data-buscar-servicio aria-label="Buscar entre las OS cargadas de Servicio" placeholder="Buscar en las OS cargadas…" value="${esc(busqueda)}">${boton("Actualizar","data-actualizar-servicio",true)}</div>
      <p class="servicio-ayuda">${ordenes.length} OS cargadas · ${puedeMover()?"Registra los repuestos que llegan o abre una OS para recibir y entregar cantidades parciales.":puedeCrear()?"Prepara la OS y sus cantidades esperadas. Bodega registrará las recepciones y entregas.":"Consulta de repuestos de la sucursal seleccionada."}</p>
      <div class="servicio-lista">${lista.map(o=>`<article class="servicio-os"><div class="servicio-os-header"><div><h4>${esc(o.os)}</h4><p>${esc(o.cliente)} · ${esc(o.equipo)} · Serie ${esc(o.serie)}</p></div><span class="servicio-badge ${claseEstado(o.estado || "")}">${esc(o.estado)}</span></div>
      <div class="servicio-os-footer"><div class="servicio-cantidades"><strong>${o.disponible || 0}</strong> disponibles · ${o.recibido || 0}/${o.esperado || 0} recibidos · ${o.retirado || 0} retirados<br><small>Ingreso al inventario: ${esc(fecha(o.fechaIngreso))}</small></div>${boton("Ver repuestos y movimientos",`data-detalle-servicio="${esc(o.id)}"`,true)}</div></article>`).join("") || '<div class="servicio-vacio">No hay OS de Servicio para mostrar. Los registros de Taller se mantienen en su propia pestaña.</div>'}</div>
      ${hayMas?`<div class="servicio-acciones">${boton("Cargar 20 OS más","data-mas-servicio",true)}</div>`:""}<p class="servicio-error" role="alert" data-error-lista></p>`;
    root.querySelector("[data-buscar-servicio]").oninput=e=>{const inicio=e.target.selectionStart;busqueda=e.target.value;render();const campo=root.querySelector("[data-buscar-servicio]");campo.focus();if(campo.type!=="search")campo.setSelectionRange(inicio,inicio);};
    root.querySelector("[data-crear-servicio]")?.addEventListener("click",()=>abrirOrden());
    root.querySelector("[data-excel-servicio]")?.addEventListener("click",abrirExcel);
    root.querySelector("[data-actualizar-servicio]").onclick=()=>cargar({forzar:true});
    root.querySelector("[data-mas-servicio]")?.addEventListener("click",()=>cargar({mas:true}));
    root.querySelectorAll("[data-detalle-servicio]").forEach(b=>b.onclick=()=>detalle(b.dataset.detalleServicio));
  }

  async function cargar({mas=false,forzar=false}={}) {
    const {empresaId,sucursalId}=contexto();
    if(!empresaId || !sucursalId){root.innerHTML='<div class="servicio-vacio">Selecciona una sucursal para consultar Servicio.</div>';ambito="";return;}
    const clave=`${empresaId}/${sucursalId}`;
    if(ambito===clave && !mas && !forzar){render();return;}
    if(ocupado && ambito===clave)return;
    const turno=++solicitud;ocupado=true;
    if(!mas || ambito!==clave){ordenes=[];cursor=null;hayMas=false;busqueda="";}
    ambito=clave;
    root.innerHTML='<div class="servicio-vacio" role="status">Cargando OS de Servicio…</div>';
    try {
      const base=[...filtros(),orderBy("fechaActualizacion","desc"),...(mas&&cursor?[startAfter(cursor)]:[]),limit(20)];
      const snap=await getDocs(query(collection(db,"inventarioServicio"),...base));
      if(turno!==solicitud)return;
      const mapa=new Map(ordenes.map(o=>[o.id,o]));snap.docs.forEach(d=>mapa.set(d.id,{id:d.id,...d.data()}));ordenes=[...mapa.values()];
      cursor=snap.docs.at(-1) || cursor;hayMas=snap.size===20;render();
    } catch(error){if(turno===solicitud){ambito="";root.innerHTML='<div class="servicio-vacio"><p role="alert" data-error-lista></p><button type="button" class="btn-secondary-inventario" data-reintentar>Reintentar</button></div>';mostrarError(root.querySelector("[data-error-lista]"),error);root.querySelector("[data-reintentar]").onclick=()=>cargar({forzar:true});}}
    finally{if(turno===solicitud)ocupado=false;}
  }

  function dialogo(titulo,os,contenido) {
    const dialog=document.createElement("dialog");dialog.className="servicio-dialog servicio-inventario";
    const tituloId="servicio-dialog-"+uuid();dialog.setAttribute("aria-labelledby",tituloId);
    dialog.innerHTML=`<div class="servicio-dialog-header"><div><small>${esc(os || "INVENTARIO · SERVICIO")}</small><h3 id="${tituloId}">${esc(titulo)}</h3></div><button type="button" class="servicio-cerrar" aria-label="Cerrar">×</button></div><div class="servicio-dialog-body">${contenido}<p class="servicio-error" role="alert" data-error></p></div>`;
    document.body.append(dialog);dialog.addEventListener("close",()=>dialog.remove());
    dialog.querySelector(".servicio-cerrar").onclick=()=>dialog.close();
    dialog.showModal();return dialog;
  }
  async function ejecutarDialogo(dialog,operacion) {
    if(dialog.dataset.ocupado)return;
    dialog.dataset.ocupado="si";dialog.querySelector("[data-error]").textContent="";
    const controles=[...dialog.querySelectorAll("button,input,select")].map(n=>[n,n.disabled]);controles.forEach(([n])=>n.disabled=true);
    const cancelar=e=>e.preventDefault();dialog.addEventListener("cancel",cancelar);
    try{await operacion();}catch(error){mostrarError(dialog.querySelector("[data-error]"),error);}
    finally{controles.forEach(([n,previo])=>n.disabled=dialog.dataset.pendiente && n.matches("input,select") ? true : previo);delete dialog.dataset.ocupado;dialog.removeEventListener("cancel",cancelar);}
  }
  const filaRepuesto = i=>`<tr data-item="${esc(i.id || uuid())}"><td><input data-np aria-label="Número de parte" maxlength="100" required value="${esc(i.np || "")}"></td><td class="descripcion"><input data-descripcion aria-label="Descripción" maxlength="300" required value="${esc(i.descripcion || "")}"></td><td><input data-cantidad aria-label="Cantidad esperada" type="number" min="1" max="1000000" step="1" required value="${esc(i.cantidad || "")}"></td><td>${boton("Quitar","data-quitar",true)}</td></tr>`;

  async function prepararRespaldos(archivos) {
    if(!archivos.length || archivos.length>10)throw Error("Selecciona entre 1 y 10 evidencias.");
    const preparados=[];
    for(const a of archivos){
      const tipo=a.type || (a.name.toLowerCase().endsWith(".pdf")?"application/pdf":"");
      if(!["image/jpeg","image/png","image/webp","image/heic","image/heif","image/avif","application/pdf"].includes(tipo) || a.size>=20*1024*1024)throw Error(`Revisa el formato y tamaño de “${a.name}”.`);
      await validarFirmaArchivo(a,tipo);preparados.push((await optimizarFotoParaCarga(a)).archivo);
    }
    return preparados;
  }
  async function cargarRespaldos(archivos,ordenId,movimientoId,{preparados=false}={}) {
    const cargas=preparados?archivos:await prepararRespaldos(archivos),rutas=[];
    try{
      for(const a of cargas){
        const ruta=`empresas/${contexto().empresaId}/inventarioServicio/${contexto().sucursalId}/${ordenId}/${movimientoId}/${uuid()}_${a.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120)}`;
        await uploadBytes(ref(storage,ruta),a,{contentType:a.type || "application/pdf"});rutas.push(ruta);
      }
    }catch(error){await Promise.allSettled(rutas.map(r=>deleteObject(ref(storage,r))));throw error;}
    return rutas;
  }

  function abrirOrden(orden=null) {
    if(!puedeCrear() || !contexto().sucursalId)return;
    const ordenId=orden?.id || uuid(),llegada=puedeMover()&&!orden,movimientoId=uuid();
    let ordenPreparada=null,payloadLlegada=null,archivosLlegada=[],archivosPreparados=false;
    const d=dialogo(orden?"Editar OS de Servicio":llegada?"Registrar llegada de repuestos":"Preparar OS de Servicio",orden?.os,`<p class="servicio-ayuda">${llegada?"Ingresa los repuestos que llegaron y adjunta el respaldo. Quién recibe y la fecha de ingreso al sistema se guardan automáticamente.":"Define los repuestos esperados. Las cantidades recibidas se registran después desde Bodega."}</p><form data-form-orden><div class="servicio-grid">${[["cliente","Cliente"],["os","OS"],["equipo","Equipo"],["serie","Serie"]].map(([k,label])=>`<label>${label}<input name="${k}" value="${esc(orden?.[k] || "")}" maxlength="180" required></label>`).join("")}${llegada?`<label>Fecha real de recepción<input name="fechaRecepcion" type="date" value="${hoy()}" max="${hoy()}" required></label><label>Quién recibe<input readonly value="${esc(contexto().usuario.nombreCompleto || contexto().usuario.nombre || "Usuario")}"></label>`:""}</div><div class="servicio-scroll"><table class="servicio-tabla"><thead><tr><th>NP</th><th>Descripción</th><th>${llegada?"Cantidad recibida":"Cantidad esperada"}</th><th></th></tr></thead><tbody data-repuestos>${(orden?.items || [{}]).map(filaRepuesto).join("")}</tbody></table></div>${llegada?`<label class="servicio-campo-archivo">Evidencias de recepción<input name="evidenciasLlegada" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,application/pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif,.pdf" required><small>De 1 a 10 fotografías o PDF, de hasta 20 MB por archivo.</small></label><p class="servicio-ayuda">La fecha y el responsable del retiro se registrarán al entregar los repuestos.</p>`:""}<div class="servicio-acciones">${boton("+ Agregar repuesto","data-agregar",true)}<button type="submit" class="btn-primary-inventario">${llegada?"Guardar recepción":"Guardar OS"}</button></div></form>`);
    const tabla=d.querySelector("[data-repuestos]");
    if(llegada)d.querySelector("[name=evidenciasLlegada]").onchange=()=>{if(!ordenPreparada)archivosPreparados=false;};
    tabla.onclick=e=>{if(e.target.closest("[data-quitar]") && tabla.rows.length>1)e.target.closest("tr").remove();};
    d.querySelector("[data-agregar]").onclick=()=>{if(tabla.rows.length<100)tabla.insertAdjacentHTML("beforeend",filaRepuesto({}));};
    d.querySelector("form").onsubmit=e=>{
      e.preventDefault();const form=e.target;
      const datos={accion:orden?"editar":"crear",ordenId,version:orden?.version,
        ...Object.fromEntries(["cliente","os","equipo","serie"].map(k=>[k,form.elements.namedItem(k).value.trim()])),
        items:[...tabla.rows].map(r=>({id:r.dataset.item,np:r.querySelector("[data-np]").value.trim(),descripcion:r.querySelector("[data-descripcion]").value.trim(),cantidad:Number(r.querySelector("[data-cantidad]").value)}))};
      const fechaRecepcion=llegada?form.elements.fechaRecepcion.value:null;
      if(llegada && !ordenPreparada && !archivosPreparados)archivosLlegada=[...form.elements.evidenciasLlegada.files];
      ejecutarDialogo(d,async()=>{
        if(llegada && !archivosPreparados){archivosLlegada=await prepararRespaldos(archivosLlegada);archivosPreparados=true;}
        if(!ordenPreparada){await guardar(datos);ordenPreparada=datos;}
        if(llegada){
          d.dataset.pendiente="si";
          if(!payloadLlegada){
            const rutas=await cargarRespaldos(archivosLlegada,ordenId,movimientoId,{preparados:true});
            payloadLlegada={accion:"recibir",ordenId,movimientoId,fechaRecepcion,lineas:ordenPreparada.items.map(i=>({itemId:i.id,cantidad:i.cantidad})),rutas};
            try{sessionStorage.setItem(clavePendiente(ordenId),JSON.stringify(payloadLlegada));}catch{}
          }
          try{await guardar(payloadLlegada);sessionStorage.removeItem(clavePendiente(ordenId));}
          catch(error){throw Error((error.message || "No se pudo confirmar la recepción")+". La OS está guardada; reintenta con este botón para no duplicar el movimiento.");}
        }
        d.close();await cargar({forzar:true});if(llegada)await detalle(ordenId);
      });
    };
  }

  function abrirExcel() {
    if(!puedeMover() || !contexto().sucursalId)return;
    const d=dialogo("Cargar inventario de Servicio desde Excel",null,`<p class="servicio-ayuda">Importa las OS y sus repuestos desde un inventario existente. Primero podrás elegir la hoja, asociar sus columnas y revisar los datos.</p><label class="servicio-campo-archivo">Archivo Excel<input type="file" data-archivo-excel accept=".xlsx,.xls"><small>Máximo 5 MB, 500 filas y 100 OS por carga. Las columnas obligatorias son cliente, OS, equipo, serie, NP, descripción y cantidad.</small></label><div data-config-excel></div><div data-preview-excel></div><p class="servicio-ayuda">Las fechas y responsables que ya figuren en el archivo se conservarán como referencia de origen. Para dejar repuestos disponibles, confirma luego su recepción con evidencia; no se crearán retiros ni responsables ficticios.</p>`);
    let XLSX,libro,archivoNombre,filas=[],inicio=0,planes=null,seleccion="";
    const config=d.querySelector("[data-config-excel]"),preview=d.querySelector("[data-preview-excel]");
    d.querySelector("[data-archivo-excel]").onchange=e=>{
      const archivo=e.target.files[0];if(!archivo)return;
      ejecutarDialogo(d,async()=>{
        planes=null;preview.innerHTML="";config.innerHTML="";
        if(!/\.xlsx?$/i.test(archivo.name) || archivo.size>5*1024*1024)throw Error("Selecciona un Excel .xlsx o .xls de hasta 5 MB.");
        XLSX=await cargarExcel();libro=XLSX.read(await archivo.arrayBuffer(),{type:"array",sheetRows:1500});archivoNombre=archivo.name;
        if(!libro.SheetNames.length)throw Error("El archivo no contiene hojas.");
        config.innerHTML=`<div class="servicio-grid"><label>Hoja del inventario<select data-hoja-excel>${libro.SheetNames.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select></label><label>Fila de encabezados<input type="number" min="1" max="30" step="1" data-fila-excel value="1"></label></div>${boton("Leer hoja y columnas","data-leer-excel",true)}<div data-mapeo-excel></div>`;
        const selector=config.querySelector("[data-hoja-excel]"),entrada=config.querySelector("[data-fila-excel]");
        function leerHoja(auto=false){
          planes=null;preview.innerHTML="";seleccion=selector.value;
          const hoja=libro.Sheets[seleccion];
          if(hoja["!fullref"] && XLSX.utils.decode_range(hoja["!fullref"]).e.r>=1500)throw Error("La hoja es demasiado extensa. Copia las filas que deseas importar a un archivo de hasta 500 registros.");
          filas=XLSX.utils.sheet_to_json(hoja,{header:1,raw:false,defval:"",blankrows:true});
          if(auto)entrada.value=String(detectarFilaServicio(filas)+1);
          inicio=Number(entrada.value)-1;
          if(!Number.isInteger(inicio)||inicio<0||inicio>=30||!filas[inicio])throw Error("Selecciona una fila de encabezados válida entre 1 y 30.");
          const encabezados=filas[inicio],mapeo=detectarColumnasServicio(encabezados);
          config.querySelector("[data-mapeo-excel]").innerHTML=`<h4 class="servicio-subtitulo">Asocia las columnas</h4><p class="servicio-ayuda">Los siete primeros campos son obligatorios. Las columnas opcionales se conservan como referencia del archivo.</p><div class="servicio-grid">${CAMPOS_SERVICIO_EXCEL.map(([campo,label])=>`<label>${esc(label)}<select data-columna-excel="${campo}"><option value="-1">${CAMPOS_SERVICIO_EXCEL.slice(0,7).some(([c])=>c===campo)?"Seleccionar columna":"No incluida"}</option>${encabezados.map((n,i)=>`<option value="${i}"${mapeo[campo]===i?" selected":""}>${i+1}. ${esc(n || "Sin título")}</option>`).join("")}</select></label>`).join("")}</div><div class="servicio-acciones">${boton("Revisar datos","data-revisar-excel")}</div>`;
          config.querySelectorAll("[data-columna-excel]").forEach(n=>n.onchange=()=>{planes=null;preview.innerHTML="";});
          config.querySelector("[data-revisar-excel]").onclick=()=>ejecutarDialogo(d,async()=>{
            planes=null;preview.innerHTML="";
            const mapa=Object.fromEntries([...config.querySelectorAll("[data-columna-excel]")].map(n=>[n.dataset.columnaExcel,Number(n.value)]));
            const datosFilas=filas.slice(inicio+1).map((fila,i)=>{
              const copia=[...fila],celda=mapa.cantidad>=0?libro.Sheets[seleccion][XLSX.utils.encode_cell({r:inicio+1+i,c:mapa.cantidad})]:null;
              if(celda?.t==="n")copia[mapa.cantidad]=celda.v;
              return copia;
            });
            const analisis=analizarFilasServicio(datosFilas,mapa,{filaInicial:inicio+2});
            if(analisis.errores.length){
              preview.innerHTML=`<div class="servicio-error"><strong>${analisis.errores.length} filas requieren corrección. No se importó ningún registro.</strong><ul>${analisis.errores.slice(0,25).map(e=>`<li>Fila ${e.numero}: ${esc(e.mensaje)}</li>`).join("")}</ul><p>Corrige el Excel y vuelve a seleccionarlo.</p></div>`;return;
            }
            planes=await prepararImportacionServicio(analisis.validas,{empresaId:contexto().empresaId,sucursalId:contexto().sucursalId,archivo:archivoNombre,hoja:seleccion});
            preview.innerHTML=`<h4 class="servicio-subtitulo">Vista previa</h4><p class="servicio-ayuda">${planes.length} OS · ${analisis.validas.length} líneas de repuestos. Se muestra un máximo de 30 filas.</p><div class="servicio-scroll"><table class="servicio-tabla"><thead><tr><th>Fila</th><th>Cliente / OS</th><th>Equipo / serie</th><th>NP / descripción</th><th>Cantidad</th><th>Recepción en el archivo</th></tr></thead><tbody>${analisis.validas.slice(0,30).map(r=>`<tr><td>${r.numero}</td><td>${esc(r.cliente)}<br><strong>${esc(r.os)}</strong></td><td>${esc(r.equipo)}<br>${esc(r.serie)}</td><td>${esc(r.np)}<br>${esc(r.descripcion)}</td><td>${r.cantidad}</td><td>${esc(r.fechaRecepcion || "—")}<br>${esc(r.recibio || "")}</td></tr>`).join("")}</tbody></table></div><div class="servicio-acciones">${boton("Importar OS y repuestos","data-importar-excel")}</div><p data-resultado-excel role="status"></p>`;
            preview.querySelector("[data-importar-excel]").onclick=()=>ejecutarDialogo(d,async()=>{
              if(!planes)throw Error("Revisa los datos antes de importar.");
              const resultado=preview.querySelector("[data-resultado-excel]");let nuevas=0,existentes=0;const errores=[];
              for(const [i,plan] of planes.entries()){
                resultado.textContent=`Procesando OS ${i+1} de ${planes.length}…`;
                try{const r=await guardar(plan);if(r.data?.repetido)existentes++;else nuevas++;}
                catch(error){errores.push({os:plan.os,mensaje:error.message || "No se pudo importar"});}
              }
              resultado.textContent=`Finalizado: ${nuevas} OS creadas, ${existentes} ya importadas y ${errores.length} con errores. Las recepciones deben confirmarse con evidencia desde el detalle de cada OS.`;
              if(errores.length)resultado.insertAdjacentHTML("beforeend",`<ul>${errores.slice(0,20).map(e=>`<li>${esc(e.os)}: ${esc(e.mensaje)}</li>`).join("")}</ul>`);
              await cargar({forzar:true});
            });
          });
        }
        selector.onchange=()=>ejecutarDialogo(d,async()=>leerHoja(true));
        entrada.oninput=()=>{planes=null;preview.innerHTML="";config.querySelector("[data-mapeo-excel]").innerHTML="";};
        config.querySelector("[data-leer-excel]").onclick=()=>ejecutarDialogo(d,async()=>leerHoja());
        leerHoja(true);
      });
    };
  }

  async function detalle(id) {
    const d=dialogo("Repuestos y movimientos",ordenes.find(o=>o.id===id)?.os,'<p role="status">Cargando detalle…</p>');
    try {
      const snap=await getDoc(doc(db,"inventarioServicio",id));
      if(!d.open)return;
      if(!snap.exists())throw Error("La OS ya no está disponible.");
      const o={id:snap.id,...snap.data()};
      if(o.empresaId!==contexto().empresaId || o.sucursalId!==contexto().sucursalId)throw Error("La OS no pertenece a la sucursal seleccionada.");
      const body=d.querySelector(".servicio-dialog-body");
      body.innerHTML=`<p><strong>${esc(o.cliente)}</strong> · ${esc(o.equipo)} · Serie ${esc(o.serie)}</p><p class="servicio-ayuda">Ingreso al inventario: ${esc(fecha(o.fechaIngreso))}</p><span class="servicio-badge ${claseEstado(o.estado)}">${esc(o.estado)}</span>
        ${o.referenciaExcel?`<details class="servicio-movimiento"><summary>Origen Excel: ${esc(o.referenciaExcel.archivo)}</summary><p>Hoja ${esc(o.referenciaExcel.hoja)} · Importado por ${esc(o.referenciaExcel.importadoPorNombre)} el ${esc(fecha(o.referenciaExcel.fechaImportacion))}</p><p>Datos históricos de referencia; no sustituyen la confirmación de recepción o retiro con evidencia.</p><div class="servicio-scroll"><table class="servicio-tabla"><thead><tr><th>Fila</th><th>Recepción</th><th>Ingreso</th><th>Quién recibió</th><th>Retiro</th><th>Quién retiró</th></tr></thead><tbody>${o.referenciaExcel.filas.map(f=>`<tr><td>${f.numero}</td><td>${esc(f.fechaRecepcion || "—")}</td><td>${esc(f.fechaIngreso || "—")}</td><td>${esc(f.recibio || "—")}</td><td>${esc(f.fechaRetiro || "—")}</td><td>${esc(f.retira || "—")}</td></tr>`).join("")}</tbody></table></div></details>`:""}
        <div class="servicio-scroll"><table class="servicio-tabla"><thead><tr><th>NP</th><th>Descripción</th><th>Esperados</th><th>Recibidos</th><th>Retirados</th><th>Disponibles</th></tr></thead><tbody>${o.items.map(i=>`<tr><td>${esc(i.np)}</td><td>${esc(i.descripcion)}</td><td>${i.cantidad}</td><td>${i.recibido}</td><td>${i.retirado}</td><td><strong>${i.recibido-i.retirado}</strong></td></tr>`).join("")}</tbody></table></div>
        <div class="servicio-acciones">${puedeCrear()&&!o.recibido?boton("Editar datos y repuestos","data-editar",true):""}${puedeMover()?`${boton("Registrar recepción","data-recibir",true)}${boton("Registrar retiro","data-retirar")}`:""}</div>
        <h4 class="servicio-subtitulo">Historial de recepciones y retiros</h4><div data-historial></div><div class="servicio-acciones">${boton("Cargar movimientos anteriores","data-mas-historial",true)}</div><p class="servicio-error" role="alert" data-error></p>`;
      d.querySelector("[data-editar]")?.addEventListener("click",()=>{d.close();abrirOrden(o);});
      for(const accion of ["recibir","retirar"])d.querySelector(`[data-${accion}]`)?.addEventListener("click",()=>{d.close();abrirMovimiento(o,accion);});
      let cursorMov=null,cargando=false,evidencias=[];
      async function historia(){
        if(cargando || !d.open)return;cargando=true;
        const b=d.querySelector("[data-mas-historial]");b.disabled=true;
        try{
          const snap=await getDocs(query(collection(db,"inventarioServicioMovimientos"),...filtros(),where("ordenId","==",o.id),orderBy("fechaRegistro","desc"),...(cursorMov?[startAfter(cursorMov)]:[]),limit(20)));
          if(!d.open)return;
          if(!cursorMov&&!snap.size)d.querySelector("[data-historial]").textContent="Aún no se han registrado movimientos.";
          d.querySelector("[data-historial]").insertAdjacentHTML("beforeend",snap.docs.map(doc=>{
            const m=doc.data(),recepcion=m.tipo==="recepcion";evidencias.push(...m.evidencias);
            return `<article class="servicio-movimiento"><h4>${recepcion?"Recepción":"Retiro"} · ${esc(fecha(recepcion?m.fechaRecepcion:m.fechaRetiro))}</h4><p>${recepcion?"Recibió: "+esc(m.recibidoPorNombre):"Retiró: "+esc(m.retiraNombre)}</p><p>Registrado por ${esc(m.registradoPorNombre)} · ${esc(fecha(m.fechaRegistro))}</p><p>${m.lineas.map(i=>`${esc(i.np)} — ${esc(i.descripcion)}: <strong>${i.cantidad}</strong>`).join("<br>")}</p><div class="servicio-evidencias">${m.evidencias.map(e=>`<a href="${esc(urlSegura(e.url))}" ${e.tipo.startsWith("image/")?'data-imagen-servicio':'target="_blank" rel="noopener noreferrer"'}>${esc(e.nombre || "Ver evidencia")}</a>`).join("")}</div></article>`;
          }).join(""));
          cursorMov=snap.docs.at(-1) || cursorMov;b.hidden=snap.size<20;
          d.querySelectorAll("[data-imagen-servicio]").forEach(a=>a.onclick=e=>{e.preventDefault();abrirVisorEvidencias(evidencias,a.href);});
        }catch(e){mostrarError(d.querySelector("[data-error]"),e);}finally{b.disabled=false;cargando=false;}
      }
      d.querySelector("[data-mas-historial]").onclick=historia;await historia();
    }catch(error){mostrarError(d.querySelector("[data-error]"),error);}
  }

  function abrirMovimiento(o,accion) {
    if(!puedeMover())return;
    const previo=pendiente(o.id);
    if(previo)accion=previo.accion;
    const recepcion=accion==="recibir",movimientoId=previo?.movimientoId || uuid();
    const d=dialogo(recepcion?"Registrar recepción":"Registrar retiro",o.os,`<p class="servicio-ayuda">${recepcion?"Indica la fecha real de llegada y las cantidades recibidas.":"Selecciona el trabajador y las cantidades que se entregarán para terreno."} Las evidencias y el usuario que registra quedarán en el historial.</p>
      ${previo?'<p class="servicio-ayuda">Hay un movimiento pendiente de confirmación. Reintenta para comprobar su resultado sin duplicar cantidades.</p>':""}
      <form data-form-movimiento><div class="servicio-grid">${recepcion?`<label>Fecha real de recepción<input type="date" name="fechaRecepcion" max="${hoy()}" value="${esc(previo?.fechaRecepcion || hoy())}" required></label>`:`<label>Quién retira<select name="retiraId" required><option value="">Seleccionar trabajador</option>${contexto().usuariosRetiro.map(u=>`<option value="${esc(u.id)}"${previo?.retiraId===u.id?" selected":""}>${esc(u.nombreCompleto || u.nombre || "Usuario")}</option>`).join("")}</select></label>`}<p class="servicio-ayuda">${recepcion?"Quién recibe: ":"Quién registra la entrega: "}${esc(contexto().usuario.nombreCompleto || contexto().usuario.nombre || "Usuario")}<br>La fecha de registro se guarda automáticamente.</p></div>
      <div class="servicio-scroll"><table class="servicio-tabla"><thead><tr><th>NP</th><th>Descripción</th><th>${recepcion?"Por recibir":"Disponibles"}</th><th>Cantidad de este movimiento</th></tr></thead><tbody>${o.items.map(i=>{
        const max=recepcion?i.cantidad-i.recibido:i.recibido-i.retirado;
        return `<tr data-item="${esc(i.id)}"><td>${esc(i.np)}</td><td>${esc(i.descripcion)}</td><td>${max}</td><td><input data-cantidad-movimiento aria-label="Cantidad ${esc(i.np)}" type="number" min="0" max="${max}" step="1" value="${previo?.lineas.find(l=>l.itemId===i.id)?.cantidad || 0}"${!max?" disabled":""}></td></tr>`;
      }).join("")}</tbody></table></div><label class="servicio-campo-archivo">Evidencias de ${recepcion?"recepción":"retiro"}<input name="evidencias" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,application/pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif,.pdf" ${previo?"":"required"}><small>Entre 1 y 10 fotografías o PDF. Máximo 20 MB por archivo; las fotografías se optimizan antes de cargar.</small></label>
      <div class="servicio-acciones"><button type="submit" class="btn-primary-inventario">${previo?"Reintentar confirmación":"Guardar movimiento"}</button></div></form>`);
    if(previo)d.querySelectorAll("input,select").forEach(n=>n.disabled=true);
    let payload=previo;
    d.querySelector("form").onsubmit=e=>{
      e.preventDefault();const f=e.target;
      ejecutarDialogo(d,async()=>{
        if(!payload){
          const lineas=[...f.querySelectorAll("tr[data-item]")].map(r=>({itemId:r.dataset.item,cantidad:Number(r.querySelector("input").value)})).filter(l=>l.cantidad>0);
          if(!lineas.length)throw Error("Indica al menos una cantidad mayor que cero.");
          const archivos=[...f.elements.evidencias.files];if(!archivos.length || archivos.length>10)throw Error("Selecciona entre 1 y 10 evidencias.");
          const preparados=[];
          for(const a of archivos){
            const tipo=a.type || (a.name.toLowerCase().endsWith(".pdf")?"application/pdf":"");
            if(!["image/jpeg","image/png","image/webp","image/heic","image/heif","image/avif","application/pdf"].includes(tipo) || a.size>=20*1024*1024)throw Error(`Revisa el formato y tamaño de “${a.name}”.`);
            await validarFirmaArchivo(a,tipo);preparados.push((await optimizarFotoParaCarga(a)).archivo);
          }
          const rutas=[];
          try{
            for(const a of preparados){
              const ruta=`empresas/${contexto().empresaId}/inventarioServicio/${contexto().sucursalId}/${o.id}/${movimientoId}/${uuid()}_${a.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120)}`;
              await uploadBytes(ref(storage,ruta),a,{contentType:a.type || "application/pdf"});rutas.push(ruta);
            }
          }catch(error){
            await Promise.allSettled(rutas.map(r=>deleteObject(ref(storage,r))));throw error;
          }
          payload={accion,ordenId:o.id,movimientoId,lineas,rutas,...(recepcion?{fechaRecepcion:f.elements.fechaRecepcion.value}:{retiraId:f.elements.retiraId.value})};
          try{sessionStorage.setItem(clavePendiente(o.id),JSON.stringify(payload));}catch{/* La transacción también evita duplicados mientras el formulario permanece abierto. */}
        }
        try {
          await guardar(payload);sessionStorage.removeItem(clavePendiente(o.id));payload=null;d.close();await cargar({forzar:true});await detalle(o.id);
        } catch(error){
          // Conservar la misma solicitud ante respuestas perdidas; nunca borrar un respaldo ya confirmado.
          d.dataset.pendiente="si";
          if(error.code === "functions/failed-precondition" && /cantidad supera/i.test(error.message || "")) {
            const resultados=await Promise.allSettled(payload.rutas.map(r=>deleteObject(ref(storage,r))));
            sessionStorage.removeItem(clavePendiente(o.id));payload=null;delete d.dataset.pendiente;
            d.close();await cargar({forzar:true});await detalle(o.id);
            await window.OverTrackUI?.mostrarMensaje?.({titulo:"Cantidades actualizadas",mensaje:"Otro movimiento cambió las existencias. Abre nuevamente la recepción o el retiro y revisa las cantidades."+(resultados.some(r=>r.status==="rejected")?" No se pudieron retirar todos los archivos del intento; sus respaldos confirmados permanecen protegidos.":""),tipo:"advertencia"});return;
          }
          const aviso=new Error((error.message || "No se pudo confirmar")+". Pulsa Guardar movimiento para reintentar sin duplicarlo.");throw aviso;
        }
      });
    };
  }
  return {cargar};
}
