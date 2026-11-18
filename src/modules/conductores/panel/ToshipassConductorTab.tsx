// src/modules/conductores/panel/ToshipassConductorTab.tsx
// Pestaña «Toshipass» del detalle del conductor (solo si está en régimen Toshipass, que
// reemplaza a la garantía en la tarifa nueva; ver facturacion/utils/toshipass.ts).
// Semana por semana: lo facturado de Toshipass (concepto P027) y lo cobrado. Toshipass no
// tiene pagos propios: se cobra con la facturación semanal, así que lo cobrado es la
// proporción pagada de esa semana aplicada al Toshipass (misma regla que el KPI de arriba
// y que Facturación › Toshipass).
import type { RegimenToshipass } from '../../facturacion/utils/toshipass'
import type { FacturacionSemana } from './conductorDetalleService'
import { formatPlata, formatFecha } from '../../../utils/format'
import { PatenteBadge } from '../../../components/ui/PatenteBadge'
import { EtiquetaPunto } from '../../../components/ui/EtiquetaPunto'
import { Spinner } from '../../../components/ui/LoadingOverlay'
import { EmptyState } from '../../../components/ui/EstadosVista'

interface Props {
  regimen: RegimenToshipass
  facturacion: FacturacionSemana[]
  /** Monto de Toshipass por facturación (id de facturación → monto); null mientras carga */
  montos: Map<string, number> | null
}

const fecha = (s: string | null) => (s ? formatFecha(s) : '—')

export function ToshipassConductorTab({ regimen, facturacion, montos }: Props) {
  if (!montos) return <Spinner size="sm" message="Cargando…" />

  const semanas = facturacion
    .filter(f => (montos.get(f.id) ?? 0) > 0)
    .map(f => {
      const monto = montos.get(f.id) ?? 0
      const pct = Math.min(1, Math.max(0, f.cobertura / 100))
      return { f, monto, cobrado: monto * pct, pendiente: monto * (1 - pct) }
    })
  const facturado = semanas.reduce((a, s) => a + s.monto, 0)
  const cobrado = semanas.reduce((a, s) => a + s.cobrado, 0)
  const pendiente = facturado - cobrado

  return (
    <>
      <div className="cdet-fac-stats">
        <div className="cdet-fac-stat">
          <div className="cdet-fac-stat-lbl">Régimen</div>
          <div className="cdet-fac-stat-val">Desde {fecha(regimen.desde)}</div>
          <div className="cdet-fac-stat-sub muted">{regimen.esCambioTarifa ? 'Cambio de tarifa (antes pagaba garantía)' : 'Conductor nuevo'}</div>
        </div>
        <div className="cdet-fac-stat">
          <div className="cdet-fac-stat-lbl">Facturado</div>
          <div className="cdet-fac-stat-val">{formatPlata(Math.round(facturado))}</div>
          <div className="cdet-fac-stat-sub muted">{semanas.length} {semanas.length === 1 ? 'semana' : 'semanas'}</div>
        </div>
        <div className="cdet-fac-stat">
          <div className="cdet-fac-stat-lbl">Cobrado</div>
          <div className="cdet-fac-stat-val ok">{formatPlata(Math.round(cobrado))}</div>
          <div className="cdet-fac-stat-sub muted">
            {facturado > 0 ? `${Math.round((cobrado / facturado) * 100)}% de lo facturado` : '—'}
          </div>
        </div>
        <div className="cdet-fac-stat">
          <div className="cdet-fac-stat-lbl">Pendiente</div>
          <div className={`cdet-fac-stat-val ${pendiente > 1 ? 'danger' : 'ok'}`}>{formatPlata(Math.round(pendiente))}</div>
          <div className="cdet-fac-stat-sub muted">se cobra con la facturación semanal</div>
        </div>
      </div>

      {semanas.length === 0 ? <EmptyState size="sm" title="Todavía no tiene cargos de Toshipass facturados." /> : (
        <table className="cdet-table">
          <thead><tr>
            <th>Semana</th><th>Período</th><th>Patente</th>
            <th className="r">Toshipass</th><th className="r">Cobertura</th><th className="r">Cobrado</th><th>Estado</th>
          </tr></thead>
          <tbody>
            {semanas.map(({ f, monto, cobrado: cob, pendiente: pend }) => (
              <tr key={f.id}>
                <td>S{String(f.semana).padStart(2, '0')}/{f.anio}</td>
                <td>{fecha(f.fechaInicio)} - {fecha(f.fechaFin)}</td>
                <td>{f.patente ? <PatenteBadge patente={f.patente} size="sm" /> : '—'}</td>
                <td className="r">{formatPlata(Math.round(monto))}</td>
                <td className="r">{Math.round(f.cobertura)}%</td>
                <td className="r">{formatPlata(Math.round(cob))}</td>
                <td>
                  {pend < 1 ? <EtiquetaPunto color="#047857">Cobrado</EtiquetaPunto>
                    : cob >= 1 ? <EtiquetaPunto color="#b45309">Parcial · falta {formatPlata(Math.round(pend))}</EtiquetaPunto>
                      : <EtiquetaPunto color="#b91c1c">Pendiente</EtiquetaPunto>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
