// src/modules/siniestros/components/SiniestroWizard.tsx
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Check, X, Car, AlertTriangle, FileText, Users } from 'lucide-react'
import type { SiniestroFormData, SiniestroCategoria, SiniestroEstado, VehiculoSimple, ConductorSimple } from '../../../types/siniestros.types'

// =====================================================
// TIPOS
// =====================================================

interface WizardStep {
  id: number
  title: string
  shortTitle: string
  icon: React.ReactNode
  isOptional?: boolean
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 1, title: 'Datos del Evento', shortTitle: 'Evento', icon: <Car size={16} /> },
  { id: 2, title: 'Clasificación', shortTitle: 'Clasif.', icon: <AlertTriangle size={16} /> },
  { id: 3, title: 'Descripción', shortTitle: 'Descr.', icon: <FileText size={16} /> },
  { id: 4, title: 'Datos del Tercero', shortTitle: 'Tercero', icon: <Users size={16} />, isOptional: true },
]

interface SiniestroWizardProps {
  formData: SiniestroFormData
  setFormData: React.Dispatch<React.SetStateAction<SiniestroFormData>>
  categorias: SiniestroCategoria[]
  estados: SiniestroEstado[]
  vehiculos: VehiculoSimple[]
  conductores: ConductorSimple[]
  onVehiculoChange: (id: string) => void
  onCancel: () => void
  onSubmit: () => void
  saving: boolean
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export function SiniestroWizard({
  formData,
  setFormData,
  categorias,
  estados,
  vehiculos,
  conductores,
  onVehiculoChange,
  onCancel,
  onSubmit,
  saving
}: SiniestroWizardProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Validación por paso
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (step === 1) {
      if (!formData.fecha_siniestro) {
        newErrors.fecha_siniestro = 'La fecha es requerida'
      }
    }

    if (step === 2) {
      if (!formData.categoria_id) {
        newErrors.categoria_id = 'La categoría es requerida'
      }
      if (!formData.estado_id) {
        newErrors.estado_id = 'El estado es requerido'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < WIZARD_STEPS.length) {
        setCurrentStep(prev => prev + 1)
      }
    }
  }

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
      setErrors({})
    }
  }

  const handleSubmit = () => {
    // Validar pasos requeridos
    if (!validateStep(1) || !validateStep(2)) {
      return
    }
    onSubmit()
  }

  const handleSkipToEnd = () => {
    // Permitir saltar al final si los pasos requeridos están completos
    if (validateStep(1) && validateStep(2)) {
      handleSubmit()
    } else {
      // Ir al primer paso con error
      if (!formData.fecha_siniestro) {
        setCurrentStep(1)
      } else if (!formData.categoria_id || !formData.estado_id) {
        setCurrentStep(2)
      }
    }
  }

  const isLastStep = currentStep === WIZARD_STEPS.length
  const currentStepData = WIZARD_STEPS[currentStep - 1]

  return (
    <div className="siniestro-wizard">
      {/* Progress Steps */}
      <div className="wizard-progress">
        {WIZARD_STEPS.map((step, index) => (
          <div key={step.id} className="wizard-step-container">
            <button
              className={`wizard-step ${currentStep === step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}`}
              onClick={() => {
                if (step.id < currentStep || validateStep(currentStep)) {
                  setCurrentStep(step.id)
                }
              }}
            >
              <span className="wizard-step-number">
                {currentStep > step.id ? <Check size={14} /> : step.id}
              </span>
              <span className="wizard-step-title">{step.shortTitle}</span>
              {step.isOptional && <span className="wizard-step-optional">(Opc.)</span>}
            </button>
            {index < WIZARD_STEPS.length - 1 && <div className="wizard-step-line" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="wizard-content">
        <div className="wizard-step-header">
          {currentStepData.icon}
          <h3>{currentStepData.title}</h3>
          {currentStepData.isOptional && <span className="optional-badge">Opcional</span>}
        </div>

        {currentStep === 1 && (
          <Step1Evento
            formData={formData}
            setFormData={setFormData}
            vehiculos={vehiculos}
            conductores={conductores}
            onVehiculoChange={onVehiculoChange}
            errors={errors}
          />
        )}

        {currentStep === 2 && (
          <Step2Clasificacion
            formData={formData}
            setFormData={setFormData}
            categorias={categorias}
            estados={estados}
            errors={errors}
          />
        )}

        {currentStep === 3 && (
          <Step3Descripcion
            formData={formData}
            setFormData={setFormData}
          />
        )}

        {currentStep === 4 && (
          <Step4Tercero
            formData={formData}
            setFormData={setFormData}
          />
        )}
      </div>

      {/* Navigation */}
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
          {currentStep > 1 && (
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

          {!isLastStep ? (
            <>
              <button
                type="button"
                className="btn-primary"
                onClick={handleNext}
                disabled={saving}
              >
                Siguiente
                <ChevronRight size={16} />
              </button>
              {currentStep >= 2 && (
                <button
                  type="button"
                  className="btn-success"
                  onClick={handleSkipToEnd}
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : 'Registrar Ahora'}
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className="btn-success"
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Registrar Siniestro'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// =====================================================
// PASO 1: DATOS DEL EVENTO
// =====================================================

interface Step1Props {
  formData: SiniestroFormData
  setFormData: React.Dispatch<React.SetStateAction<SiniestroFormData>>
  vehiculos: VehiculoSimple[]
  conductores: ConductorSimple[]
  onVehiculoChange: (id: string) => void
  errors: Record<string, string>
}

function Step1Evento({ formData, setFormData, vehiculos, conductores, onVehiculoChange, errors }: Step1Props) {
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [conductorSearch, setConductorSearch] = useState('')
  const [showVehiculoDropdown, setShowVehiculoDropdown] = useState(false)
  const [showConductorDropdown, setShowConductorDropdown] = useState(false)

  const selectedVehiculo = vehiculos.find(v => v.id === formData.vehiculo_id)
  const selectedConductor = conductores.find(c => c.id === formData.conductor_id)

  const filteredVehiculos = vehiculos.filter(v => {
    const searchTerm = vehiculoSearch.toLowerCase()
    return v.patente.toLowerCase().includes(searchTerm) ||
           v.marca.toLowerCase().includes(searchTerm) ||
           v.modelo.toLowerCase().includes(searchTerm)
  }).slice(0, 8)

  const filteredConductores = conductores.filter(c => {
    const searchTerm = conductorSearch.toLowerCase()
    return c.nombre_completo.toLowerCase().includes(searchTerm)
  }).slice(0, 8)

  return (
    <div className="wizard-step-content">
      <div className="form-row">
        <div className="form-group">
          <label>Patente del Vehículo</label>
          <div className="searchable-select">
            <input
              type="text"
              value={selectedVehiculo ? `${selectedVehiculo.patente} - ${selectedVehiculo.marca} ${selectedVehiculo.modelo}` : vehiculoSearch}
              onChange={(e) => {
                setVehiculoSearch(e.target.value)
                setShowVehiculoDropdown(true)
                if (formData.vehiculo_id) onVehiculoChange('')
              }}
              onFocus={() => setShowVehiculoDropdown(true)}
              onBlur={() => setTimeout(() => setShowVehiculoDropdown(false), 200)}
              placeholder="Buscar por patente..."
            />
            {showVehiculoDropdown && vehiculoSearch && filteredVehiculos.length > 0 && (
              <div className="searchable-dropdown">
                {filteredVehiculos.map(v => (
                  <div
                    key={v.id}
                    className="searchable-option"
                    onClick={() => {
                      onVehiculoChange(v.id)
                      setVehiculoSearch('')
                      setShowVehiculoDropdown(false)
                    }}
                  >
                    <strong>{v.patente}</strong> - {v.marca} {v.modelo}
                  </div>
                ))}
              </div>
            )}
            {selectedVehiculo && (
              <button
                type="button"
                className="clear-selection"
                onClick={() => {
                  onVehiculoChange('')
                  setVehiculoSearch('')
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="form-group">
          <label>Conductor</label>
          <div className="searchable-select">
            <input
              type="text"
              value={selectedConductor ? selectedConductor.nombre_completo : conductorSearch}
              onChange={(e) => {
                setConductorSearch(e.target.value)
                setShowConductorDropdown(true)
                if (formData.conductor_id) setFormData(prev => ({ ...prev, conductor_id: undefined }))
              }}
              onFocus={() => setShowConductorDropdown(true)}
              onBlur={() => setTimeout(() => setShowConductorDropdown(false), 200)}
              placeholder="Buscar conductor..."
            />
            {showConductorDropdown && conductorSearch && filteredConductores.length > 0 && (
              <div className="searchable-dropdown">
                {filteredConductores.map(c => (
                  <div
                    key={c.id}
                    className="searchable-option"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, conductor_id: c.id }))
                      setConductorSearch('')
                      setShowConductorDropdown(false)
                    }}
                  >
                    {c.nombre_completo}
                  </div>
                ))}
              </div>
            )}
            {selectedConductor && (
              <button
                type="button"
                className="clear-selection"
                onClick={() => {
                  setFormData(prev => ({ ...prev, conductor_id: undefined }))
                  setConductorSearch('')
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Conductor (texto libre)</label>
          <input
            type="text"
            value={formData.conductor_nombre || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, conductor_nombre: e.target.value }))}
            placeholder="Si no está en el sistema"
          />
        </div>
        <div className="form-group">
          <label>Fecha <span className="required">*</span></label>
          <input
            type="date"
            value={formData.fecha_siniestro}
            onChange={(e) => setFormData(prev => ({ ...prev, fecha_siniestro: e.target.value }))}
            className={errors.fecha_siniestro ? 'input-error' : ''}
          />
          {errors.fecha_siniestro && <span className="error-message">{errors.fecha_siniestro}</span>}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Hora</label>
          <input
            type="time"
            value={formData.hora_siniestro || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, hora_siniestro: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label>Ubicación</label>
          <input
            type="text"
            value={formData.ubicacion || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, ubicacion: e.target.value }))}
            placeholder="Dirección o referencia"
          />
        </div>
      </div>
    </div>
  )
}

// =====================================================
// PASO 2: CLASIFICACIÓN
// =====================================================

interface Step2Props {
  formData: SiniestroFormData
  setFormData: React.Dispatch<React.SetStateAction<SiniestroFormData>>
  categorias: SiniestroCategoria[]
  estados: SiniestroEstado[]
  errors: Record<string, string>
}

function Step2Clasificacion({ formData, setFormData, categorias, estados, errors }: Step2Props) {
  return (
    <div className="wizard-step-content">
      <div className="form-row">
        <div className="form-group">
          <label>Categoría <span className="required">*</span></label>
          <select
            value={formData.categoria_id}
            onChange={(e) => setFormData(prev => ({ ...prev, categoria_id: e.target.value }))}
            className={errors.categoria_id ? 'input-error' : ''}
          >
            <option value="">Seleccionar categoría</option>
            {categorias.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          {errors.categoria_id && <span className="error-message">{errors.categoria_id}</span>}
        </div>
        <div className="form-group">
          <label>Estado <span className="required">*</span></label>
          <select
            value={formData.estado_id}
            onChange={(e) => setFormData(prev => ({ ...prev, estado_id: e.target.value }))}
            className={errors.estado_id ? 'input-error' : ''}
          >
            <option value="">Seleccionar estado</option>
            {estados.map(e => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
          {errors.estado_id && <span className="error-message">{errors.estado_id}</span>}
        </div>
      </div>

      <div className="form-group">
        <label>Responsable</label>
        <div className="radio-group-cards">
          {[
            { value: 'tercero', label: 'Tercero', desc: 'El otro vehículo causó el siniestro' },
            { value: 'conductor', label: 'Conductor', desc: 'Nuestro conductor causó el siniestro' },
            { value: 'compartida', label: 'Compartida', desc: 'Responsabilidad de ambas partes' }
          ].map(r => (
            <label
              key={r.value}
              className={`radio-card ${formData.responsable === r.value ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="responsable"
                value={r.value}
                checked={formData.responsable === r.value}
                onChange={(e) => setFormData(prev => ({ ...prev, responsable: e.target.value as any }))}
              />
              <span className="radio-card-label">{r.label}</span>
              <span className="radio-card-desc">{r.desc}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="checkbox-option checkbox-lesionados">
          <input
            type="checkbox"
            checked={formData.hay_lesionados}
            onChange={(e) => setFormData(prev => ({ ...prev, hay_lesionados: e.target.checked }))}
          />
          <span>Hay lesionados</span>
        </label>
      </div>
    </div>
  )
}

// =====================================================
// PASO 3: DESCRIPCIÓN
// =====================================================

interface Step3Props {
  formData: SiniestroFormData
  setFormData: React.Dispatch<React.SetStateAction<SiniestroFormData>>
}

function Step3Descripcion({ formData, setFormData }: Step3Props) {
  return (
    <div className="wizard-step-content">
      <div className="form-group full-width">
        <label>Descripción de daños</label>
        <textarea
          value={formData.descripcion_danos || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, descripcion_danos: e.target.value }))}
          placeholder="Detalle los daños del vehículo: golpes, rayaduras, cristales rotos..."
          rows={4}
        />
      </div>

      <div className="form-group full-width">
        <label>Relato del siniestro</label>
        <textarea
          value={formData.relato || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, relato: e.target.value }))}
          placeholder="Describa cómo ocurrió el siniestro: circunstancias, lugar exacto, condiciones climáticas..."
          rows={6}
        />
      </div>
    </div>
  )
}

// =====================================================
// PASO 4: DATOS DEL TERCERO
// =====================================================

interface Step4Props {
  formData: SiniestroFormData
  setFormData: React.Dispatch<React.SetStateAction<SiniestroFormData>>
}

function Step4Tercero({ formData, setFormData }: Step4Props) {
  return (
    <div className="wizard-step-content">
      <p className="step-description">
        Complete estos datos si hubo un tercero involucrado en el siniestro.
      </p>

      <div className="form-row three-cols">
        <div className="form-group">
          <label>Nombre</label>
          <input
            type="text"
            value={formData.tercero_nombre || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, tercero_nombre: e.target.value }))}
            placeholder="Nombre completo"
          />
        </div>
        <div className="form-group">
          <label>DNI</label>
          <input
            type="text"
            value={formData.tercero_dni || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, tercero_dni: e.target.value }))}
            placeholder="Documento"
          />
        </div>
        <div className="form-group">
          <label>Teléfono</label>
          <input
            type="text"
            value={formData.tercero_telefono || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, tercero_telefono: e.target.value }))}
            placeholder="Contacto"
          />
        </div>
      </div>

      <div className="form-row three-cols">
        <div className="form-group">
          <label>Vehículo</label>
          <input
            type="text"
            value={formData.tercero_vehiculo || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, tercero_vehiculo: e.target.value }))}
            placeholder="Marca, modelo, patente"
          />
        </div>
        <div className="form-group">
          <label>Seguro</label>
          <input
            type="text"
            value={formData.tercero_seguro || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, tercero_seguro: e.target.value }))}
            placeholder="Compañía de seguros"
          />
        </div>
        <div className="form-group">
          <label>Póliza</label>
          <input
            type="text"
            value={formData.tercero_poliza || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, tercero_poliza: e.target.value }))}
            placeholder="Número de póliza"
          />
        </div>
      </div>
    </div>
  )
}
