# Etapas de nombres libres — 31 de octubre de 2026

## Comportamiento

Cada hoja del Excel es una etapa. Se mantienen su nombre y el orden de las pestañas, sin exigir palabras como Ingreso, Evaluación o Despacho. Los textos de las celdas no vacías son las actividades, en orden de filas. Las nuevas plantillas guardan `flujoVersion: 2` y la lista `etapas`.

Al seleccionar la gama se consulta `obtenerPlantillaFlujoLibre`. Para plantillas antiguas, el servidor lee el Excel original de su propia sucursal y recupera incluso las hojas que el importador anterior hubiera ignorado. La lectura no modifica la plantilla. Si el original falta o no pertenece a la ubicación autorizada, se exige volver a cargarlo en lugar de inventar etapas.

Las aprobaciones muestran los nombres de todas las hojas. Al cambiar de gama o de versión se reconstruyen las opciones y se eliminan selecciones anteriores. Las respuestas tardías de otra gama no sustituyen la selección actual. La interfaz envía una huella de las etapas; si el archivo cambió antes de crear la OT, el servidor rechaza la creación y pide revisar de nuevo la plantilla.

## OT y seguridad

- `crearOTFlujoLibre` copia las etapas y actividades en `etapasPersonalizadas`, con sus aprobaciones y la huella de origen. El Jefe de Taller de la sucursal es el único que puede crearla. Reintentar una solicitud no crea duplicados ni resucita una orden enviada a papelera.
- `actualizarOTFlujoLibre` aplica acciones concretas; el navegador no puede reemplazar el documento ni elegir autores o completar etapas arbitrarias. Las reglas bloquean escrituras directas de OT y resúmenes de versión 2.
- Técnicos, supervisores y Jefe de Taller pueden trabajar únicamente en la etapa actual de su sucursal. Cada actividad debe estar marcada, tener evidencia disponible y un comentario para completar la etapa. Si se seleccionó aprobación, solo el Jefe de Taller puede completarla. Las etapas anteriores quedan protegidas y las futuras no se pueden adelantar.
- Los comentarios y las evidencias solo pueden ser retirados por su autor mientras la etapa está activa. Primero se desvincula la evidencia y luego se elimina su archivo. No se permite borrar desde Storage un archivo que todavía esté vinculado a una actividad, ni borrar archivos de etapas completadas. Se comprueba la existencia de evidencia al completar la etapa.
- Solo el Jefe de Taller puede cerrar la OT y únicamente después de completar o aprobar todas las etapas. La orden cerrada es de consulta. El administrador de empresa/sucursal conserva consulta según su alcance, sin acciones operativas.
- Se mantienen el bloqueo por empresa/sucursal inactiva o cancelación, y la cuota compartida mediante los servicios de archivos existentes. Las tres funciones nuevas tienen máximo dos instancias, concurrencia cuatro, sin instancias mínimas ni sondeos automáticos. El lector de Excel utiliza SheetJS 0.20.3, la misma versión de la interfaz.

El flujo libre es secuencial y utiliza actividades, evidencias, comentarios y aprobaciones genéricas. El nombre de una hoja no activa automáticamente las reglas especiales del flujo anterior (por ejemplo, la decisión de realizar o no Overhaul). No se migran las OT existentes ni se reemplaza su estructura histórica.

## Visualización y persistencia

La barra inicial sigue oculta antes de crear la OT. Después de crearla aparece la secuencia con sus nombres reales. La pantalla escucha el documento actualizado, conserva los borradores de comentario y permite consultar las etapas anteriores. El dashboard y el historial muestran el avance y el nombre de la etapa actual; los resúmenes se actualizan en la misma transacción de la OT. El PDF utiliza las etapas, actividades y evidencias del snapshot personalizado. El respaldo JSON, los archivos y la papelera conservan el documento completo.

Límites: Excel original de hasta 5 MB, entre 1 y 50 hojas, máximo 400 actividades por hoja y 2.000 por OT; cada actividad puede tener hasta 240 caracteres. Las hojas vacías se rechazan. El tamaño de los registros también se controla para no superar el límite documental de Firestore: se rechaza la operación antes de escribir y se conserva el estado anterior.

## Verificación y publicación

151 pruebas unitarias aprobadas, incluyendo nombres arbitrarios, siete etapas, lectura de un Excel antiguo, cambio de gama durante la lectura, cambio de versión, autoría, aprobaciones, cierre, PDF real y escape de nombres. 197 pruebas de reglas aprobadas, incluida protección de escrituras de flujos personalizados. 11 pruebas locales de Hosting aprobadas. La integración usa callables, Auth, Firestore y Storage emulados para leer un Excel antiguo, crear la OT, completar y aprobar etapas con evidencia, cerrar y restaurar desde papelera.

