# GUÍA DE IMPLEMENTACIÓN - SISTEMA DE HISTORIAL CABIFY

## 📝 Resumen

Este documento describe los pasos para implementar el sistema de historial optimizado de integración Cabify.

**Archivos creados:**
- ✅ `ANALISIS_CABIFY_INTEGRACION.md` - Análisis completo y propuestas
- ✅ `supabase/migrations/20251130_cabify_optimizations.sql` - Migración BD
- ✅ `scripts/sync-cabify-historical.ts` - Script de sincronización
- ✅ `src/services/cabifyHistoricalService.ts` - Servicio de consultas híbridas
- ✅ `supabase/functions/sync-cabify-weekly/index.ts` - Edge Function semanal

---

## 🚀 PASOS DE IMPLEMENTACIÓN

### PASO 1: Aplicar Migración de Base de Datos

Esta migración crea índices, constraints, tabla de log y funciones útiles.

**Opción A: Via Supabase CLI**
```bash
npx supabase db push
```

**Opción B: Via SQL Editor en Supabase Dashboard**
1. Ve a Supabase Dashboard → SQL Editor
2. Copia el contenido de `supabase/migrations/20251130_cabify_optimizations.sql`
3. Ejecuta el SQL

**Verificación:**
```sql
-- Verificar que los índices se crearon
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename = 'cabify_historico'
  AND indexname LIKE 'idx_%';

-- Verificar tabla de log
SELECT * FROM cabify_sync_log LIMIT 1;

-- Ver vistas creadas
SELECT * FROM cabify_sync_health LIMIT 5;
```

**Resultado esperado:**
- ✅ 5 índices nuevos en `cabify_historico`
- ✅ Tabla `cabify_sync_log` creada
- ✅ 3 vistas de monitoreo creadas
- ✅ 3 funciones auxiliares creadas

---

### PASO 2: Probar Script de Sincronización Manual

**2.1. Sincronizar semana pasada (prueba inicial)**
```bash
npm run sync:cabify:weekly
```

**2.2. Ver salida esperada:**
```
🚀 Iniciando sincronización de 1 período(s)...
   Modo: weekly
   Forzar: No

[1/1] ─────────────────────────────────

📅 Período: 18/11 - 24/11
   Rango: 2025-11-18T03:00:00.000Z → 2025-11-25T02:59:59.999Z
   🔄 Consultando API Cabify...
   📊 Progreso: 10/154 conductores
   📊 Progreso: 20/154 conductores
   ...
   ✅ 154 conductores obtenidos
   💾 Guardados 154/154 registros...
   ✅ Sincronización completada en 45.2s

═══════════════════════════════════════════
📊 RESUMEN DE SINCRONIZACIÓN
═══════════════════════════════════════════
   Estado: ✅ Éxito
   Total períodos: 1
   ✅ Sincronizados: 1
   ⏭️  Saltados: 0
   ❌ Fallidos: 0
   💾 Total registros: 154
   ⏱️  Tiempo total: 45.3s
═══════════════════════════════════════════
```

**2.3. Verificar en BD:**
```sql
SELECT
  DATE_TRUNC('week', fecha_inicio) as semana,
  COUNT(DISTINCT cabify_driver_id) as conductores,
  COUNT(*) as registros,
  SUM(ganancia_total) as ganancia_total
FROM cabify_historico
GROUP BY DATE_TRUNC('week', fecha_inicio)
ORDER BY semana DESC;
```

**2.4. Backfill (rellenar histórico) - OPCIONAL**

Si quieres sincronizar las últimas 12 semanas (3 meses):
```bash
npm run sync:cabify:backfill
```

⚠️ **Advertencia**: Esto hará ~154 conductores × 12 semanas = ~1,850 registros. Puede tardar varios minutos.

---

### PASO 3: Actualizar Código para Usar Servicio Híbrido

**3.1. Modificar componente de consulta Cabify**

Busca donde se usa `cabifyService.getDriversWithDetails()` y reemplázalo por el servicio híbrido.

**Antes:**
```typescript
// src/modules/integraciones/cabify/CabifyModule.tsx (o similar)
import { cabifyService } from '../../../services/cabifyService'

const datos = await cabifyService.getDriversWithDetails(period, customRange)
```

