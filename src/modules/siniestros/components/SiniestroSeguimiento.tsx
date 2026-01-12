// src/modules/siniestros/components/SiniestroSeguimiento.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Swal from 'sweetalert2'
import { Plus, Clock, FileText, DollarSign, AlertTriangle, Link2, X } from 'lucide-react'
import type { SiniestroSeguimientoConEstados, SiniestroCompleto } from '../../../types/siniestros.types'
import type { PenalidadFormData, TipoPenalidad, VehiculoSimple, ConductorSimple } from '../../../types/incidencias.types'
import { PenalidadForm } from '../../../components/shared/PenalidadForm'

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

// Helper para obtener fecha local en formato YYYY-MM-DD
function getLocalDateString() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

  // Estados para modal de penalidad (igual que en IncidenciasModule)
  const [showPenalidadModal, setShowPenalidadModal] = useState(false)
  const [penalidadForm, setPenalidadForm] = useState<PenalidadFormData>({
    fecha: getLocalDateString(),
    aplicado: false
  })
  const [tiposPenalidad, setTiposPenalidad] = useState<TipoPenalidad[]>([])
  const [vehiculos, setVehiculos] = useState<VehiculoSimple[]>([])
  const [conductores, setConductores] = useState<ConductorSimple[]>([])
  const [savingPenalidad, setSavingPenalidad] = useState(false)


  useEffect(() => {
    cargarSeguimientos()
    cargarDatosParaPenalidad()
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

  async function cargarDatosParaPenalidad() {
    try {
      // Cargar tipos de penalidad
      const { data: tiposData } = await supabase
        .from('tipos_penalidad')
        .select('*')
        .eq('is_active', true)
        .order('nombre')
      setTiposPenalidad(tiposData || [])

      // Cargar vehiculos activos
      const { data: vehData } = await supabase
        .from('vehiculos')
        .select('id, patente, marca, modelo')
        .eq('is_active', true)
        .order('patente')

      // Si el siniestro tiene un vehículo, asegurarnos de incluirlo
      let vehiculosList = vehData || []
      if (siniestro.vehiculo_id && !vehiculosList.find((v: any) => v.id === siniestro.vehiculo_id)) {
        // Agregar el vehículo del siniestro si no está en la lista
        vehiculosList = [{
          id: siniestro.vehiculo_id,
          patente: siniestro.vehiculo_patente || '',
          marca: siniestro.vehiculo_marca || '',
          modelo: siniestro.vehiculo_modelo || ''
        }, ...vehiculosList]
      }
      setVehiculos(vehiculosList)

      // Cargar conductores activos
      const { data: condData } = await supabase
        .from('conductores')
        .select('id, nombres, apellidos')
        .eq('is_active', true)
        .order('apellidos')

      let conductoresFormatted = (condData || []).map((c: any) => ({
        ...c,
        nombre_completo: `${c.nombres} ${c.apellidos}`
      }))

      // Si el siniestro tiene un conductor, asegurarnos de incluirlo
      if (siniestro.conductor_id && !conductoresFormatted.find((c: any) => c.id === siniestro.conductor_id)) {
        // Agregar el conductor del siniestro si no está en la lista
        conductoresFormatted = [{
          id: siniestro.conductor_id,
          nombres: siniestro.conductor_display?.split(' ')[0] || '',
          apellidos: siniestro.conductor_display?.split(' ').slice(1).join(' ') || '',
          nombre_completo: siniestro.conductor_display || ''
        }, ...conductoresFormatted]
      }
      setConductores(conductoresFormatted)
    } catch (error) {
      console.error('Error cargando datos para penalidad:', error)
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

  function handleAbrirModalPenalidad() {
    // DEBUG: Ver datos del siniestro
    console.log('🚗 Datos del siniestro para penalidad:', {
      vehiculo_id: siniestro.vehiculo_id,
      vehiculo_patente: siniestro.vehiculo_patente,
      conductor_id: siniestro.conductor_id,
      conductor_display: siniestro.conductor_display,
      vehiculos_cargados: vehiculos.length,
      conductores_cargados: conductores.length
    })

    // Pre-cargar datos del siniestro en el formulario de penalidad
    setPenalidadForm({
      vehiculo_id: siniestro.vehiculo_id || undefined,
      conductor_id: siniestro.conductor_id || undefined,
      fecha: getLocalDateString(),
      monto: formData.monto || undefined,
      detalle: 'Cobro',
      observaciones: `[SINIESTRO] ${formData.descripcion}`,
      area_responsable: 'SINIESTROS',
      aplicado: false
    })
    setShowPenalidadModal(true)
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

    // Si es cobro a conductor, abrir modal de penalidad
    if (formData.cobrar_conductor) {
      handleAbrirModalPenalidad()
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

  async function handleGuardarPenalidad() {
    if (!penalidadForm.conductor_id) {
      Swal.fire('Error', 'Debe seleccionar un conductor', 'error')
      return
    }
    if (!penalidadForm.fecha) {
      Swal.fire('Error', 'La fecha es requerida', 'error')
      return
    }

    setSavingPenalidad(true)
    try {
      // Crear la penalidad
      const { data: penalidadData, error: penError } = await (supabase
        .from('penalidades') as any)
        .insert({
          vehiculo_id: penalidadForm.vehiculo_id || null,
          conductor_id: penalidadForm.conductor_id,
          tipo_penalidad_id: penalidadForm.tipo_penalidad_id || null,
          fecha: penalidadForm.fecha,
          detalle: penalidadForm.detalle || null,
          monto: penalidadForm.monto || null,
          turno: penalidadForm.turno || null,
          observaciones: penalidadForm.observaciones || null,
          area_responsable: penalidadForm.area_responsable || 'SINIESTROS',
          aplicado: penalidadForm.aplicado || false,
          created_by: user?.id
        })
        .select('id')
        .single()

      if (penError) throw penError

      // Crear seguimiento vinculado
      const { error: segError } = await (supabase
        .from('siniestros_seguimientos' as any) as any)
        .insert({
          siniestro_id: siniestro.id,
          tipo_evento: 'cobro_conductor',
          descripcion: penalidadForm.observaciones || 'Cobro a conductor generado',
          monto: penalidadForm.monto || null,
          cobrar_conductor: true,
          penalidad_id: (penalidadData as any)?.id || null,
          created_by: user?.id,
          created_by_name: profile?.full_name || 'Sistema'
        })

      if (segError) throw segError

      Swal.fire({
        icon: 'success',
        title: 'Penalidad registrada',
        text: 'Se ha creado la penalidad y el seguimiento correctamente',
        timer: 2000,
        showConfirmButton: false
      })

      setShowPenalidadModal(false)
      setPenalidadForm({
        fecha: getLocalDateString(),
        aplicado: false
      })
      resetForm()
      cargarSeguimientos()
      onReload()
    } catch (error: any) {
      console.error('Error guardando penalidad:', error)
      Swal.fire('Error', error?.message || 'No se pudo guardar la penalidad', 'error')
    } finally {
      setSavingPenalidad(false)
    }
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
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Historial de Gestion
          </h4>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-tertiary)' }}>
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
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h5 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Nuevo Seguimiento</h5>
            <button
              onClick={resetForm}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
            >
              <X size={18} color="var(--text-tertiary)" />
            </button>
          </div>

          <div className="form-row" style={{ marginBottom: '12px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px', display: 'block', color: 'var(--text-secondary)' }}>
                Tipo de Evento
              </label>
              <select
                value={formData.tipo_evento}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  tipo_evento: e.target.value as any,
                  cobrar_conductor: e.target.value === 'cobro_conductor'
                }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              >
                <option value="nota">Nota / Observacion</option>
                <option value="pago">Pago Recibido</option>
                <option value="cobro_conductor">Cobro a Conductor (genera penalidad)</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px', display: 'block', color: 'var(--text-secondary)' }}>
              Descripcion / Notas <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <textarea
              value={formData.descripcion}
              onChange={(e) => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
              placeholder="Detalle de la gestion realizada..."
              rows={3}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', resize: 'vertical' }}
            />
          </div>

          {(formData.tipo_evento === 'pago' || formData.tipo_evento === 'cobro_conductor') && (
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px', display: 'block', color: 'var(--text-secondary)' }}>
                Monto {formData.tipo_evento === 'cobro_conductor' && <span style={{ color: '#dc2626' }}>*</span>}
              </label>
              <input
                type="number"
                value={formData.monto || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, monto: Number(e.target.value) || undefined }))}
                placeholder="0"
                style={{ width: '200px', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              />
            </div>
          )}

          {/* Alerta para cobro a conductor */}
          {formData.tipo_evento === 'cobro_conductor' && (
            <div style={{
              background: 'rgba(220, 38, 38, 0.1)',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '16px',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start'
            }}>
              <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '13px', color: '#ef4444' }}>
                <strong>Importante:</strong> Se abrira el formulario de penalidades para crear el cobro
                asociado al conductor <strong>{siniestro.conductor_display || 'del siniestro'}</strong>.
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
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
            Cargando...
          </div>
        ) : seguimientos.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: 'var(--text-tertiary)',
            background: 'var(--bg-secondary)',
            borderRadius: '8px',
            border: '1px dashed var(--border-primary)'
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
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
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
                        background: `${tipoConfig.color}20`,
                        color: tipoConfig.color
                      }}>
                        {tipoConfig.icon}
                        {tipoConfig.label}
                      </span>
                      {seg.monto && (
                        <span style={{
                          fontWeight: 600,
                          color: seg.tipo_evento === 'cobro_conductor' ? '#ef4444' : '#10b981'
                        }}>
                          {formatMoney(seg.monto)}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                      {formatDate(seg.created_at)}
                    </span>
                  </div>

                  <p style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--text-primary)' }}>
                    {seg.descripcion}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                      Por: {seg.created_by_name || 'Sistema'}
                    </span>
                    {(seg.incidencia_id || seg.penalidad_id) && (
                      <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        color: '#6366f1'
                      }}>
                        <Link2 size={12} />
                        {seg.penalidad_id ? 'Penalidad generada' : 'Incidencia generada'}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal de Penalidad - Mismo estilo que IncidenciasModule */}
      {showPenalidadModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-primary)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '700px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            border: '1px solid var(--border-primary)'
          }}>
            <div className="modal-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-primary)'
            }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>Nueva Penalidad</h2>
              <button
                className="modal-close"
                onClick={() => setShowPenalidadModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: 'var(--text-tertiary)'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '24px' }}>
              <PenalidadForm
                formData={penalidadForm}
                setFormData={setPenalidadForm}
                tiposPenalidad={tiposPenalidad}
                vehiculos={vehiculos}
                conductores={conductores}
                disabled={savingPenalidad}
              />
            </div>

            <div className="modal-footer" style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              padding: '16px 24px',
              borderTop: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)'
            }}>
              <button
                className="btn-secondary"
                onClick={() => setShowPenalidadModal(false)}
                disabled={savingPenalidad}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleGuardarPenalidad}
                disabled={savingPenalidad}
              >
                {savingPenalidad ? 'Guardando...' : 'Registrar Penalidad'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
