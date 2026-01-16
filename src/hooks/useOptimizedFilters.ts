/**
 * Custom Hooks Optimizados para Filtrado y Estado
 * 
 * Hooks reutilizables que implementan:
 * - Memoización automática
 * - Debouncing para búsquedas
 * - Estructuras de datos optimizadas
 * 
 * @module hooks/useOptimizedFilters
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { 
  createIndexedCollection, 
  filterMultiple, 
  countByField,
  type FilterConfig,
  type IndexedCollection 
} from '../utils/performance'

// =====================================================
// TIPOS
// =====================================================

export interface FilterState<T extends string = string> {
  values: T[]
  set: (values: T[]) => void
  toggle: (value: T) => void
  clear: () => void
  has: (value: T) => boolean
}

export interface SearchState {
  value: string
  set: (value: string) => void
  clear: () => void
  debouncedValue: string
}

export interface ColumnFilterConfig {
  id: string
  label: string
  values: string[]
  onClear: () => void
}

// =====================================================
// useFilter - Estado de filtro individual optimizado
// =====================================================

/**
 * Hook para manejar un filtro multiselect
 * Incluye Set interno para lookups O(1) en has()
 * 
 * @example
 * const estadoFilter = useFilter<string>()
 * 
 * // En el componente:
 * <Checkbox 
 *   checked={estadoFilter.has('activo')}
 *   onChange={() => estadoFilter.toggle('activo')} 
 * />
 * 
 * // Para filtrar:
 * const filtered = items.filter(i => 
 *   estadoFilter.values.length === 0 || estadoFilter.has(i.estado)
 * )
 */
export function useFilter<T extends string = string>(
  initialValues: T[] = []
): FilterState<T> {
  const [values, setValues] = useState<T[]>(initialValues)
  
  // Set para lookups O(1)
  const valuesSet = useMemo(() => new Set(values), [values])
  
  const set = useCallback((newValues: T[]) => {
    setValues(newValues)
  }, [])
  
  const toggle = useCallback((value: T) => {
    setValues(prev => {
      const set = new Set(prev)
      if (set.has(value)) {
        set.delete(value)
      } else {
        set.add(value)
      }
      return Array.from(set)
    })
  }, [])
  
  const clear = useCallback(() => {
    setValues([])
  }, [])
  
  const has = useCallback((value: T): boolean => {
    return valuesSet.has(value)
  }, [valuesSet])
  
  return { values, set, toggle, clear, has }
}

// =====================================================
// useSearch - Búsqueda con debounce
// =====================================================

/**
 * Hook para búsqueda con debounce automático
 * Evita re-renders excesivos mientras el usuario escribe
 * 
 * @example
 * const search = useSearch(300) // 300ms debounce
 * 
 * // Input actualiza inmediatamente para feedback visual:
 * <input value={search.value} onChange={e => search.set(e.target.value)} />
 * 
 * // Pero el filtrado usa el valor con debounce:
 * const filtered = items.filter(i => 
 *   i.nombre.toLowerCase().includes(search.debouncedValue.toLowerCase())
 * )
 */
export function useSearch(debounceMs = 300): SearchState {
  const [value, setValue] = useState('')
  const [debouncedValue, setDebouncedValue] = useState('')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const set = useCallback((newValue: string) => {
    setValue(newValue)
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(newValue)
    }, debounceMs)
  }, [debounceMs])
  
  const clear = useCallback(() => {
    setValue('')
    setDebouncedValue('')
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
  }, [])
  
  // Cleanup
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])
  
  return { value, set, clear, debouncedValue }
}

// =====================================================
// useFilteredData - Filtrado optimizado de datos
// =====================================================

interface UseFilteredDataOptions<T> {
  data: T[]
  filters: FilterConfig<T>[]
  searchField?: keyof T
  searchValue?: string
}

/**
 * Hook que combina filtrado múltiple con búsqueda
 * Optimizado para single-pass O(n)
 * 
 * @example
 * const { filtered, counts } = useFilteredData({
 *   data: conductores,
 *   filters: [
 *     { field: 'estado', values: estadoFilter.values },
 *     { field: 'turno', values: turnoFilter.values }
 *   ],
 *   searchField: 'nombre',
 *   searchValue: search.debouncedValue
 * })
 */
