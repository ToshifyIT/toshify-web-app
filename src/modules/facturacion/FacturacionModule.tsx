import { useState } from 'react'
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
import { ReporteFacturacionTab } from './tabs/ReporteFacturacionTab'
// import { PeriodosTab } from './tabs/PeriodosTab' // Funcionalidad movida al tab Reporte
import { GarantiasTab } from './tabs/GarantiasTab'
import { SaldosAbonosTab } from './tabs/SaldosAbonosTab'
import { TicketsFavorTab } from './tabs/TicketsFavorTab'
// import { ConceptosFacturacionTab } from './tabs/ConceptosFacturacionTab' // Movido a menú Parámetros
import { ExcesosKmTab } from './tabs/ExcesosKmTab'
import { BloqueosConductoresTab } from './tabs/BloqueosConductoresTab'
// import { LiquidacionConductoresTab } from './tabs/LiquidacionConductoresTab' // Sin tabla en BD
// import { MultasTab } from './tabs/MultasTab' // Movido a modulo Multas/Telepase
import { CobrosFraccionadosTab } from './tabs/CobrosFraccionadosTab'
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
       </div>
    </div>
  )
}
