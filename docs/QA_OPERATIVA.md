# Matriz de validación operativa

Esta matriz define los casos mínimos que deben aprobarse antes de considerar terminado el flujo operativo.

## Roles

| Rol | Alcance esperado | Acciones operativas principales |
| --- | --- | --- |
| Administrador de empresa | Toda la empresa | Administrar usuarios, sucursales, configuración y plantillas. Supervisar todas las OT. |
| Administrador de sucursal | Solo su sucursal | Crear usuarios y OT de su sucursal; aprobar, rechazar y cerrar OT como Jefe de Taller. |
| Jefe de Taller | Solo su sucursal | Crear OT; aprobar o rechazar Evaluación y Pruebas; cerrar OT. |
| Técnico de taller | Solo su sucursal | Ver y trabajar cualquier OT de su sucursal; completar checklists, comentarios y evidencias. |

## Casos automáticos cubiertos

- Aislamiento entre empresas y sucursales.
- Acceso y actualización de OT según el rol.
- Protección de perfiles y campos sensibles.
- Aprobaciones y cierre según permisos.
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
- Aprobar Pruebas y cerrar la OT con Administrador de sucursal y con Jefe de Taller.
- Comprobar que un técnico no pueda aprobar, rechazar ni cerrar una OT.
- Comprobar que cada rol solo vea los usuarios y las OT de su alcance.
- Generar el PDF de una OT completa y de una OT con flujo reducido.

## Criterio de cierre

La funcionalidad operativa se considera terminada cuando todos los casos automáticos y manuales anteriores están aprobados sin errores bloqueantes.
