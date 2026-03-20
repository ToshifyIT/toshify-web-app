// src/modules/portal/PortalPage.tsx
// Portal público para conductores - Mi Espacio
import { useState, useEffect, useCallback, useMemo } from 'react'
import { jsPDF } from 'jspdf'
import { format, parseISO } from 'date-fns'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../types/facturacion.types'
import { normalizeDni, normalizeCuit } from '../../utils/normalizeDocuments'
import logoToshifyUrl from '../../assets/logo-toshify.png'
import './PortalPage.css'

// =====================================================
// TYPES
// =====================================================

interface PortalConductor {
  id: string
  nombres: string
  apellidos: string
  numero_dni: string | null
  numero_cuit: string | null
}

interface PortalPeriodo {
  semana: number
  anio: number
  fecha_inicio: string
  fecha_fin: string
}

interface PortalFacturacion {
  id: string
  periodo_id: string
  conductor_id: string
  conductor_nombre: string
  conductor_dni: string
  conductor_cuit: string | null
  vehiculo_patente: string | null
  tipo_alquiler: string
  turnos_base: number
  turnos_cobrados: number
  subtotal_cargos: number
  subtotal_descuentos: number
  saldo_anterior: number
  total_a_pagar: number
  estado: string
  periodos_facturacion: PortalPeriodo
}

interface PortalDetalle {
  id: string
  facturacion_id: string
  concepto_codigo: string
  concepto_descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  total: number
  es_descuento: boolean
  referencia_id?: string | null
  referencia_tipo?: string | null
}

interface PortalSaldo {
  saldo_actual: number
  dias_mora: number
  monto_mora_acumulada: number
}

interface PortalFraccionamiento {
  id: string
  monto_total: number
  monto_cuota: number
  numero_cuota: number
  total_cuotas: number
  descripcion: string
  aplicado: boolean
  semana: number
  anio: number
}

type View = 'login' | 'dashboard' | 'detail'

// Mapeo de códigos de concepto a descripciones legibles
const CONCEPTO_LABELS: Record<string, string> = {
  P001: 'Alquiler Turno Diurno',
  P002: 'Alquiler a Cargo',
  P003: 'Cuota de Garantía',
  P004: 'Tickets',
  P005: 'Peajes',
  P006: 'Combustible',
  P007: 'Penalidades',
  P008: 'Multas de Tránsito',
  P009: 'Mora',
  P010: 'Plan de Pagos',
  P013: 'Alquiler Turno Nocturno',
}

/** Siempre mostrar el label del concepto para códigos conocidos.
 *  Si la descripción aporta info adicional (cuota, plan de pagos), se agrega. */
function getConceptoLabel(item: PortalDetalle): string {
  const desc = item.concepto_descripcion?.trim()
  const baseLabel = CONCEPTO_LABELS[item.concepto_codigo]

  // Si no tenemos label para este código, usar la descripción tal cual
  if (!baseLabel) return desc || item.concepto_codigo

  // P003 = Cuota de Garantía: agregar fracción "X de Y" si aplica
  if (item.concepto_codigo === 'P003') {
    const cuotaMatch = desc ? /(\d+\s+de\s+\d+)/.exec(desc) : null
    if (cuotaMatch) return `${baseLabel} ${cuotaMatch[1]}`
    return baseLabel
  }

  // P010 = Plan de Pagos: agregar descripción si es informativa (ej: "valor de multas 678.733,50")
  if (item.concepto_codigo === 'P010' && desc && !/^\d+([,.]\d+)?$/.test(desc)) {
    return `${baseLabel} - ${desc}`
  }

  // P004 = Tickets: mostrar detalle descriptivo, eliminando prefijo redundante "Ticket:"
  if (item.concepto_codigo === 'P004') {
    if (desc) {
      // Quitar prefijo "Ticket:" o "Ticket: " para no repetir
      const cleanDesc = desc.replace(/^Ticket:\s*/i, '').trim()
      if (cleanDesc && cleanDesc !== baseLabel) return `${baseLabel} (${cleanDesc})`
    }
    return baseLabel
  }

  // Para códigos con descripción informativa (fechas, detalles), agregar entre paréntesis
  // Ej: P005 "29/01/2026 al 01/02/2026" → "Peajes (29/01/2026 al 01/02/2026)"
  if (desc && desc !== baseLabel && !/^\d+([,.]\d+)?$/.test(desc)) {
    return `${baseLabel} (${desc})`
  }

  return baseLabel
}

// =====================================================
// LOGO PRELOAD (para PDF)
// =====================================================

