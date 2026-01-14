// src/modules/onboarding/components/ProgramacionAssignmentWizard.tsx
// Wizard visual para crear nuevas programaciones de entregas
// Basado en AssignmentWizard con drag & drop dual conductor

import { useState, useEffect } from 'react'
import { X, Calendar, User, ChevronRight, Check, Sun, Moon } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { TimeInput24h } from '../../../components/ui/TimeInput24h'
import Swal from 'sweetalert2'
import type { TipoCandidato, TipoDocumento } from '../../../types/onboarding.types'

interface Vehicle {
  id: string
  patente: string
  marca: string
  modelo: string
  anio: number
  color?: string
  estado_id: string
  vehiculos_estados?: {
    codigo: string
    descripcion: string
  }
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

// Helper para obtener color de badge segun preferencia
const getPreferenciaBadge = (preferencia?: string): { bg: string; color: string } => {
  switch (preferencia) {
    case 'DIURNO': return { bg: '#FEF3C7', color: '#92400E' }
    case 'NOCTURNO': return { bg: '#DBEAFE', color: '#1E40AF' }
    case 'A_CARGO': return { bg: '#D1FAE5', color: '#065F46' }
    default: return { bg: '#F3F4F6', color: '#6B7280' }
  }
}

interface ProgramacionData {
  modalidad: 'TURNO' | 'CARGO' | ''
  vehiculo_id: string
  vehiculo_patente: string
  vehiculo_modelo: string
  vehiculo_color: string
  // Conductor legacy (para A CARGO)
  conductor_id: string
  conductor_nombre: string
  conductor_dni: string
  // Conductor Diurno (para TURNO)
  conductor_diurno_id: string
  conductor_diurno_nombre: string
  conductor_diurno_dni: string
  // Conductor Nocturno (para TURNO)
  conductor_nocturno_id: string
  conductor_nocturno_nombre: string
  conductor_nocturno_dni: string
  // Cita (compartida)
  fecha_cita: string
  hora_cita: string
  // Campos para modo A CARGO (un solo set)
  tipo_candidato_cargo: TipoCandidato | ''
  documento_cargo: TipoDocumento | ''
  zona_cargo: string
  distancia_cargo: number | ''
  // Campos para conductor DIURNO
  tipo_candidato_diurno: TipoCandidato | ''
  documento_diurno: TipoDocumento | ''
  zona_diurno: string
  distancia_diurno: number | ''
  // Campos para conductor NOCTURNO
  tipo_candidato_nocturno: TipoCandidato | ''
  documento_nocturno: TipoDocumento | ''
  zona_nocturno: string
  distancia_nocturno: number | ''
  // Otros
  observaciones: string
}

// Tipo para datos de edición - usa any para flexibilidad con los campos de la vista
type EditData = {
  id: string
  [key: string]: any
}

interface Props {
  onClose: () => void
  onSuccess: () => void
  editData?: EditData | null
}

export function ProgramacionAssignmentWizard({ onClose, onSuccess, editData }: Props) {
  const { user, profile } = useAuth()
  const isEditMode = !!editData
  const [step, setStep] = useState(1)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [conductores, setConductores] = useState<Conductor[]>([])
  const [loading, setLoading] = useState(false)
  const [vehicleSearch, setVehicleSearch] = useState('')
  const [vehicleAvailabilityFilter, setVehicleAvailabilityFilter] = useState<string>('')
  const [conductorSearch, setConductorSearch] = useState('')
  const [conductorStatusFilter, setConductorStatusFilter] = useState<string>('')
  const [conductorTurnoFilter, setConductorTurnoFilter] = useState<string>('')

  const [formData, setFormData] = useState<ProgramacionData>(() => {
    // Si hay datos de edición, pre-cargar
    if (editData) {
      const isCargo = editData.modalidad === 'CARGO'
      return {
        modalidad: editData.modalidad || '',
        vehiculo_id: editData.vehiculo_entregar_id || '',
        vehiculo_patente: editData.vehiculo_entregar_patente || editData.vehiculo_entregar_patente_sistema || '',
        vehiculo_modelo: editData.vehiculo_entregar_modelo || editData.vehiculo_entregar_modelo_sistema || '',
        vehiculo_color: editData.vehiculo_entregar_color || '',
        // Conductor legacy (A CARGO)
        conductor_id: editData.conductor_id || '',
        conductor_nombre: editData.conductor_nombre || editData.conductor_display || '',
        conductor_dni: editData.conductor_dni || '',
        // Conductor Diurno
        conductor_diurno_id: editData.conductor_diurno_id || '',
        conductor_diurno_nombre: editData.conductor_diurno_nombre || '',
        conductor_diurno_dni: editData.conductor_diurno_dni || '',
        // Conductor Nocturno
        conductor_nocturno_id: editData.conductor_nocturno_id || '',
        conductor_nocturno_nombre: editData.conductor_nocturno_nombre || '',
        conductor_nocturno_dni: editData.conductor_nocturno_dni || '',
        // Fecha y hora
        fecha_cita: editData.fecha_cita || new Date().toISOString().split('T')[0],
        hora_cita: editData.hora_cita?.substring(0, 5) || '10:00',
        // A CARGO - campos
        tipo_candidato_cargo: (isCargo ? (editData.tipo_candidato || '') : '') as TipoCandidato,
        documento_cargo: (isCargo ? (editData.tipo_documento || '') : '') as TipoDocumento,
        zona_cargo: isCargo ? (editData.zona || '') : '',
        distancia_cargo: isCargo ? (editData.distancia_minutos || '') : '',
        // DIURNO - campos
        tipo_candidato_diurno: (editData.tipo_candidato_diurno || '') as TipoCandidato,
        documento_diurno: (editData.documento_diurno || '') as TipoDocumento,
        zona_diurno: editData.zona_diurno || '',
        distancia_diurno: editData.distancia_diurno || '',
        // NOCTURNO - campos
        tipo_candidato_nocturno: (editData.tipo_candidato_nocturno || '') as TipoCandidato,
        documento_nocturno: (editData.documento_nocturno || '') as TipoDocumento,
        zona_nocturno: editData.zona_nocturno || '',
        distancia_nocturno: editData.distancia_nocturno || '',
        observaciones: editData.observaciones || ''
      }
    }
    // Valores por defecto para crear
    return {
      modalidad: '',
      vehiculo_id: '',
      vehiculo_patente: '',
      vehiculo_modelo: '',
      vehiculo_color: '',
      conductor_id: '',
      conductor_nombre: '',
      conductor_dni: '',
      conductor_diurno_id: '',
    conductor_diurno_nombre: '',
    conductor_diurno_dni: '',
    conductor_nocturno_id: '',
    conductor_nocturno_nombre: '',
    conductor_nocturno_dni: '',
    fecha_cita: new Date().toISOString().split('T')[0],
    hora_cita: '10:00',
    // Campos A CARGO
    tipo_candidato_cargo: '',
    documento_cargo: '',
    zona_cargo: '',
    distancia_cargo: '',
    // Campos DIURNO
    tipo_candidato_diurno: '',
    documento_diurno: '',
    zona_diurno: '',
    distancia_diurno: '',
    // Campos NOCTURNO
    tipo_candidato_nocturno: '',
    documento_nocturno: '',
    zona_nocturno: '',
    distancia_nocturno: '',
    observaciones: ''
    }
  })

  // Cargar vehiculos con informacion de disponibilidad
  useEffect(() => {
    const loadVehicles = async () => {
      try {
        const { data: vehiculosData, error: vehiculosError } = await supabase
          .from('vehiculos')
          .select(`
            id,
            patente,
            marca,
            modelo,
            anio,
            color,
            estado_id,
            vehiculos_estados (
              codigo,
              descripcion
            )
          `)
          .order('patente')

        if (vehiculosError) throw vehiculosError

        // Obtener asignaciones activas y programadas
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

        // Obtener programaciones pendientes
        const { data: programacionesData } = await supabase
          .from('programaciones_onboarding')
          .select('vehiculo_entregar_id')
          .in('estado', ['por_agendar', 'agendado', 'en_curso'])

        const vehiculosProgramados = new Set((programacionesData as any[] || []).map(p => p.vehiculo_entregar_id))

        // Filtrar vehiculos que NO esten en reparacion ni en mantenimiento
        const estadosNoDisponibles = ['REPARACION', 'MANTENIMIENTO', 'TALLER_AXIS', 'TALLER_CHAPA_PINTURA', 'TALLER_ALLIANCE', 'TALLER_KALZALO']
        const vehiculosFiltrados = (vehiculosData || []).filter((v: any) =>
          !estadosNoDisponibles.includes(v.vehiculos_estados?.codigo)
        )

        // Calcular disponibilidad de cada vehiculo
        const vehiculosConDisponibilidad: Vehicle[] = vehiculosFiltrados.map((vehiculo: any) => {
          // Si ya tiene programacion pendiente, no mostrar
          if (vehiculosProgramados.has(vehiculo.id)) {
            return {
              ...vehiculo,
              disponibilidad: 'programado' as const,
              asignacionActiva: undefined
            }
          }

          const asignacionActiva = asignacionesData?.find(
            (a: any) => a.vehiculo_id === vehiculo.id && a.estado === 'activa'
          ) as any

          const asignacionProgramada = asignacionesData?.find(
            (a: any) => a.vehiculo_id === vehiculo.id && a.estado === 'programado'
          )

          if (asignacionProgramada) {
            return {
              ...vehiculo,
              disponibilidad: 'programado' as const,
              asignacionActiva: undefined
            }
          }

          if (!asignacionActiva) {
            return {
              ...vehiculo,
              disponibilidad: 'disponible' as const,
              asignacionActiva: undefined
            }
          }

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

        // Excluir vehiculos programados
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

        // Filtrar conductores activos
        const conductoresActivos = (data || []).filter((c: any) =>
          c.conductores_estados?.codigo?.toLowerCase().includes('activo')
        ) as Conductor[]

        // Verificar asignaciones activas o programadas
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

        const asignacionesActivas = asignacionesActivasRes.data as { conductor_id: string; horario: string }[] | null
        const asignacionesProgramadas = asignacionesProgramadasRes.data as { conductor_id: string; horario: string }[] | null

        const todasAsignaciones = [...(asignacionesActivas || []), ...(asignacionesProgramadas || [])]

        const conductoresConEstado = conductoresActivos.map(conductor => {
          const asignacionesConductor = todasAsignaciones.filter(a => a.conductor_id === conductor.id)
          const tieneAsignacionActiva = asignacionesActivas?.some((a: any) => a.conductor_id === conductor.id) || false
          const tieneAsignacionProgramada = asignacionesProgramadas?.some((a: any) => a.conductor_id === conductor.id) || false
          const tieneAsignacionDiurna = asignacionesConductor.some(a => a.horario === 'diurno')
          const tieneAsignacionNocturna = asignacionesConductor.some(a => a.horario === 'nocturno')
          const tieneAsignacionCargo = asignacionesConductor.some(a => a.horario !== 'diurno' && a.horario !== 'nocturno')
          
          return {
            ...conductor,
            tieneAsignacionActiva,
            tieneAsignacionProgramada,
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
      if (!formData.modalidad) {
        Swal.fire('Error', 'Debes seleccionar una modalidad', 'error')
        return
      }
    } else if (step === 2) {
      if (!formData.vehiculo_id) {
        Swal.fire('Error', 'Debes seleccionar un vehiculo', 'error')
        return
      }
    } else if (step === 3) {
      // Validar conductores segun modalidad
      if (formData.modalidad === 'CARGO') {
        if (!formData.conductor_id) {
          Swal.fire('Error', 'Debes asignar un conductor', 'error')
          return
        }
      } else {
        // Modo TURNO - al menos 1 conductor
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

  const handleSelectModality = (modalidad: 'TURNO' | 'CARGO') => {
    setFormData({
      ...formData,
      modalidad,
      // Reset conductores al cambiar modalidad
      conductor_id: '',
      conductor_nombre: '',
      conductor_dni: '',
      conductor_diurno_id: '',
      conductor_diurno_nombre: '',
      conductor_diurno_dni: '',
      conductor_nocturno_id: '',
      conductor_nocturno_nombre: '',
      conductor_nocturno_dni: ''
    })
  }

  const handleSelectVehicle = (vehicle: Vehicle) => {
    setFormData({
      ...formData,
      vehiculo_id: vehicle.id,
      vehiculo_patente: vehicle.patente,
      vehiculo_modelo: `${vehicle.marca} ${vehicle.modelo}`,
      vehiculo_color: vehicle.color || ''
    })
  }

  // Para modo A CARGO
  const handleSelectConductorCargo = (conductorId: string) => {
    const conductor = conductores.find(c => c.id === conductorId)
    if (conductor) {
      setFormData({
        ...formData,
        conductor_id: conductorId,
        conductor_nombre: `${conductor.nombres} ${conductor.apellidos}`,
        conductor_dni: conductor.numero_dni || ''
      })
    }
  }

  // Para modo TURNO - Diurno
  const handleSelectConductorDiurno = (conductorId: string) => {
    const conductor = conductores.find(c => c.id === conductorId)
    if (conductor) {
      setFormData({
        ...formData,
        conductor_diurno_id: conductorId,
        conductor_diurno_nombre: `${conductor.nombres} ${conductor.apellidos}`,
        conductor_diurno_dni: conductor.numero_dni || ''
      })
    }
  }

  // Para modo TURNO - Nocturno
  const handleSelectConductorNocturno = (conductorId: string) => {
    const conductor = conductores.find(c => c.id === conductorId)
    if (conductor) {
      setFormData({
        ...formData,
        conductor_nocturno_id: conductorId,
        conductor_nocturno_nombre: `${conductor.nombres} ${conductor.apellidos}`,
        conductor_nocturno_dni: conductor.numero_dni || ''
      })
    }
  }

  // Remover conductor de turno
  const handleRemoveConductorTurno = (tipo: 'diurno' | 'nocturno' | 'cargo') => {
    if (tipo === 'diurno') {
      setFormData({
        ...formData,
        conductor_diurno_id: '',
        conductor_diurno_nombre: '',
        conductor_diurno_dni: ''
      })
    } else if (tipo === 'nocturno') {
      setFormData({
        ...formData,
        conductor_nocturno_id: '',
        conductor_nocturno_nombre: '',
        conductor_nocturno_dni: ''
      })
    } else {
      setFormData({
        ...formData,
        conductor_id: '',
        conductor_nombre: '',
        conductor_dni: ''
      })
    }
  }

  const handleSubmit = async () => {
    if (loading) return

    // Validaciones
    if (!formData.fecha_cita) {
      Swal.fire('Error', 'Debes seleccionar una fecha de cita', 'error')
      return
    }

    // Validar campos segun modalidad
    if (formData.modalidad === 'CARGO') {
      if (!formData.tipo_candidato_cargo) {
        Swal.fire('Error', 'Debes seleccionar el tipo de candidato', 'error')
        return
      }
      if (!formData.documento_cargo) {
        Swal.fire('Error', 'Debes seleccionar el tipo de documento', 'error')
        return
      }
      if (!formData.zona_cargo) {
        Swal.fire('Error', 'Debes ingresar la zona', 'error')
        return
      }
    } else {
      // Modo TURNO - validar campos para conductores asignados
      if (formData.conductor_diurno_id) {
        if (!formData.tipo_candidato_diurno) {
          Swal.fire('Error', 'Debes seleccionar el tipo de candidato para el conductor diurno', 'error')
          return
        }
        if (!formData.documento_diurno) {
          Swal.fire('Error', 'Debes seleccionar el documento para el conductor diurno', 'error')
          return
        }
        if (!formData.zona_diurno) {
          Swal.fire('Error', 'Debes ingresar la zona para el conductor diurno', 'error')
          return
        }
      }
      if (formData.conductor_nocturno_id) {
        if (!formData.tipo_candidato_nocturno) {
          Swal.fire('Error', 'Debes seleccionar el tipo de candidato para el conductor nocturno', 'error')
          return
        }
        if (!formData.documento_nocturno) {
          Swal.fire('Error', 'Debes seleccionar el documento para el conductor nocturno', 'error')
          return
        }
        if (!formData.zona_nocturno) {
          Swal.fire('Error', 'Debes ingresar la zona para el conductor nocturno', 'error')
          return
        }
      }
    }

    setLoading(true)

    try {
      // Preparar datos para insertar/actualizar
      const saveData: any = {
        modalidad: formData.modalidad,
        vehiculo_entregar_id: formData.vehiculo_id,
        vehiculo_entregar_patente: formData.vehiculo_patente,
        vehiculo_entregar_modelo: formData.vehiculo_modelo,
        vehiculo_entregar_color: formData.vehiculo_color,
        fecha_cita: formData.fecha_cita,
        hora_cita: formData.hora_cita,
        observaciones: formData.observaciones || null
      }

      if (formData.modalidad === 'CARGO') {
        // A CARGO - usar campos legacy con un solo set de datos
        saveData.conductor_id = formData.conductor_id
        saveData.conductor_nombre = formData.conductor_nombre
        saveData.conductor_dni = formData.conductor_dni
        saveData.tipo_candidato = formData.tipo_candidato_cargo || null
        saveData.tipo_documento = formData.documento_cargo
        saveData.zona = formData.zona_cargo
        saveData.distancia_minutos = formData.distancia_cargo || null
        // Limpiar campos de turno
        saveData.conductor_diurno_id = null
        saveData.conductor_diurno_nombre = null
        saveData.conductor_diurno_dni = null
        saveData.conductor_nocturno_id = null
        saveData.conductor_nocturno_nombre = null
        saveData.conductor_nocturno_dni = null
        saveData.tipo_candidato_diurno = null
        saveData.tipo_candidato_nocturno = null
        saveData.documento_diurno = null
        saveData.documento_nocturno = null
        saveData.zona_diurno = null
        saveData.zona_nocturno = null
        saveData.distancia_diurno = null
        saveData.distancia_nocturno = null
      } else {
        // TURNO - usar campos duales con datos por conductor
        saveData.conductor_diurno_id = formData.conductor_diurno_id || null
        saveData.conductor_diurno_nombre = formData.conductor_diurno_nombre || null
        saveData.conductor_diurno_dni = formData.conductor_diurno_dni || null
        saveData.tipo_candidato_diurno = formData.tipo_candidato_diurno || null
        saveData.documento_diurno = formData.documento_diurno || null
        saveData.zona_diurno = formData.zona_diurno || null
        saveData.distancia_diurno = formData.distancia_diurno || null
        
        saveData.conductor_nocturno_id = formData.conductor_nocturno_id || null
        saveData.conductor_nocturno_nombre = formData.conductor_nocturno_nombre || null
        saveData.conductor_nocturno_dni = formData.conductor_nocturno_dni || null
        saveData.tipo_candidato_nocturno = formData.tipo_candidato_nocturno || null
        saveData.documento_nocturno = formData.documento_nocturno || null
        saveData.zona_nocturno = formData.zona_nocturno || null
        saveData.distancia_nocturno = formData.distancia_nocturno || null
        
        // Zona general = primera zona disponible
        saveData.zona = formData.zona_diurno || formData.zona_nocturno
        // Tipo candidato general = primero disponible
        saveData.tipo_candidato = formData.tipo_candidato_diurno || formData.tipo_candidato_nocturno || null
        // Distancia general = primera disponible
        saveData.distancia_minutos = formData.distancia_diurno || formData.distancia_nocturno || null
        // Limpiar campos legacy
        saveData.conductor_id = null
        saveData.conductor_nombre = null
        saveData.conductor_dni = null
        saveData.tipo_documento = null
      }

      let error
      if (isEditMode && editData) {
        // ACTUALIZAR
        const result = await (supabase
          .from('programaciones_onboarding') as any)
          .update(saveData)
          .eq('id', editData.id)
        error = result.error
      } else {
        // CREAR
        saveData.estado = 'por_agendar'
        saveData.tipo_asignacion = 'entrega_auto'
        saveData.documento_listo = false
        saveData.grupo_whatsapp = false
        saveData.citado_ypf = false
        saveData.created_by = user?.id
        saveData.created_by_name = profile?.full_name || 'Sistema'
        
        const result = await (supabase
          .from('programaciones_onboarding') as any)
          .insert(saveData)
        error = result.error
      }

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: isEditMode ? 'Programacion actualizada' : 'Programacion creada',
        text: isEditMode ? 'Los cambios se guardaron correctamente' : 'La programacion se agrego al tablero correctamente',
        timer: 2000,
        showConfirmButton: false
      })

      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Error guardando programacion:', error)
      Swal.fire('Error', error.message || 'No se pudo guardar la programacion', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Filtrar vehiculos
  const filteredVehicles = vehicles
    .filter(v => {
      const matchesSearch = v.patente.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
        v.marca.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
        v.modelo.toLowerCase().includes(vehicleSearch.toLowerCase())

      const matchesAvailability = vehicleAvailabilityFilter === '' ||
        vehicleAvailabilityFilter === v.disponibilidad ||
        (vehicleAvailabilityFilter === 'con_turno_libre' &&
          (v.disponibilidad === 'turno_diurno_libre' || v.disponibilidad === 'turno_nocturno_libre')) ||
        (vehicleAvailabilityFilter === 'en_uso' &&
          (v.disponibilidad === 'ocupado' || v.disponibilidad === 'turno_diurno_libre' || v.disponibilidad === 'turno_nocturno_libre'))

      return matchesSearch && matchesAvailability
    })
    .sort((a, b) => {
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

  // Obtener conductores seleccionados (buscar en lista o crear objeto temporal con datos del form)
  const conductorDiurno = conductores.find(c => c.id === formData.conductor_diurno_id) || 
    (formData.conductor_diurno_id && formData.conductor_diurno_nombre ? {
      id: formData.conductor_diurno_id,
      nombres: formData.conductor_diurno_nombre.split(' ')[0] || '',
      apellidos: formData.conductor_diurno_nombre.split(' ').slice(1).join(' ') || '',
      numero_dni: formData.conductor_diurno_dni || ''
    } as Conductor : undefined)
  
  const conductorNocturno = conductores.find(c => c.id === formData.conductor_nocturno_id) ||
    (formData.conductor_nocturno_id && formData.conductor_nocturno_nombre ? {
      id: formData.conductor_nocturno_id,
      nombres: formData.conductor_nocturno_nombre.split(' ')[0] || '',
      apellidos: formData.conductor_nocturno_nombre.split(' ').slice(1).join(' ') || '',
      numero_dni: formData.conductor_nocturno_dni || ''
    } as Conductor : undefined)
  
  const conductorCargo = conductores.find(c => c.id === formData.conductor_id) ||
    (formData.conductor_id && formData.conductor_nombre ? {
      id: formData.conductor_id,
      nombres: formData.conductor_nombre.split(' ')[0] || '',
      apellidos: formData.conductor_nombre.split(' ').slice(1).join(' ') || '',
      numero_dni: formData.conductor_dni || ''
    } as Conductor : undefined)

  // Modo TURNO o CARGO
  const isTurnoMode = formData.modalidad === 'TURNO'

  // Filtrar conductores disponibles
  const filteredConductores = conductores
    .filter(c => {
      // Excluir conductores ya seleccionados
      if (c.id === formData.conductor_diurno_id || c.id === formData.conductor_nocturno_id || c.id === formData.conductor_id) return false

      const matchesSearch = c.nombres.toLowerCase().includes(conductorSearch.toLowerCase()) ||
        c.apellidos.toLowerCase().includes(conductorSearch.toLowerCase()) ||
        (c.numero_dni || '').includes(conductorSearch)

      // Filtro por estado
      let matchesStatus = true
      if (conductorStatusFilter === 'disponible') {
        matchesStatus = !c.tieneAsignacionActiva && !c.tieneAsignacionProgramada
      } else if (conductorStatusFilter === 'activo') {
        matchesStatus = c.tieneAsignacionActiva || false
      } else if (conductorStatusFilter === 'con_asignacion') {
        matchesStatus = c.tieneAsignacionActiva || c.tieneAsignacionProgramada || false
      }

      // Filtro por preferencia de turno
      let matchesTurno = true
      if (conductorTurnoFilter === 'diurno') {
        matchesTurno = c.preferencia_turno === 'DIURNO' || c.preferencia_turno === 'SIN_PREFERENCIA'
      } else if (conductorTurnoFilter === 'nocturno') {
        matchesTurno = c.preferencia_turno === 'NOCTURNO' || c.preferencia_turno === 'SIN_PREFERENCIA'
      } else if (conductorTurnoFilter === 'cargo') {
        matchesTurno = c.preferencia_turno === 'A_CARGO'
      }

      return matchesSearch && matchesStatus && matchesTurno
    })
    .sort((a, b) => {
      // Disponibles primero
      if (!a.tieneAsignacionActiva && b.tieneAsignacionActiva) return -1
      if (a.tieneAsignacionActiva && !b.tieneAsignacionActiva) return 1
      return a.apellidos.localeCompare(b.apellidos)
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
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
          backdrop-filter: blur(4px);
        }

        .wizard-container {
          background: white;
          border-radius: 20px;
          width: 100%;
          max-width: 1100px;
          height: 92vh;
          max-height: 800px;
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
          max-height: 400px;
          overflow-y: auto;
          padding-right: 8px;
        }

        .vehicle-grid::-webkit-scrollbar {
          width: 6px;
        }

        .vehicle-grid::-webkit-scrollbar-track {
          background: #F3F4F6;
          border-radius: 3px;
        }

        .vehicle-grid::-webkit-scrollbar-thumb {
          background: #D1D5DB;
          border-radius: 3px;
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
          grid-template-columns: 1fr 1fr 1fr;
          gap: 16px;
          width: 100%;
        }

        .conductores-layout.cargo-mode {
          grid-template-columns: 1fr 1fr;
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
          overflow: hidden;
        }

        .conductores-column.turno-diurno {
          border-color: #FCD34D;
          background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%);
        }

        .conductores-column.turno-nocturno {
          border-color: #93C5FD;
          background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%);
        }

        .conductores-column.a-cargo {
          border-color: #6EE7B7;
          background: linear-gradient(135deg, #F0FDF4 0%, #D1FAE5 100%);
        }

        .turno-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .turno-badge.diurno {
          background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
          color: #92400E;
        }

        .turno-badge.nocturno {
          background: linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%);
          color: #1E40AF;
        }

        .turno-badge.cargo {
          background: linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%);
          color: #065F46;
        }

        .conductores-list {
          flex: 1;
          overflow-y: auto;
          padding-right: 6px;
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

        .conductores-column h4 {
          margin: 0 0 10px 0;
          font-size: clamp(11px, 1vw, 13px);
          font-weight: 700;
          color: #1F2937;
          padding-bottom: 8px;
          border-bottom: 2px solid rgba(0, 0, 0, 0.1);
          flex-shrink: 0;
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
        }

        .conductor-item:hover {
          border-color: #E63946;
          background: #FFF;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
        }

        .conductor-item.dragging {
          opacity: 0.5;
          transform: scale(0.95);
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

        .drop-zone {
          min-height: 80px;
          border: 2px dashed #D1D5DB;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
          transition: all 0.2s ease;
        }

        .drop-zone.drag-over {
          border-color: #E63946;
          background: rgba(230, 57, 70, 0.05);
        }

        .drop-zone.has-conductor {
          border-style: solid;
          border-color: #10B981;
          background: white;
        }

        .drop-zone-empty {
          color: #9CA3AF;
          font-size: 12px;
          text-align: center;
        }

        .assigned-conductor-card {
          width: 100%;
          border: 2px solid #10B981;
          border-radius: 10px;
          padding: 12px;
          background: white;
          display: flex;
          align-items: center;
          gap: 12px;
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

        @media (max-width: 900px) {
          .conductores-layout {
            grid-template-columns: 1fr;
          }
          .conductores-layout.cargo-mode {
            grid-template-columns: 1fr;
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
              <h2 className="wizard-title">{isEditMode ? 'Editar Programacion' : 'Nueva Programacion'}</h2>
              <p className="wizard-subtitle">{isEditMode ? 'Modifica los datos de la programacion' : 'Programa una entrega de vehiculo paso a paso'}</p>
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
                Vehiculo
              </span>
            </div>

            <div className={`step-connector ${step > 2 ? 'completed' : ''}`} />

            <div className="step-item">
              <div className={`step-circle ${step >= 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`}>
                {step > 3 ? <Check size={16} /> : '3'}
              </div>
              <span className={`step-label ${step >= 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`}>
                Conductores
              </span>
            </div>

            <div className={`step-connector ${step > 3 ? 'completed' : ''}`} />

            <div className="step-item">
              <div className={`step-circle ${step >= 4 ? 'active' : ''}`}>4</div>
              <span className={`step-label ${step >= 4 ? 'active' : ''}`}>Detalles</span>
            </div>
          </div>

          {/* Content */}
          <div className="wizard-content">
            {/* Step 1: Modalidad */}
            {step === 1 && (
              <div>
                <div className="step-description">
                  <h3>Paso 1: Selecciona la Modalidad</h3>
                  <p>Que tipo de asignacion sera?</p>
                </div>

                <div className="modality-grid">
                  <div
                    className={`modality-card ${formData.modalidad === 'TURNO' ? 'selected' : ''}`}
                    onClick={() => handleSelectModality('TURNO')}
                  >
                    <div className="modality-icon">
                      <Calendar size={48} />
                    </div>
                    <h4 className="modality-title">Turno</h4>
                    <p className="modality-description">Asignacion por jornada (Diurno y/o Nocturno)</p>
                  </div>

                  <div
                    className={`modality-card ${formData.modalidad === 'CARGO' ? 'selected' : ''}`}
                    onClick={() => handleSelectModality('CARGO')}
                  >
                    <div className="modality-icon">
                      <User size={48} />
                    </div>
                    <h4 className="modality-title">A Cargo</h4>
                    <p className="modality-description">Asignacion permanente a conductor</p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Vehiculo */}
            {step === 2 && (
              <div>
                <div className="step-description">
                  <h3>Paso 2: Selecciona el Vehiculo</h3>
                  <p>Selecciona el vehiculo que se va a entregar</p>
                </div>

                {/* Buscador y Filtro */}
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
                      {vehicleSearch || vehicleAvailabilityFilter ? 'No se encontraron vehiculos con ese criterio' : 'No hay vehiculos disponibles'}
                    </div>
                  ) : (
                    filteredVehicles.map((vehicle) => {
                      let badgeText = ''
                      let badgeBg = ''
                      let badgeColor = ''
                      let detalleText = ''

                      switch (vehicle.disponibilidad) {
                        case 'disponible':
                          badgeText = 'Disponible'
                          badgeBg = '#10B981'
                          badgeColor = 'white'
                          detalleText = 'Libre para asignacion'
                          break
                        case 'turno_diurno_libre':
                          badgeText = 'En Uso'
                          badgeBg = '#F59E0B'
                          badgeColor = 'white'
                          detalleText = 'Diurno Libre'
                          break
                        case 'turno_nocturno_libre':
                          badgeText = 'En Uso'
                          badgeBg = '#F59E0B'
                          badgeColor = 'white'
                          detalleText = 'Nocturno Libre'
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
                              {vehicle.marca} {vehicle.modelo} - {vehicle.anio}
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
                  <p>{isTurnoMode ? 'Arrastra conductores a los turnos Diurno y/o Nocturno' : 'Arrastra un conductor a la zona de A Cargo'}</p>
                </div>

                <div className={`conductores-layout ${!isTurnoMode ? 'cargo-mode' : ''}`}>
                  {/* Conductores Disponibles */}
                  <div className="conductores-column">
                    <h4>Conductores Disponibles</h4>

                    {/* Filtros */}
                    <div style={{ marginBottom: '8px', flexShrink: 0, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        placeholder="Buscar..."
                        value={conductorSearch}
                        onChange={(e) => setConductorSearch(e.target.value)}
                        style={{
                          flex: 1,
                          minWidth: '80px',
                          padding: '6px 8px',
                          border: '1px solid #E5E7EB',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontFamily: 'inherit'
                        }}
                      />
                      <select
                        value={conductorStatusFilter}
                        onChange={(e) => setConductorStatusFilter(e.target.value)}
                        style={{
                          padding: '6px 8px',
                          border: '1px solid #E5E7EB',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontFamily: 'inherit',
                          background: 'white',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">Estado</option>
                        <option value="disponible">Disponible</option>
                        <option value="activo">Activo</option>
                      </select>
                      <select
                        value={conductorTurnoFilter}
                        onChange={(e) => setConductorTurnoFilter(e.target.value)}
                        style={{
                          padding: '6px 8px',
                          border: '1px solid #E5E7EB',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontFamily: 'inherit',
                          background: 'white',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">Turno</option>
                        <option value="diurno">Diurno</option>
                        <option value="nocturno">Nocturno</option>
                        <option value="cargo">A Cargo</option>
                      </select>
                    </div>

                    <div className="conductores-list">
                      {filteredConductores.length === 0 ? (
                        <div className="empty-state" style={{ padding: '16px' }}>
                          {conductorSearch ? 'Sin resultados' : 'Sin conductores'}
                        </div>
                      ) : (
                        filteredConductores.map((conductor) => {
                          const algunoOcupado = conductor.tieneAsignacionDiurna || conductor.tieneAsignacionNocturna
                          let infoMsg = ''
                          if (conductor.tieneAsignacionDiurna && !conductor.tieneAsignacionNocturna) {
                            infoMsg = 'Diurno ocupado'
                          } else if (!conductor.tieneAsignacionDiurna && conductor.tieneAsignacionNocturna) {
                            infoMsg = 'Nocturno ocupado'
                          } else if (algunoOcupado) {
                            infoMsg = 'Ambos ocupados'
                          }

                          return (
                            <div
                              key={conductor.id}
                              className="conductor-item"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('conductorId', conductor.id)
                                e.currentTarget.classList.add('dragging')
                              }}
                              onDragEnd={(e) => {
                                e.currentTarget.classList.remove('dragging')
                              }}
                              style={{
                                background: algunoOcupado ? '#FFFBEB' : undefined,
                                borderColor: algunoOcupado ? '#FCD34D' : undefined
                              }}
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
                                {infoMsg && (
                                  <span style={{
                                    fontSize: '9px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontWeight: '600',
                                    marginTop: '2px',
                                    display: 'inline-block',
                                    background: '#FEF3C7',
                                    color: '#92400E'
                                  }}>
                                    {infoMsg}
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
                          <span className="turno-badge diurno"><Sun size={12} style={{ marginRight: 4 }} />DIURNO</span>
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
                              if (conductor?.tieneAsignacionDiurna) {
                                Swal.fire({
                                  icon: 'info',
                                  title: 'Conductor con asignacion activa',
                                  html: `<b>${conductor.nombres} ${conductor.apellidos}</b> tiene una asignacion activa en turno diurno.`,
                                  confirmButtonText: 'Entendido',
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
                                <p className="conductor-license">
                                  DNI: {conductorDiurno.numero_dni || '-'}
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
                              Arrastra un conductor aqui
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Turno Nocturno */}
                      <div className="conductores-column turno-nocturno">
                        <h4>
                          <span className="turno-badge nocturno"><Moon size={12} style={{ marginRight: 4 }} />NOCTURNO</span>
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
                              if (conductor?.tieneAsignacionNocturna) {
                                Swal.fire({
                                  icon: 'info',
                                  title: 'Conductor con asignacion activa',
                                  html: `<b>${conductor.nombres} ${conductor.apellidos}</b> tiene una asignacion activa en turno nocturno.`,
                                  confirmButtonText: 'Entendido',
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
                                <p className="conductor-license">
                                  DNI: {conductorNocturno.numero_dni || '-'}
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
                              Arrastra un conductor aqui
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
                            if (conductor?.tieneAsignacionDiurna || conductor?.tieneAsignacionNocturna) {
                              Swal.fire({
                                icon: 'info',
                                title: 'Conductor con asignacion activa',
                                html: `<b>${conductor.nombres} ${conductor.apellidos}</b> tiene una asignacion activa.`,
                                confirmButtonText: 'Entendido',
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
                              <p className="conductor-license">
                                DNI: {conductorCargo.numero_dni || '-'}
                              </p>
                            </div>
                            <button
                              className="remove-btn"
                              onClick={() => handleRemoveConductorTurno('cargo')}
                              title="Remover"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        ) : (
                          <div className="drop-zone-empty">
                            Arrastra un conductor aqui
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Detalles */}
            {step === 4 && (
              <div>
                <div className="step-description">
                  <h3>Paso 4: Detalles de la Programacion</h3>
                  <p>Completa la informacion de la cita y documentacion</p>
                </div>

                <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                  {/* Fecha y Hora (compartidos) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                        Fecha de Cita *
                      </label>
                      <input
                        type="date"
                        value={formData.fecha_cita}
                        onChange={(e) => setFormData({ ...formData, fecha_cita: e.target.value })}
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
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                        Hora de Cita *
                      </label>
                      <TimeInput24h
                        value={formData.hora_cita}
                        onChange={(value) => setFormData({ ...formData, hora_cita: value })}
                      />
                    </div>
                  </div>

                  {/* Campos por conductor - Modo A CARGO (un solo set) */}
                  {!isTurnoMode && conductorCargo && (
                    <div style={{
                      marginBottom: '24px',
                      padding: '20px',
                      background: 'linear-gradient(135deg, #F0FDF4 0%, #D1FAE5 100%)',
                      borderRadius: '12px',
                      border: '2px solid #6EE7B7'
                    }}>
                      <h4 style={{ margin: '0 0 16px 0', color: '#065F46', fontSize: '14px', fontWeight: '700' }}>
                        {conductorCargo.nombres} {conductorCargo.apellidos}
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                            Tipo de Candidato *
                          </label>
                          <select
                            value={formData.tipo_candidato_cargo}
                            onChange={(e) => setFormData({ ...formData, tipo_candidato_cargo: e.target.value as TipoCandidato })}
                            style={{ width: '100%', padding: '10px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '12px', background: 'white' }}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="nuevo">Nuevo</option>
                            <option value="antiguo">Antiguo</option>
                            <option value="reingreso">Reingreso</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                            Documento *
                          </label>
                          <select
                            value={formData.documento_cargo}
                            onChange={(e) => setFormData({ ...formData, documento_cargo: e.target.value as TipoDocumento })}
                            style={{ width: '100%', padding: '10px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '12px', background: 'white' }}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="contrato">Contrato</option>
                            <option value="anexo">Anexo</option>
                            <option value="na">N/A</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                            Zona *
                          </label>
                          <input
                            type="text"
                            value={formData.zona_cargo}
                            onChange={(e) => setFormData({ ...formData, zona_cargo: e.target.value })}
                            placeholder="Ej: Norte, CABA..."
                            style={{ width: '100%', padding: '10px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '12px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                            Distancia (minutos)
                          </label>
                          <input
                            type="number"
                            value={formData.distancia_cargo}
                            onChange={(e) => setFormData({ ...formData, distancia_cargo: e.target.value ? parseInt(e.target.value) : '' })}
                            placeholder="Tiempo estimado"
                            style={{ width: '100%', padding: '10px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '12px' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Campos por conductor - Modo TURNO - Diurno */}
                  {isTurnoMode && conductorDiurno && (
                    <div style={{
                      marginBottom: '24px',
                      padding: '20px',
                      background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                      borderRadius: '12px',
                      border: '2px solid #FCD34D'
                    }}>
                      <h4 style={{ margin: '0 0 16px 0', color: '#92400E', fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sun size={16} /> Conductor Diurno: {conductorDiurno.nombres} {conductorDiurno.apellidos}
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                            Tipo de Candidato *
                          </label>
                          <select
                            value={formData.tipo_candidato_diurno}
                            onChange={(e) => setFormData({ ...formData, tipo_candidato_diurno: e.target.value as TipoCandidato })}
                            style={{ width: '100%', padding: '10px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '12px', background: 'white' }}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="nuevo">Nuevo</option>
                            <option value="antiguo">Antiguo</option>
                            <option value="reingreso">Reingreso</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                            Documento *
                          </label>
                          <select
                            value={formData.documento_diurno}
                            onChange={(e) => setFormData({ ...formData, documento_diurno: e.target.value as TipoDocumento })}
                            style={{ width: '100%', padding: '10px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '12px', background: 'white' }}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="contrato">Contrato</option>
                            <option value="anexo">Anexo</option>
                            <option value="na">N/A</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                            Zona *
                          </label>
                          <input
                            type="text"
                            value={formData.zona_diurno}
                            onChange={(e) => setFormData({ ...formData, zona_diurno: e.target.value })}
                            placeholder="Ej: Norte, CABA..."
                            style={{ width: '100%', padding: '10px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '12px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                            Distancia (minutos)
                          </label>
                          <input
                            type="number"
                            value={formData.distancia_diurno}
                            onChange={(e) => setFormData({ ...formData, distancia_diurno: e.target.value ? parseInt(e.target.value) : '' })}
                            placeholder="Tiempo estimado"
                            style={{ width: '100%', padding: '10px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '12px' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Campos por conductor - Modo TURNO - Nocturno */}
                  {isTurnoMode && conductorNocturno && (
                    <div style={{
                      marginBottom: '24px',
                      padding: '20px',
                      background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                      borderRadius: '12px',
                      border: '2px solid #93C5FD'
                    }}>
                      <h4 style={{ margin: '0 0 16px 0', color: '#1E40AF', fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Moon size={16} /> Conductor Nocturno: {conductorNocturno.nombres} {conductorNocturno.apellidos}
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                            Tipo de Candidato *
                          </label>
                          <select
                            value={formData.tipo_candidato_nocturno}
                            onChange={(e) => setFormData({ ...formData, tipo_candidato_nocturno: e.target.value as TipoCandidato })}
                            style={{ width: '100%', padding: '10px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '12px', background: 'white' }}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="nuevo">Nuevo</option>
                            <option value="antiguo">Antiguo</option>
                            <option value="reingreso">Reingreso</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                            Documento *
                          </label>
                          <select
                            value={formData.documento_nocturno}
                            onChange={(e) => setFormData({ ...formData, documento_nocturno: e.target.value as TipoDocumento })}
                            style={{ width: '100%', padding: '10px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '12px', background: 'white' }}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="contrato">Contrato</option>
                            <option value="anexo">Anexo</option>
                            <option value="na">N/A</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                            Zona *
                          </label>
                          <input
                            type="text"
                            value={formData.zona_nocturno}
                            onChange={(e) => setFormData({ ...formData, zona_nocturno: e.target.value })}
                            placeholder="Ej: Norte, CABA..."
                            style={{ width: '100%', padding: '10px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '12px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                            Distancia (minutos)
                          </label>
                          <input
                            type="number"
                            value={formData.distancia_nocturno}
                            onChange={(e) => setFormData({ ...formData, distancia_nocturno: e.target.value ? parseInt(e.target.value) : '' })}
                            placeholder="Tiempo estimado"
                            style={{ width: '100%', padding: '10px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '12px' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Observaciones */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                      Observaciones
                    </label>
                    <textarea
                      value={formData.observaciones}
                      onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                      placeholder="Notas adicionales..."
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '2px solid #E5E7EB',
                        borderRadius: '8px',
                        fontSize: '13px',
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
              {step === 1 ? 'Cancelar' : 'Atras'}
            </button>
            
            {step < 4 ? (
              <button
                className="btn btn-primary"
                onClick={handleNext}
              >
                Siguiente <ChevronRight size={18} />
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? 'Guardando...' : (isEditMode ? 'Guardar Cambios' : 'Crear Programacion')}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
