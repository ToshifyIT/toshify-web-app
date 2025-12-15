// src/modules/integraciones/uss/USSModule.tsx
/**
 * Módulo principal de USS - Excesos de Velocidad
 */

import { useUSSData } from './hooks'
import { USSHeader, ExcesosStats, ExcesosTable } from './components'
import './styles/uss.css'

export function USSModule() {
  const {
    excesos,
    stats,
    queryState,
    totalCount,
    dateRange,
    setDateRange,
    patenteFilter,
    setPatenteFilter,
    conductorFilter,
    setConductorFilter,
    minExcesoFilter,
    setMinExcesoFilter,
    page,
    setPage,
    pageSize,
    setPageSize,
    refresh,
  } = useUSSData()

  return (
    <div className="uss-module">
      <USSHeader
        lastUpdate={queryState.lastUpdate}
        isLoading={queryState.loading}
        dateRange={dateRange}
        patenteFilter={patenteFilter}
        conductorFilter={conductorFilter}
        minExcesoFilter={minExcesoFilter}
        onDateRangeChange={setDateRange}
        onPatenteFilterChange={setPatenteFilter}
        onConductorFilterChange={setConductorFilter}
        onMinExcesoFilterChange={setMinExcesoFilter}
        onRefresh={refresh}
      />

      {queryState.error && (
        <div className="uss-error">
          <p>{queryState.error}</p>
        </div>
      )}

      <ExcesosStats stats={stats} isLoading={queryState.loading} />

      <ExcesosTable
        excesos={excesos}
        totalCount={totalCount}
        isLoading={queryState.loading}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  )
}
