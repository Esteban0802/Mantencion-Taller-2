import { db, storage } from "./firebase-config.js";
import { protegerPagina, cerrarSesion } from "./session.js?v=20261004-2";
import { moduloActivo } from "./modulos.js";
import { evaluarCuotaStorage, mensajeCuotaStorage } from "./storage-quota.js";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs,
  getCountFromServer, limit, orderBy, query, serverTimestamp, setDoc,
  startAfter, updateDoc, where, writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

const usuario = protegerPagina(["super_admin", "admin_empresa", "admin_sucursal", "jefe_taller", "usuario_taller", "planificador", "bodeguero"]);
if (!usuario) throw new Error("Acceso no autorizado");

let empresa = null;
let empresaId = "";
let sucursalId = "";
let columnas = [];
let items = [];
let itemsFiltrados = [];
let usuariosRetiro = [];
let puedeEditar = false;
let importacionEnCurso = false;
const operacionesInventarioEnCurso = new Set();
const REGISTROS_POR_CARGA = 50;
const ROLES_LIMITADOS_A_SUCURSAL = [
  "admin_sucursal",
  "jefe_taller",
  "usuario_taller",
  "planificador",
  "bodeguero"
];
let cursorInventario = null;
let totalInventarioServidor = 0;
let inventarioCompleto = false;
let cargaInventarioEnCurso = false;
let timerBusquedaInventario = null;

const $ = id => document.getElementById(id);
const escapar = valor => String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

function mensaje({ titulo, texto, tipo = "info" }) {
  return window.OverTrackUI.mostrarMensaje({ titulo, mensaje: texto, tipo });
}

function normalizarEncabezados(fila = []) {
  const usados = new Map();
  return fila.map(valor => {
    let nombre = String(valor ?? "").trim();
    const cantidad = usados.get(nombre.toLowerCase()) || 0;
    usados.set(nombre.toLowerCase(), cantidad + 1);
    if (cantidad) nombre = `${nombre} (${cantidad + 1})`;
    return nombre;
  });
}

function claveEncabezado(valor = "") {
  const palabrasIgnoradas = new Set(["de", "del", "la", "el", "las", "los"]);
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(palabra => palabra && !palabrasIgnoradas.has(palabra))
    .join(" ");
}

