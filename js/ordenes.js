import { protegerPagina, cerrarSesion, reautenticarAccionCritica } from "./session.js?v=20261017-1";
import { db } from "./firebase-config.js";
import { obtenerModulosEmpresa, moduloActivo } from "./modulos.js?v=20261018-2";
import { asegurarResumenesOT } from "./modulos/core/resumenOT.js";
import { puedeVerOrdenesServicio, puedeCrearOT, puedeAbrirOT, puedeEntrarPanelEmpresa } from "./permisos.js?v=20261029-1";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  limit,
  startAfter
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
const enviarOTPapelera = httpsCallable(getFunctions(undefined, "us-central1"), "enviarOTPapelera");
const restaurarOTPapelera = httpsCallable(getFunctions(undefined, "us-central1"), "restaurarOTPapelera");
const eliminarOTPapelera = httpsCallable(getFunctions(undefined, "us-central1"), "eliminarOTPapelera");

const usuario = protegerPagina(["admin_empresa", "admin_sucursal", "jefe_taller", "supervisor", "tecnico", "planificador"]);
if (!usuario) throw new Error("Acceso no autorizado");

const POR_PAGINA = 20;
let empresaActual = null;
let listaOrdenes = [];
let listaVisible = [];
let pagina = 1;

function textoSeguro(valor = "") {
  return String(valor).replace(/[&<>'"]/g, caracter => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[caracter]);
}

function estaCerrada(ot) {
  return ot?.cerrada === true || ot?.estado === "CERRADA";
}

function estaAtrasada(ot) {
  if (estaCerrada(ot) || !ot?.gantt?.fechaTermino) return false;
  const termino = new Date(`${ot.gantt.fechaTermino}T00:00:00`);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return termino < hoy;
}

function nombreEstado(ot) {
  if (ot.flujoVersion === 2 && !ot.cerrada) return ot.etapaActualNombre || "En proceso";
  if (estaCerrada(ot)) return "Cerrada";
  if (estaAtrasada(ot)) return "Atrasada";
  const estados = {
    INGRESO: "Ingreso", EVALUACION: "Evaluación", OVERHAUL: "Mantención",
    PRUEBAS: "Pruebas", DESPACHO: "Despacho"
  };
  return estados[ot.estado] || "Activa";
}

function fechaVisible(ot) {
  const valor = ot.fechaActualizacion || ot.actualizadoEn || ot.fechaCreacion;
  const fecha = valor?.toDate ? valor.toDate() : valor ? new Date(valor) : null;
  return fecha && !Number.isNaN(fecha.getTime())
    ? fecha.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })
    : "Sin fecha";
}

function marcaTiempo(ot) {
  const valor = ot.fechaActualizacion || ot.actualizadoEn || ot.fechaCreacion;
  if (valor?.toMillis) return valor.toMillis();
  if (valor?.toDate) return valor.toDate().getTime();
  const fecha = valor ? new Date(valor) : null;
  return fecha && !Number.isNaN(fecha.getTime()) ? fecha.getTime() : 0;
}

async function cargarEmpresa() {
  const empresaId = usuario.rol === "super_admin"
    ? sessionStorage.getItem("empresaIdOperacionAdmin")
    : usuario.empresaId;

  if (!empresaId) {
    alert("No se encontró la empresa seleccionada.");
    window.location.replace(usuario.rol === "super_admin" ? "super-admin.html" : "index.html");
    return false;
  }

  const empresaSnap = await getDoc(doc(db, "empresas", empresaId));
  if (!empresaSnap.exists()) {
    alert("La empresa seleccionada ya no existe.");
    return false;
  }

  empresaActual = { id: empresaSnap.id, ...empresaSnap.data() };
  obtenerModulosEmpresa(empresaActual);

  if (!puedeVerOrdenesServicio(usuario, empresaActual)) {
    alert("No tienes permiso para consultar las Órdenes de Trabajo.");
    window.location.replace("dashboard.html");
    return false;
  }

  return true;
}

