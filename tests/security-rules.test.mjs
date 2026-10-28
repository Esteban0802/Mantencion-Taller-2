import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { subirArchivoEmpresa, eliminarArchivoEmpresa } = createRequire(import.meta.url)("../functions/archivos-empresa.js");
const { subirArchivoOT, eliminarArchivoOT } = createRequire(import.meta.url)("../functions/archivos-ot.js");
const { randomUUID } = createRequire(import.meta.url)("node:crypto");
const { autorizarEtapasOT } = createRequire(import.meta.url)("../functions/comentarios-ot.js");

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  Timestamp,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  deleteObject,
  getBytes,
  getMetadata,
  getDownloadURL,
  ref,
  uploadBytes,
  updateMetadata,
} from "firebase/storage";

// Firebase CLI uses this isolated demo project when the emulator is started
// without a selected production project. Keep every cross-service rules lookup
// (Storage -> Firestore) inside the same emulator namespace.
const PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-no-project";
const FIRESTORE_PORT = Number(process.env.FIRESTORE_EMULATOR_PORT || 8080);
const STORAGE_PORT = Number(process.env.STORAGE_EMULATOR_PORT || 9199);
let testEnv;

const usuarioTallerA = {
  uid: "taller-a",
  rol: "tecnico",
  empresaId: "empresa-a",
  sucursalId: "sucursal-a",
  activo: true,
  debeCambiarPassword: true,
};

const jefeTallerA = {
  uid: "jefe-a",
  rol: "jefe_taller",
  empresaId: "empresa-a",
  sucursalId: "sucursal-a",
  activo: true,
};

const supervisorA = {
  uid: "supervisor-a",
  rol: "supervisor",
  empresaId: "empresa-a",
  sucursalId: "sucursal-a",
  activo: true,
};

const tecnicoA = {
  uid: "tecnico-a",
  rol: "tecnico",
  empresaId: "empresa-a",
  sucursalId: "sucursal-a",
  activo: true,
};

const adminEmpresaA = {
  uid: "admin-a",
  rol: "admin_empresa",
  empresaId: "empresa-a",
  sucursalId: "sucursal-a",
  activo: true,
};

const adminSucursalA = {
  uid: "admin-sucursal-a",
  rol: "admin_sucursal",
  empresaId: "empresa-a",
  sucursalId: "sucursal-a",
  activo: true,
};

const planificadorA = {
  uid: "planificador-a",
  rol: "planificador",
  empresaId: "empresa-a",
  sucursalId: "sucursal-a",
  activo: true,
};

const bodegueroA = {
  uid: "bodeguero-a",
  rol: "bodeguero",
  empresaId: "empresa-a",
  sucursalId: "sucursal-a",
  activo: true,
};

const usuarioSheqA = {
  uid: "sheq-a",
  rol: "sheq",
  empresaId: "empresa-a",
  sucursalId: "sucursal-a",
  activo: true,
};

const usuarioSucursalA2 = {
  uid: "taller-a2",
  rol: "tecnico",
  empresaId: "empresa-a",
  sucursalId: "sucursal-a2",
  activo: true,
};

const usuarioTallerB = {
  uid: "taller-b",
  rol: "tecnico",
  empresaId: "empresa-b",
  sucursalId: "sucursal-b",
  activo: true,
};

const usuarioInactivo = {
  uid: "inactivo-a",
  rol: "tecnico",
  empresaId: "empresa-a",
  sucursalId: "sucursal-a",
  activo: false,
};

const usuarioSucursalInactiva = {
  uid: "taller-sucursal-inactiva",
  rol: "tecnico",
  empresaId: "empresa-a",
  sucursalId: "sucursal-inactiva",
  activo: false,
  suspendidoPorSucursal: true,
};

const superAdmin = {
  uid: "super-admin",
  rol: "super_admin",
  activo: true,
};

function firestoreComo(uid, authTime = Math.floor(Date.now() / 1000)) {
  return testEnv.authenticatedContext(uid, { auth_time: authTime }).firestore();
}

function storageComo(uid) {
  return testEnv.authenticatedContext(uid).storage();
}

// Ejecuta el mismo servicio usado por la callable, con un adaptador del SDK
// modular del emulador. Solo este contexto representa al backend de confianza.
async function autorizarComentariosEnPrueba(uid, otId, cambios, alcance = {}) {
  await testEnv.withSecurityRulesDisabled(async contexto => {
    const firestore = contexto.firestore();
    const perfil = (await getDoc(doc(firestore, "usuarios", uid))).data();
    const referencia = ruta => ({
      ruta,
      collection: nombre => referencia(`${ruta}/${nombre}`),
      doc: id => referencia(`${ruta}/${id}`)
    });
    const db = {
      collection: nombre => referencia(nombre),
      runTransaction: callback => runTransaction(firestore, transaccion => callback({
        get: async ref => {
          const snapshot = await transaccion.get(doc(firestore, ref.ruta));
          return { exists: snapshot.exists(), data: () => snapshot.data() };
        },
        set: (ref, datos) => transaccion.set(doc(firestore, ref.ruta), datos)
      }))
    };
    const snapshot = await getDoc(doc(firestore, "ots", otId));
    await autorizarEtapasOT({
      db, usuario: perfil, otId, etapas: { ...(snapshot.data() || {}), ...cambios },
      ...alcance, venceEn: Timestamp.fromMillis(Date.now() + 300000),
      evidencias: {
        bucketName: ref(contexto.storage(), "archivo").bucket,
        obtenerAutorArchivo: async ruta => (await getMetadata(ref(contexto.storage(), ruta))).customMetadata?.creadoPorUid || ""
      }
    });
  });
}

// Usa el servicio real del servidor y un adaptador de Storage/Firestore con
// acceso administrativo solo al proyecto demo del emulador.
async function archivoEnServidorPrueba(uid, accion, datos) {
  let resultado;
  await testEnv.withSecurityRulesDisabled(async contexto => {
    const firestore = contexto.firestore();
    const usuario = (await getDoc(doc(firestore, "usuarios", uid))).data();
    const referencia = ruta => ({ ruta, collection: nombre => referencia(ruta+"/"+nombre), doc: id => referencia(ruta+"/"+id), get: async () => {
      const snapshot = await getDoc(doc(firestore, ruta)); return { exists: snapshot.exists(), data: () => snapshot.data() };
    } });
    const db = { collection: nombre => referencia(nombre), runTransaction: callback => runTransaction(firestore, tx => callback({
      get: async ref => { const snapshot = await tx.get(doc(firestore, ref.ruta)); return { exists: snapshot.exists(), data: () => snapshot.data() }; },
      set: (ref, valor) => tx.set(doc(firestore, ref.ruta), valor), update: (ref, valor) => tx.update(doc(firestore, ref.ruta), valor)
    })) };
    const storage = contexto.storage();
    const bucket = {
      name: ref(storage, "archivo").bucket,
      file: (ruta, opciones = {}) => ({
        getMetadata: async () => {
          try {
            const meta = await getMetadata(ref(storage, ruta));
            const token = new URL(await getDownloadURL(ref(storage, ruta))).searchParams.get("token");
            return [{ ...meta, metadata: { ...meta.customMetadata, firebaseStorageDownloadTokens: token } }];
          } catch (error) { if (error.code === "storage/object-not-found") error.code = 404; throw error; }
        },
        save: async (bytes, opcionesCarga) => {
          try {
            await getMetadata(ref(storage, ruta));
            if (opcionesCarga.preconditionOpts?.ifGenerationMatch === 0) throw Object.assign(new Error("Ya existe"), { code: 412 });
          } catch (error) { if (error.code !== "storage/object-not-found") throw error; }
          await uploadBytes(ref(storage, ruta), bytes, { contentType: opcionesCarga.metadata.contentType, customMetadata: opcionesCarga.metadata.metadata });
        },
        delete: async () => {
          try {
            if (opciones.generation && (await getMetadata(ref(storage, ruta))).generation !== opciones.generation) throw Object.assign(new Error("Cambió"), { code: 412 });
            await deleteObject(ref(storage, ruta));
          } catch (error) { if (error.code !== "storage/object-not-found") throw error; }
        }
      })
    };
    resultado = await ({ subir: subirArchivoOT, eliminar: eliminarArchivoOT, subirEmpresa: subirArchivoEmpresa, eliminarEmpresa: eliminarArchivoEmpresa }[accion])({ db, bucket, usuario, datos });
  });
  return resultado;
}

function datosArchivoPrueba(contentType = "image/jpeg", bytes = new Uint8Array([255, 216, 255])) {
  return { otId: "ot-abierta-a", etapa: "ingreso", itemIndex: 0, nombre: "evidencia", subidaId: randomUUID(), contentType, base64: Buffer.from(bytes).toString("base64") };
}

