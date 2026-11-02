// src/pages/NotFoundPage.tsx
// Se muestra dentro del layout cuando la dirección no corresponde a ningún módulo
// (antes la pantalla quedaba en blanco).
import { Link, useLocation } from 'react-router-dom'
import { Compass } from 'lucide-react'
import './NotFoundPage.css'

export default function NotFoundPage() {
  const { pathname } = useLocation()
  return (
    <div className="not-found">
      <Compass size={48} className="not-found-icon" aria-hidden="true" />
      <h1 className="not-found-title">No encontramos esta página</h1>
      <p className="not-found-text">
        La dirección <code>{pathname}</code> no corresponde a ningún módulo. Puede que el enlace
        esté mal escrito o que el módulo haya cambiado de lugar.
      </p>
      <Link to="/" className="btn-primary">Ir al inicio</Link>
    </div>
  )
}
