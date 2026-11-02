// src/modules/integraciones/cabify/components/CabifyHeader.tsx
/**
 * Componente Header de Cabify
 * Principio: Single Responsibility - Solo UI de encabezado
 */

import { ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react'
import type { WeekOption } from '../types/cabify.types'
import { formatDateTimeAR } from '../../../../utils/dateUtils'
import { WeekCalendarSelector } from './WeekCalendarSelector'

// =====================================================
// TEXTOS
// =====================================================

/**
 * Resumen de la regla que aplica el RPA py-cabify-efectivo, que corre dos veces
 * por semana y compara lo cobrado por app contra alquiler + garantia del periodo.
 */
const AYUDA_EFECTIVO = [
  'Desactivación automática — sábados 06:00',
  'Si de lunes a sábado lo cobrado por app no cubre el alquiler + garantía de la semana, se desactiva el efectivo.',
  '',
  'Activación automática — lunes 06:00',
  'Si en la semana anterior lo cobrado por app cubrió el alquiler + garantía, se reactiva.',
  '',
  'También puede activarse o desactivarse manualmente desde Facturación.',
].join('\n')

// =====================================================
// TIPOS
// =====================================================

export interface DateRange {
  readonly startDate: string
  readonly endDate: string
}

interface CabifyHeaderProps {
  readonly lastUpdate: Date | null
  readonly isLoading: boolean
  readonly availableWeeks: readonly WeekOption[]
  readonly selectedWeek: WeekOption | null
  readonly onWeekChange: (week: WeekOption) => void
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
}: CabifyHeaderProps) {
  const isDisabled = isLoading || availableWeeks.length === 0

  // availableWeeks va de la más reciente (índice 0) a la más vieja
  const indice = selectedWeek ? availableWeeks.findIndex(w => w.startDate === selectedWeek.startDate) : -1
  const anterior = indice >= 0 ? availableWeeks[indice + 1] : undefined
  const siguiente = indice > 0 ? availableWeeks[indice - 1] : undefined
  const esActual = indice === 0
  const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

  return (
    <div className="cabify-header cabify-header-inline">
      <div className="cabify-controls">
        <div className="cabify-semana-nav" role="group" aria-label="Cambiar de semana">
          <button
            type="button"
            className="cabify-semana-flecha"
            onClick={() => anterior && onWeekChange(anterior)}
            disabled={isDisabled || !anterior}
            aria-label="Semana anterior"
            title={anterior ? `Semana anterior (${ddmm(anterior.startDate)} – ${ddmm(anterior.endDate)})` : 'No hay semanas anteriores'}
          >
            <ChevronLeft size={18} />
          </button>
          <WeekCalendarSelector
            selectedWeek={selectedWeek}
            availableWeeks={availableWeeks}
            isDisabled={isDisabled}
            onWeekChange={onWeekChange}
          />
          <button
            type="button"
            className="cabify-semana-flecha"
            onClick={() => siguiente && onWeekChange(siguiente)}
            disabled={isDisabled || !siguiente}
            aria-label="Semana siguiente"
            title={siguiente ? `Semana siguiente (${ddmm(siguiente.startDate)} – ${ddmm(siguiente.endDate)})` : 'Es la semana más reciente'}
          >
            <ChevronRight size={18} />
          </button>
          {selectedWeek && (
            <span className="cabify-semana-rango">
              {ddmm(selectedWeek.startDate)} – {ddmm(selectedWeek.endDate)}
              {esActual ? ' · en curso' : ''}
            </span>
          )}
          {!esActual && availableWeeks.length > 0 && (
            <button
              type="button"
              className="cabify-semana-hoy"
              onClick={() => onWeekChange(availableWeeks[0])}
              disabled={isDisabled}
            >
              Ir a la actual
            </button>
          )}
        </div>
        <span
          className="cabify-help-icon"
          data-tooltip={AYUDA_EFECTIVO}
          role="img"
          aria-label={AYUDA_EFECTIVO}
          tabIndex={0}
        >
          <HelpCircle size={14} />
          <span>Desactivación Efectivo</span>
        </span>
        {isLoading && (
          <div className="cabify-loading-indicator">
            <div className="dt-loading-spinner" style={{ width: 16, height: 16 }} />
            <span>Sincronizando...</span>
          </div>
        )}
      </div>
      {lastUpdate && (
        <span className="cabify-last-update-compact" title={`Última sincronización: ${formatDateTimeAR(lastUpdate)}`}>
          Sync {formatDateTimeAR(lastUpdate)}
        </span>
      )}
    </div>
  )
}


