// src/modules/reportes/control-gestores/ControlGestoresModule.tsx
// Reportes > Control de gestores: ocupación de turnos por gestor, plata que se pierde
// por turnos vacíos, y churn y retención de conductores. Cálculos y definiciones en
// controlGestoresService.ts.
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ChurnGestor, ControlGestores, FotoGestor, Granularidad } from './controlGestoresService'
import { useSede } from '../../../contexts/SedeContext'
import { etiquetaMes, fechaCorta, fmtInt, fmtMonedaCorta, fmtPct, hoyArgentina, numeroSemana, sumarDias } from '../kpis-v2/kpisV2Types'
import {
  cargarControlGestores, finDe, META_OCUPACION, mesesElegibles, ocupacion, SEMANAS_RETENCION, semanasElegibles, SIN_GESTOR, TOTAL,
} from './controlGestoresService'
import { LoadingOverlay } from '../../../components/ui/LoadingOverlay'
import '../kpis-v2/DashboardKpisV2Module.css'
import './ControlGestoresModule.css'

const PALETA = ['#2a78d6', '#e8833a', '#16a34a', '#c026d3', '#ca8a04', '#0891b2']
const COLOR_SIN_GESTOR = '#9ca3af'
const COLOR_TOTAL = 'var(--text-primary)'
const COLOR_MALO = 'var(--dkv2-malo)'
const COLOR_BIEN = 'var(--dkv2-serie)'
const COLOR_MANANA = '#2a78d6'
const COLOR_NOCHE = '#e8833a'
const COLOR_UN_TURNO = '#eab308'

const tick = { fontSize: 11, fill: 'var(--text-secondary)' }
const tooltipStyle = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  fontSize: 12,
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const nombreMes = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1]
const pct100 = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 1000) / 10)
const fmtPctEje = (v: number) => `${v}%`
/** "Ali Verenzuela" -> "Ali V." para los ejes */
const corto = (g: string) => {
  if (g === TOTAL) return 'Total'
  if (g === SIN_GESTOR) return g
  const [n, a] = g.split(' ')
  return a ? `${n} ${a[0]}.` : n
}

