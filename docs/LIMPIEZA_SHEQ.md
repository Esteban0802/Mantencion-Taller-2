# Eliminaciones y almacenamiento SHEQ

Desplegado con autorización explícita del propietario: `limpiarArchivosDocumentoSheq` y `limpiarArchivosVehiculoSheq`.

Al eliminar un documento completo se retira su registro de Firestore, incluidas observaciones y versiones históricas. El servidor procesa sus rutas de archivo actual e históricos y libera las reservas de cuota al eliminarlos de Storage. La interfaz informa de la retirada del registro y del procesamiento automático de los archivos; no afirma que Storage haya terminado.

Al retirar un archivo histórico se vacían sus referencias en el historial, conservando los datos de auditoría que ya conservaba SHEQ. El cambio confirmado dispara su limpieza en servidor. Actualizar un documento y conservar una versión anterior sigue preservando ese archivo: no equivale a eliminar la versión. Las observaciones modificadas pertenecen a las versiones existentes; editar o vaciar la observación actual no borra automáticamente el historial de observaciones. Eliminar el documento completo sí retira el registro con todo su historial.

Al eliminar un vehículo, el flujo existente retira documentos y asociaciones. El nuevo servidor limpia también la carpeta del vehículo para no depender del navegador. Guarda el listado de rutas antes de comenzar para poder completar un reintento aunque algunos archivos ya desaparecieran. No borra los documentos de otras entidades ni las faenas al quitar una asociación.

Las rutas deben pertenecer exclusivamente a `empresas/{empresaId}/sheq/persona/{id}/{archivo}` o su equivalente de vehículo. Se reconsultan los documentos de la misma empresa y se conservan archivos referenciados por otro documento o historial. No se modificó Inventario, ni se ampliaron los permisos de SHEQ. Archivos externos y rutas ajenas se ignoran.

Las tareas quedan en `limpiezasSheq` y el listado del vehículo en `limpiezasVehiculosSheq`, con estado pendiente/completada y sin copiar textos de observaciones o contenido de archivos. Una reserva guardada antes del borrado permite terminar de liberar cuota tras una respuesta interrumpida. Eventos repetidos no descuentan espacio dos veces. Para archivos antiguos sin reserva se utiliza el disparador existente de Storage.

Se habilitan reintentos de eventos: la limpieza continúa al cerrar el navegador, dentro de la ventana de reentrega de Firebase. Agotada esa ventana por fallos permanentes, se conserva la tarea pendiente para revisión; no hay una tarea periódica adicional. Las actualizaciones sin retirada de archivos no consultan Storage. La cuota puede tardar en reflejarse mientras finaliza la limpieza. Las retenciones de respaldos no se modifican.

Se desplegaron únicamente las dos funciones indicadas en `overtrack-42387`, región us-central1, y ambas se verificaron ACTIVE. Evidencia local: `tmp/deploy-limpieza-sheq-20261102.log` y `tmp/functions-limpieza-sheq-verificacion.json`. Validación previa: 200 pruebas unitarias aprobadas, incluidas archivos actuales/históricos, conservación de versiones, referencias compartidas, rutas ajenas, reintento tras borrado, cuota idempotente, carpeta de vehículo y actualización de observaciones sin borrar archivos. No se borraron documentos o archivos reales durante el despliegue. Interfaz local con mensaje de procesamiento; no se publicó GitHub Pages.
