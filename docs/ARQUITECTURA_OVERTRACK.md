# OVERTRACK 2.0 — Arquitectura Multiempresa

## 1. Visión general

OverTrack será una plataforma web multiempresa para la gestión de órdenes de servicio, mantenimiento, evidencias técnicas, checklist, aprobaciones, reportes PDF y trazabilidad operacional.

El sistema permitirá que múltiples empresas utilicen la misma plataforma, manteniendo sus datos separados por empresa y sucursal.

## 2. Objetivo principal

Transformar OverTrack desde un sistema operativo de taller a una plataforma SaaS multiempresa, donde cada empresa pueda administrar sus usuarios, sucursales, órdenes de servicio y reportes.

## 3. Estructura general

Super Administrador  
→ Empresas  
→ Sucursales  
→ Usuarios  
→ Órdenes de Servicio  

## 4. Roles principales

### Super Administrador

Rol reservado para el creador o dueño de la plataforma.

Puede:
- Crear empresas.
- Editar empresas.
- Activar o desactivar empresas.
- Crear administradores de empresa.
- Ver estadísticas globales.
- Administrar planes.
- Dar soporte a empresas.

### Administrador Empresa

Rol asignado al cliente responsable de administrar su empresa dentro de OverTrack.

Puede:
- Ver solo su empresa.
- Crear sucursales.
- Crear usuarios.
- Crear jefes de taller.
- Crear técnicos.
- Ver reportes de su empresa.
- Configurar datos básicos de la empresa.

### Jefe de Taller

Rol operativo con permisos de supervisión.

Puede:
- Crear órdenes de servicio.
- Cargar checklist.
- Planificar Gantt.
- Aprobar etapas.
- Generar informes PDF.
- Ver OS de su sucursal.

### Usuario Taller

Rol operativo técnico.

Puede:
- Completar checklist.
- Subir fotografías.
- Agregar comentarios.
- Guardar avances.
- Ver OS asignadas o de su sucursal.

## 5. Principio clave de seguridad

Cada documento importante debe tener:

- empresaId
- sucursalId
- creadoPor
- fechaCreacion
- fechaActualizacion

Esto permitirá separar correctamente los datos entre empresas y sucursales.

## 6. Colecciones principales de Firebase

- empresas
- sucursales
- usuarios
- ots

## 7. Estado actual

OverTrack ya cuenta con:

- Login.
- Roles básicos.
- Firestore.
- Storage.
- Dashboard.
- Flujo de OS.
- Checklist.
- Evidencias.
- Comentarios.
- Aprobaciones.
- Carta Gantt.
- Informe PDF.
- empresaId y sucursalId en las OS.

## 8. Próximo objetivo

Construir el Panel Super Administrador para gestionar:

- Empresas.
- Sucursales.
- Usuarios.
- Estado de empresas.
- Planes.


---

# 9. Modelo extendido de datos

## Colección: clientes

Cada empresa puede registrar sus propios clientes.

Campos:

- id
- empresaId
- nombre
- rut
- giro
- correo
- telefono
- direccion
- ciudad
- pais
- contactoPrincipal
- telefonoContacto
- correoContacto
- activo
- fechaCreacion
- fechaActualizacion

Relación:

Empresa → Clientes

---

## Colección: equipos

Cada equipo pertenece a un cliente y a una empresa.

Campos:

- id
- empresaId
- clienteId
- sucursalId

- nombre
- tipo
- marca
- modelo
- serie
- codigoInterno
- ubicacion

- estado
- fechaRegistro
- fechaUltimaMantencion
- observaciones

Relación:

Empresa → Cliente → Equipos

---

## Colección: historialEquipos

Cada registro representa un evento histórico asociado a un equipo.

Campos:

- id
- empresaId
- clienteId
- equipoId
- otId

- tipoEvento
- descripcion
- fecha
- creadoPor
- responsable

Ejemplos de eventos:

- OS creada
- Ingreso registrado
- Evaluación completada
- Mantención completada
- Pruebas aprobadas
- Despacho realizado
- Informe PDF generado

---

## Colección: planes

Representa los planes comerciales disponibles para empresas.

Campos:

- id
- nombre
- precioMensual
- maxUsuarios
- maxSucursales
- maxStorageGB
- maxOSMensuales
- incluyePDF
- incluyeGantt
- incluyePortalCliente
- incluyeInventario
- activo

Ejemplos:

- Starter
- Professional
- Enterprise

---

## Colección: logsSistema

Registra acciones importantes dentro de la plataforma.

Campos:

- id
- empresaId
- sucursalId
- usuarioId
- rol
- accion
- modulo
- detalle
- fecha
- ip
- navegador

Ejemplos:

- Usuario creado
- Empresa desactivada
- OS eliminada
- Informe generado
- Etapa aprobada
- Checklist cargado



---

# 11. Arquitectura OverTrack v1.0

## 11.1 Estructura general del sistema

OverTrack se dividirá en tres grandes niveles:

1. Super Administrador
2. Administrador de Empresa
3. Operación de Taller

---

## 11.2 Super Administrador

Panel exclusivo del dueño de la plataforma.

Módulos:

- Dashboard global
- Empresas
- Planes
- Usuarios globales
- Estadísticas
- Configuración general

Funciones principales:

- Crear empresas
- Activar/desactivar empresas
- Administrar planes
- Acceder al panel de una empresa
- Revisar uso global del sistema

---

## 11.3 Administrador de Empresa

Panel interno para cada empresa cliente.

Módulos:

- Dashboard empresa
- Usuarios
- Sucursales
- Clientes
- Equipos
- Órdenes de Servicio
- Reportes
- Configuración

Funciones principales:

- Crear usuarios de su empresa
- Crear sucursales
- Crear clientes
- Crear equipos
- Revisar indicadores de operación
- Acceder al dashboard del taller

---

## 11.4 Operación de Taller

Módulo operativo actual de OverTrack.

Módulos:

- Dashboard operativo
- Órdenes de Servicio
- Flujo de trabajo
- Checklist
- Evidencias
- Comentarios
- Gantt
- Informe PDF

Roles:

- Jefe de Taller
- Usuario Taller

---

## 11.5 Estructura de carpetas recomendada

```txt
css/
  super-admin.css
  empresa-admin.css
  styles.css

js/
  firebase-config.js
  login.js
  protected.js

  super-admin.js
  empresa-admin.js

  components/
    wizard.js
    modal.js
    toast.js
    datatable.js

  empresa/
    usuarios.js
    sucursales.js
    clientes.js
    equipos.js
    configuracion.js

  superadmin/
    empresas.js
    planes.js
    dashboard.js

  taller/
    dashboard.js
    ordenes.js
    flujo.js