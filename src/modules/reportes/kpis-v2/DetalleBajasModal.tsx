// src/modules/reportes/kpis-v2/DetalleBajasModal.tsx
// Detalle de las bajas de un período (semana o mes): quién se fue, cuándo, el tema
// y el motivo tal cual se cargó. Sale de kpi_bajas (lo mismo que cuentan los
// indicadores) + nombre y DNI de conductores.
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Periodo } from './kpisV2Types'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import { fechaCorta, temaDeBaja } from './kpisV2Types'

interface FilaBaja {
  fecha: string
  conductorId: string
  nombre: string
  dni: string
  motivo: string
  tema: string
}

export function DetalleBajasModal({ periodo, onClose }: { periodo: Periodo; onClose: () => void }) {
  const { aplicarFiltroSede } = useSede()
  const [filas, setFilas] = useState<FilaBaja[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    ;(async () => {
      try {
        const { data: bajas, error: e1 } = await aplicarFiltroSede((supabase.from('kpi_bajas' as any) as any)
          .select('fecha, conductor_id, motivo')
          .gte('fecha', periodo.inicio)
          .lte('fecha', periodo.fin))
          .order('fecha', { ascending: false })
        if (e1) throw e1
        const lista = (bajas || []) as { fecha: string; conductor_id: string; motivo: string | null }[]
        const ids = [...new Set(lista.map(b => b.conductor_id).filter(Boolean))]
        const nombres = new Map<string, { nombre: string; dni: string }>()
        for (let i = 0; i < ids.length; i += 100) {
          const { data, error: e2 } = await (supabase.from('conductores') as any)
            .select('id, nombres, apellidos, numero_dni')
            .in('id', ids.slice(i, i + 100))
          if (e2) throw e2
          for (const c of (data || []) as { id: string; nombres: string | null; apellidos: string | null; numero_dni: string | null }[]) {
            nombres.set(c.id, { nombre: `${c.nombres || ''} ${c.apellidos || ''}`.trim(), dni: c.numero_dni || '' })
          }
        }
        if (!activo) return
        setFilas(lista.map(b => ({
          fecha: b.fecha,
          conductorId: b.conductor_id,
          nombre: nombres.get(b.conductor_id)?.nombre || 'Sin nombre',
          dni: nombres.get(b.conductor_id)?.dni || '',
          motivo: (b.motivo || '').trim(),
          tema: temaDeBaja(b.motivo),
        })))
      } catch (err) {
        console.error('[DashboardGeneral] Error cargando el detalle de bajas', err)
        if (activo) setError('No se pudo cargar el detalle de las bajas.')
      }
    })()
    return () => {
      activo = false
    }
  }, [periodo.inicio, periodo.fin, aplicarFiltroSede])

  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', cerrar)
    return () => window.removeEventListener('keydown', cerrar)
  }, [onClose])

  return (
    <div
      className="modal-overlay dkv2-modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="dkv2-modal dkv2-modal--ancho" role="dialog" aria-modal="true" aria-labelledby="dkv2-bajas-titulo">
        <header className="dkv2-modal-header">
          <div>
            <h2 id="dkv2-bajas-titulo">Bajas · {periodo.labelLargo}</h2>
            <p>
              {filas ? `${filas.length} ${filas.length === 1 ? 'conductor dejó' : 'conductores dejaron'} la empresa en el período.` : 'Cargando…'}
            </p>
          </div>
          <button type="button" className="dkv2-icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>
        <div className="dkv2-modal-body">
          {error ? <p className="dkv2-mod-aviso">{error}</p> : null}
          {filas && filas.length === 0 ? <p className="dkv2-mod-aviso">No hubo bajas en el período.</p> : null}
          {filas && filas.length > 0 ? (
            <div className="dkv2-table-wrap">
              <table className="dkv2-table dkv2-bajas-tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Conductor</th>
                    <th>Tema</th>
                    <th>Motivo cargado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => (
                    <tr key={`${f.conductorId}-${i}`}>
                      <td>{fechaCorta(f.fecha)}/{f.fecha.slice(2, 4)}</td>
                      <td>
                        <div className="dkv2-bajas-nombre">{f.nombre}</div>
                        {f.dni ? <div className="dkv2-muted">DNI {f.dni}</div> : null}
                      </td>
                      <td><span className="dkv2-chip">{f.tema}</span></td>
                      <td className="dkv2-bajas-motivo">{f.motivo || <span className="dkv2-muted">Sin motivo cargado</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
