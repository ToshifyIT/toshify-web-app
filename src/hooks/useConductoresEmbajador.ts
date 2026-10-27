// src/hooks/useConductoresEmbajador.ts
//
// Lista de conductores para el campo "Embajador" (quién refirió al lead o al
// conductor). Se usa en Leads y en Conductores. Trae todos los conductores, de
// todas las sedes y estados: el embajador puede ser cualquiera. La lista se
// pide una sola vez por sesión y se comparte entre los formularios.

import { useEffect, useMemo, useState } from 'react'
import type { SearchableSelectOption } from '../components/ui/SearchableSelect'
import { supabase } from '../lib/supabase'
import { traerTodasLasPaginas } from '../utils/paginacionSupabase'

export interface ConductorEmbajador {
  id: string
  nombre: string
  dni: string
  estado: string
}

interface FilaConductor {
  id: string
  nombres: string | null
  apellidos: string | null
  numero_dni: string | null
  conductores_estados: { codigo: string | null } | null
}

let cache: Promise<ConductorEmbajador[]> | null = null

function cargarConductores(): Promise<ConductorEmbajador[]> {
  if (!cache) {
    cache = (async () => {
      const { data, error } = await traerTodasLasPaginas<FilaConductor>((desde, hasta, contar) =>
        (supabase.from('conductores') as any)
          .select('id, nombres, apellidos, numero_dni, conductores_estados(codigo)', contar ? { count: 'exact' } : undefined)
          .order('apellidos', { ascending: true })
          .order('id', { ascending: true })
          .range(desde, hasta)
      )
      if (error) throw new Error(error.message || 'No se pudieron cargar los conductores')
      return data
        .map((c) => ({
          id: c.id,
          nombre: `${(c.nombres || '').trim()} ${(c.apellidos || '').trim()}`.replace(/\s+/g, ' ').trim(),
          dni: c.numero_dni || '',
          estado: c.conductores_estados?.codigo || '',
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    })()
    // Si falla, el próximo formulario que se abra vuelve a intentar.
    cache.catch(() => { cache = null })
  }
  return cache
}

/**
 * @param excluirId conductor que no puede ser su propio embajador (al editar un conductor).
 */
export function useConductoresEmbajador(excluirId?: string | null) {
  const [conductores, setConductores] = useState<ConductorEmbajador[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let activo = true
    cargarConductores()
      .then((lista) => { if (activo) setConductores(lista) })
      .catch((err) => console.error('Error cargando conductores para Embajador:', err))
      .finally(() => { if (activo) setLoading(false) })
    return () => { activo = false }
  }, [])

  const nombrePorId = useMemo(
    () => new Map(conductores.map((c) => [c.id, c.nombre])),
    [conductores]
  )

  const opciones = useMemo<SearchableSelectOption[]>(
    () => conductores
      .filter((c) => c.id !== excluirId)
      .map((c) => ({
        value: c.id,
        label: c.nombre || 'Sin nombre',
        searchText: c.dni,
        subtitle: [c.dni && `DNI ${c.dni}`, c.estado].filter(Boolean).join(' · ') || undefined,
      })),
    [conductores, excluirId]
  )

  return { opciones, nombrePorId, loading }
}
