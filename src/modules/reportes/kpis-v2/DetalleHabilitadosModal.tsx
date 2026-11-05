// src/modules/reportes/kpis-v2/DetalleHabilitadosModal.tsx
// Detalle de la tarjeta "Turnos por vehículos habilitados" (Dashboard General): qué
// autos se sumaron a la flota operativa en el período, por qué (nuevo o volvió de
// taller, robo, PKG OFF...) y si ya recibieron asignación. Los datos ya vienen
// calculados (cargarTurnosGenerados); acá solo se muestran.
import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { Periodo } from './kpisV2Types'
import type { VehiculoHabilitado } from './indicadoresModulosService'
import { fechaCorta } from './kpisV2Types'
import { PatenteBadge } from '../../../components/ui/PatenteBadge'

function diaCorto(dia: string): string {
  return `${fechaCorta(dia)}/${dia.slice(2, 4)}`
}

export function DetalleHabilitadosModal({ periodo, filas, conReincorporados, onClose }: {
  periodo: Periodo
  filas: VehiculoHabilitado[]
  /** false si falta sql/kpi_vehiculos_reincorporados.sql: solo hay autos nuevos. */
  conReincorporados: boolean
  onClose: () => void
}) {
  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', cerrar)
    return () => window.removeEventListener('keydown', cerrar)
  }, [onClose])

  const nuevos = filas.filter(f => f.esNuevo).length
  const volvieron = filas.length - nuevos

  return (
    <div
      className="modal-overlay dkv2-modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="dkv2-modal dkv2-modal--ancho" role="dialog" aria-modal="true" aria-labelledby="dkv2-habilitados-titulo">
        <header className="dkv2-modal-header">
          <div>
            <h2 id="dkv2-habilitados-titulo">Vehículos habilitados · {periodo.labelLargo}</h2>
            <p>
              {filas.length} {filas.length === 1 ? 'vehículo sumó' : 'vehículos sumaron'} {filas.length * 2} turnos
              {' '}({nuevos} {nuevos === 1 ? 'nuevo' : 'nuevos'} · {volvieron} {volvieron === 1 ? 'volvió' : 'volvieron'} a operar).
            </p>
          </div>
          <button type="button" className="dkv2-icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>
        <div className="dkv2-modal-body">
          {!conReincorporados ? (
            <p className="dkv2-mod-aviso">
              Solo se muestran los autos nuevos: falta correr sql/kpi_vehiculos_reincorporados.sql para ver los que volvieron a operar.
            </p>
          ) : null}
          {filas.length === 0 ? <p className="dkv2-mod-aviso">No se habilitaron vehículos en el período.</p> : (
            <div className="dkv2-table-wrap">
              <table className="dkv2-table">
                <thead>
                  <tr>
                    <th>Vehículo</th>
                    <th>Fecha</th>
                    <th>Motivo</th>
                    <th title="Recibió asignación después de habilitarse">Asignación</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map(f => (
                    <tr key={`${f.vehiculoId}-${f.fecha}`}>
                      <td><PatenteBadge patente={f.patente} size="sm" /></td>
                      <td>{diaCorto(f.fecha)}</td>
                      <td><span className="dkv2-chip">{f.motivo}</span></td>
                      <td>{f.yaAsignado ? 'Ya asignado' : <span className="dkv2-muted">Sin asignar</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
