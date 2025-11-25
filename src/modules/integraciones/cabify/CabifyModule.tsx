// src/modules/integraciones/cabify/CabifyModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Search, Database } from 'lucide-react'
import { cabifyService } from '../../../services/cabifyService'
import type { CabifyQueryState } from '../../../types/cabify.types'
import Swal from 'sweetalert2'
import { supabase } from '../../../lib/supabase'

export function CabifyModule() {
  const [drivers, setDrivers] = useState<any[]>([])
  const [queryState, setQueryState] = useState<CabifyQueryState>({
    loading: false,
    error: null,
    lastUpdate: null,
    period: 'custom'
  })

  // Search state
  const [searchTerm, setSearchTerm] = useState('')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

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

      console.log('🔄 Cargando datos de conductores...')
      console.log(`📅 Semana seleccionada: ${selectedWeek.label}`)
      console.log(`📅 Rango: ${selectedWeek.startDate} - ${selectedWeek.endDate}`)

      // PASO 1: Intentar cargar desde el historial primero
      console.log('📊 Consultando tabla cabify_historico...')
      const { data: historicalData, error: dbError } = await supabase
        .from('cabify_historico')
        .select('*')
        .eq('fecha_inicio', selectedWeek.startDate)
        .eq('fecha_fin', selectedWeek.endDate)

      if (dbError) {
        console.warn('⚠️ Error consultando historial:', dbError)
      }

      // Si hay datos en el historial, usarlos
      if (historicalData && historicalData.length > 0) {
        console.log(`✅ Datos encontrados en historial: ${historicalData.length} conductores`)

        // Mapear datos del historial al formato del frontend
        const mappedData = historicalData.map((record: any) => ({
          id: record.cabify_driver_id,
          companyId: record.cabify_company_id,
          companyName: record.cabify_company_id,
          name: record.nombre,
          surname: record.apellido,
          email: record.email,
          nationalIdNumber: record.dni,
          mobileNum: record.telefono_numero,
          mobileCc: record.telefono_codigo,
          driverLicense: record.licencia,
          assetId: record.vehiculo_id,
          vehicleMake: record.vehiculo_marca,
          vehicleModel: record.vehiculo_modelo,
          vehicleRegPlate: record.vehiculo_patente,
          vehiculo: record.vehiculo_completo,
          score: record.score,
          viajesAceptados: record.viajes_aceptados,
          viajesPerdidos: record.viajes_perdidos,
          viajesOfrecidos: record.viajes_ofrecidos,
          viajesFinalizados: record.viajes_finalizados,
          viajesRechazados: record.viajes_rechazados,
          tasaAceptacion: record.tasa_aceptacion,
          horasConectadas: record.horas_conectadas,
          horasConectadasFormato: record.horas_conectadas_formato,
          tasaOcupacion: record.tasa_ocupacion,
          cobroEfectivo: record.cobro_efectivo,
          cobroApp: record.cobro_app,
          gananciaTotal: record.ganancia_total,
          gananciaPorHora: record.ganancia_por_hora,
          peajes: record.peajes,
          permisoEfectivo: record.permiso_efectivo,
          disabled: record.estado_conductor === 'Inactivo',
          activatedAt: null
        }))

        setDrivers(mappedData)
        setCurrentPage(1)
        setQueryState(prev => ({
          ...prev,
          loading: false,
          lastUpdate: new Date(),
          error: null
        }))

        Swal.fire({
          icon: 'success',
          title: 'Datos desde historial',
          html: `
            📊 ${mappedData.length} conductores cargados<br>
            <small>Semana: ${selectedWeek.label}</small>
          `,
          timer: 2000,
          showConfirmButton: false
        })

        return
      }

      // PASO 2: Si no hay datos en historial, consultar API de Cabify
      console.log('🌐 No hay datos en historial, consultando API de Cabify...')

      const data = await cabifyService.getDriversWithDetails('custom', {
        startDate: selectedWeek.startDate,
        endDate: selectedWeek.endDate
      })

      console.log('✅ Conductores recibidos desde API:', data)
      setDrivers(data)
      setCurrentPage(1)
      setQueryState(prev => ({
        ...prev,
        loading: false,
        lastUpdate: new Date(),
        error: null
      }))

      Swal.fire({
        icon: 'success',
        title: 'Datos desde API Cabify',
        html: `
          🌐 ${data.length} conductores cargados<br>
          <small>Semana: ${selectedWeek.label}</small><br>
          <small style="color: #F59E0B;">💡 Puedes sincronizar estos datos para consultas futuras</small>
        `,
        timer: 3000,
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

  const sincronizarHistorial = async () => {
    if (!selectedWeek) {
      Swal.fire({
        icon: 'warning',
        title: 'Advertencia',
        text: 'Primero selecciona una semana'
      })
      return
    }

    if (drivers.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Sin datos',
        text: 'No hay conductores cargados para sincronizar'
      })
      return
    }

    try {
      // Confirmar con el usuario
      const result = await Swal.fire({
        icon: 'question',
        title: 'Sincronizar con historial',
        html: `
          ¿Guardar los datos de <strong>${drivers.length} conductores</strong> en el historial?<br>
          <small>Semana: ${selectedWeek.label}</small>
        `,
        showCancelButton: true,
        confirmButtonText: 'Sí, guardar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#7C3AED'
      })

      if (!result.isConfirmed) return

      // Mostrar loading
      Swal.fire({
        title: 'Sincronizando...',
        html: 'Guardando datos en el historial',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading()
        }
      })

      // Obtener el token de sesión
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('No hay sesión activa')
      }

      // Mapear los drivers al formato de la tabla cabify_historico
      const historyData = drivers.map(driver => ({
        cabify_driver_id: driver.id,
        cabify_company_id: driver.companyId,
        nombre: driver.name,
        apellido: driver.surname,
        email: driver.email,
        dni: driver.nationalIdNumber,
        licencia: driver.driverLicense,
        telefono_codigo: driver.mobileCc,
        telefono_numero: driver.mobileNum,
        vehiculo_id: driver.assetId,
        vehiculo_patente: driver.vehicleRegPlate,
        vehiculo_marca: driver.vehicleMake,
        vehiculo_modelo: driver.vehicleModel,
        vehiculo_completo: driver.vehiculo,
        viajes_finalizados: driver.viajesFinalizados,
        viajes_rechazados: driver.viajesRechazados,
        viajes_perdidos: driver.viajesPerdidos,
        viajes_aceptados: driver.viajesAceptados,
        viajes_ofrecidos: driver.viajesOfrecidos,
        score: driver.score,
        tasa_aceptacion: driver.tasaAceptacion,
        tasa_ocupacion: driver.tasaOcupacion,
        horas_conectadas: driver.horasConectadas,
        horas_conectadas_formato: driver.horasConectadasFormato,
        cobro_efectivo: driver.cobroEfectivo,
        cobro_app: driver.cobroApp,
        peajes: driver.peajes,
        ganancia_total: driver.gananciaTotal,
        ganancia_por_hora: driver.gananciaPorHora,
        permiso_efectivo: driver.permisoEfectivo,
        estado_conductor: driver.disabled ? 'Inactivo' : 'Activo'
      }))

      // Llamar al Edge Function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const response = await fetch(`${supabaseUrl}/functions/v1/save-cabify-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          drivers: historyData,
          startDate: selectedWeek.startDate,
          endDate: selectedWeek.endDate
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al sincronizar')
      }

      const responseData = await response.json()

      // Mostrar éxito
      Swal.fire({
        icon: 'success',
        title: 'Sincronizado',
        html: `
          ✅ ${responseData.message}<br>
          <small>Semana: ${selectedWeek.label}</small>
        `,
        confirmButtonColor: '#7C3AED'
      })

    } catch (error: any) {
      console.error('❌ Error al sincronizar:', error)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'No se pudo sincronizar con el historial'
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

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1) // Reset to first page when changing items per page
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
          <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>
            Gestión de conductores y estadísticas de la plataforma Cabify
          </p>
          {queryState.lastUpdate && (
            <p style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: '4px' }}>
              Última actualización: {queryState.lastUpdate.toLocaleString('es-AR')}
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

          {/* Sincronizar con Historial Button */}
          <button
            onClick={sincronizarHistorial}
            disabled={queryState.loading || !selectedWeek || drivers.length === 0}
            className="btn-secondary"
            style={{
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: queryState.loading || !selectedWeek || drivers.length === 0 ? 0.5 : 1,
              cursor: queryState.loading || !selectedWeek || drivers.length === 0 ? 'not-allowed' : 'pointer',
              backgroundColor: '#7C3AED',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 600
            }}
          >
            <Database size={18} />
            Sincronizar con Historial
          </button>
        </div>
      </div>

      {/* Loading State */}
      {queryState.loading && (
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
          <p style={{ fontSize: '0.875rem' }}>Cargando conductores desde Cabify...</p>
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

      {/* Lista de Conductores */}
      {!queryState.loading && !queryState.error && drivers.length > 0 && (
        <>
          {/* Info Card */}
          <div style={{
            backgroundColor: '#ECFDF5',
            border: '1px solid #A7F3D0',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            color: '#065F46',
            fontSize: '0.875rem'
          }}>
            <strong>✅ Conexión exitosa:</strong> Se obtuvieron {drivers.length} conductores desde la API de Cabify
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
            borderRadius: '8px',
            border: '1px solid #E5E7EB',
            overflow: 'hidden',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
          }}>
            <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
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
                        background: '#F9FAFB',
                        color: '#374151',
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontWeight: 600,
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        borderBottom: '1px solid #E5E7EB',
                        fontSize: '0.75rem',
                        letterSpacing: '0.5px',
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
                      background: index % 2 === 0 ? '#FFFFFF' : '#F9FAFB'
                    }}>
                      {/* Compañía */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', fontSize: '0.7rem', fontWeight: 600, color: '#6B7280' }}>
                        {driver.companyName || '-'}
                      </td>

                      {/* Conductor (Nombre completo) */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <strong style={{ fontSize: '0.875rem', color: '#111827' }}>
                            {driver.name && driver.surname ? `${driver.name} ${driver.surname}` : driver.name || '-'}
                          </strong>
                        </div>
                      </td>

                      {/* Email */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem', color: '#4B5563' }}>
                        {driver.email || '-'}
                      </td>

                      {/* DNI */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', fontSize: '0.8rem' }}>
                        {driver.nationalIdNumber || '-'}
                      </td>

                      {/* Licencia */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', fontSize: '0.8rem' }}>
                        {driver.driverLicense || '-'}
                      </td>

                      {/* Teléfono */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>
                        {driver.mobileCc && driver.mobileNum ? `${driver.mobileCc} ${driver.mobileNum}` : '-'}
                      </td>

                      {/* Vehículo (Marca + Modelo) */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', fontSize: '0.75rem' }}>
                        {driver.vehiculo ||
                          (driver.vehicleMake && driver.vehicleModel
                            ? `${driver.vehicleMake} ${driver.vehicleModel}`
                            : '-')}
                      </td>

                      {/* Patente */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', fontWeight: 600, fontSize: '0.8rem' }}>
                        {driver.vehicleRegPlate || '-'}
                      </td>

                      {/* Score */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', textAlign: 'center' }}>
                        <strong style={{
                          color: driver.score >= 4.5 ? '#059669' : driver.score >= 4.0 ? '#D97706' : '#DC2626',
                          fontSize: '0.875rem'
                        }}>
                          {driver.score ? Number(driver.score).toFixed(2) : '-'}
                        </strong>
                      </td>

                      {/* Viajes Finalizados */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', textAlign: 'center', fontWeight: 600 }}>
                        {driver.viajesFinalizados || 0}
                      </td>

                      {/* Viajes Rechazados */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', textAlign: 'center', color: '#DC2626' }}>
                        {driver.viajesRechazados || 0}
                      </td>

                      {/* Viajes Perdidos */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', textAlign: 'center', color: '#F59E0B' }}>
                        {driver.viajesPerdidos || 0}
                      </td>

                      {/* Tasa Aceptación */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', textAlign: 'center', fontWeight: 600 }}>
                        <span style={{
                          color: driver.tasaAceptacion >= 80 ? '#059669' : driver.tasaAceptacion >= 60 ? '#D97706' : '#DC2626'
                        }}>
                          {driver.tasaAceptacion ? `${driver.tasaAceptacion}%` : '-'}
                        </span>
                      </td>

                      {/* Horas Conectadas */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                        {driver.horasConectadasFormato || '-'}
                      </td>

                      {/* Tasa Ocupación */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', textAlign: 'center', fontWeight: 600 }}>
                        <span style={{
                          color: driver.tasaOcupacion >= 70 ? '#059669' : driver.tasaOcupacion >= 50 ? '#D97706' : '#DC2626'
                        }}>
                          {driver.tasaOcupacion ? `${driver.tasaOcupacion}%` : '-'}
                        </span>
                      </td>

                      {/* Cobro Efectivo */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', textAlign: 'right', fontSize: '0.8rem', color: '#4B5563' }}>
                        ${driver.cobroEfectivo || '0.00'}
                      </td>

                      {/* Cobro App */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', textAlign: 'right', fontSize: '0.8rem', color: '#4B5563' }}>
                        ${driver.cobroApp || '0.00'}
                      </td>

                      {/* Peajes */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', textAlign: 'right', fontSize: '0.8rem', color: '#6B7280' }}>
                        ${driver.peajes || '0.00'}
                      </td>

                      {/* Ganancia Total */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>
                        ${driver.gananciaTotal || '0.00'}
                      </td>

                      {/* Ganancia por Hora */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 700, fontSize: '0.875rem', color: '#059669' }}>
                        ${driver.gananciaPorHora || '0.00'}
                      </td>

                      {/* Permiso Efectivo */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', textAlign: 'center' }}>
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
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', textAlign: 'center' }}>
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
              padding: '16px 20px',
              borderTop: '1px solid #E5E7EB',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px',
              backgroundColor: '#FAFAFA'
            }}>
              {/* Items per page selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.875rem', color: '#6B7280' }}>Mostrar:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                  style={{
                    padding: '6px 10px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    backgroundColor: 'white',
                    color: '#374151',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span style={{ fontSize: '0.875rem', color: '#6B7280' }}>
                  por página
                </span>
              </div>

              {/* Page info */}
              <div style={{ fontSize: '0.875rem', color: '#6B7280' }}>
                Mostrando {startIndex + 1}-{Math.min(endIndex, filteredDrivers.length)} de {filteredDrivers.length}
                {searchTerm && ` (filtrados de ${drivers.length})`}
              </div>

              {/* Page navigation */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    backgroundColor: currentPage === 1 ? '#F3F4F6' : 'white',
                    color: currentPage === 1 ? '#9CA3AF' : '#374151',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Primera
                </button>

                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    backgroundColor: currentPage === 1 ? '#F3F4F6' : 'white',
                    color: currentPage === 1 ? '#9CA3AF' : '#374151',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
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
                          border: currentPage === pageNum ? '1px solid #7C3AED' : '1px solid #D1D5DB',
                          borderRadius: '6px',
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          minWidth: '40px',
                          backgroundColor: currentPage === pageNum ? '#7C3AED' : 'white',
                          color: currentPage === pageNum ? 'white' : '#374151',
                          cursor: 'pointer'
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
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    backgroundColor: currentPage === totalPages ? '#F3F4F6' : 'white',
                    color: currentPage === totalPages ? '#9CA3AF' : '#374151',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                  }}
                >
                  Siguiente
                </button>

                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    backgroundColor: currentPage === totalPages ? '#F3F4F6' : 'white',
                    color: currentPage === totalPages ? '#9CA3AF' : '#374151',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                  }}
                >
                  Última
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
