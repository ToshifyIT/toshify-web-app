// Parámetros > Riesgo BCRA: umbrales del nivel de alerta (verde / amarillo / rojo) de los
// leads según la Central de Deudores del BCRA. Tabla bcra_umbrales (sql/bcra_umbrales.sql):
// al guardar, la base recalcula el nivel de todos los leads consultados.
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import { showError, showSuccess, showWarning } from '../../utils/toast'
import { formatFechaHora, formatPlata } from '../../utils/format'
import '../../styles/modules.css'
import './RiesgoBcraPage.css'

interface Umbrales {
  deuda_verde_max: number
  deuda_amarilla_max: number
  situacion_roja_desde: number
  rojo_con_judicial: boolean
  rojo_con_cheques: boolean
  updated_at: string | null
  updated_by_name: string | null
}

type Nivel = 'verde' | 'amarillo' | 'rojo'

const NIVELES: { nivel: Nivel; label: string; color: string }[] = [
  { nivel: 'verde', label: 'Verde', color: 'var(--color-success)' },
  { nivel: 'amarillo', label: 'Amarillo', color: 'var(--color-warning)' },
  { nivel: 'rojo', label: 'Rojo', color: 'var(--color-danger)' },
]

const SITUACIONES_ROJAS = [
  { valor: 6, label: '6 - Irrecuperable por disposición técnica' },
  { valor: 5, label: '5 - Irrecuperable' },
  { valor: 4, label: '4 - Riesgo alto' },
  { valor: 3, label: '3 - Riesgo medio' },
]

