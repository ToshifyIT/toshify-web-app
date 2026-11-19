import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Cobertura del vehiculo de tipo Responsabilidad Civil (vehiculos.cobertura es texto libre).
 * Mismo criterio que esResponsabilidadCivil de server.js: con tarifa nueva, estos
 * vehiculos generan la carta oferta con la plantilla RC.
 */
export function esResponsabilidadCivil(cobertura: string | null | undefined): boolean {
  return /responsabilidad\s*civil/i.test(cobertura || '')
}

/**
 * Nombre de la cobertura para mostrar: el campo es texto libre y viene escrito de
 * muchas formas ("TERCERO COMPLETO", "Terceros completos (NO TRANSPORTE…)", …).
 */
export function etiquetaCobertura(cobertura: string | null | undefined): string {
  const texto = (cobertura || '').replace(/\s+/g, ' ').trim()
  if (!texto) return 'Sin dato'
  if (esResponsabilidadCivil(texto)) return 'Responsabilidad Civil'
  if (/terceros?\s*completos?/i.test(texto)) return 'Terceros completos'
  return texto
}

/**
 * Hook que carga los ids de los vehiculos con cobertura Responsabilidad Civil.
 * Usado para el indicador "RC" en Programacion y Asignaciones.
 */
export function useVehiculosRC() {
  const [idsRC, setIdsRC] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      const { data, error } = await (supabase.from('vehiculos') as any)
        .select('id, cobertura')
        .is('deleted_at', null)
        .ilike('cobertura', '%responsabilidad%civil%')
      if (error) {
        console.error('Error cargando vehiculos RC:', error)
        return
      }
      const ids = ((data || []) as Array<{ id: string; cobertura: string | null }>)
        .filter(v => esResponsabilidadCivil(v.cobertura))
        .map(v => v.id)
      setIdsRC(new Set(ids))
    }
    load()
  }, [])

  return idsRC
}
