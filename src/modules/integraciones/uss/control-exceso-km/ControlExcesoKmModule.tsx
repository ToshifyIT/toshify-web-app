// Módulo Control de Exceso de KM
// Submenu de INTEGRACIONES > INTEGRACIONES GPS
// Layout: KPIs arriba + tabla con resumen semanal por conductor que excede el límite + acción "Crear" inline.
// Reusa useUSSHistoricoData (mismo hook de Bitácora) para no duplicar lógica.

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Users, Gauge, DollarSign, ClipboardCheck, AlertCircle } from 'lucide-react'
import Swal from 'sweetalert2'
import { useSede } from '../../../../contexts/SedeContext'
import { useAuth } from '../../../../contexts/AuthContext'
import { useUSSHistoricoData } from '../bitacora/hooks/useUSSHistoricoData'
import { supabase } from '../../../../lib/supabase'
import { BitacoraHeader } from '../bitacora/components'
import { ExcesoKmTable, type ExcesoKmRow } from './components/ExcesoKmTable'
import { ExcesoKmDetalleDrawer } from './components/ExcesoKmDetalleDrawer'
import { crearIncidenciaExcesoKm } from './services/crearIncidenciaExcesoKm'
import { showSuccess, showError } from '../../../../utils/toast'
import '../bitacora/styles/bitacora.css'
import '../styles/uss.css'
import '../../../vehiculos/VehicleManagement.css'
import '../../../vehiculos/alertas-mantenimiento/AlertasMantenimientoModule.css'

// Defaults (override desde parametros_sistema)
const ALQUILER_TURNO_DEFAULT = 245000
const ALQUILER_A_CARGO_DEFAULT = 360000

function porcentajePorKm(km: number): number {
  if (km <= 0) return 0
  if (km > 150) return 35
  if (km > 100) return 25
  if (km > 50) return 20
  return 15
}

// ISO week (lunes = primer día)
function getISOWeek(dateStr: string): { semana: number; anio: number } {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d, 12, 0, 0)
  const target = new Date(date)
  target.setDate(date.getDate() + 4 - (date.getDay() || 7))
  const yearStart = new Date(target.getFullYear(), 0, 1)
  const semana = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { semana, anio: target.getFullYear() }
}

