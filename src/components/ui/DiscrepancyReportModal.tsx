/**
 * DiscrepancyReportModal - Consolidated view of all data format discrepancies.
 *
 * Queries conductores and cabify_historico to find DNIs that match after
 * normalization but differ in raw format. Shows a table for review.
 */

import { useState, useEffect } from 'react';
import { X, AlertTriangle, Search, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { normalizeDni, normalizePatente } from '../../utils/normalizeDocuments';

interface Discrepancy {
  type: 'DNI' | 'Patente';
  conductor: string;
  conductorId: string;
  sourceA: string;
  rawA: string;
  sourceB: string;
  rawB: string;
  normalized: string;
}

interface DiscrepancyReportModalProps {
  onClose: () => void;
}

export function DiscrepancyReportModal({ onClose }: DiscrepancyReportModalProps) {
  const [loading, setLoading] = useState(true);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    loadDiscrepancies();
  }, []);

  async function loadDiscrepancies() {
    setLoading(true);
    try {
      const results: Discrepancy[] = [];

      // 1. Get all conductores with DNI
      const { data: conductores } = await supabase
        .from('conductores')
        .select('id, nombres, apellidos, numero_dni')
        .not('numero_dni', 'is', null);

      if (!conductores || conductores.length === 0) {
        setDiscrepancies([]);
        return;
      }

      // 2. Get unique DNIs from cabify_historico
      const { data: cabifyDnis } = await supabase
        .from('cabify_historico')
        .select('dni')
        .not('dni', 'is', null)
        .limit(5000);

      // Build map: normalizedDni -> Set of raw values from cabify
      const cabifyRawByNorm = new Map<string, Set<string>>();
      for (const row of (cabifyDnis || [])) {
        if (!row.dni) continue;
        const norm = normalizeDni(row.dni);
        if (!norm) continue;
        if (!cabifyRawByNorm.has(norm)) cabifyRawByNorm.set(norm, new Set());
        cabifyRawByNorm.get(norm)!.add(String(row.dni));
      }

      // 3. Compare conductor DNIs with cabify DNIs
      for (const c of conductores) {
        if (!c.numero_dni) continue;
        const norm = normalizeDni(c.numero_dni);
        if (!norm) continue;

        const cabifyRaws = cabifyRawByNorm.get(norm);
        if (!cabifyRaws) continue;

        for (const cabifyRaw of cabifyRaws) {
          if (String(c.numero_dni).trim() !== cabifyRaw.trim()) {
            results.push({
              type: 'DNI',
              conductor: `${c.nombres} ${c.apellidos}`,
              conductorId: c.id,
              sourceA: 'Conductores',
              rawA: String(c.numero_dni),
              sourceB: 'Cabify',
              rawB: cabifyRaw,
              normalized: norm,
            });
          }
        }
      }

      // 4. Get vehiculos + multas for patente discrepancies
      const { data: vehiculos } = await supabase
        .from('vehiculos')
        .select('id, patente')
        .is('deleted_at', null);

      const { data: multas } = await supabase
        .from('multas')
        .select('patente')
        .not('patente', 'is', null)
        .limit(2000);

      const multasRawByNorm = new Map<string, Set<string>>();
      for (const m of (multas || [])) {
        if (!m.patente) continue;
        const norm = normalizePatente(m.patente);
        if (!norm) continue;
        if (!multasRawByNorm.has(norm)) multasRawByNorm.set(norm, new Set());
        multasRawByNorm.get(norm)!.add(String(m.patente));
      }

      for (const v of (vehiculos || [])) {
        if (!v.patente) continue;
        const norm = normalizePatente(v.patente);
        if (!norm) continue;

        const multasRaws = multasRawByNorm.get(norm);
        if (multasRaws) {
          for (const multaRaw of multasRaws) {
            if (String(v.patente).trim() !== multaRaw.trim()) {
              results.push({
                type: 'Patente',
                conductor: v.patente,
                conductorId: v.id,
                sourceA: 'Vehiculos',
                rawA: String(v.patente),
                sourceB: 'Multas',
                rawB: multaRaw,
                normalized: norm,
              });
            }
          }
        }
      }

      setDiscrepancies(results);
    } catch {
      setDiscrepancies([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = filter
    ? discrepancies.filter(d =>
        d.conductor.toLowerCase().includes(filter.toLowerCase()) ||
        d.rawA.includes(filter) ||
        d.rawB.includes(filter) ||
        d.normalized.includes(filter)
      )
    : discrepancies;

  const dniCount = filtered.filter(d => d.type === 'DNI').length;
  const patenteCount = filtered.filter(d => d.type === 'Patente').length;

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: 'var(--bg-primary)', borderRadius: 8, width: '90%', maxWidth: 900, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              Discrepancias de Formato
            </h3>
            {!loading && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
                {discrepancies.length === 0 ? 'Sin discrepancias' : `${discrepancies.length} encontradas`}
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Descripción */}
        <div style={{ padding: '10px 20px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, borderBottom: '1px solid var(--border-secondary)' }}>
          Compara el DNI y patente guardados en Conductores contra los datos que llegan de Cabify. Si un mismo dato está escrito diferente (ej: con cero adelante, con guión, etc.), aparece acá para que se corrija en el sistema que corresponda.
        </div>

        {/* Summary badges */}
        {!loading && discrepancies.length > 0 && (
          <div style={{ padding: '8px 20px', display: 'flex', gap: 12, borderBottom: '1px solid var(--border-secondary)' }}>
            <span className="dt-badge dt-badge-orange" style={{ fontSize: 11 }}>
              DNI: {dniCount}
            </span>
            <span className="dt-badge dt-badge-solid-gray" style={{ fontSize: 11 }}>
              Patente: {patenteCount}
            </span>
            <div style={{ flex: 1 }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={14} style={{ position: 'absolute', left: 8, color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                placeholder="Buscar..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                style={{
                  padding: '4px 8px 4px 28px',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 4,
                  fontSize: 11,
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  width: 200,
                }}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 16px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8, color: 'var(--text-secondary)' }}>
              <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
              Analizando datos...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>
              {discrepancies.length === 0
                ? 'Todos los datos son consistentes entre fuentes'
                : 'Sin resultados para el filtro aplicado'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-secondary)', fontWeight: 600 }}>Tipo</th>
                  <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-secondary)', fontWeight: 600 }}>Conductor/Vehiculo</th>
                  <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-secondary)', fontWeight: 600 }}>Conductores</th>
                  <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-secondary)', fontWeight: 600 }}>Cabify</th>
                  <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-secondary)', fontWeight: 600 }}>Normalizado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                    <td style={{ padding: '6px' }}>
                      <span className={d.type === 'DNI' ? 'dt-badge dt-badge-orange' : 'dt-badge dt-badge-solid-gray'} style={{ fontSize: 10 }}>
                        {d.type}
                      </span>
                    </td>
                    <td style={{ padding: '6px', fontWeight: 500 }}>{d.conductor}</td>
                    <td style={{ padding: '6px', fontFamily: 'monospace', color: 'var(--color-info-dark)' }}>{d.rawA}</td>
                    <td style={{ padding: '6px', fontFamily: 'monospace', color: 'var(--color-warning-dark)' }}>{d.rawB}</td>
                    <td style={{ padding: '6px', fontFamily: 'monospace', fontWeight: 600 }}>{d.normalized}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
