// ============================================================
// Modal de formulario para crear/editar visitas
// Responsabilidad: UI del formulario + validación local
// Soporta múltiples visitantes para categoría Inducción + motivo Inducción
// ============================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';
import type {
  VisitaCategoria,
  VisitaMotivo,
  VisitaFormData,
  VisitaCompleta,
  VisitaAtendedor,
} from '../../../types/visitas.types';
import { VISITA_FORM_INITIAL } from '../../../types/visitas.types';
import { TIPO_ASIGNACION_LABELS } from '../../../types/onboarding.types';
import { getMotivosByCategoria, checkConflict } from '../../../services/visitasService';
import { format } from 'date-fns';

// Motivos derivados de asignaciones, formateados como opciones de select
const MOTIVOS_ASIGNACIONES = Object.entries(TIPO_ASIGNACION_LABELS).map(
  ([key, label]) => ({ key, label })
);

// Separador usado para concatenar múltiples visitantes en un solo campo
const VISITANTES_SEPARATOR = '; ';

interface VisitanteEntry {
  nombre: string;
  dni: string;
}

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

/**
 * Parsea campos concatenados (nombre_visitante, dni_visitante) en un array de VisitanteEntry.
 * Soporta el formato "Nombre1; Nombre2" / "DNI1; DNI2".
 */
function parseVisitantes(nombres: string, dnis: string): VisitanteEntry[] {
  const nombresArr = nombres.split(VISITANTES_SEPARATOR).map((s) => s.trim()).filter(Boolean);
  const dnisArr = dnis.split(VISITANTES_SEPARATOR).map((s) => s.trim());

  if (nombresArr.length <= 1) {
    return [{ nombre: nombres, dni: dnis }];
  }

  return nombresArr.map((nombre, i) => ({
    nombre,
    dni: dnisArr[i] ?? '',
  }));
}

