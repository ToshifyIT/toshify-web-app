import { lazy, Suspense, useState } from 'react'
import {
  FileText,
  // Calendar, // Oculto - Períodos movido al tab Reporte
  Shield,
  DollarSign,
  // Settings, // Movido a menú Parámetros
  // Ticket, // Oculto - se maneja desde Incidencias
  // Gauge, // Oculto temporalmente
  // Ban, // Oculto temporalmente
  // UserMinus, // Liquidacion - sin tabla en BD
  // AlertTriangle, // Multas movido a modulo Multas/Telepase
  CreditCard
} from 'lucide-react'
import { usePermissions } from '../../contexts/PermissionsContext'
import { Spinner } from '../../components/ui/LoadingOverlay'

// Lazy-load tabs — solo se carga el JS del tab activo
const ReporteFacturacionTab = lazy(() => import('./tabs/ReporteFacturacionTab').then(m => ({ default: m.ReporteFacturacionTab })))
// const PeriodosTab = lazy(() => import('./tabs/PeriodosTab').then(m => ({ default: m.PeriodosTab }))) // Funcionalidad movida al tab Reporte
const GarantiasTab = lazy(() => import('./tabs/GarantiasTab').then(m => ({ default: m.GarantiasTab })))
const SaldosAbonosTab = lazy(() => import('./tabs/SaldosAbonosTab').then(m => ({ default: m.SaldosAbonosTab })))
const TicketsFavorTab = lazy(() => import('./tabs/TicketsFavorTab').then(m => ({ default: m.TicketsFavorTab })))
// const ConceptosFacturacionTab = lazy(() => import('./tabs/ConceptosFacturacionTab').then(m => ({ default: m.ConceptosFacturacionTab }))) // Movido a menú Parámetros
const ExcesosKmTab = lazy(() => import('./tabs/ExcesosKmTab').then(m => ({ default: m.ExcesosKmTab })))
const BloqueosConductoresTab = lazy(() => import('./tabs/BloqueosConductoresTab').then(m => ({ default: m.BloqueosConductoresTab })))
// const LiquidacionConductoresTab = lazy(() => import('./tabs/LiquidacionConductoresTab').then(m => ({ default: m.LiquidacionConductoresTab }))) // Sin tabla en BD
// const MultasTab = lazy(() => import('./tabs/MultasTab').then(m => ({ default: m.MultasTab }))) // Movido a modulo Multas/Telepase
const CobrosFraccionadosTab = lazy(() => import('./tabs/CobrosFraccionadosTab').then(m => ({ default: m.CobrosFraccionadosTab })))

import './FacturacionModule.css'

type TabType = 'reporte' | 'periodos' | 'garantias' | 'saldos' | 'tickets' | 'excesos' | 'bloqueos' | 'conceptos' | 'cobros_fraccionados'

const TABS = [
  { id: 'reporte' as TabType, label: 'Reporte', icon: FileText },
  // { id: 'periodos' as TabType, label: 'Períodos', icon: Calendar }, // Funcionalidad movida al tab Reporte
  { id: 'garantias' as TabType, label: 'Garantías', icon: Shield },
  { id: 'saldos' as TabType, label: 'Saldos', icon: DollarSign },
  // { id: 'tickets' as TabType, label: 'Tickets', icon: Ticket }, // Oculto - se maneja desde Incidencias
  // { id: 'excesos' as TabType, label: 'Excesos KM', icon: Gauge }, // Oculto temporalmente
  // { id: 'multas' as TabType, label: 'Multas', icon: AlertTriangle }, // Movido a modulo Multas/Telepase
  // { id: 'bloqueos' as TabType, label: 'Bloqueos', icon: Ban }, // Oculto temporalmente
  // { id: 'liquidacion' as TabType, label: 'Liquidacion', icon: UserMinus }, // Sin tabla en BD
  { id: 'cobros_fraccionados' as TabType, label: 'Cobros Fraccionados', icon: CreditCard },
  // { id: 'conceptos' as TabType, label: 'Conceptos', icon: Settings } // Movido a menú Parámetros
]

export function FacturacionModule() {
  const [activeTab, setActiveTab] = useState<TabType>('reporte')
  const { canViewTab } = usePermissions()

  // Filtrar tabs según permisos
  const visibleTabs = TABS.filter(tab => canViewTab(`facturacion:${tab.id}`))

  return (
    <div className="fact-module">
      {/* Tabs */}
      <div className="fact-tabs">
        {visibleTabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              className={`fact-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

       {/* Contenido */}
       <div className="fact-tab-content">
         <Suspense fallback={<Spinner size="lg" />}>
           {activeTab === 'reporte' && <ReporteFacturacionTab />}
           {/* {activeTab === 'periodos' && <PeriodosTab />} */}{/* Funcionalidad movida al tab Reporte */}
           {activeTab === 'garantias' && <GarantiasTab />}
           {activeTab === 'saldos' && <SaldosAbonosTab />}
           {activeTab === 'tickets' && <TicketsFavorTab />}
           {activeTab === 'excesos' && <ExcesosKmTab />}
           {/* Multas movido a modulo Multas/Telepase */}
           {activeTab === 'bloqueos' && <BloqueosConductoresTab />}
           {/* Liquidacion - sin tabla en BD */}
           {activeTab === 'cobros_fraccionados' && <CobrosFraccionadosTab />}
           {/* {activeTab === 'conceptos' && <ConceptosFacturacionTab />} */}{/* Movido a menú Parámetros */}
         </Suspense>
       </div>
    </div>
  )
}
