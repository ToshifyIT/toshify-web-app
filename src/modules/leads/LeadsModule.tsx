// src/modules/leads/LeadsModule.tsx
import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Eye, Edit2, Trash2, Users, UserPlus, Clock, RefreshCw, MessageCircle,
  CheckCircle, AlertTriangle, X, Download, Upload, MapPin, ExternalLink, FolderOpen, Video, Car,
} from 'lucide-react'
import { GoogleMap, Marker, Polygon } from '@react-google-maps/api'
import { ActionsMenu } from '../../components/ui/ActionsMenu'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useAuth } from '../../contexts/AuthContext'
import { useSede } from '../../contexts/SedeContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import type { Lead, LeadFormData } from '../../types/leads.types'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { ExcelColumnFilter } from '../../components/ui/DataTable/ExcelColumnFilter'
import './LeadsModule.css'
import { LeadWizard } from './components/LeadWizard'
import { inferZona, inferZonaFromCoords } from '../../utils/zonaUtils'
import { createLeadDriveFolder } from '../../services/driveService'
import { GOOGLE_MAPS_SCRIPT_URL } from '../../lib/googleMaps'

// =====================================================
// GOOGLE MAPS GEOCODING
// =====================================================

// Google Maps se carga via loadGoogleMapsAPI() — usa la URL canónica de
// src/lib/googleMaps.ts para no chocar con el useJsApiLoader de otros módulos.

const detailMapStyle = {
  width: '100%',
  height: '220px',
  borderRadius: '8px',
}

function loadGoogleMapsAPI(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Con loading=async, google.maps.Map NO está disponible inmediatamente
    // después del onload del script — hay que importar las libs explícitamente
    // vía google.maps.importLibrary(...). Esta función espera a que estén listas.
    const ensureMapLib = async () => {
      const g = (window as any).google
      // Path síncrono: la clase Map ya está disponible (loader viejo, o lib ya importada)
      if (g?.maps?.Map) {
        resolve()
        return
      }
      // Path async (URL con loading=async): importar las libs que usa el módulo
      if (g?.maps?.importLibrary) {
        try {
          await Promise.all([
            g.maps.importLibrary('maps'),
            g.maps.importLibrary('places'),
            g.maps.importLibrary('geocoding'),
          ])
          resolve()
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
        return
      }
      // El script aún cargando — reintentar en 50ms
      setTimeout(ensureMapLib, 50)
    }

    if ((window as any).google?.maps) {
      ensureMapLib()
      return
    }
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]')
    if (existingScript) {
      existingScript.addEventListener('load', () => ensureMapLib())
      return
    }
    const script = document.createElement('script')
    script.src = GOOGLE_MAPS_SCRIPT_URL
    script.async = true
    script.onload = () => ensureMapLib()
    script.onerror = () => reject(new Error('Error cargando Google Maps'))
    document.head.appendChild(script)
  })
}

function geocodificarDireccion(direccion: string): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    const geocoder = new (window as any).google.maps.Geocoder()
    geocoder.geocode(
      { address: direccion, region: 'ar' },
      (results: any, status: string) => {
        if (status === 'OK' && results && results[0]) {
          const location = results[0].geometry.location
          resolve({ lat: location.lat(), lng: location.lng() })
        } else {
          resolve(null)
        }
      }
    )
  })
}

// =====================================================
// ZONA PELIGROSA – Ray casting algorithm
// =====================================================

interface ZonaRestringida {
  id: string
  nombre: string
  poligono: { lat: number; lng: number }[]
}

