# Matriz de validación operativa

Esta matriz define los casos mínimos que deben aprobarse antes de considerar terminado el flujo operativo.

## Roles

| Rol | Alcance esperado | Acciones operativas principales |
| --- | --- | --- |
| Administrador de empresa | Toda la empresa | Administrar usuarios, sucursales, configuración y plantillas. Supervisar todas las OT. |
| Administrador de sucursal | Solo su sucursal | Administrar usuarios, configuración y plantillas de checklist de su sucursal. Puede supervisar las OT, pero no crearlas, aprobarlas ni cerrarlas. |
| Jefe de Taller | Solo su sucursal | Crear OT; modificar su identificación y las aprobaciones antes de que exista actividad; aprobar o rechazar las etapas configuradas; cerrar o eliminar OT; crear la Carta Gantt y registrar observaciones. |
| Supervisor | Solo su sucursal | Completar etapas; gestionar sus propios comentarios y evidencias; registrar el uso de repuestos y visualizar la Carta Gantt. |
| Técnico de taller | Solo su sucursal | Completar etapas; gestionar sus propios comentarios y evidencias; registrar el uso de repuestos y visualizar la Carta Gantt. |

La cuenta de superadministrador pertenece al dueño de la plataforma. No se elimina ni se modifica desde los paneles operativos del sistema.

## Casos automáticos cubiertos

- Aislamiento entre empresas y sucursales.
- Acceso y actualización de OT según el rol.
- Protección de perfiles y campos sensibles.
- Aprobaciones y cierre según permisos.
- Bloqueo de la configuración de aprobación cuando la etapa ya registra actividad.
- Inicio de un flujo completo.
- Inicio directo en la primera etapa activa de un flujo reducido.
- Rechazo de una etapa deshabilitada como etapa inicial.
- Cierre de una OT cuando Pruebas y Despacho están deshabilitados.
- Acceso a evidencias en Storage y control de cuota.

## Casos de interfaz pendientes de validación manual

- Crear una OT con todos los módulos activos y recorrerla hasta el cierre.
- Crear una OT con solo Ingreso, Evaluación y Mantención.
- Crear una OT cuya primera etapa activa sea Mantención.
- Confirmar que una etapa deshabilitada no aparezca en el indicador ni en la navegación.
- Rechazar Evaluación y comprobar que el técnico vea el motivo y pueda corregirla.
- Aprobar o rechazar cada etapa configurada y cerrar la OT exclusivamente con Jefe de Taller.
- Comprobar que Administrador de empresa, Administrador de sucursal, Supervisor y Técnico no puedan crear, aprobar, rechazar, cerrar ni eliminar una OT.
- Confirmar que solamente el Jefe de Taller pueda crear y modificar la Carta Gantt; Supervisor y Técnico deben tener acceso de solo lectura.
- Confirmar que Supervisor y Técnico puedan modificar o eliminar únicamente sus propios comentarios y evidencias.
- Confirmar que la plantilla correspondiente a la gama del equipo defina las etapas y actividades, sin mostrar cargas manuales de checklist en el flujo.
- Comprobar que cada rol solo vea los usuarios y las OT de su alcance.
- Generar el PDF de una OT completa y de una OT con flujo reducido.

## Criterio de cierre

La funcionalidad operativa se considera terminada cuando todos los casos automáticos y manuales anteriores están aprobados sin errores bloqueantes.
