// src/modules/integraciones/cabify/CabifyModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { cabifyService } from '../../../services/cabifyService'
import { cabifyHistoricalService } from '../../../services/cabifyHistoricalService'
import { asignacionesService, type AsignacionActiva } from '../../../services/asignacionesService'
import type { CabifyQueryState } from '../../../types/cabify.types'
import Swal from 'sweetalert2'
import './CabifyModule.css'

interface CabifyDriver {
  id: string
  companyName?: string
  name?: string
  surname?: string
  email?: string
  nationalIdNumber?: string
  driverLicense?: string
  mobileCc?: string
  mobileNum?: string
  vehiculo?: string
  vehicleMake?: string
  vehicleModel?: string
  vehicleRegPlate?: string
  score?: number
  viajesFinalizados?: number
  viajesRechazados?: number
  viajesPerdidos?: number
  tasaAceptacion?: number
  horasConectadasFormato?: string
  tasaOcupacion?: number
  cobroEfectivo?: number | string
  cobroApp?: number | string
  peajes?: number | string
  gananciaTotal?: number | string
  gananciaPorHora?: number | string
  permisoEfectivo?: string
  disabled?: boolean
}

export function CabifyModule() {
  const [drivers, setDrivers] = useState<CabifyDriver[]>([])
  const [queryState, setQueryState] = useState<CabifyQueryState>({
    loading: false,
    error: null,
    lastUpdate: null,
    period: 'custom'
  })
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0, message: '' })
  const [dataSource, setDataSource] = useState<'historical' | 'api' | 'hybrid'>('historical')
  const [asignaciones, setAsignaciones] = useState<Map<string, AsignacionActiva>>(new Map())

  // TanStack Table states
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Week selector state
  const [availableWeeks, setAvailableWeeks] = useState<Array<{
    weeksAgo: number
    label: string
    startDate: string
    endDate: string
  }>>([])
  const [selectedWeek, setSelectedWeek] = useState<{
    weeksAgo: number
    label: string
    startDate: string
    endDate: string
  } | null>(null)

  // Cargar semanas disponibles al montar el componente
  useEffect(() => {
    const weeks = cabifyService.getAvailableWeeks(12)
    setAvailableWeeks(weeks)

    if (weeks.length > 0) {
      setSelectedWeek(weeks[0])
    }
  }, [])

  // Cargar datos cuando cambia la semana seleccionada
  useEffect(() => {
    if (selectedWeek) {
      loadData()
    }
  }, [selectedWeek])

  // Debounce search term (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(globalFilter)
    }, 300)

    return () => clearTimeout(timer)
  }, [globalFilter])

  const loadData = async () => {
    if (!selectedWeek) {
      console.log('No hay semana seleccionada')
      return
    }

    try {
      setQueryState(prev => ({ ...prev, loading: true, error: null }))
      setDrivers([])
      setLoadingProgress({ current: 0, total: 0, message: '' })

      const { drivers: driverData, stats } = await cabifyHistoricalService.getDriversData(
        selectedWeek.startDate,
        selectedWeek.endDate,
        {
          onProgress: (current, total, message) => {
            setLoadingProgress({ current, total, message })
          }
        }
      )

      setDrivers(driverData)
      setDataSource(stats.source)
      setLoadingProgress({ current: 0, total: 0, message: '' })

      // Cruzar con asignaciones del sistema por DNI
      const dnis = driverData
        .map(d => d.nationalIdNumber)
        .filter(dni => dni && dni.trim().length > 0)

      if (dnis.length > 0) {
        const asignacionesMap = await asignacionesService.getAsignacionesByDNIs(dnis)
        setAsignaciones(asignacionesMap)
      }
      setQueryState(prev => ({
        ...prev,
        loading: false,
        lastUpdate: new Date(),
        error: null
      }))

      const sourceMessages = {
        historical: {
          icon: 'success' as const,
          title: 'Datos desde historial',
          html: `${driverData.length} conductores cargados<br><small>Semana: ${selectedWeek.label}</small>`,
          timer: 2000
        },
        api: {
          icon: 'info' as const,
          title: 'Datos desde API Cabify',
          html: `${driverData.length} conductores cargados<br><small>Semana: ${selectedWeek.label}</small>`,
          timer: 3000
        },
        hybrid: {
          icon: 'success' as const,
          title: 'Datos combinados',
          html: `${driverData.length} conductores cargados<br><small>Semana: ${selectedWeek.label}</small>`,
          timer: 3000
        }
      }

      Swal.fire({ ...sourceMessages[stats.source], showConfirmButton: false })

    } catch (error: any) {
      console.error('Error cargando conductores:', error)
      setQueryState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Error desconocido'
      }))

      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'No se pudieron cargar los conductores'
      })
    }
  }

  const getScoreClass = (score: number) => {
    if (score >= 4.5) return 'high'
    if (score >= 4.0) return 'medium'
    return 'low'
  }

  const getRateClass = (rate: number, highThreshold: number, mediumThreshold: number) => {
    if (rate >= highThreshold) return 'high'
    if (rate >= mediumThreshold) return 'medium'
    return 'low'
  }

  // Definir columnas para TanStack Table
  const columns = useMemo<ColumnDef<CabifyDriver>[]>(
    () => [
      {
        accessorKey: 'companyName',
        header: 'Compañía',
        cell: ({ getValue }) => <span className="cabify-company">{(getValue() as string) || '-'}</span>,
      },
      {
        id: 'conductor',
        header: 'Conductor',
        accessorFn: (row) => `${row.name || ''} ${row.surname || ''}`.trim() || '-',
        cell: ({ getValue }) => <span className="cabify-driver-name">{getValue() as string}</span>,
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ getValue }) => (getValue() as string) || '-',
      },
      {
        accessorKey: 'nationalIdNumber',
        header: 'DNI',
        cell: ({ getValue }) => (getValue() as string) || '-',
      },
      {
        id: 'estadoSistema',
        header: 'Estado Sistema',
        accessorFn: (row) => {
          const asig = row.nationalIdNumber ? asignaciones.get(row.nationalIdNumber) : null
          return asig?.horario || 'Sin asignación'
        },
        cell: ({ row }) => {
          const asig = row.original.nationalIdNumber ? asignaciones.get(row.original.nationalIdNumber) : null
          if (!asig) return <span className="dt-badge dt-badge-gray">Sin asignación</span>
          return (
            <span className={`dt-badge ${asig.horario === 'TURNO' ? 'dt-badge-blue' : 'dt-badge-yellow'}`}>
              {asig.horario || 'Desconocido'}
            </span>
          )
        },
      },
      {
        accessorKey: 'driverLicense',
        header: 'Licencia',
        cell: ({ getValue }) => (getValue() as string) || '-',
      },
      {
        id: 'telefono',
        header: 'Teléfono',
        accessorFn: (row) => row.mobileCc && row.mobileNum ? `${row.mobileCc} ${row.mobileNum}` : '-',
        cell: ({ getValue }) => getValue() as string,
      },
      {
        id: 'vehiculo',
        header: 'Vehículo',
        accessorFn: (row) => row.vehiculo || (row.vehicleMake && row.vehicleModel ? `${row.vehicleMake} ${row.vehicleModel}` : '-'),
        cell: ({ getValue }) => getValue() as string,
      },
      {
        accessorKey: 'vehicleRegPlate',
        header: 'Patente',
        cell: ({ getValue }) => <span className="cabify-plate">{(getValue() as string) || '-'}</span>,
      },
      {
        accessorKey: 'score',
        header: 'Score',
        cell: ({ getValue }) => {
          const score = getValue() as number
          return (
            <span className={`cabify-score ${getScoreClass(score)}`}>
              {score ? Number(score).toFixed(2) : '-'}
            </span>
          )
        },
      },
      {
        accessorKey: 'viajesFinalizados',
        header: 'V. Finalizados',
        cell: ({ getValue }) => <span className="cabify-trips-completed">{(getValue() as number) || 0}</span>,
      },
      {
        accessorKey: 'viajesRechazados',
        header: 'V. Rechazados',
        cell: ({ getValue }) => <span className="cabify-trips-rejected">{(getValue() as number) || 0}</span>,
      },
      {
        accessorKey: 'viajesPerdidos',
        header: 'V. Perdidos',
        cell: ({ getValue }) => <span className="cabify-trips-lost">{(getValue() as number) || 0}</span>,
      },
      {
        accessorKey: 'tasaAceptacion',
        header: 'Tasa Acept.',
        cell: ({ getValue }) => {
          const rate = getValue() as number
          return (
            <span className={`cabify-rate ${getRateClass(rate, 80, 60)}`}>
              {rate ? `${rate}%` : '-'}
            </span>
          )
        },
      },
      {
        accessorKey: 'horasConectadasFormato',
        header: 'Horas',
        cell: ({ getValue }) => <span className="cabify-hours">{(getValue() as string) || '-'}</span>,
      },
      {
        accessorKey: 'tasaOcupacion',
        header: 'Tasa Ocup.',
        cell: ({ getValue }) => {
          const rate = getValue() as number
          return (
            <span className={`cabify-rate ${getRateClass(rate, 70, 50)}`}>
              {rate ? `${rate}%` : '-'}
            </span>
          )
        },
      },
      {
        accessorKey: 'cobroEfectivo',
        header: 'Efectivo',
        cell: ({ getValue }) => `$${(getValue() as string) || '0.00'}`,
      },
      {
        accessorKey: 'cobroApp',
        header: 'App',
        cell: ({ getValue }) => `$${(getValue() as string) || '0.00'}`,
      },
      {
        accessorKey: 'peajes',
        header: 'Peajes',
        cell: ({ getValue }) => <span className="cabify-money tolls">${(getValue() as string) || '0.00'}</span>,
      },
      {
        accessorKey: 'gananciaTotal',
        header: 'Total',
        cell: ({ getValue }) => <span className="cabify-money total">${(getValue() as string) || '0.00'}</span>,
      },
      {
        accessorKey: 'gananciaPorHora',
        header: '$/Hora',
        cell: ({ getValue }) => <span className="cabify-money per-hour">${(getValue() as string) || '0.00'}</span>,
      },
      {
        accessorKey: 'permisoEfectivo',
        header: 'Pago Efectivo',
        cell: ({ getValue }) => {
          const permiso = getValue() as string
          return (
            <span className={`dt-badge ${permiso === 'Activado' ? 'dt-badge-green' : 'dt-badge-red'}`}>
              {permiso || 'Desactivado'}
            </span>
          )
        },
      },
      {
        accessorKey: 'disabled',
        header: 'Estado',
        cell: ({ getValue }) => {
          const disabled = getValue() as boolean
          return (
            <span className={`dt-badge ${disabled ? 'dt-badge-solid-gray' : 'dt-badge-solid-green'}`}>
              {disabled ? 'Inactivo' : 'Activo'}
            </span>
          )
        },
      },
    ],
    [asignaciones]
  )

  const table = useReactTable({
    data: drivers,
    columns,
    state: {
      sorting,
      globalFilter: debouncedSearch,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setDebouncedSearch,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  })

  return (
    <div className="module-container">
      {/* Header */}
      <div className="cabify-header">
        <div className="cabify-header-info">
          <h1>Conductores Cabify</h1>
          <p>Gestión de conductores y estadísticas de la plataforma Cabify</p>
          <div className="cabify-sync-status">
            <span className="cabify-sync-dot" />
            <strong>Sincronización automática activa</strong> - Datos actualizados cada 5 minutos
          </div>
          {queryState.lastUpdate && (
            <p className="cabify-last-update">
              Última consulta: {queryState.lastUpdate.toLocaleString('es-AR')}
            </p>
          )}
        </div>

        <div className="cabify-controls">
          <div className="cabify-week-selector">
            <label>Semana:</label>
            <select
              value={selectedWeek ? selectedWeek.weeksAgo.toString() : ''}
              onChange={(e) => {
                const weeksAgo = Number(e.target.value)
                const selected = availableWeeks.find(w => w.weeksAgo === weeksAgo)
                if (selected) setSelectedWeek(selected)
              }}
              disabled={queryState.loading || availableWeeks.length === 0}
            >
              {availableWeeks.map((week) => (
                <option key={week.weeksAgo} value={week.weeksAgo}>{week.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => loadData()}
            disabled={queryState.loading || !selectedWeek}
            className="btn-primary cabify-refresh-btn"
          >
            <RefreshCw size={18} className={queryState.loading ? 'animate-spin' : ''} />
            {queryState.loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Loading State */}
      {queryState.loading && drivers.length === 0 && (
        <div className="dt-loading">
          <div className="dt-loading-spinner" />
          <span>
            {loadingProgress.total > 0
              ? `${loadingProgress.message} (${loadingProgress.current}/${loadingProgress.total})`
              : 'Cargando conductores desde Cabify...'}
          </span>
        </div>
      )}

      {/* Progress Banner */}
      {queryState.loading && drivers.length > 0 && (
        <div className="cabify-progress-banner">
          <div className="dt-loading-spinner" style={{ width: 20, height: 20 }} />
          <strong>
            {loadingProgress.total > 0
              ? `${loadingProgress.message} (${loadingProgress.current}/${loadingProgress.total})`
              : 'Cargando más conductores...'}
          </strong>
        </div>
      )}

      {/* Error State */}
      {queryState.error && !queryState.loading && (
        <div className="cabify-error">
          <h3>Error al cargar conductores</h3>
          <p>{queryState.error}</p>
          <button onClick={() => loadData()} className="btn-secondary">Reintentar</button>
        </div>
      )}

      {/* Lista de Conductores */}
      {!queryState.error && drivers.length > 0 && (
        <>
          {/* Info Card */}
          <div className={`cabify-info-card ${dataSource}`}>
            <strong>
              {dataSource === 'historical' && 'Datos desde historial:'}
              {dataSource === 'api' && 'Datos desde API Cabify:'}
              {dataSource === 'hybrid' && 'Datos combinados:'}
            </strong>
            <span>
              {drivers.length} conductores
              {dataSource === 'historical' && ' (consulta instantánea)'}
            </span>
            {dataSource === 'historical' && (
              <span className="auto-sync">Sincronización automática cada 5 minutos</span>
            )}
          </div>

          {/* Buscador */}
          <div className="cabify-search-bar">
            <div className="dt-search-wrapper" style={{ flex: 1, maxWidth: 400 }}>
              <Search className="dt-search-icon" size={18} />
              <input
                type="text"
                className="dt-search-input"
                placeholder="Buscar conductor..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
              />
            </div>
            {globalFilter && (
              <button
                onClick={() => setGlobalFilter('')}
                className="btn-secondary"
                style={{ padding: '8px 12px' }}
              >
                Limpiar
              </button>
            )}
            <div className="cabify-results-count">
              {table.getFilteredRowModel().rows.length === drivers.length
                ? `${drivers.length} conductores`
                : `${table.getFilteredRowModel().rows.length} de ${drivers.length} conductores`}
            </div>
          </div>

          {/* Tabla con TanStack Table */}
          <div className="dt-container">
            <div className="dt-table-wrapper" style={{ maxHeight: 600 }}>
              <table className="dt-table" style={{ minWidth: 2000 }}>
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          onClick={header.column.getToggleSortingHandler()}
                          className={header.column.getCanSort() ? 'dt-sortable' : ''}
                        >
                          <div className="dt-header-content">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getCanSort() && (
                              <span className="dt-sort-indicator">
                                {{
                                  asc: ' ↑',
                                  desc: ' ↓',
                                }[header.column.getIsSorted() as string] ?? ' ↕'}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="dt-no-results">
                        No se encontraron resultados
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <tr key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {table.getRowModel().rows.length > 0 && (
              <div className="dt-pagination">
                <div className="dt-pagination-info">
                  Mostrando{' '}
                  {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}{' '}
                  a{' '}
                  {Math.min(
                    (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                    table.getFilteredRowModel().rows.length
                  )}{' '}
                  de {table.getFilteredRowModel().rows.length} registros
                </div>
                <div className="dt-pagination-controls">
                  <button
                    onClick={() => table.setPageIndex(0)}
                    disabled={!table.getCanPreviousPage()}
                    className="dt-pagination-btn"
                  >
                    {'<<'}
                  </button>
                  <button
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="dt-pagination-btn"
                  >
                    {'<'}
                  </button>
                  <span className="dt-pagination-text">
                    Pagina {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
                  </span>
                  <button
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="dt-pagination-btn"
                  >
                    {'>'}
                  </button>
                  <button
                    onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                    disabled={!table.getCanNextPage()}
                    className="dt-pagination-btn"
                  >
                    {'>>'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
