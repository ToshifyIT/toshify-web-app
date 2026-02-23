import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { weeklyBars } from '../mockData'

export function FinesChart() {
  return (
    <div className="dashboard-card">
      <h2 className="dashboard-section-title">
        MULTAS Y TELEPASE
      </h2>
      <div className="dashboard-chart-container">
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
          <BarChart
            data={weeklyBars}
            margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="week" />
            <YAxis
              tickFormatter={value => `$${Math.round((value as number) / 1000)}K`}
              domain={[0, 60000]}
            />
            <Tooltip
              formatter={(value: number) => [`$${value.toLocaleString('es-AR')}`, '']}
            />
            <Legend />
            <Bar
              dataKey="multas"
              name="Multas"
              fill="#E53935"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="telepase"
              name="Telepase"
              fill="#9C27B0"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

