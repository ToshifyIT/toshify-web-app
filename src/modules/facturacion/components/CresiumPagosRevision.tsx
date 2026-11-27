// src/modules/facturacion/components/CresiumPagosRevision.tsx
// Pagos de Cresium que el sistema cruzó con un conductor (services/cresiumPagosSaldosService.ts).
// Pendientes no cambian el saldo; «Permitir» los registra (abono o cargo, en la semana
// elegida) y «Rechazar» los descarta.
//   · CresiumPagosRevision: Saldos > «Cresium por revisar» (todos los de la sede).
//   · AccionesPagoCresium / SelectorSemanaCresium: filas dentro de Control de Saldos.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, X, Bot, AlertTriangle, RefreshCw, Eye, Edit2 } from 'lucide-react'
import { useSede } from '../../../contexts/SedeContext'
import { useAuth } from '../../../contexts/AuthContext'
import { Alerta, confirmar } from '../../../components/ui/alertas'
import { Spinner } from '../../../components/ui/LoadingOverlay'
import { showError, showSuccess } from '../../../utils/toast'
import { formatCurrency } from '../../../types/facturacion.types'
import { formatFecha, formatFechaHora } from '../../../utils/format'
import { formatNombreCompleto } from '../../../utils/conductorUtils'
import { hoyART } from '../../../utils/fechaArgentina'
import { semanaISO, sumarSemanasISO } from '../../../utils/semanaISO'
import {
  ETIQUETA_CRITERIO,
  ETIQUETA_EMPRESA,
  buscarPosiblesDuplicados,
  editarPagoCresium,
  listarPagosCresium,
  permitirPagoCresium,
  rechazarPagoCresium,
} from '../../../services/cresiumPagosSaldosService'
import type { EstadoPagoCresium, PagoCresiumSaldo, TipoMovimientoSaldo } from '../../../services/cresiumPagosSaldosService'
import './CresiumPagosRevision.css'

export type CambiosPago = Partial<Pick<PagoCresiumSaldo, 'semana' | 'anio' | 'tipo' | 'importe'>>

const PESTANAS: { estado: EstadoPagoCresium; etiqueta: string }[] = [
  { estado: 'pendiente', etiqueta: 'Por revisar' },
  { estado: 'permitido', etiqueta: 'Permitidos' },
  { estado: 'rechazado', etiqueta: 'Rechazados' },
]

const TEXTO_B1 = 'Promoción Licencia B1: este pago ya se descuenta en la facturación'

/** Semanas para elegir: 6 antes de la del pago hasta la actual + 1 */
function opcionesSemana(pago: PagoCresiumSaldo): { semana: number; anio: number }[] {
  const actual = semanaISO(hoyART())
  const tope = sumarSemanasISO(actual.semana, actual.anio, 1)
  const opciones: { semana: number; anio: number }[] = []
  let { semana, anio } = sumarSemanasISO(pago.semana, pago.anio, -6)
  for (let i = 0; i < 60; i++) {
    opciones.push({ semana, anio })
    if (semana === tope.semana && anio === tope.anio) break
    ;({ semana, anio } = sumarSemanasISO(semana, anio, 1))
  }
  if (!opciones.some(o => o.semana === pago.semana && o.anio === pago.anio)) opciones.push({ semana: pago.semana, anio: pago.anio })
  return opciones
}

function nombreConductor(p: PagoCresiumSaldo): string {
  const c = p.conductor
  return c ? formatNombreCompleto(`${c.nombres || ''} ${c.apellidos || ''}`.trim()) : '(conductor)'
}

const escapar = (t: string) => t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/**
 * Editar un pendiente antes de permitirlo: semana, tipo (abono / cargo) e importe. Guarda en la
 * base y devuelve los cambios (null si se canceló o no cambió nada).
 */
