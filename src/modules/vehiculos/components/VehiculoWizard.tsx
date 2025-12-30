// src/modules/vehiculos/components/VehiculoWizard.tsx
import { useState } from 'react'
import { Car, Settings, Wrench, Calendar, Shield, Check, ChevronLeft, ChevronRight, Save } from 'lucide-react'
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
  traccar: boolean
  numero_motor: string
  numero_chasis: string
  provisoria: string
  estado_id: string
  kilometraje_actual: number
  fecha_adquisicion: string
  fecha_ulti_inspeccion: string
  fecha_prox_inspeccion: string
  seguro_numero: string
  seguro_vigencia: string
  titular: string
  notas: string
}

interface VehiculoWizardProps {
  formData: VehiculoFormData
  setFormData: React.Dispatch<React.SetStateAction<VehiculoFormData>>
  vehiculosEstados: VehiculoEstado[]
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
  onCancel,
  onSubmit,
  saving
}: VehiculoWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateStep = (stepIndex: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (stepIndex === 0) {
      // Paso 1: Básico - patente es requerida
      if (!formData.patente.trim()) {
        newErrors.patente = 'La patente es requerida'
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
              Ingresa los datos principales del vehículo. La patente es obligatoria.
            </p>

            <div className="form-group">
              <label className="form-label">Patente *</label>
              <input
                type="text"
                className={`form-input ${errors.patente ? 'input-error' : ''}`}
                value={formData.patente}
                onChange={(e) => setFormData({ ...formData, patente: e.target.value.toUpperCase() })}
                placeholder="ABC-123"
                disabled={saving}
                maxLength={10}
              />
              {errors.patente && <span className="error-message">{errors.patente}</span>}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Marca</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.marca}
                  onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                  placeholder="Toyota, Ford, etc."
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Modelo</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.modelo}
                  onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                  placeholder="Hilux, Ranger, etc."
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Año</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.anio}
                  onChange={(e) => setFormData({ ...formData, anio: parseInt(e.target.value) || new Date().getFullYear() })}
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Color</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="Blanco, Negro, etc."
                  disabled={saving}
                />
              </div>
            </div>
          </div>
        )

      case 'tipo':
        return (
          <div className="wizard-step-content">
            <div className="wizard-step-header">
              <Settings size={20} />
              <h3>Tipo y Características</h3>
            </div>
            <p className="step-description">
              Define el tipo de vehículo, combustible y configuración GPS.
            </p>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tipo de Vehículo</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.tipo_vehiculo}
                  onChange={(e) => setFormData({ ...formData, tipo_vehiculo: e.target.value })}
                  placeholder="Auto, Camioneta, Moto..."
                  disabled={saving}
                />
              </div>

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
            </div>

            <div className="form-group">
              <label className="form-label">Tipo GPS</label>
              <input
                type="text"
                className="form-input"
                value={formData.tipo_gps}
                onChange={(e) => setFormData({ ...formData, tipo_gps: e.target.value })}
                placeholder="GPS Tracker, GPS Satelital..."
                disabled={saving}
              />
            </div>

            <div className="checkbox-group-horizontal">
              <label className="checkbox-card">
                <input
                  type="checkbox"
                  checked={formData.gps_uss}
                  onChange={(e) => setFormData({ ...formData, gps_uss: e.target.checked })}
                  disabled={saving}
                />
                <span className="checkbox-card-label">GPS USS</span>
                <span className="checkbox-card-desc">Integración con USS</span>
              </label>

              <label className="checkbox-card">
                <input
                  type="checkbox"
                  checked={formData.traccar}
                  onChange={(e) => setFormData({ ...formData, traccar: e.target.checked })}
                  disabled={saving}
                />
                <span className="checkbox-card-label">Traccar</span>
                <span className="checkbox-card-desc">Integración con Traccar</span>
              </label>
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
                <label className="form-label">Número Motor</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.numero_motor}
                  onChange={(e) => setFormData({ ...formData, numero_motor: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Número Chasis</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.numero_chasis}
                  onChange={(e) => setFormData({ ...formData, numero_chasis: e.target.value })}
                  disabled={saving}
                />
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
                  {vehiculosEstados.map((estado) => (
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
              <label className="form-label">Titular</label>
              <input
                type="text"
                className="form-input"
                value={formData.titular}
                onChange={(e) => setFormData({ ...formData, titular: e.target.value })}
                disabled={saving}
              />
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
