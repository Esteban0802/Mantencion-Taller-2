# Recuperación frente a eliminaciones — 29 de octubre de 2026

## Papelera de OT implementada localmente

En Todas las OT, el Jefe de Taller puede enviar una OT a la papelera y restaurar las OT de su propia sucursal. Ambas acciones requieren autenticación reciente y validación del rol, empresa y sucursal en el servidor. Una empresa en cancelación o una sucursal inactiva no permite mover ni restaurar órdenes.

La operación de servidor guarda en `otsPapelera/{otId}` la OT íntegra, su resumen, el responsable y la fecha. La creación de esa copia, la eliminación de los documentos activos y el registro de auditoría se confirman en una única transacción. Si falla la operación, no se elimina la OT sin copia. La restauración conserva identificador, fechas, autoría, evidencias y estado: una OT cerrada continúa cerrada. Si ya existe otra OT con el mismo identificador, no se sobrescribe.

Las reglas impiden que cualquier cliente borre directamente una OT o escriba en la papelera. Solo el Jefe de Taller de la misma sucursal puede leerla desde el cliente. La interfaz carga páginas de veinte registros al abrirla; no añade una escucha permanente.

## Archivos, cuota y conservación

- Los archivos originales permanecen en Storage; enviar a papelera no libera cuota ni duplica esos archivos.
- El cálculo inicial y la identificación de archivos antiguos incluyen las OT en papelera. El uso ya contabilizado sigue registrado.
- La exportación de empresa incluye los registros completos de papelera en `indices/otsPapelera.json` y sus archivos en `papelera_OT/`.
- La eliminación definitiva de una empresa incluye esta colección y los prefijos de archivos de sus OT archivadas, bajo los requisitos existentes de autorización y cancelación.
- Se activó conservación mínima de 15 días y aviso previo mínimo de 3 días, con revisión cada 5 días y avisos actualizados por revisión, según la política descrita abajo.
- El índice de consulta queda definido en `firestore.indexes.json`. Los mapas de copia no se indexan: no se consultan por sus campos internos y se evita duplicar sus índices. [Documentación de exenciones de índices](https://firebase.google.com/docs/firestore/query-data/index-overview).

Una copia muy próxima al límite de tamaño de documento podría no caber junto con sus metadatos y resumen. Firestore rechazará la transacción completa y la OT original permanecerá intacta. No se convierte ese error en una eliminación definitiva.

## Límites y pendientes de recuperación

### Eliminación manual definitiva — 1 de noviembre de 2026

Botón «Eliminar definitivamente» junto a «Restaurar OT». Solo el Jefe de Taller activo de la misma empresa y sucursal puede ejecutarlo, con confirmación explícita y autenticación reciente. El inventario se conserva.

La callable `eliminarOTPapelera` bloquea primero la restauración, elimina exclusivamente `ots/{otId}/`, libera las reservas de cuota y retira la copia al finalizar. Un fallo conserva el registro bloqueado y permite reintentar; no permite restaurar una copia con archivos parcialmente eliminados. Los archivos antiguos sin reserva actualizan el consumo mediante el evento de eliminación de Storage. Se conserva auditoría y una referencia mínima de empresa/sucursal en `otsEliminadas` para atribuir eventos tardíos y evitar reutilizar identificadores eliminados. No se conserva allí el contenido de la OT. Los respaldos administrados de Firebase mantienen su propia retención.

Con autorización explícita del propietario se desplegaron `eliminarOTPapelera`, `restaurarOTPapelera`, `crearOTFlujoLibre`, `contabilizarArchivoEliminado` y reglas de Firestore en `overtrack-42387`. El despliegue terminó correctamente y la consulta posterior confirmó las cuatro funciones en estado ACTIVE. Evidencia local: `tmp/deploy-papelera-definitiva-20261101.log` y `tmp/functions-papelera-definitiva-verificacion.json`. Verificación previa: 179 pruebas unitarias y 197 de permisos aprobadas. No se borraron OT reales durante el despliegue. La interfaz está disponible localmente; no se publicó en GitHub Pages.

### Conservación de 15 días y aviso previo — activación autorizada

El propietario eligió 15 días desde `eliminadoEn` y posteriormente revisiones cada 5 días para reducir ejecuciones. La tarea usa `every 120 hours` con zona UTC (intervalo continuo, sin reiniciar en cada mes). Consulta las OT con al menos 10 días en papelera, registra `avisoEliminacionEn` una sola vez y elimina solo al cumplirse tanto los 15 días de conservación como 3 días completos desde ese aviso. En operación normal el borrado ocurre en la primera revisión posterior al vencimiento, entre los 15 y casi 20 días. Las OT antiguas o afectadas por una pausa de la tarea reciben el período de aviso completo y pueden conservarse por más tiempo. Formato de intervalos: https://docs.cloud.google.com/scheduler/docs/configuring/cron-job-schedules#alternative_job_format

El Jefe de Taller ve avisos individuales en «Todas las OT» cuando la revisión programada registra `avisoEliminacionEn` (hasta 20 avisos por consulta). Esto ocurre en la primera revisión con al menos 10 días de antigüedad, no automáticamente al llegar al día 10 en el navegador. El mensaje no tiene un contador que cambie a diario: muestra aviso registrado, conservación mínima, `ultimaRevisionPapeleraEn` y `proximaRevisionPapeleraEn` prevista. Se actualiza en las revisiones cada 5 días. Si el borrado falla, el registro conserva las fechas de revisión y muestra el plazo cumplido para reintentar; no promete una ejecución exacta. Antes del primer aviso la tarjeta de papelera solo informa de la conservación mínima.

Son avisos dentro del sistema: no se envían correos ni notificaciones fuera del navegador, ni se exige que el usuario haya leído el aviso para ejecutar la eliminación. La página obtiene el último aviso al entrar o recargar y después de restaurar o eliminar una OT. La restauración retira la copia de papelera y cancela su eliminación; si se vuelve a archivar, el plazo empieza de nuevo.

La tarea `limpiarPapeleraOT` usa páginas de 50 registros y reutiliza el borrado probado de archivos/cuota. Revalida fecha y aviso dentro de la transacción que bloquea la restauración, conserva inventario, registra auditoría como sistema y no elimina de empresas canceladas o sucursales inactivas. Los fallos conservan el registro para reintento. Registros sin fecha válida se conservan. No modifica retenciones de respaldos.

Con autorización explícita se desplegaron `limpiarPapeleraOT` y el índice `empresaId/sucursalId/avisoEliminacionEn` de `otsPapelera`. Se verificó la función ACTIVE y la tarea ENABLED, `every 120 hours`, zona UTC. Primera ejecución prevista: `2026-11-07T01:33:00Z` (6 de noviembre, 22:33 en Santiago). No se ejecutó manualmente la limpieza ni se borraron OT durante el despliegue. Evidencia: `tmp/deploy-papelera-5dias-20261101.log`, `tmp/functions-papelera-5dias-verificacion.json` y `tmp/papelera-5dias-verificacion.json`. La interfaz local ya incluye los avisos; no se publicó GitHub Pages. Pruebas locales: 184 unitarias aprobadas, incluidas fechas de revisión, mensaje estable entre revisiones, vencimientos desfasados, aviso completo para OT antiguas y reintentos.

### Otros pendientes

La verificación posterior confirmó el índice de avisos en estado READY; la consulta de la interfaz ya dispone del índice requerido.

- La papelera protege futuras eliminaciones mediante esta versión. No recupera OT borradas antes de su activación.
- La eliminación de cuentas de usuario sigue siendo definitiva. Para suspender acceso conservando la cuenta se utiliza Desactivar; esta entrega no promete restaurar contraseñas, sesiones ni cuentas eliminadas.
- No se añadió papelera general para documentos SHEQ, Inventario, sucursales ni archivos eliminados individualmente.
- La consulta remota posterior del 29 de octubre confirmó PITR de 7 días y respaldos diarios con retención de 14 días ya existentes. Siguen pendientes el simulacro de restauración y la verificación de recuperación de archivos de Storage. Esta entrega no habilitó esos servicios ni modificó su configuración; ver `REVISION_PRODUCCION_2026-10-29.md`.
- Esta papelera comparte la base de datos operativa: no sustituye un respaldo independiente.

## Activación

El 29 de octubre de 2026 se desplegaron, con autorización, Functions (`enviarOTPapelera`, `restaurarOTPapelera` y cambios de cuota/exportación), reglas e índices de Firestore en `overtrack-42387`. La interfaz permanece local: no se publicó GitHub Pages. Las versiones anteriores de la interfaz que intenten borrar directamente una OT reciben una denegación con las reglas nuevas. El estado final del despliegue se registra en `DESPLIEGUE_2026-10-29.md`.

El alcance local completado es recuperación de OT. La recuperación general ante pérdida de base de datos y otros borrados sigue pendiente de las medidas de producción anteriores.

## Verificación local

- 122 pruebas unitarias aprobadas, incluida la transacción simulada, conflictos, fallos, permisos, cancelación, restauración de órdenes cerradas y representación segura de la papelera.
- 187 pruebas de reglas aprobadas: se deniega el borrado directo incluso al Jefe de Taller y se protege la colección de papelera.
- Dos pruebas integradas aprobadas con Auth, Functions, Firestore y Storage locales: restauración completa y cuota de archivos archivados, además de la suite existente de cargas de hasta 20 MB.
- Construcción de producción, sintaxis de Functions y revisión del diff correctas; 11 pruebas locales de Hosting aprobadas.
- Las pruebas locales utilizaron Node 24; el proyecto declara Node 22 para CI y Firebase. No se probó con datos ni cuentas de producción.
