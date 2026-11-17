// src/components/ui/LogosApp.tsx
// Logos chicos de Cabify y DiDi para usar en lugar de la etiqueta de texto (2026-11-17).
// Son SVG simples (wordmark + isotipo) para que se lean bien a 12–14px de alto.

interface LogoProps {
  /** Alto en px; el ancho se ajusta solo */
  alto?: number
}

export function LogoCabify({ alto = 12 }: LogoProps) {
  return (
    <svg
      viewBox="0 0 62 20"
      height={alto}
      width={(alto * 62 / 20).toFixed(1)}
      role="img"
      aria-label="Cabify"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <title>Cabify</title>
      <text
        x="0"
        y="15"
        fill="#7145D6"
        fontSize="19"
        fontWeight="800"
        letterSpacing="-0.6"
        fontFamily="inherit"
      >
        cabify
      </text>
    </svg>
  )
}

/** Wordmark de Geotab (azul, letras finas y anchas) para el kilometraje automático */
export function LogoGeotab({ alto = 10 }: LogoProps) {
  return (
    <svg
      viewBox="0 0 86 14"
      height={alto}
      width={(alto * 86 / 14).toFixed(1)}
      role="img"
      aria-label="Geotab"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <title>Geotab</title>
      <text
        x="0"
        y="12"
        fill="#25477B"
        fontSize="14"
        fontWeight="500"
        letterSpacing="1.6"
        fontFamily="inherit"
      >
        GEOTAB
      </text>
    </svg>
  )
}

export function LogoDidi({ alto = 12 }: LogoProps) {
  return (
    <svg
      // 112 de ancho (antes 108): con algunas fuentes la última "i" de "DiDi" quedaba cortada
      viewBox="0 0 112 38"
      height={alto}
      width={(alto * 112 / 38).toFixed(1)}
      role="img"
      aria-label="DiDi"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <title>DiDi</title>
      {/* Isotipo naranja: media luna con el escalón arriba a la derecha */}
      <path
        fill="#FF6600"
        fillRule="evenodd"
        d="M0 1.5Q0 0 1.5 0H37.8V8.5H47V14.5A23.5 23.5 0 0 1 0 14.5ZM9.2 9.5Q9.2 8.5 10.2 8.5H37.8V15A14.3 14.3 0 0 1 9.2 15Z"
      />
      <text
        x="53"
        y="31"
        // Gris oscuro en modo claro; en modo oscuro toma el color de texto
        style={{ fill: 'var(--text-primary, #2E2E2E)' }}
        fontSize="33"
        fontWeight="700"
        letterSpacing="-0.5"
        fontFamily="inherit"
      >
        DiDi
      </text>
    </svg>
  )
}