async function editarPagoCresiumDialogo(pago: PagoCresiumSaldo): Promise<CambiosPago | null> {
  const semanas = opcionesSemana(pago).map(o => {
    const v = `${o.semana}-${o.anio}`
    return `<option value="${v}" ${o.semana === pago.semana && o.anio === pago.anio ? 'selected' : ''}>Semana ${o.semana} - ${o.anio}</option>`
  }).join('')
  const estilo = 'font-size:14px;margin:0;width:100%;padding:8px;'
  const etiqueta = 'display:block;font-size:12px;color:#374151;margin:10px 0 4px;'
  const { value } = await Alerta.fire({
    title: 'Editar pago de Cresium',
    html: `
      <div style="text-align:left;font-size:13px;">
        <div style="background:#F3F4F6;padding:10px 12px;border-radius:6px;">
          <div style="font-weight:600;color:#111827;">${escapar(nombreConductor(pago))}</div>
          <div style="color:#6B7280;font-size:12px;margin-top:3px;">
            ${escapar(ETIQUETA_EMPRESA[pago.empresa] || pago.empresa)} · ${pago.fecha ? formatFecha(pago.fecha) : '-'} ·
            envió ${escapar(pago.contraparte || '-')}
          </div>
        </div>
        <label style="${etiqueta}">Semana</label>
        <select id="cps-ed-semana" class="swal2-select" style="${estilo}">${semanas}</select>
        <label style="${etiqueta}">Tipo</label>
        <select id="cps-ed-tipo" class="swal2-select" style="${estilo}">
          <option value="abono" ${pago.tipo === 'abono' ? 'selected' : ''}>Abono (suma al saldo)</option>
          <option value="cargo" ${pago.tipo === 'cargo' ? 'selected' : ''}>Cargo (resta al saldo)</option>
        </select>
        <label style="${etiqueta}">Monto</label>
        <input id="cps-ed-monto" type="number" min="0" step="0.01" class="swal2-input" style="${estilo}" value="${pago.importe}">
      </div>`,
    showCancelButton: true,
    confirmButtonText: 'Guardar',
    cancelButtonText: 'Cancelar',
    width: 400,
    preConfirm: () => {
      const [semana, anio] = (document.getElementById('cps-ed-semana') as HTMLSelectElement).value.split('-').map(Number)
      const tipo = (document.getElementById('cps-ed-tipo') as HTMLSelectElement).value as TipoMovimientoSaldo
      const importe = Math.round(parseFloat((document.getElementById('cps-ed-monto') as HTMLInputElement).value) * 100) / 100
      if (!importe || importe <= 0) {
        Alerta.showValidationMessage('Ingrese un monto válido (mayor a 0)')
        return false
      }
      return { semana, anio, tipo, importe }
    },
  })
  if (!value) return null
  const cambios: CambiosPago = {}
  if (value.semana !== pago.semana || value.anio !== pago.anio) Object.assign(cambios, { semana: value.semana, anio: value.anio })
  if (value.tipo !== pago.tipo) cambios.tipo = value.tipo
  if (value.importe !== pago.importe) cambios.importe = value.importe
  if (Object.keys(cambios).length === 0) return null
  try {
    await editarPagoCresium(pago.id, cambios)
    showSuccess('Pago actualizado', nombreConductor(pago))
    return cambios
  } catch (error) {
    console.error('Error editando pago de Cresium:', error)
    showError('Error', 'No se pudo guardar el cambio')
    return null
  }
}

/**
 * Permitir / rechazar / editar, compartido por los dos modales. `alTerminar` recibe el id del
 * pago revisado (para sacarlo de la lista) y avisa al que llama para recargar Saldos.
 */
function useAccionesCresium(alTerminar: (id: string) => void, alFallar: () => void) {
  const { profile } = useAuth()
  const [procesando, setProcesando] = useState<string | null>(null)
  const usuario = useMemo(() => ({ id: profile?.id ?? null, nombre: profile?.full_name || 'Usuario' }), [profile])

  const permitir = async (pago: PagoCresiumSaldo) => {
    const signo = pago.tipo === 'abono' ? 'suma' : 'resta'
    const ok = await confirmar({
      titulo: 'Permitir pago de Cresium',
      texto: `${nombreConductor(pago)}: se registra un ${pago.tipo} de ${formatCurrency(pago.importe)} ` +
        `(${signo} al saldo) en la semana ${pago.semana}/${pago.anio}.`,
      confirmar: 'Permitir',
    })
    if (!ok) return
    setProcesando(pago.id)
    try {
      const nuevoSaldo = await permitirPagoCresium(pago, usuario)
      showSuccess('Pago permitido', `${nombreConductor(pago)} · nuevo saldo: ${formatCurrency(nuevoSaldo)}`)
      alTerminar(pago.id)
    } catch (error) {
      console.error('Error permitiendo pago de Cresium:', error)
      showError('No se pudo permitir', (error as Error).message || 'Intente nuevamente')
      alFallar()
    } finally {
      setProcesando(null)
    }
  }

  const rechazar = async (pago: PagoCresiumSaldo) => {
    const r = await Alerta.fire({
      title: 'Rechazar pago de Cresium',
      text: `${nombreConductor(pago)} · ${formatCurrency(pago.importe)}. No se registra en el saldo.`,
      input: 'text',
      inputPlaceholder: 'Motivo (opcional). Ej: ya estaba cargado a mano',
      showCancelButton: true,
      confirmButtonText: 'Rechazar',
      cancelButtonText: 'Cancelar',
    })
    if (!r.isConfirmed) return
    setProcesando(pago.id)
    try {
      await rechazarPagoCresium(pago.id, String(r.value || '').trim() || null, usuario)
      showSuccess('Pago rechazado', nombreConductor(pago))
      alTerminar(pago.id)
    } catch (error) {
      console.error('Error rechazando pago de Cresium:', error)
      showError('No se pudo rechazar', (error as Error).message || 'Intente nuevamente')
      alFallar()
    } finally {
      setProcesando(null)
    }
  }

  return { procesando, permitir, rechazar }
}

