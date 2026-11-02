import { doc, getDoc, updateDoc, deleteField, collection, getDocs, addDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { uploadBytes, deleteObject } from "../storage-seguro.js";
import { escaparHtml, urlSegura } from "../html-seguro.js";
import { validarFirmaArchivo } from "../file-validation.js";
import { identidadDeSucursal } from "../configuracion-alcance.js";

export async function renderConfiguracionSucursal({ db, usuario, empresa, procesarExcel }) {
  const cont = document.getElementById("vistaEmpresaContenido");
  if (usuario.rol !== "admin_sucursal" || !usuario.sucursalId || usuario.empresaId !== empresa.id) {
    cont.textContent = "No tienes una sucursal asignada para configurar."; return;
  }
  cont.textContent = "Cargando configuración de tu sucursal…";
  const sucursalRef = doc(db, "sucursales", usuario.sucursalId);
  const snapshot = await getDoc(sucursalRef);
  if (!snapshot.exists() || snapshot.data().empresaId !== empresa.id) throw Error("La sucursal no está disponible.");
  const sucursal = snapshot.data();
  const identidad = identidadDeSucursal(empresa, sucursal);
  const bloqueada = sucursal.activa !== true || empresa.activa === false ||
    ["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"].includes(empresa.suscripcion?.estado);
  const disabled = bloqueada ? "disabled" : "";
  const storage = getStorage();
  const $ = id => cont.querySelector(`#${id}`);
  const aviso = mensaje => window.OverTrackUI?.mostrarMensaje
    ? window.OverTrackUI.mostrarMensaje({ titulo: "Configuración de sucursal", mensaje, tipo: "info" }) : window.alert(mensaje);
  const confirmar = mensaje => window.OverTrackUI?.confirmarAccion
    ? window.OverTrackUI.confirmarAccion({ titulo: "Confirmar cambio", mensaje, textoConfirmar: "Confirmar", textoCancelar: "Cancelar", peligrosa: true }) : window.confirm(mensaje);
  const prefijo = `empresas/${empresa.id}/sucursales/${usuario.sucursalId}`;
  const plantillasRef = collection(db, "sucursales", usuario.sucursalId, "plantillasSucursal");
  let plantillas = [];
  const norm = valor => valor.trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  cont.innerHTML = `
    <div class="section-header"><div><h2>Configuración de sucursal</h2><p class="section-subtitle">${escaparHtml(sucursal.nombre || "Tu sucursal")} · Los cambios solo se aplican a esta sucursal.</p></div></div>
    ${bloqueada ? '<p class="config-info-note">La empresa o sucursal solo permite consultar su configuración.</p>' : ""}
    <div class="config-tabs" role="tablist" aria-label="Configuración de sucursal">
      <button type="button" class="config-tab active" role="tab" aria-selected="true" data-panel="sucursalIdentidad">Identidad Visual</button>
      <button type="button" class="config-tab" role="tab" aria-selected="false" data-panel="sucursalPlantillas">Plantillas de Mantenimiento</button>
    </div>
    <section id="sucursalIdentidad" class="config-panel config-panel-identidad">
      <h3>Identidad visual</h3>
      <form id="formIdentidadSucursal">
        <div class="color-config-row">
          ${[["Primario", "primario", "#1565c0"], ["Secundario", "secundario", "#8bc34a"]].map(([campo, nombre, base]) => `
            <label><span>Color ${nombre}</span><div class="color-field">
              <input id="sucursalColor${campo}Picker" type="color" value="${escaparHtml(identidad["color" + campo] || base)}" ${disabled}>
              <input id="sucursalColor${campo}" type="text" maxlength="7" value="${escaparHtml(identidad["color" + campo] || base)}" ${disabled}>
            </div></label>`).join("")}
        </div>
        <div class="branding-informe-grid">
          ${[["Logo", "logoUrl", "Logo para informes", "Logo predeterminado de Vectaria", "PNG, JPG o WebP. Máximo 2 MB. Se recomienda fondo transparente."], ["Portada", "portadaUrl", "Imagen de portada", "Se usará la primera evidencia disponible", "PNG, JPG o WebP. Máximo 5 MB. Formato horizontal recomendado."]].map(([nombre, campo, titulo, base, ayuda]) => `
            <label class="branding-upload-card"><span>${titulo}</span>
              <div id="previewSucursal${nombre}" class="branding-preview branding-preview-${nombre.toLowerCase()}">
                ${urlSegura(identidad.brandingInforme?.[campo]) ? `<img src="${escaparHtml(urlSegura(identidad.brandingInforme[campo]))}" alt="${titulo}">` : `<strong>${base}</strong>`}
              </div>
              <input id="sucursal${nombre}" type="file" accept="image/png,image/jpeg,image/webp" ${disabled}><small>${ayuda}</small>
            </label>`).join("")}
        </div>
        <div class="config-info-note">Esta identidad se aplica solamente a los informes PDF de tu sucursal. Se hereda la identidad de la empresa mientras no guardes una propia.</div>
        <div class="sucursal-config-acciones"><button class="btn-primary" type="submit" ${disabled}>Guardar cambios</button><button class="btn-secondary" id="restablecerIdentidadSucursal" type="button" ${disabled}>Usar identidad de la empresa</button></div>
      </form>
    </section>
    <section id="sucursalPlantillas" class="plantillas-panel" hidden>
      <div class="plantillas-encabezado"><h3>Plantillas de mantenimiento</h3><p>Asocia cada gama de equipo con el checklist que se aplicará automáticamente al crear una OT de tu sucursal.</p></div>
      <div class="plantillas-grid">
        <form id="formPlantillaSucursal" class="config-panel plantilla-form">
          <h3>Crear plantilla</h3>
          <label><span>Equipo o gama</span><input id="sucursalPlantillaGama" maxlength="100" placeholder="Ej.: Bombas centrífugas" required ${disabled}></label>
          <label><span>Nombre de la plantilla</span><input id="sucursalPlantillaNombre" maxlength="140" placeholder="Ej.: Mantenimiento integral de bombas" required ${disabled}></label>
          <label><span>Archivo de checklist</span><div class="plantilla-upload-zone"><strong>Archivo Excel con las etapas de esta gama</strong><span>Cada hoja define una etapa con su propio nombre. El flujo seguirá el orden de las hojas del Excel.</span><input id="sucursalPlantillaArchivo" type="file" accept=".xlsx,.xls" required ${disabled}></div></label>
          <button class="btn-primary" type="submit" ${disabled}>Guardar plantilla</button>
        </form>
        <section class="config-panel plantillas-listado"><div class="plantillas-listado-header"><h3>Plantillas configuradas</h3><input id="buscarPlantillaSucursal" type="search" placeholder="Buscar por equipo o gama..." aria-label="Buscar plantillas de sucursal"></div>
          <div id="listaPlantillasSucursal" aria-live="polite"></div>
          <div class="config-info-note">Las nuevas OT utilizarán las plantillas de esta sucursal. Las órdenes existentes conservan su checklist original.</div>
        </section>
      </div>
    </section>`;
  cont.querySelectorAll("[data-panel]").forEach(boton => boton.addEventListener("click", () => {
    cont.querySelectorAll("[data-panel]").forEach(tab => { const activo = tab === boton; tab.classList.toggle("active", activo); tab.setAttribute("aria-selected", String(activo)); $(tab.dataset.panel).hidden = !activo; });
  }));
  for (const campo of ["Primario", "Secundario"]) {
    const picker = $("sucursalColor" + campo + "Picker");
    const texto = $("sucursalColor" + campo);
    picker.addEventListener("input", () => { texto.value = picker.value; });
    texto.addEventListener("input", () => { if (/^#[0-9a-f]{6}$/i.test(texto.value)) picker.value = texto.value; });
  }
  for (const campo of ["Logo", "Portada"]) {
    const input = $("sucursal" + campo), preview = $("previewSucursal" + campo);
    const original = preview.innerHTML;
    input.addEventListener("change", () => {
      const archivo = input.files?.[0];
      if (!archivo) { preview.innerHTML = original; return; }
      if (!["image/png", "image/jpeg", "image/webp"].includes(archivo.type)) return;
      const url = URL.createObjectURL(archivo);
      const imagen = document.createElement("img"); imagen.alt = "Vista previa";
      imagen.onload = imagen.onerror = () => URL.revokeObjectURL(url);
      imagen.src = url; preview.replaceChildren(imagen);
    });
  }
  $("buscarPlantillaSucursal").addEventListener("input", renderPlantillas);
  async function cargarPlantillas() {
    const docs = await getDocs(plantillasRef);
    plantillas = docs.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => String(a.gama || "").localeCompare(String(b.gama || ""), "es"));
    renderPlantillas();
  }
  function renderPlantillas() {
    const lista = $("listaPlantillasSucursal");
    lista.replaceChildren();
    const filtro = norm($("buscarPlantillaSucursal").value || "");
    const visibles = plantillas.filter(p => !filtro || norm(`${p.gama || ""} ${p.nombre || ""}`).includes(filtro));
    if (!visibles.length) { lista.textContent = filtro ? "No hay plantillas que coincidan con la búsqueda." : "No hay plantillas propias. Se utilizan las plantillas generales de la empresa."; return; }
    visibles.forEach(p => {
      const fila = document.createElement("article"); fila.className = "plantilla-item";
      const icono = document.createElement("div"); icono.className = "plantilla-item-icon"; icono.textContent = "▤";
      const info = document.createElement("div"); info.className = "plantilla-item-info";
      const titulo = document.createElement("strong"); titulo.textContent = p.gama || "Sin gama";
      const nombre = document.createElement("span"); nombre.textContent = p.nombre || "Sin nombre";
      const detalle = document.createElement("small"); detalle.textContent = `Versión ${Number(p.version || 1)} · ${Number(p.totalActividades || 0)} actividades`;
      info.append(titulo, nombre, detalle);
      const estado = document.createElement("span"); estado.className = `plantilla-estado ${p.activa === false ? "inactiva" : ""}`; estado.textContent = p.activa === false ? "INACTIVA" : "ACTIVA";
      const boton = document.createElement("button"); boton.type = "button"; boton.className = "btn-secondary"; boton.textContent = "Eliminar"; boton.disabled = bloqueada;
      boton.addEventListener("click", async () => {
        if (bloqueada || !(await confirmar("¿Eliminar esta plantilla de tu sucursal? Las OT existentes no se modifican."))) return;
        boton.disabled = true;
        try {
          if (p.archivoRuta) await deleteObject(ref(storage, p.archivoRuta));
          await deleteDoc(doc(plantillasRef, p.id)); await cargarPlantillas();
        } catch (e) { await aviso(e.message); boton.disabled = false; }
      });
      fila.append(icono, info, estado, boton); lista.appendChild(fila);
    });
  }
  async function guardarImagen(archivo, nombre) {
    if (!archivo) return null;
    if (!["image/png", "image/jpeg", "image/webp"].includes(archivo.type) || archivo.size > (nombre === "logo" ? 2 : 5) * 1024 ** 2) throw Error("Imagen inválida o demasiado grande.");
    await validarFirmaArchivo(archivo, archivo.type);
    const referencia = ref(storage, `${prefijo}/informe/${nombre}-${crypto.randomUUID()}`);
    await uploadBytes(referencia, archivo, { contentType: archivo.type });
    try { return { ruta: referencia.fullPath, url: await getDownloadURL(referencia) }; }
    catch (error) { await deleteObject(referencia).catch(() => {}); throw error; }
  }
  $("formIdentidadSucursal").addEventListener("submit", async e => {
    e.preventDefault(); if (bloqueada) return;
    const boton = e.submitter; boton.disabled = true;
    const nuevas = []; let guardada = false;
    try {
      const propia = { colorPrimario: $("sucursalColorPrimario").value, colorSecundario: $("sucursalColorSecundario").value, brandingInforme: { ...(sucursal.identidadVisual?.brandingInforme || {}) } };
      if (![propia.colorPrimario, propia.colorSecundario].every(valor => /^#[0-9a-f]{6}$/i.test(valor))) throw Error("Los colores deben usar el formato #RRGGBB.");
      for (const [campo, nombre] of [["Logo", "logo"], ["Portada", "portada"]]) {
        const subida = await guardarImagen($("sucursal" + campo).files?.[0], nombre);
        if (subida) { nuevas.push(subida.ruta); propia.brandingInforme[nombre + "Url"] = subida.url; propia.brandingInforme[nombre + "Ruta"] = subida.ruta; }
      }
      await updateDoc(sucursalRef, { identidadVisual: propia, fechaActualizacion: serverTimestamp() });
      guardada = true;
      sucursal.identidadVisual = propia;
      await aviso("Identidad guardada para tu sucursal. Las imágenes anteriores reemplazadas se eliminarán automáticamente en el servidor.");
      await renderConfiguracionSucursal({ db, usuario, empresa, procesarExcel });
    } catch (error) {
      if (!guardada) for (const ruta of nuevas) await deleteObject(ref(storage, ruta)).catch(() => {});
      await aviso(error.message);
    } finally { boton.disabled = false; }
  });
  $("restablecerIdentidadSucursal").addEventListener("click", async e => {
    const boton = e.currentTarget;
    if (bloqueada || !(await confirmar("¿Volver a usar la identidad general de la empresa en esta sucursal?"))) return;
    boton.disabled = true;
    try {
      await updateDoc(sucursalRef, { identidadVisual: deleteField(), fechaActualizacion: serverTimestamp() });
      await aviso("Identidad general restablecida. Las imágenes propias anteriores se eliminarán automáticamente en el servidor.");
      await renderConfiguracionSucursal({ db, usuario, empresa, procesarExcel });
    } catch (error) { await aviso(error.message); boton.disabled = false; }
  });
  $("formPlantillaSucursal").addEventListener("submit", async e => {
    e.preventDefault(); if (bloqueada) return;
    const boton = e.submitter; boton.disabled = true;
    let creado = null, referencia = null, guardada = false;
    try {
      const gama = $("sucursalPlantillaGama").value.trim(), nombre = $("sucursalPlantillaNombre").value.trim();
      const archivo = $("sucursalPlantillaArchivo").files?.[0];
      if (!gama || !nombre || !archivo || archivo.size > 5 * 1024 ** 2 || !/\.xlsx?$/i.test(archivo.name)) throw Error("Completa los campos y selecciona un Excel de hasta 5 MB.");
      if (plantillas.some(p => p.activa !== false && p.gamaNormalizada === norm(gama))) throw Error("Ya existe una plantilla propia para esta gama.");
      const tipo = /\.xls$/i.test(archivo.name) ? "application/vnd.ms-excel" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      await validarFirmaArchivo(archivo, tipo);
      const { checklists, total, etapasHabilitadas, hojasExcel, flujoVersion, etapas } = await procesarExcel(archivo);
      const datosPlantilla = { empresaId: empresa.id, sucursalId: usuario.sucursalId, nombre, gama, gamaNormalizada: norm(gama), activa: true, version: 1, checklists, etapasHabilitadas, hojasExcel, flujoVersion, etapas, totalActividades: total, archivoNombre: archivo.name, creadoPor: usuario.uid, fechaCreacion: serverTimestamp(), fechaActualizacion: serverTimestamp() };
      if (new TextEncoder().encode(JSON.stringify(datosPlantilla)).length > 650000) throw Error("La plantilla supera el tamaño admitido. Divide las actividades en archivos más pequeños.");
      creado = await addDoc(plantillasRef, datosPlantilla);
      referencia = ref(storage, `${prefijo}/plantillas/${creado.id}/${crypto.randomUUID()}-${archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
      await uploadBytes(referencia, archivo, { contentType: tipo });
      await updateDoc(creado, { archivoRuta: referencia.fullPath, archivoUrl: await getDownloadURL(referencia) });
      guardada = true; e.target.reset(); await cargarPlantillas(); await aviso("Plantilla guardada. Se aplicará a las nuevas OT de esta sucursal.");
    } catch (error) {
      if (!guardada) { if (referencia) await deleteObject(referencia).catch(() => {}); if (creado) await deleteDoc(creado).catch(() => {}); }
      await aviso(error.message);
    } finally { boton.disabled = false; }
  });
  await cargarPlantillas();
}
