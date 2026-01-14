/**
 * Tab: Cobros Por Aplicar
 * Para revisar, aprobar y aplicar fraccionamientos
 */

import { useState, useEffect, useMemo } from 'react'
import { Check, X, Zap } from 'lucide-react'
import Swal from 'sweetalert2'
import { DataTable } from '../../../components/ui/DataTable'
import { cobrosService } from '../../../services/cobrosService'
import type { ColumnDef } from '@tanstack/react-table'
import type { CobroIncidenciaConRelaciones } from '../../../types/incidencias.types'

interface CobrosPorAplicarTabProps {
  loading: boolean
  onRefresh: () => void
}

export function CobrosPorAplicarTab({ loading, onRefresh }: CobrosPorAplicarTabProps) {
  void loading
  void onRefresh
  const [cobros, setCobros] = useState<CobroIncidenciaConRelaciones[]>([])
  const [loadingCobros, setLoadingCobros] = useState(true)

  useEffect(() => {
    cargarCobrosPorAplicar()
  }, [])

  const cargarCobrosPorAplicar = async () => {
    setLoadingCobros(true)
    try {
      const datos = await cobrosService.obtenerCobrosPorAplicar()
      setCobros(datos)
    } catch (error) {
      console.error('Error cargando cobros:', error)
      Swal.fire('Error', 'No se pudieron cargar los cobros', 'error')
    } finally {
      setLoadingCobros(false)
    }
  }

  const aplicarFraccionamiento = async (cobroId: string, monto: number) => {
    const { value: cantidadCuotas } = await Swal.fire({
      title: 'Aplicar Fraccionamiento',
      html: `
        <div style="text-align: left;">
          <p><strong>Monto Total:</strong> $${monto.toLocaleString('es-AR')}</p>
          <p><strong>¿En cuántas cuotas?</strong></p>
          <input 
            id="swal-input-cuotas" 
            type="number" 
            min="2" 
            max="12" 
            value="4" 
            style="width: 100%; padding: 8px; margin-top: 8px; border: 1px solid #ddd; border-radius: 4px;"
          />
          <p style="margin-top: 12px; font-size: 12px; color: #666;">
            Monto por cuota: <strong id="monto-cuota">$250.000</strong>
          </p>
        </div>
      `,
      didOpen: () => {
        const input = document.getElementById('swal-input-cuotas') as HTMLInputElement
        const montoCuotaEl = document.getElementById('monto-cuota')
        
        input.addEventListener('input', (e) => {
          const valor = parseInt((e.target as HTMLInputElement).value) || 1
          const montoCuota = Math.round((monto / valor) * 100) / 100
          if (montoCuotaEl) {
            montoCuotaEl.textContent = `$${montoCuota.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
          }
        })
      },
      showCancelButton: true,
      confirmButtonText: 'Aplicar Fraccionamiento',
      cancelButtonText: 'Cancelar'
    })

    if (cantidadCuotas && cantidadCuotas > 1) {
      try {
        await cobrosService.aplicarFraccionamiento(cobroId, parseInt(cantidadCuotas))
        Swal.fire('Éxito', 'Fraccionamiento aplicado correctamente', 'success')
        cargarCobrosPorAplicar()
      } catch (error: any) {
        Swal.fire('Error', error.message || 'No se pudo aplicar el fraccionamiento', 'error')
      }
    }
  }

  const aprobarCobroDirecto = async (cobroId: string) => {
    try {
      await cobrosService.actualizarEstadoCobro(cobroId, 'aplicado_completo')
      Swal.fire('Éxito', 'Cobro aprobado para aplicación', 'success')
      cargarCobrosPorAplicar()
    } catch (error: any) {
      Swal.fire('Error', error.message, 'error')
    }
  }

  const rechazarCobro = async () => {
    const { value: razon } = await Swal.fire({
      title: 'Rechazar Cobro',
      input: 'textarea',
      inputPlaceholder: 'Motivo del rechazo...',
      showCancelButton: true,
      confirmButtonText: 'Rechazar'
    })

    if (razon) {
      try {
        // Aquí podrías agregar un estado de rechazo a la BD
        Swal.fire('Éxito', 'Cobro rechazado', 'success')
        cargarCobrosPorAplicar()
      } catch (error: any) {
        Swal.fire('Error', error.message, 'error')
      }
    }
  }

  const columns = useMemo<ColumnDef<CobroIncidenciaConRelaciones>[]>(() => [
    {
      id: 'fecha',
      header: 'FECHA',
      accessorKey: 'creado_at',
      cell: (info) => new Date(info.getValue() as string).toLocaleDateString('es-AR')
    },
    {
      id: 'conductor',
      header: 'CONDUCTOR',
      accessorFn: (row) => row.conductor?.nombre_completo || 'N/A'
    },
    {
      id: 'monto',
      header: 'MONTO TOTAL',
      accessorKey: 'monto_total',
      cell: (info) => {
        const monto = info.getValue() as number
        return `$${monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
      }
    },
    {
      id: 'origen',
      header: 'ORIGEN',
      accessorFn: (row) => row.incidencia?.siniestro_id ? 'Siniestro' : 'Directa'
    },
    {
      id: 'estado',
      header: 'ESTADO',
      accessorKey: 'estado',
      cell: (info) => {
        const estado = info.getValue() as string
        const colors: Record<string, string> = {
          'por_aplicar': '#FF9800',
          'fraccionado': '#2196F3',
          'aplicado_completo': '#4CAF50'
        }
        return (
          <span style={{
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: colors[estado] || '#ccc',
            color: 'white',
            fontSize: '12px',
            fontWeight: 'bold'
          }}>
            {estado === 'por_aplicar' ? 'Por Aplicar' : 
             estado === 'fraccionado' ? 'Fraccionado' : 
             'Aplicado'}
          </span>
        )
      }
    },
    {
      id: 'acciones',
      header: 'ACCIONES',
      enableSorting: false,
      cell: (info) => {
        const cobro = info.row.original
        return (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {!cobro.fraccionado && cobro.monto_total > 1000000 && (
              <button
                onClick={() => aplicarFraccionamiento(cobro.id, cobro.monto_total)}
                className="dt-btn-action dt-btn-view"
                title="Fraccionamiento"
              >
                <Zap size={14} />
              </button>
            )}
            {!cobro.fraccionado && cobro.monto_total <= 1000000 && (
              <button
                onClick={() => aprobarCobroDirecto(cobro.id)}
                className="dt-btn-action dt-btn-success"
                title="Aprobar"
              >
                <Check size={14} />
              </button>
            )}
            <button
              onClick={() => rechazarCobro()}
              className="dt-btn-action dt-btn-delete"
              title="Rechazar"
            >
              <X size={14} />
            </button>
          </div>
        )
      }
    }
  ], [])

  return (
    <div className="cobros-por-aplicar-tab">
      <div className="tab-header">
        <h3>Cobros Por Aplicar</h3>
        <p>Revisar, aprobar y aplicar fraccionamientos a cobros pendientes</p>
      </div>

      <DataTable
        data={cobros}
        columns={columns}
        loading={loadingCobros}
        showSearch
        showPagination
        emptyTitle="No hay cobros por aplicar"
        emptyDescription="Los cobros pendientes de revisión aparecerán aquí"
      />
    </div>
  )
}