El código permanece local. Para activarlo se requiere autorización para publicar las funciones `obtenerPlantillaFlujoLibre`, `crearOTFlujoLibre`, `actualizarOTFlujoLibre`, `subirArchivoOT`, `eliminarArchivoOT` y `firestore.rules`. No se modificaron datos de producción ni se publicó Firebase o GitHub Pages durante esta implementación. Falta la comprobación manual en el navegador tras la activación.

Registros locales: `tmp/unit-flujo-libre.log`, `tmp/rules-flujo-libre.log`, `tmp/callables-flujo-libre.log`, `tmp/hosting-flujo-libre.log`, `tmp/build-flujo-libre.log`.

## Activación autorizada

El 31 de octubre de 2026 se publicó, con autorización expresa del propietario, exclusivamente `firestore.rules` y las cinco funciones indicadas arriba en `overtrack-42387`. Firebase confirmó la liberación de las reglas, la creación de las tres funciones nuevas y la actualización de las dos de archivos. La consulta remota posterior verificó las cinco en estado `ACTIVE`, Node.js 22, región `us-central1`. Las tres nuevas conservan máximo dos instancias y concurrencia cuatro; las de archivos mantienen sus límites anteriores (diez instancias, concurrencia uno).

Registros de activación: `tmp/deploy-flujo-libre-20261031.log` y `tmp/functions-flujo-libre-20261031.json`. No se desplegaron Hosting, Storage ni índices; no se realizó push ni se publicó GitHub Pages. No se crearon OT ni se modificaron datos de empresa de producción durante la verificación, que se limitó a publicación y estado remoto. La comprobación manual del flujo se realizará desde la interfaz local actualizada.

## Nueva OT sin datos heredados

Se retiraron el guardado y la recuperación automática del borrador de identificación. Al entrar a Nueva OT se vacían equipo, serie, gama, cliente, número de OT y aprobaciones; se retira únicamente el borrador local de ese usuario/empresa y sus marcadores de solicitudes anteriores. Los reintentos dentro de la misma pantalla mantienen su idempotencia, pero una entrada nueva no reutiliza la solicitud de otra máquina. Se desactiva el autocompletado de esos campos y se limpia también al restaurar una pantalla nueva desde la caché del navegador. La inicialización ocurre antes de las lecturas asíncronas para no borrar datos que el usuario ya esté escribiendo.

Si se abre una OT existente, la limpieza no se ejecuta y sus datos se cargan como antes. Validación: 152 pruebas unitarias y 11 de Hosting aprobadas; construcción correcta. Ajuste solo de interfaz local, sin nuevo despliegue de Firebase ni publicación de Pages. Registros: `tmp/unit-nueva-ot-vacia.log`, `tmp/hosting-nueva-ot-vacia.log`.

### Restauración visual del flujo — 2026-10-31
Se recuperó la presentación anterior para las etapas personalizadas: barra circular, tarjetas claras, avance por etapa, contadores de evidencias y comentarios, y botones originales. Se mantienen los nombres del checklist y las acciones y permisos del flujo. Cambio exclusivo de interfaz, sin despliegue.
Validación: 152 pruebas unitarias, 11 pruebas de Hosting local y compilación de producción correctas. Revisión visual con datos ficticios en escritorio y pantalla móvil.


### Decisiones de servicio — 2026-10-31
Cuadro de decisión del Jefe de Taller: comentario y respaldos obligatorios; aprobar continúa; rechazar permanece en la etapa salvo que se marque pasar a la última. Las intermedias se registran como omitidas por rechazo y la última queda pendiente, sin cierre automático. Los respaldos se conservan en la primera actividad y la decisión referencia sus enlaces. 155 pruebas unitarias correctas, incluida autorización, validación, rechazo con y sin salto y aprobación. Pendiente de desplegar actualizarOTFlujoLibre con autorización; no utilizar los nuevos botones contra la función anterior.


Despliegue autorizado completado: actualizarOTFlujoLibre en overtrack-42387 (us-central1), 2026-10-31. Firebase confirmó Successful update operation y Deploy complete. No se desplegaron otras funciones, reglas ni Hosting. Registro: tmp/deploy-decision-flujo-20261031.log.


### Operación tras la primera aprobación — 2026-10-31
Integración local de repuestos de inventario por OS y sucursal, y planificación Gantt por etapas reales del checklist. Se muestran en la etapa siguiente a la primera etapa configurada con aprobación, únicamente cuando se aprueba. Los usuarios de consulta no editan; el Gantt y la identificación solo los modifica el Jefe de Taller. El registro de repuestos requiere recepción en inventario y etapa activa. Identificación conserva plantilla y avance, guarda historial y bloquea cambio de OS con repuestos utilizados. Los registros existentes pueden cargar sus repuestos al abrir o actualizar Inventario. La planificación actual utiliza fechas de inicio y término por etapa personalizada.
Validación: 157 pruebas unitarias, 11 pruebas de Hosting local, compilación de producción y comprobaciones de sintaxis correctas. Pendiente autorización para desplegar únicamente actualizarOTFlujoLibre. No se publicaron cambios.


