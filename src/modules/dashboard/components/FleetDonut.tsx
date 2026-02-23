import {
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Cell
} from 'recharts'
import { fleetStatus } from '../mockData'

export function FleetDonut() {
  return (
    <div className="dashboard-card">
      <h2 className="dashboard-section-title">
        ESTADO DE FLOTA
      </h2>
      <div className="dashboard-chart-container">
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
          <PieChart>
            <Pie
              data={fleetStatus as any[]}
              dataKey="value"
              nameKey="name"
              innerRadius="60%"
              outerRadius="80%"
              paddingAngle={4}
            >
              {fleetStatus.map(item => (
                <Cell
                  key={item.id}
                  fill={item.color}
                />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => [`${value} vehículos`, '']} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
