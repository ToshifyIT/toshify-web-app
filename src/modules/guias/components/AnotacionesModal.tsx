import { useState } from 'react';
import { X, Calendar, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import './AnotacionesModal.css';

export interface Anotacion {
  id: string;
  texto: string;
  fecha: string;
  usuario: string;
  avatarColor: string;
  semana?: string;
}

interface AnotacionesModalProps {
  isOpen: boolean;
  onClose: () => void;
  anotaciones: Anotacion[];
  totalAnotaciones: number;
  paginaActual?: number;
  onPageChange?: (page: number) => void;
  title?: string;
  driverName?: string;
  driverDni?: string;
}

export function AnotacionesModal({
  isOpen,
  onClose,
  anotaciones,
  totalAnotaciones,
  paginaActual: externalPage,
  onPageChange,
  title,
  driverName,
  driverDni
}: AnotacionesModalProps) {
  const [internalPage, setInternalPage] = useState(1);

  if (!isOpen) return null;

  const paginaActual = externalPage ?? internalPage;

  const handlePageChange = (newPage: number) => {
    if (onPageChange) {
      onPageChange(newPage);
    } else {
      setInternalPage(newPage);
    }
  };

  const ITEMS_PER_PAGE = 4;
  const totalPages = Math.ceil(totalAnotaciones / ITEMS_PER_PAGE);
  
  // Slice annotations if we have more than page size, assuming client-side pagination with full list
  const displayAnotaciones = anotaciones.length > ITEMS_PER_PAGE
    ? anotaciones.slice((paginaActual - 1) * ITEMS_PER_PAGE, paginaActual * ITEMS_PER_PAGE)
    : anotaciones;

  const inicio = totalAnotaciones === 0 ? 0 : (paginaActual - 1) * ITEMS_PER_PAGE + 1;
  const fin = Math.min(paginaActual * ITEMS_PER_PAGE, totalAnotaciones);

  return (
    <div className="anotaciones-overlay" onClick={onClose}>
      <div className="anotaciones-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="anotaciones-header">
          <div className="anotaciones-header-left">
            <div>
              <h2 className="anotaciones-title">{title || 'Historial de Anotaciones'}</h2>
              {(driverName || driverDni) && (
                <p className="anotaciones-subtitle">
                  <span>
                    <span className="anotaciones-subtitle-label">Nombre:</span>
                    <span>{driverName || '-'}</span>
                  </span>
                  <span>
                    <span className="anotaciones-subtitle-label">DNI:</span>
                    <span>{driverDni || '-'}</span>
                  </span>
                </p>
              )}
            </div>
          </div>
          <button className="anotaciones-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Lista de anotaciones (Tabla) */}
        <div className="anotaciones-table-container">
          <table className="anotaciones-table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>MENSAJE</th>
                <th>SEMANA</th>
                <th>FECHA</th>
                <th>USUARIO</th>
              </tr>
            </thead>
            <tbody>
              {displayAnotaciones.length > 0 ? (
                displayAnotaciones.map((nota) => (
                  <tr key={nota.id}>
                    <td className="td-mensaje">
                      <div className="mensaje-content">
                        {nota.texto}
                      </div>
                    </td>
                    <td className="td-semana">
                      {nota.semana ? (
                        <div className="meta-value">
                          <CalendarDays size={14} />
                          <span>{nota.semana.replace('W', '')}</span>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="td-fecha">
                      <div className="meta-value">
                        <Calendar size={14} />
                        <span>{nota.fecha}</span>
                      </div>
                    </td>
                    <td className="td-usuario">
                      <div className="meta-value">
                        <span className="avatar" style={{ background: nota.avatarColor }}></span>
                        <span>{nota.usuario}</span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                    No hay anotaciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer con paginación */}
        <div className="anotaciones-footer">
          <span className="anotaciones-count">
            Mostrando {inicio}-{fin} de {totalAnotaciones} notas
          </span>
          <div className="anotaciones-pagination">
            <button
              className="page-btn"
              onClick={() => handlePageChange(paginaActual - 1)}
              disabled={paginaActual === 1}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="page-btn"
              onClick={() => handlePageChange(paginaActual + 1)}
              disabled={paginaActual >= totalPages || totalPages === 0}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
