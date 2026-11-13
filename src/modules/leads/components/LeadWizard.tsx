// src/modules/leads/components/LeadWizard.tsx
import { useState, useEffect, useRef } from 'react'
import { Check, ChevronLeft, ChevronRight, IdCard } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { AddressAutocomplete } from '../../../components/ui/AddressAutocomplete'
import { ConductorAutocomplete } from '../../../components/ui/ConductorAutocomplete'
import { useConductoresEmbajador } from '../../../hooks/useConductoresEmbajador'
import { useSede } from '../../../contexts/SedeContext'
import type { LeadFormData } from '../../../types/leads.types'
import { normalizarCelularAR, validarCelularAR } from '../../../utils/validacionesCampos'
import { LABELS_CUENTA_APP } from '../cuentasApps'
import { useAuth } from '../../../contexts/AuthContext'
import { ESTADO_DESCARTADO, pedirMotivoDescarte } from '../motivoDescarte'
import { estadoMonotributo, faltantesMonotributo } from '../monotributo'
import { alertasLicencia, CATEGORIAS_LICENCIA_LEAD, clasesDeLicencia, estadoLicencia, faltantesLicencia } from '../licenciaLead'
import { AlertasLicencia } from './AlertasLicencia'

/** Cabecera de cada nota de la bitácora: "[02/11/2026 16:40 · Maria Flores]" */
const RE_CABECERA = /^\[(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}[^\]]*)\]\s*/

/** Separa las observaciones guardadas en notas. El texto viejo sin cabecera queda como una nota. */
function parsearBitacora(texto: string): { cabecera: string | null; texto: string }[] {
  const t = (texto || '').trim()
  if (!t) return []
  return t.split(/\n(?=\[\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})/).map(bloque => {
    const m = bloque.match(RE_CABECERA)
    return m ? { cabecera: m[1], texto: bloque.slice(m[0].length).trim() } : { cabecera: null, texto: bloque.trim() }
  }).filter(n => n.texto)
}

/** Observaciones guardadas + la nota nueva con fecha, hora (Argentina) y usuario. */
function agregarNota(anteriores: string, nota: string, usuario: string | null | undefined): string {
  const limpia = nota.trim()
  if (!limpia) return anteriores
  const ahora = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '')
  const linea = `[${ahora} · ${usuario || 'Usuario'}] ${limpia}`
  return anteriores.trim() ? `${anteriores.trim()}\n${linea}` : linea
}

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
  // Catalogos compartidos con Conductores: las opciones salen de la misma tabla
  // que usa el form de conductor, para que lo elegido aca se vea identico alla.
  estadosCiviles?: CatalogoItem[]
  nacionalidades?: CatalogoItem[]
  /** Guías que ya existen en los leads (valores de entrevistador_asignado). */
  guias?: string[]
  /** Estados de lead que se pueden elegir (misma lista que el cambio de estado en la tabla). */
  estados?: string[]
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

