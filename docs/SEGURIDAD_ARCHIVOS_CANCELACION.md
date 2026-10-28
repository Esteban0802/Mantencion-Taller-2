# Archivos durante la cancelación de una empresa

## Comportamiento

Una empresa con `activa=false`, o con cualquiera de estos estados en
`suscripcion.estado`, no puede cargar, reemplazar, modificar metadatos ni
eliminar archivos desde la aplicación:

- `cancelacion_solicitada`
- `periodo_exportacion`
- `pendiente_eliminacion`
- `cancelada`

La lectura y descarga conservan los permisos de rol, empresa y sucursal. No se
desactiva la cuenta por cancelar la empresa. El borrado administrativo completo
de una empresa, tras su periodo de exportación, mantiene su procedimiento
independiente y sus autorizaciones existentes.

## Archivos de OT

Firebase permite como máximo dos consultas a Firestore al evaluar una petición
de Storage. Las comprobaciones de usuario, OT y empresa requieren tres
documentos. Por ello se rechazan todas las escrituras directas en `ots/**` y se
utilizan las callables `subirArchivoOT` y `eliminarArchivoOT`.

El servidor comprueba cuenta activa, rol operativo, empresa, sucursal, OT abierta
y estado actual de la empresa. La eliminación también comprueba el propietario
real del archivo. Las descargas siguen usando Storage y sus reglas de lectura.

La carga acepta imágenes permitidas y PDF de hasta 20 MB. El contenido se
transfiere en base64 y se verifica su firma en el servidor. Un identificador de
carga, una precondición de creación y el hash del contenido hacen seguros los
reintentos sin sobrescribir archivos ajenos ni duplicar la misma solicitud.
La callable utiliza 512 MiB y una solicitud concurrente por instancia para
acotar el uso de memoria. Se configura un tiempo máximo de 120 segundos tanto
en el servidor como en el cliente.

Se relee el estado antes de guardar y después de la carga. Si la empresa se
cancela durante la carga, se intenta retirar únicamente el archivo recién
creado y la operación se rechaza. Una operación ya autorizada y completada
antes de la cancelación conserva sus datos.

## Otros archivos de la empresa

Las callables comprueban tanto `activa` como `suscripcion.estado` para imágenes de
empresa, plantillas, SHEQ e inventario. Storage rechaza las escrituras directas.
El bloqueo también alcanza las
modificaciones de imagen hechas por el superadministrador. La lectura se
conserva con su alcance habitual.

## Verificación y publicación

- `npm run test:unit`: incluye las pruebas del servicio y los límites de archivo.
- `npm run test:rules`: comprueba lectura, bloqueo y reactivación usando usuarios
  propietarios, archivos válidos y comparaciones con la empresa activa.
- `npm run test:archivos`: prueba las callables reales con Authentication,
  Functions, Firestore y Storage emulados, incluida una carga completa de 20 MB.
  Requiere las dependencias de `functions` instaladas. Solo admite proyectos demo.

La publicación debe coordinar Functions, reglas de Firestore, reglas de Storage
y Hosting, y recargar las pantallas abiertas. Las versiones antiguas que
intenten escribir directamente en Storage serán rechazadas. La implementación
local no modifica ningún entorno publicado. El control de cuota está descrito
en `SEGURIDAD_CUOTA_ALMACENAMIENTO.md`.

Fuentes técnicas:

- [Límite de consultas de las reglas de Storage](https://firebase.google.com/docs/rules/rules-behavior).
- [Límite de solicitudes HTTP de Functions de segunda generación](https://firebase.google.com/docs/functions/quotas).
