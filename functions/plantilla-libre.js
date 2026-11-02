function fallo(mensaje) { throw Object.assign(Error(mensaje),{code:"failed-precondition"}); }
async function prepararPlantilla(plantilla, {bucket,empresaId,sucursalId,plantillaId}) {
  if (plantilla.flujoVersion === 2) return plantilla;
  const ruta=plantilla.archivoRuta;
  if (typeof ruta !== "string" || !(ruta.startsWith(`empresas/${empresaId}/sucursales/${sucursalId}/plantillas/${plantillaId}/`) || ruta.startsWith(`empresas/${empresaId}/plantillas/${plantillaId}/`))) {
    fallo("La plantilla antigua no tiene un Excel original accesible en esta sucursal. El administrador debe volver a cargarlo.");
  }
  const archivo=bucket.file(ruta);
  let metadata, bytes;
  try {
    [metadata]=await archivo.getMetadata();
    if (!Number(metadata.size) || Number(metadata.size)>5*1024**2) fallo("El Excel de la plantilla supera el tamaño admitido.");
    [bytes]=await archivo.download();
  } catch(error) {
    if (Number(error.code)===404) fallo("No se encuentra el Excel original de la plantilla. El administrador debe volver a cargarlo.");
    throw error;
  }
  const XLSX=require("xlsx");
  if (bytes.length>5*1024**2) fallo("El Excel de la plantilla supera el tamaño admitido.");
  const tipo=/\.xls$/i.test(ruta)?"application/vnd.ms-excel":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  require("./archivos-ot").contenidoArchivo(bytes.toString("base64"),tipo,[tipo]);
  let libro;
  try {libro=XLSX.read(bytes,{type:"buffer",dense:true});}
  catch (_) {fallo("No se pudo leer el Excel original de la plantilla.");}
  if (!libro.SheetNames.length || libro.SheetNames.length>50) fallo("El Excel debe tener entre 1 y 50 etapas.");
  const etapas=libro.SheetNames.map((nombre,i)=>{
    const hoja=libro.Sheets[nombre];
    const filas=XLSX.utils.sheet_to_json(hoja,{header:1}).flat().map(v=>String(v??"").trim()).filter(Boolean);
    if (!filas.length || filas.length>400 || filas.some(v=>v.length>240)) fallo(`La hoja ${nombre} debe tener entre 1 y 400 actividades, de hasta 240 caracteres.`);
    return {id:`e_${i}`,nombre,items:filas.map(item=>({item}))};
  });
  return {...plantilla,flujoVersion:2,etapas};
}
module.exports={prepararPlantilla};
