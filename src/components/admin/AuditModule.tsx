// src/components/admin/AuditModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { LoadingOverlay } from '../ui/LoadingOverlay'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../ui/DataTable/DataTable'
import { History, Eye, Filter, Calendar, User, Database, Monitor, Users } from 'lucide-react'
import Swal from 'sweetalert2'
import './UserManagement.css'
import './AdminStyles.css'

type TabType = 'sistema' | 'usuarios'

interface AuditLog {
  id: string
  tabla: string
  registro_id: string | null
  accion: 'INSERT' | 'UPDATE' | 'DELETE'
  datos_anteriores: Record<string, any> | null
  datos_nuevos: Record<string, any> | null
  campos_modificados: string[] | null
  usuario_id: string | null
  usuario_nombre: string | null
  usuario_email: string | null
  created_at: string
}

// Mapeo de nombres de tablas a español
const TABLA_LABELS: Record<string, string> = {
  conductores: 'Conductores',
  vehiculos: 'Vehículos',
  asignaciones: 'Asignaciones',
  incidencias: 'Incidencias',
  penalidades: 'Penalidades',
  siniestros: 'Siniestros',
  productos: 'Productos',
  inventario: 'Inventario',
  movimientos: 'Movimientos',
  facturacion_conductores: 'Facturación',
  garantias_conductores: 'Garantías',
  conceptos_nomina: 'Conceptos Nómina',
  periodos_facturacion: 'Períodos',
  user_profiles: 'Usuarios',
  roles: 'Roles',
  proveedores: 'Proveedores',
  abonos_conductores: 'Abonos',
  tickets_favor: 'Tickets a Favor'
}

const ACCION_LABELS: Record<string, { label: string; color: string }> = {
  INSERT: { label: 'Creación', color: 'dt-badge-green' },
  UPDATE: { label: 'Modificación', color: 'dt-badge-yellow' },
  DELETE: { label: 'Eliminación', color: 'dt-badge-red' }
}

