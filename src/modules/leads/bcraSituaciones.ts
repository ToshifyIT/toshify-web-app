// src/modules/leads/bcraSituaciones.ts
// Situaciones de la Central de Deudores del BCRA (las que trae la consulta de cada lead).
// Se muestran en Parámetros > Riesgo BCRA y en la columna "Sit. BCRA" de Leads.

export interface SituacionBcra {
  valor: number
  nombre: string
  detalle: string
}

export const SITUACIONES_BCRA: SituacionBcra[] = [
  { valor: 0, nombre: 'Sin deudas', detalle: 'No tiene deudas informadas' },
  { valor: 1, nombre: 'Normal', detalle: 'Paga al día (hasta 31 días de atraso)' },
  { valor: 2, nombre: 'Riesgo bajo', detalle: 'Atraso de 31 a 90 días' },
  { valor: 3, nombre: 'Riesgo medio', detalle: 'Atraso de 90 a 180 días' },
  { valor: 4, nombre: 'Riesgo alto', detalle: 'Atraso de 180 días a 1 año' },
  { valor: 5, nombre: 'Irrecuperable', detalle: 'Más de 1 año de atraso' },
  { valor: 6, nombre: 'Irrecuperable por disposición técnica', detalle: 'Deuda dada de baja por el banco' },
]

export function situacionBcra(valor: number | null | undefined): SituacionBcra | undefined {
  return SITUACIONES_BCRA.find(s => s.valor === valor)
}
