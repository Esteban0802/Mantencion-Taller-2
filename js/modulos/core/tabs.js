// ==========================================
// CORE - TABS
// ==========================================

export function habilitarTab(nombre) {

    const tab = document.querySelector(`[data-tab="${nombre}"]`);

    if (!tab) {
        console.warn("Tab no encontrada:", nombre);
        return;
    }

    tab.classList.remove("disabled");
    tab.classList.add("enabled");

}

export function deshabilitarTab(nombre) {

    const tab = document.querySelector(`[data-tab="${nombre}"]`);

    if (!tab) return;

    tab.classList.add("disabled");
    tab.classList.remove("enabled");
    tab.classList.remove("active");

}

export function cambiarTab(nombre) {

    document.querySelectorAll(".tab").forEach(t => {
        t.classList.remove("active");
    });

    document.querySelectorAll(".content").forEach(c => {
        c.classList.remove("active");
    });

    const tab = document.querySelector(`[data-tab="${nombre}"]`);
    const content = document.getElementById(nombre);

    if (tab) {

        tab.classList.add("active");

        if (!tab.classList.contains("disabled")) {
            tab.classList.add("enabled");
        }

    }

    if (content) {
        content.classList.add("active");
    }

}