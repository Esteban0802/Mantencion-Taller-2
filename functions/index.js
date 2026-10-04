const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onObjectFinalized, onObjectDeleted } = require("firebase-functions/storage");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const crypto = require("node:crypto");

initializeApp();

const db = getFirestore();
const auth = getAuth();
const bucket = getStorage().bucket();
const REGION = "us-central1";
const CALLABLE_OPTIONS = {
  region: REGION,
  maxInstances: 10,
  timeoutSeconds: 60
};
const ROLES_EMPRESA = [
  "admin_empresa",
  "admin_sucursal",
  "jefe_taller",
  "usuario_taller",
  "supervisor",
  "tecnico",
  "planificador",
  "bodeguero",
  "sheq"
];
const ESTADOS_EMPRESA_SOLO_LECTURA = new Set([
  "cancelacion_solicitada",
  "periodo_exportacion",
  "pendiente_eliminacion",
  "cancelada"
]);

function texto(valor, maximo = 180) {
  return String(valor || "").trim().slice(0, maximo);
}

function correoValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

function passwordTemporal() {
  const mayusculas = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const minusculas = "abcdefghijkmnopqrstuvwxyz";
  const numeros = "23456789";
  const especiales = "!@#$%";
  const todos = mayusculas + minusculas + numeros + especiales;
  const tomar = grupo => grupo[crypto.randomInt(0, grupo.length)];
  const caracteres = [
    tomar(mayusculas),
    tomar(minusculas),
    tomar(numeros),
    tomar(especiales)
  ];
  while (caracteres.length < 14) caracteres.push(tomar(todos));
  for (let i = caracteres.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join("");
}

function permisosPorRol(rol) {
  if (rol === "admin_empresa") {
    return {
      crearOS: false, cargarChecklist: false, aprobarIngreso: false,
      aprobarEvaluacion: false, aprobarMantencion: false,
      aprobarPruebas: false, cerrarOS: false,
      administrarUsuarios: true, administrarEmpresa: true
    };
  }
  if (rol === "admin_sucursal") {
    return {
      crearOS: true, cargarChecklist: true, aprobarIngreso: true,
      aprobarEvaluacion: true, aprobarMantencion: true,
      aprobarPruebas: true, cerrarOS: true,
      administrarUsuarios: true, administrarSucursal: true
    };
  }
  if (rol === "jefe_taller") {
    return {
      crearOS: true, cargarChecklist: true, aprobarIngreso: true,
      aprobarEvaluacion: true, aprobarMantencion: true,
      aprobarPruebas: true, cerrarOS: true, administrarUsuarios: false
    };
  }
  if (rol === "planificador") {
    return { crearOS: false, cargarChecklist: false, aprobarIngreso: false,
      aprobarEvaluacion: false, aprobarMantencion: false, aprobarPruebas: false,
      cerrarOS: false, administrarUsuarios: false, administrarProgramacion: true,
      administrarInventario: true };
  }
  if (rol === "bodeguero") {
    return { crearOS: false, cargarChecklist: false, aprobarIngreso: false,
      aprobarEvaluacion: false, aprobarMantencion: false, aprobarPruebas: false,
      cerrarOS: false, administrarUsuarios: false, administrarInventario: true };
  }
  return {
    crearOS: true, cargarChecklist: true, aprobarIngreso: false,
    aprobarEvaluacion: false, aprobarMantencion: false,
    aprobarPruebas: false, cerrarOS: false, administrarUsuarios: false
  };
}

async function obtenerSolicitante(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const snap = await db.collection("usuarios").doc(request.auth.uid).get();
  if (!snap.exists || snap.data().activo !== true) {
    throw new HttpsError("permission-denied", "La cuenta no está activa.");
  }
  return { uid: request.auth.uid, ...snap.data() };
}

function puedeAdministrarEmpresa(solicitante, empresaId) {
  return solicitante.rol === "super_admin" ||
    (solicitante.rol === "admin_empresa" && solicitante.empresaId === empresaId) ||
    (solicitante.rol === "admin_sucursal" && solicitante.empresaId === empresaId);
}

function empresaPermiteOperacion(empresa) {
  const estado = texto(empresa?.suscripcion?.estado, 60);
  return !ESTADOS_EMPRESA_SOLO_LECTURA.has(estado);
}

async function exigirEmpresaOperativa(empresaId, solicitante) {
  const empresaSnap = await db.collection("empresas").doc(empresaId).get();
  if (!empresaSnap.exists) {
    throw new HttpsError("not-found", "La empresa no existe.");
  }
  if (solicitante?.rol !== "super_admin" &&
      (!empresaPermiteOperacion(empresaSnap.data()) || empresaSnap.data().activa === false)) {
    throw new HttpsError(
      "failed-precondition",
      "La empresa se encuentra en periodo de cancelación y solo permite consultar o exportar información."
    );
  }
  return empresaSnap;
}

function validarRolCreable(solicitante, rol) {
  if (!ROLES_EMPRESA.includes(rol)) {
    throw new HttpsError("invalid-argument", "El rol solicitado no es válido.");
  }
  if (solicitante.rol === "admin_sucursal" &&
      ["admin_empresa", "admin_sucursal"].includes(rol)) {
    throw new HttpsError("permission-denied", "No puedes asignar ese rol.");
  }
}

async function registrarAuditoria({ solicitante, empresaId, accion, objetivoId, detalle }) {
  await db.collection("logsSistema").add({
    empresaId: empresaId || "",
    usuarioId: solicitante.uid,
    usuarioNombre: solicitante.nombreCompleto || solicitante.nombre || solicitante.correo || "Usuario",
    rol: solicitante.rol,
    accion,
    objetivoId: objetivoId || "",
    detalle: detalle || "",
    fecha: FieldValue.serverTimestamp()
  });
}

async function validarCupoUsuariosEmpresa(empresaId, solicitante) {
  const [empresaSnap, usuariosSnap] = await Promise.all([
    db.collection("empresas").doc(empresaId).get(),
    db.collection("usuarios").where("empresaId", "==", empresaId).get()
  ]);

  if (!empresaSnap.exists || empresaSnap.data().activa === false) {
    throw new HttpsError("failed-precondition", "La empresa no está disponible.");
  }
  if (solicitante?.rol !== "super_admin" && !empresaPermiteOperacion(empresaSnap.data())) {
    throw new HttpsError(
      "failed-precondition",
      "La empresa se encuentra en periodo de cancelación y no permite crear o activar usuarios."
    );
  }

  const maxUsuarios = Number(empresaSnap.data().maxUsuarios || 0);
  const usuariosActivos = usuariosSnap.docs.filter(documento => {
    const usuario = documento.data();
    return usuario.activo !== false || usuario.suspendidoPorSucursal === true;
  }).length;

  if (maxUsuarios > 0 && usuariosActivos >= maxUsuarios) {
    throw new HttpsError(
      "resource-exhausted",
      `El plan permite un máximo de ${maxUsuarios} usuarios activos. Desactiva una cuenta o amplía el plan para continuar.`
    );
  }

  return { empresaSnap, usuariosActivos, maxUsuarios };
}

async function documentosDeEmpresa(coleccion, empresaId) {
  const snap = await db.collection(coleccion)
    .where("empresaId", "==", empresaId)
    .get();
  return snap.docs;
}

function valorExportable(valor) {
  if (valor === null || valor === undefined) return valor ?? null;
  if (typeof valor?.toDate === "function") return valor.toDate().toISOString();
  if (Array.isArray(valor)) return valor.map(valorExportable);
  if (typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([clave, item]) => [clave, valorExportable(item)]));
  }
  return valor;
}

