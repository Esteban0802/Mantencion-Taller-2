import { escaparHtml as esc, urlSegura } from "./html-seguro.js";
import { progresoLibre } from "./flujo-libre-modelo.js?v=20261101-1";

export function crearVistaFlujoLibre({ ot, usuario, seleccionado, ocupado=false, borradores=new Map(), generarPDF=false }) {
  const jefe = usuario.rol === "jefe_taller";
  const operativo = ["jefe_taller","tecnico","supervisor"].includes(usuario.rol);
  const etapas = ot.etapasPersonalizadas;
  const indiceActivo = etapas.findIndex(etapa => !etapa.completada);
  const indice = Math.max(0, etapas.findIndex(etapa => etapa.id === seleccionado));
  const e = etapas[indice];
  const editable = operativo && !ot.cerrada && e.id === etapas[indiceActivo]?.id;
  const itemCompleto = item => Boolean(item.ok && item.fotos.length && item.comentarios.length);
  const completos = e.items.filter(itemCompleto).length;
  const ready = completos === e.items.length;
  const porcentajeEtapa = Math.round(completos / e.items.length * 100);
  const progreso = progresoLibre(ot);
  const decisionPanel = `<section class="libre-decision"><h3>Decisión del Jefe de Taller</h3><p>Registra el motivo de la aprobación o del rechazo y adjunta su respaldo.</p><label>Comentario<textarea data-decision-texto maxlength="3000" ${ocupado ? "disabled" : ""}>${esc(borradores.get(`${e.id}:decision`) || "")}</textarea></label><label>Documentos de respaldo<input type="file" data-decision-archivos multiple accept="image/*,application/pdf" ${ocupado ? "disabled" : ""}></label><small>Fotografías o PDF. Se conservarán en la primera actividad de esta etapa.</small><div class="libre-decision-botones"><button type="button" class="btn-danger" data-decidir="rechazar" ${ocupado || !ready ? "disabled" : ""}>Rechazar servicio</button><button type="button" class="btn-primary" data-decidir="aprobar" ${ocupado || !ready ? "disabled" : ""}>Aprobar servicio</button></div></section>`;
  const html = `
    <div class="header-ot-pro libre-resumen">
      <div class="header-ot-main">
        <div><span class="header-ot-label">Orden de Trabajo</span><h1>${esc(ot.os)}</h1></div>
        <div class="libre-cabecera-acciones"><span class="header-ot-estado">${ot.cerrada ? "OT cerrada" : esc(ot.etapaActualNombre)}</span>
          ${generarPDF ? '<button type="button" class="btn-primary" data-pdf>Generar informe PDF</button>' : ""}</div>
      </div>
      <div class="header-ot-grid">
        <div><span>Equipo</span><strong>${esc(ot.equipo)}</strong></div>
        <div><span>Serie</span><strong>${esc(ot.serie)}</strong></div>
        <div><span>Cliente</span><strong>${esc(ot.cliente)}</strong></div>
        <div><span>Gama de equipo</span><strong>${esc(ot.gamaEquipo || "—")}</strong></div>
      </div>
      <div class="header-ot-progress"><div class="header-ot-progress-info"><span>Progreso general</span><strong>${progreso}%</strong></div>
        <div class="header-ot-progress-bar" role="progressbar" aria-label="Progreso general" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progreso}"><div style="width:${progreso}%"></div></div>
      </div>
    </div>
    <nav class="tabs tabs-timeline-pro libre-etapas" style="--columnas-flujo:${etapas.length + (jefe ? 1 : 0)}" aria-label="Etapas de la orden">
      ${jefe ? `<button type="button" data-etapa-libre="crear" class="tab ${seleccionado === "crear" ? "active" : "enabled"}" ${seleccionado === "crear" ? 'aria-current="step"' : ""}><span class="tab-dot">1</span><span class="tab-text">Crear OT</span></button>` : ""}
      ${etapas.map((etapa,i) => `<button type="button" data-etapa-libre="${etapa.id}" class="tab ${seleccionado !== "crear" && etapa.id === e.id ? "active" : jefe || indiceActivo < 0 || i <= indiceActivo ? "enabled" : "disabled"}" ${seleccionado !== "crear" && etapa.id === e.id ? 'aria-current="step"' : ""} ${!jefe && indiceActivo >= 0 && i > indiceActivo ? "disabled" : ""}>
        <span class="tab-dot">${etapa.completada ? "✓" : i+1+(jefe ? 1 : 0)}</span><span class="tab-text">${esc(etapa.nombre)}</span></button>`).join("")}
    </nav>
    <section class="content active flow-stage-checklist libre-contenido">
      <div class="card flow-stage-card libre-etapa">
        <div class="stage-card-heading"><div><span class="stage-eyebrow">Etapa ${String(indice+1).padStart(2,"0")}</span><h2>${esc(e.nombre)}</h2>
          <p>${e.completada ? "Etapa completada" : e.requiereAprobacion ? "Registra el trabajo y sus evidencias. Esta etapa requiere aprobación del Jefe de Taller." : "Registra el trabajo realizado, adjunta evidencias y completa las actividades."}</p></div></div>
        <div class="libre-progreso progreso-etapa-card">
          <div class="progreso-etapa-header"><strong>${completos} de ${e.items.length} completados</strong><strong>${porcentajeEtapa}%</strong></div>
          <div class="progreso-etapa-barra" role="progressbar" aria-label="Progreso de la etapa" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${porcentajeEtapa}"><div class="progreso-etapa-fill" style="width:${porcentajeEtapa}%"></div></div>
        </div>
        ${e.omitidaPorRechazo ? '<p class="libre-aviso-aprobacion">Etapa omitida por rechazo del servicio. No corresponde a trabajo realizado.</p>' : ""}
        <div class="checklist-pro-grid">
          ${e.items.map((item,i) => {
            const completo = itemCompleto(item);
            return `<article class="checklist-card libre-actividad ${completo ? "completed" : ""}">
              <div class="checklist-card-header"><label class="checklist-card-title libre-actividad-titulo">
                <input class="checklist-card-check" type="checkbox" data-marcar="${i}" ${item.ok ? "checked" : ""} ${!editable || ocupado ? "disabled" : ""}><h4>${esc(item.item)}</h4></label>
                <span class="checklist-status ${completo ? "done" : "pending"}">${completo ? "Completado" : "Pendiente"}</span></div>
              <div class="checklist-card-footer"><span class="checklist-mini-badge">📷 ${item.fotos.length} evidencia(s)</span><span class="checklist-mini-badge">💬 ${item.comentarios.length} comentario(s)</span></div>
              ${editable ? `<div class="checklist-upload-box"><label class="btn-upload-pro libre-subida ${ocupado ? "libre-subida-disabled" : ""}">📷 Agregar evidencias
                <input type="file" multiple data-subir="${i}" aria-label="Agregar fotografías o archivos PDF a ${esc(item.item)}" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,application/pdf,.heic,.heif" ${ocupado ? "disabled" : ""}></label></div>` : ""}
              <div class="checklist-fotos-pro libre-evidencias">${item.fotos.map((f,j) => `<div class="foto-box"><a href="${esc(urlSegura(f.url))}" ${f.tipo.startsWith("image/") ? `data-ver-imagen="${i}:${j}"` : 'target="_blank" rel="noopener noreferrer" class="evidencia-pdf-card"'}>
                ${f.tipo.startsWith("image/") ? `<img loading="lazy" src="${esc(urlSegura(f.url))}" alt="${esc(f.nombre)}">` : `📎 <span>${esc(f.nombre)}</span>`}</a>
                ${editable && f.creadoPorUid === usuario.uid ? `<button type="button" class="btn-delete-img" data-quitar-foto="${i}:${j}" aria-label="Eliminar evidencia ${esc(f.nombre)}" title="Eliminar evidencia" ${ocupado ? "disabled" : ""}>×</button>` : ""}</div>`).join("")}</div>
              ${editable ? `<div class="checklist-comment-box checklist-comment-box--single libre-nuevo-comentario">
                <input type="text" maxlength="3000" data-texto="${i}" placeholder="Trabajo realizado" aria-label="Comentario de ${esc(item.item)}" value="${esc(borradores.get(`${e.id}:${i}`) || "")}">
                <button type="button" class="btn-success" data-comentar="${i}" ${ocupado ? "disabled" : ""}>Agregar comentario</button></div>` : ""}
              <div class="libre-comentarios">${item.comentarios.map(c => `<article class="libre-comentario"><div class="libre-comentario-cabecera"><div><strong>👷 ${esc(c.usuario)}</strong><small>${esc(new Date(c.fecha).toLocaleString("es-CL"))}</small></div>
                ${editable && c.creadoPorUid === usuario.uid ? `<button type="button" data-quitar-comentario="${i}:${esc(c.id)}" aria-label="Eliminar mi comentario" title="Eliminar mi comentario" ${ocupado ? "disabled" : ""}>🗑</button>` : ""}</div><p>${esc(c.texto)}</p></article>`).join("")}</div>
            </article>`;
          }).join("")}
        </div>
        ${editable ? `<div class="stage-actions libre-acciones">${e.requiereAprobacion && !jefe ? `<aside class="libre-aviso-aprobacion" role="status"><span class="libre-aviso-icono" aria-hidden="true">✓</span><div><strong>Esta etapa requiere aprobación</strong><p>El Jefe de Taller debe revisar y aprobar el trabajo para continuar.</p>${!ready ? "<small>Antes de solicitar la revisión, marca cada actividad y agrega al menos una evidencia y un comentario.</small>" : "<small>Las actividades están completas. Falta la revisión del Jefe de Taller.</small>"}</div></aside>` : `<button type="button" class="btn-primary" data-completar ${ocupado || !ready ? "disabled" : ""}>${e.requiereAprobacion ? "Aprobar etapa" : "Completar etapa"}</button>`}
          ${!ready && !(e.requiereAprobacion && !jefe) ? "<small>Cada actividad debe estar marcada y tener al menos una evidencia y un comentario.</small>" : ""}</div>` : ""}
        ${indiceActivo < 0 && indice === etapas.length-1 && seleccionado !== "crear" && !ot.cerrada && jefe ? `<div class="stage-actions"><button type="button" class="btn-danger" data-cerrar ${ocupado ? "disabled" : ""}>Cerrar OT</button></div>` : ""}
        ${e.decision ? `<aside class="libre-resultado ${e.decision.resultado === "aprobada" ? "libre-resultado-aprobado" : "libre-resultado-rechazado"}" aria-label="Resultado de la decisión"><span class="libre-resultado-icono" aria-hidden="true">${e.decision.resultado === "aprobada" ? "✓" : "×"}</span><div class="libre-resultado-cuerpo"><span class="libre-resultado-etiqueta">Decisión del Jefe de Taller</span><h3>Servicio ${e.decision.resultado === "aprobada" ? "aprobado" : "rechazado"}</h3><p>${esc(e.decision.comentario)}</p><div class="libre-resultado-firma"><strong>${esc(e.decision.usuario)}</strong><time>${esc(new Date(e.decision.fecha).toLocaleString("es-CL"))}</time></div></div></aside>` : ""}
        ${ocupado ? '<p class="libre-guardando" role="status">Guardando…</p>' : ""}
      </div>
    </section>`;
  return { html: editable && jefe && e.requiereAprobacion ? html.replace(/<button type="button" class="btn-primary" data-completar[^>]*>Aprobar etapa<\/button>/,decisionPanel) : html, etapa:e };
}
