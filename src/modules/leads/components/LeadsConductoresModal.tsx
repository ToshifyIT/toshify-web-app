// src/modules/leads/components/LeadsConductoresModal.tsx
//
// Vista de conciliación Lead ↔ Conductor. SOLO LECTURA.
//
// Contexto: la conversión de lead a conductor no guarda ninguna FK entre ambas
// tablas (ver LeadsModule.handleConvertir). Lo unico que escribe es
// estado_de_lead='Conductor' + proceso='Convertido'. Por eso, cuando un conductor
// se creo a mano (sin pasar por la conversion), el lead queda "huerfano": existe
// el conductor, pero el lead nunca cambio de estado.
//
// Este modal cruza leads y conductores POR DOCUMENTO, replicando la misma
// normalizacion que usa handleConvertir, y clasifica en dos grupos:
//   - convertido:  estado_de_lead === 'Conductor'
//   - huerfano:    estado_de_lead !== 'Conductor' pero hay un conductor que matchea
//
// La deteccion de huerfanos es HEURISTICA: depende de que el lead tenga DNI o
// CUIT cargado. Un lead sin documento no puede vincularse aunque su conductor exista.

import { useEffect, useMemo, useState } from 'react'
import { X, Search, Link2, AlertTriangle, Check } from 'lucide-react'
import Swal from 'sweetalert2'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { showSuccess } from '../../../utils/toast'

interface LeadFila {
  id: string
  nombre_completo: string | null
  dni: string | null
  cuit: string | null
  estado_de_lead: string | null
  proceso: string | null
  fecha_convertido: string | null
  created_at: string | null
}

interface ConductorFila {
  id: string
  nombres: string | null
  apellidos: string | null
  numero_dni: string | null
  numero_cuit: string | null
}

type Situacion = 'convertido' | 'huerfano'

interface FilaConciliacion {
  leadId: string
  leadNombre: string
  documento: string
  estadoLead: string
  situacion: Situacion
  conductorNombre: string | null
  conductorDni: string | null
  conductorCuit: string | null
  fechaConvertido: string | null
}

/** Misma normalizacion que handleConvertir: sin espacios ni guiones. */
const normalizarDoc = (val: string) => (val || '').replace(/[\s-]/g, '')

function fmtFecha(v: string | null): string {
  if (!v) return '-'
  const d = new Date(v)
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('es-AR')
}

