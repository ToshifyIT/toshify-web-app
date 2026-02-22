import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { History, Eye, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import Swal from 'sweetalert2'

interface VerLogsButtonProps {
  tablas: string[]
  label?: string
}

const ACCION_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  INSERT: { label: 'Creación', bg: '#dcfce7', color: '#166534' },
  UPDATE: { label: 'Modificación', bg: '#fef9c3', color: '#854d0e' },
  DELETE: { label: 'Eliminación', bg: '#fee2e2', color: '#991b1b' },
}

const TABLA_LABELS: Record<string, string> = {
  abonos_conductores: 'Abonos', asignaciones: 'Asignaciones', asignaciones_conductores: 'Asig. Conductores',
  cobros_fraccionados: 'Cobros Fracc.', conceptos_nomina: 'Conceptos', conductores: 'Conductores',
  excesos_kilometraje: 'Excesos Km', facturacion_cabify: 'Fact. Cabify', facturacion_conductores: 'Facturación',
  facturacion_detalle: 'Fact. Detalle', garantias_conductores: 'Garantías', garantias_pagos: 'Garantía Pagos',
  guias_acciones_implementadas: 'Guías Acciones', guias_historial_semanal: 'Guías Historial',
  guias_seguimiento: 'Guías Seguimiento', incidencias: 'Incidencias', inventario: 'Inventario',
  movimientos: 'Movimientos', multas_historico: 'Multas', pagos_conductores: 'Pagos',
  penalidades: 'Penalidades', penalidades_cuotas: 'Pen. Cuotas', penalidades_rechazos: 'Pen. Rechazos',
  periodos_facturacion: 'Períodos', saldos_conductores: 'Saldos', siniestros: 'Siniestros',
  siniestros_seguimientos: 'Sin. Seguimiento', telepase_control: 'Telepase', telepase_historico: 'Telepase Hist.',
  tickets_favor: 'Tickets Favor', vehiculos: 'Vehículos', vehiculo_control: 'Veh. Control',
  user_profiles: 'Usuarios', roles: 'Roles',
}

interface LogRow {
  id: string
  tabla: string
  registro_id: string | null
  accion: string
  campos_modificados: string[] | null
  usuario_nombre: string | null
  usuario_email: string | null
  created_at: string
}

const PAGE_SIZE = 50

