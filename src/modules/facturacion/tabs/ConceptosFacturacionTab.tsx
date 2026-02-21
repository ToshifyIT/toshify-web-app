import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'
import { Plus, Edit2, Trash2, Filter } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import type { ConceptoFacturacion } from '../../../types/facturacion.types'
import { formatCurrency, TIPOS_CONCEPTO } from '../../../types/facturacion.types'

export function ConceptosFacturacionTab() {
  const [conceptos, setConceptos] = useState<ConceptoFacturacion[]>([])
  const [loading, setLoading] = useState(true)

  // Estados para filtros Excel
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [tipoFilter, setTipoFilter] = useState<string[]>([])
  const [activoFilter, setActivoFilter] = useState<string[]>([])

  useEffect(() => {
    cargarConceptos()
  }, [])

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    if (!openColumnFilter) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.dt-column-filter-dropdown') && !target.closest('.dt-column-filter-btn')) {
        setOpenColumnFilter(null)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [openColumnFilter])

  // Toggle functions
  const toggleTipoFilter = (val: string) => setTipoFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )
  const toggleActivoFilter = (val: string) => setActivoFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )

  // Datos filtrados
  const conceptosFiltrados = useMemo(() => {
    return conceptos.filter(c => {
      if (tipoFilter.length > 0 && !tipoFilter.includes(c.tipo)) return false
      if (activoFilter.length > 0) {
        const estado = c.activo ? 'activo' : 'inactivo'
        if (!activoFilter.includes(estado)) return false
      }
      return true
    })
  }, [conceptos, tipoFilter, activoFilter])

  async function cargarConceptos(silent = false) {
    if (!silent) setLoading(true)
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
        <div class="fact-modal-form">
          <div class="fact-form-group">
            <label class="fact-form-label">Código</label>
            <input id="swal-codigo" type="text" class="fact-form-input" placeholder="Ej: P013">
          </div>
          <div class="fact-form-group">
            <label class="fact-form-label">Descripción</label>
            <input id="swal-desc" type="text" class="fact-form-input" placeholder="Descripción del concepto">
          </div>
          <div class="fact-form-group">
            <label class="fact-form-label">Tipo</label>
            <select id="swal-tipo" class="fact-form-select">
              ${tiposOptions}
            </select>
          </div>
          <div class="fact-form-row">
            <div class="fact-form-group">
              <label class="fact-form-label">Precio Base</label>
              <input id="swal-precio" type="number" class="fact-form-input" placeholder="0" step="0.01">
            </div>
            <div class="fact-form-group">
              <label class="fact-form-label">IVA (%)</label>
              <input id="swal-iva" type="number" class="fact-form-input" value="0" step="0.01">
            </div>
          </div>
          <div class="fact-form-checkboxes">
            <label class="fact-checkbox-label">
              <input id="swal-variable" type="checkbox" class="fact-checkbox"> Es monto variable
            </label>
            <label class="fact-checkbox-label">
              <input id="swal-turno" type="checkbox" class="fact-checkbox" checked> Aplica a TURNO
            </label>
            <label class="fact-checkbox-label">
              <input id="swal-cargo" type="checkbox" class="fact-checkbox" checked> Aplica a CARGO
            </label>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      width: 400,
      customClass: {
        popup: 'fact-modal',
        title: 'fact-modal-title',
        htmlContainer: 'fact-modal-content',
        confirmButton: 'fact-btn-confirm',
        cancelButton: 'fact-btn-cancel'
      },
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
          precio_final: ivaPorcentaje === 0 ? precioBase : Number((precioBase * (1 + ivaPorcentaje / 100)).toFixed(2)),
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
      showSuccess('Concepto creado')
      cargarConceptos(true)
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo crear el concepto', 'error')
    }
  }

  async function editarConcepto(concepto: ConceptoFacturacion) {
    const tiposOptions = TIPOS_CONCEPTO.map(t =>
      `<option value="${t.value}" ${concepto.tipo === t.value ? 'selected' : ''}>${t.label}</option>`
    ).join('')

    // Fecha por defecto para vigencia: hoy
    const hoyStr = new Date().toISOString().split('T')[0]

    const { value: formValues } = await Swal.fire({
      title: 'Editar Concepto',
      html: `
        <div class="fact-modal-form">
          <div class="fact-form-group">
            <label class="fact-form-label">Código</label>
            <input id="swal-codigo" type="text" class="fact-form-input fact-input-disabled" value="${concepto.codigo}" disabled>
          </div>
          <div class="fact-form-group">
            <label class="fact-form-label">Descripción</label>
            <input id="swal-desc" type="text" class="fact-form-input" value="${concepto.descripcion}">
          </div>
          <div class="fact-form-group">
            <label class="fact-form-label">Tipo</label>
            <select id="swal-tipo" class="fact-form-select">
              ${tiposOptions}
            </select>
          </div>
          <div class="fact-form-row">
            <div class="fact-form-group">
              <label class="fact-form-label">Precio Base</label>
              <input id="swal-precio" type="number" class="fact-form-input" value="${concepto.precio_base || 0}" step="0.01">
            </div>
            <div class="fact-form-group">
              <label class="fact-form-label">IVA (%)</label>
              <input id="swal-iva" type="number" class="fact-form-input" value="${concepto.iva_porcentaje || 0}" step="0.01">
            </div>
          </div>
          <div class="fact-form-group" id="swal-vigencia-group" style="display:none; margin-top: 8px; padding: 10px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-primary);">
            <label class="fact-form-label" style="color: var(--color-primary); font-weight: 600;">Nuevo precio aplica desde:</label>
            <input id="swal-vigencia" type="date" class="fact-form-input" value="${hoyStr}">
            <small style="color: var(--text-tertiary); font-size: 11px; margin-top: 4px; display: block;">El precio anterior se guardará en el historial hasta el día anterior a la fecha seleccionada.</small>
          </div>
          <div class="fact-form-checkboxes">
            <label class="fact-checkbox-label">
              <input id="swal-variable" type="checkbox" class="fact-checkbox" ${concepto.es_variable ? 'checked' : ''}> Es monto variable
            </label>
            <label class="fact-checkbox-label">
              <input id="swal-turno" type="checkbox" class="fact-checkbox" ${concepto.aplica_turno ? 'checked' : ''}> Aplica a TURNO
            </label>
            <label class="fact-checkbox-label">
              <input id="swal-cargo" type="checkbox" class="fact-checkbox" ${concepto.aplica_cargo ? 'checked' : ''}> Aplica a CARGO
            </label>
            <label class="fact-checkbox-label">
              <input id="swal-activo" type="checkbox" class="fact-checkbox" ${concepto.activo ? 'checked' : ''}> Activo
            </label>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      width: 450,
      customClass: {
        popup: 'fact-modal',
        title: 'fact-modal-title',
        htmlContainer: 'fact-modal-content',
        confirmButton: 'fact-btn-confirm',
        cancelButton: 'fact-btn-cancel'
      },
      didOpen: () => {
        // Mostrar selector de vigencia solo cuando el precio cambia
        const precioInput = document.getElementById('swal-precio') as HTMLInputElement
        const ivaInput = document.getElementById('swal-iva') as HTMLInputElement
        const vigenciaGroup = document.getElementById('swal-vigencia-group') as HTMLDivElement
        const checkPriceChange = () => {
          const newBase = parseFloat(precioInput.value) || 0
          const newIva = parseFloat(ivaInput.value) || 0
          const newFinal = newIva === 0 ? newBase : Number((newBase * (1 + newIva / 100)).toFixed(2))
          const oldFinal = concepto.precio_final || 0
          vigenciaGroup.style.display = Math.abs(newFinal - oldFinal) > 0.01 ? 'block' : 'none'
        }
        precioInput.addEventListener('input', checkPriceChange)
        ivaInput.addEventListener('input', checkPriceChange)
      },
      preConfirm: () => {
        const descripcion = (document.getElementById('swal-desc') as HTMLInputElement).value
        const tipo = (document.getElementById('swal-tipo') as HTMLSelectElement).value
        const precioBase = parseFloat((document.getElementById('swal-precio') as HTMLInputElement).value) || 0
        const ivaPorcentaje = parseFloat((document.getElementById('swal-iva') as HTMLInputElement).value) || 0
        const esVariable = (document.getElementById('swal-variable') as HTMLInputElement).checked
        const aplicaTurno = (document.getElementById('swal-turno') as HTMLInputElement).checked
        const aplicaCargo = (document.getElementById('swal-cargo') as HTMLInputElement).checked
        const activo = (document.getElementById('swal-activo') as HTMLInputElement).checked
        const vigenciaInput = document.getElementById('swal-vigencia') as HTMLInputElement
        const vigenciaValue = vigenciaInput?.value || ''

        if (!descripcion) {
          Swal.showValidationMessage('La descripción es requerida')
          return false
        }

        const newFinal = ivaPorcentaje === 0 ? precioBase : Number((precioBase * (1 + ivaPorcentaje / 100)).toFixed(2))
        const priceChanged = Math.abs(newFinal - (concepto.precio_final || 0)) > 0.01

        if (priceChanged && !vigenciaValue) {
          Swal.showValidationMessage('Seleccioná desde qué fecha aplica el nuevo precio')
          return false
        }

        return {
          descripcion,
          tipo,
          precio_base: precioBase,
          iva_porcentaje: ivaPorcentaje,
          precio_final: newFinal,
          es_variable: esVariable,
          aplica_turno: aplicaTurno,
          aplica_cargo: aplicaCargo,
          activo,
          _priceChanged: priceChanged,
          _vigencia: vigenciaValue,
        }
      }
    })

    if (!formValues) return

    try {
      const priceChanged = formValues._priceChanged as boolean
      const vigencia = formValues._vigencia as string
      // Remove internal fields before sending to DB
      delete (formValues as any)._priceChanged
      delete (formValues as any)._vigencia

      // If price changed, save old price to historial first
      if (priceChanged && vigencia) {
        // vigencia = fecha exacta desde la que aplica el nuevo precio (YYYY-MM-DD)
        const hastaDate = new Date(vigencia + 'T00:00:00')
        hastaDate.setDate(hastaDate.getDate() - 1)
        const hasta = hastaDate.toISOString().split('T')[0]

        const desde = concepto.updated_at
          ? concepto.updated_at.split('T')[0]
          : concepto.created_at?.split('T')[0] || vigencia

        // Ensure desde <= hasta
        const desdeDate = new Date(desde + 'T00:00:00')
        const finalDesde = desdeDate <= hastaDate ? desde : hasta

        const { error: histError } = await (supabase.from('conceptos_facturacion_historial') as any).insert({
          concepto_id: concepto.id,
          codigo: concepto.codigo,
          descripcion: concepto.descripcion,
          precio_base: concepto.precio_base,
          iva_porcentaje: concepto.iva_porcentaje,
          precio_final: concepto.precio_final,
          fecha_vigencia_desde: finalDesde,
          fecha_vigencia_hasta: hasta,
        })
        if (histError) throw histError
      }

      const { error } = await (supabase.from('conceptos_nomina') as any).update(formValues).eq('id', concepto.id)
      if (error) throw error
      showSuccess('Concepto actualizado')
      cargarConceptos(true)
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
      showSuccess('Eliminado')
      cargarConceptos(true)
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
      header: () => (
        <div className="dt-column-filter">
          <span>Tipo {tipoFilter.length > 0 && `(${tipoFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${tipoFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'tipo' ? null : 'tipo') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'tipo' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {TIPOS_CONCEPTO.map(t => (
                  <label key={t.value} className={`dt-column-filter-checkbox ${tipoFilter.includes(t.value) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={tipoFilter.includes(t.value)} onChange={() => toggleTipoFilter(t.value)} />
                    <span>{t.label}</span>
                  </label>
                ))}
              </div>
              {tipoFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => setTipoFilter([])}>
                  Limpiar ({tipoFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
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
      accessorKey: 'precio_base',
      header: 'Precio Base (sin IVA)',
      cell: ({ row }) => row.original.es_variable
        ? <span style={{ color: '#6B7280', fontStyle: 'italic' }}>Variable</span>
        : <span style={{ fontFamily: 'monospace' }}>{formatCurrency(row.original.precio_base || 0)}</span>
    },
    {
      accessorKey: 'precio_final',
      header: 'Precio Final (con IVA)',
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
      header: () => (
        <div className="dt-column-filter">
          <span>Estado {activoFilter.length > 0 && `(${activoFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${activoFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'activo' ? null : 'activo') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'activo' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {[
                  { value: 'activo', label: 'Activo' },
                  { value: 'inactivo', label: 'Inactivo' }
                ].map(e => (
                  <label key={e.value} className={`dt-column-filter-checkbox ${activoFilter.includes(e.value) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={activoFilter.includes(e.value)} onChange={() => toggleActivoFilter(e.value)} />
                    <span>{e.label}</span>
                  </label>
                ))}
              </div>
              {activoFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => setActivoFilter([])}>
                  Limpiar ({activoFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
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
  ], [tipoFilter, activoFilter, openColumnFilter])

  return (
    <DataTable
      data={conceptosFiltrados}
      columns={columns}
      loading={loading}
      searchPlaceholder="Buscar concepto..."
      emptyTitle="Sin conceptos"
      emptyDescription="No hay conceptos registrados"
pageSize={100}
      pageSizeOptions={[10, 20, 50, 100]}
      headerAction={
        <button
          onClick={crearConcepto}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            background: '#ff0033',
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