Despliegue autorizado completado de actualizarOTFlujoLibre para repuestos, Gantt e identificación: overtrack-42387, us-central1, 2026-10-31. Firebase confirmó actualización correcta. Registro: tmp/deploy-operacion-libre-20261031.log. No se desplegaron otras funciones, reglas ni Hosting.


Formulario Crear OT integrado: se reutiliza el nodo original #crear, sin duplicar campos ni perder sus eventos y selector de OS de Inventario. El guardado de identificación del flujo personalizado utiliza la función del servidor ya desplegada. La gama permanece protegida en registros existentes; las OT cerradas siguen en consulta. 157 pruebas unitarias y sintaxis correctas. Cambio local, sin despliegue.


### Ventanas de repuestos y Gantt — 2026-10-31
Los accesos Repuestos y Ver carta Gantt aparecen en la etapa siguiente a la primera etapa con aprobación, cuando la decisión es aprobada. Se sustituyen las tablas incrustadas por ventanas. Repuestos permite guardar uso y comentario por lote, con validación de recepción, sucursal, etapa y rol; conserva técnico y fecha y limpia ambos al desmarcar. Gantt ofrece fechas generales y por etapa, solicitud/espera/observaciones de repuestos, recepción estimada, distribución de actividades en días hábiles (lunes a viernes, sin calendario de feriados), avance desde checklist, colapsar etapas, zoom, Hoy, Excel y PDF. El PDF exporta el detalle tabular de planificación; Excel incluye metadatos y actividades. El Jefe de Taller edita; los demás consultan. Etapas completadas y OT cerradas permanecen protegidas.
Validación: 160 pruebas unitarias, 11 pruebas de Hosting, compilación de producción y sintaxis. Revisión visual de ambas ventanas con datos ficticios. Pendiente de autorización para desplegar actualizarOTFlujoLibre; todavía no se publicó este cambio.


Despliegue autorizado completado para las ventanas de operación: únicamente actualizarOTFlujoLibre en overtrack-42387, us-central1, 2026-10-31. Firebase confirmó actualización correcta y estado ACTIVE. Registro tmp/deploy-ventanas-operacion-20261031.log. No se desplegaron otras funciones, reglas ni Hosting.


Exportación Gantt PDF corregida: incluye gráfico vectorial de etapas principales, avance y espera de repuestos, escala de fechas, leyenda y paginación. 163 pruebas unitarias correctas, incluida generación real de PDF de varias páginas y verificación de barras; documento de prueba renderizado e inspeccionado. Cambio local sin despliegue.


2026-11-01: corregida navegación hacia la etapa actual al consultar etapas anteriores. Antes el estilo disabled se asignaba a etapas pendientes aunque fueran la etapa activa, impidiendo volver desde la barra. Ahora el estado visual coincide con el acceso permitido hasta la etapa actual; las etapas futuras continúan protegidas. Prueba de regresión de navegación en todos los roles: 166 pruebas unitarias correctas. Sin despliegue.


2026-11-01: corregido resumen del flujo personalizado para incluir Gantt compacta (fechas generales, solicitud, espera y recepción estimada). El panel de próximos despachos y Gantt del taller usa otsResumen y antes no recibía esos datos. Nueva acción sincronizarResumen repara registros existentes al abrirlos con un usuario operativo de la sucursal, sin modificar actividades ni revisión. Las siguientes actualizaciones mantienen el resumen automáticamente. 167 pruebas unitarias y sintaxis correctas. Pendiente autorización de despliegue de actualizarOTFlujoLibre; no desplegado todavía.


2026-11-01: desplegada con autorización únicamente actualizarOTFlujoLibre para sincronización de Gantt con otsResumen. Firebase confirmó actualización correcta y ACTIVE en us-central1. Registro tmp/deploy-resumen-gantt-20261101.log. Sin despliegue de otras funciones, reglas ni Hosting.


2026-11-01: respuesta del técnico a observaciones del jefe en OT del flujo anterior pasa a una operación específica de validarComentariosOT (accion responder). Ya no depende de reenviar y guardar toda la OT mediante otService. Valida rol técnico/supervisor, empresa/sucursal activa, OT abierta, referencia del comentario original y respuesta única. Actualiza respuesta y metadatos de forma atómica, conservando la observación; repetición idéntica es idempotente. Interfaz aplica cambios solo tras éxito y muestra errores sin dejar atención local falsa. 169 pruebas unitarias correctas. Pendiente de autorización para desplegar validarComentariosOT; reglas intactas.


