import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertOctagon, AlertTriangle, Info, CheckCircle, Eye, Wrench, X as XIcon, RotateCcw } from 'lucide-react'
import { DataTable } from '../../../../components/ui/DataTable'
import type { AlertaMantenimiento, AlertaSeveridad } from '../types/alertas.types'

interface Props {
  alertas: AlertaMantenimiento[]
  loading: boolean
  onRowClick: (a: AlertaMantenimiento) => void
  onAtender: (a: AlertaMantenimiento) => void
  onDescartar: (a: AlertaMantenimiento) => void
  onReactivar: (a: AlertaMantenimiento) => void
}

// Intervalo de service estándar — el próximo "service mayor" cae cada SERVICE_INTERVAL km.
const SERVICE_INTERVAL = 10000

function formatFecha(iso: string): { fecha: string; hora: string } {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return { fecha: `${dd}/${mm}/${yy}`, hora: `${hh}:${mi}` }
}

/**
 * Calcula los km que faltan para el próximo service estándar (cada 10.000 km).
 * Si el odómetro es null, devuelve null. Negativo = vencido.
 */
function kmHastaProximoService(odometro: number | null | undefined): number | null {
  if (odometro == null) return null
  const proxService = Math.ceil(odometro / SERVICE_INTERVAL) * SERVICE_INTERVAL
  return proxService - odometro
}

/**
 * Color de la barra de progreso según el % consumido del intervalo.
 */
function colorBarra(pct: number): { bg: string; fg: string } {
  if (pct >= 100) return { bg: 'rgba(220, 38, 38, 0.15)', fg: '#dc2626' }  // rojo vencido
  if (pct >= 80) return { bg: 'rgba(234, 88, 12, 0.15)', fg: '#ea580c' }   // ámbar próximo
  return { bg: 'rgba(22, 163, 74, 0.15)', fg: '#16a34a' }                  // verde al día
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
  if (estado === 'activa') return <span className="dt-badge dt-badge-green">Activa</span>
  if (estado === 'atendida') return (
    <span className="dt-badge dt-badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <CheckCircle size={11} /> Atendida
    </span>
  )
  return <span className="dt-badge dt-badge-gray">Descartada</span>
}

