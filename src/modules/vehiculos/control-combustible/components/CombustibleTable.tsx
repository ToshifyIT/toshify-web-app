import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { DataTable } from '../../../../components/ui/DataTable'
import type { FuelRow } from '../types/combustible.types'

interface Props {
  rows: FuelRow[]
  loading: boolean
  onRowClick: (v: FuelRow) => void
  /** Filas visibles tras búsqueda y filtros de columna (para los indicadores). */
  onFilteredRowsChange?: (rows: FuelRow[]) => void
}

const guion = <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>

/** Color del estado del vehículo (mismos grupos que Estado de Flota). */
function claseEstadoVehiculo(codigo: string | null): string {
  const c = (codigo || '').toUpperCase()
  if (c === 'EN_USO') return 'dt-badge-green'
  if (c.startsWith('PKG_ON')) return 'dt-badge-blue'
  if (c.includes('TALLER') || c.includes('RETENIDO') || c.includes('COMISARIA')) return 'dt-badge-red'
  if (c.startsWith('PKG_OFF')) return 'dt-badge-orange'
  return 'dt-badge-gray'
}

/**
 * Tabla principal del módulo Control de Combustible.
 * 1 fila por vehículo: métricas de la semana elegida (distancia, consumo, rendimiento,
 * llenados), ralentí de los últimos 30 días, nivel actual del tanque, estado y conductores.
 */
