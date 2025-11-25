// src/modules/integraciones/cabify/CabifyModule.tsx
import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { cabifyService } from '../../../services/cabifyService'
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

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Week selector state
  const [availableWeeks, setAvailableWeeks] = useState<Array<{
    year: number
    week: number
    label: string
    startDate: string
    endDate: string
  }>>([])
  const [selectedWeek, setSelectedWeek] = useState<{
    year: number
    week: number
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

      console.log('🔄 Obteniendo datos detallados de conductores de Cabify...')
      console.log(`📅 Semana seleccionada: ${selectedWeek.label}`)
      console.log(`📅 Rango: ${selectedWeek.startDate} - ${selectedWeek.endDate}`)

      const data = await cabifyService.getDriversWithDetails('custom', {
        startDate: selectedWeek.startDate,
        endDate: selectedWeek.endDate
      })

      console.log('✅ Conductores recibidos con detalles:', data)
      setDrivers(data)
      setCurrentPage(1) // Reset to first page when loading new data
      setQueryState(prev => ({
        ...prev,
        loading: false,
        lastUpdate: new Date(),
        error: null
      }))

      Swal.fire({
        icon: 'success',
        title: 'Conductores obtenidos',
        text: `${data.length} conductores cargados - ${selectedWeek.label}`,
        timer: 2000,
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
        text: error.message || 'No se pudieron cargar los conductores de Cabify'
      })
    }
  }

  // Calculate pagination values
  const totalPages = Math.ceil(drivers.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentDrivers = drivers.slice(startIndex, endIndex)

  // Pagination handlers
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1) // Reset to first page when changing items per page
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1F2937', marginBottom: '8px' }}>
            Lista de Conductores Cabify (TEST)
          </h1>
          <p style={{ color: '#6B7280', fontSize: '14px' }}>
            Verificando conexión con la API
          </p>
          {queryState.lastUpdate && (
            <p style={{ color: '#9CA3AF', fontSize: '12px', marginTop: '4px' }}>
              Última actualización: {queryState.lastUpdate.toLocaleString('es-AR')}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Week Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280' }}>
              Semana:
            </label>
            <select
              value={selectedWeek ? `${selectedWeek.year}-${selectedWeek.week}` : ''}
              onChange={(e) => {
                const [year, week] = e.target.value.split('-').map(Number)
                const selected = availableWeeks.find(w => w.year === year && w.week === week)
                if (selected) {
                  setSelectedWeek(selected)
                }
              }}
              disabled={queryState.loading || availableWeeks.length === 0}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid #D1D5DB',
                fontSize: '14px',
                fontWeight: 600,
                cursor: queryState.loading ? 'not-allowed' : 'pointer',
                background: 'white',
                color: '#1F2937',
                minWidth: '200px'
              }}
            >
              {availableWeeks.map((week) => (
                <option key={`${week.year}-${week.week}`} value={`${week.year}-${week.week}`}>
                  {week.label}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => loadData()}
            disabled={queryState.loading || !selectedWeek}
            style={{
              padding: '10px 20px',
              background: queryState.loading || !selectedWeek ? '#9CA3AF' : '#DC2626',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: queryState.loading || !selectedWeek ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '20px'
            }}
          >
            <RefreshCw size={18} style={{ animation: queryState.loading ? 'spin 1s linear infinite' : 'none' }} />
            {queryState.loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Loading State */}
      {queryState.loading && (
        <div style={{ textAlign: 'center', padding: '100px 50px', color: '#6B7280' }}>
          <div style={{
            border: '3px solid #f0f0f0',
            borderTop: '3px solid #1a1a1a',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            animation: 'spin 1s linear infinite',
            margin: '20px auto'
          }} />
          <p>Cargando conductores desde Cabify...</p>
        </div>
      )}

      {/* Error State */}
      {queryState.error && !queryState.loading && (
        <div style={{
          textAlign: 'center',
          padding: '50px',
          color: '#DC2626',
          background: '#FEF2F2',
          margin: '20px',
          borderRadius: '8px',
          border: '1px solid #FEE'
        }}>
          <h3 style={{ marginBottom: '10px' }}>Error al cargar conductores</h3>
          <p>{queryState.error}</p>
          <button
            onClick={() => loadData()}
            style={{
              marginTop: '15px',
              padding: '10px 20px',
              background: '#D1FAE5',
              color: '#065F46',
              border: '1px solid #A7F3D0',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Lista de Conductores */}
      {!queryState.loading && !queryState.error && drivers.length > 0 && (
        <>
          {/* Info Card */}
          <div style={{
            background: '#D1FAE5',
            border: '1px solid #A7F3D0',
            borderRadius: '8px',
            padding: '16px 24px',
            marginBottom: '24px',
            color: '#065F46'
          }}>
            <strong>✅ Conexión exitosa:</strong> Se obtuvieron {drivers.length} conductores desde la API de Cabify
          </div>

          {/* Tabla Simple */}
          <div style={{
            background: 'white',
            borderRadius: '8px',
            border: '1px solid #E5E7EB',
            overflow: 'hidden'
          }}>
            <div style={{
              background: '#EDE9FE',
              color: '#1B1F3B',
              padding: '20px 24px',
              fontSize: '1.05rem',
              fontWeight: 600,
              borderBottom: '1px solid #DDD6FE'
            }}>
              Conductores Activos de Cabify
            </div>

            <div style={{ maxHeight: '600px', overflowY: 'auto', overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.875rem'
              }}>
                <thead>
                  <tr>
                    {[
                      'Compañía',
                      'Conductor',
                      'Email',
                      'DNI',
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
                        background: '#EDE9FE',
                        color: '#1B1F3B',
                        padding: '14px 16px',
                        textAlign: 'left',
                        fontWeight: 600,
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        borderBottom: '1px solid #DDD6FE',
                        fontSize: '0.75rem',
                        letterSpacing: '0.3px',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap'
                      }}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {currentDrivers.map((driver, index) => (
                    <tr key={driver.id || index} style={{
                      background: index % 2 === 0 ? 'white' : '#FAFAFA'
                    }}>
                      {/* Compañía */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', fontSize: '0.7rem', fontWeight: 600, color: '#6B7280' }}>
                        {driver.companyName || '-'}
                      </td>

                      {/* Conductor (Nombre completo) */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <strong style={{ fontSize: '0.875rem', color: '#111827' }}>
                            {driver.name && driver.surname ? `${driver.name} ${driver.surname}` : driver.name || '-'}
                          </strong>
                        </div>
                      </td>

                      {/* Email */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem', color: '#4B5563' }}>
                        {driver.email || '-'}
                      </td>

                      {/* DNI */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', fontSize: '0.8rem' }}>
                        {driver.nationalIdNumber || '-'}
                      </td>

                      {/* Licencia */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', fontSize: '0.8rem' }}>
                        {driver.driverLicense || '-'}
                      </td>

                      {/* Teléfono */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>
                        {driver.mobileCc && driver.mobileNum ? `${driver.mobileCc} ${driver.mobileNum}` : '-'}
                      </td>

                      {/* Vehículo (Marca + Modelo) */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>
                        {driver.vehiculo ||
                          (driver.vehicleMake && driver.vehicleModel
                            ? `${driver.vehicleMake} ${driver.vehicleModel}`
                            : '-')}
                      </td>

                      {/* Patente */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', fontWeight: 600, fontSize: '0.8rem' }}>
                        {driver.vehicleRegPlate || '-'}
                      </td>

                      {/* Score */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', textAlign: 'center' }}>
                        <strong style={{
                          color: driver.score >= 4.5 ? '#059669' : driver.score >= 4.0 ? '#D97706' : '#DC2626',
                          fontSize: '0.875rem'
                        }}>
                          {driver.score ? Number(driver.score).toFixed(2) : '-'}
                        </strong>
                      </td>

                      {/* Viajes Finalizados */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', textAlign: 'center', fontWeight: 600 }}>
                        {driver.viajesFinalizados || 0}
                      </td>

                      {/* Viajes Rechazados */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', textAlign: 'center', color: '#DC2626' }}>
                        {driver.viajesRechazados || 0}
                      </td>

                      {/* Viajes Perdidos */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', textAlign: 'center', color: '#F59E0B' }}>
                        {driver.viajesPerdidos || 0}
                      </td>

                      {/* Tasa Aceptación */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', textAlign: 'center', fontWeight: 600 }}>
                        <span style={{
                          color: driver.tasaAceptacion >= 80 ? '#059669' : driver.tasaAceptacion >= 60 ? '#D97706' : '#DC2626'
                        }}>
                          {driver.tasaAceptacion ? `${driver.tasaAceptacion}%` : '-'}
                        </span>
                      </td>

                      {/* Horas Conectadas */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                        {driver.horasConectadasFormato || '-'}
                      </td>

                      {/* Tasa Ocupación */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', textAlign: 'center', fontWeight: 600 }}>
                        <span style={{
                          color: driver.tasaOcupacion >= 70 ? '#059669' : driver.tasaOcupacion >= 50 ? '#D97706' : '#DC2626'
                        }}>
                          {driver.tasaOcupacion ? `${driver.tasaOcupacion}%` : '-'}
                        </span>
                      </td>

                      {/* Cobro Efectivo */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', textAlign: 'right', fontSize: '0.8rem', color: '#4B5563' }}>
                        ${driver.cobroEfectivo || '0.00'}
                      </td>

                      {/* Cobro App */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', textAlign: 'right', fontSize: '0.8rem', color: '#4B5563' }}>
                        ${driver.cobroApp || '0.00'}
                      </td>

                      {/* Peajes */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', textAlign: 'right', fontSize: '0.8rem', color: '#6B7280' }}>
                        ${driver.peajes || '0.00'}
                      </td>

                      {/* Ganancia Total */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>
                        ${driver.gananciaTotal || '0.00'}
                      </td>

                      {/* Ganancia por Hora */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 700, fontSize: '0.875rem', color: '#059669' }}>
                        ${driver.gananciaPorHora || '0.00'}
                      </td>

                      {/* Permiso Efectivo */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          background: driver.permisoEfectivo === 'Activado' ? '#D1FAE5' : '#FEE2E2',
                          color: driver.permisoEfectivo === 'Activado' ? '#065F46' : '#991B1B',
                          border: `1px solid ${driver.permisoEfectivo === 'Activado' ? '#A7F3D0' : '#FECACA'}`
                        }}>
                          {driver.permisoEfectivo || 'Desactivado'}
                        </span>
                      </td>

                      {/* Estado */}
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #E5E7EB', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.7rem',
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
              padding: '20px 24px',
              borderTop: '1px solid #E5E7EB',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px'
            }}>
              {/* Items per page selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.875rem', color: '#6B7280' }}>Mostrar:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #D1D5DB',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    background: 'white'
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span style={{ fontSize: '0.875rem', color: '#6B7280' }}>
                  conductores por página
                </span>
              </div>

              {/* Page info */}
              <div style={{ fontSize: '0.875rem', color: '#6B7280' }}>
                Mostrando {startIndex + 1}-{Math.min(endIndex, drivers.length)} de {drivers.length} conductores
              </div>

              {/* Page navigation */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #D1D5DB',
                    background: currentPage === 1 ? '#F3F4F6' : 'white',
                    color: currentPage === 1 ? '#9CA3AF' : '#374151',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500
                  }}
                >
                  Primera
                </button>

                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #D1D5DB',
                    background: currentPage === 1 ? '#F3F4F6' : 'white',
                    color: currentPage === 1 ? '#9CA3AF' : '#374151',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500
                  }}
                >
                  Anterior
                </button>

                {/* Page numbers */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid #D1D5DB',
                          background: currentPage === pageNum ? '#7C3AED' : 'white',
                          color: currentPage === pageNum ? 'white' : '#374151',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: currentPage === pageNum ? 600 : 500,
                          minWidth: '36px'
                        }}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #D1D5DB',
                    background: currentPage === totalPages ? '#F3F4F6' : 'white',
                    color: currentPage === totalPages ? '#9CA3AF' : '#374151',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500
                  }}
                >
                  Siguiente
                </button>

                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #D1D5DB',
                    background: currentPage === totalPages ? '#F3F4F6' : 'white',
                    color: currentPage === totalPages ? '#9CA3AF' : '#374151',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500
                  }}
                >
                  Última
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
