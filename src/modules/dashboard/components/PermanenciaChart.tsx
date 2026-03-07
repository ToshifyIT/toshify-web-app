import { useState, useEffect } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import { 
  startOfMonth, 
  endOfMonth, 
  eachWeekOfInterval, 
  endOfWeek, 
  format, 
  parse,
  getWeek,
  startOfWeek
} from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import { PeriodPicker } from './PeriodPicker'
import './PermanenciaStyles.css'

/** Formatea Date a 'YYYY-MM-DD' usando componentes locales, sin conversión UTC */
function formatDateOnly(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface WeeklyData {
  name: string
  value: number
  fullDate: string
}

export function PermanenciaChart() {
  const { sedeActual } = useSede()
  const [data, setData] = useState<WeeklyData[]>([])
  const [loading, setLoading] = useState(true)
  
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    const monthName = format(now, 'MMM', { locale: es })
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${format(now, 'yyyy')}`
  })

  useEffect(() => {
    let isMounted = true

    async function fetchData() {
      try {
        setLoading(true)

        const now = new Date()
        let parsedDate = now
        try {
          parsedDate = parse(selectedMonth, 'MMM yyyy', now, { locale: es })
        } catch (_e) {
          // silently ignored
        }
        
        const monthStart = startOfMonth(parsedDate)
        const monthEnd = endOfMonth(parsedDate)
        const intervalStart = startOfWeek(monthStart, { weekStartsOn: 1 })
        const intervalEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

        const weeks = eachWeekOfInterval({
          start: intervalStart,
          end: intervalEnd
        }, { weekStartsOn: 1 })

        // 1. Fetch ALL terminated conductors for the full interval in ONE query
        let query = supabase
          .from('conductores')
          .select('id, fecha_terminacion')
          .gte('fecha_terminacion', formatDateOnly(intervalStart))
          .lte('fecha_terminacion', formatDateOnly(intervalEnd))
        
        if (sedeActual?.id) {
          query = query.eq('sede_id', sedeActual.id)
        }

        const { data: allConductors } = await query

        // 2. If we have conductors, fetch ALL their assignments in ONE batched query
        const allIds = allConductors?.map(c => c.id) || []
        let assignmentsByDriver = new Map<string, number>()

        if (allIds.length > 0) {
          const { data: allAssignments } = await supabase
            .from('asignaciones_conductores')
            .select('conductor_id, asignaciones(fecha_inicio, fecha_fin)')
            .in('conductor_id', allIds)

          if (allAssignments) {
            for (const item of allAssignments) {
              const asig = item.asignaciones as any
              if (!asig?.fecha_inicio) continue
              const inicio = new Date(asig.fecha_inicio)
              const fin = asig.fecha_fin ? new Date(asig.fecha_fin) : new Date()
              const days = Math.ceil(Math.abs(fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24))
              assignmentsByDriver.set(item.conductor_id, (assignmentsByDriver.get(item.conductor_id) || 0) + days)
            }
          }
        }

        // 3. Group conductors by week and compute averages (pure in-memory, no queries)
        const chartData = weeks.map((weekStart) => {
          const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
          const weekNumber = getWeek(weekStart, { weekStartsOn: 1 })

          const weekStartStr = formatDateOnly(weekStart)
          const weekEndStr = formatDateOnly(weekEnd)
          const weekConductors = (allConductors || []).filter(c => {
            const ftStr = typeof c.fecha_terminacion === 'string'
              ? c.fecha_terminacion.slice(0, 10)
              : formatDateOnly(new Date(c.fecha_terminacion))
            return ftStr >= weekStartStr && ftStr <= weekEndStr
          })

          if (weekConductors.length === 0) {
            return {
              name: `Sem ${String(weekNumber).padStart(2, '0')}`,
              value: 0,
              fullDate: format(weekStart, 'd MMM', { locale: es })
            }
          }

          let totalTenure = 0
          for (const c of weekConductors) {
            totalTenure += assignmentsByDriver.get(c.id) || 0
          }

          return {
            name: `Sem ${String(weekNumber).padStart(2, '0')}`,
            value: Math.round(totalTenure / weekConductors.length),
            fullDate: format(weekStart, 'd MMM', { locale: es })
          }
        })

        if (isMounted) {
          setData(chartData)
          setLoading(false)
        }
      } catch (_err) {
        if (isMounted) setLoading(false)
      }
    }

    fetchData()
    return () => { isMounted = false }
  }, [selectedMonth, sedeActual?.id])

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="permanencia-chart__tooltip">
          <p className="permanencia-chart__tooltip-label">{label}</p>
          <p className="permanencia-chart__tooltip-value">
            <span className="permanencia-chart__tooltip-dot" />
            Promedio: <strong>{payload[0].value} días</strong>
          </p>
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="permanencia-chart__loading">
        <div className="permanencia-chart__spinner" />
      </div>
    )
  }

  return (
    <div className="permanencia-chart">
      <div className="permanencia-chart__header">
        <h3 className="permanencia-chart__title">
          PERMANENCIA PROMEDIO DE CONDUCTORES
        </h3>
        <div className="permanencia-chart__picker">
          <PeriodPicker 
            granularity="mes"
            value={selectedMonth}
            onChange={setSelectedMonth}
          />
        </div>
      </div>
      
      <div className="permanencia-chart__body">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={250}>
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
            <defs>
              <linearGradient id="permanenciaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#dc2626" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#dc2626" stopOpacity={0.01}/>
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border-primary, #f1f5f9)" />
            <XAxis 
              dataKey="name" 
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => `${value}d`}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border-primary, #e2e8f0)', strokeDasharray: '4 4' }} />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#dc2626" 
              strokeWidth={2.5}
              fillOpacity={1} 
              fill="url(#permanenciaGradient)" 
              dot={{ r: 5, stroke: '#dc2626', strokeWidth: 2.5, fill: 'var(--card-bg, #ffffff)' }}
              activeDot={{ r: 7, stroke: '#dc2626', strokeWidth: 2.5, fill: 'var(--card-bg, #ffffff)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
