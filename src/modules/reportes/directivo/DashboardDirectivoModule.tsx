// src/modules/reportes/directivo/DashboardDirectivoModule.tsx
// Dashboard Directivo: tracción de la operación para dirección e inversores.
// Números: función SQL get_dashboard_directivo. Análisis: /api/insights-directivo
// (Gemini, en el servidor), con lecturas por reglas como respaldo.
// No depende de otros módulos.
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, Info, Sparkles, TrendingUp } from 'lucide-react'
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
import type { DirectivoRaw, Lectura, PresetPeriodo, Variacion } from './directivoTypes'
import { useDirectivoData, useInsightsIA } from './useDirectivoData'
import {
  DIMENSIONES_PERFIL,
  MUESTRA_MINIMA,
  PRESETS,
  PRESET_DEFAULT,
  caminoALaCalle,
  etiquetaRangoSemanas,
  etiquetaSemana,
  fechaCorta,
  fmtDias,
  fmtInt,
  fmtPct,
  generarLecturas,
  hoyArgentina,
  mesAnio,
  perfilPorDimension,
  rangoDePreset,
  ratio,
  retencionPromedioPerfil,
  semanaLabel,
  sumarDias,
  tasaRetencion,
  totalesPerfil,
  variacion,
  ventanasPerfil,
} from './directivoTypes'
import { LoadingOverlay } from '../../../components/ui/LoadingOverlay'
import { AdaptiveTooltip } from '../../../components/ui/AdaptiveTooltip'
import './DashboardDirectivoModule.css'

const fmtSemanas = (v: number | null) =>
  v === null ? '—' : `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(v)} sem.`

function InfoIcon({ text }: { text: string }) {
  return (
    <AdaptiveTooltip content={text} width={270} variant="dark">
      <span className="ddir-info" aria-label={text}>
        <Info size={13} strokeWidth={2} />
      </span>
    </AdaptiveTooltip>
  )
}

interface KpiProps {
  label: string
  value?: ReactNode
  subtitle?: ReactNode
  variacion?: Variacion | null
  esHoy?: boolean
  info: string
}

function Kpi({ label, value, subtitle, variacion: v, esHoy, info }: KpiProps) {
  return (
    <div className="ddir-kpi">
      <span className="ddir-kpi-label">
        <span>{label}</span>
        {esHoy ? <span className="ddir-badge-hoy">ACTUAL</span> : null}
        <InfoIcon text={info} />
      </span>
      <span className="ddir-kpi-value">{value ?? '—'}</span>
      {v ? <span className={`ddir-kpi-var ddir-kpi-var--${v.tono}`}>{v.texto}</span> : null}
      {subtitle ? <span className="ddir-kpi-subtitle">{subtitle}</span> : null}
    </div>
  )
}

interface CardProps {
  title: string
  subtitle?: string
  extra?: ReactNode
  children: ReactNode
}

function Card({ title, subtitle, extra, children }: CardProps) {
  return (
    <section className="ddir-card">
      <header className="ddir-card-header">
        <div>
          <h2 className="ddir-card-title">{title}</h2>
          {subtitle ? <p className="ddir-card-subtitle">{subtitle}</p> : null}
        </div>
        {extra}
      </header>
      {children}
    </section>
  )
}

// ───────────── Selector de período ─────────────

interface SelectorProps {
  preset: PresetPeriodo
  desde: string
  hasta: string
  hastaVisible: string
  anterior?: { desde: string; hasta: string }
  onPreset: (p: PresetPeriodo) => void
  onRango: (desde: string, hasta: string) => void
}

