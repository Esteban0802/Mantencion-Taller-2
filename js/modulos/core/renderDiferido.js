import { medirAsync } from "./rendimiento.js";
const tareasPendientes = new WeakMap();
let observador = null;

function ejecutarTarea(elemento) {
  const registro = tareasPendientes.get(elemento);
  if (!registro) return;
  tareasPendientes.delete(elemento);
  observador?.unobserve(elemento);
  window.clearTimeout(registro.limpieza);
  const ejecutar = () => {
    if (!elemento.isConnected) return;
    medirAsync("Render diferido de evidencias y comentarios", registro.tarea).catch(error => console.error("No fue posible cargar el contenido diferido:", error));
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(ejecutar, { timeout: 250 });
  else window.setTimeout(ejecutar, 0);
}

function obtenerObservador() {
  if (observador || !("IntersectionObserver" in window)) return observador;
  observador = new IntersectionObserver(entradas => entradas.forEach(entrada => {
    if (entrada.isIntersecting) ejecutarTarea(entrada.target);
  }), { rootMargin: "320px 0px", threshold: 0.01 });
  return observador;
}

export function programarRenderDiferido(elemento, tarea) {
  if (!elemento || typeof tarea !== "function") return;
  const instancia = obtenerObservador();
  if (!instancia) { tarea(); return; }
  const anterior = tareasPendientes.get(elemento);
  if (anterior) window.clearTimeout(anterior.limpieza);
  const limpieza = window.setTimeout(() => {
    if (elemento.isConnected) return;
    instancia.unobserve(elemento);
    tareasPendientes.delete(elemento);
  }, 30000);
  tareasPendientes.set(elemento, { tarea, limpieza });
  instancia.observe(elemento);
}
