import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import Swal from 'sweetalert2'
import {
  Ticket,
  CheckCircle,
  Clock,
  XCircle,
  Plus,
  DollarSign
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

  useEffect(() => {
    cargarTickets()
  }, [])

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

    const tiposOptions = TIPOS_TICKET_FAVOR.map(t =>
      `<option value="${t.codigo}">${t.nombre}</option>`
    ).join('')

    const { value: formValues } = await Swal.fire({
      title: 'Nuevo Ticket a Favor',
      html: `
        <div style="text-align: left; padding: 0 8px;">
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">Conductor</label>
            <input id="swal-conductor-search" type="text" placeholder="Buscar conductor..." style="width: 100%; padding: 10px 12px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; outline: none; box-sizing: border-box;">
            <div id="swal-conductor-list" style="max-height: 150px; overflow-y: auto; border: 1px solid #E5E7EB; border-radius: 6px; background: #fff; margin-top: 4px;">
            </div>
            <input type="hidden" id="swal-conductor-id" value="">
            <input type="hidden" id="swal-conductor-nombre" value="">
            <input type="hidden" id="swal-conductor-dni" value="">
            <div id="swal-conductor-selected" style="margin-top: 8px; padding: 10px 12px; background: #FEE2E2; border-radius: 6px; display: none;">
              <span style="font-size: 13px; color: #991B1B; font-weight: 500;"></span>
            </div>
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">Tipo de Ticket</label>
            <select id="swal-tipo" style="width: 100%; padding: 10px 12px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; outline: none; background: #fff; cursor: pointer;">
              <option value="">Seleccionar...</option>
              ${tiposOptions}
            </select>
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">Monto</label>
            <input id="swal-monto" type="number" placeholder="0" style="width: 100%; padding: 10px 12px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; outline: none; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 8px;">
            <label style="display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">Descripción</label>
            <textarea id="swal-desc" placeholder="Descripción del ticket" style="width: 100%; padding: 10px 12px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px; outline: none; min-height: 80px; resize: vertical; box-sizing: border-box;"></textarea>
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

        const conductoresList = (window as any).__ticketConductores || []

        const renderList = (filter: string = '') => {
          const filterLower = filter.toLowerCase()
          const filtered = conductoresList.filter((c: any) =>
            `${c.apellidos} ${c.nombres}`.toLowerCase().includes(filterLower) ||
            (c.numero_dni && c.numero_dni.toString().includes(filterLower))
          )

          if (filtered.length === 0) {
            listContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #6B7280; font-size: 13px;">No se encontraron conductores</div>'
            return
          }

          listContainer.innerHTML = filtered.map((c: any) => `
            <div class="swal-conductor-item"
                 data-id="${c.id}"
                 data-nombre="${c.apellidos}, ${c.nombres}"
                 data-dni="${c.numero_dni || ''}"
                 style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
              <span>${c.apellidos}, ${c.nombres}</span>
              <span style="color: #6B7280; font-family: monospace; font-size: 12px;">${c.numero_dni || '-'}</span>
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
      confirmButtonColor: '#DC2626',
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
      Swal.fire({ icon: 'success', title: 'Ticket Creado', timer: 1500, showConfirmButton: false })
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
      Swal.fire({ icon: 'success', title: 'Ticket Aprobado', timer: 1500, showConfirmButton: false })
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
      Swal.fire({ icon: 'success', title: 'Ticket Rechazado', timer: 1500, showConfirmButton: false })
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
      Swal.fire({ icon: 'success', title: 'Ticket Aplicado', timer: 2000, showConfirmButton: false })
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
      header: 'Conductor',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.conductor_nombre}</div>
          <div className="text-xs text-gray-500">{row.original.conductor_dni}</div>
        </div>
      )
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
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
      header: 'Estado',
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
  ], [])

  const ticketsFiltrados = useMemo(() => {
    let filtered = tickets
    if (filtroEstado !== 'todos') filtered = filtered.filter(t => t.estado === filtroEstado)
    if (filtroTipo !== 'todos') filtered = filtered.filter(t => t.tipo === filtroTipo)
    return filtered
  }, [tickets, filtroEstado, filtroTipo])

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
        pageSize={20}
        pageSizeOptions={[10, 20, 50, 100]}
      />
    </>
  )
}
