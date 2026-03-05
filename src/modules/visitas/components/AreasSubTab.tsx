// ============================================================
// Sub-tab ABM: Áreas de atención
// CRUD con DataTable + modal inline, filtrado por sede
// ============================================================

import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, Check, Loader2, Building2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { showSuccess } from '../../../utils/toast';
import { useSede } from '../../../contexts/SedeContext';
import { DataTable } from '../../../components/ui/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import type { VisitaArea } from '../../../types/visitas.types';
import {
  fetchAllAreas,
  createArea,
  updateArea,
  deleteArea,
} from '../../../services/visitasService';

interface AreaFormData {
  nombre: string;
  orden: number;
  activo: boolean;
}

const INITIAL_FORM: AreaFormData = {
  nombre: '',
  orden: 0,
  activo: true,
};

export function AreasSubTab() {
  const { sedeActualId } = useSede();
  const [data, setData] = useState<VisitaArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selected, setSelected] = useState<VisitaArea | null>(null);
  const [form, setForm] = useState<AreaFormData>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { cargar(); }, [sedeActualId]);

  async function cargar() {
    setLoading(true);
    try {
      setData(await fetchAllAreas(sedeActualId));
    } catch {
      Swal.fire('Error', 'No se pudieron cargar las áreas', 'error');
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

  function handleEdit(item: VisitaArea) {
    setForm({
      nombre: item.nombre,
      orden: item.orden,
      activo: item.activo,
    });
    setSelected(item);
    setModalMode('edit');
    setShowModal(true);
  }

  async function handleDelete(item: VisitaArea) {
    const res = await Swal.fire({
      title: 'Eliminar área',
      text: `¿Eliminar "${item.nombre}"? Si tiene atendedores asociados, la eliminación fallará.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!res.isConfirmed) return;
    try {
      await deleteArea(item.id);
      showSuccess('Área eliminada');
      cargar();
    } catch {
      Swal.fire('Error', 'No se pudo eliminar. Verifique que no tenga atendedores asociados.', 'error');
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
        await createArea({
          nombre: form.nombre.trim(),
          sede_id: sedeActualId,
          orden: form.orden,
          activo: form.activo,
        });
        showSuccess('Área creada');
      } else if (selected) {
        await updateArea(selected.id, {
          nombre: form.nombre.trim(),
          orden: form.orden,
          activo: form.activo,
        });
        showSuccess('Área actualizada');
      }
      setShowModal(false);
      cargar();
    } catch {
      Swal.fire('Error', 'No se pudo guardar el área', 'error');
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnDef<VisitaArea>[]>(() => [
    {
      accessorKey: 'nombre',
      header: 'Nombre',
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
        searchPlaceholder="Buscar áreas..."
        emptyIcon={<Building2 size={48} />}
        emptyTitle="No hay áreas"
        emptyDescription="Agregue una nueva área de atención"
        disableAutoFilters
        headerAction={
          <button className="visitas-btn-primary" onClick={handleCreate}>
            <Plus size={16} /> Nueva Área
          </button>
        }
      />

      {showModal && (
        <div className="visitas-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="visitas-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="visitas-modal-header">
              <h2>{modalMode === 'create' ? 'Nueva Área' : 'Editar Área'}</h2>
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
                    placeholder="Ej: Administración"
                  />
                </div>
                <div className="visitas-form-row">
                  <div className="visitas-form-group">
                    <label>Orden</label>
                    <input
                      type="number"
                      min={0}
                      value={form.orden}
                      onChange={(e) => setForm((p) => ({ ...p, orden: Number(e.target.value) }))}
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
