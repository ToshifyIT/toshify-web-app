# ANÁLISIS Y OPTIMIZACIÓN - INTEGRACIÓN CABIFY

## 📊 ANÁLISIS DE SITUACIÓN ACTUAL

### 1. Implementación Existente

#### Archivos Principales
- **`cabifyService.ts`** (1,636 líneas): Servicio principal de API
- **`cabifyIntegrationService.ts`** (198 líneas): Integración con BD Supabase
- **`stream-cabify-data/index.ts`** (276 líneas): Edge function para streaming
- **`cabify_historico`**: Tabla con 1,694 registros históricos

#### Funcionalidades Actuales

**✅ Implementado:**
- Autenticación OAuth con Cabify
- Consulta de conductores de múltiples compañías
- Obtención de estadísticas y viajes
- Batching de queries GraphQL para optimización
- Caché de assets (vehículos)
- Cálculo de métricas (tasas, ganancias, peajes)
- Manejo de timezone Argentina
- Streaming en tiempo real
- Tabla `cabify_historico` con estructura completa

**❌ NO Implementado:**
- Persistencia automática cada 10 minutos
- Script de sincronización automatizada
- Consultas que combinan datos históricos + actuales
- Sistema de caché para datos históricos
- Índices de base de datos para optimizar búsquedas
- Detección de períodos ya guardados (evitar duplicados)

### 2. Análisis de Tabla `cabify_historico`

#### Estructura (35 columnas)
```sql
Campos de identificación:
- id (uuid, PK)
- cabify_driver_id (varchar)
- cabify_company_id (varchar)

Campos temporales:
- fecha_inicio (timestamptz) - Inicio del período consultado
- fecha_fin (timestamptz) - Fin del período consultado
- fecha_guardado (timestamptz) - Cuándo se guardó el registro

Datos personales:
- nombre, apellido, email, dni, licencia
- telefono_codigo, telefono_numero

Datos de vehículo:
- vehiculo_id, vehiculo_patente, vehiculo_marca, vehiculo_modelo, vehiculo_completo

Métricas de viajes:
- viajes_finalizados, viajes_rechazados, viajes_perdidos
- viajes_aceptados, viajes_ofrecidos

Estadísticas:
- score, tasa_aceptacion, tasa_ocupacion
- horas_conectadas, horas_conectadas_formato

Ganancias:
- cobro_efectivo, cobro_app, peajes
- ganancia_total, ganancia_por_hora

Otros:
- permiso_efectivo, estado_conductor
```

#### Datos Actuales
- **Período histórico**: Sept 8, 2025 - Nov 24, 2025 (~2.5 meses)
- **Conductores únicos**: 154
- **Total registros**: 1,694
- **Último guardado**: Nov 25, 2025 05:21:15 UTC
- **Problema**: Todos los datos se guardaron en una sola sesión (12 minutos)

#### Problemas Identificados
1. ❌ **Sin índices** en fecha_inicio, fecha_fin → búsquedas lentas
2. ❌ **Sin constraint único** → permite duplicados
3. ❌ **Sin particionamiento** → tabla crecerá indefinidamente
4. ❌ **Sin campo de versión/hash** → difícil detectar cambios
5. ❌ **Guardado manual** → no hay sincronización automática

### 3. Análisis de API Cabify

#### Endpoints Principales (Según Documentación)
```graphql
Queries disponibles:
- metafleetCompanies: Lista de compañías
- paginatedDrivers: Conductores paginados
- driver: Detalles de conductor individual + stats
- paginatedJourneys: Viajes paginados
- asset: Información de vehículo
- balances: Balances para peajes
- paginatedBalanceMovements: Movimientos de balance

Limitaciones observadas:
- Stats requiere DateTime! (formato ISO)
- Journeys requiere String! para fechas
- Paginación: perPage max ~500
- Rate limiting: No documentado explícitamente
- Tokens expiran (expires_in en respuesta)
```

#### Mejores Prácticas Identificadas
1. ✅ Usar batching con aliases GraphQL (ya implementado)
2. ✅ Caché de assets para reducir queries (ya implementado)
3. ✅ Procesamiento paralelo de compañías (ya implementado)
4. ⚠️ Evitar consultas repetidas de períodos ya guardados (NO implementado)

