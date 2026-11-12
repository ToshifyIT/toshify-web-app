// src/modules/siniestros/components/pesos.ts
// Formato y lectura de montos en pesos argentinos (lo usa MontoPesos).

const formato = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const formatoCentavos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** "$ 1.500.000" o, si tiene centavos, "$ 1.500.000,50"; vacío si no hay monto. */
export function mostrarPesos(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return ''
  return Number.isInteger(Math.round(valor * 100) / 100) ? formato.format(valor) : formatoCentavos.format(valor)
}

/**
 * Lee lo que se escribió. Formato argentino: punto de miles y coma decimal
 * ("1.500.000,50"). Sin coma, un punto seguido de 1 o 2 dígitos al final también
 * vale como decimal ("1500.5"). Redondea a 2 decimales; null si está vacío.
 */
export function leerPesos(texto: string): number | null {
  const limpio = texto.replace(/[^\d.,]/g, '')
  if (!/\d/.test(limpio)) return null
  let normal: string
  if (limpio.includes(',')) {
    const [entero, ...resto] = limpio.split(',')
    normal = `${entero.replace(/\./g, '')}.${resto.join('').replace(/\./g, '')}`
  } else if (/^\d+\.\d{1,2}$/.test(limpio)) {
    normal = limpio
  } else {
    normal = limpio.replace(/\./g, '')
  }
  const n = Number(normal)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}
