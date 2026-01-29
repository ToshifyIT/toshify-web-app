import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'
import {
  Ticket,
  CheckCircle,
  Clock,
  XCircle,
  Plus,
  DollarSign,
  Filter
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import type { TicketFavor } from '../../../types/facturacion.types'
import { formatCurrency, formatDate, TIPOS_TICKET_FAVOR } from '../../../types/facturacion.types'

export function TicketsFavorTab() {
  const [tickets, setTickets] = useState<TicketFavor[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')

  // Estados para filtros Excel
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [conductorSearch, setConductorSearch] = useState('')
  const [tipoFilterExcel, setTipoFilterExcel] = useState<string[]>([])
  const [estadoFilterExcel, setEstadoFilterExcel] = useState<string[]>([])

  useEffect(() => {
    cargarTickets()
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
    [...new Set(tickets.map(t => t.conductor_nombre).filter(Boolean) as string[])].sort()
  , [tickets])

  const conductoresFiltrados = useMemo(() => {
    if (!conductorSearch) return conductoresUnicos
    return conductoresUnicos.filter(c => c.toLowerCase().includes(conductorSearch.toLowerCase()))
  }, [conductoresUnicos, conductorSearch])

  // Toggle functions
  const toggleConductorFilter = (val: string) => setConductorFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )
  const toggleTipoFilterExcel = (val: string) => setTipoFilterExcel(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )
  const toggleEstadoFilterExcel = (val: string) => setEstadoFilterExcel(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )

  async function cargarTickets() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('tickets_favor')
        .select('*')
        .order('fecha_solicitud', { ascending: false })

      if (error) throw error
      setTickets(data || [])
    } catch (error) {
      console.error('Error cargando tickets:', error)
    } finally {
      setLoading(false)
    }
  }

  async function crearTicket() {
    const { data: conductores } = await supabase
      .from('conductores')
      .select('id, nombres, apellidos, numero_dni')
      .order('apellidos')

    // Guardar conductores en variable global temporal para el modal
    ;(window as any).__ticketConductores = conductores || []

    // Detectar tema oscuro
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const colors = {
      bg: isDark ? '#1E293B' : '#fff',
      bgHover: isDark ? '#334155' : '#F3F4F6',
      border: isDark ? '#334155' : '#D1D5DB',
      borderLight: isDark ? '#475569' : '#E5E7EB',
      text: isDark ? '#F1F5F9' : '#374151',
      textSecondary: isDark ? '#94A3B8' : '#6B7280',
      selectedBg: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
      selectedText: isDark ? '#FCA5A5' : '#991B1B'
    }

    const tiposOptions = TIPOS_TICKET_FAVOR.map(t =>
      `<option value="${t.codigo}">${t.nombre}</option>`
    ).join('')

    const { value: formValues } = await Swal.fire({
      title: 'Nuevo Ticket a Favor',
      html: `
        <div style="text-align: left; padding: 0 8px;">
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; color: ${colors.text}; text-transform: uppercase; letter-spacing: 0.5px;">Conductor</label>
            <input id="swal-conductor-search" type="text" placeholder="Buscar conductor..." style="width: 100%; padding: 10px 12px; border: 1px solid ${colors.border}; border-radius: 6px; font-size: 14px; outline: none; box-sizing: border-box; background: ${colors.bg}; color: ${colors.text};">
            <div id="swal-conductor-list" style="max-height: 150px; overflow-y: auto; border: 1px solid ${colors.borderLight}; border-radius: 6px; background: ${colors.bg}; margin-top: 4px;">
            </div>
            <input type="hidden" id="swal-conductor-id" value="">
            <input type="hidden" id="swal-conductor-nombre" value="">
            <input type="hidden" id="swal-conductor-dni" value="">
            <div id="swal-conductor-selected" style="margin-top: 8px; padding: 10px 12px; background: ${colors.selectedBg}; border-radius: 6px; display: none;">
              <span style="font-size: 13px; color: ${colors.selectedText}; font-weight: 500;"></span>
            </div>
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; color: ${colors.text}; text-transform: uppercase; letter-spacing: 0.5px;">Tipo de Ticket</label>
            <select id="swal-tipo" style="width: 100%; padding: 10px 12px; border: 1px solid ${colors.border}; border-radius: 6px; font-size: 14px; outline: none; background: ${colors.bg}; color: ${colors.text}; cursor: pointer;">
              <option value="">Seleccionar...</option>
              ${tiposOptions}
            </select>
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; color: ${colors.text}; text-transform: uppercase; letter-spacing: 0.5px;">Monto</label>
            <input id="swal-monto" type="number" placeholder="0" style="width: 100%; padding: 10px 12px; border: 1px solid ${colors.border}; border-radius: 6px; font-size: 14px; outline: none; box-sizing: border-box; background: ${colors.bg}; color: ${colors.text};">
          </div>
          <div style="margin-bottom: 8px;">
            <label style="display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; color: ${colors.text}; text-transform: uppercase; letter-spacing: 0.5px;">Descripción</label>
            <textarea id="swal-desc" placeholder="Descripción del ticket" style="width: 100%; padding: 10px 12px; border: 1px solid ${colors.border}; border-radius: 6px; font-size: 14px; outline: none; min-height: 80px; resize: vertical; box-sizing: border-box; background: ${colors.bg}; color: ${colors.text};"></textarea>
          </div>
        </div>
      `,
      didOpen: () => {
        const searchInput = document.getElementById('swal-conductor-search') as HTMLInputElement
        const listContainer = document.getElementById('swal-conductor-list') as HTMLElement
        const conductorIdInput = document.getElementById('swal-conductor-id') as HTMLInputElement
        const conductorNombreInput = document.getElementById('swal-conductor-nombre') as HTMLInputElement
        const conductorDniInput = document.getElementById('swal-conductor-dni') as HTMLInputElement
        const selectedDiv = document.getElementById('swal-conductor-selected') as HTMLElement

        // Colores para dark mode (re-detectar)
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark'
        const themeColors = {
          text: isDarkMode ? '#F1F5F9' : '#374151',
          textSecondary: isDarkMode ? '#94A3B8' : '#6B7280',
          border: isDarkMode ? '#475569' : '#f0f0f0',
          hoverBg: isDarkMode ? '#334155' : '#F3F4F6'
        }

        const conductoresList = (window as any).__ticketConductores || []

        const renderList = (filter: string = '') => {
          const filterLower = filter.toLowerCase()
          const filtered = conductoresList.filter((c: any) =>
            `${c.apellidos} ${c.nombres}`.toLowerCase().includes(filterLower) ||
            (c.numero_dni && c.numero_dni.toString().includes(filterLower))
          )

          if (filtered.length === 0) {
            listContainer.innerHTML = `<div style="padding: 12px; text-align: center; color: ${themeColors.textSecondary}; font-size: 13px;">No se encontraron conductores</div>`
            return
          }

          listContainer.innerHTML = filtered.map((c: any) => `
            <div class="swal-conductor-item"
                 data-id="${c.id}"
                 data-nombre="${c.apellidos}, ${c.nombres}"
                 data-dni="${c.numero_dni || ''}"
                 style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid ${themeColors.border}; font-size: 13px; display: flex; justify-content: space-between; align-items: center; color: ${themeColors.text};">
              <span style="color: ${themeColors.text};">${c.apellidos}, ${c.nombres}</span>
              <span style="color: ${themeColors.textSecondary}; font-family: monospace; font-size: 12px;">${c.numero_dni || '-'}</span>
            </div>
          `).join('')

          // Agregar eventos de hover y click
          listContainer.querySelectorAll('.swal-conductor-item').forEach((item: any) => {
            item.addEventListener('mouseenter', () => {
              item.style.background = themeColors.hoverBg
            })
            item.addEventListener('mouseleave', () => {
              item.style.background = ''
            })
            item.addEventListener('click', () => {
              conductorIdInput.value = item.dataset.id
              conductorNombreInput.value = item.dataset.nombre
              conductorDniInput.value = item.dataset.dni
              selectedDiv.style.display = 'block'
              selectedDiv.querySelector('span')!.textContent = `${item.dataset.nombre} - ${item.dataset.dni}`
              listContainer.style.display = 'none'
              searchInput.value = ''
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
      },
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      width: 450,
      preConfirm: () => {
        const conductorId = (document.getElementById('swal-conductor-id') as HTMLInputElement).value
        const conductorNombre = (document.getElementById('swal-conductor-nombre') as HTMLInputElement).value
        const conductorDni = (document.getElementById('swal-conductor-dni') as HTMLInputElement).value
        const tipo = (document.getElementById('swal-tipo') as HTMLSelectElement).value
        const monto = (document.getElementById('swal-monto') as HTMLInputElement).value
        const descripcion = (document.getElementById('swal-desc') as HTMLTextAreaElement).value

        if (!conductorId) { Swal.showValidationMessage('Seleccione un conductor'); return false }
        if (!tipo) { Swal.showValidationMessage('Seleccione un tipo'); return false }
        if (!monto || parseFloat(monto) <= 0) { Swal.showValidationMessage('Ingrese un monto válido'); return false }

        // Limpiar variable global
        delete (window as any).__ticketConductores

        return {
          conductor_id: conductorId,
          conductor_nombre: conductorNombre,
          conductor_dni: conductorDni,
          tipo,
          monto: parseFloat(monto),
          descripcion: descripcion || null
        }
      }
    })

    if (!formValues) return

    try {
      const { error } = await supabase.from('tickets_favor').insert({
        ...formValues,
        fecha_solicitud: new Date().toISOString(),
        estado: 'pendiente'
      })

      if (error) throw error
      showSuccess('Ticket Creado')
      cargarTickets()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo crear el ticket', 'error')
    }
  }

  async function aprobarTicket(ticket: TicketFavor) {
    const result = await Swal.fire({
      title: 'Aprobar Ticket',
      html: `<p>¿Aprobar el ticket de <strong>${ticket.conductor_nombre}</strong>?</p><p>Monto: <strong>${formatCurrency(ticket.monto)}</strong></p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Aprobar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a'
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await (supabase
        .from('tickets_favor') as any)
        .update({ estado: 'aprobado', fecha_aprobacion: new Date().toISOString() })
        .eq('id', ticket.id)

      if (error) throw error
      showSuccess('Ticket Aprobado')
      cargarTickets()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo aprobar', 'error')
    }
  }

  async function rechazarTicket(ticket: TicketFavor) {
    const { value: motivo } = await Swal.fire({
      title: 'Rechazar Ticket',
      input: 'textarea',
      inputLabel: 'Motivo del rechazo',
      showCancelButton: true,
      confirmButtonText: 'Rechazar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
      inputValidator: (value) => { if (!value) return 'Debe ingresar un motivo' }
    })

    if (!motivo) return

    try {
      const { error } = await (supabase
        .from('tickets_favor') as any)
        .update({ estado: 'rechazado', motivo_rechazo: motivo })
        .eq('id', ticket.id)

      if (error) throw error
      showSuccess('Ticket Rechazado')
      cargarTickets()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo rechazar', 'error')
    }
  }

  async function aplicarTicket(ticket: TicketFavor) {
    const { data: periodos } = await supabase
      .from('periodos_facturacion')
      .select('id, semana, anio')
      .eq('estado', 'abierto')
      .order('anio', { ascending: false })
      .order('semana', { ascending: false })

    const periodosOptions = (periodos as any[] || []).length > 0
      ? (periodos as any[]).map((p: any) =>
          `<option value="${p.id}">Semana ${p.semana} - ${p.anio}</option>`
        ).join('')
      : '<option value="">No hay períodos abiertos</option>'

    const { value: periodoId } = await Swal.fire({
      title: 'Aplicar Ticket',
      html: `<p>Seleccione el período:</p><select id="swal-periodo" class="swal2-select">${periodosOptions}</select>`,
      showCancelButton: true,
      confirmButtonText: 'Aplicar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const periodo = (document.getElementById('swal-periodo') as HTMLSelectElement).value
        if (!periodo) { Swal.showValidationMessage('Seleccione un período'); return false }
        return periodo
      }
    })

    if (!periodoId) return

    try {
      const { error } = await (supabase
        .from('tickets_favor') as any)
        .update({ estado: 'aplicado', periodo_aplicado_id: periodoId, fecha_aplicacion: new Date().toISOString() })
        .eq('id', ticket.id)

      if (error) throw error
      showSuccess('Ticket Aplicado')
      cargarTickets()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo aplicar', 'error')
    }
  }

  const columns = useMemo<ColumnDef<TicketFavor>[]>(() => [
    {
      accessorKey: 'fecha_solicitud',
      header: 'Fecha',
      cell: ({ row }) => formatDate(row.original.fecha_solicitud)
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
          <div className="text-xs text-gray-500">{row.original.conductor_dni}</div>
        </div>
      )
    },
    {
      accessorKey: 'tipo',
      header: () => (
        <div className="dt-column-filter">
          <span>Tipo {tipoFilterExcel.length > 0 && `(${tipoFilterExcel.length})`}</span>
          <button
            className={`dt-column-filter-btn ${tipoFilterExcel.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'tipo' ? null : 'tipo') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'tipo' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {TIPOS_TICKET_FAVOR.map(t => (
                  <label key={t.codigo} className={`dt-column-filter-checkbox ${tipoFilterExcel.includes(t.codigo) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={tipoFilterExcel.includes(t.codigo)} onChange={() => toggleTipoFilterExcel(t.codigo)} />
                    <span>{t.nombre}</span>
                  </label>
                ))}
              </div>
              {tipoFilterExcel.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => setTipoFilterExcel([])}>
                  Limpiar ({tipoFilterExcel.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => {
        const tipoInfo = TIPOS_TICKET_FAVOR.find(t => t.codigo === row.original.tipo)
        return <span className="fact-badge fact-badge-purple">{tipoInfo?.nombre || row.original.tipo}</span>
      }
    },
    {
      accessorKey: 'monto',
      header: 'Monto',
      cell: ({ row }) => <span className="fact-precio">{formatCurrency(row.original.monto)}</span>
    },
    {
      accessorKey: 'descripcion',
      header: 'Descripción',
      cell: ({ row }) => <div className="text-sm text-gray-600 max-w-xs truncate">{row.original.descripcion || '-'}</div>
    },
    {
      accessorKey: 'estado',
      header: () => (
        <div className="dt-column-filter">
          <span>Estado {estadoFilterExcel.length > 0 && `(${estadoFilterExcel.length})`}</span>
          <button
            className={`dt-column-filter-btn ${estadoFilterExcel.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'estado' ? null : 'estado') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'estado' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {[
                  { value: 'pendiente', label: 'Pendiente' },
                  { value: 'aprobado', label: 'Aprobado' },
                  { value: 'rechazado', label: 'Rechazado' },
                  { value: 'aplicado', label: 'Aplicado' }
                ].map(e => (
                  <label key={e.value} className={`dt-column-filter-checkbox ${estadoFilterExcel.includes(e.value) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={estadoFilterExcel.includes(e.value)} onChange={() => toggleEstadoFilterExcel(e.value)} />
                    <span>{e.label}</span>
                  </label>
                ))}
              </div>
              {estadoFilterExcel.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => setEstadoFilterExcel([])}>
                  Limpiar ({estadoFilterExcel.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => {
        const estado = row.original.estado
        const config: Record<string, { class: string; label: string }> = {
          pendiente: { class: 'fact-badge-yellow', label: 'Pendiente' },
          aprobado: { class: 'fact-badge-blue', label: 'Aprobado' },
          rechazado: { class: 'fact-badge-red', label: 'Rechazado' },
          aplicado: { class: 'fact-badge-green', label: 'Aplicado' }
        }
        const { class: badgeClass, label } = config[estado] || { class: 'fact-badge-gray', label: estado }
        return <span className={`fact-badge ${badgeClass}`}>{label}</span>
      }
    },
    {
      id: 'acciones',
      header: '',
      cell: ({ row }) => {
        const ticket = row.original
        return (
          <div className="fact-table-actions">
            {ticket.estado === 'pendiente' && (
              <>
                <button className="fact-table-btn fact-table-btn-success" onClick={() => aprobarTicket(ticket)} title="Aprobar">
                  <CheckCircle size={14} />
                </button>
                <button className="fact-table-btn fact-table-btn-delete" onClick={() => rechazarTicket(ticket)} title="Rechazar">
                  <XCircle size={14} />
                </button>
              </>
            )}
            {ticket.estado === 'aprobado' && (
              <button className="fact-table-btn fact-table-btn-edit" onClick={() => aplicarTicket(ticket)} title="Aplicar">
                <DollarSign size={14} />
              </button>
            )}
          </div>
        )
      }
    }
  ], [conductorFilter, conductorSearch, conductoresFiltrados, tipoFilterExcel, estadoFilterExcel, openColumnFilter])

  const ticketsFiltrados = useMemo(() => {
    return tickets.filter(t => {
      // Filtros legacy de header
      if (filtroEstado !== 'todos' && t.estado !== filtroEstado) return false
      if (filtroTipo !== 'todos' && t.tipo !== filtroTipo) return false
      // Filtros Excel
      if (conductorFilter.length > 0 && !conductorFilter.includes(t.conductor_nombre || '')) return false
      if (tipoFilterExcel.length > 0 && !tipoFilterExcel.includes(t.tipo)) return false
      if (estadoFilterExcel.length > 0 && !estadoFilterExcel.includes(t.estado)) return false
      return true
    })
  }, [tickets, filtroEstado, filtroTipo, conductorFilter, tipoFilterExcel, estadoFilterExcel])

  const stats = useMemo(() => {
    const total = tickets.length
    const pendientes = tickets.filter(t => t.estado === 'pendiente').length
    const aprobados = tickets.filter(t => t.estado === 'aprobado').length
    const aplicados = tickets.filter(t => t.estado === 'aplicado').length
    const montoAplicado = tickets.filter(t => t.estado === 'aplicado').reduce((sum, t) => sum + t.monto, 0)
    return { total, pendientes, aprobados, aplicados, montoAplicado }
  }, [tickets])

  return (
    <>
      {/* Header con filtros */}
      <div className="fact-header">
        <div className="fact-header-left">
          <span className="fact-label">Estado:</span>
          <select className="fact-select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="pendiente">Pendientes</option>
            <option value="aprobado">Aprobados</option>
            <option value="aplicado">Aplicados</option>
            <option value="rechazado">Rechazados</option>
          </select>
          <span className="fact-label" style={{ marginLeft: '16px' }}>Tipo:</span>
          <select className="fact-select" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="todos">Todos</option>
            {TIPOS_TICKET_FAVOR.map(t => (
              <option key={t.codigo} value={t.codigo}>{t.nombre}</option>
            ))}
          </select>
        </div>
        <div className="fact-header-right">
          <button className="fact-btn fact-btn-primary" onClick={crearTicket}>
            <Plus size={14} />
            Nuevo Ticket
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="fact-stats">
        <div className="fact-stats-grid">
          <div className="fact-stat-card">
            <Ticket size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.total}</span>
              <span className="fact-stat-label">Total</span>
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
              <span className="fact-stat-value">{stats.aprobados}</span>
              <span className="fact-stat-label">Aprobados</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <DollarSign size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.aplicados}</span>
              <span className="fact-stat-label">Aplicados</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <DollarSign size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.montoAplicado)}</span>
              <span className="fact-stat-label">Monto Aplicado</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <DataTable
        data={ticketsFiltrados}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar ticket..."
        emptyIcon={<Ticket size={48} />}
        emptyTitle="Sin tickets"
        emptyDescription="No hay tickets registrados"
        pageSize={100}
        pageSizeOptions={[10, 20, 50, 100]}
      />
    </>
  )
}
