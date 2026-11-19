import type { CSSProperties } from 'react';
import { ShieldCheck } from 'lucide-react';

// Marca discreta (2026-11-19): solo el ícono (escudo), sin caja ni texto, para que no
// compita con la patente. El nombre completo sale al pasar el mouse.
const ESTILO: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  color: 'var(--color-info)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.3px',
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
};

/**
 * Indicador de vehiculo con seguro de Responsabilidad Civil.
 * Con tarifa nueva su carta oferta sale de la plantilla RC.
 */
export function RcBadge({ style, className }: { style?: CSSProperties; className?: string }) {
  return (
    <span
      className={className}
      style={{ ...ESTILO, ...style }}
      title="RC – Seguro de Responsabilidad Civil: con tarifa nueva se usa la plantilla de carta oferta RC"
      aria-label="RC: seguro de Responsabilidad Civil"
      role="img"
    >
      <ShieldCheck size={13} strokeWidth={2.5} aria-hidden="true" />
    </span>
  );
}

export default RcBadge;
