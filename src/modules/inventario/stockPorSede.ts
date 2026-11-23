// v_stock_productos devuelve una fila por producto y sede. Con "Todas las sedes"
// llegan varias filas por producto: se suman por id para que cada producto
// aparezca una sola vez (con una sede elegida queda igual, una fila por producto).
const CAMPOS_STOCK = ['stock_total', 'disponible', 'en_uso', 'dañado', 'perdido'] as const

export function sumarStockPorProducto<T extends { id: string }>(filas: T[]): T[] {
  const porProducto = new Map<string, T>()
  for (const fila of filas) {
    const acumulado = porProducto.get(fila.id) as Record<string, unknown> | undefined
    if (!acumulado) {
      porProducto.set(fila.id, { ...fila })
      continue
    }
    const actual = fila as unknown as Record<string, unknown>
    for (const campo of CAMPOS_STOCK) {
      acumulado[campo] = (Number(acumulado[campo]) || 0) + (Number(actual[campo]) || 0)
    }
  }
  return Array.from(porProducto.values())
}
