// src/modules/integraciones/cabify/components/CabifyHeader.tsx
/**
 * Componente Header de Cabify
 * Principio: Single Responsibility - Solo UI de encabezado
 */

import { RefreshCw } from 'lucide-react'
import type { WeekOption } from '../types/cabify.types'
import { UI_TEXT } from '../constants/cabify.constants'

// =====================================================
// TIPOS
// =====================================================

interface CabifyHeaderProps {
  readonly lastUpdate: Date | null
  readonly isLoading: boolean
  readonly availableWeeks: readonly WeekOption[]
  readonly selectedWeek: WeekOption | null
  readonly onWeekChange: (week: WeekOption) => void
  readonly onRefresh: () => void
}

// =====================================================
// COMPONENTE
// =====================================================

export function CabifyHeader({
  lastUpdate,
  isLoading,
  availableWeeks,
  selectedWeek,
  onWeekChange,
  onRefresh,
}: CabifyHeaderProps) {
  const handleWeekChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const weeksAgo = Number(event.target.value)
    const selected = availableWeeks.find((w) => w.weeksAgo === weeksAgo)

    if (selected) {
      onWeekChange(selected)
    }
  }

  const isDisabled = isLoading || availableWeeks.length === 0

  return (
    <div className="cabify-header">
      <HeaderInfo lastUpdate={lastUpdate} />
      <HeaderControls
        selectedWeek={selectedWeek}
        availableWeeks={availableWeeks}
        isLoading={isLoading}
        isDisabled={isDisabled}
        onWeekChange={handleWeekChange}
        onRefresh={onRefresh}
      />
    </div>
  )
}

// =====================================================
// SUBCOMPONENTES
// =====================================================

interface HeaderInfoProps {
  readonly lastUpdate: Date | null
}

function HeaderInfo({ lastUpdate }: HeaderInfoProps) {
  return (
    <div className="cabify-header-info">
      <h1>{UI_TEXT.TITLE}</h1>
      <p>{UI_TEXT.SUBTITLE}</p>
      <SyncStatus />
      {lastUpdate && <LastUpdate date={lastUpdate} />}
    </div>
  )
}

function SyncStatus() {
  return (
    <div className="cabify-sync-status">
      <span className="cabify-sync-dot" />
      <strong>{UI_TEXT.SYNC_STATUS}</strong> - {UI_TEXT.SYNC_INTERVAL}
    </div>
  )
}

interface LastUpdateProps {
  readonly date: Date
}

function LastUpdate({ date }: LastUpdateProps) {
  return (
    <p className="cabify-last-update">
      Última consulta: {date.toLocaleString('es-AR')}
    </p>
  )
}

interface HeaderControlsProps {
  readonly selectedWeek: WeekOption | null
  readonly availableWeeks: readonly WeekOption[]
  readonly isLoading: boolean
  readonly isDisabled: boolean
  readonly onWeekChange: (event: React.ChangeEvent<HTMLSelectElement>) => void
  readonly onRefresh: () => void
}

function HeaderControls({
  selectedWeek,
  availableWeeks,
  isLoading,
  isDisabled,
  onWeekChange,
  onRefresh,
}: HeaderControlsProps) {
  return (
    <div className="cabify-controls">
      <WeekSelector
        selectedWeek={selectedWeek}
        availableWeeks={availableWeeks}
        isDisabled={isDisabled}
        onChange={onWeekChange}
      />
      <RefreshButton
        isLoading={isLoading}
        isDisabled={isLoading || !selectedWeek}
        onClick={onRefresh}
      />
    </div>
  )
}

interface WeekSelectorProps {
  readonly selectedWeek: WeekOption | null
  readonly availableWeeks: readonly WeekOption[]
  readonly isDisabled: boolean
  readonly onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void
}

function WeekSelector({
  selectedWeek,
  availableWeeks,
  isDisabled,
  onChange,
}: WeekSelectorProps) {
  return (
    <div className="cabify-week-selector">
      <label>Semana:</label>
      <select
        value={selectedWeek?.weeksAgo.toString() ?? ''}
        onChange={onChange}
        disabled={isDisabled}
      >
        {availableWeeks.map((week) => (
          <option key={week.weeksAgo} value={week.weeksAgo}>
            {week.label}
          </option>
        ))}
      </select>
    </div>
  )
}

interface RefreshButtonProps {
  readonly isLoading: boolean
  readonly isDisabled: boolean
  readonly onClick: () => void
}

function RefreshButton({ isLoading, isDisabled, onClick }: RefreshButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className="btn-primary cabify-refresh-btn"
    >
      <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
      {isLoading ? UI_TEXT.LOADING : UI_TEXT.REFRESH}
    </button>
  )
}
