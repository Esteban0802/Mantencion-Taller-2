# Seguridad y continuidad para producción

Este documento reúne las tareas que deben ejecutarse cuando Vectaria tenga su dominio definitivo. No deben activarse en modo obligatorio mientras el equipo siga trabajando únicamente en `127.0.0.1`.

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

- Activar recuperación a un punto en el tiempo de Firestore si el plan y la región lo permiten.
- Programar una exportación diaria de Firestore con retención mínima de 30 días.
- Mantener una copia mensual con retención de 12 meses.
- Separar el destino de respaldo del acceso cotidiano de los usuarios de la aplicación.
- Probar una restauración en un proyecto de ensayo al menos una vez por trimestre.
- Las evidencias de Storage deben tener una política de retención coherente con los contratos y la normativa aplicable.

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

## 5. Criterio de activación

Antes de aplicar estas medidas se requiere:

- Dominio definitivo con HTTPS activo.
- Correo responsable para alertas técnicas y de facturación.
- Presupuesto mensual inicial aprobado.
- Política de retención de datos definida.
- Pruebas finales por rol completadas.