function SelectorPeriodo({ preset, desde, hasta, hastaVisible, anterior, onPreset, onRango }: SelectorProps) {
  return (
    <div className="ddir-periodo">
      <div className="ddir-periodo-controles">
        <label className="ddir-periodo-label" htmlFor="ddir-preset">Período</label>
        <select
          id="ddir-preset"
          className="ddir-select"
          value={preset}
          onChange={e => onPreset(e.target.value as PresetPeriodo)}
        >
          {PRESETS.map(p => {
            if (p.id === 'personalizado') return <option key={p.id} value={p.id}>{p.label}</option>
            const r = rangoDePreset(p.id, hoyArgentina())
            return <option key={p.id} value={p.id}>{p.label} · {etiquetaRangoSemanas(r.desde, r.hasta)}</option>
          })}
        </select>
        {preset === 'personalizado' ? (
          <>
            <label className="ddir-periodo-label" htmlFor="ddir-desde">Desde</label>
            <input
              id="ddir-desde"
              type="date"
              className="ddir-select"
              value={desde}
              max={hasta}
              onChange={e => e.target.value && onRango(e.target.value, hasta)}
            />
            <label className="ddir-periodo-label" htmlFor="ddir-hasta">Hasta</label>
            <input
              id="ddir-hasta"
              type="date"
              className="ddir-select"
              value={hasta}
              min={desde}
              onChange={e => e.target.value && onRango(desde, e.target.value)}
            />
          </>
        ) : null}
      </div>
      <div className="ddir-periodo-info">
        <span className="ddir-semana-hoy">Hoy: {etiquetaSemana(hoyArgentina())}</span>
        <span className="ddir-periodo-rango">
          <strong>{etiquetaRangoSemanas(desde, hasta)}</strong> ({fechaCorta(desde)} – {fechaCorta(hastaVisible)})
          {anterior ? ` · comparado con ${etiquetaRangoSemanas(anterior.desde, anterior.hasta)}` : ''}
        </span>
      </div>
    </div>
  )
}

// ───────────── KPIs ─────────────

function Kpis({ d }: { d: DirectivoRaw }) {
  const a = d.periodo.actual
  const b = d.periodo.anterior
  const s = d.hoy_snapshot
  const netoA = a.altas + a.reactivaciones - a.bajas
  const convA = ratio(a.con_primer_turno, a.leads)
  const convB = ratio(b.con_primer_turno, b.leads)
  const ret12A = tasaRetencion(a.retencion.find(h => h.semanas === 12))
  const ret12B = tasaRetencion(b.retencion.find(h => h.semanas === 12))
  const ret12Base = a.retencion.find(h => h.semanas === 12)
  const churnA = a.activos_inicio > 0 ? a.bajas / a.activos_inicio : null
  const churnB = b.activos_inicio > 0 ? b.bajas / b.activos_inicio : null

  return (
    <div className="ddir-kpis">
      <Kpi
        label="ACTIVE DRIVERS"
        esHoy
        value={fmtInt(s.conductores_en_la_calle)}
        subtitle={`En la calle · ${fmtInt(s.conductores_en_espera)} en espera de vehículo · net adds ${netoA >= 0 ? '+' : ''}${fmtInt(netoA)}`}
        info="Conductores activos con una asignación vigente, sin importar cuándo empezó. En espera: activos sin vehículo asignado. Net adds = altas + reactivaciones − bajas del período."
      />
      <Kpi
        label="LEAD-TO-DRIVER CONVERSION"
        value={fmtPct(convA)}
        variacion={variacion(convA, convB, 'pp', true)}
        subtitle={`${fmtInt(a.con_primer_turno)} de ${fmtInt(a.leads)} leads del período ya salieron a la calle`}
        info="Leads creados en el período que ya tuvieron su primer turno. En períodos muy recientes es más baja porque muchos leads todavía están en proceso."
      />
      <Kpi
        label="TIME TO DRIVER"
        value={fmtDias(a.dias_a_la_calle_mediana)}
        variacion={variacion(a.dias_a_la_calle_mediana, b.dias_a_la_calle_mediana, 'dias', false)}
        subtitle={a.dias_a_la_calle_p90 !== null ? `De lead a primer turno · el 90% sale en ${Math.round(a.dias_a_la_calle_p90)} días o menos` : 'De lead a primer turno'}
        info="Mediana de días entre la creación del lead y el primer turno, para los conductores que arrancaron en el período."
      />
      <Kpi
        label="12-WEEK RETENTION"
        value={fmtPct(ret12A)}
        variacion={variacion(ret12A, ret12B, 'pp', true)}
        subtitle={ret12Base && ret12Base.base > 0
          ? `${fmtInt(ret12Base.retenidos)} de ${fmtInt(ret12Base.base)} conductores seguían activos`
          : 'Sin conductores que cumplan 12 semanas en el período'}
        info="De los conductores que cumplieron 12 semanas desde su primer turno dentro del período, qué porcentaje seguía activo en ese momento."
      />
      <Kpi
        label="CHURN"
        value={fmtPct(churnA)}
        variacion={variacion(churnA, churnB, 'pp', false)}
        subtitle={`${fmtInt(a.bajas)} bajas sobre ${fmtInt(a.activos_inicio)} activos al inicio del período`}
        info="Bajas del período divididas por los conductores activos al inicio del período."
      />
      <Kpi
        label="DRIVER LIFETIME"
        value={fmtSemanas(a.permanencia_mediana_semanas)}
        variacion={variacion(a.permanencia_mediana_semanas, b.permanencia_mediana_semanas, 'semanas', true)}
        subtitle={`Permanencia mediana de los ${fmtInt(a.bajas)} conductores dados de baja en el período`}
        info="Mediana de semanas efectivamente activas (sin contar períodos de baja) de los conductores que se dieron de baja en el período."
      />
      <Kpi
        label="% OCUPACIÓN"
        esHoy
        value={fmtPct(s.ocupacion)}
        subtitle={`${fmtInt(s.turnos_disponibles)} turnos libres de ${fmtInt(s.turnos_totales)}`}
        info="Turnos ocupados sobre el total de turnos de la flota."
      />
      <Kpi
        label="% OPERATIVIDAD"
        esHoy
        value={fmtPct(s.operatividad)}
        subtitle={`${fmtInt(s.en_uso)} en uso de ${fmtInt(s.total_flota)} vehículos`}
        info="Vehículos en uso sobre el total de la flota."
      />
    </div>
  )
}

