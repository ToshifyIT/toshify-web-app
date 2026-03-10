// ============================================================
// Modal de formulario para crear/editar visitas
// Responsabilidad: UI del formulario + validación local
// Soporta múltiples visitantes para categoría Inducción + motivo Inducción
// Auto-asigna anfitrión según categoría+motivo (excepto Directivo)
// ============================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Plus, Trash2, User } from 'lucide-react';
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
import { getMotivosByCategoria, checkConflict, buildLocalTimestamp } from '../../../services/visitasService';
import { format } from 'date-fns';

// Motivos derivados de asignaciones, formateados como opciones de select
const MOTIVOS_ASIGNACIONES = Object.entries(TIPO_ASIGNACION_LABELS).map(
  ([key, label]) => ({ key, label })
);

/**
 * Mapeo categoría+motivo → anfitrión por defecto.
 * Clave: "categoria::motivo" (lowercase, trimmed). Valor: nombre del anfitrión.
 * Para categorías con un único anfitrión sin importar el motivo: "categoria::*".
 */
const ANFITRION_DEFAULT_MAP: Record<string, string> = {
  'inducción::inducción': 'Manuel/Marina',
  'asignaciones::*': 'Iván',
  'siniestros::declaración de siniestro': 'Eugenia',
  'logística::checklist': 'Emiliano',
  'logística::incidencia': 'Emiliano',
  'logística::service': 'Emiliano',
  'autos del pueblo::inducción': 'Manuel/Marina',
  'autos del pueblo::check vehicular': 'Emiliano',
  'autos del pueblo::check vehícular': 'Emiliano',
  'autos del pueblo::firma de contrato de alquiler': 'Karen',
  'externo::proveedor': 'Eugenia',
  'externo::taller kalzalo': 'Kalzalo',
};

/** Categorías donde el anfitrión se elige manualmente (no auto-asignar) */
const CATEGORIAS_ANFITRION_MANUAL = ['directivo'];

/** Para "Directivo", solo mostrar estos anfitriones */
const ANFITRIONES_DIRECTIVO = ['josué', 'sara'];

// Separador para concatenar múltiples visitantes en un solo campo
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

function serializeVisitantes(visitantes: VisitanteEntry[]): { nombre: string; dni: string } {
  const filtered = visitantes.filter((v) => v.nombre.trim());
  return {
    nombre: filtered.map((v) => v.nombre.trim()).join(VISITANTES_SEPARATOR),
    dni: filtered.map((v) => v.dni.trim()).join(VISITANTES_SEPARATOR),
  };
}

/**
 * Busca el anfitrión por defecto para una categoría+motivo.
 * Retorna el id del anfitrión si se encuentra match, o '' si no.
 */
