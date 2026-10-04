import { protegerPagina, cerrarSesion } from "./session.js?v=20261004-1";
import { abrirWizard } from "./components/wizard.js";

import { app, db } from "./firebase-config.js";

import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  doc,
  setDoc,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const functions = getFunctions(app, "us-central1");
const crearEmpresaConAdministradorSegura = httpsCallable(
  functions,
  "crearEmpresaConAdministrador"
);
const cambiarEstadoUsuarioSeguro = httpsCallable(
  functions,
  "cambiarEstadoUsuario"
);
const eliminarEmpresaCompletaSegura = httpsCallable(
  functions,
  "eliminarEmpresaCompleta"
);

const usuarioActivo = protegerPagina(["super_admin"]);
if (!usuarioActivo) throw new Error("Acceso no autorizado");

let empresas = [];
let usuarios = [];
let sucursales = [];
let ots = [];
let planes = [];
let vistaActual = "dashboard";

const CONFIGURACION_BASE = {
  nombrePlataforma: "Vectaria",
  correoSoporte: "",
  telefonoSoporte: "",
  sitioWeb: "",
  paisPredeterminado: "Chile",
  colorPrimarioPredeterminado: "#2563eb",
  colorSecundarioPredeterminado: "#f97316",
  planPredeterminado: "professional",
  datosComerciales: {
    razonSocial: "",
    nombreFantasia: "Vectaria",
    rut: "",
    giro: "",
    direccion: "",
    comuna: "",
    ciudad: "",
    region: "",
    pais: "Chile",
    correoComercial: "",
    telefonoComercial: ""
  }
};

let configuracionSistema = { ...CONFIGURACION_BASE };

const MODULOS_PLAN = [
  { key: "dashboard", nombre: "Dashboard", obligatorio: true },
  { key: "usuarios", nombre: "Usuarios", obligatorio: true },
  { key: "sucursales", nombre: "Sucursales", obligatorio: true },
  { key: "ordenesServicio", nombre: "Crear OT", obligatorio: true },
  { key: "checklists", nombre: "Checklists", obligatorio: true },
  { key: "ingreso", nombre: "Ingreso" },
  { key: "evaluacion", nombre: "Evaluación" },
  { key: "mantencion", nombre: "Mantención" },
  { key: "pruebas", nombre: "Pruebas" },
  { key: "despacho", nombre: "Despacho" },
  { key: "evidencias", nombre: "Evidencias Fotográficas" },
  { key: "comentarios", nombre: "Comentarios" },
  { key: "aprobaciones", nombre: "Aprobaciones" },
  { key: "repuestos", nombre: "Repuestos" },
  { key: "gantt", nombre: "Carta Gantt" },
  { key: "reportesPDF", nombre: "Informes PDF" },
  { key: "clientes", nombre: "Clientes" },
  { key: "equipos", nombre: "Equipos" },
  { key: "inventario", nombre: "Inventario" },
  { key: "programacion", nombre: "Programación semanal" },
  { key: "sheq", nombre: "SHEQ y acreditaciones" },
  { key: "ia", nombre: "IA" }
];

const ETAPAS_FLUJO_EMPRESA = [
  { key: "ingreso", nombre: "Ingreso" },
  { key: "evaluacion", nombre: "Evaluación" },
  { key: "mantencion", nombre: "Mantención" },
  { key: "pruebas", nombre: "Pruebas" },
  { key: "despacho", nombre: "Despacho" }
];
function tieneEtapaOperativaActiva(modulos = {}) {
  return ETAPAS_FLUJO_EMPRESA.some(etapa => modulos[etapa.key] === true);
}

async function advertirFlujoSinEtapas() {
  await window.OverTrackUI.mostrarMensaje({
    titulo: "Flujo incompleto",
    mensaje: "Debes mantener activa al menos una etapa operativa: Ingreso, Evaluación, Mantención, Pruebas o Despacho.",
    tipo: "advertencia"
  });
}

function actualizarVistaPreviaFlujoEmpresa(overlay) {
  const contenedor = overlay?.querySelector("#vistaPreviaFlujoEmpresa");
  if (!contenedor) return;

  const etapasActivas = ETAPAS_FLUJO_EMPRESA.filter(etapa =>
    overlay.querySelector(`[data-empresa-modulo="${etapa.key}"]`)?.checked
  );

  const pasos = [
    { nombre: "Crear OT", permanente: true },
    ...etapasActivas,
    { nombre: "Cerrar OT", cierre: true }
  ];

  contenedor.innerHTML = pasos.map((paso, indice) => `
    ${indice > 0 ? '<span class="company-flow-arrow" aria-hidden="true">→</span>' : ""}
    <div class="company-flow-step ${paso.permanente ? "permanent" : ""} ${paso.cierre ? "closing" : ""}">
      <span>${indice + 1}</span>
      <strong>${paso.nombre}</strong>
    </div>
  `).join("");

  const resumen = overlay.querySelector("#resumenFlujoEmpresa");
  if (resumen) {
    resumen.textContent = etapasActivas.length
      ? `${etapasActivas.length} etapa(s) operativa(s) habilitada(s). Crear OT permanece siempre disponible.`
      : "No hay etapas operativas habilitadas. La OT podrá crearse y cerrarse directamente.";
  }
}

function crearPlanBase(id, nombre, descripcion, maxUsuarios, maxSucursales, maxStorageGB, destacado = false) {
  const modulos = {};
  MODULOS_PLAN.forEach(modulo => {
    modulos[modulo.key] = !["clientes", "equipos", "inventario", "programacion", "sheq", "ia"].includes(modulo.key);
  });
  return {
    id, nombre, descripcion, maxUsuarios, maxSucursales, maxStorageGB,
    precioMensualNeto: 0,
    precioAnualNeto: 0,
    moneda: "CLP",
    diasPrueba: 14,
    destacado,
    activo: true,
    modulos
  };
}

const PLANES_BASE = [
  crearPlanBase("starter", "Starter", "Para operaciones pequeñas que están comenzando.", 10, 1, 5),
  crearPlanBase("professional", "Professional", "Para talleres con operación estable y mayor capacidad.", 50, 5, 25, true),
  crearPlanBase("enterprise", "Enterprise", "Para organizaciones con múltiples sucursales y alto volumen.", 200, 20, 100)
];

function normalizarPlan(plan) {
  const base = PLANES_BASE.find(item => item.id === plan?.id) || PLANES_BASE[0];
  const modulos = { ...base.modulos, ...(plan?.modulos || {}) };
  MODULOS_PLAN.filter(item => item.obligatorio).forEach(item => { modulos[item.key] = true; });
  return {
    ...base, ...plan,
    id: plan?.id || base.id,
    nombre: plan?.nombre || base.nombre,
    maxUsuarios: Math.max(1, Number(plan?.maxUsuarios ?? base.maxUsuarios)),
    maxSucursales: Math.max(1, Number(plan?.maxSucursales ?? base.maxSucursales)),
    maxStorageGB: Math.max(1, Number(plan?.maxStorageGB ?? base.maxStorageGB)),
    precioMensualNeto: Math.max(0, Math.round(Number(plan?.precioMensualNeto ?? base.precioMensualNeto))),
    precioAnualNeto: Math.max(0, Math.round(Number(plan?.precioAnualNeto ?? base.precioAnualNeto))),
    moneda: plan?.moneda === "USD" ? "USD" : "CLP",
    diasPrueba: Math.max(0, Math.min(90, Math.round(Number(plan?.diasPrueba ?? base.diasPrueba)))),
    activo: plan?.activo !== false,
    modulos
  };
}

function formatearPrecioPlan(valor, moneda = "CLP") {
  const monto = Math.max(0, Number(valor || 0));
  if (!monto) return "Por definir";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: moneda === "USD" ? "USD" : "CLP",
    maximumFractionDigits: moneda === "USD" ? 2 : 0
  }).format(monto);
}

const ESTADOS_SUSCRIPCION = [
  { id: "prueba", nombre: "En prueba" },
  { id: "activa", nombre: "Activa" },
  { id: "por_vencer", nombre: "Por vencer" },
  { id: "vencida", nombre: "Vencida" },
  { id: "suspendida", nombre: "Suspendida" },
  { id: "cancelacion_solicitada", nombre: "Cancelación solicitada" },
  { id: "periodo_exportacion", nombre: "Periodo de exportación" },
  { id: "pendiente_eliminacion", nombre: "Pendiente de eliminación manual" },
  { id: "cancelada", nombre: "Cancelada" }
];

function normalizarSuscripcion(empresa = {}) {
  const suscripcion = empresa.suscripcion || {};
  const cancelacion = empresa.cancelacion || {};
  const fechaLimiteCancelacion = String(cancelacion.fechaLimiteExportacion || "");
  const plazoVencido = Number.isFinite(Date.parse(fechaLimiteCancelacion)) &&
    Date.parse(fechaLimiteCancelacion) <= Date.now();
  let estado = ESTADOS_SUSCRIPCION.some(item => item.id === suscripcion.estado)
    ? suscripcion.estado
    : (empresa.activa === false ? "suspendida" : "activa");
  if (["cancelacion_solicitada", "periodo_exportacion"].includes(estado) && plazoVencido) {
    estado = "pendiente_eliminacion";
  }
  return {
    estado,
    modalidad: suscripcion.modalidad === "anual" ? "anual" : "mensual",
    medioPago: ["transferencia", "orden_compra", "otro"].includes(suscripcion.medioPago)
      ? suscripcion.medioPago
      : "transferencia",
    fechaInicio: String(suscripcion.fechaInicio || ""),
    fechaVencimiento: String(suscripcion.fechaVencimiento || ""),
    diasGracia: Math.max(0, Math.min(90, Number(suscripcion.diasGracia ?? 5))),
    numeroOrdenCompra: String(suscripcion.numeroOrdenCompra || ""),
    observaciones: String(suscripcion.observaciones || ""),
    fechaSolicitudCancelacion: String(cancelacion.fechaSolicitud || ""),
    fechaLimiteExportacion: fechaLimiteCancelacion,
    eliminacionManual: cancelacion.eliminacionManual === true
  };
}

function nombreEstadoSuscripcion(estado) {
  return ESTADOS_SUSCRIPCION.find(item => item.id === estado)?.nombre || "Activa";
}

