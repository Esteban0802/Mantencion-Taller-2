// Consulta explícita: no modifica los contadores que hacen cumplir la cuota.
async function obtenerDesglose({ db, bucket, usuario, empresaId }) {
  const denegar = () => { throw Object.assign(Error("No puedes consultar este almacenamiento."), { code: "permission-denied" }); };
  if (!usuario?.activo || !["super_admin", "admin_empresa", "admin_sucursal"].includes(usuario.rol) ||
      (usuario.rol !== "super_admin" && usuario.empresaId !== empresaId) || !empresaId) denegar();
  const propia = usuario.rol === "admin_sucursal" ? usuario.sucursalId : null;
  if (usuario.rol === "admin_sucursal" && !propia) denegar();
  const sucursales = await db.collection("sucursales").where("empresaId", "==", empresaId).get();
  if (propia && !sucursales.docs.some(d => d.id === propia)) denegar();
  const filas = new Map(sucursales.docs.map(d => [d.id, { sucursalId: d.id, nombre: d.data().nombre || "Sucursal", bytes: 0, archivos: 0, papeleraBytes: 0 }]));
  const generales = { bytes: 0, archivos: 0 }, sinSucursal = { bytes: 0, archivos: 0 };
  const [ots, papelera] = await Promise.all(["ots", "otsPapelera"].map(c => db.collection(c).where("empresaId", "==", empresaId).get()));
  const ordenes = new Map(ots.docs.map(d => [d.id, { sucursalId: d.data().sucursalId, papelera: false }]));
  for (const d of papelera.docs) if (!ordenes.has(d.id)) ordenes.set(d.id, { sucursalId: d.data().sucursalId, papelera: true });
  const prefijos = [`empresas/${empresaId}/`, ...[...ordenes.keys()].map(id => `ots/${id}/`)];
  const vistas = new Set();
  for (const prefix of prefijos) {
    const [archivos] = await bucket.getFiles({ prefix });
    for (const archivo of archivos) {
      if (vistas.has(archivo.name)) continue;
      vistas.add(archivo.name);
      const partes = archivo.name.split("/");
      const ot = partes[0] === "ots" ? ordenes.get(partes[1]) : null;
      const sucursalId = ot ? ot.sucursalId : ["sucursales", "inventario", "inventarioServicio"].includes(partes[2]) ? partes[3] : null;
      const fila = sucursalId ? filas.get(sucursalId) || sinSucursal : ot ? sinSucursal : generales;
      const bytes = Math.max(0, Number(archivo.metadata?.size || 0));
      fila.bytes += bytes; fila.archivos++;
      if (ot?.papelera && fila.papeleraBytes !== undefined) fila.papeleraBytes += bytes;
    }
  }
  return { medidoEn: Date.now(), sucursales: [...filas.values()].filter(f => !propia || f.sucursalId === propia),
    // Un administrador de sucursal no recibe los datos de las otras sucursales.
    ...(!propia ? { generales, sinSucursal } : {}) };
}
module.exports = { obtenerDesglose };
