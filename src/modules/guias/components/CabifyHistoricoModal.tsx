import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { normalizeDni } from '../../../utils/normalizeDocuments'
import { X, TrendingUp, Clock, DollarSign, Car } from 'lucide-react'
import './CabifyHistoricoModal.css'

interface CabifyHistoricoModalProps {
  isOpen: boolean
  onClose: () => void
  conductor: {
    id: string
    nombres: string
    apellidos: string
    numero_dni: string
  } | null
  semana: string // e.g. "2026-W11"
}

interface CabifyRecord {
  fecha_inicio: string
  cobro_efectivo: number
  cobro_app: number
  ganancia_total: number
  ganancia_por_hora: number
  horas_conectadas: number
  horas_conectadas_formato: string
  tasa_aceptacion: number
  tasa_ocupacion: number
  viajes_finalizados: number
  viajes_rechazados: number
  viajes_perdidos: number
  viajes_aceptados: number
  viajes_ofrecidos: number
  score: number
  peajes: number
  permiso_efectivo: string
  fecha_guardado: string
  vehiculo_completo: string
}

const formatCurrency = (val: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val)
}

const formatPercent = (val: number): string => {
  return `${val.toFixed(2)}%`
}

/**
 * Calcula el rango de fechas (lunes a domingo) para una semana ISO.
 * Para la semana actual, usa CURRENT_DATE como fin.
 */
function getWeekRange(semana: string): { start: string; end: string } {
  const [yearStr, weekStr] = semana.split('-W')
  const year = parseInt(yearStr)
  const week = parseInt(weekStr)

  // Lunes de la semana ISO 1
  const jan4 = new Date(year, 0, 4)
  const dayOfWeek = jan4.getDay() || 7 // 1=Mon ... 7=Sun
  const mondayW1 = new Date(jan4)
  mondayW1.setDate(jan4.getDate() - (dayOfWeek - 1))

  // Lunes de la semana solicitada
  const monday = new Date(mondayW1)
  monday.setDate(mondayW1.getDate() + (week - 1) * 7)

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  // Verificar si es semana actual
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isCurrentWeek = today >= monday && today <= sunday

  const formatDate = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }

  return {
    start: formatDate(monday),
    end: isCurrentWeek ? formatDate(today) : formatDate(sunday),
  }
}

