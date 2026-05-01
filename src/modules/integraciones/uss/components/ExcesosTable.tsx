// src/modules/integraciones/uss/components/ExcesosTable.tsx
/**
 * Tabla de excesos de velocidad usando DataTable con filtros automáticos
 * Toda la data viene del servidor, DataTable maneja paginación/filtros/sorting del cliente
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { type ColumnDef, type Table } from '@tanstack/react-table'
import { DataTable } from '../../../../components/ui/DataTable/DataTable'
import { Search, MapPin, Gauge, X } from 'lucide-react'
import type { ExcesoVelocidad } from '../types/uss.types'
import { normalizePatente } from '../../../../utils/normalizeDocuments'
import {
  formatDate,
  formatDuration,
  formatSpeed,
  extractConductorName,
  truncateLocation,
  getSeverityColor,
} from '../utils/uss.utils'

// Formato hora Argentina HH:MM:SS
function formatTimeART(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

interface ExcesosTableProps {
  readonly excesos: ExcesoVelocidad[]
  readonly totalCount: number
  readonly isLoading: boolean
  readonly searchTerm: string
  readonly onSearchChange: (term: string) => void
  readonly headerControls?: React.ReactNode
  readonly onVelocidadRangeChange?: (min: number | undefined, max: number | undefined) => void
  readonly onFilteredDataChange?: (data: ExcesoVelocidad[]) => void
}

export function ExcesosTable({
  excesos,
  totalCount,
  isLoading,
  searchTerm,
  onSearchChange,
  headerControls,
  onVelocidadRangeChange,
  onFilteredDataChange,
}: ExcesosTableProps) {

  // Observar datos filtrados del DataTable para actualizar stats
  const tableRef = useRef<Table<ExcesoVelocidad> | null>(null)
  const lastFilteredKeyRef = useRef<string>('')
  const onFilteredDataChangeRef = useRef(onFilteredDataChange)
  onFilteredDataChangeRef.current = onFilteredDataChange

  const handleTableReady = useCallback((table: Table<ExcesoVelocidad>) => {
    tableRef.current = table
  }, [])

  // Polling: verificar cada 300ms si los datos filtrados del DataTable cambiaron
  // Necesario porque los filtros internos del DataTable no disparan re-renders en este componente
  useEffect(() => {
    const checkFiltered = () => {
      if (!tableRef.current || !onFilteredDataChangeRef.current) return
      const filteredRows = tableRef.current.getFilteredRowModel().rows
      const key = filteredRows.length + '_' + (filteredRows.length > 0 ? filteredRows[0].id + '_' + filteredRows[filteredRows.length - 1].id : '')
      if (key !== lastFilteredKeyRef.current) {
        lastFilteredKeyRef.current = key
        onFilteredDataChangeRef.current(filteredRows.map(r => r.original))
      }
    }
    // Check inmediato al montar
    checkFiltered()
    const interval = setInterval(checkFiltered, 300)
    return () => clearInterval(interval)
  }, [excesos])

  // Estado para filtro de rango de velocidad (servidor)
  const [velMin, setVelMin] = useState('')
  const [velMax, setVelMax] = useState('')
  const [showVelFilter, setShowVelFilter] = useState(false)
  const velFilterActive = velMin !== '' || velMax !== ''

  // Estado para modal del mapa (al click en ubicación)
  const [mapaExceso, setMapaExceso] = useState<ExcesoVelocidad | null>(null)

  // Quick filter por proveedor GPS (USS / GEOTAB)
  const [gpsFilter, setGpsFilter] = useState<'USS' | 'GEOTAB' | null>(null)

  // Conteos por proveedor GPS (sobre el universo cargado, no afectado por otros filtros)
  const gpsCounts = useMemo(() => {
    let uss = 0, geotab = 0
    for (const e of excesos) {
      if (e.gps_origen === 'GEOTAB') geotab++
      else uss++
    }
    return { uss, geotab }
  }, [excesos])

  // Aplicar filtro GPS sobre la data antes de pasarla al DataTable
  const excesosFiltradosPorGps = useMemo(() => {
    if (gpsFilter === null) return excesos
    return excesos.filter(e => (e.gps_origen || 'USS') === gpsFilter)
  }, [excesos, gpsFilter])

  const applyVelocidadFilter = () => {
    const min = velMin !== '' ? Number(velMin) : undefined
    const max = velMax !== '' ? Number(velMax) : undefined
    onVelocidadRangeChange?.(min, max)
    setShowVelFilter(false)
  }

  const clearVelocidadFilter = () => {
    setVelMin('')
    setVelMax('')
    onVelocidadRangeChange?.(undefined, undefined)
    setShowVelFilter(false)
  }

  // Columnas — headers como texto plano para que DataTable aplique filtros automáticos
  const columns = useMemo<ColumnDef<ExcesoVelocidad, unknown>[]>(() => [
    {
      id: 'gps_col',
      accessorFn: (row) => row.gps_origen || 'USS',
      header: 'GPS',
      cell: ({ row }) => {
        const origen = row.original.gps_origen || 'USS'
        const isGeotab = origen === 'GEOTAB'
        return (
          <span style={{
            fontSize: '10px',
            fontWeight: 600,
            color: '#fff',
            background: isGeotab ? '#3b82f6' : '#10b981',
            padding: '2px 8px',
            borderRadius: '3px',
            whiteSpace: 'nowrap',
            letterSpacing: '0.5px'
          }}>
            {origen}
          </span>
        )
      },
      size: 70,
      enableSorting: false,
    },
    {
      accessorKey: 'fecha_evento',
      header: 'Fecha/Hora',
      cell: ({ row }) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>{formatDate(row.original.fecha_evento)}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
            {formatTimeART(row.original.fecha_evento)}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'patente',
      header: 'Patente',
      cell: ({ row }) => (
        <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
          {normalizePatente(row.original.patente)}
        </span>
      ),
    },
    {
      accessorKey: 'ibutton',
      header: 'iButton',
      cell: ({ row }) => (
        <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
          {row.original.ibutton || '-'}
        </span>
      ),
    },
    {
      accessorKey: 'conductor_wialon',
      header: 'Conductor',
      cell: ({ row }) => extractConductorName(row.original.conductor_wialon) || '-',
    },
    {
      accessorKey: 'velocidad_maxima',
      header: 'Velocidad',
      cell: ({ row }) => (
        <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>
          {formatSpeed(row.original.velocidad_maxima)}
        </span>
      ),
    },
    {
      accessorKey: 'limite_velocidad',
      header: 'Limite',
      cell: ({ row }) => formatSpeed(row.original.limite_velocidad),
    },
    {
      accessorKey: 'exceso',
      header: 'Exceso',
      cell: ({ row }) => {
        const severityColor = getSeverityColor(row.original.exceso)
        return (
          <span
            className="dt-badge"
            style={{
              backgroundColor: severityColor,
              color: 'white',
              fontWeight: 600,
            }}
          >
            +{Math.round(row.original.exceso)} km/h
          </span>
        )
      },
    },
    {
      accessorKey: 'duracion_segundos',
      header: 'Duracion',
      cell: ({ row }) => formatDuration(row.original.duracion_segundos),
    },
    {
      accessorKey: 'localizacion',
      header: 'Ubicacion',
      cell: ({ row }) => {
        const tieneCoords = row.original.latitud != null && row.original.longitud != null
        const tieneTexto = !!row.original.localizacion
        const clickable = tieneCoords || tieneTexto
        return (
          <button
            type="button"
            onClick={() => clickable && setMapaExceso(row.original)}
            disabled={!clickable}
            title={clickable ? `Ver en mapa: ${row.original.localizacion || 'sin direccion'}` : 'Sin coordenadas'}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '4px 8px', borderRadius: '6px',
              background: 'transparent',
              border: clickable ? '1px solid var(--border-primary, #e5e7eb)' : '1px solid transparent',
              color: clickable ? 'var(--color-primary, #ef4444)' : 'var(--text-tertiary)',
              cursor: clickable ? 'pointer' : 'default',
              fontSize: '12px',
              maxWidth: '100%',
              textAlign: 'left',
              opacity: clickable ? 1 : 0.6,
            }}
          >
            <MapPin size={14} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tieneTexto ? truncateLocation(row.original.localizacion, 30) : (tieneCoords ? 'Ver en mapa' : '-')}
            </span>
          </button>
        )
      },
      enableSorting: false,
    },
  ], [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Toolbar con búsqueda y controles */}
      <div className="dt-header-bar">
        <div className="dt-search-wrapper">
          <Search size={18} className="dt-search-icon" />
          <input
            type="text"
            placeholder="Buscar por patente, conductor o ubicación..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="dt-search-input"
          />
          {searchTerm && (
            <span style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '11px',
              color: 'var(--text-tertiary)'
            }}>
              {totalCount.toLocaleString()} registros cargados
            </span>
          )}
        </div>

        {/* Filtro de rango de velocidad (servidor) */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowVelFilter(!showVelFilter)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', fontSize: '13px', fontWeight: 500,
              background: velFilterActive ? 'var(--color-primary, #ef4444)' : 'var(--bg-secondary, #f3f4f6)',
              color: velFilterActive ? 'white' : 'var(--text-secondary)',
              border: velFilterActive ? 'none' : '1px solid var(--border-primary, #e5e7eb)',
              borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <Gauge size={15} />
            {velFilterActive ? `${velMin || '0'} - ${velMax || '∞'} km/h` : 'Rango velocidad'}
          </button>
          {showVelFilter && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 50, marginTop: '6px',
              background: 'var(--bg-primary, white)', border: '1px solid var(--border-primary, #e5e7eb)',
              borderRadius: '10px', padding: '14px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: '220px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '10px', color: 'var(--text-primary)' }}>Filtrar por velocidad (km/h)</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                <input
                  type="number"
                  placeholder="Min"
                  value={velMin}
                  onChange={(e) => setVelMin(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', fontSize: '13px', border: '1px solid var(--border-primary, #e5e7eb)', borderRadius: '6px', background: 'var(--bg-secondary, #f9fafb)', outline: 'none' }}
                />
                <span style={{ color: 'var(--text-tertiary)', fontSize: '14px', fontWeight: 600 }}>—</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={velMax}
                  onChange={(e) => setVelMax(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', fontSize: '13px', border: '1px solid var(--border-primary, #e5e7eb)', borderRadius: '6px', background: 'var(--bg-secondary, #f9fafb)', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={applyVelocidadFilter}
                  style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: 600, background: 'var(--color-primary, #ef4444)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Aplicar
                </button>
                <button
                  onClick={clearVelocidadFilter}
                  style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: 600, background: 'var(--bg-secondary, #f3f4f6)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary, #e5e7eb)', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Limpiar
                </button>
              </div>
            </div>
          )}
        </div>

        {headerControls}
      </div>

      {/* Quick filters por proveedor GPS */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '0 0 4px 0', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '4px' }}>
          GPS:
        </span>
        {[
          { key: null as null | 'USS' | 'GEOTAB', label: 'Todos', color: 'var(--color-primary)', count: excesos.length },
          { key: 'USS' as const, label: 'USS', color: '#10b981', count: gpsCounts.uss },
          { key: 'GEOTAB' as const, label: 'Geotab', color: '#3b82f6', count: gpsCounts.geotab },
        ].map(opt => {
          const active = gpsFilter === opt.key
          if (opt.key !== null && opt.count === 0) return null
          return (
            <button
              key={opt.label}
              onClick={() => setGpsFilter(opt.key)}
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 600,
                border: `1px solid ${active ? opt.color : 'var(--border-primary)'}`,
                background: active ? opt.color : 'transparent',
                color: active ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {!active && opt.key !== null && (
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: opt.color, display: 'inline-block' }} />
              )}
              {opt.label}
              <span style={{ opacity: 0.85, fontWeight: 500 }}>({opt.count})</span>
            </button>
          )
        })}
      </div>

      {/* DataTable — maneja paginación, filtros y sorting sobre toda la data */}
      <DataTable
        data={excesosFiltradosPorGps}
        columns={columns}
        loading={isLoading}
        showSearch={false}
        pageSize={50}
        onTableReady={handleTableReady}
        emptyIcon={<Gauge size={48}
      />}
        emptyTitle="Sin excesos"
        emptyDescription="No se encontraron excesos de velocidad para el período seleccionado"
      />

      {/* Panel lateral flotante con mapa */}
      {mapaExceso && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setMapaExceso(null)}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 999,
            }}
          />
          {/* Panel a la izquierda */}
          <div style={{
            position: 'fixed',
            top: 0, left: 0, bottom: 0,
            width: '440px',
            maxWidth: '90vw',
            background: 'var(--bg-primary, #fff)',
            zIndex: 1000,
            boxShadow: '4px 0 20px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-primary, #e5e7eb)',
              background: 'var(--bg-secondary, #f9fafb)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Ubicación del exceso
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {normalizePatente(mapaExceso.patente)} · {extractConductorName(mapaExceso.conductor_wialon) || 'Sin conductor'}
                </span>
              </div>
              <button
                onClick={() => setMapaExceso(null)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '32px', height: '32px',
                  border: '1px solid var(--border-primary, #e5e7eb)',
                  borderRadius: '8px',
                  background: 'var(--bg-primary, #fff)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
                title="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            {/* Mapa */}
            <div style={{ flex: 1, position: 'relative', background: 'var(--bg-secondary, #f3f4f6)' }}>
              {mapaExceso.latitud != null && mapaExceso.longitud != null ? (
                <iframe
                  title="Mapa exceso"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapaExceso.longitud - 0.005},${mapaExceso.latitud - 0.004},${mapaExceso.longitud + 0.005},${mapaExceso.latitud + 0.004}&layer=mapnik&marker=${mapaExceso.latitud},${mapaExceso.longitud}`}
                  style={{ width: '100%', height: '100%', border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: '100%', flexDirection: 'column', gap: '8px',
                  color: 'var(--text-tertiary)', padding: '20px', textAlign: 'center',
                }}>
                  <MapPin size={32} />
                  <span style={{ fontSize: '13px' }}>Sin coordenadas para este registro</span>
                </div>
              )}
            </div>

            {/* Footer con detalles */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--border-primary, #e5e7eb)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px 16px',
              fontSize: '12px',
            }}>
              <div>
                <div style={{ color: 'var(--text-tertiary)', marginBottom: '2px' }}>Fecha</div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatDate(mapaExceso.fecha_evento)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-tertiary)', marginBottom: '2px' }}>Hora</div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace' }}>{formatTimeART(mapaExceso.fecha_evento)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-tertiary)', marginBottom: '2px' }}>Velocidad</div>
                <div style={{ color: 'var(--color-danger)', fontWeight: 700 }}>{formatSpeed(mapaExceso.velocidad_maxima)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-tertiary)', marginBottom: '2px' }}>Duración</div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatDuration(mapaExceso.duracion_segundos)}</div>
              </div>
              {mapaExceso.localizacion && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ color: 'var(--text-tertiary)', marginBottom: '2px' }}>Dirección</div>
                  <div style={{ color: 'var(--text-primary)' }}>{mapaExceso.localizacion}</div>
                </div>
              )}
              {mapaExceso.latitud != null && mapaExceso.longitud != null && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <a
                    href={`https://maps.google.com/maps?q=${mapaExceso.latitud},${mapaExceso.longitud}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      color: 'var(--color-primary, #ef4444)', fontWeight: 600,
                      textDecoration: 'none', fontSize: '12px',
                    }}
                  >
                    <MapPin size={14} /> Abrir en Google Maps
                  </a>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
