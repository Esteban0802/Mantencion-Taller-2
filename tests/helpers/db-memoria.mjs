export function dbMemoria(datos) {
  const documentos = new Map(Object.entries(datos));
  let cola = Promise.resolve();
  function referencia(ruta) {
    return { ruta, collection: nombre => referencia(`${ruta}/${nombre}`), doc: id => referencia(`${ruta}/${id}`),
      get: async () => ({ exists: documentos.has(ruta), data: () => documentos.get(ruta) }) };
  }
  return { documentos, collection: nombre => referencia(nombre),
    runTransaction(callback) {
      const operacion = cola.then(async () => {
        const pendientes = [];
        const resultado = await callback({ get: ref => ref.get(),
          set: (ref, valor) => pendientes.push(() => documentos.set(ref.ruta, valor)),
          update: (ref, valor) => pendientes.push(() => Object.assign(documentos.get(ref.ruta), valor)) });
        pendientes.forEach(guardar => guardar());
        return resultado;
      });
      cola = operacion.catch(() => {});
      return operacion;
    }
  };
}
