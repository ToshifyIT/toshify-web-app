// src/modules/integraciones/cabify/CabifyModule.tsx
/**
 * Módulo principal de Cabify
 *
 * Principios aplicados:
 * - Single Responsibility: Cada componente/hook tiene una sola responsabilidad
 * - Open/Closed: Componentes extensibles sin modificación
 * - Dependency Inversion: Uso de hooks e interfaces
 * - Separation of Concerns: Lógica, tipos, constantes y UI separados
 */

import { useState, useMemo, useCallback } from 'react'
import { Users } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable/DataTable'

// Tipos
import type { CabifyDriver, AccordionKey, PeriodFilter, WeekOption } from './types/cabify.types'

// Hooks
import { useCabifyData, useCabifyStats } from './hooks'
import { useCabifyRankings } from './hooks/useCabifyRankings'

// Componentes
import { CabifyHeader, StatsAccordion, TopDriversSection } from './components'

// Utilidades y constantes
import { getScoreLevel, getRateLevel, buildLoadingMessage } from './utils/cabify.utils'
import {
  INITIAL_ACCORDION_STATE,
  ACCEPTANCE_RATE_THRESHOLDS,
  OCCUPATION_RATE_THRESHOLDS,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  DATA_SOURCE_LABELS,
  UI_TEXT,
} from './constants/cabify.constants'

// Estilos
import './CabifyModule.css'

// =====================================================
// HELPERS PARA CÁLCULO DE PERÍODOS
// =====================================================

/**
 * Calcular el período de la semana anterior completa
 */
function getPreviousWeekPeriod(selectedWeek: WeekOption | null): { startDate: string; endDate: string } | null {
  if (!selectedWeek) return null

  // La semana anterior empieza 7 días antes del inicio de la semana seleccionada
  const currentStart = new Date(selectedWeek.startDate)

  const previousStart = new Date(currentStart)
  previousStart.setDate(currentStart.getDate() - 7)
  previousStart.setUTCHours(0, 0, 0, 0)

  const previousEnd = new Date(currentStart)
  previousEnd.setMilliseconds(previousEnd.getMilliseconds() - 1)

  return {
    startDate: previousStart.toISOString(),
    endDate: previousEnd.toISOString()
  }
}

/**
 * Obtener período según el filtro seleccionado
 */
