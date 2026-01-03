// src/modules/asignaciones/AsignacionesModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { Eye, Trash2, Plus, CheckCircle, XCircle, FileText, Calendar, CalendarRange, Activity, Filter, Car } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable/DataTable'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import { AssignmentWizard } from '../../components/AssignmentWizard'
import Swal from 'sweetalert2'
import './AsignacionesModule.css'

interface Asignacion {
  id: string
  codigo: string
  vehiculo_id: string
  conductor_id: string
  fecha_programada?: string | null
  fecha_inicio: string
  fecha_fin: string | null
  modalidad: string
  horario: string
  estado: string
  notas: string | null
  created_at: string
  created_by?: string | null
  vehiculos?: {
    patente: string
    marca: string
    modelo: string
  }
  conductores?: {
    nombres: string
    apellidos: string
    numero_licencia: string
  }
  asignaciones_conductores?: Array<{
    id: string
    conductor_id: string
    estado: string
    horario: string
    confirmado: boolean
    fecha_confirmacion?: string | null
    conductores: {
      nombres: string
      apellidos: string
      numero_licencia: string
    }
  }>
}

interface ConductorTurno {
  diurno: { id: string; nombre: string; confirmado: boolean } | null
  nocturno: { id: string; nombre: string; confirmado: boolean } | null
}

interface ExpandedAsignacion extends Asignacion {
  conductoresTurno: ConductorTurno | null
  conductorCargo: { id: string; nombre: string; confirmado: boolean } | null
}