**Después:**
```typescript
import { cabifyHistoricalService } from '../../../services/cabifyHistoricalService'
import { cabifyService } from '../../../services/cabifyService'

// Calcular fechas según período
const { startDate, endDate } = period === 'custom'
  ? { startDate: customRange.startDate, endDate: customRange.endDate }
  : cabifyService.getWeekRange(period === 'semana' ? 1 : 0)

// Usar servicio híbrido
const { drivers, stats } = await cabifyHistoricalService.getDriversData(
  startDate,
  endDate,
  {
    onProgress: (current, total, message) => {
      console.log(`${current}/${total}: ${message}`)
    }
  }
)

// Mostrar estadísticas
console.log('📊 Estadísticas de consulta:')
console.log(`   Fuente: ${stats.source}`) // 'historical' | 'api' | 'hybrid'
console.log(`   Histórico: ${stats.historicalRecords}`)
console.log(`   API: ${stats.apiRecords}`)
console.log(`   Total: ${stats.totalRecords}`)
console.log(`   Tiempo: ${stats.executionTimeMs}ms`)
console.log(`   Caché: ${stats.cacheHit ? 'Sí' : 'No'}`)
```

**3.2. Beneficios inmediatos:**
- ⚡ Consultas históricas: <2s (vs ~60s con API)
- 💰 Ahorro de llamadas API: ~90%
- 📊 Mismo resultado, datos desde BD

---

### PASO 4: Configurar Sincronización Automática (Edge Function)

**4.1. Deploy de Edge Function**
```bash
npx supabase functions deploy sync-cabify-weekly
```

**4.2. Configurar Cron Job en Supabase**

Ve a Supabase Dashboard → Database → Cron Jobs y ejecuta:

```sql
-- Ejecutar cada lunes a las 2 AM (hora UTC)
SELECT cron.schedule(
  'sync-cabify-weekly',
  '0 2 * * 1',  -- Cron: lunes 02:00 UTC (23:00 domingo Argentina)
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/sync-cabify-weekly',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || 'YOUR_ANON_KEY'
    )
  ) as request_id
  $$
);
```

**IMPORTANTE:**
- Reemplaza `YOUR_PROJECT_ID` con tu ID de proyecto Supabase
- Reemplaza `YOUR_ANON_KEY` con tu anon key

**4.3. Verificar variables de entorno en Edge Function**

Ve a Supabase Dashboard → Edge Functions → Settings y asegúrate de tener:

```
CABIFY_CLIENT_ID=...
CABIFY_CLIENT_SECRET=...
CABIFY_USERNAME=...
CABIFY_PASSWORD=...
```

**4.4. Probar manualmente la Edge Function:**
```bash
curl -X POST \
  https://YOUR_PROJECT_ID.supabase.co/functions/v1/sync-cabify-weekly \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

**Respuesta esperada:**
```json
{
  "status": "success",
  "records": 154,
  "period": {
    "startDate": "2025-11-18T03:00:00.000Z",
    "endDate": "2025-11-25T02:59:59.999Z",
    "label": "18/11 - 24/11"
  },
  "executionTimeMs": 42156
}
```

---

### PASO 5: Monitoreo y Verificación

**5.1. Ver últimas sincronizaciones:**
```sql
SELECT * FROM cabify_recent_syncs LIMIT 10;
```

**5.2. Ver salud del sistema:**
```sql
SELECT * FROM cabify_sync_health WHERE sync_date >= CURRENT_DATE - 7;
```

**5.3. Ver cobertura semanal:**
```sql
SELECT * FROM cabify_weekly_coverage ORDER BY week_start DESC LIMIT 10;
```

**5.4. Verificar estadísticas de cobertura:**
```sql
SELECT * FROM get_historical_coverage_stats();
```

**5.5. Dashboard en aplicación (opcional)**

Crear página de monitoreo:
```typescript
// src/pages/CabifySyncMonitorPage.tsx
import { supabase } from '../lib/supabase'
import { useEffect, useState } from 'react'

