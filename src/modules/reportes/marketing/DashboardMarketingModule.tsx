// src/modules/reportes/marketing/DashboardMarketingModule.tsx
// Dashboard Marketing: rendimiento de la captación de conductores, para revisar con la
// agencia que hace la pauta, con los mismos términos que usa Toshify.
// Números: función SQL get_dashboard_marketing (sql/dashboard_marketing.sql).
// Solo datos agregados: no muestra nombres, teléfonos ni DNI. No incluye costos de pauta.
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, Info } from 'lucide-react'
import { AdaptiveTooltip } from '../../../components/ui/AdaptiveTooltip'
import { LoadingOverlay } from '../../../components/ui/LoadingOverlay'
import { ZonasPendientesChart } from '../../dashboard/components/ZonasPendientesChart'
import {
  etiquetaSemana,
  fechaCorta,
  fmtInt,
  fmtPct,
  hoyArgentina,
  rangoDePreset,
  ratio,
  variacion,
} from '../directivo/directivoTypes'
import type { Variacion } from '../directivo/directivoTypes'
import { DateRangeSelector } from '../../../components/ui/DateRangeSelector'
import type { DateRange } from '../../../components/ui/DateRangeSelector'
import {
  FILTROS_SEGMENTO,
  enSegmento,
  sumarPorSegmento,
  GLOSARIO,
  PERFILES,
  anuncioCorto,
  calidadDe,
  calidadPorCanal,
  causalesDe,
  controlDe,
  descartesDe,
  embudoDe,
  zonasDe,
} from './marketingTypes'
import type { FiltroSegmento, FilaRendimiento, MarketingRaw, Perfil } from './marketingTypes'
import { useMarketingData } from './useMarketingData'
import '../directivo/DashboardDirectivoModule.css'
import '../DashboardKpisModule.css'
import './DashboardMarketingModule.css'

// ───────────── Piezas comunes ─────────────

function InfoIcon({ text }: { text: string }) {
  return (
    <AdaptiveTooltip content={text} width={270} variant="dark">
      <span className="kpi-info-trigger" aria-label={text}>
        <Info size={13} strokeWidth={2} />
      </span>
    </AdaptiveTooltip>
  )
}

function Kpi({ label, value, subtitle, variacion: v, info }: {
  label: string
  value: ReactNode
  subtitle?: ReactNode
  variacion?: Variacion | null
  info: string
}) {
  return (
    <div className="stat-card">
      <div className="stat-content">
        <span className="stat-value">{value}</span>
        <span className="stat-label">
          <span className="stat-label-text">{label}</span>
          <InfoIcon text={info} />
        </span>
        {v ? <span className={`stat-subtitle mkt-var mkt-var--${v.tono}`}>{v.texto}</span> : null}
        {subtitle ? <span className="stat-subtitle">{subtitle}</span> : null}
      </div>
    </div>
  )
}

function Card({ title, subtitle, info, children }: { title: string; subtitle?: string; info?: string; children: ReactNode }) {
  return (
    <section className="ddir-card">
      <header className="ddir-card-header">
        <div>
          <h2 className="ddir-card-title mkt-card-title">
            {title}
            {info ? <InfoIcon text={info} /> : null}
          </h2>
          {subtitle ? <p className="ddir-card-subtitle">{subtitle}</p> : null}
        </div>
      </header>
      {children}
    </section>
  )
}

const CLASE_PERFIL: Record<Perfil, string> = {
  Cumple: 'mkt-perfil--cumple',
  Medio: 'mkt-perfil--medio',
  'No cumple': 'mkt-perfil--nocumple',
  'Sin datos': 'mkt-perfil--sindatos',
}

function BarraPerfiles({ perfiles, total }: { perfiles: Record<Perfil, number>; total: number }) {
  return (
    <div className="mkt-barra" role="img" aria-label={PERFILES.map(p => `${p}: ${perfiles[p]}`).join(', ')}>
      {PERFILES.map(p => (perfiles[p] > 0 && total > 0 ? (
        <span key={p} className={`mkt-barra-seg ${CLASE_PERFIL[p]}`} style={{ width: `${(perfiles[p] / total) * 100}%` }} title={`${p}: ${perfiles[p]}`} />
      ) : null))}
    </div>
  )
}

