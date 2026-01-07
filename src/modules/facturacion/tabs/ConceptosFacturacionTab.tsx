import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import Swal from 'sweetalert2'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import type { ConceptoFacturacion } from '../../../types/facturacion.types'
import { formatCurrency, TIPOS_CONCEPTO } from '../../../types/facturacion.types'

export function ConceptosFacturacionTab() {
  const [conceptos, setConceptos] = useState<ConceptoFacturacion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cargarConceptos()
  }, [])

  async function cargarConceptos() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('conceptos_nomina')
        .select('*')
        .order('orden', { ascending: true })

      if (error) throw error
      setConceptos(data || [])
    } catch (error) {
      console.error('Error cargando conceptos:', error)
    } finally {
      setLoading(false)
    }
  }

  async function crearConcepto() {
    const tiposOptions = TIPOS_CONCEPTO.map(t =>
      `<option value="${t.value}">${t.label}</option>`
    ).join('')

    const { value: formValues } = await Swal.fire({
      title: 'Nuevo Concepto',
      html: `
        <div style="text-align: left;">
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #64748b;">Código</label>
            <input id="swal-codigo" type="text" class="swal2-input" placeholder="Ej: P013" style="margin: 0; width: 100%;">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #64748b;">Descripción</label>
            <input id="swal-desc" type="text" class="swal2-input" placeholder="Descripción del concepto" style="margin: 0; width: 100%;">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #64748b;">Tipo</label>
            <select id="swal-tipo" class="swal2-select" style="margin: 0; width: 100%;">
              ${tiposOptions}
            </select>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #64748b;">Precio Base</label>
              <input id="swal-precio" type="number" class="swal2-input" placeholder="0" style="margin: 0; width: 100%;" step="0.01">
            </div>
            <div>
              <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #64748b;">IVA (%)</label>
              <input id="swal-iva" type="number" class="swal2-input" value="0" style="margin: 0; width: 100%;" step="0.01">
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
              <input id="swal-variable" type="checkbox"> Es monto variable
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
              <input id="swal-turno" type="checkbox" checked> Aplica a TURNO
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
              <input id="swal-cargo" type="checkbox" checked> Aplica a CARGO
            </label>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
      width: 420,
      preConfirm: () => {
        const codigo = (document.getElementById('swal-codigo') as HTMLInputElement).value
        const descripcion = (document.getElementById('swal-desc') as HTMLInputElement).value
        const tipo = (document.getElementById('swal-tipo') as HTMLSelectElement).value
        const precioBase = parseFloat((document.getElementById('swal-precio') as HTMLInputElement).value) || 0
        const ivaPorcentaje = parseFloat((document.getElementById('swal-iva') as HTMLInputElement).value) || 0
        const esVariable = (document.getElementById('swal-variable') as HTMLInputElement).checked
        const aplicaTurno = (document.getElementById('swal-turno') as HTMLInputElement).checked
        const aplicaCargo = (document.getElementById('swal-cargo') as HTMLInputElement).checked

        if (!codigo || !descripcion) {
          Swal.showValidationMessage('Código y descripción son requeridos')
          return false
        }

        return {
          codigo: codigo.toUpperCase(),
          descripcion,
          tipo,
          precio_base: precioBase,
          iva_porcentaje: ivaPorcentaje,
          precio_final: precioBase * (1 + ivaPorcentaje / 100),
          es_variable: esVariable,
          aplica_turno: aplicaTurno,
          aplica_cargo: aplicaCargo,
          activo: true,
          orden: conceptos.length + 1
        }
      }
    })

    if (!formValues) return

    try {
      const { error } = await supabase.from('conceptos_nomina').insert(formValues)
      if (error) throw error
      Swal.fire({ icon: 'success', title: 'Concepto creado', timer: 1500, showConfirmButton: false })
      cargarConceptos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo crear el concepto', 'error')
    }
  }

  async function editarConcepto(concepto: ConceptoFacturacion) {
    const tiposOptions = TIPOS_CONCEPTO.map(t =>
      `<option value="${t.value}" ${concepto.tipo === t.value ? 'selected' : ''}>${t.label}</option>`
    ).join('')

    const { value: formValues } = await Swal.fire({
      title: 'Editar Concepto',
      html: `
        <div style="text-align: left;">
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #64748b;">Código</label>
            <input id="swal-codigo" type="text" class="swal2-input" value="${concepto.codigo}" style="margin: 0; width: 100%;" disabled>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #64748b;">Descripción</label>
            <input id="swal-desc" type="text" class="swal2-input" value="${concepto.descripcion}" style="margin: 0; width: 100%;">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #64748b;">Tipo</label>
            <select id="swal-tipo" class="swal2-select" style="margin: 0; width: 100%;">
              ${tiposOptions}
            </select>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #64748b;">Precio Base</label>
              <input id="swal-precio" type="number" class="swal2-input" value="${concepto.precio_base || 0}" style="margin: 0; width: 100%;" step="0.01">
            </div>
            <div>
              <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #64748b;">IVA (%)</label>
              <input id="swal-iva" type="number" class="swal2-input" value="${concepto.iva_porcentaje || 0}" style="margin: 0; width: 100%;" step="0.01">
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
              <input id="swal-variable" type="checkbox" ${concepto.es_variable ? 'checked' : ''}> Es monto variable
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
              <input id="swal-turno" type="checkbox" ${concepto.aplica_turno ? 'checked' : ''}> Aplica a TURNO
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
              <input id="swal-cargo" type="checkbox" ${concepto.aplica_cargo ? 'checked' : ''}> Aplica a CARGO
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
              <input id="swal-activo" type="checkbox" ${concepto.activo ? 'checked' : ''}> Activo
            </label>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      width: 420,
      preConfirm: () => {
        const descripcion = (document.getElementById('swal-desc') as HTMLInputElement).value
        const tipo = (document.getElementById('swal-tipo') as HTMLSelectElement).value
        const precioBase = parseFloat((document.getElementById('swal-precio') as HTMLInputElement).value) || 0
        const ivaPorcentaje = parseFloat((document.getElementById('swal-iva') as HTMLInputElement).value) || 0
        const esVariable = (document.getElementById('swal-variable') as HTMLInputElement).checked
        const aplicaTurno = (document.getElementById('swal-turno') as HTMLInputElement).checked
        const aplicaCargo = (document.getElementById('swal-cargo') as HTMLInputElement).checked
        const activo = (document.getElementById('swal-activo') as HTMLInputElement).checked

        if (!descripcion) {
          Swal.showValidationMessage('La descripción es requerida')
          return false
        }

        return {
          descripcion,
          tipo,
          precio_base: precioBase,
          iva_porcentaje: ivaPorcentaje,
          precio_final: precioBase * (1 + ivaPorcentaje / 100),
          es_variable: esVariable,
          aplica_turno: aplicaTurno,
          aplica_cargo: aplicaCargo,
          activo
        }
      }
    })

    if (!formValues) return

    try {
      const { error } = await (supabase.from('conceptos_nomina') as any).update(formValues).eq('id', concepto.id)
      if (error) throw error
      Swal.fire({ icon: 'success', title: 'Concepto actualizado', timer: 1500, showConfirmButton: false })
      cargarConceptos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo actualizar', 'error')
    }
  }

  async function eliminarConcepto(concepto: ConceptoFacturacion) {
    const result = await Swal.fire({
      title: '¿Eliminar concepto?',
      text: `Se eliminará "${concepto.descripcion}"`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626'
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await supabase.from('conceptos_nomina').delete().eq('id', concepto.id)
      if (error) throw error
      Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1500, showConfirmButton: false })
      cargarConceptos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo eliminar', 'error')
    }
  }

  const getTipoStyle = (tipo: string) => {
    const styles: Record<string, { bg: string; color: string }> = {
      'alquiler': { bg: '#3B82F6', color: 'white' },
      'cargo': { bg: '#EF4444', color: 'white' },
      'descuento': { bg: '#10B981', color: 'white' },
      'penalidad': { bg: '#F59E0B', color: 'white' },
      'ingreso': { bg: '#8B5CF6', color: 'white' }
    }
    return styles[tipo] || { bg: '#6B7280', color: 'white' }
  }

  const columns = useMemo<ColumnDef<ConceptoFacturacion>[]>(() => [
    {
      accessorKey: 'codigo',
      header: 'Código',
      cell: ({ row }) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{row.original.codigo}</span>
      )
    },
    {
      accessorKey: 'descripcion',
      header: 'Descripción'
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      cell: ({ row }) => {
        const tipo = row.original.tipo
        const style = getTipoStyle(tipo)
        const label = TIPOS_CONCEPTO.find(t => t.value === tipo)?.label || tipo
        return (
          <span style={{
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 500,
            backgroundColor: style.bg,
            color: style.color
          }}>
            {label}
          </span>
        )
      }
    },
    {
      accessorKey: 'precio_final',
      header: 'Precio Final',
      cell: ({ row }) => row.original.es_variable
        ? <span style={{ color: '#6B7280', fontStyle: 'italic' }}>Variable</span>
        : <span style={{ fontFamily: 'monospace' }}>{formatCurrency(row.original.precio_final || 0)}</span>
    },
    {
      accessorKey: 'modalidad',
      header: 'Modalidad',
      cell: ({ row }) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          {row.original.aplica_turno && (
            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px', background: '#DBEAFE', color: '#1D4ED8' }}>
              TURNO
            </span>
          )}
          {row.original.aplica_cargo && (
            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px', background: '#F3E8FF', color: '#7C3AED' }}>
              CARGO
            </span>
          )}
        </div>
      )
    },
    {
      accessorKey: 'activo',
      header: 'Estado',
      cell: ({ row }) => (
        <span style={{
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 500,
          backgroundColor: row.original.activo ? '#DCFCE7' : '#FEE2E2',
          color: row.original.activo ? '#166534' : '#991B1B'
        }}>
          {row.original.activo ? 'Activo' : 'Inactivo'}
        </span>
      )
    },
    {
      id: 'acciones',
      header: '',
      cell: ({ row }) => (
        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => editarConcepto(row.original)}
            style={{
              padding: '6px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              background: '#EFF6FF',
              color: '#3B82F6'
            }}
            title="Editar"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={() => eliminarConcepto(row.original)}
            style={{
              padding: '6px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              background: '#FEF2F2',
              color: '#EF4444'
            }}
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )
    }
  ], [])

  return (
    <DataTable
      data={conceptos}
      columns={columns}
      loading={loading}
      searchPlaceholder="Buscar concepto..."
      emptyTitle="Sin conceptos"
      emptyDescription="No hay conceptos registrados"
      pageSize={20}
      pageSizeOptions={[10, 20, 50]}
      headerAction={
        <button
          onClick={crearConcepto}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            background: '#DC2626',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          <Plus size={16} />
          Nuevo Concepto
        </button>
      }
    />
  )
}
