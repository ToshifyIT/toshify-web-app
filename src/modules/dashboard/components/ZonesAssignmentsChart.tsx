import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LabelList, Cell } from 'recharts'
import { startOfWeek, endOfWeek, isWithinInterval, parseISO, getWeek, setWeek, startOfDay } from 'date-fns'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import { PeriodPicker } from './PeriodPicker'
import './ZonesAssignmentsChart.css'

const DEFAULT_ZONES = [
  'Palermo',
  'Belgrano',
  'Recoleta',
  'Caballito',
  'Flores',
  'San Telmo'
]

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
    async function fetchData() {
      setLoading(true)
      try {
        // 1. Obtener todas las zonas existentes en la tabla conductores para usar como base
        const { data: allConductores, error: zonesError } = await supabase
          .from('conductores')
          .select('zona')
          .not('zona', 'is', null)

        if (zonesError) throw zonesError

        // Extraer zonas únicas y normalizarlas
        const uniqueZones = new Set<string>()
        allConductores?.forEach((c: any) => {
          if (c.zona && c.zona.trim() !== '') {
            // Normalizar: Capitalize first letter (CABA -> Caba, SUR -> Sur, etc.)
            // O mantener formato original si es CABA
            let zona = c.zona.trim()
            // Capitalizar primera letra de cada palabra
            zona = zona.toLowerCase().replace(/(^\w|\s\w)/g, (m: string) => m.toUpperCase())
            
            // Excepción común para CABA
            if (zona.toUpperCase() === 'CABA') zona = 'CABA'
            
            uniqueZones.add(zona)
          }
        })

        // Crear mapa inicial con todas las zonas en 0
        const zoneCounts = new Map<string, number>()
        Array.from(uniqueZones).sort().forEach(zona => {
          zoneCounts.set(zona, 0)
        })

        // 2. Obtener historial y procesar asignaciones de la semana seleccionada
        
        // Parsear la semana seleccionada (Sem XX YYYY)
        let weekStart: Date, weekEnd: Date
        const match = selectedWeek.match(/Sem (\d+) (\d{4})/)
        if (match) {
            const week = parseInt(match[1], 10)
            const year = parseInt(match[2], 10)
            // Crear fecha base (4 de Enero siempre cae en semana 1 ISO)
            const baseDate = new Date(year, 0, 4)
            const targetDate = setWeek(baseDate, week, { weekStartsOn: 1 })
            weekStart = startOfWeek(targetDate, { weekStartsOn: 1 })
            weekEnd = endOfWeek(targetDate, { weekStartsOn: 1 })
        } else {
            // Fallback a semana actual
            const now = new Date()
            weekStart = startOfWeek(now, { weekStartsOn: 1 })
            weekEnd = endOfWeek(now, { weekStartsOn: 1 })
        }

        // Determinar si es la semana actual
        const now = new Date()
        const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 })
        const isCurrentWeek = weekStart.getTime() === currentWeekStart.getTime()

        let query = supabase
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

        if (sedeActualId) {
          query = query.eq('asignaciones.sede_id', sedeActualId)
        }

        const { data: historyData, error: historyError } = await query
        if (historyError) throw historyError

        const conductorHistory = new Map<string, any[]>()
        historyData?.forEach((item: any) => {
          const current = conductorHistory.get(item.conductor_id) || []
          current.push(item)
          conductorHistory.set(item.conductor_id, current)
        })

        const validConductorIds: string[] = []
        for (const [conductorId, assignments] of conductorHistory.entries()) {
          // Ordenar asignaciones para tener la primera histórica
          assignments.sort((a: any, b: any) => new Date(a.asignaciones.fecha_inicio).getTime() - new Date(b.asignaciones.fecha_inicio).getTime())
          const firstAssignment = assignments[0].asignaciones
          
          if (!firstAssignment.fecha_inicio) continue

          // Filtrar por sede si aplica
          if (sedeActualId && firstAssignment.sede_id !== sedeActualId) continue

          const fechaInicio = parseISO(firstAssignment.fecha_inicio)
          const inRange = isWithinInterval(fechaInicio, { start: weekStart, end: weekEnd })

          // Lógica Híbrida:
          // 1. Semana Actual: Strict Mode (Solo 1 asignación histórica) -> "Nuevos Puros"
          // 2. Semanas Pasadas: Cohort Mode (Primera asignación histórica en esa semana) -> "Ingresos Históricos"
          
          if (isCurrentWeek) {
            // Lógica original estricta para semana en curso
            if (assignments.length !== 1) continue
            
            const hasActiveAssignment = assignments.some(a => 
                a.asignaciones.estado === 'activo' || a.asignaciones.estado === 'activa'
            )
            if (!hasActiveAssignment) continue

            if (inRange) {
                validConductorIds.push(conductorId)
            }
          } else {
            // Lógica de cohorte para semanas pasadas
            // Solo nos importa si su PRIMERA asignación cayó en esta semana
            if (inRange) {
                validConductorIds.push(conductorId)
            }
          }
        }

        // 3. Si hay conductores válidos, sumar sus zonas
        if (validConductorIds.length > 0) {
          const { data: conductoresData, error: conductoresError } = await supabase
            .from('conductores')
            .select('id, zona')
            .in('id', validConductorIds)

          if (conductoresError) throw conductoresError

          conductoresData?.forEach((conductor: any) => {
            if (conductor.zona) {
                // Normalizar nombre de zona
                let zona = conductor.zona.trim() || 'Sin Zona'
                if (zona === 'CABA') zona = 'CABA' // Mantener CABA tal cual
                else if (zona === 'GBA Norte') zona = 'Norte'
                else if (zona === 'GBA Oeste') zona = 'Oeste'
                else if (zona === 'GBA Sur') zona = 'Sur'
                else {
                    // Normalización estándar para otros casos
                    zona = zona.toLowerCase().replace(/(^\w|\s\w)/g, (m: string) => m.toUpperCase())
                    if (zona.toUpperCase() === 'CABA') zona = 'CABA'
                }

                const currentCount = zoneCounts.get(zona) || 0
                zoneCounts.set(zona, currentCount + 1)
            }
          })
        }

        // 4. Convertir a array final
        // Filtramos zonas que tengan 0 si queremos mostrar solo las activas, 
        // o mostramos todas las disponibles en la BD aunque estén en 0.
        // Según requerimiento anterior: "igual quiero que me aparezca la gráfica" -> mostramos todas las zonas posibles
        const chartData = Array.from(zoneCounts.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value) // Mayor a menor

        // Si no hay ninguna zona en la BD siquiera, usar fallback
        if (chartData.length === 0) {
           setData([]) 
        } else {
           setData(chartData)
        }

      } catch (error) {
        console.error('Error fetching zones assignments:', error)
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
