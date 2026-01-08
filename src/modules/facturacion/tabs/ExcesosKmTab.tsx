import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import Swal from 'sweetalert2'
import {
  Gauge,
  Users,
  DollarSign,
  Plus,
  Eye,
  Edit2,
  Trash2,
  CheckCircle,
  Clock,
  Calculator,
  Filter
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import type { ExcesoKilometraje, PeriodoFacturacion } from '../../../types/facturacion.types'
import {
  formatCurrency,
  formatDate,
  calcularExcesoKm,
  KM_BASE_SEMANAL,
  IVA_EXCESO_KM,
  FACTURACION_CONFIG
} from '../../../types/facturacion.types'

interface ExcesoConRelaciones extends ExcesoKilometraje {
  conductor_nombre?: string
  vehiculo_patente?: string
  periodo_semana?: number
  periodo_anio?: number
}

export function ExcesosKmTab() {
  const [excesos, setExcesos] = useState<ExcesoConRelaciones[]>([])
  const [periodos, setPeriodos] = useState<PeriodoFacturacion[]>([])
  const [, setConductores] = useState<any[]>([]) // Solo usamos setConductores
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('todos')

  // Estados para filtros Excel
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [conductorSearch, setConductorSearch] = useState('')
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [aplicadoFilter, setAplicadoFilter] = useState<string[]>([])

  useEffect(() => {
    cargarDatos()
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

  // Listas únicas para filtros
  const conductoresUnicos = useMemo(() =>
    [...new Set(excesos.map(e => e.conductor_nombre).filter(Boolean) as string[])].sort()
  , [excesos])

  const conductoresFiltrados = useMemo(() => {
    if (!conductorSearch) return conductoresUnicos
    return conductoresUnicos.filter(c => c.toLowerCase().includes(conductorSearch.toLowerCase()))
  }, [conductoresUnicos, conductorSearch])

  const patentesUnicas = useMemo(() =>
    [...new Set(excesos.map(e => e.vehiculo_patente).filter(Boolean) as string[])].sort()
  , [excesos])

  // Toggle functions
  const toggleConductorFilter = (val: string) => setConductorFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )
  const togglePatenteFilter = (val: string) => setPatenteFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )
  const toggleAplicadoFilter = (val: string) => setAplicadoFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )

  async function cargarDatos() {
    setLoading(true)
    try {
      // Cargar excesos con relaciones
      const { data: excesosData, error: excesosError } = await supabase
        .from('excesos_kilometraje')
        .select(`
          *,
          conductores:conductor_id(id, nombres, apellidos, dni),
          vehiculos:vehiculo_id(id, patente),
          periodos_facturacion:periodo_id(id, semana, anio)
        `)
        .order('created_at', { ascending: false })

      if (excesosError) throw excesosError

      // Mapear datos con nombres
      const excesosMapeados = (excesosData || []).map((e: any) => ({
        ...e,
        conductor_nombre: e.conductores
          ? `${e.conductores.nombres} ${e.conductores.apellidos}`
          : 'Sin asignar',
        vehiculo_patente: e.vehiculos?.patente || '-',
        periodo_semana: e.periodos_facturacion?.semana,
        periodo_anio: e.periodos_facturacion?.anio
      }))

      setExcesos(excesosMapeados)

      // Cargar períodos para selector
      const { data: periodosData } = await supabase
        .from('periodos_facturacion')
        .select('*')
        .order('anio', { ascending: false })
        .order('semana', { ascending: false })
        .limit(20)

      setPeriodos(periodosData || [])

      // Cargar conductores activos para crear excesos
      const { data: conductoresData } = await supabase
        .from('conductores')
        .select('id, nombres, apellidos, dni')
        .eq('estado', 'ACTIVO')
        .order('apellidos')

      setConductores(conductoresData || [])
    } catch (error) {
      console.error('Error cargando datos:', error)
    } finally {
      setLoading(false)
    }
  }

  async function crearExceso() {
    if (periodos.length === 0) {
      Swal.fire('Error', 'No hay períodos disponibles. Cree un período primero.', 'warning')
      return
    }

    // Obtener asignaciones activas con vehículo y tipo
    const { data: asignaciones } = await supabase
      .from('asignaciones')
      .select(`
        conductor_id,
        vehiculo_id,
        horario,
        conductores!inner(id, nombres, apellidos),
        vehiculos!inner(id, patente)
      `)
      .eq('estado', 'activa')

    const conductoresConVehiculo = (asignaciones || []).map((a: any) => ({
      conductor_id: a.conductor_id,
      conductor_nombre: `${a.conductores.nombres} ${a.conductores.apellidos}`,
      vehiculo_id: a.vehiculo_id,
      vehiculo_patente: a.vehiculos.patente,
      tipo_alquiler: a.horario === 'CARGO' ? 'CARGO' : 'TURNO'
    }))

    const periodosOptions = periodos
      .filter(p => p.estado === 'abierto')
      .map(p => `<option value="${p.id}">Semana ${p.semana} / ${p.anio}</option>`)
      .join('')

    // Guardar conductores en variable global temporal para el modal
    ;(window as any).__excesoConductores = conductoresConVehiculo

    const { value: formValues } = await Swal.fire({
      title: 'Registrar Exceso de Kilometraje',
      html: `
        <div style="text-align: left; padding: 0 8px;">
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">Período</label>
            <select id="swal-periodo" style="width: 100%; padding: 10px 12px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; outline: none; background: #fff; cursor: pointer;">
              <option value="">Seleccione período...</option>
              ${periodosOptions}
            </select>
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">Conductor</label>
            <input id="swal-conductor-search" type="text" placeholder="Buscar conductor..." style="width: 100%; padding: 10px 12px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; outline: none; box-sizing: border-box;">
            <div id="swal-conductor-list" style="max-height: 150px; overflow-y: auto; border: 1px solid #E5E7EB; border-radius: 6px; background: #fff; margin-top: 4px;">
            </div>
            <input type="hidden" id="swal-conductor-id" value="">
            <input type="hidden" id="swal-vehiculo-id" value="">
            <input type="hidden" id="swal-tipo-alquiler" value="">
            <div id="swal-conductor-selected" style="margin-top: 8px; padding: 10px 12px; background: #FEE2E2; border-radius: 6px; display: none;">
              <span style="font-size: 13px; color: #991B1B; font-weight: 500;"></span>
            </div>
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">KM Recorridos</label>
            <input id="swal-km" type="number" placeholder="Ej: 2100" style="width: 100%; padding: 10px 12px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; outline: none; box-sizing: border-box;">
          </div>
          <div style="background: #F3F4F6; padding: 12px; border-radius: 8px;">
            <p style="margin: 0 0 6px 0; font-size: 12px; color: #6B7280;">
              <strong>Base semanal:</strong> ${KM_BASE_SEMANAL.toLocaleString()} km
            </p>
            <p style="margin: 0; font-size: 12px; color: #6B7280;">
              <strong>IVA:</strong> ${IVA_EXCESO_KM}%
            </p>
          </div>
          <div id="swal-preview" style="margin-top: 12px; display: none;">
            <div style="background: #FEF3C7; padding: 12px; border-radius: 8px; border: 1px solid #FCD34D;">
              <p style="margin: 0; font-weight: 600; color: #92400E; font-size: 12px;">Cálculo:</p>
              <p id="swal-calc-exceso" style="margin: 4px 0 0 0; font-size: 12px; color: #92400E;"></p>
              <p id="swal-calc-total" style="margin: 4px 0 0 0; font-size: 12px; color: #92400E;"></p>
            </div>
          </div>
        </div>
      `,
      didOpen: () => {
        const kmInput = document.getElementById('swal-km') as HTMLInputElement
        const searchInput = document.getElementById('swal-conductor-search') as HTMLInputElement
        const listContainer = document.getElementById('swal-conductor-list') as HTMLElement
        const conductorIdInput = document.getElementById('swal-conductor-id') as HTMLInputElement
        const vehiculoIdInput = document.getElementById('swal-vehiculo-id') as HTMLInputElement
        const tipoAlquilerInput = document.getElementById('swal-tipo-alquiler') as HTMLInputElement
        const selectedDiv = document.getElementById('swal-conductor-selected') as HTMLElement
        const preview = document.getElementById('swal-preview') as HTMLElement
        const calcExceso = document.getElementById('swal-calc-exceso') as HTMLElement
        const calcTotal = document.getElementById('swal-calc-total') as HTMLElement

        const conductoresList = (window as any).__excesoConductores || []

        const renderList = (filter: string = '') => {
          const filterLower = filter.toLowerCase()
          const filtered = conductoresList.filter((c: any) =>
            c.conductor_nombre.toLowerCase().includes(filterLower) ||
            c.vehiculo_patente.toLowerCase().includes(filterLower)
          )

          if (filtered.length === 0) {
            listContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #6B7280; font-size: 13px;">No se encontraron conductores</div>'
            return
          }

          listContainer.innerHTML = filtered.map((c: any) => `
            <div class="swal-conductor-item"
                 data-id="${c.conductor_id}"
                 data-vehiculo="${c.vehiculo_id}"
                 data-patente="${c.vehiculo_patente}"
                 data-tipo="${c.tipo_alquiler}"
                 data-nombre="${c.conductor_nombre}"
                 style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
              <span>${c.conductor_nombre}</span>
              <span style="color: #6B7280; font-family: monospace; font-size: 12px;">${c.vehiculo_patente}</span>
            </div>
          `).join('')

          // Agregar eventos de hover y click
          listContainer.querySelectorAll('.swal-conductor-item').forEach((item: any) => {
            item.addEventListener('mouseenter', () => {
              item.style.background = '#F3F4F6'
            })
            item.addEventListener('mouseleave', () => {
              item.style.background = ''
            })
            item.addEventListener('click', () => {
              conductorIdInput.value = item.dataset.id
              vehiculoIdInput.value = item.dataset.vehiculo
              tipoAlquilerInput.value = item.dataset.tipo
              selectedDiv.style.display = 'block'
              selectedDiv.querySelector('span')!.textContent = `${item.dataset.nombre} - ${item.dataset.patente}`
              listContainer.style.display = 'none'
              searchInput.value = ''
              updatePreview()
            })
          })
        }

        // Mostrar lista inicial
        renderList()

        // Filtrar al escribir
        searchInput.addEventListener('input', () => {
          listContainer.style.display = 'block'
          renderList(searchInput.value)
        })

        // Mostrar lista al hacer focus
        searchInput.addEventListener('focus', () => {
          listContainer.style.display = 'block'
          renderList(searchInput.value)
        })

        // Permitir cambiar selección
        selectedDiv.addEventListener('click', () => {
          selectedDiv.style.display = 'none'
          listContainer.style.display = 'block'
          searchInput.focus()
        })

        const updatePreview = () => {
          const km = parseFloat(kmInput.value) || 0
          const tipoAlquiler = tipoAlquilerInput.value || 'CARGO'

          if (km > KM_BASE_SEMANAL && conductorIdInput.value) {
            const valorAlquiler = tipoAlquiler === 'CARGO'
              ? FACTURACION_CONFIG.ALQUILER_CARGO
              : FACTURACION_CONFIG.ALQUILER_TURNO

            const resultado = calcularExcesoKm(km, valorAlquiler)
            if (resultado) {
              preview.style.display = 'block'
              calcExceso.textContent = `Exceso: ${resultado.kmExceso} km (${resultado.rango}) - ${resultado.porcentaje}%`
              calcTotal.textContent = `Total a cobrar: ${formatCurrency(resultado.total)} (Base: ${formatCurrency(resultado.montoBase)} + IVA: ${formatCurrency(resultado.iva)})`
            }
          } else {
            preview.style.display = 'none'
          }
        }

        kmInput.addEventListener('input', updatePreview)
      },
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#DC2626',
      width: 450,
      preConfirm: () => {
        const periodoId = (document.getElementById('swal-periodo') as HTMLSelectElement).value
        const conductorId = (document.getElementById('swal-conductor-id') as HTMLInputElement).value
        const vehiculoId = (document.getElementById('swal-vehiculo-id') as HTMLInputElement).value
        const tipoAlquiler = (document.getElementById('swal-tipo-alquiler') as HTMLInputElement).value || 'CARGO'
        const km = parseFloat((document.getElementById('swal-km') as HTMLInputElement).value)

        if (!periodoId) {
          Swal.showValidationMessage('Seleccione un período')
          return false
        }
        if (!conductorId) {
          Swal.showValidationMessage('Seleccione un conductor')
          return false
        }
        if (!km || km <= KM_BASE_SEMANAL) {
          Swal.showValidationMessage(`Los km deben ser mayores a ${KM_BASE_SEMANAL}`)
          return false
        }

        // Limpiar variable global
        delete (window as any).__excesoConductores

        return { periodoId, conductorId, vehiculoId, km, tipoAlquiler }
      }
    })

    if (!formValues) return

    try {
      const valorAlquiler = formValues.tipoAlquiler === 'CARGO'
        ? FACTURACION_CONFIG.ALQUILER_CARGO
        : FACTURACION_CONFIG.ALQUILER_TURNO

      const resultado = calcularExcesoKm(formValues.km, valorAlquiler)
      if (!resultado) {
        Swal.fire('Error', 'No se pudo calcular el exceso', 'error')
        return
      }

      const { error } = await (supabase.from('excesos_kilometraje') as any).insert({
        conductor_id: formValues.conductorId,
        vehiculo_id: formValues.vehiculoId || null,
        periodo_id: formValues.periodoId,
        km_recorridos: formValues.km,
        km_base: KM_BASE_SEMANAL,
        km_exceso: resultado.kmExceso,
        rango: resultado.rango,
        porcentaje: resultado.porcentaje,
        valor_alquiler: valorAlquiler,
        monto_base: resultado.montoBase,
        iva_porcentaje: IVA_EXCESO_KM,
        iva_monto: resultado.iva,
        monto_total: resultado.total,
        aplicado: false
      })

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'Exceso Registrado',
        text: `Exceso de ${resultado.kmExceso} km - Total: ${formatCurrency(resultado.total)}`,
        timer: 2000,
        showConfirmButton: false
      })

      cargarDatos()
    } catch (error: any) {
      console.error('Error creando exceso:', error)
      Swal.fire('Error', error.message || 'No se pudo registrar el exceso', 'error')
    }
  }

  async function editarExceso(exceso: ExcesoConRelaciones) {
    if (exceso.aplicado) {
      Swal.fire('No permitido', 'No se puede editar un exceso ya aplicado', 'warning')
      return
    }

    const { value: nuevoKm } = await Swal.fire({
      title: 'Editar Exceso',
      html: `
        <div style="text-align: left;">
          <p><strong>Conductor:</strong> ${exceso.conductor_nombre}</p>
          <p><strong>Vehículo:</strong> ${exceso.vehiculo_patente}</p>
          <p><strong>KM Base:</strong> ${KM_BASE_SEMANAL.toLocaleString()}</p>
          <div style="margin-top: 12px;">
            <label style="display: block; margin-bottom: 4px;">Nuevos KM Recorridos:</label>
            <input id="swal-km" type="number" class="swal2-input" value="${exceso.km_recorridos}" style="margin: 0;">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const km = parseFloat((document.getElementById('swal-km') as HTMLInputElement).value)
        if (!km || km <= KM_BASE_SEMANAL) {
          Swal.showValidationMessage(`Los km deben ser mayores a ${KM_BASE_SEMANAL}`)
          return false
        }
        return km
      }
    })

    if (!nuevoKm) return

    try {
      const resultado = calcularExcesoKm(nuevoKm, exceso.valor_alquiler)
      if (!resultado) {
        Swal.fire('Error', 'No se pudo recalcular', 'error')
        return
      }

      const { error } = await (supabase
        .from('excesos_kilometraje') as any)
        .update({
          km_recorridos: nuevoKm,
          km_exceso: resultado.kmExceso,
          rango: resultado.rango,
          porcentaje: resultado.porcentaje,
          monto_base: resultado.montoBase,
          iva_monto: resultado.iva,
          monto_total: resultado.total
        })
        .eq('id', exceso.id)

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'Actualizado',
        timer: 1500,
        showConfirmButton: false
      })

      cargarDatos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo actualizar', 'error')
    }
  }

  async function eliminarExceso(exceso: ExcesoConRelaciones) {
    if (exceso.aplicado) {
      Swal.fire('No permitido', 'No se puede eliminar un exceso ya aplicado', 'warning')
      return
    }

    const result = await Swal.fire({
      title: '¿Eliminar exceso?',
      text: `Se eliminará el exceso de ${exceso.km_exceso} km de ${exceso.conductor_nombre}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#DC2626',
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await supabase
        .from('excesos_kilometraje')
        .delete()
        .eq('id', exceso.id)

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'Eliminado',
        timer: 1500,
        showConfirmButton: false
      })

      cargarDatos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo eliminar', 'error')
    }
  }

  async function verDetalle(exceso: ExcesoConRelaciones) {
    Swal.fire({
      title: 'Detalle de Exceso',
      html: `
        <div style="text-align: left;">
          <table style="width: 100%; font-size: 14px;">
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Conductor:</td>
              <td style="padding: 6px 0; font-weight: 500;">${exceso.conductor_nombre}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Vehículo:</td>
              <td style="padding: 6px 0; font-weight: 500;">${exceso.vehiculo_patente}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Período:</td>
              <td style="padding: 6px 0; font-weight: 500;">Semana ${exceso.periodo_semana} / ${exceso.periodo_anio}</td>
            </tr>
            <tr style="border-top: 1px solid #E5E7EB;">
              <td style="padding: 6px 0; color: #6B7280;">KM Recorridos:</td>
              <td style="padding: 6px 0; font-weight: 500;">${exceso.km_recorridos.toLocaleString()} km</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">KM Base:</td>
              <td style="padding: 6px 0; font-weight: 500;">${exceso.km_base.toLocaleString()} km</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">KM Exceso:</td>
              <td style="padding: 6px 0; font-weight: 600; color: #DC2626;">${exceso.km_exceso.toLocaleString()} km</td>
            </tr>
            <tr style="border-top: 1px solid #E5E7EB;">
              <td style="padding: 6px 0; color: #6B7280;">Rango:</td>
              <td style="padding: 6px 0; font-weight: 500;">${exceso.rango}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Porcentaje:</td>
              <td style="padding: 6px 0; font-weight: 500;">${exceso.porcentaje}%</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Valor Alquiler:</td>
              <td style="padding: 6px 0; font-weight: 500;">${formatCurrency(exceso.valor_alquiler)}</td>
            </tr>
            <tr style="border-top: 1px solid #E5E7EB;">
              <td style="padding: 6px 0; color: #6B7280;">Monto Base:</td>
              <td style="padding: 6px 0; font-weight: 500;">${formatCurrency(exceso.monto_base)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">IVA (${exceso.iva_porcentaje}%):</td>
              <td style="padding: 6px 0; font-weight: 500;">${formatCurrency(exceso.iva_monto)}</td>
            </tr>
            <tr style="background: #F3F4F6;">
              <td style="padding: 8px 6px; font-weight: 600;">TOTAL:</td>
              <td style="padding: 8px 6px; font-weight: 700; color: #DC2626; font-size: 16px;">${formatCurrency(exceso.monto_total)}</td>
            </tr>
          </table>
          <div style="margin-top: 12px; padding: 8px; border-radius: 6px; ${exceso.aplicado ? 'background: #D1FAE5; color: #065F46;' : 'background: #FEF3C7; color: #92400E;'}">
            <strong>Estado:</strong> ${exceso.aplicado ? 'Aplicado a facturación' : 'Pendiente de aplicar'}
            ${exceso.fecha_aplicacion ? `<br><small>Aplicado el ${formatDate(exceso.fecha_aplicacion)}</small>` : ''}
          </div>
        </div>
      `,
      width: 450,
      confirmButtonText: 'Cerrar'
    })
  }

  const columns = useMemo<ColumnDef<ExcesoConRelaciones>[]>(() => [
    {
      id: 'periodo',
      header: 'Período',
      cell: ({ row }) => (
        <span className="fact-badge fact-badge-gray">
          S{row.original.periodo_semana}/{row.original.periodo_anio}
        </span>
      )
    },
    {
      accessorKey: 'conductor_nombre',
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
              <input
                type="text"
                placeholder="Buscar conductor..."
                value={conductorSearch}
                onChange={(e) => setConductorSearch(e.target.value)}
                className="dt-column-filter-input"
              />
              <div className="dt-excel-filter-list">
                {conductoresFiltrados.map(c => (
                  <label key={c} className={`dt-column-filter-checkbox ${conductorFilter.includes(c) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={conductorFilter.includes(c)} onChange={() => toggleConductorFilter(c)} />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
              {conductorFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => { setConductorFilter([]); setConductorSearch('') }}>
                  Limpiar ({conductorFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.conductor_nombre}</div>
        </div>
      )
    },
    {
      accessorKey: 'vehiculo_patente',
      header: () => (
        <div className="dt-column-filter">
          <span>Vehículo {patenteFilter.length > 0 && `(${patenteFilter.length})`}</span>
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
        <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
          {row.original.vehiculo_patente}
        </span>
      )
    },
    {
      accessorKey: 'km_recorridos',
      header: 'KM Rec.',
      cell: ({ row }) => (
        <span style={{ fontWeight: 500 }}>
          {row.original.km_recorridos.toLocaleString()}
        </span>
      )
    },
    {
      accessorKey: 'km_exceso',
      header: 'Exceso',
      cell: ({ row }) => (
        <span style={{ color: '#DC2626', fontWeight: 600 }}>
          +{row.original.km_exceso.toLocaleString()}
        </span>
      )
    },
    {
      accessorKey: 'rango',
      header: 'Rango',
      cell: ({ row }) => (
        <span className="fact-badge fact-badge-yellow">
          {row.original.rango}
        </span>
      )
    },
    {
      accessorKey: 'porcentaje',
      header: '%',
      cell: ({ row }) => `${row.original.porcentaje}%`
    },
    {
      accessorKey: 'monto_base',
      header: 'Base',
      cell: ({ row }) => (
        <span className="fact-precio">{formatCurrency(row.original.monto_base)}</span>
      )
    },
    {
      accessorKey: 'iva_monto',
      header: 'IVA',
      cell: ({ row }) => (
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {formatCurrency(row.original.iva_monto)}
        </span>
      )
    },
    {
      accessorKey: 'monto_total',
      header: 'Total',
      cell: ({ row }) => (
        <span className="fact-precio" style={{ fontWeight: 600, color: '#DC2626' }}>
          {formatCurrency(row.original.monto_total)}
        </span>
      )
    },
    {
      accessorKey: 'aplicado',
      header: () => (
        <div className="dt-column-filter">
          <span>Estado {aplicadoFilter.length > 0 && `(${aplicadoFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${aplicadoFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'aplicado' ? null : 'aplicado') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'aplicado' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {[
                  { value: 'pendiente', label: 'Pendiente' },
                  { value: 'aplicado', label: 'Aplicado' }
                ].map(e => (
                  <label key={e.value} className={`dt-column-filter-checkbox ${aplicadoFilter.includes(e.value) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={aplicadoFilter.includes(e.value)} onChange={() => toggleAplicadoFilter(e.value)} />
                    <span>{e.label}</span>
                  </label>
                ))}
              </div>
              {aplicadoFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => setAplicadoFilter([])}>
                  Limpiar ({aplicadoFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <span className={`fact-badge ${row.original.aplicado ? 'fact-badge-green' : 'fact-badge-yellow'}`}>
          {row.original.aplicado ? 'Aplicado' : 'Pendiente'}
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
          {!row.original.aplicado && (
            <>
              <button
                className="fact-table-btn fact-table-btn-edit"
                onClick={() => editarExceso(row.original)}
                title="Editar"
              >
                <Edit2 size={14} />
              </button>
              <button
                className="fact-table-btn fact-table-btn-delete"
                onClick={() => eliminarExceso(row.original)}
                title="Eliminar"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      )
    }
  ], [conductorFilter, conductorSearch, conductoresFiltrados, patenteFilter, patentesUnicas, aplicadoFilter, openColumnFilter])

  const excesosFiltrados = useMemo(() => {
    return excesos.filter(e => {
      // Filtros legacy de header
      if (filtroEstado !== 'todos') {
        const esAplicado = filtroEstado === 'aplicado'
        if (e.aplicado !== esAplicado) return false
      }
      if (filtroPeriodo !== 'todos' && e.periodo_id !== filtroPeriodo) return false
      // Filtros Excel
      if (conductorFilter.length > 0 && !conductorFilter.includes(e.conductor_nombre || '')) return false
      if (patenteFilter.length > 0 && !patenteFilter.includes(e.vehiculo_patente || '')) return false
      if (aplicadoFilter.length > 0) {
        const estado = e.aplicado ? 'aplicado' : 'pendiente'
        if (!aplicadoFilter.includes(estado)) return false
      }
      return true
    })
  }, [excesos, filtroEstado, filtroPeriodo, conductorFilter, patenteFilter, aplicadoFilter])

  const stats = useMemo(() => {
    const total = excesos.length
    const pendientes = excesos.filter(e => !e.aplicado).length
    const aplicados = excesos.filter(e => e.aplicado).length
    const conductoresAfectados = new Set(excesos.map(e => e.conductor_id)).size
    const montoTotal = excesos.reduce((sum, e) => sum + e.monto_total, 0)
    const ivaTotal = excesos.reduce((sum, e) => sum + e.iva_monto, 0)
    return { total, pendientes, aplicados, conductoresAfectados, montoTotal, ivaTotal }
  }, [excesos])

  return (
    <>
      {/* Header con filtros */}
      <div className="fact-header">
        <div className="fact-header-left">
          <span className="fact-label">Estado:</span>
          <select
            className="fact-select"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="pendiente">Pendientes</option>
            <option value="aplicado">Aplicados</option>
          </select>

          <span className="fact-label" style={{ marginLeft: '16px' }}>Período:</span>
          <select
            className="fact-select"
            value={filtroPeriodo}
            onChange={(e) => setFiltroPeriodo(e.target.value)}
          >
            <option value="todos">Todos</option>
            {periodos.map(p => (
              <option key={p.id} value={p.id}>
                Semana {p.semana} / {p.anio}
              </option>
            ))}
          </select>
        </div>
        <div className="fact-header-right">
          <button className="fact-btn-primary" onClick={crearExceso}>
            <Plus size={14} />
            Registrar Exceso
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="fact-stats">
        <div className="fact-stats-grid">
          <div className="fact-stat-card">
            <Gauge size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.total}</span>
              <span className="fact-stat-label">Total Excesos</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <Clock size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.pendientes}</span>
              <span className="fact-stat-label">Pendientes</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <CheckCircle size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.aplicados}</span>
              <span className="fact-stat-label">Aplicados</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <Users size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.conductoresAfectados}</span>
              <span className="fact-stat-label">Conductores</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <DollarSign size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.montoTotal)}</span>
              <span className="fact-stat-label">Monto Total</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <Calculator size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.ivaTotal)}</span>
              <span className="fact-stat-label">IVA Total</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <DataTable
        data={excesosFiltrados}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar conductor o vehículo..."
        emptyIcon={<Gauge size={48} />}
        emptyTitle="Sin excesos de kilometraje"
        emptyDescription="No hay excesos registrados. Use el botón 'Registrar Exceso' para agregar uno."
        pageSize={20}
        pageSizeOptions={[10, 20, 50, 100]}
      />
    </>
  )
}
