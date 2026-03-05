// ============================================================
// Tab de Parámetros del módulo Visitas
// Contiene sub-tabs: Categorías, Motivos, Áreas, Atendedores
// ============================================================

import { useState } from 'react';
import { Tag, FileText, Building2, Users } from 'lucide-react';
import { CategoriasSubTab } from './CategoriasSubTab';
import { MotivosSubTab } from './MotivosSubTab';
import { AreasSubTab } from './AreasSubTab';
import { AtendedoresSubTab } from './AtendedoresSubTab';

type SubTabType = 'categorias' | 'motivos' | 'areas' | 'atendedores';

const SUB_TABS: Array<{ id: SubTabType; label: string; icon: typeof Tag }> = [
  { id: 'categorias', label: 'Categorías', icon: Tag },
  { id: 'motivos', label: 'Motivos', icon: FileText },
  { id: 'areas', label: 'Áreas', icon: Building2 },
  { id: 'atendedores', label: 'Atendedores', icon: Users },
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
        {activeSubTab === 'areas' && <AreasSubTab />}
        {activeSubTab === 'atendedores' && <AtendedoresSubTab />}
      </div>
    </div>
  );
}
