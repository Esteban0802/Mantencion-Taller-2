const { isDeepStrictEqual } = require("node:util");
const { validarEvidenciasOT } = require("./evidencias-ot");

const CAMPOS_ETAPAS = ["ingreso", "evaluacion", "overhaul", "pruebas", "despacho",
  "decisionEvaluacion", "decisionMantencion", "decisionPruebas", "decisionDespacho"];
const CAMPOS_RESPUESTA = ["atendido", "respuestaUsuario", "atendidoPor", "atendidoPorUid", "fechaAtendido"];

function etapasOT(datos = {}) {
  return Object.fromEntries(CAMPOS_ETAPAS.map(campo => [campo, datos[campo] ?? null]));
}

function listasComentarios(datos) {
  const listas = new Map();
  function recorrer(valor, ruta, profundidad = 0) {
    if (profundidad > 25) throw new Error("Estructura de etapas demasiado profunda.");
    if (!valor || typeof valor !== "object") return;
    for (const [clave, contenido] of Object.entries(valor)) {
      const destino = `${ruta}/${clave}`;
      if (["comentarios", "comentariosPreparacion", "comentariosFinal"].includes(clave)) {
        if (!Array.isArray(contenido)) throw new Error("La lista de comentarios no es válida.");
        if (contenido.some(item => !item || typeof item !== "object" || Array.isArray(item))) {
          throw new Error("El comentario no es válido.");
        }
        listas.set(destino, contenido);
      } else recorrer(contenido, destino, profundidad + 1);
    }
  }
  recorrer(etapasOT(datos), "");
  return listas;
}

function sinRespuesta(comentario) {
  return Object.fromEntries(Object.entries(comentario).filter(([clave]) => !CAMPOS_RESPUESTA.includes(clave)));
}

function respuestaPermitida(anterior, nuevo, usuario) {
  return ["tecnico", "supervisor"].includes(usuario.rol) &&
    ["jefe_taller", "admin_sucursal"].includes(anterior.rol) &&
    anterior.atendido !== true && nuevo.atendido === true &&
    nuevo.atendidoPorUid === usuario.uid &&
    typeof nuevo.respuestaUsuario === "string" && nuevo.respuestaUsuario.trim().length > 0 &&
    typeof nuevo.atendidoPor === "string" && typeof nuevo.fechaAtendido === "string" &&
    isDeepStrictEqual(sinRespuesta(anterior), sinRespuesta(nuevo));
}

// No se confía en los UID o roles enviados por el navegador. Los comentarios
// ajenos (incluidos los antiguos sin autor) deben conservarse, salvo la
// respuesta explícita a una observación pendiente del jefe.
function validarComentariosOT(anterior, nuevo, usuario) {
  const antes = listasComentarios(anterior);
  const despues = listasComentarios(nuevo);
  for (const ruta of new Set([...antes.keys(), ...despues.keys()])) {
    const originales = antes.get(ruta) || [];
    const restantes = [...(despues.get(ruta) || [])];
    for (const comentario of originales) {
      if (comentario.creadoPorUid === usuario.uid) continue;
      const indice = restantes.findIndex(item => isDeepStrictEqual(comentario, item) ||
        respuestaPermitida(comentario, item, usuario));
      if (indice < 0) throw new Error("No puedes modificar ni eliminar comentarios de otros usuarios.");
      restantes.splice(indice, 1);
    }
    for (const comentario of restantes) {
      if (comentario.creadoPorUid === usuario.uid && originales.some(item => isDeepStrictEqual(item, comentario))) continue;
      if (comentario.creadoPorUid !== usuario.uid || comentario.rol !== usuario.rol ||
          typeof comentario.texto !== "string" || !comentario.texto.trim()) {
        throw new Error("Solo puedes crear o modificar comentarios con tu propia autoría.");
      }
      // Las respuestas ajenas tampoco se pueden reescribir editando el
      // comentario del que se es autor.
      const respuesta = comentario.respuestaUsuario || "";
      if (respuesta && !originales.some(item => item.creadoPorUid === usuario.uid &&
          CAMPOS_RESPUESTA.every(campo => isDeepStrictEqual(item[campo], comentario[campo])))) {
        throw new Error("No puedes modificar la respuesta de otro usuario.");
      }
    }
  }
}

function observacionesPendientes(etapas) {
  return [...listasComentarios(etapas).values()].some(lista => lista.some(comentario =>
    ["jefe_taller", "admin_sucursal"].includes(comentario.rol) && comentario.atendido !== true));
}

async function autorizarEtapasOT({ db, usuario, otId, etapas, empresaId, sucursalId, venceEn, evidencias }) {
  const referencia = db.collection("ots").doc(otId);
  const autorizacion = referencia.collection("validacionesComentarios").doc(usuario.uid).collection("versiones");
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(referencia);
    const anterior = snapshot.exists ? snapshot.data() : {};
    const alcance = snapshot.exists ? anterior : { empresaId, sucursalId };
    if (!["jefe_taller", "supervisor", "tecnico"].includes(usuario.rol) ||
        !usuario.empresaId || !usuario.sucursalId || usuario.empresaId !== alcance.empresaId ||
        usuario.sucursalId !== alcance.sucursalId || (!snapshot.exists && usuario.rol !== "jefe_taller") ||
        anterior.cerrada === true || String(anterior.estado || "").toUpperCase() === "CERRADA") {
      throw new Error("No puedes modificar los comentarios de esta OT.");
    }
    const siguientes = etapasOT(etapas);
    validarComentariosOT(anterior, siguientes, usuario);
    await validarEvidenciasOT(etapasOT(anterior), siguientes, usuario, { ...evidencias, otId });
    // Dos documentos evitan duplicar el tamaño de una OT en un solo documento.
    // Las reglas comparan ambos estados completos para impedir reusar una
    // autorización tras cambios concurrentes o sustituir otra parte de la etapa.
    transaction.set(autorizacion.doc("anterior"), { etapas: etapasOT(anterior), venceEn });
    transaction.set(autorizacion.doc("nueva"), { etapas: siguientes, alertaJefe: observacionesPendientes(siguientes), venceEn });
  });
}

module.exports = { CAMPOS_ETAPAS, etapasOT, validarComentariosOT, autorizarEtapasOT };
