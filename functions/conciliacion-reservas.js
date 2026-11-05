const { actualizarReserva } = require("./cuota-storage");

async function conciliarReservas({ db, bucket, ahora = Date.now(), registrarError = console.error }) {
  const corte = ahora - 10 * 60 * 1000;
  const resultado = { revisadas: 0, conciliadas: 0, errores: 0 };
  let cursor = null;
  do {
    let consulta = db.collectionGroup("reservasAlmacenamiento")
      .where("estado", "==", "reservada").where("creadaEn", "<=", corte)
      .orderBy("creadaEn").limit(100);
    if (cursor) consulta = consulta.startAfter(cursor);
    const pagina = await consulta.get();
    for (const reserva of pagina.docs) {
      const partes = reserva.ref.path.split("/");
      const carga = reserva.data();
      const empresaId = partes[1];
      // El grupo puede contener colecciones homónimas: solo procesar las reservas oficiales.
      if (partes.length !== 4 || partes[0] !== "empresas" || partes[2] !== "reservasAlmacenamiento" ||
          carga.empresaId !== empresaId || carga.estado !== "reservada" ||
          !Number.isFinite(carga.creadaEn) || carga.creadaEn > corte || typeof carga.ruta !== "string" || !carga.ruta) {
        resultado.errores++;
        registrarError("conciliarReservaInvalida", reserva.id);
        continue;
      }
      resultado.revisadas++;
      try {
        let eliminar;
        try {
          const [metadata] = await bucket.file(carga.ruta).getMetadata();
          eliminar = metadata.metadata?.cuotaReservaId !== reserva.id || metadata.metadata?.cuotaEmpresaId !== empresaId;
        } catch (error) {
          if (Number(error.code) !== 404) throw error;
          eliminar = true;
        }
        // Un evento de Storage puede haber confirmado la carga después de nuestra consulta.
        await actualizarReserva({ db, empresaId, id: reserva.id, eliminar, soloPendiente: true });
        resultado.conciliadas++;
      } catch (error) {
        resultado.errores++;
        registrarError("conciliarReserva", empresaId, error.code || error.name);
      }
    }
    cursor = pagina.docs.length === 100 ? pagina.docs.at(-1) : null;
  } while (cursor);
  return resultado;
}

module.exports = { conciliarReservas };
