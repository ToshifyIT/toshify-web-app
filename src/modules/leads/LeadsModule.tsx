// src/modules/leads/LeadsModule.tsx
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Eye, Edit2, Trash2, Users, UserCheck, UserPlus, Clock, RefreshCw,
  CheckCircle, XCircle, AlertTriangle, X, Download, MapPin, ExternalLink,
} from 'lucide-react'
import { GoogleMap, useJsApiLoader, Marker, Polygon } from '@react-google-maps/api'
import { ActionsMenu } from '../../components/ui/ActionsMenu'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
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

// =====================================================
// GOOGLE MAPS GEOCODING
// =====================================================

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyCCiqk9jWZghUq5rBtSyo6ZjLuMORblY-w'
const GMAP_LIBRARIES: ('places')[] = ['places']

const detailMapStyle = {
  width: '100%',
  height: '220px',
  borderRadius: '8px',
}

function loadGoogleMapsAPI(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.maps) {
      resolve()
      return
    }
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]')
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve())
      return
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`
    script.async = true
    script.onload = () => resolve()
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

interface ZonaPeligrosa {
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
    } else {
      out[k] = v
    }
  })
  return out
}

const emptyFormData: LeadFormData = {
  nombre_completo: '',
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

function getEntrevistaClass(entrevista: string | undefined | null): string {
  if (!entrevista) return 'lead-estado-pendiente'
  if (entrevista === 'Apto') return 'lead-estado-apto'
  if (entrevista === 'No Apto') return 'lead-estado-no-apto'
  return 'lead-estado-pendiente'
}

// =====================================================
// LEADS MODULE
// =====================================================

export function LeadsModule() {
  const { canCreateInMenu, canEditInMenu, canDeleteInMenu } = usePermissions()
  const { sedeActual, aplicarFiltroSede } = useSede()
  const canCreate = canCreateInMenu('leads')
  const canEdit = canEditInMenu('leads')
  const canDelete = canDeleteInMenu('leads')

  // Zonas peligrosas
  const [zonasPeligrosas, setZonasPeligrosas] = useState<ZonaPeligrosa[]>([])

  // State principal
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
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
  const [procesoFilter, setProcesoFilter] = useState<string[]>([])
  const [entrevistaFilter, setEntrevistaFilter] = useState<string[]>([])
  const [zonaFilter, setZonaFilter] = useState<string[]>([])
  const [turnoFilter, setTurnoFilter] = useState<string[]>([])
  const [disponibilidadFilter, setDisponibilidadFilter] = useState<string[]>([])
  const [fuenteFilter, setFuenteFilter] = useState<string[]>([])
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])
  const [openFilterId, setOpenFilterId] = useState<string | null>(null)

  // Stat card filter
  const [activeStatCard, setActiveStatCard] = useState<string | null>(null)

  // ---------- DATA LOADING ----------
  const loadLeads = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let query = supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000)

      // Filtro por sede usando la FK sede_id (UUID), igual que el resto del sistema.
      // aplicarFiltroSede respeta el modo "Todas las sedes" para usuarios admin.
      query = aplicarFiltroSede(query, 'sede_id')

      const { data, error: err } = await query
      if (err) throw err
      setLeads((data || []) as Lead[])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cargar leads'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [aplicarFiltroSede])

  useEffect(() => { loadLeads() }, [loadLeads])

  // ---------- GEOCODIFICAR LEADS SIN COORDENADAS ----------
  const geocodificarLeadsSinCoordenadas = useCallback(async (leadsList: Lead[]) => {
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
  }, [loadLeads])

  useEffect(() => {
    if (leads.length > 0) {
      geocodificarLeadsSinCoordenadas(leads)
    }
  // Solo correr cuando leads cambie de 0 a >0 (carga inicial)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads.length > 0])

  // ---------- CARGAR ZONAS PELIGROSAS ----------
  useEffect(() => {
    async function loadZonas() {
      const { data } = await supabase
        .from('zonas_peligrosas')
        .select('id, nombre, poligono')
        .eq('activo', true)
      if (data) setZonasPeligrosas(data as ZonaPeligrosa[])
    }
    loadZonas()
  }, [])

  // ---------- MAPA: lead_id -> nombre de zona peligrosa ----------
  const leadsEnZona = useMemo(() => {
    const map = new Map<string, string>()
    if (zonasPeligrosas.length === 0) return map
    for (const lead of leads) {
      if (lead.latitud == null || lead.longitud == null) continue
      const punto = { lat: lead.latitud, lng: lead.longitud }
      for (const zona of zonasPeligrosas) {
        if (zona.poligono && isPointInPolygon(punto, zona.poligono)) {
          map.set(lead.id, zona.nombre)
          break
        }
      }
    }
    return map
  }, [leads, zonasPeligrosas])

  // ---------- STATS ----------
  const stats = useMemo(() => {
    const total = leads.length
    const aptos = leads.filter(l => l.entrevista_ia === 'Apto').length
    const enProceso = leads.filter(l => l.proceso?.toLowerCase().includes('proceso')).length
    const descartados = leads.filter(l => l.proceso?.toLowerCase().includes('descartado')).length
    const disponibilidadInmediata = leads.filter(l => l.disponibilidad?.toLowerCase().includes('inmediata')).length
    const exConductores = leads.filter(l => l.proceso?.toLowerCase().includes('ex conductor')).length
    const sinEntrevistar = leads.filter(l => !l.entrevista_ia).length
    return { total, aptos, enProceso, descartados, disponibilidadInmediata, exConductores, sinEntrevistar }
  }, [leads])

  // ---------- UNIQUE VALUES PARA FILTROS ----------
  const uniqueProcesos = useMemo(() =>
    [...new Set(leads.map(l => l.proceso).filter(Boolean))].sort() as string[]
  , [leads])

  const uniqueEntrevistas = useMemo(() =>
    [...new Set(leads.map(l => l.entrevista_ia).filter(Boolean))].sort() as string[]
  , [leads])

  const uniqueZonas = useMemo(() =>
    [...new Set(leads.map(l => l.zona).filter(Boolean))].sort() as string[]
  , [leads])

  const uniqueTurnos = useMemo(() =>
    [...new Set(leads.map(l => l.turno).filter(Boolean))].sort() as string[]
  , [leads])

  const uniqueDisponibilidades = useMemo(() =>
    [...new Set(leads.map(l => l.disponibilidad).filter(Boolean))].sort() as string[]
  , [leads])

  const uniqueFuentes = useMemo(() =>
    [...new Set(leads.map(l => l.fuente_de_lead).filter(Boolean))].sort() as string[]
  , [leads])

  const uniqueNombres = useMemo(() =>
    [...new Set(leads.map(l => l.nombre_completo).filter(Boolean))].sort() as string[]
  , [leads])

  const uniqueEstados = useMemo(() =>
    [...new Set(leads.map(l => l.estado_de_lead).filter(Boolean))].sort() as string[]
  , [leads])

  // ---------- FILTERED DATA ----------
  const filteredLeads = useMemo(() => {
    let result = [...leads]

    // Stat card filter
    if (activeStatCard === 'aptos') result = result.filter(l => l.entrevista_ia === 'Apto')
    else if (activeStatCard === 'enProceso') result = result.filter(l => l.proceso?.toLowerCase().includes('proceso'))
    else if (activeStatCard === 'descartados') result = result.filter(l => l.proceso?.toLowerCase().includes('descartado'))
    else if (activeStatCard === 'disponibles') result = result.filter(l => l.disponibilidad?.toLowerCase().includes('inmediata'))
    else if (activeStatCard === 'exConductores') result = result.filter(l => l.proceso?.toLowerCase().includes('ex conductor'))
    else if (activeStatCard === 'sinEntrevistar') result = result.filter(l => !l.entrevista_ia)

    // Column filters
    if (nombreFilter.length > 0) {
      const set = new Set(nombreFilter)
      result = result.filter(l => set.has(l.nombre_completo || ''))
    }
    if (procesoFilter.length > 0) {
      const set = new Set(procesoFilter)
      result = result.filter(l => set.has(l.proceso || ''))
    }
    if (entrevistaFilter.length > 0) {
      const set = new Set(entrevistaFilter)
      result = result.filter(l => set.has(l.entrevista_ia || ''))
    }
    if (zonaFilter.length > 0) {
      const set = new Set(zonaFilter)
      result = result.filter(l => set.has(l.zona || ''))
    }
    if (turnoFilter.length > 0) {
      const set = new Set(turnoFilter)
      result = result.filter(l => set.has(l.turno || ''))
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
  }, [leads, activeStatCard, nombreFilter, procesoFilter, entrevistaFilter, zonaFilter, turnoFilter, disponibilidadFilter, fuenteFilter, estadoFilter])

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
    if (!formData.nombre_completo?.trim()) {
      setEditErrors({ nombre_completo: 'Nombre es requerido' })
      return
    }
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
    if (!formData.nombre_completo?.trim()) {
      setEditErrors({ nombre_completo: 'Nombre es requerido' })
      return
    }
    setSaving(true)
    try {
      const fields = formDataToDbFields(formData)
      const { error: err } = await supabase.from('leads').update(fields).eq('id', selectedLead.id)
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
  async function handleConvertir(lead: Lead) {
    const nombre = lead.nombre_completo || 'Sin nombre'
    const dni = lead.dni || 'Sin DNI'

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

    setSaving(true)
    try {
      const parts = (lead.nombre_completo || '').trim().split(' ')
      const nombres = parts.slice(0, Math.ceil(parts.length / 2)).join(' ')
      const apellidos = parts.slice(Math.ceil(parts.length / 2)).join(' ')

      const { data: estados } = await supabase
        .from('conductores_estados')
        .select('id')
        .eq('codigo', 'EN_ESPERA')
        .limit(1)
      const estadoId = estados?.[0]?.id

      if (!estadoId) {
        throw new Error('No se encontró el estado EN_ESPERA para conductores. Verifique la tabla conductores_estados.')
      }

      let turnoMapped = 'SIN_PREFERENCIA'
      const turnoLead = (lead.turno || '').toLowerCase()
      if (turnoLead.includes('diurno')) turnoMapped = 'DIURNO'
      else if (turnoLead.includes('nocturno')) turnoMapped = 'NOCTURNO'
      else if (turnoLead.includes('cargo')) turnoMapped = 'A_CARGO'

      const conductorData: Record<string, unknown> = {
        nombres: nombres || lead.primer_nombre || '',
        apellidos: apellidos || lead.apellido || '',
        numero_dni: lead.dni || '',
        numero_cuit: lead.cuit || '',
        telefono_contacto: lead.phone || '',
        email: lead.email || '',
        direccion: lead.direccion || '',
        zona: lead.zona || '',
        preferencia_turno: turnoMapped,
        licencia_vencimiento: lead.vencimiento_licencia || null,
        numero_licencia: '',
        estado_id: estadoId,
        cbu: lead.cbu || '',
        monotributo: lead.monotributo?.toLowerCase().includes('tiene') || false,
        fecha_nacimiento: lead.fecha_de_nacimiento || null,
        direccion_lat: lead.latitud ?? null,
        direccion_lng: lead.longitud ?? null,
        sede_id: lead.sede_id || sedeActual?.id || null,
      }

      // Filtrar campos vacíos (salvo requeridos)
      Object.keys(conductorData).forEach(key => {
        const v = conductorData[key]
        if (v === '' || v === null || v === undefined) {
          if (!['numero_licencia', 'estado_id', 'nombres', 'apellidos', 'numero_dni'].includes(key)) {
            delete conductorData[key]
          }
        }
      })

      const { error: errCond } = await supabase
        .from('conductores')
        .insert(conductorData)
        .select('id')
        .single()

      if (errCond) throw errCond

      await supabase.from('leads').update({
        proceso: 'Convertido',
        estado_de_lead: 'Convertido',
      }).eq('id', lead.id)

      showSuccess('Convertido', `El lead "${nombre}" fue convertido a conductor exitosamente.`)
      loadLeads()
    } catch (err) {
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

  // ---------- STAT CARD CLICK ----------
  function handleStatClick(card: string) {
    setActiveStatCard(prev => prev === card ? null : card)
  }

  // ---------- COLUMNS ----------
  const columns = useMemo<ColumnDef<Lead>[]>(() => [
    {
      id: 'nombre',
      accessorFn: (row) => row.nombre_completo || '-',
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
        const nombre = row.original.nombre_completo || '-'
        const dni = row.original.dni || ''
        const phone = row.original.phone || ''
        const direccion = row.original.direccion || ''
        const zonaPeligrosa = leadsEnZona.get(row.original.id)
        const enZonaPeligrosa = !!zonaPeligrosa
        const tieneCoordenadas = row.original.latitud != null && row.original.longitud != null

        return (
          <div
            title={enZonaPeligrosa ? `Zona peligrosa: ${zonaPeligrosa}` : tieneCoordenadas ? 'Fuera de zona peligrosa' : undefined}
            style={{
              background: enZonaPeligrosa ? '#FFF1F2' : undefined,
              borderLeft: enZonaPeligrosa ? '3px solid #FF0033' : tieneCoordenadas ? '3px solid #22C55E' : undefined,
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
                style={{ fontWeight: 600, color: enZonaPeligrosa ? '#BE123C' : 'var(--color-primary)', textDecoration: 'none', fontSize: '13px' }}
              >
                {nombre}
              </a>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                {dni ? `DNI: ${dni}` : ''}{dni && phone ? ' · ' : ''}{phone ? phone : ''}
              </span>
              {enZonaPeligrosa && (
                <span
                  className="lead-zona-badge"
                  style={{
                    fontSize: '9px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 600,
                    marginTop: '2px',
                    display: 'inline-block',
                    background: '#FFE4E6',
                    color: '#BE123C',
                    width: 'fit-content',
                    cursor: 'default',
                    position: 'relative',
                  }}
                  data-tooltip={direccion || undefined}
                >
                  ⚠ Zona peligrosa: {zonaPeligrosa}
                </span>
              )}
              {tieneCoordenadas && !enZonaPeligrosa && (
                <span
                  className="lead-zona-badge"
                  style={{
                    fontSize: '9px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 600,
                    marginTop: '2px',
                    display: 'inline-block',
                    background: '#DCFCE7',
                    color: '#16A34A',
                    width: 'fit-content',
                    cursor: 'default',
                    position: 'relative',
                  }}
                  data-tooltip={direccion || undefined}
                >
                  ✓ Zona segura
                </span>
              )}
            </div>
          </div>
        )
      },
      size: 260,
      enableSorting: true,
    },
    {
      id: 'estado',
      accessorFn: (row) => row.estado_de_lead || '-',
      header: () => (
        <ExcelColumnFilter
          label="Estado"
          options={uniqueEstados}
          selectedValues={estadoFilter}
          onSelectionChange={setEstadoFilter}
          filterId="lead_estado"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const estado = row.original.estado_de_lead
        if (!estado) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>
        return <span className={`lead-estado-badge`}>{estado}</span>
      },
      size: 120,
      enableSorting: true,
    },
    {
      id: 'proceso',
      accessorFn: (row) => row.proceso || '-',
      header: () => (
        <ExcelColumnFilter
          label="Proceso"
          options={uniqueProcesos}
          selectedValues={procesoFilter}
          onSelectionChange={setProcesoFilter}
          filterId="lead_proceso"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const proceso = row.original.proceso
        if (!proceso) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>
        return <span className={`lead-estado-badge ${getProcesoClass(proceso)}`}>{proceso}</span>
      },
      size: 130,
      enableSorting: true,
    },
    {
      id: 'entrevista_ia',
      accessorFn: (row) => row.entrevista_ia || '-',
      header: () => (
        <ExcelColumnFilter
          label="Entrevista IA"
          options={uniqueEntrevistas}
          selectedValues={entrevistaFilter}
          onSelectionChange={setEntrevistaFilter}
          filterId="lead_entrevista"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const ei = row.original.entrevista_ia
        if (!ei) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>
        return <span className={`lead-estado-badge ${getEntrevistaClass(ei)}`}>{ei}</span>
      },
      size: 120,
      enableSorting: true,
    },
    {
      id: 'disponibilidad',
      accessorFn: (row) => row.disponibilidad || '-',
      header: () => (
        <ExcelColumnFilter
          label="Disponibilidad"
          options={uniqueDisponibilidades}
          selectedValues={disponibilidadFilter}
          onSelectionChange={setDisponibilidadFilter}
          filterId="lead_disponibilidad"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => row.original.disponibilidad || '-',
      size: 120,
      enableSorting: true,
    },
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
      accessorFn: (row) => row.turno || '-',
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
      cell: ({ row }) => row.original.turno || '-',
      size: 90,
      enableSorting: true,
    },
    {
      id: 'licencia',
      accessorFn: (row) => row.licencia || '-',
      header: 'Licencia',
      cell: ({ row }) => row.original.licencia || '-',
      size: 130,
      enableSorting: true,
    },
    {
      id: 'fecha',
      accessorFn: (row) => row.created_at,
      header: 'Fecha',
      cell: ({ row }) => formatDate(row.original.created_at),
      size: 100,
      enableSorting: true,
    },
    {
      id: 'acciones',
      header: '',
      enableSorting: false,
      size: 60,
      cell: ({ row }) => {
        const lead = row.original
        const actions: Array<{ label: string; icon: React.ReactElement; onClick: () => void; variant?: 'default' | 'info' | 'success' | 'warning' | 'danger' }> = [
          { label: 'Ver detalle', icon: <Eye size={15} />, onClick: () => handleOpenDetails(lead) },
        ]
        if (canEdit) {
          actions.push({ label: 'Editar', icon: <Edit2 size={15} />, onClick: () => handleOpenEdit(lead), variant: 'info' })
          if (lead.proceso !== 'Convertido') {
            actions.push({ label: 'Convertir a Conductor', icon: <UserPlus size={15} />, onClick: () => handleConvertir(lead), variant: 'success' })
          }
        }
        if (canDelete) {
          actions.push({ label: 'Eliminar', icon: <Trash2 size={15} />, onClick: () => handleOpenDelete(lead), variant: 'danger' })
        }
        return <ActionsMenu actions={actions} />
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [uniqueNombres, nombreFilter, uniqueEstados, estadoFilter, uniqueProcesos, procesoFilter, uniqueEntrevistas, entrevistaFilter, uniqueDisponibilidades, disponibilidadFilter, uniqueZonas, zonaFilter, uniqueTurnos, turnoFilter, uniqueFuentes, fuenteFilter, openFilterId, canEdit, canDelete, leadsEnZona])

  // ---------- EXTERNAL FILTERS (chips) ----------
  const hasActiveFilters = nombreFilter.length > 0 || estadoFilter.length > 0 || procesoFilter.length > 0 || entrevistaFilter.length > 0 ||
    zonaFilter.length > 0 || turnoFilter.length > 0 || disponibilidadFilter.length > 0 || fuenteFilter.length > 0

  function clearAllFilters() {
    setNombreFilter([])
    setEstadoFilter([])
    setProcesoFilter([])
    setEntrevistaFilter([])
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
    addFilters(procesoFilter, 'Proceso', setProcesoFilter)
    addFilters(entrevistaFilter, 'Entrevista', setEntrevistaFilter)
    addFilters(zonaFilter, 'Zona', setZonaFilter)
    addFilters(turnoFilter, 'Turno', setTurnoFilter)
    addFilters(disponibilidadFilter, 'Disponibilidad', setDisponibilidadFilter)
    addFilters(fuenteFilter, 'Fuente', setFuenteFilter)
    return filters
  }, [hasActiveFilters, nombreFilter, procesoFilter, entrevistaFilter, zonaFilter, turnoFilter, disponibilidadFilter, fuenteFilter])

  // ---------- RENDER ----------
  return (
    <div className="leads-module">
      <LoadingOverlay show={loading} message="Cargando leads..." size="lg" />

      {/* Stats */}
      <div className="leads-stats">
        <div className="leads-stats-grid">
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'aptos' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('aptos')}
          >
            <CheckCircle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.aptos}</span>
              <span className="stat-label">Aptos</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'enProceso' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('enProceso')}
          >
            <Clock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.enProceso}</span>
              <span className="stat-label">En Proceso</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'disponibles' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('disponibles')}
          >
            <UserCheck size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.disponibilidadInmediata}</span>
              <span className="stat-label">Disp. Inmediata</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'exConductores' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('exConductores')}
          >
            <Users size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.exConductores}</span>
              <span className="stat-label">Ex Conductores</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'descartados' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('descartados')}
          >
            <XCircle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.descartados}</span>
              <span className="stat-label">Descartados</span>
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
        searchPlaceholder="Buscar lead por nombre, DNI, teléfono..."
        emptyIcon={<Users size={64} />}
        emptyTitle="No hay leads"
        emptyDescription="No se encontraron leads con los filtros aplicados"
        headerAction={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="btn-secondary btn-sm" onClick={loadLeads} title="Recargar">
              <RefreshCw size={14} />
            </button>
            <button className="btn-secondary btn-sm" onClick={handleExportExcel} title="Exportar Excel">
              <Download size={14} /> Exportar
            </button>
            {canCreate && (
              <button className="btn-primary btn-sm" onClick={handleOpenCreate}>
                <UserPlus size={14} /> Nuevo Lead
              </button>
            )}
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
                onEdit={canEdit ? () => { setShowDetailsModal(false); handleOpenEdit(selectedLead) } : undefined}
                onConvert={canEdit && selectedLead.proceso !== 'Convertido' ? () => { setShowDetailsModal(false); handleConvertir(selectedLead) } : undefined}
                zonasPeligrosas={zonasPeligrosas}
                enZonaPeligrosa={leadsEnZona.get(selectedLead.id) || null}
              />
            </div>
          </div>
        </div>
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
  zonasPeligrosas?: ZonaPeligrosa[]
  enZonaPeligrosa?: string | null
}

function LeadDetailView({ lead, onEdit, onConvert, zonasPeligrosas = [], enZonaPeligrosa }: LeadDetailViewProps) {
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
        </div>

        {/* Contacto */}
        <div className="lead-detail-card">
          <div className="lead-detail-card-title">Contacto y Dirección</div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Teléfono</span>
            <span className="lead-detail-item-value">{lead.phone || '-'}</span>
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
            <span className="lead-detail-item-label">Turno</span>
            <span className="lead-detail-item-value">{lead.turno || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Disponibilidad</span>
            <span className="lead-detail-item-value">{lead.disponibilidad || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Dirección</span>
            <span className="lead-detail-item-value" style={{ fontSize: '12px' }}>{lead.direccion || '-'}</span>
          </div>
          {lead.latitud != null && lead.longitud != null && (
            <LeadDetailMap
              lat={lead.latitud}
              lng={lead.longitud}
              zonasPeligrosas={zonasPeligrosas}
              enZonaPeligrosa={!!enZonaPeligrosa}
              nombreZona={enZonaPeligrosa || undefined}
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
            <span className="lead-detail-item-label">Proceso</span>
            <span className="lead-detail-item-value">
              {lead.proceso ? <span className={`lead-estado-badge ${getProcesoClass(lead.proceso)}`}>{lead.proceso}</span> : '-'}
            </span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Entrevista IA</span>
            <span className="lead-detail-item-value">
              {lead.entrevista_ia ? <span className={`lead-estado-badge ${getEntrevistaClass(lead.entrevista_ia)}`}>{lead.entrevista_ia}</span> : '-'}
            </span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Estado de Lead</span>
            <span className="lead-detail-item-value">{lead.estado_de_lead || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Fuente</span>
            <span className="lead-detail-item-value">{lead.fuente_de_lead || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Agente</span>
            <span className="lead-detail-item-value">{lead.agente_asignado || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Entrevistador</span>
            <span className="lead-detail-item-value">{lead.entrevistador_asignado || '-'}</span>
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

      {/* Observaciones */}
      {lead.observaciones && (
        <div className="lead-detail-description">
          <div className="lead-detail-description-title">Observaciones</div>
          <p>{lead.observaciones}</p>
        </div>
      )}

      {/* Emergencia */}
      {(lead.datos_de_emergencia || lead.telefono_emergencia || lead.contacto_de_emergencia) && (
        <div className="lead-detail-description">
          <div className="lead-detail-description-title">Contacto de Emergencia</div>
          <p>
            {lead.datos_de_emergencia || lead.contacto_de_emergencia || '-'}
            {lead.telefono_emergencia ? ` · Tel: ${lead.telefono_emergencia}` : ''}
            {lead.parentesco_emergencia ? ` · ${lead.parentesco_emergencia}` : ''}
          </p>
        </div>
      )}
    </div>
  )
}

// =====================================================
// LEAD DETAIL MAP (mapa interactivo con zonas peligrosas)
// =====================================================

interface LeadDetailMapProps {
  lat: number
  lng: number
  zonasPeligrosas: ZonaPeligrosa[]
  enZonaPeligrosa: boolean
  nombreZona?: string
}

function LeadDetailMap({ lat, lng, zonasPeligrosas, enZonaPeligrosa, nombreZona }: LeadDetailMapProps) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GMAP_LIBRARIES,
  })

  if (!isLoaded) {
    return (
      <div style={{ marginTop: '8px', height: '220px', borderRadius: '8px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Cargando mapa...</span>
      </div>
    )
  }

  return (
    <div style={{ marginTop: '8px' }}>
      {enZonaPeligrosa && nombreZona && (
        <div style={{ marginBottom: '6px', padding: '6px 10px', background: '#FFF1F2', borderRadius: '6px', border: '1px solid #FECDD3', fontSize: '12px', color: '#BE123C', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertTriangle size={14} /> Zona Peligrosa: {nombreZona}
        </div>
      )}
      <div style={{ borderRadius: '8px', overflow: 'hidden', border: `2px solid ${enZonaPeligrosa ? '#FF0033' : '#22C55E'}` }}>
        <GoogleMap
          mapContainerStyle={detailMapStyle}
          center={{ lat, lng }}
          zoom={14}
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
              fillColor: enZonaPeligrosa ? '#FF0033' : '#22C55E',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 3,
            }}
            title={enZonaPeligrosa ? 'Zona Peligrosa' : 'Ubicación del lead'}
          />
          {zonasPeligrosas.map(zona => (
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
        {!enZonaPeligrosa && (
          <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 500 }}>Fuera de zona peligrosa</span>
        )}
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: 'auto',
            fontSize: '12px', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500,
          }}
        >
          <ExternalLink size={12} /> Abrir en Google Maps
        </a>
      </div>
    </div>
  )
}
