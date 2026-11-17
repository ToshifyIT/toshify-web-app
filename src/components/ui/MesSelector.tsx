import { NavegadorPeriodo } from './NavegadorPeriodo'
import { nombreMes } from '../../utils/meses'

/**
 * Selector de mes en español con el MISMO control que los reportes
 * ([<] [Noviembre 2026 ▾] [>] Ir al mes actual).
 * Reemplaza al <input type="month"> nativo, que el navegador muestra en inglés.
 * `value` y `onChange` usan "YYYY-MM", igual que el input nativo.
 */

function sumarMeses(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}


interface Props {
  value: string
  onChange: (ym: string) => void
  /** Último mes elegible y destino de "Ir al mes actual" (por defecto, el elegido + 12) */
  max?: string
  /** Mes en curso cuando max está en el futuro (proyección): se marca "(en curso)" y es el
   *  destino de "Ir al mes actual". Por defecto, max. */
  actual?: string
  /** Cuántos meses hacia atrás ofrece la lista (por defecto 24) */
  mesesAtras?: number
  disabled?: boolean
}

export function MesSelector({ value, onChange, max, actual, mesesAtras = 24, disabled }: Props) {
  const enCursoKey = actual || max
  const valido = /^\d{4}-\d{2}$/.test(value)
  const tope = max || (valido ? sumarMeses(value, 12) : '')
  const periodos = []
  if (tope) {
    for (let i = mesesAtras; i >= 0; i--) {
      const key = sumarMeses(tope, -i)
      periodos.push({ key, label: nombreMes(key), enCurso: !!enCursoKey && key === enCursoKey })
    }
    if (valido && !periodos.some(p => p.key === value)) periodos.unshift({ key: value, label: nombreMes(value), enCurso: false })
  }
  return (
    <NavegadorPeriodo
      periodos={periodos}
      valor={valido ? value : ''}
      onCambio={onChange}
      granularidad="mes"
      keyActual={enCursoKey}
      disabled={disabled || !valido}
    />
  )
}