function valorComparable(valor = "") {
  return String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function detectarEncabezadosExcel(filas = []) {
  const normalizarTexto = valor => String(valor ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const filaInventario = filas.slice(0, 100).findIndex(fila => {
    const valores = fila.map(normalizarTexto);
    return valores.includes("cliente") && valores.some(valor => valor.includes("guia de despacho")) && valores.some(valor => valor.includes("numero parte"));
  });
  if (filaInventario >= 0) {
    const valores = filas[filaInventario].map(valor => String(valor ?? "").trim());
    const indices = valores.map((valor, posicion) => valor ? posicion : -1).filter(posicion => posicion >= 0);
    return { fila: filaInventario, indices, columnas: normalizarEncabezados(indices.map(indice => valores[indice])) };
  }
  const palabrasEncabezado = /fecha|cliente|gu[ií]a|orden|servicio|n[uú]mero|parte|unidad|cantidad|stock|c[oó]digo|descripci[oó]n|observaciones/i;
  const candidatas = filas.slice(0, 60).map((fila, indice) => {
    const valores = fila.map(valor => String(valor ?? "").trim());
    const indices = valores.map((valor, posicion) => valor ? posicion : -1).filter(posicion => posicion >= 0);
    const textos = indices.filter(posicion => /[a-záéíóúñ]/i.test(valores[posicion])).length;
    const conocidos = indices.filter(posicion => palabrasEncabezado.test(valores[posicion])).length;
    return { indice, valores, indices, puntaje: indices.length * 10 + textos * 2 + conocidos * 8 };
  }).filter(item => item.indices.length >= 2).sort((a, b) => b.puntaje - a.puntaje || a.indice - b.indice);
  const encabezado = candidatas[0];
  if (!encabezado) throw new Error("No se pudo identificar una fila de encabezados en el Excel.");
  return {
    fila: encabezado.indice,
    indices: encabezado.indices,
    columnas: normalizarEncabezados(encabezado.indices.map(indice => encabezado.valores[indice]))
  };
}

function estructuraInventarioGenerica(lista = []) {
  return lista.length <= 1 || lista.some(columna => /^columna\s+\d+$/i.test(columna));
}

function claveConfiguracion() {
  return `${empresaId}_${sucursalId}`;
}

async function cargarEmpresa() {
  empresaId = usuario.rol === "super_admin"
    ? sessionStorage.getItem("empresaIdOperacionAdmin") || ""
    : usuario.empresaId || "";
  if (!empresaId) throw new Error("No se encontró la empresa activa.");
  const snap = await getDoc(doc(db, "empresas", empresaId));
  if (!snap.exists()) throw new Error("La empresa ya no existe.");
  empresa = { id: snap.id, ...snap.data() };
  if (!moduloActivo(empresa, "inventario")) {
    await mensaje({ titulo: "Módulo no habilitado", texto: "Inventario no está habilitado para esta empresa.", tipo: "advertencia" });
    window.location.replace(usuario.rol === "bodeguero" ? "programacion.html" : "dashboard.html");
    return false;
  }
  return true;
}

async function cargarSucursales() {
  const selector = $("selectorSucursalInventario");
  const grupo = $("grupoSucursalInventario");
  let sucursales = [];
  if (ROLES_LIMITADOS_A_SUCURSAL.includes(usuario.rol)) {
    if (!usuario.sucursalId) throw new Error("El usuario no tiene una sucursal asignada.");
    const sucursalSnap = await getDoc(doc(db, "sucursales", usuario.sucursalId));
    if (sucursalSnap.exists()) sucursales = [{ id: sucursalSnap.id, ...sucursalSnap.data() }];
  } else {
    const consulta = query(collection(db, "sucursales"), where("empresaId", "==", empresaId));
    const snap = await getDocs(consulta);
    sucursales = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.activa !== false);
  }
  selector.innerHTML = '<option value="">Seleccionar sucursal</option>' + sucursales.map(s => `<option value="${escapar(s.id)}">${escapar(s.nombre || s.codigo || s.id)}</option>`).join("");

  if (ROLES_LIMITADOS_A_SUCURSAL.includes(usuario.rol)) {
    sucursalId = usuario.sucursalId || "";
    selector.value = sucursalId;
    selector.disabled = true;
    grupo.style.display = "none";
  } else if (sucursales.length === 1) {
    sucursalId = sucursales[0].id;
    selector.value = sucursalId;
  }

  if (sucursalId) { await cargarUsuariosRetiro(); await cargarInventario(); }
}

async function cargarUsuariosRetiro() {
  usuariosRetiro = [];
  if (!empresaId || !sucursalId) return;
  const snap = await getDocs(query(collection(db, "usuarios"), where("empresaId", "==", empresaId), where("sucursalId", "==", sucursalId)));
  usuariosRetiro = snap.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => item.activo !== false && ["supervisor", "jefe_taller", "tecnico", "usuario_taller"].includes(item.rol))
    .sort((a, b) => String(a.nombreCompleto || a.nombre || a.email || "").localeCompare(String(b.nombreCompleto || b.nombre || b.email || ""), "es"));
}

function opcionesRetira(seleccionado = "") {
  return `<option value="">Sin asignar</option>${usuariosRetiro.map(item => {
    const nombre = item.nombreCompleto || item.nombre || item.email || "Usuario";
    const rol = ["supervisor", "jefe_taller"].includes(item.rol) ? "Supervisor" : "Técnico";
    return `<option value="${escapar(item.id)}"${item.id === seleccionado ? " selected" : ""}>${escapar(nombre)} · ${rol}</option>`;
  }).join("")}`;
}

function nombreArchivoSeguro(nombre = "archivo") {
  return String(nombre).replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "archivo";
}

function evidenciasItem(item) {
  return Array.isArray(item?.evidencias) ? item.evidencias.filter(evidencia => evidencia?.url) : [];
}

function celdaEvidencias(item) {
  const evidencias = evidenciasItem(item);
  const enlaces = evidencias.length
    ? `<div class="inventario-evidencias-lista">${evidencias.map((evidencia, indice) => `<a href="${escapar(evidencia.url)}" target="_blank" rel="noopener" title="${escapar(evidencia.nombre || `Evidencia ${indice + 1}`)}">${indice + 1}. ${escapar(evidencia.nombre || "Ver evidencia")}</a>`).join("")}</div>`
    : '<span class="inventario-sin-evidencia">Sin evidencia</span>';
  return `<div class="inventario-evidencias">${enlaces}${puedeEditar ? `<label class="inventario-adjuntar"><input type="file" data-evidencia accept="image/*,.pdf,application/pdf" multiple><span>+ Adjuntar</span></label>` : ""}</div>`;
}

