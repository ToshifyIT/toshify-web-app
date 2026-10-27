// src/modules/reportes/kpis-v2/DashboardKpisV2Module.tsx
// Dashboard KPI v2: los cuatro indicadores que mueven el negocio (ocupación,
// operatividad, facturación y cobranza) más la flota, contra el forecast y
// contra el período anterior. Semanal (cómo cerramos la semana) o mensual
// (acumulado del mes, con las semanas partidas repartidas por día).
// Datos: función SQL get_dashboard_kpis_v2 (sql/dashboard_kpis_v2.sql).
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Info, Target } from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Diferencia, Granularidad, Periodo } from './kpisV2Types'
import { useSede } from '../../../contexts/SedeContext'
import { usePermissions } from '../../../contexts/PermissionsContext'
import { useKpisV2Data } from './useKpisV2Data'
import {
  agrupar,
  cumplimiento,
  difPuntos,
  difRelativa,
  difUnidades,
  fmtInt,
  fmtMoneda,
  fmtMonedaCorta,
  fmtPct,
  hoyArgentina,
  resumenMotivos,
  periodoPorDefecto,
  rangoConsulta,
} from './kpisV2Types'
import { LoadingOverlay } from '../../../components/ui/LoadingOverlay'
import { AdaptiveTooltip } from '../../../components/ui/AdaptiveTooltip'
import { ForecastModal } from './ForecastModal'
import { IndicadoresModulos } from './IndicadoresModulos'
import './DashboardKpisV2Module.css'

const SUBMENU = 'dashboard-kpis-v2'

/** "+4", "−3" o "0". */
function fmtNeto(v: number): string {
  if (v === 0) return '0'
  return `${v > 0 ? '+' : '−'}${fmtInt(Math.abs(v))}`
}

function InfoIcon({ text }: { text: string }) {
  return (
    <AdaptiveTooltip content={text} width={280} variant="dark">
      <span className="dkv2-info" aria-label={text}>
        <Info size={13} strokeWidth={2} />
      </span>
    </AdaptiveTooltip>
  )
}

function Dif({ d, sufijo }: { d: Diferencia | null; sufijo: string }) {
  if (!d) return null
  return (
    <span className={`dkv2-dif dkv2-dif--${d.tono}`}>
      {d.texto} <span className="dkv2-dif-sufijo">{sufijo}</span>
    </span>
  )
}

interface KpiCardProps {
  label: string
  info: string
  value: string
  hero?: boolean
  objetivo?: string | null
  difObjetivo?: Diferencia | null
  difAnterior?: Diferencia | null
  nombreAnterior: string
  detalle?: ReactNode
  aviso?: string | null
  /** No muestra la línea de objetivo (indicadores sin forecast). */
  sinObjetivo?: boolean
}

function KpiCard({
  label, info, value, hero, objetivo, difObjetivo, difAnterior, nombreAnterior, detalle, aviso, sinObjetivo,
}: KpiCardProps) {
  return (
    <div className={`dkv2-kpi${hero ? ' dkv2-kpi--hero' : ''}`}>
      <span className="dkv2-kpi-label">
        <span>{label}</span>
        <InfoIcon text={info} />
      </span>
      <span className="dkv2-kpi-value">{value}</span>
      <div className="dkv2-kpi-lineas">
        {sinObjetivo ? null : (
          <span className="dkv2-kpi-linea">
            <Target size={12} aria-hidden="true" />
            {objetivo ? <>Objetivo {objetivo}</> : <span className="dkv2-muted">Sin objetivo</span>}
            <Dif d={difObjetivo ?? null} sufijo="vs objetivo" />
          </span>
        )}
        <span className="dkv2-kpi-linea">
          <Dif d={difAnterior ?? null} sufijo={`vs ${nombreAnterior}`} />
        </span>
      </div>
      {detalle ? <div className="dkv2-kpi-detalle">{detalle}</div> : null}
      {aviso ? <span className="dkv2-kpi-aviso">{aviso}</span> : null}
    </div>
  )
}

