import { useMemo } from 'react'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Label
} from 'recharts'
import { useVehicleStatusStats } from '../../../hooks/useVehicleStatusStats'
import './FleetDonut.css'

const COLORS = [
  '#10B981', // Emerald 500
  '#3B82F6', // Blue 500
  '#F59E0B', // Amber 500
  '#EF4444', // Red 500
  '#8B5CF6', // Violet 500
  '#EC4899', // Pink 500
  '#6366F1', // Indigo 500
  '#14B8A6', // Teal 500
]

export function FleetDonut() {
  const { data, totalVehicles, loading, returnedToProviderCount } = useVehicleStatusStats()

  // Asignar colores dinámicamente si no vienen del hook o para asegurar variedad
  const chartData = useMemo(() => {
    return data.map((item, index) => ({
      ...item,
      // Si el hook ya trae color, úsalo, si no, usa uno de la paleta
      fill: item.color || COLORS[index % COLORS.length]
    }))
  }, [data])

  if (loading) {
    return (
      <div className="dashboard-card h-[350px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border border-gray-100 shadow-lg rounded-lg z-50">
          <p className="font-semibold text-gray-800 mb-1">{data.name}</p>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-gray-600">
              Cantidad: <span className="font-bold text-gray-900">{data.value}</span>
            </span>
            <span className="text-gray-500">
              Porcentaje: <span className="font-medium">{data.percentage.toFixed(1)}%</span>
            </span>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="fleet-donut-card">
      <h2 className="dashboard-section-title">
        ESTADO DE VEHICULOS
      </h2>
      
      <div className="fleet-donut-content">
        <div className="fleet-donut-layout">
          {/* Chart Container - Fixed Size */}
          <div className="fleet-donut-chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={false}
                  labelLine={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} strokeWidth={0} />
                  ))}
                  <Label
                    content={({ viewBox }: any) => {
                      const { cx, cy } = viewBox
                      return (
                        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan x={cx} y={cy - 5} fontSize="32" fontWeight="800" fill="#1a2332">
                            {totalVehicles}
                          </tspan>
                          <tspan x={cx} y={cy + 25} fontSize="10" fill="#8b95a5" fontWeight="500" letterSpacing="1px" style={{ textTransform: 'uppercase' }}>
                            TOTAL VEHICULOS
                          </tspan>
                        </text>
                      )
                    }}
                  />
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="fleet-donut-legend">
            {chartData.map((entry, index) => (
              <div key={`legend-${index}`} className="fleet-donut-legend-item">
                <div className="fleet-donut-legend-info">
                  <div 
                    className="fleet-donut-legend-dot" 
                    style={{ backgroundColor: entry.fill }}
                  />
                  <span className="fleet-donut-legend-text">
                    {entry.name}
                  </span>
                </div>
                <span className="fleet-donut-legend-value">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Returned to provider note */}
        {returnedToProviderCount > 0 && (
          <div className="fleet-donut-footer">
            <div className="fleet-donut-footer-value">
              {returnedToProviderCount}
            </div>
            <div className="fleet-donut-footer-label">
              Vehículos devueltos a proveedor
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
