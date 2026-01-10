// src/components/ui/DataTable/DataTable.tsx
/**
 * @fileoverview Componente DataTable reutilizable basado en TanStack Table v8.
 * Proporciona búsqueda global, ordenamiento, paginación, diseño responsive
 * con filas expandibles, columna de acciones sticky y filtros automáticos por columna.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type Table,
  type ExpandedState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight, Columns3, Check, Filter, Calendar } from "lucide-react";
import "./DataTable.css";

// Tipo para filtros de columna
type ColumnFilters = Record<string, string[]>;
type DateFilters = Record<string, { from?: string; to?: string }>;

export interface DataTableProps<T> {
  /** Array de datos a mostrar en la tabla */
  data: T[];
  /** Definición de columnas según TanStack Table */
  columns: ColumnDef<T, unknown>[];
  /** Placeholder del input de búsqueda @default "Buscar..." */
  searchPlaceholder?: string;
  /** Icono a mostrar cuando no hay datos */
  emptyIcon?: ReactNode;
  /** Título del estado vacío @default "No hay datos" */
  emptyTitle?: string;
  /** Descripción del estado vacío @default "" */
  emptyDescription?: string;
  /** Indica si está cargando datos @default false */
  loading?: boolean;
  /** Mensaje de error a mostrar @default null */
  error?: string | null;
  /** Cantidad de registros por página inicial @default 10 */
  pageSize?: number;
  /** Opciones de tamaño de página disponibles @default [10, 20, 30, 50] */
  pageSizeOptions?: number[];
  /** Muestra/oculta la barra de búsqueda @default true */
  showSearch?: boolean;
  /** Muestra/oculta los controles de paginación @default true */
  showPagination?: boolean;
  /** Callback ejecutado cuando la tabla está inicializada */
  onTableReady?: (table: Table<T>) => void;
  /** Acción a mostrar en el header junto al buscador (ej: botón de crear) */
  headerAction?: ReactNode;
  /** IDs de columnas que siempre deben estar visibles (ej: ['acciones']) */
  alwaysVisibleColumns?: string[];
  /** Número máximo de columnas a mostrar antes de colapsar (sin contar acciones) @default 6 */
  maxVisibleColumns?: number;
}

