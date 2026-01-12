// src/modules/siniestros/components/SiniestroSeguimiento.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Swal from 'sweetalert2'
import { Plus, Clock, FileText, DollarSign, AlertTriangle, Link2, X } from 'lucide-react'
import type { SiniestroSeguimientoConEstados, SiniestroCompleto } from '../../../types/siniestros.types'

interface SiniestroSeguimientoProps {
  siniestro: SiniestroCompleto
  onReload: () => void
}

interface SeguimientoFormData {
  tipo_evento: 'nota' | 'pago' | 'cobro_conductor'
  descripcion: string
  monto?: number
  cobrar_conductor: boolean
}

const TIPO_EVENTO_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  nota: { label: 'Nota', icon: <FileText size={14} />, color: '#6366f1' },
  pago: { label: 'Pago Recibido', icon: <DollarSign size={14} />, color: '#10b981' },
  cobro_conductor: { label: 'Cobro a Conductor', icon: <AlertTriangle size={14} />, color: '#ef4444' },
  estado_cambio: { label: 'Cambio de Estado', icon: <Clock size={14} />, color: '#f59e0b' },
  documento: { label: 'Documento', icon: <FileText size={14} />, color: '#8b5cf6' }
}

export function SiniestroSeguimiento({ siniestro, onReload }: SiniestroSeguimientoProps) {
  const { user, profile } = useAuth()
  const [seguimientos, setSeguimientos] = useState<SiniestroSeguimientoConEstados[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<SeguimientoFormData>({
    tipo_evento: 'nota',
    descripcion: '',
    cobrar_conductor: false
  })

  useEffect(() => {
    cargarSeguimientos()
  }, [siniestro.id])

  async function cargarSeguimientos() {
    setLoading(true)
    try {
      const { data, error } = await (supabase
        .from('siniestros_seguimientos' as any) as any)
        .select('*')
        .eq('siniestro_id', siniestro.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setSeguimientos(data || [])
    } catch (error) {
      console.error('Error cargando seguimientos:', error)
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setFormData({
      tipo_evento: 'nota',
      descripcion: '',
      cobrar_conductor: false
    })
    setShowForm(false)
  }

  async function handleGuardar() {
    if (!formData.descripcion.trim()) {
      Swal.fire('Error', 'La descripcion es requerida', 'error')
      return
    }

    if (formData.cobrar_conductor && (!formData.monto || formData.monto <= 0)) {
      Swal.fire('Error', 'Debe ingresar un monto para cobrar al conductor', 'error')
      return
    }

    // Validar que el siniestro tenga conductor y vehiculo para cobrar
    if (formData.cobrar_conductor && !siniestro.conductor_id) {
      Swal.fire('Error', 'El siniestro debe tener un conductor asignado para generar el cobro', 'error')
      return
    }

    if (formData.cobrar_conductor && !siniestro.vehiculo_id) {
      Swal.fire('Error', 'El siniestro debe tener un vehiculo asignado para generar el cobro', 'error')
      return
    }

    setSaving(true)
    try {
      let incidenciaId: string | null = null
      let penalidadId: string | null = null

      // Si es cobro a conductor, primero crear la incidencia y penalidad
      if (formData.cobrar_conductor && formData.monto && formData.monto > 0) {
        // 1. Buscar estado "Registrada" de incidencias
        const { data: estadosInc } = await supabase
          .from('incidencias_estados')
          .select('id')
          .eq('codigo', 'registrada')
          .single()

        const estadoRegistradaId = estadosInc?.id

        // 2. Buscar tipo de penalidad "Siniestro" o crear uno generico
        const { data: tiposPen } = await (supabase
          .from('tipos_penalidades' as any) as any)
          .select('id')
          .ilike('nombre', '%siniestro%')
          .limit(1)

        const tipoPenalidadId = tiposPen?.[0]?.id

        // 3. Crear la incidencia
        const { data: incidenciaData, error: incError } = await supabase
          .from('incidencias')
          .insert({
            vehiculo_id: siniestro.vehiculo_id,
            conductor_id: siniestro.conductor_id,
            fecha: new Date().toISOString().split('T')[0],
            semana: getWeekNumber(new Date().toISOString().split('T')[0]),
            descripcion: `[SINIESTRO] ${formData.descripcion}`,
            estado_id: estadoRegistradaId,
            area: 'Siniestros',
            registrado_por: profile?.full_name || 'Sistema',
            siniestro_id: siniestro.id // Enlace al siniestro
          } as any)
          .select('id')
          .single()

        if (incError) throw incError
        incidenciaId = incidenciaData?.id

        // 4. Crear la penalidad asociada a la incidencia
        if (incidenciaId) {
          const { data: penalidadData, error: penError } = await (supabase
            .from('penalidades' as any) as any)
            .insert({
              incidencia_id: incidenciaId,
              vehiculo_id: siniestro.vehiculo_id,
              conductor_id: siniestro.conductor_id,
              tipo_penalidad_id: tipoPenalidadId,
              turno: 'Diurno', // Default
              monto: formData.monto,
              descripcion: `Cobro por siniestro: ${formData.descripcion}`,
              estado: 'pendiente',
              semana: getWeekNumber(new Date().toISOString().split('T')[0]),
              fecha: new Date().toISOString().split('T')[0]
            })
            .select('id')
            .single()

          if (penError) throw penError
          penalidadId = penalidadData?.id
        }
      }

      // 5. Crear el seguimiento
      const tipoEvento = formData.cobrar_conductor ? 'cobro_conductor' : formData.tipo_evento

      const { error: segError } = await (supabase
        .from('siniestros_seguimientos' as any) as any)
        .insert({
          siniestro_id: siniestro.id,
          tipo_evento: tipoEvento,
          descripcion: formData.descripcion,
          monto: formData.monto || null,
          cobrar_conductor: formData.cobrar_conductor,
          incidencia_id: incidenciaId,
          penalidad_id: penalidadId,
          created_by: user?.id,
          created_by_name: profile?.full_name || 'Sistema'
        })

      if (segError) throw segError

      // Mensaje de exito
      if (formData.cobrar_conductor) {
        Swal.fire({
          icon: 'success',
          title: 'Seguimiento registrado',
          html: `
            <p>Se ha creado automaticamente:</p>
            <ul style="text-align: left; margin-top: 10px;">
              <li>Incidencia vinculada al conductor</li>
              <li>Penalidad por <strong>$${formData.monto?.toLocaleString('es-AR')}</strong></li>
            </ul>
          `,
          confirmButtonColor: '#dc2626'
        })
      } else {
        Swal.fire({
          icon: 'success',
          title: 'Seguimiento registrado',
          timer: 1500,
          showConfirmButton: false
        })
      }

      resetForm()
      cargarSeguimientos()
      onReload()
    } catch (error: any) {
      console.error('Error guardando seguimiento:', error)
      Swal.fire('Error', error?.message || 'No se pudo guardar el seguimiento', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Calcular numero de semana ISO 8601
  function getWeekNumber(dateStr: string): number {
    if (!dateStr) return 0
    const date = new Date(dateStr)
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function formatMoney(value: number | undefined | null) {
    if (!value) return '-'
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0
    }).format(value)
  }

  return (
    <div className="siniestro-seguimiento">
      {/* Header con boton agregar */}
      <div className="seguimiento-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
            Historial de Gestion
          </h4>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
            Registro de notas, pagos y cobros relacionados al siniestro
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowForm(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} />
          Agregar
        </button>
      </div>

      {/* Formulario nuevo seguimiento */}
      {showForm && (
        <div className="seguimiento-form" style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h5 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Nuevo Seguimiento</h5>
            <button
              onClick={resetForm}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
            >
              <X size={18} color="#64748b" />
            </button>
          </div>

          <div className="form-row" style={{ marginBottom: '12px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px', display: 'block' }}>
                Tipo de Evento
              </label>
              <select
                value={formData.tipo_evento}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  tipo_evento: e.target.value as any,
                  cobrar_conductor: e.target.value === 'cobro_conductor'
                }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
              >
                <option value="nota">Nota / Observacion</option>
                <option value="pago">Pago Recibido</option>
                <option value="cobro_conductor">Cobro a Conductor (genera incidencia)</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px', display: 'block' }}>
              Descripcion / Notas <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <textarea
              value={formData.descripcion}
              onChange={(e) => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
              placeholder="Detalle de la gestion realizada..."
              rows={3}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', resize: 'vertical' }}
            />
          </div>

          {(formData.tipo_evento === 'pago' || formData.tipo_evento === 'cobro_conductor') && (
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px', display: 'block' }}>
                Monto {formData.tipo_evento === 'cobro_conductor' && <span style={{ color: '#dc2626' }}>*</span>}
              </label>
              <input
                type="number"
                value={formData.monto || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, monto: Number(e.target.value) || undefined }))}
                placeholder="0"
                style={{ width: '200px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
              />
            </div>
          )}

          {/* Alerta para cobro a conductor */}
          {formData.tipo_evento === 'cobro_conductor' && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '16px',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start'
            }}>
              <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '13px', color: '#991b1b' }}>
                <strong>Importante:</strong> Al guardar se creara automaticamente una <strong>incidencia</strong> y una <strong>penalidad</strong>
                asociada al conductor <strong>{siniestro.conductor_display || 'del siniestro'}</strong> por el monto indicado.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              className="btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleGuardar}
              disabled={saving}
              className="btn-primary"
              style={{
                background: formData.tipo_evento === 'cobro_conductor' ? '#dc2626' : undefined
              }}
            >
              {saving ? 'Guardando...' : formData.tipo_evento === 'cobro_conductor' ? 'Guardar y Generar Incidencia' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* Timeline de seguimientos */}
      <div className="seguimiento-timeline">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            Cargando...
          </div>
        ) : seguimientos.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: '#64748b',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px dashed #d1d5db'
          }}>
            <Clock size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
            <p style={{ margin: 0 }}>No hay registros de seguimiento</p>
            <p style={{ margin: '4px 0 0', fontSize: '13px' }}>Agrega el primer registro de gestion</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {seguimientos.map((seg) => {
              const tipoConfig = TIPO_EVENTO_LABELS[seg.tipo_evento] || TIPO_EVENTO_LABELS.nota
              return (
                <div
                  key={seg.id}
                  className="seguimiento-item"
                  style={{
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    borderLeft: `4px solid ${tipoConfig.color}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: `${tipoConfig.color}15`,
                        color: tipoConfig.color
                      }}>
                        {tipoConfig.icon}
                        {tipoConfig.label}
                      </span>
                      {seg.monto && (
                        <span style={{
                          fontWeight: 600,
                          color: seg.tipo_evento === 'cobro_conductor' ? '#dc2626' : '#059669'
                        }}>
                          {formatMoney(seg.monto)}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {formatDate(seg.created_at)}
                    </span>
                  </div>

                  <p style={{ margin: '0 0 8px', fontSize: '14px', color: '#334155' }}>
                    {seg.descripcion}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      Por: {seg.created_by_name || 'Sistema'}
                    </span>
                    {seg.incidencia_id && (
                      <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        color: '#6366f1'
                      }}>
                        <Link2 size={12} />
                        Incidencia generada
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
