// src/modules/reportes/kpis-v2/DetalleBajasModal.tsx
// Detalle de las bajas de un período (semana o mes): quién se fue, cuándo, el tema
// cuándo se creó, cuándo recibió auto por primera vez, el guía (conductores.guia) y el motivo tal cual se cargó. Sale de kpi_bajas (lo mismo que cuentan los
// indicadores) + nombre y DNI de conductores.
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Periodo } from './kpisV2Types'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import { fechaCorta, temaDeBaja } from './kpisV2Types'
import { guiaParaConductor } from '../../leads/guias'

interface FilaBaja {
  fecha: string
  conductorId: string
  nombre: string
  dni: string
  motivo: string
  tema: string
  guia: string
  creado: string | null
  asignado: string | null
}

/** Día (YYYY-MM-DD) en hora Argentina; las fechas sin hora quedan igual. */
function diaART(v: string | null | undefined): string | null {
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function diaCorto(dia: string): string {
  return `${fechaCorta(dia)}/${dia.slice(2, 4)}`
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
        const nombres = new Map<string, { nombre: string; dni: string; leadId: string | null; creado: string | null }>()
        for (let i = 0; i < ids.length; i += 100) {
          const { data, error: e2 } = await (supabase.from('conductores') as any)
            .select('id, nombres, apellidos, numero_dni, lead_origen_id, created_at')
            .in('id', ids.slice(i, i + 100))
          if (e2) throw e2
          for (const c of (data || []) as { id: string; nombres: string | null; apellidos: string | null; numero_dni: string | null; lead_origen_id: string | null; created_at: string | null }[]) {
            nombres.set(c.id, { nombre: `${c.nombres || ''} ${c.apellidos || ''}`.trim(), dni: c.numero_dni || '', leadId: c.lead_origen_id, creado: diaART(c.created_at) })
          }
        }
        // Guía: el guardado en el conductor (conductores.guia, editable desde Conductores).
        // Si todavía no tiene, se calcula del lead con la misma regla de la conversión:
        // guía del lead (Ali, Manuel, Marina, Carla o Eunice) o quien lo convirtió.
        const guiaGuardada = new Map<string, string>()
        for (let i = 0; i < ids.length; i += 100) {
          const { data, error: eg } = await (supabase.from('conductores') as any)
            .select('id, guia')
            .in('id', ids.slice(i, i + 100))
          if (eg) break // sin columna guia (falta sql/conductores_guia.sql): se calcula del lead
          for (const g of (data || []) as { id: string; guia: string | null }[]) if (g.guia) guiaGuardada.set(g.id, g.guia)
        }
        type LeadGuia = { id: string; dni: string | null; entrevistador_asignado: string | null; usuario: string | null }
        const leadsPorId = new Map<string, LeadGuia>()
        const leadsPorDni = new Map<string, LeadGuia>()
        const faltan = ids.filter(id => !guiaGuardada.has(id)).map(id => nombres.get(id)).filter(Boolean) as { leadId: string | null; dni: string }[]
        const idsLead = [...new Set(faltan.map(n => n.leadId).filter((x): x is string => !!x))]
        const dnisSinLead = [...new Set(faltan.filter(n => !n.leadId && n.dni).map(n => n.dni))]
        for (let i = 0; i < idsLead.length; i += 100) {
          const { data } = await (supabase.from('leads') as any)
            .select('id, dni, entrevistador_asignado, usuario')
            .in('id', idsLead.slice(i, i + 100))
          for (const l of (data || []) as LeadGuia[]) leadsPorId.set(l.id, l)
        }
        for (let i = 0; i < dnisSinLead.length; i += 100) {
          const { data } = await (supabase.from('leads') as any)
            .select('id, dni, entrevistador_asignado, usuario')
            .in('dni', dnisSinLead.slice(i, i + 100))
          for (const l of (data || []) as LeadGuia[]) if (l.dni) leadsPorDni.set(l.dni, l)
        }
        const guiaDe = (conductorId: string): string => {
          const guardada = guiaGuardada.get(conductorId)
          if (guardada) return guardada
          const c = nombres.get(conductorId)
          const lead = c?.leadId ? leadsPorId.get(c.leadId) : c?.dni ? leadsPorDni.get(c.dni) : undefined
          return lead ? guiaParaConductor(lead.entrevistador_asignado, lead.usuario) ?? '' : ''
        }
        // Primera vez que recibió auto (inicio de su primera asignación)
        const primeraAsignacion = new Map<string, string>()
        for (let i = 0; i < ids.length; i += 100) {
          const { data: asig, error: e3 } = await (supabase.from('asignaciones_conductores') as any)
            .select('conductor_id, fecha_inicio')
            .in('conductor_id', ids.slice(i, i + 100))
            .not('fecha_inicio', 'is', null)
          if (e3) throw e3
          for (const a of (asig || []) as { conductor_id: string; fecha_inicio: string }[]) {
            const dia = diaART(a.fecha_inicio)
            if (!dia) continue
            const previa = primeraAsignacion.get(a.conductor_id)
            if (!previa || dia < previa) primeraAsignacion.set(a.conductor_id, dia)
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
          creado: nombres.get(b.conductor_id)?.creado ?? null,
          asignado: primeraAsignacion.get(b.conductor_id) ?? null,
          guia: guiaDe(b.conductor_id),
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
                    <th>Conductor</th>
                    <th title="Alta del conductor en el sistema">Creación</th>
                    <th title="Primera vez que recibió auto">Asignación</th>
                    <th>Baja</th>
                    <th>Guía</th>
                    <th>Tema</th>
                    <th>Motivo cargado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => (
                    <tr key={`${f.conductorId}-${i}`}>
                      <td>
                        <div className="dkv2-bajas-nombre">{f.nombre}</div>
                        {f.dni ? <div className="dkv2-muted">DNI {f.dni}</div> : null}
                      </td>
                      <td>{f.creado ? diaCorto(f.creado) : <span className="dkv2-muted">—</span>}</td>
                      <td>{f.asignado ? diaCorto(f.asignado) : <span className="dkv2-muted">Sin asignación</span>}</td>
                      <td>{diaCorto(f.fecha)}</td>
                      <td>
                        {f.guia || <span className="dkv2-muted">Sin dato</span>}
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
