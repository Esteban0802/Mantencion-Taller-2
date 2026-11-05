# Optimización de la conciliación de cargas

Activada en Firebase con autorización del usuario el 3 de noviembre de 2026 (America/Santiago). Verificación posterior: función ACTIVE, índice READY y tarea ENABLED cada 60 minutos. Se desplegó primero el índice y después únicamente `conciliarReservasAlmacenamiento`; no se ejecutaron conciliaciones manuales sobre datos reales.

La tarea `conciliarReservasAlmacenamiento` conserva su revisión cada 60 minutos, máximo una instancia y espera mínima de 10 minutos para una reserva. Sustituye el recorrido de todas las empresas y sus subcolecciones por una consulta de grupo con `estado == reservada` y `creadaEn <= corte`, paginada en bloques de 100. Se requiere el índice de grupo `reservasAlmacenamiento: estado/creadaEn`.

Cuando no hay pendientes antiguos, solo realiza la consulta de Firestore y no consulta objetos de Storage. No carga empresas ni reservas recientes/confirmadas/eliminadas para filtrarlas en memoria. Las consultas vacías siguen consumiendo al menos una lectura, y la invocación/arranque sigue consumiendo cómputo: la mejora no elimina todos los costos de una tarea horaria ni permite prometer un ahorro monetario sin medición posterior.

Cada resultado valida su ubicación `empresas/{empresaId}/reservasAlmacenamiento/{id}`, empresa registrada y fecha. El archivo existente se confirma si su metadata coincide con la reserva y empresa. Un 404 o metadata ajena libera esa reserva, sin borrar el archivo. Un fallo de red o permiso mantiene la reserva para la siguiente revisión y registra el error.

La actualización usa `soloPendiente`, verificado dentro de la transacción: si otro evento confirmó o eliminó la reserva mientras se consultaba Storage, la tarea no revierte ese cambio ni vuelve a descontar cuota. Los consumidores existentes de `actualizarReserva` mantienen su comportamiento predeterminado.

Validación local: comprobación de sintaxis, 204 pruebas unitarias aprobadas, incluyendo filtro de antigüedad/estado, consulta vacía, confirmación, archivo faltante, error desconocido, confirmación concurrente, repetición idempotente, más de 100 pendientes y rechazo de colecciones ajenas. No se cambiaron reglas ni permisos, ni se modificó Inventario.

Activación propuesta con autorización: publicar primero el índice de Firestore y verificar READY; después desplegar únicamente `conciliarReservasAlmacenamiento`. La nueva opción de cuota viaja en el paquete de esa función; no requiere redesplegar las demás funciones porque no cambió su comportamiento predeterminado. Verificar la tarea ENABLED cada 60 minutos y observar sus próximas ejecuciones. No ejecutar conciliaciones manuales sobre datos reales como parte de la validación sin necesidad.
