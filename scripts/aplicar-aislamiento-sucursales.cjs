const fs = require('node:fs');

function prepararEscrituras(plan) {
  if (plan.pendientes.length) throw new Error('Hay registros ambiguos pendientes de revisión.');
  return plan.plan.flatMap(item=>{
    const sucursalId={stringValue:item.sucursalId};
    const currentDocument={updateTime:item.original.updateTime};
    if(item.destino===item.origen) return [{
      update:{name:item.origen,fields:{sucursalId}},updateMask:{fieldPaths:['sucursalId']},currentDocument
    }];
    // Conservar el original como registro migrado evita duplicar semanas visibles.
    return [{update:{name:item.destino,fields:{...item.original.fields,sucursalId}},currentDocument:{exists:false}},
      {update:{name:item.origen,fields:{sucursalId,estado:{stringValue:'migrada'},migradoA:{stringValue:item.destino}}},
        updateMask:{fieldPaths:['sucursalId','estado','migradoA']},currentDocument}];
  });
}

async function main(){
  const plan=JSON.parse(fs.readFileSync('tmp/plan-aislamiento-sucursales.json','utf8'));
  const writes=prepararEscrituras(plan);
  if(writes.length>450) throw new Error('El plan necesita revisión por su tamaño; no se aplicó.');
  if(!process.argv.includes('--aplicar')) {
    console.log(JSON.stringify({soloSimulacion:true,registros:plan.plan.length,escrituras:writes.length}));return;
  }
  const auth=require('firebase-tools/lib/auth');
  const {requireAuth}=require('firebase-tools/lib/requireAuth');
  const {Client}=require('firebase-tools/lib/apiv2');
  const options={project:'overtrack-42387',nonInteractive:true};
  const cuenta=auth.getGlobalDefaultAccount();if(cuenta) auth.setActiveAccount(options,cuenta);
  await requireAuth(options);
  const api=new Client({urlPrefix:'https://firestore.googleapis.com',apiVersion:'v1'});
  // Un solo lote atómico. Si cualquier dato cambió desde la revisión, se rechaza todo.
  const respuesta=(await api.post('/projects/overtrack-42387/databases/(default)/documents:commit',{body:{writes}})).body;
  fs.writeFileSync('tmp/resultado-aislamiento-sucursales.json',JSON.stringify({fecha:new Date().toISOString(),resultado:respuesta},null,2));
  console.log(JSON.stringify({aplicado:true,escrituras:respuesta.writeResults.length}));
}
module.exports={prepararEscrituras};
if(require.main===module) main().catch(e=>{console.error(e.message);process.exitCode=1;});
