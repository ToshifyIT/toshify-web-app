/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tab: Cobros Fraccionados en Facturación
 * Control de cuotas aplicadas, próximas a cobrar, y % de completado
 * + Registro de pagos por cuota individual
 *
 * Lee de penalidades + penalidades_cuotas (creadas desde Incidencias)
 * Lee de cobros_fraccionados (creados desde Saldos)
 * Registra pagos en pagos_conductores + abonos_conductores
 */

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Eye } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
// import { useAuth } from '../../../contexts/AuthContext'
import { formatNombreCompleto } from '../../../utils/conductorUtils'
// import { insertControlSaldo } from '../../../services/controlSaldosService'
// import { showSuccess } from '../../../utils/toast'
import { formatCurrency } from '../../../types/facturacion.types'
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
  estado?: 'pendiente' | 'aplicada' | 'pagada' | 'cancelada_por_baja'
  pagado?: boolean
  fecha_pago?: string | null
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
  estado?: 'pendiente' | 'aplicada' | 'pagada' | 'cancelada_por_baja'
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

interface PagoConductorRow {
  id: string
  conductor_id: string
  tipo_cobro: string
  referencia_id: string | null
  referencia_tabla: string | null
  numero_cuota: number | null
  monto: number
  fecha_pago: string
  referencia: string | null
  semana: number | null
  anio: number | null
}

interface CobrosFraccionadosTabProps {
  periodoActual?: number
}

type FiltroEstado = 'activos' | 'completados' | 'cancelados' | 'todos'

// Estado computado de un grupo de cuotas (penalidad o cobro fraccionado)
type EstadoGrupo = 'activo' | 'completado' | 'cancelado'

function calcularEstadoGrupo(cuotas: Cuota[]): EstadoGrupo {
  if (!cuotas || cuotas.length === 0) return 'activo'
  const total = cuotas.length
  const canceladas = cuotas.filter(c => c.estado === 'cancelada_por_baja').length
  // Si hay AL MENOS UNA cuota cancelada por baja, el fraccionamiento entero
  // se considera cancelado (el resto ya no se puede cobrar: el conductor está de baja
  // y el saldo se reingresó como deuda exigible).
  if (canceladas > 0) return 'cancelado'
  const aplicadas = cuotas.filter(c => c.aplicado).length
  if (aplicadas === total) return 'completado'
  return 'activo'
}

