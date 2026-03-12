// src/modules/integraciones/uss/bitacora/BitacoraModule.tsx
/**
 * Módulo principal de Bitácora - Control de Turnos
 * Marcaciones: datos sumarizados de wialon_bitacora (1 fila/conductor/día)
 * Histórico: registros crudos de uss_historico
 */

import { useMemo } from 'react';
import { UserCheck, List } from 'lucide-react';
import { useUSSHistoricoData } from './hooks/useUSSHistoricoData';
import { BitacoraHeader } from './components';
import { HistoricoTable } from './components/HistoricoTable';
import { MarcacionesTable } from './components/MarcacionesTable';
import './styles/bitacora.css';
import '../styles/uss.css';

type VistaType = 'marcaciones' | 'historico';

const TABS: { id: VistaType; label: string; icon: typeof UserCheck }[] = [
  { id: 'marcaciones', label: 'Marcaciones', icon: UserCheck },
  { id: 'historico', label: 'Histórico', icon: List },
];

export function BitacoraModule() {
  const {
    vista,
    setVista,
    registros,
    totalCount,
    marcaciones,
    loading,
    error,
    dateRange,
    setDateRangePreset,
    setCustomDateRange,
    page,
    setPage,
    pageSize,
    setPageSize,
    searchTerm,
    handleSearchChange,
    updateChecklist,
  } = useUSSHistoricoData();

  // Stats rápidos para marcaciones
  const marcacionesStats = useMemo(() => {
    if (marcaciones.length === 0) return null;
    const conductores = new Set(marcaciones.map(m => m.conductor)).size;
    const kmTotal = marcaciones.reduce((sum, m) => sum + m.kmTotal, 0);
    const activos = marcaciones.filter(m => m.estado !== 'Sin Actividad').length;
    return { conductores, kmTotal: Math.round(kmTotal * 100) / 100, activos };
  }, [marcaciones]);

  const headerControls = (
    <BitacoraHeader
      dateRange={dateRange}
      onDateRangePreset={setDateRangePreset}
      onCustomDateRange={setCustomDateRange}
      isLoading={loading}
      lastUpdate={null}
    />
  );

  return (
    <div className="bitacora-module">
      {error && (
        <div className="bitacora-error">
          <p>{error}</p>
        </div>
      )}

      {/* Tabs estilo facturación */}
      <div className="bitacora-tabs">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`bitacora-tab ${vista === tab.id ? 'active' : ''}`}
              onClick={() => setVista(tab.id)}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Stats rápidos en vista marcaciones */}
      {vista === 'marcaciones' && marcacionesStats && (
        <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <span><strong>{marcacionesStats.conductores}</strong> conductores</span>
          <span><strong>{marcacionesStats.kmTotal.toLocaleString('es-AR')}</strong> km</span>
          <span><strong>{marcacionesStats.activos}</strong> activos</span>
        </div>
      )}

      {/* Vista Marcaciones */}
      {vista === 'marcaciones' && (
        <MarcacionesTable
          marcaciones={marcaciones}
          isLoading={loading}
          searchTerm={searchTerm}
          onSearchChange={handleSearchChange}
          headerControls={headerControls}
          onUpdateChecklist={updateChecklist}
        />
      )}

      {/* Vista Histórico */}
      {vista === 'historico' && (
        <HistoricoTable
          registros={registros}
          totalCount={totalCount}
          isLoading={loading}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchTerm={searchTerm}
          onSearchChange={handleSearchChange}
          headerControls={headerControls}
        />
      )}
    </div>
  );
}
