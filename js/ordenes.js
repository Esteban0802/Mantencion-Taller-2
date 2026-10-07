import { protegerPagina, cerrarSesion } from "./session.js?v=20261004-2";
import { db } from "./firebase-config.js";
import { obtenerModulosEmpresa } from "./modulos.js";
import { asegurarResumenesOT } from "./modulos/core/resumenOT.js";
import { puedeVerOrdenesServicio, puedeCrearOT, puedeAbrirOT, puedeEntrarPanelEmpresa } from "./permisos.js";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const usuario = protegerPagina(["super_admin", "admin_empresa", "admin_sucursal", "jefe_taller", "usuario_taller", "supervisor", "tecnico", "planificador"]);
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
          ${usuario.rol === "jefe_taller" ? `<button type="button" class="btn-card-delete" data-eliminar-ot="${textoSeguro(ot.id)}">Eliminar OS</button>` : ""}
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
  }, error => {
    console.error("No fue posible cargar las órdenes:", error);
    document.getElementById("estadoCargaOrdenes").textContent = "No se pudo cargar";
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
  if (usuario.rol !== "jefe_taller" || !id) return;
  const confirmar = window.OverTrackUI?.confirmarAccion
    ? await window.OverTrackUI.confirmarAccion({
        titulo: "Eliminar orden de servicio",
        mensaje: "La OS y su registro en el historial se eliminarán definitivamente. Esta acción no se puede deshacer.",
        tipo: "advertencia",
        textoConfirmar: "Eliminar OS",
        textoCancelar: "Cancelar",
        peligrosa: true
      })
    : window.confirm("¿Eliminar definitivamente esta OS?");
  if (!confirmar) return;
  const lote = writeBatch(db);
  lote.delete(doc(db, "ots", id));
  lote.delete(doc(db, "otsResumen", id));
  await lote.commit();
}

function volverPanelEmpresa() {
  const destino = usuario.rol === "super_admin"
    ? `empresa-admin.html?id=${encodeURIComponent(empresaActual.id)}`
    : `empresa-admin.html?id=${encodeURIComponent(usuario.empresaId)}`;
  window.location.href = destino;
}

function configurarInterfaz() {
  document.getElementById("usuarioNombre").textContent = usuario.nombre || usuario.email || "Usuario";
  document.getElementById("usuarioRol").textContent = String(usuario.rol || "").replaceAll("_", " ");
  document.getElementById("menuNuevaOT").style.display = puedeCrearOT(usuario, empresaActual) ? "" : "none";
  document.getElementById("btnPanelEmpresa").style.display = puedeEntrarPanelEmpresa(usuario, empresaActual) ? "" : "none";

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
    if (!await cargarEmpresa()) return;
    configurarInterfaz();
    escucharOrdenes();
  } catch (error) {
    console.error("No fue posible iniciar el archivo de órdenes:", error);
    alert("No fue posible cargar esta sección.");
  }
});
