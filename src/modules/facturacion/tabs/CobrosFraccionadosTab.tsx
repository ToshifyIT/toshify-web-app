/**
 * Tab: Cobros Fraccionados en Facturación
 * Control de cuotas aplicadas, próximas a cobrar, y % de completado
 */

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cobrosService } from '../../../services/cobrosService'
import Swal from 'sweetalert2'
import type { CobroIncidenciaConRelaciones } from '../../../types/incidencias.types'
import '../CobrosFraccionados.css'

interface CobrosFraccionadosTabProps {
  periodoActual?: number
}

export function CobrosFraccionadosTab({ periodoActual }: CobrosFraccionadosTabProps) {
  void periodoActual
  const [cobros, setCobros] = useState<CobroIncidenciaConRelaciones[]>([])
  const [loading, setLoading] = useState(true)
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})

  useEffect(() => {
    cargarCobrosFraccionados()
  }, [])

  const cargarCobrosFraccionados = async () => {
    setLoading(true)
    try {
      const datos = await cobrosService.obtenerCobrosFraccionados()
      setCobros(datos)
    } catch (error) {
      console.error('Error cargando cobros:', error)
      Swal.fire('Error', 'No se pudieron cargar los cobros fraccionados', 'error')
    } finally {
      setLoading(false)
    }
  }

  const toggleExpandido = (cobroId: string) => {
    setExpandidos(prev => ({
      ...prev,
      [cobroId]: !prev[cobroId]
    }))
  }

  const calcularProgreso = (cuotas: any[] | undefined) => {
    if (!cuotas || cuotas.length === 0) return 0
    const aplicadas = cuotas.filter(c => c.aplicado).length
    return Math.round((aplicadas / cuotas.length) * 100)
  }

  const obtenerProximaCuota = (cuotas: any[] | undefined) => {
    if (!cuotas) return null
    return cuotas.find(c => !c.aplicado)
  }

  return (
    <div className="cobros-fraccionados-tab">
      <div className="tab-header">
        <h3>Control de Cobros Fraccionados</h3>
        <p>Seguimiento de cuotas aplicadas y pendientes</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>Cargando cobros fraccionados...</p>
        </div>
      ) : cobros.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px'
        }}>
          <p>No hay cobros fraccionados</p>
        </div>
      ) : (
        <div className="cobros-lista">
          {cobros.map(cobro => {
            const proxima = obtenerProximaCuota(cobro.cuotas)
            const progreso = calcularProgreso(cobro.cuotas)
            const cuotasAplicadas = (cobro.cuotas || []).filter(c => c.aplicado).length
            const totalCuotas = cobro.cuotas?.length || 0
            const expandido = expandidos[cobro.id]

            return (
              <div key={cobro.id} className="cobro-card">
                <div 
                  className="cobro-header"
                  onClick={() => toggleExpandido(cobro.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="cobro-info">
                    <div className="cobro-titulo">
                      <span className="id">{cobro.id}</span>
                      <span className="conductor">
                        {cobro.conductor?.nombre_completo || 'Sin nombre'}
                      </span>
                    </div>
                    <div className="cobro-detalles">
                      <span className="monto">
                        ${cobro.monto_total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="cuotas">
                        {cuotasAplicadas} de {totalCuotas} cuotas
                      </span>
                    </div>
                  </div>

                  <div className="cobro-progreso">
                    <div className="barra-progreso">
                      <div 
                        className="barra-llena"
                        style={{ width: `${progreso}%` }}
                      />
                    </div>
                    <span className="porcentaje">{progreso}%</span>
                  </div>

                  <div className="proxima-cuota">
                    {proxima ? (
                      <div>
                        <span className="label">Próxima Cuota:</span>
                        <span className="valor">
                          Semana {proxima.semana} - ${proxima.monto_cuota.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span className="label">Estado:</span>
                        <span className="valor completado">✓ Completado</span>
                      </div>
                    )}
                  </div>

                  <button className="btn-expandir">
                    {expandido ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>

                {expandido && (
                  <div className="cobro-detalle">
                    <table className="cuotas-table">
                      <thead>
                        <tr>
                          <th>Cuota</th>
                          <th>Semana</th>
                          <th>Monto</th>
                          <th>Estado</th>
                          <th>Fecha Aplicación</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(cobro.cuotas || []).map(cuota => (
                          <tr key={cuota.id} className={cuota.aplicado ? 'aplicada' : 'pendiente'}>
                            <td>#{cuota.numero_cuota}</td>
                            <td>Semana {cuota.semana}</td>
                            <td>
                              ${cuota.monto_cuota.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </td>
                            <td>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                backgroundColor: cuota.aplicado ? '#4CAF50' : '#FFC107',
                                color: cuota.aplicado ? 'white' : '#333',
                                fontSize: '12px',
                                fontWeight: 'bold'
                              }}>
                                {cuota.aplicado ? '✓ Aplicada' : '⏳ Pendiente'}
                              </span>
                            </td>
                            <td>
                              {cuota.fecha_aplicacion 
                                ? new Date(cuota.fecha_aplicacion).toLocaleDateString('es-AR')
                                : '-'
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
