// src/modules/administracion/consumo-herramientas/Modales.tsx
// Alta / edición de una herramienta y carga / marcado de un pago (con la factura).
// Nunca se piden contraseñas ni la tarjeta completa: solo los últimos 4 dígitos.

import { useState } from 'react'
import { Paperclip } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import type { Cotizacion, EnvioFacturas, EstadoPago, Herramienta, Moneda, PagoHerramienta, Periodicidad } from './types'
import {
  BUCKET_FACTURAS, CUIT_OBJETIVO, ENVIOS_FACTURAS, ESTADOS_PAGO, MONEDAS, PERIODICIDADES, RAZON_SOCIAL_INC, RAZON_SOCIAL_OBJETIVO, sinCosto,
} from './types'
import { showError, showSuccess } from '../../../utils/toast'
import { hoyART } from '../../../utils/fechaArgentina'
import { formatFecha, formatFechaHora, formatMoneda } from '../../../utils/format'

const vacioANull = (v: string) => (v.trim() === '' ? null : v.trim())
const numeroONull = (v: string) => {
  const t = v.trim().replace(/\./g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
const montoATexto = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','))

/** Bloque con título del formulario (mismo estilo que los detalles del sistema) */
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
        color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-primary)',
        paddingBottom: 4, marginBottom: 10,
      }}>
        {titulo}
      </div>
      {children}
    </section>
  )
}

// ─────────────────────────────────────────────────────
// Herramienta
// ─────────────────────────────────────────────────────

interface HerramientaModalProps {
  herramienta: Herramienta | null
  onClose: () => void
  onGuardado: () => void
}