export function AlertasTable({ alertas, loading, onRowClick, onAtender, onDescartar, onReactivar }: Props) {
  const columns = useMemo<ColumnDef<AlertaMantenimiento>[]>(() => [
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
      id: 'odometro',
      accessorFn: (row) => row.vehiculo?.kilometraje_actual ?? null,
      header: 'Odómetro',
      size: 95,
      cell: ({ getValue }) => {
        const km = getValue() as number | null
        if (km == null) return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>
        return (
          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, fontWeight: 600 }}>
            {km.toLocaleString('es-AR')} km
          </span>
        )
      },
    },
    {
      id: 'proximo_service',
      accessorFn: (row) => kmHastaProximoService(row.vehiculo?.kilometraje_actual),
      header: 'Próximo Servicio',
      size: 180,
      cell: ({ row }) => {
        const km = row.original.vehiculo?.kilometraje_actual
        if (km == null) return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Sin datos</span>
        const faltan = kmHastaProximoService(km)!
        const consumido = SERVICE_INTERVAL - faltan
        const pct = (consumido / SERVICE_INTERVAL) * 100
        const colors = colorBarra(pct)
        const vencido = faltan <= 0
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, paddingRight: 8 }}>
            <div style={{ width: '100%', height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: colors.fg, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 10, color: vencido ? '#dc2626' : 'var(--text-tertiary)', fontWeight: vencido ? 600 : 400 }}>
              {vencido ? `VENCIDO ${Math.abs(faltan).toLocaleString('es-AR')} km` : `en ${faltan.toLocaleString('es-AR')} km`}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'diagnostic_name',
      header: 'Alerta',
      size: 220,
      cell: ({ row }) => {
        const name = row.original.diagnostic_name || row.original.fault_description || '(sin descripción)'
        const count = row.original.count
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, maxWidth: 220 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'block',
              }}
              title={name}
            >
              {name}
            </span>
            {count > 1 && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{count} ocurrencias</span>}
          </div>
        )
      },
    },
    {
      accessorKey: 'severidad',
      header: 'Sev.',
      size: 80,
      cell: ({ getValue }) => severidadBadge(getValue() as AlertaSeveridad),
    },
    {
      accessorKey: 'fecha_evento',
      header: 'Fecha',
      size: 95,
      cell: ({ getValue }) => {
        const { fecha, hora } = formatFecha(getValue() as string)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.2 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fecha}</span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{hora}</span>
          </div>
        )
      },
    },
    {
      id: 'estado_servicio',
      accessorFn: (row) => {
        const km = row.vehiculo?.kilometraje_actual
        const faltan = kmHastaProximoService(km)
        if (faltan == null) return 'sin_datos'
        if (faltan <= 0) return 'vencido'
        if (faltan <= SERVICE_INTERVAL * 0.2) return 'proximo'
        return 'al_dia'
      },
      header: 'Estado',
      size: 105,
      cell: ({ row }) => {
        const km = row.original.vehiculo?.kilometraje_actual
        const faltan = kmHastaProximoService(km)
        if (faltan == null) return <span className="dt-badge dt-badge-gray">Sin datos</span>
        if (faltan <= 0) return <span className="dt-badge dt-badge-red">Vencido</span>
        if (faltan <= SERVICE_INTERVAL * 0.2) return <span className="dt-badge dt-badge-orange">Próximo</span>
        return <span className="dt-badge dt-badge-green">Al día</span>
      },
    },
    {
      accessorKey: 'estado',
      header: 'Gestión',
      size: 90,
      cell: ({ getValue }) => estadoBadge(getValue() as string),
    },
    {
      id: 'acciones',
      header: 'Acciones',
      size: 140,
      cell: ({ row }) => {
        const a = row.original
        const stop = (e: React.MouseEvent) => e.stopPropagation()
        const btnBase: React.CSSProperties = {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 2,
        }
        const labelStyle: React.CSSProperties = {
          fontSize: 9,
          color: 'var(--text-tertiary)',
          marginTop: 1,
        }
        return (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              onClick={(e) => { stop(e); onRowClick(a) }}
              title="Ver detalle"
              style={{ ...btnBase, color: 'var(--text-secondary)' }}
            >
              <Eye size={14} />
              <span style={labelStyle}>Ver</span>
            </button>
            {a.estado === 'activa' ? (
              <>
                <button
                  onClick={(e) => { stop(e); onAtender(a) }}
                  title="Marcar atendida"
                  style={{ ...btnBase, color: '#16a34a' }}
                >
                  <Wrench size={14} />
                  <span style={labelStyle}>Atender</span>
                </button>
                <button
                  onClick={(e) => { stop(e); onDescartar(a) }}
                  title="Descartar alerta"
                  style={{ ...btnBase, color: '#dc2626' }}
                >
                  <XIcon size={14} />
                  <span style={labelStyle}>Descartar</span>
                </button>
              </>
            ) : (
              <button
                onClick={(e) => { stop(e); onReactivar(a) }}
                title="Reactivar alerta"
                style={{ ...btnBase, color: '#2563eb' }}
              >
                <RotateCcw size={14} />
                <span style={labelStyle}>Reactivar</span>
              </button>
            )}
          </div>
        )
      },
      enableSorting: false,
    },
  ], [onRowClick])

  return (
    <DataTable
      columns={columns}
      data={alertas}
      loading={loading}
      searchPlaceholder="Buscar patente, modelo o falla..."
      emptyTitle="Sin alertas"
      emptyDescription="No hay alertas registradas. La sincronización corre cada 1 minuto."
      pageSize={50}
    />
  )
}
