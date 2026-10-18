# Plan de respaldo y recuperación

Este documento define cómo proteger y recuperar los datos operativos de Vectaria en el proyecto `overtrack-42387`.

## Objetivos

| Protección | Frecuencia o ventana | Retención | Uso principal |
| --- | --- | --- | --- |
| Firestore PITR | Continua | 7 días | Recuperar cambios o eliminaciones recientes con precisión de minutos. |
| Respaldo Firestore | Diario | 30 días | Recuperar la base completa ante un incidente operativo. |
| Respaldo Firestore | Semanal | 14 semanas | Cubrir incidentes descubiertos después del ciclo mensual. |
| Exportación de archivo | Mensual | 12 meses | Conservación extendida fuera de la base operativa. |
| Soft delete de Storage | Según configuración del bucket | 7 días recomendado | Recuperar archivos eliminados recientemente. |

Los respaldos programados de Firestore incluyen documentos e índices, pero no incluyen las políticas TTL. Las exportaciones mensuales deben almacenarse en un bucket separado del bucket operativo.

## Procedimiento de recuperación

1. Registrar el incidente, la hora aproximada y los datos afectados.
2. Bloquear temporalmente la operación afectada si continuar puede sobrescribir información recuperable.
3. Elegir PITR para datos puntuales recientes o un respaldo programado para recuperar la base completa.
4. Restaurar o clonar primero hacia una base nueva de ensayo; no sobrescribir directamente la base activa.
5. Validar empresas, usuarios, OT, etapas, inventario, programación, SHEQ e índices.
6. Comparar recuentos y una muestra de documentos con el entorno activo.
7. Autorizar la recuperación definitiva y registrar quién la ejecutó.
8. Ejecutar las pruebas de seguridad y una prueba operativa básica después de recuperar.

## Simulacro trimestral

Una vez por trimestre se debe restaurar el respaldo más reciente en una base de ensayo y documentar:

- fecha y responsable;
- respaldo utilizado;
- tiempo necesario para recuperar;
- colecciones e índices verificados;
- errores encontrados;
- resultado final y acciones correctivas.

## Responsabilidades

- El dueño de la plataforma administra respaldos, restauraciones y presupuestos de Google Cloud.
- Los administradores de empresa pueden generar el respaldo exportable de su empresa, pero no administrar los respaldos internos de la plataforma.
- Ningún respaldo interno debe exponerse desde la interfaz de usuarios operativos.
