# Registro de proveedores tecnológicos de Vectaria

**Versión 0.1 - 19 de octubre de 2026 - Documento de trabajo**

Este registro identifica los servicios externos observados en el proyecto y los aspectos que deben verificarse antes del lanzamiento. No sustituye el anexo contractual de tratamiento de datos.

## Proveedor principal

| Proveedor / servicio | Finalidad | Datos involucrados | Ubicación confirmada | Estado |
|---|---|---|---|---|
| Google Firebase Authentication | Creación de cuentas, autenticación y recuperación de acceso | UID, nombre, correo, estado de cuenta y metadatos de autenticación | Estados Unidos | En uso |
| Google Cloud Firestore | Base de datos operacional y administrativa | Empresas, usuarios, OT, inventario, programación, SHEQ y registros relacionados | Pendiente de verificar en la consola de Firebase | En uso |
| Cloud Storage for Firebase | Almacenamiento de fotografías, evidencias, documentos, respaldos y archivos SHEQ | Archivos cargados por los clientes y metadatos técnicos | Pendiente de verificar en la consola de Firebase | En uso |
| Cloud Functions for Firebase | Procesos de servidor, administración, publicación, exportación y eliminación | Datos necesarios para ejecutar cada operación | `us-central1`, Estados Unidos | En uso |
| Firebase Hosting | Publicación y entrega de la aplicación web | Solicitudes web y metadatos técnicos, como dirección IP y agente de usuario | Infraestructura global de Google | En uso |

Google actúa como proveedor de infraestructura y, en general, como encargado o subencargado respecto de los datos que Vectaria le entrega. Algunos servicios pueden procesar datos en países donde Google o sus subencargados mantienen instalaciones, sujeto a los compromisos de ubicación aplicables a cada servicio.

## Proveedores auxiliares detectados

La aplicación descarga actualmente bibliotecas desde `gstatic.com`, `cdn.jsdelivr.net` y `cdnjs.cloudflare.com`. Estos proveedores reciben al menos información técnica de la solicitud del navegador, como dirección IP, fecha, recurso solicitado y agente de usuario. Antes del lanzamiento debe evaluarse alojar localmente las bibliotecas necesarias para reducir dependencias externas y riesgo de cadena de suministro.

No se detectó en el código revisado una integración activa con plataformas de pago, analítica, publicidad, correo transaccional ni soporte de terceros. El registro deberá actualizarse antes de incorporar cualquiera de esos servicios.

## Conservación y recuperación

- Los ZIP de exportación generados por Vectaria tienen una vigencia operativa de 72 horas.
- El proyecto contempla habilitar recuperación a un punto en el tiempo de Firestore por 7 días, respaldos diarios por 30 días y respaldos semanales por 14 semanas.
- La existencia de ese plan en la documentación no confirma que las funciones estén activadas en Google Cloud.
- Antes del lanzamiento deben verificarse el estado real de PITR, los respaldos programados, la eliminación diferida de Cloud Storage y las políticas de ciclo de vida de los buckets.

## Verificaciones obligatorias antes del lanzamiento

1. Confirmar y registrar la ubicación de la base Firestore.
2. Confirmar y registrar la ubicación del bucket de Cloud Storage.
3. Verificar si la eliminación diferida de objetos está activa y cuál es su plazo.
4. Confirmar PITR y las programaciones reales de respaldo.
5. Revisar y aceptar los términos de tratamiento y seguridad de Firebase/Google Cloud aplicables a la cuenta contratante.
6. Mantener un enlace actualizado a la lista de subencargados de Google.
7. Actualizar este documento cuando se incorpore correo, pagos, monitoreo, soporte o cualquier proveedor nuevo.

## Fuentes oficiales

- Privacidad y seguridad en Firebase: https://firebase.google.com/support/privacy
- Condiciones de tratamiento y seguridad: https://firebase.google.com/terms/data-processing-terms
- Subencargados de Firebase: https://firebase.google.com/terms/subprocessors
- Ubicaciones de Firestore: https://firebase.google.com/docs/firestore/locations
- Recuperación de Firestore: https://firebase.google.com/docs/firestore/disaster-recovery

