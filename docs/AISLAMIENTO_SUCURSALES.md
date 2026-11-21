# Programación y SHEQ por sucursal

Corrección del 21 de noviembre de 2026. Adaptación de 56 registros aplicada con autorización y contenido completo verificado. Reglas de Firestore y Storage y tres funciones activadas. Los 17 índices del proyecto están listos. Publicación web enviada a GitHub Pages en el commit 5f7819c; no se pudo comprobar su ejecución remota. Las mejoras posteriores del procedimiento de adaptación y esta constancia quedan locales porque no se autorizó su segundo envío a GitHub.

- Planificador: planificación, publicación, historial, ausencias, vehículos y acreditaciones de su empresa y sucursal asignadas.
- SHEQ: contratos, vehículos, documentos y archivos de su empresa y sucursal asignadas.
- Los otros perfiles de sucursal conservan sus facultades anteriores dentro de esa misma sucursal. Técnico y Supervisor reciben solamente su copia personal publicada.
- Admin de Empresa conserva la supervisión de toda su empresa. No recibe edición operativa adicional.
- Un usuario sin sucursal asignada no obtiene acceso empresarial como alternativa.

La publicación semanal usa una identidad compuesta de empresa, sucursal y semana. El servidor obtiene la sucursal desde el perfil autenticado, independientemente de los parámetros enviados por la pantalla. Las reglas y la autorización de archivos aplican el mismo aislamiento.

## Datos anteriores y activación

La revisión de solo lectura encontró 56 registros a ajustar, sin casos ambiguos: 4 contratos, 1 vehículo, 17 documentos, 27 asignaciones, 3 semanas y 4 copias personales publicadas. El resto de los registros consultados ya tiene sucursal.

`scripts/preparar-aislamiento-sucursales.cjs` genera en `tmp/` un plan con los originales y sus versiones. No escribe en Firebase y no debe publicarse el contenido privado del plan.

`scripts/aplicar-aislamiento-sucursales.cjs` simula por defecto. Solo con `--aplicar` ejecuta el lote atómico. Usa la versión exacta de cada original y exige destinos nuevos: si algo cambió o el destino ya existe, se rechaza el lote completo. No elimina documentos ni archivos. Las semanas y copias personales con identidad antigua se conservan marcadas como migradas para evitar publicaciones duplicadas.

Con autorización, coordinar una breve pausa de edición, regenerar el plan, revisar el resultado y aplicar la migración; después activar índices, reglas de Firestore y Storage, las funciones `publicarProgramacion`, `subirArchivoEmpresa` y `eliminarArchivoEmpresa`, y la web. No publicar solo la web: las consultas nuevas necesitan los datos ajustados y las protecciones del servidor. Verificar la entrada de Planificador, SHEQ y trabajador, y la publicación de una semana en Taller Santiago antes de reanudar edición.

El PDF de roles entregado anteriormente describe el estado previo. Su referencia al alcance empresarial de Planificador/SHEQ queda reemplazada por este alcance una vez activada la corrección.
