/**
 * Tab para Incidencias de Cobro
 * Son incidencias que generan cobros/descuentos (vienen de Siniestros)
 */

import { useMemo } from 'react'
import { DollarSign } from 'lucide-react'
import { DataTable } from '../../../components/ui/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { IncidenciaCompleta, IncidenciaEstado } from '../../../types/incidencias.types'

interface IncidenciaCobroTabProps {
  incidencias: IncidenciaCompleta[]
  estados: IncidenciaEstado[]
  loading: boolean
  onRefresh: () => void
  onGenerarCobro: (incidenciaId: string) => void
}

export function IncidenciaCobroTab({
  incidencias,
  estados,
  loading,
  onRefresh,
  onGenerarCobro
}: IncidenciaCobroTabProps) {
  void onRefresh

  // Filtrar solo incidencias de cobro
  const filteredIncidencias = useMemo(() => {
    return incidencias.filter(inc => inc.tipo === 'cobro')
  }, [incidencias])

  const columns = useMemo<ColumnDef<IncidenciaCompleta>[]>(() => [
    {
      id: 'fecha',
      header: 'FECHA',
      accessorKey: 'fecha',
      cell: (info) => new Date(info.getValue() as string).toLocaleDateString('es-AR')
    },
    {
      id: 'conductor',
      header: 'CONDUCTOR',
      accessorKey: 'conductor_display'
    },
    {
      id: 'monto',
      header: 'MONTO',
      accessorKey: 'monto_penalidades',
      cell: (info) => {
        const monto = info.getValue() as number
        return `$${monto.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      }
    },
    {
      id: 'descripcion',
      header: 'DESCRIPCIÓN',
      accessorKey: 'descripcion'
    },
     {
       id: 'estado',
       header: 'ESTADO',
       accessorKey: 'estado_nombre',
       cell: (info) => {
         const value = info.getValue() as string
         return (
           <span style={{
             padding: '4px 8px',
             borderRadius: '4px',
             backgroundColor: estados.find(e => e.nombre === value)?.color || '#ccc',
             color: 'white',
             fontSize: '12px',
             fontWeight: 'bold'
           }}>
             {value}
           </span>
         )
       }
     },
    {
      id: 'acciones',
      header: 'ACCIONES',
      enableSorting: false,
      cell: (info) => {
        const incidencia = info.row.original
        return (
          <button
            onClick={() => onGenerarCobro(incidencia.id)}
            className="btn-small"
            style={{
              display: 'flex',
              gap: '4px',
              alignItems: 'center',
              padding: '6px 12px'
            }}
            title="Generar cobro"
          >
            <DollarSign size={14} />
            Generar Cobro
          </button>
        )
      }
    }
  ], [estados, onGenerarCobro])

  return (
    <div className="incidencia-tab">
      <div className="tab-header">
        <h3>Incidencias de Cobro</h3>
        <p>Incidencias que generan cargos/descuentos al conductor</p>
      </div>

      <DataTable
        data={filteredIncidencias}
        columns={columns}
        loading={loading}
        showSearch
        showPagination
        emptyTitle="No hay incidencias de cobro pendientes"
        emptyDescription="Las incidencias que generan cobros aparecerán aquí"
      />
    </div>
  )
}
