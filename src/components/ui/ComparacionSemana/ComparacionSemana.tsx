// src/components/ui/ComparacionSemana/ComparacionSemana.tsx
// Flecha "▲ 3 vs sem. ant." para las tarjetas de métricas (mismo formato que Estado
// de Flota). Verde si mejoró, rojo si empeoró, gris si quedó igual. Al pasar el
// mouse muestra el valor de la semana anterior.
//  - invertido: subir es malo (bajas, licencias vencidas, deuda…)
//  - puntos: el valor es un porcentaje y la diferencia se muestra en puntos
//  - moneda: importes en pesos, abreviados ($ 1,2 M)
//  - abajo: se muestra debajo de la etiqueta (tarjetas que ya tienen un botón a la derecha)
import './ComparacionSemana.css'

const fmtMoneda = (n: number) =>
  `$ ${new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`

export function ComparacionSemana({ actual, anterior, puntos = false, invertido = false, moneda = false, abajo = false, etiqueta = 'vs sem. ant.' }: {
  actual: number
  anterior: number | null | undefined
  puntos?: boolean
  invertido?: boolean
  moneda?: boolean
  abajo?: boolean
  etiqueta?: string
}) {
  if (anterior === null || anterior === undefined || !Number.isFinite(anterior)) return null
  const dif = actual - anterior
  const umbral = puntos ? 0.05 : moneda ? 1 : 0.5
  const plano = Math.abs(dif) < umbral
  const bueno = invertido ? dif < 0 : dif > 0
  const tono = plano ? 'neutro' : bueno ? 'bueno' : 'malo'
  const texto = puntos
    ? `${Math.abs(dif).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pts`
    : moneda
      ? fmtMoneda(Math.abs(dif))
      : Math.abs(Math.round(dif)).toLocaleString('es-AR')
  const anteriorTexto = puntos
    ? `${anterior.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
    : moneda
      ? fmtMoneda(anterior)
      : Math.round(anterior).toLocaleString('es-AR')
  return (
    <span
      className={`cmp-sem cmp-sem--${tono}${abajo ? ' cmp-sem--abajo' : ''}`}
      title={`Semana anterior: ${anteriorTexto}`}
      onClick={(e) => e.stopPropagation()}
    >
      {plano ? '=' : dif > 0 ? '▲' : '▼'} {plano ? 'igual' : texto}
      {etiqueta ? <span className="cmp-sem-sufijo"> {etiqueta}</span> : null}
    </span>
  )
}
