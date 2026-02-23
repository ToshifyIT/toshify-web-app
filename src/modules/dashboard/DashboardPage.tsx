import { MapPin, ShieldAlert } from 'lucide-react'
import { KpiCards } from './components/KpiCards'
import { PeriodComparison } from './components/PeriodComparison'
import { ChargeChart } from './components/ChargeChart'
import { FleetDonut } from './components/FleetDonut'
import { FinesChart } from './components/FinesChart'
import { PermanenceChart } from './components/PermanenceChart'
import './DashboardModule.css'

export function DashboardPage() {
  return (
    <div className="dashboard-executive">
      <header className="dashboard-header">
        <div className="dashboard-header-info">
          <h1 className="dashboard-title">Dashboard Ejecutivo</h1>
          <p className="dashboard-subtitle">Resumen operativo y financiero</p>
        </div>
        <div className="dashboard-location-badge">
          <span className="dashboard-location">
            <MapPin className="dashboard-location-icon" />
            Buenos Aires
          </span>
          <span className="dashboard-location-chip">
            <ShieldAlert className="dashboard-location-icon" />
            BSAS
          </span>
        </div>
      </header>
      <KpiCards />
      <PeriodComparison />
      <ChargeChart />
      <div className="dashboard-charts-row">
        <FleetDonut />
        <FinesChart />
        <PermanenceChart />
      </div>
    </div>
  )
}

