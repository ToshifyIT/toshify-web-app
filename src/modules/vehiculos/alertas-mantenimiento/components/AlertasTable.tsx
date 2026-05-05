import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertOctagon, AlertTriangle, Info, CheckCircle, ChevronRight } from 'lucide-react'
import { DataTable } from '../../../../components/ui/DataTable'
import type { AlertaMantenimiento, AlertaSeveridad } from '../types/alertas.types'

interface Props {
  alertas: AlertaMantenimiento[]
  loading: boolean
  onRowClick: (a: AlertaMantenimiento) => void
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

function severidadBadge(sev: AlertaSeveridad) {
  const map: Record<AlertaSeveridad, { label: string; cls: string; Icon: typeof AlertOctagon }> = {
    Critical: { label: 'Crítica', cls: 'dt-badge-red', Icon: AlertOctagon },
    High: { label: 'Alta', cls: 'dt-badge-orange', Icon: AlertOctagon },
    Medium: { label: 'Media', cls: 'dt-badge-orange', Icon: AlertTriangle },
    Low: { label: 'Baja', cls: 'dt-badge-gray', Icon: Info },
  }
  const cfg = map[sev]
  return (
    <span className={`dt-badge ${cfg.cls}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <cfg.Icon size={11} /> {cfg.label}
    </span>
  )
}

function estadoBadge(estado: string) {
  if (estado === 'activa') return <span className="dt-badge dt-badge-red">Activa</span>
  if (estado === 'atendida') return (
    <span className="dt-badge dt-badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <CheckCircle size={11} /> Atendida
    </span>
  )
  return <span className="dt-badge dt-badge-gray">Descartada</span>
}

export function AlertasTable({ alertas, loading, onRowClick }: Props) {
  const columns = useMemo<ColumnDef<AlertaMantenimiento>[]>(() => [
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
      accessorKey: 'diagnostic_name',
      header: 'Alerta',
      cell: ({ row }) => {
        const name = row.original.diagnostic_name || row.original.fault_description || '(sin descripción)'
        const count = row.original.count
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }} title={name}>{name}</span>
            {count > 1 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{count} ocurrencias</span>}
          </div>
        )
      },
    },
    {
      accessorKey: 'severidad',
      header: 'Severidad',
      size: 110,
      cell: ({ getValue }) => severidadBadge(getValue() as AlertaSeveridad),
    },
    {
      accessorKey: 'fecha_evento',
      header: 'Fecha',
      size: 130,
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatFecha(getValue() as string)}</span>
      ),
    },
    {
      accessorKey: 'estado',
      header: 'Estado',
      size: 110,
      cell: ({ getValue }) => estadoBadge(getValue() as string),
    },
    {
      id: 'acciones',
      header: '',
      size: 60,
      cell: ({ row }) => (
        <button
          onClick={(e) => { e.stopPropagation(); onRowClick(row.original) }}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-secondary)',
            borderRadius: 6,
            padding: '4px 8px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: 'var(--text-secondary)',
          }}
          title="Ver detalle"
        >
          Ver <ChevronRight size={12} />
        </button>
      ),
      enableSorting: false,
    },
  ], [onRowClick])

  return (
    <DataTable
      columns={columns}
      data={alertas}
      loading={loading}
      searchPlaceholder="Buscar patente, conductor o falla..."
      emptyTitle="Sin alertas"
      emptyDescription="No hay alertas registradas. La sincronización corre cada 1 minuto."
      pageSize={50}
    />
  )
}
