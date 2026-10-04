// ==========================================
// MÓDULO EVALUACIÓN — OVERTRACK
// ==========================================

import {
  capturarBorradoresFormulario,
  restaurarBorradoresFormulario
} from "./core/utilidades.js";

export function inicializarModuloEvaluacion(servicios) {

  let decisionEvaluacionEnCurso = false;

  const {

    getOT,

    guardarCambiosOT,
    autoguardarCambiosOT,

    renderProgresoEtapa,
    itemCompleto,

    renderComentariosEvaluacion,

    OTBloqueada,

    actualizarEstadoGanttDesdeChecklist,
    recalcularGanttAutomatico,
    renderCartaGantt,

    verImagenModal,

    eliminarArchivoStorage,
    subirArchivoStorage,
    comprimirImagenBlob,

    abrirDocumento,

    getUsuario,
    esJefeTaller,
    obtenerEstadoOT,
    habilitarTab,
    cambiarTab,
    navegarSiguienteEtapa,
    aprobacionesHabilitadas,
    agregarBitacora

  } = servicios;

  const alert = (mensaje) => {
    const texto = String(mensaje || "");
    const tipo = /correctamente|completad[ao]|aprobad[ao]|rechazad[ao]/i.test(texto)
      ? "exito"
      : /error|no fue posible|no hay una orden/i.test(texto)
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

  const confirmarEliminacion = () => {
    if (window.OverTrackUI?.confirmarAccion) {
      return window.OverTrackUI.confirmarAccion({
        titulo: "Eliminar fotografía",
        mensaje: "La fotografía se eliminará de esta orden de trabajo.",
        tipo: "advertencia",
        textoConfirmar: "Eliminar",
        textoCancelar: "Cancelar",
        peligrosa: true
      });
    }

    return Promise.resolve(window.confirm("¿Eliminar foto?"));
  };


  validarDependencias({

    getOT,

    guardarCambiosOT,
    autoguardarCambiosOT,

    renderProgresoEtapa,
    itemCompleto,

    renderComentariosEvaluacion,

    OTBloqueada,

    actualizarEstadoGanttDesdeChecklist,
    recalcularGanttAutomatico,
    renderCartaGantt,

    verImagenModal,

    abrirDocumento,

    eliminarArchivoStorage,
    subirArchivoStorage,
    comprimirImagenBlob,

    getUsuario,
    esJefeTaller,
    obtenerEstadoOT,
    habilitarTab,
    cambiarTab,
    navegarSiguienteEtapa,
    aprobacionesHabilitadas,
    agregarBitacora
  });


  // ==========================================
  // CARGAR CHECKLIST DESDE EXCEL
  // ==========================================
  window.cargarEvaluacion = function cargarEvaluacion() {

    const ot = getOT();

    if (!ot) {
      alert("No hay una Orden de Servicio activa.");
      return;
    }

    const inputExcel =
      document.getElementById("excelEvaluacion");

    if (!inputExcel) {

      console.error(
        "Evaluación: no existe el elemento #excelEvaluacion."
      );

      return;
    }

    const file = inputExcel.files[0];

    if (!file) {
      alert("Debes subir el Excel");
      return;
    }

    if (!/\.xlsx?$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      alert("Selecciona un archivo Excel válido de máximo 5 MB.");
      inputExcel.value = "";
      return;
    }

    const reader = new FileReader();


    reader.onload = async function (event) {
      const checklistAnterior = ot.evaluacion;
      let checklistReemplazado = false;

      try {

        const data = new Uint8Array(
          event.target.result
        );

        const workbook = XLSX.read(data, {
          type: "array"
        });

        const primeraHoja =
          workbook.SheetNames[0];

        if (!primeraHoja) {

          alert("El Excel no contiene hojas.");

          return;
        }

        const sheet =
          workbook.Sheets[primeraHoja];

        const filas =
          XLSX.utils.sheet_to_json(
            sheet,
            {
              header: 1
            }
          );

        const checklist = filas
          .flat()
          .filter((valor) => {

            return (
              valor !== null &&
              valor !== undefined &&
              String(valor).trim() !== ""
            );

          })
          .slice(0, 400)
          .map((valor) => ({

            item: String(valor).trim().slice(0, 240),
            ok: false,
            fotos: [],
            comentarios: []

          }));


        if (checklist.length === 0) {

          alert(
            "El archivo Excel no contiene ítems válidos."
          );

          return;
        }


        ot.evaluacion = checklist;
        checklistReemplazado = true;


        const guardado = await guardarCambiosOT();
        if (!guardado) throw new Error("No fue posible guardar el checklist en la OT.");


        window.renderEvaluacion();


        inputExcel.value = "";


        console.log(
          "✅ Checklist de Evaluación cargado desde evaluacion.js"
        );


      } catch (error) {

        if (checklistReemplazado) ot.evaluacion = checklistAnterior;

        console.error(
          "Error procesando Excel de Evaluación:",
          error
        );

        alert(
          "No fue posible procesar el checklist de Evaluación."
        );

      }

    };


    reader.onerror = function (error) {

      console.error(
        "Error leyendo Excel de Evaluación:",
        error
      );

      alert(
        "No fue posible leer el archivo Excel."
      );

    };


    reader.readAsArrayBuffer(file);

  };


  // ==========================================
  // RENDER PRINCIPAL DE EVALUACIÓN
  // ==========================================
  window.renderEvaluacion = function renderEvaluacion() {

    const ot = getOT();

    const cont =
      document.getElementById("listaEvaluacion");

    if (!cont) return;


    cont.innerHTML = "";
    cont.className = "checklist-pro-grid";


    renderProgresoEtapa(
      "progresoEvaluacion",
      ot?.evaluacion || []
    );


    if (!ot?.evaluacion) return;


    ot.evaluacion.forEach((item, i) => {

      if (!item.fotos) {
        item.fotos = [];
      }

      if (!item.comentarios) {
        item.comentarios = [];
      }


      const completado =
        itemCompleto(item);

      const cantidadFotos =
        item.fotos.length;

      const cantidadComentarios =
        item.comentarios.length;


      const div =
        document.createElement("div");


      div.className =
        `checklist-card ${
          completado ? "completed" : ""
        }`;


      div.innerHTML = `

        <div class="checklist-card-header">

          <div class="checklist-card-title">

            <input
              type="checkbox"
              class="checklist-card-check"
              ${item.ok ? "checked" : ""}
              onchange="toggleEvaluacion(${i})"
            >

            <h4>${escaparHTML(item.item)}</h4>

          </div>


          <span
            class="checklist-status ${
              completado ? "done" : "pending"
            }"
          >
            ${completado ? "Completado" : "Pendiente"}
          </span>

        </div>


        <div class="checklist-card-footer">

          <span class="checklist-mini-badge">
            📷 ${cantidadFotos} evidencia(s)
          </span>

          <span class="checklist-mini-badge">
            💬 ${cantidadComentarios} comentario(s)
          </span>

        </div>


        <div class="checklist-upload-box">

          <label class="btn-upload-pro">

            📷 Agregar evidencias

            <input
              type="file"
              accept="image/*"
              multiple
              onchange="subirFotoEvaluacion(event, ${i})"
            >

          </label>

        </div>


        <div
          id="fotos-evaluacion-${i}"
          class="checklist-fotos-pro"
        ></div>


        <div class="checklist-comment-box">

          <input
            id="tecnico-eval-${i}"
            placeholder="Técnico"
          >

          <input
            id="comentario-eval-${i}"
            placeholder="Trabajo realizado"
          >

          <button
            onclick="agregarComentarioEvaluacion(${i})"
          >
            Agregar Comentario
          </button>

        </div>


        <div
          id="comentarios-evaluacion-${i}"
        ></div>

      `;


      cont.appendChild(div);

      mostrarFotosEvaluacion(i);
      renderComentariosEvaluacion(i);

    });

  };


  // ==========================================
  // TOGGLE CHECKLIST EVALUACIÓN
  // ==========================================
  window.toggleEvaluacion = function toggleEvaluacion(i) {

    const ot = getOT();

    if (!ot) return;

    if (OTBloqueada()) return;


    ot.evaluacion[i].ok =
      !ot.evaluacion[i].ok;


    actualizarEstadoGanttDesdeChecklist();

    recalcularGanttAutomatico();


    autoguardarCambiosOT();


    window.renderEvaluacion();


    if (ot.gantt?.actividades?.length) {

      renderCartaGantt();

    }

  };


  // ==========================================
  // MOSTRAR FOTOS EVALUACIÓN
  // ==========================================
  function mostrarFotosEvaluacion(i) {

    const ot = getOT();

    if (!ot) return;

    const div =
      document.getElementById(
        `fotos-evaluacion-${i}`
      );

    if (!div) return;


    div.innerHTML = "";


    const fotos =
      ot.evaluacion?.[i]?.fotos || [];


    fotos.forEach((foto, index) => {

      const cont =
        document.createElement("div");

      cont.className = "foto-box";


      const img =
        document.createElement("img");

      img.loading = "lazy";
      img.decoding = "async";
      img.alt = `Evidencia ${index + 1} de evaluación`;
      img.src = foto;
      img.style.cursor = "pointer";
      img.width = 100;

      img.onclick = () =>
        verImagenModal(foto);


      const btn =
        document.createElement("button");

      btn.innerHTML = "&times;";
      btn.className = "btn-delete-img";

      btn.onclick = () =>
        eliminarFotoEvaluacion(i, index);


      cont.appendChild(img);
      cont.appendChild(btn);

      div.appendChild(cont);

    });

  }


  // ==========================================
  // ELIMINAR FOTO EVALUACIÓN
  // ==========================================
  async function eliminarFotoEvaluacion(i, index) {

    if (OTBloqueada()) return;

    if (!(await confirmarEliminacion())) return;


    const ot = getOT();

    if (!ot) return;


    const foto =
      ot.evaluacion?.[i]?.fotos?.[index];

    if (!foto) return;


    try {
      ot.evaluacion[i].fotos.splice(
        index,
        1
      );

      const guardado = await guardarCambiosOT();
      if (!guardado) {
        ot.evaluacion[i].fotos.splice(index, 0, foto);
        return;
      }

      await eliminarArchivoStorage(foto);


      window.renderEvaluacion();


    } catch (error) {

      console.error(
        "Error eliminando foto de Evaluación:",
        error
      );

      alert(
        "No fue posible eliminar la fotografía."
      );

    }

  }


  // ==========================================
  // SUBIR FOTO EVALUACIÓN
  // ==========================================
  async function subirFotoEvaluacion(e, i) {

    if (OTBloqueada()) return;


    const ot = getOT();

    if (!ot) return;


    const files =
      Array.from(e.target.files);


    if (!files.length) return;

    const fotosOriginales = [...(ot.evaluacion?.[i]?.fotos || [])];
    const urlsSubidasEnEsteIntento = [];


    try {

      if (!ot.evaluacion?.[i]) {
        return;
      }


      if (!ot.evaluacion[i].fotos) {
        ot.evaluacion[i].fotos = [];
      }


      for (const file of files) {

        const imagenBlob =
          await comprimirImagenBlob(file);


        const imagenComprimida =
          new File(
            [imagenBlob],
            `evaluacion_${Date.now()}.jpg`,
            {
              type: "image/jpeg"
            }
          );


        const urlFoto =
          await subirArchivoStorage(
            imagenComprimida,
            "evaluacion",
            i
          );

        if (!urlFoto) throw new Error("La fotografía no obtuvo una URL válida");

        urlsSubidasEnEsteIntento.push(urlFoto);

        ot.evaluacion[i].fotos.push(
          urlFoto
        );

      }


      const guardado = await guardarCambiosOT();
      if (!guardado) {
        throw new Error("No fue posible confirmar las fotografías en la OT.");
      }


      const borradores = capturarBorradoresFormulario("listaEvaluacion");
      window.renderEvaluacion();
      restaurarBorradoresFormulario("listaEvaluacion", borradores);


      e.target.value = "";


    } catch (error) {

      await Promise.allSettled(
        urlsSubidasEnEsteIntento.map(url => eliminarArchivoStorage(url))
      );
      if (ot.evaluacion?.[i]) ot.evaluacion[i].fotos = fotosOriginales;
      e.target.value = "";

      console.error(
        "Error subiendo fotos evaluación:",
        error
      );

      alert(
        `No se completó la carga de ${files.length} fotografía(s). No se agregó ninguna evidencia del lote.`
      );

    }

  }


  // ==========================================
  // FUNCIONES EXPUESTAS AL HTML
  // ==========================================

  window.mostrarFotosEvaluacion =
    mostrarFotosEvaluacion;

  window.eliminarFotoEvaluacion =
    eliminarFotoEvaluacion;

  window.subirFotoEvaluacion =
    subirFotoEvaluacion;

  window.validarEvaluacionCompleta =
    validarEvaluacionCompleta;

  window.guardarEvaluacion = 
    guardarEvaluacion;

  window.subirDocumentoDecisionEvaluacion =
    subirDocumentoDecisionEvaluacion;

  window.aprobarOverhaulDesdeEvaluacion =
    aprobarOverhaulDesdeEvaluacion;

  window.rechazarOverhaulDesdeEvaluacion =
    rechazarOverhaulDesdeEvaluacion;

  window.continuarEvaluacionSinAprobacion =
    continuarEvaluacionSinAprobacion;

  window.renderDocsDecisionEvaluacionPreview =
    renderDocsDecisionEvaluacionPreview;

  window.abrirDocumentoDecisionEvaluacion =
    abrirDocumentoDecisionEvaluacion;

  window.abrirArchivoTemporal =
    abrirArchivoTemporal;

  window.renderComentarioDecisionEvaluacion =
    renderComentarioDecisionEvaluacion;


  console.log(
    "📦 Módulo Evaluación inicializado correctamente"
  );

// ==========================================
// VALIDAR EVALUACIÓN COMPLETA
// ==========================================
function validarEvaluacionCompleta() {

    const ot = getOT();

    if (!ot?.evaluacion?.length) {
        alert("Debes cargar checklist");
        return false;
    }

    const checklistCompleto =
        ot.evaluacion.every(item => item.ok === true);

    const fotosCompletas =
        ot.evaluacion.every(
            item => item.fotos && item.fotos.length > 0
        );

    const comentariosCompletos =
        ot.evaluacion.every(
            item =>
                item.comentarios &&
                item.comentarios.length > 0
        );

    if (!checklistCompleto) {
        alert("Checklist incompleto");
        return false;
    }

    if (!fotosCompletas) {
        alert(
            "Debes subir evidencia fotográfica en todos los ítems"
        );
        return false;
    }

    if (!comentariosCompletos) {
        alert(
            "Todos los ítems deben tener comentarios"
        );
        return false;
    }

    return true;
}



// ==========================================
// GUARDAR EVALUACIÓN
// ==========================================
async function guardarEvaluacion() {

    const ot = getOT();

    if (!ot) {
        alert("No hay OT cargada");
        return;
    }

    const guardado = await guardarCambiosOT();

    if (!guardado) return;

    alert(
        "Evaluación guardada correctamente ✅"
    );
}




// ==========================================
// SUBIR DOCUMENTO DECISIÓN EVALUACIÓN
// ==========================================
async function subirDocumentoDecisionEvaluacion(
    file,
    resultado
) {

    const urlArchivo =
        await subirArchivoStorage(
            file,
            `decision_evaluacion_${resultado.toLowerCase()}`,
            "documentos"
        );

    return {
        nombre: file.name,
        tipo: file.type,
        url: urlArchivo,
        fecha: new Date().toLocaleString()
    };
}



// ==========================================
// APROBAR MANTENCIÓN DESDE EVALUACIÓN
// ==========================================
async function aprobarOverhaulDesdeEvaluacion() {

    if (OTBloqueada()) return;

    if (!aprobacionesHabilitadas()) {
        alert("El módulo Aprobaciones está deshabilitado para esta empresa");
        return;
    }

    if (!esJefeTaller()) {
        alert(
            "Solo Jefe de Taller puede aprobar Mantención desde Evaluación"
        );
        return;
    }

    if (!validarEvaluacionCompleta()) return;

    const ot = getOT();
    const usuario = getUsuario();

    if (!ot) return;

    const comentario =
        document
            .getElementById("comentarioDecisionEvaluacion")
            ?.value
            .trim();

    const inputDocs =
        document.getElementById("docsDecisionEvaluacion");

    const files =
        inputDocs?.files || [];

    if (!comentario) {
        alert("Debes ingresar comentario de aprobación");
        return;
    }

    if (!files.length) {
        alert(
            "Debes cargar al menos un documento de evidencia"
        );
        return;
    }

    if (decisionEvaluacionEnCurso) return;
    decisionEvaluacionEnCurso = true;
    const botonesDecision = Array.from(document.querySelectorAll(
        '[onclick*="aprobarOverhaulDesdeEvaluacion"], [onclick*="rechazarOverhaulDesdeEvaluacion"]'
    ));
    botonesDecision.forEach(boton => { boton.disabled = true; });
    const estadoAnterior = {
        decisionEvaluacion: ot.decisionEvaluacion,
        evaluacionAprobada: ot.evaluacionAprobada,
        overhaulRequerido: ot.overhaulRequerido,
        estado: ot.estado
    };
    const urlsSubidasEnEsteIntento = [];

    try {

        const documentos = [];

        for (const file of files) {

            const docSubido =
                await subirDocumentoDecisionEvaluacion(
                    file,
                    "APROBADO"
                );

            documentos.push(docSubido);
            if (!docSubido?.url) throw new Error("El documento no obtuvo una URL válida.");
            urlsSubidasEnEsteIntento.push(docSubido.url);
        }

        ot.decisionEvaluacion = {
            resultado: "APROBADO",
            comentario,
            documentos,
            usuario:
                usuario?.nombre || "Jefe Taller",
            rol:
                usuario?.rol || "jefe_taller",
            fecha:
                new Date().toLocaleString()
        };

        ot.evaluacionAprobada = true;
        ot.overhaulRequerido = true;

        ot.estado =
            obtenerEstadoOT(ot);

        const guardado = await guardarCambiosOT();
        if (!guardado) throw new Error("No fue posible confirmar la aprobación en la OT.");

        renderComentarioDecisionEvaluacion();

        navegarSiguienteEtapa("evaluacion");

        alert(
            "Mantención aprobada. Se habilita etapa MANTENCIÓN ✅"
        );

    } catch (error) {

        await Promise.allSettled(
            urlsSubidasEnEsteIntento.map(url => eliminarArchivoStorage(url))
        );
        Object.assign(ot, estadoAnterior);

        console.error(
            "Error aprobando Mantención:",
            error
        );

        alert(
            "Error al guardar decisión de evaluación"
        );
    } finally {
        decisionEvaluacionEnCurso = false;
        botonesDecision.forEach(boton => { boton.disabled = false; });
    }
}



// ==========================================
// RECHAZAR MANTENCIÓN DESDE EVALUACIÓN
// ==========================================
async function rechazarOverhaulDesdeEvaluacion() {

    if (OTBloqueada()) return;

    if (!aprobacionesHabilitadas()) {
        alert("El módulo Aprobaciones está deshabilitado para esta empresa");
        return;
    }

    if (!esJefeTaller()) {
        alert(
            "Solo Jefe de Taller puede rechazar Mantención desde Evaluación"
        );
        return;
    }

    if (!validarEvaluacionCompleta()) return;

    const ot = getOT();
    const usuario = getUsuario();

    if (!ot) return;

    const comentario =
        document
            .getElementById("comentarioDecisionEvaluacion")
            ?.value
            .trim();

    const inputDocs =
        document.getElementById(
            "docsDecisionEvaluacion"
        );

    const files =
        inputDocs?.files || [];

    if (!comentario) {
        alert(
            "Debes ingresar comentario de rechazo"
        );
        return;
    }

    if (!files.length) {
        alert(
            "Debes cargar al menos un documento de evidencia"
        );
        return;
    }

    if (decisionEvaluacionEnCurso) return;
    decisionEvaluacionEnCurso = true;
    const botonesDecision = Array.from(document.querySelectorAll(
        '[onclick*="aprobarOverhaulDesdeEvaluacion"], [onclick*="rechazarOverhaulDesdeEvaluacion"]'
    ));
    botonesDecision.forEach(boton => { boton.disabled = true; });
    const estadoAnterior = {
        decisionEvaluacion: ot.decisionEvaluacion,
        evaluacionAprobada: ot.evaluacionAprobada,
        overhaulRequerido: ot.overhaulRequerido,
        overhaulAprobado: ot.overhaulAprobado,
        pruebasAprobado: ot.pruebasAprobado,
        despacho: ot.despacho,
        estado: ot.estado
    };
    const urlsSubidasEnEsteIntento = [];

    try {

        const documentos = [];

        for (const file of files) {

            const docSubido =
                await subirDocumentoDecisionEvaluacion(
                    file,
                    "RECHAZADO"
                );

            documentos.push(docSubido);
            if (!docSubido?.url) throw new Error("El documento no obtuvo una URL válida.");
            urlsSubidasEnEsteIntento.push(docSubido.url);
        }

        ot.decisionEvaluacion = {
            resultado: "RECHAZADO",
            comentario,
            documentos,
            usuario:
                usuario?.nombre || "Jefe Taller",
            rol:
                usuario?.rol || "jefe_taller",
            fecha:
                new Date().toLocaleString()
        };

        ot.evaluacionAprobada = true;
        ot.overhaulRequerido = false;

        // Se saltan Mantención y Pruebas
        ot.overhaulAprobado = true;
        ot.pruebasAprobado = true;

        // Preparar Despacho si todavía no existe
        if (!ot.despacho) {
            ot.despacho = {
                preparacion: [],
                final: []
            };
        }

        ot.estado =
            obtenerEstadoOT(ot);

        const guardado = await guardarCambiosOT();
        if (!guardado) throw new Error("No fue posible confirmar el rechazo en la OT.");

        renderComentarioDecisionEvaluacion();

        const siguiente = navegarSiguienteEtapa("pruebas");

        alert(
            siguiente === "despacho"
                ? "Mantención rechazada. La OT pasa a Despacho ✅"
                : "Mantención rechazada. La OT quedó lista para cierre ✅"
        );

    } catch (error) {

        await Promise.allSettled(
            urlsSubidasEnEsteIntento.map(url => eliminarArchivoStorage(url))
        );
        Object.assign(ot, estadoAnterior);

        console.error(
            "Error rechazando Mantención:",
            error
        );

        alert(
            "Error al guardar decisión de evaluación"
        );
    } finally {
        decisionEvaluacionEnCurso = false;
        botonesDecision.forEach(boton => { boton.disabled = false; });
    }
}




// ==========================================
// PREVIEW DOCUMENTOS DECISIÓN EVALUACIÓN
// ==========================================
function renderDocsDecisionEvaluacionPreview() {

    const ot = getOT();

    if (!ot) return;

    const cont =
        document.getElementById(
            "listaDocsDecisionEvaluacion"
        );

    const input =
        document.getElementById(
            "docsDecisionEvaluacion"
        );

    if (!cont) return;

    cont.innerHTML = "";

    // Documentos ya guardados
    const docsGuardados =
        ot.decisionEvaluacion?.documentos || [];

    docsGuardados.forEach((doc, index) => {

        const div =
            document.createElement("div");

        div.className = "doc-item";

        div.innerHTML = `
            <div class="doc-left">
                <span class="doc-icon">📄</span>
                <span class="doc-name">
                    ${doc.nombre}
                </span>
            </div>

            <div class="doc-actions">
                <button
                    type="button"
                    class="permitido-bloqueo"
                    onclick="abrirDocumentoDecisionEvaluacion(${index})"
                >
                    👁
                </button>
            </div>
        `;

        cont.appendChild(div);
    });

    // Archivos seleccionados todavía no guardados
    if (!input || !input.files.length) return;

    Array.from(input.files).forEach((file) => {

        const div =
            document.createElement("div");

        div.className = "doc-item";

        const urlTemp =
            URL.createObjectURL(file);

        div.innerHTML = `
            <div class="doc-left">
                <span class="doc-icon">📄</span>
                <span class="doc-name">
                    ${file.name}
                </span>
            </div>

            <div class="doc-actions">
                <button
                    type="button"
                    class="permitido-bloqueo"
                    onclick="abrirArchivoTemporal('${urlTemp}')"
                >
                    👁
                </button>
            </div>
        `;

        cont.appendChild(div);
    });
}


// ==========================================
// ABRIR DOCUMENTO DECISIÓN EVALUACIÓN
// ==========================================
function abrirDocumentoDecisionEvaluacion(index) {

    const ot = getOT();

    if (!ot) return;

    const documento =
        ot.decisionEvaluacion?.documentos?.[index];

    if (!documento) return;

    abrirDocumento({
        nombre: documento.nombre,
        tipo: documento.tipo,
        url: documento.url
    });
}



// ==========================================
// ABRIR ARCHIVO TEMPORAL
// ==========================================
function abrirArchivoTemporal(url) {

    const modal =
        document.getElementById("modalDoc");

    const visor =
        document.getElementById("visorDoc");

    if (!modal || !visor) return;

    visor.src = url;
    modal.style.display = "block";
}



// ==========================================
// RENDER DECISIÓN EVALUACIÓN
// ==========================================
function renderComentarioDecisionEvaluacion() {

    const ot = getOT();

    const cont =
        document.getElementById(
            "comentarioDecisionEvaluacionGuardado"
        );

    if (!cont) return;

    const decision =
        ot?.decisionEvaluacion;

    if (!decision) {

        cont.innerHTML = "";

        return;
    }

    const documentos =
        decision.documentos || [];

    cont.innerHTML = `
        <div class="decision-evaluacion-guardada">

            <div>
                <strong>Resultado:</strong>
                ${decision.resultado || "-"}
            </div>

            <div>
                <strong>Usuario:</strong>
                ${decision.usuario || "-"}
            </div>

            <div>
                <strong>Fecha:</strong>
                ${decision.fecha || "-"}
            </div>

            <div>
                <strong>Comentario:</strong>
                ${decision.comentario || "-"}
            </div>

            ${
                documentos.length
                    ? `
                        <div>
                            <strong>Documentos:</strong>
                            ${documentos.length}
                        </div>
                    `
                    : ""
            }

        </div>
    `;

    renderDocsDecisionEvaluacionPreview();
}


// ==========================================
// VALIDACIÓN DE DEPENDENCIAS
// ==========================================
function validarDependencias(dependencias) {

  Object.entries(dependencias).forEach(
    ([nombre, valor]) => {

      if (typeof valor !== "function") {

        throw new Error(
          `Evaluación: falta la dependencia ${nombre}.`
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


// ==========================================
// CONTINUAR SIN APROBACIÓN DEL JEFE
// ==========================================
async function continuarEvaluacionSinAprobacion() {

    if (decisionEvaluacionEnCurso) return;

    if (OTBloqueada()) return;

    if (aprobacionesHabilitadas()) {
        alert("Esta empresa requiere aprobación del Jefe de Taller");
        return;
    }

    if (!validarEvaluacionCompleta()) return;

    const ot = getOT();
    const usuario = getUsuario();

    if (!ot) return;

    decisionEvaluacionEnCurso = true;
    const botones = Array.from(document.querySelectorAll(
        '[onclick*="continuarEvaluacionSinAprobacion"]'
    ));
    botones.forEach(boton => { boton.disabled = true; });
    const estadoAnterior = {
        decisionEvaluacion: ot.decisionEvaluacion,
        evaluacionAprobada: ot.evaluacionAprobada,
        overhaulRequerido: ot.overhaulRequerido,
        estado: ot.estado,
        bitacora: Array.isArray(ot.bitacora) ? [...ot.bitacora] : null
    };

    try {
        ot.decisionEvaluacion = {
            resultado: "NO REQUERIDA",
            comentario: "La empresa tiene deshabilitado el módulo Aprobaciones.",
            documentos: [],
            usuario: usuario?.nombre || "Usuario",
            rol: usuario?.rol || "usuario_taller",
            fecha: new Date().toLocaleString()
        };

        ot.evaluacionAprobada = true;
        ot.overhaulRequerido = true;
        ot.estado = obtenerEstadoOT(ot);

        agregarBitacora(
            "Evaluación completada sin aprobación",
            "El módulo Aprobaciones está deshabilitado. La OT continúa a Mantención."
        );

        const guardado = await guardarCambiosOT();
        if (!guardado) throw new Error("No fue posible guardar el checklist en la OT.");

        renderComentarioDecisionEvaluacion();
        navegarSiguienteEtapa("evaluacion");

        alert("Evaluación completada. Se habilita Mantención ✅");

      } catch (error) {
        ot.decisionEvaluacion = estadoAnterior.decisionEvaluacion;
        ot.evaluacionAprobada = estadoAnterior.evaluacionAprobada;
        ot.overhaulRequerido = estadoAnterior.overhaulRequerido;
        ot.estado = estadoAnterior.estado;
        if (estadoAnterior.bitacora) ot.bitacora = estadoAnterior.bitacora;
        else delete ot.bitacora;
        console.error("Error continuando Evaluación sin aprobación:", error);
        alert("No fue posible continuar a Mantención");
    } finally {
        decisionEvaluacionEnCurso = false;
        botones.forEach(boton => { boton.disabled = false; });
    }
}

}
