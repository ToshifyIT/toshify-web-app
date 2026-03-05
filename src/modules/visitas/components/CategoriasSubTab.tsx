// ============================================================
// Sub-tab ABM: Categorías de visita
// CRUD con DataTable + modal inline
// ============================================================

import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, Check, Loader2, Tag } from 'lucide-react';
import Swal from 'sweetalert2';
import { showSuccess } from '../../../utils/toast';
import { DataTable } from '../../../components/ui/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import type { VisitaCategoria } from '../../../types/visitas.types';
import {
  fetchAllCategorias,
  createCategoria,
  updateCategoria,
  deleteCategoria,
} from '../../../services/visitasService';

interface CategoriaFormData {
  nombre: string;
  color: string;
  duracion_default: number;
  requiere_patente: boolean;
  orden: number;
  activo: boolean;
}

const INITIAL_FORM: CategoriaFormData = {
  nombre: '',
  color: '#3b82f6',
  duracion_default: 30,
  requiere_patente: false,
  orden: 0,
  activo: true,
};

export function CategoriasSubTab() {
  const [data, setData] = useState<VisitaCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selected, setSelected] = useState<VisitaCategoria | null>(null);
  const [form, setForm] = useState<CategoriaFormData>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setLoading(true);
    try {
      setData(await fetchAllCategorias());
    } catch {
      Swal.fire('Error', 'No se pudieron cargar las categorías', 'error');
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

  function handleEdit(item: VisitaCategoria) {
    setForm({
      nombre: item.nombre,
      color: item.color,
      duracion_default: item.duracion_default,
      requiere_patente: item.requiere_patente,
      orden: item.orden,
      activo: item.activo,
    });
    setSelected(item);
    setModalMode('edit');
    setShowModal(true);
  }

  async function handleDelete(item: VisitaCategoria) {
    const res = await Swal.fire({
      title: 'Eliminar categoría',
      text: `¿Eliminar "${item.nombre}"? Si tiene motivos o citas asociadas, la eliminación fallará.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!res.isConfirmed) return;
    try {
      await deleteCategoria(item.id);
      showSuccess('Categoría eliminada');
      cargar();
    } catch {
      Swal.fire('Error', 'No se pudo eliminar. Verifique que no tenga motivos o citas asociadas.', 'error');
    }
  }

  async function handleSave() {
    if (!form.nombre.trim()) {
      Swal.fire('Error', 'El nombre es requerido', 'error');
      return;
    }
    setSaving(true);
    try {
      if (modalMode === 'create') {
        await createCategoria({
          nombre: form.nombre.trim(),
          color: form.color,
          duracion_default: form.duracion_default,
          requiere_patente: form.requiere_patente,
          orden: form.orden,
          activo: form.activo,
        });
        showSuccess('Categoría creada');
      } else if (selected) {
        await updateCategoria(selected.id, {
          nombre: form.nombre.trim(),
          color: form.color,
          duracion_default: form.duracion_default,
          requiere_patente: form.requiere_patente,
          orden: form.orden,
          activo: form.activo,
        });
        showSuccess('Categoría actualizada');
      }
      setShowModal(false);
      cargar();
    } catch {
      Swal.fire('Error', 'No se pudo guardar la categoría', 'error');
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnDef<VisitaCategoria>[]>(() => [
    {
      accessorKey: 'nombre',
      header: 'Nombre',
      cell: ({ row }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 14, height: 14, borderRadius: '50%',
              backgroundColor: row.original.color, flexShrink: 0,
            }}
          />
          {row.original.nombre}
        </div>
      ),
    },
    {
      accessorKey: 'duracion_default',
      header: 'Duración (min)',
      cell: ({ getValue }) => `${getValue()} min`,
    },
    {
      accessorKey: 'requiere_patente',
      header: 'Req. Patente',
      cell: ({ getValue }) => getValue() ? 'Sí' : 'No',
    },
    {
      accessorKey: 'orden',
      header: 'Orden',
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
        searchPlaceholder="Buscar categorías..."
        emptyIcon={<Tag size={48} />}
        emptyTitle="No hay categorías"
        emptyDescription="Agregue una nueva categoría de visita"
        disableAutoFilters
        headerAction={
          <button className="visitas-btn-primary" onClick={handleCreate}>
            <Plus size={16} /> Nueva Categoría
          </button>
        }
      />

      {showModal && (
        <div className="visitas-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="visitas-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="visitas-modal-header">
              <h2>{modalMode === 'create' ? 'Nueva Categoría' : 'Editar Categoría'}</h2>
              <button className="visitas-modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="visitas-modal-body">
              <div className="visitas-form-section">
                <div className="visitas-form-row">
                  <div className="visitas-form-group" style={{ flex: 1 }}>
                    <label>Nombre <span className="required">*</span></label>
                    <input
                      type="text"
                      value={form.nombre}
                      onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                      placeholder="Ej: Conductor"
                    />
                  </div>
                  <div className="visitas-form-group" style={{ width: 80 }}>
                    <label>Color</label>
                    <input
                      type="color"
                      value={form.color}
                      onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                      style={{ height: 40, padding: 2, cursor: 'pointer' }}
                    />
                  </div>
                </div>
                <div className="visitas-form-row">
                  <div className="visitas-form-group">
                    <label>Duración default (min)</label>
                    <select
                      value={form.duracion_default}
                      onChange={(e) => setForm((p) => ({ ...p, duracion_default: Number(e.target.value) }))}
                    >
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>60 min</option>
                      <option value={90}>90 min</option>
                      <option value={120}>120 min</option>
                    </select>
                  </div>
                  <div className="visitas-form-group">
                    <label>Orden</label>
                    <input
                      type="number"
                      min={0}
                      value={form.orden}
                      onChange={(e) => setForm((p) => ({ ...p, orden: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="visitas-form-row">
                  <div className="visitas-form-group">
                    <div className="visitas-checkbox-inline">
                      <input
                        type="checkbox"
                        checked={form.requiere_patente}
                        onChange={(e) => setForm((p) => ({ ...p, requiere_patente: e.target.checked }))}
                      />
                      <span>Requiere patente</span>
                    </div>
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
    </>
  );
}
