# Plan de respaldo y recuperación

Este documento define cómo proteger y recuperar los datos operativos de Vectaria en el proyecto `overtrack-42387`.

## Objetivos

Estado remoto verificado el 29 de octubre de 2026: PITR de 7 días habilitado; respaldo diario con retención de 14 días; catorce respaldos listados en estado `READY`. No existe programación semanal en la respuesta consultada. La siguiente tabla representa objetivos propuestos; no debe interpretarse como configuración aplicada. Falta realizar y documentar un simulacro de restauración.

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

## Ensayo del 21 de noviembre de 2026

Se restauró el respaldo `206d2697-8664-48c8-b517-c84d5d0835ba`, tomado el 20 de noviembre a las 15:47 UTC, en la base temporal `ensayo-recuperacion-20261121` de `overtrack-42387`. Firebase informó `SUCCESSFUL` y avance 100 %. La base operativa conservó su destino original. La base restaurada heredó protección contra eliminación y tiene PITR deshabilitado.

Se enumeraron 24 colecciones de primer nivel. Se verificó por hash SHA-256 la igualdad del contenido completo de ocho colecciones frente a la base operativa al momento de la comparación. Coincidieron empresa (1), usuarios (11), sucursales (1), OT (3), resúmenes de OT (3), inventario (32), publicaciones personales de programación (4) y documentos SHEQ (17). La comparación incluye los campos de los documentos, como las etapas almacenadas dentro de las OT. No se compararon todas las subcolecciones ni se realizó un cambio de conexión de la aplicación a la base temporal. Los perfiles recuperados de Firestore son distintos de las cuentas de Firebase Authentication.

Para Storage se creó un archivo artificial bajo `ensayos-recuperacion/20261121/`. Se eliminó con condición de generación, se comprobó su estado de eliminación recuperable y se restauró. La generación restaurada conserva el mismo tamaño y MD5 del contenido original. La retención efectiva consultada es de 7 días. Este ensayo acredita recuperación puntual dentro de esa ventana, no una copia independiente del bucket.

Evidencia local en `tmp/resultado-restauracion.json`, `tmp/comparacion-restauracion.json` y `tmp/resultado-archivo-recuperacion.json`. La base temporal y el archivo artificial restaurado quedan pendientes de limpieza autorizada. El costo efectivo se revisará en facturación cuando se registre.

Limpieza posterior autorizada y verificada el mismo día. La base temporal fue eliminada y el archivo artificial dejó de estar activo. Las versiones eliminadas del archivo quedan sujetas a la retención de Storage de 7 días y pueden generar almacenamiento durante esa ventana. La consulta final confirmó que `(default)` continúa presente con protección contra eliminación y PITR habilitados. La CLI informó éxito en la actualización y eliminación de la base temporal, seguido de un fallo de cierre de Node en Windows. La consulta independiente posterior confirmó el resultado remoto. Evidencia en `tmp/limpieza-ensayo-recuperacion.json`.
