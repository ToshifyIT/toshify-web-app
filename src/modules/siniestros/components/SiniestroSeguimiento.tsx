/* eslint-disable @typescript-eslint/no-explicit-any */
// src/modules/siniestros/components/SiniestroSeguimiento.tsx
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'
import { Plus, Clock, FileText, DollarSign, AlertTriangle, X, ExternalLink } from 'lucide-react'
import type { SiniestroSeguimientoConEstados, SiniestroCompleto } from '../../../types/siniestros.types'
import type { VehiculoSimple, ConductorSimple } from '../../../types/incidencias.types'

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
  vehiculo_id?: string
  conductor_id?: string
  estado_id: string
  fecha: string
  turno?: string
  area?: string
  estado_vehiculo?: string
  descripcion?: string
  monto?: number
  tipo_cobro_descuento_id?: string
}

interface TipoCobroDescuento {
  id: string
  codigo: string
  nombre: string
  categoria?: string
  es_a_favor?: boolean
}

interface IncidenciaEstado {
  id: string
  codigo: string
  nombre: string
  color?: string
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

// Calcular número de semana ISO 8601
function getWeekNumber(dateStr: string): number {
  if (!dateStr) return 0
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12, 0, 0)
  const thursday = new Date(date)
  thursday.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3)
  const firstThursday = new Date(thursday.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)
  const weekNumber = Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
  return weekNumber
}

