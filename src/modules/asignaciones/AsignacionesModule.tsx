// src/modules/asignaciones/AsignacionesModule.tsx
import { useState, useEffect } from 'react'
import { Eye, Trash2, Plus, Search, Filter, CheckCircle, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import { AssignmentWizard } from '../../components/AssignmentWizard'
import Swal from 'sweetalert2'

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

export function AsignacionesModule() {
  const { canCreateInMenu, canEditInMenu, canDeleteInMenu } = usePermissions()

  // Permisos específicos para el menú de asignaciones
  const canCreate = canCreateInMenu('asignaciones')
  const canEdit = canEditInMenu('asignaciones')
  const canDelete = canDeleteInMenu('asignaciones')

  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
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

  // Cargar asignaciones desde Supabase
  const loadAsignaciones = async () => {
    try {
      setLoading(true)

      // ✅ OPTIMIZADO: Una sola query con todos los JOINs (31 queries → 1 query)
      const { data, error } = await supabase
        .from('asignaciones')
        .select(`
          *,
          vehiculos (
            patente,
            marca,
            modelo
          ),
          conductores (
            nombres,
            apellidos,
            numero_licencia
          ),
          asignaciones_conductores (
            id,
            conductor_id,
            estado,
            horario,
            confirmado,
            fecha_confirmacion,
            conductores (
              nombres,
              apellidos,
              numero_licencia
            )
          )
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error en query principal:', error)
        throw error
      }

      // Los datos ya vienen completos con todas las relaciones
      setAsignaciones(data || [])
    } catch (error: any) {
      console.error('Error loading asignaciones:', error)
      Swal.fire('Error', error.message || 'Error al cargar las asignaciones', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAsignaciones()
    // Obtener usuario actual
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)
    }
    getCurrentUser()
  }, [])

  const handleDelete = async (id: string) => {
    if (isSubmitting) return // Prevenir doble click

    if (!canDelete) {
      Swal.fire({
        icon: 'error',
        title: 'Sin permisos',
        text: 'No tienes permisos para eliminar asignaciones'
      })
      return
    }

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
        // 0. Obtener la asignación antes de eliminarla (para actualizar vehículo)
        const asignacion = asignaciones.find(a => a.id === id)

        // 1. Obtener IDs de asignaciones_conductores para eliminar turnos ocupados
        const { data: conductoresAsignados, error: fetchConductoresError } = (await supabase
          .from('asignaciones_conductores')
          .select('id')
          .eq('asignacion_id', id)) as { data: { id: string }[] | null; error: any }

        if (fetchConductoresError) throw fetchConductoresError

        // 2. Eliminar registros de vehiculos_turnos_ocupados
        if (conductoresAsignados && conductoresAsignados.length > 0) {
          const conductorIds = conductoresAsignados.map(c => c.id)
          const { error: turnosError } = await supabase
            .from('vehiculos_turnos_ocupados')
            .delete()
            .in('asignacion_conductor_id', conductorIds)

          if (turnosError) throw turnosError
        }

        // 3. Eliminar registros de asignaciones_conductores
        const { error: conductoresError } = await supabase
          .from('asignaciones_conductores')
          .delete()
          .eq('asignacion_id', id)

        if (conductoresError) throw conductoresError

        // 4. Eliminar la asignación
        const { error: asignacionError } = await supabase
          .from('asignaciones')
          .delete()
          .eq('id', id)

        if (asignacionError) throw asignacionError

        // 5. Actualizar estado del vehículo a "DISPONIBLE"
        if (asignacion?.vehiculo_id) {
          const { data: estadoDisponible, error: estadoError } = await supabase
            .from('vehiculos_estados')
            .select('id')
            .eq('codigo', 'DISPONIBLE')
            .single()

          if (estadoError) {
            console.error('Error al obtener estado DISPONIBLE:', estadoError)
          }

          if (estadoDisponible) {
            const { error: updateError } = (await (supabase as any)
              .from('vehiculos')
              .update({ estado_id: (estadoDisponible as any).id })
              .eq('id', asignacion.vehiculo_id))

            if (updateError) {
              console.error('Error al actualizar estado del vehículo:', updateError)
            } else {
              console.log('✅ Vehículo vuelto a estado DISPONIBLE')
            }
          }
        }

        Swal.fire('Eliminado', 'La asignación ha sido eliminada', 'success')
        loadAsignaciones()
      } catch (error: any) {
        console.error('Error deleting assignment:', error)
        Swal.fire('Error', error.message || 'Error al eliminar la asignación', 'error')
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const filteredAsignaciones = asignaciones.filter(asignacion => {
    const matchesSearch =
      asignacion.codigo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asignacion.vehiculos?.patente.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asignacion.conductores?.nombres.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asignacion.conductores?.apellidos.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = !statusFilter || asignacion.estado === statusFilter

    return matchesSearch && matchesStatus
  })

  // Confirmar programación (PROGRAMADO → ACTIVA solo cuando TODOS confirman)
  const handleConfirmProgramacion = async () => {
    if (isSubmitting) return // Prevenir doble click

    if (!selectedAsignacion || conductoresToConfirm.length === 0) {
      Swal.fire('Error', 'Debes seleccionar al menos un conductor para confirmar', 'warning')
      return
    }

    setIsSubmitting(true)
    try {
      const ahora = new Date().toISOString()
      const fechaProgramada = selectedAsignacion.fecha_programada ? new Date(selectedAsignacion.fecha_programada).toISOString().split('T')[0] : null

      // 1. Marcar como confirmados los conductores seleccionados
      const { error: updateConductoresError } = (await (supabase as any)
        .from('asignaciones_conductores')
        .update({
          confirmado: true,
          fecha_confirmacion: ahora,
          fecha_inicio: ahora
        })
        .in('id', conductoresToConfirm))

      if (updateConductoresError) throw updateConductoresError

      // 2. Verificar si TODOS los conductores han confirmado
      const { data: allConductores, error: conductoresError } = await supabase
        .from('asignaciones_conductores')
        .select('id, conductor_id, confirmado, horario')
        .eq('asignacion_id', selectedAsignacion.id)

      if (conductoresError) throw conductoresError

      const todosConfirmados = (allConductores as any)?.every((c: any) => c.confirmado === true) || false

      // 3. Si TODOS confirmaron, activar la asignación
      if (todosConfirmados) {
        // Obtener IDs de los conductores de esta asignación
        const conductoresIds = (allConductores as any)?.map((c: any) => c.conductor_id) || []

        // PRIMERO: Cerrar todas las asignaciones ACTIVAS del mismo vehículo
        const { data: asignacionesACerrar } = await supabase
          .from('asignaciones')
          .select('id, vehiculo_id')
          .eq('vehiculo_id', selectedAsignacion.vehiculo_id)
          .eq('estado', 'activa')
          .neq('id', selectedAsignacion.id)

        if (asignacionesACerrar && asignacionesACerrar.length > 0) {
          // Cerrar las asignaciones
          await supabase
            .from('asignaciones')
            // @ts-ignore
            .update({
              estado: 'finalizada',
              fecha_fin: ahora,
              notas: `[AUTO-CERRADA] Asignación cerrada automáticamente al activar nueva asignación.`
            })
            .in('id', asignacionesACerrar.map((a: any) => a.id))

          // Liberar los vehículos a DISPONIBLE
          const { data: estadoDisponible } = await (supabase
            .from('vehiculos_estados') as any)
            .select('id')
            .eq('codigo', 'DISPONIBLE')
            .single()

          if (estadoDisponible) {
            const vehiculosACambiar = [...new Set(asignacionesACerrar.map((a: any) => a.vehiculo_id))]
            await (supabase
              .from('vehiculos') as any)
              .update({ estado_id: estadoDisponible.id })
              .in('id', vehiculosACambiar)
          }
        }

        // SEGUNDO: Marcar conductores como cancelado en otras asignaciones
        if (conductoresIds.length > 0) {
          for (const conductorId of conductoresIds) {
            await (supabase
              .from('asignaciones_conductores') as any)
              .update({
                estado: 'cancelado',
                fecha_fin: ahora
              })
              .eq('conductor_id', conductorId)
              .eq('estado', 'asignado')
              .neq('asignacion_id', selectedAsignacion.id)
          }
        }

        // TERCERO: Activar la nueva asignación confirmada
        const { error: updateAsignacionError } = (await (supabase as any)
          .from('asignaciones')
          .update({
            estado: 'activa',
            fecha_inicio: ahora,
            notas: confirmComentarios ? `${selectedAsignacion.notas || ''}\n\n[CONFIRMACIÓN COMPLETA] ${confirmComentarios}` : selectedAsignacion.notas
          })
          .eq('id', selectedAsignacion.id))

        if (updateAsignacionError) throw updateAsignacionError

        // 4. Primero eliminar turnos ocupados existentes para este vehículo y fecha
        // Esto previene el error de duplicate key si ya existen registros
        if (fechaProgramada) {
          await supabase
            .from('vehiculos_turnos_ocupados')
            .delete()
            .eq('vehiculo_id', selectedAsignacion.vehiculo_id)
            .eq('fecha', fechaProgramada)
        }

        // 5. Insertar registros en vehiculos_turnos_ocupados para todos los conductores
        const turnosOcupadosData = (allConductores as any)?.map((ac: any) => ({
          vehiculo_id: selectedAsignacion.vehiculo_id,
          fecha: fechaProgramada,
          horario: ac.horario,
          asignacion_conductor_id: ac.id,
          estado: 'activo'
        })) || []

        if (turnosOcupadosData.length > 0) {
          const { error: turnosError } = await supabase
            .from('vehiculos_turnos_ocupados')
            .insert(turnosOcupadosData)

          if (turnosError) throw turnosError
        }

        // 6. Determinar si el vehículo debe cambiar a EN_USO
        const { data: turnosActivos, error: turnosActivosError } = await supabase
          .from('vehiculos_turnos_ocupados')
          .select('horario')
          .eq('vehiculo_id', selectedAsignacion.vehiculo_id)
          .eq('fecha', fechaProgramada as string)
          .eq('estado', 'activo')

        if (turnosActivosError) throw turnosActivosError

        let debeEstarEnUso = false
        const tieneTodoDia = turnosActivos?.some((t: any) => t.horario === 'todo_dia')
        const tieneDiurno = turnosActivos?.some((t: any) => t.horario === 'diurno')
        const tieneNocturno = turnosActivos?.some((t: any) => t.horario === 'nocturno')

        if (tieneTodoDia || (tieneDiurno && tieneNocturno)) {
          debeEstarEnUso = true
        }

        // 7. Actualizar estado del vehículo
        if (debeEstarEnUso) {
          const { data: estadoEnUso, error: estadoError } = await supabase
            .from('vehiculos_estados')
            .select('id')
            .eq('codigo', 'EN_USO')
            .single()

          if (estadoError) throw estadoError

          if (estadoEnUso) {
            const { error: vehiculoError } = (await (supabase as any)
              .from('vehiculos')
              .update({ estado_id: (estadoEnUso as any).id })
              .eq('id', selectedAsignacion.vehiculo_id))

            if (vehiculoError) throw vehiculoError
          }

          Swal.fire('Confirmado', 'Todos los conductores han confirmado. La asignación está ACTIVA y el vehículo EN USO.', 'success')
        } else {
          Swal.fire('Confirmado', 'Todos los conductores han confirmado. La asignación está ACTIVA.', 'success')
        }
      } else {
        // No todos han confirmado, solo actualizar nota
        const pendientes = (allConductores as any)?.filter((c: any) => !c.confirmado).length || 0
        const { error: updateNotaError } = (await (supabase as any)
          .from('asignaciones')
          .update({
            notas: confirmComentarios ? `${selectedAsignacion.notas || ''}\n\n[CONFIRMACIÓN PARCIAL] ${confirmComentarios}` : selectedAsignacion.notas
          })
          .eq('id', selectedAsignacion.id))

        if (updateNotaError) throw updateNotaError

        Swal.fire('Confirmación Parcial', `${conductoresToConfirm.length} conductor(es) confirmado(s). Faltan ${pendientes} por confirmar. La asignación permanece en PROGRAMADO.`, 'info')
      }

      setShowConfirmModal(false)
      setConfirmComentarios('')
      setConductoresToConfirm([])
      setSelectedAsignacion(null)
      loadAsignaciones()
    } catch (error: any) {
      console.error('Error confirmando programación:', error)
      Swal.fire('Error', error.message || 'Error al confirmar la programación', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Cancelar programación completa
  const handleCancelProgramacion = async () => {
    if (isSubmitting) return // Prevenir doble click

    if (!selectedAsignacion || !cancelMotivo.trim()) {
      Swal.fire('Error', 'Debes ingresar un motivo de cancelación', 'warning')
      return
    }

    setIsSubmitting(true)
    try {
      // 1. Marcar todos los conductores como no confirmados
      const { error: conductoresError } = (await (supabase as any)
        .from('asignaciones_conductores')
        .update({
          confirmado: false,
          fecha_confirmacion: null
        })
        .eq('asignacion_id', selectedAsignacion.id))

      if (conductoresError) throw conductoresError

      // 2. Actualizar estado de la asignación
      const { error } = (await (supabase as any)
        .from('asignaciones')
        .update({
          estado: 'cancelada',
          notas: `${selectedAsignacion.notas || ''}\n\n[CANCELADA] Motivo: ${cancelMotivo}`
        })
        .eq('id', selectedAsignacion.id))

      if (error) throw error

      // 3. Liberar el vehículo
      const { data: estadoDisponible, error: estadoError } = await supabase
        .from('vehiculos_estados')
        .select('id')
        .eq('codigo', 'DISPONIBLE')
        .single()

      if (!estadoError && estadoDisponible) {
        await (supabase as any)
          .from('vehiculos')
          .update({ estado_id: (estadoDisponible as any).id })
          .eq('id', selectedAsignacion.vehiculo_id)
      }

      Swal.fire('Cancelada', 'La programación ha sido cancelada y el vehículo liberado', 'success')
      setShowCancelModal(false)
      setCancelMotivo('')
      setSelectedAsignacion(null)
      loadAsignaciones()
    } catch (error: any) {
      console.error('Error cancelando programación:', error)
      Swal.fire('Error', error.message || 'Error al cancelar la programación', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Desconfirmar conductor individual (permitir edición)
  const handleUnconfirmConductor = async (conductorAsignacionId: string) => {
    try {
      const { error } = (await (supabase as any)
        .from('asignaciones_conductores')
        .update({
          confirmado: false,
          fecha_confirmacion: null
        })
        .eq('id', conductorAsignacionId))

      if (error) throw error

      Swal.fire('Actualizado', 'El conductor ha sido desconfirmado. Puedes asignar un reemplazo.', 'success')
      loadAsignaciones()
    } catch (error: any) {
      console.error('Error desconfirmando conductor:', error)
      Swal.fire('Error', error.message || 'Error al desconfirmar conductor', 'error')
    }
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'programado':
        return 'badge-programado'
      case 'activa':
        return 'badge-active'
      case 'finalizada':
        return 'badge-completed'
      case 'cancelada':
        return 'badge-cancelled'
      default:
        return ''
    }
  }


  const getModalityBadgeClass = (modality: string) => {
    switch (modality) {
      case 'dia_completo':
        return 'badge-dia-completo'
      case 'medio_dia':
        return 'badge-medio-dia'
      case 'por_horas':
        return 'badge-por-horas'
      case 'semanal':
        return 'badge-semanal'
      case 'mensual':
        return 'badge-mensual'
      default:
        return ''
    }
  }

  const getModalityLabel = (modality: string) => {
    switch (modality) {
      case 'dia_completo':
        return 'Día Completo'
      case 'medio_dia':
        return 'Medio Día'
      case 'por_horas':
        return 'Por Horas'
      case 'semanal':
        return 'Semanal'
      case 'mensual':
        return 'Mensual'
      default:
        return modality
    }
  }

  const getHorarioBadgeClass = (horario: string) => {
    switch (horario) {
      case 'TURNO':
        return 'badge-turno'
      case 'CARGO':
        return 'badge-cargo'
      default:
        return ''
    }
  }

  return (
    <div>
      <style>{`
        .search-wrapper {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .search-input-container {
          position: relative;
          flex: 1;
          min-width: 250px;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #9CA3AF;
        }

        .search-input {
          width: 100%;
          padding: 10px 12px 10px 40px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
        }

        .search-input:focus {
          outline: none;
          border-color: #E63946;
        }

        .filter-select-container {
          position: relative;
          min-width: 200px;
        }

        .filter-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #9CA3AF;
        }

        .filter-select {
          width: 100%;
          padding: 10px 12px 10px 40px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
          background: white;
          cursor: pointer;
        }

        .filter-select:focus {
          outline: none;
          border-color: #E63946;
        }

        .table-wrapper {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 12px;
          border: 1px solid #E5E7EB;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }

        .assignments-table {
          width: 100%;
          border-collapse: collapse;
          background: white;
          min-width: 1200px;
        }

        .assignments-table th {
          text-align: center;
          padding: 12px;
          background: #F9FAFB;
          font-size: 12px;
          font-weight: 600;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #E5E7EB;
          white-space: nowrap;
        }

        .assignments-table th:last-child {
          text-align: center;
        }

        .assignments-table td {
          padding: 16px 12px;
          border-bottom: 1px solid #E5E7EB;
          color: #1F2937;
          font-size: 14px;
          text-align: center;
        }

        .assignments-table td:last-child {
          text-align: center;
        }

        .assignments-table tr:hover {
          background: #F9FAFB;
        }

        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }

        .badge-programado {
          background: #FEF3C7;
          color: #92400E;
        }

        .badge-active {
          background: #D1FAE5;
          color: #065F46;
        }

        .badge-completed {
          background: #E0E7FF;
          color: #3730A3;
        }

        .badge-cancelled {
          background: #FEE2E2;
          color: #991B1B;
        }

        .badge-dia-completo {
          background: #DBEAFE;
          color: #1E40AF;
        }

        .badge-medio-dia {
          background: #E9D5FF;
          color: #6B21A8;
        }

        .badge-por-horas {
          background: #FED7AA;
          color: #9A3412;
        }

        .badge-semanal {
          background: #D1FAE5;
          color: #065F46;
        }

        .badge-mensual {
          background: #C7D2FE;
          color: #3730A3;
        }

        .badge-turno {
          background: #FEF3C7;
          color: #92400E;
        }

        .badge-cargo {
          background: #E9D5FF;
          color: #6B21A8;
        }

        .btn-action {
          padding: 6px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          background: white;
          color: #1F2937;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          margin: 0 4px;
        }

        .btn-action:hover {
          border-color: #3B82F6;
          color: #3B82F6;
          background: #EFF6FF;
        }

        .btn-action.btn-delete:hover {
          border-color: #E63946;
          color: #E63946;
          background: #FEE2E2;
        }

        .btn-action:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-action:disabled:hover {
          border-color: #E5E7EB;
          color: #1F2937;
          background: white;
        }

        .btn-primary {
          padding: 12px 28px;
          background: #E63946;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 6px rgba(230, 57, 70, 0.2);
        }

        .btn-primary:hover {
          background: #D62828;
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(230, 57, 70, 0.3);
        }

        .btn-primary:disabled {
          background: #D1D5DB;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .status-select {
          padding: 6px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          background: white;
        }

        .status-select:focus {
          outline: none;
          border-color: #E63946;
        }

        .conductores-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .conductor-item {
          font-size: 13px;
          color: #1F2937;
        }

        .loading-state {
          text-align: center;
          padding: 60px 20px;
          color: #6B7280;
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #9CA3AF;
        }

        @media (max-width: 768px) {
          .assignments-table {
            min-width: 1100px;
          }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1F2937' }}>
          Gestión de Asignaciones
        </h3>
        <p style={{ margin: '8px 0 0 0', fontSize: '15px', color: '#6B7280' }}>
          {filteredAsignaciones.length} asignación{filteredAsignaciones.length !== 1 ? 'es' : ''} encontrada{filteredAsignaciones.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Action Button */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn-primary"
          onClick={() => setShowWizard(true)}
          disabled={!canCreate}
          title={!canCreate ? 'No tienes permisos para crear asignaciones' : 'Nueva Asignación'}
        >
          <Plus size={18} />
          Nueva Asignación
        </button>
      </div>

      {/* Filtros y búsqueda */}
      <div className="search-wrapper">
        <div className="search-input-container">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por vehículo, conductor o número..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-select-container">
          <Filter size={18} className="filter-icon" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">Todos los estados</option>
            <option value="activa">Activa</option>
            <option value="finalizada">Finalizada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="loading-state">
          Cargando asignaciones...
        </div>
      )}

      {/* Tabla de asignaciones */}
      {!loading && (
        <>
          <div className="table-wrapper">
            <table className="assignments-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Vehículo</th>
                  <th>Modalidad</th>
                  <th>Conductores</th>
                  <th>Fecha Entrega</th>
                  <th>Fecha Fin</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAsignaciones.map((asignacion) => (
                  <tr key={asignacion.id}>
                    <td>
                      <strong>{asignacion.codigo || 'N/A'}</strong>
                    </td>
                    <td>
                      <strong>{asignacion.vehiculos?.patente || 'N/A'}</strong>
                      <br />
                      <span style={{ fontSize: '12px', color: '#6B7280' }}>
                        {asignacion.vehiculos?.marca} {asignacion.vehiculos?.modelo}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${getHorarioBadgeClass(asignacion.horario)}`}>
                        {asignacion.horario === 'CARGO' ? 'A CARGO' : 'TURNO'}
                      </span>
                    </td>
                    <td>
                      <div className="conductores-list">
                        {asignacion.asignaciones_conductores && asignacion.asignaciones_conductores.length > 0 ? (
                          asignacion.asignaciones_conductores.map((ac) => (
                            <span key={ac.id} className="conductor-item">
                              {ac.conductores.nombres} {ac.conductores.apellidos}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: '#9CA3AF', fontSize: '12px' }}>Sin conductores</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {asignacion.fecha_programada
                        ? new Date(asignacion.fecha_programada).toLocaleDateString('es-ES', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })
                        : 'No definida'}
                    </td>
                    <td>
                      {asignacion.fecha_fin
                        ? new Date(asignacion.fecha_fin).toLocaleDateString('es-ES', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })
                        : 'Sin definir'}
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(asignacion.estado)}`}>
                        {asignacion.estado}
                      </span>
                    </td>
                    <td>
                      {/* Botón Confirmar - solo visible si estado es PROGRAMADO */}
                      {asignacion.estado === 'programado' && (
                        <button
                          onClick={() => {
                            setSelectedAsignacion(asignacion)
                            setShowConfirmModal(true)
                          }}
                          className="btn-action"
                          style={{ background: '#10B981', color: 'white' }}
                          title="Confirmar programación"
                          disabled={!canEdit}
                        >
                          <CheckCircle size={16} style={{ display: 'inline', verticalAlign: 'middle' }} />
                        </button>
                      )}

                      {/* Botón Cancelar - solo visible si estado es PROGRAMADO */}
                      {asignacion.estado === 'programado' && (
                        <button
                          onClick={() => {
                            setSelectedAsignacion(asignacion)
                            setShowCancelModal(true)
                          }}
                          className="btn-action"
                          style={{ background: '#F59E0B', color: 'white' }}
                          title="Cancelar programación"
                          disabled={asignacion.created_by !== currentUserId}
                        >
                          <XCircle size={16} style={{ display: 'inline', verticalAlign: 'middle' }} />
                        </button>
                      )}

                      <button
                        className="btn-action"
                        title="Ver detalles"
                        onClick={() => {
                          setViewAsignacion(asignacion)
                          setShowViewModal(true)
                        }}
                      >
                        <Eye size={16} style={{ display: 'inline', verticalAlign: 'middle' }} />
                      </button>

                      <button
                        onClick={() => handleDelete(asignacion.id)}
                        className="btn-action btn-delete"
                        title="Eliminar"
                        disabled={!canDelete}
                      >
                        <Trash2 size={16} style={{ display: 'inline', verticalAlign: 'middle' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredAsignaciones.length === 0 && !loading && (
            <div className="empty-state">
              No se encontraron asignaciones con los filtros seleccionados.
            </div>
          )}
        </>
      )}

      {/* Wizard Modal */}
      {showWizard && (
        <AssignmentWizard
          onClose={() => setShowWizard(false)}
          onSuccess={() => {
            loadAsignaciones()
            setShowWizard(false)
          }}
        />
      )}

      {/* Modal de Confirmación */}
      {showConfirmModal && selectedAsignacion && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          overflowY: 'auto'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h2 style={{ marginTop: 0 }}>Confirmar Programación</h2>
            <p>Vehículo: <strong>{selectedAsignacion.vehiculos?.patente}</strong></p>
            <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '16px' }}>
              Fecha de entrega: <strong>{selectedAsignacion.fecha_programada ? new Date(selectedAsignacion.fecha_programada).toLocaleDateString('es-AR') : 'N/A'}</strong>
            </p>

            {/* Lista de conductores con checkboxes */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', fontSize: '14px' }}>
                Selecciona los conductores que confirman:
              </label>
              {selectedAsignacion.asignaciones_conductores && selectedAsignacion.asignaciones_conductores.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {selectedAsignacion.asignaciones_conductores.map((ac) => (
                    <label
                      key={ac.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        background: ac.confirmado ? '#D1FAE5' : '#F9FAFB',
                        border: `2px solid ${ac.confirmado ? '#10B981' : '#E5E7EB'}`,
                        borderRadius: '8px',
                        cursor: ac.confirmado ? 'not-allowed' : 'pointer',
                        opacity: ac.confirmado ? 0.7 : 1
                      }}
                    >
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
                        style={{ width: '18px', height: '18px', cursor: ac.confirmado ? 'not-allowed' : 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#1F2937' }}>
                          {ac.conductores.nombres} {ac.conductores.apellidos}
                        </p>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6B7280' }}>
                          {ac.horario !== 'todo_dia' && `Turno: ${ac.horario}`}
                          {ac.confirmado && <span style={{ color: '#10B981', marginLeft: '8px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={14} /> Ya confirmado</span>}
                          {ac.fecha_confirmacion && <span style={{ marginLeft: '8px' }}>el {new Date(ac.fecha_confirmacion).toLocaleDateString('es-AR')}</span>}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#9CA3AF', fontSize: '14px' }}>No hay conductores asignados</p>
              )}
            </div>

            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
              Comentarios (opcional):
            </label>
            <textarea
              value={confirmComentarios}
              onChange={(e) => setConfirmComentarios(e.target.value)}
              rows={4}
              placeholder="Agrega comentarios sobre la confirmación..."
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #E5E7EB',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
                marginBottom: '20px'
              }}
            />

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowConfirmModal(false)
                  setConfirmComentarios('')
                  setConductoresToConfirm([])
                  setSelectedAsignacion(null)
                }}
                style={{
                  padding: '10px 20px',
                  border: '2px solid #E5E7EB',
                  background: 'white',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmProgramacion}
                disabled={conductoresToConfirm.length === 0 || isSubmitting}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  background: (conductoresToConfirm.length > 0 && !isSubmitting) ? '#10B981' : '#D1D5DB',
                  color: 'white',
                  borderRadius: '8px',
                  cursor: (conductoresToConfirm.length > 0 && !isSubmitting) ? 'pointer' : 'not-allowed',
                  fontWeight: '600'
                }}
              >
                {isSubmitting ? 'Procesando...' : 'Confirmar Seleccionados'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cancelación */}
      {showCancelModal && selectedAsignacion && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '500px',
            width: '90%'
          }}>
            <h2 style={{ marginTop: 0 }}>Cancelar Programación</h2>
            <p>¿Estás seguro de cancelar la programación del vehículo <strong>{selectedAsignacion.vehiculos?.patente}</strong>?</p>

            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#DC2626' }}>
              Motivo de cancelación (requerido):
            </label>
            <textarea
              value={cancelMotivo}
              onChange={(e) => setCancelMotivo(e.target.value)}
              rows={4}
              placeholder="Ingresa el motivo de la cancelación..."
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #FCA5A5',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
                marginBottom: '20px'
              }}
            />

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowCancelModal(false)
                  setCancelMotivo('')
                  setSelectedAsignacion(null)
                }}
                style={{
                  padding: '10px 20px',
                  border: '2px solid #E5E7EB',
                  background: 'white',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Volver
              </button>
              <button
                onClick={handleCancelProgramacion}
                disabled={!cancelMotivo.trim() || isSubmitting}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  background: (cancelMotivo.trim() && !isSubmitting) ? '#DC2626' : '#D1D5DB',
                  color: 'white',
                  borderRadius: '8px',
                  cursor: (cancelMotivo.trim() && !isSubmitting) ? 'pointer' : 'not-allowed',
                  fontWeight: '600'
                }}
              >
                {isSubmitting ? 'Procesando...' : 'Cancelar Programación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Visualización */}
      {showViewModal && viewAsignacion && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          overflowY: 'auto'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '700px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h2 style={{ marginTop: 0, marginBottom: '24px', color: '#1F2937' }}>Detalles de Asignación</h2>

            <div style={{ display: 'grid', gap: '20px' }}>
              {/* Número de Asignación */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6B7280', marginBottom: '4px' }}>
                  Número de Asignación
                </label>
                <p style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1F2937' }}>
                  {viewAsignacion.codigo}
                </p>
              </div>

              {/* Vehículo */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6B7280', marginBottom: '4px' }}>
                  Vehículo
                </label>
                <p style={{ margin: 0, fontSize: '16px', color: '#1F2937' }}>
                  <strong>{viewAsignacion.vehiculos?.patente}</strong> - {viewAsignacion.vehiculos?.marca} {viewAsignacion.vehiculos?.modelo}
                </p>
              </div>

              {/* Conductores */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6B7280', marginBottom: '4px' }}>
                  Conductores Asignados
                </label>
                {viewAsignacion.asignaciones_conductores && viewAsignacion.asignaciones_conductores.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {viewAsignacion.asignaciones_conductores.map((ac) => (
                      <div key={ac.id} style={{
                        padding: '12px',
                        background: '#F9FAFB',
                        borderRadius: '8px',
                        border: '1px solid #E5E7EB'
                      }}>
                        <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#1F2937' }}>
                          {ac.conductores.nombres} {ac.conductores.apellidos}
                        </p>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6B7280' }}>
                          Licencia: {ac.conductores.numero_licencia}
                        </p>
                        {ac.horario !== 'todo_dia' && (
                          <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                            Turno: <strong>{ac.horario}</strong>
                          </p>
                        )}
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                          Estado: <span className={`badge ${getStatusBadgeClass(ac.estado)}`}>{ac.estado}</span>
                        </p>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {ac.confirmado ? (
                            <>
                              <span style={{ color: '#10B981', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <CheckCircle size={14} /> Confirmado {ac.fecha_confirmacion && `el ${new Date(ac.fecha_confirmacion).toLocaleDateString('es-AR')}`}
                              </span>
                              {canEdit && viewAsignacion.estado === 'programado' && (
                                <button
                                  onClick={() => {
                                    Swal.fire({
                                      title: '¿Desconfirmar conductor?',
                                      text: 'Esto permitirá reasignar este turno a otro conductor',
                                      icon: 'warning',
                                      showCancelButton: true,
                                      confirmButtonColor: '#E63946',
                                      cancelButtonColor: '#6B7280',
                                      confirmButtonText: 'Sí, desconfirmar',
                                      cancelButtonText: 'Cancelar'
                                    }).then((result) => {
                                      if (result.isConfirmed) {
                                        handleUnconfirmConductor(ac.id)
                                        setShowViewModal(false)
                                        setViewAsignacion(null)
                                      }
                                    })
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    background: '#F59E0B',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    fontWeight: '600'
                                  }}
                                >
                                  Desconfirmar
                                </button>
                              )}
                            </>
                          ) : (
                            <span style={{ color: '#F59E0B', fontWeight: '600' }}>
                              Pendiente de confirmación
                            </span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: '14px', color: '#9CA3AF' }}>Sin conductores asignados</p>
                )}
              </div>

              {/* Modalidad y Horario */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6B7280', marginBottom: '4px' }}>
                    Modalidad
                  </label>
                  <span className={`badge ${getModalityBadgeClass(viewAsignacion.modalidad)}`}>
                    {getModalityLabel(viewAsignacion.modalidad)}
                  </span>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6B7280', marginBottom: '4px' }}>
                    Horario
                  </label>
                  <span className={`badge ${getHorarioBadgeClass(viewAsignacion.horario)}`}>
                    {viewAsignacion.horario === 'CARGO' ? 'A CARGO' : 'TURNO'}
                  </span>
                </div>
              </div>

              {/* Fechas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6B7280', marginBottom: '4px' }}>
                    Fecha de Programación
                  </label>
                  <p style={{ margin: 0, fontSize: '14px', color: '#1F2937' }}>
                    {new Date(viewAsignacion.created_at).toLocaleDateString('es-ES', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </p>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6B7280', marginBottom: '4px' }}>
                    Fecha de Entrega
                  </label>
                  <p style={{ margin: 0, fontSize: '14px', color: '#1F2937' }}>
                    {viewAsignacion.fecha_programada
                      ? new Date(viewAsignacion.fecha_programada).toLocaleDateString('es-ES', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })
                      : 'No definida'
                    }
                  </p>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6B7280', marginBottom: '4px' }}>
                    Fecha de Activación
                  </label>
                  <p style={{ margin: 0, fontSize: '14px', color: '#1F2937' }}>
                    {viewAsignacion.fecha_inicio
                      ? new Date(viewAsignacion.fecha_inicio).toLocaleDateString('es-ES', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })
                      : 'No activada'
                    }
                  </p>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6B7280', marginBottom: '4px' }}>
                    Fecha Fin
                  </label>
                  <p style={{ margin: 0, fontSize: '14px', color: '#1F2937' }}>
                    {viewAsignacion.fecha_fin
                      ? new Date(viewAsignacion.fecha_fin).toLocaleDateString('es-ES', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })
                      : 'Sin definir'
                    }
                  </p>
                </div>
              </div>

              {/* Estado */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6B7280', marginBottom: '4px' }}>
                  Estado
                </label>
                <span className={`badge ${getStatusBadgeClass(viewAsignacion.estado)}`}>
                  {viewAsignacion.estado}
                </span>
              </div>

              {/* Notas */}
              {viewAsignacion.notas && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6B7280', marginBottom: '4px' }}>
                    Notas
                  </label>
                  <p style={{
                    margin: 0,
                    fontSize: '14px',
                    color: '#1F2937',
                    padding: '12px',
                    background: '#F9FAFB',
                    borderRadius: '8px',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {viewAsignacion.notas}
                  </p>
                </div>
              )}
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowViewModal(false)
                  setViewAsignacion(null)
                }}
                style={{
                  padding: '10px 24px',
                  border: '2px solid #E5E7EB',
                  background: 'white',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px'
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
