// src/modules/administracion/consumo-herramientas/ConsumoPorUso.tsx
// Consumo real del mes de una herramienta por uso que tiene API (2Chat – Créditos, Google Cloud).
// Se muestra en el detalle del pago (ojito), no arriba de la tabla: cuánto se lleva gastado,
// cómo cierra el mes a este ritmo y cómo viene contra el mes anterior. El consumo llega solo
// (sql/consumo_herramientas_consumo.sql); no es la factura.

import { useMemo } from 'react'
import { formatFecha, formatMoneda, formatNumero } from '../../../utils/format'
import { hoyART } from '../../../utils/fechaArgentina'
import type { ConsumoDia, Herramienta } from './types'
import { aUsd } from './types'
import { DIAS_AVISO_SALDO, resumirConsumo } from './consumo'
import './ConsumoPorUso.css'

interface ConsumoDetalleProps {
  herramienta: Herramienta
  consumo: ConsumoDia[]
  /** Mes 'AAAA-MM' del pago que se está viendo */
  mes: string
  tasas: Map<string, number>
}

const ORIGEN: Record<string, string> = {
  '2chat': 'Costo de las llamadas según 2Chat',
  google_cloud: 'Costo por servicio según la facturación de Google Cloud',
}

const SIN_DATOS: Record<string, string> = {
  '2chat': 'Todavía no hay llamadas con costo en este mes.',
  google_cloud: 'Sin datos todavía: falta conectar la exportación de facturación de Google Cloud a BigQuery.',
}

export function ConsumoDetalle({ herramienta: h, consumo, mes, tasas }: ConsumoDetalleProps) {
  const hoy = hoyART()
  const r = useMemo(
    () => resumirConsumo(h, consumo.filter(c => c.herramienta_id === h.id), mes, hoy, tasas),
    [h, consumo, mes, hoy, tasas],
  )
  const esMesActual = mes === hoy.slice(0, 7)
  const usd = r.moneda === 'USD' ? null : aUsd(r.total, r.moneda, tasas)
  // Variación contra el mes anterior: con el cierre estimado si es el mes en curso
  const comparable = esMesActual ? r.proyeccion : r.total
  const variacion = r.anterior > 0 && comparable !== null ? (comparable - r.anterior) / r.anterior : null
  const p = r.prepago
  const pocoSaldo = !!p && (p.queda <= 0 || (p.diasRestantes !== null && p.diasRestantes <= DIAS_AVISO_SALDO))

  return (
    <div className="cpu-detalle">
      <span className="cpu-sub">
        {ORIGEN[h.fuente_consumo || ''] || ''}. Es lo consumido, no la factura.
        {esMesActual && r.ultimoDia ? ` Datos hasta el ${formatFecha(r.ultimoDia)}.` : ''}
      </span>
      {r.conceptos.length === 0 && (
        <span className="cpu-sub">{SIN_DATOS[h.fuente_consumo || ''] || 'Sin consumo en este mes.'}</span>
      )}
      <div className="cpu-row">
        <div className="cpu-col">
          <span className="cpu-label">Gastado</span>
          <strong>{formatMoneda(r.total, r.moneda)}</strong>
          {usd !== null && <span className="cpu-sub">≈ {formatMoneda(usd, 'USD')}</span>}
        </div>
        <div className="cpu-col" title="Lo gastado hasta ayer, al mismo ritmo, hasta el último día del mes">
          <span className="cpu-label">Cierre estimado</span>
          <strong>{r.proyeccion !== null ? formatMoneda(r.proyeccion, r.moneda) : '-'}</strong>
        </div>
        <div className="cpu-col">
          <span className="cpu-label">Mes anterior</span>
          <strong>{r.anterior > 0 ? formatMoneda(r.anterior, r.moneda) : '-'}</strong>
          {variacion !== null && Math.abs(variacion) >= 0.01 && (
            <span className="cpu-var" style={{ color: variacion > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
              {variacion > 0 ? '+' : ''}{formatNumero(variacion * 100, 0)}%
            </span>
          )}
        </div>
        {p && (
          <div className="cpu-col">
            <span className="cpu-label">Saldo prepago</span>
            <strong className={pocoSaldo ? 'cpu-alerta' : undefined}>{formatMoneda(Math.max(0, p.queda), r.moneda)}</strong>
            <span className="cpu-sub">
              {p.queda <= 0 ? 'Agotado' : p.alcanzaHasta ? `Alcanza hasta el ${formatFecha(p.alcanzaHasta)}` : 'Sin gasto reciente'}
            </span>
          </div>
        )}
      </div>
      {r.conceptos.length > 0 && (
        <div className="cpu-conceptos">
          {r.conceptos.map(c => (
            <div key={c.concepto} className="cpu-concepto">
              <span>
                {c.concepto}
                {c.cantidad !== null && c.unidad ? ` · ${formatNumero(c.cantidad, 0)} ${c.unidad}` : ''}
              </span>
              <strong>{formatMoneda(c.monto, r.moneda)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