function nombreSeguro(valor, respaldo = "registro") {
  const limpio = String(valor || respaldo).normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ").trim().slice(0, 120);
  return limpio || respaldo;
}

function celdaCsv(valor) {
  let salida = valor === null || valor === undefined ? "" :
    typeof valor === "object" ? JSON.stringify(valorExportable(valor)) : String(valor);
  if (/^[=+\-@]/.test(salida)) salida = `'${salida}`;
  return `"${salida.replace(/"/g, '""')}"`;
}

function documentosACsv(documentos) {
  if (!documentos.length) return "id\r\n";
  const filas = documentos.map(item => ({ id: item.id, ...valorExportable(item.data()) }));
  const columnas = [...new Set(filas.flatMap(item => Object.keys(item)))];
  return `\uFEFF${columnas.map(celdaCsv).join(",")}\r\n${filas
    .map(fila => columnas.map(columna => celdaCsv(fila[columna])).join(",")).join("\r\n")}\r\n`;
}

function jsonDocumentos(documentos) {
  return JSON.stringify(documentos.map(item => ({ id: item.id, ...valorExportable(item.data()) })), null, 2);
}

function valorPrimero(objeto, claves) {
  for (const clave of claves) {
    const valor = objeto?.[clave];
    if (valor === undefined || valor === null || valor === "") continue;
    if (typeof valor === "object" && Number.isFinite(Number(valor.seconds))) {
      return new Date((Number(valor.seconds) * 1000) + Math.floor(Number(valor.nanoseconds || 0) / 1000000))
        .toLocaleString("es-CL", { timeZone: "America/Santiago" });
    }
    if (typeof valor === "object") continue;
    if (String(valor).trim()) return String(valor);
  }
  return "-";
}

