# Revisión de preparación para producción — 29 de octubre de 2026

Punto 9 del listado de auditoría. Proyecto revisado: `overtrack-42387`. Se conservaron todos los cambios locales y las consultas a Firebase fueron de solo lectura. No se habilitaron servicios ni se alteraron respaldos, restricciones, dominios, facturación o datos de usuarios.

## Comprobado en Firebase

| Control | Estado verificado | Acción restante |
| --- | --- | --- |
| Functions de papelera | `ACTIVE`, Node.js 22, `us-central1`, verificadas en el despliegue anterior | Prueba funcional con cuenta real autorizada |
| Reglas e índice de papelera | Publicados; índice `READY`, según registro de despliegue | Publicar la interfaz actualizada cuando se autorice |
| Firestore PITR | Habilitado; retención `604800s` (7 días) | Realizar y documentar simulacro de recuperación |
| Respaldo diario | Una programación con retención `1209600s` (14 días) | Decidir si ampliar a 30 días, considerando costo |
| Copias disponibles | 14 respaldos listados, todos `READY`; más reciente del 29 de octubre | Verificar una restauración en base de ensayo |
| Respaldo semanal | No hay programación semanal en la respuesta consultada | Evaluar objetivo de 14 semanas y autorizar configuración |
| Protección de eliminación de base | `DELETE_PROTECTION_DISABLED` | Evaluar activación antes de la apertura general |

La existencia de copias no demuestra que el procedimiento de restauración haya sido probado. Los respaldos programados se revisan conforme a la [documentación de Firestore](https://firebase.google.com/docs/firestore/backups).

Los objetivos de retención de los documentos anteriores se habían confundido con tareas no realizadas. Se actualizó `SEGURIDAD_PRODUCCION.md`, `PLAN_RECUPERACION.md` y `RECUPERACION_ELIMINACIONES.md` para distinguir la configuración existente de los cambios propuestos. Esta sesión no creó los respaldos encontrados.

## Corrección local de la publicación automática

Las pruebas de papelera importan `firebase-functions` y `firebase-admin` desde el código de Functions. Esas dependencias pertenecen a `functions/package.json`; no se instalan con el `npm ci` de la raíz. La máquina local las tenía instaladas y podía ocultar ese fallo de preparación en GitHub Actions.

Se ajustó `.github/workflows/pages.yml` para:

1. Mantener Node.js 22 y usar ambos archivos de bloqueo en la caché.
2. Instalar las dependencias raíz y después las de Functions.
3. Comprobar la sintaxis de Functions antes de ejecutar las pruebas unitarias.
4. Conservar las pruebas de reglas y la construcción de `dist/` antes de publicar Pages.

No se añadió despliegue automático a Firebase. Este ajuste del workflow sigue local: no se ejecutó push ni una publicación de Pages en esta revisión.

## Controles pendientes o no comprobados

- **App Check:** no se encontró inicialización en el cliente ni obligatoriedad declarada en las callables. No se verificó la configuración remota de App Check. Preparar proveedor y dominio HTTPS utilizado, integrar el cliente, supervisar solicitudes y solo después exigirlo. No hace falta esperar al dominio definitivo para preparar el dominio actual de pruebas. [Guía oficial](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider).
- **Claves web y dominios autorizados:** la clave de Firebase del cliente es pública por diseño; no se trató como contraseña. No se verificaron ni modificaron las restricciones remotas de APIs, referentes o dominios de Authentication. Revisarlas antes de limitar orígenes, para no interrumpir el acceso local o Pages. [Guía de claves de Firebase](https://firebase.google.com/docs/projects/api-keys).
- **Storage:** no se consultó la política de recuperación, soft delete, versionado o conservación del bucket. No asumir que las copias de Firestore incluyen los archivos.
- **Pruebas de operación:** falta completar la matriz manual por rol de `QA_OPERATIVA.md`, incluido el recorrido de una OT y la restauración desde la pantalla real. Las pruebas automáticas se ejecutan con emuladores.
- **Programación:** sigue pendiente comprobar las copias personales publicadas y retirar la compatibilidad transitoria solo después de validar la migración.
- **Publicación:** esta sesión no actualizó Pages. Hay que publicar la interfaz preparada para que otros usuarios utilicen la papelera; las versiones antiguas no pueden borrar directamente las OT con las reglas nuevas.
- **Dependencias:** persisten cinco avisos moderados en herramientas locales, documentados en `SEGURIDAD_DEPENDENCIAS.md`; no se repitió la consulta de npm en este punto.
- **Costos:** mantiene prioridad alta y el orden acordado, después de completar el listado actual. No se configuraron presupuestos ni alertas durante esta revisión.

## Validación de la corrección local

- Workflow analizado como YAML válido, con instalación de Functions antes de las pruebas.
- `npm run check:functions` correcto.
- 122 pruebas unitarias aprobadas.
- `npm ci --prefix functions --dry-run --ignore-scripts --offline --no-audit` confirmó la coherencia del archivo de bloqueo.
- Revisión del diff sin errores de formato.

Validación local con Node 24; Node 22 sigue declarado para CI. El workflow corregido no se ha ejecutado aún en GitHub. No se modificaron reglas ni lógica de aplicación en este punto, por lo que no se repitieron las pruebas de reglas e integración ya aprobadas para el despliegue anterior.

La revisión no declara el sistema listo para apertura general: deja identificados los controles anteriores. El siguiente punto del listado es completar pruebas y documentación; después corresponde atender el control de costos de Firebase con alta prioridad.
