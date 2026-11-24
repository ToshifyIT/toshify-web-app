// Detalle del BCRA del conductor, en la pestaña Seguimiento del detalle (arriba de la bitácora).
// Mismos datos que la ficha del lead: alerta, situación, deudas, cheques y detalle por entidad.
// Lo completa server-bcra.js una vez por mes (sql/conductores_bcra.sql).
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { formatFechaHora, formatPlata } from '../../../utils/format'
import { situacionBcra } from '../../leads/bcraSituaciones'
import { InfoSituacionesBcra } from '../../leads/components/InfoSituacionesBcra'
import './BcraConductor.css'

interface EntidadBcra {
  entidad: string
  situacion: number
  monto: number
  proceso_judicial: boolean
}

interface DatosBcra {
  bcra_consultado_at: string | null
  bcra_error: string | null
  bcra_nivel: 'verde' | 'amarillo' | 'rojo' | null
  bcra_nivel_motivo: string | null
  bcra_situacion: number | null
  bcra_deuda_total: number | null
  bcra_cheques: number | null
  bcra_nombre: string | null
  bcra_cuil: string | null
  bcra_cuil_origen: string | null
  bcra_detalle: { periodo?: string | null; entidades?: EntidadBcra[] } | null
}

const COLUMNAS = 'bcra_consultado_at,bcra_error,bcra_nivel,bcra_nivel_motivo,bcra_situacion,bcra_deuda_total,' +
  'bcra_cheques,bcra_nombre,bcra_cuil,bcra_cuil_origen,bcra_detalle'

/** Alerta de Parámetros > Riesgo BCRA, en palabras (igual que las tarjetas). */
const NIVEL: Record<'verde' | 'amarillo' | 'rojo', { label: string; color: string }> = {
  verde: { label: 'Al día', color: 'var(--color-success)' },
  amarillo: { label: 'Con atraso', color: 'var(--color-warning)' },
  rojo: { label: 'En mora', color: 'var(--color-danger)' },
}

/** Verde 0-1, amarillo 2-3, rojo 4 a 6 (solo texto en color). */
function colorSituacion(s: number): string {
  if (s <= 1) return 'var(--color-success)'
  if (s <= 3) return 'var(--color-warning)'
  return 'var(--color-danger)'
}

/** "27289938724" -> "27-28993872-4" */
function formatCuil(cuil: string): string {
  return /^\d{11}$/.test(cuil) ? `${cuil.slice(0, 2)}-${cuil.slice(2, 10)}-${cuil.slice(10)}` : cuil
}

/** "202609" -> "09/2026" */
function periodo(p: string | null | undefined): string | null {
  return p && /^\d{6}$/.test(p) ? `${p.slice(4)}/${p.slice(0, 4)}` : null
}

