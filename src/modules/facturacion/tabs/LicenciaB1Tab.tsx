// src/modules/facturacion/tabs/LicenciaB1Tab.tsx
// Facturación > Licencia B1: conductores de la promoción de licencia B1 (PRM02) y sus pagos
// diarios de $15.000. Son adelantos de su facturación semanal, no deudas: lo que no adelanta
// se cobra igual al facturar, y cada semana empieza en cero (las anteriores quedan como
// historial). Es solo seguimiento: cada día se llena con los depósitos de Cresium (44 Dreams
// y Grupo CG) del conductor o de quien paga por él (Cresium conductores), y con los pagos en
// efectivo cargados en Saldos > Registrar Pago con el tilde B1. Reglas en utils/pagosB1.ts.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { getISOWeek } from 'date-fns'
import { AlertTriangle, CalendarCheck, CheckCircle, Eye, Landmark, UserX, Users, Wallet, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import type { ColumnDef } from '@tanstack/react-table'
import { useSede } from '../../../contexts/SedeContext'
import { formatCurrency } from '../../../types/facturacion.types'
import { formatFecha } from '../../../utils/format'
import { semanaISO } from '../../../utils/semanaISO'
import { formatNombreCompleto } from '../../../utils/conductorUtils'
import { formatFechaHoraART, hoyART, sumarDiasISO } from '../../../utils/fechaArgentina'
import { cargarConductoresLicenciaB1, lunesDe } from '../utils/licenciaB1Service'
import type { FilaB1, PromoB1 } from '../utils/licenciaB1Service'
import { ETIQUETA_EMPRESA_CRESIUM, PROMO_B1_PAGO_DIARIO } from '../utils/pagosB1'
import type { DiaB1, EstadoDiaB1, EstadoSemanaB1, PagoB1, ResumenB1, SemanaB1 } from '../utils/pagosB1'
import { DataTable } from '../../../components/ui/DataTable'
import { ExcelColumnFilter } from '../../../components/ui/DataTable/ExcelColumnFilter'
import { ExcelDateRangeFilter } from '../../../components/ui/DataTable/ExcelDateRangeFilter'
import { ExcelNumberRangeFilter } from '../../../components/ui/DataTable/ExcelNumberRangeFilter'
import { StatsGrid } from '../../../components/ui/StatsGrid'
import { TabsBar } from '../../../components/ui/TabsBar'
import { LicenciaBadge } from '../../../components/ui/LicenciaBadge'
import '../../../styles/modules.css'
import './LicenciaB1Tab.css'

type Filtro = 'todos' | 'al_dia' | 'un_dia' | 'faltan'

/** Activos: los que siguen con B1. Bajas: dados de baja (solo para consultar). */
type Vista = 'activos' | 'bajas'

const ETIQUETA_ESTADO_DIA: Record<EstadoDiaB1, string> = {
  pagado: 'Pagado',
  atrasado: 'Pagado tarde',
  parcial: 'Parcial',
  no_pago: 'No pagó',
  adelantado: 'Adelantado',
  proximo: 'Próximo',
  en_curso: 'Día en curso',
}

const ETIQUETA_ESTADO_SEMANA: Record<EstadoSemanaB1, string> = {
  completa: 'Completa',
  parcial: 'Incompleta',
  sin_pago: 'Sin adelantos',
  en_curso: 'En curso',
  sin_dias: 'Sin días',
}

/** Marca corta de una semana anterior: completa, pagó una parte o no adelantó nada. */
const MARCA_SEMANA: Record<EstadoSemanaB1, string> = {
  completa: '✓', parcial: '◐', sin_pago: '✗', en_curso: '·', sin_dias: '·',
}

const ETIQUETA_ORIGEN: Record<PagoB1['origen'], string> = {
  auto: 'Cresium',
  cresium: 'Cresium (a mano)',
  manual: 'Manual',
}

/** Etiqueta corta para la lista de pagos del día (la cuenta va en otra línea). */
const ORIGEN_CORTO: Record<PagoB1['origen'], string> = {
  auto: 'Cresium',
  cresium: 'Cresium · a mano',
  manual: 'Manual',
}

function diaSemana(fecha: string): string {
  const texto = new Date(`${fecha}T12:00:00Z`).toLocaleDateString('es-AR', { weekday: 'short', timeZone: 'UTC' })
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace('.', '')
}

type Semaforo = 'verde' | 'amarillo' | 'rojo'

/** Días de esta semana que no adelantó (un pago parcial cuenta como día sin adelantar). */
function diasSinAdelantar(r: ResumenB1): number {
  return Math.ceil(Math.round(r.faltante) / PROMO_B1_PAGO_DIARIO)
}

/** "Falta 1 día" / "Faltan 3 días". */
function textoFaltan(dias: number): string {
  return dias === 1 ? 'Falta 1 día' : `Faltan ${dias} días`
}

/** Semáforo de la semana actual: verde al día, amarillo falta 1 día, rojo faltan 2 o más. */
function semaforo(r: ResumenB1): Semaforo {
  const dias = diasSinAdelantar(r)
  return dias === 0 ? 'verde' : dias === 1 ? 'amarillo' : 'rojo'
}

/** Colores del semáforo: raya al inicio de la fila y nombre del conductor (como Leads). */
const COLOR_SEMAFORO: Record<Semaforo, { raya: string; texto: string }> = {
  verde: { raya: '#16a34a', texto: '#15803d' },
  amarillo: { raya: '#f59e0b', texto: '#b45309' },
  rojo: { raya: 'var(--color-primary)', texto: 'var(--badge-red-text)' },
}

const TITULO_SEMAFORO: Record<Semaforo, string> = {
  verde: 'Al día: adelantó todos los días de esta semana',
  amarillo: 'Esta semana le falta adelantar 1 día',
  rojo: 'Esta semana le faltan adelantar 2 días o más',
}

/**
 * Estado de una semana de un conductor de baja: la de la baja ya no está "en curso" (no paga
 * más días), así que se muestra como cerrada con lo que llegó a adelantar.
 */
function estadoSemanaHistorial(sem: SemanaB1): EstadoSemanaB1 {
  if (sem.estado !== 'en_curso') return sem.estado
  if (sem.diasVencidos === 0) return 'sin_dias'
  return sem.faltante === 0 ? 'completa' : sem.pagado > 0 ? 'parcial' : 'sin_pago'
}

/** Columna que se filtra por el valor que muestra la celda (lista). */
type ColumnaValor = 'dias' | 'anteriores'

const FILTROS_VALOR_VACIOS: Record<ColumnaValor, string[]> = { dias: [], anteriores: [] }

const ETIQUETA_COLUMNA: Record<ColumnaValor, string> = { dias: 'Días Pagados', anteriores: 'Semanas anteriores' }

/** Semanas anteriores (cerradas) con días para adelantar. */
function semanasAnteriores(r: ResumenB1): SemanaB1[] {
  return r.semanas.filter(s => !s.esActual && s.diasVencidos > 0 && s.lunes < lunesDe(hoyART()))
}

/** Valor de la columna tal como se ve (es la opción del filtro). */
function valorColumna(f: FilaB1, col: ColumnaValor): string {
  if (col === 'dias') return `${f.resumen.diasPagados} de ${f.resumen.diasVencidos}`
  if (semanasAnteriores(f.resumen).length === 0) return 'Sin semanas anteriores'
  return f.resumen.semanasIncompletas > 0 ? 'Con semanas incompletas' : 'Todas completas'
}

/** Orden de las opciones de cada filtro. */
function ordenValor(f: FilaB1, col: ColumnaValor): number | string {
  return col === 'dias' ? f.resumen.diasPagados * 10000 + f.resumen.diasVencidos : valorColumna(f, col)
}

/** Columnas de fecha con filtro de rango. */
type ColumnaFecha = 'desde' | 'hasta' | 'baja'
type RangoFecha = { inicio: string | null; fin: string | null }
const RANGOS_FECHA_VACIOS: Record<ColumnaFecha, RangoFecha> = {
  desde: { inicio: null, fin: null }, hasta: { inicio: null, fin: null }, baja: { inicio: null, fin: null },
}
const ETIQUETA_FECHA: Record<ColumnaFecha, string> = { desde: 'Inicio', hasta: 'Hasta', baja: 'Fecha de baja' }
const fechaDeFila = (f: FilaB1, col: ColumnaFecha) => (col === 'desde' ? f.ingreso : col === 'hasta' ? f.pagaHasta : f.fechaBaja || '')

/** Día de la semana corto para la columna de inicio ("desde el vie 21/11"). */
const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** Columnas de monto con filtro de rango. */
type ColumnaMonto = 'pagado' | 'falta'
type RangoMonto = { min: number | null; max: number | null }
const RANGOS_MONTO_VACIOS: Record<ColumnaMonto, RangoMonto> = {
  pagado: { min: null, max: null }, falta: { min: null, max: null },
}
const ETIQUETA_MONTO: Record<ColumnaMonto, string> = { pagado: 'Pagado', falta: 'Falta adelantar' }
const montoDeFila = (f: FilaB1, col: ColumnaMonto) => (col === 'pagado' ? f.resumen.pagadoSemana : f.resumen.faltante)

/** Estado de la fila para el filtro de la columna Estado. */
function estadoFila(r: ResumenB1): string {
  if (r.diasVencidos === 0) return 'sin_dias'
  return semaforo(r) === 'verde' ? 'al_dia' : semaforo(r) === 'amarillo' ? 'un_dia' : 'faltan'
}

const OPCIONES_ESTADO = [
  { value: 'al_dia', label: 'Al día' },
  { value: 'un_dia', label: 'Falta 1 día' },
  { value: 'faltan', label: 'Faltan 2+ días' },
  { value: 'sin_dias', label: 'Sin días aún' },
]

/**
 * Depósito de Cresium que quedó como registro 'cresium' en la prueba del paso de los pagos B1
 * al saldo (25/11/2026 21:58, created_by_name 'Automático'): nadie lo asignó a mano, así que
 * se muestra como Cresium y no como "a mano".
 */
function esPaseDePrueba(p: PagoB1): boolean {
  return p.origen === 'cresium' && p.cargadoPor === 'Automático'
}

/** Clase de color y etiqueta corta del origen (lista de pagos del día). */
function origenDeLista(p: PagoB1): { clase: PagoB1['origen']; texto: string } {
  return esPaseDePrueba(p) ? { clase: 'auto', texto: 'Cresium' } : { clase: p.origen, texto: ORIGEN_CORTO[p.origen] }
}

function origenPago(p: PagoB1): string {
  const empresa = p.empresa ? ` ${ETIQUETA_EMPRESA_CRESIUM[p.empresa] || p.empresa}` : ''
  if (esPaseDePrueba(p)) return `Cresium${empresa}`
  return `${ETIQUETA_ORIGEN[p.origen]}${p.origen === 'manual' ? '' : empresa}`
}

/** Quién lo cargó, como texto corto para la lista de pagos del día. */
function cargadoPorCorto(p: PagoB1): string {
  if (p.origen === 'auto') return 'Automático'
  if (esPaseDePrueba(p)) return 'Pasado al saldo (prueba)'
  return p.cargadoPor || '-'
}


export function LicenciaB1Tab() {
  const { sedeActualId, aplicarFiltroSede } = useSede()

  const [promo, setPromo] = useState<PromoB1 | null>(null)
  const [filas, setFilas] = useState<FilaB1[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [vista, setVista] = useState<Vista>('activos')
  // Filtros de columna tipo Excel (como Saldos)
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])
  // Días pagados / Semanas anteriores: lista de valores. Desde / Hasta: rango de fechas.
  // Pagado / Falta adelantar: rango de montos.
  const [filtrosValor, setFiltrosValor] = useState<Record<ColumnaValor, string[]>>(FILTROS_VALOR_VACIOS)
  const [rangosFecha, setRangosFecha] = useState<Record<ColumnaFecha, RangoFecha>>(RANGOS_FECHA_VACIOS)
  const [rangosMonto, setRangosMonto] = useState<Record<ColumnaMonto, RangoMonto>>(RANGOS_MONTO_VACIOS)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  /** Semana elegida en el modal (lunes yyyy-MM-dd) o 'actual'. */
  const [semanaSel, setSemanaSel] = useState<string>('actual')
  /** Día cuyo modal "Registros del día" está abierto (yyyy-MM-dd). */
  const [diaVer, setDiaVer] = useState<string | null>(null)

  // Detalle de un pago (solo consulta)
  const [pagoVer, setPagoVer] = useState<PagoB1 | null>(null)

  // Última vez que la sincronización guardó movimientos de Cresium (se muestra fijo abajo)
  const [cresiumActualizado, setCresiumActualizado] = useState<string | null>(null)

  const cargarCresiumActualizado = useCallback(async () => {
    try {
      const { data, error: err } = await (supabase.from('cresium_movimientos') as any)
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (err) throw err
      setCresiumActualizado(data?.updated_at ?? null)
    } catch (err) {
      console.error('No se pudo leer la última actualización de Cresium:', err)
    }
  }, [])

  const cargar = useCallback(async ({ silencioso = false }: { silencioso?: boolean } = {}) => {
    if (!silencioso) setLoading(true)
    setError(null)
    void cargarCresiumActualizado()
    try {
      // Misma carga que usa Saldos para mostrar estos pagos (licenciaB1Service)
      const { promo: p, filas: lista } = await cargarConductoresLicenciaB1(aplicarFiltroSede)
      setPromo(p)
      setFilas(lista)
    } catch (err) {
      console.error('Error cargando Licencia B1:', err)
      setPromo(null)
      setFilas([])
      setError(err instanceof Error ? err.message : 'No se pudo cargar la pestaña')
    } finally {
      setLoading(false)
    }
  }, [aplicarFiltroSede, cargarCresiumActualizado])

  useEffect(() => {
    cargar()
  }, [cargar, sedeActualId])

  // Activos: sin los dados de baja. Bajas: los dados de baja, solo para consultar su historial.
  const activos = useMemo(() => filas.filter(f => !f.esBaja), [filas])
  const bajas = useMemo(() => filas.filter(f => f.esBaja), [filas])
  const filasVista = vista === 'activos' ? activos : bajas

  const stats = useMemo(() => ({
    total: activos.length,
    alDia: activos.filter(f => semaforo(f.resumen) === 'verde').length,
    unDia: activos.filter(f => semaforo(f.resumen) === 'amarillo').length,
    faltan: activos.filter(f => semaforo(f.resumen) === 'rojo').length,
    cobrado: filas.reduce((s, f) => s + f.resumen.totalPagado, 0),
    bajas: bajas.length,
  }), [filas, activos, bajas])

  // Métricas de Bajas: de la promoción B1, solo los conductores de baja de la sede. Se toman
  // las semanas hasta la de la baja (lo adelantado y los días que tenía que adelantar).
  const statsBajas = useMemo(() => {
    let adelantado = 0
    let diasAdelantados = 0
    let diasAAdelantar = 0
    let sinAdelantos = 0
    for (const f of bajas) {
      const lunesFin = lunesDe(f.pagaHasta)
      let adelantadoConductor = 0
      for (const s of f.resumen.semanas) {
        if (s.lunes > lunesFin) continue
        adelantadoConductor += s.pagado
        diasAdelantados += s.diasPagados
        diasAAdelantar += s.diasVencidos
      }
      adelantado += adelantadoConductor
      if (adelantadoConductor <= 0) sinAdelantos++
    }
    return { total: bajas.length, adelantado, diasAdelantados, diasAAdelantar, sinAdelantos }
  }, [bajas])

  function limpiarFiltrosColumna() {
    setConductorFilter([]); setEstadoFilter([]); setFiltrosValor(FILTROS_VALOR_VACIOS)
    setRangosFecha(RANGOS_FECHA_VACIOS); setRangosMonto(RANGOS_MONTO_VACIOS)
  }

  /** Cambia entre Activos y Bajas (los filtros de columna son de cada tabla). */
  function cambiarVista(v: Vista) {
    if (v === vista) return
    limpiarFiltrosColumna()
    setOpenColumnFilter(null)
    setVista(v)
  }

  /** Tarjeta de arriba: cambia a Activos con ese filtro. */
  function elegirTarjeta(f: Filtro) {
    cambiarVista('activos')
    setFiltro(f)
  }

  const conductoresUnicos = useMemo(() =>
    [...new Set(filasVista.map(f => formatNombreCompleto(f.nombre)).filter(Boolean))].sort()
  , [filasVista])

  // Opciones de cada filtro de valor (sin repetir, ordenadas por fecha / monto)
  const opcionesValor = useMemo(() => {
    const res = {} as Record<ColumnaValor, string[]>
    for (const col of Object.keys(FILTROS_VALOR_VACIOS) as ColumnaValor[]) {
      const vistos = new Map<string, number | string>()
      for (const f of filasVista) {
        const v = valorColumna(f, col)
        if (!vistos.has(v)) vistos.set(v, ordenValor(f, col))
      }
      res[col] = [...vistos.entries()]
        .sort((a, b) => (typeof a[1] === 'number' && typeof b[1] === 'number' ? a[1] - b[1] : String(a[1]).localeCompare(String(b[1]))))
        .map(([v]) => v)
    }
    return res
  }, [filasVista])

  const filtradas = useMemo(() => filasVista.filter(f => {
    const color = semaforo(f.resumen)
    // Tarjetas de arriba (solo en Activos)
    if (vista === 'activos') {
      if (filtro === 'al_dia' && color !== 'verde') return false
      if (filtro === 'un_dia' && color !== 'amarillo') return false
      if (filtro === 'faltan' && color !== 'rojo') return false
    }
    // Filtros de columna
    if (conductorFilter.length > 0 && !conductorFilter.includes(formatNombreCompleto(f.nombre))) return false
    if (estadoFilter.length > 0 && !estadoFilter.includes(estadoFila(f.resumen))) return false
    for (const col of Object.keys(filtrosValor) as ColumnaValor[]) {
      if (filtrosValor[col].length > 0 && !filtrosValor[col].includes(valorColumna(f, col))) return false
    }
    for (const col of Object.keys(rangosFecha) as ColumnaFecha[]) {
      const { inicio, fin } = rangosFecha[col]
      const fecha = fechaDeFila(f, col)
      if (inicio && fecha < inicio) return false
      if (fin && fecha > fin) return false
    }
    for (const col of Object.keys(rangosMonto) as ColumnaMonto[]) {
      const { min, max } = rangosMonto[col]
      const monto = montoDeFila(f, col)
      if (min !== null && monto < min) return false
      if (max !== null && monto > max) return false
    }
    return true
  })
    // Por inicio de asignación, del más reciente al más viejo (mismo día: por nombre).
    // Clic en un encabezado ordena por esa columna.
    .sort((a, b) => b.ingreso.localeCompare(a.ingreso) || a.nombre.localeCompare(b.nombre)),
  [filasVista, vista, filtro, conductorFilter, estadoFilter, filtrosValor, rangosFecha, rangosMonto])

  /** Encabezado con filtro de rango de fechas (Desde / Hasta). */
  const encabezadoFecha = (col: ColumnaFecha) => (
    <ExcelDateRangeFilter
      label={ETIQUETA_FECHA[col]}
      startDate={rangosFecha[col].inicio}
      endDate={rangosFecha[col].fin}
      onRangeChange={(inicio, fin) => setRangosFecha(prev => ({ ...prev, [col]: { inicio, fin } }))}
      filterId={`lb1_${col}`}
      openFilterId={openColumnFilter}
      onOpenChange={setOpenColumnFilter}
      mostrarIndicador={false}
    />
  )

  /** Encabezado con filtro de rango de montos (Pagado / Falta adelantar). */
  const encabezadoMonto = (col: ColumnaMonto) => (
    <ExcelNumberRangeFilter
      label={ETIQUETA_MONTO[col]}
      min={rangosMonto[col].min}
      max={rangosMonto[col].max}
      onRangeChange={(min, max) => setRangosMonto(prev => ({ ...prev, [col]: { min, max } }))}
      filterId={`lb1_${col}`}
      openFilterId={openColumnFilter}
      onOpenChange={setOpenColumnFilter}
      esMonto
    />
  )

  // Filtros activos: la tabla los muestra debajo del buscador (como Leads y Conductores)
  const filtrosActivos = [
    ...conductorFilter.map(v => ({ id: `conductor-${v}`, label: `Conductor: ${v}`, onClear: () => setConductorFilter(prev => prev.filter(x => x !== v)) })),
    ...estadoFilter.map(v => ({
      id: `estado-${v}`,
      label: `Estado: ${OPCIONES_ESTADO.find(o => o.value === v)?.label || v}`,
      onClear: () => setEstadoFilter(prev => prev.filter(x => x !== v)),
    })),
    ...(Object.keys(filtrosValor) as ColumnaValor[]).flatMap(col => filtrosValor[col].map(v => ({
      id: `${col}-${v}`,
      label: `${ETIQUETA_COLUMNA[col]}: ${v}`,
      onClear: () => setFiltrosValor(prev => ({ ...prev, [col]: prev[col].filter(x => x !== v) })),
    }))),
    ...(Object.keys(rangosFecha) as ColumnaFecha[]).filter(col => rangosFecha[col].inicio || rangosFecha[col].fin).map(col => {
      const { inicio, fin } = rangosFecha[col]
      const texto = inicio && fin ? `${formatFecha(inicio)} - ${formatFecha(fin)}` : inicio ? `desde ${formatFecha(inicio)}` : `hasta ${formatFecha(fin)}`
      return { id: `fecha-${col}`, label: `${ETIQUETA_FECHA[col]}: ${texto}`, onClear: () => setRangosFecha(prev => ({ ...prev, [col]: { inicio: null, fin: null } })) }
    }),
    ...(Object.keys(rangosMonto) as ColumnaMonto[]).filter(col => rangosMonto[col].min !== null || rangosMonto[col].max !== null).map(col => {
      const { min, max } = rangosMonto[col]
      const texto = min !== null && max !== null ? `${formatCurrency(min)} - ${formatCurrency(max)}`
        : min !== null ? `desde ${formatCurrency(min)}` : `hasta ${formatCurrency(max ?? 0)}`
      return { id: `monto-${col}`, label: `${ETIQUETA_MONTO[col]}: ${texto}`, onClear: () => setRangosMonto(prev => ({ ...prev, [col]: { min: null, max: null } })) }
    }),
  ]

  /** Encabezado con filtro tipo Excel para una columna de valor. */
  const encabezadoValor = (col: ColumnaValor) => (
    <ExcelColumnFilter
      label={ETIQUETA_COLUMNA[col]}
      options={opcionesValor[col]}
      selectedValues={filtrosValor[col]}
      onSelectionChange={vals => setFiltrosValor(prev => ({ ...prev, [col]: vals }))}
      filterId={`lb1_${col}`}
      openFilterId={openColumnFilter}
      onOpenChange={setOpenColumnFilter}
    />
  )

  const detalle = filas.find(f => f.id === detalleId) || null
  // De baja: el modal es solo historial (sin detalle por día); sirve de referencia si vuelve
  const esHistorial = !!detalle?.esBaja
  const estadoSemana = (sem: SemanaB1): EstadoSemanaB1 => (esHistorial ? estadoSemanaHistorial(sem) : sem.estado)
  const lunesBaja = detalle?.fechaBaja ? lunesDe(detalle.fechaBaja) : null

  // Mismo formato que la tabla de Saldos: filtros tipo Excel, ⓘ de ayuda, letras y badges fact-*
  // Encabezados con filtro: las columnas los leen de esta ref. Así las columnas no se
  // vuelven a crear al cambiar un filtro y el desplegable no se vuelve a montar (antes, al
  // escribir en "Hasta" del rango de montos, el foco saltaba a "Desde").
  const encabezados = {
    conductor: (
      <ExcelColumnFilter
        label="Conductor"
        options={conductoresUnicos}
        selectedValues={conductorFilter}
        onSelectionChange={setConductorFilter}
        filterId="lb1_conductor"
        openFilterId={openColumnFilter}
        onOpenChange={setOpenColumnFilter}
      />
    ),
    estado: (
      <ExcelColumnFilter
        label="Estado"
        options={OPCIONES_ESTADO}
        selectedValues={estadoFilter}
        onSelectionChange={setEstadoFilter}
        filterId="lb1_estado"
        openFilterId={openColumnFilter}
        onOpenChange={setOpenColumnFilter}
      />
    ),
    desde: encabezadoFecha('desde'),
    hasta: encabezadoFecha('hasta'),
    baja: encabezadoFecha('baja'),
    dias: encabezadoValor('dias'),
    anteriores: encabezadoValor('anteriores'),
    pagado: encabezadoMonto('pagado'),
    falta: encabezadoMonto('falta'),
  }
  const encabezadosRef = useRef(encabezados)
  encabezadosRef.current = encabezados

  const columnasActivos = useMemo<ColumnDef<FilaB1, unknown>[]>(() => [
    {
      id: 'conductor',
      accessorFn: f => formatNombreCompleto(f.nombre),
      meta: { info: 'Conductor y su CUIT o DNI. La raya de color es el semáforo de esta semana: verde adelantó todo, ámbar le falta 1 día, rojo le faltan 2 o más.' },
      header: () => encabezadosRef.current.conductor,
      cell: ({ row }) => {
        const color = semaforo(row.original.resumen)
        return (
          // Raya del semáforo a la izquierda y nombre en ese color (formato de Leads)
          <div title={TITULO_SEMAFORO[color]} style={{ padding: '4px 8px', borderLeft: `3px solid ${COLOR_SEMAFORO[color].raya}`, borderRadius: 'var(--radius-sm)' }}>
            {/* Nombre en el color del semáforo, como el lead en Leads */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: COLOR_SEMAFORO[color].texto }}>
              {formatNombreCompleto(row.original.nombre)}
              <LicenciaBadge categoria={row.original.categoria} otra={row.original.categoriaOtra} size="xs" />
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{row.original.cuit || row.original.dni}</div>
          </div>
        )
      },
    },
    {
      id: 'ingreso',
      accessorKey: 'ingreso',
      meta: { info: 'Cuándo empezó su asignación (o el reingreso) dentro de la habilitación B1: semana y día. Desde ese día paga $15.000 por día. Hasta cuándo paga está en la (i) de la pestaña.' },
      header: () => encabezadosRef.current.desde,
      cell: ({ row }) => {
        const f = row.original
        const sem = semanaISO(f.ingreso)
        // Debajo, solo lo que cambia la cuenta: reingreso o D1 ya obtenida (la baja tiene su
        // propia columna en Bajas)
        const nota = f.motivoHasta === 'd1'
          ? `Con D1: pagó hasta ${formatFecha(f.pagaHasta).slice(0, 5)}`
          : f.esReingreso ? 'Reingreso' : null
        return (
          <div>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>Semana {sem.semana}</span>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
              desde el {DIA_CORTO[new Date(`${f.ingreso}T12:00:00Z`).getUTCDay()]} {formatFecha(f.ingreso).slice(0, 5)}
            </div>
            {nota && <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{nota}</div>}
          </div>
        )
      },
    },
    {
      id: 'pagado',
      meta: { info: 'Lo adelantado esta semana (pagos con fecha de lunes a domingo): depósitos de Cresium y pagos cargados a mano. Resta en la facturación de la semana.' },
      header: () => encabezadosRef.current.pagado,
      accessorFn: f => f.resumen.pagadoSemana,
      cell: ({ row }) => (
        <span className="fact-precio" style={{ fontWeight: 700 }} title={`Total pagado en B1: ${formatCurrency(row.original.resumen.totalPagado)}`}>
          {formatCurrency(row.original.resumen.pagadoSemana)}
        </span>
      ),
    },
    {
      id: 'falta',
      meta: { info: 'Lo que no adelantó esta semana de los días cerrados. No es deuda: se cobra igual en la facturación de la semana. Si adelantó de más, se ve en verde.' },
      header: () => encabezadosRef.current.falta,
      accessorFn: f => f.resumen.faltante,
      cell: ({ row }) => {
        const r = row.original.resumen
        if (r.faltante > 0) return <span className="fact-precio" style={{ fontWeight: 700, color: '#b45309' }}>{formatCurrency(r.faltante)}</span>
        if (r.adelantado > 0) {
          return <span className="fact-precio" style={{ fontWeight: 700, color: '#16a34a' }} title="Adelantó de más: cubre los días que siguen de la semana">+{formatCurrency(r.adelantado)}</span>
        }
        return <span className="fact-precio" style={{ fontWeight: 700 }}>{formatCurrency(0)}</span>
      },
    },
    {
      id: 'estado',
      accessorFn: f => estadoFila(f.resumen),
      meta: { info: 'Esta semana: al día (verde), falta 1 día (ámbar) o faltan 2 o más días (rojo), y cuántos días pagó de los que ya tenía que adelantar. Solo cuentan los días cerrados (hoy no cuenta hasta que termina). Cada lunes empieza de cero.' },
      header: () => encabezadosRef.current.estado,
      cell: ({ row }) => {
        const r = row.original.resumen
        if (r.diasVencidos === 0) return <span className="fact-badge fact-badge-gray">Sin días aún</span>
        const color = semaforo(r)
        const dias = diasSinAdelantar(r)
        const clase = color === 'verde' ? 'fact-badge-green' : color === 'amarillo' ? 'fact-badge-yellow' : 'fact-badge-red'
        // Debajo, los días pagados (antes era una columna aparte que repetía lo mismo)
        return (
          <div>
            <span className={`fact-badge ${clase}`} title={TITULO_SEMAFORO[color]}>
              {dias === 0 ? 'Al día' : textoFaltan(dias)}
            </span>
            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
              {r.diasPagados} de {r.diasVencidos} {r.diasVencidos === 1 ? 'día pagado' : 'días pagados'}
            </div>
          </div>
        )
      },
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="fact-table-actions" style={{ justifyContent: 'center' }}>
          <button
            className="fact-table-btn fact-table-btn-view"
            onClick={() => { setSemanaSel('actual'); setDiaVer(null); setDetalleId(row.original.id) }}
            data-tooltip="Ver pagos por día"
          >
            <Eye size={14} />
          </button>
        </div>
      ),
      enableSorting: false,
    },
  ], [])

  // Bajas (solo consulta): conductor, fecha y motivo de la baja, lo adelantado y sus semanas
  const columnasBajas = useMemo<ColumnDef<FilaB1, unknown>[]>(() => {
    const deActivos = (id: string) => columnasActivos.find(c => c.id === id)!
    return [
      {
        ...deActivos('conductor'),
        meta: { info: 'Conductor dado de baja y su CUIT o DNI.' },
        cell: ({ row }) => (
          <div style={{ padding: '4px 8px', borderLeft: '3px solid var(--border-primary)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {formatNombreCompleto(row.original.nombre)}
              <LicenciaBadge categoria={row.original.categoria} otra={row.original.categoriaOtra} size="xs" />
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{row.original.cuit || row.original.dni}</div>
          </div>
        ),
      },
      deActivos('ingreso'),
      {
        id: 'fechaBaja',
        accessorFn: f => f.fechaBaja || '',
        meta: { info: 'Fecha de baja del conductor. Adelanta por día solo hasta ese día.' },
        header: () => encabezadosRef.current.baja,
        cell: ({ row }) => (
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {row.original.fechaBaja ? formatFecha(row.original.fechaBaja) : '-'}
          </span>
        ),
      },
      {
        id: 'motivoBaja',
        accessorFn: f => f.motivoBaja || '',
        header: 'Motivo',
        meta: { info: 'Motivo de baja cargado en el conductor.' },
        cell: ({ row }) => (
          <span className="lb1-motivo" title={row.original.motivoBaja || ''}>{row.original.motivoBaja || '-'}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'pagadoTotal',
        accessorFn: f => f.resumen.totalPagado,
        header: 'Pagado',
        meta: { info: 'Total adelantado en B1.' },
        cell: ({ row }) => <span className="fact-precio" style={{ fontWeight: 700 }}>{formatCurrency(row.original.resumen.totalPagado)}</span>,
      },
      deActivos('acciones'),
    ]
  }, [columnasActivos])

  // Semanas del modal: días que paga + días con pagos fuera de esos días
  const semanas = useMemo(() => {
    if (!detalle) return []
    const porFecha = new Map<string, DiaB1 | null>()
    for (const d of detalle.resumen.dias) porFecha.set(d.fecha, d)
    for (const p of detalle.pagos) if (!porFecha.has(p.fecha)) porFecha.set(p.fecha, null)
    const pagosPorFecha = new Map<string, PagoB1[]>()
    for (const p of detalle.pagos) pagosPorFecha.set(p.fecha, [...(pagosPorFecha.get(p.fecha) || []), p])

    const grupos = new Map<string, Array<{ fecha: string; dia: DiaB1 | null; pagos: PagoB1[] }>>()
    for (const fecha of [...porFecha.keys()].sort()) {
      const lunes = lunesDe(fecha)
      grupos.set(lunes, [...(grupos.get(lunes) || []), { fecha, dia: porFecha.get(fecha) ?? null, pagos: pagosPorFecha.get(fecha) || [] }])
    }
    return [...grupos.entries()].map(([lunes, filasDia]) => ({
      lunes,
      domingo: sumarDiasISO(lunes, 6),
      numero: getISOWeek(new Date(`${lunes}T12:00:00`)),
      filas: filasDia,
    })).reverse()
  }, [detalle])

  // Semana que se muestra (siempre una): la elegida; 'actual' = la de hoy (o la última con datos)
  const lunesHoy = lunesDe(hoyART())
  const semanaMostrada = semanaSel === 'actual' || !semanas.some(s => s.lunes === semanaSel)
    ? (semanas.find(s => s.lunes === lunesHoy)?.lunes ?? semanas[0]?.lunes ?? '')
    : semanaSel
  const semanasVisibles = semanas.filter(s => s.lunes === semanaMostrada)

  // Totales de la semana que se ve en el modal del conductor (días cerrados)
  const semanaResumen = detalle?.resumen.semanas.find(sem => sem.lunes === semanaMostrada) || null
  const filaDiaVer = diaVer ? semanas.flatMap(sem => sem.filas).find(f => f.fecha === diaVer) || null : null

  return (
    <div className="lb1">
      {promo && !promo.activa && (
        <div className="lb1-aviso">
          <AlertTriangle size={15} />
          La habilitación B1 está desactivada en Parámetros &gt; Promociones: la factura no muestra la línea Licencia B1 hasta activarla.
        </div>
      )}

      <TabsBar<Vista>
        tabs={[
          { id: 'activos', label: 'Activos', icon: Users, count: activos.length },
          {
            id: 'bajas', label: 'Bajas', icon: UserX, count: stats.bajas,
            countTitle: 'Conductores B1 dados de baja (solo para consultar)',
          },
        ]}
        active={vista}
        onChange={cambiarVista}
        className="tabs-bar--modal lb1-vistas"
        ariaLabel="Conductores B1"
      />

      {/* Stats (mismo formato que Saldos). Activos: cada tarjeta filtra la tabla. Bajas: métricas propias. */}
      <div className="fact-stats">
        {vista === 'bajas' ? (
          <StatsGrid key="bajas" className="fact-stats-grid" storageKey="LicenciaB1TabBajas">
            <div className="fact-stat-card" title="Conductores B1 dados de baja">
              <UserX size={18} className="fact-stat-icon" />
              <div className="fact-stat-content">
                <span className="fact-stat-value">{statsBajas.total}</span>
                <span className="fact-stat-label">Conductores B1 de baja</span>
              </div>
            </div>
            <div className="fact-stat-card" title="Lo que adelantaron en B1 hasta la semana de la baja (todos sumados)">
              <Wallet size={18} className="fact-stat-icon" style={{ color: '#16a34a' }} />
              <div className="fact-stat-content">
                <span className="fact-stat-value">{formatCurrency(statsBajas.adelantado)}</span>
                <span className="fact-stat-label">Total adelantado</span>
              </div>
            </div>
            <div className="fact-stat-card" title="Días adelantados sobre los días que tenían que adelantar hasta la baja (todos sumados)">
              <CalendarCheck size={18} className="fact-stat-icon" />
              <div className="fact-stat-content">
                <span className="fact-stat-value">{statsBajas.diasAdelantados} de {statsBajas.diasAAdelantar} días</span>
                <span className="fact-stat-label">Días adelantados</span>
              </div>
            </div>
            <div className="fact-stat-card" title="Se dieron de baja sin haber adelantado nunca">
              <AlertTriangle size={18} className="fact-stat-icon" style={{ color: '#dc2626' }} />
              <div className="fact-stat-content">
                <span className="fact-stat-value">{statsBajas.sinAdelantos}</span>
                <span className="fact-stat-label">Sin ningún adelanto</span>
              </div>
            </div>
          </StatsGrid>
        ) : (
        <StatsGrid key="activos" className="fact-stats-grid" storageKey="LicenciaB1Tab">
          <div className={`fact-stat-card lb1-stat ${vista === 'activos' && filtro === 'todos' ? 'lb1-stat-activa' : ''}`} onClick={() => elegirTarjeta('todos')}>
            <Users size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.total}</span>
              <span className="fact-stat-label">Conductores B1</span>
            </div>
          </div>
          <div className={`fact-stat-card lb1-stat ${vista === 'activos' && filtro === 'al_dia' ? 'lb1-stat-activa' : ''}`} onClick={() => elegirTarjeta('al_dia')}>
            <CheckCircle size={18} className="fact-stat-icon" style={{ color: '#16a34a' }} />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.alDia}</span>
              <span className="fact-stat-label">Al día</span>
            </div>
          </div>
          <div className={`fact-stat-card lb1-stat ${vista === 'activos' && filtro === 'un_dia' ? 'lb1-stat-activa' : ''}`} onClick={() => elegirTarjeta('un_dia')}>
            <AlertTriangle size={18} className="fact-stat-icon" style={{ color: '#d97706' }} />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.unDia}</span>
              <span className="fact-stat-label">Falta 1 día</span>
            </div>
          </div>
          <div className={`fact-stat-card lb1-stat ${vista === 'activos' && filtro === 'faltan' ? 'lb1-stat-activa' : ''}`} onClick={() => elegirTarjeta('faltan')}>
            <AlertTriangle size={18} className="fact-stat-icon" style={{ color: '#dc2626' }} />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.faltan}</span>
              <span className="fact-stat-label">Faltan 2+ días</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <Wallet size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.cobrado)}</span>
              <span className="fact-stat-label">Total Pagado</span>
            </div>
          </div>
        </StatsGrid>
        )}
      </div>


      <DataTable
        key={vista}
        data={filtradas}
        columns={vista === 'activos' ? columnasActivos : columnasBajas}
        loading={loading}
        error={error}
        pageSize={100}
        pageSizeOptions={[10, 20, 50, 100]}
        // Conductor y Desde quedan fijas al desplazar la tabla a la derecha
        stickyLeftColumns={2}
        searchPlaceholder="Buscar conductor..."
        externalFilters={filtrosActivos}
        // Con filtros puestos, aunque no quede ninguna fila se ve la tabla (para poder cambiarlos)
        mostrarTablaSinDatos={filtrosActivos.length > 0 || (vista === 'activos' && filtro !== 'todos')}
        onClearAllFilters={limpiarFiltrosColumna}
        emptyIcon={vista === 'activos' ? <Wallet size={48} /> : <UserX size={48} />}
        emptyTitle={vista === 'activos' ? 'Sin conductores con B1' : 'Sin bajas'}
        emptyDescription={vista === 'activos'
          ? 'Aparecen los conductores con licencia B1 que ingresaron o reingresaron dentro de la habilitación B1'
          : 'Aparecen los conductores B1 que se dieron de baja'}
      />

      {/* Modal del conductor: mismo diseño que "Control de Saldos" */}
      {detalle && (
        <div className="fact-modal-overlay" onClick={() => !pagoVer && !diaVer && setDetalleId(null)}>
          <div className="fact-modal-content lb1-modal" style={{ maxWidth: '1100px' }} onClick={e => e.stopPropagation()}>
            <div className="fact-modal-header">
              <h2>Pagos Licencia B1{esHistorial ? ' · Historial' : ''}</h2>
              <button className="fact-modal-close" onClick={() => setDetalleId(null)}><X size={20} /></button>
            </div>
            <div className="fact-modal-body" style={{ padding: '16px' }}>
              {/* Info del conductor */}
              <div className="lb1-hero">
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {formatNombreCompleto(detalle.nombre)}
                    <LicenciaBadge categoria={detalle.categoria} otra={detalle.categoriaOtra} size="sm" />
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    DNI: {detalle.dni || '-'} &middot; CUIT: {detalle.cuit || 'sin cargar'}
                    {' '}&middot; Desde: <strong>{formatFecha(detalle.ingreso)}</strong>{detalle.esReingreso ? ' (reingreso)' : ''}
                    {detalle.motivoHasta !== 'baja' && <>{' '}&middot; Hasta: <strong>{formatFecha(detalle.pagaHasta)}</strong></>}
                    {esHistorial ? (
                      <>
                        {' '}&middot; Días pagados:{' '}
                        <strong>
                          {detalle.resumen.semanas.reduce((n, s) => n + s.diasPagados, 0)} de {detalle.resumen.semanas.reduce((n, s) => n + s.diasVencidos, 0)}
                        </strong>
                      </>
                    ) : null}
                  </div>
                  {detalle.esBaja && (
                    <div className="lb1-baja-info">
                      <span className="lb1-baja-etiqueta">Baja {detalle.fechaBaja ? formatFecha(detalle.fechaBaja) : 'sin fecha'}</span>
                      {detalle.motivoBaja && <> &middot; {detalle.motivoBaja}</>}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '3px' }}>Total pagado en B1</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1, color: detalle.resumen.totalPagado > 0 ? '#16a34a' : 'var(--text-primary)' }}>
                    {formatCurrency(detalle.resumen.totalPagado)}
                  </div>
                </div>
              </div>

              {/* Activos: se elige la semana (la actual de entrada) y se ve solo esa, así la tabla
                  no crece con las semanas. De baja (historial): todas las semanas. */}
              {!esHistorial && semanas.length > 0 && (
                <div className="lb1-barra">
                  <select className="lb1-barra-select" value={semanaMostrada} onChange={e => setSemanaSel(e.target.value)} title="Semana a mostrar">
                    {semanas.map(sem => (
                      <option key={sem.lunes} value={sem.lunes}>
                        {sem.lunes.slice(0, 4)} S{String(sem.numero).padStart(2, '0')} · {formatFecha(sem.lunes).slice(0, 5)} al {formatFecha(sem.domingo).slice(0, 5)}
                        {sem.lunes === lunesHoy ? ' (actual)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {detalle.resumen.semanas.length > 0 && (
                <div className="lb1-kardex lb1-semanas">
                  <table>
                    <thead>
                      <tr>
                        {esHistorial && <th>Semana</th>}
                        <th className="lb1-der">Días</th>
                        <th className="lb1-der">A adelantar</th>
                        <th className="lb1-der">Adelantado</th>
                        <th className="lb1-der">Faltó</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...detalle.resumen.semanas].reverse().filter(sem => esHistorial || sem.lunes === semanaMostrada).map(sem => (
                        <tr key={sem.lunes} style={{ cursor: 'default' }}>
                          {esHistorial && (
                            <td className="lb1-kardex-dia">
                              S{String(sem.numero).padStart(2, '0')} · {formatFecha(sem.lunes).slice(0, 5)} al {formatFecha(sem.domingo).slice(0, 5)}
                              {sem.lunes === lunesBaja && <span className="lb1-semana-baja">Semana de la baja</span>}
                            </td>
                          )}
                          <td className="lb1-der">{sem.esActual && !esHistorial ? `${sem.diasVencidos} cerrados` : sem.diasVencidos}</td>
                          <td className="lb1-der lb1-kardex-monto">{formatCurrency(sem.aPagar)}</td>
                          <td className="lb1-der lb1-kardex-monto" style={{ color: sem.pagado > 0 ? '#16a34a' : 'var(--text-tertiary)' }}>
                            {sem.pagado > 0 ? `+${formatCurrency(sem.pagado)}` : formatCurrency(0)}
                          </td>
                          <td className="lb1-der lb1-kardex-monto" style={{ color: sem.faltante > 0 ? '#b45309' : 'var(--text-tertiary)' }}>
                            {formatCurrency(sem.faltante)}
                          </td>
                          <td>
                            <span className={`lb1-semana-marca lb1-semana-marca-${estadoSemana(sem)}`}>
                              {MARCA_SEMANA[estadoSemana(sem)]} {ETIQUETA_ESTADO_SEMANA[estadoSemana(sem)]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {esHistorial && detalle.resumen.semanas.length === 0 && (
                <p style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>No llegó a tener días ni pagos en B1.</p>
              )}

              {/* De baja es solo historial: alcanza con la tabla de semanas (sin detalle por día) */}
              {!esHistorial && (<>
              {/* Tabla por día (formato Control de Saldos) */}
              {semanasVisibles.length === 0 ? (
                <p style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Todavía no tiene días ni pagos.</p>
              ) : (
                <>
                  <div className="lb1-kardex">
                    <table>
                      <thead>
                        <tr>
                          <th>Día</th>
                          <th>Pagos del día</th>
                          <th className="lb1-der">Pagado</th>
                          <th className="lb1-der">Cubierto</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {semanasVisibles.flatMap(sem => sem.filas).map(f => {
                          const totalDia = f.pagos.reduce((t, p) => t + p.monto, 0)
                          const esHoy = f.fecha === hoyART()
                          return (
                            <tr key={f.fecha} className={`lb1-kardex-fila-${f.dia?.estado || 'fuera'} ${esHoy ? 'lb1-kardex-hoy' : ''}`}>
                              <td className="lb1-kardex-dia">
                                {diaSemana(f.fecha)} {formatFecha(f.fecha)}
                                {esHoy && <span className="lb1-kardex-tag">Hoy</span>}
                              </td>
                              <td>
                                {f.pagos.length > 0 ? (
                                  <button className="lb1-kardex-link" onClick={() => setDiaVer(f.fecha)} title="Ver los registros de pago del día">
                                    {f.pagos.length} {f.pagos.length === 1 ? 'pago' : 'pagos'} · ver registros
                                  </button>
                                ) : f.dia?.cubiertoEl && f.dia.cubiertoEl !== f.fecha ? (
                                  <span className="lb1-kardex-cubierto">Cubierto con lo pagado el {formatFecha(f.dia.cubiertoEl).slice(0, 5)}</span>
                                ) : (
                                  <span className="lb1-kardex-tenue">Sin pagos</span>
                                )}
                              </td>
                              <td className="lb1-der lb1-kardex-monto" style={{ color: totalDia > 0 ? '#16a34a' : 'var(--text-tertiary)' }}>
                                {totalDia > 0 ? `+${formatCurrency(totalDia)}` : '-'}
                              </td>
                              <td className="lb1-der lb1-kardex-monto" style={{ fontWeight: 700 }}>
                                {f.dia ? formatCurrency(f.dia.cubierto) : '-'}
                              </td>
                              <td>
                                {f.dia ? (
                                  <span
                                    className={`lb1-kardex-estado lb1-kardex-estado-${f.dia.estado}`}
                                    title={f.dia.cubiertoEl && f.dia.cubiertoEl !== f.fecha ? `Cubierto con lo pagado el ${formatFecha(f.dia.cubiertoEl)}` : undefined}
                                  >
                                    {ETIQUETA_ESTADO_DIA[f.dia.estado]}
                                  </span>
                                ) : (
                                  <span className="lb1-kardex-tenue" title="Pago con fecha fuera de los días que paga">Fuera del período</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {semanaResumen && semanaResumen.faltante > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                      No es deuda: lo que no adelantó se cobra igual en la facturación de la semana.
                    </div>
                  )}
                </>
              )}
              </>)}
            </div>
          </div>
        </div>
      )}

      {/* Registros del día: tabla con cada pago (se abre desde "ver registros") */}
      {detalle && filaDiaVer && filaDiaVer.pagos.length > 0 && (
        <div className="fact-modal-overlay" onClick={() => setDiaVer(null)}>
          <div className="fact-modal-content" style={{ maxWidth: '980px' }} onClick={e => e.stopPropagation()}>
            <div className="fact-modal-header">
              <h2>Registros del día</h2>
              <button className="fact-modal-close" onClick={() => setDiaVer(null)}><X size={20} /></button>
            </div>
            <div className="fact-modal-body" style={{ padding: '16px' }}>
              <div className="lb1-hero">
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatNombreCompleto(detalle.nombre)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    {diaSemana(filaDiaVer.fecha)} {formatFecha(filaDiaVer.fecha)}
                    {filaDiaVer.dia && <> &middot; Cubierto: <strong>{formatCurrency(filaDiaVer.dia.cubierto)}</strong> de {formatCurrency(PROMO_B1_PAGO_DIARIO)}</>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1, color: '#16a34a' }}>
                    {formatCurrency(filaDiaVer.pagos.reduce((t, p) => t + p.monto, 0))}
                  </div>
                  {filaDiaVer.dia && (
                    <span className={`lb1-kardex-estado lb1-kardex-estado-${filaDiaVer.dia.estado}`} style={{ marginTop: '4px', display: 'inline-block' }}>
                      {ETIQUETA_ESTADO_DIA[filaDiaVer.dia.estado]}
                    </span>
                  )}
                </div>
              </div>
              <div className="lb1-kardex">
                <table>
                  <thead>
                    <tr>
                      <th>Origen</th>
                      <th>Cuenta</th>
                      <th>Quién pagó</th>
                      <th>CUIT / CUIL</th>
                      <th>Nota</th>
                      <th className="lb1-der">Monto</th>
                      <th>Cargado por</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filaDiaVer.pagos.map(p => (
                      <tr key={p.key}>
                        <td><span className={`lb1-origen lb1-origen-${origenDeLista(p).clase}`}>{origenDeLista(p).texto}</span></td>
                        <td className="lb1-kardex-tenue">{p.empresa ? ETIQUETA_EMPRESA_CRESIUM[p.empresa] || p.empresa : '-'}</td>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.pagador || '-'}</td>
                        <td className="lb1-kardex-tenue">{p.cuit || '-'}</td>
                        <td className="lb1-kardex-tenue lb1-kardex-corto" title={p.nota || ''}>{p.nota || '-'}</td>
                        <td className="lb1-der lb1-kardex-monto" style={{ color: '#16a34a', fontWeight: 700 }}>+{formatCurrency(p.monto)}</td>
                        <td className="lb1-kardex-tenue">{cargadoPorCorto(p)}</td>
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <button className="lb1-kardex-icono" onClick={() => setPagoVer(p)} title="Ver detalle"><Eye size={13} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                Mostrando {filaDiaVer.pagos.length} {filaDiaVer.pagos.length === 1 ? 'registro' : 'registros'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detalle de un pago (solo consulta: los pagos se cargan en Saldos) */}
      {pagoVer && detalle && (
        <div className="fact-modal-overlay" onClick={() => setPagoVer(null)}>
          <div className="fact-modal-content" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="fact-modal-header">
              <h2>Detalle del pago</h2>
              <button className="fact-modal-close" onClick={() => setPagoVer(null)}><X size={20} /></button>
            </div>
            <div className="fact-modal-body">
              <p className="lb1-tenue" style={{ marginTop: 0 }}>{detalle.nombre}</p>
              <div className="lb1-detalle-pago">
                <span className="lb1-label">Monto</span>
                <span className="lb1-monto lb1-verde">{formatCurrency(pagoVer.monto)}</span>
                <span className="lb1-label">Día al que corresponde</span>
                <span>{diaSemana(pagoVer.fecha)} {formatFecha(pagoVer.fecha)}</span>
                <span className="lb1-label">Origen</span>
                <span><span className={`lb1-origen lb1-origen-${origenDeLista(pagoVer).clase}`}>{origenPago(pagoVer)}</span></span>
                {pagoVer.fechaDeposito && (
                  <>
                    <span className="lb1-label">Fecha del depósito</span>
                    <span>{formatFecha(pagoVer.fechaDeposito)}</span>
                  </>
                )}
                {pagoVer.fechaInformada && (
                  <>
                    <span className="lb1-label">Fecha en que hizo el pago</span>
                    <span>{formatFecha(pagoVer.fechaInformada)} (informativa: cuenta la fecha de carga)</span>
                  </>
                )}
                <span className="lb1-label">{pagoVer.origen === 'manual' ? 'Quién pagó' : 'Envió'}</span>
                <span>{pagoVer.pagador || '-'}</span>
                <span className="lb1-label">CUIT / CUIL</span>
                <span className="lb1-fecha">{pagoVer.cuit || '-'}</span>
                <span className="lb1-label">Nota</span>
                <span>{pagoVer.nota || '-'}</span>
                <span className="lb1-label">Cargado por</span>
                <span>
                  {pagoVer.origen === 'auto'
                    ? 'Automático (cruce con Cresium)'
                    : esPaseDePrueba(pagoVer)
                      ? `Pasado al saldo en la prueba del ${pagoVer.cargadoEn ? formatFechaHoraART(pagoVer.cargadoEn) : '25/11/2026'}`
                      : `${pagoVer.cargadoPor || '-'}${pagoVer.cargadoEn ? ` · ${formatFechaHoraART(pagoVer.cargadoEn)}` : ''}`}
                </span>
                {pagoVer.editadoEn && (
                  <>
                    <span className="lb1-label">Última edición</span>
                    <span>{pagoVer.editadoPor || '-'} · {formatFechaHoraART(pagoVer.editadoEn)}</span>
                  </>
                )}
              </div>
            </div>
            <div className="fact-modal-footer">
              <button className="btn-secondary" onClick={() => setPagoVer(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Fijo abajo: hasta cuándo están los depósitos de Cresium que se cruzan */}
      <div className="lb1-cresium-pie">
        <Landmark size={13} aria-hidden="true" />
        {cresiumActualizado
          ? `Cresium actualizado: ${formatFechaHoraART(cresiumActualizado)}`
          : 'Cresium: sin datos de actualización'}
      </div>
    </div>
  )
}
