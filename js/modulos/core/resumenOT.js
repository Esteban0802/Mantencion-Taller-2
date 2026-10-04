import { db } from "../../firebase-config.js";
import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

function comentariosPendientes(comentarios = []) {
  return (Array.isArray(comentarios) ? comentarios : [])
    .filter(comentario =>
      ["jefe_taller", "admin_sucursal"].includes(comentario?.rol) &&
      comentario?.atendido !== true
    )
    .map(comentario => ({
      rol: comentario.rol,
      texto: String(comentario.texto || "").slice(0, 500),
      atendido: false
    }));
}

function resumirLista(lista = []) {
  return (Array.isArray(lista) ? lista : []).map(item => ({
    ok: item?.ok === true,
    comentarios: comentariosPendientes(item?.comentarios)
  }));
}

export function crearResumenOT(ot = {}) {
  return {
    empresaId: ot.empresaId || "",
    sucursalId: ot.sucursalId || "",
    os: ot.os || "",
    equipo: ot.equipo || "",
    serie: ot.serie || "",
    cliente: ot.cliente || "",
    estado: ot.estado || "INGRESO",
    cerrada: ot.cerrada === true,
    creadoPor: ot.creadoPor || "",
    creadoPorNombre: ot.creadoPorNombre || "",
    etapasHabilitadas: ot.etapasHabilitadas || {},
    ingresoAprobado: ot.ingresoAprobado === true,
    evaluacionAprobada: ot.evaluacionAprobada === true,
    overhaulAprobado: ot.overhaulAprobado === true,
    pruebasAprobado: ot.pruebasAprobado === true,
    overhaulRequerido: ot.overhaulRequerido !== false,
    alertaJefe: ot.alertaJefe === true,
    ingreso: resumirLista(ot.ingreso),
    evaluacion: resumirLista(ot.evaluacion),
    overhaul: resumirLista(ot.overhaul),
    pruebas: {
      general: resumirLista(ot.pruebas?.general),
      mecanico: resumirLista(ot.pruebas?.mecanico),
      electrico: resumirLista(ot.pruebas?.electrico)
    },
    despacho: ot.despacho ? {
      preparacion: resumirLista(ot.despacho.preparacion),
      final: resumirLista(ot.despacho.final),
      comentariosPreparacion: comentariosPendientes(ot.despacho.comentariosPreparacion),
      comentariosFinal: comentariosPendientes(ot.despacho.comentariosFinal)
    } : null,
    gantt: ot.gantt || null,
    fechaCreacion: ot.fechaCreacion || null,
    fechaActualizacion: ot.fechaActualizacion || null,
    revision: Math.max(0, Number(ot.revision || 0))
  };
}

export async function guardarResumenOT(otId, ot, opciones = {}) {
  if (!otId || !ot?.empresaId) return;
  const datos = crearResumenOT(ot);
  if (opciones.actualizarFecha !== false) datos.fechaActualizacion = serverTimestamp();
  await setDoc(doc(db, "otsResumen", otId), datos, { merge: false });
}

export async function asegurarResumenesOT(filtros = []) {
  const consultaOT = query(collection(db, "ots"), ...filtros);
  const consultaResumen = query(collection(db, "otsResumen"), ...filtros);
  const [conteoOT, conteoResumen] = await Promise.all([
    getCountFromServer(consultaOT),
    getCountFromServer(consultaResumen)
  ]);

  if (conteoOT.data().count === conteoResumen.data().count) return;

  const [otsSnap, resumenSnap] = await Promise.all([
    getDocs(consultaOT),
    getDocs(consultaResumen)
  ]);
  const idsOT = new Set(otsSnap.docs.map(item => item.id));

  const operaciones = [
    ...otsSnap.docs.map(item => ({ tipo: "set", referencia: doc(db, "otsResumen", item.id), datos: crearResumenOT(item.data()) })),
    ...resumenSnap.docs
      .filter(item => !idsOT.has(item.id))
      .map(item => ({ tipo: "delete", referencia: item.ref }))
  ];

  for (let inicio = 0; inicio < operaciones.length; inicio += 400) {
    const lote = writeBatch(db);
    operaciones.slice(inicio, inicio + 400).forEach(operacion => {
      if (operacion.tipo === "delete") lote.delete(operacion.referencia);
      else lote.set(operacion.referencia, operacion.datos, { merge: false });
    });
    await lote.commit();
  }
}
