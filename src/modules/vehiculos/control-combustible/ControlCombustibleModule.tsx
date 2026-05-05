import { Fuel, DollarSign, Gauge, Hash, TrendingDown } from 'lucide-react'
import { useSede } from '../../../contexts/SedeContext'
import { useCombustibleData } from './hooks/useCombustibleData'
import { CombustibleTable } from './components/CombustibleTable'
import '../VehicleManagement.css'
import './ControlCombustibleModule.css'

function formatN(n: number): string {
  return n.toLocaleString('es-AR')
}

export function ControlCombustibleModule() {
  const { sedeActualId } = useSede()
  const { cargas, stats, loading } = useCombustibleData(sedeActualId)

  return (
    <div className="veh-module">
      {/* Stats */}
      <div className="veh-stats">
        <div className="veh-stats-grid combustible-stats-grid">
          <div className="stat-card">
            <Fuel size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.litros > 0 ? `${formatN(stats.litros)} L` : '—'}</span>
              <span className="stat-label">Litros (semana)</span>
            </div>
          </div>
          <div className="stat-card">
            <DollarSign size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.gasto > 0 ? `$${formatN(stats.gasto)}` : '—'}</span>
              <span className="stat-label">Gasto (semana)</span>
            </div>
          </div>
          <div className="stat-card">
            <Gauge size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.kmLPromedio > 0 ? stats.kmLPromedio.toFixed(1) : '—'}</span>
              <span className="stat-label">Km/L promedio</span>
            </div>
          </div>
          <div className="stat-card">
            <Hash size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.cargas > 0 ? stats.cargas : '—'}</span>
              <span className="stat-label">Cargas (semana)</span>
            </div>
          </div>
          <div className="stat-card">
            <TrendingDown size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value" style={{ fontSize: 13 }}>
                {stats.topConsumoNombre || '—'}
              </span>
              <span className="stat-label">
                {stats.topConsumoVariacion != null
                  ? `${stats.topConsumoVariacion > 0 ? '+' : ''}${stats.topConsumoVariacion}% vs flota`
                  : 'Top consumo'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="veh-stats">
        <CombustibleTable cargas={cargas} loading={loading} />
      </div>
    </div>
  )
}
