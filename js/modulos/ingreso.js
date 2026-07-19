// ==========================================
// MÓDULO INGRESO — OVERTRACK
// ==========================================

export function inicializarModuloIngreso(servicios) {
  const {
    getOT,
    guardarCambiosOT,
    renderProgresoEtapa,
    itemCompleto,
    mostrarFotosIngreso,
    renderComentariosItem
  } = servicios;

  validarDependencias({
    getOT,
    guardarCambiosOT,
    renderProgresoEtapa,
    itemCompleto,
    mostrarFotosIngreso,
    renderComentariosItem
  });

  // ==========================================
  // CARGAR CHECKLIST DESDE EXCEL
  // ==========================================
  window.cargarIngreso = function cargarIngreso() {
    const ot = getOT();

    if (!ot) {
      alert("No hay una Orden de Servicio activa.");
      return;
    }

    const inputExcel =
      document.getElementById("excelIngreso");

    if (!inputExcel) {
      console.error(
        "Ingreso: no se encontró el elemento #excelIngreso."
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

        const primeraHoja = workbook.SheetNames[0];

        if (!primeraHoja) {
          alert("El Excel no contiene hojas.");
          return;
        }

        const sheet =
          workbook.Sheets[primeraHoja];

        const filas = XLSX.utils.sheet_to_json(
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

        ot.ingreso = checklist;

        await guardarCambiosOT();

        window.renderIngreso();

        inputExcel.value = "";

        console.log(
          "✅ Checklist de Ingreso cargado desde ingreso.js"
        );
      } catch (error) {
        console.error(
          "Error procesando Excel de Ingreso:",
          error
        );

        alert(
          "No fue posible procesar el checklist de Ingreso."
        );
      }
    };

    reader.onerror = function (error) {
      console.error(
        "Error leyendo Excel de Ingreso:",
        error
      );

      alert("No fue posible leer el archivo Excel.");
    };

    reader.readAsArrayBuffer(file);
  };

  // ==========================================
  // RENDER PRINCIPAL DE INGRESO
  // ==========================================
  window.renderIngreso = function renderIngreso() {
    const ot = getOT();

    const cont =
      document.getElementById("listaIngreso");

    if (!cont) return;

    cont.innerHTML = "";
    cont.className = "checklist-pro-grid";

    renderProgresoEtapa(
      "progresoIngreso",
      ot?.ingreso || []
    );

    if (!ot?.ingreso) return;

    ot.ingreso.forEach((item, i) => {
      if (!item.comentarios) {
        item.comentarios = [];
      }

      if (!item.fotos) {
        item.fotos = [];
      }

      const completado = itemCompleto(item);
      const cantidadFotos = item.fotos.length;
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
              onchange="toggleIngreso(${i})"
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
              onchange="subirFotoIngreso(event, ${i})"
            >
          </label>
        </div>

        <div
          id="fotos-ingreso-${i}"
          class="checklist-fotos-pro"
        ></div>

        <div class="checklist-comment-box">

          <input
            id="tecnico-${i}"
            placeholder="Técnico"
          >

          <input
            id="comentario-${i}"
            placeholder="Trabajo realizado"
          >

          <button onclick="agregarComentarioItem(${i})">
            Agregar Comentario
          </button>

        </div>

        <div id="comentarios-ingreso-${i}"></div>
      `;

      cont.appendChild(div);

      mostrarFotosIngreso(i);
      renderComentariosItem(i);
    });
  };

  console.log(
    "📦 Módulo Ingreso inicializado correctamente"
  );
}

function validarDependencias(dependencias) {
  Object.entries(dependencias).forEach(
    ([nombre, valor]) => {
      if (typeof valor !== "function") {
        throw new Error(
          `Ingreso: falta la dependencia ${nombre}.`
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