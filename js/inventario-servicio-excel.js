const clave = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
export const CAMPOS_SERVICIO_EXCEL = [
  ["cliente","Cliente",["cliente","nombrecliente"]],
  ["os","OS",["os","ot","numerodeos","numeroos","ordendeservicio","ordenservicio"]],
  ["equipo","Equipo",["equipo","maquina","modelo"]],
  ["serie","Serie",["serie","numeroserie","nserie"]],
  ["np","Número de parte",["np","numerodeparte","numeroparte","partnumber","codigo","codigorepuesto"]],
  ["descripcion","Descripción",["descripcion","descripcionrepuesto","repuesto","material"]],
  ["cantidad","Cantidad",["cantidad","cant","unidades","cantidadrecibida"]],
  ["fechaRecepcion","Fecha de recepción (referencia)",["fecharecepcion","fechaderecepcion"]],
  ["fechaIngreso","Fecha de ingreso (referencia)",["fechaingreso","fechadeingreso","fechaingresoainventario"]],
  ["recibio","Quién recibe (referencia)",["quienrecibe","recibe","recibidopor","receptor"]],
  ["fechaRetiro","Fecha de retiro (referencia)",["fecharetiro","fechaderetiro","fecharetirodeinventario"]],
  ["retira","Quién retira (referencia)",["quienretira","retira","retiradopor"]]
];
export function detectarColumnasServicio(fila) {
  return Object.fromEntries(CAMPOS_SERVICIO_EXCEL.map(([campo,,aliases])=>[campo,fila.findIndex(c=>aliases.includes(clave(c)))]));
}
export function detectarFilaServicio(filas) {
  let mejor=0,puntaje=-1;
  filas.slice(0,30).forEach((fila,i)=>{const m=detectarColumnasServicio(fila),p=CAMPOS_SERVICIO_EXCEL.slice(0,7).filter(([c])=>m[c]>=0).length;if(p>puntaje){mejor=i;puntaje=p;}});
  return mejor;
}
export function analizarFilasServicio(filas,mapeo,{filaInicial=2}={}) {
  if(!Array.isArray(filas) || filas.length>500)throw Error("Cada importación admite hasta 500 filas. Divide el archivo si contiene más registros.");
  const obligatorios=CAMPOS_SERVICIO_EXCEL.slice(0,7).map(([c])=>c);
  if(obligatorios.some(c=>!Number.isInteger(mapeo[c]) || mapeo[c]<0))throw Error("Asocia las siete columnas obligatorias: cliente, OS, equipo, serie, NP, descripción y cantidad.");
  const indices=obligatorios.map(c=>mapeo[c]);
  if(new Set(indices).size!==indices.length)throw Error("Cada columna obligatoria debe corresponder a una columna diferente del Excel.");
  const validas=[],errores=[];
  for(const [i,fila] of filas.entries()){
    if(!fila.some(v=>String(v ?? "").trim()))continue;
    const registro=Object.fromEntries(CAMPOS_SERVICIO_EXCEL.map(([c])=>[c,mapeo[c]>=0?String(fila[mapeo[c]] ?? "").trim():""]));
    const numero=filaInicial+i;
    const cantidadTexto=registro.cantidad;
    const cantidad=/^\d+$/.test(cantidadTexto)?Number(cantidadTexto):NaN;
    const faltantes=obligatorios.filter(c=>c!=="cantidad"&&!registro[c]);
    if(faltantes.length || !cantidadTexto || !Number.isSafeInteger(cantidad) || cantidad<1 || cantidad>1000000){
      errores.push({numero,mensaje:faltantes.length?`Falta ${faltantes.join(", ")}`:"Cantidad inválida: utiliza unidades enteras mayores que cero"});continue;
    }
    if(["cliente","os","equipo","serie"].some(c=>registro[c].length>180) || registro.np.length>100 || registro.descripcion.length>300 ||
      ["fechaRecepcion","fechaIngreso","recibio","fechaRetiro","retira"].some(c=>registro[c].length>180)){
      errores.push({numero,mensaje:"Uno de los textos supera el largo permitido"});continue;
    }
    validas.push({...registro,cantidad,numero});
  }
  if(!validas.length && !errores.length)throw Error("No hay filas con repuestos para importar.");
  return {validas,errores};
}
const hash = async texto => [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(texto)))].map(v=>v.toString(16).padStart(2,"0")).join("");
export async function prepararImportacionServicio(registros,{empresaId,sucursalId,archivo,hoja}) {
  const grupos=new Map();
  for(const r of registros){
    const key=JSON.stringify([r.cliente,r.os,r.equipo,r.serie].map(v=>v.trim().toLocaleLowerCase("es")));
    if(!grupos.has(key))grupos.set(key,[]);grupos.get(key).push(r);
  }
  if(grupos.size>100)throw Error("Cada importación admite hasta 100 OS. Divide el archivo en partes.");
  const ordenes=[];
  for(const [key,filas] of grupos){
    if(filas.length>100)throw Error(`La OS ${filas[0].os} supera los 100 repuestos permitidos.`);
    const r=filas[0],ordenId="excel-"+(await hash(JSON.stringify([empresaId,sucursalId,key]))).slice(0,48);
    const items=filas.map(f=>({np:f.np,descripcion:f.descripcion,cantidad:f.cantidad})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const detalle=[];for(const [i,item] of items.entries())detalle.push({...item,id:"i-"+(await hash(JSON.stringify([item,i]))).slice(0,40)});
    ordenes.push({accion:"crear",ordenId,cliente:r.cliente,os:r.os,equipo:r.equipo,serie:r.serie,items:detalle,
      referenciaExcel:{archivo,hoja,filas:filas.map(f=>Object.fromEntries(["numero","fechaRecepcion","fechaIngreso","recibio","fechaRetiro","retira"].map(k=>[k,f[k]])))}});
  }
  return ordenes;
}
