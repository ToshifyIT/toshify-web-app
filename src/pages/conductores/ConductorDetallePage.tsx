// src/pages/conductores/ConductorDetallePage.tsx
// Detalle "Ver mis datos" de un conductor: reusa el portal Mi Espacio en modo
// embebido (sin login, sin boton de salir), mostrando las pestanas de
// facturacion, multas y km recorridos con la misma data que ve el conductor.
// El parametro de la ruta acepta el UUID del conductor o su DNI.
import { useParams } from 'react-router-dom'
import { PortalPage } from '../../modules/portal/PortalPage'

export function ConductorDetallePage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div style={{ padding: '8px' }}>
      {id ? <PortalPage embeddedConductorId={id} /> : <div>Conductor no encontrado.</div>}
    </div>
  )
}
