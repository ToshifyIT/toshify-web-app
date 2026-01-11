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
import { Users, UserX, ChevronDown, ChevronUp, Database } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable/DataTable'
import { ExcelColumnFilter, useExcelFilters } from '../../../components/ui/DataTable/ExcelColumnFilter'

// Tipos
import type { CabifyDriver, AccordionKey, WeekOption } from './types/cabify.types'

// Hooks
import { useCabifyData, useCabifyStats } from './hooks'
import { useCabifyRankings } from './hooks/useCabifyRankings'

// Componentes
import { CabifyHeader, type DateRange, StatsAccordion, TopDriversSection } from './components'

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
// HELPER PARA CREAR RANGO DE FECHAS INICIAL
// =====================================================

/**
 * Crear rango de fechas inicial basado en la semana seleccionada
 */
function createInitialDateRange(selectedWeek: WeekOption | null): DateRange | null {
  if (!selectedWeek) return null
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

  // Rango de fechas basado en la semana seleccionada
  const effectiveDateRange = useMemo(() => {
    return createInitialDateRange(selectedWeek)
  }, [selectedWeek])

  // Memorizar las props del hook de rankings para evitar re-renders innecesarios
  const rankingProps = useMemo(
    () => {
      if (!effectiveDateRange) return undefined
      return {
        fechaInicio: effectiveDateRange.startDate,
        fechaFin: effectiveDateRange.endDate
      }
    },
    [effectiveDateRange]
  )

  // Rankings desde histórico con filtro de período
  const { topMejores, topPeores } = useCabifyRankings(rankingProps)

  // Estado local de UI
  const [accordionState, setAccordionState] = useState(INITIAL_ACCORDION_STATE)

  // Column filter states - Multiselect tipo Excel
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])

  // Excel filter hook for portal-based dropdowns
  const { openFilterId, setOpenFilterId } = useExcelFilters()

  const estadoOptions = ['activo', 'inactivo']

  // Filtrar drivers según los filtros de columna
  const filteredDrivers = useMemo(() => {
    let result = drivers

    if (estadoFilter.length > 0) {
      result = result.filter(d => {
        const estadoValue = d.disabled ? 'inactivo' : 'activo'
        return estadoFilter.includes(estadoValue)
      })
    }

    return result
  }, [drivers, estadoFilter])

  // Handlers
  const handleToggleAccordion = useCallback((key: AccordionKey) => {
    setAccordionState((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // Columnas de la tabla con filtros Excel
  const columns = useTableColumns(
    asignaciones,
    {
      estadoFilter,
      setEstadoFilter,
      estadoOptions,
      openFilterId,
      setOpenFilterId
    }
  )

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

  // Label del período actual para mostrar en UI (en hora Argentina)
  const periodLabel = useMemo(() => {
    if (!effectiveDateRange) return 'Sin período'
    const formatOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }
    const startDate = new Date(effectiveDateRange.startDate).toLocaleDateString('es-AR', formatOptions)
    const endDate = new Date(effectiveDateRange.endDate).toLocaleDateString('es-AR', formatOptions)
    return `${startDate} - ${endDate}`
  }, [effectiveDateRange])

  // Conductores sin asignación activa
  const driversWithoutAssignment = useMemo(() => {
    if (!drivers.length || !asignaciones) return []
    return drivers.filter(driver => {
      if (!driver.nationalIdNumber) return true // Sin DNI = sin asignación
      return !asignaciones.has(driver.nationalIdNumber)
    })
  }, [drivers, asignaciones])

  // Estado para expandir/colapsar la sección de sin asignación
  const [showUnassigned, setShowUnassigned] = useState(false)

  return (
    <div className="module-container">
      <CabifyHeader
        lastUpdate={queryState.lastUpdate}
        isLoading={isLoading}
        availableWeeks={availableWeeks}
        selectedWeek={selectedWeek}
        onWeekChange={setSelectedWeek}
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
          data={filteredDrivers}
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

      {/* Sección de conductores sin asignación */}
      {!isLoading && driversWithoutAssignment.length > 0 && (
        <DriversWithoutAssignmentSection
          drivers={driversWithoutAssignment}
          isExpanded={showUnassigned}
          onToggle={() => setShowUnassigned(!showUnassigned)}
        />
      )}
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

  return (
    <div className={`cabify-info-card ${dataSource}`}>
      <Database size={14} />
      <span>
        <strong>{DATA_SOURCE_LABELS[dataSource]}</strong> {driverCount} conductores - {periodLabel}
      </span>
    </div>
  )
}

// =====================================================
// SECCIÓN DE CONDUCTORES SIN ASIGNACIÓN
// =====================================================

interface DriversWithoutAssignmentSectionProps {
  readonly drivers: CabifyDriver[]
  readonly isExpanded: boolean
  readonly onToggle: () => void
}

function DriversWithoutAssignmentSection({
  drivers,
  isExpanded,
  onToggle
}: DriversWithoutAssignmentSectionProps) {
  // Calcular totales de la sección
  const totals = useMemo(() => {
    const totalGanancias = drivers.reduce((sum, d) => sum + (Number(d.gananciaTotal) || 0), 0)
    const totalViajes = drivers.reduce((sum, d) => sum + (d.viajesFinalizados || 0), 0)
    return { totalGanancias, totalViajes }
  }, [drivers])

  return (
    <div className="cabify-unassigned-section">
      <button
        className="cabify-unassigned-header"
        onClick={onToggle}
        type="button"
      >
        <div className="cabify-unassigned-title">
          <UserX size={20} />
          <span>Conductores Sin Asignación Activa</span>
          <span className="cabify-unassigned-count">{drivers.length}</span>
        </div>
        <div className="cabify-unassigned-summary">
          <span className="summary-item">
            {totals.totalGanancias.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })}
          </span>
          <span className="summary-separator">•</span>
          <span className="summary-item">{totals.totalViajes} viajes</span>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </button>

      {isExpanded && (
        <div className="cabify-unassigned-list">
          {drivers.map((driver) => (
            <div key={driver.id || driver.nationalIdNumber} className="cabify-unassigned-item">
              <div className="driver-info">
                <span className="driver-name">
                  {driver.name} {driver.surname}
                </span>
                <span className="driver-dni">{driver.nationalIdNumber || 'Sin DNI'}</span>
              </div>
              <div className="driver-stats">
                <span className="stat-viajes">{driver.viajesFinalizados || 0} viajes</span>
                <span className="stat-separator">•</span>
                <span className="stat-score">Score {driver.score ? Number(driver.score).toFixed(2) : '0.00'}</span>
                <span className="stat-separator">•</span>
                <span className="stat-ganancias">
                  {Number(driver.gananciaTotal || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// =====================================================
// HOOK PARA COLUMNAS DE TABLA
// =====================================================

import type { AsignacionActiva } from '../../../services/asignacionesService'

interface FilterState {
  estadoFilter: string[]
  setEstadoFilter: (filters: string[]) => void
  estadoOptions: string[]
  openFilterId: string | null
  setOpenFilterId: (filterId: string | null) => void
}

function useTableColumns(
  asignaciones: Map<string, AsignacionActiva>,
  filters: FilterState
): ColumnDef<CabifyDriver, unknown>[] {
  return useMemo<ColumnDef<CabifyDriver, unknown>[]>(
    () => [
      // COMPANYNAME column hidden per user request
      createConductorColumn(),
      createTextColumn('email', 'Email'),
      createTextColumn('nationalIdNumber', 'DNI'),
      createModalidadColumn(asignaciones),
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
      createEstadoColumnWithFilter(filters),
    ],
    [asignaciones, filters]
  )
}

// Columna de Estado con filtro Excel
function createEstadoColumnWithFilter(filters: FilterState): ColumnDef<CabifyDriver, unknown> {
  return {
    accessorKey: 'disabled',
    header: () => (
      <ExcelColumnFilter
        label="Estado"
        options={filters.estadoOptions}
        selectedValues={filters.estadoFilter}
        onSelectionChange={filters.setEstadoFilter}
        filterId="estado"
        openFilterId={filters.openFilterId}
        onOpenChange={filters.setOpenFilterId}
      />
    ),
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
      const rawValue = getValue() as string | number
      const numValue = Number(rawValue) || 0
      // Formato pesos argentinos
      const formatted = numValue.toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
      return className ? <span className={className}>{formatted}</span> : formatted
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

function createModalidadColumn(
  asignaciones: Map<string, AsignacionActiva>
): ColumnDef<CabifyDriver, unknown> {
  return {
    id: 'modalidad',
    header: 'Modalidad',
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

