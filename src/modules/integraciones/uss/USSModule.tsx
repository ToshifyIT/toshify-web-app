// src/modules/integraciones/uss/USSModule.tsx
/**
 * Módulo principal de USS - Excesos de Velocidad
 */

import { useState, useMemo, useCallback } from 'react'
import { useSede } from '../../../contexts/SedeContext'
import { useUSSData } from './hooks'
import { USSHeader, ExcesosStats, ExcesosTable } from './components'
import type { ExcesoStats, ExcesoVelocidad } from './types/uss.types'
import './styles/uss.css'

export function USSModule() {
  const { sedeActualId } = useSede()
  const {
    excesos,
    queryState,
    totalCount,
    dateRange,
    setDateRange,
    setVelocidadRange,
    isRealtime,
  } = useUSSData({ sedeId: sedeActualId, defaultPeriod: 'yesterday' })

  const [searchTerm, setSearchTerm] = useState('')

  // Datos filtrados por la tabla (incluye filtros internos del DataTable)
  const [tableFilteredData, setTableFilteredData] = useState<ExcesoVelocidad[] | null>(null)

  const handleFilteredDataChange = useCallback((data: ExcesoVelocidad[]) => {
    setTableFilteredData(data)
  }, [])

  // Filtrar excesos por búsqueda
  const filteredExcesos = useMemo(() => {
    if (!searchTerm.trim()) return excesos
    const term = searchTerm.toLowerCase()
    return excesos.filter(exceso =>
      exceso.patente?.toLowerCase().includes(term) ||
      exceso.conductor_wialon?.toLowerCase().includes(term) ||
      exceso.localizacion?.toLowerCase().includes(term)
    )
  }, [excesos, searchTerm])

  // Datos para calcular stats: usar los datos filtrados del DataTable si están disponibles,
  // sino usar los filtrados por búsqueda
  const statsData = tableFilteredData ?? filteredExcesos

  // Calcular stats desde los datos que realmente se muestran en la tabla
  const computedStats = useMemo((): ExcesoStats => {
    const data = statsData
    if (data.length === 0) {
      return {
        totalExcesos: 0,
        vehiculosUnicos: 0,
        conductoresUnicos: 0,
        velocidadPromedio: 0,
        velocidadMaxima: 0,
        excesoPromedio: 0,
        duracionPromedio: 0,
      }
    }

    const patentes = new Set(data.map(e => e.patente).filter(Boolean))
    const conductores = new Set(data.map(e => e.conductor_wialon).filter(Boolean))
    const velocidades = data.map(e => e.velocidad_maxima || 0)
    const excesosArr = data.map(e => e.exceso || 0)
    const duraciones = data.map(e => e.duracion_segundos || 0)

    return {
      totalExcesos: data.length,
      vehiculosUnicos: patentes.size,
      conductoresUnicos: conductores.size,
      velocidadPromedio: Math.round(velocidades.reduce((a, b) => a + b, 0) / velocidades.length),
      velocidadMaxima: Math.max(...velocidades),
      excesoPromedio: Math.round(excesosArr.reduce((a, b) => a + b, 0) / excesosArr.length),
      duracionPromedio: Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length),
    }
  }, [statsData])

  return (
    <div className="uss-module">
      {queryState.error && (
        <div className="uss-error">
          <p>{queryState.error}</p>
        </div>
      )}

      <ExcesosStats stats={computedStats} isLoading={queryState.loading} />

      <ExcesosTable
        excesos={filteredExcesos}
        totalCount={totalCount}
        isLoading={queryState.loading}
        onVelocidadRangeChange={setVelocidadRange}
        onFilteredDataChange={handleFilteredDataChange}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        headerControls={
          <USSHeader
            lastUpdate={queryState.lastUpdate}
            isLoading={queryState.loading}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            isRealtime={isRealtime}
          />
        }
      />
    </div>
  )
}
