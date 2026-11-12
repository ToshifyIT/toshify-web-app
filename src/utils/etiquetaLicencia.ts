// src/utils/etiquetaLicencia.ts
// Texto de la categoría de licencia actual del conductor (ver components/ui/LicenciaBadge).

/** B1, D1, el detalle de Otros (ej. "D2") o null si no tiene categoría cargada. */
export function etiquetaLicencia(categoria: string | null | undefined, otra?: string | null): string | null {
  if (categoria === 'B1' || categoria === 'D1') return categoria
  if (categoria === 'Otros') return otra?.trim() || 'Otros'
  return null
}
