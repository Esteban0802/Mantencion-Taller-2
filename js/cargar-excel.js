let cargaExcel = null;

// Excel no es necesario para consultar el inventario: se carga al importar/exportar.
export function cargarExcel() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (cargaExcel) return cargaExcel;
  const origen = document.querySelector("script[data-excel-src]")?.dataset.excelSrc;
  if (!origen) return Promise.reject(new Error("No se encontró la configuración de Excel."));
  cargaExcel = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL(origen, document.baseURI).href;
    script.async = true;
    let terminado = false;
    const terminar = error => {
      if (terminado) return;
      terminado = true;
      window.clearTimeout(temporizador);
      script.onload = script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else resolve(window.XLSX);
    };
    const temporizador = window.setTimeout(() => terminar(new Error("Excel tardó demasiado en cargar. Intenta nuevamente.")), 30000);
    script.onload = () => terminar(window.XLSX ? null : new Error("No fue posible iniciar Excel."));
    script.onerror = () => terminar(new Error("No fue posible cargar Excel. Comprueba tu conexión e intenta nuevamente."));
    document.head.appendChild(script);
  }).catch(error => { cargaExcel = null; throw error; });
  return cargaExcel;
}