export function RiesgoBcraPage() {
  const { canEditInSubmenu } = usePermissions()
  const puedeEditar = canEditInSubmenu('riesgo-bcra')
  const [umbrales, setUmbrales] = useState<Umbrales | null>(null)
  const [form, setForm] = useState({ verde: '', amarilla: '', situacion: 6, judicial: true, cheques: true })
  const [conteo, setConteo] = useState<Record<Nivel, number | null>>({ verde: null, amarillo: null, rojo: null })
  const [isLoading, setIsLoading] = useState(true)
  const [isGuardando, setIsGuardando] = useState(false)

  useEffect(() => { void cargar() }, [])

  async function cargarConteo() {
    const resultados = await Promise.all(NIVELES.map(n =>
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('bcra_nivel', n.nivel),
    ))
    setConteo({
      verde: resultados[0].count ?? 0,
      amarillo: resultados[1].count ?? 0,
      rojo: resultados[2].count ?? 0,
    })
  }

  async function cargar() {
    setIsLoading(true)
    try {
      const { data, error } = await supabase.from('bcra_umbrales').select('*').eq('id', 1).maybeSingle()
      if (error) throw error
      if (data) {
        const u = data as Umbrales
        setUmbrales(u)
        setForm({
          verde: String(Number(u.deuda_verde_max)),
          amarilla: String(Number(u.deuda_amarilla_max)),
          situacion: u.situacion_roja_desde,
          judicial: u.rojo_con_judicial,
          cheques: u.rojo_con_cheques,
        })
      }
      await cargarConteo()
    } catch (error) {
      console.error('Error cargando umbrales BCRA:', error)
      showError('Error', 'No se pudieron cargar los umbrales. ¿Se ejecutó sql/bcra_umbrales.sql?')
    } finally {
      setIsLoading(false)
    }
  }

  async function guardar() {
    const verde = Number(form.verde)
    const amarilla = Number(form.amarilla)
    if (!Number.isFinite(verde) || !Number.isFinite(amarilla) || verde < 0 || amarilla < 0) {
      showWarning('Montos inválidos', 'Los montos tienen que ser números positivos.')
      return
    }
    if (amarilla < verde) {
      showWarning('Montos inválidos', 'El tope de amarillo no puede ser menor que el de verde.')
      return
    }
    setIsGuardando(true)
    try {
      const { error } = await supabase.from('bcra_umbrales').update({
        deuda_verde_max: verde,
        deuda_amarilla_max: amarilla,
        situacion_roja_desde: form.situacion,
        rojo_con_judicial: form.judicial,
        rojo_con_cheques: form.cheques,
      }).eq('id', 1)
      if (error) throw error
      showSuccess('Umbrales guardados', 'Se recalculó el nivel de todos los leads consultados.')
      await cargar()
    } catch (error) {
      console.error('Error guardando umbrales BCRA:', error)
      showError('Error', 'No se pudieron guardar los umbrales')
    } finally {
      setIsGuardando(false)
    }
  }

  const verdeTxt = form.verde ? formatPlata(Number(form.verde)) : '-'
  const amarillaTxt = form.amarilla ? formatPlata(Number(form.amarilla)) : '-'

  return (
    <div className="module-container riesgo-bcra">
      <div className="riesgo-bcra-conteo">
        {NIVELES.map(n => (
          <div key={n.nivel} className="riesgo-bcra-conteo-item">
            <span className="riesgo-bcra-conteo-valor" style={{ color: n.color }}>
              {conteo[n.nivel] ?? '-'}
            </span>
            <span className="riesgo-bcra-conteo-label">Leads en {n.label.toLowerCase()}</span>
          </div>
        ))}
      </div>

      <div className="riesgo-bcra-card">
        <h3>Umbrales</h3>
        <p className="riesgo-bcra-ayuda">
          No se exige deuda cero. Cada lead consultado en el BCRA queda en verde, amarillo o rojo
          según estos valores. Los montos son la deuda con atraso (situación 2 o peor): un préstamo
          al día no cuenta. Al guardar, se recalcula el nivel de todos los leads.
        </p>

        <div className="form-row">
          <div className="form-group">
            <label>Verde: deuda con atraso hasta ($)</label>
            <input
              type="number"
              min={0}
              step={10000}
              className="form-input"
              value={form.verde}
              disabled={!puedeEditar || isLoading}
              onChange={e => setForm(f => ({ ...f, verde: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Amarillo: deuda con atraso hasta ($)</label>
            <input
              type="number"
              min={0}
              step={10000}
              className="form-input"
              value={form.amarilla}
              disabled={!puedeEditar || isLoading}
              onChange={e => setForm(f => ({ ...f, amarilla: e.target.value }))}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Rojo sin importar el monto desde la situación</label>
          <select
            className="form-input"
            value={form.situacion}
            disabled={!puedeEditar || isLoading}
            onChange={e => setForm(f => ({ ...f, situacion: Number(e.target.value) }))}
          >
            {SITUACIONES_ROJAS.map(s => <option key={s.valor} value={s.valor}>{s.label}</option>)}
          </select>
        </div>

        <label className="riesgo-bcra-check">
          <input
            type="checkbox"
            checked={form.judicial}
            disabled={!puedeEditar || isLoading}
            onChange={e => setForm(f => ({ ...f, judicial: e.target.checked }))}
          />
          Rojo si tiene proceso judicial
        </label>
        <label className="riesgo-bcra-check">
          <input
            type="checkbox"
            checked={form.cheques}
            disabled={!puedeEditar || isLoading}
            onChange={e => setForm(f => ({ ...f, cheques: e.target.checked }))}
          />
          Rojo si tiene cheques rechazados
        </label>

        <div className="riesgo-bcra-reglas">
          <div><span style={{ color: 'var(--color-success)' }}>Verde:</span> situación 0 o 1, o deuda con atraso hasta {verdeTxt}.</div>
          <div><span style={{ color: 'var(--color-warning)' }}>Amarillo:</span> deuda con atraso entre {verdeTxt} y {amarillaTxt}.</div>
          <div>
            <span style={{ color: 'var(--color-danger)' }}>Rojo:</span> deuda con atraso de más de {amarillaTxt},
            situación {form.situacion} o peor
            {form.judicial ? ', proceso judicial' : ''}
            {form.cheques ? ', cheques rechazados' : ''}.
          </div>
        </div>

        <div className="riesgo-bcra-pie">
          <span className="riesgo-bcra-ayuda">
            {umbrales?.updated_at
              ? `Último cambio: ${formatFechaHora(umbrales.updated_at, { segundos: false })}` +
                (umbrales.updated_by_name ? ` por ${umbrales.updated_by_name}` : '')
              : ''}
          </span>
          {puedeEditar && (
            <button className="btn-primary" onClick={() => void guardar()} disabled={isGuardando || isLoading}>
              {isGuardando ? 'Guardando...' : 'Guardar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
