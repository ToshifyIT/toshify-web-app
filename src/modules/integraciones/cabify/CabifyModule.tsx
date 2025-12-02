// src/modules/integraciones/cabify/CabifyModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { cabifyService } from '../../../services/cabifyService'
import { cabifyHistoricalService } from '../../../services/cabifyHistoricalService'
import { asignacionesService, type AsignacionActiva } from '../../../services/asignacionesService'
import type { CabifyQueryState } from '../../../types/cabify.types'
import Swal from 'sweetalert2'
import './CabifyModule.css'

export function CabifyModule() {
  const [drivers, setDrivers] = useState<any[]>([])
  const [queryState, setQueryState] = useState<CabifyQueryState>({
    loading: false,
    error: null,
    lastUpdate: null,
    period: 'custom'
  })
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0, message: '' })
  const [dataSource, setDataSource] = useState<'historical' | 'api' | 'hybrid'>('historical')
  const [asignaciones, setAsignaciones] = useState<Map<string, AsignacionActiva>>(new Map())

  // Search state
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(10)

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

    // Auto-seleccionar la semana actual (primera en la lista)
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
      setDebouncedSearch(searchTerm)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchTerm])

  const loadData = async () => {
    if (!selectedWeek) {
      console.log('No hay semana seleccionada')
      return
    }

    try {
      setQueryState(prev => ({ ...prev, loading: true, error: null }))
      setDrivers([])
      setLoadingProgress({ current: 0, total: 0, message: '' })

      console.log('Cargando datos de conductores...')
      console.log(`Semana seleccionada: ${selectedWeek.label}`)
      console.log(`Rango: ${selectedWeek.startDate} - ${selectedWeek.endDate}`)

      // Usar servicio histórico inteligente (consulta BD primero, API solo si es necesario)
      const { drivers: driverData, stats } = await cabifyHistoricalService.getDriversData(
        selectedWeek.startDate,
        selectedWeek.endDate,
        {
          onProgress: (current, total, message) => {
            setLoadingProgress({ current, total, message })
          }
        }
      )

      console.log(`Datos cargados desde ${stats.source}:`, driverData.length, 'conductores')
      console.log('Estadísticas:', stats)

      setDrivers(driverData)
      setDataSource(stats.source)
      setCurrentPage(1)
      setLoadingProgress({ current: 0, total: 0, message: '' })

      // Cruzar con asignaciones del sistema por DNI (en batch para mejor performance)
      console.log('Consultando asignaciones activas por DNI...')
      const dnis = driverData
        .map(d => d.nationalIdNumber)
        .filter(dni => dni && dni.trim().length > 0)

      if (dnis.length > 0) {
        const asignacionesMap = await asignacionesService.getAsignacionesByDNIs(dnis)
        setAsignaciones(asignacionesMap)
        console.log(`${asignacionesMap.size} conductores con asignación activa`)
      }
      setQueryState(prev => ({
        ...prev,
        loading: false,
        lastUpdate: new Date(),
        error: null
      }))

      // Mostrar mensaje según la fuente de datos
      const sourceMessages = {
        historical: {
          icon: 'success' as const,
          title: 'Datos desde historial',
          html: `
            ${driverData.length} conductores cargados desde la base de datos<br>
            <small>Semana: ${selectedWeek.label}</small><br>
            <small style="color: #059669;">Consulta instantánea (${stats.executionTimeMs}ms)</small>
          `,
          timer: 2000
        },
        api: {
          icon: 'info' as const,
          title: 'Datos desde API Cabify',
          html: `
            ${driverData.length} conductores cargados desde Cabify<br>
            <small>Semana: ${selectedWeek.label}</small><br>
            <small style="color: #7C3AED;">Guardado automáticamente en historial</small>
          `,
          timer: 3000
        },
        hybrid: {
          icon: 'success' as const,
          title: 'Datos combinados',
          html: `
            ${driverData.length} conductores cargados<br>
            <small>${stats.historicalRecords} desde historial + ${stats.apiRecords} desde API</small><br>
            <small>Semana: ${selectedWeek.label}</small>
          `,
          timer: 3000
        }
      }

      const message = sourceMessages[stats.source]
      Swal.fire({
        ...message,
        showConfirmButton: false
      })

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

  // Pre-calculate search index (O(n) once per drivers change)
  const searchIndex = useMemo(() => {
    return new Map(
      drivers.map((driver) => {
        const searchableText = [
          driver.name,
          driver.surname,
          driver.email,
          driver.nationalIdNumber,
          driver.mobileNum,
          driver.vehiculo,
          driver.vehicleRegPlate,
          driver.driverLicense
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return [driver.id, searchableText]
      })
    )
  }, [drivers])

  // Filter drivers based on debounced search term
  const filteredDrivers = useMemo(() => {
    if (!debouncedSearch.trim()) return drivers

    const term = debouncedSearch.toLowerCase()

    return drivers.filter((driver) => {
      const searchableText = searchIndex.get(driver.id)
      return searchableText?.includes(term) || false
    })
  }, [drivers, debouncedSearch, searchIndex])

  // Calculate pagination values
  const totalPages = Math.ceil(filteredDrivers.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentDrivers = filteredDrivers.slice(startIndex, endIndex)

  // Pagination handlers
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
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
          {/* Week Selector */}
          <div className="cabify-week-selector">
            <label>Semana:</label>
            <select
              value={selectedWeek ? selectedWeek.weeksAgo.toString() : ''}
              onChange={(e) => {
                const weeksAgo = Number(e.target.value)
                const selected = availableWeeks.find(w => w.weeksAgo === weeksAgo)
                if (selected) {
                  setSelectedWeek(selected)
                }
              }}
              disabled={queryState.loading || availableWeeks.length === 0}
            >
              {availableWeeks.map((week) => (
                <option key={week.weeksAgo} value={week.weeksAgo}>
                  {week.label}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh Button */}
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
          <button onClick={() => loadData()} className="btn-secondary">
            Reintentar
          </button>
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
              {dataSource === 'api' && ' (guardado automáticamente)'}
            </span>
            {dataSource === 'historical' && (
              <span className="auto-sync">
                Sincronización automática cada 5 minutos
              </span>
            )}
          </div>

          {/* Buscador - usando clases de DataTable */}
          <div className="cabify-search-bar">
            <div className="dt-search-wrapper" style={{ flex: 1, maxWidth: 400 }}>
              <Search className="dt-search-icon" size={18} />
              <input
                type="text"
                className="dt-search-input"
                placeholder="Buscar conductor..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                }}
              />
            </div>
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('')
                  setCurrentPage(1)
                }}
                className="btn-secondary"
                style={{ padding: '8px 12px' }}
              >
                Limpiar
              </button>
            )}
            <div className="cabify-results-count">
              {filteredDrivers.length === drivers.length
                ? `${drivers.length} conductores`
                : `${filteredDrivers.length} de ${drivers.length} conductores`
              }
            </div>
          </div>

          {/* Tabla - usando clases de DataTable */}
          <div className="dt-container">
            <div className="dt-table-wrapper" style={{ maxHeight: 600 }}>
              <table className="dt-table" style={{ minWidth: 2000 }}>
                <thead>
                  <tr>
                    <th>Compañía</th>
                    <th>Conductor</th>
                    <th>Email</th>
                    <th>DNI</th>
                    <th>Estado Sistema</th>
                    <th>Licencia</th>
                    <th>Teléfono</th>
                    <th>Vehículo</th>
                    <th>Patente</th>
                    <th style={{ textAlign: 'center' }}>Score</th>
                    <th style={{ textAlign: 'center' }}>V. Finalizados</th>
                    <th style={{ textAlign: 'center' }}>V. Rechazados</th>
                    <th style={{ textAlign: 'center' }}>V. Perdidos</th>
                    <th style={{ textAlign: 'center' }}>Tasa Acept.</th>
                    <th style={{ textAlign: 'center' }}>Horas</th>
                    <th style={{ textAlign: 'center' }}>Tasa Ocup.</th>
                    <th style={{ textAlign: 'right' }}>Efectivo</th>
                    <th style={{ textAlign: 'right' }}>App</th>
                    <th style={{ textAlign: 'right' }}>Peajes</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>$/Hora</th>
                    <th style={{ textAlign: 'center' }}>Pago Efectivo</th>
                    <th style={{ textAlign: 'center' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {currentDrivers.map((driver, index) => {
                    const asignacion = driver.nationalIdNumber ? asignaciones.get(driver.nationalIdNumber) : null

                    return (
                      <tr key={driver.id || index}>
                        <td className="cabify-company">{driver.companyName || '-'}</td>
                        <td className="cabify-driver-name">
                          {driver.name && driver.surname ? `${driver.name} ${driver.surname}` : driver.name || '-'}
                        </td>
                        <td>{driver.email || '-'}</td>
                        <td>{driver.nationalIdNumber || '-'}</td>
                        <td style={{ textAlign: 'center' }}>
                          {!asignacion ? (
                            <span className="dt-badge dt-badge-gray">Sin asignación</span>
                          ) : (
                            <span className={`dt-badge ${asignacion.horario === 'TURNO' ? 'dt-badge-blue' : 'dt-badge-yellow'}`}>
                              {asignacion.horario || 'Desconocido'}
                            </span>
                          )}
                        </td>
                        <td>{driver.driverLicense || '-'}</td>
                        <td>{driver.mobileCc && driver.mobileNum ? `${driver.mobileCc} ${driver.mobileNum}` : '-'}</td>
                        <td>
                          {driver.vehiculo ||
                            (driver.vehicleMake && driver.vehicleModel
                              ? `${driver.vehicleMake} ${driver.vehicleModel}`
                              : '-')}
                        </td>
                        <td className="cabify-plate">{driver.vehicleRegPlate || '-'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`cabify-score ${getScoreClass(driver.score)}`}>
                            {driver.score ? Number(driver.score).toFixed(2) : '-'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }} className="cabify-trips-completed">{driver.viajesFinalizados || 0}</td>
                        <td style={{ textAlign: 'center' }} className="cabify-trips-rejected">{driver.viajesRechazados || 0}</td>
                        <td style={{ textAlign: 'center' }} className="cabify-trips-lost">{driver.viajesPerdidos || 0}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`cabify-rate ${getRateClass(driver.tasaAceptacion, 80, 60)}`}>
                            {driver.tasaAceptacion ? `${driver.tasaAceptacion}%` : '-'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }} className="cabify-hours">{driver.horasConectadasFormato || '-'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`cabify-rate ${getRateClass(driver.tasaOcupacion, 70, 50)}`}>
                            {driver.tasaOcupacion ? `${driver.tasaOcupacion}%` : '-'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>${driver.cobroEfectivo || '0.00'}</td>
                        <td style={{ textAlign: 'right' }}>${driver.cobroApp || '0.00'}</td>
                        <td style={{ textAlign: 'right' }} className="cabify-money tolls">${driver.peajes || '0.00'}</td>
                        <td style={{ textAlign: 'right' }} className="cabify-money total">${driver.gananciaTotal || '0.00'}</td>
                        <td style={{ textAlign: 'right' }} className="cabify-money per-hour">${driver.gananciaPorHora || '0.00'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`dt-badge ${driver.permisoEfectivo === 'Activado' ? 'dt-badge-green' : 'dt-badge-red'}`}>
                            {driver.permisoEfectivo || 'Desactivado'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`dt-badge ${driver.disabled ? 'dt-badge-solid-gray' : 'dt-badge-solid-green'}`}>
                            {driver.disabled ? 'Inactivo' : 'Activo'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination - usando clases de DataTable */}
            <div className="dt-pagination">
              <div className="dt-pagination-info">
                Mostrando {startIndex + 1} a {Math.min(endIndex, filteredDrivers.length)} de {filteredDrivers.length} registros
              </div>
              <div className="dt-pagination-controls">
                <button
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1}
                  className="dt-pagination-btn"
                >
                  {'<<'}
                </button>
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="dt-pagination-btn"
                >
                  {'<'}
                </button>
                <span className="dt-pagination-text">
                  Pagina {currentPage} de {totalPages}
                </span>
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="dt-pagination-btn"
                >
                  {'>'}
                </button>
                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="dt-pagination-btn"
                >
                  {'>>'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