function fechaLocalDesdeISO(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ""))) return null;
  const fecha = new Date(`${valor}T12:00:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function calcularAlertaSuscripcion(empresa) {
  const suscripcion = normalizarSuscripcion(empresa);
  if (["suspendida", "cancelada", "cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion"].includes(suscripcion.estado)) return null;
  const vencimiento = fechaLocalDesdeISO(suscripcion.fechaVencimiento);
  if (!vencimiento) return null;
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  const diferencia = Math.ceil((vencimiento - hoy) / 86400000);
  const diasGracia = Math.max(0, Number(suscripcion.diasGracia || 0));
  if (diferencia >= 0 && diferencia <= 7) {
    return { tipo: "por_vencer", dias: diferencia, vencimiento: suscripcion.fechaVencimiento, suscripcion };
  }
  if (diferencia < 0 && Math.abs(diferencia) <= diasGracia) {
    return { tipo: "gracia", dias: Math.abs(diferencia), vencimiento: suscripcion.fechaVencimiento, suscripcion };
  }
  if (diferencia < 0) {
    return { tipo: "vencida", dias: Math.abs(diferencia), vencimiento: suscripcion.fechaVencimiento, suscripcion };
  }
  return null;
}

function obtenerAlertasSuscripcion() {
  return empresas.map(empresa => ({ empresa, alerta: calcularAlertaSuscripcion(empresa) }))
    .filter(item => item.alerta)
    .sort((a, b) => String(a.alerta.vencimiento).localeCompare(String(b.alerta.vencimiento)));
}

function textoAlertaSuscripcion(alerta) {
  if (alerta.tipo === "por_vencer") return alerta.dias === 0 ? "Vence hoy" : `Vence en ${alerta.dias} día(s)`;
  if (alerta.tipo === "gracia") return `Periodo de gracia · ${alerta.dias} día(s) vencida`;
  return `Vencida hace ${alerta.dias} día(s)`;
}

function filasAlertasSuscripcion(filtro = "") {
  const alertas = obtenerAlertasSuscripcion().filter(item => !filtro || item.alerta.tipo === filtro);
  if (!alertas.length) return '<p class="subscription-alert-empty">No hay empresas en esta condición.</p>';
  return alertas.map(({ empresa, alerta }) => `
    <article class="subscription-alert-row ${alerta.tipo}">
      <div><strong>${escaparHtml(empresa.nombre || "Empresa sin nombre")}</strong><span>${escaparHtml(empresa.plan || "Sin plan")} · Vencimiento ${escaparHtml(formatearFechaPago(alerta.vencimiento))}</span></div>
      <span class="subscription-alert-badge ${alerta.tipo}">${escaparHtml(textoAlertaSuscripcion(alerta))}</span>
      <button type="button" class="btn-secondary" onclick="abrirConfiguracionEmpresa('${empresa.id}')">Revisar</button>
    </article>`).join("");
}

window.filtrarAlertasSuscripcion = function (valor) {
  const contenedor = document.getElementById("listaAlertasSuscripcion");
  if (contenedor) contenedor.innerHTML = filasAlertasSuscripcion(valor);
};

function obtenerPlanesDisponibles() {
  const baseCombinados = PLANES_BASE.map(base => {
    const guardado = planes.find(plan => plan.id === base.id);
    return normalizarPlan(guardado || base);
  });
  const personalizados = planes
    .filter(plan => !PLANES_BASE.some(base => base.id === plan.id))
    .map(normalizarPlan);
  return [...baseCombinados, ...personalizados];
}

function obtenerPlan(planId) {
  return obtenerPlanesDisponibles().find(plan => plan.id === planId) || normalizarPlan(PLANES_BASE[0]);
}

window.abrirModalEmpresa = function () {
  abrirWizard({
    titulo: "Crear Empresa",
    pasos: [
      {
        titulo: "Empresa",
        render: () => `
          <label for="wizEmpresaNombre">Nombre empresa</label>
          <input type="text" id="wizEmpresaNombre">

          <label for="wizEmpresaRut">RUT</label>
          <input type="text" id="wizEmpresaRut">

          <label for="wizEmpresaGiro">Giro</label>
          <input type="text" id="wizEmpresaGiro">
        `,
        collect: () => {
          const nombre = document.getElementById("wizEmpresaNombre").value.trim();
          const rut = document.getElementById("wizEmpresaRut").value.trim();
          const giro = document.getElementById("wizEmpresaGiro").value.trim();

          if (!nombre || !rut) {
            window.OverTrackUI.mostrarMensaje({
              titulo: "Datos incompletos",
              mensaje: "Ingresa el nombre y el RUT de la empresa para continuar.",
              tipo: "advertencia",
              textoBoton: "Entendido"
            });
            return false;
          }

          return { nombre, rut, giro };
        }
      },
      {
        titulo: "Contacto",
        render: () => `
          <label for="wizEmpresaCorreo">Correo de contacto</label>
          <input type="email" id="wizEmpresaCorreo">

          <label for="wizEmpresaTelefono">Teléfono</label>
          <input type="text" id="wizEmpresaTelefono">

          <label for="wizEmpresaCiudad">Ciudad</label>
          <input type="text" id="wizEmpresaCiudad">
        `,
        collect: () => {
          const correo = document.getElementById("wizEmpresaCorreo").value.trim();
          const telefono = document.getElementById("wizEmpresaTelefono").value.trim();
          const ciudad = document.getElementById("wizEmpresaCiudad").value.trim();

          if (!correo) {
            window.OverTrackUI.mostrarMensaje({
              titulo: "Correo requerido",
              mensaje: "Ingresa el correo de contacto de la empresa para continuar.",
              tipo: "advertencia",
              textoBoton: "Entendido"
            });
            return false;
          }

          return { correo, telefono, ciudad };
        }
      },
      {
        titulo: "Plan",
        render: () => `
          <label for="wizEmpresaPlan">Plan</label>
          <select id="wizEmpresaPlan">
            ${obtenerPlanesDisponibles().filter(plan => plan.activo).map(plan =>
              `<option value="${escaparHtml(plan.id)}" ${plan.id === configuracionSistema.planPredeterminado ? "selected" : ""}>${escaparHtml(plan.nombre)}</option>`
            ).join("")}
          </select>
        `,
        collect: () => ({
          plan: document.getElementById("wizEmpresaPlan").value
        })
      },
      {
        titulo: "Módulos",
        render: datos => {
          const plan = obtenerPlan(datos.plan);
          return `
          <div class="modulos-grid">
            ${MODULOS_PLAN.map(modulo => crearSwitchModulo(
              modulo.key, modulo.nombre,
              modulo.obligatorio || plan.modulos[modulo.key] === true,
              modulo.obligatorio
            )).join("")}
          </div>
          <p class="wizard-helper">Puedes personalizar los módulos opcionales sin modificar el plan original.</p>
        `;},
        collect: () => ({
          modulos: obtenerModulosSeleccionados()
        })
      },
      {
        titulo: "Administrador",
        render: () => `
          <label for="wizAdminNombre">Nombre</label>
          <input type="text" id="wizAdminNombre">

          <label for="wizAdminApellido">Apellido</label>
          <input type="text" id="wizAdminApellido">

          <label for="wizAdminCorreo">Correo de acceso</label>
          <input type="email" id="wizAdminCorreo">
        `,
        collect: () => {
          const adminNombre = document.getElementById("wizAdminNombre").value.trim();
          const adminApellido = document.getElementById("wizAdminApellido").value.trim();
          const adminCorreo = document.getElementById("wizAdminCorreo").value.trim();

          if (!adminNombre || !adminCorreo) {
            window.OverTrackUI.mostrarMensaje({
              titulo: "Administrador incompleto",
              mensaje: "Ingresa el nombre y el correo de acceso del administrador.",
              tipo: "advertencia",
              textoBoton: "Entendido"
            });
            return false;
          }

          return {
            adminNombre,
            adminApellido,
            adminCorreo
          };
        }
      },
      {
        titulo: "Resumen",
        render: (datos) => `
          <h3>Resumen de creación</h3>

          <p><strong>Empresa:</strong> ${datos.nombre}</p>
          <p><strong>RUT:</strong> ${datos.rut}</p>
          <p><strong>Plan:</strong> ${datos.plan}</p>
          <p><strong>Administrador:</strong> ${datos.adminNombre} ${datos.adminApellido || ""}</p>
          <p><strong>Correo de acceso:</strong> ${datos.adminCorreo}</p>

          <div class="resumen-modulos">
            <strong>Módulos activos:</strong>
            <p>
              ${Object.entries(datos.modulos || {})
                .filter(([, activo]) => activo)
                .map(([nombre]) => nombre)
                .join(", ")}
            </p>
          </div>
        `
      }
    ],
    onFinish: crearEmpresaCompletaDesdeWizard
  });
};


function crearSwitchModulo(key, label, activoInicial, obligatorio = false) {
  return `
    <label class="modulo-switch-card">
      <div>
        <strong>${label}</strong>
        ${obligatorio ? '<small class="required-module">Obligatorio</small>' : ""}
      </div>

      <input
        type="checkbox"
        data-modulo="${key}"
        ${activoInicial ? "checked" : ""}
        ${obligatorio ? "disabled" : ""}
      >
    </label>
  `;
}

function obtenerModulosSeleccionados() {
  const modulos = {};

  document
    .querySelectorAll("[data-modulo]")
    .forEach(input => {
      modulos[input.dataset.modulo] = input.checked;
    });

  MODULOS_PLAN.filter(modulo => modulo.obligatorio).forEach(modulo => {
    modulos[modulo.key] = true;
  });

  return modulos;
}


async function crearEmpresaCompletaDesdeWizard(datos) {
  if (!tieneEtapaOperativaActiva(datos?.modulos)) {
    await advertirFlujoSinEtapas();
    return;
  }
  try {
    const respuesta = await crearEmpresaConAdministradorSegura(datos);
    const { empresaId, passwordTemporal } = respuesta.data;
    const planSeleccionado = obtenerPlan(datos.plan);
    const inicioPrueba = new Date();
    const finPrueba = new Date(inicioPrueba);
    finPrueba.setDate(finPrueba.getDate() + Math.max(0, Number(planSeleccionado.diasPrueba || 0)));
    await setDoc(doc(db, "empresas", empresaId), {
      suscripcion: {
        estado: planSeleccionado.diasPrueba > 0 ? "prueba" : "activa",
        modalidad: "mensual",
        medioPago: "transferencia",
        fechaInicio: inicioPrueba.toISOString().slice(0, 10),
        fechaVencimiento: finPrueba.toISOString().slice(0, 10),
        diasGracia: 5,
        numeroOrdenCompra: "",
        observaciones: "",
        fechaActualizacion: inicioPrueba.toISOString(),
        actualizadoPor: usuarioActivo.uid
      }
    }, { merge: true });
    await cargarEmpresas();
    mostrarResultadoCreacionEmpresa({
      empresaId,
      empresaNombre: datos.nombre,
      administrador: `${datos.adminNombre} ${datos.adminApellido || ""}`.trim(),
      correo: datos.adminCorreo,
      passwordTemporal
    });
  } catch (error) {
    console.error("Error creando empresa mediante backend seguro:", error);
    await window.OverTrackUI.mostrarMensaje({
      titulo: "No se pudo crear la empresa",
      mensaje: error?.message || "Ocurrio un problema durante la creacion. Intentalo nuevamente.",
      tipo: "error",
      textoBoton: "Cerrar",
      copiable: true
    });
  }
}



function obtenerLimitesPlan(plan) {
  const configurado = obtenerPlan(plan);
  return {
    maxUsuarios: configurado.maxUsuarios,
    maxSucursales: configurado.maxSucursales,
    maxStorageGB: configurado.maxStorageGB
  };
}



function mostrarResultadoCreacionEmpresa({
  empresaNombre,
  administrador,
  correo,
  passwordTemporal
}) {
  const overlay = document.createElement("div");
  overlay.className = "resultado-empresa-overlay";

  overlay.innerHTML = `
    <div class="resultado-empresa-box">

      <div class="resultado-icono">✓</div>

      <h2>Empresa creada correctamente</h2>

      <p class="resultado-subtitulo">
        La empresa y su Administrador fueron creados exitosamente.
      </p>

      <div class="resultado-credenciales">

        <div>
          <span>Empresa</span>
          <strong>${empresaNombre}</strong>
        </div>

        <div>
          <span>Administrador</span>
          <strong>${administrador}</strong>
        </div>

        <div>
          <span>Correo de acceso</span>
          <strong>${correo}</strong>
        </div>

        <div>
          <span>Contraseña temporal</span>

          <div class="password-temporal-box">
            <strong id="passwordTemporalCreada">
              ${passwordTemporal}
            </strong>

            <button
              type="button"
              class="btn-primary"
              id="btnCopiarCredenciales"
            >
              Copiar
            </button>
          </div>
        </div>

      </div>

      <div class="resultado-aviso">
        El usuario deberá cambiar esta contraseña durante su primer acceso.
      </div>

      <div class="resultado-actions">
        <button
          type="button"
          class="btn-primary"
          id="btnCerrarResultadoEmpresa"
        >
          Finalizar
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(overlay);

  overlay
    .querySelector("#btnCopiarCredenciales")
    .addEventListener("click", async () => {
      const texto = [
        "Credenciales de acceso a Vectaria",
        "",
        `Empresa: ${empresaNombre}`,
        `Administrador: ${administrador}`,
        `Correo: ${correo}`,
        `Contraseña temporal: ${passwordTemporal}`
      ].join("\n");

      try {
        await navigator.clipboard.writeText(texto);
        await window.OverTrackUI.mostrarMensaje({
          titulo: "Credenciales copiadas",
          mensaje: "El correo y la contrasena temporal fueron copiados al portapapeles.",
          tipo: "exito",
          textoBoton: "Aceptar"
        });
      } catch (error) {
        console.error("Error copiando credenciales:", error);
        await window.OverTrackUI.mostrarMensaje({
          titulo: "No se pudieron copiar",
          mensaje: "Copia manualmente el correo y la contrasena temporal mostrados en la pantalla.",
          tipo: "advertencia",
          textoBoton: "Entendido",
          copiable: true
        });
      }
    });

  overlay
    .querySelector("#btnCerrarResultadoEmpresa")
    .addEventListener("click", () => {
      overlay.remove();
    });
}



