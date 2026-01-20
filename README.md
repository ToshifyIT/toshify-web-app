# Toshify Web App

## Sistema de Gestion de Flotas y Conductores

![React](https://img.shields.io/badge/React-19.1-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.1-646CFF?logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Cloud-3FCF8E?logo=supabase&logoColor=white)
![License](https://img.shields.io/badge/License-Proprietary-red)

Plataforma empresarial para la gestion integral de flotas de vehiculos, sincronizacion con proveedores de movilidad (Cabify, USS) y monitoreo en tiempo real de conductores mediante integracion con Wialon GPS.

---

## Tabla de Contenidos

- [Caracteristicas Principales](#caracteristicas-principales)
- [Tecnologias](#tecnologias)
- [Instalacion](#instalacion)
- [Scripts Disponibles](#scripts-disponibles)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Git Hooks](#git-hooks)
- [Despliegue](#despliegue)

---

## Caracteristicas Principales

### Gestion de Flotas
- **Dashboard en tiempo real** con metricas de rendimiento
- **Seguimiento GPS** integrado con Wialon
- **Gestion de vehiculos** y asignaciones
- **Control de mantenimientos** y documentacion

### Modulo Cabify
- **Sincronizacion automatica** via cron jobs en Supabase
- **Historico de conductores** con metricas detalladas
- **Rankings de rendimiento** (mejores/peores conductores)
- **Soporte multi-pais** (Argentina, Peru)

### Modulo USS (Urban Speed Services)
- **Monitoreo de velocidad** y excesos
- **Reportes de kilometraje** diario/semanal
- **Alertas automaticas** de infracciones

### Sistema de Permisos
- **Roles personalizables** (Admin, Supervisor, Operador)
- **Permisos granulares** por menu y accion
- **Auditoria completa** de cambios

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
│   │   └── ThemeContext.tsx
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Configuracion (Supabase client)
│   ├── modules/         # Modulos de funcionalidad
│   │   ├── facturacion/
│   │   ├── siniestros/
│   │   └── incidencias/
│   ├── pages/           # Paginas (rutas)
│   ├── services/        # Clientes API y logica de negocio
│   ├── types/           # Tipos TypeScript
│   └── utils/           # Funciones utilitarias
├── scripts/             # Scripts de sincronizacion
├── .husky/              # Git hooks
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

© 2025 Toshify - Sistema de Gestion de Flotas

---

## Contacto

- **Email:** soporte@toshify.com
