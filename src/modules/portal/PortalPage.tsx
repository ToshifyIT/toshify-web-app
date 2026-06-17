// src/modules/portal/PortalPage.tsx
// Portal público para conductores - Mi Espacio
import { useState, useEffect, useCallback, useMemo } from 'react'
import { jsPDF } from 'jspdf'
import { format, parseISO, getISOWeek, startOfISOWeek, endOfISOWeek } from 'date-fns'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../types/facturacion.types'
import { normalizeDni, normalizeCuit } from '../../utils/normalizeDocuments'
import logoToshifyUrl from '../../assets/logo-toshify.png'
import './PortalPage.css'

// =====================================================
// TYPES
// =====================================================

interface PortalConductor {
  id: string
  nombres: string
  apellidos: string
  numero_dni: string | null
  numero_cuit: string | null
}

// Multa del conductor (seccion nueva)
interface PortalMulta {
  id: string
  infraccion: string | null   // OJO: en BD esto es el N° de acta/expediente (ej "Q37295361")
  patente: string | null
  fecha_infraccion: string | null
  importe: string | null
  lugar: string | null         // jurisdiccion (ej "CABA")
  lugar_detalle: string | null // "Lugar: <direccion> | Estado: <estado>"
  detalle: string | null       // descripcion real de la infraccion
  drive_url: string | null
}

// Km de una semana (seccion nueva). limite/excedido segun modalidad por contrato.
interface PortalKmSemana {
  semana: number
  anio: number
  fecha_inicio: string
  fecha_fin: string
  km: number
  limite: number
  excedido: number
  modalidad: string // 'turno' | 'a_cargo'
}

interface PortalPeriodo {
  semana: number
  anio: number
  fecha_inicio: string
  fecha_fin: string
}

interface PortalFacturacion {
  id: string
  periodo_id: string
  conductor_id: string
  conductor_nombre: string
  conductor_dni: string
  conductor_cuit: string | null
  vehiculo_patente: string | null
  tipo_alquiler: string
  turnos_base: number
  turnos_cobrados: number
  subtotal_cargos: number
  subtotal_descuentos: number
  saldo_anterior: number
  total_a_pagar: number
  estado: string
  periodos_facturacion: PortalPeriodo
  grupo_flota?: string | null
}

interface PortalDetalle {
  id: string
  facturacion_id: string
  concepto_codigo: string
  concepto_descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  total: number
  es_descuento: boolean
  referencia_id?: string | null
  referencia_tipo?: string | null
}

interface PortalSaldo {
  saldo_actual: number
  dias_mora: number
  monto_mora_acumulada: number
}

interface PortalFraccionamiento {
  id: string
  monto_total: number
  monto_cuota: number
  numero_cuota: number
  total_cuotas: number
  descripcion: string
  aplicado: boolean
  semana: number
  anio: number
}

type View = 'login' | 'dashboard' | 'detail'

// Mapeo de códigos de concepto a descripciones legibles
const CONCEPTO_LABELS: Record<string, string> = {
  P001: 'Alquiler Turno Diurno',
  P002: 'Alquiler a Cargo',
  P003: 'Cuota de Garantía',
  P004: 'Descuento a Favor',
  P005: 'Peajes',
  P006: 'Exceso de KM',
  P007: 'Penalidades',
  P008: 'Multas de Tránsito',
  P009: 'Mora',
  P010: 'Repuestos/Daños',
  P011: 'Publicidad Cabify',
  P012: 'Publicidad Tablet',
  P013: 'Alquiler Turno Nocturno',
  P014: 'Alquiler Turno Diurno Sin GNC',
  P015: 'Alquiler Turno Nocturno Sin GNC',
  P016: 'Alquiler a Cargo Sin GNC',
}

/** Siempre mostrar el label del concepto para códigos conocidos.
 *  Si la descripción aporta info adicional (cuota, plan de pagos), se agrega. */
function getConceptoLabel(item: PortalDetalle): string {
  const desc = item.concepto_descripcion?.trim()
  const baseLabel = CONCEPTO_LABELS[item.concepto_codigo]

  // Si no tenemos label para este código, usar la descripción tal cual
  if (!baseLabel) return desc || item.concepto_codigo

  // P003 = Cuota de Garantía: mostrar solo el label base
  if (item.concepto_codigo === 'P003') {
    return baseLabel
  }

  // P010 = Plan de Pagos: agregar descripción si es informativa (ej: "valor de multas 678.733,50")
  if (item.concepto_codigo === 'P010' && desc && !/^\d+([,.]\d+)?$/.test(desc)) {
    return `${baseLabel} - ${desc}`
  }

  // P004 = Tickets: mostrar detalle descriptivo, eliminando prefijo redundante "Ticket:"
  if (item.concepto_codigo === 'P004') {
    if (desc) {
      // Quitar prefijo "Ticket:" o "Ticket: " para no repetir
      const cleanDesc = desc.replace(/^Ticket:\s*/i, '').trim()
      if (cleanDesc && cleanDesc !== baseLabel) return `${baseLabel} (${cleanDesc})`
    }
    return baseLabel
  }

  // Para códigos con descripción informativa (fechas, detalles), agregar entre paréntesis
  // Ej: P005 "29/01/2026 al 01/02/2026" → "Peajes (29/01/2026 al 01/02/2026)"
  if (desc && desc !== baseLabel && !/^\d+([,.]\d+)?$/.test(desc)) {
    return `${baseLabel} (${desc})`
  }

  return baseLabel
}

/** Convierte un link de Google Drive ("/file/d/<ID>/view" o "open?id=<ID>")
 *  en su URL de descarga directa (uc?export=download&id=<ID>), que dispara
 *  la descarga del navegador en vez de abrir el visor de Drive.
 *  Si no se reconoce el patrón, devuelve la URL original. */
function driveDownloadUrl(url: string | null): string {
  if (!url) return ''
  const m = url.match(/\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/)
  const id = m ? m[1] : null
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : url
}

/** Versión /preview embebible (iframe) del link de Drive, para mostrar el
 *  documento del acta dentro del modal (mismo patrón que MultasModule). */
function drivePreviewUrl(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/)
  return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null
}

// =====================================================
// ICONOS BOTTOM NAV (SVG line, heredan color via currentColor)
// =====================================================
const SVG = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

// Resumen: gráfico de barras (resume facturación + gráficos)
const ICON_RESUMEN = (
  <svg {...SVG}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
)
// Historial: recibo / documento con líneas
const ICON_HISTORIAL = (
  <svg {...SVG}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></svg>
)
// Multas: triángulo de alerta con signo
const ICON_MULTAS = (
  <svg {...SVG}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
)
// KM: velocímetro / gauge
const ICON_KM = (
  <svg {...SVG}><path d="M12 21a9 9 0 1 0-9-9" /><path d="M3 12a9 9 0 0 1 9-9" opacity="0" /><circle cx="12" cy="12" r="9" /><path d="M12 12l4-3" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>
)

// Secciones del dashboard. Las tabs de desktop y la bottom-nav de mobile
// comparten este set y el mismo estado activo (activeSection).
type SectionKey = 'resumen' | 'historial' | 'multas' | 'km'

const NAV_ITEMS: { key: SectionKey; label: string; short: string; ico: React.ReactNode }[] = [
  { key: 'resumen', label: 'Resumen', short: 'Resumen', ico: ICON_RESUMEN },
  { key: 'historial', label: 'Historial', short: 'Historial', ico: ICON_HISTORIAL },
  { key: 'multas', label: 'Multas', short: 'Multas', ico: ICON_MULTAS },
  { key: 'km', label: 'Km recorridos', short: 'KM', ico: ICON_KM },
]

// =====================================================
// LOGO PRELOAD (para PDF)
// =====================================================

let logoBase64: string | null = null
let logoAspectRatio = 3
const _logoImg = new Image()
_logoImg.src = logoToshifyUrl
_logoImg.onload = () => {
  const c = document.createElement('canvas')
  c.width = _logoImg.naturalWidth
  c.height = _logoImg.naturalHeight
  logoAspectRatio = c.width / c.height
  const ctx = c.getContext('2d')!
  ctx.drawImage(_logoImg, 0, 0)
  logoBase64 = c.toDataURL('image/png')
}

// =====================================================
// COMPONENT
// =====================================================

