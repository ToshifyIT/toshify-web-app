// src/modules/reportes/rendimiento-agentes/RendimientoAgentesModule.tsx
// Reportes > Rendimiento de agentes: tabla con una fila por agente de ventas para
// comparar su avance semana a semana o mes a mes (ver rendimientoAgentesService.ts).
// Mismo selector de período que el Dashboard General; cada número del período se
// compara contra el período anterior.
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Diferencia } from '../kpis-v2/kpisV2Types'
import type { FilaAgente, PeriodoAgente, RendimientoAgentes } from './rendimientoAgentesService'
import { useSede } from '../../../contexts/SedeContext'
import {
  INICIO_DATOS, difUnidades, fechaCorta, finDeMes, hoyArgentina, inicioDeMes, lunesDe, numeroSemana, sumarDias,
} from '../kpis-v2/kpisV2Types'
import { cargarRendimientoAgentes, OTROS } from './rendimientoAgentesService'
import { LoadingOverlay } from '../../../components/ui/LoadingOverlay'
import '../kpis-v2/DashboardKpisV2Module.css'
import './RendimientoAgentesModule.css'

/** Días entre dos fechas 'YYYY-MM-DD' (hasta - desde). */
function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000)
}

type Granularidad = 'semana' | 'mes'

interface PeriodoSimple {
  key: string
  inicio: string
  fin: string
  label: string
  enCurso: boolean
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** Semanas (lunes a domingo) o meses desde el inicio de los datos hasta hoy. */
function armarPeriodos(granularidad: Granularidad, hoy: string): PeriodoSimple[] {
  const out: PeriodoSimple[] = []
  if (granularidad === 'semana') {
    for (let lunes = lunesDe(INICIO_DATOS); lunes <= hoy; lunes = sumarDias(lunes, 7)) {
      const fin = sumarDias(lunes, 6)
      const { semana, anio } = numeroSemana(lunes)
      out.push({
        key: lunes,
        inicio: lunes,
        fin,
        label: `Semana ${String(semana).padStart(2, '0')}-${String(anio).slice(2)} · ${fechaCorta(lunes)} al ${fechaCorta(fin)}`,
        enCurso: fin >= hoy,
      })
    }
  } else {
    for (let ini = inicioDeMes(INICIO_DATOS); ini <= hoy; ini = sumarDias(finDeMes(ini), 1)) {
      const fin = finDeMes(ini)
      out.push({
        key: ini,
        inicio: ini,
        fin,
        label: `${MESES[Number(ini.slice(5, 7)) - 1]} ${ini.slice(0, 4)}`,
        enCurso: fin >= hoy,
      })
    }
  }
  return out
}

const nfDias = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtInt = (n: number) => n.toLocaleString('es-AR')
const fmtPct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)

/** Subir es malo (bajas, multas, días para llenar...). */
function alReves(d: Diferencia | null): Diferencia | null {
  if (!d || d.tono === 'neutro') return d
  return { ...d, tono: d.tono === 'bueno' ? 'malo' : 'bueno' }
}

/** Celda numérica con la diferencia contra el período anterior debajo. */
function Celda({ valor, dif, titulo }: { valor: ReactNode; dif?: Diferencia | null; titulo?: string }) {
  return (
    <td className="ra-num" title={titulo}>
      <div className="ra-valor">{valor}</div>
      {dif && dif.tono !== 'neutro' ? <div className={`dkv2-dif dkv2-dif--${dif.tono} ra-dif`}>{dif.texto}</div> : null}
    </td>
  )
}

function difDias(actual: number | null, anterior: number | null): Diferencia | null {
  if (actual === null || anterior === null) return null
  const d = actual - anterior
  if (Math.abs(d) < 0.05) return { texto: '0', tono: 'neutro' }
  // Menos días = mejor
  return { texto: `${d > 0 ? '+' : '−'}${nfDias.format(Math.abs(d))} d`, tono: d < 0 ? 'bueno' : 'malo' }
}

