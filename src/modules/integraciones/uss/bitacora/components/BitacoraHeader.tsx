// src/modules/integraciones/uss/bitacora/components/BitacoraHeader.tsx
import { useState } from 'react'
import { RefreshCw, Zap } from 'lucide-react'
import type { BitacoraDateRange } from '../types/bitacora.types'
import { BITACORA_CONSTANTS } from '../constants/bitacora.constants'

interface BitacoraHeaderProps {
  dateRange: BitacoraDateRange
  onDateRangePreset: (preset: string) => void
  onCustomDateRange: (startDate: string, endDate: string) => void
  onRefresh: () => void
  onSync: () => Promise<{ success: boolean; error?: string }>
  isLoading: boolean
  lastUpdate: Date | null
}

export function BitacoraHeader({
  dateRange,
  onDateRangePreset,
  onCustomDateRange,
  onRefresh,
  onSync,
  isLoading,
  lastUpdate,
}: BitacoraHeaderProps) {
  const [showCustomRange, setShowCustomRange] = useState(false)
  const [customStart, setCustomStart] = useState(dateRange.startDate)
  const [customEnd, setCustomEnd] = useState(dateRange.endDate)
  const [syncing, setSyncing] = useState(false)

  const handlePresetChange = (preset: string) => {
    if (preset === 'custom') {
      setShowCustomRange(true)
    } else {
      setShowCustomRange(false)
      onDateRangePreset(preset)
    }
  }

  const handleApplyCustomRange = () => {
    onCustomDateRange(customStart, customEnd)
    setShowCustomRange(false)
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await onSync()
    } finally {
      setSyncing(false)
    }
  }

  const formatLastUpdate = (date: Date | null) => {
    if (!date) return 'Nunca'
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="bitacora-header">
      <div className="header-top">
        <div className="header-title">
          <h1>Bitácora de Vehículos</h1>
          <span className="header-subtitle">Control de turnos y kilometraje - Wialon</span>
        </div>

        <div className="header-actions">
          <button
            className="btn-secondary"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw size={16} className={isLoading ? 'spinning' : ''} />
            {isLoading ? 'Cargando...' : 'Actualizar'}
          </button>
          <button
            className="btn-primary"
            onClick={handleSync}
            disabled={syncing || isLoading}
          >
            <Zap size={16} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      </div>

      <div className="header-filters">
        <div className="date-range-selector">
          <span className="filter-label">Período:</span>
          <div className="date-presets">
            {BITACORA_CONSTANTS.DATE_RANGES.map((range) => (
              <button
                key={range.value}
                className={`preset-btn ${dateRange.label === range.label ? 'active' : ''}`}
                onClick={() => handlePresetChange(range.value)}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {showCustomRange && (
          <div className="custom-range">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="date-input"
            />
            <span className="range-separator">a</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="date-input"
            />
            <button className="btn-apply" onClick={handleApplyCustomRange}>
              Aplicar
            </button>
          </div>
        )}

        <div className="header-meta">
          <span className="current-date">{dateRange.startDate === dateRange.endDate ? dateRange.startDate : `${dateRange.startDate} - ${dateRange.endDate}`}</span>
          <span className="last-update">Última actualización: {formatLastUpdate(lastUpdate)}</span>
        </div>
      </div>
    </div>
  )
}