export function ControlExcesoKmModule() {
  const { sedeActualId } = useSede()
  const { user, profile } = useAuth()
  const userName = (profile as any)?.full_name || user?.email || 'admin'

  const {
    marcaciones,
    loading,
    error,
    dateRange,
    setDateRangePreset,
    setCustomDateRange,
    searchTerm,
    handleSearchChange,
    refresh,
  } = useUSSHistoricoData(sedeActualId)

  // Default: arrancar mostrando la SEMANA ANTERIOR COMPLETA (lunes a domingo).
  // Si la semana en curso recién arranca (lunes/martes), no habría datos suficientes.
  // El usuario puede cambiar a "Esta semana" desde el selector.
  const yaForzo = useRef(false)
  useEffect(() => {
    if (yaForzo.current) return
    yaForzo.current = true
    // Trabajamos con strings YYYY-MM-DD para evitar problemas de timezone
    const TZ = 'America/Argentina/Buenos_Aires'
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    const [y, m, d] = todayStr.split('-').map(Number)
    // Construir fecha "anclada" al mediodía local (evita DST/timezone shifts)
    const hoy = new Date(y, m - 1, d, 12, 0, 0)
    const dow = hoy.getDay() === 0 ? 7 : hoy.getDay()
    // Domingo de la semana anterior = hoy - dow días
    const domingoAnterior = new Date(hoy); domingoAnterior.setDate(hoy.getDate() - dow)
    // Lunes de la semana anterior = domingo - 6 días
    const lunesAnterior = new Date(domingoAnterior); lunesAnterior.setDate(domingoAnterior.getDate() - 6)
    const fmt = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    // Calcular n° de semana ISO para el label
    const ref = new Date(lunesAnterior)
    ref.setDate(ref.getDate() + 4 - (ref.getDay() || 7))
    const yearStart = new Date(ref.getFullYear(), 0, 1)
    const semana = Math.ceil(((ref.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    setCustomDateRange(fmt(lunesAnterior), fmt(domingoAnterior), `Semana ${semana}`)
  }, [setCustomDateRange])

  // Parámetros (alquileres) — para mostrar monto en KPIs antes de crear
  const [alquilerTurno, setAlquilerTurno] = useState(ALQUILER_TURNO_DEFAULT)
  const [alquilerACargo, setAlquilerACargo] = useState(ALQUILER_A_CARGO_DEFAULT)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('parametros_sistema')
        .select('clave, valor')
        .in('clave', ['alquiler_turno', 'alquiler_a_cargo'])
      for (const p of (data || []) as any[]) {
        const v = parseFloat(p.valor)
        if (isNaN(v) || v <= 0) continue
        if (p.clave === 'alquiler_turno') setAlquilerTurno(v)
        else if (p.clave === 'alquiler_a_cargo') setAlquilerACargo(v)
      }
    })()
  }, [])

  // IDs de conductores que YA tienen incidencia EXCESO_KM en la semana visible
  const [conductoresConIncidencia, setConductoresConIncidencia] = useState<Set<string>>(new Set())
  const cargarConductoresConIncidencia = useCallback(async () => {
    if (!marcaciones.length) {
      setConductoresConIncidencia(new Set())
      return
    }
    const { semana } = getISOWeek(dateRange.endDate || dateRange.startDate)
    const conductorIds = [...new Set(marcaciones.map(m => m.conductorId).filter(Boolean))] as string[]
    if (conductorIds.length === 0) {
      setConductoresConIncidencia(new Set())
      return
    }
    // tipo EXCESO_KM
    const { data: tipos } = await (supabase.from('tipos_cobro_descuento' as any) as any)
      .select('id, codigo, nombre')
      .eq('is_active', true)
    const tipoExceso = (tipos || []).find((t: any) => t.codigo === 'EXCESO_KM') ||
      (tipos || []).find((t: any) => (t.nombre || '').toLowerCase().includes('exceso'))
    if (!tipoExceso) {
      setConductoresConIncidencia(new Set())
      return
    }
    const { data: incs } = await (supabase
      .from('incidencias' as any)
      .select('conductor_id')
      .eq('tipo_cobro_descuento_id', tipoExceso.id)
      .eq('semana', semana)
      .in('conductor_id', conductorIds) as any)
    setConductoresConIncidencia(new Set((incs || []).map((i: any) => i.conductor_id).filter(Boolean)))
  }, [marcaciones, dateRange.endDate, dateRange.startDate])

  useEffect(() => { cargarConductoresConIncidencia() }, [cargarConductoresConIncidencia])

  // Resumen agrupado por conductor (mismo cálculo que la tabla hace, pero para KPIs)
  const resumen = useMemo(() => {
    const filtered = marcaciones.filter(m => m.excedeLimite === true)
    const grupos = new Map<string, typeof filtered>()
    for (const m of filtered) {
      const key = m.conductorId || m.conductor || ''
      if (!key) continue
      if (!grupos.has(key)) grupos.set(key, [])
      grupos.get(key)!.push(m)
    }
    const filas: Array<{
      conductorId: string | null
      key: string
      km: number
      limite: number
      excedido: number
      modalidad: 'turno' | 'a_cargo'
      ya: boolean
    }> = []
    for (const [key, lista] of grupos) {
      const km = lista.reduce((s, m) => s + (m.kmTotal || 0), 0)
      const limite = lista[0].limiteSemanal || 1800
      const modalidad = lista.some(m => m.vehiculoModalidad === 'a_cargo') ? 'a_cargo' : 'turno'
      const excedido = Math.max(0, km - limite)
      const ultima = lista[lista.length - 1]
      const conductorId = ultima.conductorId
      const ya = !!(conductorId && conductoresConIncidencia.has(conductorId))
      filas.push({ conductorId, key, km, limite, excedido, modalidad, ya })
    }
    return filas
  }, [marcaciones, conductoresConIncidencia])

  // KPIs
  const stats = useMemo(() => {
    const kmExcedidosTotal = resumen.reduce((s, r) => s + r.excedido, 0)
    const pendientes = resumen.filter(r => !r.ya)
    const montoSugerido = pendientes.reduce((s, r) => {
      const valor = r.modalidad === 'a_cargo' ? alquilerACargo : alquilerTurno
      const pct = porcentajePorKm(r.excedido)
      return s + Math.round(valor * (pct / 100) * 1.21)
    }, 0)
    return {
      conductoresExcediendo: resumen.length,
      kmExcedidosTotal: Math.round(kmExcedidosTotal),
      montoSugerido,
      creadas: resumen.filter(r => r.ya).length,
      pendientes: pendientes.length,
    }
  }, [resumen, alquilerTurno, alquilerACargo])

  // Detalle drawer
  const [detalle, setDetalle] = useState<ExcesoKmRow | null>(null)

  // Crear incidencia (acción de la fila)
  const handleCrear = useCallback(async (row: ExcesoKmRow) => {
    if (!row.conductorId) {
      showError('Conductor no vinculado', 'No se pudo identificar el conductor en la base. Cargá la incidencia manualmente.')
      return
    }
    if (row.excedido <= 0) {
      showError('Sin exceso', 'No hay km excedidos que cobrar')
      return
    }
    const { semana, anio } = getISOWeek(dateRange.endDate || dateRange.startDate)

    const confirm = await Swal.fire({
      title: 'Crear incidencia de exceso de KM',
      html: `
        <div style="text-align: left; font-size: 14px; line-height: 1.6;">
          <strong>${row.conductorNombre}</strong> ${row.conductorDni ? `(DNI ${row.conductorDni})` : ''}<br>
          Semana ${semana}/${anio}<br>
          Recorridos: <strong>${row.kmRecorridos.toLocaleString('es-AR')} km</strong> / Límite ${row.limite.toLocaleString('es-AR')}<br>
          Excedido: <strong style="color:#dc2626">${row.excedido.toLocaleString('es-AR')} km</strong> (${row.porcentaje}%)<br>
          Modalidad: ${row.modalidad === 'a_cargo' ? 'A cargo' : 'Turno'}<br>
          Monto estimado: <strong>$${row.monto.toLocaleString('es-AR')}</strong><br><br>
          Se creará en estado <strong>Por Aplicar</strong>.
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a',
    })
    if (!confirm.isConfirmed) return

    const res = await crearIncidenciaExcesoKm({
      conductorId: row.conductorId,
      conductorNombre: row.conductorNombre,
      patente: row.patente || null,
      modalidad: row.modalidad,
      kmRecorridos: row.kmRecorridos,
      kmExcedidos: row.excedido,
      limite: row.limite,
      semana,
      anio,
      semanaInicio: dateRange.startDate,
      semanaFin: dateRange.endDate,
      sedeId: sedeActualId || null,
    }, { userId: user?.id, userName })

    if (res.ok) {
      showSuccess('Incidencia creada', `Apareció en "Por Aplicar" — $${res.monto.toLocaleString('es-AR')}`)
      cargarConductoresConIncidencia()
      refresh()
    } else {
      showError('No se pudo crear', res.error)
    }
  }, [dateRange.endDate, dateRange.startDate, sedeActualId, user?.id, userName, cargarConductoresConIncidencia, refresh])

  const headerControls = (
    <BitacoraHeader
      dateRange={dateRange}
      onDateRangePreset={setDateRangePreset}
      onCustomDateRange={setCustomDateRange}
      isLoading={loading}
    />
  )

  return (
    <div className="veh-module">
      {error && (
        <div style={{ padding: 12, background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.3)', borderRadius: 6, marginBottom: 12, color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* KPIs */}
      <div className="veh-stats">
        <div className="veh-stats-grid alertas-stats-grid">
          <div className="stat-card">
            <Users size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.conductoresExcediendo}</span>
              <span className="stat-label">Conductores excediendo</span>
            </div>
          </div>
          <div className="stat-card">
            <Gauge size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.kmExcedidosTotal.toLocaleString('es-AR')}</span>
              <span className="stat-label">Km excedidos total</span>
            </div>
          </div>
          <div className="stat-card">
            <DollarSign size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">${stats.montoSugerido.toLocaleString('es-AR')}</span>
              <span className="stat-label">Monto a cobrar (pendientes)</span>
            </div>
          </div>
          <div className="stat-card">
            <ClipboardCheck size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.creadas}</span>
              <span className="stat-label">Incidencias creadas</span>
            </div>
          </div>
          <div className="stat-card">
            <AlertCircle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.pendientes}</span>
              <span className="stat-label">Pendientes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <ExcesoKmTable
        marcaciones={marcaciones}
        isLoading={loading}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        headerControls={headerControls}
        conductoresConIncidencia={conductoresConIncidencia}
        alquilerTurno={alquilerTurno}
        alquilerACargo={alquilerACargo}
        onCrear={handleCrear}
        onVerDetalle={setDetalle}
      />

      {/* Drawer detalle */}
      <ExcesoKmDetalleDrawer
        row={detalle}
        onClose={() => setDetalle(null)}
        semanaInicio={dateRange.startDate}
        semanaFin={dateRange.endDate}
      />
    </div>
  )
}
