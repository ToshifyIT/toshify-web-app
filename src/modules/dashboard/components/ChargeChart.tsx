import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { chargeLines } from '../mockData'

export function ChargeChart() {
  return (
    <div className="dashboard-card dashboard-card-charge">
      <h2 className="dashboard-section-title">
        COBRO TEÓRICO VS REAL
      </h2>
      <div className="dashboard-chart-container dashboard-chart-container-tall">
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
          <LineChart
            data={chargeLines}
            margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis
              tickFormatter={value => `$${Math.round((value as number) / 1000)}K`}
              domain={[0, 200000]}
            />
            <Tooltip
              formatter={(value: number) => [`$${value.toLocaleString('es-AR')}`, '']}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="teoricoA"
              name="Teórico A"
              stroke="#1E88E5"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="realA"
              name="Real A"
              stroke="#4CAF50"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="teoricoB"
              name="Teórico B"
              stroke="#FF9800"
              strokeWidth={2}
              dot={false}
              strokeDasharray="4 4"
            />
            <Line
              type="monotone"
              dataKey="realB"
              name="Real B"
              stroke="#E53935"
              strokeWidth={2}
              dot={{ r: 3 }}
              strokeDasharray="4 4"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

