# Inventario: Taller y Servicio

Implementación del 22 de noviembre de 2026. Despliegue autorizado únicamente en Firebase completado ese día (hora de Chile): seis funciones activas, reglas de Firestore y Storage verificadas contra los archivos locales y dos índices listos. No se subieron cambios a GitHub ni se publicó GitHub Pages. La interfaz nueva permanece local.

Ampliación posterior autorizada y desplegada el 22 de noviembre de 2026 (hora de Chile): formulario de llegada e importación Excel para Bodeguero respaldados por `gestionarInventarioServicio`, verificada ACTIVE. Se actualizó únicamente esa función; conserva máximo 10 instancias, mínimo 0, memoria 256 MiB y tiempo máximo de 60 segundos. No se cambiaron reglas ni índices. La interfaz permanece local y la web continúa sin publicar.

## Alcance

Taller conserva sus registros, importación Excel, estados y vinculación con las OT. Servicio utiliza colecciones separadas (`inventarioServicio` e `inventarioServicioMovimientos`); sus repuestos no se incorporan al flujo de Taller. No se migran ni borran datos existentes.

Servicio permite preparar una OS con cliente, número de OS, equipo, serie y hasta 100 líneas de repuestos: NP, descripción y cantidad esperada. Las cantidades son unidades enteras. Al registrar la OS, el servidor guarda la fecha de ingreso al sistema.

Cada recepción registra fecha real de llegada, cantidad por línea, quién recibe, fecha de registro y entre 1 y 10 fotografías o PDF. Cada retiro registra cantidades, trabajador que retira, usuario que registra la entrega, fecha y respaldos. Se permiten varios movimientos parciales. Las fotografías siguen la optimización de imágenes y todos los archivos utilizan la cuota compartida de empresa.

Los saldos se actualizan mediante transacciones del servidor. No se puede recibir más de lo esperado ni retirar más de lo disponible. El identificador de cada movimiento permite reintentar solicitudes sin duplicar cantidades; ante una respuesta perdida se conserva el intento en la sesión del navegador. Los respaldos confirmados y movimientos no se pueden editar o eliminar desde el módulo. No se implementa papelera ni borrado operativo de Servicio.

Si una carga de varios archivos falla antes de enviarse el movimiento, se intenta retirar lo ya cargado; los errores de red pueden dejar archivos pendientes de conciliación manual. No se informa un movimiento como guardado hasta recibir la confirmación del servidor. El cierre de pestaña o navegador durante una carga puede interrumpirla; no hay una tarea nueva de eliminación automática de archivos huérfanos.

## Perfiles

- Jefe de Taller y Planificador preparan y corrigen la OS antes de su primera recepción. Después se conservan los datos para proteger el historial.
- Bodeguero puede crear OS de Servicio y registrar sus llegadas desde un único formulario: cliente, OS, equipo, serie, fecha real de recepción, quién recibe automáticamente, repuestos y evidencias. La OS se guarda antes de subir los archivos; si una carga falla queda pendiente la recepción, sin saldos ficticios. Puede corregir la OS antes de sus movimientos, y registrar recepciones y retiros. Selecciona para retiro un Técnico, Supervisor o Jefe de Taller activo de esa misma sucursal. No obtiene creación ni edición de repuestos en Taller.
- Administrador de sucursal consulta los registros de su sucursal. Administrador de empresa consulta sus sucursales mediante el selector.
- Técnico, Supervisor, SHEQ y Super Admin no obtienen acceso operativo a esta pestaña.

Las reglas impiden escrituras directas a órdenes, saldos y movimientos, y restringen la lectura a la empresa y sucursal autorizadas. La callable comprueba perfil, módulo, empresa, sucursal, cantidades y propiedad de las evidencias. La exportación completa de empresa y su eliminación incluyen las dos colecciones; el desglose de almacenamiento atribuye los archivos de Servicio a su sucursal.

## Pantalla

Pestañas Taller y Servicio dentro de Inventario. Servicio carga 20 OS por página, con búsqueda sobre los registros cargados y botón para actualizar. El detalle muestra esperados, recibidos, retirados, disponibles e historial paginado. Las imágenes utilizan visor dentro de la aplicación; los PDF se abren aparte.

En Servicio, Bodeguero dispone además de “Cargar Excel”: .xlsx/.xls de hasta 5 MB, 500 filas y 100 OS por importación. Puede elegir cualquier hoja y la fila de encabezados, asociar columnas y revisar una vista previa. Siete columnas obligatorias: cliente, OS, equipo, serie, NP, descripción y cantidad. Las cantidades numéricas usan el valor original de la celda para no confundir formatos de miles; los textos ambiguos se rechazan. Las referencias históricas de recepción, ingreso, quién recibió, retiro y quién retiró se conservan en “Origen Excel”, separadas del historial confirmado. La importación no crea recepciones ni retiros sin evidencia. Reimportar el mismo contenido con el mismo usuario utiliza identificadores estables; si una OS ya existe con otros datos se informa el conflicto y no se sobrescribe. Un lote puede completarse parcialmente por OS; el resultado muestra errores y permite reintentar sin duplicar lo ya guardado.

## Activación y validación

Antes de publicar la web, autorizar y desplegar los índices nuevos, las reglas de Firestore y Storage y las funciones `gestionarInventarioServicio`, `subirArchivoEmpresa`, `eliminarArchivoEmpresa`, `obtenerDesgloseAlmacenamiento`, `eliminarEmpresaCompleta` y `generarExportacionEmpresa`. Las dos últimas incluyen las nuevas colecciones en exportación y cancelación. Esperar índices listos y publicar después la web.

Prueba de aceptación: preparar una OS con tres unidades, recibirlas con evidencia, retirar dos para un técnico de la sucursal y comprobar una disponible y ambos movimientos. Repetir con retiros simultáneos y otra sucursal; comprobar que Taller no mezcla sus registros. Para correcciones de movimientos ya confirmados, definir un proceso de ajuste trazable antes de permitir borrados o cambios de saldos.

Validación local completada: 246 pruebas unitarias, 203 pruebas de reglas de Firestore y Storage, sintaxis de Functions y construcción de producción correctas. Ensayo de navegador con datos ficticios: creación de OS, recepción con varios PDF, pérdida simulada de respuesta y reintento sin duplicados, retiro parcial, responsables e historial, presentación móvil sin desbordamiento de página y regreso a Taller conservando sus registros. No se utilizaron datos ni funciones de producción durante ese ensayo.

Validación de la ampliación: 249 pruebas unitarias y 203 pruebas de seguridad correctas. Ensayo de navegador con creación y recepción desde Bodeguero, importación de un Excel real con encabezados en fila 3 y hoja de nombre distinto de 2026, varias OS, cantidades con formato de miles y reimportación sin duplicados; conserva las pruebas anteriores de retiros, evidencias, pérdida de respuesta, móvil y Taller. Construcción final de producción y comprobación de formato correctas. La ampliación del servidor se desplegó y verificó posteriormente con autorización; no se publicó la web ni se subieron cambios a GitHub.
