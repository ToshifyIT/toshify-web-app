/**
 * Shared normalization utilities for DNI, Patente, and CUIT.
 *
 * These ensure consistent comparisons across data sources (Cabify, USS, Wialon,
 * conductores table, facturacion, etc.) that may store the same identifier
 * with different formatting (dots, leading zeros, dashes, spaces).
 */

/**
 * Normalize DNI/documento for cross-source comparisons.
 * Strips dots, commas, dashes, spaces, and leading zeros.
 *
 * Examples:
 *   "12.345.678"  → "12345678"
 *   "012345678"   → "12345678"
 *   "12,345,678"  → "12345678"
 *   " 12345678 "  → "12345678"
 */
export function normalizeDni(value: string | number | null | undefined): string {
  if (value == null || value === '') return '';
  return String(value)
    .trim()
    .replace(/[.,\-\s]/g, '')
    .replace(/^0+/, '') || '';
}

/**
 * Normalize patente/dominio for cross-source comparisons.
 * Strips spaces and dashes, converts to uppercase.
 *
 * Examples:
 *   "ab 123 cd"   → "AB123CD"
 *   "AB-123-CD"   → "AB123CD"
 *   " AB123CD "   → "AB123CD"
 */
export function normalizePatente(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  return String(value)
    .trim()
    .replace(/[\s\-]/g, '')
    .toUpperCase();
}

/**
 * Normalize CUIT for cross-source comparisons.
 * Strips dashes, dots, and spaces.
 *
 * Examples:
 *   "20-12345678-9"  → "20123456789"
 *   "20.12345678.9"  → "20123456789"
 *   " 20123456789 "  → "20123456789"
 */
export function normalizeCuit(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  return String(value)
    .trim()
    .replace(/[-.\s]/g, '');
}

/**
 * Detect if two raw values differ in formatting but represent the same entity.
 * Returns true if the normalized values match but the raw values don't.
 * Useful for highlighting data discrepancies in the UI.
 */
export function hasDiscrepancy(
  rawA: string | number | null | undefined,
  rawB: string | number | null | undefined,
  normalizeFn: (v: string | number | null | undefined) => string,
): boolean {
  const normalizedA = normalizeFn(rawA);
  const normalizedB = normalizeFn(rawB);
  if (!normalizedA || !normalizedB) return false;
  const trimA = String(rawA ?? '').trim();
  const trimB = String(rawB ?? '').trim();
  return normalizedA === normalizedB && trimA !== trimB;
}
