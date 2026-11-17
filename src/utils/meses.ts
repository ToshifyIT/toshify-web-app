// Nombre del mes en español a partir de "YYYY-MM" (ej. "2026-11" -> "Noviembre 2026").
// Vivía en components/ui/MesSelector.tsx; se movió acá para que ese archivo exporte
// solo componentes (regla react-refresh/only-export-components).
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export function nombreMes(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MESES[m - 1] ?? ym} ${y}`
}
