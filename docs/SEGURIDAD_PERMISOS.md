# Coherencia de permisos — 29 de octubre de 2026

## Correcciones del punto 7

- El catálogo de permisos de OT ahora coincide con las rutas protegidas: el superadministrador conserva la administración de empresas y usuarios, sin operación de OT. Bodega, SHEQ y roles desconocidos tampoco obtienen permisos de OT por tener un módulo contratado.
- Para los roles de sucursal, la consulta de OT requiere una sucursal asignada. El administrador de empresa conserva alcance de empresa. Un usuario debe tener `activo: true` para obtener permisos del catálogo.
- El administrador de empresa, el administrador de sucursal y el planificador consultan las OT sin cargar ni completar checklists. Solo Jefe de Taller crea OT; Jefe de Taller, Técnico y Supervisor realizan el trabajo permitido por el flujo. Estos permisos generales no sustituyen las validaciones de etapa, autoría y cierre.
- Los permisos informativos guardados en perfiles nuevos dejan de anunciar facultades de creación, aprobación o cierre que las reglas no conceden. Se retiró un generador antiguo de permisos de la interfaz que ya no se utilizaba. No se actualizaron perfiles existentes en Firebase: la autorización efectiva sigue dependiendo de rol y reglas, no de ese mapa informativo.
- Los botones de activar/desactivar usuarios respetan el mismo alcance que su administración: el administrador de sucursal solo actúa sobre usuarios no administrativos de su sucursal. Se bloquean su propia cuenta, otras sucursales, cuentas administrativas y cuentas suspendidas por sucursal. El manejador también comprueba el permiso antes de llamar al servidor.
- `cambiarEstadoUsuario` rechaza al administrador de sucursal que carece de sucursal asignada, incluso cuando el objetivo tampoco tiene sucursal. Se conservan las validaciones de empresa, roles protegidos, cupos y autenticación reciente del servidor.
- Firestore ahora comprueba los mismos estados de cancelación que Storage y las funciones. Aunque `activa` sea `true`, los estados `cancelacion_solicitada`, `periodo_exportacion`, `pendiente_eliminacion` y `cancelada` bloquean las escrituras sujetas a `companyOperational`. La lectura conserva sus permisos anteriores. Las acciones administrativas especiales del superadministrador conservan sus reglas explícitas.
- La interfaz deja de ofrecer creación de OT y trabajo de checklists en esos estados de cancelación.

## Pruebas

La suite unitaria incluye una matriz de roles, usuario inactivo o sin estado, empresa ajena, ausencia de sucursal y módulos deshabilitados; también ejecuta el manejador real de cambio de estado con servicios simulados y comprueba que los rechazos no escriban en Auth ni Firestore. La prueba de interfaz verifica los botones y las llamadas manuales bloqueadas.

Las nuevas pruebas de reglas comprueban consulta y rechazo de escrituras durante los cuatro estados de cancelación, incluidos datos de empresa, clientes, OT e Inventario.

Resultado local: 117 pruebas unitarias, 186 pruebas de reglas y 11 de Hosting aprobadas. La comprobación de sintaxis de Functions, la construcción de producción y la revisión de formato del diff finalizaron correctamente. No se realizaron pruebas con cuentas reales ni con datos de producción.

## Aplicación de los cambios

El 29 de octubre de 2026 se desplegaron, con autorización, Functions y reglas de Firestore en `overtrack-42387`, junto con los índices de papelera. La interfaz y los cambios del repositorio siguen locales, aún sin confirmar ni publicar en Pages. El estado del despliegue se registra en `DESPLIEGUE_2026-10-29.md`.

Esta revisión cubre los desajustes descritos; no constituye una certificación exhaustiva de toda la aplicación. Se conserva la migración transitoria de Programación y los pendientes de producción ya documentados. El siguiente punto de la auditoría es recuperación frente a eliminaciones; el control de costos de Firebase mantiene prioridad alta para después del listado.