/** Guarda el cambio de semana o tipo; si falla, vuelve atrás. */
function useEditarPago(setPagos: React.Dispatch<React.SetStateAction<PagoCresiumSaldo[] | null>>) {
  return async (pago: PagoCresiumSaldo, cambios: CambiosPago) => {
    setPagos(prev => prev?.map(p => (p.id === pago.id ? { ...p, ...cambios } : p)) ?? prev)
    try {
      await editarPagoCresium(pago.id, cambios)
    } catch (error) {
      console.error('Error editando pago de Cresium:', error)
      setPagos(prev => prev?.map(p => (p.id === pago.id ? pago : p)) ?? prev)
      showError('Error', 'No se pudo guardar el cambio')
    }
  }
}

function SelectorTipo({ pago, disabled, onCambio }: { pago: PagoCresiumSaldo; disabled: boolean; onCambio: (c: CambiosPago) => void }) {
  return (
    <select
      className="cps-select"
      value={pago.tipo}
      disabled={disabled}
      onChange={e => onCambio({ tipo: e.target.value as TipoMovimientoSaldo })}
    >
      <option value="abono">Abono (suma)</option>
      <option value="cargo">Cargo (resta)</option>
    </select>
  )
}

function SelectorSemana({ pago, disabled, onCambio }: { pago: PagoCresiumSaldo; disabled: boolean; onCambio: (c: CambiosPago) => void }) {
  return (
    <select
      className="cps-select"
      value={`${pago.semana}-${pago.anio}`}
      disabled={disabled}
      onChange={e => {
        const [semana, anio] = e.target.value.split('-').map(Number)
        onCambio({ semana, anio })
      }}
    >
      {opcionesSemana(pago).map(o => (
        <option key={`${o.semana}-${o.anio}`} value={`${o.semana}-${o.anio}`}>Semana {o.semana} - {o.anio}</option>
      ))}
    </select>
  )
}

/** Botones de una fila pendiente: solo íconos, el nombre aparece al pasar el mouse. */
function BotonesPendiente({ pago, esB1, procesando, onPermitir, onRechazar, onEditar, onIrARevisar }: {
  pago: PagoCresiumSaldo
  esB1: boolean
  procesando: string | null
  onPermitir: () => void
  onRechazar: () => void
  onEditar?: () => void
  onIrARevisar?: () => void
}) {
  const ocupado = !!procesando
  return (
    <div className="fact-table-actions cps-botones">
      {onIrARevisar && (
        <button className="fact-table-btn fact-table-btn-view" data-tooltip="Ir a revisar" onClick={onIrARevisar} disabled={ocupado}>
          <Eye size={14} />
        </button>
      )}
      {onEditar && (
        <button className="fact-table-btn fact-table-btn-edit" data-tooltip="Editar" onClick={onEditar} disabled={ocupado}>
          <Edit2 size={13} />
        </button>
      )}
      <button
        className="fact-table-btn fact-table-btn-success"
        data-tooltip={esB1 ? 'No se puede: ya se descuenta en la facturación (B1)' : 'Permitir'}
        onClick={onPermitir}
        disabled={ocupado || esB1}
      >
        {procesando === pago.id ? <Spinner size="sm" /> : <Check size={14} />}
      </button>
      <button className="fact-table-btn fact-table-btn-delete" data-tooltip="Rechazar" onClick={onRechazar} disabled={ocupado}>
        <X size={14} />
      </button>
    </div>
  )
}

