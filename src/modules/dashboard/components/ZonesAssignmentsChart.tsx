import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LabelList, Cell } from 'recharts'
import './ZonesAssignmentsChart.css'

const data = [
  { name: 'Palermo', value: 5 },
  { name: 'Belgrano', value: 4 },
  { name: 'Recoleta', value: 3 },
  { name: 'Caballito', value: 3 },
  { name: 'Flores', value: 2 },
  { name: 'San Telmo', value: 1 },
]

export function ZonesAssignmentsChart() {
  return (
    <div className="zones-assignments-chart">
      <h3 className="zones-assignments-title">ZONAS CON NUEVAS ASIGNACIONES</h3>
      <div className="zones-assignments-body">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
          >
            <XAxis type="number" hide />
            <YAxis 
              dataKey="name" 
              type="category" 
              axisLine={false} 
              tickLine={false}
              width={80}
              tick={{ fill: '#64748b', fontSize: 13, fontWeight: 500 }}
            />
            <Bar 
              dataKey="value" 
              barSize={24} 
              radius={[4, 4, 4, 4]} 
              background={{ fill: '#f8fafc', radius: 4 }}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill="#dc2626" />
              ))}
              <LabelList 
                dataKey="value" 
                position="insideRight" 
                fill="#ffffff" 
                fontSize={12} 
                fontWeight="bold"
                offset={8}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
