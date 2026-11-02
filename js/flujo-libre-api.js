import { app } from "./firebase-config.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
const functions = getFunctions(app,"us-central1");
export const crearFlujoLibre = httpsCallable(functions,"crearOTFlujoLibre",{timeout:120000});
export const actualizarFlujoLibre = httpsCallable(functions,"actualizarOTFlujoLibre");
export const obtenerPlantillaLibre = httpsCallable(functions,"obtenerPlantillaFlujoLibre",{timeout:120000});
