import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const firebaseCli = resolve(
  projectRoot,
  "node_modules",
  "firebase-tools",
  "lib",
  "bin",
  "firebase.js",
);
const configDirectory = resolve(projectRoot, "tmp", "firebase-cli-config");

const targets = {
  rules: {
    emulators: "firestore,storage",
    command: "node --test tests/security-rules.test.mjs",
  },
  hosting: {
    emulators: "hosting",
    command: "node --test tests/hosting-smoke.test.mjs",
  },
};

const selected = targets[process.argv[2]];

if (!selected) {
  console.error("Uso: node scripts/run-emulator-tests.mjs <rules|hosting>");
  process.exit(1);
}

mkdirSync(configDirectory, { recursive: true });

const result = spawnSync(
  process.execPath,
  [
    firebaseCli,
    "emulators:exec",
    "--only",
    selected.emulators,
    "--project",
    // Un ID con prefijo demo mantiene las pruebas completamente locales y
    // evita que una sesión de Firebase pueda tocar recursos de producción.
    "demo-overtrack",
    selected.command,
  ],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      CI: "true",
      FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true",
      NO_UPDATE_NOTIFIER: "1",
      XDG_CONFIG_HOME: configDirectory,
    },
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
