// src/modules/integraciones/uss/USSModule.tsx
/**
 * Módulo principal de USS - Excesos de Velocidad
 */

import { useState, useMemo } from 'react'
import { useUSSData } from './hooks'
import { USSHeader, ExcesosStats, ExcesosTable } from './components'
import type { ExcesoStats } from './types/uss.types'
import './styles/uss.css'

export function USSModule() {
  const {
    excesos,
    stats,
    queryState,
    totalCount,
    dateRange,
    setDateRange,
    page,
    setPage,
    pageSize,
    setPageSize,
    refresh,
  } = useUSSData()

  const [searchTerm, setSearchTerm] = useState('')

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

  // Calcular stats de datos filtrados
  const filteredStats = useMemo((): ExcesoStats | null => {
    if (!searchTerm.trim()) return stats
    if (filteredExcesos.length === 0) {
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

    const patentes = new Set(filteredExcesos.map(e => e.patente).filter(Boolean))
    const conductores = new Set(filteredExcesos.map(e => e.conductor_wialon).filter(Boolean))
    const velocidades = filteredExcesos.map(e => e.velocidad_maxima || 0)
    const excesosArr = filteredExcesos.map(e => e.exceso || 0)
    const duraciones = filteredExcesos.map(e => e.duracion_segundos || 0)

    return {
      totalExcesos: filteredExcesos.length,
      vehiculosUnicos: patentes.size,
      conductoresUnicos: conductores.size,
      velocidadPromedio: velocidades.reduce((a, b) => a + b, 0) / velocidades.length,
      velocidadMaxima: Math.max(...velocidades),
      excesoPromedio: excesosArr.reduce((a, b) => a + b, 0) / excesosArr.length,
      duracionPromedio: duraciones.reduce((a, b) => a + b, 0) / duraciones.length,
    }
  }, [stats, filteredExcesos, searchTerm])

  return (
    <div className="uss-module">
      <USSHeader
        lastUpdate={queryState.lastUpdate}
        isLoading={queryState.loading}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onRefresh={refresh}
      />

      {queryState.error && (
        <div className="uss-error">
          <p>{queryState.error}</p>
        </div>
      )}

      <ExcesosStats stats={filteredStats} isLoading={queryState.loading} />

      <ExcesosTable
        excesos={filteredExcesos}
        totalCount={searchTerm.trim() ? filteredExcesos.length : totalCount}
        isLoading={queryState.loading}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />
    </div>
  )
}
