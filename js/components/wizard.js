export function abrirWizard({ titulo, pasos, onFinish }) {
  let pasoActual = 0;
  const datos = {};

  const modal = document.createElement("div");
  modal.className = "wizard-overlay";

  modal.innerHTML = `
    <div class="wizard-box">
      <div class="wizard-header">
        <div>
          <h2>${titulo}</h2>
          <p>Completa los pasos para continuar.</p>
        </div>
        <button class="wizard-close">×</button>
      </div>

      <div class="wizard-steps"></div>
      <div class="wizard-content"></div>

      <div class="wizard-actions">
        <button class="btn-danger wizard-back">Atrás</button>
        <button class="btn-primary wizard-next">Siguiente →</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const content = modal.querySelector(".wizard-content");
  const stepsBox = modal.querySelector(".wizard-steps");
  const btnBack = modal.querySelector(".wizard-back");
  const btnNext = modal.querySelector(".wizard-next");
  const btnClose = modal.querySelector(".wizard-close");

  function render() {
    const paso = pasos[pasoActual];

    stepsBox.innerHTML = pasos.map((p, i) => `
      <div class="wizard-step ${i === pasoActual ? "active" : ""} ${i < pasoActual ? "done" : ""}">
        <span>${i + 1}</span>
        <small>${p.titulo || `Paso ${i + 1}`}</small>
      </div>
    `).join("");

    content.innerHTML = paso.render(datos);

    btnBack.style.display = pasoActual === 0 ? "none" : "inline-block";
    btnNext.textContent = pasoActual === pasos.length - 1 ? "Finalizar" : "Siguiente →";
  }

  btnNext.onclick = async () => {
    const paso = pasos[pasoActual];

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

    if (onFinish) await onFinish(datos);

    modal.remove();
  };

  btnBack.onclick = () => {
    if (pasoActual > 0) {
      pasoActual--;
      render();
    }
  };

  btnClose.onclick = () => modal.remove();

  render();
}