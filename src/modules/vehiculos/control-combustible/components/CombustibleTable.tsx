import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { DataTable } from '../../../../components/ui/DataTable'
import type { FuelSummary } from '../types/combustible.types'

interface Props {
  summary: FuelSummary[]
  loading: boolean
  onRowClick: (v: FuelSummary) => void
}

/**
 * Tabla principal del módulo Control de Combustible.
 * 1 fila por vehículo con sus métricas agregadas de los últimos 30 días.
 */
export function CombustibleTable({ summary, loading, onRowClick }: Props) {
  const columns = useMemo<ColumnDef<FuelSummary>[]>(() => [
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
      accessorKey: 'distancia_km',
      header: 'Distancia',
      size: 100,
      cell: ({ getValue }) => {
        const v = Number(getValue()) || 0
        if (v <= 0) return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>
        return (
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 600 }}>
            {v.toLocaleString('es-AR')} km
          </span>
        )
      },
    },
    {
      accessorKey: 'combustible_litros',
      header: 'Combustible',
      size: 110,
      cell: ({ row }) => {
        const v = Number(row.original.combustible_litros) || 0
        if (!row.original.tiene_telemetria) {
          return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Sin OBD</span>
        }
        return (
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 600 }}>
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
      header: 'Ralentí',
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
      accessorKey: 'rendimiento_km_litro',
      header: 'Rendimiento',
      size: 110,
      cell: ({ row }) => {
        const v = Number(row.original.rendimiento_km_litro) || 0
        if (!row.original.tiene_telemetria || v <= 0 || v > 100) {
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
      accessorKey: 'llenados_count',
      header: 'Llenados',
      size: 80,
      cell: ({ getValue }) => {
        const v = Number(getValue()) || 0
        if (v <= 0) return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>
        return <span className="dt-badge dt-badge-blue">{v}</span>
      },
    },
    {
      id: 'estado',
      accessorFn: (row) => {
        if (!row.tiene_telemetria) return 'sin_obd'
        const pct = Number(row.ralenti_pct) || 0
        const rendimiento = Number(row.rendimiento_km_litro) || 0
        if (pct > 25) return 'idle_alto'
        if (rendimiento > 0 && rendimiento < 7) return 'consumo_alto'
        return 'normal'
      },
      header: 'Estado',
      size: 120,
      cell: ({ row }) => {
        if (!row.original.tiene_telemetria) return <span className="dt-badge dt-badge-gray">Sin OBD</span>
        const pct = Number(row.original.ralenti_pct) || 0
        const rendimiento = Number(row.original.rendimiento_km_litro) || 0
        if (pct > 25) return <span className="dt-badge dt-badge-orange">Ralentí alto</span>
        if (rendimiento > 0 && rendimiento < 7) return <span className="dt-badge dt-badge-red">Consumo alto</span>
        if (rendimiento > 0 && rendimiento <= 100) return <span className="dt-badge dt-badge-green">Normal</span>
        return <span className="dt-badge dt-badge-gray">Sin uso</span>
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
      data={summary}
      loading={loading}
      searchPlaceholder="Buscar patente o modelo..."
      emptyTitle="Sin datos de combustible"
      emptyDescription="No hay datos sincronizados de Geotab. El sync corre cada hora."
      pageSize={50}
    />
  )
}
