// ============================================================
// Sub-tab ABM: Atendedores (personas que atienden visitas)
// CRUD con DataTable + modal inline, filtrado por sede
// ============================================================

import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, Check, Loader2, Users, Clock } from 'lucide-react';
import Swal from 'sweetalert2';
import { showSuccess } from '../../../utils/toast';
import { useSede } from '../../../contexts/SedeContext';
import { DataTable } from '../../../components/ui/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import type { VisitaArea, VisitaAtendedorConArea, VisitaHorario } from '../../../types/visitas.types';
import {
  fetchAllAtendedores,
  fetchAllAreas,
  createAtendedor,
  updateAtendedor,
  deleteAtendedor,
  fetchHorariosByAtendedor,
  upsertHorarios,
} from '../../../services/visitasService';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

interface AtendedorFormData {
  nombre: string;
  area_id: string;
  user_id: string;
  activo: boolean;
}

const INITIAL_FORM: AtendedorFormData = {
  nombre: '',
  area_id: '',
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
  const [data, setData] = useState<VisitaAtendedorConArea[]>([]);
  const [areas, setAreas] = useState<VisitaArea[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal CRUD
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selected, setSelected] = useState<VisitaAtendedorConArea | null>(null);
  const [form, setForm] = useState<AtendedorFormData>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  // Modal Horarios
  const [showHorariosModal, setShowHorariosModal] = useState(false);
  const [horariosAtendedor, setHorariosAtendedor] = useState<VisitaAtendedorConArea | null>(null);
  const [horarios, setHorarios] = useState<HorarioRow[]>([]);
  const [savingHorarios, setSavingHorarios] = useState(false);

  useEffect(() => { cargar(); }, [sedeActualId]);

  async function cargar() {
    setLoading(true);
    try {
      const [atends, areasData] = await Promise.all([
        fetchAllAtendedores(sedeActualId),
        fetchAllAreas(sedeActualId),
      ]);
      setData(atends);
      setAreas(areasData);
    } catch {
      Swal.fire('Error', 'No se pudieron cargar los atendedores', 'error');
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

  function handleEdit(item: VisitaAtendedorConArea) {
    setForm({
      nombre: item.nombre,
      area_id: item.area_id,
      user_id: item.user_id ?? '',
      activo: item.activo,
    });
    setSelected(item);
    setModalMode('edit');
    setShowModal(true);
  }

  async function handleDelete(item: VisitaAtendedorConArea) {
    const res = await Swal.fire({
      title: 'Eliminar atendedor',
      text: `¿Eliminar "${item.nombre}"? Si tiene citas o horarios asociados, la eliminación fallará.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!res.isConfirmed) return;
    try {
      await deleteAtendedor(item.id);
      showSuccess('Atendedor eliminado');
      cargar();
    } catch {
      Swal.fire('Error', 'No se pudo eliminar. Verifique que no tenga citas asociadas.', 'error');
    }
  }

  async function handleSave() {
    if (!form.nombre.trim()) {
      Swal.fire('Error', 'El nombre es requerido', 'error');
      return;
    }
    if (!form.area_id) {
      Swal.fire('Error', 'Seleccione un área', 'error');
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
          area_id: form.area_id,
          user_id: form.user_id || null,
          sede_id: sedeActualId,
          activo: form.activo,
        });
        showSuccess('Atendedor creado');
      } else if (selected) {
        await updateAtendedor(selected.id, {
          nombre: form.nombre.trim(),
          area_id: form.area_id,
          user_id: form.user_id || null,
          activo: form.activo,
        });
        showSuccess('Atendedor actualizado');
      }
      setShowModal(false);
      cargar();
    } catch {
      Swal.fire('Error', 'No se pudo guardar el atendedor', 'error');
    } finally {
      setSaving(false);
    }
  }

  // --- Horarios ---
  async function handleOpenHorarios(item: VisitaAtendedorConArea) {
    setHorariosAtendedor(item);
    try {
      const existing = await fetchHorariosByAtendedor(item.id);
      if (existing.length > 0) {
        // Mapear existentes a HorarioRow
        const rows: HorarioRow[] = Array.from({ length: 7 }, (_, i) => {
          const dia = i + 1;
          const found = existing.find((h: VisitaHorario) => h.dia_semana === dia);
          return found
            ? { dia_semana: dia, hora_inicio: found.hora_inicio, hora_fin: found.hora_fin, activo: found.activo }
            : { dia_semana: dia, hora_inicio: '09:00', hora_fin: '18:00', activo: false };
        });
        setHorarios(rows);
      } else {
        // Default: lunes a viernes 9-18
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

  const columns = useMemo<ColumnDef<VisitaAtendedorConArea>[]>(() => [
    {
      accessorKey: 'nombre',
      header: 'Nombre',
    },
    {
      accessorKey: 'area_nombre',
      header: 'Área',
      cell: ({ getValue }) => (
        <span className="dt-badge dt-badge-blue">{getValue() as string}</span>
      ),
    },
    {
      accessorKey: 'activo',
      header: 'Estado',
      cell: ({ getValue }) => (
        <span className={`dt-badge ${getValue() ? 'dt-badge-solid-green' : 'dt-badge-solid-gray'}`}>
          {getValue() ? 'Activo' : 'Inactivo'}
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
          <button className="dt-btn-action dt-btn-edit" onClick={() => handleEdit(row.original)} title="Editar">
            <Edit2 size={14} />
          </button>
          <button className="dt-btn-action dt-btn-delete" onClick={() => handleDelete(row.original)} title="Eliminar">
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
        searchPlaceholder="Buscar atendedores..."
        emptyIcon={<Users size={48} />}
        emptyTitle="No hay atendedores"
        emptyDescription="Agregue un nuevo atendedor. Primero debe crear al menos un área."
        disableAutoFilters
        headerAction={
          <button className="visitas-btn-primary" onClick={handleCreate} disabled={areas.length === 0}>
            <Plus size={16} /> Nuevo Atendedor
          </button>
        }
      />

      {/* Modal CRUD Atendedor */}
      {showModal && (
        <div className="visitas-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="visitas-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="visitas-modal-header">
              <h2>{modalMode === 'create' ? 'Nuevo Atendedor' : 'Editar Atendedor'}</h2>
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
                  <label>Área <span className="required">*</span></label>
                  <select
                    value={form.area_id}
                    onChange={(e) => setForm((p) => ({ ...p, area_id: e.target.value }))}
                  >
                    <option value="">Seleccionar...</option>
                    {areas.filter((a) => a.activo).map((a) => (
                      <option key={a.id} value={a.id}>{a.nombre}</option>
                    ))}
                  </select>
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