// ───────────── Insights ─────────────

function Insights({ d, desde, hasta }: { d: DirectivoRaw; desde: string; hasta: string }) {
  const { insights, isLoading } = useInsightsIA(desde, hasta)
  const reglas = useMemo(() => generarLecturas(d), [d])
  const lecturas: Lectura[] = insights?.insights ?? reglas
  const conIA = insights !== null

  return (
    <Card
      title="Key Insights"
      subtitle={conIA
        ? 'Análisis con IA a partir de los indicadores de esta pantalla (se genera una vez por semana)'
        : 'Lecturas calculadas a partir de los indicadores de esta pantalla'}
      extra={conIA
        ? <span className="ddir-badge-ia"><Sparkles size={13} /> IA</span>
        : isLoading ? <span className="ddir-card-subtitle">Buscando análisis…</span> : null}
    >
      <div className="ddir-lecturas">
        {lecturas.map(lec => (
          <div className={`ddir-lectura ddir-lectura--${lec.tono}`} key={lec.titulo}>
            <span className="ddir-lectura-icon" aria-hidden="true">
              {lec.tono === 'positivo' ? <TrendingUp size={16} /> : <AlertTriangle size={16} />}
            </span>
            <div>
              <p className="ddir-lectura-titulo">{lec.titulo}</p>
              <p className="ddir-lectura-detalle">{lec.detalle}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ───────────── Crecimiento semanal ─────────────

function Crecimiento({ d }: { d: DirectivoRaw }) {
  const serie = d.serie_semanal.map(s => ({
    ...s,
    label: semanaLabel(s.semana),
    etiqueta: `${etiquetaSemana(s.semana)} (${fechaCorta(s.semana)} – ${fechaCorta(sumarDias(s.semana, 6))})`,
  }))
  const altasEstimadas = serie.reduce((acc, s) => acc + s.altas_estimadas, 0)
  const bajasEstimadas = serie.reduce((acc, s) => acc + s.bajas_estimadas, 0)
  const tick = { fill: 'var(--text-tertiary, #6b7280)', fontSize: 12 }

  return (
    <Card title="Net Driver Growth" subtitle="Crecimiento de conductores por semana · ingresos, bajas y activos al cierre de cada semana">
      <div className="ddir-chart">
        <ResponsiveContainer width="99%" height="100%">
          <ComposedChart data={serie} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border-primary, #e5e7eb)" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={tick} />
            <YAxis yAxisId="mov" axisLine={false} tickLine={false} allowDecimals={false} tick={tick} />
            <YAxis yAxisId="act" orientation="right" axisLine={false} tickLine={false} allowDecimals={false} tick={tick} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} labelFormatter={(_l, payload) => payload?.[0]?.payload?.etiqueta ?? ''} />
            <Legend verticalAlign="top" height={32} iconType="square" wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="mov" dataKey="altas" name="New" stackId="ingresos" fill="#16a34a" maxBarSize={18} isAnimationActive={false} />
            <Bar yAxisId="mov" dataKey="reactivaciones" name="Reactivated" stackId="ingresos" fill="#86efac" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            <Bar yAxisId="mov" dataKey="bajas" name="Churned" fill="#dc2626" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            <Line yAxisId="act" dataKey="activos_fin" name="Activos al cierre" type="monotone" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {altasEstimadas > 0 || bajasEstimadas > 0 ? (
        <p className="ddir-note">
          Fechas estimadas por falta de dato en la ficha: {fmtInt(altasEstimadas)} altas (sin fecha de contratación)
          y {fmtInt(bajasEstimadas)} bajas (sin fecha de terminación).
        </p>
      ) : null}
    </Card>
  )
}

// ───────────── Embudo ─────────────

function Embudo({ d }: { d: DirectivoRaw }) {
  const a = d.periodo.actual
  const etapas = [
    { etapa: 'Leads creados', valor: a.leads },
    { etapa: 'Aceptan oferta', valor: a.aceptan_oferta },
    { etapa: 'Convertidos a conductor', valor: a.convertidos },
    { etapa: 'Salieron a la calle', valor: a.con_primer_turno },
  ]
  const base = etapas[0].valor

  return (
    <Card title="Conversion Funnel" subtitle="Embudo de adquisición · leads creados en el período">
      <div className="ddir-funnel">
        {etapas.map((e, i) => {
          const ancho = base > 0 ? Math.max(Math.min((e.valor / base) * 100, 100), e.valor > 0 ? 2 : 0) : 0
          const previo = i > 0 ? etapas[i - 1].valor : 0
          return (
            <div className="ddir-funnel-row" key={e.etapa}>
              <span className="ddir-funnel-label">{e.etapa}</span>
              <div className="ddir-funnel-track">
                <div className="ddir-funnel-fill" style={{ width: `${ancho}%` }} />
              </div>
              <span className="ddir-funnel-value">{fmtInt(e.valor)}</span>
              <span className="ddir-funnel-pct">{i === 0 ? '' : fmtPct(ratio(e.valor, previo))}</span>
            </div>
          )
        })}
      </div>
      <p className="ddir-note">La última columna es el porcentaje que avanza desde la etapa anterior.</p>
      {d.motivos_cierre.length > 0 ? (
        <div className="ddir-motivos">
          <span className="ddir-causales-title">
            Por qué se pierden leads ({fmtInt(a.cerrados_sin_conversion)} cerrados)
          </span>
          {d.motivos_cierre.map(m => (
            <div className="ddir-causal" key={m.motivo}>
              <span>{m.motivo}</span>
              <span className="ddir-causal-pct">{fmtPct(ratio(m.cantidad, a.cerrados_sin_conversion))}</span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  )
}

// ───────────── Zonas ─────────────

function Zonas({ d }: { d: DirectivoRaw }) {
  const filas = d.zonas.filter(z => z.leads > 0 || z.activos_hoy > 0 || z.nuevos_en_la_calle > 0)
  const maxLeads = Math.max(1, ...filas.map(z => z.leads))
  return (
    <Card title="Alcance por zona" subtitle="Leads y conductores nuevos del período · conductores en la calle actualmente">
      <div className="ddir-tabla-wrap">
        <table className="ddir-tabla">
          <thead>
            <tr>
              <th>Zona</th>
              <th className="num">Leads</th>
              <th className="num">Salieron a la calle</th>
              <th className="num">Conversión real</th>
              <th className="num">Nuevos en la calle</th>
              <th className="num">En la calle</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(z => (
              <tr key={z.zona}>
                <td>
                  <span>{z.zona}</span>
                  <span className="ddir-mini-bar" style={{ width: `${(z.leads / maxLeads) * 100}%` }} aria-hidden="true" />
                </td>
                <td className="num">{fmtInt(z.leads)}</td>
                <td className="num">{fmtInt(z.leads_con_turno)}</td>
                <td className="num">{fmtPct(ratio(z.leads_con_turno, z.leads))}</td>
                <td className="num">{fmtInt(z.nuevos_en_la_calle)}</td>
                <td className="num">{fmtInt(z.activos_hoy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ───────────── Camino a la calle ─────────────

function CaminoALaCalle({ d }: { d: DirectivoRaw }) {
  const a = d.periodo.actual
  const camino = caminoALaCalle(a)
  const sinLead = a.conductores_nuevos - a.nuevos_con_lead
  const pctCaptacion = camino ? Math.round(camino.shareCaptacion * 100) : 0
  const caidasVar = variacion(a.caidas, d.periodo.anterior.caidas, 'num', false)
  return (
    <Card
      title="Time to Driver"
      subtitle={`Camino a la calle: cuánto tarda un lead en hacer su primer turno · ${fmtInt(a.nuevos_con_lead)} conductores que arrancaron en el período`}
    >
      {camino === null ? (
        <p className="ddir-note">Sin conductores con lead registrado que hayan arrancado en el período.</p>
      ) : (
        <>
          <div className="ddir-camino-head">
            <span className="ddir-camino-total-valor">{fmtDias(camino.total)}</span>
            <span className="ddir-camino-total-label">de lead a primer turno (caso típico)</span>
          </div>
          <div className="ddir-camino-barra" role="img" aria-label={`Captación ${pctCaptacion}%, entrega ${100 - pctCaptacion}%`}>
            {camino.captacion > 0 && <div className="ddir-camino-seg ddir-camino-seg--cap" style={{ flexGrow: camino.shareCaptacion }} />}
            {camino.entrega > 0 && <div className="ddir-camino-seg ddir-camino-seg--ent" style={{ flexGrow: 1 - camino.shareCaptacion }} />}
          </div>
          <div className="ddir-camino-etapas">
            <div className="ddir-camino-etapa">
              <span className="ddir-camino-dot ddir-camino-seg--cap" />
              <div>
                <strong>{fmtDias(camino.captacion)}</strong> · captación y documentación
                <span className="ddir-camino-sub">Lead → conductor · {pctCaptacion}% del tiempo</span>
              </div>
            </div>
            <div className="ddir-camino-etapa">
              <span className="ddir-camino-dot ddir-camino-seg--ent" />
              <div>
                <strong>{fmtDias(camino.entrega)}</strong> · entrega del vehículo
                <span className="ddir-camino-sub">Conductor → primer turno · {100 - pctCaptacion}% del tiempo</span>
              </div>
            </div>
          </div>
        </>
      )}
      {sinLead > 0 && (
        <p className="ddir-note">{fmtInt(sinLead)} conductores nuevos sin lead registrado no se incluyen.</p>
      )}
      {typeof a.caidas === 'number' && (
      <div className="ddir-motivos">
        <div className="ddir-caidas-head">
          <span className="ddir-causales-title">Programados que no llegaron a la calle</span>
          <span className="ddir-caidas-valor">{fmtInt(a.caidas)}</span>
        </div>
        {caidasVar && <span className={`ddir-kpi-var ddir-kpi-var--${caidasVar.tono}`}>{caidasVar.texto}</span>}
        <span className="ddir-camino-sub">Tuvieron una programación cancelada y nunca hicieron su primer turno.</span>
        {(d.motivos_caidas ?? []).map(m => (
          <div className="ddir-causal" key={m.motivo}>
            <span>{m.motivo}</span>
            <span className="ddir-causal-pct">{fmtInt(m.cantidad)} · {fmtPct(ratio(m.cantidad, a.caidas))}</span>
          </div>
        ))}
      </div>
      )}
    </Card>
  )
}

// ───────────── Retención ─────────────

function Retencion({ d }: { d: DirectivoRaw }) {
  return (
    <Card title="Cohort Retention" subtitle="Retención de conductores nuevos · % activo al cumplir N semanas desde el primer turno (hitos cumplidos en el período)">
      <div className="ddir-ret">
        {d.periodo.actual.retencion.map(h => {
          const tasa = tasaRetencion(h)
          return (
            <div className="ddir-ret-row" key={h.semanas}>
              <span className="ddir-funnel-label">Semana {h.semanas}</span>
              <div className="ddir-funnel-track">
                <div className="ddir-ret-fill" style={{ width: `${tasa !== null ? tasa * 100 : 0}%` }} />
              </div>
              <span className="ddir-funnel-value">{fmtPct(tasa)}</span>
              <span className="ddir-funnel-pct">{h.base > 0 ? `n=${fmtInt(h.base)}` : 'sin datos'}</span>
            </div>
          )
        })}
      </div>
      <div className="ddir-mini-grid">
        <div className="ddir-mini">
          <span className="ddir-mini-value">{fmtSemanas(d.hoy_snapshot.antiguedad_mediana_semanas)}</span>
          <span className="ddir-mini-label">Antigüedad mediana de los activos hoy</span>
        </div>
        <div className="ddir-mini">
          <span className="ddir-mini-value">{fmtSemanas(d.periodo.actual.permanencia_mediana_semanas)}</span>
          <span className="ddir-mini-label">Permanencia mediana de las bajas del período</span>
        </div>
      </div>
    </Card>
  )
}

// ───────────── Perfil ─────────────

function Perfil({ d }: { d: DirectivoRaw }) {
  const [dimension, setDimension] = useState(DIMENSIONES_PERFIL[0])
  const filas = perfilPorDimension(d, dimension)
  const promedio = retencionPromedioPerfil(d)
  // Columnas sin datos para esta dimensión no se muestran (ej.: los leads no tienen turno)
  const conRetencion = filas.some(f => f.base > 0)
  const conConversion = filas.some(f => f.leads > 0)
  const hayHistoricas = filas.some(f => f.tipo === 'historica')
  const total = totalesPerfil(d)
  const v = ventanasPerfil(d.hoy)
  const esFuente = dimension === 'Fuente del lead'

  return (
    <Card
      title="Ideal Driver Profile"
      subtitle={`Perfil de los conductores que más duran · arrancaron entre ${mesAnio(v.conductoresDesde)} y ${mesAnio(v.conductoresHasta)} (ya cumplieron 12 semanas) · leads creados entre ${mesAnio(v.leadsDesde)} y ${mesAnio(v.leadsHasta)}`}
    >
      <div className="ddir-tabs" role="tablist" aria-label="Dimensión del perfil">
        {DIMENSIONES_PERFIL.map(dim => (
          <button
            key={dim}
            type="button"
            role="tab"
            aria-selected={dim === dimension}
            className={`ddir-tab ${dim === dimension ? 'ddir-tab--on' : ''}`}
            onClick={() => setDimension(dim)}
          >
            {dim}
          </button>
        ))}
      </div>
      <div className="ddir-tabla-wrap">
        <table className="ddir-tabla">
          <thead>
            {/* Dos poblaciones distintas: conductores (cuánto duran) y leads (cuántos llegan a la calle) */}
            <tr className="ddir-tabla-grupos">
              <th />
              {conRetencion && <th colSpan={2} className="num">Conductores · ¿cuánto duran?</th>}
              {conConversion && <th colSpan={2} className="num">Leads · ¿cuántos salen a la calle?</th>}
            </tr>
            <tr>
              <th>{dimension}</th>
              {conRetencion && <th className="num">Conductores</th>}
              {conRetencion && <th className="num">Retención 12 sem.</th>}
              {conConversion && <th className="num">Leads</th>}
              {conConversion && <th className="num">Conversión real</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map(f => {
              const comparable = f.tipo === 'normal'
              const muestraChica = f.base < MUESTRA_MINIMA
              const diff = comparable && !muestraChica && f.retencion !== null && promedio !== null ? f.retencion - promedio : null
              // Solo se destaca una diferencia clara (±10 pp); el resto queda neutro
              const destacada = diff !== null && Math.abs(diff) >= 0.1
              const tono = !destacada ? '' : diff > 0 ? 'ddir-bueno' : 'ddir-malo'
              return (
                <tr key={f.valor} className={comparable ? undefined : 'ddir-fila-atenuada'}>
                  <td>
                    <span className="ddir-valor">
                      {f.valor}
                      {f.tipo === 'historica' && <span className="ddir-tag">Histórica · referencia</span>}
                    </span>
                  </td>
                  {conRetencion && <td className="num">{fmtInt(f.base)}</td>}
                  {conRetencion && (
                    <td className={`num ${tono}`}>
                      {f.base === 0 ? '—' : muestraChica ? <span className="ddir-muted">muestra chica</span> : fmtPct(f.retencion)}
                      {destacada && <span className="ddir-diff">{diff > 0 ? '+' : '−'}{Math.round(Math.abs(diff) * 100)} pp</span>}
                    </td>
                  )}
                  {conConversion && <td className="num">{fmtInt(f.leads)}</td>}
                  {conConversion && (
                    <td className="num">
                      {f.leads === 0 ? '—' : f.leads >= MUESTRA_MINIMA ? fmtPct(f.conversion) : <span className="ddir-muted">muestra chica</span>}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="ddir-fila-total">
              <td>{esFuente ? 'Total (todas las fuentes)' : 'Total'}</td>
              {conRetencion && <td className="num">{fmtInt(total.base)}</td>}
              {conRetencion && <td className="num">{fmtPct(total.retencion)}</td>}
              {conConversion && <td className="num">{fmtInt(total.leads)}</td>}
              {conConversion && <td className="num">{fmtPct(total.conversion)}</td>}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="ddir-note">
        En verde o rojo: segmentos que se alejan 10 puntos o más de la retención total (mínimo {MUESTRA_MINIMA}{' '}
        conductores). Indica asociación, no causa.
        {hayHistoricas && ' Intercom: solo referencia, la herramienta actual es Sellium.'}
      </p>
    </Card>
  )
}

// ───────────── Módulo ─────────────

export function DashboardDirectivoModule() {
  const [preset, setPreset] = useState<PresetPeriodo>(PRESET_DEFAULT)
  const [rango, setRango] = useState(() => rangoDePreset(PRESET_DEFAULT, hoyArgentina()))
  const { data, isLoading, error } = useDirectivoData(rango.desde, rango.hasta)
  const hoy = hoyArgentina()

  const onPreset = (p: PresetPeriodo) => {
    setPreset(p)
    if (p !== 'personalizado') setRango(rangoDePreset(p, hoyArgentina()))
  }

  return (
    <div className="ddir-module">
      <LoadingOverlay show={isLoading} message="Cargando indicadores directivos..." size="lg" />

      <SelectorPeriodo
        preset={preset}
        desde={rango.desde}
        hasta={rango.hasta}
        hastaVisible={rango.hasta > hoy ? hoy : rango.hasta}
        anterior={data?.periodo.anterior}
        onPreset={onPreset}
        onRango={(desde, hasta) => setRango({ desde, hasta })}
      />

      {error ? <div className="ddir-error" role="alert">{error}</div> : null}

      {data ? (
        <>
          <Kpis d={data} />
          <Insights d={data} desde={rango.desde} hasta={rango.hasta} />
          <div className="ddir-row">
            <Crecimiento d={data} />
            <Embudo d={data} />
          </div>
          <div className="ddir-row ddir-row--half">
            <Zonas d={data} />
            <CaminoALaCalle d={data} />
          </div>
          <div className="ddir-row ddir-row--retperfil">
            <Retencion d={data} />
            <Perfil d={data} />
          </div>
        </>
      ) : null}
    </div>
  )
}
