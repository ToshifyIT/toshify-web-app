// ============================================================
// Sub-tab ABM: Anfitriones (personas que atienden visitas)
// CRUD con DataTable + modal inline, filtrado por sede
// ============================================================

import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, Check, Loader2, Users, Clock, Tag } from 'lucide-react';
import Swal from 'sweetalert2';
import { showSuccess } from '../../../utils/toast';
import { useSede } from '../../../contexts/SedeContext';
import { DataTable } from '../../../components/ui/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import type { VisitaAtendedor, VisitaHorario, VisitaMotivo, VisitaCategoria } from '../../../types/visitas.types';
import {
  fetchAllAtendedores,
  createAtendedor,
  updateAtendedor,
  deleteAtendedor,
  fetchHorariosByAtendedor,
  upsertHorarios,
  fetchMotivosDeAtendedor,
  saveMotivoAtendedores,
} from '../../../services/visitasService';
import { supabase } from '../../../lib/supabase';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

interface AtendedorFormData {
  nombre: string;
  user_id: string;
  activo: boolean;
}

const INITIAL_FORM: AtendedorFormData = {
  nombre: '',
  user_id: '',
  activo: true,
};

interface HorarioRow {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  activo: boolean;
}

export function AtendedoresSubTab() {
  const { sedeActualId } = useSede();
  const [data, setData] = useState<VisitaAtendedor[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal CRUD
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selected, setSelected] = useState<VisitaAtendedor | null>(null);
  const [form, setForm] = useState<AtendedorFormData>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  // Modal Horarios
  const [showHorariosModal, setShowHorariosModal] = useState(false);
  const [horariosAtendedor, setHorariosAtendedor] = useState<VisitaAtendedor | null>(null);
  const [horarios, setHorarios] = useState<HorarioRow[]>([]);
  const [savingHorarios, setSavingHorarios] = useState(false);

  // Modal Motivos
  const [showMotivosModal, setShowMotivosModal] = useState(false);
  const [motivosAtendedor, setMotivosAtendedor] = useState<VisitaAtendedor | null>(null);
  const [allMotivos, setAllMotivos] = useState<(VisitaMotivo & { categoria_nombre: string })[]>([]);
  const [allCategorias, setAllCategorias] = useState<VisitaCategoria[]>([]);
  const [selectedMotivos, setSelectedMotivos] = useState<Set<string>>(new Set());
  const [savingMotivos, setSavingMotivos] = useState(false);

  useEffect(() => { cargar(); }, [sedeActualId]);

  async function cargar() {
    setLoading(true);
    try {
      setData(await fetchAllAtendedores(sedeActualId));
    } catch {
      Swal.fire('Error', 'No se pudieron cargar los anfitriones', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleCreate() {
    setForm(INITIAL_FORM);
    setSelected(null);
    setModalMode('create');
    setShowModal(true);
  }

  function handleEdit(item: VisitaAtendedor) {
    setForm({
      nombre: item.nombre,
      user_id: item.user_id ?? '',
      activo: item.activo,
    });
    setSelected(item);
    setModalMode('edit');
    setShowModal(true);
  }

  async function handleDelete(item: VisitaAtendedor) {
    const res = await Swal.fire({
      title: 'Desactivar anfitrión',
      text: `¿Desactivar a "${item.nombre}"? Dejará de aparecer en el sistema pero sus citas históricas se conservan.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, desactivar',
      cancelButtonText: 'Cancelar',
    });
    if (!res.isConfirmed) return;
    try {
      await deleteAtendedor(item.id);
      showSuccess('Anfitrión desactivado');
      cargar();
    } catch {
      Swal.fire('Error', 'No se pudo desactivar el anfitrión', 'error');
    }
  }

  async function handleSave() {
    if (!form.nombre.trim()) {
      Swal.fire('Error', 'El nombre es requerido', 'error');
      return;
    }
    if (!sedeActualId) {
      Swal.fire('Error', 'No se pudo determinar la sede', 'error');
      return;
    }
    setSaving(true);
    try {
      if (modalMode === 'create') {
        await createAtendedor({
          nombre: form.nombre.trim(),
          user_id: form.user_id || null,
          sede_id: sedeActualId,
          activo: form.activo,
        });
        showSuccess('Anfitrión creado');
      } else if (selected) {
        await updateAtendedor(selected.id, {
          nombre: form.nombre.trim(),
          user_id: form.user_id || null,
          activo: form.activo,
        });
        showSuccess('Anfitrión actualizado');
      }
      setShowModal(false);
      cargar();
    } catch {
      Swal.fire('Error', 'No se pudo guardar el anfitrión', 'error');
    } finally {
      setSaving(false);
    }
  }

  // --- Motivos ---
  async function handleOpenMotivos(item: VisitaAtendedor) {
    setMotivosAtendedor(item);
    try {
      // Cargar todos los motivos+categorias y los ya asignados en paralelo
      const [{ data: motData }, { data: catData }, asignados] = await Promise.all([
        supabase.from('visitas_motivos').select('id, nombre, categoria_id, activo').eq('activo', true).order('categoria_id'),
        supabase.from('visitas_categorias').select('id, nombre').order('nombre'),
        fetchMotivosDeAtendedor(item.id),
      ]);
      const cats = (catData ?? []) as VisitaCategoria[];
      const catMap = new Map(cats.map((c) => [c.id, c.nombre]));
      const motivosConCat = ((motData ?? []) as VisitaMotivo[]).map((m) => ({
        ...m,
        categoria_nombre: catMap.get(m.categoria_id) ?? '',
      }));
      setAllMotivos(motivosConCat);
      setAllCategorias(cats);
      setSelectedMotivos(new Set(asignados));
      setShowMotivosModal(true);
    } catch {
      Swal.fire('Error', 'No se pudieron cargar los motivos', 'error');
    }
  }

  function toggleMotivo(motivoId: string) {
    setSelectedMotivos((prev) => {
      const next = new Set(prev);
      if (next.has(motivoId)) next.delete(motivoId);
      else next.add(motivoId);
      return next;
    });
  }

  async function handleSaveMotivos() {
    if (!motivosAtendedor || !sedeActualId) return;
    setSavingMotivos(true);
    try {
      await saveMotivoAtendedores(motivosAtendedor.id, [...selectedMotivos], sedeActualId);
      showSuccess('Motivos actualizados');
      setShowMotivosModal(false);
    } catch {
      Swal.fire('Error', 'No se pudieron guardar los motivos', 'error');
    } finally {
      setSavingMotivos(false);
    }
  }

  // --- Horarios ---
  async function handleOpenHorarios(item: VisitaAtendedor) {
    setHorariosAtendedor(item);
    try {
      const existing = await fetchHorariosByAtendedor(item.id);
      if (existing.length > 0) {
        const rows: HorarioRow[] = Array.from({ length: 7 }, (_, i) => {
          const dia = i + 1;
          const found = existing.find((h: VisitaHorario) => h.dia_semana === dia);
          return found
            ? { dia_semana: dia, hora_inicio: found.hora_inicio, hora_fin: found.hora_fin, activo: found.activo }
            : { dia_semana: dia, hora_inicio: '09:00', hora_fin: '18:00', activo: false };
        });
        setHorarios(rows);
      } else {
        setHorarios(
          Array.from({ length: 7 }, (_, i) => ({
            dia_semana: i + 1,
            hora_inicio: '09:00',
            hora_fin: '18:00',
            activo: i < 5,
          }))
        );
      }
      setShowHorariosModal(true);
    } catch {
      Swal.fire('Error', 'No se pudieron cargar los horarios', 'error');
    }
  }

  function updateHorario(index: number, field: keyof HorarioRow, value: string | boolean) {
    setHorarios((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  async function handleSaveHorarios() {
    if (!horariosAtendedor) return;
    setSavingHorarios(true);
    try {
      const activos = horarios.filter((h) => h.activo);
      await upsertHorarios(horariosAtendedor.id, activos);
      showSuccess('Horarios actualizados');
      setShowHorariosModal(false);
    } catch {
      Swal.fire('Error', 'No se pudieron guardar los horarios', 'error');
    } finally {
      setSavingHorarios(false);
    }
  }

  const columns = useMemo<ColumnDef<VisitaAtendedor>[]>(() => [
    {
      accessorKey: 'nombre',
      header: 'Nombre',
    },
    {
      id: 'activo',
      accessorFn: (row: any) => row.activo ? 'Activo' : 'Inactivo',
      header: 'Estado',
      cell: ({ getValue }) => (
        <span className={`dt-badge ${getValue() === 'Activo' ? 'dt-badge-solid-green' : 'dt-badge-solid-gray'}`}>
          {getValue() as string}
        </span>
      ),
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="dt-actions">
          <button
            className="dt-btn-action dt-btn-view"
            onClick={() => handleOpenHorarios(row.original)}
            title="Horarios"
          >
            <Clock size={14} />
          </button>
          <button
            className="dt-btn-action dt-btn-purple"
            onClick={() => handleOpenMotivos(row.original)}
            title="Motivos asociados"
          >
            <Tag size={14} />
          </button>
          <button className="dt-btn-action dt-btn-edit" onClick={() => handleEdit(row.original)} title="Editar">
            <Edit2 size={14} />
          </button>
          <button className="dt-btn-action dt-btn-delete" onClick={() => handleDelete(row.original)} title="Desactivar">
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ], []);

  return (
    <>
      <DataTable
        data={data}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar anfitriones..."
        emptyIcon={<Users size={48} />}
        emptyTitle="No hay anfitriones"
        emptyDescription="Agregue un nuevo anfitrión."
        headerAction={
          <button className="visitas-btn-primary" onClick={handleCreate}>
            <Plus size={16} /> Nuevo Anfitrión
          </button>
        }
      />

      {/* Modal CRUD Anfitrión */}
      {showModal && (
        <div className="visitas-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="visitas-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="visitas-modal-header">
              <h2>{modalMode === 'create' ? 'Nuevo Anfitrión' : 'Editar Anfitrión'}</h2>
              <button className="visitas-modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="visitas-modal-body">
              <div className="visitas-form-section">
                <div className="visitas-form-group">
                  <label>Nombre <span className="required">*</span></label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                    placeholder="Ej: Josué Martínez"
                  />
                </div>
                <div className="visitas-form-group">
                  <div className="visitas-checkbox-inline">
                    <input
                      type="checkbox"
                      checked={form.activo}
                      onChange={(e) => setForm((p) => ({ ...p, activo: e.target.checked }))}
                    />
                    <span>Activo</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="visitas-modal-footer">
              <button className="visitas-btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</button>
              <button className="visitas-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 size={16} className="spinning" /> Guardando...</> : <><Check size={16} /> Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Motivos */}
      {showMotivosModal && motivosAtendedor && (
        <div className="visitas-modal-overlay" onClick={() => setShowMotivosModal(false)}>
          <div className="visitas-modal-content visitas-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="visitas-modal-header">
              <h2>Motivos → {motivosAtendedor.nombre}</h2>
              <button className="visitas-modal-close" onClick={() => setShowMotivosModal(false)}><X size={20} /></button>
            </div>
            <div className="visitas-modal-body">
              <p className="visitas-motivos-hint">
                Seleccioná los motivos que atiende este anfitrión. Cuando se cree una cita con ese motivo, se asignará automáticamente.
              </p>
              {allCategorias.map((cat) => {
                const motivosCat = allMotivos.filter((m) => m.categoria_id === cat.id);
                if (motivosCat.length === 0) return null;
                return (
                  <div key={cat.id} className="visitas-motivo-categoria">
                    <div className="visitas-motivo-cat-header">{cat.nombre}</div>
                    <div className="visitas-motivo-list">
                      {motivosCat.map((m) => (
                        <label key={m.id} className="visitas-motivo-item">
                          <input
                            type="checkbox"
                            checked={selectedMotivos.has(m.id)}
                            onChange={() => toggleMotivo(m.id)}
                          />
                          <span>{m.nombre}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {selectedMotivos.size > 0 && (
                <div className="visitas-motivos-selected">
                  <Tag size={14} />
                  {selectedMotivos.size} motivo(s) seleccionado(s)
                </div>
              )}
            </div>
            <div className="visitas-modal-footer">
              <button className="visitas-btn-secondary" onClick={() => setShowMotivosModal(false)} disabled={savingMotivos}>Cancelar</button>
              <button className="visitas-btn-primary" onClick={handleSaveMotivos} disabled={savingMotivos}>
                {savingMotivos ? <><Loader2 size={16} className="spinning" /> Guardando...</> : <><Check size={16} /> Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Horarios */}
      {showHorariosModal && horariosAtendedor && (
        <div className="visitas-modal-overlay" onClick={() => setShowHorariosModal(false)}>
          <div className="visitas-modal-content visitas-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="visitas-modal-header">
              <h2>Horarios - {horariosAtendedor.nombre}</h2>
              <button className="visitas-modal-close" onClick={() => setShowHorariosModal(false)}><X size={20} /></button>
            </div>
            <div className="visitas-modal-body">
              <div className="visitas-horarios-grid">
                {horarios.map((h, idx) => (
                  <div key={h.dia_semana} className={`visitas-horario-row ${h.activo ? 'active' : ''}`}>
                    <div className="visitas-horario-dia">
                      <input
                        type="checkbox"
                        checked={h.activo}
                        onChange={(e) => updateHorario(idx, 'activo', e.target.checked)}
                      />
                      <span>{DIAS_SEMANA[h.dia_semana - 1]}</span>
                    </div>
                    <div className="visitas-horario-times">
                      <input
                        type="time"
                        value={h.hora_inicio}
                        onChange={(e) => updateHorario(idx, 'hora_inicio', e.target.value)}
                        disabled={!h.activo}
                      />
                      <span className="visitas-horario-sep">a</span>
                      <input
                        type="time"
                        value={h.hora_fin}
                        onChange={(e) => updateHorario(idx, 'hora_fin', e.target.value)}
                        disabled={!h.activo}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="visitas-modal-footer">
              <button className="visitas-btn-secondary" onClick={() => setShowHorariosModal(false)} disabled={savingHorarios}>Cancelar</button>
              <button className="visitas-btn-primary" onClick={handleSaveHorarios} disabled={savingHorarios}>
                {savingHorarios ? <><Loader2 size={16} className="spinning" /> Guardando...</> : <><Check size={16} /> Guardar Horarios</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