2026-11-01: desplegada con autorización únicamente validarComentariosOT para la respuesta específica a observaciones del jefe. Firebase confirmó actualización correcta y ACTIVE en us-central1. Registro tmp/deploy-respuesta-observacion-20261101.log. No se desplegaron reglas, otras funciones ni Hosting.


2026-11-01: preparada validación de cierre del flujo personalizado contra recepción real de Inventario para repuestos vinculados. Bloquea pendientes y registros desvinculados; refresca recepción al cerrar para no conservar un estado obsoleto. El rechazo documentado con salto a última etapa conserva salida sin esperar repuestos. No se modificaron OT cerradas existentes. 171 pruebas unitarias y sintaxis correctas. Pendiente de autorización para desplegar actualizarOTFlujoLibre.


2026-11-01: desplegada con autorización únicamente actualizarOTFlujoLibre para validar recepción de repuestos al cerrar. Confirmada ACTIVE en us-central1. Registro tmp/deploy-cierre-repuestos-20261101.log. No se alteraron OT cerradas existentes, reglas ni Hosting.


2026-11-01: avance del flujo considera resueltas las etapas completadas, incluidas las omitidas por rechazo, sin alterar las actividades originales. Corrige discrepancia de barras por etapa al 100% y avance global al 75%. El recorrido resuelto muestra 100% incluso pendiente de cierre, conservando estado de OT abierta hasta cierre explícito. 172 pruebas unitarias correctas. Cambio de interfaz, sin despliegue.


2026-11-01: tarjetas del panel muestran recepción de repuestos separada del avance operacional: porcentaje, recibidos/total, alerta y bloqueo de cierre. Reutiliza escucha de Inventario y actualiza tarjetas ante recepción; claves por sucursal y OS evitan mezclar sucursales. Resumen versión 3 agrega servicioRechazado para preservar la excepción de salida por rechazo; se actualiza al abrir OT con usuario operativo. 173 pruebas unitarias correctas. Pendiente autorización para desplegar actualizarOTFlujoLibre; no desplegado.


2026-11-01: cierre incorpora prevalidación de servidor antes del diálogo de confirmación, mediante accion validarCierre. Usa las mismas comprobaciones de etapas y recepción real que el cierre definitivo, pero sin escribir ni incrementar revisión. El cierre vuelve a validar tras confirmar para cubrir cambios concurrentes. 173 pruebas unitarias y sintaxis correctas. Pendiente de autorización de despliegue junto con resumen de recepción.


2026-11-01: desplegada con autorización únicamente actualizarOTFlujoLibre con prevalidación del cierre y resumen versión 3 para alertas de recepción en tarjetas. Confirmada ACTIVE en us-central1. Registro tmp/deploy-prevalidacion-cierre-20261101.log. No se desplegaron otras funciones, reglas ni Hosting.


2026-11-01: preparado permiso de registrar uso/comentarios de repuestos mientras la OT aprobada siga abierta, incluso tras completar su etapa. Gantt y actividades completadas siguen protegidos. OT cerradas mantienen bloqueo de edición. 174 pruebas unitarias y sintaxis correctas. Pendiente de autorización para desplegar actualizarOTFlujoLibre.


2026-11-01: desplegada con autorización únicamente actualizarOTFlujoLibre para registrar repuestos en OT abierta tras completar etapas. Confirmada ACTIVE en us-central1. Registro tmp/deploy-uso-repuestos-20261101.log. Sin cambios en reglas ni Hosting.


2026-11-01: auditoría de Estado de Órdenes y Progreso Global. El gráfico de estados omitía las OT personalizadas abiertas porque usaba categorías fijas; ahora agrupa por nombre real de etapa y conserva estados heredados y cerradas. Progreso Global promedia el avance del trabajo de todas las OT filtradas, incluidas las cerradas, redondeado a dos decimales; recepción de repuestos sigue separada. Añadida aclaración al gráfico. Prueba del render real de Chart con etapas propias, rechazo, cierre, filtros, mezcla heredada y lista vacía. Sin despliegue.


Progreso de OT abiertas: se excluyen cerradas del promedio; Estado de Órdenes sigue incluyendo todos los estados del listado filtrado. Si no hay abiertas se oculta la barra y se muestra No hay OT abiertas. Pruebas incluyen mezcla de abiertas/cerradas, lista vacía, todas cerradas y reaparición de una OT abierta a 0%. 175 pruebas unitarias correctas. Cambio local sin despliegue.

