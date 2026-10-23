// Filtro "Desde / Hasta" de Marcaciones (Km, Tiempo conducido en horas).
// El rango del DataTable usa <input type="number">, que no acepta coma decimal;
// este acepta "2,4" y "2.4". Mismo patron que ExcelColumnFilter (portal + posicion fija).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { parseDecimal } from '../utils/parseDecimal';

const FilterIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 8 6" fill="currentColor">
    <path d="M0.5 0.5L4 5L7.5 0.5H0.5Z" />
  </svg>
);

interface RangoFilterProps {
  label: string;
  /** Ejemplo que se muestra en los inputs vacios. */
  placeholder?: string;
  /** Texto de ayuda debajo de los inputs (ej. como escribir horas y minutos). */
  ayuda?: ReactNode;
  /** Equivalencia del valor tipeado, debajo de cada input (ej. 0,25 -> "15 min"). */
  describir?: (valor: number) => string;
  /** Rango vigente en el padre; se lee al montar para no perderlo al recrear la columna. */
  rangoRef: RefObject<{ min: string; max: string }>;
  onChange: (min: string, max: string) => void;
  /** Al cambiar, el componente se monta de nuevo con los inputs vacios. */
  resetKey: number;
  filterId: string;
  openFilterId: string | null;
  onOpenChange: (filterId: string | null) => void;
}

export function RangoFilter({ label, placeholder, ayuda, describir, rangoRef, onChange, resetKey, filterId, openFilterId, onOpenChange }: RangoFilterProps) {
  return (
    <RangoFilterInner key={resetKey} label={label} placeholder={placeholder}
      ayuda={ayuda} describir={describir} rangoRef={rangoRef} onChange={onChange}
      filterId={filterId} openFilterId={openFilterId} onOpenChange={onOpenChange} />
  );
}

function RangoFilterInner({ label, placeholder = '0,00', ayuda, describir, rangoRef, onChange, filterId, openFilterId, onOpenChange }: Omit<RangoFilterProps, 'resetKey'>) {
  // El texto vive aca y no en el padre: la columna no se recrea al tipear.
  const [min, setMin] = useState(() => rangoRef.current.min);
  const [max, setMax] = useState(() => rangoRef.current.max);
  const actualizar = (desde: string, hasta: string) => {
    setMin(desde);
    setMax(hasta);
    onChange(desde, hasta);
  };
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const isOpen = openFilterId === filterId;
  const isActive = parseDecimal(min) !== undefined || parseDecimal(max) !== undefined;

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const ancho = dropdownRef.current?.getBoundingClientRect().width || 260;
    setPosition({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - ancho - 8)),
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)
        && buttonRef.current && !buttonRef.current.contains(target)) {
        onOpenChange(null);
      }
    };
    const handleScroll = () => onOpenChange(null);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, onOpenChange]);

  // Solo digitos, un separador decimal (coma o punto) y punto de miles.
  const limpiar = (v: string) => v.replace(/[^\d.,]/g, '');

  const equivalencia = (texto: string) => {
    const n = parseDecimal(texto);
    if (!describir || n === undefined) return null;
    return (
      <span style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
        = {describir(n)}
      </span>
    );
  };

  return (
    <div className="dt-column-filter">
      <span>{label}</span>
      <button
        ref={buttonRef}
        type="button"
        className={`dt-column-filter-btn ${isActive ? 'active' : ''}`}
        onClick={(e) => { e.stopPropagation(); onOpenChange(isOpen ? null : filterId); }}
        title={`Filtrar por ${label.toLowerCase()}`}
      >
        <FilterIcon />
      </button>
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="dt-column-filter-dropdown dt-filter-portal"
          style={{ position: 'fixed', top: position.top, left: position.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="dt-filter-number-range">
            <div className="dt-filter-number-row">
              <label className="dt-filter-number-label">
                <span>Desde</span>
                <div className="dt-filter-number-input-wrap">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={placeholder}
                    value={min}
                    onChange={e => actualizar(limpiar(e.target.value), max)}
                    className="dt-filter-number-input"
                    autoFocus
                  />
                </div>
                {equivalencia(min)}
              </label>
              <label className="dt-filter-number-label">
                <span>Hasta</span>
                <div className="dt-filter-number-input-wrap">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={placeholder}
                    value={max}
                    onChange={e => actualizar(min, limpiar(e.target.value))}
                    className="dt-filter-number-input"
                  />
                </div>
                {equivalencia(max)}
              </label>
            </div>
            {ayuda && (
              <div style={{
                marginTop: '10px', padding: '8px 10px', borderRadius: '6px', maxWidth: '300px',
                background: 'var(--bg-secondary)', fontSize: '11px', lineHeight: 1.5,
                color: 'var(--text-secondary)',
              }}>
                {ayuda}
              </div>
            )}
          </div>
          {isActive && (
            <button type="button" className="dt-column-filter-clear" onClick={() => actualizar('', '')}>
              Limpiar
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
