// src/modules/integraciones/cabify/CabifyModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { cabifyService } from '../../../services/cabifyService'
import { cabifyHistoricalService } from '../../../services/cabifyHistoricalService'
import { asignacionesService, type AsignacionActiva } from '../../../services/asignacionesService'
import type { CabifyQueryState } from '../../../types/cabify.types'
import Swal from 'sweetalert2'

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

  const loadData = async () => {
    if (!selectedWeek) {
      console.log('⚠️ No hay semana seleccionada')
      return
    }

    try {
      setQueryState(prev => ({ ...prev, loading: true, error: null }))
      setDrivers([])
      setLoadingProgress({ current: 0, total: 0, message: '' })

      console.log('🔄 Cargando datos de conductores...')
      console.log(`📅 Semana seleccionada: ${selectedWeek.label}`)
      console.log(`📅 Rango: ${selectedWeek.startDate} - ${selectedWeek.endDate}`)

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

      console.log(`✅ Datos cargados desde ${stats.source}:`, driverData.length, 'conductores')
      console.log('📊 Estadísticas:', stats)

      setDrivers(driverData)
      setDataSource(stats.source)
      setCurrentPage(1)
      setLoadingProgress({ current: 0, total: 0, message: '' })

      // Cruzar con asignaciones del sistema por DNI (en batch para mejor performance)
      console.log('🔄 Consultando asignaciones activas por DNI...')
      const dnis = driverData
        .map(d => d.nationalIdNumber)
        .filter(dni => dni && dni.trim().length > 0)

      if (dnis.length > 0) {
        const asignacionesMap = await asignacionesService.getAsignacionesByDNIs(dnis)
        setAsignaciones(asignacionesMap)
        console.log(`✅ ${asignacionesMap.size} conductores con asignación activa`)
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
            📊 ${driverData.length} conductores cargados desde la base de datos<br>
            <small>Semana: ${selectedWeek.label}</small><br>
            <small style="color: #059669;">⚡ Consulta instantánea (${stats.executionTimeMs}ms)</small>
          `,
          timer: 2000
        },
        api: {
          icon: 'info' as const,
          title: 'Datos desde API Cabify',
          html: `
            🌐 ${driverData.length} conductores cargados desde Cabify<br>
            <small>Semana: ${selectedWeek.label}</small><br>
            <small style="color: #7C3AED;">💾 Guardado automáticamente en historial</small>
          `,
          timer: 3000
        },
        hybrid: {
          icon: 'success' as const,
          title: 'Datos combinados',
          html: `
            🔄 ${driverData.length} conductores cargados<br>
            <small>📊 ${stats.historicalRecords} desde historial + 🌐 ${stats.apiRecords} desde API</small><br>
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
      console.error('❌ Error cargando conductores:', error)
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

  // Filter drivers based on search term
  const filteredDrivers = useMemo(() => {
    if (!searchTerm.trim()) return drivers

    const term = searchTerm.toLowerCase()
    return drivers.filter((driver) => {
      const fullName = `${driver.name} ${driver.surname}`.toLowerCase()
      const email = (driver.email || '').toLowerCase()
      const dni = (driver.nationalIdNumber || '').toString().toLowerCase()
      const phone = (driver.mobileNum || '').toString().toLowerCase()
      const vehicle = (driver.vehiculo || '').toLowerCase()
      const plate = (driver.vehicleRegPlate || '').toLowerCase()
      const license = (driver.driverLicense || '').toLowerCase()

      return (
        fullName.includes(term) ||
        email.includes(term) ||
        dni.includes(term) ||
        phone.includes(term) ||
        vehicle.includes(term) ||
        plate.includes(term) ||
        license.includes(term)
      )
    })
  }, [drivers, searchTerm])

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

  return (
    <div style={{ padding: '24px', backgroundColor: '#F9FAFB', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '16px',
        flexWrap: 'wrap'
      }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
            Conductores Cabify
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6B7280', marginBottom: '4px' }}>
            Gestión de conductores y estadísticas de la plataforma Cabify
          </p>
          <div style={{
            fontSize: '0.75rem',
            color: '#059669',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '4px'
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#059669',
              display: 'inline-block',
              animation: 'pulse 2s infinite'
            }} />
            <strong>Sincronización automática activa</strong> - Datos actualizados cada 5 minutos
          </div>
          {queryState.lastUpdate && (
            <p style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: '4px' }}>
              Última consulta: {queryState.lastUpdate.toLocaleString('es-AR')}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
          {/* Week Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280' }}>
              Semana:
            </label>
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
              style={{
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: 500,
                backgroundColor: 'white',
                color: '#374151',
                minWidth: '200px',
                cursor: queryState.loading || availableWeeks.length === 0 ? 'not-allowed' : 'pointer'
              }}
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
            className="btn-primary"
            style={{
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: queryState.loading || !selectedWeek ? 0.5 : 1,
              cursor: queryState.loading || !selectedWeek ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={18} className={queryState.loading ? 'animate-spin' : ''} />
            {queryState.loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Loading State - Solo mostrar spinner si NO hay datos todavía */}
      {queryState.loading && drivers.length === 0 && (
        <div style={{ textAlign: 'center', padding: '96px 24px', color: '#6B7280' }}>
          <div style={{
            display: 'inline-block',
            width: '48px',
            height: '48px',
            border: '4px solid #E5E7EB',
            borderTop: '4px solid #111827',
            borderRadius: '50%',
            marginBottom: '16px'
          }} className="animate-spin" />
          <p style={{ fontSize: '0.875rem' }}>
            {loadingProgress.total > 0
              ? `${loadingProgress.message} (${loadingProgress.current}/${loadingProgress.total})`
              : 'Cargando conductores desde Cabify...'}
          </p>
        </div>
      )}

      {/* Progress Banner - Mostrar cuando hay datos cargándose incrementalmente */}
      {queryState.loading && drivers.length > 0 && (
        <div style={{
          backgroundColor: '#EFF6FF',
          border: '1px solid #BFDBFE',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
          color: '#1E40AF',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            display: 'inline-block',
            width: '20px',
            height: '20px',
            border: '3px solid #BFDBFE',
            borderTop: '3px solid #1E40AF',
            borderRadius: '50%'
          }} className="animate-spin" />
          <strong>
            {loadingProgress.total > 0
              ? `${loadingProgress.message} (${loadingProgress.current}/${loadingProgress.total})`
              : 'Cargando más conductores...'}
          </strong>
        </div>
      )}

      {/* Error State */}
      {queryState.error && !queryState.loading && (
        <div style={{
          backgroundColor: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '8px',
          padding: '48px 24px',
          textAlign: 'center'
        }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#B91C1C', marginBottom: '8px' }}>
            Error al cargar conductores
          </h3>
          <p style={{ color: '#DC2626', marginBottom: '16px' }}>{queryState.error}</p>
          <button
            onClick={() => loadData()}
            className="btn-secondary"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Lista de Conductores - Mostrar mientras se cargan o cuando ya están cargados */}
      {!queryState.error && drivers.length > 0 && (
        <>
          {/* Info Card */}
          <div style={{
            backgroundColor: dataSource === 'historical' ? '#ECFDF5' : dataSource === 'api' ? '#EFF6FF' : '#FEF3C7',
            border: dataSource === 'historical' ? '1px solid #A7F3D0' : dataSource === 'api' ? '1px solid #BFDBFE' : '1px solid #FCD34D',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            color: dataSource === 'historical' ? '#065F46' : dataSource === 'api' ? '#1E40AF' : '#92400E',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <strong>
              {dataSource === 'historical' && '📊 Datos desde historial:'}
              {dataSource === 'api' && '🌐 Datos desde API Cabify:'}
              {dataSource === 'hybrid' && '🔄 Datos combinados:'}
            </strong>
            <span>
              {drivers.length} conductores
              {dataSource === 'historical' && ' (consulta instantánea)'}
              {dataSource === 'api' && ' (guardado automáticamente)'}
            </span>
            {dataSource === 'historical' && (
              <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontStyle: 'italic' }}>
                ⚡ Sincronización automática cada 5 minutos
              </span>
            )}
          </div>

          {/* Buscador */}
          <div style={{
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ position: 'relative', flex: '1 1 auto', maxWidth: '400px' }}>
              <Search style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9CA3AF'
              }} size={18} />
              <input
                type="text"
                placeholder="Buscar conductor..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                }}
                style={{
                  width: '100%',
                  paddingLeft: '40px',
                  paddingRight: '12px',
                  paddingTop: '8px',
                  paddingBottom: '8px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  backgroundColor: 'white',
                  color: '#374151',
                  outline: 'none'
                }}
              />
            </div>
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('')
                  setCurrentPage(1)
                }}
                style={{
                  fontSize: '0.875rem',
                  color: '#6B7280',
                  fontWeight: 500,
                  cursor: 'pointer',
                  backgroundColor: 'transparent',
                  border: 'none',
                  padding: '4px 8px'
                }}
              >
                Limpiar
              </button>
            )}
            <div style={{ fontSize: '0.875rem', color: '#6B7280' }}>
              {filteredDrivers.length === drivers.length
                ? `${drivers.length} conductores`
                : `${filteredDrivers.length} de ${drivers.length} conductores`
              }
            </div>
          </div>

          {/* Tabla */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse'
              }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                    {[
                      'Compañía',
                      'Conductor',
                      'Email',
                      'DNI',
                      'Estado Sistema',
                      'Licencia',
                      'Teléfono',
                      'Vehículo',
                      'Patente',
                      'Score',
                      'V. Finalizados',
                      'V. Rechazados',
                      'V. Perdidos',
                      'Tasa Acept.',
                      'Horas',
                      'Tasa Ocup.',
                      'Efectivo',
                      'App',
                      'Peajes',
                      'Total',
                      '$/Hora',
                      'Pago Efectivo',
                      'Estado'
                    ].map((header) => (
                      <th key={header} style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#374151',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        background: '#F9FAFB'
                      }}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {currentDrivers.map((driver, index) => (
                    <tr
                      key={driver.id || index}
                      style={{
                        borderBottom: '1px solid #E5E7EB',
                        transition: 'background 0.2s',
                        background: 'white'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                    >
                      {/* Compañía */}
                      <td style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#6B7280' }}>
                        {driver.companyName || '-'}
                      </td>

                      {/* Conductor (Nombre completo) */}
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1F2937' }}>
                        <strong>
                          {driver.name && driver.surname ? `${driver.name} ${driver.surname}` : driver.name || '-'}
                        </strong>
                      </td>

                      {/* Email */}
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1F2937' }}>
                        {driver.email || '-'}
                      </td>

                      {/* DNI */}
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1F2937' }}>
                        {driver.nationalIdNumber || '-'}
                      </td>

                      {/* Estado Sistema (TURNO/CARGO) */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {(() => {
                          const asignacion = driver.nationalIdNumber ? asignaciones.get(driver.nationalIdNumber) : null

                          if (!asignacion) {
                            return (
                              <span style={{
                                display: 'inline-block',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                background: '#F3F4F6',
                                color: '#6B7280',
                                border: '1px solid #E5E7EB'
                              }}>
                                Sin asignación
                              </span>
                            )
                          }

                          const isTurno = asignacion.horario === 'TURNO'
                          const isCargo = asignacion.horario === 'CARGO'

                          return (
                            <span style={{
                              display: 'inline-block',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              background: isTurno ? '#DBEAFE' : isCargo ? '#FEF3C7' : '#F3F4F6',
                              color: isTurno ? '#1E40AF' : isCargo ? '#92400E' : '#6B7280',
                              border: `1px solid ${isTurno ? '#BFDBFE' : isCargo ? '#FCD34D' : '#E5E7EB'}`
                            }}>
                              {asignacion.horario || 'Desconocido'}
                            </span>
                          )
                        })()}
                      </td>

                      {/* Licencia */}
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1F2937' }}>
                        {driver.driverLicense || '-'}
                      </td>

                      {/* Teléfono */}
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1F2937' }}>
                        {driver.mobileCc && driver.mobileNum ? `${driver.mobileCc} ${driver.mobileNum}` : '-'}
                      </td>

                      {/* Vehículo (Marca + Modelo) */}
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1F2937' }}>
                        {driver.vehiculo ||
                          (driver.vehicleMake && driver.vehicleModel
                            ? `${driver.vehicleMake} ${driver.vehicleModel}`
                            : '-')}
                      </td>

                      {/* Patente */}
                      <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>
                        {driver.vehicleRegPlate || '-'}
                      </td>

                      {/* Score */}
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', color: '#1F2937' }}>
                        <strong style={{
                          color: driver.score >= 4.5 ? '#059669' : driver.score >= 4.0 ? '#D97706' : '#DC2626'
                        }}>
                          {driver.score ? Number(driver.score).toFixed(2) : '-'}
                        </strong>
                      </td>

                      {/* Viajes Finalizados */}
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>
                        {driver.viajesFinalizados || 0}
                      </td>

                      {/* Viajes Rechazados */}
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', color: '#DC2626' }}>
                        {driver.viajesRechazados || 0}
                      </td>

                      {/* Viajes Perdidos */}
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', color: '#F59E0B' }}>
                        {driver.viajesPerdidos || 0}
                      </td>

                      {/* Tasa Aceptación */}
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', fontWeight: 600 }}>
                        <span style={{
                          color: driver.tasaAceptacion >= 80 ? '#059669' : driver.tasaAceptacion >= 60 ? '#D97706' : '#DC2626'
                        }}>
                          {driver.tasaAceptacion ? `${driver.tasaAceptacion}%` : '-'}
                        </span>
                      </td>

                      {/* Horas Conectadas */}
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>
                        {driver.horasConectadasFormato || '-'}
                      </td>

                      {/* Tasa Ocupación */}
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', fontWeight: 600 }}>
                        <span style={{
                          color: driver.tasaOcupacion >= 70 ? '#059669' : driver.tasaOcupacion >= 50 ? '#D97706' : '#DC2626'
                        }}>
                          {driver.tasaOcupacion ? `${driver.tasaOcupacion}%` : '-'}
                        </span>
                      </td>

                      {/* Cobro Efectivo */}
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', color: '#1F2937' }}>
                        ${driver.cobroEfectivo || '0.00'}
                      </td>

                      {/* Cobro App */}
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', color: '#1F2937' }}>
                        ${driver.cobroApp || '0.00'}
                      </td>

                      {/* Peajes */}
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', color: '#6B7280' }}>
                        ${driver.peajes || '0.00'}
                      </td>

                      {/* Ganancia Total */}
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontSize: '14px', color: '#111827' }}>
                        ${driver.gananciaTotal || '0.00'}
                      </td>

                      {/* Ganancia por Hora */}
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontSize: '14px', color: '#059669' }}>
                        ${driver.gananciaPorHora || '0.00'}
                      </td>

                      {/* Permiso Efectivo */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: driver.permisoEfectivo === 'Activado' ? '#D1FAE5' : '#FEE2E2',
                          color: driver.permisoEfectivo === 'Activado' ? '#065F46' : '#991B1B',
                          border: `1px solid ${driver.permisoEfectivo === 'Activado' ? '#A7F3D0' : '#FECACA'}`
                        }}>
                          {driver.permisoEfectivo || 'Desactivado'}
                        </span>
                      </td>

                      {/* Estado */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: driver.disabled ? '#FEE2E2' : '#D1FAE5',
                          color: driver.disabled ? '#991B1B' : '#065F46',
                          border: `1px solid ${driver.disabled ? '#FECACA' : '#A7F3D0'}`
                        }}>
                          {driver.disabled ? 'Inactivo' : 'Activo'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div style={{
              padding: '16px',
              borderTop: '1px solid #E5E7EB',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              {/* Page info */}
              <div style={{ fontSize: '14px', color: '#6B7280' }}>
                Mostrando {startIndex + 1} a {Math.min(endIndex, filteredDrivers.length)} de {filteredDrivers.length} registros
              </div>

              {/* Page navigation */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    background: 'white',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    color: '#374151'
                  }}
                >
                  Anterior
                </button>
                <span style={{ padding: '8px 12px', fontSize: '14px', color: '#6B7280' }}>
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    background: 'white',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    color: '#374151'
                  }}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