async function crearEmpresaDesdeWizard(datos) {
  try {
    const nuevaEmpresa = {
      nombre: datos.nombre,
      rut: datos.rut,
      giro: datos.giro || "",
      telefono: datos.telefono || "",
      correo: datos.correo,
      sitioWeb: "",
      direccion: "",
      ciudad: datos.ciudad || "",
      pais: "Chile",

      logo: "",

      colorPrimario: "#2563eb",
      colorSecundario: "#f97316",

      plan: datos.plan,

      activa: true,

      maxUsuarios: datos.plan === "enterprise" ? 200 : datos.plan === "professional" ? 50 : 10,
      maxSucursales: datos.plan === "enterprise" ? 20 : datos.plan === "professional" ? 5 : 1,
      maxStorageGB: datos.plan === "enterprise" ? 100 : datos.plan === "professional" ? 25 : 5,

      observaciones: "",

      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp()
    };

    await addDoc(collection(db, "empresas"), nuevaEmpresa);

    await window.OverTrackUI.mostrarMensaje({ titulo: "Empresa creada", mensaje: "La empresa fue creada correctamente.", tipo: "exito" });
    await cargarEmpresas();

  } catch (error) {
    console.error("Error creando empresa:", error);
    await window.OverTrackUI.mostrarMensaje({ titulo: "No se pudo crear la empresa", mensaje: "Ocurrió un error al crear la empresa.", tipo: "error" });
  }
}


function escaparHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nombreEmpresa(empresaId) {
  return empresas.find(empresa => empresa.id === empresaId)?.nombre || "Sin empresa";
}

function etiquetaRol(rol) {
  const etiquetas = {
    super_admin: "Super Admin",
    admin_empresa: "Admin Empresa",
    admin_sucursal: "Admin Sucursal",
    jefe_taller: "Jefe Taller",
    usuario_taller: "Usuario Taller"
    ,supervisor: "Supervisor"
    ,tecnico: "Técnico"
    ,planificador: "Planificador"
    ,bodeguero: "Bodeguero"
    ,sheq: "SHEQ"
  };
  return etiquetas[rol] || rol || "Sin rol";
}

function contenidoEmpresas(limite = 0) {
  const lista = limite ? empresas.slice(0, limite) : empresas;
  if (!lista.length) return `<p class="empty-state">No hay empresas registradas.</p>`;

  return lista.map(emp => {
    const suscripcion = normalizarSuscripcion(emp);
    const permiteEliminar = suscripcion.estado === "pendiente_eliminacion" && suscripcion.eliminacionManual;
    return `
    <article class="empresa-card">
      <div class="empresa-info">
        <h3>${escaparHtml(emp.nombre || "Empresa sin nombre")}</h3>
        <div class="empresa-meta">
          <span>RUT: ${escaparHtml(emp.rut || "-")}</span>
          <span>Plan: ${escaparHtml(emp.plan || "-")}</span>
          <span>Usuarios máx: ${escaparHtml(emp.maxUsuarios || "-")}</span>
          <span>Sucursales máx: ${escaparHtml(emp.maxSucursales || "-")}</span>
          <span>Storage: ${escaparHtml(emp.maxStorageGB || "-")} GB</span>
          <span>Suscripción: ${escaparHtml(nombreEstadoSuscripcion(suscripcion.estado))}</span>
          <span>Vencimiento: ${escaparHtml(suscripcion.fechaVencimiento || "Sin definir")}</span>
          ${suscripcion.fechaLimiteExportacion ? `<span>Respaldo hasta: ${escaparHtml(new Date(suscripcion.fechaLimiteExportacion).toLocaleDateString("es-CL"))}</span>` : ""}
        </div>
        <p>${escaparHtml(emp.correo || "Sin correo registrado")}</p>
      </div>
      <div class="empresa-actions">
        <span class="empresa-estado ${emp.activa ? "activa" : "inactiva"}">
          ${emp.activa ? "Activa" : "Inactiva"}
        </span>
        <button class="btn-secondary" onclick="abrirConfiguracionEmpresa('${emp.id}')">Configurar</button>
        <button class="btn-primary" onclick="verEmpresa('${emp.id}')">Administrar</button>
        <button class="btn-danger" onclick="eliminarEmpresa('${emp.id}')" ${permiteEliminar ? "" : "disabled"} title="${permiteEliminar ? "Eliminar definitivamente" : "Disponible solo después de finalizar los 30 días de exportación"}">Eliminar</button>
      </div>
    </article>
  `;}).join("");
}

function renderKPIs() {
  const totalEmpresas = document.getElementById("totalEmpresas");
  const totalUsuarios = document.getElementById("totalUsuarios");
  const totalSucursales = document.getElementById("totalSucursales");
  const totalOS = document.getElementById("totalOS");

  if (totalEmpresas) totalEmpresas.textContent = empresas.length;
  if (totalUsuarios) totalUsuarios.textContent = usuarios.filter(u => u.rol !== "super_admin").length;
  if (totalSucursales) totalSucursales.textContent = sucursales.length;
  if (totalOS) totalOS.textContent = ots.filter(ot => !ot.cerrada && ot.estado !== "CERRADA").length;
}

function cabecera(titulo, descripcion) {
  const tituloVista = document.getElementById("tituloVista");
  const descripcionVista = document.getElementById("descripcionVista");
  if (tituloVista) tituloVista.textContent = titulo;
  if (descripcionVista) descripcionVista.textContent = descripcion;
}

function renderDashboard() {
  cabecera("Panel Super Administrador", "Gestión global de empresas, usuarios y sucursales.");
  const alertas = obtenerAlertasSuscripcion();
  const porVencer = alertas.filter(item => item.alerta.tipo === "por_vencer").length;
  const enGracia = alertas.filter(item => item.alerta.tipo === "gracia").length;
  const vencidas = alertas.filter(item => item.alerta.tipo === "vencida").length;
  document.getElementById("contenidoVista").innerHTML = `
    <section class="kpi-grid">
      <div class="kpi-card"><h3>Empresas</h3><strong id="totalEmpresas">0</strong></div>
      <div class="kpi-card"><h3>Usuarios</h3><strong id="totalUsuarios">0</strong></div>
      <div class="kpi-card"><h3>Sucursales</h3><strong id="totalSucursales">0</strong></div>
      <div class="kpi-card"><h3>OT Activas</h3><strong id="totalOS">0</strong></div>
    </section>
    <section class="subscription-summary-grid" aria-label="Resumen de vencimientos">
      <article class="subscription-summary-card upcoming"><span>Por vencer</span><strong>${porVencer}</strong><small>Próximos 7 días</small></article>
      <article class="subscription-summary-card grace"><span>En periodo de gracia</span><strong>${enGracia}</strong><small>Acceso aún no suspendido</small></article>
      <article class="subscription-summary-card overdue"><span>Vencidas</span><strong>${vencidas}</strong><small>Fuera del periodo de gracia</small></article>
    </section>
    <section class="card subscription-alert-card">
      <div class="section-header subscription-alert-header">
        <div><h2>Avisos de suscripción</h2><p class="section-copy">Seguimiento interno; no suspende empresas ni envía mensajes automáticamente.</p></div>
        <select class="admin-select subscription-alert-filter" aria-label="Filtrar avisos" onchange="filtrarAlertasSuscripcion(this.value)">
          <option value="">Todos los avisos</option><option value="por_vencer">Por vencer</option><option value="gracia">Periodo de gracia</option><option value="vencida">Vencidas</option>
        </select>
      </div>
      <div id="listaAlertasSuscripcion" class="subscription-alert-list">${filasAlertasSuscripcion()}</div>
    </section>
    <section class="card">
      <div class="section-header">
        <h2>Empresas registradas</h2>
        <button class="btn-primary" onclick="abrirModalEmpresa()">+ Nueva Empresa</button>
      </div>
      <div>${contenidoEmpresas(5)}</div>
    </section>`;
  renderKPIs();
}

function renderVistaEmpresas() {
  cabecera("Empresas", "Crea y administra todas las empresas registradas en Vectaria.");
  document.getElementById("contenidoVista").innerHTML = `
    <section class="card">
      <div class="section-header">
        <div><h2>Empresas registradas</h2><p class="section-copy">${empresas.length} empresa(s)</p></div>
        <button class="btn-primary" onclick="abrirModalEmpresa()">+ Nueva Empresa</button>
      </div>
      <div>${contenidoEmpresas()}</div>
    </section>`;
}

function usuariosFiltrados(filtro = "", rol = "", estado = "") {
  const texto = filtro.toLowerCase().trim();
  return usuarios
    .filter(u => u.rol !== "super_admin")
    .filter(u => !texto || [u.nombre, u.nombreCompleto, u.correo, u.email, u.rol, nombreEmpresa(u.empresaId)]
      .some(valor => String(valor || "").toLowerCase().includes(texto)))
    .filter(u => !rol || u.rol === rol)
    .filter(u => !estado || (estado === "activo" ? u.activo !== false : u.activo === false));
}

function filasUsuarios(lista) {
  return lista.map(u => `
    <tr>
      <td data-label="Usuario">${escaparHtml(u.nombreCompleto || u.nombre || "Sin nombre")}</td>
      <td data-label="Correo">${escaparHtml(u.correo || u.email || "-")}</td>
      <td data-label="Rol"><span class="role-badge">${escaparHtml(etiquetaRol(u.rol))}</span></td>
      <td data-label="Estado"><span class="status-badge ${u.activo === false ? "off" : "on"}">${u.activo === false ? "Inactivo" : "Activo"}</span></td>
      <td data-label="Acciones"><div class="table-actions">
        ${u.empresaId ? `<button class="btn-table-view" onclick="verEmpresa('${u.empresaId}')">Ver empresa</button>` : ""}
        <button class="${u.activo === false ? "btn-table-enable" : "btn-table-disable"}" onclick="cambiarEstadoUsuarioGlobal('${u.id}', ${u.activo === false ? "true" : "false"})">${u.activo === false ? "Activar" : "Desactivar"}</button>
      </div></td>
    </tr>`).join("");
}