async function sembrarDatos() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    for (const usuario of [
      usuarioTallerA,
      jefeTallerA,
      supervisorA,
      tecnicoA,
      adminEmpresaA,
      adminSucursalA,
      planificadorA,
      bodegueroA,
      usuarioSheqA,
      usuarioSucursalA2,
      usuarioTallerB,
      usuarioInactivo,
      usuarioSucursalInactiva,
      superAdmin,
    ]) {
      await setDoc(doc(db, "usuarios", usuario.uid), usuario);
    }

    await setDoc(doc(db, "empresas", "empresa-a"), {
      nombre: "Empresa A", storageCuotaVersion: 1, storageUsadoBytes: 0, storageReservadoBytes: 0, storageArchivos: 0,
      correo: "contacto@empresa-a.cl",
      telefono: "+56 9 1111 1111",
      ciudad: "Santiago",
      pais: "Chile",
      direccion: "Dirección A",
      colorPrimario: "#2563eb",
      colorSecundario: "#8bc34a",
      plan: "starter",
      maxUsuarios: 10,
      maxSucursales: 1,
      maxStorageGB: 5,
      activa: true,
      modulos: {
        ingreso: true,
        evaluacion: true,
        mantencion: true,
        pruebas: true,
        despacho: true,
        aprobaciones: true,
        inventario: true,
        sheq: true,
      },
    });

    await setDoc(doc(db, "sucursales", "sucursal-a"), {
      empresaId: "empresa-a",
      nombre: "Sucursal A",
      activa: true,
    });

    await setDoc(doc(db, "sucursales", "sucursal-a2"), {
      empresaId: "empresa-a",
      nombre: "Sucursal A2",
      activa: true,
    });

    await setDoc(doc(db, "sucursales", "sucursal-inactiva"), {
      empresaId: "empresa-a",
      nombre: "Sucursal Inactiva",
      activa: false,
    });

    await setDoc(doc(db, "inventarioConfiguraciones", "empresa-a_sucursal-a"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      columnas: ["Código", "Descripción", "Cantidad"],
    });

    await setDoc(doc(db, "inventarioItems", "item-a"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      creadoPor: "jefe-a",
      actualizadoPor: "jefe-a",
      datos: { Código: "REP-001", Descripción: "Rodamiento", Cantidad: "4" },
    });

    await setDoc(doc(db, "inventarioItems", "item-a2"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a2",
      creadoPor: "taller-a2",
      actualizadoPor: "taller-a2",
      datos: { Código: "REP-002", Descripción: "Retén", Cantidad: "2" },
    });

    await setDoc(doc(db, "ots", "ot-abierta-a"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      creadoPor: "jefe-a",
      estado: "Mantencion",
      cerrada: false,
    });

    await setDoc(doc(db, "ots", "ot-antigua-sin-cierre"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      creadoPor: "jefe-a",
      estado: "INGRESO",
    });

    await setDoc(doc(db, "ots", "ot-sucursal-inactiva"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-inactiva",
      creadoPor: "taller-sucursal-inactiva",
      estado: "Ingreso",
      cerrada: false,
    });

    await setDoc(doc(db, "ots", "ot-flujo-a"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      creadoPor: "jefe-a",
      estado: "INGRESO",
      cerrada: false,
      ingresoAprobado: false,
      evaluacionAprobada: false,
      overhaulRequerido: true,
      overhaulAprobado: false,
      pruebasAprobado: false,
      aprobacionesPorEtapa: {
        evaluacion: true,
        mantencion: false,
        pruebas: true,
        despacho: false,
      },
      etapasConActividad: {
        evaluacion: false,
        mantencion: false,
        pruebas: false,
        despacho: false,
      },
    });

    await setDoc(doc(db, "ots", "ot-cerrada-a"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      creadoPor: "jefe-a",
      estado: "Despacho",
      cerrada: true,
    });

    await setDoc(doc(db, "ots", "ot-abierta-b"), {
      empresaId: "empresa-b",
      sucursalId: "sucursal-b",
      creadoPor: "taller-b",
      estado: "Mantencion",
      cerrada: false,
    });

    await setDoc(doc(db, "ots", "ot-otra-sucursal-a"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a2",
      creadoPor: "taller-a2",
      estado: "Mantencion",
      cerrada: false,
    });

    await setDoc(doc(db, "sheqDocumentos", "documento-sheq-a"), {
      empresaId: "empresa-a",
      entidadTipo: "persona",
      entidadId: "taller-a",
      tipoDocumento: "Examen ocupacional",
      estado: "aprobado",
      fechaVencimiento: "2027-01-01",
      creadoPor: "sheq-a",
    });

    await setDoc(doc(db, "programaciones", "programacion-vehiculo-a"), {
      empresaId: "empresa-a",
      semanaInicio: "2026-10-12",
      fecha: "2026-10-14",
      grupo: "tecnico",
      usuarioIds: ["tecnico-a"],
      vehiculoId: "vehiculo-a",
      vehiculoNombre: "ABCD12 · Camioneta",
      cliente: "Cliente A",
      actualizadoPor: "planificador-a",
    });

    await setDoc(doc(db, "programacionSemanas", "empresa-a_2026-10-12"), {
      empresaId: "empresa-a",
      semanaInicio: "2026-10-12",
      estado: "publicada",
      snapshotPublicado: [],
    });

    await setDoc(doc(db, "programacionSemanas", "empresa-a_2026-10-19"), {
      empresaId: "empresa-a",
      semanaInicio: "2026-10-19",
      estado: "borrador",
    });

    await setDoc(doc(db, "programacionPublicadaUsuarios", "empresa-a_2026-10-12_tecnico-a"), {
      empresaId: "empresa-a",
      semanaInicio: "2026-10-12",
      estado: "publicada",
      usuarioId: "tecnico-a",
      asignaciones: [],
    });

    await setDoc(doc(db, "clientes", "cliente-a"), {
      empresaId: "empresa-a",
      nombre: "Cliente A",
    });

    await setDoc(doc(db, "equipos", "equipo-a"), {
      empresaId: "empresa-a",
      nombre: "Equipo A",
    });

    await setDoc(doc(db, "plantillasMantenimiento", "plantilla-a"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      nombre: "Plantilla A",
      creadoPor: "admin-a",
    });

    const storage = context.storage();
    await uploadBytes(
      ref(storage, "ots/ot-abierta-a/documentos/existente.txt"),
      new TextEncoder().encode("archivo de prueba"),
      { contentType: "text/plain" },
    );
    await uploadBytes(
      ref(storage, "ots/ot-otra-sucursal-a/documentos/existente.txt"),
      new TextEncoder().encode("archivo de otra sucursal"),
      { contentType: "text/plain" },
    );
    await uploadBytes(
      ref(storage, "empresas/empresa-a/sheq/persona/taller-a/examen.pdf"),
      new TextEncoder().encode("documento sheq"),
      { contentType: "application/pdf" },
    );
    await uploadBytes(
      ref(storage, "empresas/empresa-a/informe/logo.png"),
      new TextEncoder().encode("logo"),
      { contentType: "image/png" },
    );
  });
}

async function ponerEmpresaEnPeriodoDeExportacion() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "empresas", "empresa-a"), {
      activa: false,
      suscripcion: {
        estado: "periodo_exportacion",
      },
      cancelacion: {
        estado: "periodo_exportacion",
        fechaLimiteExportacion: "2026-10-21T00:00:00.000Z",
        eliminacionManual: true,
      },
    });
  });
}

before(async () => {
  const [firestoreRules, storageRules] = await Promise.all([
    readFile("firestore.rules", "utf8"),
    readFile("storage.rules", "utf8"),
  ]);

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: "127.0.0.1", port: FIRESTORE_PORT, rules: firestoreRules },
    storage: { host: "127.0.0.1", port: STORAGE_PORT, rules: storageRules },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await sembrarDatos();
});

after(async () => {
  await testEnv?.cleanup();
});

test("un visitante sin sesión no puede leer una OT", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "ots", "ot-abierta-a")));
});

test("Super Admin conserva la administración global de empresas y usuarios", async () => {
  const db = firestoreComo("super-admin");
  await assertSucceeds(getDoc(doc(db, "empresas", "empresa-a")));
  await assertSucceeds(getDoc(doc(db, "usuarios", "admin-a")));
  await assertSucceeds(getDoc(doc(db, "sucursales", "sucursal-a")));
  await assertSucceeds(updateDoc(doc(db, "empresas", "empresa-a"), {
    plan: "profesional",
  }));
});

test("Super Admin no puede consultar datos operacionales de una empresa", async () => {
  const db = firestoreComo("super-admin");
  for (const [coleccion, id] of [
    ["ots", "ot-abierta-a"],
    ["clientes", "cliente-a"],
    ["equipos", "equipo-a"],
    ["plantillasMantenimiento", "plantilla-a"],
    ["inventarioConfiguraciones", "empresa-a_sucursal-a"],
    ["inventarioItems", "item-a"],
    ["programaciones", "programacion-vehiculo-a"],
    ["programacionSemanas", "empresa-a_2026-10-12"],
    ["sheqDocumentos", "documento-sheq-a"],
  ]) {
    await assertFails(getDoc(doc(db, coleccion, id)));
  }
});

test("Super Admin no puede crear ni modificar información operacional", async () => {
  const db = firestoreComo("super-admin");
  await assertFails(setDoc(doc(db, "inventarioItems", "item-super-admin"), {
    empresaId: "empresa-a",
    sucursalId: "sucursal-a",
    creadoPor: "super-admin",
    datos: { Código: "NO-AUTORIZADO" },
  }));
  await assertFails(updateDoc(doc(db, "programaciones", "programacion-vehiculo-a"), {
    cliente: "Alterado por Super Admin",
  }));
  await assertFails(updateDoc(doc(db, "sheqDocumentos", "documento-sheq-a"), {
    estado: "rechazado",
  }));
});

test("Super Admin no puede acceder a archivos operacionales", async () => {
  const storage = storageComo("super-admin");
  await assertFails(getBytes(ref(storage, "ots/ot-abierta-a/documentos/existente.txt")));
  await assertFails(getBytes(ref(storage, "empresas/empresa-a/sheq/persona/taller-a/examen.pdf")));
  await assertFails(uploadBytes(
    ref(storage, "empresas/empresa-a/inventario/sucursal-a/item-super-admin/evidencia.pdf"),
    new TextEncoder().encode("no autorizado"),
    { contentType: "application/pdf" },
  ));
});

test("Super Admin conserva acceso al branding administrativo", async () => {
  const storage = storageComo("super-admin");
  await assertSucceeds(getBytes(ref(storage, "empresas/empresa-a/informe/logo.png")));
});

test("un usuario activo puede leer su propio perfil", async () => {
  const db = firestoreComo("taller-a");
  await assertSucceeds(getDoc(doc(db, "usuarios", "taller-a")));
});

test("un usuario puede confirmar su cambio obligatorio de contraseña", async () => {
  const db = firestoreComo("taller-a");
  await assertSucceeds(
    updateDoc(doc(db, "usuarios", "taller-a"), {
      debeCambiarPassword: false,
    }),
  );
});

test("un usuario no puede modificar su propio rol", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(
    updateDoc(doc(db, "usuarios", "taller-a"), {
      rol: "super_admin",
    }),
  );
});

test("Taller no puede leer el perfil de otro usuario", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(getDoc(doc(db, "usuarios", "taller-b")));
});

test("Admin Empresa puede actualizar datos operativos de su empresa", async () => {
  const db = firestoreComo("admin-a");
  await assertSucceeds(
    updateDoc(doc(db, "empresas", "empresa-a"), {
      correo: "nuevo-contacto@empresa-a.cl",
      telefono: "+56 9 2222 2222",
      colorPrimario: "#1565c0",
    }),
  );
});

test("Admin Empresa no puede cambiar plan, límites, módulos ni estado", async () => {
  const db = firestoreComo("admin-a");
  const empresaRef = doc(db, "empresas", "empresa-a");

  await assertFails(updateDoc(empresaRef, { plan: "enterprise" }));
  await assertFails(updateDoc(empresaRef, { maxUsuarios: 999 }));
  await assertFails(updateDoc(empresaRef, { modulos: ["todos"] }));
  await assertFails(updateDoc(empresaRef, { activa: false }));
});

test("Taller puede leer una OT de su empresa", async () => {
  const db = firestoreComo("taller-a");
  await assertSucceeds(getDoc(doc(db, "ots", "ot-abierta-a")));
});

test("Taller no puede leer una OT de otra empresa", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(getDoc(doc(db, "ots", "ot-abierta-b")));
});

test("Taller no puede leer una OT de otra sucursal de su empresa", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(getDoc(doc(db, "ots", "ot-otra-sucursal-a")));
});

test("Admin Sucursal no puede leer una OT de otra sucursal", async () => {
  const db = firestoreComo("admin-sucursal-a");
  await assertFails(getDoc(doc(db, "ots", "ot-otra-sucursal-a")));
});

test("Admin Empresa puede leer una OT de cualquier sucursal de su empresa", async () => {
  const db = firestoreComo("admin-a");
  await assertSucceeds(getDoc(doc(db, "ots", "ot-otra-sucursal-a")));
});

test("Taller puede consultar OT filtradas por su empresa y sucursal", async () => {
  const db = firestoreComo("taller-a");
  await assertSucceeds(
    getDocs(
      query(
        collection(db, "ots"),
        where("empresaId", "==", "empresa-a"),
        where("sucursalId", "==", "sucursal-a"),
      ),
    ),
  );
});

test("Taller no puede consultar OT de toda la empresa sin filtrar sucursal", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(
    getDocs(
      query(collection(db, "ots"), where("empresaId", "==", "empresa-a")),
    ),
  );
});