export function LeadsConductoresModal({ onClose, onActualizado }: { onClose: () => void; onActualizado?: () => void }) {
  const { profile } = useAuth()
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [filas, setFilas] = useState<FilaConciliacion[]>([])
  const [vista, setVista] = useState<Situacion>('convertido')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      try {
        // Sin filtro de sede ni de proceso: la vista de conciliacion necesita
        // ver TODO, incluidos los leads ya convertidos (que loadLeads excluye).
        const [leadsRes, condRes] = await Promise.all([
          (supabase.from('leads') as any)
            .select('id, nombre_completo, dni, cuit, estado_de_lead, proceso, fecha_convertido, created_at')
            .limit(20000),
          (supabase.from('conductores') as any)
            .select('id, nombres, apellidos, numero_dni, numero_cuit')
            .limit(20000),
        ])
        if (leadsRes.error) throw leadsRes.error
        if (condRes.error) throw condRes.error
        if (cancelado) return

        const leads = (leadsRes.data || []) as LeadFila[]
        const conductores = (condRes.data || []) as ConductorFila[]

        // Indice de conductores por documento normalizado (DNI y CUIT).
        const porDoc = new Map<string, ConductorFila>()
        for (const c of conductores) {
          const nombre = c
          for (const doc of [c.numero_dni, c.numero_cuit]) {
            const k = normalizarDoc(String(doc || ''))
            if (k && !porDoc.has(k)) porDoc.set(k, nombre)
          }
        }

        const buscarConductor = (dni: string, cuit: string): ConductorFila | null => {
          if (dni && porDoc.has(dni)) return porDoc.get(dni)!
          if (cuit && porDoc.has(cuit)) return porDoc.get(cuit)!
          // El DNI suele estar contenido dentro del CUIT (prefijo + DNI + verificador).
          if (dni) {
            for (const [k, c] of porDoc) {
              if (k.length > dni.length && k.includes(dni)) return c
            }
          }
          return null
        }

        const resultado: FilaConciliacion[] = []
        for (const l of leads) {
          const dni = normalizarDoc(String(l.dni || ''))
          const cuit = normalizarDoc(String(l.cuit || ''))
          const esConvertido = l.estado_de_lead === 'Conductor'
          const cond = (dni || cuit) ? buscarConductor(dni, cuit) : null

          // Ambas pestañas exigen que exista el conductor en la tabla: un lead
          // marcado como convertido pero sin conductor real no pertenece a
          // ninguno de los dos grupos (seria otra inconsistencia distinta).
          if (!cond) continue

          resultado.push({
            leadId: l.id,
            leadNombre: l.nombre_completo || 'Sin nombre',
            documento: l.dni || l.cuit || '-',
            estadoLead: l.estado_de_lead || '-',
            situacion: esConvertido ? 'convertido' : 'huerfano',
            conductorNombre: cond ? `${cond.nombres || ''} ${cond.apellidos || ''}`.trim() || '-' : null,
            conductorDni: cond?.numero_dni || null,
            conductorCuit: cond?.numero_cuit || null,
            fechaConvertido: l.fecha_convertido,
          })
        }
        resultado.sort((a, b) => a.leadNombre.localeCompare(b.leadNombre))
        setFilas(resultado)
      } catch (e: any) {
        if (!cancelado) setError(e?.message || 'No se pudo cargar la conciliación')
      } finally {
        if (!cancelado) setCargando(false)
      }
    })()
    return () => { cancelado = true }
  }, [])

  /** Marca el lead como convertido, escribiendo los MISMOS campos que
   *  LeadsModule.handleConvertir. No crea ni modifica el conductor: la relacion
   *  no se persiste porque no existe una FK entre ambas tablas. */
  async function marcarConvertido(f: FilaConciliacion) {
    const res = await Swal.fire({
      title: '<span style="font-size:16px;font-weight:600;">Marcar lead como convertido</span>',
      html: `
        <div style="text-align:left;font-size:13px;">
          <div style="background:#FEF9C3;border:1px solid #FDE68A;padding:8px 10px;border-radius:6px;margin-bottom:12px;font-size:11px;color:#854D0E;">
            El vínculo se detectó por documento, no está guardado en la base.
            Verificá que el lead y el conductor sean la misma persona antes de continuar.
          </div>
          <div style="background:#F3F4F6;padding:10px 12px;border-radius:6px;margin-bottom:8px;">
            <div style="font-size:10px;text-transform:uppercase;color:#6B7280;font-weight:600;">Lead</div>
            <div style="font-weight:600;">${f.leadNombre}</div>
            <div style="font-size:11px;color:#6B7280;">Doc: ${f.documento} · Estado actual: ${f.estadoLead}</div>
          </div>
          <div style="background:#F3F4F6;padding:10px 12px;border-radius:6px;">
            <div style="font-size:10px;text-transform:uppercase;color:#6B7280;font-weight:600;">Conductor</div>
            <div style="font-weight:600;">${f.conductorNombre || '-'}</div>
            <div style="font-size:11px;color:#6B7280;">DNI: ${f.conductorDni || '-'} · CUIT: ${f.conductorCuit || '-'}</div>
          </div>
          <p style="margin-top:12px;font-size:12px;color:#374151;">
            El lead pasará al estado <strong>Conductor</strong>. No se modifica el conductor.
          </p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Marcar como convertido',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      width: 460,
    })
    if (!res.isConfirmed) return

    setGuardandoId(f.leadId)
    try {
      const { error } = await (supabase.from('leads') as any).update({
        proceso: 'Convertido',
        estado_de_lead: 'Conductor',
        fecha_convertido: new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).replace(' ', 'T'),
        usuario: profile?.full_name || 'Sistema',
      }).eq('id', f.leadId)
      if (error) throw error

      // Mover la fila al grupo de convertidos sin recargar todo el cruce.
      setFilas(prev => prev.map(x => x.leadId === f.leadId
        ? { ...x, situacion: 'convertido' as Situacion, estadoLead: 'Conductor', fechaConvertido: new Date().toISOString() }
        : x))
      showSuccess('Actualizado', `"${f.leadNombre}" quedó marcado como convertido.`)
      onActualizado?.()
    } catch (e: any) {
      Swal.fire('Error', e?.message || 'No se pudo actualizar el lead', 'error')
    } finally {
      setGuardandoId(null)
    }
  }

  const conteos = useMemo(() => ({
    convertidos: filas.filter(f => f.situacion === 'convertido').length,
    huerfanos: filas.filter(f => f.situacion === 'huerfano').length,
  }), [filas])

  const base = useMemo(() => filas.filter(f => f.situacion === vista), [filas, vista])

  const filtradas = useMemo(() => {
    let r = base
    const q = busqueda.trim().toLowerCase()
    if (q) {
      r = r.filter(f =>
        f.leadNombre.toLowerCase().includes(q) ||
        f.documento.toLowerCase().includes(q) ||
        (f.conductorNombre || '').toLowerCase().includes(q)
      )
    }
    return r
  }, [base, busqueda])

  const th: React.CSSProperties = {
    padding: '8px 12px', textAlign: 'left', fontSize: '10px', textTransform: 'uppercase',
    letterSpacing: '0.3px', color: 'var(--text-secondary)', fontWeight: 600,
    borderBottom: '1px solid var(--border-primary)', position: 'sticky', top: 0,
    background: 'var(--bg-secondary)', zIndex: 1,
  }
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: '12px', color: 'var(--text-primary)' }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)', borderRadius: '10px', width: '100%', maxWidth: '980px',
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border-primary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link2 size={18} style={{ color: 'var(--color-primary, #ff0033)' }} />
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Leads / Conductores</div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                Relación detectada por DNI / CUIT. Solo lectura.
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden', flex: 1 }}>
          {/* Aviso: la deteccion de huerfanos es heuristica */}
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'flex-start',
            background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: '6px',
            padding: '8px 10px', fontSize: '11px', color: '#854D0E',
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              No existe una relación guardada entre lead y conductor: el cruce se hace por documento.
              Un lead sin DNI ni CUIT cargado no puede detectarse aunque su conductor exista.
            </span>
          </div>

          {/* Pestañas */}
          <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-secondary)', borderRadius: '6px', padding: '3px' }}>
            {([
              { value: 'convertido' as const, label: `Convertidos (${conteos.convertidos})` },
              { value: 'huerfano' as const, label: `Relación Conductor/Lead sin convertir (${conteos.huerfanos})` },
            ]).map(t => (
              <button
                key={t.value}
                onClick={() => setVista(t.value)}
                style={{
                  flex: 1, padding: '6px 12px', fontSize: '11px', fontWeight: 600,
                  borderRadius: '4px', border: 'none', cursor: 'pointer',
                  background: vista === t.value ? '#ff0033' : 'transparent',
                  color: vista === t.value ? 'white' : 'var(--text-secondary)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Buscador */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="Buscar por nombre, DNI o conductor..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              style={{
                width: '100%', padding: '7px 10px 7px 32px', fontSize: '12px',
                border: '1px solid var(--border-primary)', borderRadius: '6px',
                background: 'var(--bg-secondary)', color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Tabla */}
          <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border-primary)', borderRadius: '6px' }}>
            {cargando ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                Cargando conciliación...
              </div>
            ) : error ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#dc2626', fontSize: '12px' }}>{error}</div>
            ) : filtradas.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                Sin resultados
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Situación</th>
                    <th style={th}>Lead</th>
                    <th style={th}>Documento</th>
                    <th style={th}>Estado del lead</th>
                    <th style={th}>Conductor</th>
                    <th style={th}>Convertido</th>
                    {vista === 'huerfano' && <th style={th}></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(f => (
                    <tr key={f.leadId} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                      <td style={td}>
                        <span style={{
                          fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px',
                          background: f.situacion === 'huerfano' ? '#FEE2E2' : '#DCFCE7',
                          color: f.situacion === 'huerfano' ? '#991B1B' : '#166534',
                          whiteSpace: 'nowrap',
                        }}>
                          {f.situacion === 'huerfano' ? 'SIN CONVERTIR' : 'CONVERTIDO'}
                        </span>
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{f.leadNombre}</td>
                      <td style={{ ...td, fontFamily: 'monospace' }}>{f.documento}</td>
                      <td style={{ ...td, color: 'var(--text-secondary)' }}>{f.estadoLead}</td>
                      <td style={td}>{f.conductorNombre || <span style={{ color: 'var(--text-tertiary)' }}>-</span>}</td>
                      <td style={{ ...td, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtFecha(f.fechaConvertido)}</td>
                      {vista === 'huerfano' && (
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => marcarConvertido(f)}
                            disabled={guardandoId === f.leadId}
                            title="Marcar este lead como convertido a conductor"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '4px 9px', fontSize: '11px', fontWeight: 600,
                              border: '1px solid #16a34a', borderRadius: '4px',
                              background: 'transparent', color: '#16a34a',
                              cursor: guardandoId === f.leadId ? 'wait' : 'pointer',
                              opacity: guardandoId === f.leadId ? 0.6 : 1,
                            }}
                          >
                            <Check size={12} /> {guardandoId === f.leadId ? 'Guardando...' : 'Marcar convertido'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
            Mostrando {filtradas.length} de {base.length} registros
          </div>
        </div>
      </div>
    </div>
  )
}
