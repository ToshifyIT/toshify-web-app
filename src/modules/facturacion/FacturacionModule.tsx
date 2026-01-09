import { useState } from 'react'
import {
  FileText,
  Calendar,
  Shield,
  DollarSign,
  Settings,
  Ticket,
  Gauge,
  Ban,
  UserMinus
} from 'lucide-react'
import { ReporteFacturacionTab } from './tabs/ReporteFacturacionTab'
import { PeriodosTab } from './tabs/PeriodosTab'
import { GarantiasTab } from './tabs/GarantiasTab'
import { SaldosAbonosTab } from './tabs/SaldosAbonosTab'
import { TicketsFavorTab } from './tabs/TicketsFavorTab'
import { ConceptosFacturacionTab } from './tabs/ConceptosFacturacionTab'
import { ExcesosKmTab } from './tabs/ExcesosKmTab'
import { BloqueosConductoresTab } from './tabs/BloqueosConductoresTab'
import { LiquidacionConductoresTab } from './tabs/LiquidacionConductoresTab'
import './FacturacionModule.css'

type TabType = 'reporte' | 'periodos' | 'garantias' | 'saldos' | 'tickets' | 'excesos' | 'bloqueos' | 'liquidacion' | 'conceptos'

const TABS = [
  { id: 'reporte' as TabType, label: 'Reporte', icon: FileText },
  { id: 'periodos' as TabType, label: 'Períodos', icon: Calendar },
  { id: 'garantias' as TabType, label: 'Garantías', icon: Shield },
  { id: 'saldos' as TabType, label: 'Saldos', icon: DollarSign },
  { id: 'tickets' as TabType, label: 'Tickets', icon: Ticket },
  { id: 'excesos' as TabType, label: 'Excesos KM', icon: Gauge },
  { id: 'bloqueos' as TabType, label: 'Bloqueos', icon: Ban },
  { id: 'liquidacion' as TabType, label: 'Liquidación', icon: UserMinus },
  { id: 'conceptos' as TabType, label: 'Conceptos', icon: Settings }
]

export function FacturacionModule() {
  const [activeTab, setActiveTab] = useState<TabType>('reporte')

  return (
    <div className="fact-module">
      {/* Tabs */}
      <div className="fact-tabs">
        {TABS.map(tab => {
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
        {activeTab === 'periodos' && <PeriodosTab />}
        {activeTab === 'garantias' && <GarantiasTab />}
        {activeTab === 'saldos' && <SaldosAbonosTab />}
        {activeTab === 'tickets' && <TicketsFavorTab />}
        {activeTab === 'excesos' && <ExcesosKmTab />}
        {activeTab === 'bloqueos' && <BloqueosConductoresTab />}
        {activeTab === 'liquidacion' && <LiquidacionConductoresTab />}
        {activeTab === 'conceptos' && <ConceptosFacturacionTab />}
      </div>
    </div>
  )
}
