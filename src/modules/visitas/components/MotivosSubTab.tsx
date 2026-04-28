// ============================================================
// Sub-tab ABM: Motivos de visita
// CRUD con DataTable + modal inline
// ============================================================

import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, Check, Loader2, FileText } from 'lucide-react';
import Swal from 'sweetalert2';
import { showSuccess } from '../../../utils/toast';
import { DataTable } from '../../../components/ui/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import type { VisitaCategoria, VisitaMotivoConCategoria } from '../../../types/visitas.types';
import {
  fetchAllMotivos,
  fetchAllCategorias,
  createMotivo,
  updateMotivo,
  deleteMotivo,
} from '../../../services/visitasService';

interface MotivoFormData {
  categoria_id: string;
  nombre: string;
  activo: boolean;
}

const INITIAL_FORM: MotivoFormData = {
  categoria_id: '',
  nombre: '',
  activo: true,
};

export function MotivosSubTab() {
  const [data, setData] = useState<VisitaMotivoConCategoria[]>([]);
  const [categorias, setCategorias] = useState<VisitaCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selected, setSelected] = useState<VisitaMotivoConCategoria | null>(null);
  const [form, setForm] = useState<MotivoFormData>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setLoading(true);
    try {
      const [mots, cats] = await Promise.all([fetchAllMotivos(), fetchAllCategorias()]);
      setData(mots);
      setCategorias(cats);
    } catch {
      Swal.fire('Error', 'No se pudieron cargar los motivos', 'error');
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

  function handleEdit(item: VisitaMotivoConCategoria) {
    setForm({
      categoria_id: item.categoria_id,
      nombre: item.nombre,
      activo: item.activo,
    });
    setSelected(item);
    setModalMode('edit');
    setShowModal(true);
  }

  async function handleDelete(item: VisitaMotivoConCategoria) {
    const res = await Swal.fire({
      title: 'Eliminar motivo',
      text: `¿Eliminar "${item.nombre}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!res.isConfirmed) return;
    try {
      await deleteMotivo(item.id);
      showSuccess('Motivo eliminado');
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
    if (!form.categoria_id) {
      Swal.fire('Error', 'Seleccione una categoría', 'error');
      return;
    }
    setSaving(true);
    try {
      if (modalMode === 'create') {
        await createMotivo({
          categoria_id: form.categoria_id,
          nombre: form.nombre.trim(),
          activo: form.activo,
        });
        showSuccess('Motivo creado');
      } else if (selected) {
        await updateMotivo(selected.id, {
          categoria_id: form.categoria_id,
          nombre: form.nombre.trim(),
          activo: form.activo,
        });
        showSuccess('Motivo actualizado');
      }
      setShowModal(false);
      cargar();
    } catch {
      Swal.fire('Error', 'No se pudo guardar el motivo', 'error');
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnDef<VisitaMotivoConCategoria>[]>(() => [
    {
      accessorKey: 'nombre',
      header: 'Nombre',
    },
    {
      accessorKey: 'categoria_nombre',
      header: 'Categoría',
      cell: ({ getValue }) => (
        <span className="dt-badge dt-badge-blue">{getValue() as string}</span>
      ),
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
        searchPlaceholder="Buscar motivos..."
        emptyIcon={<FileText size={48}
      />}
        emptyTitle="No hay motivos"
        emptyDescription="Agregue un nuevo motivo de visita"
        headerAction={
          <button className="visitas-btn-primary" onClick={handleCreate}>
            <Plus size={16} /> Nuevo Motivo
          </button>
        }
      />

      {showModal && (
        <div className="visitas-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="visitas-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="visitas-modal-header">
              <h2>{modalMode === 'create' ? 'Nuevo Motivo' : 'Editar Motivo'}</h2>
              <button className="visitas-modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="visitas-modal-body">
              <div className="visitas-form-section">
                <div className="visitas-form-group">
                  <label>Categoría <span className="required">*</span></label>
                  <select
                    value={form.categoria_id}
                    onChange={(e) => setForm((p) => ({ ...p, categoria_id: e.target.value }))}
                  >
                    <option value="">Seleccionar...</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="visitas-form-group">
                  <label>Nombre <span className="required">*</span></label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                    placeholder="Ej: Entrega de documentación"
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
    </>
  );
}