test("Taller no puede consultar la lista de OT de otra empresa", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(
    getDocs(
      query(collection(db, "ots"), where("empresaId", "==", "empresa-b")),
    ),
  );
});

test("Taller no puede consultar todas las OT sin filtro de empresa", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(getDocs(collection(db, "ots")));
});

test("un usuario inactivo no puede leer las OT", async () => {
  const db = firestoreComo("inactivo-a");
  await assertFails(getDoc(doc(db, "ots", "ot-abierta-a")));
});

test("un usuario de una sucursal inactiva no puede leer las OT", async () => {
  const db = firestoreComo("taller-sucursal-inactiva");
  await assertFails(getDoc(doc(db, "ots", "ot-sucursal-inactiva")));
});

test("un usuario de una sucursal inactiva no puede crear OT", async () => {
  const db = firestoreComo("taller-sucursal-inactiva");
  await assertFails(
    setDoc(doc(db, "ots", "ot-nueva-sucursal-inactiva"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-inactiva",
      creadoPor: "taller-sucursal-inactiva",
      estado: "Ingreso",
      cerrada: false,
    }),
  );
});

test("Técnico no puede crear una OT propia", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(
    setDoc(doc(db, "ots", "ot-nueva-a"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      creadoPor: "taller-a",
      estado: "Ingreso",
      cerrada: false,
    }),
  );
});

test("Admin Sucursal no puede crear una OT en su propia sucursal", async () => {
  const db = firestoreComo("admin-sucursal-a");
  await assertFails(
    setDoc(doc(db, "ots", "ot-admin-sucursal-a"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      creadoPor: "admin-sucursal-a",
      estado: "Ingreso",
      cerrada: false,
    }),
  );
});

test("un flujo reducido puede comenzar directamente en Mantención", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "empresas", "empresa-a"), {
      modulos: {
        ingreso: false,
        evaluacion: false,
        mantencion: true,
        pruebas: false,
        despacho: false,
        aprobaciones: true,
      },
    }, { merge: true });
  });

  const db = firestoreComo("jefe-a");
  await assertSucceeds(
    setDoc(doc(db, "ots", "ot-flujo-reducido"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      creadoPor: "jefe-a",
      estado: "OVERHAUL",
      cerrada: false,
      ingresoAprobado: false,
      evaluacionAprobada: false,
      overhaulRequerido: true,
      overhaulAprobado: false,
      pruebasAprobado: false,
    }),
  );
});

test("un flujo reducido puede comenzar directamente en Despacho", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "empresas", "empresa-a"), {
      modulos: {
        ingreso: false,
        evaluacion: false,
        mantencion: false,
        pruebas: false,
        despacho: true,
        aprobaciones: true,
      },
    }, { merge: true });
  });

  const db = firestoreComo("jefe-a");
  await assertSucceeds(
    setDoc(doc(db, "ots", "ot-solo-despacho"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      creadoPor: "jefe-a",
      estado: "DESPACHO",
      cerrada: false,
      ingresoAprobado: false,
      evaluacionAprobada: false,
      overhaulRequerido: true,
      overhaulAprobado: false,
      pruebasAprobado: false,
    }),
  );
});

test("una empresa sin etapas operativas no puede crear una OT", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "empresas", "empresa-a"), {
      modulos: {
        ingreso: false,
        evaluacion: false,
        mantencion: false,
        pruebas: false,
        despacho: false,
        aprobaciones: true,
      },
    }, { merge: true });
  });

  const db = firestoreComo("taller-a");
  await assertFails(
    setDoc(doc(db, "ots", "ot-sin-etapas"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      creadoPor: "taller-a",
      estado: "INGRESO",
      cerrada: false,
    }),
  );
});
test("un flujo reducido no puede comenzar en una etapa deshabilitada", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "empresas", "empresa-a"), {
      modulos: {
        ingreso: true,
        evaluacion: true,
        mantencion: true,
        pruebas: false,
        despacho: false,
        aprobaciones: true,
      },
    }, { merge: true });
  });

  const db = firestoreComo("taller-a");
  await assertFails(
    setDoc(doc(db, "ots", "ot-etapa-deshabilitada"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      creadoPor: "taller-a",
      estado: "PRUEBAS",
      cerrada: false,
      ingresoAprobado: true,
      evaluacionAprobada: true,
      overhaulRequerido: true,
      overhaulAprobado: true,
      pruebasAprobado: false,
    }),
  );
});

test("Admin Sucursal no puede crear una OT en otra sucursal", async () => {
  const db = firestoreComo("admin-sucursal-a");
  await assertFails(
    setDoc(doc(db, "ots", "ot-admin-sucursal-ajena"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a2",
      creadoPor: "admin-sucursal-a",
      estado: "Ingreso",
      cerrada: false,
    }),
  );
});

test("Admin Empresa no puede crear órdenes de trabajo", async () => {
  const db = firestoreComo("admin-a");
  await assertFails(
    setDoc(doc(db, "ots", "ot-admin-empresa"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      creadoPor: "admin-a",
      estado: "Ingreso",
      cerrada: false,
    }),
  );
});

test("un usuario no puede crear una OT indicando otro creador", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(
    setDoc(doc(db, "ots", "ot-falsa-a"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      creadoPor: "otra-persona",
      estado: "Ingreso",
      cerrada: false,
    }),
  );
});

test("un usuario no puede crear una OT que ya figure cerrada", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(
    setDoc(doc(db, "ots", "ot-cerrada-falsa-a"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      creadoPor: "taller-a",
      estado: "CERRADA",
      cerrada: true,
    }),
  );
});

test("Técnico no puede modificar la identificación de una OT", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(
    updateDoc(doc(db, "ots", "ot-abierta-a"), {
      cliente: "Cliente actualizado",
    }),
  );
});

test("Jefe de Taller puede modificar la identificación de una OT", async () => {
  const db = firestoreComo("jefe-a");
  await assertSucceeds(
    updateDoc(doc(db, "ots", "ot-abierta-a"), {
      cliente: "Cliente actualizado",
    }),
  );
});

test("Supervisor puede registrar trabajo de una etapa y la deja iniciada", async () => {
  const db = firestoreComo("supervisor-a");
  await autorizarComentariosEnPrueba("supervisor-a", "ot-abierta-a", {
    ingreso: [{ item: "Recepción", ok: true }]
  });
  await assertSucceeds(
    updateDoc(doc(db, "ots", "ot-abierta-a"), {
      ingreso: [{ item: "Recepción", ok: true }],
      etapasConActividad: { evaluacion: false, mantencion: false, pruebas: false, despacho: false },
    }),
  );
});

test("Técnico puede registrar trabajo de una etapa y la deja iniciada", async () => {
  const db = firestoreComo("tecnico-a");
  await autorizarComentariosEnPrueba("tecnico-a", "ot-abierta-a", {
    evaluacion: [{ item: "Diagnóstico", ok: true }]
  });
  await assertSucceeds(
    updateDoc(doc(db, "ots", "ot-abierta-a"), {
      evaluacion: [{ item: "Diagnóstico", ok: true }],
      etapasConActividad: { evaluacion: true, mantencion: false, pruebas: false, despacho: false },
    }),
  );
});

test("Taller puede avanzar de Ingreso a Evaluación al completar Ingreso", async () => {
  const db = firestoreComo("taller-a");
  await assertSucceeds(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      ingresoAprobado: true,
      estado: "EVALUACION",
    }),
  );
});

test("Supervisor puede avanzar de Ingreso a Evaluación al completar Ingreso", async () => {
  const db = firestoreComo("supervisor-a");
  await assertSucceeds(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      ingresoAprobado: true,
      estado: "EVALUACION",
    }),
  );
});

test("Técnico puede avanzar de Ingreso a Evaluación al completar Ingreso", async () => {
  const db = firestoreComo("tecnico-a");
  await assertSucceeds(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      ingresoAprobado: true,
      estado: "EVALUACION",
    }),
  );
});

test("Taller no puede saltar desde Ingreso a Mantención", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      ingresoAprobado: true,
      estado: "OVERHAUL",
    }),
  );
});

test("una OT no puede declarar estado cerrada sin marcar cerrada", async () => {
  const db = firestoreComo("jefe-a");
  await assertFails(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      ingresoAprobado: true,
      evaluacionAprobada: true,
      overhaulAprobado: true,
      pruebasAprobado: true,
      estado: "CERRADA",
      cerrada: false,
    }),
  );
});

test("Jefe de Taller puede cerrar una OT con las etapas habilitadas completas", async () => {
  const db = firestoreComo("jefe-a");
  await assertSucceeds(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      ingresoAprobado: true,
      evaluacionAprobada: true,
      overhaulAprobado: true,
      pruebasAprobado: true,
      estado: "CERRADA",
      cerrada: true,
    }),
  );
});

test("Admin Sucursal no puede cerrar una OT de su sucursal", async () => {
  const db = firestoreComo("admin-sucursal-a");
  await assertFails(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      ingresoAprobado: true,
      evaluacionAprobada: true,
      overhaulAprobado: true,
      pruebasAprobado: true,
      estado: "CERRADA",
      cerrada: true,
    }),
  );
});

test("Jefe de Taller puede cerrar un flujo reducido sin Pruebas ni Despacho", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "empresas", "empresa-a"), {
      modulos: {
        ingreso: true,
        evaluacion: true,
        mantencion: true,
        pruebas: false,
        despacho: false,
        aprobaciones: true,
      },
    }, { merge: true });
    await setDoc(doc(db, "ots", "ot-reducida-cierre"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      creadoPor: "jefe-a",
      estado: "OVERHAUL",
      cerrada: false,
      ingresoAprobado: true,
      evaluacionAprobada: true,
      overhaulRequerido: true,
      overhaulAprobado: true,
      pruebasAprobado: false,
    });
  });

  const db = firestoreComo("jefe-a");
  await assertSucceeds(
    updateDoc(doc(db, "ots", "ot-reducida-cierre"), {
      estado: "CERRADA",
      cerrada: true,
      fechaCierre: "2026-09-17",
      cerradoPor: "jefe-a",
      cerradoPorNombre: "Jefe A",
      cerradoPorRol: "jefe_taller",
    }),
  );
});

test("Técnico no puede aprobar la Evaluación cuando Aprobaciones está habilitado", async () => {
  const db = firestoreComo("taller-a");
  await autorizarComentariosEnPrueba("taller-a", "ot-flujo-a", { decisionEvaluacion: { resultado: "APROBADO" } });
  await assertFails(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      evaluacionAprobada: true,
      overhaulRequerido: true,
      decisionEvaluacion: { resultado: "APROBADO" },
    }),
  );
});

test("Supervisor no puede aprobar la Evaluación cuando Aprobaciones está habilitado", async () => {
  const db = firestoreComo("supervisor-a");
  await autorizarComentariosEnPrueba("supervisor-a", "ot-flujo-a", { decisionEvaluacion: { resultado: "APROBADO" } });
  await assertFails(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      evaluacionAprobada: true,
      overhaulRequerido: true,
      decisionEvaluacion: { resultado: "APROBADO" },
    }),
  );
});

