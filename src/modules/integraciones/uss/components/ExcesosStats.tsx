// src/modules/integraciones/uss/components/ExcesosStats.tsx
/**
 * Tarjetas de estadísticas de excesos de velocidad
 */

import { AlertTriangle, Car, User, Gauge, Clock, TrendingUp } from 'lucide-react'
import type { ExcesoStats } from '../types/uss.types'
import { formatDuration, formatSpeed } from '../utils/uss.utils'

interface ExcesosStatsProps {
  readonly stats: ExcesoStats | null
  readonly isLoading: boolean
}

export function ExcesosStats({ stats, isLoading }: ExcesosStatsProps) {
  if (isLoading) {
    return <StatsLoading />
  }

  if (!stats) {
    return null
  }

  return (
    <div className="uss-stats-grid">
      <StatCard
        icon={<AlertTriangle size={24} />}
        label="Total Excesos"
        value={stats.totalExcesos.toLocaleString()}
        color="red"
      />
      <StatCard
        icon={<Car size={24} />}
        label="Vehículos"
        value={stats.vehiculosUnicos.toString()}
        color="blue"
      />
      <StatCard
        icon={<User size={24} />}
        label="Conductores"
        value={stats.conductoresUnicos.toString()}
        color="purple"
      />
      <StatCard
        icon={<Gauge size={24} />}
        label="Vel. Máxima"
        value={formatSpeed(stats.velocidadMaxima)}
        color="orange"
      />
      <StatCard
        icon={<TrendingUp size={24} />}
        label="Exceso Promedio"
        value={formatSpeed(stats.excesoPromedio)}
        color="yellow"
      />
      <StatCard
        icon={<Clock size={24} />}
        label="Duración Prom."
        value={formatDuration(Math.round(stats.duracionPromedio))}
        color="green"
      />
    </div>
  )
}

interface StatCardProps {
  readonly icon: React.ReactNode
  readonly label: string
  readonly value: string
  readonly color: 'red' | 'blue' | 'purple' | 'orange' | 'yellow' | 'green'
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  return (
    <div className={`uss-stat-card uss-stat-${color}`}>
      <div className="uss-stat-icon">{icon}</div>
      <div className="uss-stat-content">
        <span className="uss-stat-value">{value}</span>
        <span className="uss-stat-label">{label}</span>
      </div>
    </div>
  )
}

function StatsLoading() {
  return (
    <div className="uss-stats-grid">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="uss-stat-card uss-stat-loading">
          <div className="uss-stat-skeleton" />
        </div>
      ))}
    </div>
  )
}
