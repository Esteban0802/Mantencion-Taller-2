export function esFlujoLibre(ot) { return ot?.flujoVersion === 2 && Array.isArray(ot.etapasPersonalizadas); }
export function progresoLibre(ot) {
  if (ot?.cerrada) return 100;
  const etapas = ot?.etapasPersonalizadas || [];
  const total = etapas.reduce((n,e)=>n+(e.total ?? e.items?.length ?? 0),0);
  const listos = etapas.reduce((n,e)=>n+(e.completada ? (e.total ?? e.items?.length ?? 0) : (e.completados ?? e.items?.filter(i=>i.ok).length ?? 0)),0);
  return total ? Math.round(listos / total * 100) : 0;
}
export function gruposLibresInforme(ot) {
  return (ot.etapasPersonalizadas || []).map(e=>({key:e.id,nombre:e.nombre,lista:(e.items || []).map(i=>({...i,fotos:(i.fotos || []).map(f=>typeof f === "string"?f:f.url)}))}));
}