test("Jefe de Taller puede aprobar la Evaluación", async () => {
  const db = firestoreComo("jefe-a");
  await autorizarComentariosEnPrueba("jefe-a", "ot-flujo-a", { decisionEvaluacion: { resultado: "APROBADO" } });
  await assertSucceeds(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      evaluacionAprobada: true,
      overhaulRequerido: true,
      decisionEvaluacion: { resultado: "APROBADO" },
    }),
  );
});

test("Admin Sucursal no puede aprobar la Evaluación de su sucursal", async () => {
  const db = firestoreComo("admin-sucursal-a");
  await assertFails(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      evaluacionAprobada: true,
      overhaulRequerido: true,
      decisionEvaluacion: { resultado: "APROBADO" },
    }),
  );
});

test("Técnico puede completar automáticamente una etapa sin aprobación configurada", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await updateDoc(doc(db, "ots", "ot-flujo-a"), {
      "aprobacionesPorEtapa.evaluacion": false,
    });
  });

  const db = firestoreComo("taller-a");
  await autorizarComentariosEnPrueba("taller-a", "ot-flujo-a", { decisionEvaluacion: { resultado: "NO REQUERIDA" } });
  await assertSucceeds(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      evaluacionAprobada: true,
      overhaulRequerido: true,
      decisionEvaluacion: { resultado: "NO REQUERIDA" },
    }),
  );
});

test("Técnico no puede desactivar las aprobaciones de una OT", async () => {
  const db = firestoreComo("tecnico-a");
  await assertFails(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      "aprobacionesPorEtapa.evaluacion": false,
    }),
  );
});

test("Supervisor no puede crear ni modificar la Carta Gantt", async () => {
  const db = firestoreComo("supervisor-a");
  await assertFails(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      gantt: { actividades: [], creadoPor: "Supervisor" },
    }),
  );
});

test("Jefe de Taller puede configurar una aprobación antes de iniciar la etapa", async () => {
  const db = firestoreComo("jefe-a");
  await assertSucceeds(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      "aprobacionesPorEtapa.mantencion": true,
    }),
  );
});

test("Jefe de Taller no puede retirar la aprobación de una etapa ya iniciada", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "ots", "ot-flujo-a"), {
      "etapasConActividad.evaluacion": true,
    });
  });

  const db = firestoreComo("jefe-a");
  await assertFails(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      "aprobacionesPorEtapa.evaluacion": false,
    }),
  );
});

test("Técnico no puede aprobar Pruebas cuando Aprobaciones está habilitado", async () => {
  const db = firestoreComo("taller-a");
  await autorizarComentariosEnPrueba("taller-a", "ot-flujo-a", { decisionPruebas: { resultado: "APROBADO" } });
  await assertFails(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      pruebasAprobado: true,
      decisionPruebas: { resultado: "APROBADO" },
    }),
  );
});

test("Técnico no puede cerrar una OT aunque todas las etapas estén completas", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      ingresoAprobado: true,
      evaluacionAprobada: true,
      overhaulAprobado: true,
      pruebasAprobado: true,
      estado: "CERRADA",
      cerrada: true,
      cerradoPor: "taller-a",
    }),
  );
});

test("Supervisor no puede cerrar una OT aunque todas las etapas estén completas", async () => {
  const db = firestoreComo("supervisor-a");
  await assertFails(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      ingresoAprobado: true,
      evaluacionAprobada: true,
      overhaulAprobado: true,
      pruebasAprobado: true,
      estado: "CERRADA",
      cerrada: true,
      cerradoPor: "supervisor-a",
    }),
  );
});

test("Técnico no puede alterar los datos de cierre de una OT abierta", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(
    updateDoc(doc(db, "ots", "ot-flujo-a"), {
      cerradoPorNombre: "Técnico",
    }),
  );
});

test("Taller no puede modificar una OT cerrada", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(
    updateDoc(doc(db, "ots", "ot-cerrada-a"), {
      estado: "INGRESO",
      cerrada: false,
    }),
  );
});

test("Admin Empresa no puede modificar una OT cerrada", async () => {
  const db = firestoreComo("admin-a");
  await assertFails(
    updateDoc(doc(db, "ots", "ot-cerrada-a"), {
      cliente: "Cliente alterado",
    }),
  );
});

test("Taller no puede trasladar una OT a otra empresa", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(
    updateDoc(doc(db, "ots", "ot-abierta-a"), {
      empresaId: "empresa-b",
    }),
  );
});

test("Taller no puede eliminar una OT", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(deleteDoc(doc(db, "ots", "ot-abierta-a")));
});

test("Admin Empresa no puede eliminar una OT de su empresa", async () => {
  const db = firestoreComo("admin-a");
  await assertFails(deleteDoc(doc(db, "ots", "ot-abierta-a")));
});

test("Jefe de Taller puede eliminar una OT de su sucursal", async () => {
  const db = firestoreComo("jefe-a");
  await assertSucceeds(deleteDoc(doc(db, "ots", "ot-abierta-a")));
});

test("Jefe de Taller con autenticación antigua no puede eliminar una OT", async () => {
  const db = firestoreComo("jefe-a", Math.floor(Date.now() / 1000) - 3600);
  await assertFails(deleteDoc(doc(db, "ots", "ot-abierta-a")));
});

test("Técnico puede crear el resumen liviano de una OT de su sucursal", async () => {
  const db = firestoreComo("taller-a");
  await assertSucceeds(
    setDoc(doc(db, "otsResumen", "resumen-a"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      os: "OT-RESUMEN-A",
      estado: "INGRESO",
      cerrada: false,
    }),
  );
});

test("Técnico no puede crear un resumen para otra sucursal", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(
    setDoc(doc(db, "otsResumen", "resumen-a2"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a2",
      os: "OT-RESUMEN-A2",
      estado: "INGRESO",
      cerrada: false,
    }),
  );
});

test("Admin Empresa puede migrar resúmenes de cualquier sucursal de su empresa", async () => {
  const db = firestoreComo("admin-a");
  await assertSucceeds(
    setDoc(doc(db, "otsResumen", "resumen-admin-a2"), {
      empresaId: "empresa-a",
      sucursalId: "sucursal-a2",
      os: "OT-ADMIN-A2",
      estado: "INGRESO",
      cerrada: false,
    }),
  );
});

test("Un usuario no puede leer resúmenes de otra empresa", async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "otsResumen", "resumen-b"), {
      empresaId: "empresa-b",
      sucursalId: "sucursal-b",
      os: "OT-B",
      estado: "INGRESO",
      cerrada: false,
    });
  });
  const db = firestoreComo("taller-a");
  await assertFails(getDoc(doc(db, "otsResumen", "resumen-b")));
});

test("Admin Empresa no puede crear directamente un usuario desde el cliente", async () => {
  const db = firestoreComo("admin-a");

  await assertFails(
    setDoc(doc(db, "usuarios", "nuevo-a"), {
      uid: "nuevo-a",
      rol: "tecnico",
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      activo: true,
    }),
  );
});

test("Admin Empresa no puede crear un superadministrador", async () => {
  const db = firestoreComo("admin-a");
  await assertFails(
    setDoc(doc(db, "usuarios", "super-falso"), {
      uid: "super-falso",
      rol: "super_admin",
      empresaId: "empresa-a",
      sucursalId: "sucursal-a",
      activo: true,
    }),
  );
});

test("Admin Empresa puede consultar usuarios filtrados por su empresa", async () => {
  const db = firestoreComo("admin-a");
  await assertSucceeds(
    getDocs(
      query(
        collection(db, "usuarios"),
        where("empresaId", "==", "empresa-a"),
      ),
    ),
  );
});

test("Admin Sucursal puede consultar usuarios de su propia sucursal", async () => {
  const db = firestoreComo("admin-sucursal-a");
  await assertSucceeds(
    getDocs(
      query(
        collection(db, "usuarios"),
        where("empresaId", "==", "empresa-a"),
        where("sucursalId", "==", "sucursal-a"),
      ),
    ),
  );
});

test("Admin Sucursal no puede leer un miembro de otra sucursal", async () => {
  const db = firestoreComo("admin-sucursal-a");
  await assertFails(getDoc(doc(db, "usuarios", "taller-a2")));
});

test("Admin Sucursal no puede consultar todos los usuarios de la empresa", async () => {
  const db = firestoreComo("admin-sucursal-a");
  await assertFails(
    getDocs(
      query(
        collection(db, "usuarios"),
        where("empresaId", "==", "empresa-a"),
      ),
    ),
  );
});

test("Admin Empresa no puede eludir el límite creando una sucursal desde el cliente", async () => {
  const db = firestoreComo("admin-a");
  await assertFails(
    setDoc(doc(db, "sucursales", "sucursal-directa"), {
      empresaId: "empresa-a",
      nombre: "Sucursal directa",
      codigo: "DIRECTA-01",
      ciudad: "Santiago",
      activa: true,
    }),
  );
});

test("ningún usuario puede falsificar registros del historial del sistema", async () => {
  const db = firestoreComo("admin-a");
  await assertFails(setDoc(doc(db, "logsSistema", "log-falso"), {
    version: 1,
    origen: "cloud_function",
    empresaId: "empresa-a",
    usuarioId: "admin-a",
    usuarioNombre: "Administrador",
    rol: "admin_empresa",
    accion: "usuario_eliminado",
    objetivoId: "jefe-a",
    detalle: "Evento fabricado desde el navegador",
    fecha: serverTimestamp(),
  }));
});

test("un administrador de empresa puede leer un log creado por el servidor", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "logsSistema", "log-servidor"), {
      version: 1,
      origen: "cloud_function",
      empresaId: "empresa-a",
      usuarioId: "jefe-a",
      accion: "usuario_actualizado",
      fecha: new Date("2026-10-17T12:00:00Z"),
    });
  });
  await assertSucceeds(getDoc(doc(firestoreComo("admin-a"), "logsSistema", "log-servidor")));
});

test("Técnico puede consultar el inventario de su sucursal", async () => {
  const db = firestoreComo("taller-a");
  await assertSucceeds(getDoc(doc(db, "inventarioItems", "item-a")));
});

test("Técnico no puede consultar inventario de otra sucursal", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(getDoc(doc(db, "inventarioItems", "item-a2")));
});

test("Técnico no puede modificar el inventario", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(updateDoc(doc(db, "inventarioItems", "item-a"), {
    datos: { Código: "REP-001", Descripción: "Rodamiento", Cantidad: "99" },
  }));
});

test("Jefe de Taller puede agregar inventario en su sucursal", async () => {
  const db = firestoreComo("jefe-a");
  await assertSucceeds(setDoc(doc(db, "inventarioItems", "item-nuevo-a"), {
    empresaId: "empresa-a",
    sucursalId: "sucursal-a",
    creadoPor: "jefe-a",
    actualizadoPor: "jefe-a",
    datos: { Código: "REP-003", Descripción: "Sello", Cantidad: "1" },
  }));
});

test("Jefe de Taller no puede agregar inventario en otra sucursal", async () => {
  const db = firestoreComo("jefe-a");
  await assertFails(setDoc(doc(db, "inventarioItems", "item-ajeno-a"), {
    empresaId: "empresa-a",
    sucursalId: "sucursal-a2",
    creadoPor: "jefe-a",
    actualizadoPor: "jefe-a",
    datos: { Código: "REP-X", Descripción: "Ajeno", Cantidad: "1" },
  }));
});

