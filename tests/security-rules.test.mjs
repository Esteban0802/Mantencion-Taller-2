import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";

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
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  deleteObject,
  getBytes,
  ref,
  uploadBytes,
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

function firestoreComo(uid, authTime = Math.floor(Date.now() / 1000)) {
  return testEnv.authenticatedContext(uid, { auth_time: authTime }).firestore();
}

function storageComo(uid) {
  return testEnv.authenticatedContext(uid).storage();
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
    ]) {
      await setDoc(doc(db, "usuarios", usuario.uid), usuario);
    }

    await setDoc(doc(db, "empresas", "empresa-a"), {
      nombre: "Empresa A",
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
  await assertSucceeds(
    updateDoc(doc(db, "ots", "ot-abierta-a"), {
      ingreso: [{ item: "Recepción", ok: true }],
      etapasConActividad: { evaluacion: false, mantencion: false, pruebas: false, despacho: false },
    }),
  );
});

test("Técnico puede registrar trabajo de una etapa y la deja iniciada", async () => {
  const db = firestoreComo("tecnico-a");
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
  const archivoNuevo = ref(storage, "empresas/empresa-a/sheq/vehiculo/vehiculo-a/soap.pdf");
  await assertSucceeds(uploadBytes(
    archivoNuevo,
    new TextEncoder().encode("soap"),
    { contentType: "application/pdf" },
  ));
  await assertSucceeds(deleteObject(archivoNuevo));
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
      { contentType: "text/plain" },
    ),
  );
});

test("Supervisor no puede subir GIF como evidencia", async () => {
  const storage = storageComo("supervisor-a");
  await assertFails(uploadBytes(
    ref(storage, "ots/ot-abierta-a/ingreso/item_0/evidencia-supervisor.gif"),
    new Uint8Array([71, 73, 70]),
    { contentType: "image/gif" },
  ));
});

test("Supervisor puede subir una foto HEIC tomada desde un móvil", async () => {
  const storage = storageComo("supervisor-a");
  await assertSucceeds(uploadBytes(
    ref(storage, "ots/ot-abierta-a/ingreso/item_0/evidencia-supervisor.heic"),
    new Uint8Array([0, 0, 0, 24]),
    { contentType: "image/heic" },
  ));
});

test("Técnico puede subir una foto AVIF tomada desde un móvil", async () => {
  const storage = storageComo("tecnico-a");
  await assertSucceeds(uploadBytes(
    ref(storage, "ots/ot-abierta-a/ingreso/item_0/evidencia-tecnico.avif"),
    new Uint8Array([0, 0, 0, 24]),
    { contentType: "image/avif" },
  ));
});

test("Técnico no puede subir SVG como evidencia", async () => {
  const storage = storageComo("tecnico-a");
  await assertFails(uploadBytes(
    ref(storage, "ots/ot-abierta-a/ingreso/item_0/evidencia-tecnico.svg"),
    new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    { contentType: "image/svg+xml" },
  ));
});

test("Técnico puede subir evidencia JPEG a una OT abierta de su sucursal", async () => {
  const storage = storageComo("tecnico-a");
  await assertSucceeds(uploadBytes(
    ref(storage, "ots/ot-abierta-a/ingreso/item_0/evidencia-tecnico.jpg"),
    new Uint8Array([255, 216, 255]),
    { contentType: "image/jpeg" },
  ));
});

test("Técnico puede subir un PDF como evidencia de una OT abierta", async () => {
  const storage = storageComo("tecnico-a");
  await assertSucceeds(uploadBytes(
    ref(storage, "ots/ot-abierta-a/ingreso/item_0/evidencia-tecnico.pdf"),
    new TextEncoder().encode("%PDF-1.4"),
    { contentType: "application/pdf" },
  ));
});

test("Técnico puede subir evidencia a una OT antigua sin campo cerrada", async () => {
  const storage = storageComo("tecnico-a");
  await assertSucceeds(uploadBytes(
    ref(storage, "ots/ot-antigua-sin-cierre/ingreso/item_0/evidencia-antigua.jpg"),
    new Uint8Array([255, 216, 255]),
    { contentType: "image/jpeg" },
  ));
});

test("durante cancelación se pueden descargar archivos, pero no subir ni eliminar", async () => {
  await ponerEmpresaEnPeriodoDeExportacion();
  const storage = storageComo("admin-a");
  const existente = ref(storage, "ots/ot-abierta-a/documentos/existente.txt");
  await assertSucceeds(getBytes(existente));
  await assertFails(uploadBytes(
    ref(storage, "ots/ot-abierta-a/documentos/nuevo-cancelacion.txt"),
    new TextEncoder().encode("contenido"),
    { contentType: "text/plain" },
  ));
  await assertFails(deleteObject(existente));
});

test("Taller no puede subir un archivo ejecutable a una OT", async () => {
  const storage = storageComo("taller-a");
  await assertFails(
    uploadBytes(
      ref(storage, "ots/ot-abierta-a/documentos/programa.exe"),
      new Uint8Array([77, 90]),
      { contentType: "application/x-msdownload" },
    ),
  );
});

test("Taller no puede subir archivos a una OT cerrada", async () => {
  const storage = storageComo("taller-a");
  await assertFails(
    uploadBytes(
      ref(storage, "ots/ot-cerrada-a/documentos/nuevo.txt"),
      new TextEncoder().encode("contenido"),
      { contentType: "text/plain" },
    ),
  );
});

test("Taller no puede borrar archivos de una OT cerrada", async () => {
  const storage = storageComo("taller-a");
  await assertFails(
    deleteObject(ref(storage, "ots/ot-cerrada-a/documentos/inexistente.txt")),
  );
});
