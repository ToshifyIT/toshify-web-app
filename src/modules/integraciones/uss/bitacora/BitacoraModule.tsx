// src/modules/integraciones/uss/bitacora/BitacoraModule.tsx
/**
 * Módulo principal de Bitácora - Control de Turnos Wialon
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
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
    filterPatente,
    setFilterPatente,
    updateChecklist,
  } = useBitacoraData()

  const [searchTerm, setSearchTerm] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce: aplicar búsqueda server-side después de 400ms sin escribir
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setFilterPatente(value.trim())
      setPage(1) // Reset a primera página al buscar
    }, 400)
  }, [setFilterPatente, setPage])

  // Limpiar timeout al desmontar
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  // Filtro local adicional para conductor/ibutton (el server-side solo filtra por patente)
  const filteredRegistros = useMemo(() => {
    if (!searchTerm.trim()) return registros
    const term = searchTerm.toLowerCase()
    // Si el filtro server-side ya está aplicado por patente, solo filtrar adicionalmente por conductor/ibutton
    // para cubrir búsquedas que no sean por patente
    if (filterPatente && registros.length > 0) return registros
    return registros.filter(
      (r) =>
        r.patente?.toLowerCase().includes(term) ||
        r.conductor_wialon?.toLowerCase().includes(term) ||
        r.ibutton?.toLowerCase().includes(term)
    )
  }, [registros, searchTerm, filterPatente])

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
        totalCount={totalCount}
        isLoading={queryState.loading}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onChecklistChange={updateChecklist}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
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