/** Lista corta "concepto ... monto" para el detalle de las tarjetas. */
function Desglose({ filas, enteros }: { filas: { label: string; valor: number; signo?: '−' }[]; enteros?: boolean }) {
  return (
    <dl className="dkv2-desglose">
      {filas.map(f => (
        <div key={f.label}>
          <dt>{f.label}</dt>
          <dd>{f.signo ?? ''}{enteros ? fmtInt(f.valor) : fmtMonedaCorta(f.valor)}</dd>
        </div>
      ))}
    </dl>
  )
}

// ───────────── Gráfico de evolución ─────────────

type Metrica = 'ocupacion' | 'operatividad' | 'flota' | 'retencion' | 'facturacion' | 'cobranza'

const METRICAS: { id: Metrica; label: string; tipo: 'tasa' | 'cantidad' | 'monto' }[] = [
  { id: 'ocupacion', label: 'Ocupación', tipo: 'tasa' },
  { id: 'operatividad', label: 'Operatividad', tipo: 'tasa' },
  { id: 'flota', label: 'Flota', tipo: 'cantidad' },
  { id: 'retencion', label: 'Retención', tipo: 'tasa' },
  { id: 'facturacion', label: 'Facturación', tipo: 'monto' },
  { id: 'cobranza', label: 'Cobranza', tipo: 'tasa' },
]

function valorMetrica(p: Periodo, m: Metrica): { real: number | null; objetivo: number | null } {
  switch (m) {
    case 'ocupacion': return { real: p.ocupacion, objetivo: p.objetivo.ocupacion }
    case 'operatividad': return { real: p.operatividad, objetivo: p.objetivo.operatividad }
    case 'flota': return { real: p.flota, objetivo: p.objetivo.flota }
    case 'facturacion': return { real: p.facturado, objetivo: p.objetivo.facturacion }
    case 'cobranza': return { real: p.cobranza, objetivo: p.objetivo.cobranza }
    case 'retencion': return { real: p.conductores.retencion, objetivo: null }
  }
}

function formatoMetrica(tipo: 'tasa' | 'cantidad' | 'monto', v: number | null): string {
  if (tipo === 'tasa') return fmtPct(v)
  if (tipo === 'monto') return fmtMonedaCorta(v)
  return fmtInt(v)
}

interface EvolucionProps {
  periodos: Periodo[]
  seleccionado: string | null
  onSeleccionar: (key: string) => void
}

