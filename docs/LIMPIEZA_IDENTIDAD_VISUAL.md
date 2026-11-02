# Reemplazo de logo y portada

Desplegado en Firebase con autorización explícita del propietario.

Al guardar un logo o portada nuevo, la referencia nueva se guarda primero. Las funciones `limpiarIdentidadEmpresa` y `limpiarIdentidadSucursal` reaccionan al cambio confirmado en Firestore y eliminan las imágenes anteriores que ya no están en uso. Restablecer la identidad de sucursal también elimina las imágenes propias anteriores. No hay revisión periódica adicional para esta limpieza.

La interfaz informa que la configuración se guardó y que la limpieza se procesa automáticamente; no afirma que el borrado de Storage haya finalizado. La limpieza continúa sin mantener el navegador abierto. Eventos duplicados no descuentan cuota dos veces. La tarea de cada ruta se conserva en `limpiezasIdentidad`, con estados pendiente/completada y error si falla. La reserva de cuota se guarda antes de eliminar el objeto para poder terminar el descuento en un reintento incluso si el archivo ya no existe. Para archivos antiguos sin reserva se conserva la contabilización por evento de Storage existente.

Se habilitan reintentos de eventos de Firebase. Si la entrega agota su período de reintento, la tarea pendiente queda registrada para revisión; no se garantiza recuperación ilimitada ante un fallo permanente. No se añadió una tarea periódica para esas incidencias ni un visor de tareas pendientes.

Solo se aceptan rutas directas de la carpeta `informe` de la empresa/sucursal del evento. Se reconsulta la identidad vigente para no procesar rutas antiguas que volvieron a estar en uso. Una imagen general referenciada explícitamente por una sucursal se conserva. Inventario y sus eliminaciones no se modifican.

La actualización normal de colores y los cambios sin reemplazo de imagen no consultan Storage. Los disparadores de empresa y sucursal se invocan también ante actualizaciones de otros campos, pero retornan sin trabajo de limpieza si no cambian las rutas del logo o portada.

Se desplegaron únicamente `limpiarIdentidadEmpresa` y `limpiarIdentidadSucursal` en `overtrack-42387`; ambas se verificaron ACTIVE en us-central1. Firebase requirió confirmar la política de reintentos mediante `--force`; se mantuvo el alcance de esas dos funciones. Evidencia local: `tmp/deploy-identidad-limpieza-20261102.log` y `tmp/functions-identidad-limpieza-verificacion.json`. No se sustituyeron imágenes reales durante el despliegue. Los cambios de interfaz están locales; no se publicó GitHub Pages. Validación previa: 188 pruebas unitarias aprobadas, incluidas logo/portada en empresa y sucursal, cambio solo de logo, restablecimiento, rutas ajenas, imágenes compartidas, duplicados, liberación de cuota y fallo después del borrado.