async function cargarInventario({ reiniciar = true, completo = false } = {}) {
  if (!sucursalId) {
    columnas = []; items = []; itemsFiltrados = []; totalInventarioServidor = 0; renderInventario(); return;
  }
  completo = completo || Boolean($("buscarInventario").value.trim());
  if (cargaInventarioEnCurso) return;
  cargaInventarioEnCurso = true;
  const botonCarga = $("btnCargarMasInventario");
  if (botonCarga) botonCarga.disabled = true;
  $("estadoInventario").textContent = "Cargando inventario…";
  try {
    const filtros = [where("empresaId", "==", empresaId), where("sucursalId", "==", sucursalId)];
    const consultaBase = query(collection(db, "inventarioItems"), ...filtros, orderBy("fechaActualizacion", "desc"));
    if (reiniciar) {
      items = [];
      cursorInventario = null;
      inventarioCompleto = false;
      let configSnap = null;
      try {
        const configuracionesSnap = await getDocs(query(
          collection(db, "inventarioConfiguraciones"),
          where("empresaId", "==", empresaId),
          where("sucursalId", "==", sucursalId)
        ));
        configSnap = configuracionesSnap.docs[0] || null;
      } catch (error) {
        if (error?.code !== "permission-denied") throw error;
        console.warn("La configuración de Inventario aún no existe o sus reglas locales no están publicadas.");
      }
      columnas = configSnap && Array.isArray(configSnap.data().columnas) ? configSnap.data().columnas : [];
      try {
        const conteoSnap = await getCountFromServer(query(collection(db, "inventarioItems"), ...filtros));
        totalInventarioServidor = conteoSnap.data().count;
      } catch (error) {
        console.warn("El conteo optimizado de Inventario aún no está disponible.", error);
        totalInventarioServidor = 0;
      }
    }

    let consulta = consultaBase;
    if (!completo) {
      const restriccionesPagina = [limit(REGISTROS_POR_CARGA)];
      if (!reiniciar && cursorInventario) restriccionesPagina.unshift(startAfter(cursorInventario));
      consulta = query(consultaBase, ...restriccionesPagina);
    }

    let itemsSnap;
    try {
      itemsSnap = await getDocs(consulta);
    } catch (error) {
      if (!["failed-precondition", "permission-denied"].includes(error?.code)) throw error;
      console.warn("La consulta paginada de Inventario aún no está publicada; se usará la carga completa temporalmente.");
      itemsSnap = await getDocs(query(collection(db, "inventarioItems"), ...filtros));
      completo = true;
    }
    const existentes = new Set(items.map(item => item.id));
    itemsSnap.docs.forEach(documento => {
      if (!existentes.has(documento.id)) items.push({ id: documento.id, ...documento.data() });
    });
    items.sort((a, b) => (b.fechaActualizacion?.toMillis?.() || 0) - (a.fechaActualizacion?.toMillis?.() || 0));
    if (!totalInventarioServidor) totalInventarioServidor = items.length;
    cursorInventario = itemsSnap.docs.at(-1) || cursorInventario;
    inventarioCompleto = completo || items.length >= totalInventarioServidor || itemsSnap.empty;
    filtrarInventario();
  } finally {
    cargaInventarioEnCurso = false;
    const botonCargarMas = $("btnCargarMasInventario");
    if (botonCargarMas) botonCargarMas.disabled = false;
  }
}

async function asegurarInventarioCompleto() {
  if (!sucursalId || inventarioCompleto) return;
  await cargarInventario({ reiniciar: true, completo: true });
}

