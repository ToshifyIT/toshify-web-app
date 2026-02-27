import { useDashboardStats } from '../../hooks/useDashboardStats'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { PeriodComparison } from '../dashboard/components/PeriodComparison'
import { FleetDonut } from '../dashboard/components/FleetDonut'
import { CobroTeoricoVsReal } from '../dashboard/components/CobroTeoricoVsReal'
import { PermanenciaChart } from '../dashboard/components/PermanenciaChart'
import { ZonesAssignmentsChart } from '../dashboard/components/ZonesAssignmentsChart'
import './DashboardKpisModule.css'
import '../dashboard/DashboardModule.css'

export function DashboardKpisModule() {
  const { stats, loading } = useDashboardStats()

  return (
    <div className="dkpis-module">
      <LoadingOverlay show={loading} message="Cargando KPIs de flota..." size="lg" />
      <div className="dkpis-stats">
        {stats && (
          <div className="dkpis-stats-grid">
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.totalFlota.value}</span>
                <span className="stat-label">TOTAL FLOTA</span>
                <span className="stat-subtitle">{stats.totalFlota.subtitle}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.porcentajeOcupacion.value}</span>
                <span className="stat-label">% OCUPACIÓN</span>
                <span className="stat-subtitle">{stats.porcentajeOcupacion.subtitle}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.porcentajeOperatividad.value}</span>
                <span className="stat-label">% OPERATIVIDAD</span>
                <span className="stat-subtitle">{stats.porcentajeOperatividad.subtitle}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.fondoGarantia.value}</span>
                <span className="stat-label">FONDO DE GARANTÍA</span>
                <span className="stat-subtitle">{stats.fondoGarantia.subtitle}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.pendienteDevolucion.value}</span>
                <span className="stat-label">PENDIENTE DEVOLUCIÓN</span>
                <span className="stat-subtitle">{stats.pendienteDevolucion.subtitle}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.diasSinSiniestro.value}</span>
                <span className="stat-label">DÍAS SIN SINIESTRO</span>
                <span className="stat-subtitle">{stats.diasSinSiniestro.subtitle}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.diasSinRobo.value}</span>
                <span className="stat-label">DÍAS SIN ROBO</span>
                <span className="stat-subtitle">{stats.diasSinRobo.subtitle}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.totalSaldo.value}</span>
                <span className="stat-label">TOTAL SALDO</span>
                <span className="stat-subtitle">{stats.totalSaldo.subtitle}</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <PeriodComparison />
      
      <div className="flex flex-col gap-4">
        <div className="dkpis-charts-container">
          <FleetDonut />
          <CobroTeoricoVsReal />
        </div>
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="w-full lg:w-1/2">
            <PermanenciaChart />
          </div>
          <div className="w-full lg:w-1/2">
            <ZonesAssignmentsChart />
          </div>
        </div>
      </div>
    </div>
  )
}