function aplicarFiltros() {
  const texto = document.getElementById("buscarOrdenes").value.trim().toLowerCase();
  const estado = document.getElementById("estadoOrdenes").value;

  listaVisible = listaOrdenes.filter(ot => {
    const coincideTexto = [ot.os, ot.equipo, ot.serie, ot.cliente]
      .some(valor => String(valor || "").toLowerCase().includes(texto));
    const coincideEstado = estado === "todas"
      || (estado === "activas" && !estaCerrada(ot))
      || (estado === "atrasadas" && estaAtrasada(ot))
      || (estado === "cerradas" && estaCerrada(ot));
    return coincideTexto && coincideEstado;
  });

  const paginas = Math.max(1, Math.ceil(listaVisible.length / POR_PAGINA));
  pagina = Math.min(pagina, paginas);
  renderizar();
}

function renderizar() {
  const contenedor = document.getElementById("listaOrdenesCompleta");
  const inicio = (pagina - 1) * POR_PAGINA;
  const registros = listaVisible.slice(inicio, inicio + POR_PAGINA);
  const paginas = Math.max(1, Math.ceil(listaVisible.length / POR_PAGINA));

  contenedor.innerHTML = registros.map(ot => {
    const clase = estaCerrada(ot) ? "cerrada" : estaAtrasada(ot) ? "atrasada" : "activa";
    return `
      <article class="orden-item ${clase}">
        <div class="orden-item-principal">
          <div><span class="orden-etiqueta">ORDEN DE TRABAJO</span><h3>${textoSeguro(ot.os || "Sin número")}</h3></div>
          <span class="orden-estado ${clase}">${textoSeguro(nombreEstado(ot))}</span>
        </div>
        <div class="orden-item-datos">
          <div><small>Equipo</small><strong>${textoSeguro(ot.equipo || "Sin equipo")}</strong></div>
          <div><small>Serie</small><strong>${textoSeguro(ot.serie || "Sin serie")}</strong></div>
          <div><small>Cliente</small><strong>${textoSeguro(ot.cliente || "Sin cliente")}</strong></div>
          <div><small>Actualización</small><strong>${textoSeguro(fechaVisible(ot))}</strong></div>
        </div>
        <div class="orden-item-acciones">
          <button type="button" class="btn-card-open" data-ot-id="${textoSeguro(ot.id)}">${estaCerrada(ot) ? "Consultar OT" : "Abrir OT"}</button>
          ${puedeCrearOT(usuario, empresaActual) ? `<button type="button" class="btn-card-delete" data-eliminar-ot="${textoSeguro(ot.id)}">Enviar a papelera</button>` : ""}
        </div>
      </article>`;
  }).join("");

  document.getElementById("totalOrdenesVista").textContent = `${listaVisible.length} ${listaVisible.length === 1 ? "orden" : "órdenes"}`;
  document.getElementById("estadoCargaOrdenes").textContent = listaOrdenes.length ? "Historial actualizado" : "Sin registros";
  document.getElementById("ordenesVacio").hidden = registros.length > 0;
  document.getElementById("paginaActual").textContent = `Página ${pagina} de ${paginas}`;
  document.getElementById("paginaAnterior").disabled = pagina <= 1;
  document.getElementById("paginaSiguiente").disabled = pagina >= paginas;
}

