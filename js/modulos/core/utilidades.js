// ==========================================
// CORE - UTILIDADES GENERALES OVERTRACK
// ==========================================

let contexto = {};

// Inicializa el módulo
export function inicializarUtilidades(config) {
  contexto = config;
}

// ------------------------------------------
// VALIDAR OT BLOQUEADA
// ------------------------------------------
export function OTBloqueada() {
  const ot = contexto.getOT();

  return (
    ot &&
    (ot.estado === "CERRADA" ||
      ot.cerrada === true)
  );
}

// ------------------------------------------
// VALIDAR ITEM COMPLETO
// ------------------------------------------
export function itemCompleto(item) {

  if (!item) return false;

  const check =
    item.ok === true;

  const tieneFotos =
    item.fotos &&
    item.fotos.length > 0;

  const tieneComentarios =
    item.comentarios &&
    item.comentarios.some(
      c => c.rol !== "jefe_taller"
    );

  return (
    check &&
    tieneFotos &&
    tieneComentarios
  );

}

// ------------------------------------------
// PROGRESO CHECKLIST
// ------------------------------------------
export function calcularProgresoChecklist(lista) {

  if (!lista || lista.length === 0) {

    return {

      total: 0,
      completos: 0,
      porcentaje: 0

    };

  }

  const completos =
    lista.filter(itemCompleto).length;

  const total =
    lista.length;

  const porcentaje =
    Math.round(
      (completos / total) * 100
    );

  return {

    total,
    completos,
    porcentaje

  };

}

// ------------------------------------------
// RENDER PROGRESO
// ------------------------------------------
export function renderProgresoEtapa(id, lista) {

  const cont =
    document.getElementById(id);

  if (!cont) return;

  const progreso =
    calcularProgresoChecklist(lista);

  cont.innerHTML = `

    <div class="progreso-etapa-card">

      <div class="progreso-etapa-header">

        <span>

          ${progreso.completos}
          de
          ${progreso.total}
          completados

        </span>

        <strong>

          ${progreso.porcentaje}%

        </strong>

      </div>

      <div class="progreso-etapa-barra">

        <div
          class="progreso-etapa-fill"
          style="width:${progreso.porcentaje}%;">
        </div>

      </div>

    </div>

  `;

}