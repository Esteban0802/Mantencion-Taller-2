import { app } from "../../firebase-config.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const validar = httpsCallable(getFunctions(app, "us-central1"), "validarComentariosOT");

export async function autorizarComentariosOT(otId, datos) {
    const etapas = Object.fromEntries(
        ["ingreso", "evaluacion", "overhaul", "pruebas", "despacho",
            "decisionEvaluacion", "decisionMantencion", "decisionPruebas", "decisionDespacho"]
            .map(campo => [campo, datos[campo] ?? null])
    );
    await validar({ otId, etapas, empresaId: datos.empresaId, sucursalId: datos.sucursalId });
}
