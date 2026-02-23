export interface KpiCard {
  id: string
  value: string
  label: string
  subtitle: string
}

export interface PeriodMetric {
  id: string
  name: string
  valueA: string
  valueB: string
  variationLabel: string
  variationSign: 'positive' | 'negative'
}

export interface ChargeLine {
  id: string
  day: string
  teoricoA: number
  realA: number
  teoricoB: number
  realB: number
}

export interface FleetStatus {
  id: string
  name: string
  value: number
  color: string
}

export interface WeeklyBar {
  id: string
  week: string
  multas: number
  telepase: number
}

export interface PermanenceBar {
  id: string
  week: string
  weeks: number
}

