const metricas = [];
export function iniciarMedicion(nombre) { const inicio = performance.now(); let finalizada = false; return () => { if (finalizada) return 0; finalizada = true; const duracionMs = Math.round((performance.now() - inicio) * 10) / 10; metricas.push({ nombre, duracionMs, fecha: new Date().toISOString() }); if (metricas.length > 100) metricas.shift(); console.debug(`[Rendimiento] ${nombre}: ${duracionMs} ms`); return duracionMs; }; }
export async function medirAsync(nombre, tarea) { const finalizar = iniciarMedicion(nombre); try { return await tarea(); } finally { finalizar(); } }
export function obtenerMetricasRendimiento() { return metricas.map(metrica => ({ ...metrica })); }
if (typeof window !== "undefined") window.OverTrackPerformance = Object.freeze({ obtenerMetricas: obtenerMetricasRendimiento });