export function VerLogsButton({ tablas, label }: VerLogsButtonProps) {
  const { isAdmin } = usePermissions()
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const modalRef = useRef<HTMLDivElement>(null)

  if (!isAdmin()) return null

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const loadLogs = async (p: number) => {
    setLoading(true)
    try {
      const from = p * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data, count } = await supabase
        .from('audit_log')
        .select('id, tabla, registro_id, accion, campos_modificados, usuario_nombre, usuario_email, created_at', { count: 'exact' })
        .in('tabla', tablas)
        .order('created_at', { ascending: false })
        .range(from, to)
      setLogs(data || [])
      setTotal(count || 0)
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  const handleOpen = () => {
    setOpen(true)
    setPage(0)
    loadLogs(0)
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    loadLogs(newPage)
  }

  const verDetalle = async (log: LogRow) => {
    const { data } = await supabase
      .from('audit_log')
      .select('datos_anteriores, datos_nuevos')
      .eq('id', log.id)
      .single()

    const anterior = data?.datos_anteriores as Record<string, unknown> | null
    const nuevo = data?.datos_nuevos as Record<string, unknown> | null
    let html = ''

    if (log.accion === 'INSERT') {
      html = `<div style="text-align:left;max-height:400px;overflow-y:auto"><h4 style="color:#10b981;margin-bottom:8px">Datos Creados:</h4><pre style="background:#f3f4f6;padding:12px;border-radius:8px;font-size:11px;white-space:pre-wrap">${JSON.stringify(nuevo, null, 2)}</pre></div>`
    } else if (log.accion === 'DELETE') {
      html = `<div style="text-align:left;max-height:400px;overflow-y:auto"><h4 style="color:#ef4444;margin-bottom:8px">Datos Eliminados:</h4><pre style="background:#fef2f2;padding:12px;border-radius:8px;font-size:11px;white-space:pre-wrap">${JSON.stringify(anterior, null, 2)}</pre></div>`
    } else {
      const campos = log.campos_modificados || []
      let rows = ''
      campos.forEach(c => {
        const va = anterior?.[c] != null ? String(anterior[c]).substring(0, 80) : '-'
        const vn = nuevo?.[c] != null ? String(nuevo[c]).substring(0, 80) : '-'
        rows += `<tr><td style="padding:6px 8px;border:1px solid #e5e7eb;font-weight:600;font-size:12px">${c}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;color:#ef4444;background:#fef2f2;font-size:12px">${va}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;color:#10b981;background:#f0fdf4;font-size:12px">${vn}</td></tr>`
      })
      html = `<div style="text-align:left;max-height:400px;overflow-y:auto"><table style="width:100%;border-collapse:collapse"><tr style="background:#f3f4f6"><th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb;font-size:12px">Campo</th><th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb;font-size:12px">Anterior</th><th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb;font-size:12px">Nuevo</th></tr>${rows}</table></div>`
    }

    Swal.fire({
      title: `${ACCION_CONFIG[log.accion]?.label || log.accion} - ${TABLA_LABELS[log.tabla] || log.tabla}`,
      html: `<div style="text-align:left;font-size:13px;color:#666;margin-bottom:12px"><p><strong>ID:</strong> ${log.registro_id || 'N/A'}</p><p><strong>Usuario:</strong> ${log.usuario_nombre || 'Sistema'}</p><p><strong>Fecha:</strong> ${new Date(log.created_at).toLocaleString('es-ES')}</p></div>${html}`,
      width: '650px', confirmButtonText: 'Cerrar', confirmButtonColor: '#ff0033',
    })
  }

  const formatDate = (d: string) => {
    const f = new Date(d)
    return `${f.toLocaleDateString('es-ES')} ${f.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
  }

  const moduleName = label || tablas.map(t => TABLA_LABELS[t] || t).join(', ')

  return (
    <>
      <button
        onClick={handleOpen}
        title="Ver logs de auditoría"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
          border: '1px solid var(--border-primary)', background: 'var(--bg-primary)',
          color: 'var(--text-secondary)', cursor: 'pointer',
        }}
      >
        <History size={14} />
        Ver Logs
      </button>

      {open && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div
            ref={modalRef}
            style={{
              background: 'var(--bg-primary)', borderRadius: '12px', width: '90%', maxWidth: '900px',
              maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid var(--border-primary)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <History size={18} style={{ color: '#ff0033' }} />
                <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>
                  Logs - {moduleName}
                </span>
                <span style={{
                  fontSize: '11px', background: 'rgba(255,0,51,0.08)', color: '#ff0033',
                  padding: '2px 8px', borderRadius: '10px', fontWeight: 600,
                }}>
                  {total.toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
              {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando...</div>
              ) : logs.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Sin registros</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Fecha</th>
                      {tablas.length > 1 && (
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Tabla</th>
                      )}
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Acción</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Cambios</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Usuario</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => {
                      const accion = ACCION_CONFIG[log.accion] || { label: log.accion, bg: '#f3f4f6', color: '#374151' }
                      return (
                        <tr key={log.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '12px' }}>
                            {formatDate(log.created_at)}
                          </td>
                          {tablas.length > 1 && (
                            <td style={{ padding: '8px 12px', fontSize: '12px' }}>
                              {TABLA_LABELS[log.tabla] || log.tabla}
                            </td>
                          )}
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{
                              display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                              background: accion.bg, color: accion.color,
                            }}>
                              {accion.label}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {log.accion === 'INSERT' ? 'Registro nuevo' : log.accion === 'DELETE' ? 'Eliminado' : log.campos_modificados ? `${log.campos_modificados.length} campo(s)` : '-'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 500 }}>{log.usuario_nombre || 'Sistema'}</div>
                            {log.usuario_email && <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{log.usuario_email}</div>}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                            <button
                              onClick={() => verDetalle(log)}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                                color: 'var(--text-secondary)', borderRadius: '4px',
                              }}
                              title="Ver detalle"
                            >
                              <Eye size={14} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer / Pagination */}
            {total > PAGE_SIZE && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                padding: '12px 20px', borderTop: '1px solid var(--border-primary)', fontSize: '12px',
                color: 'var(--text-secondary)',
              }}>
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 0}
                  style={{
                    padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-primary)',
                    background: 'var(--bg-primary)', cursor: page === 0 ? 'not-allowed' : 'pointer',
                    opacity: page === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: '4px',
                    color: 'var(--text-primary)',
                  }}
                >
                  <ChevronLeft size={12} /> Anterior
                </button>
                <span>Pág. {page + 1} de {totalPages}</span>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages - 1}
                  style={{
                    padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-primary)',
                    background: 'var(--bg-primary)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                    opacity: page >= totalPages - 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: '4px',
                    color: 'var(--text-primary)',
                  }}
                >
                  Siguiente <ChevronRight size={12} />
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