function gruposUsuarios(filtro = "", rol = "", estado = "", gruposAbiertos = []) {
  const lista = usuariosFiltrados(filtro, rol, estado);
  if (!lista.length) return `<div class="users-empty-state">No se encontraron usuarios con los filtros seleccionados.</div>`;

  const grupos = new Map();
  lista.forEach(usuario => {
    const empresaExiste = usuario.empresaId && empresas.some(empresa => empresa.id === usuario.empresaId);
    const clave = empresaExiste ? usuario.empresaId : "sin_empresa";
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(usuario);
  });

  const ordenados = [...grupos.entries()].sort(([empresaA], [empresaB]) => {
    if (empresaA === "sin_empresa") return 1;
    if (empresaB === "sin_empresa") return -1;
    return nombreEmpresa(empresaA).localeCompare(nombreEmpresa(empresaB), "es", { sensitivity: "base" });
  });
  const abrirTodos = Boolean(filtro || rol || estado);

  return ordenados.map(([empresaId, listaEmpresa], indice) => {
    const activos = listaEmpresa.filter(usuario => usuario.activo !== false).length;
    const inactivos = listaEmpresa.length - activos;
    const nombre = empresaId === "sin_empresa" ? "Sin empresa asignada" : nombreEmpresa(empresaId);
    const abierto = abrirTodos || gruposAbiertos.includes(empresaId) || (!gruposAbiertos.length && indice === 0);
    return `
      <details class="users-company-group" data-empresa-id="${escaparHtml(empresaId)}" ${abierto ? "open" : ""}>
        <summary class="users-company-summary">
          <span class="users-company-chevron" aria-hidden="true">›</span>
          <span class="users-company-title">
            <strong>${escaparHtml(nombre)}</strong>
            <small>${listaEmpresa.length} usuario(s)</small>
          </span>
          <span class="users-company-stats">
            <span class="users-stat-active">${activos} activo(s)</span>
            ${inactivos ? `<span class="users-stat-inactive">${inactivos} inactivo(s)</span>` : ""}
          </span>
        </summary>
        <div class="table-wrap mobile-card-table users-company-table">
          <table class="admin-table">
            <thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>${filasUsuarios(listaEmpresa)}</tbody>
          </table>
        </div>
      </details>`;
  }).join("");
}

function renderVistaUsuarios() {
  cabecera("Usuarios", "Consulta y administra los usuarios de todas las empresas.");
  document.getElementById("contenidoVista").innerHTML = `
    <section class="card">
      <div class="section-header"><div><h2>Usuarios por empresa</h2><p class="section-copy">Cada grupo reúne únicamente a los usuarios pertenecientes a esa empresa.</p></div></div>
      <div class="users-global-filters">
        <input id="buscarUsuarioGlobal" class="admin-search" type="search" placeholder="Buscar por nombre, correo, rol o empresa...">
        <select id="filtrarRolGlobal" class="admin-select"><option value="">Todos los roles</option><option value="admin_empresa">Admin Empresa</option><option value="admin_sucursal">Admin Sucursal</option><option value="jefe_taller">Jefe Taller</option><option value="usuario_taller">Usuario Taller</option></select>
        <select id="filtrarEstadoGlobal" class="admin-select"><option value="">Todos los estados</option><option value="activo">Activos</option><option value="inactivo">Inactivos</option></select>
      </div>
      <div id="gruposUsuariosGlobal" class="users-company-groups">${gruposUsuarios()}</div>
    </section>`;
  ["buscarUsuarioGlobal", "filtrarRolGlobal", "filtrarEstadoGlobal"].forEach(id => {
    document.getElementById(id).addEventListener(id === "buscarUsuarioGlobal" ? "input" : "change", refrescarTablaUsuariosGlobal);
  });
}

function refrescarTablaUsuariosGlobal() {
  const contenedor = document.getElementById("gruposUsuariosGlobal");
  if (!contenedor) return;
  const gruposAbiertos = [...contenedor.querySelectorAll(".users-company-group[open]")]
    .map(grupo => grupo.dataset.empresaId);
  contenedor.innerHTML = gruposUsuarios(
    document.getElementById("buscarUsuarioGlobal")?.value || "",
    document.getElementById("filtrarRolGlobal")?.value || "",
    document.getElementById("filtrarEstadoGlobal")?.value || "",
    gruposAbiertos
  );
}

window.cambiarEstadoUsuarioGlobal = async function (usuarioId, nuevoEstado) {
  const usuario = usuarios.find(item => item.id === usuarioId);
  if (!usuario || usuario.rol === "super_admin") return;
  const accion = nuevoEstado ? "activar" : "desactivar";
  const confirmar = await window.OverTrackUI.confirmarAccion({
    titulo: nuevoEstado ? "Activar usuario" : "Desactivar usuario",
    mensaje: `¿Deseas ${accion} a ${usuario.nombreCompleto || usuario.nombre || usuario.correo || "este usuario"}?`,
    tipo: "advertencia",
    textoConfirmar: nuevoEstado ? "Activar" : "Desactivar",
    peligrosa: !nuevoEstado
  });
  if (!confirmar) return;
  try {
    await cambiarEstadoUsuarioSeguro({ usuarioId, activo: nuevoEstado });
    usuario.activo = nuevoEstado;
    refrescarTablaUsuariosGlobal();
    await window.OverTrackUI.mostrarMensaje({ titulo: "Estado actualizado", mensaje: `Usuario ${nuevoEstado ? "activado" : "desactivado"} correctamente.`, tipo: "exito" });
  } catch (error) {
    console.error("Error cambiando estado del usuario:", error);
    await window.OverTrackUI.mostrarMensaje({ titulo: "No se pudo actualizar", mensaje: "No se pudo cambiar el estado del usuario.", tipo: "error" });
  }
};

function filasSucursales(filtro = "", estado = "") {
  const texto = filtro.toLowerCase().trim();
  const lista = sucursales
    .filter(s => !texto || [s.nombre, s.codigo, s.ciudad, s.direccion, nombreEmpresa(s.empresaId)]
      .some(valor => String(valor || "").toLowerCase().includes(texto)))
    .filter(s => {
      if (!estado) return true;
      const activa = s.activa !== false && s.estado !== "inactiva";
      return estado === "activa" ? activa : !activa;
    });
  if (!lista.length) return `<tr><td colspan="6" class="empty-cell">No se encontraron sucursales.</td></tr>`;
  return lista.map(s => `
    <tr>
      <td data-label="Sucursal">${escaparHtml(s.nombre || "Sin nombre")}</td>
      <td data-label="Código">${escaparHtml(s.codigo || "-")}</td>
      <td data-label="Ciudad">${escaparHtml(s.ciudad || "-")}</td>
      <td data-label="Empresa">${escaparHtml(nombreEmpresa(s.empresaId))}</td>
      <td data-label="Estado"><span class="status-badge ${(s.activa === false || s.estado === "inactiva") ? "off" : "on"}">${(s.activa === false || s.estado === "inactiva") ? "Inactiva" : "Activa"}</span></td>
      <td data-label="Acciones"><div class="table-actions">
        ${s.empresaId ? `<button class="btn-table-view" onclick="verEmpresa('${s.empresaId}')">Ver empresa</button>` : ""}
        <button class="${(s.activa === false || s.estado === "inactiva") ? "btn-table-enable" : "btn-table-disable"}" onclick="cambiarEstadoSucursalGlobal('${s.id}', ${(s.activa === false || s.estado === "inactiva") ? "true" : "false"})">${(s.activa === false || s.estado === "inactiva") ? "Activar" : "Desactivar"}</button>
      </div></td>
    </tr>`).join("");
}

function renderVistaSucursales() {
  cabecera("Sucursales", "Consulta y administra las ubicaciones operativas de todas las empresas.");
  document.getElementById("contenidoVista").innerHTML = `
    <section class="card">
      <div class="section-header"><div><h2>Sucursales registradas</h2><p class="section-copy">Puedes activar, desactivar o acceder a la empresa asociada.</p></div></div>
      <div class="branches-global-filters">
        <input id="buscarSucursalGlobal" class="admin-search" type="search" placeholder="Buscar por sucursal, código, ciudad, dirección o empresa...">
        <select id="filtrarEstadoSucursalGlobal" class="admin-select"><option value="">Todos los estados</option><option value="activa">Activas</option><option value="inactiva">Inactivas</option></select>
      </div>
      <div class="table-wrap mobile-card-table"><table class="admin-table"><thead><tr><th>Sucursal</th><th>Código</th><th>Ciudad</th><th>Empresa</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="tablaSucursalesGlobal">${filasSucursales()}</tbody></table></div>
    </section>`;
  document.getElementById("buscarSucursalGlobal").addEventListener("input", refrescarTablaSucursalesGlobal);
  document.getElementById("filtrarEstadoSucursalGlobal").addEventListener("change", refrescarTablaSucursalesGlobal);
}

function refrescarTablaSucursalesGlobal() {
  const tabla = document.getElementById("tablaSucursalesGlobal");
  if (!tabla) return;
  tabla.innerHTML = filasSucursales(
    document.getElementById("buscarSucursalGlobal")?.value || "",
    document.getElementById("filtrarEstadoSucursalGlobal")?.value || ""
  );
}

window.cambiarEstadoSucursalGlobal = async function (sucursalId, nuevoEstado) {
  const sucursal = sucursales.find(item => item.id === sucursalId);
  if (!sucursal) return;
  const accion = nuevoEstado ? "activar" : "desactivar";
  const confirmar = await window.OverTrackUI.confirmarAccion({
    titulo: nuevoEstado ? "Activar sucursal" : "Desactivar sucursal",
    mensaje: `¿Deseas ${accion} la sucursal ${sucursal.nombre || sucursal.codigo || "seleccionada"}?`,
    tipo: "advertencia",
    textoConfirmar: nuevoEstado ? "Activar" : "Desactivar",
    peligrosa: !nuevoEstado
  });
  if (!confirmar) return;
  try {
    await setDoc(doc(db, "sucursales", sucursalId), {
      activa: nuevoEstado,
      estado: nuevoEstado ? "activa" : "inactiva",
      fechaActualizacion: serverTimestamp(),
      actualizadoPor: usuarioActivo.uid
    }, { merge: true });
    sucursal.activa = nuevoEstado;
    sucursal.estado = nuevoEstado ? "activa" : "inactiva";
    refrescarTablaSucursalesGlobal();
    await window.OverTrackUI.mostrarMensaje({ titulo: "Estado actualizado", mensaje: `Sucursal ${nuevoEstado ? "activada" : "desactivada"} correctamente.`, tipo: "exito" });
  } catch (error) {
    console.error("Error cambiando estado de la sucursal:", error);
    await window.OverTrackUI.mostrarMensaje({ titulo: "No se pudo actualizar", mensaje: "No se pudo cambiar el estado de la sucursal.", tipo: "error" });
  }
};

