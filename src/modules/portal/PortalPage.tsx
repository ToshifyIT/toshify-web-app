// src/modules/portal/PortalPage.tsx
// Portal público para conductores - Mi Facturación
import { useState, useEffect, useCallback, useMemo } from 'react'
import { jsPDF } from 'jspdf'
import { format, parseISO } from 'date-fns'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../types/facturacion.types'
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
  conductor_nombre: string
  conductor_dni: string
  conductor_cuit: string | null
  vehiculo_patente: string | null
  tipo_alquiler: string
  turnos_base: number
  turnos_cobrados: number
  subtotal_cargos: number
  subtotal_descuentos: number
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
}

type View = 'login' | 'dashboard' | 'detail'

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
      const normalized = input.replace(/[-.\s]/g, '')

      const { data, error } = await supabase
        .from('conductores')
        .select('id, nombres, apellidos, numero_dni, numero_cuit')
        .or(`numero_dni.eq.${normalized},numero_cuit.eq.${normalized},numero_cuit.eq.${input}`)
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
          id, periodo_id, conductor_nombre, conductor_dni, conductor_cuit,
          vehiculo_patente, tipo_alquiler, turnos_base, turnos_cobrados,
          subtotal_cargos, subtotal_descuentos, total_a_pagar, estado,
          periodos_facturacion!inner(semana, anio, fecha_inicio, fecha_fin)
        `)
        .eq('conductor_id', conductorId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setFacturas((data || []) as unknown as PortalFacturacion[])
    } catch {
      setFacturas([])
    } finally {
      setLoadingFacturas(false)
    }
  }, [])

  useEffect(() => {
    if (conductor && view === 'dashboard') {
      loadFacturas(conductor.id)
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
        .select('id, facturacion_id, concepto_codigo, concepto_descripcion, cantidad, precio_unitario, subtotal, total, es_descuento')
        .eq('facturacion_id', factura.id)
        .order('es_descuento')
        .order('concepto_codigo')

      if (error) throw error
      setDetalleItems((data || []) as PortalDetalle[])
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
      pdf.text('FACTURACIÓN', pageWidth - margin, y, { align: 'right' })

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
      y += 10

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
      pdf.text(`Tipo: ${selectedFactura.tipo_alquiler}`, margin, y)
      pdf.text(`Turnos: ${selectedFactura.turnos_cobrados}/${selectedFactura.turnos_base}`, pageWidth / 2, y)
      y += 10

      // Línea separadora
      pdf.setDrawColor(200, 200, 200)
      pdf.setLineWidth(0.2)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 8

      // CARGOS
      const cargos = detalleItems.filter(d => !d.es_descuento && d.total !== 0)
      pdf.setFontSize(11)
      pdf.setTextColor(rojo)
      pdf.setFont('helvetica', 'bold')
      pdf.text('CARGOS', margin, y)
      y += 7

      pdf.setFontSize(10)
      pdf.setTextColor(negro)
      pdf.setFont('helvetica', 'normal')
      cargos.forEach(cargo => {
        pdf.text(cargo.concepto_descripcion, margin, y)
        pdf.text(formatCurrency(cargo.total), pageWidth - margin, y, { align: 'right' })
        y += 5
      })

      y += 3
      pdf.setFont('helvetica', 'bold')
      const subtotalCargos = cargos.reduce((sum, c) => sum + c.total, 0)
      pdf.text('SUBTOTAL CARGOS', margin, y)
      pdf.text(formatCurrency(subtotalCargos), pageWidth - margin, y, { align: 'right' })
      y += 10

      // DESCUENTOS
      const descuentos = detalleItems.filter(d => d.es_descuento && d.total !== 0)
      if (descuentos.length > 0) {
        pdf.setFontSize(11)
        pdf.setTextColor(verde)
        pdf.setFont('helvetica', 'bold')
        pdf.text('DESCUENTOS / CRÉDITOS', margin, y)
        y += 7

        pdf.setFontSize(10)
        pdf.setTextColor(negro)
        pdf.setFont('helvetica', 'normal')
        descuentos.forEach(desc => {
          pdf.text(desc.concepto_descripcion, margin, y)
          pdf.text(`-${formatCurrency(desc.total)}`, pageWidth - margin, y, { align: 'right' })
          y += 5
        })

        y += 3
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(verde)
        const subtotalDesc = descuentos.reduce((sum, d) => sum + d.total, 0)
        pdf.text('SUBTOTAL DESCUENTOS', margin, y)
        pdf.text(`-${formatCurrency(subtotalDesc)}`, pageWidth - margin, y, { align: 'right' })
        y += 10
      }

      // TOTAL
      pdf.setDrawColor(200, 200, 200)
      pdf.setLineWidth(0.5)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 8

      const subtotalDescPdf = descuentos.reduce((sum, d) => sum + d.total, 0)
      const totalFinal = subtotalCargos - subtotalDescPdf
      const saldoColor = totalFinal > 0 ? rojo : verde

      pdf.setFontSize(14)
      pdf.setTextColor(saldoColor)
      pdf.setFont('helvetica', 'bold')
      pdf.text('TOTAL A PAGAR', margin, y)
      pdf.text(formatCurrency(totalFinal), pageWidth - margin, y, { align: 'right' })

      // Pie de página
      pdf.setFontSize(8)
      pdf.setTextColor(gris)
      pdf.text(`Generado el ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, margin, pdf.internal.pageSize.getHeight() - 10)
      pdf.text('TOSHIFY - Sistema de Gestión de Flota', pageWidth - margin, pdf.internal.pageSize.getHeight() - 10, { align: 'right' })

      // Guardar
      const nombreArchivo = `Facturacion_${selectedFactura.conductor_nombre.replace(/\s+/g, '_')}_Semana${periodo.semana}_${periodo.anio}.pdf`
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

    // Chart data: últimas 12 semanas en orden cronológico
    const chartData = facturas
      .slice(0, 12)
      .map(f => ({
        label: `S${f.periodos_facturacion.semana}`,
        total: f.total_a_pagar,
      }))
      .reverse()

    return { sum, promedio, ultima, variacion, totalSemanas: facturas.length, chartData }
  }, [facturas])

  // =====================================================
  // RENDER: LOGIN
  // =====================================================

  if (view === 'login') {
    return (
      <div className="portal portal-login">
        <form className="portal-login-card" onSubmit={handleLogin}>
          <img src={logoToshifyUrl} alt="Toshify" className="portal-login-logo" />
          <h1 className="portal-login-title">Mi Facturación</h1>
          <p className="portal-login-subtitle">Ingresá tu DNI o CUIT para ver tu liquidación</p>

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
                  <span className="portal-detail-info-label">Tipo</span>
                  <span className="portal-detail-info-value">{selectedFactura.tipo_alquiler}</span>
                </div>
                <div className="portal-detail-info-item">
                  <span className="portal-detail-info-label">Turnos</span>
                  <span className="portal-detail-info-value">{selectedFactura.turnos_cobrados}/{selectedFactura.turnos_base}</span>
                </div>
              </div>

              <div className="portal-detail-body">
                {/* CARGOS */}
                {cargos.length > 0 && (
                  <div className="portal-detail-section">
                    <div className="portal-detail-section-title cargos">Cargos</div>
                    <div className="portal-detail-items">
                      {cargos.map((item) => (
                        <div key={item.id} className="portal-detail-item">
                          <span className="portal-detail-item-name">
                            <span className="portal-detail-item-dot cargo" />
                            {item.concepto_descripcion}
                            {item.cantidad > 1 && ` x${item.cantidad}`}
                          </span>
                          <span className="portal-detail-item-amount">{formatCurrency(item.total)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="portal-detail-subtotal cargos">
                      <span>Subtotal Cargos</span>
                      <span>{formatCurrency(subtotalCargos)}</span>
                    </div>
                  </div>
                )}

                {/* DESCUENTOS */}
                {descuentos.length > 0 && (
                  <div className="portal-detail-section">
                    <div className="portal-detail-section-title descuentos">Descuentos / Créditos</div>
                    <div className="portal-detail-items">
                      {descuentos.map((item) => (
                        <div key={item.id} className="portal-detail-item">
                          <span className="portal-detail-item-name">
                            <span className="portal-detail-item-dot descuento" />
                            {item.concepto_descripcion}
                          </span>
                          <span className="portal-detail-item-amount" style={{ color: '#059669' }}>
                            -{formatCurrency(item.total)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="portal-detail-subtotal descuentos">
                      <span>Subtotal Descuentos</span>
                      <span>-{formatCurrency(subtotalDescuentos)}</span>
                    </div>
                  </div>
                )}

                {/* TOTAL */}
                <div className="portal-detail-total">
                  <div className="portal-detail-total-label">Total a Pagar</div>
                  <div className={`portal-detail-total-amount ${totalAPagar > 0 ? 'debit' : 'credit'}`}>
                    {formatCurrency(totalAPagar)}
                  </div>
                  <div className="portal-detail-total-note">
                    {totalAPagar > 0 ? 'El conductor debe pagar' : totalAPagar < 0 ? 'Saldo a favor' : 'Sin saldo'}
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
        ) : (
          <>
            {/* Dashboard panel */}
            {stats && (
              <div className="portal-dashboard">
                {/* Stats row */}
                <div className="portal-stats">
                  <div className="portal-stat-card">
                    <div className="portal-stat-label">Última semana</div>
                    <div className="portal-stat-value debit">{formatCurrency(stats.ultima)}</div>
                    {stats.variacion !== 0 && (
                      <div className={`portal-stat-change ${stats.variacion > 0 ? 'up' : 'down'}`}>
                        {stats.variacion > 0 ? '↑' : '↓'} {Math.abs(stats.variacion).toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <div className="portal-stat-card">
                    <div className="portal-stat-label">Promedio semanal</div>
                    <div className="portal-stat-value">{formatCurrency(stats.promedio)}</div>
                    <div className="portal-stat-sub">{stats.totalSemanas} semanas</div>
                  </div>
                  <div className="portal-stat-card">
                    <div className="portal-stat-label">Total acumulado</div>
                    <div className="portal-stat-value">{formatCurrency(stats.sum)}</div>
                  </div>
                </div>

                {/* Chart */}
                {stats.chartData.length > 2 && (
                  <div className="portal-chart-card">
                    <div className="portal-chart-title">Evolución semanal</div>
                    <div className="portal-chart-container">
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={stats.chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="portalGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ff0033" stopOpacity={0.15} />
                              <stop offset="95%" stopColor="#ff0033" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: '#9ca3af' }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis hide />
                          <Tooltip
                            formatter={(value: string | number) => formatCurrency(Number(value))}
                            contentStyle={{
                              background: '#1f2937',
                              border: 'none',
                              borderRadius: '8px',
                              fontSize: '12px',
                              color: '#fff',
                            }}
                            labelStyle={{ color: '#9ca3af' }}
                          />
                          <Area
                            type="monotone"
                            dataKey="total"
                            stroke="#ff0033"
                            strokeWidth={2}
                            fill="url(#portalGrad)"
                            dot={{ r: 3, fill: '#ff0033', strokeWidth: 0 }}
                            activeDot={{ r: 5, fill: '#ff0033', strokeWidth: 2, stroke: '#fff' }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Week list */}
            <div className="portal-weeks-header">Historial de liquidaciones</div>
            <div className="portal-weeks">
              {facturas.map((f) => {
                const p = f.periodos_facturacion
                return (
                  <div
                    key={f.id}
                    className="portal-week-card"
                    onClick={() => openDetail(f)}
                  >
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
          </>
        )}
      </div>
    </div>
  )
}
