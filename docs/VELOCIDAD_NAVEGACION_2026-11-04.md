# Primera mejora de velocidad de navegación

Cambios locales del 4 de noviembre de 2026, sin publicación en GitHub Pages ni Firebase. El usuario observa una espera corta al cambiar de módulo y una mayor espera en Programación.

## Esperas retiradas

- El panel inicia sus consultas cuando el DOM está disponible, sin esperar `window.load` y las imágenes. Conserva la lectura de empresa y las validaciones de acceso.
- Todas las OT inicia la escucha de la primera página en paralelo con el conteo. Un conteo lento o fallido no impide ver las tarjetas; un resultado tardío de un filtro anterior no reemplaza el total actual. La carga global finaliza al recibir las tarjetas o un error, no simplemente al registrar la escucha.
- Programación valida primero Auth y la habilitación de empresa. Después consulta usuarios, SHEQ, datos operativos y la semana en paralelo. Antes de construir selectores o mostrar la semana espera los datos auxiliares y conserva el manejo de errores. Los roles autorizados para borradores consultan semana, asignaciones y confirmaciones en paralelo; los trabajadores siguen consultando exclusivamente su copia publicada y no tienen un fallback a borradores.
- Inventario carga SheetJS al importar/exportar, en lugar de bloquear el acceso para consultar registros. Las llamadas simultáneas comparten una carga y se permiten reintentos tras error o tiempo excedido. La primera operación de Excel puede necesitar esperar esa descarga; las posteriores reutilizan la biblioteca durante esa página. No se cambiaron la importación incremental ni las reglas de Inventario.

La URL de Excel está declarada en el HTML: usa el origen existente en desarrollo y el proceso de producción la convierte a `vendor/xlsx.full.min.js`. Se comprobó el resultado de construcción con la ruta relativa compatible con el subdirectorio de GitHub Pages.

No se añadieron consultas periódicas, predescargas de módulos, cachés persistentes de datos de empresa ni servicios. SHEQ ya inicia sus colecciones en paralelo y no se modificó su carga. Se mantuvieron las verificaciones de sesión, cancelación y permisos.

## Verificación

- 226 pruebas unitarias aprobadas tras corregir también el caso de semana inexistente; las nuevas pruebas cubren orden de inicio, consultas simultáneas, espera de dependencias, bloqueo por empresa/errores, conteos lentos y obsoletos, carga única de Excel y reintentos.
- Las pruebas anteriores de Programación personal siguen pasando: usuario nuevo sin publicación, copia publicada y rechazo de permisos sin consulta de borradores.
- Se actualizó la prueba de navegación para exigir que los accesos se configuren antes de iniciar las consultas, sin imponer el antiguo `await` secuencial.
- Comprobación de sintaxis de módulos, `git diff --check` y construcción de producción aprobadas.

No se midieron tiempos reales de navegación en un navegador conectado ni se hizo una prueba visual de Excel. Las pruebas con promesas controladas demuestran que se retiraron dependencias artificiales, no un porcentaje específico de mejora. Pendiente de comparar Programación en la versión local con el mismo rol y semana, verificando también importación/exportación de Inventario.

La aplicación continúa usando páginas separadas: cada navegación vuelve a inicializar el módulo y consulta datos vigentes. No se promete navegación instantánea ni se omiten controles para simular rapidez.

## Corrección al validar Programación

El usuario informó un rechazo de permisos como planificador. Se verificó mediante una lectura remota que el registro de la semana 2026-11-02 de la empresa piloto no existe (404). Las reglas actuales evalúan el acceso con datos del documento: una lectura directa de una semana inexistente es denegada.

Se sustituyó la lectura directa por una consulta limitada a empresa y semana. Los roles de consulta agregan `estado == publicada`; los trabajadores mantienen la consulta a su copia personal. Si la semana no existe, se muestra vacía o pendiente según el rol, sin modificar reglas ni ampliar permisos. Se mantiene la carga paralela.

Se reprodujo el rechazo de la lectura directa y se validaron la consulta vacía y el aislamiento de borradores/empresa con emuladores: 199 pruebas de reglas aprobadas. Sintaxis y construcción de producción correctas. La web local usa `programacion.js?v=20261104-3`; no hubo despliegue.

## Archivos de la página de Programación

Se revisaron los recursos estáticos. `styles.css` pesa 106.129 bytes y `desktop-density.css` 23.622 bytes sin compresión de transporte. Eran los mismos archivos físicos solicitados con versiones distintas entre módulos: Programación usaba estilos sin versión y densidad `20261006-10`, mientras Taller usaba otras direcciones. Se unificaron ambas URLs a `20261104-1` en las diez páginas activas que los utilizan. No se modificó el contenido de esos estilos ni los respaldos HTML. El navegador puede reutilizar la misma entrada de caché según los encabezados del alojamiento; esto no garantiza ausencia de revalidaciones.

Programación incorpora precarga de su módulo principal y de `firebase-config.js`, además de preconexiones a `www.gstatic.com` y `firestore.googleapis.com`. Las precargas adelantan descarga/compilación, sin ejecutar consultas ni omitir validaciones. No se precargan otras pantallas ni sus datos. La URL del módulo precargado coincide exactamente con el script ejecutado, ahora `programacion.js?v=20261104-4`, para no solicitar dos versiones.

Se comprobaron las direcciones comunes en diez páginas, las referencias locales mediante la construcción de producción y las 226 pruebas unitarias. No se añadieron pruebas que solo reflejen estas etiquetas HTML. No se publicó ningún cambio. Falta medir en navegador con sesión iniciada; no se afirma una reducción en segundos o porcentaje. La comparación debe hacerse navegando normalmente después de una única recarga para obtener el HTML actualizado; forzar la recarga en cada intento evita evaluar la reutilización de caché.

Referencias: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/modulepreload y https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/preconnect

## Consulta inicial compartida con la sesión

La validación de sesión y la carga inicial de Taller, Órdenes, Programación, Inventario, SHEQ y Panel Empresa comparten la petición de empresa únicamente si está pendiente para la misma cuenta y empresa. Al terminar, incluso con error, se retira de memoria. No se conserva el resultado para futuras entradas ni se añaden consultas. La lectura del perfil de usuario sigue siendo independiente y vigente. Cerrar sesión limpia las peticiones compartidas.

Se unificaron las referencias al módulo de sesión y se actualizaron sus módulos padres para evitar cargar dos versiones. Programación usa ahora `programacion.js?v=20261104-5` tanto en la precarga como en el script principal.

Validación: 232 pruebas unitarias aprobadas, incluidas seis de lecturas simultáneas, separación entre cuentas y empresas, reintento tras error, lectura renovada de perfil, usuario inactivo, cambio de rol, contraseña obligatoria, cancelación de empresa y limpieza de sesión. Comprobación de funciones y construcción de producción aprobadas. No se cambiaron reglas ni se desplegó esta mejora. No se cuantifica ahorro de lecturas o tiempo: depende de la coincidencia de las peticiones y del comportamiento del SDK. El usuario confirmó una mejora importante con los ajustes anteriores de carga de página; falta validar esta última modificación navegando con sesión iniciada.
