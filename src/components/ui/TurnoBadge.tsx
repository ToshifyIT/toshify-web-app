// src/components/ui/TurnoBadge.tsx
// Turno del conductor en estilo sobrio (2026-11-17): sólo el ícono de color, sin fondo
// ni texto (sol = diurno, luna = nocturno, reloj de 24 h = a cargo). El nombre del turno
// aparece al pasar el mouse. Con `conTexto` se agrega el nombre en gris al lado.

import { Moon, Sun } from 'lucide-react'

type Turno = 'diurno' | 'nocturno' | 'a_cargo' | 'sin'

/** Reloj con "24" adentro, para los autos a cargo (todo el día) */
function Reloj24({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2.2" />
      <text
        x="12"
        y="15.6"
        textAnchor="middle"
        fontSize="10"
        fontWeight="800"
        fill={color}
        fontFamily="inherit"
      >
        24
      </text>
    </svg>
  )
}

const CONFIG: Record<Turno, { texto: string; color: string }> = {
  diurno: { texto: 'Diurno', color: '#d97706' },
  nocturno: { texto: 'Nocturno', color: '#4f46e5' },
  a_cargo: { texto: 'A cargo', color: '#7c3aed' },
  sin: { texto: 'Sin pref.', color: 'var(--text-tertiary)' },
}

/** Acepta DIURNO / diurno / NOCTURNO / todo_dia / A_CARGO / SIN_PREFERENCIA / null */
function normalizarTurno(valor: string | null | undefined): Turno {
  const v = (valor || '').toLowerCase()
  if (v === 'diurno') return 'diurno'
  if (v === 'nocturno') return 'nocturno'
  if (v === 'todo_dia' || v === 'a_cargo' || v === 'cargo') return 'a_cargo'
  return 'sin'
}

interface TurnoBadgeProps {
  turno: string | null | undefined
  /** Muestra también el nombre del turno al lado del ícono */
  conTexto?: boolean
  /** Tamaño del ícono en px */
  size?: number
}

export function TurnoBadge({ turno, conTexto = false, size = 14 }: TurnoBadgeProps) {
  const clave = normalizarTurno(turno)
  const { texto, color } = CONFIG[clave]
  // Sin turno no hay ícono: queda el texto en gris
  if (clave === 'sin') {
    // Tamaño fijo chico: si no, hereda el del contenedor y en algunos paneles queda enorme
    return <span style={{ color, whiteSpace: 'nowrap', fontSize: 10 }}>{texto}</span>
  }
  const props = { size, color, strokeWidth: 2.2, 'aria-hidden': true } as const
  return (
    <span
      title={texto}
      aria-label={texto}
      role="img"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        whiteSpace: 'nowrap',
        fontWeight: 500,
        color: 'var(--text-secondary)',
        verticalAlign: 'middle',
      }}
    >
      {clave === 'diurno' && <Sun {...props} />}
      {clave === 'nocturno' && <Moon {...props} />}
      {clave === 'a_cargo' && <Reloj24 size={size} color={color} />}
      {conTexto && texto}
    </span>
  )
}
