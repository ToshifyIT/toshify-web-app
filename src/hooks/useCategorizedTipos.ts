// src/hooks/useCategorizedTipos.ts
// Hook para categorizar tipos de cobro/descuento, evitando duplicación de lógica

import { useMemo } from 'react'
import type { TipoCobroDescuento } from '../types/incidencias.types'

interface CategorizedTipos {
  tiposP006: TipoCobroDescuento[]
  tiposP004: TipoCobroDescuento[]
  tiposP007: TipoCobroDescuento[]
  tiposSinCategoria: TipoCobroDescuento[]
}

/**
 * Hook que categoriza los tipos de cobro/descuento por su categoría.
 * Memoiza los resultados para evitar recálculos innecesarios.
 * 
 * @param tiposCobroDescuento - Array de tipos a categorizar
 * @returns Objeto con los tipos agrupados por categoría
 */
export function useCategorizedTipos(tiposCobroDescuento: TipoCobroDescuento[]): CategorizedTipos {
  return useMemo(() => ({
    tiposP006: tiposCobroDescuento.filter(t => t.categoria === 'P006'),
    tiposP004: tiposCobroDescuento.filter(t => t.categoria === 'P004'),
    tiposP007: tiposCobroDescuento.filter(t => t.categoria === 'P007'),
    tiposSinCategoria: tiposCobroDescuento.filter(t => !t.categoria),
  }), [tiposCobroDescuento])
}
