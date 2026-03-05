import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts'
import { startOfWeek, endOfWeek, isWithinInterval, parseISO, getWeek, setWeek } from 'date-fns'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import { PeriodPicker } from './PeriodPicker'
import './ZonesAssignmentsChart.css'


/* const DEFAULT_ZONES = [
  'Palermo',
  'Belgrano',
  'Recoleta',
  'Caballito',
  'Flores',
  'San Telmo'
] */


export function ZonesAssignmentsChart() {
  const { sedeActualId } = useSede()
  
  // Estado para el filtro semanal
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const now = new Date()
    const week = getWeek(now, { weekStartsOn: 1 })
    const year = now.getFullYear()
    return `Sem ${week.toString().padStart(2, '0')} ${year}`
  })

  const [data, setData] = useState<{ name: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function normalizeZona(raw: string): string {
      let zona = raw.trim()
      if (zona.toUpperCase() === 'CABA') return 'CABA'
      if (zona === 'GBA Norte') return 'Norte'
      if (zona === 'GBA Oeste') return 'Oeste'
      if (zona === 'GBA Sur') return 'Sur'
      zona = zona.toLowerCase().replace(/(^\w|\s\w)/g, (m: string) => m.toUpperCase())
      if (zona.toUpperCase() === 'CABA') return 'CABA'
      return zona
    }

    async function fetchData() {
      setLoading(true)
      try {
        // Parsear la semana seleccionada (Sem XX YYYY)
        let weekStart: Date, weekEnd: Date
        const match = selectedWeek.match(/Sem (\d+) (\d{4})/)
        if (match) {
            const week = parseInt(match[1], 10)
            const year = parseInt(match[2], 10)
            const baseDate = new Date(year, 0, 4)
            const targetDate = setWeek(baseDate, week, { weekStartsOn: 1 })
            weekStart = startOfWeek(targetDate, { weekStartsOn: 1 })
            weekEnd = endOfWeek(targetDate, { weekStartsOn: 1 })
        } else {
            const now = new Date()
            weekStart = startOfWeek(now, { weekStartsOn: 1 })
            weekEnd = endOfWeek(now, { weekStartsOn: 1 })
        }

        const now = new Date()
        const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 })
        const isCurrentWeek = weekStart.getTime() === currentWeekStart.getTime()

        // 1+2 in PARALLEL: zonas base + asignaciones filtered by date range
        let zonesQuery = supabase
          .from('conductores')
          .select('zona')
          .not('zona', 'is', null)

        let assignQuery = supabase
          .from('asignaciones_conductores')
          .select(`
            conductor_id,
            asignaciones!inner (
              id,
              fecha_inicio,
              estado,
              sede_id
            )
          `)
          .gte('asignaciones.fecha_inicio', weekStart.toISOString())
          .lte('asignaciones.fecha_inicio', weekEnd.toISOString())

        if (sedeActualId) {
          zonesQuery = zonesQuery.eq('sede_id', sedeActualId)
          assignQuery = assignQuery.eq('asignaciones.sede_id', sedeActualId)
        }

        const [{ data: allConductores, error: zonesError }, { data: historyData, error: historyError }] = await Promise.all([
          zonesQuery,
          assignQuery
        ])

        if (zonesError) throw zonesError
        if (historyError) throw historyError

        // Build zone baseline
        const uniqueZones = new Set<string>()
        allConductores?.forEach((c: any) => {
          if (c.zona && c.zona.trim() !== '') {
            uniqueZones.add(normalizeZona(c.zona))
          }
        })

        const zoneCounts = new Map<string, number>()
        Array.from(uniqueZones).sort().forEach(zona => {
          zoneCounts.set(zona, 0)
        })

        // Group assignments by conductor
        const conductorHistory = new Map<string, any[]>()
        historyData?.forEach((item: any) => {
          const current = conductorHistory.get(item.conductor_id) || []
          current.push(item)
          conductorHistory.set(item.conductor_id, current)
        })

        const validConductorIds: string[] = []
        for (const [conductorId, assignments] of conductorHistory.entries()) {
          assignments.sort((a: any, b: any) => new Date(a.asignaciones.fecha_inicio).getTime() - new Date(b.asignaciones.fecha_inicio).getTime())
          const firstAssignment = assignments[0].asignaciones
          
          if (!firstAssignment.fecha_inicio) continue
          if (sedeActualId && firstAssignment.sede_id !== sedeActualId) continue

          const fechaInicio = parseISO(firstAssignment.fecha_inicio)
          const inRange = isWithinInterval(fechaInicio, { start: weekStart, end: weekEnd })

          if (isCurrentWeek) {
            if (assignments.length !== 1) continue
            const hasActiveAssignment = assignments.some(a => 
                a.asignaciones.estado === 'activo' || a.asignaciones.estado === 'activa'
            )
            if (!hasActiveAssignment) continue
            if (inRange) validConductorIds.push(conductorId)
          } else {
            if (inRange) validConductorIds.push(conductorId)
          }
        }

        // 3. Fetch conductor zones (only for valid IDs)
        if (validConductorIds.length > 0) {
          const { data: conductoresData, error: conductoresError } = await supabase
            .from('conductores')
            .select('id, zona')
            .in('id', validConductorIds)

          if (conductoresError) throw conductoresError

          conductoresData?.forEach((conductor: any) => {
            if (conductor.zona) {
                const zona = normalizeZona(conductor.zona)
                const currentCount = zoneCounts.get(zona) || 0
                zoneCounts.set(zona, currentCount + 1)
            }
          })
        }

        const chartData = Array.from(zoneCounts.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)

        setData(chartData.length > 0 ? chartData : [])

      } catch (_error) {
        // silently ignored
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [sedeActualId, selectedWeek])

  if (loading) {
    return (
      <div className="zones-assignments-chart">
        <div className="flex items-center justify-between mb-4 relative z-50">
            <h3 className="zones-assignments-title mb-0">ZONAS CON NUEVAS ASIGNACIONES</h3>
            <div className="scale-90 origin-right relative">
                <PeriodPicker 
                    granularity="semana" 
                    value={selectedWeek} 
                    onChange={setSelectedWeek}
                    align="right"
                />
            </div>
        </div>
        <div className="zones-assignments-body flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="zones-assignments-chart">
      <div className="flex items-center justify-between mb-4 relative z-50">
        <h3 className="zones-assignments-title mb-0">ZONAS CON NUEVAS ASIGNACIONES</h3>
        <div className="scale-90 origin-right relative">
            <PeriodPicker 
                granularity="semana" 
                value={selectedWeek} 
                onChange={setSelectedWeek}
                align="right"
            />
        </div>
      </div>
      <div className="zones-assignments-body">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 0, right: 0, left: 40, bottom: 0 }}
          >
            <XAxis type="number" domain={[0, 'dataMax + 1']} hide />
            <YAxis 
              yAxisId="left"
              type="category" 
              dataKey="name" 
              width={80}
              tick={{ fill: '#6B7280', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              type="category" 
              dataKey="value" 
              width={40}
              tick={{ fill: '#374151', fontSize: 12, fontWeight: 'bold' }}
              tickFormatter={(value) => value > 0 ? value : ''}
              axisLine={false}
              tickLine={false}
            />
            <Bar 
              yAxisId="left"
              dataKey="value" 
              radius={[4, 4, 4, 4]} 
              barSize={32}
              background={{ fill: '#F9FAFB', radius: 4 }}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.value > 0 ? '#DC2626' : '#F3F4F6'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
