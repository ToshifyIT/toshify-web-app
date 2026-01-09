import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import Swal from 'sweetalert2'
import {
  UserMinus,
  Calculator,
  DollarSign,
  FileText,
  Plus,
  Eye,
  Edit2,
  Trash2,
  CheckCircle,
  Clock,
  Filter,
  Download,
  Shield
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import {
  formatCurrency,
  formatDate,
  FACTURACION_CONFIG
} from '../../../types/facturacion.types'
import { format, differenceInDays, startOfWeek, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import * as XLSX from 'xlsx'

interface Liquidacion {
  id: string
  conductor_id: string
  conductor_nombre: string
  conductor_dni: string
  conductor_cuit: string | null
  vehiculo_patente: string | null
  tipo_alquiler: string | null
  fecha_liquidacion: string
  fecha_corte: string
  dias_trabajados: number
  alquiler_proporcional: number
  garantia_proporcional: number
  peajes_pendientes: number
  excesos_km: number
  penalidades: number
  tickets_favor: number
  saldo_anterior: number
  mora_acumulada: number
  garantia_total_pagada: number
  garantia_cuotas_pagadas: number
  garantia_a_devolver: number
  subtotal_cargos: number
  subtotal_descuentos: number
  total_liquidacion: number
  estado: 'borrador' | 'calculado' | 'aprobado' | 'pagado' | 'cancelado'
  notas: string | null
  created_at: string
}

interface ConductorActivo {
  id: string
  nombres: string
  apellidos: string
  dni: string
  cuit: string | null
  vehiculo_id: string | null
  vehiculo_patente: string | null
  tipo_alquiler: string | null
}

export function LiquidacionConductoresTab() {
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')

  // Filtros Excel
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [conductorSearch, setConductorSearch] = useState('')

  useEffect(() => {
    cargarLiquidaciones()
  }, [])

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    if (!openColumnFilter) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.dt-column-filter-dropdown') && !target.closest('.dt-column-filter-btn')) {
        setOpenColumnFilter(null)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [openColumnFilter])

  async function cargarLiquidaciones() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('liquidaciones_conductores')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setLiquidaciones(data || [])
    } catch (error) {
      console.error('Error cargando liquidaciones:', error)
    } finally {
      setLoading(false)
    }
  }

  async function nuevaLiquidacion() {
    // Cargar conductores activos con asignación
    const { data: asignaciones } = await supabase
      .from('asignaciones')
      .select(`
        conductor_id,
        horario,
        conductores:conductor_id(id, nombres, apellidos, dni, cuit),
        vehiculos:vehiculo_id(id, patente)
      `)
      .eq('estado', 'activa')

    const conductoresActivos: ConductorActivo[] = (asignaciones || []).map((a: any) => ({
      id: a.conductores.id,
      nombres: a.conductores.nombres,
      apellidos: a.conductores.apellidos,
      dni: a.conductores.dni,
      cuit: a.conductores.cuit,
      vehiculo_id: a.vehiculos?.id,
      vehiculo_patente: a.vehiculos?.patente,
      tipo_alquiler: a.horario
    }))

    if (conductoresActivos.length === 0) {
      Swal.fire('Sin conductores', 'No hay conductores activos con asignación', 'warning')
      return
    }

    // Guardar en variable global para el modal
    ;(window as any).__liquidacionConductores = conductoresActivos

    const { value: formValues } = await Swal.fire({
      title: 'Nueva Liquidación',
      html: `
        <div style="text-align: left; padding: 0 8px;">
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; color: #374151;">Conductor</label>
            <input id="swal-conductor-search" type="text" placeholder="Buscar conductor..." style="width: 100%; padding: 10px; border: 1px solid #D1D5DB; border-radius: 6px; box-sizing: border-box;">
            <div id="swal-conductor-list" style="max-height: 150px; overflow-y: auto; border: 1px solid #E5E7EB; border-radius: 6px; background: #fff; margin-top: 4px;"></div>
            <input type="hidden" id="swal-conductor-id" value="">
            <div id="swal-conductor-selected" style="margin-top: 8px; padding: 10px; background: #DBEAFE; border-radius: 6px; display: none;">
              <span style="font-size: 13px; color: #1E40AF; font-weight: 500;"></span>
            </div>
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; color: #374151;">Fecha de Corte (último día trabajado)</label>
            <input id="swal-fecha" type="date" value="${format(new Date(), 'yyyy-MM-dd')}" style="width: 100%; padding: 10px; border: 1px solid #D1D5DB; border-radius: 6px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; color: #374151;">Motivo de Baja</label>
            <select id="swal-motivo" style="width: 100%; padding: 10px; border: 1px solid #D1D5DB; border-radius: 6px;">
              <option value="renuncia">Renuncia voluntaria</option>
              <option value="despido">Despido</option>
              <option value="fin_contrato">Fin de contrato</option>
              <option value="mutuo_acuerdo">Mutuo acuerdo</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; color: #374151;">Notas adicionales</label>
            <textarea id="swal-notas" rows="2" style="width: 100%; padding: 10px; border: 1px solid #D1D5DB; border-radius: 6px; resize: none; box-sizing: border-box;" placeholder="Opcional..."></textarea>
          </div>
        </div>
      `,
      didOpen: () => {
        const searchInput = document.getElementById('swal-conductor-search') as HTMLInputElement
        const listContainer = document.getElementById('swal-conductor-list') as HTMLElement
        const conductorIdInput = document.getElementById('swal-conductor-id') as HTMLInputElement
        const selectedDiv = document.getElementById('swal-conductor-selected') as HTMLElement

        const conductoresList = (window as any).__liquidacionConductores || []

        const renderList = (filter: string = '') => {
          const filterLower = filter.toLowerCase()
          const filtered = conductoresList.filter((c: ConductorActivo) =>
            `${c.nombres} ${c.apellidos}`.toLowerCase().includes(filterLower) ||
            c.dni.includes(filter) ||
            (c.vehiculo_patente || '').toLowerCase().includes(filterLower)
          )

          if (filtered.length === 0) {
            listContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #6B7280; font-size: 13px;">No encontrado</div>'
            return
          }

          listContainer.innerHTML = filtered.map((c: ConductorActivo) => `
            <div class="swal-conductor-item"
                 data-id="${c.id}"
                 data-nombre="${c.nombres} ${c.apellidos}"
                 data-dni="${c.dni}"
                 data-patente="${c.vehiculo_patente || '-'}"
                 data-tipo="${c.tipo_alquiler || '-'}"
                 style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; font-size: 13px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="font-weight: 500;">${c.nombres} ${c.apellidos}</span>
                <span style="color: #6B7280; font-family: monospace; font-size: 11px;">${c.vehiculo_patente || '-'}</span>
              </div>
              <div style="font-size: 11px; color: #6B7280;">DNI: ${c.dni} | ${c.tipo_alquiler || '-'}</div>
            </div>
          `).join('')

          listContainer.querySelectorAll('.swal-conductor-item').forEach((item: any) => {
            item.addEventListener('mouseenter', () => item.style.background = '#F3F4F6')
            item.addEventListener('mouseleave', () => item.style.background = '')
            item.addEventListener('click', () => {
              conductorIdInput.value = item.dataset.id
              selectedDiv.style.display = 'block'
              selectedDiv.querySelector('span')!.textContent = `${item.dataset.nombre} - ${item.dataset.patente} (${item.dataset.tipo})`
              listContainer.style.display = 'none'
              searchInput.value = ''
            })
          })
        }

        renderList()
        searchInput.addEventListener('input', () => {
          listContainer.style.display = 'block'
          renderList(searchInput.value)
        })
        searchInput.addEventListener('focus', () => {
          listContainer.style.display = 'block'
          renderList(searchInput.value)
        })
        selectedDiv.addEventListener('click', () => {
          selectedDiv.style.display = 'none'
          listContainer.style.display = 'block'
          searchInput.focus()
        })
      },
      showCancelButton: true,
      confirmButtonText: 'Calcular Liquidación',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#DC2626',
      width: 480,
      preConfirm: () => {
        const conductorId = (document.getElementById('swal-conductor-id') as HTMLInputElement).value
        const fecha = (document.getElementById('swal-fecha') as HTMLInputElement).value
        const motivo = (document.getElementById('swal-motivo') as HTMLSelectElement).value
        const notas = (document.getElementById('swal-notas') as HTMLTextAreaElement).value

        if (!conductorId) {
          Swal.showValidationMessage('Seleccione un conductor')
          return false
        }
        if (!fecha) {
          Swal.showValidationMessage('Seleccione fecha de corte')
          return false
        }

        delete (window as any).__liquidacionConductores
        return { conductorId, fecha, motivo, notas }
      }
    })

    if (!formValues) return

    // Calcular liquidación
    await calcularLiquidacion(formValues.conductorId, formValues.fecha, formValues.motivo, formValues.notas)
  }

  async function calcularLiquidacion(conductorId: string, fechaCorte: string, motivo: string, notas: string) {
    try {
      Swal.fire({
        title: 'Calculando liquidación...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      // Obtener datos del conductor
      const { data: conductor } = await supabase
        .from('conductores')
        .select('id, nombres, apellidos, dni, cuit')
        .eq('id', conductorId)
        .single()

      if (!conductor) throw new Error('Conductor no encontrado')

      // Obtener asignación activa
      const { data: asignacion } = await supabase
        .from('asignaciones')
        .select(`vehiculo_id, horario, vehiculos:vehiculo_id(patente)`)
        .eq('conductor_id', conductorId)
        .eq('estado', 'activa')
        .single()

      // Calcular días trabajados en la semana
      const fechaCorteDate = new Date(fechaCorte)
      const lunesSemana = startOfWeek(fechaCorteDate, { weekStartsOn: 1 })
      const diasTrabajados = differenceInDays(fechaCorteDate, lunesSemana) + 1

      // Obtener tipo alquiler y valores
      const tipoAlquiler = asignacion?.horario || 'CARGO'
      const valorAlquilerSemanal = tipoAlquiler === 'CARGO'
        ? FACTURACION_CONFIG.ALQUILER_CARGO
        : FACTURACION_CONFIG.ALQUILER_TURNO

      // Calcular proporcional
      const alquilerProporcional = (diasTrabajados / 7) * valorAlquilerSemanal
      const garantiaProporcional = (diasTrabajados / 7) * FACTURACION_CONFIG.GARANTIA_CUOTA_SEMANAL

      // Obtener saldo anterior
      const { data: saldo } = await supabase
        .from('saldos_conductores')
        .select('saldo_actual, monto_mora_acumulada')
        .eq('conductor_id', conductorId)
        .single()

      const saldoAnterior = saldo?.saldo_actual || 0
      const moraAcumulada = saldo?.monto_mora_acumulada || 0

      // Obtener garantía acumulada
      const { data: garantia } = await supabase
        .from('garantias_conductores')
        .select('monto_pagado, cuotas_pagadas')
        .eq('conductor_id', conductorId)
        .eq('estado', 'en_curso')
        .single()

      const garantiaTotalPagada = garantia?.monto_pagado || 0
      const garantiaCuotasPagadas = garantia?.cuotas_pagadas || 0

      // Obtener peajes pendientes (última semana)
      const { data: cabifyData } = await supabase
        .from('cabify_historico')
        .select('peajes')
        .eq('conductor_id', conductorId)
        .gte('fecha', format(lunesSemana, 'yyyy-MM-dd'))
        .lte('fecha', fechaCorte)

      const peajesPendientes = (cabifyData || []).reduce((sum: number, d: any) => sum + (d.peajes || 0), 0)

      // Obtener tickets a favor aprobados no aplicados
      const { data: ticketsData } = await supabase
        .from('tickets_favor')
        .select('monto')
        .eq('conductor_id', conductorId)
        .eq('estado', 'aprobado')

      const ticketsFavor = (ticketsData || []).reduce((sum: number, t: any) => sum + t.monto, 0)

      // Obtener excesos de km no aplicados
      const { data: excesosData } = await supabase
        .from('excesos_kilometraje')
        .select('monto_total')
        .eq('conductor_id', conductorId)
        .eq('aplicado', false)

      const excesosKm = (excesosData || []).reduce((sum: number, e: any) => sum + e.monto_total, 0)

      // Calcular totales
      const subtotalCargos = alquilerProporcional + garantiaProporcional + peajesPendientes + excesosKm + saldoAnterior + moraAcumulada
      const subtotalDescuentos = ticketsFavor
      const totalLiquidacion = subtotalCargos - subtotalDescuentos

      // Calcular garantía a devolver (si el total a favor del conductor es mayor que la deuda)
      let garantiaADevolver = 0
      if (totalLiquidacion < 0 && garantiaTotalPagada > 0) {
        // El conductor tiene saldo a favor, se puede devolver garantía
        garantiaADevolver = Math.min(garantiaTotalPagada, Math.abs(totalLiquidacion))
      } else if (totalLiquidacion > 0 && garantiaTotalPagada > totalLiquidacion) {
        // La garantía cubre la deuda
        garantiaADevolver = garantiaTotalPagada - totalLiquidacion
      }

      // Obtener usuario actual
      const { data: userData } = await supabase.auth.getUser()

      // Insertar liquidación
      const { data: liquidacion, error } = await supabase
        .from('liquidaciones_conductores')
        .insert({
          conductor_id: conductorId,
          conductor_nombre: `${conductor.nombres} ${conductor.apellidos}`,
          conductor_dni: conductor.dni,
          conductor_cuit: conductor.cuit,
          vehiculo_id: asignacion?.vehiculo_id,
          vehiculo_patente: (asignacion?.vehiculos as any)?.patente,
          tipo_alquiler: tipoAlquiler,
          fecha_liquidacion: format(new Date(), 'yyyy-MM-dd'),
          fecha_inicio_semana: format(lunesSemana, 'yyyy-MM-dd'),
          fecha_corte: fechaCorte,
          dias_trabajados: diasTrabajados,
          turnos_base: 7,
          alquiler_proporcional: alquilerProporcional,
          garantia_proporcional: garantiaProporcional,
          peajes_pendientes: peajesPendientes,
          excesos_km: excesosKm,
          penalidades: 0,
          tickets_favor: ticketsFavor,
          saldo_anterior: saldoAnterior,
          mora_acumulada: moraAcumulada,
          garantia_total_pagada: garantiaTotalPagada,
          garantia_cuotas_pagadas: garantiaCuotasPagadas,
          garantia_a_devolver: garantiaADevolver,
          subtotal_cargos: subtotalCargos,
          subtotal_descuentos: subtotalDescuentos,
          total_liquidacion: totalLiquidacion,
          estado: 'calculado',
          notas: `${motivo}${notas ? ': ' + notas : ''}`,
          created_by: userData.user?.id,
          created_by_name: userData.user?.email
        })
        .select()
        .single()

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'Liquidación Calculada',
        html: `
          <div style="text-align: left;">
            <p><strong>Conductor:</strong> ${conductor.nombres} ${conductor.apellidos}</p>
            <p><strong>Días trabajados:</strong> ${diasTrabajados}/7</p>
            <p><strong>Total a ${totalLiquidacion >= 0 ? 'cobrar' : 'devolver'}:</strong>
              <span style="font-weight: 700; color: ${totalLiquidacion >= 0 ? '#DC2626' : '#10B981'}">
                ${formatCurrency(Math.abs(totalLiquidacion))}
              </span>
            </p>
            ${garantiaADevolver > 0 ? `<p><strong>Garantía a devolver:</strong> ${formatCurrency(garantiaADevolver)}</p>` : ''}
          </div>
        `,
        confirmButtonText: 'Ver Detalle'
      }).then(() => {
        verDetalle(liquidacion)
      })

      cargarLiquidaciones()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo calcular la liquidación', 'error')
    }
  }

  function verDetalle(liquidacion: Liquidacion) {
    const esDeuda = liquidacion.total_liquidacion >= 0

    Swal.fire({
      title: 'Detalle de Liquidación',
      html: `
        <div style="text-align: left; max-height: 400px; overflow-y: auto;">
          <div style="background: #F3F4F6; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <p style="margin: 0;"><strong>${liquidacion.conductor_nombre}</strong></p>
            <p style="margin: 4px 0 0; font-size: 12px; color: #6B7280;">
              DNI: ${liquidacion.conductor_dni} | Vehículo: ${liquidacion.vehiculo_patente || '-'}
            </p>
            <p style="margin: 4px 0 0; font-size: 12px; color: #6B7280;">
              Fecha corte: ${formatDate(liquidacion.fecha_corte)} | Días: ${liquidacion.dias_trabajados}/7
            </p>
          </div>

          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr style="background: #FEE2E2;">
              <td colspan="2" style="padding: 8px; font-weight: 600; color: #991B1B;">CARGOS</td>
            </tr>
            <tr>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB;">Alquiler proporcional (${liquidacion.dias_trabajados} días)</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(liquidacion.alquiler_proporcional)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB;">Garantía proporcional</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(liquidacion.garantia_proporcional)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB;">Peajes pendientes</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(liquidacion.peajes_pendientes)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB;">Excesos KM</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(liquidacion.excesos_km)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB;">Saldo anterior</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(liquidacion.saldo_anterior)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB;">Mora acumulada</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(liquidacion.mora_acumulada)}</td>
            </tr>
            <tr style="font-weight: 600;">
              <td style="padding: 8px;">Subtotal Cargos</td>
              <td style="padding: 8px; text-align: right; color: #DC2626;">${formatCurrency(liquidacion.subtotal_cargos)}</td>
            </tr>

            <tr style="background: #D1FAE5;">
              <td colspan="2" style="padding: 8px; font-weight: 600; color: #065F46;">DESCUENTOS</td>
            </tr>
            <tr>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB;">Tickets a favor</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(liquidacion.tickets_favor)}</td>
            </tr>
            <tr style="font-weight: 600;">
              <td style="padding: 8px;">Subtotal Descuentos</td>
              <td style="padding: 8px; text-align: right; color: #10B981;">${formatCurrency(liquidacion.subtotal_descuentos)}</td>
            </tr>

            <tr style="background: ${esDeuda ? '#FEE2E2' : '#D1FAE5'};">
              <td style="padding: 10px; font-weight: 700; font-size: 14px;">
                TOTAL A ${esDeuda ? 'COBRAR' : 'DEVOLVER'}
              </td>
              <td style="padding: 10px; text-align: right; font-weight: 700; font-size: 16px; color: ${esDeuda ? '#DC2626' : '#10B981'};">
                ${formatCurrency(Math.abs(liquidacion.total_liquidacion))}
              </td>
            </tr>
          </table>

          <div style="margin-top: 16px; padding: 12px; background: #DBEAFE; border-radius: 8px;">
            <p style="margin: 0; font-weight: 600; color: #1E40AF;">Garantía Acumulada</p>
            <p style="margin: 4px 0 0; font-size: 13px; color: #1E40AF;">
              Cuotas pagadas: ${liquidacion.garantia_cuotas_pagadas} | Total pagado: ${formatCurrency(liquidacion.garantia_total_pagada)}
            </p>
            ${liquidacion.garantia_a_devolver > 0 ? `
              <p style="margin: 4px 0 0; font-size: 13px; font-weight: 600; color: #10B981;">
                A devolver: ${formatCurrency(liquidacion.garantia_a_devolver)}
              </p>
            ` : ''}
          </div>

          ${liquidacion.notas ? `
            <div style="margin-top: 12px; padding: 10px; background: #F3F4F6; border-radius: 6px;">
              <p style="margin: 0; font-size: 12px; color: #6B7280;"><strong>Notas:</strong> ${liquidacion.notas}</p>
            </div>
          ` : ''}
        </div>
      `,
      width: 520,
      showCancelButton: true,
      confirmButtonText: 'Exportar PDF',
      cancelButtonText: 'Cerrar',
      confirmButtonColor: '#3B82F6'
    }).then((result) => {
      if (result.isConfirmed) {
        exportarLiquidacion(liquidacion)
      }
    })
  }

  async function exportarLiquidacion(liquidacion: Liquidacion) {
    const wb = XLSX.utils.book_new()

    const data = [
      ['LIQUIDACIÓN DE CONDUCTOR'],
      [''],
      ['Conductor:', liquidacion.conductor_nombre],
      ['DNI:', liquidacion.conductor_dni],
      ['CUIT:', liquidacion.conductor_cuit || '-'],
      ['Vehículo:', liquidacion.vehiculo_patente || '-'],
      ['Tipo:', liquidacion.tipo_alquiler || '-'],
      [''],
      ['Fecha Liquidación:', formatDate(liquidacion.fecha_liquidacion)],
      ['Fecha Corte:', formatDate(liquidacion.fecha_corte)],
      ['Días Trabajados:', `${liquidacion.dias_trabajados}/7`],
      [''],
      ['CONCEPTO', 'MONTO'],
      ['--- CARGOS ---', ''],
      ['Alquiler Proporcional', liquidacion.alquiler_proporcional],
      ['Garantía Proporcional', liquidacion.garantia_proporcional],
      ['Peajes Pendientes', liquidacion.peajes_pendientes],
      ['Excesos KM', liquidacion.excesos_km],
      ['Penalidades', liquidacion.penalidades],
      ['Saldo Anterior', liquidacion.saldo_anterior],
      ['Mora Acumulada', liquidacion.mora_acumulada],
      ['SUBTOTAL CARGOS', liquidacion.subtotal_cargos],
      [''],
      ['--- DESCUENTOS ---', ''],
      ['Tickets a Favor', liquidacion.tickets_favor],
      ['SUBTOTAL DESCUENTOS', liquidacion.subtotal_descuentos],
      [''],
      ['TOTAL LIQUIDACIÓN', liquidacion.total_liquidacion],
      [''],
      ['--- GARANTÍA ---', ''],
      ['Cuotas Pagadas', liquidacion.garantia_cuotas_pagadas],
      ['Total Pagado', liquidacion.garantia_total_pagada],
      ['A Devolver', liquidacion.garantia_a_devolver],
      [''],
      ['Notas:', liquidacion.notas || '-']
    ]

    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 25 }, { wch: 15 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Liquidación')

    const nombreArchivo = `Liquidacion_${liquidacion.conductor_nombre.replace(/\s/g, '_')}_${format(new Date(liquidacion.fecha_liquidacion), 'yyyyMMdd')}.xlsx`
    XLSX.writeFile(wb, nombreArchivo)

    Swal.fire({
      icon: 'success',
      title: 'Exportado',
      text: `Se descargó: ${nombreArchivo}`,
      timer: 2000,
      showConfirmButton: false
    })
  }

  async function aprobarLiquidacion(liquidacion: Liquidacion) {
    const result = await Swal.fire({
      title: 'Aprobar Liquidación',
      text: `¿Confirma aprobar la liquidación de ${liquidacion.conductor_nombre}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Aprobar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10B981'
    })

    if (!result.isConfirmed) return

    try {
      const { data: userData } = await supabase.auth.getUser()

      const { error } = await supabase
        .from('liquidaciones_conductores')
        .update({
          estado: 'aprobado',
          aprobado_por: userData.user?.id,
          aprobado_por_name: userData.user?.email,
          fecha_aprobacion: new Date().toISOString()
        })
        .eq('id', liquidacion.id)

      if (error) throw error

      // Actualizar estado del conductor a inactivo
      await supabase
        .from('conductores')
        .update({
          estado: 'INACTIVO',
          fecha_baja: liquidacion.fecha_corte,
          motivo_baja: liquidacion.notas
        })
        .eq('id', liquidacion.conductor_id)

      // Finalizar asignación
      await supabase
        .from('asignaciones')
        .update({ estado: 'finalizada' })
        .eq('conductor_id', liquidacion.conductor_id)
        .eq('estado', 'activa')

      Swal.fire({
        icon: 'success',
        title: 'Liquidación Aprobada',
        text: 'El conductor ha sido dado de baja',
        timer: 2000,
        showConfirmButton: false
      })

      cargarLiquidaciones()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo aprobar', 'error')
    }
  }

  async function eliminarLiquidacion(liquidacion: Liquidacion) {
    if (liquidacion.estado === 'aprobado' || liquidacion.estado === 'pagado') {
      Swal.fire('No permitido', 'No se puede eliminar una liquidación aprobada o pagada', 'warning')
      return
    }

    const result = await Swal.fire({
      title: '¿Eliminar liquidación?',
      text: `Se eliminará la liquidación de ${liquidacion.conductor_nombre}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#DC2626',
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await supabase
        .from('liquidaciones_conductores')
        .delete()
        .eq('id', liquidacion.id)

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'Eliminada',
        timer: 1500,
        showConfirmButton: false
      })

      cargarLiquidaciones()
    } catch (error: any) {
      Swal.fire('Error', error.message, 'error')
    }
  }

  // Lista de conductores únicos para filtro
  const conductoresUnicos = useMemo(() =>
    [...new Set(liquidaciones.map(l => l.conductor_nombre))].sort()
  , [liquidaciones])

  const conductoresFiltrados = useMemo(() => {
    if (!conductorSearch) return conductoresUnicos
    return conductoresUnicos.filter(c => c.toLowerCase().includes(conductorSearch.toLowerCase()))
  }, [conductoresUnicos, conductorSearch])

  const toggleConductorFilter = (val: string) => setConductorFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )

  // Filtrar liquidaciones
  const liquidacionesFiltradas = useMemo(() => {
    return liquidaciones.filter(l => {
      if (filtroEstado !== 'todos' && l.estado !== filtroEstado) return false
      if (conductorFilter.length > 0 && !conductorFilter.includes(l.conductor_nombre)) return false
      return true
    })
  }, [liquidaciones, filtroEstado, conductorFilter])

  // Stats
  const stats = useMemo(() => {
    const total = liquidaciones.length
    const pendientes = liquidaciones.filter(l => l.estado === 'calculado').length
    const aprobadas = liquidaciones.filter(l => l.estado === 'aprobado').length
    const montoCobrar = liquidaciones
      .filter(l => l.total_liquidacion > 0)
      .reduce((sum, l) => sum + l.total_liquidacion, 0)
    const montoDevolver = liquidaciones
      .filter(l => l.total_liquidacion < 0)
      .reduce((sum, l) => sum + Math.abs(l.total_liquidacion), 0)

    return { total, pendientes, aprobadas, montoCobrar, montoDevolver }
  }, [liquidaciones])

  const columns = useMemo<ColumnDef<Liquidacion>[]>(() => [
    {
      accessorKey: 'fecha_liquidacion',
      header: 'Fecha',
      cell: ({ row }) => formatDate(row.original.fecha_liquidacion)
    },
    {
      accessorKey: 'conductor_nombre',
      header: () => (
        <div className="dt-column-filter">
          <span>Conductor {conductorFilter.length > 0 && `(${conductorFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${conductorFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'conductor' ? null : 'conductor') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'conductor' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                placeholder="Buscar..."
                value={conductorSearch}
                onChange={(e) => setConductorSearch(e.target.value)}
                className="dt-column-filter-input"
              />
              <div className="dt-excel-filter-list">
                {conductoresFiltrados.map(c => (
                  <label key={c} className={`dt-column-filter-checkbox ${conductorFilter.includes(c) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={conductorFilter.includes(c)} onChange={() => toggleConductorFilter(c)} />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
              {conductorFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => { setConductorFilter([]); setConductorSearch('') }}>
                  Limpiar ({conductorFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.conductor_nombre}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{row.original.conductor_dni}</div>
        </div>
      )
    },
    {
      accessorKey: 'vehiculo_patente',
      header: 'Vehículo',
      cell: ({ row }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
          {row.original.vehiculo_patente || '-'}
        </span>
      )
    },
    {
      accessorKey: 'dias_trabajados',
      header: 'Días',
      cell: ({ row }) => `${row.original.dias_trabajados}/7`
    },
    {
      accessorKey: 'total_liquidacion',
      header: 'Total',
      cell: ({ row }) => {
        const esDeuda = row.original.total_liquidacion >= 0
        return (
          <span style={{
            fontWeight: 600,
            color: esDeuda ? '#DC2626' : '#10B981'
          }}>
            {esDeuda ? '' : '-'}{formatCurrency(Math.abs(row.original.total_liquidacion))}
          </span>
        )
      }
    },
    {
      accessorKey: 'garantia_a_devolver',
      header: 'Garantía Dev.',
      cell: ({ row }) => (
        row.original.garantia_a_devolver > 0 ? (
          <span style={{ color: '#10B981', fontWeight: 500 }}>
            {formatCurrency(row.original.garantia_a_devolver)}
          </span>
        ) : '-'
      )
    },
    {
      accessorKey: 'estado',
      header: 'Estado',
      cell: ({ row }) => {
        const estado = row.original.estado
        const config: Record<string, { color: string; label: string; icon: any }> = {
          borrador: { color: 'gray', label: 'Borrador', icon: FileText },
          calculado: { color: 'yellow', label: 'Calculado', icon: Calculator },
          aprobado: { color: 'green', label: 'Aprobado', icon: CheckCircle },
          pagado: { color: 'blue', label: 'Pagado', icon: DollarSign },
          cancelado: { color: 'red', label: 'Cancelado', icon: Clock }
        }
        const cfg = config[estado] || config.borrador
        const Icon = cfg.icon
        return (
          <span className={`fact-badge fact-badge-${cfg.color}`}>
            <Icon size={12} /> {cfg.label}
          </span>
        )
      }
    },
    {
      id: 'acciones',
      header: '',
      cell: ({ row }) => (
        <div className="fact-table-actions">
          <button
            className="fact-table-btn fact-table-btn-view"
            onClick={() => verDetalle(row.original)}
            title="Ver detalle"
          >
            <Eye size={14} />
          </button>
          {row.original.estado === 'calculado' && (
            <>
              <button
                className="fact-table-btn"
                style={{ color: '#10B981' }}
                onClick={() => aprobarLiquidacion(row.original)}
                title="Aprobar"
              >
                <CheckCircle size={14} />
              </button>
              <button
                className="fact-table-btn fact-table-btn-delete"
                onClick={() => eliminarLiquidacion(row.original)}
                title="Eliminar"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
          {(row.original.estado === 'aprobado' || row.original.estado === 'pagado') && (
            <button
              className="fact-table-btn"
              style={{ color: '#3B82F6' }}
              onClick={() => exportarLiquidacion(row.original)}
              title="Exportar"
            >
              <Download size={14} />
            </button>
          )}
        </div>
      )
    }
  ], [conductorFilter, conductorSearch, conductoresFiltrados, openColumnFilter])

  return (
    <>
      {/* Header */}
      <div className="fact-header">
        <div className="fact-header-left">
          <span className="fact-label">Estado:</span>
          <select
            className="fact-select"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="calculado">Pendientes</option>
            <option value="aprobado">Aprobados</option>
            <option value="pagado">Pagados</option>
          </select>
        </div>
        <div className="fact-header-right">
          <button className="fact-btn-primary" onClick={nuevaLiquidacion}>
            <Plus size={14} />
            Nueva Liquidación
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="fact-stats">
        <div className="fact-stats-grid">
          <div className="fact-stat-card">
            <UserMinus size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.total}</span>
              <span className="fact-stat-label">Total Liquidaciones</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <Clock size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.pendientes}</span>
              <span className="fact-stat-label">Pendientes</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <CheckCircle size={18} className="fact-stat-icon" style={{ color: '#10B981' }} />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.aprobadas}</span>
              <span className="fact-stat-label">Aprobadas</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <DollarSign size={18} className="fact-stat-icon" style={{ color: '#DC2626' }} />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.montoCobrar)}</span>
              <span className="fact-stat-label">Total a Cobrar</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <Shield size={18} className="fact-stat-icon" style={{ color: '#10B981' }} />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.montoDevolver)}</span>
              <span className="fact-stat-label">Total a Devolver</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <DataTable
        data={liquidacionesFiltradas}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar conductor..."
        emptyIcon={<UserMinus size={48} />}
        emptyTitle="Sin liquidaciones"
        emptyDescription="No hay liquidaciones registradas. Use el botón 'Nueva Liquidación' para dar de baja a un conductor."
        pageSize={20}
        pageSizeOptions={[10, 20, 50, 100]}
      />
    </>
  )
}