function Evolucion({ periodos, seleccionado, onSeleccionar }: EvolucionProps) {
  const [metrica, setMetrica] = useState<Metrica>('ocupacion')
  const def = METRICAS.find(m => m.id === metrica)!
  const data = periodos.map(p => {
    const v = valorMetrica(p, metrica)
    const escala = def.tipo === 'tasa' ? 100 : 1
    return {
      key: p.key,
      label: p.label,
      real: v.real === null ? null : v.real * escala,
      // Facturación del período en curso: la parte todavía sin facturar, proyectada
      proyectado: metrica === 'facturacion' && p.proyeccion ? p.proyeccion.proyectado : null,
      objetivo:
        metrica === 'facturacion' && p.proyeccion
          ? p.proyeccion.objetivo
          : v.objetivo === null ? null : v.objetivo * escala,
    }
  })
  const fmtEje = (v: number) =>
    def.tipo === 'tasa' ? `${v}%` : def.tipo === 'monto' ? fmtMonedaCorta(v).replace('$ ', '$') : fmtInt(v)
  const fmtTooltip = (v: number | null) =>
    formatoMetrica(def.tipo, v === null ? null : def.tipo === 'tasa' ? v / 100 : v)
  const tick = { fill: 'var(--text-tertiary, #6b7280)', fontSize: 12 }
  const indiceSel = periodos.findIndex(p => p.key === seleccionado)

  return (
    <section className="dkv2-card">
      <header className="dkv2-card-header">
        <div>
          <h2 className="dkv2-card-title">Evolución</h2>
          <p className="dkv2-card-subtitle">Real contra objetivo. Hacé clic en un período para verlo arriba.</p>
        </div>
        <div className="dkv2-seg" role="tablist" aria-label="Indicador">
          {METRICAS.map(m => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={metrica === m.id}
              className={`dkv2-seg-btn${metrica === m.id ? ' is-active' : ''}`}
              onClick={() => setMetrica(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>
      <div className="dkv2-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 12, bottom: 0, left: 4 }}
            onClick={(e: unknown) => {
              const idx = (e as { activeTooltipIndex?: number | string } | null)?.activeTooltipIndex
              const i = typeof idx === 'string' ? Number(idx) : idx
              if (typeof i === 'number' && periodos[i]) onSeleccionar(periodos[i].key)
            }}
          >
            <CartesianGrid vertical={false} stroke="var(--dkv2-grid)" />
            <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: 'var(--dkv2-grid)' }} padding={{ left: 16, right: 16 }} />
            <YAxis
              tick={tick}
              tickLine={false}
              axisLine={false}
              width={def.tipo === 'monto' ? 64 : 44}
              tickFormatter={fmtEje}
              domain={def.tipo === 'tasa' ? [0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)] : [0, 'auto']}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--dkv2-cursor)' }}
              contentStyle={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: 12,
              }}
              formatter={(v: unknown, name: unknown) => [fmtTooltip(v === null || v === undefined ? null : Number(v)), String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
            {def.tipo === 'monto' ? (
              <>
                <Bar
                  dataKey="real"
                  name="Facturado neto"
                  stackId="fact"
                  fill="var(--dkv2-serie)"
                  maxBarSize={24}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="proyectado"
                  name="Proyectado"
                  stackId="fact"
                  fill="var(--dkv2-serie)"
                  fillOpacity={0.3}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                />
              </>
            ) : (
              <Line
                dataKey="real"
                name={def.label}
                type="monotone"
                stroke="var(--dkv2-serie)"
                strokeWidth={2}
                dot={(props: { cx?: number; cy?: number; index?: number; value?: unknown }) => (
                  props.cx === undefined || props.cy === undefined || props.value === null || props.value === undefined
                    ? <g key={`dot-${props.index}`} />
                    : <circle
                    key={`dot-${props.index}`}
                    cx={props.cx}
                    cy={props.cy}
                    r={props.index === indiceSel ? 6 : 4}
                    fill="var(--dkv2-serie)"
                    stroke="var(--bg-primary)"
                    strokeWidth={2}
                  />
                )}
                activeDot={{ r: 6, stroke: 'var(--bg-primary)', strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            )}
            <Line
              dataKey="objetivo"
              name="Objetivo"
              type="linear"
              stroke="var(--dkv2-objetivo)"
              strokeWidth={2}
              strokeDasharray="6 4"
              // Marcador con trazo continuo: si no, hereda el punteado de la línea
              dot={(props: { cx?: number; cy?: number; index?: number; value?: unknown }) => (
                props.cx === undefined || props.cy === undefined || props.value === null || props.value === undefined
                  ? <g key={`obj-${props.index}`} />
                  : <circle
                      key={`obj-${props.index}`}
                      cx={props.cx}
                      cy={props.cy}
                      r={4}
                      fill="var(--dkv2-objetivo)"
                      stroke="var(--bg-primary)"
                      strokeWidth={2}
                      strokeDasharray="none"
                    />
              )}
              activeDot={{ r: 5, fill: 'var(--dkv2-objetivo)', stroke: 'var(--bg-primary)', strokeWidth: 2, strokeDasharray: 'none' }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

// ───────────── Tabla de seguimiento ─────────────

interface TablaProps {
  periodos: Periodo[]
  granularidad: Granularidad
  seleccionado: string | null
  onSeleccionar: (key: string) => void
}

function Tabla({ periodos, granularidad, seleccionado, onSeleccionar }: TablaProps) {
  const filas = [...periodos].reverse()
  return (
    <section className="dkv2-card">
      <header className="dkv2-card-header">
        <div>
          <h2 className="dkv2-card-title">Seguimiento {granularidad === 'semana' ? 'semanal' : 'mensual'}</h2>
          <p className="dkv2-card-subtitle">
            Real, objetivo y diferencia de cada {granularidad === 'semana' ? 'semana' : 'mes'}.
          </p>
        </div>
      </header>
      <div className="dkv2-table-wrap">
        <table className="dkv2-table">
          <thead>
            <tr>
              <th rowSpan={2}>{granularidad === 'semana' ? 'Semana' : 'Mes'}</th>
              <th colSpan={2}>Flota</th>
              <th colSpan={2}>Ocupación</th>
              <th colSpan={2}>Operatividad</th>
              <th colSpan={2}>Conductores</th>
              <th colSpan={3}>Facturación</th>
              <th colSpan={2}>Cobranza</th>
            </tr>
            <tr>
              <th>Real</th><th>Obj.</th>
              <th>Real</th><th>vs obj.</th>
              <th>Real</th><th>vs obj.</th>
              <th>Bajas</th><th>Retención</th>
              <th>Facturado</th><th>Obj.</th><th>Cumpl.</th>
              <th>% cobrado</th><th>vs obj.</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(p => {
              const cumpl = cumplimiento(p.facturado, p.objetivo.facturacion)
              return (
                <tr
                  key={p.key}
                  className={p.key === seleccionado ? 'is-selected' : undefined}
                  onClick={() => onSeleccionar(p.key)}
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSeleccionar(p.key)
                    }
                  }}
                >
                  <td className="dkv2-td-periodo">
                    <span>{p.label}</span>
                    {!p.completo ? <span className="dkv2-chip">En curso</span> : null}
                  </td>
                  <td>{fmtInt(p.flota)}</td>
                  <td className="dkv2-muted">{fmtInt(p.objetivo.flota)}</td>
                  <td>{fmtPct(p.ocupacion)}</td>
                  <td><Dif d={difPuntos(p.ocupacion, p.objetivo.ocupacion)} sufijo="" /></td>
                  <td>{fmtPct(p.operatividad)}</td>
                  <td><Dif d={difPuntos(p.operatividad, p.objetivo.operatividad)} sufijo="" /></td>
                  <td>{fmtInt(p.conductores.bajas)}</td>
                  <td>{fmtPct(p.conductores.retencion)}</td>
                  <td>
                    {p.proyeccion ? (
                      <span title="Proyectado al cierre">≈ {fmtMonedaCorta(p.proyeccion.total)}</span>
                    ) : (
                      fmtMonedaCorta(p.facturado)
                    )}
                    {p.proyeccion ? <span className="dkv2-chip">Proy.</span> : p.facturacionProvisoria ? <span className="dkv2-chip">Abierta</span> : null}
                  </td>
                  <td className="dkv2-muted">{fmtMonedaCorta(p.objetivo.facturacion)}</td>
                  <td>{cumpl === null ? '—' : <span className={`dkv2-dif dkv2-dif--${cumpl >= 1 ? 'bueno' : 'malo'}`}>{fmtPct(cumpl)}</span>}</td>
                  <td>{fmtPct(p.cobranza)}</td>
                  <td><Dif d={difPuntos(p.cobranza, p.objetivo.cobranza)} sufijo="" /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ───────────── Motivos de baja ─────────────

// ───────────── Pantalla ─────────────

export function DashboardKpisV2Module() {
  const { sedeActual, sedeActualId } = useSede()
  const { canEditInSubmenu } = usePermissions()
  const puedeCargarForecast = canEditInSubmenu(SUBMENU)

  const [granularidad, setGranularidad] = useState<Granularidad>('semana')
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [mostrarForecast, setMostrarForecast] = useState(false)

  const hoy = useMemo(() => hoyArgentina(), [])
  // Siempre desde que hay datos (marzo 2026)
  const { desde, hasta } = useMemo(() => rangoConsulta(granularidad, 0, hoy), [granularidad, hoy])
  const { data, isLoading, error, recargar } = useKpisV2Data(desde, hasta)

  // Los períodos del principio sin ningún dato (anteriores al histórico) no se muestran
  const periodos = useMemo(() => {
    const todos = data ? agrupar(data, granularidad) : []
    const primero = todos.findIndex(p => p.diasConFlota > 0 || p.diasConFacturacion > 0)
    return primero < 0 ? [] : todos.slice(primero)
  }, [data, granularidad])

  // Al cambiar de vista o de rango, volver al período por defecto
  useEffect(() => {
    setSeleccionado(null)
  }, [granularidad, sedeActualId])

  const motivosGeneral = useMemo(() => resumenMotivos(data?.bajas ?? []), [data])
  const porDefecto = useMemo(() => periodoPorDefecto(periodos), [periodos])
  const actual = useMemo(
    () => periodos.find(p => p.key === seleccionado) ?? porDefecto,
    [periodos, seleccionado, porDefecto],
  )
  const indiceActual = actual ? periodos.findIndex(p => p.key === actual.key) : -1
  const anterior = indiceActual > 0 ? periodos[indiceActual - 1] : null
  const nombreAnterior = granularidad === 'semana' ? 'semana anterior' : 'mes anterior'

  const sedeNombre = sedeActual?.nombre ?? 'Todas las sedes'

  function cambiarGranularidad(g: Granularidad) {
    setGranularidad(g)
  }

  const cumplFact = actual ? cumplimiento(actual.facturado, actual.objetivo.facturacion) : null

  const controles = (
    <div className="dkv2-header-controles">
      {data?.calculado_en ? (
        <span className="dkv2-actualizado">
          Datos actualizados a las{' '}
          {new Date(data.calculado_en).toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Argentina/Buenos_Aires',
          })}
        </span>
      ) : null}
      <div className="dkv2-seg" role="tablist" aria-label="Vista">
        <button
          type="button"
          role="tab"
          aria-selected={granularidad === 'semana'}
          className={`dkv2-seg-btn${granularidad === 'semana' ? ' is-active' : ''}`}
          onClick={() => cambiarGranularidad('semana')}
        >
          Semanal
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={granularidad === 'mes'}
          className={`dkv2-seg-btn${granularidad === 'mes' ? ' is-active' : ''}`}
          onClick={() => cambiarGranularidad('mes')}
        >
          Mensual
        </button>
      </div>
      {puedeCargarForecast ? (
        <button type="button" className="dkv2-btn" onClick={() => setMostrarForecast(true)}>
          <Target size={15} />
          Forecast
        </button>
      ) : null}
    </div>
  )

  return (
    <div className="dkv2-module">
      <LoadingOverlay show={isLoading && !data} message="Cargando indicadores..." size="lg" />

      {error ? <div className="dkv2-error">{error}</div> : null}

      {!actual && !isLoading ? <section className="dkv2-cierre"><header className="dkv2-cierre-header"><span className="dkv2-periodo-estado">Sin datos para {sedeNombre}</span>{controles}</header></section> : null}

      {actual ? (
        <section className="dkv2-cierre">
          <header className="dkv2-cierre-header">
            <div className="dkv2-periodo-nav">
              <button
                type="button"
                className="dkv2-icon-btn"
                onClick={() => anterior && setSeleccionado(anterior.key)}
                disabled={!anterior}
                aria-label={`Ver ${nombreAnterior}`}
              >
                <ChevronLeft size={18} />
              </button>
              <select
                className="dkv2-periodo-select"
                value={actual.key}
                onChange={e => setSeleccionado(e.target.value)}
                aria-label={granularidad === 'semana' ? 'Elegir semana' : 'Elegir mes'}
              >
                {[...periodos].reverse().map(p => (
                  <option key={p.key} value={p.key}>
                    {p.labelLargo}{!p.completo ? ' (en curso)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="dkv2-icon-btn"
                onClick={() => periodos[indiceActual + 1] && setSeleccionado(periodos[indiceActual + 1].key)}
                disabled={indiceActual < 0 || indiceActual >= periodos.length - 1}
                aria-label="Ver período siguiente"
              >
                <ChevronRight size={18} />
              </button>
              {porDefecto && actual.key !== porDefecto.key ? (
                <button type="button" className="dkv2-link" onClick={() => setSeleccionado(null)}>
                  {granularidad === 'semana' ? 'Ir a la semana actual' : 'Ir al mes actual'}
                </button>
              ) : null}
            </div>
            {controles}
          </header>

          <div className="dkv2-kpis">
            <KpiCard
              hero
              label="% OCUPACIÓN"
              info="De todos los turnos que podemos alquilar (cada vehículo disponible tiene 2: día y noche), qué porcentaje tiene un conductor asignado."
              value={fmtPct(actual.ocupacion)}
              objetivo={actual.objetivo.ocupacion !== null ? fmtPct(actual.objetivo.ocupacion) : null}
              difObjetivo={difPuntos(actual.ocupacion, actual.objetivo.ocupacion)}
              difAnterior={difPuntos(actual.ocupacion, anterior?.ocupacion ?? null)}
              nombreAnterior={nombreAnterior}
              detalle={
                actual.ocupacionInicio !== null ? (
                  <>
                    Arrancó en <strong>{fmtPct(actual.ocupacionInicio)}</strong> y{' '}
                    {actual.completo ? 'cerró' : 'va'} en <strong>{fmtPct(actual.ocupacionFin)}</strong>
                  </>
                ) : null
              }
              aviso={actual.objetivoIncompleto && actual.objetivo.ocupacion === null ? 'Forecast incompleto para este período' : null}
            />
            <KpiCard
              label="% OPERATIVIDAD"
              info="De todos los vehículos de la flota, qué porcentaje está en la calle trabajando. El resto está en taller, esperando conductor o retenido."
              value={fmtPct(actual.operatividad)}
              objetivo={actual.objetivo.operatividad !== null ? fmtPct(actual.objetivo.operatividad) : null}
              difObjetivo={difPuntos(actual.operatividad, actual.objetivo.operatividad)}
              difAnterior={difPuntos(actual.operatividad, anterior?.operatividad ?? null)}
              nombreAnterior={nombreAnterior}
              detalle={actual.enUso !== null ? <>{fmtInt(actual.enUso)} en uso de {fmtInt(actual.flota)} al cierre</> : null}
            />
            <KpiCard
              label="TOTAL FLOTA"
              info="Cantidad de vehículos de la empresa al cierre del período. Ingresados: vehículos que se sumaron en el período."
              value={fmtInt(actual.flota)}
              objetivo={actual.objetivo.flota !== null ? fmtInt(actual.objetivo.flota) : null}
              difObjetivo={difUnidades(actual.flota, actual.objetivo.flota)}
              difAnterior={difUnidades(actual.flota, anterior?.flota ?? null)}
              nombreAnterior={nombreAnterior}
              detalle={<>{fmtInt(actual.ingresados)} {actual.ingresados === 1 ? 'vehículo ingresado' : 'vehículos ingresados'}</>}
            />
            <KpiCard
              label="% RETENCIÓN"
              info="De todos los conductores que manejaron en el período (los que ya estaban más los que entraron), qué porcentaje sigue con nosotros. Bajas: conductores que dejaron la empresa. Altas: conductores que hicieron su primer turno."
              value={fmtPct(actual.conductores.retencion)}
              difAnterior={difPuntos(actual.conductores.retencion, anterior?.conductores.retencion ?? null)}
              nombreAnterior={nombreAnterior}
              sinObjetivo
              detalle={
                <Desglose
                  enteros
                  filas={[
                    { label: 'Bajas', valor: actual.conductores.bajas },
                    { label: 'Altas', valor: actual.conductores.altas },
                    { label: actual.completo ? 'Manejando al cierre' : 'Manejando hoy', valor: actual.conductores.fin ?? 0 },
                  ]}
                />
              }
            />
            <KpiCard
              label="CRECIMIENTO NETO"
              info="Conductores que entraron menos conductores que se fueron en el período. Si es positivo, la base de conductores crece; si es negativo, se achica."
              value={fmtNeto(actual.conductores.altas - actual.conductores.bajas)}
              difAnterior={difUnidades(
                actual.conductores.altas - actual.conductores.bajas,
                anterior ? anterior.conductores.altas - anterior.conductores.bajas : null,
              )}
              nombreAnterior={nombreAnterior}
              sinObjetivo
              detalle={
                <>
                  {fmtInt(actual.conductores.altas)} {actual.conductores.altas === 1 ? 'alta' : 'altas'} −{' '}
                  {fmtInt(actual.conductores.bajas)} {actual.conductores.bajas === 1 ? 'baja' : 'bajas'}
                </>
              }
            />
            <KpiCard
              label={actual.proyeccion ? 'FACTURACIÓN PROYECTADA' : 'FACTURACIÓN'}
              info={actual.proyeccion
                ? 'Cuánto esperamos facturar al cierre del período si la ocupación se mantiene como hoy. Se calcula con lo que factura en promedio cada turno ocupado.'
                : 'Lo que se le facturó a los conductores en el período según su contrato: alquiler del vehículo, garantía o Toshipass.'}
              value={fmtMoneda(actual.proyeccion ? actual.proyeccion.total : actual.facturado)}
              objetivo={
                actual.proyeccion
                  ? actual.proyeccion.objetivo !== null ? fmtMonedaCorta(actual.proyeccion.objetivo) : null
                  : actual.objetivo.facturacion !== null ? fmtMonedaCorta(actual.objetivo.facturacion) : null
              }
              difObjetivo={
                actual.proyeccion
                  ? difRelativa(actual.proyeccion.total, actual.proyeccion.objetivo)
                  : difRelativa(actual.facturado, actual.objetivo.facturacion)
              }
              difAnterior={difRelativa(actual.proyeccion ? actual.proyeccion.total : actual.facturado, anterior?.facturado ?? null)}
              nombreAnterior={nombreAnterior}
              detalle={
                actual.proyeccion ? (
                  <>
                    {actual.facturado !== null ? <>{fmtMonedaCorta(actual.facturado)} facturado · </> : null}
                    {fmtMonedaCorta(actual.proyeccion.proyectado)} proyectado
                  </>
                ) : actual.composicion ? (
                  <Desglose
                    filas={[
                      { label: 'Alquiler', valor: actual.composicion.alquiler },
                      { label: 'Garantía', valor: actual.composicion.garantia },
                      { label: 'Toshipass', valor: actual.composicion.toshipass },
                    ]}
                  />
                ) : cumplFact !== null ? (
                  <>Cumplimiento del forecast: <strong>{fmtPct(cumplFact)}</strong></>
                ) : null
              }
              aviso={
                actual.proyeccion
                  ? `${fmtMonedaCorta(actual.proyeccion.tarifa)} por turno ocupado por día`
                  : actual.facturado === null
                    ? 'Sin período de facturación todavía'
                    : actual.facturacionProvisoria ? 'Período de facturación abierto: monto provisorio' : null
              }
            />
            <KpiCard
              label="% COBRANZA"
              info="Qué parte de lo facturado ya cobramos. Se cobra por Cabify (se descuenta de lo que el conductor gana en la app) o por pago manual. Pendiente: lo que falta cobrar."
              value={fmtPct(actual.cobranza)}
              objetivo={actual.objetivo.cobranza !== null ? fmtPct(actual.objetivo.cobranza) : null}
              difObjetivo={difPuntos(actual.cobranza, actual.objetivo.cobranza)}
              difAnterior={difPuntos(actual.cobranza, anterior?.cobranza ?? null)}
              nombreAnterior={nombreAnterior}
              detalle={
                actual.cobrado !== null && actual.facturado !== null ? (
                  <Desglose
                    filas={[
                      { label: 'Pago Cabify', valor: actual.cobradoCabify ?? 0 },
                      { label: 'Pago manual', valor: actual.cobradoManual ?? 0 },
                      { label: 'Pendiente', valor: Math.max(actual.facturado - actual.cobrado, 0) },
                    ]}
                  />
                ) : null
              }
            />
          </div>
        </section>
      ) : null}

      {periodos.length ? (
        <>
          <Evolucion
            periodos={periodos}
            seleccionado={actual?.key ?? null}
            onSeleccionar={setSeleccionado}
          />
          <Tabla
            periodos={periodos}
            granularidad={granularidad}
            seleccionado={actual?.key ?? null}
            onSeleccionar={setSeleccionado}
          />
          {actual ? <IndicadoresModulos periodo={actual} hoy={hoy} motivosGeneral={motivosGeneral} /> : null}
        </>
      ) : null}

      {mostrarForecast ? (
        <ForecastModal
          sedeId={sedeActualId ?? null}
          sedeNombre={sedeNombre}
          hoy={hoy}
          onClose={() => setMostrarForecast(false)}
          onSaved={recargar}
        />
      ) : null}
    </div>
  )
}
