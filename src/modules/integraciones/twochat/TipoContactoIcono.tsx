/**
 * Ícono del tipo de contacto en 2Chat (llamadas y mensajes): persona = lead,
 * volante = conductor. Reemplaza las etiquetas de texto «Lead» / «Conductor».
 */
import { UserRound } from 'lucide-react'

/** Volante de auto con el mismo trazo que los íconos de lucide (lucide no trae uno) */
function Volante({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M2.5 10.5c3 .8 5.6 1.3 7 1.5" />
      <path d="M21.5 10.5c-3 .8-5.6 1.3-7 1.5" />
      <path d="M12 14.5V22" />
    </svg>
  )
}

export function TipoContactoIcono({ tipo }: { tipo: 'conductor' | 'lead' }) {
  const etiqueta = tipo === 'conductor' ? 'Conductor' : 'Lead'
  return (
    <span className={`tc-tipo tc-tipo--${tipo}`} title={etiqueta} aria-label={etiqueta} role="img">
      {tipo === 'conductor' ? <Volante /> : <UserRound size={15} strokeWidth={2.2} aria-hidden="true" />}
    </span>
  )
}