window.abrirConfiguracionEmpresa = function (empresaId) {
  const empresa = empresas.find(item => item.id === empresaId);
  if (!empresa) {
    window.OverTrackUI.mostrarMensaje({ titulo: "Empresa no encontrada", mensaje: "No se encontró la empresa seleccionada.", tipo: "error" });
    return;
  }

  const planActual = obtenerPlan(empresa.plan);
  const suscripcionActual = normalizarSuscripcion(empresa);
  const modulosActuales = { ...planActual.modulos, ...(empresa.modulos || {}) };
  MODULOS_PLAN.filter(modulo => modulo.obligatorio).forEach(modulo => {
    modulosActuales[modulo.key] = true;
  });

  const overlay = document.createElement("div");
  overlay.className = "plan-editor-overlay company-editor-overlay";
  overlay.innerHTML = `
    <form class="plan-editor company-editor" id="formEmpresaGlobal">
      <div class="plan-editor-header">
        <div><h2>Configurar Empresa</h2><p>${escaparHtml(empresa.nombre || "Empresa")}</p></div>
        <button type="button" class="plan-close" aria-label="Cerrar">×</button>
      </div>

      <h3 class="company-editor-title">Datos generales</h3>
      <div class="plan-form-grid">
        <label>Nombre<input id="empresaNombre" required value="${escaparHtml(empresa.nombre || "")}"></label>
        <label>RUT<input id="empresaRut" required value="${escaparHtml(empresa.rut || "")}"></label>
        <label>Giro<input id="empresaGiro" value="${escaparHtml(empresa.giro || "")}"></label>
        <label>Correo de contacto<input id="empresaCorreo" type="email" value="${escaparHtml(empresa.correo || "")}"></label>
        <label>Teléfono<input id="empresaTelefono" value="${escaparHtml(empresa.telefono || "")}"></label>
        <label>Ciudad<input id="empresaCiudad" value="${escaparHtml(empresa.ciudad || "")}"></label>
        <label>País<input id="empresaPais" value="${escaparHtml(empresa.pais || "Chile")}"></label>
        <label>Dirección<input id="empresaDireccion" value="${escaparHtml(empresa.direccion || "")}"></label>
        <label class="plan-check"><input id="empresaActiva" type="checkbox" ${empresa.activa !== false ? "checked" : ""}> Empresa activa</label>
      </div>

      <div class="company-plan-heading">
        <h3 class="company-editor-title">Plan y límites</h3>
        <button type="button" class="btn-secondary" id="btnAplicarPlanEmpresa">Aplicar valores del plan</button>
      </div>
      <div class="plan-form-grid">
        <label>Plan<select id="empresaPlan">${obtenerPlanesDisponibles().map(plan =>
          `<option value="${escaparHtml(plan.id)}" ${plan.id === empresa.plan ? "selected" : ""}>${escaparHtml(plan.nombre)}${plan.activo ? "" : " (inactivo)"}</option>`
        ).join("")}</select></label>
        <label>Máximo de usuarios<input id="empresaMaxUsuarios" type="number" min="1" required value="${Number(empresa.maxUsuarios || planActual.maxUsuarios)}"></label>
        <label>Máximo de sucursales<input id="empresaMaxSucursales" type="number" min="1" required value="${Number(empresa.maxSucursales || planActual.maxSucursales)}"></label>
        <label>Almacenamiento contratado (GB)<input id="empresaMaxStorage" type="number" min="1" required value="${Number(empresa.maxStorageGB || planActual.maxStorageGB)}"></label>
      </div>

      <h3 class="company-editor-title">Suscripción y pago</h3>
      <section class="company-subscription-panel">
        <div class="plan-form-grid">
          <label>Estado de la suscripción<select id="empresaSuscripcionEstado">${ESTADOS_SUSCRIPCION.map(item =>
            `<option value="${item.id}" ${item.id === suscripcionActual.estado ? "selected" : ""}>${item.nombre}</option>`
          ).join("")}</select></label>
          <label>Modalidad<select id="empresaSuscripcionModalidad"><option value="mensual" ${suscripcionActual.modalidad === "mensual" ? "selected" : ""}>Mensual</option><option value="anual" ${suscripcionActual.modalidad === "anual" ? "selected" : ""}>Anual</option></select></label>
          <label>Fecha de inicio<input id="empresaSuscripcionInicio" type="date" value="${escaparHtml(suscripcionActual.fechaInicio)}"></label>
          <label>Próximo vencimiento<input id="empresaSuscripcionVencimiento" type="date" value="${escaparHtml(suscripcionActual.fechaVencimiento)}"></label>
          <label>Días de gracia<input id="empresaSuscripcionGracia" type="number" min="0" max="90" value="${suscripcionActual.diasGracia}"></label>
          <label>Medio de pago<select id="empresaSuscripcionMedio"><option value="transferencia" ${suscripcionActual.medioPago === "transferencia" ? "selected" : ""}>Transferencia</option><option value="orden_compra" ${suscripcionActual.medioPago === "orden_compra" ? "selected" : ""}>Orden de compra</option><option value="otro" ${suscripcionActual.medioPago === "otro" ? "selected" : ""}>Otro</option></select></label>
          <label class="plan-wide">Número o referencia de orden de compra<input id="empresaSuscripcionOC" maxlength="100" value="${escaparHtml(suscripcionActual.numeroOrdenCompra)}" placeholder="Opcional"></label>
          <label class="plan-wide">Observaciones administrativas<textarea id="empresaSuscripcionObservaciones" rows="3" maxlength="1000" placeholder="Acuerdos de pago, renovación u observaciones internas">${escaparHtml(suscripcionActual.observaciones)}</textarea></label>
        </div>
        <p class="company-subscription-note">Este registro es administrativo. La suspensión automática se habilitará después de definir la política comercial definitiva.</p>
      </section>

      <h3 class="company-editor-title">Pagos y renovaciones</h3>
      <section class="company-payments-panel">
        <div class="company-payment-form">
          <label>Fecha del pago<input id="pagoFecha" type="date"></label>
          <label>Monto neto<input id="pagoMonto" type="number" min="0" step="1" placeholder="0"></label>
          <label>Moneda<select id="pagoMoneda"><option value="CLP">CLP</option><option value="USD">USD</option></select></label>
          <label>Estado<select id="pagoEstado"><option value="pagado">Pagado</option><option value="pendiente">Pendiente</option><option value="anulado">Anulado</option></select></label>
          <label>Periodo desde<input id="pagoPeriodoDesde" type="date"></label>
          <label>Periodo hasta<input id="pagoPeriodoHasta" type="date"></label>
          <label>Medio de pago<select id="pagoMedio"><option value="transferencia">Transferencia</option><option value="orden_compra">Orden de compra</option><option value="otro">Otro</option></select></label>
          <label>Referencia<input id="pagoReferencia" maxlength="100" placeholder="Transferencia u orden de compra"></label>
          <label class="company-payment-wide">Observación<input id="pagoObservacion" maxlength="300" placeholder="Opcional"></label>
          <label class="company-payment-renew"><input id="pagoRenovar" type="checkbox" checked> Actualizar el vencimiento con el final del periodo</label>
        </div>
        <div class="company-payment-actions"><button type="button" class="btn-secondary" id="btnRegistrarPago">Registrar pago</button></div>
        <div class="company-payment-history" id="historialPagosEmpresa"><p class="company-payment-empty">Cargando historial...</p></div>
      </section>

      <fieldset class="plan-modules"><legend>Módulos de esta empresa</legend><div class="plan-modules-grid" id="empresaModulosGrid">
        ${MODULOS_PLAN.map(modulo => `<label class="plan-module-option ${modulo.obligatorio ? "required" : ""}"><input type="checkbox" data-empresa-modulo="${modulo.key}" ${(modulo.obligatorio || modulosActuales[modulo.key]) ? "checked" : ""} ${modulo.obligatorio ? "disabled" : ""}><span>${modulo.nombre}${modulo.obligatorio ? " · Obligatorio" : ""}</span></label>`).join("")}
      </div></fieldset>
      <section class="company-flow-preview" aria-labelledby="tituloVistaFlujoEmpresa">
        <div class="company-flow-preview-header">
          <div>
            <h3 id="tituloVistaFlujoEmpresa">Vista previa del flujo</h3>
            <p>Así funcionará el recorrido de las órdenes de trabajo para esta empresa.</p>
          </div>
          <span class="company-flow-live">Vista en tiempo real</span>
        </div>
        <div class="company-flow-track" id="vistaPreviaFlujoEmpresa"></div>
        <p class="company-flow-summary" id="resumenFlujoEmpresa"></p>
      </section>
      <p class="company-editor-note">Aplicar valores del plan reemplaza límites y módulos del formulario. Los cambios solo se guardan al presionar “Guardar empresa”.</p>
      <div class="plan-editor-actions"><button type="button" class="btn-secondary company-cancel">Cancelar</button><button type="submit" class="btn-primary">Guardar empresa</button></div>
    </form>`;

  document.body.appendChild(overlay);
  const cerrar = () => overlay.remove();
  overlay.querySelector(".plan-close").addEventListener("click", cerrar);
  overlay.querySelector(".company-cancel").addEventListener("click", cerrar);
  overlay.addEventListener("click", event => { if (event.target === overlay) cerrar(); });
  overlay.querySelector("#btnAplicarPlanEmpresa").addEventListener("click", () => aplicarPlanEnEditorEmpresa(overlay));
  overlay.querySelector("#btnRegistrarPago").addEventListener("click", () => registrarPagoEmpresa(overlay, empresaId));
  overlay.querySelectorAll("[data-empresa-modulo]").forEach(input => {
    input.addEventListener("change", () => actualizarVistaPreviaFlujoEmpresa(overlay));
  });
  overlay.querySelector("#formEmpresaGlobal").addEventListener("submit", async event => {
    event.preventDefault();
    await guardarConfiguracionEmpresa(overlay, empresaId);
  });
  actualizarVistaPreviaFlujoEmpresa(overlay);
  cargarHistorialPagosEmpresa(overlay, empresaId);
};

function formatearFechaPago(fecha) {
  if (!fecha) return "-";
  const partes = String(fecha).split("-");
  return partes.length === 3 ? `${partes[2]}-${partes[1]}-${partes[0]}` : fecha;
}

async function cargarHistorialPagosEmpresa(overlay, empresaId) {
  const contenedor = overlay?.querySelector("#historialPagosEmpresa");
  if (!contenedor) return;
  try {
    const snap = await getDocs(collection(db, "empresas", empresaId, "pagos"));
    const pagos = snap.docs.map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(b.fechaPago || b.fechaCreacion || "").localeCompare(String(a.fechaPago || a.fechaCreacion || "")));
    if (!pagos.length) {
      contenedor.innerHTML = '<p class="company-payment-empty">Aún no existen pagos registrados.</p>';
      return;
    }
    contenedor.innerHTML = `
      <div class="company-payment-table-wrap"><table class="company-payment-table">
        <thead><tr><th>Fecha</th><th>Monto neto</th><th>Periodo</th><th>Medio</th><th>Referencia</th><th>Estado</th></tr></thead>
        <tbody>${pagos.map(pago => `<tr>
          <td>${escaparHtml(formatearFechaPago(pago.fechaPago))}</td>
          <td>${escaparHtml(formatearPrecioPlan(pago.montoNeto, pago.moneda))}</td>
          <td>${escaparHtml(formatearFechaPago(pago.periodoDesde))} al ${escaparHtml(formatearFechaPago(pago.periodoHasta))}</td>
          <td>${escaparHtml(pago.medioPago === "orden_compra" ? "Orden de compra" : pago.medioPago || "-")}</td>
          <td>${escaparHtml(pago.referencia || "-")}</td>
          <td><span class="company-payment-status ${escaparHtml(pago.estado || "pendiente")}">${escaparHtml(pago.estado || "Pendiente")}</span></td>
        </tr>`).join("")}</tbody>
      </table></div>`;
  } catch (error) {
    console.error("Error cargando historial de pagos:", error);
    contenedor.innerHTML = '<p class="company-payment-empty error">No fue posible cargar el historial.</p>';
  }
}