test("Bodeguero puede consultar el inventario de su sucursal", async () => {
  const db = firestoreComo("bodeguero-a");
  await assertSucceeds(getDoc(doc(db, "inventarioItems", "item-a")));
});

test("Bodeguero puede confirmar la recepción de un repuesto", async () => {
  const db = firestoreComo("bodeguero-a");
  await assertSucceeds(updateDoc(doc(db, "inventarioItems", "item-a"), {
    recibido: true,
    fechaRecepcion: serverTimestamp(),
    recibidoPor: "bodeguero-a",
    recibidoPorNombre: "Bodeguero A",
    estado: "Completa",
    fechaActualizacion: serverTimestamp(),
    actualizadoPor: "bodeguero-a",
  }));
});

test("Bodeguero puede actualizar el estado derivado sin alterar otro repuesto", async () => {
  const db = firestoreComo("bodeguero-a");
  await assertSucceeds(updateDoc(doc(db, "inventarioItems", "item-a"), {
    estado: "Parcial",
    fechaActualizacion: serverTimestamp(),
    actualizadoPor: "bodeguero-a",
  }));
});

test("Bodeguero no puede modificar datos ni cantidades del repuesto", async () => {
  const db = firestoreComo("bodeguero-a");
  await assertFails(updateDoc(doc(db, "inventarioItems", "item-a"), {
    datos: { Código: "REP-001", Descripción: "Alterado", Cantidad: "999" },
    fechaActualizacion: serverTimestamp(),
    actualizadoPor: "bodeguero-a",
  }));
});

test("Bodeguero no puede falsificar quién recibió un repuesto", async () => {
  const db = firestoreComo("bodeguero-a");
  await assertFails(updateDoc(doc(db, "inventarioItems", "item-a"), {
    recibido: true,
    fechaRecepcion: serverTimestamp(),
    recibidoPor: "jefe-a",
    recibidoPorNombre: "Jefe A",
    estado: "Completa",
    fechaActualizacion: serverTimestamp(),
    actualizadoPor: "bodeguero-a",
  }));
});

test("Bodeguero no puede crear ni eliminar repuestos", async () => {
  const db = firestoreComo("bodeguero-a");
  await assertFails(setDoc(doc(db, "inventarioItems", "item-bodeguero"), {
    empresaId: "empresa-a",
    sucursalId: "sucursal-a",
    creadoPor: "bodeguero-a",
    actualizadoPor: "bodeguero-a",
    datos: { Código: "REP-B", Descripción: "No autorizado", Cantidad: "1" },
  }));
  await assertFails(deleteDoc(doc(db, "inventarioItems", "item-a")));
});

test("Bodeguero no puede subir evidencias al inventario", async () => {
  const storage = storageComo("bodeguero-a");
  await assertFails(uploadBytes(
    ref(storage, "empresas/empresa-a/inventario/sucursal-a/item-a/evidencia.pdf"),
    new TextEncoder().encode("contenido"),
    { contentType: "application/pdf" },
  ));
});

test("Admin Empresa puede consultar inventario de todas sus sucursales", async () => {
  const db = firestoreComo("admin-a");
  await assertSucceeds(getDocs(query(collection(db, "inventarioItems"), where("empresaId", "==", "empresa-a"))));
});

test("durante cancelación Admin Empresa conserva lectura para generar el respaldo", async () => {
  await ponerEmpresaEnPeriodoDeExportacion();
  const db = firestoreComo("admin-a");
  await assertSucceeds(getDoc(doc(db, "ots", "ot-abierta-a")));
  await assertSucceeds(getDocs(query(collection(db, "inventarioItems"), where("empresaId", "==", "empresa-a"))));
});

test("durante cancelación no se puede crear ni modificar una OT", async () => {
  await ponerEmpresaEnPeriodoDeExportacion();
  const db = firestoreComo("jefe-a");
  await assertFails(updateDoc(doc(db, "ots", "ot-abierta-a"), {
    comentarioGeneral: "Este cambio debe ser rechazado",
  }));
  await assertFails(setDoc(doc(db, "ots", "ot-nueva-cancelacion"), {
    empresaId: "empresa-a",
    sucursalId: "sucursal-a",
    creadoPor: "jefe-a",
    estado: "INGRESO",
    cerrada: false,
  }));
});

test("durante cancelación Admin Empresa no puede modificar configuración ni inventario", async () => {
  await ponerEmpresaEnPeriodoDeExportacion();
  const db = firestoreComo("admin-a");
  await assertFails(updateDoc(doc(db, "empresas", "empresa-a"), {
    telefono: "+56 9 9999 9999",
  }));
  await assertFails(updateDoc(doc(db, "inventarioItems", "item-a"), {
    datos: { Código: "REP-001", Descripción: "Rodamiento", Cantidad: "99" },
    actualizadoPor: "admin-a",
  }));
});

test("Admin Sucursal no puede modificar inventario de su sucursal", async () => {
  const db = firestoreComo("admin-sucursal-a");
  await assertFails(updateDoc(doc(db, "inventarioItems", "item-a"), {
    datos: { Código: "REP-001", Descripción: "Rodamiento", Cantidad: "5" },
    actualizadoPor: "admin-sucursal-a",
}));
});

test("Admin Sucursal no puede modificar inventario de otra sucursal", async () => {
  const db = firestoreComo("admin-sucursal-a");
  await assertFails(updateDoc(doc(db, "inventarioItems", "item-a2"), {
    datos: { Código: "REP-002", Descripción: "Retén", Cantidad: "99" },
    actualizadoPor: "admin-sucursal-a",
  }));
});

test("SHEQ puede consultar y crear documentos de acreditación de su empresa", async () => {
  const db = firestoreComo("sheq-a");
  await assertSucceeds(getDoc(doc(db, "sheqDocumentos", "documento-sheq-a")));
  await assertSucceeds(setDoc(doc(db, "sheqDocumentos", "documento-sheq-nuevo"), {
    empresaId: "empresa-a",
    entidadTipo: "vehiculo",
    entidadId: "vehiculo-a",
    tipoDocumento: "SOAP",
    estado: "pendiente",
    creadoPor: "sheq-a",
  }));
});

test("SHEQ puede actualizar únicamente el RUT de un trabajador de su sucursal", async () => {
  const db = firestoreComo("sheq-a");
  await assertSucceeds(updateDoc(doc(db, "usuarios", "taller-a"), {
    rut: "12.345.678-9",
    fechaActualizacion: new Date(),
  }));
  await assertFails(updateDoc(doc(db, "usuarios", "taller-a"), {
    rol: "admin_empresa",
  }));
});

test("Técnico no puede leer la planificación editable completa", async () => {
  await assertFails(getDoc(doc(
    firestoreComo("tecnico-a"),
    "programaciones",
    "programacion-vehiculo-a",
  )));
});

test("Bodeguero puede leer la planificación editable para preparar repuestos", async () => {
  await assertSucceeds(getDoc(doc(
    firestoreComo("bodeguero-a"),
    "programaciones",
    "programacion-vehiculo-a",
  )));
});

test("SHEQ puede leer una semana publicada pero no un borrador", async () => {
  const db = firestoreComo("sheq-a");
  await assertSucceeds(getDoc(doc(db, "programacionSemanas", "empresa-a_2026-10-12")));
  await assertFails(getDoc(doc(db, "programacionSemanas", "empresa-a_2026-10-19")));
});

test("Técnico puede leer únicamente su copia personal publicada", async () => {
  const dbTecnico = firestoreComo("tecnico-a");
  await assertSucceeds(getDoc(doc(
    dbTecnico,
    "programacionPublicadaUsuarios",
    "empresa-a_2026-10-12_tecnico-a",
  )));
  await assertFails(getDoc(doc(
    firestoreComo("supervisor-a"),
    "programacionPublicadaUsuarios",
    "empresa-a_2026-10-12_tecnico-a",
  )));
});

test("Planificador puede registrar turnos de emergencia de una semana", async () => {
  const db = firestoreComo("planificador-a");
  await assertSucceeds(setDoc(doc(db, "programacionSemanas", "empresa-a_2026-10-12"), {
    empresaId: "empresa-a",
    semanaInicio: "2026-10-12",
    estado: "borrador",
    turnosEmergenciaIds: ["tecnico-a", "supervisor-a"],
    actualizadoPor: "planificador-a",
    fechaActualizacion: new Date(),
  }));
});

test("Técnico no puede modificar los turnos de emergencia", async () => {
  const db = firestoreComo("tecnico-a");
  await assertFails(setDoc(doc(db, "programacionSemanas", "empresa-a_2026-10-12"), {
    empresaId: "empresa-a",
    semanaInicio: "2026-10-12",
    estado: "borrador",
    turnosEmergenciaIds: ["tecnico-a"],
    actualizadoPor: "tecnico-a",
    fechaActualizacion: new Date(),
  }));
});

test("Planificador puede registrar historial y el Técnico no puede alterarlo", async () => {
  const dbPlanificador = firestoreComo("planificador-a");
  const referencia = doc(dbPlanificador, "programacionHistorial", "historial-a");
  await assertSucceeds(setDoc(referencia, {
    empresaId: "empresa-a",
    sucursalId: "sucursal-a",
    semanaInicio: "2026-10-12",
    asignacionId: "programacion-vehiculo-a",
    accion: "Asignación modificada",
    realizadoPor: "planificador-a",
    fechaCreacion: new Date(),
  }));
  await assertFails(updateDoc(doc(firestoreComo("tecnico-a"), "programacionHistorial", "historial-a"), {
    accion: "Alterado",
  }));
});

test("Planificador administra ausencias y el Técnico solo puede consultarlas", async () => {
  const dbPlanificador = firestoreComo("planificador-a");
  await assertSucceeds(setDoc(doc(dbPlanificador, "programacionAusencias", "ausencia-a"), {
    empresaId: "empresa-a",
    sucursalId: "sucursal-a",
    usuarioId: "tecnico-a",
    fechaInicio: "2026-10-14",
    fechaTermino: "2026-10-15",
    tipo: "Vacaciones",
    creadoPor: "planificador-a",
  }));
  const dbTecnico = firestoreComo("tecnico-a");
  await assertSucceeds(getDoc(doc(dbTecnico, "programacionAusencias", "ausencia-a")));
  await assertFails(setDoc(doc(dbTecnico, "programacionAusencias", "ausencia-tecnico"), {
    empresaId: "empresa-a",
    sucursalId: "sucursal-a",
    usuarioId: "tecnico-a",
    fechaInicio: "2026-10-16",
    fechaTermino: "2026-10-16",
    tipo: "Permiso",
    creadoPor: "tecnico-a",
  }));
});

