// src/modules/conductores/components/ConductorWizard.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { User, CreditCard, FileCheck, Phone, Shield, Check, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'

interface ConductorFormData {
  nombres: string
  apellidos: string
  numero_dni: string
  numero_cuit: string
  cbu: string
  monotributo: boolean
  numero_licencia: string
  licencia_categorias_ids: string[]
  licencia_vencimiento: string
  licencia_estado_id: string
  licencia_tipo_id: string
  telefono_contacto: string
  email: string
  direccion: string
  zona: string
  fecha_nacimiento: string
  estado_civil_id: string
  nacionalidad_id: string
  contacto_emergencia: string
  telefono_emergencia: string
  antecedentes_penales: boolean
  cochera_propia: boolean
  fecha_contratacion: string
  fecha_reincorpoaracion: string
  fecha_terminacion: string
  motivo_baja: string
  estado_id: string
  preferencia_turno: string
  url_documentacion: string
  numero_ibutton: string
}

interface ConductorWizardProps {
  formData: ConductorFormData
  setFormData: (data: ConductorFormData) => void
  estadosCiviles: any[]
  nacionalidades: any[]
  categoriasLicencia: any[]
  estadosConductor: any[]
  estadosLicencia: any[]
  tiposLicencia: any[]
  onCancel: () => void
  onSubmit: () => void
  saving: boolean
}

const STEPS = [
  { id: 1, title: 'Personal', icon: User },
  { id: 2, title: 'Fiscal', icon: CreditCard },
  { id: 3, title: 'Licencia', icon: FileCheck },
  { id: 4, title: 'Contacto', icon: Phone },
  { id: 5, title: 'Seguridad', icon: Shield },
]

