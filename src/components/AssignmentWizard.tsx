// src/components/AssignmentWizard.tsx
import { useState, useEffect } from 'react'
import { X, Calendar, User, ChevronRight, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
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
}

interface Conductor {
  id: string
  numero_licencia: string
  nombres: string
  apellidos: string
  licencia_vencimiento: string
  estado_id: string
  conductores_estados?: {
    codigo: string
    descripcion: string
  }
  tieneAsignacionActiva?: boolean
}

interface AssignmentData {
  modalidad: 'dia_completo' | 'medio_dia' | 'por_horas' | 'semanal' | 'mensual' | ''
  horario: 'TURNO' | 'CARGO' | ''  // TURNO = modo con pares de conductores
  vehiculo_id: string
  conductores_ids: string[]
  conductor_diurno_id: string  // Para modo Turno
  conductor_nocturno_id: string  // Para modo Turno
  fecha_programada: string  // Fecha cuando se entregará el vehículo
  // Distancia compartida para todos
  distancia: string
  // Datos para conductor diurno
  documento_diurno: 'CONTRATO' | 'ANEXO' | 'N/A' | ''
  ubicacion_diurno: string
  // Datos para conductor nocturno
  documento_nocturno: 'CONTRATO' | 'ANEXO' | 'N/A' | ''
  ubicacion_nocturno: string
  // Datos para conductor A CARGO
  documento_cargo: 'CONTRATO' | 'ANEXO' | 'N/A' | ''
  ubicacion_cargo: string
  notas: string
}

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export function AssignmentWizard({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState(1)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [conductores, setConductores] = useState<Conductor[]>([])
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState<AssignmentData>({
    modalidad: '',
    horario: '',
    vehiculo_id: '',
    conductores_ids: [],
    conductor_diurno_id: '',
    conductor_nocturno_id: '',
    fecha_programada: new Date().toISOString().split('T')[0],
    distancia: '',
    documento_diurno: '',
    ubicacion_diurno: '',
    documento_nocturno: '',
    ubicacion_nocturno: '',
    documento_cargo: '',
    ubicacion_cargo: '',
    notas: ''
  })

  // Cargar vehículos disponibles
  useEffect(() => {
    const loadVehicles = async () => {
      try {
        const { data, error } = await supabase
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

        if (error) throw error

        // Cargar TODOS los vehículos (sin filtrar por estado)
        const todosVehiculos = (data || []) as Vehicle[]

        console.log('📋 Todos los vehículos cargados:', todosVehiculos)

        setVehicles(todosVehiculos)
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
            nombres,
            apellidos,
            licencia_vencimiento,
            estado_id,
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

        // Verificar qué conductores tienen asignaciones activas
        const { data: asignacionesActivas, error: asignacionesError } = await supabase
          .from('asignaciones_conductores')
          .select('conductor_id, asignaciones!inner(estado)')
          .eq('asignaciones.estado', 'activa') as { data: { conductor_id: string }[] | null; error: any }

        if (asignacionesError) {
          console.error('Error verificando asignaciones:', asignacionesError)
        }

        // Marcar conductores con asignación activa
        const conductoresConEstado = conductoresActivos.map(conductor => ({
          ...conductor,
          tieneAsignacionActiva: asignacionesActivas?.some((a: any) => a.conductor_id === conductor.id) || false
        }))

        console.log('👥 Conductores cargados:', data)
        console.log('✅ Conductores con estado:', conductoresConEstado)

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
    }
    setStep(step + 1)
  }

  const handleBack = () => {
    setStep(step - 1)
  }

  const handleSelectModality = (modalidad: AssignmentData['modalidad'], horario: AssignmentData['horario']) => {
    setFormData({ ...formData, modalidad, horario })
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
      const { data: asignacion, error: asignacionError } = await supabase
        .from('asignaciones')
        .insert({
          vehiculo_id: formData.vehiculo_id,
          conductor_id: conductorPrincipalId,
          fecha_programada: new Date(formData.fecha_programada).toISOString(),
          modalidad: formData.modalidad,
          horario: formData.horario,
          estado: 'programado',  // Estado inicial PROGRAMADO
          notas: formData.notas,
          codigo: codigoAsignacion,
          created_by: user?.id
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
          border-radius: 20px;
          width: 100%;
          max-width: 1100px;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }

        .wizard-header {
          padding: 28px 40px;
          border-bottom: 1px solid #E5E7EB;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: linear-gradient(to bottom, #FFFFFF 0%, #F9FAFB 100%);
        }

        .wizard-title {
          margin: 0;
          font-size: 26px;
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.5px;
        }

        .wizard-subtitle {
          margin: 6px 0 0 0;
          font-size: 14px;
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
          padding: 36px 32px;
          background: white;
          border-bottom: 1px solid #E5E7EB;
        }

        .step-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          position: relative;
        }

        .step-circle {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 18px;
          border: 3px solid #E5E7EB;
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
          font-size: 13px;
          font-weight: 600;
          color: #9CA3AF;
          white-space: nowrap;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .step-label.active {
          color: #E63946;
        }

        .step-label.completed {
          color: #10B981;
        }

        .step-connector {
          width: 140px;
          height: 3px;
          background: #E5E7EB;
          margin: 0 20px;
          margin-bottom: 42px;
          border-radius: 2px;
          transition: all 0.3s ease;
        }

        .step-connector.completed {
          background: #10B981;
        }

        .wizard-content {
          flex: 1;
          overflow-y: auto;
          padding: 40px 48px;
          background: #FAFBFC;
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
          font-size: 20px;
          font-weight: 700;
          color: #1F2937;
          margin: 0 0 8px 0;
        }

        .modality-description {
          font-size: 13px;
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
          font-size: 17px;
          font-weight: 700;
          color: #111827;
          margin: 0 0 6px 0;
          letter-spacing: 0.5px;
        }

        .vehicle-details {
          font-size: 13px;
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
          gap: 24px;
          max-height: 450px;
        }

        .conductores-layout.turno-mode {
          grid-template-columns: 1fr 1fr 1fr;
          gap: 20px;
        }

        .conductores-column {
          border: 2px solid #E5E7EB;
          border-radius: 16px;
          padding: 20px;
          overflow-y: auto;
          background: white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }

        .conductores-column.turno-diurno {
          border-color: #FBBF24;
          background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%);
          box-shadow: 0 4px 12px rgba(251, 191, 36, 0.15);
        }

        .conductores-column.turno-nocturno {
          border-color: #3B82F6;
          background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
        }

        .conductores-column.a-cargo {
          border-color: #10B981;
          background: linear-gradient(135deg, #F0FDF4 0%, #D1FAE5 100%);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15);
        }

        .conductores-column h4 {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 700;
          color: #1F2937;
          position: sticky;
          top: 0;
          background: transparent;
          padding-bottom: 12px;
          border-bottom: 2px solid rgba(0, 0, 0, 0.1);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .turno-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
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
          border: 2px solid #E5E7EB;
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          gap: 12px;
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
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
          transform: translateX(4px);
        }

        .conductor-item.selected {
          border-color: #E63946;
          background: linear-gradient(to right, #FEF2F2 0%, #FFF 100%);
        }

        .conductor-item.in-turno {
          background: #FEFEFE;
        }

        .conductor-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 14px;
          color: #6B7280;
          flex-shrink: 0;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .conductor-info {
          flex: 1;
          min-width: 0;
        }

        .conductor-name {
          font-size: 14px;
          font-weight: 600;
          color: #111827;
          margin: 0 0 4px 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .conductor-license {
          font-size: 12px;
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
          margin-bottom: 40px;
        }

        .step-description h3 {
          font-size: 22px;
          font-weight: 700;
          color: #1F2937;
          margin: 0 0 12px 0;
        }

        .step-description p {
          font-size: 14px;
          color: #6B7280;
          margin: 0;
          line-height: 1.6;
        }

        .empty-state {
          text-align: center;
          padding: 32px;
          color: #9CA3AF;
          font-size: 14px;
        }

        .drop-zone {
          border: 3px dashed rgba(0, 0, 0, 0.15);
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          min-height: 110px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.6);
          margin-bottom: 16px;
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
          transform: scale(1.02);
          box-shadow: 0 4px 12px rgba(230, 57, 70, 0.15);
        }

        .drop-zone-empty {
          color: #9CA3AF;
          font-size: 13px;
          font-weight: 500;
        }

        .assigned-conductor-card {
          width: 100%;
          border: 2px solid #E63946;
          border-radius: 12px;
          padding: 16px;
          background: white;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 4px 12px rgba(230, 57, 70, 0.15);
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

          .conductores-layout {
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

                <div className="vehicle-grid">
                  {vehicles.length === 0 ? (
                    <div className="empty-state">
                      No hay vehículos disponibles en este momento
                    </div>
                  ) : (
                    vehicles.map((vehicle) => (
                      <div
                        key={vehicle.id}
                        className={`vehicle-card ${formData.vehiculo_id === vehicle.id ? 'selected' : ''}`}
                        onClick={() => handleSelectVehicle(vehicle)}
                      >
                        <div className="vehicle-info">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <h4 className="vehicle-patente" style={{ margin: 0 }}>{vehicle.patente}</h4>
                            <span style={{
                              background: vehicle.vehiculos_estados?.codigo === 'DISPONIBLE' ? '#10B981' :
                                         vehicle.vehiculos_estados?.codigo === 'EN_USO' ? '#F59E0B' : '#6B7280',
                              color: 'white',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>
                              {vehicle.vehiculos_estados?.descripcion || 'N/A'}
                            </span>
                          </div>
                          <p className="vehicle-details">
                            {vehicle.marca} {vehicle.modelo} • {vehicle.anio}
                          </p>
                        </div>
                        <div className={`radio-circle ${formData.vehiculo_id === vehicle.id ? 'selected' : ''}`} />
                      </div>
                    ))
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
                    {availableConductores.length === 0 ? (
                      <div className="empty-state">
                        No hay conductores disponibles
                      </div>
                    ) : (
                      availableConductores.map((conductor) => (
                        <div
                          key={conductor.id}
                          className="conductor-item"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('conductorId', conductor.id)
                            e.dataTransfer.effectAllowed = 'move'
                          }}
                          style={{ cursor: 'grab' }}
                        >
                          <div className="conductor-avatar">
                            {conductor.nombres.charAt(0)}{conductor.apellidos.charAt(0)}
                          </div>
                          <div className="conductor-info">
                            <p className="conductor-name">
                              {conductor.nombres} {conductor.apellidos}
                            </p>
                            <p className="conductor-license">Lic: {conductor.numero_licencia}</p>
                            <span style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: '600',
                              marginTop: '4px',
                              display: 'inline-block',
                              background: conductor.tieneAsignacionActiva ? '#FEE2E2' : '#D1FAE5',
                              color: conductor.tieneAsignacionActiva ? '#991B1B' : '#065F46'
                            }}>
                              {conductor.tieneAsignacionActiva ? 'Asignado' : 'Disponible'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
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
                                <p className="conductor-license">Lic: {conductorDiurno.numero_licencia}</p>
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
                                <p className="conductor-license">Lic: {conductorNocturno.numero_licencia}</p>
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
                              <p className="conductor-license">Lic: {conductorCargo.numero_licencia}</p>
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
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#374151',
                      marginBottom: '8px'
                    }}>
                      Fecha Programada de Entrega *
                    </label>
                    <input
                      type="date"
                      value={formData.fecha_programada}
                      onChange={(e) => setFormData({ ...formData, fecha_programada: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '2px solid #E5E7EB',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontFamily: 'inherit'
                      }}
                    />
                    <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                      Fecha en la que se entregará el vehículo al conductor
                    </p>
                  </div>

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
                          <option value="CONTRATO">CONTRATO</option>
                          <option value="ANEXO">ANEXO</option>
                          <option value="N/A">N/A</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                          Ubicación *
                        </label>
                        <input
                          type="text"
                          value={formData.ubicacion_diurno}
                          onChange={(e) => setFormData({ ...formData, ubicacion_diurno: e.target.value })}
                          placeholder="Ingrese la ubicación"
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
                          <option value="CONTRATO">CONTRATO</option>
                          <option value="ANEXO">ANEXO</option>
                          <option value="N/A">N/A</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                          Ubicación *
                        </label>
                        <input
                          type="text"
                          value={formData.ubicacion_nocturno}
                          onChange={(e) => setFormData({ ...formData, ubicacion_nocturno: e.target.value })}
                          placeholder="Ingrese la ubicación"
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
                          <option value="CONTRATO">CONTRATO</option>
                          <option value="ANEXO">ANEXO</option>
                          <option value="N/A">N/A</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                          Ubicación *
                        </label>
                        <input
                          type="text"
                          value={formData.ubicacion_cargo}
                          onChange={(e) => setFormData({ ...formData, ubicacion_cargo: e.target.value })}
                          placeholder="Ingrese la ubicación"
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
