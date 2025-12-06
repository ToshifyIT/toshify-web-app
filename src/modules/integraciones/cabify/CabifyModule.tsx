// src/modules/integraciones/cabify/CabifyModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Users } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable/DataTable'
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
  const columns = useMemo<ColumnDef<CabifyDriver, any>[]>(
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

  // Loading message personalizado
  const loadingMessage = loadingProgress.total > 0
    ? `${loadingProgress.message} (${loadingProgress.current}/${loadingProgress.total})`
    : 'Cargando conductores desde Cabify...'

  // Calcular Top 10 Mejores y Peores (solo con asignación activa)
  const { topMejores, topPeores } = useMemo(() => {
    // Filtrar solo conductores con asignación activa
    const conductoresConAsignacion = drivers.filter(d => {
      const asig = d.nationalIdNumber ? asignaciones.get(d.nationalIdNumber) : null
      return asig !== null && asig !== undefined
    })

    // Ordenar por ganancia total
    const ordenados = [...conductoresConAsignacion].sort((a, b) => {
      const gA = typeof a.gananciaTotal === 'string' ? parseFloat(a.gananciaTotal) : (a.gananciaTotal || 0)
      const gB = typeof b.gananciaTotal === 'string' ? parseFloat(b.gananciaTotal) : (b.gananciaTotal || 0)
      return gB - gA // Mayor a menor
    })

    return {
      topMejores: ordenados.slice(0, 10),
      topPeores: ordenados.slice(-10).reverse() // Últimos 10, invertidos para mostrar del peor al menos peor
    }
  }, [drivers, asignaciones])

  // Función para formatear moneda
  const formatCurrency = (value: number | string | undefined): string => {
    const num = typeof value === 'string' ? parseFloat(value) : (value || 0)
    return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Función para obtener patente (primera si hay múltiples separadas por /)
  const getPatente = (driver: CabifyDriver): string => {
    // Primero intentar patente del sistema (asignación)
    const asig = driver.nationalIdNumber ? asignaciones.get(driver.nationalIdNumber) : null
    if (asig?.patente) {
      return asig.patente
    }
    // Si no, usar la de Cabify (primera si hay múltiples)
    if (driver.vehicleRegPlate) {
      const patentes = driver.vehicleRegPlate.split('/')
      return patentes[0].trim()
    }
    return '-'
  }

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

      {/* Progress Banner (solo cuando hay datos y está cargando más) */}
      {queryState.loading && drivers.length > 0 && (
        <div className="cabify-progress-banner">
          <div className="dt-loading-spinner" style={{ width: 20, height: 20 }} />
          <strong>{loadingMessage}</strong>
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

      {/* Info Card (solo cuando hay datos) */}
      {!queryState.error && drivers.length > 0 && (
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
      )}

      {/* Top 10 Cards */}
      {!queryState.loading && drivers.length > 0 && (topMejores.length > 0 || topPeores.length > 0) && (
        <div className="cabify-tops-container">
          {/* Top 10 Mejores */}
          <div className="cabify-top-card mejores">
            <h3 className="cabify-top-title mejores">Top 10 Mejores Conductores</h3>
            <div className="cabify-top-list">
              {topMejores.map((driver, index) => {
                const asig = driver.nationalIdNumber ? asignaciones.get(driver.nationalIdNumber) : null
                return (
                  <div key={driver.id} className="cabify-top-item">
                    <div className="cabify-top-rank">#{index + 1}</div>
                    <div className="cabify-top-info">
                      <div className="cabify-top-name">
                        {driver.name} {driver.surname}
                      </div>
                      <div className="cabify-top-details">
                        {getPatente(driver)} • {driver.viajesFinalizados || 0} viajes • Score {driver.score?.toFixed(2) || '-'}
                      </div>
                    </div>
                    <div className="cabify-top-stats">
                      {asig && (
                        <span className={`cabify-top-badge ${asig.horario === 'CARGO' ? 'cargo' : 'turno'}`}>
                          {asig.horario === 'CARGO' ? 'A cargo' : 'Turno'}
                        </span>
                      )}
                      <span className="cabify-top-amount mejores">
                        {formatCurrency(driver.gananciaTotal)}
                      </span>
                    </div>
                  </div>
                )
              })}
              {topMejores.length === 0 && (
                <div className="cabify-top-empty">No hay conductores con asignación activa</div>
              )}
            </div>
          </div>

          {/* Top 10 Peores */}
          <div className="cabify-top-card peores">
            <h3 className="cabify-top-title peores">10 Conductores con Menor Rendimiento</h3>
            <div className="cabify-top-list">
              {topPeores.map((driver, index) => {
                const asig = driver.nationalIdNumber ? asignaciones.get(driver.nationalIdNumber) : null
                return (
                  <div key={driver.id} className="cabify-top-item">
                    <div className="cabify-top-rank">#{index + 1}</div>
                    <div className="cabify-top-info">
                      <div className="cabify-top-name">
                        {driver.name} {driver.surname}
                      </div>
                      <div className="cabify-top-details">
                        {getPatente(driver)} • {driver.viajesFinalizados || 0} viajes • Score {driver.score?.toFixed(2) || '-'}
                      </div>
                    </div>
                    <div className="cabify-top-stats">
                      {asig && (
                        <span className={`cabify-top-badge ${asig.horario === 'CARGO' ? 'cargo' : 'turno'}`}>
                          {asig.horario === 'CARGO' ? 'A cargo' : 'Turno'}
                        </span>
                      )}
                      <span className="cabify-top-amount peores">
                        {formatCurrency(driver.gananciaTotal)}
                      </span>
                    </div>
                  </div>
                )
              })}
              {topPeores.length === 0 && (
                <div className="cabify-top-empty">No hay conductores con asignación activa</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DataTable */}
      <div className="cabify-table-container">
        <DataTable
          data={drivers}
          columns={columns}
          loading={queryState.loading && drivers.length === 0}
          error={null}
          searchPlaceholder="Buscar conductor por nombre, email, DNI, patente..."
          emptyIcon={<Users size={48} />}
          emptyTitle="No hay conductores"
          emptyDescription="Selecciona una semana y haz clic en Actualizar para cargar datos"
          pageSize={20}
          pageSizeOptions={[10, 20, 50, 100]}
        />
      </div>
    </div>
  )
}
