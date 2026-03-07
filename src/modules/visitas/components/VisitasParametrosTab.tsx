// ============================================================
// Tab de Parámetros del módulo Visitas
// Contiene sub-tabs: Categorías, Motivos, Anfitriones
// ============================================================

import { useState } from 'react';
import { Tag, FileText, Users } from 'lucide-react';
import { CategoriasSubTab } from './CategoriasSubTab';
import { MotivosSubTab } from './MotivosSubTab';
import { AtendedoresSubTab } from './AtendedoresSubTab';

type SubTabType = 'categorias' | 'motivos' | 'atendedores';

const SUB_TABS: Array<{ id: SubTabType; label: string; icon: typeof Tag }> = [
  { id: 'categorias', label: 'Categorías', icon: Tag },
  { id: 'motivos', label: 'Motivos', icon: FileText },
  { id: 'atendedores', label: 'Anfitriones', icon: Users },
];

export function VisitasParametrosTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTabType>('categorias');

  return (
    <div className="visitas-params">
      {/* Sub-tabs */}
      <div className="visitas-subtabs">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`visitas-subtab ${activeSubTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveSubTab(tab.id)}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Contenido del sub-tab activo */}
      <div className="visitas-subtab-content">
        {activeSubTab === 'categorias' && <CategoriasSubTab />}
        {activeSubTab === 'motivos' && <MotivosSubTab />}
        {activeSubTab === 'atendedores' && <AtendedoresSubTab />}
      </div>
    </div>
  );
}
