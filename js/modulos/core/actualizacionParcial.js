import { iniciarMedicion } from "./rendimiento.js";

export function actualizarTarjetaChecklist(contenedorId, indice, item, itemCompleto) {
  const finalizarMedicion = iniciarMedicion("Actualización parcial de checklist");
  const tarjeta = document.getElementById(contenedorId)?.querySelector(`[data-checklist-index="${indice}"]`);
  if (!tarjeta || !item) { finalizarMedicion(); return false; }
  const completado = itemCompleto(item);
  tarjeta.classList.toggle("completed", completado);
  const estado = tarjeta.querySelector(".checklist-status");
  if (estado) { estado.textContent = completado ? "Completado" : "Pendiente"; estado.classList.toggle("done", completado); estado.classList.toggle("pending", !completado); }
  finalizarMedicion();
  return true;
}