export function CabifyHistoricoModal({
  isOpen,
  onClose,
  conductor,
  semana,
}: CabifyHistoricoModalProps) {
  const [records, setRecords] = useState<CabifyRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && conductor && semana) {
      loadData()
    }
    return () => {
      setRecords([])
      setError(null)
    }
  }, [isOpen, conductor?.id, semana])

  const loadData = async () => {
    if (!conductor) return
    setLoading(true)
    setError(null)

    try {
      const { start, end } = getWeekRange(semana)
      const dniNormalized = normalizeDni(conductor.numero_dni)

      if (!dniNormalized) {
        setError('El conductor no tiene DNI registrado.')
        return
      }

      // Consulta única con DNI incluido para filtrar en JS
      const { data: dataWithDni, error: fetchError2 } = await supabase
        .from('cabify_historico')
        .select(
          'dni, fecha_inicio, cobro_efectivo, cobro_app, ganancia_total, ganancia_por_hora, horas_conectadas, horas_conectadas_formato, tasa_aceptacion, tasa_ocupacion, viajes_finalizados, viajes_rechazados, viajes_perdidos, viajes_aceptados, viajes_ofrecidos, score, peajes, permiso_efectivo, fecha_guardado, vehiculo_completo'
        )
        .gte('fecha_inicio', start)
        .lte('fecha_inicio', end)
        .order('fecha_inicio', { ascending: true })
        .order('fecha_guardado', { ascending: false })

      if (fetchError2) throw fetchError2

      // Filtrar por DNI normalizado
      const matchedRecords = (dataWithDni || []).filter((r: any) => {
        const rDni = normalizeDni(r.dni || '')
        return rDni === dniNormalized
      })

      // Deduplicar por día: quedarse con el registro con fecha_guardado más reciente
      const byDay = new Map<string, any>()
      for (const record of matchedRecords) {
        const day = record.fecha_inicio ? record.fecha_inicio.split('T')[0] : ''
        const existing = byDay.get(day)
        if (!existing) {
          byDay.set(day, record)
        } else {
          const existingDate = new Date(existing.fecha_guardado || 0)
          const currentDate = new Date(record.fecha_guardado || 0)
          if (currentDate > existingDate) {
            byDay.set(day, record)
          }
        }
      }

      const deduplicated: CabifyRecord[] = Array.from(byDay.values()).map((r: any) => ({
        fecha_inicio: r.fecha_inicio,
        cobro_efectivo: Number(r.cobro_efectivo || 0),
        cobro_app: Number(r.cobro_app || 0),
        ganancia_total: Number(r.ganancia_total || 0),
        ganancia_por_hora: Number(r.ganancia_por_hora || 0),
        horas_conectadas: Number(r.horas_conectadas || 0),
        horas_conectadas_formato: r.horas_conectadas_formato || '-',
        tasa_aceptacion: Number(r.tasa_aceptacion || 0),
        tasa_ocupacion: Number(r.tasa_ocupacion || 0),
        viajes_finalizados: Number(r.viajes_finalizados || 0),
        viajes_rechazados: Number(r.viajes_rechazados || 0),
        viajes_perdidos: Number(r.viajes_perdidos || 0),
        viajes_aceptados: Number(r.viajes_aceptados || 0),
        viajes_ofrecidos: Number(r.viajes_ofrecidos || 0),
        score: Number(r.score || 0),
        peajes: Number(r.peajes || 0),
        permiso_efectivo: r.permiso_efectivo || '-',
        fecha_guardado: r.fecha_guardado,
        vehiculo_completo: r.vehiculo_completo || '-',
      }))

      setRecords(deduplicated)
    } catch (err: any) {
      setError(err.message || 'Error al cargar datos de Cabify')
    } finally {
      setLoading(false)
    }
  }

  // Totales acumulados
  const totals = useMemo(() => {
    return records.reduce(
      (acc, r) => ({
        cobro_efectivo: acc.cobro_efectivo + r.cobro_efectivo,
        cobro_app: acc.cobro_app + r.cobro_app,
        ganancia_total: acc.ganancia_total + r.ganancia_total,
        peajes: acc.peajes + r.peajes,
        horas_conectadas: acc.horas_conectadas + r.horas_conectadas,
        viajes_finalizados: acc.viajes_finalizados + r.viajes_finalizados,
        viajes_rechazados: acc.viajes_rechazados + r.viajes_rechazados,
        viajes_perdidos: acc.viajes_perdidos + r.viajes_perdidos,
        viajes_aceptados: acc.viajes_aceptados + r.viajes_aceptados,
        viajes_ofrecidos: acc.viajes_ofrecidos + r.viajes_ofrecidos,
      }),
      {
        cobro_efectivo: 0,
        cobro_app: 0,
        ganancia_total: 0,
        peajes: 0,
        horas_conectadas: 0,
        viajes_finalizados: 0,
        viajes_rechazados: 0,
        viajes_perdidos: 0,
        viajes_aceptados: 0,
        viajes_ofrecidos: 0,
      }
    )
  }, [records])

  const formatDay = (fecha: string) => {
    try {
      // Extraer solo la parte de fecha (YYYY-MM-DD) para evitar desplazamientos por timezone
      const dateStr = fecha.split('T')[0]
      const [y, m, d] = dateStr.split('-').map(Number)
      // Crear fecha en hora local mediodía para evitar cambios de día
      const localDate = new Date(y, m - 1, d, 12, 0, 0)
      return localDate.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })
    } catch {
      return fecha
    }
  }

  if (!isOpen || !conductor) return null

  const { start, end } = getWeekRange(semana)

  return (
    <div className="cabify-historico-overlay" onClick={onClose}>
      <div className="cabify-historico-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="cabify-historico-header">
          <div>
            <h2 className="cabify-historico-title">
              Datos Cabify — {conductor.nombres} {conductor.apellidos}
            </h2>
            <p className="cabify-historico-subtitle">
              DNI: {conductor.numero_dni} · Semana: {semana} · Rango: {start} a {end}
            </p>
          </div>
          <button className="cabify-historico-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="cabify-historico-body">
          {loading ? (
            <div className="cabify-historico-loading">Cargando datos de Cabify...</div>
          ) : error ? (
            <div className="cabify-historico-error">{error}</div>
          ) : records.length === 0 ? (
            <div className="cabify-historico-empty">
              No se encontraron registros en cabify_historico para este conductor en la semana seleccionada.
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="cabify-historico-summary">
                <div className="cabify-summary-card">
                  <DollarSign size={16} className="text-green-500" />
                  <div>
                    <span className="cabify-summary-value">{formatCurrency(totals.cobro_app)}</span>
                    <span className="cabify-summary-label">App</span>
                  </div>
                </div>
                <div className="cabify-summary-card">
                  <DollarSign size={16} className="text-blue-500" />
                  <div>
                    <span className="cabify-summary-value">{formatCurrency(totals.cobro_efectivo)}</span>
                    <span className="cabify-summary-label">Efectivo</span>
                  </div>
                </div>
                <div className="cabify-summary-card">
                  <TrendingUp size={16} className="text-purple-500" />
                  <div>
                    <span className="cabify-summary-value">{formatCurrency(totals.ganancia_total)}</span>
                    <span className="cabify-summary-label">Total</span>
                  </div>
                </div>
                <div className="cabify-summary-card">
                  <Clock size={16} className="text-orange-500" />
                  <div>
                    <span className="cabify-summary-value">{totals.horas_conectadas.toFixed(1)}h</span>
                    <span className="cabify-summary-label">Horas</span>
                  </div>
                </div>
                <div className="cabify-summary-card">
                  <Car size={16} className="text-indigo-500" />
                  <div>
                    <span className="cabify-summary-value">{totals.viajes_finalizados}</span>
                    <span className="cabify-summary-label">Viajes</span>
                  </div>
                </div>
              </div>

              {/* Detail Table */}
              <div className="cabify-historico-table-wrapper">
                <table className="cabify-historico-table">
                  <thead>
                    <tr>
                      <th>Día</th>
                      <th>App</th>
                      <th>Efectivo</th>
                      <th>Total</th>
                      <th>$/Hora</th>
                      <th>Horas</th>
                      <th>Viajes</th>
                      <th>Rechaz.</th>
                      <th>Perdidos</th>
                      <th>Acept.</th>
                      <th>% Ocup.</th>
                      <th>Score</th>
                      <th>Peajes</th>
                      <th>Vehículo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, idx) => (
                      <tr key={idx}>
                        <td className="cabify-td-day">{formatDay(r.fecha_inicio)}</td>
                        <td className="cabify-td-currency">{formatCurrency(r.cobro_app)}</td>
                        <td className="cabify-td-currency">{formatCurrency(r.cobro_efectivo)}</td>
                        <td className="cabify-td-currency cabify-td-bold">{formatCurrency(r.ganancia_total)}</td>
                        <td className="cabify-td-currency">{formatCurrency(r.ganancia_por_hora)}</td>
                        <td>{r.horas_conectadas_formato}</td>
                        <td>{r.viajes_finalizados}</td>
                        <td>{r.viajes_rechazados}</td>
                        <td>{r.viajes_perdidos}</td>
                        <td>{formatPercent(r.tasa_aceptacion)}</td>
                        <td>{formatPercent(r.tasa_ocupacion)}</td>
                        <td>{r.score.toFixed(2)}</td>
                        <td>{formatCurrency(r.peajes)}</td>
                        <td className="cabify-td-vehicle">{r.vehiculo_completo}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="cabify-total-row">
                      <td><strong>TOTAL</strong></td>
                      <td className="cabify-td-currency"><strong>{formatCurrency(totals.cobro_app)}</strong></td>
                      <td className="cabify-td-currency"><strong>{formatCurrency(totals.cobro_efectivo)}</strong></td>
                      <td className="cabify-td-currency cabify-td-bold"><strong>{formatCurrency(totals.ganancia_total)}</strong></td>
                      <td>-</td>
                      <td><strong>{totals.horas_conectadas.toFixed(1)}h</strong></td>
                      <td><strong>{totals.viajes_finalizados}</strong></td>
                      <td><strong>{totals.viajes_rechazados}</strong></td>
                      <td><strong>{totals.viajes_perdidos}</strong></td>
                      <td>-</td>
                      <td>-</td>
                      <td>-</td>
                      <td><strong>{formatCurrency(totals.peajes)}</strong></td>
                      <td>-</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
