import { useCallback, useMemo, useState } from 'react'
import { getISOWeek } from 'date-fns'
import { Fuel, Gauge, Clock, TrendingUp, Droplet } from 'lucide-react'
import { useSede } from '../../../contexts/SedeContext'
import { DateRangeSelector } from '../../../components/ui/DateRangeSelector'
import type { DateRange } from '../../../components/ui/DateRangeSelector'
import { useCombustibleData, calcularStats } from './hooks/useCombustibleData'
import { CombustibleTable } from './components/CombustibleTable'
import { CombustibleDetalleDrawer } from './components/CombustibleDetalleDrawer'
import type { FuelRow, RangoSemana } from './types/combustible.types'
import '../VehicleManagement.css'
import '../alertas-mantenimiento/AlertasMantenimientoModule.css'
import './ControlCombustibleModule.css'

function formatN(n: number): string {
  return n.toLocaleString('es-AR')
}

/** Semana actual (lunes a domingo) en hora Argentina. */
function semanaActual(): DateRange {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const [y, m, d] = hoy.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  const dow = base.getUTCDay() || 7 // domingo = 7
  const lunes = new Date(base); lunes.setUTCDate(base.getUTCDate() - (dow - 1))
  const domingo = new Date(lunes); domingo.setUTCDate(lunes.getUTCDate() + 6)
  const iso = (x: Date) => x.toISOString().slice(0, 10)
  const semana = getISOWeek(new Date(lunes.getUTCFullYear(), lunes.getUTCMonth(), lunes.getUTCDate()))
  return { startDate: iso(lunes), endDate: iso(domingo), label: `Esta semana (S${semana})`, type: 'week' }
}

export function ControlCombustibleModule() {
  const { sedeActualId } = useSede()
  const [semana, setSemana] = useState<DateRange>(semanaActual)
  const rango = useMemo<RangoSemana>(() => ({ desde: semana.startDate, hasta: semana.endDate }), [semana.startDate, semana.endDate])
  const { rows, loading, kmDisponible } = useCombustibleData(sedeActualId, rango)
  const [selected, setSelected] = useState<FuelRow | null>(null)

  // Indicadores sobre lo que se ve en la tabla (búsqueda + filtros de columna)
  const [visibles, setVisibles] = useState<FuelRow[] | null>(null)
  const onFilteredRowsChange = useCallback((filas: FuelRow[]) => setVisibles(filas), [])
  const stats = useMemo(() => calcularStats(visibles ?? rows), [visibles, rows])
  const filtrado = visibles !== null && visibles.length !== rows.length

  return (
    <div className="veh-module">
      {/* Semana */}
      <div className="combustible-toolbar">
        <DateRangeSelector
          selectedRange={semana}
          onRangeChange={setSemana}
          disabled={loading}
          showAllOption={false}
          placeholder="Seleccionar semana"
          weekOnly
        />
        <span className="combustible-toolbar-nota">
          {filtrado ? `Indicadores de ${visibles?.length} de ${rows.length} vehículos (según los filtros de la tabla)` : `${rows.length} vehículos`}
          {' · '}Ralentí: últimos 30 días
        </span>
      </div>

      {/* Stats */}
      <div className="veh-stats">
        <div className="veh-stats-grid combustible-stats-grid">
          <div className="stat-card" title="Combustible usado en los tramos entre cargas de la semana (aproximado)">
            <Fuel size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.combustibleSemana > 0 ? `${formatN(stats.combustibleSemana)} L` : '—'}</span>
              <span className="stat-label">Consumo de la semana</span>
            </div>
          </div>
          <div className="stat-card">
            <Gauge size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.distanciaSemana > 0 ? `${formatN(stats.distanciaSemana)} km` : '—'}</span>
              <span className="stat-label">{kmDisponible ? 'Distancia de la semana' : 'Distancia (sin datos de bitácora)'}</span>
            </div>
          </div>
          <div className="stat-card">
            <TrendingUp size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.rendimientoSemana > 0 ? `${stats.rendimientoSemana.toFixed(1)}` : '—'}</span>
              <span className="stat-label">Rendimiento km/L (semana)</span>
            </div>
          </div>
          <div className="stat-card">
            <Clock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.ralentiTotal > 0 ? `${formatN(stats.ralentiTotal)} L` : '—'}</span>
              <span className="stat-label">Ralentí 30 días ({stats.ralentiPct.toFixed(0)}% del consumo)</span>
            </div>
          </div>
          <div className="stat-card">
            <Droplet size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.llenadosSemana}</span>
              <span className="stat-label">
                Llenados de la semana{stats.litrosCargadosSemana > 0 ? ` · ${formatN(stats.litrosCargadosSemana)} L` : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="veh-stats">
        <CombustibleTable
          rows={rows}
          loading={loading}
          onRowClick={setSelected}
          onFilteredRowsChange={onFilteredRowsChange}
        />
      </div>

      {/* Drawer detalle */}
      <CombustibleDetalleDrawer
        vehiculo={selected}
        rango={rango}
        etiquetaSemana={semana.label}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
