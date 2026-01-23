// src/components/AssignmentWizard.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { X, Calendar, User, ChevronRight, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { TimeInput24h } from './ui/TimeInput24h'
import Swal from 'sweetalert2'

interface Vehicle {
  id: string
  patente: string
  marca: string
  modelo: string
  anio: number
  estado_id: string
  vehiculos_estados?: {
    codigo: string
    descripcion: string
  }
  // Información de disponibilidad
  asignacionActiva?: {
    id: string
    horario: 'TURNO' | 'CARGO'
    turnoDiurnoOcupado: boolean
    turnoNocturnoOcupado: boolean
  }
  disponibilidad: 'disponible' | 'turno_diurno_libre' | 'turno_nocturno_libre' | 'ocupado'
}

interface Conductor {
  id: string
  numero_licencia: string
  numero_dni: string
  nombres: string
  apellidos: string
  licencia_vencimiento: string
  estado_id: string
  preferencia_turno?: string
  conductores_estados?: {
    codigo: string
    descripcion: string
  }
  tieneAsignacionActiva?: boolean
  tieneAsignacionProgramada?: boolean
  tieneAsignacionDiurna?: boolean
  tieneAsignacionNocturna?: boolean
}

// Helper para formatear preferencia de turno
const formatPreferencia = (preferencia?: string): string => {
  switch (preferencia) {
    case 'DIURNO': return 'Diurno'
    case 'NOCTURNO': return 'Nocturno'
    case 'A_CARGO': return 'A Cargo'
    case 'SIN_PREFERENCIA': return 'Ambos'
    default: return 'Ambos'
  }
}

// Helper para obtener color de badge según preferencia
const getPreferenciaBadge = (preferencia?: string): { bg: string; color: string } => {
  switch (preferencia) {
    case 'DIURNO': return { bg: '#FEF3C7', color: '#92400E' }
    case 'NOCTURNO': return { bg: '#DBEAFE', color: '#1E40AF' }
    case 'A_CARGO': return { bg: '#D1FAE5', color: '#065F46' }
    default: return { bg: '#F3F4F6', color: '#6B7280' }
  }
}

