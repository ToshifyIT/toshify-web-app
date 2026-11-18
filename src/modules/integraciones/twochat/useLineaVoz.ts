// src/modules/integraciones/twochat/useLineaVoz.ts
// Estado de la línea de 2Chat del usuario, para mostrar el botón «Llamar» desactivado
// mientras otra persona está llamando con la misma cuenta (p. ej. Karen y Gandhy con
// «Info Toshify»). Se consulta cada 15 s con la pestaña visible. El servidor vuelve a
// controlar al iniciar la llamada, por si dos personas tocan a la vez.
import { useCallback, useEffect, useState } from 'react'
import { estadoLineaVoz, motivoSinLinea, type EstadoLineaVoz } from '../../../services/twoChatService'

const CADA_MS = 15000

export function useLineaVoz(): { linea: EstadoLineaVoz | null; motivo: string | null; actualizar: () => void } {
  const [linea, setLinea] = useState<EstadoLineaVoz | null>(null)

  const actualizar = useCallback(() => {
    estadoLineaVoz()
      .then(setLinea)
      // Si no se pudo consultar, no se bloquea: el servidor controla igual al llamar
      .catch(() => setLinea(null))
  }, [])

  useEffect(() => {
    actualizar()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') actualizar()
    }, CADA_MS)
    const alVolver = () => { if (document.visibilityState === 'visible') actualizar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [actualizar])

  return { linea, motivo: linea && !linea.disponible ? motivoSinLinea(linea) : null, actualizar }
}
