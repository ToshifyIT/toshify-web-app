/**
 * DiscrepancyReportModal - Consolidated view of Cabify matching issues.
 *
 * Two sections:
 * 1. "Sin match": conductores del período que no cruzan con cabify_historico
 *    por ninguna clave (DNI → CUIT → licencia → nombre normalizado), replicando
 *    la misma cascada de match que usa la carga de facturación.
 * 2. Discrepancias de formato: mismo valor normalizado pero escrito diferente
 *    entre fuentes (DNI/CUIT vs Cabify, patente vs multas).
 */

import { useState, useEffect, Fragment, type CSSProperties } from 'react';
import { X, AlertTriangle, Search, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { normalizeDni, normalizePatente, normalizeCuit } from '../../utils/normalizeDocuments';

// Mismos valores que ReporteFacturacionTab (getCabifyTable / ESTADO_ACTIVO_ID_LOAD)
const SEDE_BARILOCHE_ID = 'f37193f7-5805-4d87-820d-c4521824860e';
const ESTADO_ACTIVO_ID = '57e9de5f-e6fc-4ff7-8d14-cf8e13e9dbe2';

// Réplica exacta de la normalización de nombre del cruce de facturación
// (NFD sin tildes, mayúsculas, espacios colapsados — NO quita puntuación)
function normalizeNombreBilling(nombre: string | null, apellido: string | null): string {
  return `${nombre || ''} ${apellido || ''}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

// Réplica de la normalización de licencia del cruce (solo dígitos, mínimo 7)
function normalizeLicenciaBilling(value: string | null | undefined): string {
  const digits = String(value || '').replace(/\D/g, '').trim();
  return digits.length >= 7 ? digits : '';
}

interface Discrepancy {
  type: 'DNI' | 'CUIT' | 'Patente';
  conductor: string;
  conductorId: string;
  sourceA: string;
  rawA: string;
  sourceB: string;
  rawB: string;
  normalized: string;
}

interface SinMatchRow {
  conductorId: string;
  conductor: string;
  dni: string;
  cuit: string;
  licencia: string;
  /** Última aparición del conductor en Cabify (cualquier fecha), para comparar cómo viene en cada fuente */
  ultimoCabify: { nombre: string; dni: string; licencia: string; fecha: string } | null;
  /** Clave por la que cruza con el histórico de Cabify (prioridad DNI → CUIT → Licencia → Nombre).
   *  Si tiene valor, el dato está bien y NO es discrepancia: solo le falta actividad esta semana. */
  matchKey: 'DNI' | 'CUIT' | 'Licencia' | 'Nombre' | null;
}

interface DiscrepancyReportModalProps {
  onClose: () => void;
  /** Período generado: se usan los conductores de facturacion_conductores */
  periodoId?: string | null;
  /** Rango de fechas de la semana visible (yyyy-MM-dd) */
  periodoInicio: string;
  periodoFin: string;
  sedeId?: string | null;
}

export function DiscrepancyReportModal({ onClose, periodoId, periodoInicio, periodoFin, sedeId }: DiscrepancyReportModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [sinMatch, setSinMatch] = useState<SinMatchRow[]>([]);
  const [hashesSinMapear, setHashesSinMapear] = useState(0);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    loadDiscrepancies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDiscrepancies() {
    setLoading(true);
    setError(null);
    try {
      const results: Discrepancy[] = [];
      const sinMatchRows: SinMatchRow[] = [];

      // 1. Universo de conductores: los del período si está generado,
      //    sino (vista previa) los activos de la sede
      let conductorIds: string[] | null = null;
      if (periodoId) {
        const { data: factRows, error: errFact } = await supabase
          .from('facturacion_conductores')
          .select('conductor_id')
          .eq('periodo_id', periodoId);
        if (errFact) throw errFact;
        conductorIds = (factRows || []).map((r: any) => r.conductor_id).filter(Boolean);
      }

      let qConductores = supabase
        .from('conductores')
        .select('id, nombres, apellidos, numero_dni, numero_cuit, numero_licencia')
        .limit(5000);
      if (conductorIds) {
        qConductores = qConductores.in('id', conductorIds);
      } else {
        qConductores = qConductores.eq('estado_id', ESTADO_ACTIVO_ID);
        if (sedeId) qConductores = qConductores.eq('sede_id', sedeId);
      }
      const { data: conductores, error: errCond } = conductorIds && conductorIds.length === 0
        ? { data: [] as any[], error: null }
        : await qConductores;
      if (errCond) throw errCond;

      // 2. Cabify del período (tabla según sede) + mapeo de hashes CABIFY_xxx → DNI real
      const cabifyTable = sedeId === SEDE_BARILOCHE_ID ? 'cabify_historico_bariloche' : 'cabify_historico';
      const [cabifyRes, mapeoRes] = await Promise.all([
        supabase
          .from(cabifyTable)
          .select('dni, licencia, nombre, apellido')
          .gte('fecha_inicio', periodoInicio + 'T00:00:00')
          .lte('fecha_inicio', periodoFin + 'T23:59:59')
          .limit(10000),
        supabase.from('cabify_dni_mapeo').select('cabify_hash, dni_real'),
      ]);
      if (cabifyRes.error) throw cabifyRes.error;
      if (mapeoRes.error) throw mapeoRes.error;

      const hashMap = new Map<string, string>(
        (mapeoRes.data || []).map((m: any) => [m.cabify_hash, m.dni_real])
      );

      // 3. Índices Cabify. Regla de cruce: con que UNA clave coincida hay match,
      //    evaluando en orden de prioridad DNI → CUIT → licencia → nombre.
      //    Licencia y nombre se indexan de TODOS los registros (no solo hashes sin mapear).
      const cabifyDniNorms = new Set<string>();
      const cabifyRawByNorm = new Map<string, Set<string>>(); // solo raws no-hash, para discrepancias de formato
      const cabifyLicSet = new Set<string>();
      const cabifyNombreSet = new Set<string>();
      const hashesNoMapeados = new Set<string>();

      for (const row of (cabifyRes.data || []) as any[]) {
        const raw = row.dni ? String(row.dni) : '';
        let dniReal: string | null = null;
        let esHash = false;
        if (raw.startsWith('CABIFY_')) {
          esHash = true;
          dniReal = hashMap.get(raw) || null;
          if (!dniReal) hashesNoMapeados.add(raw);
        } else if (raw) {
          dniReal = raw;
        }

        if (dniReal) {
          const norm = normalizeDni(dniReal);
          if (norm) {
            cabifyDniNorms.add(norm);
            if (!esHash) {
              if (!cabifyRawByNorm.has(norm)) cabifyRawByNorm.set(norm, new Set());
              cabifyRawByNorm.get(norm)!.add(raw);
            }
          }
        }

        const lic = normalizeLicenciaBilling(row.licencia);
        if (lic) cabifyLicSet.add(lic);
        const nom = normalizeNombreBilling(row.nombre, row.apellido);
        if (nom) cabifyNombreSet.add(nom);
      }
      setHashesSinMapear(hashesNoMapeados.size);

      // 4. Cruzar cada conductor: prioridad DNI → CUIT → licencia → nombre.
      //    Con que una clave coincida, hay match. Si ninguna → "Sin match".
      for (const c of (conductores || []) as any[]) {
        const nombreCompleto = `${c.nombres || ''} ${c.apellidos || ''}`.trim();
        const dniNorm = normalizeDni(c.numero_dni);
        const cuitNorm = normalizeCuit(c.numero_cuit);
        const licNorm = normalizeLicenciaBilling(c.numero_licencia);
        const nomNorm = normalizeNombreBilling(c.nombres, c.apellidos);

        const matchDni = !!dniNorm && cabifyDniNorms.has(dniNorm);
        const matchCuit = !!cuitNorm && cabifyDniNorms.has(cuitNorm);
        const matchLic = !!licNorm && cabifyLicSet.has(licNorm);
        const matchNombre = !!nomNorm && cabifyNombreSet.has(nomNorm);

        if (!matchDni && !matchCuit && !matchLic && !matchNombre) {
          sinMatchRows.push({
            conductorId: c.id,
            conductor: nombreCompleto,
            dni: String(c.numero_dni || '-'),
            cuit: String(c.numero_cuit || '-'),
            licencia: String(c.numero_licencia || '-'),
            ultimoCabify: null,
            matchKey: null,
          });
          continue;
        }

        // Discrepancias de formato: matchea normalizado pero el texto crudo difiere
        if (matchDni) {
          for (const cabifyRaw of (cabifyRawByNorm.get(dniNorm) || [])) {
            if (String(c.numero_dni).trim() !== cabifyRaw.trim()) {
              results.push({
                type: 'DNI',
                conductor: nombreCompleto,
                conductorId: c.id,
                sourceA: 'Conductores',
                rawA: String(c.numero_dni),
                sourceB: 'Cabify',
                rawB: cabifyRaw,
                normalized: dniNorm,
              });
            }
          }
        }
        if (matchCuit) {
          for (const cabifyRaw of (cabifyRawByNorm.get(cuitNorm) || [])) {
            if (String(c.numero_cuit).trim() !== cabifyRaw.trim()) {
              results.push({
                type: 'CUIT',
                conductor: nombreCompleto,
                conductorId: c.id,
                sourceA: 'Conductores',
                rawA: String(c.numero_cuit),
                sourceB: 'Cabify',
                rawB: cabifyRaw,
                normalized: cuitNorm,
              });
            }
          }
        }
      }

      // 5. Vehiculos vs multas para discrepancias de formato de patente (sin cambios)
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

      sinMatchRows.sort((a, b) => a.conductor.localeCompare(b.conductor));

      // 4.1 Para cada conductor sin registros esta semana, buscar su última aparición
      //     en Cabify (cualquier fecha). Si cruza por alguna clave (DNI → CUIT →
      //     Licencia → Nombre), el dato está bien y NO es discrepancia: solo le
      //     falta actividad esta semana. Si no cruza por ninguna, sí es discrepancia.
      const conductoresById = new Map(((conductores || []) as any[]).map((c: any) => [c.id, c]));
      await Promise.all(sinMatchRows.slice(0, 30).map(async (row) => {
        const c = conductoresById.get(row.conductorId);
        if (!c) return;
        const conds: string[] = [];
        const dniNorm = normalizeDni(c.numero_dni);
        const cuitNorm = normalizeCuit(c.numero_cuit);
        const licNorm = normalizeLicenciaBilling(c.numero_licencia);
        const nomNorm = normalizeNombreBilling(c.nombres, c.apellidos);
        if (dniNorm) conds.push(`dni.ilike.*${dniNorm}*`, `licencia.ilike.*${dniNorm}*`);
        if (cuitNorm) conds.push(`dni.ilike.*${cuitNorm}*`);
        if (licNorm) conds.push(`dni.ilike.*${licNorm}*`, `licencia.ilike.*${licNorm}*`);
        const primerNombre = String(c.nombres || '').trim().split(/\s+/)[0] || '';
        const primerApellido = String(c.apellidos || '').trim().split(/\s+/)[0] || '';
        if (/^[\p{L}]{3,}$/u.test(primerNombre) && /^[\p{L}]{3,}$/u.test(primerApellido)) {
          conds.push(`and(nombre.ilike.*${primerNombre}*,apellido.ilike.*${primerApellido}*)`);
        }
        if (conds.length === 0) return;
        const { data } = await supabase
          .from(cabifyTable)
          .select('dni, licencia, nombre, apellido, fecha_inicio')
          .or(conds.join(','))
          .order('fecha_inicio', { ascending: false })
          .limit(1);
        const last = (data || [])[0] as any;
        if (!last) return;

        row.ultimoCabify = {
          nombre: `${last.nombre || ''} ${last.apellido || ''}`.trim(),
          dni: String(last.dni || '-'),
          licencia: String(last.licencia || '-'),
          fecha: last.fecha_inicio ? String(last.fecha_inicio).split('T')[0] : '-',
        };

        // Determinar la clave exacta por la que cruza (misma prioridad del cruce semanal)
        const lastDniNorm = normalizeDni(String(last.dni || '').startsWith('CABIFY_')
          ? (hashMap.get(String(last.dni)) || '')
          : last.dni);
        const lastLicNorm = normalizeLicenciaBilling(last.licencia);
        const lastNomNorm = normalizeNombreBilling(last.nombre, last.apellido);
        if (dniNorm && (dniNorm === lastDniNorm || dniNorm === lastLicNorm)) row.matchKey = 'DNI';
        else if (cuitNorm && cuitNorm === lastDniNorm) row.matchKey = 'CUIT';
        else if (licNorm && (licNorm === lastLicNorm || licNorm === lastDniNorm)) row.matchKey = 'Licencia';
        else if (nomNorm && nomNorm === lastNomNorm) row.matchKey = 'Nombre';
      }));

      // Si cruza por alguna clave (aunque sea contra el histórico), NO es discrepancia:
      // solo quedan listados los que no hacen match por ninguna clave.
      setSinMatch(sinMatchRows.filter(r => !r.matchKey));
      setDiscrepancies(results);
    } catch (err: any) {
      setError(err?.message || 'Error al consultar los datos');
      setSinMatch([]);
      setDiscrepancies([]);
    } finally {
      setLoading(false);
    }
  }

  const filterLower = filter.toLowerCase();
  const matchesFilter = (r: SinMatchRow) =>
    r.conductor.toLowerCase().includes(filterLower) ||
    r.dni.includes(filter) ||
    r.cuit.includes(filter) ||
    r.licencia.includes(filter);
  const filteredSinMatch = filter ? sinMatch.filter(matchesFilter) : sinMatch;
  const filtered = filter
    ? discrepancies.filter(d =>
        d.conductor.toLowerCase().includes(filterLower) ||
        d.rawA.includes(filter) ||
        d.rawB.includes(filter) ||
        d.normalized.includes(filter)
      )
    : discrepancies;

  const totalIssues = sinMatch.length + discrepancies.length;
  const dniCount = filtered.filter(d => d.type === 'DNI').length;
  const cuitCount = filtered.filter(d => d.type === 'CUIT').length;
  const patenteCount = filtered.filter(d => d.type === 'Patente').length;

  const thStyle: CSSProperties = { textAlign: 'left', padding: '8px 6px', color: 'var(--text-secondary)', fontWeight: 600 };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: 'var(--bg-primary)', borderRadius: 8, width: '90%', maxWidth: 900, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              Discrepancias con Cabify
            </h3>
            {!loading && !error && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
                {totalIssues === 0 ? 'Sin discrepancias' : `${totalIssues} encontradas`}
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Descripción */}
        <div style={{ padding: '10px 20px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, borderBottom: '1px solid var(--border-secondary)' }}>
          Semana {periodoInicio} al {periodoFin}. Cruza los conductores del período contra los datos de Cabify
          con las mismas claves que usa la facturación: DNI, CUIT, licencia y nombre normalizado.
          Muestra quiénes no tienen ningún registro que cruce y los datos que están escritos diferente entre fuentes.
        </div>

        {/* Summary badges */}
        {!loading && !error && totalIssues > 0 && (
          <div style={{ padding: '8px 20px', display: 'flex', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--border-secondary)' }}>
            <span className="dt-badge dt-badge-red" style={{ fontSize: 11 }}>
              Sin match: {filteredSinMatch.length}
            </span>
            <span className="dt-badge dt-badge-orange" style={{ fontSize: 11 }}>
              DNI: {dniCount}
            </span>
            <span className="dt-badge dt-badge-orange" style={{ fontSize: 11 }}>
              CUIT: {cuitCount}
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
          ) : error ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-danger, #dc2626)', fontSize: 13 }}>
              Error al analizar: {error}
            </div>
          ) : totalIssues === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>
              Todos los conductores del período cruzan con Cabify y los datos son consistentes
            </div>
          ) : (
            <>
              {hashesSinMapear > 0 && (
                <div style={{ margin: '10px 0 0', padding: '8px 10px', fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                  Hay {hashesSinMapear} DNI hasheados de Cabify (CABIFY_...) sin traducción en cabify_dni_mapeo.
                  Esos registros solo pueden cruzar por licencia o nombre.
                </div>
              )}

              {/* Sección: sin match */}
              {filteredSinMatch.length > 0 && (
                <>
                  <h4 style={{ margin: '14px 0 4px', fontSize: 13, color: 'var(--text-primary)' }}>
                    Conductores sin match en Cabify ({filteredSinMatch.length})
                  </h4>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Ninguna clave (DNI, CUIT, licencia, nombre) cruza con ningún registro de Cabify,
                    ni de esta semana ni del histórico. Acá sí hay un dato para corregir: DNI/CUIT/licencia/nombre
                    mal cargado en alguna de las fuentes, o un hash sin mapear en cabify_dni_mapeo.
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                        <th style={thStyle}>Fuente</th>
                        <th style={thStyle}>Nombre</th>
                        <th style={thStyle}>DNI</th>
                        <th style={thStyle}>CUIT</th>
                        <th style={thStyle}>Licencia</th>
                        <th style={thStyle}>Último registro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSinMatch.map(r => {
                        const mismoDni = !!r.ultimoCabify && !!normalizeDni(r.dni)
                          && (normalizeDni(r.ultimoCabify.dni) === normalizeDni(r.dni)
                            || normalizeDni(r.ultimoCabify.licencia) === normalizeDni(r.dni));
                        return (
                          <Fragment key={r.conductorId}>
                            <tr style={{ borderTop: '2px solid var(--border-primary)' }}>
                              <td style={{ padding: '6px', color: 'var(--color-info-dark)', fontWeight: 600, whiteSpace: 'nowrap' }}>Conductores</td>
                              <td style={{ padding: '6px', fontWeight: 500 }}>{r.conductor}</td>
                              <td style={{ padding: '6px', fontFamily: 'monospace' }}>{r.dni}</td>
                              <td style={{ padding: '6px', fontFamily: 'monospace' }}>{r.cuit}</td>
                              <td style={{ padding: '6px', fontFamily: 'monospace' }}>{r.licencia}</td>
                              <td style={{ padding: '6px' }}>-</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                              <td style={{ padding: '6px', color: 'var(--color-warning-dark)', fontWeight: 600, whiteSpace: 'nowrap' }}>Cabify</td>
                              {r.ultimoCabify ? (
                                <>
                                  <td style={{ padding: '6px' }}>{r.ultimoCabify.nombre || '-'}</td>
                                  <td style={{ padding: '6px', fontFamily: 'monospace' }}>{r.ultimoCabify.dni}</td>
                                  <td style={{ padding: '6px', fontFamily: 'monospace' }}>-</td>
                                  <td style={{ padding: '6px', fontFamily: 'monospace' }}>{r.ultimoCabify.licencia || '-'}</td>
                                  <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>
                                    {r.ultimoCabify.fecha}
                                    {mismoDni && (
                                      <span className="dt-badge dt-badge-solid-gray" style={{ fontSize: 10, marginLeft: 6 }}>
                                        mismo DNI — sin actividad esta semana
                                      </span>
                                    )}
                                  </td>
                                </>
                              ) : (
                                <td colSpan={5} style={{ padding: '6px', color: 'var(--text-tertiary)' }}>
                                  Sin registros históricos en Cabify (por DNI, CUIT, licencia o nombre)
                                </td>
                              )}
                            </tr>
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}

              {/* Sección: discrepancias de formato */}
              {filtered.length > 0 && (
                <>
                  <h4 style={{ margin: '16px 0 4px', fontSize: 13, color: 'var(--text-primary)' }}>
                    Discrepancias de formato ({filtered.length})
                  </h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                        <th style={thStyle}>Tipo</th>
                        <th style={thStyle}>Conductor/Vehiculo</th>
                        <th style={thStyle}>Sistema</th>
                        <th style={thStyle}>Fuente externa</th>
                        <th style={thStyle}>Normalizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((d, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                          <td style={{ padding: '6px' }}>
                            <span className={d.type === 'Patente' ? 'dt-badge dt-badge-solid-gray' : 'dt-badge dt-badge-orange'} style={{ fontSize: 10 }}>
                              {d.type}
                            </span>
                          </td>
                          <td style={{ padding: '6px', fontWeight: 500 }}>{d.conductor}</td>
                          <td style={{ padding: '6px', fontFamily: 'monospace', color: 'var(--color-info-dark)' }}>{d.rawA} <span style={{ color: 'var(--text-tertiary)', fontFamily: 'inherit' }}>({d.sourceA})</span></td>
                          <td style={{ padding: '6px', fontFamily: 'monospace', color: 'var(--color-warning-dark)' }}>{d.rawB} <span style={{ color: 'var(--text-tertiary)', fontFamily: 'inherit' }}>({d.sourceB})</span></td>
                          <td style={{ padding: '6px', fontFamily: 'monospace', fontWeight: 600 }}>{d.normalized}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {filteredSinMatch.length === 0 && filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>
                  Sin resultados para el filtro aplicado
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
