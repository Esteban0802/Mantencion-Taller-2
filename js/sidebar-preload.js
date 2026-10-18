(() => {
  try {
    const usuario = JSON.parse(localStorage.getItem("usuarioActivo") || "null");
    const rol = usuario?.rol || "";
    document.documentElement.dataset.usuarioRol = rol;

    const modulosPorRol = {
      super_admin: ["dashboard", "ordenes", "inventario", "sheq", "programacion", "nueva", "panel"],
      admin_empresa: ["dashboard", "ordenes", "inventario", "sheq", "programacion", "panel"],
      admin_sucursal: ["dashboard", "ordenes", "inventario", "sheq", "programacion", "panel"],
      jefe_taller: ["dashboard", "ordenes", "inventario", "sheq", "nueva"],
      supervisor: ["dashboard", "ordenes", "programacion"],
      tecnico: ["dashboard", "ordenes", "programacion"],
      planificador: ["dashboard", "ordenes", "inventario", "sheq", "programacion"],
      bodeguero: ["inventario", "programacion"],
      sheq: ["sheq", "programacion"]
    };
    const selectoresPorModulo = {
      dashboard: ["#menuDashboardOperacional", "#menuDashboardOrdenes", "#menuDashboardInventario", "#menuDashboardSheq", "#menuDashboardProgramacion"],
      ordenes: ["#menuOrdenes", "#menuOrdenesInventario", "#menuOrdenesSheq", "#menuOrdenesProgramacion"],
      inventario: ["#menuInventario", "#menuInventarioOrdenes", "#menuInventarioSheq", "#menuInventarioProgramacion"],
      sheq: ["#menuSheq", "#menuSheqOrdenes", "#menuSheqInventario", "#menuSheqProgramacion"],
      programacion: ["#menuProgramacion", "#menuProgramacionOrdenes", "#menuProgramacionInventario", "#menuProgramacionSheq"],
      nueva: ["#menuNuevaOT"],
      panel: ["#btnPanelEmpresa", "#menuPanelEmpresaInventario", "#menuPanelEmpresaSheq", "#menuPanelEmpresaProgramacion"]
    };
    const permitidos = (modulosPorRol[rol] || []).flatMap(modulo => selectoresPorModulo[modulo] || []);
    const estilo = document.createElement("style");
    estilo.id = "sidebar-preload-style";
    estilo.textContent = `
      .dashboard-overtrack .sidebar li { display: none !important; }
      .dashboard-overtrack .sidebar li.active${permitidos.length ? `, ${permitidos.map(selector => `.dashboard-overtrack .sidebar ${selector}`).join(", ")}` : ""} { display: flex !important; }
    `;
    document.head.appendChild(estilo);
  } catch (_) {
    document.documentElement.dataset.usuarioRol = "";
  }
})();