let logoBase64: string | null = null
let logoAspectRatio = 3
const _logoImg = new Image()
_logoImg.src = logoToshifyUrl
_logoImg.onload = () => {
  const c = document.createElement('canvas')
  c.width = _logoImg.naturalWidth
  c.height = _logoImg.naturalHeight
  logoAspectRatio = c.width / c.height
  const ctx = c.getContext('2d')!
  ctx.drawImage(_logoImg, 0, 0)
  logoBase64 = c.toDataURL('image/png')
}

// =====================================================
// COMPONENT
// =====================================================

export function PortalPage() {
  // State
  const [view, setView] = useState<View>('login')
  const [conductor, setConductor] = useState<PortalConductor | null>(null)
  const [facturas, setFacturas] = useState<PortalFacturacion[]>([])
  const [selectedFactura, setSelectedFactura] = useState<PortalFacturacion | null>(null)
  const [detalleItems, setDetalleItems] = useState<PortalDetalle[]>([])
  const [saldo, setSaldo] = useState<PortalSaldo | null>(null)
  const [fraccionamientos, setFraccionamientos] = useState<PortalFraccionamiento[]>([])
  const [cabifyPorSemana, setCabifyPorSemana] = useState<Record<string, number>>({})

  // UI state
  const [loginInput, setLoginInput] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loadingFacturas, setLoadingFacturas] = useState(false)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  // =====================================================
  // LOGIN
  // =====================================================

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    const input = loginInput.trim()
    if (!input) return

    setLoginLoading(true)
    setLoginError('')

    try {
      // Normalizar: quitar guiones, puntos y espacios
      const normalizedDni = normalizeDni(input)
      const normalizedCuit = normalizeCuit(input)

      const { data, error } = await supabase
        .from('conductores')
        .select('id, nombres, apellidos, numero_dni, numero_cuit')
        .or(`numero_dni.eq.${normalizedDni},numero_cuit.eq.${normalizedCuit},numero_cuit.eq.${input}`)
        .limit(1)

      if (error) throw error

      if (!data || data.length === 0) {
        setLoginError('No se encontró un conductor con ese DNI o CUIT')
        return
      }

      setConductor(data[0] as PortalConductor)
      setView('dashboard')
    } catch {
      setLoginError('Error de conexión. Intentá de nuevo.')
    } finally {
      setLoginLoading(false)
    }
  }

  // =====================================================
  // LOAD FACTURAS
  // =====================================================

  const loadFacturas = useCallback(async (conductorId: string) => {
    setLoadingFacturas(true)
    try {
      const { data, error } = await supabase
        .from('facturacion_conductores')
        .select(`
          id, periodo_id, conductor_id, conductor_nombre, conductor_dni, conductor_cuit,
          vehiculo_patente, tipo_alquiler, turnos_base, turnos_cobrados,
          subtotal_cargos, subtotal_descuentos, saldo_anterior, total_a_pagar, estado,
          periodos_facturacion!inner(semana, anio, fecha_inicio, fecha_fin)
        `)
        .eq('conductor_id', conductorId)
        .order('created_at', { ascending: false })

      if (error) throw error
      const facturasData = (data || []) as unknown as PortalFacturacion[]

      // Backfill missing vehiculo_patente from assignment history
      const missingPatente = facturasData.filter(f => !f.vehiculo_patente)
      if (missingPatente.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: asignaciones } = await (supabase
          .from('asignaciones_conductores') as any)
          .select(`
            fecha_inicio, fecha_fin, estado, created_at,
            asignaciones!inner(fecha_inicio, fecha_fin, estado, vehiculos(patente))
          `)
          .eq('conductor_id', conductorId)
          .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado', 'cancelado', 'cancelada'])
          .order('created_at', { ascending: false })

        if (asignaciones && asignaciones.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const validAsignaciones = (asignaciones as any[]).filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (ac: any) => ac.asignaciones?.vehiculos?.patente && ac.asignaciones.estado !== 'programado'
          )

          for (const factura of missingPatente) {
            const p = factura.periodos_facturacion
            const semInicio = new Date(p.fecha_inicio + 'T00:00:00')
            const semFin = new Date(p.fecha_fin + 'T23:59:59')

            // Try date overlap match first
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const match = validAsignaciones.find((ac: any) => {
              const asig = ac.asignaciones
              const acInicio = ac.fecha_inicio ? new Date(ac.fecha_inicio) : new Date(asig.fecha_inicio)
              const acFin = ac.fecha_fin ? new Date(ac.fecha_fin) : (asig.fecha_fin ? new Date(asig.fecha_fin) : new Date())
              return acFin >= semInicio && acInicio <= semFin
            })

            if (match) {
              factura.vehiculo_patente = match.asignaciones.vehiculos.patente
            } else if (validAsignaciones.length > 0) {
              // Fallback: use the most recent assignment's vehicle
              factura.vehiculo_patente = validAsignaciones[0].asignaciones.vehiculos.patente
            }
          }
        }
      }

      setFacturas(facturasData)
    } catch {
      setFacturas([])
    } finally {
      setLoadingFacturas(false)
    }
  }, [])

  useEffect(() => {
    if (conductor && view === 'dashboard') {
      loadFacturas(conductor.id)

      // Cargar saldo
      supabase
        .from('saldos_conductores')
        .select('saldo_actual, dias_mora, monto_mora_acumulada')
        .eq('conductor_id', conductor.id)
        .limit(1)
        .then(({ data }) => {
          if (data && data.length > 0) setSaldo(data[0] as PortalSaldo)
        })

      // Cargar fraccionamientos pendientes
      supabase
        .from('cobros_fraccionados')
        .select('id, monto_total, monto_cuota, numero_cuota, total_cuotas, descripcion, aplicado, semana, anio')
        .eq('conductor_id', conductor.id)
        .eq('aplicado', false)
        .order('anio', { ascending: true })
        .order('semana', { ascending: true })
        .then(({ data }) => {
          setFraccionamientos((data || []) as PortalFraccionamiento[])
        })

      // Cargar ganancias Cabify - buscar por DNI o por primer nombre+apellido
      // Cabify guarda solo primer nombre/apellido (ej: "gerardo", "millan")
      // Conductor puede tener nombre compuesto (ej: "GERARDO RAMON", "MILLAN URBANO")
      const primerNombre = conductor.nombres.split(' ')[0]
      const primerApellido = conductor.apellidos.split(' ')[0]
      supabase
        .from('cabify_historico')
        .select('fecha_inicio, ganancia_total')
        .or(`dni.eq.${conductor.numero_dni},and(nombre.ilike.%${primerNombre}%,apellido.ilike.%${primerApellido}%)`)
        .order('fecha_inicio', { ascending: true })
        .then(({ data }) => {
          if (!data || data.length === 0) return
          // Agrupar ganancia por fecha (para cruzar con períodos)
          const porDia: Record<string, number> = {}
          for (const row of data) {
            const dia = (row.fecha_inicio as string).slice(0, 10)
            porDia[dia] = (porDia[dia] || 0) + (Number(row.ganancia_total) || 0)
          }
          setCabifyPorSemana(porDia)
        })
    }
  }, [conductor, view, loadFacturas])

  // =====================================================
  // LOAD DETAIL
  // =====================================================

  async function openDetail(factura: PortalFacturacion) {
    setSelectedFactura(factura)
    setView('detail')
    setLoadingDetalle(true)

    try {
      const { data, error } = await supabase
        .from('facturacion_detalle')
        .select('id, facturacion_id, concepto_codigo, concepto_descripcion, cantidad, precio_unitario, subtotal, total, es_descuento, referencia_id, referencia_tipo')
        .eq('facturacion_id', factura.id)
        .order('es_descuento')
        .order('concepto_codigo')

      if (error) throw error
      const items = (data || []) as PortalDetalle[]

<<<<<<< HEAD
=======
      // Enriquecer P004 con descripción real desde penalidades o tickets_favor
      const ticketItems = items.filter(i => i.concepto_codigo === 'P004' && i.referencia_id)
      if (ticketItems.length > 0) {
        // Agrupar por referencia_tipo
        const fromPenalidades = ticketItems.filter(i => i.referencia_tipo === 'penalidad' || i.referencia_tipo === 'penalidad_cuota')
        const fromTickets = ticketItems.filter(i => i.referencia_tipo === 'ticket')

        // Buscar en penalidades
        if (fromPenalidades.length > 0) {
          const penIds = fromPenalidades.map(i => i.referencia_id!).filter(Boolean)
          const { data: penData } = await (supabase.from('penalidades') as any)
            .select('id, detalle, observaciones, area_responsable, fecha, turno')
            .in('id', penIds)
          if (penData) {
            const penMap = new Map(penData.map((p: any) => [p.id, p]))
            for (const item of fromPenalidades) {
              const pen = penMap.get(item.referencia_id!)
              if (pen) {
                const parts: string[] = []
                if (pen.detalle) parts.push(pen.detalle)
                if (pen.observaciones) parts.push(pen.observaciones)
                if (pen.turno) parts.push(`Turno ${pen.turno}`)
                if (pen.fecha) {
                  const [y, m, d] = pen.fecha.split('-')
                  parts.push(`${d}/${m}/${y}`)
                }
                item.concepto_descripcion = parts.join(' · ') || 'Descuento'
              }
            }
          }
        }

        // Buscar en tickets_favor
        if (fromTickets.length > 0) {
          const ticketIds = fromTickets.map(i => i.referencia_id!).filter(Boolean)
          const { data: ticketsData } = await (supabase.from('tickets_favor') as any)
            .select('id, descripcion, tipo')
            .in('id', ticketIds)
          if (ticketsData) {
            const ticketMap = new Map(ticketsData.map((t: any) => [t.id, t]))
            for (const item of fromTickets) {
              const ticket = ticketMap.get(item.referencia_id!)
              if (ticket) {
                const desc = ticket.descripcion || ticket.tipo || 'Descuento'
                item.concepto_descripcion = desc
              }
            }
          }
        }
      }

>>>>>>> 8a4899fea2bf789c55e158ee7e4434791ab83884
      // Inject saldo_anterior as a concepto line (same logic as ReporteFacturacionTab)
      const saldo = factura.saldo_anterior || 0
      if (saldo > 0) {
        items.push({
          id: `saldo-${factura.id}`,
          facturacion_id: factura.id,
          concepto_codigo: 'SALDO',
          concepto_descripcion: 'Saldo Anterior (deuda)',
          cantidad: 1,
          precio_unitario: saldo,
          subtotal: saldo,
          total: saldo,
          es_descuento: false,
        })
      } else if (saldo < 0) {
        items.push({
          id: `saldo-${factura.id}`,
          facturacion_id: factura.id,
          concepto_codigo: 'SALDO',
          concepto_descripcion: 'Saldo a Favor',
          cantidad: 1,
          precio_unitario: Math.abs(saldo),
          subtotal: Math.abs(saldo),
          total: Math.abs(saldo),
          es_descuento: true,
        })
      }

      setDetalleItems(items)
    } catch {
      setDetalleItems([])
    } finally {
      setLoadingDetalle(false)
    }
  }

  // =====================================================
  // EXPORT PDF
  // =====================================================

  async function exportarPDF() {
    if (!selectedFactura) return

    const periodo = selectedFactura.periodos_facturacion
    setExportingPdf(true)

    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const margin = 15
      let y = 15

      const rojo = '#ff0033'
      const gris = '#6B7280'
      const negro = '#111827'
      const verde = '#059669'

      // Header con logo
      if (logoBase64) {
        const logoH = 35
        const logoW = logoH * logoAspectRatio
        pdf.addImage(logoBase64, 'PNG', margin, y - 16, logoW, logoH)
      } else {
        pdf.setFontSize(22)
        pdf.setTextColor(rojo)
        pdf.setFont('helvetica', 'bold')
        pdf.text('TOSHIFY', margin, y)
      }

      // Título
      pdf.setFontSize(14)
      pdf.setTextColor(negro)
      pdf.setFont('helvetica', 'bold')
      pdf.text('PROFORMA', pageWidth - margin, y, { align: 'right' })

      pdf.setFontSize(10)
      pdf.setTextColor(rojo)
      pdf.text(`Semana ${periodo.semana} / ${periodo.anio}`, pageWidth - margin, y + 6, { align: 'right' })

      pdf.setTextColor(gris)
      pdf.setFont('helvetica', 'normal')
      pdf.text(
        `${format(parseISO(periodo.fecha_inicio), 'dd/MM/yyyy')} - ${format(parseISO(periodo.fecha_fin), 'dd/MM/yyyy')}`,
        pageWidth - margin, y + 11, { align: 'right' }
      )

      y += 25

      // Línea separadora
      pdf.setDrawColor(220, 38, 38)
      pdf.setLineWidth(0.5)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 6

      // Nota legal superior
      pdf.setFontSize(8)
      pdf.setTextColor(gris)
      pdf.setFont('helvetica', 'italic')
      pdf.text(
        'La información presentada es de carácter referencial y no constituye un comprobante fiscal válido.',
        pageWidth / 2, y, { align: 'center' }
      )
      y += 8

      // Datos del conductor
      pdf.setFontSize(11)
      pdf.setTextColor(negro)
      pdf.setFont('helvetica', 'bold')
      pdf.text('CONDUCTOR', margin, y)
      y += 6

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Nombre: ${selectedFactura.conductor_nombre}`, margin, y)
      pdf.text(`DNI: ${selectedFactura.conductor_dni}`, pageWidth / 2, y)
      y += 5
      if (selectedFactura.conductor_cuit) {
        pdf.text(`CUIT: ${selectedFactura.conductor_cuit}`, margin, y)
      }
      pdf.text(`Vehículo: ${selectedFactura.vehiculo_patente || '-'}`, pageWidth / 2, y)
      y += 5
      pdf.text(`Modalidad: ${selectedFactura.tipo_alquiler}`, margin, y)
      pdf.text(`Turnos: ${selectedFactura.turnos_cobrados}/${selectedFactura.turnos_base}`, pageWidth / 2, y)
      y += 10

      // Línea separadora
      pdf.setDrawColor(200, 200, 200)
      pdf.setLineWidth(0.2)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 8

      // CONCEPTOS (cargos + descuentos unificados, sin subtotales)
      const cargos = detalleItems.filter(d => !d.es_descuento && d.total !== 0)
      const descuentos = detalleItems.filter(d => d.es_descuento && d.total !== 0)

      pdf.setFontSize(11)
      pdf.setTextColor(negro)
      pdf.setFont('helvetica', 'bold')
      pdf.text('CONCEPTOS', margin, y)
      y += 7

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      cargos.forEach(cargo => {
        pdf.setTextColor(negro)
        const cargoDesc = getConceptoLabel(cargo)
        const cargoLabel = cargo.cantidad > 1
          ? `${cargoDesc} x${cargo.cantidad}`
          : cargoDesc
        pdf.text(cargoLabel, margin, y)
        pdf.text(formatCurrency(cargo.total), pageWidth - margin, y, { align: 'right' })
        y += 5
      })
      descuentos.forEach(desc => {
        pdf.setTextColor(negro)
        const descDesc = getConceptoLabel(desc)
        const descLabel = desc.cantidad > 1
          ? `${descDesc} x${desc.cantidad}`
          : descDesc
        pdf.text(descLabel, margin, y)
        pdf.setTextColor(verde)
        pdf.text(`-${formatCurrency(desc.total)}`, pageWidth - margin, y, { align: 'right' })
        y += 5
      })

      // TOTAL
      y += 5
      pdf.setDrawColor(200, 200, 200)
      pdf.setLineWidth(0.5)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 8

      const subtotalCargos = cargos.reduce((sum, c) => sum + c.total, 0)
      const subtotalDescPdf = descuentos.reduce((sum, d) => sum + d.total, 0)
      const totalFinal = subtotalCargos - subtotalDescPdf
      const saldoColor = totalFinal > 0 ? rojo : verde

      pdf.setFontSize(14)
      pdf.setTextColor(saldoColor)
      pdf.setFont('helvetica', 'bold')
      pdf.text('MONTO TOTAL REFERENCIAL', margin, y)
      pdf.text(formatCurrency(totalFinal), pageWidth - margin, y, { align: 'right' })

      // Nota legal
      y += 12
      pdf.setFontSize(8)
      pdf.setTextColor(gris)
      pdf.setFont('helvetica', 'italic')
      pdf.text(
        'La información presentada es de carácter referencial y no constituye un comprobante fiscal válido.',
        pageWidth / 2, y, { align: 'center' }
      )

      // Pie de página
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Generado el ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, margin, pdf.internal.pageSize.getHeight() - 10)
      pdf.text('TOSHIFY - Sistema de Gestión de Flota', pageWidth - margin, pdf.internal.pageSize.getHeight() - 10, { align: 'right' })

      // Guardar
      const nombreArchivo = `Proforma_${selectedFactura.conductor_nombre.replace(/\s+/g, '_')}_Semana${periodo.semana}_${periodo.anio}.pdf`
      pdf.save(nombreArchivo)
    } catch {
      // Silent fail - el PDF se intenta descargar igual
    } finally {
      setExportingPdf(false)
    }
  }

  // =====================================================
  // LOGOUT
  // =====================================================

  function handleLogout() {
    setConductor(null)
    setFacturas([])
    setSelectedFactura(null)
    setDetalleItems([])
    setSaldo(null)
    setFraccionamientos([])
    setCabifyPorSemana({})
    setLoginInput('')
    setLoginError('')
    setView('login')
  }

  // =====================================================
  // STATS & CHART DATA (must be before early returns - rules of hooks)
  // =====================================================

  const stats = useMemo(() => {
    if (facturas.length === 0) return null

    const totales = facturas.map(f => f.total_a_pagar)
    const sum = totales.reduce((a, b) => a + b, 0)
    const promedio = sum / totales.length
    const ultima = totales[0] || 0
    const anterior = totales[1] || 0
    const variacion = anterior > 0 ? ((ultima - anterior) / anterior) * 100 : 0

    // Chart data: últimas 12 semanas con facturación + ganancia Cabify
    // cabifyPorSemana tiene datos diarios: { "2026-01-26": 1500, "2026-01-27": 2000, ... }
    // Necesitamos sumar los días que caen dentro de cada período
    const cabifyDates = Object.keys(cabifyPorSemana)
    const chartData = facturas
      .slice(0, 12)
      .map(f => {
        const p = f.periodos_facturacion
        const inicio = p.fecha_inicio.slice(0, 10)
        const fin = p.fecha_fin.slice(0, 10)
        // Sumar ganancias cabify de días dentro del rango [inicio, fin]
        let ganancia = 0
        for (const dia of cabifyDates) {
          if (dia >= inicio && dia <= fin) {
            ganancia += cabifyPorSemana[dia]
          }
        }
        return {
          label: `S${p.semana}`,
          facturacion: f.total_a_pagar,
          ganancia,
        }
      })
      .reverse()

    // Ganancia Cabify última semana (la más reciente = último elemento del chart)
    const ultimaGanancia = chartData.length > 0 ? chartData[chartData.length - 1].ganancia : 0

    return { sum, promedio, ultima, variacion, totalSemanas: facturas.length, chartData, ultimaGanancia }
  }, [facturas, cabifyPorSemana])



  // =====================================================
  // RENDER: LOGIN
  // =====================================================

  if (view === 'login') {
    return (
      <div className="portal portal-login">
        <form className="portal-login-card" onSubmit={handleLogin}>
          <img src={logoToshifyUrl} alt="Toshify" className="portal-login-logo" />
          <h1 className="portal-login-title">Mi Espacio</h1>
          <p className="portal-login-subtitle">Ingresá tu DNI o CUIT para ver tu proforma</p>

          <input
            type="text"
            className="portal-login-input"
            placeholder="DNI o CUIT"
            value={loginInput}
            onChange={(e) => { setLoginInput(e.target.value); setLoginError('') }}
            autoFocus
            inputMode="numeric"
          />

          <button
            type="submit"
            className="portal-login-btn"
            disabled={loginLoading || !loginInput.trim()}
          >
            {loginLoading ? 'Buscando...' : 'Ingresar'}
          </button>

          {loginError && (
            <div className="portal-login-error">{loginError}</div>
          )}
        </form>
      </div>
    )
  }

  // =====================================================
  // RENDER: DETAIL
  // =====================================================

  if (view === 'detail' && selectedFactura) {
    const periodo = selectedFactura.periodos_facturacion
    const cargos = detalleItems.filter(d => !d.es_descuento && d.total !== 0)
    const descuentos = detalleItems.filter(d => d.es_descuento && d.total !== 0)
    const subtotalCargos = cargos.reduce((sum, d) => sum + d.total, 0)
    const subtotalDescuentos = descuentos.reduce((sum, d) => sum + d.total, 0)
    const totalAPagar = subtotalCargos - subtotalDescuentos

    return (
      <div className="portal">
        <header className="portal-header">
          <div className="portal-header-left">
            <img src={logoToshifyUrl} alt="Toshify" className="portal-header-logo" />
            <div>
              <div className="portal-header-name">
                {conductor?.nombres} {conductor?.apellidos}
              </div>
              <div className="portal-header-dni">DNI: {conductor?.numero_dni}</div>
            </div>
          </div>
          <button className="portal-logout-btn" onClick={handleLogout}>
            Salir
          </button>
        </header>

        <div className="portal-detail">
          <button className="portal-back-btn" onClick={() => setView('dashboard')}>
            ← Volver
          </button>

          {loadingDetalle ? (
            <div className="portal-loading">Cargando detalle...</div>
          ) : (
            <div className="portal-detail-card">
              {/* Header */}
              <div className="portal-detail-header">
                <div>
                  <div className="portal-detail-conductor">{selectedFactura.conductor_nombre}</div>
                  <div className="portal-detail-cuit">
                    {selectedFactura.conductor_cuit || `DNI: ${selectedFactura.conductor_dni}`}
                  </div>
                </div>
                <div>
                  <div className="portal-detail-semana">Semana {periodo.semana}</div>
                  <div className="portal-detail-fechas">
                    {format(parseISO(periodo.fecha_inicio), 'dd/MM')} - {format(parseISO(periodo.fecha_fin), 'dd/MM')} / {periodo.anio}
                  </div>
                </div>
              </div>

              {/* Info bar */}
              <div className="portal-detail-info">
                <div className="portal-detail-info-item">
                  <span className="portal-detail-info-label">Vehículo</span>
                  <span className="portal-detail-info-value">{selectedFactura.vehiculo_patente || '-'}</span>
                </div>
                <div className="portal-detail-info-item">
                  <span className="portal-detail-info-label">Modalidad</span>
                  <span className="portal-detail-info-value">{selectedFactura.tipo_alquiler}</span>
                </div>
                <div className="portal-detail-info-item">
                  <span className="portal-detail-info-label">Turnos</span>
                  <span className="portal-detail-info-value">{selectedFactura.turnos_cobrados}/{selectedFactura.turnos_base}</span>
                </div>
              </div>

              <div className="portal-detail-body">
                {/* CONCEPTOS (cargos + descuentos unificados) */}
                <div className="portal-detail-section">
                  <div className="portal-detail-section-title cargos">Conceptos</div>
                  <div className="portal-detail-items">
                    {cargos.map((item) => (
                      <div key={item.id} className="portal-detail-item">
                        <span className="portal-detail-item-name">
                          <span className="portal-detail-item-dot cargo" />
                          {getConceptoLabel(item)}
                          {item.cantidad > 1 && ` x${item.cantidad}`}
                        </span>
                        <span className="portal-detail-item-amount">{formatCurrency(item.total)}</span>
                      </div>
                    ))}
                    {descuentos.map((item) => (
                      <div key={item.id} className="portal-detail-item">
                        <span className="portal-detail-item-name">
                          <span className="portal-detail-item-dot descuento" />
                          {getConceptoLabel(item)}
                        </span>
                        <span className="portal-detail-item-amount" style={{ color: '#059669' }}>
                          -{formatCurrency(item.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* TOTAL */}
                <div className="portal-detail-total">
                  <div className="portal-detail-total-label">Monto Total Referencial</div>
                  <div className={`portal-detail-total-amount ${totalAPagar > 0 ? 'debit' : 'credit'}`}>
                    {formatCurrency(totalAPagar)}
                  </div>
                  <div className="portal-detail-total-note">
                    {totalAPagar > 0 ? 'Monto referencial' : totalAPagar < 0 ? 'Saldo a favor' : 'Sin saldo'}
                  </div>
                </div>
              </div>

              {/* PDF Button */}
              <div className="portal-detail-actions">
                <button
                  className="portal-pdf-btn"
                  onClick={exportarPDF}
                  disabled={exportingPdf}
                >
                  {exportingPdf ? 'Generando...' : '↓ Descargar PDF'}
                </button>
              </div>
            </div>
          )}
          {/* Nota legal */}
          <div className="portal-nota-legal">
            La información presentada es de carácter referencial y no constituye un comprobante fiscal válido.
          </div>
        </div>
      </div>
    )
  }

  // =====================================================
  // RENDER: DASHBOARD
  // =====================================================

  return (
    <div className="portal">
      <header className="portal-header">
        <div className="portal-header-left">
          <img src={logoToshifyUrl} alt="Toshify" className="portal-header-logo" />
          <div>
            <div className="portal-header-name">
              {conductor?.nombres} {conductor?.apellidos}
            </div>
            <div className="portal-header-dni">DNI: {conductor?.numero_dni}</div>
          </div>
        </div>
        <button className="portal-logout-btn" onClick={handleLogout}>
          Salir
        </button>
      </header>

      <div className="portal-content">
        {loadingFacturas ? (
          <div className="portal-loading">Cargando facturación...</div>
        ) : facturas.length === 0 ? (
          <div className="portal-empty">
            <div className="portal-empty-icon">📋</div>
            <p>No hay facturación registrada todavía</p>
          </div>
        ) : stats && (
          <>
            {/* Stats row */}
            <div className="portal-stats-grid">
              <div className="portal-stat-card">
                <div className="portal-stat-label">
                  Última semana
                  <span className="portal-stat-tooltip" data-tooltip="Monto total referencial de la última semana">ⓘ</span>
                </div>
                <div className="portal-stat-value debit">{formatCurrency(stats.ultima)}</div>
                {stats.variacion !== 0 && (
                  <div className={`portal-stat-change ${stats.variacion > 0 ? 'up' : 'down'}`}>
                    {stats.variacion > 0 ? '↑' : '↓'} {Math.abs(stats.variacion).toFixed(1)}%
                  </div>
                )}
              </div>
              <div className="portal-stat-card">
                <div className="portal-stat-label">
                  Promedio semanal
                  <span className="portal-stat-tooltip" data-tooltip="Promedio de los montos totales referenciales de las semanas que he tenido un vehículo">ⓘ</span>
                </div>
                <div className="portal-stat-value">{formatCurrency(stats.promedio)}</div>
                <div className="portal-stat-sub">{stats.totalSemanas} semanas</div>
              </div>
              <div className="portal-stat-card">
                <div className="portal-stat-label">Cobro App Cabify</div>
                <div className="portal-stat-value" style={{ color: '#059669' }}>{formatCurrency(stats.ultimaGanancia)}</div>
                <div className="portal-stat-sub">última semana</div>
              </div>
              <div className="portal-stat-card">
                <div className="portal-stat-label">Saldo actual</div>
                {saldo ? (
                  <>
                    <div className={`portal-stat-value ${saldo.saldo_actual < 0 ? 'debit' : ''}`}>
                      {saldo.saldo_actual < 0 ? '-' : ''}{formatCurrency(Math.abs(saldo.saldo_actual))}
                    </div>
                    <div className="portal-stat-sub">
                      {saldo.saldo_actual > 0 ? 'A favor' : saldo.saldo_actual < 0 ? 'Deuda' : 'Sin saldo'}
                    </div>
                  </>
                ) : (
                  <div className="portal-stat-value">-</div>
                )}
              </div>
            </div>

            {/* Mora banner */}
            {saldo && saldo.dias_mora > 0 && (
              <div className="portal-mora-banner">
                <span className="portal-mora-label">Mora: {saldo.dias_mora} días</span>
                <span className="portal-mora-amount">Acumulada: {formatCurrency(saldo.monto_mora_acumulada)}</span>
              </div>
            )}

            {/* 2 columnas: Chart + Semanas */}
            <div className="portal-layout">
              <div className="portal-left">
                {/* Chart */}
                <div className="portal-chart-card">
                  <div className="portal-chart-header">
                    <div className="portal-chart-title">Proforma vs Cobro App Cabify</div>
                    <div className="portal-chart-legend">
                      <span className="portal-legend-item">
                        <span className="portal-legend-dot" style={{ background: '#ff0033' }} /> Proforma
                        <span className="portal-stat-tooltip" data-tooltip="Monto de compromiso semanal de suma de conceptos: alquiler, garant&#237;a y otros">&#9432;</span>
                      </span>
                      <span className="portal-legend-item">
                        <span className="portal-legend-dot" style={{ background: '#059669' }} /> Cobro App Cabify
                        <span className="portal-stat-tooltip" data-tooltip="Total semanal recaudado por el conductor a trav&#233;s de la aplicaci&#243;n Cabify (excluye efectivo)">&#9432;</span>
                      </span>
                    </div>
                  </div>
                  <div className="portal-chart-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stats.chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`}
                        />
                        <Tooltip
                          formatter={(value: string | number, name: string) => [formatCurrency(Number(value)), name === 'facturacion' ? 'Proforma' : 'Cobro App Cabify']}
                          contentStyle={{
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: 'var(--text-primary)',
                          }}
                          labelStyle={{ color: 'var(--text-secondary)' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="facturacion"
                          stroke="#ff0033"
                          strokeWidth={2}
                          dot={{ r: 4, fill: '#ff0033', strokeWidth: 2, stroke: 'var(--card-bg)' }}
                          activeDot={{ r: 6, fill: '#ff0033', strokeWidth: 2, stroke: 'var(--card-bg)' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="ganancia"
                          stroke="#059669"
                          strokeWidth={2}
                          dot={{ r: 4, fill: '#059669', strokeWidth: 2, stroke: 'var(--card-bg)' }}
                          activeDot={{ r: 6, fill: '#059669', strokeWidth: 2, stroke: 'var(--card-bg)' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Fraccionamientos */}
                {fraccionamientos.length > 0 && (
                  <div className="portal-fraccionamientos-card">
                    <div className="portal-chart-title">Fraccionamientos pendientes</div>
                    <div className="portal-fraccionamientos-list">
                      {fraccionamientos.map((f) => (
                        <div key={f.id} className="portal-fraccionamiento-item">
                          <div className="portal-fraccionamiento-desc">{f.descripcion}</div>
                          <div className="portal-fraccionamiento-detail">
                            Cuota {f.numero_cuota}/{f.total_cuotas} · {formatCurrency(f.monto_cuota)} · S{f.semana}/{f.anio}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="portal-right">
                <div className="portal-weeks-header">Historial de liquidaciones</div>
                <div className="portal-weeks">
                  {facturas.map((f) => {
                    const p = f.periodos_facturacion
                    return (
                      <div key={f.id} className="portal-week-card" onClick={() => openDetail(f)}>
                        <div className="portal-week-left">
                          <div className="portal-week-title">Semana {p.semana} / {p.anio}</div>
                          <div className="portal-week-dates">
                            {format(parseISO(p.fecha_inicio), 'dd/MM/yyyy')} - {format(parseISO(p.fecha_fin), 'dd/MM/yyyy')}
                          </div>
                          <div className="portal-week-info">
                            {f.vehiculo_patente || '-'} · {f.tipo_alquiler} · {f.turnos_cobrados}/{f.turnos_base} turnos
                          </div>
                        </div>
                        <div className="portal-week-right">
                          <div className={`portal-week-total ${f.total_a_pagar > 0 ? 'debit' : 'credit'}`}>
                            {formatCurrency(f.total_a_pagar)}
                          </div>
                          <span className="portal-week-arrow">›</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            {/* Nota legal */}
            <div className="portal-nota-legal">
              La información presentada es de carácter referencial y no constituye un comprobante fiscal válido.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