export function SiniestroSeguimiento({ siniestro, onReload }: SiniestroSeguimientoProps) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [seguimientos, setSeguimientos] = useState<SiniestroSeguimientoConEstados[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<SeguimientoFormData>({
    tipo_evento: 'nota',
    descripcion: '',
    cobrar_conductor: false
  })

  // Estados para modal de incidencia
  const [showIncidenciaModal, setShowIncidenciaModal] = useState(false)
  const [incidenciaForm, setIncidenciaForm] = useState<IncidenciaFormData>({
    fecha: getLocalDateString(),
    estado_id: '',
    area: 'Siniestros'
  })
  const [tiposCobroDescuento, setTiposCobroDescuento] = useState<TipoCobroDescuento[]>([])
  const [incidenciasEstados, setIncidenciasEstados] = useState<IncidenciaEstado[]>([])
  const [vehiculos, setVehiculos] = useState<VehiculoSimple[]>([])
  const [conductores, setConductores] = useState<ConductorSimple[]>([])
  const [savingIncidencia, setSavingIncidencia] = useState(false)

  useEffect(() => {
    cargarSeguimientos()
    cargarDatosParaIncidencia()
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

  async function cargarDatosParaIncidencia() {
    try {
      // Cargar tipos de cobro/descuento (tipos de incidencia)
      const { data: tiposData } = await (supabase
        .from('tipos_cobro_descuento' as any) as any)
        .select('*')
        .eq('is_active', true)
        .order('orden')
      setTiposCobroDescuento(tiposData || [])

      // Cargar estados de incidencia
      const { data: estadosData } = await (supabase
        .from('incidencias_estados' as any) as any)
        .select('*')
        .eq('is_active', true)
        .order('orden')
      setIncidenciasEstados(estadosData || [])

      // Pre-seleccionar estado "Pendiente" si existe
      const estadoPendiente = (estadosData || []).find((e: IncidenciaEstado) => 
        e.codigo?.toLowerCase() === 'pendiente' || e.nombre?.toLowerCase() === 'pendiente'
      )
      if (estadoPendiente) {
        setIncidenciaForm(prev => ({ ...prev, estado_id: estadoPendiente.id }))
      }

      // Cargar vehiculos
      const { data: vehData } = await supabase
        .from('vehiculos')
        .select('id, patente, marca, modelo')
        .order('patente')

      let vehiculosList: VehiculoSimple[] = (vehData || []) as VehiculoSimple[]
      if (siniestro.vehiculo_id && !vehiculosList.find(v => v.id === siniestro.vehiculo_id)) {
        vehiculosList = [{
          id: siniestro.vehiculo_id,
          patente: siniestro.vehiculo_patente || '',
          marca: siniestro.vehiculo_marca || '',
          modelo: siniestro.vehiculo_modelo || ''
        }, ...vehiculosList]
      }
      setVehiculos(vehiculosList)

      // Cargar conductores
      const { data: condData } = await supabase
        .from('conductores')
        .select('id, nombres, apellidos')
        .order('apellidos')

      let conductoresFormatted: ConductorSimple[] = (condData || []).map((c: any) => ({
        id: c.id,
        nombres: c.nombres,
        apellidos: c.apellidos,
        nombre_completo: `${c.nombres} ${c.apellidos}`
      }))

      if (siniestro.conductor_id && !conductoresFormatted.find(c => c.id === siniestro.conductor_id)) {
        conductoresFormatted = [{
          id: siniestro.conductor_id,
          nombres: siniestro.conductor_display?.split(' ')[0] || '',
          apellidos: siniestro.conductor_display?.split(' ').slice(1).join(' ') || '',
          nombre_completo: siniestro.conductor_display || ''
        }, ...conductoresFormatted]
      }
      setConductores(conductoresFormatted)
    } catch (error) {
      console.error('Error cargando datos para incidencia:', error)
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

  function handleAbrirModalIncidencia() {
    // Buscar el tipo "Reparación Siniestro" para pre-seleccionarlo
    const tipoReparacionSiniestro = tiposCobroDescuento.find(t => 
      t.nombre?.toLowerCase().includes('reparaci') && t.nombre?.toLowerCase().includes('siniestro')
    )

    // Pre-cargar datos del siniestro en el formulario de incidencia
    setIncidenciaForm({
      vehiculo_id: siniestro.vehiculo_id || undefined,
      conductor_id: siniestro.conductor_id || undefined,
      fecha: getLocalDateString(),
      monto: formData.monto || undefined,
      descripcion: `[SINIESTRO] ${formData.descripcion}`,
      area: 'Siniestros',
      estado_id: incidenciaForm.estado_id, // Mantener el estado pre-seleccionado
      tipo_cobro_descuento_id: tipoReparacionSiniestro?.id || undefined
    })
    setShowIncidenciaModal(true)
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
      handleAbrirModalIncidencia()
      return
    }

    setSaving(true)
    try {
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

      showSuccess('Seguimiento registrado')

      resetForm()
      cargarSeguimientos()
      onReload()
    } catch (error: any) {
      Swal.fire('Error', error?.message || 'No se pudo guardar el seguimiento', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleGuardarIncidencia() {
    if (!incidenciaForm.conductor_id) {
      Swal.fire('Error', 'Debe seleccionar un conductor', 'error')
      return
    }
    if (!incidenciaForm.fecha) {
      Swal.fire('Error', 'La fecha es requerida', 'error')
      return
    }
    if (!incidenciaForm.estado_id) {
      Swal.fire('Error', 'Debe seleccionar un estado', 'error')
      return
    }
    if (!incidenciaForm.tipo_cobro_descuento_id) {
      Swal.fire('Error', 'Debe seleccionar un tipo de incidencia', 'error')
      return
    }

    setSavingIncidencia(true)
    try {
      // Obtener datos del conductor y vehículo para guardar nombres
      const selectedConductor = conductores.find(c => c.id === incidenciaForm.conductor_id)
      const selectedVehiculo = vehiculos.find(v => v.id === incidenciaForm.vehiculo_id)
      const semana = getWeekNumber(incidenciaForm.fecha)

      // Crear la incidencia
      const { data: incidenciaData, error: incError } = await (supabase
        .from('incidencias' as any) as any)
        .insert({
          vehiculo_id: incidenciaForm.vehiculo_id || null,
          conductor_id: incidenciaForm.conductor_id,
          estado_id: incidenciaForm.estado_id,
          semana: semana,
          fecha: incidenciaForm.fecha,
          turno: incidenciaForm.turno || null,
          area: incidenciaForm.area || 'Siniestros',
          estado_vehiculo: incidenciaForm.estado_vehiculo || null,
          descripcion: incidenciaForm.descripcion || null,
          conductor_nombre: selectedConductor?.nombre_completo || null,
          vehiculo_patente: selectedVehiculo?.patente || null,
          tipo: 'cobro',
          tipo_cobro_descuento_id: incidenciaForm.tipo_cobro_descuento_id,
          monto: incidenciaForm.monto || null,
          siniestro_id: siniestro.id,
          created_by: user?.id,
          created_by_name: profile?.full_name || 'Sistema'
        })
        .select('id')
        .single()

      if (incError) throw incError

      // Crear seguimiento vinculado a la incidencia
      const { error: segError } = await (supabase
        .from('siniestros_seguimientos' as any) as any)
        .insert({
          siniestro_id: siniestro.id,
          tipo_evento: 'cobro_conductor',
          descripcion: incidenciaForm.descripcion || 'Cobro a conductor generado',
          monto: incidenciaForm.monto || null,
          cobrar_conductor: true,
          incidencia_id: (incidenciaData as any)?.id || null,
          created_by: user?.id,
          created_by_name: profile?.full_name || 'Sistema'
        })

      if (segError) throw segError

      showSuccess('Incidencia registrada', 'Se ha creado la incidencia y el seguimiento correctamente')

      setShowIncidenciaModal(false)
      setIncidenciaForm({
        fecha: getLocalDateString(),
        estado_id: incidenciasEstados.find(e => e.codigo?.toLowerCase() === 'pendiente')?.id || '',
        area: 'Siniestros'
      })
      resetForm()
      cargarSeguimientos()
      onReload()
    } catch (error: any) {
      console.error('Error guardando incidencia:', error)
      Swal.fire('Error', error?.message || 'No se pudo guardar la incidencia', 'error')
    } finally {
      setSavingIncidencia(false)
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

  // Datos pre-seleccionados para mostrar en el formulario
  const selectedVehiculo = vehiculos.find(v => v.id === incidenciaForm.vehiculo_id)
  const selectedConductor = conductores.find(c => c.id === incidenciaForm.conductor_id)
  const semanaCalculada = getWeekNumber(incidenciaForm.fecha)

  // Categorizar tipos de cobro/descuento
  const { tiposP006, tiposP004, tiposP007, tiposSinCategoria } = useMemo(() => ({
    tiposP006: tiposCobroDescuento.filter(t => t.categoria === 'P006'),
    tiposP004: tiposCobroDescuento.filter(t => t.categoria === 'P004'),
    tiposP007: tiposCobroDescuento.filter(t => t.categoria === 'P007'),
    tiposSinCategoria: tiposCobroDescuento.filter(t => !t.categoria),
  }), [tiposCobroDescuento])

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
                <option value="cobro_conductor">Cobro a Conductor (genera incidencia)</option>
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
                <strong>Importante:</strong> Se abrira el formulario de incidencias para crear el cobro
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
                      <button
                        onClick={() => {
                          if (seg.incidencia_id) {
                            navigate(`/incidencias?id=${seg.incidencia_id}`)
                          } else if (seg.penalidad_id) {
                            navigate(`/incidencias?penalidad_id=${seg.penalidad_id}`)
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          color: '#6366f1',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          transition: 'background 0.2s'
                        }}
                        onMouseOver={e => (e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)')}
                        onMouseOut={e => (e.currentTarget.style.background = 'none')}
                      >
                        <ExternalLink size={12} />
                        {seg.incidencia_id ? 'Ver Incidencia' : 'Ver Penalidad'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal de Incidencia */}
      {showIncidenciaModal && (
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
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>Nueva Incidencia</h2>
              <button
                className="modal-close"
                onClick={() => setShowIncidenciaModal(false)}
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
              {/* Formulario de Incidencia */}
              <div className="form-section">
                <div className="form-section-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Datos de la Incidencia
                </div>

                {/* Patente y Conductor (solo lectura, pre-llenados) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--text-secondary)' }}>Patente</label>
                    <input
                      type="text"
                      value={selectedVehiculo ? `${selectedVehiculo.patente} - ${selectedVehiculo.marca} ${selectedVehiculo.modelo}` : '-'}
                      readOnly
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--text-secondary)' }}>Conductor</label>
                    <input
                      type="text"
                      value={selectedConductor?.nombre_completo || '-'}
                      readOnly
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>

                {/* Fecha, Semana, Turno */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--text-secondary)' }}>
                      Fecha <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="date"
                      value={incidenciaForm.fecha}
                      onChange={e => setIncidenciaForm(prev => ({ ...prev, fecha: e.target.value }))}
                      disabled={savingIncidencia}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--text-secondary)' }}>Semana</label>
                    <input
                      type="text"
                      value={semanaCalculada || '-'}
                      readOnly
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--text-secondary)' }}>Turno</label>
                    <input
                      type="text"
                      value={incidenciaForm.turno || '-'}
                      readOnly
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>

                {/* Tipo de Incidencia, Área, Estado */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--text-secondary)' }}>
                      Tipo de Incidencia <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      value={incidenciaForm.tipo_cobro_descuento_id || ''}
                      onChange={e => setIncidenciaForm(prev => ({ ...prev, tipo_cobro_descuento_id: e.target.value || undefined }))}
                      disabled={savingIncidencia}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                    >
                      <option value="">Seleccionar</option>
                      {/* P006 - Exceso KM */}
                      {tiposP006.length > 0 && (
                        <optgroup label="P006 - Exceso KM">
                          {tiposP006.map(tipo => (
                            <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                          ))}
                        </optgroup>
                      )}
                      {/* P004 - Tickets a Favor */}
                      {tiposP004.length > 0 && (
                        <optgroup label="P004 - Tickets a Favor">
                          {tiposP004.map(tipo => (
                            <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                          ))}
                        </optgroup>
                      )}
                      {/* P007 - Multas/Penalidades */}
                      {tiposP007.length > 0 && (
                        <optgroup label="P007 - Multas/Penalidades">
                          {tiposP007.map(tipo => (
                            <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                          ))}
                        </optgroup>
                      )}
                      {/* Sin categoría */}
                      {tiposSinCategoria.map(tipo => (
                        <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--text-secondary)' }}>
                      Área <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      value={incidenciaForm.area || ''}
                      onChange={e => setIncidenciaForm(prev => ({ ...prev, area: e.target.value }))}
                      disabled={savingIncidencia}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                    >
                      <option value="">Seleccionar</option>
                      <option value="Logística">Logística</option>
                      <option value="Data Entry">Data Entry</option>
                      <option value="Administración">Administración</option>
                      <option value="Siniestros">Siniestros</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--text-secondary)' }}>
                      Estado <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      value={incidenciaForm.estado_id}
                      onChange={e => setIncidenciaForm(prev => ({ ...prev, estado_id: e.target.value }))}
                      disabled={savingIncidencia}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                    >
                      <option value="">Seleccionar</option>
                      {incidenciasEstados.map(e => (
                        <option key={e.id} value={e.id}>{e.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Monto y Estado del Vehículo */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--text-secondary)' }}>
                      Monto <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={incidenciaForm.monto || ''}
                      onChange={e => setIncidenciaForm(prev => ({ ...prev, monto: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      placeholder="0.00"
                      disabled={savingIncidencia}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--text-secondary)' }}>Estado del Vehículo</label>
                    <select
                      value={incidenciaForm.estado_vehiculo || ''}
                      onChange={e => setIncidenciaForm(prev => ({ ...prev, estado_vehiculo: e.target.value }))}
                      disabled={savingIncidencia}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                    >
                      <option value="">Seleccionar</option>
                      <option value="Operativo">Operativo</option>
                      <option value="En taller">En taller</option>
                      <option value="Siniestrado">Siniestrado</option>
                    </select>
                  </div>
                </div>

                {/* Registrado por (solo lectura) */}
                <div style={{ marginBottom: '16px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--text-secondary)' }}>Registrado por</label>
                    <input
                      type="text"
                      value={profile?.full_name || 'Sistema'}
                      readOnly
                      style={{ width: '300px', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>

                {/* Descripción */}
                <div className="form-section-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', marginTop: '24px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Descripción
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--text-secondary)' }}>Descripción del Problema</label>
                  <textarea
                    value={incidenciaForm.descripcion || ''}
                    onChange={e => setIncidenciaForm(prev => ({ ...prev, descripcion: e.target.value }))}
                    placeholder="Describa la incidencia..."
                    rows={4}
                    disabled={savingIncidencia}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', resize: 'vertical' }}
                  />
                </div>
              </div>
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
                onClick={() => setShowIncidenciaModal(false)}
                disabled={savingIncidencia}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleGuardarIncidencia}
                disabled={savingIncidencia}
              >
                {savingIncidencia ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
