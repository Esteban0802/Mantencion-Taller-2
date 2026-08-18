let getOT = () => null;
let getUsuario = () => null;

export function inicializarBitacora(config) {
    getOT = config.getOT;
    getUsuario = config.getUsuario;
}

export function agregarBitacora(accion, detalle = "") {

    const ot = getOT();

    if (!ot) return;

    if (!ot.bitacora) {
        ot.bitacora = [];
    }

    const usuario = getUsuario();

    ot.bitacora.push({
        accion,
        detalle,
        usuario: usuario?.nombre || "Usuario",
        rol: usuario?.rol || "Sin rol",
        fecha: new Date().toLocaleString()
    });

}