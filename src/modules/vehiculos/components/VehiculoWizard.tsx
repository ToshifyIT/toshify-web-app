// src/modules/vehiculos/components/VehiculoWizard.tsx
import { useState } from 'react'
import { Car, Settings, Wrench, Calendar, Shield, Check, ChevronLeft, ChevronRight, Save, Info } from 'lucide-react'
import type { VehiculoEstado } from '../../../types/database.types'

interface VehiculoFormData {
  patente: string
  marca: string
  modelo: string
  anio: number
  color: string
  tipo_vehiculo: string
  tipo_combustible: string
  tipo_gps: string
  gps_uss: boolean
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
  notas: string
  url_documentacion: string
  sede_id: string
}

interface VehiculoWizardProps {
  formData: VehiculoFormData
  setFormData: React.Dispatch<React.SetStateAction<VehiculoFormData>>
  vehiculosEstados: VehiculoEstado[]
  marcasExistentes: string[]
  modelosExistentes: string[]
  sedes: { id: string; nombre: string }[]
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
  sedes,
  onCancel,
  onSubmit,
  saving
}: VehiculoWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})

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
                <label style={{ display: 'flex', alignItems: 'center', height: '42px', cursor: 'pointer', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.gps_uss}
                    onChange={(e) => setFormData({ ...formData, gps_uss: e.target.checked })}
                    disabled={saving}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ color: formData.gps_uss ? '#10B981' : 'var(--text-primary)' }}>
                    USS (Wialon)
                  </span>
                </label>
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

            <div className="form-group">
              <label className="form-label">Titular <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="text"
                className="form-input"
                value={formData.titular}
                onChange={(e) => setFormData({ ...formData, titular: e.target.value })}
                disabled={saving}
                required
                placeholder="Nombre del titular del vehículo"
                style={!formData.titular?.trim() ? { borderColor: '#ef4444' } : {}}
              />
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
