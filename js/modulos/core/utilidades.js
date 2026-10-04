// ==========================================
// CORE - UTILIDADES GENERALES OVERTRACK
// ==========================================

let contexto = {};

// Inicializa el módulo
export function inicializarUtilidades(config) {
  contexto = config;
}

// Conserva campos aún no enviados cuando una sección debe volver a dibujarse.
export function capturarBorradoresFormulario(contenedorId) {
  const contenedor = document.getElementById(contenedorId);
  if (!contenedor) return { campos: [], foco: null };

  const activo = document.activeElement;
  const campos = Array.from(
    contenedor.querySelectorAll(
      'input:not([type="file"]):not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea, select'
    )
  )
    .filter(campo => campo.id)
    .map(campo => ({ id: campo.id, valor: campo.value }));

  const foco = activo && contenedor.contains(activo) && activo.id
    ? {
        id: activo.id,
        inicio: typeof activo.selectionStart === "number" ? activo.selectionStart : null,
        fin: typeof activo.selectionEnd === "number" ? activo.selectionEnd : null
      }
    : null;

  return { campos, foco };
}

export function restaurarBorradoresFormulario(contenedorId, borradores) {
  const contenedor = document.getElementById(contenedorId);
  if (!contenedor || !borradores) return;

  borradores.campos?.forEach(({ id, valor }) => {
    const campo = document.getElementById(id);
    if (campo && contenedor.contains(campo)) campo.value = valor;
  });

  const foco = borradores.foco;
  if (!foco) return;

  const campoActivo = document.getElementById(foco.id);
  if (!campoActivo || !contenedor.contains(campoActivo)) return;

  campoActivo.focus({ preventScroll: true });
  if (
    foco.inicio !== null && foco.fin !== null &&
    typeof campoActivo.setSelectionRange === "function"
  ) {
    campoActivo.setSelectionRange(foco.inicio, foco.fin);
  }
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
      c => !["jefe_taller", "admin_sucursal"].includes(c.rol)
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