// ───────────── Selector de período y segmento ─────────────

function rangoUltimasSemanas(semanas: number): DateRange {
  const r = rangoDePreset(semanas === 12 ? 'ultimas_12' : 'ultimas_4', hoyArgentina())
  return { startDate: r.desde, endDate: r.hasta, label: `Últimas ${semanas} semanas`, type: 'custom' }
}

function Filtros({ rango, d, filtro, cargando, onRango, onFiltro }: {
  rango: DateRange
  d: MarketingRaw | null
  filtro: FiltroSegmento
  cargando: boolean
  onRango: (r: DateRange) => void
  onFiltro: (f: FiltroSegmento) => void
}) {
  const hoy = hoyArgentina()
  const atajos = useMemo(() => [4, 12].map(n => {
    const r = rangoUltimasSemanas(n)
    return { id: `ultimas-${n}`, label: r.label, range: r }
  }), [])
  const desde = rango.startDate
  const hasta = rango.endDate > hoy ? hoy : rango.endDate
  return (
    <div className="ddir-periodo mkt-periodo">
      <div className="ddir-periodo-controles">
        <DateRangeSelector
          selectedRange={rango}
          onRangeChange={onRango}
          disabled={cargando}
          showAllOption={false}
          placeholder="Elegir período"
          allowMonthYear
          extraShortcuts={atajos}
        />
        <div className="mkt-chips" role="group" aria-label="Origen de los leads">
          {FILTROS_SEGMENTO.map(f => (
            <AdaptiveTooltip key={f.id} content={f.info} width={250} variant="dark">
              <button
                type="button"
                className={`mkt-chip${filtro === f.id ? ' mkt-chip--activo' : ''}`}
                aria-pressed={filtro === f.id}
                onClick={() => onFiltro(f.id)}
              >
                {f.label}
              </button>
            </AdaptiveTooltip>
          ))}
        </div>
      </div>
      <div className="ddir-periodo-info">
        <span className="mkt-periodo-texto">
          Leads creados del <strong>{fechaCorta(desde)}</strong> al <strong>{fechaCorta(hasta)}</strong>
          {d ? <span className="ddir-muted"> · comparado con {fechaCorta(d.periodo.anterior.desde)} – {fechaCorta(d.periodo.anterior.hasta)}</span> : null}
        </span>
        <span className="ddir-semana-hoy">Hoy: {etiquetaSemana(hoy)}</span>
      </div>
    </div>
  )
}

// ───────────── Secciones ─────────────

function Kpis({ d, filtro }: { d: MarketingRaw; filtro: FiltroSegmento }) {
  const a = embudoDe(d, 'actual', filtro)
  const b = embudoDe(d, 'anterior', filtro)
  const cal = calidadDe(d, filtro)
  const totalCal = PERFILES.reduce((s, p) => s + cal[p], 0)
  return (
    <div className="dkpis-stats">
    <div className="dkpis-stats-grid mkt-kpis">
      <Kpi
        label="LEADS"
        value={fmtInt(a.leads)}
        variacion={variacion(a.leads, b.leads, 'num', true)}
        info="Personas que entraron a Toshibase en el período. No es lo mismo que las conversaciones que informa Meta: no todas se convierten en lead."
      />
      <Kpi
        label="LLEGARON A DOCUMENTACIÓN"
        value={fmtPct(ratio(a.documentacion, a.leads))}
        subtitle={`${fmtInt(a.documentacion)} precandidatos`}
        variacion={variacion(ratio(a.documentacion, a.leads), ratio(b.documentacion, b.leads), 'pp', true)}
        info="Leads del período que llegaron a la etapa de documentos (o más), sobre el total de leads del período."
      />
      <Kpi
        label="PERFIL CUMPLE"
        value={fmtPct(ratio(cal.Cumple, totalCal))}
        subtitle={`${fmtInt(cal.Cumple)} cumplen · ${fmtInt(cal.Medio)} perfil medio · de ${fmtInt(totalCal)} con propuesta`}
        info="Sobre los leads que llegaron a la propuesta (antes el chatbot no pregunta licencia, monotributo ni experiencia): 21 años o más, licencia D1, monotributo y experiencia manejando."
      />
      <Kpi
        label="APTOS"
        value={fmtInt(a.aptos)}
        subtitle={`${fmtPct(ratio(a.aptos, a.leads))} de los leads`}
        variacion={variacion(a.aptos, b.aptos, 'num', true)}
        info="Leads del período que pasaron la entrevista (Apto Inducción) o ya son conductores."
      />
      <Kpi
        label="CONDUCTORES NUEVOS"
        value={fmtInt(a.nuevos)}
        subtitle={`Conversión ${fmtPct(ratio(a.nuevos, a.leads))} · ${fmtInt(a.nuevos)} de ${fmtInt(a.leads)} leads del período`}
        variacion={variacion(a.nuevos, b.nuevos, 'num', true)}
        info="Leads creados en el período que ya recibieron su primer auto. Conversión = conductores nuevos ÷ leads del período (los dos sobre los mismos leads). Los que recibieron auto en el período pero entraron antes se informan aparte como fuera de rango."
      />
    </div>
    </div>
  )
}

