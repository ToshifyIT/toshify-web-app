/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'
import {
  AlertTriangle,
  Car,
  DollarSign,
  Plus,
  Eye,
  Edit2,
  Trash2,
  MapPin,
  Filter,
  RefreshCw
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Multa {
  id: number
  created_at: string
  patente: string
  fecha_infraccion: string | null
  importe: string
  lugar: string
  detalle: string
  fecha_anotacion: string | null
  conductor_responsable: string
  observaciones: string
  infraccion: string
  lugar_detalle: string
  ibutton: string
  // Relaciones
  vehiculo_id?: string
  conductor_nombre?: string
}

interface Vehiculo {
  id: string
  patente: string
}

export function MultasTab() {
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const [multas, setMultas] = useState<Multa[]>([])
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('')

  // Filtros Excel
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [conductorFilter, setConductorFilter] = useState<string[]>([])

  useEffect(() => {
    cargarDatos()
  }, [sedeActualId])

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

  // Listas unicas para filtros
  const patentesUnicas = useMemo(() =>
    [...new Set(multas.map(m => m.patente).filter(Boolean))].sort()
  , [multas])

  const conductoresUnicos = useMemo(() =>
    [...new Set(multas.map(m => m.conductor_responsable).filter(Boolean))].sort()
  , [multas])

  const togglePatenteFilter = (val: string) => setPatenteFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )

  const toggleConductorFilter = (val: string) => setConductorFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )

  async function cargarDatos() {
    setLoading(true)
    try {
      // Cargar multas
      const { data: multasData, error: multasError } = await aplicarFiltroSede((supabase
        .from('multas_historico') as any)
        .select('*'))
        .order('fecha_infraccion', { ascending: false })

      if (multasError) throw multasError

      // Cargar vehiculos para mapear patentes
      const { data: vehiculosData } = await aplicarFiltroSede(supabase
        .from('vehiculos')
        .select('id, patente')
        .is('deleted_at', null))

      const vehiculosList = (vehiculosData || []) as Vehiculo[]
      setVehiculos(vehiculosList)

      // Mapear multas con vehiculo_id
      const vehiculosMap = new Map(vehiculosList.map(v => [v.patente?.toUpperCase().replace(/\s+/g, ''), v.id]))

      const multasMapeadas = (multasData || []).map((m: any) => {
        const patenteNorm = m.patente?.toUpperCase().replace(/\s+/g, '') || ''
        return {
          ...m,
          vehiculo_id: vehiculosMap.get(patenteNorm) || null
        }
      })

      setMultas(multasMapeadas)
    } catch (error) {
      console.error('Error cargando multas:', error)
      Swal.fire('Error', 'No se pudieron cargar las multas', 'error')
    } finally {
      setLoading(false)
    }
  }

  function parseImporte(importe: string): number {
    if (!importe) return 0
    // Puede venir como "$ 1.234.567" o solo numero
    return parseFloat(String(importe).replace(/[^\d.-]/g, '')) || 0
  }

  function formatImporte(importe: string): string {
    const num = parseImporte(importe)
    return num > 0 ? `$ ${num.toLocaleString('en-US')}` : '-'
  }

  function formatFecha(fecha: string | null): string {
    if (!fecha) return '-'
    try {
      return format(new Date(fecha), 'dd/MM/yyyy', { locale: es })
    } catch {
      return fecha
    }
  }

  async function crearMulta() {
    const patentesOptions = vehiculos
      .map(v => `<option value="${v.patente}">${v.patente}</option>`)
      .join('')

    const { value: formValues } = await Swal.fire({
      title: 'Registrar Multa de Transito',
      html: `
        <div style="text-align: left; padding: 0 8px;">
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Patente *</label>
            <select id="swal-patente" style="width: 100%; padding: 8px 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px;">
              <option value="">Seleccione vehiculo...</option>
              ${patentesOptions}
            </select>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Fecha Infraccion *</label>
            <input id="swal-fecha" type="date" style="width: 100%; padding: 8px 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Importe ($) *</label>
            <input id="swal-importe" type="number" placeholder="Ej: 500000" style="width: 100%; padding: 8px 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Infraccion</label>
            <input id="swal-infraccion" type="text" placeholder="Tipo de infraccion..." style="width: 100%; padding: 8px 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Lugar</label>
            <input id="swal-lugar" type="text" placeholder="Ubicacion de la infraccion..." style="width: 100%; padding: 8px 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Conductor Responsable</label>
            <input id="swal-conductor" type="text" placeholder="Nombre del conductor..." style="width: 100%; padding: 8px 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Detalle / Observaciones</label>
            <textarea id="swal-detalle" rows="2" placeholder="Detalles adicionales..." style="width: 100%; padding: 8px 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; box-sizing: border-box; resize: vertical;"></textarea>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      width: 450,
      preConfirm: () => {
        const patente = (document.getElementById('swal-patente') as HTMLSelectElement).value
        const fecha = (document.getElementById('swal-fecha') as HTMLInputElement).value
        const importe = (document.getElementById('swal-importe') as HTMLInputElement).value
        const infraccion = (document.getElementById('swal-infraccion') as HTMLInputElement).value
        const lugar = (document.getElementById('swal-lugar') as HTMLInputElement).value
        const conductor = (document.getElementById('swal-conductor') as HTMLInputElement).value
        const detalle = (document.getElementById('swal-detalle') as HTMLTextAreaElement).value

        if (!patente) {
          Swal.showValidationMessage('Seleccione una patente')
          return false
        }
        if (!fecha) {
          Swal.showValidationMessage('Ingrese la fecha de infraccion')
          return false
        }
        if (!importe || parseFloat(importe) <= 0) {
          Swal.showValidationMessage('Ingrese un importe valido')
          return false
        }

        return { patente, fecha, importe, infraccion, lugar, conductor, detalle }
      }
    })

    if (!formValues) return

    try {
      const { error } = await (supabase.from('multas_historico') as any).insert({
        patente: formValues.patente,
        fecha_infraccion: formValues.fecha,
        importe: formValues.importe,
        infraccion: formValues.infraccion || null,
        lugar: formValues.lugar || null,
        conductor_responsable: formValues.conductor || null,
        detalle: formValues.detalle || null,
        observaciones: formValues.detalle || null,
        fecha_anotacion: new Date().toISOString()
      })

      if (error) throw error

      showSuccess('Multa Registrada', `Multa de $ ${parseFloat(formValues.importe).toLocaleString('en-US')} registrada`)

      cargarDatos()
    } catch (error: any) {
      console.error('Error creando multa:', error)
      Swal.fire('Error', error.message || 'No se pudo registrar la multa', 'error')
    }
  }

  async function editarMulta(multa: Multa) {
    const patentesOptions = vehiculos
      .map(v => `<option value="${v.patente}" ${v.patente === multa.patente ? 'selected' : ''}>${v.patente}</option>`)
      .join('')

    const fechaValue = multa.fecha_infraccion ? multa.fecha_infraccion.split('T')[0] : ''

    const { value: formValues } = await Swal.fire({
      title: 'Editar Multa',
      html: `
        <div style="text-align: left; padding: 0 8px;">
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Patente *</label>
            <select id="swal-patente" style="width: 100%; padding: 8px 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px;">
              <option value="">Seleccione vehiculo...</option>
              ${patentesOptions}
            </select>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Fecha Infraccion *</label>
            <input id="swal-fecha" type="date" value="${fechaValue}" style="width: 100%; padding: 8px 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Importe ($) *</label>
            <input id="swal-importe" type="number" value="${parseImporte(multa.importe)}" style="width: 100%; padding: 8px 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Infraccion</label>
            <input id="swal-infraccion" type="text" value="${multa.infraccion || ''}" style="width: 100%; padding: 8px 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Lugar</label>
            <input id="swal-lugar" type="text" value="${multa.lugar || ''}" style="width: 100%; padding: 8px 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Conductor Responsable</label>
            <input id="swal-conductor" type="text" value="${multa.conductor_responsable || ''}" style="width: 100%; padding: 8px 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Detalle / Observaciones</label>
            <textarea id="swal-detalle" rows="2" style="width: 100%; padding: 8px 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; box-sizing: border-box; resize: vertical;">${multa.observaciones || multa.detalle || ''}</textarea>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      width: 450,
      preConfirm: () => {
        const patente = (document.getElementById('swal-patente') as HTMLSelectElement).value
        const fecha = (document.getElementById('swal-fecha') as HTMLInputElement).value
        const importe = (document.getElementById('swal-importe') as HTMLInputElement).value
        const infraccion = (document.getElementById('swal-infraccion') as HTMLInputElement).value
        const lugar = (document.getElementById('swal-lugar') as HTMLInputElement).value
        const conductor = (document.getElementById('swal-conductor') as HTMLInputElement).value
        const detalle = (document.getElementById('swal-detalle') as HTMLTextAreaElement).value

        if (!patente) {
          Swal.showValidationMessage('Seleccione una patente')
          return false
        }
        if (!fecha) {
          Swal.showValidationMessage('Ingrese la fecha de infraccion')
          return false
        }
        if (!importe || parseFloat(importe) <= 0) {
          Swal.showValidationMessage('Ingrese un importe valido')
          return false
        }

        return { patente, fecha, importe, infraccion, lugar, conductor, detalle }
      }
    })

    if (!formValues) return

    try {
      const { error } = await (supabase.from('multas_historico') as any)
        .update({
          patente: formValues.patente,
          fecha_infraccion: formValues.fecha,
          importe: formValues.importe,
          infraccion: formValues.infraccion || null,
          lugar: formValues.lugar || null,
          conductor_responsable: formValues.conductor || null,
          detalle: formValues.detalle || null,
          observaciones: formValues.detalle || null
        })
        .eq('id', multa.id)

      if (error) throw error

      showSuccess('Multa Actualizada')

      cargarDatos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo actualizar la multa', 'error')
    }
  }

  async function eliminarMulta(multa: Multa) {
    const result = await Swal.fire({
      title: 'Eliminar multa?',
      text: `Se eliminara la multa de ${multa.patente} por ${formatImporte(multa.importe)}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff0033',
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await (supabase.from('multas_historico') as any)
        .delete()
        .eq('id', multa.id)

      if (error) throw error

      showSuccess('Eliminada')

      cargarDatos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo eliminar', 'error')
    }
  }

  function verDetalle(multa: Multa) {
    Swal.fire({
      title: 'Detalle de Multa',
      html: `
        <div style="text-align: left;">
          <table style="width: 100%; font-size: 14px;">
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Patente:</td>
              <td style="padding: 6px 0; font-weight: 600; font-family: monospace;">${multa.patente || '-'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Fecha Infraccion:</td>
              <td style="padding: 6px 0; font-weight: 500;">${formatFecha(multa.fecha_infraccion)}</td>
            </tr>
            <tr style="background: #FEE2E2;">
              <td style="padding: 8px 6px; font-weight: 600;">Importe:</td>
              <td style="padding: 8px 6px; font-weight: 700; color: #ff0033; font-size: 16px;">${formatImporte(multa.importe)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Infraccion:</td>
              <td style="padding: 6px 0; font-weight: 500;">${multa.infraccion || '-'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Lugar:</td>
              <td style="padding: 6px 0; font-weight: 500;">${multa.lugar || '-'}</td>
            </tr>
            ${multa.lugar_detalle ? `
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Lugar Detalle:</td>
              <td style="padding: 6px 0; font-weight: 500;">${multa.lugar_detalle}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Conductor:</td>
              <td style="padding: 6px 0; font-weight: 500;">${multa.conductor_responsable || '-'}</td>
            </tr>
            ${multa.ibutton ? `
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">iButton:</td>
              <td style="padding: 6px 0; font-family: monospace; font-size: 12px;">${multa.ibutton}</td>
            </tr>
            ` : ''}
            ${multa.detalle || multa.observaciones ? `
            <tr style="border-top: 1px solid #E5E7EB;">
              <td colspan="2" style="padding: 8px 0;">
                <strong style="color: #6B7280;">Observaciones:</strong><br>
                <span style="font-size: 13px;">${multa.observaciones || multa.detalle || ''}</span>
              </td>
            </tr>
            ` : ''}
            <tr style="border-top: 1px solid #E5E7EB;">
              <td style="padding: 6px 0; color: #6B7280;">Fecha Anotacion:</td>
              <td style="padding: 6px 0; font-size: 12px;">${formatFecha(multa.fecha_anotacion)}</td>
            </tr>
          </table>
        </div>
      `,
      width: 450,
      confirmButtonText: 'Cerrar'
    })
  }

  const columns = useMemo<ColumnDef<Multa>[]>(() => [
    {
      accessorKey: 'patente',
      header: () => (
        <div className="dt-column-filter">
          <span>Patente {patenteFilter.length > 0 && `(${patenteFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${patenteFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'patente' ? null : 'patente') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'patente' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {patentesUnicas.map(p => (
                  <label key={p} className={`dt-column-filter-checkbox ${patenteFilter.includes(p) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={patenteFilter.includes(p)} onChange={() => togglePatenteFilter(p)} />
                    <span>{p}</span>
                  </label>
                ))}
              </div>
              {patenteFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => setPatenteFilter([])}>
                  Limpiar ({patenteFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 600 }}>
          {row.original.patente || '-'}
        </span>
      )
    },
    {
      accessorKey: 'fecha_infraccion',
      header: 'Fecha',
      cell: ({ row }) => (
        <span style={{ fontSize: '13px' }}>
          {formatFecha(row.original.fecha_infraccion)}
        </span>
      )
    },
    {
      accessorKey: 'importe',
      header: 'Importe',
      cell: ({ row }) => (
        <span className="fact-precio" style={{ fontWeight: 600, color: '#ff0033' }}>
          {formatImporte(row.original.importe)}
        </span>
      )
    },
    {
      accessorKey: 'infraccion',
      header: 'Infraccion',
      cell: ({ row }) => (
        <span style={{ fontSize: '13px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {row.original.infraccion || '-'}
        </span>
      )
    },
    {
      accessorKey: 'lugar',
      header: 'Lugar',
      cell: ({ row }) => (
        <span style={{ fontSize: '13px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {row.original.lugar || '-'}
        </span>
      )
    },
    {
      accessorKey: 'conductor_responsable',
      header: () => (
        <div className="dt-column-filter">
          <span>Conductor {conductorFilter.length > 0 && `(${conductorFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${conductorFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'conductor' ? null : 'conductor') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'conductor' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {conductoresUnicos.map(c => (
                  <label key={c} className={`dt-column-filter-checkbox ${conductorFilter.includes(c) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={conductorFilter.includes(c)} onChange={() => toggleConductorFilter(c)} />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
              {conductorFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => setConductorFilter([])}>
                  Limpiar ({conductorFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <span style={{ fontSize: '13px' }}>
          {row.original.conductor_responsable || '-'}
        </span>
      )
    },
    {
      id: 'acciones',
      header: '',
      cell: ({ row }) => (
        <div className="fact-table-actions">
          <button
            className="fact-table-btn fact-table-btn-view"
            onClick={() => verDetalle(row.original)}
            title="Ver detalle"
          >
            <Eye size={14} />
          </button>
          <button
            className="fact-table-btn fact-table-btn-edit"
            onClick={() => editarMulta(row.original)}
            title="Editar"
          >
            <Edit2 size={14} />
          </button>
          <button
            className="fact-table-btn fact-table-btn-delete"
            onClick={() => eliminarMulta(row.original)}
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )
    }
  ], [patenteFilter, patentesUnicas, conductorFilter, conductoresUnicos, openColumnFilter])

  const multasFiltradas = useMemo(() => {
    return multas.filter(m => {
      // Filtro por fecha
      if (filtroFechaDesde && m.fecha_infraccion) {
        if (m.fecha_infraccion < filtroFechaDesde) return false
      }
      if (filtroFechaHasta && m.fecha_infraccion) {
        if (m.fecha_infraccion > filtroFechaHasta + 'T23:59:59') return false
      }
      // Filtros Excel
      if (patenteFilter.length > 0 && !patenteFilter.includes(m.patente)) return false
      if (conductorFilter.length > 0 && !conductorFilter.includes(m.conductor_responsable)) return false
      return true
    })
  }, [multas, filtroFechaDesde, filtroFechaHasta, patenteFilter, conductorFilter])

  const stats = useMemo(() => {
    const total = multas.length
    const montoTotal = multas.reduce((sum, m) => sum + parseImporte(m.importe), 0)
    const vehiculosAfectados = new Set(multas.map(m => m.patente).filter(Boolean)).size
    const conductoresAfectados = new Set(multas.map(m => m.conductor_responsable).filter(Boolean)).size
    return { total, montoTotal, vehiculosAfectados, conductoresAfectados }
  }, [multas])

  return (
    <>
      {/* Header con filtros */}
      <div className="fact-header">
        <div className="fact-header-left">
          <span className="fact-label">Desde:</span>
          <input
            type="date"
            className="fact-input"
            value={filtroFechaDesde}
            onChange={(e) => setFiltroFechaDesde(e.target.value)}
            style={{ width: '140px' }}
          />

          <span className="fact-label" style={{ marginLeft: '12px' }}>Hasta:</span>
          <input
            type="date"
            className="fact-input"
            value={filtroFechaHasta}
            onChange={(e) => setFiltroFechaHasta(e.target.value)}
            style={{ width: '140px' }}
          />

          {(filtroFechaDesde || filtroFechaHasta) && (
            <button
              className="fact-btn-secondary"
              onClick={() => { setFiltroFechaDesde(''); setFiltroFechaHasta('') }}
              style={{ marginLeft: '8px' }}
            >
              Limpiar
            </button>
          )}
        </div>
        <div className="fact-header-right">
          <button className="fact-btn-secondary" onClick={cargarDatos} title="Recargar">
            <RefreshCw size={14} />
          </button>
          <button className="fact-btn-primary" onClick={crearMulta}>
            <Plus size={14} />
            Registrar Multa
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="fact-stats">
        <div className="fact-stats-grid">
          <div className="fact-stat-card">
            <AlertTriangle size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.total}</span>
              <span className="fact-stat-label">Total Multas</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <DollarSign size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">$ {stats.montoTotal.toLocaleString('en-US')}</span>
              <span className="fact-stat-label">Monto Total</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <Car size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.vehiculosAfectados}</span>
              <span className="fact-stat-label">Vehiculos</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <MapPin size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.conductoresAfectados}</span>
              <span className="fact-stat-label">Conductores</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <DataTable
        data={multasFiltradas}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar por patente, conductor, lugar..."
        emptyIcon={<AlertTriangle size={48} />}
        emptyTitle="Sin multas registradas"
        emptyDescription="No hay multas de transito. Use el boton 'Registrar Multa' para agregar una."
        pageSize={100}
        pageSizeOptions={[10, 20, 50, 100]}
      />
    </>
  )
}
