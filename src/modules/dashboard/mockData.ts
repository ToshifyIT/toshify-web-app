import type {
  ChargeLine,
  FleetStatus,
  KpiCard,
  PermanenceBar,
  WeeklyBar
} from '../../types/dashboard.types'

export type PeriodData = {
  cobroPendiente: number
  efectividadCobro: number
  totalMultas: number
  totalTelepase: number
  ingresoSiniestros: number
}

const periodCache: Record<string, PeriodData> = {}

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index)
    hash = (hash << 5) - hash + charCode
    hash |= 0
  }
  return Math.abs(hash)
}

function generatePeriodData(key: string): PeriodData {
  const hash = hashString(key)
  const cobroPendiente = 220000 + (hash % 120000)
  const efectividadCobro = 70 + (hash % 25)
  const totalMultas = 15000 + (hash % 50000)
  const totalTelepase = 12000 + (Math.floor(hash / 7) % 40000)
  const ingresoSiniestros = 2 + ((Math.floor(hash / 13) % 600) / 10) / 10

  return {
    cobroPendiente,
    efectividadCobro,
    totalMultas,
    totalTelepase,
    ingresoSiniestros
  }
}

export function getMockPeriodData(key: string): PeriodData {
  if (!periodCache[key]) {
    periodCache[key] = generatePeriodData(key)
  }
  return periodCache[key]
}

export const kpiCards: KpiCard[] = [
  {
    id: 'kpi-dias-sin-siniestro',
    value: '42',
    label: 'DÍAS SIN SINIESTRO',
    subtitle: 'Último: 12 Ene 2026'
  },
  {
    id: 'kpi-dias-sin-robo',
    value: '56',
    label: 'DÍAS SIN ROBO',
    subtitle: 'Último: 28 Dic 2025'
  },
  {
    id: 'kpi-fondo-garantia',
    value: '$3.9M',
    label: 'FONDO DE GARANTÍA',
    subtitle: '13 conductores activos'
  },
  {
    id: 'kpi-pendiente-devolucion',
    value: '$600K',
    label: 'PENDIENTE DEVOLUCIÓN',
    subtitle: '2 en proceso de baja'
  },
  {
    id: 'kpi-total-flota',
    value: '13',
    label: 'TOTAL FLOTA',
    subtitle: '8 activos · 2 taller · 2 disp.'
  }
]

export const chargeLines: ChargeLine[] = [
  {
    id: 'lunes',
    day: 'Lun',
    teoricoA: 185000,
    realA: 150000,
    teoricoB: 155000,
    realB: 130000
  },
  {
    id: 'martes',
    day: 'Mar',
    teoricoA: 185000,
    realA: 145000,
    teoricoB: 155000,
    realB: 125000
  },
  {
    id: 'miercoles',
    day: 'Mié',
    teoricoA: 185000,
    realA: 160000,
    teoricoB: 155000,
    realB: 140000
  },
  {
    id: 'jueves',
    day: 'Jue',
    teoricoA: 185000,
    realA: 170000,
    teoricoB: 155000,
    realB: 150000
  },
  {
    id: 'viernes',
    day: 'Vie',
    teoricoA: 185000,
    realA: 175000,
    teoricoB: 155000,
    realB: 155000
  },
  {
    id: 'sabado',
    day: 'Sáb',
    teoricoA: 185000,
    realA: 160000,
    teoricoB: 155000,
    realB: 145000
  },
  {
    id: 'domingo',
    day: 'Dom',
    teoricoA: 185000,
    realA: 140000,
    teoricoB: 155000,
    realB: 120000
  }
]

export const fleetStatus: FleetStatus[] = [
  {
    id: 'flota-activos',
    name: 'Activos',
    value: 8,
    color: '#2E7D32'
  },
  {
    id: 'flota-taller',
    name: 'Taller',
    value: 2,
    color: '#FF9800'
  },
  {
    id: 'flota-baja',
    name: 'Baja',
    value: 1,
    color: '#E53935'
  },
  {
    id: 'flota-disponibles',
    name: 'Disponibles',
    value: 2,
    color: '#1E88E5'
  }
]

export const weeklyBars: WeeklyBar[] = [
  {
    id: 'sem04',
    week: 'Sem04',
    multas: 5000,
    telepase: 8000
  },
  {
    id: 'sem05',
    week: 'Sem05',
    multas: 12000,
    telepase: 15000
  },
  {
    id: 'sem06',
    week: 'Sem06',
    multas: 28000,
    telepase: 22000
  },
  {
    id: 'sem07',
    week: 'Sem07',
    multas: 36000,
    telepase: 30000
  },
  {
    id: 'sem08',
    week: 'Sem08',
    multas: 50000,
    telepase: 41000
  }
]

export const permanenceBars: PermanenceBar[] = [
  {
    id: 'sem02',
    week: 'Sem02',
    weeks: 2.5
  },
  {
    id: 'sem03',
    week: 'Sem03',
    weeks: 3.1
  },
  {
    id: 'sem04',
    week: 'Sem04',
    weeks: 4.2
  },
  {
    id: 'sem05',
    week: 'Sem05',
    weeks: 5.0
  },
  {
    id: 'sem06',
    week: 'Sem06',
    weeks: 5.8
  },
  {
    id: 'sem07',
    week: 'Sem07',
    weeks: 6.4
  },
  {
    id: 'sem08',
    week: 'Sem08',
    weeks: 7.0
  }
]

