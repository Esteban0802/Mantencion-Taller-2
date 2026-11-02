# Validación manual — 30 de octubre de 2026

Resultados reportados por el propietario durante las pruebas en pantalla. No se registran contraseñas ni correos personales.

| Caso | Resultado |
| --- | --- |
| Administrador de empresa abre Usuarios | Aprobado por el propietario |
| Administrador de empresa crea usuario y aparece en listado | Aprobado por el propietario |
| Primer acceso y cambio de contraseña temporal | Aprobado por el propietario |
| Usuario desactivado no puede ingresar | Aprobado mediante comparación con la reactivación posterior |
| Reactivación recupera acceso | Aprobado por el propietario |
| Administrador de sucursal crea usuario con sucursal y roles limitados | Aprobado por el propietario |
| Administrador de sucursal activa y desactiva al usuario creado | Aprobado por el propietario |
| Eliminación de ese usuario de prueba | Aprobado por el propietario |
| Autocuenta y cuentas administrativas sin opción de eliminar | Aprobado por el propietario |
| Programación personal del usuario nuevo | Aprobado por el propietario después de la corrección local |
| Jefe de Taller crea y abre PRUEBA VALIDACION | Aprobado por el propietario |
| Enviar OT de prueba a papelera y restaurarla | Aprobado por el propietario, con capturas antes y después |

## Incidencia de Programación personal

Se recibió `Missing or insufficient permissions` al entrar con el usuario nuevo. El código leía directamente un documento personal que podía no existir y, ante la denegación, intentaba leer la semana general, fuera del alcance del trabajador.

Corrección local: consultar `programacionPublicadaUsuarios` con empresa, usuario, estado publicado y semana, limitada a un resultado. La ausencia de publicación se representa como semana pendiente, sin consultar borradores. Los errores reales de permisos se conservan como errores; no se sustituyen por una lectura general.

Se añadió cobertura automática para semana vacía, publicación personal existente y rechazo real de permisos. La prueba de reglas incluye consultas vacías para Técnico y Supervisor, además del rechazo de publicaciones ajenas y borradores. Las reglas desplegadas no se modificaron para este arreglo.

Para repetir: recargar la interfaz local y abrir Programación con el mismo usuario. Si no existe una copia publicada para ese trabajador, debe aparecer “Todavía no tienes una programación publicada para esta semana”, sin error de permisos. Para visualizar asignaciones nuevas, el planificador debe incluir al usuario y publicar o actualizar la semana.

Validación de la corrección: 125 pruebas unitarias y 188 pruebas de reglas aprobadas; sintaxis y construcción de producción correctas. El propietario confirmó que funciona al repetir la prueba. La corrección permanece local, sin nuevo despliegue ni publicación.
