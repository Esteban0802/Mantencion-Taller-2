export function abrirWizard({ titulo, pasos, onFinish }) {
  let pasoActual = 0;

  // Datos finales recopilados mediante collect()
  const datos = {};

  // Guarda temporalmente el contenido visual de inputs,
  // selects y textareas para recuperarlo al volver atrás.
  const valoresFormulario = {};

  const modal = document.createElement("div");
  modal.className = "wizard-overlay";

  modal.innerHTML = `
    <div class="wizard-box">

      <div class="wizard-header">
        <div>
          <h2>${titulo}</h2>
          <p>Completa los pasos para continuar.</p>
        </div>

        <button
          type="button"
          class="wizard-close"
          aria-label="Cerrar asistente"
        >
          ×
        </button>
      </div>

      <div class="wizard-steps"></div>

      <div class="wizard-content"></div>

      <div class="wizard-actions">
        <button
          type="button"
          class="btn-danger wizard-back"
        >
          Atrás
        </button>

        <button
          type="button"
          class="btn-primary wizard-next"
        >
          Siguiente →
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(modal);

  const content = modal.querySelector(".wizard-content");
  const stepsBox = modal.querySelector(".wizard-steps");
  const btnBack = modal.querySelector(".wizard-back");
  const btnNext = modal.querySelector(".wizard-next");
  const btnClose = modal.querySelector(".wizard-close");

  /*
  ==========================================
  GUARDAR VALORES VISIBLES DEL PASO ACTUAL
  ==========================================
  */
  function guardarValoresFormulario() {
    const campos = content.querySelectorAll(
      "input[id], select[id], textarea[id]"
    );

    campos.forEach(campo => {
      if (!campo.id) return;

      if (campo.type === "checkbox" || campo.type === "radio") {
        valoresFormulario[campo.id] = {
          tipo: campo.type,
          checked: campo.checked
        };

        return;
      }

      valoresFormulario[campo.id] = {
        tipo: campo.tagName.toLowerCase(),
        value: campo.value
      };
    });
  }

  /*
  ==========================================
  RESTAURAR VALORES AL VOLVER A UN PASO
  ==========================================
  */
  function restaurarValoresFormulario() {
    Object.entries(valoresFormulario).forEach(([id, configuracion]) => {
      const campo = content.querySelector(`#${CSS.escape(id)}`);

      if (!campo) return;

      if (
        configuracion.tipo === "checkbox" ||
        configuracion.tipo === "radio"
      ) {
        campo.checked = configuracion.checked;
        return;
      }

      campo.value = configuracion.value ?? "";
    });
  }

  /*
  ==========================================
  RENDERIZAR PASO
  ==========================================
  */
  function render() {
    const paso = pasos[pasoActual];

    stepsBox.innerHTML = pasos
      .map(
        (p, i) => `
          <div
            class="
              wizard-step
              ${i === pasoActual ? "active" : ""}
              ${i < pasoActual ? "done" : ""}
            "
          >
            <span>${i + 1}</span>

            <small>
              ${p.titulo || `Paso ${i + 1}`}
            </small>
          </div>
        `
      )
      .join("");

    content.innerHTML = paso.render(datos);

    // Después de crear nuevamente el HTML,
    // restauramos los valores que ya habían sido escritos.
    restaurarValoresFormulario();

    btnBack.style.display =
      pasoActual === 0 ? "none" : "inline-flex";

    btnNext.textContent =
      pasoActual === pasos.length - 1
        ? "Finalizar"
        : "Siguiente →";
  }

  /*
  ==========================================
  BOTÓN SIGUIENTE / FINALIZAR
  ==========================================
  */
  btnNext.onclick = async () => {
    const paso = pasos[pasoActual];

    // Primero conservamos lo escrito visualmente.
    guardarValoresFormulario();

    // Luego ejecutamos la validación y recopilación
    // definida en cada paso.
    if (paso.collect) {
      const resultado = paso.collect();

      if (resultado === false) return;

      Object.assign(datos, resultado);
    }

    if (pasoActual < pasos.length - 1) {
      pasoActual++;
      render();
      return;
    }

    try {
      btnNext.disabled = true;
      btnBack.disabled = true;
      btnNext.textContent = "Procesando...";

      if (onFinish) {
        await onFinish(datos);
      }

      modal.remove();

    } catch (error) {
      console.error("Error finalizando Wizard:", error);

      btnNext.disabled = false;
      btnBack.disabled = false;
      btnNext.textContent = "Finalizar";

      throw error;
    }
  };

  /*
  ==========================================
  BOTÓN ATRÁS
  ==========================================
  */
  btnBack.onclick = () => {
    if (pasoActual <= 0) return;

    // Guarda cualquier cambio realizado en el paso actual
    // incluso si el usuario vuelve sin presionar Siguiente.
    guardarValoresFormulario();

    pasoActual--;
    render();
  };

  /*
  ==========================================
  CERRAR WIZARD
  ==========================================
  */
  btnClose.onclick = () => {
    const confirmar = confirm(
      "¿Deseas cerrar el asistente? Los datos ingresados se perderán."
    );

    if (!confirmar) return;

    modal.remove();
  };

  /*
  ==========================================
  CERRAR HACIENDO CLIC FUERA DEL MODAL
  ==========================================
  */
  modal.addEventListener("click", event => {
    if (event.target !== modal) return;

    const confirmar = confirm(
      "¿Deseas cerrar el asistente? Los datos ingresados se perderán."
    );

    if (!confirmar) return;

    modal.remove();
  });

  /*
  ==========================================
  TECLA ESCAPE
  ==========================================
  */
  function cerrarConEscape(event) {
    if (event.key !== "Escape") return;

    const confirmar = confirm(
      "¿Deseas cerrar el asistente? Los datos ingresados se perderán."
    );

    if (!confirmar) return;

    document.removeEventListener("keydown", cerrarConEscape);
    modal.remove();
  }

  document.addEventListener("keydown", cerrarConEscape);

  render();
}