function renderInventario() {
  const thead = $("tablaInventario").querySelector("thead");
  const tbody = $("tablaInventario").querySelector("tbody");
  $("totalInventario").textContent = String(totalInventarioServidor || items.length);
  $("totalColumnasInventario").textContent = String(columnas.length);
  const ultima = items.map(i => i.fechaActualizacion?.toDate?.()).filter(Boolean).sort((a,b) => b-a)[0];
  $("ultimaActualizacionInventario").textContent = ultima ? ultima.toLocaleDateString("es-CL") : "Sin registros";
  $("estadoInventario").textContent = sucursalId
    ? `${itemsFiltrados.length} visibles · ${items.length} cargados de ${totalInventarioServidor}`
    : "Selecciona una sucursal para comenzar.";
  const botonCargarMas = $("btnCargarMasInventario");
  botonCargarMas.hidden = !sucursalId || inventarioCompleto || Boolean($("buscarInventario").value.trim());
  botonCargarMas.disabled = cargaInventarioEnCurso;

  if (!columnas.length) {
    thead.innerHTML = "<tr><th>Inventario</th></tr>";
    tbody.innerHTML = '<tr><td class="inventario-vacio">Importa un Excel para crear la estructura inicial del inventario.</td></tr>';
    return;
  }
  thead.innerHTML = `<tr>${columnas.map(c => `<th>${escapar(c)}</th>`).join("")}<th>RETIRA</th><th>EVIDENCIA</th><th>Acciones</th></tr>`;
  if (!itemsFiltrados.length) {
    tbody.innerHTML = `<tr><td colspan="${columnas.length + 3}" class="inventario-vacio">No se encontraron registros.</td></tr>`;
    return;
  }
  tbody.innerHTML = itemsFiltrados.map(item => `<tr data-item-id="${item.id}">${columnas.map(columna => `<td><input class="inventario-celda-input" data-columna="${escapar(columna)}" value="${escapar(item.datos?.[columna] ?? "")}" ${puedeEditar ? "" : "disabled"}></td>`).join("")}<td><select class="inventario-retira" data-retira ${puedeEditar ? "" : "disabled"}>${opcionesRetira(item.retiraUsuarioId || "")}</select></td><td>${celdaEvidencias(item)}</td><td><div class="inventario-fila-acciones">${puedeEditar ? '<button type="button" class="inventario-guardar">Guardar</button><button type="button" class="inventario-eliminar">Eliminar</button>' : '<span>Consulta</span>'}</div></td></tr>`).join("");
}

async function subirEvidencias(fila, archivosSeleccionados) {
  const itemId = fila.dataset.itemId;
  const archivos = Array.from(archivosSeleccionados || []);
  if (!archivos.length || operacionesInventarioEnCurso.has(itemId)) return;
  if (archivos.length > 10) throw new Error("Puedes adjuntar un máximo de 10 archivos por carga.");
  archivos.forEach(archivo => {
    const valido = archivo.type === "application/pdf" || ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"].includes(archivo.type);
    if (!valido) throw new Error(`“${archivo.name}” no es una foto compatible ni un PDF.`);
    if (archivo.size > 20 * 1024 * 1024) throw new Error(`“${archivo.name}” supera el máximo de 20 MB.`);
  });
  const totalNuevo = archivos.reduce((total, archivo) => total + archivo.size, 0);
  const cuota = evaluarCuotaStorage({ usadoBytes: empresa?.storageUsadoBytes || 0, maxStorageGB: empresa?.maxStorageGB, nuevoBytes: totalNuevo });
  if (!cuota.permitido) throw new Error(mensajeCuotaStorage(cuota));
  if (cuota.nivel !== "normal") {
    const continuar = await window.OverTrackUI.confirmarAccion({ titulo: "Almacenamiento próximo al límite", mensaje: mensajeCuotaStorage(cuota), tipo: "advertencia", textoConfirmar: "Continuar", textoCancelar: "Cancelar" });
    if (!continuar) return;
  }

  const item = items.find(registro => registro.id === itemId);
  const anteriores = evidenciasItem(item);
  const nuevas = [];
  const rutasCargadas = [];
  const input = fila.querySelector("[data-evidencia]");
  try {
    operacionesInventarioEnCurso.add(itemId);
    if (input) input.disabled = true;
    for (const archivo of archivos) {
      const ruta = `empresas/${empresaId}/inventario/${sucursalId}/${itemId}/${Date.now()}_${crypto.randomUUID()}_${nombreArchivoSeguro(archivo.name)}`;
      const referencia = ref(storage, ruta);
      await uploadBytes(referencia, archivo, { contentType: archivo.type });
      rutasCargadas.push(ruta);
      nuevas.push({ nombre: archivo.name.slice(0, 180), url: await getDownloadURL(referencia), ruta, tipo: archivo.type, tamano: archivo.size, subidoPor: usuario.uid, subidoPorNombre: usuario.nombre || usuario.nombreCompleto || usuario.email || "Usuario", fechaSubida: new Date().toISOString() });
    }
    await updateDoc(doc(db, "inventarioItems", itemId), { evidencias: [...anteriores, ...nuevas], fechaActualizacion: serverTimestamp(), actualizadoPor: usuario.uid });
    await cargarInventario();
    await mensaje({ titulo: "Evidencia agregada", texto: `${nuevas.length} archivo${nuevas.length === 1 ? " fue agregado" : "s fueron agregados"} correctamente.`, tipo: "exito" });
  } catch (error) {
    await Promise.all(rutasCargadas.map(ruta => deleteObject(ref(storage, ruta)).catch(() => {})));
    throw error;
  } finally {
    operacionesInventarioEnCurso.delete(itemId);
    if (input?.isConnected) { input.disabled = false; input.value = ""; }
  }
}

