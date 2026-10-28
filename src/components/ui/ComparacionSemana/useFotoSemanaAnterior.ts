// src/components/ui/ComparacionSemana/useFotoSemanaAnterior.ts
// Guarda la foto del día de las tarjetas de un módulo (valor por tarjeta y sede) y
// devuelve la foto de hace 7 días para las flechas "vs sem. ant.".
// Tabla y funciones: sql/kpi_foto_tarjetas.sql. Si todavía no se ejecutó, no pasa
// nada: las tarjetas se muestran sin flecha.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'

export type ValoresTarjetas = Record<string, number>

/**
 * @param modulo  nombre corto del módulo (conductores, vehiculos, leads, asignaciones, multas)
 * @param valores valor actual de cada tarjeta
 * @param listo   true cuando los datos terminaron de cargar (para no guardar ceros a medio cargar)
 */
export function useFotoSemanaAnterior(modulo: string, valores: ValoresTarjetas, listo: boolean): ValoresTarjetas | null {
  const { sedeActualId } = useSede()
  const sede = sedeActualId ?? null
  const [anterior, setAnterior] = useState<ValoresTarjetas | null>(null)
  const ultimoGuardado = useRef<string>('')

  // Foto de hace 7 días
  useEffect(() => {
    let activo = true
    ;(async () => {
      try {
        const { data, error } = await (supabase.rpc as any)('leer_foto_semana_anterior', { p_modulo: modulo, p_sede_id: sede })
        if (error) throw error
        const v = (data as { valores?: ValoresTarjetas } | null)?.valores
        if (activo) setAnterior(v && typeof v === 'object' ? v : null)
      } catch {
        if (activo) setAnterior(null)
      }
    })()
    return () => { activo = false }
  }, [modulo, sede])

  // Foto de hoy: se guarda cuando hay datos y cambian (una vez por combinación de valores)
  const clave = JSON.stringify(valores)
  useEffect(() => {
    if (!listo) return
    const firma = `${modulo}|${sede}|${clave}`
    if (firma === ultimoGuardado.current) return
    const limpios = Object.fromEntries(
      Object.entries(valores).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)),
    )
    if (!Object.keys(limpios).length) return
    const t = setTimeout(() => {
      ultimoGuardado.current = firma
      void (supabase.rpc as any)('guardar_foto_tarjetas', { p_modulo: modulo, p_sede_id: sede, p_valores: limpios })
        .then(() => undefined, () => undefined)
    }, 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulo, sede, clave, listo])

  return anterior
}
