# Despliegue autorizado — 29 de octubre de 2026

Proyecto: `overtrack-42387`. El usuario autorizó desplegar Functions, reglas e índices para habilitar la papelera desde la interfaz local.

## Resultado

- Despliegue de Functions completado correctamente en `us-central1`, con Node.js 22.
- `enviarOTPapelera` y `restaurarOTPapelera` verificadas remotamente en estado `ACTIVE`.
- Funciones compartidas actualizadas, incluidas validaciones de usuarios, cuota, exportación y eliminación de empresa, con las dependencias corregidas del servidor.
- Reglas de Firestore compiladas y publicadas correctamente. Se informó únicamente la advertencia de función auxiliar no utilizada `isWorkshopUser`.
- Índices y exenciones de `firestore.indexes.json` aceptados. El índice de `otsPapelera` se verificó remotamente en estado `READY`, después de finalizar su construcción.

## Alcance

No se ejecutó push, commit, despliegue de Hosting, publicación de GitHub Pages ni despliegue de reglas de Storage. No se realizaron eliminaciones ni restauraciones sobre datos de producción para verificar el despliegue. Las verificaciones remotas consultaron metadatos de Functions e índices.

La interfaz nueva puede probarse desde el servidor local, que se conecta al Firebase real. Las versiones antiguas de la interfaz que intenten borrar directamente una OT quedan bloqueadas por las reglas nuevas; deben actualizarse para utilizar la papelera.

## Verificación previa

122 pruebas unitarias aprobadas inmediatamente antes del despliegue y sintaxis de Functions correcta. En la implementación se aprobaron también 187 pruebas locales de reglas, dos pruebas integradas con emuladores y once comprobaciones de Hosting. Estas pruebas no equivalen a una sesión funcional con cuentas reales en producción.

Registros locales de ejecución en `tmp/deploy-functions-20261029.log`, `tmp/deploy-firestore-20261029.log` y `tmp/verify-indexes-20261029.log` (carpeta excluida de Git).