export function CombustibleTable({ rows, loading, onRowClick, onFilteredRowsChange }: Props) {
  const columns = useMemo<ColumnDef<FuelRow>[]>(() => [
    {
      accessorKey: 'patente',
      header: 'Vehículo',
      size: 150,
      cell: ({ row }) => {
        const p = row.original.patente || '-'
        const v = row.original.vehiculo
        const modelo = v ? `${v.marca || ''} ${v.modelo || ''}`.trim() : ''
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, maxWidth: 150 }}>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, fontWeight: 600 }}>{p}</span>
            {modelo && (
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--text-tertiary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'block',
                }}
                title={modelo}
              >
                {modelo}
              </span>
            )}
          </div>
        )
      },
    },
    {
      id: 'estado_vehiculo',
      accessorFn: (row) => row.estado_vehiculo || 'Sin dato',
      header: 'Estado / A cargo',
      size: 190,
      cell: ({ row }) => {
        const { estado_vehiculo, estado_vehiculo_codigo, a_cargo } = row.original
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, maxWidth: 190 }}>
            {estado_vehiculo
              ? <span className={`dt-badge ${claseEstadoVehiculo(estado_vehiculo_codigo)}`} style={{ alignSelf: 'flex-start' }}>{estado_vehiculo}</span>
              : guion}
            {a_cargo.map(nombre => (
              <span
                key={nombre}
                title={nombre}
                style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {nombre}
              </span>
            ))}
          </div>
        )
      },
    },
    {
      accessorKey: 'km_semana',
      header: 'Distancia',
      size: 100,
      cell: ({ getValue }) => {
        const v = Number(getValue()) || 0
        if (v <= 0) return guion
        return (
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 600 }}>
            {v.toLocaleString('es-AR')} km
          </span>
        )
      },
    },
    {
      accessorKey: 'consumo_semana',
      header: 'Consumo',
      size: 110,
      cell: ({ row }) => {
        const v = row.original.consumo_semana
        if (!row.original.tiene_telemetria) {
          return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Sin OBD</span>
        }
        if (v === null) return guion
        return (
          <span
            style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 600 }}
            title="Combustible usado en los tramos entre cargas de la semana (aproximado)"
          >
            {v.toFixed(2)} L
          </span>
        )
      },
    },
    {
      accessorKey: 'nivel_actual_pct',
      header: 'Nivel tanque',
      size: 130,
      cell: ({ row }) => {
        const pct = row.original.nivel_actual_pct
        if (pct == null) return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>
        const color = pct < 20 ? '#dc2626' : pct < 40 ? '#ea580c' : '#16a34a'
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700, color }}>
              {pct.toFixed(1)}%
            </span>
            <div style={{ width: '100%', height: 5, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: 3 }} />
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'ralenti_litros',
      header: 'Ralentí (30 días)',
      size: 110,
      cell: ({ row }) => {
        const litros = Number(row.original.ralenti_litros) || 0
        const pct = Number(row.original.ralenti_pct) || 0
        if (!row.original.tiene_telemetria || litros <= 0) {
          return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>
        }
        const color = pct > 20 ? '#dc2626' : pct > 10 ? '#ea580c' : '#16a34a'
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.2 }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 600, color }}>
              {litros.toFixed(2)} L
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{pct.toFixed(0)}%</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'rendimiento_semana',
      header: 'Rendimiento',
      size: 110,
      cell: ({ row }) => {
        const v = row.original.rendimiento_semana
        if (!row.original.tiene_telemetria || v === null) {
          return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Insuficiente</span>
        }
        const color = v >= 10 ? '#16a34a' : v >= 7 ? '#ea580c' : '#dc2626'
        return (
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700, color }}>
            {v.toFixed(2)} km/L
          </span>
        )
      },
    },
    {
      accessorKey: 'llenados_semana',
      header: 'Llenados',
      size: 90,
      cell: ({ row }) => {
        const v = row.original.llenados_semana
        if (v <= 0) return guion
        const litros = row.original.litros_cargados_semana
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
            <span className="dt-badge dt-badge-blue">{v}</span>
            {litros > 0 && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{litros.toFixed(0)} L cargados</span>}
          </div>
        )
      },
    },
    {
      id: 'estado',
      accessorFn: (row) => {
        if (!row.tiene_telemetria) return 'Sin OBD'
        const pct = Number(row.ralenti_pct) || 0
        const rendimiento = row.rendimiento_semana
        if (pct > 25) return 'Ralentí alto'
        if (rendimiento !== null && rendimiento < 7) return 'Consumo alto'
        if (rendimiento !== null) return 'Normal'
        return 'Sin datos en la semana'
      },
      header: 'Estado',
      size: 120,
      cell: ({ row }) => {
        if (!row.original.tiene_telemetria) return <span className="dt-badge dt-badge-gray">Sin OBD</span>
        const pct = Number(row.original.ralenti_pct) || 0
        const rendimiento = row.original.rendimiento_semana
        if (pct > 25) return <span className="dt-badge dt-badge-orange">Ralentí alto</span>
        if (rendimiento !== null && rendimiento < 7) return <span className="dt-badge dt-badge-red">Consumo alto</span>
        if (rendimiento !== null) return <span className="dt-badge dt-badge-green">Normal</span>
        return <span className="dt-badge dt-badge-gray">Sin datos</span>
      },
    },
    {
      id: 'acciones',
      header: 'Acciones',
      size: 70,
      cell: ({ row }) => {
        const btnBase: React.CSSProperties = {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 2,
          color: 'var(--text-secondary)',
        }
        const labelStyle: React.CSSProperties = {
          fontSize: 9,
          color: 'var(--text-tertiary)',
          marginTop: 1,
        }
        return (
          <button
            onClick={(e) => { e.stopPropagation(); onRowClick(row.original) }}
            title="Ver detalle"
            style={btnBase}
          >
            <Eye size={14} />
            <span style={labelStyle}>Ver</span>
          </button>
        )
      },
      enableSorting: false,
    },
  ], [onRowClick])

  return (
    <DataTable
      columns={columns}
      data={rows}
      loading={loading}
      onFilteredDataChange={onFilteredRowsChange}
      stickyLeftColumns={4}
      searchPlaceholder="Buscar patente o modelo..."
      emptyTitle="Sin datos de combustible"
      emptyDescription="No hay datos sincronizados de Geotab. El sync corre cada hora."
      pageSize={50}
    />
  )
}
