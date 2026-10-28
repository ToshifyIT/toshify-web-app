// Fechas para comparar contra la semana anterior
/** Fecha (YYYY-MM-DD, hora Argentina) de hace N días. */
export function fechaHaceDias(n: number): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
  const d = new Date(`${hoy}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}
