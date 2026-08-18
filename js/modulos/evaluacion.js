// ==========================================
// MÓDULO EVALUACIÓN — OVERTRACK
// ==========================================

export function inicializarModuloEvaluacion(servicios) {

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

    getUsuario,
    esJefeTaller,
    obtenerEstadoOT,
    habilitarTab,
    cambiarTab,
    renderComentarioDecisionEvaluacion

  } = servicios;


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

    eliminarArchivoStorage,
    subirArchivoStorage,
    comprimirImagenBlob,

    getUsuario,
    esJefeTaller,
    obtenerEstadoOT,
    habilitarTab,
    cambiarTab,
    renderComentarioDecisionEvaluacion

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

    const reader = new FileReader();


    reader.onload = async function (event) {

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
          .map((valor) => ({

            item: String(valor).trim(),
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


        await guardarCambiosOT();


        window.renderEvaluacion();


        inputExcel.value = "";


        console.log(
          "✅ Checklist de Evaluación cargado desde evaluacion.js"
        );


      } catch (error) {

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

    if (!confirm("¿Eliminar foto?")) return;


    const ot = getOT();

    if (!ot) return;


    const foto =
      ot.evaluacion?.[i]?.fotos?.[index];

    if (!foto) return;


    try {

      await eliminarArchivoStorage(foto);


      ot.evaluacion[i].fotos.splice(
        index,
        1
      );


      await guardarCambiosOT();


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


        ot.evaluacion[i].fotos.push(
          urlFoto
        );

      }


      await guardarCambiosOT();


      window.renderEvaluacion();


      e.target.value = "";


    } catch (error) {

      console.error(
        "Error subiendo fotos evaluación:",
        error
      );

      alert(
        "Error al subir las imágenes de evaluación"
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

  window.renderDocsDecisionEvaluacionPreview =
    renderDocsDecisionEvaluacionPreview;


  console.log(
    "📦 Módulo Evaluación inicializado correctamente"
  );

}



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

    await guardarCambiosOT();

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

    try {

        const documentos = [];

        for (const file of files) {

            const docSubido =
                await subirDocumentoDecisionEvaluacion(
                    file,
                    "APROBADO"
                );

            documentos.push(docSubido);
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

        await guardarCambiosOT();

        renderComentarioDecisionEvaluacion();

        habilitarTab("despacho");
        cambiarTab("despacho");

        alert(
            "Mantención rechazada. La OS pasa a DESPACHO ✅"
        );

    } catch (error) {

        console.error(
            "Error aprobando Mantención:",
            error
        );

        alert(
            "Error al guardar decisión de evaluación"
        );
    }
}



// ==========================================
// RECHAZAR MANTENCIÓN DESDE EVALUACIÓN
// ==========================================
async function rechazarOverhaulDesdeEvaluacion() {

    if (OTBloqueada()) return;

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

    try {

        const documentos = [];

        for (const file of files) {

            const docSubido =
                await subirDocumentoDecisionEvaluacion(
                    file,
                    "RECHAZADO"
                );

            documentos.push(docSubido);
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

        ot.estado =
            obtenerEstadoOT(ot);

        await guardarCambiosOT();

        renderComentarioDecisionEvaluacion();

        habilitarTab("pruebas");
        cambiarTab("pruebas");

        alert(
            "Mantención rechazada. Se habilita etapa PRUEBAS ✅"
        );

    } catch (error) {

        console.error(
            "Error rechazando Mantención:",
            error
        );

        alert(
            "Error al guardar decisión de evaluación"
        );
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