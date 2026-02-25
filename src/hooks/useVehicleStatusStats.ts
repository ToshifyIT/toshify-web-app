import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export interface VehicleStatusStat {
  name: string
  value: number
  color: string
  percentage: number
}

const PALETTE = [
  '#10B981', // Emerald 500
  '#3B82F6', // Blue 500
  '#F59E0B', // Amber 500
  '#EF4444', // Red 500
  '#8B5CF6', // Violet 500
  '#EC4899', // Pink 500
  '#6366F1', // Indigo 500
  '#14B8A6', // Teal 500
  '#F97316', // Orange 500
  '#06B6D4', // Cyan 500
  '#A855F7', // Purple 500
  '#D946EF', // Fuchsia 500
  '#84CC16', // Lime 500
  '#EAB308', // Yellow 500
  '#22C55E', // Green 500
  '#0EA5E9', // Sky 500
  '#64748B', // Slate 500
]

export function useVehicleStatusStats() {
  const [data, setData] = useState<VehicleStatusStat[]>([])
  const [totalVehicles, setTotalVehicles] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [returnedToProviderCount, setReturnedToProviderCount] = useState(0)

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true)
        
        // 1. Fetch all vehicles with their status
        const { data: vehicles, error: vehiclesError } = await supabase
          .from('vehiculos')
          .select(`
            id,
            estado_id,
            vehiculos_estados (
              id,
              codigo,
              descripcion
            )
          `)
          .is('deleted_at', null)

        if (vehiclesError) throw vehiclesError

        if (!vehicles || vehicles.length === 0) {
          setData([])
          setTotalVehicles(0)
          setReturnedToProviderCount(0)
          return
        }

        // 2. Filter out "Devuelto a proveedor"
        const activeVehicles = vehicles.filter((v: any) => {
          const descripcion = v.vehiculos_estados?.descripcion?.toUpperCase() || ''
          return !descripcion.includes('DEVUELTO') && !descripcion.includes('PROVEEDOR')
        })

        const returnedCount = vehicles.length - activeVehicles.length
        setReturnedToProviderCount(returnedCount)
        setTotalVehicles(activeVehicles.length)

        // 3. Group by status for active vehicles
        const statusMap = new Map<string, { count: number; codigo: string }>()

        activeVehicles.forEach((v: any) => {
          const estado = v.vehiculos_estados
          const descripcion = estado?.descripcion || 'Sin Estado'
          const codigo = estado?.codigo || ''
          
          const current = statusMap.get(descripcion) || { count: 0, codigo }
          statusMap.set(descripcion, { count: current.count + 1, codigo })
        })

        // 4. Transform to chart data
        let chartData: VehicleStatusStat[] = Array.from(statusMap.entries()).map(([name, info]) => {
          const percentage = (info.count / activeVehicles.length) * 100
          return {
            name,
            value: info.count,
            color: '#9CA3AF', // Will be assigned after sort
            percentage
          }
        })

        // Sort by value descending
        chartData.sort((a, b) => b.value - a.value)

        // Assign colors from palette
        chartData = chartData.map((item, index) => ({
          ...item,
          color: PALETTE[index % PALETTE.length]
        }))

        setData(chartData)
      } catch (err: any) {
        console.error('Error fetching vehicle status stats:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  return { data, totalVehicles, loading, error, returnedToProviderCount }
}
