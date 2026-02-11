import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import './ReporteEscuelaModal.css';

interface MetricData {
  promGan: number;
  horas: string;
  porcOcup: string;
  acept: string;
}

export interface ConductorEscuela {
  id: string;
  nombre: string;
  fechaCap: string;
  previo: MetricData;
  semanas2: MetricData;
  semanas4: MetricData;
}

interface ReporteEscuelaModalProps {
  isOpen: boolean;
  onClose: () => void;
  conductores: ConductorEscuela[];
  totalConductores: number;
  paginaActual: number;
  onPageChange: (page: number) => void;
  totalPaginas: number;
}

export function ReporteEscuelaModal({
  isOpen,
  onClose,
  conductores,
  totalConductores,
  paginaActual,
  onPageChange,
  totalPaginas
}: ReporteEscuelaModalProps) {
  if (!isOpen) return null;

  const formatMoney = (value: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const getBadgeClass = (acept: string) => {
    const value = parseInt(acept.replace('%', ''), 10);
    if (isNaN(value)) return '';

    if (value >= 90) return 'badge-muy-alta';
    if (value >= 80) return 'badge-alta';
    if (value >= 70) return 'badge-media';
    return 'badge-baja';
  };

  return (
    <div className="reporte-overlay" onClick={onClose}>
      <div className="reporte-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="reporte-header">
          <div>
            <h2 className="reporte-title">Reporte de Desempeño: Escuela de Conductores</h2>
            <p className="reporte-subtitle">Análisis comparativo de métricas post-capacitación</p>
          </div>
          <button className="reporte-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tabla */}
        <div className="reporte-table-container">
          <table className="reporte-table">
            <thead>
              {/* Fila de grupos */}
              <tr className="header-grupos">
                <th colSpan={2} className="grupo-escuela">ESCUELA DE CONDUCTORES</th>
                <th colSpan={4} className="grupo-previo">PREVIO A CAPACITACIÓN (P)</th>
                <th colSpan={4} className="grupo-2semanas">2 SEMANAS DESDE CAPACITACIÓN (2W)</th>
              </tr>
              {/* Fila de columnas */}
              <tr className="header-columnas">
                <th>CONDUCTOR</th>
                <th>FECHA CAP.</th>
                <th>PROM. GAN.</th>
                <th>HORAS</th>
                <th>% OCUP.</th>
                <th>ACEPT.</th>
                <th>PROM. GAN.</th>
                <th>HORAS</th>
                <th>% OCUP.</th>
                <th>ACEPT.</th>
              </tr>
            </thead>
            <tbody>
              {conductores.map((conductor) => (
                <tr key={conductor.id}>
                  <td className="td-nombre">{conductor.nombre}</td>
                  <td className="td-fecha">{conductor.fechaCap}</td>
                  <td className="td-money">{formatMoney(conductor.previo.promGan)}</td>
                  <td className="td-horas">{conductor.previo.horas}</td>
                  <td className="td-porcentaje">{conductor.previo.porcOcup}</td>
                  <td><span className={`badge ${getBadgeClass(conductor.previo.acept)}`}>{conductor.previo.acept}</span></td>
                  <td className="td-money">{formatMoney(conductor.semanas2.promGan)}</td>
                  <td className="td-horas">{conductor.semanas2.horas}</td>
                  <td className="td-porcentaje">{conductor.semanas2.porcOcup}</td>
                  <td><span className={`badge ${getBadgeClass(conductor.semanas2.acept)}`}>{conductor.semanas2.acept}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="reporte-footer">
          <span className="reporte-count">Mostrando {conductores.length} de {totalConductores} conductores</span>
          <div className="reporte-pagination">
            <button className="page-arrow" onClick={() => onPageChange(paginaActual - 1)} disabled={paginaActual === 1}>
              <ChevronLeft size={16} />
            </button>
            {[...Array(totalPaginas)].slice(0, 3).map((_, i) => (
              <button key={i + 1} className={`page-num ${paginaActual === i + 1 ? 'active' : ''}`} onClick={() => onPageChange(i + 1)}>
                {i + 1}
              </button>
            ))}
            <button className="page-arrow" onClick={() => onPageChange(paginaActual + 1)} disabled={paginaActual >= totalPaginas}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="reporte-actions">
            <button className="btn-cerrar" onClick={onClose}>Cerrar</button>
          </div>
        </div>

      </div>
    </div>
  );
}
