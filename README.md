# Vectaria

Vectaria es una plataforma web multiempresa para gestionar órdenes de trabajo, mantenimiento, evidencias técnicas y trazabilidad operacional.

> Estado del proyecto: versión previa a producción. El repositorio debe mantenerse **privado** mientras finalizan las validaciones operativas, legales y de despliegue.

## Funciones principales

- Administración global de empresas, planes y módulos.
- Separación de datos por empresa y sucursal.
- Administración de usuarios y estados de acceso.
- Roles de superadministrador, administrador de empresa, jefe de taller y técnico.
- Creación y seguimiento de órdenes de trabajo.
- Flujo configurable con ingreso, evaluación, mantención, pruebas y despacho.
- Checklists, evidencias fotográficas y comentarios.
- Aprobaciones del jefe de taller.
- Gestión de repuestos.
- Carta Gantt.
- Informes PDF personalizables por empresa.
- Clientes y equipos.
- Eliminación segura de usuarios y empresas mediante backend.
- Medición automática del almacenamiento utilizado por cada empresa.

## Tecnologías

- HTML, CSS y JavaScript.
- Firebase Authentication.
- Cloud Firestore.
- Cloud Storage.
- Cloud Functions de segunda generación.
- Firebase Local Emulator Suite.
- Node.js 22 para Cloud Functions.

## Estructura principal

```text
css/          Estilos visuales
docs/         Documentación de arquitectura
functions/    Backend administrativo seguro
img/          Imágenes, logotipos e iconos
js/           Aplicación y módulos operativos
tests/        Pruebas de reglas de seguridad
```

## Requisitos locales

- Node.js 22.
- npm.
- Firebase CLI.
- Acceso autorizado al proyecto Firebase correspondiente.

## Instalación

Desde la raíz del proyecto:

```powershell
npm.cmd install
npm.cmd --prefix functions install
```

No deben copiarse ni publicarse las carpetas `node_modules`; se regeneran con estos comandos.

## Validación de seguridad

Ejecutar desde la raíz:

```powershell
npm.cmd test
```

La validación comprueba:

- Sintaxis de las Cloud Functions.
- Cálculo de avisos y bloqueo por cuota de almacenamiento.
- Aislamiento entre empresas.
- Permisos por rol.
- Protección de perfiles de usuario.
- Acceso a órdenes de trabajo.
- Lectura, carga y eliminación de archivos en Storage.

El resultado esperado actualmente es:

```text
tests 80
pass 80
fail 0
```

Los mensajes `PERMISSION_DENIED` que aparecen durante las pruebas negativas son esperados: demuestran que Firebase bloquea las operaciones prohibidas.

## Emuladores locales

```powershell
firebase.cmd emulators:start --only auth,functions,firestore,storage
```

La interfaz de emuladores queda disponible normalmente en `http://127.0.0.1:4000/`.

## Despliegue

Antes de desplegar, seleccionar explícitamente el proyecto correcto:

```powershell
firebase.cmd use <PROJECT_ID>
npm.cmd test
firebase.cmd deploy --only functions,firestore:rules,storage --project <PROJECT_ID>
```

No desplegar si las pruebas no terminan con `fail 0`.

### Interfaz web en Firebase Hosting

El comando de despliegue construye automáticamente una carpeta `dist` limpia,
sin respaldos, registros, pruebas ni archivos internos:

```powershell
npm.cmd run build:production
firebase.cmd deploy --only hosting --project overtrack-42387
```

La dirección inicial del sitio es `https://overtrack-42387.web.app`. El dominio
propio se conecta posteriormente desde Firebase Hosting, manteniendo HTTPS.

## Seguridad

- Los perfiles de usuario se crean y administran mediante Cloud Functions.
- Firestore y Storage aplican separación por empresa.
- Las operaciones administrativas validan rol, empresa y estado del usuario.
- Las contraseñas temporales deben cambiarse durante el primer acceso.
- Los usuarios desactivados no pueden iniciar sesión.
- Las llaves privadas, archivos `.env`, respaldos, registros y dependencias están excluidos mediante `.gitignore`.
- La configuración web pública de Firebase no reemplaza las reglas de seguridad ni las restricciones de la clave API.

Nunca incorporar al repositorio:

- Cuentas de servicio de Firebase o Google Cloud.
- Llaves privadas o certificados.
- Variables de entorno con secretos.
- Contraseñas reales o temporales.
- Exportaciones con datos reales de clientes.
- Registros de depuración.

## Documentación adicional

La descripción técnica y el modelo multiempresa están disponibles en [`docs/ARQUITECTURA_OVERTRACK.md`](docs/ARQUITECTURA_OVERTRACK.md).

## Licencia y uso

Software privado y propietario. No está autorizado su uso, copia, distribución o publicación sin permiso expreso de su titular.
