// src/components/ui/DataTable/DataTable.tsx
/**
 * @fileoverview Componente DataTable reutilizable basado en TanStack Table v8.
 * Proporciona búsqueda global, ordenamiento, paginación, diseño responsive
 * con filas expandibles y columna de acciones sticky.
 */

import React, { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
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
import { ChevronDown, ChevronRight, Columns3, Check } from "lucide-react";
import "./DataTable.css";

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

    // Final column order: expand (if needed) + visible + actions
    return [
      ...(hasHiddenColumns ? [expandColumn] : []),
      ...visibleColumns,
      ...actionsColumn,
    ];
  }, [hasHiddenColumns, visibleColumns, actionsColumn]);

  const table = useReactTable({
    data,
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

          {/* Column visibility toggle - show when there are hidden columns or could be hidden */}
          {(hasHiddenColumns || regularColumns.length > 3) && (
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