async function escucharOrdenes() {
  const restricciones = [where("empresaId", "==", empresaActual.id)];

  if (usuario.rol !== "super_admin" && usuario.rol !== "admin_empresa") {
    if (!usuario.sucursalId) {
      document.getElementById("estadoCargaOrdenes").textContent =
        "Usuario sin sucursal asignada";
      window.OverTrackUI?.finalizarCargaPagina?.();
      return;
    }
    restricciones.push(where("sucursalId", "==", usuario.sucursalId));
  }

  let coleccionListado = "otsResumen";
  try {
    await asegurarResumenesOT(restricciones);
  } catch (error) {
    console.warn("No fue posible preparar los resúmenes de OT; se usará la colección completa.", error);
    coleccionListado = "ots";
  }

  const consulta = query(
    collection(db, coleccionListado),
    ...restricciones,
    orderBy("fechaCreacion", "desc")
  );

  onSnapshot(consulta, snapshot => {
    listaOrdenes = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => marcaTiempo(b) - marcaTiempo(a));
    aplicarFiltros();
    window.OverTrackUI?.finalizarCargaPagina?.();
  }, error => {
    console.error("No fue posible cargar las órdenes:", error);
    document.getElementById("estadoCargaOrdenes").textContent = "No se pudo cargar";
    window.OverTrackUI?.finalizarCargaPagina?.();
  });
}

function abrirOT(id) {
  if (!puedeAbrirOT(usuario, empresaActual)) return;
  localStorage.setItem("otActiva", id);
  window.location.href = "flujo.html";
}

function nuevaOT() {
  if (!puedeCrearOT(usuario, empresaActual)) return;
  localStorage.removeItem("otActiva");
  window.location.href = "flujo.html";
}

async function eliminarOT(id) {
  if (!puedeCrearOT(usuario, empresaActual) || !id) return;
  const confirmar = window.OverTrackUI?.confirmarAccion
    ? await window.OverTrackUI.confirmarAccion({
        titulo: "Enviar orden a la papelera",
        mensaje: "La OS se enviará a la papelera de tu sucursal. Podrás restaurarla junto con sus archivos. Los archivos seguirán ocupando almacenamiento.",
        tipo: "advertencia",
        textoConfirmar: "Enviar a papelera",
        textoCancelar: "Cancelar",
        peligrosa: true
      })
    : window.confirm("¿Enviar esta OS a la papelera?");
  if (!confirmar) return;
  if (!(await reautenticarAccionCritica("enviar esta orden de servicio a la papelera"))) return;
  const eliminar = async () => {
    await enviarOTPapelera({ otId: id });
    if (!document.getElementById("papeleraOT").hidden) await cargarPapelera();
  };
  if (window.OverTrackUI?.ejecutarConCarga) {
    await window.OverTrackUI.ejecutarConCarga(eliminar, "Enviando orden a la papelera…");
  } else {
    await eliminar();
  }
}

