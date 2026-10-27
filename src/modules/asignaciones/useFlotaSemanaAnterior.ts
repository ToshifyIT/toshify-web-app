// src/modules/asignaciones/useFlotaSemanaAnterior.ts
// Foto de la flota de hace 7 días (mismo día de la semana anterior), para las
// flechas de comparación de Estado de Flota. Sale de kpi_flota_diaria, la foto
// diaria que guarda el Dashboard KPI's a las 23:55 (o reconstruida, para los días
// anteriores a la primera foto). Con "Todas las sedes" suma las sedes reales.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSede } from '../../contexts/SedeContext'

export interface FlotaDia {
  fecha: string
  totalFlota: number
  enUso: number
  vehiculosAsignados: number
  turnosTotales: number
  turnosOcupados: number
}

function haceSieteDias(): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
  const d = new Date(`${hoy}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

export function useFlotaSemanaAnterior(): FlotaDia | null {
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const [dato, setDato] = useState<FlotaDia | null>(null)

  useEffect(() => {
    let activo = true
    const fecha = haceSieteDias()
    ;(async () => {
      try {
        const { data, error } = await aplicarFiltroSede((supabase.from('kpi_flota_diaria' as any) as any)
          .select('total_flota, en_uso, vehiculos_asignados, turnos_totales, turnos_ocupados')
          .eq('fecha', fecha))
        if (error) throw error
        const filas = (data || []) as Record<string, number>[]
        if (!activo) return
        if (!filas.length) {
          setDato(null)
          return
        }
        const suma = (k: string) => filas.reduce((s, f) => s + (Number(f[k]) || 0), 0)
        setDato({
          fecha,
          totalFlota: suma('total_flota'),
          enUso: suma('en_uso'),
          vehiculosAsignados: suma('vehiculos_asignados'),
          turnosTotales: suma('turnos_totales'),
          turnosOcupados: suma('turnos_ocupados'),
        })
      } catch (err) {
        // Sin comparación no se rompe nada: las tarjetas se muestran sin flecha
        console.error('[EstadoFlota] No se pudo leer la foto de la semana anterior', err)
        if (activo) setDato(null)
      }
    })()
    return () => {
      activo = false
    }
  }, [sedeActualId, aplicarFiltroSede])

  return dato
}
