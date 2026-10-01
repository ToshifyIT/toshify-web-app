import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import './ZonesAssignmentsChart.css'

/**
 * ZONAS CON ASIGNACIONES PENDIENTES
 * Foto actual de los turnos libres en asignaciones activas de modalidad TURNO donde
 * hay un conductor y le falta el compañero (diurno sin nocturno o al revés).
 * Mismo criterio de vacante que Estado de Flota: no cuentan los conductores
 * cancelados, completados ni finalizados.
 * Zona: la de la asignación; si no tiene, la del conductor que está.
 */

interface ZonaPendiente {
  name: string
  value: number
  diurnos: number
  nocturnos: number
}

const INACTIVOS = ['cancelado', 'completado', 'finalizado']

function normalizarZona(raw: string | null | undefined): string {
  const z = (raw || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()
  if (!z) return 'Sin zona'
  if (z === 'caba') return 'CABA'
  for (const nombre of ['norte', 'sur', 'oeste']) {
    if (z === nombre || z === `gba ${nombre}` || z === `zona ${nombre}`) return nombre[0].toUpperCase() + nombre.slice(1)
  }
  if (z === 'gba') return 'GBA'
  return z.replace(/(^\w|\s\w)/g, m => m.toUpperCase())
}

const esDiurno = (h: string) => ['diurno', 'd'].includes(h.toLowerCase())
const esNocturno = (h: string) => ['nocturno', 'n'].includes(h.toLowerCase())

export function ZonasPendientesChart() {
  const { sedeActualId } = useSede()
  const [data, setData] = useState<ZonaPendiente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      setLoading(true)
      setError(false)
      try {
        let q = supabase
          .from('asignaciones')
          .select('id, horario, zona, sede_id, asignaciones_conductores(conductor_id, estado, horario, conductores(zona))')
          .in('estado', ['activo', 'activa'])
          .eq('horario', 'turno')
        if (sedeActualId) q = q.eq('sede_id', sedeActualId)
        const { data: asignaciones, error: err } = await q
        if (err) throw err

        const porZona = new Map<string, ZonaPendiente>()
        for (const a of (asignaciones || []) as any[]) {
          const activos = ((a.asignaciones_conductores || []) as any[])
            .filter(ac => ac.conductor_id && !INACTIVOS.includes(String(ac.estado || '')))
          const d = activos.find(ac => esDiurno(String(ac.horario || '')))
          const n = activos.find(ac => esNocturno(String(ac.horario || '')))
          // Pendiente = hay un conductor y falta el del otro turno
          if (!!d === !!n) continue
          const presente = d || n
          const nombre = normalizarZona(a.zona || presente?.conductores?.zona)
          const fila = porZona.get(nombre) ?? { name: nombre, value: 0, diurnos: 0, nocturnos: 0 }
          fila.value++
          if (!d) fila.diurnos++ // falta el diurno
          else fila.nocturnos++  // falta el nocturno
          porZona.set(nombre, fila)
        }
        if (!cancelado) setData([...porZona.values()].sort((x, y) => y.value - x.value || x.name.localeCompare(y.name)))
      } catch {
        if (!cancelado) setError(true)
      } finally {
        if (!cancelado) setLoading(false)
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [sedeActualId])

  const total = data.reduce((s, z) => s + z.value, 0)

  return (
    <div className="zones-assignments-chart">
      <div className="flex items-center justify-between mb-4">
        <h3 className="zones-assignments-title mb-0">ZONAS CON ASIGNACIONES PENDIENTES</h3>
        {!loading && !error && (
          <span style={{ fontSize: 12, color: 'var(--text-tertiary, #6B7280)' }}>
            {total} {total === 1 ? 'turno libre' : 'turnos libres'} hoy
          </span>
        )}
      </div>
      <p style={{ margin: '-8px 0 12px', fontSize: 12, color: 'var(--text-tertiary, #6B7280)' }}>
        Conductores en turno a los que les falta compañero, por zona de la asignación
      </p>
      <div className="zones-assignments-body">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full" style={{ fontSize: 13, color: 'var(--text-tertiary, #6B7280)' }}>
            No se pudieron cargar las asignaciones pendientes.
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-full" style={{ fontSize: 13, color: 'var(--text-tertiary, #6B7280)' }}>
            No hay conductores esperando compañero.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={data} margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
              <XAxis type="number" domain={[0, 'dataMax + 1']} hide />
              <YAxis
                yAxisId="left"
                type="category"
                dataKey="name"
                width={80}
                tick={{ fill: '#6B7280', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                type="category"
                dataKey="value"
                width={40}
                tick={{ fill: '#374151', fontSize: 12, fontWeight: 'bold' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                formatter={(_v, _n, item) => {
                  const z = (item as { payload?: ZonaPendiente }).payload
                  return z ? [`${z.diurnos} falta diurno · ${z.nocturnos} falta nocturno`, 'Turnos libres'] : ['', '']
                }}
              />
              <Bar yAxisId="left" dataKey="value" radius={[4, 4, 4, 4]} barSize={32} background={{ fill: '#F9FAFB', radius: 4 }}>
                {data.map(entry => (
                  <Cell key={entry.name} fill={entry.name === 'Sin zona' ? '#9CA3AF' : '#F59E0B'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