function getFilteredPeriod(
  selectedWeek: WeekOption | null,
  periodFilter: PeriodFilter
): { startDate: string; endDate: string } | null {
  if (!selectedWeek) return null

  if (periodFilter === 'anterior') {
    return getPreviousWeekPeriod(selectedWeek)
  }

  // 'semana' - usar la semana seleccionada
  return {
    startDate: selectedWeek.startDate,
    endDate: selectedWeek.endDate
  }
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export function CabifyModule() {
  // Custom hooks para datos y estadísticas
  const {
    drivers,
    queryState,
    loadingProgress,
    dataSource,
    asignaciones,
    availableWeeks,
    selectedWeek,
    setSelectedWeek,
    refreshData,
  } = useCabifyData()

  const { estadisticas } = useCabifyStats(drivers, asignaciones)

  // Estado del filtro de período
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('semana')

  // Calcular período filtrado para rankings
  const filteredPeriod = useMemo(
    () => getFilteredPeriod(selectedWeek, periodFilter),
    [selectedWeek, periodFilter]
  )

  // Memorizar las props del hook de rankings para evitar re-renders innecesarios
  const rankingProps = useMemo(
    () => filteredPeriod ? {
      fechaInicio: filteredPeriod.startDate,
      fechaFin: filteredPeriod.endDate
    } : undefined,
    [filteredPeriod]
  )

  // Rankings desde histórico con filtro de período
  const { topMejores, topPeores } = useCabifyRankings(rankingProps)

  // Estado local de UI
  const [accordionState, setAccordionState] = useState(INITIAL_ACCORDION_STATE)

  // Handlers
  const handleToggleAccordion = useCallback((key: AccordionKey) => {
    setAccordionState((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const handlePeriodFilterChange = useCallback((filter: PeriodFilter) => {
    setPeriodFilter(filter)
  }, [])

  // Columnas de la tabla
  const columns = useTableColumns(asignaciones)

  // Mensaje de carga
  const loadingMessage = buildLoadingMessage(
    loadingProgress.current,
    loadingProgress.total,
    loadingProgress.message
  )

  // Estado de carga y datos
  const isLoading = queryState.loading
  const hasDrivers = drivers.length > 0
  const hasError = Boolean(queryState.error)

  // Label del período actual para mostrar en UI
  const periodLabel = periodFilter === 'anterior' ? 'Semana Anterior' : 'Semana Actual'

  return (
    <div className="module-container">
      <CabifyHeader
        lastUpdate={queryState.lastUpdate}
        isLoading={isLoading}
        availableWeeks={availableWeeks}
        selectedWeek={selectedWeek}
        periodFilter={periodFilter}
        onWeekChange={setSelectedWeek}
        onPeriodFilterChange={handlePeriodFilterChange}
        onRefresh={refreshData}
      />

      <ProgressBanner
        isVisible={isLoading && hasDrivers}
        message={loadingMessage}
      />

      <ErrorState
        isVisible={hasError && !isLoading}
        error={queryState.error}
        onRetry={refreshData}
      />

      <DataSourceInfo
        isVisible={!hasError && hasDrivers}
        dataSource={dataSource}
        driverCount={drivers.length}
        periodLabel={periodLabel}
      />

      {!isLoading && hasDrivers && (
        <div className="cabify-dashboard">
          <StatsAccordion
            estadisticas={estadisticas}
            isExpanded={accordionState.estadisticas}
            onToggle={() => handleToggleAccordion('estadisticas')}
          />
        </div>
      )}

      {/* Top Drivers - siempre visible cuando hay datos de rankings */}
      {(topMejores.length > 0 || topPeores.length > 0) && (
        <TopDriversSection
          topMejores={topMejores}
          topPeores={topPeores}
          accordionState={accordionState}
          onToggleAccordion={handleToggleAccordion}
        />
      )}

      <div className="cabify-table-container">
        <DataTable
          data={drivers}
          columns={columns}
          loading={isLoading && !hasDrivers}
          error={null}
          searchPlaceholder={UI_TEXT.SEARCH_PLACEHOLDER}
          emptyIcon={<Users size={48} />}
          emptyTitle={UI_TEXT.NO_DRIVERS}
          emptyDescription={UI_TEXT.SELECT_WEEK}
          pageSize={DEFAULT_PAGE_SIZE}
          pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
        />
      </div>
    </div>
  )
}

// =====================================================
// COMPONENTES AUXILIARES
// =====================================================

interface ProgressBannerProps {
  readonly isVisible: boolean
  readonly message: string
}

function ProgressBanner({ isVisible, message }: ProgressBannerProps) {
  if (!isVisible) return null

  return (
    <div className="cabify-progress-banner">
      <div className="dt-loading-spinner" style={{ width: 20, height: 20 }} />
      <strong>{message}</strong>
    </div>
  )
}

interface ErrorStateProps {
  readonly isVisible: boolean
  readonly error: string | null
  readonly onRetry: () => void
}

function ErrorState({ isVisible, error, onRetry }: ErrorStateProps) {
  if (!isVisible) return null

  return (
    <div className="cabify-error">
      <h3>{UI_TEXT.ERROR_TITLE}</h3>
      <p>{error}</p>
      <button onClick={onRetry} className="btn-secondary">
        {UI_TEXT.RETRY}
      </button>
    </div>
  )
}

interface DataSourceInfoProps {
  readonly isVisible: boolean
  readonly dataSource: string
  readonly driverCount: number
  readonly periodLabel: string
}

function DataSourceInfo({ isVisible, dataSource, driverCount, periodLabel }: DataSourceInfoProps) {
  if (!isVisible) return null

  const isHistorical = dataSource === 'historical'

  return (
    <div className={`cabify-info-card ${dataSource}`}>
      <strong>{DATA_SOURCE_LABELS[dataSource]}</strong>
      <span>
        {driverCount} conductores - {periodLabel}
        {isHistorical && ' (consulta instantánea)'}
      </span>
      {isHistorical && (
        <span className="auto-sync">Sincronización automática cada 5 minutos</span>
      )}
    </div>
  )
}

// =====================================================
// HOOK PARA COLUMNAS DE TABLA
// =====================================================

import type { AsignacionActiva } from '../../../services/asignacionesService'

function useTableColumns(
  asignaciones: Map<string, AsignacionActiva>
): ColumnDef<CabifyDriver, unknown>[] {
  return useMemo<ColumnDef<CabifyDriver, unknown>[]>(
    () => [
      createTextColumn('companyName', 'Compañía', 'cabify-company'),
      createConductorColumn(),
      createTextColumn('email', 'Email'),
      createTextColumn('nationalIdNumber', 'DNI'),
      createEstadoSistemaColumn(asignaciones),
      createTextColumn('driverLicense', 'Licencia'),
      createTelefonoColumn(),
      createVehiculoColumn(),
      createTextColumn('vehicleRegPlate', 'Patente', 'cabify-plate'),
      createScoreColumn(),
      createNumericColumn('viajesFinalizados', 'V. Finalizados', 'cabify-trips-completed'),
      createNumericColumn('viajesRechazados', 'V. Rechazados', 'cabify-trips-rejected'),
      createNumericColumn('viajesPerdidos', 'V. Perdidos', 'cabify-trips-lost'),
      createTasaAceptacionColumn(),
      createTextColumn('horasConectadasFormato', 'Horas', 'cabify-hours'),
      createTasaOcupacionColumn(),
      createMoneyColumn('cobroEfectivo', 'Efectivo'),
      createMoneyColumn('cobroApp', 'App'),
      createMoneyColumn('peajes', 'Peajes', 'cabify-money tolls'),
      createMoneyColumn('gananciaTotal', 'Total', 'cabify-money total'),
      createMoneyColumn('gananciaPorHora', '$/Hora', 'cabify-money per-hour'),
      createPermisoEfectivoColumn(),
      createEstadoColumn(),
    ],
    [asignaciones]
  )
}

// =====================================================
// FACTORY FUNCTIONS PARA COLUMNAS
// =====================================================

function createTextColumn(
  key: keyof CabifyDriver,
  header: string,
  className?: string
): ColumnDef<CabifyDriver, unknown> {
  return {
    accessorKey: key,
    header,
    cell: ({ getValue }) => {
      const value = (getValue() as string) || '-'
      return className ? <span className={className}>{value}</span> : value
    },
  }
}

function createNumericColumn(
  key: keyof CabifyDriver,
  header: string,
  className: string
): ColumnDef<CabifyDriver, unknown> {
  return {
    accessorKey: key,
    header,
    cell: ({ getValue }) => (
      <span className={className}>{(getValue() as number) || 0}</span>
    ),
  }
}

function createMoneyColumn(
  key: keyof CabifyDriver,
  header: string,
  className?: string
): ColumnDef<CabifyDriver, unknown> {
  return {
    accessorKey: key,
    header,
    cell: ({ getValue }) => {
      const value = `$${(getValue() as string) || '0.00'}`
      return className ? <span className={className}>{value}</span> : value
    },
  }
}

function createConductorColumn(): ColumnDef<CabifyDriver, unknown> {
  return {
    id: 'conductor',
    header: 'Conductor',
    accessorFn: (row) => `${row.name || ''} ${row.surname || ''}`.trim() || '-',
    cell: ({ getValue }) => (
      <span className="cabify-driver-name">{getValue() as string}</span>
    ),
  }
}

function createTelefonoColumn(): ColumnDef<CabifyDriver, unknown> {
  return {
    id: 'telefono',
    header: 'Teléfono',
    accessorFn: (row) =>
      row.mobileCc && row.mobileNum ? `${row.mobileCc} ${row.mobileNum}` : '-',
    cell: ({ getValue }) => getValue() as string,
  }
}

function createVehiculoColumn(): ColumnDef<CabifyDriver, unknown> {
  return {
    id: 'vehiculo',
    header: 'Vehículo',
    accessorFn: (row) =>
      row.vehiculo ||
      (row.vehicleMake && row.vehicleModel
        ? `${row.vehicleMake} ${row.vehicleModel}`
        : '-'),
    cell: ({ getValue }) => getValue() as string,
  }
}

function createEstadoSistemaColumn(
  asignaciones: Map<string, AsignacionActiva>
): ColumnDef<CabifyDriver, unknown> {
  return {
    id: 'estadoSistema',
    header: 'Estado Sistema',
    accessorFn: (row) => {
      const asig = row.nationalIdNumber
        ? asignaciones.get(row.nationalIdNumber)
        : null
      return asig?.horario || 'Sin asignación'
    },
    cell: ({ row }) => {
      const asig = row.original.nationalIdNumber
        ? asignaciones.get(row.original.nationalIdNumber)
        : null

      if (!asig) {
        return <span className="dt-badge dt-badge-gray">Sin asignación</span>
      }

      const badgeClass = asig.horario === 'TURNO' ? 'dt-badge-blue' : 'dt-badge-yellow'
      return (
        <span className={`dt-badge ${badgeClass}`}>
          {asig.horario || 'Desconocido'}
        </span>
      )
    },
  }
}

function createScoreColumn(): ColumnDef<CabifyDriver, unknown> {
  return {
    accessorKey: 'score',
    header: 'Score',
    cell: ({ getValue }) => {
      const score = getValue() as number
      const level = getScoreLevel(score)
      return (
        <span className={`cabify-score ${level}`}>
          {score ? Number(score).toFixed(2) : '-'}
        </span>
      )
    },
  }
}

function createTasaAceptacionColumn(): ColumnDef<CabifyDriver, unknown> {
  return {
    accessorKey: 'tasaAceptacion',
    header: 'Tasa Acept.',
    cell: ({ getValue }) => {
      const rate = getValue() as number
      const level = getRateLevel(
        rate,
        ACCEPTANCE_RATE_THRESHOLDS.HIGH,
        ACCEPTANCE_RATE_THRESHOLDS.MEDIUM
      )
      return (
        <span className={`cabify-rate ${level}`}>
          {rate ? `${rate}%` : '-'}
        </span>
      )
    },
  }
}

function createTasaOcupacionColumn(): ColumnDef<CabifyDriver, unknown> {
  return {
    accessorKey: 'tasaOcupacion',
    header: 'Tasa Ocup.',
    cell: ({ getValue }) => {
      const rate = getValue() as number
      const level = getRateLevel(
        rate,
        OCCUPATION_RATE_THRESHOLDS.HIGH,
        OCCUPATION_RATE_THRESHOLDS.MEDIUM
      )
      return (
        <span className={`cabify-rate ${level}`}>
          {rate ? `${rate}%` : '-'}
        </span>
      )
    },
  }
}

function createPermisoEfectivoColumn(): ColumnDef<CabifyDriver, unknown> {
  return {
    accessorKey: 'permisoEfectivo',
    header: 'Pago Efectivo',
    cell: ({ getValue }) => {
      const permiso = getValue() as string
      const badgeClass = permiso === 'Activado' ? 'dt-badge-green' : 'dt-badge-red'
      return (
        <span className={`dt-badge ${badgeClass}`}>
          {permiso || 'Desactivado'}
        </span>
      )
    },
  }
}

function createEstadoColumn(): ColumnDef<CabifyDriver, unknown> {
  return {
    accessorKey: 'disabled',
    header: 'Estado',
    cell: ({ getValue }) => {
      const disabled = getValue() as boolean
      const badgeClass = disabled ? 'dt-badge-solid-gray' : 'dt-badge-solid-green'
      return (
        <span className={`dt-badge ${badgeClass}`}>
          {disabled ? 'Inactivo' : 'Activo'}
        </span>
      )
    },
  }
}
