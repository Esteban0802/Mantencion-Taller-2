# Consultas del panel y archivo de OT

Implementación de la web todavía local. Los cuatro índices nuevos de Firestore se publicaron con autorización el 4 de noviembre de 2026 (America/Santiago) y se verificaron en estado READY. No se publicaron la web, funciones ni reglas.

## Panel del taller

La escucha consulta `otsResumen` con `cerrada == false`, empresa y, para los roles de sucursal, sucursal. Mantiene todas las abiertas porque los indicadores de avance, atrasos, despachos y Gantt necesitan ese conjunto; mostrar seis tarjetas no equivale a consultar solo seis documentos.

Las cerradas se cuentan mediante `getCountFromServer`, sin descargar sus resúmenes. El conteo se actualiza al recibir la primera lista de abiertas, cuando entra o sale una abierta, al recuperar el foco y ante eventos de otra pestaña. No se repite por cada modificación de una actividad/comentario. Las agregaciones también consumen lecturas: esta mejora no elimina todo costo.

Los KPI generales usan las abiertas del ámbito y el total de cerradas; el gráfico de estados incorpora ese total. Si falla el conteo, los KPI total/cerradas muestran un guion y el gráfico de estados no presenta un cero engañoso. La búsqueda local del panel se limita a abiertas. El archivo completo está disponible en Todas las OT.

Se cancelan las escuchas al salir y se reinician al volver desde la caché del navegador. Se retiró la carga alternativa desde `localStorage.ots`, que podía reemplazar la lista autorizada y actualizada con datos antiguos.

## Todas las OT

- Página de veinte resúmenes con cursor de Firestore; la escucha solicita veintiuno para detectar si existe una página siguiente.
- Orden estable por creación descendente. El filtro de atrasadas ordena primero por fecha de término y luego por creación; excluye fechas vacías. Las tarjetas siguen mostrando la última actualización.
- Los estados activa/cerrada y atrasada se filtran en la consulta, antes de paginar. La cantidad se obtiene por agregación, no contando solo las tarjetas de la página.
- Se conservan los filtros de empresa y sucursal en las páginas, conteos y búsqueda. No se cambiaron permisos ni reglas.
- El filtro de texto busca fragmentos en OT, equipo, serie y cliente, sin distinguir mayúsculas. Se ejecuta mediante Buscar/Enter o al cambiar el estado; escribir no realiza consultas.
- Como Firestore no ofrece búsqueda nativa de fragmentos, la búsqueda explícita recorre bloques de veinte hasta encontrar una página y determinar si hay más resultados. Puede recorrer todo el historial si hay pocas coincidencias. No es una reducción garantizada del costo de búsqueda: evita descargarlo al abrir y evita repetir la búsqueda por cada letra.
- Las páginas de una búsqueda reutilizan los resultados ya consultados. Antes de llegar al final no se inventa un total ni una cantidad de páginas. Para resultados nuevos o modificados se vuelve a pulsar Buscar; el listado normal conserva la escucha de la página visible.
- Una búsqueda nueva invalida la anterior para evitar resultados tardíos. Los errores se pueden reintentar. Archivar/restaurar reinicia la consulta y sus cursores.

No se ejecuta `asegurarResumenesOT` al abrir estas pantallas ni se recurre automáticamente a todas las OT completas ante un error. Las escrituras existentes mantienen los resúmenes. La auditoría de solo lectura de la empresa piloto dio tres OT/tres resúmenes, una abierta y dos cerradas. Si se importan datos históricos sin resúmenes, debe prepararse su migración explícitamente antes de utilizar estas consultas.

## Índices y validación

Cuatro índices nuevos para `otsResumen`, combinando empresa, sucursal opcional, cerrada y creación; los dos de atrasadas incluyen `gantt.fechaTermino`. Publicar los índices primero y verificar READY antes de publicar o probar estas consultas en el proyecto real. Los emuladores no comprueban la disponibilidad de índices de producción.

Verificación posterior a la publicación: los cuatro índices READY; seis consultas remotas de solo lectura (abiertas/cerradas/atrasadas, tanto por empresa como por sucursal) se ejecutaron sin errores de índice y devolvieron una abierta, dos cerradas y cero atrasadas en cada alcance de la empresa piloto. No se alteraron datos. Evidencia local ignorada por Git: `tmp/deploy-indices-consultas-20261104.log`, `tmp/indices-consultas-verificacion-20261104.json` y `tmp/consultas-ot-verificacion-remota-20261104.json`.

- 215 pruebas unitarias aprobadas (8 nuevas de navegación, búsqueda, errores, cancelación, contadores y alcance por rol).
- 198 pruebas de reglas aprobadas con proyecto demo local, incluida paginación/conteos permitidos en la sucursal y rechazo de consultas ajenas o sin alcance suficiente.
- Sintaxis de módulos, `git diff --check` y construcción de producción aprobadas.
- No se hizo una prueba visual interactiva ni una publicación de la web.

Continúa pendiente optimizar la consulta de Inventario del panel, que conserva su alcance completo para las alertas de repuestos; no se cambió la semántica del módulo.