---

## 🎯 PROPUESTAS DE OPTIMIZACIÓN

### PROPUESTA 1: Sistema de Persistencia Automática

#### Diseño

**Arquitectura:**
```
Edge Function (Deno)
  ├── Trigger: Cron cada 10 minutos
  ├── Lógica:
  │   1. Calcular período actual (últimos 10 min)
  │   2. Verificar si ya existe en BD
  │   3. Consultar API Cabify
  │   4. Guardar en cabify_historico
  │   5. Logging + alertas
  └── Manejo de errores + retry
```

**Implementación:**
- Nueva Edge Function: `sync-cabify-historical`
- Configuración: Supabase Cron Jobs
- Frecuencia: Cada 10 minutos
- Almacenamiento: Tabla `cabify_historico` + nueva tabla `cabify_sync_log`

**Ventajas:**
- ✅ Datos siempre actualizados
- ✅ Sin intervención manual
- ✅ Granularidad fina (10 min)
- ✅ Serverless (sin infraestructura adicional)

**Desventajas:**
- ⚠️ Costos de Edge Function frecuente
- ⚠️ Puede generar muchos registros
- ⚠️ Requiere monitoreo de fallos

### PROPUESTA 2: Optimización de Consultas Híbridas

#### Estrategia: Combinar Histórico + Actual

**Flujo de Consulta Optimizado:**
```typescript
function getDriversData(startDate, endDate) {
  // 1. Verificar qué períodos ya están en cabify_historico
  const historicalPeriods = await checkHistoricalCoverage(startDate, endDate)

  // 2. Identificar gaps (períodos faltantes)
  const gaps = calculateGaps(startDate, endDate, historicalPeriods)

  // 3. Si TODO está en histórico → retornar desde BD (RÁPIDO)
  if (gaps.length === 0) {
    return await queryHistorical(startDate, endDate)
  }

  // 4. Si hay gaps → consultar API solo para gaps (EFICIENTE)
  const gapData = await Promise.all(
    gaps.map(gap => cabifyService.getDriversWithDetails(gap.start, gap.end))
  )

  // 5. Combinar datos históricos + gaps
  const historical = await queryHistorical(
    startDate, endDate,
    { excludeGaps: gaps }
  )

  // 6. Merge y retornar
  return mergeDriversData(historical, ...gapData)
}
```

**Ventajas:**
- ✅ Reduce llamadas a API Cabify (ahorro de tiempo y rate limits)
- ✅ Respuestas instantáneas para períodos históricos
- ✅ Solo consulta lo necesario
- ✅ Escala bien con el tiempo

**Casos de Uso:**
1. **Semana completa en histórico** → 0 llamadas API, respuesta <500ms
2. **Última hora no en histórico** → Solo 1 llamada API
3. **Período parcial** → N llamadas (solo gaps)

### PROPUESTA 3: Script de Sincronización Automatizada

#### Opción A: Edge Function + Supabase Cron

```typescript
// supabase/functions/sync-cabify-weekly/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Calcular última semana completa (lunes a domingo)
    const { startDate, endDate } = getLastCompletedWeek()

    // 2. Verificar si ya existe
    const { data: existing } = await supabase
      .from('cabify_historico')
      .select('cabify_driver_id')
      .gte('fecha_inicio', startDate)
      .lte('fecha_fin', endDate)

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({
        status: 'skipped',
        message: 'Period already synced'
      }))
    }

    // 3. Consultar Cabify API
    const driversData = await getCabifyData(startDate, endDate)

    // 4. Guardar en BD
    const { error } = await supabase
      .from('cabify_historico')
      .insert(driversData.map(d => ({
        cabify_driver_id: d.id,
        cabify_company_id: d.companyId,
        fecha_inicio: startDate,
        fecha_fin: endDate,
        // ... resto de campos
      })))

    if (error) throw error

    // 5. Log de sync
    await supabase
      .from('cabify_sync_log')
      .insert({
        sync_type: 'weekly',
        period_start: startDate,
        period_end: endDate,
        records_synced: driversData.length,
        status: 'success'
      })

    return new Response(JSON.stringify({
      status: 'success',
      records: driversData.length,
      period: { startDate, endDate }
    }))

  } catch (error) {
    // Log error
    console.error('Sync failed:', error)
    return new Response(JSON.stringify({
      status: 'error',
      message: error.message
    }), { status: 500 })
  }
})
```

