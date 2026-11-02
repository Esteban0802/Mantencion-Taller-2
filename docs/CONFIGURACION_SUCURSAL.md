# Configuración propia de sucursal — 31 de octubre de 2026

Solicitud: habilitar al administrador de sucursal únicamente Identidad Visual y Plantillas de Mantenimiento. El propietario confirmó que los cambios deben afectar solo a su sucursal.

## Comportamiento

- El menú Configuración aparece para el administrador de sucursal. Contiene Identidad Visual y Plantillas de Mantenimiento, más una consulta de almacenamiento de su sucursal y la cuota compartida. No permite cambiar datos generales, planes, límites ni módulos, ni exportar o cancelar la empresa.
- La identidad propia se guarda en `sucursales/{id}.identidadVisual`. Se permiten colores, logo y portada de informes. Sin configuración propia se hereda la identidad general de la empresa; el botón de restablecer retira la configuración propia.
- El PDF generado desde una OT combina la identidad de empresa con la identidad de la sucursal de esa OT. No cambia la identidad general ni la de otras sucursales.
- Las plantillas se guardan exclusivamente en `sucursales/{id}/plantillasSucursal`. El Excel utiliza las mismas etapas y formato anteriores.
- Al crear una OT se consultan solo las plantillas activas de su sucursal, sin heredar plantillas generales. Las actividades de OT existentes no se reescriben.
- Se retiró la administración de plantillas del panel de empresa. Las reglas y el servidor preparados bloquean las escrituras en las ubicaciones antiguas; requieren publicación autorizada para aplicar ese bloqueo remotamente.

## Permisos y archivos

- Firestore solo permite al administrador de sucursal actualizar `identidadVisual` y `fechaActualizacion` en su sucursal activa; no puede alterar nombre, estado, empresa ni límites.
- Las plantillas propias pueden gestionarse exclusivamente desde ese rol y sucursal. La consulta operacional permite miembros de la propia sucursal y al administrador de empresa; no habilita operaciones al superadministrador.
- Los archivos propios usan `empresas/{empresaId}/sucursales/{sucursalId}/informe/…` y `…/plantillas/…`. Las cargas y eliminaciones pasan por las funciones existentes con validación de rol, empresa, sucursal activa, formato, tamaño y cuota compartida de empresa.
- Las escrituras directas de Storage permanecen bloqueadas. La configuración queda de solo lectura durante cancelación o cuando la sucursal no está activa.
- La exportación de empresa incluye los documentos `plantillasSucursal` y los archivos quedan bajo el prefijo existente de empresa. La eliminación definitiva de empresa ya elimina las sucursales recursivamente y sus archivos bajo ese prefijo.

## Verificación y activación

129 pruebas unitarias y 192 pruebas de reglas aprobadas, incluyendo UI limitada a dos pestañas, destino de guardado, herencia, prioridad de plantillas, permisos entre sucursales, archivos, formatos y cuota. Sintaxis de Functions, construcción de producción y 11 pruebas locales de Hosting correctas.

El 31 de octubre de 2026 se desplegaron con autorización las funciones `subirArchivoEmpresa`, `eliminarArchivoEmpresa` y `generarExportacionEmpresa`, junto con las reglas de Firestore y Storage, en `overtrack-42387`. Las tres funciones se verificaron remotamente en estado `ACTIVE`, Node.js 22, `us-central1`. Firebase confirmó la publicación de ambas reglas. La interfaz sigue local; no se publicó GitHub Pages ni se realizó push.

Las reglas compilaron correctamente, con advertencias sobre auxiliares no utilizados y sus referencias. No se probaron escrituras o archivos de producción durante la verificación de ese despliegue. Registros locales en `tmp/deploy-sucursal-functions-20261031.log` y `tmp/deploy-sucursal-rules-20261031.log`. La decisión posterior de usar plantillas exclusivamente por sucursal sí requirió el traslado descrito abajo.

Pendiente de validación manual tras la activación: guardar identidad de una sucursal, crear una plantilla Excel propia, abrir una OT nueva de esa sucursal y comprobar un PDF sin afectar otra sucursal ni las OT existentes.

## Ajuste visual posterior del 31 de octubre

La vista de sucursal reutiliza los componentes visuales de Empresa: colores con selector y texto hexadecimal sincronizados, tarjetas de logo/portada con vistas previas, plantilla en dos columnas con área de carga y lista con buscador, versión, actividades y estado. Se mantienen exactamente las dos secciones y el alcance de sucursal. Los códigos de color inválidos se rechazan antes de guardar.

Validación: 129 pruebas unitarias y 11 de Hosting aprobadas, sintaxis y construcción correctas. Este ajuste es de interfaz y permanece local; no requirió un nuevo despliegue de Firebase ni modificó sus reglas.

## Plantillas exclusivas y desglose de almacenamiento (ajuste posterior)

El propietario confirmó el destino «Taller Santiago». Se trasladó la plantilla `xs2Z0COAWxbJkl3unwxy` de Empresa Piloto OverTrack a `sucursales/LJK2vfXK4MXxFPJ49dGO/plantillasSucursal/`, conservando sus 127 actividades y todos los campos anteriores salvo ruta/URL del Excel. El archivo de 15.295 bytes se copió a la carpeta de esa sucursal y se verificaron tamaño, CRC32C y MD5. El documento se movió mediante commit atómico con precondiciones; el Excel original se retiró después de comprobar la copia. El respaldo previo está en `tmp/respaldo-plantilla-santiago.json` (privado, ignorado por Git). Las OT existentes no se modificaron.