function resolveDefaultAnfitrion(
  catNombre: string | undefined,
  motNombre: string | undefined,
  atendedores: VisitaAtendedor[]
): string {
  if (!catNombre) return '';
  const catKey = catNombre.trim().toLowerCase();

  // No auto-asignar para categorías manuales
  if (CATEGORIAS_ANFITRION_MANUAL.includes(catKey)) return '';

  // Buscar por categoría+motivo específico
  if (motNombre) {
    const motKey = motNombre.trim().toLowerCase();
    const specificKey = `${catKey}::${motKey}`;
    const anfitrionNombre = ANFITRION_DEFAULT_MAP[specificKey];
    if (anfitrionNombre) {
      const match = atendedores.find(
        (a) => a.nombre.toLowerCase() === anfitrionNombre.toLowerCase()
      );
      if (match) return match.id;
    }
  }

  // Buscar por categoría wildcard
  const wildcardKey = `${catKey}::*`;
  const anfitrionNombre = ANFITRION_DEFAULT_MAP[wildcardKey];
  if (anfitrionNombre) {
    const match = atendedores.find(
      (a) => a.nombre.toLowerCase() === anfitrionNombre.toLowerCase()
    );
    if (match) return match.id;
  }

  return '';
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

  // Motivo seleccionado (para motivos normales o nombre desde asignaciones)
  const motivoSeleccionado = useMemo(
    () => motivos.find((m) => m.id === formData.motivo_id),
    [motivos, formData.motivo_id]
  );

  const esAsignaciones = useMemo(() => {
    return categoriaSeleccionada?.nombre?.trim().toLowerCase() === 'asignaciones';
  }, [categoriaSeleccionada]);

  const esDirectivo = useMemo(() => {
    return categoriaSeleccionada?.nombre?.trim().toLowerCase() === 'directivo';
  }, [categoriaSeleccionada]);

  const esInduccion = useMemo(() => {
    const catNombre = categoriaSeleccionada?.nombre?.trim().toLowerCase();
    const motNombre = motivoSeleccionado?.nombre?.trim().toLowerCase();
    return catNombre === 'inducción' && motNombre === 'inducción';
  }, [categoriaSeleccionada, motivoSeleccionado]);

  // Anfitriones filtrados: para Directivo solo Josué/Sara, para el resto todos
  const anfitrionesDisponibles = useMemo(() => {
    if (esDirectivo) {
      return atendedores.filter((a) =>
        ANFITRIONES_DIRECTIVO.includes(a.nombre.toLowerCase())
      );
    }
    return atendedores;
  }, [atendedores, esDirectivo]);

  // Determinar si el anfitrión fue auto-asignado (para mostrarlo como readonly)
  const anfitrionAutoAsignado = useMemo(() => {
    if (!categoriaSeleccionada) return false;
    const catKey = categoriaSeleccionada.nombre.trim().toLowerCase();
    return !CATEGORIAS_ANFITRION_MANUAL.includes(catKey);
  }, [categoriaSeleccionada]);

  // Nombre del anfitrión seleccionado
  const anfitrionNombre = useMemo(() => {
    return atendedores.find((a) => a.id === formData.atendedor_id)?.nombre ?? '';
  }, [atendedores, formData.atendedor_id]);

  // Auto-asignar anfitrión cuando cambia categoría o motivo
  useEffect(() => {
    // Solo auto-asignar en modo create o si el usuario cambió la categoría
    if (mode === 'edit') return;
    if (!categoriaSeleccionada) return;

    const catKey = categoriaSeleccionada.nombre.trim().toLowerCase();
    if (CATEGORIAS_ANFITRION_MANUAL.includes(catKey)) return;

    const motNombre = motivoSeleccionado?.nombre;
    const resolved = resolveDefaultAnfitrion(
      categoriaSeleccionada.nombre,
      motNombre,
      atendedores
    );
    if (resolved) {
      setFormData((prev) => ({ ...prev, atendedor_id: resolved }));
    }
  }, [categoriaSeleccionada, motivoSeleccionado, atendedores, mode]);

  // Al cambiar categoría: duración default, limpiar motivo, auto-asignar anfitrión
  function handleCategoriaChange(categoriaId: string) {
    const cat = categorias.find((c) => c.id === categoriaId);
    setFormData((prev) => ({
      ...prev,
      categoria_id: categoriaId,
      motivo_id: '',
      atendedor_id: '', // Se re-asigna via useEffect
      duracion_minutos: cat?.duracion_default ?? 30,
    }));
    setVisitantes([{ nombre: '', dni: '' }]);
  }

  function handleMotivoChange(motivoId: string) {
    setFormData((prev) => ({
      ...prev,
      motivo_id: motivoId,
      // anfitrión se re-asigna via useEffect cuando cambia motivoSeleccionado
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

  // --- Handlers de visitantes múltiples ---
  const handleVisitanteChange = useCallback(
    (index: number, field: 'nombre' | 'dni', value: string) => {
      setVisitantes((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
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
      if (categoriaSeleccionada?.tipo_visita !== 'grupal') {
        const fechaHora = buildLocalTimestamp(dataToSave.fecha, dataToSave.hora);
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

        <div className="modal-body vf-compact">
          {/* ── Categoría (chips) ── */}
          <div className="form-group">
            <label className="vf-label-sm">Categoría <span className="required">*</span></label>
            <div className="vf-category-grid">
              {categorias.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`vf-category-chip ${formData.categoria_id === c.id ? 'active' : ''}`}
                  style={{
                    '--chip-color': c.color,
                    borderColor: formData.categoria_id === c.id ? c.color : undefined,
                  } as React.CSSProperties}
                  onClick={() => handleCategoriaChange(c.id)}
                >
                  <span className="vf-chip-dot" style={{ background: c.color }} />
                  {c.nombre}
                </button>
              ))}
            </div>
            {errors.categoria_id && <span className="error-message">{errors.categoria_id}</span>}
          </div>

          {/* ── Motivo + Anfitrión (fila compacta, solo si hay categoría) ── */}
          {categoriaSeleccionada && (
            <div className="vf-motivo-anfitrion-row">
              {/* Motivo dropdown */}
              {esAsignaciones ? (
                <div className="form-group vf-motivo-field">
                  <label className="vf-label-sm">Motivo</label>
                  <select
                    value={formData.motivo_id}
                    onChange={(e) => handleMotivoChange(e.target.value)}
                  >
                    <option value="">Seleccionar motivo...</option>
                    {MOTIVOS_ASIGNACIONES.map((m) => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                </div>
              ) : motivosFiltrados.length > 0 ? (
                <div className="form-group vf-motivo-field">
                  <label className="vf-label-sm">Motivo</label>
                  <select
                    value={formData.motivo_id}
                    onChange={(e) => handleMotivoChange(e.target.value)}
                  >
                    <option value="">Seleccionar motivo...</option>
                    {motivosFiltrados.map((m) => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Anfitrión: dropdown solo para Directivo, inline text para auto, warning si falta */}
              {!anfitrionAutoAsignado ? (
                <div className="form-group vf-anfitrion-field">
                  <label className="vf-label-sm">Anfitrión <span className="required">*</span></label>
                  <select
                    value={formData.atendedor_id}
                    onChange={(e) => handleChange('atendedor_id', e.target.value)}
                    className={errors.atendedor_id ? 'input-error' : ''}
                  >
                    <option value="">Seleccionar...</option>
                    {anfitrionesDisponibles.map((a) => (
                      <option key={a.id} value={a.id}>{a.nombre}</option>
                    ))}
                  </select>
                  {errors.atendedor_id && <span className="error-message">{errors.atendedor_id}</span>}
                </div>
              ) : formData.atendedor_id ? (
                <div className="vf-anfitrion-inline">
                  <User size={13} />
                  <span>Atiende: <strong>{anfitrionNombre}</strong></span>
                </div>
              ) : (
                <div className="vf-anfitrion-warning">
                  <span>Sin anfitrión para esta categoría</span>
                </div>
              )}
            </div>
          )}

          {/* ── Separador ── */}
          <div className="vf-divider" />

          {/* ── Visitante ── */}
          {esInduccion ? (
            <div className="form-group">
              <div className="visitantes-header">
                <label className="vf-label-sm">Visitantes <span className="required">*</span></label>
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
            <div className="vf-visitante-row">
              <div className="form-group vf-visitante-nombre">
                <label className="vf-label-sm">Visitante <span className="required">*</span></label>
                <input
                  type="text"
                  value={formData.nombre_visitante}
                  onChange={(e) => handleChange('nombre_visitante', e.target.value)}
                  className={errors.nombre_visitante ? 'input-error' : ''}
                  placeholder="Nombre completo"
                />
                {errors.nombre_visitante && <span className="error-message">{errors.nombre_visitante}</span>}
              </div>
              <div className="form-group vf-visitante-dni">
                <label className="vf-label-sm">DNI</label>
                <input
                  type="text"
                  value={formData.dni_visitante}
                  onChange={(e) => handleChange('dni_visitante', e.target.value)}
                  placeholder="Documento"
                  inputMode="numeric"
                />
              </div>
              {categoriaSeleccionada?.requiere_patente && (
                <div className="form-group vf-visitante-patente">
                  <label className="vf-label-sm">Patente <span className="required">*</span></label>
                  <input
                    type="text"
                    value={formData.patente}
                    onChange={(e) => handleChange('patente', e.target.value.toUpperCase())}
                    className={errors.patente ? 'input-error' : ''}
                    placeholder="AB123CD"
                    style={{ textTransform: 'uppercase', letterSpacing: '1px' }}
                  />
                  {errors.patente && <span className="error-message">{errors.patente}</span>}
                </div>
              )}
            </div>
          )}

          {/* ── Fecha / Hora / Duración ── */}
          <div className="vf-datetime-row">
            <div className="form-group">
              <label className="vf-label-sm">Fecha <span className="required">*</span></label>
              <input
                type="date"
                value={formData.fecha}
                onChange={(e) => handleChange('fecha', e.target.value)}
                className={errors.fecha ? 'input-error' : ''}
              />
              {errors.fecha && <span className="error-message">{errors.fecha}</span>}
            </div>
            <div className="form-group">
              <label className="vf-label-sm">Hora <span className="required">*</span></label>
              <input
                type="time"
                value={formData.hora}
                onChange={(e) => handleChange('hora', e.target.value)}
                className={errors.hora ? 'input-error' : ''}
              />
              {errors.hora && <span className="error-message">{errors.hora}</span>}
            </div>
            <div className="form-group">
              <label className="vf-label-sm">Duración</label>
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
                />
              )}
            </div>
          </div>

          {/* ── Nota ── */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="vf-label-sm">
              Nota
              <span className="vf-optional-tag">opcional</span>
            </label>
            <textarea
              value={formData.nota}
              onChange={(e) => handleChange('nota', e.target.value)}
              rows={2}
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