**Configuración Supabase Cron:**
```sql
-- Ejecutar cada lunes a las 00:00 (sincronizar semana anterior)
SELECT cron.schedule(
  'sync-cabify-weekly',
  '0 0 * * 1', -- Cron: lunes 00:00
  'SELECT net.http_post(
    url := ''https://YOUR_PROJECT.supabase.co/functions/v1/sync-cabify-weekly'',
    headers := jsonb_build_object(''Authorization'', ''Bearer '' || ''YOUR_ANON_KEY'')
  )'
);
```

#### Opción B: Script Node.js + Task Scheduler

```typescript
// scripts/sync-cabify-historical.ts

import { createClient } from '@supabase/supabase-js'
import { cabifyService } from '../src/services/cabifyService'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

interface SyncConfig {
  mode: 'daily' | 'weekly' | 'manual'
  weeksBack?: number
  startDate?: string
  endDate?: string
}

async function syncHistoricalData(config: SyncConfig) {
  console.log('🚀 Iniciando sincronización Cabify...')

  let periods: Array<{ startDate: string; endDate: string; label: string }> = []

  // Calcular períodos según modo
  if (config.mode === 'weekly') {
    const weeksBack = config.weeksBack || 1
    for (let i = 1; i <= weeksBack; i++) {
      periods.push(cabifyService.getWeekRange(i))
    }
  } else if (config.mode === 'manual') {
    periods = [{
      startDate: config.startDate!,
      endDate: config.endDate!,
      label: 'Manual'
    }]
  }

  let totalSynced = 0
  let totalSkipped = 0
  let errors = 0

  for (const period of periods) {
    console.log(`\n📅 Procesando período: ${period.label}`)
    console.log(`   Rango: ${period.startDate} - ${period.endDate}`)

    try {
      // Verificar si ya existe
      const { data: existing } = await supabase
        .from('cabify_historico')
        .select('id')
        .eq('fecha_inicio', period.startDate)
        .eq('fecha_fin', period.endDate)
        .limit(1)

      if (existing && existing.length > 0) {
        console.log(`   ⏭️  Ya existe, saltando...`)
        totalSkipped++
        continue
      }

      // Consultar API Cabify
      console.log(`   🔄 Consultando API Cabify...`)
      const drivers = await cabifyService.getDriversWithDetails(
        'custom',
        { startDate: period.startDate, endDate: period.endDate }
      )

      console.log(`   ✅ ${drivers.length} conductores obtenidos`)

      // Guardar en BD
      const records = drivers.map(d => ({
        cabify_driver_id: d.id,
        cabify_company_id: d.companyId,
        nombre: d.name,
        apellido: d.surname,
        email: d.email,
        dni: d.nationalIdNumber,
        licencia: d.driverLicense,
        telefono_codigo: d.mobileCc,
        telefono_numero: d.mobileNum,
        vehiculo_id: d.assetId,
        vehiculo_patente: d.vehicleRegPlate,
        vehiculo_marca: d.vehicleMake,
        vehiculo_modelo: d.vehicleModel,
        vehiculo_completo: d.vehiculo,
        fecha_inicio: period.startDate,
        fecha_fin: period.endDate,
        viajes_finalizados: d.viajesFinalizados,
        viajes_rechazados: d.viajesRechazados,
        viajes_perdidos: d.viajesPerdidos,
        viajes_aceptados: d.viajesAceptados,
        viajes_ofrecidos: d.viajesOfrecidos,
        score: d.score,
        tasa_aceptacion: d.tasaAceptacion,
        tasa_ocupacion: d.tasaOcupacion,
        horas_conectadas: d.horasConectadas,
        horas_conectadas_formato: d.horasConectadasFormato,
        cobro_efectivo: d.cobroEfectivo,
        cobro_app: d.cobroApp,
        peajes: d.peajes,
        ganancia_total: d.gananciaTotal,
        ganancia_por_hora: d.gananciaPorHora,
        permiso_efectivo: d.permisoEfectivo,
        estado_conductor: d.disabled ? 'Deshabilitado' : 'Activo'
      }))

      const { error } = await supabase
        .from('cabify_historico')
        .insert(records)

      if (error) {
        console.error(`   ❌ Error guardando:`, error)
        errors++
      } else {
        console.log(`   💾 ${records.length} registros guardados`)
        totalSynced += records.length
      }

    } catch (error) {
      console.error(`   ❌ Error en período:`, error)
      errors++
    }

    // Delay entre períodos para evitar rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  console.log(`\n\n📊 RESUMEN DE SINCRONIZACIÓN`)
  console.log(`   ✅ Registros sincronizados: ${totalSynced}`)
  console.log(`   ⏭️  Períodos saltados: ${totalSkipped}`)
  console.log(`   ❌ Errores: ${errors}`)
}

// CLI
const mode = process.argv[2] as 'daily' | 'weekly' | 'manual'
const weeksBack = parseInt(process.argv[3]) || 1

if (!mode) {
  console.log('Uso: npm run sync:cabify [mode] [weeksBack]')
  console.log('Modos: daily | weekly | manual')
  process.exit(1)
}

syncHistoricalData({ mode, weeksBack })
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
```

