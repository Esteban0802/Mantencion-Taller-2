# Cuota de almacenamiento de empresa

## Alcance

Las cargas de evidencias de OT, imágenes de empresa, plantillas, inventario y
SHEQ pasan por el servidor. Storage rechaza escrituras directas del navegador.
Se conservan los permisos por rol, autoría, sucursal, empresa y cancelación.
Las exportaciones temporales de respaldo mantienen su tratamiento separado y
no consumen esta cuota operativa.

## Reserva y contabilidad

Antes de escribir un archivo se reserva su tamaño mediante una transacción de
Firestore. Se evalúa la suma de `storageUsadoBytes`, `storageReservadoBytes` y
el archivo nuevo frente a `maxStorageGB`. Como en la validación anterior del
cliente, se rechaza una carga que alcance o exceda el límite. Un límite cero
conserva la interpretación existente de límite no definido.

Las cargas simultáneas compiten por el mismo documento de empresa. No pueden
reservar dos veces el mismo espacio. Las reservas, identificadas por la ruta del
archivo, guardan UID, hash y tamaño; los reintentos deben coincidir.

Al confirmar una carga, los bytes reservados pasan a utilizados y se incrementa
el número de archivos. Al eliminar un archivo gestionado, el espacio se libera.
El servidor y los eventos de Storage usan la misma transición de reserva para
no contar dos veces, incluso con eventos repetidos o recibidos fuera de orden.
Los archivos antiguos conservan su contabilidad por eventos de Storage.

Si una carga falla y se confirma que el archivo no existe, se libera la reserva.
Si Storage no permite conocer el resultado, se conserva por seguridad. Una
función programada cada hora revisa reservas de más de diez minutos: confirma
el archivo existente o libera el espacio de una carga que no se materializó.
Las reservas finalizadas se mantienen como registros de idempotencia.

## Medición inicial de empresas existentes

Las empresas nuevas creadas por el backend comienzan con contadores vacíos y
`storageCuotaVersion=1`.

Para una empresa anterior a este cambio, el administrador debe entrar a
Configuración y pulsar **Medir uso real y habilitar cargas**. Se cuentan sus
archivos existentes sin modificar su contenido. Hasta completar la medición,
las nuevas cargas se rechazan para no asumir que un contador antiguo representa
el uso real. La lectura y las descargas se conservan.

La medición inicial se protege contra ejecuciones simultáneas. Los eventos
anteriores a ella no vuelven a incrementar o descontar los archivos ya incluidos
en el recuento. Una vez inicializada, la contabilidad se mantiene automáticamente;
el endpoint anterior de recálculo devuelve los contadores actuales sin sustituir
una medición mientras hay cargas en curso.

## Visor

El panel principal de empresa y Configuración muestran el mismo componente:

- utilizado y contratado;
- porcentaje ocupado y espacio disponible;
- espacio de cargas pendientes;
- avisos a partir del 80 %, 90 % y al alcanzar el límite.

La barra incluye el espacio reservado. El porcentaje textual conserva un posible
exceso si se reduce el plan por debajo del uso existente. Si falta la medición
inicial, aparece **Medición pendiente**, en lugar de un cero engañoso.

Un listener de Firestore actualiza únicamente el visor y los datos de cuota;
no vuelve a dibujar los formularios ni borra campos que el usuario esté editando.
La cuota es compartida por todas las sucursales de la empresa.

## Comprobaciones y activación

Se prueban concurrencia, cuota anterior, reservas, errores, liberación de espacio,
idempotencia, roles y presentación del visor. La prueba de callables usa los
emuladores completos para verificar cargas de 20 MB, rechazo por cuota, medición
de una empresa anterior y contadores coherentes tras eliminar archivos.

Se requiere publicar coordinadamente Functions, Firestore, Storage y Hosting,
incluida la función de conciliación de reservas, y recargar las pantallas abiertas.
Después se debe realizar la medición inicial de cada empresa anterior. Esta
implementación local no configura ni modifica datos de producción.
