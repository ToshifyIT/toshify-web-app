// ============================================================
// Modal de detalle de visita (ver info + cambiar estado)
// Responsabilidad: mostrar detalle y manejar transiciones de estado
// ============================================================

import { useState } from 'react';
import { X, Clock, User, MapPin, FileText, Tag, Users } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import type { VisitaCompleta, VisitaEstado } from '../../../types/visitas.types';
import { VISITA_ESTADOS } from '../../../types/visitas.types';

// Transiciones válidas de estado
const TRANSICIONES: Record<VisitaEstado, VisitaEstado[]> = {
  pendiente: ['cancelada'],
  en_curso: ['cancelada'],
  completada: [],
  no_asistio: [],
  cancelada: [],
};

const MAX_VISITANTES_VISIBLE = 5;

interface VisitaDetalleModalProps {
  visita: VisitaCompleta;
  canEdit: boolean;
  onEdit: () => void;
  onChangeEstado: (estado: VisitaEstado) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function VisitaDetalleModal({
  visita,
  canEdit,
  onEdit,
  onChangeEstado,
  onDelete,
  onClose,
}: VisitaDetalleModalProps) {
  const [showAllVisitantes, setShowAllVisitantes] = useState(false);

  const fechaHora = new Date(visita.fecha_hora);
  const fechaFormateada = format(fechaHora, "EEEE d 'de' MMMM, yyyy", { locale: es });
  const horaInicio = format(fechaHora, 'HH:mm');
  const horaFin = format(
    new Date(fechaHora.getTime() + visita.duracion_minutos * 60_000),
    'HH:mm'
  );
  const estadoActual = visita.estado as VisitaEstado;
  const estadoInfo = VISITA_ESTADOS[estadoActual];
  const transicionesDisponibles = TRANSICIONES[estadoActual];
  const isPast = estadoActual === 'completada' || estadoActual === 'cancelada' || estadoActual === 'no_asistio';

  // Parsear visitantes
  const nombres = visita.nombre_visitante?.split(';').map((n) => n.trim()).filter(Boolean) ?? [];
  const dnis = visita.dni_visitante?.split(';').map((d) => d.trim()).filter(Boolean) ?? [];
  const esMultiple = nombres.length > 1;
  const hayMuchos = nombres.length > MAX_VISITANTES_VISIBLE;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content visita-detalle-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="visita-detalle-header-info">
              <span
                className="visita-estado-badge"
                style={{ backgroundColor: estadoInfo.color }}
              >
                {estadoInfo.label}
              </span>
              <span
                className="visita-categoria-badge"
                style={{ backgroundColor: visita.categoria_color }}
              >
                {visita.categoria_nombre}
              </span>
            </div>
            <button className="modal-close" onClick={onClose}><X size={18} /></button>
          </div>

          <div className="modal-body visita-detalle-body">
            <div className="visita-detalle-row">
              {esMultiple ? <Users size={16} /> : <User size={16} />}
              <div>
                {!esMultiple ? (
                  <>
                    <strong>{visita.nombre_visitante}</strong>
                    {visita.dni_visitante && <span className="visita-detalle-sub"> - DNI: {visita.dni_visitante}</span>}
                  </>
                ) : (
                  <>
                    <div className="visita-detalle-visitantes-header">
                      <strong>{nombres.length} visitantes</strong>
                    </div>
                    <ul className="visita-detalle-visitantes-list">
                      {nombres.slice(0, MAX_VISITANTES_VISIBLE).map((nombre, i) => (
                        <li key={i}>
                          <strong>{nombre}</strong>
                          {dnis[i] && <span className="visita-detalle-sub"> - DNI: {dnis[i]}</span>}
                        </li>
                      ))}
                    </ul>
                    {hayMuchos && (
                      <button
                        className="visita-ver-todos-btn"
                        onClick={() => setShowAllVisitantes(true)}
                      >
                        Ver todos ({nombres.length})
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="visita-detalle-row">
              <Clock size={16} />
              <div>
                <div className="visita-detalle-fecha">{fechaFormateada}</div>
                <div>{horaInicio} - {horaFin} ({visita.duracion_minutos} min)</div>
              </div>
            </div>

            <div className="visita-detalle-row">
              <Tag size={16} />
              <div>
                <strong>Anfitrión:</strong> {visita.atendedor_nombre}
              </div>
            </div>

            {visita.motivo_nombre && (
              <div className="visita-detalle-row">
                <FileText size={16} />
                <div><strong>Motivo:</strong> {visita.motivo_nombre}</div>
              </div>
            )}

            {visita.patente && (
              <div className="visita-detalle-row">
                <MapPin size={16} />
                <div><strong>Patente:</strong> {visita.patente}</div>
              </div>
            )}

            {visita.nota && (
              <div className="visita-detalle-row">
                <FileText size={16} />
                <div><strong>Nota:</strong> {visita.nota}</div>
              </div>
            )}

            <div className="visita-detalle-meta">
              <span>Agendado por: {visita.citador_nombre}</span>
              <span>Creado: {format(new Date(visita.created_at), 'dd/MM/yyyy HH:mm')}</span>
            </div>

            {/* Transiciones de estado */}
            {canEdit && transicionesDisponibles.length > 0 && (
              <div className="visita-detalle-estados">
                <label>Cambiar estado:</label>
                <div className="visita-estados-btns">
                  {transicionesDisponibles.map((est) => {
                    const info = VISITA_ESTADOS[est];
                    return (
                      <button
                        key={est}
                        className="btn-estado"
                        style={{ backgroundColor: info.color }}
                        onClick={() => onChangeEstado(est)}
                      >
                        {info.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            {canEdit && !isPast && (
              <>
                <button className="btn-danger" onClick={onDelete}>Eliminar</button>
                <button className="btn-primary" onClick={onEdit}>Editar</button>
              </>
            )}
            <button className="btn-secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>

      {/* Sub-modal: lista completa de visitantes */}
      {showAllVisitantes && (
        <div className="modal-overlay visita-submodal-overlay" onClick={() => setShowAllVisitantes(false)}>
          <div className="modal-content visita-visitantes-submodal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Visitantes ({nombres.length})</h3>
              <button className="modal-close" onClick={() => setShowAllVisitantes(false)}><X size={18} /></button>
            </div>
            <div className="visita-visitantes-submodal-body">
              <table className="visita-visitantes-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nombre</th>
                    <th>DNI</th>
                  </tr>
                </thead>
                <tbody>
                  {nombres.map((nombre, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{nombre}</td>
                      <td>{dnis[i] || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
