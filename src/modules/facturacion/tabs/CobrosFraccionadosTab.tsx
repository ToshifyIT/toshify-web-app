/**
 * Tab: Cobros Fraccionados en Facturación
 * Control de cuotas aplicadas, próximas a cobrar, y % de completado
 * 
 * Lee de penalidades + penalidades_cuotas (creadas desde Incidencias)
 */

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import Swal from 'sweetalert2'
import '../CobrosFraccionados.css'

interface Cuota {
  id: string
  penalidad_id: string
  numero_cuota: number
  monto_cuota: number
  semana: number
  anio: number
  aplicado: boolean
  fecha_aplicacion: string | null
}

interface ConductorRelation {
  id: string
  nombres: string
  apellidos: string
}

interface CobroSaldoRow {
  id: string
  conductor_id: string
  monto_total: number
  monto_cuota: number
  numero_cuota: number
  semana: number
  anio: number
  descripcion: string | null
  aplicado: boolean
  fecha_aplicacion: string | null
  total_cuotas: number
  created_at: string
  conductor: ConductorRelation | null
}

interface PenalidadRow {
  id: string
  monto: number
  fraccionado: boolean
  cantidad_cuotas: number
  conductor_id: string | null
  conductor_nombre: string | null
  vehiculo_patente: string | null
  fecha: string
  observaciones: string | null
  conductor: ConductorRelation | null
}

interface PenalidadFraccionada {
  id: string
  monto: number
  fraccionado: boolean
  cantidad_cuotas: number
  conductor_id: string | null
  conductor_nombre: string | null
  vehiculo_patente: string | null
  fecha: string
  observaciones: string | null
  cuotas: Cuota[]
  semana_inicio: number | null
  anio_inicio: number | null
  conductor?: {
    nombres: string
    apellidos: string
    nombre_completo: string
  }
}

interface CobrosFraccionadosTabProps {
  periodoActual?: number
}

