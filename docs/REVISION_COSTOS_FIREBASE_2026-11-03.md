# Revisión de costos de Firebase — 3 de noviembre de 2026

Proyecto: `overtrack-42387` (Vectaria). Auditoría remota de solo lectura, realizada en horario de Santiago. No se modificaron servicios, límites, presupuestos, respaldos, archivos ni datos operativos. Se conservaron los cambios locales existentes en `empresa-admin.html` y `js/empresa-admin.js`.

## Resultado y límites

La cuenta de facturación está habilitada y su moneda es **CLP**. Un importe identificado como CLP en el informe de Google Cloud corresponde a pesos chilenos, no a USD. Las cifras de uso de Monitoring no son una factura: no incluyen descuentos, niveles gratuitos, créditos, impuestos o reglas de agregación de facturación. No se reconstruyó un importe neto a partir de esas métricas.

Falta obtener el CSV de Facturación/Informes de octubre y noviembre, filtrado al proyecto y agrupado por SKU, para reconciliar costo por uso, ahorros/créditos y subtotal. La consulta de presupuestos devolvió HTTP 403 porque la API de presupuestos no estaba disponible para la consulta autenticada; esto **no demuestra ausencia de presupuestos**. No se habilitó ninguna API. El listado de datasets de BigQuery del proyecto no devolvió datasets; no se identificó una exportación de facturación consultable en este proyecto y no se buscaron datos de otros proyectos.

## Configuración verificada

| Área | Evidencia actual | Implicación |
| --- | --- | --- |
| Functions / Cloud Run | 35 funciones ACTIVE en us-central1; mínimo de instancias 0 en todas; contenedores con CPU inactiva habilitada | No se encontraron instancias mínimas mantenidas permanentemente; sí se consume cómputo al ejecutar, iniciar y terminar instancias. No hay garantía de costo cero. |
| Recursos | Funciones con 1 vCPU; memoria de 256 MiB a 1 GiB según operación | La CPU no depende únicamente de la cantidad de llamadas: influye su duración y los arranques. |
| Scheduler | 3 tareas ENABLED: conciliación cada hora, exportaciones diaria y papelera cada 120 horas | Aproximadamente 720 + 30 + 6 ejecuciones por mes de 30 días. La franquicia de 3 tareas corresponde a toda la cuenta de facturación; no se verificó su consumo en otros proyectos. |
| Firestore | us-central1, PITR de 7 días, respaldo diario retenido 14 días; 14 copias READY listadas | Recuperación y copias tienen su propia facturación. La respuesta consultada no permitió determinar su tamaño; no se asume tamaño cero. |
| Storage activo | 147 objetos, 46.826.545 bytes, aproximadamente 44,7 MiB, en el bucket completo | Este total incluye todas las empresas y archivos del bucket; no equivale a la cuota de una empresa. |
| Storage eliminado recuperable | 25 objetos, 2.076.638 bytes, aproximadamente 2 MiB; política de 7 días | La cuota operativa se libera al borrar; las copias temporales de recuperación pueden seguir facturándose durante su retención. Versionado no habilitado en la respuesta consultada. |
| Artifact Registry | Repositorio `gcf-artifacts`, 739.558.367 bytes (aproximadamente 0,69 GiB), sin políticas de limpieza devueltas | Los despliegues dejan paquetes de ejecución. Son distintos de fotos/PDF de los clientes y se facturan separadamente cuando corresponde. |

## Consumo observado y oportunidades

Ventanas de métricas: octubre completo en UTC; noviembre del 1 al 4 a las 00:00 UTC (3 de noviembre, 21:00 en Santiago). Se normalizaron marcas de tiempo y se excluyeron ventanas alineadas que cruzaban los límites del período. Los datos son operacionales de Monitoring, no volúmenes de factura.

| Métrica | Octubre | Noviembre, ventana indicada |
| --- | ---: | ---: |
| Solicitudes a Cloud Run | 595 | 475 |
| Lecturas de documentos Firestore | 93.899 | 16.221 |
| Escrituras de documentos Firestore | 5.596 | 477 |
| Eliminaciones de documentos Firestore | 3.967 | 12 |
| CPU asignada de Run, vCPU-segundos | 3.135,73 | 1.622,29 |
| CPU asignada de la conciliación horaria | 1.363,72 | 968,09 |