function Fila({ f, esTotal, conAltas }: { f: FilaAgente; esTotal?: boolean; conAltas: boolean }) {
  const a: PeriodoAgente = f.actual
  const b: PeriodoAgente = f.anterior
  const neto = a.altas - a.bajas
  const netoAnt = b.altas - b.bajas
  return (
    <tr className={esTotal ? 'ra-total' : f.agente === OTROS ? 'ra-otros' : undefined}>
      <th scope="row" className="ra-agente">{f.agente}</th>
      {/* Rendimiento: guía del conductor */}
      <Celda valor={fmtInt(f.hoy.conductoresActivos)} titulo="Conductores activos onboardeados por este agente (hoy)" />
      <Celda valor={conAltas ? fmtInt(a.altas) : '—'} dif={conAltas ? difUnidades(a.altas, b.altas) : null} titulo="Conductores que tuvieron su primer turno en el período" />
      <Celda valor={fmtInt(a.bajas)} dif={alReves(difUnidades(a.bajas, b.bajas))} />
      <Celda
        valor={conAltas ? `${neto > 0 ? '+' : ''}${fmtInt(neto)}` : '—'}
        dif={conAltas ? difUnidades(neto, netoAnt) : null}
      />
      <Celda
        valor={fmtInt(a.multas)}
        dif={alReves(difUnidades(a.multas, b.multas))}
        titulo={`${a.conductoresConMultas} ${a.conductoresConMultas === 1 ? 'conductor' : 'conductores'} con multas`}
      />
      <Celda valor={fmtInt(f.hoy.licenciasVencidas)} titulo="Conductores activos con la licencia vencida (hoy)" />
      {/* Flota: responsable del auto */}
      <Celda valor={fmtInt(f.hoy.autosACargo)} titulo="Autos en PKG ON o En uso de los que es responsable (hoy)" />
      <Celda valor={fmtInt(a.turnosLlenados)} dif={difUnidades(a.turnosLlenados, b.turnosLlenados)} titulo="Turnos de sus autos que se llenaron en el período" />
      <Celda
        valor={a.diasParaLlenar === null ? '—' : nfDias.format(a.diasParaLlenar)}
        dif={difDias(a.diasParaLlenar, b.diasParaLlenar)}
        titulo="Días promedio que estuvo libre cada turno antes de llenarse"
      />
      <td className="ra-num" title="Turnos libres hoy en sus autos (diurno · nocturno)">
        <div className="ra-valor">{fmtInt(f.hoy.libresD + f.hoy.libresN)}</div>
        <div className="ra-sub">
          <span className="asig-turno-label asig-label-diurno ra-letra">D</span>{f.hoy.libresD}
          <span className="asig-turno-label asig-label-nocturno ra-letra">N</span>{f.hoy.libresN}
        </div>
      </td>
      <Celda valor={fmtPct(f.hoy.ocupacion)} titulo="Turnos ocupados sobre el total de turnos de sus autos (hoy)" />
    </tr>
  )
}