// ─────────────────────────── Saldos > «Cresium por revisar» ───────────────────────────

interface CresiumPagosRevisionProps {
  onCerrar: () => void
  /** Se llama cuando se permitió o rechazó algo (para recargar Saldos y el contador). */
  onCambios: () => void
  /** Abre Control de Saldos del conductor. */
  onIrARevisar: (conductorId: string) => void
  /** Movimientos de Cresium que ya cuentan como pagos de la promoción Licencia B1. */
  movimientosB1: Set<string>
}

export function CresiumPagosRevision({ onCerrar, onCambios, onIrARevisar, movimientosB1 }: CresiumPagosRevisionProps) {
  const { aplicarFiltroSede } = useSede()
  const [estado, setEstado] = useState<EstadoPagoCresium>('pendiente')
  const [pagos, setPagos] = useState<PagoCresiumSaldo[] | null>([])
  const [duplicados, setDuplicados] = useState<Map<string, string>>(new Map())
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const lista = await listarPagosCresium(estado, aplicarFiltroSede)
      setPagos(lista)
      setDuplicados(lista && estado === 'pendiente' ? await buscarPosiblesDuplicados(lista) : new Map())
    } catch (error) {
      console.error('Error cargando pagos de Cresium:', error)
      showError('Error', 'No se pudieron cargar los pagos de Cresium')
    } finally {
      setCargando(false)
    }
  }, [estado, aplicarFiltroSede])

  useEffect(() => { void cargar() }, [cargar])

  const editar = useEditarPago(setPagos)
  const { procesando, permitir, rechazar } = useAccionesCresium(
    id => { setPagos(prev => prev?.filter(p => p.id !== id) ?? prev); onCambios() },
    () => { void cargar() },
  )

  const total = (pagos || []).reduce((t, p) => t + (p.tipo === 'abono' ? p.importe : -p.importe), 0)

  return (
    <div className="fact-modal-overlay" onClick={() => !procesando && onCerrar()}>
      <div className="fact-modal-content" style={{ maxWidth: '1200px' }} onClick={e => e.stopPropagation()}>
        <div className="fact-modal-header">
          <h2>Pagos de Cresium</h2>
          <button className="fact-modal-close" onClick={onCerrar} disabled={!!procesando}><X size={20} /></button>
        </div>
        <div className="fact-modal-body" style={{ padding: '16px' }}>
          <div className="cps-aviso">
            <Bot size={16} />
            <span>
              Registros cargados <strong>automáticamente</strong> desde Cresium (44 Dreams y Grupo CG), cruzados con el
              conductor por CUIT/CUIL, DNI, CBU o persona asignada. <strong>No cambian el saldo</strong> hasta que se
              permiten. La semana es la del envío del dinero; se puede cambiar antes de permitir.
            </span>
          </div>

          <div className="cps-barra">
            <div className="cps-pestanas">
              {PESTANAS.map(p => (
                <button
                  key={p.estado}
                  className={`cps-pestana${estado === p.estado ? ' activa' : ''}`}
                  onClick={() => setEstado(p.estado)}
                  disabled={!!procesando}
                >
                  {p.etiqueta}
                </button>
              ))}
            </div>
            <div className="cps-resumen">
              {pagos && pagos.length > 0 && <span>{pagos.length} registro(s) · {formatCurrency(total)}</span>}
              <button className="fact-btn fact-btn-secondary" onClick={() => void cargar()} disabled={cargando || !!procesando}>
                <RefreshCw size={14} /> Actualizar
              </button>
            </div>
          </div>

          {cargando ? (
            <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}><Spinner size="md" message="Cargando..." /></div>
          ) : pagos === null ? (
            <div className="cps-vacio">Falta crear la tabla en la base (sql/cresium_pagos_saldos.sql).</div>
          ) : pagos.length === 0 ? (
            <div className="cps-vacio">{estado === 'pendiente' ? 'No hay pagos de Cresium por revisar.' : 'No hay registros.'}</div>
          ) : (
            <div className="cps-tabla-wrap">
              <table className="cps-tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Conductor</th>
                    <th>Quién envió</th>
                    <th>Tipo</th>
                    <th style={{ textAlign: 'right' }}>Importe</th>
                    <th>Semana</th>
                    <th className={estado === 'pendiente' ? 'cps-col-acciones' : undefined}>
                      {estado === 'pendiente' ? 'Acciones' : 'Revisado'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map(p => {
                    const esB1 = movimientosB1.has(p.movimiento_id)
                    const duplicado = duplicados.get(p.id)
                    const pendiente = p.estado === 'pendiente'
                    return (
                      <tr key={p.id}>
                        <td>
                          <div>{p.fecha ? formatFecha(p.fecha) : '-'}</div>
                          <div className="cps-sub">{ETIQUETA_EMPRESA[p.empresa] || p.empresa}</div>
                          <span className="fact-badge fact-badge-purple cps-auto"><Bot size={10} /> Automático</span>
                        </td>
                        <td>
                          <div className="cps-nombre">{nombreConductor(p)}</div>
                          <div className="cps-sub">DNI {p.conductor?.numero_dni || '-'}</div>
                          {esB1 && <div className="cps-alerta"><AlertTriangle size={12} /> {TEXTO_B1}</div>}
                          {duplicado && pendiente && (
                            <div className="cps-alerta"><AlertTriangle size={12} /> Posible duplicado. {duplicado}</div>
                          )}
                        </td>
                        <td>
                          <div>{p.contraparte || '-'}</div>
                          <div className="cps-sub">{p.cuit || p.cuenta_contraparte || '-'} · cruce: {ETIQUETA_CRITERIO[p.criterio]}</div>
                          {p.nota && <div className="cps-sub">Nota: {p.nota}</div>}
                        </td>
                        <td>
                          <div className="cps-sub">{p.direccion === 'entrada' ? 'Entró dinero' : 'Salió dinero'}</div>
                          {pendiente ? (
                            <SelectorTipo pago={p} disabled={!!procesando} onCambio={c => void editar(p, c)} />
                          ) : (
                            <span className={`fact-badge ${p.tipo === 'abono' ? 'fact-badge-green' : 'fact-badge-red'}`}>
                              {p.tipo === 'abono' ? 'Abono' : 'Cargo'}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: p.tipo === 'abono' ? '#16a34a' : '#dc2626' }}>
                          {p.tipo === 'abono' ? '+' : '-'}{formatCurrency(p.importe)}
                        </td>
                        <td>
                          {pendiente
                            ? <SelectorSemana pago={p} disabled={!!procesando} onCambio={c => void editar(p, c)} />
                            : <span>S{p.semana}/{p.anio}</span>}
                        </td>
                        <td>
                          {pendiente ? (
                            <BotonesPendiente
                              pago={p}
                              esB1={esB1}
                              procesando={procesando}
                              onPermitir={() => void permitir(p)}
                              onRechazar={() => void rechazar(p)}
                              onEditar={() => void editarPagoCresiumDialogo(p).then(c => {
                                if (c) setPagos(prev => prev?.map(x => (x.id === p.id ? { ...x, ...c } : x)) ?? prev)
                              })}
                              onIrARevisar={() => onIrARevisar(p.conductor_id)}
                            />
                          ) : (
                            <div>
                              <div>{p.revisado_por_nombre || '-'}</div>
                              <div className="cps-sub">{p.revisado_en ? formatFechaHora(p.revisado_en) : ''}</div>
                              {p.motivo_rechazo && <div className="cps-sub">Motivo: {p.motivo_rechazo}</div>}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── Control de Saldos (un conductor) ───────────────────────────

/** Permitir / Rechazar de un pago pendiente, como fila del Control de Saldos. */
export function AccionesPagoCresium({ pago, esB1, onHecho, onEditado }: {
  pago: PagoCresiumSaldo
  esB1: boolean
  /** Se llama al permitir, rechazar o fallar (para recargar el kardex y Saldos). */
  onHecho: () => void
  /** Cambios guardados al editar (semana, tipo, monto). */
  onEditado: (cambios: CambiosPago) => void
}) {
  const { procesando, permitir, rechazar } = useAccionesCresium(onHecho, onHecho)
  return (
    <BotonesPendiente
      pago={pago}
      esB1={esB1}
      procesando={procesando}
      onPermitir={() => void permitir(pago)}
      onRechazar={() => void rechazar(pago)}
      onEditar={() => void editarPagoCresiumDialogo(pago).then(c => { if (c) onEditado(c) })}
    />
  )
}
