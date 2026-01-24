// src/modules/siniestros/components/ReparacionTicket.tsx
import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { Clock, Wrench, Save } from 'lucide-react'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'
import type { SiniestroReparacion } from '../../../types/siniestros.types'

interface ReparacionTicketProps {
  siniestroId: string
  reparacion?: Partial<SiniestroReparacion> | null
  onSave: () => void
  disabled?: boolean
}

export function ReparacionTicket({
  siniestroId,
  reparacion,
  onSave,
  disabled = false
}: ReparacionTicketProps) {
  const [formData, setFormData] = useState({
    taller: reparacion?.taller || '',
    fecha_inicio: reparacion?.fecha_inicio || '',
    fecha_finalizacion: reparacion?.fecha_finalizacion || '',
    estado: reparacion?.estado || 'INICIADO' as 'INICIADO' | 'FINALIZADO',
    observaciones: reparacion?.observaciones || ''
  })
  const [saving, setSaving] = useState(false)
  const [existingId, setExistingId] = useState<string | null>(reparacion?.id || null)

  // Cargar datos existentes si hay
  useEffect(() => {
    if (reparacion) {
      setFormData({
        taller: reparacion.taller || '',
        fecha_inicio: reparacion.fecha_inicio || '',
        fecha_finalizacion: reparacion.fecha_finalizacion || '',
        estado: reparacion.estado || 'INICIADO',
        observaciones: reparacion.observaciones || ''
      })
      setExistingId(reparacion.id || null)
    }
  }, [reparacion])

  // Calcular dias en reparacion
  const diasEnReparacion = useMemo(() => {
    if (!formData.fecha_inicio) return null
    const inicio = new Date(formData.fecha_inicio)
    const fin = formData.fecha_finalizacion
      ? new Date(formData.fecha_finalizacion)
      : new Date()
    const diff = Math.floor((fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24))
    return diff >= 0 ? diff : 0
  }, [formData.fecha_inicio, formData.fecha_finalizacion])

  async function handleSave() {
    if (!formData.taller || !formData.fecha_inicio) {
      Swal.fire('Error', 'Complete al menos el taller y fecha de inicio', 'warning')
      return
    }

    setSaving(true)
    try {
      const dataToSave = {
        siniestro_id: siniestroId,
        taller: formData.taller,
        fecha_inicio: formData.fecha_inicio,
        fecha_finalizacion: formData.fecha_finalizacion || null,
        estado: formData.estado,
        observaciones: formData.observaciones || null
      }

      if (existingId) {
        // Actualizar
        const { error } = await (supabase.from('siniestros_reparaciones' as any) as any)
          .update(dataToSave)
          .eq('id', existingId)
        if (error) throw error
      } else {
        // Crear nuevo
        const { data, error } = await (supabase.from('siniestros_reparaciones' as any) as any)
          .insert(dataToSave)
          .select()
          .single()
        if (error) throw error
        setExistingId(data.id)
      }

      showSuccess('Ticket guardado')

      onSave()
    } catch (error) {
      Swal.fire('Error', 'No se pudo guardar el ticket de reparacion', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="reparacion-ticket">
      <div className="form-section">
        <div className="form-section-title">
          <Wrench size={18} />
          Ticket de Reparacion
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Taller <span className="required">*</span></label>
            <input
              type="text"
              value={formData.taller}
              onChange={(e) => setFormData(prev => ({ ...prev, taller: e.target.value }))}
              placeholder="Nombre del taller"
              disabled={disabled}
            />
          </div>
          <div className="form-group">
            <label>Estado</label>
            <select
              value={formData.estado}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                estado: e.target.value as 'INICIADO' | 'FINALIZADO'
              }))}
              disabled={disabled}
            >
              <option value="INICIADO">Iniciado</option>
              <option value="FINALIZADO">Finalizado</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Fecha de Inicio <span className="required">*</span></label>
            <input
              type="date"
              value={formData.fecha_inicio}
              onChange={(e) => setFormData(prev => ({ ...prev, fecha_inicio: e.target.value }))}
              disabled={disabled}
            />
          </div>
          <div className="form-group">
            <label>Fecha de Finalizacion</label>
            <input
              type="date"
              value={formData.fecha_finalizacion}
              onChange={(e) => setFormData(prev => ({ ...prev, fecha_finalizacion: e.target.value }))}
              disabled={disabled}
            />
          </div>
        </div>

        {diasEnReparacion !== null && (
          <div className="info-badge reparacion-dias">
            <Clock size={14} />
            <span><strong>{diasEnReparacion}</strong> dias en reparacion</span>
          </div>
        )}

        <div className="form-row">
          <div className="form-group full-width">
            <label>Observaciones</label>
            <textarea
              value={formData.observaciones}
              onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
              placeholder="Notas adicionales sobre la reparacion..."
              disabled={disabled}
            />
          </div>
        </div>

        {!disabled && (
          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              <Save size={16} />
              {saving ? 'Guardando...' : existingId ? 'Actualizar Ticket' : 'Crear Ticket'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
