import { Info } from 'lucide-react'
import { useDashboardStats } from '../../hooks/useDashboardStats'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { AdaptiveTooltip } from '../../components/ui/AdaptiveTooltip'
import { PeriodComparison } from '../dashboard/components/PeriodComparison'
import { FleetDonut } from '../dashboard/components/FleetDonut'
import { CobroTeoricoVsReal } from '../dashboard/components/CobroTeoricoVsReal'
import { PermanenciaChart } from '../dashboard/components/PermanenciaChart'
import { ZonesAssignmentsChart } from '../dashboard/components/ZonesAssignmentsChart'
import './DashboardKpisModule.css'
import '../dashboard/DashboardModule.css'

/** Pequeño icono (i) con tooltip adaptativo para KPIs */
function KpiInfoIcon({ text }: { text: string }) {
  return (
    <AdaptiveTooltip content={text} width={220} variant="dark">
      <span className="kpi-info-trigger">
        <Info size={13} strokeWidth={2} />
      </span>
    </AdaptiveTooltip>
  )
}

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
                <span className="stat-value">{stats.vueltasMundo.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">VUELTAS AL MUNDO</span>
                  <KpiInfoIcon text="Cantidad de veces que los kilómetros totales recorridos por toda la flota equivalen a dar la vuelta al mundo (40.000 km cada una)." />
                </span>
                <span className="stat-subtitle">{stats.vueltasMundo.subtitle}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.totalFlota.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">TOTAL FLOTA</span>
                  <KpiInfoIcon text="Cantidad total de vehículos registrados, sin contar los dados de baja definitiva (robados, destruidos, jubilados o devueltos al proveedor)." />
                </span>
                <span className="stat-subtitle">{stats.totalFlota.subtitle}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.porcentajeOcupacion.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">% OCUPACIÓN</span>
                  <KpiInfoIcon text="Porcentaje de turnos ocupados por conductores sobre el total de turnos disponibles. Incluye turnos diurnos y nocturnos de cada vehículo asignado." />
                </span>
                <span className="stat-subtitle">{stats.porcentajeOcupacion.subtitle}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.porcentajeOperatividad.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">% OPERATIVIDAD</span>
                  <KpiInfoIcon text="Porcentaje de vehículos que están efectivamente en uso (circulando) respecto al total de la flota." />
                </span>
                <span className="stat-subtitle">{stats.porcentajeOperatividad.subtitle}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.fondoGarantia.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">FONDO DE GARANTÍA</span>
                  <KpiInfoIcon text="Suma total del dinero cobrado en concepto de garantía a todos los conductores que tienen una garantía activa (en curso)." />
                </span>
                <span className="stat-subtitle">{stats.fondoGarantia.subtitle}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.pendienteDevolucion.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">REINTEGRO DE GARANTÍA</span>
                  <KpiInfoIcon text="Monto total de garantías que se deben devolver a conductores que ya no están activos o que están en proceso de devolución." />
                </span>
                <span className="stat-subtitle">{stats.pendienteDevolucion.subtitle}</span>
              </div>
            </div>
            {/* <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.cobroPendiente.value}</span>
                <span className="stat-label">COBRO PENDIENTE (ARRASTRE)</span>
                {stats.cobroPendiente.extra ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="stat-subtitle">{stats.cobroPendiente.extra.deudaSemanaPasada}</span>
                    <span className="stat-subtitle" style={{ opacity: 0.8 }}>
                      ({stats.cobroPendiente.extra.porcentaje}%)
                    </span>
                    <span title={stats.cobroPendiente.extra.tooltip} className="cursor-help flex items-center">
                      <Info size={12} className="text-gray-400" strokeWidth={2} />
                    </span>
                  </div>
                ) : (
                  <span className="stat-subtitle">{stats.cobroPendiente.subtitle}</span>
                )}
              </div>
            </div> */}
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.diasSinSiniestro.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">DÍAS SIN SINIESTRO</span>
                  <KpiInfoIcon text="Cantidad de días transcurridos desde el último siniestro registrado (sin contar robos). Se muestra la fecha del último evento." />
                </span>
                <span className="stat-subtitle">{stats.diasSinSiniestro.subtitle}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.diasSinRobo.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">DÍAS SIN ROBO</span>
                  <KpiInfoIcon text="Cantidad de días transcurridos desde el último robo o robo parcial registrado. Se muestra la fecha del último evento." />
                </span>
                <span className="stat-subtitle">{stats.diasSinRobo.subtitle}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.totalSaldo.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">TOTAL SALDO</span>
                  <KpiInfoIcon text="Suma de todos los saldos pendientes de los conductores (lo que deben) más la mora acumulada por pagos atrasados." />
                </span>
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
