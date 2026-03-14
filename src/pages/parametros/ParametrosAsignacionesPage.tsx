import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { showSuccess } from '../../utils/toast'
import Swal from 'sweetalert2'
import { Save, Clock, Fuel, Moon } from 'lucide-react'

interface ParamConfig {
  clave: string
  label: string
  descripcion: string
  tipo: 'number'
  defaultValor: string
  unidad: string
  icon: typeof Clock
  color: string
}

const PARAMS_CONFIG: ParamConfig[] = [
  {
    clave: 'hora_corte_diurno',
    label: 'Hora corte Diurno',
    descripcion: 'Si la entrega real es despues de esta hora, se descuenta 1 turno completo. Antes de esta hora se descuenta medio turno.',
    tipo: 'number',
    defaultValor: '12',
    unidad: 'hs',
    icon: Clock,
    color: '#d97706',
  },
  {
    clave: 'hora_corte_cargo',
    label: 'Hora corte A Cargo',
    descripcion: 'Si la entrega real es despues de esta hora, se descuenta medio turno. Antes de esta hora no se descuenta.',
    tipo: 'number',
    defaultValor: '14',
    unidad: 'hs',
    icon: Fuel,
    color: '#0891b2',
  },
  {
    clave: 'descuento_diurno_antes',
    label: 'Descuento Diurno (antes del corte)',
    descripcion: 'Turnos a descontar cuando la entrega diurna es ANTES de la hora de corte.',
    tipo: 'number',
    defaultValor: '0.5',
    unidad: 'turnos',
    icon: Clock,
    color: '#d97706',
  },
  {
    clave: 'descuento_diurno_despues',
    label: 'Descuento Diurno (despues del corte)',
    descripcion: 'Turnos a descontar cuando la entrega diurna es DESPUES de la hora de corte.',
    tipo: 'number',
    defaultValor: '1',
    unidad: 'turnos',
    icon: Clock,
    color: '#d97706',
  },
  {
    clave: 'descuento_cargo_despues',
    label: 'Descuento A Cargo (despues del corte)',
    descripcion: 'Turnos a descontar cuando la entrega a cargo es DESPUES de la hora de corte.',
    tipo: 'number',
    defaultValor: '0.5',
    unidad: 'turnos',
    icon: Fuel,
    color: '#0891b2',
  },
]

export function ParametrosAsignacionesPage() {
  const [valores, setValores] = useState<Record<string, string>>({})
  const [dbIds, setDbIds] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    cargarParametros()
  }, [])

  async function cargarParametros() {
    setLoading(true)
    try {
      const claves = PARAMS_CONFIG.map(p => p.clave)
      const { data } = await (supabase
        .from('parametros_sistema') as ReturnType<typeof supabase.from>)
        .select('id, clave, valor')
        .eq('modulo', 'facturacion')
        .in('clave', claves)

      const vals: Record<string, string> = {}
      const ids: Record<string, string> = {}

      // Defaults
      PARAMS_CONFIG.forEach(p => { vals[p.clave] = p.defaultValor })

      // Override with DB values
      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data as any[]).forEach((row) => {
          vals[row.clave] = row.valor
          ids[row.clave] = row.id
        })
      }

      setValores(vals)
      setDbIds(ids)
    } catch {
      // silently ignored
    } finally {
      setLoading(false)
    }
  }

  async function guardarTodos() {
    setSaving(true)
    try {
      for (const param of PARAMS_CONFIG) {
        const valor = valores[param.clave] || param.defaultValor
        if (dbIds[param.clave]) {
          // Update existing
          await (supabase.from('parametros_sistema') as ReturnType<typeof supabase.from>)
            .update({ valor, updated_at: new Date().toISOString() })
            .eq('id', dbIds[param.clave])
        } else {
          // Insert new
          await (supabase.from('parametros_sistema') as ReturnType<typeof supabase.from>)
            .insert({
              clave: param.clave,
              valor,
              tipo: param.tipo,
              modulo: 'facturacion',
              descripcion: param.descripcion,
              activo: true,
            })
        }
      }
      showSuccess('Parametros guardados')
      await cargarParametros()
    } catch {
      Swal.fire('Error', 'No se pudieron guardar los parametros', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Cargando parametros...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Descuentos por Hora de Entrega
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Configurar las reglas de descuento de turnos segun la hora de entrega real del vehiculo.
          </p>
        </div>
        <button
          onClick={guardarTodos}
          disabled={saving}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 20px', fontSize: '14px', fontWeight: 600,
            background: '#ef4444', color: '#fff', border: 'none',
            borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Save size={16} />
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>

      {/* Info card - Nocturno */}
      <div style={{
        padding: '12px 16px', borderRadius: '8px',
        background: 'rgba(99, 102, 241, 0.06)',
        border: '1px solid rgba(99, 102, 241, 0.15)',
        display: 'flex', alignItems: 'center', gap: '10px',
        fontSize: '13px', color: 'var(--text-primary)',
      }}>
        <Moon size={16} style={{ color: '#6366f1', flexShrink: 0 }} />
        <span><strong>Nocturno:</strong> No se aplica descuento por hora de entrega.</span>
      </div>

      {/* Parameters grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {PARAMS_CONFIG.map(param => {
          const Icon = param.icon
          return (
            <div key={param.clave} style={{
              padding: '16px', borderRadius: '10px',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-primary)',
              display: 'flex', alignItems: 'center', gap: '16px',
            }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '8px',
                background: `${param.color}15`, color: param.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {param.label}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                  {param.descripcion}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="number"
                  step={param.unidad === 'turnos' ? '0.5' : '1'}
                  min="0"
                  max={param.unidad === 'hs' ? '23' : '7'}
                  value={valores[param.clave] || ''}
                  onChange={e => setValores(prev => ({ ...prev, [param.clave]: e.target.value }))}
                  style={{
                    width: '70px', padding: '8px 10px', fontSize: '15px', fontWeight: 700,
                    textAlign: 'center', border: '1px solid var(--border-primary)',
                    borderRadius: '6px', background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {param.unidad}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary */}
      <div style={{
        padding: '16px', borderRadius: '10px',
        background: 'var(--bg-secondary)', fontSize: '12px',
        color: 'var(--text-secondary)', lineHeight: '1.6',
      }}>
        <strong style={{ color: 'var(--text-primary)' }}>Resumen de reglas:</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: '16px' }}>
          <li><strong>Diurno</strong>: Entrega antes de las {valores.hora_corte_diurno || '12'}hs → descuento {valores.descuento_diurno_antes || '0.5'} turno(s). Despues de las {valores.hora_corte_diurno || '12'}hs → descuento {valores.descuento_diurno_despues || '1'} turno(s).</li>
          <li><strong>A Cargo</strong>: Entrega despues de las {valores.hora_corte_cargo || '14'}hs → descuento {valores.descuento_cargo_despues || '0.5'} turno(s). Antes → sin descuento.</li>
          <li><strong>Nocturno</strong>: Sin descuento.</li>
        </ul>
      </div>
    </div>
  )
}
