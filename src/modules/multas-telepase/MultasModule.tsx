/* eslint-disable react-hooks/exhaustive-deps */
// src/modules/multas-telepase/MultasModule.tsx
import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { ExcelColumnFilter } from '../../components/ui/DataTable/ExcelColumnFilter'
import { ExcelDateRangeFilter } from '../../components/ui/DataTable/ExcelDateRangeFilter'
import { DataTable } from '../../components/ui/DataTable'
import { Download, AlertTriangle, Eye, Edit2, Trash2, Plus, X, Car, Users, DollarSign, CheckCircle, AlertCircle, FileText, Receipt, SendHorizonal, Archive, RotateCcw } from 'lucide-react'
import { CrearCobroMultaModal } from './components/CrearCobroMultaModal'
import { type ColumnDef } from '@tanstack/react-table'
import * as XLSX from 'xlsx'
import Swal from 'sweetalert2'
import { showSuccess, showError } from '../../utils/toast'
import { useSede } from '../../contexts/SedeContext'
import { useAuth } from '../../contexts/AuthContext'
import { crearCobroDesdeMulta } from './services/crearCobroDesdeMulta'
import { desestimarMulta as svcDesestimarMulta, reactivarMulta as svcReactivarMulta } from './services/desestimarMulta'
import { withAudit, logMultaAudit } from './services/auditMulta'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import './MultasTelepase.css'

interface Multa {
  id: number
  created_at: string
  patente: string
  fecha_infraccion: string | null
  importe: string
  importe_descuento?: string | null
  fecha_vencimiento_descuento?: string | null
  lugar: string
  detalle: string
  fecha_anotacion: string | null
  conductor_responsable: string
  observaciones: string
  infraccion: string
  lugar_detalle: string
  ibutton: string
  sede_id?: string
  drive_url?: string | null
  // Desestimación lógica (no es delete real)
  desestimada_at?: string | null
  desestimada_motivo?: string | null
  desestimada_by?: string | null
  // Auditoría
  updated_at?: string | null
  updated_by?: string | null
  updated_by_name?: string | null
}

interface Vehiculo {
  id: string
  patente: string
}

type VistaMultas = 'activas' | 'enviadas' | 'desestimadas'

type CuotaProceso = { numero: number; monto: number; semana: number; anio: number; aplicado: boolean }

