// src/modules/leads/components/LeadWizard.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { AddressAutocomplete } from '../../../components/ui/AddressAutocomplete'
import { useSede } from '../../../contexts/SedeContext'
import type { LeadFormData } from '../../../types/leads.types'

interface CatalogoItem {
  id: string
  codigo: string
  descripcion: string
}

interface LeadWizardProps {
  formData: LeadFormData
  setFormData: React.Dispatch<React.SetStateAction<LeadFormData>>
  onSave: () => void
  onCancel: () => void
  saving?: boolean
  errors?: Record<string, string>
  categoriasLicencia?: CatalogoItem[]
  estadosLicencia?: CatalogoItem[]
  tiposLicencia?: CatalogoItem[]
}

const STEPS = [
  { id: 1, label: 'Personal' },
  { id: 2, label: 'Contacto' },
  { id: 3, label: 'Documentos' },
  { id: 4, label: 'Operativo' },
  { id: 5, label: 'Proceso' },
]

// Calcula la edad a partir de una fecha de nacimiento (formato YYYY-MM-DD)
function calcularEdad(fechaNac: string): number | undefined {
  if (!fechaNac) return undefined
  const hoy = new Date()
  const nac = new Date(fechaNac + 'T00:00:00')
  if (isNaN(nac.getTime())) return undefined
  let edad = hoy.getFullYear() - nac.getFullYear()
  const mesActual = hoy.getMonth()
  const mesNac = nac.getMonth()
  if (mesActual < mesNac || (mesActual === mesNac && hoy.getDate() < nac.getDate())) {
    edad--
  }
  return edad >= 0 ? edad : undefined
}

