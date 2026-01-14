// src/modules/asignaciones/components/KanbanBoard.tsx
// Tablero Kanban para gestionar programaciones de entregas

import { useState } from 'react'
import { 
  Car, 
  User, 
  Clock, 
  MapPin, 
  FileText, 
  MessageCircle, 
  Phone,
  CheckCircle,
  MoreVertical,
  Edit2,
  Trash2,
  ArrowRight
} from 'lucide-react'
import type { 
  ProgramacionOnboardingCompleta, 
  EstadoKanban
} from '../../../types/onboarding.types'
import {
  TIPO_ASIGNACION_LABELS,
  TIPO_CANDIDATO_LABELS,
  ZONA_LABELS
} from '../../../types/onboarding.types'

interface Props {
  programaciones: ProgramacionOnboardingCompleta[]
  onUpdateEstado: (id: string, nuevoEstado: EstadoKanban) => void
  onEdit: (programacion: ProgramacionOnboardingCompleta) => void
  onDelete: (id: string) => void
  onCreateAsignacion: (programacion: ProgramacionOnboardingCompleta) => void
  onPreview: (programacion: ProgramacionOnboardingCompleta) => void
}

const COLUMNS: { id: EstadoKanban; titulo: string; color: string }[] = [
  { id: 'por_agendar', titulo: 'Por Agendar', color: '#6B7280' },
  { id: 'agendado', titulo: 'Agendado', color: '#3B82F6' },
  { id: 'en_curso', titulo: 'En Curso', color: '#F59E0B' },
  { id: 'completado', titulo: 'Completado', color: '#10B981' }
]