/** Concatena un array de visitantes en los campos nombre_visitante y dni_visitante */
function serializeVisitantes(visitantes: VisitanteEntry[]): { nombre: string; dni: string } {
  const filtered = visitantes.filter((v) => v.nombre.trim());
  return {
    nombre: filtered.map((v) => v.nombre.trim()).join(VISITANTES_SEPARATOR),
    dni: filtered.map((v) => v.dni.trim()).join(VISITANTES_SEPARATOR),
  };
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

  // Estado para múltiples visitantes (solo activo en modo Inducción)
  const [visitantes, setVisitantes] = useState<VisitanteEntry[]>([{ nombre: '', dni: '' }]);

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

      // Parsear visitantes concatenados al editar
      setVisitantes(
        parseVisitantes(visita.nombre_visitante, visita.dni_visitante ?? '')
      );
    } else if (prefillDate) {
      setFormData((prev) => ({
        ...prev,
        fecha: format(prefillDate, 'yyyy-MM-dd'),
        hora: format(prefillDate, 'HH:mm'),
        atendedor_id: prefillResourceId ?? '',
      }));
      setVisitantes([{ nombre: '', dni: '' }]);
    }
  }, [mode, visita, prefillDate, prefillResourceId]);

  // Motivos filtrados por categoría seleccionada
  const motivosFiltrados = useMemo(
    () => getMotivosByCategoria(motivos, formData.categoria_id),
    [motivos, formData.categoria_id]
  );

  // Categoría seleccionada
  const categoriaSeleccionada = useMemo(
    () => categorias.find((c) => c.id === formData.categoria_id),
    [categorias, formData.categoria_id]
  );

  // Motivo seleccionado
  const motivoSeleccionado = useMemo(
    () => motivos.find((m) => m.id === formData.motivo_id),
    [motivos, formData.motivo_id]
  );

  // Determinar si la categoría es "Asignaciones" (motivos desde módulo de asignaciones)
  const esAsignaciones = useMemo(() => {
    return categoriaSeleccionada?.nombre?.trim().toLowerCase() === 'asignaciones';
  }, [categoriaSeleccionada]);

  // Determinar si el modo multi-visitante está activo
  const esInduccion = useMemo(() => {
    const catNombre = categoriaSeleccionada?.nombre?.trim().toLowerCase();
    const motNombre = motivoSeleccionado?.nombre?.trim().toLowerCase();
    return catNombre === 'inducción' && motNombre === 'inducción';
  }, [categoriaSeleccionada, motivoSeleccionado]);

  // Al cambiar categoría, actualizar duración default y limpiar motivo
  function handleCategoriaChange(categoriaId: string) {
    const cat = categorias.find((c) => c.id === categoriaId);
    setFormData((prev) => ({
      ...prev,
      categoria_id: categoriaId,
      motivo_id: '',
      duracion_minutos: cat?.duracion_default ?? 30,
    }));
    // Resetear visitantes al cambiar categoría
    setVisitantes([{ nombre: '', dni: '' }]);
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

  // --- Handlers de visitantes múltiples ---
  const handleVisitanteChange = useCallback(
    (index: number, field: 'nombre' | 'dni', value: string) => {
      setVisitantes((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
      // Limpiar error de nombre si se está escribiendo
      if (field === 'nombre' && errors.nombre_visitante) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.nombre_visitante;
          return next;
        });
      }
    },
    [errors.nombre_visitante]
  );

  const handleAddVisitante = useCallback(() => {
    setVisitantes((prev) => [...prev, { nombre: '', dni: '' }]);
  }, []);

  const handleRemoveVisitante = useCallback((index: number) => {
    setVisitantes((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  function validate(): boolean {
    const e: Partial<Record<keyof VisitaFormData, string>> = {};
    if (!formData.categoria_id) e.categoria_id = 'Seleccione una categoría';
    if (!formData.atendedor_id) e.atendedor_id = 'Seleccione un anfitrión';

    if (esInduccion) {
      // Validar que al menos un visitante tenga nombre
      const tieneAlMenosUno = visitantes.some((v) => v.nombre.trim());
      if (!tieneAlMenosUno) {
        e.nombre_visitante = 'Ingrese al menos un visitante';
      }
    } else {
      if (!formData.nombre_visitante.trim()) {
        e.nombre_visitante = 'Ingrese el nombre del visitante';
      }
    }

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

    // Si es modo multi-visitante, serializar antes de enviar
    let dataToSave = { ...formData };
    if (esInduccion) {
      const { nombre, dni } = serializeVisitantes(visitantes);
      dataToSave = {
        ...dataToSave,
        nombre_visitante: nombre,
        dni_visitante: dni,
      };
    }

    setSaving(true);
    try {
      // Verificar conflicto de agenda (skip para categorías grupales)
      if (categoriaSeleccionada?.tipo_visita !== 'grupal') {
        const fechaHora = `${dataToSave.fecha}T${dataToSave.hora}:00`;
        const hasConflict = await checkConflict(
          dataToSave.atendedor_id,
          fechaHora,
          dataToSave.duracion_minutos,
          mode === 'edit' ? visita?.id : undefined
        );

        if (hasConflict) {
          const atendedor = atendedores.find((a) => a.id === dataToSave.atendedor_id);
          await Swal.fire(
            'Conflicto de agenda',
            `${atendedor?.nombre ?? 'El anfitrión'} ya tiene una cita en ese horario.`,
            'warning'
          );
          return;
        }
      }

      await onSave(dataToSave);
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

          {/* Motivo: muestra motivos de asignaciones o motivos normales según categoría */}
          {esAsignaciones ? (
            <div className="form-group">
              <label>Motivo</label>
              <select
                value={formData.motivo_id}
                onChange={(e) => handleChange('motivo_id', e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {MOTIVOS_ASIGNACIONES.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>
          ) : motivosFiltrados.length > 0 ? (
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
          ) : null}

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

          {/* Visitante(s) */}
          {esInduccion ? (
            <div className="form-group">
              <div className="visitantes-header">
                <label>Visitantes <span className="required">*</span></label>
                <button
                  type="button"
                  className="btn-add-visitante"
                  onClick={handleAddVisitante}
                  title="Agregar visitante"
                >
                  <Plus size={14} /> Agregar
                </button>
              </div>
              {errors.nombre_visitante && (
                <span className="error-message">{errors.nombre_visitante}</span>
              )}
              <div className="visitantes-list">
                {visitantes.map((v, index) => (
                  <div key={index} className="visitante-row">
                    <div className="visitante-fields">
                      <input
                        type="text"
                        value={v.nombre}
                        onChange={(e) => handleVisitanteChange(index, 'nombre', e.target.value)}
                        placeholder={`Nombre completo ${index + 1}`}
                        className="visitante-nombre"
                      />
                      <input
                        type="text"
                        value={v.dni}
                        onChange={(e) => handleVisitanteChange(index, 'dni', e.target.value)}
                        placeholder="DNI"
                        className="visitante-dni"
                      />
                    </div>
                    {visitantes.length > 1 && (
                      <button
                        type="button"
                        className="btn-remove-visitante"
                        onClick={() => handleRemoveVisitante(index)}
                        title="Eliminar visitante"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <span className="visitantes-count">
                {visitantes.filter((v) => v.nombre.trim()).length} visitante(s)
              </span>
            </div>
          ) : (
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
          )}

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
