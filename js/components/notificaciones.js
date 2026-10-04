(function iniciarNotificacionesOverTrack() {
  "use strict";

  const TIPOS = new Set(["info", "exito", "advertencia", "error"]);
  let cola = Promise.resolve();

  function asegurarContenedor() {
    let raiz = document.getElementById("overtrackFeedbackRoot");
    if (raiz) return raiz;

    raiz = document.createElement("div");
    raiz.id = "overtrackFeedbackRoot";
    raiz.className = "ot-feedback-root";
    raiz.setAttribute("aria-live", "polite");
    document.body.appendChild(raiz);
    return raiz;
  }

  function icono(tipo) {
    return {
      exito: "✓",
      advertencia: "!",
      error: "×",
      info: "i"
    }[tipo] || "i";
  }

  function normalizarTipo(tipo) {
    return TIPOS.has(tipo) ? tipo : "info";
  }

  function mostrarMensaje({
    titulo = "Información",
    mensaje = "",
    tipo = "info",
    textoBoton = "Aceptar",
    copiable = false
  } = {}) {
    tipo = normalizarTipo(tipo);

    const tarea = () => new Promise(resolve => {
      const raiz = asegurarContenedor();
      const fondo = document.createElement("div");
      fondo.className = "ot-feedback-backdrop";
      fondo.innerHTML = `
        <section class="ot-feedback-dialog ot-feedback-${tipo}"
          role="alertdialog" aria-modal="true"
          aria-labelledby="otFeedbackTitle" aria-describedby="otFeedbackMessage">
          <div class="ot-feedback-icon" aria-hidden="true">${icono(tipo)}</div>
          <div class="ot-feedback-content">
            <h2 id="otFeedbackTitle"></h2>
            <div id="otFeedbackMessage" class="ot-feedback-message"></div>
            <div class="ot-feedback-actions">
              ${copiable ? '<button type="button" class="ot-feedback-copy">Copiar mensaje</button>' : ""}
              <button type="button" class="ot-feedback-primary"></button>
            </div>
          </div>
        </section>`;

      fondo.querySelector("#otFeedbackTitle").textContent = titulo;
      fondo.querySelector("#otFeedbackMessage").textContent = String(mensaje || "");

      const aceptar = fondo.querySelector(".ot-feedback-primary");
      aceptar.textContent = textoBoton;

      function cerrar() {
        document.removeEventListener("keydown", manejarTecla);
        fondo.classList.add("is-closing");
        window.setTimeout(() => {
          fondo.remove();
          resolve(true);
        }, 140);
      }

      function manejarTecla(evento) {
        if (evento.key === "Escape" || evento.key === "Enter") cerrar();
      }

      aceptar.addEventListener("click", cerrar, { once: true });
      document.addEventListener("keydown", manejarTecla);

      const copiar = fondo.querySelector(".ot-feedback-copy");
      if (copiar) {
        copiar.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(String(mensaje || ""));
            copiar.textContent = "Copiado";
          } catch {
            copiar.textContent = "No se pudo copiar";
          }
        });
      }

      raiz.appendChild(fondo);
      window.requestAnimationFrame(() => fondo.classList.add("is-visible"));
      aceptar.focus();
    });

    cola = cola.then(tarea, tarea);
    return cola;
  }

  function confirmarAccion({
    titulo = "Confirmar acción",
    mensaje = "¿Deseas continuar?",
    tipo = "advertencia",
    textoConfirmar = "Confirmar",
    textoCancelar = "Cancelar",
    peligrosa = false
  } = {}) {
    tipo = normalizarTipo(tipo);

    const tarea = () => new Promise(resolve => {
      const raiz = asegurarContenedor();
      const fondo = document.createElement("div");
      fondo.className = "ot-feedback-backdrop";
      fondo.innerHTML = `
        <section class="ot-feedback-dialog ot-feedback-${tipo}"
          role="dialog" aria-modal="true"
          aria-labelledby="otConfirmTitle" aria-describedby="otConfirmMessage">
          <div class="ot-feedback-icon" aria-hidden="true">${icono(tipo)}</div>
          <div class="ot-feedback-content">
            <h2 id="otConfirmTitle"></h2>
            <div id="otConfirmMessage" class="ot-feedback-message"></div>
            <div class="ot-feedback-actions">
              <button type="button" class="ot-feedback-secondary"></button>
              <button type="button" class="ot-feedback-primary ${peligrosa ? "is-danger" : ""}"></button>
            </div>
          </div>
        </section>`;

      fondo.querySelector("#otConfirmTitle").textContent = titulo;
      fondo.querySelector("#otConfirmMessage").textContent = mensaje;
      const cancelar = fondo.querySelector(".ot-feedback-secondary");
      const confirmar = fondo.querySelector(".ot-feedback-primary");
      cancelar.textContent = textoCancelar;
      confirmar.textContent = textoConfirmar;

      function cerrar(resultado) {
        document.removeEventListener("keydown", manejarTecla);
        fondo.classList.add("is-closing");
        window.setTimeout(() => {
          fondo.remove();
          resolve(resultado);
        }, 140);
      }

      function manejarTecla(evento) {
        if (evento.key === "Escape") cerrar(false);
      }

      cancelar.addEventListener("click", () => cerrar(false), { once: true });
      confirmar.addEventListener("click", () => cerrar(true), { once: true });
      document.addEventListener("keydown", manejarTecla);

      raiz.appendChild(fondo);
      window.requestAnimationFrame(() => fondo.classList.add("is-visible"));
      cancelar.focus();
    });

    cola = cola.then(tarea, tarea);
    return cola;
  }

  function solicitarTexto({
    titulo = "Confirmar acción",
    mensaje = "Escribe el texto solicitado para continuar.",
    tipo = "advertencia",
    etiqueta = "Confirmación",
    valorEsperado = "",
    textoConfirmar = "Continuar",
    textoCancelar = "Cancelar",
    peligrosa = false
  } = {}) {
    tipo = normalizarTipo(tipo);

    const tarea = () => new Promise(resolve => {
      const raiz = asegurarContenedor();
      const fondo = document.createElement("div");
      fondo.className = "ot-feedback-backdrop";
      fondo.innerHTML = `
        <section class="ot-feedback-dialog ot-feedback-${tipo}"
          role="dialog" aria-modal="true"
          aria-labelledby="otPromptTitle" aria-describedby="otPromptMessage">
          <div class="ot-feedback-icon" aria-hidden="true">${icono(tipo)}</div>
          <div class="ot-feedback-content">
            <h2 id="otPromptTitle"></h2>
            <div id="otPromptMessage" class="ot-feedback-message"></div>
            <label class="ot-feedback-field">
              <span></span>
              <input type="text" autocomplete="off" spellcheck="false">
            </label>
            <div class="ot-feedback-actions">
              <button type="button" class="ot-feedback-secondary"></button>
              <button type="button" class="ot-feedback-primary ${peligrosa ? "is-danger" : ""}" disabled></button>
            </div>
          </div>
        </section>`;

      fondo.querySelector("#otPromptTitle").textContent = titulo;
      fondo.querySelector("#otPromptMessage").textContent = mensaje;
      const campo = fondo.querySelector(".ot-feedback-field input");
      fondo.querySelector(".ot-feedback-field span").textContent = etiqueta;
      const cancelar = fondo.querySelector(".ot-feedback-secondary");
      const confirmar = fondo.querySelector(".ot-feedback-primary");
      cancelar.textContent = textoCancelar;
      confirmar.textContent = textoConfirmar;

      function actualizarEstado() {
        confirmar.disabled = valorEsperado !== "" && campo.value.trim() !== valorEsperado;
      }

      function cerrar(resultado) {
        document.removeEventListener("keydown", manejarTecla);
        fondo.classList.add("is-closing");
        window.setTimeout(() => {
          fondo.remove();
          resolve(resultado);
        }, 140);
      }

      function manejarTecla(evento) {
        if (evento.key === "Escape") cerrar(null);
        if (evento.key === "Enter" && !confirmar.disabled) cerrar(campo.value.trim());
      }

      campo.addEventListener("input", actualizarEstado);
      cancelar.addEventListener("click", () => cerrar(null), { once: true });
      confirmar.addEventListener("click", () => cerrar(campo.value.trim()), { once: true });
      document.addEventListener("keydown", manejarTecla);
      raiz.appendChild(fondo);
      window.requestAnimationFrame(() => fondo.classList.add("is-visible"));
      actualizarEstado();
      campo.focus();
    });

    cola = cola.then(tarea, tarea);
    return cola;
  }

  window.OverTrackUI = Object.freeze({ mostrarMensaje, confirmarAccion, solicitarTexto });
})();
