let listaOTs = [];

// =======================
// CARGAR TODAS LAS OT
// =======================
window.onload = () => {
  const data = localStorage.getItem("ots");

  if (data) {
    listaOTs = JSON.parse(data);
  }

  renderTabla();
};

// =======================
// RENDER TABLA
// =======================
function renderTabla() {
  const tbody = document.getElementById("tablaOT");
  tbody.innerHTML = "";

  listaOTs.forEach((o, i) => {

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>OT-${o.id}</td>
      <td>${o.equipo}</td>
      <td>${o.serie}</td>
      <td>${o.estado || "EN PROCESO"}</td>
      <td>
        <button class="btn-icon" onclick="abrirOT(${i})">Abrir</button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

// =======================
// ABRIR OT
// =======================
function abrirOT(index) {
  const ot = listaOTs[index];

  localStorage.setItem("otActiva", ot.id);

  window.location.href = "index.html";
}

// =======================
// NUEVA OT
// =======================
function nuevaOT() {
  localStorage.removeItem("otActiva"); // limpia selección
  window.location.href = "index.html";
}