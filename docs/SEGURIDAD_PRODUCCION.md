# Seguridad y continuidad para producción

Este documento reúne las tareas de seguridad y continuidad necesarias para producción. Los respaldos, las alertas de costos y la política de conservación pueden configurarse antes de disponer del dominio definitivo. App Check y las restricciones web definitivas se activan después de conectar el dominio.

## Pendiente de alta prioridad: control de costos de Firebase

- Estado: pendiente; registrado el 27 de octubre de 2026 por solicitud del propietario.
- Orden acordado: abordarlo al terminar el listado actual de la auditoría, antes de habilitar producción para clientes reales.
- Revisar el gasto real por servicio y acordar un presupuesto mensual con el propietario.
- Configurar presupuesto y alertas para el proyecto Vectaria, con destinatarios y umbrales acordados.
- Evaluar límites de gasto para los servicios compatibles, considerando sus demoras y el impacto de una pausa.
- Revisar instancias, concurrencia y tiempos de las funciones.
- Definir límites de frecuencia para cargas, descargas y generación de respaldos.
- Verificar App Check, permisos y restricciones de acceso para reducir abuso.
- Definir responsables, seguimiento del gasto y un procedimiento de respuesta ante aumentos inesperados.

La cuota por empresa y su visor no sustituyen estos controles de facturación.
Este pendiente no configura servicios ni autoriza despliegues, cambios de facturación o pausas del servicio.

## 1. Firebase App Check

1. Registrar la aplicación web `overtrack-42387` en App Check.
2. Usar reCAPTCHA Enterprise para el dominio definitivo.
3. Agregar como dominios autorizados únicamente el dominio principal y sus variantes necesarias.
4. Integrar la clave pública de App Check en `js/firebase-config.js`.
5. Mantener App Check en modo de supervisión durante 7 días.
6. Revisar que las solicitudes legítimas de Firestore, Storage y Functions aparezcan verificadas.
7. Activar la obligatoriedad de forma gradual: primero Functions, después Storage y finalmente Firestore.
8. Conservar un token de depuración solo para desarrollo local y nunca incluirlo en Git.

## 2. Restricción de la clave web

La clave `apiKey` de Firebase es pública por diseño, pero debe restringirse en Google Cloud:

- Tipo de restricción: sitios web.
- Referencias permitidas: dominio definitivo con HTTPS y, solo mientras sea necesario, el origen local de desarrollo.
- APIs permitidas: únicamente las utilizadas por Firebase Authentication, Firestore, Storage y Functions.
- Retirar orígenes antiguos después de cada migración.

## 3. Respaldos

- Activar recuperación a un punto en el tiempo de Firestore (PITR) por 7 días.
- Programar un respaldo diario de Firestore con retención de 30 días.
- Programar un respaldo semanal de Firestore con retención de 14 semanas.
- Para conservar información por más de 14 semanas, generar una exportación mensual en un bucket de respaldo separado con retención de 12 meses.
- Mantener el destino de respaldo fuera del acceso cotidiano de los usuarios de la aplicación.
- Probar una restauración en una base de ensayo al menos una vez por trimestre y registrar el resultado.
- No considerar un respaldo correcto hasta comprobar que puede restaurarse.

## 4. Alertas de consumo y costos

Crear presupuestos con avisos acumulativos al:

- 50 % del presupuesto mensual.
- 75 % del presupuesto mensual.
- 90 % del presupuesto mensual.
- 100 % del presupuesto mensual.

Supervisar además:

- Lecturas y escrituras de Firestore.
- Almacenamiento y transferencia de fotografías.
- Invocaciones y errores de Cloud Functions.
- Crecimiento por empresa para compararlo con el plan contratado.

Las alertas informan, pero no detienen automáticamente el servicio. Cualquier límite automático debe evaluarse para no interrumpir una OT en curso.

El presupuesto será mensual y se aplicará al proyecto `overtrack-42387`. Debe avisar por correo al responsable técnico y al responsable de facturación. El monto inicial se define antes de crear la alerta en Google Cloud.

## 5. Conservación de archivos

- Las evidencias, fotografías, informes y documentos asociados a una OT activa o cerrada no se eliminan automáticamente mientras la empresa mantenga el servicio activo.
- Las exportaciones ZIP temporales vencen a las 72 horas. La función programada `limpiarExportacionesExpiradas` elimina únicamente archivos marcados como exportación temporal y cuya fecha de expiración ya se cumplió.
- Cuando una empresa solicita la cancelación, su operación queda bloqueada y dispone de 30 días para generar, descargar y verificar su respaldo.
- Una empresa solo puede eliminarse después del plazo de 30 días, mediante una acción manual del superadministrador y tras comprobar que no existe una obligación de conservación o bloqueo legal.
- La eliminación de una OT continúa siendo una operación exclusiva del Jefe de Taller y debe quedar registrada en auditoría.
- No se aplicarán reglas generales de eliminación por antigüedad al bucket que contiene evidencias operativas.
- La política debe revisarse una vez al año y cuando cambien los contratos, requisitos legales o tipos de documentos almacenados.

## 6. Criterio de activación

Antes de aplicar estas medidas se requiere:

- Correo responsable para alertas técnicas y de facturación.
- Presupuesto mensual inicial aprobado.
- Facturación de Google Cloud habilitada para PITR y respaldos programados.
- Política de conservación de datos aprobada.
- Pruebas finales por rol completadas.

El dominio definitivo con HTTPS solo es requisito para App Check y las restricciones web definitivas, no para respaldos ni alertas de costos.

## 7. Migración definitiva de Programación

Antes de habilitar el dominio definitivo:

1. Desplegar coordinadamente Cloud Functions, reglas de Firestore, reglas de Storage y Hosting.
2. Volver a publicar todas las semanas vigentes para generar `programacionPublicadaUsuarios`.
3. Verificar con cuentas reales que Técnicos y Supervisores solo lean su copia personal publicada.
4. Verificar que SHEQ solo pueda leer semanas publicadas y que Bodega conserve borradores y publicados.
5. Retirar de `js/programacion.js` la compatibilidad transitoria con `programacionSemanas` después de confirmar la migración.
6. Ejecutar nuevamente las pruebas por rol y revisar que ningún borrador sea visible fuera de Planificación y Bodega.
