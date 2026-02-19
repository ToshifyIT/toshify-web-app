// src/modules/asignaciones/components/ProgramacionWizard.tsx
// Wizard para crear nuevas programaciones de entregas

import { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft, Check, Car } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { useSede } from '../../../contexts/SedeContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'
import type {
  ProgramacionOnboardingFormData,
  ProgramacionOnboardingCompleta,
  TipoAsignacion,
  TipoCandidato,
  TurnoOnboarding,
  ModalidadOnboarding,
  ZonaOnboarding,
  TipoDocumento
} from '../../../types/onboarding.types'

interface Vehiculo {
  id: string
  patente: string
  marca: string
  modelo: string
  color?: string
}

interface Conductor {
  id: string
  nombres: string
  apellidos: string
  numero_dni: string
}

interface Props {
  onClose: () => void
  onSuccess: () => void
  initialData?: Partial<ProgramacionOnboardingFormData>
  editingData?: ProgramacionOnboardingCompleta | null
}

export function ProgramacionWizard({ onClose, onSuccess, initialData, editingData }: Props) {
  const isEditing = !!editingData
  const { user, profile } = useAuth()
  const { aplicarFiltroSede, sedeActualId, sedeUsuario } = useSede()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Datos para selects
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [conductores, setConductores] = useState<Conductor[]>([])

  // Busquedas
  const [vehiculoEntregarSearch, setVehiculoEntregarSearch] = useState('')
  const [vehiculoCambioSearch, setVehiculoCambioSearch] = useState('')
  const [conductorSearch, setConductorSearch] = useState('')

  // Form data - inicializar con datos de edicion si existen
  const [formData, setFormData] = useState<ProgramacionOnboardingFormData>(() => {
    // Si estamos editando, usar los datos existentes
    if (editingData) {
      return {
        tipo_asignacion: editingData.tipo_asignacion as TipoAsignacion | undefined,
        modalidad: editingData.modalidad as ModalidadOnboarding | undefined,
        tipo_candidato: editingData.tipo_candidato as TipoCandidato | undefined,
        turno: editingData.turno as TurnoOnboarding | undefined,
        conductor_id: editingData.conductor_id || undefined,
        conductor_nombre: editingData.conductor_nombre || editingData.conductor_display || '',
        conductor_dni: editingData.conductor_dni || '',
        vehiculo_entregar_id: editingData.vehiculo_entregar_id || undefined,
        vehiculo_entregar_patente: editingData.vehiculo_entregar_patente || '',
        vehiculo_entregar_modelo: editingData.vehiculo_entregar_modelo || '',
        vehiculo_cambio_id: editingData.vehiculo_cambio_id || undefined,
        vehiculo_cambio_patente: editingData.vehiculo_cambio_patente || '',
        vehiculo_cambio_modelo: editingData.vehiculo_cambio_modelo || '',
        fecha_cita: editingData.fecha_cita || new Date().toISOString().split('T')[0],
        hora_cita: editingData.hora_cita || '10:00',
        zona: editingData.zona as ZonaOnboarding | undefined,
        distancia_minutos: editingData.distancia_minutos || undefined,
        tipo_documento: editingData.tipo_documento as TipoDocumento | undefined,
        documento_listo: editingData.documento_listo || false,
        grupo_whatsapp: editingData.grupo_whatsapp || false,
        citado_ypf: editingData.citado_ypf || false,
        estado_cabify: editingData.estado_cabify || 'pendiente',
        especialista_nombre: editingData.especialista_nombre || '',
        observaciones: editingData.observaciones || '',
        ...initialData
      }
    }
    
    // Datos por defecto para nueva programacion
    return {
      tipo_asignacion: undefined,
      modalidad: undefined,
      tipo_candidato: undefined,
      turno: undefined,
      conductor_id: undefined,
      conductor_nombre: '',
      conductor_dni: '',
      vehiculo_entregar_id: undefined,
      vehiculo_entregar_patente: '',
      vehiculo_cambio_id: undefined,
      vehiculo_cambio_patente: '',
      fecha_cita: new Date().toISOString().split('T')[0],
      hora_cita: '10:00',
      zona: undefined,
      distancia_minutos: undefined,
      tipo_documento: undefined,
      documento_listo: false,
      grupo_whatsapp: false,
      citado_ypf: false,
      estado_cabify: 'pendiente',
        especialista_nombre: '',
      observaciones: '',
      ...initialData
    }
  })

  // Cargar datos
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [vehiculosRes, conductoresRes] = await Promise.all([
        aplicarFiltroSede(supabase.from('vehiculos').select('id, patente, marca, modelo, color').is('deleted_at', null)).order('patente'),
        aplicarFiltroSede(supabase.from('conductores').select('id, nombres, apellidos, numero_dni')).order('apellidos')
      ])

      setVehiculos(vehiculosRes.data || [])
      setConductores(conductoresRes.data || [])
    } catch (error) {
      console.error('Error cargando datos:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filtrar vehiculos
  const vehiculosFiltradosEntregar = vehiculos.filter(v =>
    v.patente.toLowerCase().includes(vehiculoEntregarSearch.toLowerCase()) ||
    v.marca.toLowerCase().includes(vehiculoEntregarSearch.toLowerCase())
  ).slice(0, 10)

  const vehiculosFiltradosCambio = vehiculos.filter(v =>
    v.patente.toLowerCase().includes(vehiculoCambioSearch.toLowerCase()) ||
    v.marca.toLowerCase().includes(vehiculoCambioSearch.toLowerCase())
  ).slice(0, 10)

  // Filtrar conductores
  const conductoresFiltrados = conductores.filter(c => {
    const fullName = `${c.nombres} ${c.apellidos}`.toLowerCase()
    const search = conductorSearch.toLowerCase()
    return fullName.includes(search) || c.numero_dni.includes(search)
  }).slice(0, 10)

  // Seleccionar vehiculo
  function selectVehiculoEntregar(v: Vehiculo) {
    setFormData(prev => ({
      ...prev,
      vehiculo_entregar_id: v.id,
      vehiculo_entregar_patente: v.patente,
      vehiculo_entregar_modelo: `${v.marca} ${v.modelo}`,
      vehiculo_entregar_color: v.color
    }))
    setVehiculoEntregarSearch('')
  }

  function selectVehiculoCambio(v: Vehiculo) {
    setFormData(prev => ({
      ...prev,
      vehiculo_cambio_id: v.id,
      vehiculo_cambio_patente: v.patente,
      vehiculo_cambio_modelo: `${v.marca} ${v.modelo}`
    }))
    setVehiculoCambioSearch('')
  }

  // Seleccionar conductor
  function selectConductor(c: Conductor) {
    setFormData(prev => ({
      ...prev,
      conductor_id: c.id,
      conductor_nombre: `${c.nombres} ${c.apellidos}`,
      conductor_dni: c.numero_dni
    }))
    setConductorSearch('')
  }

  // Validacion por paso
  function canAdvance(): boolean {
    switch (step) {
      case 1:
        // Tipo y Modalidad requeridos
        // Si modalidad es TURNO, tambien se requiere el turno
        const tipoOk = !!formData.tipo_asignacion && !!formData.modalidad
        const turnoOk = formData.modalidad === 'CARGO' || !!formData.turno
        return tipoOk && turnoOk
      case 2:
        return !!formData.vehiculo_entregar_id || !!formData.vehiculo_entregar_patente
      case 3:
        // Conductor requerido siempre
        const tieneConductor = !!formData.conductor_id || !!formData.conductor_nombre
        return tieneConductor
      case 4:
        return true
      default:
        return false
    }
  }

  // Guardar (crear o actualizar)
  async function handleSubmit() {
    setSaving(true)
    try {
      const dataToSave = {
        ...formData,
        // Si modalidad es CARGO, limpiar el turno
        turno: formData.modalidad === 'CARGO' ? null : formData.turno
      }

      if (isEditing && editingData) {
        // UPDATE - editar existente
        const { error } = await (supabase.from('programaciones_onboarding') as any)
          .update(dataToSave)
          .eq('id', editingData.id)

        if (error) throw error

        showSuccess('Programación actualizada', 'Los cambios se guardaron correctamente')
      } else {
        // INSERT - crear nueva
        const { error } = await (supabase.from('programaciones_onboarding') as any).insert({
          ...dataToSave,
          estado: 'por_agendar',
          created_by: user?.id,
          created_by_name: profile?.full_name || 'Sistema',
          sede_id: sedeActualId || sedeUsuario?.id
        })

        if (error) throw error

        showSuccess('Programación creada', 'La programación se agregó al tablero')
      }

      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Error guardando:', error)
      Swal.fire('Error', error.message || 'No se pudo guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Obtener vehiculo seleccionado
  const vehiculoEntregarSelected = vehiculos.find(v => v.id === formData.vehiculo_entregar_id)
  const vehiculoCambioSelected = vehiculos.find(v => v.id === formData.vehiculo_cambio_id)
  const conductorSelected = conductores.find(c => c.id === formData.conductor_id)

  return (
    <div className="wizard-overlay" onClick={onClose}>
      <div className="wizard-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
        {/* Header */}
        <div className="wizard-header">
          <h2>{isEditing ? 'Editar Programacion' : 'Nueva Programacion'}</h2>
          <button className="wizard-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Progress */}
        <div className="wizard-progress">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`wizard-step ${step >= s ? 'active' : ''} ${step === s ? 'current' : ''}`}>
              <div className="step-number">{s}</div>
              <div className="step-label">
                {s === 1 && 'Tipo'}
                {s === 2 && 'Vehiculo'}
                {s === 3 && 'Conductor'}
                {s === 4 && 'Detalles'}
              </div>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="wizard-content">
          {loading ? (
            <div className="wizard-loading">Cargando...</div>
          ) : (
            <>
              {/* Paso 1: Tipo de Asignacion */}
              {step === 1 && (
                <div className="wizard-step-content">
                  <h3>Que tipo de asignacion es?</h3>
                  
                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label>Tipo de Asignacion</label>
                    <div className="option-cards">
                      {(['entrega_auto', 'cambio_auto', 'asignacion_companero'] as TipoAsignacion[]).map(tipo => (
                        <div
                          key={tipo}
                          className={`option-card ${formData.tipo_asignacion === tipo ? 'selected' : ''}`}
                          onClick={() => setFormData(prev => ({ ...prev, tipo_asignacion: tipo }))}
                        >
                          <Car size={24} />
                          <span>
                            {tipo === 'entrega_auto' && 'Entrega de auto'}
                            {tipo === 'cambio_auto' && 'Cambio de auto'}
                            {tipo === 'asignacion_companero' && 'Asignacion de companero'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Modalidad</label>
                    <div className="option-cards horizontal">
                      {(['TURNO', 'CARGO'] as ModalidadOnboarding[]).map(mod => (
                        <div
                          key={mod}
                          className={`option-card ${formData.modalidad === mod ? 'selected' : ''}`}
                          onClick={() => setFormData(prev => ({ ...prev, modalidad: mod, turno: mod === 'CARGO' ? undefined : prev.turno }))}
                        >
                          <span>{mod === 'TURNO' ? 'Turno' : 'A Cargo'}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Mostrar selector de Turno si la modalidad es TURNO */}
                  {formData.modalidad === 'TURNO' && (
                    <div className="form-group" style={{ marginTop: '20px' }}>
                      <label>Que turno?</label>
                      <div className="option-cards horizontal">
                        {(['diurno', 'nocturno'] as TurnoOnboarding[]).map(turno => (
                          <div
                            key={turno}
                            className={`option-card ${formData.turno === turno ? 'selected' : ''}`}
                            onClick={() => setFormData(prev => ({ ...prev, turno }))}
                          >
                            <span>{turno === 'diurno' ? 'Diurno' : 'Nocturno'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Paso 2: Vehiculo */}
              {step === 2 && (
                <div className="wizard-step-content">
                  <h3>Vehiculo a entregar</h3>

                  <div className="form-group">
                    <label>Buscar vehiculo</label>
                    <div className="searchable-select">
                      <input
                        type="text"
                        placeholder="Buscar por patente..."
                        value={vehiculoEntregarSelected ? `${vehiculoEntregarSelected.patente} - ${vehiculoEntregarSelected.marca} ${vehiculoEntregarSelected.modelo}` : vehiculoEntregarSearch}
                        onChange={e => {
                          setVehiculoEntregarSearch(e.target.value)
                          if (formData.vehiculo_entregar_id) {
                            setFormData(prev => ({ ...prev, vehiculo_entregar_id: undefined }))
                          }
                        }}
                      />
                      {vehiculoEntregarSearch && !formData.vehiculo_entregar_id && vehiculosFiltradosEntregar.length > 0 && (
                        <div className="searchable-dropdown">
                          {vehiculosFiltradosEntregar.map(v => (
                            <div key={v.id} className="searchable-option" onClick={() => selectVehiculoEntregar(v)}>
                              <strong>{v.patente}</strong> - {v.marca} {v.modelo}
                            </div>
                          ))}
                        </div>
                      )}
                      {vehiculoEntregarSelected && (
                        <button
                          type="button"
                          className="clear-selection"
                          onClick={() => setFormData(prev => ({
                            ...prev,
                            vehiculo_entregar_id: undefined,
                            vehiculo_entregar_patente: '',
                            vehiculo_entregar_modelo: ''
                          }))}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {formData.tipo_asignacion === 'cambio_auto' && (
                    <>
                      <h3 style={{ marginTop: '24px' }}>Vehiculo a cambio (que devuelve)</h3>
                      <div className="form-group">
                        <label>Buscar vehiculo</label>
                        <div className="searchable-select">
                          <input
                            type="text"
                            placeholder="Buscar por patente..."
                            value={vehiculoCambioSelected ? `${vehiculoCambioSelected.patente} - ${vehiculoCambioSelected.marca} ${vehiculoCambioSelected.modelo}` : vehiculoCambioSearch}
                            onChange={e => {
                              setVehiculoCambioSearch(e.target.value)
                              if (formData.vehiculo_cambio_id) {
                                setFormData(prev => ({ ...prev, vehiculo_cambio_id: undefined }))
                              }
                            }}
                          />
                          {vehiculoCambioSearch && !formData.vehiculo_cambio_id && vehiculosFiltradosCambio.length > 0 && (
                            <div className="searchable-dropdown">
                              {vehiculosFiltradosCambio.map(v => (
                                <div key={v.id} className="searchable-option" onClick={() => selectVehiculoCambio(v)}>
                                  <strong>{v.patente}</strong> - {v.marca} {v.modelo}
                                </div>
                              ))}
                            </div>
                          )}
                          {vehiculoCambioSelected && (
                            <button
                              type="button"
                              className="clear-selection"
                              onClick={() => setFormData(prev => ({
                                ...prev,
                                vehiculo_cambio_id: undefined,
                                vehiculo_cambio_patente: '',
                                vehiculo_cambio_modelo: ''
                              }))}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Paso 3: Conductor */}
              {step === 3 && (
                <div className="wizard-step-content">
                  <h3>Datos del conductor</h3>

                  <div className="form-group">
                    <label>Buscar conductor</label>
                    <div className="searchable-select">
                      <input
                        type="text"
                        placeholder="Buscar por nombre o DNI..."
                        value={conductorSelected ? `${conductorSelected.nombres} ${conductorSelected.apellidos}` : conductorSearch}
                        onChange={e => {
                          setConductorSearch(e.target.value)
                          if (formData.conductor_id) {
                            setFormData(prev => ({ ...prev, conductor_id: undefined }))
                          }
                        }}
                      />
                      {conductorSearch && !formData.conductor_id && conductoresFiltrados.length > 0 && (
                        <div className="searchable-dropdown">
                          {conductoresFiltrados.map(c => (
                            <div key={c.id} className="searchable-option" onClick={() => selectConductor(c)}>
                              <strong>{c.nombres} {c.apellidos}</strong> - DNI: {c.numero_dni}
                            </div>
                          ))}
                        </div>
                      )}
                      {conductorSelected && (
                        <button
                          type="button"
                          className="clear-selection"
                          onClick={() => setFormData(prev => ({
                            ...prev,
                            conductor_id: undefined,
                            conductor_nombre: '',
                            conductor_dni: ''
                          }))}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <small style={{ color: '#6B7280', marginTop: '4px', display: 'block' }}>
                      Si el conductor no esta en el sistema, escribe su nombre manualmente
                    </small>
                  </div>

                  {!formData.conductor_id && conductorSearch && conductoresFiltrados.length === 0 && (
                    <div className="form-row" style={{ marginTop: '16px' }}>
                      <div className="form-group">
                        <label>Nombre del conductor</label>
                        <input
                          type="text"
                          value={formData.conductor_nombre || ''}
                          onChange={e => setFormData(prev => ({ ...prev, conductor_nombre: e.target.value }))}
                          placeholder="Nombre completo"
                        />
                      </div>
                      <div className="form-group">
                        <label>DNI</label>
                        <input
                          type="text"
                          value={formData.conductor_dni || ''}
                          onChange={e => setFormData(prev => ({ ...prev, conductor_dni: e.target.value }))}
                          placeholder="Numero de DNI"
                        />
                      </div>
                    </div>
                  )}

                  <div className="form-group" style={{ marginTop: '20px' }}>
                    <label>Tipo de candidato</label>
                    <select
                      value={formData.tipo_candidato || ''}
                      onChange={e => setFormData(prev => ({ ...prev, tipo_candidato: e.target.value as TipoCandidato }))}
                    >
                      <option value="">Seleccionar</option>
                      <option value="nuevo">Nuevo</option>
                      <option value="antiguo">Antiguo</option>
                      <option value="reingreso">Reingreso</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Paso 4: Detalles */}
              {step === 4 && (
                <div className="wizard-step-content">
                  <h3>Detalles de la cita</h3>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Fecha</label>
                      <input
                        type="date"
                        value={formData.fecha_cita || ''}
                        onChange={e => setFormData(prev => ({ ...prev, fecha_cita: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Hora</label>
                      <input
                        type="time"
                        value={formData.hora_cita || ''}
                        onChange={e => setFormData(prev => ({ ...prev, hora_cita: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Zona</label>
                      <select
                        value={formData.zona || ''}
                        onChange={e => setFormData(prev => ({ ...prev, zona: e.target.value as ZonaOnboarding }))}
                      >
                        <option value="">Seleccionar</option>
                        <option value="norte">Norte</option>
                        <option value="sur">Sur</option>
                        <option value="caba">CABA</option>
                        <option value="oeste">Oeste</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Distancia (minutos)</label>
                      <input
                        type="number"
                        value={formData.distancia_minutos || ''}
                        onChange={e => setFormData(prev => ({ ...prev, distancia_minutos: parseInt(e.target.value) || undefined }))}
                        placeholder="Ej: 15"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Documento</label>
                      <select
                        value={formData.tipo_documento || ''}
                        onChange={e => setFormData(prev => ({ ...prev, tipo_documento: e.target.value as TipoDocumento }))}
                      >
                        <option value="">Seleccionar</option>
                        <option value="contrato">Contrato</option>
                        <option value="anexo">Anexo</option>
                        <option value="na">N/A</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Especialista</label>
                      <input
                        type="text"
                        value={formData.especialista_nombre || ''}
                        onChange={e => setFormData(prev => ({ ...prev, especialista_nombre: e.target.value }))}
                        placeholder="Nombre del especialista..."
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Observaciones</label>
                    <textarea
                      value={formData.observaciones || ''}
                      onChange={e => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
                      placeholder="Notas adicionales..."
                      rows={3}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="wizard-footer">
          {step > 1 && (
            <button className="btn-secondary" onClick={() => setStep(s => s - 1)} disabled={saving}>
              <ChevronLeft size={16} />
              Anterior
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < 4 ? (
            <button
              className="btn-primary"
              onClick={() => setStep(s => s + 1)}
              disabled={!canAdvance()}
            >
              Siguiente
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Crear Programacion')}
              <Check size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
