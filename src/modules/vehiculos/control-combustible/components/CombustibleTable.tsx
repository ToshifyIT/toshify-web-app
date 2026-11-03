import type { ReactNode } from 'react'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { DataTable } from '../../../../components/ui/DataTable'
import type { FuelRow } from '../types/combustible.types'
import { formatNumero, formatFecha, formatFechaHora } from '../../../../utils/format'
import { PatenteBadge } from '../../../../components/ui/PatenteBadge'
import { ActionsMenu } from '../../../../components/ui/ActionsMenu'

interface Props {
  rows: FuelRow[]
  loading: boolean
  onRowClick: (v: FuelRow) => void
  /** Filas visibles tras búsqueda y filtros de columna (para los indicadores). */
  onFilteredRowsChange?: (rows: FuelRow[]) => void
  /** Controles a la derecha del buscador (selector de semana). */
  headerAction?: ReactNode
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
export function CombustibleTable({ rows, loading, onRowClick, onFilteredRowsChange, headerAction }: Props) {
  const columns = useMemo<ColumnDef<FuelRow>[]>(() => [
    {
      accessorKey: 'patente',
      header: 'Vehículo',
      size: 150,
      cell: ({ row }) => {
        const v = row.original.vehiculo
        const modelo = v ? `${v.marca || ''} ${v.modelo || ''}`.trim() : ''
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, maxWidth: 150 }}>
            <span><PatenteBadge patente={row.original.patente} size="sm" /></span>
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
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>
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
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}
            title="Combustible usado en los tramos entre cargas de la semana (aproximado)"
          >
            {formatNumero(v, 2)} L
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
        // Si Geotab no reporta el nivel hace más de 2 días, el dato es viejo: se muestra en gris con su fecha
        const fecha = row.original.nivel_actual_fecha
        const viejo = !!fecha && Date.now() - new Date(fecha).getTime() > 2 * 86400000
        const color = viejo ? '#9ca3af' : pct < 20 ? '#dc2626' : pct < 40 ? '#ea580c' : '#16a34a'
        return (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}
            title={fecha ? `Último nivel informado por Geotab: ${formatFechaHora(fecha)}` : undefined}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color }}>
              {formatNumero(pct, 1)}%
            </span>
            {viejo && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>dato del {formatFecha(fecha)}</span>}
            <div style={{ width: '100%', height: 5, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-xs)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: 'var(--radius-xs)' }} />
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
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color }}>
              {formatNumero(litros, 2)} L
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{formatNumero(pct)}%</span>
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
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color }}>
            {formatNumero(v, 2)} km/L
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
            {litros > 0 && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{formatNumero(litros)} L cargados</span>}
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
        // Cada estado explica de dónde sale (tooltip): se calcula con los datos de Geotab de la semana elegida.
        const chip = (cls: string, txt: string, porque: string) => (
          <span className={`dt-badge ${cls}`} title={porque} style={{ cursor: 'help' }}>{txt}</span>
        )
        if (!row.original.tiene_telemetria) {
          return chip('dt-badge-gray', 'Sin OBD', 'El GPS de este auto no lee la computadora del motor: no informa consumo ni nivel de tanque.')
        }
        const pct = Number(row.original.ralenti_pct) || 0
        const rendimiento = row.original.rendimiento_semana
        if (pct > 25) {
          return chip('dt-badge-orange', 'Ralentí alto', `El ${formatNumero(pct)}% del combustible de los últimos 30 días se gastó con el motor en marcha y el auto parado (más del 25%).`)
        }
        if (rendimiento !== null && rendimiento < 7) {
          return chip('dt-badge-red', 'Consumo alto', `Rindió ${formatNumero(rendimiento, 2)} km/L en la semana: menos de 7 km/L (km recorridos ÷ litros consumidos).`)
        }
        if (rendimiento !== null) {
          return chip('dt-badge-green', 'Normal', `Rindió ${formatNumero(rendimiento, 2)} km/L en la semana (7 km/L o más) y el ralentí está por debajo del 25%.`)
        }
        return chip('dt-badge-gray', 'Sin datos', 'En la semana elegida Geotab no informó consumo suficiente para calcular el rendimiento.')
      },
    },
    {
      id: 'acciones',
      header: 'Acciones',
      size: 70,
      cell: ({ row }) => (
        <ActionsMenu
          actions={[
            { icon: <Eye size={15} />, label: 'Ver detalle', onClick: () => onRowClick(row.original) },
          ]}
        />
      ),
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
      headerAction={headerAction}
      emptyTitle="Sin datos de combustible"
      emptyDescription="No hay datos sincronizados de Geotab. El sync corre cada hora."
      pageSize={100}
    />
  )
}
