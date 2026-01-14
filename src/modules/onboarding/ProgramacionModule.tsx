// src/modules/onboarding/ProgramacionModule.tsx
// Modulo de programacion de entregas de vehiculos

import { useState, useEffect, useMemo } from 'react'
import { 
  Car, User, Calendar, FileText, Plus,
  Eye, Trash2, CheckCircle, XCircle, Send,
  ClipboardList, UserPlus, MessageSquareText, ArrowRightLeft, Pencil, Copy
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
  entrega_auto: 'Entrega de Auto',
  cambio_auto: 'Cambio de Auto',
  asignacion_companero: 'Asignacion Companero'
}

// Labels para mensajes de agenda
const TIPO_ASIGNACION_MSG: Record<string, string> = {
  entrega_auto: 'Entrega de auto',
  cambio_auto: 'Cambio de auto',
  asignacion_companero: 'Asignacion de companero'
}

// Funcion para generar mensaje de agenda
function generarMensajeAgenda(prog: ProgramacionOnboardingCompleta): string {
  const tipoMsg = TIPO_ASIGNACION_MSG[prog.tipo_asignacion || ''] || 'Asignacion'
  const conductor = prog.conductor_display || prog.conductor_nombre || 'SIN NOMBRE'
  const patente = prog.vehiculo_entregar_patente || prog.vehiculo_entregar_patente_sistema || 'N/A'
  const zona = prog.zona || 'N/A'
  const distancia = prog.distancia_minutos || 'N/A'
  const documento = prog.tipo_documento === 'contrato' ? 'Contrato' : 
                    prog.tipo_documento === 'anexo' ? 'Anexo' : 'N/A'
  
  // Formatear fecha
  let fechaStr = 'N/A'
  if (prog.fecha_cita) {
    const fecha = new Date(prog.fecha_cita + 'T12:00:00')
    const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
    const dia = dias[fecha.getDay()]
    fechaStr = `${dia} ${fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
  }
  
  const hora = prog.hora_cita?.substring(0, 5) || 'N/A'
  
  // Turno de la fila (diurno/nocturno) o vacio si es A CARGO
  const turnoEmoji = prog.turno === 'diurno' ? '🌞' : prog.turno === 'nocturno' ? '🌙' : ''
  const turnoLabel = prog.turno === 'diurno' ? 'Diurno' : prog.turno === 'nocturno' ? 'Nocturno' : ''
  
  // Generar mensaje unico por fila
  let mensaje = `– ${tipoMsg} a ${conductor.toUpperCase()}
🗓️ Fecha: ${fechaStr}
🕓 Hora: ${hora}
🚗 Auto asignado: ${patente}`

  // Agregar turno solo si tiene (modalidad TURNO)
  if (turnoLabel) {
    mensaje += `\n${turnoEmoji} Turno: ${turnoLabel}`
  }

  mensaje += `
📍 Ubicacion: ${zona}
👥 Distancia: ${distancia} minutos
📄 Documento: ${documento}`

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
  const [showEditWizard, setShowEditWizard] = useState(false)
  const [editingProgramacion, setEditingProgramacion] = useState<ProgramacionOnboardingCompleta | null>(null)
  const [previewProgramacion, setPreviewProgramacion] = useState<ProgramacionOnboardingCompleta | null>(null)
  
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

  useEffect(() => {
    loadProgramaciones()
  }, [])

  // Handlers
  const handleCreate = () => {
    setShowCreateWizard(true)
  }

  const handleEdit = (prog: ProgramacionOnboardingCompleta) => {
    setEditingProgramacion(prog)
    setShowEditWizard(true)
  }

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: 'Eliminar programacion?',
      text: 'Esta accion no se puede deshacer',
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

  // Enviar a entrega - Crear asignacion
  const handleEnviarAEntrega = async (prog: ProgramacionOnboardingCompleta) => {
    // Validar que tenga los datos minimos
    if (!prog.vehiculo_entregar_id && !prog.vehiculo_entregar_patente) {
      Swal.fire('Error', 'La programacion no tiene vehiculo asignado', 'error')
      return
    }

    if (!prog.conductor_id && !prog.conductor_nombre) {
      Swal.fire('Error', 'La programacion no tiene conductor asignado', 'error')
      return
    }

    const result = await Swal.fire({
      title: 'Enviar a Entrega',
      html: `
        <div style="text-align: left; font-size: 14px;">
          <p><strong>Vehiculo:</strong> ${prog.vehiculo_entregar_patente || prog.vehiculo_entregar_patente_sistema || '-'}</p>
          <p><strong>Conductor:</strong> ${prog.conductor_display || prog.conductor_nombre || '-'}</p>
          <p><strong>Modalidad:</strong> ${prog.modalidad === 'TURNO' ? 'Turno' : 'A Cargo'}</p>
          ${prog.turno ? `<p><strong>Turno:</strong> ${prog.turno === 'diurno' ? 'Diurno' : 'Nocturno'}</p>` : ''}
          <p><strong>Fecha:</strong> ${prog.fecha_cita ? new Date(prog.fecha_cita).toLocaleDateString('es-AR') : 'Sin definir'}</p>
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
      // Generar codigo de asignacion
      const fecha = new Date()
      const codigo = `ASG-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}-${String(fecha.getHours()).padStart(2, '0')}${String(fecha.getMinutes()).padStart(2, '0')}`

      // Crear asignacion
      const { data: asignacion, error: asignacionError } = await (supabase
        .from('asignaciones') as any)
        .insert({
          codigo,
          vehiculo_id: prog.vehiculo_entregar_id,
          modalidad: prog.turno ? 'turno' : 'a_cargo',
          horario: prog.turno ? 'TURNO' : 'CARGO',
          fecha_programada: prog.fecha_cita ? `${prog.fecha_cita}T${(prog.hora_cita || '10:00').substring(0, 5)}:00` : new Date().toISOString(),
          estado: 'programado',
          notas: prog.observaciones || `Creado desde programacion. Tipo: ${TIPO_ASIGNACION_LABELS[prog.tipo_asignacion || ''] || prog.tipo_asignacion}`,
          created_by: user?.id || null,
          created_by_name: profile?.full_name || 'Sistema'
        })
        .select()
        .single()

      if (asignacionError) throw asignacionError

      // Crear asignacion_conductor
      if (prog.conductor_id) {
        const { error: conductorError } = await (supabase
          .from('asignaciones_conductores') as any)
          .insert({
            asignacion_id: asignacion.id,
            conductor_id: prog.conductor_id,
            horario: prog.turno || 'todo_dia',
            estado: 'asignado',
            documento: prog.tipo_documento === 'contrato' ? 'CARTA_OFERTA' : 
                       prog.tipo_documento === 'anexo' ? 'ANEXO' : null
          })

        if (conductorError) throw conductorError
      }

      // Actualizar programacion con referencia a la asignacion
      await (supabase.from('programaciones_onboarding') as any)
        .update({ 
          asignacion_id: asignacion.id,
          asignacion_codigo: asignacion.codigo,
          estado: 'completado'
        })
        .eq('id', prog.id)

      // Actualizar localmente
      setProgramaciones(prev => prev.map(p => 
        p.id === prog.id 
          ? { ...p, asignacion_id: asignacion.id, asignacion_codigo: asignacion.codigo, estado: 'completado' as EstadoKanban }
          : p
      ))

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
      header: 'Tipo',
      cell: ({ row }) => (
        <span className="prog-tipo-badge">
          {TIPO_ASIGNACION_LABELS[row.original.tipo_asignacion || ''] || row.original.tipo_asignacion || '-'}
        </span>
      )
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
      header: 'Fecha Cita',
      cell: ({ row }) => (
        <div className="prog-fecha-cell">
          <span>
            {row.original.fecha_cita 
              ? new Date(row.original.fecha_cita).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
              : '-'}
          </span>
        </div>
      )
    },
    {
      accessorKey: 'hora_cita',
      header: 'Hora',
      cell: ({ row }) => (
        <span className="prog-hora">
          {row.original.hora_cita ? row.original.hora_cita.substring(0, 5) : '-'}
        </span>
      )
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
            title="Enviar a Entrega"
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
            title="Eliminar"
            onClick={() => handleDelete(row.original.id)}
            disabled={!!row.original.asignacion_id}
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
          <button className="btn-primary" onClick={handleCreate}>
            <Plus size={16} />
            Nueva Programación
          </button>
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

      {/* Wizard Modal para EDITAR (mismo wizard) */}
      {showEditWizard && editingProgramacion && (
        <ProgramacionAssignmentWizard
          onClose={() => {
            setShowEditWizard(false)
            setEditingProgramacion(null)
          }}
          onSuccess={() => {
            loadProgramaciones()
            setShowEditWizard(false)
            setEditingProgramacion(null)
          }}
          editData={editingProgramacion}
        />
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
                  >
                    <Send size={16} />
                    Enviar a Entrega
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
                <p><strong>Conductor:</strong> {mensajeModalProg.conductor_display || mensajeModalProg.conductor_nombre}</p>
                <p><strong>Modalidad:</strong> {mensajeModalProg.modalidad === 'TURNO' ? 'Turno' : 'A Cargo'}</p>
                {mensajeModalProg.turno && <p><strong>Turno:</strong> {mensajeModalProg.turno === 'diurno' ? 'Diurno' : 'Nocturno'}</p>}
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
