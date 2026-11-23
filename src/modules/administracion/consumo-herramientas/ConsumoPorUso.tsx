// src/modules/administracion/consumo-herramientas/ConsumoPorUso.tsx
// Consumo real del mes de las herramientas por uso que tienen API (2Chat, Google Cloud):
// cuánto se lleva gastado, cómo cierra el mes a este ritmo y cuánto queda del saldo
// prepago. El consumo llega solo (sql/consumo_herramientas_consumo.sql); el saldo se
// carga a mano porque ninguna de las dos API lo entrega.

import { useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { showError, showSuccess } from '../../../utils/toast'
import { formatFecha, formatMoneda, formatNumero } from '../../../utils/format'
import { hoyART } from '../../../utils/fechaArgentina'
import { nombreMes } from '../../../utils/meses'
import type { ConsumoDia, Herramienta, Moneda } from './types'
import { MONEDAS, aUsd } from './types'
import { DIAS_AVISO_SALDO, DIAS_RITMO, resumirConsumo } from './consumo'
import './ConsumoPorUso.css'

interface ConsumoPorUsoProps {
  herramientas: Herramienta[]
  consumo: ConsumoDia[]
  mes: string
  tasas: Map<string, number>
  puedeEditar: boolean
  onGuardado: () => void
}

const ORIGEN: Record<string, string> = {
  '2chat': 'Costo de las llamadas según 2Chat',
  google_cloud: 'Costo por servicio según la facturación de Google Cloud',
}

/** Conceptos a los que se puede aplicar el saldo prepago (billeteras separadas) */
const CONCEPTOS_SALDO: Record<string, string[]> = {
  google_cloud: ['Gemini', 'Google Maps'],
}

const SIN_DATOS: Record<string, string> = {
  '2chat': 'Todavía no hay llamadas con costo en este mes.',
  google_cloud: 'Sin datos todavía: falta conectar la exportación de facturación de Google Cloud a BigQuery.',
}

export function ConsumoPorUso({ herramientas, consumo, mes, tasas, puedeEditar, onGuardado }: ConsumoPorUsoProps) {
  const hoy = hoyART()
  const [editarSaldo, setEditarSaldo] = useState<Herramienta | null>(null)

  const tarjetas = useMemo(() => herramientas
    .filter(h => h.estado === 'Activa' && h.fuente_consumo)
    .map(h => ({ h, r: resumirConsumo(h, consumo.filter(c => c.herramienta_id === h.id), mes, hoy, tasas) })),
  [herramientas, consumo, mes, hoy, tasas])

  if (tarjetas.length === 0) return null
  const esMesActual = mes === hoy.slice(0, 7)

  return (
    <div className="cpu-panel">
      <div className="cpu-titulo">
        <h3>Consumo por uso · {nombreMes(mes)}</h3>
        <span>Se actualiza solo desde cada herramienta. No es la factura: es lo consumido.</span>
      </div>
      <div className="cpu-grid">
        {tarjetas.map(({ h, r }) => {
          const usd = r.moneda === 'USD' ? null : aUsd(r.total, r.moneda, tasas)
          const p = r.prepago
          const pocoSaldo = !!p && (p.queda <= 0 || (p.diasRestantes !== null && p.diasRestantes <= DIAS_AVISO_SALDO))
          return (
            <div key={h.id} className="cpu-card">
              <div className="cpu-card-head">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span className="cpu-nombre">{h.nombre}</span>
                  <span className="cpu-sub">{ORIGEN[h.fuente_consumo || ''] || ''}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <span className="cpu-total">{formatMoneda(r.total, r.moneda)}</span>
                  {usd !== null && <span className="cpu-sub">≈ {formatMoneda(usd, 'USD')}</span>}
                </div>
              </div>

              <div className="cpu-filas">
                {r.conceptos.length === 0 && <span className="cpu-sub">{SIN_DATOS[h.fuente_consumo || ''] || 'Sin consumo en este mes.'}</span>}
                {r.conceptos.map(c => (
                  <div key={c.concepto} className="cpu-fila">
                    <span>
                      {c.concepto}
                      {c.cantidad !== null && c.unidad ? ` · ${formatNumero(c.cantidad, 0)} ${c.unidad}` : ''}
                    </span>
                    <strong>{formatMoneda(c.monto, r.moneda)}</strong>
                  </div>
                ))}
                {r.proyeccion !== null && (
                  <div className="cpu-fila" title="Lo gastado hasta ayer, al mismo ritmo, hasta el último día del mes">
                    <span>Cierre estimado del mes</span>
                    <strong>{formatMoneda(r.proyeccion, r.moneda)}</strong>
                  </div>
                )}
                {r.anterior > 0 && (
                  <div className="cpu-fila">
                    <span>Mes anterior</span>
                    <strong>{formatMoneda(r.anterior, r.moneda)}</strong>
                  </div>
                )}
                {esMesActual && r.ultimoDia && (
                  <span className="cpu-sub">Datos hasta el {formatFecha(r.ultimoDia)}</span>
                )}
              </div>

              <div className="cpu-filas cpu-prepago">
                {p ? (
                  <>
                    <div className="cpu-fila">
                      <span>Saldo prepago{p.concepto ? ` de ${p.concepto}` : ''} al {formatFecha(p.fecha)}</span>
                      <strong>{formatMoneda(p.saldo, r.moneda)}</strong>
                    </div>
                    <div className="cpu-fila">
                      <span>Usado desde entonces</span>
                      <strong>{formatMoneda(p.usado, r.moneda)}</strong>
                    </div>
                    <div className="cpu-fila">
                      <span>Queda</span>
                      <strong className={pocoSaldo ? 'cpu-alerta' : undefined}>{formatMoneda(Math.max(0, p.queda), r.moneda)}</strong>
                    </div>
                    <div className="cpu-fila" title={`Con el gasto promedio de los últimos ${DIAS_RITMO} días: ${formatMoneda(p.ritmoDiario, r.moneda)} por día`}>
                      <span>Alcanza hasta</span>
                      <strong className={pocoSaldo ? 'cpu-alerta' : undefined}>
                        {p.queda <= 0 ? 'Saldo agotado'
                          : p.alcanzaHasta ? `${formatFecha(p.alcanzaHasta)} (${p.diasRestantes} ${p.diasRestantes === 1 ? 'día' : 'días'})`
                            : 'Sin gasto reciente'}
                      </strong>
                    </div>
                  </>
                ) : (
                  <span className="cpu-sub">Sin saldo prepago cargado: con el saldo se calcula cuánto queda y hasta cuándo alcanza.</span>
                )}
                {puedeEditar && (
                  <button type="button" className="cpu-link" onClick={() => setEditarSaldo(h)}>
                    {p ? 'Actualizar saldo' : 'Cargar saldo prepago'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {editarSaldo && (
        <SaldoPrepagoModal
          herramienta={editarSaldo}
          onClose={() => setEditarSaldo(null)}
          onGuardado={() => { setEditarSaldo(null); onGuardado() }}
        />
      )}
    </div>
  )
}

interface SaldoPrepagoModalProps {
  herramienta: Herramienta
  onClose: () => void
  onGuardado: () => void
}

function SaldoPrepagoModal({ herramienta: h, onClose, onGuardado }: SaldoPrepagoModalProps) {
  const [saldo, setSaldo] = useState(h.saldo_prepago != null ? String(h.saldo_prepago).replace('.', ',') : '')
  const [fecha, setFecha] = useState(hoyART())
  const [moneda, setMoneda] = useState<Moneda>(h.moneda || 'USD')
  const [concepto, setConcepto] = useState(h.saldo_prepago_concepto || '')
  const conceptos = CONCEPTOS_SALDO[h.fuente_consumo || ''] || []
  const [guardando, setGuardando] = useState(false)

  const guardar = async (quitar = false) => {
    const n = Number(saldo.trim().replace(/\./g, '').replace(',', '.'))
    if (!quitar && (saldo.trim() === '' || !Number.isFinite(n) || n < 0)) { showError('Ingresá un saldo válido'); return }
    if (!quitar && (!fecha || fecha > hoyART())) { showError('La fecha del saldo no puede ser futura'); return }
    setGuardando(true)
    try {
      const { error } = await supabase.from('herramientas')
        .update(quitar
          ? { saldo_prepago: null, saldo_prepago_fecha: null, saldo_prepago_concepto: null }
          : { saldo_prepago: n, saldo_prepago_fecha: fecha, saldo_prepago_concepto: concepto || null, moneda })
        .eq('id', h.id)
      if (error) throw error
      showSuccess(quitar ? 'Saldo prepago quitado' : 'Saldo prepago actualizado')
      onGuardado()
    } catch (e) {
      console.error('No se pudo guardar el saldo prepago:', e)
      showError('No se pudo guardar el saldo')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Saldo prepago · {h.nombre}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0, color: 'var(--text-secondary)' }}>
            Cargá el saldo que muestra la herramienta después de una recarga o cuando quieras ajustarlo.
            El consumo se descuenta solo a partir del día siguiente a la fecha.
          </p>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Saldo disponible *</label>
              <input className="form-input" inputMode="decimal" value={saldo} onChange={e => setSaldo(e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Moneda</label>
              <select className="form-input" value={moneda} onChange={e => setMoneda(e.target.value as Moneda)}>
                {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Saldo al día *</label>
            <input className="form-input" type="date" max={hoyART()} value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          {conceptos.length > 0 && (
            <div className="form-group">
              <label className="form-label">Se descuenta de</label>
              <select className="form-input" value={concepto} onChange={e => setConcepto(e.target.value)}>
                <option value="">Todo el consumo</option>
                {conceptos.map(c => <option key={c} value={c}>Solo {c}</option>)}
              </select>
              <span style={{ color: 'var(--text-tertiary)' }}>
                El prepago de Gemini (AI Studio) es un saldo aparte del de la cuenta donde se cobra Maps.
              </span>
            </div>
          )}
        </div>
        <div className="modal-footer">
          {h.saldo_prepago != null && (
            <button className="btn-secondary" onClick={() => guardar(true)} disabled={guardando} style={{ marginRight: 'auto' }}>Quitar saldo</button>
          )}
          <button className="btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="btn-primary" onClick={() => guardar()} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}
