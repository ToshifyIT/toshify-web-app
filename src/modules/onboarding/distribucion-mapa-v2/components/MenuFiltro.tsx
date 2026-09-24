// src/modules/onboarding/distribucion-mapa-v2/components/MenuFiltro.tsx
//
// Desplegable de selección múltiple para la BARRA SUPERIOR.
//
// El sidebar usa acordeones, que empujan el contenido hacia abajo: perfecto en
// una columna, imposible en una barra horizontal. Por eso este control abre un
// panel flotante en vez de expandirse en línea.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'

export interface OpcionMenu {
  valor: string
  cantidad: number
}

/** A partir de cuántas opciones aparece el buscador dentro del panel. */
const OPCIONES_PARA_BUSCADOR = 12

export function MenuFiltro({
  titulo,
  opciones,
  seleccion,
  onChange,
  anchoPanel = 230,
  vacio = 'Todos',
}: {
  titulo: string
  opciones: OpcionMenu[]
  seleccion: Set<string>
  /** Recibe el set completo ya actualizado. */
  onChange: (next: Set<string>) => void
  anchoPanel?: number
  /** Texto cuando no hay nada tildado (= no filtra). */
  vacio?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const contenedorRef = useRef<HTMLDivElement | null>(null)

  // Cerrar al hacer clic afuera. Sin esto el panel queda flotando sobre el mapa
  // y tapa justo lo que el operador quiere mirar.
  useEffect(() => {
    if (!abierto) return
    const alClickear = (e: MouseEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) setAbierto(false)
    }
    const alEscapar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', alClickear)
    document.addEventListener('keydown', alEscapar)
    return () => {
      document.removeEventListener('mousedown', alClickear)
      document.removeEventListener('keydown', alEscapar)
    }
  }, [abierto])

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return opciones
    return opciones.filter((o) => o.valor.toLowerCase().includes(q))
  }, [opciones, busqueda])

  const resumen = seleccion.size === 0 ? vacio : `${seleccion.size} activo${seleccion.size === 1 ? '' : 's'}`
  const activo = seleccion.size > 0

  const alternar = (valor: string) => {
    const next = new Set(seleccion)
    if (next.has(valor)) next.delete(valor)
    else next.add(valor)
    onChange(next)
  }

  return (
    <div ref={contenedorRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 11px',
          border: `1px solid ${activo ? 'var(--color-primary, #ff0033)' : 'var(--border-primary)'}`,
          borderRadius: 8,
          background: activo ? '#fff5f7' : 'var(--bg-primary)',
          color: activo ? 'var(--color-primary, #ff0033)' : 'var(--text-secondary)',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {titulo}
        <span style={{ fontWeight: 500, color: activo ? 'inherit' : 'var(--text-tertiary)' }}>
          {resumen}
        </span>
        <ChevronDown size={13} style={{ transform: abierto ? 'rotate(180deg)' : undefined }} />
      </button>

      {abierto && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 5px)',
            left: 0,
            width: anchoPanel,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            // Por encima del mapa de Google, que trae sus propios z-index altos.
            zIndex: 1200,
            padding: 8,
          }}
        >
          {opciones.length >= OPCIONES_PARA_BUSCADOR && (
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <Search
                size={12}
                style={{
                  position: 'absolute',
                  left: 7,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={`Buscar ${titulo.toLowerCase()}...`}
                autoFocus
                style={{
                  width: '100%',
                  padding: '6px 8px 6px 24px',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 7,
                  fontSize: 12,
                  outline: 'none',
                  boxSizing: 'border-box',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          )}

          {activo && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                marginBottom: 6,
                padding: '3px 8px',
                border: '1px solid var(--border-primary)',
                borderRadius: 6,
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <X size={11} /> Quitar selección
            </button>
          )}

          {filtradas.length === 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', padding: '6px 2px' }}>
              Sin resultados.
            </div>
          )}

          {filtradas.map(({ valor, cantidad }) => {
            const tildado = seleccion.has(valor)
            return (
              <button
                key={valor}
                type="button"
                onClick={() => alternar(valor)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  width: '100%',
                  padding: '5px 6px',
                  border: 'none',
                  borderRadius: 6,
                  background: tildado ? '#fff5f7' : 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: 12.5,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 14,
                    height: 14,
                    flexShrink: 0,
                    border: `1px solid ${tildado ? 'var(--color-primary, #ff0033)' : 'var(--border-primary)'}`,
                    borderRadius: 4,
                    background: tildado ? 'var(--color-primary, #ff0033)' : 'transparent',
                    color: '#fff',
                  }}
                >
                  {tildado && <Check size={10} strokeWidth={3} />}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {valor}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{cantidad}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