function etiquetaObservacion(ruta) {
  if (/^bitacora\[/i.test(ruta)) return "Registro de actividad";
  if (/^repuestos\.items\[.*\]\.descripcion$/i.test(ruta)) return "Repuesto registrado";
  if (/^decisionEvaluacion\.resultado$/i.test(ruta)) return "Resultado de evaluación";
  if (/^decisionEvaluacion\.comentario$/i.test(ruta)) return "Comentario de evaluación";
  const etapa = ruta.match(/^(ingreso|evaluacion|overhaul|pruebas|despacho)/i)?.[1];
  if (etapa) {
    const nombres = { ingreso: "Ingreso", evaluacion: "Evaluación", overhaul: "Mantención", pruebas: "Pruebas", despacho: "Despacho" };
    return `Comentario de ${nombres[etapa.toLowerCase()] || etapa}`;
  }
  return "Observación";
}

function recolectarObservaciones(objeto, ruta = "", salida = [], profundidad = 0) {
  if (!objeto || profundidad > 5 || salida.length >= 80) return salida;
  if (Array.isArray(objeto)) {
    objeto.forEach((item, indice) => recolectarObservaciones(item, `${ruta}[${indice + 1}]`, salida, profundidad + 1));
    return salida;
  }
  if (typeof objeto !== "object") return salida;
  Object.entries(objeto).forEach(([clave, valor]) => {
    if (salida.length >= 80) return;
    const nuevaRuta = ruta ? `${ruta}.${clave}` : clave;
    if (typeof valor === "string" && valor.trim() &&
        /(coment|observ|detalle|descripcion|resultado|respuesta|motivo)/i.test(clave) &&
        !/^https?:\/\//i.test(valor)) {
      salida.push({ etiqueta: nuevaRuta, valor: valor.trim().slice(0, 900) });
    } else if (valor && typeof valor === "object") {
      recolectarObservaciones(valor, nuevaRuta, salida, profundidad + 1);
    }
  });
  return salida;
}

function crearResumenPdfOt(ot, empresa, sucursalNombre = "-") {
  return new Promise((resolve, reject) => {
    const PDFDocument = require("pdfkit");
    const docPdf = new PDFDocument({ size: "A4", margin: 48, bufferPages: true, info: { Title: `Resumen OT ${ot.id}` } });
    const partes = [];
    docPdf.on("data", parte => partes.push(parte));
    docPdf.on("end", () => resolve(Buffer.concat(partes)));
    docPdf.on("error", reject);

    const azul = "#1565c0";
    docPdf.fillColor(azul).fontSize(20).text("Vectaria", { continued: false });
    docPdf.fillColor("#102033").fontSize(16).text("Resumen de Orden de Trabajo", { align: "right" });
    docPdf.moveDown(1).strokeColor("#cbd8e3").moveTo(48, docPdf.y).lineTo(547, docPdf.y).stroke().moveDown();
    const campos = [
      ["Empresa", empresa.nombre || "-"],
      ["Número de OT", valorPrimero(ot, ["os", "numeroOT", "numeroOt", "codigo", "folio"])],
      ["Identificador", ot.id],
      ["Equipo", valorPrimero(ot, ["equipo", "nombreEquipo", "maquina"])],
      ["Serie", valorPrimero(ot, ["serie", "numeroSerie"])],
      ["Gama", valorPrimero(ot, ["gamaEquipo", "gama", "gamaNombre"])],
      ["Cliente", valorPrimero(ot, ["cliente", "clienteNombre"])],
      ["Sucursal", valorPrimero(ot, ["sucursalNombre", "sucursal"]) === "-" ? sucursalNombre : valorPrimero(ot, ["sucursalNombre", "sucursal"])],
      ["Estado", valorPrimero(ot, ["estado"])],
      ["Creación", valorPrimero(valorExportable(ot), ["fechaCreacion", "creadaEn"])],
      ["Cierre", valorPrimero(valorExportable(ot), ["fechaCierre", "cerradaEn"])]
    ];
    campos.forEach(([etiqueta, valor]) => {
      docPdf.font("Helvetica-Bold").fontSize(9).fillColor("#4a6478").text(`${etiqueta}:`, { continued: true });
      docPdf.font("Helvetica").fillColor("#102033").text(` ${valor}`);
    });
    const observaciones = recolectarObservaciones(ot);
    if (observaciones.length) {
      docPdf.moveDown().font("Helvetica-Bold").fontSize(13).fillColor(azul).text("Comentarios y observaciones");
      observaciones.forEach(item => {
        if (docPdf.y > 730) docPdf.addPage();
        docPdf.moveDown(.35).font("Helvetica-Bold").fontSize(8).fillColor("#4a6478").text(etiquetaObservacion(item.etiqueta));
        docPdf.font("Helvetica").fontSize(9).fillColor("#102033").text(item.valor);
      });
    }
    docPdf.moveDown().fontSize(8).fillColor("#6b7f90")
      .text("Este documento es un resumen de exportación. El respaldo íntegro en JSON y los archivos originales se incluyen en la misma carpeta de la OT.");
    const paginas = docPdf.bufferedPageRange();
    for (let indice = paginas.start; indice < paginas.start + paginas.count; indice += 1) {
      docPdf.switchToPage(indice);
      const margenInferiorOriginal = docPdf.page.margins.bottom;
      docPdf.page.margins.bottom = 0;
      docPdf.font("Helvetica").fontSize(8).fillColor("#8295a5")
        .text(`Vectaria · Página ${indice + 1} de ${paginas.count}`, 48, docPdf.page.height - 28, {
          width: docPdf.page.width - 96,
          align: "center",
          lineBreak: false
        });
      docPdf.page.margins.bottom = margenInferiorOriginal;
    }
    docPdf.end();
  });
}

async function anexarArchivosStorage(zip, prefijo, carpetaDestino) {
  const [archivos] = await bucket.getFiles({ prefix: prefijo });
  let cantidad = 0;
  for (const archivo of archivos) {
    if (!archivo.name || archivo.name.endsWith("/")) continue;
    const relativa = archivo.name.slice(prefijo.length).split("/")
      .filter(Boolean).map(segmento => nombreSeguro(segmento, "archivo")).join("/");
    if (!relativa) continue;
    zip.append(archivo.createReadStream(), { name: `${carpetaDestino}/${relativa}` });
    cantidad += 1;
  }
  return cantidad;
}

async function eliminarDocumentosRecursivamente(documentos) {
  for (const documento of documentos) {
    await db.recursiveDelete(documento.ref);
  }
}

async function eliminarCuentasUsuarios(documentosUsuarios) {
  const uids = documentosUsuarios.map(documento => documento.id);
  for (let inicio = 0; inicio < uids.length; inicio += 1000) {
    const lote = uids.slice(inicio, inicio + 1000);
    if (!lote.length) continue;
    const resultado = await auth.deleteUsers(lote);
    const erroresReales = resultado.errors.filter(item =>
      item.error?.code !== "auth/user-not-found"
    );
    if (erroresReales.length) {
      console.error("eliminarCuentasUsuarios", erroresReales);
      throw new HttpsError("internal", "No fue posible eliminar todas las cuentas de acceso.");
    }
  }
}

async function empresaIdDesdeRutaStorage(ruta) {
  const partes = String(ruta || "").split("/").filter(Boolean);
  if (partes[0] === "empresas" && partes[1]) return partes[1];
  if (partes[0] === "ots" && partes[1]) {
    const otSnap = await db.collection("ots").doc(partes[1]).get();
    return otSnap.exists ? texto(otSnap.data().empresaId, 128) : "";
  }
  return "";
}

async function registrarCambioStorage(evento, signo) {
  const archivo = evento.data;
  const empresaId = await empresaIdDesdeRutaStorage(archivo.name);
  const bytes = Math.max(0, Number(archivo.size || 0));
  if (!empresaId || !bytes || !evento.id) return;

  const empresaRef = db.collection("empresas").doc(empresaId);
  const eventoId = crypto.createHash("sha256").update(evento.id).digest("hex");
  const eventoRef = db.collection("eventosStorage").doc(eventoId);

  await db.runTransaction(async transaction => {
    const [empresaSnap, eventoSnap] = await Promise.all([
      transaction.get(empresaRef),
      transaction.get(eventoRef)
    ]);
    if (!empresaSnap.exists || eventoSnap.exists) return;

    const usadoActual = Math.max(0, Number(empresaSnap.data().storageUsadoBytes || 0));
    const archivosActuales = Math.max(0, Number(empresaSnap.data().storageArchivos || 0));
    const nuevoUso = Math.max(0, usadoActual + (signo * bytes));
    transaction.update(empresaRef, {
      storageUsadoBytes: nuevoUso,
      storageArchivos: Math.max(0, archivosActuales + signo),
      storageActualizadoEn: FieldValue.serverTimestamp()
    });
    transaction.set(eventoRef, {
      empresaId,
      ruta: texto(archivo.name, 500),
      bytes,
      tipo: signo > 0 ? "archivo_creado" : "archivo_eliminado",
      fecha: FieldValue.serverTimestamp()
    });
  });
}

exports.contabilizarArchivoCreado = onObjectFinalized(
  { region: REGION, maxInstances: 5 },
  evento => registrarCambioStorage(evento, 1)
);

exports.contabilizarArchivoEliminado = onObjectDeleted(
  { region: REGION, maxInstances: 5 },
  evento => registrarCambioStorage(evento, -1)
);

exports.crearUsuarioEmpresa = onCall(CALLABLE_OPTIONS, async request => {
  const solicitante = await obtenerSolicitante(request);
  const empresaId = texto(request.data?.empresaId, 80);
  const rol = texto(request.data?.rol, 40);
  const nombre = texto(request.data?.nombre, 80);
  const apellido = texto(request.data?.apellido, 80);
  const correo = texto(request.data?.correo, 160).toLowerCase();
  const sucursalId = texto(request.data?.sucursalId, 100);

  if (!empresaId || !nombre || !correoValido(correo)) {
    throw new HttpsError("invalid-argument", "Nombre, correo y empresa son obligatorios.");
  }
  if (!puedeAdministrarEmpresa(solicitante, empresaId)) {
    throw new HttpsError("permission-denied", "No puedes administrar esta empresa.");
  }
  validarRolCreable(solicitante, rol);

  await validarCupoUsuariosEmpresa(empresaId, solicitante);

  if (solicitante.rol === "admin_sucursal" &&
      (!sucursalId || solicitante.sucursalId !== sucursalId)) {
    throw new HttpsError("permission-denied", "Solo puedes crear usuarios en tu sucursal.");
  }

  if (sucursalId) {
    const sucursalSnap = await db.collection("sucursales").doc(sucursalId).get();
    if (!sucursalSnap.exists || sucursalSnap.data().empresaId !== empresaId) {
      throw new HttpsError("invalid-argument", "La sucursal no pertenece a la empresa.");
    }
  }

  const temporal = passwordTemporal();
  let cuenta;
  try {
    cuenta = await auth.createUser({
      email: correo,
      password: temporal,
      displayName: `${nombre} ${apellido}`.trim(),
      disabled: false
    });
    await db.collection("usuarios").doc(cuenta.uid).set({
      uid: cuenta.uid,
      empresaId,
      sucursalId,
      nombre,
      apellido,
      nombreCompleto: `${nombre} ${apellido}`.trim(),
      correo,
      telefono: "",
      cargo: "",
      rol,
      foto: "",
      activo: true,
      debeCambiarPassword: true,
      primerIngreso: true,
      creadoPor: solicitante.uid,
      creadoPorNombre: solicitante.nombreCompleto || solicitante.nombre || "Administrador",
      fechaCreacion: FieldValue.serverTimestamp(),
      fechaActualizacion: FieldValue.serverTimestamp(),
      ultimoAcceso: null,
      permisos: permisosPorRol(rol)
    });
  } catch (error) {
    if (cuenta?.uid) await auth.deleteUser(cuenta.uid).catch(() => {});
    if (error?.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "El correo ya está registrado.");
    }
    console.error("crearUsuarioEmpresa", error);
    throw new HttpsError("internal", "No fue posible crear el usuario.");
  }

  await registrarAuditoria({
    solicitante, empresaId, accion: "usuario_creado",
    objetivoId: cuenta.uid, detalle: `${correo} (${rol})`
  });
  return { uid: cuenta.uid, correo, passwordTemporal: temporal };
});

