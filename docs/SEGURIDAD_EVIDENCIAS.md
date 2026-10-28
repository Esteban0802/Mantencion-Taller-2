# Autoría de evidencias de las OT

Las nuevas cargas de archivos de OT guardan `creadoPorUid` en los metadatos de
Storage. Las cargas y eliminaciones se realizan mediante las callables del
servidor, que comprueban su coincidencia con el usuario autenticado. Las reglas
de Storage rechazan todas las escrituras directas de archivos de OT. Los
reintentos reutilizan un identificador de carga y no sobrescriben otro archivo.

Solo el propietario puede eliminar el archivo, manteniendo las
restricciones existentes de rol operativo, empresa, sucursal y OT abierta.
El jefe de taller tampoco puede borrar una evidencia cargada por otra persona.
La eliminación completa de una OT o empresa sigue siendo una operación distinta,
sujeta a sus permisos existentes.

## Enlaces dentro de la OT

La callable de validación de comentarios también valida las evidencias antes de
autorizar el guardado de las etapas. Comprueba los metadatos reales de Storage,
no una autoría indicada en el documento enviado por el navegador.

Se protegen las fotografías de Ingreso, Evaluación, Mantención y Pruebas, los
documentos de Despacho y los adjuntos de las decisiones de aprobación. Quitar un
ítem o sustituir una etapa completa no permite ocultar evidencias ajenas. Los
enlaces nuevos deben pertenecer al bucket de la aplicación, a la misma OT y al
usuario que realiza el guardado. Los permisos de aprobación siguen aplicándose.

La interfaz oculta los botones de eliminación de archivos ajenos y vuelve a
comprobar la autoría antes de quitar el enlace o solicitar el borrado físico.

## Archivos antiguos

Los archivos sin `creadoPorUid` conservan su acceso de lectura según el alcance
del usuario. No se permite borrarlos, reemplazarlos, quitar sus enlaces de la OT
ni atribuirles un autor desde el navegador. No se modificaron archivos reales ni
se asignaron autores por suposición. Una futura recuperación de autoría debe
basarse en evidencia verificable y realizarse por un proceso administrativo.

## Alcance y publicación

El bloqueo de escrituras durante la cancelación está documentado en
`SEGURIDAD_ARCHIVOS_CANCELACION.md`. La cuota del servidor y el visor están
documentados en `SEGURIDAD_CUOTA_ALMACENAMIENTO.md`.

Para activar el cambio hay que publicar coordinadamente Functions, las reglas
de Firestore, las reglas de Storage y la interfaz. Las pantallas abiertas deben
recargarse. No se realizó ningún despliegue como parte de esta implementación.
