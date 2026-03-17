// src/modules/integraciones/uss/bitacora/components/HistoricoTable.tsx
/**
 * Tabla de registros crudos de uss_historico
 * Muestra todos los sub-viajes sin sumarizado
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../../../../../components/ui/DataTable/DataTable';
import { ExcelColumnFilter, useExcelFilters } from '../../../../../components/ui/DataTable/ExcelColumnFilter';
import { Search, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, ClipboardList, Download, ChevronDown, X } from 'lucide-react';
import type { USSHistoricoRegistro } from '../../../../../services/ussHistoricoService';
import * as XLSX from 'xlsx';

interface HistoricoTableProps {
  registros: USSHistoricoRegistro[];
  totalCount: number;
  isLoading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  headerControls?: React.ReactNode;
}

// Formatear timestamp a DD/MM HH:MM:SS
// Las fechas de uss_historico se almacenan en UTC, se convierten a Argentina (UTC-3)
function formatTimestamp(ts: string | null): string {
  if (!ts) return '-';
  // Forzar interpretación como UTC agregando Z si no tiene offset
  const isoStr = ts.includes('Z') || ts.includes('+') || ts.includes('-', 10) ? ts : ts.replace(' ', 'T') + 'Z';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '-';
  // Convertir a Argentina (UTC-3)
  const ar = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const dd = String(ar.getUTCDate()).padStart(2, '0');
  const mm = String(ar.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(ar.getUTCHours()).padStart(2, '0');
  const mi = String(ar.getUTCMinutes()).padStart(2, '0');
  const ss = String(ar.getUTCSeconds()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}:${ss}`;
}

// Formatear km
function formatKm(km: string | null): string {
  if (!km) return '0';
  const n = parseFloat(km);
  if (isNaN(n)) return '0';
  return n.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

export function HistoricoTable({
  registros,
  totalCount,
  isLoading,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  searchTerm,
  onSearchChange,
  headerControls,
}: HistoricoTableProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const { openFilterId, setOpenFilterId } = useExcelFilters();

  // Filtros Excel
  const [conductorFilter, setConductorFilter] = useState<string[]>([]);

  // Lista única: "CONDUCTOR | PATENTE" para filtro combinado
  const conductorPatenteUnicos = useMemo(() => {
    const set = new Set<string>();
    for (const r of registros) {
      const conductor = r.conductor || 'Sin conductor';
      const patente = r.patente || '-';
      set.add(`${conductor} | ${patente}`);
    }
    return [...set].sort();
  }, [registros]);

  const hasActiveFilters = conductorFilter.length > 0 || searchTerm.trim() !== '';

  const clearAllFilters = () => {
    setConductorFilter([]);
    onSearchChange('');
  };

  // Helper para obtener la clave combinada de un registro
  const getConductorPatenteKey = (r: USSHistoricoRegistro) => {
    const conductor = r.conductor || 'Sin conductor';
    const patente = r.patente || '-';
    return `${conductor} | ${patente}`;
  };

  // Filtrado local
  const registrosFiltrados = useMemo(() => {
    return registros.filter(r => {
      if (conductorFilter.length > 0 && !conductorFilter.includes(getConductorPatenteKey(r))) return false;
      return true;
    });
  }, [registros, conductorFilter]);

  // Columnas
  const columns = useMemo<ColumnDef<USSHistoricoRegistro, unknown>[]>(() => [
    {
      id: 'conductor_patente',
      accessorKey: 'conductor',
      header: () => (
        <ExcelColumnFilter label="Conductor / Patente" options={conductorPatenteUnicos} selectedValues={conductorFilter}
          onSelectionChange={setConductorFilter} filterId="h-conductor" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: 1.3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '13px' }}>{r.conductor || 'Sin conductor'}</span>
              {r.ibutton && (
                <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                  #{r.ibutton}
                </span>
              )}
            </div>
            <span style={{ fontWeight: 600, color: 'var(--color-primary)', fontFamily: 'monospace', fontSize: '12px' }}>
              {r.patente}
            </span>
          </div>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: 'fecha_hora_inicio',
      header: 'Inicio',
      cell: ({ row }) => formatTimestamp(row.original.fecha_hora_inicio),
      enableSorting: true,
    },
    {
      accessorKey: 'fecha_hora_final',
      header: 'Fin',
      cell: ({ row }) => formatTimestamp(row.original.fecha_hora_final),
      enableSorting: true,
    },
    {
      accessorKey: 'kilometraje',
      header: 'Km',
      cell: ({ row }) => {
        const n = parseFloat(row.original.kilometraje || '0') || 0;
        return (
          <span style={{ fontWeight: 600, color: n < 1 ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
            {formatKm(row.original.kilometraje)}
          </span>
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: 'observaciones',
      header: 'Observaciones',
      cell: ({ row }) => (
        <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
          {row.original.observaciones || '-'}
        </span>
      ),
      enableSorting: false,
    },
  ], [conductorPatenteUnicos, conductorFilter, openFilterId]);

  // Exportar
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showExportMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportMenu(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showExportMenu]);

  function getExportData() {
    return registrosFiltrados.map(r => ({
      'Patente': r.patente,
      'Conductor': r.conductor || '',
      'iButton': r.ibutton || '',
      'Inicio': formatTimestamp(r.fecha_hora_inicio),
      'Fin': formatTimestamp(r.fecha_hora_final),
      'Km': formatKm(r.kilometraje),
      'Observaciones': r.observaciones || '',
    }));
  }

  function exportarExcel() {
    const data = getExportData();
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historico');
    XLSX.writeFile(wb, `USS_Historico_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setShowExportMenu(false);
  }

  function exportarCSV() {
    const data = getExportData();
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `USS_Historico_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }

  // Paginación
  const paginationControls = (
    <div className="dt-pagination" style={{ borderTop: 'none', background: 'transparent', padding: '12px 0' }}>
      <div className="dt-pagination-info">
        Mostrando {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, totalCount)} de {totalCount.toLocaleString()} registros
      </div>
      <div className="dt-pagination-controls">
        <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="dt-pagination-select">
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size} por página</option>
          ))}
        </select>
        <button onClick={() => onPageChange(1)} disabled={page === 1 || isLoading} className="dt-pagination-btn"><ChevronsLeft size={14} /></button>
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1 || isLoading} className="dt-pagination-btn"><ChevronLeft size={14} /></button>
        <span className="dt-pagination-text">Página {page} de {totalPages || 1}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages || isLoading} className="dt-pagination-btn"><ChevronRight size={14} /></button>
        <button onClick={() => onPageChange(totalPages)} disabled={page >= totalPages || isLoading} className="dt-pagination-btn"><ChevronsRight size={14} /></button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Toolbar */}
      <div className="dt-header-bar">
        <div className="dt-search-wrapper">
          <Search size={18} className="dt-search-icon" />
          <input type="text" placeholder="Buscar por patente, conductor o iButton..." value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)} className="dt-search-input" />
        </div>
        {headerControls}

        {hasActiveFilters && (
          <button onClick={clearAllFilters}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 10px', fontSize: '13px', fontWeight: 500,
              border: '1px solid var(--color-danger)', borderRadius: '6px',
              background: 'var(--bg-primary)', color: 'var(--color-danger)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            <X size={14} /> Quitar filtros
          </button>
        )}

        {/* Exportar dropdown */}
        <div ref={exportRef} style={{ position: 'relative' }}>
          <button onClick={() => setShowExportMenu(!showExportMenu)} disabled={registrosFiltrados.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 10px', fontSize: '13px', fontWeight: 500,
              border: '1px solid var(--border-color)', borderRadius: '6px',
              background: 'var(--bg-primary)', color: 'var(--text-secondary)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            <Download size={14} /> Exportar <ChevronDown size={12} />
          </button>
          {showExportMenu && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '4px',
              background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
              borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 50, minWidth: '140px', overflow: 'hidden',
            }}>
              {[
                { fn: exportarExcel, label: 'Excel (.xlsx)' },
                { fn: exportarCSV, label: 'CSV (.csv)' },
              ].map(({ fn, label }) => (
                <button key={label} onClick={fn} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', fontSize: '13px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <span style={{ color: 'var(--text-secondary)', fontSize: '13px', whiteSpace: 'nowrap' }}>
          {totalCount.toLocaleString()} registros
        </span>
      </div>

      {/* DataTable */}
      <DataTable
        data={registrosFiltrados}
        columns={columns}
        loading={isLoading}
        showSearch={false}
        showPagination={false}
        disableAutoFilters
        emptyIcon={<ClipboardList size={48} />}
        emptyTitle="Sin registros"
        emptyDescription="No hay registros de USS Histórico para mostrar"
        pageSize={999}
      />

      {/* Paginación */}
      {registrosFiltrados.length > 0 && paginationControls}
    </div>
  );
}
