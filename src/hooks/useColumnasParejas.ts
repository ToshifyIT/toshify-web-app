import { useCallback, useEffect, useState } from 'react';

/**
 * Reparte las tarjetas de una grilla en filas parejas: si no entran todas en una
 * fila, usa la menor cantidad de filas y las llena por igual (9 tarjetas → 5 + 4,
 * no 8 + 1 con la última estirada a todo el ancho).
 * Devuelve un ref de callback para el contenedor (funciona aunque la grilla aparezca
 * después de cargar) y la cantidad de columnas (null = todavía sin medir).
 */
export function useColumnasParejas<T extends HTMLElement>(anchoMinimo: number, gap = 6) {
  const [el, setEl] = useState<T | null>(null);
  const [columnas, setColumnas] = useState<number | null>(null);
  const ref = useCallback((nodo: T | null) => setEl(nodo), []);

  useEffect(() => {
    if (!el) return;
    const calcular = () => {
      const cantidad = el.children.length;
      if (cantidad === 0) return;
      const entran = Math.max(1, Math.floor((el.clientWidth + gap) / (anchoMinimo + gap)));
      const filas = Math.ceil(cantidad / Math.min(entran, cantidad));
      setColumnas(Math.ceil(cantidad / filas));
    };
    calcular();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calcular) : null;
    ro?.observe(el);
    // Las tarjetas cambian según la semana (Imp. Gen. solo en semanas cerradas)
    const mo = new MutationObserver(calcular);
    mo.observe(el, { childList: true });
    return () => {
      ro?.disconnect();
      mo.disconnect();
    };
  }, [el, anchoMinimo, gap]);

  return { ref, columnas };
}