export function KanbanBoard({ programaciones, onUpdateEstado, onEdit, onDelete, onCreateAsignacion, onPreview }: Props) {
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<EstadoKanban | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // Agrupar por estado
  const porEstado = COLUMNS.reduce((acc, col) => {
    acc[col.id] = programaciones.filter(p => p.estado === col.id)
    return acc
  }, {} as Record<EstadoKanban, ProgramacionOnboardingCompleta[]>)

  // Drag handlers
  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggedItem(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, columnId: EstadoKanban) {
    e.preventDefault()
    setDragOverColumn(columnId)
  }

  function handleDragLeave() {
    setDragOverColumn(null)
  }

  function handleDrop(e: React.DragEvent, columnId: EstadoKanban) {
    e.preventDefault()
    if (draggedItem) {
      onUpdateEstado(draggedItem, columnId)
    }
    setDraggedItem(null)
    setDragOverColumn(null)
  }

  function handleDragEnd() {
    setDraggedItem(null)
    setDragOverColumn(null)
  }

  // Formatear fecha
  function formatDate(dateStr?: string) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit'
    })
  }

  // Formatear hora
  function formatTime(timeStr?: string) {
    if (!timeStr) return '-'
    return timeStr.substring(0, 5)
  }

  return (
    <div className="kanban-board">
      {COLUMNS.map(column => (
        <div
          key={column.id}
          className={`kanban-column ${dragOverColumn === column.id ? 'drag-over' : ''}`}
          onDragOver={e => handleDragOver(e, column.id)}
          onDragLeave={handleDragLeave}
          onDrop={e => handleDrop(e, column.id)}
        >
          {/* Header de columna */}
          <div className="kanban-column-header" style={{ borderTopColor: column.color }}>
            <span className="kanban-column-title">{column.titulo}</span>
            <span className="kanban-column-count" style={{ backgroundColor: column.color }}>
              {porEstado[column.id]?.length || 0}
            </span>
          </div>

          {/* Cards */}
          <div className="kanban-column-content">
            {porEstado[column.id]?.map(prog => (
              <div
                key={prog.id}
                className={`kanban-card ${draggedItem === prog.id ? 'dragging' : ''}`}
                draggable
                onDragStart={e => handleDragStart(e, prog.id)}
                onDragEnd={handleDragEnd}
                onClick={(e) => {
                  // No abrir preview si se hizo click en el menu o sus botones
                  const target = e.target as HTMLElement
                  if (target.closest('.kanban-card-menu')) return
                  onPreview(prog)
                }}
                style={{ cursor: 'pointer' }}
              >
                {/* Header del card */}
                <div className="kanban-card-header">
                  <div className="kanban-card-vehicle">
                    <Car size={14} />
                    <span>{prog.vehiculo_entregar_patente || prog.vehiculo_entregar_patente_sistema || '-'}</span>
                  </div>
                  <div className="kanban-card-menu">
                    <button 
                      className="kanban-menu-btn"
                      onClick={() => setOpenMenuId(openMenuId === prog.id ? null : prog.id)}
                    >
                      <MoreVertical size={14} />
                    </button>
                    {openMenuId === prog.id && (
                      <div className="kanban-menu-dropdown">
                        <button onClick={() => { onEdit(prog); setOpenMenuId(null) }}>
                          <Edit2 size={12} /> Editar
                        </button>
                        {column.id === 'completado' && !prog.asignacion_id && (
                          <button onClick={() => { onCreateAsignacion(prog); setOpenMenuId(null) }}>
                            <ArrowRight size={12} /> Crear Asignacion
                          </button>
                        )}
                        <button className="danger" onClick={() => { onDelete(prog.id); setOpenMenuId(null) }}>
                          <Trash2 size={12} /> Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Info del vehiculo */}
                <div className="kanban-card-model">
                  {prog.vehiculo_entregar_modelo || prog.vehiculo_entregar_modelo_sistema || '-'}
                </div>

                {/* Conductor */}
                <div className="kanban-card-conductor">
                  <User size={14} />
                  <span>{prog.conductor_display || prog.conductor_nombre || '-'}</span>
                </div>

                {/* Tags */}
                <div className="kanban-card-tags">
                  {prog.turno && (
                    <span className={`kanban-tag turno-${prog.turno}`}>
                      {prog.turno === 'diurno' ? 'Diurno' : 'Nocturno'}
                    </span>
                  )}
                  {prog.zona && (
                    <span className="kanban-tag zona">
                      <MapPin size={10} />
                      {ZONA_LABELS[prog.zona] || prog.zona}
                    </span>
                  )}
                  {prog.tipo_candidato && (
                    <span className={`kanban-tag candidato-${prog.tipo_candidato}`}>
                      {TIPO_CANDIDATO_LABELS[prog.tipo_candidato] || prog.tipo_candidato}
                    </span>
                  )}
                </div>

                {/* Fecha y hora */}
                {prog.fecha_cita && (
                  <div className="kanban-card-datetime">
                    <Clock size={12} />
                    <span>{formatDate(prog.fecha_cita)} {formatTime(prog.hora_cita)}</span>
                  </div>
                )}

                {/* Checklist */}
                <div className="kanban-card-checklist">
                  <div className={`checklist-item ${prog.grupo_whatsapp ? 'checked' : ''}`} title="Grupo WhatsApp">
                    <MessageCircle size={12} />
                  </div>
                  <div className={`checklist-item ${prog.citado_ypf ? 'checked' : ''}`} title="Citado">
                    <Phone size={12} />
                  </div>
                  <div className={`checklist-item ${prog.documento_listo ? 'checked' : ''}`} title="Documento listo">
                    <FileText size={12} />
                  </div>
                  <div className={`checklist-item ${prog.confirmacion_asistencia === 'confirmo' ? 'checked' : ''}`} title="Confirmo">
                    <CheckCircle size={12} />
                  </div>
                </div>

                {/* Tipo de asignacion */}
                {prog.tipo_asignacion && (
                  <div className="kanban-card-tipo">
                    {TIPO_ASIGNACION_LABELS[prog.tipo_asignacion] || prog.tipo_asignacion}
                  </div>
                )}

                {/* Asignacion vinculada */}
                {prog.asignacion_id && (
                  <div className="kanban-card-asignacion">
                    <CheckCircle size={12} />
                    <span>Asignacion: {prog.asignacion_codigo}</span>
                  </div>
                )}
              </div>
            ))}

            {/* Empty state */}
            {(!porEstado[column.id] || porEstado[column.id].length === 0) && (
              <div className="kanban-empty">
                Sin programaciones
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
