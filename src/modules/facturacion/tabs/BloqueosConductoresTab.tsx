import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'
import {
  Ban,
  Users,
  AlertTriangle,
  DollarSign,
  Clock,
  CheckCircle,
  Eye,
  Filter,
  RefreshCw,
  Settings,
  Unlock
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import { formatCurrency, formatDate } from '../../../types/facturacion.types'

interface ConductorConDeuda {
  id: string
  nombres: string
  apellidos: string
  dni: string
  cuit: string | null
  telefono: string | null
  email: string | null
  estado: string
  bloqueado: boolean
  motivo_bloqueo: string | null
  fecha_bloqueo: string | null
  // Datos de saldo
  saldo_actual: number
  dias_mora: number
  monto_mora_acumulada: number
  // Datos de asignación
  vehiculo_patente: string | null
  tipo_alquiler: string | null
}

export function BloqueosConductoresTab() {
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const [conductores, setConductores] = useState<ConductorConDeuda[]>([])
  const [loading, setLoading] = useState(true)
  const [montoLimite, setMontoLimite] = useState(500000)
  const [diasMoraLimite, setDiasMoraLimite] = useState(14)
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'candidatos' | 'bloqueados'>('candidatos')

  // Filtros Excel
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [conductorSearch, setConductorSearch] = useState('')

  useEffect(() => {
    cargarParametros()
  }, [])

  useEffect(() => {
    if (montoLimite > 0) {
      cargarConductores()
    }
  }, [montoLimite, diasMoraLimite, sedeActualId])

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

  async function cargarParametros() {
    try {
      const { data } = await (supabase
        .from('parametros_sistema') as any)
        .select('clave, valor')
        .eq('modulo', 'facturacion')
        .in('clave', ['bloqueo_monto_limite', 'bloqueo_dias_mora'])

      if (data) {
        (data as any[]).forEach((p: any) => {
          if (p.clave === 'bloqueo_monto_limite') setMontoLimite(parseFloat(p.valor))
          if (p.clave === 'bloqueo_dias_mora') setDiasMoraLimite(parseFloat(p.valor))
        })
      }
    } catch (error) {
      console.error('Error cargando parámetros:', error)
    }
  }

  async function cargarConductores() {
    setLoading(true)
    try {
      // Cargar conductores activos con sus saldos
      const { data: conductoresData, error } = await aplicarFiltroSede(supabase
        .from('conductores')
        .select(`
          id, nombres, apellidos, dni, cuit, telefono, email, estado,
          bloqueado, motivo_bloqueo, fecha_bloqueo
        `))
        .in('estado', ['ACTIVO', 'activo'])

      if (error) throw error

      // Cargar saldos
      const { data: saldosData } = await aplicarFiltroSede(supabase
        .from('saldos_conductores')
        .select('conductor_id, saldo_actual, dias_mora, monto_mora_acumulada'))

      // Cargar asignaciones activas a través de asignaciones_conductores
      const { data: asignacionesData } = await supabase
        .from('asignaciones')
        .select(`
          id,
          horario,
          vehiculos:vehiculo_id(patente),
          asignaciones_conductores(
            conductor_id,
            horario
          )
        `)
        .in('estado', ['activa', 'programado'])

      // Crear mapa de conductor -> asignación
      const asignacionesPorConductor = new Map<string, { patente: string | null; horario: string | null }>()
      for (const asig of (asignacionesData || []) as any[]) {
        const asigConductores = asig.asignaciones_conductores || []
        for (const ac of asigConductores) {
          if (ac.conductor_id && !asignacionesPorConductor.has(ac.conductor_id)) {
            asignacionesPorConductor.set(ac.conductor_id, {
              patente: asig.vehiculos?.patente || null,
              horario: ac.horario || asig.horario || null
            })
          }
        }
      }

      // Mapear datos
      const saldosArr = (saldosData || []) as any[]
      const conductoresMapeados: ConductorConDeuda[] = (conductoresData || []).map((c: any) => {
        const saldo = saldosArr.find((s: any) => s.conductor_id === c.id)
        const asignacion = asignacionesPorConductor.get(c.id)

        return {
          ...c,
          saldo_actual: saldo?.saldo_actual || 0,
          dias_mora: saldo?.dias_mora || 0,
          monto_mora_acumulada: saldo?.monto_mora_acumulada || 0,
          vehiculo_patente: asignacion?.patente || null,
          tipo_alquiler: asignacion?.horario || null
        }
      })

      setConductores(conductoresMapeados)
    } catch (error) {
      console.error('Error cargando conductores:', error)
    } finally {
      setLoading(false)
    }
  }

  async function bloquearConductor(conductor: ConductorConDeuda) {
    const { value: motivo } = await Swal.fire({
      title: 'Bloquear Conductor',
      html: `
        <div class="fact-modal-form">
          <div class="fact-modal-info">
            <p><strong>Conductor:</strong> ${conductor.nombres} ${conductor.apellidos}</p>
            <p><strong>Deuda actual:</strong> ${formatCurrency(conductor.saldo_actual)}</p>
            <p><strong>Días en mora:</strong> ${conductor.dias_mora}</p>
          </div>
          <div class="fact-form-group">
            <label class="fact-form-label">Motivo del bloqueo</label>
            <textarea id="swal-motivo" rows="3" class="fact-form-input" style="resize: none;" placeholder="Ej: Deuda acumulada superior al límite permitido"></textarea>
          </div>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff0033',
      confirmButtonText: 'Bloquear',
      cancelButtonText: 'Cancelar',
      width: 420,
      customClass: {
        popup: 'fact-modal',
        title: 'fact-modal-title',
        htmlContainer: 'fact-modal-content',
        confirmButton: 'fact-btn-confirm',
        cancelButton: 'fact-btn-cancel'
      },
      preConfirm: () => {
        const motivo = (document.getElementById('swal-motivo') as HTMLTextAreaElement).value
        if (!motivo.trim()) {
          Swal.showValidationMessage('Debe indicar un motivo')
          return false
        }
        return motivo
      }
    })

    if (!motivo) return

    try {
      const { data: userData } = await supabase.auth.getUser()

      const { error } = await (supabase
        .from('conductores') as any)
        .update({
          bloqueado: true,
          motivo_bloqueo: motivo,
          fecha_bloqueo: new Date().toISOString(),
          bloqueado_por: userData.user?.id
        })
        .eq('id', conductor.id)

      if (error) throw error

      showSuccess('Conductor Bloqueado', `${conductor.nombres} ${conductor.apellidos} ha sido bloqueado`)

      cargarConductores()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo bloquear el conductor', 'error')
    }
  }

  async function desbloquearConductor(conductor: ConductorConDeuda) {
    const result = await Swal.fire({
      title: 'Desbloquear Conductor',
      html: `
        <div class="fact-modal-form">
          <div class="fact-modal-info">
            <p><strong>Conductor:</strong> ${conductor.nombres} ${conductor.apellidos}</p>
            <p><strong>Motivo bloqueo:</strong> ${conductor.motivo_bloqueo || '-'}</p>
            <p><strong>Deuda actual:</strong> ${formatCurrency(conductor.saldo_actual)}</p>
          </div>
          <div class="fact-modal-warning">
            <strong>Advertencia:</strong> El conductor aún tiene deuda pendiente.
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10B981',
      confirmButtonText: 'Desbloquear',
      cancelButtonText: 'Cancelar',
      width: 420,
      customClass: {
        popup: 'fact-modal',
        title: 'fact-modal-title',
        htmlContainer: 'fact-modal-content',
        confirmButton: 'fact-btn-confirm',
        cancelButton: 'fact-btn-cancel'
      }
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await (supabase
        .from('conductores') as any)
        .update({
          bloqueado: false,
          motivo_bloqueo: null,
          fecha_bloqueo: null,
          bloqueado_por: null
        })
        .eq('id', conductor.id)

      if (error) throw error

      showSuccess('Conductor Desbloqueado')

      cargarConductores()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo desbloquear', 'error')
    }
  }

  function verDetalle(conductor: ConductorConDeuda) {
    Swal.fire({
      title: 'Detalle del Conductor',
      html: `
        <div class="fact-modal-form">
          <table class="fact-modal-table">
            <tr>
              <td class="fact-table-label">Nombre:</td>
              <td class="fact-table-value">${conductor.nombres} ${conductor.apellidos}</td>
            </tr>
            <tr>
              <td class="fact-table-label">DNI:</td>
              <td class="fact-table-value">${conductor.dni}</td>
            </tr>
            <tr>
              <td class="fact-table-label">CUIT:</td>
              <td class="fact-table-value">${conductor.cuit || '-'}</td>
            </tr>
            <tr>
              <td class="fact-table-label">Teléfono:</td>
              <td class="fact-table-value">${conductor.telefono || '-'}</td>
            </tr>
            <tr>
              <td class="fact-table-label">Vehículo:</td>
              <td class="fact-table-value" style="font-family: monospace;">${conductor.vehiculo_patente || '-'}</td>
            </tr>
            <tr>
              <td class="fact-table-label">Tipo:</td>
              <td class="fact-table-value">${conductor.tipo_alquiler || '-'}</td>
            </tr>
            <tr class="fact-table-separator">
              <td class="fact-table-label">Deuda Actual:</td>
              <td class="fact-table-value fact-text-danger">${formatCurrency(conductor.saldo_actual)}</td>
            </tr>
            <tr>
              <td class="fact-table-label">Días en Mora:</td>
              <td class="fact-table-value">${conductor.dias_mora} días</td>
            </tr>
            <tr>
              <td class="fact-table-label">Mora Acumulada:</td>
              <td class="fact-table-value">${formatCurrency(conductor.monto_mora_acumulada)}</td>
            </tr>
          </table>
          ${conductor.bloqueado ? `
            <div class="fact-modal-danger">
              <p style="margin: 0; font-weight: 600;">BLOQUEADO</p>
              <p style="margin: 4px 0 0; font-size: 12px;">Motivo: ${conductor.motivo_bloqueo}</p>
              <p style="margin: 2px 0 0; font-size: 12px;">Fecha: ${conductor.fecha_bloqueo ? formatDate(conductor.fecha_bloqueo) : '-'}</p>
            </div>
          ` : ''}
        </div>
      `,
      width: 450,
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#6B7280',
      customClass: {
        popup: 'fact-modal',
        title: 'fact-modal-title',
        htmlContainer: 'fact-modal-content',
        confirmButton: 'fact-btn-cancel'
      }
    })
  }

  async function configurarParametros() {
    const { value: formValues } = await Swal.fire({
      title: 'Configurar Límites de Bloqueo',
      html: `
        <div class="fact-modal-form">
          <div class="fact-form-group">
            <label class="fact-form-label">Monto límite de deuda (ARS)</label>
            <input id="swal-monto" type="number" class="fact-form-input" value="${montoLimite}">
            <p class="fact-form-hint">Conductores con deuda mayor a este monto aparecerán como candidatos a bloqueo</p>
          </div>
          <div class="fact-form-group">
            <label class="fact-form-label">Días de mora límite</label>
            <input id="swal-dias" type="number" class="fact-form-input" value="${diasMoraLimite}">
            <p class="fact-form-hint">Conductores con más días de mora también aparecerán como candidatos</p>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      width: 400,
      customClass: {
        popup: 'fact-modal',
        title: 'fact-modal-title',
        htmlContainer: 'fact-modal-content',
        confirmButton: 'fact-btn-confirm',
        cancelButton: 'fact-btn-cancel'
      },
      preConfirm: () => ({
        monto: parseFloat((document.getElementById('swal-monto') as HTMLInputElement).value),
        dias: parseInt((document.getElementById('swal-dias') as HTMLInputElement).value)
      })
    })

    if (!formValues) return

    try {
      await (supabase
        .from('parametros_sistema') as any)
        .update({ valor: formValues.monto.toString() })
        .eq('modulo', 'facturacion')
        .eq('clave', 'bloqueo_monto_limite')

      await (supabase
        .from('parametros_sistema') as any)
        .update({ valor: formValues.dias.toString() })
        .eq('modulo', 'facturacion')
        .eq('clave', 'bloqueo_dias_mora')

      setMontoLimite(formValues.monto)
      setDiasMoraLimite(formValues.dias)

      showSuccess('Parámetros Actualizados')
    } catch (error: any) {
      Swal.fire('Error', error.message, 'error')
    }
  }

  // Lista de conductores únicos para filtro
  const conductoresUnicos = useMemo(() =>
    [...new Set(conductores.map(c => `${c.nombres} ${c.apellidos}`))].sort()
  , [conductores])

  const conductoresFiltrados = useMemo(() => {
    if (!conductorSearch) return conductoresUnicos
    return conductoresUnicos.filter(c => c.toLowerCase().includes(conductorSearch.toLowerCase()))
  }, [conductoresUnicos, conductorSearch])

  const toggleConductorFilter = (val: string) => setConductorFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )

  // Filtrar conductores
  const conductoresFiltradosFinal = useMemo(() => {
    return conductores.filter(c => {
      // Filtro por estado
      if (filtroEstado === 'candidatos') {
        // Candidatos: no bloqueados Y (deuda >= límite O días mora >= límite)
        if (c.bloqueado) return false
        if (c.saldo_actual < montoLimite && c.dias_mora < diasMoraLimite) return false
      } else if (filtroEstado === 'bloqueados') {
        if (!c.bloqueado) return false
      }

      // Filtro Excel por nombre
      if (conductorFilter.length > 0) {
        const nombreCompleto = `${c.nombres} ${c.apellidos}`
        if (!conductorFilter.includes(nombreCompleto)) return false
      }

      return true
    })
  }, [conductores, filtroEstado, montoLimite, diasMoraLimite, conductorFilter])

  // Stats
  const stats = useMemo(() => {
    const bloqueados = conductores.filter(c => c.bloqueado).length
    const candidatos = conductores.filter(c =>
      !c.bloqueado && (c.saldo_actual >= montoLimite || c.dias_mora >= diasMoraLimite)
    ).length
    const deudaTotal = conductores
      .filter(c => c.saldo_actual > 0)
      .reduce((sum, c) => sum + c.saldo_actual, 0)
    const deudaBloqueados = conductores
      .filter(c => c.bloqueado)
      .reduce((sum, c) => sum + c.saldo_actual, 0)

    return { bloqueados, candidatos, deudaTotal, deudaBloqueados }
  }, [conductores, montoLimite, diasMoraLimite])

  const columns = useMemo<ColumnDef<ConductorConDeuda>[]>(() => [
    {
      accessorKey: 'nombre',
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
                placeholder="Buscar..."
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
          <div className="font-medium">{row.original.nombres} {row.original.apellidos}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{row.original.dni}</div>
        </div>
      )
    },
    {
      accessorKey: 'vehiculo_patente',
      header: 'Vehículo',
      cell: ({ row }) => (
        <div>
          <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
            {row.original.vehiculo_patente || '-'}
          </span>
          {row.original.tipo_alquiler && (
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
              {row.original.tipo_alquiler}
            </div>
          )}
        </div>
      )
    },
    {
      accessorKey: 'saldo_actual',
      header: 'Deuda',
      cell: ({ row }) => (
        <span className="fact-precio" style={{
          fontWeight: 600,
          color: row.original.saldo_actual >= montoLimite ? '#ff0033' : '#374151'
        }}>
          {formatCurrency(row.original.saldo_actual)}
        </span>
      )
    },
    {
      accessorKey: 'dias_mora',
      header: 'Días Mora',
      cell: ({ row }) => (
        <span style={{
          fontWeight: 500,
          color: row.original.dias_mora >= diasMoraLimite ? '#ff0033' : '#374151'
        }}>
          {row.original.dias_mora} días
        </span>
      )
    },
    {
      accessorKey: 'monto_mora_acumulada',
      header: 'Mora Acum.',
      cell: ({ row }) => (
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {formatCurrency(row.original.monto_mora_acumulada)}
        </span>
      )
    },
    {
      accessorKey: 'bloqueado',
      header: 'Estado',
      cell: ({ row }) => (
        row.original.bloqueado ? (
          <span className="fact-badge fact-badge-red">
            <Ban size={12} /> Bloqueado
          </span>
        ) : row.original.saldo_actual >= montoLimite || row.original.dias_mora >= diasMoraLimite ? (
          <span className="fact-badge fact-badge-yellow">
            <AlertTriangle size={12} /> Candidato
          </span>
        ) : (
          <span className="fact-badge fact-badge-green">
            <CheckCircle size={12} /> Normal
          </span>
        )
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
          {row.original.bloqueado ? (
            <button
              className="fact-table-btn"
              style={{ color: '#10B981' }}
              onClick={() => desbloquearConductor(row.original)}
              title="Desbloquear"
            >
              <Unlock size={14} />
            </button>
          ) : (row.original.saldo_actual >= montoLimite || row.original.dias_mora >= diasMoraLimite) ? (
            <button
              className="fact-table-btn fact-table-btn-delete"
              onClick={() => bloquearConductor(row.original)}
              title="Bloquear"
            >
              <Ban size={14} />
            </button>
          ) : null}
        </div>
      )
    }
  ], [conductorFilter, conductorSearch, conductoresFiltrados, openColumnFilter, montoLimite, diasMoraLimite])

  return (
    <>
      {/* Header */}
      <div className="fact-header">
        <div className="fact-header-left">
          <span className="fact-label">Ver:</span>
          <select
            className="fact-select"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as any)}
          >
            <option value="candidatos">Candidatos a Bloqueo</option>
            <option value="bloqueados">Bloqueados</option>
            <option value="todos">Todos</option>
          </select>

          <span className="fact-label" style={{ marginLeft: '16px' }}>
            Límite: {formatCurrency(montoLimite)} / {diasMoraLimite} días
          </span>
        </div>
        <div className="fact-header-right">
          <button className="fact-btn-secondary" onClick={() => cargarConductores()}>
            <RefreshCw size={14} />
            Actualizar
          </button>
          <button className="fact-btn-secondary" onClick={configurarParametros}>
            <Settings size={14} />
            Configurar Límites
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="fact-stats">
        <div className="fact-stats-grid">
          <div className="fact-stat-card">
            <AlertTriangle size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.candidatos}</span>
              <span className="fact-stat-label">Candidatos a Bloqueo</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <Ban size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.bloqueados}</span>
              <span className="fact-stat-label">Bloqueados</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <DollarSign size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.deudaTotal)}</span>
              <span className="fact-stat-label">Deuda Total</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <Clock size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.deudaBloqueados)}</span>
              <span className="fact-stat-label">Deuda Bloqueados</span>
            </div>
          </div>
        </div>
      </div>

      {/* Info */}
      <div style={{
        padding: '12px 16px',
        background: '#FEF3C7',
        borderRadius: '8px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <AlertTriangle size={16} style={{ color: '#92400E' }} />
        <span style={{ fontSize: '13px', color: '#92400E' }}>
          Se muestran conductores con deuda &ge; <strong>{formatCurrency(montoLimite)}</strong> o &ge; <strong>{diasMoraLimite} días</strong> de mora.
          Puede ajustar estos límites en "Configurar Límites".
        </span>
      </div>

      {/* Tabla */}
      <DataTable
        data={conductoresFiltradosFinal}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar conductor..."
        emptyIcon={<Users size={48} />}
        emptyTitle="Sin conductores en esta categoría"
        emptyDescription={
          filtroEstado === 'candidatos'
            ? 'No hay conductores que superen los límites configurados'
            : filtroEstado === 'bloqueados'
            ? 'No hay conductores bloqueados'
            : 'No hay conductores registrados'
        }
        pageSize={100}
        pageSizeOptions={[10, 20, 50, 100]}
      />
    </>
  )
}
