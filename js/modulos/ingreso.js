// ==========================================
// MÓDULO INGRESO — OVERTRACK
// ==========================================

import {
  capturarBorradoresFormulario,
  restaurarBorradoresFormulario
} from "./core/utilidades.js";

export function inicializarModuloIngreso(servicios) {
  let aprobacionIngresoEnCurso = false;
  const {

    getOT,

    guardarCambiosOT,
    autoguardarCambiosOT,

    renderProgresoEtapa,
    itemCompleto,

    renderComentariosItem,

    OTBloqueada,

    agregarBitacora,

    actualizarEstadoGanttDesdeChecklist,
    recalcularGanttAutomatico,
    renderCartaGantt,

    verImagenModal,

    obtenerEstadoOT,
    habilitarTab,
    navegarSiguienteEtapa,

    eliminarArchivoStorage,
    subirArchivoStorage,
    comprimirImagenBlob,
    mostrarAlerta

} = servicios;

  const alert = (mensaje) => {
    const texto = String(mensaje || "");
    const tipo = /correctamente|completad[ao]|guardad[ao]/i.test(texto)
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

    renderComentariosItem,

    OTBloqueada,

    agregarBitacora,

    actualizarEstadoGanttDesdeChecklist,
    recalcularGanttAutomatico,
    renderCartaGantt,

    verImagenModal,

    obtenerEstadoOT,
    habilitarTab,
    navegarSiguienteEtapa,

    eliminarArchivoStorage,
    subirArchivoStorage,
    comprimirImagenBlob,
    mostrarAlerta

});

  // ==========================================
  // CARGAR CHECKLIST DESDE EXCEL
  // ==========================================
  function cargarIngreso() {
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

    if (!/\.xlsx?$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      alert("Selecciona un archivo Excel válido de máximo 5 MB.");
      inputExcel.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = async function (event) {
      const checklistAnterior = ot.ingreso;
      let checklistReemplazado = false;
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

        ot.ingreso = checklist;
        checklistReemplazado = true;

        const guardado = await guardarCambiosOT();
        if (!guardado) throw new Error("No fue posible guardar el checklist en la OT.");

        window.renderIngreso();

        inputExcel.value = "";

        console.log(
          "✅ Checklist de Ingreso cargado desde ingreso.js"
        );
      } catch (error) {
        if (checklistReemplazado) ot.ingreso = checklistAnterior;
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
  }

  // ==========================================
  // RENDER PRINCIPAL DE INGRESO
  // ==========================================
  function renderIngreso() {
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
  }

function toggleIngreso(i) {

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

}


function mostrarFotosIngreso(i) {

    const ot = getOT();

    if (!ot) return;

    const div = document.getElementById(`fotos-ingreso-${i}`);

    if (!div) return;

    div.innerHTML = "";

    ot.ingreso[i].fotos.forEach((foto, index) => {

        const cont = document.createElement("div");
        cont.className = "foto-box";

        const img = document.createElement("img");
        img.loading = "lazy";
        img.decoding = "async";
        img.alt = `Evidencia ${index + 1} del ingreso`;
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

}

async function eliminarFotoIngreso(i, index) {

    if (OTBloqueada()) return;

    if (!(await confirmarEliminacion())) return;

    const ot = getOT();

    if (!ot) return;

    const urlFoto = ot.ingreso[i].fotos[index];

    ot.ingreso[i].fotos.splice(index, 1);

    const guardado = await guardarCambiosOT();
    if (!guardado) {
        ot.ingreso[i].fotos.splice(index, 0, urlFoto);
        return;
    }

    await eliminarArchivoStorage(urlFoto);

    window.renderIngreso();

}

async function subirFotoIngreso(e, i) {

    if (OTBloqueada()) return;

    const ot = getOT();

    if (!ot) return;

    const files = Array.from(e.target.files);

    if (!files.length) return;

    const fotosOriginales = [...(ot.ingreso?.[i]?.fotos || [])];
    const bitacoraOriginal = Array.isArray(ot.bitacora) ? [...ot.bitacora] : null;
    const urlsSubidasEnEsteIntento = [];

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

            if (!urlFoto) throw new Error("La fotografía no obtuvo una URL válida");

            urlsSubidasEnEsteIntento.push(urlFoto);
            ot.ingreso[i].fotos.push(urlFoto);
        }

        agregarBitacora(
            "Evidencia agregada",
            `Ingreso: ${files.length} foto(s)`
        );

        const guardado = await guardarCambiosOT();
        if (!guardado) {
            throw new Error("No fue posible confirmar las fotografías en la OT.");
        }

        const borradores = capturarBorradoresFormulario("listaIngreso");
        window.renderIngreso();
        restaurarBorradoresFormulario("listaIngreso", borradores);

        e.target.value = "";

    } catch (error) {

        await Promise.allSettled(
            urlsSubidasEnEsteIntento.map(url => eliminarArchivoStorage(url))
        );
        if (ot.ingreso?.[i]) ot.ingreso[i].fotos = fotosOriginales;
        if (bitacoraOriginal) {
            ot.bitacora = bitacoraOriginal;
        } else {
            delete ot.bitacora;
        }
        e.target.value = "";

        console.error(
            "Error subiendo fotos ingreso:",
            error
        );

        mostrarAlerta(
            `No se completó la carga de ${files.length} fotografía(s). No se agregó ninguna evidencia del lote.`,
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

    const guardado = await guardarCambiosOT();

    if (!guardado) return;

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

    if (aprobacionIngresoEnCurso) return;

    const ot = getOT();

    if (!ot) return;

    if (!validarIngresoCompleto()) return;

    aprobacionIngresoEnCurso = true;
    const botones = Array.from(document.querySelectorAll('[onclick*="aprobarIngreso"]'));
    botones.forEach(boton => { boton.disabled = true; });
    const ingresoAprobadoAnterior = ot.ingresoAprobado;
    const estadoAnterior = ot.estado;

    try {

    ot.ingresoAprobado = true;

    ot.estado = obtenerEstadoOT(ot);

    const guardado = await guardarCambiosOT();
    if (!guardado) {
        ot.ingresoAprobado = ingresoAprobadoAnterior;
        ot.estado = estadoAnterior;
        return;
    }

    navegarSiguienteEtapa("ingreso");

    mostrarAlerta(
        "Ingreso completado correctamente",
        "success"
    );

    } finally {
        aprobacionIngresoEnCurso = false;
        botones.forEach(boton => { boton.disabled = false; });
    }

}




window.cargarIngreso = cargarIngreso;
window.renderIngreso = renderIngreso;
window.toggleIngreso = toggleIngreso;
window.mostrarFotosIngreso = mostrarFotosIngreso;
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