test("Técnico puede confirmar únicamente su propia programación", async () => {
  const db = firestoreComo("tecnico-a");
  await assertSucceeds(setDoc(doc(db, "programacionConfirmaciones", "empresa-a_2026-10-12_tecnico-a"), {
    empresaId: "empresa-a",
    sucursalId: "sucursal-a",
    semanaInicio: "2026-10-12",
    usuarioId: "tecnico-a",
    fechaConfirmacion: new Date(),
  }));
  await assertFails(setDoc(doc(db, "programacionConfirmaciones", "empresa-a_2026-10-12_supervisor-a"), {
    empresaId: "empresa-a",
    sucursalId: "sucursal-a",
    semanaInicio: "2026-10-12",
    usuarioId: "supervisor-a",
    fechaConfirmacion: new Date(),
  }));
});

test("SHEQ puede retirar un vehículo eliminado de Programación sin modificar la actividad", async () => {
  const db = firestoreComo("sheq-a");
  const referencia = doc(db, "programaciones", "programacion-vehiculo-a");
  await assertSucceeds(updateDoc(referencia, {
    vehiculoId: deleteField(),
    vehiculoNombre: deleteField(),
    actualizadoPor: "sheq-a",
    fechaActualizacion: new Date(),
  }));
  await assertFails(updateDoc(referencia, {
    cliente: "Cliente modificado",
    actualizadoPor: "sheq-a",
    fechaActualizacion: new Date(),
  }));
});

test("Jefe de Taller puede consultar SHEQ pero no modificarlo", async () => {
  const db = firestoreComo("jefe-a");
  await assertSucceeds(getDoc(doc(db, "sheqDocumentos", "documento-sheq-a")));
  await assertFails(updateDoc(doc(db, "sheqDocumentos", "documento-sheq-a"), {
    estado: "rechazado",
  }));
});

test("Técnico no puede consultar documentos SHEQ", async () => {
  const db = firestoreComo("taller-a");
  await assertFails(getDoc(doc(db, "sheqDocumentos", "documento-sheq-a")));
});

test("SHEQ puede subir, leer y eliminar archivos de acreditación", async () => {
  const storage = storageComo("sheq-a");
  await assertSucceeds(getBytes(ref(storage, "empresas/empresa-a/sheq/persona/taller-a/examen.pdf")));
  const ruta = "empresas/empresa-a/sheq/vehiculo/vehiculo-a/soap.pdf";
  await archivoEnServidorPrueba("sheq-a", "subirEmpresa", { ruta, contentType: "application/pdf", base64: Buffer.from("%PDF-1.4").toString("base64") });
  await assertSucceeds(getBytes(ref(storage, ruta)));
  await archivoEnServidorPrueba("sheq-a", "eliminarEmpresa", { ruta });
});

test("Técnico no puede leer ni subir archivos SHEQ", async () => {
  const storage = storageComo("taller-a");
  await assertFails(getBytes(ref(storage, "empresas/empresa-a/sheq/persona/taller-a/examen.pdf")));
  await assertFails(uploadBytes(
    ref(storage, "empresas/empresa-a/sheq/persona/taller-a/nuevo.pdf"),
    new TextEncoder().encode("archivo"),
    { contentType: "application/pdf" },
  ));
});

test("Taller puede leer un archivo de una OT de su empresa", async () => {
  const storage = storageComo("taller-a");
  await assertSucceeds(
    getBytes(ref(storage, "ots/ot-abierta-a/documentos/existente.txt")),
  );
});

test("Taller no puede leer un archivo de una OT de otra empresa", async () => {
  const storage = storageComo("taller-b");
  await assertFails(
    getBytes(ref(storage, "ots/ot-abierta-a/documentos/existente.txt")),
  );
});

test("Taller no puede leer un archivo de otra sucursal de su empresa", async () => {
  const storage = storageComo("taller-a");
  await assertFails(
    getBytes(ref(storage, "ots/ot-otra-sucursal-a/documentos/existente.txt")),
  );
});

test("Admin Sucursal no puede leer archivos de otra sucursal", async () => {
  const storage = storageComo("admin-sucursal-a");
  await assertFails(
    getBytes(ref(storage, "ots/ot-otra-sucursal-a/documentos/existente.txt")),
  );
});

test("un usuario inactivo no puede leer archivos de una OT", async () => {
  const storage = storageComo("inactivo-a");
  await assertFails(
    getBytes(ref(storage, "ots/ot-abierta-a/documentos/existente.txt")),
  );
});

test("Taller no puede subir texto plano a una OT abierta", async () => {
  const storage = storageComo("taller-a");
  await assertFails(
    uploadBytes(
      ref(storage, "ots/ot-abierta-a/documentos/nuevo.txt"),
      new TextEncoder().encode("contenido"),
      { contentType: "text/plain", customMetadata: { creadoPorUid: "taller-a" } },
    ),
  );
});

test("Supervisor no puede subir GIF como evidencia", async () => {
  const storage = storageComo("supervisor-a");
  await assertFails(uploadBytes(
    ref(storage, "ots/ot-abierta-a/ingreso/item_0/evidencia-supervisor.gif"),
    new Uint8Array([71, 73, 70]),
    { contentType: "image/gif", customMetadata: { creadoPorUid: "supervisor-a" } },
  ));
});

test("Supervisor puede subir una foto HEIC tomada desde un móvil", async () => {
  const resultado = await archivoEnServidorPrueba("supervisor-a", "subir", { ...datosArchivoPrueba("image/heic", Buffer.from([0,0,0,24,102,116,121,112,104,101,105,99])), otId: "ot-abierta-a" });
  assert.ok(resultado.url);
});

test("Técnico puede subir una foto AVIF tomada desde un móvil", async () => {
  const resultado = await archivoEnServidorPrueba("tecnico-a", "subir", { ...datosArchivoPrueba("image/avif", Buffer.from([0,0,0,24,102,116,121,112,97,118,105,102])), otId: "ot-abierta-a" });
  assert.ok(resultado.url);
});

test("Técnico no puede subir SVG como evidencia", async () => {
  const storage = storageComo("tecnico-a");
  await assertFails(uploadBytes(
    ref(storage, "ots/ot-abierta-a/ingreso/item_0/evidencia-tecnico.svg"),
    new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    { contentType: "image/svg+xml", customMetadata: { creadoPorUid: "tecnico-a" } },
  ));
});

test("Técnico puede subir evidencia JPEG a una OT abierta de su sucursal", async () => {
  const resultado = await archivoEnServidorPrueba("tecnico-a", "subir", { ...datosArchivoPrueba("image/jpeg", new Uint8Array([255,216,255])), otId: "ot-abierta-a" });
  assert.ok(resultado.url);
});

test("Técnico puede subir un PDF como evidencia de una OT abierta", async () => {
  const resultado = await archivoEnServidorPrueba("tecnico-a", "subir", { ...datosArchivoPrueba("application/pdf", Buffer.from("%PDF-1.4")), otId: "ot-abierta-a" });
  assert.ok(resultado.url);
});

test("Técnico puede subir evidencia a una OT antigua sin campo cerrada", async () => {
  const resultado = await archivoEnServidorPrueba("tecnico-a", "subir", { ...datosArchivoPrueba("image/jpeg", new Uint8Array([255,216,255])), otId: "ot-antigua-sin-cierre" });
  assert.ok(resultado.url);
});

test("durante cancelación se pueden descargar archivos, pero no subir ni eliminar", async () => {
  await ponerEmpresaEnPeriodoDeExportacion();
  const storage = storageComo("admin-a");
  const existente = ref(storage, "ots/ot-abierta-a/documentos/existente.txt");
  await assertSucceeds(getBytes(existente));
  await assertFails(uploadBytes(
    ref(storage, "ots/ot-abierta-a/documentos/nuevo-cancelacion.txt"),
    new TextEncoder().encode("contenido"),
    { contentType: "text/plain", customMetadata: { creadoPorUid: "admin-a" } },
  ));
  await assertFails(deleteObject(existente));
});

test("Taller no puede subir un archivo ejecutable a una OT", async () => {
  const storage = storageComo("taller-a");
  await assertFails(
    uploadBytes(
      ref(storage, "ots/ot-abierta-a/documentos/programa.exe"),
      new Uint8Array([77, 90]),
      { contentType: "application/x-msdownload", customMetadata: { creadoPorUid: "taller-a" } },
    ),
  );
});

test("Taller no puede subir archivos a una OT cerrada", async () => {
  const storage = storageComo("taller-a");
  await assertFails(
    uploadBytes(
      ref(storage, "ots/ot-cerrada-a/documentos/nuevo.txt"),
      new TextEncoder().encode("contenido"),
      { contentType: "text/plain", customMetadata: { creadoPorUid: "taller-a" } },
    ),
  );
});

test("Taller no puede borrar archivos de una OT cerrada", async () => {
  const storage = storageComo("taller-a");
  await assertFails(
    deleteObject(ref(storage, "ots/ot-cerrada-a/documentos/inexistente.txt")),
  );
});

const ubicacionesComentarios = {
  ingreso: lista => ({ ingreso: [{ item: "Ítem", comentarios: lista }] }),
  evaluacion: lista => ({ evaluacion: [{ item: "Ítem", comentarios: lista }] }),
  overhaul: lista => ({ overhaul: [{ item: "Ítem", comentarios: lista }] }),
  pruebasGeneral: lista => ({ pruebas: { general: [{ comentarios: lista }] } }),
  pruebasMecanicas: lista => ({ pruebas: { mecanico: [{ comentarios: lista }] } }),
  pruebasElectricas: lista => ({ pruebas: { electrico: [{ comentarios: lista }] } }),
  despachoPreparacion: lista => ({ despacho: { comentariosPreparacion: lista } }),
  despachoFinal: lista => ({ despacho: { comentariosFinal: lista } })
};
const marcasComentarios = { evaluacion: true, mantencion: true, pruebas: true, despacho: true };
const comentarioAjeno = { texto: "Original", creadoPorUid: "supervisor-a", rol: "supervisor", fecha: "ayer" };

for (const [ubicacion, datos] of Object.entries(ubicacionesComentarios)) {
  test(`${ubicacion}: bloquea borrar, editar o suplantar comentarios ajenos`, async () => {
    await testEnv.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "ots", "ot-abierta-a"), datos([comentarioAjeno])));
    for (const uid of ["tecnico-a", "jefe-a"]) {
      for (const lista of [[], [{ ...comentarioAjeno, texto: "Alterado" }], [{ ...comentarioAjeno, creadoPorUid: uid }]]) {
        const cambios = { ...datos(lista), etapasConActividad: marcasComentarios };
        await assertFails(updateDoc(doc(firestoreComo(uid), "ots", "ot-abierta-a"), cambios));
        await assert.rejects(autorizarComentariosEnPrueba(uid, "ot-abierta-a", cambios));
      }
    }
  });

  test(`${ubicacion}: permite agregar, editar y eliminar el comentario propio`, async () => {
    await testEnv.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "ots", "ot-abierta-a"), datos([comentarioAjeno])));
    const propio = { texto: "Trabajo", creadoPorUid: "tecnico-a", rol: "tecnico", fecha: "hoy" };
    for (const lista of [[comentarioAjeno, propio], [comentarioAjeno, { ...propio, texto: "Corregido" }], [comentarioAjeno]]) {
      const cambios = { ...datos(lista), etapasConActividad: marcasComentarios };
      await autorizarComentariosEnPrueba("tecnico-a", "ot-abierta-a", cambios);
      await assertSucceeds(updateDoc(doc(firestoreComo("tecnico-a"), "ots", "ot-abierta-a"), cambios));
    }
  });
}

