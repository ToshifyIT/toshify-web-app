import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export interface GrupoFlotaOption {
  id: string
  codigo: string
  nombre_comercial: string
  razon_social: string
}

/**
 * Hook para cargar grupos de flota activos.
 * Usado en dropdowns de programaciones, ofertas, vehiculos, etc.
 */
export function useGruposFlota() {
  const [grupos, setGrupos] = useState<GrupoFlotaOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await (supabase.from('grupos_flota') as any)
        .select('id, codigo, nombre_comercial, razon_social')
        .eq('activo', true)
        .order('prioridad', { ascending: true })
      setGrupos(data || [])
      setLoading(false)
    }
    load()
  }, [])

  return { grupos, loading }
}