exports.crearSucursalEmpresa = onCall(CALLABLE_OPTIONS, async request => {
  const solicitante = await obtenerSolicitante(request);
  if (solicitante.rol === "admin_sucursal") {
    throw new HttpsError(
      "permission-denied",
      "Solo el administrador de empresa puede crear sucursales."
    );
  }
  const empresaId = texto(request.data?.empresaId, 80);
  const nombre = texto(request.data?.nombre, 120);
  const codigo = texto(request.data?.codigo, 40).toUpperCase();
  const ciudad = texto(request.data?.ciudad, 100);
  const direccion = texto(request.data?.direccion, 180);
  const telefono = texto(request.data?.telefono, 40);

  if (!empresaId || !nombre || !codigo || !ciudad) {
    throw new HttpsError(
      "invalid-argument",
      "Empresa, nombre, código y ciudad son obligatorios."
    );
  }
  if (!puedeAdministrarEmpresa(solicitante, empresaId)) {
    throw new HttpsError("permission-denied", "No puedes administrar esta empresa.");
  }

  const empresaSnap = await exigirEmpresaOperativa(empresaId, solicitante);

  const sucursalesRef = db.collection("sucursales");
  const [sucursalesSnap, codigoSnap] = await Promise.all([
    sucursalesRef.where("empresaId", "==", empresaId).get(),
    sucursalesRef
      .where("empresaId", "==", empresaId)
      .where("codigo", "==", codigo)
      .limit(1)
      .get()
  ]);
  const maxSucursales = Number(empresaSnap.data().maxSucursales || 0);
  if (maxSucursales > 0 && sucursalesSnap.size >= maxSucursales) {
    throw new HttpsError(
      "resource-exhausted",
      `La empresa alcanzó el máximo de ${maxSucursales} sucursales de su plan.`
    );
  }
  if (!codigoSnap.empty) {
    throw new HttpsError("already-exists", "Ya existe una sucursal con ese código.");
  }

  const sucursalRef = sucursalesRef.doc();
  await sucursalRef.set({
    empresaId,
    nombre,
    codigo,
    ciudad,
    direccion,
    telefono,
    activa: true,
    creadoPor: solicitante.uid,
    fechaCreacion: FieldValue.serverTimestamp(),
    fechaActualizacion: FieldValue.serverTimestamp()
  });
  await registrarAuditoria({
    solicitante,
    empresaId,
    accion: "sucursal_creada",
    objetivoId: sucursalRef.id,
    detalle: `${nombre} (${codigo})`
  });

  return { id: sucursalRef.id };
});

exports.cambiarEstadoSucursal = onCall(CALLABLE_OPTIONS, async request => {
  const solicitante = await obtenerSolicitante(request);
  const sucursalId = texto(request.data?.sucursalId, 100);
  const activa = request.data?.activa === true;

  if (!sucursalId) {
    throw new HttpsError("invalid-argument", "Falta la sucursal.");
  }
  if (!["super_admin", "admin_empresa"].includes(solicitante.rol)) {
    throw new HttpsError(
      "permission-denied",
      "Solo el administrador de empresa puede cambiar el estado de una sucursal."
    );
  }

  const sucursalRef = db.collection("sucursales").doc(sucursalId);
  const sucursalSnap = await sucursalRef.get();
  if (!sucursalSnap.exists) {
    throw new HttpsError("not-found", "La sucursal no existe.");
  }

  const sucursal = sucursalSnap.data();
  if (solicitante.rol === "admin_empresa" &&
      solicitante.empresaId !== sucursal.empresaId) {
    throw new HttpsError(
      "permission-denied",
      "No puedes administrar sucursales de otra empresa."
    );
  }
  await exigirEmpresaOperativa(sucursal.empresaId, solicitante);
  if (sucursal.activa === activa) {
    return { ok: true, activa, sinCambios: true };
  }

  if (!activa) {
    const otsSnap = await db.collection("ots")
      .where("sucursalId", "==", sucursalId)
      .get();
    const otsAbiertas = otsSnap.docs.filter(documento => {
      const ot = documento.data();
      return ot.empresaId === sucursal.empresaId &&
        ot.cerrada !== true &&
        ot.estado !== "CERRADA";
    });

    if (otsAbiertas.length) {
      throw new HttpsError(
        "failed-precondition",
        `No puedes desactivar esta sucursal porque tiene ${otsAbiertas.length} OT abierta(s).`
      );
    }
  }

  const usuariosSnap = await db.collection("usuarios")
    .where("sucursalId", "==", sucursalId)
    .get();
  const usuariosSucursal = usuariosSnap.docs.filter(
    documento => documento.data().empresaId === sucursal.empresaId
  );

  const usuariosACambiar = usuariosSucursal.filter(documento => {
    const usuario = documento.data();
    return activa
      ? usuario.suspendidoPorSucursal === true
      : usuario.activo === true;
  });

  if (activa) {
    await sucursalRef.update({
      activa: true,
      fechaActualizacion: FieldValue.serverTimestamp(),
      actualizadoPor: solicitante.uid
    });
  }

  for (let inicio = 0; inicio < usuariosACambiar.length; inicio += 400) {
    const batch = db.batch();
    usuariosACambiar.slice(inicio, inicio + 400).forEach(documento => {
      batch.update(documento.ref, {
        activo: activa,
        suspendidoPorSucursal: !activa,
        fechaActualizacion: FieldValue.serverTimestamp(),
        actualizadoPor: solicitante.uid
      });
    });
    await batch.commit();
  }

  for (let inicio = 0; inicio < usuariosACambiar.length; inicio += 20) {
    await Promise.all(usuariosACambiar.slice(inicio, inicio + 20).map(async documento => {
      await auth.updateUser(documento.id, { disabled: !activa });
      if (!activa) await auth.revokeRefreshTokens(documento.id);
    }));
  }

  if (!activa) {
    await sucursalRef.update({
      activa: false,
      fechaActualizacion: FieldValue.serverTimestamp(),
      actualizadoPor: solicitante.uid
    });
  }

  await registrarAuditoria({
    solicitante,
    empresaId: sucursal.empresaId,
    accion: activa ? "sucursal_activada" : "sucursal_desactivada",
    objetivoId: sucursalId,
    detalle: sucursal.nombre || sucursal.codigo || sucursalId
  });

  return { ok: true, activa };
});