async function registrarPagoEmpresa(overlay, empresaId) {
  const boton = overlay.querySelector("#btnRegistrarPago");
  const pago = {
    empresaId,
    fechaPago: overlay.querySelector("#pagoFecha").value,
    montoNeto: Math.max(0, Number(overlay.querySelector("#pagoMonto").value || 0)),
    moneda: overlay.querySelector("#pagoMoneda").value,
    estado: overlay.querySelector("#pagoEstado").value,
    periodoDesde: overlay.querySelector("#pagoPeriodoDesde").value,
    periodoHasta: overlay.querySelector("#pagoPeriodoHasta").value,
    medioPago: overlay.querySelector("#pagoMedio").value,
    referencia: overlay.querySelector("#pagoReferencia").value.trim(),
    observacion: overlay.querySelector("#pagoObservacion").value.trim(),
    registradoPor: usuarioActivo.uid,
    fechaCreacion: serverTimestamp()
  };
  if (!pago.fechaPago || !pago.montoNeto || !pago.periodoDesde || !pago.periodoHasta) {
    await window.OverTrackUI.mostrarMensaje({ titulo: "Pago incompleto", mensaje: "Completa la fecha, el monto y el periodo cubierto.", tipo: "advertencia" });
    return;
  }
  if (pago.periodoHasta < pago.periodoDesde) {
    await window.OverTrackUI.mostrarMensaje({ titulo: "Periodo incorrecto", mensaje: "La fecha final no puede ser anterior a la fecha inicial.", tipo: "advertencia" });
    return;
  }
  try {
    boton.disabled = true;
    boton.textContent = "Registrando...";
    const pagoRef = doc(collection(db, "empresas", empresaId, "pagos"));
    const batch = writeBatch(db);
    batch.set(pagoRef, pago);
    if (pago.estado === "pagado" && overlay.querySelector("#pagoRenovar").checked) {
      const suscripcionRenovada = {
        estado: "activa",
        modalidad: overlay.querySelector("#empresaSuscripcionModalidad").value,
        fechaInicio: overlay.querySelector("#empresaSuscripcionInicio").value || pago.periodoDesde,
        fechaVencimiento: pago.periodoHasta,
        diasGracia: Math.max(0, Math.min(90, Number(overlay.querySelector("#empresaSuscripcionGracia").value || 0))),
        medioPago: overlay.querySelector("#empresaSuscripcionMedio").value,
        numeroOrdenCompra: overlay.querySelector("#empresaSuscripcionOC").value.trim(),
        observaciones: overlay.querySelector("#empresaSuscripcionObservaciones").value.trim(),
        fechaActualizacion: new Date().toISOString(),
        actualizadoPor: usuarioActivo.uid
      };
      batch.set(doc(db, "empresas", empresaId), {
        suscripcion: suscripcionRenovada,
        fechaActualizacion: serverTimestamp(),
        actualizadoPor: usuarioActivo.uid
      }, { merge: true });
      overlay.querySelector("#empresaSuscripcionEstado").value = "activa";
      overlay.querySelector("#empresaSuscripcionVencimiento").value = pago.periodoHasta;
    }
    await batch.commit();
    ["#pagoFecha", "#pagoMonto", "#pagoPeriodoDesde", "#pagoPeriodoHasta", "#pagoReferencia", "#pagoObservacion"].forEach(selector => {
      overlay.querySelector(selector).value = "";
    });
    await cargarHistorialPagosEmpresa(overlay, empresaId);
    await window.OverTrackUI.mostrarMensaje({ titulo: "Pago registrado", mensaje: "El pago fue incorporado al historial correctamente.", tipo: "exito" });
  } catch (error) {
    console.error("Error registrando pago:", error);
    await window.OverTrackUI.mostrarMensaje({ titulo: "No se pudo registrar", mensaje: "No fue posible guardar el pago.", tipo: "error" });
  } finally {
    boton.disabled = false;
    boton.textContent = "Registrar pago";
  }
}

function aplicarPlanEnEditorEmpresa(overlay) {
  const plan = obtenerPlan(overlay.querySelector("#empresaPlan").value);
  overlay.querySelector("#empresaMaxUsuarios").value = plan.maxUsuarios;
  overlay.querySelector("#empresaMaxSucursales").value = plan.maxSucursales;
  overlay.querySelector("#empresaMaxStorage").value = plan.maxStorageGB;
  overlay.querySelectorAll("[data-empresa-modulo]").forEach(input => {
    const obligatorio = MODULOS_PLAN.find(modulo => modulo.key === input.dataset.empresaModulo)?.obligatorio;
    input.checked = obligatorio || plan.modulos[input.dataset.empresaModulo] === true;
  });
  actualizarVistaPreviaFlujoEmpresa(overlay);
}

async function guardarConfiguracionEmpresa(overlay, empresaId) {
  const modulos = {};
  overlay.querySelectorAll("[data-empresa-modulo]").forEach(input => {
    modulos[input.dataset.empresaModulo] = input.checked;
  });
  MODULOS_PLAN.filter(modulo => modulo.obligatorio).forEach(modulo => { modulos[modulo.key] = true; });

  if (!tieneEtapaOperativaActiva(modulos)) {
    await advertirFlujoSinEtapas();
    return;
  }

  const datos = {
    nombre: overlay.querySelector("#empresaNombre").value.trim(),
    rut: overlay.querySelector("#empresaRut").value.trim(),
    giro: overlay.querySelector("#empresaGiro").value.trim(),
    correo: overlay.querySelector("#empresaCorreo").value.trim(),
    telefono: overlay.querySelector("#empresaTelefono").value.trim(),
    ciudad: overlay.querySelector("#empresaCiudad").value.trim(),
    pais: overlay.querySelector("#empresaPais").value.trim(),
    direccion: overlay.querySelector("#empresaDireccion").value.trim(),
    activa: overlay.querySelector("#empresaActiva").checked,
    estado: overlay.querySelector("#empresaActiva").checked ? "activa" : "inactiva",
    plan: overlay.querySelector("#empresaPlan").value,
    maxUsuarios: Math.max(1, Number(overlay.querySelector("#empresaMaxUsuarios").value)),
    maxSucursales: Math.max(1, Number(overlay.querySelector("#empresaMaxSucursales").value)),
    maxStorageGB: Math.max(1, Number(overlay.querySelector("#empresaMaxStorage").value)),
    suscripcion: {
      estado: overlay.querySelector("#empresaSuscripcionEstado").value,
      modalidad: overlay.querySelector("#empresaSuscripcionModalidad").value,
      fechaInicio: overlay.querySelector("#empresaSuscripcionInicio").value,
      fechaVencimiento: overlay.querySelector("#empresaSuscripcionVencimiento").value,
      diasGracia: Math.max(0, Math.min(90, Number(overlay.querySelector("#empresaSuscripcionGracia").value || 0))),
      medioPago: overlay.querySelector("#empresaSuscripcionMedio").value,
      numeroOrdenCompra: overlay.querySelector("#empresaSuscripcionOC").value.trim(),
      observaciones: overlay.querySelector("#empresaSuscripcionObservaciones").value.trim(),
      fechaActualizacion: new Date().toISOString(),
      actualizadoPor: usuarioActivo.uid
    },
    modulos,
    fechaActualizacion: serverTimestamp(),
    actualizadoPor: usuarioActivo.uid
  };

  if (!datos.nombre || !datos.rut) {
    await window.OverTrackUI.mostrarMensaje({ titulo: "Datos incompletos", mensaje: "Nombre y RUT son obligatorios.", tipo: "advertencia" });
    return;
  }

  try {
    await setDoc(doc(db, "empresas", empresaId), datos, { merge: true });
    overlay.remove();
    await cargarEmpresas();
    await window.OverTrackUI.mostrarMensaje({ titulo: "Empresa actualizada", mensaje: "Los cambios fueron guardados correctamente.", tipo: "exito" });
  } catch (error) {
    console.error("Error actualizando empresa:", error);
    await window.OverTrackUI.mostrarMensaje({ titulo: "No se pudo actualizar", mensaje: "No se pudo actualizar la empresa.", tipo: "error" });
  }
}

function renderVistaPlanes() {
  cabecera("Planes", "Configura capacidades y módulos para las nuevas empresas.");
  const catalogo = obtenerPlanesDisponibles();
  document.getElementById("contenidoVista").innerHTML = `
    <section class="plans-toolbar card">
      <div><h2>Catálogo de planes</h2><p>Cada plan define límites y módulos iniciales. Después puedes personalizar cada empresa.</p></div>
      <button class="btn-primary" onclick="abrirEditorPlan()">+ Nuevo Plan</button>
    </section>
    <section class="plans-grid">${catalogo.map(plan => `
      <article class="plan-card ${plan.destacado ? "featured" : ""}">
        ${plan.destacado ? '<span class="plan-label">Destacado</span>' : ""}
        <span class="plan-status ${plan.activo ? "active" : "inactive"}">${plan.activo ? "Activo" : "Inactivo"}</span>
        <h2>${escaparHtml(plan.nombre)}</h2><p class="plan-key">${escaparHtml(plan.id)}</p>
        <p class="plan-description">${escaparHtml(plan.descripcion || "Sin descripción")}</p>
        <div class="plan-price">
          <strong>${formatearPrecioPlan(plan.precioMensualNeto, plan.moneda)}</strong><span> neto / mes</span>
          <small>${formatearPrecioPlan(plan.precioAnualNeto, plan.moneda)} neto / año · ${plan.diasPrueba} días de prueba</small>
        </div>
        <ul>
          <li><strong>${plan.maxUsuarios}</strong> usuarios</li>
          <li><strong>${plan.maxSucursales}</strong> sucursales</li>
          <li><strong>${plan.maxStorageGB} GB</strong> de almacenamiento</li>
          <li><strong>${Object.values(plan.modulos).filter(Boolean).length}</strong> módulos incluidos</li>
        </ul>
        <div class="plan-actions"><button class="btn-primary" onclick="abrirEditorPlan('${plan.id}')">Editar plan</button></div>
      </article>`).join("")}</section>
    <p class="info-note">Los cambios se aplican a empresas nuevas. Las empresas existentes conservan su configuración actual.</p>`;
}

