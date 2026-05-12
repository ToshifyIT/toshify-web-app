import { useState } from 'react'
import { Fuel, Gauge, Clock, TrendingUp, Droplet } from 'lucide-react'
import { useSede } from '../../../contexts/SedeContext'
import { useCombustibleData } from './hooks/useCombustibleData'
import { CombustibleTable } from './components/CombustibleTable'
import { CombustibleDetalleDrawer } from './components/CombustibleDetalleDrawer'
import type { FuelSummary } from './types/combustible.types'
import '../VehicleManagement.css'
import '../alertas-mantenimiento/AlertasMantenimientoModule.css'
import './ControlCombustibleModule.css'

function formatN(n: number): string {
  return n.toLocaleString('es-AR')
}

export function ControlCombustibleModule() {
  const { sedeActualId } = useSede()
  const { summary, stats, loading } = useCombustibleData(sedeActualId)
  const [selected, setSelected] = useState<FuelSummary | null>(null)

  return (
    <div className="veh-module">
      {/* Stats */}
      <div className="veh-stats">
        <div className="veh-stats-grid combustible-stats-grid">
          <div className="stat-card">
            <Fuel size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.combustibleTotal > 0 ? `${formatN(stats.combustibleTotal)} L` : '—'}</span>
              <span className="stat-label">Combustible (30 días)</span>
            </div>
          </div>
          <div className="stat-card">
            <Gauge size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.distanciaTotal > 0 ? `${formatN(stats.distanciaTotal)} km` : '—'}</span>
              <span className="stat-label">Distancia total</span>
            </div>
          </div>
          <div className="stat-card">
            <TrendingUp size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.rendimientoPromedio > 0 ? `${stats.rendimientoPromedio.toFixed(1)}` : '—'}</span>
              <span className="stat-label">Rendimiento promedio km/L</span>
            </div>
          </div>
          <div className="stat-card">
            <Clock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.ralentiTotal > 0 ? `${formatN(stats.ralentiTotal)} L` : '—'}</span>
              <span className="stat-label">Ralentí ({stats.ralentiPct.toFixed(0)}% del total)</span>
            </div>
          </div>
          <div className="stat-card">
            <Droplet size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.llenadosTotal}</span>
              <span className="stat-label">Llenados detectados</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="veh-stats">
        <CombustibleTable
          summary={summary}
          loading={loading}
          onRowClick={setSelected}
        />
      </div>

      {/* Drawer detalle */}
      <CombustibleDetalleDrawer
        vehiculo={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