export function AsignacionesModule() {
  const { canCreateInMenu, canEditInMenu, canDeleteInMenu } = usePermissions()
  const canCreate = canCreateInMenu('asignaciones')
  const canEdit = canEditInMenu('asignaciones')
  const canDelete = canDeleteInMenu('asignaciones')

  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [vehiculosSinAsignacion, setVehiculosSinAsignacion] = useState<Array<{
    id: string
    patente: string
    marca: string
    modelo: string
    anio: number
  }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  // Filtros (usados en cabeceras de columnas)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [modalityFilter, setModalityFilter] = useState<string>('')
  const [vehicleFilter, setVehicleFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [selectedAsignacion, setSelectedAsignacion] = useState<Asignacion | null>(null)
  const [confirmComentarios, setConfirmComentarios] = useState('')
  const [cancelMotivo, setCancelMotivo] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [viewAsignacion, setViewAsignacion] = useState<Asignacion | null>(null)
  const [conductoresToConfirm, setConductoresToConfirm] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [statsData, setStatsData] = useState({
    totalVehiculos: 0,
    vehiculosDisponibles: 0,
    vehiculosEnUso: 0,
    vehiculosEnTaller: 0,
    vehiculosFueraServicio: 0,
    turnosDisponibles: 0,
    conductoresDisponibles: 0,
    conductoresAsignados: 0,
    totalConductores: 0,
    entregasHoy: 0,
    entregasSemana: 0,
    asignacionesActivas: 0,
    unidadesDisponibles: 0  // Vehículos sin asignar + vehículos TURNO con al menos 1 vacante
  })

  const loadStatsData = async () => {
    try {
      // Total de vehículos
      const { count: totalVehiculos } = await supabase
        .from('vehiculos')
        .select('*', { count: 'exact', head: true })

      // Obtener todos los estados de vehículos
      const { data: estadosVehiculos } = await supabase
        .from('vehiculos_estados')
        .select('id, codigo') as { data: Array<{ id: string; codigo: string }> | null }

      const estadoIdMap = new Map<string, string>()
      estadosVehiculos?.forEach(e => estadoIdMap.set(e.codigo, e.id))

      // Vehículos disponibles (estado = DISPONIBLE)
      let vehiculosDisponibles = 0
      const estadoDisponibleId = estadoIdMap.get('DISPONIBLE')
      if (estadoDisponibleId) {
        const { count } = await supabase
          .from('vehiculos')
          .select('*', { count: 'exact', head: true })
          .eq('estado_id', estadoDisponibleId)
        vehiculosDisponibles = count || 0
      }

      // Vehículos en uso (estado = EN_USO)
      let vehiculosEnUso = 0
      const estadoEnUsoId = estadoIdMap.get('EN_USO')
      if (estadoEnUsoId) {
        const { count } = await supabase
          .from('vehiculos')
          .select('*', { count: 'exact', head: true })
          .eq('estado_id', estadoEnUsoId)
        vehiculosEnUso = count || 0
      }

      // Vehículos en taller (TALLER_AXIS + TALLER_CHAPA_PINTURA)
      let vehiculosEnTaller = 0
      const tallerIds = [estadoIdMap.get('TALLER_AXIS'), estadoIdMap.get('TALLER_CHAPA_PINTURA')].filter(Boolean) as string[]
      if (tallerIds.length > 0) {
        const { count } = await supabase
          .from('vehiculos')
          .select('*', { count: 'exact', head: true })
          .in('estado_id', tallerIds)
        vehiculosEnTaller = count || 0
      }

      // Vehículos fuera de servicio (ROBO, DESTRUCCION_TOTAL, PKG_OFF_BASE)
      let vehiculosFueraServicio = 0
      const fueraServicioIds = [
        estadoIdMap.get('ROBO'),
        estadoIdMap.get('DESTRUCCION_TOTAL'),
        estadoIdMap.get('PKG_OFF_BASE')
      ].filter(Boolean) as string[]
      if (fueraServicioIds.length > 0) {
        const { count } = await supabase
          .from('vehiculos')
          .select('*', { count: 'exact', head: true })
          .in('estado_id', fueraServicioIds)
        vehiculosFueraServicio = count || 0
      }

      // Obtener todos los conductores con su estado (mismo filtro que el wizard)
      const { data: todosConductores } = await supabase
        .from('conductores')
        .select('id, estado_id, conductores_estados(codigo)') as { data: Array<{ id: string; estado_id: string; conductores_estados: { codigo: string } | null }> | null }

      // Filtrar conductores activos (cualquier variante del código que incluya 'activo')
      // Esta es la misma lógica que usa el AssignmentWizard
      const conductoresActivos = todosConductores?.filter(c =>
        c.conductores_estados?.codigo?.toLowerCase().includes('activo')
      ) || []
      const totalConductores = conductoresActivos.length

      // Obtener asignaciones activas
      const { data: asignacionesActivasData } = await supabase
        .from('asignaciones')
        .select('id')
        .eq('estado', 'activa') as { data: Array<{ id: string }> | null }

      const asignacionesActivasIds = asignacionesActivasData?.map(a => a.id) || []

      // Obtener conductores en esas asignaciones activas
      let conductoresOcupadosIds = new Set<string>()
      if (asignacionesActivasIds.length > 0) {
        const { data: conductoresOcupados } = await supabase
          .from('asignaciones_conductores')
          .select('conductor_id')
          .in('asignacion_id', asignacionesActivasIds) as { data: Array<{ conductor_id: string }> | null }

        conductoresOcupadosIds = new Set(
          conductoresOcupados?.map(c => c.conductor_id) || []
        )
      }

      // Conductores disponibles = conductores activos que NO están en asignaciones activas
      const conductoresDisponibles = conductoresActivos.filter(c =>
        !conductoresOcupadosIds.has(c.id)
      ).length

      // Turnos disponibles: calcular basado en vehículos en uso que tienen turnos libres
      // Un vehículo en modo TURNO tiene 2 turnos (diurno/nocturno)
      const { data: asignacionesActivasParaTurnos } = await supabase
        .from('asignaciones')
        .select('id, horario, asignaciones_conductores(id, horario)')
        .eq('estado', 'activa') as { data: Array<{ id: string; horario: string; asignaciones_conductores: any[] }> | null }

      let turnosOcupados = 0
      asignacionesActivasParaTurnos?.forEach(a => {
        if (a.horario === 'TURNO') {
          turnosOcupados += a.asignaciones_conductores?.length || 0
        }
      })

      // Turnos potenciales = vehículos en uso con modo TURNO * 2
      const vehiculosEnTurno = asignacionesActivasParaTurnos?.filter(a => a.horario === 'TURNO').length || 0
      const turnosPotenciales = vehiculosEnTurno * 2
      const turnosDisponibles = turnosPotenciales - turnosOcupados

      // Unidades disponibles = vehículos DISPONIBLE + vehículos TURNO con al menos 1 vacante
      const vehiculosTurnoConVacante = asignacionesActivasParaTurnos?.filter(a =>
        a.horario === 'TURNO' && (a.asignaciones_conductores?.length || 0) < 2
      ).length || 0
      const unidadesDisponibles = vehiculosDisponibles + vehiculosTurnoConVacante

      // Entregas programadas para hoy
      const hoy = new Date()
      const hoyStr = hoy.toISOString().split('T')[0]
      const { count: entregasHoy } = await supabase
        .from('asignaciones')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'programado')
        .gte('fecha_programada', `${hoyStr}T00:00:00`)
        .lt('fecha_programada', `${hoyStr}T23:59:59`)

      // Entregas programadas para los próximos 7 días
      const finSemana = new Date(hoy)
      finSemana.setDate(finSemana.getDate() + 7)
      const finSemanaStr = finSemana.toISOString().split('T')[0]
      const { count: entregasSemana } = await supabase
        .from('asignaciones')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'programado')
        .gte('fecha_programada', `${hoyStr}T00:00:00`)
        .lt('fecha_programada', `${finSemanaStr}T23:59:59`)

      // Asignaciones activas (count)
      const { count: totalAsignacionesActivas } = await supabase
        .from('asignaciones')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'activa')

      // Conductores asignados (en asignaciones activas)
      const conductoresAsignados = conductoresOcupadosIds.size

      setStatsData({
        totalVehiculos: totalVehiculos || 0,
        vehiculosDisponibles,
        vehiculosEnUso,
        vehiculosEnTaller,
        vehiculosFueraServicio,
        turnosDisponibles: Math.max(0, turnosDisponibles),
        conductoresDisponibles: Math.max(0, conductoresDisponibles),
        conductoresAsignados,
        totalConductores,
        entregasHoy: entregasHoy || 0,
        entregasSemana: entregasSemana || 0,
        asignacionesActivas: totalAsignacionesActivas || 0,
        unidadesDisponibles
      })
    } catch (err) {
      console.error('Error loading stats:', err)
    }
  }

  const loadAsignaciones = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('asignaciones')
        .select(`
          *,
          vehiculos (patente, marca, modelo),
          conductores (nombres, apellidos, numero_licencia),
          asignaciones_conductores (
            id, conductor_id, estado, horario, confirmado, fecha_confirmacion,
            conductores (nombres, apellidos, numero_licencia)
          )
        `)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      const asignacionesData = data as any[] || []
      setAsignaciones(asignacionesData)

      // Cargar vehículos sin asignación activa
      const vehiculosConAsignacionActiva = new Set(
        asignacionesData
          .filter((a: any) => a.estado === 'activa' || a.estado === 'activo')
          .map((a: any) => a.vehiculo_id)
      )

      const { data: todosVehiculos } = await supabase
        .from('vehiculos')
        .select('id, patente, marca, modelo, anio')
        .order('patente')

      const vehiculosList = todosVehiculos as any[] || []
      const sinAsignacion = vehiculosList.filter((v: any) => !vehiculosConAsignacionActiva.has(v.id))
      setVehiculosSinAsignacion(sinAsignacion)
    } catch (err: any) {
      console.error('Error loading asignaciones:', err)
      setError(err.message || 'Error al cargar las asignaciones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAsignaciones()
    loadStatsData()
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)
    }
    getCurrentUser()
  }, [])

  // Cerrar dropdown de filtro de columna al hacer click fuera
  useEffect(() => {
    const handleClickOutside = () => {
      if (openColumnFilter) {
        setOpenColumnFilter(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [openColumnFilter])

  // Filtrar por estado, modalidad, vehículo y rango de fecha de entrega
  const filteredAsignaciones = useMemo(() => {
    let result = asignaciones

    // Filtro por estado
    if (statusFilter) {
      result = result.filter(a => a.estado === statusFilter)
    }

    // Filtro por modalidad (TURNO / CARGO)
    if (modalityFilter) {
      result = result.filter(a => a.horario === modalityFilter)
    }

    // Filtro por vehículo (patente)
    if (vehicleFilter) {
      result = result.filter(a =>
        a.vehiculos?.patente?.toLowerCase().includes(vehicleFilter.toLowerCase())
      )
    }

    // Filtro por rango de fecha de entrega (fecha_programada)
    if (dateFrom) {
      const fromDate = new Date(dateFrom)
      fromDate.setHours(0, 0, 0, 0)
      result = result.filter(a => {
        if (!a.fecha_programada) return false
        const fechaEntrega = new Date(a.fecha_programada)
        return fechaEntrega >= fromDate
      })
    }

    if (dateTo) {
      const toDate = new Date(dateTo)
      toDate.setHours(23, 59, 59, 999)
      result = result.filter(a => {
        if (!a.fecha_programada) return false
        const fechaEntrega = new Date(a.fecha_programada)
        return fechaEntrega <= toDate
      })
    }

    // Ordenar: programados primero, luego por fecha_programada ascendente
    return result.sort((a, b) => {
      // Prioridad de estados: programado > activa > otros
      const estadoPrioridad: Record<string, number> = { programado: 0, activa: 1, finalizada: 2, cancelada: 3 }
      const prioA = estadoPrioridad[a.estado] ?? 99
      const prioB = estadoPrioridad[b.estado] ?? 99
      if (prioA !== prioB) return prioA - prioB
      // Luego por fecha_programada ascendente (más próximas primero)
      const fechaA = a.fecha_programada ? new Date(a.fecha_programada).getTime() : Infinity
      const fechaB = b.fecha_programada ? new Date(b.fecha_programada).getTime() : Infinity
      return fechaA - fechaB
    })
  }, [asignaciones, statusFilter, modalityFilter, vehicleFilter, dateFrom, dateTo])

  // Procesar asignaciones - UNA fila por asignación
  const expandedAsignaciones = useMemo<ExpandedAsignacion[]>(() => {
    // Primero: vehículos sin asignación (solo si no hay filtros de estado activos)
    const vehiculosSinAsignarRows: ExpandedAsignacion[] = (!statusFilter || statusFilter === 'sin_asignar')
      ? vehiculosSinAsignacion
          .filter(v => !vehicleFilter || v.patente.toLowerCase().includes(vehicleFilter.toLowerCase()))
          .map(v => ({
            id: `sin-asignar-${v.id}`,
            codigo: '-',
            vehiculo_id: v.id,
            conductor_id: '',
            fecha_inicio: '',
            fecha_fin: null,
            modalidad: '',
            horario: '',
            estado: 'sin_asignar',
            notas: null,
            created_at: '',
            vehiculos: {
              patente: v.patente,
              marca: v.marca,
              modelo: v.modelo
            },
            conductoresTurno: null,
            conductorCargo: null
          }))
      : []

    // Luego: asignaciones activas con vacantes (TURNO con menos de 2 conductores)
    const asignacionesConVacante = filteredAsignaciones
      .filter(a => (a.estado === 'activa' || a.estado === 'activo') && a.horario === 'TURNO')
      .filter(a => (a.asignaciones_conductores?.length || 0) < 2)

    // Resto de asignaciones filtradas
    const asignacionesProcesadas = filteredAsignaciones.map((asignacion): ExpandedAsignacion => {
      const conductores = asignacion.asignaciones_conductores || []

      // Para modalidad TURNO: extraer conductor diurno y nocturno
      if (asignacion.horario === 'TURNO') {
        const diurno = conductores.find(ac => ac.horario === 'diurno')
        const nocturno = conductores.find(ac => ac.horario === 'nocturno')

        return {
          ...asignacion,
          conductoresTurno: {
            diurno: diurno ? {
              id: diurno.id,
              nombre: `${diurno.conductores.nombres} ${diurno.conductores.apellidos}`,
              confirmado: diurno.confirmado || false
            } : null,
            nocturno: nocturno ? {
              id: nocturno.id,
              nombre: `${nocturno.conductores.nombres} ${nocturno.conductores.apellidos}`,
              confirmado: nocturno.confirmado || false
            } : null
          },
          conductorCargo: null
        }
      }

      // Para modalidad A CARGO: solo un conductor
      const primerConductor = conductores[0]
      return {
        ...asignacion,
        conductoresTurno: null,
        conductorCargo: primerConductor ? {
          id: primerConductor.id,
          nombre: `${primerConductor.conductores.nombres} ${primerConductor.conductores.apellidos}`,
          confirmado: primerConductor.confirmado || false
        } : null
      }
    })

    // Ordenar: sin asignar primero, luego vacantes, luego el resto
    const vacantesIds = new Set(asignacionesConVacante.map(a => a.id))
    const ordenado = asignacionesProcesadas.sort((a, b) => {
      const aEsVacante = vacantesIds.has(a.id) ? 0 : 1
      const bEsVacante = vacantesIds.has(b.id) ? 0 : 1
      return aEsVacante - bEsVacante
    })

    // Si filtro es 'sin_asignar', solo mostrar vehículos sin asignación
    if (statusFilter === 'sin_asignar') {
      return vehiculosSinAsignarRows
    }

    return [...vehiculosSinAsignarRows, ...ordenado]
  }, [filteredAsignaciones, vehiculosSinAsignacion, statusFilter, vehicleFilter])

  // Estadísticas para los stat cards (solo programadas del listado actual)
  const programadasCount = useMemo(() => {
    return asignaciones.filter(a => a.estado === 'programado').length
  }, [asignaciones])

  const handleDelete = async (id: string) => {
    if (isSubmitting || !canDelete) return

    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: 'Esta acción no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#E63946',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (result.isConfirmed) {
      setIsSubmitting(true)
      try {
        const asignacion = asignaciones.find(a => a.id === id)

        const { data: conductoresAsignados } = await supabase
          .from('asignaciones_conductores')
          .select('id')
          .eq('asignacion_id', id)

        if (conductoresAsignados && conductoresAsignados.length > 0) {
          const conductorIds = conductoresAsignados.map((c: any) => c.id)
          await supabase.from('vehiculos_turnos_ocupados').delete().in('asignacion_conductor_id', conductorIds)
        }

        await supabase.from('asignaciones_conductores').delete().eq('asignacion_id', id)
        const { error: asignacionError } = await supabase.from('asignaciones').delete().eq('id', id)
        if (asignacionError) throw asignacionError

        if (asignacion?.vehiculo_id) {
          const { data: estadoDisponible } = await supabase
            .from('vehiculos_estados')
            .select('id')
            .eq('codigo', 'DISPONIBLE')
            .single() as { data: { id: string } | null }

          if (estadoDisponible) {
            await (supabase as any).from('vehiculos').update({ estado_id: estadoDisponible.id }).eq('id', asignacion.vehiculo_id)
          }
        }

        Swal.fire('Eliminado', 'La asignación ha sido eliminada', 'success')
        loadAsignaciones()
        loadStatsData()
      } catch (err: any) {
        Swal.fire('Error', err.message || 'Error al eliminar la asignación', 'error')
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const handleConfirmProgramacion = async () => {
    if (isSubmitting || !selectedAsignacion || conductoresToConfirm.length === 0) return

    setIsSubmitting(true)
    try {
      const ahora = new Date().toISOString()
      const fechaProgramada = selectedAsignacion.fecha_programada
        ? new Date(selectedAsignacion.fecha_programada).toISOString().split('T')[0]
        : null

      await (supabase as any)
        .from('asignaciones_conductores')
        .update({ confirmado: true, fecha_confirmacion: ahora, fecha_inicio: ahora })
        .in('id', conductoresToConfirm)

      const { data: allConductores } = await supabase
        .from('asignaciones_conductores')
        .select('id, conductor_id, confirmado, horario')
        .eq('asignacion_id', selectedAsignacion.id)

      const todosConfirmados = (allConductores as any)?.every((c: any) => c.confirmado === true)

      if (todosConfirmados) {
        const conductoresIds = (allConductores as any)?.map((c: any) => c.conductor_id) || []

        const { data: asignacionesACerrar } = await supabase
          .from('asignaciones')
          .select('id, vehiculo_id')
          .eq('vehiculo_id', selectedAsignacion.vehiculo_id)
          .eq('estado', 'activa')
          .neq('id', selectedAsignacion.id)

        if (asignacionesACerrar && asignacionesACerrar.length > 0) {
          await supabase.from('asignaciones')
            // @ts-ignore
            .update({ estado: 'finalizada', fecha_fin: ahora, notas: '[AUTO-CERRADA]' })
            .in('id', asignacionesACerrar.map((a: any) => a.id))
        }

        if (conductoresIds.length > 0) {
          for (const conductorId of conductoresIds) {
            await (supabase as any)
              .from('asignaciones_conductores')
              .update({ estado: 'cancelado', fecha_fin: ahora })
              .eq('conductor_id', conductorId)
              .eq('estado', 'asignado')
              .neq('asignacion_id', selectedAsignacion.id)
          }
        }

        await (supabase as any)
          .from('asignaciones')
          .update({ estado: 'activa', fecha_inicio: ahora, notas: confirmComentarios || selectedAsignacion.notas })
          .eq('id', selectedAsignacion.id)

        // Actualizar estado del vehículo a EN_USO
        const { data: estadoEnUso } = await supabase
          .from('vehiculos_estados')
          .select('id')
          .eq('codigo', 'EN_USO')
          .single()

        if (estadoEnUso && selectedAsignacion.vehiculo_id) {
          await (supabase
            .from('vehiculos') as any)
            .update({ estado_id: (estadoEnUso as any).id })
            .eq('id', selectedAsignacion.vehiculo_id)
        }

        if (fechaProgramada) {
          await supabase.from('vehiculos_turnos_ocupados').delete()
            .eq('vehiculo_id', selectedAsignacion.vehiculo_id)
            .eq('fecha', fechaProgramada)

          const turnosData = (allConductores as any)?.map((ac: any) => ({
            vehiculo_id: selectedAsignacion.vehiculo_id,
            fecha: fechaProgramada,
            horario: ac.horario,
            asignacion_conductor_id: ac.id,
            estado: 'activo'
          })) || []

          if (turnosData.length > 0) {
            await supabase.from('vehiculos_turnos_ocupados').insert(turnosData)
          }
        }

        Swal.fire('Confirmado', 'Todos los conductores han confirmado. La asignación está ACTIVA.', 'success')
      } else {
        const pendientes = (allConductores as any)?.filter((c: any) => !c.confirmado).length || 0
        Swal.fire('Confirmación Parcial', `${conductoresToConfirm.length} confirmado(s). Faltan ${pendientes}.`, 'info')
      }

      setShowConfirmModal(false)
      setConfirmComentarios('')
      setConductoresToConfirm([])
      setSelectedAsignacion(null)
      loadAsignaciones()
      loadStatsData()
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al confirmar', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancelProgramacion = async () => {
    if (isSubmitting || !selectedAsignacion || !cancelMotivo.trim()) return

    setIsSubmitting(true)
    try {
      await (supabase as any)
        .from('asignaciones_conductores')
        .update({ confirmado: false, fecha_confirmacion: null })
        .eq('asignacion_id', selectedAsignacion.id)

      await (supabase as any)
        .from('asignaciones')
        .update({ estado: 'cancelada', notas: `${selectedAsignacion.notas || ''}\n\n[CANCELADA] Motivo: ${cancelMotivo}` })
        .eq('id', selectedAsignacion.id)

      const { data: estadoDisponible } = await supabase
        .from('vehiculos_estados')
        .select('id')
        .eq('codigo', 'DISPONIBLE')
        .single() as { data: { id: string } | null }

      if (estadoDisponible) {
        await (supabase as any).from('vehiculos').update({ estado_id: estadoDisponible.id }).eq('id', selectedAsignacion.vehiculo_id)
      }

      Swal.fire('Cancelada', 'La programación ha sido cancelada', 'success')
      setShowCancelModal(false)
      setCancelMotivo('')
      setSelectedAsignacion(null)
      loadAsignaciones()
      loadStatsData()
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al cancelar', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUnconfirmConductor = async (conductorAsignacionId: string) => {
    try {
      await (supabase as any)
        .from('asignaciones_conductores')
        .update({ confirmado: false, fecha_confirmacion: null })
        .eq('id', conductorAsignacionId)

      Swal.fire('Actualizado', 'El conductor ha sido desconfirmado.', 'success')
      loadAsignaciones()
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al desconfirmar', 'error')
    }
  }

  const getStatusBadgeClass = (status: string) => {
    const classes: Record<string, string> = {
      programado: 'dt-badge dt-badge-yellow',
      activa: 'dt-badge dt-badge-green',
      finalizada: 'dt-badge dt-badge-blue',
      cancelada: 'dt-badge dt-badge-red',
      sin_asignar: 'dt-badge dt-badge-orange'
    }
    return classes[status] || 'dt-badge dt-badge-gray'
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      programado: 'Programado',
      activa: 'Activa',
      finalizada: 'Finalizada',
      cancelada: 'Cancelada',
      sin_asignar: 'Sin Asignar'
    }
    return labels[status] || status
  }

  const getHorarioBadgeClass = (horario: string) => {
    return horario === 'CARGO' ? 'dt-badge asig-badge-cargo' : 'dt-badge asig-badge-turno'
  }

  // Columnas para DataTable
  const columns = useMemo<ColumnDef<ExpandedAsignacion, any>[]>(() => [
    {
      accessorKey: 'codigo',
      header: 'Número',
      cell: ({ row }) => <strong>{row.original.codigo || 'N/A'}</strong>
    },
    {
      accessorFn: (row) => row.vehiculos?.patente || '',
      id: 'vehiculo',
      header: () => (
        <div className="asig-column-filter">
          <span>Vehículo</span>
          <button
            className={`asig-column-filter-btn ${vehicleFilter ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setOpenColumnFilter(openColumnFilter === 'vehiculo' ? null : 'vehiculo')
            }}
            title="Filtrar por vehículo"
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'vehiculo' && (
            <div className="asig-column-filter-dropdown" style={{ minWidth: '180px' }}>
              <input
                type="text"
                placeholder="Buscar patente..."
                value={vehicleFilter}
                onChange={(e) => setVehicleFilter(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="asig-column-filter-input"
                autoFocus
              />
              {vehicleFilter && (
                <button
                  className="asig-column-filter-option"
                  onClick={(e) => {
                    e.stopPropagation()
                    setVehicleFilter('')
                  }}
                  style={{ marginTop: '4px', color: 'var(--color-danger)' }}
                >
                  Limpiar
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <div className="asig-vehiculo-cell">
          <span className="asig-vehiculo-patente">{row.original.vehiculos?.patente || 'N/A'}</span>
          <span className="asig-vehiculo-info">
            {row.original.vehiculos?.marca} {row.original.vehiculos?.modelo}
          </span>
        </div>
      )
    },
    {
      accessorKey: 'horario',
      header: () => (
        <div className="asig-column-filter">
          <span>Modalidad</span>
          <button
            className={`asig-column-filter-btn ${modalityFilter ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setOpenColumnFilter(openColumnFilter === 'modalidad' ? null : 'modalidad')
            }}
            title="Filtrar por modalidad"
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'modalidad' && (
            <div className="asig-column-filter-dropdown">
              <button
                className={`asig-column-filter-option ${modalityFilter === '' ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setModalityFilter('')
                  setOpenColumnFilter(null)
                }}
              >
                Todas
              </button>
              <button
                className={`asig-column-filter-option ${modalityFilter === 'TURNO' ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setModalityFilter('TURNO')
                  setOpenColumnFilter(null)
                }}
              >
                Turno
              </button>
              <button
                className={`asig-column-filter-option ${modalityFilter === 'CARGO' ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setModalityFilter('CARGO')
                  setOpenColumnFilter(null)
                }}
              >
                A Cargo
              </button>
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <span className={getHorarioBadgeClass(row.original.horario)}>
          {row.original.horario === 'CARGO' ? 'A CARGO' : 'TURNO'}
        </span>
      )
    },
    {
      id: 'asignados',
      header: 'Asignados',
      accessorFn: (row) => {
        if (row.horario === 'CARGO' || !row.horario) {
          return row.conductorCargo?.nombre || ''
        }
        const d = row.conductoresTurno?.diurno?.nombre || ''
        const n = row.conductoresTurno?.nocturno?.nombre || ''
        return `${d} ${n}`.trim()
      },
      cell: ({ row }) => {
        const { conductoresTurno, conductorCargo, horario } = row.original

        // Si es A CARGO, mostrar solo el conductor
        if (horario === 'CARGO' || !horario) {
          if (conductorCargo) {
            return <span className="asig-conductor-compacto">{conductorCargo.nombre}</span>
          }
          return <span className="asig-sin-conductor">Sin asignar</span>
        }

        // Si es TURNO, mostrar ambos conductores compacto
        const diurno = conductoresTurno?.diurno
        const nocturno = conductoresTurno?.nocturno

        return (
          <div className="asig-conductores-compact">
            <span className={diurno ? 'asig-conductor-turno asig-turno-diurno' : 'asig-turno-vacante asig-turno-diurno'}>
              <span className="asig-turno-label asig-label-diurno">D</span>
              {diurno ? diurno.nombre.split(' ').slice(0, 2).join(' ') : 'Vacante'}
            </span>
            <span className={nocturno ? 'asig-conductor-turno asig-turno-nocturno' : 'asig-turno-vacante asig-turno-nocturno'}>
              <span className="asig-turno-label asig-label-nocturno">N</span>
              {nocturno ? nocturno.nombre.split(' ').slice(0, 2).join(' ') : 'Vacante'}
            </span>
          </div>
        )
      }
    },
    {
      accessorKey: 'fecha_programada',
      header: () => (
        <div className="asig-column-filter">
          <span>Fecha Entrega</span>
          <button
            className={`asig-column-filter-btn ${dateFrom || dateTo ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setOpenColumnFilter(openColumnFilter === 'fecha' ? null : 'fecha')
            }}
            title="Filtrar por fecha"
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'fecha' && (
            <div className="asig-column-filter-dropdown" style={{ minWidth: '200px' }}>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Desde</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="asig-column-filter-input"
                />
              </div>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Hasta</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="asig-column-filter-input"
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  className="asig-column-filter-option"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDateFrom('')
                    setDateTo('')
                  }}
                  style={{ color: 'var(--color-danger)' }}
                >
                  Limpiar
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <span>
          {row.original.fecha_programada
            ? new Date(row.original.fecha_programada).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })
            : 'No definida'}
        </span>
      )
    },
    {
      id: 'hora_entrega',
      header: 'Hora',
      cell: ({ row }) => (
        <span>
          {row.original.fecha_programada
            ? new Date(row.original.fecha_programada).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
            : '-'}
        </span>
      )
    },
    {
      accessorKey: 'fecha_fin',
      header: 'Fecha Fin',
      cell: ({ row }) => (
        <span>
          {row.original.fecha_fin
            ? new Date(row.original.fecha_fin).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })
            : 'Sin definir'}
        </span>
      )
    },
    {
      accessorKey: 'estado',
      header: () => (
        <div className="asig-column-filter">
          <span>Estado</span>
          <button
            className={`asig-column-filter-btn ${statusFilter ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setOpenColumnFilter(openColumnFilter === 'estado' ? null : 'estado')
            }}
            title="Filtrar por estado"
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'estado' && (
            <div className="asig-column-filter-dropdown">
              <button
                className={`asig-column-filter-option ${statusFilter === '' ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setStatusFilter('')
                  setOpenColumnFilter(null)
                }}
              >
                Todos
              </button>
              <button
                className={`asig-column-filter-option ${statusFilter === 'sin_asignar' ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setStatusFilter('sin_asignar')
                  setOpenColumnFilter(null)
                }}
              >
                Sin Asignar
              </button>
              <button
                className={`asig-column-filter-option ${statusFilter === 'programado' ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setStatusFilter('programado')
                  setOpenColumnFilter(null)
                }}
              >
                Programado
              </button>
              <button
                className={`asig-column-filter-option ${statusFilter === 'activa' ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setStatusFilter('activa')
                  setOpenColumnFilter(null)
                }}
              >
                Activa
              </button>
              <button
                className={`asig-column-filter-option ${statusFilter === 'finalizada' ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setStatusFilter('finalizada')
                  setOpenColumnFilter(null)
                }}
              >
                Histórico
              </button>
              <button
                className={`asig-column-filter-option ${statusFilter === 'cancelada' ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setStatusFilter('cancelada')
                  setOpenColumnFilter(null)
                }}
              >
                Cancelada
              </button>
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <span className={getStatusBadgeClass(row.original.estado)}>
          {getStatusLabel(row.original.estado)}
        </span>
      )
    },
    {
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="dt-actions">
          {row.original.estado === 'programado' && (
            <>
              <button
                onClick={() => {
                  setSelectedAsignacion(row.original)
                  setShowConfirmModal(true)
                }}
                className="dt-btn-action asig-btn-confirm"
                title="Confirmar programación"
                disabled={!canEdit}
              >
                <CheckCircle size={16} />
              </button>
              <button
                onClick={() => {
                  setSelectedAsignacion(row.original)
                  setShowCancelModal(true)
                }}
                className="dt-btn-action asig-btn-cancel-prog"
                title="Cancelar programación"
                disabled={!canEdit}
              >
                <XCircle size={16} />
              </button>
            </>
          )}
          <button
            className="dt-btn-action dt-btn-view"
            title="Ver detalles"
            onClick={() => {
              setViewAsignacion(row.original)
              setShowViewModal(true)
            }}
          >
            <Eye size={16} />
          </button>
          <button
            onClick={() => handleDelete(row.original.id)}
            className="dt-btn-action dt-btn-delete"
            title="Eliminar"
            disabled={!canDelete}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )
    }
  ], [canEdit, canDelete, currentUserId, statusFilter, modalityFilter, vehicleFilter, dateFrom, dateTo, openColumnFilter])

  return (
    <div className="asig-module">
      {/* Stats Cards - Estilo Bitácora */}
      <div className="asig-stats">
        <div className="asig-stats-grid">
          <div className="stat-card" title="Asignaciones en estado programado pendientes de confirmación">
            <Calendar size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{programadasCount}</span>
              <span className="stat-label">Programadas</span>
            </div>
          </div>
          <div className="stat-card" title="Asignaciones actualmente en curso">
            <Activity size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.asignacionesActivas}</span>
              <span className="stat-label">Activas</span>
            </div>
          </div>
          <div className="stat-card" title="Entregas de vehículos programadas para hoy">
            <Calendar size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.entregasHoy}</span>
              <span className="stat-label">Entregas Hoy</span>
            </div>
          </div>
          <div className="stat-card" title="Entregas de vehículos programadas para los próximos 7 días">
            <CalendarRange size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.entregasSemana}</span>
              <span className="stat-label">Entregas Semana</span>
            </div>
          </div>
          <div className="stat-card" title="Vehículos sin asignar + vehículos TURNO con al menos 1 turno vacante">
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.unidadesDisponibles}</span>
              <span className="stat-label">Unidades Disp.</span>
            </div>
          </div>
        </div>
      </div>

      {/* DataTable with integrated action button */}
      <DataTable
        data={expandedAsignaciones}
        columns={columns}
        loading={loading}
        error={error}
        searchPlaceholder="Buscar por vehículo, conductor o número..."
        emptyIcon={<FileText size={48} />}
        emptyTitle="No hay asignaciones"
        emptyDescription="Crea la primera asignación usando el botón 'Nueva Asignación'"
        pageSize={20}
        pageSizeOptions={[10, 20, 50, 100]}
        headerAction={
          <button
            className="btn-primary"
            onClick={() => setShowWizard(true)}
            disabled={!canCreate}
            title={!canCreate ? 'No tienes permisos para crear asignaciones' : 'Nueva Asignación'}
          >
            <Plus size={18} />
            Nueva Asignación
          </button>
        }
      />

      {/* Wizard Modal */}
      {showWizard && (
        <AssignmentWizard
          onClose={() => setShowWizard(false)}
          onSuccess={() => {
            loadAsignaciones()
            loadStatsData()
            setShowWizard(false)
          }}
        />
      )}

      {/* Modal de Confirmación */}
      {showConfirmModal && selectedAsignacion && (
        <div className="asig-modal-overlay">
          <div className="asig-modal-content">
            <h2 className="asig-modal-title">Confirmar Programación</h2>
            <p>Vehículo: <strong>{selectedAsignacion.vehiculos?.patente}</strong></p>
            <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '16px' }}>
              Fecha de entrega: <strong>{selectedAsignacion.fecha_programada ? new Date(selectedAsignacion.fecha_programada).toLocaleDateString('es-AR') : 'N/A'}</strong>
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '12px', fontWeight: 600, fontSize: '14px' }}>
                Selecciona los conductores que confirman:
              </label>
              {selectedAsignacion.asignaciones_conductores?.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {selectedAsignacion.asignaciones_conductores.map((ac) => (
                    <label key={ac.id} className={`asig-confirm-conductor ${ac.confirmado ? 'confirmed' : 'pending'}`}>
                      <input
                        type="checkbox"
                        checked={ac.confirmado || conductoresToConfirm.includes(ac.id)}
                        disabled={ac.confirmado}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConductoresToConfirm([...conductoresToConfirm, ac.id])
                          } else {
                            setConductoresToConfirm(conductoresToConfirm.filter(id => id !== ac.id))
                          }
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <p className="asig-conductor-name">
                          {ac.conductores.nombres} {ac.conductores.apellidos}
                        </p>
                        <p className="asig-conductor-details">
                          {ac.horario !== 'todo_dia' && `Turno: ${ac.horario}`}
                          {ac.confirmado && (
                            <span className="asig-conductor-confirmed">
                              <CheckCircle size={14} /> Ya confirmado
                            </span>
                          )}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#9CA3AF', fontSize: '14px' }}>No hay conductores asignados</p>
              )}
            </div>

            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>
              Comentarios (opcional):
            </label>
            <textarea
              value={confirmComentarios}
              onChange={(e) => setConfirmComentarios(e.target.value)}
              rows={4}
              placeholder="Agrega comentarios sobre la confirmación..."
              className="asig-modal-textarea"
              style={{ marginBottom: '20px' }}
            />

            <div className="asig-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowConfirmModal(false)
                  setConfirmComentarios('')
                  setConductoresToConfirm([])
                  setSelectedAsignacion(null)
                }}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleConfirmProgramacion}
                disabled={conductoresToConfirm.length === 0 || isSubmitting}
                style={{ background: conductoresToConfirm.length > 0 && !isSubmitting ? '#10B981' : '#D1D5DB' }}
              >
                {isSubmitting ? 'Procesando...' : 'Confirmar Seleccionados'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cancelación */}
      {showCancelModal && selectedAsignacion && (
        <div className="asig-modal-overlay">
          <div className="asig-modal-content">
            <h2 className="asig-modal-title">Cancelar Programación</h2>
            <p>¿Estás seguro de cancelar la programación del vehículo <strong>{selectedAsignacion.vehiculos?.patente}</strong>?</p>

            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px', color: '#DC2626' }}>
              Motivo de cancelación (requerido):
            </label>
            <textarea
              value={cancelMotivo}
              onChange={(e) => setCancelMotivo(e.target.value)}
              rows={4}
              placeholder="Ingresa el motivo de la cancelación..."
              className="asig-modal-textarea cancel"
              style={{ marginBottom: '20px' }}
            />

            <div className="asig-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowCancelModal(false)
                  setCancelMotivo('')
                  setSelectedAsignacion(null)
                }}
              >
                Volver
              </button>
              <button
                className="btn-primary"
                onClick={handleCancelProgramacion}
                disabled={!cancelMotivo.trim() || isSubmitting}
                style={{ background: cancelMotivo.trim() && !isSubmitting ? '#DC2626' : '#D1D5DB' }}
              >
                {isSubmitting ? 'Procesando...' : 'Cancelar Programación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Visualización */}
      {showViewModal && viewAsignacion && (
        <div className="asig-modal-overlay">
          <div className="asig-modal-content wide">
            <h2 className="asig-modal-title">Detalles de Asignación</h2>

            <div className="asig-detail-grid">
              <div>
                <label className="asig-detail-label">Número de Asignación</label>
                <p className="asig-detail-value code">{viewAsignacion.codigo}</p>
              </div>

              <div>
                <label className="asig-detail-label">Vehículo</label>
                <p className="asig-detail-value">
                  <strong>{viewAsignacion.vehiculos?.patente}</strong> - {viewAsignacion.vehiculos?.marca} {viewAsignacion.vehiculos?.modelo}
                </p>
              </div>

              <div>
                <label className="asig-detail-label">Conductores Asignados</label>
                {viewAsignacion.asignaciones_conductores?.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {viewAsignacion.asignaciones_conductores.map((ac) => (
                      <div key={ac.id} className="asig-conductor-card">
                        <p className="asig-conductor-card-name">
                          {ac.conductores.nombres} {ac.conductores.apellidos}
                        </p>
                        <p className="asig-conductor-card-info">Licencia: {ac.conductores.numero_licencia}</p>
                        {ac.horario !== 'todo_dia' && (
                          <p className="asig-conductor-card-info">Turno: <strong>{ac.horario}</strong></p>
                        )}
                        <p className="asig-conductor-status">
                          {ac.confirmado ? (
                            <>
                              <span className="asig-conductor-confirmed">
                                <CheckCircle size={14} /> Confirmado
                              </span>
                              {canEdit && viewAsignacion.estado === 'programado' && (
                                <button
                                  className="asig-btn-unconfirm"
                                  onClick={() => {
                                    Swal.fire({
                                      title: '¿Desconfirmar conductor?',
                                      icon: 'warning',
                                      showCancelButton: true,
                                      confirmButtonColor: '#E63946',
                                      confirmButtonText: 'Sí, desconfirmar'
                                    }).then((result) => {
                                      if (result.isConfirmed) {
                                        handleUnconfirmConductor(ac.id)
                                        setShowViewModal(false)
                                        setViewAsignacion(null)
                                      }
                                    })
                                  }}
                                >
                                  Desconfirmar
                                </button>
                              )}
                            </>
                          ) : (
                            <span style={{ color: '#F59E0B', fontWeight: 600 }}>Pendiente</span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#9CA3AF', fontSize: '14px' }}>Sin conductores asignados</p>
                )}
              </div>

              <div className="asig-detail-row">
                <div>
                  <label className="asig-detail-label">Horario</label>
                  <span className={getHorarioBadgeClass(viewAsignacion.horario)}>
                    {viewAsignacion.horario === 'CARGO' ? 'A CARGO' : 'TURNO'}
                  </span>
                </div>
                <div>
                  <label className="asig-detail-label">Estado</label>
                  <span className={getStatusBadgeClass(viewAsignacion.estado)}>
                    {viewAsignacion.estado}
                  </span>
                </div>
              </div>

              <div className="asig-detail-row four">
                <div>
                  <label className="asig-detail-label">Fecha Creación</label>
                  <p className="asig-detail-value" style={{ fontSize: '14px' }}>
                    {new Date(viewAsignacion.created_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div>
                  <label className="asig-detail-label">Fecha Entrega</label>
                  <p className="asig-detail-value" style={{ fontSize: '14px' }}>
                    {viewAsignacion.fecha_programada ? new Date(viewAsignacion.fecha_programada).toLocaleDateString('es-ES') : 'No definida'}
                  </p>
                </div>
                <div>
                  <label className="asig-detail-label">Fecha Activación</label>
                  <p className="asig-detail-value" style={{ fontSize: '14px' }}>
                    {viewAsignacion.fecha_inicio ? new Date(viewAsignacion.fecha_inicio).toLocaleDateString('es-ES') : 'No activada'}
                  </p>
                </div>
                <div>
                  <label className="asig-detail-label">Fecha Fin</label>
                  <p className="asig-detail-value" style={{ fontSize: '14px' }}>
                    {viewAsignacion.fecha_fin ? new Date(viewAsignacion.fecha_fin).toLocaleDateString('es-ES') : 'Sin definir'}
                  </p>
                </div>
              </div>

              {viewAsignacion.notas && (
                <div>
                  <label className="asig-detail-label">Notas</label>
                  <p className="asig-notes-box">{viewAsignacion.notas}</p>
                </div>
              )}
            </div>

            <div className="asig-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowViewModal(false)
                  setViewAsignacion(null)
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
