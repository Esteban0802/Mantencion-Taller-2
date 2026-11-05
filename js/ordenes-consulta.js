export function coincideTextoOT(ot, texto) {
  return [ot.os, ot.equipo, ot.serie, ot.cliente]
    .some(valor => String(valor || "").toLowerCase().includes(texto.trim().toLowerCase()));
}

// La búsqueda por fragmentos no está disponible como consulta nativa de Firestore.
// Se avanza por bloques solo al buscar/navegar, conservando los resultados ya leídos.
export function crearBusquedaOT({ leerBloque, coincide, tamano = 20, vigente = () => true }) {
  const resultados = [];
  let cursor = null;
  let fin = false;
  return async pagina => {
    while (!fin && resultados.length <= pagina * tamano) {
      if (!vigente()) return null;
      const bloque = await leerBloque(cursor);
      if (!vigente()) return null;
      resultados.push(...bloque.docs.filter(coincide));
      cursor = bloque.cursor;
      fin = bloque.fin || !bloque.docs.length;
    }
    return {
      registros: resultados.slice((pagina - 1) * tamano, pagina * tamano),
      hayMas: resultados.length > pagina * tamano || !fin,
      total: fin ? resultados.length : null
    };
  };
}
