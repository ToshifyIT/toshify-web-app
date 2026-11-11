// src/modules/siniestros/SiniestrosModuleV2.tsx
// Siniestros v2 (/siniestros-v2): versión de prueba con las mejoras. /siniestros sigue con SiniestrosModule.
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { FILTRO_SIN_INTERNOS } from '../../utils/conductorUtils'
import { actualizarEstadoVehiculo } from '../../services/vehiculoEstadoService'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useSede } from '../../contexts/SedeContext'
import { TimeInput24h } from '../../components/ui/TimeInput24h'
import { ExcelColumnFilter, useExcelFilters } from '../../components/ui/DataTable/ExcelColumnFilter'
import { Alerta } from '../../components/ui/alertas'
import { cargarCobrosConductor, textoEstadoCobro } from './components/cobrosConductor'
import { InfoDetalle } from './components/InfoDetalle'
import { InformeGestionModal } from './components/InformeGestionModal'
import type { InfoCobro } from './components/cobrosConductor'
import { showError, showSuccess } from '../../utils/toast'
import {
  Plus,
  Eye,
  Edit2,
  AlertTriangle,
  Car,
  DollarSign,
  FileText,
  TrendingUp,
  X,
  Shield,
  Clock,
  FolderOpen,
  Download,
  CheckCircle,
  History,
  Users,
  FileDown,
  Wrench,
} from 'lucide-react'
import { DateRangeSelector } from '../../components/ui/DateRangeSelector'
import { type ColumnDef, type FilterFn } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { ActionsMenu } from '../../components/ui/ActionsMenu'
import { registrarHistorialVehiculo, registrarHistorialConductor } from '../../services/historialService'
import type {
  SiniestroCompleto,
  SiniestroCategoria,
  SiniestroEstado,
  Seguro,
  SiniestroFormData,
  VehiculoSimple,
  ConductorSimple,
  SiniestroStats
} from '../../types/siniestros.types'
import type { DateRange } from '../../components/ui/DateRangeSelector'
import type { VehiculoEstado } from '../../types/database.types'
import './SiniestrosModule.css'
import './SiniestrosModuleV2.css'
import { SiniestroWizardV2 as SiniestroWizard } from './components/SiniestroWizardV2'
import { ReparacionTicket } from './components/ReparacionTicket'
import { SiniestroSeguimientoV2 as SiniestroSeguimiento } from './components/SiniestroSeguimientoV2'
import { CompaniaTerceroSelect } from './components/CompaniaTerceroSelect'
// El gráfico trae recharts: se carga recién cuando se abre
import { nombreCompaniaTercero } from './components/companiasSeguro'
import type { CasoInforme, DatosInforme } from './components/informeGestionPdf'

