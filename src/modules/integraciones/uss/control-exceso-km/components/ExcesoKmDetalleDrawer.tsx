// Drawer lateral con el desglose semanal del conductor:
//   - Km recorridos POR DÍA (máx. 7 filas, lunes-domingo) con acumulado vs límite.
//     Independiente de patente/cortes: si hubo más de una patente en el día se
//     listan separadas por guion. Sin horas ni duración (solo fecha y km).

import { X, AlertTriangle } from 'lucide-react'
import type { ExcesoKmRow } from './ExcesoKmTable'

interface Props {
  row: ExcesoKmRow | null
  onClose: () => void
}

function formatFecha(fecha: string): string {
  if (!fecha) return '-'
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

export function ExcesoKmDetalleDrawer({ row, onClose }: Props) {
  if (!row) return null

  // Agrupar el detalle por FECHA (día calendario ART). Cada marcación trae su
  // desgloseDiario (km por día ya calculado desde los trips en useExcesoKmData);
  // si faltara, cae al agregado de la marcación (fecha del primer trip).
  const porFecha = new Map<string, { km: number; patentes: Set<string> }>()
  for (const m of row.detalle) {
    const dias = (m.desgloseDiario && m.desgloseDiario.length > 0)
      ? m.desgloseDiario
      : [{ fecha: m.fecha, kmTotal: m.kmTotal || 0, patente: m.patente }]
    for (const d of dias) {
      const acc = porFecha.get(d.fecha) || { km: 0, patentes: new Set<string>() }
      acc.km += d.kmTotal || 0
      if (d.patente) acc.patentes.add(d.patente.replace(/\s/g, ''))
      porFecha.set(d.fecha, acc)
    }
  }
  const diasOrdenados = [...porFecha.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  let acumulado = 0
  const diasConAcum = diasOrdenados.map(([fecha, d]) => {
    acumulado += d.km
    return { fecha, km: d.km, patentes: [...d.patentes], acumulado, excedeAqui: acumulado > row.limite }
  })

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999 }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(100vw, 640px)',
        background: 'var(--bg-primary, #fff)',
        zIndex: 1000,
        boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* HEADER */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-primary, #e5e7eb)',
          background: 'var(--bg-secondary, #f9fafb)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} color={row.excedido > 0 ? '#dc2626' : '#16a34a'} />
              {row.conductorNombre}
            </span>
            <span style={{ fontSize: 12, color: row.excedido > 0 ? '#dc2626' : 'var(--text-secondary)', fontWeight: 600 }}>
              {row.kmRecorridos.toLocaleString('es-AR')} / {row.limite.toLocaleString('es-AR')} km · {row.modalidad === 'a_cargo' ? 'a cargo' : 'turno'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {row.excedido > 0
                ? `Excedido: +${row.excedido.toLocaleString('es-AR')} km (${row.porcentaje}%)`
                : 'Dentro del límite semanal'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32,
              border: '1px solid var(--border-primary, #e5e7eb)',
              borderRadius: 8, background: 'var(--bg-primary, #fff)',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}
            title="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* BODY */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* SECCIÓN: Km recorridos por día (máx. 7 filas) */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              Km recorridos por día ({diasConAcum.length})
            </div>
            {diasConAcum.map(({ fecha, km, patentes, acumulado: acumActual, excedeAqui }) => {
              const pctAcum = (acumActual / row.limite) * 100
              const pctBar = Math.min(100, pctAcum)
              let barColor = '#16a34a'
              if (pctAcum >= 100) barColor = '#dc2626'
              else if (pctAcum >= 80) barColor = '#ea580c'
              else if (pctAcum >= 60) barColor = '#f59e0b'
              return (
                <div key={fecha} style={{
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border-primary, #e5e7eb)',
                  fontSize: 12,
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  {/* Linea 1: fecha + patente(s) + km del dia */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {formatFecha(fecha)}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                        {patentes.join(' - ')}
                      </span>
                    </div>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      {km.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km
                    </span>
                  </div>
                  {/* Linea 2: barra de acumulado vs limite */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Acumulado</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: barColor }}>
                        {acumActual.toLocaleString('es-AR', { maximumFractionDigits: 0 })} km · {pctAcum.toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 5, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pctBar}%`, background: barColor, borderRadius: 3 }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      {excedeAqui ? (
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#dc2626' }}>EXCEDIDO</span>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                          {(row.limite - acumActual).toLocaleString('es-AR', { maximumFractionDigits: 0 })} km libres
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