export function LeadWizard({ formData, setFormData, onSave, onCancel, saving = false, errors = {}, categoriasLicencia = [], estadosLicencia = [], tiposLicencia = [] }: LeadWizardProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const { sedes } = useSede()

  // Al abrir el wizard, si hay teléfono pero no WhatsApp, copiar el teléfono
  useEffect(() => {
    if (formData.phone && !formData.whatsapp_number) {
      setFormData(prev => ({ ...prev, whatsapp_number: prev.phone }))
    }
    // Auto-mapear licencia texto a categorías si hay licencia pero no categorías
    if (formData.licencia && (!formData.categorias_licencia || formData.categorias_licencia.length === 0) && categoriasLicencia.length > 0) {
      const partes = formData.licencia.split(/[.,\s]+/).map(p => p.trim().toUpperCase()).filter(Boolean)
      const matched: string[] = []
      for (const parte of partes) {
        const cat = categoriasLicencia.find(c => {
          const descUpper = c.descripcion.toUpperCase()
          return descUpper.includes(parte) || c.codigo?.toUpperCase() === parte
        })
        if (cat) matched.push(cat.descripcion)
      }
      if (matched.length > 0) {
        setFormData(prev => ({ ...prev, categorias_licencia: matched }))
      }
    }
    // Solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateField(field: keyof LeadFormData, value: any) {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  function handleNext() {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  function handlePrev() {
    if (currentStep > 1) setCurrentStep(currentStep - 1)
  }

  function goToStep(step: number) {
    if (step >= 1 && step <= STEPS.length) {
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
                <label>DNI <span className="required">*</span></label>
                <input
                  type="text"
                  className={errors.dni ? 'field-error' : ''}
                  value={formData.dni || ''}
                  onChange={e => updateField('dni', e.target.value)}
                  placeholder="Ej: 35123456"
                  maxLength={10}
                />
                {errors.dni && <span className="error-text">{errors.dni}</span>}
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>CUIT <span className="required">*</span></label>
                <input
                  type="text"
                  className={errors.cuit ? 'field-error' : ''}
                  value={formData.cuit || ''}
                  onChange={e => updateField('cuit', e.target.value)}
                  placeholder="Ej: 20351234569"
                  maxLength={13}
                />
                {errors.cuit && <span className="error-text">{errors.cuit}</span>}
              </div>
              <div className="lead-wizard-field">
                <label>Fecha de Nacimiento <span className="required">*</span></label>
                <input
                  type="date"
                  className={errors.fecha_de_nacimiento ? 'field-error' : ''}
                  value={formData.fecha_de_nacimiento || ''}
                  onChange={e => {
                    const fecha = e.target.value
                    updateField('fecha_de_nacimiento', fecha)
                    const edad = calcularEdad(fecha)
                    if (edad !== undefined) updateField('edad', edad)
                  }}
                />
                {errors.fecha_de_nacimiento && <span className="error-text">{errors.fecha_de_nacimiento}</span>}
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
                <label>Nacionalidad <span className="required">*</span></label>
                <select className={errors.nacionalidad ? 'field-error' : ''} value={formData.nacionalidad || ''} onChange={e => updateField('nacionalidad', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="ARGENTINA">ARGENTINA</option>
                  <option value="BOLIVIANA">BOLIVIANA</option>
                  <option value="PARAGUAYA">PARAGUAYA</option>
                  <option value="PERUANA">PERUANA</option>
                  <option value="URUGUAYA">URUGUAYA</option>
                  <option value="VENEZOLANA">VENEZOLANA</option>
                  <option value="CHILENA">CHILENA</option>
                  <option value="COLOMBIANA">COLOMBIANA</option>
                </select>
                {errors.nacionalidad && <span className="error-text">{errors.nacionalidad}</span>}
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Estado Civil <span className="required">*</span></label>
                <select className={errors.estado_civil ? 'field-error' : ''} value={formData.estado_civil || ''} onChange={e => updateField('estado_civil', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="CASADO">CASADO</option>
                  <option value="DIVORCIADO">DIVORCIADO</option>
                  <option value="EN CONCUBINATO">EN CONCUBINATO</option>
                  <option value="SOLTERO">SOLTERO</option>
                  <option value="VIUDO">VIUDO</option>
                </select>
                {errors.estado_civil && <span className="error-text">{errors.estado_civil}</span>}
              </div>
              <div className="lead-wizard-field">
                <label>Sede <span className="required">*</span></label>
                <select
                  className={errors.sede ? 'field-error' : ''}
                  value={formData.sede || ''}
                  onChange={e => updateField('sede', e.target.value)}
                >
                  <option value="">Seleccionar</option>
                  {sedes.map(s => (
                    <option key={s.id} value={s.nombre || ''}>{s.nombre}</option>
                  ))}
                </select>
                {errors.sede && <span className="error-text">{errors.sede}</span>}
              </div>
            </div>
          </>
        )}

        {/* Step 2: Contacto y Dirección */}
        {currentStep === 2 && (
          <>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Teléfono <span className="required">*</span></label>
                <input
                  type="text"
                  className={errors.phone ? 'field-error' : ''}
                  value={formData.phone || ''}
                  onChange={e => {
                    const val = e.target.value
                    updateField('phone', val)
                    // Auto-fill WhatsApp si está vacío o coincide con el teléfono anterior
                    if (!formData.whatsapp_number || formData.whatsapp_number === formData.phone) {
                      updateField('whatsapp_number', val)
                    }
                  }}
                  placeholder="Ej: 11-1234-5678"
                />
                {errors.phone && <span className="error-text">{errors.phone}</span>}
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
                <label>Email <span className="required">*</span></label>
                <input
                  type="email"
                  className={errors.email ? 'field-error' : ''}
                  value={formData.email || ''}
                  onChange={e => updateField('email', e.target.value)}
                  placeholder="correo@ejemplo.com"
                />
                {errors.email && <span className="error-text">{errors.email}</span>}
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
                <label>Dirección <span className="required">*</span></label>
                <AddressAutocomplete
                  value={formData.direccion || ''}
                  onChange={(address, lat, lng, zona) => {
                    updateField('direccion', address)
                    if (lat !== undefined) updateField('latitud', lat)
                    if (lng !== undefined) updateField('longitud', lng)
                    if (zona) updateField('zona', zona)
                  }}
                  placeholder="Buscar dirección..."
                />
                {errors.direccion && <span className="error-text">{errors.direccion}</span>}
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
            {/* Clasificación Domicilio y Estado Dirección ocultos */}
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
                  <option value="Cónyuge">Conyuge</option>
                  <option value="Hijo/a">Hijo/a</option>
                  <option value="Abuelo/a">Abuelo/a</option>
                  <option value="Amigo/a">Amigo/a</option>
                  <option value="Compadre">Compadre</option>
                  <option value="Comadre">Comadre</option>
                  <option value="Concubino/a">Concubino/a</option>
                  <option value="Conviviente">Conviviente</option>
                  <option value="Cuñado/a">Cuñado/a</option>
                  <option value="Ex Esposo/a">Ex Esposo/a</option>
                  <option value="Padrastro">Padrastro</option>
                  <option value="Madrastra">Madrastra</option>
                  <option value="Primo/a">Primo/a</option>
                  <option value="Vecino/a">Vecino/a</option>
                  <option value="Tío/a">Tio/a</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Verificación de contacto de emergencia</label>
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

        {/* Step 3: Documentación */}
        {currentStep === 3 && (
          <>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Nro. Licencia <span className="required">*</span></label>
                <input
                  type="text"
                  className={errors.numero_licencia ? 'field-error' : ''}
                  value={formData.numero_licencia || ''}
                  onChange={e => updateField('numero_licencia', e.target.value)}
                  placeholder="Número de licencia"
                />
                {errors.numero_licencia && <span className="error-text">{errors.numero_licencia}</span>}
              </div>
              <div className="lead-wizard-field">
                <label>Vencimiento Licencia <span className="required">*</span></label>
                <input
                  type="date"
                  className={errors.vencimiento_licencia ? 'field-error' : ''}
                  value={formData.vencimiento_licencia || ''}
                  onChange={e => updateField('vencimiento_licencia', e.target.value)}
                />
                {errors.vencimiento_licencia && <span className="error-text">{errors.vencimiento_licencia}</span>}
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field" style={{ flex: 1 }}>
                <label>Categorías <span className="required">*</span></label>
                <select
                  multiple
                  className={errors.categorias_licencia ? 'field-error' : ''}
                  value={formData.categorias_licencia || []}
                  onChange={e => {
                    const selected = Array.from(e.target.selectedOptions, opt => opt.value)
                    setFormData(prev => {
                      // Extraer códigos cortos de las descripciones (ej: "Licencia categoría A1.4" -> "A1.4")
                      const codigos = selected.map(desc => {
                        const match = desc.match(/categoría\s+(.+)/i)
                        return match ? match[1].trim() : desc
                      })
                      const licenciaText = codigos.join('.')
                      return { ...prev, categorias_licencia: selected, licencia: licenciaText, d1: licenciaText.includes('D1') ? 'Si' : 'No' }
                    })
                  }}
                  style={{ minHeight: '80px' }}
                >
                  {categoriasLicencia.map(cat => (
                    <option key={cat.id} value={cat.descripcion}>{cat.descripcion}</option>
                  ))}
                </select>
                <small style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Ctrl+Click para múltiples</small>
                {errors.categorias_licencia && <span className="error-text">{errors.categorias_licencia}</span>}
                {formData.licencia && (!formData.categorias_licencia || formData.categorias_licencia.length === 0) && (
                  <div style={{ marginTop: '6px', padding: '6px 10px', background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Valor anterior: <strong style={{ color: 'var(--text-primary)' }}>{formData.licencia}</strong>
                    <span style={{ display: 'block', fontSize: '11px', marginTop: '2px' }}>Selecciona las categorías correspondientes del listado</span>
                  </div>
                )}
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Estado Licencia</label>
                <select
                  value={formData.estado_licencia || ''}
                  onChange={e => updateField('estado_licencia', e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  {estadosLicencia.map(e => (
                    <option key={e.id} value={e.descripcion}>{e.descripcion}</option>
                  ))}
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Tipo Licencia</label>
                <select
                  value={formData.tipo_licencia || ''}
                  onChange={e => updateField('tipo_licencia', e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  {tiposLicencia.map(t => (
                    <option key={t.id} value={t.descripcion}>{t.descripcion}</option>
                  ))}
                </select>
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
                  <option value="Indiferente">Indiferente</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Disponibilidad</label>
                <input
                  type="date"
                  value={formData.disponibilidad || ''}
                  onChange={e => updateField('disponibilidad', e.target.value)}
                />
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Cuenta Cabify</label>
                <select value={formData.cuenta_cabify || ''} onChange={e => updateField('cuenta_cabify', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="En proceso">En proceso</option>
                  <option value="Activa">Activa</option>
                  <option value="No tiene">No tiene</option>
                  <option value="en revision">en revision</option>
                  <option value="Verificar Activa">Verificar Activa</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Monotributo</label>
                <select value={formData.monotributo || ''} onChange={e => updateField('monotributo', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Si">Si</option>
                  <option value="No">No</option>
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
            {/* Campo Proceso oculto */}
            <div className="lead-wizard-form-group">
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
                  <option value="Inicio conversación">Inicio conversación</option>
                  <option value="Apto - Hireflix">Apto - Hireflix</option>
                  <option value="No Apto - Hireflix">No Apto - Hireflix</option>
                  <option value="Ayuda - Hireflix">Ayuda - Hireflix</option>
                  <option value="Documentos enviados">Documentos enviados</option>
                  <option value="Auto del pueblo">Auto del pueblo</option>
                  <option value="No le interesa">No le interesa</option>
                  <option value="No cumple edad">No cumple edad</option>
                  <option value="Convocatoria Inducción">Convocatoria Inducción</option>
                  <option value="Descartado">Descartado</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Fuente del Lead</label>
                <select value={formData.fuente_de_lead || 'Intercom'} onChange={e => updateField('fuente_de_lead', e.target.value)}>
                  <option value="Intercom">Intercom</option>
                  <option value="Damaro">Damaro</option>
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
                <label>Guia</label>
                <input
                  type="text"
                  value={formData.entrevistador_asignado || ''}
                  onChange={e => updateField('entrevistador_asignado', e.target.value)}
                />
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Codigo Referido</label>
                <input
                  type="text"
                  value={formData.codigo_referido || ''}
                  onChange={e => updateField('codigo_referido', e.target.value)}
                />
              </div>
              {/* Fecha de Inicio oculto */}
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

        {/* Step 6: Emergencia eliminado - campos movidos a Contacto */}
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn-success"
            onClick={onSave}
            disabled={saving}
            style={{ minWidth: '100px' }}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          {currentStep < STEPS.length && (
            <button className="btn-primary" onClick={handleNext}>
              Siguiente <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}