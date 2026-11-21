# Auditoría de dependencias — 28 de octubre de 2026

## Resultado local

| Ámbito | Antes | Después |
| --- | --- | --- |
| Proyecto completo, incluidas herramientas | 26 avisos: 15 altos y 11 moderados | 5 moderados, sin altos ni críticos |
| Dependencias de producción del proyecto (`npm audit --omit=dev`) | No medido por separado antes | 0 avisos |
| Cloud Functions | 2 avisos: 1 alto y 1 moderado | 0 avisos |

Los números corresponden al registro npm consultado en esta fecha. No equivalen a una garantía de ausencia de fallos y no incluyen automáticamente los módulos Firebase importados desde gstatic por el navegador.

## Correcciones

- Actualizaciones compatibles registradas en ambos `package-lock.json`. Se conservaron las modificaciones del punto anterior.
- Functions: `body-parser` 2.3.0 → 2.4.0 y `qs` 6.16.0 → 6.17.0. [Aviso de body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [aviso de qs](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw).
- Herramientas: Firebase CLI 15.34.2 y SDK de pruebas Firebase 12.19.0, además de dependencias indirectas corregidas.
- Se fijó `@grpc/grpc-js` 1.14.5 mediante un override limitado a `@firebase/firestore`, porque el rango de ese paquete retenía una versión afectada. Revisar si se puede retirar este override cuando Firebase declare una dependencia corregida. [Aviso y versiones corregidas](https://github.com/advisories/GHSA-m9gg-hp2v-232j).
- Las páginas fuente de Empresa, Inventario y Flujo ahora referencian las mismas versiones de Excel/PDF que el paquete construido: SheetJS 0.20.3, jsPDF 4.2.1 y AutoTable 5.0.9. El constructor sigue copiándolas a `vendor/`, evitando conservar las versiones antiguas en las pruebas directas del código fuente. [Corrección de jsPDF 4.2.1](https://github.com/parallax/jsPDF/security/advisories/GHSA-wfv2-pwc8-crg5).

## Pendientes moderados en herramientas

Los cinco avisos corresponden a dos dependencias y sus paquetes consumidores:

1. `@opentelemetry/core` 1.30.1, usada por `@google-cloud/pubsub` y Firebase CLI: asignación de memoria sin límite en propagación de Baggage. La corrección publicada exige la rama 2.8 o posterior. [Aviso](https://github.com/advisories/GHSA-8988-4f7v-96qf).
2. `uuid` 9.0.1, usada por `gaxios` y Firebase CLI: comprobación de límites del buffer en variantes v3/v5/v6. La corrección publicada exige 11.1.1 o posterior. [Aviso](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

No se fuerzan estas versiones mayores dentro de consumidores que declaran otras ramas. La reparación automática con `--force` propone retroceder Firebase CLI; no se aplicó. Seguimiento: actualizar la CLI cuando incorpore las correcciones o validar por separado la compatibilidad de sus consumidores. Estos paquetes no se copian al sitio público ni pertenecen al árbol de Functions. No declarar este punto completamente libre de avisos mientras sigan pendientes.

El SDK web Firebase 11.6.1 importado desde gstatic conserva una migración pendiente de evaluación. Su antigüedad, por sí sola, no prueba una vulnerabilidad aplicable. Debe revisarse y probarse por separado, con inicio de sesión, llamadas y archivos en navegador.

## Publicación

El 29 de octubre de 2026 se desplegaron las Functions con sus dependencias corregidas en `overtrack-42387`, con autorización. No se ejecutó push ni publicación de Pages; las dependencias de construcción siguen locales. El registro está en `DESPLIEGUE_2026-10-29.md`.

## Verificación

- 112 pruebas unitarias aprobadas y comprobación de sintaxis de Functions correcta.
- 182 pruebas de reglas y 11 pruebas de Hosting aprobadas con proyecto demo local.
- Prueba integrada de archivos aprobada: carga de hasta 20 MB, eliminaciones, cancelación y cuota mediante Functions y Storage emulados.
- Construcción de producción correcta y referencias de bibliotecas locales verificadas.
- Lectura y escritura de un Excel con caracteres especiales y creación de PDF con tabla correctas.
- Árbol de dependencias válido e instalación reproducible comprobada con `npm ci --dry-run --ignore-scripts --offline --no-audit`.
- Ejecución local con Node 24.18.0. El proyecto y CI declaran Node 22; la comprobación en ese entorno queda a cargo de CI al publicar de forma autorizada.

## Revisión del 31 de octubre: lector de plantillas antiguas

Se añadió SheetJS `xlsx` 0.20.3 a Functions desde la misma distribución ya usada en la interfaz. `npm audit --omit=dev` no informa avisos para ese lector, pero la revisión actual sí detecta seis paquetes con avisos moderados en cadenas preexistentes: `archiver`/`readdir-glob`/`minimatch` y `google-gax`/`rimraf`/`glob`. No informa niveles altos ni críticos. Esto reemplaza la conclusión histórica de cero avisos de producción para la revisión actual; el registro es `tmp/audit-flujo-libre-functions.json`.

La instalación añadió un paquete y conservó las versiones anteriores de esas cadenas. No se ejecutó `audit fix --force` ni se retrocedió Archiver a la versión mayor anterior sugerida por npm. Queda pendiente resolver esos avisos mediante una actualización compatible y verificada dentro de la auditoría de dependencias.

## Revisión del 9 de noviembre de 2026

La auditoría del registro npm arrojó 0 paquetes señalados en las dependencias de producción de la web, 14 moderados en el árbol completo de la raíz y 6 moderados en el árbol de producción de Functions. En ambos árboles hubo 0 altos y 0 críticos. Los seis paquetes de Functions corresponden a dos avisos subyacentes, en `glob` y `minimatch`.

El SDK de Firebase 11.6.1 cargado desde CDN queda fuera del resultado de producción de npm. El repositorio oficial del SDK no mostraba avisos publicados al consultarlo. La actualización del SDK sigue siendo un trabajo separado que requiere probar autenticación, funciones y archivos en navegador.

Se conservan las versiones instaladas. npm propone retrocesos mayores para Firebase CLI y Archiver. Queda pendiente evaluar actualizaciones compatibles de las cadenas afectadas y probar las exportaciones ZIP antes de desplegar cambios en Functions. Resultados locales en `tmp/audit-web-prod-actual.json`, `tmp/audit-web-actual.json` y `tmp/audit-functions-actual.json`.

### Compatibilidad de las correcciones

- `archiver@8.0.0` declara `readdir-glob` en la rama 3. La versión 4 incorpora `minimatch` corregido, pero queda fuera de ese rango. La exportación de Vectaria agrega entradas con `zip.append()` y no usa las funciones de búsqueda de Archiver.
- La cadena de Firestore pasa por `@google-cloud/firestore-api@0.2.0`, `google-gax@5.0.8` y `rimraf@5.0.10` hasta `glob@10.5.0`. La versión corregida de `glob` es 14.0.2. Incluso `@google-cloud/firestore@9.4.0` sigue declarando `@google-cloud/firestore-api` en la rama 0.2, que conserva `google-gax` en la rama 5.
- No se identificó una actualización dentro de los rangos declarados que cierre ambos avisos. Se conserva el árbol instalado y se mantienen los avisos moderados abiertos. Cuando exista una actualización compatible, repetir la auditoría y comprobar exportaciones ZIP y operaciones de Firestore.