async function importarExcel(archivo) {
  if (!sucursalId) return mensaje({ titulo: "Sucursal requerida", texto: "Selecciona una sucursal antes de importar el inventario.", tipo: "advertencia" });
  if (!/\.xlsx?$/i.test(archivo?.name || "") || archivo.size > 5 * 1024 * 1024) throw new Error("Selecciona un archivo Excel válido de máximo 5 MB.");
  const buffer = await archivo.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  if (!workbook.SheetNames.length) throw new Error("El archivo Excel no contiene hojas.");
  const nombreHojaPrincipal = workbook.SheetNames.find(nombre => String(nombre).trim().toLowerCase() === "2026");
  if (!nombreHojaPrincipal) throw new Error('El archivo no contiene la hoja principal "2026". No se importaron datos.');
  const hoja = workbook.Sheets[nombreHojaPrincipal];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "", raw: false });
  if (filas.length < 2) throw new Error("El Excel debe contener encabezados y al menos un registro.");
  const encabezado = detectarEncabezadosExcel(filas);
  const nuevasColumnas = encabezado.columnas;
  const registros = filas.slice(encabezado.fila + 1).filter(fila => encabezado.indices.some(indice => String(fila[indice] ?? "").trim() !== ""));
  if (!registros.length) throw new Error("El Excel no contiene registros de inventario.");
  if (nuevasColumnas.length > 50) throw new Error("El inventario no puede superar 50 columnas.");
  if (registros.length > 5000) throw new Error("Cada importación admite un máximo de 5.000 registros.");
  await asegurarInventarioCompleto();

  const columnasPorClave = new Map(columnas.map(columna => [claveEncabezado(columna), columna]));
  const columnasImportadas = nuevasColumnas.map(columna => columnasPorClave.get(claveEncabezado(columna)) || columna);
  const columnasFinales = [...columnas];
  columnasImportadas.forEach(columna => { if (!columnasFinales.includes(columna)) columnasFinales.push(columna); });
  if (columnasFinales.length > 50) throw new Error("La combinación de columnas existentes y nuevas supera el máximo de 50.");

  const columnasComunes = [...new Set(columnasImportadas.filter(columna => columnas.includes(columna)))];
  const columnasAgregadas = columnasFinales.filter(columna => !columnas.includes(columna));
  if (items.length) {
    const detalleComparacion = columnasComunes.length >= 2
      ? `Se compararán las filas mediante ${columnasComunes.length} columnas comunes y se omitirán las ya existentes.`
      : "El archivo comparte menos de dos columnas con el inventario, por lo que sólo se podrán descartar duplicados dentro del propio archivo.";
    const detalleColumnas = columnasAgregadas.length ? ` Se incorporarán ${columnasAgregadas.length} columnas nuevas.` : "";
    const continuar = await window.OverTrackUI.confirmarAccion({ titulo: "Importación incremental", mensaje: `${detalleComparacion}${detalleColumnas} No se eliminarán registros, responsables ni evidencias anteriores.`, tipo: "advertencia", textoConfirmar: "Agregar sólo nuevos", textoCancelar: "Cancelar" });
    if (!continuar) return;
  }

  const puedeCompararExistentes = columnasComunes.length >= 2;
  const huellasExistentes = new Set(puedeCompararExistentes
    ? items.map(item => JSON.stringify(columnasComunes.map(columna => valorComparable(item.datos?.[columna]))))
    : []);
  const huellasArchivo = new Set();
  const registrosPreparados = [];
  let omitidosExistentes = 0;
  let omitidosArchivo = 0;
  registros.forEach(fila => {
    const datos = {};
    columnasImportadas.forEach((columna, posicion) => { datos[columna] = String(fila[encabezado.indices[posicion]] ?? "").trim().slice(0, 500); });
    const huellaArchivo = JSON.stringify(columnasImportadas.map(columna => valorComparable(datos[columna])));
    if (huellasArchivo.has(huellaArchivo)) { omitidosArchivo += 1; return; }
    huellasArchivo.add(huellaArchivo);
    const valoresComunes = columnasComunes.map(columna => valorComparable(datos[columna]));
    const comparable = puedeCompararExistentes && valoresComunes.some(Boolean);
    const huellaExistente = JSON.stringify(valoresComunes);
    if (comparable && huellasExistentes.has(huellaExistente)) { omitidosExistentes += 1; return; }
    if (comparable) huellasExistentes.add(huellaExistente);
    registrosPreparados.push(datos);
  });

  const botonImportar = $("btnImportarInventario");
  try {
    for (let inicio = 0; inicio < registrosPreparados.length; inicio += 100) {
      botonImportar.textContent = `Importando ${Math.min(inicio + 100, registrosPreparados.length)}/${registrosPreparados.length}`;
      const batch = writeBatch(db);
      registrosPreparados.slice(inicio, inicio + 100).forEach(datos => {
        const referencia = doc(collection(db, "inventarioItems"));
        batch.set(referencia, { empresaId, sucursalId, datos, fechaCreacion: serverTimestamp(), fechaActualizacion: serverTimestamp(), creadoPor: usuario.uid, actualizadoPor: usuario.uid });
      });
      await batch.commit();
    }
    await setDoc(doc(db, "inventarioConfiguraciones", claveConfiguracion()), { empresaId, sucursalId, columnas: columnasFinales, fechaActualizacion: serverTimestamp(), actualizadoPor: usuario.uid }, { merge: true });
  } catch (error) {
    throw new Error(`La importación se interrumpió durante el proceso. Puedes volver a importar el mismo archivo para continuar. Detalle: ${error.message || error}`);
  }
  await cargarInventario();
  const resumenOmitidos = [
    omitidosExistentes ? `${omitidosExistentes} ya existentes` : "",
    omitidosArchivo ? `${omitidosArchivo} repetidos dentro del archivo` : ""
  ].filter(Boolean).join(" y ");
  const resumenColumnas = columnasAgregadas.length ? ` Se agregaron ${columnasAgregadas.length} columnas nuevas.` : "";
  await mensaje({ titulo: registrosPreparados.length ? "Inventario actualizado" : "Sin registros nuevos", texto: `${registrosPreparados.length} registros nuevos agregados.${resumenOmitidos ? ` Se omitieron ${resumenOmitidos}.` : ""}${resumenColumnas}`, tipo: "exito" });
}

