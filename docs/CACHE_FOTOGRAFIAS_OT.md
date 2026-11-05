# Reutilización de fotografías de OT

Desplegado con autorización el 4 de noviembre de 2026 (America/Santiago), únicamente `subirArchivoOT`. Verificación posterior: ACTIVE, actualización 2026-11-05T00:21:52Z (UTC). Evidencia local ignorada por Git: `tmp/deploy-cache-fotos-20261104.log` y `tmp/cache-fotos-funcion-verificada-20261104.json`.

La consulta HEAD del enlace de la foto de prueba devolvió HTTP 200, `Cache-Control: private, max-age=0`, 207.305 bytes y validadores ETag/Last-Modified. Vencimiento inmediato no implica descargar siempre todo el cuerpo: el navegador puede conservarlo y revalidarlo.

Se eligió `private, max-age=3600` para fotografías nuevas subidas mediante `subirArchivoOT`. Durante una hora el navegador puede reutilizar una respuesta fresca sin revalidarla. No se garantiza que todos los navegadores la conserven ni un ahorro fijo de transferencia. `private` impide reutilización por cachés compartidas; no es un cambio de permisos ni invalida los enlaces con token existentes.

La política se decide en el servidor después de validar el contenido; no se acepta del cliente. Los PDF mantienen su comportamiento y los demás consumidores de `subirConCuota` conservan sus opciones anteriores. No hay nuevos servicios, miniaturas, objetos duplicados ni cambios en cuota, autoría o reglas.

El cambio solo afecta nuevas cargas, no archivos ya almacenados. Los reintentos no modifican metadatos de archivos existentes. No se ejecutó una migración de objetos antiguos. Una foto que ya está en caché puede seguir mostrándose aunque se borre del servidor; vencer la hora obliga a revalidar, pero no garantiza borrar la copia local del dispositivo. No se modifica el comportamiento de eliminación del servidor.

Validación local: 217 pruebas unitarias aprobadas y comprobación de sintaxis de Functions correcta. Se probaron JPEG/PNG, política impuesta por servidor, autoría/cuota/reintentos, exclusión de PDF y conservación de metadatos existentes.

Validación real completada con una fotografía nueva subida por el usuario el 4 de noviembre de 2026 (America/Santiago): consulta HEAD HTTP 200, JPEG de 4.589 bytes, `Cache-Control: private, max-age=3600`, ETag y Last-Modified presentes. Se verificó la política entregada; no se midieron transferencias repetidas desde un navegador ni un ahorro monetario. No es necesario publicar la web para esta política del servidor; la optimización previa del tamaño de fotos y las mejoras de consultas siguen siendo cambios locales de la web pendientes de publicación.

Fuente: https://docs.cloud.google.com/storage/docs/caching
