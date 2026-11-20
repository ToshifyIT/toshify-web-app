// Consulta automática al BCRA (server-bcra.js): constantes compartidas por la lista y la ficha.

/**
 * Desde cuándo se consultan solos los leads (igual que CONSULTAR_DESDE en server-bcra.js,
 * 20/11/2026 00:00 hora Argentina). Los creados antes no se consultan automáticamente.
 */
export const BCRA_CONSULTA_DESDE = '2026-11-20T03:00:00Z'