async function guardarFila(fila) {
  const itemId = fila.dataset.itemId;
  if (operacionesInventarioEnCurso.has(itemId)) return;
  const datos = {};
  fila.querySelectorAll("[data-columna]").forEach(input => { datos[input.dataset.columna] = input.value.trim().slice(0, 500); });
  const retiraUsuarioId = fila.querySelector("[data-retira]")?.value || "";
  const perfilRetira = usuariosRetiro.find(item => item.id === retiraUsuarioId);
  const retiraNombre = perfilRetira ? (perfilRetira.nombreCompleto || perfilRetira.nombre || perfilRetira.email || "Usuario") : "";
  if (!Object.values(datos).some(Boolean)) throw new Error("El registro no puede quedar completamente vacío.");
  await asegurarInventarioCompleto();
  const huella = JSON.stringify(columnas.map(c => String(datos[c] ?? "").trim().toLowerCase()));
  const duplicado = items.some(item => item.id !== itemId && JSON.stringify(columnas.map(c => String(item.datos?.[c] ?? "").trim().toLowerCase())) === huella);
  if (duplicado) throw new Error("Ya existe otro registro con los mismos datos.");

  const boton = fila.querySelector(".inventario-guardar");
  try {
    operacionesInventarioEnCurso.add(itemId);
    if (boton) boton.disabled = true;
    await updateDoc(doc(db, "inventarioItems", itemId), { datos, retiraUsuarioId, retiraNombre, fechaActualizacion: serverTimestamp(), actualizadoPor: usuario.uid });
    await mensaje({ titulo: "Registro actualizado", texto: "Los cambios fueron guardados correctamente.", tipo: "exito" });
    await cargarInventario();
  } finally {
    operacionesInventarioEnCurso.delete(itemId);
    if (boton?.isConnected) boton.disabled = false;
  }
}

async function eliminarFila(fila) {
  const itemId = fila.dataset.itemId;
  if (operacionesInventarioEnCurso.has(itemId)) return;
  const confirmar = await window.OverTrackUI.confirmarAccion({ titulo: "Eliminar repuesto", mensaje: "El registro se eliminará definitivamente del inventario.", tipo: "advertencia", textoConfirmar: "Eliminar", textoCancelar: "Cancelar", peligrosa: true });
  if (!confirmar) return;
  try {
    operacionesInventarioEnCurso.add(itemId);
    fila.querySelectorAll("button").forEach(boton => { boton.disabled = true; });
    const item = items.find(registro => registro.id === itemId);
    await Promise.all(evidenciasItem(item).map(evidencia => evidencia.ruta ? deleteObject(ref(storage, evidencia.ruta)).catch(error => { if (error?.code !== "storage/object-not-found") throw error; }) : Promise.resolve()));
    await deleteDoc(doc(db, "inventarioItems", itemId));
    await cargarInventario();
  } finally {
    operacionesInventarioEnCurso.delete(itemId);
    if (fila.isConnected) fila.querySelectorAll("button").forEach(boton => { boton.disabled = false; });
  }
}