test("no permite falsificar autorizaciones ni utilizarlas desde otra cuenta", async () => {
  const cambios = ubicacionesComentarios.ingreso([{ texto: "Trabajo", creadoPorUid: "tecnico-a", rol: "tecnico" }]);
  const ruta = "ots/ot-abierta-a/validacionesComentarios/tecnico-a/versiones/nueva";
  await assertFails(setDoc(doc(firestoreComo("tecnico-a"), ruta), { etapas: cambios, venceEn: Timestamp.fromMillis(Date.now() + 300000) }));
  await autorizarComentariosEnPrueba("tecnico-a", "ot-abierta-a", cambios);
  await assertFails(updateDoc(doc(firestoreComo("supervisor-a"), "ots", "ot-abierta-a"), { ...cambios, etapasConActividad: marcasComentarios }));
  await assertFails(updateDoc(doc(firestoreComo("tecnico-a"), "ots", "ot-abierta-a"), { ingreso: [], etapasConActividad: marcasComentarios }));
});

test("rechaza autorizaciones vencidas y estados anteriores a un cambio concurrente", async () => {
  const cambios = ubicacionesComentarios.ingreso([{ texto: "Trabajo", creadoPorUid: "tecnico-a", rol: "tecnico" }]);
  await autorizarComentariosEnPrueba("tecnico-a", "ot-abierta-a", cambios);
  await testEnv.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "ots", "ot-abierta-a"), ubicacionesComentarios.ingreso([comentarioAjeno])));
  await assertFails(updateDoc(doc(firestoreComo("tecnico-a"), "ots", "ot-abierta-a"), { ...cambios, etapasConActividad: marcasComentarios }));
  const actualizados = ubicacionesComentarios.ingreso([comentarioAjeno, { texto: "Trabajo", creadoPorUid: "tecnico-a", rol: "tecnico" }]);
  await autorizarComentariosEnPrueba("tecnico-a", "ot-abierta-a", actualizados);
  await testEnv.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "ots/ot-abierta-a/validacionesComentarios/tecnico-a/versiones/nueva"), { venceEn: Timestamp.fromMillis(0) }));
  await assertFails(updateDoc(doc(firestoreComo("tecnico-a"), "ots", "ot-abierta-a"), { ...actualizados, etapasConActividad: marcasComentarios }));
});

test("el técnico puede responder al jefe y no puede reescribir la respuesta", async () => {
  const observacion = { texto: "Corregir", creadoPorUid: "jefe-a", rol: "jefe_taller", atendido: false };
  await testEnv.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "ots", "ot-abierta-a"), { ...ubicacionesComentarios.ingreso([observacion]), alertaJefe: true }));
  const respuesta = { ...observacion, atendido: true, respuestaUsuario: "Corregido", atendidoPorUid: "tecnico-a", atendidoPor: "Técnico", fechaAtendido: "hoy" };
  const cambios = { ...ubicacionesComentarios.ingreso([respuesta]), etapasConActividad: marcasComentarios, alertaJefe: false };
  await autorizarComentariosEnPrueba("tecnico-a", "ot-abierta-a", cambios);
  await assertSucceeds(updateDoc(doc(firestoreComo("tecnico-a"), "ots", "ot-abierta-a"), cambios));
  await assert.rejects(autorizarComentariosEnPrueba("tecnico-a", "ot-abierta-a", ubicacionesComentarios.ingreso([{ ...respuesta, respuestaUsuario: "Otra" }])));
});

test("la creación con etapas requiere autorización y conserva el flujo de nuevas OT", async () => {
  const nueva = { empresaId: "empresa-a", sucursalId: "sucursal-a", creadoPor: "jefe-a", estado: "INGRESO", cerrada: false, ingreso: [{ item: "Recepción", comentarios: [] }] };
  const refNueva = doc(firestoreComo("jefe-a"), "ots", "ot-comentarios-nueva");
  await assertFails(setDoc(refNueva, nueva));
  await autorizarComentariosEnPrueba("jefe-a", "ot-comentarios-nueva", nueva, nueva);
  await assertSucceeds(setDoc(refNueva, nueva));
});

test("la autorización de comentarios no concede aprobación ni permite ocultar observaciones", async () => {
  const observacion = { texto: "Corregir", creadoPorUid: "jefe-a", rol: "jefe_taller", atendido: false };
  await testEnv.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "ots", "ot-flujo-a"), {
    ...ubicacionesComentarios.ingreso([observacion]), alertaJefe: true
  }));
  const cambios = ubicacionesComentarios.ingreso([observacion, { texto: "Trabajo", creadoPorUid: "tecnico-a", rol: "tecnico" }]);
  await autorizarComentariosEnPrueba("tecnico-a", "ot-flujo-a", { ...cambios, decisionEvaluacion: "APROBADA" });
  await assertFails(updateDoc(doc(firestoreComo("tecnico-a"), "ots", "ot-flujo-a"), {
    ...cambios, etapasConActividad: marcasComentarios, decisionEvaluacion: "APROBADA", evaluacionAprobada: true
  }));
  await autorizarComentariosEnPrueba("tecnico-a", "ot-flujo-a", cambios);
  await assertFails(updateDoc(doc(firestoreComo("tecnico-a"), "ots", "ot-flujo-a"), {
    ...cambios, etapasConActividad: marcasComentarios, alertaJefe: false
  }));
  await assertSucceeds(updateDoc(doc(firestoreComo("tecnico-a"), "ots", "ot-flujo-a"), {
    ...cambios, etapasConActividad: marcasComentarios
  }));
});

