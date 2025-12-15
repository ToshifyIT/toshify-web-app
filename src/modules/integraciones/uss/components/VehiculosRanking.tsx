// src/modules/integraciones/uss/components/VehiculosRanking.tsx
/**
 * Rankings de vehículos y conductores con más excesos
 */

import { Car, User, Trophy, AlertTriangle } from 'lucide-react'
import type { VehiculoRanking, ConductorRanking } from '../types/uss.types'
import { formatSpeed, formatDuration, extractConductorName, getSeverityColor } from '../utils/uss.utils'

interface RankingsProps {
  readonly vehiculosRanking: VehiculoRanking[]
  readonly conductoresRanking: ConductorRanking[]
  readonly isLoading: boolean
}

export function Rankings({ vehiculosRanking, conductoresRanking, isLoading }: RankingsProps) {
  if (isLoading) {
    return <RankingsLoading />
  }

  return (
    <div className="uss-rankings-container">
      <VehiculosRankingCard ranking={vehiculosRanking} />
      <ConductoresRankingCard ranking={conductoresRanking} />
    </div>
  )
}

interface VehiculosRankingCardProps {
  readonly ranking: VehiculoRanking[]
}

function VehiculosRankingCard({ ranking }: VehiculosRankingCardProps) {
  return (
    <div className="uss-ranking-card">
      <div className="uss-ranking-header">
        <Car size={20} />
        <h3>Top Vehículos con Excesos</h3>
      </div>

      {ranking.length === 0 ? (
        <p className="uss-ranking-empty">Sin datos disponibles</p>
      ) : (
        <div className="uss-ranking-list">
          {ranking.map((vehiculo, index) => (
            <VehiculoItem key={vehiculo.patente} vehiculo={vehiculo} position={index + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

interface VehiculoItemProps {
  readonly vehiculo: VehiculoRanking
  readonly position: number
}

function VehiculoItem({ vehiculo, position }: VehiculoItemProps) {
  const positionClass = position <= 3 ? `uss-position-${position}` : ''

  return (
    <div className="uss-ranking-item">
      <div className={`uss-ranking-position ${positionClass}`}>
        {position <= 3 ? <Trophy size={16} /> : position}
      </div>
      <div className="uss-ranking-info">
        <span className="uss-ranking-patente">{vehiculo.patente}</span>
        <span className="uss-ranking-details">
          <AlertTriangle size={12} />
          {vehiculo.totalExcesos} excesos
          <span className="uss-ranking-separator">|</span>
          Máx: {formatSpeed(vehiculo.velocidadMaxima)}
        </span>
      </div>
      <div
        className="uss-ranking-badge"
        style={{ backgroundColor: getSeverityColor(vehiculo.excesoPromedio) }}
      >
        +{Math.round(vehiculo.excesoPromedio)} km/h prom
      </div>
    </div>
  )
}

interface ConductoresRankingCardProps {
  readonly ranking: ConductorRanking[]
}

function ConductoresRankingCard({ ranking }: ConductoresRankingCardProps) {
  return (
    <div className="uss-ranking-card">
      <div className="uss-ranking-header">
        <User size={20} />
        <h3>Top Conductores con Excesos</h3>
      </div>

      {ranking.length === 0 ? (
        <p className="uss-ranking-empty">Sin datos disponibles</p>
      ) : (
        <div className="uss-ranking-list">
          {ranking.map((conductor, index) => (
            <ConductorItem key={conductor.conductor} conductor={conductor} position={index + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

interface ConductorItemProps {
  readonly conductor: ConductorRanking
  readonly position: number
}

function ConductorItem({ conductor, position }: ConductorItemProps) {
  const positionClass = position <= 3 ? `uss-position-${position}` : ''
  const nombreLimpio = extractConductorName(conductor.conductor)

  return (
    <div className="uss-ranking-item">
      <div className={`uss-ranking-position ${positionClass}`}>
        {position <= 3 ? <Trophy size={16} /> : position}
      </div>
      <div className="uss-ranking-info">
        <span className="uss-ranking-name">{nombreLimpio}</span>
        <span className="uss-ranking-details">
          <AlertTriangle size={12} />
          {conductor.totalExcesos} excesos
          <span className="uss-ranking-separator">|</span>
          {conductor.vehiculosUnicos} vehículos
        </span>
      </div>
      <div className="uss-ranking-max">
        Máx: {formatSpeed(conductor.velocidadMaxima)}
      </div>
    </div>
  )
}

function RankingsLoading() {
  return (
    <div className="uss-rankings-container">
      <div className="uss-ranking-card uss-ranking-loading">
        <div className="uss-ranking-skeleton" />
      </div>
      <div className="uss-ranking-card uss-ranking-loading">
        <div className="uss-ranking-skeleton" />
      </div>
    </div>
  )
}
