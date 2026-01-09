import { useState } from 'react'
import { FileText, Settings } from 'lucide-react'
import { ReporteNominasTab } from './ReporteNominasTab'
import { ConceptosTab } from './ConceptosTab'
import './NominasModule.css'

type TabType = 'reporte' | 'conceptos'

export function NominasModule() {
  const [activeTab, setActiveTab] = useState<TabType>('reporte')

  return (
    <div className="nom-module">
      {/* Tabs */}
      <div className="nom-tabs">
        <button
          className={`nom-tab ${activeTab === 'reporte' ? 'active' : ''}`}
          onClick={() => setActiveTab('reporte')}
        >
          <FileText size={16} />
          Reporte de Facturación
        </button>
        <button
          className={`nom-tab ${activeTab === 'conceptos' ? 'active' : ''}`}
          onClick={() => setActiveTab('conceptos')}
        >
          <Settings size={16} />
          Conceptos
        </button>
      </div>

      {/* Contenido del tab activo */}
      <div className="nom-tab-content">
        {activeTab === 'reporte' && <ReporteNominasTab />}
        {activeTab === 'conceptos' && <ConceptosTab />}
      </div>
    </div>
  )
}
