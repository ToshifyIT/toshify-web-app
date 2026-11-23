// src/modules/onboarding/distribucion-mapa-v2/components/ui.tsx
//
// Primitivas visuales compartidas del v2. Se mantiene el estilo inline con
// variables CSS del proyecto (var(--bg-primary), var(--text-secondary), ...)
// igual que el resto del módulo de onboarding, para no introducir una
// dependencia de estilos nueva.

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'

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
  // Estilo sobrio (2026-11-17): sin fondo, punto + texto del color, igual que las
  // etiquetas de estado del resto del sistema.
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontWeight: 600,
        padding: '1px 0',
        background: 'transparent',
        color: t.color,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
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
        // Activo en gris oscuro, sin fondo (2026-11-23): el rojo queda para la
        // acción principal y las alertas.
        border: `1px solid ${activo ? 'var(--text-primary)' : 'var(--border-primary)'}`,
        background: 'var(--bg-primary)',
        color: activo ? 'var(--text-primary)' : 'var(--text-secondary)',
        borderRadius: 'var(--radius-full)',
        padding: '4px 10px',
        fontSize: 10.5,
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
        fontSize: 11,
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

/**
 * Ícono "i" que abre una ventanita con una explicación (2026-11-23: los textos de
 * ayuda ocupaban lugar fijo en el panel; ahora se leen sólo cuando se piden).
 * Se abre al pasar el mouse o al tocarlo (celular) y se cierra al tocar afuera
 * o con Escape. La ventanita va con `position: fixed` para que no la recorten
 * los paneles laterales, que tienen `overflow: hidden`.
 */
export function InfoTip({
  children,
  titulo = 'Ayuda',
  ancho = 240,
  tamano = 14,
}: {
  children: React.ReactNode
  titulo?: string
  ancho?: number
  tamano?: number
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [fijado, setFijado] = useState(false)
  const ref = useRef<HTMLSpanElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const abrir = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const margen = 8
    const left = Math.min(Math.max(margen, r.left - 12), window.innerWidth - ancho - margen)
    setPos({ top: r.bottom + 6, left })
  }
  const cerrar = () => {
    setPos(null)
    setFijado(false)
  }

  useEffect(() => {
    if (!pos) return
    const afuera = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !panelRef.current?.contains(t)) cerrar()
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar()
    }
    document.addEventListener('mousedown', afuera)
    document.addEventListener('touchstart', afuera)
    document.addEventListener('keydown', escape)
    window.addEventListener('scroll', cerrar, true)
    window.addEventListener('resize', cerrar)
    return () => {
      document.removeEventListener('mousedown', afuera)
      document.removeEventListener('touchstart', afuera)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('scroll', cerrar, true)
      window.removeEventListener('resize', cerrar)
    }
  }, [pos])

  return (
    <span
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={titulo}
      aria-expanded={!!pos}
      onClick={(e) => {
        // Puede estar dentro del botón de un acordeón: no lo abre ni lo cierra.
        e.stopPropagation()
        e.preventDefault()
        if (fijado) cerrar()
        else {
          abrir()
          setFijado(true)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          if (pos) cerrar()
          else {
            abrir()
            setFijado(true)
          }
        }
      }}
      onMouseEnter={() => { if (!fijado) abrir() }}
      onMouseLeave={() => { if (!fijado) setPos(null) }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        color: pos ? 'var(--text-primary)' : 'var(--text-tertiary)',
        cursor: 'pointer',
        verticalAlign: 'middle',
      }}
    >
      <Info size={tamano} strokeWidth={2.2} />
      {pos && (
        <div
          ref={panelRef}
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: ancho,
            maxHeight: `calc(100vh - ${pos.top + 12}px)`,
            overflowY: 'auto',
            zIndex: 1000,
            padding: '10px 12px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
            color: 'var(--text-secondary)',
            fontSize: 11,
            fontWeight: 500,
            lineHeight: 1.45,
            textAlign: 'left',
            textTransform: 'none',
            letterSpacing: 0,
            whiteSpace: 'normal',
            cursor: 'default',
          }}
        >
          {children}
        </div>
      )}
    </span>
  )
}

/** Ayuda de un filtro: un ícono "i" que muestra el texto al pedirlo. */
export function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 3, display: 'flex' }}>
      <InfoTip>{children}</InfoTip>
    </div>
  )
}

export function GrupoTitulo({
  children,
  destacado,
  ayuda,
}: {
  children: React.ReactNode
  destacado?: boolean
  /** Explicación que se abre con el ícono "i" al lado del título. */
  ayuda?: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: destacado ? 'var(--text-primary)' : 'var(--text-tertiary)',
        marginBottom: 6,
      }}
    >
      <span>{children}</span>
      {ayuda && <InfoTip tamano={13}>{ayuda}</InfoTip>}
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
  ayuda,
  children,
}: {
  titulo: string
  resumen?: string
  destacado?: boolean
  defaultAbierto?: boolean
  /** Explicación que se abre con el ícono "i" al lado del título. */
  ayuda?: React.ReactNode
  children: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(defaultAbierto)
  // Destacado = el filtro aplica: título en gris oscuro (antes rojo).
  const color = destacado ? 'var(--text-primary)' : 'var(--text-secondary)'

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
          fontSize: 11,
          fontWeight: 650,
          color,
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {titulo}
          {ayuda && <InfoTip tamano={13}>{ayuda}</InfoTip>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {resumen && (
            <span style={{ fontSize: 10, fontWeight: 600, color: destacado ? color : 'var(--text-tertiary)' }}>
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
        borderRadius: 'var(--radius-md)',
        background: disabled ? '#f0a7b6' : 'var(--color-primary, #ff0033)',
        color: '#fff',
        fontSize: 11,
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
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-primary)',
        color: 'var(--text-secondary)',
        fontSize: 11,
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