**package.json:**
```json
{
  "scripts": {
    "sync:cabify": "npx tsx scripts/sync-cabify-historical.ts",
    "sync:cabify:weekly": "npx tsx scripts/sync-cabify-historical.ts weekly 1",
    "sync:cabify:backfill": "npx tsx scripts/sync-cabify-historical.ts weekly 12"
  }
}
```

**Programación (Windows Task Scheduler o Linux Cron):**
```bash
# Linux cron: Cada lunes a las 2 AM
0 2 * * 1 cd /path/to/app && npm run sync:cabify:weekly

# Windows: Crear tarea programada en Task Scheduler
```

### PROPUESTA 4: Mejoras en Estructura de BD

#### Nuevas Tablas

**A. Tabla de log de sincronizaciones**
```sql
CREATE TABLE cabify_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type VARCHAR NOT NULL, -- 'realtime' | 'weekly' | 'manual'
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  records_synced INTEGER DEFAULT 0,
  status VARCHAR NOT NULL, -- 'success' | 'partial' | 'failed'
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para buscar histórico
CREATE INDEX idx_sync_log_period ON cabify_sync_log(period_start, period_end);
CREATE INDEX idx_sync_log_created ON cabify_sync_log(created_at DESC);
```

**B. Mejorar tabla cabify_historico**
```sql
-- Agregar índices para búsquedas rápidas
CREATE INDEX idx_historico_periodo ON cabify_historico(fecha_inicio, fecha_fin);
CREATE INDEX idx_historico_driver ON cabify_historico(cabify_driver_id, fecha_inicio);
CREATE INDEX idx_historico_company ON cabify_historico(cabify_company_id, fecha_inicio);

-- Constraint único para evitar duplicados
CREATE UNIQUE INDEX idx_historico_unique_period
  ON cabify_historico(cabify_driver_id, cabify_company_id, fecha_inicio, fecha_fin);

-- Agregar columna de versión para tracking de cambios
ALTER TABLE cabify_historico ADD COLUMN data_version INTEGER DEFAULT 1;
ALTER TABLE cabify_historico ADD COLUMN last_updated_at TIMESTAMPTZ DEFAULT NOW();
```

**C. Tabla de agregaciones pre-calculadas (opcional)**
```sql
-- Para dashboards super rápidos
CREATE TABLE cabify_weekly_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  company_id VARCHAR,
  total_drivers INTEGER,
  total_viajes INTEGER,
  total_ganancia NUMERIC,
  avg_score NUMERIC,
  avg_tasa_aceptacion NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(week_start, company_id)
);
```

#### Particionamiento (Para Escala Futura)
```sql
-- Particionar por mes si la tabla crece mucho
CREATE TABLE cabify_historico_partitioned (
  LIKE cabify_historico INCLUDING ALL
) PARTITION BY RANGE (fecha_inicio);

-- Crear particiones por mes
CREATE TABLE cabify_historico_2025_09 PARTITION OF cabify_historico_partitioned
  FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');

CREATE TABLE cabify_historico_2025_10 PARTITION OF cabify_historico_partitioned
  FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
-- ... etc
```