export function CobrosFraccionadosTab({ periodoActual }: CobrosFraccionadosTabProps) {
  void periodoActual
  const [cobros, setCobros] = useState<PenalidadFraccionada[]>([])
  const [loading, setLoading] = useState(true)
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})

  useEffect(() => {
    cargarCobrosFraccionados()
  }, [])

  const cargarCobrosFraccionados = async () => {
    setLoading(true)
    try {
      // 1. Obtener penalidades fraccionadas con sus cuotas
      const { data: penalidades, error: penError } = await supabase
        .from('penalidades')
        .select(`
          id,
          monto,
          fraccionado,
          cantidad_cuotas,
          conductor_id,
          conductor_nombre,
          vehiculo_patente,
          fecha,
          observaciones,
          conductor:conductores(id, nombres, apellidos)
        `)
        .eq('fraccionado', true)
        .order('fecha', { ascending: false })
      
      if (penError) throw penError

      // Obtener todas las cuotas de penalidades
      const { data: cuotas, error: cuotasError } = await supabase
        .from('penalidades_cuotas')
        .select('*')
        .order('numero_cuota', { ascending: true })
      
      if (cuotasError) throw cuotasError

      // Mapear cuotas a cada penalidad
      const cobrosConCuotas: PenalidadFraccionada[] = ((penalidades || []) as unknown as PenalidadRow[]).map((pen) => {
        const cuotasPen = ((cuotas || []) as Cuota[]).filter((c) => c.penalidad_id === pen.id)
        // Obtener semana/año de inicio desde la primera cuota
        const primeraCuota = cuotasPen.length > 0 ? cuotasPen[0] : null
        return {
          ...pen,
          cuotas: cuotasPen,
          semana_inicio: primeraCuota?.semana || null,
          anio_inicio: primeraCuota?.anio || null,
          conductor: pen.conductor ? {
            nombres: pen.conductor.nombres,
            apellidos: pen.conductor.apellidos,
            nombre_completo: `${pen.conductor.nombres} ${pen.conductor.apellidos}`
          } : undefined
        }
      })

      // 2. Obtener cobros fraccionados de saldos iniciales
      const { data: cobrosSaldos, error: saldosError } = await supabase
        .from('cobros_fraccionados')
        .select(`
          id,
          conductor_id,
          monto_total,
          monto_cuota,
          numero_cuota,
          semana,
          anio,
          descripcion,
          aplicado,
          fecha_aplicacion,
          total_cuotas,
          created_at,
          conductor:conductores(id, nombres, apellidos)
        `)
        .order('created_at', { ascending: false })
      
      if (saldosError) throw saldosError

      // Agrupar cobros_fraccionados por conductor
      const cobrosPorConductor = new Map<string, CobroSaldoRow[]>()
      ;((cobrosSaldos || []) as unknown as CobroSaldoRow[]).forEach((c) => {
        const key = c.conductor_id
        if (!cobrosPorConductor.has(key)) {
          cobrosPorConductor.set(key, [])
        }
        cobrosPorConductor.get(key)!.push(c)
      })

      // Convertir a formato similar a penalidades
      const cobrosDesdesSaldos: PenalidadFraccionada[] = []
      cobrosPorConductor.forEach((cuotasSaldo, conductorId) => {
        if (cuotasSaldo.length === 0) return
        const primerCuota = cuotasSaldo[0]
        const conductor = primerCuota.conductor
        
        // Obtener semana/año de inicio desde la primera cuota
        const primeraCuotaSaldo = cuotasSaldo.reduce<CobroSaldoRow | null>((min, c) => 
          !min || c.numero_cuota < min.numero_cuota ? c : min, null)
        
        cobrosDesdesSaldos.push({
          id: `saldo-${conductorId}`,
          monto: primerCuota.monto_total,
          fraccionado: true,
          cantidad_cuotas: primerCuota.total_cuotas,
          conductor_id: conductorId,
          conductor_nombre: conductor ? `${conductor.apellidos}, ${conductor.nombres}` : 'N/A',
          vehiculo_patente: null,
          fecha: primerCuota.created_at,
          observaciones: primerCuota.descripcion || 'Saldo inicial fraccionado',
          semana_inicio: primeraCuotaSaldo?.semana || null,
          anio_inicio: primeraCuotaSaldo?.anio || null,
          cuotas: cuotasSaldo.map((c) => ({
            id: c.id,
            penalidad_id: `saldo-${conductorId}`,
            numero_cuota: c.numero_cuota,
            monto_cuota: c.monto_cuota,
            semana: c.semana,
            anio: c.anio,
            aplicado: c.aplicado,
            fecha_aplicacion: c.fecha_aplicacion
          })),
          conductor: conductor ? {
            nombres: conductor.nombres,
            apellidos: conductor.apellidos,
            nombre_completo: `${conductor.nombres} ${conductor.apellidos}`
          } : undefined
        })
      })

      // Combinar ambos tipos de cobros
      setCobros([...cobrosConCuotas, ...cobrosDesdesSaldos])
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

  const calcularProgreso = (cuotas: Cuota[] | undefined) => {
    if (!cuotas || cuotas.length === 0) return 0
    const aplicadas = cuotas.filter(c => c.aplicado).length
    return Math.round((aplicadas / cuotas.length) * 100)
  }

  const obtenerProximaCuota = (cuotas: Cuota[] | undefined) => {
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
                      <span className="conductor">
                        {cobro.conductor?.nombre_completo || cobro.conductor_nombre || 'Sin nombre'}
                      </span>
                      <span className="patente" style={{ marginLeft: '10px', color: '#666' }}>
                        {cobro.vehiculo_patente || ''}
                      </span>
                    </div>
                    <div className="cobro-detalles">
                      <span className="monto">
                        ${(cobro.monto || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
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

                  <div className="desde-semana" style={{ minWidth: '120px', textAlign: 'center' }}>
                    <span className="label" style={{ display: 'block', fontSize: '11px', color: '#666' }}>Desde Semana</span>
                    <span className="valor" style={{ fontWeight: 'bold', color: '#1976d2' }}>
                      {cobro.semana_inicio && cobro.anio_inicio 
                        ? `${cobro.semana_inicio}/${cobro.anio_inicio}`
                        : '-'
                      }
                    </span>
                  </div>

                  <div className="proxima-cuota">
                    {proxima ? (
                      <div>
                        <span className="label">Próxima Cuota:</span>
                        <span className="valor">
                          Semana {proxima.semana}/{proxima.anio || '?'} - ${proxima.monto_cuota.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span className="label">Estado:</span>
                        <span className="valor completado">Completado</span>
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
                            <td>Semana {cuota.semana} - {cuota.anio || '?'}</td>
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
                                {cuota.aplicado ? 'Aplicada' : 'Pendiente'}
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
