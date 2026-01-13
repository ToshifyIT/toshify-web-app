/**
 * Tab para Incidencias Logísticas
 * No generan cobro, solo registro/auditoría
 */

import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { DataTable } from '../../../components/ui/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { IncidenciaCompleta, IncidenciaEstado } from '../../../types/incidencias.types'

interface IncidenciaLogisticaTabProps {
  incidencias: IncidenciaCompleta[]
  estados: IncidenciaEstado[]
  loading: boolean
  onRefresh: () => void
}

export function IncidenciaLogisticaTab({
  incidencias,
  estados,
  loading,
  onRefresh
}: IncidenciaLogisticaTabProps) {
  void onRefresh

  // Filtrar solo incidencias logísticas
  const filteredIncidencias = useMemo(() => {
    return incidencias.filter(inc => !inc.tipo || inc.tipo === 'logistica')
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
      id: 'vehiculo',
      header: 'VEHÍCULO',
      accessorKey: 'patente_display'
    },
    {
      id: 'area',
      header: 'ÁREA',
      accessorKey: 'area'
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
      id: 'registrado_por',
      header: 'REGISTRADO POR',
      accessorKey: 'registrado_por'
    }
  ], [estados])

  return (
    <div className="incidencia-tab">
      <div className="tab-header">
        <h3>Incidencias Logísticas</h3>
        <p>Registro de incidencias sin impacto financiero</p>
      </div>

      <DataTable
        data={filteredIncidencias}
        columns={columns}
        loading={loading}
        showSearch
        showPagination
        emptyTitle="No hay incidencias logísticas"
        emptyDescription="Las incidencias logísticas registradas aparecerán aquí"
        headerAction={
          <button className="btn-primary" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Plus size={16} />
            Nueva Incidencia
          </button>
        }
      />
    </div>
  )
}
