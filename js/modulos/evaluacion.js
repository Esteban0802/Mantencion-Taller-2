// ==========================================
// MÓDULO EVALUACIÓN — OVERTRACK
// ==========================================

export function inicializarModuloEvaluacion(servicios) {
  const {
    getOT,
    guardarCambiosOT,
    renderProgresoEtapa,
    itemCompleto,
    mostrarFotosEvaluacion,
    renderComentariosEvaluacion
  } = servicios;

  validarDependencias({
    getOT,
    guardarCambiosOT,
    renderProgresoEtapa,
    itemCompleto,
    mostrarFotosEvaluacion,
    renderComentariosEvaluacion
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
            { header: 1 }
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

  console.log(
    "📦 Módulo Evaluación inicializado correctamente"
  );
}

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

function escaparHTML(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}