La conciliación horaria concentra aproximadamente el 43% de la CPU asignada observada en octubre y el 60% en la ventana de noviembre. **No es el mismo porcentaje del importe a pagar.** El código auditado leía todas las empresas y consultaba sus reservas pendientes en cada ejecución. Se propone limitar la consulta a reservas realmente pendientes/antiguas y evaluar una frecuencia menos exigente. Antes de reducirla hay que considerar que las reservas de cargas fallidas tardarían más en liberarse y podrían bloquear nuevas cargas por cuota.

Otros puntos revisables:

1. Definir una política de limpieza de paquetes de despliegue de Artifact Registry, protegiendo lo utilizado por versiones activas y la capacidad de recuperación. No borrar imágenes manualmente sin comprobar referencias.
2. Paginar consultas del Dashboard y de Todas las OT: actualmente escuchan los resúmenes del ámbito completo y luego filtran/paginan en cliente. Mostrar seis tarjetas no significa leer seis documentos. SHEQ también carga colecciones completas por empresa. El gasto puede crecer con el historial y la cantidad de usuarios.
3. Mantener seguimiento de los disparadores de limpieza: la actualización de OT/empresa/sucursal invoca sus funciones aunque luego no encuentren archivos para retirar. No ejecutan limpieza de Storage si no hay rutas retiradas, pero la invocación y el cómputo siguen siendo consumo.
4. Revisar la protección de recuperación de Storage con conocimiento de su costo. Con unos 2 MiB recuperables observados, no se justifica desactivarla únicamente para ahorrar sin definir primero el objetivo de recuperación.

## Controles por configurar o confirmar con el propietario

Actualización por comprobación visual con el propietario: el informe de octubre muestra aproximadamente 1 CLP neto (respaldos); CPU de Functions 49 CLP brutos y -49 CLP en ahorros. Noviembre muestra 0 CLP netos redondeados, CPU 16 CLP y -16 CLP en ahorros, con proyección mensual aproximada de 1 CLP. Son los valores redondeados visibles, no una factura exacta. Se confirmó un presupuesto mensual de 10.000 CLP, alertas reales 50/90/100%, destinatarios por roles de facturación y propietarios, y alerta prevista al 100%, cuyo guardado confirmó el propietario. El presupuesto es de solo alertas y considera los ahorros seleccionados; no se verificaron las direcciones exactas de correo. No se configuró un spend cap.

Se activó con autorización la optimización de conciliación el 3 de noviembre de 2026 (America/Santiago), manteniendo la frecuencia horaria: consulta únicamente reservas pendientes antiguas. Verificación posterior: índice READY, función ACTIVE y tarea ENABLED cada 60 minutos. Detalle en `OPTIMIZACION_CONCILIACION_RESERVAS.md`. El ahorro deberá medirse en ejecuciones posteriores.

- Si hace falta reconciliación exacta, obtener el CSV por SKU y la factura; las capturas ya permiten identificar costo bruto, ahorros y subtotal redondeado.
- Verificar las direcciones concretas y la recepción de las alertas del presupuesto confirmado.
- Evaluar los spend caps disponibles para Functions/Cloud Run. Firebase los documenta en Preview para servicios seleccionados. Usan estimaciones **brutas**, sin descuentos/créditos; la aplicación puede quedar pausada al superar el umbral aunque el neto sea bajo. No cubren todos los servicios, no son instantáneos y no constituyen un límite absoluto de toda la factura.
- Preparar primero las optimizaciones concretas y probarlas; solicitar autorización antes de desplegar o modificar servicios, políticas de retención o presupuestos.

## Fuentes oficiales consultadas

- Facturación y créditos por SKU: https://docs.cloud.google.com/billing/docs/reports
- Facturación por solicitud en Run: https://docs.cloud.google.com/run/docs/configuring/billing-settings
- Tarifas de Run: https://cloud.google.com/run/pricing
- Scheduler: https://cloud.google.com/scheduler/pricing
- Respaldos y PITR: https://cloud.google.com/firestore/pricing
- Recuperación temporal de objetos borrados: https://docs.cloud.google.com/storage/docs/soft-delete
- Artifact Registry: https://cloud.google.com/artifact-registry/pricing
- Presupuestos de alertas: https://docs.cloud.google.com/billing/docs/how-to/budgets
- Spend caps de Firebase: https://firebase.google.com/docs/projects/billing/spend-caps
- Base bruta y alcance de spend caps: https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps

Evidencia técnica local, ignorada por Git: `tmp/auditoria-costos-firebase-20261103.json`, `tmp/auditoria-uso-firebase-20261103.json` y `tmp/auditoria-complementos-costos-20261103.json`. Los identificadores privados de la cuenta de facturación no se reproducen en este informe.
