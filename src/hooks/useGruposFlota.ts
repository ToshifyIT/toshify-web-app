import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export interface GrupoFlotaOption {
  id: string
  codigo: string
  nombre_comercial: string
  razon_social: string
  valor_vehiculo: string | null
  valor_propietario: string | null
  valor_socio: string | null
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
        .select('id, codigo, nombre_comercial, razon_social, valor_vehiculo, valor_propietario, valor_socio')
        .eq('activo', true)
        .order('prioridad', { ascending: true })
      setGrupos(data || [])
      setLoading(false)
    }
    load()
  }, [])

  return { grupos, loading }
}