function isPointInPolygon(point: { lat: number; lng: number }, polygon: { lat: number; lng: number }[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng
    const xj = polygon[j].lat, yj = polygon[j].lng
    const intersect = ((yi > point.lng) !== (yj > point.lng)) &&
      (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

// =====================================================
// HELPERS
// =====================================================

/** Normaliza el valor de turno a Diurno/Nocturno/Indiferente o '-' */
function normalizarTurno(turno: string | null | undefined): string {
  const t = (turno || '').toLowerCase().trim()
  if (!t) return '-'
  if (t.includes('diurno') || t === 'dia' || t === 'day') return 'Diurno'
  if (t.includes('nocturno') || t.includes('noche') || t === 'night') return 'Nocturno'
  if (t.includes('indiferente') || t.includes('any') || t.includes('ambos') || t.includes('cualquier')) return 'Indiferente'
  return turno || '-'
}

/**
 * Normaliza un número de teléfono argentino al formato +549XXXXXXXXXX (13 dígitos total).
 * Formato final: +54 9 [código área sin 0] [número sin 15]
 * Ejemplos:
 *   02944140422   -> +5492944140422  (0 removido)
 *   02944-15-140422 -> +5492944140422 (0 y 15 removidos)
 *   1155551234    -> +5491155551234
 *   +54 9 11 5555 1234 -> +5491155551234
 */
function formatPhoneAR(raw: unknown): string | null {
  if (raw == null) return null
  let digits = String(raw).replace(/[^\d]/g, '')
  if (!digits || digits.length < 6) return String(raw).trim() || null

  // Si empieza con 54, quitarlo para normalizar
  if (digits.startsWith('54')) {
    digits = digits.slice(2)
  }

  // Quitar 9 del inicio (marcador de celular en formato internacional)
  if (digits.startsWith('9') && digits.length >= 11) {
    digits = digits.slice(1)
  }

  // Quitar 0 del código de área (011, 0351, 02944, etc.)
  if (digits.startsWith('0')) {
    digits = digits.slice(1)
  }

  // Detectar y quitar el 15 intercalado (código de área + 15 + número)
  // Códigos de área de 2 dígitos: 11
  // Códigos de área de 3 dígitos: 2xx, 3xx (ej: 351, 261, 299)
  // Códigos de área de 4 dígitos: 2xxx, 3xxx (ej: 2944, 3541)
  // Después del código de área, si hay un 15, se quita
  if (digits.length >= 12) {
    // Probar con código de área de 4 dígitos (ej: 2944-15-XXXXXX)
    if (/^[23]\d{3}15\d+/.test(digits)) {
      digits = digits.slice(0, 4) + digits.slice(6)
    }
    // Probar con código de área de 3 dígitos (ej: 351-15-XXXXXXX)
    else if (/^[23]\d{2}15\d+/.test(digits)) {
      digits = digits.slice(0, 3) + digits.slice(5)
    }
    // Probar con código de área de 2 dígitos (ej: 11-15-XXXXXXXX)
    else if (/^11\s*15\d+/.test(digits)) {
      digits = '11' + digits.slice(4)
    }
  }

  // El número nacional debe tener 10 dígitos (código área + número)
  // Si tiene más, puede ser que el 15 no se haya detectado, truncar no es seguro
  // Si tiene menos de 10, dejarlo tal cual

  return `+549${digits}`
}

function leadToFormData(lead: Lead): LeadFormData {
  return {
    nombre_completo: lead.nombre_completo || '',
    primer_nombre: lead.primer_nombre || '',
    apellido: lead.apellido || '',
    email: lead.email || '',
    phone: lead.phone || '',
    whatsapp_number: lead.whatsapp_number || '',
    dni: lead.dni || '',
    cuit: lead.cuit || '',
    edad: lead.edad ?? undefined,
    fecha_de_nacimiento: lead.fecha_de_nacimiento || '',
    estado_civil: lead.estado_civil || '',
    nacionalidad: lead.nacionalidad || '',
    proceso: lead.proceso || '',
    entrevista_ia: lead.entrevista_ia || '',
    induccion: lead.induccion || '',
    disponibilidad: lead.disponibilidad || '',
    estado_de_lead: lead.estado_de_lead || '',
    direccion: lead.direccion || '',
    direccion_complementaria: lead.direccion_complementaria || '',
    zona: lead.zona || '',
    sede: lead.sede || '',
    sede_id: lead.sede_id || '',
    latitud: lead.latitud ?? undefined,
    longitud: lead.longitud ?? undefined,
    estado_direccion: lead.estado_direccion || '',
    clasificacion_domicilio: lead.clasificacion_domicilio || '',
    licencia: lead.licencia || '',
    vencimiento_licencia: lead.vencimiento_licencia || '',
    numero_licencia: lead.numero_licencia || '',
    categorias_licencia: lead.categorias_licencia || [],
    estado_licencia: lead.estado_licencia || '',
    tipo_licencia: lead.tipo_licencia || '',
    rnr: lead.rnr || '',
    fecha_rnr: lead.fecha_rnr || '',
    dni_archivo: lead.dni_archivo || '',
    d1: lead.d1 || '',
    certificado_direccion: lead.certificado_direccion || '',
    turno: lead.turno || '',
    cuenta_cabify: lead.cuenta_cabify || '',
    cochera: lead.cochera || '',
    rueda: lead.rueda || '',
    monotributo: lead.monotributo || '',
    bcra: lead.bcra || '',
    experiencia_previa: lead.experiencia_previa || '',
    cbu: lead.cbu || '',
    fecha_de_inicio: lead.fecha_de_inicio || '',
    mail_de_respaldo: lead.mail_de_respaldo || '',
    agente_asignado: lead.agente_asignado || '',
    entrevistador_asignado: lead.entrevistador_asignado || '',
    datos_de_emergencia: lead.datos_de_emergencia || '',
    telefono_emergencia: lead.telefono_emergencia || '',
    parentesco_emergencia: lead.parentesco_emergencia || '',
    direccion_emergencia: lead.direccion_emergencia || '',
    verificacion_emergencia: lead.verificacion_emergencia ?? false,
    observaciones: lead.observaciones || '',
    fuente_de_lead: lead.fuente_de_lead || '',
    codigo_referido: lead.codigo_referido || '',
  }
}

// Las keys de LeadFormData ya coinciden con las columnas de la tabla.
// Esta función normaliza valores vacíos a null para evitar guardar strings
// vacíos en la DB.
function formDataToDbFields(fd: LeadFormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  Object.entries(fd).forEach(([k, v]) => {
    if (v === '' || v === undefined) {
      out[k] = null
    } else if (Array.isArray(v) && v.length === 0) {
      out[k] = null
    } else {
      out[k] = v
    }
  })
  return out
}

const emptyFormData: LeadFormData = {
  nombre_completo: '',
  fuente_de_lead: 'Intercom',
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-'
  try {
    const [year, month, day] = dateStr.split('T')[0].split('-')
    return `${day}/${month}/${year}`
  } catch { return '-' }
}

function getProcesoClass(proceso: string | undefined | null): string {
  if (!proceso) return 'lead-estado-pendiente'
  const p = proceso.toLowerCase()
  if (p.includes('ex conductor')) return 'lead-estado-ex-conductor'
  if (p.includes('descartado')) return 'lead-estado-descartado'
  if (p.includes('convertido')) return 'lead-estado-convertido'
  if (p.includes('proceso')) return 'lead-estado-proceso'
  return 'lead-estado-pendiente'
}

// =====================================================
// LEADS MODULE
// =====================================================

/** Clasifica causal_de_cierre en motivo legible (solo para "No le interesa") */
function clasificarMotivoDesinteres(causal: string | null | undefined): string {
  if (!causal) return 'Otro'
  const t = causal.toLowerCase()
  if (/price|precio|caro|costoso|plata|alcanza|expensive|cost|dinero|pagar|cobr|tarifa|alquiler/.test(t)) return 'Precio de alquiler'
  if (/disagreement|condicion|turno|conviene|oferta|acuerdo|horario|regla|requisito|policy|condition|schedule/.test(t)) return 'Desacuerdo con oferta'
  return 'Otro'
}

// Caché en memoria a nivel módulo: sobrevive a desmontes/remontes del componente
// (p.ej. cuando el usuario navega fuera de /leads y regresa). Se invalida al cambiar
// de sede o al recargar la página. Permite mostrar datos instantáneamente y refrescar
// en background sin mostrar el overlay "Cargando leads...".
type CatalogoItem = { id: string; codigo: string; descripcion: string }
type LeadsCache = {
  sedeKey: string
  leads: Lead[]
  categoriasLicencia: CatalogoItem[]
  estadosLicencia: CatalogoItem[]
  tiposLicencia: CatalogoItem[]
  nacionalidades: CatalogoItem[]
  estadosCiviles: CatalogoItem[]
}
let leadsCache: LeadsCache | null = null

export function LeadsModule() {
  const { canCreateInMenu, canEditInMenu, canDeleteInMenu } = usePermissions()
  const { profile } = useAuth()
  const { sedes, sedeActual, sedeActualId, verTodas, aplicarFiltroSede } = useSede()
  const sedeKey = verTodas ? 'all' : (sedeActualId || 'none')
  const cacheHit = leadsCache?.sedeKey === sedeKey ? leadsCache : null
  const canCreate = canCreateInMenu('leads')
  const canEdit = canEditInMenu('leads')
  const canDelete = canDeleteInMenu('leads')

  // Zonas peligrosas
  const [zonasRestringidas, setZonasPeligrosas] = useState<ZonaRestringida[]>([])

  // State principal — hidratar desde caché module-level si está disponible para la sede actual
  const [leads, setLeads] = useState<Lead[]>(() => cacheHit?.leads || [])
  const [loading, setLoading] = useState(() => !cacheHit)
  const [error, setError] = useState('')

  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [formData, setFormData] = useState<LeadFormData>({ ...emptyFormData })
  const [saving, setSaving] = useState(false)
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})

  // Filtros de columna
  const [nombreFilter, setNombreFilter] = useState<string[]>([])
  const [zonaFilter, setZonaFilter] = useState<string[]>([])
  const [turnoFilter, setTurnoFilter] = useState<string[]>([])
  const [disponibilidadFilter, setDisponibilidadFilter] = useState<string[]>([])
  const [fuenteFilter, setFuenteFilter] = useState<string[]>([])
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])
  const [openFilterId, setOpenFilterId] = useState<string | null>(null)

  // Stat card filter
  const [activeStatCard, setActiveStatCard] = useState<string | null>(null)

  // Inline estado dropdown
  const [estadoDropdownId, setEstadoDropdownId] = useState<string | null>(null)
  const [sinoDropdownKey, setSinoDropdownKey] = useState<string | null>(null) // "leadId::field"

  // Catálogos (mismos que conductores)
  const [categoriasLicencia, setCategoriasLicencia] = useState<Array<{ id: string; codigo: string; descripcion: string }>>(() => cacheHit?.categoriasLicencia || [])
  const [estadosLicencia, setEstadosLicencia] = useState<Array<{ id: string; codigo: string; descripcion: string }>>(() => cacheHit?.estadosLicencia || [])
  const [tiposLicencia, setTiposLicencia] = useState<Array<{ id: string; codigo: string; descripcion: string }>>(() => cacheHit?.tiposLicencia || [])
  const [nacionalidades, setNacionalidades] = useState<Array<{ id: string; codigo: string; descripcion: string }>>(() => cacheHit?.nacionalidades || [])
  const [estadosCiviles, setEstadosCiviles] = useState<Array<{ id: string; codigo: string; descripcion: string }>>(() => cacheHit?.estadosCiviles || [])

  // Estados visibles para cambio manual (Conductor se asigna solo automáticamente)
  const ESTADOS_LEAD = [
    'Inicio conversación', 'Acepta oferta', 'Pendiente - Hireflix', 'Apto - Hireflix', 'No Apto - Hireflix', 'Ayuda - Hireflix',
    'Documentos enviados', 'Documentos pendientes', 'Auto del pueblo', 'No le interesa', 'No cumple edad',
    'Convocatoria Inducción', 'Apto Inducción', 'Descartado',
  ] as const

  /** Calcula el estado correcto de un lead basándose en proceso y entrevista_ia.
   *  Si el lead tiene un estado asignado manualmente (ej: DAMARO), lo respeta. */
  function calcularEstadoLead(lead: Lead): string {
    const proceso = (lead.proceso || '').toLowerCase()
    const entrevista = lead.entrevista_ia || ''

    if (proceso === 'convertido' || proceso === 'conductor') return 'Conductor'
    if (entrevista === 'No Apto') return 'No Apto - Hireflix'
    if (entrevista === 'Apto') return 'Apto - Hireflix'
    // Si tiene dato en ayuda_entrevista, asignar "Ayuda - Hireflix"
    if (lead.ayuda_entrevista && lead.ayuda_entrevista.trim() !== '') return 'Ayuda - Hireflix'
    // Si fase_de_preguntas es "Video Entrevista" y aún está en "Acepta oferta", pasa a pendiente
    if (lead.fase_de_preguntas === 'Video Entrevista' && lead.estado_de_lead === 'Acepta oferta') return 'Pendiente - Hireflix'
    // Normalizar estados con formato invertido (ej: "Hireflix - Apto" -> "Apto - Hireflix")
    if (lead.estado_de_lead) {
      const el = lead.estado_de_lead.toLowerCase()
      if (el.includes('hireflix') && el.includes('no apto')) return 'No Apto - Hireflix'
      if (el.includes('hireflix') && el.includes('apto')) return 'Apto - Hireflix'
      if (el.includes('hireflix') && el.includes('ayuda')) return 'Ayuda - Hireflix'
    }
    // Si ya tiene un estado asignado (no vacío y no "Inicio conversación"), respetarlo
    if (lead.estado_de_lead && lead.estado_de_lead !== 'Inicio conversación') return lead.estado_de_lead
    return 'Inicio conversación'
  }

  async function handleInlineUpdate(leadId: string, field: keyof Lead, value: string) {
    try {
      const updateData: Record<string, unknown> = { [field]: value || null, updated_at: new Date().toISOString() }
      // Si se edita el campo sede, resolver sede_id
      if (field === 'sede' && value && sedes.length > 0) {
        const textoSede = value.trim().toLowerCase()
        const sedeMatch = sedes.find(s => s.nombre?.toLowerCase() === textoSede || s.codigo?.toLowerCase() === textoSede)
        if (sedeMatch) {
          updateData.sede_id = sedeMatch.id
          updateData.sede = sedeMatch.nombre
        }
      }
      const { error } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', leadId)
      if (error) throw error
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...updateData } as Lead : l))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      Swal.fire('Error', `No se pudo actualizar: ${msg}`, 'error')
    }
  }

  async function handleChangeEstadoInline(leadId: string, nuevoEstado: string) {
    setEstadoDropdownId(null)
    try {
      const now = new Date().toISOString()
      // Marcar estado_manual_at para que loadLeads respete este cambio manual
      // y no lo sobrescriba con el auto-cálculo de calcularEstadoLead.
      const { error } = await supabase
        .from('leads')
        .update({ estado_de_lead: nuevoEstado, estado_manual_at: now, updated_at: now })
        .eq('id', leadId)
      if (error) throw error
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, estado_de_lead: nuevoEstado, estado_manual_at: now, updated_at: now } : l))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      Swal.fire('Error', `No se pudo cambiar el estado: ${msg}`, 'error')
    }
  }

  // ---------- DATA LOADING ----------
  const loadLeads = useCallback(async () => {
    // Silent refresh si ya hay datos cacheados para esta sede; sino, mostrar overlay.
    const silent = leadsCache?.sedeKey === sedeKey
    if (!silent) setLoading(true)
    setError('')
    try {
      let query = supabase
        .from('leads')
        .select('*')
        .or('proceso.is.null,proceso.neq.Convertido')
        .order('updated_at', { ascending: false })
        .limit(10000)

      // Filtro por sede usando la FK sede_id (UUID), igual que el resto del sistema.
      // aplicarFiltroSede respeta el modo "Todas las sedes" para usuarios admin.
      query = aplicarFiltroSede(query, 'sede_id')

      const [leadsRes, catRes, estLicRes, tipLicRes, nacRes, ecRes] = await Promise.all([
        query,
        supabase.from('licencias_categorias').select('id, codigo, descripcion').order('descripcion'),
        supabase.from('licencias_estados').select('id, codigo, descripcion').order('descripcion'),
        supabase.from('licencias_tipos').select('id, codigo, descripcion').order('descripcion'),
        supabase.from('nacionalidades').select('id, codigo, descripcion').order('descripcion'),
        supabase.from('estados_civiles').select('id, codigo, descripcion').order('descripcion'),
      ])
      if (leadsRes.error) throw leadsRes.error
      const catData = catRes.data || []
      const estLicData = estLicRes.data || []
      const tipLicData = tipLicRes.data || []
      const nacData = nacRes.data || []
      const ecData = ecRes.data || []
      setCategoriasLicencia(catData)
      setEstadosLicencia(estLicData)
      setTiposLicencia(tipLicData)
      setNacionalidades(nacData)
      setEstadosCiviles(ecData)
      const leadsData = (leadsRes.data || []) as Lead[]

      // Calcular estado correcto y detectar desactualizados.
      // Leads con estado_manual_at seteado conservan su estado (cambio del operador),
      // excepto cuando proceso pasa a "convertido"/"conductor" (transición de proceso, gana).
      const leadsConEstado: Lead[] = []
      const actualizaciones: { id: string; estado: string }[] = []

      for (const lead of leadsData) {
        const proceso = (lead.proceso || '').toLowerCase()
        const esConductor = proceso === 'convertido' || proceso === 'conductor'
        const esPendienteHireflix = lead.fase_de_preguntas === 'Video Entrevista' && lead.estado_de_lead === 'Acepta oferta'

        if (lead.estado_manual_at && !esConductor && !esPendienteHireflix) {
          // Cambio manual del operador — respetar siempre (excepto conductor y pendiente hireflix)
          leadsConEstado.push(lead)
          continue
        }

        const estadoCorrecto = calcularEstadoLead(lead)
        if (lead.estado_de_lead !== estadoCorrecto) {
          actualizaciones.push({ id: lead.id, estado: estadoCorrecto })
          leadsConEstado.push({ ...lead, estado_de_lead: estadoCorrecto })
        } else {
          leadsConEstado.push(lead)
        }
      }

      setLeads(leadsConEstado)

      // Actualizar caché module-level para próximos remontes silenciosos del componente
      leadsCache = {
        sedeKey,
        leads: leadsConEstado,
        categoriasLicencia: catData,
        estadosLicencia: estLicData,
        tiposLicencia: tipLicData,
        nacionalidades: nacData,
        estadosCiviles: ecData,
      }

      // Sincronizar en DB en lotes de 100 (en background, sin bloquear UI)
      if (actualizaciones.length > 0) {
        const batchSize = 100
        for (let i = 0; i < actualizaciones.length; i += batchSize) {
          const batch = actualizaciones.slice(i, i + batchSize)
          // Agrupar por estado para hacer menos queries
          const porEstado = batch.reduce<Record<string, string[]>>((acc, b) => {
            if (!acc[b.estado]) acc[b.estado] = []
            acc[b.estado].push(b.id)
            return acc
          }, {})
          for (const [estado, batchIds] of Object.entries(porEstado)) {
            await supabase
              .from('leads')
              .update({ estado_de_lead: estado, updated_at: new Date().toISOString() })
              .in('id', batchIds)
          }
        }

      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cargar leads'
      setError(msg)
    } finally {
      // setLoading(false) es idempotente — siempre limpio por si el silent fue interrumpido
      // por un cambio de sede (donde sí mostramos overlay).
      setLoading(false)
    }
  }, [aplicarFiltroSede, sedeKey])

  useEffect(() => { loadLeads() }, [loadLeads])

  // Bloquear scroll del body cuando el modal de detalle está abierto
  useEffect(() => {
    if (showDetailsModal) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [showDetailsModal])

  // Cerrar dropdown de estado al hacer click fuera
  useEffect(() => {
    if (!estadoDropdownId) return
    const handleClick = () => setEstadoDropdownId(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [estadoDropdownId])

  // ---------- GEOCODIFICAR LEADS SIN COORDENADAS ----------
  const geocodificarLeadsSinCoordenadas = useCallback(async (leadsList: Lead[]) => {
    try {
      const sinCoords = leadsList.filter(
        l => l.direccion && (l.latitud == null || l.longitud == null)
      )
      if (sinCoords.length === 0) return

      try {
        await loadGoogleMapsAPI()
      } catch {
        return
      }

      let actualizado = false
      for (const lead of sinCoords) {
        try {
          const coords = await geocodificarDireccion(lead.direccion || '')
          if (coords) {
            await supabase
              .from('leads')
              .update({ latitud: coords.lat, longitud: coords.lng })
              .eq('id', lead.id)
            actualizado = true
          }
        } catch {
          // silently ignored
        }
      }

      if (actualizado) {
        loadLeads()
      }
    } catch (err) {
      console.error('[Leads] Error en geocodificarLeadsSinCoordenadas:', err)
    }
  }, [loadLeads])

  useEffect(() => {
    if (leads.length > 0) {
      geocodificarLeadsSinCoordenadas(leads)
    }
  // Solo correr cuando leads cambie de 0 a >0 (carga inicial)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads.length > 0])

  // ---------- SINCRONIZAR SEDE Y FUENTE DE LEADS ----------
  const sincronizarSedeLeads = useCallback(async () => {
    try {
      if (sedes.length === 0) return

      // Traer todos los leads no convertidos
      const { data: allLeads } = await supabase
        .from('leads')
        .select('id, sede, sede_id, fuente_de_lead, turno, estado_de_lead, zona')
        .or('proceso.is.null,proceso.neq.Convertido')
        .limit(5000)

      if (!allLeads || allLeads.length === 0) return

      const sedePrincipal = sedes.find(s => s.es_principal) || sedes[0]
      const sedeMap = new Map(sedes.map(s => [s.id, s.nombre?.toLowerCase() || '']))
      // Resolución por sustring: cuando un lead llega sin sede o con un texto sucio
      // ("Esty Bariloche", "BRC", etc.) intentamos inferirla por contenido en sede + zona.
      const sedeBariloche = sedes.find(s =>
        /bariloche|^brc$|patagonia/i.test(`${s.nombre || ''} ${s.codigo || ''}`)
      )
      const sedeBuenosAires = sedes.find(s =>
        /buenos\s*aires|^bsas$|^bs\.?\s*as\.?$|^ba$/i.test(`${s.nombre || ''} ${s.codigo || ''}`)
      ) || sedePrincipal
      let actualizado = false

      for (const lead of allLeads) {
        const updateData: Record<string, unknown> = {}

        // --- Sede: asignar o corregir ---
        // Regla: si el lead no tiene sede_id (o tiene un texto inconsistente),
        // inferimos la sede a partir de `sede` + `zona`. Si hay alguna referencia
        // a Bariloche → Bariloche; en cualquier otro caso → Buenos Aires (default).
        const textoSede = (lead.sede || '').trim().toLowerCase()
        const sedeActualNombre = lead.sede_id ? sedeMap.get(lead.sede_id) : null
        const necesitaUpdateSede = !lead.sede_id || (textoSede && sedeActualNombre && !sedeActualNombre.includes(textoSede) && !textoSede.includes(sedeActualNombre))

        if (necesitaUpdateSede) {
          const haystack = `${lead.sede || ''} ${lead.zona || ''}`.toLowerCase()
          const refiereBariloche = /bariloche|\bbrc\b|patagonia/.test(haystack)
          const sedeAsignada = (refiereBariloche ? sedeBariloche : sedeBuenosAires) || sedePrincipal
          if (sedeAsignada && lead.sede_id !== sedeAsignada.id) {
            updateData.sede_id = sedeAsignada.id
            updateData.sede = sedeAsignada.nombre
          }
        }

        // --- Fuente: asignar Intercom si está vacía ---
        if (!lead.fuente_de_lead) {
          updateData.fuente_de_lead = 'Intercom'
        }

        // --- Turno: normalizar valores sucios ---
        if (lead.turno) {
          const tl = lead.turno.toLowerCase()
          let turnoNorm: string | null = null
          if (tl.includes('diurno') || tl === 'dia' || tl === 'day') turnoNorm = 'Diurno'
          else if (tl.includes('nocturno') || tl.includes('noche') || tl === 'night') turnoNorm = 'Nocturno'
          else if (tl.includes('indiferente') || tl.includes('any') || tl.includes('ambos') || tl.includes('cualquier')) turnoNorm = 'Indiferente'
          if (turnoNorm && turnoNorm !== lead.turno) {
            updateData.turno = turnoNorm
          }
        }

        // --- Zona: normalizar variantes (quitar prefijo "Zona") ---
        if (lead.zona) {
          const zl = lead.zona.trim()
          const zonaNorm = zl.replace(/^zona\s+/i, '')
          if (zonaNorm !== lead.zona) {
            updateData.zona = zonaNorm
          }
        }

        // --- Estado: normalizar formatos invertidos (ej: "Hireflix - Apto" -> "Apto - Hireflix") ---
        if (lead.estado_de_lead) {
          const el = lead.estado_de_lead.toLowerCase()
          let estadoNorm: string | null = null
          if (el.includes('hireflix') && el.includes('no apto')) estadoNorm = 'No Apto - Hireflix'
          else if (el.includes('hireflix') && el.includes('apto')) estadoNorm = 'Apto - Hireflix'
          else if (el.includes('hireflix') && el.includes('ayuda')) estadoNorm = 'Ayuda - Hireflix'
          if (estadoNorm && estadoNorm !== lead.estado_de_lead) {
            updateData.estado_de_lead = estadoNorm
          }
          // Normalizar tilde: "Convocatoria Induccion" -> "Convocatoria Inducción"
          if (el === 'convocatoria induccion' && lead.estado_de_lead !== 'Convocatoria Inducción') {
            updateData.estado_de_lead = 'Convocatoria Inducción'
          }
        }

        // Si no hay nada que actualizar, seguir
        if (Object.keys(updateData).length === 0) continue

        try {
          await supabase
            .from('leads')
            .update(updateData)
            .eq('id', lead.id)
          actualizado = true
        } catch {
          // silently ignored
        }
      }

      if (actualizado) {
        loadLeads()
      }
    } catch (err) {
      console.error('[Leads] Error en sincronizarSedeLeads:', err)
    }
  }, [sedes, loadLeads])

  useEffect(() => {
    if (sedes.length > 0) {
      sincronizarSedeLeads()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedes.length > 0])

  // ---------- CARGAR ZONAS PELIGROSAS ----------
  useEffect(() => {
    async function loadZonas() {
      const { data } = await supabase
        .from('zonas_peligrosas')
        .select('id, nombre, poligono')
        .eq('activo', true)
      if (data) setZonasPeligrosas(data as ZonaRestringida[])
    }
    loadZonas()
  }, [])

  // ---------- MAPA: lead_id -> nombre de zona restringida ----------
  const leadsEnZona = useMemo(() => {
    const map = new Map<string, string>()
    try {
    if (zonasRestringidas.length === 0) return map
    for (const lead of leads) {
      if (lead.latitud == null || lead.longitud == null) continue
      const punto = { lat: lead.latitud, lng: lead.longitud }
      for (const zona of zonasRestringidas) {
        if (zona.poligono && Array.isArray(zona.poligono) && isPointInPolygon(punto, zona.poligono)) {
          map.set(lead.id, zona.nombre)
          break
        }
      }
    }
    } catch (err) {
      console.error('[Leads] Error en leadsEnZona:', err)
    }
    return map
  }, [leads, zonasRestringidas])

  // ---------- STATS ----------
  const stats = useMemo(() => {
    const total = leads.length
    const inicio = leads.filter(l => l.estado_de_lead === 'Inicio conversación').length
    const aptos = leads.filter(l => l.estado_de_lead === 'Apto - Hireflix').length
    const noAptos = leads.filter(l => l.estado_de_lead === 'No Apto - Hireflix').length
    const conCoordenadas = leads.filter(l => l.latitud != null && l.longitud != null)
    const enZonaRestringida = conCoordenadas.filter(l => leadsEnZona.has(l.id)).length
    const enZonaSegura = conCoordenadas.filter(l => !leadsEnZona.has(l.id)).length
    const convocatoria = leads.filter(l => l.estado_de_lead === 'Convocatoria Inducción' || l.estado_de_lead === 'Convocatoria Induccion').length
    const intercom = leads.filter(l => (l.fuente_de_lead || '').toLowerCase() !== 'damaro').length
    const damaro = leads.filter(l => (l.fuente_de_lead || '').toLowerCase() === 'damaro').length
    const autoPueblo = leads.filter(l => l.estado_de_lead === 'Auto del pueblo').length
    const descartados = leads.filter(l => l.estado_de_lead === 'Descartado').length
    return { total, inicio, aptos, noAptos, convocatoria, enZonaRestringida, enZonaSegura, intercom, damaro, autoPueblo, descartados }
  }, [leads, leadsEnZona])

  // ---------- UNIQUE VALUES PARA FILTROS ----------
  const uniqueZonas = useMemo(() =>
    [...new Set(leads.map(l => l.zona).filter(Boolean))].sort() as string[]
  , [leads])

  const uniqueTurnos = useMemo(() =>
    [...new Set(leads.map(l => normalizarTurno(l.turno)).filter(v => v !== '-'))].sort() as string[]
  , [leads])

  const uniqueDisponibilidades = useMemo(() =>
    [...new Set(leads.map(l => l.disponibilidad).filter(Boolean))].sort() as string[]
  , [leads])

  const uniqueNombres = useMemo(() =>
    [...new Set(leads.map(l => l.nombre_completo).filter(Boolean))].sort() as string[]
  , [leads])

  // ---------- FILTERED DATA ----------
  const filteredLeads = useMemo(() => {
    // Ocultar leads "Conductor" siempre (ya no son leads)
    let result = leads.filter(l => l.estado_de_lead !== 'Conductor')

    // Stat card filter (todos basados en estado_de_lead)
    if (activeStatCard === 'inicio') result = result.filter(l => l.estado_de_lead === 'Inicio conversación')
    else if (activeStatCard === 'aptos') result = result.filter(l => l.estado_de_lead === 'Apto - Hireflix')
    else if (activeStatCard === 'noAptos') result = result.filter(l => l.estado_de_lead === 'No Apto - Hireflix')
    else if (activeStatCard === 'convocatoria') result = result.filter(l => l.estado_de_lead === 'Convocatoria Inducción' || l.estado_de_lead === 'Convocatoria Induccion')
    else if (activeStatCard === 'zonaSegura') result = result.filter(l => l.latitud != null && l.longitud != null && !leadsEnZona.has(l.id))
    else if (activeStatCard === 'zonaRestringida') result = result.filter(l => l.latitud != null && l.longitud != null && leadsEnZona.has(l.id))
    else if (activeStatCard === 'intercom') result = result.filter(l => (l.fuente_de_lead || '').toLowerCase() !== 'damaro')
    else if (activeStatCard === 'damaro') result = result.filter(l => (l.fuente_de_lead || '').toLowerCase() === 'damaro')
    else if (activeStatCard === 'autoPueblo') result = result.filter(l => l.estado_de_lead === 'Auto del pueblo')
    else if (activeStatCard === 'descartados') result = result.filter(l => l.estado_de_lead === 'Descartado')
    else {
      // Por defecto: excluir descartados de la tabla
      result = result.filter(l => l.estado_de_lead !== 'Descartado')
    }

    // Column filters
    if (nombreFilter.length > 0) {
      const set = new Set(nombreFilter)
      result = result.filter(l => set.has(l.nombre_completo || ''))
    }
    if (zonaFilter.length > 0) {
      const set = new Set(zonaFilter)
      result = result.filter(l => set.has(l.zona || ''))
    }
    if (turnoFilter.length > 0) {
      const set = new Set(turnoFilter)
      result = result.filter(l => set.has(normalizarTurno(l.turno)))
    }
    if (disponibilidadFilter.length > 0) {
      const set = new Set(disponibilidadFilter)
      result = result.filter(l => set.has(l.disponibilidad || ''))
    }
    if (fuenteFilter.length > 0) {
      const set = new Set(fuenteFilter)
      result = result.filter(l => set.has(l.fuente_de_lead || ''))
    }
    if (estadoFilter.length > 0) {
      const set = new Set(estadoFilter)
      result = result.filter(l => set.has(l.estado_de_lead || ''))
    }

    return result
  }, [leads, activeStatCard, nombreFilter, zonaFilter, turnoFilter, disponibilidadFilter, fuenteFilter, estadoFilter])

  // ---------- HANDLERS ----------
  function handleOpenDetails(lead: Lead) {
    setSelectedLead(lead)
    setShowDetailsModal(true)
  }

  function handleOpenEdit(lead: Lead) {
    setSelectedLead(lead)
    setFormData(leadToFormData(lead))
    setEditErrors({})
    setShowEditModal(true)
  }

  function handleOpenCreate() {
    setFormData({ ...emptyFormData })
    setEditErrors({})
    setShowCreateModal(true)
  }

  function handleOpenDelete(lead: Lead) {
    setSelectedLead(lead)
    setShowDeleteModal(true)
  }


  async function handleSaveCreate() {
    setSaving(true)
    try {
      const fields = formDataToDbFields(formData)
      // Asignar sede actual (UUID) al crear
      if (sedeActual?.id) {
        fields.sede_id = sedeActual.id
        fields.sede = sedeActual.nombre
      }
      const { error: err } = await supabase.from('leads').insert(fields)
      if (err) throw err
      showSuccess('Lead creado', 'El lead se registró correctamente')
      setShowCreateModal(false)
      loadLeads()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo crear el lead'
      Swal.fire('Error', msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEdit() {
    if (!selectedLead) return
    setSaving(true)
    try {
      const fields = formDataToDbFields(formData)
      // Resolver sede_id si el campo sede texto cambió
      const textoSede = (formData.sede || '').trim().toLowerCase()
      if (textoSede && sedes.length > 0) {
        const sedeMatch = sedes.find(s => s.nombre?.toLowerCase() === textoSede || s.codigo?.toLowerCase() === textoSede)
        if (sedeMatch) {
          fields.sede_id = sedeMatch.id
          fields.sede = sedeMatch.nombre
        }
      }
      const { error: err } = await supabase.from('leads').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', selectedLead.id)
      if (err) throw err
      showSuccess('Lead actualizado', 'Los cambios se guardaron correctamente')
      setShowEditModal(false)
      loadLeads()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo actualizar'
      Swal.fire('Error', msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedLead) return
    setSaving(true)
    try {
      const { error: err } = await supabase.from('leads').delete().eq('id', selectedLead.id)
      if (err) throw err
      showSuccess('Lead eliminado', 'El registro fue eliminado')
      setShowDeleteModal(false)
      setSelectedLead(null)
      loadLeads()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo eliminar'
      Swal.fire('Error', msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  // ---------- CONVERTIR A CONDUCTOR ----------

  /** Match flexible: compara lowercase e intenta coincidencia parcial */
  function matchCatalogo(
    catalogo: Array<{ id: string; codigo: string; descripcion: string }>,
    texto: string | null | undefined
  ): string | null {
    if (!texto || catalogo.length === 0) return null
    const t = texto.trim().toLowerCase()
    // Primero buscar coincidencia exacta (case-insensitive)
    const exacto = catalogo.find(c => c.descripcion.toLowerCase() === t)
    if (exacto) return exacto.id
    // Luego buscar si el texto contiene la descripción o viceversa
    const parcial = catalogo.find(c =>
      t.includes(c.descripcion.toLowerCase()) || c.descripcion.toLowerCase().includes(t)
    )
    if (parcial) return parcial.id
    // Último intento: comparar por código
    const porCodigo = catalogo.find(c => c.codigo.toLowerCase() === t)
    if (porCodigo) return porCodigo.id
    return null
  }

  async function handleConvertir(lead: Lead) {
    // Validar todos los campos obligatorios para conductores
    const camposFaltantes: string[] = []
    if (!lead.nombre_completo?.trim()) camposFaltantes.push('Nombre completo')
    if (!lead.dni?.trim()) camposFaltantes.push('DNI')
    if (!lead.cuit?.trim()) camposFaltantes.push('CUIT')
    if (!lead.fecha_de_nacimiento) camposFaltantes.push('Fecha de nacimiento')
    if (!lead.nacionalidad?.trim()) camposFaltantes.push('Nacionalidad')
    if (!lead.estado_civil?.trim()) camposFaltantes.push('Estado civil')
    if (!lead.sede_id && !lead.sede) camposFaltantes.push('Sede')
    if (!lead.phone?.trim()) camposFaltantes.push('Teléfono')
    if (!lead.email?.trim()) camposFaltantes.push('Email')
    if (!lead.direccion?.trim()) camposFaltantes.push('Dirección')
    if (!lead.numero_licencia?.trim()) camposFaltantes.push('Nro. Licencia')
    if (!lead.categorias_licencia || lead.categorias_licencia.length === 0) camposFaltantes.push('Categorías de licencia')
    if (!lead.vencimiento_licencia) camposFaltantes.push('Vencimiento de licencia')

    if (camposFaltantes.length > 0) {
      await Swal.fire({
        icon: 'warning',
        title: 'Faltan campos obligatorios',
        html: `<p>Para convertir a conductor se requieren los siguientes campos:</p>
          <ul style="text-align:left; margin-top:8px; color:#DC2626;">
            ${camposFaltantes.map(c => `<li>${c}</li>`).join('')}
          </ul>
          <p style="margin-top:12px; font-size:13px; color:#6B7280;">Edite el lead para completar estos datos antes de convertirlo.</p>`,
        confirmButtonText: 'Entendido'
      })
      return
    }

    const nombre = lead.nombre_completo || 'Sin nombre'
    const dni = lead.dni || 'Sin DNI'

    // Verificar si ya existe un conductor con el mismo DNI o CUIT
    // Normalizamos quitando espacios y guiones para comparar correctamente
    const normalizarDoc = (val: string) => val.replace(/[\s\-]/g, '')
    let conductorExistente: Record<string, unknown> | null = null

    const dniLimpio = lead.dni?.trim() ? normalizarDoc(lead.dni.trim()) : ''
    const cuitLimpio = lead.cuit?.trim() ? normalizarDoc(lead.cuit.trim()) : ''

    if (dniLimpio || cuitLimpio) {
      // Traer candidatos que contengan los digitos del DNI o CUIT
      let query = supabase.from('conductores').select('*')
      if (dniLimpio && cuitLimpio) {
        query = query.or(`numero_dni.ilike.%${dniLimpio}%,numero_cuit.ilike.%${dniLimpio}%,numero_dni.ilike.%${cuitLimpio}%,numero_cuit.ilike.%${cuitLimpio}%`)
      } else if (dniLimpio) {
        query = query.or(`numero_dni.ilike.%${dniLimpio}%,numero_cuit.ilike.%${dniLimpio}%`)
      } else {
        query = query.or(`numero_dni.ilike.%${cuitLimpio}%,numero_cuit.ilike.%${cuitLimpio}%`)
      }
      const { data: candidatos } = await query.limit(10)

      if (candidatos && candidatos.length > 0) {
        // Comparar normalizado para encontrar match exacto
        // DNI match directo, o DNI contenido dentro del CUIT (CUIT = prefijo + DNI + digito verificador)
        conductorExistente = candidatos.find((c: Record<string, unknown>) => {
          const cDni = normalizarDoc(String(c.numero_dni || ''))
          const cCuit = normalizarDoc(String(c.numero_cuit || ''))
          if (dniLimpio && (cDni === dniLimpio || cCuit.includes(dniLimpio))) return true
          if (cuitLimpio && (cCuit === cuitLimpio || cDni === cuitLimpio)) return true
          return false
        }) || null
      }
    }

    const esFusion = !!conductorExistente

    if (esFusion && conductorExistente) {
      // Mensaje informativo no bloqueante: se muestra mientras la fusion se ejecuta
      const ce = conductorExistente
      Swal.fire({
        icon: 'info',
        title: 'El conductor ya existe',
        html: `
          <p>Se realizará la fusión de datos de este lead con el conductor existente.</p>
          <div style="text-align:left; padding:12px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; margin-top:12px;">
            <p style="margin:4px 0;"><strong>Nombre:</strong> ${ce.nombres || ''} ${ce.apellidos || ''}</p>
            <p style="margin:4px 0;"><strong>DNI:</strong> ${ce.numero_dni || '-'}</p>
            <p style="margin:4px 0;"><strong>CUIT:</strong> ${ce.numero_cuit || '-'}</p>
            <p style="margin:4px 0;"><strong>Teléfono:</strong> ${ce.telefono_contacto || '-'}</p>
            <p style="margin:4px 0;"><strong>Email:</strong> ${ce.email || '-'}</p>
            <p style="margin:4px 0;"><strong>Dirección:</strong> ${ce.direccion || '-'}</p>
          </div>
          <p style="margin-top:12px; font-size:13px; color:#6B7280;">Solo se completarán los campos vacíos del conductor con los datos del lead.</p>
        `,
        showConfirmButton: false,
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading() },
      })
    } else {
      // Flujo normal: confirmar creación
      const result = await Swal.fire({
        icon: 'question',
        title: 'Convertir Lead a Conductor',
        html: `
          <p>Se creará un nuevo conductor con los datos de este lead:</p>
          <div style="text-align:left; padding:12px; background:#f9fafb; border-radius:8px; margin-top:12px;">
            <p style="margin:4px 0;"><strong>Nombre:</strong> ${nombre}</p>
            <p style="margin:4px 0;"><strong>DNI:</strong> ${dni}</p>
            <p style="margin:4px 0;"><strong>Teléfono:</strong> ${lead.phone || '-'}</p>
            <p style="margin:4px 0;"><strong>Zona:</strong> ${lead.zona || '-'}</p>
            <p style="margin:4px 0;"><strong>Turno:</strong> ${lead.turno || '-'}</p>
          </div>
          <p style="margin-top:12px; color:#92400e; font-size:13px;">El lead se marcará como "Convertido".</p>
        `,
        showCancelButton: true,
        confirmButtonText: 'Convertir',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#16a34a',
      })

      if (!result.isConfirmed) return
    }

    setSaving(true)
    try {
      const parts = (lead.nombre_completo || '').trim().split(' ')
      const nombres = parts.slice(0, Math.ceil(parts.length / 2)).join(' ')
      const apellidos = parts.slice(Math.ceil(parts.length / 2)).join(' ')

      let turnoMapped = 'SIN_PREFERENCIA'
      const turnoLead = (lead.turno || '').toLowerCase()
      if (turnoLead.includes('diurno')) turnoMapped = 'DIURNO'
      else if (turnoLead.includes('nocturno')) turnoMapped = 'NOCTURNO'
      else if (turnoLead.includes('cargo')) turnoMapped = 'A_CARGO'

      // Resolver textos a IDs usando match flexible
      const licenciaEstadoId = matchCatalogo(estadosLicencia, lead.estado_licencia)
      const licenciaTipoId = matchCatalogo(tiposLicencia, lead.tipo_licencia)
      const nacionalidadId = matchCatalogo(nacionalidades, lead.nacionalidad)
      const estadoCivilId = matchCatalogo(estadosCiviles, lead.estado_civil)

      // Recalcular zona desde coordenadas o geocodificando la dirección
      let zonaCalculada = ''
      let latFinal = lead.latitud ?? null
      let lngFinal = lead.longitud ?? null

      if (latFinal != null && lngFinal != null) {
        zonaCalculada = inferZona(lead.direccion || '', latFinal, lngFinal)
      } else if (lead.direccion?.trim()) {
        try {
          const geocoder = new google.maps.Geocoder()
          const geoResult = await new Promise<{ lat: number; lng: number; address: string } | null>((resolve) => {
            geocoder.geocode({ address: lead.direccion!, region: 'AR' }, (results, status) => {
              if (status === 'OK' && results && results[0]) {
                resolve({
                  lat: results[0].geometry.location.lat(),
                  lng: results[0].geometry.location.lng(),
                  address: results[0].formatted_address
                })
              } else {
                resolve(null)
              }
            })
          })
          if (geoResult) {
            latFinal = geoResult.lat
            lngFinal = geoResult.lng
            zonaCalculada = inferZonaFromCoords(geoResult.lat, geoResult.lng)
          }
        } catch {
          zonaCalculada = inferZona(lead.direccion || '')
        }
      }

      if (!zonaCalculada) zonaCalculada = lead.zona || ''

      // Datos del lead mapeados a campos de conductor
      const leadMappedData: Record<string, unknown> = {
        nombres: (nombres || lead.primer_nombre || '').toUpperCase(),
        apellidos: (apellidos || lead.apellido || '').toUpperCase(),
        numero_dni: lead.dni || '',
        numero_cuit: lead.cuit || '',
        telefono_contacto: lead.phone || '',
        email: lead.email || '',
        direccion: lead.direccion || '',
        zona: zonaCalculada,
        preferencia_turno: turnoMapped,
        licencia_vencimiento: lead.vencimiento_licencia || null,
        numero_licencia: lead.numero_licencia || '',
        licencia_estado_id: licenciaEstadoId,
        licencia_tipo_id: licenciaTipoId,
        nacionalidad_id: nacionalidadId,
        estado_civil_id: estadoCivilId,
        cbu: lead.cbu || '',
        monotributo: lead.monotributo?.toLowerCase().includes('tiene') || false,
        fecha_nacimiento: lead.fecha_de_nacimiento || null,
        direccion_lat: latFinal,
        direccion_lng: lngFinal,
        sede_id: lead.sede_id || sedeActual?.id || null,
        url_documentacion: lead.url_folder || null,
        intercom_id: lead.id_lead || null,
        id_conversation: lead.id_conversation || null,
        contacto_emergencia: lead.contacto_de_emergencia || lead.datos_de_emergencia || null,
        telefono_emergencia: lead.telefono_emergencia || null,
        parentesco_emergencia: lead.parentesco_emergencia || null,
        observaciones: lead.observaciones || null,
        cochera_propia: lead.cochera?.toLowerCase() === 'si' || lead.cochera?.toLowerCase() === 'sí' || false,
        antecedentes_penales: lead.antecedentes_penales ?? false,
      }

      let conductorId: string

      if (esFusion && conductorExistente) {
        // FUSION: solo actualizar campos vacios/nulos del conductor existente
        conductorId = conductorExistente.id as string
        const updateData: Record<string, unknown> = {}

        // Campos que no se deben pisar en fusion (estado, motivo_baja, etc)
        const camposExcluidos = ['estado_id', 'motivo_baja', 'fecha_terminacion', 'fecha_reincorpoaracion']

        for (const [key, leadValue] of Object.entries(leadMappedData)) {
          if (camposExcluidos.includes(key)) continue
          const existingValue = conductorExistente[key]
          // Solo llenar si el conductor tiene el campo vacio/nulo
          const isEmpty = existingValue === null || existingValue === undefined || existingValue === '' || existingValue === 0
          const leadHasValue = leadValue !== null && leadValue !== undefined && leadValue !== ''
          if (isEmpty && leadHasValue) {
            updateData[key] = leadValue
          }
        }

        if (Object.keys(updateData).length > 0) {
          const { error: errUpdate } = await supabase
            .from('conductores')
            .update(updateData)
            .eq('id', conductorId)
          if (errUpdate) throw errUpdate
        }
      } else {
        // CREACION: flujo normal de insert
        const { data: estados } = await supabase
          .from('conductores_estados')
          .select('id')
          .eq('codigo', 'ACTIVO')
          .limit(1)
        const estadoId = estados?.[0]?.id

        if (!estadoId) {
          throw new Error('No se encontró el estado ACTIVO para conductores. Verifique la tabla conductores_estados.')
        }

        const conductorData: Record<string, unknown> = { ...leadMappedData, estado_id: estadoId }

        // Filtrar campos vacíos (salvo requeridos)
        Object.keys(conductorData).forEach(key => {
          const v = conductorData[key]
          if (v === '' || v === null || v === undefined) {
            if (!['numero_licencia', 'estado_id', 'nombres', 'apellidos', 'numero_dni'].includes(key)) {
              delete conductorData[key]
            }
          }
        })

        const { data: createdConductor, error: errCond } = await supabase
          .from('conductores')
          .insert(conductorData)
          .select('id')
          .single()

        if (errCond) throw errCond
        conductorId = createdConductor.id
      }

      // Buscar o crear carpeta en Drive
      let folderUrl = lead.url_folder?.trim() || null
      if (conductorId) {
        if (!folderUrl) {
          const nombreCompleto = (lead.nombre_completo || '').trim()
          if (nombreCompleto) {
            const driveResult = await createLeadDriveFolder(lead.id, nombreCompleto)
            if (driveResult.success && driveResult.folderUrl) {
              folderUrl = driveResult.folderUrl
              await supabase.from('leads').update({ url_folder: folderUrl }).eq('id', lead.id)
            }
          }
        }
        // Solo guardar URL si el conductor no tiene una
        if (folderUrl) {
          const existingUrl = esFusion ? (conductorExistente?.url_documentacion || conductorExistente?.drive_folder_url) : null
          if (!existingUrl) {
            await supabase.from('conductores').update({ url_documentacion: folderUrl }).eq('id', conductorId)
          }
        }
      }

      // Insertar categorías de licencia (sin duplicar)
      if (conductorId && lead.categorias_licencia?.length && categoriasLicencia.length > 0) {
        // Obtener categorias que ya tiene el conductor
        const { data: categoriasExistentes } = await (supabase as any)
          .from('conductores_licencias_categorias')
          .select('licencia_categoria_id')
          .eq('conductor_id', conductorId)
        const idsExistentes = new Set((categoriasExistentes || []).map((c: { licencia_categoria_id: string }) => c.licencia_categoria_id))

        const categoriasRelacion: Array<{ conductor_id: string; licencia_categoria_id: string }> = []
        for (const desc of lead.categorias_licencia) {
          const cat = categoriasLicencia.find(c => c.descripcion === desc)
          if (cat && !idsExistentes.has(cat.id)) {
            categoriasRelacion.push({ conductor_id: conductorId, licencia_categoria_id: cat.id })
          }
        }
        if (categoriasRelacion.length > 0) {
          await (supabase as any).from('conductores_licencias_categorias').insert(categoriasRelacion)
        }
      }

      await supabase.from('leads').update({
        proceso: 'Convertido',
        estado_de_lead: 'Conductor',
        fecha_convertido: new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).replace(' ', 'T'),
        usuario: profile?.full_name || 'Sistema',
      }).eq('id', lead.id)

      if (esFusion) Swal.close()
      const msgExito = esFusion
        ? `El lead "${nombre}" fue fusionado con el conductor existente.`
        : `El lead "${nombre}" fue convertido a conductor exitosamente.`
      showSuccess(esFusion ? 'Fusionado' : 'Convertido', msgExito)
      loadLeads()
    } catch (err) {
      if (esFusion) Swal.close()
      const msg = err instanceof Error ? err.message : 'No se pudo convertir el lead a conductor'
      Swal.fire('Error', msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  // ---------- EXPORT EXCEL ----------
  async function handleExportExcel() {
    try {
      const XLSX = await import('xlsx')
      const data = filteredLeads.map(l => ({
        'Fecha': formatDate(l.created_at),
        'Nombre': l.nombre_completo || '',
        'DNI': l.dni || '',
        'Teléfono': l.phone || '',
        'Email': l.email || '',
        'Proceso': l.proceso || '',
        'Entrevista IA': l.entrevista_ia || '',
        'Disponibilidad': l.disponibilidad || '',
        'Zona': l.zona || '',
        'Turno': l.turno || '',
        'Licencia': l.licencia || '',
        'Venc. Licencia': l.vencimiento_licencia || '',
        'Fuente': l.fuente_de_lead || '',
        'Observaciones': l.observaciones || '',
      }))
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Leads')
      XLSX.writeFile(wb, `leads_export_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch {
      Swal.fire('Error', 'No se pudo exportar', 'error')
    }
  }

  // ---------- CARGA MASIVA EXCEL ----------
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Mapeo formato Damaro: columna Excel → columna DB
  const DAMARO_TO_DB_MAP: Record<string, string> = {
    'NOMBRE': 'nombre_completo',
    'CIUDAD': 'sede',
    'DNI': 'dni',
    'CELULAR': 'phone',
    'OBSERVACIONES': 'observaciones',
    'FEEDBACK DAMARO': '_feedback_damaro',
  }

  // Mapeo estricto formato original: columna Excel → columna DB
  const EXCEL_TO_DB_MAP: Record<string, string> = {
    'Fecha': 'fecha_carga',
    'NOMBRE CANDIDATO': 'nombre_completo',
    'CONTACTO': 'phone',
    'PROCESO': 'proceso',
    'ENTREVISTA IA': 'entrevista_ia',
    'INDUCCIÓN': 'induccion',
    'DISPONIBILIDAD': 'disponibilidad',
    'DIRECCIÓN': 'direccion',
    'DIRECCION COMPLEMENTARIA': 'direccion_complementaria',
    'ZONA': 'zona',
    'TURNO': 'turno',
    'N° DNI': 'dni',
    'EXP.': 'experiencia_previa',
    'EDAD': 'edad',
    'FECHA DE NACIMIENTO': 'fecha_de_nacimiento',
    'DNI': 'dni_archivo',
    'D1': 'd1',
    'LICENCIA - CLASES': 'licencia',
    'VENCIMIENTO LICENCIA': 'vencimiento_licencia',
    'RNR': 'rnr',
    'FECHA RNR': 'fecha_rnr',
    'CERTIFICADO DIRECCIÓN': 'certificado_direccion',
    'CTA CABIFY': 'cuenta_cabify',
    'COCHERA': 'cochera',
    'RUEDA': 'rueda',
    'MONOTRIBUTO': 'monotributo',
    'CORREO': 'email',
    'OBSERVACIONES': 'observaciones',
    'PROCEDENCIA': 'fuente_de_lead',
    'ASESOR': 'agente_asignado',
    'ENTREVISTADOR': 'entrevistador_asignado',
    'DESCARTADO': 'causal_de_cierre',
    'DOMICILIO': 'clasificacion_domicilio',
    'BCRA': 'bcra',
    'CUIT': 'cuit',
    'CBU': 'cbu',
    'FECHA DE INICIO': 'fecha_de_inicio',
    'MAIL DE RESPALDO': 'mail_de_respaldo',
    'DATOS DE EMERGENCIA': 'datos_de_emergencia',
    'TEL. EMERGENCIA': 'telefono_emergencia',
    'PARENTESCO EMERGENCIA': 'parentesco_emergencia',
    'DIRECCION DE EMERGENCIA': 'direccion_emergencia',
    'Llamada de corroborrar Cont. de Emerg.': 'verificacion_emergencia',
    'LATITUD': 'latitud',
    'LONGITUD': 'longitud',
    'ESTADO DIRECCIÓN': 'estado_direccion',
    'ESTADO CIVIL': 'estado_civil',
    'NACIONALIDAD': 'nacionalidad',
  }

  function formatExcelDate(value: unknown): string | null {
    if (value == null || value === '') return null
    // Si es número (serial date de Excel), convertir
    if (typeof value === 'number') {
      const date = new Date((value - 25569) * 86400 * 1000)
      if (!isNaN(date.getTime())) {
        const y = date.getUTCFullYear()
        // Descartar años inválidos (muy antiguos o futuros lejanos)
        if (y < 1900 || y > 2100) return null
        return date.toISOString().split('T')[0]
      }
      return null
    }
    // Si es string, intentar parsear
    if (typeof value === 'string') {
      const s = value.trim()
      // Descartar basura evidente (guiones, letras sueltas, símbolos)
      if (s.length < 6 || /^[^0-9]+$/.test(s)) return null
      // Intentar parsear dd/mm/yyyy o d/m/yyyy (con posibles errores de formato)
      const match = s.match(/^(\d{1,2})\/?(\d{1,2})\/?(\d{2,5})$/)
      if (match) {
        const day = parseInt(match[1])
        const month = parseInt(match[2])
        let year = parseInt(match[3])
        // Corregir años con dígitos extra (ej: 20025 → 2025, 0205 → 2005)
        if (year > 2100) year = parseInt(String(year).substring(0, 4))
        if (year < 100) year += 2000
        if (year < 1900 || year > 2100) return null
        if (month < 1 || month > 12) return null
        if (day < 1 || day > 31) return null
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      }
      // Intentar formato ISO directo
      const d = new Date(s)
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear()
        if (y >= 1900 && y <= 2100) return d.toISOString().split('T')[0]
      }
      // Si no se puede parsear, devolver null en vez de un string inválido
      return null
    }
    return null
  }

  function normalizeExcelValue(dbCol: string, value: unknown): unknown {
    if (value == null || value === '') return null
    // Columnas que son fechas
    const dateCols = ['fecha_carga', 'fecha_de_nacimiento', 'vencimiento_licencia', 'fecha_rnr', 'fecha_de_inicio']
    if (dateCols.includes(dbCol)) return formatExcelDate(value)
    // Columnas numéricas
    if (dbCol === 'edad') {
      const n = typeof value === 'number' ? value : Number(value)
      return !isNaN(n) && n > 0 && n < 150 ? n : null
    }
    // Lat/Lng: pueden venir como enteros sin punto decimal (ej: -347790167 → -34.7790167)
    if (dbCol === 'latitud' || dbCol === 'longitud') {
      let n = typeof value === 'number' ? value : Number(value)
      if (isNaN(n)) return null
      // Si el valor absoluto es mayor a 180, probablemente le falta el punto decimal
      if (Math.abs(n) > 180) {
        // Normalizar: dividir progresivamente hasta que esté en rango válido
        while (Math.abs(n) > 180) n = n / 10
      }
      return n
    }
    // CBU puede venir como número científico, siempre guardar como string
    if (dbCol === 'cbu') {
      if (typeof value === 'number') {
        try { return BigInt(Math.round(value)).toString() } catch { return String(value) }
      }
      return String(value).trim()
    }
    // CUIT y DNI siempre como string
    if (dbCol === 'cuit' || dbCol === 'dni') return String(value).trim()
    // Campo 'licencia' del lead: SIEMPRE solo 'Si', 'No' o null
    // - 'NO' / 'NÓ' / 'FALSE' / '0' (cualquier capitalización) → 'No'
    // - Cualquier otro valor con contenido (incluso códigos como 'A1.4', 'D1') → 'Si'
    //   (la presencia de texto/categoría implica que tiene licencia)
    if (dbCol === 'licencia') {
      if (typeof value === 'boolean') return value ? 'Si' : 'No'
      const s = String(value).trim()
      if (!s) return null
      const upper = s.toUpperCase()
      if (upper === 'NO' || upper === 'NÓ' || upper === 'FALSE' || upper === '0') return 'No'
      return 'Si'
    }
    // Columnas boolean en la DB: convertir "Si"/"No"/"TRUE"/"FALSE" a true/false
    const boolCols = ['verificacion_emergencia', 'antecedentes_penales', 'acepta_oferta', 'cerrado_timeout_wpp']
    if (boolCols.includes(dbCol)) {
      if (typeof value === 'boolean') return value
      const s = String(value).trim().toUpperCase()
      if (s === 'SI' || s === 'SÍ' || s === 'TRUE' || s === '1') return true
      if (s === 'NO' || s === 'FALSE' || s === '0') return false
      return null
    }
    return String(value).trim()
  }

  async function handleCargaMasiva(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset el input para permitir cargar el mismo archivo de nuevo
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!file) return

    try {
      // Mostrar loading mientras se lee y procesa el archivo
      Swal.fire({
        title: 'Leyendo archivo...',
        html: `<p>${file.name}</p>`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      })
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      let jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })

      if (jsonData.length === 0) {
        Swal.fire('Error', 'El archivo está vacío o no tiene datos.', 'error')
        return
      }

      // Detectar si la primera fila es un título/banner (headers son todos __EMPTY)
      // En ese caso, re-parsear saltando la primera fila para que los headers reales se usen
      const rawHeaders = Object.keys(jsonData[0])
      const allEmpty = rawHeaders.every(h => h.startsWith('__EMPTY') || h.trim() === '' || h === 'null')
      if (allEmpty && jsonData.length > 1) {
        jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, range: 1 })
        if (jsonData.length === 0) {
          Swal.fire('Error', 'El archivo está vacío o no tiene datos.', 'error')
          return
        }
      }

      Swal.close() // Cerrar loading de lectura

      // Obtener headers del Excel, trimear espacios (excluir columnas vacías, null, y __EMPTY)
      const excelHeadersRaw = Object.keys(jsonData[0]).filter(h =>
        h != null && h !== 'null' && h.trim() !== '' && !h.startsWith('__EMPTY')
      )
      // Crear mapa de header trimmed -> header original para acceder a los datos
      const headerTrimMap = new Map<string, string>()
      for (const h of excelHeadersRaw) {
        headerTrimMap.set(h.trim(), h)
      }
      const excelHeaders = [...headerTrimMap.keys()]

      // Re-mapear jsonData para usar headers trimmed
      jsonData = jsonData.map(row => {
        const newRow: Record<string, unknown> = {}
        for (const [trimmed, original] of headerTrimMap.entries()) {
          newRow[trimmed] = row[original]
        }
        return newRow
      })

      // Detectar formato usando columnas EXCLUSIVAS de cada formato
      // Damaro tiene: NOMBRE, CIUDAD, CELULAR, FEEDBACK DAMARO (no existen en Original)
      // Original tiene: NOMBRE CANDIDATO, CONTACTO, PROCESO (no existen en Damaro)
      const headersNorm = excelHeaders.map(h => h.trim().toUpperCase())
      const columnasExclusivasDamaro = ['NOMBRE', 'CELULAR', 'CIUDAD', 'FEEDBACK DAMARO']
      const isDamaro = columnasExclusivasDamaro.some(c => headersNorm.includes(c.toUpperCase()))
      const originalKeys = Object.keys(EXCEL_TO_DB_MAP)

      // Para formato Damaro: solo validar que haya al menos NOMBRE o DNI (los campos son flexibles)
      // Para formato Original: validación estricta como antes
      if (isDamaro) {
        const tieneNombre = headersNorm.includes('NOMBRE')
        const tieneDni = headersNorm.includes('DNI')
        if (!tieneNombre && !tieneDni) {
          Swal.fire('Error', 'El archivo formato Damaro debe tener al menos la columna NOMBRE o DNI.', 'error')
          return
        }
      } else {
        const columnasNoReconocidas = excelHeaders.filter(h => !originalKeys.includes(h))
        const columnasFaltantes = originalKeys.filter(h => !excelHeaders.includes(h))

        if (columnasNoReconocidas.length > 0 || columnasFaltantes.length > 0) {
          let html = '<div style="text-align: left; font-size: 13px; max-height: 350px; overflow-y: auto;">'
          html += '<p style="font-weight: 600; color: #2563EB; margin-bottom: 8px;">Formato detectado: <strong>Original</strong></p>'
          if (columnasNoReconocidas.length > 0) {
            html += '<p style="font-weight: 600; color: #EF4444; margin-bottom: 6px;">Columnas no reconocidas en el Excel:</p>'
            html += '<ul style="margin: 0 0 12px 0; padding-left: 20px;">'
            html += columnasNoReconocidas.map(c => `<li>${c}</li>`).join('')
            html += '</ul>'
          }
          if (columnasFaltantes.length > 0) {
            html += '<p style="font-weight: 600; color: #F59E0B; margin-bottom: 6px;">Columnas faltantes en el Excel:</p>'
            html += '<ul style="margin: 0 0 12px 0; padding-left: 20px;">'
            html += columnasFaltantes.map(c => `<li>${c}</li>`).join('')
            html += '</ul>'
          }
          html += '<p style="color: #6B7280; margin-top: 8px;">Todas las columnas del Excel deben coincidir exactamente con el formato esperado.</p>'
          html += '</div>'

          Swal.fire({
            title: 'Columnas incorrectas',
            html,
            icon: 'error',
            confirmButtonText: 'Entendido',
            width: 520,
          })
          return
        }
      }

      // Mapear datos Excel → DB (excluyendo filas completamente vacías)
      // Para Damaro: crear mapa de header real del Excel -> header esperado (case-insensitive)
      let resolveHeader: (key: string) => string | undefined
      if (isDamaro) {
        const headerMap = new Map<string, string>()
        for (const realHeader of excelHeaders) {
          const upper = realHeader.trim().toUpperCase()
          for (const damaroKey of Object.keys(DAMARO_TO_DB_MAP)) {
            if (upper === damaroKey.toUpperCase()) {
              headerMap.set(damaroKey, realHeader)
              break
            }
          }
        }
        resolveHeader = (key: string) => headerMap.get(key)
      } else {
        resolveHeader = (key: string) => key
      }

      const nombreCol = isDamaro ? (resolveHeader('NOMBRE') || 'NOMBRE') : 'NOMBRE CANDIDATO'
      const dniCol = isDamaro ? (resolveHeader('DNI') || 'DNI') : 'N° DNI'
      const activeMap = isDamaro ? DAMARO_TO_DB_MAP : EXCEL_TO_DB_MAP

      const dbRows = jsonData
        .filter(row => {
          const nombre = row[nombreCol]
          const dni = row[dniCol]
          return (nombre != null && String(nombre).trim() !== '') ||
                 (dni != null && String(dni).trim() !== '')
        })
        .map(row => {
          const dbRow: Record<string, unknown> = {}
          for (const [excelCol, dbCol] of Object.entries(activeMap)) {
            if (dbCol === '_feedback_damaro') continue
            const realCol = isDamaro ? resolveHeader(excelCol) : excelCol
            if (!realCol || !(realCol in row)) continue
            dbRow[dbCol] = normalizeExcelValue(dbCol, row[realCol])
          }

          // Formato Damaro: concatenar FEEDBACK DAMARO en observaciones y setear fuente
          if (isDamaro) {
            const obsCol = resolveHeader('OBSERVACIONES')
            const feedbackCol = resolveHeader('FEEDBACK DAMARO')
            const obs = obsCol && row[obsCol] != null ? String(row[obsCol]).trim() : ''
            const feedback = feedbackCol && row[feedbackCol] != null ? String(row[feedbackCol]).trim() : ''
            if (obs && feedback) {
              dbRow.observaciones = `${obs}\n\nFeedback Damaro: ${feedback}`
            } else if (feedback) {
              dbRow.observaciones = `Feedback Damaro: ${feedback}`
            } else if (obs) {
              dbRow.observaciones = obs
            }
            dbRow.fuente_de_lead = 'DAMARO'
            dbRow.estado_de_lead = 'Apto - Hireflix'
          }

          // Asignar sede: para Damaro usar CIUDAD para buscar la sede correcta
          if (isDamaro) {
            const ciudadCol = resolveHeader('CIUDAD')
            const ciudad = ciudadCol && row[ciudadCol] ? String(row[ciudadCol]).trim().toLowerCase() : ''
            if (ciudad) {
              const sedeMatch = sedes.find(s => s.nombre?.toLowerCase() === ciudad || s.codigo?.toLowerCase() === ciudad)
              if (sedeMatch) {
                dbRow.sede_id = sedeMatch.id
                dbRow.sede = sedeMatch.nombre
              } else {
                // Si no matchea ninguna sede, guardar el texto y dejar sin sede_id para que se asigne después
                dbRow.sede = ciudadCol ? String(row[ciudadCol]).trim() : ''
              }
            } else if (sedeActual?.id) {
              dbRow.sede_id = sedeActual.id
              dbRow.sede = sedeActual.nombre
            }
          } else {
            if (sedeActual?.id) {
              dbRow.sede_id = sedeActual.id
              dbRow.sede = sedeActual.nombre
            }
          }

          // Calcular edad automáticamente si hay fecha de nacimiento y no hay edad
          if (dbRow.fecha_de_nacimiento && !dbRow.edad) {
            const fechaStr = String(dbRow.fecha_de_nacimiento)
            const nac = new Date(fechaStr + 'T00:00:00')
            if (!isNaN(nac.getTime())) {
              const hoy = new Date()
              let edad = hoy.getFullYear() - nac.getFullYear()
              if (hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) {
                edad--
              }
              if (edad >= 0 && edad < 150) dbRow.edad = edad
            }
          }

          // Formatear teléfono con prefijo argentino +549
          if (dbRow.phone) {
            dbRow.phone = formatPhoneAR(dbRow.phone)
          }
          if (dbRow.whatsapp_number) {
            dbRow.whatsapp_number = formatPhoneAR(dbRow.whatsapp_number)
          }

          return dbRow
        })

      if (dbRows.length === 0) {
        Swal.fire('Error', 'No se encontraron filas con datos válidos en el archivo.', 'error')
        return
      }

      // ─── Validar DNI obligatorio ───
      const sinDni = dbRows
        .map((r, idx) => ({ idx: idx + 1, nombre: String(r.nombre_completo || r.nombre_completo_2 || 'Sin nombre'), dni: String(r.dni || '').trim() }))
        .filter(r => !r.dni || r.dni === 'null')
      if (sinDni.length > 0) {
        const listaItems = sinDni.length <= 30
          ? sinDni.map(r => `<li>Fila ${r.idx}: <strong>${r.nombre}</strong></li>`).join('')
          : sinDni.slice(0, 30).map(r => `<li>Fila ${r.idx}: <strong>${r.nombre}</strong></li>`).join('')
            + `<li style="color:#9CA3AF;">... y ${sinDni.length - 30} más</li>`
        Swal.fire({
          title: `${sinDni.length} lead${sinDni.length > 1 ? 's' : ''} sin DNI`,
          html: `
            <div style="text-align:left;font-size:13px;">
              <p style="margin-bottom:8px;color:#6B7280;">Todos los leads deben tener DNI para poder ser cargados.</p>
              <div style="max-height:280px;overflow-y:auto;">
                <ul style="margin:0;padding-left:20px;list-style:disc;">${listaItems}</ul>
              </div>
              <p style="margin-top:12px;color:#EF4444;font-weight:600;">Corrige el archivo y vuelve a intentar.</p>
            </div>
          `,
          icon: 'error',
          confirmButtonText: 'Entendido',
          width: 520,
        })
        return
      }

      // ─── Detectar duplicados por DNI ───
      Swal.fire({
        title: 'Verificando duplicados...',
        html: '<p>Comparando registros con la base de datos</p>',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      })
      const excelDnis = dbRows
        .map(r => String(r.dni || '').trim())
        .filter(d => d !== '' && d !== 'null')
      const uniqueExcelDnis = [...new Set(excelDnis)]

      let duplicados: { dni: string; nombre: string }[] = []

      if (uniqueExcelDnis.length > 0) {
        // Consultar en batches de 100 DNIs (límite de Supabase para .in())
        const existingDnis = new Map<string, string>()
        for (let i = 0; i < uniqueExcelDnis.length; i += 100) {
          const dniBatch = uniqueExcelDnis.slice(i, i + 100)
          const { data: existentes } = await supabase
            .from('leads')
            .select('dni, nombre_completo')
            .in('dni', dniBatch)
          if (existentes) {
            for (const e of existentes) {
              if (e.dni) existingDnis.set(String(e.dni).trim(), e.nombre_completo || 'Sin nombre')
            }
          }
        }

        duplicados = uniqueExcelDnis
          .filter(d => existingDnis.has(d))
          .map(d => ({ dni: d, nombre: existingDnis.get(d) || 'Sin nombre' }))
      }

      Swal.close() // Cerrar loading de verificación

      // Variable para controlar el modo de inserción
      let modoInsercion: 'insertar' | 'reemplazar' | 'duplicar' = 'insertar'

      if (duplicados.length > 0) {
        // Mostrar lista de duplicados con opciones
        const listaHtml = duplicados.length <= 20
          ? duplicados.map(d => `<li><strong>${d.nombre}</strong> — DNI: ${d.dni}</li>`).join('')
          : duplicados.slice(0, 20).map(d => `<li><strong>${d.nombre}</strong> — DNI: ${d.dni}</li>`).join('')
            + `<li style="color: var(--text-tertiary);">... y ${duplicados.length - 20} más</li>`

        const dupResult = await Swal.fire({
          title: `${duplicados.length} lead${duplicados.length > 1 ? 's' : ''} ya existe${duplicados.length > 1 ? 'n' : ''} en la base de datos`,
          html: `
            <div style="text-align: left; font-size: 13px; max-height: 300px; overflow-y: auto;">
              <p style="margin-bottom: 8px; color: #6B7280;">Los siguientes leads del Excel ya están registrados:</p>
              <ul style="margin: 0 0 12px 0; padding-left: 20px; list-style: disc;">${listaHtml}</ul>
              <p style="margin-top: 12px; color: #6B7280; font-size: 12px;">
                Total en el archivo: <strong>${dbRows.length}</strong> registros
                (${dbRows.length - duplicados.length} nuevos + ${duplicados.length} duplicados)
              </p>
            </div>
          `,
          icon: 'warning',
          showCancelButton: true,
          showDenyButton: true,
          confirmButtonColor: '#10B981',
          denyButtonColor: '#3B82F6',
          confirmButtonText: 'Subir y reemplazar',
          denyButtonText: 'Subir y duplicar',
          cancelButtonText: 'Cancelar subida',
          width: 540,
        })

        if (dupResult.isDismissed) return
        modoInsercion = dupResult.isConfirmed ? 'reemplazar' : 'duplicar'
      } else {
        // Sin duplicados — confirmar carga normal
        const confirmResult = await Swal.fire({
          title: '¿Estás seguro que quieres subir los datos?',
          html: `<p style="font-size: 14px;">Se cargarán <strong>${jsonData.length.toLocaleString()}</strong> registros a la base de datos.</p>`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonColor: '#10B981',
          confirmButtonText: 'Sí, subir datos',
          cancelButtonText: 'Cancelar',
        })
        if (!confirmResult.isConfirmed) return
      }

      // ─── Ejecutar inserción según modo ───
      const duplicadoDnis = new Set(duplicados.map(d => d.dni))
      const rowsNuevos = duplicadoDnis.size > 0
        ? dbRows.filter(r => !duplicadoDnis.has(String(r.dni || '').trim()))
        : dbRows
      const rowsDuplicados = duplicadoDnis.size > 0
        ? dbRows.filter(r => duplicadoDnis.has(String(r.dni || '').trim()))
        : []

      const BATCH_SIZE = 500
      let insertados = 0
      let actualizados = 0
      let errores = 0
      const erroresDetalle: string[] = [] // Guardar errores descriptivos (max 10)
      const totalOps = modoInsercion === 'reemplazar'
        ? rowsNuevos.length + rowsDuplicados.length
        : dbRows.length

      Swal.fire({
        title: 'Cargando datos...',
        html: `<p>Procesando 0 de ${totalOps} registros</p>`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      })

      // Insertar registros nuevos
      const rowsToInsert = modoInsercion === 'reemplazar' ? rowsNuevos : dbRows
      for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
        const batch = rowsToInsert.slice(i, i + BATCH_SIZE)
        const { error: insertError } = await supabase.from('leads').insert(batch as any)
        if (insertError) {
          console.error(`[CargaMasiva] Error en batch insert ${i}:`, insertError)
          // Si el batch falla, reintentar las primeras filas para identificar el error
          // y marcar el resto como error sin reintentarlas (para no demorar)
          const maxRetry = Math.min(batch.length, erroresDetalle.length < 10 ? 20 : 0)
          for (let j = 0; j < batch.length; j++) {
            if (j < maxRetry) {
              const { error: rowError } = await supabase.from('leads').insert(batch[j] as any)
              if (rowError) {
                errores++
                if (erroresDetalle.length < 10) {
                  const nombre = batch[j].nombre_completo || 'Sin nombre'
                  const dni = batch[j].dni || 'Sin DNI'
                  erroresDetalle.push(`<strong>${nombre}</strong> (DNI: ${dni}): ${rowError.message}`)
                }
              } else {
                insertados++
              }
            } else {
              errores++
            }
          }
        } else {
          insertados += batch.length
        }
        Swal.update({
          html: `<p>Procesando ${Math.min(insertados + actualizados + errores, totalOps)} de ${totalOps} registros</p>`,
        })
      }

      // Si modo "reemplazar", actualizar los duplicados por DNI
      if (modoInsercion === 'reemplazar' && rowsDuplicados.length > 0) {
        for (const row of rowsDuplicados) {
          const dni = String(row.dni || '').trim()
          if (!dni) continue
          const updateFields: Record<string, unknown> = { ...row, updated_at: new Date().toISOString() }
          delete updateFields.dni // No actualizar el campo clave
          const { error: updateError } = await supabase
            .from('leads')
            .update(updateFields as any)
            .eq('dni', dni)
          if (updateError) {
            console.error(`[CargaMasiva] Error al actualizar DNI ${dni}:`, updateError)
            errores++
            if (erroresDetalle.length < 10) {
              const nombre = String(row.nombre_completo || 'Sin nombre')
              erroresDetalle.push(`<strong>${nombre}</strong> (DNI: ${dni}): ${updateError.message}`)
            }
          } else {
            actualizados++
          }
          if ((actualizados + errores) % 50 === 0) {
            Swal.update({
              html: `<p>Procesando ${insertados + actualizados + errores} de ${totalOps} registros</p>`,
            })
          }
        }
      }

      Swal.close()

      // Resultado final
      if (errores > 0) {
        const detalleHtml = erroresDetalle.length > 0
          ? `<div style="margin-top: 12px; padding: 10px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px; font-size: 12px; color: #991B1B; text-align: left; max-height: 200px; overflow-y: auto;">
              <p style="font-weight: 600; margin-bottom: 6px;">Detalle de errores:</p>
              <ul style="margin: 0; padding-left: 16px; list-style: disc;">
                ${erroresDetalle.map(e => `<li style="margin-bottom: 4px; word-break: break-word;">${e}</li>`).join('')}
              </ul>
              ${errores > erroresDetalle.length ? `<p style="margin-top: 6px; color: #9CA3AF;">...y ${errores - erroresDetalle.length} errores más</p>` : ''}
            </div>`
          : ''

        Swal.fire({
          title: insertados > 0 || actualizados > 0 ? 'Carga parcial' : 'Error en la carga',
          html: `
            <div style="font-size: 14px; text-align: left;">
              ${insertados > 0 ? `<p>Insertados: <strong>${insertados}</strong></p>` : ''}
              ${actualizados > 0 ? `<p>Actualizados: <strong>${actualizados}</strong></p>` : ''}
              <p style="color: #EF4444;">Errores: <strong>${errores}</strong></p>
              ${detalleHtml}
            </div>
          `,
          icon: 'warning',
          width: 560,
        })
      } else {
        const resumenParts = []
        if (insertados > 0) resumenParts.push(`<strong>${insertados.toLocaleString()}</strong> insertados`)
        if (actualizados > 0) resumenParts.push(`<strong>${actualizados.toLocaleString()}</strong> actualizados`)

        await Swal.fire({
          title: 'Carga exitosa',
          html: `<p style="font-size: 14px;">${resumenParts.join(' y ')} correctamente.</p>`,
          icon: 'success',
          confirmButtonColor: '#10B981',
        })
      }

      loadLeads()
    } catch (err) {
      Swal.close()
      const msg = err instanceof Error ? err.message : 'Error al procesar el archivo'
      Swal.fire('Error', msg, 'error')
    }
  }

  // ---------- STAT CARD CLICK ----------
  function handleStatClick(card: string) {
    setActiveStatCard(prev => prev === card ? null : card)
  }

  // ---------- COLUMNS ----------
  const columns = useMemo<ColumnDef<Lead>[]>(() => [
    {
      id: 'fecha_creacion',
      accessorFn: (row) => row.created_at,
      header: 'Creación',
      cell: ({ row }) => formatDate(row.original.created_at),
      size: 120,
      enableSorting: true,
    },
    {
      id: 'nombre',
      accessorFn: (row) => row.nombre_completo || '-',
      size: 260,
      maxSize: 300,
      header: () => (
        <ExcelColumnFilter
          label="Candidato"
          options={uniqueNombres}
          selectedValues={nombreFilter}
          onSelectionChange={setNombreFilter}
          filterId="lead_nombre"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const nombre = (row.original.nombre_completo || '-').toUpperCase()
        const dni = row.original.dni || ''
        const phone = row.original.phone || ''
        const direccion = row.original.direccion || ''
        const zonaRestringida = leadsEnZona.get(row.original.id)
        const enZonaRestringida = !!zonaRestringida
        const tieneCoordenadas = row.original.latitud != null && row.original.longitud != null

        return (
          <div
            title={enZonaRestringida ? `Zona Restringida: ${zonaRestringida}` : tieneCoordenadas ? 'Zona Aprobada' : undefined}
            style={{
              background: enZonaRestringida ? 'var(--badge-red-bg)' : undefined,
              borderLeft: enZonaRestringida ? '3px solid var(--color-primary)' : undefined,
              padding: '6px 8px',
              borderRadius: '6px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <a
                href={`/leads?id=${row.original.id}`}
                onClick={(e) => {
                  if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault()
                    handleOpenDetails(row.original)
                  }
                }}
                title={nombre}
                style={{
                  fontWeight: 600, color: enZonaRestringida ? 'var(--badge-red-text)' : 'var(--text-primary)',
                  textDecoration: 'none', fontSize: '13px',
                  display: 'block', maxWidth: '240px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {nombre}
              </a>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                {dni ? `DNI: ${dni}` : ''}{dni && phone ? ' · ' : ''}{phone ? phone : ''}
              </span>
              {enZonaRestringida && (
                <span
                  className="lead-zona-badge"
                  style={{
                    fontSize: '9px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 600,
                    marginTop: '2px',
                    display: 'inline-block',
                    background: 'var(--badge-red-bg)',
                    color: 'var(--badge-red-text)',
                    width: 'fit-content',
                    cursor: 'default',
                    position: 'relative',
                  }}
                  data-tooltip={direccion || undefined}
                >
                  ⚠ Zona Restringida: {zonaRestringida}
                </span>
              )}
              {tieneCoordenadas && !enZonaRestringida && (
                <span
                  className="lead-zona-badge"
                  style={{
                    fontSize: '9px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 600,
                    marginTop: '2px',
                    display: 'inline-block',
                    background: 'var(--badge-green-bg)',
                    color: 'var(--badge-green-text)',
                    width: 'fit-content',
                    cursor: 'default',
                    position: 'relative',
                  }}
                  data-tooltip={direccion || undefined}
                >
                  ✓ Zona Aprobada
                </span>
              )}
            </div>
          </div>
        )
      },
      meta: { expand: true },
      enableSorting: true,
    },
    {
      id: 'estado',
      accessorFn: (row) => row.estado_de_lead || '-',
      header: () => (
        <ExcelColumnFilter
          label="Estado"
          options={[...ESTADOS_LEAD]}
          selectedValues={estadoFilter}
          onSelectionChange={setEstadoFilter}
          filterId="lead_estado"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const lead = row.original
        const estado = lead.estado_de_lead
        const isOpen = estadoDropdownId === lead.id

        const badgeClass = estado
          ? `lead-estado-badge lead-estado-${estado.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s/g, '-')}`
          : ''

        return (
          <EstadoDropdownCell
            leadId={lead.id}
            estado={estado}
            badgeClass={badgeClass}
            isOpen={isOpen}
            canEdit={canEdit}
            onToggle={(id) => setEstadoDropdownId(isOpen ? null : id)}
            estados={ESTADOS_LEAD as unknown as string[]}
            onChangeEstado={handleChangeEstadoInline}
            onClose={() => setEstadoDropdownId(null)}
          />
        )
      },
      size: 130,
      enableSorting: true,
    },
    /* Columnas Proceso y Entrevista IA ocultas */
    /* Columna Disponibilidad oculta */
    {
      id: 'zona',
      accessorFn: (row) => row.zona || '-',
      header: () => (
        <ExcelColumnFilter
          label="Zona"
          options={uniqueZonas}
          selectedValues={zonaFilter}
          onSelectionChange={setZonaFilter}
          filterId="lead_zona"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => row.original.zona || '-',
      size: 90,
      enableSorting: true,
    },
    {
      id: 'turno',
      accessorFn: (row) => normalizarTurno(row.turno),
      header: () => (
        <ExcelColumnFilter
          label="Turno"
          options={uniqueTurnos}
          selectedValues={turnoFilter}
          onSelectionChange={setTurnoFilter}
          filterId="lead_turno"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => normalizarTurno(row.original.turno),
      size: 90,
      enableSorting: true,
    },
    {
      id: 'licencia',
      accessorFn: (row) => row.licencia || '-',
      header: 'Licencia',
      cell: ({ row }) => (
        <SiNoDropdownCell
          leadId={row.original.id}
          field="licencia"
          value={row.original.licencia}
          isOpen={sinoDropdownKey === `${row.original.id}::licencia`}
          canEdit={canEdit}
          onToggle={(k) => setSinoDropdownKey(sinoDropdownKey === k ? null : k)}
          onChange={handleInlineUpdate}
          onClose={() => setSinoDropdownKey(null)}
        />
      ),
      size: 70,
      enableSorting: true,
    },
    {
      id: 'fuente',
      accessorFn: (row) => row.fuente_de_lead || '-',
      header: 'Fuente',
      cell: ({ row }) => {
        const v = row.original.fuente_de_lead || '-'
        return <span style={{ fontSize: '11px', textTransform: 'uppercase' }}>{v}</span>
      },
      size: 90,
      enableSorting: true,
    },
    {
      id: 'email',
      accessorFn: (row) => row.email || '-',
      header: 'Email',
      cell: ({ row }) => {
        const v = row.original.email || '-'
        return <span style={{ fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: '160px' }} title={v}>{v}</span>
      },
      size: 170,
      enableSorting: true,
    },
    {
      id: 'telefono',
      accessorFn: (row) => row.phone || '-',
      header: 'Teléfono',
      cell: ({ row }) => {
        const v = row.original.phone || '-'
        return <span style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>{v}</span>
      },
      size: 130,
      enableSorting: true,
    },
    {
      id: 'edad',
      accessorFn: (row) => row.edad ?? '-',
      header: 'Edad',
      cell: ({ row }) => {
        const v = row.original.edad
        return <span style={{ fontSize: '11px' }}>{v != null ? v : '-'}</span>
      },
      size: 60,
      enableSorting: true,
    },
    {
      id: 'entrevistador',
      accessorFn: (row) => row.entrevistador_asignado || '-',
      header: 'Guia',
      cell: ({ row }) => {
        const v = row.original.entrevistador_asignado || '-'
        return <span style={{ fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: '100px' }} title={v}>{v}</span>
      },
      size: 110,
      enableSorting: true,
    },
    /* Columna Fase oculta */
    /* Columna Hireflix oculta */
    {
      id: 'exp_manejo',
      accessorFn: (row) => row.experiencia_previa || '-',
      header: 'Exp. Manejo',
      cell: ({ row }) => <span style={{ fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: '80px' }} title={row.original.experiencia_previa || ''}>{row.original.experiencia_previa || '-'}</span>,
      size: 85,
      enableSorting: true,
    },
    /* Columna D1 oculta */
    {
      id: 'rnr',
      accessorFn: (row) => row.rnr || '-',
      header: 'RNR',
      cell: ({ row }) => (
        <SiNoDropdownCell
          leadId={row.original.id}
          field="rnr"
          value={row.original.rnr}
          isOpen={sinoDropdownKey === `${row.original.id}::rnr`}
          canEdit={canEdit}
          onToggle={(k) => setSinoDropdownKey(sinoDropdownKey === k ? null : k)}
          onChange={handleInlineUpdate}
          onClose={() => setSinoDropdownKey(null)}
        />
      ),
      size: 55,
      enableSorting: true,
    },
    {
      id: 'cert_dir',
      accessorFn: (row) => row.certificado_direccion || '-',
      header: 'Cert. Dir.',
      cell: ({ row }) => (
        <SiNoDropdownCell
          leadId={row.original.id}
          field="certificado_direccion"
          value={row.original.certificado_direccion}
          isOpen={sinoDropdownKey === `${row.original.id}::certificado_direccion`}
          canEdit={canEdit}
          onToggle={(k) => setSinoDropdownKey(sinoDropdownKey === k ? null : k)}
          onChange={handleInlineUpdate}
          onClose={() => setSinoDropdownKey(null)}
        />
      ),
      size: 70,
      enableSorting: true,
    },
    {
      id: 'cta_cabify',
      accessorFn: (row) => row.cuenta_cabify || '-',
      header: 'Cta. Cabify',
      cell: ({ row }) => (
        <EditableTextCell
          leadId={row.original.id}
          field="cuenta_cabify"
          value={row.original.cuenta_cabify}
          canEdit={canEdit}
          onChange={handleInlineUpdate}
          maxWidth="80px"
        />
      ),
      size: 85,
      enableSorting: true,
    },
    {
      id: 'cochera',
      accessorFn: (row) => row.cochera || '-',
      header: 'Cochera',
      cell: ({ row }) => (
        <SiNoDropdownCell
          leadId={row.original.id}
          field="cochera"
          value={row.original.cochera}
          isOpen={sinoDropdownKey === `${row.original.id}::cochera`}
          canEdit={canEdit}
          onToggle={(k) => setSinoDropdownKey(sinoDropdownKey === k ? null : k)}
          onChange={handleInlineUpdate}
          onClose={() => setSinoDropdownKey(null)}
        />
      ),
      size: 70,
      enableSorting: true,
    },
    {
      id: 'monotributo',
      accessorFn: (row) => row.monotributo || '-',
      header: 'Mono.',
      cell: ({ row }) => (
        <SiNoDropdownCell
          leadId={row.original.id}
          field="monotributo"
          value={row.original.monotributo}
          isOpen={sinoDropdownKey === `${row.original.id}::monotributo`}
          canEdit={canEdit}
          onToggle={(k) => setSinoDropdownKey(sinoDropdownKey === k ? null : k)}
          onChange={handleInlineUpdate}
          onClose={() => setSinoDropdownKey(null)}
        />
      ),
      size: 55,
      enableSorting: true,
    },
    /* Columna Guia oculta */
    /* Columna Fecha Entrevista oculta */
    {
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      size: 60,
      cell: ({ row }) => {
        const lead = row.original
        const tieneFolder = !!lead.url_folder?.trim()
        const tieneConversacion = !!lead.id_conversation?.trim()
        const actions: Array<{ label: string; icon: React.ReactElement; onClick: () => void; variant?: 'default' | 'info' | 'success' | 'warning' | 'danger'; disabled?: boolean }> = []
        if (canEdit) {
          actions.push({ label: 'Editar', icon: <Edit2 size={15} />, onClick: () => handleOpenEdit(lead), variant: 'info' })
        }
        actions.push(
          { label: 'Ver detalle', icon: <Eye size={15} />, onClick: () => handleOpenDetails(lead) },
          {
            label: 'Abrir conversación',
            icon: <MessageCircle size={15} />,
            onClick: () => { if (tieneConversacion) window.open(`https://app.intercom.com/a/inbox/ogv74k5c/inbox/conversation/${lead.id_conversation}`, '_blank') },
            variant: tieneConversacion ? 'info' : undefined,
            disabled: !tieneConversacion,
          },
        )
        actions.push({
          label: 'Documentos',
          icon: <FolderOpen size={15} />,
          onClick: () => { if (tieneFolder) window.open(lead.url_folder!, '_blank') },
          variant: tieneFolder ? 'success' : undefined,
          disabled: !tieneFolder,
        })
        if (canEdit && lead.proceso !== 'Convertido') {
          actions.push({ label: 'Convertir a Conductor', icon: <UserPlus size={15} />, onClick: () => handleConvertir(lead), variant: 'success' })
        }
        if (canDelete) {
          actions.push({ label: 'Eliminar', icon: <Trash2 size={15} />, onClick: () => handleOpenDelete(lead), variant: 'danger' })
        }
        return <ActionsMenu actions={actions} />
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [uniqueNombres, nombreFilter, estadoFilter, uniqueDisponibilidades, disponibilidadFilter, uniqueZonas, zonaFilter, uniqueTurnos, turnoFilter, openFilterId, canEdit, canDelete, leadsEnZona, estadoDropdownId, sinoDropdownKey])

  // ---------- EXTERNAL FILTERS (chips) ----------
  const hasActiveFilters = nombreFilter.length > 0 || estadoFilter.length > 0 ||
    zonaFilter.length > 0 || turnoFilter.length > 0 || disponibilidadFilter.length > 0 || fuenteFilter.length > 0 || activeStatCard !== null

  function clearAllFilters() {
    setNombreFilter([])
    setEstadoFilter([])
    setZonaFilter([])
    setTurnoFilter([])
    setDisponibilidadFilter([])
    setFuenteFilter([])
    setActiveStatCard(null)
  }

  const externalFilters = useMemo(() => {
    if (!hasActiveFilters) return undefined
    const filters: Array<{ id: string; label: string; onClear: () => void }> = []
    const addFilters = (values: string[], labelPrefix: string, setter: (v: string[]) => void) => {
      values.forEach(val => {
        filters.push({
          id: `${labelPrefix}-${val}`,
          label: `${labelPrefix}: ${val}`,
          onClear: () => setter(values.filter(v => v !== val)),
        })
      })
    }
    addFilters(nombreFilter, 'Candidato', setNombreFilter)
    addFilters(zonaFilter, 'Zona', setZonaFilter)
    addFilters(turnoFilter, 'Turno', setTurnoFilter)
    addFilters(disponibilidadFilter, 'Disponibilidad', setDisponibilidadFilter)
    addFilters(fuenteFilter, 'Fuente', setFuenteFilter)
    addFilters(estadoFilter, 'Estado', setEstadoFilter)
    if (activeStatCard) {
      const labelMap: Record<string, string> = {
        inicio: 'Inicio conversación',
        aptos: 'Aptos',
        noAptos: 'No aptos',
        zonaSegura: 'Zona Aprobada',
        zonaRestringida: 'Zona Restringida',
        autoPueblo: 'Auto del pueblo',
        descartados: 'Descartados',
      }
      filters.push({
        id: `stat-${activeStatCard}`,
        label: labelMap[activeStatCard] || activeStatCard,
        onClear: () => setActiveStatCard(null),
      })
    }
    return filters
  }, [hasActiveFilters, nombreFilter, zonaFilter, turnoFilter, disponibilidadFilter, fuenteFilter, estadoFilter, activeStatCard])

  // ---------- RENDER ----------
  return (
    <div className="leads-module">
      <LoadingOverlay show={loading} message="Cargando leads..." size="lg" />

      {/* Stats */}
      <div className="leads-stats">
        <div className="leads-stats-grid">
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'inicio' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('inicio')}
          >
            <Clock size={18} className="stat-icon" style={{ color: '#f59e0b' }} />
            <div className="stat-content">
              <span className="stat-value">{stats.inicio}</span>
              <span className="stat-label">Inicio conversación</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'aptos' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('aptos')}
          >
            <CheckCircle size={18} className="stat-icon" style={{ color: '#16a34a' }} />
            <div className="stat-content">
              <span className="stat-value">{stats.aptos}</span>
              <span className="stat-label">Aptos</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'intercom' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('intercom')}
          >
            <MessageCircle size={18} className="stat-icon" style={{ color: '#6366f1' }} />
            <div className="stat-content">
              <span className="stat-value">{stats.intercom}</span>
              <span className="stat-label">Intercom</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'damaro' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('damaro')}
          >
            <Users size={18} className="stat-icon" style={{ color: '#f59e0b' }} />
            <div className="stat-content">
              <span className="stat-value">{stats.damaro}</span>
              <span className="stat-label">Damaro</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'convocatoria' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('convocatoria')}
          >
            <UserPlus size={18} className="stat-icon" style={{ color: '#8b5cf6' }} />
            <div className="stat-content">
              <span className="stat-value">{stats.convocatoria}</span>
              <span className="stat-label">Conv. Inducción</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'zonaSegura' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('zonaSegura')}
          >
            <CheckCircle size={18} className="stat-icon" style={{ color: '#16a34a' }} />
            <div className="stat-content">
              <span className="stat-value">{stats.enZonaSegura}</span>
              <span className="stat-label">Zona Aprobada</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'autoPueblo' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('autoPueblo')}
          >
            <Car size={18} className="stat-icon" style={{ color: '#d97706' }} />
            <div className="stat-content">
              <span className="stat-value">{stats.autoPueblo}</span>
              <span className="stat-label">Auto del pueblo</span>
            </div>
          </div>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        data={filteredLeads}
        columns={columns}
        loading={loading}
        error={error}
        stickyLeftColumns={3}
        searchPlaceholder="Buscar lead por nombre, DNI, teléfono..."
        emptyIcon={<Users size={64}
      />}
        emptyTitle="No hay leads"
        emptyDescription="No se encontraron leads con los filtros aplicados"
        headerAction={
          <div className="leads-header-actions">
            <button className="btn-secondary btn-sm" onClick={loadLeads} title="Recargar">
              <RefreshCw size={14} />
            </button>
            <button className="btn-secondary btn-sm" onClick={handleExportExcel} title="Exportar Excel">
              <Download size={14} /> <span className="leads-btn-label">Exportar</span>
            </button>
            {canCreate && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={handleCargaMasiva}
                />
                <button className="btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} title="Carga Masiva">
                  <Upload size={14} /> <span className="leads-btn-label">Carga Masiva</span>
                </button>
              </>
            )}
            {canCreate && (
              <button className="btn-primary btn-sm" onClick={handleOpenCreate}>
                <UserPlus size={14} /> <span className="leads-btn-label">Nuevo Lead</span>
              </button>
            )}
            <button
              className={`btn-sm ${activeStatCard === 'descartados' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleStatClick('descartados')}
              style={activeStatCard === 'descartados' ? { background: '#dc2626', borderColor: '#dc2626' } : { color: '#dc2626', borderColor: '#dc2626' }}
            >
              <Trash2 size={14} /> <span className="leads-btn-label">Descartados ({stats.descartados})</span>
            </button>
          </div>
        }
        externalFilters={externalFilters}
        onClearAllFilters={hasActiveFilters ? clearAllFilters : undefined}
      />

      {/* Modal Crear */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Nuevo Lead</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <LeadWizard
                formData={formData}
                setFormData={setFormData}
                onSave={handleSaveCreate}
                onCancel={() => setShowCreateModal(false)}
                saving={saving}
                errors={editErrors}
                categoriasLicencia={categoriasLicencia}
                estadosLicencia={estadosLicencia}
                tiposLicencia={tiposLicencia}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar */}
      {showEditModal && selectedLead && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Editar Lead</h2>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <LeadWizard
                formData={formData}
                setFormData={setFormData}
                onSave={handleSaveEdit}
                onCancel={() => setShowEditModal(false)}
                saving={saving}
                errors={editErrors}
                categoriasLicencia={categoriasLicencia}
                estadosLicencia={estadosLicencia}
                tiposLicencia={tiposLicencia}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Eliminar */}
      {showDeleteModal && selectedLead && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Eliminar Lead</h2>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <AlertTriangle size={48} style={{ color: '#dc2626', marginBottom: '12px' }} />
                <p style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Se eliminará el lead de <strong>{selectedLead.nombre_completo}</strong>
                </p>
                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                  Esta acción no se puede deshacer.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--border-primary)' }}>
                <button className="btn-secondary" onClick={() => setShowDeleteModal(false)}>Cancelar</button>
                <button className="btn-danger" onClick={handleDelete} disabled={saving}>
                  {saving ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalle */}
      {showDetailsModal && selectedLead && (
        <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
          <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Detalle de Lead</h2>
              <button className="modal-close" onClick={() => setShowDetailsModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <LeadDetailView
                lead={selectedLead}
                zonasRestringidas={zonasRestringidas}
                enZonaRestringida={leadsEnZona.get(selectedLead.id) || null}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================
// EDITABLE TEXT CELL (click-to-edit inline)
// =====================================================

interface EditableTextCellProps {
  leadId: string
  field: keyof Lead
  value: string | null | undefined
  canEdit: boolean
  onChange: (leadId: string, field: keyof Lead, value: string) => void
  maxWidth?: string
}

function EditableTextCell({ leadId, field, value, canEdit, onChange, maxWidth = '120px' }: EditableTextCellProps) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value || '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setText(value || '')
  }, [value])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleSave = () => {
    setEditing(false)
    const trimmed = text.trim()
    if (trimmed !== (value || '')) {
      onChange(leadId, field, trimmed)
    }
  }

  if (editing && canEdit) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') { setText(value || ''); setEditing(false) }
        }}
        style={{
          fontSize: '11px',
          width: '100%',
          padding: '2px 6px',
          border: '1px solid var(--border-primary)',
          borderRadius: '4px',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          outline: 'none',
        }}
      />
    )
  }

  const display = value || '-'
  return (
    <span
      onClick={() => canEdit && setEditing(true)}
      style={{
        fontSize: '11px',
        cursor: canEdit ? 'pointer' : 'default',
        display: 'block',
        maxWidth,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        padding: '2px 4px',
        borderRadius: '4px',
        border: canEdit ? '1px solid transparent' : 'none',
      }}
      onMouseEnter={(e) => { if (canEdit) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-primary)' }}
      onMouseLeave={(e) => { if (canEdit) (e.currentTarget as HTMLElement).style.borderColor = 'transparent' }}
      title={display}
    >
      {display}
    </span>
  )
}

// =====================================================
// SI/NO DROPDOWN CELL (portal-based, reutilizable)
// =====================================================

interface SiNoDropdownCellProps {
  leadId: string
  field: keyof Lead
  value: string | null | undefined
  isOpen: boolean
  canEdit: boolean
  onToggle: (key: string) => void
  onChange: (leadId: string, field: keyof Lead, value: string) => void
  onClose: () => void
}

function SiNoDropdownCell({ leadId, field, value, isOpen, canEdit, onToggle, onChange, onClose }: SiNoDropdownCellProps) {
  const cellRef = useRef<HTMLSpanElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const dropdownKey = `${leadId}::${String(field)}`
  const display = value || '-'
  const color = value === 'Si' ? '#16a34a' : value === 'No' ? '#dc2626' : '#9ca3af'

  useLayoutEffect(() => {
    if (!isOpen || !cellRef.current) return
    const rect = cellRef.current.getBoundingClientRect()
    const dropdownH = 120
    const vh = window.innerHeight
    let top = rect.bottom + 4
    if (top + dropdownH > vh - 8) top = rect.top - dropdownH - 4
    if (top < 8) top = 8
    setPos({ top, left: rect.left })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (dropdownRef.current && !dropdownRef.current.contains(t) && cellRef.current && !cellRef.current.contains(t)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  const options: { val: string; label: string; dot: string }[] = [
    { val: 'Si', label: 'Si', dot: '#16a34a' },
    { val: 'No', label: 'No', dot: '#dc2626' },
  ]

  return (
    <span style={{ display: 'inline-block' }}>
      <span
        ref={cellRef}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          fontSize: '11px',
          fontWeight: 600,
          color,
          cursor: canEdit ? 'pointer' : 'default',
          padding: '2px 8px',
          borderRadius: '4px',
          background: value === 'Si' ? '#DCFCE7' : value === 'No' ? '#FEE2E2' : 'transparent',
          border: canEdit ? '1px dashed #d1d5db' : 'none',
        }}
        onClick={canEdit ? (e) => { e.stopPropagation(); onToggle(dropdownKey) } : undefined}
      >
        {display}
        {canEdit && <svg width="10" height="10" viewBox="0 0 10 10" style={{ opacity: 0.4, flexShrink: 0 }}><path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </span>
      {isOpen && canEdit && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 99999,
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,.15)',
            padding: '4px 0',
            minWidth: '100px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {options.map(opt => (
            <button
              key={opt.val}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '8px 14px',
                border: 'none',
                background: opt.val === value ? '#F3F4F6' : 'transparent',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: opt.val === value ? 600 : 400,
                textAlign: 'left',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F3F4F6')}
              onMouseLeave={e => (e.currentTarget.style.background = opt.val === value ? '#F3F4F6' : 'transparent')}
              onClick={(e) => {
                e.stopPropagation()
                if (opt.val !== value) onChange(leadId, field, opt.val)
                onClose()
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.dot, flexShrink: 0 }} />
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </span>
  )
}

// =====================================================
// ESTADO DROPDOWN CELL (portal-based to avoid clipping)
// =====================================================

interface EstadoDropdownCellProps {
  leadId: string
  estado: string | undefined | null
  badgeClass: string
  isOpen: boolean
  canEdit: boolean
  onToggle: (id: string) => void
  estados: string[]
  onChangeEstado: (leadId: string, estado: string) => void
  onClose: () => void
}

function EstadoDropdownCell({ leadId, estado, badgeClass, isOpen, canEdit, onToggle, estados, onChangeEstado, onClose }: EstadoDropdownCellProps) {
  const badgeRef = useRef<HTMLSpanElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const [maxH, setMaxH] = useState<number | undefined>(undefined)

  useLayoutEffect(() => {
    if (!isOpen || !badgeRef.current) return
    const rect = badgeRef.current.getBoundingClientRect()
    const vH = window.innerHeight
    const margin = 8
    const gap = 4
    const spaceBelow = vH - rect.bottom - gap - margin
    const spaceAbove = rect.top - gap - margin

    // Measure real dropdown height after first render
    const realH = dropdownRef.current?.scrollHeight || 340

    if (realH <= spaceBelow) {
      // Fits below
      setPos({ top: rect.bottom + gap, left: rect.left })
      setMaxH(undefined)
    } else if (realH <= spaceAbove) {
      // Fits above
      setPos({ top: rect.top - realH - gap, left: rect.left })
      setMaxH(undefined)
    } else {
      // Doesn't fit either way, use the larger space with scroll
      if (spaceBelow >= spaceAbove) {
        setPos({ top: rect.bottom + gap, left: rect.left })
        setMaxH(spaceBelow)
      } else {
        setPos({ top: margin, left: rect.left })
        setMaxH(spaceAbove)
      }
    }
  }, [isOpen])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        badgeRef.current && !badgeRef.current.contains(target)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  return (
    <div className="lead-estado-inline">
      <span
        ref={badgeRef}
        className={badgeClass}
        style={{ cursor: canEdit ? 'pointer' : 'default' }}
        onClick={canEdit ? (e) => { e.stopPropagation(); onToggle(leadId) } : undefined}
      >
        {estado || '-'}
      </span>
      {isOpen && canEdit && createPortal(
        <div
          ref={dropdownRef}
          className="lead-estado-dropdown"
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999, maxHeight: maxH, overflowY: maxH ? 'auto' : undefined }}
          onClick={(e) => e.stopPropagation()}
        >
          {estados.map(est => (
            <button
              key={est}
              className={`lead-estado-dropdown-item ${est === estado ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                if (est !== estado) onChangeEstado(leadId, est)
                else onClose()
              }}
            >
              <span className={`lead-estado-dot lead-estado-dot-${est.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s/g, '-')}`} />
              {est}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

// =====================================================
// LEAD DETAIL VIEW (inline component)
// =====================================================

interface LeadDetailViewProps {
  lead: Lead
  onEdit?: () => void
  onConvert?: () => void
  zonasRestringidas?: ZonaRestringida[]
  enZonaRestringida?: string | null
}

function LeadDetailView({ lead, onEdit, onConvert, zonasRestringidas = [], enZonaRestringida }: LeadDetailViewProps) {
  const mapRef = useRef<google.maps.Map | null>(null)

  const handleRecenter = () => {
    if (mapRef.current && lead.latitud != null && lead.longitud != null) {
      mapRef.current.panTo({ lat: lead.latitud, lng: lead.longitud })
      mapRef.current.setZoom(14)
    }
  }

  return (
    <div className="lead-detail">
      <div className="lead-detail-header">
        <div>
          <p className="lead-detail-id">ID: {lead.id.slice(0, 8)}...</p>
          <h3>{lead.nombre_completo || 'Sin nombre'}</h3>
          {lead.proceso && (
            <span className={`lead-estado-badge ${getProcesoClass(lead.proceso)}`} style={{ marginTop: '4px' }}>
              {lead.proceso}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn-sm ${lead.id_lead?.trim() ? 'btn-primary' : 'btn-secondary'}`}
            disabled={!lead.id_lead?.trim()}
            onClick={() => { if (lead.id_lead?.trim()) window.open(`https://app.intercom.com/a/apps/ogv74k5c/users/${lead.id_lead}`, '_blank') }}
            title={lead.id_lead?.trim() ? 'Abrir en Intercom' : 'Sin ID de Intercom'}
          >
            <MessageCircle size={14} /> Ver Perfil Intercom
          </button>
          {(() => {
            const guiaMap: Record<string, string> = { marina: '687169f1bda19bb1e7faa1bc', manuel: '6877eeff3042007628cd1ad7' }
            const entrevistador = (lead.entrevistador_asignado || '').trim().toLowerCase()
            const idGuia = guiaMap[entrevistador] || null
            const idHireflix = lead.id_hireflix?.trim() || null
            const faltantes: string[] = []
            if (!idGuia) faltantes.push('No tiene guia asignado')
            if (!idHireflix) faltantes.push('No tiene videocuestionario')
            const habilitado = !!idGuia && !!idHireflix
            const url = habilitado ? `https://admin.hireflix.com/es/jobs/${idGuia}/interview/${idHireflix}` : ''
            return (
              <span style={{ position: 'relative', display: 'inline-block' }} className="hireflix-btn-wrapper">
                <button
                  className={`btn-sm ${habilitado ? 'btn-primary' : 'btn-secondary'}`}
                  disabled={!habilitado}
                  onClick={() => { if (habilitado) window.open(url, '_blank') }}
                >
                  <Video size={14} /> Ver Videocuestionario
                </button>
                {!habilitado && (
                  <div className="hireflix-tooltip">
                    {faltantes.map((f, i) => <div key={i}>{f}</div>)}
                  </div>
                )}
              </span>
            )
          })()}
          {onConvert && (
            <button className="btn-primary btn-sm" onClick={onConvert}>
              <UserPlus size={14} /> Convertir a Conductor
            </button>
          )}
          {onEdit && (
            <button className="btn-secondary btn-sm" onClick={onEdit}>
              <Edit2 size={14} /> Editar
            </button>
          )}
        </div>
      </div>

      <div className="lead-detail-cards">
        {/* Datos Personales */}
        <div className="lead-detail-card">
          <div className="lead-detail-card-title">Datos Personales</div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">DNI</span>
            <span className="lead-detail-item-value">{lead.dni || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">CUIT</span>
            <span className="lead-detail-item-value">{lead.cuit || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Edad</span>
            <span className="lead-detail-item-value">{lead.edad ?? '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Fecha Nacimiento</span>
            <span className="lead-detail-item-value">{formatDate(lead.fecha_de_nacimiento)}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Nacionalidad</span>
            <span className="lead-detail-item-value">{lead.nacionalidad || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Estado Civil</span>
            <span className="lead-detail-item-value">{lead.estado_civil || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Antecedentes Penales</span>
            <span className="lead-detail-item-value">{lead.antecedentes_penales === true ? 'Si' : lead.antecedentes_penales === false ? 'No' : '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Experiencia Previa</span>
            <span className="lead-detail-item-value">{lead.experiencia_previa || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Experiencia Manejo</span>
            <span className="lead-detail-item-value">{lead.experiencia_manejo || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Disponibilidad</span>
            <span className="lead-detail-item-value">{lead.disponibilidad || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">BCRA</span>
            <span className="lead-detail-item-value">{lead.bcra || '-'}</span>
          </div>
        </div>

        {/* Contacto */}
        <div className="lead-detail-card">
          <div className="lead-detail-card-title">Contacto y Dirección</div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Teléfono</span>
            <span className="lead-detail-item-value">{lead.phone || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">WhatsApp</span>
            <span className="lead-detail-item-value">{lead.whatsapp_number || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Email</span>
            <span className="lead-detail-item-value">{lead.email || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Zona</span>
            <span className="lead-detail-item-value">{lead.zona || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Dirección</span>
            <span className="lead-detail-item-value" style={{ fontSize: '12px' }}>
              {lead.direccion && lead.latitud != null && lead.longitud != null ? (
                <span
                  onClick={handleRecenter}
                  style={{ color: 'var(--color-primary)', cursor: 'pointer' }}
                >
                  {lead.direccion}
                </span>
              ) : (lead.direccion || '-')}
            </span>
          </div>
          {lead.latitud != null && lead.longitud != null && (
            <LeadDetailMap
              lat={lead.latitud}
              lng={lead.longitud}
              zonasRestringidas={zonasRestringidas}
              enZonaRestringida={!!enZonaRestringida}
              nombreZona={enZonaRestringida || undefined}
              mapRef={mapRef}
            />
          )}
          {lead.direccion && lead.latitud == null && (
            <div style={{ marginTop: '8px', padding: '8px 12px', background: '#FEF3C7', borderRadius: '6px', fontSize: '11px', color: '#92400E', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={12} /> Geocodificando dirección...
            </div>
          )}
        </div>

        {/* Proceso */}
        <div className="lead-detail-card">
          <div className="lead-detail-card-title">Proceso y Evaluación</div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Estado de Lead</span>
            <span className="lead-detail-item-value">{lead.estado_de_lead || '-'}</span>
          </div>
          {lead.estado_de_lead === 'No le interesa' && (
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Motivo Desinterés</span>
            <span className="lead-detail-item-value">
              {clasificarMotivoDesinteres(lead.causal_de_cierre)}
              {lead.motivo_desinteres && (
                <span> - {lead.motivo_desinteres}</span>
              )}
              {lead.causal_de_cierre && lead.causal_de_cierre !== clasificarMotivoDesinteres(lead.causal_de_cierre) && (
                <span style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>({lead.causal_de_cierre})</span>
              )}
            </span>
          </div>
          )}
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Fuente</span>
            <span className="lead-detail-item-value">{lead.fuente_de_lead || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Guia</span>
            <span className="lead-detail-item-value">{lead.entrevistador_asignado || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Detalle Hireflix</span>
            <span className="lead-detail-item-value" style={{ whiteSpace: 'pre-wrap', maxWidth: '300px', textAlign: 'right' }}>{lead.resumen_hireflix || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Observaciones</span>
            <span className="lead-detail-item-value" style={{ whiteSpace: 'pre-wrap', maxWidth: '300px', textAlign: 'right' }}>{lead.observaciones || '-'}</span>
          </div>
        </div>

        {/* Documentación */}
        <div className="lead-detail-card">
          <div className="lead-detail-card-title">Documentación</div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Licencia</span>
            <span className="lead-detail-item-value">{lead.licencia || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Nro. Licencia</span>
            <span className="lead-detail-item-value">{lead.numero_licencia || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Categorías</span>
            <span className="lead-detail-item-value">{lead.categorias_licencia?.length ? lead.categorias_licencia.join(', ') : '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Estado Licencia</span>
            <span className="lead-detail-item-value">{lead.estado_licencia || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Tipo Licencia</span>
            <span className="lead-detail-item-value">{lead.tipo_licencia || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Venc. Licencia</span>
            <span className="lead-detail-item-value">{formatDate(lead.vencimiento_licencia)}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">RNR</span>
            <span className="lead-detail-item-value">{lead.rnr || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Monotributo</span>
            <span className="lead-detail-item-value">{lead.monotributo || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">CBU</span>
            <span className="lead-detail-item-value" style={{ fontSize: '11px', fontFamily: 'monospace' }}>{lead.cbu || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Cta. Cabify</span>
            <span className="lead-detail-item-value">{lead.cuenta_cabify || '-'}</span>
          </div>
        </div>
      </div>

      {/* Emergencia */}
      {(lead.datos_de_emergencia || lead.telefono_emergencia || lead.contacto_de_emergencia || lead.direccion_emergencia || lead.verificacion_emergencia != null) && (
        <div className="lead-detail-description">
          <div className="lead-detail-description-title">Contacto de Emergencia</div>
          <p>
            {lead.datos_de_emergencia || lead.contacto_de_emergencia || '-'}
            {lead.telefono_emergencia ? ` · Tel: ${lead.telefono_emergencia}` : ''}
            {lead.parentesco_emergencia ? ` · ${lead.parentesco_emergencia}` : ''}
            {lead.direccion_emergencia ? ` · Dir: ${lead.direccion_emergencia}` : ''}
          </p>
          <p style={{ marginTop: '4px', fontSize: '12px', color: lead.verificacion_emergencia ? '#16a34a' : '#dc2626' }}>
            Verificación de contacto de emergencia: {lead.verificacion_emergencia ? 'Sí' : 'No'}
          </p>
        </div>
      )}
    </div>
  )
}

// =====================================================
// LEAD DETAIL MAP (mapa interactivo con zonas restringidas)
// =====================================================

interface LeadDetailMapProps {
  lat: number
  lng: number
  zonasRestringidas: ZonaRestringida[]
  enZonaRestringida: boolean
  nombreZona?: string
  mapRef?: React.MutableRefObject<google.maps.Map | null>
}

function LeadDetailMap({ lat, lng, zonasRestringidas, enZonaRestringida, nombreZona, mapRef }: LeadDetailMapProps) {
  const [mapsReady, setMapsReady] = useState(false)

  useEffect(() => {
    if ((window as any).google?.maps) {
      setMapsReady(true)
      return
    }
    // Cargar el script si aún no está
    loadGoogleMapsAPI().then(() => setMapsReady(true)).catch(() => {})
  }, [])

  if (!mapsReady) {
    return (
      <div style={{ marginTop: '8px', height: '220px', borderRadius: '8px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Cargando mapa...</span>
      </div>
    )
  }

  return (
    <div style={{ marginTop: '8px' }}>
      {enZonaRestringida && nombreZona && (
        <div style={{ marginBottom: '6px', padding: '6px 10px', background: 'var(--badge-red-bg)', borderRadius: '6px', border: '1px solid var(--badge-red-text)', fontSize: '12px', color: 'var(--badge-red-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertTriangle size={14} /> Zona Restringida: {nombreZona}
        </div>
      )}
      <div style={{ borderRadius: '8px', overflow: 'hidden', border: `2px solid ${enZonaRestringida ? 'var(--color-primary)' : 'var(--badge-green-text)'}` }}>
        <GoogleMap
          mapContainerStyle={detailMapStyle}
          center={{ lat, lng }}
          zoom={14}
          onLoad={(map) => { if (mapRef) mapRef.current = map }}
          onUnmount={() => { if (mapRef) mapRef.current = null }}
          options={{
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          }}
        >
          <Marker
            position={{ lat, lng }}
            icon={{
              path: 0, // google.maps.SymbolPath.CIRCLE
              scale: 10,
              fillColor: enZonaRestringida ? '#FF0033' : '#22C55E',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 3,
            }}
            title={enZonaRestringida ? 'Zona Restringida' : 'Ubicación del lead'}
          />
          {zonasRestringidas.map(zona => (
            zona.poligono && (
              <Polygon
                key={zona.id}
                paths={zona.poligono.map(p => ({ lat: p.lat, lng: p.lng }))}
                options={{
                  fillColor: '#FF0033',
                  fillOpacity: 0.15,
                  strokeColor: '#FF0033',
                  strokeOpacity: 0.6,
                  strokeWeight: 2,
                }}
              />
            )
          ))}
        </GoogleMap>
      </div>
      <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {!enZonaRestringida ? (
          <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 500 }}>Zona Aprobada</span>
        ) : <span />}
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '11px', color: 'var(--color-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <ExternalLink size={12} /> Abrir en Google Maps
        </a>
      </div>
    </div>
  )
}