function etiquetaPeriodo(granularidad: Granularidad, inicio: string, hoy: string): string {
  const fin = finDe(granularidad, inicio)
  const enCurso = fin >= hoy ? ' (en curso)' : ''
  if (granularidad === 'mes') {
    const nombre = nombreMes(inicio)
    return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${inicio.slice(0, 4)}${enCurso}`
  }
  const { semana } = numeroSemana(inicio)
  return `Semana ${semana} · ${fechaCorta(inicio)} al ${fechaCorta(sumarDias(inicio, 6))}${enCurso}`
}

/** Textos que cambian entre la vista semanal y la mensual. */
function textosDe(g: Granularidad, cantidad: number) {
  return g === 'semana'
    ? {
      del: 'de la semana', inicio: 'el lunes', elegido: 'Semana elegida', cierre: 'Foto al cierre de la semana.',
      evolucion: `últimas ${cantidad} semanas`, churn: 'Churn semanal', ocupacion: 'Ocupación semanal', abrev: 'sem.',
      cada: 'cada semana',
    }
    : {
      del: 'del mes', inicio: 'el día 1', elegido: 'Mes elegido', cierre: 'Foto al cierre del mes.',
      evolucion: `últimos ${cantidad} meses`, churn: 'Churn mensual', ocupacion: 'Ocupación mensual', abrev: 'meses',
      cada: 'cada mes',
    }
}

/** Etiqueta del eje de evolución: "02/11" o "Nov 26". */
const ejePeriodo = (g: Granularidad, inicio: string) => (g === 'semana' ? fechaCorta(inicio) : etiquetaMes(inicio))

function Kpi({ label, value, detalle, malo }: { label: string; value: string; detalle?: ReactNode; malo?: boolean }) {
  return (
    <div className="dkv2-kpi">
      <span className="dkv2-kpi-label">{label}</span>
      <span className={`dkv2-kpi-value${malo ? ' cg-malo' : ''}`}>{value}</span>
      {detalle ? <span className="cg-kpi-detalle">{detalle}</span> : null}
    </div>
  )
}

function Panel({ titulo, subtitulo, children, alto = 300 }: { titulo: string; subtitulo: string; children: ReactNode; alto?: number }) {
  return (
    <section className="dkv2-card cg-panel">
      <h3 className="cg-panel-titulo">{titulo}</h3>
      <p className="cg-panel-sub">{subtitulo}</p>
      <div className="cg-panel-cuerpo" style={{ height: alto }}>{children}</div>
    </section>
  )
}

export function ControlGestoresModule() {
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const filtroSede = aplicarFiltroSede as <T>(q: T) => T
  const hoy = useMemo(() => hoyArgentina(), [])
  const [granularidad, setGranularidad] = useState<Granularidad>('semana')
  const semanas = useMemo(
    () => (granularidad === 'semana' ? semanasElegibles(hoy) : mesesElegibles(hoy)),
    [granularidad, hoy],
  )
  const [elegido, setElegido] = useState<string | null>(null)
  const lunes = elegido && semanas.includes(elegido) ? elegido : semanas[0]
  const setLunes = setElegido
  const indice = semanas.indexOf(lunes)
  const palabra = granularidad === 'semana' ? 'semana' : 'mes'

  const [datos, setDatos] = useState<ControlGestores | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    setCargando(true)
    setError(null)
    cargarControlGestores(filtroSede, sedeActualId ?? null, granularidad, lunes, hoy)
      .then((d) => { if (activo) setDatos(d) })
      .catch((err) => {
        console.error('[ControlGestores] Error cargando', err)
        if (activo) setError('No se pudo cargar el control de gestores.')
      })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
    // filtroSede cambia con la sede (sedeActualId ya está en las dependencias)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granularidad, lunes, sedeActualId, hoy])

  const colorDe = useMemo(() => {
    const m = new Map<string, string>([[TOTAL, COLOR_TOTAL], [SIN_GESTOR, COLOR_SIN_GESTOR]])
    let i = 0
    for (const g of datos?.gestores ?? []) if (!m.has(g)) m.set(g, PALETA[i++ % PALETA.length])
    return m
  }, [datos])

  return (
    <div className="dkv2-module cg-module">
      <LoadingOverlay show={cargando && !datos} message="Cargando control de gestores..." size="lg" />

      <section className="dkv2-cierre">
        <header className="dkv2-cierre-header">
          <div className="dkv2-periodo-nav">
            <button
              type="button"
              className="dkv2-icon-btn"
              onClick={() => semanas[indice + 1] && setLunes(semanas[indice + 1])}
              disabled={indice >= semanas.length - 1}
              aria-label={`Ver ${palabra} anterior`}
            >
              <ChevronLeft size={18} />
            </button>
            <select
              className="dkv2-periodo-select"
              value={lunes}
              onChange={(e) => setLunes(e.target.value)}
              aria-label={`Elegir ${palabra}`}
            >
              {semanas.map((s) => <option key={s} value={s}>{etiquetaPeriodo(granularidad, s, hoy)}</option>)}
            </select>
            <button
              type="button"
              className="dkv2-icon-btn"
              onClick={() => indice > 0 && setLunes(semanas[indice - 1])}
              disabled={indice <= 0}
              aria-label={`Ver ${palabra} siguiente`}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="dkv2-header-controles">
            {cargando && datos ? <span className="dkv2-muted">Actualizando…</span> : null}
            <div className="dkv2-seg" role="tablist" aria-label="Vista">
              {(['semana', 'mes'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  role="tab"
                  aria-selected={granularidad === g}
                  className={`dkv2-seg-btn${granularidad === g ? ' is-active' : ''}`}
                  onClick={() => { setGranularidad(g); setElegido(null) }}
                >
                  {g === 'semana' ? 'Semanal' : 'Mensual'}
                </button>
              ))}
            </div>
          </div>
        </header>
      </section>

      {error ? <p className="dkv2-mod-aviso">{error}</p> : null}
      {datos && !datos.precios.conPrecio ? (
        <p className="dkv2-mod-aviso">Faltan los conceptos P021, P022 o P023 en Facturación: la pérdida por día puede quedar incompleta.</p>
      ) : null}

      {datos ? (
        <div className={cargando ? 'cg-cargando' : undefined}>
          <Ocupacion datos={datos} colorDe={colorDe} />
          <Churn datos={datos} colorDe={colorDe} />
          <Detalle datos={datos} />
        </div>
      ) : null}
    </div>
  )
}

// ───────────── Ocupación ─────────────

function Ocupacion({ datos, colorDe }: { datos: ControlGestores; colorDe: Map<string, string> }) {
  const { foto } = datos
  const total = foto.total
  const ocupTotal = ocupacion(total)
  const debajo = foto.porGestor.filter((g) => (ocupacion(g) ?? 0) < META_OCUPACION)
  const filas = [...foto.porGestor].sort((a, b) => (ocupacion(b) ?? 0) - (ocupacion(a) ?? 0))
  const conTotal: FotoGestor[] = [...filas, total]

  const barras = conTotal.map((g) => ({ nombre: corto(g.gestor), valor: pct100(ocupacion(g)), total: g.gestor === TOTAL }))
  const turnos = conTotal.map((g) => ({
    nombre: corto(g.gestor),
    manana: g.autos ? pct100(g.mananaCompl / g.autos) : null,
    noche: g.autos ? pct100(g.nocheCompl / g.autos) : null,
  }))
  const estadoAutos = conTotal.map((g) => ({
    nombre: corto(g.gestor),
    completos: g.autos ? pct100(g.completos / g.autos) : 0,
    unTurno: g.autos ? pct100(g.unTurno / g.autos) : 0,
    sinTurnos: g.autos ? pct100(g.sinTurnos / g.autos) : 0,
    autos: g.autos,
  }))
  // «Sin gestor» queda fuera de las líneas: son pocos autos y la línea salta sin aportar
  const lineasGestores = datos.gestores.filter((g) => g !== SIN_GESTOR
    && datos.historia.some((h) => h.ocupacion.get(g) !== undefined && h.ocupacion.get(g) !== null))
  const g0 = datos.periodo.granularidad
  const tx = textosDe(g0, datos.historia.length)
  const semanal = datos.historia.map((h) => {
    const fila: Record<string, number | string | null> = { semana: ejePeriodo(g0, h.inicio) }
    for (const g of [...lineasGestores, TOTAL]) fila[g] = pct100(h.ocupacion.get(g) ?? null)
    return fila
  })

  return (
    <>
      <section className="dkv2-card">
        <header className="dkv2-card-header">
          <div>
            <h2 className="dkv2-card-title">Ocupación de turnos</h2>
            <p className="dkv2-card-subtitle">
              La ocupación de turnos es <b>{fmtPct(ocupTotal)}</b> contra una meta de <b>{fmtPct(META_OCUPACION)}</b>.
              {' '}Hay <b>{fmtInt(total.turnosVacios)}</b> turnos sin conductor, unos <b>{fmtMonedaCorta(total.perdida)}</b> por día que no se facturan.
              {debajo.length ? <> Por debajo de la meta: {debajo.map((g, i) => <span key={g.gestor}>{i ? ', ' : ''}<b>{g.gestor}</b> ({fmtPct(ocupacion(g))})</span>)}.</> : ' Todos los gestores están en la meta.'}
              {' '}{datos.periodo.enCurso ? 'Foto de hoy.' : tx.cierre}
            </p>
          </div>
        </header>
        <div className="cg-kpis">
          <Kpi label="Ocupación de turnos" value={fmtPct(ocupTotal)} malo={(ocupTotal ?? 0) < META_OCUPACION}
            detalle={`Meta ${fmtPct(META_OCUPACION)} · turnos con conductor ÷ disponibles`} />
          <Kpi label="Autos 100% completos" value={fmtInt(total.completos)}
            detalle={`de ${fmtInt(total.autos)} autos (${fmtPct(total.autos ? total.completos / total.autos : null)})`} />
          <Kpi label="Turnos vacíos" value={fmtInt(total.turnosVacios)}
            detalle={`Noche: ${fmtInt(total.autos - total.nocheCompl)} · Mañana: ${fmtInt(total.autos - total.mananaCompl)}`} />
          <Kpi label="Ingreso perdido por día" value={fmtMonedaCorta(total.perdida)} malo={total.perdida > 0}
            detalle="Turnos vacíos × precio OCT-26 (semanal ÷ 7, sin IVA)" />
          <Kpi label="Autos sin ningún turno" value={fmtInt(total.sinTurnos)} detalle="Sin conductor de mañana ni de noche" />
        </div>
      </section>

      <div className="cg-grid">
        <Panel titulo="Ocupación por gestor" subtitulo="Turnos con conductor sobre turnos disponibles. En rojo, quien está debajo de la meta (línea punteada).">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barras} layout="vertical" margin={{ top: 4, right: 44, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--dkv2-grid)" />
              <XAxis type="number" domain={[0, 100]} tick={tick} tickFormatter={fmtPctEje} />
              <YAxis type="category" dataKey="nombre" tick={tick} width={110} tickLine={false} axisLine={false} />
              <ReferenceLine x={META_OCUPACION * 100} stroke="var(--dkv2-objetivo)" strokeDasharray="4 4" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [`${v}%`, 'Ocupación']} cursor={{ fill: 'var(--dkv2-cursor)' }} />
              <Bar dataKey="valor" isAnimationActive={false} maxBarSize={18} radius={[0, 3, 3, 0]}>
                {barras.map((b) => <Cell key={b.nombre} fill={(b.valor ?? 0) < META_OCUPACION * 100 ? COLOR_MALO : COLOR_BIEN} />)}
                <LabelList dataKey="valor" position="right" formatter={(v: unknown) => (v === null ? '' : `${v}%`)} style={{ fontSize: 11, fill: 'var(--text-primary)' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel titulo="Mañana vs. noche" subtitulo="Porcentaje de cada turno con conductor. Muestra en qué franja pierde cada gestor y la empresa.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={turnos} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
              <CartesianGrid vertical={false} stroke="var(--dkv2-grid)" />
              <XAxis dataKey="nombre" tick={tick} tickLine={false} interval={0} />
              <YAxis domain={[0, 100]} tick={tick} tickFormatter={fmtPctEje} tickLine={false} axisLine={false} />
              <ReferenceLine y={META_OCUPACION * 100} stroke="var(--dkv2-objetivo)" strokeDasharray="4 4" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, n: unknown) => [`${v}%`, String(n)]} cursor={{ fill: 'var(--dkv2-cursor)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="manana" name="Mañana" fill={COLOR_MANANA} isAnimationActive={false} maxBarSize={16} />
              <Bar dataKey="noche" name="Noche" fill={COLOR_NOCHE} isAnimationActive={false} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel titulo="Estado de los autos por gestor" subtitulo="Porcentaje de autos con los dos turnos, uno solo o ninguno.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={estadoAutos} layout="vertical" margin={{ top: 4, right: 52, bottom: 0, left: 0 }} stackOffset="expand">
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="nombre" tick={tick} width={110} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, n: unknown) => [`${v}%`, String(n)]} cursor={{ fill: 'var(--dkv2-cursor)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="completos" name="2 turnos" stackId="a" fill={COLOR_BIEN} isAnimationActive={false} maxBarSize={18} />
              <Bar dataKey="unTurno" name="1 turno" stackId="a" fill={COLOR_UN_TURNO} isAnimationActive={false} maxBarSize={18} />
              <Bar dataKey="sinTurnos" name="Sin turnos" stackId="a" fill={COLOR_MALO} isAnimationActive={false} maxBarSize={18}>
                <LabelList dataKey="autos" position="right" formatter={(v: unknown) => `${v} autos`} style={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel titulo={`${tx.ocupacion}, ${tx.evolucion}`} subtitulo="Quién mejora y quién viene cayendo. Línea gruesa: total empresa; punteada: meta.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={semanal} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid vertical={false} stroke="var(--dkv2-grid)" />
              <XAxis dataKey="semana" tick={tick} tickLine={false} />
              <YAxis domain={[0, 100]} tick={tick} tickFormatter={fmtPctEje} tickLine={false} axisLine={false} />
              <ReferenceLine y={META_OCUPACION * 100} stroke="var(--dkv2-objetivo)" strokeDasharray="4 4" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, n: unknown) => [v === null ? '—' : `${v}%`, String(n)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: unknown) => corto(String(v))} />
              {lineasGestores.map((g) => (
                <Line key={g} dataKey={g} stroke={colorDe.get(g)} dot={false} strokeWidth={1.6} isAnimationActive={false} connectNulls />
              ))}
              <Line dataKey={TOTAL} stroke={COLOR_TOTAL} dot={false} strokeWidth={3} isAnimationActive={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </>
  )
}

// ───────────── Churn y retención ─────────────

function Churn({ datos, colorDe }: { datos: ControlGestores; colorDe: Map<string, string> }) {
  const { churn, retencion } = datos
  const total = churn.total
  const curvaTotal = retencion.curvas.find((c) => c.gestor === TOTAL)
  const ret4 = curvaTotal?.puntos[4] ?? null
  const ret8 = curvaTotal?.puntos[SEMANAS_RETENCION] ?? null

  const conActivos = churn.porGestor.filter((g) => g.activos > 0)
  const barras = [...conActivos, total].map((g) => ({ nombre: corto(g.gestor), valor: pct100(g.churn) }))
  const lineasGestores = datos.gestores.filter((g) => g !== SIN_GESTOR
    && datos.historia.some((h) => h.churn.get(g) !== undefined && h.churn.get(g) !== null))
  const g0 = datos.periodo.granularidad
  const tx = textosDe(g0, datos.historia.length)
  const LIMITE_CHURN = churn.limite
  const semanal = datos.historia.map((h) => {
    const fila: Record<string, number | string | null> = { semana: ejePeriodo(g0, h.inicio) }
    for (const g of [...lineasGestores, TOTAL]) fila[g] = pct100(h.churn.get(g) ?? null)
    return fila
  })
  const curvas = retencion.curvas.filter((c) => c.cohorte > 0 && c.gestor !== SIN_GESTOR)
  const puntosRet = Array.from({ length: SEMANAS_RETENCION + 1 }, (_, k) => {
    const fila: Record<string, number | string | null> = { semana: `Sem ${k}` }
    for (const c of curvas) fila[c.gestor] = pct100(c.puntos[k])
    return fila
  })
  const tabla: ChurnGestor[] = [...churn.porGestor.filter((g) => g.activos || g.altas || g.bajas), total]

  return (
    <>
      <section className="dkv2-card">
        <header className="dkv2-card-header">
          <div>
            <h2 className="dkv2-card-title">Conductores: churn y retención</h2>
            <p className="dkv2-card-subtitle">
              Un turno vacío casi siempre empieza con un conductor que se va. El churn mide cuántos se van {tx.cada}; la retención, cuántos de los que entran se quedan.
            </p>
          </div>
        </header>
        <div className="cg-kpis cg-kpis--4">
          <Kpi label={tx.churn} value={fmtPct(total.churn)} malo={(total.churn ?? 0) > LIMITE_CHURN}
            detalle={`Límite ${fmtPct(LIMITE_CHURN)} · promedio ${datos.historia.length} ${tx.abrev}: ${fmtPct(churn.promedio)}`} />
          <Kpi label={`Bajas ${tx.del}`} value={fmtInt(total.bajas)}
            detalle={`Altas: ${fmtInt(total.altas)} · neto: ${total.altas - total.bajas >= 0 ? '+' : ''}${fmtInt(total.altas - total.bajas)}`} />
          <Kpi label="Retención a 4 semanas" value={fmtPct(ret4)}
            detalle={`Conductores que arrancaron en ${nombreMes(retencion.mes)} (${fmtInt(curvaTotal?.cohorte ?? 0)})`} />
          <Kpi label={`Retención a ${SEMANAS_RETENCION} semanas`} value={fmtPct(ret8)} detalle="Misma cohorte" />
        </div>
      </section>

      <div className="cg-grid">
        <Panel titulo="Churn por gestor" subtitulo={`Bajas ÷ conductores activos ${tx.inicio}${g0 === 'mes' ? ' + altas del mes' : ''}. En rojo, quien supera el límite (línea punteada).`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barras} layout="vertical" margin={{ top: 4, right: 44, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--dkv2-grid)" />
              <XAxis type="number" domain={[0, (max: number) => Math.ceil(Math.max(max, LIMITE_CHURN * 100 * 1.2, 10) / 5) * 5]} tick={tick} tickFormatter={fmtPctEje} />
              <YAxis type="category" dataKey="nombre" tick={tick} width={110} tickLine={false} axisLine={false} />
              <ReferenceLine x={LIMITE_CHURN * 100} stroke="var(--dkv2-objetivo)" strokeDasharray="4 4" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [v === null ? '—' : `${v}%`, 'Churn']} cursor={{ fill: 'var(--dkv2-cursor)' }} />
              <Bar dataKey="valor" isAnimationActive={false} maxBarSize={18} radius={[0, 3, 3, 0]}>
                {barras.map((b) => <Cell key={b.nombre} fill={(b.valor ?? 0) > LIMITE_CHURN * 100 ? COLOR_MALO : COLOR_BIEN} />)}
                <LabelList dataKey="valor" position="right" formatter={(v: unknown) => (v === null ? '' : `${v}%`)} style={{ fontSize: 11, fill: 'var(--text-primary)' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel titulo={`${tx.churn}, ${tx.evolucion}`} subtitulo="Un churn que sube suele anticipar la caída de la ocupación. Línea gruesa: total empresa.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={semanal} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid vertical={false} stroke="var(--dkv2-grid)" />
              <XAxis dataKey="semana" tick={tick} tickLine={false} />
              <YAxis tick={tick} tickFormatter={fmtPctEje} tickLine={false} axisLine={false} />
              <ReferenceLine y={LIMITE_CHURN * 100} stroke="var(--dkv2-objetivo)" strokeDasharray="4 4" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, n: unknown) => [v === null ? '—' : `${v}%`, String(n)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: unknown) => corto(String(v))} />
              {lineasGestores.map((g) => (
                <Line key={g} dataKey={g} stroke={colorDe.get(g)} dot={false} strokeWidth={1.6} isAnimationActive={false} connectNulls />
              ))}
              <Line dataKey={TOTAL} stroke={COLOR_TOTAL} dot={false} strokeWidth={3} isAnimationActive={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel titulo="Curva de retención" subtitulo={`De los conductores que arrancaron en ${nombreMes(retencion.mes)}, qué porcentaje sigue sin baja cada semana. Línea gruesa: total.`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={puntosRet} margin={{ top: 4, right: 18, bottom: 0, left: -8 }}>
              <CartesianGrid vertical={false} stroke="var(--dkv2-grid)" />
              <XAxis dataKey="semana" tick={tick} tickLine={false} interval={1} />
              <YAxis domain={[0, 100]} tick={tick} tickFormatter={fmtPctEje} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, n: unknown) => [v === null ? '—' : `${v}%`, String(n)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: unknown) => corto(String(v))} />
              {curvas.filter((c) => c.gestor !== TOTAL).map((c) => (
                <Line key={c.gestor} dataKey={c.gestor} stroke={colorDe.get(c.gestor)} dot={false} strokeWidth={1.6} isAnimationActive={false} />
              ))}
              <Line dataKey={TOTAL} stroke={COLOR_TOTAL} dot={false} strokeWidth={3} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <section className="dkv2-card cg-panel">
          <h3 className="cg-panel-titulo">Conductores por gestor</h3>
          <p className="cg-panel-sub">{tx.elegido}, de mayor a menor churn.</p>
          <div className="dkv2-table-wrap">
            <table className="dkv2-table cg-tabla cg-tabla--compacta">
              <thead>
                <tr><th>Gestor</th><th>Activos</th><th>Altas</th><th>Bajas</th><th>Neto</th><th>Churn</th></tr>
              </thead>
              <tbody>
                {tabla.map((g) => (
                  <tr key={g.gestor} className={g.gestor === TOTAL ? 'cg-fila-total' : undefined}>
                    <td>{corto(g.gestor)}</td>
                    <td>{fmtInt(g.activos)}</td>
                    <td>{fmtInt(g.altas)}</td>
                    <td>{fmtInt(g.bajas)}</td>
                    <td>{g.altas - g.bajas >= 0 ? '+' : ''}{fmtInt(g.altas - g.bajas)}</td>
                    <td className={(g.churn ?? 0) > LIMITE_CHURN ? 'cg-malo' : undefined}>{fmtPct(g.churn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <p className="cg-nota">
        {tx.churn} = bajas {tx.del} (las mismas del Dashboard KPI) ÷ conductores activos {tx.inicio}{g0 === 'mes' ? ' más los que entraron en el mes' : ''}. Límite {fmtPct(LIMITE_CHURN)}
        {g0 === 'mes' ? ' (el 5 % semanal llevado a los días del mes)' : ''}.
        {' '}Retención a N semanas = de los que arrancaron en {nombreMes(retencion.mes)} (último mes que ya cumplió {SEMANAS_RETENCION} semanas), porcentaje sin baja N semanas después.
        {' '}A cada conductor se lo cuenta en el gestor del auto que manejaba.
      </p>
    </>
  )
}

// ───────────── Detalle ─────────────

function Detalle({ datos }: { datos: ControlGestores }) {
  const filas: FotoGestor[] = [...datos.foto.porGestor, datos.foto.total]
  return (
    <section className="dkv2-card">
      <header className="dkv2-card-header">
        <div>
          <h2 className="dkv2-card-title">Detalle por gestor</h2>
          <p className="dkv2-card-subtitle">Autos, turnos y pérdida por día de cada gestor, de menor a mayor ocupación.</p>
        </div>
      </header>
      <div className="dkv2-table-wrap">
        <table className="dkv2-table cg-tabla">
          <thead>
            <tr>
              <th>Gestor</th><th>Autos</th><th>Autos 100%</th><th>Turnos disp.</th><th>Turnos compl.</th><th>Ocupación</th>
              <th>T. mañana disp.</th><th>T. mañana compl.</th><th>T. noche disp.</th><th>T. noche compl.</th>
              <th>Turnos vacíos</th><th>Pérdida / día</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((g) => {
              const o = ocupacion(g)
              return (
                <tr key={g.gestor} className={g.gestor === TOTAL ? 'cg-fila-total' : undefined}>
                  <td>{g.gestor}</td>
                  <td>{fmtInt(g.autos)}</td>
                  <td>{fmtInt(g.completos)}</td>
                  <td>{fmtInt(g.turnosDisp)}</td>
                  <td>{fmtInt(g.turnosCompl)}</td>
                  <td className={(o ?? 0) < META_OCUPACION ? 'cg-malo' : undefined}>{fmtPct(o)}</td>
                  <td>{fmtInt(g.autos)}</td>
                  <td>{fmtInt(g.mananaCompl)}</td>
                  <td>{fmtInt(g.autos)}</td>
                  <td>{fmtInt(g.nocheCompl)}</td>
                  <td>{fmtInt(g.turnosVacios)}</td>
                  <td>{fmtMonedaCorta(g.perdida)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="cg-nota">
        Cuentan los autos en Disponible, PKG ON o En uso. Turnos disponibles = autos × 2 (mañana y noche); un auto a cargo con conductor cubre los dos.
        {' '}Pérdida por día = cada turno vacío por su precio de OCT-26 (semanal ÷ 7, sin IVA): diurno {fmtMonedaCorta(datos.precios.diurno)}, nocturno {fmtMonedaCorta(datos.precios.nocturno)}; un auto a cargo sin conductor, {fmtMonedaCorta(datos.precios.aCargo)}.
        {' '}Para períodos pasados se usa el gestor que tenía cada auto en ese momento (historial desde el 05/11/2026; antes, el primer gestor registrado).
        {' '}«{SIN_GESTOR}»: autos sin guía responsable (por ejemplo, en Disponible).
      </p>
    </section>
  )
}
