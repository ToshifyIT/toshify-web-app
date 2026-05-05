import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { TrendingDown, MapPin } from 'lucide-react'
import { DataTable } from '../../../../components/ui/DataTable'
import type { CargaCombustible } from '../types/combustible.types'

interface Props {
  cargas: CargaCombustible[]
  loading: boolean
}

function formatFecha(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yy} ${hh}:${mi}`
}

function formatMoney(n: number | null | undefined, moneda: string | null): string {
  if (n == null) return '-'
  const symbol = moneda === 'USD' ? 'US$' : '$'
  return `${symbol}${Number(n).toLocaleString('es-AR')}`
}

export function CombustibleTable({ cargas, loading }: Props) {
  const columns = useMemo<ColumnDef<CargaCombustible>[]>(() => [
    {
      accessorKey: 'fecha_evento',
      header: 'Fecha',
      size: 130,
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatFecha(getValue() as string)}</span>
      ),
    },
    {
      accessorKey: 'patente',
      header: 'Patente',
      size: 110,
      cell: ({ row }) => {
        const p = row.original.patente || '-'
        const v = row.original.vehiculo
        const modelo = v ? `${v.marca || ''} ${v.modelo || ''}`.trim() : ''
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, fontWeight: 600 }}>{p}</span>
            {modelo && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{modelo}</span>}
          </div>
        )
      },
    },
    {
      accessorKey: 'conductor_name',
      header: 'Conductor',
      size: 180,
      cell: ({ getValue }) => {
        const v = (getValue() as string) || '-'
        return <span style={{ fontSize: 13 }}>{v}</span>
      },
    },
    {
      accessorKey: 'producto',
      header: 'Producto',
      size: 100,
      cell: ({ getValue }) => {
        const v = (getValue() as string) || '-'
        return <span className="dt-badge dt-badge-blue">{v}</span>
      },
    },
    {
      accessorKey: 'volumen_litros',
      header: 'Litros',
      size: 80,
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v != null ? Number(v).toFixed(1) : '-'}</span>
      },
    },
    {
      accessorKey: 'costo',
      header: 'Gasto',
      size: 110,
      cell: ({ row }) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
          {formatMoney(row.original.costo, row.original.moneda)}
        </span>
      ),
    },
    {
      accessorKey: 'km_por_litro',
      header: 'Km/L',
      size: 80,
      cell: ({ row }) => {
        const v = row.original.km_por_litro
        if (v == null) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>
        if (row.original.alerta_consumo_anormal) {
          return (
            <span className="dt-badge dt-badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <TrendingDown size={11} /> {Number(v).toFixed(1)}
            </span>
          )
        }
        return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toFixed(1)}</span>
      },
    },
    {
      accessorKey: 'estacion_nombre',
      header: 'Estación',
      cell: ({ getValue }) => {
        const v = (getValue() as string) || '-'
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }} title={v}>
            <MapPin size={11} /> {v}
          </span>
        )
      },
    },
  ], [])

  return (
    <DataTable
      columns={columns}
      data={cargas}
      loading={loading}
      searchPlaceholder="Buscar patente, conductor o estación..."
      emptyTitle="Sin cargas registradas"
      emptyDescription="No hay cargas de combustible. Para que aparezcan registros aquí, Toshify debe integrar una tarjeta combustible (YPF Ruta, Edenred, etc.) con MyGeotab."
      pageSize={50}
    />
  )
}