function urlEvidenciaPrueba(ruta) {
  const bucket = ref(storageComo("tecnico-a"), ruta).bucket;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(ruta)}?alt=media&token=prueba`;
}

async function sembrarArchivoEvidencia(ruta, uid = null) {
  await testEnv.withSecurityRulesDisabled(contexto => uploadBytes(
    ref(contexto.storage(), ruta), new Uint8Array([255, 216, 255]),
    { contentType: "image/jpeg", ...(uid ? { customMetadata: { creadoPorUid: uid } } : {}) }
  ));
}

test("cada rol operativo puede cargar y eliminar sus archivos mediante el servidor", async () => {
  for (const uid of ["tecnico-a", "supervisor-a", "jefe-a"]) {
    const datos = datosArchivoPrueba();
    const resultado = await archivoEnServidorPrueba(uid, "subir", datos);
    assert.equal((await getMetadata(ref(storageComo(uid), decodeURIComponent(new URL(resultado.url).pathname.split("/o/")[1])))).customMetadata.creadoPorUid, uid);
    const repetido = await archivoEnServidorPrueba(uid, "subir", datos);
    assert.equal(repetido.url, resultado.url);
    await assertFails(updateMetadata(ref(storageComo(uid), decodeURIComponent(new URL(resultado.url).pathname.split("/o/")[1])), { customMetadata: { creadoPorUid: uid } }));
    await assertFails(deleteObject(ref(storageComo(uid), decodeURIComponent(new URL(resultado.url).pathname.split("/o/")[1]))));
    await archivoEnServidorPrueba(uid, "eliminar", { otId: datos.otId, url: resultado.url });
  }
});

test("no permite subir sin autor ni atribuir una carga a otra cuenta", async () => {
  const archivo = ref(storageComo("tecnico-a"), "ots/ot-abierta-a/ingreso/item_0/suplantado.jpg");
  await assertFails(uploadBytes(archivo, new Uint8Array([255, 216, 255]), { contentType: "image/jpeg" }));
  await assertFails(uploadBytes(archivo, new Uint8Array([255, 216, 255]), { contentType: "image/jpeg", customMetadata: { creadoPorUid: "supervisor-a" } }));
});

test("ni otros trabajadores ni el jefe pueden borrar, reemplazar o reclamar un archivo ajeno", async () => {
  const ruta = "ots/ot-abierta-a/ingreso/item_0/autor-tecnico.jpg";
  await sembrarArchivoEvidencia(ruta, "tecnico-a");
  for (const uid of ["supervisor-a", "jefe-a"]) {
    const archivo = ref(storageComo(uid), ruta);
    await assertSucceeds(getBytes(archivo));
    await assert.rejects(archivoEnServidorPrueba(uid, "eliminar", { otId: "ot-abierta-a", url: urlEvidenciaPrueba(ruta) }));
    await assertFails(deleteObject(archivo));
    await assertFails(uploadBytes(archivo, new Uint8Array([255, 216, 255]), { contentType: "image/jpeg", customMetadata: { creadoPorUid: uid } }));
    await assertFails(updateMetadata(archivo, { customMetadata: { creadoPorUid: uid } }));
    await assertFails(updateMetadata(archivo, { customMetadata: { creadoPorUid: "tecnico-a", otroCampo: "cambio" } }));
  }
});

test("los archivos antiguos sin autor siguen legibles y no se pueden borrar ni reclamar", async () => {
  const ruta = "ots/ot-abierta-a/ingreso/item_0/antiguo.jpg";
  await sembrarArchivoEvidencia(ruta);
  for (const uid of ["tecnico-a", "supervisor-a", "jefe-a"]) {
    const archivo = ref(storageComo(uid), ruta);
    await assertSucceeds(getBytes(archivo));
    await assertFails(deleteObject(archivo));
    await assertFails(updateMetadata(archivo, { customMetadata: { creadoPorUid: uid } }));
    await assertFails(uploadBytes(archivo, new Uint8Array([255, 216, 255]), { contentType: "image/jpeg", customMetadata: { creadoPorUid: uid } }));
  }
});

test("ser propietario no elimina las restricciones de estado, empresa o sucursal", async () => {
  for (const [uid, otId] of [["taller-b", "ot-abierta-a"], ["taller-a2", "ot-abierta-a"], ["inactivo-a", "ot-abierta-a"], ["tecnico-a", "ot-cerrada-a"]]) {
    const ruta = `ots/${otId}/ingreso/item_0/${uid}.jpg`;
    await sembrarArchivoEvidencia(ruta, uid);
    await assertFails(deleteObject(ref(storageComo(uid), ruta)));
  }
});

const ubicacionesEvidencias = {
  ingreso: fotos => ({ ingreso: [{ item: "Ítem", fotos }] }),
  evaluacion: fotos => ({ evaluacion: [{ item: "Ítem", fotos }] }),
  overhaul: fotos => ({ overhaul: [{ item: "Ítem", fotos }] }),
  pruebasGeneral: fotos => ({ pruebas: { general: [{ fotos }] } }),
  pruebasMecanicas: fotos => ({ pruebas: { mecanico: [{ fotos }] } }),
  pruebasElectricas: fotos => ({ pruebas: { electrico: [{ fotos }] } }),
  despachoPreparacion: fotos => ({ despacho: { preparacion: fotos.map(url => ({ nombre: "Archivo", url })) } }),
  despachoFinal: fotos => ({ despacho: { final: fotos.map(url => ({ nombre: "Archivo", url })) } }),
  decisionEvaluacion: fotos => ({ decisionEvaluacion: { documentos: fotos.map(url => ({ url })) } }),
  decisionMantencion: fotos => ({ decisionMantencion: { documentos: fotos.map(url => ({ url })) } }),
  decisionPruebas: fotos => ({ decisionPruebas: { documentos: fotos.map(url => ({ url })) } }),
  decisionDespacho: fotos => ({ decisionDespacho: { documentos: fotos.map(url => ({ url })) } })
};

for (const [ubicacion, datos] of Object.entries(ubicacionesEvidencias)) {
  test(`${ubicacion}: protege el enlace ajeno dentro de la OT y permite administrar propios`, async () => {
    const rutaAjena = "ots/ot-abierta-a/ingreso/item_0/ajeno.jpg";
    const rutaPropia = "ots/ot-abierta-a/ingreso/item_0/propio.jpg";
    await sembrarArchivoEvidencia(rutaAjena, "supervisor-a");
    await sembrarArchivoEvidencia(rutaPropia, "jefe-a");
    const ajena = urlEvidenciaPrueba(rutaAjena);
    const propia = urlEvidenciaPrueba(rutaPropia);
    await testEnv.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "ots", "ot-abierta-a"), datos([ajena])));
    for (const uid of ["jefe-a", "tecnico-a"]) {
      await assert.rejects(autorizarComentariosEnPrueba(uid, "ot-abierta-a", datos([])));
      await assert.rejects(autorizarComentariosEnPrueba(uid, "ot-abierta-a", Object.fromEntries(Object.keys(datos([])).map(campo => [campo, null]))));
      await assertFails(updateDoc(doc(firestoreComo(uid), "ots", "ot-abierta-a"), { ...datos([]), etapasConActividad: marcasComentarios }));
    }
    for (const lista of [[ajena, propia], [ajena]]) {
      const cambios = { ...datos(lista), etapasConActividad: marcasComentarios };
      await autorizarComentariosEnPrueba("jefe-a", "ot-abierta-a", cambios);
      await assertSucceeds(updateDoc(doc(firestoreComo("jefe-a"), "ots", "ot-abierta-a"), cambios));
    }
  });
}

test("no autoriza adjuntar archivos de otra OT ni quitar un archivo antiguo sin autor", async () => {
  const ruta = "ots/ot-otra-sucursal-a/ingreso/item_0/propio.jpg";
  await sembrarArchivoEvidencia(ruta, "tecnico-a");
  await assert.rejects(autorizarComentariosEnPrueba("tecnico-a", "ot-abierta-a", ubicacionesEvidencias.ingreso([urlEvidenciaPrueba(ruta)])));
  const antiguo = urlEvidenciaPrueba("ots/ot-abierta-a/documentos/existente.txt");
  await testEnv.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "ots", "ot-abierta-a"), ubicacionesEvidencias.ingreso([antiguo])));
  await assert.rejects(autorizarComentariosEnPrueba("tecnico-a", "ot-abierta-a", ubicacionesEvidencias.ingreso([])));
  await autorizarComentariosEnPrueba("tecnico-a", "ot-abierta-a", ubicacionesEvidencias.ingreso([antiguo]));
});

for (const estado of ["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"]) {
  test(`${estado}: bloquea archivos propios de los tres roles y conserva descarga`, async () => {
    for (const uid of ["tecnico-a", "supervisor-a", "jefe-a"]) {
      const datos = datosArchivoPrueba();
      const resultado = await archivoEnServidorPrueba(uid, "subir", datos);
      await testEnv.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "empresas", "empresa-a"), { activa: true, suscripcion: { estado } }));
      await assertSucceeds(getBytes(ref(storageComo(uid), decodeURIComponent(new URL(resultado.url).pathname.split("/o/")[1]))));
      await assert.rejects(archivoEnServidorPrueba(uid, "subir", { ...datos, subidaId: randomUUID() }), { code: "failed-precondition" });
      await assert.rejects(archivoEnServidorPrueba(uid, "eliminar", { otId: datos.otId, url: resultado.url }), { code: "failed-precondition" });
      const existente = ref(storageComo(uid), decodeURIComponent(new URL(resultado.url).pathname.split("/o/")[1]));
      await assertFails(uploadBytes(existente, new Uint8Array([255,216,255]), { contentType: "image/jpeg", customMetadata: { creadoPorUid: uid } }));
      await assertFails(updateMetadata(existente, { customMetadata: { creadoPorUid: uid, alterado: "sí" } }));
      await assertFails(deleteObject(existente));
      await assertSucceeds(getBytes(existente));
      await testEnv.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "empresas", "empresa-a"), { activa: true, suscripcion: { estado: "activa" } }));
      await archivoEnServidorPrueba(uid, "eliminar", { otId: datos.otId, url: resultado.url });
    }
  });
}

test("activa=false bloquea archivos propios aunque la suscripción diga activa", async () => {
  const datos = datosArchivoPrueba();
  const resultado = await archivoEnServidorPrueba("tecnico-a", "subir", datos);
  await testEnv.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "empresas", "empresa-a"), { activa: false, suscripcion: { estado: "activa" } }));
  await assertSucceeds(getBytes(ref(storageComo("tecnico-a"), decodeURIComponent(new URL(resultado.url).pathname.split("/o/")[1]))));
  await assert.rejects(archivoEnServidorPrueba("tecnico-a", "subir", { ...datos, subidaId: randomUUID() }), { code: "failed-precondition" });
  await assert.rejects(archivoEnServidorPrueba("tecnico-a", "eliminar", { otId: datos.otId, url: resultado.url }), { code: "failed-precondition" });
});

const rutasCancelacion = [
  { uid: "admin-a", ruta: "empresas/empresa-a/informe/cancelacion.png", contentType: "image/png" },
  { uid: "super-admin", ruta: "empresas/empresa-a/informe/cancelacion-super.png", contentType: "image/png" },
  { uid: "admin-a", ruta: "empresas/empresa-a/plantillas/cancelacion.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { uid: "sheq-a", ruta: "empresas/empresa-a/sheq/persona/taller-a/cancelacion.pdf", contentType: "application/pdf" },
  { uid: "jefe-a", ruta: "empresas/empresa-a/inventario/sucursal-a/item-a/cancelacion.pdf", contentType: "application/pdf" }
];
for (const estado of ["cancelacion_solicitada", "periodo_exportacion", "pendiente_eliminacion", "cancelada"]) {
  test(`${estado}: protege también imagen de empresa, plantillas, SHEQ e inventario`, async () => {
    // Primero comprobar que las mismas acciones están autorizadas en activo.
    for (const caso of rutasCancelacion) {
      const archivo = ref(storageComo(caso.uid), caso.ruta);
      const bytes = caso.contentType === "image/png" ? Buffer.from([137,80,78,71,13,10,26,10]) : caso.contentType.includes("spreadsheet") ? Buffer.from([80,75,3,4,120,108,47]) : Buffer.from("%PDF-1.4");
      await archivoEnServidorPrueba(caso.uid, "subirEmpresa", { ruta: caso.ruta, contentType: caso.contentType, base64: bytes.toString("base64") });
      await assertSucceeds(getBytes(archivo));
    }
    await testEnv.withSecurityRulesDisabled(contexto => updateDoc(doc(contexto.firestore(), "empresas", "empresa-a"), { activa: true, suscripcion: { estado } }));
    for (const caso of rutasCancelacion) {
      const archivo = ref(storageComo(caso.uid), caso.ruta);
      await assertSucceeds(getBytes(archivo));
      await assertFails(uploadBytes(archivo, new Uint8Array([4,5,6]), { contentType: caso.contentType }));
      await assertFails(uploadBytes(ref(storageComo(caso.uid), caso.ruta + ".nuevo"), new Uint8Array([1,2,3]), { contentType: caso.contentType }));
      await assertFails(updateMetadata(archivo, { customMetadata: { comprobacion: "cancelada" } }));
      await assertFails(deleteObject(archivo));
    }
  });
}

test("el servidor conserva las restricciones de empresa, sucursal, rol y cuenta", async () => {
  for (const uid of ["taller-b", "taller-a2", "inactivo-a", "admin-a", "admin-sucursal-a", "super-admin", "planificador-a", "bodeguero-a", "sheq-a"]) {
    await assert.rejects(archivoEnServidorPrueba(uid, "subir", datosArchivoPrueba()));
  }
  await assert.rejects(archivoEnServidorPrueba("tecnico-a", "subir", { ...datosArchivoPrueba(), otId: "ot-cerrada-a" }), { code: "failed-precondition" });
});

test("el servidor rechaza archivos con formato inválido aunque se evite la interfaz", async () => {
  for (const tipo of ["text/plain", "image/gif", "image/svg+xml", "application/octet-stream", "image/jpeg"]) {
    await assert.rejects(archivoEnServidorPrueba("tecnico-a", "subir", datosArchivoPrueba(tipo, Buffer.from("contenido inválido"))), { code: "invalid-argument" });
  }
});

test("la cuota de empresa impide que dos cargas simultáneas ocupen el mismo espacio", async () => {
  await testEnv.withSecurityRulesDisabled(async contexto => {
    const db = contexto.firestore();
    await setDoc(doc(db, "empresas", "empresa-cuota"), { activa: true, storageCuotaVersion: 1, maxStorageGB: 10 / 1024 ** 3, storageUsadoBytes: 0, storageReservadoBytes: 0, storageArchivos: 0 });
    await setDoc(doc(db, "ots", "ot-cuota"), { empresaId: "empresa-cuota", sucursalId: "sucursal-a", cerrada: false, estado: "INGRESO" });
    for (const uid of ["tecnico-a", "jefe-a"]) await updateDoc(doc(db, "usuarios", uid), { empresaId: "empresa-cuota" });
  });
  const actores = ["tecnico-a", "jefe-a"];
  const resultados = await Promise.allSettled(actores.map(uid => archivoEnServidorPrueba(uid, "subir", { ...datosArchivoPrueba("image/jpeg", Buffer.from([255,216,255,0,0,0])), otId: "ot-cuota" })));
  assert.equal(resultados.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(resultados.find(r => r.status === "rejected").reason.code, "resource-exhausted");
  const db = firestoreComo("tecnico-a");
  const estado = (await getDoc(doc(db, "empresas", "empresa-cuota"))).data();
  assert.equal(estado.storageUsadoBytes, 6); assert.equal(estado.storageReservadoBytes, 0); assert.equal(estado.storageArchivos, 1);
  const indice = resultados.findIndex(r => r.status === "fulfilled");
  await archivoEnServidorPrueba(actores[indice], "eliminar", { otId: "ot-cuota", url: resultados[indice].value.url });
  assert.equal((await getDoc(doc(db, "empresas", "empresa-cuota"))).data().storageUsadoBytes, 0);
});

test("un administrador de empresa no puede alterar el contador ni sus reservas", async () => {
  const db = firestoreComo("admin-a");
  for (const cambios of [{ storageUsadoBytes: 0 }, { storageReservadoBytes: 0 }, { storageCuotaVersion: 1 }]) {
    // Elegir un valor diferente al inicial para comprobar realmente la prohibición.
    const clave = Object.keys(cambios)[0];
    await assertFails(updateDoc(doc(db, "empresas", "empresa-a"), { [clave]: 123 }));
  }
  await assertFails(setDoc(doc(db, "empresas/empresa-a/reservasAlmacenamiento/falsa"), { bytes: 0, estado: "confirmada" }));
});