window.abrirEditorPlan = function (planId = "") {
  const plan = planId ? obtenerPlan(planId) : crearPlanBase("", "", "", 10, 1, 5);
  const nuevo = !planId;
  const overlay = document.createElement("div");
  overlay.className = "plan-editor-overlay";
  overlay.innerHTML = `
    <form class="plan-editor" id="formPlan">
      <div class="plan-editor-header">
        <div><h2>${nuevo ? "Nuevo Plan" : "Editar Plan"}</h2><p>Define límites y funcionalidades incluidas.</p></div>
        <button type="button" class="plan-close" aria-label="Cerrar">×</button>
      </div>
      <div class="plan-form-grid">
        <label>Nombre<input id="planNombre" required value="${escaparHtml(plan.nombre)}"></label>
        <label>Código interno<input id="planId" required pattern="[a-z0-9_-]+" ${nuevo ? "" : "disabled"} value="${escaparHtml(plan.id)}"><small>Minúsculas, números, guion o guion bajo.</small></label>
        <label class="plan-wide">Descripción<textarea id="planDescripcion" rows="3">${escaparHtml(plan.descripcion || "")}</textarea></label>
        <label>Máximo de usuarios<input id="planUsuarios" type="number" min="1" required value="${plan.maxUsuarios}"></label>
        <label>Máximo de sucursales<input id="planSucursales" type="number" min="1" required value="${plan.maxSucursales}"></label>
        <label>Almacenamiento (GB)<input id="planStorage" type="number" min="1" required value="${plan.maxStorageGB}"></label>
        <label>Precio mensual neto<input id="planPrecioMensual" type="number" min="0" step="1" value="${plan.precioMensualNeto}"><small>0 = por definir.</small></label>
        <label>Precio anual neto<input id="planPrecioAnual" type="number" min="0" step="1" value="${plan.precioAnualNeto}"><small>0 = por definir.</small></label>
        <label>Moneda<select id="planMoneda"><option value="CLP" ${plan.moneda === "CLP" ? "selected" : ""}>CLP</option><option value="USD" ${plan.moneda === "USD" ? "selected" : ""}>USD</option></select></label>
        <label>Días de prueba<input id="planDiasPrueba" type="number" min="0" max="90" step="1" value="${plan.diasPrueba}"></label>
        <label class="plan-check"><input id="planActivo" type="checkbox" ${plan.activo ? "checked" : ""}> Plan activo</label>
        <label class="plan-check"><input id="planDestacado" type="checkbox" ${plan.destacado ? "checked" : ""}> Plan destacado</label>
      </div>
      <fieldset class="plan-modules"><legend>Módulos incluidos</legend><div class="plan-modules-grid">
        ${MODULOS_PLAN.map(modulo => `<label class="plan-module-option ${modulo.obligatorio ? "required" : ""}"><input type="checkbox" data-plan-modulo="${modulo.key}" ${(modulo.obligatorio || plan.modulos[modulo.key]) ? "checked" : ""} ${modulo.obligatorio ? "disabled" : ""}><span>${modulo.nombre}${modulo.obligatorio ? " · Obligatorio" : ""}</span></label>`).join("")}
      </div></fieldset>
      <div class="plan-editor-actions"><button type="button" class="btn-secondary plan-cancel">Cancelar</button><button type="submit" class="btn-primary">Guardar plan</button></div>
    </form>`;
  document.body.appendChild(overlay);
  const cerrar = () => overlay.remove();
  overlay.querySelector(".plan-close").addEventListener("click", cerrar);
  overlay.querySelector(".plan-cancel").addEventListener("click", cerrar);
  overlay.addEventListener("click", event => { if (event.target === overlay) cerrar(); });
  overlay.querySelector("#formPlan").addEventListener("submit", async event => {
    event.preventDefault();
    await guardarPlanDesdeEditor(overlay, planId);
  });
};

async function guardarPlanDesdeEditor(overlay, planIdOriginal) {
  const id = (planIdOriginal || overlay.querySelector("#planId").value).trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(id)) {
    await window.OverTrackUI.mostrarMensaje({ titulo: "Código no válido", mensaje: "El código solo puede contener minúsculas, números, guion o guion bajo.", tipo: "advertencia" });
    return;
  }
  if (!planIdOriginal && obtenerPlanesDisponibles().some(plan => plan.id === id)) {
    await window.OverTrackUI.mostrarMensaje({ titulo: "Plan duplicado", mensaje: "Ya existe un plan con ese código.", tipo: "advertencia" });
    return;
  }
  const modulos = {};
  overlay.querySelectorAll("[data-plan-modulo]").forEach(input => { modulos[input.dataset.planModulo] = input.checked; });
  MODULOS_PLAN.filter(modulo => modulo.obligatorio).forEach(modulo => { modulos[modulo.key] = true; });
  if (!tieneEtapaOperativaActiva(modulos)) {
    await advertirFlujoSinEtapas();
    return;
  }
  const plan = normalizarPlan({
    id,
    nombre: overlay.querySelector("#planNombre").value.trim(),
    descripcion: overlay.querySelector("#planDescripcion").value.trim(),
    maxUsuarios: overlay.querySelector("#planUsuarios").value,
    maxSucursales: overlay.querySelector("#planSucursales").value,
    maxStorageGB: overlay.querySelector("#planStorage").value,
    precioMensualNeto: overlay.querySelector("#planPrecioMensual").value,
    precioAnualNeto: overlay.querySelector("#planPrecioAnual").value,
    moneda: overlay.querySelector("#planMoneda").value,
    diasPrueba: overlay.querySelector("#planDiasPrueba").value,
    activo: overlay.querySelector("#planActivo").checked,
    destacado: overlay.querySelector("#planDestacado").checked,
    modulos
  });
  if (!plan.nombre) { await window.OverTrackUI.mostrarMensaje({ titulo: "Dato obligatorio", mensaje: "El nombre del plan es obligatorio.", tipo: "advertencia" }); return; }
  try {
    await setDoc(doc(db, "planes", id), {
      nombre: plan.nombre,
      descripcion: plan.descripcion,
      maxUsuarios: plan.maxUsuarios,
      maxSucursales: plan.maxSucursales,
      maxStorageGB: plan.maxStorageGB,
      precioMensualNeto: plan.precioMensualNeto,
      precioAnualNeto: plan.precioAnualNeto,
      moneda: plan.moneda,
      diasPrueba: plan.diasPrueba,
      activo: plan.activo,
      destacado: plan.destacado,
      modulos: plan.modulos,
      fechaActualizacion: serverTimestamp(),
      actualizadoPor: usuarioActivo.uid
    }, { merge: true });
    overlay.remove();
    await cargarPlanes();
    renderVistaPlanes();
    await window.OverTrackUI.mostrarMensaje({ titulo: "Plan guardado", mensaje: "El plan fue guardado correctamente.", tipo: "exito" });
  } catch (error) {
    console.error("Error guardando plan:", error);
    await window.OverTrackUI.mostrarMensaje({ titulo: "No se pudo guardar", mensaje: "No se pudo guardar el plan.", tipo: "error" });
  }
}

function renderVistaConfiguracion() {
  cabecera("Configuración", "Parámetros generales y valores predeterminados de Vectaria.");
  const planPredeterminadoExiste = obtenerPlanesDisponibles().some(plan => plan.id === configuracionSistema.planPredeterminado);
  const comercial = { ...CONFIGURACION_BASE.datosComerciales, ...(configuracionSistema.datosComerciales || {}) };
  document.getElementById("contenidoVista").innerHTML = `
    <section class="card global-config-card">
      <div class="section-header global-config-header">
        <div><h2>Configuración general</h2><p class="section-copy">Estos valores se utilizarán como base al crear empresas nuevas.</p></div>
        <button class="btn-primary" id="btnGuardarConfiguracionGlobal">Guardar cambios</button>
      </div>

      <div class="global-config-grid">
        <section class="global-config-panel">
          <h3>Identidad y soporte</h3>
          <div class="global-form-grid">
            <label>Nombre de la plataforma<input id="configNombrePlataforma" maxlength="80" value="${escaparHtml(configuracionSistema.nombrePlataforma)}"></label>
            <label>Correo de soporte<input id="configCorreoSoporte" type="email" maxlength="160" value="${escaparHtml(configuracionSistema.correoSoporte)}"></label>
            <label>Teléfono de soporte<input id="configTelefonoSoporte" maxlength="40" value="${escaparHtml(configuracionSistema.telefonoSoporte)}"></label>
            <label>Sitio web<input id="configSitioWeb" type="url" maxlength="200" placeholder="https://..." value="${escaparHtml(configuracionSistema.sitioWeb)}"></label>
          </div>
        </section>

        <section class="global-config-panel">
          <h3>Empresas nuevas</h3>
          <div class="global-form-grid">
            <label>País predeterminado<input id="configPaisPredeterminado" maxlength="80" value="${escaparHtml(configuracionSistema.paisPredeterminado)}"></label>
            <label>Plan predeterminado<select id="configPlanPredeterminado">${obtenerPlanesDisponibles().map(plan =>
              `<option value="${escaparHtml(plan.id)}" ${plan.id === configuracionSistema.planPredeterminado ? "selected" : ""}>${escaparHtml(plan.nombre)}${plan.activo ? "" : " (inactivo)"}</option>`
            ).join("")}${planPredeterminadoExiste ? "" : `<option selected value="professional">Professional</option>`}</select></label>
            <label>Color primario<div class="global-color-field"><input id="configColorPrimarioPicker" type="color" value="${escaparHtml(configuracionSistema.colorPrimarioPredeterminado)}"><input id="configColorPrimario" maxlength="7" value="${escaparHtml(configuracionSistema.colorPrimarioPredeterminado)}"></div></label>
            <label>Color secundario<div class="global-color-field"><input id="configColorSecundarioPicker" type="color" value="${escaparHtml(configuracionSistema.colorSecundarioPredeterminado)}"><input id="configColorSecundario" maxlength="7" value="${escaparHtml(configuracionSistema.colorSecundarioPredeterminado)}"></div></label>
          </div>
          <p class="global-config-help">Los colores se guardan como identidad inicial de la empresa. Su aplicación completa en todas las pantallas seguirá siendo una mejora posterior.</p>
        </section>
      </div>

      <section class="global-config-panel global-commercial-panel">
        <div class="global-commercial-heading">
          <div><h3>Datos comerciales de Vectaria</h3><p>Información del proveedor que podrá reutilizarse posteriormente en cotizaciones, instrucciones de pago y documentos.</p></div>
          <span>Uso interno</span>
        </div>
        <div class="global-form-grid global-commercial-grid">
          <label>Razón social<input id="configRazonSocial" maxlength="160" value="${escaparHtml(comercial.razonSocial)}" placeholder="Nombre legal del proveedor"></label>
          <label>Nombre de fantasía<input id="configNombreFantasia" maxlength="120" value="${escaparHtml(comercial.nombreFantasia)}"></label>
          <label>RUT<input id="configRutComercial" maxlength="20" value="${escaparHtml(comercial.rut)}" placeholder="12.345.678-9"></label>
          <label>Giro comercial<input id="configGiroComercial" maxlength="180" value="${escaparHtml(comercial.giro)}"></label>
          <label class="global-form-wide">Dirección comercial<input id="configDireccionComercial" maxlength="220" value="${escaparHtml(comercial.direccion)}"></label>
          <label>Comuna<input id="configComunaComercial" maxlength="100" value="${escaparHtml(comercial.comuna)}"></label>
          <label>Ciudad<input id="configCiudadComercial" maxlength="100" value="${escaparHtml(comercial.ciudad)}"></label>
          <label>Región<input id="configRegionComercial" maxlength="100" value="${escaparHtml(comercial.region)}"></label>
          <label>País<input id="configPaisComercial" maxlength="80" value="${escaparHtml(comercial.pais)}"></label>
          <label>Correo comercial<input id="configCorreoComercial" type="email" maxlength="160" value="${escaparHtml(comercial.correoComercial)}"></label>
          <label>Teléfono comercial<input id="configTelefonoComercial" maxlength="40" value="${escaparHtml(comercial.telefonoComercial)}"></label>
        </div>
        <p class="global-config-help">Estos datos no se publican automáticamente ni generan documentos tributarios.</p>
      </section>
    </section>

    <section class="settings-grid">
      <article class="card settings-card"><h2>Seguridad</h2><p><span class="status-dot"></span> Reglas de Firestore activas</p><p><span class="status-dot"></span> Reglas de Storage activas</p><p><span class="status-dot"></span> Acceso protegido por roles</p></article>
      <article class="card settings-card"><h2>Entorno</h2><p><strong>Proyecto:</strong> Vectaria</p><p><strong>Base de datos:</strong> Firestore</p><p><strong>Archivos:</strong> Firebase Storage</p></article>
      <article class="card settings-card"><h2>Administración</h2><p>Empresas: ${empresas.length}</p><p>Usuarios de empresa: ${usuarios.filter(u => u.rol !== "super_admin").length}</p><p>Sucursales: ${sucursales.length}</p></article>
    </section>
    <p class="info-note">Las claves de Firebase, credenciales y parámetros críticos no se exponen ni se administran desde esta pantalla.</p>`;

  document.getElementById("btnGuardarConfiguracionGlobal").addEventListener("click", guardarConfiguracionGlobal);
  vincularCamposColorGlobal("configColorPrimarioPicker", "configColorPrimario");
  vincularCamposColorGlobal("configColorSecundarioPicker", "configColorSecundario");
}

