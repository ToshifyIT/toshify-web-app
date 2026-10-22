// src/modules/onboarding/distribucion-mapa-v2/components/ui.tsx
//
// Primitivas visuales compartidas del v2. Se mantiene el estilo inline con
// variables CSS del proyecto (var(--bg-primary), var(--text-secondary), ...)
// igual que el resto del módulo de onboarding, para no introducir una
// dependencia de estilos nueva.

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

export type TonoBadge = 'ok' | 'warn' | 'bad' | 'info' | 'neutro'

const TONOS: Record<TonoBadge, { bg: string; color: string }> = {
  ok: { bg: '#e8f6ef', color: '#047857' },
  warn: { bg: '#fef3e2', color: '#b45309' },
  bad: { bg: '#fdeaea', color: '#b91c1c' },
  info: { bg: '#e8effd', color: '#1d4ed8' },
  neutro: { bg: 'var(--bg-secondary)', color: 'var(--text-secondary)' },
}

export function Badge({
  tono = 'neutro',
  children,
}: {
  tono?: TonoBadge
  children: React.ReactNode
}) {
  const t = TONOS[tono]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontWeight: 700,
        borderRadius: 5,
        padding: '2px 6px',
        background: t.bg,
        color: t.color,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

export function Chip({
  activo,
  onClick,
  children,
  title,
}: {
  activo?: boolean
  onClick?: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        border: `1px solid ${activo ? 'var(--color-primary, #ff0033)' : 'var(--border-primary)'}`,
        background: activo ? '#fff1f3' : 'var(--bg-primary)',
        color: activo ? 'var(--color-primary, #ff0033)' : 'var(--text-secondary)',
        borderRadius: 999,
        padding: '4px 10px',
        fontSize: 11.5,
        fontWeight: 600,
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

export function CheckRow({
  label,
  checked,
  onChange,
  icon,
  hint,
  deshabilitado,
}: {
  label: string
  checked: boolean
  onChange: () => void
  icon?: React.ReactNode
  hint?: string
  /** Para opciones que no aplican al contexto actual: se ven, pero no se tocan. */
  deshabilitado?: boolean
}) {
  return (
    <label
      title={hint}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 12,
        color: 'var(--text-primary)',
        cursor: deshabilitado ? 'not-allowed' : 'pointer',
        padding: '1px 0',
        opacity: deshabilitado ? 0.45 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={deshabilitado}
        style={{ cursor: deshabilitado ? 'not-allowed' : 'pointer' }}
      />
      {icon}
      {label}
    </label>
  )
}

export function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3, lineHeight: 1.35 }}>
      {children}
    </div>
  )
}

export function GrupoTitulo({ children, destacado }: { children: React.ReactNode; destacado?: boolean }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: destacado ? 'var(--color-primary, #ff0033)' : 'var(--text-tertiary)',
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  )
}

/**
 * Acordeón de filtros. En la propuesta B los filtros de la izquierda se
 * colapsan para dejarle ancho al mapa y al panel de sugerencias.
 *
 * Filas planas separadas por una línea (sin tarjeta con borde por filtro):
 * ocupan menos alto y el panel se lee como una lista. "Destacado" sólo pinta
 * el título en rojo.
 */
export function Acordeon({
  titulo,
  resumen,
  destacado,
  defaultAbierto = false,
  children,
}: {
  titulo: string
  resumen?: string
  destacado?: boolean
  defaultAbierto?: boolean
  children: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(defaultAbierto)
  const color = destacado ? 'var(--color-primary, #ff0033)' : 'var(--text-secondary)'

  return (
    <div style={{ borderBottom: '1px solid var(--border-primary)' }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '7px 2px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 650,
          color,
          textAlign: 'left',
        }}
      >
        <span>{titulo}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {resumen && (
            <span style={{ fontSize: 11, fontWeight: 600, color: destacado ? color : 'var(--text-tertiary)' }}>
              {resumen}
            </span>
          )}
          <ChevronDown
            size={14}
            style={{ transform: abierto ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}
          />
        </span>
      </button>
      {abierto && (
        <div style={{ padding: '0 2px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {children}
        </div>
      )}
    </div>
  )
}

export function BotonPrimario({
  onClick,
  children,
  disabled,
  full,
}: {
  onClick?: () => void
  children: React.ReactNode
  disabled?: boolean
  full?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '5px 12px',
        border: 'none',
        borderRadius: 8,
        background: disabled ? '#f0a7b6' : 'var(--color-primary, #ff0033)',
        color: '#fff',
        fontSize: 12,
        fontWeight: 650,
        cursor: disabled ? 'not-allowed' : 'pointer',
        width: full ? '100%' : undefined,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

export function BotonSecundario({
  onClick,
  children,
  full,
}: {
  onClick?: () => void
  children: React.ReactNode
  full?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '4px 11px',
        border: '1px solid var(--border-primary)',
        borderRadius: 8,
        background: 'var(--bg-primary)',
        color: 'var(--text-secondary)',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        width: full ? '100%' : undefined,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}
