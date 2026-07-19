// ===============================
// CONTEXTO GLOBAL OVERTRACK
// ===============================

let ot = null;
let listaOTs = [];

const NOMBRES_ETAPAS = {
    ingreso: "Ingreso",
    evaluacion: "Evaluación",
    overhaul: "Mantención",
    pruebasMecanicas: "Pruebas Mecánicas",
    pruebasElectricas: "Pruebas Eléctricas",
    despachoPreparacion: "Despacho Preparación",
    despachoFinal: "Despacho Final"
};

//===============================
// OT
//===============================

export function getOT() {
    return ot;
}

export function setOT(nuevaOT) {
    ot = nuevaOT;
}

//===============================
// LISTA OTS
//===============================

export function getListaOTs() {
    return listaOTs;
}

export function setListaOTs(lista) {
    listaOTs = lista;
}

//===============================
// ETAPAS
//===============================

export { NOMBRES_ETAPAS };