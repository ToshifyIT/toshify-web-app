/** "1.234,5" / "1234.5" / "2,4" -> numero; vacio o invalido -> undefined. */
export function parseDecimal(valor: string): number | undefined {
  let v = valor.trim().replace(/\s/g, '');
  if (!v) return undefined;
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
