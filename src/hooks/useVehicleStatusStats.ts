import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useSede } from '../contexts/SedeContext'

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

const EXCLUDED_CODES = ['ROBO', 'DESTRUCCION_TOTAL', 'JUBILADO', 'DEVUELTO_PROVEEDOR']

export function useVehicleStatusStats() {
  const { aplicarFiltroSede, sedeActualId } = useSede()
  const [data, setData] = useState<VehicleStatusStat[]>([])
  const [totalVehicles, setTotalVehicles] = useState(0)
  const [excludedStats, setExcludedStats] = useState<VehicleStatusStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true)
        
        // 1. Fetch all vehicles with their status
        const { data: vehicles, error: vehiclesError } = await aplicarFiltroSede(supabase
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
          .is('deleted_at', null))

        if (vehiclesError) throw vehiclesError

        if (!vehicles || vehicles.length === 0) {
          setData([])
          setExcludedStats([])
          setTotalVehicles(0)
          return
        }

        // 2. Separate included and excluded vehicles
        const includedVehicles: any[] = []
        const excludedVehicles: any[] = []

        vehicles.forEach((v: any) => {
          const codigo = v.vehiculos_estados?.codigo || ''
          if (EXCLUDED_CODES.includes(codigo)) {
            excludedVehicles.push(v)
          } else {
            includedVehicles.push(v)
          }
        })

        setTotalVehicles(includedVehicles.length)

        // 3. Process Included Stats (Chart Data)
        const includedMap = new Map<string, number>()
        includedVehicles.forEach((v: any) => {
          const descripcion = v.vehiculos_estados?.descripcion || 'Sin Estado'
          includedMap.set(descripcion, (includedMap.get(descripcion) || 0) + 1)
        })

        const chartData: VehicleStatusStat[] = Array.from(includedMap.entries()).map(([name, count]) => {
          return {
            name,
            value: count,
            color: '#9CA3AF', // Will be assigned later
            percentage: (count / includedVehicles.length) * 100
          }
        })

        // Sort included by value descending
        chartData.sort((a, b) => b.value - a.value)
        
        // Assign colors
        chartData.forEach((item, index) => {
          item.color = PALETTE[index % PALETTE.length]
        })

        setData(chartData)

        // 4. Process Excluded Stats (Footer Data)
        const excludedMap = new Map<string, number>()
        excludedVehicles.forEach((v: any) => {
          const descripcion = v.vehiculos_estados?.descripcion || 'Sin Estado'
          excludedMap.set(descripcion, (excludedMap.get(descripcion) || 0) + 1)
        })

        const footerData: VehicleStatusStat[] = Array.from(excludedMap.entries()).map(([name, count]) => {
          return {
            name,
            value: count,
            color: '#64748B', // Default slate color for excluded
            percentage: 0 // Not needed for footer
          }
        })
        
        // Sort excluded by value descending
        footerData.sort((a, b) => b.value - a.value)

        setExcludedStats(footerData)

      } catch (err: any) {
        console.error('Error fetching vehicle stats:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [sedeActualId])

  return { data, totalVehicles, excludedStats, loading, error }
}