---

## 🚀 RECOMENDACIONES ADICIONALES

### 1. Sistema de Caché en Aplicación

**Implementar caché en memoria para consultas frecuentes:**
```typescript
class CabifyHistoricalCache {
  private cache = new Map<string, { data: any; expires: number }>()
  private TTL = 5 * 60 * 1000 // 5 minutos

  async get(key: string, fetcher: () => Promise<any>): Promise<any> {
    const cached = this.cache.get(key)

    if (cached && Date.now() < cached.expires) {
      return cached.data
    }

    const data = await fetcher()
    this.cache.set(key, { data, expires: Date.now() + this.TTL })
    return data
  }

  invalidate(pattern: string) {
    // Invalidar claves que coincidan con patrón
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }
}
```

### 2. Notificaciones y Alertas

**Monitorear sincronizaciones:**
```typescript
async function sendSyncAlert(result: SyncResult) {
  if (result.status === 'failed') {
    // Enviar email/Slack/Discord
    await notifyAdmin({
      level: 'error',
      message: `Sync Cabify falló: ${result.error}`,
      period: result.period
    })
  } else if (result.recordsSynced === 0) {
    // Alerta de datos vacíos
    await notifyAdmin({
      level: 'warning',
      message: `Sync Cabify sin datos para ${result.period}`
    })
  }
}
```

### 3. Dashboard de Monitoreo

**Crear vista de estado del sistema:**
```sql
CREATE VIEW cabify_sync_health AS
SELECT
  DATE_TRUNC('day', created_at) as sync_date,
  sync_type,
  COUNT(*) as total_syncs,
  COUNT(*) FILTER (WHERE status = 'success') as successful,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  SUM(records_synced) as total_records,
  AVG(execution_time_ms) as avg_execution_time
FROM cabify_sync_log
GROUP BY DATE_TRUNC('day', created_at), sync_type
ORDER BY sync_date DESC;
```

### 4. Estrategia de Retención de Datos

**Definir política de retención:**
```sql
-- Función para archivar datos antiguos (>1 año)
CREATE OR REPLACE FUNCTION archive_old_cabify_data()
RETURNS INTEGER AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  -- Mover a tabla de archivo
  INSERT INTO cabify_historico_archive
  SELECT * FROM cabify_historico
  WHERE fecha_inicio < NOW() - INTERVAL '1 year';

  GET DIAGNOSTICS archived_count = ROW_COUNT;

  -- Eliminar de tabla principal
  DELETE FROM cabify_historico
  WHERE fecha_inicio < NOW() - INTERVAL '1 year';

  RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- Ejecutar mensualmente
SELECT cron.schedule('archive-cabify-old-data', '0 0 1 * *',
  'SELECT archive_old_cabify_data()');
```

### 5. Optimización de Consultas de Lectura

**Service mejorado para consultas híbridas:**
```typescript
// src/services/cabifyHistoricalService.ts

export class CabifyHistoricalService {

  /**
   * Estrategia inteligente: Histórico primero, API si es necesario
   */
  async getDriversData(startDate: string, endDate: string): Promise<DriverData[]> {
    // 1. Intentar obtener TODOS los datos del histórico
    const historical = await this.queryHistorical(startDate, endDate)

    // 2. Verificar cobertura temporal
    const coverage = this.analyzeCoverage(historical, startDate, endDate)

    // 3. Si cobertura es 100% → retornar (RÁPIDO)
    if (coverage.percentage === 100) {
      console.log('✅ 100% desde histórico - 0 llamadas API')
      return historical
    }

    // 4. Si cobertura < 100% → consultar API solo para gaps
    console.log(`⚠️  Cobertura: ${coverage.percentage}% - consultando API para gaps`)
    const gapData = await this.fetchGapsFromAPI(coverage.gaps)

    // 5. Merge y guardar gaps en BD
    await this.saveToHistorical(gapData)

    return [...historical, ...gapData]
  }

  /**
   * Análisis de cobertura temporal
   */
  private analyzeCoverage(data: DriverData[], start: string, end: string) {
    // Analizar qué períodos están cubiertos
    const periods = this.getPeriodBuckets(start, end)
    const covered = new Set(data.map(d => this.getPeriodKey(d.fecha_inicio)))

    const gaps = periods.filter(p => !covered.has(p.key))
    const percentage = ((periods.length - gaps.length) / periods.length) * 100

    return { percentage, gaps, covered: periods.length - gaps.length }
  }
}
```