function parseImporte(importe: string | number | null | undefined): number {
  if (importe == null || importe === '') return 0
  if (typeof importe === 'number') return importe
  let s = importe.replace(/[^\d,.-]/g, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (lastDot !== -1 && lastComma !== -1) {
    s = s.replace(/,/g, '')
  }
  const num = parseFloat(s)
  return isNaN(num) ? 0 : num
}

function formatMoney(value: string | number | null | undefined): string {
  const num = parseImporte(value)
  return `$ ${num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatFecha(fecha: string | null): string {
  if (!fecha) return '-'
  try {
    return format(new Date(fecha), 'dd/MM/yyyy', { locale: es })
  } catch {
    return fecha
  }
}

// Fecha local de hoy en formato YYYY-MM-DD. No usamos toISOString() porque
// convierte a UTC y cerca de medianoche (AR = UTC-3) devolveria el dia equivocado.
function getHoyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function splitDateTime(dateStr: string | null): { date: string; time: string } {
  if (!dateStr) return { date: '-', time: '' }
  try {
    const d = new Date(dateStr)
    const date = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    return { date, time }
  } catch {
    return { date: '-', time: '' }
  }
}

function getWeekNumber(dateStr: string): number {
  const date = new Date(dateStr)
  const thursday = new Date(date)
  thursday.setDate(thursday.getDate() - ((thursday.getDay() + 6) % 7) + 3)
  const firstThursday = new Date(thursday.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)
  const weekNumber = Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
  return weekNumber
}

export default function MultasModule() {
  const { aplicarFiltroSede, sedeActualId, sedeUsuario, sedes } = useSede()
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [multas, setMultas] = useState<Multa[]>([])
  // Filas realmente visibles en la tabla tras aplicar los filtros internos del
  // DataTable (búsqueda global, filtros Excel de columna y fecha). Se llena vía
  // onFilteredDataChange. Es null hasta que la tabla reporta por primera vez.
  const [multasVisibles, setMultasVisibles] = useState<Multa[] | null>(null)
  // Búsqueda global CONTROLADA: la usamos también para las métricas de monto por
  // estado (Sin Facturar / Facturadas / Total), que son cross-tab y no salen de multasVisibles.
  const [busqueda, setBusqueda] = useState('')
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [multasEnviadas, setMultasEnviadas] = useState<Set<number>>(new Set())
  // Info de incidencia por multa (para la vista "Enviadas a facturación"): monto de la
  // incidencia MÁS RECIENTE y cantidad de incidencias (para marcar duplicado).
  const [multasIncidencia, setMultasIncidencia] = useState<Map<number, { monto: number; count: number; fechaEnvio: string }>>(new Map())
  // Estado de pago por multa (segun facturacion / penalidades, misma logica que Mi Espacio):
  // pagada = penalidad no fraccionada aplicada en periodo cerrado; fraccionada = penalidad fraccionada.
  // Las multas que NO estan en este mapa se consideran pendientes. `monto` = monto facturado (penalidad).
  const [multasEstadoPago, setMultasEstadoPago] = useState<Map<number, { estado: 'pagada' | 'fraccionada'; monto: number; fraccionada: boolean; semanasPago: string[] }>>(new Map())
  const [showPendienteModal, setShowPendienteModal] = useState(false)
  const [showPagadoModal, setShowPagadoModal] = useState(false)
  const [showProcesoModal, setShowProcesoModal] = useState(false)
  // Cuotas de las multas fraccionadas (por multa_id) para el detalle de "En Proceso".
  const [multasCuotas, setMultasCuotas] = useState<Map<number, CuotaProceso[]>>(new Map())
  const [selectedMulta, setSelectedMulta] = useState<Multa | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showCobroModal, setShowCobroModal] = useState(false)
  const [multaParaCobro, setMultaParaCobro] = useState<Multa | null>(null)
  const [editingMulta, setEditingMulta] = useState<Multa | null>(null)
  const [onlyActiveConductors, setOnlyActiveConductors] = useState(false)
  // Vista por estado operativo (toggle del header)
  const [vista, setVista] = useState<VistaMultas>('activas')

  // Permisos por rol + whitelist por email — solo god mode puede reactivar/borrar.
  // El resto (incluido data entry) solo puede desestimar.
  const userRole = (profile?.roles?.name || '').toLowerCase()
  const userEmail = (profile?.email || '').toLowerCase()
  // Emails de god mode (acceso total a borrar/reactivar más allá del rol).
  // Christiam y Esau ya son admin por rol, pero los incluimos por defensa en profundidad.
  const GOD_MODE_EMAILS = new Set<string>([
    'techspec@toshify.com.ar',    // Maria Flores
    'archspec@toshify.com.ar',    // Christiam Mendoza
    'fullstack@toshify.com.ar',   // Esau Pretell
  ])
  const isGodMode =
    userRole === 'admin' ||
    userRole === 'fullstack.senior' ||
    GOD_MODE_EMAILS.has(userEmail)
  const canReactivar = isGodMode
  const canBorrar = isGodMode

  // Filtros
  const [openFilterId, setOpenFilterId] = useState<string | null>(null)
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [lugarFilter, setLugarFilter] = useState<string[]>([])
  const [infraccionFilter, setInfraccionFilter] = useState<string[]>([])
  const [detalleFilter, setDetalleFilter] = useState<string[]>([])
  const [semanaFilter, setSemanaFilter] = useState<string[]>([])
  const [obsFilter, setObsFilter] = useState<string[]>([])
  const [importeFilter, setImporteFilter] = useState<string[]>([])
  const [fechaInfraccionDesde, setFechaInfraccionDesde] = useState<string | null>(null)
  const [fechaInfraccionHasta, setFechaInfraccionHasta] = useState<string | null>(null)
  const [fechaCargaDesde, setFechaCargaDesde] = useState<string | null>(null)
  const [fechaCargaHasta, setFechaCargaHasta] = useState<string | null>(null)
  const [ibuttonFilter, setIbuttonFilter] = useState<string[]>([])

  // Opciones para autocompletado y validación
  const [conductoresOptions, setConductoresOptions] = useState<string[]>([])
  const [conductoresStatus, setConductoresStatus] = useState<Record<string, string>>({})
  const [showConductorSuggestions, setShowConductorSuggestions] = useState(false)

  useEffect(() => {
    cargarDatos()
    fetchConductores()
  }, [sedeActualId])

  async function fetchConductores() {
    try {
      // Consulta de referencia: SELECT DISTINCT CONCAT(nombres, ' ', apellidos) AS conductor FROM conductores
      const { data, error } = await aplicarFiltroSede(supabase
        .from('conductores')
        .select('nombres, apellidos, estado_facturacion'))
        .order('nombres', { ascending: true })
        .limit(5000)
      
      if (error) throw error
      
      if (data) {
        // Mapa de estados para validación
        const statusMap: Record<string, string> = {}
        const options: string[] = []

        data.forEach((c: any) => {
          const nombre = c.nombres || ''
          const apellido = c.apellidos || ''
          const fullName = `${nombre} ${apellido}`.trim()
          
          if (fullName) {
            statusMap[fullName.toLowerCase()] = c.estado_facturacion
            options.push(fullName)
          }
        })

        setConductoresStatus(statusMap)
        setConductoresOptions([...new Set(options)].sort())
      }
    } catch {
      // silently ignored
    }
  }

  async function cargarDatos() {
    setLoading(true)
    try {
      // Traemos activas (deleted_at IS NULL) — incluye tanto las desestimadas como las no desestimadas.
      // Las borradas reales (deleted_at NOT NULL) se omiten — son las eliminadas con el botón rojo.
      const [multasRes, vehiculosRes, incidenciasRes, penalidadesRes, periodosRes] = await Promise.all([
        aplicarFiltroSede(supabase.from('multas_historico').select('*').is('deleted_at', null)).order('created_at', { ascending: false }).limit(5000),
        aplicarFiltroSede(supabase.from('vehiculos').select('id, patente').is('deleted_at', null)),
        // Incidencias de multas (=ya fueron enviadas a facturación): monto y fecha
        // para calcular el monto de la incidencia más reciente y detectar duplicados.
        (supabase.from('incidencias' as any) as any)
          .select('multa_id, monto, created_at')
          .not('multa_id', 'is', null),
        // Penalidades de multas (para estado de pago pagada/fraccionada + monto facturado)
        (supabase.from('penalidades' as any) as any)
          .select('id, monto, fraccionado, cantidad_cuotas, aplicado, rechazado, semana_aplicacion, anio_aplicacion, incidencias!inner(multa_id)')
          .not('incidencias.multa_id', 'is', null),
        supabase.from('periodos_facturacion').select('semana, anio').eq('estado', 'cerrado'),
      ])

      if (multasRes.error) throw multasRes.error
      setMultas((multasRes.data || []) as Multa[])
      setVehiculos((vehiculosRes.data || []) as Vehiculo[])

      const enviadas = new Set<number>(
        ((incidenciasRes.data || []) as Array<{ multa_id: number | null }>)
          .map(r => r.multa_id)
          .filter((v): v is number => v != null)
      )
      setMultasEnviadas(enviadas)

      // Monto de la incidencia más reciente + cantidad de incidencias por multa.
      const incMap = new Map<number, { monto: number; count: number; fecha: string }>()
      for (const r of (incidenciasRes.data || []) as Array<{ multa_id: number | null; monto: number | null; created_at: string | null }>) {
        if (r.multa_id == null) continue
        const fecha = r.created_at || ''
        const prev = incMap.get(r.multa_id)
        if (!prev) {
          incMap.set(r.multa_id, { monto: Number(r.monto) || 0, count: 1, fecha })
        } else {
          prev.count += 1
          if (fecha >= prev.fecha) { prev.monto = Number(r.monto) || 0; prev.fecha = fecha }
        }
      }
      setMultasIncidencia(new Map([...incMap].map(([k, v]) => [k, { monto: v.monto, count: v.count, fechaEnvio: v.fecha }])))

      const cerradas = new Set<string>(
        ((periodosRes.data || []) as Array<{ semana: number; anio: number }>).map(p => `${p.semana}-${p.anio}`)
      )

      // 1) Cuotas de las penalidades fraccionadas (agrupadas por penalidad y por multa).
      const penaMultaFracc = new Map<string, number>() // penalidad_id -> multa_id
      for (const p of (penalidadesRes.data || []) as Array<any>) {
        const mid = p.incidencias?.multa_id
        if (p.fraccionado === true && p.id != null && mid != null) penaMultaFracc.set(p.id, mid)
      }
      const cuotasPorPenalidad = new Map<string, CuotaProceso[]>()
      const cuotasMap = new Map<number, CuotaProceso[]>() // por multa_id (para los modales)
      if (penaMultaFracc.size > 0) {
        const { data: cuotasData } = await (supabase.from('penalidades_cuotas' as any) as any)
          .select('penalidad_id, numero_cuota, semana, anio, monto_cuota, aplicado')
          .in('penalidad_id', [...penaMultaFracc.keys()])
        for (const c of (cuotasData || []) as Array<any>) {
          const cuota: CuotaProceso = {
            numero: Number(c.numero_cuota) || 0,
            monto: Number(c.monto_cuota) || 0,
            semana: Number(c.semana) || 0,
            anio: Number(c.anio) || 0,
            aplicado: c.aplicado === true,
          }
          const pArr = cuotasPorPenalidad.get(c.penalidad_id) || []
          pArr.push(cuota)
          cuotasPorPenalidad.set(c.penalidad_id, pArr)
          const mid = penaMultaFracc.get(c.penalidad_id)
          if (mid != null) {
            const mArr = cuotasMap.get(mid) || []
            mArr.push(cuota)
            cuotasMap.set(mid, mArr)
          }
        }
        for (const arr of cuotasPorPenalidad.values()) arr.sort((a, b) => a.numero - b.numero)
        for (const arr of cuotasMap.values()) arr.sort((a, b) => a.numero - b.numero)
      }
      setMultasCuotas(cuotasMap)

      // 2) Estado de pago por multa. Una fraccionada con TODAS sus cuotas cobradas
      //    pasa a "pagada"; si le falta alguna cuota, sigue "en proceso" (fraccionada).
      const estadoMap = new Map<number, { estado: 'pagada' | 'fraccionada'; monto: number; fraccionada: boolean; semanasPago: string[] }>()
      for (const p of (penalidadesRes.data || []) as Array<any>) {
        const mid = p.incidencias?.multa_id
        if (mid == null) continue
        const monto = parseImporte(p.monto)
        if (p.fraccionado === true) {
          const cuotas = cuotasPorPenalidad.get(p.id) || []
          const cantidad = Number(p.cantidad_cuotas) || 0
          const todasCobradas = cuotas.length > 0 && cuotas.every(c => c.aplicado) && (cantidad === 0 || cuotas.length >= cantidad)
          // Semanas de las cuotas ya cobradas (cuando está pagada del todo son todas).
          const semanasPago = cuotas.filter(c => c.aplicado).map(c => `S${c.semana}/${c.anio}`)
          estadoMap.set(mid, { estado: todasCobradas ? 'pagada' : 'fraccionada', monto, fraccionada: true, semanasPago })
        } else if (p.aplicado === true && p.rechazado !== true && cerradas.has(`${p.semana_aplicacion}-${p.anio_aplicacion}`)) {
          const prev = estadoMap.get(mid)
          // No pisar una entrada que ya viene de un fraccionamiento.
          if (!prev || !prev.fraccionada) {
            const sem = (p.semana_aplicacion != null && p.anio_aplicacion != null) ? [`S${p.semana_aplicacion}/${p.anio_aplicacion}`] : []
            estadoMap.set(mid, { estado: 'pagada', monto, fraccionada: false, semanasPago: sem })
          }
        }
      }
      setMultasEstadoPago(estadoMap)
    } catch {
      Swal.fire('Error', 'No se pudieron cargar las multas', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Lógica de filtrado centralizada
  const filterPredicates = useMemo(() => ({
    obs: (m: Multa) => {
      if (obsFilter.length === 0) return true
      const tieneObs = !m.conductor_responsable || !m.ibutton
      const estado = tieneObs ? 'Con observaciones' : 'Sin observaciones'
      return obsFilter.includes(estado)
    },
    importe: (m: Multa) => importeFilter.length === 0 || importeFilter.includes(String(m.importe)),
    patente: (m: Multa) => patenteFilter.length === 0 || patenteFilter.includes(m.patente),
    conductor: (m: Multa) => conductorFilter.length === 0 || conductorFilter.includes(m.conductor_responsable || '-'),
    lugar: (m: Multa) => lugarFilter.length === 0 || lugarFilter.includes(m.lugar),
    infraccion: (m: Multa) => infraccionFilter.length === 0 || infraccionFilter.includes(m.infraccion),
    detalle: (m: Multa) => detalleFilter.length === 0 || detalleFilter.includes(m.detalle || '-'),
    semana: (m: Multa) => {
      if (semanaFilter.length === 0) return true
      if (!m.created_at) return false
      return semanaFilter.includes((getWeekNumber(m.created_at) + 1).toString())
    },
    ibutton: (m: Multa) => {
      if (ibuttonFilter.length === 0) return true
      const val = (!m.ibutton || m.ibutton.trim() === '') ? '-' : m.ibutton.trim()
      return ibuttonFilter.includes(val)
    },
    fecha: (m: Multa) => {
      if (fechaInfraccionDesde && (!m.fecha_infraccion || m.fecha_infraccion < fechaInfraccionDesde)) return false
      if (fechaInfraccionHasta && (!m.fecha_infraccion || m.fecha_infraccion > `${fechaInfraccionHasta}T23:59:59`)) return false
      return true
    },
    fechaCarga: (m: Multa) => {
      if (fechaCargaDesde && (!m.created_at || m.created_at < fechaCargaDesde)) return false
      if (fechaCargaHasta && (!m.created_at || m.created_at > `${fechaCargaHasta}T23:59:59`)) return false
      return true
    }
  }), [obsFilter, importeFilter, patenteFilter, conductorFilter, lugarFilter, infraccionFilter, detalleFilter, semanaFilter, ibuttonFilter, fechaInfraccionDesde, fechaInfraccionHasta, fechaCargaDesde, fechaCargaHasta])

  const getFilteredData = useCallback((excludeKey?: string) => {
    return multas.filter(m => {
      if (excludeKey !== 'obs' && !filterPredicates.obs(m)) return false
      if (excludeKey !== 'importe' && !filterPredicates.importe(m)) return false
      if (excludeKey !== 'patente' && !filterPredicates.patente(m)) return false
      if (excludeKey !== 'conductor' && !filterPredicates.conductor(m)) return false
      if (excludeKey !== 'lugar' && !filterPredicates.lugar(m)) return false
      if (excludeKey !== 'infraccion' && !filterPredicates.infraccion(m)) return false
      if (excludeKey !== 'detalle' && !filterPredicates.detalle(m)) return false
      if (excludeKey !== 'semana' && !filterPredicates.semana(m)) return false
      if (excludeKey !== 'ibutton' && !filterPredicates.ibutton(m)) return false
      if (excludeKey !== 'fecha' && !filterPredicates.fecha(m)) return false
      if (excludeKey !== 'fechaCarga' && !filterPredicates.fechaCarga(m)) return false
      return true
    })
  }, [multas, filterPredicates])

  // Valores unicos para filtros (Cascading)
  const patentesUnicas = useMemo(() =>
    [...new Set(getFilteredData('patente').map(m => m.patente).filter(Boolean))].sort()
  , [getFilteredData])

  const conductoresUnicos = useMemo(() =>
    [...new Set(getFilteredData('conductor').map(m => m.conductor_responsable || '-'))].sort()
  , [getFilteredData])

  const lugaresUnicos = useMemo(() =>
    [...new Set(getFilteredData('lugar').map(m => m.lugar).filter(Boolean))].sort()
  , [getFilteredData])

  const infraccionesUnicas = useMemo(() =>
    [...new Set(getFilteredData('infraccion').map(m => m.infraccion).filter(Boolean))].sort()
  , [getFilteredData])

  const detallesUnicos = useMemo(() =>
    [...new Set(getFilteredData('detalle').map(m => m.detalle || '-'))].sort()
  , [getFilteredData])

  const semanasUnicas = useMemo(() => {
    const semanas = new Set<string>()
    getFilteredData('semana').forEach(m => {
      if (m.created_at) {
        semanas.add((getWeekNumber(m.created_at) + 1).toString())
      }
    })
    return [...semanas].sort((a, b) => parseInt(a) - parseInt(b))
  }, [getFilteredData])

  const ibuttonsUnicos = useMemo(() =>
    [...new Set(getFilteredData('ibutton').map(m => {
      if (!m.ibutton) return '-'
      const clean = m.ibutton.trim()
      return clean === '' ? '-' : clean
    }))].sort()
  , [getFilteredData])

  const obsOptions = useMemo(() => {
     const data = getFilteredData('obs')
     const options = new Set<string>()
     data.forEach(m => {
        const tieneObs = !m.conductor_responsable || !m.ibutton
        options.add(tieneObs ? 'Con observaciones' : 'Sin observaciones')
     })
     return [...options].sort()
  }, [getFilteredData])

  const importesUnicos = useMemo(() =>
    [...new Set(getFilteredData('importe').map(m => String(m.importe || '')))].filter(Boolean).sort()
  , [getFilteredData])

  const fueEnviadaAFacturacion = useCallback((m: Multa): boolean => {
    return multasEnviadas.has(m.id)
  }, [multasEnviadas])

  // FIX 2026-05-20: helper para detectar multas con conductor con coma (2+ conductores).
  // Las ocultamos automaticamente de la vista "Activas" y "Desestimadas" porque quedan
  // pendientes de revision manual.
  const tieneConductorConComa = (m: Multa): boolean => {
    return !!m.conductor_responsable && m.conductor_responsable.includes(',')
  }

  // Filtrar registros (Resultado final) — separa activas, enviadas y desestimadas según toggle
  const multasFiltradas = useMemo(() => {
    const data = getFilteredData()
    const porVista = data.filter(m => {
      if (vista === 'desestimadas') return !!m.desestimada_at
      if (m.desestimada_at) return false
      if (vista === 'enviadas') return fueEnviadaAFacturacion(m)
      return !fueEnviadaAFacturacion(m)
    })
    // FIX 2026-05-20: ocultar multas con 2 conductores (con coma) pendientes de revision
    const sinComa = porVista.filter(m => !tieneConductorConComa(m))
    // Ordenar por fecha de carga (created_at) descendente (más actual a más antiguo)
    return sinComa.sort((a, b) => {
      const fechaA = a.created_at || ''
      const fechaB = b.created_at || ''
      if (fechaA === fechaB) return 0
      if (!fechaA) return 1 // Nulos al final
      if (!fechaB) return -1
      return fechaB.localeCompare(fechaA)
    })
  }, [getFilteredData, vista, fueEnviadaAFacturacion])

  // Contadores globales (sin filtros) para el toggle del header
  // FIX 2026-05-20: contadores tambien excluyen las con coma (pendientes de revision)
  const totalActivas = useMemo(() =>
    multas.filter(m =>
      !m.desestimada_at &&
      !fueEnviadaAFacturacion(m) &&
      !tieneConductorConComa(m)
    ).length
  , [multas, fueEnviadaAFacturacion])
  const totalEnviadas = useMemo(() =>
    multas.filter(m =>
      !m.desestimada_at &&
      fueEnviadaAFacturacion(m) &&
      !tieneConductorConComa(m)
    ).length
  , [multas, fueEnviadaAFacturacion])
  const totalDesestimadas = useMemo(() => multas.filter(m => !!m.desestimada_at && !tieneConductorConComa(m)).length, [multas])

  const vistaOptions = useMemo<Array<{ id: VistaMultas; label: string; count: number }>>(() => [
    { id: 'activas', label: 'Activas', count: totalActivas },
    { id: 'enviadas', label: 'Enviadas a facturación', count: totalEnviadas },
    { id: 'desestimadas', label: 'Desestimadas', count: totalDesestimadas },
  ], [totalActivas, totalEnviadas, totalDesestimadas])

  // Estadisticas
  // Los KPIs se calculan sobre las filas realmente visibles en la tabla
  // (multasVisibles) para que reflejen también la búsqueda global y los filtros
  // internos del DataTable. Hasta que la tabla reporta por primera vez usamos
  // multasFiltradas como respaldo para evitar un parpadeo en 0.
  const multasKpi = multasVisibles ?? multasFiltradas

  // Coincidencia de búsqueda por multa (misma lógica que se pasa al DataTable como
  // globalFilterFn, para que tabla y métricas usen exactamente el mismo criterio).
  const matchBusqueda = useCallback((m: Multa, term: string): boolean => {
    const t = (term || '').toLowerCase().trim()
    if (!t) return true
    const hay = [m.patente, m.conductor_responsable, m.lugar, m.infraccion, m.detalle, m.ibutton, m.importe]
      .map(x => String(x ?? '').toLowerCase()).join(' ')
    return t.split(/\s+/).filter(Boolean).every(w => hay.includes(w))
  }, [])

  // Métricas independientes por estado de pago (misma lógica que Mi Espacio).
  // Pendiente: importe de la multa, con descuento solo si la fecha de vencimiento
  // del descuento es POSTERIOR a hoy (hoy o pasada -> importe pleno).
  // Pagado / En proceso: monto facturado (penalidad) de las multas pagadas / fraccionadas.
  const montosPorPago = useMemo(() => {
    const base = getFilteredData().filter(m =>
      !m.desestimada_at && !tieneConductorConComa(m) && matchBusqueda(m, busqueda)
    )
    const hoyStr = new Date().toISOString().slice(0, 10)
    let pendiente = 0, pagado = 0, proceso = 0
    // Detalle de las multas que arman cada métrica.
    const pendienteDetalle: Array<{ multa: Multa; columna: 'IMPORTE' | 'IMP_DESC'; monto: number; enviado: boolean }> = []
    const pagadoDetalle: Array<{ multa: Multa; monto: number; fraccionada: boolean; semanasPago: string[] }> = []
    const procesoDetalle: Array<{ multa: Multa; monto: number; fraccionada: boolean; semanasPago: string[] }> = []
    for (const m of base) {
      const est = multasEstadoPago.get(m.id)
      if (est?.estado === 'pagada') {
        // El monto pagado se toma de la incidencia (lo realmente enviado a facturar);
        // la penalidad queda como respaldo si por algún motivo no hubiera incidencia.
        const montoPagado = multasIncidencia.get(m.id)?.monto ?? est.monto
        pagado += montoPagado
        pagadoDetalle.push({ multa: m, monto: montoPagado, fraccionada: est.fraccionada, semanasPago: est.semanasPago })
      } else if (est?.estado === 'fraccionada') {
        // El total en proceso se toma de la incidencia (con la penalidad como respaldo).
        const montoTotal = multasIncidencia.get(m.id)?.monto ?? est.monto
        proceso += montoTotal
        procesoDetalle.push({ multa: m, monto: montoTotal, fraccionada: true, semanasPago: est.semanasPago })
      } else {
        const desc = parseImporte(m.importe_descuento)
        const vencStr = m.fecha_vencimiento_descuento ? String(m.fecha_vencimiento_descuento).slice(0, 10) : ''
        const usarDescuento = desc > 0 && vencStr > hoyStr
        const montoBase = usarDescuento ? desc : parseImporte(m.importe)
        // Si ya fue enviada a incidencia, el monto pendiente es lo realmente enviado a
        // facturar; si no, se usa la lógica de Importe / Imp. Desc.
        const inci = multasIncidencia.get(m.id)
        const monto = inci ? inci.monto : montoBase
        pendiente += monto
        pendienteDetalle.push({ multa: m, columna: usarDescuento ? 'IMP_DESC' : 'IMPORTE', monto, enviado: !!inci })
      }
    }
    return { pendiente, pagado, proceso, pendienteDetalle, pagadoDetalle, procesoDetalle }
  }, [getFilteredData, busqueda, matchBusqueda, multasEstadoPago, multasIncidencia])

  // Los botones "Detalle" (Pendiente / Pagado / En Proceso) solo se habilitan cuando
  // la búsqueda coincide EXACTAMENTE con una patente o un conductor (no basta con un
  // texto parcial como "karina").
  const detalleHabilitado = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    if (!term) return false
    return multas.some(m =>
      (!!m.patente && m.patente.trim().toLowerCase() === term) ||
      (!!m.conductor_responsable && m.conductor_responsable.trim().toLowerCase() === term)
    )
  }, [busqueda, multas])

  const patentesUnicasCount = useMemo(() =>
    new Set(multasKpi.map(m => m.patente).filter(Boolean)).size
  , [multasKpi])

  const conductoresUnicosCount = useMemo(() =>
    new Set(multasKpi.map(m => m.conductor_responsable).filter(Boolean)).size
  , [multasKpi])

  // Ver detalle
  function handleVerDetalle(multa: Multa) {
    setSelectedMulta(multa)
    setShowModal(true)
  }

  // Crear multa
  async function crearMulta() {
    const patentesOptions = vehiculos
      .sort((a, b) => (a.patente || '').localeCompare(b.patente || ''))
      .map(v => `<option value="${v.patente}">${v.patente}</option>`)
      .join('')

    const { value: formValues } = await Swal.fire({
      title: 'Registrar Multa',
      html: `
        <div class="multas-modal-form">
          <div class="multas-form-group">
            <label class="multas-form-label">Patente *</label>
            <select id="swal-patente" class="multas-form-select">
              <option value="">Seleccione vehiculo...</option>
              ${patentesOptions}
            </select>
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Fecha Infraccion *</label>
            <input id="swal-fecha" type="date" class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Importe ($) *</label>
            <input id="swal-importe" type="number" placeholder="Ej: 500000" class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Infraccion</label>
            <input id="swal-infraccion" type="text" placeholder="Tipo de infraccion..." class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Lugar</label>
            <input id="swal-lugar" type="text" placeholder="Ubicacion..." class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Conductor Responsable</label>
            <input id="swal-conductor" type="text" placeholder="Nombre del conductor..." class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Observaciones</label>
            <textarea id="swal-detalle" rows="2" placeholder="Detalles adicionales..." class="multas-form-textarea"></textarea>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      width: 480,
      preConfirm: () => {
        const patente = (document.getElementById('swal-patente') as HTMLSelectElement).value
        const fecha = (document.getElementById('swal-fecha') as HTMLInputElement).value
        const importe = (document.getElementById('swal-importe') as HTMLInputElement).value
        const infraccion = (document.getElementById('swal-infraccion') as HTMLInputElement).value
        const lugar = (document.getElementById('swal-lugar') as HTMLInputElement).value
        const conductor = (document.getElementById('swal-conductor') as HTMLInputElement).value
        const detalle = (document.getElementById('swal-detalle') as HTMLTextAreaElement).value

        if (!patente) { Swal.showValidationMessage('Seleccione una patente'); return false }
        if (!fecha) { Swal.showValidationMessage('Ingrese la fecha'); return false }
        if (!importe || parseFloat(importe) <= 0) { Swal.showValidationMessage('Ingrese un importe valido'); return false }

        return { patente, fecha, importe, infraccion, lugar, conductor, detalle }
      }
    })

    if (!formValues) return

    try {
      const { error } = await (supabase.from('multas_historico') as any).insert({
        patente: formValues.patente,
        fecha_infraccion: formValues.fecha,
        importe: formValues.importe,
        infraccion: formValues.infraccion || null,
        lugar: formValues.lugar || null,
        conductor_responsable: formValues.conductor || null,
        detalle: formValues.detalle || null,
        observaciones: formValues.detalle || null,
        fecha_anotacion: new Date().toISOString(),
        sede_id: sedeActualId || sedeUsuario?.id
      })

      if (error) throw error

      showSuccess('Multa Registrada')
      cargarDatos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo registrar', 'error')
    }
  }

  // Editar multa
  function editarMulta(multa: Multa) {
    setEditingMulta({ ...multa })
    setOnlyActiveConductors(false)
    setShowEditModal(true)
  }

  async function handleGuardarEdicion() {
    if (!editingMulta) return

    try {
      const auditCtx = {
        userId: user?.id,
        userName: profile?.full_name || user?.email || 'Sistema',
        userEmail: user?.email || undefined,
      }
      const payload = withAudit({
        patente: editingMulta.patente,
        fecha_infraccion: editingMulta.fecha_infraccion,
        importe: editingMulta.importe,
        infraccion: editingMulta.infraccion || null,
        lugar: editingMulta.lugar || null,
        conductor_responsable: editingMulta.conductor_responsable || null,
        detalle: editingMulta.detalle || null,
        observaciones: editingMulta.observaciones || null,
        ibutton: editingMulta.ibutton || null,
        sede_id: editingMulta.sede_id || null
      }, auditCtx)
      const { error } = await (supabase.from('multas_historico') as any)
        .update(payload)
        .eq('id', editingMulta.id)

      if (error) throw error

      await logMultaAudit({
        multaId: editingMulta.id,
        accion: 'update',
        datosNuevos: payload,
        ctx: auditCtx,
      })

      showSuccess('Actualizada')
      setShowEditModal(false)
      setEditingMulta(null)
      cargarDatos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo actualizar', 'error')
    }
  }

  // Eliminar multa
  async function desestimarMulta(multa: Multa) {
    const result = await Swal.fire({
      title: '¿Desestimar esta multa?',
      html: `
        <div style="text-align: left; font-size: 13px; line-height: 1.6;">
          <p style="color: #6b7280; margin: 0 0 10px;">
            La multa quedará oculta del listado principal pero seguirá en la base de datos.
            Podés reactivarla después si fue un error.
          </p>
          <div style="display: grid; grid-template-columns: 110px 1fr; gap: 4px 12px; font-size: 12px; padding: 10px; background: #f9fafb; border-radius: 6px; margin-bottom: 12px;">
            <span style="color: #6b7280;">Patente</span><strong style="font-family: monospace;">${multa.patente || '-'}</strong>
            <span style="color: #6b7280;">Fecha</span><span>${formatFecha(multa.fecha_infraccion)}</span>
            <span style="color: #6b7280;">Infracción</span><span>${multa.infraccion || '-'}</span>
            <span style="color: #6b7280;">Importe</span><strong style="color: #f59e0b;">${formatMoney(multa.importe)}</strong>
          </div>
        </div>
      `,
      input: 'textarea',
      inputLabel: 'Motivo (opcional)',
      inputPlaceholder: 'Ej: multa duplicada, conductor erróneo, ya pagada, etc.',
      icon: undefined,
      iconHtml: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><rect width="20" height="5" x="2" y="3"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      confirmButtonText: 'Desestimar',
      cancelButtonText: 'Cancelar',
    })
    if (!result.isConfirmed) return

    const res = await svcDesestimarMulta(multa.id, {
      userId: user?.id,
      userName: profile?.full_name || user?.email || 'Sistema',
      userEmail: user?.email || undefined,
      motivo: typeof result.value === 'string' ? result.value : undefined,
    })
    if (res.ok) {
      showSuccess('Desestimada', 'Quedó oculta del listado principal')
      setShowModal(false)
      cargarDatos()
    } else {
      showError('No se pudo desestimar', res.error)
    }
  }

  async function reactivarMulta(multa: Multa) {
    const result = await Swal.fire({
      title: '¿Reactivar esta multa?',
      text: `Volverá a aparecer en el listado principal.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#7c3aed',
      confirmButtonText: 'Reactivar',
      cancelButtonText: 'Cancelar',
    })
    if (!result.isConfirmed) return

    const res = await svcReactivarMulta(multa.id, {
      userId: user?.id,
      userName: profile?.full_name || user?.email || 'Sistema',
      userEmail: user?.email || undefined,
    })
    if (res.ok) {
      showSuccess('Reactivada', 'La multa volvió al listado principal')
      cargarDatos()
    } else {
      showError('No se pudo reactivar', res.error)
    }
  }

  async function eliminarMulta(multa: Multa) {
    const result = await Swal.fire({
      title: 'Eliminar multa?',
      text: `${multa.patente} - ${formatMoney(multa.importe)}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff0033',
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    try {
      const auditCtx = {
        userId: user?.id,
        userName: profile?.full_name || user?.email || 'Sistema',
        userEmail: user?.email || undefined,
      }
      const payload = withAudit({
        deleted_at: new Date().toISOString(),
        deleted_reason: 'Eliminada manualmente desde UI',
        deleted_by: auditCtx.userName,
      }, auditCtx)
      const { error } = await (supabase.from('multas_historico') as any)
        .update(payload)
        .eq('id', multa.id)
      if (error) throw error

      await logMultaAudit({
        multaId: multa.id,
        accion: 'eliminar',
        datosNuevos: { deleted_reason: 'Eliminada manualmente desde UI' },
        camposModificados: ['deleted_at', 'deleted_by', 'deleted_reason'],
        ctx: auditCtx,
      })

      showSuccess('Eliminada')
      setShowModal(false)
      cargarDatos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo eliminar', 'error')
    }
  }

  // Crear cobro directo (sin modal). Si falta info auto-detectable cae al modal.
  async function handleCrearCobroDirecto(multa: Multa) {
    if (multasEnviadas.has(multa.id)) {
      Swal.fire({
        icon: 'info',
        title: 'Ya enviada',
        text: 'Esta multa ya fue enviada a facturación.',
        timer: 1800,
        showConfirmButton: false,
      })
      return
    }

    // FIX 2026-05-19: si la multa tiene descuento y vencio respecto al periodo
    // abierto, pedir confirmacion mostrando ambos importes antes de enviar.
    const hoy = getHoyLocal()
    // FIX 2026-06-12: la vigencia del descuento se decide contra HOY (solo fecha),
    // no contra la fecha del periodo de facturacion. Si venc_desc <= hoy el descuento
    // se considera VENCIDO (el dia limite ya no aplica) y el modal solo ofrece el
    // importe total, sin selector.
    const vencDesc = (multa.fecha_vencimiento_descuento || '').slice(0, 10)
    const descNumMulta = parseImporte(multa.importe_descuento)
    const tieneDescuento = descNumMulta > 0 && !!vencDesc
    const descuentoVencio = tieneDescuento && vencDesc <= hoy
    // FIX 2026-05-20: monto a enviar (puede sobreescribirse si el usuario elige otra opcion en el modal)
    let montoOverride: number | undefined = undefined
    // FIX 2026-06-12: un solo modal "Seleccionar monto a cobrar" cuando la multa tiene descuento.
    // Si esta VIGENTE (venc > hoy): ambas opciones seleccionables, descuento preseleccionado.
    // Si esta VENCIDO (venc <= hoy): la opcion de descuento se muestra pero deshabilitada/tachada,
    // y queda preseleccionado el importe total.
    if (tieneDescuento) {
      const totalNum = parseImporte(multa.importe)
      const descNum = parseImporte(multa.importe_descuento)
      const vencFmt = formatFecha(multa.fecha_vencimiento_descuento || null)
      const intro = descuentoVencio
        ? `El descuento de esta multa <strong>venció el ${vencFmt}</strong>. La opción con descuento ya no está disponible:`
        : `La multa tiene un descuento vigente hasta el <strong>${vencFmt}</strong>. Elegí qué importe vas a cobrar:`
      const result = await Swal.fire({
        title: 'Seleccionar monto a cobrar',
        html: `
          <div style="text-align:left; font-size: 13px; line-height: 1.5;">
            <p style="margin: 0 0 12px; color:#6b7280;">${intro}</p>
            <label style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid ${descuentoVencio ? '#e5e7eb' : '#bbf7d0'}; background:${descuentoVencio ? '#f9fafb' : '#f0fdf4'}; border-radius:6px; margin-bottom:6px; cursor:${descuentoVencio ? 'not-allowed' : 'pointer'}; opacity:${descuentoVencio ? 0.6 : 1};">
              <input type="radio" name="opcionMonto" value="descuento" ${descuentoVencio ? 'disabled' : 'checked'}>
              <span style="color:${descuentoVencio ? '#9ca3af' : '#10b981'}; font-weight:500; ${descuentoVencio ? 'text-decoration:line-through;' : ''}">Importe con descuento: <strong>${formatMoney(multa.importe_descuento)}</strong>${descuentoVencio ? ' <span style="text-decoration:none; font-style:italic;">(vencido)</span>' : ''}</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid #e5e7eb; border-radius:6px; cursor:pointer;">
              <input type="radio" name="opcionMonto" value="total" ${descuentoVencio ? 'checked' : ''}>
              <span style="font-weight:500;">Importe total: <strong>${formatMoney(multa.importe)}</strong></span>
            </label>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Enviar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#16a34a',
        focusConfirm: false,
        preConfirm: () => {
          const opcion = (document.querySelector('input[name="opcionMonto"]:checked') as HTMLInputElement)?.value
          if (opcion === 'descuento') return { monto: descNum }
          if (opcion === 'total') return { monto: totalNum }
          Swal.showValidationMessage('Seleccioná una opción')
          return false
        },
      })
      if (!result.isConfirmed || !result.value) return
      montoOverride = (result.value as { monto: number }).monto
    }

    const result = await crearCobroDesdeMulta(multa, {
      userId: user?.id,
      userName: profile?.full_name || 'Sistema',
      sedeId: sedeActualId || sedeUsuario?.id,
      areaResponsable: 'ADMINISTRACION',
      montoOverride,
    })
    if (result.ok) {
      // Actualizar set de enviadas para deshabilitar el botón
      setMultasEnviadas(prev => {
        const next = new Set(prev)
        next.add(multa.id)
        return next
      })
      // Toast estandar del sistema (utils/toast)
      showSuccess('Enviado a facturación', 'La incidencia fue creada y enviada a "Por Aplicar".')
      return
    }
    if ('needsManualInput' in result) {
      Swal.fire({
        icon: 'info',
        title: 'Carga manual requerida',
        text: result.reason
      }).then(() => {
        setMultaParaCobro(multa)
        setShowCobroModal(true)
      })
      return
    }
    Swal.fire('Error', result.error, 'error')
  }

  // Filtros activos
  const activeFilters = [
    ...(fechaCargaDesde || fechaCargaHasta ? [{
      id: 'fecha_carga',
      label: `Fecha Carga: ${fechaCargaDesde || '...'} - ${fechaCargaHasta || '...'}`,
      onClear: () => { setFechaCargaDesde(null); setFechaCargaHasta(null) }
    }] : []),
    ...(fechaInfraccionDesde || fechaInfraccionHasta ? [{
      id: 'fecha_infraccion',
      label: `Fecha Infracción: ${fechaInfraccionDesde || '...'} - ${fechaInfraccionHasta || '...'}`,
      onClear: () => { setFechaInfraccionDesde(null); setFechaInfraccionHasta(null) }
    }] : []),
    ...(patenteFilter.length > 0 ? [{
      id: 'patente',
      label: `Patente: ${patenteFilter.length} seleccionados`,
      onClear: () => setPatenteFilter([])
    }] : []),
    ...(conductorFilter.length > 0 ? [{
      id: 'conductor',
      label: `Conductor: ${conductorFilter.length} seleccionados`,
      onClear: () => setConductorFilter([])
    }] : []),
    ...(lugarFilter.length > 0 ? [{
      id: 'lugar',
      label: `Lugar: ${lugarFilter.length} seleccionados`,
      onClear: () => setLugarFilter([])
    }] : []),
    ...(infraccionFilter.length > 0 ? [{
      id: 'infraccion',
      label: `Infracción: ${infraccionFilter.length} seleccionados`,
      onClear: () => setInfraccionFilter([])
    }] : []),
    ...(detalleFilter.length > 0 ? [{
      id: 'detalle',
      label: `Detalle: ${detalleFilter.length} seleccionados`,
      onClear: () => setDetalleFilter([])
    }] : []),
    ...(ibuttonFilter.length > 0 ? [{
      id: 'ibutton',
      label: `iButton: ${ibuttonFilter.length} seleccionados`,
      onClear: () => setIbuttonFilter([])
    }] : []),
    ...(semanaFilter.length > 0 ? [{
      id: 'semana',
      label: `Semana: ${semanaFilter.join(', ')}`,
      onClear: () => setSemanaFilter([])
    }] : []),
    ...(obsFilter.length > 0 ? [{
      id: 'obs',
      label: `Obs: ${obsFilter.join(', ')}`,
      onClear: () => setObsFilter([])
    }] : []),
    ...(importeFilter.length > 0 ? [{
      id: 'importe',
      label: `Importe: ${importeFilter.length} seleccionados`,
      onClear: () => setImporteFilter([])
    }] : [])
  ]

  function clearAllFilters() {
    setFechaCargaDesde(null)
    setFechaCargaHasta(null)
    setPatenteFilter([])
    setConductorFilter([])
    setLugarFilter([])
    setInfraccionFilter([])
    setDetalleFilter([])
    setSemanaFilter([])
    setIbuttonFilter([])
    setObsFilter([])
    setImporteFilter([])
    setFechaInfraccionDesde(null)
    setFechaInfraccionHasta(null)
  }

  // Columnas
  const columns = useMemo<ColumnDef<Multa>[]>(() => [
    {
      accessorKey: 'created_at',
      size: 95,
      header: () => (
        <ExcelDateRangeFilter
          label="Fec. Carga"
          startDate={fechaCargaDesde}
          endDate={fechaCargaHasta}
          onRangeChange={(start, end) => {
            setFechaCargaDesde(start)
            setFechaCargaHasta(end)
          }}
          filterId="fecha_carga"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const { date, time } = splitDateTime(row.original.created_at)
        return (
          <div style={{ fontSize: '12px', whiteSpace: 'nowrap', lineHeight: '1.2' }}>
            <div>{date}</div>
            {time && <div style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{time}</div>}
          </div>
        )
      }
    },
    {
      id: 'semana',
      size: 45,
      header: () => (
        <ExcelColumnFilter
          label="Semana"
          options={semanasUnicas}
          selectedValues={semanaFilter}
          onSelectionChange={setSemanaFilter}
          filterId="semana"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        if (!row.original.created_at) return '-'
        return getWeekNumber(row.original.created_at) + 1
      }
    },
    {
      accessorKey: 'fecha_infraccion',
      size: 95,
      header: () => (
        <ExcelDateRangeFilter
          label="Fec. Infracción"
          startDate={fechaInfraccionDesde}
          endDate={fechaInfraccionHasta}
          onRangeChange={(start, end) => {
            setFechaInfraccionDesde(start)
            setFechaInfraccionHasta(end)
          }}
          filterId="fecha_infraccion"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const { date, time } = splitDateTime(row.original.fecha_infraccion)
        return (
          <div style={{ fontSize: '12px', whiteSpace: 'nowrap', lineHeight: '1.2' }}>
            <div>{date}</div>
            {time && <div style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{time}</div>}
          </div>
        )
      }
    },
    {
      accessorKey: 'patente',
      size: 75,
      header: () => (
        <ExcelColumnFilter
          label="Patente"
          options={patentesUnicas}
          selectedValues={patenteFilter}
          onSelectionChange={setPatenteFilter}
          filterId="patente"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => (
        <span className="patente-badge">{row.original.patente || '-'}</span>
      )
    },
    {
      accessorKey: 'lugar',
      size: 80,
      header: () => (
        <ExcelColumnFilter
          label="Lugar"
          options={lugaresUnicos}
          selectedValues={lugarFilter}
          onSelectionChange={setLugarFilter}
          filterId="lugar"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const lugar = row.original.lugar || '-'
        const abrev = lugar === 'Provincia de Buenos Aires' ? 'Pcia. BA' : lugar
        return (
          <span title={lugar} style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>{abrev}</span>
        )
      }
    },
    {
      accessorKey: 'infraccion',
      size: 95,
      header: () => (
        <ExcelColumnFilter
          label="Infracción"
          options={infraccionesUnicas}
          selectedValues={infraccionFilter}
          onSelectionChange={setInfraccionFilter}
          filterId="infraccion"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => (
        <span title={row.original.infraccion || '-'} style={{ fontSize: '12px', maxWidth: '95px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {row.original.infraccion || '-'}
        </span>
      )
    },
    {
      accessorKey: 'detalle',
      size: 200,
      header: () => (
        <ExcelColumnFilter
          label="Detalle"
          options={detallesUnicos}
          selectedValues={detalleFilter}
          onSelectionChange={setDetalleFilter}
          filterId="detalle"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      // FIX 2026-05-20: detalle ahora hace word-wrap (varias lineas) en vez de truncarse con ellipsis
      cell: ({ row }) => (
        <span
          title={row.original.detalle || '-'}
          style={{ fontSize: '12px', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.3', display: 'block' }}
        >
          {row.original.detalle || '-'}
        </span>
      )
    },
    // Importe: se oculta en la vista de enviadas (ahí se muestra Monto Mul-Inci).
    ...(vista === 'enviadas' ? [] : ([{
      accessorKey: 'importe',
      size: 90,
      header: () => (
        <ExcelColumnFilter
          label="Importe"
          options={importesUnicos}
          selectedValues={importeFilter}
          onSelectionChange={setImporteFilter}
          filterId="importe"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }: { row: { original: Multa } }) => (
        <span className="font-medium text-orange-500" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
          {row.original.importe}
        </span>
      ),
    }] as ColumnDef<Multa>[])),
    // Columnas exclusivas de la vista "Enviadas a facturación".
    ...(vista === 'enviadas' ? ([
      {
        id: 'monto_mul_inci',
        size: 110,
        header: 'Monto Mul-Inci',
        cell: ({ row }: { row: { original: Multa } }) => {
          const info = multasIncidencia.get(row.original.id)
          if (!info) return <span style={{ color: '#9ca3af' }}>—</span>
          return <span className="font-medium" style={{ whiteSpace: 'nowrap', color: '#7c3aed' }}>{formatMoney(info.monto)}</span>
        },
      },
      {
        id: 'estado_pago',
        size: 100,
        header: 'Estado',
        cell: ({ row }: { row: { original: Multa } }) => {
          const est = multasEstadoPago.get(row.original.id)
          const label = est?.estado === 'pagada' ? 'Pagado' : est?.estado === 'fraccionada' ? 'En proceso' : 'Pendiente'
          const col = label === 'Pagado' ? { bg: '#dcfce7', fg: '#15803d' } : label === 'En proceso' ? { bg: '#fef3c7', fg: '#b45309' } : { bg: '#fee2e2', fg: '#b91c1c' }
          return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: col.bg, color: col.fg, whiteSpace: 'nowrap' }}>{label}</span>
        },
      },
      {
        id: 'duplicado',
        size: 90,
        header: 'Duplicado',
        cell: ({ row }: { row: { original: Multa } }) => {
          const dup = (multasIncidencia.get(row.original.id)?.count || 0) > 1
          return <span style={{ fontSize: 11, fontWeight: 700, color: dup ? '#b91c1c' : '#6b7280' }}>{dup ? 'Sí' : 'No'}</span>
        },
      },
    ] as ColumnDef<Multa>[]) : []),
    // Imp. Desc.: se oculta en la vista de enviadas.
    ...(vista === 'enviadas' ? [] : ([{
      // FIX 2026-05-19: nueva columna Importe con descuento
      accessorKey: 'importe_descuento',
      size: 90,
      header: 'Imp. Desc.',
      cell: ({ row }: { row: { original: Multa } }) => {
        const v = row.original.importe_descuento
        if (!v) return <span style={{ color: '#9ca3af' }}>—</span>
        return (
          <span className="font-medium" style={{ whiteSpace: 'nowrap', color: '#10b981' }}>
            {v}
          </span>
        )
      },
    }] as ColumnDef<Multa>[])),
    {
      // FIX 2026-05-19: nueva columna Vencimiento del descuento
      accessorKey: 'fecha_vencimiento_descuento',
      size: 100,
      header: 'Venc. Desc.',
      cell: ({ row }) => {
        const v = row.original.fecha_vencimiento_descuento
        if (!v) return <span style={{ color: '#9ca3af' }}>—</span>
        // FIX 2026-06-12: truncar la fecha (solo YYYY-MM-DD) sin pasar por new Date(),
        // que la interpretaria en UTC y la correria un dia. Se muestra tal cual la BD.
        const ymd = v.slice(0, 10)
        // El dia exacto del vencimiento ya cuenta como vencido (<=), coherente con el modal de Enviar.
        const vencido = ymd <= getHoyLocal()
        return (
          <span style={{ whiteSpace: 'nowrap', color: vencido ? '#ef4444' : '#374151', fontWeight: vencido ? 600 : 400 }}>
            {ymd}
          </span>
        )
      }
    },
    {
      // FIX 2026-05-20: conductor sin truncar + iButton debajo (columna iButton eliminada)
      accessorKey: 'conductor_responsable',
      size: 200,
      header: () => (
        <ExcelColumnFilter
          label="Conductor"
          options={conductoresUnicos}
          selectedValues={conductorFilter}
          onSelectionChange={setConductorFilter}
          filterId="conductor"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => (
        <div style={{ fontSize: '12px', lineHeight: '1.3' }}>
          <div style={{ whiteSpace: 'normal', wordBreak: 'break-word', fontWeight: row.original.conductor_responsable ? 500 : 400, color: row.original.conductor_responsable ? 'inherit' : '#9ca3af' }}>
            {row.original.conductor_responsable || '—'}
          </div>
          {row.original.ibutton && (
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
              iButton: {row.original.ibutton}
            </div>
          )}
        </div>
      )
    },
    {
      id: 'obs',
      size: 40,
      header: () => (
        <ExcelColumnFilter
          label="Obs"
          options={obsOptions}
          selectedValues={obsFilter}
          onSelectionChange={setObsFilter}
          filterId="obs"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const tieneObs = !row.original.conductor_responsable || !row.original.ibutton
        return (
          <div className="flex justify-center" title={tieneObs ? "Con observaciones" : "Sin observaciones"}>
            {tieneObs ? (
              <AlertCircle className="w-4 h-4 text-amber-500" />
            ) : (
              <CheckCircle className="w-4 h-4 text-emerald-500" />
            )}
          </div>
        )
      }
    },
    {
      id: 'modificado',
      accessorKey: 'updated_at',
      size: 140,
      header: 'Modificado',
      cell: ({ row }) => {
        const u = row.original.updated_at
        const by = row.original.updated_by_name
        if (!u) return <span style={{ color: '#9ca3af' }}>—</span>
        return (
          <div style={{ fontSize: '11px', lineHeight: '1.3' }}>
            <div style={{ color: 'var(--text-primary)' }} title={u}>{formatFecha(u)}</div>
            {by && (
              <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '130px' }} title={by}>
                {by}
              </div>
            )}
          </div>
        )
      }
    },
    {
      id: 'acciones',
      size: 220,
      header: 'Acciones',
      cell: ({ row }) => {
        const yaEnviada = multasEnviadas.has(row.original.id)
        const sinConductor = !row.original.conductor_responsable || row.original.conductor_responsable.trim() === ''
        const deshabilitarEnvio = yaEnviada || sinConductor
        const tooltipEnvio = yaEnviada
          ? 'Ya enviada a facturación'
          : sinConductor
            ? 'Sin conductor identificado — no se puede enviar'
            : 'Enviar a facturación'
        const estaDesestimada = !!row.original.desestimada_at

        // Estilo común para botones icono+label (mismo patrón que Bitacora/Marcaciones)
        const btnBase = (color: string, opacity = 1, disabled = false): React.CSSProperties => ({
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1px',
          background: 'none',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: '2px',
          color,
          opacity,
        })
        const labelStyle: React.CSSProperties = { fontSize: '9px', fontWeight: 600, lineHeight: 1 }

        return (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              title="Ver detalle"
              onClick={() => handleVerDetalle(row.original)}
              style={btnBase('var(--text-secondary)')}
            >
              <Eye size={14} />
              <span style={labelStyle}>Ver</span>
            </button>
            {!estaDesestimada && (
              <>
                <button
                  title="Editar multa"
                  onClick={() => editarMulta(row.original)}
                  style={btnBase('#2563eb')}
                >
                  <Edit2 size={14} />
                  <span style={labelStyle}>Editar</span>
                </button>
                <button
                  title={tooltipEnvio}
                  onClick={() => { if (!deshabilitarEnvio) handleCrearCobroDirecto(row.original) }}
                  disabled={deshabilitarEnvio}
                  style={btnBase(
                    deshabilitarEnvio ? 'var(--text-tertiary)' : '#16a34a',
                    deshabilitarEnvio ? 0.4 : 1,
                    deshabilitarEnvio,
                  )}
                >
                  <SendHorizonal size={14} />
                  <span style={labelStyle}>Enviar</span>
                </button>
                <button
                  title="Desestimar (ocultar sin borrar de la base)"
                  onClick={() => desestimarMulta(row.original)}
                  style={btnBase('#f59e0b')}
                >
                  <Archive size={14} />
                  <span style={labelStyle}>Desestimar</span>
                </button>
              </>
            )}
            {estaDesestimada && canReactivar && (
              <button
                title="Reactivar multa"
                onClick={() => reactivarMulta(row.original)}
                style={btnBase('#7c3aed')}
              >
                <RotateCcw size={14} />
                <span style={labelStyle}>Reactivar</span>
              </button>
            )}
            {canBorrar && (
              <button
                title="Eliminar definitivo"
                onClick={() => eliminarMulta(row.original)}
                style={btnBase('#dc2626')}
              >
                <Trash2 size={14} />
                <span style={labelStyle}>Borrar</span>
              </button>
            )}
          </div>
        )
      }
    }
  ], [patentesUnicas, patenteFilter, conductoresUnicos, conductorFilter, lugaresUnicos, lugarFilter, infraccionesUnicas, infraccionFilter, detallesUnicos, detalleFilter, semanasUnicas, semanaFilter, ibuttonsUnicos, ibuttonFilter, fechaInfraccionDesde, fechaInfraccionHasta, openFilterId, obsFilter, importesUnicos, importeFilter, fechaCargaDesde, fechaCargaHasta, multasEnviadas, canReactivar, canBorrar, vista, multasEstadoPago, multasIncidencia])

  // Exportar a Excel
  function handleExportar() {
    const dataExport = multasFiltradas.map(m => ({
      'Patente': m.patente,
      'Fecha Infraccion': formatFecha(m.fecha_infraccion),
      'Importe': parseImporte(m.importe),
      'Infraccion': m.infraccion,
      'Detalle Infraccion': m.detalle,
      'Lugar': m.lugar,
      'Conductor': m.conductor_responsable,
      'Observaciones': m.observaciones
    }))

    const ws = XLSX.utils.json_to_sheet(dataExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Multas')
    XLSX.writeFile(wb, `multas_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div className="multas-module">
      <LoadingOverlay show={loading} message="Cargando multas..." size="lg" />
      {/* Stats Cards */}
      <div className="multas-stats">
        <div className="multas-stats-grid">
          <div className="stat-card">
            <AlertTriangle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{multasKpi.length}</span>
              <span className="stat-label">Total Multas</span>
            </div>
          </div>
          <div className="stat-card">
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{patentesUnicasCount}</span>
              <span className="stat-label">Vehiculos</span>
            </div>
          </div>
          <div className="stat-card">
            <Users size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{conductoresUnicosCount}</span>
              <span className="stat-label">Conductores</span>
            </div>
          </div>
          <div className="stat-card">
            <DollarSign size={18} className="stat-icon" style={{ color: '#dc2626' }} />
            <div className="stat-content">
              <span className="stat-value">{formatMoney(montosPorPago.pendiente)}</span>
              <span className="stat-label">Monto Total Pendiente</span>
            </div>
            <button
              type="button"
              disabled={!detalleHabilitado}
              onClick={() => detalleHabilitado && setShowPendienteModal(true)}
              title={detalleHabilitado ? 'Ver detalle del cálculo' : 'Filtrá una patente o conductor exacto para ver el detalle'}
              style={{ marginLeft: 'auto', border: '1px solid var(--border-primary, #e5e7eb)', background: 'var(--card-bg, #fff)', borderRadius: 6, padding: '4px 8px', cursor: detalleHabilitado ? 'pointer' : 'not-allowed', opacity: detalleHabilitado ? 1 : 0.4, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#dc2626', fontWeight: 600 }}
            >
              <Eye size={13} /> Detalle
            </button>
          </div>
          <div className="stat-card">
            <DollarSign size={18} className="stat-icon" style={{ color: '#059669' }} />
            <div className="stat-content">
              <span className="stat-value">{formatMoney(montosPorPago.pagado)}</span>
              <span className="stat-label">Monto Total Pagado</span>
            </div>
            <button
              type="button"
              disabled={!detalleHabilitado}
              onClick={() => detalleHabilitado && setShowPagadoModal(true)}
              title={detalleHabilitado ? 'Ver detalle del cálculo' : 'Filtrá una patente o conductor exacto para ver el detalle'}
              style={{ marginLeft: 'auto', border: '1px solid var(--border-primary, #e5e7eb)', background: 'var(--card-bg, #fff)', borderRadius: 6, padding: '4px 8px', cursor: detalleHabilitado ? 'pointer' : 'not-allowed', opacity: detalleHabilitado ? 1 : 0.4, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#059669', fontWeight: 600 }}
            >
              <Eye size={13} /> Detalle
            </button>
          </div>
          <div className="stat-card">
            <DollarSign size={18} className="stat-icon" style={{ color: '#d97706' }} />
            <div className="stat-content">
              <span className="stat-value">{formatMoney(montosPorPago.proceso)}</span>
              <span className="stat-label">Monto Total en Proceso</span>
            </div>
            <button
              type="button"
              disabled={!detalleHabilitado}
              onClick={() => detalleHabilitado && setShowProcesoModal(true)}
              title={detalleHabilitado ? 'Ver detalle del cálculo' : 'Filtrá una patente o conductor exacto para ver el detalle'}
              style={{ marginLeft: 'auto', border: '1px solid var(--border-primary, #e5e7eb)', background: 'var(--card-bg, #fff)', borderRadius: 6, padding: '4px 8px', cursor: detalleHabilitado ? 'pointer' : 'not-allowed', opacity: detalleHabilitado ? 1 : 0.4, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#d97706', fontWeight: 600 }}
            >
              <Eye size={13} /> Detalle
            </button>
          </div>
        </div>
      </div>

      {/* Banner cuando se está mirando desestimadas */}
      {vista === 'desestimadas' && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.08)',
          borderLeft: '3px solid #f59e0b',
          padding: '10px 14px',
          borderRadius: 4,
          fontSize: 12,
          color: 'var(--text-primary)',
          marginBottom: 12,
          lineHeight: 1.5,
        }}>
          <strong>Vista de multas desestimadas.</strong> Estas multas no aparecen en el listado principal ni en los KPIs, pero siguen en la base de datos. Podés reactivarlas si fue un error.
        </div>
      )}

      {/* DataTable */}
      <DataTable
        data={multasFiltradas}
        columns={columns}
        searchPlaceholder="Buscar por patente, conductor, lugar..."
        externalFilters={activeFilters}
        onClearAllFilters={clearAllFilters}
        onFilteredDataChange={setMultasVisibles}
        globalFilter={busqueda}
        onGlobalFilterChange={setBusqueda}
        globalFilterFn={(row, _c, val) => matchBusqueda(row.original as Multa, String(val ?? ''))}
        headerAction={
          <div className="multas-header-actions">
            {/* Toggle vista activas / enviadas / desestimadas */}
            <div className="multas-vista-switch" style={{
              display: 'inline-flex',
              border: '1px solid var(--border-primary)',
              borderRadius: 6,
              overflow: 'hidden',
            }}>
              {vistaOptions.map((option, index) => {
                const isActive = vista === option.id
                return (
                  <button
                    key={option.id}
                    onClick={() => setVista(option.id)}
                    style={{
                      border: 'none',
                      background: isActive ? 'var(--text-primary)' : 'var(--bg-primary)',
                      color: isActive ? '#fff' : 'var(--text-secondary)',
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      borderRight: index < vistaOptions.length - 1 ? '1px solid var(--border-primary)' : 'none',
                      lineHeight: 1.2,
                    }}
                  >
                    {option.label}
                    <span style={{
                      background: isActive ? 'rgba(255,255,255,0.2)' : 'var(--bg-secondary)',
                      color: isActive ? '#fff' : 'var(--text-tertiary)',
                      padding: '1px 6px',
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 600,
                    }}>
                      {option.count}
                    </span>
                  </button>
                )
              })}
            </div>
            <button className="btn-secondary" onClick={handleExportar}>
              <Download size={16}
            />
              Exportar
            </button>
            {vista === 'activas' && (
              <button className="btn-primary" onClick={crearMulta}>
                <Plus size={16} />
                Registrar Multa
              </button>
            )}
          </div>
        }
      />

      {/* Modal Detalle */}
      {showModal && selectedMulta && (() => {
        const driveFileId = selectedMulta.drive_url?.match(/\/file\/d\/([^/]+)/)?.[1] || null
        const hasPdf = !!driveFileId
        const detailsTable = (
          <table className="multas-detail-table">
            <tbody>
              <tr>
                <td className="multas-detail-label">Patente</td>
                <td className="multas-detail-value">
                  <span className="patente-badge">{selectedMulta.patente || '-'}</span>
                </td>
              </tr>
              <tr>
                <td className="multas-detail-label">Fecha Infraccion</td>
                <td className="multas-detail-value">
                  {/* FIX 2026-05-20: mostrar fecha + hora de la infraccion */}
                  {(() => {
                    const { date, time } = splitDateTime(selectedMulta.fecha_infraccion)
                    return (
                      <span>
                        {date}
                        {time && <span style={{ color: 'var(--text-tertiary)', marginLeft: '6px', fontSize: '12px' }}>{time}</span>}
                      </span>
                    )
                  })()}
                </td>
              </tr>
              <tr>
                <td className="multas-detail-label">Importe</td>
                <td className="multas-detail-value" style={{ fontWeight: 700, color: '#ff0033', fontSize: '18px' }}>
                  {formatMoney(selectedMulta.importe)}
                </td>
              </tr>
              <tr>
                <td className="multas-detail-label">Infraccion</td>
                <td className="multas-detail-value">{selectedMulta.infraccion || '-'}</td>
              </tr>
              <tr>
                <td className="multas-detail-label">Lugar</td>
                <td className="multas-detail-value">{selectedMulta.lugar || '-'}</td>
              </tr>
              {selectedMulta.lugar_detalle && (
                <tr>
                  <td className="multas-detail-label">Lugar Detalle</td>
                  <td className="multas-detail-value">{selectedMulta.lugar_detalle}</td>
                </tr>
              )}
              <tr>
                <td className="multas-detail-label">Conductor</td>
                <td className="multas-detail-value">{selectedMulta.conductor_responsable || '-'}</td>
              </tr>
              {selectedMulta.ibutton && (
                <tr>
                  <td className="multas-detail-label">iButton</td>
                  <td className="multas-detail-value" style={{ fontFamily: 'monospace', fontSize: '12px' }}>{selectedMulta.ibutton}</td>
                </tr>
              )}
              {(selectedMulta.observaciones || selectedMulta.detalle) && (
                <tr>
                  <td className="multas-detail-label">Observaciones</td>
                  <td className="multas-detail-value" style={{
                    padding: '12px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '6px',
                    border: '1px solid rgba(239, 68, 68, 0.2)'
                  }}>
                    {selectedMulta.observaciones || selectedMulta.detalle}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )

        // Layout unificado: SIEMPRE vista grande (PDF a la izq + detalles a la der).
        // Cuando no hay PDF en Drive, el panel izquierdo muestra un placeholder.
        const btnBase: React.CSSProperties = {
          height: '40px',
          padding: '0 14px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          fontSize: '13px',
          fontWeight: 600,
          borderRadius: '6px',
          border: '1px solid transparent',
          cursor: 'pointer',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          margin: 0
        }
        const btnPrimary: React.CSSProperties = { ...btnBase, background: '#ef4444', color: '#fff', borderColor: '#ef4444' }
        const btnGreen: React.CSSProperties = { ...btnBase, background: '#10b981', color: '#fff', borderColor: '#10b981' }
        const btnSecondary: React.CSSProperties = { ...btnBase, background: 'transparent', color: 'inherit', borderColor: 'rgba(148,163,184,0.4)' }
        const btnDisabled: React.CSSProperties = { ...btnSecondary, opacity: 0.4, cursor: 'not-allowed' }

        return (
        <div className="multas-modal-overlay" onClick={() => setShowModal(false)}>
          <div
            className="multas-modal-container"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '1300px', width: '90vw', height: '88vh', display: 'flex', flexDirection: 'column' }}
          >
            <div className="multas-modal-header">
              <h2 className="multas-modal-title">
                Detalle de Multa{selectedMulta.patente ? ` — ${selectedMulta.patente}` : ''}
              </h2>
              <button className="multas-modal-close" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div style={{ flex: '1 1 65%', borderRight: '1px solid rgba(148,163,184,0.2)', minWidth: 0, padding: '16px', background: 'rgba(15,23,42,0.4)' }}>
                {hasPdf ? (
                  <iframe
                    src={`https://drive.google.com/file/d/${driveFileId}/preview`}
                    title="PDF de la multa"
                    style={{ width: '100%', height: '100%', border: 'none', display: 'block', borderRadius: '8px', background: '#fff' }}
                    allow="autoplay"
                  />
                ) : (
                  <div style={{
                    width: '100%', height: '100%', borderRadius: '8px',
                    background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(148,163,184,0.4)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: '12px', color: 'rgba(148,163,184,0.9)', padding: '32px', textAlign: 'center',
                  }}>
                    <FileText size={48} style={{ opacity: 0.4 }} />
                    <div style={{ fontSize: '15px', fontWeight: 600 }}>Sin PDF disponible</div>
                    <div style={{ fontSize: '12px', maxWidth: '320px', lineHeight: 1.5, opacity: 0.7 }}>
                      Esta multa no tiene un PDF asociado en Drive. Podés editarla para cargar uno o continuar con los datos disponibles.
                    </div>
                  </div>
                )}
              </div>
              <div style={{ flex: '1 1 35%', minWidth: '340px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                  {detailsTable}
                </div>
                <div style={{
                  padding: '16px 20px',
                  borderTop: '1px solid rgba(148,163,184,0.2)',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px'
                }}>
                  <button
                    onClick={() => hasPdf && window.open(selectedMulta.drive_url!, '_blank', 'noopener,noreferrer')}
                    disabled={!hasPdf}
                    style={hasPdf ? btnGreen : btnDisabled}
                    title={hasPdf ? 'Abrir PDF en Drive' : 'Sin PDF disponible'}
                  >
                    <FileText size={14} />
                    Abrir en Drive
                  </button>
                  <button
                    onClick={() => hasPdf && window.open(`https://drive.google.com/uc?export=download&id=${driveFileId}`, '_blank', 'noopener,noreferrer')}
                    disabled={!hasPdf}
                    style={hasPdf ? btnSecondary : btnDisabled}
                    title={hasPdf ? 'Descargar PDF' : 'Sin PDF disponible'}
                  >
                    <Download size={14} />
                    Descargar
                  </button>
                  <button
                    onClick={() => { setShowModal(false); editarMulta(selectedMulta); }}
                    style={btnPrimary}
                  >
                    <Edit2 size={14} />
                    Editar
                  </button>
                  <button
                    onClick={() => { setShowModal(false); handleCrearCobroDirecto(selectedMulta); }}
                    style={btnGreen}
                  >
                    <Receipt size={14} />
                    Crear Cobro
                  </button>
                  <button
                    onClick={() => setShowModal(false)}
                    style={{ ...btnSecondary, gridColumn: '1 / -1' }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Modal Editar */}
      {showEditModal && editingMulta && (
        <div className="multas-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="multas-modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="multas-modal-header">
              <h2 className="multas-modal-title">Editar Multa</h2>
              <button className="multas-modal-close" onClick={() => setShowEditModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="multas-modal-body">
              <div className="multas-modal-form">
                {/* Patente */}
                <div className="multas-form-group">
                  <label className="multas-form-label">Patente *</label>
                  <select 
                    className="multas-form-select"
                    value={editingMulta.patente}
                    onChange={e => setEditingMulta({...editingMulta, patente: e.target.value})}
                  >
                    <option value="">Seleccione...</option>
                    {vehiculos
                      .sort((a, b) => (a.patente || '').localeCompare(b.patente || ''))
                      .map(v => (
                        <option key={v.id} value={v.patente}>{v.patente}</option>
                    ))}
                  </select>
                </div>
                
                <div className="multas-form-group">
                  <label className="multas-form-label">Sede</label>
                  <select
                    className="multas-form-select"
                    value={editingMulta.sede_id || ''}
                    onChange={e => setEditingMulta({...editingMulta, sede_id: e.target.value || undefined})}
                  >
                    <option value="">Seleccionar...</option>
                    {(sedes || []).map((s: any) => (
                      <option key={s.id} value={s.id}>{s.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Fecha Infraccion */}
                <div className="multas-form-group">
                  <label className="multas-form-label">Fecha Infraccion *</label>
                  <input 
                    type="date" 
                    className="multas-form-input"
                    value={editingMulta.fecha_infraccion ? editingMulta.fecha_infraccion.split('T')[0] : ''}
                    readOnly
                    style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                  />
                </div>

                {/* Importe */}
                <div className="multas-form-group">
                  <label className="multas-form-label">Importe ($) *</label>
                  <input 
                    type="number" 
                    className="multas-form-input"
                    value={parseImporte(editingMulta.importe)}
                    readOnly
                    style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                  />
                </div>

                {/* Infraccion */}
                <div className="multas-form-group">
                  <label className="multas-form-label">Infraccion</label>
                  <input 
                    type="text" 
                    className="multas-form-input"
                    value={editingMulta.infraccion || ''}
                    readOnly
                    style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                  />
                </div>

                {/* Detalle Infraccion */}
                <div className="multas-form-group">
                  <label className="multas-form-label">Detalle Infraccion</label>
                  <input 
                    type="text" 
                    className="multas-form-input"
                    value={editingMulta.detalle || ''}
                    readOnly
                    style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                  />
                </div>

                {/* Lugar */}
                <div className="multas-form-group">
                  <label className="multas-form-label">Lugar</label>
                  <input 
                    type="text" 
                    className="multas-form-input"
                    value={editingMulta.lugar || ''}
                    onChange={e => setEditingMulta({...editingMulta, lugar: e.target.value})}
                  />
                </div>

                {/* Conductor Responsable - Autocomplete */}
                <div className="multas-form-group" style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="multas-form-label" style={{ marginBottom: 0 }}>Conductor Responsable</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#4B5563', fontWeight: 500 }}>Solo Activos</span>
                      <label style={{
                        position: 'relative',
                        display: 'inline-block',
                        width: '36px',
                        height: '20px',
                        cursor: 'pointer'
                      }}>
                        <input 
                          type="checkbox" 
                          checked={onlyActiveConductors}
                          onChange={(e) => setOnlyActiveConductors(e.target.checked)}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: onlyActiveConductors ? '#2563EB' : '#E5E7EB',
                          transition: '.4s',
                          borderRadius: '34px'
                        }}></span>
                        <span style={{
                          position: 'absolute',
                          content: '""',
                          height: '16px',
                          width: '16px',
                          left: '2px',
                          bottom: '2px',
                          backgroundColor: 'white',
                          transition: '.4s',
                          borderRadius: '50%',
                          transform: onlyActiveConductors ? 'translateX(16px)' : 'translateX(0)'
                        }}></span>
                      </label>
                    </div>
                  </div>
                  <input
                    type="text"
                    className="multas-form-input"
                    value={editingMulta.conductor_responsable || ''}
                    onChange={(e) => {
                      setEditingMulta({ ...editingMulta, conductor_responsable: e.target.value })
                      setShowConductorSuggestions(true)
                    }}
                    onFocus={() => setShowConductorSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowConductorSuggestions(false), 200)}
                    placeholder="Buscar conductor..."
                    autoComplete="off"
                  />
                  {showConductorSuggestions && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      background: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0 0 6px 6px',
                      zIndex: 50,
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}>
                      {conductoresOptions
                        .filter(c => {
                          const matchesSearch = c.toLowerCase().includes((editingMulta.conductor_responsable || '').toLowerCase())
                          if (!matchesSearch) return false
                          if (onlyActiveConductors) {
                            return conductoresStatus[c.toLowerCase()] === 'activo'
                          }
                          return true
                        })
                        .map((c, i) => {
                          const status = conductoresStatus[c.toLowerCase()]
                          const isActive = status === 'activo'
                          return (
                            <div
                              key={i}
                              onClick={() => {
                                setEditingMulta({ ...editingMulta, conductor_responsable: c })
                                setShowConductorSuggestions(false)
                              }}
                              style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #f3f4f6',
                                fontSize: '14px',
                                color: '#374151',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                            >
                              <span>{c}</span>
                              {isActive ? (
                                <CheckCircle size={14} style={{ color: '#10B981' }} />
                              ) : (
                                <AlertCircle size={14} style={{ color: '#EF4444' }} />
                              )}
                            </div>
                          )
                        })}
                        {conductoresOptions.filter(c => {
                          const matchesSearch = c.toLowerCase().includes((editingMulta.conductor_responsable || '').toLowerCase())
                          if (!matchesSearch) return false
                          if (onlyActiveConductors) {
                            return conductoresStatus[c.toLowerCase()] === 'activo'
                          }
                          return true
                        }).length === 0 && (
                          <div style={{ padding: '8px 12px', color: '#9ca3af', fontSize: '14px' }}>
                            No se encontraron conductores
                          </div>
                        )}
                    </div>
                  )}
                  {/* Validación de estado del conductor */}
                  {(() => {
                    const conductorName = (editingMulta.conductor_responsable || '').trim().toLowerCase()
                    if (!conductorName) return null
                    
                    const status = conductoresStatus[conductorName]
                    
                    if (status === 'activo') {
                      return (
                        <div style={{
                          marginTop: '8px',
                          padding: '8px 12px',
                          background: '#ECFDF5',
                          border: '1px solid #A7F3D0',
                          borderRadius: '6px',
                          color: '#047857',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: 500
                        }}>
                          <CheckCircle size={16} />
                          Conductor Activo
                        </div>
                      )
                    } else if (conductoresOptions.some(c => c.toLowerCase() === conductorName)) {
                      return (
                        <div style={{
                          marginTop: '8px',
                          padding: '8px 12px',
                          background: '#FEF2F2',
                          border: '1px solid #FECACA',
                          borderRadius: '6px',
                          color: '#e6002e',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: 500
                        }}>
                          <AlertCircle size={16} />
                          {`Conductor NO ACTIVO (Estado: ${status || 'Desconocido'})`}
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>

                {/* iButton */}
                <div className="multas-form-group">
                  <label className="multas-form-label">iButton</label>
                  <input
                    type="text"
                    className="multas-form-input"
                    value={editingMulta.ibutton || ''}
                    onChange={(e) => setEditingMulta({...editingMulta, ibutton: e.target.value})}
                    placeholder="Código iButton..."
                  />
                </div>

                {/* Observaciones */}
                <div className="multas-form-group">
                  <label className="multas-form-label">Observaciones</label>
                  <textarea 
                    className="multas-form-textarea"
                    rows={3}
                    value={editingMulta.observaciones || ''}
                    onChange={e => setEditingMulta({...editingMulta, observaciones: e.target.value})}
                  />
                </div>
              </div>
            </div>
            <div className="multas-modal-footer">
              <button className="multas-btn-secondary" onClick={() => setShowEditModal(false)}>
                Cancelar
              </button>
              <button className="multas-btn-primary" onClick={handleGuardarEdicion}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      <CrearCobroMultaModal
        isOpen={showCobroModal}
        multa={multaParaCobro}
        onClose={() => { setShowCobroModal(false); setMultaParaCobro(null) }}
        onSaved={cargarDatos}
      />

      {showPendienteModal && (
        <div className="multas-modal-overlay" onClick={() => setShowPendienteModal(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--card-bg, #fff)', borderRadius: 12, width: '95%', maxWidth: 1280, maxHeight: '86vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-primary, #e5e7eb)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px', borderBottom: '1px solid var(--border-primary, #eef0f2)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{'Detalle Monto Total Pendiente' + (busqueda.trim() ? ` - ${busqueda.trim()}` : '')}</h3>
                <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)', marginTop: 2 }}>
                  {montosPorPago.pendienteDetalle.length} multas · Total {formatMoney(montosPorPago.pendiente)}. Si la multa fue enviada a incidencia, el monto es el de la incidencia; si no, se usa Importe / Imp. Desc. (resaltado en verde).
                </div>
              </div>
              <button onClick={() => setShowPendienteModal(false)} aria-label="Cerrar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ overflow: 'auto', padding: '8px 20px 20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>
                    <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2' }}>Fec. Infracción</th>
                    <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2' }}>Patente</th>
                    <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2' }}>Detalle de Infracción</th>
                    <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2' }}>Infracción</th>
                    <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2', textAlign: 'right' }}>Importe</th>
                    <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2', textAlign: 'right' }}>Imp. Desc.</th>
                    <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2' }}>Venc. Desc.</th>
                    <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2' }}>Estado facturación</th>
                    <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2' }}>Semana envío</th>
                    <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2', textAlign: 'right' }}>Monto Incidencia</th>
                  </tr>
                </thead>
                <tbody>
                  {montosPorPago.pendienteDetalle.map(({ multa, columna, monto, enviado }) => {
                    const usoImporte = columna === 'IMPORTE'
                    // El resaltado verde de Importe / Imp. Desc. solo aplica cuando NO se
                    // envió a incidencia (ahí el monto sale de la incidencia).
                    const hl = !enviado ? { background: '#dcfce7', color: '#15803d', fontWeight: 700 } : {}
                    const inci = multasIncidencia.get(multa.id)
                    const semanaEnvio = enviado && inci?.fechaEnvio
                      ? `S${getWeekNumber(inci.fechaEnvio) + 1}/${new Date(inci.fechaEnvio).getFullYear()}`
                      : 'N/A'
                    return (
                      <tr key={multa.id}>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f6f7f8' }}>{multa.fecha_infraccion ? new Date(multa.fecha_infraccion).toLocaleDateString('es-AR') : '-'}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f6f7f8', fontWeight: 600 }}>{multa.patente || '-'}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f6f7f8' }}>
                          <span className="multa-detalle">
                            <span className="multa-detalle-txt">{multa.detalle || '-'}</span>
                            {multa.detalle && <span className="multa-detalle-tip">{multa.detalle}</span>}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f6f7f8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={multa.infraccion || ''}>{multa.infraccion || '-'}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f6f7f8', textAlign: 'right', ...(!enviado && usoImporte ? hl : {}) }}>{multa.importe || '-'}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f6f7f8', textAlign: 'right', ...(!enviado && !usoImporte ? hl : {}) }}>{multa.importe_descuento || '-'}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f6f7f8' }}>{multa.fecha_vencimiento_descuento ? String(multa.fecha_vencimiento_descuento).slice(0, 10) : '-'}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f6f7f8' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: enviado ? '#dbeafe' : '#f3f4f6', color: enviado ? '#1d4ed8' : '#6b7280', whiteSpace: 'nowrap' }}>{enviado ? 'Enviado' : 'No enviado'}</span>
                        </td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f6f7f8' }}>{semanaEnvio}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f6f7f8', textAlign: 'right', fontWeight: 700 }}>
                          {formatMoney(monto)}
                          <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999, background: enviado ? '#ede9fe' : '#dcfce7', color: enviado ? '#6d28d9' : '#15803d' }}>{enviado ? 'Incidencia' : (usoImporte ? 'Importe' : 'Imp. Desc.')}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {(showPagadoModal || showProcesoModal) && (() => {
        const esPagado = showPagadoModal
        const detalle = esPagado ? montosPorPago.pagadoDetalle : montosPorPago.procesoDetalle
        const total = esPagado ? montosPorPago.pagado : montosPorPago.proceso
        const filtroTxt = busqueda.trim()
        const titulo = (esPagado ? 'Detalle Monto Total Pagado' : 'Detalle Monto Total en Proceso') + (filtroTxt ? ` - ${filtroTxt}` : '')
        const nota = esPagado
          ? 'Incluye multas cobradas de contado y fraccionadas con todas sus cuotas ya cobradas.'
          : 'Monto = penalidad fraccionada (cobro en cuotas), aún con cuotas pendientes.'
        const acento = esPagado ? '#059669' : '#d97706'
        const cerrar = () => { setShowPagadoModal(false); setShowProcesoModal(false) }
        return (
          <div className="multas-modal-overlay" onClick={cerrar}>
            <div
              onClick={e => e.stopPropagation()}
              style={{ background: 'var(--card-bg, #fff)', borderRadius: 12, width: '95%', maxWidth: esPagado ? 1040 : 1340, maxHeight: '86vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-primary, #e5e7eb)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px', borderBottom: '1px solid var(--border-primary, #eef0f2)' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{titulo}</h3>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)', marginTop: 2 }}>
                    {detalle.length} multas · Total {formatMoney(total)}. {nota}
                  </div>
                </div>
                <button onClick={cerrar} aria-label="Cerrar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', padding: 4 }}><X size={18} /></button>
              </div>
              <div style={{ overflow: 'auto', padding: '8px 20px 20px' }}>
                {detalle.length === 0 ? (
                  <div style={{ padding: '24px 10px', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                    No hay multas en este estado con los filtros actuales.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>
                        <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2' }}>Fec. Infracción</th>
                        <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2' }}>Patente</th>
                        <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2' }}>Detalle de Infracción</th>
                        <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2' }}>Infracción</th>
                        {esPagado ? (
                          <>
                            <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2', textAlign: 'right' }}>Pagado</th>
                            <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2' }}>Semana de Pago</th>
                          </>
                        ) : (
                          <>
                            <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2' }}>Semana</th>
                            <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2' }}>Cant. Cuotas</th>
                            <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2', textAlign: 'right' }}>Monto Pagado</th>
                            <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2', textAlign: 'right' }}>Monto Pendiente</th>
                            <th style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f2', textAlign: 'right' }}>Total</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.map(({ multa, monto, fraccionada, semanasPago }) => {
                        const esFracc = Boolean(fraccionada)
                        const cuotas = esFracc ? (multasCuotas.get(multa.id) || []) : []
                        const cobradas = cuotas.filter(c => c.aplicado)
                        const montoCobrado = cobradas.reduce((s, c) => s + c.monto, 0)
                        const montoPendiente = cuotas.filter(c => !c.aplicado).reduce((s, c) => s + c.monto, 0)
                        // Sub-filas de cuotas: solo en el modal de Pagado.
                        const showSub = esPagado && cuotas.length > 0
                        const bb = showSub ? 'none' : '1px solid #f6f7f8'
                        // Proceso: semanas de las cuotas ya cobradas.
                        const semanasCobradas = cobradas.map(c => `S${c.semana}/${c.anio}`)
                        return (
                          <Fragment key={multa.id}>
                            <tr>
                              <td style={{ padding: '8px 10px', borderBottom: bb }}>{multa.fecha_infraccion ? new Date(multa.fecha_infraccion).toLocaleDateString('es-AR') : '-'}</td>
                              <td style={{ padding: '8px 10px', borderBottom: bb, fontWeight: 600 }}>{multa.patente || '-'}</td>
                              <td style={{ padding: '8px 10px', borderBottom: bb }}>
                                <span className="multa-detalle">
                                  <span className="multa-detalle-txt">{multa.detalle || '-'}</span>
                                  {multa.detalle && <span className="multa-detalle-tip">{multa.detalle}</span>}
                                </span>
                              </td>
                              <td style={{ padding: '8px 10px', borderBottom: bb, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }} title={multa.infraccion || ''}>{multa.infraccion || '-'}</td>
                              {esPagado ? (
                                <>
                                  <td style={{ padding: '8px 10px', borderBottom: bb, textAlign: 'right', fontWeight: 700, color: acento }}>
                                    {formatMoney(monto)}
                                    {esFracc && (
                                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: '#e0e7ff', color: '#4338ca' }}>Fraccionada</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '8px 10px', borderBottom: bb, whiteSpace: 'normal' }}>{semanasPago && semanasPago.length ? semanasPago.join(', ') : '-'}</td>
                                </>
                              ) : (
                                <>
                                  <td style={{ padding: '8px 10px', borderBottom: bb, whiteSpace: 'normal' }}>{semanasCobradas.length ? semanasCobradas.join(', ') : '-'}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: bb }}>{cuotas.length ? `${cobradas.length}/${cuotas.length}` : '-'}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: bb, textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{formatMoney(montoCobrado)}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: bb, textAlign: 'right', fontWeight: 700, color: '#b45309' }}>{formatMoney(Math.max(0, monto - montoCobrado))}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: bb, textAlign: 'right', fontWeight: 700, color: acento }}>{formatMoney(monto)}</td>
                                </>
                              )}
                            </tr>
                            {showSub && (
                              <tr>
                                <td colSpan={6} style={{ padding: '0 10px 10px', borderBottom: '1px solid #f6f7f8' }}>
                                  <div style={{ background: 'var(--bg-secondary, #fafafa)', border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 12px' }}>
                                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
                                      {cobradas.length} de {cuotas.length} cuotas cobradas · Cobrado {formatMoney(montoCobrado)} · Pendiente {formatMoney(montoPendiente)}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      {cuotas.map(c => (
                                        <div key={c.numero} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                                          <span style={{ fontWeight: 600, minWidth: 96 }}>Cuota {c.numero} de {cuotas.length}</span>
                                          <span style={{ color: '#6b7280', minWidth: 78 }}>S{c.semana}/{c.anio}</span>
                                          <span style={{ minWidth: 110, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(c.monto)}</span>
                                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 999, background: c.aplicado ? '#dcfce7' : '#fef3c7', color: c.aplicado ? '#15803d' : '#b45309' }}>{c.aplicado ? 'Pagada' : 'Pendiente'}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                            {esPagado && esFracc && cuotas.length === 0 && (
                              <tr>
                                <td colSpan={6} style={{ padding: '0 10px 8px', fontSize: 11, color: '#9ca3af', borderBottom: '1px solid #f6f7f8' }}>Sin cuotas registradas para esta penalidad.</td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
