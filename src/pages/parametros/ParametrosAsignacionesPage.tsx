import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { showSuccess } from '../../utils/toast'
import Swal from 'sweetalert2'
import { Save, Loader2 } from 'lucide-react'

interface ParamConfig {
  clave: string
  label: string
  descripcion: string
  defaultValor: string
  unidad: string
  step: string
}

const PARAMS: ParamConfig[] = [
  { clave: 'hora_corte_diurno', label: 'Hora corte Diurno', descripcion: 'Si la entrega es despues de esta hora, se descuenta 1 turno. Antes se descuenta medio turno.', defaultValor: '12', unidad: 'hs', step: '1' },
  { clave: 'hora_corte_cargo', label: 'Hora corte A Cargo', descripcion: 'Si la entrega es despues de esta hora, se descuenta medio turno.', defaultValor: '14', unidad: 'hs', step: '1' },
  { clave: 'descuento_diurno_antes', label: 'Descuento Diurno (antes del corte)', descripcion: 'Turnos a descontar si la entrega es antes de la hora corte.', defaultValor: '0.5', unidad: 'turnos', step: '0.5' },
  { clave: 'descuento_diurno_despues', label: 'Descuento Diurno (despues del corte)', descripcion: 'Turnos a descontar si la entrega es despues de la hora corte.', defaultValor: '1', unidad: 'turnos', step: '0.5' },
  { clave: 'descuento_cargo_despues', label: 'Descuento A Cargo (despues del corte)', descripcion: 'Turnos a descontar si la entrega a cargo es despues de la hora corte.', defaultValor: '0.5', unidad: 'turnos', step: '0.5' },
]

export function ParametrosAsignacionesPage() {
  const [valores, setValores] = useState<Record<string, string>>({})
  const [dbIds, setDbIds] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { cargarParametros() }, [])

  async function cargarParametros() {
    setLoading(true)
    try {
      const { data } = await (supabase.from('parametros_sistema') as ReturnType<typeof supabase.from>)
        .select('id, clave, valor')
        .eq('modulo', 'facturacion')
        .in('clave', PARAMS.map(p => p.clave))

      const vals: Record<string, string> = {}
      const ids: Record<string, string> = {}
      PARAMS.forEach(p => { vals[p.clave] = p.defaultValor })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (data) (data as any[]).forEach(r => { vals[r.clave] = r.valor; ids[r.clave] = r.id })
      setValores(vals)
      setDbIds(ids)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  async function guardar() {
    setSaving(true)
    try {
      for (const p of PARAMS) {
        const valor = valores[p.clave] || p.defaultValor
        if (dbIds[p.clave]) {
          await (supabase.from('parametros_sistema') as ReturnType<typeof supabase.from>)
            .update({ valor, updated_at: new Date().toISOString() }).eq('id', dbIds[p.clave])
        } else {
          await (supabase.from('parametros_sistema') as ReturnType<typeof supabase.from>)
            .insert({ clave: p.clave, valor, tipo: 'number', modulo: 'facturacion', descripcion: p.descripcion, activo: true })
        }
      }
      showSuccess('Parametros guardados')
      await cargarParametros()
    } catch { Swal.fire('Error', 'No se pudieron guardar', 'error') } finally { setSaving(false) }
  }

  if (loading) return <div className="loading-container"><Loader2 size={32} className="spinning" /><span>Cargando...</span></div>

  return (
    <div className="module-container" style={{ maxWidth: 900 }}>
      <div className="module-header">
        <div className="module-header-left">
          <h1 className="module-title">Descuentos por Hora de Entrega</h1>
          <p className="module-subtitle">Reglas de descuento de turnos segun la hora de entrega real del vehiculo</p>
        </div>
        <button className="btn-primary" onClick={guardar} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Save size={16} />
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <div className="info-banner" style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', border: '1px solid var(--border-primary)' }}>
        <strong>Nocturno:</strong> No aplica descuento por hora de entrega.
      </div>

      <table className="dt-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Parametro</th>
            <th style={{ width: 120, textAlign: 'center' }}>Valor</th>
          </tr>
        </thead>
        <tbody>
          {PARAMS.map(p => (
            <tr key={p.clave}>
              <td>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{p.descripcion}</div>
              </td>
              <td style={{ textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    step={p.step}
                    min="0"
                    value={valores[p.clave] || ''}
                    onChange={e => setValores(prev => ({ ...prev, [p.clave]: e.target.value }))}
                    style={{
                      width: 60, padding: '6px 8px', fontSize: 14, fontWeight: 700,
                      textAlign: 'center', border: '1px solid var(--border-primary)',
                      borderRadius: 6, background: 'var(--bg-primary)', color: 'var(--text-primary)',
                    }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.unidad}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', border: '1px solid var(--border-primary)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text-primary)' }}>Resumen:</strong><br />
        Diurno: antes de las {valores.hora_corte_diurno || '12'}hs → -{valores.descuento_diurno_antes || '0.5'} turno(s) · despues de las {valores.hora_corte_diurno || '12'}hs → -{valores.descuento_diurno_despues || '1'} turno(s)<br />
        A Cargo: despues de las {valores.hora_corte_cargo || '14'}hs → -{valores.descuento_cargo_despues || '0.5'} turno(s) · antes → sin descuento<br />
        Nocturno: sin descuento
      </div>
    </div>
  )
}