export function useFilteredData<T extends Record<string, unknown>>({
  data,
  filters,
  searchField,
  searchValue
}: UseFilteredDataOptions<T>) {
  const filtered = useMemo(() => {
    // Combinar filtros con búsqueda
    const allFilters = [...filters]
    
    if (searchField && searchValue && searchValue.trim()) {
      allFilters.push({
        field: searchField,
        values: [searchValue.trim()],
        partial: true
      })
    }
    
    return filterMultiple(data, allFilters)
  }, [data, filters, searchField, searchValue])
  
  // Contar valores únicos para opciones de filtro
  const counts = useMemo(() => {
    const result: Record<string, Map<string, number>> = {}
    
    for (const filter of filters) {
      result[filter.field as string] = countByField(filtered, filter.field)
    }
    
    return result
  }, [filtered, filters])
  
  return { filtered, counts, total: data.length }
}

// =====================================================
// useIndexedData - Colección indexada para lookups O(1)
// =====================================================

/**
 * Hook que mantiene una colección indexada actualizada
 * 
 * @example
 * const indexed = useIndexedData(conductores, 'id')
 * 
 * // Lookup O(1):
 * const conductor = indexed.get(conductorId)
 */
export function useIndexedData<T extends Record<string, unknown>>(
  data: T[],
  keyField: keyof T
): IndexedCollection<T> {
  return useMemo(
    () => createIndexedCollection(data, keyField),
    [data, keyField]
  )
}

// =====================================================
// useFilterOptions - Opciones de filtro con conteo
// =====================================================

interface FilterOption {
  value: string
  label: string
  count: number
}

/**
 * Hook que genera opciones de filtro con conteo desde los datos
 * 
 * @example
 * const estadoOptions = useFilterOptions(conductores, 'estado', {
 *   labelMap: { 'activo': 'Activo', 'baja': 'De Baja' }
 * })
 * // [{ value: 'activo', label: 'Activo', count: 42 }, ...]
 */
export function useFilterOptions<T extends Record<string, unknown>>(
  data: T[],
  field: keyof T,
  options?: {
    labelMap?: Record<string, string>
    sortBy?: 'value' | 'count' | 'label'
  }
): FilterOption[] {
  return useMemo(() => {
    const counts = countByField(data, field)
    const { labelMap = {}, sortBy = 'label' } = options ?? {}
    
    const result: FilterOption[] = []
    
    for (const [value, count] of counts.entries()) {
      if (value) {
        result.push({
          value,
          label: labelMap[value] ?? value,
          count
        })
      }
    }
    
    // Ordenar
    result.sort((a, b) => {
      switch (sortBy) {
        case 'count':
          return b.count - a.count
        case 'value':
          return a.value.localeCompare(b.value)
        default:
          return a.label.localeCompare(b.label)
      }
    })
    
    return result
  }, [data, field, options])
}

// =====================================================
// useActiveFilters - Barra de filtros activos
// =====================================================

interface ActiveFilter {
  id: string
  label: string
  onClear: () => void
}

/**
 * Hook para generar la lista de filtros activos con sus callbacks de limpieza
 * 
 * @example
 * const activeFilters = useActiveFilters([
 *   { id: 'estado', values: estadoFilter.values, label: 'Estado', onClear: estadoFilter.clear },
 *   { id: 'turno', values: turnoFilter.values, label: 'Turno', onClear: turnoFilter.clear }
 * ])
 */
export function useActiveFilters(
  configs: Array<{
    id: string
    values: string[]
    label: string
    onClear: () => void
  }>
): { filters: ActiveFilter[]; clearAll: () => void; hasFilters: boolean } {
  const filters = useMemo(() => {
    return configs
      .filter(c => c.values.length > 0)
      .map(c => ({
        id: c.id,
        label: `${c.label}: ${c.values.join(', ')}`,
        onClear: c.onClear
      }))
  }, [configs])
  
  const clearAll = useCallback(() => {
    for (const config of configs) {
      config.onClear()
    }
  }, [configs])
  
  return {
    filters,
    clearAll,
    hasFilters: filters.length > 0
  }
}