exports.recalcularAlmacenamientoEmpresa = onCall(
  { ...CALLABLE_OPTIONS, timeoutSeconds: 300, memory: "512MiB", maxInstances: 2 },
  async request => {
    const solicitante = await obtenerSolicitante(request);
    const empresaId = texto(request.data?.empresaId, 128);
    if (!empresaId || !puedeAdministrarEmpresa(solicitante, empresaId)) {
      throw new HttpsError("permission-denied", "No puedes consultar esta empresa.");
    }

    const empresaRef = db.collection("empresas").doc(empresaId);
    const empresaSnap = await empresaRef.get();
    if (!empresaSnap.exists) {
      throw new HttpsError("not-found", "La empresa no existe.");
    }

    const otsSnap = await db.collection("ots")
      .where("empresaId", "==", empresaId)
      .get();
    const prefijos = [
      `empresas/${empresaId}/`,
      ...otsSnap.docs.map(documento => `ots/${documento.id}/`)
    ];
    let totalBytes = 0;
    let totalArchivos = 0;
    const rutasContadas = new Set();

    for (const prefix of prefijos) {
      const [archivos] = await bucket.getFiles({ prefix });
      for (const archivo of archivos) {
        if (rutasContadas.has(archivo.name)) continue;
        rutasContadas.add(archivo.name);
        totalBytes += Math.max(0, Number(archivo.metadata?.size || 0));
        totalArchivos += 1;
      }
    }

    await empresaRef.update({
      storageUsadoBytes: totalBytes,
      storageArchivos: totalArchivos,
      storageActualizadoEn: FieldValue.serverTimestamp(),
      storageRecalculadoPor: solicitante.uid
    });
    await registrarAuditoria({
      solicitante,
      empresaId,
      accion: "storage_recalculado",
      objetivoId: empresaId,
      detalle: `${totalArchivos} archivo(s), ${totalBytes} byte(s)`
    });

    return { totalBytes, totalArchivos };
  }
);

exports.cambiarEstadoUsuario = onCall(CALLABLE_OPTIONS, async request => {
  const solicitante = await obtenerSolicitante(request);
  const usuarioId = texto(request.data?.usuarioId, 128);
  const activo = request.data?.activo === true;
  if (!usuarioId) throw new HttpsError("invalid-argument", "Falta el usuario.");
  if (usuarioId === solicitante.uid && !activo) {
    throw new HttpsError("failed-precondition", "No puedes desactivar tu propia cuenta.");
  }

  const objetivoRef = db.collection("usuarios").doc(usuarioId);
  const objetivoSnap = await objetivoRef.get();
  if (!objetivoSnap.exists) throw new HttpsError("not-found", "El usuario no existe.");
  const objetivo = objetivoSnap.data();
  if (objetivo.rol === "super_admin") {
    throw new HttpsError("permission-denied", "Esta operación no administra superadministradores.");
  }
  if (!puedeAdministrarEmpresa(solicitante, objetivo.empresaId)) {
    throw new HttpsError("permission-denied", "No puedes administrar este usuario.");
  }
  await exigirEmpresaOperativa(objetivo.empresaId, solicitante);

  if (solicitante.rol === "admin_sucursal" &&
      (objetivo.sucursalId !== solicitante.sucursalId ||
       ["admin_empresa", "admin_sucursal"].includes(objetivo.rol))) {
    throw new HttpsError("permission-denied", "No puedes administrar este usuario.");
  }

  if (activo && objetivo.suspendidoPorSucursal === true) {
    throw new HttpsError(
      "failed-precondition",
      "Activa la sucursal para recuperar el acceso de este usuario."
    );
  }

  if (activo && objetivo.activo !== true) {
    await validarCupoUsuariosEmpresa(objetivo.empresaId, solicitante);
  }

  const cuentaAnterior = await auth.getUser(usuarioId);
  try {
    await auth.updateUser(usuarioId, { disabled: !activo });
    await objetivoRef.update({
      activo,
      fechaActualizacion: FieldValue.serverTimestamp(),
      actualizadoPor: solicitante.uid
    });
  } catch (error) {
    await auth.updateUser(usuarioId, { disabled: cuentaAnterior.disabled }).catch(() => {});
    console.error("cambiarEstadoUsuario", error);
    throw new HttpsError("internal", "No fue posible cambiar el estado del usuario.");
  }

  if (!activo) await auth.revokeRefreshTokens(usuarioId);
  await registrarAuditoria({
    solicitante, empresaId: objetivo.empresaId,
    accion: activo ? "usuario_activado" : "usuario_desactivado",
    objetivoId: usuarioId, detalle: objetivo.correo || ""
  });
  return { ok: true, activo };
});

exports.actualizarSucursalUsuario = onCall(CALLABLE_OPTIONS, async request => {
  const solicitante = await obtenerSolicitante(request);
  const usuarioId = texto(request.data?.usuarioId, 128);
  const sucursalId = texto(request.data?.sucursalId, 100);

  if (!usuarioId) {
    throw new HttpsError("invalid-argument", "Falta el usuario.");
  }
  if (!["super_admin", "admin_empresa"].includes(solicitante.rol)) {
    throw new HttpsError(
      "permission-denied",
      "Solo el administrador de empresa puede cambiar la sucursal."
    );
  }

  const usuarioRef = db.collection("usuarios").doc(usuarioId);
  const usuarioSnap = await usuarioRef.get();
  if (!usuarioSnap.exists) {
    throw new HttpsError("not-found", "El usuario no existe.");
  }

  const objetivo = usuarioSnap.data();
  if (objetivo.rol === "super_admin" || objetivo.rol === "admin_empresa") {
    throw new HttpsError(
      "failed-precondition",
      "Este perfil administra toda la empresa y no requiere sucursal."
    );
  }
  if (solicitante.rol === "admin_empresa" &&
      solicitante.empresaId !== objetivo.empresaId) {
    throw new HttpsError(
      "permission-denied",
      "No puedes administrar usuarios de otra empresa."
    );
  }
  await exigirEmpresaOperativa(objetivo.empresaId, solicitante);

  let sucursalNombre = "Sin sucursal asignada";
  if (sucursalId) {
    const sucursalSnap = await db.collection("sucursales").doc(sucursalId).get();
    if (!sucursalSnap.exists ||
        sucursalSnap.data().empresaId !== objetivo.empresaId ||
        sucursalSnap.data().activa !== true) {
      throw new HttpsError(
        "invalid-argument",
        "La sucursal seleccionada no está disponible para esta empresa."
      );
    }
    sucursalNombre = sucursalSnap.data().nombre || sucursalId;
  }

  const sucursalAnteriorId = texto(objetivo.sucursalId, 100);
  if (sucursalAnteriorId === sucursalId) {
    return { ok: true, sucursalId, sinCambios: true };
  }

  let sucursalAnteriorNombre = "Sin sucursal asignada";
  if (sucursalAnteriorId) {
    const anteriorSnap = await db.collection("sucursales").doc(sucursalAnteriorId).get();
    if (anteriorSnap.exists) {
      sucursalAnteriorNombre = anteriorSnap.data().nombre || sucursalAnteriorId;
    }
  }

  const reactivarPorTraslado = objetivo.suspendidoPorSucursal === true;
  await usuarioRef.update({
    sucursalId,
    ...(reactivarPorTraslado ? { activo: true, suspendidoPorSucursal: false } : {}),
    fechaActualizacion: FieldValue.serverTimestamp(),
    actualizadoPor: solicitante.uid
  });
  if (reactivarPorTraslado) {
    await auth.updateUser(usuarioId, { disabled: false });
  }

  await registrarAuditoria({
    solicitante,
    empresaId: objetivo.empresaId,
    accion: sucursalId ? "usuario_sucursal_actualizada" : "usuario_sucursal_removida",
    objetivoId: usuarioId,
    detalle: `${objetivo.correo || usuarioId}: ${sucursalAnteriorNombre} → ${sucursalNombre}`
  });

  return { ok: true, sucursalId };
});