export function AuditModule() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('usuarios')
  const [tabCounts, setTabCounts] = useState({ sistema: 0, usuarios: 0 })

  // Filtros
  const [filtroTabla, setFiltroTabla] = useState<string>('')
  const [filtroAccion, setFiltroAccion] = useState<string>('')
  const [filtroUsuario, setFiltroUsuario] = useState<string>('')
  const [filtroFechaInicio, setFiltroFechaInicio] = useState<string>('')
  const [filtroFechaFin, setFiltroFechaFin] = useState<string>('')

  // Tablas disponibles
  const tablasDisponibles = Object.keys(TABLA_LABELS)

  useEffect(() => {
    loadLogs()
  }, [filtroTabla, filtroAccion, filtroUsuario, filtroFechaInicio, filtroFechaFin, activeTab])

  // Cargar contadores de pestañas
  useEffect(() => {
    const loadCounts = async () => {
      const [sistemaResult, usuariosResult] = await Promise.all([
        supabase
          .from('audit_log')
          .select('id', { count: 'exact', head: true })
          .or('usuario_nombre.is.null,usuario_nombre.eq.Sistema'),
        supabase
          .from('audit_log')
          .select('id', { count: 'exact', head: true })
          .not('usuario_nombre', 'is', null)
          .neq('usuario_nombre', 'Sistema')
      ])
      setTabCounts({
        sistema: sistemaResult.count || 0,
        usuarios: usuariosResult.count || 0
      })
    }
    loadCounts()
  }, [])

  const loadLogs = async () => {
    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)

      // Filtrar por tipo de log (sistema o usuario)
      if (activeTab === 'sistema') {
        query = query.or('usuario_nombre.is.null,usuario_nombre.eq.Sistema')
      } else {
        query = query.not('usuario_nombre', 'is', null)
          .neq('usuario_nombre', 'Sistema')
      }

      // Aplicar filtros
      if (filtroTabla) {
        query = query.eq('tabla', filtroTabla)
      }
      if (filtroAccion) {
        query = query.eq('accion', filtroAccion)
      }
      if (filtroUsuario) {
        query = query.or(`usuario_nombre.ilike.%${filtroUsuario}%,usuario_email.ilike.%${filtroUsuario}%`)
      }
      if (filtroFechaInicio) {
        query = query.gte('created_at', `${filtroFechaInicio}T00:00:00`)
      }
      if (filtroFechaFin) {
        query = query.lte('created_at', `${filtroFechaFin}T23:59:59`)
      }

      const { data, error: queryError } = await query

      if (queryError) throw queryError
      setLogs(data || [])
    } catch (err: any) {
      console.error('Error cargando logs:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const verDetalle = (log: AuditLog) => {
    let htmlContent = ''

    if (log.accion === 'INSERT') {
      htmlContent = `
        <div style="text-align: left; max-height: 400px; overflow-y: auto;">
          <h4 style="margin-bottom: 12px; color: #10b981;">Datos Creados:</h4>
          <pre style="background: #f3f4f6; padding: 12px; border-radius: 8px; font-size: 12px; overflow-x: auto; white-space: pre-wrap;">${JSON.stringify(log.datos_nuevos, null, 2)}</pre>
        </div>
      `
    } else if (log.accion === 'UPDATE') {
      const camposModificados = log.campos_modificados || []
      const anterior = log.datos_anteriores || {}
      const nuevo = log.datos_nuevos || {}

      let cambiosHtml = '<table style="width: 100%; border-collapse: collapse; font-size: 13px;">'
      cambiosHtml += '<tr style="background: #f3f4f6;"><th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Campo</th><th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Valor Anterior</th><th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Valor Nuevo</th></tr>'

      camposModificados.forEach(campo => {
        const valorAnterior = anterior[campo] !== null && anterior[campo] !== undefined ? String(anterior[campo]) : '-'
        const valorNuevo = nuevo[campo] !== null && nuevo[campo] !== undefined ? String(nuevo[campo]) : '-'
        cambiosHtml += `<tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">${campo}</td><td style="padding: 8px; border: 1px solid #e5e7eb; color: #ef4444; background: #fef2f2;">${valorAnterior.substring(0, 100)}${valorAnterior.length > 100 ? '...' : ''}</td><td style="padding: 8px; border: 1px solid #e5e7eb; color: #10b981; background: #f0fdf4;">${valorNuevo.substring(0, 100)}${valorNuevo.length > 100 ? '...' : ''}</td></tr>`
      })
      cambiosHtml += '</table>'

      htmlContent = `
        <div style="text-align: left; max-height: 400px; overflow-y: auto;">
          <h4 style="margin-bottom: 12px; color: #f59e0b;">Campos Modificados (${camposModificados.length}):</h4>
          ${cambiosHtml}
        </div>
      `
    } else if (log.accion === 'DELETE') {
      htmlContent = `
        <div style="text-align: left; max-height: 400px; overflow-y: auto;">
          <h4 style="margin-bottom: 12px; color: #ef4444;">Datos Eliminados:</h4>
          <pre style="background: #fef2f2; padding: 12px; border-radius: 8px; font-size: 12px; overflow-x: auto; white-space: pre-wrap;">${JSON.stringify(log.datos_anteriores, null, 2)}</pre>
        </div>
      `
    }

    Swal.fire({
      title: `${ACCION_LABELS[log.accion]?.label || log.accion} - ${TABLA_LABELS[log.tabla] || log.tabla}`,
      html: `
        <div style="margin-bottom: 16px; text-align: left; font-size: 13px; color: #666;">
          <p><strong>Registro ID:</strong> ${log.registro_id || 'N/A'}</p>
          <p><strong>Usuario:</strong> ${log.usuario_nombre || 'Sistema'} ${log.usuario_email ? `(${log.usuario_email})` : ''}</p>
          <p><strong>Fecha:</strong> ${new Date(log.created_at).toLocaleString('es-ES')}</p>
        </div>
        ${htmlContent}
      `,
      width: '700px',
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#FF0033'
    })
  }

  const limpiarFiltros = () => {
    setFiltroTabla('')
    setFiltroAccion('')
    setFiltroUsuario('')
    setFiltroFechaInicio('')
    setFiltroFechaFin('')
  }

  // Definir columnas
  const columns = useMemo<ColumnDef<AuditLog, any>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: 'Fecha/Hora',
        cell: ({ getValue }) => {
          const fecha = new Date(getValue() as string)
          return (
            <div className="audit-fecha">
              <span className="audit-fecha-date">{fecha.toLocaleDateString('es-ES')}</span>
              <span className="audit-fecha-time">{fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )
        },
      },
      {
        accessorKey: 'tabla',
        header: 'Módulo',
        cell: ({ getValue }) => (
          <span className="audit-modulo">
            {TABLA_LABELS[getValue() as string] || getValue()}
          </span>
        ),
      },
      {
        accessorKey: 'accion',
        header: 'Acción',
        cell: ({ getValue }) => {
          const accion = getValue() as string
          const config = ACCION_LABELS[accion] || { label: accion, color: 'dt-badge' }
          return (
            <span className={`dt-badge ${config.color}`}>
              {config.label}
            </span>
          )
        },
      },
      {
        accessorKey: 'campos_modificados',
        header: 'Cambios',
        cell: ({ row }) => {
          const log = row.original
          if (log.accion === 'INSERT') {
            return <span className="audit-cambios">Registro nuevo</span>
          } else if (log.accion === 'DELETE') {
            return <span className="audit-cambios">Registro eliminado</span>
          } else if (log.campos_modificados && log.campos_modificados.length > 0) {
            return (
              <span className="audit-cambios" title={log.campos_modificados.join(', ')}>
                {log.campos_modificados.length} campo(s)
              </span>
            )
          }
          return <span className="audit-cambios">-</span>
        },
      },
      {
        accessorKey: 'usuario_nombre',
        header: 'Usuario',
        cell: ({ row }) => (
          <div className="audit-usuario">
            <span className="audit-usuario-nombre">{row.original.usuario_nombre || 'Sistema'}</span>
            {row.original.usuario_email && (
              <span className="audit-usuario-email">{row.original.usuario_email}</span>
            )}
          </div>
        ),
      },
      {
        id: 'acciones',
        header: 'Detalle',
        enableSorting: false,
        cell: ({ row }) => (
          <button
            className="dt-btn-action"
            onClick={() => verDetalle(row.original)}
            title="Ver detalle"
          >
            <Eye size={14} />
          </button>
        ),
      },
    ],
    []
  )

  // Los logs ya vienen filtrados del backend según la pestaña activa
  const filteredLogs = logs


  // Estadísticas basadas en los logs filtrados
  const stats = useMemo(() => {
    const total = filteredLogs.length
    const inserts = filteredLogs.filter(l => l.accion === 'INSERT').length
    const updates = filteredLogs.filter(l => l.accion === 'UPDATE').length
    const deletes = filteredLogs.filter(l => l.accion === 'DELETE').length
    return { total, inserts, updates, deletes }
  }, [filteredLogs])

  return (
    <div className="admin-module">
      <LoadingOverlay show={loading} message="Cargando auditoria..." size="lg" />
      {/* Tabs */}
      <div className="audit-tabs">
        <button
          className={`audit-tab ${activeTab === 'usuarios' ? 'active' : ''}`}
          onClick={() => setActiveTab('usuarios')}
        >
          <Users size={16} />
          Logs de Usuarios
          <span className="tab-count">{tabCounts.usuarios}</span>
        </button>
        <button
          className={`audit-tab ${activeTab === 'sistema' ? 'active' : ''}`}
          onClick={() => setActiveTab('sistema')}
        >
          <Monitor size={16} />
          Logs de Sistema
          <span className="tab-count">{tabCounts.sistema}</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="admin-stats">
        <div className="admin-stats-grid">
          <div className="stat-card">
            <History size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total Registros</span>
            </div>
          </div>
          <div className="stat-card">
            <Database size={18} className="stat-icon" style={{ color: '#10b981' }} />
            <div className="stat-content">
              <span className="stat-value">{stats.inserts}</span>
              <span className="stat-label">Creaciones</span>
            </div>
          </div>
          <div className="stat-card">
            <Database size={18} className="stat-icon" style={{ color: '#f59e0b' }} />
            <div className="stat-content">
              <span className="stat-value">{stats.updates}</span>
              <span className="stat-label">Modificaciones</span>
            </div>
          </div>
          <div className="stat-card">
            <Database size={18} className="stat-icon" style={{ color: '#ef4444' }} />
            <div className="stat-content">
              <span className="stat-value">{stats.deletes}</span>
              <span className="stat-label">Eliminaciones</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="audit-filters">
        <div className="audit-filters-row">
          <div className="audit-filter-group">
            <label><Database size={14} /> Módulo</label>
            <select value={filtroTabla} onChange={(e) => setFiltroTabla(e.target.value)}>
              <option value="">Todos</option>
              {tablasDisponibles.map(tabla => (
                <option key={tabla} value={tabla}>{TABLA_LABELS[tabla]}</option>
              ))}
            </select>
          </div>

          <div className="audit-filter-group">
            <label><Filter size={14} /> Acción</label>
            <select value={filtroAccion} onChange={(e) => setFiltroAccion(e.target.value)}>
              <option value="">Todas</option>
              <option value="INSERT">Creación</option>
              <option value="UPDATE">Modificación</option>
              <option value="DELETE">Eliminación</option>
            </select>
          </div>

          <div className="audit-filter-group">
            <label><User size={14} /> Usuario</label>
            <input
              type="text"
              placeholder="Buscar usuario..."
              value={filtroUsuario}
              onChange={(e) => setFiltroUsuario(e.target.value)}
            />
          </div>

          <div className="audit-filter-group">
            <label><Calendar size={14} /> Desde</label>
            <input
              type="date"
              value={filtroFechaInicio}
              onChange={(e) => setFiltroFechaInicio(e.target.value)}
            />
          </div>

          <div className="audit-filter-group">
            <label><Calendar size={14} /> Hasta</label>
            <input
              type="date"
              value={filtroFechaFin}
              onChange={(e) => setFiltroFechaFin(e.target.value)}
            />
          </div>

          <button className="audit-filter-clear" onClick={limpiarFiltros}>
            Limpiar
          </button>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        data={filteredLogs}
        columns={columns}
        loading={loading}
        error={error}
        searchPlaceholder="Buscar en registros..."
        emptyIcon={<History size={48} />}
        emptyTitle={activeTab === 'usuarios' ? "No hay logs de usuarios" : "No hay logs de sistema"}
        emptyDescription={activeTab === 'usuarios' ? "Las acciones realizadas por usuarios aparecerán aquí" : "Los cambios automáticos del sistema aparecerán aquí"}
        pageSize={100}
        pageSizeOptions={[10, 20, 50, 100]}
      />
    </div>
  )
}
