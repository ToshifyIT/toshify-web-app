import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Trash2, MessageSquarePlus } from 'lucide-react';
import './IncidentsHistory.css';
import type { Nota } from './AnotacionesEditorModal';

interface IncidentsHistoryProps {
  notas: Nota[];
  loading?: boolean;
  onAddNote?: () => void;
  onEditNote?: (nota: Nota, index: number) => void;
  onDeleteNote?: (index: number) => void;
  readOnly?: boolean;
}

export const IncidentsHistory: React.FC<IncidentsHistoryProps> = ({ notas, loading = false, onAddNote, onEditNote, onDeleteNote, readOnly = false }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="incidents-container">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Bitácora de Notas</h3>
        {!readOnly && (
          <button
            onClick={onAddNote}
            className="btn-agregar-nota"
          >
            <MessageSquarePlus size={18} strokeWidth={2.5} />
            Agregar Nota
          </button>
        )}
      </div>
      <div className="incidents-card">
        <table className="incidents-table">
          <thead onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
            <tr>
              <th style={{ width: '45%' }}>
                NOTA
              </th>
              <th style={{ width: '25%' }}>
                FECHA
              </th>
              <th style={{ width: '20%' }}>
                USUARIO
              </th>
              <th style={{ width: '10%' }}>
                <div className="flex items-center justify-end gap-2">
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </th>
            </tr>
          </thead>
          {isOpen && (
            <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="incidents-loading">
                  Cargando notas...
                </td>
              </tr>
            ) : !notas || notas.length === 0 ? (
              <tr>
                <td colSpan={4} className="incidents-empty">
                  No hay notas registradas
                </td>
              </tr>
            ) : (
              notas.map((nota, index) => (
                <tr key={`${index}-${nota.fecha}`}>
                  <td className="incidents-description" style={{ whiteSpace: 'pre-wrap' }}>
                    {nota.texto}
                  </td>
                  <td className="incidents-date">
                    {nota.fecha}
                  </td>
                  <td className="incidents-actions" style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {nota.usuario || 'Desconocido'}
                  </td>
                  <td className="text-right pr-4">
                    {!readOnly && (
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); onEditNote?.(nota, index); }}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: 'var(--color-primary)' }}
                          title="Editar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onDeleteNote?.(index); }}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: 'var(--color-danger)' }}
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          )}
        </table>
      </div>
    </div>
  );
};