function vincularCamposColorGlobal(pickerId, textoId) {
  const picker = document.getElementById(pickerId);
  const texto = document.getElementById(textoId);
  if (!picker || !texto) return;
  picker.addEventListener("input", () => { texto.value = picker.value; });
  texto.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(texto.value.trim())) picker.value = texto.value.trim();
  });
}

async function guardarConfiguracionGlobal() {
  const boton = document.getElementById("btnGuardarConfiguracionGlobal");
  const datos = {
    nombrePlataforma: document.getElementById("configNombrePlataforma").value.trim(),
    correoSoporte: document.getElementById("configCorreoSoporte").value.trim(),
    telefonoSoporte: document.getElementById("configTelefonoSoporte").value.trim(),
    sitioWeb: document.getElementById("configSitioWeb").value.trim(),
    paisPredeterminado: document.getElementById("configPaisPredeterminado").value.trim(),
    planPredeterminado: document.getElementById("configPlanPredeterminado").value,
    colorPrimarioPredeterminado: document.getElementById("configColorPrimario").value.trim().toLowerCase(),
    colorSecundarioPredeterminado: document.getElementById("configColorSecundario").value.trim().toLowerCase(),
    datosComerciales: {
      razonSocial: document.getElementById("configRazonSocial").value.trim(),
      nombreFantasia: document.getElementById("configNombreFantasia").value.trim(),
      rut: document.getElementById("configRutComercial").value.trim(),
      giro: document.getElementById("configGiroComercial").value.trim(),
      direccion: document.getElementById("configDireccionComercial").value.trim(),
      comuna: document.getElementById("configComunaComercial").value.trim(),
      ciudad: document.getElementById("configCiudadComercial").value.trim(),
      region: document.getElementById("configRegionComercial").value.trim(),
      pais: document.getElementById("configPaisComercial").value.trim(),
      correoComercial: document.getElementById("configCorreoComercial").value.trim(),
      telefonoComercial: document.getElementById("configTelefonoComercial").value.trim()
    }
  };

  if (!datos.nombrePlataforma || !datos.paisPredeterminado) {
    await window.OverTrackUI.mostrarMensaje({ titulo: "Datos incompletos", mensaje: "El nombre de la plataforma y el país predeterminado son obligatorios.", tipo: "advertencia" });
    return;
  }
  if (datos.correoSoporte && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correoSoporte)) {
    await window.OverTrackUI.mostrarMensaje({ titulo: "Correo no válido", mensaje: "Ingresa un correo de soporte válido.", tipo: "advertencia" });
    return;
  }
  if (datos.datosComerciales.correoComercial && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.datosComerciales.correoComercial)) {
    await window.OverTrackUI.mostrarMensaje({ titulo: "Correo no válido", mensaje: "Ingresa un correo comercial válido.", tipo: "advertencia" });
    return;
  }
  if (!/^#[0-9a-f]{6}$/i.test(datos.colorPrimarioPredeterminado) || !/^#[0-9a-f]{6}$/i.test(datos.colorSecundarioPredeterminado)) {
    await window.OverTrackUI.mostrarMensaje({ titulo: "Formato no válido", mensaje: "Los colores deben usar el formato hexadecimal #RRGGBB.", tipo: "advertencia" });
    return;
  }

  try {
    if (boton) { boton.disabled = true; boton.textContent = "Guardando..."; }
    await setDoc(doc(db, "configuracionGlobal", "sistema"), {
      ...datos,
      fechaActualizacion: serverTimestamp(),
      actualizadoPor: usuarioActivo.uid
    }, { merge: true });
    configuracionSistema = { ...CONFIGURACION_BASE, ...datos };
    aplicarIdentidadGlobal();
    await window.OverTrackUI.mostrarMensaje({ titulo: "Configuración guardada", mensaje: "La configuración global fue guardada correctamente.", tipo: "exito" });
  } catch (error) {
    console.error("Error guardando configuración global:", error);
    await window.OverTrackUI.mostrarMensaje({ titulo: "No se pudo guardar", mensaje: "No se pudo guardar la configuración global.", tipo: "error" });
  } finally {
    if (boton) { boton.disabled = false; boton.textContent = "Guardar cambios"; }
  }
}

function aplicarIdentidadGlobal() {
  const nombre = configuracionSistema.nombrePlataforma || "Vectaria";
  document.title = `${nombre} | Super Administrador`;
}

window.cambiarVistaSuperAdmin = function (vista, elemento) {
  vistaActual = vista;
  document.querySelectorAll("[data-super-view]").forEach(item => item.classList.remove("active"));
  if (elemento) elemento.classList.add("active");
  const renders = { dashboard: renderDashboard, empresas: renderVistaEmpresas, usuarios: renderVistaUsuarios, sucursales: renderVistaSucursales, planes: renderVistaPlanes, configuracion: renderVistaConfiguracion };
  (renders[vista] || renderDashboard)();
};

async function cargarDatosGlobales() {
  const contenido = document.getElementById("contenidoVista");
  if (contenido) contenido.innerHTML = '<section class="card"><p>Cargando información...</p></section>';
  try {
    const [empresasSnap, usuariosSnap, sucursalesSnap, otsSnap, planesSnap, configuracionSnap] = await Promise.all([
      getDocs(collection(db, "empresas")), getDocs(collection(db, "usuarios")),
      getDocs(collection(db, "sucursales")), getDocs(collection(db, "ots")),
      getDocs(collection(db, "planes")),
      getDoc(doc(db, "configuracionGlobal", "sistema"))
    ]);
    empresas = empresasSnap.docs.map(item => ({ id: item.id, ...item.data() }));
    usuarios = usuariosSnap.docs.map(item => ({ id: item.id, ...item.data() }));
    sucursales = sucursalesSnap.docs.map(item => ({ id: item.id, ...item.data() }));
    ots = otsSnap.docs.map(item => ({ id: item.id, ...item.data() }));
    planes = planesSnap.docs.map(item => normalizarPlan({ id: item.id, ...item.data() }));
    configuracionSistema = configuracionSnap.exists()
      ? {
          ...CONFIGURACION_BASE,
          ...configuracionSnap.data(),
          datosComerciales: {
            ...CONFIGURACION_BASE.datosComerciales,
            ...(configuracionSnap.data().datosComerciales || {})
          }
        }
      : { ...CONFIGURACION_BASE };
    if (/^(overtrack|mantenitrack)$/i.test(configuracionSistema.nombrePlataforma || "")) {
      configuracionSistema.nombrePlataforma = "Vectaria";
    }
    aplicarIdentidadGlobal();
    cambiarVistaSuperAdmin(vistaActual, document.querySelector(`[data-super-view="${vistaActual}"]`));
  } catch (error) {
    console.error("Error cargando panel global:", error);
    if (contenido) contenido.innerHTML = '<section class="card"><p>No fue posible cargar la información del panel.</p></section>';
  }
}

async function cargarEmpresas() {
  await cargarDatosGlobales();
}

async function cargarPlanes() {
  const snap = await getDocs(collection(db, "planes"));
  planes = snap.docs.map(item => normalizarPlan({ id: item.id, ...item.data() }));
}

window.logout = function () {
  cerrarSesion();
};

function configurarMenuMovil() {
  const boton = document.querySelector(".mobile-menu-toggle");
  const fondo = document.querySelector(".mobile-menu-backdrop");
  const sidebar = document.getElementById("superAdminSidebar");
  if (!boton || !fondo || !sidebar) return;

  const cambiarEstado = (abierto) => {
    document.body.classList.toggle("menu-mobile-open", abierto);
    boton.setAttribute("aria-expanded", String(abierto));
    boton.setAttribute("aria-label", abierto
      ? "Cerrar menú de navegación"
      : "Abrir menú de navegación");
  };

  boton.addEventListener("click", () => {
    cambiarEstado(!document.body.classList.contains("menu-mobile-open"));
  });
  fondo.addEventListener("click", () => cambiarEstado(false));
  sidebar.addEventListener("click", (evento) => {
    if (evento.target.closest("[data-super-view]")) cambiarEstado(false);
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") cambiarEstado(false);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) cambiarEstado(false);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  configurarMenuMovil();
  cargarDatosGlobales();
});



window.verEmpresa = function (empresaId) {
  window.location.href = `empresa-admin.html?id=${empresaId}`;
};

window.eliminarEmpresa = async function (empresaId) {
  const empresa = empresas.find(item => item.id === empresaId);
  if (!empresa) {
    await window.OverTrackUI.mostrarMensaje({ titulo: "Empresa no encontrada", mensaje: "No se encontró la empresa seleccionada.", tipo: "error" });
    return;
  }

  const nombre = empresa.nombre || "Empresa sin nombre";
  const suscripcion = normalizarSuscripcion(empresa);
  if (suscripcion.estado !== "pendiente_eliminacion" || !suscripcion.eliminacionManual) {
    await window.OverTrackUI.mostrarMensaje({
      titulo: "Eliminación todavía no disponible",
      mensaje: "La eliminación manual solo se habilita cuando la empresa solicitó la cancelación y finalizó su periodo de 30 días para exportar los datos.",
      tipo: "advertencia"
    });
    return;
  }
  const aviso = await window.OverTrackUI.confirmarAccion({
    titulo: "Eliminar empresa definitivamente",
    mensaje: `Se eliminarán “${nombre}”, sus usuarios, cuentas de acceso, sucursales, clientes, equipos, OT y archivos. Esta acción no se puede deshacer.`,
    tipo: "error",
    textoConfirmar: "Continuar",
    textoCancelar: "Cancelar",
    peligrosa: true
  });
  if (!aviso) return;

  const confirmacion = await window.OverTrackUI.solicitarTexto({
    titulo: "Escribe el nombre de la empresa",
    mensaje: `Para confirmar la eliminación definitiva, escribe exactamente: ${nombre}`,
    tipo: "error",
    etiqueta: "Nombre exacto de la empresa",
    valorEsperado: nombre,
    textoConfirmar: "Eliminar definitivamente",
    textoCancelar: "Cancelar",
    peligrosa: true
  });
  if (confirmacion === null) return;

  try {
    const resultado = await eliminarEmpresaCompletaSegura({
      empresaId,
      confirmacion: confirmacion.trim()
    });
    const eliminados = resultado.data?.eliminados || {};
    await window.OverTrackUI.mostrarMensaje({
      titulo: "Empresa eliminada",
      mensaje:
        "La empresa fue eliminada completamente.\n\n" +
        `Usuarios: ${eliminados.usuarios || 0}\n` +
        `Sucursales: ${eliminados.sucursales || 0}\n` +
        `Clientes: ${eliminados.clientes || 0}\n` +
        `Equipos: ${eliminados.equipos || 0}\n` +
        `OT: ${eliminados.ots || 0}`,
      tipo: "exito",
      copiable: true
    });
    await cargarDatosGlobales();

  } catch (error) {
    console.error("Error eliminando empresa:", error);
    const mensajes = {
      "functions/permission-denied": "Tu cuenta no tiene permiso para eliminar empresas.",
      "functions/failed-precondition": "La confirmación no coincide con la empresa.",
      "functions/not-found": "La empresa ya no existe."
    };
    await window.OverTrackUI.mostrarMensaje({ titulo: "No se pudo eliminar", mensaje: mensajes[error.code] || "No se pudo completar la eliminación de la empresa.", tipo: "error" });
  }
};