export function ConductorWizard({
  formData,
  setFormData,
  estadosCiviles,
  nacionalidades,
  categoriasLicencia,
  estadosConductor,
  estadosLicencia,
  tiposLicencia,
  onCancel,
  onSubmit,
  saving,
}: ConductorWizardProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (step === 1) {
      if (!formData.nombres.trim()) newErrors.nombres = 'Requerido'
      if (!formData.apellidos.trim()) newErrors.apellidos = 'Requerido'
      if (!formData.numero_dni.trim()) newErrors.numero_dni = 'Requerido'
      if (!formData.numero_cuit.trim()) newErrors.numero_cuit = 'Requerido'
      if (!formData.fecha_nacimiento) newErrors.fecha_nacimiento = 'Requerido'
      if (!formData.nacionalidad_id) newErrors.nacionalidad_id = 'Requerido'
      if (!formData.estado_civil_id) newErrors.estado_civil_id = 'Requerido'
      if (!formData.zona.trim()) newErrors.zona = 'Requerido'
    }

    if (step === 3) {
      if (!formData.numero_licencia.trim()) newErrors.numero_licencia = 'Requerido'
      if (formData.licencia_categorias_ids.length === 0) newErrors.licencia_categorias_ids = 'Seleccione al menos una'
      if (!formData.licencia_vencimiento) newErrors.licencia_vencimiento = 'Requerido'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < 5) {
        setCurrentStep(currentStep + 1)
      } else {
        onSubmit()
      }
    }
  }

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const goToStep = (step: number) => {
    if (step < currentStep || validateStep(currentStep)) {
      setCurrentStep(step)
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="wizard-step-content">
            <div className="wizard-step-header">
              <User size={20} />
              <h3>Información Personal</h3>
            </div>
            <p className="step-description">Datos básicos del conductor. Todos los campos son obligatorios.</p>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nombres *</label>
                <input
                  type="text"
                  className={`form-input ${errors.nombres ? 'input-error' : ''}`}
                  value={formData.nombres}
                  onChange={(e) => setFormData({ ...formData, nombres: e.target.value })}
                  disabled={saving}
                />
                {errors.nombres && <span className="error-message">{errors.nombres}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Apellidos *</label>
                <input
                  type="text"
                  className={`form-input ${errors.apellidos ? 'input-error' : ''}`}
                  value={formData.apellidos}
                  onChange={(e) => setFormData({ ...formData, apellidos: e.target.value })}
                  disabled={saving}
                />
                {errors.apellidos && <span className="error-message">{errors.apellidos}</span>}
              </div>
            </div>

            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">DNI *</label>
                <input
                  type="text"
                  className={`form-input ${errors.numero_dni ? 'input-error' : ''}`}
                  value={formData.numero_dni}
                  onChange={(e) => setFormData({ ...formData, numero_dni: e.target.value })}
                  disabled={saving}
                />
                {errors.numero_dni && <span className="error-message">{errors.numero_dni}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">CUIL *</label>
                <input
                  type="text"
                  className={`form-input ${errors.numero_cuit ? 'input-error' : ''}`}
                  value={formData.numero_cuit}
                  onChange={(e) => setFormData({ ...formData, numero_cuit: e.target.value })}
                  disabled={saving}
                  placeholder="20-12345678-9"
                />
                {errors.numero_cuit && <span className="error-message">{errors.numero_cuit}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Fecha de Nacimiento *</label>
                <input
                  type="date"
                  className={`form-input ${errors.fecha_nacimiento ? 'input-error' : ''}`}
                  value={formData.fecha_nacimiento}
                  onChange={(e) => setFormData({ ...formData, fecha_nacimiento: e.target.value })}
                  disabled={saving}
                />
                {errors.fecha_nacimiento && <span className="error-message">{errors.fecha_nacimiento}</span>}
              </div>
            </div>

            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Nacionalidad *</label>
                <select
                  className={`form-input ${errors.nacionalidad_id ? 'input-error' : ''}`}
                  value={formData.nacionalidad_id}
                  onChange={(e) => setFormData({ ...formData, nacionalidad_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  {nacionalidades.map((n: any) => (
                    <option key={n.id} value={n.id}>{n.descripcion}</option>
                  ))}
                </select>
                {errors.nacionalidad_id && <span className="error-message">{errors.nacionalidad_id}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Estado Civil *</label>
                <select
                  className={`form-input ${errors.estado_civil_id ? 'input-error' : ''}`}
                  value={formData.estado_civil_id}
                  onChange={(e) => setFormData({ ...formData, estado_civil_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  {estadosCiviles.map((e: any) => (
                    <option key={e.id} value={e.id}>{e.descripcion}</option>
                  ))}
                </select>
                {errors.estado_civil_id && <span className="error-message">{errors.estado_civil_id}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Zona *</label>
                <input
                  type="text"
                  className={`form-input ${errors.zona ? 'input-error' : ''}`}
                  value={formData.zona}
                  onChange={(e) => setFormData({ ...formData, zona: e.target.value })}
                  disabled={saving}
                  placeholder="Ej: Zona Norte, CABA"
                />
                {errors.zona && <span className="error-message">{errors.zona}</span>}
              </div>
            </div>
          </div>
        )

      case 2:
        return (
          <div className="wizard-step-content">
            <div className="wizard-step-header">
              <CreditCard size={20} />
              <h3>Información Fiscal</h3>
              <span className="optional-badge">Opcional</span>
            </div>
            <p className="step-description">Datos bancarios y fiscales del conductor.</p>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">CBU</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="0150806001000158141270"
                  maxLength={22}
                  value={formData.cbu}
                  onChange={(e) => setFormData({ ...formData, cbu: e.target.value })}
                  disabled={saving}
                />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <label className="checkbox-container">
                  <input
                    type="checkbox"
                    checked={formData.monotributo}
                    onChange={(e) => setFormData({ ...formData, monotributo: e.target.checked })}
                    disabled={saving}
                  />
                  <span className="checkbox-label">Monotributo</span>
                </label>
              </div>
            </div>
          </div>
        )

      case 3:
        return (
          <div className="wizard-step-content">
            <div className="wizard-step-header">
              <FileCheck size={20} />
              <h3>Licencia de Conducir</h3>
            </div>
            <p className="step-description">Datos de la licencia. Número, categorías y vencimiento son obligatorios.</p>

            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Nro. Licencia *</label>
                <input
                  type="text"
                  className={`form-input ${errors.numero_licencia ? 'input-error' : ''}`}
                  value={formData.numero_licencia}
                  onChange={(e) => setFormData({ ...formData, numero_licencia: e.target.value })}
                  disabled={saving}
                />
                {errors.numero_licencia && <span className="error-message">{errors.numero_licencia}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Categorías *</label>
                <select
                  className={`form-input ${errors.licencia_categorias_ids ? 'input-error' : ''}`}
                  multiple
                  value={formData.licencia_categorias_ids}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, (option) => option.value)
                    setFormData({ ...formData, licencia_categorias_ids: selected })
                  }}
                  disabled={saving}
                  style={{ minHeight: '100px' }}
                >
                  {categoriasLicencia.map((cat: any) => (
                    <option key={cat.id} value={cat.id}>{cat.descripcion}</option>
                  ))}
                </select>
                {errors.licencia_categorias_ids && <span className="error-message">{errors.licencia_categorias_ids}</span>}
                <small className="input-hint">Ctrl+Click para múltiples</small>
              </div>
              <div className="form-group">
                <label className="form-label">Vencimiento *</label>
                <input
                  type="date"
                  className={`form-input ${errors.licencia_vencimiento ? 'input-error' : ''}`}
                  value={formData.licencia_vencimiento}
                  onChange={(e) => setFormData({ ...formData, licencia_vencimiento: e.target.value })}
                  disabled={saving}
                />
                {errors.licencia_vencimiento && <span className="error-message">{errors.licencia_vencimiento}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Estado Licencia</label>
                <select
                  className="form-input"
                  value={formData.licencia_estado_id}
                  onChange={(e) => setFormData({ ...formData, licencia_estado_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  {estadosLicencia.map((e: any) => (
                    <option key={e.id} value={e.id}>{e.descripcion}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo Licencia</label>
                <select
                  className="form-input"
                  value={formData.licencia_tipo_id}
                  onChange={(e) => setFormData({ ...formData, licencia_tipo_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  {tiposLicencia.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.descripcion}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )

      case 4:
        return (
          <div className="wizard-step-content">
            <div className="wizard-step-header">
              <Phone size={20} />
              <h3>Información de Contacto</h3>
              <span className="optional-badge">Opcional</span>
            </div>
            <p className="step-description">Datos de contacto del conductor y contacto de emergencia.</p>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input
                  type="tel"
                  className="form-input"
                  value={formData.telefono_contacto}
                  onChange={(e) => setFormData({ ...formData, telefono_contacto: e.target.value })}
                  disabled={saving}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-input"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Dirección</label>
              <input
                type="text"
                className="form-input"
                value={formData.direccion}
                onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                disabled={saving}
              />
            </div>

            <div className="section-divider">Contacto de Emergencia</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nombre Contacto</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.contacto_emergencia}
                  onChange={(e) => setFormData({ ...formData, contacto_emergencia: e.target.value })}
                  disabled={saving}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono Emergencia</label>
                <input
                  type="tel"
                  className="form-input"
                  value={formData.telefono_emergencia}
                  onChange={(e) => setFormData({ ...formData, telefono_emergencia: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>
          </div>
        )

      case 5:
        return (
          <div className="wizard-step-content">
            <div className="wizard-step-header">
              <Shield size={20} />
              <h3>Información de Seguridad</h3>
              <span className="optional-badge">Opcional</span>
            </div>
            <p className="step-description">Preferencias, antecedentes y fecha de incorporación.</p>

            <div className="form-row-3">
              <label className="checkbox-container">
                <input
                  type="checkbox"
                  checked={formData.antecedentes_penales}
                  onChange={(e) => setFormData({ ...formData, antecedentes_penales: e.target.checked })}
                  disabled={saving}
                />
                <span className="checkbox-label">Antecedentes Penales</span>
              </label>
              <label className="checkbox-container">
                <input
                  type="checkbox"
                  checked={formData.cochera_propia}
                  onChange={(e) => setFormData({ ...formData, cochera_propia: e.target.checked })}
                  disabled={saving}
                />
                <span className="checkbox-label">Cochera Propia</span>
              </label>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Preferencia de Turno</label>
                <select
                  className="form-input"
                  value={formData.preferencia_turno}
                  onChange={(e) => setFormData({ ...formData, preferencia_turno: e.target.value })}
                  disabled={saving}
                >
                  <option value="SIN_PREFERENCIA">Ambos</option>
                  <option value="DIURNO">Diurno</option>
                  <option value="NOCTURNO">Nocturno</option>
                  <option value="A_CARGO">A Cargo</option>
                </select>
              </div>
            </div>

            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Fecha de Incorporación</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.fecha_contratacion}
                  onChange={(e) => setFormData({ ...formData, fecha_contratacion: e.target.value })}
                  disabled={saving}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha Reincorporación</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.fecha_reincorpoaracion}
                  onChange={(e) => setFormData({ ...formData, fecha_reincorpoaracion: e.target.value })}
                  disabled={saving}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select
                  className="form-input"
                  value={formData.estado_id}
                  onChange={(e) => setFormData({ ...formData, estado_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  {estadosConductor.map((e: any) => (
                    <option key={e.id} value={e.id}>{e.descripcion}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="section-divider">Documentación e iButton</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Link de Documentación (Drive)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="url"
                    className="form-input"
                    value={formData.url_documentacion}
                    onChange={(e) => setFormData({ ...formData, url_documentacion: e.target.value })}
                    disabled={saving}
                    placeholder="https://drive.google.com/..."
                    style={{ flex: 1 }}
                  />
                  {formData.url_documentacion && (
                    <a
                      href={formData.url_documentacion}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px' }}
                    >
                      <ExternalLink size={16} />
                      Ver
                    </a>
                  )}
                </div>
                <small className="input-hint">Enlace de Google Drive con la documentación</small>
              </div>
              <div className="form-group">
                <label className="form-label">Número de iButton</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.numero_ibutton}
                  onChange={(e) => setFormData({ ...formData, numero_ibutton: e.target.value })}
                  disabled={saving}
                  placeholder="Ej: IB-001234"
                />
                <small className="input-hint">Asignar al entregar el iButton</small>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="conductor-wizard">
      {/* Progress Steps */}
      <div className="wizard-progress">
        {STEPS.map((step, index) => (
          <div key={step.id} className="wizard-step-container">
            <button
              className={`wizard-step ${currentStep === step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}`}
              onClick={() => goToStep(step.id)}
              type="button"
            >
              <span className="wizard-step-number">
                {currentStep > step.id ? <Check size={14} /> : step.id}
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

      {/* Footer */}
      <div className="wizard-footer">
        <button
          className="btn-secondary"
          onClick={onCancel}
          disabled={saving}
          type="button"
        >
          Cancelar
        </button>
        <div className="wizard-nav-buttons">
          {currentStep > 1 && (
            <button
              className="btn-secondary"
              onClick={handlePrev}
              disabled={saving}
              type="button"
            >
              <ChevronLeft size={16} />
              Anterior
            </button>
          )}
          {currentStep < 5 ? (
            <button
              className="btn-primary"
              onClick={handleNext}
              disabled={saving}
              type="button"
            >
              Siguiente
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              className="btn-success"
              onClick={onSubmit}
              disabled={saving}
              type="button"
            >
              {saving ? 'Creando...' : 'Crear Conductor'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
