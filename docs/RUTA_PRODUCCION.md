# Ruta a producción de Vectaria

Revisión del 8 de noviembre de 2026. Esta lista reúne el estado de trabajo más reciente. Los documentos de auditoría anteriores conservan el contexto de cada cambio.

## Trabajo confirmado

- El propietario confirmó el recorrido principal de OT, incluidas aprobación, rechazo, repuestos y cierre, así como el envío a papelera y la restauración.
- Se validaron en pantalla la gestión de usuarios por sucursal y el acceso a la programación personal. Se recuperó la publicación histórica de Luis al actualizar esa semana.
- Se activaron la retención de papelera y los avisos previos. La prueba de restauración de una OT desde papelera y el simulacro de recuperación ante pérdida de datos son casos distintos.
- El propietario confirmó el presupuesto mensual de 10.000 CLP con alertas. Ya se aplicaron optimizaciones de consultas, carga y almacenamiento. Falta medir el efecto con más uso.
- La revisión local de `ae5c173` pasó las 232 pruebas unitarias. La captura del propietario confirma que la ejecución 11 de «Publicar sitio de pruebas» terminó correctamente para ese commit en `main` el 4 de noviembre de 2026.

## Pendientes por orden de trabajo

| Orden | Pendiente | Criterio de cierre |
| --- | --- | --- |
| 1 | Comprobar la versión de pruebas publicada | Cerrado. El propietario confirmó el funcionamiento en Pages tras la prueba de Taller, Programación y Mi semana. |
| 2 | Completar comprobaciones manuales breves | Cerrado según lo reportado por el propietario. Incluye PDF, visor en móvil y acceso del Jefe de Taller a OT de su sucursal. |
| 3 | Revisar controles de seguridad | Pasaron 17 pruebas locales de sesión y permisos administrativos. El 9 de noviembre se activó y verificó la protección contra el borrado de la base `(default)`, con recuperación a un punto en el tiempo habilitada. La auditoría npm no encontró avisos altos ni críticos. Queda evaluar actualizaciones para los avisos moderados, preparar App Check y revisar los dominios cuando esté disponible el definitivo. |
| 4 | Comprobar recuperación | El 21 de noviembre se restauró un respaldo en una base temporal. Se enumeraron 24 colecciones y coincidieron íntegramente ocho colecciones principales con la base operativa. Se verificó también la recuperación de un archivo artificial eliminado en Storage. Limpieza autorizada completada y verificada. Para un simulacro completo de continuidad queda validar accesos, índices, subcolecciones y funcionamiento de la aplicación sobre un entorno recuperado. |
| 5 | Medir rendimiento y costos con mayor uso | Verificar navegación con un volumen representativo, revisar consumos y alertas, y definir responsables ante un aumento inesperado. |
| 6 | Cerrar el alcance de Inventario | Acordar el funcionamiento definitivo, incluidas las eliminaciones, y validar los cambios acordados. |
| 7 | Preparar la salida comercial | Configurar alojamiento y dominio, validar autenticación y flujos desde el dominio final, cerrar condiciones del servicio y realizar el piloto antes de ampliar el acceso. |

Si un paso requiere una decisión o un requisito previo, se registra y se continúa con las comprobaciones independientes disponibles.
