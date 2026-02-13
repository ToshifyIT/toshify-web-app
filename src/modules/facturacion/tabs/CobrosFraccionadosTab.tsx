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
import { ChevronDown, ChevronUp, DollarSign, Eye } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import { showSuccess } from '../../../utils/toast'
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

export function CobrosFraccionadosTab({ periodoActual }: CobrosFraccionadosTabProps) {
  void periodoActual
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const [cobros, setCobros] = useState<PenalidadFraccionada[]>([])
  const [loading, setLoading] = useState(true)
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})
  const [allPagos, setAllPagos] = useState<PagoConductorRow[]>([])

  useEffect(() => {
    cargarCobrosFraccionados()
  }, [sedeActualId])

  const cargarCobrosFraccionados = async () => {
    setLoading(true)
    try {
      // 1. Obtener penalidades fraccionadas con sus cuotas
      const { data: penalidades, error: penError } = await aplicarFiltroSede(supabase
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
        `))
        .eq('fraccionado', true)
        .order('fecha', { ascending: false })

      if (penError) throw penError

      // Obtener todas las cuotas de penalidades
      const { data: cuotas, error: cuotasError } = await supabase
        .from('penalidades_cuotas')
        .select('*')
        .order('numero_cuota', { ascending: true })

      if (cuotasError) throw cuotasError

      // 2. Obtener cobros fraccionados de saldos iniciales
      const { data: cobrosSaldos, error: saldosError } = await aplicarFiltroSede(supabase
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
        `))
        .order('created_at', { ascending: false })

      if (saldosError) throw saldosError

      // 3. Cargar pagos registrados
      const { data: pagos } = await aplicarFiltroSede((supabase
        .from('pagos_conductores') as any)
        .select('*'))
        .in('tipo_cobro', ['cobro_fraccionado', 'penalidad_cuota'])
        .order('fecha_pago', { ascending: false })

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
            pagado: cuotasPagadasSet.has(c.id),
            fecha_pago: cuotasPagosMap.get(c.id)?.fecha_pago || null
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

  // ==========================================
  // REGISTRAR PAGO DE CUOTA
  // ==========================================
  const registrarPagoCuota = async (cobro: PenalidadFraccionada, cuota: Cuota) => {
    const esPenalidad = !cobro.id.startsWith('saldo-')
    const cuotaTabla = esPenalidad ? 'penalidades_cuotas' : 'cobros_fraccionados'
    const tipoCobro = esPenalidad ? 'penalidad_cuota' : 'cobro_fraccionado'

    const hoy = new Date()
    const semanaActual = Math.ceil(
      (hoy.getTime() - new Date(hoy.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)
    )
    const anioActual = hoy.getFullYear()

    let semanaOptionsHtml = ''
    for (let s = 1; s <= 52; s++) {
      const selected = s === semanaActual ? 'selected' : ''
      semanaOptionsHtml += `<option value="${s}" ${selected}>${s}</option>`
    }

    const conductorNombre = cobro.conductor?.nombre_completo || cobro.conductor_nombre || 'Sin nombre'

    const { value: formValues } = await Swal.fire({
      title: '<span style="font-size: 16px; font-weight: 600;">Registrar Pago de Cuota</span>',
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #111827;">${conductorNombre}</div>
            <div style="display: flex; gap: 12px; margin-top: 4px;">
              <span style="color: #6B7280; font-size: 12px;">Cuota: <strong style="color: #374151;">#${cuota.numero_cuota}</strong></span>
              <span style="color: #6B7280; font-size: 12px;">Semana: <strong style="color: #374151;">${cuota.semana}/${cuota.anio || '?'}</strong></span>
            </div>
            <div style="color: #ff0033; font-size: 12px; margin-top: 4px;">
              Monto cuota: <strong>${formatCurrency(cuota.monto_cuota)}</strong>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Semana:</label>
              <select id="swal-semana" class="swal2-select" style="width: 100%; font-size: 14px;">
                ${semanaOptionsHtml}
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Año:</label>
              <select id="swal-anio" class="swal2-select" style="width: 100%; font-size: 14px;">
                <option value="2025">2025</option>
                <option value="${anioActual}" selected>${anioActual}</option>
              </select>
            </div>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Monto a pagar:</label>
            <input id="swal-monto" type="number" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${cuota.monto_cuota}">
          </div>
          <div>
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Referencia (opcional):</label>
            <input id="swal-ref" type="text" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" placeholder="Ej: Pago en efectivo, Transferencia #123">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Registrar Pago',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a',
      width: 380,
      preConfirm: () => {
        const semana = parseInt((document.getElementById('swal-semana') as HTMLSelectElement).value)
        const anio = parseInt((document.getElementById('swal-anio') as HTMLSelectElement).value)
        const monto = (document.getElementById('swal-monto') as HTMLInputElement).value
        const referencia = (document.getElementById('swal-ref') as HTMLInputElement).value
        if (!monto || parseFloat(monto) <= 0) {
          Swal.showValidationMessage('Ingrese un monto válido')
          return false
        }
        return { monto: parseFloat(monto), referencia, semana, anio }
      }
    })

    if (!formValues) return

    try {
      // 1. Registrar pago en pagos_conductores
      const { error: errorPago } = await (supabase.from('pagos_conductores') as any)
        .insert({
          conductor_id: cobro.conductor_id,
          tipo_cobro: tipoCobro,
          referencia_id: cuota.id,
          referencia_tabla: cuotaTabla,
          numero_cuota: cuota.numero_cuota,
          monto: formValues.monto,
          fecha_pago: new Date().toISOString(),
          referencia: formValues.referencia || null,
          semana: formValues.semana,
          anio: formValues.anio,
          conductor_nombre: conductorNombre
        })

      if (errorPago) throw errorPago

      // 2. Marcar cuota como aplicada en tabla origen
      if (cuotaTabla === 'cobros_fraccionados') {
        const { error: errorUpdate } = await (supabase.from('cobros_fraccionados') as any)
          .update({
            aplicado: true,
            fecha_aplicacion: new Date().toISOString()
          })
          .eq('id', cuota.id)
        if (errorUpdate) throw errorUpdate
      } else {
        const { error: errorUpdate } = await (supabase.from('penalidades_cuotas') as any)
          .update({
            aplicado: true,
            fecha_aplicacion: new Date().toISOString()
          })
          .eq('id', cuota.id)
        if (errorUpdate) throw errorUpdate
      }

      // 3. Actualizar saldo_actual en saldos_conductores
      const { data: saldoExistente } = await (supabase.from('saldos_conductores') as any)
        .select('id, saldo_actual')
        .eq('conductor_id', cobro.conductor_id)
        .single()

      if (saldoExistente) {
        const nuevoSaldo = saldoExistente.saldo_actual + formValues.monto
        await (supabase.from('saldos_conductores') as any)
          .update({
            saldo_actual: nuevoSaldo,
            ultima_actualizacion: new Date().toISOString()
          })
          .eq('id', saldoExistente.id)
      }

      // 4. Registrar en abonos_conductores como audit trail
      await (supabase.from('abonos_conductores') as any).insert({
        conductor_id: cobro.conductor_id,
        tipo: 'abono',
        monto: formValues.monto,
        concepto: `Pago cuota #${cuota.numero_cuota} - ${esPenalidad ? 'Penalidad fraccionada' : 'Saldo fraccionado'}`,
        referencia: formValues.referencia || null,
        semana: formValues.semana,
        anio: formValues.anio,
        fecha_abono: new Date().toISOString()
      })

      showSuccess('Pago Registrado', `Cuota #${cuota.numero_cuota} - ${formatCurrency(formValues.monto)}`)
      cargarCobrosFraccionados()
    } catch (error: any) {
      console.error('Error registrando pago:', error)
      Swal.fire('Error', error.message || 'No se pudo registrar el pago', 'error')
    }
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
          backgroundColor: 'var(--bg-tertiary, #f5f5f5)',
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
                      <span className="patente" style={{ marginLeft: '10px', color: 'var(--text-secondary, #666)' }}>
                        {cobro.vehiculo_patente || ''}
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
                    {proxima ? (
                      <div>
                        <span className="label">Próxima Cuota:</span>
                        <span className="valor">
                          Semana {proxima.semana}/{proxima.anio || '?'} - ${proxima.monto_cuota.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span className="label">Estado:</span>
                        <span className="valor completado">Completado</span>
                      </div>
                    )}
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
                        {(cobro.cuotas || []).map(cuota => (
                          <tr key={cuota.id} className={cuota.aplicado ? (cuota.pagado ? 'pagada' : 'aplicada') : 'pendiente'}>
                            <td>#{cuota.numero_cuota}</td>
                            <td>Semana {cuota.semana} - {cuota.anio || '?'}</td>
                            <td>
                              ${cuota.monto_cuota.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                backgroundColor: cuota.aplicado
                                  ? (cuota.pagado ? '#16a34a' : '#4CAF50')
                                  : '#FFC107',
                                color: cuota.aplicado ? 'white' : '#333',
                                fontSize: '12px',
                                fontWeight: 'bold'
                              }}>
                                {cuota.aplicado
                                  ? (cuota.pagado ? 'Pagada' : 'Aplicada')
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
                              {!cuota.aplicado && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    registrarPagoCuota(cobro, cuota)
                                  }}
                                  className="btn-pagar-cuota"
                                  title="Registrar pago de esta cuota"
                                >
                                  <DollarSign size={12} />
                                  Pagar
                                </button>
                              )}
                              {cuota.aplicado && cuota.pagado && (
                                <span style={{ color: '#16a34a', fontSize: '11px', fontWeight: 600 }}>
                                  Pagado
                                </span>
                              )}
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
