// src/modules/vehiculos/components/VehiculoWizard.tsx
import { useState, useRef, useEffect } from 'react'
import { Car, Settings, Wrench, Calendar, Shield, Check, ChevronLeft, ChevronRight, Save, Info } from 'lucide-react'
import type { VehiculoEstado } from '../../../types/database.types'
import { SearchableSelect } from '../../../components/ui/SearchableSelect/SearchableSelect'

interface VehiculoFormData {
  patente: string
  marca: string
  modelo: string
  anio: number
  color: string
  tipo_vehiculo: string
  tipo_combustible: string
  tipo_gps: string
  gps_uss: string
  gnc: boolean
  telepase: boolean
  numero_motor: string
  numero_chasis: string
  provisoria: string
  estado_id: string
  kilometraje_actual: number
  fecha_adquisicion: string
  fecha_ulti_inspeccion: string
  fecha_prox_inspeccion: string
  cobertura: string
  seguro_numero: string
  seguro_vigencia: string
  titular: string
  tipo_titular: 'persona' | 'empresa' | ''
  titular_id: string
  notas: string
  url_documentacion: string
  sede_id: string
  grupo_flota: string
  cantidad_llaves: string // '1' | '2' | ''
  lugar_radicacion: string
  vencimiento_seguro: string
  vto_vtv_aplica: boolean
  vto_vtv_fecha: string
  vto_gnc_aplica: boolean
  vto_gnc_fecha: string
  vto_matafuego_aplica: boolean
  vto_matafuego_fecha: string
}

interface TitularOption {
  id: string
  tipo: 'persona' | 'empresa'
  nombre: string // nombre completo ya formateado
}

interface VehiculoWizardProps {
  formData: VehiculoFormData
  setFormData: React.Dispatch<React.SetStateAction<VehiculoFormData>>
  vehiculosEstados: VehiculoEstado[]
  marcasExistentes: string[]
  modelosExistentes: string[]
  gruposFlotaExistentes: string[]
  sedes: { id: string; nombre: string }[]
  titulares: TitularOption[]
  onCancel: () => void
  onSubmit: () => void
  saving: boolean
}

type StepKey = 'basico' | 'tipo' | 'tecnico' | 'estado' | 'seguro'

const STEPS: { key: StepKey; title: string; icon: React.ReactNode }[] = [
  { key: 'basico', title: 'Básico', icon: <Car size={16} /> },
  { key: 'tipo', title: 'Tipo', icon: <Settings size={16} /> },
  { key: 'tecnico', title: 'Técnico', icon: <Wrench size={16} /> },
  { key: 'estado', title: 'Estado', icon: <Calendar size={16} /> },
  { key: 'seguro', title: 'Seguro', icon: <Shield size={16} /> },
]

