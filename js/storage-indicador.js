import { evaluarCuotaStorage } from "./storage-quota.js";
export function resumenAlmacenamiento(empresa = {}) {
    const usado = Math.max(0, Number(empresa.storageUsadoBytes || 0));
    const reservado = Math.max(0, Number(empresa.storageReservadoBytes || 0));
    const limite = Math.max(0, Number(empresa.maxStorageGB || 0)) * 1024 ** 3;
    const estado = evaluarCuotaStorage({ usadoBytes: usado, maxStorageGB: empresa.maxStorageGB, nuevoBytes: reservado });
    return { usado, reservado, limite, disponible: Math.max(0, limite - usado - reservado),
        porcentaje: estado.porcentaje, nivel: estado.nivel, medido: empresa.storageCuotaVersion === 1 };
}
export function formatearBytesAlmacenamiento(bytes) {
    if (bytes < 1024) return `${Math.max(0, bytes)} B`;
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.max(0, bytes / 1024).toFixed(1)} KB`;
}
export function renderIndicadorAlmacenamiento(empresa) {
    const r = resumenAlmacenamiento(empresa);
    const etiquetas = { normal: "Espacio disponible", preventivo: "Uso elevado", critico: "Poco espacio disponible", bloqueado: "Límite alcanzado" };
    return `<section data-visor-almacenamiento class="cuota-almacenamiento cuota-${r.nivel}" aria-label="Almacenamiento de la empresa" aria-live="polite">
      <div class="cuota-encabezado"><h3>Almacenamiento de la empresa</h3><strong>${r.medido ? (r.limite ? etiquetas[r.nivel] : "Sin límite definido") : "Medición pendiente"}</strong></div>
      ${r.medido ? `<p><b>${formatearBytesAlmacenamiento(r.usado)}</b> usados${r.limite ? ` de ${formatearBytesAlmacenamiento(r.limite)}` : ""}</p>
      ${r.limite ? `<progress max="100" value="${Math.min(100, r.porcentaje)}" aria-label="Cuota ocupada"></progress><p>${r.porcentaje.toFixed(1)}% ocupado · <b>${formatearBytesAlmacenamiento(r.disponible)}</b> disponibles</p>` : ""}
      ${r.reservado ? `<p>${formatearBytesAlmacenamiento(r.reservado)} en cargas pendientes</p>` : ""}
      <small>Se actualiza automáticamente. Cuota compartida por todas las sucursales.</small>` : "<p>Un administrador debe medir el uso real desde Configuración antes de habilitar nuevas cargas.</p>"}
    </section>`;
}
