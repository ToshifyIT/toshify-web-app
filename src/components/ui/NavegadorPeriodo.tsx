/**
 * NAVEGADOR DE PERÍODO (reportes)
 * [<] [Semana 45-26 · 02/11 al 08/11 (en curso) ▾] [>]  Ir a la semana actual
 *
 * Y el selector de vista que lo acompaña a la derecha:  [Semanal | Mensual]
 *
 * `periodos` va del más viejo al más nuevo. El componente no calcula fechas:
 * cada pantalla arma su lista (semanas o meses) y decide qué hacer con la elegida.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import '../../styles/navegador-periodo.css'

export type Granularidad = 'semana' | 'mes'

export interface PeriodoOpcion {
  key: string
  /** Texto del selector, ej.: "Semana 45-26 · 02/11 al 08/11" */
  label: string
  /** Período todavía abierto: se agrega " (en curso)" */
  enCurso?: boolean
}

interface NavegadorPeriodoProps {
  periodos: PeriodoOpcion[]
  valor: string
  onCambio: (key: string) => void
  granularidad: Granularidad
  /** Período al que vuelve el enlace "Ir a la semana/mes actual" */
  keyActual?: string
  disabled?: boolean
}

export function NavegadorPeriodo({ periodos, valor, onCambio, granularidad, keyActual, disabled }: NavegadorPeriodoProps) {
  const i = periodos.findIndex(p => p.key === valor)
  const anterior = i > 0 ? periodos[i - 1] : null
  const siguiente = i >= 0 && i < periodos.length - 1 ? periodos[i + 1] : null
  const esSemana = granularidad === 'semana'
  return (
    <div className="navper">
      <button
        type="button"
        className="navper-flecha"
        onClick={() => anterior && onCambio(anterior.key)}
        disabled={disabled || !anterior}
        aria-label={esSemana ? 'Semana anterior' : 'Mes anterior'}
      >
        <ChevronLeft size={16} />
      </button>
      <select
        className="navper-select"
        value={valor}
        onChange={e => onCambio(e.target.value)}
        disabled={disabled}
        aria-label={esSemana ? 'Elegir semana' : 'Elegir mes'}
      >
        {[...periodos].reverse().map(p => (
          <option key={p.key} value={p.key}>
            {p.label}{p.enCurso ? ' (en curso)' : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="navper-flecha"
        onClick={() => siguiente && onCambio(siguiente.key)}
        disabled={disabled || !siguiente}
        aria-label={esSemana ? 'Semana siguiente' : 'Mes siguiente'}
      >
        <ChevronRight size={16} />
      </button>
      {keyActual && valor !== keyActual ? (
        <button type="button" className="navper-link" onClick={() => onCambio(keyActual)}>
          {esSemana ? 'Ir a la semana actual' : 'Ir al mes actual'}
        </button>
      ) : null}
    </div>
  )
}

/** [Semanal | Mensual] — usa el control segmentado del sistema */
export function SelectorGranularidad({ valor, onCambio, disabled }: {
  valor: Granularidad
  onCambio: (g: Granularidad) => void
  disabled?: boolean
}) {
  return (
    <div className="segmentado" role="tablist" aria-label="Vista">
      {(['semana', 'mes'] as const).map(g => (
        <button
          key={g}
          type="button"
          role="tab"
          aria-selected={valor === g}
          className={`segmentado-btn${valor === g ? ' is-active' : ''}`}
          onClick={() => onCambio(g)}
          disabled={disabled}
        >
          {g === 'semana' ? 'Semanal' : 'Mensual'}
        </button>
      ))}
    </div>
  )
}
