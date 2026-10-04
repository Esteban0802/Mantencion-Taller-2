// ==========================================
// MÓDULO DESPACHO — OVERTRACK
// ==========================================

export function inicializarModuloDespacho(servicios) {
  let cierreEnCurso = false;
  const {
    getOT,
    getUsuario,
    guardarCambiosOT,
    OTBloqueada,
    esJefeTaller,
    subirArchivoStorage,
    eliminarArchivoStorage,
    abrirDocumento,
    validarOTCompleta,
    aplicarModoSoloLectura
  } = servicios;

  const alert = (mensaje) => {
    const texto = String(mensaje || "");
    const tipo = /finalizada|guardad[ao]|correctamente/i.test(texto)
      ? "exito"
      : /error|no hay ot|no hay datos/i.test(texto)
        ? "error"
        : "advertencia";
    const titulo = tipo === "exito"
      ? "Operación completada"
      : tipo === "error"
        ? "No fue posible completar la acción"
        : "Revisa la información";

    if (window.OverTrackUI?.mostrarMensaje) {
      return window.OverTrackUI.mostrarMensaje({ titulo, mensaje: texto, tipo });
    }

    window.alert(texto);
    return Promise.resolve(true);
  };

  const confirmarAccion = ({ titulo, mensaje, textoConfirmar, peligrosa = false }) => {
    if (window.OverTrackUI?.confirmarAccion) {
      return window.OverTrackUI.confirmarAccion({
        titulo,
        mensaje,
        tipo: "advertencia",
        textoConfirmar,
        textoCancelar: "Cancelar",
        peligrosa
      });
    }

    return Promise.resolve(window.confirm(mensaje));
  };

  validarDependencias({
    getOT,
    getUsuario,
    guardarCambiosOT,
    OTBloqueada,
    esJefeTaller,
    subirArchivoStorage,
    eliminarArchivoStorage,
    abrirDocumento,
    validarOTCompleta,
    aplicarModoSoloLectura
  });

  // ==========================================
  // SUBIR DOCUMENTOS POR SECCIÓN
  // ==========================================
  async function subirDocsSeccion(tipo) {
    if (OTBloqueada()) return;

    const ot = getOT();

    if (!ot) {
      alert("No hay OT cargada");
      return;
    }

    const inputId =
      tipo === "preparacion"
        ? "docsPreparacion"
        : "docsFinal";

    const input = document.getElementById(inputId);

    if (!input || !input.files.length) {
      alert("Selecciona archivos");
      return;
    }

    const files = Array.from(input.files);
    const despachoExistia = Boolean(ot.despacho);
    const documentosOriginales = despachoExistia && Array.isArray(ot.despacho?.[tipo])
      ? [...ot.despacho[tipo]]
      : [];
    const urlsSubidasEnEsteIntento = [];

    if (!ot.despacho) {
      ot.despacho = {
        preparacion: [],
        final: []
      };
    }

    if (!Array.isArray(ot.despacho.preparacion)) {
      ot.despacho.preparacion = [];
    }

    if (!Array.isArray(ot.despacho.final)) {
      ot.despacho.final = [];
    }

    try {
      for (const file of files) {
        const urlArchivo = await subirArchivoStorage(
          file,
          tipo === "preparacion"
            ? "despacho_preparacion"
            : "despacho_final",
          "documentos"
        );

        if (!urlArchivo) throw new Error("El documento no obtuvo una URL válida.");
        urlsSubidasEnEsteIntento.push(urlArchivo);

        ot.despacho[tipo].push({
          nombre: file.name,
          tipo: file.type,
          url: urlArchivo,
          fecha: new Date().toLocaleString()
        });
      }

      const guardado = await guardarCambiosOT();
      if (!guardado) throw new Error("No fue posible confirmar los documentos en la OT.");

      renderDocsSeccion("preparacion");
      renderDocsSeccion("final");

      input.value = "";
    } catch (error) {
      await Promise.allSettled(
        urlsSubidasEnEsteIntento.map(url => eliminarArchivoStorage(url))
      );
      if (despachoExistia) {
        ot.despacho[tipo] = documentosOriginales;
      } else {
        delete ot.despacho;
      }
      input.value = "";
      console.error(
        "Error subiendo documento despacho:",
        error
      );

      alert("Error al subir documento");
    }
  }

  // ==========================================
  // RENDER DOCUMENTOS
  // ==========================================
  function renderDocsSeccion(tipo) {
    const ot = getOT();

    const contId =
      tipo === "preparacion"
        ? "listaDocsPrep"
        : "listaDocsFinal";

    const cont = document.getElementById(contId);

    if (!cont) return;

    cont.innerHTML = "";
    cont.className = "docs-pro-grid";

    const documentos = ot?.despacho?.[tipo] || [];

    documentos.forEach((doc, index) => {
      const div = document.createElement("div");

      div.className = "doc-card-pro";

      div.innerHTML = `
        <div class="doc-card-left">
          <div class="doc-card-icon">📄</div>

          <div class="doc-card-info">
            <h4>${escaparHTML(
              doc.nombre || "Documento sin nombre"
            )}</h4>

            <span>
              Documento de ${
                tipo === "preparacion"
                  ? "preparación"
                  : "despacho final"
              }
            </span>
          </div>
        </div>

        <div class="doc-card-actions">
          <button
            type="button"
            class="btn-doc-view permitido-bloqueo"
            onclick="abrirDocSeccion(event, '${tipo}', ${index})"
          >
            👁 Ver
          </button>

          <button
            type="button"
            class="btn-doc-delete"
            onclick="eliminarDocSeccion(event, '${tipo}', ${index})"
          >
            🗑 Eliminar
          </button>
        </div>
      `;

      cont.appendChild(div);
    });
  }

  // ==========================================
  // ABRIR DOCUMENTO
  // ==========================================
  function abrirDocSeccion(event, tipo, index) {
    event?.stopPropagation();

    const ot = getOT();
    const documento = ot?.despacho?.[tipo]?.[index];

    if (!documento) return;

    abrirDocumento(documento);
  }

  // ==========================================
  // ELIMINAR DOCUMENTO
  // ==========================================
  async function eliminarDocSeccion(event, tipo, index) {
    event?.stopPropagation();

    if (OTBloqueada()) return;

    const ot = getOT();
    const documentos = ot?.despacho?.[tipo];

    if (!Array.isArray(documentos)) return;
    if (!documentos[index]) return;

    if (!(await confirmarAccion({
      titulo: "Eliminar documento",
      mensaje: "El documento se eliminará de esta orden de trabajo.",
      textoConfirmar: "Eliminar",
      peligrosa: true
    }))) return;

    const documentoEliminado = documentos[index];
    documentos.splice(index, 1);

    const guardado = await guardarCambiosOT();
    if (!guardado) {
      documentos.splice(index, 0, documentoEliminado);
      return;
    }

    await eliminarArchivoStorage(documentoEliminado.url);
    renderDocsSeccion(tipo);
  }

  // ==========================================
  // GUARDAR DESPACHO
  // ==========================================
  async function guardarDespacho() {
    const ot = getOT();

    if (!ot) {
      alert("No hay OT cargada");
      return;
    }

    if (!ot.despacho) {
      alert("No hay datos en despacho");
      return;
    }

    const guardado = await guardarCambiosOT();

    if (!guardado) return;

    alert("Progreso de DESPACHO guardado ✅");
  }

  // ==========================================
  // VALIDAR DESPACHO
  // ==========================================
  function validarDespachoCompleto() {
    const ot = getOT();

    if (!ot?.despacho) {
      alert("Falta información de despacho");
      return false;
    }

    if (!ot.despacho.preparacion?.length) {
      alert("Faltan documentos de preparación");
      return false;
    }

    if (!ot.despacho.final?.length) {
      alert("Faltan documentos de despacho final");
      return false;
    }

    return true;
  }

  // ==========================================
  // CERRAR OT
  // ==========================================
  async function cerrarOT() {
    if (cierreEnCurso) return;

    const ot = getOT();

    if (!ot) {
      alert("No hay OT cargada");
      return;
    }

    if (!esJefeTaller()) {
      alert("Solo Jefe de Taller puede cerrar la OS");
      return;
    }

    cierreEnCurso = true;
    const botonesCierre = Array.from(document.querySelectorAll("[data-cierre-etapa]"));
    botonesCierre.forEach(boton => { boton.disabled = true; });

    try {
      if (!(await confirmarAccion({
        titulo: "Cerrar orden de trabajo",
        mensaje: "La OT quedará finalizada y pasará a modo de consulta.",
        textoConfirmar: "Cerrar OT",
        peligrosa: true
      }))) return;

      if (!validarOTCompleta()) return;

      const estadoAnterior = ot.estado;
      const cerradaAnterior = ot.cerrada;
      const fechaCierreAnterior = ot.fechaCierre;
      const cerradoPorAnterior = ot.cerradoPor;
      const cerradoPorNombreAnterior = ot.cerradoPorNombre;
      const cerradoPorRolAnterior = ot.cerradoPorRol;

      ot.estado = "CERRADA";
      ot.cerrada = true;
      ot.fechaCierre = new Date().toLocaleString();

      const usuarioCierre = getUsuario();
      ot.cerradoPor = usuarioCierre?.uid || "";
      ot.cerradoPorNombre = usuarioCierre?.nombre || "Jefe Taller";
      ot.cerradoPorRol = usuarioCierre?.rol || "jefe_taller";

      const guardado = await guardarCambiosOT();
      if (!guardado) {
        ot.estado = estadoAnterior;
        ot.cerrada = cerradaAnterior;
        ot.fechaCierre = fechaCierreAnterior;
        ot.cerradoPor = cerradoPorAnterior;
        ot.cerradoPorNombre = cerradoPorNombreAnterior;
        ot.cerradoPorRol = cerradoPorRolAnterior;
        return;
      }

      aplicarModoSoloLectura();
      await alert("OT FINALIZADA COMPLETAMENTE ✅");

      localStorage.removeItem("otActiva");
      window.location.href = "dashboard.html";
    } finally {
      cierreEnCurso = false;
      botonesCierre.forEach(boton => { boton.disabled = false; });
    }
  }

  // ==========================================
  // FUNCIONES EXPUESTAS AL HTML
  // ==========================================
  window.subirDocsSeccion = subirDocsSeccion;
  window.renderDocsSeccion = renderDocsSeccion;
  window.abrirDocSeccion = abrirDocSeccion;
  window.eliminarDocSeccion = eliminarDocSeccion;
  window.guardarDespacho = guardarDespacho;
  window.validarDespachoCompleto = validarDespachoCompleto;
  window.cerrarOT = cerrarOT;

  console.log(
    "📦 Módulo Despacho inicializado correctamente"
  );
}

// ==========================================
// VALIDACIÓN DE DEPENDENCIAS
// ==========================================
function validarDependencias(dependencias) {
  Object.entries(dependencias).forEach(
    ([nombre, valor]) => {
      if (typeof valor !== "function") {
        throw new Error(
          `Despacho: falta la dependencia ${nombre}.`
        );
      }
    }
  );
}

// ==========================================
// ESCAPAR HTML
// ==========================================
function escaparHTML(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