let cursorPapelera = null;
let cargandoPapelera = false;
function plazoPapelera(datos, ahora = Date.now()) {
  const inicio = datos.eliminadoEn?.toDate?.()?.getTime();
  if (!Number.isFinite(inicio)) return null;
  const aviso = datos.avisoEliminacionEn?.toDate?.()?.getTime();
  const limite = Math.max(inicio + 15 * 86400000, Number.isFinite(aviso) ? aviso + 3 * 86400000 : 0);
  const dias = Math.max(0, Math.ceil((limite - ahora) / 86400000));
  const revision = datos.ultimaRevisionPapeleraEn?.toDate?.()?.getTime();
  const proxima = datos.proximaRevisionPapeleraEn?.toDate?.()?.getTime();
  const fecha = ms => new Date(ms).toLocaleString("es-CL");
  let texto = `Conservación mínima hasta ${fecha(limite)}. Recibirás un aviso cuando la revisión programe su eliminación.`;
  if (Number.isFinite(aviso)) {
    texto = `Aviso registrado el ${fecha(aviso)}. ${Number.isFinite(revision) && revision >= limite ? "Plazo cumplido; eliminación pendiente." : `La OT se conserva. Puede eliminarse a partir del ${fecha(limite)}.`}`;
    if (Number.isFinite(revision)) texto += ` Última revisión: ${fecha(revision)}.`;
    if (Number.isFinite(proxima)) texto += ` Próxima revisión prevista: ${fecha(proxima)}.`;
  }
  return { limite, dias, urgente: Number.isFinite(aviso), texto };
}
async function cargarAvisosPapelera() {
  if (usuario.rol !== "jefe_taller" || !usuario.sucursalId) return;
  const contenedor = document.getElementById("avisosPapeleraOT");
  if (!contenedor) return;
  const resultado = await getDocs(query(collection(db, "otsPapelera"),
    where("empresaId", "==", empresaActual.id), where("sucursalId", "==", usuario.sucursalId),
    where("avisoEliminacionEn", "<=", new Date()), limit(20)));
  contenedor.replaceChildren();
  contenedor.hidden = resultado.empty;
  if (resultado.empty) return;
  const titulo = document.createElement("strong");
  titulo.textContent = "OT próximas a eliminarse de la papelera";
  contenedor.appendChild(titulo);
  for (const documento of resultado.docs) {
    const datos = documento.data(), plazo = plazoPapelera(datos);
    if (!plazo) continue;
    const aviso = document.createElement("p");
    aviso.textContent = `${datos.os || "Sin OS"} · ${plazo.texto} Restaura la OT para conservarla.`;
    contenedor.appendChild(aviso);
  }
  const abrir = document.createElement("button");
  abrir.type = "button"; abrir.className = "papelera-restaurar"; abrir.textContent = "Revisar papelera";
  abrir.addEventListener("click", () => {
    document.getElementById("papeleraOT").hidden = false;
    document.getElementById("btnPapeleraOT").setAttribute("aria-expanded", "true");
    cargarPapelera().catch(error => alert(error.message));
  });
  contenedor.appendChild(abrir);
  if (resultado.size === 20) {
    const nota = document.createElement("p"); nota.textContent = "Se muestran hasta 20 avisos. Revisa la papelera para ver todas las OT."; contenedor.appendChild(nota);
  }
}
function mostrarPapeleraVacia(lista) {
  lista.innerHTML = '<div class="papelera-vacia"><span aria-hidden="true">✓</span><strong>No hay OT en la papelera</strong><p>Las órdenes que envíes a la papelera aparecerán aquí.</p></div>';
}
async function cargarPapelera(mas = false) {
  if (usuario.rol !== "jefe_taller" || !usuario.sucursalId || cargandoPapelera) return;
  cargandoPapelera = true;
  const lista = document.getElementById("listaPapeleraOT");
  const botonMas = document.getElementById("masPapeleraOT");
  botonMas.disabled = true;
  try {
    if (!mas) { lista.replaceChildren(); cursorPapelera = null; }
    const filtros = [where("empresaId", "==", empresaActual.id), where("sucursalId", "==", usuario.sucursalId)];
    if (mas && cursorPapelera) filtros.push(startAfter(cursorPapelera));
    const resultado = await getDocs(query(collection(db, "otsPapelera"), ...filtros, limit(20)));
    cursorPapelera = resultado.docs.at(-1) || null;
    if (!mas && resultado.empty) mostrarPapeleraVacia(lista);
    for (const documento of resultado.docs) {
      const datos = documento.data();
      const fila = document.createElement("article");
      fila.className = "papelera-item";
      fila.setAttribute("role", "listitem");
      const informacion = document.createElement("div");
      informacion.className = "papelera-item-info";
      const etiqueta = document.createElement("small");
      etiqueta.textContent = "ORDEN DE TRABAJO";
      const nombre = document.createElement("h4");
      nombre.textContent = datos.os || "Sin OS";
      const equipo = document.createElement("p");
      equipo.textContent = [datos.equipo || "Equipo sin especificar", datos.orden?.cliente].filter(Boolean).join(" · ");
      informacion.append(etiqueta, nombre, equipo);
      if (typeof datos.eliminadoEn?.toDate === "function") {
        const fecha = datos.eliminadoEn.toDate();
        if (!Number.isNaN(fecha.getTime())) {
          const detalle = document.createElement("span");
          detalle.className = "papelera-item-fecha";
          detalle.textContent = `Enviada el ${fecha.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })}`;
          informacion.appendChild(detalle);
        }
      }
      const boton = document.createElement("button");
      const plazo = plazoPapelera(datos);
      if (plazo) {
        const detalle = document.createElement("span");
        detalle.className = `papelera-plazo ${plazo.urgente ? "urgente" : ""}`;
        detalle.textContent = plazo.texto;
        informacion.appendChild(detalle);
      }
      boton.type = "button"; boton.className = "papelera-restaurar"; boton.textContent = "Restaurar OT";
      boton.disabled = !puedeCrearOT(usuario, empresaActual) || datos.borradoPendiente === true;
      boton.addEventListener("click", async () => {
        if (!(await reautenticarAccionCritica("restaurar esta orden de servicio"))) return;
        boton.disabled = true;
        try {
          await restaurarOTPapelera({ otId: documento.id });
          fila.remove();
          cargarAvisosPapelera().catch(console.warn);
          if (!lista.querySelector(".papelera-item") && botonMas.hidden) mostrarPapeleraVacia(lista);
        } catch (error) { alert(error.message || "No fue posible restaurar la OT."); }
        finally { boton.disabled = datos.borradoPendiente === true; }
      });
      fila.append(informacion, boton); lista.appendChild(fila);
      const eliminar = document.createElement("button");
      eliminar.type = "button";
      eliminar.className = "papelera-eliminar";
      eliminar.textContent = datos.borradoPendiente ? "Reintentar eliminación" : "Eliminar definitivamente";
      eliminar.disabled = !puedeCrearOT(usuario, empresaActual);
      eliminar.addEventListener("click", async () => {
        const mensaje = `Se eliminará definitivamente la OT «${datos.os || "Sin OS"}» y todos sus archivos adjuntos. No podrá restaurarse desde la papelera. El inventario se conservará. ¿Deseas continuar?`;
        const confirmar = window.OverTrackUI?.confirmarAccion
          ? await window.OverTrackUI.confirmarAccion({ titulo: "Eliminar OT definitivamente", mensaje, tipo: "advertencia", peligrosa: true, textoConfirmar: "Eliminar definitivamente", textoCancelar: "Cancelar" })
          : window.confirm(mensaje);
        if (!confirmar || !(await reautenticarAccionCritica("eliminar definitivamente esta OT y sus archivos"))) return;
        boton.disabled = true; eliminar.disabled = true;
        try {
          await eliminarOTPapelera({ otId: documento.id });
          fila.remove();
          cargarAvisosPapelera().catch(console.warn);
          if (!lista.querySelector(".papelera-item") && botonMas.hidden) mostrarPapeleraVacia(lista);
        } catch (error) {
          eliminar.textContent = "Reintentar eliminación";
          alert(error.message || "No se pudo completar la eliminación. Puedes reintentar.");
        } finally { eliminar.disabled = false; }
      });
      fila.appendChild(eliminar);
    }
    botonMas.hidden = resultado.size < 20;
  } finally { cargandoPapelera = false; botonMas.disabled = false; }
}

