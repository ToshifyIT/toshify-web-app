# Toshify Web App

## Sistema de Gestión de Flotas y Conductores

![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.1-646CFF?logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Self--Hosted-3FCF8E?logo=supabase&logoColor=white)
![License](https://img.shields.io/badge/License-Proprietary-red)

Plataforma empresarial para la gestión integral de flotas de vehículos, sincronización con proveedores de movilidad (Cabify, USS) y monitoreo en tiempo real de conductores mediante integración con Wialon GPS.

---

## Tabla de Contenidos

- [Características Principales](#características-principales)
- [Arquitectura del Sistema](#arquitectura-del-sistema)
- [Integraciones](#integraciones)
- [Tecnologías](#tecnologías)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Edge Functions](#edge-functions)
- [Base de Datos](#base-de-datos)
- [Despliegue](#despliegue)

---

## Características Principales

### Gestión de Flotas
- **Dashboard en tiempo real** con métricas de rendimiento
- **Seguimiento GPS** integrado con Wialon
- **Gestión de vehículos** y asignaciones
- **Control de mantenimientos** y documentación

### Módulo Cabify
- **Sincronización automática** cada 5 minutos via Edge Functions
- **Histórico de conductores** con métricas detalladas
- **Rankings de rendimiento** (mejores/peores conductores)
- **Actualización en tiempo real** via Supabase Realtime
- **Soporte multi-país** (Argentina, Perú)

### Módulo USS (Urban Speed Services)
- **Monitoreo de velocidad** y excesos
- **Reportes de kilometraje** diario/semanal
- **Alertas automáticas** de infracciones
- **Integración con bitácora** de viajes

### Sistema de Permisos
- **Roles personalizables** (Admin, Supervisor, Operador)
- **Permisos granulares** por menú y acción
- **Auditoría completa** de cambios

---

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vercel)                        │
│                     React + TypeScript + Vite                   │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE SELF-HOSTED                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Auth       │  │  Realtime   │  │  Edge Functions         │  │
│  │  (GoTrue)   │  │  (WebSocket)│  │  (Deno Runtime)         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    PostgreSQL                               ││
│  │  cabify_historico │ uss_historico │ user_profiles          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      APIs EXTERNAS                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Cabify     │  │  Wialon     │  │  USS                    │  │
│  │  GraphQL    │  │  REST API   │  │  API                    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Integraciones

### Cabify Partners API
| Endpoint | Descripción |
|----------|-------------|
| `metafleetCompanies` | Obtiene IDs de compañías |
| `paginatedDrivers` | Lista conductores con paginación |
| `driver.stats` | Estadísticas de rendimiento |
| `paginatedJourneys` | Historial de viajes |

### Wialon GPS
| Función | Descripción |
|---------|-------------|
| Ubicación en tiempo real | Tracking de vehículos |
| Excesos de velocidad | Alertas automáticas |
| Kilometraje | Reportes diarios |
| Bitácora | Registro de viajes |

### USS (Urban Speed Services)
| Módulo | Descripción |
|--------|-------------|
| Excesos | Monitoreo de infracciones |
| Kilometraje | Control de distancias |
| Histórico | Datos de rendimiento |

---

## Tecnologías

### Frontend
| Tecnología | Versión | Uso |
|------------|---------|-----|
| React | 18.3 | UI Framework |
| TypeScript | 5.6 | Type Safety |
| Vite | 7.1 | Build Tool |
| TanStack Table | 8.x | Tablas avanzadas |
| Recharts | 2.x | Gráficos |
| SweetAlert2 | 11.x | Notificaciones |

### Backend
| Tecnología | Versión | Uso |
|------------|---------|-----|
| Supabase | Self-hosted | BaaS |
| PostgreSQL | 15.x | Base de datos |
| Deno | 1.x | Edge Functions |
| Kong | 3.x | API Gateway |

### Infraestructura
| Servicio | Uso |
|----------|-----|
| Vercel | Frontend hosting |
| Dokploy | Supabase Self-hosted |
| DigitalOcean | VPS Server |

---

## Instalación

### Requisitos Previos
- Node.js 18+
- npm 9+
- Git

### Clonar Repositorio
```bash
git clone https://github.com/tu-org/toshify-web-app.git
cd toshify-web-app
```

### Instalar Dependencias
```bash
npm install
```

### Iniciar Desarrollo
```bash
npm run dev
```

---

## Configuración

### Variables de Entorno

Crear archivo `.env` en la raíz del proyecto:

```env
# Supabase Self-Hosted
VITE_SUPABASE_URL=https://supabase.tudominio.com
VITE_SUPABASE_ANON_KEY=tu-anon-key

# Cabify API (opcional - solo para Edge Functions)
CABIFY_CLIENT_ID=tu-client-id
CABIFY_CLIENT_SECRET=tu-client-secret
CABIFY_USERNAME=tu-usuario
CABIFY_PASSWORD=tu-password

# Wialon API
WIALON_TOKEN=tu-token-wialon
```

---

## Estructura del Proyecto

```
toshify-web-app/
├── src/
│   ├── components/          # Componentes reutilizables
│   │   ├── admin/          # Gestión de usuarios y permisos
│   │   ├── layout/         # Layout principal
│   │   └── ui/             # Componentes de UI
│   ├── modules/            # Módulos de negocio
│   │   └── integraciones/
│   │       ├── cabify/     # Módulo Cabify
│   │       ├── uss/        # Módulo USS
│   │       └── wialon/     # Módulo Wialon
│   ├── services/           # Servicios y APIs
│   ├── lib/                # Utilidades y configuración
│   ├── types/              # Tipos TypeScript
│   └── styles/             # Estilos globales
├── supabase/
│   ├── functions/          # Edge Functions
│   │   ├── sync-cabify-current-week/
│   │   ├── sync-cabify-realtime/
│   │   ├── sync-uss-excesos/
│   │   └── sync-wialon-uss/
│   └── migrations/         # Migraciones SQL
├── public/                 # Assets estáticos
└── dist/                   # Build de producción
```

---

## Edge Functions

### Sincronización Cabify

| Función | Frecuencia | Descripción |
|---------|------------|-------------|
| `sync-cabify-current-week` | Cada 5 min | Sincroniza semana actual |
| `sync-cabify-realtime` | Cada 5 min | Actualiza día en curso |

**Características:**
- Autenticación OAuth con Cabify
- Procesamiento en batches de 50 conductores
- Placeholder DNI para conductores sin documento (`CABIFY_${driver_id}`)
- Manejo de errores con retry automático
- Logging detallado en `cabify_sync_log`

### Sincronización USS

| Función | Frecuencia | Descripción |
|---------|------------|-------------|
| `sync-uss-excesos` | Cada hora | Excesos de velocidad |
| `sync-uss-kilometraje` | Diario | Kilometraje por vehículo |

---

## Base de Datos

### Tablas Principales

```sql
-- Histórico de Cabify
cabify_historico (
  id, cabify_driver_id, dni, nombre, apellido,
  viajes_finalizados, ganancia_total, horas_conectadas,
  tasa_aceptacion, fecha_inicio, fecha_fin, pais_id
)

-- Histórico de USS
uss_historico (
  id, conductor_id, kilometraje, fecha, pais_id
)

-- Excesos de Velocidad
uss_excesos_velocidad (
  id, vehiculo_id, velocidad, ubicacion, fecha
)

-- Usuarios y Permisos
user_profiles (id, email, role_id, nombre, activo)
roles (id, nombre, descripcion)
menu_permissions (role_id, menu_id, can_view)
```

### Realtime Habilitado
- `cabify_historico` - Actualización automática de UI
- `uss_historico` - Sync en tiempo real
- `uss_excesos_velocidad` - Alertas instantáneas

---

## Despliegue

### Build de Producción
```bash
npm run build
```

### Deploy a Vercel
```bash
vercel --prod
```

### Deploy Edge Functions (Self-hosted)
```bash
# Copiar al servidor
scp -r supabase/functions/* root@servidor:/path/to/volumes/functions/

# Reiniciar contenedor
ssh root@servidor "docker restart supabase-edge-functions"
```

---

## Scripts Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run preview` | Preview del build |
| `npm run lint` | Ejecuta ESLint |

---

## Licencia

Este software es propietario y confidencial. Todos los derechos reservados.

© 2024 Toshify - Sistema de Gestión de Flotas

---

## Contacto

Para soporte técnico o consultas:
- **Email:** soporte@toshify.com
- **Documentación:** [docs.toshify.com](https://docs.toshify.com)
