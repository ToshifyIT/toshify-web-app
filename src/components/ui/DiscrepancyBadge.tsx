/**
 * DiscrepancyBadge - Inline warning indicator for data normalization discrepancies.
 *
 * Shows a small warning icon when raw values from different data sources
 * differ but normalize to the same canonical value.
 * Clicking reveals the raw values from each source.
 */

import { useState, useRef, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface DiscrepancyDetail {
  source: string;
  rawValue: string;
}

interface DiscrepancyBadgeProps {
  details: DiscrepancyDetail[];
  normalizedValue: string;
  size?: number;
}

export function DiscrepancyBadge({ details, normalizedValue, size = 12 }: DiscrepancyBadgeProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (details.length < 2) return null;

  // Check if all raw values are the same (no discrepancy)
  const uniqueRaw = new Set(details.map(d => d.rawValue.trim()));
  if (uniqueRaw.size <= 1) return null;

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4 }}>
      <span title="Discrepancia de formato entre fuentes">
        <AlertTriangle
          size={size}
          style={{
            color: 'var(--color-warning)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        />
      </span>
      {open && (
        <div
          ref={popoverRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 9999,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 6,
            padding: '8px 12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            minWidth: 220,
            fontSize: 11,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--color-warning-dark)' }}>
            Discrepancia de formato
          </div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: 10 }}>
            Normalizado: <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>{normalizedValue}</code>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {details.map((d, i) => (
                <tr key={i}>
                  <td style={{ padding: '2px 6px 2px 0', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {d.source}:
                  </td>
                  <td style={{
                    padding: '2px 0',
                    fontFamily: 'monospace',
                    color: d.rawValue.trim() === normalizedValue ? 'var(--text-primary)' : 'var(--color-warning-dark)',
                    fontWeight: d.rawValue.trim() === normalizedValue ? 400 : 600,
                  }}>
                    {d.rawValue || '(vacio)'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </span>
  );
}
