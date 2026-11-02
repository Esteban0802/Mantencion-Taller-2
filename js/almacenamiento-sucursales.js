import { escaparHtml } from "./html-seguro.js";
import { formatearBytesAlmacenamiento as formato } from "./storage-indicador.js";
export function conectarDesgloseAlmacenamiento({ contenedor, consultar, empresaId, limiteGB }) {
  contenedor.innerHTML = `<h3>Consumo por sucursal</h3><p>Las sucursales comparten el almacenamiento contratado por la empresa.</p><button type="button" class="btn-secondary">Consultar consumo</button><div data-desglose role="status"></div>`;
  const boton = contenedor.querySelector("button"), resultado = contenedor.querySelector("[data-desglose]");
  boton.addEventListener("click", async () => {
    boton.disabled = true; resultado.textContent = "Consultando archivos…";
    try {
      const { data } = await consultar({ empresaId });
      const filas = [...data.sucursales];
      if (data.generales) filas.push({ nombre: "Archivos generales de la empresa", ...data.generales });
      if (data.sinSucursal) filas.push({ nombre: "Archivos sin sucursal identificada", ...data.sinSucursal });
      const limite = Number(limiteGB || 0) * 1024 ** 3;
      resultado.innerHTML = filas.map(f => `<article class="dato-box"><strong>${escaparHtml(f.nombre)}</strong><span>${formato(f.bytes)} · ${Number(f.archivos)} archivo(s)${limite ? ` · ${(f.bytes / limite * 100).toFixed(1)}% de la cuota de empresa` : ""}</span>${f.papeleraBytes ? `<small>Incluye ${formato(f.papeleraBytes)} de OT en papelera.</small>` : ""}</article>`).join("") + `<small>Consulta del ${escaparHtml(new Date(data.medidoEn).toLocaleString("es-CL"))}. Puede variar si hay cargas en curso. Pulsa Actualizar para consultar nuevamente.</small>`;
      boton.textContent = "Actualizar consumo";
    } catch (error) {
      resultado.textContent = error.code === "functions/not-found" ? "El desglose estará disponible cuando se publique la actualización del servidor." : "No se pudo consultar el consumo. Intenta nuevamente.";
    } finally { boton.disabled = false; }
  });
}