export function HerramientaModal({ herramienta, onClose, onGuardado }: HerramientaModalProps) {
  const h = herramienta
  const [form, setForm] = useState({
    nombre: h?.nombre ?? '',
    uso: h?.uso ?? '',
    plan: h?.plan ?? '',
    monto: montoATexto(h?.monto),
    moneda: (h?.moneda ?? 'USD') as Moneda,
    periodicidad: (h?.periodicidad ?? 'Mensual') as Periodicidad,
    dia_cobro: h?.dia_cobro ? String(h.dia_cobro) : '',
    fecha_vencimiento: h?.fecha_vencimiento ?? '',
    cuenta_acceso: h?.cuenta_acceso ?? '',
    url_facturacion: h?.url_facturacion ?? '',
    url_acceso: h?.url_acceso ?? '',
    responsable: h?.responsable ?? '',
    razon_social_facturada: h?.razon_social_facturada ?? '',
    cuit_facturado: h?.cuit_facturado ?? '',
    tarjeta_ultimos4: h?.tarjeta_ultimos4 ?? '',
    envio_facturas: (h?.envio_facturas ?? 'Pendiente revisar') as EnvioFacturas,
    estado: h?.estado ?? 'Activa',
    notas: h?.notas ?? '',
    enlace_gestor: h?.enlace_gestor ?? '',
    licencias: h?.licencias != null ? String(h.licencias) : '',
    licencias_incluidas: h?.licencias_incluidas != null ? String(h.licencias_incluidas) : '',
  })
  const [guardando, setGuardando] = useState(false)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(prev => ({ ...prev, [k]: v }))

  const guardar = async () => {
    if (!form.nombre.trim()) { showError('Falta el nombre de la herramienta'); return }
    if (form.tarjeta_ultimos4 && !/^\d{4}$/.test(form.tarjeta_ultimos4)) {
      showError('Tarjeta: cargá solo los últimos 4 dígitos'); return
    }
    const dia = form.dia_cobro ? Number(form.dia_cobro) : null
    if (dia !== null && (!Number.isInteger(dia) || dia < 1 || dia > 31)) { showError('El día de cobro va de 1 a 31'); return }
    const url = vacioANull(form.url_facturacion)
    if (url && !/^https?:\/\//i.test(url)) { showError('La URL de facturación tiene que empezar con http:// o https://'); return }
    const urlAcceso = vacioANull(form.url_acceso)
    if (urlAcceso && !/^https?:\/\//i.test(urlAcceso)) { showError('La URL de la herramienta tiene que empezar con http:// o https://'); return }
    const gestor = vacioANull(form.enlace_gestor)
    if (gestor && !/^https?:\/\//i.test(gestor)) { showError('El enlace del gestor tiene que empezar con http:// o https://'); return }

    const datos = {
      nombre: form.nombre.trim(),
      uso: vacioANull(form.uso),
      plan: vacioANull(form.plan),
      monto: sinCosto(form.periodicidad) ? null : numeroONull(form.monto),
      moneda: sinCosto(form.periodicidad) ? null : form.moneda,
      periodicidad: form.periodicidad,
      dia_cobro: form.periodicidad === 'Anual' || sinCosto(form.periodicidad) ? null : dia,
      fecha_vencimiento: form.periodicidad === 'Anual' ? vacioANull(form.fecha_vencimiento) : null,
      cuenta_acceso: vacioANull(form.cuenta_acceso),
      url_facturacion: url,
      // Solo si la columna existe (sql/consumo_herramientas_url_acceso.sql) o se cargó un valor
      ...((h && 'url_acceso' in h) || urlAcceso ? { url_acceso: urlAcceso } : {}),
      responsable: vacioANull(form.responsable),
      razon_social_facturada: vacioANull(form.razon_social_facturada),
      cuit_facturado: vacioANull(form.cuit_facturado),
      tarjeta_ultimos4: vacioANull(form.tarjeta_ultimos4),
      envio_facturas: form.envio_facturas,
      estado: form.estado,
      fecha_baja: form.estado === 'Inactiva' ? (h?.fecha_baja ?? hoyART()) : null,
      notas: vacioANull(form.notas),
      enlace_gestor: vacioANull(form.enlace_gestor),
      licencias: form.licencias ? Number(form.licencias) : null,
      licencias_incluidas: form.licencias_incluidas ? Number(form.licencias_incluidas) : null,
    }

    setGuardando(true)
    try {
      const { error } = h
        ? await supabase.from('herramientas').update(datos).eq('id', h.id)
        : await supabase.from('herramientas').insert(datos)
      if (error) throw error
      showSuccess(h ? 'Herramienta actualizada' : 'Herramienta creada')
      onGuardado()
    } catch (e) {
      console.error('No se pudo guardar la herramienta:', e)
      showError('No se pudo guardar la herramienta')
    } finally {
      setGuardando(false)
    }
  }

  const esAnual = form.periodicidad === 'Anual'
  const esGratis = sinCosto(form.periodicidad)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{h ? 'Editar herramienta' : 'Nueva herramienta'}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {/* Ordenado por secciones (2026-11-17) */}
          <Seccion titulo="Datos generales">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" value={form.nombre} onChange={e => set('nombre', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Plan</label>
                <input className="form-input" value={form.plan} onChange={e => set('plan', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Licencias / usuarios que se pagan</label>
                <input className="form-input" inputMode="numeric" value={form.licencias}
                  onChange={e => set('licencias', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="ej. 12" />
              </div>
              <div className="form-group">
                <label className="form-label">Incluidas en el plan</label>
                <input className="form-input" inputMode="numeric" value={form.licencias_incluidas}
                  onChange={e => set('licencias_incluidas', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="opcional" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Para qué se usa</label>
                <input className="form-input" value={form.uso} onChange={e => set('uso', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Responsable interno</label>
                <input className="form-input" value={form.responsable} onChange={e => set('responsable', e.target.value)} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo="Cobro">
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Periodicidad</label>
                <select className="form-input" value={form.periodicidad} onChange={e => set('periodicidad', e.target.value as Periodicidad)}>
                  {PERIODICIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Monto</label>
                <input className="form-input" inputMode="decimal" disabled={esGratis} value={esGratis ? '' : form.monto}
                  onChange={e => set('monto', e.target.value)} placeholder={form.periodicidad === 'Por uso' ? 'Estimado por mes' : ''} />
              </div>
              <div className="form-group">
                <label className="form-label">Moneda</label>
                <select className="form-input" disabled={esGratis} value={form.moneda} onChange={e => set('moneda', e.target.value as Moneda)}>
                  {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            {!esGratis && (
              <div className="form-row">
                {esAnual ? (
                  <div className="form-group">
                    <label className="form-label">Fecha de vencimiento (anual)</label>
                    <input type="date" className="form-input" value={form.fecha_vencimiento} onChange={e => set('fecha_vencimiento', e.target.value)} />
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label">Día de cobro</label>
                    <input className="form-input" inputMode="numeric" value={form.dia_cobro}
                      onChange={e => set('dia_cobro', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="1 a 31" />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Tarjeta (últimos 4)</label>
                  <input className="form-input" inputMode="numeric" value={form.tarjeta_ultimos4}
                    onChange={e => set('tarjeta_ultimos4', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" />
                </div>
              </div>
            )}
          </Seccion>

          <Seccion titulo="Acceso">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">URL de la herramienta (para entrar)</label>
                <input className="form-input" value={form.url_acceso} onChange={e => set('url_acceso', e.target.value)} placeholder="https://" />
              </div>
              <div className="form-group">
                <label className="form-label">Cuenta / usuario de acceso</label>
                <input className="form-input" value={form.cuenta_acceso} onChange={e => set('cuenta_acceso', e.target.value)} placeholder="ej. it@toshify.com.ar (sin contraseña)" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">URL de facturación (facturas y pagos)</label>
                <input className="form-input" value={form.url_facturacion} onChange={e => set('url_facturacion', e.target.value)} placeholder="https://" />
              </div>
              <div className="form-group">
                <label className="form-label">Enlace en el gestor de contraseñas</label>
                <input className="form-input" value={form.enlace_gestor} onChange={e => set('enlace_gestor', e.target.value)}
                  placeholder="https:// (opcional)" />
              </div>
            </div>
          </Seccion>

          <Seccion titulo="Facturación">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Razón social facturada</label>
                <input className="form-input" value={form.razon_social_facturada} onChange={e => set('razon_social_facturada', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">CUIT facturado</label>
                <input className="form-input" value={form.cuit_facturado} onChange={e => set('cuit_facturado', e.target.value)} />
              </div>
            </div>
            <div className="form-row" style={{ alignItems: 'end' }}>
              <div className="form-group" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '6px 10px' }}
                  onClick={() => setForm(prev => ({ ...prev, razon_social_facturada: RAZON_SOCIAL_OBJETIVO, cuit_facturado: CUIT_OBJETIVO }))}
                >
                  Usar {RAZON_SOCIAL_OBJETIVO} · {CUIT_OBJETIVO}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '6px 10px' }}
                  title="Entidad de EE. UU. (dirección de Miami), la que va con la tarjeta 7825"
                  onClick={() => setForm(prev => ({ ...prev, razon_social_facturada: RAZON_SOCIAL_INC, cuit_facturado: '' }))}
                >
                  Usar {RAZON_SOCIAL_INC}
                </button>
              </div>
              <div className="form-group">
                <label className="form-label">Envío de facturas</label>
                <select className="form-input" value={form.envio_facturas} onChange={e => set('envio_facturas', e.target.value as EnvioFacturas)}>
                  {ENVIOS_FACTURAS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
          </Seccion>

          <Seccion titulo="Estado y notas">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select className="form-input" value={form.estado} onChange={e => set('estado', e.target.value as typeof form.estado)}>
                  <option value="Activa">Activa</option>
                  <option value="Inactiva">Inactiva</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-input" rows={1} value={form.notas} onChange={e => set('notas', e.target.value)} />
              </div>
            </div>
          </Seccion>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Pago: marcar pagado (con factura), editar o cargar uno "Por uso"
// ─────────────────────────────────────────────────────

interface PagoModalProps {
  /** Pago existente (marcar pagado / editar). null = pago nuevo (Por uso) */
  pago: PagoHerramienta | null
  /** Herramientas para elegir al cargar un pago nuevo */
  herramientas: Herramienta[]
  nombreHerramienta?: string
  /** 'YYYY-MM' del mes seleccionado (pago nuevo) */
  mes: string
  /** true: abre listo para marcar como pagado */
  marcarPagado?: boolean
  onClose: () => void
  onGuardado: () => void
}

export function PagoModal({ pago, herramientas, nombreHerramienta, mes, marcarPagado, onClose, onGuardado }: PagoModalProps) {
  const porUso = herramientas.filter(h => h.estado === 'Activa' && !sinCosto(h.periodicidad))
  const [form, setForm] = useState({
    herramienta_id: pago?.herramienta_id ?? porUso.find(h => h.periodicidad === 'Por uso')?.id ?? porUso[0]?.id ?? '',
    periodo: pago?.periodo ?? mes,
    fecha_vencimiento: pago?.fecha_vencimiento ?? '',
    monto: montoATexto(pago?.monto),
    moneda: (pago?.moneda ?? 'USD') as Moneda,
    estado: (marcarPagado ? 'Pagado' : pago?.estado ?? 'Pendiente') as EstadoPago,
    fecha_pago: pago?.fecha_pago ?? (marcarPagado ? hoyART() : ''),
    observaciones: pago?.observaciones ?? '',
  })
  const [archivo, setArchivo] = useState<File | null>(null)
  const [guardando, setGuardando] = useState(false)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(prev => ({ ...prev, [k]: v }))

  // Al elegir la herramienta de un pago nuevo, traer su monto y moneda
  const elegirHerramienta = (id: string) => {
    const h = herramientas.find(x => x.id === id)
    setForm(prev => ({
      ...prev,
      herramienta_id: id,
      monto: prev.monto || montoATexto(h?.monto),
      moneda: (h?.moneda ?? prev.moneda) as Moneda,
    }))
  }

  const guardar = async () => {
    if (!form.herramienta_id) { showError('Elegí la herramienta'); return }
    if (!/^\d{4}(-\d{2})?$/.test(form.periodo)) { showError('Período inválido (AAAA-MM)'); return }
    if (form.estado === 'Pagado' && !form.fecha_pago) { showError('Falta la fecha de pago'); return }

    setGuardando(true)
    try {
      let factura_path = pago?.factura_path ?? null
      let factura_nombre = pago?.factura_nombre ?? null
      if (archivo) {
        const limpio = archivo.name.replace(/[^\w.-]+/g, '_')
        const ruta = `${form.herramienta_id}/${form.periodo}/${Date.now()}_${limpio}`
        const { error: errSubida } = await supabase.storage.from(BUCKET_FACTURAS).upload(ruta, archivo, { upsert: false })
        if (errSubida) throw errSubida
        factura_path = ruta
        factura_nombre = archivo.name
      }

      const { data: { user } } = await supabase.auth.getUser()
      const pasaAPagado = form.estado === 'Pagado' && pago?.estado !== 'Pagado'
      const datos = {
        herramienta_id: form.herramienta_id,
        periodo: form.periodo,
        fecha_vencimiento: vacioANull(form.fecha_vencimiento),
        monto: numeroONull(form.monto),
        moneda: form.moneda,
        estado: form.estado,
        fecha_pago: form.estado === 'Pagado' ? vacioANull(form.fecha_pago) : null,
        factura_path,
        factura_nombre,
        observaciones: vacioANull(form.observaciones),
        ...(pasaAPagado ? { pagado_por: user?.id ?? null, pagado_en: new Date().toISOString() } : {}),
      }
      const { error } = pago
        ? await supabase.from('herramientas_pagos').update(datos).eq('id', pago.id)
        : await supabase.from('herramientas_pagos').insert(datos)
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          showError('Esa herramienta ya tiene un pago para ese período'); return
        }
        throw error
      }
      showSuccess(form.estado === 'Pagado' ? 'Pago registrado' : 'Pago guardado')
      onGuardado()
    } catch (e) {
      console.error('No se pudo guardar el pago:', e)
      showError('No se pudo guardar el pago')
    } finally {
      setGuardando(false)
    }
  }

  const titulo = marcarPagado ? 'Marcar pagado' : pago ? 'Editar pago' : 'Cargar pago'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <h2>{titulo}</h2>
            {nombreHerramienta && <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{nombreHerramienta} · {form.periodo}</p>}
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {!pago && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Herramienta *</label>
                <select className="form-input" value={form.herramienta_id} onChange={e => elegirHerramienta(e.target.value)}>
                  {porUso.map(h => <option key={h.id} value={h.id}>{h.nombre}{h.periodicidad ? ` · ${h.periodicidad}` : ''}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Período *</label>
                <input type="month" className="form-input" value={form.periodo} onChange={e => set('periodo', e.target.value)} />
              </div>
            </div>
          )}

          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">Vencimiento</label>
              <input type="date" className="form-input" value={form.fecha_vencimiento} onChange={e => set('fecha_vencimiento', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Monto</label>
              <input className="form-input" inputMode="decimal" value={form.monto} onChange={e => set('monto', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Moneda</label>
              <select className="form-input" value={form.moneda} onChange={e => set('moneda', e.target.value as Moneda)}>
                {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Estado</label>
              <select className="form-input" value={form.estado} onChange={e => set('estado', e.target.value as EstadoPago)}>
                {ESTADOS_PAGO.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de pago</label>
              <input type="date" className="form-input" disabled={form.estado !== 'Pagado'} value={form.fecha_pago} onChange={e => set('fecha_pago', e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Factura</label>
            <label className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '5px 10px' }}>
              <Paperclip size={13} />
              {archivo ? archivo.name : pago?.factura_nombre ? `Reemplazar (${pago.factura_nombre})` : 'Adjuntar PDF o imagen'}
              <input type="file" accept="application/pdf,image/*" hidden onChange={e => setArchivo(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          <div className="form-group">
            <label className="form-label">Observaciones</label>
            <textarea className="form-input" rows={2} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Cotizaciones: cuántas unidades de cada moneda son 1 USD (para el equivalente en dólares).
// Las actualiza todos los días el script del servidor; acá se pueden corregir a mano.
// ─────────────────────────────────────────────────────

interface CotizacionesModalProps {
  cotizaciones: Cotizacion[]
  puedeEditar: boolean
  onClose: () => void
  onGuardado: () => void
}

export function CotizacionesModal({ cotizaciones, puedeEditar, onClose, onGuardado }: CotizacionesModalProps) {
  const editables = cotizaciones.filter(c => c.moneda !== 'USD').sort((a, b) => a.moneda.localeCompare(b.moneda))
  const [valores, setValores] = useState<Record<string, string>>(
    () => Object.fromEntries(editables.map(c => [c.moneda, montoATexto(Number(c.unidades_por_usd))])),
  )
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setGuardando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      for (const c of editables) {
        const n = numeroONull(valores[c.moneda] ?? '')
        if (n === null || n <= 0) { showError(`Cotización inválida para ${c.moneda}`); return }
        if (n === Number(c.unidades_por_usd)) continue
        const { error } = await supabase.from('herramientas_cotizaciones')
          .update({ unidades_por_usd: n, fuente: 'manual', actualizada_en: new Date().toISOString(), actualizada_por: user?.id ?? null })
          .eq('moneda', c.moneda)
        if (error) throw error
      }
      showSuccess('Tipo de cambio actualizado')
      onGuardado()
    } catch (e) {
      console.error('No se pudieron guardar las cotizaciones:', e)
      showError('No se pudo guardar el tipo de cambio')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Tipo de cambio</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {editables.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)' }}>Todavía no hay cotizaciones cargadas (falta correr sql/consumo_herramientas_monedas.sql).</p>
          ) : (
            <>
              <p style={{ marginTop: 0, color: 'var(--text-secondary)' }}>
                Unidades de cada moneda por 1 USD. Se usan solo para mostrar el equivalente en dólares; cada monto se guarda en su moneda.
              </p>
              {editables.map(c => (
                <div key={c.moneda} className="form-group">
                  <label className="form-label">1 USD = … {c.moneda}</label>
                  <input className="form-input" inputMode="decimal" disabled={!puedeEditar}
                    value={valores[c.moneda] ?? ''} onChange={e => setValores(prev => ({ ...prev, [c.moneda]: e.target.value }))} />
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    {c.fuente === 'manual' ? 'Cargada a mano' : `Fuente: ${c.fuente || '-'}`} · {formatFechaHora(c.actualizada_en)}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={guardando}>Cerrar</button>
          {puedeEditar && editables.length > 0 && (
            <button className="btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Detalle de un pago (solo lectura) ──────────────────────────────

interface PagoDetalleModalProps {
  pago: PagoHerramienta
  herramienta: Herramienta | undefined
  /** Equivalente en USD ya calculado (null si es USD o falta cotización) */
  equivalenteUsd: number | null
  onVerFactura: () => void
  onClose: () => void
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{children ?? '-'}</span>
    </div>
  )
}

const grilla = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 } as const

export function PagoDetalleModal({ pago, herramienta: h, equivalenteUsd, onVerFactura, onClose }: PagoDetalleModalProps) {
  const enlace = (url: string | null) => (url
    ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>{url}</a>
    : null)
  const estimado = pago.id.startsWith('estimado-')
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2>{h?.nombre || 'Pago'}</h2>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Período {pago.periodo}{estimado ? ' · estimado' : ''}
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <Seccion titulo="Pago">
            <div style={grilla}>
              <Dato label="Estado">{estimado ? 'Estimado' : pago.estado === 'Pendiente' && pago.fecha_vencimiento && pago.fecha_vencimiento > hoyART() ? 'Programado' : pago.estado}</Dato>
              <Dato label="Vence">{pago.fecha_vencimiento ? formatFecha(pago.fecha_vencimiento) : 'A confirmar'}</Dato>
              <Dato label="Monto">
                {pago.monto !== null && pago.moneda ? formatMoneda(Number(pago.monto), pago.moneda) : null}
                {equivalenteUsd !== null && <span style={{ color: 'var(--text-tertiary)' }}> (≈ {formatMoneda(equivalenteUsd, 'USD')})</span>}
              </Dato>
              <Dato label="Pagado el">{pago.fecha_pago ? formatFecha(pago.fecha_pago) : null}</Dato>
              <Dato label="Factura">
                {pago.factura_path
                  ? <button type="button" onClick={onVerFactura} style={{ background: 'none', border: 0, padding: 0, color: 'var(--color-primary)', cursor: 'pointer', textAlign: 'left' }}>
                      {pago.factura_nombre || 'Ver factura'}
                    </button>
                  : null}
              </Dato>
              <Dato label="Registrado">{pago.pagado_en ? formatFechaHora(pago.pagado_en) : null}</Dato>
            </div>
          </Seccion>
          <Seccion titulo="Observaciones">
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{pago.observaciones || '-'}</div>
          </Seccion>
          {h && (
            <Seccion titulo="Herramienta">
              <div style={grilla}>
                <Dato label="Plan">{h.plan}</Dato>
                <Dato label="Periodicidad">{h.periodicidad}{h.dia_cobro ? ` · día ${h.dia_cobro}` : ''}</Dato>
                <Dato label="Licencias">
                  {h.licencias != null ? `${h.licencias}${h.licencias_incluidas != null ? ` / ${h.licencias_incluidas} incluidas` : ''}` : null}
                </Dato>
                <Dato label="Responsable">{h.responsable}</Dato>
                <Dato label="Tarjeta">{h.tarjeta_ultimos4 ? `•••• ${h.tarjeta_ultimos4}` : null}</Dato>
                <Dato label="Factura a">{[h.razon_social_facturada, h.cuit_facturado].filter(Boolean).join(' · ') || null}</Dato>
                <Dato label="Cuenta de acceso">{h.cuenta_acceso}</Dato>
                <Dato label="URL de facturación">{enlace(h.url_facturacion)}</Dato>
              </div>
            </Seccion>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