function abrirModalRepuesto() {
  if (!sucursalId) return mensaje({ titulo: "Sucursal requerida", texto: "Selecciona una sucursal antes de agregar un repuesto.", tipo: "advertencia" });
  if (!columnas.length) return mensaje({ titulo: "Estructura pendiente", texto: "Importa primero un Excel para definir las columnas del inventario.", tipo: "advertencia" });
  $("camposRepuesto").innerHTML = columnas.map((c, i) => {
    const esFecha = /fecha/i.test(c);
    return `<label><span>${escapar(c)}</span><input type="${esFecha ? "date" : "text"}" name="campo_${i}" data-columna="${escapar(c)}"${esFecha ? ' aria-label="Seleccionar fecha en el calendario"' : ""}></label>`;
  }).join("");
  $("modalRepuesto").hidden = false;
  $("camposRepuesto").querySelector("input")?.focus();
}

function cerrarModalRepuesto() { $("modalRepuesto").hidden = true; $("formRepuesto").reset(); }

async function guardarNuevoRepuesto(evento) {
  evento.preventDefault();
  const claveOperacion = "nuevo-repuesto";
  if (operacionesInventarioEnCurso.has(claveOperacion)) return;
  const datos = {};
  $("camposRepuesto").querySelectorAll("[data-columna]").forEach(input => { datos[input.dataset.columna] = input.value.trim().slice(0, 500); });
  if (!Object.values(datos).some(Boolean)) return mensaje({ titulo: "Registro vacío", texto: "Completa al menos un campo del repuesto.", tipo: "advertencia" });
  await asegurarInventarioCompleto();
  const huella = JSON.stringify(columnas.map(c => String(datos[c] ?? "").trim().toLowerCase()));
  if (items.some(item => JSON.stringify(columnas.map(c => String(item.datos?.[c] ?? "").trim().toLowerCase())) === huella)) {
    return mensaje({ titulo: "Registro duplicado", texto: "Ya existe un registro con los mismos datos.", tipo: "advertencia" });
  }

  const boton = evento.submitter;
  try {
    operacionesInventarioEnCurso.add(claveOperacion);
    if (boton) { boton.disabled = true; boton.textContent = "Guardando…"; }
    await addDoc(collection(db, "inventarioItems"), { empresaId, sucursalId, datos, fechaCreacion: serverTimestamp(), fechaActualizacion: serverTimestamp(), creadoPor: usuario.uid, actualizadoPor: usuario.uid });
    cerrarModalRepuesto();
    await cargarInventario();
    await mensaje({ titulo: "Repuesto agregado", texto: "El registro fue agregado correctamente.", tipo: "exito" });
  } finally {
    operacionesInventarioEnCurso.delete(claveOperacion);
    if (boton?.isConnected) { boton.disabled = false; boton.textContent = "Guardar repuesto"; }
  }
}

function filtrarInventario() {
  const texto = $("buscarInventario").value.trim().toLowerCase();
  itemsFiltrados = !texto ? [...items] : items.filter(item => columnas.some(c => String(item.datos?.[c] ?? "").toLowerCase().includes(texto)));
  renderInventario();
}

async function exportarInventario() {
  await asegurarInventarioCompleto();
  if (!items.length) return mensaje({ titulo: "Inventario vacío", texto: "No existen registros para exportar.", tipo: "advertencia" });
  const datos = items.map(item => Object.fromEntries(columnas.map(c => [c, item.datos?.[c] ?? ""])));
  const hoja = XLSX.utils.json_to_sheet(datos, { header: columnas });
  const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, "Inventario");
  XLSX.writeFile(libro, `Inventario_${sucursalId}.xlsx`);
}