export function LeadWizard({ formData, setFormData, onSave, onCancel, saving = false, errors = {}, estadosCiviles = [], nacionalidades = [], guias = [], estados = [] }: LeadWizardProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const { sedes } = useSede()
  const embajadores = useConductoresEmbajador()
  const { profile } = useAuth()
  // Observaciones como bitácora: lo guardado al abrir queda fijo y se agregan notas al final
  const obsOriginal = useRef<string>(formData.observaciones || '')
  const [notaNueva, setNotaNueva] = useState('')
  const bitacoraObs = parsearBitacora(obsOriginal.current)

  // Mapping zona → nombre de sede esperada.
  // Cuando el operador (o AddressAutocomplete) cambia la zona, auto-asignamos
  // la sede correspondiente para evitar leads en sede equivocada.
  const ZONA_TO_SEDE_NOMBRE: Record<string, string> = {
    'bariloche': 'Bariloche',
    'caba': 'Buenos Aires',
    'norte': 'Buenos Aires',
    'sur': 'Buenos Aires',
    'oeste': 'Buenos Aires',
    'gba': 'Buenos Aires',
  }

  // Auto-sincronización: cuando cambia formData.zona, ajustar sede/sede_id
  // si corresponde a una sede distinta a la actual del lead.
  // Solo dispara si el usuario cambió la zona con la que se abrió el lead. Antes se
  // salteaba "el primer render" con una marca, pero en StrictMode (dev) el efecto
  // corre dos veces al montar: la segunda ya pasaba y movía el lead de sede solo
  // por abrirlo (ej. leads de Pruebas con zona CABA quedaban en Buenos Aires).
  const zonaInicialRef = useRef(formData.zona)
  useEffect(() => {
    if (formData.zona === zonaInicialRef.current) return
    if (!formData.zona) return
    const zonaKey = formData.zona.toLowerCase().trim()
    const nombreSedeDeseada = ZONA_TO_SEDE_NOMBRE[zonaKey]
    if (!nombreSedeDeseada) return
    const sedeMatch = sedes.find(s => s.nombre?.toLowerCase() === nombreSedeDeseada.toLowerCase())
    if (!sedeMatch || formData.sede_id === sedeMatch.id) return
    setFormData(prev => ({
      ...prev,
      sede: sedeMatch.nombre,
      sede_id: sedeMatch.id,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.zona])

  function updateField(field: keyof LeadFormData, value: any) {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // ---------- Ya es / fue conductor (por DNI) ----------
  // Si el DNI cargado coincide con un conductor, se ofrece completar los datos
  // del lead con los del conductor. Solo se llenan los campos VACÍOS: lo que el
  // lead ya tiene (un teléfono o una dirección nueva) se respeta y después, al
  // reactivar o convertir, se fusiona en el conductor.
  const [conductorPorDni, setConductorPorDni] = useState<Record<string, any> | null>(null)
  const [completadoDesdeConductor, setCompletadoDesdeConductor] = useState<number | null>(null)
  useEffect(() => {
    const dni = (formData.dni || '').replace(/\D/g, '')
    setCompletadoDesdeConductor(null)
    if (dni.length < 7) { setConductorPorDni(null); return }
    let vigente = true
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('conductores')
        .select('*')
        .eq('numero_dni', dni)
        .limit(1)
      const c = ((data as Record<string, any>[] | null) || [])[0] ?? null
      if (c?.estado_id) {
        const { data: est } = await supabase
          .from('conductores_estados').select('codigo, descripcion').eq('id', c.estado_id).maybeSingle()
        c.conductores_estados = est ?? null
      }
      if (vigente) setConductorPorDni(c)
    }, 400)
    return () => { vigente = false; clearTimeout(t) }
  }, [formData.dni])

  function completarDesdeConductor() {
    const c = conductorPorDni
    if (!c) return
    const nacionalidad = nacionalidades.find(n => n.id === c.nacionalidad_id)?.descripcion
    const estadoCivil = estadosCiviles.find(e => e.id === c.estado_civil_id)?.descripcion
    const fechaNac = c.fecha_nacimiento ? String(c.fecha_nacimiento).slice(0, 10) : ''
    const candidatos: Partial<LeadFormData> = {
      nombre_completo: `${c.nombres || ''} ${c.apellidos || ''}`.trim().toUpperCase(),
      cuit: c.numero_cuit || '',
      fecha_de_nacimiento: fechaNac,
      edad: fechaNac ? calcularEdad(fechaNac) : undefined,
      nacionalidad: nacionalidad || '',
      estado_civil: estadoCivil || '',
      phone: c.telefono_contacto || '',
      telefono_secundario: c.telefono_secundario || '',
      email: c.email || '',
      direccion: c.direccion || '',
      zona: c.zona || '',
      latitud: typeof c.direccion_lat === 'number' ? c.direccion_lat : undefined,
      longitud: typeof c.direccion_lng === 'number' ? c.direccion_lng : undefined,
      licencia: c.numero_licencia ? 'Si' : '',
      numero_licencia: c.numero_licencia || '',
      vencimiento_licencia: c.licencia_vencimiento ? String(c.licencia_vencimiento).slice(0, 10) : '',
      cbu: c.cbu || '',
    }
    const next = { ...formData } as Record<string, unknown>
    let completados = 0
    for (const [k, v] of Object.entries(candidatos)) {
      if (k === 'latitud' || k === 'longitud') continue
      const actual = next[k]
      const vacio = actual === undefined || actual === null || actual === ''
      if (vacio && v !== undefined && v !== null && v !== '') {
        next[k] = v
        completados++
      }
    }
    // Si la dirección vino del conductor, también su punto en el mapa
    if (!formData.direccion && next.direccion && candidatos.latitud != null && candidatos.longitud != null) {
      next.latitud = candidatos.latitud
      next.longitud = candidatos.longitud
    }
    setFormData(next as unknown as LeadFormData)
    setCompletadoDesdeConductor(completados)
  }

  // Al salir del campo, el celular se lleva al formato +549 + area + numero.
  // Si no se puede interpretar se deja como esta y se marca el error.
  const [telefonosTocados, setTelefonosTocados] = useState<Set<'phone' | 'telefono_secundario'>>(new Set())
  function normalizarTelefonoAlSalir(field: 'phone' | 'telefono_secundario') {
    setTelefonosTocados(prev => new Set(prev).add(field))
    const normalizado = normalizarCelularAR(formData[field])
    if (!normalizado || normalizado === formData[field]) return
    setFormData(prev => ({ ...prev, [field]: normalizado }))
  }
  const errorTelefono = errors.phone || (telefonosTocados.has('phone') ? validarCelularAR(formData.phone) : null)
  const errorSecundario = errors.telefono_secundario || (telefonosTocados.has('telefono_secundario') && formData.telefono_secundario ? validarCelularAR(formData.telefono_secundario) : null)

  // Fechas de obtención de la licencia (ver licenciaLead.ts): B1, D1 o la general de Otros
  function campoFechaLicencia(
    campo: 'fecha_licencia_b1' | 'fecha_licencia_d1' | 'fecha_categoria_licencia',
    label: string,
    obligatorio: boolean,
  ) {
    return (
      <div className="lead-wizard-field">
        <label>{label} {obligatorio && <span className="required">*</span>}</label>
        <input
          type="date"
          className={errors[campo] ? 'field-error' : ''}
          value={formData[campo] || ''}
          onChange={e => updateField(campo, e.target.value)}
        />
        {errors[campo] && <span className="error-text">{errors[campo]}</span>}
      </div>
    )
  }

  function handleNext() {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  function handlePrev() {
    if (currentStep > 1) setCurrentStep(currentStep - 1)
  }

  // Estado de cada paso según sus campos obligatorios:
  //  verde = completo · amarillo = ya pasaste por ahí pero falta algo · gris = sin visitar
  const sinMonotributo = estadoMonotributo(formData.monotributo) === 'no'
  const tieneLicencia = estadoLicencia(formData.licencia) === 'si'
  const lleno = (v: unknown) => Array.isArray(v) ? v.length > 0 : typeof v === 'boolean' ? true : !!String(v ?? '').trim()
  const faltantesPorPaso: Record<number, string[]> = {
    1: [
      !lleno(formData.nombre_completo) && 'Nombre completo', !lleno(formData.dni) && 'DNI', ...faltantesMonotributo(formData),
      !lleno(formData.fecha_de_nacimiento) && 'Fecha de nacimiento', !lleno(formData.nacionalidad) && 'Nacionalidad',
      !lleno(formData.estado_civil) && 'Estado civil', !lleno(formData.sede || formData.sede_id) && 'Sede',
    ].filter(Boolean) as string[],
    2: [!lleno(formData.phone) && 'Teléfono', !lleno(formData.email) && 'Email Cabify', !lleno(formData.direccion) && 'Dirección'].filter(Boolean) as string[],
    3: [
      ...faltantesLicencia(formData), !lleno(formData.experiencia_previa) && 'Experiencia previa',
      !lleno(formData.url_folder) && 'Link de documentación',
    ].filter(Boolean) as string[],
    4: [!lleno(formData.cochera) && 'Cochera'].filter(Boolean) as string[],
    5: [
      formData.referido !== true && formData.referido !== false && 'Referido',
      formData.referido === true && !lleno(formData.embajador_id) && 'Embajador',
    ].filter(Boolean) as string[],
  }
  const [visitados, setVisitados] = useState<Set<number>>(() => new Set([1]))
  useEffect(() => { setVisitados(prev => prev.has(currentStep) ? prev : new Set(prev).add(currentStep)) }, [currentStep])

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
            {(() => {
              const faltan = faltantesPorPaso[step.id] || []
              const completo = faltan.length === 0
              const visto = visitados.has(step.id) || currentStep > step.id
              const estado = currentStep === step.id ? 'active' : completo ? 'completed' : visto ? 'incompleto' : ''
              return (
            <div
              className={`lead-wizard-step ${estado}`}
              onClick={() => goToStep(step.id)}
              title={completo ? 'Obligatorios completos' : `Falta: ${faltan.join(', ')}`}
            >
              <div className="lead-wizard-step-number">
                {estado === 'completed' ? <Check size={14} /> : estado === 'incompleto' ? '!' : step.id}
              </div>
              <span className="lead-wizard-step-label">{step.label}</span>
            </div>
              )
            })()}
            {idx < STEPS.length - 1 && <div className="lead-wizard-step-separator" />}
          </div>
        ))}
      </div>

      {/* Ya es / fue conductor (por DNI) */}
      {conductorPorDni && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            margin: '0 0 12px', padding: '10px 14px', borderRadius: 'var(--radius-md)',
            background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', fontSize: 13,
          }}
        >
          <IdCard size={16} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 200 }}>
            Este DNI {String(conductorPorDni.conductores_estados?.codigo || '').toUpperCase() === 'ACTIVO' ? 'ya es' : 'ya fue'} conductor:{' '}
            <b>{`${conductorPorDni.nombres || ''} ${conductorPorDni.apellidos || ''}`.trim()}</b>
            {conductorPorDni.conductores_estados?.descripcion ? ` (${conductorPorDni.conductores_estados.descripcion})` : ''}
            {completadoDesdeConductor !== null && (
              <span style={{ marginLeft: 6, color: '#166534' }}>
                · {completadoDesdeConductor > 0 ? `${completadoDesdeConductor} datos completados` : 'no había datos vacíos para completar'}
              </span>
            )}
          </span>
          <button type="button" className="btn-secondary btn-sm" onClick={completarDesdeConductor}>
            Completar datos desde conductor
          </button>
        </div>
      )}

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
                  onChange={e => updateField('dni', e.target.value.replace(/\D/g, ''))}
                  placeholder="Ej: 35123456"
                  maxLength={10}
                />
                {errors.dni && <span className="error-text">{errors.dni}</span>}
              </div>
            </div>
            {/* Monotributo define qué se pide: Si → DNI y CUIT; No → solo DNI y el motivo (ver ../monotributo.ts) */}
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Monotributo <span className="required">*</span></label>
                {/* En la base conviven "Sí" y "Si": los dos se muestran como Si, sin tocar el valor si no se cambia */}
                <select
                  className={errors.monotributo ? 'field-error' : ''}
                  value={formData.monotributo === 'Sí' ? 'Si' : formData.monotributo || ''}
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    monotributo: e.target.value,
                    ...(e.target.value === 'Si' ? { motivo_sin_monotributo: '' } : {}),
                  }))}
                >
                  <option value="">Seleccionar</option>
                  <option value="Si">Si</option>
                  <option value="No">No</option>
                </select>
                {errors.monotributo && <span className="error-text">{errors.monotributo}</span>}
              </div>
              {sinMonotributo && (
                <div className="lead-wizard-field">
                  <label>Motivo sin monotributo <span className="required">*</span></label>
                  <input
                    type="text"
                    className={errors.motivo_sin_monotributo ? 'field-error' : ''}
                    value={formData.motivo_sin_monotributo || ''}
                    onChange={e => updateField('motivo_sin_monotributo', e.target.value)}
                    placeholder="Por qué se le permite ingresar sin monotributo"
                  />
                  {errors.motivo_sin_monotributo && <span className="error-text">{errors.motivo_sin_monotributo}</span>}
                </div>
              )}
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                {/* Sin monotributo el número es CUIL; con monotributo (o sin elegir) es CUIT */}
                <label>{sinMonotributo ? 'CUIL' : 'CUIT'} {!sinMonotributo && <span className="required">*</span>}</label>
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
                  {nacionalidades.map(n => (
                    <option key={n.id} value={n.descripcion}>{n.descripcion}</option>
                  ))}
                </select>
                {errors.nacionalidad && <span className="error-text">{errors.nacionalidad}</span>}
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Estado Civil <span className="required">*</span></label>
                <select className={errors.estado_civil ? 'field-error' : ''} value={formData.estado_civil || ''} onChange={e => updateField('estado_civil', e.target.value)}>
                  <option value="">Seleccionar</option>
                  {estadosCiviles.map(ec => (
                    <option key={ec.id} value={ec.descripcion}>{ec.descripcion}</option>
                  ))}
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
                <label>Teléfono (WhatsApp) <span className="required">*</span></label>
                <input
                  type="text"
                  className={errorTelefono ? 'field-error' : ''}
                  value={formData.phone || ''}
                  onChange={e => updateField('phone', e.target.value)}
                  onBlur={() => normalizarTelefonoAlSalir('phone')}
                  placeholder="Ej: 11 1234-5678 o +54 9 11 1234-5678"
                />
                {errorTelefono && <span className="error-text">{errorTelefono}</span>}
              </div>
              <div className="lead-wizard-field">
                <label>Teléfono secundario (personal / otra app) <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(opcional)</span></label>
                <input
                  type="text"
                  className={errorSecundario ? 'field-error' : ''}
                  value={formData.telefono_secundario || ''}
                  onChange={e => updateField('telefono_secundario', e.target.value)}
                  onBlur={() => normalizarTelefonoAlSalir('telefono_secundario')}
                  placeholder="Su número personal u otro que use (ej. el de DiDi)"
                />
                {errorSecundario && <span className="error-text">{errorSecundario}</span>}
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Email app móvil (Cabify) <span className="required">*</span></label>
                <input
                  type="email"
                  className={errors.email ? 'field-error' : ''}
                  value={formData.email || ''}
                  onChange={e => updateField('email', e.target.value)}
                  placeholder="El mismo con el que entra a Cabify"
                />
                {errors.email && <span className="error-text">{errors.email}</span>}
              </div>
              <div className="lead-wizard-field">
                <label>Mail personal / respaldo <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(opcional)</span></label>
                <input
                  type="email"
                  value={formData.mail_de_respaldo || ''}
                  onChange={e => updateField('mail_de_respaldo', e.target.value)}
                  placeholder="Otro correo que use"
                />
              </div>
            </div>
            <div className="lead-wizard-form-group full-width">
              <div className="lead-wizard-field">
                <label>Dirección <span className="required">*</span></label>
                <AddressAutocomplete
                  value={formData.direccion || ''}
                  lat={formData.latitud ?? null}
                  lng={formData.longitud ?? null}
                  onChange={(address, lat, lng, zona) => {
                    updateField('direccion', address)
                    // Sin coordenadas se vacían: no arrastrar el punto de la dirección anterior
                    updateField('latitud', lat)
                    updateField('longitud', lng)
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
            <AlertasLicencia mensajes={alertasLicencia(clasesDeLicencia(formData.categorias_licencia || [], formData.categoria_licencia, formData.categoria_licencia_otra))} />
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>¿Tiene licencia? <span className="required">*</span></label>
                <select
                  className={errors.licencia ? 'field-error' : ''}
                  value={formData.licencia || ''}
                  onChange={e => updateField('licencia', e.target.value)}
                >
                  <option value="">Seleccionar</option>
                  <option value="Si">Si</option>
                  <option value="No">No</option>
                </select>
                {errors.licencia && <span className="error-text">{errors.licencia}</span>}
              </div>
              <div className="lead-wizard-field" />
            </div>
            {tieneLicencia && (
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
                  <div className="lead-wizard-field">
                    <label>Categoría <span className="required">*</span></label>
                    <select
                      className={errors.categoria_licencia ? 'field-error' : ''}
                      value={formData.categoria_licencia || ''}
                      onChange={e => updateField('categoria_licencia', e.target.value)}
                    >
                      <option value="">Seleccionar</option>
                      {CATEGORIAS_LICENCIA_LEAD.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    {errors.categoria_licencia && <span className="error-text">{errors.categoria_licencia}</span>}
                  </div>
                  {formData.categoria_licencia === 'B1' && campoFechaLicencia('fecha_licencia_b1', 'Fecha de obtención B1', true)}
                  {formData.categoria_licencia === 'D1' && campoFechaLicencia('fecha_licencia_d1', 'Fecha de obtención D1', true)}
                  {formData.categoria_licencia === 'Otros' && campoFechaLicencia('fecha_categoria_licencia', 'Fecha de obtención de la categoría', true)}
                  {!formData.categoria_licencia && <div className="lead-wizard-field" />}
                </div>
                {formData.categoria_licencia === 'Otros' && (
                  <div className="lead-wizard-form-group full-width">
                    <div className="lead-wizard-field">
                      <label>Detalle de la licencia <span className="required">*</span></label>
                      <input
                        type="text"
                        className={errors.categoria_licencia_otra ? 'field-error' : ''}
                        value={formData.categoria_licencia_otra || ''}
                        onChange={e => updateField('categoria_licencia_otra', e.target.value)}
                        placeholder="Ej: D3, B2"
                      />
                      {errors.categoria_licencia_otra && <span className="error-text">{errors.categoria_licencia_otra}</span>}
                    </div>
                  </div>
                )}
              </>
            )}
            {(formData.categorias_licencia?.length ?? 0) > 0 && (
              <div className="lead-wizard-form-group full-width">
                <div style={{ padding: '6px 10px', background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Categorías cargadas antes (histórico): <strong style={{ color: 'var(--text-primary)' }}>{formData.categorias_licencia?.join(', ')}</strong>
                </div>
              </div>
            )}
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
                <label>Certificado Dirección</label>
                <select value={formData.certificado_direccion || ''} onChange={e => updateField('certificado_direccion', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="Si">Si</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Experiencia Previa <span className="required">*</span></label>
                <input
                  type="text"
                  className={errors.experiencia_previa ? 'field-error' : ''}
                  value={formData.experiencia_previa || ''}
                  onChange={e => updateField('experiencia_previa', e.target.value)}
                  placeholder="Ej: 3 años Uber y Cabify"
                />
                {errors.experiencia_previa && <span className="error-text">{errors.experiencia_previa}</span>}
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field" style={{ flex: 1 }}>
                <label>Link de Documentación (Drive) <span className="required">*</span></label>
                <input
                  type="url"
                  className={errors.url_folder ? 'field-error' : ''}
                  value={formData.url_folder || ''}
                  onChange={e => updateField('url_folder', e.target.value)}
                  placeholder="https://drive.google.com/..."
                />
                {errors.url_folder && <span className="error-text">{errors.url_folder}</span>}
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
                  <option value="A Cargo">A Cargo</option>
                  <option value="Sin Pref.">Sin Pref.</option>
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Cuenta Cabify</label>
                <select value={formData.cuenta_cabify || ''} onChange={e => updateField('cuenta_cabify', e.target.value)}>
                  <option value="">Seleccionar</option>
                  {/* Valor anterior al cambio de estados: se conserva como opción para no perderlo */}
                  {formData.cuenta_cabify && !LABELS_CUENTA_APP.includes(formData.cuenta_cabify) && (
                    <option value={formData.cuenta_cabify}>{formData.cuenta_cabify}</option>
                  )}
                  {LABELS_CUENTA_APP.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Cuenta DiDi</label>
                <select value={formData.cuenta_didi || ''} onChange={e => updateField('cuenta_didi', e.target.value)}>
                  <option value="">Seleccionar</option>
                  {formData.cuenta_didi && !LABELS_CUENTA_APP.includes(formData.cuenta_didi) && (
                    <option value={formData.cuenta_didi}>{formData.cuenta_didi}</option>
                  )}
                  {LABELS_CUENTA_APP.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
            <div className="lead-wizard-form-group">
              <div className="lead-wizard-field">
                <label>Cochera <span className="required">*</span></label>
                <select
                  className={errors.cochera ? 'field-error' : ''}
                  value={formData.cochera || ''}
                  onChange={e => updateField('cochera', e.target.value)}
                >
                  <option value="">Seleccionar</option>
                  <option value="Si">Si</option>
                  <option value="No">No</option>
                </select>
                {errors.cochera && <span className="error-text">{errors.cochera}</span>}
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
                <label>Estado de Lead</label>
                <select
                  value={formData.estado_de_lead || ''}
                  onChange={async e => {
                    const v = e.target.value
                    // Descartado: motivo obligatorio; si se cancela, el estado no cambia
                    if (v === ESTADO_DESCARTADO && formData.estado_de_lead !== ESTADO_DESCARTADO) {
                      const motivo = await pedirMotivoDescarte(formData.nombre_completo)
                      if (!motivo) return
                      setFormData(prev => ({
                        ...prev,
                        estado_de_lead: v,
                        causal_de_cierre: motivo,
                        observaciones: agregarNota(prev.observaciones || '', `Descartado: ${motivo}`, profile?.full_name),
                      }))
                      return
                    }
                    updateField('estado_de_lead', v)
                  }}
                >
                  <option value="">Seleccionar</option>
                  {/* Si el lead tiene un estado que ya no se ofrece (histórico), se conserva como opción */}
                  {formData.estado_de_lead && !estados.includes(formData.estado_de_lead) && (
                    <option value={formData.estado_de_lead}>{formData.estado_de_lead}</option>
                  )}
                  {estados.map(e => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Fuente del Lead</label>
                <select value={formData.fuente_de_lead || 'Intercom'} onChange={e => updateField('fuente_de_lead', e.target.value)}>
                  <option value="Intercom">Intercom</option>
                  <option value="Sellium">Sellium</option>
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
                <label>Capitán</label>
                <select
                  value={formData.entrevistador_asignado || ''}
                  onChange={e => updateField('entrevistador_asignado', e.target.value)}
                >
                  <option value="">Seleccionar</option>
                  {/* Si el lead tiene un guía que no está en la lista, se conserva como opción */}
                  {formData.entrevistador_asignado &&
                    !guias.some(g => g.toLowerCase() === (formData.entrevistador_asignado || '').trim().toLowerCase()) && (
                      <option value={formData.entrevistador_asignado}>{formData.entrevistador_asignado}</option>
                    )}
                  {guias.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div className="lead-wizard-field">
                <label>Referido <span className="required">*</span> <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(para pasar a conductor)</span></label>
                <select
                  value={formData.referido === true ? 'Si' : formData.referido === false ? 'No' : ''}
                  onChange={e => {
                    const v = e.target.value
                    const referido = v === 'Si' ? true : v === 'No' ? false : null
                    // Sin referido no hay embajador
                    setFormData(prev => ({
                      ...prev,
                      referido,
                      embajador_id: referido ? prev.embajador_id : '',
                    }))
                  }}
                >
                  <option value="">Seleccionar</option>
                  <option value="Si">Si</option>
                  <option value="No">No</option>
                </select>
              </div>
            </div>
            {/* Embajador: solo cuando es referido */}
            {formData.referido === true && (
            <div className="lead-wizard-form-group full-width">
              <div className="lead-wizard-field">
                <label>
                  Embajador {formData.referido === true && <span className="required">*</span>}
                </label>
                <ConductorAutocomplete
                  value={formData.embajador_id || ''}
                  onChange={v => updateField('embajador_id', v)}
                  options={embajadores.opciones}
                  placeholder={
                    formData.referido !== true
                      ? 'Solo si es referido'
                      : embajadores.loading ? 'Cargando conductores...' : 'Escribí nombre o DNI...'
                  }
                  disabled={formData.referido !== true}
                  hasError={!!errors.embajador_id}
                />
                {errors.embajador_id && <span className="error-text">{errors.embajador_id}</span>}
              </div>
              {/* Codigo Referido (texto libre) reemplazado por Referido / Embajador */}
              {/* Fecha de Inicio oculto */}
            </div>
            )}
            {/* Entrevista IA: se quitó del formulario (2026-11-02, ya no se usa). El dato queda en la base. */}
            <div className="lead-wizard-form-group full-width">
              <div className="lead-wizard-field">
                <label>Observaciones</label>
                {/* Bitácora: las notas anteriores no se editan; cada nota nueva se guarda
                    al final con fecha, hora y usuario. */}
                {bitacoraObs.length > 0 && (
                  <ul className="lead-obs-bitacora">
                    {[...bitacoraObs].reverse().map((n, i) => (
                      <li key={i}>
                        {n.cabecera ? <span className="lead-obs-cab">{n.cabecera}</span> : <span className="lead-obs-cab">Nota anterior</span>}
                        <span className="lead-obs-texto">{n.texto}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <textarea
                  value={notaNueva}
                  onChange={e => {
                    const v = e.target.value
                    setNotaNueva(v)
                    updateField('observaciones', agregarNota(obsOriginal.current, v, profile?.full_name))
                  }}
                  placeholder={bitacoraObs.length ? 'Agregar una nota nueva…' : 'Notas sobre el candidato...'}
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
            className={currentStep < STEPS.length ? 'lead-wizard-guardar' : 'btn-primary'}
            onClick={onSave}
            disabled={saving}
            title="Guardar los cambios sin pasar al siguiente paso"
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