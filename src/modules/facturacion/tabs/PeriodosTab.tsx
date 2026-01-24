import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'
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
import { format, startOfWeek, endOfWeek, subWeeks, getWeek, getYear, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

// Tipo para conductor procesado con sus días por modalidad
interface ConductorProcesado {
  conductor_id: string
  conductor_nombre: string
  conductor_dni: string | null
  conductor_cuit: string | null
  vehiculo_id: string | null
  vehiculo_patente: string | null
  // Días por modalidad (para prorrateo cuando hay cambios)
  dias_turno: number
  dias_cargo: number
  total_dias: number
  // Primera modalidad (para determinar orden de facturación)
  modalidad_inicial: 'TURNO' | 'CARGO'
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
      // Generar las próximas semanas sin generar (para poder crearlas)
      const semanasBase = generarSemanasDelAnio(4) // Solo las últimas 4 semanas para nuevas

      // Cargar TODOS los períodos existentes de la BD
      const { data: periodos, error } = await supabase
        .from('periodos_facturacion')
        .select('*')
        .order('anio', { ascending: false })
        .order('semana', { ascending: false })

      if (error) throw error

      // Crear mapa de períodos existentes por semana-año
      const periodosMap = new Map<string, any>()
      for (const p of ((periodos || []) as any[])) {
        periodosMap.set(`${p.semana}-${p.anio}`, p)
      }

      // Combinar: períodos existentes + semanas recientes sin generar
      const semanasConDatos: SemanaFacturacion[] = []
      const semanasAgregadas = new Set<string>()

      // Primero agregar semanas base (recientes) para permitir generar nuevas
      for (const s of semanasBase) {
        const key = `${s.semana}-${s.anio}`
        const periodoExistente = periodosMap.get(key)

        semanasConDatos.push({
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
        })
        semanasAgregadas.add(key)
      }

      // Luego agregar todos los períodos existentes que no estén ya
      for (const p of ((periodos || []) as any[])) {
        const key = `${p.semana}-${p.anio}`
        if (!semanasAgregadas.has(key)) {
          semanasConDatos.push({
            semana: p.semana,
            anio: p.anio,
            fecha_inicio: p.fecha_inicio,
            fecha_fin: p.fecha_fin,
            periodo_id: p.id,
            estado: p.estado,
            total_conductores: p.total_conductores || 0,
            total_cargos: p.total_cargos || 0,
            total_descuentos: p.total_descuentos || 0,
            total_neto: p.total_neto || 0,
            fecha_cierre: p.fecha_cierre || null
          })
        }
      }

      // Ordenar por año desc, semana desc
      semanasConDatos.sort((a, b) => {
        if (a.anio !== b.anio) return b.anio - a.anio
        return b.semana - a.semana
      })

      setSemanas(semanasConDatos)
    } catch (error) {
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
              Procesará todos los conductores con asignación activa
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

      // 2. NUEVO: Obtener conductores desde conductores_semana_facturacion (FUENTE DE VERDAD)
      const semanaNum = getWeek(parseISO(semana.fecha_inicio), { weekStartsOn: 1 })
      const anioNum = getYear(parseISO(semana.fecha_inicio))
      
      const { data: conductoresControl, error: errControl } = await (supabase
        .from('conductores_semana_facturacion') as any)
        .select('numero_dni, estado, patente, modalidad, valor_alquiler')
        .eq('semana', semanaNum)
        .eq('anio', anioNum)

      if (errControl) throw errControl

      if (!conductoresControl || conductoresControl.length === 0) {
        await (supabase
          .from('periodos_facturacion') as any)
          .update({ estado: 'abierto', total_conductores: 0 })
          .eq('id', periodoId)

        Swal.fire('Aviso', 'No hay conductores en la tabla de control para esta semana', 'warning')
        cargarSemanas()
        return
      }

      // 3. Obtener datos de conductores desde tabla conductores
      const dnisControl = conductoresControl.map((c: any) => c.numero_dni)
      
      const { data: conductoresData } = await supabase
        .from('conductores')
        .select('id, nombres, apellidos, numero_dni, numero_cuit')
        .in('numero_dni', dnisControl)

      // Crear mapa de conductores por DNI
      const conductoresMap = new Map((conductoresData || []).map((c: any) => [c.numero_dni, c]))

      // 4. Procesar conductores desde tabla de control
      const conductoresProcesados: ConductorProcesado[] = []

      for (const control of conductoresControl) {
        const conductorData = conductoresMap.get(control.numero_dni)
        
        if (!conductorData) {
          // Conductor no existe en la tabla conductores, saltar
          continue
        }

        // Usar datos de la tabla de control
        const modalidad = control.modalidad === 'CARGO' ? 'CARGO' : 'TURNO'
        const diasTurno = modalidad === 'TURNO' ? 7 : 0
        const diasCargo = modalidad === 'CARGO' ? 7 : 0

        conductoresProcesados.push({
          conductor_id: conductorData.id,
          conductor_nombre: `${conductorData.nombres || ''} ${conductorData.apellidos || ''}`.trim(),
          conductor_dni: conductorData.numero_dni,
          conductor_cuit: conductorData.numero_cuit,
          vehiculo_id: null, // Se obtiene de la patente
          vehiculo_patente: control.patente || null,
          dias_turno: diasTurno,
          dias_cargo: diasCargo,
          total_dias: 7, // Semana completa desde control
          modalidad_inicial: modalidad as 'TURNO' | 'CARGO'
        })
      }

      // Obtener IDs de conductores para consultas posteriores
      const conductorIds = conductoresProcesados.map(c => c.conductor_id)

      if (conductoresProcesados.length === 0) {
        await (supabase
          .from('periodos_facturacion') as any)
          .update({ estado: 'abierto', total_conductores: 0 })
          .eq('id', periodoId)

        Swal.fire('Aviso', 'No hay conductores con días trabajados para facturar', 'warning')
        cargarSemanas()
        return
      }

      // 6. Obtener conceptos (precios)
      const { data: conceptos } = await supabase
        .from('conceptos_nomina')
        .select('*')
        .eq('activo', true)

      // P001 = TURNO, P002 = CARGO - precios en BD son DIARIOS (precio_final)
      // Convertir a semanal multiplicando por 7
      const precioTurnoDiario = ((conceptos || []) as any[]).find((c: any) => c.codigo === 'P001')?.precio_final || 35000
      const precioCargoDiario = ((conceptos || []) as any[]).find((c: any) => c.codigo === 'P002')?.precio_final || 51428.57
      const cuotaGarantiaDiaria = ((conceptos || []) as any[]).find((c: any) => c.codigo === 'P003')?.precio_final || 7142.86
      
      // Precios semanales (7 días)
      const precioTurno = precioTurnoDiario * 7  // ~$245,000
      const precioCargo = precioCargoDiario * 7  // ~$360,000
      const cuotaGarantia = cuotaGarantiaDiaria * 7  // ~$50,000

      // 7. Obtener datos adicionales (penalidades, tickets, etc.)
      const [penalidadesRes, ticketsRes, saldosRes, excesosRes, cabifyRes, garantiasRes, cobrosRes] = await Promise.all([
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
        // Excesos de kilometraje pendientes
        supabase
          .from('excesos_kilometraje')
          .select('*')
          .in('conductor_id', conductorIds)
          .eq('aplicado', false),
        // Peajes de Cabify para el período (P005)
        supabase
          .from('cabify_historico')
          .select('dni, peajes')
          .gte('fecha_inicio', semana.fecha_inicio + 'T00:00:00')
          .lte('fecha_inicio', semana.fecha_fin + 'T23:59:59'),
        // Garantías de conductores
        supabase
          .from('garantias_conductores')
          .select('*')
          .in('conductor_id', conductorIds),
        // Cobros fraccionados (P010) para esta semana
        supabase
          .from('cobros_fraccionados')
          .select('*')
          .in('conductor_id', conductorIds)
          .eq('semana', semana.semana)
          .eq('anio', semana.anio)
          .eq('aplicado', false)
      ])

      const penalidades = penalidadesRes.data || []
      const tickets = ticketsRes.data || []
      const saldos = saldosRes.data || []
      const excesos = excesosRes.data || []
      const garantias = garantiasRes.data || []
      const cobros = cobrosRes.data || []

      // Mapear peajes por DNI
      const peajesMap = new Map<string, number>()
      ;((cabifyRes.data || []) as any[]).forEach((record: any) => {
        if (record.dni && record.peajes) {
          const actual = peajesMap.get(String(record.dni)) || 0
          peajesMap.set(String(record.dni), actual + (parseFloat(String(record.peajes)) || 0))
        }
      })

      // 8. Eliminar facturación anterior de este período (si existe)
      if (semana.periodo_id) {
        // Primero obtener los IDs de facturacion_conductores para eliminar detalle
        const { data: factExistentes } = await supabase
          .from('facturacion_conductores')
          .select('id')
          .eq('periodo_id', semana.periodo_id)

        if (factExistentes && factExistentes.length > 0) {
          const factIds = factExistentes.map((f: any) => f.id)
          await supabase
            .from('facturacion_detalle')
            .delete()
            .in('facturacion_id', factIds)
        }

        await supabase
          .from('facturacion_conductores')
          .delete()
          .eq('periodo_id', semana.periodo_id)
      }

      // 9. Procesar cada conductor
      let totalCargosGlobal = 0
      let totalDescuentosGlobal = 0
      let conductoresProcesadosCount = 0

      for (const conductor of conductoresProcesados) {
        // Calcular alquiler basado en modalidad y precios de conceptos_nomina
        let alquilerTotal = 0
        const detallesAlquiler: { codigo: string; descripcion: string; dias: number; monto: number }[] = []

        // Si tiene días en TURNO
        if (conductor.dias_turno > 0) {
          const montoTurno = Math.round((precioTurno / 7) * conductor.dias_turno)
          alquilerTotal += montoTurno
          detallesAlquiler.push({
            codigo: 'P002',
            descripcion: conductor.dias_turno < 7 ? `Alquiler Turno (${conductor.dias_turno}/7 días)` : 'Alquiler Turno',
            dias: conductor.dias_turno,
            monto: montoTurno
          })
        }

        // Si tiene días en CARGO
        if (conductor.dias_cargo > 0) {
          const montoCargo = Math.round((precioCargo / 7) * conductor.dias_cargo)
          alquilerTotal += montoCargo
          detallesAlquiler.push({
            codigo: 'P001',
            descripcion: conductor.dias_cargo < 7 ? `Alquiler a Cargo (${conductor.dias_cargo}/7 días)` : 'Alquiler a Cargo',
            dias: conductor.dias_cargo,
            monto: montoCargo
          })
        }

        // Garantía prorrateada según días totales
        const factorProporcional = conductor.total_dias / 7
        const cuotaGarantiaProporcional = Math.round(cuotaGarantia * factorProporcional)

        // Obtener número de cuota de garantía
        const garantiaConductor = (garantias as any[]).find((g: any) => g.conductor_id === conductor.conductor_id)
        const cuotaActual = (garantiaConductor?.cuotas_pagadas || 0) + 1
        const totalCuotas = garantiaConductor?.total_cuotas || 16

        // Penalidades del conductor
        const pensConductor = (penalidades as any[]).filter((p: any) => p.conductor_id === conductor.conductor_id)
        const totalPenalidades = pensConductor.reduce((sum: number, p: any) => sum + (p.monto || 0), 0)

        // Tickets del conductor (descuentos)
        const ticketsConductor = (tickets as any[]).filter((t: any) => t.conductor_id === conductor.conductor_id)
        const totalTickets = ticketsConductor.reduce((sum: number, t: any) => sum + (t.monto || 0), 0)

        // Excesos de kilometraje del conductor (P006)
        const excesosConductor = (excesos as any[]).filter((e: any) => e.conductor_id === conductor.conductor_id)
        const totalExcesos = excesosConductor.reduce((sum: number, e: any) => sum + (e.monto_total || 0), 0)

        // Peajes del conductor desde Cabify (P005)
        const totalPeajes = conductor.conductor_dni ? (peajesMap.get(String(conductor.conductor_dni)) || 0) : 0

        // Cobros fraccionados del conductor (P010)
        const cobrosConductor = (cobros as any[]).filter((c: any) => c.conductor_id === conductor.conductor_id)
        const totalCobros = cobrosConductor.reduce((sum: number, c: any) => sum + (c.monto_cuota || 0), 0)

        // Saldo anterior
        const saldoConductor = (saldos as any[]).find((s: any) => s.conductor_id === conductor.conductor_id)
        const saldoAnterior = saldoConductor?.saldo_actual || 0
        const diasMora = saldoAnterior > 0 ? Math.min(saldoConductor?.dias_mora || 0, 7) : 0
        const montoMora = saldoAnterior > 0 ? Math.round(saldoAnterior * 0.01 * diasMora) : 0

        // Totales
        const subtotalCargos = alquilerTotal + cuotaGarantiaProporcional + totalPenalidades + totalExcesos + totalPeajes + montoMora + totalCobros
        const subtotalDescuentos = totalTickets
        const subtotalNeto = subtotalCargos - subtotalDescuentos
        const totalAPagar = subtotalNeto + saldoAnterior

        totalCargosGlobal += subtotalCargos
        totalDescuentosGlobal += subtotalDescuentos

        // Determinar tipo alquiler principal (el que tiene más días o el inicial)
        const tipoAlquilerPrincipal = conductor.dias_cargo >= conductor.dias_turno ? 'CARGO' : 'TURNO'

        // Insertar facturación del conductor
        const { data: factConductor, error: errFact } = await (supabase
          .from('facturacion_conductores') as any)
          .insert({
            periodo_id: periodoId,
            conductor_id: conductor.conductor_id,
            conductor_nombre: conductor.conductor_nombre,
            conductor_dni: conductor.conductor_dni,
            conductor_cuit: conductor.conductor_cuit,
            vehiculo_id: conductor.vehiculo_id,
            vehiculo_patente: conductor.vehiculo_patente,
            tipo_alquiler: tipoAlquilerPrincipal,
            turnos_base: 7,
            turnos_cobrados: conductor.total_dias,
            factor_proporcional: factorProporcional,
            subtotal_alquiler: alquilerTotal,
            subtotal_garantia: cuotaGarantiaProporcional,
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

        conductoresProcesadosCount++
        const facturacionId = (factConductor as any).id

        // Insertar detalles de alquiler (puede haber 1 o 2 si cambió de modalidad)
        for (const detalle of detallesAlquiler) {
          await (supabase.from('facturacion_detalle') as any).insert({
            facturacion_id: facturacionId,
            concepto_codigo: detalle.codigo,
            concepto_descripcion: detalle.descripcion,
            cantidad: detalle.dias,
            precio_unitario: detalle.codigo === 'P001' ? precioCargo / 7 : precioTurno / 7,
            subtotal: detalle.monto,
            total: detalle.monto,
            es_descuento: false
          })
        }

        // Insertar detalle de garantía
        const descripcionGarantia = conductor.total_dias < 7
          ? `Cuota de Garantía ${cuotaActual} de ${totalCuotas} (${conductor.total_dias}/7 días)`
          : `Cuota de Garantía ${cuotaActual} de ${totalCuotas}`

        await (supabase.from('facturacion_detalle') as any).insert({
          facturacion_id: facturacionId,
          concepto_codigo: 'P003',
          concepto_descripcion: descripcionGarantia,
          cantidad: conductor.total_dias,
          precio_unitario: cuotaGarantia / 7,
          subtotal: cuotaGarantiaProporcional,
          total: cuotaGarantiaProporcional,
          es_descuento: false
        })

        // Insertar penalidades como detalle
        for (const pen of pensConductor) {
          await (supabase.from('facturacion_detalle') as any).insert({
            facturacion_id: facturacionId,
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
            facturacion_id: facturacionId,
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
            facturacion_id: facturacionId,
            concepto_codigo: 'P006',
            concepto_descripcion: `Exceso KM: ${(exceso as any).km_exceso || 0} km`,
            cantidad: 1,
            precio_unitario: (exceso as any).monto_base || 0,
            iva_porcentaje: (exceso as any).iva_porcentaje || 21,
            iva_monto: (exceso as any).iva_monto || 0,
            subtotal: (exceso as any).monto_base || 0,
            total: (exceso as any).monto_total || 0,
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
            facturacion_id: facturacionId,
            concepto_codigo: 'P005',
            concepto_descripcion: `Telepeajes (${format(parseISO(semana.fecha_inicio), 'dd/MM', { locale: es })} al ${format(parseISO(semana.fecha_fin), 'dd/MM/yyyy', { locale: es })})`,
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
            facturacion_id: facturacionId,
            concepto_codigo: 'P009',
            concepto_descripcion: `Mora (${diasMora} días al 1%)`,
            cantidad: diasMora,
            precio_unitario: Math.round(saldoAnterior * 0.01),
            subtotal: montoMora,
            total: montoMora,
            es_descuento: false
          })
        }

        // Insertar cobros fraccionados como detalle (P010)
        for (const cobro of cobrosConductor) {
          const descripcionCobro = (cobro as any).descripcion || 
            `Cuota ${(cobro as any).numero_cuota} de ${(cobro as any).total_cuotas}`
          
          await (supabase.from('facturacion_detalle') as any).insert({
            facturacion_id: facturacionId,
            concepto_codigo: 'P010',
            concepto_descripcion: descripcionCobro,
            cantidad: 1,
            precio_unitario: (cobro as any).monto_cuota,
            subtotal: (cobro as any).monto_cuota,
            total: (cobro as any).monto_cuota,
            es_descuento: false,
            referencia_id: (cobro as any).id,
            referencia_tipo: 'cobro_fraccionado'
          })

          // Marcar cobro como aplicado
          await (supabase
            .from('cobros_fraccionados') as any)
            .update({ aplicado: true, fecha_aplicacion: new Date().toISOString() })
            .eq('id', (cobro as any).id)
        }
      }

      // 10. Actualizar totales del período
      await (supabase
        .from('periodos_facturacion') as any)
        .update({
          estado: 'abierto',
          total_conductores: conductoresProcesadosCount,
          total_cargos: totalCargosGlobal,
          total_descuentos: totalDescuentosGlobal,
          total_neto: totalCargosGlobal - totalDescuentosGlobal
        })
        .eq('id', periodoId)

      showSuccess('Facturación Generada', `Semana ${semana.semana}/${semana.anio} - ${conductoresProcesadosCount} conductores - ${formatCurrency(totalCargosGlobal - totalDescuentosGlobal)}`)

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

      showSuccess('Período Cerrado')
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

      showSuccess('Período Reabierto')
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
        <div style="text-align: left;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; font-size: 13px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between;"><span style="color: #6B7280;">Período</span> <strong>${format(new Date(semana.fecha_inicio), 'dd/MM', { locale: es })} - ${format(new Date(semana.fecha_fin), 'dd/MM/yyyy', { locale: es })}</strong></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #6B7280;">Estado</span> <strong style="text-transform: uppercase; color: ${semana.estado === 'cerrado' ? '#E63946' : '#10B981'};">${semana.estado}</strong></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #6B7280;">Conductores</span> <strong>${semana.total_conductores}</strong></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #6B7280;">Total Neto</span> <strong style="color: #10B981;">${formatCurrency(semana.total_neto)}</strong></div>
          </div>
          <div style="font-weight: 600; margin-bottom: 8px; font-size: 13px;">Top 5 - Mayor facturación</div>
          <div style="border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
            <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
              <thead>
                <tr style="background: #F9FAFB;">
                  <th style="padding: 10px 12px; text-align: left; font-weight: 600; font-size: 12px; color: #6B7280;">Conductor</th>
                  <th style="padding: 10px 12px; text-align: right; font-weight: 600; font-size: 12px; color: #6B7280;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${topDeudores.map((c: any, i: number) => `
                  <tr style="border-top: 1px solid #E5E7EB;${i % 2 === 1 ? ' background: #FAFAFA;' : ''}">
                    <td style="padding: 10px 12px;">
                      <div style="font-weight: 500;">${c.conductor_nombre}</div>
                      <div style="font-size: 11px; color: #9CA3AF;">${c.vehiculo_patente || '-'}</div>
                    </td>
                    <td style="padding: 10px 12px; text-align: right; font-weight: 600; color: ${c.total_a_pagar < 0 ? '#E63946' : '#10B981'};">
                      ${formatCurrency(c.total_a_pagar)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${semana.fecha_cierre ? `<div style="margin-top: 12px; font-size: 12px; color: #9CA3AF; text-align: center;">Cerrado el ${format(new Date(semana.fecha_cierre), 'dd/MM/yyyy HH:mm', { locale: es })}</div>` : ''}
        </div>
      `,
      width: 440,
      showCloseButton: true,
      showConfirmButton: false
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
        pageSize={52}
        pageSizeOptions={[12, 24, 52, 100]}
      />
    </>
  )
}