exports.eliminarUsuarioEmpresa = onCall(CALLABLE_OPTIONS, async request => {
  const solicitante = await obtenerSolicitante(request);
  const usuarioId = texto(request.data?.usuarioId, 128);
  if (!usuarioId || usuarioId === solicitante.uid) {
    throw new HttpsError("failed-precondition", "No puedes eliminar tu propia cuenta.");
  }
  const ref = db.collection("usuarios").doc(usuarioId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "El usuario no existe.");
  const objetivo = snap.data();
  if (objetivo.rol === "super_admin" ||
      !puedeAdministrarEmpresa(solicitante, objetivo.empresaId)) {
    throw new HttpsError("permission-denied", "No puedes eliminar este usuario.");
  }
  if (solicitante.rol === "admin_sucursal") {
    throw new HttpsError("permission-denied", "Solo un administrador de empresa puede eliminar usuarios.");
  }
  await exigirEmpresaOperativa(objetivo.empresaId, solicitante);

  await auth.deleteUser(usuarioId);
  await ref.delete();
  await registrarAuditoria({
    solicitante, empresaId: objetivo.empresaId, accion: "usuario_eliminado",
    objetivoId: usuarioId, detalle: objetivo.correo || ""
  });
  return { ok: true };
});

exports.crearEmpresaConAdministrador = onCall(CALLABLE_OPTIONS, async request => {
  const solicitante = await obtenerSolicitante(request);
  if (solicitante.rol !== "super_admin") {
    throw new HttpsError("permission-denied", "Solo el superadministrador puede crear empresas.");
  }
  const datos = request.data || {};
  const nombre = texto(datos.nombre, 120);
  const rut = texto(datos.rut, 30);
  const correo = texto(datos.correo, 160).toLowerCase();
  const adminCorreo = texto(datos.adminCorreo, 160).toLowerCase();
  const adminNombre = texto(datos.adminNombre, 80);
  const adminApellido = texto(datos.adminApellido, 80);
  const planId = texto(datos.plan, 60);
  if (!nombre || !rut || !correoValido(correo) ||
      !adminNombre || !correoValido(adminCorreo) || !planId) {
    throw new HttpsError("invalid-argument", "Los datos obligatorios de la empresa no están completos.");
  }

  const [planSnap, configSnap] = await Promise.all([
    db.collection("planes").doc(planId).get(),
    db.collection("configuracionGlobal").doc("sistema").get()
  ]);
  if (!planSnap.exists || planSnap.data().activo === false) {
    throw new HttpsError("failed-precondition", "El plan seleccionado no está disponible.");
  }
  const plan = planSnap.data();
  const config = configSnap.exists ? configSnap.data() : {};
  const empresaRef = db.collection("empresas").doc();
  const temporal = passwordTemporal();
  const fechaInicioSuscripcion = new Date();
  const fechaFinPrueba = new Date(fechaInicioSuscripcion);
  fechaFinPrueba.setUTCDate(fechaFinPrueba.getUTCDate() + Math.max(0, Number(plan.diasPrueba || 0)));
  const fechaISO = fecha => fecha.toISOString().slice(0, 10);
  let cuenta;

  try {
    cuenta = await auth.createUser({
      email: adminCorreo,
      password: temporal,
      displayName: `${adminNombre} ${adminApellido}`.trim()
    });
    const batch = db.batch();
    batch.set(empresaRef, {
      nombre, rut, giro: texto(datos.giro, 180), correo,
      telefono: texto(datos.telefono, 40), ciudad: texto(datos.ciudad, 100),
      direccion: "", pais: texto(config.paisPredeterminado || "Chile", 80),
      sitioWeb: "", logo: "",
      colorPrimario: config.colorPrimarioPredeterminado || "#2563eb",
      colorSecundario: config.colorSecundarioPredeterminado || "#8bc34a",
      plan: planId, activa: true, estado: "activa",
      suscripcion: {
        estado: Number(plan.diasPrueba || 0) > 0 ? "prueba" : "activa",
        modalidad: "mensual",
        medioPago: "transferencia",
        fechaInicio: fechaISO(fechaInicioSuscripcion),
        fechaVencimiento: fechaISO(fechaFinPrueba),
        diasGracia: 5,
        numeroOrdenCompra: "",
        observaciones: "",
        fechaActualizacion: fechaInicioSuscripcion.toISOString(),
        actualizadoPor: solicitante.uid
      },
      maxUsuarios: Number(plan.maxUsuarios || 0),
      maxSucursales: Number(plan.maxSucursales || 0),
      maxStorageGB: Number(plan.maxStorageGB || 0),
      modulos: datos.modulos && typeof datos.modulos === "object" ? datos.modulos : {},
      creadoPor: solicitante.uid,
      creadoPorNombre: solicitante.nombreCompleto || solicitante.nombre || "Super Administrador",
      fechaCreacion: FieldValue.serverTimestamp(),
      fechaActualizacion: FieldValue.serverTimestamp()
    });
    batch.set(db.collection("usuarios").doc(cuenta.uid), {
      uid: cuenta.uid, empresaId: empresaRef.id, sucursalId: "",
      nombre: adminNombre, apellido: adminApellido,
      nombreCompleto: `${adminNombre} ${adminApellido}`.trim(),
      correo: adminCorreo, telefono: "", cargo: "Administrador de Empresa",
      rol: "admin_empresa", activo: true, debeCambiarPassword: true,
      primerIngreso: true, foto: "", creadoPor: solicitante.uid,
      creadoPorNombre: solicitante.nombreCompleto || solicitante.nombre || "Super Administrador",
      fechaCreacion: FieldValue.serverTimestamp(),
      fechaActualizacion: FieldValue.serverTimestamp(), ultimoAcceso: null,
      permisos: permisosPorRol("admin_empresa")
    });
    await batch.commit();
  } catch (error) {
    if (cuenta?.uid) await auth.deleteUser(cuenta.uid).catch(() => {});
    if (error?.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "El correo del administrador ya está registrado.");
    }
    console.error("crearEmpresaConAdministrador", error);
    throw new HttpsError("internal", "No fue posible crear la empresa.");
  }

  await registrarAuditoria({
    solicitante, empresaId: empresaRef.id, accion: "empresa_creada",
    objetivoId: empresaRef.id, detalle: nombre
  });
  return {
    empresaId: empresaRef.id,
    uidAdmin: cuenta.uid,
    passwordTemporal: temporal
  };
});

