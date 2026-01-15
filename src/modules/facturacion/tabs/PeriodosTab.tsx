import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Swal from 'sweetalert2'
import {
  Calendar,
  Lock,
  Unlock,
  Eye,
  Loader2,
  CheckCircle,
  XCircle,
  Play,
  RefreshCw,
  FileText,
  Users,
  DollarSign,
  AlertCircle
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import { formatCurrency } from '../../../types/facturacion.types'
import { format, startOfWeek, endOfWeek, subWeeks, getWeek, getYear, parseISO, differenceInDays, isAfter, isBefore } from 'date-fns'
import { es } from 'date-fns/locale'

// Calcula días trabajados dentro de un período considerando fecha_inicio y fecha_fin de asignación
function calcularDiasTrabajados(
  fechaInicioAsig: string | null,
  fechaFinAsig: string | null,
  fechaInicioPeriodo: string,
  fechaFinPeriodo: string
): { diasTrabajados: number; fechaEfectivaInicio: Date; fechaEfectivaFin: Date } {
  const periodoInicio = parseISO(fechaInicioPeriodo)
  const periodoFin = parseISO(fechaFinPeriodo)

  // Fecha efectiva de inicio: la mayor entre inicio asignación e inicio período
  let fechaEfectivaInicio: Date
  if (fechaInicioAsig) {
    const asigInicio = parseISO(fechaInicioAsig)
    fechaEfectivaInicio = isAfter(asigInicio, periodoInicio) ? asigInicio : periodoInicio
  } else {
    fechaEfectivaInicio = periodoInicio
  }

  // Fecha efectiva de fin: la menor entre fin asignación (si existe) y fin período
  // REGLA: El día de renuncia SÍ se cobra
  let fechaEfectivaFin: Date
  if (fechaFinAsig) {
    const asigFin = parseISO(fechaFinAsig)
    fechaEfectivaFin = isBefore(asigFin, periodoFin) ? asigFin : periodoFin
  } else {
    fechaEfectivaFin = periodoFin
  }

  // Si las fechas no tienen sentido (inicio después de fin), retorna 0
  if (isAfter(fechaEfectivaInicio, fechaEfectivaFin)) {
    return { diasTrabajados: 0, fechaEfectivaInicio, fechaEfectivaFin }
  }

  // +1 porque el día de inicio y el de fin cuentan ambos
  const diasTrabajados = differenceInDays(fechaEfectivaFin, fechaEfectivaInicio) + 1

  return { diasTrabajados: Math.min(diasTrabajados, 7), fechaEfectivaInicio, fechaEfectivaFin }
}

// Tipo para semana con datos de facturación
interface SemanaFacturacion {
  semana: number
  anio: number
  fecha_inicio: string
  fecha_fin: string
  // Datos de la BD (si existe)
  periodo_id: string | null
  estado: 'sin_generar' | 'abierto' | 'cerrado' | 'procesando'
  total_conductores: number
  total_cargos: number
  total_descuentos: number
  total_neto: number
  fecha_cierre: string | null
}

// Genera las últimas N semanas desde hoy
function generarSemanasDelAnio(cantidadSemanas: number = 12): { semana: number; anio: number; inicio: Date; fin: Date }[] {
  const semanas: { semana: number; anio: number; inicio: Date; fin: Date }[] = []
  let fecha = new Date()

  for (let i = 0; i < cantidadSemanas; i++) {
    const inicio = startOfWeek(fecha, { weekStartsOn: 1 }) // Lunes
    const fin = endOfWeek(fecha, { weekStartsOn: 1 }) // Domingo
    const semana = getWeek(inicio, { weekStartsOn: 1 })
    const anio = getYear(inicio)

    semanas.push({ semana, anio, inicio, fin })
    fecha = subWeeks(fecha, 1)
  }

  return semanas
}

export function PeriodosTab() {
  const { profile } = useAuth()
  const [semanas, setSemanas] = useState<SemanaFacturacion[]>([])
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState<string | null>(null) // ID de semana generándose

  useEffect(() => {
    cargarSemanas()
  }, [])

  async function cargarSemanas() {
    setLoading(true)
    try {
      // Generar las últimas 12 semanas
      const semanasBase = generarSemanasDelAnio(12)

      // Cargar períodos existentes de la BD
      const { data: periodos, error } = await supabase
        .from('periodos_facturacion')
        .select('*')
        .order('anio', { ascending: false })
        .order('semana', { ascending: false })

      if (error) throw error

      // Mapear semanas con datos de BD
      const semanasConDatos: SemanaFacturacion[] = semanasBase.map(s => {
        const periodoExistente = ((periodos || []) as any[]).find((p: any) => p.semana === s.semana && p.anio === s.anio)

        return {
          semana: s.semana,
          anio: s.anio,
          fecha_inicio: format(s.inicio, 'yyyy-MM-dd'),
          fecha_fin: format(s.fin, 'yyyy-MM-dd'),
          periodo_id: periodoExistente?.id || null,
          estado: periodoExistente ? periodoExistente.estado : 'sin_generar',
          total_conductores: periodoExistente?.total_conductores || 0,
          total_cargos: periodoExistente?.total_cargos || 0,
          total_descuentos: periodoExistente?.total_descuentos || 0,
          total_neto: periodoExistente?.total_neto || 0,
          fecha_cierre: periodoExistente?.fecha_cierre || null
        }
      })

      setSemanas(semanasConDatos)
    } catch (error) {
      console.error('Error cargando semanas:', error)
      Swal.fire('Error', 'No se pudieron cargar las semanas', 'error')
    } finally {
      setLoading(false)
    }
  }

  // FUNCIÓN PRINCIPAL: Generar facturación para una semana
  async function generarFacturacion(semana: SemanaFacturacion) {
    const result = await Swal.fire({
      title: `<span style="font-size: 18px; font-weight: 600;">Generar Facturación</span>`,
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #111827;">Semana ${semana.semana} - ${semana.anio}</div>
            <div style="color: #6B7280; font-size: 12px; margin-top: 2px;">
              ${format(new Date(semana.fecha_inicio), 'dd/MM/yyyy', { locale: es })} al ${format(new Date(semana.fecha_fin), 'dd/MM/yyyy', { locale: es })}
            </div>
          </div>
          <div style="color: #374151; font-size: 12px; margin-bottom: 8px;">Este proceso:</div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #4B5563;">
              <span style="width: 6px; height: 6px; background: #DC2626; border-radius: 50%; flex-shrink: 0;"></span>
              Procesará todos los conductores activos
            </div>
            <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #4B5563;">
              <span style="width: 6px; height: 6px; background: #DC2626; border-radius: 50%; flex-shrink: 0;"></span>
              Calculará alquiler proporcional <span style="color: #9CA3AF;">(P001/P002)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #4B5563;">
              <span style="width: 6px; height: 6px; background: #DC2626; border-radius: 50%; flex-shrink: 0;"></span>
              Calculará cuota de garantía <span style="color: #9CA3AF;">(P003)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #4B5563;">
              <span style="width: 6px; height: 6px; background: #DC2626; border-radius: 50%; flex-shrink: 0;"></span>
              Aplicará penalidades pendientes <span style="color: #9CA3AF;">(P007)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #4B5563;">
              <span style="width: 6px; height: 6px; background: #DC2626; border-radius: 50%; flex-shrink: 0;"></span>
              Aplicará tickets a favor <span style="color: #9CA3AF;">(P004)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #4B5563;">
              <span style="width: 6px; height: 6px; background: #DC2626; border-radius: 50%; flex-shrink: 0;"></span>
              Aplicará excesos de kilometraje <span style="color: #9CA3AF;">(P006)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #4B5563;">
              <span style="width: 6px; height: 6px; background: #DC2626; border-radius: 50%; flex-shrink: 0;"></span>
              Calculará saldos y mora <span style="color: #9CA3AF;">(P009)</span>
            </div>
          </div>
        </div>
      `,
      icon: 'question',
      iconColor: '#DC2626',
      showCancelButton: true,
      confirmButtonText: 'Generar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#DC2626',
      cancelButtonColor: '#6B7280',
      width: 380,
      customClass: {
        popup: 'swal-compact',
        title: 'swal-title-compact',
        htmlContainer: 'swal-html-compact'
      }
    })

    if (!result.isConfirmed) return

    setGenerando(`${semana.semana}-${semana.anio}`)

    try {
      // 1. Crear o actualizar el período
      let periodoId = semana.periodo_id

      if (!periodoId) {
        // Crear nuevo período
        const { data: nuevoPeriodo, error: errPeriodo } = await (supabase
          .from('periodos_facturacion') as any)
          .insert({
            semana: semana.semana,
            anio: semana.anio,
            fecha_inicio: semana.fecha_inicio,
            fecha_fin: semana.fecha_fin,
            estado: 'procesando',
            created_by_name: profile?.full_name || 'Sistema'
          })
          .select()
          .single()

        if (errPeriodo) throw errPeriodo
        periodoId = (nuevoPeriodo as any).id
      } else {
        // Marcar como procesando
        await (supabase
          .from('periodos_facturacion') as any)
          .update({ estado: 'procesando' })
          .eq('id', periodoId)
      }

      // 2. Obtener conductores con asignaciones (activas o que terminaron dentro del período)
      // Incluye: activas, o las que tienen fecha_fin dentro del período (renuncias)
      const { data: asignaciones, error: errAsig } = await supabase
        .from('asignaciones')
        .select(`
          id,
          codigo,
          horario,
          modalidad,
          conductor_id,
          vehiculo_id,
          fecha_inicio,
          fecha_fin,
          estado,
          conductores:conductor_id(id, nombres, apellidos, numero_dni, numero_cuit),
          vehiculos:vehiculo_id(id, patente)
        `)
        .or(`estado.eq.activa,and(fecha_fin.gte.${semana.fecha_inicio},fecha_fin.lte.${semana.fecha_fin})`)

      if (errAsig) throw errAsig

      if (!asignaciones || asignaciones.length === 0) {
        await (supabase
          .from('periodos_facturacion') as any)
          .update({ estado: 'abierto', total_conductores: 0 })
          .eq('id', periodoId)

        Swal.fire('Aviso', 'No hay conductores activos para facturar', 'warning')
        cargarSemanas()
        return
      }

      // 3. Obtener conceptos (precios)
      const { data: conceptos } = await supabase
        .from('conceptos_nomina')
        .select('*')
        .eq('activo', true)

      const precioTurno = ((conceptos || []) as any[]).find((c: any) => c.codigo === 'P002')?.precio_final || 245000
      const precioCargo = ((conceptos || []) as any[]).find((c: any) => c.codigo === 'P001')?.precio_final || 360000
      const cuotaGarantia = 50000

      // 4. Obtener datos adicionales (penalidades, tickets, etc.)
      const conductorIds = (asignaciones as any[])
        .map((a: any) => a.conductores?.id)
        .filter((id): id is string => !!id)

      const [penalidadesRes, ticketsRes, saldosRes, excesosRes, cabifyRes] = await Promise.all([
        supabase
          .from('penalidades')
          .select('*')
          .in('conductor_id', conductorIds)
          .gte('fecha', semana.fecha_inicio)
          .lte('fecha', semana.fecha_fin)
          .eq('aplicado', false),
        supabase
          .from('tickets_favor')
          .select('*')
          .in('conductor_id', conductorIds)
          .eq('estado', 'aprobado'),
        supabase
          .from('saldos_conductores')
          .select('*')
          .in('conductor_id', conductorIds),
        // Obtener excesos de kilometraje pendientes para este período
        periodoId ? supabase
          .from('excesos_kilometraje')
          .select('*')
          .in('conductor_id', conductorIds)
          .eq('periodo_id', periodoId)
          .eq('aplicado', false) : Promise.resolve({ data: [] }),
        // Obtener peajes de Cabify para el período (P005)
        supabase
          .from('cabify_historico')
          .select('dni, peajes')
          .gte('fecha_inicio', semana.fecha_inicio + 'T00:00:00')
          .lte('fecha_inicio', semana.fecha_fin + 'T23:59:59')
      ])

      const penalidades = penalidadesRes.data || []
      const tickets = ticketsRes.data || []
      const saldos = saldosRes.data || []
      const excesos = excesosRes.data || []

      // Agregar peajes por DNI (de Cabify)
      const peajesMap = new Map<string, number>()
      ;((cabifyRes.data || []) as any[]).forEach((record: any) => {
        if (record.dni && record.peajes) {
          const actual = peajesMap.get(record.dni) || 0
          peajesMap.set(record.dni, actual + (parseFloat(String(record.peajes)) || 0))
        }
      })

      // 5. Eliminar facturación anterior de este período (si existe)
      if (semana.periodo_id) {
        await supabase
          .from('facturacion_detalle')
          .delete()
          .eq('facturacion_id', semana.periodo_id)

        await supabase
          .from('facturacion_conductores')
          .delete()
          .eq('periodo_id', semana.periodo_id)
      }

      // 6. Procesar cada conductor
      let totalCargos = 0
      let totalDescuentos = 0

      for (const asig of (asignaciones as any[])) {
        const conductor = asig.conductores
        const vehiculo = asig.vehiculos

        if (!conductor) continue

        // Calcular días trabajados en el período (prorrateo)
        const { diasTrabajados } = calcularDiasTrabajados(
          asig.fecha_inicio,
          asig.fecha_fin,
          semana.fecha_inicio,
          semana.fecha_fin
        )

        // Si no trabajó ningún día en este período, saltar
        if (diasTrabajados === 0) continue

        const factorProporcional = diasTrabajados / 7
        const tipoAlquiler = asig.horario === 'CARGO' ? 'CARGO' : 'TURNO'
        const precioSemanalCompleto = tipoAlquiler === 'CARGO' ? precioCargo : precioTurno

        // Aplicar prorrateo al alquiler
        const precioSemanal = Math.round(precioSemanalCompleto * factorProporcional)
        // Garantía también se prorratea
        const cuotaGarantiaProporcional = Math.round(cuotaGarantia * factorProporcional)

        // Penalidades del conductor
        const pensConductor = (penalidades as any[]).filter((p: any) => p.conductor_id === conductor.id)
        const totalPenalidades = pensConductor.reduce((sum: number, p: any) => sum + (p.monto || 0), 0)

        // Tickets del conductor (descuentos)
        const ticketsConductor = (tickets as any[]).filter((t: any) => t.conductor_id === conductor.id)
        const totalTickets = ticketsConductor.reduce((sum: number, t: any) => sum + (t.monto || 0), 0)

        // Excesos de kilometraje del conductor (P006)
        const excesosConductor = (excesos as any[]).filter((e: any) => e.conductor_id === conductor.id)
        const totalExcesos = excesosConductor.reduce((sum: number, e: any) => sum + (e.monto_total || 0), 0)

        // Peajes del conductor desde Cabify (P005)
        const totalPeajes = peajesMap.get(conductor.numero_dni) || 0

        // Saldo anterior
        const saldoConductor = (saldos as any[]).find((s: any) => s.conductor_id === conductor.id)
        const saldoAnterior = saldoConductor?.saldo_actual || 0
        const diasMora = saldoAnterior > 0 ? Math.min(saldoConductor?.dias_mora || 0, 7) : 0
        const montoMora = saldoAnterior > 0 ? saldoAnterior * 0.01 * diasMora : 0

        // Totales (incluye excesos de km y peajes de Cabify) - usa garantía prorrateada
        const subtotalCargos = precioSemanal + cuotaGarantiaProporcional + totalPenalidades + totalExcesos + totalPeajes + montoMora
        const subtotalDescuentos = totalTickets
        const subtotalNeto = subtotalCargos - subtotalDescuentos
        const totalAPagar = subtotalNeto + saldoAnterior

        totalCargos += subtotalCargos
        totalDescuentos += subtotalDescuentos

        // Insertar facturación del conductor
        const { data: factConductor, error: errFact } = await (supabase
          .from('facturacion_conductores') as any)
          .insert({
            periodo_id: periodoId,
            conductor_id: conductor.id,
            conductor_nombre: `${conductor.nombres} ${conductor.apellidos}`,
            conductor_dni: conductor.numero_dni,
            conductor_cuit: conductor.numero_cuit,
            vehiculo_id: vehiculo?.id,
            vehiculo_patente: vehiculo?.patente,
            tipo_alquiler: tipoAlquiler,
            turnos_base: 7,
            turnos_cobrados: diasTrabajados, // Días realmente trabajados
            factor_proporcional: factorProporcional, // Factor de prorrateo (ej: 5/7 = 0.714)
            subtotal_alquiler: precioSemanal, // Ya prorrateado
            subtotal_garantia: cuotaGarantiaProporcional, // Ya prorrateada
            subtotal_cargos: subtotalCargos,
            subtotal_descuentos: subtotalDescuentos,
            subtotal_neto: subtotalNeto,
            saldo_anterior: saldoAnterior,
            dias_mora: diasMora,
            monto_mora: montoMora,
            total_a_pagar: totalAPagar,
            estado: 'calculado'
          })
          .select()
          .single()

        if (errFact) {
          console.error('Error insertando facturación:', errFact)
          continue
        }

        // Insertar detalle de alquiler (con prorrateo)
        const descripcionAlquiler = diasTrabajados < 7
          ? `${tipoAlquiler === 'CARGO' ? 'Alquiler a Cargo' : 'Alquiler a Turno'} (${diasTrabajados}/7 días)`
          : tipoAlquiler === 'CARGO' ? 'Alquiler a Cargo' : 'Alquiler a Turno'

        await (supabase.from('facturacion_detalle') as any).insert({
          facturacion_id: (factConductor as any).id,
          concepto_codigo: tipoAlquiler === 'CARGO' ? 'P001' : 'P002',
          concepto_descripcion: descripcionAlquiler,
          cantidad: diasTrabajados, // Días realmente trabajados
          precio_unitario: precioSemanalCompleto / 7, // Precio diario sin prorratear
          subtotal: precioSemanal, // Ya prorrateado
          total: precioSemanal,
          es_descuento: false
        })

        // Insertar detalle de garantía (con prorrateo)
        const descripcionGarantia = diasTrabajados < 7
          ? `Cuota de Garantía (${diasTrabajados}/7 días)`
          : 'Cuota de Garantía'

        await (supabase.from('facturacion_detalle') as any).insert({
          facturacion_id: (factConductor as any).id,
          concepto_codigo: 'P003',
          concepto_descripcion: descripcionGarantia,
          cantidad: diasTrabajados, // Días realmente trabajados
          precio_unitario: cuotaGarantia / 7, // Precio diario
          subtotal: cuotaGarantiaProporcional,
          total: cuotaGarantiaProporcional,
          es_descuento: false
        })

        // Insertar penalidades como detalle
        for (const pen of pensConductor) {
          await (supabase.from('facturacion_detalle') as any).insert({
            facturacion_id: (factConductor as any).id,
            concepto_codigo: 'P007',
            concepto_descripcion: `Penalidad: ${(pen as any).detalle || 'Sin detalle'}`,
            cantidad: 1,
            precio_unitario: (pen as any).monto,
            subtotal: (pen as any).monto,
            total: (pen as any).monto,
            es_descuento: false,
            referencia_id: (pen as any).id,
            referencia_tipo: 'penalidad'
          })

          // Marcar penalidad como aplicada
          await (supabase
            .from('penalidades') as any)
            .update({ aplicado: true })
            .eq('id', (pen as any).id)
        }

        // Insertar tickets como detalle (descuentos)
        for (const ticket of ticketsConductor) {
          await (supabase.from('facturacion_detalle') as any).insert({
            facturacion_id: (factConductor as any).id,
            concepto_codigo: 'P004',
            concepto_descripcion: `Ticket: ${(ticket as any).descripcion || (ticket as any).tipo}`,
            cantidad: 1,
            precio_unitario: (ticket as any).monto,
            subtotal: (ticket as any).monto,
            total: (ticket as any).monto,
            es_descuento: true,
            referencia_id: (ticket as any).id,
            referencia_tipo: 'ticket'
          })

          // Marcar ticket como aplicado
          await (supabase
            .from('tickets_favor') as any)
            .update({ estado: 'aplicado', periodo_aplicado_id: periodoId, fecha_aplicacion: new Date().toISOString() })
            .eq('id', (ticket as any).id)
        }

        // Insertar excesos de kilometraje como detalle (P006)
        for (const exceso of excesosConductor) {
          await (supabase.from('facturacion_detalle') as any).insert({
            facturacion_id: (factConductor as any).id,
            concepto_codigo: 'P006',
            concepto_descripcion: `Exceso KM: ${(exceso as any).km_exceso} km (${(exceso as any).rango})`,
            cantidad: 1,
            precio_unitario: (exceso as any).monto_base,
            iva_porcentaje: (exceso as any).iva_porcentaje || 21,
            iva_monto: (exceso as any).iva_monto,
            subtotal: (exceso as any).monto_base,
            total: (exceso as any).monto_total,
            es_descuento: false,
            referencia_id: (exceso as any).id,
            referencia_tipo: 'exceso_km'
          })

          // Marcar exceso como aplicado
          await (supabase
            .from('excesos_kilometraje') as any)
            .update({ aplicado: true, fecha_aplicacion: new Date().toISOString() })
            .eq('id', (exceso as any).id)
        }

        // Insertar peajes de Cabify como detalle (P005)
        if (totalPeajes > 0) {
          await (supabase.from('facturacion_detalle') as any).insert({
            facturacion_id: (factConductor as any).id,
            concepto_codigo: 'P005',
            concepto_descripcion: 'Telepeajes (Cabify)',
            cantidad: 1,
            precio_unitario: totalPeajes,
            subtotal: totalPeajes,
            total: totalPeajes,
            es_descuento: false,
            referencia_tipo: 'cabify_peajes'
          })
        }

        // Insertar mora si existe
        if (montoMora > 0) {
          await (supabase.from('facturacion_detalle') as any).insert({
            facturacion_id: (factConductor as any).id,
            concepto_codigo: 'P009',
            concepto_descripcion: `Mora (${diasMora} días al 1%)`,
            cantidad: diasMora,
            precio_unitario: saldoAnterior * 0.01,
            subtotal: montoMora,
            total: montoMora,
            es_descuento: false
          })
        }
      }

      // 7. Actualizar totales del período
      await (supabase
        .from('periodos_facturacion') as any)
        .update({
          estado: 'abierto',
          total_conductores: asignaciones.length,
          total_cargos: totalCargos,
          total_descuentos: totalDescuentos,
          total_neto: totalCargos - totalDescuentos
        })
        .eq('id', periodoId)

      Swal.fire({
        icon: 'success',
        title: 'Facturación Generada',
        html: `
          <p>Semana ${semana.semana} - ${semana.anio}</p>
          <p><strong>${asignaciones.length}</strong> conductores procesados</p>
          <p>Total: <strong>${formatCurrency(totalCargos - totalDescuentos)}</strong></p>
        `,
        timer: 3000,
        showConfirmButton: false
      })

      cargarSemanas()
    } catch (error: any) {
      console.error('Error generando facturación:', error)
      Swal.fire('Error', error.message || 'No se pudo generar la facturación', 'error')
    } finally {
      setGenerando(null)
    }
  }

  async function cerrarPeriodo(semana: SemanaFacturacion) {
    if (!semana.periodo_id) return

    const result = await Swal.fire({
      title: 'Cerrar Período',
      html: `
        <p>¿Cerrar el período <strong>Semana ${semana.semana} - ${semana.anio}</strong>?</p>
        <p style="color: #DC2626; margin-top: 10px;">Esta acción bloqueará las ediciones.</p>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#DC2626',
      confirmButtonText: 'Sí, cerrar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await (supabase
        .from('periodos_facturacion') as any)
        .update({
          estado: 'cerrado',
          fecha_cierre: new Date().toISOString(),
          cerrado_por_name: profile?.full_name || 'Sistema'
        })
        .eq('id', semana.periodo_id)

      if (error) throw error

      Swal.fire({ icon: 'success', title: 'Período Cerrado', timer: 1500, showConfirmButton: false })
      cargarSemanas()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo cerrar el período', 'error')
    }
  }

  async function reabrirPeriodo(semana: SemanaFacturacion) {
    if (!semana.periodo_id) return

    const result = await Swal.fire({
      title: 'Reabrir Período',
      text: `¿Reabrir el período Semana ${semana.semana} - ${semana.anio}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, reabrir',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await (supabase
        .from('periodos_facturacion') as any)
        .update({ estado: 'abierto', fecha_cierre: null, cerrado_por_name: null })
        .eq('id', semana.periodo_id)

      if (error) throw error

      Swal.fire({ icon: 'success', title: 'Período Reabierto', timer: 1500, showConfirmButton: false })
      cargarSemanas()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo reabrir el período', 'error')
    }
  }

  async function verDetallePeriodo(semana: SemanaFacturacion) {
    if (!semana.periodo_id) return

    // Cargar facturaciones del período
    const { data: facturaciones, error } = await supabase
      .from('facturacion_conductores')
      .select('*')
      .eq('periodo_id', semana.periodo_id)
      .order('conductor_nombre')

    if (error) {
      Swal.fire('Error', 'No se pudo cargar el detalle', 'error')
      return
    }

    const conductores = facturaciones || []
    const topDeudores = [...conductores]
      .sort((a: any, b: any) => b.total_a_pagar - a.total_a_pagar)
      .slice(0, 5)

    Swal.fire({
      title: `Semana ${semana.semana} - ${semana.anio}`,
      html: `
        <div style="text-align: left; max-height: 400px; overflow-y: auto;">
          <div style="background: #F3F4F6; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
              <div><span style="color: #6B7280;">Período:</span> <strong>${format(new Date(semana.fecha_inicio), 'dd/MM', { locale: es })} - ${format(new Date(semana.fecha_fin), 'dd/MM/yyyy', { locale: es })}</strong></div>
              <div><span style="color: #6B7280;">Estado:</span> <strong style="text-transform: uppercase; color: ${semana.estado === 'cerrado' ? '#DC2626' : '#059669'};">${semana.estado}</strong></div>
              <div><span style="color: #6B7280;">Conductores:</span> <strong>${semana.total_conductores}</strong></div>
              <div><span style="color: #6B7280;">Total Neto:</span> <strong style="color: #DC2626;">${formatCurrency(semana.total_neto)}</strong></div>
            </div>
          </div>

          <div style="font-weight: 600; margin-bottom: 8px; font-size: 13px;">Top 5 - Mayor facturación:</div>
          <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
            <thead>
              <tr style="background: #F9FAFB; border-bottom: 1px solid #E5E7EB;">
                <th style="padding: 8px; text-align: left;">Conductor</th>
                <th style="padding: 8px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${topDeudores.map((c: any) => `
                <tr style="border-bottom: 1px solid #F3F4F6;">
                  <td style="padding: 8px;">
                    <div style="font-weight: 500;">${c.conductor_nombre}</div>
                    <div style="font-size: 11px; color: #6B7280;">${c.vehiculo_patente || '-'}</div>
                  </td>
                  <td style="padding: 8px; text-align: right; font-weight: 600; color: ${c.total_a_pagar < 0 ? '#DC2626' : '#059669'};">
                    ${formatCurrency(c.total_a_pagar)}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          ${semana.fecha_cierre ? `
            <div style="margin-top: 12px; font-size: 11px; color: #6B7280;">
              Cerrado el ${format(new Date(semana.fecha_cierre), 'dd/MM/yyyy HH:mm', { locale: es })}
            </div>
          ` : ''}
        </div>
      `,
      width: 500,
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#6B7280'
    })
  }

  const columns = useMemo<ColumnDef<SemanaFacturacion>[]>(() => [
    {
      accessorKey: 'semana',
      header: 'Semana',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-gray-400" />
          <div>
            <div className="font-semibold">Semana {row.original.semana}</div>
            <div className="text-xs text-gray-500">{row.original.anio}</div>
          </div>
        </div>
      )
    },
    {
      id: 'fechas',
      header: 'Período',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {format(new Date(row.original.fecha_inicio), 'dd/MM', { locale: es })} - {format(new Date(row.original.fecha_fin), 'dd/MM', { locale: es })}
        </span>
      )
    },
    {
      accessorKey: 'estado',
      header: 'Estado',
      cell: ({ row }) => {
        const estado = row.original.estado
        if (estado === 'sin_generar') {
          return (
            <span className="fact-badge fact-badge-gray">
              <AlertCircle size={12} style={{ marginRight: 4 }} />
              Sin generar
            </span>
          )
        } else if (estado === 'abierto') {
          return (
            <span className="fact-badge fact-badge-green">
              <Unlock size={12} style={{ marginRight: 4 }} />
              Abierto
            </span>
          )
        } else if (estado === 'cerrado') {
          return (
            <span className="fact-badge fact-badge-red">
              <Lock size={12} style={{ marginRight: 4 }} />
              Cerrado
            </span>
          )
        } else {
          return (
            <span className="fact-badge fact-badge-yellow">
              <Loader2 size={12} className="spinning" style={{ marginRight: 4 }} />
              Procesando
            </span>
          )
        }
      }
    },
    {
      accessorKey: 'total_conductores',
      header: 'Conductores',
      cell: ({ row }) => (
        <span className={row.original.total_conductores > 0 ? 'font-medium' : 'text-gray-400'}>
          {row.original.total_conductores || '-'}
        </span>
      )
    },
    {
      accessorKey: 'total_cargos',
      header: 'Cargos',
      cell: ({ row }) => (
        <span className={`fact-precio ${row.original.total_cargos > 0 ? '' : 'text-gray-400'}`}>
          {row.original.total_cargos > 0 ? formatCurrency(row.original.total_cargos) : '-'}
        </span>
      )
    },
    {
      accessorKey: 'total_descuentos',
      header: 'Descuentos',
      cell: ({ row }) => (
        <span className={`fact-precio ${row.original.total_descuentos > 0 ? 'text-green-600' : 'text-gray-400'}`}>
          {row.original.total_descuentos > 0 ? `-${formatCurrency(row.original.total_descuentos)}` : '-'}
        </span>
      )
    },
    {
      accessorKey: 'total_neto',
      header: 'Total Neto',
      cell: ({ row }) => (
        <span className={`fact-precio font-bold ${row.original.total_neto > 0 ? '' : 'text-gray-400'}`}>
          {row.original.total_neto > 0 ? formatCurrency(row.original.total_neto) : '-'}
        </span>
      )
    },
    {
      id: 'acciones',
      header: '',
      cell: ({ row }) => {
        const sem = row.original
        const isGenerando = generando === `${sem.semana}-${sem.anio}`

        return (
          <div className="fact-table-actions">
            {sem.estado === 'sin_generar' ? (
              <button
                className="fact-btn fact-btn-primary"
                onClick={() => generarFacturacion(sem)}
                disabled={isGenerando}
                title="Generar Facturación"
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                {isGenerando ? (
                  <Loader2 size={14} className="spinning" />
                ) : (
                  <Play size={14} />
                )}
                {isGenerando ? 'Generando...' : 'Generar'}
              </button>
            ) : (
              <>
                <button
                  className="fact-table-btn fact-table-btn-view"
                  onClick={() => verDetallePeriodo(sem)}
                  data-tooltip="Ver detalle"
                >
                  <Eye size={14} />
                </button>
                {sem.estado === 'abierto' && (
                  <>
                    <button
                      className="fact-table-btn fact-table-btn-edit"
                      onClick={() => generarFacturacion(sem)}
                      data-tooltip="Recalcular"
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      className="fact-table-btn fact-table-btn-delete"
                      onClick={() => cerrarPeriodo(sem)}
                      data-tooltip="Cerrar período"
                    >
                      <Lock size={14} />
                    </button>
                  </>
                )}
                {sem.estado === 'cerrado' && (
                  <button
                    className="fact-table-btn fact-table-btn-success"
                    onClick={() => reabrirPeriodo(sem)}
                    data-tooltip="Reabrir período"
                  >
                    <Unlock size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        )
      }
    }
  ], [generando])

  // Stats
  const stats = useMemo(() => {
    const generados = semanas.filter(s => s.estado !== 'sin_generar')
    const abiertos = semanas.filter(s => s.estado === 'abierto').length
    const cerrados = semanas.filter(s => s.estado === 'cerrado').length
    const totalNeto = semanas.reduce((sum, s) => sum + (s.total_neto || 0), 0)
    const totalConductores = semanas.reduce((sum, s) => sum + (s.total_conductores || 0), 0)

    return {
      total: semanas.length,
      generados: generados.length,
      abiertos,
      cerrados,
      totalNeto,
      totalConductores
    }
  }, [semanas])

  return (
    <>
      {/* Stats */}
      <div className="fact-stats">
        <div className="fact-stats-grid">
          <div className="fact-stat-card">
            <Calendar size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.generados}/{stats.total}</span>
              <span className="fact-stat-label">Semanas Generadas</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <CheckCircle size={18} className="fact-stat-icon" style={{ color: '#059669' }} />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.abiertos}</span>
              <span className="fact-stat-label">Abiertos</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <XCircle size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.cerrados}</span>
              <span className="fact-stat-label">Cerrados</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <Users size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.totalConductores}</span>
              <span className="fact-stat-label">Conductores Facturados</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <DollarSign size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.totalNeto)}</span>
              <span className="fact-stat-label">Total Facturado</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de semanas */}
      <DataTable
        data={semanas}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar semana..."
        emptyIcon={<FileText size={48} />}
        emptyTitle="Sin semanas"
        emptyDescription="No hay semanas para mostrar"
        pageSize={12}
        pageSizeOptions={[12, 24, 52]}
      />
    </>
  )
}
