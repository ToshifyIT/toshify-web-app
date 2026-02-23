import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { permanenceBars } from '../mockData'

export function PermanenceChart() {
  return (
    <div className="dashboard-card">
      <h2 className="dashboard-section-title">
        PERMANENCIA PROMEDIO
      </h2>
      <div className="dashboard-chart-container">
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
          <BarChart
            data={permanenceBars}
            margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="week" />
            <YAxis
              domain={[0, 8]}
              tickFormatter={value => `${value} sem`}
            />
            <Tooltip
              formatter={(value: number) => [`${value} semanas`, 'Permanencia']}
            />
            <Bar
              dataKey="weeks"
              name="Permanencia"
              fill="#546E7A"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