export function BcraConductor({ conductorId }: { conductorId: string }) {
  const [datos, setDatos] = useState<DatosBcra | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando')

  useEffect(() => {
    let activo = true
    setEstado('cargando')
    supabase.from('conductores').select(COLUMNAS).eq('id', conductorId).maybeSingle()
      .then(({ data, error }) => {
        if (!activo) return
        if (error) {
          console.error('Error cargando el BCRA del conductor:', error)
          setEstado('error')
          return
        }
        setDatos(data as unknown as DatosBcra | null)
        setEstado('listo')
      })
    return () => { activo = false }
  }, [conductorId])

  const titulo = (
    <div className="bcra-cond-titulo">
      Situación en el BCRA <InfoSituacionesBcra />
    </div>
  )

  if (estado === 'cargando') {
    return <section className="bcra-cond">{titulo}<p className="bcra-cond-nota">Cargando...</p></section>
  }
  if (estado === 'error' || !datos?.bcra_consultado_at) {
    return (
      <section className="bcra-cond">
        {titulo}
        <p className="bcra-cond-nota">
          {estado === 'error'
            ? 'No se pudo cargar la consulta al BCRA.'
            : 'Pendiente: todavía no se consultó. Se consulta sola, una vez por mes, a los conductores activos.'}
        </p>
      </section>
    )
  }
  if (datos.bcra_error) {
    return (
      <section className="bcra-cond">
        {titulo}
        <p className="bcra-cond-nota" style={{ color: 'var(--color-warning)' }}>Sin validar: {datos.bcra_error}</p>
        <p className="bcra-cond-nota">Consulta: {formatFechaHora(datos.bcra_consultado_at, { segundos: false })}</p>
      </section>
    )
  }

  const situacion = datos.bcra_situacion ?? 0
  const sit = situacionBcra(situacion)
  const entidades = datos.bcra_detalle?.entidades ?? []
  const judicial = entidades.some(e => e.proceso_judicial)
  const deudaAtraso = entidades.filter(e => e.situacion >= 2).reduce((acc, e) => acc + e.monto, 0)
  const nivel = datos.bcra_nivel ? NIVEL[datos.bcra_nivel] : null

  return (
    <section className="bcra-cond">
      {titulo}
      <div className="bcra-cond-grilla">
        {nivel && (
          <div className="bcra-cond-dato bcra-cond-dato--ancho">
            <span className="bcra-cond-label">Alerta</span>
            <span>
              <strong style={{ color: nivel.color }}>{nivel.label}</strong>
              {datos.bcra_nivel_motivo ? ` · ${datos.bcra_nivel_motivo}` : ''}
            </span>
          </div>
        )}
        <div className="bcra-cond-dato">
          <span className="bcra-cond-label">Situación</span>
          <strong style={{ color: colorSituacion(situacion) }}>
            {situacion} · {sit?.nombre ?? '-'}
          </strong>
        </div>
        <div className="bcra-cond-dato">
          <span className="bcra-cond-label">Deuda con atraso</span>
          <span>{formatPlata(deudaAtraso)}</span>
        </div>
        <div className="bcra-cond-dato">
          <span className="bcra-cond-label">Deuda total</span>
          <span>{formatPlata(datos.bcra_deuda_total ?? 0)}</span>
        </div>
        <div className="bcra-cond-dato">
          <span className="bcra-cond-label">Cheques rechazados</span>
          <span>{datos.bcra_cheques ? datos.bcra_cheques : 'No'}</span>
        </div>
        <div className="bcra-cond-dato">
          <span className="bcra-cond-label">Proceso judicial</span>
          <span>{judicial ? 'Sí' : 'No'}</span>
        </div>
        <div className="bcra-cond-dato">
          <span className="bcra-cond-label">Período informado</span>
          <span>{periodo(datos.bcra_detalle?.periodo) ?? '-'}</span>
        </div>
        {datos.bcra_cuil && (
          <div className="bcra-cond-dato">
            <span className="bcra-cond-label">CUIL consultado</span>
            <span>
              {formatCuil(datos.bcra_cuil)}{datos.bcra_cuil_origen === 'dni' ? ' (armado desde el DNI)' : ''}
            </span>
          </div>
        )}
        <div className="bcra-cond-dato">
          <span className="bcra-cond-label">Consulta</span>
          <span>{formatFechaHora(datos.bcra_consultado_at, { segundos: false })}</span>
        </div>
      </div>

      {entidades.length > 0 && (
        <table className="cdet-table bcra-cond-tabla">
          <thead>
            <tr>
              <th>Entidad</th>
              <th className="c">Situación</th>
              <th className="r">Monto</th>
            </tr>
          </thead>
          <tbody>
            {entidades.map(e => (
              <tr key={e.entidad}>
                <td>{e.entidad}{e.proceso_judicial ? ' · proceso judicial' : ''}</td>
                <td className="c" style={{ color: colorSituacion(e.situacion), fontWeight: 600 }}>{e.situacion}</td>
                <td className="r">{formatPlata(e.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
