// ==========================================
// MÓDULO OVERHAUL / MANTENCIÓN — OVERTRACK
// ==========================================

export function inicializarModuloOverhaul(servicios) {
  const {
    getOT,
    getUsuario,

    guardarCambiosOT,
    autoguardarCambiosOT,

    renderProgresoEtapa,
    itemCompleto,

    OTBloqueada,
    esJefeTaller,
    esUsuarioTaller,
    puedeEliminarComentario,

    actualizarEstadoGanttDesdeChecklist,
    recalcularGanttAutomatico,
    renderCartaGantt,

    comprimirImagenBlob,
    subirArchivoStorage,
    eliminarArchivoStorage,
    verImagenModal,

    actualizarAlertaJefe,
    obtenerEstadoOT,
    habilitarTab
  } = servicios;

  validarDependencias({
    getOT,
    getUsuario,
    guardarCambiosOT,
    autoguardarCambiosOT,
    renderProgresoEtapa,
    itemCompleto,
    OTBloqueada,
    esJefeTaller,
    esUsuarioTaller,
    puedeEliminarComentario,
    actualizarEstadoGanttDesdeChecklist,
    recalcularGanttAutomatico,
    renderCartaGantt,
    comprimirImagenBlob,
    subirArchivoStorage,
    eliminarArchivoStorage,
    verImagenModal,
    actualizarAlertaJefe,
    obtenerEstadoOT,
    habilitarTab
  });

  // ==========================================
  // CARGAR CHECKLIST DESDE EXCEL
  // ==========================================
  async function cargarOverhaul() {
    const ot = getOT();

    if (!ot) {
      alert("No hay una Orden de Servicio activa.");
      return;
    }

    const inputExcel =
      document.getElementById("excelOverhaul");

    if (!inputExcel) {
      console.error(
        "Overhaul: no existe el elemento #excelOverhaul."
      );
      return;
    }

    const file = inputExcel.files[0];

    if (!file) {
      alert("Debes subir el Excel de Overhaul");
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

        ot.overhaul = checklist;

        await guardarCambiosOT();

        renderOverhaul();

        inputExcel.value = "";

        console.log(
          "✅ Checklist de Mantención cargado desde overhaul.js"
        );
      } catch (error) {
        console.error(
          "Error procesando Excel de Mantención:",
          error
        );

        alert(
          "No fue posible procesar el checklist de Mantención."
        );
      }
    };

    reader.onerror = function (error) {
      console.error(
        "Error leyendo Excel de Mantención:",
        error
      );

      alert("No fue posible leer el archivo Excel.");
    };

    reader.readAsArrayBuffer(file);
  }

  // ==========================================
  // RENDER PRINCIPAL
  // ==========================================
  function renderOverhaul() {
    const ot = getOT();

    const cont =
      document.getElementById("listaOverhaul");

    if (!cont) return;

    cont.innerHTML = "";
    cont.className = "checklist-pro-grid";

    renderProgresoEtapa(
      "progresoOverhaul",
      ot?.overhaul || []
    );

    if (!ot?.overhaul) return;

    ot.overhaul.forEach((item, i) => {
      if (!item.comentarios) {
        item.comentarios = [];
      }

      if (!item.fotos) {
        item.fotos = [];
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
              onchange="toggleOverhaul(${i})"
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
              onchange="subirFotoOverhaul(event, ${i})"
            >

          </label>

        </div>

        <div
          id="fotos-overhaul-${i}"
          class="checklist-fotos-pro"
        ></div>

        <div class="checklist-comment-box">

          <input
            id="tec-overhaul-${i}"
            placeholder="Técnico"
          >

          <input
            id="com-overhaul-${i}"
            placeholder="Trabajo realizado"
          >

          <button
            onclick="agregarComentarioOverhaul(${i})"
          >
            Agregar Comentario
          </button>

        </div>

        <div
          id="comentarios-overhaul-${i}"
        ></div>
      `;

      cont.appendChild(div);

      mostrarFotosOverhaul(i);
      renderComentariosOverhaul(i);
    });
  }

  // ==========================================
  // CHECKLIST
  // ==========================================
  function toggleOverhaul(i) {
    const ot = getOT();

    if (OTBloqueada()) return;

    if (!ot?.overhaul?.[i]) return;

    ot.overhaul[i].ok =
      !ot.overhaul[i].ok;

    actualizarEstadoGanttDesdeChecklist();

        if (
        ot.gantt?.actividades?.length &&
        ot.gantt?.fechaInicio &&
        ot.gantt?.fechaTermino
        ) {
        recalcularGanttAutomatico();
        }

        autoguardarCambiosOT();

    renderOverhaul();

    if (
    ot.gantt?.actividades?.length &&
    ot.gantt?.fechaInicio &&
    ot.gantt?.fechaTermino
    ) {
    renderCartaGantt();
    }
  }

  // ==========================================
  // SUBIR FOTOGRAFÍAS
  // ==========================================
  async function subirFotoOverhaul(event, i) {
    const ot = getOT();

    if (OTBloqueada()) return;

    if (!ot?.overhaul?.[i]) return;

    const files =
      Array.from(event.target.files || []);

    if (!files.length) return;

    try {
      if (!ot.overhaul[i].fotos) {
        ot.overhaul[i].fotos = [];
      }

      for (const file of files) {
        const imagenBlob =
          await comprimirImagenBlob(file);

        const imagenComprimida =
          new File(
            [imagenBlob],
            `overhaul_${Date.now()}.jpg`,
            { type: "image/jpeg" }
          );

        const urlFoto =
          await subirArchivoStorage(
            imagenComprimida,
            "overhaul",
            i
          );

        ot.overhaul[i].fotos.push(urlFoto);
      }

      await guardarCambiosOT();

      renderOverhaul();

      event.target.value = "";
    } catch (error) {
      console.error(
        "Error subiendo fotos de Mantención:",
        error
      );

      alert(
        "Error al subir las imágenes de Mantención"
      );
    }
  }

  // ==========================================
  // MOSTRAR FOTOGRAFÍAS
  // ==========================================
  function mostrarFotosOverhaul(i) {
    const ot = getOT();

    const div =
      document.getElementById(
        `fotos-overhaul-${i}`
      );

    if (!div) return;

    div.innerHTML = "";

    const fotos =
      ot?.overhaul?.[i]?.fotos || [];

    fotos.forEach((foto, index) => {
      const container =
        document.createElement("div");

      container.className = "foto-box";

      const img =
        document.createElement("img");

      img.src = foto;
      img.width = 100;
      img.style.cursor = "pointer";
      img.onclick = () =>
        verImagenModal(foto);

      const btn =
        document.createElement("button");

      btn.innerHTML = "&times;";
      btn.className = "btn-delete-img";

      btn.onclick = () =>
        eliminarFotoOverhaul(i, index);

      container.appendChild(img);
      container.appendChild(btn);

      div.appendChild(container);
    });
  }

  // ==========================================
  // ELIMINAR FOTOGRAFÍA
  // ==========================================
  async function eliminarFotoOverhaul(
    i,
    index
  ) {
    const ot = getOT();

    if (OTBloqueada()) return;

    if (!ot?.overhaul?.[i]) return;

    if (!confirm("¿Eliminar foto?")) {
      return;
    }

    const urlFoto =
      ot.overhaul[i].fotos[index];

    try {
      await eliminarArchivoStorage(urlFoto);

      ot.overhaul[i].fotos.splice(
        index,
        1
      );

      await guardarCambiosOT();

      renderOverhaul();
    } catch (error) {
      console.error(
        "Error eliminando fotografía de Mantención:",
        error
      );

      alert(
        "No fue posible eliminar la fotografía."
      );
    }
  }

  // ==========================================
  // AGREGAR COMENTARIO
  // ==========================================
  async function agregarComentarioOverhaul(i) {
    const ot = getOT();
    const usuario = getUsuario();

    if (OTBloqueada()) return;

    if (!ot?.overhaul?.[i]) return;

    const inputNombre =
      document.getElementById(
        `tec-overhaul-${i}`
      );

    const inputTexto =
      document.getElementById(
        `com-overhaul-${i}`
      );

    const nombre =
      inputNombre?.value.trim() || "";

    const texto =
      inputTexto?.value.trim() || "";

    if (!nombre || !texto) {
      alert("Completa técnico y comentario");
      return;
    }

    if (!ot.overhaul[i].comentarios) {
      ot.overhaul[i].comentarios = [];
    }

    ot.overhaul[i].comentarios.push({
      nombre,
      texto,
      fecha: new Date().toLocaleString(),
      rol: usuario?.rol || "usuario_taller",
      creadoPorUid: usuario?.uid || "",
      creadoPorNombre:
        usuario?.nombre || nombre,
      atendido:
        esJefeTaller() ? false : true,
      respuestaUsuario: "",
      atendidoPor: "",
      fechaAtendido: ""
    });

    if (esJefeTaller()) {
      ot.alertaJefe = true;
    }

    await guardarCambiosOT();

    renderOverhaul();
  }

  // ==========================================
  // RENDER COMENTARIOS
  // ==========================================
  function renderComentariosOverhaul(i) {
    const ot = getOT();

    const cont =
      document.getElementById(
        `comentarios-overhaul-${i}`
      );

    if (!cont) return;

    cont.innerHTML = "";

    const comentarios =
      ot?.overhaul?.[i]?.comentarios || [];

    comentarios.forEach((comentario, index) => {
      const div =
        document.createElement("div");

      div.className =
        comentario.rol === "jefe_taller"
          ? "comentario-card comentario-jefe"
          : "comentario-card";

      div.innerHTML = `
        <strong>
          👨‍🔧 ${escaparHTML(comentario.nombre)}
        </strong>

        <p class="comentario-fecha">
          ${escaparHTML(comentario.fecha)}
        </p>

        <p>
          ${escaparHTML(comentario.texto)}
        </p>

        ${
          comentario.rol === "jefe_taller" &&
          comentario.atendido !== true &&
          esUsuarioTaller()
            ? `
              <button
                class="btn-success"
                onclick="responderComentarioJefe(
                  'overhaul',
                  ${i},
                  ${index}
                )"
              >
                ✅ Responder observación
              </button>
            `
            : ""
        }

        ${
          comentario.rol === "jefe_taller" &&
          comentario.atendido === true
            ? `
              <div class="respuesta-observacion">
                <strong>
                  ✅ Respondido por
                  ${escaparHTML(
                    comentario.atendidoPor ||
                    "Usuario Taller"
                  )}
                </strong>

                <p>
                  ${escaparHTML(
                    comentario.respuestaUsuario || ""
                  )}
                </p>

                <small>
                  ${escaparHTML(
                    comentario.fechaAtendido || ""
                  )}
                </small>
              </div>
            `
            : ""
        }

        ${
          puedeEliminarComentario(comentario)
            ? `
              <button
                class="btn-delete-comment"
                onclick="eliminarComentarioOverhaul(
                  ${i},
                  ${index}
                )"
              >
                🗑
              </button>
            `
            : ""
        }
      `;

      cont.appendChild(div);
    });
  }

  // ==========================================
  // ELIMINAR COMENTARIO
  // ==========================================
  async function eliminarComentarioOverhaul(
    i,
    index
  ) {
    const ot = getOT();

    if (OTBloqueada()) return;

    if (!ot?.overhaul?.[i]) return;

    if (!confirm("¿Eliminar registro?")) {
      return;
    }

    ot.overhaul[i].comentarios.splice(
      index,
      1
    );

    actualizarAlertaJefe();

    await guardarCambiosOT();

    renderOverhaul();
  }

  // ==========================================
  // GUARDAR
  // ==========================================
  async function guardarOverhaul() {
    const ot = getOT();

    if (!ot) {
      alert("No hay OT cargada");
      return;
    }

    await guardarCambiosOT();

    alert(
      "Progreso de Mantención guardado ✅"
    );
  }

  // ==========================================
  // APROBAR
  // ==========================================
  async function aprobarOverhaul() {
    const ot = getOT();

    if (!ot?.overhaul?.length) {
      alert(
        "Debes cargar el checklist primero"
      );
      return;
    }

    const checklistCompleto =
      ot.overhaul.every(
        (item) => item.ok === true
      );

    if (!checklistCompleto) {
      alert(
        "Debes completar todo el checklist"
      );
      return;
    }

    const conFotos =
      ot.overhaul.every(
        (item) =>
          Array.isArray(item.fotos) &&
          item.fotos.length > 0
      );

    if (!conFotos) {
      alert(
        "Debes subir evidencia en todos los ítems"
      );
      return;
    }

    const conComentarios =
      ot.overhaul.every(
        (item) =>
          Array.isArray(item.comentarios) &&
          item.comentarios.length > 0
      );

    if (!conComentarios) {
      alert(
        "Todos los ítems deben tener comentario del técnico"
      );
      return;
    }

    ot.overhaulAprobado = true;
    ot.estado = obtenerEstadoOT(ot);

    await guardarCambiosOT();

    habilitarTab("pruebas");

    alert(
      "Mantención aprobada, se habilita PRUEBAS"
    );
  }

  // ==========================================
  // EXPONER FUNCIONES AL HTML
  // ==========================================
  window.cargarOverhaul =
    cargarOverhaul;

  window.renderOverhaul =
    renderOverhaul;

  window.toggleOverhaul =
    toggleOverhaul;

  window.subirFotoOverhaul =
    subirFotoOverhaul;

  window.eliminarFotoOverhaul =
    eliminarFotoOverhaul;

  window.agregarComentarioOverhaul =
    agregarComentarioOverhaul;

  window.eliminarComentarioOverhaul =
    eliminarComentarioOverhaul;

  window.guardarOverhaul =
    guardarOverhaul;

  window.aprobarOverhaul =
    aprobarOverhaul;

  console.log(
    "📦 Módulo Mantención inicializado correctamente"
  );
}

function validarDependencias(dependencias) {
  Object.entries(dependencias).forEach(
    ([nombre, valor]) => {
      if (typeof valor !== "function") {
        throw new Error(
          `Mantención: falta la dependencia ${nombre}.`
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