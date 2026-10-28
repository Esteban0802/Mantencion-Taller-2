# Autoría de comentarios de las OT

La protección se aplica a Ingreso, Evaluación, Mantención, Pruebas (general,
mecánicas y eléctricas) y los dos grupos de comentarios de Despacho.

## Comportamiento

- Jefes de taller, supervisores y técnicos pueden crear comentarios con su UID
  y rol, modificar los propios y eliminar los propios.
- Los comentarios ajenos deben conservarse, incluso si se elimina o reemplaza
  el ítem o la etapa que los contiene.
- Los comentarios antiguos sin UID se conservan, pero no se permite atribuirlos
  a otra persona ni eliminarlos individualmente desde el cliente.
- Un técnico o supervisor puede responder a una observación pendiente del jefe.
  Se registra `atendidoPorUid`; el texto y la autoría de la observación original
  se conservan. Una respuesta existente no se puede sobrescribir.
- Se mantienen las restricciones de empresa, sucursal, cuenta activa, OT
  abierta y los permisos independientes de aprobación y cierre.

## Validación

Los comentarios existentes están anidados en listas dentro de las etapas. Las
reglas de Firestore no pueden recorrer listas arbitrarias para comprobar cada
autor. La callable `validarComentariosOT` realiza esa comprobación en el
servidor, sin mover ni migrar los comentarios existentes.

El servidor conserva dos documentos de autorización por OT y usuario, bajo
`ots/{otId}/validacionesComentarios/{uid}/versiones`: el estado anterior y el
propuesto de las etapas. La autorización vence a los cinco minutos. El cliente
no puede leer ni escribir esos documentos.

Las reglas comparan los estados completos con la OT actual y el guardado
solicitado. Así, una autorización no permite cambiar el contenido propuesto,
usarla desde otro usuario ni sobrescribir una etapa modificada entretanto.
Los permisos existentes de las OT siguen evaluándose después de esta validación.

La creación inicial de una OT también valida sus etapas. Al responder a una
observación, el servidor calcula si quedan observaciones pendientes para
comprobar el cambio de `alertaJefe`.

Las autorizaciones se sobrescriben en cada validación; no constituyen un
historial. Su vencimiento impide utilizarlas, pero no elimina físicamente los
documentos. La eliminación completa de empresa ya utiliza borrado recursivo de
sus OT. La política de limpieza física de las autorizaciones expiradas debe
incluirse en la revisión de conservación de datos previa a producción.

Este mecanismo añade una llamada al servidor, lecturas y dos escrituras de
autorización al guardado. Las respuestas simultáneas o los guardados con datos
desactualizados pueden requerir recargar la OT; se rechazan antes que perder
comentarios ajenos.

## Verificación y publicación

`tests/comentarios-autoria.test.mjs` comprueba el validador y la autorización.
`tests/security-rules.test.mjs` comprueba guardados permitidos, escrituras
directas prohibidas, suplantación, autorizaciones vencidas, concurrencia,
creación de OT y respuestas al jefe contra los emuladores.

Se deben publicar coordinadamente Functions, las reglas de Firestore y la
interfaz. Publicar solo una parte puede impedir guardar OT. Los navegadores
abiertos deben recargar la aplicación. Esta implementación local no activa
ningún cambio en producción por sí sola.
