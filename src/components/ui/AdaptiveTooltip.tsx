import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface AdaptiveTooltipProps {
  /** Contenido del tooltip (string o JSX) */
  content: React.ReactNode
  /** Elemento trigger (el icono u otro elemento) */
  children: React.ReactNode
  /** Ancho del tooltip en px (default 240) */
  width?: number
  /** Tema visual */
  variant?: 'dark' | 'card'
}

/**
 * Tooltip adaptativo que siempre se mantiene visible dentro del viewport.
 * Usa createPortal + position:fixed para escapar de cualquier overflow:hidden.
 * Calcula dinámicamente si debe mostrarse arriba/abajo y ajusta
 * horizontalmente para no salirse de los bordes.
 */
export function AdaptiveTooltip({
  content,
  children,
  width = 240,
  variant = 'dark',
}: AdaptiveTooltipProps) {
  const [visible, setVisible] = useState(false)
  const [layout, setLayout] = useState({
    top: 0,
    left: 0,
    arrowLeft: '50%',
    showBelow: true,
  })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const MARGIN = 12

  const handleEnter = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const showBelow = rect.top < 120

    const iconCenterX = rect.left + rect.width / 2
    let tooltipLeft = iconCenterX - width / 2

    // Clamp horizontal
    if (tooltipLeft < MARGIN) tooltipLeft = MARGIN
    if (tooltipLeft + width > vw - MARGIN) tooltipLeft = vw - MARGIN - width

    const arrowLeftPx = Math.max(14, Math.min(width - 14, iconCenterX - tooltipLeft))

    setLayout({
      top: showBelow ? rect.bottom + 8 : rect.top - 8,
      left: tooltipLeft,
      arrowLeft: `${arrowLeftPx}px`,
      showBelow,
    })
    setVisible(true)
  }, [width])

  const isDark = variant === 'dark'
  const bg = isDark ? '#1e293b' : '#ffffff'
  const textColor = isDark ? '#ffffff' : '#1e293b'
  const borderStyle = isDark ? 'none' : '1px solid #e2e8f0'

  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    top: layout.top,
    left: layout.left,
    transform: layout.showBelow ? 'none' : 'translateY(-100%)',
    background: bg,
    color: textColor,
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: '1.5',
    padding: '10px 14px',
    borderRadius: '8px',
    border: borderStyle,
    whiteSpace: 'normal',
    width: `${width}px`,
    zIndex: 99999,
    pointerEvents: 'none' as const,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    textTransform: 'none' as const,
    letterSpacing: 'normal',
  }

  const arrowStyle: React.CSSProperties = {
    position: 'absolute',
    left: layout.arrowLeft,
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    border: '6px solid transparent',
    ...(layout.showBelow
      ? { top: '-12px', borderBottomColor: isDark ? bg : '#e2e8f0' }
      : { bottom: '-12px', borderTopColor: isDark ? bg : '#e2e8f0' }),
  }

  // Segunda capa para tapar el borde en variante card
  const arrowInnerStyle: React.CSSProperties | null =
    !isDark
      ? {
          position: 'absolute',
          left: layout.arrowLeft,
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          border: '5px solid transparent',
          ...(layout.showBelow
            ? { top: '-10px', borderBottomColor: bg }
            : { bottom: '-10px', borderTopColor: bg }),
        }
      : null

  return (
    <>
      <span
        ref={triggerRef}
        style={{ display: 'inline-flex', alignItems: 'center', cursor: 'help' }}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setVisible(false)}
      >
        {children}
      </span>
      {visible &&
        createPortal(
          <div style={tooltipStyle}>
            {content}
            <span style={arrowStyle} />
            {arrowInnerStyle && <span style={arrowInnerStyle} />}
          </div>,
          document.body
        )}
    </>
  )
}