export function CabifySyncMonitorPage() {
  const [health, setHealth] = useState([])

  useEffect(() => {
    loadHealth()
  }, [])

  async function loadHealth() {
    const { data } = await supabase
      .from('cabify_sync_health')
      .select('*')
      .limit(30)

    setHealth(data || [])
  }

  return (
    <div>
      <h1>Monitoreo de Sincronización Cabify</h1>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Total</th>
            <th>Exitosos</th>
            <th>Fallidos</th>
            <th>Registros</th>
            <th>Tiempo Prom.</th>
          </tr>
        </thead>
        <tbody>
          {health.map(h => (
            <tr key={`${h.sync_date}_${h.sync_type}`}>
              <td>{h.sync_date}</td>
              <td>{h.sync_type}</td>
              <td>{h.total_syncs}</td>
              <td>{h.successful_syncs}</td>
              <td>{h.failed_syncs}</td>
              <td>{h.total_records_synced}</td>
              <td>{(h.avg_execution_time_ms / 1000).toFixed(1)}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

## 🎯 CASOS DE USO

### Caso 1: Consulta Semanal Normal

**Usuario consulta semana pasada:**
```typescript
const { drivers, stats } = await cabifyHistoricalService.getDriversData(
  '2025-11-18T03:00:00.000Z',  // Lunes
  '2025-11-25T02:59:59.999Z'   // Domingo
)

// Resultado:
// - stats.source = 'historical'
// - stats.executionTimeMs = ~800ms
// - stats.apiRecords = 0
// 🎉 100% desde histórico, sin llamadas API
```

### Caso 2: Consulta de Hoy (Datos Frescos)

**Usuario consulta datos de hoy:**
```typescript
const hoy = new Date()
const { drivers, stats } = await cabifyHistoricalService.getDriversData(
  hoy.toISOString(),
  hoy.toISOString()
)

// Resultado:
// - stats.source = 'api'
// - stats.executionTimeMs = ~45000ms
// - stats.historicalRecords = 0
// ⚡ Datos frescos desde API, luego guardados en histórico
```

### Caso 3: Consulta Parcial (Últimos 3 Días)

**Usuario consulta últimos 3 días (2 en histórico, 1 actual):**
```typescript
const hace3dias = new Date()
hace3dias.setDate(hace3dias.getDate() - 3)

const { drivers, stats } = await cabifyHistoricalService.getDriversData(
  hace3dias.toISOString(),
  new Date().toISOString()
)

// Resultado:
// - stats.source = 'hybrid'
// - stats.historicalRecords = ~300 (2 días)
// - stats.apiRecords = ~150 (1 día actual)
// ⚡ Optimizado: solo consulta API para el día faltante
```

---

## 🔧 MANTENIMIENTO

### Limpiar Duplicados (si existen)

```sql
SELECT clean_duplicate_historical_records();
```

### Re-sincronizar Período (forzado)

```bash
npm run sync:cabify weekly 1 --force
```

### Limpiar Caché

```typescript
import { cabifyHistoricalService } from './services/cabifyHistoricalService'

// Limpiar todo el caché
cabifyHistoricalService.clearCache()

// Invalidar patrón específico
cabifyHistoricalService.invalidateCache('2025-11-')
```

### Ver Estadísticas de Caché

```typescript
const stats = cabifyHistoricalService.getCacheStats()
console.log('Caché:', stats)
// {
//   cache: { size: 3, keys: ['drivers_...', ...] },
//   statsCache: { size: 1, keys: [...] }
// }
```

---

## 📊 MÉTRICAS ESPERADAS

### Antes (sin optimización)
- ⏱️ Tiempo consulta semanal: ~60s
- 💰 Llamadas API por consulta: 154 conductores × 2 queries = 308 requests
- 📊 Carga en API Cabify: Alta

### Después (con optimización)
- ⏱️ Tiempo consulta semanal histórica: <2s (97% más rápido)
- 💰 Llamadas API por consulta: 0 (si está en histórico)
- 📊 Carga en API Cabify: Reducida 90%
- 💾 Espacio en BD: ~1.8 MB/semana (~100 KB/conductor × 154)

### ROI
- **Ahorro de tiempo**: 58s por consulta
- **Reducción API**: 90% menos llamadas
- **Experiencia de usuario**: Consultas instantáneas

---

## ❓ TROUBLESHOOTING

### Problema: "No se guardan datos en histórico"

**Verificar:**
1. Constraint único permite duplicados?
   ```sql
   SELECT * FROM pg_constraint WHERE conname = 'idx_historico_unique_period';
   ```

2. Permisos de RLS:
   ```sql
   SELECT * FROM cabify_historico LIMIT 1;
   ```

### Problema: "Edge Function falla"

**Revisar logs:**
```bash
npx supabase functions logs sync-cabify-weekly
```

**Verificar variables de entorno** en Supabase Dashboard

### Problema: "Consultas lentas"

**Verificar índices:**
```sql
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename = 'cabify_historico';
```

**Analizar query plan:**
```sql
EXPLAIN ANALYZE
SELECT * FROM cabify_historico
WHERE fecha_inicio >= '2025-11-01'
  AND fecha_fin <= '2025-11-30';
```

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

- [ ] Paso 1: Migración de BD ejecutada
- [ ] Paso 2: Script de sync probado manualmente
- [ ] Paso 3: Código actualizado para usar servicio híbrido
- [ ] Paso 4: Edge Function deployed y cron configurado
- [ ] Paso 5: Vistas de monitoreo verificadas
- [ ] Dashboard de monitoreo creado (opcional)
- [ ] Documentación leída y entendida
- [ ] Equipo capacitado en uso del sistema

---

## 📞 SOPORTE

**Preguntas frecuentes** → Ver `ANALISIS_CABIFY_INTEGRACION.md`

**Reportar problemas** → Crear issue en repositorio

**Mejoras sugeridas** → Pull request con propuesta

---

¡Sistema de historial Cabify listo para usar! 🎉
