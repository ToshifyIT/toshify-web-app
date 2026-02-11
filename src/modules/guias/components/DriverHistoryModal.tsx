import React from 'react';
import { X } from 'lucide-react';
import './DriverHistoryModal.css';

interface Nota {
  texto: string;
  fecha: string;
  usuario?: string;
}

interface HistorialRow {
  semana: string;
  efectivo: number;
  app: number;
  total: number;
  llamada: string;
  fechaLlamada: string;
  accionImp: string;
  seguimiento: string;
  notas?: Nota[];
}

interface DriverHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  conductor: {
    nombre: string;
    dni: string;
  };
  historial: HistorialRow[];
}

export function DriverHistoryModal({ isOpen, onClose, conductor, historial }: DriverHistoryModalProps) {
  if (!isOpen) return null;

  const formatMoney = (amount: number) => {
    // Ensure strict 2 decimals for currency display
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="historial-overlay">
      <div className="historial-modal">
        {/* Header */}
        <div className="historial-header">
          <div className="historial-header-info">
            <h2 className="historial-title">Historial del Conductor</h2>
            <div className="historial-conductor-data">
              <p><strong>Nombre:</strong> {conductor.nombre}</p>
              <p><strong>DNI:</strong> {conductor.dni}</p>
            </div>
          </div>
          <button className="historial-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tabla */}
        <div className="historial-table-container">
          <table className="historial-table">
            <thead>
              <tr>
                <th>SEMANA</th>
                <th>EFECTIVO</th>
                <th>APP</th>
                <th>TOTAL</th>
                <th>LLAMADA</th>
                <th>FECHA LLAMADA</th>
                <th>ACCIÓN IMP.</th>
                <th>SEGUIMIENTO</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((row, index) => {
                return (
                  <tr key={index}>
                    <td className="td-semana">{row.semana.replace('W', '')}</td>
                    <td className="td-money">{formatMoney(row.efectivo)}</td>
                    <td className="td-money">{formatMoney(row.app)}</td>
                    <td className="td-money td-total">{formatMoney(row.total)}</td>
                    <td>
                      <span className={`badge-llamada ${row.llamada === 'Realizada' ? 'badge-realizada' : 'badge-pendiente'}`}>
                        {row.llamada}
                      </span>
                    </td>
                    <td className="td-fecha">{row.fechaLlamada || '—'}</td>
                    <td className="td-accion">{row.accionImp || '—'}</td>
                    <td>
                      <span className={`badge-seguimiento ${row.seguimiento === 'DIARIO' ? 'badge-diario' : 'badge-semanal'}`}>
                        {row.seguimiento}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="historial-footer">
          {/* <button className="btn-descargar">Descargar Reporte</button> */}
          <button className="btn-cerrar" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