### 6. Testing y Validación

**Tests unitarios para sincronización:**
```typescript
describe('Cabify Historical Sync', () => {
  test('should skip already synced periods', async () => {
    // Mock BD con datos existentes
    const result = await syncHistoricalData({
      mode: 'weekly',
      weeksBack: 1
    })

    expect(result.skipped).toBe(1)
    expect(result.synced).toBe(0)
  })

  test('should handle API failures gracefully', async () => {
    // Mock API failure
    jest.spyOn(cabifyService, 'getDriversWithDetails')
      .mockRejectedValue(new Error('API Error'))

    const result = await syncHistoricalData({
      mode: 'weekly',
      weeksBack: 1
    })

    expect(result.status).toBe('failed')
    expect(result.error).toBeDefined()
  })

  test('should not create duplicates', async () => {
    await syncHistoricalData({ mode: 'weekly', weeksBack: 1 })
    await syncHistoricalData({ mode: 'weekly', weeksBack: 1 })

    const { data } = await supabase
      .from('cabify_historico')
      .select('*')
      .eq('fecha_inicio', weekStart)

    // Cada conductor debe aparecer solo 1 vez por período
    const duplicates = findDuplicates(data, ['cabify_driver_id', 'fecha_inicio'])
    expect(duplicates).toHaveLength(0)
  })
})
```

---

## 📋 PLAN DE IMPLEMENTACIÓN SUGERIDO

### Fase 1: Fundación (Semana 1-2)
1. ✅ Mejorar estructura de BD:
   - Agregar índices a `cabify_historico`
   - Crear tabla `cabify_sync_log`
   - Agregar constraint único
2. ✅ Implementar servicio de consultas híbridas
3. ✅ Testing básico

### Fase 2: Automatización (Semana 3-4)
1. ✅ Desarrollar script de sincronización
2. ✅ Configurar cron job o Edge Function
3. ✅ Sistema de logging y alertas
4. ✅ Testing de sincronización

### Fase 3: Optimización (Semana 5-6)
1. ✅ Implementar caché en aplicación
2. ✅ Dashboard de monitoreo
3. ✅ Agregaciones pre-calculadas (opcional)
4. ✅ Política de retención

### Fase 4: Refinamiento (Semana 7-8)
1. ✅ Optimización de rendimiento
2. ✅ Documentación completa
3. ✅ Capacitación del equipo
4. ✅ Monitoreo en producción

---

## 💰 ESTIMACIÓN DE COSTOS

### Opción A: Edge Function cada 10 minutos
```
Invocaciones mensuales: 4,320 (6 por hora × 24h × 30 días)
Tiempo promedio: ~30 segundos
Costo Supabase Functions: ~$2-5/mes
```

### Opción B: Edge Function semanal
```
Invocaciones mensuales: ~4 (1 por semana)
Tiempo promedio: ~5 minutos
Costo Supabase Functions: <$1/mes
```

### Opción C: Script local programado
```
Costo: $0 (ejecuta en tu servidor/local)
Requiere: Servidor siempre encendido o tarea programada
```

**Recomendación**: Opción B (Edge Function semanal) - Balance perfecto entre costo, automatización y simplicidad.

---

## 🎓 CONCLUSIÓN

Este análisis identifica 3 problemas principales:

1. **Falta de persistencia automática** → Solución: Script de sincronización
2. **Consultas ineficientes** → Solución: Estrategia híbrida histórico+API
3. **Estructura de BD subóptima** → Solución: Índices + constraints

La implementación sugerida reducirá:
- ⚡ **Tiempo de respuesta**: De ~60s a <2s para consultas históricas
- 💰 **Llamadas API**: Reducción del 80-90%
- 🔧 **Mantenimiento manual**: 100% automatizado

**Próximos pasos inmediatos:**
1. Aprobar propuestas
2. Priorizar implementación
3. Iniciar Fase 1 (fundación)
