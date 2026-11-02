// src/modules/conductores/panel/IncidenciasConductorTab.tsx
// Pestaña "Incidencias" del detalle del conductor: todo lo registrado a su nombre,
// segmentado por tipo (logística, cobros y siniestros). Solo lectura.
//  - Incidencias: vista v_incidencias_completas (la misma del módulo Incidencias).
//  - Siniestros: vista v_siniestros_completos (la misma del módulo Siniestros).
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Spinner } from '../../../components/ui/LoadingOverlay'
import { EmptyState } from '../../../components/ui/EstadosVista'
import '../../../components/ui/DataTable/DataTable.css'

type Tipo = 'logistica' | 'cobro' | 'siniestro'

interface Fila {
  id: string
  tipo: Tipo
  fecha: string | null
  detalle: string
  subdetalle: string
  patente: string
  estado: string
  estadoColor: string | null
  monto: number | null
}

const NOMBRE_TIPO: Record<Tipo, string> = {
  logistica: 'Logística',
  cobro: 'Cobros y descuentos',
  siniestro: 'Siniestros',
}

const RESPONSABLE: Record<string, string> = {
  conductor: 'Culpa del conductor',
  tercero: 'Culpa de tercero',
  compartida: 'Culpa compartida',
  sin_info: 'Responsable sin informar',
}

const fmtFecha = (v: string | null) => {
  if (!v) return '—'
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR')
}
const fmtMonto = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

export function IncidenciasConductorTab({ conductorId }: { conductorId: string }) {
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [error, setError] = useState('')
  const [tipo, setTipo] = useState<Tipo | 'todas'>('todas')

  useEffect(() => {
    let activo = true
    ;(async () => {
      try {
        const [inc, sin] = await Promise.all([
          (supabase.from('v_incidencias_completas' as any) as any)
            .select('id, tipo, fecha, descripcion, area, tipo_cobro_nombre, monto, patente_display, estado_nombre, estado_color')
            .eq('conductor_id', conductorId)
            .order('fecha', { ascending: false })
            .limit(500),
          (supabase.from('v_siniestros_completos' as any) as any)
            .select('id, fecha_siniestro, categoria_nombre, responsable, vehiculo_patente, estado_nombre, estado_color, presupuesto_real, relato')
            .eq('conductor_id', conductorId)
            .order('fecha_siniestro', { ascending: false })
            .limit(500),
        ])
        if (inc.error) throw inc.error
        if (sin.error) throw sin.error
        const out: Fila[] = []
        for (const i of (inc.data || []) as any[]) {
          const esCobro = i.tipo === 'cobro'
          out.push({
            id: i.id,
            tipo: esCobro ? 'cobro' : 'logistica',
            fecha: i.fecha,
            detalle: esCobro ? (i.tipo_cobro_nombre || 'Cobro') : (i.area || 'Incidencia'),
            subdetalle: i.descripcion || '',
            patente: i.patente_display || '—',
            estado: i.estado_nombre || '—',
            estadoColor: i.estado_color || null,
            monto: i.monto != null ? Number(i.monto) : null,
          })
        }
        for (const s of (sin.data || []) as any[]) {
          out.push({
            id: s.id,
            tipo: 'siniestro',
            fecha: s.fecha_siniestro,
            detalle: s.categoria_nombre || 'Siniestro',
            subdetalle: [RESPONSABLE[s.responsable] || '', s.relato || ''].filter(Boolean).join(' · '),
            patente: s.vehiculo_patente || '—',
            estado: s.estado_nombre || '—',
            estadoColor: s.estado_color || null,
            monto: s.presupuesto_real != null ? Number(s.presupuesto_real) : null,
          })
        }
        out.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
        if (activo) setFilas(out)
      } catch (e: any) {
        console.error('[Detalle conductor] incidencias', e)
        if (activo) { setError('No se pudieron cargar las incidencias.'); setFilas([]) }
      }
    })()
    return () => { activo = false }
  }, [conductorId])

  const conteo = useMemo(() => {
    const c: Record<Tipo, number> = { logistica: 0, cobro: 0, siniestro: 0 }
    for (const f of filas || []) c[f.tipo]++
    return c
  }, [filas])

  const visibles = useMemo(() => (filas || []).filter(f => tipo === 'todas' || f.tipo === tipo), [filas, tipo])

  if (filas === null) return <Spinner size="sm" message="Cargando…" />
  if (error) return <div className="cdet-empty">{error}</div>
  if (filas.length === 0) return <EmptyState size="sm" title="Sin incidencias ni siniestros registrados." />

  return (
    <div className="inc-cond">
      <div className="inc-cond-tipos" role="tablist" aria-label="Tipo de incidencia">
        {(['todas', 'siniestro', 'cobro', 'logistica'] as const).map(t => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tipo === t}
            className={`inc-cond-tipo${tipo === t ? ' is-activo' : ''}`}
            onClick={() => setTipo(t)}
            disabled={t !== 'todas' && conteo[t] === 0}
          >
            {t === 'todas' ? 'Todas' : NOMBRE_TIPO[t]}
            <span className="inc-cond-n">{t === 'todas' ? filas.length : conteo[t]}</span>
          </button>
        ))}
      </div>
      <table className="cdet-table">
        <thead><tr>
          <th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Patente</th><th>Estado</th><th style={{ textAlign: 'right' }}>Monto</th>
        </tr></thead>
        <tbody>
          {visibles.map(f => (
            <tr key={`${f.tipo}-${f.id}`}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtFecha(f.fecha)}</td>
              <td><span className={`inc-cond-badge inc-cond-badge--${f.tipo}`}>{NOMBRE_TIPO[f.tipo]}</span></td>
              <td>
                <div style={{ fontWeight: 600 }}>{f.detalle}</div>
                {f.subdetalle ? <div className="inc-cond-sub">{f.subdetalle}</div> : null}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{f.patente}</td>
              <td>
                {/* estado_color viene como nombre ('yellow', 'green'…): mismo badge que en Incidencias/Siniestros */}
                {f.estadoColor?.startsWith('#') ? (
                  <span className="inc-cond-estado" style={{ background: `${f.estadoColor}22`, color: f.estadoColor }}>{f.estado}</span>
                ) : (
                  <span className={`dt-badge dt-badge-${f.estadoColor || 'gray'}`}>{f.estado}</span>
                )}
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMonto(f.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
