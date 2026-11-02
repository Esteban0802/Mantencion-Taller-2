# Eliminación automática de evidencias del flujo

Desplegado en Firebase con autorización explícita del propietario.

Los comentarios retirados se eliminan de las listas guardadas en el documento de la OT mediante las operaciones actuales, que comprueban autoría y etapa editable. No se conserva copia del texto eliminado. Esto reduce el contenido del documento de Firestore; no afecta la cuota empresarial de archivos de Storage.

La función `limpiarEvidenciasOT` reacciona a actualizaciones confirmadas de `ots/{otId}`. Compara fotos, documentos, evidencias de decisión y archivos de preparación/final de despacho de las versiones anterior y posterior. Funciona con los flujos personalizados y anteriores. Retirar solo un comentario o modificar otros campos no genera tareas de Storage si no se retiró una evidencia.

Antes de borrar, reconsulta la OT y su copia de papelera. Conserva los archivos que todavía estén referenciados en cualquier actividad, decisión o copia de papelera. Solo procesa archivos del bucket de la aplicación dentro del prefijo exacto de esa OT; no elimina enlaces externos, archivos de otra OT ni Inventario. Si la OT completa se envía a papelera no se dispara esta limpieza de actualizaciones: su conservación sigue gestionada por la papelera.

La tarea por ruta se registra en `limpiezasEvidencias` con empresa, sucursal, OT, ruta y estado pendiente/completada, sin copiar el contenido del archivo ni los comentarios. Se registra la reserva antes de borrar para terminar de liberar la cuota aunque haya un fallo después de eliminar el objeto. Las ejecuciones duplicadas no descuentan cuota dos veces. Los archivos antiguos sin reserva siguen actualizándose mediante el disparador de eliminación de Storage.

Los eventos tienen reintentos habilitados. Un fallo permanente que agote la ventana de entrega deja la tarea pendiente para revisión; no se añadió revisión periódica ni se promete reintento ilimitado. La limpieza persiste sin el navegador abierto. La interfaz del flujo nuevo ya no depende de una segunda llamada del navegador para borrar Storage. Una URL de evidencia registrada para limpieza no puede volver a adjuntarse al flujo personalizado; se debe cargar un archivo nuevo.

La actualización del listado de actividad y el borrado físico de Storage son procesos separados. La cuota puede tardar en reflejarse mientras termina la limpieza. No se modificaron permisos de eliminación ni la protección de etapas completadas/OT cerradas. No se realizaron eliminaciones reales ni se publicó GitHub Pages.

Se desplegaron `limpiarEvidenciasOT` y `actualizarOTFlujoLibre` en `overtrack-42387`, región us-central1. Ambas funciones se confirmaron ACTIVE. Evidencia local: `tmp/deploy-limpieza-evidencias-20261102.log` y `tmp/functions-limpieza-evidencias-verificacion.json`. Validación previa: 194 pruebas unitarias aprobadas y comprobación de sintaxis del servidor y la interfaz. No se borraron archivos reales durante el despliegue. La interfaz está local; no se publicó GitHub Pages. Las copias administradas de respaldo mantienen su retención existente.
