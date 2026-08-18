// ==========================================
// MÓDULO INGRESO — OVERTRACK
// ==========================================

export function inicializarModuloIngreso(servicios) {
  const {

    getOT,
    getUsuario,

    guardarCambiosOT,
    autoguardarCambiosOT,

    renderProgresoEtapa,
    itemCompleto,

    mostrarFotosIngreso,
    renderComentariosItem,

    OTBloqueada,

    agregarBitacora,

    actualizarEstadoGanttDesdeChecklist,
    recalcularGanttAutomatico,
    renderCartaGantt,

    verImagenModal,

    obtenerEstadoOT,
    habilitarTab,

    eliminarArchivoStorage,
    subirArchivoStorage,
    comprimirImagenBlob,
    mostrarAlerta

} = servicios;

  validarDependencias({

    getOT,
    getUsuario,

    guardarCambiosOT,
    autoguardarCambiosOT,

    renderProgresoEtapa,
    itemCompleto,

    mostrarFotosIngreso,
    renderComentariosItem,

    OTBloqueada,

    agregarBitacora,

    actualizarEstadoGanttDesdeChecklist,
    recalcularGanttAutomatico,
    renderCartaGantt,

    verImagenModal,

    obtenerEstadoOT,
    habilitarTab,

    eliminarArchivoStorage,
    subirArchivoStorage,
    comprimirImagenBlob,
    mostrarAlerta

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

window.toggleIngreso = function toggleIngreso(i) {

    const ot = getOT();

    if (!ot) return;

    if (OTBloqueada()) return;

    ot.ingreso[i].ok = !ot.ingreso[i].ok;

    actualizarEstadoGanttDesdeChecklist();
    recalcularGanttAutomatico();

    agregarBitacora(
        "Checklist actualizado",
        `Ingreso: ${ot.ingreso[i].item}`
    );

    autoguardarCambiosOT();

    window.renderIngreso();

    if (ot.gantt?.actividades?.length) {
        renderCartaGantt();
    }

};


window.mostrarFotosIngreso = function mostrarFotosIngreso(i) {

    const ot = getOT();

    if (!ot) return;

    const div = document.getElementById(`fotos-ingreso-${i}`);

    if (!div) return;

    div.innerHTML = "";

    ot.ingreso[i].fotos.forEach((foto, index) => {

        const cont = document.createElement("div");
        cont.className = "foto-box";

        const img = document.createElement("img");
        img.src = foto;
        img.style.cursor = "pointer";
        img.width = 100;

        img.onclick = () => verImagenModal(foto);

        const btn = document.createElement("button");
        btn.innerHTML = "&times;";
        btn.className = "btn-delete-img";

        btn.onclick = () => eliminarFotoIngreso(i, index);

        cont.appendChild(img);
        cont.appendChild(btn);

        div.appendChild(cont);

    });

};

async function eliminarFotoIngreso(i, index) {

    if (OTBloqueada()) return;

    if (!confirm("¿Eliminar foto?")) return;

    const ot = getOT();

    if (!ot) return;

    const urlFoto = ot.ingreso[i].fotos[index];

    await eliminarArchivoStorage(urlFoto);

    ot.ingreso[i].fotos.splice(index, 1);

    await guardarCambiosOT();

    window.renderIngreso();

}

async function subirFotoIngreso(e, i) {

    if (OTBloqueada()) return;

    const ot = getOT();

    if (!ot) return;

    const files = Array.from(e.target.files);

    if (!files.length) return;

    try {

        if (!ot.ingreso[i].fotos) {
            ot.ingreso[i].fotos = [];
        }

        for (const file of files) {

            const imagenBlob = await comprimirImagenBlob(file);

            const imagenComprimida = new File(
                [imagenBlob],
                `ingreso_${Date.now()}.jpg`,
                {
                    type: "image/jpeg"
                }
            );

            const urlFoto = await subirArchivoStorage(
                imagenComprimida,
                "ingreso",
                i
            );

            ot.ingreso[i].fotos.push(urlFoto);
        }

        agregarBitacora(
            "Evidencia agregada",
            `Ingreso: ${files.length} foto(s)`
        );

        await guardarCambiosOT();

        window.renderIngreso();

        e.target.value = "";

    } catch (error) {

        console.error(
            "Error subiendo fotos ingreso:",
            error
        );

        mostrarAlerta(
            "Error al subir las imágenes de ingreso",
            "error"
        );

    }

}

async function guardarIngreso() {

    const ot = getOT();

    if (!ot) {

        mostrarAlerta(
            "No hay OT cargada",
            "error"
        );

        return;
    }

    guardarCambiosOT();

    mostrarAlerta(
        "Progreso guardado correctamente",
        "success"
    );

}


function validarIngresoCompleto() {

    const ot = getOT();

    if (!ot?.ingreso?.length) {

        mostrarAlerta(
            "Carga el checklist de ingreso.",
            "warning"
        );

        return false;
    }

    const checklistCompleto = ot.ingreso.every(item => item.ok);

    const fotosCompletas = ot.ingreso.every(
        item => item.fotos && item.fotos.length > 0
    );

    const comentariosCompletos = ot.ingreso.every(
        item => item.comentarios && item.comentarios.length > 0
    );

    if (!checklistCompleto) {

        mostrarAlerta(
            "El checklist está incompleto.",
            "warning"
        );

        return false;
    }

    if (!fotosCompletas) {

        mostrarAlerta(
            "Todos los ítems deben tener evidencia fotográfica.",
            "warning"
        );

        return false;
    }

    if (!comentariosCompletos) {

        mostrarAlerta(
            "Todos los ítems deben tener comentarios.",
            "warning"
        );

        return false;
    }

    return true;

}



async function aprobarIngreso() {

    const ot = getOT();

    if (!ot) return;

    if (!validarIngresoCompleto()) return;

    ot.ingresoAprobado = true;

    ot.estado = obtenerEstadoOT(ot);

    await guardarCambiosOT();

    habilitarTab("evaluacion");

    mostrarAlerta(
        "Ingreso completado correctamente",
        "success"
    );

}




window.eliminarFotoIngreso = eliminarFotoIngreso;
window.subirFotoIngreso = subirFotoIngreso;
window.guardarIngreso = guardarIngreso;
window.validarIngresoCompleto = validarIngresoCompleto;
window.aprobarIngreso = aprobarIngreso;

console.log("📦 Módulo Ingreso inicializado correctamente");

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