interface AssignmentData {
  modalidad: 'dia_completo' | 'medio_dia' | 'por_horas' | 'semanal' | 'mensual' | ''
  horario: 'TURNO' | 'CARGO' | ''  // TURNO = modo con pares de conductores
  vehiculo_id: string
  conductores_ids: string[]
  conductor_diurno_id: string  // Para modo Turno
  conductor_nocturno_id: string  // Para modo Turno
  fecha_programada: string  // Fecha cuando se entregará el vehículo
  hora_programada: string   // Hora cuando se entregará el vehículo
  // Distancia compartida para todos
  distancia: string
  // Datos para conductor diurno
  documento_diurno: 'CARTA_OFERTA' | 'ANEXO' | 'N/A' | ''
  ubicacion_diurno: string
  // Datos para conductor nocturno
  documento_nocturno: 'CARTA_OFERTA' | 'ANEXO' | 'N/A' | ''
  ubicacion_nocturno: string
  // Datos para conductor A CARGO
  documento_cargo: 'CARTA_OFERTA' | 'ANEXO' | 'N/A' | ''
  ubicacion_cargo: string
  notas: string
}

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export function AssignmentWizard({ onClose, onSuccess }: Props) {
  const { profile } = useAuth()
  const [step, setStep] = useState(1)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [conductores, setConductores] = useState<Conductor[]>([])
  const [loading, setLoading] = useState(false)
  const [vehicleSearch, setVehicleSearch] = useState('')
  const [vehicleAvailabilityFilter, setVehicleAvailabilityFilter] = useState<string>('')
  const [conductorSearch, setConductorSearch] = useState('')
  const [conductorStatusFilter, setConductorStatusFilter] = useState<string>('')
  const [conductorTurnoFilter, setConductorTurnoFilter] = useState<string>('')

  const [formData, setFormData] = useState<AssignmentData>({
    modalidad: '',
    horario: '',
    vehiculo_id: '',
    conductores_ids: [],
    conductor_diurno_id: '',
    conductor_nocturno_id: '',
    fecha_programada: new Date().toISOString().split('T')[0],
    hora_programada: '09:00',
    distancia: '',
    documento_diurno: '',
    ubicacion_diurno: '',
    documento_nocturno: '',
    ubicacion_nocturno: '',
    documento_cargo: '',
    ubicacion_cargo: '',
    notas: ''
  })

  // Cargar vehículos con información de disponibilidad
  useEffect(() => {
    const loadVehicles = async () => {
      try {
        // 1. Obtener todos los vehículos (excepto reparación/mantenimiento)
        const { data: vehiculosData, error: vehiculosError } = await supabase
          .from('vehiculos')
          .select(`
            id,
            patente,
            marca,
            modelo,
            anio,
            estado_id,
            vehiculos_estados (
              codigo,
              descripcion
            )
          `)
          .order('patente')

        if (vehiculosError) throw vehiculosError

        // 2. Obtener asignaciones activas y programadas con sus conductores
        const { data: asignacionesData, error: asignacionesError } = await supabase
          .from('asignaciones')
          .select(`
            id,
            vehiculo_id,
            horario,
            estado,
            asignaciones_conductores (
              horario
            )
          `)
          .in('estado', ['activa', 'programado'])

        if (asignacionesError) throw asignacionesError

        // 3. Filtrar vehículos que estén disponibles (PKG_ON_BASE o EN_USO)
        const estadosDisponibles = ['PKG_ON_BASE', 'EN_USO']
        const vehiculosFiltrados = (vehiculosData || []).filter((v: any) =>
          estadosDisponibles.includes(v.vehiculos_estados?.codigo)
        )

        // 4. Calcular disponibilidad de cada vehículo
        const vehiculosConDisponibilidad: Vehicle[] = vehiculosFiltrados.map((vehiculo: any) => {
          // Buscar asignación activa del vehículo
          const asignacionActiva = asignacionesData?.find(
            (a: any) => a.vehiculo_id === vehiculo.id && a.estado === 'activa'
          ) as any

          // Buscar asignación programada del vehículo
          const asignacionProgramada = asignacionesData?.find(
            (a: any) => a.vehiculo_id === vehiculo.id && a.estado === 'programado'
          )

          // Si tiene asignación programada, no mostrar (será filtrado después)
          if (asignacionProgramada) {
            return {
              ...vehiculo,
              disponibilidad: 'programado' as const,
              asignacionActiva: undefined
            }
          }

          // Si no tiene asignación activa, está disponible
          if (!asignacionActiva) {
            return {
              ...vehiculo,
              disponibilidad: 'disponible' as const,
              asignacionActiva: undefined
            }
          }

          // Si está A CARGO, está ocupado
          if (asignacionActiva.horario === 'CARGO') {
            return {
              ...vehiculo,
              disponibilidad: 'ocupado' as const,
              asignacionActiva: {
                id: asignacionActiva.id,
                horario: 'CARGO' as const,
                turnoDiurnoOcupado: true,
                turnoNocturnoOcupado: true
              }
            }
          }

          // Si está en TURNO, verificar qué turnos están ocupados
          const conductoresAsignados = asignacionActiva.asignaciones_conductores || []
          const turnoDiurnoOcupado = conductoresAsignados.some((c: any) => c.horario === 'diurno')
          const turnoNocturnoOcupado = conductoresAsignados.some((c: any) => c.horario === 'nocturno')

          let disponibilidad: Vehicle['disponibilidad'] = 'ocupado'
          if (!turnoDiurnoOcupado && !turnoNocturnoOcupado) {
            disponibilidad = 'disponible'
          } else if (!turnoDiurnoOcupado) {
            disponibilidad = 'turno_diurno_libre'
          } else if (!turnoNocturnoOcupado) {
            disponibilidad = 'turno_nocturno_libre'
          }

          return {
            ...vehiculo,
            disponibilidad,
            asignacionActiva: {
              id: asignacionActiva.id,
              horario: 'TURNO' as const,
              turnoDiurnoOcupado,
              turnoNocturnoOcupado
            }
          }
        })

        // 5. Excluir vehículos con asignaciones programadas
        const vehiculosFinales = vehiculosConDisponibilidad.filter(
          (v: any) => v.disponibilidad !== 'programado'
        )

        setVehicles(vehiculosFinales)
      } catch (error) {
        console.error('Error loading vehicles:', error)
      }
    }

    loadVehicles()
  }, [])

  // Cargar conductores disponibles
  useEffect(() => {
    const loadConductores = async () => {
      try {
        const { data, error } = await supabase
          .from('conductores')
          .select(`
            id,
            numero_licencia,
            numero_dni,
            nombres,
            apellidos,
            licencia_vencimiento,
            estado_id,
            preferencia_turno,
            conductores_estados (
              codigo,
              descripcion
            )
          `)
          .order('apellidos')

        if (error) throw error

        // Filtrar conductores activos (cualquier variante del código)
        const conductoresActivos = (data || []).filter((c: any) =>
          c.conductores_estados?.codigo?.toLowerCase().includes('activo')
        ) as Conductor[]

        // Verificar qué conductores tienen asignaciones activas o programadas (con horario)
        const [asignacionesActivasRes, asignacionesProgramadasRes] = await Promise.all([
          supabase
            .from('asignaciones_conductores')
            .select('conductor_id, horario, asignaciones!inner(estado)')
            .eq('asignaciones.estado', 'activa'),
          supabase
            .from('asignaciones_conductores')
            .select('conductor_id, horario, asignaciones!inner(estado)')
            .eq('asignaciones.estado', 'programado')
        ])

        if (asignacionesActivasRes.error) {
          console.error('Error verificando asignaciones activas:', asignacionesActivasRes.error)
        }
        if (asignacionesProgramadasRes.error) {
          console.error('Error verificando asignaciones programadas:', asignacionesProgramadasRes.error)
        }

        const asignacionesActivas = asignacionesActivasRes.data as { conductor_id: string; horario: string }[] | null
        const asignacionesProgramadas = asignacionesProgramadasRes.data as { conductor_id: string; horario: string }[] | null

        // Combinar asignaciones activas y programadas para verificar turnos ocupados
        const todasAsignaciones = [...(asignacionesActivas || []), ...(asignacionesProgramadas || [])]

        // Marcar conductores con asignación activa o programada, incluyendo turno específico
        const conductoresConEstado = conductoresActivos.map(conductor => {
          const asignacionesConductor = todasAsignaciones.filter(a => a.conductor_id === conductor.id)
          const tieneAsignacionActiva = asignacionesActivas?.some((a: any) => a.conductor_id === conductor.id) || false
          const tieneAsignacionProgramada = asignacionesProgramadas?.some((a: any) => a.conductor_id === conductor.id) || false
          const tieneAsignacionDiurna = asignacionesConductor.some(a => a.horario === 'diurno')
          const tieneAsignacionNocturna = asignacionesConductor.some(a => a.horario === 'nocturno')
          // Para A CARGO: horario puede ser 'todo_dia' o cualquier otro valor
          const tieneAsignacionCargo = asignacionesConductor.some(a => a.horario !== 'diurno' && a.horario !== 'nocturno')
          
          return {
            ...conductor,
            tieneAsignacionActiva,
            tieneAsignacionProgramada,
            // Si tiene asignación A CARGO, marcar ambos turnos como ocupados para el filtro
            tieneAsignacionDiurna: tieneAsignacionDiurna || tieneAsignacionCargo,
            tieneAsignacionNocturna: tieneAsignacionNocturna || tieneAsignacionCargo
          }
        })

        setConductores(conductoresConEstado)
      } catch (error) {
        console.error('Error loading conductores:', error)
      }
    }

    loadConductores()
  }, [])

  const handleNext = () => {
    if (step === 1) {
      if (!formData.modalidad || !formData.horario) {
        Swal.fire('Error', 'Debes seleccionar una modalidad y horario', 'error')
        return
      }
    } else if (step === 2) {
      if (!formData.vehiculo_id) {
        Swal.fire('Error', 'Debes seleccionar un vehículo', 'error')
        return
      }
    } else if (step === 3) {
      // Validar conductores según el modo
      if (formData.horario === 'CARGO') {
        if (formData.conductores_ids.length === 0) {
          Swal.fire('Error', 'Debes asignar un conductor para A Cargo', 'error')
          return
        }
      } else {
        // Modo TURNO - requiere al menos 1 conductor
        if (!formData.conductor_diurno_id && !formData.conductor_nocturno_id) {
          Swal.fire('Error', 'Debes asignar al menos un conductor (Diurno o Nocturno)', 'error')
          return
        }
      }
    }
    setStep(step + 1)
  }

  const handleBack = () => {
    setStep(step - 1)
  }

  const handleSelectModality = (modalidad: AssignmentData['modalidad'], horario: AssignmentData['horario']) => {
    setFormData({
      ...formData,
      modalidad,
      horario,
      // Distancia por defecto: 0 para A Cargo, vacío para Turno
      distancia: horario === 'CARGO' ? '0' : ''
    })
  }

  const handleSelectVehicle = (vehicle: Vehicle) => {
    setFormData({ ...formData, vehiculo_id: vehicle.id })
  }

  // Para modo A Cargo (solo 1 conductor)
  const handleSelectConductorCargo = (conductorId: string) => {
    setFormData({
      ...formData,
      conductores_ids: [conductorId]
    })
  }

  // Para modo Turno - Turno Diurno
  const handleSelectConductorDiurno = (conductorId: string) => {
    setFormData({
      ...formData,
      conductor_diurno_id: conductorId
    })
  }

  // Para modo Turno - Turno Nocturno
  const handleSelectConductorNocturno = (conductorId: string) => {
    setFormData({
      ...formData,
      conductor_nocturno_id: conductorId
    })
  }

  // Remover conductor de turno específico
  const handleRemoveConductorTurno = (tipo: 'diurno' | 'nocturno') => {
    if (tipo === 'diurno') {
      setFormData({ ...formData, conductor_diurno_id: '' })
    } else {
      setFormData({ ...formData, conductor_nocturno_id: '' })
    }
  }

  const handleSubmit = async () => {
    // Prevenir doble-submit
    if (loading) return

    // Validaciones según modo
    if (formData.horario === 'CARGO') {
      if (formData.conductores_ids.length === 0) {
        Swal.fire('Error', 'Debes asignar un conductor para A Cargo', 'error')
        return
      }
    } else {
      // Modo Turno - requiere al menos 1 conductor
      if (!formData.conductor_diurno_id && !formData.conductor_nocturno_id) {
        Swal.fire('Error', 'Debes asignar al menos un conductor (Diurno o Nocturno)', 'error')
        return
      }
    }

    // Validar que los conductores seleccionados no tengan asignaciones activas
    const conductoresSeleccionados = formData.horario === 'CARGO' 
      ? formData.conductores_ids 
      : [formData.conductor_diurno_id, formData.conductor_nocturno_id].filter(Boolean)
    
    const conductoresConAsignacionActiva = conductores.filter(
      c => conductoresSeleccionados.includes(c.id) && c.tieneAsignacionActiva
    )

    if (conductoresConAsignacionActiva.length > 0) {
      const nombres = conductoresConAsignacionActiva.map(c => `${c.nombres} ${c.apellidos}`).join(', ')
      const result = await Swal.fire({
        title: 'Conductores con asignacion activa',
        html: `Los siguientes conductores ya tienen una asignacion activa:<br><br><b>${nombres}</b><br><br>¿Deseas continuar de todas formas?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Si, continuar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#f59e0b'
      })
      
      if (!result.isConfirmed) {
        return
      }
    }

    setLoading(true)

    try {
      // 0. Obtener usuario actual
      const { data: { user } } = await supabase.auth.getUser()

      // 1. Generar código de asignación único de 6 dígitos
      const codigoAsignacion = `ASG-${String(Date.now()).slice(-6)}`

      // 2. Preparar lista de conductores según modo
      let conductoresIds: string[] = []
      let conductorPrincipalId: string

      if (formData.horario === 'CARGO') {
        conductoresIds = formData.conductores_ids
        conductorPrincipalId = formData.conductores_ids[0]
      } else {
        // Modo Turno - solo agregar conductores que estén asignados
        conductoresIds = [formData.conductor_diurno_id, formData.conductor_nocturno_id].filter(id => id)
        conductorPrincipalId = formData.conductor_diurno_id || formData.conductor_nocturno_id // Diurno como principal, si no hay, nocturno
      }

      // 3. Crear la asignación principal con estado PROGRAMADO
      // Combinar fecha y hora programada en timezone Argentina (UTC-3)
      // Formato: YYYY-MM-DDTHH:MM:00-03:00 para forzar timezone Argentina
      const fechaHoraProgramadaStr = `${formData.fecha_programada}T${formData.hora_programada}:00-03:00`
      const fechaHoraProgramada = new Date(fechaHoraProgramadaStr)

      const { data: asignacion, error: asignacionError } = await supabase
        .from('asignaciones')
        .insert({
          vehiculo_id: formData.vehiculo_id,
          conductor_id: conductorPrincipalId,
          fecha_programada: fechaHoraProgramada.toISOString(),
          modalidad: formData.modalidad,
          horario: formData.horario,
          estado: 'programado',  // Estado inicial PROGRAMADO
          notas: formData.notas.trim() || null,  // Solo guardar si hay contenido
          codigo: codigoAsignacion,
          created_by: user?.id,
          created_by_name: profile?.full_name || 'Sistema'
        } as any)
        .select()
        .single()

      if (asignacionError) throw asignacionError

      // 4. Crear registros en asignaciones_conductores para cada conductor
      // Determinar el horario según el modo y el conductor
      const distanciaCompartida = parseFloat(formData.distancia) || 0

      const conductoresData = conductoresIds.map((conductorId) => {
        let horarioTurno = 'todo_dia' // Por defecto para CARGO
        let documentoValue: string = 'N/A'
        let ubicacionValue = ''

        if (formData.horario === 'TURNO') {
          // Determinar si es conductor diurno o nocturno
          if (conductorId === formData.conductor_diurno_id) {
            horarioTurno = 'diurno'
            documentoValue = formData.documento_diurno || 'N/A'
            ubicacionValue = formData.ubicacion_diurno
          } else if (conductorId === formData.conductor_nocturno_id) {
            horarioTurno = 'nocturno'
            documentoValue = formData.documento_nocturno || 'N/A'
            ubicacionValue = formData.ubicacion_nocturno
          }
        } else if (formData.horario === 'CARGO') {
          // Modo A CARGO
          documentoValue = formData.documento_cargo || 'N/A'
          ubicacionValue = formData.ubicacion_cargo
        }

        return {
          asignacion_id: (asignacion as any)?.id,
          conductor_id: conductorId,
          horario: horarioTurno,
          distancia: distanciaCompartida,
          documento: documentoValue,
          ubicacion: ubicacionValue,
          estado: 'asignado',
          confirmado: false,
          created_by: user?.id
        }
      })

      const { error: conductoresError } = await supabase
        .from('asignaciones_conductores')
        .insert(conductoresData as any)

      if (conductoresError) throw conductoresError

      // NO actualizar estado del vehículo - se mantiene en su estado actual
      // Solo se actualizará cuando se CONFIRME la programación

      Swal.fire({
        icon: 'success',
        title: '¡Programación creada!',
        text: `Número de asignación: ${codigoAsignacion}\nEstado: PROGRAMADO para ${new Date(formData.fecha_programada).toLocaleDateString('es-AR')}`,
        showConfirmButton: false,
        timer: 3000
      })

      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Error creating assignment:', error)
      Swal.fire('Error', error.message || 'Error al crear la asignación', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Conductores seleccionados y disponibles según modo
  const isTurnoMode = formData.horario === 'TURNO'

  const conductorDiurno = conductores.find(c => c.id === formData.conductor_diurno_id)
  const conductorNocturno = conductores.find(c => c.id === formData.conductor_nocturno_id)
  const conductorCargo = conductores.find(c => c.id === formData.conductores_ids[0])

  const assignedConductorIds = isTurnoMode
    ? [formData.conductor_diurno_id, formData.conductor_nocturno_id].filter(Boolean)
    : formData.conductores_ids

  const availableConductores = conductores.filter(c => !assignedConductorIds.includes(c.id))

  // Filtrar y ordenar vehículos por disponibilidad
  const filteredVehicles = vehicles
    .filter(v => {
      // Filtro por búsqueda de texto
      const matchesSearch = v.patente.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
        v.marca.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
        v.modelo.toLowerCase().includes(vehicleSearch.toLowerCase())

      // Filtro por disponibilidad
      const matchesAvailability = vehicleAvailabilityFilter === '' ||
        vehicleAvailabilityFilter === v.disponibilidad ||
        (vehicleAvailabilityFilter === 'con_turno_libre' &&
          (v.disponibilidad === 'turno_diurno_libre' || v.disponibilidad === 'turno_nocturno_libre')) ||
        (vehicleAvailabilityFilter === 'en_uso' &&
          (v.disponibilidad === 'ocupado' || v.disponibilidad === 'turno_diurno_libre' || v.disponibilidad === 'turno_nocturno_libre'))

      return matchesSearch && matchesAvailability
    })
    .sort((a, b) => {
      // Prioridad: disponible > turno libre > ocupado
      const prioridad: Record<string, number> = {
        'disponible': 0,
        'turno_diurno_libre': 1,
        'turno_nocturno_libre': 1,
        'ocupado': 2
      }
      const prioA = prioridad[a.disponibilidad] ?? 99
      const prioB = prioridad[b.disponibilidad] ?? 99
      return prioA - prioB
    })

  // Filtrar y ordenar conductores: disponibles primero, luego activos
  // Los conductores con asignaciones ocupadas aparecerán deshabilitados (no ocultos)
  const filteredAvailableConductores = availableConductores
    .filter(c => {
      // Filtro por búsqueda de texto (nombre, apellido o DNI)
      const matchesSearch = c.nombres.toLowerCase().includes(conductorSearch.toLowerCase()) ||
        c.apellidos.toLowerCase().includes(conductorSearch.toLowerCase()) ||
        (c.numero_dni && c.numero_dni.toLowerCase().includes(conductorSearch.toLowerCase()))

      // Filtro por estado
      const tieneAsignacion = c.tieneAsignacionDiurna || c.tieneAsignacionNocturna
      const matchesStatus = conductorStatusFilter === '' ||
        (conductorStatusFilter === 'disponible' && !tieneAsignacion) ||
        (conductorStatusFilter === 'activo' && !tieneAsignacion) ||
        (conductorStatusFilter === 'con_asignacion' && tieneAsignacion)

      // Filtro por preferencia de turno (para modo TURNO y A CARGO)
      const matchesTurno = conductorTurnoFilter === '' ||
        (conductorTurnoFilter === 'diurno' && (c.preferencia_turno === 'DIURNO' || c.preferencia_turno === 'SIN_PREFERENCIA' || !c.preferencia_turno)) ||
        (conductorTurnoFilter === 'nocturno' && (c.preferencia_turno === 'NOCTURNO' || c.preferencia_turno === 'SIN_PREFERENCIA' || !c.preferencia_turno)) ||
        (conductorTurnoFilter === 'cargo' && (c.preferencia_turno === 'A_CARGO'))

      return matchesSearch && matchesStatus && matchesTurno
    })
    .sort((a, b) => {
      // Ordenar por disponibilidad: disponibles primero, ocupados al final
      // Calcular "peso" de ocupación (0 = disponible, 1 = un turno ocupado, 2 = ambos ocupados)
      const pesoA = (a.tieneAsignacionDiurna ? 1 : 0) + (a.tieneAsignacionNocturna ? 1 : 0)
      const pesoB = (b.tieneAsignacionDiurna ? 1 : 0) + (b.tieneAsignacionNocturna ? 1 : 0)
      if (pesoA !== pesoB) return pesoA - pesoB

      // Si mismo peso, ordenar por estado activo (disponibles primero)
      if (a.tieneAsignacionActiva === b.tieneAsignacionActiva) return 0
      return a.tieneAsignacionActiva ? 1 : -1
    })

  return (
    <>
      <style>{`
        .wizard-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .wizard-container {
          background: white;
          border-radius: 16px;
          width: 100%;
          max-width: 1200px;
          height: 92vh;
          max-height: 850px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }

        .wizard-header {
          padding: 16px 28px;
          border-bottom: 1px solid #E5E7EB;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: linear-gradient(to bottom, #FFFFFF 0%, #F9FAFB 100%);
          flex-shrink: 0;
        }

        .wizard-title {
          margin: 0;
          font-size: clamp(16px, 1.5vw, 20px);
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.5px;
        }

        .wizard-subtitle {
          margin: 4px 0 0 0;
          font-size: clamp(10px, 1vw, 12px);
          color: #6B7280;
          font-weight: 400;
        }

        .btn-close {
          background: none;
          border: none;
          color: #6B7280;
          cursor: pointer;
          padding: 8px;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .btn-close:hover {
          background: #E5E7EB;
          color: #1F2937;
        }

        .wizard-stepper {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px 24px;
          background: white;
          border-bottom: 1px solid #E5E7EB;
          flex-shrink: 0;
        }

        .step-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          position: relative;
        }

        .step-circle {
          width: clamp(32px, 3vw, 40px);
          height: clamp(32px, 3vw, 40px);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: clamp(11px, 1vw, 14px);
          border: 2px solid #E5E7EB;
          background: white;
          color: #9CA3AF;
          transition: all 0.25s ease;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .step-circle.active {
          background: #E63946;
          border-color: #E63946;
          color: white;
          box-shadow: 0 4px 12px rgba(230, 57, 70, 0.3);
          transform: scale(1.05);
        }

        .step-circle.completed {
          background: #10B981;
          border-color: #10B981;
          color: white;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
        }

        .step-label {
          font-size: clamp(9px, 0.8vw, 11px);
          font-weight: 600;
          color: #9CA3AF;
          white-space: nowrap;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .step-label.active {
          color: #E63946;
        }

        .step-label.completed {
          color: #10B981;
        }

        .step-connector {
          width: 80px;
          height: 2px;
          background: #E5E7EB;
          margin: 0 12px;
          margin-bottom: 28px;
          border-radius: 2px;
          transition: all 0.3s ease;
        }

        .step-connector.completed {
          background: #10B981;
        }

        .wizard-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 20px 24px;
          background: #FAFBFC;
          box-sizing: border-box;
        }

        .wizard-content::-webkit-scrollbar {
          width: 0px;
          background: transparent;
        }

        .wizard-content {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .step-3-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 100%;
          max-width: 100%;
          overflow: hidden;
        }

        .wizard-footer {
          padding: 20px 40px;
          border-top: 1px solid #E5E7EB;
          display: flex;
          justify-content: space-between;
          background: white;
        }

        .btn {
          padding: 14px 28px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: none;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .btn-secondary {
          background: white;
          color: #6B7280;
          border: 2px solid #E5E7EB;
          box-shadow: none;
        }

        .btn-secondary:hover {
          background: #F9FAFB;
          border-color: #D1D5DB;
          color: #374151;
        }

        .btn-primary {
          background: linear-gradient(to bottom, #E63946 0%, #D62828 100%);
          color: white;
          border: 2px solid #E63946;
        }

        .btn-primary:hover {
          background: linear-gradient(to bottom, #D62828 0%, #C62020 100%);
          box-shadow: 0 4px 12px rgba(230, 57, 70, 0.3);
          transform: translateY(-1px);
        }

        .btn-primary:disabled {
          background: #D1D5DB;
          border-color: #D1D5DB;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        .modality-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          max-width: 700px;
          margin: 0 auto;
        }

        .modality-card {
          border: 2px solid #E5E7EB;
          border-radius: 16px;
          padding: 40px 24px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: white;
          position: relative;
          overflow: hidden;
        }

        .modality-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: transparent;
          transition: all 0.2s ease;
        }

        .modality-card:hover {
          border-color: #E63946;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        }

        .modality-card:hover::before {
          background: #E63946;
        }

        .modality-card.selected {
          border-color: #E63946;
          background: #FFF;
          box-shadow: 0 4px 16px rgba(230, 57, 70, 0.15);
        }

        .modality-card.selected::before {
          background: #E63946;
        }

        .modality-icon {
          margin-bottom: 20px;
          color: #6B7280;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modality-card:hover .modality-icon,
        .modality-card.selected .modality-icon {
          color: #E63946;
          transform: scale(1.1);
        }

        .modality-title {
          font-size: clamp(16px, 1.5vw, 20px);
          font-weight: 700;
          color: #1F2937;
          margin: 0 0 8px 0;
        }

        .modality-description {
          font-size: clamp(11px, 1vw, 13px);
          color: #6B7280;
          margin: 0;
          line-height: 1.5;
        }

        .vehicle-grid {
          display: grid;
          gap: 12px;
          max-height: 450px;
          overflow-y: auto;
          padding-right: 8px;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .vehicle-grid::-webkit-scrollbar {
          width: 0px;
          background: transparent;
        }

        .vehicle-card {
          border: 2px solid #E5E7EB;
          border-radius: 14px;
          padding: 20px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 16px;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: white;
        }

        .vehicle-card:hover {
          border-color: #E63946;
          background: #FFF;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          transform: translateY(-1px);
        }

        .vehicle-card.selected {
          border-color: #E63946;
          background: linear-gradient(to right, #FEF2F2 0%, #FFF 100%);
          box-shadow: 0 4px 16px rgba(230, 57, 70, 0.15);
        }

        .vehicle-info {
          flex: 1;
        }

        .vehicle-patente {
          font-size: clamp(14px, 1.3vw, 17px);
          font-weight: 700;
          color: #111827;
          margin: 0 0 6px 0;
          letter-spacing: 0.5px;
        }

        .vehicle-details {
          font-size: clamp(11px, 1vw, 13px);
          color: #6B7280;
          margin: 0;
        }

        .radio-circle {
          width: 26px;
          height: 26px;
          border: 3px solid #D1D5DB;
          border-radius: 50%;
          position: relative;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .radio-circle.selected {
          border-color: #E63946;
          background: #FEF2F2;
        }

        .radio-circle.selected::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 12px;
          height: 12px;
          background: #E63946;
          border-radius: 50%;
        }

        .conductores-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }

        .conductores-layout.turno-mode {
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr);
          gap: 12px;
        }

        .conductores-column {
          border: 2px solid #E5E7EB;
          border-radius: 12px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          background: white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          min-height: 300px;
          max-height: 380px;
          min-width: 0;
          overflow: hidden;
        }

        .conductores-list {
          flex: 1;
          overflow-y: auto;
          padding-right: 6px;
          margin-right: -6px;
        }

        .conductores-list::-webkit-scrollbar {
          width: 6px;
        }

        .conductores-list::-webkit-scrollbar-track {
          background: #F3F4F6;
          border-radius: 3px;
        }

        .conductores-list::-webkit-scrollbar-thumb {
          background: #D1D5DB;
          border-radius: 3px;
        }

        .conductores-list::-webkit-scrollbar-thumb:hover {
          background: #9CA3AF;
        }

        .conductores-column.turno-diurno {
          border-color: #FBBF24;
          background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%);
          box-shadow: 0 4px 12px rgba(251, 191, 36, 0.15);
          overflow: hidden;
          min-height: 300px;
          max-height: 380px;
          min-width: 0;
        }

        .conductores-column.turno-nocturno {
          border-color: #3B82F6;
          background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
          overflow: hidden;
          min-height: 300px;
          max-height: 380px;
          min-width: 0;
        }

        .conductores-column.a-cargo {
          border-color: #10B981;
          background: linear-gradient(135deg, #F0FDF4 0%, #D1FAE5 100%);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15);
          overflow: hidden;
          min-height: 300px;
          max-height: 380px;
          min-width: 0;
        }

        .conductores-column h4 {
          margin: 0 0 10px 0;
          font-size: clamp(11px, 1vw, 13px);
          font-weight: 700;
          color: #1F2937;
          padding-bottom: 8px;
          border-bottom: 2px solid rgba(0, 0, 0, 0.1);
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .turno-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: clamp(9px, 0.8vw, 11px);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .turno-badge.diurno {
          background: white;
          color: #D97706;
          border: 2px solid #FBBF24;
          box-shadow: 0 2px 4px rgba(251, 191, 36, 0.2);
        }

        .turno-badge.nocturno {
          background: white;
          color: #1E40AF;
          border: 2px solid #3B82F6;
          box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
        }

        .turno-badge.cargo {
          background: white;
          color: #047857;
          border: 2px solid #10B981;
          box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);
        }

        .conductor-item {
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          padding: 10px;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: grab;
          transition: all 0.2s ease;
          background: white;
          user-select: none;
        }

        .conductor-item:active {
          cursor: grabbing;
          opacity: 0.7;
        }

        .conductor-item:hover {
          border-color: #E63946;
          background: #FFF;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
          transform: translateX(2px);
        }

        .conductor-item.selected {
          border-color: #E63946;
          background: linear-gradient(to right, #FEF2F2 0%, #FFF 100%);
        }

        .conductor-item.in-turno {
          background: #FEFEFE;
        }

        .conductor-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 12px;
          color: #6B7280;
          flex-shrink: 0;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .conductor-info {
          flex: 1;
          min-width: 0;
        }

        .conductor-name {
          font-size: clamp(10px, 0.9vw, 12px);
          font-weight: 600;
          color: #111827;
          margin: 0 0 2px 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .conductor-license {
          font-size: clamp(9px, 0.8vw, 11px);
          color: #9CA3AF;
          margin: 0;
          font-weight: 500;
        }

        .remove-btn {
          background: none;
          border: none;
          color: #EF4444;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .remove-btn:hover {
          background: #FEE2E2;
        }

        .step-description {
          text-align: center;
          margin-bottom: clamp(12px, 1.5vw, 20px);
        }

        .step-description h3 {
          font-size: clamp(14px, 1.3vw, 18px);
          font-weight: 700;
          color: #1F2937;
          margin: 0 0 6px 0;
        }

        .step-description p {
          font-size: clamp(10px, 0.9vw, 13px);
          color: #6B7280;
          margin: 0;
          line-height: 1.5;
        }

        .empty-state {
          text-align: center;
          padding: 32px;
          color: #9CA3AF;
          font-size: 14px;
        }

        .drop-zone {
          border: 2px dashed rgba(0, 0, 0, 0.15);
          border-radius: 10px;
          padding: 16px;
          text-align: center;
          min-height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.6);
          transition: all 0.2s ease;
        }

        .drop-zone.has-conductor {
          border-style: solid;
          border-color: rgba(230, 57, 70, 0.3);
          background: white;
        }

        .drop-zone.drag-over {
          border-color: #E63946;
          background: rgba(230, 57, 70, 0.05);
          transform: scale(1.01);
          box-shadow: 0 2px 8px rgba(230, 57, 70, 0.15);
        }

        .drop-zone-empty {
          color: #9CA3AF;
          font-size: 12px;
          font-weight: 500;
        }

        .assigned-conductor-card {
          width: 100%;
          border: 2px solid #E63946;
          border-radius: 10px;
          padding: 12px;
          background: white;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 2px 8px rgba(230, 57, 70, 0.15);
        }

        @media (max-width: 1024px) {
          .conductores-layout.turno-mode {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: 10px;
          }
          
          .conductores-column {
            min-height: 250px;
            max-height: 320px;
            padding: 12px;
          }
        }

        @media (max-width: 768px) {
          .wizard-container {
            max-width: 100%;
            max-height: 100vh;
            border-radius: 0;
          }

          .modality-grid {
            grid-template-columns: 1fr;
          }

          .conductores-layout,
          .conductores-layout.turno-mode {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .conductores-column {
            min-height: 200px;
            max-height: 280px;
          }

          .step-connector {
            width: 60px;
          }
        }
      `}</style>

      <div className="wizard-overlay" onClick={onClose}>
        <div className="wizard-container" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="wizard-header">
            <div>
              <h2 className="wizard-title">Asistente de Asignación</h2>
              <p className="wizard-subtitle">Guíate paso a paso en la asignación de vehículos</p>
            </div>
            <button className="btn-close" onClick={onClose}>
              <X size={24} />
            </button>
          </div>

          {/* Stepper */}
          <div className="wizard-stepper">
            <div className="step-item">
              <div className={`step-circle ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
                {step > 1 ? <Check size={16} /> : '1'}
              </div>
              <span className={`step-label ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
                Modalidad
              </span>
            </div>

            <div className={`step-connector ${step > 1 ? 'completed' : ''}`} />

            <div className="step-item">
              <div className={`step-circle ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
                {step > 2 ? <Check size={16} /> : '2'}
              </div>
              <span className={`step-label ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
                Vehículo
              </span>
            </div>

            <div className={`step-connector ${step > 2 ? 'completed' : ''}`} />

            <div className="step-item">
              <div className={`step-circle ${step >= 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`}>
                {step > 3 ? <Check size={16} /> : '3'}
              </div>
              <span className={`step-label ${step >= 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`}>Conductores</span>
            </div>

            <div className={`step-connector ${step > 3 ? 'completed' : ''}`} />

            <div className="step-item">
              <div className={`step-circle ${step >= 4 ? 'active' : ''}`}>4</div>
              <span className={`step-label ${step >= 4 ? 'active' : ''}`}>Programación</span>
            </div>
          </div>

          {/* Content */}
          <div className="wizard-content">
            {/* Step 1: Modalidad */}
            {step === 1 && (
              <div>
                <div className="step-description">
                  <h3>Paso 1: Selecciona la Modalidad</h3>
                  <p>¿Deseas asignar un vehículo por turno o a cargo?</p>
                </div>

                <div className="modality-grid">
                  <div
                    className={`modality-card ${formData.horario === 'TURNO' ? 'selected' : ''}`}
                    onClick={() => handleSelectModality('semanal', 'TURNO')}
                  >
                    <div className="modality-icon">
                      <Calendar size={48} />
                    </div>
                    <h4 className="modality-title">Turno</h4>
                    <p className="modality-description">Asignación por jornada (Diurno y Nocturno)</p>
                  </div>

                  <div
                    className={`modality-card ${formData.horario === 'CARGO' ? 'selected' : ''}`}
                    onClick={() => handleSelectModality('semanal', 'CARGO')}
                  >
                    <div className="modality-icon">
                      <User size={48} />
                    </div>
                    <h4 className="modality-title">A Cargo</h4>
                    <p className="modality-description">Asignación permanente a conductor</p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Vehículo */}
            {step === 2 && (
              <div>
                <div className="step-description">
                  <h3>Paso 2: Selecciona Vehículo</h3>
                  <p>Selecciona el vehículo que deseas asignar.</p>
                </div>

                {/* Buscador y Filtro de vehículos */}
                <div style={{ marginBottom: '20px', maxWidth: '700px', margin: '0 auto 20px auto', display: 'flex', gap: '12px' }}>
                  <input
                    type="text"
                    placeholder="Buscar por patente, marca o modelo..."
                    value={vehicleSearch}
                    onChange={(e) => setVehicleSearch(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      border: '2px solid #E5E7EB',
                      borderRadius: '8px',
                      fontSize: 'clamp(12px, 1vw, 14px)',
                      fontFamily: 'inherit'
                    }}
                  />
                  <select
                    value={vehicleAvailabilityFilter}
                    onChange={(e) => setVehicleAvailabilityFilter(e.target.value)}
                    style={{
                      padding: '12px 16px',
                      border: '2px solid #E5E7EB',
                      borderRadius: '8px',
                      fontSize: 'clamp(12px, 1vw, 14px)',
                      fontFamily: 'inherit',
                      background: 'white',
                      cursor: 'pointer',
                      minWidth: '180px'
                    }}
                  >
                    <option value="">Todos</option>
                    <option value="disponible">Disponible</option>
                    <option value="con_turno_libre">Con turno libre</option>
                    <option value="en_uso">En Uso</option>
                  </select>
                </div>

                <div className="vehicle-grid">
                  {filteredVehicles.length === 0 ? (
                    <div className="empty-state">
                      {vehicleSearch || vehicleAvailabilityFilter ? 'No se encontraron vehículos con ese criterio' : 'No hay vehículos disponibles en este momento'}
                    </div>
                  ) : (
                    filteredVehicles.map((vehicle) => {
                      // Determinar badge y color según disponibilidad
                      let badgeText = ''
                      let badgeColor = ''
                      let badgeBg = ''
                      let detalleText = ''

                      switch (vehicle.disponibilidad) {
                        case 'disponible':
                          badgeText = 'Disponible'
                          badgeBg = '#10B981'
                          badgeColor = 'white'
                          detalleText = 'Libre para asignación'
                          break
                        case 'turno_diurno_libre':
                          badgeText = 'En Uso'
                          badgeBg = '#F59E0B'
                          badgeColor = 'white'
                          detalleText = '☀️ Diurno Libre'
                          break
                        case 'turno_nocturno_libre':
                          badgeText = 'En Uso'
                          badgeBg = '#F59E0B'
                          badgeColor = 'white'
                          detalleText = '🌙 Nocturno Libre'
                          break
                        case 'ocupado':
                          badgeText = 'En Uso'
                          badgeBg = '#F59E0B'
                          badgeColor = 'white'
                          detalleText = vehicle.asignacionActiva?.horario === 'CARGO' ? 'A Cargo' : 'Turnos completos'
                          break
                      }

                      return (
                        <div
                          key={vehicle.id}
                          className={`vehicle-card ${formData.vehiculo_id === vehicle.id ? 'selected' : ''}`}
                          onClick={() => handleSelectVehicle(vehicle)}
                        >
                          <div className="vehicle-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                              <h4 className="vehicle-patente" style={{ margin: 0 }}>{vehicle.patente}</h4>
                              <span style={{
                                background: badgeBg,
                                color: badgeColor,
                                padding: '3px 10px',
                                borderRadius: '6px',
                                fontSize: 'clamp(9px, 0.8vw, 11px)',
                                fontWeight: '600'
                              }}>
                                {badgeText}
                              </span>
                              {detalleText && (
                                <span style={{
                                  color: '#6B7280',
                                  fontSize: 'clamp(9px, 0.8vw, 11px)',
                                  fontWeight: '500'
                                }}>
                                  ({detalleText})
                                </span>
                              )}
                            </div>
                            <p className="vehicle-details">
                              {vehicle.marca} {vehicle.modelo} • {vehicle.anio}
                            </p>
                          </div>
                          <div className={`radio-circle ${formData.vehiculo_id === vehicle.id ? 'selected' : ''}`} />
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Conductores */}
            {step === 3 && (
              <div>
                <div className="step-description">
                  <h3>Paso 3: Asigna los Conductores</h3>
                  <p>
                    {formData.horario === 'CARGO'
                      ? 'Selecciona el conductor que estará a cargo del vehículo.'
                      : 'Asigna conductores para los turnos (al menos uno: Diurno o Nocturno).'}
                  </p>
                </div>

                <div className={`conductores-layout ${isTurnoMode ? 'turno-mode' : ''}`}>
                  {/* Conductores Disponibles */}
                  <div className="conductores-column">
                    <h4>Conductores Disponibles</h4>

                    {/* Filtros: Buscador, Estado y Turno */}
                    <div style={{ marginBottom: '8px', flexShrink: 0, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        placeholder="Buscar por nombre o DNI..."
                        value={conductorSearch}
                        onChange={(e) => setConductorSearch(e.target.value)}
                        style={{
                          flex: 1,
                          minWidth: '120px',
                          padding: '8px 10px',
                          border: '1px solid #E5E7EB',
                          borderRadius: '6px',
                          fontSize: 'clamp(10px, 0.9vw, 12px)',
                          fontFamily: 'inherit'
                        }}
                      />
                      <select
                        value={conductorStatusFilter}
                        onChange={(e) => setConductorStatusFilter(e.target.value)}
                        style={{
                          padding: '8px 10px',
                          border: '1px solid #E5E7EB',
                          borderRadius: '6px',
                          fontSize: 'clamp(10px, 0.9vw, 12px)',
                          fontFamily: 'inherit',
                          background: 'white',
                          cursor: 'pointer',
                          minWidth: '90px'
                        }}
                      >
                        <option value="">Estado</option>
                        <option value="disponible">Disponible</option>
                        <option value="activo">Activo</option>
                        <option value="con_asignacion">Con Asignación</option>
                      </select>
                      {/* Filtro de preferencia de turno - para TURNO y A CARGO */}
                      <select
                        value={conductorTurnoFilter}
                        onChange={(e) => setConductorTurnoFilter(e.target.value)}
                        style={{
                          padding: '8px 10px',
                          border: '1px solid #E5E7EB',
                          borderRadius: '6px',
                          fontSize: 'clamp(10px, 0.9vw, 12px)',
                          fontFamily: 'inherit',
                          background: 'white',
                          cursor: 'pointer',
                          minWidth: '90px'
                        }}
                      >
                        <option value="">Todos</option>
                        <option value="diurno">Diurno</option>
                        <option value="nocturno">Nocturno</option>
                        <option value="cargo">A Cargo</option>
                      </select>
                    </div>

                    <div className="conductores-list">
                      {filteredAvailableConductores.length === 0 ? (
                        <div className="empty-state">
                          {conductorSearch ? 'No se encontraron conductores' : 'No hay conductores disponibles'}
                        </div>
                      ) : (
                        filteredAvailableConductores.map((conductor) => {
                          // Verificar si el conductor tiene turnos ocupados
                          const algunoOcupado = conductor.tieneAsignacionDiurna || conductor.tieneAsignacionNocturna

                          // Mensaje informativo (pero YA NO bloquea selección)
                          let infoMsg = ''
                          if (isTurnoMode) {
                            if (conductor.tieneAsignacionDiurna && conductor.tieneAsignacionNocturna) {
                              infoMsg = 'Ambos turnos ocupados'
                            } else if (conductor.tieneAsignacionDiurna) {
                              infoMsg = 'Turno diurno ocupado'
                            } else if (conductor.tieneAsignacionNocturna) {
                              infoMsg = 'Turno nocturno ocupado'
                            }
                          } else if (algunoOcupado) {
                            infoMsg = 'Ya tiene asignación activa'
                          }

                          return (
                            <div
                              key={conductor.id}
                              className="conductor-item"
                              draggable={true}
                              onDragStart={(e) => {
                                e.dataTransfer.setData('conductorId', conductor.id)
                                e.dataTransfer.effectAllowed = 'move'
                              }}
                              style={{
                                cursor: 'grab',
                                // Fondo amarillo suave si tiene asignación activa (para indicar que cambiará de auto)
                                background: algunoOcupado ? '#FFFBEB' : undefined,
                                borderColor: algunoOcupado ? '#FCD34D' : undefined
                              }}
                              title={infoMsg || ''}
                            >
                              <div className="conductor-avatar">
                                {conductor.nombres.charAt(0)}{conductor.apellidos.charAt(0)}
                              </div>
                              <div className="conductor-info">
                                <p className="conductor-name">
                                  {conductor.nombres} {conductor.apellidos}
                                </p>
                                <p className="conductor-license" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span>DNI: {conductor.numero_dni || '-'}</span>
                                  <span style={{
                                    fontSize: '9px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontWeight: '600',
                                    background: getPreferenciaBadge(conductor.preferencia_turno).bg,
                                    color: getPreferenciaBadge(conductor.preferencia_turno).color
                                  }}>
                                    {formatPreferencia(conductor.preferencia_turno)}
                                  </span>
                                </p>
                                {infoMsg ? (
                                  <span style={{
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontWeight: '600',
                                    marginTop: '4px',
                                    display: 'inline-block',
                                    background: '#FEF3C7',
                                    color: '#92400E'
                                  }}>
                                    {infoMsg}
                                  </span>
                                ) : (
                                  <span style={{
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontWeight: '600',
                                    marginTop: '4px',
                                    display: 'inline-block',
                                    background: conductor.tieneAsignacionActiva ? '#D1FAE5' : '#FEF3C7',
                                    color: conductor.tieneAsignacionActiva ? '#065F46' : '#92400E'
                                  }}>
                                    {conductor.tieneAsignacionActiva ? 'Activo' : 'Disponible'}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* Modo TURNO: Mostrar dos columnas (Diurno y Nocturno) */}
                  {isTurnoMode && (
                    <>
                      {/* Turno Diurno */}
                      <div className="conductores-column turno-diurno">
                        <h4>
                          <span className="turno-badge diurno">DIURNO</span>
                        </h4>
                        <div
                          className={`drop-zone ${conductorDiurno ? 'has-conductor' : ''}`}
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.currentTarget.classList.add('drag-over')
                          }}
                          onDragLeave={(e) => {
                            e.currentTarget.classList.remove('drag-over')
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            e.currentTarget.classList.remove('drag-over')
                            const conductorId = e.dataTransfer.getData('conductorId')
                            if (conductorId) {
                              const conductor = conductores.find(c => c.id === conductorId)
                              // Mostrar advertencia si tiene asignación pero PERMITIR continuar
                              if (conductor?.tieneAsignacionDiurna) {
                                Swal.fire({
                                  icon: 'info',
                                  title: 'Conductor con asignación activa',
                                  html: `<b>${conductor.nombres} ${conductor.apellidos}</b> tiene una asignación activa en turno diurno.<br><br>Al <b>confirmar</b> esta nueva asignación, la asignación anterior se finalizará automáticamente.`,
                                  confirmButtonText: 'Entendido, continuar',
                                  confirmButtonColor: '#3085d6'
                                })
                              }
                              handleSelectConductorDiurno(conductorId)
                            }
                          }}
                        >
                          {conductorDiurno ? (
                            <div className="assigned-conductor-card">
                              <div className="conductor-avatar">
                                {conductorDiurno.nombres.charAt(0)}{conductorDiurno.apellidos.charAt(0)}
                              </div>
                              <div className="conductor-info" style={{ flex: 1 }}>
                                <p className="conductor-name">
                                  {conductorDiurno.nombres} {conductorDiurno.apellidos}
                                </p>
                                <p className="conductor-license" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span>DNI: {conductorDiurno.numero_dni || '-'}</span>
                                  <span style={{
                                    fontSize: '9px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontWeight: '600',
                                    background: getPreferenciaBadge(conductorDiurno.preferencia_turno).bg,
                                    color: getPreferenciaBadge(conductorDiurno.preferencia_turno).color
                                  }}>
                                    {formatPreferencia(conductorDiurno.preferencia_turno)}
                                  </span>
                                </p>
                              </div>
                              <button
                                className="remove-btn"
                                onClick={() => handleRemoveConductorTurno('diurno')}
                                title="Remover"
                              >
                                <X size={18} />
                              </button>
                            </div>
                          ) : (
                            <div className="drop-zone-empty">
                              Arrastra un conductor aquí
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Turno Nocturno */}
                      <div className="conductores-column turno-nocturno">
                        <h4>
                          <span className="turno-badge nocturno">NOCTURNO</span>
                        </h4>
                        <div
                          className={`drop-zone ${conductorNocturno ? 'has-conductor' : ''}`}
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.currentTarget.classList.add('drag-over')
                          }}
                          onDragLeave={(e) => {
                            e.currentTarget.classList.remove('drag-over')
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            e.currentTarget.classList.remove('drag-over')
                            const conductorId = e.dataTransfer.getData('conductorId')
                            if (conductorId) {
                              const conductor = conductores.find(c => c.id === conductorId)
                              // Mostrar advertencia si tiene asignación pero PERMITIR continuar
                              if (conductor?.tieneAsignacionNocturna) {
                                Swal.fire({
                                  icon: 'info',
                                  title: 'Conductor con asignación activa',
                                  html: `<b>${conductor.nombres} ${conductor.apellidos}</b> tiene una asignación activa en turno nocturno.<br><br>Al <b>confirmar</b> esta nueva asignación, la asignación anterior se finalizará automáticamente.`,
                                  confirmButtonText: 'Entendido, continuar',
                                  confirmButtonColor: '#3085d6'
                                })
                              }
                              handleSelectConductorNocturno(conductorId)
                            }
                          }}
                        >
                          {conductorNocturno ? (
                            <div className="assigned-conductor-card">
                              <div className="conductor-avatar">
                                {conductorNocturno.nombres.charAt(0)}{conductorNocturno.apellidos.charAt(0)}
                              </div>
                              <div className="conductor-info" style={{ flex: 1 }}>
                                <p className="conductor-name">
                                  {conductorNocturno.nombres} {conductorNocturno.apellidos}
                                </p>
                                <p className="conductor-license" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span>DNI: {conductorNocturno.numero_dni || '-'}</span>
                                  <span style={{
                                    fontSize: '9px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontWeight: '600',
                                    background: getPreferenciaBadge(conductorNocturno.preferencia_turno).bg,
                                    color: getPreferenciaBadge(conductorNocturno.preferencia_turno).color
                                  }}>
                                    {formatPreferencia(conductorNocturno.preferencia_turno)}
                                  </span>
                                </p>
                              </div>
                              <button
                                className="remove-btn"
                                onClick={() => handleRemoveConductorTurno('nocturno')}
                                title="Remover"
                              >
                                <X size={18} />
                              </button>
                            </div>
                          ) : (
                            <div className="drop-zone-empty">
                              Arrastra un conductor aquí
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Modo A CARGO: Mostrar una columna */}
                  {!isTurnoMode && (
                    <div className="conductores-column a-cargo">
                      <h4>
                        <span className="turno-badge cargo">A CARGO</span>
                      </h4>
                      <div
                        className={`drop-zone ${conductorCargo ? 'has-conductor' : ''}`}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.currentTarget.classList.add('drag-over')
                        }}
                        onDragLeave={(e) => {
                          e.currentTarget.classList.remove('drag-over')
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          e.currentTarget.classList.remove('drag-over')
                          const conductorId = e.dataTransfer.getData('conductorId')
                          if (conductorId) {
                            const conductor = conductores.find(c => c.id === conductorId)
                            // Mostrar advertencia si tiene asignación pero PERMITIR continuar
                            if (conductor?.tieneAsignacionDiurna || conductor?.tieneAsignacionNocturna) {
                              Swal.fire({
                                icon: 'info',
                                title: 'Conductor con asignación activa',
                                html: `<b>${conductor.nombres} ${conductor.apellidos}</b> tiene una asignación activa.<br><br>Al <b>confirmar</b> esta nueva asignación, la asignación anterior se finalizará automáticamente.`,
                                confirmButtonText: 'Entendido, continuar',
                                confirmButtonColor: '#3085d6'
                              })
                            }
                            handleSelectConductorCargo(conductorId)
                          }
                        }}
                      >
                        {conductorCargo ? (
                          <div className="assigned-conductor-card">
                            <div className="conductor-avatar">
                              {conductorCargo.nombres.charAt(0)}{conductorCargo.apellidos.charAt(0)}
                            </div>
                            <div className="conductor-info" style={{ flex: 1 }}>
                              <p className="conductor-name">
                                {conductorCargo.nombres} {conductorCargo.apellidos}
                              </p>
                              <p className="conductor-license" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span>DNI: {conductorCargo.numero_dni || '-'}</span>
                                <span style={{
                                  fontSize: '9px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontWeight: '600',
                                  background: getPreferenciaBadge(conductorCargo.preferencia_turno).bg,
                                  color: getPreferenciaBadge(conductorCargo.preferencia_turno).color
                                }}>
                                  {formatPreferencia(conductorCargo.preferencia_turno)}
                                </span>
                              </p>
                            </div>
                            <button
                              className="remove-btn"
                              onClick={() => setFormData({ ...formData, conductores_ids: [] })}
                              title="Remover"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        ) : (
                          <div className="drop-zone-empty">
                            Arrastra un conductor aquí
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Programación */}
            {step === 4 && (
              <div>
                <div className="step-description">
                  <h3>Paso 4: Configuración de Programación</h3>
                  <p>Establece la fecha programada para la entrega del vehículo. La fecha de inicio se completará automáticamente al confirmar la programación.</p>
                </div>

                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#374151',
                        marginBottom: '6px'
                      }}>
                        Fecha de Entrega *
                      </label>
                      <input
                        type="date"
                        value={formData.fecha_programada}
                        onChange={(e) => setFormData({ ...formData, fecha_programada: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '2px solid #E5E7EB',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontFamily: 'inherit'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#374151',
                        marginBottom: '6px'
                      }}>
                        Hora de Entrega *
                      </label>
                      <TimeInput24h
                        value={formData.hora_programada}
                        onChange={(value) => setFormData({ ...formData, hora_programada: value })}
                      />
                    </div>
                  </div>
                  <p style={{ fontSize: '11px', color: '#6B7280', marginTop: '-16px', marginBottom: '20px' }}>
                    Fecha y hora programada para la entrega del vehículo
                  </p>

                  {/* Campo de Distancia Compartido */}
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#374151',
                      marginBottom: '8px'
                    }}>
                      Distancia (km) *
                    </label>
                    <input
                      type="number"
                      value={formData.distancia}
                      onChange={(e) => setFormData({ ...formData, distancia: e.target.value })}
                      placeholder="Ingrese la distancia del recorrido"
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '2px solid #E5E7EB',
                        borderRadius: '8px',
                        fontSize: '14px'
                      }}
                    />
                    <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                      Distancia del recorrido/ruta (aplicable para todos los conductores)
                    </p>
                  </div>

                  {/* Campos para TURNO - Conductor Diurno */}
                  {formData.horario === 'TURNO' && formData.conductor_diurno_id && (
                    <div style={{
                      marginBottom: '24px',
                      padding: '20px',
                      background: '#FEF3C7',
                      borderRadius: '12px',
                      border: '2px solid #FCD34D'
                    }}>
                      <h4 style={{ margin: '0 0 16px 0', color: '#92400E', fontSize: '16px', fontWeight: '700' }}>
                        Conductor Diurno
                      </h4>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                          Documento *
                        </label>
                        <select
                          value={formData.documento_diurno}
                          onChange={(e) => setFormData({ ...formData, documento_diurno: e.target.value as any })}
                          style={{ width: '100%', padding: '12px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '14px', background: 'white' }}
                        >
                          <option value="">Seleccione un documento</option>
                          <option value="CARTA_OFERTA">CARTA OFERTA</option>
                          <option value="ANEXO">ANEXO</option>
                          <option value="N/A">N/A</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                          Zona *
                        </label>
                        <input
                          type="text"
                          value={formData.ubicacion_diurno}
                          onChange={(e) => setFormData({ ...formData, ubicacion_diurno: e.target.value })}
                          placeholder="Ingrese la zona"
                          style={{ width: '100%', padding: '12px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '14px' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Campos para TURNO - Conductor Nocturno */}
                  {formData.horario === 'TURNO' && formData.conductor_nocturno_id && (
                    <div style={{
                      marginBottom: '24px',
                      padding: '20px',
                      background: '#DBEAFE',
                      borderRadius: '12px',
                      border: '2px solid #93C5FD'
                    }}>
                      <h4 style={{ margin: '0 0 16px 0', color: '#1E3A8A', fontSize: '16px', fontWeight: '700' }}>
                        Conductor Nocturno
                      </h4>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                          Documento *
                        </label>
                        <select
                          value={formData.documento_nocturno}
                          onChange={(e) => setFormData({ ...formData, documento_nocturno: e.target.value as any })}
                          style={{ width: '100%', padding: '12px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '14px', background: 'white' }}
                        >
                          <option value="">Seleccione un documento</option>
                          <option value="CARTA_OFERTA">CARTA OFERTA</option>
                          <option value="ANEXO">ANEXO</option>
                          <option value="N/A">N/A</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                          Zona *
                        </label>
                        <input
                          type="text"
                          value={formData.ubicacion_nocturno}
                          onChange={(e) => setFormData({ ...formData, ubicacion_nocturno: e.target.value })}
                          placeholder="Ingrese la zona"
                          style={{ width: '100%', padding: '12px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '14px' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Campos para CARGO */}
                  {formData.horario === 'CARGO' && formData.conductores_ids.length > 0 && (
                    <div style={{
                      marginBottom: '24px',
                      padding: '20px',
                      background: '#D1FAE5',
                      borderRadius: '12px',
                      border: '2px solid #10B981'
                    }}>
                      <h4 style={{ margin: '0 0 16px 0', color: '#065F46', fontSize: '16px', fontWeight: '700' }}>
                        Datos del Conductor
                      </h4>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                          Documento *
                        </label>
                        <select
                          value={formData.documento_cargo}
                          onChange={(e) => setFormData({ ...formData, documento_cargo: e.target.value as any })}
                          style={{ width: '100%', padding: '12px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '14px', background: 'white' }}
                        >
                          <option value="">Seleccione un documento</option>
                          <option value="CARTA_OFERTA">CARTA OFERTA</option>
                          <option value="ANEXO">ANEXO</option>
                          <option value="N/A">N/A</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                          Zona *
                        </label>
                        <input
                          type="text"
                          value={formData.ubicacion_cargo}
                          onChange={(e) => setFormData({ ...formData, ubicacion_cargo: e.target.value })}
                          placeholder="Ingrese la zona"
                          style={{ width: '100%', padding: '12px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '14px' }}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#374151',
                      marginBottom: '8px'
                    }}>
                      Notas (Opcional)
                    </label>
                    <textarea
                      value={formData.notas}
                      onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                      rows={4}
                      placeholder="Agrega comentarios o detalles adicionales..."
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '2px solid #E5E7EB',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="wizard-footer">
            <button
              className="btn btn-secondary"
              onClick={step === 1 ? onClose : handleBack}
            >
              {step === 1 ? 'Cancelar' : 'Atrás'}
            </button>

            {step < 4 ? (
              <button className="btn btn-primary" onClick={handleNext}>
                Siguiente <ChevronRight size={18} />
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={Boolean(
                  loading ||
                  !formData.fecha_programada ||
                  !formData.distancia ||
                  (formData.horario === 'CARGO' && formData.conductores_ids.length === 0) ||
                  (isTurnoMode && !formData.conductor_diurno_id && !formData.conductor_nocturno_id) ||
                  // Validar campos para conductor diurno
                  (formData.horario === 'TURNO' && formData.conductor_diurno_id && (!formData.documento_diurno || !formData.ubicacion_diurno)) ||
                  // Validar campos para conductor nocturno
                  (formData.horario === 'TURNO' && formData.conductor_nocturno_id && (!formData.documento_nocturno || !formData.ubicacion_nocturno)) ||
                  // Validar campos para A CARGO
                  (formData.horario === 'CARGO' && formData.conductores_ids.length > 0 && (!formData.documento_cargo || !formData.ubicacion_cargo))
                )}
              >
                {loading ? 'Creando...' : 'Programar Asignación'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