import { hoyART } from '../../utils/fechaArgentina'
import { numeroSemana } from '../../utils/semanaISO'
import { formatFecha, formatPlata } from '../../utils/format'
import { formatDateAR, formatDateTimeAR } from '../../utils/dateUtils'
import { PatenteBadge } from '../../components/ui/PatenteBadge'
import { TabsBar, type TabsBarItem } from '../../components/ui/TabsBar'
function toISODateLocal(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseFechaSiniestro(fechaStr: string | undefined | null) {
  if (!fechaStr) return null
  const raw = fechaStr.split('T')[0]
  if (raw.includes('-')) {
    const parts = raw.split('-')
    if (parts.length !== 3) return null
    const [yearStr, monthStr, dayStr] = parts
    const year = Number(yearStr)
    const month = Number(monthStr)
    const day = Number(dayStr)
    if (!year || !month || !day) return null
    return new Date(year, month - 1, day)
  }
  if (raw.includes('/')) {
    const parts = raw.split('/')
    if (parts.length !== 3) return null
    const [dayStr, monthStr, yearStr] = parts
    const year = Number(yearStr)
    const month = Number(monthStr)
    const day = Number(dayStr)
    if (!year || !month || !day) return null
    return new Date(year, month - 1, day)
  }
  return null
}

/** Último registro del seguimiento de un siniestro (para la columna "Última gestión"). */
interface UltimaGestion {
  texto: string
  fecha: string
  autor: string | null
}

const TIPO_GESTION_LABEL: Record<string, string> = {
  nota: 'Nota',
  pago: 'Pago recibido',
  cobro_conductor: 'Cobro a conductor',
  estado_cambio: 'Cambio de estado',
  documento: 'Documento',
}

/**
 * Columnas agregadas en v2 (sql/siniestros_montos.sql, sql/siniestros_gestionado_por.sql).
 * Se leen de la tabla siniestros (la vista v_siniestros_completos no las trae). Si el SQL
 * no se corrió, la consulta falla.
 */
async function cargarColumnasExtra(ids: string[], columnas: string): Promise<Map<string, any>> {
  const TANDA = 100
  const tandas: string[][] = []
  for (let i = 0; i < ids.length; i += TANDA) tandas.push(ids.slice(i, i + TANDA))
  const resultados = await Promise.all(tandas.map(t =>
    (supabase.from('siniestros' as any) as any)
      .select(`id, ${columnas}`)
      .in('id', t)
  ))
  const filas = new Map<string, any>()
  for (const { data, error } of resultados) {
    if (error) throw error
    for (const r of (data || [])) filas.set(r.id, r)
  }
  return filas
}

/** Quién gestiona el siniestro (sql/siniestros_gestionado_por.sql) */
const GESTIONA_LABELS: Record<string, string> = {
  sancor: 'Sancor',
  rda: 'RDA',
  legal: 'Legal',
  toshify: 'Toshify',
}
const SIN_GESTOR = 'Sin definir'
/** Qué se está esperando para avanzar (sql/siniestros_tramite.sql) */
const SITUACION_LABELS: Record<string, string> = {
  doc_conductor: 'Documentación del conductor',
  doc_tercero: 'Documentación del tercero',
  oferta_seguro: 'Respuesta / oferta del seguro',
  pago_seguro: 'Pago del seguro',
  reparacion: 'Reparación en taller',
  legal: 'Mediación / juicio',
  al_dia: 'Nada pendiente',
}

/** Por qué se cerró (sql/siniestros_tramite.sql) */
const MOTIVO_CIERRE_LABELS: Record<string, string> = {
  cobrado_total: 'Cobrado total',
  cobrado_parcial: 'Cobrado parcial',
  rechazado_seguro: 'Rechazado por el seguro',
  cargo_conductor: 'A cargo del conductor',
  sin_reclamo: 'Sin reclamo (culpa propia)',
  desistido: 'Desistido',
  prescripto: 'Prescripto',
}

/** Estados en los que se pide el motivo de cierre */
const ESTADOS_DE_CIERRE = ['CERRADO', 'RECHAZADO']
/** Estados que cuentan como terminados en la fila resumen (el resto, en trámite) */
const ESTADOS_FINALIZADOS = ['CERRADO', 'RECHAZADO', 'COBRADO']

function etiquetaGestor(valor?: string | null) {
  return valor ? (GESTIONA_LABELS[valor] || valor) : SIN_GESTOR
}

/** "45%" (o "" si no hay total: no se muestra nada en vez de un guion suelto) */
function porcentaje(n: number, total: number) {
  return total ? `${Math.round((n / total) * 100)}%` : ''
}

/** Mismo largo de período, justo antes: 9 al 15 nov → 2 al 8 nov. null si es "Todo". */
function periodoAnterior(desde?: string, hasta?: string): { desde: string; hasta: string } | null {
  if (!desde || !hasta) return null
  const dia = 86_400_000
  const d = Date.parse(desde + 'T00:00:00Z')
  const h = Date.parse(hasta + 'T00:00:00Z')
  if (Number.isNaN(d) || Number.isNaN(h)) return null
  const largo = Math.round((h - d) / dia) + 1
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
  return { desde: iso(d - largo * dia), hasta: iso(d - dia) }
}

/**
 * Recupero neto: lo que efectivamente queda de lo recuperado. Lo cobrado del seguro menos
 * el % de la abogada, más lo cobrado al conductor.
 */
function calcularRecuperoNeto(s: {
  total_pagado?: number | null
  cobrado_conductor?: number | null
  porcentaje_abogada?: number | null
}) {
  const { seguro, conductor } = recuperoPorOrigen(s)
  return seguro + conductor
}

/** Recupero separado por quién paga: el seguro (neto del % de la abogada) y el conductor. */
function recuperoPorOrigen(s: {
  total_pagado?: number | null
  cobrado_conductor?: number | null
  porcentaje_abogada?: number | null
}) {
  const pctAbogada = Math.min(100, Math.max(0, Number(s.porcentaje_abogada) || 0))
  return {
    seguro: (Number(s.total_pagado) || 0) * (1 - pctAbogada / 100),
    conductor: Number(s.cobrado_conductor) || 0,
  }
}

/**
 * Resultado del siniestro: el recupero neto menos lo que costó la reparación. El costo es
 * lo pagado al taller; si todavía no se cargó, el presupuesto real.
 */
function calcularResultadoSiniestro(s: {
  presupuesto_real?: number | null
  total_reparacion_pagada?: number | null
  total_pagado?: number | null
  cobrado_conductor?: number | null
  porcentaje_abogada?: number | null
}) {
  const costo = Number(s.total_reparacion_pagada) || Number(s.presupuesto_real) || 0
  const recupero = calcularRecuperoNeto(s)
  if (!costo && !recupero) return null
  return {
    valor: recupero - costo,
    costo,
    costoDe: Number(s.total_reparacion_pagada) ? 'lo pagado al taller' : 'el presupuesto real',
  }
}

/** Texto del tooltip del resultado */
function explicarResultado(costoDe: string, porcentajeAbogada?: number | null) {
  const abogada = Number(porcentajeAbogada) ? ` (menos ${porcentajeAbogada}% de la abogada)` : ''
  return `Cobrado del seguro${abogada} + cobrado al conductor − ${costoDe}`
}

/**
 * Último registro del historial de gestión de cada siniestro. Se prefiere el último que
 * tiene comentario; si ninguno tiene, el último registro (con el nombre del tipo).
 * Se consulta en tandas para no armar una URL gigante con todos los ids.
 */
async function cargarUltimasGestiones(ids: string[]): Promise<Map<string, UltimaGestion>> {
  const TANDA = 100
  const tandas: string[][] = []
  for (let i = 0; i < ids.length; i += TANDA) tandas.push(ids.slice(i, i + TANDA))
  const resultados = await Promise.all(tandas.map(t =>
    (supabase.from('siniestros_seguimientos' as any) as any)
      .select('siniestro_id, tipo_evento, descripcion, created_at, created_by_name')
      .in('siniestro_id', t)
      .order('created_at', { ascending: false })
  ))
  const conTexto = new Map<string, UltimaGestion>()
  const cualquiera = new Map<string, UltimaGestion>()
  for (const { data, error } of resultados) {
    if (error) throw error
    for (const r of (data || []) as { siniestro_id: string; tipo_evento: string; descripcion: string | null; created_at: string; created_by_name: string | null }[]) {
      const texto = (r.descripcion || '').trim()
      if (texto && !conTexto.has(r.siniestro_id)) {
        conTexto.set(r.siniestro_id, { texto, fecha: r.created_at, autor: r.created_by_name })
      }
      if (!cualquiera.has(r.siniestro_id)) {
        cualquiera.set(r.siniestro_id, {
          texto: TIPO_GESTION_LABEL[r.tipo_evento] || r.tipo_evento,
          fecha: r.created_at,
          autor: r.created_by_name,
        })
      }
    }
  }
  for (const [id, g] of cualquiera) if (!conTexto.has(id)) conTexto.set(id, g)
  return conTexto
}

/** Pestañas del formulario de edición (como Conductores): se edita una parte a la vez. */
type PestanaSiniestro = 'evento' | 'descripcion' | 'tercero' | 'gestion' | 'reparacion' | 'seguimiento'

const PESTANAS_SINIESTRO: TabsBarItem<PestanaSiniestro>[] = [
  { id: 'evento', label: 'Evento', icon: AlertTriangle },
  { id: 'descripcion', label: 'Descripción', icon: FileText },
  { id: 'tercero', label: 'Tercero', icon: Users },
  { id: 'gestion', label: 'Gestión y montos', icon: DollarSign },
  { id: 'reparacion', label: 'Reparación', icon: Wrench },
  { id: 'seguimiento', label: 'Seguimiento', icon: History },
]

/** Estados en los que el vehículo circula: no hace falta "Habilitar vehículo". */
const ESTADOS_QUE_CIRCULAN = ['EN_USO', 'PKG_ON_BASE']

export function SiniestrosModuleV2() {
  const { user, profile } = useAuth()
  const { canEditInSubmenu, isAdmin } = usePermissions()
  const { sedeActualId, aplicarFiltroSede, sedeUsuario } = useSede()

  // Permisos específicos para el submenú de siniestros
  // Admin siempre tiene acceso completo
  const canEdit = isAdmin() || canEditInSubmenu('siniestros')

  const [loading, setLoading] = useState(true)
  const [siniestros, setSiniestros] = useState<SiniestroCompleto[]>([])
  const [categorias, setCategorias] = useState<SiniestroCategoria[]>([])
  const [estados, setEstados] = useState<SiniestroEstado[]>([])
  const [seguros, setSeguros] = useState<Seguro[]>([])
  const [vehiculos, setVehiculos] = useState<VehiculoSimple[]>([])
  const [conductores, setConductores] = useState<ConductorSimple[]>([])
  const [vehiculosEstados, setVehiculosEstados] = useState<VehiculoEstado[]>([])
  const [stats, setStats] = useState<SiniestroStats | null>(null)
  const [ultimasGestiones, setUltimasGestiones] = useState<Map<string, UltimaGestion>>(new Map())
  // Cobros a conductor de cada siniestro (estado según facturación + pago confirmado)
  const [cobrosConductor, setCobrosConductor] = useState<Map<string, InfoCobro[]>>(new Map())
  // Oferta del seguro y cobrado al conductor: existen solo si se corrió sql/siniestros_montos.sql
  const [hayMontosNuevos, setHayMontosNuevos] = useState(false)
  // Quién gestiona: existe solo si se corrió sql/siniestros_gestionado_por.sql
  const [hayGestionadoPor, setHayGestionadoPor] = useState(false)
  const [gestionaFilter, setGestionaFilter] = useState<string[]>([])
  // Situación del trámite y motivo de cierre: existen solo si se corrió sql/siniestros_tramite.sql
  const [hayTramite, setHayTramite] = useState(false)
  const [verInforme, setVerInforme] = useState(false)
  // Por defecto la semana en curso (lunes a domingo, hora Argentina). Desde el
  // calendario se puede pasar a Mes, Año o un Rango libre de fechas.
  const [dateRangeSemana, setDateRangeSemana] = useState<DateRange | null>(() => {
    const [a, m, d] = hoyART().split('-').map(Number)
    const lunes = new Date(Date.UTC(a, m - 1, d - ((new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7)))
    const domingo = new Date(lunes.getTime() + 6 * 86400000)
    const iso = (f: Date) => f.toISOString().slice(0, 10)
    return {
      startDate: iso(lunes),
      endDate: iso(domingo),
      label: `Semana ${numeroSemana(iso(lunes))}`,
      type: 'week',
    }
  })

  // Filtros por columna tipo Excel con Portal
  const { openFilterId, setOpenFilterId } = useExcelFilters()
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [categoriaFilter, setCategoriaFilter] = useState<string[]>([])
  const [responsableFilter, setResponsableFilter] = useState<string[]>([])
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [pestanaEdicion, setPestanaEdicion] = useState<PestanaSiniestro>('evento')
  const [selectedSiniestro, setSelectedSiniestro] = useState<SiniestroCompleto | null>(null)
  const [formData, setFormData] = useState<SiniestroFormData>({
    categoria_id: '',
    estado_id: '',
    fecha_siniestro: hoyART(),
    responsable: 'sin_info',
    hay_lesionados: false,
    enviado_abogada: false,
    enviado_alliance: false
  })
  const [saving, setSaving] = useState(false)

  // Cargar datos iniciales
  useEffect(() => {
    cargarDatos()
  }, [sedeActualId])

  async function cargarDatos() {
    setLoading(true)
    try {
      // Cargar catálogos en paralelo (incluyendo estados de conductores)
      const [
        categoriasRes,
        estadosRes,
        segurosRes,
        vehiculosRes,
        estadosCondRes,
        siniestrosRes,
        vehiculosEstadosRes
      ] = await Promise.all([
        supabase.from('siniestros_categorias' as any).select('id, codigo, nombre, descripcion, es_robo, orden').eq('is_active', true).order('orden'),
        supabase.from('siniestros_estados' as any).select('id, codigo, nombre, color, orden').eq('is_active', true).order('orden'),
        supabase.from('seguros' as any).select('id, nombre').eq('is_active', true).order('nombre'),
        aplicarFiltroSede(supabase.from('vehiculos').select('id, patente, marca, modelo, vehiculos_estados(codigo)')).order('patente'),
        supabase.from('conductores_estados').select('id, codigo') as unknown as Promise<{ data: { id: string; codigo: string }[] | null; error: any }>,
        aplicarFiltroSede(supabase.from('v_siniestros_completos' as any).select('*')).order('fecha_siniestro', { ascending: false }).limit(2000),
        supabase.from('vehiculos_estados').select('id, codigo, descripcion').eq('activo', true).order('descripcion')
      ])

      // Traer TODOS los conductores (activos y de baja) con su estado — siniestros/cobros
      // son hechos históricos y pueden requerir referenciar a un conductor ya dado de baja
      const estadosMap = new Map<string, string>()
      for (const e of (estadosCondRes.data || [])) estadosMap.set(e.id, e.codigo)
      const conductoresRes = await aplicarFiltroSede(supabase.from('conductores').select('id, nombres, apellidos, estado_id').not(...FILTRO_SIN_INTERNOS)).order('apellidos')

      const categoriasData = categoriasRes.data as SiniestroCategoria[] | null
      const estadosData = estadosRes.data as SiniestroEstado[] | null
      const segurosData = segurosRes.data as Seguro[] | null
      const vehiculosData = vehiculosRes.data as VehiculoSimple[] | null
      const conductoresData = conductoresRes.data as { id: string; nombres: string; apellidos: string; estado_id: string | null }[] | null
      const siniestrosData = siniestrosRes.data as SiniestroCompleto[] | null
      const vehiculosEstadosData = vehiculosEstadosRes.data as VehiculoEstado[] | null

      setCategorias(categoriasData || [])
      setEstados(estadosData || [])
      setSeguros(segurosData || [])
      setVehiculos(vehiculosData || [])
      setConductores((conductoresData || []).map(c => {
        const estadoCodigo = c.estado_id ? estadosMap.get(c.estado_id) : undefined
        const isBaja = estadoCodigo?.toUpperCase() === 'BAJA'
        return {
          id: c.id,
          nombres: c.nombres,
          apellidos: c.apellidos,
          nombre_completo: isBaja
            ? `${c.nombres} ${c.apellidos} [BAJA]`
            : `${c.nombres} ${c.apellidos}`,
          estado_codigo: estadoCodigo,
        }
      }))
      // Montos nuevos (oferta del seguro, cobrado al conductor): si falla, sin esos campos
      const idsSiniestros = (siniestrosData || []).map(s => s.id)
      try {
        const montos = await cargarColumnasExtra(idsSiniestros, 'oferta_seguro, cobrado_conductor')
        for (const s of (siniestrosData || [])) {
          const m = montos.get(s.id)
          s.oferta_seguro = m?.oferta_seguro ?? undefined
          s.cobrado_conductor = m?.cobrado_conductor ?? undefined
        }
        setHayMontosNuevos(true)
      } catch (error) {
        console.error('Montos nuevos de siniestros no disponibles (falta sql/siniestros_montos.sql):', error)
        setHayMontosNuevos(false)
      }
      // Quién gestiona: si falla, sin ese campo
      try {
        const gestores = await cargarColumnasExtra(idsSiniestros, 'gestionado_por')
        for (const s of (siniestrosData || [])) {
          s.gestionado_por = gestores.get(s.id)?.gestionado_por ?? undefined
        }
        setHayGestionadoPor(true)
      } catch (error) {
        console.error('Quién gestiona no disponible (falta sql/siniestros_gestionado_por.sql):', error)
        setHayGestionadoPor(false)
      }
      // Situación del trámite y motivo de cierre: si falla, sin esos campos
      try {
        const tramites = await cargarColumnasExtra(idsSiniestros, 'situacion_tramite, motivo_cierre')
        for (const s of (siniestrosData || [])) {
          const t = tramites.get(s.id)
          s.situacion_tramite = t?.situacion_tramite ?? undefined
          s.motivo_cierre = t?.motivo_cierre ?? undefined
        }
        setHayTramite(true)
      } catch (error) {
        console.error('Situación del trámite no disponible (falta sql/siniestros_tramite.sql):', error)
        setHayTramite(false)
      }
      setSiniestros(siniestrosData || [])
      setVehiculosEstados(vehiculosEstadosData || [])

      // Última gestión de cada siniestro: si falla, la lista se muestra igual
      try {
        setUltimasGestiones(await cargarUltimasGestiones((siniestrosData || []).map(s => s.id)))
      } catch (error) {
        console.error('No se pudo cargar la última gestión de los siniestros:', error)
      }
      try {
        const { porSiniestro } = await cargarCobrosConductor((siniestrosData || []).map(s => s.id))
        setCobrosConductor(porSiniestro)
      } catch (error) {
        console.error('No se pudo cargar el estado de los cobros a conductor:', error)
      }

      // Calcular estadísticas
      if (siniestrosData) {
        calcularStats(siniestrosData, estadosData || [], categoriasData || [])
      }

      // Set estado inicial si hay estados
      if (estadosData && estadosData.length > 0 && !formData.estado_id) {
        const estadoRegistrado = estadosData.find(e => e.codigo === 'REGISTRADO')
        if (estadoRegistrado) {
          setFormData(prev => ({ ...prev, estado_id: estadoRegistrado.id }))
        }
      }
    } catch {
      showError('Error', 'No se pudieron cargar los datos')
    } finally {
      setLoading(false)
    }
  }

  function calcularStats(data: SiniestroCompleto[], estadosData: SiniestroEstado[], categoriasData: SiniestroCategoria[]) {
    const esCategoriaRobo = (nombre: string | undefined | null) => {
      if (!nombre) return false
      const normalized = nombre.toLowerCase().trim()
      return normalized === 'robo' || normalized === 'robo parcial'
    }

    const diffDias = (from: Date, to: Date) => {
      const fromDate = new Date(from.getFullYear(), from.getMonth(), from.getDate())
      const toDate = new Date(to.getFullYear(), to.getMonth(), to.getDate())
      const diffMs = fromDate.getTime() - toDate.getTime()
      const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      return dias < 0 ? 0 : dias
    }

    const robos = data.filter(s => esCategoriaRobo(s.categoria_nombre))

    const siniestrosSinRobo = data.filter(s => !esCategoriaRobo(s.categoria_nombre))

    const today = new Date()

    const fechasRobos = robos
      .map(s => parseFechaSiniestro(s.fecha_siniestro))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())

    const fechasSiniestros = siniestrosSinRobo
      .map(s => parseFechaSiniestro(s.fecha_siniestro))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())

    const diasDesdeUltimoRobo = fechasRobos.length >= 1 ? diffDias(today, fechasRobos[0]) : null
    const diasEntreUltimosRobos = fechasRobos.length >= 2 ? diffDias(fechasRobos[0], fechasRobos[1]) : null

    const diasDesdeUltimoSiniestro = fechasSiniestros.length >= 1 ? diffDias(today, fechasSiniestros[0]) : null
    const diasEntreUltimosSiniestros = fechasSiniestros.length >= 2 ? diffDias(fechasSiniestros[0], fechasSiniestros[1]) : null

    // Conteo en una sola pasada O(n) en vez de O(n*k) con múltiples .filter()
    const conteoEstado = new Map<string, number>()
    const conteoCategoria = new Map<string, number>()
    const conteoResponsable = new Map<string, number>()
    for (const s of data) {
      conteoEstado.set(s.estado_id, (conteoEstado.get(s.estado_id) || 0) + 1)
      conteoCategoria.set(s.categoria_id, (conteoCategoria.get(s.categoria_id) || 0) + 1)
      if (s.responsable) conteoResponsable.set(s.responsable, (conteoResponsable.get(s.responsable) || 0) + 1)
    }
    const porEstado = estadosData.map(e => ({
      estado: e.nombre,
      color: e.color,
      cantidad: conteoEstado.get(e.id) || 0
    })).filter(e => e.cantidad > 0)

    const porCategoria = categoriasData.map(c => ({
      categoria: c.nombre,
      cantidad: conteoCategoria.get(c.id) || 0
    })).filter(c => c.cantidad > 0)

    const porResponsable = [
      { responsable: 'Tercero', cantidad: conteoResponsable.get('tercero') || 0 },
      { responsable: 'Conductor', cantidad: conteoResponsable.get('conductor') || 0 },
      { responsable: 'Compartida', cantidad: conteoResponsable.get('compartida') || 0 }
    ].filter(r => r.cantidad > 0)

    setStats({
      total: data.length,
      por_estado: porEstado,
      por_categoria: porCategoria,
      por_responsable: porResponsable,
      presupuesto_total: data.reduce((sum, s) => sum + (s.presupuesto_real || 0), 0),
      total_cobrado: data.reduce((sum, s) => sum + (s.total_pagado || 0), 0),
      con_lesionados: data.filter(s => s.hay_lesionados).length,
      total_recuperados: data.reduce((sum, s) => sum + (s.presupuesto_aprobado_seguro || 0), 0),
      dias_desde_ultimo_robo: diasDesdeUltimoRobo,
      dias_entre_ultimos_robos: diasEntreUltimosRobos,
      dias_desde_ultimo_siniestro: diasDesdeUltimoSiniestro,
      dias_entre_ultimos_siniestros: diasEntreUltimosSiniestros
    })
  }

  // Listas de valores únicos para filtros
  const patentesUnicas = useMemo(() =>
    [...new Set(siniestros.map(s => s.vehiculo_patente).filter(Boolean))].sort() as string[]
  , [siniestros])

  const conductoresUnicos = useMemo(() =>
    [...new Set(siniestros.map(s => s.conductor_display).filter(Boolean))].sort() as string[]
  , [siniestros])

  const categoriasUnicas = useMemo(() =>
    [...new Set(siniestros.map(s => s.categoria_nombre).filter(Boolean))].sort() as string[]
  , [siniestros])

  const gestoresUnicos = useMemo(() =>
    [...new Set(siniestros.map(s => etiquetaGestor(s.gestionado_por)))].sort()
  , [siniestros])

  const estadosUnicos = useMemo(() =>
    [...new Set(siniestros.map(s => s.estado_nombre).filter(Boolean))].sort() as string[]
  , [siniestros])

  const customGlobalFilter = useMemo<FilterFn<SiniestroCompleto>>(() => {
    return (row, _columnId, filterValue) => {
      if (!filterValue || typeof filterValue !== 'string') return true
      
      const searchLower = filterValue.toLowerCase().trim()
      const data = row.original

      // Construir un string con todos los datos relevantes para la búsqueda
      // Incluimos campos clave donde el usuario podría buscar "robo", "choque", etc.
      const searchableText = [
        data.categoria_nombre,
        data.estado_nombre,
        data.vehiculo_patente,
        data.conductor_display,
        data.responsable,
        data.descripcion_danos,
        data.relato,
        data.ubicacion,
        data.tercero_nombre,
        data.tercero_vehiculo,
        data.tercero_seguro,
        data.nro_siniestro_seguro
      ].filter(Boolean).join(' ').toLowerCase()

      // Buscar término completo
      if (searchableText.includes(searchLower)) return true
      
      // Buscar por palabras individuales
      const words = searchLower.split(/\s+/).filter(w => w.length > 0)
      if (words.length > 1) {
        return words.every(word => searchableText.includes(word))
      }
      
      return false
    }
  }, [])

  const siniestrosSemana = useMemo(() => {
    if (!dateRangeSemana || dateRangeSemana.type === 'all') {
      return [...siniestros]
    }
    return siniestros.filter(s => {
      const fecha = parseFechaSiniestro(s.fecha_siniestro)
      if (!fecha) return false
      const iso = toISODateLocal(fecha)
      if (dateRangeSemana.startDate && iso < dateRangeSemana.startDate) return false
      if (dateRangeSemana.endDate && iso > dateRangeSemana.endDate) return false
      return true
    })
  }, [siniestros, dateRangeSemana])

  const siniestrosFiltrados = useMemo(() => {
    let filtered = [...siniestrosSemana]

    // Sets para lookup O(1) en vez de Array.includes() O(m) en cada fila.
    const patenteSet = new Set(patenteFilter)
    const conductorSet = new Set(conductorFilter)
    const categoriaSet = new Set(categoriaFilter)
    const responsableSet = new Set(responsableFilter)
    const estadoSet = new Set(estadoFilter)
    const gestionaSet = new Set(gestionaFilter)

    if (patenteSet.size > 0) {
      filtered = filtered.filter(s => patenteSet.has(s.vehiculo_patente || ''))
    }
    if (conductorSet.size > 0) {
      filtered = filtered.filter(s => conductorSet.has(s.conductor_display || ''))
    }
    if (categoriaSet.size > 0) {
      filtered = filtered.filter(s => categoriaSet.has(s.categoria_nombre || ''))
    }
    if (responsableSet.size > 0) {
      filtered = filtered.filter(s => responsableSet.has(s.responsable || ''))
    }
    if (estadoSet.size > 0) {
      filtered = filtered.filter(s => estadoSet.has(s.estado_nombre || ''))
    }
    if (gestionaSet.size > 0) {
      filtered = filtered.filter(s => gestionaSet.has(etiquetaGestor(s.gestionado_por)))
    }

    return filtered
  }, [siniestrosSemana, patenteFilter, conductorFilter, categoriaFilter, responsableFilter, estadoFilter, gestionaFilter])

  // Filtros externos para mostrar en la barra de filtros del DataTable
  const externalFilters = useMemo(() => {
    const filters: Array<{ id: string; label: string; onClear: () => void }> = []
    if (patenteFilter.length > 0) {
      filters.push({
        id: 'patente',
        label: `Patente: ${patenteFilter.length === 1 ? patenteFilter[0] : `${patenteFilter.length} seleccionados`}`,
        onClear: () => setPatenteFilter([])
      })
    }
    if (conductorFilter.length > 0) {
      filters.push({
        id: 'conductor',
        label: `Conductor: ${conductorFilter.length === 1 ? conductorFilter[0] : `${conductorFilter.length} seleccionados`}`,
        onClear: () => setConductorFilter([])
      })
    }
    if (categoriaFilter.length > 0) {
      filters.push({
        id: 'categoria',
        label: `Categoría: ${categoriaFilter.length === 1 ? categoriaFilter[0] : `${categoriaFilter.length} seleccionados`}`,
        onClear: () => setCategoriaFilter([])
      })
    }
    if (responsableFilter.length > 0) {
      filters.push({
        id: 'responsable',
        label: `Responsable: ${responsableFilter.length === 1 ? responsableFilter[0] : `${responsableFilter.length} seleccionados`}`,
        onClear: () => setResponsableFilter([])
      })
    }
    if (estadoFilter.length > 0) {
      filters.push({
        id: 'estado',
        label: `Estado: ${estadoFilter.length === 1 ? estadoFilter[0] : `${estadoFilter.length} seleccionados`}`,
        onClear: () => setEstadoFilter([])
      })
    }
    if (gestionaFilter.length > 0) {
      filters.push({
        id: 'gestiona',
        label: `Gestiona: ${gestionaFilter.length === 1 ? gestionaFilter[0] : `${gestionaFilter.length} seleccionados`}`,
        onClear: () => setGestionaFilter([])
      })
    }
    return filters
  }, [patenteFilter, conductorFilter, categoriaFilter, responsableFilter, estadoFilter, gestionaFilter])

  const handleClearAllFilters = () => {
    setPatenteFilter([])
    setConductorFilter([])
    setCategoriaFilter([])
    setResponsableFilter([])
    setEstadoFilter([])
    setGestionaFilter([])
  }

  // Columnas para DataTable con filtros tipo Excel
  // Estado actual de cada vehículo (para mostrar "Habilitar vehículo" solo si no circula)
  const estadoPorVehiculo = useMemo(() => {
    const m = new Map<string, string>()
    for (const v of vehiculos) if (v.vehiculos_estados?.codigo) m.set(v.id, v.vehiculos_estados.codigo)
    return m
  }, [vehiculos])

  const siniestrosColumns = useMemo<ColumnDef<SiniestroCompleto>[]>(() => [
    {
      accessorKey: 'fecha_siniestro',
      header: 'Fecha',
      cell: ({ row }) => {
        const hora = (row.original.hora_siniestro || '').slice(0, 5)
        return (
          <div style={{ lineHeight: 1.2, whiteSpace: 'nowrap' }}>
            <div>{formatDate(row.original.fecha_siniestro)}</div>
            {hora && <div style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{hora}</div>}
          </div>
        )
      }
    },
    {
      id: 'patente_conductor',
      accessorKey: 'conductor_display',
      header: () => (
        <ExcelColumnFilter
          label="Patente / Conductor"
          options={conductoresUnicos}
          selectedValues={conductorFilter}
          onSelectionChange={setConductorFilter}
          filterId="conductor"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const resp = row.original.responsable
        const color = resp === 'tercero' ? 'green' : resp === 'conductor' ? 'red' : resp === 'compartida' ? 'yellow' : 'gray'
        const labels: Record<string, string> = { tercero: 'Tercero', conductor: 'Conductor', sin_info: 'Sin Info', compartida: 'Compartida' }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {row.original.conductor_display || '-'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
              <PatenteBadge patente={row.original.vehiculo_patente} size="sm" />
              {resp && (
                <span className={`dt-badge dt-badge-${color}`} style={{ fontSize: '9px', padding: '1px 6px' }}>
                  {labels[resp] || resp}
                </span>
              )}
            </div>
          </div>
        )
      }
    },
    {
      accessorKey: 'categoria_nombre',
      header: () => (
        <ExcelColumnFilter
          label="Categoria"
          options={categoriasUnicas}
          selectedValues={categoriaFilter}
          onSelectionChange={setCategoriaFilter}
          filterId="categoria"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => row.original.categoria_nombre || '-'
    },
    {
      accessorKey: 'estado_nombre',
      header: () => (
        <ExcelColumnFilter
          label="Estado"
          options={estadosUnicos}
          selectedValues={estadoFilter}
          onSelectionChange={setEstadoFilter}
          filterId="estado"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const color = row.original.estado_color || 'gray'
        const extra = row.original.motivo_cierre
          ? MOTIVO_CIERRE_LABELS[row.original.motivo_cierre]
          : row.original.situacion_tramite ? `Espera: ${SITUACION_LABELS[row.original.situacion_tramite]}` : ''
        return (
          <div className="estado-celda">
            <span className={`dt-badge dt-badge-${color}`}>{row.original.estado_nombre}</span>
            {extra && <span className="estado-celda-extra" title={extra}>{extra}</span>}
          </div>
        )
      }
    },
    ...(hayGestionadoPor ? [{
      id: 'gestiona',
      accessorFn: (s: SiniestroCompleto) => etiquetaGestor(s.gestionado_por),
      header: () => (
        <ExcelColumnFilter
          label="Gestiona"
          options={gestoresUnicos}
          selectedValues={gestionaFilter}
          onSelectionChange={setGestionaFilter}
          filterId="gestiona"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }: { row: { original: SiniestroCompleto } }) => row.original.gestionado_por
        ? <span className={`gestiona-badge gestiona-${row.original.gestionado_por}`}>{etiquetaGestor(row.original.gestionado_por)}</span>
        : <span className="sin-ultima-gestion">{SIN_GESTOR}</span>
    } as ColumnDef<SiniestroCompleto>] : []),
    {
      id: 'ultima_gestion',
      header: 'Última gestión',
      accessorFn: (s) => ultimasGestiones.get(s.id)?.fecha || '',
      cell: ({ row }) => {
        const g = ultimasGestiones.get(row.original.id)
        if (!g) {
          return (
            <button
              type="button"
              className="ultima-gestion ultima-gestion--vacia"
              onClick={() => abrirSeguimiento(row.original)}
              title="Todavía no hay gestiones. Clic para cargar la primera nota."
            >
              <span className="sin-ultima-gestion">Sin gestiones</span>
              <span className="ultima-gestion-agregar">+ Agregar nota</span>
            </button>
          )
        }
        return (
          <button
            type="button"
            className="ultima-gestion"
            onClick={() => abrirSeguimiento(row.original)}
            title={`${g.texto}\n\n${formatDateTimeAR(g.fecha)}${g.autor ? ` · ${g.autor}` : ''}\n(clic para ver el seguimiento)`}
          >
            <span className="ultima-gestion-texto">{g.texto}</span>
            <span className="ultima-gestion-meta">
              {formatDateAR(g.fecha)}{g.autor ? ` · ${g.autor}` : ''}
            </span>
          </button>
        )
      }
    },
    {
      id: 'cobro_conductor',
      header: 'Cobro conductor',
      accessorFn: (s) => (cobrosConductor.get(s.id) || []).reduce((a, c) => a + (c.confirmadoMonto || 0), 0),
      cell: ({ row }) => {
        const lista = cobrosConductor.get(row.original.id)
        if (!lista?.length) return <span className="sin-ultima-gestion">-</span>
        const enviado = lista.reduce((a, c) => a + c.monto, 0)
        const confirmado = lista.reduce((a, c) => a + (c.confirmadoMonto || 0), 0)
        const deBaja = lista.some(c => c.conductorDeBaja)
        const sinConfirmar = lista.filter(c => c.confirmadoMonto == null)
        const estado = sinConfirmar.length ? textoEstadoCobro(sinConfirmar[0]) : 'Confirmado'
        return (
          <button
            type="button"
            className="cobro-celda"
            onClick={() => abrirSeguimiento(row.original)}
            title={`${lista.map(c => `${formatMoney(c.monto)}: ${textoEstadoCobro(c)}${c.confirmadoMonto != null ? ` · confirmado ${formatMoney(c.confirmadoMonto)}` : ' · sin confirmar'}`).join('\n')}${deBaja ? '\n\nConductor de baja: el sistema puede darlo por pagado al cruzarlo con la garantía.' : ''}\n(clic para ver el seguimiento)`}
          >
            <span className="cobro-celda-montos">
              <strong>{formatMoney(confirmado)}</strong> de {formatMoney(enviado)}
            </span>
            <span className="cobro-celda-estado">
              {deBaja && <AlertTriangle size={12} className="cobro-celda-baja" />}
              {estado}
            </span>
          </button>
        )
      }
    },
    {
      accessorKey: 'presupuesto_real',
      header: 'Presupuesto',
      cell: ({ row }) => {
        const val = row.original.presupuesto_real
        return val ? <span style={{ fontWeight: 600, color: '#059669' }}>{formatMoney(val)}</span> : '-'
      }
    },
    {
      id: 'acciones',
      size: 110,
      header: 'Acciones',
      cell: ({ row }) => {
        const hasVehiculo = !!row.original.vehiculo_id
        const hasDrive = !!row.original.carpeta_drive_url
        // "Habilitar vehículo" solo tiene sentido si el auto hoy NO circula (taller,
        // siniestrado, PKG OFF, retenido...). Si sigue En uso o en PKG ON (p. ej. un choque
        // leve) no se ofrece. (habilitado_circular no existe en la tabla: venía siempre vacío.)
        const estadoVehiculo = row.original.vehiculo_id ? estadoPorVehiculo.get(row.original.vehiculo_id) : undefined
        const vehiculoCircula = !!estadoVehiculo && ESTADOS_QUE_CIRCULAN.includes(estadoVehiculo)

        return (
          <ActionsMenu
            maxVisible={2}
            actions={[
              { icon: <Eye size={15} />, label: 'Ver detalle', onClick: () => handleVerSiniestro(row.original) },
              { icon: <Edit2 size={15} />, label: 'Editar', onClick: () => handleEditarSiniestro(row.original), variant: 'info' },
              {
                icon: <FolderOpen size={15} />,
                label: hasDrive ? 'Carpeta de Drive' : 'Sin carpeta de Drive',
                onClick: () => { if (hasDrive) window.open(row.original.carpeta_drive_url!, '_blank') },
                disabled: !hasDrive,
                variant: hasDrive ? 'success' : undefined,
              },
              {
                icon: <CheckCircle size={15} />,
                label: 'Habilitar vehículo',
                onClick: () => handleHabilitarVehiculo(row.original),
                hidden: !hasVehiculo || vehiculoCircula,
                variant: 'warning',
              },
            ]}
          />
        )
      }
    },
  ], [patentesUnicas, patenteFilter, conductoresUnicos, conductorFilter, categoriasUnicas, categoriaFilter, responsableFilter, estadosUnicos, estadoFilter, openFilterId, canEdit, estadoPorVehiculo, ultimasGestiones, cobrosConductor, hayGestionadoPor, gestoresUnicos, gestionaFilter])

  function handleNuevoSiniestro() {
    const estadoRegistrado = estados.find(e => e.codigo === 'REGISTRADO')
    setFormData({
      categoria_id: '',
      estado_id: estadoRegistrado?.id || '',
      fecha_siniestro: hoyART(),
      responsable: 'sin_info',
      hay_lesionados: false,
      enviado_abogada: false,
      enviado_alliance: false,
      habilitado_circular: true // Por defecto habilitado
    })
    setSelectedSiniestro(null)
    setModalMode('create')
    setShowModal(true)
  }

  /** Seguimiento: pestaña del editor (o el detalle, de solo lectura, sin permiso de editar) */
  function abrirSeguimiento(siniestro: SiniestroCompleto) {
    if (canEdit) handleEditarSiniestro(siniestro, 'seguimiento')
    else handleVerSiniestro(siniestro)
  }

  function handleVerSiniestro(siniestro: SiniestroCompleto) {
    setSelectedSiniestro(siniestro)
    setModalMode('view')
    setShowModal(true)
  }

  function handleEditarSiniestro(siniestro: SiniestroCompleto, pestana: PestanaSiniestro = 'evento') {
    setPestanaEdicion(pestana)
    setSelectedSiniestro(siniestro)
    setFormData({
      vehiculo_id: siniestro.vehiculo_id || undefined,
      conductor_id: siniestro.conductor_id || undefined,
      categoria_id: siniestro.categoria_id,
      estado_id: siniestro.estado_id,
      seguro_id: siniestro.seguro_id || undefined,
      fecha_siniestro: siniestro.fecha_siniestro.split('T')[0],
      hora_siniestro: siniestro.hora_siniestro || undefined,
      ubicacion: siniestro.ubicacion || undefined,
      responsable: siniestro.responsable,
      hay_lesionados: siniestro.hay_lesionados,
      descripcion_danos: siniestro.descripcion_danos || undefined,
      relato: siniestro.relato || undefined,
      tercero_nombre: siniestro.tercero_nombre || undefined,
      tercero_dni: siniestro.tercero_dni || undefined,
      tercero_telefono: siniestro.tercero_telefono || undefined,
      tercero_vehiculo: siniestro.tercero_vehiculo || undefined,
      tercero_seguro: siniestro.tercero_seguro || undefined,
      tercero_poliza: siniestro.tercero_poliza || undefined,
      carpeta_drive_url: siniestro.carpeta_drive_url || undefined,
      enviado_abogada: siniestro.enviado_abogada,
      enviado_alliance: siniestro.enviado_alliance,
      nro_siniestro_seguro: siniestro.nro_siniestro_seguro || undefined,
      presupuesto_real: siniestro.presupuesto_real || undefined,
      presupuesto_enviado_seguro: siniestro.presupuesto_enviado_seguro || undefined,
      presupuesto_aprobado_seguro: siniestro.presupuesto_aprobado_seguro || undefined,
      fecha_pago_estimada: siniestro.fecha_pago_estimada || undefined,
      total_pagado: siniestro.total_pagado || undefined,
      porcentaje_abogada: siniestro.porcentaje_abogada || undefined,
      observaciones: siniestro.observaciones || undefined,
      habilitado_circular: (siniestro as any).habilitado_circular ?? true,
      costos_reparacion: (siniestro as any).costos_reparacion || undefined,
      total_reparacion_pagada: (siniestro as any).total_reparacion_pagada || undefined,
      oferta_seguro: siniestro.oferta_seguro ?? undefined,
      cobrado_conductor: siniestro.cobrado_conductor ?? undefined,
      gestionado_por: siniestro.gestionado_por || undefined,
      situacion_tramite: siniestro.situacion_tramite || undefined,
      motivo_cierre: siniestro.motivo_cierre || undefined,
      fecha_cierre: (siniestro as any).fecha_cierre || undefined
    })
    setModalMode('edit')
    setShowModal(true)
  }

  async function handleGuardar() {
    if (!formData.categoria_id || !formData.estado_id || !formData.fecha_siniestro) {
      // Los obligatorios están en la pestaña Evento
      setPestanaEdicion('evento')
      showError('Error', 'Complete los campos requeridos')
      return
    }

    const estadoElegido = estados.find(e => e.id === formData.estado_id)?.codigo || ''
    const esCierre = ESTADOS_DE_CIERRE.includes(estadoElegido)
    if (hayTramite && modalMode === 'edit' && esCierre && !formData.motivo_cierre) {
      setPestanaEdicion('evento')
      showError('Falta el motivo de cierre', 'Elegí por qué se cierra el siniestro')
      return
    }

    setSaving(true)
    try {
      // Extraer campos temporales del wizard y campos que no existen en la tabla
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _finalizarAsignacion, _asignacionId, estado_vehiculo, habilitado_circular, ...formDataClean } = formData as any
      // Sin sql/siniestros_montos.sql estas columnas no existen y el guardado fallaría
      // cobrado_conductor no se guarda desde el formulario: lo calcula "Confirmar pago"
      delete formDataClean.cobrado_conductor
      if (!hayMontosNuevos) delete formDataClean.oferta_seguro
      if (!hayGestionadoPor) delete formDataClean.gestionado_por
      else formDataClean.gestionado_por = formDataClean.gestionado_por || null
      if (!hayTramite) {
        delete formDataClean.situacion_tramite
        delete formDataClean.motivo_cierre
      } else {
        formDataClean.situacion_tramite = formDataClean.situacion_tramite || null
        // El motivo solo tiene sentido si el siniestro está cerrado o rechazado
        formDataClean.motivo_cierre = esCierre ? (formDataClean.motivo_cierre || null) : null
      }

      const dataToSave = {
        ...formDataClean,
        fecha_siniestro: new Date(formDataClean.fecha_siniestro).toISOString(),
        created_by: user?.id
      }

      if (modalMode === 'create') {
        const { error } = await (supabase.from('siniestros' as any) as any).insert({
          ...dataToSave,
          sede_id: sedeActualId || sedeUsuario?.id,
          created_by_name: profile?.full_name || 'Sistema'
        })
        if (error) throw error

        // Usar fecha + hora del siniestro (no la fecha actual) para cerrar asignaciones
        // Así facturación corta en el momento real del evento, no cuando se carga en el sistema
        const fechaSiniestroStr = formDataClean.fecha_siniestro
        const horaSiniestroStr = formDataClean.hora_siniestro || '00:00:00'
        const fechaCierre = new Date(`${fechaSiniestroStr}T${horaSiniestroStr}`).toISOString()

        // Si se seleccionó un estado para el vehículo, actualizarlo
        if (estado_vehiculo && formDataClean.vehiculo_id) {
          const estadoSeleccionado = vehiculosEstados.find(e => e.codigo === estado_vehiculo)
          if (estadoSeleccionado) {
            await actualizarEstadoVehiculo(formDataClean.vehiculo_id, estadoSeleccionado.id,
              'Siniestro registrado', { updated_by: profile?.full_name || 'Sistema' })
          }

          // Historial: registrar cambio de estado del vehículo por siniestro
          registrarHistorialVehiculo({
            vehiculoId: formDataClean.vehiculo_id,
            tipoEvento: 'siniestro',
            estadoNuevo: estado_vehiculo,
            detalles: {
              accion: 'crear_siniestro',
              categoria_id: formDataClean.categoria_id,
              responsable: formDataClean.responsable,
              fecha_siniestro: formDataClean.fecha_siniestro,
            },
            modulo: 'siniestros',
            sedeId: sedeActualId || sedeUsuario?.id,
          })

          // Estados que finalizan asignaciones
          const estadosFinalizanAsignacion = [
            'SINIESTRADO',
            'TALLER_CHAPA_PINTURA',
            'TALLER_CP_PAINT_CARS',
            'TALLER_CP_ANDRADA',
            'CORPORATIVO', 
            'PKG_OFF_BASE',
            'PKG_OFF_FRANCIA',
            'DESTRUCCION_TOTAL',
            'ROBO',
            'RETENIDO_COMISARIA'
          ]

          // Si el estado requiere finalizar asignaciones, buscar y finalizar TODAS las activas del vehículo
          if (estadosFinalizanAsignacion.includes(estado_vehiculo)) {
            const { data: asignacionesActivas } = await (supabase as any)
              .from('asignaciones')
              .select('id, asignaciones_conductores(conductor_id)')
              .eq('vehiculo_id', formDataClean.vehiculo_id)
              .in('estado', ['activa', 'programado'])

            if (asignacionesActivas && asignacionesActivas.length > 0) {
              const asignacionIds = asignacionesActivas.map((a: any) => a.id)

              // Finalizar conductores (usa fecha del siniestro, no fecha actual)
              await (supabase as any)
                .from('asignaciones_conductores')
                .update({ estado: 'completado', fecha_fin: fechaCierre })
                .in('asignacion_id', asignacionIds)
                .in('estado', ['asignado', 'activo'])

              // Finalizar asignaciones (usa fecha del siniestro, no fecha actual)
              await (supabase as any)
                .from('asignaciones')
                .update({
                  estado: 'finalizada',
                  fecha_fin: fechaCierre,
                  notas: `[AUTO-CERRADA] Siniestro - Vehículo cambió a estado: ${estado_vehiculo}`,
                  updated_by: profile?.full_name || 'Sistema'
                })
                .in('id', asignacionIds)

              // Historial: registrar siniestro para cada conductor afectado
              for (const asig of asignacionesActivas as any[]) {
                const conductoresAsig = asig.asignaciones_conductores || []
                for (const ac of conductoresAsig) {
                  if (ac.conductor_id) {
                    registrarHistorialConductor({
                      conductorId: ac.conductor_id,
                      tipoEvento: 'siniestro',
                      detalles: {
                        accion: 'asignacion_finalizada_por_siniestro',
                        vehiculo_id: formDataClean.vehiculo_id,
                        estado_vehiculo: estado_vehiculo,
                        asignacion_id: asig.id,
                      },
                      modulo: 'siniestros',
                      sedeId: sedeActualId || sedeUsuario?.id,
                    })
                  }
                }
              }
            }
          }
        }

        showSuccess('Siniestro registrado', estado_vehiculo ? 'El estado del vehículo y asignaciones fueron actualizados' : undefined)
      } else if (modalMode === 'edit' && selectedSiniestro) {
        const { error } = await (supabase.from('siniestros' as any) as any).update({
          ...dataToSave,
          updated_by: profile?.full_name || 'Sistema'
        }).eq('id', selectedSiniestro.id)
        if (error) throw error

        // Usar fecha + hora del siniestro (no la fecha actual) para cerrar asignaciones
        const fechaSiniestroStrEdit = formDataClean.fecha_siniestro
        const horaSiniestroStrEdit = formDataClean.hora_siniestro || '00:00:00'
        const fechaCierreEdit = new Date(`${fechaSiniestroStrEdit}T${horaSiniestroStrEdit}`).toISOString()

        // Si se seleccionó un estado para el vehículo, actualizarlo
        if (estado_vehiculo && formDataClean.vehiculo_id) {
          const estadoSeleccionado = vehiculosEstados.find(e => e.codigo === estado_vehiculo)
          if (estadoSeleccionado) {
            await actualizarEstadoVehiculo(formDataClean.vehiculo_id, estadoSeleccionado.id,
              'Siniestro editado', { updated_by: profile?.full_name || 'Sistema' })
          }

          // Historial: registrar cambio de estado del vehículo por siniestro (edición)
          registrarHistorialVehiculo({
            vehiculoId: formDataClean.vehiculo_id,
            tipoEvento: 'siniestro',
            estadoNuevo: estado_vehiculo,
            detalles: {
              accion: 'editar_siniestro',
              siniestro_id: selectedSiniestro.id,
              categoria_id: formDataClean.categoria_id,
              responsable: formDataClean.responsable,
            },
            modulo: 'siniestros',
            sedeId: sedeActualId || sedeUsuario?.id,
          })

          // Estados que finalizan asignaciones
          const estadosFinalizanAsignacion = [
            'SINIESTRADO',
            'TALLER_CHAPA_PINTURA',
            'TALLER_CP_PAINT_CARS',
            'TALLER_CP_ANDRADA',
            'CORPORATIVO',
            'PKG_OFF_BASE',
            'PKG_OFF_FRANCIA',
            'DESTRUCCION_TOTAL',
            'ROBO',
            'RETENIDO_COMISARIA'
          ]

          // Si el estado requiere finalizar asignaciones
          if (estadosFinalizanAsignacion.includes(estado_vehiculo)) {
            const { data: asignacionesActivas } = await (supabase as any)
              .from('asignaciones')
              .select('id, asignaciones_conductores(conductor_id)')
              .eq('vehiculo_id', formDataClean.vehiculo_id)
              .in('estado', ['activa', 'programado'])

            if (asignacionesActivas && asignacionesActivas.length > 0) {
              const asignacionIds = asignacionesActivas.map((a: any) => a.id)

              // Finalizar conductores (usa fecha del siniestro, no fecha actual)
              await (supabase as any)
                .from('asignaciones_conductores')
                .update({ estado: 'completado', fecha_fin: fechaCierreEdit })
                .in('asignacion_id', asignacionIds)
                .in('estado', ['asignado', 'activo'])

              // Finalizar asignaciones (usa fecha del siniestro, no fecha actual)
              await (supabase as any)
                .from('asignaciones')
                .update({
                  estado: 'finalizada',
                  fecha_fin: fechaCierreEdit,
                  notas: `[AUTO-CERRADA] Siniestro - Vehículo cambió a estado: ${estado_vehiculo}`,
                  updated_by: profile?.full_name || 'Sistema'
                })
                .in('id', asignacionIds)

              // Historial: registrar siniestro para cada conductor afectado
              for (const asig of asignacionesActivas as any[]) {
                const conductoresAsig = asig.asignaciones_conductores || []
                for (const ac of conductoresAsig) {
                  if (ac.conductor_id) {
                    registrarHistorialConductor({
                      conductorId: ac.conductor_id,
                      tipoEvento: 'siniestro',
                      detalles: {
                        accion: 'asignacion_finalizada_por_siniestro',
                        vehiculo_id: formDataClean.vehiculo_id,
                        estado_vehiculo: estado_vehiculo,
                        siniestro_id: selectedSiniestro.id,
                        asignacion_id: asig.id,
                      },
                      modulo: 'siniestros',
                      sedeId: sedeActualId || sedeUsuario?.id,
                    })
                  }
                }
              }
            }
          }
        }

        showSuccess('Siniestro actualizado', estado_vehiculo ? 'El estado del vehículo y asignaciones fueron actualizados' : undefined)
      }

      setShowModal(false)
      cargarDatos()
    } catch (error: any) {
      const errorMsg = error?.message || error?.details || error?.hint || 'Error desconocido'
      showError('Error', `No se pudo guardar: ${errorMsg}`)
    } finally {
      setSaving(false)
    }
  }

  function handleVehiculoChange(vehiculoId: string) {
    setFormData(prev => ({ ...prev, vehiculo_id: vehiculoId }))

    // TODO: Auto-seleccionar conductor asignado y seguro del vehículo
  }

  // Habilitar vehículo: cambiar estado a PKG_ON_BASE
  async function handleHabilitarVehiculo(siniestro: SiniestroCompleto) {
    if (!siniestro.vehiculo_id) {
      showError('Error', 'Este siniestro no tiene vehículo asociado')
      return
    }

    const result = await Alerta.fire({
      title: 'Habilitar Vehículo',
      text: `¿Desea habilitar el vehículo ${siniestro.vehiculo_patente} para circular?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, habilitar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981'
    })

    if (!result.isConfirmed) return

    try {
      // Actualizar el estado del vehículo directamente (las columnas estado_vehiculo y habilitado_circular no existen en siniestros)
      const estadoPkgOn = vehiculosEstados.find(e => e.codigo === 'PKG_ON_BASE')
      if (estadoPkgOn) {
        const { error } = await actualizarEstadoVehiculo(siniestro.vehiculo_id, estadoPkgOn.id,
          'Habilitado para circular después del siniestro')

        if (error) throw error

        // Historial: registrar habilitación del vehículo
        registrarHistorialVehiculo({
          vehiculoId: siniestro.vehiculo_id,
          tipoEvento: 'cambio_estado',
          estadoNuevo: 'PKG_ON_BASE',
          detalles: {
            accion: 'habilitar_vehiculo_desde_siniestro',
            patente: siniestro.vehiculo_patente,
            siniestro_id: siniestro.id,
          },
          modulo: 'siniestros',
          sedeId: sedeActualId || sedeUsuario?.id,
        })
      }

      showSuccess('Vehículo habilitado', `${siniestro.vehiculo_patente} ahora puede circular`)

      cargarDatos()
    } catch {
      showError('Error', 'No se pudo habilitar el vehículo')
    }
  }

  function formatMoney(value: number | undefined | null) { return formatPlata(value, { ceroComoGuion: true }) }

  // fecha_siniestro se guarda como el día a las 00:00 UTC: pasarla a hora argentina la
  // corría al día anterior (04/11 -> 03/11 21:00). Se muestra el día tal cual se cargó.
  function formatDate(dateStr: string | undefined | null) { return formatFecha(dateStr ? dateStr.slice(0, 10) : dateStr) }

  // Montos del período elegido en el selector (con "Todo el historial" = todos).
  // Mismas fórmulas que calcularStats, pero sobre los siniestros del período, así las
  // tarjetas responden al filtro. Los "días desde/entre" siguen siendo sobre todo el historial.
  const resumenPeriodo = useMemo(() => {
    let presupuesto = 0, aprobado = 0, cobrado = 0
    let conPresupuesto = 0, conAprobado = 0, conCobrado = 0
    for (const s of siniestrosSemana) {
      presupuesto += s.presupuesto_real || 0
      aprobado += s.presupuesto_aprobado_seguro || 0
      cobrado += s.total_pagado || 0
      if (s.presupuesto_real) conPresupuesto++
      if (s.presupuesto_aprobado_seguro) conAprobado++
      if (s.total_pagado) conCobrado++
    }
    return { cantidad: siniestrosSemana.length, presupuesto, aprobado, cobrado, conPresupuesto, conAprobado, conCobrado }
  }, [siniestrosSemana])

  // Fila resumen del período: totales, en trámite, cerrados y monto en reclamo.
  // Monto en reclamo = de los que siguen en trámite, lo reclamado al seguro (o el
  // presupuesto real si no se cargó) menos lo ya cobrado.
  // Culpabilidad y gravedad del período, en número y % (pedido de Karen: que se lea
  // directo el porcentaje sin tener que calcularlo). La gravedad sale del nombre de la
  // categoría ("Choque leve", "Choque moderado", "Choque grave"); el resto va a "Otros".
  const distribucion = useMemo(() => {
    const culpa = { conductor: 0, compartida: 0, tercero: 0, sin_info: 0 }
    const gravedad = { leve: 0, moderado: 0, grave: 0, otros: 0 }
    for (const s of siniestrosSemana) {
      const resp = s.responsable as keyof typeof culpa
      if (resp === 'conductor' || resp === 'compartida' || resp === 'tercero') culpa[resp]++
      else culpa.sin_info++
      const cat = (s.categoria_nombre || '').toLowerCase()
      if (/\bleve/.test(cat)) gravedad.leve++
      else if (/moderad/.test(cat)) gravedad.moderado++
      else if (/grave/.test(cat)) gravedad.grave++
      else gravedad.otros++
    }
    return { culpa, gravedad, total: siniestrosSemana.length }
  }, [siniestrosSemana])

  const resumenTramite = useMemo(() => {
    let enTramite = 0, cerrados = 0, enReclamo = 0, perdidaNoRecuperable = 0
    let recuperoSeguro = 0, recuperoConductor = 0
    let cerradosConPerdida = 0
    // Partes de cada cuenta, para mostrarlas en la "i"
    let reclamadoEnTramite = 0, cobradoEnTramite = 0
    let costoConPerdida = 0, recuperoConPerdida = 0
    let cobradoSeguroBruto = 0, conCobroConductor = 0
    const nombresEnTramite = new Set<string>()
    const nombresCerrados = new Set<string>()
    for (const s of siniestrosSemana) {
      if (ESTADOS_FINALIZADOS.includes(s.estado_codigo)) {
        cerrados++
        if (s.estado_nombre) nombresCerrados.add(s.estado_nombre)
        // Cerrado con resultado negativo: esa plata ya no vuelve
        const r = calcularResultadoSiniestro(s)
        if (r && r.valor < 0) {
          perdidaNoRecuperable += -r.valor
          cerradosConPerdida++
          costoConPerdida += r.costo
          recuperoConPerdida += r.costo + r.valor
        }
      } else {
        enTramite++
        if (s.estado_nombre) nombresEnTramite.add(s.estado_nombre)
        const reclamado = s.presupuesto_enviado_seguro || s.presupuesto_real || 0
        enReclamo += Math.max(0, reclamado - (s.total_pagado || 0))
        reclamadoEnTramite += reclamado
        cobradoEnTramite += Math.min(reclamado, s.total_pagado || 0)
      }
      const origen = recuperoPorOrigen(s)
      recuperoSeguro += origen.seguro
      recuperoConductor += origen.conductor
      cobradoSeguroBruto += s.total_pagado || 0
      if (origen.conductor > 0) conCobroConductor++
    }
    return {
      total: siniestrosSemana.length,
      enTramite,
      cerrados,
      enReclamo,
      recuperoNeto: recuperoSeguro + recuperoConductor,
      recuperoSeguro,
      recuperoConductor,
      perdidaNoRecuperable,
      cerradosConPerdida,
      reclamadoEnTramite,
      cobradoEnTramite,
      costoConPerdida,
      recuperoConPerdida,
      cobradoSeguroBruto,
      conCobroConductor,
      nombresEnTramite: [...nombresEnTramite].sort(),
      nombresCerrados: [...nombresCerrados].sort(),
    }
  }, [siniestrosSemana])

  // Período anterior del mismo largo (semana pasada, mes pasado…), para comparar el total
  // sin salirse del filtro elegido.
  const comparacion = useMemo(() => {
    const ant = dateRangeSemana && dateRangeSemana.type !== 'all'
      ? periodoAnterior(dateRangeSemana.startDate, dateRangeSemana.endDate)
      : null
    if (!ant) return null
    let anterior = 0
    for (const s of siniestros) {
      const f = parseFechaSiniestro(s.fecha_siniestro)
      if (!f) continue
      const iso = toISODateLocal(f)
      if (iso >= ant.desde && iso <= ant.hasta) anterior++
    }
    return { anterior, desde: ant.desde, hasta: ant.hasta }
  }, [siniestros, dateRangeSemana])

  /** Qué chip de la fila resumen está activo, según el filtro de Estado */
  const chipActivo = useMemo(() => {
    if (estadoFilter.length === 0) return 'total'
    const mismo = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))
    if (mismo(estadoFilter, resumenTramite.nombresEnTramite)) return 'tramite'
    if (mismo(estadoFilter, resumenTramite.nombresCerrados)) return 'cerrados'
    return null
  }, [estadoFilter, resumenTramite])

  /** Monto para las tarjetas: muestra "$ 0" en vez de "-". */
  function montoTarjeta(value: number) {
    return formatPlata(value || 0)
  }

  /** "34 días" / "1 día" / "Sin datos" */
  function diasTexto(value: number | null | undefined) {
    if (value === null || value === undefined) return 'Sin datos'
    return `${value} ${value === 1 ? 'día' : 'días'}`
  }

  /** Arma los datos del Informe Ejecutivo de Gestión con los siniestros del período */
  function armarDatosInforme(recomendaciones: string): DatosInforme {
    const recortar = (t: string, max = 420) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t)
    const culpa: Record<string, string> = {
      tercero: 'Culpa del tercero.',
      conductor: 'Culpa propia.',
      compartida: 'Responsabilidad compartida.',
    }
    const nombreMes = (fecha: string) => {
      const f = parseFechaSiniestro(fecha)
      if (!f) return ''
      const m = f.toLocaleDateString('es-AR', { month: 'long' })
      return m.charAt(0).toUpperCase() + m.slice(1)
    }
    const datosCaso = (s: SiniestroCompleto) => [
      { label: 'Fecha', valor: formatDate(s.fecha_siniestro) },
      { label: 'Gestión', valor: s.gestionado_por ? etiquetaGestor(s.gestionado_por) : '' },
      { label: 'Cía. tercero', valor: nombreCompaniaTercero(s.tercero_seguro) },
      { label: 'Evento', valor: s.categoria_nombre || '' },
    ]
    const detalleCaso = (s: SiniestroCompleto) => {
      const texto = [culpa[s.responsable || ''] || '', (s.relato || s.descripcion_danos || '').trim()]
        .filter(Boolean).join(' ')
      return texto ? recortar(texto) : undefined
    }
    const porFechaDesc = (a: SiniestroCompleto, b: SiniestroCompleto) =>
      (b.fecha_siniestro || '').localeCompare(a.fecha_siniestro || '')

    const enCurso = siniestrosSemana.filter(s => !ESTADOS_FINALIZADOS.includes(s.estado_codigo))
    const cerrados = siniestrosSemana.filter(s => ESTADOS_FINALIZADOS.includes(s.estado_codigo)).sort(porFechaDesc)
    const nuevos = enCurso.filter(s => s.estado_codigo === 'REGISTRADO').sort(porFechaDesc)
    const enTramite = enCurso.filter(s => s.estado_codigo !== 'REGISTRADO').sort(porFechaDesc)

    const casoEnTramite = (s: SiniestroCompleto): CasoInforme => {
      const reclamado = s.presupuesto_enviado_seguro || s.presupuesto_real || 0
      const monto = s.presupuesto_aprobado_seguro
        ? `Acordado: ${formatPlata(s.presupuesto_aprobado_seguro)}`
        : reclamado ? `Reclamo: ${formatPlata(reclamado)}` : undefined
      const espera = s.situacion_tramite ? SITUACION_LABELS[s.situacion_tramite] : ''
      const g = ultimasGestiones.get(s.id)
      return {
        patente: s.vehiculo_patente || 'Sin patente',
        titulo: espera ? `${s.estado_nombre} · Espera: ${espera}` : s.estado_nombre,
        monto,
        datos: datosCaso(s),
        detalle: detalleCaso(s),
        cierre: g ? { label: 'Próximo paso', texto: recortar(g.texto) } : undefined,
      }
    }
    const casoCerrado = (s: SiniestroCompleto): CasoInforme => {
      const motivo = s.motivo_cierre ? MOTIVO_CIERRE_LABELS[s.motivo_cierre] : ''
      const r = calcularResultadoSiniestro(s)
      const g = ultimasGestiones.get(s.id)
      return {
        patente: s.vehiculo_patente || 'Sin patente',
        titulo: motivo ? `${s.estado_nombre} (${motivo})` : s.estado_nombre,
        monto: r ? `${r.valor >= 0 ? 'Recupero' : 'Pérdida'}: ${formatPlata(Math.abs(r.valor))}` : undefined,
        datos: datosCaso(s),
        detalle: detalleCaso(s),
        cierre: g ? { label: 'Resolución', texto: recortar(g.texto) } : undefined,
      }
    }

    let terceros = 0, robos = 0, propia = 0, compartida = 0, sinInfo = 0
    for (const s of siniestrosSemana) {
      if (s.categoria_es_robo) robos++
      else if (s.responsable === 'tercero') terceros++
      else if (s.responsable === 'conductor') propia++
      else if (s.responsable === 'compartida') compartida++
      else sinInfo++
    }

    return {
      fecha: new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }),
      periodo: dateRangeSemana?.label || 'Todo el historial',
      kpis: {
        total: resumenTramite.total,
        enTramite: resumenTramite.enTramite,
        cerrados: resumenTramite.cerrados,
        enReclamo: formatPlata(resumenTramite.enReclamo),
      },
      responsabilidad: [
        { label: 'Responsabilidad de terceros', cantidad: terceros, detalle: 'Eventos de causa externa.', color: [5, 150, 105] },
        { label: 'Robo / vandalismo', cantidad: robos, detalle: 'Robos, hurtos y daños intencionales.', color: [124, 58, 237] },
        { label: 'Culpa propia', cantidad: propia, detalle: 'Responsabilidad del conductor (se gestionan recuperos internos).', color: [220, 38, 38] },
        { label: 'Responsabilidad compartida', cantidad: compartida, detalle: 'Culpa repartida entre las partes.', color: [217, 119, 6] },
        { label: 'Sin información', cantidad: sinInfo, detalle: 'Todavía sin responsable definido.', color: [148, 163, 184] },
      ],
      recomendaciones,
      administrativos: enTramite.filter(s => s.gestionado_por !== 'legal').map(casoEnTramite),
      legales: enTramite.filter(s => s.gestionado_por === 'legal').map(casoEnTramite),
      cerrados: cerrados.map(casoCerrado),
      nuevos: nuevos.map(s => ({
        patente: s.vehiculo_patente || 'Sin patente',
        fecha: formatDate(s.fecha_siniestro),
        mes: nombreMes(s.fecha_siniestro),
        estado: 'En carga / recopilación de datos',
      })),
    }
  }

  function handleInformeGestion() {
    if (siniestrosSemana.length === 0) {
      Alerta.fire('Sin datos', 'No hay siniestros en el período elegido', 'info')
      return
    }
    setVerInforme(true)
  }

  async function handleExportarExcel() {
    const XLSX = await import('xlsx')
    if (siniestrosFiltrados.length === 0) {
      Alerta.fire('Sin datos', 'No hay siniestros para exportar', 'info')
      return
    }

    const dataExport = siniestrosFiltrados.map(s => ({
      'Fecha': formatDate(s.fecha_siniestro),
      'Patente': s.vehiculo_patente || '',
      'Vehículo': `${s.vehiculo_marca || ''} ${s.vehiculo_modelo || ''}`.trim(),
      'Conductor': s.conductor_display || '',
      'Categoría': s.categoria_nombre || '',
      'Estado': s.estado_nombre || '',
      'Gestiona': etiquetaGestor(s.gestionado_por),
      'Qué se está esperando': s.situacion_tramite ? (SITUACION_LABELS[s.situacion_tramite] || s.situacion_tramite) : '',
      'Motivo de cierre': s.motivo_cierre ? (MOTIVO_CIERRE_LABELS[s.motivo_cierre] || s.motivo_cierre) : '',
      'Responsable': s.responsable === 'tercero' ? 'Tercero' : s.responsable === 'conductor' ? 'Conductor' : s.responsable === 'compartida' ? 'Compartida' : '',
      'Lesionados': s.hay_lesionados ? 'Sí' : 'No',
      'Tercero': s.tercero_nombre || '',
      'Compañía del tercero': nombreCompaniaTercero(s.tercero_seguro),
      'Presupuesto Real': s.presupuesto_real || 0,
      'Reclamado al seguro': s.presupuesto_enviado_seguro || 0,
      'Oferta del seguro': s.oferta_seguro || 0,
      'Aprobado / acordado': s.presupuesto_aprobado_seguro || 0,
      'Cobrado del seguro': s.total_pagado || 0,
      'Pagado al taller': s.total_reparacion_pagada || 0,
      'Cobrado al conductor': s.cobrado_conductor || 0,
      'Recupero neto': calcularRecuperoNeto(s),
      'Resultado': calcularResultadoSiniestro(s)?.valor ?? 0,
      'Días Siniestrado': s.dias_siniestrado || 0,
      'Habilitado': (s as any).habilitado_circular !== false ? 'Sí' : 'No',
      'Seguro': s.seguro_nombre || '',
      'Nro. Siniestro': s.nro_siniestro_seguro || '',
      'Ubicación': s.ubicacion || '',
      'Descripción Daños': s.descripcion_danos || '',
      'Relato': s.relato || '',
      'Observaciones': s.observaciones || '',
      'Última gestión': ultimasGestiones.get(s.id)?.texto || '',
      'Fecha última gestión': ultimasGestiones.get(s.id) ? formatDateAR(ultimasGestiones.get(s.id)!.fecha) : '',
    }))

    const ws = XLSX.utils.json_to_sheet(dataExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Siniestros')

    // Ajustar anchos de columna
    const colWidths = [
      { wch: 12 }, // Fecha
      { wch: 10 }, // Patente
      { wch: 20 }, // Vehículo
      { wch: 25 }, // Conductor
      { wch: 15 }, // Categoría
      { wch: 15 }, // Estado
      { wch: 12 }, // Gestiona
      { wch: 26 }, // Qué se está esperando
      { wch: 22 }, // Motivo de cierre
      { wch: 12 }, // Responsable
      { wch: 10 }, // Lesionados
      { wch: 22 }, // Tercero
      { wch: 22 }, // Compañía del tercero
      { wch: 15 }, // Presupuesto Real
      { wch: 15 }, // Reclamado al seguro
      { wch: 15 }, // Oferta del seguro
      { wch: 15 }, // Aprobado / acordado
      { wch: 15 }, // Cobrado del seguro
      { wch: 15 }, // Pagado al taller
      { wch: 15 }, // Cobrado al conductor
      { wch: 15 }, // Recupero neto
      { wch: 15 }, // Resultado
      { wch: 12 }, // Días Siniestrado
      { wch: 10 }, // Habilitado
      { wch: 15 }, // Seguro
      { wch: 15 }, // Nro. Siniestro
      { wch: 25 }, // Ubicación
      { wch: 30 }, // Descripción Daños
      { wch: 30 }, // Relato
      { wch: 30 }, // Observaciones
      { wch: 40 }, // Última gestión
      { wch: 12 }, // Fecha última gestión
    ]
    ws['!cols'] = colWidths

    const tabName = 'Listado'
    const fecha = hoyART()
    XLSX.writeFile(wb, `Siniestros_${tabName}_${fecha}.xlsx`)
  }

  return (
    <div className="siniestros-module">
      {/* Loading Overlay - bloquea toda la pantalla */}
      <LoadingOverlay show={loading} message="Cargando siniestros..." size="lg" />

      {/* Indicadores, todos del período elegido salvo "Último siniestro / robo" (cuentan
          desde hoy). Tres filas con el mismo estilo de título: Siniestros, Distribución y Montos.
          Totales, En trámite y Cerrados filtran la tabla al hacer clic. */}
      <div className="siniestros-stats siniestros-stats--v2">
        <div className="siniestros-stats-fila-titulo">Siniestros</div>
        <div className="stats-grid siniestros-stats-grid">
          <button
            type="button"
            className={`stat-card stat-card--filtro${chipActivo === 'total' ? ' activo' : ''}`}
            onClick={() => setEstadoFilter([])}
            title="Todos los siniestros del período (clic para ver todos)"
          >
            <FileText size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{resumenTramite.total}</span>
              <span className="stat-label">Totales</span>
            </div>
          </button>
          <div
            className="stat-card"
            title={comparacion ? `Del ${formatFecha(comparacion.desde)} al ${formatFecha(comparacion.hasta)}` : undefined}
          >
            <TrendingUp size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">
                {comparacion ? comparacion.anterior : '—'}
                {comparacion && comparacion.anterior !== resumenTramite.total && (
                  <span className={`mes-variacion ${resumenTramite.total > comparacion.anterior ? 'mes-variacion--sube' : 'mes-variacion--baja'}`}>
                    {resumenTramite.total > comparacion.anterior ? '▲' : '▼'} {Math.abs(resumenTramite.total - comparacion.anterior)}
                  </span>
                )}
              </span>
              <span className="stat-label">{comparacion ? 'Período anterior' : 'Sin período para comparar'}</span>
            </div>
          </div>
          <button
            type="button"
            className={`stat-card stat-card--filtro${chipActivo === 'tramite' ? ' activo' : ''}`}
            onClick={() => setEstadoFilter(resumenTramite.nombresEnTramite)}
            disabled={resumenTramite.enTramite === 0}
            title={`Todos menos Cerrado, Rechazado y Cobrado${resumenTramite.nombresEnTramite.length ? `: ${resumenTramite.nombresEnTramite.join(', ')}` : ''} (clic para filtrar)`}
          >
            <Clock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">
                {resumenTramite.enTramite}
                <span className="stat-pct">{porcentaje(resumenTramite.enTramite, resumenTramite.total)}</span>
              </span>
              <span className="stat-label">En trámite</span>
            </div>
          </button>
          <button
            type="button"
            className={`stat-card stat-card--filtro${chipActivo === 'cerrados' ? ' activo' : ''}`}
            onClick={() => setEstadoFilter(resumenTramite.nombresCerrados)}
            disabled={resumenTramite.cerrados === 0}
            title="Cerrado, Rechazado y Cobrado (clic para filtrar)"
          >
            <CheckCircle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">
                {resumenTramite.cerrados}
                <span className="stat-pct">{porcentaje(resumenTramite.cerrados, resumenTramite.total)}</span>
              </span>
              <span className="stat-label">Cerrados</span>
            </div>
          </button>
          <div className="stat-card" title={`Días entre los dos últimos siniestros: ${diasTexto(stats?.dias_entre_ultimos_siniestros)}`}>
            <AlertTriangle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{diasTexto(stats?.dias_desde_ultimo_siniestro)}</span>
              <span className="stat-label">desde el último siniestro</span>
            </div>
          </div>
          <div className="stat-card" title={`Días entre los dos últimos robos: ${diasTexto(stats?.dias_entre_ultimos_robos)}`}>
            <Shield size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{diasTexto(stats?.dias_desde_ultimo_robo)}</span>
              <span className="stat-label">desde el último robo</span>
            </div>
          </div>
        </div>

        <div className="siniestros-stats-fila-titulo">Distribución</div>
        <div className="stats-grid siniestros-stats-grid">
          <BarraDistribucion
            titulo="Culpabilidad"
            total={distribucion.total}
            partes={[
              { label: 'Conductor', valor: distribucion.culpa.conductor, color: '#dc2626' },
              { label: 'Compartida', valor: distribucion.culpa.compartida, color: '#f59e0b' },
              { label: 'Tercero', valor: distribucion.culpa.tercero, color: '#10b981' },
              { label: 'Sin cargar', valor: distribucion.culpa.sin_info, color: '#cbd5e1' },
            ]}
          />
          <BarraDistribucion
            titulo="Gravedad"
            total={distribucion.total}
            partes={[
              { label: 'Leve', valor: distribucion.gravedad.leve, color: '#10b981' },
              { label: 'Moderado', valor: distribucion.gravedad.moderado, color: '#f59e0b' },
              { label: 'Grave', valor: distribucion.gravedad.grave, color: '#dc2626' },
              { label: 'Otras', valor: distribucion.gravedad.otros, color: '#cbd5e1' },
            ]}
          />
        </div>

        <div className="siniestros-stats-fila-titulo">Montos</div>
        {/* 8 montos en 2 filas de 4: arriba lo del trámite, abajo recupero y pérdida */}
        <div className="stats-grid siniestros-stats-grid siniestros-stats-grid--4">
          <TarjetaMonto
            icono={DollarSign}
            valor={resumenPeriodo.presupuesto}
            label="Presupuesto real"
            explicacion="Suma del presupuesto real de los siniestros del período (lo que costaría repararlos)."
            filas={[
              ['Siniestros del período', String(resumenPeriodo.cantidad)],
              ['Con presupuesto cargado', String(resumenPeriodo.conPresupuesto)],
            ]}
          />
          <TarjetaMonto
            icono={TrendingUp}
            valor={resumenPeriodo.aprobado}
            label="Aprobado por seguro"
            explicacion="Suma del presupuesto aprobado / acordado con el seguro. Todavía no es plata cobrada."
            filas={[['Siniestros con monto aprobado', String(resumenPeriodo.conAprobado)]]}
          />
          <TarjetaMonto
            icono={Car}
            valor={resumenPeriodo.cobrado}
            label="Cobrado"
            explicacion='Suma de "Cobrado del seguro" de los siniestros del período, sin descontar a la abogada.'
            filas={[['Siniestros con cobro del seguro', String(resumenPeriodo.conCobrado)]]}
          />
          <TarjetaMonto
            icono={Clock}
            valor={resumenTramite.enReclamo}
            label="En reclamo"
            explicacion="De los siniestros en trámite: lo reclamado al seguro (o el presupuesto real si no se cargó el reclamo) menos lo ya cobrado."
            filas={[
              [`Reclamado (${resumenTramite.enTramite} en trámite)`, montoTarjeta(resumenTramite.reclamadoEnTramite)],
              ['− Ya cobrado', montoTarjeta(resumenTramite.cobradoEnTramite)],
            ]}
          />
          <TarjetaMonto
            icono={CheckCircle}
            valor={resumenTramite.recuperoNeto}
            label="Recupero neto"
            tono={resumenTramite.recuperoNeto > 0 ? 'positivo' : undefined}
            explicacion="Lo que efectivamente volvió: recupero del seguro más recupero del conductor."
            filas={[
              ['Recupero seguro', montoTarjeta(resumenTramite.recuperoSeguro)],
              ['+ Recupero conductor', montoTarjeta(resumenTramite.recuperoConductor)],
            ]}
          />
          <TarjetaMonto
            icono={Shield}
            valor={resumenTramite.recuperoSeguro}
            label="Recupero seguro"
            tono={resumenTramite.recuperoSeguro > 0 ? 'positivo' : undefined}
            explicacion='"Cobrado del seguro" de cada siniestro, menos el % de la abogada de ese siniestro.'
            filas={[
              ['Cobrado del seguro', montoTarjeta(resumenTramite.cobradoSeguroBruto)],
              ['− % abogada', montoTarjeta(resumenTramite.cobradoSeguroBruto - resumenTramite.recuperoSeguro)],
            ]}
          />
          <TarjetaMonto
            icono={Users}
            valor={resumenTramite.recuperoConductor}
            label="Recupero conductor"
            tono={resumenTramite.recuperoConductor > 0 ? 'positivo' : undefined}
            explicacion='Suma de los pagos confirmados con "Confirmar pago" en los Cobros a conductor del seguimiento. Lo cargado sin confirmar no cuenta.'
            filas={[['Siniestros con pago confirmado', String(resumenTramite.conCobroConductor)]]}
          />
          <TarjetaMonto
            icono={AlertTriangle}
            valor={resumenTramite.perdidaNoRecuperable}
            label="Pérdida no recuperable"
            tono={resumenTramite.perdidaNoRecuperable > 0 ? 'negativo' : undefined}
            explicacion="De los siniestros ya cerrados (Cerrado, Rechazado o Cobrado) que terminaron en pérdida: lo que costó repararlos (pagado al taller o, si no se cargó, el presupuesto real) menos lo recuperado."
            filas={[
              [`Costo (${resumenTramite.cerradosConPerdida} cerrados con pérdida)`, montoTarjeta(resumenTramite.costoConPerdida)],
              ['− Recuperado', montoTarjeta(resumenTramite.recuperoConPerdida)],
            ]}
          />
        </div>
      </div>


      {/* Tabla de siniestros */}
      <DataTable
        data={siniestrosFiltrados}
        columns={siniestrosColumns}
        // Fecha, Patente/Conductor, Categoría y Estado quedan fijas al desplazar la tabla
        stickyLeftColumns={4}
        loading={loading}
        searchPlaceholder="Buscar por patente, conductor..."
        emptyIcon={<Shield size={40}
      />}
        emptyTitle="No hay siniestros para mostrar"
        emptyDescription="Los siniestros aparecerán aquí cuando se registren."
        globalFilterFn={customGlobalFilter}
        externalFilters={externalFilters}
        onClearAllFilters={handleClearAllFilters}
        headerAction={
          /* Período + acciones, en la misma línea que el buscador */
          <div className="siniestros-tabs-row header-controls-inline">
            <div className="siniestros-periodo">
              <DateRangeSelector
                selectedRange={dateRangeSemana}
                onRangeChange={setDateRangeSemana}
                showAllOption
                allowMonthYear
                mesCalendario
                placeholder="Semana actual"
              />
            </div>
            <div className="tabs-actions">
              <button className="btn-secondary" onClick={handleExportarExcel} title="Exportar a Excel">
                <Download size={16} />
                Exportar
              </button>
              <button
                className="btn-secondary"
                onClick={handleInformeGestion}
                disabled={verInforme}
                title="Informe Ejecutivo de Gestión en PDF, con los siniestros del período"
              >
                <FileDown size={16} />
                Informe PDF
              </button>
              <button
                className="btn-primary"
                onClick={handleNuevoSiniestro}
              >
                <Plus size={16} />
                Nuevo Siniestro
              </button>
            </div>
          </div>
        }
      />

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div
            className={`modal-content${modalMode === 'view' ? ' sd-modal' : ''}${modalMode !== 'create' ? ' siniestros-modal-edicion' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>
                {modalMode === 'create' ? 'Nuevo Siniestro' :
                 modalMode === 'edit' ? 'Editar Siniestro' : 'Detalle del Siniestro'}
              </h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            {modalMode === 'edit' && (
              <TabsBar
                className="tabs-bar--modal"
                ariaLabel="Datos del siniestro"
                tabs={PESTANAS_SINIESTRO}
                active={pestanaEdicion}
                onChange={setPestanaEdicion}
              />
            )}

            <div className="modal-body">
              {modalMode === 'view' && selectedSiniestro ? (
                <SiniestroDetailView
                  siniestro={selectedSiniestro}
                  onEdit={() => handleEditarSiniestro(selectedSiniestro)}
                  onReload={cargarDatos}
                />
              ) : modalMode === 'create' ? (
                <SiniestroWizard
                  formData={formData}
                  setFormData={setFormData}
                  categorias={categorias}
                  estados={estados}
                  vehiculos={vehiculos}
                  conductores={conductores}
                  vehiculosEstados={vehiculosEstados}
                  onVehiculoChange={handleVehiculoChange}
                  onCancel={() => setShowModal(false)}
                  onSubmit={handleGuardar}
                  saving={saving}
                />
              ) : (
                <SiniestroForm
                  formData={formData}
                  setFormData={setFormData}
                  categorias={categorias}
                  estados={estados}
                  seguros={seguros}
                  vehiculos={vehiculos}
                  conductores={conductores}
                  onVehiculoChange={handleVehiculoChange}
                  disabled={modalMode === 'view'}
                  isEditMode={modalMode === 'edit'}
                  pestana={modalMode === 'edit' ? pestanaEdicion : undefined}
                  hayMontosNuevos={hayMontosNuevos}
                  hayGestionadoPor={hayGestionadoPor}
                  hayTramite={hayTramite}
                />
              )}
              {modalMode === 'edit' && pestanaEdicion === 'reparacion' && selectedSiniestro && (
                <TicketReparacion siniestro={selectedSiniestro} onSave={cargarDatos} />
              )}
              {modalMode === 'edit' && pestanaEdicion === 'seguimiento' && selectedSiniestro && (
                <SiniestroSeguimiento siniestro={selectedSiniestro} onReload={cargarDatos} />
              )}
            </div>

            {modalMode === 'edit' && (
              <div className="modal-footer">
                <button
                  className="btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  className="btn-primary"
                  onClick={handleGuardar}
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Seguimiento (desde ActionsMenu) */}
      {verInforme && (
        <InformeGestionModal
          armarDatos={armarDatosInforme}
          periodo={dateRangeSemana?.label || 'Todo el historial'}
          cantidad={siniestrosSemana.length}
          nombreArchivo={`Informe_Gestion_Siniestros_${hoyART()}.pdf`}
          onClose={() => setVerInforme(false)}
        />
      )}

    </div>
  )
}

// Componente Form
interface SiniestroFormProps {
  formData: SiniestroFormData
  setFormData: React.Dispatch<React.SetStateAction<SiniestroFormData>>
  categorias: SiniestroCategoria[]
  estados: SiniestroEstado[]
  seguros: Seguro[]
  vehiculos: VehiculoSimple[]
  conductores: ConductorSimple[]
  onVehiculoChange: (id: string) => void
  disabled?: boolean
  isEditMode?: boolean // Solo permite editar estado y responsable
  /** Pestaña visible (edición). Sin pestaña se muestran todas las secciones. */
  pestana?: PestanaSiniestro
  /** Si existen oferta_seguro y cobrado_conductor (sql/siniestros_montos.sql) */
  hayMontosNuevos?: boolean
  /** Si existe gestionado_por (sql/siniestros_gestionado_por.sql) */
  hayGestionadoPor?: boolean
  /** Si existen situacion_tramite y motivo_cierre (sql/siniestros_tramite.sql) */
  hayTramite?: boolean
}

function SiniestroForm({
  formData,
  setFormData,
  categorias,
  estados,
  seguros,
  vehiculos,
  conductores,
  onVehiculoChange,
  disabled,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isEditMode: _isEditMode = false,
  pestana,
  hayMontosNuevos = false,
  hayGestionadoPor = false,
  hayTramite = false,
}: SiniestroFormProps) {
  // Sección visible según la pestaña. Se ocultan con display (no se desmontan) para no
  // perder lo que se está escribiendo al cambiar de pestaña.
  const seccion = (cual: PestanaSiniestro): React.CSSProperties | undefined =>
    pestana && pestana !== cual ? { display: 'none' } : undefined
  // Todos los campos son editables en modo edición
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isFieldDisabled = (_fieldName: string) => {
    return disabled || false
  }
  type CampoMontoKey = 'presupuesto_real' | 'presupuesto_enviado_seguro' | 'oferta_seguro'
    | 'presupuesto_aprobado_seguro' | 'total_pagado' | 'total_reparacion_pagada' | 'cobrado_conductor'
  const campoMonto = (label: string, campo: CampoMontoKey, ayuda?: string) => (
    <div className="form-group">
      <label title={ayuda}>{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={formData[campo] ?? ''}
        onChange={(e) => {
          const val = e.target.value.replace(/[^0-9]/g, '')
          setFormData(prev => ({ ...prev, [campo]: val === '' ? undefined : Number(val) }))
        }}
        placeholder="0"
        title={ayuda}
        disabled={isFieldDisabled('other')}
      />
    </div>
  )
  const resultado = calcularResultadoSiniestro(formData)
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
  }).slice(0, 10)

  const filteredConductores = conductores.filter(c => {
    const searchTerm = conductorSearch.toLowerCase()
    return c.nombre_completo.toLowerCase().includes(searchTerm)
  }).slice(0, 10)

  return (
    <>
      {/* Datos del evento */}
      <div className="form-section" style={seccion('evento')}>
        <div className="form-section-title">Datos del Evento</div>
        <div className="form-row">
          <div className="form-group">
            <label>Patente <span className="required">*</span></label>
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
                disabled={isFieldDisabled('vehiculo_id')}
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
                disabled={isFieldDisabled('conductor_id')}
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
            <label>Fecha <span className="required">*</span></label>
            <input
              type="date"
              value={formData.fecha_siniestro}
              onChange={(e) => setFormData(prev => ({ ...prev, fecha_siniestro: e.target.value }))}
              disabled={isFieldDisabled('fecha_siniestro')}
            />
          </div>
          <div className="form-group">
            <label>Hora</label>
            <TimeInput24h
              value={formData.hora_siniestro || '09:00'}
              onChange={(value) => setFormData(prev => ({ ...prev, hora_siniestro: value }))}
              disabled={isFieldDisabled('hora_siniestro')}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Ubicación</label>
            <input
              type="text"
              value={formData.ubicacion || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, ubicacion: e.target.value }))}
              placeholder="Dirección o referencia"
              disabled={isFieldDisabled('ubicacion')}
            />
          </div>
        </div>
      </div>

      {/* Clasificación */}
      <div className="form-section" style={seccion('evento')}>
        <div className="form-section-title">Clasificación</div>
        <div className="form-row">
          <div className="form-group">
            <label>Categoría <span className="required">*</span></label>
            <select
              value={formData.categoria_id}
              onChange={(e) => setFormData(prev => ({ ...prev, categoria_id: e.target.value }))}
              disabled={isFieldDisabled('categoria_id')}
            >
              <option value="">Seleccionar categoría</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Estado <span className="required">*</span></label>
            <select
              value={formData.estado_id}
              onChange={(e) => setFormData(prev => ({ ...prev, estado_id: e.target.value }))}
              disabled={isFieldDisabled('estado_id')}
            >
              <option value="">Seleccionar estado</option>
              {estados.map(e => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        {hayTramite && ESTADOS_DE_CIERRE.includes(estados.find(e => e.id === formData.estado_id)?.codigo || '') && (
          <div className="form-row">
            <div className="form-group">
              <label>Motivo de cierre <span className="required">*</span></label>
              <select
                value={formData.motivo_cierre || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, motivo_cierre: e.target.value || undefined }))}
                disabled={isFieldDisabled('other')}
              >
                <option value="">Seleccionar motivo</option>
                {Object.entries(MOTIVO_CIERRE_LABELS).map(([valor, label]) => (
                  <option key={valor} value={valor}>{label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" />
          </div>
        )}
        <div className="form-row">
          <div className="form-group">
            <label>Responsable</label>
            <div className="radio-group">
              {['tercero', 'conductor', 'compartida'].map(r => (
                <label key={r} className="radio-option">
                  <input
                    type="radio"
                    name="responsable"
                    value={r}
                    checked={formData.responsable === r}
                    onChange={(e) => setFormData(prev => ({ ...prev, responsable: e.target.value as any }))}
                    disabled={isFieldDisabled('responsable')}
                  />
                  <span>{r.charAt(0).toUpperCase() + r.slice(1)}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>&nbsp;</label>
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={formData.hay_lesionados}
                onChange={(e) => setFormData(prev => ({ ...prev, hay_lesionados: e.target.checked }))}
                disabled={isFieldDisabled('other')}
              />
              <span>Hay lesionados</span>
            </label>
          </div>
        </div>
      </div>

      {/* Descripción */}
      <div className="form-section" style={seccion('descripcion')}>
        <div className="form-section-title">Descripción</div>
        <div className="form-row">
          <div className="form-group full-width">
            <label>Descripción de daños</label>
            <textarea
              value={formData.descripcion_danos || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, descripcion_danos: e.target.value }))}
              placeholder="Detalle los daños del vehículo..."
              disabled={isFieldDisabled('other')}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group full-width">
            <label>Relato del siniestro</label>
            <textarea
              value={formData.relato || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, relato: e.target.value }))}
              placeholder="Describa cómo ocurrió el siniestro..."
              style={{ minHeight: '100px' }}
              disabled={isFieldDisabled('other')}
            />
          </div>
        </div>
      </div>

      {/* Datos del tercero */}
      <div className="form-section" style={seccion('tercero')}>
        <div className="form-section-title">Datos del Tercero (Opcional)</div>
        <div className="form-row three-cols">
          <div className="form-group">
            <label>Nombre</label>
            <input
              type="text"
              value={formData.tercero_nombre || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, tercero_nombre: e.target.value }))}
              disabled={isFieldDisabled('other')}
            />
          </div>
          <div className="form-group">
            <label>DNI</label>
            <input
              type="text"
              value={formData.tercero_dni || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, tercero_dni: e.target.value }))}
              disabled={isFieldDisabled('other')}
            />
          </div>
          <div className="form-group">
            <label>Teléfono</label>
            <input
              type="text"
              value={formData.tercero_telefono || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, tercero_telefono: e.target.value }))}
              disabled={isFieldDisabled('other')}
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
              disabled={isFieldDisabled('other')}
            />
          </div>
          <div className="form-group">
            <label>Compañía de seguro</label>
            <CompaniaTerceroSelect
              value={formData.tercero_seguro}
              onChange={(v) => setFormData(prev => ({ ...prev, tercero_seguro: v }))}
              disabled={isFieldDisabled('other')}
            />
          </div>
          <div className="form-group">
            <label>Póliza</label>
            <input
              type="text"
              value={formData.tercero_poliza || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, tercero_poliza: e.target.value }))}
              disabled={isFieldDisabled('other')}
            />
          </div>
        </div>
      </div>

      {/* Gestión */}
      <div className="form-section" style={seccion('gestion')}>
        <div className="form-section-title">Gestión</div>
        {(hayGestionadoPor || hayTramite) && (
          <div className="form-row">
            {hayGestionadoPor && <div className="form-group">
              <label>Quién gestiona</label>
              <select
                value={formData.gestionado_por || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, gestionado_por: e.target.value || undefined }))}
                disabled={isFieldDisabled('other')}
              >
                <option value="">{SIN_GESTOR}</option>
                {Object.entries(GESTIONA_LABELS).map(([valor, label]) => (
                  <option key={valor} value={valor}>{label}</option>
                ))}
              </select>
            </div>}
            {hayTramite && <div className="form-group">
              <label title="Qué se está esperando para que el trámite avance">Qué se está esperando</label>
              <select
                value={formData.situacion_tramite || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, situacion_tramite: e.target.value || undefined }))}
                disabled={isFieldDisabled('other')}
              >
                <option value="">Sin definir</option>
                {Object.entries(SITUACION_LABELS).map(([valor, label]) => (
                  <option key={valor} value={valor}>{label}</option>
                ))}
              </select>
            </div>}
          </div>
        )}
        <div className="form-row">
          <div className="form-group">
            <label>Seguro</label>
            <select
              value={formData.seguro_id || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, seguro_id: e.target.value || undefined }))}
              disabled={isFieldDisabled('other')}
            >
              <option value="">Seleccionar seguro</option>
              {seguros.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Nro. Siniestro Seguro</label>
            <input
              type="text"
              value={formData.nro_siniestro_seguro || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, nro_siniestro_seguro: e.target.value }))}
              disabled={isFieldDisabled('other')}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Carpeta Drive</label>
            <input
              type="url"
              value={formData.carpeta_drive_url || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, carpeta_drive_url: e.target.value }))}
              placeholder="https://drive.google.com/..."
              disabled={isFieldDisabled('other')}
            />
          </div>
          <div className="form-group">
            <label>&nbsp;</label>
            <div className="checkbox-row" style={{ height: '42px', alignItems: 'center' }}>
              <label className="checkbox-card">
                <input
                  type="checkbox"
                  checked={formData.enviado_abogada}
                  onChange={(e) => setFormData(prev => ({ ...prev, enviado_abogada: e.target.checked }))}
                  disabled={isFieldDisabled('other')}
                />
                <span className="checkbox-card-label">Enviado a abogada</span>
              </label>
              <label className="checkbox-card">
                <input
                  type="checkbox"
                  checked={formData.enviado_alliance}
                  onChange={(e) => setFormData(prev => ({ ...prev, enviado_alliance: e.target.checked }))}
                  disabled={isFieldDisabled('other')}
                />
                <span className="checkbox-card-label">Enviado a Rentadora</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Montos */}
      <div className="form-section" style={seccion('gestion')}>
        <div className="form-section-title">Montos</div>
        <div className="form-row">
          {campoMonto('Presupuesto real', 'presupuesto_real', 'Presupuesto del taller')}
          {campoMonto('Reclamado al seguro', 'presupuesto_enviado_seguro', 'Lo que se le pidió al seguro')}
        </div>
        <div className="form-row">
          {hayMontosNuevos && campoMonto('Oferta del seguro', 'oferta_seguro', 'Lo que ofreció el seguro antes del acuerdo')}
          {campoMonto('Aprobado / acordado', 'presupuesto_aprobado_seguro', 'Monto final acordado con el seguro')}
        </div>
        <div className="form-row">
          {campoMonto('Cobrado del seguro', 'total_pagado', 'Se suma solo al registrar un "Pago recibido" en el seguimiento')}
          {campoMonto('Pagado al taller', 'total_reparacion_pagada', 'Lo que se pagó por la reparación')}
        </div>
        <div className="form-row">
          {hayMontosNuevos && (
            <div className="form-group">
              <label title="Suma de los pagos confirmados en los Cobros a conductor del historial de gestión">Cobrado al conductor</label>
              <input type="text" value={formatPlata(formData.cobrado_conductor || 0)} disabled readOnly />
              <span className="ss-ayuda">Se carga con "Confirmar pago" en cada Cobro a conductor del historial.</span>
            </div>
          )}
          <div className="form-group">
            <label>Fecha pago estimada</label>
            <input
              type="date"
              value={formData.fecha_pago_estimada || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, fecha_pago_estimada: e.target.value }))}
              disabled={isFieldDisabled('other')}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>% Abogada</label>
            <input
              type="text"
              inputMode="decimal"
              value={formData.porcentaje_abogada ?? ''}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.]/g, '')
                const num = parseFloat(val)
                setFormData(prev => ({ ...prev, porcentaje_abogada: val === '' ? undefined : (isNaN(num) ? undefined : Math.min(100, num)) }))
              }}
              placeholder="0"
              disabled={isFieldDisabled('other')}
            />
          </div>
          <div className="form-group">
            <label>Resultado</label>
            {resultado ? (
              <div
                className={`siniestro-resultado ${resultado.valor >= 0 ? 'siniestro-resultado--recupero' : 'siniestro-resultado--perdida'}`}
                title={explicarResultado(resultado.costoDe, formData.porcentaje_abogada)}
              >
                {resultado.valor >= 0 ? 'Recupero ' : 'Pérdida '}
                {formatPlata(Math.abs(resultado.valor))}
              </div>
            ) : (
              <div className="siniestro-resultado">Sin montos cargados</div>
            )}
          </div>
        </div>
      </div>

      {/* Observaciones */}
      <div className="form-section" style={seccion('descripcion')}>
        <div className="form-section-title">Observaciones</div>
        <div className="form-row">
          <div className="form-group full-width">
            <textarea
              value={formData.observaciones || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
              placeholder="Notas adicionales..."
              disabled={isFieldDisabled('other')}
            />
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Tarjeta de monto con su "i": qué suma y la cuenta con los números del período
 * (cada fila es [concepto, valor]; la última línea es el total de la tarjeta).
 */
function TarjetaMonto({ icono: Icono, valor, label, explicacion, filas, tono }: {
  icono: React.ComponentType<{ size?: number; className?: string }>
  valor: number
  label: string
  explicacion: string
  filas: Array<[string, string]>
  tono?: 'positivo' | 'negativo'
}) {
  return (
    <div className={`stat-card${tono ? ` stat-card--${tono}` : ''}`}>
      <Icono size={18} className="stat-icon" />
      <div className="stat-content">
        <span className="stat-value">{formatPlata(valor || 0)}</span>
        <span className="stat-label">{label}</span>
      </div>
      <InfoDetalle titulo={label}>
        <span className="info-detalle-texto">{explicacion}</span>
        {filas.map(([concepto, v]) => (
          <span key={concepto} className="info-detalle-fila"><span>{concepto}</span><strong>{v}</strong></span>
        ))}
        <span className="info-detalle-fila info-detalle-total"><span>= {label}</span><strong>{formatPlata(valor || 0)}</strong></span>
      </InfoDetalle>
    </div>
  )
}

interface ParteDistribucion { label: string; valor: number; color: string }

/** Tarjeta con una barra segmentada y la leyenda con número y % de cada parte. */
function BarraDistribucion({ titulo, total, partes }: { titulo: string; total: number; partes: ParteDistribucion[] }) {
  const visibles = partes.filter(p => p.valor > 0 || p.color !== '#cbd5e1')
  return (
    <div className="stat-card dist-card">
      <span className="dist-titulo">{titulo}</span>
      <div className="dist-barra" role="img" aria-label={partes.map(p => `${p.label} ${p.valor}`).join(', ')}>
        {total > 0 && partes.filter(p => p.valor > 0).map(p => (
          <span key={p.label} style={{ width: `${(p.valor / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.valor}`} />
        ))}
      </div>
      <div className="dist-leyenda">
        {total === 0 ? (
          <span className="dist-vacio">Sin siniestros en el período</span>
        ) : visibles.map(p => (
          <span key={p.label} className="dist-item">
            <i style={{ background: p.color }} />
            {p.label} <strong>{p.valor}</strong>
            <span className="dist-pct">{porcentaje(p.valor, total)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Ticket de reparación del siniestro (pestaña "Reparación" de ver y editar). */
function TicketReparacion({ siniestro, onSave }: { siniestro: SiniestroCompleto; onSave: () => void }) {
  return (
    <ReparacionTicket
      siniestroId={siniestro.id}
      reparacion={siniestro.reparacion_id ? {
        id: siniestro.reparacion_id,
        siniestro_id: siniestro.id,
        taller: siniestro.reparacion_taller,
        fecha_inicio: siniestro.reparacion_fecha_inicio,
        fecha_finalizacion: siniestro.reparacion_fecha_finalizacion,
        estado: siniestro.reparacion_estado || 'INICIADO',
        observaciones: siniestro.reparacion_observaciones,
      } : null}
      onSave={onSave}
    />
  )
}

// Componente Detail View
interface SiniestroDetailViewProps {
  siniestro: SiniestroCompleto
  onEdit: () => void
  onReload: () => void
}

function SiniestroDetailView({ siniestro, onEdit, onReload }: SiniestroDetailViewProps) {
  const [activeTab, setActiveTab] = useState<PestanaSiniestro>('evento')
  const resultadoDetalle = calcularResultadoSiniestro(siniestro)

  function formatMoney(value: number | undefined | null) { return formatPlata(value, { ceroComoGuion: true }) }

  // fecha_siniestro se guarda como el día a las 00:00 UTC: pasarla a hora argentina la
  // corría al día anterior (04/11 -> 03/11 21:00). Se muestra el día tal cual se cargó.
  function formatDate(dateStr: string | undefined | null) { return formatFecha(dateStr ? dateStr.slice(0, 10) : dateStr) }

  const respLabels: Record<string, string> = { tercero: 'Tercero', conductor: 'Conductor', compartida: 'Compartida', sin_info: 'Sin info' }
  const vehiculoTexto = [siniestro.vehiculo_marca, siniestro.vehiculo_modelo].filter(Boolean).join(' ')
  const Dato = ({ label, children, ancho }: { label: string; children: React.ReactNode; ancho?: boolean }) => (
    <div className={`sd-dato${ancho ? ' sd-dato-ancho' : ''}`}>
      <span className="sd-label">{label}</span>
      <span className="sd-valor">{children}</span>
    </div>
  )

  return (
    <div className="siniestro-detail sd">
      {/* Encabezado */}
      <div className="sd-header">
        <div className="sd-header-main">
          <div className="sd-header-fila">
            <span className="sd-titulo">{siniestro.vehiculo_patente ? <PatenteBadge patente={siniestro.vehiculo_patente} /> : 'Sin patente'} · {siniestro.categoria_nombre}</span>
            <span className={`estado-badge estado-${siniestro.estado_color}`}>{siniestro.estado_nombre}</span>
            {siniestro.dias_siniestrado !== undefined && siniestro.dias_siniestrado !== null && (
              <span className="dias-badge"><Clock size={12} /> {siniestro.dias_siniestrado} días</span>
            )}
            {(siniestro as any).habilitado_circular === false && (
              <span className="no-circular-badge">No habilitado</span>
            )}
          </div>
          <span className="sd-sub">
            {[siniestro.conductor_display, vehiculoTexto].filter(Boolean).join(' · ') || 'Sin conductor ni vehículo'}
          </span>
        </div>
        <div className="sd-header-acciones">
          {siniestro.carpeta_drive_url && (
            <a href={siniestro.carpeta_drive_url} target="_blank" rel="noopener noreferrer" className="btn-secondary sd-btn" style={{ textDecoration: 'none' }}>
              <FolderOpen size={13} />
              Carpeta
            </a>
          )}
          <button className="btn-secondary sd-btn" onClick={onEdit}>
            <Edit2 size={13} />
            Editar
          </button>
        </div>
      </div>

      {/* Mismas pestañas que Editar, para leer el siniestro en el mismo orden */}
      <TabsBar
        className="tabs-bar--modal"
        ariaLabel="Datos del siniestro"
        tabs={PESTANAS_SINIESTRO.map(t => (t.id === 'reparacion' && siniestro.reparacion_id
          ? { ...t, label: 'Reparación •' } : t))}
        active={activeTab}
        onChange={setActiveTab}
      />

      <div className="sd-body">
        {activeTab === 'evento' && (
          <>
            <section className="sd-seccion">
              <div className="sd-seccion-titulo">Datos del evento</div>
              <div className="sd-grid">
                <Dato label="Patente"><PatenteBadge patente={siniestro.vehiculo_patente} size="sm" /></Dato>
                <Dato label="Vehículo">{vehiculoTexto || '-'}</Dato>
                <Dato label="Conductor" ancho>{siniestro.conductor_display || '-'}</Dato>
                <Dato label="Fecha">{formatDate(siniestro.fecha_siniestro)}</Dato>
                <Dato label="Hora">{siniestro.hora_siniestro ? siniestro.hora_siniestro.slice(0, 5) : '-'}</Dato>
                <Dato label="Ubicación" ancho>{siniestro.ubicacion || '-'}</Dato>
              </div>
            </section>
            <section className="sd-seccion">
              <div className="sd-seccion-titulo">Clasificación</div>
              <div className="sd-grid">
                <Dato label="Categoría">{siniestro.categoria_nombre || '-'}</Dato>
                <Dato label="Estado">{siniestro.estado_nombre || '-'}</Dato>
                {siniestro.motivo_cierre && (
                  <Dato label="Motivo de cierre">{MOTIVO_CIERRE_LABELS[siniestro.motivo_cierre] || siniestro.motivo_cierre}</Dato>
                )}
                <Dato label="Responsable">{siniestro.responsable ? (respLabels[siniestro.responsable] || siniestro.responsable) : '-'}</Dato>
                <Dato label="Lesionados">{siniestro.hay_lesionados ? 'Sí' : 'No'}</Dato>
              </div>
            </section>
          </>
        )}

        {activeTab === 'descripcion' && (
          <section className="sd-seccion">
            <div className="sd-seccion-titulo">Descripción</div>
            <div className="sd-texto-bloque">
              <span className="sd-label">Daños</span>
              <p className="sd-texto">{siniestro.descripcion_danos || '-'}</p>
            </div>
            <div className="sd-texto-bloque">
              <span className="sd-label">Relato</span>
              <p className="sd-texto">{siniestro.relato || '-'}</p>
            </div>
            <div className="sd-texto-bloque">
              <span className="sd-label">Observaciones</span>
              <p className="sd-texto">{siniestro.observaciones || '-'}</p>
            </div>
          </section>
        )}

        {activeTab === 'tercero' && (
          <section className="sd-seccion">
            <div className="sd-seccion-titulo">Datos del tercero</div>
            <div className="sd-grid">
              <Dato label="Nombre">{siniestro.tercero_nombre || '-'}</Dato>
              <Dato label="DNI">{siniestro.tercero_dni || '-'}</Dato>
              <Dato label="Teléfono">{siniestro.tercero_telefono || '-'}</Dato>
              <Dato label="Vehículo">{siniestro.tercero_vehiculo || '-'}</Dato>
              <Dato label="Compañía de seguro">{nombreCompaniaTercero(siniestro.tercero_seguro) || '-'}</Dato>
              <Dato label="Póliza">{siniestro.tercero_poliza || '-'}</Dato>
            </div>
          </section>
        )}

        {activeTab === 'gestion' && (
          <>
            <section className="sd-seccion">
              <div className="sd-seccion-titulo">Gestión</div>
              <div className="sd-grid">
                <Dato label="Quién gestiona">{etiquetaGestor(siniestro.gestionado_por)}</Dato>
                <Dato label="Qué se está esperando">
                  {siniestro.situacion_tramite ? (SITUACION_LABELS[siniestro.situacion_tramite] || siniestro.situacion_tramite) : '-'}
                </Dato>
                <Dato label="Seguro">{siniestro.seguro_nombre || '-'}</Dato>
                <Dato label="Nro. siniestro">{siniestro.nro_siniestro_seguro || '-'}</Dato>
                <Dato label="Enviado a abogada">{siniestro.enviado_abogada ? 'Sí' : 'No'}</Dato>
                <Dato label="Enviado a rentadora">{siniestro.enviado_alliance ? 'Sí' : 'No'}</Dato>
              </div>
            </section>
            <section className="sd-seccion">
              <div className="sd-seccion-titulo">Montos</div>
              <div className="sd-grid">
                <Dato label="Presupuesto real">{formatMoney(siniestro.presupuesto_real)}</Dato>
                <Dato label="Reclamado al seguro">{formatMoney(siniestro.presupuesto_enviado_seguro)}</Dato>
                {siniestro.oferta_seguro ? <Dato label="Oferta del seguro">{formatMoney(siniestro.oferta_seguro)}</Dato> : null}
                <Dato label="Aprobado / acordado">{formatMoney(siniestro.presupuesto_aprobado_seguro)}</Dato>
                <Dato label="Cobrado del seguro"><span className={siniestro.total_pagado ? 'sd-positivo' : undefined}>{formatMoney(siniestro.total_pagado)}</span></Dato>
                <Dato label="Pagado al taller">{formatMoney(siniestro.total_reparacion_pagada)}</Dato>
                <Dato label="Cobrado al conductor">{formatMoney(siniestro.cobrado_conductor)}</Dato>
                <Dato label="Fecha pago estimada">{formatDate(siniestro.fecha_pago_estimada)}</Dato>
                <Dato label="% Abogada">{siniestro.porcentaje_abogada != null ? `${siniestro.porcentaje_abogada}%` : '-'}</Dato>
                {resultadoDetalle && (
                  <Dato label="Resultado">
                    <span
                      className={resultadoDetalle.valor >= 0 ? 'sd-positivo' : 'sd-negativo'}
                      title={explicarResultado(resultadoDetalle.costoDe, siniestro.porcentaje_abogada)}
                    >
                      {resultadoDetalle.valor >= 0 ? 'Recupero ' : 'Pérdida '}{formatPlata(Math.abs(resultadoDetalle.valor))}
                    </span>
                  </Dato>
                )}
              </div>
            </section>
          </>
        )}

        {activeTab === 'reparacion' && <TicketReparacion siniestro={siniestro} onSave={onReload} />}

        {activeTab === 'seguimiento' && (
          <SiniestroSeguimiento siniestro={siniestro} onReload={onReload} readonly />
        )}
      </div>

    </div>
  )
}