function Embudo({ d, filtro }: { d: MarketingRaw; filtro: FiltroSegmento }) {
  const a = embudoDe(d, 'actual', filtro)
  const etapas = [
    { etapa: 'Leads', valor: a.leads },
    { etapa: 'Pasaron filtros (cobertura y edad)', valor: a.filtros },
    { etapa: 'Acepta oferta', valor: a.acepta },
    { etapa: 'Envió video introducción', valor: a.video },
    { etapa: 'Documentación', valor: a.documentacion },
    { etapa: 'Entrevista (inducción)', valor: a.entrevista },
    { etapa: 'Aptos', valor: a.aptos },
    { etapa: 'Convertidos a conductor', valor: a.convertidos },
    { etapa: 'Recibieron auto', valor: a.con_auto },
  ]
  const base = etapas[0].valor
  return (
    <Card
      title="Embudo de captación"
      subtitle="Leads que entraron en el período y hasta qué paso del chatbot llegaron"
      info="Se toma el estado actual de cada lead (no hay historial de estados): un lead descartado no suma en las etapas siguientes. Dónde se cayó se ve en Motivos de descarte (sin cobertura, edad, etc.)."
    >
      <div className="ddir-funnel">
        {etapas.map((e, i) => {
          const ancho = base > 0 ? Math.max(Math.min((e.valor / base) * 100, 100), e.valor > 0 ? 2 : 0) : 0
          return (
            <div className="ddir-funnel-row" key={e.etapa}>
              <span className="ddir-funnel-label">{e.etapa}</span>
              <div className="ddir-funnel-track"><div className="ddir-funnel-fill" style={{ width: `${ancho}%` }} /></div>
              <span className="ddir-funnel-value">{fmtInt(e.valor)}</span>
              <span className="ddir-funnel-pct">{i === 0 ? '' : fmtPct(ratio(e.valor, etapas[i - 1].valor))}</span>
            </div>
          )
        })}
      </div>
      <p className="ddir-note">
        La última columna es el porcentaje que avanza desde la etapa anterior. Descartados en el período: {fmtInt(a.descartados)}.
      </p>
    </Card>
  )
}