exports.solicitarCancelacionEmpresa = onCall(CALLABLE_OPTIONS, async request => {
  const solicitante = await obtenerSolicitante(request);
  const empresaId = texto(request.data?.empresaId, 128);
  if (!empresaId) {
    throw new HttpsError("invalid-argument", "Falta la empresa que deseas cancelar.");
  }
  if (solicitante.rol !== "super_admin" &&
      !(solicitante.rol === "admin_empresa" && solicitante.empresaId === empresaId)) {
    throw new HttpsError("permission-denied", "Solo el administrador de empresa puede solicitar la cancelación.");
  }

  const empresaRef = db.collection("empresas").doc(empresaId);
  const empresaSnap = await empresaRef.get();
  if (!empresaSnap.exists) throw new HttpsError("not-found", "La empresa no existe.");
  const empresa = empresaSnap.data();
  const estadoActual = texto(empresa.suscripcion?.estado, 60);
  if (["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"].includes(estadoActual)) {
    throw new HttpsError("already-exists", "La cancelación de esta empresa ya fue solicitada.");
  }

  const ahora = new Date();
  const fechaLimite = new Date(ahora);
  fechaLimite.setUTCDate(fechaLimite.getUTCDate() + 30);
  const cancelacion = {
    estado: "periodo_exportacion",
    fechaSolicitud: ahora.toISOString(),
    fechaLimiteExportacion: fechaLimite.toISOString(),
    eliminacionManual: true,
    solicitadaPor: solicitante.uid,
    solicitadaPorNombre: solicitante.nombreCompleto || solicitante.nombre || solicitante.correo || "Administrador",
    fechaEliminacion: null,
    eliminadoPor: null
  };

  await empresaRef.set({
    activa: false,
    estado: "cancelacion_solicitada",
    cancelacion,
    suscripcion: {
      ...(empresa.suscripcion || {}),
      estado: "periodo_exportacion",
      fechaActualizacion: ahora.toISOString(),
      actualizadoPor: solicitante.uid
    },
    fechaActualizacion: FieldValue.serverTimestamp(),
    actualizadoPor: solicitante.uid
  }, { merge: true });

  await registrarAuditoria({
    solicitante,
    empresaId,
    accion: "cancelacion_empresa_solicitada",
    objetivoId: empresaId,
    detalle: `Respaldo disponible hasta ${fechaLimite.toISOString()}; eliminación exclusivamente manual`
  });

  return { ok: true, fechaSolicitud: ahora.toISOString(), fechaLimiteExportacion: fechaLimite.toISOString() };
});

exports.eliminarEmpresaCompleta = onCall({
  region: REGION,
  timeoutSeconds: 540,
  memory: "512MiB",
  maxInstances: 2
}, async request => {
  const solicitante = await obtenerSolicitante(request);
  if (solicitante.rol !== "super_admin") {
    throw new HttpsError(
      "permission-denied",
      "Solo el superadministrador puede eliminar empresas."
    );
  }

  const empresaId = texto(request.data?.empresaId, 128);
  const confirmacion = texto(request.data?.confirmacion, 160);
  if (!empresaId || !confirmacion) {
    throw new HttpsError("invalid-argument", "Falta la confirmación de eliminación.");
  }

  const empresaRef = db.collection("empresas").doc(empresaId);
  const empresaSnap = await empresaRef.get();
  if (!empresaSnap.exists) {
    throw new HttpsError("not-found", "La empresa ya no existe.");
  }
  const empresa = empresaSnap.data();
  const nombreEmpresa = texto(empresa.nombre, 160);
  if (confirmacion !== nombreEmpresa) {
    throw new HttpsError(
      "failed-precondition",
      "El nombre ingresado no coincide con la empresa."
    );
  }
  const fechaLimite = Date.parse(empresa.cancelacion?.fechaLimiteExportacion || "");
  const estadosEliminables = ["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"];
  if (!estadosEliminables.includes(empresa.suscripcion?.estado) ||
      !empresa.cancelacion?.eliminacionManual || !Number.isFinite(fechaLimite)) {
    throw new HttpsError(
      "failed-precondition",
      "Primero debe registrarse la cancelación y el periodo de exportación de la empresa."
    );
  }
  if (fechaLimite > Date.now()) {
    throw new HttpsError(
      "failed-precondition",
      `La empresa puede eliminarse manualmente después del ${new Date(fechaLimite).toLocaleDateString("es-CL")}.`
    );
  }

  const colecciones = [
    "usuarios",
    "sucursales",
    "clientes",
    "equipos",
    "ots",
    "otsResumen",
    "plantillasMantenimiento",
    "inventarioItems",
    "inventarioConfiguraciones",
    "programaciones",
    "programacionSemanas",
    "sheqContratos",
    "sheqVehiculos",
    "sheqDocumentos",
    "logsSistema"
  ];
  const resultados = await Promise.all(
    colecciones.map(nombre => documentosDeEmpresa(nombre, empresaId))
  );
  const asociados = Object.fromEntries(
    colecciones.map((nombre, indice) => [nombre, resultados[indice]])
  );

  await eliminarCuentasUsuarios(asociados.usuarios);

  const prefijosStorage = [
    `empresas/${empresaId}/`,
    `exportaciones/${empresaId}/`,
    ...asociados.ots.map(ot => `ots/${ot.id}/`)
  ];
  for (const prefix of prefijosStorage) {
    await bucket.deleteFiles({ prefix, force: true });
  }

  for (const nombre of colecciones) {
    await eliminarDocumentosRecursivamente(asociados[nombre]);
  }
  await db.recursiveDelete(empresaRef);

  await registrarAuditoria({
    solicitante,
    empresaId,
    accion: "empresa_eliminada",
    objetivoId: empresaId,
    detalle: nombreEmpresa
  });

  return {
    ok: true,
    empresaId,
    eliminados: {
      usuarios: asociados.usuarios.length,
      sucursales: asociados.sucursales.length,
      clientes: asociados.clientes.length,
      equipos: asociados.equipos.length,
      ots: asociados.ots.length
    }
  };
});

