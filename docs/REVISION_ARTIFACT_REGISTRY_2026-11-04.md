# Revisión de Artifact Registry — 4 de noviembre de 2026

Consulta de solo lectura al proyecto `overtrack-42387`, región `us-central1`. Se conservaron los cambios locales existentes.

## Resultado

- Repositorio `gcf-artifacts`: 714.699.131 bytes, aproximadamente 682 MiB (0,666 GiB).
- 39 imágenes de despliegue, subidas entre el 29 de octubre y el 4 de noviembre de 2026 (fechas UTC).
- La consulta inicial de listado no incluía las políticas. La consulta directa posterior confirmó una política activa `firebase-functions-cleanup`, DELETE, tagState ANY, olderThan 604800s (7 días), con simulación desactivada. La ausencia del campo en el listado no demostraba ausencia de política.
- Ninguna imagen supera actualmente los siete días de antigüedad.

El tamaño del repositorio no equivale a sumar los tamaños de todas las imágenes: pueden compartir capas. Tampoco permite calcular por sí solo el cargo mensual exacto; la facturación depende del almacenamiento a lo largo del mes y de los beneficios aplicables a la cuenta.

## Configuración verificada con autorización

Se ejecutó, con autorización del usuario, el comando oficial para conservar siete días de imágenes de despliegue, exclusivamente en `gcf-artifacts` de `us-central1`:

```bash
npx firebase functions:artifacts:setpolicy --days 7 --location us-central1 --project overtrack-42387 --non-interactive
```

El comando respondió que ya existía la política de siete días y no realizó cambios. Se verificó directamente el recurso mediante GET del repositorio y se confirmó su política activa. No se conoce desde esta consulta cuándo fue configurada originalmente. Ninguna de las 39 imágenes sería candidata hoy por antigüedad. La finalidad es limitar acumulaciones futuras, sin prometer una reducción inmediata de tamaño o un importe fijo de ahorro.

Firebase documenta que estos artefactos no son necesarios para la ejecución de las funciones ya desplegadas: el servicio conserva su propia copia. La política afecta a los artefactos de construcción, no a las OT, usuarios, fotografías, documentos ni respaldos de Firestore. Tras activarla se debe comprobar su período y alcance; la eliminación es un proceso periódico, no necesariamente inmediato.

## Evidencia y fuentes

- Consulta autenticada de repositorios e imágenes mediante la API de Artifact Registry, con paginación. Evidencia inicial: `tmp/artifact-audit-20261104.json`. Verificación directa corregida: `tmp/artifact-verificacion-20261104.json`. Resultado del comando: `tmp/activar-limpieza-artifact-20261104.log`. Archivos ignorados por Git.
- Firebase: https://firebase.google.com/docs/functions/manage-functions#clean_up_deployment_artifacts
- Políticas: https://docs.cloud.google.com/artifact-registry/docs/repositories/cleanup-policy

No se cambió código de la aplicación; no corresponde ejecutar pruebas unitarias para esta revisión documental. Se verificó el formato con `git diff --check`.
