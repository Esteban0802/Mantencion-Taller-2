// Solo lectura: prepara el inventario de datos antiguos. Nunca escribe en Firebase.
const fs = require('node:fs');
const auth = require('firebase-tools/lib/auth');
const {requireAuth} = require('firebase-tools/lib/requireAuth');
const {Client} = require('firebase-tools/lib/apiv2');

(async()=>{
  const options={project:'overtrack-42387',nonInteractive:true};
  const cuenta=auth.getGlobalDefaultAccount();
  if(cuenta) auth.setActiveAccount(options,cuenta);
  await requireAuth(options);
  const api=new Client({urlPrefix:'https://firestore.googleapis.com',apiVersion:'v1'});
  const base='/projects/overtrack-42387/databases/(default)/documents';
  const valor=(d,k)=>d.fields?.[k]?.stringValue || '';
  async function listar(nombre){
    const resultado=[];let pageToken;
    do {
      const r=(await api.get(`${base}/${nombre}`,{queryParams:{pageSize:300,...(pageToken?{pageToken}:{})}})).body;
      resultado.push(...(r.documents||[]));pageToken=r.nextPageToken;
    }while(pageToken);
    return resultado;
  }
  const sucursales=await listar('sucursales');
  const usuarios=await listar('usuarios');
  const perfiles=new Map(usuarios.map(d=>[d.name.split('/').at(-1),d]));
  const colecciones=['sheqContratos','sheqVehiculos','sheqDocumentos','programaciones','programacionSemanas','programacionHistorial','programacionAusencias','programacionConfirmaciones','programacionPublicadaUsuarios'];
  const plan=[];const pendientes=[];const resumen={};
  for(const coleccion of colecciones){
    const docs=await listar(coleccion);resumen[coleccion]={total:docs.length,ajustes:0,ambiguos:0};
    for(const d of docs){
      const empresa=valor(d,'empresaId');let sucursal=valor(d,'sucursalId');
      if(!sucursal){
        const propias=sucursales.filter(s=>valor(s,'empresaId')===empresa);
        // Solo inferir automáticamente cuando no existe ninguna ambigüedad.
        if(propias.length===1) sucursal=propias[0].name.split('/').at(-1);
        else if(['programacionAusencias','programacionConfirmaciones','programacionPublicadaUsuarios'].includes(coleccion)){
          const perfil=perfiles.get(valor(d,'usuarioId'));
          if(valor(perfil||{},'empresaId')===empresa) sucursal=valor(perfil,'sucursalId');
        }
      }
      if(!sucursal){pendientes.push(d.name);resumen[coleccion].ambiguos++;continue;}
      const id=d.name.split('/').at(-1), semana=valor(d,'semanaInicio');
      const nuevoId=coleccion==='programacionSemanas'?`${empresa}_${sucursal}_${semana}`:
        coleccion==='programacionPublicadaUsuarios'?`${empresa}_${sucursal}_${semana}_${valor(d,'usuarioId')}`:id;
      if(!valor(d,'sucursalId') || nuevoId!==id){
        plan.push({origen:d.name,destino:d.name.slice(0,d.name.lastIndexOf('/')+1)+nuevoId,sucursalId:sucursal,original:d});
        resumen[coleccion].ajustes++;
      }
    }
  }
  fs.mkdirSync('tmp',{recursive:true});
  fs.writeFileSync('tmp/plan-aislamiento-sucursales.json',JSON.stringify({fecha:new Date().toISOString(),plan,pendientes},null,2));
  console.log(JSON.stringify({resumen,ajustes:plan.length,ambiguos:pendientes.length,soloLectura:true},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
