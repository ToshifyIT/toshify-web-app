// ============================================================
// Modal de formulario para crear/editar visitas
// Responsabilidad: UI del formulario + validación local
// ============================================================

import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import Swal from 'sweetalert2';
import type {
  VisitaCategoria,
  VisitaMotivo,
  VisitaFormData,
  VisitaCompleta,
  VisitaAtendedor,
} from '../../../types/visitas.types';
import { VISITA_FORM_INITIAL } from '../../../types/visitas.types';
import { getMotivosByCategoria, checkConflict } from '../../../services/visitasService';
import { format } from 'date-fns';

interface VisitasFormModalProps {
  mode: 'create' | 'edit';
  visita: VisitaCompleta | null;
  categorias: VisitaCategoria[];
  motivos: VisitaMotivo[];
  atendedores: VisitaAtendedor[];
  prefillDate?: Date;
  prefillResourceId?: string;
  onSave: (data: VisitaFormData) => Promise<void>;
  onClose: () => void;
}

export function VisitasFormModal({
  mode,
  visita,
  categorias,
  motivos,
  atendedores,
  prefillDate,
  prefillResourceId,
  onSave,
  onClose,
}: VisitasFormModalProps) {
  const [formData, setFormData] = useState<VisitaFormData>(VISITA_FORM_INITIAL);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof VisitaFormData, string>>>({});

  // Prefill on open
  useEffect(() => {
    if (mode === 'edit' && visita) {
      const dt = new Date(visita.fecha_hora);
      setFormData({
        categoria_id: visita.categoria_id,
        motivo_id: visita.motivo_id ?? '',
        atendedor_id: visita.atendedor_id,
        nombre_visitante: visita.nombre_visitante,
        dni_visitante: visita.dni_visitante ?? '',
        patente: visita.patente ?? '',
        fecha: format(dt, 'yyyy-MM-dd'),
        hora: format(dt, 'HH:mm'),
        duracion_minutos: visita.duracion_minutos,
        nota: visita.nota ?? '',
      });
    } else if (prefillDate) {
      setFormData((prev) => ({
        ...prev,
        fecha: format(prefillDate, 'yyyy-MM-dd'),
        hora: format(prefillDate, 'HH:mm'),
        atendedor_id: prefillResourceId ?? '',
      }));
    }
  }, [mode, visita, prefillDate, prefillResourceId]);

  // Motivos filtrados por categoría seleccionada
  const motivosFiltrados = useMemo(
    () => getMotivosByCategoria(motivos, formData.categoria_id),
    [motivos, formData.categoria_id]
  );

  // Categoría seleccionada (para saber si requiere patente y duración default)
  const categoriaSeleccionada = useMemo(
    () => categorias.find((c) => c.id === formData.categoria_id),
    [categorias, formData.categoria_id]
  );

  // Al cambiar categoría, actualizar duración default y limpiar motivo
  function handleCategoriaChange(categoriaId: string) {
    const cat = categorias.find((c) => c.id === categoriaId);
    setFormData((prev) => ({
      ...prev,
      categoria_id: categoriaId,
      motivo_id: '',
      duracion_minutos: cat?.duracion_default ?? 30,
    }));
  }

  function handleChange(field: keyof VisitaFormData, value: string | number) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function validate(): boolean {
    const e: Partial<Record<keyof VisitaFormData, string>> = {};
    if (!formData.categoria_id) e.categoria_id = 'Seleccione una categoría';
    if (!formData.atendedor_id) e.atendedor_id = 'Seleccione un anfitrión';
    if (!formData.nombre_visitante.trim()) e.nombre_visitante = 'Ingrese el nombre del visitante';
    if (!formData.fecha) e.fecha = 'Seleccione la fecha';
    if (!formData.hora) e.hora = 'Seleccione la hora';
    if (formData.duracion_minutos < 15) e.duracion_minutos = 'Mínimo 15 minutos';
    if (categoriaSeleccionada?.requiere_patente && !formData.patente.trim()) {
      e.patente = 'Esta categoría requiere patente';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    setSaving(true);
    try {
      // Verificar conflicto de agenda (skip para categorías grupales)
      if (categoriaSeleccionada?.tipo_visita !== 'grupal') {
        const fechaHora = `${formData.fecha}T${formData.hora}:00`;
        const hasConflict = await checkConflict(
          formData.atendedor_id,
          fechaHora,
          formData.duracion_minutos,
          mode === 'edit' ? visita?.id : undefined
        );

        if (hasConflict) {
          const atendedor = atendedores.find((a) => a.id === formData.atendedor_id);
          await Swal.fire(
            'Conflicto de agenda',
            `${atendedor?.nombre ?? 'El anfitrión'} ya tiene una cita en ese horario.`,
            'warning'
          );
          return;
        }
      }

      await onSave(formData);
    } catch {
      Swal.fire('Error', 'No se pudo guardar la cita', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content visitas-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'create' ? 'Nueva Cita' : 'Editar Cita'}</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {/* Categoría */}
          <div className="form-group">
            <label>Categoría <span className="required">*</span></label>
            <select
              value={formData.categoria_id}
              onChange={(e) => handleCategoriaChange(e.target.value)}
              className={errors.categoria_id ? 'input-error' : ''}
            >
              <option value="">Seleccionar...</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            {errors.categoria_id && <span className="error-message">{errors.categoria_id}</span>}
          </div>

          {/* Motivo */}
          {motivosFiltrados.length > 0 && (
            <div className="form-group">
              <label>Motivo</label>
              <select
                value={formData.motivo_id}
                onChange={(e) => handleChange('motivo_id', e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {motivosFiltrados.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {/* Anfitrión */}
          <div className="form-group">
            <label>Anfitrión <span className="required">*</span></label>
            <select
              value={formData.atendedor_id}
              onChange={(e) => handleChange('atendedor_id', e.target.value)}
              className={errors.atendedor_id ? 'input-error' : ''}
            >
              <option value="">Seleccionar...</option>
              {atendedores.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
            {errors.atendedor_id && <span className="error-message">{errors.atendedor_id}</span>}
          </div>

          {/* Visitante */}
          <div className="form-row">
            <div className="form-group">
              <label>Nombre visitante <span className="required">*</span></label>
              <input
                type="text"
                value={formData.nombre_visitante}
                onChange={(e) => handleChange('nombre_visitante', e.target.value)}
                className={errors.nombre_visitante ? 'input-error' : ''}
                placeholder="Nombre completo"
              />
              {errors.nombre_visitante && <span className="error-message">{errors.nombre_visitante}</span>}
            </div>
            <div className="form-group">
              <label>DNI</label>
              <input
                type="text"
                value={formData.dni_visitante}
                onChange={(e) => handleChange('dni_visitante', e.target.value)}
                placeholder="Documento"
              />
            </div>
          </div>

          {/* Patente (solo si la categoría lo requiere) */}
          {categoriaSeleccionada?.requiere_patente && (
            <div className="form-group">
              <label>Patente <span className="required">*</span></label>
              <input
                type="text"
                value={formData.patente}
                onChange={(e) => handleChange('patente', e.target.value.toUpperCase())}
                className={errors.patente ? 'input-error' : ''}
                placeholder="Ej: AB123CD"
              />
              {errors.patente && <span className="error-message">{errors.patente}</span>}
            </div>
          )}

          {/* Fecha y hora */}
          <div className="form-row">
            <div className="form-group">
              <label>Fecha <span className="required">*</span></label>
              <input
                type="date"
                value={formData.fecha}
                onChange={(e) => handleChange('fecha', e.target.value)}
                className={errors.fecha ? 'input-error' : ''}
              />
              {errors.fecha && <span className="error-message">{errors.fecha}</span>}
            </div>
            <div className="form-group">
              <label>Hora <span className="required">*</span></label>
              <input
                type="time"
                value={formData.hora}
                onChange={(e) => handleChange('hora', e.target.value)}
                className={errors.hora ? 'input-error' : ''}
              />
              {errors.hora && <span className="error-message">{errors.hora}</span>}
            </div>
            <div className="form-group">
              <label>Duración</label>
              {categoriaSeleccionada?.duracion_modificable ? (
                <select
                  value={formData.duracion_minutos}
                  onChange={(e) => handleChange('duracion_minutos', Number(e.target.value))}
                >
                  <option value={30}>30 min</option>
                  <option value={60}>60 min</option>
                  <option value={90}>90 min</option>
                  <option value={120}>2 horas</option>
                  <option value={180}>3 horas</option>
                  <option value={240}>4 horas</option>
                  <option value={300}>5 horas</option>
                  <option value={360}>6 horas</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={`${formData.duracion_minutos} min`}
                  disabled
                  style={{ backgroundColor: 'var(--color-bg-secondary)', cursor: 'not-allowed' }}
                />
              )}
            </div>
          </div>

          {/* Nota */}
          <div className="form-group">
            <label>Nota</label>
            <textarea
              value={formData.nota}
              onChange={(e) => handleChange('nota', e.target.value)}
              rows={3}
              placeholder="Observaciones adicionales..."
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Guardando...' : mode === 'create' ? 'Agendar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
