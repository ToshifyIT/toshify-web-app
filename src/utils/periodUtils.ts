import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, parse, subYears, setWeek } from 'date-fns'
import { es } from 'date-fns/locale'

export type Granularity = 'dia' | 'semana' | 'mes' | 'ano'

export interface PeriodRange {
  start: Date
  end: Date
}

const CURRENT_YEAR = new Date().getFullYear()

export function getPeriodRange(granularity: Granularity, label: string): PeriodRange {
  const now = new Date()

  try {
    switch (granularity) {
      case 'dia': {
        // Support explicit year: "DD/MM/YYYY"
        if (label.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
          const date = parse(label, 'dd/MM/yyyy', new Date())
          return {
            start: startOfDay(date),
            end: endOfDay(date)
          }
        }

        // Label format: "DD/MM" (e.g., "24/02")
        const [day, month] = label.split('/').map(Number)
        let date = new Date(CURRENT_YEAR, month - 1, day)
        
        // If date is in the future relative to now (plus a small buffer), assume previous year
        // But since options are generated based on "today backwards", we trust the generation logic
        // However, if today is Jan 5 and label is 30/12, it must be previous year
        if (date > now) {
           date = subYears(date, 1)
        }
        
        return {
          start: startOfDay(date),
          end: endOfDay(date)
        }
      }
      case 'semana': {
        // Support explicit year: "Sem XX YYYY"
        const yearMatch = label.match(/Sem (\d+) (\d{4})/)
        if (yearMatch) {
          const weekNumber = parseInt(yearMatch[1], 10)
          const year = parseInt(yearMatch[2], 10)
          const date = setWeek(new Date(year, 0, 4), weekNumber, { weekStartsOn: 1 })
          return {
            start: startOfWeek(date, { weekStartsOn: 1 }),
            end: endOfWeek(date, { weekStartsOn: 1 })
          }
        }

        // Label format: "Sem XX" (e.g., "Sem 08")
        const weekNumber = parseInt(label.replace('Sem ', ''), 10)
        
        // Create a date in the current year
        // We use date-fns setWeek to find the week in current year
        // Assuming ISO weeks starting on Monday (weekStartsOn: 1)
        const date = setWeek(new Date(CURRENT_YEAR, 0, 4), weekNumber, { weekStartsOn: 1 })
        
        return {
          start: startOfWeek(date, { weekStartsOn: 1 }),
          end: endOfWeek(date, { weekStartsOn: 1 })
        }
      }
      case 'mes': {
        // Label format: "Mmm YYYY" (e.g., "Feb 2025")
        // Use date-fns parse with locale es
        // Note: Month names in MONTH_NAMES are "Ene", "Feb", etc. (Title case)
        // date-fns 'MMM' expects 'ene', 'feb' or matches loosely? 
        // Let's ensure parsing works. 'Feb 2025' -> 'MMM yyyy' in 'es' locale
        const date = parse(label.toLowerCase(), 'MMM yyyy', new Date(), { locale: es })
        return {
          start: startOfMonth(date),
          end: endOfMonth(date)
        }
      }
      case 'ano': {
        // Label format: "YYYY" (e.g., "2025")
        const date = parse(label, 'yyyy', new Date())
        return {
          start: startOfYear(date),
          end: endOfYear(date)
        }
      }
      default:
        return { start: startOfDay(now), end: endOfDay(now) }
    }
  } catch (error) {
    console.error('Error parsing period label:', label, error)
    return { start: startOfDay(now), end: endOfDay(now) }
  }
}