function configurarEventos() {
  $("selectorSucursalInventario").addEventListener("change", async e => { sucursalId = e.target.value; await cargarUsuariosRetiro(); await cargarInventario(); });
  $("buscarInventario").addEventListener("input", () => {
    clearTimeout(timerBusquedaInventario);
    timerBusquedaInventario = setTimeout(async () => {
      if ($("buscarInventario").value.trim()) await asegurarInventarioCompleto();
      filtrarInventario();
    }, 300);
  });
  $("btnCargarMasInventario").addEventListener("click", async () => {
    try { await cargarInventario({ reiniciar: false }); }
    catch (error) { await mensaje({ titulo: "No se pudo cargar más", texto: error.message || "Intenta nuevamente.", tipo: "error" }); }
  });
  $("btnImportarInventario").addEventListener("click", () => $("archivoInventario").click());
  $("archivoInventario").addEventListener("change", async e => { const archivo = e.target.files?.[0]; if (!archivo || importacionEnCurso) return; const boton = $("btnImportarInventario"); try { importacionEnCurso = true; boton.disabled = true; boton.textContent = "Importando…"; await importarExcel(archivo); } catch (error) { await mensaje({ titulo: "No se pudo importar", texto: error.message || "Revisa el archivo Excel.", tipo: "error" }); } finally { importacionEnCurso = false; boton.disabled = false; boton.textContent = "Importar Excel"; e.target.value = ""; } });
  $("btnAgregarInventario").addEventListener("click", abrirModalRepuesto);
  $("btnExportarInventario").addEventListener("click", async () => {
    try { await exportarInventario(); }
    catch (error) { await mensaje({ titulo: "No se pudo exportar", texto: error.message || "Intenta nuevamente.", tipo: "error" }); }
  });
  $("cerrarModalRepuesto").addEventListener("click", cerrarModalRepuesto);
  $("cancelarModalRepuesto").addEventListener("click", cerrarModalRepuesto);
  $("formRepuesto").addEventListener("submit", guardarNuevoRepuesto);
  $("tablaInventario").addEventListener("click", async e => { const fila = e.target.closest("tr[data-item-id]"); if (!fila) return; try { if (e.target.closest(".inventario-guardar")) await guardarFila(fila); if (e.target.closest(".inventario-eliminar")) await eliminarFila(fila); } catch (error) { await mensaje({ titulo: "No se pudo completar", texto: error.message || "Intenta nuevamente.", tipo: "error" }); } });
  $("tablaInventario").addEventListener("change", async e => { if (!e.target.matches("[data-evidencia]")) return; const fila = e.target.closest("tr[data-item-id]"); try { await subirEvidencias(fila, e.target.files); } catch (error) { e.target.value = ""; await mensaje({ titulo: "No se pudo adjuntar", texto: error.message || "Intenta nuevamente.", tipo: "error" }); } });
  [$("btnSalirInventario"), $("btnSalirInventarioTop")].forEach(b => b.addEventListener("click", cerrarSesion));
  $("menuPanelEmpresaInventario").addEventListener("click", () => { window.location.href = `empresa-admin.html?id=${encodeURIComponent(empresaId)}`; });
}

function configurarMenuMovil() {
  const boton = document.querySelector(".mobile-menu-toggle"), fondo = document.querySelector(".mobile-menu-backdrop"), sidebar = $("inventarioSidebar");
  const cambiar = abierto => { document.body.classList.toggle("menu-mobile-open", abierto); boton.setAttribute("aria-expanded", String(abierto)); };
  boton.addEventListener("click", () => cambiar(!document.body.classList.contains("menu-mobile-open")));
  fondo.addEventListener("click", () => cambiar(false));
  sidebar.addEventListener("keydown", evento => {
    const opcion = evento.target.closest('[role="button"]');
    if (!opcion || (evento.key !== "Enter" && evento.key !== " ")) return;
    evento.preventDefault();
    opcion.click();
  });
  document.addEventListener("keydown", evento => {
    if (evento.key === "Escape") cambiar(false);
  });
}

async function iniciar() {
  configurarEventos(); configurarMenuMovil();
  $("usuarioNombre").textContent = usuario.nombre || "Usuario";
  $("usuarioRol").textContent = usuario.rol || "Rol";
  const esBodeguero = usuario.rol === "bodeguero";
  $("menuDashboardInventario").style.display = esBodeguero ? "none" : "";
  $("menuOrdenesInventario").style.display = esBodeguero ? "none" : "";
  $("menuProgramacionInventario").style.display = esBodeguero ? "" : "none";
  puedeEditar = ["super_admin", "admin_empresa", "admin_sucursal", "jefe_taller", "planificador", "bodeguero"].includes(usuario.rol);
  if (!puedeEditar) $("accionesEdicionInventario").querySelectorAll("button").forEach(b => { if (b.id !== "btnExportarInventario") b.style.display = "none"; });
  if (["super_admin", "admin_empresa"].includes(usuario.rol)) $("menuPanelEmpresaInventario").style.display = "";
  try { if (!(await cargarEmpresa())) return; await cargarSucursales(); } catch (error) { await mensaje({ titulo: "No se pudo cargar Inventario", texto: error.message || "Intenta nuevamente.", tipo: "error" }); }
}

document.addEventListener("DOMContentLoaded", iniciar);
