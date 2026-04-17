// src/modules/leads/components/LeadWizard.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { AddressAutocomplete } from '../../../components/ui/AddressAutocomplete'
import type { LeadFormData } from '../../../types/leads.types'

interface LeadWizardProps {
  formData: LeadFormData
  setFormData: React.Dispatch<React.SetStateAction<LeadFormData>>
  onSave: () => void
  onCancel: () => void
  saving?: boolean
  errors?: Record<string, string>
}

const STEPS = [
  { id: 1, label: 'Personal' },
  { id: 2, label: 'Contacto' },
  { id: 3, label: 'Documentos' },
  { id: 4, label: 'Operativo' },
  { id: 5, label: 'Proceso' },
  { id: 6, label: 'Emergencia' },
]

export function LeadWizard({ formData, setFormData, onSave, onCancel, saving = false, errors = {} }: LeadWizardProps) {
  const [currentStep, setCurrentStep] = useState(1)

  function updateField(field: keyof LeadFormData, value: any) {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  function validateStep(step: number): boolean {
    if (step === 1) {
      return !!formData.nombre_completo?.trim()
    }
    return true
  }

  function handleNext() {
    if (currentStep < STEPS.length && validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1)
    }
  }

  function handlePrev() {
    if (currentStep > 1) setCurrentStep(prev => prev - 1)
  }

  function goToStep(step: number) {
    if (step <= currentStep || validateStep(currentStep)) {
      setCurrentStep(step)
    }
  }

  return (
    <div className="lead-wizard">
      {/* Progress */}
      <div className="lead-wizard-progress">
        {STEPS.map((step, idx) => (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              className={`lead-wizard-step ${currentStep === step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}`}
              onClick={() => goToStep(step.id)}
            >
              <div className="lead-wizard-step-number">
                {currentStep > step.id ? <Check size={14} /> : step.id}
              </div>
              <span className="lead-wizard-step-label">{step.label}</span>
            </div>
            {idx < STEPS.length - 1 && <div className="lead-wizard-step-separator" />}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="lead-wizard-content">
        {/* Step 1: Datos Personales */}
        {currentStep === 1 && (
          <>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Nombre Completo <span className="required">*</span></label>
                <input
                  type="text"
                  className={errors.nombre_completo ? 'field-error' : ''}
                  value={formData.nombre_completo || ''}
                  onChange={e => updateField('nombre_completo', e.target.value.toUpperCase())}
                  placeholder="Nombre y apellido"
                />
                {errors.nombre_completo && <span className="error-text">{errors.nombre_completo}</span>}
              </div>
              <div className="lead-wizard-field">
                <label>DNI</label>
                <input
                  type="text"
                  value={formData.dni || ''}
                  onChange={e => updateField('dni', e.target.value)}
                  placeholder="Ej: 35123456"
                  maxLength={10}
                />
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>CUIT</label>
                <input
                  type="text"
                  value={formData.cuit || ''}
                  onChange={e => updateField('cuit', e.target.value)}
                  placeholder="Ej: 20351234569"
                  maxLength={13}
                />
              </div>
              <div className="lead-wizard-field">
                <label>Fecha de Nacimiento</label>
                <input
                  type="date"
                  value={formData.fecha_de_nacimiento || ''}
                  onChange={e => updateField('fecha_de_nacimiento', e.target.value)}
                />
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Edad</label>
                <input
                  type="number"
                  value={formData.edad || ''}
                  onChange={e => updateField('edad', e.target.value ? parseInt(e.target.value) : undefined)}
                  min={18}
                  max={80}
                />
              </div>
              <div className="lead-wizard-field">
                <label>Nacionalidad</label>
                <input
                  type="text"
                  value={formData.nacionalidad || ''}
                  onChange={e => updateField('nacionalidad', e.target.value)}
                  placeholder="Ej: Argentina"
                />
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Estado Civil</label>
                <select value={formData.estado_civil || ''} onChange={e => updateField('estado_civil', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Soltero">Soltero</option>
                  <option value="Casado">Casado</option>
                  <option value="Divorciado">Divorciado</option>
                  <option value="Viudo">Viudo</option>
                  <option value="Union de hecho">Union de hecho</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Sede</label>
                <input
                  type="text"
                  value={formData.sede || ''}
                  onChange={e => updateField('sede', e.target.value)}
                  placeholder="Ej: CABA, GBA Sur"
                />
              </div>
            </div>
          </>
        )}

        {/* Step 2: Contacto y Dirección */}
        {currentStep === 2 && (
          <>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Teléfono</label>
                <input
                  type="text"
                  value={formData.phone || ''}
                  onChange={e => updateField('phone', e.target.value)}
                  placeholder="Ej: 11-1234-5678"
                />
              </div>
              <div className="lead-wizard-field">
                <label>WhatsApp</label>
                <input
                  type="text"
                  value={formData.whatsapp_number || ''}
                  onChange={e => updateField('whatsapp_number', e.target.value)}
                  placeholder="Ej: 5491112345678"
                />
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={e => updateField('email', e.target.value)}
                  placeholder="correo@ejemplo.com"
                />
              </div>
              <div className="lead-wizard-field">
                <label>Mail de Respaldo</label>
                <input
                  type="email"
                  value={formData.mail_de_respaldo || ''}
                  onChange={e => updateField('mail_de_respaldo', e.target.value)}
                  placeholder="correo alternativo"
                />
              </div>
            </div>
            <div className="lead-wizard-form-group full-width">
              <div className="lead-wizard-field">
                <label>Dirección</label>
                <AddressAutocomplete
                  value={formData.direccion || ''}
                  onChange={(address, lat, lng) => {
                    updateField('direccion', address)
                    if (lat !== undefined) updateField('latitud', lat)
                    if (lng !== undefined) updateField('longitud', lng)
                  }}
                  placeholder="Buscar dirección..."
                />
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Dirección Complementaria</label>
                <input
                  type="text"
                  value={formData.direccion_complementaria || ''}
                  onChange={e => updateField('direccion_complementaria', e.target.value)}
                  placeholder="Piso, depto, etc."
                />
              </div>
              <div className="lead-wizard-field">
                <label>Zona</label>
                <select value={formData.zona || ''} onChange={e => updateField('zona', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="CABA">CABA</option>
                  <option value="Norte">Norte</option>
                  <option value="Sur">Sur</option>
                  <option value="Oeste">Oeste</option>
                </select>
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Clasificación Domicilio</label>
                <select value={formData.clasificacion_domicilio || ''} onChange={e => updateField('clasificacion_domicilio', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Zona Buena">Zona Buena</option>
                  <option value="Zona Barrio">Zona Barrio</option>
                  <option value="Zona Peligrosa">Zona Peligrosa</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Estado Dirección</label>
                <select value={formData.estado_direccion || ''} onChange={e => updateField('estado_direccion', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Permitido">Permitido</option>
                  <option value="No permitido">No permitido</option>
                  <option value="Pendiente">Pendiente</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* Step 3: Documentación */}
        {currentStep === 3 && (
          <>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Licencia - Clases</label>
                <input
                  type="text"
                  value={formData.licencia || ''}
                  onChange={e => updateField('licencia', e.target.value)}
                  placeholder="Ej: A1.4.B2.D1"
                />
              </div>
              <div className="lead-wizard-field">
                <label>Vencimiento Licencia</label>
                <input
                  type="date"
                  value={formData.vencimiento_licencia || ''}
                  onChange={e => updateField('vencimiento_licencia', e.target.value)}
                />
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>RNR</label>
                <select value={formData.rnr || ''} onChange={e => updateField('rnr', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Si">Si</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Fecha RNR</label>
                <input
                  type="date"
                  value={formData.fecha_rnr || ''}
                  onChange={e => updateField('fecha_rnr', e.target.value)}
                />
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>DNI Archivo</label>
                <select value={formData.dni_archivo || ''} onChange={e => updateField('dni_archivo', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Si">Si</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>D1</label>
                <select value={formData.d1 || ''} onChange={e => updateField('d1', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Si">Si</option>
                  <option value="No">No</option>
                </select>
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Certificado Dirección</label>
                <select value={formData.certificado_direccion || ''} onChange={e => updateField('certificado_direccion', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Si">Si</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Experiencia Previa</label>
                <input
                  type="text"
                  value={formData.experiencia_previa || ''}
                  onChange={e => updateField('experiencia_previa', e.target.value)}
                  placeholder="Ej: 3 años Uber y Cabify"
                />
              </div>
            </div>
          </>
        )}

        {/* Step 4: Operativo */}
        {currentStep === 4 && (
          <>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Turno</label>
                <select value={formData.turno || ''} onChange={e => updateField('turno', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Diurno">Diurno</option>
                  <option value="Nocturno">Nocturno</option>
                  <option value="A cargo">A cargo</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Disponibilidad</label>
                <select value={formData.disponibilidad || ''} onChange={e => updateField('disponibilidad', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Inmediata">Inmediata</option>
                  <option value="1 Semana">1 Semana</option>
                  <option value="2 Semanas">2 Semanas</option>
                  <option value="1 Mes">1 Mes</option>
                </select>
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Cuenta Cabify</label>
                <select value={formData.cuenta_cabify || ''} onChange={e => updateField('cuenta_cabify', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Activa">Activa</option>
                  <option value="No tiene">No tiene</option>
                  <option value="Verificar Activa">Verificar Activa</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Monotributo</label>
                <select value={formData.monotributo || ''} onChange={e => updateField('monotributo', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Tiene">Tiene</option>
                  <option value="No tiene">No tiene</option>
                </select>
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Cochera</label>
                <select value={formData.cochera || ''} onChange={e => updateField('cochera', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Si">Si</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Rueda</label>
                <select value={formData.rueda || ''} onChange={e => updateField('rueda', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Si">Si</option>
                  <option value="No">No</option>
                </select>
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>CBU</label>
                <input
                  type="text"
                  value={formData.cbu || ''}
                  onChange={e => updateField('cbu', e.target.value)}
                  placeholder="22 dígitos"
                  maxLength={22}
                />
              </div>
              <div className="lead-wizard-field">
                <label>BCRA</label>
                <input
                  type="text"
                  value={formData.bcra || ''}
                  onChange={e => updateField('bcra', e.target.value)}
                  placeholder="Estado BCRA"
                />
              </div>
            </div>
          </>
        )}

        {/* Step 5: Proceso */}
        {currentStep === 5 && (
          <>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Proceso</label>
                <select value={formData.proceso || ''} onChange={e => updateField('proceso', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="En Proceso">En Proceso</option>
                  <option value="Ex Conductor">Ex Conductor</option>
                  <option value="Descartado">Descartado</option>
                  <option value="Convertido">Convertido</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Entrevista IA</label>
                <select value={formData.entrevista_ia || ''} onChange={e => updateField('entrevista_ia', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Apto">Apto</option>
                  <option value="No Apto">No Apto</option>
                  <option value="Pendiente">Pendiente</option>
                </select>
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Estado de Lead</label>
                <select value={formData.estado_de_lead || ''} onChange={e => updateField('estado_de_lead', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Nuevo">Nuevo</option>
                  <option value="Contactado">Contactado</option>
                  <option value="Entrevistado">Entrevistado</option>
                  <option value="Aprobado">Aprobado</option>
                  <option value="Rechazado">Rechazado</option>
                  <option value="Convertido">Convertido</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Fuente del Lead</label>
                <select value={formData.fuente_de_lead || ''} onChange={e => updateField('fuente_de_lead', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Facebook">Facebook</option>
                  <option value="Instagram">Instagram</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Referido">Referido</option>
                  <option value="Web">Web</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Agente Asignado</label>
                <input
                  type="text"
                  value={formData.agente_asignado || ''}
                  onChange={e => updateField('agente_asignado', e.target.value)}
                />
              </div>
              <div className="lead-wizard-field">
                <label>Entrevistador</label>
                <input
                  type="text"
                  value={formData.entrevistador_asignado || ''}
                  onChange={e => updateField('entrevistador_asignado', e.target.value)}
                />
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Código Referido</label>
                <input
                  type="text"
                  value={formData.codigo_referido || ''}
                  onChange={e => updateField('codigo_referido', e.target.value)}
                />
              </div>
              <div className="lead-wizard-field">
                <label>Fecha de Inicio</label>
                <input
                  type="date"
                  value={formData.fecha_de_inicio || ''}
                  onChange={e => updateField('fecha_de_inicio', e.target.value)}
                />
              </div>
            </div>
            <div className="lead-wizard-form-group full-width">
              <div className="lead-wizard-field">
                <label>Observaciones</label>
                <textarea
                  value={formData.observaciones || ''}
                  onChange={e => updateField('observaciones', e.target.value)}
                  placeholder="Notas sobre el candidato..."
                />
              </div>
            </div>
          </>
        )}

        {/* Step 6: Emergencia */}
        {currentStep === 6 && (
          <>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Nombre Contacto Emergencia</label>
                <input
                  type="text"
                  value={formData.datos_de_emergencia || ''}
                  onChange={e => updateField('datos_de_emergencia', e.target.value)}
                />
              </div>
              <div className="lead-wizard-field">
                <label>Teléfono Emergencia</label>
                <input
                  type="text"
                  value={formData.telefono_emergencia || ''}
                  onChange={e => updateField('telefono_emergencia', e.target.value)}
                />
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Parentesco</label>
                <select value={formData.parentesco_emergencia || ''} onChange={e => updateField('parentesco_emergencia', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Padre/Madre">Padre/Madre</option>
                  <option value="Hermano/a">Hermano/a</option>
                  <option value="Cónyuge">Cónyuge</option>
                  <option value="Hijo/a">Hijo/a</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Verificación Emergencia</label>
                <select
                  value={formData.verificacion_emergencia ? 'Si' : 'No'}
                  onChange={e => updateField('verificacion_emergencia', e.target.value === 'Si')}
                >
                  <option value="No">No verificado</option>
                  <option value="Si">Verificado</option>
                </select>
              </div>
            </div>
            <div className="lead-wizard-form-group full-width">
              <div className="lead-wizard-field">
                <label>Dirección Emergencia</label>
                <input
                  type="text"
                  value={formData.direccion_emergencia || ''}
                  onChange={e => updateField('direccion_emergencia', e.target.value)}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="lead-wizard-footer">
        <button
          className="btn-secondary"
          onClick={currentStep === 1 ? onCancel : handlePrev}
        >
          {currentStep === 1 ? 'Cancelar' : (
            <><ChevronLeft size={14} /> Anterior</>
          )}
        </button>
        {currentStep < STEPS.length ? (
          <button className="btn-primary" onClick={handleNext}>
            Siguiente <ChevronRight size={14} />
          </button>
        ) : (
          <button className="btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar Lead'}
          </button>
        )}
      </div>
    </div>
  )
}
