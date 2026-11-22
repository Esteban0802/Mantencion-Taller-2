# Controles de costos — 22 de noviembre de 2026

Despliegue autorizado completado el 22 de noviembre de 2026. Se verificaron mediante las API de Google Cloud las 35 funciones activas, sus límites y los tres horarios programados. Las cargas conservan 512 MiB, 120 segundos y concurrencia uno. Pasaron las 237 pruebas unitarias y la revisión de sintaxis; la construcción de producción también fue satisfactoria. Código y documentación pendientes de subir a GitHub.

## Configuración técnica

- Respaldo global: mínimo cero instancias, máximo cinco y memoria de 256 MiB. Cada función puede mantener su configuración específica; no es un límite agregado del proyecto.
- Las operaciones invocables generales conservan máximo diez instancias y 60 segundos. Las cargas conservan 512 MiB, 120 segundos y concurrencia uno. Exportaciones, eliminación de empresas y otras operaciones pesadas conservan sus límites particulares.
- Limpieza de exportaciones: diaria a las 03:15 de Chile, máximo una instancia y concurrencia uno. Listado de Storage por páginas de 100 objetos. Solo elimina exportaciones identificadas como temporales y vencidas.
- Papelera: conserva revisión cada 120 horas, lotes de 50 y las condiciones existentes de retención y aviso.
- Conciliación: conserva revisión cada hora y páginas de 100 reservas pendientes antiguas. Máximo una instancia y concurrencia uno. Pasarla a diaria demoraría la liberación de reservas de cargas fallidas y podría bloquear nuevas cargas por cuota durante horas.
- Las limpiezas comparan rutas anteriores y actuales antes de consultar o borrar archivos. No se agrega una condición basada solo en el estado de la OT, porque impediría limpiar evidencias retiradas sin cambio de etapa. La contabilidad de Storage registra el identificador del evento en una transacción para no contar dos veces una entrega repetida.

Las páginas limitan memoria y tamaño de cada lectura, pero no el consumo total de un recorrido completo. Máximo de instancias uno tampoco sustituye un bloqueo distribuido o la idempotencia frente a tareas repetidas. No se reducen los tiempos de borrado pesado a 30 segundos porque podría dejar trabajo incompleto.

## Finanzas y abuso

El presupuesto de 10.000 CLP y los avisos se confirmaron anteriormente por el propietario; no se modificó la consola en esta revisión. Un presupuesto de solo alertas no detiene el gasto. Las cuotas de CPU y el máximo de instancias limitan capacidad y pueden rechazar peticiones, pero no equivalen a un tope monetario de todos los servicios.

App Check continúa pendiente del dominio definitivo y su validación previa en modo de observación. Reduce ciertos abusos; no elimina todos los ataques ni reemplaza la autenticación, los permisos o los límites de capacidad. No se activó su exigencia ni se cambiaron cuotas financieras automáticamente.

Antes de escalar, medir solicitudes simultáneas, duración, errores 429 y memoria de cada función con volumen representativo. Ajustar límites por función a partir de esa medición, sin prometer ausencia total de sobrecostos o de efectos en el rendimiento.