function Calidad({ d, filtro }: { d: MarketingRaw; filtro: FiltroSegmento }) {
  const cal = calidadDe(d, filtro)
  const total = PERFILES.reduce((s, p) => s + cal[p], 0)
  const porCanal = filtro === 'Pauta redes' ? calidadPorCanal(d) : []
  return (
    <Card
      title="Calidad de los leads"
      subtitle="Leads que llegaron a la propuesta: ¿cumplen el perfil?"
      info="Se mide sobre los leads que llegaron a la propuesta: antes el chatbot no pregunta licencia, monotributo ni experiencia. Cumple: 21 años o más, licencia D1, monotributo y experiencia. Medio: 21 o más con parte de los requisitos. No cumple: menor de 21, sin licencia o sin experiencia. Sin datos: falta información."
    >
      <BarraPerfiles perfiles={cal} total={total} />
      <div className="mkt-leyenda">
        {PERFILES.map(p => (
          <span key={p} className="mkt-leyenda-item">
            <span className={`mkt-dot ${CLASE_PERFIL[p]}`} />
            {p} <strong>{fmtInt(cal[p])}</strong> <span className="ddir-muted">({fmtPct(ratio(cal[p], total))})</span>
          </span>
        ))}
      </div>
      {porCanal.length > 0 ? (
        <div className="mkt-perfil-canales">
          {porCanal.map(c => (
            <div className="mkt-perfil-canal" key={c.canal}>
              <span className="mkt-perfil-canal-nombre">{c.canal}</span>
              <BarraPerfiles perfiles={c.perfiles} total={c.total} />
              <span className="mkt-perfil-canal-pct">{fmtPct(ratio(c.perfiles.Cumple, c.total))} cumple</span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  )
}

type ColumnaRend = 'clave' | 'leads' | 'cumple' | 'acepta' | 'documentacion' | 'aptos' | 'nuevos' | 'conversion'

const COLUMNAS_REND: { id: Exclude<ColumnaRend, 'clave'>; label: string }[] = [
  { id: 'leads', label: 'Leads' },
  { id: 'cumple', label: '% Cumple' },
  { id: 'acepta', label: 'Acepta oferta' },
  { id: 'documentacion', label: 'Documentación' },
  { id: 'aptos', label: 'Aptos' },
  { id: 'nuevos', label: 'Conductores nuevos' },
  { id: 'conversion', label: 'Conversión' },
]

function valorRend(f: FilaRendimiento, col: Exclude<ColumnaRend, 'clave'>): number {
  if (col === 'cumple') return f.calificables > 0 ? f.cumple / f.calificables : -1
  if (col === 'conversion') return f.leads > 0 ? f.nuevos / f.leads : -1
  return Number(f[col]) || 0
}

function TablaRendimiento({ filas, primeraColumna, renderPrimera }: {
  filas: ({ clave: string } & FilaRendimiento)[]
  primeraColumna: string
  renderPrimera: (clave: string) => ReactNode
}) {
  // Orden por columna: clic en el encabezado; segundo clic invierte. Por defecto, más leads primero.
  const [orden, setOrden] = useState<{ col: ColumnaRend; asc: boolean }>({ col: 'leads', asc: false })
  const maxLeads = Math.max(1, ...filas.map(f => f.leads))

  const ordenadas = useMemo(() => {
    const dir = orden.asc ? 1 : -1
    return [...filas].sort((a, b) => {
      const cmp = orden.col === 'clave'
        ? a.clave.localeCompare(b.clave, 'es')
        : valorRend(a, orden.col) - valorRend(b, orden.col)
      return cmp * dir || b.leads - a.leads || a.clave.localeCompare(b.clave, 'es')
    })
  }, [filas, orden])

  const ordenarPor = (col: ColumnaRend) =>
    setOrden(o => (o.col === col ? { col, asc: !o.asc } : { col, asc: col === 'clave' }))

  const encabezado = (col: ColumnaRend, label: string, num: boolean) => {
    const activo = orden.col === col
    const Icono = !activo ? ChevronsUpDown : orden.asc ? ChevronUp : ChevronDown
    return (
      <th
        key={col}
        className={num ? 'num' : undefined}
        aria-sort={activo ? (orden.asc ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          className={`mkt-orden${activo ? ' mkt-orden--activo' : ''}`}
          onClick={() => ordenarPor(col)}
          title={`Ordenar por ${label.toLowerCase()}`}
        >
          {label}
          <Icono size={12} aria-hidden="true" />
        </button>
      </th>
    )
  }

  return (
    <div className="ddir-tabla-wrap">
      <table className="ddir-tabla">
        <thead>
          <tr>
            {encabezado('clave', primeraColumna, false)}
            {COLUMNAS_REND.map(c => encabezado(c.id, c.label, true))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map(f => (
            <tr key={f.clave}>
              <td>
                {renderPrimera(f.clave)}
                <span className="ddir-mini-bar" style={{ width: `${(f.leads / maxLeads) * 100}%` }} aria-hidden="true" />
              </td>
              <td className="num">{fmtInt(f.leads)}</td>
              <td className="num">{fmtPct(ratio(f.cumple, f.calificables))}</td>
              <td className="num">{fmtInt(f.acepta)}</td>
              <td className="num">{fmtInt(f.documentacion)}</td>
              <td className="num">{fmtInt(f.aptos)}</td>
              <td className="num">{fmtInt(f.nuevos)}</td>
              <td className="num">{fmtPct(ratio(f.nuevos, f.leads))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Canales({ d }: { d: MarketingRaw }) {
  if (d.canales.length === 0) return null
  return (
    <Card
      title="Rendimiento por canal"
      subtitle="Solo pauta en redes · leads del período"
      info="Canal según el link del anuncio con que entró el lead (Facebook, Instagram, TikTok o Estado de WhatsApp). 'Sin canal identificado': el lead no trae el link del anuncio (se carga desde el 30/09/2026). Conductores nuevos: leads del período que ya recibieron su primer auto. Conversión = conductores nuevos ÷ leads. % Cumple: sobre los leads que llegaron a la propuesta."
    >
      <TablaRendimiento filas={d.canales.map(c => ({ ...c, clave: c.canal }))} primeraColumna="Canal" renderPrimera={c => <span>{c}</span>} />
    </Card>
  )
}

function Anuncios({ d }: { d: MarketingRaw }) {
  return (
    <Card
      title="Rendimiento por anuncio"
      subtitle="Los 30 anuncios con más leads del período · el link se carga desde el 30/09/2026"
      info="Permite ver qué anuncio trae gente que llega a conductor, no solo conversaciones."
    >
      {d.anuncios.length === 0 ? (
        <p className="ddir-note">No hay leads con link de anuncio en el período.</p>
      ) : (
        <TablaRendimiento
          filas={d.anuncios.map(a => ({ ...a, clave: a.anuncio }))}
          primeraColumna="Anuncio"
          renderPrimera={link => (
            <a className="mkt-link" href={link} target="_blank" rel="noopener noreferrer" title={link}>{anuncioCorto(link)}</a>
          )}
        />
      )}
    </Card>
  )
}

function Zonas({ d, filtro }: { d: MarketingRaw; filtro: FiltroSegmento }) {
  const filas = zonasDe(d, filtro)
  const maxLeads = Math.max(1, ...filas.map(z => z.leads))
  return (
    <Card
      title="Leads por zona"
      subtitle="De dónde vienen los leads, cuántos se descartan por zona y cuántos llegaron a conductor"
      info="Zona del lead: la cargada en la ficha; si falta, se infiere de la dirección. 'Por zona': descartados porque la dirección no tiene cobertura o está lejos. Conductores nuevos: leads del período que ya recibieron su primer auto."
    >
      <div className="ddir-tabla-wrap">
        <table className="ddir-tabla">
          <thead>
            <tr>
              <th>Zona</th>
              <th className="num">Leads</th>
              <th className="num">Acepta oferta</th>
              <th className="num">Documentación</th>
              <th className="num">Aptos</th>
              <th className="num">Descartados</th>
              <th className="num">Por zona</th>
              <th className="num">Conductores nuevos</th>
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
                <td className="num">{fmtInt(z.acepta)}</td>
                <td className="num">{fmtInt(z.documentacion)}</td>
                <td className="num">{fmtInt(z.aptos)}</td>
                <td className="num">{fmtInt(z.descartados)}</td>
                <td className="num">{fmtInt(z.descartados_zona)}</td>
                <td className="num">{fmtInt(z.nuevos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Descartes({ d, filtro }: { d: MarketingRaw; filtro: FiltroSegmento }) {
  const motivos = descartesDe(d, filtro)
  const total = motivos.reduce((s, m) => s + m.cantidad, 0)
  const causales = causalesDe(d, filtro)
  return (
    <Card
      title="Motivos de descarte"
      subtitle={`${fmtInt(total)} leads descartados en el período`}
      info="Motivo según el estado del lead (No cumple edad, No le interesa, Auto del pueblo...) y el texto de la causal de cierre que viene de Sellium. Abajo, los textos más frecuentes tal cual se cargaron."
    >
      {motivos.length === 0 ? (
        <p className="ddir-note">No hay leads descartados en el período.</p>
      ) : (
        <div className="ddir-funnel">
          {motivos.map(m => (
            <div className="ddir-funnel-row" key={m.motivo}>
              <span className="ddir-funnel-label">{m.motivo}</span>
              <div className="ddir-funnel-track"><div className="ddir-funnel-fill mkt-fill-descarte" style={{ width: `${(m.cantidad / Math.max(1, total)) * 100}%` }} /></div>
              <span className="ddir-funnel-value">{fmtInt(m.cantidad)}</span>
              <span className="ddir-funnel-pct">{fmtPct(ratio(m.cantidad, total))}</span>
            </div>
          ))}
        </div>
      )}
      {causales.length > 0 ? (
        <div className="ddir-motivos">
          <span className="ddir-causales-title">Causales más frecuentes</span>
          {causales.map(c => (
            <div className="ddir-causal" key={c.causal}>
              <span>{c.causal} <span className="ddir-muted">· {c.motivo}</span></span>
              <span className="ddir-causal-pct">{fmtInt(c.cantidad)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  )
}

function NuevosConductores({ d, filtro }: { d: MarketingRaw; filtro: FiltroSegmento }) {
  const n = d.nuevos_conductores
  const a = embudoDe(d, 'actual', filtro)
  const b = embudoDe(d, 'anterior', filtro)
  const fueraDeRango = sumarPorSegmento(n.fuera_de_rango, filtro, f => f.cantidad)
  const porZona = new Map<string, number>()
  for (const z of n.por_zona) if (enSegmento(z.segmento, filtro)) porZona.set(z.zona, (porZona.get(z.zona) || 0) + z.cantidad)
  const zonas = [...porZona.entries()].sort((x, y) => y[1] - x[1])
  const turnos = [
    { label: 'De día', valor: sumarPorSegmento(n.turnos, filtro, t => t.diurno) },
    { label: 'De noche', valor: sumarPorSegmento(n.turnos, filtro, t => t.nocturno) },
    { label: 'A cargo', valor: sumarPorSegmento(n.turnos, filtro, t => t.cargo) },
  ].filter(t => t.valor > 0)
  const mediana = filtro === 'Todos'
    ? n.dias_mediana
    : (n.dias_mediana_segmento ?? []).find(m => m.segmento === filtro)?.mediana ?? null
  const v = variacion(a.nuevos, b.nuevos, 'num', true)
  return (
    <Card
      title="Conductores nuevos"
      subtitle="Leads creados en el período que ya recibieron su primer auto"
      info="Se cuentan por la fecha de creación del lead, igual que el resto del dashboard: así corresponden a la pauta del período filtrado. Los leads más recientes todavía pueden recibir auto más adelante. Zona de su domicilio: la de su ficha de conductor. Turno: el de su primer auto."
    >
      <div className="ddir-mini-grid">
        <div className="ddir-mini">
          <span className="ddir-mini-label">Conductores nuevos</span>
          <span className="ddir-mini-value">{fmtInt(a.nuevos)}</span>
          {v ? <span className={`ddir-kpi-var ddir-kpi-var--${v.tono}`}>{v.texto}</span> : null}
        </div>
        <div className="ddir-mini">
          <span className="ddir-mini-label">Días de lead a primer auto (mediana)</span>
          <span className="ddir-mini-value">{mediana === null ? '—' : fmtInt(Math.round(mediana))}</span>
        </div>
      </div>
      <div className="mkt-listas">
        <div>
          <span className="ddir-causales-title">Origen</span>
          {n.por_segmento.filter(s => enSegmento(s.segmento, filtro)).map(s => (
            <div className="ddir-causal" key={s.segmento}>
              <span>{s.segmento}</span>
              <span className="ddir-causal-pct">{fmtInt(s.cantidad)}</span>
            </div>
          ))}
        </div>
        <div>
          <span className="ddir-causales-title">Zona de su domicilio</span>
          {zonas.map(([zona, cantidad]) => (
            <div className="ddir-causal" key={zona}>
              <span>{zona}</span>
              <span className="ddir-causal-pct">{fmtInt(cantidad)}</span>
            </div>
          ))}
        </div>
        <div>
          <span className="ddir-causales-title">Turno</span>
          {turnos.length === 0 ? <span className="ddir-muted">Ninguno todavía.</span> : turnos.map(t => (
            <div className="ddir-causal" key={t.label}>
              <span>{t.label}</span>
              <span className="ddir-causal-pct">{fmtInt(t.valor)}</span>
            </div>
          ))}
        </div>
      </div>
      {fueraDeRango > 0 ? (
        <p className="ddir-note">
          <strong>Fuera de rango:</strong> {fmtInt(fueraDeRango)} {fueraDeRango === 1 ? 'conductor recibió' : 'conductores recibieron'} su
          primer auto en el período pero {fueraDeRango === 1 ? 'entró' : 'entraron'} como lead antes. No corresponden a la pauta
          del período filtrado y no se cuentan arriba.
        </p>
      ) : null}
    </Card>
  )
}

function ControlDatos({ d, filtro }: { d: MarketingRaw; filtro: FiltroSegmento }) {
  const c = controlDe(d, filtro)
  const items = [
    { label: 'Sin zona', valor: c.sin_zona, base: c.leads, info: 'Sin zona cargada ni dirección para inferirla.' },
    { label: 'Sin canal identificado', valor: c.sin_canal, base: c.leads, info: 'Sin el canal del anuncio (Facebook, Instagram, TikTok o Estado).' },
    { label: 'Sin link de anuncio', valor: c.sin_anuncio, base: c.con_link_posible, info: 'Solo leads desde el 30/09/2026, cuando se empezó a cargar el link del anuncio.' },
    { label: 'Sin edad', valor: c.sin_edad, base: c.leads, info: 'Sin la edad cargada.' },
    { label: 'Perfil sin datos', valor: c.perfil_sin_datos, base: c.calificables, info: 'Leads que llegaron a la propuesta pero no tienen cargados edad, licencia, monotributo o experiencia.' },
  ]
  return (
    <Card
      title="Control de datos"
      subtitle="Leads del período que entran con datos incompletos"
      info="Sirve para verificar que los números que trae la pauta coinciden con los de Toshibase: si faltan datos, los indicadores por canal, anuncio, zona y perfil quedan incompletos."
    >
      <div className="mkt-control">
        {items.map(i => (
          <div className="ddir-mini" key={i.label}>
            <span className="ddir-mini-label">{i.label} <InfoIcon text={i.info} /></span>
            <span className="ddir-mini-value">{fmtPct(ratio(i.valor, i.base))}</span>
            <span className="ddir-muted">{fmtInt(i.valor)} de {fmtInt(i.base)}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Glosario() {
  return (
    <Card title="Glosario" subtitle="Qué significa cada indicador (los mismos términos para Toshify y la agencia)">
      <dl className="mkt-glosario">
        {GLOSARIO.map(g => (
          <div key={g.termino} className="mkt-glosario-item">
            <dt>{g.termino}</dt>
            <dd>{g.definicion}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

// ───────────── Módulo ─────────────

export function DashboardMarketingModule() {
  const [rango, setRango] = useState<DateRange>(() => rangoUltimasSemanas(4))
  const [filtro, setFiltro] = useState<FiltroSegmento>('Pauta redes')
  const { data, isLoading, error } = useMarketingData(rango.startDate, rango.endDate)

  const contenido = useMemo(() => {
    if (!data) return null
    return (
      <>
        <Kpis d={data} filtro={filtro} />
        <div className="ddir-row ddir-row--half">
          <Embudo d={data} filtro={filtro} />
          <Calidad d={data} filtro={filtro} />
        </div>
        {filtro === 'Pauta redes' ? <Canales d={data} /> : null}
        <NuevosConductores d={data} filtro={filtro} />
        <Zonas d={data} filtro={filtro} />
        <div className="ddir-row ddir-row--half">
          <Descartes d={data} filtro={filtro} />
          <ZonasPendientesChart />
        </div>
        <ControlDatos d={data} filtro={filtro} />
        {filtro === 'Pauta redes' ? <Anuncios d={data} /> : null}
        <Glosario />
      </>
    )
  }, [data, filtro])

  return (
    <div className="ddir-module mkt-module">
      <LoadingOverlay show={isLoading} message="Cargando indicadores de marketing..." size="lg" />
      <Filtros
        rango={rango}
        d={data}
        filtro={filtro}
        cargando={isLoading}
        onRango={setRango}
        onFiltro={setFiltro}
      />
      {error ? <div className="ddir-error" role="alert">{error}</div> : null}
      {contenido}
    </div>
  )
}
