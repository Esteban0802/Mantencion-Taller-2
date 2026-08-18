let getOTServicio = null;
let getUsuarioServicio = null;
let OTBloqueadaServicio = null;

export function inicializarModuloUI({

    getOT,
    getUsuario,
    OTBloqueada

}) {

    getOTServicio = getOT;
    getUsuarioServicio = getUsuario;
    OTBloqueadaServicio = OTBloqueada;

}




function mostrarAlerta(msg, tipo = "error") {

  const div = document.createElement("div");

  div.className = "alerta " + tipo;
  div.innerText = msg;

  document.body.appendChild(div);

  setTimeout(() => div.remove(), 3000);
}


function renderUsuarioActivo() {

    const usuario = getUsuarioServicio();

    if (!usuario) return;

    const nombre = document.getElementById("usuarioNombre");
    const rol = document.getElementById("usuarioRol");

    if (nombre) {
        nombre.textContent = usuario.nombre || "Usuario";
    }

    if (rol) {
        rol.textContent = usuario.rol || "Sin rol";
    }

}


function aplicarModoSoloLectura() {

  if (!OTBloqueadaServicio()) return;

  document
    .querySelectorAll("input, textarea, select, button")
    .forEach(el => {

      if (
        el.classList.contains("tab") ||
        el.classList.contains("permitido-bloqueo")
      ) return;

      el.disabled = true;
      el.style.opacity = "0.45";
      el.style.cursor = "not-allowed";
    });

  document
    .querySelectorAll('input[type="file"]')
    .forEach(file => {
      file.disabled = true;
      file.style.pointerEvents = "none";
      file.style.opacity = "0.45";
    });

  console.log("🔒 OT cerrada: modo solo lectura aplicado");
}


export {
    mostrarAlerta,
    renderUsuarioActivo,
    aplicarModoSoloLectura
};