export function VehiculoWizard({
  formData,
  setFormData,
  vehiculosEstados,
  marcasExistentes,
  modelosExistentes,
  gruposFlotaExistentes,
  sedes,
  titulares,
  onCancel,
  onSubmit,
  saving
}: VehiculoWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showTitularDropdown, setShowTitularDropdown] = useState(false)
  const titularInputRef = useRef<HTMLInputElement>(null)
  const titularDropdownRef = useRef<HTMLDivElement>(null)

  // Filtrar titulares según tipo seleccionado y texto escrito
  const filteredTitulares = formData.tipo_titular
    ? titulares
        .filter(t => t.tipo === formData.tipo_titular)
        .filter(t => {
          const search = formData.titular.trim().toUpperCase()
          if (!search) return true
          return t.nombre.toUpperCase().includes(search)
        })
    : []

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        titularDropdownRef.current && !titularDropdownRef.current.contains(e.target as Node) &&
        titularInputRef.current && !titularInputRef.current.contains(e.target as Node)
      ) {
        setShowTitularDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const validateStep = (stepIndex: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (stepIndex === 0) {
      // Paso 1: Básico - sede, patente, marca, modelo, año, color y tipo son requeridos
      if (!formData.sede_id) {
        newErrors.sede_id = 'La sede es requerida'
      }
      if (!formData.patente.trim()) {
        newErrors.patente = 'La patente es requerida'
      }
      if (!formData.marca.trim()) {
        newErrors.marca = 'La marca es requerida'
      }
      if (!formData.modelo.trim()) {
        newErrors.modelo = 'El modelo es requerido'
      }
      if (!formData.anio) {
        newErrors.anio = 'El año es requerido'
      }
      if (!formData.color.trim()) {
        newErrors.color = 'El color es requerido'
      }
      if (!formData.tipo_vehiculo.trim()) {
        newErrors.tipo_vehiculo = 'El tipo es requerido'
      }
    }

    if (stepIndex === 2) {
      // Paso 3: Técnico - número motor y número chasis son requeridos
      if (!formData.numero_motor.trim()) {
        newErrors.numero_motor = 'El número de motor es requerido'
      }
      if (!formData.numero_chasis.trim()) {
        newErrors.numero_chasis = 'El número de chasis es requerido'
      }
    }

    if (stepIndex === 4) {
      // Paso 5: Seguro / Información Adicional - lugar de radicación y titular son requeridos
      if (!formData.lugar_radicacion.trim()) {
        newErrors.lugar_radicacion = 'El lugar de radicación es requerido'
      }
      if (!formData.tipo_titular) {
        newErrors.tipo_titular = 'El tipo de titular es requerido'
      }
      if (!formData.titular.trim()) {
        newErrors.titular = 'El titular es requerido'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1))
    }
  }

  const handlePrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0))
  }

  const handleStepClick = (index: number) => {
    // Solo permitir ir hacia atrás o al paso actual
    if (index < currentStep) {
      setCurrentStep(index)
    } else if (index === currentStep + 1 && validateStep(currentStep)) {
      setCurrentStep(index)
    }
  }

  const handleSubmit = () => {
    if (validateStep(currentStep)) {
      onSubmit()
    }
  }

  const renderStepContent = () => {
    switch (STEPS[currentStep].key) {
      case 'basico':
        return (
          <div className="wizard-step-content">
            <div className="wizard-step-header">
              <Car size={20} />
              <h3>Información Básica</h3>
            </div>
            <p className="step-description">
              Selecciona la sede y ingresa los datos principales del vehículo.
            </p>

            <div className="form-group">
              <label className="form-label">Sede *</label>
              <select
                className={`form-input ${errors.sede_id ? 'input-error' : ''}`}
                value={formData.sede_id}
                onChange={(e) => setFormData({ ...formData, sede_id: e.target.value })}
                disabled={saving}
              >
                <option value="">Seleccionar sede...</option>
                {sedes.map(sede => (
                  <option key={sede.id} value={sede.id}>{sede.nombre}</option>
                ))}
              </select>
              {errors.sede_id && <span className="error-message">{errors.sede_id}</span>}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Patente *</label>
                <input
                  type="text"
                  className={`form-input ${errors.patente ? 'input-error' : ''}`}
                  value={formData.patente}
                  onChange={(e) => setFormData({ ...formData, patente: e.target.value.toUpperCase() })}
                  placeholder="ABC123"
                  disabled={saving}
                  maxLength={10}
                />
                {errors.patente && <span className="error-message">{errors.patente}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Marca *</label>
                <input
                  type="text"
                  className={`form-input ${errors.marca ? 'input-error' : ''}`}
                  value={formData.marca}
                  onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                  placeholder={marcasExistentes.length > 0 ? marcasExistentes.slice(0, 3).join(', ') + '...' : 'Toyota, Ford, etc.'}
                  disabled={saving}
                />
                {errors.marca && <span className="error-message">{errors.marca}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Modelo *</label>
                <input
                  type="text"
                  className={`form-input ${errors.modelo ? 'input-error' : ''}`}
                  value={formData.modelo}
                  onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                  placeholder={modelosExistentes.length > 0 ? modelosExistentes.slice(0, 3).join(', ') + '...' : 'Hilux, Ranger, etc.'}
                  disabled={saving}
                />
                {errors.modelo && <span className="error-message">{errors.modelo}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Año *</label>
                <input
                  type="number"
                  className={`form-input ${errors.anio ? 'input-error' : ''}`}
                  value={formData.anio}
                  onChange={(e) => setFormData({ ...formData, anio: parseInt(e.target.value) || new Date().getFullYear() })}
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  disabled={saving}
                />
                {errors.anio && <span className="error-message">{errors.anio}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Color *</label>
                <input
                  type="text"
                  className={`form-input ${errors.color ? 'input-error' : ''}`}
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="Blanco, Negro, etc."
                  disabled={saving}
                />
                {errors.color && <span className="error-message">{errors.color}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Tipo *</label>
                <select
                  className={`form-input ${errors.tipo_vehiculo ? 'input-error' : ''}`}
                  value={formData.tipo_vehiculo}
                  onChange={(e) => setFormData({ ...formData, tipo_vehiculo: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  <option value="SEDAN 5 PUERTAS">SEDAN 5 PUERTAS</option>
                  <option value="SEDAN 4 PUERTAS">SEDAN 4 PUERTAS</option>
                </select>
                {errors.tipo_vehiculo && <span className="error-message">{errors.tipo_vehiculo}</span>}
              </div>
            </div>
          </div>
        )

      case 'tipo':
        return (
          <div className="wizard-step-content">
            <div className="wizard-step-header">
              <Settings size={20} />
              <h3>Combustible y GPS</h3>
            </div>
            <p className="step-description">
              Define el tipo de combustible y configuración GPS del vehículo.
            </p>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tipo Combustible</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.tipo_combustible}
                  onChange={(e) => setFormData({ ...formData, tipo_combustible: e.target.value })}
                  placeholder="Nafta, Gasoil, GNC..."
                  disabled={saving}
                />
              </div>

              <div className="form-group" style={{ display: 'flex', gap: '24px' }}>
                <div>
                  <label className="form-label">GNC</label>
                  <label style={{ display: 'flex', alignItems: 'center', height: '42px', cursor: 'pointer', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={formData.gnc}
                      onChange={(e) => setFormData({ ...formData, gnc: e.target.checked })}
                      disabled={saving}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ color: formData.gnc ? '#10B981' : 'var(--text-primary)' }}>
                      GNC
                    </span>
                  </label>
                </div>
                <div>
                  <label className="form-label">Telepase</label>
                  <label style={{ display: 'flex', alignItems: 'center', height: '42px', cursor: 'pointer', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={formData.telepase}
                      onChange={(e) => setFormData({ ...formData, telepase: e.target.checked })}
                      disabled={saving}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ color: formData.telepase ? '#3b82f6' : 'var(--text-primary)' }}>
                      Telepase Propio
                    </span>
                    <span style={{ position: 'relative', display: 'inline-flex' }} className="telepase-tooltip-wrap">
                      <Info size={14} style={{ color: '#9CA3AF', cursor: 'help', flexShrink: 0 }} />
                      <span className="telepase-tooltip">Al activar, el peaje es asumido por el conductor asignado a este vehículo</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">GPS 1</label>
                <select
                  className="form-input"
                  value={formData.tipo_gps}
                  onChange={(e) => setFormData({ ...formData, tipo_gps: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Sin GPS</option>
                  <option value="Strix">Strix</option>
                  <option value="Traccar">Traccar</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">GPS 2</label>
                <select
                  className="form-select"
                  value={formData.gps_uss}
                  onChange={(e) => setFormData({ ...formData, gps_uss: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Sin GPS 2</option>
                  <option value="USS">USS (WIALON)</option>
                  <option value="GEOTAB">Geotab</option>
                </select>
              </div>
            </div>
          </div>
        )

      case 'tecnico':
        return (
          <div className="wizard-step-content">
            <div className="wizard-step-header">
              <Wrench size={20} />
              <h3>Datos Técnicos</h3>
            </div>
            <p className="step-description">
              Información técnica del vehículo: motor, chasis y kilometraje.
            </p>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Número Motor *</label>
                <input
                  type="text"
                  className={`form-input ${errors.numero_motor ? 'input-error' : ''}`}
                  value={formData.numero_motor}
                  onChange={(e) => setFormData({ ...formData, numero_motor: e.target.value })}
                  disabled={saving}
                />
                {errors.numero_motor && <span className="error-message">{errors.numero_motor}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Número Chasis *</label>
                <input
                  type="text"
                  className={`form-input ${errors.numero_chasis ? 'input-error' : ''}`}
                  value={formData.numero_chasis}
                  onChange={(e) => setFormData({ ...formData, numero_chasis: e.target.value })}
                  disabled={saving}
                />
                {errors.numero_chasis && <span className="error-message">{errors.numero_chasis}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Provisoria</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.provisoria}
                  onChange={(e) => setFormData({ ...formData, provisoria: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Kilometraje Actual</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.kilometraje_actual}
                  onChange={(e) => setFormData({ ...formData, kilometraje_actual: parseInt(e.target.value) || 0 })}
                  min="0"
                  disabled={saving}
                />
              </div>
            </div>
          </div>
        )

      case 'estado':
        return (
          <div className="wizard-step-content">
            <div className="wizard-step-header">
              <Calendar size={20} />
              <h3>Estado y Fechas</h3>
            </div>
            <p className="step-description">
              Configura el estado actual y las fechas relevantes del vehículo.
            </p>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select
                  className="form-input"
                  value={formData.estado_id}
                  onChange={(e) => setFormData({ ...formData, estado_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  {vehiculosEstados
                    .filter((estado) => [
                      'PKG_ON_BASE',
                      'PKG_OFF_BASE',
                      'CORPORATIVO',
                      'EN_USO',
                      'TALLER_BASE_VALIENTE',
                      'TALLER_AXIS',
                      'RETENIDO_COMISARIA',
                      'TALLER_CHAPA_PINTURA'
                    ].includes(estado.codigo))
                    .map((estado) => (
                      <option key={estado.id} value={estado.id}>
                        {estado.descripcion}
                      </option>
                    ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Fecha Adquisición</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.fecha_adquisicion}
                  onChange={(e) => setFormData({ ...formData, fecha_adquisicion: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Última Inspección</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.fecha_ulti_inspeccion}
                  onChange={(e) => setFormData({ ...formData, fecha_ulti_inspeccion: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Próxima Inspección</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.fecha_prox_inspeccion}
                  onChange={(e) => setFormData({ ...formData, fecha_prox_inspeccion: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>
          </div>
        )

      case 'seguro':
        return (
          <div className="wizard-step-content">
            <div className="wizard-step-header">
              <Shield size={20} />
              <h3>Seguro e Información Adicional</h3>
            </div>
            <p className="step-description">
              Datos del seguro y notas adicionales sobre el vehículo.
            </p>

            <div className="form-group">
              <label className="form-label">Cobertura <span className="required">*</span></label>
              <input
                type="text"
                className="form-input"
                value={formData.cobertura}
                onChange={(e) => setFormData({ ...formData, cobertura: e.target.value })}
                disabled={saving}
                placeholder="Tipo de cobertura del seguro"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Número de Póliza</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.seguro_numero}
                  onChange={(e) => setFormData({ ...formData, seguro_numero: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Vigencia Seguro</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.seguro_vigencia}
                  onChange={(e) => setFormData({ ...formData, seguro_vigencia: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Vencimiento Seguro</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.vencimiento_seguro}
                  onChange={(e) => setFormData({ ...formData, vencimiento_seguro: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Lugar de Radicación <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.lugar_radicacion}
                  onChange={(e) => setFormData({ ...formData, lugar_radicacion: e.target.value })}
                  disabled={saving}
                  required
                  placeholder="Ciudad / jurisdicción"
                  style={!formData.lugar_radicacion?.trim() ? { borderColor: '#ef4444' } : {}}
                />
              </div>
            </div>

            {/* Sección Relación Titular */}
            <div style={{
              border: '1px solid var(--border-primary)',
              borderRadius: '8px',
              padding: '16px',
              marginTop: '4px',
              background: 'var(--bg-secondary)',
            }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Relación Titular
              </h4>

              <div className="form-group">
                <label className="form-label">Tipo de Titular <span style={{ color: '#ef4444' }}>*</span></label>
                <select
                  className={`form-input ${errors.tipo_titular ? 'input-error' : ''}`}
                  value={formData.tipo_titular}
                  onChange={(e) => {
                    const tipo = e.target.value as 'persona' | 'empresa' | ''
                    setFormData({ ...formData, tipo_titular: tipo, titular: '', titular_id: '' })
                    setShowTitularDropdown(false)
                  }}
                  disabled={saving}
                >
                  <option value="">Seleccionar tipo...</option>
                  <option value="persona">Persona</option>
                  <option value="empresa">Empresa</option>
                </select>
                {errors.tipo_titular && <span className="error-message">{errors.tipo_titular}</span>}
              </div>

              {formData.tipo_titular && (
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">
                    {formData.tipo_titular === 'persona' ? 'Nombre del Titular' : 'Razón Social'} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    ref={titularInputRef}
                    type="text"
                    className={`form-input ${errors.titular ? 'input-error' : ''}`}
                    value={formData.titular}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase()
                      setFormData({ ...formData, titular: val, titular_id: '' })
                      setShowTitularDropdown(true)
                    }}
                    onFocus={() => setShowTitularDropdown(true)}
                    disabled={saving}
                    placeholder={formData.tipo_titular === 'persona' ? 'Ej: GARCIA JUAN' : 'Ej: NAIREBIS S.R.L.'}
                    autoComplete="off"
                  />
                  {errors.titular && <span className="error-message">{errors.titular}</span>}

                  {/* Dropdown autocomplete */}
                  {showTitularDropdown && formData.titular.trim() !== '' && filteredTitulares.length > 0 && (
                    <div
                      ref={titularDropdownRef}
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        maxHeight: '160px',
                        overflowY: 'auto',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '6px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        zIndex: 50,
                        marginTop: '2px',
                      }}
                    >
                      {filteredTitulares.map(t => (
                        <div
                          key={t.id}
                          onClick={() => {
                            setFormData({ ...formData, titular: t.nombre, titular_id: t.id })
                            setShowTitularDropdown(false)
                          }}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: 'var(--text-primary)',
                            borderBottom: '1px solid var(--border-primary)',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          {t.nombre}
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Grupo de Flota</label>
                <SearchableSelect
                  value={formData.grupo_flota}
                  onChange={(val) => setFormData({ ...formData, grupo_flota: val })}
                  options={gruposFlotaExistentes.map(g => ({ value: g, label: g }))}
                  placeholder="Seleccionar grupo..."
                  searchPlaceholder="Buscar grupo..."
                  disabled={saving}
                  clearable
                  noResultsText="No hay grupos de flota"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Cantidad de llaves de encendido</label>
                <select
                  className="form-input"
                  value={formData.cantidad_llaves}
                  onChange={(e) => setFormData({ ...formData, cantidad_llaves: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </div>
            </div>

            {/* Vencimientos opcionales: VTV / GNC / Matafuego (Si/No + fecha si aplica) */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Vencimiento VTV</label>
                <select
                  className="form-input"
                  value={formData.vto_vtv_aplica ? 'si' : 'no'}
                  onChange={(e) => setFormData({
                    ...formData,
                    vto_vtv_aplica: e.target.value === 'si',
                    vto_vtv_fecha: e.target.value === 'si' ? formData.vto_vtv_fecha : ''
                  })}
                  disabled={saving}
                >
                  <option value="no">No</option>
                  <option value="si">Sí</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Fecha VTV</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.vto_vtv_fecha}
                  onChange={(e) => setFormData({ ...formData, vto_vtv_fecha: e.target.value })}
                  disabled={saving || !formData.vto_vtv_aplica}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Vencimiento GNC</label>
                <select
                  className="form-input"
                  value={formData.vto_gnc_aplica ? 'si' : 'no'}
                  onChange={(e) => setFormData({
                    ...formData,
                    vto_gnc_aplica: e.target.value === 'si',
                    vto_gnc_fecha: e.target.value === 'si' ? formData.vto_gnc_fecha : ''
                  })}
                  disabled={saving}
                >
                  <option value="no">No</option>
                  <option value="si">Sí</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Fecha GNC</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.vto_gnc_fecha}
                  onChange={(e) => setFormData({ ...formData, vto_gnc_fecha: e.target.value })}
                  disabled={saving || !formData.vto_gnc_aplica}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Vencimiento Matafuego</label>
                <select
                  className="form-input"
                  value={formData.vto_matafuego_aplica ? 'si' : 'no'}
                  onChange={(e) => setFormData({
                    ...formData,
                    vto_matafuego_aplica: e.target.value === 'si',
                    vto_matafuego_fecha: e.target.value === 'si' ? formData.vto_matafuego_fecha : ''
                  })}
                  disabled={saving}
                >
                  <option value="no">No</option>
                  <option value="si">Sí</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Fecha Matafuego</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.vto_matafuego_fecha}
                  onChange={(e) => setFormData({ ...formData, vto_matafuego_fecha: e.target.value })}
                  disabled={saving || !formData.vto_matafuego_aplica}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">URL Documentación (Google Drive)</label>
              <input
                type="url"
                className="form-input"
                value={formData.url_documentacion}
                onChange={(e) => setFormData({ ...formData, url_documentacion: e.target.value })}
                disabled={saving}
                placeholder="https://drive.google.com/drive/folders/..."
              />
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px', display: 'block' }}>
                Link a la carpeta de Drive con la documentación del vehículo
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Notas</label>
              <textarea
                className="form-input"
                value={formData.notas}
                onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                disabled={saving}
                rows={3}
                placeholder="Observaciones adicionales..."
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="vehiculo-wizard">
      {/* Progress Steps */}
      <div className="wizard-progress">
        {STEPS.map((step, index) => (
          <div key={step.key} className="wizard-step-container">
            <button
              type="button"
              className={`wizard-step ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
              onClick={() => handleStepClick(index)}
              disabled={saving}
            >
              <span className="wizard-step-number">
                {index < currentStep ? <Check size={14} /> : index + 1}
              </span>
              <span className="wizard-step-title">{step.title}</span>
            </button>
            {index < STEPS.length - 1 && <div className="wizard-step-line" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="wizard-content">
        {renderStepContent()}
      </div>

      {/* Footer Navigation */}
      <div className="wizard-footer">
        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Cancelar
        </button>

        <div className="wizard-nav-buttons">
          {currentStep > 0 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handlePrev}
              disabled={saving}
            >
              <ChevronLeft size={16} />
              Anterior
            </button>
          )}

          {currentStep < STEPS.length - 1 ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleNext}
              disabled={saving}
            >
              Siguiente
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="btn-success"
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? 'Creando...' : (
                <>
                  <Save size={16} />
                  Crear Vehículo
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
