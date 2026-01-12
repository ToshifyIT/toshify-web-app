// src/components/shared/IncidenciaPenalidadModal.tsx
// Componente compartido para crear incidencia + penalidad desde cualquier módulo
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Swal from 'sweetalert2'
import { X, Car, User } from 'lucide-react'

interface IncidenciaPenalidadModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (incidenciaId: string, penalidadId: string) => void
  // Datos precargados (desde siniestro u otro módulo)
  preloadedData: {
    vehiculo_id?: string
    vehiculo_patente?: string
    conductor_id?: string
    conductor_nombre?: string
    descripcion?: string
    monto?: number
    detalle?: string
    area?: string
    siniestro_id?: string
  }
}

interface TipoPenalidad {
  id: string
  nombre: string
}

interface EstadoIncidencia {
  id: string
  codigo: string
  nombre: string
}

interface VehiculoSimple {
  id: string
  patente: string
  marca: string
  modelo: string
}

interface ConductorSimple {
  id: string
  nombres: string
  apellidos: string
  nombre_completo: string
}

export function IncidenciaPenalidadModal({
  isOpen,
  onClose,
  onSuccess,
  preloadedData
}: IncidenciaPenalidadModalProps) {
  const { user, profile } = useAuth()

  // Datos maestros
  const [estados, setEstados] = useState<EstadoIncidencia[]>([])
  const [tiposPenalidad, setTiposPenalidad] = useState<TipoPenalidad[]>([])
  const [vehiculos, setVehiculos] = useState<VehiculoSimple[]>([])
  const [conductores, setConductores] = useState<ConductorSimple[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Formulario Incidencia
  const [incidenciaForm, setIncidenciaForm] = useState({
    vehiculo_id: '',
    conductor_id: '',
    descripcion: '',
    area: 'Siniestros',
    turno: 'Diurno',
    fecha: new Date().toISOString().split('T')[0]
  })

  // Formulario Penalidad
  const [penalidadForm, setPenalidadForm] = useState({
    tipo_penalidad_id: '',
    monto: 0,
    detalle: 'Cobro',
    observaciones: ''
  })

  // Búsqueda
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [conductorSearch, setConductorSearch] = useState('')
  const [showVehiculoDropdown, setShowVehiculoDropdown] = useState(false)
  const [showConductorDropdown, setShowConductorDropdown] = useState(false)

  useEffect(() => {
    if (isOpen) {
      cargarDatosMaestros()
    }
  }, [isOpen])

  useEffect(() => {
    // Pre-llenar formulario con datos recibidos
    if (preloadedData) {
      setIncidenciaForm(prev => ({
        ...prev,
        vehiculo_id: preloadedData.vehiculo_id || '',
        conductor_id: preloadedData.conductor_id || '',
        descripcion: preloadedData.descripcion || '',
        area: preloadedData.area || 'Siniestros'
      }))
      setPenalidadForm(prev => ({
        ...prev,
        monto: preloadedData.monto || 0,
        observaciones: preloadedData.detalle || ''
      }))
    }
  }, [preloadedData])

  async function cargarDatosMaestros() {
    setLoading(true)
    try {
      const [estadosRes, tiposRes, vehiculosRes, conductoresRes] = await Promise.all([
        supabase.from('incidencias_estados').select('id, codigo, nombre').eq('is_active', true).order('orden'),
        (supabase.from('tipos_penalidad' as any) as any).select('id, nombre').eq('is_active', true).order('nombre'),
        supabase.from('vehiculos').select('id, patente, marca, modelo').order('patente'),
        supabase.from('conductores').select('id, nombres, apellidos').order('apellidos')
      ])

      setEstados((estadosRes.data as any) || [])
      setTiposPenalidad(tiposRes.data || [])
      setVehiculos((vehiculosRes.data as any) || [])
      setConductores((conductoresRes.data || []).map((c: any) => ({
        id: c.id,
        nombres: c.nombres,
        apellidos: c.apellidos,
        nombre_completo: `${c.nombres} ${c.apellidos}`
      })))
    } catch (error) {
      console.error('Error cargando datos:', error)
    } finally {
      setLoading(false)
    }
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

  const semanaCalculada = getWeekNumber(incidenciaForm.fecha)

  const selectedVehiculo = useMemo(() =>
    vehiculos.find(v => v.id === incidenciaForm.vehiculo_id),
    [vehiculos, incidenciaForm.vehiculo_id]
  )

  const selectedConductor = useMemo(() =>
    conductores.find(c => c.id === incidenciaForm.conductor_id),
    [conductores, incidenciaForm.conductor_id]
  )

  const filteredVehiculos = vehiculos.filter(v => {
    const term = vehiculoSearch.toLowerCase()
    return v.patente.toLowerCase().includes(term) || v.marca.toLowerCase().includes(term)
  }).slice(0, 10)

  const filteredConductores = conductores.filter(c => {
    return c.nombre_completo.toLowerCase().includes(conductorSearch.toLowerCase())
  }).slice(0, 10)

  // Lista de tipos de cobros/descuentos (fallback)
  const tiposCobrosDescuentos = [
    'Entrega tardía del vehículo',
    'Llegada tarde o inasistencia injustificada a revisión técnica',
    'Ingreso a zonas restringidas',
    'Falta de lavado',
    'Falta de restitución de la unidad',
    'Pérdida o daño de elementos de seguridad',
    'Falta restitución de GNC',
    'Falta restitución de Nafta',
    'Mora en canon',
    'Exceso de kilometraje',
    'Manipulación no autorizada de GPS',
    'Abandono del vehículo',
    'No disponer de lugar seguro para la guarda del vehículo',
    'I button',
    'Multa de tránsito',
    'Reparación Siniestro'
  ]

  async function handleGuardar() {
    // Validaciones
    if (!incidenciaForm.conductor_id) {
      Swal.fire('Error', 'Debe seleccionar un conductor', 'error')
      return
    }
    if (!incidenciaForm.descripcion.trim()) {
      Swal.fire('Error', 'La descripción es requerida', 'error')
      return
    }
    if (!penalidadForm.monto || penalidadForm.monto <= 0) {
      Swal.fire('Error', 'Debe ingresar un monto válido', 'error')
      return
    }

    setSaving(true)
    try {
      // 1. Obtener el primer estado de incidencia
      const estadoId = estados[0]?.id
      if (!estadoId) {
        throw new Error('No se encontraron estados de incidencia configurados')
      }

      // 2. Crear la incidencia
      const { data: incidenciaData, error: incError } = await supabase
        .from('incidencias')
        .insert({
          vehiculo_id: incidenciaForm.vehiculo_id || null,
          conductor_id: incidenciaForm.conductor_id,
          fecha: incidenciaForm.fecha,
          semana: semanaCalculada,
          descripcion: incidenciaForm.descripcion,
          estado_id: estadoId,
          area: incidenciaForm.area,
          turno: incidenciaForm.turno,
          registrado_por: profile?.full_name || 'Sistema',
          siniestro_id: preloadedData.siniestro_id || null
        } as any)
        .select('id')
        .single()

      if (incError) throw incError
      const incidenciaId = (incidenciaData as any)?.id

      // 3. Crear la penalidad
      const { data: penalidadData, error: penError } = await (supabase
        .from('penalidades' as any) as any)
        .insert({
          incidencia_id: incidenciaId,
          vehiculo_id: incidenciaForm.vehiculo_id || null,
          conductor_id: incidenciaForm.conductor_id,
          tipo_penalidad_id: penalidadForm.tipo_penalidad_id || null,
          turno: incidenciaForm.turno,
          monto: penalidadForm.monto,
          detalle: penalidadForm.detalle,
          observaciones: penalidadForm.observaciones,
          estado: 'pendiente',
          aplicado: false,
          semana: semanaCalculada,
          fecha: incidenciaForm.fecha,
          created_by: user?.id,
          created_by_name: profile?.full_name || 'Sistema'
        })
        .select('id')
        .single()

      if (penError) throw penError
      const penalidadId = penalidadData?.id

      Swal.fire({
        icon: 'success',
        title: 'Guardado correctamente',
        html: `
          <p>Se ha creado:</p>
          <ul style="text-align: left; margin-top: 10px;">
            <li>Incidencia registrada</li>
            <li>Penalidad por <strong>$${penalidadForm.monto.toLocaleString('es-AR')}</strong></li>
          </ul>
        `,
        confirmButtonColor: '#dc2626'
      })

      onSuccess(incidenciaId, penalidadId)
      onClose()
    } catch (error: any) {
      console.error('Error guardando:', error)
      Swal.fire('Error', error?.message || 'No se pudo guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
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
      // NO se cierra al hacer clic afuera
    >
      <div
        className="modal-content"
        style={{
          background: '#fff',
          borderRadius: '12px',
          width: '700px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
            Nueva Incidencia + Penalidad
          </h2>
          <button
            className="modal-close"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>Cargando...</div>
          ) : (
            <>
              {/* Info precargada del siniestro */}
              {(preloadedData.vehiculo_patente || preloadedData.conductor_nombre) && (
                <div style={{
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '20px'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#0369a1', marginBottom: '12px', textTransform: 'uppercase' }}>
                    Datos del Siniestro
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {preloadedData.vehiculo_patente && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Car size={16} color="#0369a1" />
                        <div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>Vehículo</div>
                          <div style={{ fontSize: '14px', fontWeight: 500 }}>{preloadedData.vehiculo_patente}</div>
                        </div>
                      </div>
                    )}
                    {preloadedData.conductor_nombre && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <User size={16} color="#0369a1" />
                        <div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>Conductor</div>
                          <div style={{ fontSize: '14px', fontWeight: 500 }}>{preloadedData.conductor_nombre}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Formulario de Incidencia/Penalidad - Igual que IncidenciasModule */}
              <div className="form-section">
                <div className="form-section-title" style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: '#334155' }}>
                  Datos del Cobro/Descuento
                </div>

                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Patente</label>
                    <div className="searchable-select" style={{ position: 'relative' }}>
                      <input
                        type="text"
                        autoComplete="off"
                        value={selectedVehiculo ? `${selectedVehiculo.patente} - ${selectedVehiculo.marca} ${selectedVehiculo.modelo}` : vehiculoSearch}
                        onChange={e => {
                          setVehiculoSearch(e.target.value)
                          setShowVehiculoDropdown(true)
                          if (incidenciaForm.vehiculo_id) setIncidenciaForm(prev => ({ ...prev, vehiculo_id: '' }))
                        }}
                        onFocus={() => setShowVehiculoDropdown(true)}
                        onBlur={() => setTimeout(() => setShowVehiculoDropdown(false), 200)}
                        placeholder="Buscar patente..."
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                      />
                      {showVehiculoDropdown && vehiculoSearch && filteredVehiculos.length > 0 && (
                        <div className="searchable-dropdown" style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          background: '#fff',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                          zIndex: 100,
                          maxHeight: '200px',
                          overflow: 'auto'
                        }}>
                          {filteredVehiculos.map(v => (
                            <div
                              key={v.id}
                              className="searchable-option"
                              onClick={() => {
                                setIncidenciaForm(prev => ({ ...prev, vehiculo_id: v.id }))
                                setVehiculoSearch('')
                                setShowVehiculoDropdown(false)
                              }}
                              style={{ padding: '8px 12px', cursor: 'pointer' }}
                              onMouseOver={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                              onMouseOut={(e) => (e.currentTarget.style.background = '#fff')}
                            >
                              <strong>{v.patente}</strong> - {v.marca} {v.modelo}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                      Conductor <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <div className="searchable-select" style={{ position: 'relative' }}>
                      <input
                        type="text"
                        autoComplete="off"
                        value={selectedConductor ? selectedConductor.nombre_completo : conductorSearch}
                        onChange={e => {
                          setConductorSearch(e.target.value)
                          setShowConductorDropdown(true)
                          if (incidenciaForm.conductor_id) setIncidenciaForm(prev => ({ ...prev, conductor_id: '' }))
                        }}
                        onFocus={() => setShowConductorDropdown(true)}
                        onBlur={() => setTimeout(() => setShowConductorDropdown(false), 200)}
                        placeholder="Buscar conductor..."
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                      />
                      {showConductorDropdown && conductorSearch && filteredConductores.length > 0 && (
                        <div className="searchable-dropdown" style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          background: '#fff',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                          zIndex: 100,
                          maxHeight: '200px',
                          overflow: 'auto'
                        }}>
                          {filteredConductores.map(c => (
                            <div
                              key={c.id}
                              className="searchable-option"
                              onClick={() => {
                                setIncidenciaForm(prev => ({ ...prev, conductor_id: c.id }))
                                setConductorSearch('')
                                setShowConductorDropdown(false)
                              }}
                              style={{ padding: '8px 12px', cursor: 'pointer' }}
                              onMouseOver={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                              onMouseOut={(e) => (e.currentTarget.style.background = '#fff')}
                            >
                              {c.nombre_completo}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="form-row three-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                      Fecha <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="date"
                      value={incidenciaForm.fecha}
                      onChange={e => setIncidenciaForm(prev => ({ ...prev, fecha: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Semana</label>
                    <input
                      type="text"
                      value={semanaCalculada || '-'}
                      readOnly
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#f8fafc' }}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Modalidad</label>
                    <select
                      value={incidenciaForm.turno}
                      onChange={e => setIncidenciaForm(prev => ({ ...prev, turno: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                    >
                      <option value="">Seleccionar</option>
                      <option value="Diurno">Diurno</option>
                      <option value="Nocturno">Nocturno</option>
                      <option value="A cargo">A cargo</option>
                    </select>
                  </div>
                </div>

                <div className="form-row three-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Tipo</label>
                    <select
                      value={penalidadForm.tipo_penalidad_id}
                      onChange={e => setPenalidadForm(prev => ({ ...prev, tipo_penalidad_id: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                    >
                      <option value="">Seleccionar</option>
                      {tiposPenalidad.length > 0 ? (
                        tiposPenalidad.map(t => (
                          <option key={t.id} value={t.id}>{t.nombre}</option>
                        ))
                      ) : (
                        tiposCobrosDescuentos.map(tipo => (
                          <option key={tipo} value={tipo}>{tipo}</option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Acción a realizar</label>
                    <select
                      value={penalidadForm.detalle}
                      onChange={e => setPenalidadForm(prev => ({ ...prev, detalle: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                    >
                      <option value="">Seleccionar</option>
                      <option value="Descuento">Descuento</option>
                      <option value="Cobro">Cobro</option>
                      <option value="A favor">A favor</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                      Monto (ARS) <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="number"
                      value={penalidadForm.monto || ''}
                      onChange={e => setPenalidadForm(prev => ({ ...prev, monto: Number(e.target.value) || 0 }))}
                      placeholder="0"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                    />
                  </div>
                </div>

                <div className="form-row" style={{ marginBottom: '16px' }}>
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                      Descripción <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <textarea
                      value={incidenciaForm.descripcion}
                      onChange={e => setIncidenciaForm(prev => ({ ...prev, descripcion: e.target.value }))}
                      rows={3}
                      placeholder="Descripción de la incidencia..."
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', resize: 'vertical' }}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Observaciones</label>
                    <textarea
                      value={penalidadForm.observaciones}
                      onChange={e => setPenalidadForm(prev => ({ ...prev, observaciones: e.target.value }))}
                      rows={2}
                      placeholder="Observaciones adicionales..."
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', resize: 'vertical' }}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{
          padding: '16px 24px',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="btn-secondary"
            style={{
              padding: '10px 20px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              background: '#fff',
              cursor: 'pointer'
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={saving || loading}
            className="btn-primary"
            style={{
              padding: '10px 20px',
              borderRadius: '6px',
              border: 'none',
              background: '#dc2626',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
