import { useDashboardStats } from '../../../hooks/useDashboardStats'
import { Car, TrendingUp, Clock } from 'lucide-react'

export function KpiCards() {
  const { stats, loading } = useDashboardStats()

  if (loading) {
    return (
      <div className="dashboard-kpi-grid">
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="dashboard-kpi-card"
          >
            <span
              className="dashboard-kpi-value"
              style={{ backgroundColor: '#f3f4f6', borderRadius: 8 }}
            >
              &nbsp;
            </span>
            <span
              className="dashboard-kpi-label"
              style={{ backgroundColor: '#f9fafb', borderRadius: 6 }}
            >
              &nbsp;
            </span>
            <span
              className="dashboard-kpi-subtitle"
              style={{ backgroundColor: '#f9fafb', borderRadius: 6 }}
            >
              &nbsp;
            </span>
          </div>
        ))}
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="dashboard-kpi-grid">
        <div className="dashboard-kpi-card">
          <span className="dashboard-kpi-value">-</span>
          <span className="dashboard-kpi-label">Sin datos</span>
          <span className="dashboard-kpi-subtitle">Revisa conexión</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="dashboard-op-strip">
        <div className="dashboard-op-card">
          <Car className="dashboard-op-icon" />
          <div className="dashboard-op-content">
            <span className="dashboard-op-value">
              {stats.totalFlota.value}
            </span>
            <span className="dashboard-op-label">
              TOTAL FLOTA
            </span>
          </div>
        </div>
        <div className="dashboard-op-card">
          <Car className="dashboard-op-icon" />
          <div className="dashboard-op-content">
            <span className="dashboard-op-value">
              {stats.vehiculosActivos.value}
            </span>
            <span className="dashboard-op-label">
              VEHÍCULOS ACTIVOS
            </span>
          </div>
        </div>
        <div className="dashboard-op-card">
          <Car className="dashboard-op-icon" />
          <div className="dashboard-op-content">
            <span className="dashboard-op-value">
              {stats.disponibles.value}
            </span>
            <span className="dashboard-op-label">
              DISPONIBLES
            </span>
          </div>
        </div>
        <div className="dashboard-op-card">
          <Clock className="dashboard-op-icon" />
          <div className="dashboard-op-content">
            <span className="dashboard-op-value">
              {stats.turnosDisponibles.value}
            </span>
            <span className="dashboard-op-label">
              TURNOS DISPONIBLES
            </span>
          </div>
        </div>
        <div className="dashboard-op-card">
          <TrendingUp className="dashboard-op-icon" />
          <div className="dashboard-op-content">
            <span className="dashboard-op-value">
              {stats.porcentajeOcupacion.value}
            </span>
            <span className="dashboard-op-label">
              % OCUPACIÓN
            </span>
          </div>
        </div>
        <div className="dashboard-op-card">
          <TrendingUp className="dashboard-op-icon" />
          <div className="dashboard-op-content">
            <span className="dashboard-op-value">
              {stats.porcentajeOperatividad.value}
            </span>
            <span className="dashboard-op-label">
              % OPERATIVIDAD
            </span>
          </div>
        </div>
      </div>
      <div className="dashboard-kpi-grid">
        <div className="dashboard-kpi-card">
          <span className="dashboard-kpi-value">
            {stats.totalFlota.value}
          </span>
          <span className="dashboard-kpi-label">
            TOTAL FLOTA
          </span>
          <span className="dashboard-kpi-subtitle">
            {stats.totalFlota.subtitle}
          </span>
        </div>
        <div className="dashboard-kpi-card">
          <span className="dashboard-kpi-value">
            {stats.porcentajeOcupacion.value}
          </span>
          <span className="dashboard-kpi-label">
            % OCUPACIÓN
          </span>
          <span className="dashboard-kpi-subtitle">
            {stats.porcentajeOcupacion.subtitle}
          </span>
        </div>
        <div className="dashboard-kpi-card">
          <span className="dashboard-kpi-value">
            {stats.porcentajeOperatividad.value}
          </span>
          <span className="dashboard-kpi-label">
            % OPERATIVIDAD
          </span>
          <span className="dashboard-kpi-subtitle">
            {stats.porcentajeOperatividad.subtitle}
          </span>
        </div>
        <div className="dashboard-kpi-card">
          <span className="dashboard-kpi-value">
            {stats.fondoGarantia.value}
          </span>
          <span className="dashboard-kpi-label">
            FONDO DE GARANTÍA
          </span>
          <span className="dashboard-kpi-subtitle">
            {stats.fondoGarantia.subtitle}
          </span>
        </div>
        <div className="dashboard-kpi-card">
          <span className="dashboard-kpi-value">
            {stats.pendienteDevolucion.value}
          </span>
          <span className="dashboard-kpi-label">
            PENDIENTE DEVOLUCIÓN
          </span>
          <span className="dashboard-kpi-subtitle">
            {stats.pendienteDevolucion.subtitle}
          </span>
        </div>
        <div className="dashboard-kpi-card">
          <span className="dashboard-kpi-value">
            {stats.diasSinSiniestro.value}
          </span>
          <span className="dashboard-kpi-label">
            DÍAS SIN SINIESTRO
          </span>
          <span className="dashboard-kpi-subtitle">
            {stats.diasSinSiniestro.subtitle}
          </span>
        </div>
        <div className="dashboard-kpi-card">
          <span className="dashboard-kpi-value">
            {stats.diasSinRobo.value}
          </span>
          <span className="dashboard-kpi-label">
            DÍAS SIN ROBO
          </span>
          <span className="dashboard-kpi-subtitle">
            {stats.diasSinRobo.subtitle}
          </span>
        </div>
      </div>
    </>
  )
}