export function DataTable<T>({
  data,
  columns,
  searchPlaceholder = "Buscar...",
  emptyIcon,
  emptyTitle = "No hay datos",
  emptyDescription = "",
  loading = false,
  error = null,
  pageSize = 100,
  pageSizeOptions = [10, 20, 50, 100],
  showSearch = true,
  showPagination = true,
  onTableReady,
  headerAction,
  alwaysVisibleColumns = ["acciones", "actions"],
  maxVisibleColumns = 0, // 0 = show all columns that fit
}: DataTableProps<T>) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [visibleColumnCount, setVisibleColumnCount] = useState(100); // Start high, resize will adjust
  const columnMenuRef = useRef<HTMLDivElement>(null);
  const columnBtnRef = useRef<HTMLButtonElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  // Column filter state
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [dateFilters, setDateFilters] = useState<DateFilters>({});
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);

  // Helper: Check if column is date type based on accessor key or data
  const isDateColumn = useCallback((colId: string): boolean => {
    const dateKeywords = ['fecha', 'date', 'created', 'updated', 'vencimiento', 'entrega', 'inicio', 'fin'];
    const lowerColId = colId.toLowerCase();
    return dateKeywords.some(keyword => lowerColId.includes(keyword));
  }, []);

  // Helper: Get nested value from object
  const getNestedValueForFilter = useCallback((obj: Record<string, unknown>, path: string): unknown => {
    const keys = path.split('.');
    let value: unknown = obj;
    for (const key of keys) {
      if (value && typeof value === 'object' && key in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    return value;
  }, []);

  // Get unique values for a column (for select filter)
  const getUniqueValues = useCallback((colId: string): string[] => {
    const values = new Set<string>();
    data.forEach((row) => {
      const value = getNestedValueForFilter(row as Record<string, unknown>, colId);
      if (value !== null && value !== undefined && value !== '') {
        values.add(String(value));
      }
    });
    return Array.from(values).sort();
  }, [data, getNestedValueForFilter]);

  // Filter data based on column filters and date filters
  const filteredData = useMemo(() => {
    let result = [...data];

    // Apply column filters (text/select)
    Object.entries(columnFilters).forEach(([colId, selectedValues]) => {
      if (selectedValues.length > 0) {
        result = result.filter((row) => {
          const value = getNestedValueForFilter(row as Record<string, unknown>, colId);
          const strValue = value !== null && value !== undefined ? String(value) : '';
          return selectedValues.includes(strValue);
        });
      }
    });

    // Apply date filters
    Object.entries(dateFilters).forEach(([colId, range]) => {
      if (range.from || range.to) {
        result = result.filter((row) => {
          const value = getNestedValueForFilter(row as Record<string, unknown>, colId);
          if (!value) return false;

          const dateStr = String(value);
          // Try to parse the date - handle multiple formats
          let dateValue: Date | null = null;
          if (dateStr.includes('/')) {
            // Format: DD/MM/YYYY
            const parts = dateStr.split('/');
            if (parts.length === 3) {
              dateValue = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            }
          } else {
            dateValue = new Date(dateStr);
          }

          if (!dateValue || isNaN(dateValue.getTime())) return false;

          if (range.from) {
            const fromDate = new Date(range.from);
            if (dateValue < fromDate) return false;
          }
          if (range.to) {
            const toDate = new Date(range.to);
            toDate.setHours(23, 59, 59, 999);
            if (dateValue > toDate) return false;
          }
          return true;
        });
      }
    });

    return result;
  }, [data, columnFilters, dateFilters, getNestedValueForFilter]);

  // Close filter on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenFilterId(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounce search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(globalFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [globalFilter]);

  // Close column menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        columnMenuRef.current &&
        !columnMenuRef.current.contains(event.target as Node) &&
        columnBtnRef.current &&
        !columnBtnRef.current.contains(event.target as Node)
      ) {
        setShowColumnMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Adjust visible columns based on container width
  useEffect(() => {
    function handleResize() {
      if (!tableWrapperRef.current) return;
      const width = tableWrapperRef.current.offsetWidth;

      // Calculate how many columns can fit
      // Use conservative width estimate (100px) to show more columns
      const avgColWidth = 100;
      const actionsWidth = 140;
      const expandBtnWidth = 50;
      const availableWidth = width - actionsWidth - expandBtnWidth;
      const fittingColumns = Math.floor(availableWidth / avgColWidth);

      // Show all columns that fit, minimum 2, maximum is total columns or maxVisibleColumns
      const totalRegularCols = columns.filter(col => {
        const colId = (col as { accessorKey?: string; id?: string }).accessorKey ||
                      (col as { id?: string }).id || "";
        return !alwaysVisibleColumns.includes(colId);
      }).length;

      // maxVisibleColumns = 0 means show all that fit, otherwise use as limit
      const maxToShow = maxVisibleColumns > 0 ? maxVisibleColumns : totalRegularCols;
      const newCount = Math.max(2, Math.min(fittingColumns, maxToShow, totalRegularCols));
      setVisibleColumnCount(newCount);
    }

    // Run on mount and after a small delay to ensure container is sized
    handleResize();
    const timer = setTimeout(handleResize, 100);
    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [maxVisibleColumns, columns, alwaysVisibleColumns]);

  // Separate columns into visible and hidden - memoized to prevent unnecessary re-renders
  const { regularColumns, actionsColumn } = useMemo(() => {
    const regular = columns.filter(col => {
      const colId = (col as { accessorKey?: string; id?: string }).accessorKey ||
                    (col as { id?: string }).id || "";
      return !alwaysVisibleColumns.includes(colId);
    });

    const actions = columns.filter(col => {
      const colId = (col as { accessorKey?: string; id?: string }).accessorKey ||
                    (col as { id?: string }).id || "";
      return alwaysVisibleColumns.includes(colId);
    });

    return { regularColumns: regular, actionsColumn: actions };
  }, [columns, alwaysVisibleColumns]);

  const visibleColumns = useMemo(() => regularColumns.slice(0, visibleColumnCount), [regularColumns, visibleColumnCount]);
  const hiddenColumns = useMemo(() => regularColumns.slice(visibleColumnCount), [regularColumns, visibleColumnCount]);
  const hasHiddenColumns = hiddenColumns.length > 0;

  // Filter Header Component - renders inline in header
  const FilterHeader = useCallback(({ colId, label }: { colId: string; label: string }) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [searchTerm, setSearchTerm] = useState('');

    const isDate = isDateColumn(colId);
    const isOpen = openFilterId === colId;
    const hasFilter = isDate
      ? !!(dateFilters[colId]?.from || dateFilters[colId]?.to)
      : (columnFilters[colId]?.length || 0) > 0;

    const uniqueValues = useMemo(() => isDate ? [] : getUniqueValues(colId), [colId, isDate]);
    const filteredOptions = searchTerm
      ? uniqueValues.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()))
      : uniqueValues;

    // Calculate position when opening
    useLayoutEffect(() => {
      if (!isOpen || !buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      let left = rect.left;
      let top = rect.bottom + 4;

      // Adjust if goes off screen
      if (left + 220 > window.innerWidth) {
        left = window.innerWidth - 230;
      }
      if (top + 300 > window.innerHeight) {
        top = rect.top - 304;
      }
      setPosition({ top, left });
    }, [isOpen]);

    // Clear search when closing
    useEffect(() => {
      if (!isOpen) setSearchTerm('');
    }, [isOpen]);

    // Close on outside click
    useEffect(() => {
      if (!isOpen) return;
      const handleClick = (e: MouseEvent) => {
        if (
          dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)
        ) {
          setOpenFilterId(null);
        }
      };
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen]);

    const handleToggle = (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenFilterId(isOpen ? null : colId);
    };

    const handleSelectValue = (value: string) => {
      const current = columnFilters[colId] || [];
      if (current.includes(value)) {
        setColumnFilters({ ...columnFilters, [colId]: current.filter(v => v !== value) });
      } else {
        setColumnFilters({ ...columnFilters, [colId]: [...current, value] });
      }
    };

    const handleDateChange = (field: 'from' | 'to', value: string) => {
      setDateFilters({
        ...dateFilters,
        [colId]: { ...dateFilters[colId], [field]: value }
      });
    };

    const clearFilter = () => {
      if (isDate) {
        const newDateFilters = { ...dateFilters };
        delete newDateFilters[colId];
        setDateFilters(newDateFilters);
      } else {
        const newFilters = { ...columnFilters };
        delete newFilters[colId];
        setColumnFilters(newFilters);
      }
    };

    return (
      <div className="dt-filter-header">
        <span className="dt-filter-label">{label}</span>
        <button
          ref={buttonRef}
          type="button"
          className={`dt-filter-btn ${hasFilter ? 'active' : ''}`}
          onClick={handleToggle}
          title={`Filtrar por ${label}`}
        >
          {isDate ? <Calendar size={12} /> : <Filter size={12} />}
        </button>
        {isOpen && createPortal(
          <div
            ref={dropdownRef}
            className="dt-filter-dropdown"
            style={{ position: 'fixed', top: position.top, left: position.left }}
            onClick={e => e.stopPropagation()}
          >
            {isDate ? (
              <div className="dt-filter-date">
                <label>
                  <span>Desde:</span>
                  <input
                    type="date"
                    value={dateFilters[colId]?.from || ''}
                    onChange={e => handleDateChange('from', e.target.value)}
                  />
                </label>
                <label>
                  <span>Hasta:</span>
                  <input
                    type="date"
                    value={dateFilters[colId]?.to || ''}
                    onChange={e => handleDateChange('to', e.target.value)}
                  />
                </label>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="dt-filter-search"
                  autoFocus
                />
                <div className="dt-filter-options">
                  {filteredOptions.length === 0 ? (
                    <div className="dt-filter-empty">Sin resultados</div>
                  ) : (
                    filteredOptions.slice(0, 50).map(option => (
                      <label key={option} className="dt-filter-option">
                        <input
                          type="checkbox"
                          checked={(columnFilters[colId] || []).includes(option)}
                          onChange={() => handleSelectValue(option)}
                        />
                        <span>{option}</span>
                      </label>
                    ))
                  )}
                </div>
              </>
            )}
            {hasFilter && (
              <button type="button" className="dt-filter-clear" onClick={clearFilter}>
                Limpiar filtro
              </button>
            )}
          </div>,
          document.body
        )}
      </div>
    );
  }, [openFilterId, columnFilters, dateFilters, isDateColumn, getUniqueValues]);

  // Wrap columns with auto-filters
  const columnsWithFilters = useMemo(() => {
    return visibleColumns.map(col => {
      const colDef = col as { accessorKey?: string; id?: string; header?: unknown };
      const colId = colDef.accessorKey || colDef.id || "";

      // Skip if no accessorKey (custom columns like expand)
      if (!colId) return col;

      // Get original header label
      let headerLabel = colId.split('.').pop() || colId;
      headerLabel = headerLabel.charAt(0).toUpperCase() + headerLabel.slice(1).replace(/_/g, ' ');
      if (typeof colDef.header === 'string') {
        headerLabel = colDef.header;
      }

      return {
        ...col,
        header: () => <FilterHeader colId={colId} label={headerLabel} />,
      } as ColumnDef<T, unknown>;
    });
  }, [visibleColumns, FilterHeader]);

  // Memoize final columns to prevent unnecessary re-renders that reset expand state
  const finalColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    // Build the expandable column if there are hidden columns
    const expandColumn: ColumnDef<T, unknown> = {
      id: "expand",
      header: "",
      cell: ({ row }) => (
        <button
          className="dt-expand-btn"
          onClick={(e) => {
            e.stopPropagation();
            row.toggleExpanded();
          }}
          title={row.getIsExpanded() ? "Ocultar detalles" : "Ver más"}
        >
          {row.getIsExpanded() ? (
            <ChevronDown size={16} />
          ) : (
            <ChevronRight size={16} />
          )}
        </button>
      ),
      size: 40,
      enableSorting: false,
    };

    // Final column order: expand (if needed) + visible with filters + actions
    return [
      ...(hasHiddenColumns ? [expandColumn] : []),
      ...columnsWithFilters,
      ...actionsColumn,
    ];
  }, [hasHiddenColumns, columnsWithFilters, actionsColumn]);

  const table = useReactTable({
    data: filteredData,
    columns: finalColumns,
    state: {
      sorting,
      globalFilter: debouncedSearch,
      expanded,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setDebouncedSearch,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    initialState: {
      pagination: {
        pageSize,
      },
    },
  });

  // Callback when table is ready
  useEffect(() => {
    if (onTableReady) {
      onTableReady(table);
    }
  }, [table, onTableReady]);

  // Helper to get nested value from object using dot notation (e.g., "vehiculos_estados.codigo")
  const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
    const keys = path.split('.');
    let value: unknown = obj;
    for (const key of keys) {
      if (value && typeof value === 'object' && key in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    return value;
  };

  // Render expanded row content - use original columns to access data
  const renderExpandedContent = (rowData: T) => {
    if (!hasHiddenColumns) return null;

    const data = rowData as Record<string, unknown>;

    return (
      <div className="dt-expanded-content">
        <div className="dt-expanded-grid">
          {hiddenColumns.map((col) => {
            const colDef = col as { accessorKey?: string; id?: string; header?: unknown; cell?: unknown };
            const colId = colDef.accessorKey || colDef.id || "";

            // Get header text - try to extract from header function/string
            let headerText = colId.split('.').pop() || colId;
            headerText = headerText.charAt(0).toUpperCase() + headerText.slice(1).replace(/_/g, ' ').replace(/([A-Z])/g, ' $1');
            if (typeof colDef.header === "string") {
              headerText = colDef.header;
            }

            // Get the raw value - handle nested paths with dot notation
            const rawValue = colId.includes('.') ? getNestedValue(data, colId) : data[colId];

            // Format value for display
            let displayValue: React.ReactNode = "-";
            if (rawValue !== null && rawValue !== undefined) {
              if (typeof rawValue === 'boolean') {
                displayValue = rawValue ? 'Sí' : 'No';
              } else if (rawValue instanceof Date) {
                displayValue = rawValue.toLocaleDateString('es-AR');
              } else if (typeof rawValue === 'object') {
                displayValue = JSON.stringify(rawValue);
              } else {
                displayValue = String(rawValue);
              }
            }

            return (
              <div key={colId} className="dt-expanded-item">
                <span className="dt-expanded-label">{headerText}</span>
                <span className="dt-expanded-value">{displayValue}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Show all columns toggle
  const showAllColumns = () => {
    setVisibleColumnCount(regularColumns.length);
    setShowColumnMenu(false);
  };

  // Reset to auto columns - recalculate based on container width
  const resetColumns = () => {
    if (tableWrapperRef.current) {
      const width = tableWrapperRef.current.offsetWidth;
      const avgColWidth = 100;
      const actionsWidth = 140;
      const expandBtnWidth = 50;
      const availableWidth = width - actionsWidth - expandBtnWidth;
      const fittingColumns = Math.floor(availableWidth / avgColWidth);
      const maxToShow = maxVisibleColumns > 0 ? maxVisibleColumns : regularColumns.length;
      const newCount = Math.max(2, Math.min(fittingColumns, maxToShow, regularColumns.length));
      setVisibleColumnCount(newCount);
    }
    setShowColumnMenu(false);
  };

  if (loading) {
    return (
      <div className="dt-loading">
        <div className="dt-loading-spinner"></div>
        <span>Cargando...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dt-error">
        <span>Error: {error}</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="dt-empty">
        {emptyIcon && <div className="dt-empty-icon">{emptyIcon}</div>}
        <h3 className="dt-empty-title">{emptyTitle}</h3>
        {emptyDescription && (
          <p className="dt-empty-description">{emptyDescription}</p>
        )}
      </div>
    );
  }

  return (
    <div className="dt-wrapper">
      {/* Header with Search, Column Toggle and Action */}
      {(showSearch || headerAction) && (
        <div className="dt-header-bar">
          {showSearch && (
            <div className="dt-search-wrapper">
              <svg
                className="dt-search-icon"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                className="dt-search-input"
                placeholder={searchPlaceholder}
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
              />
            </div>
          )}

          {/* Column visibility toggle - only show when there are hidden columns */}
          {hasHiddenColumns && (
            <div className="dt-column-toggle-wrapper">
              <button
                ref={columnBtnRef}
                className={`dt-column-toggle-btn ${hasHiddenColumns ? "has-hidden" : ""}`}
                onClick={() => setShowColumnMenu(!showColumnMenu)}
                title="Mostrar/ocultar columnas"
              >
                <Columns3 size={16} />
                <span className="dt-column-toggle-text">Columnas</span>
                {hasHiddenColumns && (
                  <span className="dt-column-hidden-badge">{hiddenColumns.length}</span>
                )}
                <ChevronDown size={14} className={showColumnMenu ? "rotated" : ""} />
              </button>

              {showColumnMenu && (
                <div ref={columnMenuRef} className="dt-column-menu">
                  <div className="dt-column-menu-header">
                    <span>Columnas ({visibleColumnCount} de {regularColumns.length})</span>
                  </div>
                  <div className="dt-column-menu-actions">
                    <button onClick={showAllColumns} className="dt-column-menu-btn">
                      <Check size={14} />
                      Mostrar todas
                    </button>
                    <button onClick={resetColumns} className="dt-column-menu-btn">
                      Ajustar auto
                    </button>
                  </div>
                  <div className="dt-column-menu-info">
                    {hasHiddenColumns && (
                      <p>Haz clic en ▶ en cada fila para ver las {hiddenColumns.length} columnas ocultas</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {headerAction && (
            <div className="dt-header-action">{headerAction}</div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="dt-container">
        <div className="dt-table-wrapper" ref={tableWrapperRef}>
          <table className="dt-table dt-table-responsive">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isActionsColumn = alwaysVisibleColumns.includes(header.id);
                    const isExpandColumn = header.id === "expand";
                    return (
                      <th
                        key={header.id}
                        onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                        className={`
                          ${header.column.getCanSort() ? "dt-sortable" : ""}
                          ${isActionsColumn ? "dt-sticky-col" : ""}
                          ${isExpandColumn ? "dt-expand-col" : ""}
                        `}
                        style={isExpandColumn ? { width: '40px' } : undefined}
                      >
                        <div
                          className={`dt-header-content ${
                            isActionsColumn ? "dt-header-center" : ""
                          }`}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {header.column.getCanSort() && (
                            <span className="dt-sort-indicator">
                              {{
                                asc: " ↑",
                                desc: " ↓",
                              }[header.column.getIsSorted() as string] ?? " ↕"}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={finalColumns.length} className="dt-no-results">
                    No se encontraron resultados
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className={row.getIsExpanded() ? "dt-row-expanded" : ""}>
                      {row.getVisibleCells().map((cell) => {
                        const isActionsColumn = alwaysVisibleColumns.includes(cell.column.id);
                        const isExpandColumn = cell.column.id === "expand";
                        return (
                          <td
                            key={cell.id}
                            className={`
                              ${isActionsColumn ? "dt-sticky-col" : ""}
                              ${isExpandColumn ? "dt-expand-col" : ""}
                            `}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {row.getIsExpanded() && hasHiddenColumns && (
                      <tr className="dt-expanded-row">
                        <td colSpan={finalColumns.length}>
                          {renderExpandedContent(row.original)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {showPagination && table.getRowModel().rows.length > 0 && (
          <div className="dt-pagination">
            <div className="dt-pagination-info">
              Mostrando{" "}
              {table.getState().pagination.pageIndex *
                table.getState().pagination.pageSize +
                1}{" "}
              a{" "}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) *
                  table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length
              )}{" "}
              de {table.getFilteredRowModel().rows.length} registros
            </div>
            <div className="dt-pagination-controls">
              <button
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                className="dt-pagination-btn"
              >
                {"<<"}
              </button>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="dt-pagination-btn"
              >
                {"<"}
              </button>
              <span className="dt-pagination-text">
                Pagina {table.getState().pagination.pageIndex + 1} de{" "}
                {table.getPageCount()}
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="dt-pagination-btn"
              >
                {">"}
              </button>
              <button
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="dt-pagination-btn"
              >
                {">>"}
              </button>
              <select
                value={table.getState().pagination.pageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
                className="dt-pagination-select"
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size} por pagina
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DataTable;
