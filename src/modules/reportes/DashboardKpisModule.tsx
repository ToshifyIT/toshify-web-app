import { Info } from 'lucide-react'
import { useDashboardStats } from '../../hooks/useDashboardStats'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { AdaptiveTooltip } from '../../components/ui/AdaptiveTooltip'
import { PeriodComparison } from '../dashboard/components/PeriodComparison'
import { FleetDonut } from '../dashboard/components/FleetDonut'
import { CobroTeoricoVsReal } from '../dashboard/components/CobroTeoricoVsReal'
import { FacturadoVsCobrado } from '../dashboard/components/FacturadoVsCobrado'
import { PermanenciaChart } from '../dashboard/components/PermanenciaChart'
import { ZonesAssignmentsChart } from '../dashboard/components/ZonesAssignmentsChart'
import { ZonasPendientesChart } from '../dashboard/components/ZonasPendientesChart'
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
            {/* 1. VUELTAS AL MUNDO */}
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.vueltasMundo.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">VUELTAS AL MUNDO</span>
                  <KpiInfoIcon text="Kilómetros totales recorridos por la flota (histórico de USS + bitácora de Geotab) expresados en vueltas al mundo (40.000 km cada una)." />
                </span>
                <span className="stat-subtitle">{stats.vueltasMundo.subtitle}</span>
              </div>
            </div>
            {/* 2. TOTAL FLOTA */}
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.totalFlota.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">TOTAL FLOTA</span>
                  <KpiInfoIcon text="Vehículos en uso, PKG ON, PKG OFF (Base y Francia), en taller mecánico o de chapa y pintura y retenidos en comisaría. Disp.: PKG ON sin asignación." />
                </span>
                <span className="stat-subtitle">{stats.totalFlota.subtitle}</span>
              </div>
            </div>
            {/* 3. % OCUPACIÓN */}
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.porcentajeOcupacion.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">% OCUPACIÓN</span>
                  <KpiInfoIcon text="Turnos ocupados sobre el total de turnos (vehículos con asignación y PKG ON sin asignación, 2 turnos cada uno)." />
                </span>
                <span className="stat-subtitle">{stats.porcentajeOcupacion.subtitle}</span>
              </div>
            </div>
            {/* 4. % OPERATIVIDAD */}
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.porcentajeOperatividad.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">% OPERATIVIDAD</span>
                  <KpiInfoIcon text="Vehículos en uso sobre el total de la flota." />
                </span>
                <span className="stat-subtitle">{stats.porcentajeOperatividad.subtitle}</span>
              </div>
            </div>
            {/* 5. DÍAS SIN SINIESTRO */}
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
            {/* 6. DÍAS SIN ROBO */}
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
            {/* 7. FONDO DE GARANTÍA */}
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.fondoGarantia.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">FONDO DE GARANTÍA</span>
                  <KpiInfoIcon text="Monto pagado de las garantías en curso de conductores activos." />
                </span>
                <span className="stat-subtitle">{stats.fondoGarantia.subtitle}</span>
              </div>
            </div>
            {/* 8. REINTEGRO RECIENTE */}
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.reintegroReciente.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">REINTEGRO RECIENTE</span>
                  <KpiInfoIcon text="Garantía a devolver a conductores dados de baja hace menos de 120 días hábiles, después de descontar lo que deben en su cuenta corriente." />
                </span>
                <span className="stat-subtitle">{stats.reintegroReciente.subtitle}</span>
              </div>
            </div>
            {/* 9. REINTEGRO VENCIDO */}
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.reintegroAntiguo.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">REINTEGRO VENCIDO</span>
                  <KpiInfoIcon text="Garantía a devolver a conductores dados de baja hace 120 días hábiles o más, después de descontar lo que deben en su cuenta corriente." />
                </span>
                <span className="stat-subtitle">{stats.reintegroAntiguo.subtitle}</span>
              </div>
            </div>
            {/* 10. SALDO PENDIENTE */}
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.totalSaldoPendiente.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">SALDO PENDIENTE</span>
                  <KpiInfoIcon text="Deuda por cobrar, sin mora. Activos: su deuda completa (la garantía sigue en curso y no se descuenta). Bajas: lo que siguen debiendo después de descontar la garantía retenida; si la garantía cubre la deuda, no suma acá. Entre paréntesis, cantidad de conductores." />
                </span>
                <span className="stat-subtitle">{stats.totalSaldoPendiente.subtitle}</span>
              </div>
            </div>
            {/* 11. DEUDA NO CUBIERTA */}
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.deudaNoCubierta.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">DEUDA NO CUBIERTA</span>
                  <KpiInfoIcon text="Parte de la deuda de los conductores activos que su garantía no alcanza a cubrir. Es lo que quedaría por cobrar si se dieran de baja hoy." />
                </span>
                <span className="stat-subtitle">{stats.deudaNoCubierta.subtitle}</span>
              </div>
            </div>
            {/* 12. COBRO DE MULTAS */}
            <div className="stat-card">
              <div className="stat-content">
                <span className="stat-value">{stats.cobroMultas.value}</span>
                <span className="stat-label">
                  <span className="stat-label-text">COBRO DE MULTAS</span>
                  <KpiInfoIcon text="Suma acumulada de penalidades P007 tipo Multa de tránsito enviadas a facturación." />
                </span>
                <span className="stat-subtitle">{stats.cobroMultas.subtitle}</span>
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
        <div className="dkpis-charts-container">
          <FacturadoVsCobrado />
        </div>
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="w-full lg:w-1/2">
            <PermanenciaChart />
          </div>
          <div className="w-full lg:w-1/2">
            <ZonesAssignmentsChart />
          </div>
        </div>
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="w-full lg:w-1/2">
            <ZonasPendientesChart />
          </div>
        </div>
      </div>
    </div>
  )
}
