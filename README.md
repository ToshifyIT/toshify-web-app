# Toshify Web App

## Sistema de Gestion de Flotas y Conductores

![React](https://img.shields.io/badge/React-19.1-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.1-646CFF?logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Cloud-3FCF8E?logo=supabase&logoColor=white)
![License](https://img.shields.io/badge/License-Proprietary-red)

Plataforma empresarial para la gestion integral de flotas de vehiculos, conductores, facturacion, asignaciones, incidencias y sincronizacion con proveedores de movilidad (Cabify, USS/Wialon).

---

## Tabla de Contenidos

- [Caracteristicas Principales](#caracteristicas-principales)
- [Modulos](#modulos)
- [Tecnologias](#tecnologias)
- [Instalacion](#instalacion)
- [Scripts Disponibles](#scripts-disponibles)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Git Hooks](#git-hooks)
- [Despliegue](#despliegue)

---

## Caracteristicas Principales

### Gestion de Flotas
- **Dashboard en tiempo real** con metricas de rendimiento (Estado de Flota)
- **Seguimiento GPS** integrado con Wialon
- **Gestion de vehiculos** con filtros por estado, GNC, titular y mas
- **Control de kilometraje** y documentacion
- **Registro de vencimientos** de documentos

### Onboarding y Asignaciones
- **Programacion de entregas** con wizard paso a paso (Sede, Modalidad, Vehiculo, Conductores, Detalles)
- **Asignaciones activas** con columnas sticky y vista detallada
- **Auto-deteccion de tipo de candidato** (Nuevo/Antiguo/Reingreso)
- **Gestion de bajas** con proteccion del companero en modalidad TURNO
- **Zonas peligrosas** y control de areas

### Facturacion
- **Vista previa semanal** con calculo on-the-fly
- **Generacion y recalculo de periodos** (abierto/cerrado)
- **Descuentos automaticos por hora de entrega** (parametrizables)
- **Cobros fraccionados** con cuotas semanales
- **Incidencias (cobro)** con reasignacion de semana
- **Integracion con Cabify** para peajes y pagos
- **Garantias** y saldos de conductores
- **Export a Excel y PDF** individual y masivo

### Conductores
- **Gestion completa** con estados, licencias, datos de contacto
- **Historial de vehiculos** con asignaciones activas/finalizadas/programadas
- **Seguimiento semanal** de conductores

### Integracion Cabify
- **Sincronizacion automatica** via cron jobs
- **Historico de conductores** con metricas detalladas (score, tasa aceptacion, horas)
- **Rankings de rendimiento** (Top 10 mejores/peores)
- **Ultima fecha de sync** visible en header
- **Soporte multi-sede** (Buenos Aires, Bariloche)

### Integracion USS / Wialon
- **Bitacora de marcaciones** con datos enriquecidos desde asignaciones
- **Control de exceso de velocidad**
- **Historico de kilometraje** diario/semanal
- **Checklist por conductor** (GNC, Lavado, Nafta) con iconos descriptivos

### Incidencias
- **Incidencias logisticas** y de cobro
- **Flujo de aprobacion** (Por Aplicar, Aplicadas, Rechazadas)
- **Reasignacion de semana** para cobros
- **Penalidades** con fraccionamiento en cuotas

### Siniestros
- **Registro y seguimiento** de siniestros vehiculares

### Gestion de Visitas
- **Calendario semanal/mensual** de citas
- **Categorias** (Logistica, Directivo, etc.)
- **Visitas Directivo** ocultas para usuarios no autorizados
- **Permisos granulares** (ver/crear/editar) por rol

### Multas y Telepase
- **Registro de multas** e infracciones
- **Gestion de Telepase** por vehiculo

### Logistica
- **Dashboard de inventario**
- **Proveedores y productos**
- **Pedidos y movimientos**

### Reportes
- **Dashboard KPIs** con graficos (Recharts)
- **Facturacion** semanal detallada

### Parametros del Sistema
- **Conceptos de facturacion** (precios de alquiler, garantia, etc.)
- **Configuracion USS** (horarios de turno)
- **Configuracion Asignaciones** (descuentos por hora de entrega)
- **Rango seguimiento guias**

### Sistema de Permisos
- **Roles personalizables** (Admin, Supervisor, Operador, Adm Logistico, Directivo)
- **Permisos granulares** por menu y accion (ver/crear/editar/eliminar)
- **Menu por Rol** y **Menu por Usuario**
- **Multi-sede** con selector de sede

---

## Modulos

| Modulo | Ruta | Descripcion |
|--------|------|-------------|
| Estado de Flota | `/estado-flota` | Dashboard principal |
| Programaciones | `/onboarding/programaciones` | Programar entregas |
| Asignaciones | `/onboarding/asignaciones` | Gestionar asignaciones activas |
| Gestion Vehiculos | `/vehiculos` | CRUD de vehiculos |
| Conductores | `/conductores` | CRUD de conductores |
| Incidencias | `/incidencias` | Incidencias logisticas y cobros |
| Siniestros | `/siniestros` | Registro de siniestros |
| Facturacion | `/reportes/facturacion` | Facturacion semanal |
| Dashboard KPIs | `/reportes/dashboard` | KPIs y graficos |
| Cabify | `/integraciones/cabify` | Historico Cabify |
| Bitacora USS | `/integraciones/uss/bitacora` | Marcaciones Wialon |
| Visitas | `/visitas` | Gestion de citas |
| Multas | `/multas-telepase/multas` | Multas vehiculares |
| Telepase | `/multas-telepase/telepase` | Gestion Telepase |
| Parametros | `/parametros/*` | Configuracion del sistema |
| Administracion | `/administracion/*` | Usuarios, roles, menus, sedes |

---

## Tecnologias

| Categoria | Tecnologia |
|-----------|------------|
| Framework | React 19 + React Router 7 |
| Language | TypeScript 5.9 (strict mode) |
| Build | Vite 7 |
| CSS | Tailwind CSS 4 |
| Database | Supabase (PostgreSQL) |
| Tables | TanStack React Table |
| Charts | Recharts |
| PDF | jsPDF + html2canvas |
| Validation | Zod |
| Icons | Lucide React |
| HTTP | Axios |
| Alerts | SweetAlert2 |
| Git Hooks | Husky + lint-staged |

---

## Instalacion

### Requisitos Previos
- Node.js 18+
- npm 9+
- Git

### Clonar Repositorio
```bash
git clone https://github.com/ToshifyIT/toshify-web-app.git
cd toshify-web-app
```

### Instalar Dependencias
```bash
npm install
```

### Configurar Variables de Entorno
Crear archivo `.env` en la raiz:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

### Iniciar Desarrollo
```bash
npm run dev
```

---

## Scripts Disponibles

### Desarrollo
```bash
npm run dev              # Servidor de desarrollo (mode development)
npm run dev:prod         # Servidor de desarrollo (mode production)
npm run dev:api          # API server local (PORT=3001)
npm run lint             # Ejecutar ESLint
npm run lint -- --fix    # Auto-fix errores de lint
npm run build            # Build de produccion (tsc + vite)
npm run preview          # Preview del build
npm start                # Servidor de produccion
```

### Sincronizacion de Datos
```bash
npm run sync:cabify              # Sync Cabify historico
npm run sync:cabify:weekly       # Sync ultima semana
npm run sync:cabify:realtime     # Sync tiempo real
npm run sync:uss                 # Sync USS Kilometraje
npm run sync:wialon:bitacora     # Sync Wialon Bitacora
npm run scheduler                # Daemon de sincronizacion
```

---

## Estructura del Proyecto

```
toshify-web-app/
├── src/
│   ├── components/       # Componentes reutilizables
│   │   ├── ui/          # Componentes base (Button, Modal, DataTable)
│   │   └── forms/       # Componentes de formularios
│   ├── contexts/        # React Context providers
│   │   ├── AuthContext.tsx
│   │   ├── PermissionsContext.tsx
│   │   ├── SedeContext.tsx
│   │   └── ThemeContext.tsx
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Configuracion (Supabase client)
│   ├── modules/         # Modulos de funcionalidad
│   │   ├── asignaciones/
│   │   ├── conductores/
│   │   ├── facturacion/
│   │   ├── incidencias/
│   │   ├── integraciones/
│   │   │   ├── cabify/
│   │   │   └── uss/bitacora/
│   │   ├── onboarding/
│   │   ├── siniestros/
│   │   ├── vehiculos/
│   │   └── visitas/
│   ├── pages/           # Paginas (rutas)
│   │   ├── parametros/
│   │   └── integraciones/
│   ├── services/        # Clientes API y logica de negocio
│   ├── types/           # Tipos TypeScript
│   └── utils/           # Funciones utilitarias
├── scripts/             # Scripts de sincronizacion
├── .husky/              # Git hooks
├── instructions/        # Reglas y documentacion interna
├── AGENTS.md            # Guia para agentes de codigo
└── README.md
```

---

## Git Hooks

El proyecto usa **Husky** para validar codigo antes de commits y pushes.

### Pre-commit
Ejecuta lint-staged en archivos modificados:
- ESLint con auto-fix en `*.ts`, `*.tsx`
- Validacion de tipos TypeScript

### Pre-push
Ejecuta build completo antes de push:
- `tsc -b` - Compilacion TypeScript
- `vite build` - Build de produccion

Si el build falla, el push se bloquea automaticamente.

### Ejecutar Validaciones Manualmente
```bash
npm run lint             # Verificar errores de lint
npm run build            # Verificar build completo
```

---

## Despliegue

### CI/CD Pipeline

```
development → [Build + Lint] → staging → main → [Deploy]
```

### Build de Produccion
```bash
npm run build
```

El build genera archivos optimizados en `/dist`.

### Docker
```bash
docker build -t toshify-web-app .
docker run -p 3000:3000 toshify-web-app
```

---

## Documentacion para Agentes

Ver [AGENTS.md](./AGENTS.md) para guias de estilo de codigo, convenciones y comandos utiles para agentes de IA que trabajan en este repositorio.

---

## Licencia

Este software es propietario y confidencial. Todos los derechos reservados.

© 2025-2026 Toshify - Sistema de Gestion de Flotas

---
