// src/modules/reportes/kpis-v2/DashboardGeneralModule.tsx
// Dashboard General (Reportes > Dashboard General): los indicadores de cada módulo
// (conductores, ventas, vehículos, multas y km, siniestros, garantías y deuda) en una
// sola pantalla, uno debajo del otro. Mismo selector de período que Dashboard KPI's:
// lo que depende del tiempo se compara contra la semana o el mes anterior.
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Granularidad } from './kpisV2Types'
import { useSede } from '../../../contexts/SedeContext'
import { useKpisV2Data } from './useKpisV2Data'
import { agrupar, hoyArgentina, periodoPorDefecto, rangoConsulta, resumenMotivos } from './kpisV2Types'
import { LoadingOverlay } from '../../../components/ui/LoadingOverlay'
import { IndicadoresModulos } from './IndicadoresModulos'
import './DashboardKpisV2Module.css'

export function DashboardGeneralModule() {
  const { sedeActual, sedeActualId } = useSede()
  const [granularidad, setGranularidad] = useState<Granularidad>('semana')
  const [seleccionado, setSeleccionado] = useState<string | null>(null)

  const hoy = useMemo(() => hoyArgentina(), [])
  const { desde, hasta } = useMemo(() => rangoConsulta(hoy), [hoy])
  const { data, isLoading, error } = useKpisV2Data(desde, hasta)

  const periodos = useMemo(() => {
    const todos = data ? agrupar(data, granularidad) : []
    const primero = todos.findIndex(p => p.diasConFlota > 0 || p.diasConFacturacion > 0)
    return primero < 0 ? [] : todos.slice(primero)
  }, [data, granularidad])

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

  const vista = (
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
  )

  return (
    <div className="dkv2-module">
      <LoadingOverlay show={isLoading && !data} message="Cargando indicadores..." size="lg" />
      {error ? <div className="dkv2-error">{error}</div> : null}

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
          ) : (
            <span className="dkv2-periodo-estado">
              {isLoading ? 'Cargando…' : `Sin datos para ${sedeActual?.nombre ?? 'Todas las sedes'}`}
            </span>
          )}
          {vista}
        </header>
      </section>

      {actual ? (
        <IndicadoresModulos completo periodo={actual} anterior={anterior} hoy={hoy} motivosGeneral={motivosGeneral} />
      ) : null}
    </div>
  )
}
