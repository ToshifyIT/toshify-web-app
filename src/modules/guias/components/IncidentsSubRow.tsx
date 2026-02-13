import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'

interface Incidencia {
  id: string;
  descripcion: string;
  fecha: string;
  conductor_id?: string;
}

interface IncidentsSubRowProps {
  driverId: string
}

export function IncidentsSubRow({ driverId }: IncidentsSubRowProps) {
  const { aplicarFiltroSede } = useSede()
  const [incidents, setIncidents] = useState<Incidencia[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadIncidents() {
      try {
        setLoading(true)
        const { data, error } = await aplicarFiltroSede(supabase
          .from('incidencias')
          .select('*')
          .eq('conductor_id', driverId))
          .order('fecha', { ascending: false })

        if (error) throw error
        setIncidents(data || [])
      } catch (error) {
        console.error('Error loading incidents:', error)
      } finally {
        setLoading(false)
      }
    }

    if (driverId) {
      loadIncidents()
    }
  }, [driverId])

  if (loading) {
    return <div className="p-4 text-center text-sm text-gray-500">Cargando incidencias...</div>
  }

  if (incidents.length === 0) {
    return (
      <div className="p-6 bg-gray-50/50 dark:bg-gray-800/30">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          DETALLE DE INCIDENCIAS
        </h4>
        <div className="text-sm text-gray-500">No hay incidencias registradas</div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-50/50 dark:bg-gray-800/30">
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
        DETALLE DE INCIDENCIAS
      </h4>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
            <tr>
              <th className="px-6 py-3 w-3/4 font-semibold">INCIDENCIA</th>
              <th className="px-6 py-3 w-1/4 font-semibold text-right">FECHA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {incidents.map((incident) => (
              <tr key={incident.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <td className="px-6 py-3 text-gray-700 dark:text-gray-300 font-medium">
                  {incident.descripcion}
                </td>
                <td className="px-6 py-3 text-gray-500 dark:text-gray-400 text-right whitespace-nowrap">
                  {new Date(incident.fecha).toLocaleDateString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
