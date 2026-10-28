// src/components/admin/AuditModule.tsx
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { LoadingOverlay } from '../ui/LoadingOverlay'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../ui/DataTable/DataTable'
import { History, Eye, Monitor, Calendar, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import Swal from 'sweetalert2'
import { detalleLegible } from './auditoriaDetalle'
import './UserManagement.css'
import './AdminStyles.css'

type TabType = 'sistema' | 'usuarios'

interface AuditLog {
  id: string
  tabla: string
  registro_id: string | null
  accion: 'INSERT' | 'UPDATE' | 'DELETE'
  datos_anteriores?: Record<string, unknown> | null
  datos_nuevos?: Record<string, unknown> | null
  campos_modificados: string[] | null
  usuario_id: string | null
  usuario_nombre: string | null
  usuario_email: string | null
  created_at: string
}

// Mapeo de nombres de tablas a español
const TABLA_LABELS: Record<string, string> = {
  abonos_conductores: 'Abonos',
  asignaciones: 'Asignaciones',
  asignaciones_conductores: 'Asignaciones Conductores',
  cabify_historico: 'Cabify Histórico',
  cabify_sync_log: 'Cabify Sync',
  cobros_fraccionados: 'Cobros Fraccionados',
  conceptos_nomina: 'Conceptos Nómina',
  conductores: 'Conductores',
  conductores_semana_facturacion: 'Semana Facturación',
  devoluciones: 'Devoluciones',
  excesos_kilometraje: 'Excesos Km',
  facturacion_cabify: 'Facturación Cabify',
  facturacion_conductores: 'Facturación',
  facturacion_detalle: 'Facturación Detalle',
  garantias_conductores: 'Garantías',
  garantias_pagos: 'Garantía Pagos',
  guias_acciones_implementadas: 'Guías Acciones',
  guias_historial_semanal: 'Guías Historial',
  guias_seguimiento: 'Guías Seguimiento',
  incidencias: 'Incidencias',
  inventario: 'Inventario',
  menus: 'Menús',
  movimientos: 'Movimientos',
  multas_historico: 'Multas',
  pagos_conductores: 'Pagos Conductores',
  penalidades: 'Penalidades',
  penalidades_cuotas: 'Penalidades Cuotas',
  penalidades_rechazos: 'Penalidades Rechazos',
  periodos_facturacion: 'Períodos',
  productos: 'Productos',
  proveedores: 'Proveedores',
  roles: 'Roles',
  role_menu_permissions: 'Permisos Menú',
  role_submenu_permissions: 'Permisos Submenú',
  role_tab_permissions: 'Permisos Pestaña',
  saldos_conductores: 'Saldos',
  sedes: 'Sedes',
  siniestros: 'Siniestros',
  siniestros_seguimientos: 'Siniestros Seguimiento',
  submenus: 'Submenús',
  telepase_control: 'Telepase Control',
  telepase_historico: 'Telepase Histórico',
  tickets_favor: 'Tickets a Favor',
  tipos_cobro_descuento: 'Tipos Cobro/Descuento',
  user_profiles: 'Usuarios',
  uss_sync_log: 'USS Sync',
  vehiculos: 'Vehículos',
  wialon_bitacora: 'Wialon Bitácora',
  wialon_bitacora_sync_log: 'Wialon Sync',
}

const ACCION_LABELS: Record<string, { label: string; color: string }> = {
  INSERT: { label: 'Creación', color: 'dt-badge-green' },
  UPDATE: { label: 'Modificación', color: 'dt-badge-yellow' },
  DELETE: { label: 'Eliminación', color: 'dt-badge-red' }
}

const PAGE_SIZE = 100

// Tablas con mucho movimiento automático (sincronizaciones, históricos): se ocultan
// con "Solo lo importante" para que la consulta sea rápida y se vea lo que hace la gente.
const TABLAS_RUIDO = [
  'cabify_historico', 'cabify_sync_log', 'uss_sync_log', 'wialon_bitacora',
  'wialon_bitacora_sync_log', 'telepase_historico', 'conductores_semana_facturacion',
  'facturacion_detalle', 'facturacion_cabify',
]

type Periodo = 'hora' | 'hoy' | '7d' | 'rango'

const PERIODO_LABELS: Record<Periodo, string> = {
  hora: 'Última hora',
  hoy: 'Hoy',
  '7d': 'Últimos 7 días',
  rango: 'Elegir fechas',
}

interface ResumenUsuario {
  nombre: string
  email: string | null
  total: number
  creaciones: number
  modificaciones: number
  eliminaciones: number
  modulos: [string, number][]
  ultima: string
}

// Helper: fecha hace N días en formato yyyy-MM-dd
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

export function AuditModule() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('usuarios')
  const [tabCounts, setTabCounts] = useState({ sistema: 0, usuarios: 0 })
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)

  // Período: por defecto la última hora (carga rápido); se puede ampliar
  const [periodo, setPeriodo] = useState<Periodo>('hora')
  const [desdeCalculado, setDesdeCalculado] = useState<string>(() => new Date(Date.now() - 3600_000).toISOString())
  const [soloImportantes, setSoloImportantes] = useState(true)
  const [resumen, setResumen] = useState<ResumenUsuario[]>([])
  const [cargandoResumen, setCargandoResumen] = useState(false)

  // Filtros
  const [filtroTabla, setFiltroTabla] = useState<string>('')
  const [filtroAccion, setFiltroAccion] = useState<string>('')
  const [filtroUsuario, setFiltroUsuario] = useState<string>('')
  const [filtroUsuarioDebounced, setFiltroUsuarioDebounced] = useState<string>('')
  const [filtroFechaInicio, setFiltroFechaInicio] = useState<string>(daysAgo(7))
  const [filtroFechaFin, setFiltroFechaFin] = useState<string>('')

  // Tablas para el filtro (lista fija: consultarlas a la base hacía lenta la pantalla)
  const tablasDisponibles = useMemo(
    () => Object.keys(TABLA_LABELS).filter(t => !soloImportantes || !TABLAS_RUIDO.includes(t)),
    [soloImportantes],
  )

  // Rango efectivo de la consulta (ISO)
  const desdeISO = periodo === 'rango'
    ? (filtroFechaInicio ? `${filtroFechaInicio}T00:00:00` : `${daysAgo(7)}T00:00:00`)
    : desdeCalculado
  const hastaISO = periodo === 'rango' && filtroFechaFin ? `${filtroFechaFin}T23:59:59` : null

  const elegirPeriodo = (p: Periodo) => {
    setPeriodo(p)
    if (p === 'hora') setDesdeCalculado(new Date(Date.now() - 3600_000).toISOString())
    if (p === 'hoy') {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      setDesdeCalculado(d.toISOString())
    }
    if (p === '7d') setDesdeCalculado(`${daysAgo(7)}T00:00:00`)
  }

  // Debounce para filtro usuario
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setFiltroUsuarioDebounced(filtroUsuario)
    }, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [filtroUsuario])

  // Reset page al cambiar filtros
  useEffect(() => {
    setPage(0)
  }, [filtroTabla, filtroAccion, filtroUsuarioDebounced, desdeISO, hastaISO, soloImportantes, activeTab])

  useEffect(() => {
    loadLogs()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTabla, filtroAccion, filtroUsuarioDebounced, desdeISO, hastaISO, soloImportantes, activeTab, page])

  // Contadores de pestañas (mismo período y mismo criterio de "importantes")
  useEffect(() => {
    const loadCounts = async () => {
      const base = () => {
        let q = supabase.from('audit_log').select('id', { count: 'exact', head: true }).gte('created_at', desdeISO)
        if (hastaISO) q = q.lte('created_at', hastaISO)
        if (soloImportantes) q = q.not('tabla', 'in', `(${TABLAS_RUIDO.join(',')})`)
        return q
      }
      const [sistemaResult, usuariosResult] = await Promise.all([
        base().or('usuario_nombre.is.null,usuario_nombre.eq.Sistema'),
        base().not('usuario_nombre', 'is', null).neq('usuario_nombre', 'Sistema'),
      ])
      setTabCounts({
        sistema: sistemaResult.count || 0,
        usuarios: usuariosResult.count || 0
      })
    }
    loadCounts()
  }, [desdeISO, hastaISO, soloImportantes])

  // Resumen de actividad por usuario (qué hizo cada uno en el período)
  useEffect(() => {
    if (activeTab !== 'usuarios') return
    let activo = true
    const cargar = async () => {
      setCargandoResumen(true)
      try {
        let q = supabase
          .from('audit_log')
          .select('usuario_nombre, usuario_email, tabla, accion, created_at')
          .not('usuario_nombre', 'is', null)
          .neq('usuario_nombre', 'Sistema')
          .gte('created_at', desdeISO)
          .order('created_at', { ascending: false })
          .limit(5000)
        if (hastaISO) q = q.lte('created_at', hastaISO)
        if (soloImportantes) q = q.not('tabla', 'in', `(${TABLAS_RUIDO.join(',')})`)
        const { data, error: e } = await q
        if (e) throw e
        const mapa = new Map<string, ResumenUsuario & { porModulo: Map<string, number> }>()
        for (const l of (data || []) as Pick<AuditLog, 'usuario_nombre' | 'usuario_email' | 'tabla' | 'accion' | 'created_at'>[]) {
          const nombre = l.usuario_nombre || 'Sin nombre'
          const u = mapa.get(nombre) ?? {
            nombre, email: l.usuario_email, total: 0, creaciones: 0, modificaciones: 0, eliminaciones: 0,
            modulos: [], ultima: l.created_at, porModulo: new Map<string, number>(),
          }
          u.total++
          if (l.accion === 'INSERT') u.creaciones++
          else if (l.accion === 'UPDATE') u.modificaciones++
          else if (l.accion === 'DELETE') u.eliminaciones++
          const mod = TABLA_LABELS[l.tabla] || l.tabla
          u.porModulo.set(mod, (u.porModulo.get(mod) || 0) + 1)
          if (l.created_at > u.ultima) u.ultima = l.created_at
          mapa.set(nombre, u)
        }
        const lista = [...mapa.values()]
          .map(({ porModulo, ...u }) => ({ ...u, modulos: [...porModulo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3) }))
          .sort((a, b) => b.total - a.total)
        if (activo) setResumen(lista)
      } catch (err) {
        console.error('[Auditoría] Error cargando el resumen por usuario', err)
        if (activo) setResumen([])
      } finally {
        if (activo) setCargandoResumen(false)
      }
    }
    cargar()
    return () => { activo = false }
  }, [activeTab, desdeISO, hastaISO, soloImportantes])

  const buildQuery = useCallback(() => {
    // Select solo columnas livianas (sin datos_anteriores/datos_nuevos que son JSONB pesados)
    let query = supabase
      .from('audit_log')
      .select('id, tabla, registro_id, accion, campos_modificados, usuario_id, usuario_nombre, usuario_email, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })

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
    if (filtroUsuarioDebounced) {
      query = query.or(`usuario_nombre.ilike.%${filtroUsuarioDebounced}%,usuario_email.ilike.%${filtroUsuarioDebounced}%`)
    }
    query = query.gte('created_at', desdeISO)
    if (hastaISO) {
      query = query.lte('created_at', hastaISO)
    }
    if (soloImportantes) {
      query = query.not('tabla', 'in', `(${TABLAS_RUIDO.join(',')})`)
    }

    return query
  }, [activeTab, filtroTabla, filtroAccion, filtroUsuarioDebounced, desdeISO, hastaISO, soloImportantes])

  const loadLogs = async () => {
    setLoading(true)
    setError(null)

    try {
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const query = buildQuery().range(from, to)
      const { data, error: queryError, count } = await query

      if (queryError) throw queryError
      setLogs(data || [])
      setTotalCount(count || 0)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const verDetalle = async (log: AuditLog) => {
    // Cargar datos completos (incluyendo JSONB) solo para este registro
    const { data: fullLog } = await supabase
      .from('audit_log')
      .select('datos_anteriores, datos_nuevos')
      .eq('id', log.id)
      .single()

    const html = await detalleLegible({
      accion: log.accion,
      modulo: TABLA_LABELS[log.tabla] || log.tabla,
      usuario: log.usuario_nombre || 'Sistema',
      fecha: log.created_at,
      anteriores: (fullLog?.datos_anteriores as Record<string, unknown> | null) ?? null,
      nuevos: (fullLog?.datos_nuevos as Record<string, unknown> | null) ?? null,
      campos: log.campos_modificados,
    })

    Swal.fire({
      title: `${ACCION_LABELS[log.accion]?.label || log.accion} · ${TABLA_LABELS[log.tabla] || log.tabla}`,
      html,
      width: '640px',
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#FF0033'
    })
  }

  const limpiarFiltros = () => {
    setFiltroTabla('')
    setFiltroAccion('')
    setFiltroUsuario('')
    setFiltroUsuarioDebounced('')
    setFiltroFechaInicio(daysAgo(7))
    setFiltroFechaFin('')
    elegirPeriodo('hora')
  }

  // Paginación
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const canPrev = page > 0
  const canNext = page < totalPages - 1

  // Definir columnas
  const columns = useMemo<ColumnDef<AuditLog, unknown>[]>(
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
            {TABLA_LABELS[getValue() as string] || getValue() as string}
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

  // Estadísticas basadas en los logs cargados
  const stats = useMemo(() => {
    const inserts = logs.filter(l => l.accion === 'INSERT').length
    const updates = logs.filter(l => l.accion === 'UPDATE').length
    const deletes = logs.filter(l => l.accion === 'DELETE').length
    return { total: totalCount, inserts, updates, deletes }
  }, [logs, totalCount])

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

      {/* Filtros */}
      <div className="audit-filters">
        <div className="audit-filters-row">
          <div className="audit-filter-group">
            <select value={filtroTabla} onChange={(e) => setFiltroTabla(e.target.value)}>
              <option value="">Todos los módulos</option>
              {tablasDisponibles.map(tabla => (
                <option key={tabla} value={tabla}>{TABLA_LABELS[tabla] || tabla}</option>
              ))}
            </select>
          </div>

          <div className="audit-filter-group">
            <select value={filtroAccion} onChange={(e) => setFiltroAccion(e.target.value)}>
              <option value="">Todas las acciones</option>
              <option value="INSERT">Creación</option>
              <option value="UPDATE">Modificación</option>
              <option value="DELETE">Eliminación</option>
            </select>
          </div>

          <div className="audit-filter-group">
            <input
              type="text"
              placeholder="Buscar usuario..."
              value={filtroUsuario}
              onChange={(e) => setFiltroUsuario(e.target.value)}
            />
          </div>

          <div className="audit-filter-group">
            <select value={periodo} onChange={(e) => elegirPeriodo(e.target.value as Periodo)}>
              {(Object.keys(PERIODO_LABELS) as Periodo[]).map(p => (
                <option key={p} value={p}>{PERIODO_LABELS[p]}</option>
              ))}
            </select>
          </div>

          {periodo === 'rango' && (<>
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
          </>)}

          <label className="audit-importantes" title="Oculta sincronizaciones e históricos automáticos">
            <input type="checkbox" checked={soloImportantes} onChange={(e) => setSoloImportantes(e.target.checked)} />
            Solo lo importante
          </label>

          <button className="audit-filter-clear" onClick={limpiarFiltros}>
            Limpiar
          </button>
        </div>

        {/* Resumen del período y actividad por usuario (una línea) */}
        <div className="audit-resumen-linea">
          <span className="audit-resumen-totales">
            <History size={14} />
            <strong>{stats.total.toLocaleString()}</strong> registros
            {stats.inserts ? <> · {stats.inserts} creaciones</> : null}
            {stats.updates ? <> · {stats.updates} modificaciones</> : null}
            {stats.deletes ? <> · {stats.deletes} eliminaciones</> : null}
          </span>
          {activeTab === 'usuarios' && (
            <div className="audit-resumen-chips">
              {cargandoResumen ? <span className="audit-resumen-muted">cargando…</span> : null}
              {!cargandoResumen && resumen.length === 0 ? <span className="audit-resumen-muted">Nadie hizo cambios en este período.</span> : null}
              {resumen.map(u => (
                <button
                  key={u.nombre}
                  type="button"
                  className={`audit-chip${filtroUsuario === u.nombre ? ' activo' : ''}`}
                  onClick={() => setFiltroUsuario(filtroUsuario === u.nombre ? '' : u.nombre)}
                  title={`${u.modulos.map(([m, n]) => `${m} (${n})`).join(' · ')}\nÚltimo cambio: ${new Date(u.ultima).toLocaleString('es-AR')}\nClick para ver solo sus cambios`}
                >
                  <span className="audit-chip-nombre">{u.nombre}</span>
                  <span className="audit-chip-total">{u.total}</span>
                  <span className="audit-chip-det">
                    {[u.creaciones ? `${u.creaciones} creó` : '', u.modificaciones ? `${u.modificaciones} modif.` : '', u.eliminaciones ? `${u.eliminaciones} elim.` : ''].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        data={logs}
        columns={columns}
        loading={loading}
        error={error}
        searchPlaceholder="Buscar en registros..."
        emptyIcon={<History size={48}
      />}
        emptyTitle={activeTab === 'usuarios' ? 'No hay logs de usuarios' : 'No hay logs de sistema'}
        emptyDescription={activeTab === 'usuarios' ? 'Las acciones realizadas por usuarios aparecerán aquí' : 'Los cambios automáticos del sistema aparecerán aquí'}
        pageSize={PAGE_SIZE}
        pageSizeOptions={[PAGE_SIZE]}
      />

      {/* Paginación servidor */}
      {totalCount > PAGE_SIZE && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
          padding: '12px 0', fontSize: '13px', color: 'var(--text-secondary)',
        }}>
          <button
            onClick={() => setPage(p => p - 1)}
            disabled={!canPrev}
            style={{
              padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-primary)',
              background: canPrev ? 'var(--bg-primary)' : 'var(--bg-secondary)',
              cursor: canPrev ? 'pointer' : 'not-allowed', color: 'var(--text-primary)',
              display: 'flex', alignItems: 'center', gap: '4px', opacity: canPrev ? 1 : 0.4,
            }}
          >
            <ChevronLeft size={14} /> Anterior
          </button>
          <span>
            Página <strong>{page + 1}</strong> de <strong>{totalPages}</strong>
            {' '}({totalCount.toLocaleString()} registros)
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={!canNext}
            style={{
              padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-primary)',
              background: canNext ? 'var(--bg-primary)' : 'var(--bg-secondary)',
              cursor: canNext ? 'pointer' : 'not-allowed', color: 'var(--text-primary)',
              display: 'flex', alignItems: 'center', gap: '4px', opacity: canNext ? 1 : 0.4,
            }}
          >
            Siguiente <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
