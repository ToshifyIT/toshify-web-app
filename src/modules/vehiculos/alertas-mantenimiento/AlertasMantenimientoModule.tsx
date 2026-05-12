import { useState } from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle, Wrench, Gauge } from 'lucide-react'
import { useSede } from '../../../contexts/SedeContext'
import { useAuth } from '../../../contexts/AuthContext'
import { useAlertasData } from './hooks/useAlertasData'
import { AlertasTable } from './components/AlertasTable'
import { AlertaDetalleDrawer } from './components/AlertaDetalleDrawer'
import type { AlertaMantenimiento } from './types/alertas.types'
import '../VehicleManagement.css'
import './AlertasMantenimientoModule.css'

export function AlertasMantenimientoModule() {
  const { sedeActualId } = useSede()
  const { user, profile } = useAuth()
  const userName = (profile as any)?.full_name || user?.email || 'admin'

  const {
    alertas, stats, loading,
    accionAtender, accionDescartar, accionReactivar,
  } = useAlertasData(sedeActualId)

  const [selected, setSelected] = useState<AlertaMantenimiento | null>(null)

  return (
    <div className="veh-module">
      {/* Stats */}
      <div className="veh-stats">
        <div className="veh-stats-grid alertas-stats-grid">
          <div className="stat-card">
            <Wrench size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.vehiculosConAlerta}</span>
              <span className="stat-label">Vehículos con alerta</span>
            </div>
          </div>
          <div className="stat-card">
            <AlertOctagon size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.criticas}</span>
              <span className="stat-label">Críticas</span>
            </div>
          </div>
          <div className="stat-card">
            <AlertTriangle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.medias}</span>
              <span className="stat-label">Medias / Altas</span>
            </div>
          </div>
          <div className="stat-card">
            <CheckCircle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.atendidasSemana}</span>
              <span className="stat-label">Atendidas (semana)</span>
            </div>
          </div>
          <div className="stat-card">
            <Gauge size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.kmFlotaAcumulados.toLocaleString('es-AR')}</span>
              <span className="stat-label">Km flota acumulados</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="veh-stats">
        <AlertasTable
          alertas={alertas}
          loading={loading}
          onRowClick={setSelected}
          onAtender={(a) => accionAtender(a.id, userName)}
          onDescartar={(a) => accionDescartar(a.id, userName)}
          onReactivar={(a) => accionReactivar(a.id)}
        />
      </div>

      {/* Drawer detalle (solo lectura — acciones desde la tabla) */}
      <AlertaDetalleDrawer
        alerta={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
