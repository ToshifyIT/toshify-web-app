// src/modules/integraciones/uss/bitacora/components/BitacoraStats.tsx
import { Car, Users, MapPin, TrendingUp, CheckCircle, Clock } from 'lucide-react'
import type { BitacoraStats as BitacoraStatsType } from '../types/bitacora.types'

interface BitacoraStatsProps {
  stats: BitacoraStatsType | null
  isLoading: boolean
}

export function BitacoraStats({ stats, isLoading }: BitacoraStatsProps) {
  if (isLoading) {
    return (
      <div className="bitacora-stats">
        <div className="stats-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="stat-card skeleton">
              <div className="skeleton-content"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!stats) return null

  const statCards = [
    { label: 'Turnos', value: stats.totalTurnos, icon: Clock },
    { label: 'Vehículos', value: stats.vehiculosUnicos, icon: Car },
    { label: 'Conductores', value: stats.conductoresUnicos, icon: Users },
    { label: 'Km Total', value: `${stats.kilometrajeTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, icon: MapPin },
    { label: 'Km Prom.', value: `${stats.kilometrajePromedio.toLocaleString('es-AR', { maximumFractionDigits: 1 })}`, icon: TrendingUp },
    { label: 'Finalizados', value: stats.turnosFinalizados, icon: CheckCircle },
  ]

  return (
    <div className="bitacora-stats">
      <div className="stats-grid">
        {statCards.map((card, index) => {
          const Icon = card.icon
          return (
            <div key={index} className="stat-card">
              <Icon size={18} className="stat-icon" />
              <div className="stat-content">
                <span className="stat-value">{card.value}</span>
                <span className="stat-label">{card.label}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
