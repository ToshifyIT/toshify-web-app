// src/modules/integraciones/uss/bitacora/BitacoraModule.tsx
/**
 * Módulo principal de Bitácora - Control de Turnos Wialon
 */

import { useState, useMemo } from 'react'
import { useBitacoraData } from './hooks/useBitacoraData'
import { BitacoraHeader, BitacoraStats, BitacoraTable } from './components'
import './styles/bitacora.css'
import '../styles/uss.css' // Para estilos del dropdown de fecha

export function BitacoraModule() {
  const {
    registros,
    stats,
    queryState,
    totalCount,
    dateRange,
    setDateRangePreset,
    setCustomDateRange,
    page,
    setPage,
    pageSize,
    setPageSize,
    updateChecklist,
  } = useBitacoraData()

  const [searchTerm, setSearchTerm] = useState('')

  // Filtrar registros por búsqueda local
  const filteredRegistros = useMemo(() => {
    if (!searchTerm.trim()) return registros
    const term = searchTerm.toLowerCase()
    return registros.filter(
      (r) =>
        r.patente?.toLowerCase().includes(term) ||
        r.conductor_wialon?.toLowerCase().includes(term) ||
        r.ibutton?.toLowerCase().includes(term)
    )
  }, [registros, searchTerm])

  return (
    <div className="bitacora-module">
      {queryState.error && (
        <div className="bitacora-error">
          <p>{queryState.error}</p>
        </div>
      )}

      <BitacoraStats stats={stats} isLoading={queryState.loading} />

      <BitacoraTable
        registros={filteredRegistros}
        totalCount={searchTerm.trim() ? filteredRegistros.length : totalCount}
        isLoading={queryState.loading}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onChecklistChange={updateChecklist}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        headerControls={
          <BitacoraHeader
            dateRange={dateRange}
            onDateRangePreset={setDateRangePreset}
            onCustomDateRange={setCustomDateRange}
            isLoading={queryState.loading}
            lastUpdate={queryState.lastUpdate}
          />
        }
      />
    </div>
  )
}
