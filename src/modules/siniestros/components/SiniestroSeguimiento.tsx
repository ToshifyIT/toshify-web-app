// src/modules/siniestros/components/SiniestroSeguimiento.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Swal from 'sweetalert2'
import { Plus, Clock, FileText, DollarSign, AlertTriangle, Link2, X, Car, User } from 'lucide-react'
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

interface IncidenciaFormData {
  descripcion: string
  area: string
  turno: string
  monto: number
  detalle_penalidad: string
}

interface TipoPenalidad {
  id: string
  nombre: string
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

  // Estado para modal de incidencia
  const [showIncidenciaModal, setShowIncidenciaModal] = useState(false)
  const [tiposPenalidad, setTiposPenalidad] = useState<TipoPenalidad[]>([])
  const [incidenciaForm, setIncidenciaForm] = useState<IncidenciaFormData>({
    descripcion: '',
    area: 'Siniestros',
    turno: 'Diurno',
    monto: 0,
    detalle_penalidad: ''
  })
  const [selectedTipoPenalidad, setSelectedTipoPenalidad] = useState<string>('')
  const [savingIncidencia, setSavingIncidencia] = useState(false)

  useEffect(() => {
    cargarSeguimientos()
    cargarTiposPenalidad()
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

  async function cargarTiposPenalidad() {
    try {
      const { data } = await (supabase
        .from('tipos_penalidades' as any) as any)
        .select('id, nombre')
        .eq('is_active', true)
        .order('nombre')
      setTiposPenalidad(data || [])
    } catch (error) {
      console.error('Error cargando tipos penalidad:', error)
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

  function openIncidenciaModal() {
    // Pre-llenar datos del formulario de incidencia
    setIncidenciaForm({
      descripcion: `[SINIESTRO] ${formData.descripcion}`,
      area: 'Siniestros',
      turno: 'Diurno',
      monto: formData.monto || 0,
      detalle_penalidad: `Cobro por siniestro: ${formData.descripcion}`
    })
    setShowIncidenciaModal(true)
  }

  async function handleGuardarIncidencia() {
    if (!incidenciaForm.descripcion.trim()) {
      Swal.fire('Error', 'La descripción de la incidencia es requerida', 'error')
      return
    }

    if (!incidenciaForm.monto || incidenciaForm.monto <= 0) {
      Swal.fire('Error', 'Debe ingresar un monto válido para la penalidad', 'error')
      return
    }

    setSavingIncidencia(true)
    try {
      // 1. Buscar el primer estado de incidencia
      const { data: estadosInc } = await supabase
        .from('incidencias_estados')
        .select('id, codigo')
        .order('orden', { ascending: true })
        .limit(1)

      const estadoId = (estadosInc as any)?.[0]?.id
      if (!estadoId) {
        throw new Error('No se encontraron estados de incidencia configurados')
      }

      // 2. Crear la incidencia
      const { data: incidenciaData, error: incError } = await supabase
        .from('incidencias')
        .insert({
          vehiculo_id: siniestro.vehiculo_id,
          conductor_id: siniestro.conductor_id,
          fecha: new Date().toISOString().split('T')[0],
          semana: getWeekNumber(new Date().toISOString().split('T')[0]),
          descripcion: incidenciaForm.descripcion,
          estado_id: estadoId,
          area: incidenciaForm.area,
          turno: incidenciaForm.turno,
          registrado_por: profile?.full_name || 'Sistema',
          siniestro_id: siniestro.id
        } as any)
        .select('id')
        .single()

      if (incError) throw incError
      const incidenciaId = (incidenciaData as any)?.id

      // 3. Crear la penalidad
      let penalidadId: string | null = null
      if (incidenciaId) {
        const { data: penalidadData, error: penError } = await (supabase
          .from('penalidades' as any) as any)
          .insert({
            incidencia_id: incidenciaId,
            vehiculo_id: siniestro.vehiculo_id,
            conductor_id: siniestro.conductor_id,
            tipo_penalidad_id: selectedTipoPenalidad || null,
            turno: incidenciaForm.turno,
            monto: incidenciaForm.monto,
            detalle: incidenciaForm.detalle_penalidad,
            estado: 'pendiente',
            aplicado: false,
            semana: getWeekNumber(new Date().toISOString().split('T')[0]),
            fecha: new Date().toISOString().split('T')[0],
            created_by: user?.id,
            created_by_name: profile?.full_name || 'Sistema'
          })
          .select('id')
          .single()

        if (penError) throw penError
        penalidadId = penalidadData?.id
      }

      // 4. Crear el seguimiento con referencia a la incidencia
      const { error: segError } = await (supabase
        .from('siniestros_seguimientos' as any) as any)
        .insert({
          siniestro_id: siniestro.id,
          tipo_evento: 'cobro_conductor',
          descripcion: formData.descripcion,
          monto: incidenciaForm.monto,
          cobrar_conductor: true,
          incidencia_id: incidenciaId,
          penalidad_id: penalidadId,
          created_by: user?.id,
          created_by_name: profile?.full_name || 'Sistema'
        })

      if (segError) throw segError

      Swal.fire({
        icon: 'success',
        title: 'Incidencia creada',
        html: `
          <p>Se ha creado correctamente:</p>
          <ul style="text-align: left; margin-top: 10px;">
            <li>Incidencia vinculada al siniestro</li>
            <li>Penalidad por <strong>$${incidenciaForm.monto.toLocaleString('es-AR')}</strong></li>
          </ul>
        `,
        confirmButtonColor: '#dc2626'
      })

      // Cerrar modales y recargar
      setShowIncidenciaModal(false)
      resetForm()
      cargarSeguimientos()
      onReload()
    } catch (error: any) {
      console.error('Error creando incidencia:', error)
      Swal.fire('Error', error?.message || 'No se pudo crear la incidencia', 'error')
    } finally {
      setSavingIncidencia(false)
    }
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

    // Si es cobro a conductor, abrir modal de incidencia
    if (formData.cobrar_conductor) {
      openIncidenciaModal()
      return
    }

    setSaving(true)
    try {
      // Crear el seguimiento (solo para notas y pagos)
      const { error: segError } = await (supabase
        .from('siniestros_seguimientos' as any) as any)
        .insert({
          siniestro_id: siniestro.id,
          tipo_evento: formData.tipo_evento,
          descripcion: formData.descripcion,
          monto: formData.monto || null,
          cobrar_conductor: false,
          created_by: user?.id,
          created_by_name: profile?.full_name || 'Sistema'
        })

      if (segError) throw segError

      Swal.fire({
        icon: 'success',
        title: 'Seguimiento registrado',
        timer: 1500,
        showConfirmButton: false
      })

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
                <strong>Importante:</strong> Se abrira un formulario para crear la <strong>incidencia</strong> y <strong>penalidad</strong>
                asociada al conductor <strong>{siniestro.conductor_display || 'del siniestro'}</strong>.
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
              {saving ? 'Guardando...' : formData.tipo_evento === 'cobro_conductor' ? 'Continuar' : 'Guardar'}
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

      {/* Modal de Incidencia - NO se cierra al hacer clic afuera */}
      {showIncidenciaModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
          // NO onClick para cerrar - el modal solo se cierra con los botones
        >
          <div
            className="modal-content"
            style={{
              background: '#fff',
              borderRadius: '12px',
              width: '600px',
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#dc2626' }}>
                  Nueva Incidencia + Penalidad
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                  Generada desde siniestro
                </p>
              </div>
              <button
                onClick={() => setShowIncidenciaModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '6px'
                }}
              >
                <X size={20} color="#64748b" />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px' }}>
              {/* Info del siniestro */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '12px', textTransform: 'uppercase' }}>
                  Datos del Siniestro
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Car size={16} color="#64748b" />
                    <div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>Vehiculo</div>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>{siniestro.vehiculo_patente || '-'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <User size={16} color="#64748b" />
                    <div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>Conductor</div>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>{siniestro.conductor_display || '-'}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Formulario de incidencia */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block' }}>
                  Descripcion de la Incidencia <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                  value={incidenciaForm.descripcion}
                  onChange={(e) => setIncidenciaForm(prev => ({ ...prev, descripcion: e.target.value }))}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block' }}>
                    Area
                  </label>
                  <select
                    value={incidenciaForm.area}
                    onChange={(e) => setIncidenciaForm(prev => ({ ...prev, area: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db'
                    }}
                  >
                    <option value="Siniestros">Siniestros</option>
                    <option value="Operaciones">Operaciones</option>
                    <option value="Administracion">Administracion</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block' }}>
                    Turno
                  </label>
                  <select
                    value={incidenciaForm.turno}
                    onChange={(e) => setIncidenciaForm(prev => ({ ...prev, turno: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db'
                    }}
                  >
                    <option value="Diurno">Diurno</option>
                    <option value="Nocturno">Nocturno</option>
                    <option value="A cargo">A cargo</option>
                  </select>
                </div>
              </div>

              {/* Seccion Penalidad */}
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#dc2626', marginBottom: '12px', textTransform: 'uppercase' }}>
                  Datos de la Penalidad
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block' }}>
                      Tipo de Penalidad
                    </label>
                    <select
                      value={selectedTipoPenalidad}
                      onChange={(e) => setSelectedTipoPenalidad(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid #fca5a5',
                        background: '#fff'
                      }}
                    >
                      <option value="">Seleccionar tipo...</option>
                      {tiposPenalidad.map(tipo => (
                        <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block' }}>
                      Monto <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="number"
                      value={incidenciaForm.monto || ''}
                      onChange={(e) => setIncidenciaForm(prev => ({ ...prev, monto: Number(e.target.value) || 0 }))}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid #fca5a5',
                        background: '#fff'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block' }}>
                    Detalle de la Penalidad
                  </label>
                  <textarea
                    value={incidenciaForm.detalle_penalidad}
                    onChange={(e) => setIncidenciaForm(prev => ({ ...prev, detalle_penalidad: e.target.value }))}
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: '1px solid #fca5a5',
                      background: '#fff',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button
                type="button"
                onClick={() => setShowIncidenciaModal(false)}
                disabled={savingIncidencia}
                className="btn-secondary"
                style={{ padding: '10px 20px' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarIncidencia}
                disabled={savingIncidencia}
                className="btn-primary"
                style={{
                  padding: '10px 20px',
                  background: '#dc2626'
                }}
              >
                {savingIncidencia ? 'Guardando...' : 'Crear Incidencia y Penalidad'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
