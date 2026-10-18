(() => {
  const SELECTOR_TABLAS = [
    ".inventario-tabla",
    ".inventario-detalle-tabla",
    ".sheq-table"
  ].join(",");

  function textoEtiqueta(texto, indice, total) {
    const limpio = String(texto || "").replace(/\s+/g, " ").trim();
    if (limpio) return limpio;
    return indice === total - 1 ? "Acciones" : "Detalle";
  }

  function etiquetarTabla(tabla) {
    const encabezados = Array.from(tabla.querySelectorAll("thead th"));
    if (!encabezados.length) return;

    const etiquetas = encabezados.map((th, indice) =>
      textoEtiqueta(th.textContent, indice, encabezados.length)
    );

    tabla.classList.add("mobile-cardized-table");
    tabla.querySelectorAll("tbody tr").forEach(fila => {
      const celdas = Array.from(fila.children).filter(celda => celda.tagName === "TD");
      if (celdas.length === 1 && Number(celdas[0].colSpan || 1) > 1) {
        celdas[0].classList.add("mobile-card-empty");
        celdas[0].removeAttribute("data-label");
        return;
      }

      celdas.forEach((celda, indice) => {
        celda.classList.remove("mobile-card-empty");
        celda.dataset.label = etiquetas[indice] || `Campo ${indice + 1}`;
      });
    });
  }

  function actualizarTablas(raiz = document) {
    if (raiz instanceof Element && raiz.matches(SELECTOR_TABLAS)) etiquetarTabla(raiz);
    raiz.querySelectorAll?.(SELECTOR_TABLAS).forEach(etiquetarTabla);
  }

  function iniciar() {
    actualizarTablas();
    const observador = new MutationObserver(cambios => {
      const tablas = new Set();
      cambios.forEach(cambio => {
        const tabla = cambio.target instanceof Element
          ? cambio.target.closest(SELECTOR_TABLAS)
          : null;
        if (tabla) tablas.add(tabla);
        cambio.addedNodes.forEach(nodo => {
          if (!(nodo instanceof Element)) return;
          if (nodo.matches(SELECTOR_TABLAS)) tablas.add(nodo);
          nodo.querySelectorAll?.(SELECTOR_TABLAS).forEach(item => tablas.add(item));
        });
      });
      tablas.forEach(etiquetarTabla);
    });
    observador.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  } else {
    iniciar();
  }
})();