export function CobrosFraccionadosTab({ periodoActual }: CobrosFraccionadosTabProps) {
  void periodoActual
  const { sedeActualId, aplicarFiltroSede } = useSede()
  // useAuth removido - no se usa tras ocultar boton Pagar
  const [cobros, setCobros] = useState<PenalidadFraccionada[]>([])
  const [loading, setLoading] = useState(true)
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})
  const [allPagos, setAllPagos] = useState<PagoConductorRow[]>([])
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('activos')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'saldo' | 'multa'>('todos')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    cargarCobrosFraccionados()
  }, [sedeActualId])

  const cargarCobrosFraccionados = async () => {
    setLoading(true)
    try {
      // Cargar penalidades, cuotas, cobros fraccionados y pagos en paralelo
      const [
        { data: penalidades, error: penError },
        { data: cuotas, error: cuotasError },
        { data: cobrosSaldos, error: saldosError },
        { data: pagos },
      ] = await Promise.all([
        aplicarFiltroSede(supabase.from('penalidades').select(`
          id, monto, fraccionado, cantidad_cuotas, conductor_id, conductor_nombre,
          vehiculo_patente, fecha, observaciones, conductor:conductores(id, nombres, apellidos)
        `)).eq('fraccionado', true).order('fecha', { ascending: false }),
        aplicarFiltroSede(supabase.from('penalidades_cuotas').select('id, penalidad_id, numero_cuota, monto_cuota, semana, anio, aplicado, fecha_aplicacion, estado')).order('numero_cuota', { ascending: true }),
        aplicarFiltroSede(supabase.from('cobros_fraccionados').select(`
          id, conductor_id, monto_total, monto_cuota, numero_cuota, semana, anio,
          descripcion, aplicado, fecha_aplicacion, estado, total_cuotas, created_at,
          conductor:conductores(id, nombres, apellidos)
        `)).order('created_at', { ascending: false }),
        aplicarFiltroSede((supabase.from('pagos_conductores') as any).select('*'))
          .in('tipo_cobro', ['cobro_fraccionado', 'penalidad_cuota'])
          .order('fecha_pago', { ascending: false }),
      ])

      if (penError) throw penError
      if (cuotasError) throw cuotasError
      if (saldosError) throw saldosError

      const pagosData = (pagos || []) as PagoConductorRow[]
      setAllPagos(pagosData)

      // Crear mapa de cuotas pagadas por referencia_id
      const cuotasPagadasSet = new Set<string>()
      const cuotasPagosMap = new Map<string, PagoConductorRow>()
      for (const pago of pagosData) {
        if (pago.referencia_id) {
          cuotasPagadasSet.add(pago.referencia_id)
          cuotasPagosMap.set(pago.referencia_id, pago)
        }
      }

      // Mapear cuotas a cada penalidad
      const cobrosConCuotas: PenalidadFraccionada[] = ((penalidades || []) as unknown as PenalidadRow[]).map((pen) => {
        const cuotasPen = ((cuotas || []) as Cuota[])
          .filter((c) => c.penalidad_id === pen.id)
          .map(c => ({
            ...c,
            estado: c.estado,
            pagado: cuotasPagadasSet.has(c.id),
            fecha_pago: cuotasPagosMap.get(c.id)?.fecha_pago || null
          }))
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
            fecha_aplicacion: c.fecha_aplicacion,
            estado: c.estado,
            pagado: cuotasPagadasSet.has(c.id),
            fecha_pago: cuotasPagosMap.get(c.id)?.fecha_pago || null
          })).sort((a, b) => a.numero_cuota - b.numero_cuota),
          conductor: conductor ? {
            nombres: conductor.nombres,
            apellidos: conductor.apellidos,
            nombre_completo: `${conductor.nombres} ${conductor.apellidos}`
          } : undefined
        })
      })

      // Combinar ambos tipos de cobros
      setCobros([...cobrosConCuotas, ...cobrosDesdesSaldos])
    } catch {
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

  // ==========================================
  // VER HISTORIAL DE PAGOS
  // ==========================================
  const verHistorialPagos = (cobro: PenalidadFraccionada) => {
    // Filtrar pagos que corresponden a cuotas de este cobro
    const cuotaIds = new Set((cobro.cuotas || []).map(c => c.id))
    const pagosGrupo = allPagos.filter(p => p.referencia_id && cuotaIds.has(p.referencia_id))

    const conductorNombre = cobro.conductor?.nombre_completo || cobro.conductor_nombre || 'Sin nombre'
    const cuotasAplicadas = (cobro.cuotas || []).filter(c => c.aplicado).length
    const totalCuotas = cobro.cuotas?.length || 0
    const progreso = calcularProgreso(cobro.cuotas)
    const totalPagado = pagosGrupo.reduce((sum, p) => sum + p.monto, 0)

    const pagosHtml = pagosGrupo.length > 0
      ? pagosGrupo.map(p => `
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB;">#${p.numero_cuota || '-'}</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB;">${p.semana && p.anio ? `S${p.semana}/${p.anio}` : '-'}</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB;">${new Date(p.fecha_pago).toLocaleDateString('es-AR')}</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; text-align: right; color: #16a34a; font-weight: 600;">${formatCurrency(p.monto)}</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; color: #6B7280;">${p.referencia || '-'}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="5" style="padding: 16px; text-align: center; color: #9CA3AF;">Sin pagos registrados</td></tr>'

    Swal.fire({
      title: '<span style="font-size: 16px; font-weight: 600;">Historial de Pagos</span>',
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #111827;">${conductorNombre}</div>
            <div style="display: flex; gap: 12px; margin-top: 4px;">
              <span style="color: #16a34a; font-size: 12px;">Pagado: <strong>${formatCurrency(totalPagado)}</strong></span>
              <span style="color: #ff0033; font-size: 12px;">Total: <strong>${formatCurrency(cobro.monto)}</strong></span>
            </div>
            <div style="background: #E5E7EB; height: 6px; border-radius: 3px; margin-top: 8px; overflow: hidden;">
              <div style="background: #16a34a; height: 100%; width: ${progreso}%;"></div>
            </div>
            <div style="text-align: center; font-size: 11px; color: #6B7280; margin-top: 2px;">${cuotasAplicadas}/${totalCuotas} cuotas - ${progreso}%</div>
          </div>
          <div style="max-height: 250px; overflow-y: auto; border: 1px solid #E5E7EB; border-radius: 6px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
              <thead>
                <tr style="background: #F9FAFB;">
                  <th style="padding: 6px 8px; text-align: left; font-weight: 600;">Cuota</th>
                  <th style="padding: 6px 8px; text-align: left; font-weight: 600;">Semana</th>
                  <th style="padding: 6px 8px; text-align: left; font-weight: 600;">Fecha</th>
                  <th style="padding: 6px 8px; text-align: right; font-weight: 600;">Monto</th>
                  <th style="padding: 6px 8px; text-align: left; font-weight: 600;">Ref.</th>
                </tr>
              </thead>
              <tbody>${pagosHtml}</tbody>
            </table>
          </div>
        </div>
      `,
      width: 480,
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#6B7280'
    })
  }

  // Helpers para clasificar
  const esTipoSaldo = (cobro: PenalidadFraccionada) => cobro.id.startsWith('saldo-')

  // Filtrar cobros según búsqueda + tipo + estado (AND)
  const busquedaNorm = busqueda.trim().toLowerCase()
  const cobrosFiltrados = cobros.filter(cobro => {
    // Estado
    if (filtroEstado !== 'todos') {
      const estado = calcularEstadoGrupo(cobro.cuotas)
      if (filtroEstado === 'activos' && estado !== 'activo') return false
      if (filtroEstado === 'completados' && estado !== 'completado') return false
      if (filtroEstado === 'cancelados' && estado !== 'cancelado') return false
    }
    // Tipo
    if (filtroTipo === 'saldo' && !esTipoSaldo(cobro)) return false
    if (filtroTipo === 'multa' && esTipoSaldo(cobro)) return false
    // Búsqueda (nombre, DNI placeholder en conductor_id, patente)
    if (busquedaNorm) {
      const nombre = (cobro.conductor?.nombre_completo || cobro.conductor_nombre || '').toLowerCase()
      const patente = (cobro.vehiculo_patente || '').toLowerCase()
      if (!nombre.includes(busquedaNorm) && !patente.includes(busquedaNorm)) return false
    }
    return true
  })

  // Conteo por estado para mostrar al lado del label en el dropdown
  const conteos = {
    activos: cobros.filter(c => calcularEstadoGrupo(c.cuotas) === 'activo').length,
    completados: cobros.filter(c => calcularEstadoGrupo(c.cuotas) === 'completado').length,
    cancelados: cobros.filter(c => calcularEstadoGrupo(c.cuotas) === 'cancelado').length,
    todos: cobros.length,
  }
  const conteosTipo = {
    todos: cobros.length,
    saldo: cobros.filter(esTipoSaldo).length,
    multa: cobros.filter(c => !esTipoSaldo(c)).length,
  }

  const limpiarFiltros = () => {
    setBusqueda('')
    setFiltroTipo('todos')
    setFiltroEstado('activos')
  }
  const hayFiltrosActivos = !!busquedaNorm || filtroTipo !== 'todos' || filtroEstado !== 'activos'

  return (
    <div className="cobros-fraccionados-tab">
      <div className="tab-header">
        <h3>Control de Cobros Fraccionados</h3>
        <p>Seguimiento de cuotas aplicadas y pendientes</p>
      </div>

      {!loading && cobros.length > 0 && (
        <div className="cf-filters-row" style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '14px',
        }}>
          {/* Buscador (sigue patrón DataTable) */}
          <div className="dt-search-wrapper" style={{ flex: '1 1 280px', minWidth: '220px' }}>
            <svg
              className="dt-search-icon"
              width="20" height="20" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              className="dt-search-input"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar conductor o patente..."
            />
          </div>

          {/* Tipo */}
          <div className="cf-filter-group">
            <label className="cf-filter-label">Tipo:</label>
            <select
              className="cf-filter-select"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as 'todos' | 'saldo' | 'multa')}
            >
              <option value="todos">Todos ({conteosTipo.todos})</option>
              <option value="saldo">Saldos ({conteosTipo.saldo})</option>
              <option value="multa">Incidencias ({conteosTipo.multa})</option>
            </select>
          </div>

          {/* Estado */}
          <div className="cf-filter-group">
            <label className="cf-filter-label">Estado:</label>
            <select
              className="cf-filter-select"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)}
            >
              <option value="activos">Activos ({conteos.activos})</option>
              <option value="completados">Completados ({conteos.completados})</option>
              <option value="cancelados">Cancelados por baja ({conteos.cancelados})</option>
              <option value="todos">Todos ({conteos.todos})</option>
            </select>
          </div>

          {/* Limpiar filtros */}
          {hayFiltrosActivos && (
            <button
              type="button"
              onClick={limpiarFiltros}
              style={{
                padding: '7px 12px', fontSize: '12px', fontWeight: 600,
                border: '1px solid var(--border-color, #d1d5db)',
                borderRadius: '6px', backgroundColor: 'transparent',
                color: 'var(--text-secondary, #6B7280)', cursor: 'pointer',
              }}
              title="Limpiar todos los filtros"
            >
              Limpiar
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>Cargando cobros fraccionados...</p>
        </div>
      ) : cobrosFiltrados.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          backgroundColor: 'var(--bg-tertiary, #f5f5f5)',
          borderRadius: '8px'
        }}>
          <p>{cobros.length === 0 ? 'No hay cobros fraccionados' : 'No hay registros para el filtro seleccionado'}</p>
        </div>
      ) : (
        <div className="cobros-lista">
          {cobrosFiltrados.map(cobro => {
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
                        {formatNombreCompleto(cobro.conductor?.nombre_completo || cobro.conductor_nombre) || 'Sin nombre'}
                      </span>
                      <span className="patente" style={{ marginLeft: '10px', color: 'var(--text-secondary, #666)' }}>
                        {cobro.vehiculo_patente || ''}
                      </span>
                      <span style={{
                        marginLeft: '8px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 600,
                        background: esTipoSaldo(cobro) ? 'rgba(99,102,241,0.1)' : 'rgba(234,88,12,0.1)',
                        color: esTipoSaldo(cobro) ? '#6366F1' : '#EA580C',
                      }}>
                        {esTipoSaldo(cobro) ? 'Saldo' : 'Incidencia'}
                      </span>
                    </div>
                    <div className="cobro-detalles">
                      <span className="monto">
                        ${(cobro.monto || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
                    <span className="label" style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary, #666)' }}>Desde Semana</span>
                    <span className="valor" style={{ fontWeight: 'bold', color: '#1976d2' }}>
                      {cobro.semana_inicio && cobro.anio_inicio
                        ? `${cobro.semana_inicio}/${cobro.anio_inicio}`
                        : '-'
                      }
                    </span>
                  </div>

                  <div className="proxima-cuota">
                    {(() => {
                      const estadoGrupo = calcularEstadoGrupo(cobro.cuotas)
                      if (estadoGrupo === 'cancelado') {
                        return (
                          <div>
                            <span className="label">Estado:</span>
                            <span className="valor" style={{ color: '#6B7280', fontWeight: 600 }}>
                              Cancelado por baja
                            </span>
                          </div>
                        )
                      }
                      if (proxima) {
                        return (
                          <div>
                            <span className="label">Próxima Cuota:</span>
                            <span className="valor">
                              Semana {proxima.semana}/{proxima.anio || '?'} - ${proxima.monto_cuota.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )
                      }
                      return (
                        <div>
                          <span className="label">Estado:</span>
                          <span className="valor completado">Completado</span>
                        </div>
                      )
                    })()}
                  </div>

                  <button
                    className="btn-expandir"
                    onClick={(e) => {
                      e.stopPropagation()
                      verHistorialPagos(cobro)
                    }}
                    title="Ver historial de pagos"
                    style={{ color: '#16a34a' }}
                  >
                    <Eye size={20} />
                  </button>

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
                          <th style={{ textAlign: 'center' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(cobro.cuotas || []).map(cuota => {
                          const cancelada = cuota.estado === 'cancelada_por_baja'
                          return (
                          <tr key={cuota.id} className={cancelada ? 'cancelada' : (cuota.aplicado || cuota.pagado ? 'aplicada' : 'pendiente')}>
                            <td>#{cuota.numero_cuota}</td>
                            <td>Semana {cuota.semana} - {cuota.anio || '?'}</td>
                            <td>
                              ${cuota.monto_cuota.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                backgroundColor: cancelada
                                  ? '#9CA3AF'
                                  : (cuota.aplicado || cuota.pagado)
                                    ? '#4CAF50'
                                    : '#FFC107',
                                color: cancelada || cuota.aplicado || cuota.pagado ? 'white' : '#333',
                                fontSize: '12px',
                                fontWeight: 'bold'
                              }}>
                                {cancelada
                                  ? 'Cancelado por baja'
                                  : (cuota.aplicado || cuota.pagado)
                                    ? 'Aplicada'
                                    : 'Pendiente'
                                }
                              </span>
                            </td>
                            <td>
                              {cuota.pagado && cuota.fecha_pago
                                ? new Date(cuota.fecha_pago).toLocaleDateString('es-AR')
                                : cuota.fecha_aplicacion
                                  ? new Date(cuota.fecha_aplicacion).toLocaleDateString('es-AR')
                                  : '-'
                              }
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {/* Boton Pagar oculto: las cuotas se aplican automaticamente al cerrar periodo */}
                              {(cuota.aplicado || cuota.pagado) && !cancelada && (
                                <span style={{ color: '#16a34a', fontSize: '11px', fontWeight: 600 }}>
                                  Pagado
                                </span>
                              )}
                              {cancelada && (
                                <span style={{ color: '#6B7280', fontSize: '11px', fontWeight: 600 }}>
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                          )
                        })}
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