function volverPanelEmpresa() {
  const destino = usuario.rol === "super_admin"
    ? `empresa-admin.html?id=${encodeURIComponent(empresaActual.id)}`
    : `empresa-admin.html?id=${encodeURIComponent(usuario.empresaId)}`;
  window.location.href = destino;
}

function configurarInterfaz() {
  document.getElementById("btnPapeleraOT").hidden = usuario.rol !== "jefe_taller";
  document.getElementById("btnPapeleraOT").addEventListener("click", () => {
    const panel = document.getElementById("papeleraOT");
    panel.hidden = !panel.hidden;
    document.getElementById("btnPapeleraOT").setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) cargarPapelera().catch(error => alert(error.message));
  });
  document.getElementById("masPapeleraOT").addEventListener("click", () => cargarPapelera(true).catch(error => alert(error.message)));
  document.getElementById("usuarioNombre").textContent = usuario.nombre || usuario.email || "Usuario";
  document.getElementById("usuarioRol").textContent = String(usuario.rol || "").replaceAll("_", " ");
  document.getElementById("menuNuevaOT").style.display = puedeCrearOT(usuario, empresaActual) ? "" : "none";
  document.getElementById("btnPanelEmpresa").style.display = puedeEntrarPanelEmpresa(usuario, empresaActual) ? "" : "none";
  const rolesModulosOperativos = ["super_admin", "admin_empresa", "admin_sucursal", "jefe_taller", "planificador"];
  document.getElementById("menuInventarioOrdenes").style.display = moduloActivo(empresaActual, "inventario") && rolesModulosOperativos.includes(usuario.rol) ? "" : "none";
  document.getElementById("menuSheqOrdenes").style.display = moduloActivo(empresaActual, "sheq") && rolesModulosOperativos.includes(usuario.rol) ? "" : "none";
  document.getElementById("menuProgramacionOrdenes").style.display = moduloActivo(empresaActual, "programacion") && ["super_admin", "admin_empresa", "admin_sucursal", "jefe_taller", "planificador", "supervisor", "tecnico"].includes(usuario.rol) ? "" : "none";

  document.getElementById("buscarOrdenes").addEventListener("input", () => { pagina = 1; aplicarFiltros(); });
  document.getElementById("estadoOrdenes").addEventListener("change", () => { pagina = 1; aplicarFiltros(); });
  document.getElementById("paginaAnterior").addEventListener("click", () => { pagina--; renderizar(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  document.getElementById("paginaSiguiente").addEventListener("click", () => { pagina++; renderizar(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  document.getElementById("listaOrdenesCompleta").addEventListener("click", evento => {
    const eliminar = evento.target.closest("[data-eliminar-ot]");
    if (eliminar) {
      eliminarOT(eliminar.dataset.eliminarOt).catch(error => {
        console.error("No fue posible eliminar la OS:", error);
        alert("No fue posible eliminar la OS.");
      });
      return;
    }
    const boton = evento.target.closest("[data-ot-id]");
    if (boton) abrirOT(boton.dataset.otId);
  });
  document.getElementById("btnCerrarSesion").addEventListener("click", cerrarSesion);
  document.getElementById("btnCerrarSesionDesktop").addEventListener("click", cerrarSesion);

  const botonMenu = document.querySelector(".mobile-menu-toggle");
  const fondo = document.querySelector(".mobile-menu-backdrop");
  const sidebar = document.getElementById("ordenesSidebar");
  const cambiarMenu = abierto => {
    document.body.classList.toggle("menu-mobile-open", abierto);
    botonMenu.setAttribute("aria-expanded", String(abierto));
  };
  botonMenu.addEventListener("click", () => cambiarMenu(!document.body.classList.contains("menu-mobile-open")));
  fondo.addEventListener("click", () => cambiarMenu(false));
  sidebar.addEventListener("keydown", evento => {
    const opcion = evento.target.closest('[role="button"]');
    if (!opcion || (evento.key !== "Enter" && evento.key !== " ")) return;
    evento.preventDefault();
    opcion.click();
  });
  document.addEventListener("keydown", evento => {
    if (evento.key === "Escape") cambiarMenu(false);
  });
}

window.nuevaOT = nuevaOT;
window.volverPanelEmpresa = volverPanelEmpresa;

window.addEventListener("DOMContentLoaded", async () => {
  try {
    if (!await cargarEmpresa()) {
      window.OverTrackUI?.finalizarCargaPagina?.();
      return;
    }
    configurarInterfaz();
    cargarAvisosPapelera().catch(error => console.warn("No fue posible consultar los avisos de papelera:", error));
    escucharOrdenes();
  } catch (error) {
    console.error("No fue posible iniciar el archivo de órdenes:", error);
    alert("No fue posible cargar esta sección.");
    window.OverTrackUI?.finalizarCargaPagina?.();
  }
});