La nueva callable `obtenerDesgloseAlmacenamiento` enumera archivos a petición del usuario y no altera la cuota ni sus contadores. El administrador de empresa recibe todas sus sucursales, archivos generales y archivos de OT sin sucursal identificada; el de sucursal recibe solo su fila. Incluye evidencias de OT activas y en papelera, plantillas, identidad y archivos de inventario identificables por su ruta. Se muestra fecha de consulta y consumo respecto al total compartido. No hay cuotas independientes por sucursal. Las cargas en curso pueden producir diferencias transitorias entre esta consulta y los contadores.

El traslado de datos ya se ejecutó por solicitud del propietario. El visor y las restricciones nuevas están preparados localmente; la callable nueva y las restricciones necesitan un despliegue de Firebase autorizado. No se publicó GitHub Pages ni se realizó push.

Validación de este ajuste: 133 pruebas unitarias, 192 de permisos, 11 de Hosting y 2 integradas de archivos/callables aprobadas; sintaxis y construcción de producción correctas. Tras el traslado, el contador remoto conserva 39 archivos y 25.329.184 bytes, igual que antes.

## Activación autorizada del desglose y restricciones

El 31 de octubre de 2026, tras autorización expresa del propietario, se publicaron `obtenerDesgloseAlmacenamiento`, `subirArchivoEmpresa`, `eliminarArchivoEmpresa` y las reglas de Firestore en `overtrack-42387`. Firebase confirmó la publicación de reglas y las tres operaciones de funciones finalizaron correctamente. Una consulta remota posterior verificó las tres funciones en estado `ACTIVE`, Node.js 22, región `us-central1`. No se publicaron Hosting, GitHub Pages ni cambios en Git. La interfaz está disponible en la copia local actualizada.

Registros: `tmp/deploy-desglose-20261031.log` y `tmp/functions-desglose-20261031.json`. Pendiente de comprobación manual: abrir Configuración como administrador de empresa y pulsar «Consultar consumo»; repetir como administrador de Taller Santiago y comprobar que solo aparece su sucursal y que su plantilla conserva las 127 actividades.

## Corrección de etapas reales del checklist GX

El importador ahora reconoce las hojas de Ingreso, Evaluación, Mantención (o Mantenimiento/Overhaul), Pruebas y Despacho. Guarda en `hojasExcel` las etapas presentes, mantiene los checklists por hoja y solo habilita las etapas presentes cuyo módulo está contratado. Ya no exige todas las etapas de la empresa ni agrega Despacho por el plan. Una hoja reconocida, habilitada y vacía se rechaza; un archivo sin actividades reconocidas y habilitadas también. Los nombres de trabajos dentro de una hoja siguen siendo actividades, no etapas independientes.

Para plantillas cargadas con el importador anterior, como GX, las nuevas OT deducen las etapas desde los checklists guardados: no se considera suficiente el antiguo indicador `despacho: true` sin una hoja o checklist real. No requiere borrar o volver a cargar GX. Las OT existentes conservan su snapshot `etapasHabilitadas`.

Ingreso se incluye entre las opciones de aprobación. Si se selecciona, la acción de completar Ingreso exige Jefe de Taller, y las reglas preparadas protegen `ingresoAprobado`. Sin esa selección, el técnico puede completar la etapa como antes. Esta opción queda fijada al crear la OT. Las reglas también consideran las etapas de la OT para permitir flujos reducidos y no exigir etapas ausentes al cerrar.

Validación local: 140 pruebas unitarias, 196 de permisos y 11 de Hosting aprobadas; construcción y sintaxis correctas. Incluye Excel GX de cuatro hojas, tres trabajos dentro de Pruebas sin convertirlos en etapas, Excel reducido, módulos deshabilitados, compatibilidad de plantillas antiguas, cambio de gama y selección de Ingreso, bloqueo de aprobación por técnico/supervisor, guardado fallido y cierre sin etapas ajenas.

Este ajuste permanece local. La nueva protección de Ingreso y el soporte de flujos reducidos requieren publicar `firestore.rules` con autorización. No se modificaron documentos ni archivos de producción, ni se publicó Firebase o GitHub Pages durante este ajuste.

Activación posterior autorizada, 31 de octubre de 2026: se publicó exclusivamente `firestore.rules` en `overtrack-42387`. Firebase confirmó compilación correcta y liberación de las reglas, con la advertencia ya existente sobre el auxiliar no utilizado `isWorkshopUser`. Registro: `tmp/deploy-reglas-etapas-excel-20261031.log`. No se desplegaron Functions, Storage, índices ni Hosting. La interfaz se prueba desde la versión local actualizada; GitHub Pages sigue pendiente de publicación.

## Ampliación posterior: nombres de etapa libres

El propietario solicitó quitar también la restricción de nombres de las hojas. La implementación posterior está descrita en [FLUJOS_PERSONALIZADOS.md](FLUJOS_PERSONALIZADOS.md). Esa versión lee cualquier nombre de hoja, mantiene su orden, admite aprobaciones por etapa y usa un flujo secuencial con validación en servidor. Las plantillas antiguas se preparan leyendo su Excel original; las OT existentes conservan su estructura. Esta ampliación está probada localmente y requiere una autorización de despliegue diferente de las activaciones anteriores.

Activación posterior: el propietario autorizó ese despliegue y el 31 de octubre se publicaron las cinco funciones del flujo libre y las reglas de Firestore. Las cinco se verificaron remotamente en estado `ACTIVE`. Los detalles y registros están en el apartado «Activación autorizada» de `FLUJOS_PERSONALIZADOS.md`. La interfaz continúa local; GitHub Pages no se publicó.
