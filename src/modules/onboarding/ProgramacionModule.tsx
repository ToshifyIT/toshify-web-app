// src/modules/onboarding/ProgramacionModule.tsx
// Modulo de programacion de entregas de vehiculos

import { useState, useEffect, useMemo } from 'react'
import {
  Car, User, Calendar, FileText, Plus,
  Eye, Trash2, CheckCircle, XCircle, Send,
  ClipboardList, UserPlus, MessageSquareText, ArrowRightLeft, Pencil, Copy, RefreshCw,
  Check, X, MapPin
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable/DataTable'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useAuth } from '../../contexts/AuthContext'

import { ProgramacionAssignmentWizard } from './components/ProgramacionAssignmentWizard'
import type { ProgramacionOnboardingCompleta, EstadoKanban } from '../../types/onboarding.types'
import Swal from 'sweetalert2'
import './ProgramacionModule.css'

// Labels para mostrar
const ESTADO_LABELS: Record<string, string> = {
  por_agendar: 'Por Agendar',
  agendado: 'Agendado',
  en_curso: 'En Curso',
  completado: 'Completado'
}

const TIPO_ASIGNACION_LABELS: Record<string, string> = {
  entrega_auto: 'Entrega de auto',
  asignacion_companero: 'Asignación compañero',
  cambio_auto: 'Cambio de auto',
  asignacion_auto_cargo: 'Asig. auto a cargo',
  entrega_auto_cargo: 'Entrega auto a cargo',
  cambio_turno: 'Cambio de turno',
  devolucion_vehiculo: 'Devolución vehículo'
}

// Labels para mensajes de agenda
const TIPO_ASIGNACION_MSG: Record<string, string> = {
  entrega_auto: 'Entrega de auto',
  cambio_auto: 'Cambio de auto',
  asignacion_companero: 'Asignacion de companero'
}


// Funcion para generar mensaje de agenda
function generarMensajeAgenda(prog: ProgramacionOnboardingCompleta): string {
  const patente = prog.vehiculo_entregar_patente || prog.vehiculo_entregar_patente_sistema || 'N/A'
  const tipoAsignacion = TIPO_ASIGNACION_MSG[prog.tipo_asignacion || ''] || prog.tipo_asignacion || ''
  const zona = prog.zona || prog.zona_diurno || prog.zona_nocturno || 'N/A'
  const distancia = prog.distancia_minutos || prog.distancia_diurno || prog.distancia_nocturno || 'N/A'
  const documento = prog.tipo_documento === 'contrato' ? 'Contrato' : prog.tipo_documento === 'anexo' ? 'Anexo' : 'N/A'

  // Formatear fecha con día de la semana
  let fechaStr = 'N/A'
  if (prog.fecha_cita) {
    const fecha = new Date(prog.fecha_cita + 'T12:00:00')
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
    const dia = dias[fecha.getDay()]
    fechaStr = `${dia} ${fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
  }

  const hora = prog.hora_cita?.substring(0, 5) || 'N/A'

  // Generar mensaje según modalidad
  let mensaje = ''

  if (prog.modalidad === 'TURNO') {
    // Mensaje para modalidad TURNO (formato simple)
    const conductorDiurno = prog.conductor_diurno_nombre || 'Sin asignar'
    const conductorNocturno = prog.conductor_nocturno_nombre || 'Sin asignar'

    mensaje = `– ${tipoAsignacion} a
🌞 Diurno: ${conductorDiurno}
🌙 Nocturno: ${conductorNocturno}
📅 Fecha: ${fechaStr}
⏰ Hora: ${hora}
🚗 Auto asignado: ${patente}
📍 Ubicacion: ${zona.toUpperCase()}
👥 Distancia: ${distancia} minutos
📄 Documento: ${documento}`
  } else {
    // Mensaje para modalidad A CARGO (formato completo con importantes)
    const modelo = prog.vehiculo_entregar_modelo || prog.vehiculo_entregar_modelo_sistema || ''
    const color = prog.vehiculo_entregar_color || ''

    // Construir info del auto con modelo y color
    let autoInfo = patente
    if (modelo && color) {
      autoInfo = `${patente}-${modelo.toUpperCase()}-${color.toUpperCase()}`
    } else if (modelo) {
      autoInfo = `${patente}-${modelo.toUpperCase()}`
    }

    // Formatear fecha con día capitalizado para A CARGO
    let fechaStrCargo = 'N/A'
    if (prog.fecha_cita) {
      const fecha = new Date(prog.fecha_cita + 'T12:00:00')
      const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
      const dia = dias[fecha.getDay()]
      fechaStrCargo = `${dia} ${fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
    }

    // Determinar turno
    const turnoEmoji = prog.turno === 'diurno' ? '🌞' : prog.turno === 'nocturno' ? '🌙' : ''
    const turnoLabel = prog.turno === 'diurno' ? 'Diurno' : prog.turno === 'nocturno' ? 'Nocturno' : ''

    mensaje = `📅 Fecha: ${fechaStrCargo}
⏰ Horario: ${hora} hs
🚗 Auto Asignado: ${autoInfo}
${turnoEmoji}${turnoEmoji ? ' ' : ''}Turno: ${turnoLabel}
👥 Distancia de tu compañero: ${distancia} min
⚠️ Importante:
- Favor de traer el ${patente} limpio, con gnc completo y nafta por encima de la reserva.
- La tolerancia máxima de espera es de 15 minutos ⏳
*Confirmar asistencia por favor* 🤝
⚠️ Importante:
- Recuerde llevar dni y licencia.
- La tolerancia máxima de espera es de 15 minutos ⏳
*Confirmar asistencia por favor* 🤝`
  }

  return mensaje
}

export function ProgramacionModule() {
  const { canCreateInMenu, canEditInMenu, canDeleteInMenu } = usePermissions()
  const { user, profile } = useAuth()
  const canCreate = canCreateInMenu('programacion-entregas')
  const canEdit = canEditInMenu('programacion-entregas')
  const canDelete = canDeleteInMenu('programacion-entregas')

  const [programaciones, setProgramaciones] = useState<ProgramacionOnboardingCompleta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filtro activo por stat card
  type FilterType = 'all' | 'por_agendar' | 'agendados' | 'completados' | 'cond_nuevos' | 'cond_anexo'
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  
  // Modals
  const [showCreateWizard, setShowCreateWizard] = useState(false)
  const [editingProgramacion, setEditingProgramacion] = useState<ProgramacionOnboardingCompleta | null>(null)
  const [previewProgramacion, setPreviewProgramacion] = useState<ProgramacionOnboardingCompleta | null>(null)

  // Modal edicion rapida
  const [showQuickEdit, setShowQuickEdit] = useState(false)
  const [quickEditData, setQuickEditData] = useState<Partial<ProgramacionOnboardingCompleta> & { vehiculo_id?: string }>({})
  const [savingQuickEdit, setSavingQuickEdit] = useState(false)
  const [vehiculosDisponibles, setVehiculosDisponibles] = useState<Array<{ id: string; patente: string; marca: string; modelo: string }>>([])
  const [loadingVehiculos, setLoadingVehiculos] = useState(false)
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [showVehiculoDropdown, setShowVehiculoDropdown] = useState(false)

  // Conductores disponibles para edición
  const [conductoresDisponibles, setConductoresDisponibles] = useState<Array<{ id: string; nombre: string; dni: string }>>([])
  const [loadingConductores, setLoadingConductores] = useState(false)
  const [conductorDiurnoSearch, setConductorDiurnoSearch] = useState('')
  const [conductorNocturnoSearch, setConductorNocturnoSearch] = useState('')
  const [conductorSearch, setConductorSearch] = useState('') // Para modalidad A CARGO
  const [showConductorDiurnoDropdown, setShowConductorDiurnoDropdown] = useState(false)
  const [showConductorNocturnoDropdown, setShowConductorNocturnoDropdown] = useState(false)
  const [showConductorDropdown, setShowConductorDropdown] = useState(false)

  // Vehiculos filtrados por busqueda
  const filteredVehiculos = useMemo(() => {
    if (!vehiculoSearch.trim()) return vehiculosDisponibles
    const search = vehiculoSearch.toLowerCase()
    return vehiculosDisponibles.filter(v =>
      v.patente.toLowerCase().includes(search) ||
      v.marca.toLowerCase().includes(search) ||
      v.modelo.toLowerCase().includes(search)
    )
  }, [vehiculosDisponibles, vehiculoSearch])

  // Vehiculo seleccionado actual
  const selectedVehiculo = useMemo(() => {
    return vehiculosDisponibles.find(v => v.id === quickEditData.vehiculo_id)
  }, [vehiculosDisponibles, quickEditData.vehiculo_id])

  // Conductores filtrados por búsqueda (diurno)
  const filteredConductoresDiurno = useMemo(() => {
    if (!conductorDiurnoSearch.trim()) return conductoresDisponibles
    const search = conductorDiurnoSearch.toLowerCase()
    return conductoresDisponibles.filter(c =>
      c.nombre.toLowerCase().includes(search) ||
      c.dni.toLowerCase().includes(search)
    )
  }, [conductoresDisponibles, conductorDiurnoSearch])

  // Conductores filtrados por búsqueda (nocturno)
  const filteredConductoresNocturno = useMemo(() => {
    if (!conductorNocturnoSearch.trim()) return conductoresDisponibles
    const search = conductorNocturnoSearch.toLowerCase()
    return conductoresDisponibles.filter(c =>
      c.nombre.toLowerCase().includes(search) ||
      c.dni.toLowerCase().includes(search)
    )
  }, [conductoresDisponibles, conductorNocturnoSearch])

  // Conductores filtrados por búsqueda (a cargo - legacy)
  const filteredConductores = useMemo(() => {
    if (!conductorSearch.trim()) return conductoresDisponibles
    const search = conductorSearch.toLowerCase()
    return conductoresDisponibles.filter(c =>
      c.nombre.toLowerCase().includes(search) ||
      c.dni.toLowerCase().includes(search)
    )
  }, [conductoresDisponibles, conductorSearch])

  // Conductor seleccionado actual (diurno)
  const selectedConductorDiurno = useMemo(() => {
    return conductoresDisponibles.find(c => c.id === quickEditData.conductor_diurno_id)
  }, [conductoresDisponibles, quickEditData.conductor_diurno_id])

  // Conductor seleccionado actual (nocturno)
  const selectedConductorNocturno = useMemo(() => {
    return conductoresDisponibles.find(c => c.id === quickEditData.conductor_nocturno_id)
  }, [conductoresDisponibles, quickEditData.conductor_nocturno_id])

  // Conductor seleccionado actual (a cargo)
  const selectedConductor = useMemo(() => {
    return conductoresDisponibles.find(c => c.id === quickEditData.conductor_id)
  }, [conductoresDisponibles, quickEditData.conductor_id])

  // Especialistas disponibles (para uso futuro)
  const [_especialistas, _setEspecialistas] = useState<Array<{ id: string; nombre: string }>>([])

  // Modal cambiar estado
  const [showEstadoModal, setShowEstadoModal] = useState(false)
  const [estadoModalProg, setEstadoModalProg] = useState<ProgramacionOnboardingCompleta | null>(null)
  const [nuevoEstado, setNuevoEstado] = useState('')

  // Modal copiar mensaje
  const [showMensajeModal, setShowMensajeModal] = useState(false)
  const [mensajeModalProg, setMensajeModalProg] = useState<ProgramacionOnboardingCompleta | null>(null)

  // Cargar programaciones
  const loadProgramaciones = async () => {
    setLoading(true)
    try {
      const { data, error: queryError } = await supabase
        .from('v_programaciones_onboarding')
        .select('*')
        .neq('estado', 'completado') // Excluir las completadas (ya enviadas)
        .order('created_at', { ascending: false })

      if (queryError) throw queryError
      setProgramaciones((data || []) as ProgramacionOnboardingCompleta[])
    } catch (err: any) {
      console.error('Error loading programaciones:', err)
      setError(err.message || 'Error al cargar programaciones')
    } finally {
      setLoading(false)
    }
  }

  // Cargar especialistas
  const loadEspecialistas = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .order('full_name')

      if (error) throw error
      _setEspecialistas((data || []).map((u: any) => ({
        id: u.id,
        nombre: u.full_name || 'Sin nombre'
      })))
    } catch (err) {
      console.error('Error cargando especialistas:', err)
    }
  }

  useEffect(() => {
    loadProgramaciones()
    loadEspecialistas()
  }, [])

  // Handlers
  const handleCreate = () => {
    setShowCreateWizard(true)
  }

  const handleEdit = async (prog: ProgramacionOnboardingCompleta) => {
    setEditingProgramacion(prog)
    setVehiculoSearch('') // Reset busqueda
    setShowVehiculoDropdown(false)
    setConductorDiurnoSearch('')
    setConductorNocturnoSearch('')
    setConductorSearch('')
    setShowConductorDiurnoDropdown(false)
    setShowConductorNocturnoDropdown(false)
    setShowConductorDropdown(false)
    setQuickEditData({
      vehiculo_id: prog.vehiculo_entregar_id || '',
      vehiculo_entregar_patente: prog.vehiculo_entregar_patente || prog.vehiculo_entregar_patente_sistema || '',
      fecha_cita: prog.fecha_cita || '',
      hora_cita: prog.hora_cita?.substring(0, 5) || '10:00',
      // Conductores (IDs)
      conductor_diurno_id: prog.conductor_diurno_id || '',
      conductor_diurno_nombre: prog.conductor_diurno_nombre || '',
      conductor_nocturno_id: prog.conductor_nocturno_id || '',
      conductor_nocturno_nombre: prog.conductor_nocturno_nombre || '',
      conductor_id: prog.conductor_id || '',
      conductor_nombre: prog.conductor_nombre || prog.conductor_display || '',
      // Diurno
      tipo_candidato_diurno: prog.tipo_candidato_diurno,
      tipo_asignacion_diurno: prog.tipo_asignacion_diurno || prog.tipo_asignacion || 'entrega_auto',
      documento_diurno: prog.documento_diurno,
      zona_diurno: prog.zona_diurno || '',
      distancia_diurno: prog.distancia_diurno,
      // Nocturno
      tipo_candidato_nocturno: prog.tipo_candidato_nocturno,
      tipo_asignacion_nocturno: prog.tipo_asignacion_nocturno || prog.tipo_asignacion || 'entrega_auto',
      documento_nocturno: prog.documento_nocturno,
      zona_nocturno: prog.zona_nocturno || '',
      distancia_nocturno: prog.distancia_nocturno,
      // A Cargo (legacy)
      tipo_candidato: prog.tipo_candidato,
      tipo_documento: prog.tipo_documento,
      zona: prog.zona,
      distancia_minutos: prog.distancia_minutos,
      // Otros
      observaciones: prog.observaciones || ''
    })
    setShowQuickEdit(true)

    // Cargar vehiculos y conductores en paralelo
    setLoadingVehiculos(true)
    setLoadingConductores(true)

    try {
      // Obtener vehiculos que no estan en reparacion/mantenimiento
      const estadosNoDisponibles = ['REPARACION', 'MANTENIMIENTO', 'TALLER_AXIS', 'TALLER_CHAPA_PINTURA', 'TALLER_ALLIANCE', 'TALLER_KALZALO']
      const { data: vehiculosData } = await supabase
        .from('vehiculos')
        .select('id, patente, marca, modelo, vehiculos_estados(codigo)')
        .order('patente')

      // Obtener vehiculos ya programados (excepto el actual)
      const { data: programacionesData } = await supabase
        .from('programaciones_onboarding')
        .select('vehiculo_entregar_id')
        .in('estado', ['por_agendar', 'agendado', 'en_curso'])
        .neq('id', prog.id)

      const vehiculosProgramados = new Set((programacionesData || []).map((p: any) => p.vehiculo_entregar_id))

      const vehiculosFiltrados = (vehiculosData || []).filter((v: any) =>
        !estadosNoDisponibles.includes(v.vehiculos_estados?.codigo) &&
        (!vehiculosProgramados.has(v.id) || v.id === prog.vehiculo_entregar_id)
      )

      setVehiculosDisponibles(vehiculosFiltrados.map((v: any) => ({
        id: v.id,
        patente: v.patente,
        marca: v.marca,
        modelo: v.modelo
      })))
    } catch (err) {
      console.error('Error cargando vehiculos:', err)
    } finally {
      setLoadingVehiculos(false)
    }

    // Cargar TODOS los conductores (sin filtro de programados para simplicidad)
    try {
      const { data: conductoresData, error: conductoresError } = await supabase
        .from('conductores')
        .select('id, nombres, apellidos, numero_dni')
        .order('apellidos')
        .limit(1000)

      if (conductoresError) {
        console.error('Error en query conductores:', conductoresError)
      }

      setConductoresDisponibles((conductoresData || []).map((c: any) => ({
        id: c.id,
        nombre: `${c.nombres || ''} ${c.apellidos || ''}`.trim(),
        dni: c.numero_dni || ''
      })))
    } catch (err) {
      console.error('Error cargando conductores:', err)
    } finally {
      setLoadingConductores(false)
    }
  }

  // Guardar edicion rapida
  const handleSaveQuickEdit = async () => {
    if (!editingProgramacion) return

    setSavingQuickEdit(true)
    try {
      const isTurno = editingProgramacion.modalidad === 'TURNO'

      // Buscar datos del vehiculo seleccionado
      const vehiculoSeleccionado = vehiculosDisponibles.find(v => v.id === quickEditData.vehiculo_id)

      // Buscar datos de conductores seleccionados
      const conductorDiurnoSeleccionado = conductoresDisponibles.find(c => c.id === quickEditData.conductor_diurno_id)
      const conductorNocturnoSeleccionado = conductoresDisponibles.find(c => c.id === quickEditData.conductor_nocturno_id)
      const conductorSeleccionado = conductoresDisponibles.find(c => c.id === quickEditData.conductor_id)

      const updateData: any = {
        fecha_cita: quickEditData.fecha_cita,
        hora_cita: quickEditData.hora_cita,
        observaciones: quickEditData.observaciones,
        // Vehiculo
        vehiculo_entregar_id: quickEditData.vehiculo_id || null,
        vehiculo_entregar_patente: vehiculoSeleccionado?.patente || quickEditData.vehiculo_entregar_patente || null,
        vehiculo_entregar_modelo: vehiculoSeleccionado ? `${vehiculoSeleccionado.marca} ${vehiculoSeleccionado.modelo}` : null
      }

      if (isTurno) {
        // Conductor diurno
        updateData.conductor_diurno_id = quickEditData.conductor_diurno_id || null
        updateData.conductor_diurno_nombre = conductorDiurnoSeleccionado?.nombre || quickEditData.conductor_diurno_nombre || null
        updateData.conductor_diurno_dni = conductorDiurnoSeleccionado?.dni || null
        updateData.tipo_candidato_diurno = quickEditData.tipo_candidato_diurno
        updateData.documento_diurno = quickEditData.documento_diurno
        updateData.zona_diurno = quickEditData.zona_diurno
        updateData.distancia_diurno = quickEditData.distancia_diurno || null

        // Conductor nocturno
        updateData.conductor_nocturno_id = quickEditData.conductor_nocturno_id || null
        updateData.conductor_nocturno_nombre = conductorNocturnoSeleccionado?.nombre || quickEditData.conductor_nocturno_nombre || null
        updateData.conductor_nocturno_dni = conductorNocturnoSeleccionado?.dni || null
        updateData.tipo_candidato_nocturno = quickEditData.tipo_candidato_nocturno
        updateData.documento_nocturno = quickEditData.documento_nocturno
        updateData.zona_nocturno = quickEditData.zona_nocturno
        updateData.distancia_nocturno = quickEditData.distancia_nocturno || null

        // Usar tipo_asignacion general (columnas individuales no existen aún en BD)
        updateData.tipo_asignacion = quickEditData.tipo_asignacion_diurno || quickEditData.tipo_asignacion_nocturno || 'entrega_auto'
      } else {
        // A Cargo - campos legacy
        updateData.conductor_id = quickEditData.conductor_id || null
        updateData.conductor_nombre = conductorSeleccionado?.nombre || quickEditData.conductor_nombre || null
        updateData.conductor_dni = conductorSeleccionado?.dni || null
        updateData.tipo_candidato = quickEditData.tipo_candidato
        updateData.tipo_documento = quickEditData.tipo_documento
        updateData.zona = quickEditData.zona
        updateData.distancia_minutos = quickEditData.distancia_minutos || null
      }

      const { error } = await (supabase
        .from('programaciones_onboarding') as any)
        .update(updateData)
        .eq('id', editingProgramacion.id)

      if (error) throw error

      await loadProgramaciones()
      setShowQuickEdit(false)
      setEditingProgramacion(null)
      Swal.fire('Guardado', 'Programacion actualizada correctamente', 'success')
    } catch (err: any) {
      console.error('Error actualizando:', err)
      Swal.fire('Error', err.message || 'Error al guardar', 'error')
    } finally {
      setSavingQuickEdit(false)
    }
  }

  const handleDelete = async (id: string, yaEnviada: boolean = false) => {
    const result = await Swal.fire({
      title: yaEnviada ? 'Eliminar programacion enviada?' : 'Eliminar programacion?',
      text: yaEnviada
        ? 'ATENCION: Esta programacion ya fue enviada a Entrega. Solo se eliminara de esta lista, la asignacion en Entrega permanecera.'
        : 'Esta accion no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#DC2626',
      confirmButtonText: 'Si, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (result.isConfirmed) {
      try {
        const { error } = await supabase
          .from('programaciones_onboarding')
          .delete()
          .eq('id', id)

        if (error) throw error
        setProgramaciones(prev => prev.filter(p => p.id !== id))
        Swal.fire('Eliminado', 'La programacion fue eliminada', 'success')
      } catch (err: any) {
        Swal.fire('Error', err.message || 'Error al eliminar', 'error')
      }
    }
  }

  // Abrir modal cambiar estado
  const handleCambiarEstado = (prog: ProgramacionOnboardingCompleta) => {
    setEstadoModalProg(prog)
    setNuevoEstado(prog.estado)
    setShowEstadoModal(true)
  }

  // Guardar nuevo estado
  const handleGuardarEstado = async () => {
    if (!estadoModalProg || !nuevoEstado) return
    
    if (nuevoEstado === estadoModalProg.estado) {
      setShowEstadoModal(false)
      return
    }

    try {
      const { error } = await (supabase
        .from('programaciones_onboarding') as any)
        .update({ estado: nuevoEstado })
        .eq('id', estadoModalProg.id)

      if (error) throw error

      // Actualizar estado local
      setProgramaciones(prev => prev.map(p => 
        p.id === estadoModalProg.id ? { ...p, estado: nuevoEstado as EstadoKanban } : p
      ))

      setShowEstadoModal(false)
      Swal.fire({
        icon: 'success',
        title: 'Estado actualizado',
        timer: 1500,
        showConfirmButton: false
      })
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al cambiar estado', 'error')
    }
  }

  // Abrir modal copiar mensaje
  const handleCopiarMensaje = (prog: ProgramacionOnboardingCompleta) => {
    setMensajeModalProg(prog)
    setShowMensajeModal(true)
  }

  // Copiar al portapapeles
  const handleCopiarAlPortapapeles = async () => {
    if (!mensajeModalProg) return
    const mensaje = generarMensajeAgenda(mensajeModalProg)

    try {
      await navigator.clipboard.writeText(mensaje)
      setShowMensajeModal(false)
    } catch (err) {
      // Si falla el clipboard, el usuario puede copiar manualmente del preview
      console.error('Error copiando:', err)
    }
  }

  // Actualizar campo individual inline
  const handleUpdateField = async (id: string, field: string, value: any) => {
    try {
      const { error } = await (supabase
        .from('programaciones_onboarding') as any)
        .update({ [field]: value })
        .eq('id', id)

      if (error) throw error

      // Actualizar estado local
      setProgramaciones(prev => prev.map(p =>
        p.id === id ? { ...p, [field]: value } : p
      ))
    } catch (err: any) {
      console.error(`Error actualizando ${field}:`, err)
      Swal.fire('Error', err.message || 'Error al actualizar', 'error')
    }
  }

  // Enviar a entrega - Crear asignacion
  const handleEnviarAEntrega = async (prog: ProgramacionOnboardingCompleta) => {
    // Verificar qué conductores son "asignacion_companero" (no deben agregarse a la asignación)
    const diurnoEsCompanero = prog.tipo_asignacion_diurno === 'asignacion_companero'
    const nocturnoEsCompanero = prog.tipo_asignacion_nocturno === 'asignacion_companero'
    const legacyEsCompanero = prog.tipo_asignacion === 'asignacion_companero'

    // Para modalidad TURNO: verificar si AMBOS son compañero
    // Para modalidad A CARGO: verificar si el único conductor es compañero
    const todosEsCompanero = prog.modalidad === 'TURNO'
      ? (diurnoEsCompanero && nocturnoEsCompanero)
      : legacyEsCompanero

    // Si TODOS los conductores son asignacion de compañero, NO crear asignación
    if (todosEsCompanero) {
      const result = await Swal.fire({
        title: 'Confirmar Asignación de Compañero',
        html: `
          <div style="text-align: left; font-size: 14px;">
            <p><strong>Conductor:</strong> ${prog.conductor_display || prog.conductor_nombre || '-'}</p>
            <p><strong>Vehiculo:</strong> ${prog.vehiculo_entregar_patente || prog.vehiculo_entregar_patente_sistema || '-'}</p>
            <p style="margin-top: 12px; color: #6B7280;">
              <strong>Nota:</strong> Todos los conductores ya tienen asignación activa con su compañero.
              Solo se marcará la programación como confirmada, sin crear una nueva asignación.
            </p>
          </div>
        `,
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#10B981',
        confirmButtonText: 'Confirmar',
        cancelButtonText: 'Cancelar'
      })

      if (!result.isConfirmed) return

      try {
        // Solo actualizar el estado de la programacion a completado
        await (supabase.from('programaciones_onboarding') as any)
          .update({
            estado: 'completado',
            fecha_asignacion_creada: new Date().toISOString()
          })
          .eq('id', prog.id)

        // Actualizar localmente
        setProgramaciones(prev => prev.map(p =>
          p.id === prog.id
            ? { ...p, estado: 'completado' as EstadoKanban }
            : p
        ))

        Swal.fire({
          icon: 'success',
          title: 'Programación Confirmada',
          text: 'Los conductores de compañero han sido confirmados sin afectar sus asignaciones actuales.',
          confirmButtonText: 'Entendido'
        })
        return
      } catch (err: any) {
        console.error('Error confirmando asignacion de compañero:', err)
        Swal.fire('Error', err.message || 'Error al confirmar', 'error')
        return
      }
    }

    // Validar que tenga los datos minimos
    if (!prog.vehiculo_entregar_id && !prog.vehiculo_entregar_patente) {
      Swal.fire('Error', 'La programacion no tiene vehiculo asignado', 'error')
      return
    }

    // Validar conductor según modalidad
    const tieneConductorLegacy = prog.conductor_id || prog.conductor_nombre
    const tieneConductorDiurno = prog.conductor_diurno_id || prog.conductor_diurno_nombre
    const tieneConductorNocturno = prog.conductor_nocturno_id || prog.conductor_nocturno_nombre

    if (!tieneConductorLegacy && !tieneConductorDiurno && !tieneConductorNocturno) {
      Swal.fire('Error', 'La programacion no tiene conductor asignado', 'error')
      return
    }

    // Formatear hora para mostrar
    const horaDisplay = prog.hora_cita ? prog.hora_cita.substring(0, 5) : 'Sin definir'

    const result = await Swal.fire({
      title: 'Enviar a Entrega',
      html: `
        <div style="text-align: left; font-size: 14px;">
          <p><strong>Vehiculo:</strong> ${prog.vehiculo_entregar_patente || prog.vehiculo_entregar_patente_sistema || '-'}</p>
          <p><strong>Conductor:</strong> ${prog.conductor_display || prog.conductor_nombre || '-'}</p>
          <p><strong>Modalidad:</strong> ${prog.modalidad === 'TURNO' ? 'Turno' : 'A Cargo'}</p>
          ${prog.turno ? `<p><strong>Turno:</strong> ${prog.turno === 'diurno' ? 'Diurno' : 'Nocturno'}</p>` : ''}
          <p><strong>Fecha:</strong> ${prog.fecha_cita ? new Date(prog.fecha_cita).toLocaleDateString('es-AR') : 'Sin definir'}</p>
          <p><strong>Hora:</strong> ${horaDisplay}</p>
        </div>
        <p style="margin-top: 16px; color: #6B7280;">Se creara una asignacion en estado <strong>Programado</strong></p>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10B981',
      confirmButtonText: 'Crear Asignacion',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    try {
      // Helper para mapear documento de programación a asignación
      const mapDocumento = (doc: string | undefined) => {
        if (doc === 'contrato') return 'CARTA_OFERTA'
        if (doc === 'anexo') return 'ANEXO'
        return 'N/A'
      }

      // NOTA: La lógica de "asignacion_companero" se maneja al CONFIRMAR la asignación,
      // no aquí. Aquí creamos la asignación con TODOS los conductores visibles.
      // Al confirmar (handleConfirmar), se agrega el conductor nuevo a la asignación existente
      // y se finaliza esta asignación nueva.

      // Crear nueva asignación normalmente (mostrando TODOS los conductores)
      // Generar codigo de asignacion
      const fecha = new Date()
      const codigo = `ASG-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}-${String(fecha.getHours()).padStart(2, '0')}${String(fecha.getMinutes()).padStart(2, '0')}`

      // Crear asignacion
      // modalidad en programacion es 'TURNO' o 'CARGO', en asignacion es 'turno' o 'a_cargo'
      const esTurno = prog.modalidad === 'TURNO'
      console.log('🔍 Modalidad programacion:', prog.modalidad, '→ Es TURNO:', esTurno)

      // Construir fecha_programada correctamente con la hora de la cita
      let fechaProgramada: string
      if (prog.fecha_cita) {
        const hora = prog.hora_cita && prog.hora_cita.trim() !== ''
          ? prog.hora_cita.substring(0, 5)
          : '10:00'
        const [hh, mm] = hora.split(':').map(Number)
        const fechaLocal = new Date(prog.fecha_cita + 'T12:00:00')
        fechaLocal.setHours(hh, mm, 0, 0)
        fechaProgramada = fechaLocal.toISOString()
        console.log('📅 Fecha programada construida:', { fecha: prog.fecha_cita, hora, fechaLocal: fechaLocal.toString(), iso: fechaProgramada })
      } else {
        fechaProgramada = new Date().toISOString()
      }

      // Construir notas con metadata de companeros para que al confirmar sepamos quién es quién
      let notasBase = prog.observaciones || `Creado desde programacion. Tipo: ${TIPO_ASIGNACION_LABELS[prog.tipo_asignacion || ''] || prog.tipo_asignacion}`

      // Agregar metadata de companeros al final
      const companeroMeta: string[] = []
      if (diurnoEsCompanero && prog.conductor_diurno_id) {
        companeroMeta.push(`[COMPANERO:diurno:${prog.conductor_diurno_id}]`)
      }
      if (nocturnoEsCompanero && prog.conductor_nocturno_id) {
        companeroMeta.push(`[COMPANERO:nocturno:${prog.conductor_nocturno_id}]`)
      }
      if (companeroMeta.length > 0) {
        notasBase = `${notasBase}\n${companeroMeta.join('\n')}`
      }

      const { data: asignacion, error: asignacionError } = await (supabase
        .from('asignaciones') as any)
        .insert({
          codigo,
          vehiculo_id: prog.vehiculo_entregar_id,
          modalidad: esTurno ? 'turno' : 'a_cargo',
          horario: esTurno ? 'TURNO' : 'CARGO',
          fecha_programada: fechaProgramada,
          estado: 'programado',
          notas: notasBase,
          created_by: user?.id || null,
          created_by_name: profile?.full_name || 'Sistema'
        })
        .select()
        .single()

      if (asignacionError) throw asignacionError

      // Log para debug
      console.log('📋 Programacion data:', {
        modalidad: prog.modalidad,
        conductor_id: prog.conductor_id,
        conductor_nombre: prog.conductor_nombre,
        conductor_diurno_id: prog.conductor_diurno_id,
        conductor_diurno_nombre: prog.conductor_diurno_nombre,
        conductor_nocturno_id: prog.conductor_nocturno_id,
        conductor_nocturno_nombre: prog.conductor_nocturno_nombre
      })

      // Crear asignacion_conductor(es) segun modalidad
      // NOTA: Insertamos TODOS los conductores (incluso los que son asignacion_companero)
      // La lógica especial de companero se ejecuta al CONFIRMAR la asignación
      let conductoresInsertados = 0

      // Insertar conductor diurno
      if (prog.conductor_diurno_id) {
        console.log('✅ Insertando conductor diurno:', prog.conductor_diurno_id, 'doc:', prog.documento_diurno, 'esCompanero:', diurnoEsCompanero)
        const { error: diurnoError } = await (supabase
          .from('asignaciones_conductores') as any)
          .insert({
            asignacion_id: asignacion.id,
            conductor_id: prog.conductor_diurno_id,
            horario: 'diurno',
            estado: 'asignado',
            documento: mapDocumento(prog.documento_diurno)
          })
        if (diurnoError) {
          console.error('❌ Error insertando conductor diurno:', diurnoError)
          throw diurnoError
        }
        conductoresInsertados++
      }

      // Insertar conductor nocturno
      if (prog.conductor_nocturno_id) {
        console.log('✅ Insertando conductor nocturno:', prog.conductor_nocturno_id, 'doc:', prog.documento_nocturno, 'esCompanero:', nocturnoEsCompanero)
        const { error: nocturnoError } = await (supabase
          .from('asignaciones_conductores') as any)
          .insert({
            asignacion_id: asignacion.id,
            conductor_id: prog.conductor_nocturno_id,
            horario: 'nocturno',
            estado: 'asignado',
            documento: mapDocumento(prog.documento_nocturno)
          })
        if (nocturnoError) {
          console.error('❌ Error insertando conductor nocturno:', nocturnoError)
          throw nocturnoError
        }
        conductoresInsertados++
      }

      // Si no hay conductores duales, intentar con conductor legacy (A CARGO)
      // Solo si NO es asignacion_companero (aunque este caso ya se maneja arriba con todosEsCompanero)
      if (conductoresInsertados === 0 && prog.conductor_id && !legacyEsCompanero) {
        console.log('✅ Insertando conductor legacy:', prog.conductor_id, 'doc:', prog.tipo_documento)
        const { error: conductorError } = await (supabase
          .from('asignaciones_conductores') as any)
          .insert({
            asignacion_id: asignacion.id,
            conductor_id: prog.conductor_id,
            horario: 'todo_dia',
            estado: 'asignado',
            documento: mapDocumento(prog.tipo_documento)
          })
        if (conductorError) {
          console.error('❌ Error insertando conductor legacy:', conductorError)
          throw conductorError
        }
        conductoresInsertados++
      }

      console.log(`📊 Total conductores insertados: ${conductoresInsertados}`)

      // Actualizar programacion con referencia a la asignacion y marcar como completado
      await (supabase.from('programaciones_onboarding') as any)
        .update({
          asignacion_id: asignacion.id,
          fecha_asignacion_creada: new Date().toISOString(),
          estado: 'completado' // Marcar como completado para que no se liste mas
        })
        .eq('id', prog.id)

      // Remover de la lista local (ya no debe aparecer)
      setProgramaciones(prev => prev.filter(p => p.id !== prog.id))

      Swal.fire({
        icon: 'success',
        title: 'Asignacion Creada',
        html: `<p>Codigo: <strong>${asignacion.codigo}</strong></p><p>Puedes verla en el modulo de Asignaciones</p>`,
        confirmButtonText: 'Entendido'
      })

    } catch (err: any) {
      console.error('Error creando asignacion:', err)
      Swal.fire('Error', err.message || 'Error al crear asignacion', 'error')
    }
  }

  // Columnas de la tabla
  const columns = useMemo<ColumnDef<ProgramacionOnboardingCompleta, any>[]>(() => [
    {
      accessorKey: 'vehiculo_entregar_patente',
      header: 'Vehiculo',
      cell: ({ row }) => (
        <div className="prog-vehiculo-cell">
          <span className="prog-patente">
            {row.original.vehiculo_entregar_patente || row.original.vehiculo_entregar_patente_sistema || '-'}
          </span>
          <span className="prog-modelo">
            {row.original.vehiculo_entregar_modelo || row.original.vehiculo_entregar_modelo_sistema || ''}
          </span>
        </div>
      )
    },
    {
      id: 'programados',
      header: 'Programados',
      accessorFn: (row) => {
        // Para modalidad A CARGO, usar el conductor legacy o el diurno
        if (row.modalidad === 'CARGO' || !row.modalidad) {
          return row.conductor_display || row.conductor_nombre || row.conductor_diurno_nombre || ''
        }
        // Para TURNO, concatenar ambos conductores para busqueda
        const d = row.conductor_diurno_nombre || row.conductor_nombre || ''
        const n = row.conductor_nocturno_nombre || ''
        return `${d} ${n}`.trim()
      },
      cell: ({ row }) => {
        const { modalidad, conductor_diurno_nombre, conductor_nocturno_nombre, conductor_display, conductor_nombre, turno } = row.original

        // Si es A CARGO, mostrar solo el conductor
        if (modalidad === 'CARGO' || !modalidad) {
          const nombre = conductor_display || conductor_nombre || conductor_diurno_nombre
          if (nombre) {
            return <span className="prog-conductor-cell">{nombre}</span>
          }
          return <span className="prog-sin-conductor">Sin asignar</span>
        }

        // Si es TURNO con nuevo sistema dual
        if (conductor_diurno_nombre || conductor_nocturno_nombre) {
          return (
            <div className="prog-conductores-compact">
              <span className={conductor_diurno_nombre ? 'prog-conductor-turno prog-turno-diurno' : 'prog-turno-vacante prog-turno-diurno'}>
                <span className="prog-turno-label prog-label-diurno">D</span>
                {conductor_diurno_nombre ? conductor_diurno_nombre.split(' ').slice(0, 2).join(' ') : 'Vacante'}
              </span>
              <span className={conductor_nocturno_nombre ? 'prog-conductor-turno prog-turno-nocturno' : 'prog-turno-vacante prog-turno-nocturno'}>
                <span className="prog-turno-label prog-label-nocturno">N</span>
                {conductor_nocturno_nombre ? conductor_nocturno_nombre.split(' ').slice(0, 2).join(' ') : 'Vacante'}
              </span>
            </div>
          )
        }

        // Fallback: sistema legacy con un solo conductor y turno
        const nombre = conductor_display || conductor_nombre
        if (nombre && turno) {
          const isDiurno = turno === 'diurno'
          return (
            <div className="prog-conductores-compact">
              <span className={isDiurno ? 'prog-conductor-turno prog-turno-diurno' : 'prog-turno-vacante prog-turno-diurno'}>
                <span className="prog-turno-label prog-label-diurno">D</span>
                {isDiurno ? nombre.split(' ').slice(0, 2).join(' ') : 'Vacante'}
              </span>
              <span className={!isDiurno ? 'prog-conductor-turno prog-turno-nocturno' : 'prog-turno-vacante prog-turno-nocturno'}>
                <span className="prog-turno-label prog-label-nocturno">N</span>
                {!isDiurno ? nombre.split(' ').slice(0, 2).join(' ') : 'Vacante'}
              </span>
            </div>
          )
        }

        return <span className="prog-sin-conductor">Sin asignar</span>
      }
    },
    {
      accessorKey: 'tipo_asignacion',
      header: 'Tipo Asig.',
      cell: ({ row }) => {
        const prog = row.original

        // Para TURNO: mostrar 2 selects (diurno y nocturno)
        if (prog.modalidad === 'TURNO') {
          const tipoD = prog.tipo_asignacion_diurno || prog.tipo_asignacion || ''
          const tipoN = prog.tipo_asignacion_nocturno || prog.tipo_asignacion || ''

          return (
            <div className="prog-tipo-asig-turno">
              <div className="prog-tipo-asig-row">
                <span className="prog-tipo-asig-label">D:</span>
                <select
                  className={`prog-inline-select-mini tipo-asignacion ${tipoD}`}
                  value={tipoD}
                  onChange={(e) => {
                    // Guardar en tipo_asignacion_diurno si existe la columna, sino en tipo_asignacion
                    handleUpdateField(prog.id, 'tipo_asignacion_diurno', e.target.value || null)
                  }}
                  title="Tipo asignación conductor diurno"
                >
                  <option value="">-</option>
                  <option value="entrega_auto">Entrega auto</option>
                  <option value="asignacion_companero">Asig. compañero</option>
                  <option value="cambio_auto">Cambio auto</option>
                  <option value="cambio_turno">Cambio turno</option>
                  <option value="devolucion_vehiculo">Devolución</option>
                </select>
              </div>
              <div className="prog-tipo-asig-row">
                <span className="prog-tipo-asig-label">N:</span>
                <select
                  className={`prog-inline-select-mini tipo-asignacion ${tipoN}`}
                  value={tipoN}
                  onChange={(e) => {
                    handleUpdateField(prog.id, 'tipo_asignacion_nocturno', e.target.value || null)
                  }}
                  title="Tipo asignación conductor nocturno"
                >
                  <option value="">-</option>
                  <option value="entrega_auto">Entrega auto</option>
                  <option value="asignacion_companero">Asig. compañero</option>
                  <option value="cambio_auto">Cambio auto</option>
                  <option value="cambio_turno">Cambio turno</option>
                  <option value="devolucion_vehiculo">Devolución</option>
                </select>
              </div>
            </div>
          )
        }

        // Para A CARGO: un solo select
        return (
          <select
            className={`prog-inline-select tipo-asignacion ${prog.tipo_asignacion || ''}`}
            value={prog.tipo_asignacion || ''}
            onChange={(e) => handleUpdateField(prog.id, 'tipo_asignacion', e.target.value || null)}
            title="Tipo de asignación"
          >
            <option value="">Sin definir</option>
            <option value="entrega_auto">Entrega de auto</option>
            <option value="asignacion_companero">Asignación compañero</option>
            <option value="cambio_auto">Cambio de auto</option>
            <option value="asignacion_auto_cargo">Asig. auto a cargo</option>
            <option value="entrega_auto_cargo">Entrega auto a cargo</option>
            <option value="cambio_turno">Cambio de turno</option>
            <option value="devolucion_vehiculo">Devolución vehículo</option>
          </select>
        )
      }
    },
    {
      accessorKey: 'modalidad',
      header: 'Modalidad',
      cell: ({ row }) => (
        <span className={`prog-modalidad-badge ${row.original.modalidad?.toLowerCase()}`}>
          {row.original.modalidad === 'TURNO' ? 'Turno' : 'A Cargo'}
        </span>
      )
    },
    {
      accessorKey: 'fecha_cita',
      header: 'Cita',
      cell: ({ row }) => {
        const fecha = row.original.fecha_cita
        const hora = row.original.hora_cita?.substring(0, 5)
        if (!fecha) return <span className="prog-hora">-</span>
        const fechaObj = new Date(fecha + 'T12:00:00')
        const fechaCorta = fechaObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
        return (
          <div className="prog-fecha-hora">
            <span className="prog-fecha">{fechaCorta}</span>
            {hora && <span className="prog-hora">{hora}</span>}
          </div>
        )
      }
    },
    {
      accessorKey: 'estado',
      header: 'Estado',
      cell: ({ row }) => (
        <span className={`prog-estado-badge ${row.original.estado}`}>
          {ESTADO_LABELS[row.original.estado] || row.original.estado}
        </span>
      )
    },
    {
      id: 'tipo_documento_display',
      header: 'Documento',
      cell: ({ row }) => {
        const prog = row.original
        // Para TURNO: mostrar documentos de diurno/nocturno separados
        // Para CARGO: mostrar tipo_documento
        const DOCUMENTO_LABELS: Record<string, string> = {
          contrato: 'Contrato',
          anexo: 'Anexo',
          carta_oferta: 'Carta Oferta',
          na: 'N/A',
          '': 'Sin definir'
        }

        if (prog.modalidad === 'TURNO') {
          const docDiurno = prog.documento_diurno || ''
          const docNocturno = prog.documento_nocturno || ''
          // Si ambos son iguales, mostrar uno solo
          if (docDiurno === docNocturno && docDiurno) {
            return (
              <span className={`prog-documento-badge ${docDiurno}`}>
                {DOCUMENTO_LABELS[docDiurno] || docDiurno}
              </span>
            )
          }
          // Si son diferentes, mostrar ambos
          return (
            <div className="prog-documentos-compact">
              <span className={`prog-documento-mini ${docDiurno || 'sin_definir'}`}>
                D: {DOCUMENTO_LABELS[docDiurno] || 'Sin def.'}
              </span>
              <span className={`prog-documento-mini ${docNocturno || 'sin_definir'}`}>
                N: {DOCUMENTO_LABELS[docNocturno] || 'Sin def.'}
              </span>
            </div>
          )
        }

        // Para CARGO: mostrar tipo_documento
        const doc = prog.tipo_documento || ''
        return (
          <span className={`prog-documento-badge ${doc || 'sin_definir'}`}>
            {DOCUMENTO_LABELS[doc] || doc || 'Sin definir'}
          </span>
        )
      }
    },
    // Columnas de gestión diaria
    {
      accessorKey: 'documento_listo',
      header: 'Doc ✓',
      cell: ({ row }) => (
        <button
          className={`prog-check-btn ${row.original.documento_listo ? 'checked' : ''}`}
          onClick={() => handleUpdateField(row.original.id, 'documento_listo', !row.original.documento_listo)}
          title={row.original.documento_listo ? 'Documento listo' : 'Documento pendiente'}
        >
          {row.original.documento_listo ? <Check size={14} /> : <X size={14} />}
        </button>
      )
    },
    {
      accessorKey: 'grupo_whatsapp',
      header: 'Wpp',
      cell: ({ row }) => (
        <button
          className={`prog-check-btn ${row.original.grupo_whatsapp ? 'checked' : ''}`}
          onClick={() => handleUpdateField(row.original.id, 'grupo_whatsapp', !row.original.grupo_whatsapp)}
          title={row.original.grupo_whatsapp ? 'En grupo WhatsApp' : 'Sin grupo WhatsApp'}
        >
          {row.original.grupo_whatsapp ? <Check size={14} /> : <X size={14} />}
        </button>
      )
    },
    {
      accessorKey: 'citado_ypf',
      header: 'Citado',
      cell: ({ row }) => (
        <button
          className={`prog-check-btn ${row.original.citado_ypf ? 'checked' : ''}`}
          onClick={() => handleUpdateField(row.original.id, 'citado_ypf', !row.original.citado_ypf)}
          title={row.original.citado_ypf ? 'Citado YPF' : 'No citado'}
        >
          {row.original.citado_ypf ? <Check size={14} /> : <X size={14} />}
        </button>
      )
    },
    {
      accessorKey: 'confirmacion_asistencia',
      header: 'Confirmación',
      cell: ({ row }) => (
        <select
          className={`prog-inline-select confirmacion ${row.original.confirmacion_asistencia || 'sin_confirmar'}`}
          value={row.original.confirmacion_asistencia || 'sin_confirmar'}
          onChange={(e) => handleUpdateField(row.original.id, 'confirmacion_asistencia', e.target.value)}
          title="Confirmación de asistencia"
        >
          <option value="sin_confirmar">Sin confirmar</option>
          <option value="confirmo">Confirmó</option>
          <option value="no_confirmo">No confirmó</option>
          <option value="reprogramar">Reprogramar</option>
        </select>
      )
    },
    {
      accessorKey: 'estado_cabify',
      header: 'Cabify',
      cell: ({ row }) => (
        <select
          className={`prog-inline-select cabify ${row.original.estado_cabify || 'pendiente'}`}
          value={row.original.estado_cabify || 'pendiente'}
          onChange={(e) => handleUpdateField(row.original.id, 'estado_cabify', e.target.value)}
          title="Estado Cabify"
        >
          <option value="pendiente">Pendiente</option>
          <option value="listo_cabify">Listo Cabify</option>
          <option value="asignar_auto">Asignar Auto</option>
          <option value="crear_cuenta">Crear Cuenta</option>
        </select>
      )
    },
    {
      accessorKey: 'direccion',
      header: 'Dirección',
      cell: ({ row }) => {
        const [editing, setEditing] = useState(false)
        const [value, setValue] = useState(row.original.direccion || '')

        const handleSave = () => {
          if (value !== row.original.direccion) {
            handleUpdateField(row.original.id, 'direccion', value || null)
          }
          setEditing(false)
        }

        if (editing) {
          return (
            <input
              type="text"
              className="prog-inline-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
              placeholder="Dirección..."
            />
          )
        }

        return (
          <div
            className="prog-direccion-cell"
            onClick={() => setEditing(true)}
            title={row.original.direccion || 'Click para agregar dirección'}
          >
            <MapPin size={12} />
            <span>{row.original.direccion || '-'}</span>
          </div>
        )
      }
    },
    {
      accessorKey: 'especialista_nombre',
      header: 'Especialista',
      cell: ({ row }) => {
        const [editing, setEditing] = useState(false)
        const [value, setValue] = useState(row.original.especialista_nombre || '')

        const handleSave = () => {
          if (value !== row.original.especialista_nombre) {
            handleUpdateField(row.original.id, 'especialista_nombre', value || null)
          }
          setEditing(false)
        }

        if (editing) {
          return (
            <input
              type="text"
              className="prog-inline-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
              placeholder="Nombre..."
              style={{ minWidth: '100px' }}
            />
          )
        }

        return (
          <div
            className="prog-especialista-cell"
            onClick={() => setEditing(true)}
            title={row.original.especialista_nombre || 'Click para agregar especialista'}
          >
            <User size={12} />
            <span>{row.original.especialista_nombre || '-'}</span>
          </div>
        )
      }
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="prog-actions">
          <button
            className="prog-btn prog-btn-view"
            title="Ver detalles"
            onClick={() => setPreviewProgramacion(row.original)}
          >
            <Eye size={16} />
          </button>
          <button
            className="prog-btn prog-btn-send"
            title={row.original.asignacion_id ? 'Ya enviado' : 'Enviar a Entrega'}
            onClick={() => handleEnviarAEntrega(row.original)}
            disabled={!!row.original.asignacion_id}
          >
            <Send size={16} />
          </button>
          <button
            className="prog-btn prog-btn-estado"
            title="Cambiar estado"
            onClick={() => handleCambiarEstado(row.original)}
            disabled={!!row.original.asignacion_id}
          >
            <ArrowRightLeft size={16} />
          </button>
          <button
            className="prog-btn prog-btn-copy"
            title="Generar mensaje WhatsApp"
            onClick={() => handleCopiarMensaje(row.original)}
          >
            <MessageSquareText size={16} />
          </button>
          <button
            className="prog-btn prog-btn-edit"
            title="Editar"
            onClick={() => handleEdit(row.original)}
            disabled={!!row.original.asignacion_id}
          >
            <Pencil size={16} />
          </button>
          <button
            className="prog-btn prog-btn-delete"
            title={row.original.asignacion_id ? 'Eliminar (ya enviada a Entrega)' : 'Eliminar'}
            onClick={() => handleDelete(row.original.id, !!row.original.asignacion_id)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )
    }
  ], [canCreate, canEdit, canDelete])

  // Calcular estadisticas
  const stats = useMemo(() => {
    const porAgendar = programaciones.filter(p => p.estado === 'por_agendar').length
    const agendados = programaciones.filter(p => p.estado === 'agendado').length
    // Enviadas = solo las que fueron enviadas a entrega (tienen asignacion_id)
    const enviadas = programaciones.filter(p => p.asignacion_id).length
    const condNuevos = programaciones.filter(p => p.tipo_asignacion === 'entrega_auto' && !p.asignacion_id).length
    const condAnexo = programaciones.filter(p => p.tipo_documento === 'anexo' && !p.asignacion_id).length

    return { porAgendar, agendados, enviadas, condNuevos, condAnexo }
  }, [programaciones])

  // Filtrar datos segun stat card activo
  const filteredData = useMemo(() => {
    switch (activeFilter) {
      case 'por_agendar':
        return programaciones.filter(p => p.estado === 'por_agendar')
      case 'agendados':
        return programaciones.filter(p => p.estado === 'agendado')
      case 'completados':
        // Solo las enviadas a entrega
        return programaciones.filter(p => p.asignacion_id)
      case 'cond_nuevos':
        return programaciones.filter(p => p.tipo_asignacion === 'entrega_auto' && !p.asignacion_id)
      case 'cond_anexo':
        return programaciones.filter(p => p.tipo_documento === 'anexo' && !p.asignacion_id)
      default:
        return programaciones
    }
  }, [programaciones, activeFilter])

  // Handler para click en stat card
  const handleStatClick = (filter: FilterType) => {
    setActiveFilter(prev => prev === filter ? 'all' : filter)
  }

  return (
    <div className="prog-module">
      {/* Stats Cards - Clickeables para filtrar */}
      <div className="prog-stats">
        <div className="prog-stats-grid">
          <div 
            className={`stat-card stat-card-clickable ${activeFilter === 'por_agendar' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('por_agendar')}
          >
            <ClipboardList size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.porAgendar}</span>
              <span className="stat-label">Por Agendar</span>
            </div>
          </div>
          <div 
            className={`stat-card stat-card-clickable ${activeFilter === 'agendados' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('agendados')}
          >
            <Calendar size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.agendados}</span>
              <span className="stat-label">Agendados</span>
            </div>
          </div>
          <div 
            className={`stat-card stat-card-clickable ${activeFilter === 'completados' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('completados')}
          >
            <CheckCircle size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.enviadas}</span>
              <span className="stat-label">Enviadas</span>
            </div>
          </div>
          <div 
            className={`stat-card stat-card-clickable ${activeFilter === 'cond_nuevos' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('cond_nuevos')}
          >
            <UserPlus size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.condNuevos}</span>
              <span className="stat-label">Cond. Nuevos</span>
            </div>
          </div>
          <div 
            className={`stat-card stat-card-clickable ${activeFilter === 'cond_anexo' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('cond_anexo')}
          >
            <FileText size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.condAnexo}</span>
              <span className="stat-label">Cond. Anexo</span>
            </div>
          </div>
        </div>
      </div>

      {/* DataTable con boton de crear */}
      <DataTable
        data={filteredData}
        columns={columns}
        loading={loading}
        error={error}
        searchPlaceholder="Buscar por patente, conductor..."
        emptyIcon={<Calendar size={48} />}
        emptyTitle="No hay programaciones"
        emptyDescription={canCreate ? "Crea una nueva programacion para comenzar" : "No tienes programaciones asignadas"}
        pageSize={100}
        pageSizeOptions={[10, 20, 50, 100]}
        headerAction={(
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn-secondary"
              onClick={() => loadProgramaciones()}
              title="Recargar datos"
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
            <button className="btn-primary" onClick={handleCreate}>
              <Plus size={16} />
              Nueva Programación
            </button>
          </div>
        )}
      />

      {/* Wizard Modal para CREAR (nuevo diseño visual) */}
      {showCreateWizard && (
        <ProgramacionAssignmentWizard
          onClose={() => setShowCreateWizard(false)}
          onSuccess={() => {
            loadProgramaciones()
            setShowCreateWizard(false)
          }}
        />
      )}

      {/* Modal Edicion Rapida */}
      {showQuickEdit && editingProgramacion && (
        <div className="prog-modal-overlay" onClick={() => { setShowQuickEdit(false); setEditingProgramacion(null) }}>
          <div className="prog-modal prog-modal-wide" onClick={e => e.stopPropagation()}>
            <div className="prog-modal-header">
              <h2>Editar Programacion</h2>
              <button onClick={() => { setShowQuickEdit(false); setEditingProgramacion(null) }}>
                <XCircle size={20} />
              </button>
            </div>
            <div className="prog-modal-body">
              {/* Vehiculo - Editable con busqueda */}
              <div className="prog-modal-section">
                <h3><Car size={16} /> Vehiculo</h3>
                <div className="prog-searchable-select">
                  <input
                    type="text"
                    value={selectedVehiculo ? `${selectedVehiculo.patente} - ${selectedVehiculo.marca} ${selectedVehiculo.modelo}` : vehiculoSearch}
                    onChange={(e) => {
                      setVehiculoSearch(e.target.value)
                      setQuickEditData(prev => ({ ...prev, vehiculo_id: undefined }))
                    }}
                    onFocus={() => setShowVehiculoDropdown(true)}
                    onBlur={() => setTimeout(() => setShowVehiculoDropdown(false), 200)}
                    placeholder={loadingVehiculos ? 'Cargando vehiculos...' : 'Buscar por patente, marca o modelo...'}
                    className="prog-input"
                    disabled={loadingVehiculos}
                  />
                  {showVehiculoDropdown && !loadingVehiculos && (
                    <div className="prog-searchable-dropdown">
                      {filteredVehiculos.length > 0 ? (
                        filteredVehiculos.map(v => (
                          <div
                            key={v.id}
                            className={`prog-searchable-option ${quickEditData.vehiculo_id === v.id ? 'selected' : ''}`}
                            onClick={() => {
                              setQuickEditData(prev => ({ ...prev, vehiculo_id: v.id }))
                              setVehiculoSearch('')
                              setShowVehiculoDropdown(false)
                            }}
                          >
                            <strong>{v.patente}</strong> - {v.marca} {v.modelo}
                          </div>
                        ))
                      ) : (
                        <div className="prog-searchable-no-results">
                          {vehiculoSearch ? 'No se encontraron vehiculos' : 'Escribe para buscar...'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Modalidad (solo lectura) */}
              <div className="prog-modal-section" style={{ background: '#F9FAFB', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#6B7280' }}>Modalidad</label>
                    <p style={{ fontWeight: '600', margin: 0 }}>{editingProgramacion.modalidad || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Fecha y Hora */}
              <div className="prog-modal-section">
                <h3><Calendar size={16} /> Cita</h3>
                <div className="prog-modal-grid">
                  <div>
                    <label>Fecha *</label>
                    <input
                      type="date"
                      value={quickEditData.fecha_cita || ''}
                      onChange={e => setQuickEditData(prev => ({ ...prev, fecha_cita: e.target.value }))}
                      className="prog-input"
                    />
                  </div>
                  <div>
                    <label>Hora *</label>
                    <input
                      type="time"
                      value={quickEditData.hora_cita || ''}
                      onChange={e => setQuickEditData(prev => ({ ...prev, hora_cita: e.target.value }))}
                      className="prog-input"
                    />
                  </div>
                </div>
              </div>

              {/* Campos segun modalidad */}
              {editingProgramacion.modalidad === 'TURNO' ? (
                <>
                  {/* Conductor Diurno */}
                  <div className="prog-modal-section" style={{ background: '#FEF9C3', padding: '12px', borderRadius: '8px' }}>
                    <h3 style={{ color: '#92400E', margin: '0 0 12px 0', fontSize: '14px' }}>🌞 Conductor Diurno</h3>
                    {/* Selector de conductor diurno */}
                    <div style={{ marginBottom: '12px' }}>
                      <label>Conductor *</label>
                      <div className="prog-searchable-select">
                        <input
                          type="text"
                          value={selectedConductorDiurno ? selectedConductorDiurno.nombre : conductorDiurnoSearch}
                          onChange={(e) => {
                            setConductorDiurnoSearch(e.target.value)
                            setQuickEditData(prev => ({ ...prev, conductor_diurno_id: undefined, conductor_diurno_nombre: '' }))
                          }}
                          onFocus={() => setShowConductorDiurnoDropdown(true)}
                          onBlur={() => setTimeout(() => setShowConductorDiurnoDropdown(false), 200)}
                          placeholder={loadingConductores ? 'Cargando conductores...' : 'Buscar por nombre o DNI...'}
                          className="prog-input"
                          disabled={loadingConductores}
                        />
                        {showConductorDiurnoDropdown && !loadingConductores && (
                          <div className="prog-searchable-dropdown">
                            {filteredConductoresDiurno.length > 0 ? (
                              filteredConductoresDiurno.slice(0, 50).map(c => (
                                <div
                                  key={c.id}
                                  className={`prog-searchable-option ${quickEditData.conductor_diurno_id === c.id ? 'selected' : ''}`}
                                  onClick={() => {
                                    setQuickEditData(prev => ({ ...prev, conductor_diurno_id: c.id, conductor_diurno_nombre: c.nombre }))
                                    setConductorDiurnoSearch('')
                                    setShowConductorDiurnoDropdown(false)
                                  }}
                                >
                                  <strong>{c.nombre}</strong> {c.dni && <span style={{ color: '#6B7280' }}>- DNI: {c.dni}</span>}
                                </div>
                              ))
                            ) : (
                              <div className="prog-searchable-no-results">
                                {conductorDiurnoSearch ? 'No se encontraron conductores' : 'Escribe para buscar...'}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="prog-modal-grid">
                      <div>
                        <label>Tipo Candidato *</label>
                        <select
                          value={quickEditData.tipo_candidato_diurno || ''}
                          onChange={e => setQuickEditData(prev => ({ ...prev, tipo_candidato_diurno: e.target.value as any }))}
                          className="prog-input"
                        >
                          <option value="">Seleccionar...</option>
                          <option value="nuevo">Nuevo</option>
                          <option value="antiguo">Antiguo</option>
                          <option value="reingreso">Reingreso</option>
                        </select>
                      </div>
                      <div>
                        <label>Tipo Asignación *</label>
                        <select
                          value={quickEditData.tipo_asignacion_diurno || 'entrega_auto'}
                          onChange={e => setQuickEditData(prev => ({ ...prev, tipo_asignacion_diurno: e.target.value as any }))}
                          className="prog-input"
                        >
                          <option value="entrega_auto">Entrega de auto</option>
                          <option value="asignacion_companero">Asignación compañero</option>
                          <option value="cambio_auto">Cambio de auto</option>
                          <option value="cambio_turno">Cambio de turno</option>
                          <option value="devolucion_vehiculo">Devolución vehículo</option>
                        </select>
                      </div>
                      <div>
                        <label>Documento *</label>
                        <select
                          value={quickEditData.documento_diurno || ''}
                          onChange={e => setQuickEditData(prev => ({ ...prev, documento_diurno: e.target.value as any }))}
                          className="prog-input"
                        >
                          <option value="">Seleccionar...</option>
                          <option value="contrato">Contrato</option>
                          <option value="carta_oferta">Carta Oferta</option>
                          <option value="anexo">Anexo</option>
                          <option value="na">N/A</option>
                        </select>
                      </div>
                      <div>
                        <label>Zona *</label>
                        <input
                          type="text"
                          value={quickEditData.zona_diurno || ''}
                          onChange={e => setQuickEditData(prev => ({ ...prev, zona_diurno: e.target.value }))}
                          className="prog-input"
                          placeholder="Ej: Norte, Sur, CABA..."
                        />
                      </div>
                      <div>
                        <label>Distancia (min)</label>
                        <input
                          type="number"
                          value={quickEditData.distancia_diurno || ''}
                          onChange={e => setQuickEditData(prev => ({ ...prev, distancia_diurno: e.target.value ? parseInt(e.target.value) : undefined }))}
                          className="prog-input"
                          placeholder="Minutos"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Conductor Nocturno */}
                  <div className="prog-modal-section" style={{ background: '#DBEAFE', padding: '12px', borderRadius: '8px', marginTop: '12px' }}>
                    <h3 style={{ color: '#1E40AF', margin: '0 0 12px 0', fontSize: '14px' }}>🌙 Conductor Nocturno</h3>
                    {/* Selector de conductor nocturno */}
                    <div style={{ marginBottom: '12px' }}>
                      <label>Conductor *</label>
                      <div className="prog-searchable-select">
                        <input
                          type="text"
                          value={selectedConductorNocturno ? selectedConductorNocturno.nombre : conductorNocturnoSearch}
                          onChange={(e) => {
                            setConductorNocturnoSearch(e.target.value)
                            setQuickEditData(prev => ({ ...prev, conductor_nocturno_id: undefined, conductor_nocturno_nombre: '' }))
                          }}
                          onFocus={() => setShowConductorNocturnoDropdown(true)}
                          onBlur={() => setTimeout(() => setShowConductorNocturnoDropdown(false), 200)}
                          placeholder={loadingConductores ? 'Cargando conductores...' : 'Buscar por nombre o DNI...'}
                          className="prog-input"
                          disabled={loadingConductores}
                        />
                        {showConductorNocturnoDropdown && !loadingConductores && (
                          <div className="prog-searchable-dropdown">
                            {filteredConductoresNocturno.length > 0 ? (
                              filteredConductoresNocturno.slice(0, 50).map(c => (
                                <div
                                  key={c.id}
                                  className={`prog-searchable-option ${quickEditData.conductor_nocturno_id === c.id ? 'selected' : ''}`}
                                  onClick={() => {
                                    setQuickEditData(prev => ({ ...prev, conductor_nocturno_id: c.id, conductor_nocturno_nombre: c.nombre }))
                                    setConductorNocturnoSearch('')
                                    setShowConductorNocturnoDropdown(false)
                                  }}
                                >
                                  <strong>{c.nombre}</strong> {c.dni && <span style={{ color: '#6B7280' }}>- DNI: {c.dni}</span>}
                                </div>
                              ))
                            ) : (
                              <div className="prog-searchable-no-results">
                                {conductorNocturnoSearch ? 'No se encontraron conductores' : 'Escribe para buscar...'}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="prog-modal-grid">
                      <div>
                        <label>Tipo Candidato *</label>
                        <select
                          value={quickEditData.tipo_candidato_nocturno || ''}
                          onChange={e => setQuickEditData(prev => ({ ...prev, tipo_candidato_nocturno: e.target.value as any }))}
                          className="prog-input"
                        >
                          <option value="">Seleccionar...</option>
                          <option value="nuevo">Nuevo</option>
                          <option value="antiguo">Antiguo</option>
                          <option value="reingreso">Reingreso</option>
                        </select>
                      </div>
                      <div>
                        <label>Tipo Asignación *</label>
                        <select
                          value={quickEditData.tipo_asignacion_nocturno || 'entrega_auto'}
                          onChange={e => setQuickEditData(prev => ({ ...prev, tipo_asignacion_nocturno: e.target.value as any }))}
                          className="prog-input"
                        >
                          <option value="entrega_auto">Entrega de auto</option>
                          <option value="asignacion_companero">Asignación compañero</option>
                          <option value="cambio_auto">Cambio de auto</option>
                          <option value="cambio_turno">Cambio de turno</option>
                          <option value="devolucion_vehiculo">Devolución vehículo</option>
                        </select>
                      </div>
                      <div>
                        <label>Documento *</label>
                        <select
                          value={quickEditData.documento_nocturno || ''}
                          onChange={e => setQuickEditData(prev => ({ ...prev, documento_nocturno: e.target.value as any }))}
                          className="prog-input"
                        >
                          <option value="">Seleccionar...</option>
                          <option value="contrato">Contrato</option>
                          <option value="carta_oferta">Carta Oferta</option>
                          <option value="anexo">Anexo</option>
                          <option value="na">N/A</option>
                        </select>
                      </div>
                      <div>
                        <label>Zona *</label>
                        <input
                          type="text"
                          value={quickEditData.zona_nocturno || ''}
                          onChange={e => setQuickEditData(prev => ({ ...prev, zona_nocturno: e.target.value }))}
                          className="prog-input"
                          placeholder="Ej: Norte, Sur, CABA..."
                        />
                      </div>
                      <div>
                        <label>Distancia (min)</label>
                        <input
                          type="number"
                          value={quickEditData.distancia_nocturno || ''}
                          onChange={e => setQuickEditData(prev => ({ ...prev, distancia_nocturno: e.target.value ? parseInt(e.target.value) : undefined }))}
                          className="prog-input"
                          placeholder="Minutos"
                          />
                        </div>
                      </div>
                    </div>
                </>
              ) : (
                /* A Cargo - campos legacy */
                <div className="prog-modal-section" style={{ background: '#F3F4F6', padding: '12px', borderRadius: '8px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px' }}><User size={16} /> Conductor</h3>
                  {/* Selector de conductor */}
                  <div style={{ marginBottom: '12px' }}>
                    <label>Conductor *</label>
                    <div className="prog-searchable-select">
                      <input
                        type="text"
                        value={selectedConductor ? selectedConductor.nombre : conductorSearch}
                        onChange={(e) => {
                          setConductorSearch(e.target.value)
                          setQuickEditData(prev => ({ ...prev, conductor_id: undefined, conductor_nombre: '' }))
                        }}
                        onFocus={() => setShowConductorDropdown(true)}
                        onBlur={() => setTimeout(() => setShowConductorDropdown(false), 200)}
                        placeholder={loadingConductores ? 'Cargando conductores...' : 'Buscar por nombre o DNI...'}
                        className="prog-input"
                        disabled={loadingConductores}
                      />
                      {showConductorDropdown && !loadingConductores && (
                        <div className="prog-searchable-dropdown">
                          {filteredConductores.length > 0 ? (
                            filteredConductores.slice(0, 50).map(c => (
                              <div
                                key={c.id}
                                className={`prog-searchable-option ${quickEditData.conductor_id === c.id ? 'selected' : ''}`}
                                onClick={() => {
                                  setQuickEditData(prev => ({ ...prev, conductor_id: c.id, conductor_nombre: c.nombre }))
                                  setConductorSearch('')
                                  setShowConductorDropdown(false)
                                }}
                              >
                                <strong>{c.nombre}</strong> {c.dni && <span style={{ color: '#6B7280' }}>- DNI: {c.dni}</span>}
                              </div>
                            ))
                          ) : (
                            <div className="prog-searchable-no-results">
                              {conductorSearch ? 'No se encontraron conductores' : 'Escribe para buscar...'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="prog-modal-grid">
                    <div>
                      <label>Tipo Candidato *</label>
                      <select
                        value={quickEditData.tipo_candidato || ''}
                        onChange={e => setQuickEditData(prev => ({ ...prev, tipo_candidato: e.target.value as any }))}
                        className="prog-input"
                      >
                        <option value="">Seleccionar...</option>
                        <option value="nuevo">Nuevo</option>
                        <option value="antiguo">Antiguo</option>
                        <option value="reingreso">Reingreso</option>
                      </select>
                    </div>
                    <div>
                      <label>Documento *</label>
                      <select
                        value={quickEditData.tipo_documento || ''}
                        onChange={e => setQuickEditData(prev => ({ ...prev, tipo_documento: e.target.value as any }))}
                        className="prog-input"
                      >
                        <option value="">Seleccionar...</option>
                        <option value="contrato">Contrato</option>
                        <option value="carta_oferta">Carta Oferta</option>
                        <option value="anexo">Anexo</option>
                        <option value="na">N/A</option>
                      </select>
                    </div>
                    <div>
                      <label>Zona *</label>
                      <input
                        type="text"
                        value={quickEditData.zona || ''}
                        onChange={e => setQuickEditData(prev => ({ ...prev, zona: e.target.value as any }))}
                        className="prog-input"
                        placeholder="Ej: Norte, Sur, CABA..."
                      />
                    </div>
                    <div>
                      <label>Distancia (min)</label>
                      <input
                        type="number"
                        value={quickEditData.distancia_minutos || ''}
                        onChange={e => setQuickEditData(prev => ({ ...prev, distancia_minutos: e.target.value ? parseInt(e.target.value) : undefined }))}
                        className="prog-input"
                        placeholder="Minutos"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Observaciones */}
              <div className="prog-modal-section" style={{ marginTop: '12px' }}>
                <h3><FileText size={16} /> Observaciones</h3>
                <textarea
                  value={quickEditData.observaciones || ''}
                  onChange={e => setQuickEditData(prev => ({ ...prev, observaciones: e.target.value }))}
                  className="prog-input"
                  rows={3}
                  placeholder="Notas adicionales..."
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
            </div>
            <div className="prog-modal-footer">
              <button
                className="prog-btn prog-btn-secondary"
                onClick={() => { setShowQuickEdit(false); setEditingProgramacion(null) }}
              >
                Cancelar
              </button>
              <button
                className="prog-btn prog-btn-primary"
                onClick={handleSaveQuickEdit}
                disabled={savingQuickEdit}
              >
                {savingQuickEdit ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewProgramacion && (
        <div className="prog-modal-overlay" onClick={() => setPreviewProgramacion(null)}>
          <div className="prog-modal" onClick={e => e.stopPropagation()}>
            <div className="prog-modal-header">
              <h2>Detalle de Programacion</h2>
              <button onClick={() => setPreviewProgramacion(null)}>
                <XCircle size={20} />
              </button>
            </div>
            <div className="prog-modal-body">
              {/* Vehiculo */}
              <div className="prog-modal-section">
                <h3><Car size={16} /> Vehiculo</h3>
                <div className="prog-modal-grid">
                  <div>
                    <label>Patente</label>
                    <p>{previewProgramacion.vehiculo_entregar_patente || previewProgramacion.vehiculo_entregar_patente_sistema || '-'}</p>
                  </div>
                  <div>
                    <label>Modelo</label>
                    <p>{previewProgramacion.vehiculo_entregar_modelo || previewProgramacion.vehiculo_entregar_modelo_sistema || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Conductor */}
              <div className="prog-modal-section">
                <h3><User size={16} /> Conductor</h3>
                <div className="prog-modal-grid">
                  <div>
                    <label>Nombre</label>
                    <p>{previewProgramacion.conductor_display || previewProgramacion.conductor_nombre || '-'}</p>
                  </div>
                  {previewProgramacion.conductor_dni && (
                    <div>
                      <label>DNI</label>
                      <p>{previewProgramacion.conductor_dni}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Tipo y Modalidad */}
              <div className="prog-modal-section">
                <h3><FileText size={16} /> Asignacion</h3>
                <div className="prog-modal-grid">
                  <div>
                    <label>Tipo</label>
                    <p>{TIPO_ASIGNACION_LABELS[previewProgramacion.tipo_asignacion || ''] || '-'}</p>
                  </div>
                  <div>
                    <label>Modalidad</label>
                    <p>{previewProgramacion.modalidad === 'TURNO' ? 'Turno' : 'A Cargo'}</p>
                  </div>
                  {previewProgramacion.turno && (
                    <div>
                      <label>Turno</label>
                      <p>{previewProgramacion.turno === 'diurno' ? 'Diurno' : 'Nocturno'}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Cita */}
              <div className="prog-modal-section">
                <h3><Calendar size={16} /> Cita</h3>
                <div className="prog-modal-grid">
                  <div>
                    <label>Fecha</label>
                    <p>{previewProgramacion.fecha_cita ? new Date(previewProgramacion.fecha_cita).toLocaleDateString('es-AR') : '-'}</p>
                  </div>
                  <div>
                    <label>Hora</label>
                    <p>{previewProgramacion.hora_cita?.substring(0, 5) || '-'}</p>
                  </div>
                  {previewProgramacion.zona && (
                    <div>
                      <label>Zona</label>
                      <p>{previewProgramacion.zona}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Estado */}
              <div className="prog-modal-section">
                <h3>Estado</h3>
                <span className={`prog-estado-badge ${previewProgramacion.estado}`}>
                  {ESTADO_LABELS[previewProgramacion.estado] || previewProgramacion.estado}
                </span>
                {previewProgramacion.asignacion_id && (
                  <p className="prog-asignacion-info">
                    <CheckCircle size={14} />
                    Asignacion creada: <strong>{previewProgramacion.asignacion_codigo}</strong>
                  </p>
                )}
              </div>

              {/* Observaciones */}
              {previewProgramacion.observaciones && (
                <div className="prog-modal-section">
                  <h3>Observaciones</h3>
                  <p className="prog-observaciones">{previewProgramacion.observaciones}</p>
                </div>
              )}
            </div>
            <div className="prog-modal-footer">
              <button className="btn-secondary" onClick={() => setPreviewProgramacion(null)}>
                Cerrar
              </button>
              {!previewProgramacion.asignacion_id && canEdit && (
                <>
                  <button 
                    className="btn-secondary"
                    onClick={() => {
                      setPreviewProgramacion(null)
                      handleEdit(previewProgramacion)
                    }}
                  >
                    <Pencil size={16} />
                    Editar
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      handleEnviarAEntrega(previewProgramacion)
                    }}
                    disabled={!!previewProgramacion.asignacion_id}
                    title={previewProgramacion.asignacion_id ? 'Ya enviado' : 'Enviar a Entrega'}
                  >
                    <Send size={16} />
                    {previewProgramacion.asignacion_id ? 'Ya Enviado' : 'Enviar a Entrega'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Cambiar Estado */}
      {showEstadoModal && estadoModalProg && (
        <div className="prog-modal-overlay" onClick={() => setShowEstadoModal(false)}>
          <div className="prog-modal prog-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="prog-modal-header">
              <h2>Cambiar Estado</h2>
              <button onClick={() => setShowEstadoModal(false)}>
                <XCircle size={20} />
              </button>
            </div>
            <div className="prog-modal-body">
              <div className="prog-modal-info">
                <p><strong>Conductor:</strong> {estadoModalProg.conductor_display || estadoModalProg.conductor_nombre || 'Sin conductor'}</p>
                <p><strong>Vehiculo:</strong> {estadoModalProg.vehiculo_entregar_patente || '-'}</p>
                <p><strong>Estado actual:</strong> <span className={`prog-estado-badge ${estadoModalProg.estado}`}>{ESTADO_LABELS[estadoModalProg.estado]}</span></p>
              </div>
              <div className="form-group">
                <label>Nuevo Estado</label>
                <select 
                  value={nuevoEstado} 
                  onChange={e => setNuevoEstado(e.target.value)}
                  className="form-select"
                >
                  <option value="por_agendar">Por Agendar</option>
                  <option value="agendado">Agendado</option>
                  <option value="en_curso">En Curso</option>
                  <option value="completado">Completado</option>
                </select>
              </div>
            </div>
            <div className="prog-modal-footer">
              <button className="btn-secondary" onClick={() => setShowEstadoModal(false)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={handleGuardarEstado}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Copiar Mensaje */}
      {showMensajeModal && mensajeModalProg && (
        <div className="prog-modal-overlay" onClick={() => setShowMensajeModal(false)}>
          <div className="prog-modal" onClick={e => e.stopPropagation()}>
            <div className="prog-modal-header">
              <h2>Mensaje de Agenda</h2>
              <button onClick={() => setShowMensajeModal(false)}>
                <XCircle size={20} />
              </button>
            </div>
            <div className="prog-modal-body">
              <div className="prog-modal-info">
                {mensajeModalProg.modalidad === 'TURNO' ? (
                  <>
                    <p><strong>Conductor Diurno:</strong> {mensajeModalProg.conductor_diurno_nombre || 'Sin asignar'}</p>
                    <p><strong>Conductor Nocturno:</strong> {mensajeModalProg.conductor_nocturno_nombre || 'Sin asignar'}</p>
                  </>
                ) : (
                  <p><strong>Conductor:</strong> {mensajeModalProg.conductor_display || mensajeModalProg.conductor_nombre || 'Sin asignar'}</p>
                )}
                <p><strong>Modalidad:</strong> {mensajeModalProg.modalidad === 'TURNO' ? 'Turno' : 'A Cargo'}</p>
              </div>
              <div className="prog-mensaje-preview">
                <pre>{generarMensajeAgenda(mensajeModalProg)}</pre>
              </div>
            </div>
            <div className="prog-modal-footer">
              <button className="btn-secondary" onClick={() => setShowMensajeModal(false)}>
                Cerrar
              </button>
              <button className="btn-primary" onClick={handleCopiarAlPortapapeles}>
                <Copy size={16} />
                Copiar Mensaje
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
