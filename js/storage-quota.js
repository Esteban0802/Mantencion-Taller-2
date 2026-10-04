export function evaluarCuotaStorage({ usadoBytes = 0, maxStorageGB = 0, nuevoBytes = 0 } = {}) {
  const usado = Math.max(0, Number(usadoBytes || 0));
  const nuevo = Math.max(0, Number(nuevoBytes || 0));
  const maximo = Math.max(0, Number(maxStorageGB || 0)) * 1024 * 1024 * 1024;
  const proyectado = usado + nuevo;

  if (!maximo) {
    return { permitido: true, nivel: "normal", porcentaje: 0, proyectado, maximo };
  }

  const porcentaje = (proyectado / maximo) * 100;
  return {
    permitido: proyectado < maximo,
    nivel: porcentaje >= 100
      ? "bloqueado"
      : porcentaje >= 90
        ? "critico"
        : porcentaje >= 80
          ? "preventivo"
          : "normal",
    porcentaje,
    proyectado,
    maximo
  };
}

export function mensajeCuotaStorage(resultado) {
  if (!resultado || resultado.nivel === "normal") return "";
  if (!resultado.permitido) {
    return "La empresa alcanzó el límite de almacenamiento de su plan. Elimina archivos o solicita una ampliación antes de continuar.";
  }
  if (resultado.nivel === "critico") {
    return `Advertencia: con esta carga se utilizará ${resultado.porcentaje.toFixed(1)}% del almacenamiento contratado.`;
  }
  return `Aviso: con esta carga se utilizará ${resultado.porcentaje.toFixed(1)}% del almacenamiento contratado.`;
}
