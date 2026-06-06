// src/hooks/useCategorizedTipos.ts
// Hook para categorizar tipos de cobro/descuento, evitando duplicación de lógica

import { useMemo } from 'react'
import type { TipoCobroDescuento } from '../types/incidencias.types'

interface CategorizedTipos {
  tiposP006: TipoCobroDescuento[]
  tiposP004: TipoCobroDescuento[]
  tiposP007: TipoCobroDescuento[]
  tiposConcepto: TipoCobroDescuento[]
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
  return useMemo(() => {
    const categoriasConocidas = ['P006', 'P004', 'P007', 'CONCEPTO']
    return {
      tiposP006: tiposCobroDescuento.filter(t => t.categoria === 'P006'),
      tiposP004: tiposCobroDescuento.filter(t => t.categoria === 'P004'),
      tiposP007: tiposCobroDescuento.filter(t => t.categoria === 'P007'),
      // CONCEPTO incluye P005 - Peaje (telepase) y otros conceptos de nomina
      tiposConcepto: tiposCobroDescuento.filter(t => t.categoria === 'CONCEPTO'),
      // Sin categoria: ni vacio ni una de las categorias conocidas
      tiposSinCategoria: tiposCobroDescuento.filter(t => !t.categoria || !categoriasConocidas.includes(t.categoria)),
    }
  }, [tiposCobroDescuento])
}
