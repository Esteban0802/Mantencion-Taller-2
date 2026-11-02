# Auditoría: textos y enlaces de la interfaz

Revisión local del 28 de octubre de 2026 (punto 5).

- Usuarios, sucursales, datos de empresa y tarjetas de OT escapan los datos al construir HTML. Firestore y los formularios conservan el texto original.
- Los identificadores de botones administrativos se codifican como cadenas de JavaScript y atributos HTML, conservando comillas y caracteres especiales.
- Las observaciones del panel se transmiten como datos del botón; su contenido ya no se incorpora al código del evento. El visor también muestra texto escapado.
- Los enlaces de documentos en flujo, Inventario y SHEQ, y las imágenes de configuración de empresa, aceptan HTTP y HTTPS. Se rechazan esquemas ejecutables.
- Los títulos del asistente se escapan; sus pasos conservan el HTML de interfaz definido por el código.
- Se corrigió una llamada inexistente en el panel que detenía la presentación de observaciones de corrección para técnicos.

Validación: 112 pruebas unitarias (8 nuevas sobre texto, atributos, botones, enlaces y observaciones), revisión de sintaxis de Functions, construcción de producción y 11 pruebas locales de Hosting aprobadas.

Esta revisión cubre las superficies modificadas; no sustituye futuras revisiones de otros usos de HTML ni las autorizaciones del servidor. No se modificaron reglas ni Functions y no se publicó ni desplegó esta entrega. Los encabezados comprobados corresponden al Hosting local; no acreditan la configuración de GitHub Pages.

Siguiente punto del listado: dependencias vulnerables. El control de costos de Firebase conserva prioridad alta para después de completar el listado.