exports.generarExportacionEmpresa = onCall({
  region: REGION,
  timeoutSeconds: 540,
  memory: "1GiB",
  maxInstances: 2
}, async request => {
  const solicitante = await obtenerSolicitante(request);
  const empresaId = texto(request.data?.empresaId, 128);
  if (!empresaId) throw new HttpsError("invalid-argument", "Falta la empresa que deseas exportar.");
  if (solicitante.rol !== "super_admin" &&
      !(solicitante.rol === "admin_empresa" && solicitante.empresaId === empresaId)) {
    throw new HttpsError("permission-denied", "Solo el administrador de empresa puede generar este respaldo.");
  }

  const empresaRef = db.collection("empresas").doc(empresaId);
  const empresaSnap = await empresaRef.get();
  if (!empresaSnap.exists) throw new HttpsError("not-found", "La empresa no existe.");
  const empresa = { id: empresaSnap.id, ...valorExportable(empresaSnap.data()) };
  const colecciones = [
    "usuarios", "sucursales", "clientes", "equipos", "ots", "otsResumen",
    "plantillasMantenimiento", "inventarioItems", "inventarioConfiguraciones",
    "programaciones", "programacionSemanas", "sheqContratos", "sheqVehiculos",
    "sheqDocumentos", "logsSistema"
  ];

  try {
    const { ZipArchive } = require("archiver");
    const resultados = await Promise.all(colecciones.map(nombre => documentosDeEmpresa(nombre, empresaId)));
    const asociados = Object.fromEntries(colecciones.map((nombre, indice) => [nombre, resultados[indice]]));
    const pagosSnap = await empresaRef.collection("pagos").get();
    const sucursalesPorId = new Map(asociados.sucursales.map(item => [item.id, item.data().nombre || item.id]));
    const ahora = new Date();
    const vence = new Date(ahora.getTime() + (72 * 60 * 60 * 1000));
    const sello = ahora.toISOString().replace(/[:.]/g, "-");
    const nombreZip = `Respaldo_${nombreSeguro(empresa.nombre, "Empresa").replace(/\s+/g, "_")}_${sello}.zip`;
    const rutaStorage = `exportaciones/${empresaId}/${crypto.randomUUID()}-${nombreZip}`;
    const tokenDescarga = crypto.randomUUID();
    const archivoDestino = bucket.file(rutaStorage);
    const salida = archivoDestino.createWriteStream({
      resumable: false,
      contentType: "application/zip",
      metadata: {
        contentDisposition: `attachment; filename="${nombreZip.replace(/"/g, "")}"`,
        metadata: {
          temporalExport: "true",
          empresaId,
          solicitadoPor: solicitante.uid,
          expiresAt: vence.toISOString(),
          firebaseStorageDownloadTokens: tokenDescarga
        }
      }
    });
    const zip = new ZipArchive({ zlib: { level: 7 } });
    const terminado = new Promise((resolve, reject) => {
      salida.on("finish", resolve);
      salida.on("error", reject);
      zip.on("error", reject);
    });
    zip.pipe(salida);

    const manifiesto = [
      "RESPALDO COMPLETO DE EMPRESA - VECTARIA",
      "",
      `Empresa: ${empresa.nombre || empresaId}`,
      `RUT: ${empresa.rut || "-"}`,
      `Generado: ${ahora.toISOString()}`,
      `Solicitado por: ${solicitante.nombreCompleto || solicitante.correo || solicitante.uid}`,
      "",
      "CONTENIDO",
      "- indices/: registros en CSV para abrir en Excel y respaldo íntegro en JSON.",
      "- ordenes_de_trabajo/: carpeta por OT con resumen PDF, datos JSON y archivos originales.",
      "- configuracion/archivos/: logo, portada y plantillas originales almacenadas por la empresa.",
      "",
      "Las órdenes cerradas no fueron reabiertas ni modificadas para generar este respaldo.",
      "El archivo datos.json es la copia íntegra para una eventual migración o auditoría."
    ].join("\r\n");
    zip.append(manifiesto, { name: "LEEME.txt" });
    zip.append(JSON.stringify(empresa, null, 2), { name: "indices/empresa.json" });

    for (const nombre of colecciones) {
      zip.append(documentosACsv(asociados[nombre]), { name: `indices/${nombre}.csv` });
      zip.append(jsonDocumentos(asociados[nombre]), { name: `indices/${nombre}.json` });
    }
    zip.append(documentosACsv(pagosSnap.docs), { name: "indices/pagos.csv" });
    zip.append(jsonDocumentos(pagosSnap.docs), { name: "indices/pagos.json" });

    let archivosIncluidos = 0;
    for (const documentoOt of asociados.ots) {
      const datosOt = { id: documentoOt.id, ...valorExportable(documentoOt.data()) };
      const numero = valorPrimero(datosOt, ["os", "numeroOT", "numeroOt", "codigo", "folio"]);
      const carpeta = `ordenes_de_trabajo/${nombreSeguro(numero === "-" ? documentoOt.id : `${numero}_${documentoOt.id}`, documentoOt.id)}`;
      zip.append(JSON.stringify(datosOt, null, 2), { name: `${carpeta}/datos_OT.json` });
      zip.append(await crearResumenPdfOt(datosOt, empresa, sucursalesPorId.get(datosOt.sucursalId) || "-"), { name: `${carpeta}/resumen_exportacion_OT.pdf` });
      archivosIncluidos += await anexarArchivosStorage(zip, `ots/${documentoOt.id}/`, `${carpeta}/archivos`);
    }
    archivosIncluidos += await anexarArchivosStorage(zip, `empresas/${empresaId}/`, "configuracion/archivos");
    await zip.finalize();
    await terminado;

    const [metadata] = await archivoDestino.getMetadata();
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(rutaStorage)}?alt=media&token=${tokenDescarga}`;
    await registrarAuditoria({
      solicitante,
      empresaId,
      accion: "exportacion_empresa_generada",
      objetivoId: empresaId,
      detalle: `${asociados.ots.length} OT y ${archivosIncluidos} archivos; disponible hasta ${vence.toISOString()}`
    });
    return {
      ok: true,
      nombreArchivo: nombreZip,
      url,
      venceEn: vence.toISOString(),
      bytes: Number(metadata.size || 0),
      resumen: {
        ots: asociados.ots.length,
        usuarios: asociados.usuarios.length,
        sucursales: asociados.sucursales.length,
        clientes: asociados.clientes.length,
        equipos: asociados.equipos.length,
        archivos: archivosIncluidos
      }
    };
  } catch (error) {
    console.error("generarExportacionEmpresa", { empresaId, uid: solicitante.uid, error });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "No fue posible preparar el respaldo completo. Intenta nuevamente.");
  }
});

exports.limpiarExportacionesExpiradas = onSchedule({
  region: REGION,
  schedule: "every day 03:15",
  timeZone: "America/Santiago",
  timeoutSeconds: 540,
  memory: "256MiB"
}, async () => {
  const [archivos] = await bucket.getFiles({ prefix: "exportaciones/" });
  const ahora = Date.now();
  let eliminados = 0;
  for (const archivo of archivos) {
    const [metadata] = await archivo.getMetadata();
    const expira = Date.parse(metadata.metadata?.expiresAt || "");
    if (metadata.metadata?.temporalExport === "true" && Number.isFinite(expira) && expira <= ahora) {
      await archivo.delete({ ignoreNotFound: true });
      eliminados += 1;
    }
  }
  console.log(`Exportaciones temporales eliminadas: ${eliminados}`);
});