export function PortalPage() {
  // State
  const [view, setView] = useState<View>('login')
  const [conductor, setConductor] = useState<PortalConductor | null>(null)
  const [facturas, setFacturas] = useState<PortalFacturacion[]>([])
  const [pagadoPorSemana, setPagadoPorSemana] = useState<Record<string, number>>({})
  const [selectedFactura, setSelectedFactura] = useState<PortalFacturacion | null>(null)
  const [detalleItems, setDetalleItems] = useState<PortalDetalle[]>([])
  const [detallePagos, setDetallePagos] = useState<Array<{ id: string; tipo: string; monto: number; referencia: string | null; fecha: string }>>([])
  const [saldo, setSaldo] = useState<PortalSaldo | null>(null)
  const [fraccionamientos, setFraccionamientos] = useState<PortalFraccionamiento[]>([])
  // El bloque UI que muestra `fraccionamientos` está oculto (comentado), pero
  // mantenemos el state + query para reactivarlo rápido si se decide volver.
  void fraccionamientos
  const [cabifyPorSemana, setCabifyPorSemana] = useState<Record<string, number>>({})

  // Secciones nuevas: Multas y Km recorridos
  const [multas, setMultas] = useState<PortalMulta[]>([])
  const [kmSemanas, setKmSemanas] = useState<PortalKmSemana[]>([])

  // Modales (detalle de semana + detalle de multa). Se renderizan como overlay
  // sobre el dashboard (antes el detalle reemplazaba toda la vista con setView).
  const [showDetalleModal, setShowDetalleModal] = useState(false)
  const [selectedMulta, setSelectedMulta] = useState<PortalMulta | null>(null)

  // Navegacion por secciones en TODAS las vistas: tabs arriba en desktop,
  // bottom-nav en mobile. El CSS muestra solo la seccion activa.
  const [activeSection, setActiveSection] = useState<SectionKey>('resumen')

  // UI state
  const [loginInput, setLoginInput] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loadingFacturas, setLoadingFacturas] = useState(false)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [detalleError, setDetalleError] = useState('')
  const [exportingPdf, setExportingPdf] = useState(false)

  // Cerrar modales con tecla ESC. Guard interno: el hook se ejecuta siempre
  // (cumple reglas de hooks), pero solo engancha el listener si hay modal abierto.
  useEffect(() => {
    if (!showDetalleModal && !selectedMulta) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDetalleModal(false)
        setSelectedMulta(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showDetalleModal, selectedMulta])

  // =====================================================
  // LOGIN
  // =====================================================

  // Rate limiting: máximo 5 intentos por minuto
  const [loginAttempts, setLoginAttempts] = useState<number[]>([])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    const input = loginInput.trim()
    if (!input) return

    // Validar que solo tenga números, puntos, guiones o espacios
    if (!/^[\d.\-\s]+$/.test(input)) {
      setLoginError('Ingresá solo números (DNI o CUIT)')
      return
    }

    // Rate limiting
    const ahora = Date.now()
    const intentosRecientes = loginAttempts.filter(t => ahora - t < 60000)
    if (intentosRecientes.length >= 5) {
      setLoginError('Demasiados intentos. Esperá un minuto.')
      return
    }
    setLoginAttempts([...intentosRecientes, ahora])

    setLoginLoading(true)
    setLoginError('')

    try {
      // Normalizar: quitar guiones, puntos y espacios
      const normalizedDni = normalizeDni(input)
      const normalizedCuit = normalizeCuit(input)

      // Buscar primero por DNI exacto, luego por CUIT
      let data: any[] | null = null
      let error: any = null

      // Intentar por DNI normalizado
      const resDni = await supabase
        .from('conductores')
        .select('id, nombres, apellidos, numero_dni, numero_cuit')
        .eq('numero_dni', normalizedDni)
        .limit(1)

      if (resDni.data && resDni.data.length > 0) {
        data = resDni.data
        error = resDni.error
      } else {
        // Intentar por CUIT normalizado
        const resCuit = await supabase
          .from('conductores')
          .select('id, nombres, apellidos, numero_dni, numero_cuit')
          .eq('numero_cuit', normalizedCuit)
          .limit(1)
        data = resCuit.data
        error = resCuit.error
      }

      if (error) throw error

      if (!data || data.length === 0) {
        setLoginError('No se encontró un conductor con ese DNI o CUIT')
        return
      }

      setConductor(data[0] as PortalConductor)
      setView('dashboard')
    } catch {
      setLoginError('Error de conexión. Intentá de nuevo.')
    } finally {
      setLoginLoading(false)
    }
  }

  // =====================================================
  // LOAD FACTURAS
  // =====================================================

  const loadFacturas = useCallback(async (conductorId: string) => {
    setLoadingFacturas(true)
    try {
      const { data, error } = await supabase
        .from('facturacion_conductores')
        .select(`
          id, periodo_id, conductor_id, conductor_nombre, conductor_dni, conductor_cuit,
          vehiculo_patente, tipo_alquiler, turnos_base, turnos_cobrados,
          subtotal_cargos, subtotal_descuentos, saldo_anterior, total_a_pagar, estado,
          periodos_facturacion!inner(semana, anio, fecha_inicio, fecha_fin)
        `)
        .eq('conductor_id', conductorId)
        .order('created_at', { ascending: false })

      if (error) throw error
      // Mostrar solo desde S11/2026 en adelante (decisión del cliente — los
      // periodos anteriores tenían pagos duplicados/datos sucios y no son
      // representativos en el portal)
      const PORTAL_ANIO_MIN = 2026
      const PORTAL_SEMANA_MIN = 11
      const facturasData = ((data || []) as unknown as PortalFacturacion[]).filter(f => {
        const a = f.periodos_facturacion?.anio
        const s = f.periodos_facturacion?.semana
        if (!a || !s) return false
        return a > PORTAL_ANIO_MIN || (a === PORTAL_ANIO_MIN && s >= PORTAL_SEMANA_MIN)
      })

      // Backfill missing vehiculo_patente from assignment history
      const missingPatente = facturasData.filter(f => !f.vehiculo_patente)
      if (missingPatente.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: asignaciones } = await (supabase
          .from('asignaciones_conductores') as any)
          .select(`
            fecha_inicio, fecha_fin, estado, created_at,
            asignaciones!inner(fecha_inicio, fecha_fin, estado, vehiculos(patente))
          `)
          .eq('conductor_id', conductorId)
          .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado', 'cancelado', 'cancelada'])
          .order('created_at', { ascending: false })

        if (asignaciones && asignaciones.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const validAsignaciones = (asignaciones as any[]).filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (ac: any) => ac.asignaciones?.vehiculos?.patente && ac.asignaciones.estado !== 'programado'
          )

          for (const factura of missingPatente) {
            const p = factura.periodos_facturacion
            const semInicio = new Date(p.fecha_inicio + 'T00:00:00')
            const semFin = new Date(p.fecha_fin + 'T23:59:59')

            // Try date overlap match first
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const match = validAsignaciones.find((ac: any) => {
              const asig = ac.asignaciones
              const acInicio = ac.fecha_inicio ? new Date(ac.fecha_inicio) : new Date(asig.fecha_inicio)
              const acFin = ac.fecha_fin ? new Date(ac.fecha_fin) : (asig.fecha_fin ? new Date(asig.fecha_fin) : new Date())
              return acFin >= semInicio && acInicio <= semFin
            })

            if (match) {
              factura.vehiculo_patente = match.asignaciones.vehiculos.patente
            } else if (validAsignaciones.length > 0) {
              // Fallback: use the most recent assignment's vehicle
              factura.vehiculo_patente = validAsignaciones[0].asignaciones.vehiculos.patente
            }
          }
        }
      }

      // Cruzar patentes con tabla vehiculos para traer grupo_flota
      const patentesParaGrupo = [...new Set(facturasData.map(f => f.vehiculo_patente).filter(Boolean))] as string[]
      if (patentesParaGrupo.length > 0) {
        const { data: vehData } = await supabase
          .from('vehiculos')
          .select('patente, grupo_flota')
          .in('patente', patentesParaGrupo)
        if (vehData) {
          const grupoMap = new Map<string, string | null>()
          vehData.forEach((v: { patente: string; grupo_flota: string | null }) => {
            grupoMap.set(v.patente, v.grupo_flota || null)
          })
          facturasData.forEach(f => {
            if (f.vehiculo_patente && grupoMap.has(f.vehiculo_patente)) {
              f.grupo_flota = grupoMap.get(f.vehiculo_patente) || null
            }
          })
        }
      }

      setFacturas(facturasData)

      // Cargar total pagado por semana/año desde control_saldos
      const { data: pagosData } = await supabase
        .from('control_saldos')
        .select('semana, anio, monto_movimiento')
        .eq('conductor_id', conductorId)
        .in('tipo_movimiento', ['pago_cabify', 'pago_manual', 'pago', 'pago_cuota'])
      const map: Record<string, number> = {}
      ;(pagosData || []).forEach((p: { semana: number; anio: number; monto_movimiento: number }) => {
        const key = `${p.semana}-${p.anio}`
        map[key] = (map[key] || 0) + Number(p.monto_movimiento || 0)
      })
      setPagadoPorSemana(map)
    } catch {
      setFacturas([])
      setPagadoPorSemana({})
    } finally {
      setLoadingFacturas(false)
    }
  }, [])

  // ===== Carga de KM recorridos por semana (desde junio 2026) =====
  // Suma kilometraje de uss_historico por semana ISO, resuelve modalidad/limite por contrato
  // y calcula el excedido. El conductor en uss_historico es texto; matcheamos por nombre.
  const loadKmRecorridos = useCallback(async (cond: PortalConductor) => {
    try {
      // Corte fijo: km recorridos se muestran desde junio 2026 (el 1/6 es lunes,
      // arranque exacto de la semana ISO 23). Se listan todas las semanas desde ahi.
      const DESDE = '2026-06-01'
      const nombreCompleto = `${cond.nombres} ${cond.apellidos}`.trim()
      const primerApe = cond.apellidos.split(' ')[0]

      // 1) Viajes del conductor en la ventana (km + patente + fecha)
      const { data: viajes } = await supabase
        .from('uss_historico')
        .select('kilometraje, patente, fecha_hora_inicio_gmt3, conductor')
        .ilike('conductor', `%${primerApe}%`)
        .gte('fecha_hora_inicio_gmt3', DESDE)
        .limit(8000)

      const normName = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
      const target = normName(nombreCompleto)
      const tokens = target.split(' ').filter(t => t.length >= 3)

      // 2) Limites por modalidad (params configurables, mismos defaults que Control Exceso KM)
      let limiteTurno = 1800
      let limiteACargo = 3600
      const { data: limiteParams } = await (supabase.from('parametros_sistema' as any) as any)
        .select('clave, valor')
        .in('clave', ['limite_km_semanal_turno', 'limite_km_semanal_a_cargo'])
      for (const p of (limiteParams || []) as any[]) {
        const v = Number(p.valor)
        if (!isNaN(v)) {
          if (p.clave === 'limite_km_semanal_turno') limiteTurno = v
          if (p.clave === 'limite_km_semanal_a_cargo') limiteACargo = v
        }
      }

      // 3) Modalidad del conductor (turno / a_cargo) via asignaciones vigentes
      let modalidad: string = 'turno'
      const { data: asigs } = await (supabase
        .from('asignaciones_conductores')
        .select('asignacion:asignaciones(modalidad, estado)')
        .eq('conductor_id', cond.id) as any)
      for (const a of (asigs || []) as any[]) {
        const m = a.asignacion?.modalidad
        const est = a.asignacion?.estado
        if (m && ['activa', 'activo', 'programado'].includes(est || '')) { modalidad = m; break }
        if (m) modalidad = m
      }
      const limite = modalidad === 'a_cargo' ? limiteACargo : limiteTurno

      // 4) Agrupar km por semana ISO (filtrando los viajes que realmente son del conductor)
      const porSemana = new Map<string, { km: number; semana: number; anio: number; ini: Date; fin: Date }>()
      for (const v of (viajes || []) as any[]) {
        const condNorm = normName(v.conductor || '')
        const matchea = condNorm === target || (tokens.length > 0 && tokens.every(t => condNorm.includes(t)))
        if (!matchea) continue
        const km = Number(v.kilometraje) || 0
        if (km <= 0) continue
        const dt = new Date(v.fecha_hora_inicio_gmt3)
        const semana = getISOWeek(dt)
        const anio = dt.getFullYear()
        const key = `${anio}-${semana}`
        const cur = porSemana.get(key) || { km: 0, semana, anio, ini: startOfISOWeek(dt), fin: endOfISOWeek(dt) }
        cur.km += km
        porSemana.set(key, cur)
      }

      const lista: PortalKmSemana[] = [...porSemana.values()]
        .map(s => ({
          semana: s.semana, anio: s.anio,
          fecha_inicio: format(s.ini, 'yyyy-MM-dd'),
          fecha_fin: format(s.fin, 'yyyy-MM-dd'),
          km: Math.round(s.km), limite,
          excedido: Math.max(0, Math.round(s.km) - limite),
          modalidad,
        }))
        .sort((a, b) => (b.anio - a.anio) || (b.semana - a.semana))

      setKmSemanas(lista)
    } catch {
      setKmSemanas([])
    }
  }, [])

  useEffect(() => {
    if (conductor && view === 'dashboard') {
      loadFacturas(conductor.id)

      // Cargar saldo
      supabase
        .from('saldos_conductores')
        .select('saldo_actual, dias_mora, monto_mora_acumulada')
        .eq('conductor_id', conductor.id)
        .limit(1)
        .then(({ data }) => {
          if (data && data.length > 0) setSaldo(data[0] as PortalSaldo)
        })

      // Cargar fraccionamientos pendientes
      supabase
        .from('cobros_fraccionados')
        .select('id, monto_total, monto_cuota, numero_cuota, total_cuotas, descripcion, aplicado, semana, anio')
        .eq('conductor_id', conductor.id)
        .eq('aplicado', false)
        .order('anio', { ascending: true })
        .order('semana', { ascending: true })
        .then(({ data }) => {
          setFraccionamientos((data || []) as PortalFraccionamiento[])
        })

      // Cargar ganancias Cabify - buscar por DNI o por primer nombre+apellido
      // Cabify guarda solo primer nombre/apellido (ej: "gerardo", "millan")
      // Conductor puede tener nombre compuesto (ej: "GERARDO RAMON", "MILLAN URBANO")
      const primerNombre = conductor.nombres.split(' ')[0]
      const primerApellido = conductor.apellidos.split(' ')[0]
      supabase
        .from('cabify_historico')
        .select('fecha_inicio, ganancia_total')
        .or(`dni.eq.${conductor.numero_dni},and(nombre.ilike.%${primerNombre}%,apellido.ilike.%${primerApellido}%)`)
        .order('fecha_inicio', { ascending: true })
        .then(({ data }) => {
          if (!data || data.length === 0) return
          // Agrupar ganancia por fecha (para cruzar con períodos)
          const porDia: Record<string, number> = {}
          for (const row of data) {
            const dia = (row.fecha_inicio as string).slice(0, 10)
            porDia[dia] = (porDia[dia] || 0) + (Number(row.ganancia_total) || 0)
          }
          setCabifyPorSemana(porDia)
        })

      // ===== Seccion nueva: MULTAS del conductor =====
      // Trae candidatas por primer apellido y filtra en cliente exigiendo que el
      // conductor_responsable contenga nombre Y apellido. Excluye borradas/desestimadas.
      supabase
        .from('multas_historico')
        .select('id, infraccion, patente, fecha_infraccion, importe, lugar, lugar_detalle, detalle, drive_url, conductor_responsable')
        .ilike('conductor_responsable', `%${primerApellido}%`)
        .is('deleted_at', null)
        .is('desestimada_at', null)
        .order('fecha_infraccion', { ascending: false })
        .limit(200)
        .then(({ data }) => {
          const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
          const n = norm(primerNombre), a = norm(primerApellido)
          const filtradas = ((data || []) as Array<PortalMulta & { conductor_responsable?: string }>)
            .filter(m => {
              const cr = norm(m.conductor_responsable || '')
              return cr.includes(n) && cr.includes(a)
            })
            .map((m): PortalMulta => ({
              id: m.id, infraccion: m.infraccion, patente: m.patente,
              fecha_infraccion: m.fecha_infraccion, importe: m.importe,
              lugar: m.lugar, lugar_detalle: m.lugar_detalle, detalle: m.detalle, drive_url: m.drive_url,
            }))
          setMultas(filtradas)
        })

      // ===== Seccion nueva: KM RECORRIDOS por semana (desde junio 2026) =====
      loadKmRecorridos(conductor)
    }
  }, [conductor, view, loadFacturas, loadKmRecorridos])

  // =====================================================
  // LOAD DETAIL
  // =====================================================

  async function openDetail(factura: PortalFacturacion) {
    setSelectedFactura(factura)
    setShowDetalleModal(true)
    setLoadingDetalle(true)
    setDetalleError('')
    setDetallePagos([])

    // Pagos del conductor en esa semana/año desde control_saldos (kardex)
    const periodo = factura.periodos_facturacion
    supabase
      .from('control_saldos')
      .select('id, tipo_movimiento, monto_movimiento, referencia, created_at')
      .eq('conductor_id', factura.conductor_id)
      .eq('semana', periodo.semana)
      .eq('anio', periodo.anio)
      .in('tipo_movimiento', ['pago_cabify', 'pago_manual', 'pago', 'pago_cuota'])
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!data) return
        setDetallePagos((data as Array<{ id: string; tipo_movimiento: string; monto_movimiento: number; referencia: string | null; created_at: string }>).map(p => ({
          id: p.id,
          tipo: p.tipo_movimiento,
          monto: Number(p.monto_movimiento) || 0,
          referencia: p.referencia,
          fecha: p.created_at,
        })))
      })

    try {
      const { data, error } = await supabase
        .from('facturacion_detalle')
        .select('id, facturacion_id, concepto_codigo, concepto_descripcion, cantidad, precio_unitario, subtotal, total, es_descuento, referencia_id, referencia_tipo')
        .eq('facturacion_id', factura.id)
        .order('es_descuento')
        .order('concepto_codigo')

      if (error) throw error
      const items = (data || []) as PortalDetalle[]

      // Enriquecer P004 con descripción real desde penalidades o tickets_favor
      const ticketItems = items.filter(i => i.concepto_codigo === 'P004' && i.referencia_id)
      if (ticketItems.length > 0) {
        // Agrupar por referencia_tipo
        const fromPenalidades = ticketItems.filter(i => i.referencia_tipo === 'penalidad' || i.referencia_tipo === 'penalidad_cuota')
        const fromTickets = ticketItems.filter(i => i.referencia_tipo === 'ticket')

        // Buscar en penalidades
        if (fromPenalidades.length > 0) {
          const penIds = fromPenalidades.map(i => i.referencia_id!).filter(Boolean)
          const { data: penData } = await (supabase.from('penalidades') as any)
            .select('id, detalle, observaciones, area_responsable, fecha, turno')
            .in('id', penIds)
          if (penData) {
            const penMap = new Map(penData.map((p: any) => [p.id, p] as [string, any]))
            for (const item of fromPenalidades) {
              const pen: any = penMap.get(item.referencia_id!)
              if (pen) {
                const parts: string[] = []
                if (pen.detalle) parts.push(pen.detalle)
                if (pen.observaciones) parts.push(pen.observaciones)
                if (pen.turno) parts.push(`Turno ${pen.turno}`)
                if (pen.fecha) {
                  const [y, m, d] = pen.fecha.split('-')
                  parts.push(`${d}/${m}/${y}`)
                }
                item.concepto_descripcion = parts.join(' · ') || 'Descuento'
              }
            }
          }
        }

        // Buscar en tickets_favor
        if (fromTickets.length > 0) {
          const ticketIds = fromTickets.map(i => i.referencia_id!).filter(Boolean)
          const { data: ticketsData } = await (supabase.from('tickets_favor') as any)
            .select('id, descripcion, tipo')
            .in('id', ticketIds)
          if (ticketsData) {
            const ticketMap = new Map(ticketsData.map((t: any) => [t.id, t] as [string, any]))
            for (const item of fromTickets) {
              const ticket: any = ticketMap.get(item.referencia_id!)
              if (ticket) {
                const desc = ticket.descripcion || ticket.tipo || 'Descuento'
                item.concepto_descripcion = desc
              }
            }
          }
        }
      }

      // Inject saldo_anterior as a concepto line (same logic as ReporteFacturacionTab)
      const saldo = factura.saldo_anterior || 0
      if (saldo > 0) {
        items.push({
          id: `saldo-${factura.id}`,
          facturacion_id: factura.id,
          concepto_codigo: 'SALDO',
          concepto_descripcion: 'Saldo Anterior (deuda)',
          cantidad: 1,
          precio_unitario: saldo,
          subtotal: saldo,
          total: saldo,
          es_descuento: false,
        })
      } else if (saldo < 0) {
        items.push({
          id: `saldo-${factura.id}`,
          facturacion_id: factura.id,
          concepto_codigo: 'SALDO',
          concepto_descripcion: 'Saldo a Favor',
          cantidad: 1,
          precio_unitario: Math.abs(saldo),
          subtotal: Math.abs(saldo),
          total: Math.abs(saldo),
          es_descuento: true,
        })
      }

      setDetalleItems(items)
    } catch {
      setDetalleItems([])
      setDetalleError('No se pudo cargar el detalle. Intentá de nuevo.')
    } finally {
      setLoadingDetalle(false)
    }
  }

  // =====================================================
  // EXPORT PDF
  // =====================================================

  async function exportarPDF() {
    if (!selectedFactura) return

    const periodo = selectedFactura.periodos_facturacion
    setExportingPdf(true)

    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const margin = 15
      let y = 15

      const rojo = '#ff0033'
      const gris = '#6B7280'
      const negro = '#111827'
      const verde = '#059669'

      // Header con logo
      if (logoBase64) {
        const logoH = 35
        const logoW = logoH * logoAspectRatio
        pdf.addImage(logoBase64, 'PNG', margin, y - 16, logoW, logoH)
      } else {
        pdf.setFontSize(22)
        pdf.setTextColor(rojo)
        pdf.setFont('helvetica', 'bold')
        pdf.text('TOSHIFY', margin, y)
      }

      // Título
      pdf.setFontSize(14)
      pdf.setTextColor(negro)
      pdf.setFont('helvetica', 'bold')
      pdf.text('PROFORMA', pageWidth - margin, y, { align: 'right' })

      pdf.setFontSize(10)
      pdf.setTextColor(rojo)
      pdf.text(`Semana ${periodo.semana} / ${periodo.anio}`, pageWidth - margin, y + 6, { align: 'right' })

      pdf.setTextColor(gris)
      pdf.setFont('helvetica', 'normal')
      pdf.text(
        `${format(parseISO(periodo.fecha_inicio), 'dd/MM/yyyy')} - ${format(parseISO(periodo.fecha_fin), 'dd/MM/yyyy')}`,
        pageWidth - margin, y + 11, { align: 'right' }
      )

      y += 25

      // Línea separadora
      pdf.setDrawColor(220, 38, 38)
      pdf.setLineWidth(0.5)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 6

      // Nota legal superior
      pdf.setFontSize(8)
      pdf.setTextColor(gris)
      pdf.setFont('helvetica', 'italic')
      pdf.text(
        'La información presentada es de carácter referencial y no constituye un comprobante fiscal válido.',
        pageWidth / 2, y, { align: 'center' }
      )
      y += 8

      // Datos del conductor
      pdf.setFontSize(11)
      pdf.setTextColor(negro)
      pdf.setFont('helvetica', 'bold')
      pdf.text('CONDUCTOR', margin, y)
      y += 6

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Nombre: ${selectedFactura.conductor_nombre}`, margin, y)
      pdf.text(`DNI: ${selectedFactura.conductor_dni}`, pageWidth / 2, y)
      y += 5
      if (selectedFactura.conductor_cuit) {
        pdf.text(`CUIT: ${selectedFactura.conductor_cuit}`, margin, y)
      }
      pdf.text(`Vehículo: ${selectedFactura.vehiculo_patente || '-'}`, pageWidth / 2, y)
      y += 5
      pdf.text(`Modalidad: ${selectedFactura.tipo_alquiler}`, margin, y)
      pdf.text(`Turnos: ${selectedFactura.turnos_cobrados}/${selectedFactura.turnos_base}`, pageWidth / 2, y)
      y += 10

      // Línea separadora
      pdf.setDrawColor(200, 200, 200)
      pdf.setLineWidth(0.2)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 8

      // CONCEPTOS (cargos + descuentos unificados, sin subtotales)
      const cargos = detalleItems.filter(d => !d.es_descuento && d.total !== 0 && d.concepto_codigo !== 'SALDO')
      const descuentos = detalleItems.filter(d => d.es_descuento && d.total !== 0 && d.concepto_codigo !== 'SALDO')
      const saldoItemPdf = detalleItems.find(d => d.concepto_codigo === 'SALDO')
      const saldoAntPdf = saldoItemPdf ? (saldoItemPdf.es_descuento ? -saldoItemPdf.total : saldoItemPdf.total) : 0

      pdf.setFontSize(11)
      pdf.setTextColor(negro)
      pdf.setFont('helvetica', 'bold')
      pdf.text('CONCEPTOS', margin, y)
      y += 7

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      cargos.forEach(cargo => {
        pdf.setTextColor(negro)
        const cargoDesc = getConceptoLabel(cargo)
        const cargoLabel = cargo.cantidad > 1
          ? `${cargoDesc} x${cargo.cantidad}`
          : cargoDesc
        pdf.text(cargoLabel, margin, y)
        pdf.text(formatCurrency(cargo.total), pageWidth - margin, y, { align: 'right' })
        y += 5
      })
      descuentos.forEach(desc => {
        pdf.setTextColor(negro)
        const descDesc = getConceptoLabel(desc)
        const descLabel = desc.cantidad > 1
          ? `${descDesc} x${desc.cantidad}`
          : descDesc
        pdf.text(descLabel, margin, y)
        pdf.setTextColor(verde)
        pdf.text(`-${formatCurrency(desc.total)}`, pageWidth - margin, y, { align: 'right' })
        y += 5
      })

      // SALDO ANTERIOR en PDF
      if (saldoAntPdf !== 0) {
        y += 4
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        pdf.setTextColor(negro)
        pdf.text('SALDO ANTERIOR', margin, y)
        y += 5
        pdf.setFont('helvetica', 'normal')
        pdf.text(saldoAntPdf > 0 ? 'Deuda pendiente semana anterior' : 'Saldo a favor semana anterior', margin, y)
        pdf.setTextColor(saldoAntPdf > 0 ? rojo : verde)
        pdf.text(`${saldoAntPdf > 0 ? '+' : '-'}${formatCurrency(Math.abs(saldoAntPdf))}`, pageWidth - margin, y, { align: 'right' })
        y += 5
      }

      // TOTAL
      y += 5
      pdf.setDrawColor(200, 200, 200)
      pdf.setLineWidth(0.5)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 8

      const subtotalCargos = cargos.reduce((sum, c) => sum + c.total, 0)
      const subtotalDescPdf = descuentos.reduce((sum, d) => sum + d.total, 0)
      const totalFinal = subtotalCargos - subtotalDescPdf + saldoAntPdf
      const saldoColor = totalFinal > 0 ? rojo : verde

      pdf.setFontSize(14)
      pdf.setTextColor(saldoColor)
      pdf.setFont('helvetica', 'bold')
      pdf.text('MONTO TOTAL REFERENCIAL', margin, y)
      pdf.text(formatCurrency(totalFinal), pageWidth - margin, y, { align: 'right' })

      // Nota legal
      y += 12
      pdf.setFontSize(8)
      pdf.setTextColor(gris)
      pdf.setFont('helvetica', 'italic')
      pdf.text(
        'La información presentada es de carácter referencial y no constituye un comprobante fiscal válido.',
        pageWidth / 2, y, { align: 'center' }
      )

      // Pie de página
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Generado el ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, margin, pdf.internal.pageSize.getHeight() - 10)
      pdf.text('TOSHIFY - Sistema de Gestión de Flota', pageWidth - margin, pdf.internal.pageSize.getHeight() - 10, { align: 'right' })

      // Guardar
      const nombreArchivo = `Proforma_${selectedFactura.conductor_nombre.replace(/\s+/g, '_')}_Semana${periodo.semana}_${periodo.anio}.pdf`
      pdf.save(nombreArchivo)
    } catch {
      alert('No se pudo generar el PDF. Intentá de nuevo.')
    } finally {
      setExportingPdf(false)
    }
  }

  // =====================================================
  // LOGOUT
  // =====================================================

  function handleLogout() {
    setConductor(null)
    setFacturas([])
    setSelectedFactura(null)
    setDetalleItems([])
    setSaldo(null)
    setFraccionamientos([])
    setCabifyPorSemana({})
    setShowDetalleModal(false)
    setSelectedMulta(null)
    setLoginInput('')
    setLoginError('')
    setView('login')
  }

  // =====================================================
  // STATS & CHART DATA (must be before early returns - rules of hooks)
  // =====================================================

  const stats = useMemo(() => {
    if (facturas.length === 0) return null

    const totales = facturas.map(f => f.total_a_pagar)
    const sum = totales.reduce((a, b) => a + b, 0)
    const promedio = sum / totales.length
    const ultima = totales[0] || 0
    const anterior = totales[1] || 0
    const variacion = anterior > 0 ? ((ultima - anterior) / anterior) * 100 : 0

    // Chart data: últimas 12 semanas con facturación + ganancia Cabify
    // cabifyPorSemana tiene datos diarios: { "2026-01-26": 1500, "2026-01-27": 2000, ... }
    // Necesitamos sumar los días que caen dentro de cada período
    const cabifyDates = Object.keys(cabifyPorSemana)
    const chartData = facturas
      .slice(0, 12)
      .map(f => {
        const p = f.periodos_facturacion
        const inicio = p.fecha_inicio.slice(0, 10)
        const fin = p.fecha_fin.slice(0, 10)
        // Sumar ganancias cabify de días dentro del rango [inicio, fin]
        let ganancia = 0
        for (const dia of cabifyDates) {
          if (dia >= inicio && dia <= fin) {
            ganancia += cabifyPorSemana[dia]
          }
        }
        return {
          label: `S${p.semana}`,
          facturacion: f.total_a_pagar,
          ganancia,
          pagos: pagadoPorSemana[`${p.semana}-${p.anio}`] || 0,
        }
      })
      .reverse()

    // Ganancia Cabify última semana (la más reciente = último elemento del chart)
    const ultimaGanancia = chartData.length > 0 ? chartData[chartData.length - 1].ganancia : 0

    return { sum, promedio, ultima, variacion, totalSemanas: facturas.length, chartData, ultimaGanancia }
  }, [facturas, cabifyPorSemana, pagadoPorSemana])



  // =====================================================
  // RENDER: LOGIN
  // =====================================================

  if (view === 'login') {
    return (
      <div className="portal portal-login">
        <form className="portal-login-card" onSubmit={handleLogin}>
          <img src={logoToshifyUrl} alt="Toshify" className="portal-login-logo" />
          <h1 className="portal-login-title">Mi Espacio</h1>
          <p className="portal-login-subtitle">Ingresá tu DNI o CUIT para ver tu proforma</p>

          <input
            type="text"
            className="portal-login-input"
            placeholder="DNI o CUIT"
            value={loginInput}
            onChange={(e) => { setLoginInput(e.target.value); setLoginError('') }}
            autoFocus
            inputMode="numeric"
          />

          <button
            type="submit"
            className="portal-login-btn"
            disabled={loginLoading || !loginInput.trim()}
          >
            {loginLoading ? 'Buscando...' : 'Ingresar'}
          </button>

          {loginError && (
            <div className="portal-login-error">{loginError}</div>
          )}
        </form>
      </div>
    )
  }

  // =====================================================
  // RENDER: DETAIL
  // =====================================================

  // Modal de detalle de semana: se renderiza como overlay SOBRE el dashboard.
  // Se construye solo cuando hay modal abierto + factura seleccionada.
  const detalleModal = (showDetalleModal && selectedFactura) ? (() => {
    const periodo = selectedFactura.periodos_facturacion
    const cargos = detalleItems.filter(d => !d.es_descuento && d.total !== 0 && d.concepto_codigo !== 'SALDO')
    const descuentos = detalleItems.filter(d => d.es_descuento && d.total !== 0 && d.concepto_codigo !== 'SALDO')
    const saldoAnteriorItem = detalleItems.find(d => d.concepto_codigo === 'SALDO')
    const saldoAnterior = saldoAnteriorItem ? (saldoAnteriorItem.es_descuento ? -saldoAnteriorItem.total : saldoAnteriorItem.total) : 0
    const subtotalCargos = cargos.reduce((sum, d) => sum + d.total, 0)
    const subtotalDescuentos = descuentos.reduce((sum, d) => sum + d.total, 0)
    const totalAPagar = subtotalCargos - subtotalDescuentos + saldoAnterior
    // Saldo real = referencial - lo ya pagado (Cabify + ajustes + transferencias).
    // Si > 0 = todavia debe. Si <= 0 = cubierto o a favor.
    const totalPagadoSemana = detallePagos.reduce((s, p) => s + p.monto, 0)
    const saldoPendiente = totalAPagar - totalPagadoSemana

    return (
      <div className="portal-modal-overlay" onClick={() => setShowDetalleModal(false)}>
        <div className="portal-modal-card" onClick={e => e.stopPropagation()}>
          <button
            className="portal-modal-close"
            onClick={() => setShowDetalleModal(false)}
            aria-label="Cerrar"
          >×</button>

          {loadingDetalle ? (
            <div className="portal-loading">Cargando detalle...</div>
          ) : (
            <div className="portal-detail-card" style={{ border: 'none', borderRadius: 0 }}>
              {/* Header */}
              <div className="portal-detail-header">
                <div>
                  <div className="portal-detail-conductor">{selectedFactura.conductor_nombre}</div>
                  <div className="portal-detail-cuit">
                    {selectedFactura.conductor_cuit || `DNI: ${selectedFactura.conductor_dni}`}
                  </div>
                </div>
                <div>
                  <div className="portal-detail-semana">Semana {periodo.semana}</div>
                  <div className="portal-detail-fechas">
                    {format(parseISO(periodo.fecha_inicio), 'dd/MM')} - {format(parseISO(periodo.fecha_fin), 'dd/MM')} / {periodo.anio}
                  </div>
                </div>
              </div>

              {/* Info bar */}
              <div className="portal-detail-info">
                <div className="portal-detail-info-item">
                  <span className="portal-detail-info-label">Vehículo</span>
                  <span className="portal-detail-info-value">{selectedFactura.vehiculo_patente || '-'}</span>
                </div>
                <div className="portal-detail-info-item">
                  <span className="portal-detail-info-label">Modalidad</span>
                  <span className="portal-detail-info-value">{selectedFactura.tipo_alquiler}</span>
                </div>
                <div className="portal-detail-info-item">
                  <span className="portal-detail-info-label">Combustible</span>
                  <span className="portal-detail-info-value" style={{ color: detalleItems.some(d => ['P014','P015','P016'].includes(d.concepto_codigo)) ? '#ef4444' : '#10b981' }}>
                    {detalleItems.some(d => ['P014','P015','P016'].includes(d.concepto_codigo)) ? 'Sin GNC' : 'GNC'}
                  </span>
                </div>
                <div className="portal-detail-info-item">
                  <span className="portal-detail-info-label">Turnos</span>
                  <span className="portal-detail-info-value">{selectedFactura.turnos_cobrados}/{selectedFactura.turnos_base}</span>
                </div>
                {selectedFactura.grupo_flota && (
                  <div className="portal-detail-info-item">
                    <span className="portal-detail-info-label">Flota</span>
                    <span className="portal-detail-info-value" style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                      {selectedFactura.grupo_flota}
                    </span>
                  </div>
                )}
              </div>

              <div className="portal-detail-body">
                {detalleError && (
                  <div style={{ padding: '12px', background: '#FEE2E2', color: '#dc2626', borderRadius: '6px', fontSize: '12px', marginBottom: '8px' }}>
                    {detalleError}
                  </div>
                )}
                {/* CONCEPTOS (cargos + descuentos unificados) */}
                <div className="portal-detail-section">
                  <div className="portal-detail-section-title cargos">Conceptos</div>
                  <div className="portal-detail-items">
                    {cargos.map((item) => (
                      <div key={item.id} className="portal-detail-item">
                        <span className="portal-detail-item-name">
                          <span className="portal-detail-item-dot cargo" />
                          {getConceptoLabel(item)}
                          {item.cantidad > 1 && ` x${item.cantidad}`}
                        </span>
                        <span className="portal-detail-item-amount">{formatCurrency(item.total)}</span>
                      </div>
                    ))}
                    {descuentos.map((item) => (
                      <div key={item.id} className="portal-detail-item">
                        <span className="portal-detail-item-name">
                          <span className="portal-detail-item-dot descuento" />
                          {getConceptoLabel(item)}
                        </span>
                        <span className="portal-detail-item-amount" style={{ color: '#059669' }}>
                          -{formatCurrency(item.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SUBTOTALES */}
                <div className="portal-detail-items" style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '8px', marginTop: '4px' }}>
                  <div className="portal-detail-item">
                    <span className="portal-detail-item-name" style={{ fontWeight: 600, fontSize: '12px' }}>Subtotal Cargos</span>
                    <span className="portal-detail-item-amount" style={{ fontWeight: 600 }}>{formatCurrency(subtotalCargos)}</span>
                  </div>
                  {subtotalDescuentos > 0 && (
                    <div className="portal-detail-item">
                      <span className="portal-detail-item-name" style={{ fontWeight: 600, fontSize: '12px' }}>Subtotal Descuentos</span>
                      <span className="portal-detail-item-amount" style={{ fontWeight: 600, color: '#059669' }}>-{formatCurrency(subtotalDescuentos)}</span>
                    </div>
                  )}
                </div>

                {/* SALDO ANTERIOR */}
                {saldoAnterior !== 0 && (
                  <div className="portal-detail-section" style={{ marginTop: '8px' }}>
                    <div className="portal-detail-section-title" style={{ color: saldoAnterior > 0 ? '#dc2626' : '#059669' }}>Saldo Anterior</div>
                    <div className="portal-detail-items">
                      <div className="portal-detail-item">
                        <span className="portal-detail-item-name">
                          <span className="portal-detail-item-dot" style={{ background: saldoAnterior > 0 ? '#dc2626' : '#059669' }} />
                          {saldoAnterior > 0 ? 'Deuda pendiente semana anterior' : 'Saldo a favor semana anterior'}
                        </span>
                        <span className="portal-detail-item-amount" style={{ color: saldoAnterior > 0 ? '#dc2626' : '#059669' }}>
                          {saldoAnterior > 0 ? '+' : '-'}{formatCurrency(Math.abs(saldoAnterior))}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* PAGOS REALIZADOS EN ESTA SEMANA */}
                {detallePagos.length > 0 && (() => {
                  const tipoLabel: Record<string, string> = {
                    pago_cabify: 'Pago Cabify',
                    pago_manual: 'Pago Manual',
                    pago: 'Pago',
                    pago_cuota: 'Pago Cuota',
                    ajuste_manual: 'Ajuste',
                  }
                  const totalPagado = detallePagos.reduce((s, p) => s + p.monto, 0)
                  return (
                    <div className="portal-detail-section" style={{ marginTop: '8px' }}>
                      <div
                        className="portal-detail-section-title"
                        style={{ color: '#059669' }}
                        title="Aportes registrados: app Cabify y transferencias a Toshify."
                      >
                        Aportes
                      </div>
                      <div className="portal-detail-items">
                        {detallePagos.map((p) => {
                          const fecha = new Date(p.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                          return (
                            <div key={p.id} className="portal-detail-item">
                              <span className="portal-detail-item-name">
                                <span className="portal-detail-item-dot" style={{ background: '#059669' }} />
                                {tipoLabel[p.tipo] || p.tipo}
                                <span style={{ color: 'var(--text-secondary)', marginLeft: '6px', fontSize: '11px' }}>
                                  {p.referencia ? `· ${p.referencia}` : ''} · {fecha}
                                </span>
                              </span>
                              <span className="portal-detail-item-amount" style={{ color: '#059669' }}>
                                -{formatCurrency(p.monto)}
                              </span>
                            </div>
                          )
                        })}
                        <div className="portal-detail-item" style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '6px', marginTop: '4px' }}>
                          <span className="portal-detail-item-name" style={{ fontWeight: 600, fontSize: '12px' }}>Total aportado</span>
                          <span className="portal-detail-item-amount" style={{ fontWeight: 600, color: '#059669' }}>-{formatCurrency(totalPagado)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* TOTAL — color segun saldo pendiente real (referencial - pagos):
                    rojo si todavia debe, verde si esta cubierto o a favor */}
                <div className="portal-detail-total">
                  <div className="portal-detail-total-label">Monto Total Referencial</div>
                  <div className={`portal-detail-total-amount ${saldoPendiente > 0.01 ? 'debit' : 'credit'}`}>
                    {formatCurrency(totalAPagar)}
                  </div>
                  <div className="portal-detail-total-note">
                    {saldoPendiente > 0.01
                      ? `Pendiente de pago: ${formatCurrency(saldoPendiente)}`
                      : saldoPendiente < -0.01
                        ? `Saldo a favor: ${formatCurrency(Math.abs(saldoPendiente))}`
                        : 'Cubierto'}
                  </div>
                </div>
              </div>

              {/* PDF Button */}
              <div className="portal-detail-actions">
                <button
                  className="portal-pdf-btn"
                  onClick={exportarPDF}
                  disabled={exportingPdf}
                >
                  {exportingPdf ? 'Generando...' : '↓ Descargar PDF'}
                </button>
              </div>
            </div>
          )}
          {/* Nota legal */}
          <div className="portal-nota-legal" style={{ padding: '0 4px' }}>
            La información presentada es de carácter referencial y no constituye un comprobante fiscal válido.
          </div>
        </div>
      </div>
    )
  })() : null

  // Modal de detalle de multa (boton "Ver" de Mis multas).
  // OJO con el modelo de datos real de multas_historico:
  //   - infraccion    = N° de acta/expediente (ej "Q37295361")
  //   - detalle       = descripcion real de la infraccion (ej "Exceso de velocidad...")
  //   - lugar         = jurisdiccion (ej "CABA")
  //   - lugar_detalle = "Lugar: <direccion> | Estado: <estado>"
  const multaModal = selectedMulta ? (() => {
    const m = selectedMulta
    // Parsear lugar_detalle -> direccion + estado
    let direccion = '', estado = ''
    if (m.lugar_detalle) {
      const dirMatch = m.lugar_detalle.match(/Lugar:\s*([^|]+)/i)
      const estMatch = m.lugar_detalle.match(/Estado:\s*([^|]+)/i)
      direccion = dirMatch ? dirMatch[1].trim() : ''
      estado = estMatch ? estMatch[1].trim() : ''
      if (!dirMatch && !estMatch) direccion = m.lugar_detalle.trim()
    }
    const lugarCompleto = [m.lugar, direccion].filter(Boolean).join(' — ')
    const previewUrl = drivePreviewUrl(m.drive_url)
    const fechaInfraccion = m.fecha_infraccion ? format(parseISO(m.fecha_infraccion), 'dd/MM/yyyy') : '-'
    const horaInfraccion = m.fecha_infraccion ? format(parseISO(m.fecha_infraccion), 'HH:mm') : ''
    return (
    <div className="portal-modal-overlay" onClick={() => setSelectedMulta(null)}>
      <div className="portal-multa-modal" onClick={e => e.stopPropagation()}>
        {/* Header (diseño del sistema: título + cerrar, como MultasModule) */}
        <div className="portal-multa-modal-header">
          <h2 className="portal-multa-modal-title">Detalle de Multa{m.patente ? ` — ${m.patente}` : ''}</h2>
          <button
            className="portal-modal-close"
            onClick={() => setSelectedMulta(null)}
            aria-label="Cerrar"
          >×</button>
        </div>

        {/* Cuerpo: acta embebida (izq) + tabla de detalle (der) */}
        <div className="portal-multa-modal-body">
          <div className="portal-multa-doc">
            {previewUrl ? (
              <iframe src={previewUrl} title="Acta de la multa" allow="autoplay" />
            ) : (
              <div className="portal-multa-doc-empty">
                <div className="portal-multa-doc-empty-title">Sin PDF disponible</div>
                <div className="portal-multa-doc-empty-sub">Esta multa no tiene un documento asociado en Drive.</div>
              </div>
            )}
          </div>

          <div className="portal-multa-datos">
            <div className="portal-multa-datos-scroll">
              <table className="portal-multa-table">
                <tbody>
                  <tr>
                    <td className="portal-multa-label">Patente</td>
                    <td className="portal-multa-value"><span className="patente-badge">{m.patente || '-'}</span></td>
                  </tr>
                  <tr>
                    <td className="portal-multa-label">Fecha Infracción</td>
                    <td className="portal-multa-value">
                      {fechaInfraccion}
                      {horaInfraccion && <span className="portal-multa-hora">{horaInfraccion}</span>}
                    </td>
                  </tr>
                  <tr>
                    <td className="portal-multa-label">Importe</td>
                    <td className="portal-multa-value portal-multa-importe">{m.importe || '-'}</td>
                  </tr>
                  <tr>
                    <td className="portal-multa-label">Acta</td>
                    <td className="portal-multa-value">{m.infraccion || '-'}</td>
                  </tr>
                  <tr>
                    <td className="portal-multa-label">Lugar</td>
                    <td className="portal-multa-value">{lugarCompleto || m.lugar || '-'}</td>
                  </tr>
                  {estado && (
                    <tr>
                      <td className="portal-multa-label">Estado</td>
                      <td className="portal-multa-value">{estado}</td>
                    </tr>
                  )}
                  {m.detalle && (
                    <tr>
                      <td className="portal-multa-label">Infracción</td>
                      <td className="portal-multa-value"><div className="portal-multa-obs">{m.detalle}</div></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {m.drive_url && (
              <div className="portal-multa-modal-footer">
                <a
                  className="portal-pdf-btn"
                  href={driveDownloadUrl(m.drive_url)}
                  download={`Multa_${m.infraccion || 'acta'}.pdf`}
                  rel="noopener noreferrer"
                >↓ Descargar</a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    )
  })() : null

  // =====================================================
  // RENDER: DASHBOARD
  // =====================================================

  return (
    <div className="portal">
      <header className="portal-header">
        <div className="portal-header-left">
          <img src={logoToshifyUrl} alt="Toshify" className="portal-header-logo" />
          <div>
            <div className="portal-header-name">
              {conductor?.nombres} {conductor?.apellidos}
            </div>
            <div className="portal-header-dni">DNI: {conductor?.numero_dni}</div>
          </div>
        </div>
        <button className="portal-logout-btn" onClick={handleLogout}>
          Salir
        </button>
      </header>

      <div className="portal-content" data-active={activeSection}>
        {loadingFacturas ? (
          <div className="portal-loading">Cargando facturación...</div>
        ) : facturas.length === 0 ? (
          <div className="portal-empty">
            <div className="portal-empty-icon">📋</div>
            <p>No hay facturación registrada todavía</p>
          </div>
        ) : stats && (
          <div className="portal-shell">
            {/* ===== MENU LATERAL DESKTOP (mismo estado que la bottom-nav mobile) =====
                En desktop, Resumen e Historial comparten sección (se ven juntos),
                por eso Historial no aparece como ítem propio. */}
            <nav className="portal-sidebar">
              {NAV_ITEMS.filter(item => item.key !== 'historial').map(item => (
                <button
                  key={item.key}
                  className={`portal-side-item${(activeSection === item.key || (item.key === 'resumen' && activeSection === 'historial')) ? ' active' : ''}`}
                  onClick={() => setActiveSection(item.key)}
                  type="button"
                >
                  <span className="portal-side-ico">{item.ico}</span>
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="portal-main">
            {/* ===== SECCIÓN: RESUMEN (stats + mora + gráficos) ===== */}
            <section className="portal-msec" data-msec="resumen">
            {/* Stats row */}
            <div className="portal-stats-grid">
              <div className="portal-stat-card">
                <div className="portal-stat-label">
                  Última semana
                  <span className="portal-stat-tooltip" data-tooltip="Monto referencial de la última semana registrada.">ⓘ</span>
                </div>
                <div className="portal-stat-value debit">{formatCurrency(stats.ultima)}</div>
                {stats.variacion !== 0 && (
                  <div className={`portal-stat-change ${stats.variacion > 0 ? 'up' : 'down'}`}>
                    {stats.variacion > 0 ? '↑' : '↓'} {Math.abs(stats.variacion).toFixed(1)}%
                  </div>
                )}
              </div>
              <div className="portal-stat-card">
                <div className="portal-stat-label">
                  Promedio semanal
                  <span className="portal-stat-tooltip" data-tooltip="Promedio de los montos referenciales de tus últimas semanas.">ⓘ</span>
                </div>
                <div className="portal-stat-value">{formatCurrency(stats.promedio)}</div>
                <div className="portal-stat-sub">{stats.totalSemanas} semanas</div>
              </div>
              <div className="portal-stat-card">
                <div className="portal-stat-label">
                  Ganancia Cabify
                  <span className="portal-stat-tooltip" data-tooltip="Tu ingreso registrado por la app Cabify en la última semana.">ⓘ</span>
                </div>
                <div className="portal-stat-value" style={{ color: '#059669' }}>{formatCurrency(stats.ultimaGanancia)}</div>
                <div className="portal-stat-sub">última semana</div>
              </div>
              <div className="portal-stat-card">
                <div className="portal-stat-label">
                  Saldo actual
                  <span className="portal-stat-tooltip" data-tooltip="Saldo referencial acumulado. En rojo si está pendiente, en verde si tienes a favor.">ⓘ</span>
                </div>
                {saldo ? (
                  <>
                    <div className={`portal-stat-value ${saldo.saldo_actual < 0 ? 'debit' : 'credit'}`}>
                      {saldo.saldo_actual < 0 ? '-' : ''}{formatCurrency(Math.abs(saldo.saldo_actual))}
                    </div>
                    <div className="portal-stat-sub">
                      {saldo.saldo_actual > 0 ? 'A favor' : saldo.saldo_actual < 0 ? 'Pendiente' : 'Sin saldo'}
                    </div>
                  </>
                ) : (
                  <div className="portal-stat-value">-</div>
                )}
              </div>
            </div>

            {/* Mora banner */}
            {saldo && saldo.dias_mora > 0 && (
              <div className="portal-mora-banner">
                <span className="portal-mora-label">Mora: {saldo.dias_mora} días</span>
                <span className="portal-mora-amount">Acumulada: {formatCurrency(saldo.monto_mora_acumulada)}</span>
              </div>
            )}
            </section>{/* /resumen (stats + mora) */}

            {/* 2 columnas en desktop: gráficos (Resumen) + Historial juntos en la
                misma pestaña. En mobile cada uno es su propia sección. */}
            <div className="portal-layout">
              <div className="portal-left portal-msec" data-msec="resumen">
                {/* Chart */}
                <div className="portal-chart-card">
                  <div className="portal-chart-header">
                    <div className="portal-chart-title">Proforma vs Ganancia Cabify</div>
                    <div className="portal-chart-legend">
                      <span className="portal-legend-item">
                        <span className="portal-legend-dot" style={{ background: '#ff0033' }} /> Proforma
                        <span className="portal-stat-tooltip" data-tooltip="Monto referencial de cada semana: alquiler, garantía y otros conceptos.">&#9432;</span>
                      </span>
                      <span className="portal-legend-item">
                        <span className="portal-legend-dot" style={{ background: '#059669' }} /> Ganancia Cabify
                        <span className="portal-stat-tooltip" data-tooltip="Tu ingreso registrado por la app Cabify cada semana.">&#9432;</span>
                      </span>
                    </div>
                  </div>
                  <div className="portal-chart-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stats.chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`}
                        />
                        <Tooltip
                          formatter={(value: string | number, name: string) => [formatCurrency(Number(value)), name === 'facturacion' ? 'Proforma' : 'Ganancia Cabify']}
                          contentStyle={{
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: 'var(--text-primary)',
                          }}
                          labelStyle={{ color: 'var(--text-secondary)' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="facturacion"
                          stroke="#ff0033"
                          strokeWidth={2}
                          dot={{ r: 4, fill: '#ff0033', strokeWidth: 2, stroke: 'var(--card-bg)' }}
                          activeDot={{ r: 6, fill: '#ff0033', strokeWidth: 2, stroke: 'var(--card-bg)' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="ganancia"
                          stroke="#059669"
                          strokeWidth={2}
                          dot={{ r: 4, fill: '#059669', strokeWidth: 2, stroke: 'var(--card-bg)' }}
                          activeDot={{ r: 6, fill: '#059669', strokeWidth: 2, stroke: 'var(--card-bg)' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Chart: Proforma vs Aportes */}
                <div className="portal-chart-card">
                  <div className="portal-chart-header">
                    <div className="portal-chart-title">Proforma vs Aportes</div>
                    <div className="portal-chart-legend">
                      <span className="portal-legend-item">
                        <span className="portal-legend-dot" style={{ background: '#ff0033' }} /> Proforma
                        <span className="portal-stat-tooltip" data-tooltip="Monto referencial de cada semana: alquiler, garantía y otros conceptos.">&#9432;</span>
                      </span>
                      <span className="portal-legend-item">
                        <span className="portal-legend-dot" style={{ background: '#2563eb' }} /> Aportes
                        <span className="portal-stat-tooltip" data-tooltip="Aportes registrados cada semana: app Cabify y transferencias a Toshify.">&#9432;</span>
                      </span>
                    </div>
                  </div>
                  <div className="portal-chart-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stats.chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`}
                        />
                        <Tooltip
                          formatter={(value: string | number, name: string) => [formatCurrency(Number(value)), name === 'facturacion' ? 'Proforma' : 'Aportes']}
                          contentStyle={{
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: 'var(--text-primary)',
                          }}
                          labelStyle={{ color: 'var(--text-secondary)' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="facturacion"
                          stroke="#ff0033"
                          strokeWidth={2}
                          dot={{ r: 4, fill: '#ff0033', strokeWidth: 2, stroke: 'var(--card-bg)' }}
                          activeDot={{ r: 6, fill: '#ff0033', strokeWidth: 2, stroke: 'var(--card-bg)' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="pagos"
                          stroke="#2563eb"
                          strokeWidth={2}
                          dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: 'var(--card-bg)' }}
                          activeDot={{ r: 6, fill: '#2563eb', strokeWidth: 2, stroke: 'var(--card-bg)' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Fraccionamientos / Cuotas — oculto a pedido del cliente.
                    Bloque comentado en lugar de eliminado para poder reactivarlo
                    rápido si fuera necesario.
                {fraccionamientos.length > 0 && (
                  <div className="portal-fraccionamientos-card">
                    <div className="portal-chart-title">Fraccionamientos pendientes</div>
                    <div className="portal-fraccionamientos-list">
                      {fraccionamientos.map((f) => (
                        <div key={f.id} className="portal-fraccionamiento-item">
                          <div className="portal-fraccionamiento-desc">{f.descripcion}</div>
                          <div className="portal-fraccionamiento-detail">
                            Cuota {f.numero_cuota}/{f.total_cuotas} · {formatCurrency(f.monto_cuota)} · S{f.semana}/{f.anio}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                */}
              </div>

              <div className="portal-right portal-msec" data-msec="historial">
                <div className="portal-weeks-header">Historial</div>
                <div className="portal-weeks portal-weeks--grid">
                  {facturas.map((f) => {
                    const p = f.periodos_facturacion
                    const pagado = pagadoPorSemana[`${p.semana}-${p.anio}`] || 0
                    // Calculo de cobertura: pagado vs total a pagar
                    const referencial = f.total_a_pagar || 0
                    const saldo = referencial - pagado
                    const cobertura = referencial > 0 ? Math.min(100, (pagado / referencial) * 100) : (pagado > 0 ? 100 : 0)
                    // Estado: cubierto (saldo <= 0.01), pendiente (saldo > 0.01), a favor (saldo < -0.01)
                    let estado: 'cubierto' | 'pendiente' | 'favor' = 'cubierto'
                    if (saldo > 0.01) estado = 'pendiente'
                    else if (saldo < -0.01) estado = 'favor'
                    const fillColor = estado === 'pendiente'
                      ? 'linear-gradient(90deg, #f59e0b, #dc2626)'
                      : estado === 'favor' ? '#10b981' : '#059669'
                    const estadoColor = estado === 'pendiente' ? '#dc2626' : '#059669'
                    const estadoTexto = estado === 'pendiente'
                      ? `Pendiente ${formatCurrency(saldo)}`
                      : estado === 'favor'
                        ? `A favor ${formatCurrency(Math.abs(saldo))}`
                        : '✓ Cubierto'
                    return (
                      <div key={f.id} className="portal-week-card" onClick={() => openDetail(f)}>
                        <div className="portal-week-left" style={{ width: '100%' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                            <div className="portal-week-title">Semana {p.semana} / {p.anio}</div>
                            <div className="portal-week-total" style={{ fontSize: '15px', fontWeight: 800 }}>
                              {formatCurrency(referencial)}
                            </div>
                          </div>
                          <div className="portal-week-dates" style={{ marginBottom: '8px' }}>
                            {format(parseISO(p.fecha_inicio), 'dd/MM/yyyy')} - {format(parseISO(p.fecha_fin), 'dd/MM/yyyy')} · {f.vehiculo_patente || '-'} · {f.turnos_cobrados}/{f.turnos_base} turnos
                          </div>
                          <div style={{ marginTop: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '4px' }}>
                              <span style={{ color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                Cobertura {Math.round(cobertura)}%
                              </span>
                              <span style={{ color: estadoColor, fontWeight: 700, fontFamily: 'monospace' }}>
                                {estadoTexto}
                              </span>
                            </div>
                            <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${cobertura}%`, background: fillColor, borderRadius: '3px' }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>{/* /portal-layout */}

            {/* ===== SECCIÓN: MIS MULTAS ===== */}
            <section className="portal-msec" data-msec="multas">
                <div className="portal-weeks-header">Mis multas</div>
                {multas.length > 0 ? (
                  <div className="portal-weeks portal-weeks--grid">
                    {multas.map(m => {
                      const fecha = m.fecha_infraccion ? format(parseISO(m.fecha_infraccion), 'dd/MM/yyyy HH:mm') : 's/fecha'
                      // lugar_detalle = "Lugar: <direccion> | Estado: <estado>" -> extraer direccion
                      const dirMatch = m.lugar_detalle ? m.lugar_detalle.match(/Lugar:\s*([^|]+)/i) : null
                      const direccion = dirMatch ? dirMatch[1].trim() : ''
                      const ubic = [m.lugar, direccion].filter(Boolean).join(' — ')
                      return (
                        <div key={m.id} className="portal-week-card" style={{ cursor: 'default' }}>
                          <div className="portal-week-left">
                            {/* infraccion en BD = N° de acta; la descripcion real esta en detalle */}
                            <div className="portal-week-title">{m.detalle || 'Multa de tránsito'}</div>
                            <div className="portal-week-dates">{m.patente || '-'} · {fecha} · Acta {m.infraccion || '-'}</div>
                            {ubic && <div className="portal-week-info">{ubic}</div>}
                          </div>
                          <div className="portal-week-right">
                            <div className="portal-week-total debit">{m.importe || '-'}</div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                              <button className="portal-back-btn" style={{ margin: 0, padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }} onClick={() => setSelectedMulta(m)}>Ver</button>
                              {m.drive_url ? (
                                <a className="portal-pdf-btn" style={{ padding: '6px 14px', fontSize: '12px' }} href={driveDownloadUrl(m.drive_url)} download={`Multa_${m.infraccion || 'acta'}.pdf`} rel="noopener noreferrer">Descargar</a>
                              ) : (
                                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', padding: '6px 12px', border: '1px solid var(--border-primary)', borderRadius: '6px' }}>Sin PDF</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="portal-empty-note">No tenés multas registradas.</div>
                )}
            </section>{/* /multas */}

            {/* ===== SECCIÓN: KM RECORRIDOS (desde junio 2026) ===== */}
            <section className="portal-msec" data-msec="km">
                <div className="portal-weeks-header">Km recorridos (desde junio)</div>
                {kmSemanas.length > 0 ? (
                  <div className="portal-weeks portal-weeks--grid">
                    {kmSemanas.map(k => {
                      const pct = Math.min(100, Math.round((k.km / k.limite) * 100))
                      const excedido = k.excedido > 0
                      const disponibles = Math.max(0, k.limite - k.km)
                      const modLabel = k.modalidad === 'a_cargo' ? 'A cargo' : 'Turno'
                      return (
                        <div key={`${k.anio}-${k.semana}`} className="portal-week-card" style={{ cursor: 'default', borderColor: excedido ? 'rgba(220,38,38,.25)' : undefined }}>
                          <div className="portal-week-left" style={{ width: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                              <div className="portal-week-title">Semana {k.semana} / {k.anio}</div>
                              <div className={`portal-week-total${excedido ? ' debit' : ''}`} style={{ fontSize: '15px' }}>
                                {k.km.toLocaleString('es-AR')} <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, fontSize: '12px' }}>/ {k.limite.toLocaleString('es-AR')} km</span>
                              </div>
                            </div>
                            <div className="portal-week-dates" style={{ marginBottom: '8px' }}>
                              {format(parseISO(k.fecha_inicio), 'dd/MM/yyyy')} - {format(parseISO(k.fecha_fin), 'dd/MM/yyyy')} · {modLabel}
                            </div>
                            <div style={{ marginTop: '6px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '4px' }}>
                                <span style={{ color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{pct}% del límite</span>
                                <span style={{ color: excedido ? 'var(--color-primary)' : '#059669', fontWeight: 700, fontFamily: 'monospace' }}>
                                  {excedido ? 'Excedido' : `${disponibles.toLocaleString('es-AR')} km disponibles`}
                                </span>
                              </div>
                              <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: excedido ? 'var(--color-primary)' : '#9ca3af', borderRadius: '3px' }} />
                              </div>
                            </div>
                            {excedido && (
                              <div className="portal-mora-banner" style={{ marginTop: '10px' }}>
                                <span className="portal-mora-label">Excedido +{k.excedido.toLocaleString('es-AR')} km</span>
                                <span className="portal-mora-amount">sobre el límite de tu modalidad {modLabel} ({k.limite.toLocaleString('es-AR')} km/sem)</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="portal-empty-note">Sin viajes registrados desde junio.</div>
                )}
            </section>{/* /km */}

            {/* Nota legal */}
            <div className="portal-nota-legal">
              La información presentada es de carácter referencial y no constituye un comprobante fiscal válido.
            </div>
            </div>{/* /portal-main */}

            {/* ===== BOTTOM NAV (solo mobile via CSS) ===== */}
            <nav className="portal-bottom-nav">
              {NAV_ITEMS.map(item => (
                <button
                  key={item.key}
                  className={`portal-bn-item${activeSection === item.key ? ' active' : ''}`}
                  onClick={() => { setActiveSection(item.key); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                  type="button"
                >
                  <span className="portal-bn-ico">{item.ico}</span>
                  {item.short}
                </button>
              ))}
            </nav>
          </div>
        )}
      </div>

      {/* Modales (overlay sobre el dashboard) */}
      {detalleModal}
      {multaModal}
    </div>
  )
}
