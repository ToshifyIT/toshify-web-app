// src/modules/integraciones/uss/bitacora/BitacoraModule.tsx
/**
 * Módulo principal de Bitácora - Control de Turnos
 * Marcaciones: datos sumarizados de wialon_bitacora (1 fila/conductor/día)
 * Histórico: registros crudos de uss_historico
 */

// useMemo removed - stats now computed inside MarcacionesTable
import { UserCheck, List } from 'lucide-react';
import { useSede } from '../../../../contexts/SedeContext';
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

/** `tablaGeotab` / `soloGeotab`: sin props apunta a la bitacora real. El modulo
 *  de prueba los pasa para leer geotab_bitacora_vprueba. */
export function BitacoraModule({ tablaGeotab, tablaGeotabHistorico, soloGeotab }:
  { tablaGeotab?: string; tablaGeotabHistorico?: string; soloGeotab?: boolean } = {}) {
  const { sedeActualId } = useSede();
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
  } = useUSSHistoricoData(sedeActualId, { tablaGeotab, soloGeotab });

  // Stats removed from here - now computed inside MarcacionesTable from filtered data

  const headerControls = (
    <BitacoraHeader
      dateRange={dateRange}
      onDateRangePreset={setDateRangePreset}
      onCustomDateRange={setCustomDateRange}
      isLoading={loading}
      weekOnly
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

      {/* Stats now rendered inside MarcacionesTable from filtered data */}

      {/* Vista Marcaciones */}
      {vista === 'marcaciones' && (
        <MarcacionesTable
          marcaciones={marcaciones}
          isLoading={loading}
          searchTerm={searchTerm}
          onSearchChange={handleSearchChange}
          headerControls={headerControls}
          semanaInicio={dateRange.startDate}
          semanaFin={dateRange.endDate}
          tablaGeotabHistorico={tablaGeotabHistorico}
          soloGeotab={soloGeotab}
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