export function RendimientoAgentesModule() {
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const filtroSede = aplicarFiltroSede as <T>(q: T) => T
  const hoy = useMemo(() => hoyArgentina(), [])
  const [granularidad, setGranularidad] = useState<Granularidad>('semana')
  const [seleccionado, setSeleccionado] = useState<string | null>(null)

  const periodos = useMemo(() => armarPeriodos(granularidad, hoy), [granularidad, hoy])
  const actual = periodos.find(p => p.key === seleccionado) ?? periodos[periodos.length - 1]
  const indice = periodos.findIndex(p => p.key === actual?.key)
  const anterior = indice > 0 ? periodos[indice - 1] : null

  useEffect(() => { setSeleccionado(null) }, [granularidad])

  const [datos, setDatos] = useState<RendimientoAgentes | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!actual) return
    let activo = true
    setCargando(true)
    setError(null)
    const r = { desde: actual.inicio, hasta: actual.fin < hoy ? actual.fin : hoy }
    // El anterior con la MISMA cantidad de días que lo que va del actual (como el
    // Dashboard General): si no, un miércoles se compara 3 días contra una semana entera.
    const diasTranscurridos = diasEntre(r.desde, r.hasta)
    const antInicio = anterior
      ? anterior.inicio
      : sumarDias(actual.inicio, -(diasEntre(actual.inicio, actual.fin) + 1))
    const antTope = anterior ? anterior.fin : sumarDias(actual.inicio, -1)
    const antHasta = sumarDias(antInicio, diasTranscurridos)
    const ant = { desde: antInicio, hasta: antHasta < antTope ? antHasta : antTope }
    cargarRendimientoAgentes(filtroSede, sedeActualId ?? null, r, ant, hoy)
      .then(d => { if (activo) setDatos(d) })
      .catch(err => {
        console.error('[RendimientoAgentes] Error cargando', err)
        if (activo) setError('No se pudo cargar el rendimiento de los agentes.')
      })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
    // filtroSede cambia con la sede (sedeActualId ya está en las dependencias)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual?.key, anterior?.key, sedeActualId, hoy])

  return (
    <div className="dkv2-module">
      <LoadingOverlay show={cargando && !datos} message="Cargando rendimiento de agentes..." size="lg" />

      <section className="dkv2-cierre">
        <header className="dkv2-cierre-header">
          {actual ? (
            <div className="dkv2-periodo-nav">
              <button
                type="button"
                className="dkv2-icon-btn"
                onClick={() => anterior && setSeleccionado(anterior.key)}
                disabled={!anterior}
                aria-label="Ver período anterior"
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
                  <option key={p.key} value={p.key}>{p.label}{p.enCurso ? ' (en curso)' : ''}</option>
                ))}
              </select>
              <button
                type="button"
                className="dkv2-icon-btn"
                onClick={() => periodos[indice + 1] && setSeleccionado(periodos[indice + 1].key)}
                disabled={indice < 0 || indice >= periodos.length - 1}
                aria-label="Ver período siguiente"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          ) : null}
          <div className="dkv2-header-controles">
            <div className="dkv2-seg" role="tablist" aria-label="Vista">
              {(['semana', 'mes'] as const).map(g => (
                <button
                  key={g}
                  type="button"
                  role="tab"
                  aria-selected={granularidad === g}
                  className={`dkv2-seg-btn${granularidad === g ? ' is-active' : ''}`}
                  onClick={() => setGranularidad(g)}
                >
                  {g === 'semana' ? 'Semanal' : 'Mensual'}
                </button>
              ))}
            </div>
          </div>
        </header>
      </section>

      <section className="dkv2-card">
        <header className="dkv2-card-header">
          <div>
            <h2 className="dkv2-card-title">Rendimiento de agentes</h2>
            <p className="dkv2-card-subtitle">
              Cada agente lado a lado. Lo de período se compara contra el período anterior; lo de "hoy" es la foto actual.
            </p>
          </div>
        </header>

        {error ? <p className="dkv2-mod-aviso">{error}</p> : null}
        {datos && !datos.conAltas ? (
          <p className="dkv2-mod-aviso">Las altas no se pueden calcular por agente: falta correr sql/kpi_altas_conductores.sql.</p>
        ) : null}

        {datos ? (
          <div className={`dkv2-table-wrap ra-wrap${cargando ? ' ra-cargando' : ''}`}>
            <table className="dkv2-table ra-tabla">
              <thead>
                <tr>
                  <th rowSpan={2} className="ra-agente">Agente</th>
                  <th colSpan={6} className="ra-grupo" title="Según el guía que onboardeó a cada conductor">
                    Rendimiento · sus conductores
                  </th>
                  <th colSpan={5} className="ra-grupo ra-grupo--flota" title="Según el responsable de cada auto">
                    Orden de la flota · sus autos
                  </th>
                </tr>
                <tr>
                  <th className="ra-num">Activos <span className="ra-hoy">hoy</span></th>
                  <th className="ra-num">Altas</th>
                  <th className="ra-num">Bajas</th>
                  <th className="ra-num">Neto</th>
                  <th className="ra-num">Multas</th>
                  <th className="ra-num">Lic. vencidas <span className="ra-hoy">hoy</span></th>
                  <th className="ra-num ra-sep">Autos <span className="ra-hoy">hoy</span></th>
                  <th className="ra-num">Turnos llenados</th>
                  <th className="ra-num">Días p/ llenar</th>
                  <th className="ra-num">Turnos libres <span className="ra-hoy">hoy</span></th>
                  <th className="ra-num">Ocupación <span className="ra-hoy">hoy</span></th>
                </tr>
              </thead>
              <tbody>
                {datos.filas.map(f => <Fila key={f.agente} f={f} conAltas={datos.conAltas} />)}
                <Fila f={datos.total} esTotal conAltas={datos.conAltas} />
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="dkv2-mod-pie">
          <span className="dkv2-muted">
            {actual ? `${actual.label}${anterior ? ` contra ${anterior.label}` : ''}${
              actual.fin > hoy ? ' (los mismos días del período anterior)' : ''}. ` : ''}
            Rendimiento: por el guía de cada conductor. Orden de la flota: por el responsable de cada auto.
          </span>
        </div>
      </section>
    </div>
  )
}
