// src/modules/leads/cuentasApps.ts
//
// Estado de las cuentas de la persona en las apps (Cabify y DiDi).
// Son dos cuentas independientes y cada una tiene uno de tres estados.
//
// Dónde vive el dato:
//   - Lead: `leads.cuenta_cabify` / `leads.cuenta_didi`, guardado con la
//     etiqueta ("Crear cuenta", "Pendiente", "Confirmada"), igual que el resto
//     de los campos de texto del lead.
//   - Programación: si el turno lo ocupa un lead, se lee y escribe el del lead;
//     si lo ocupa un conductor, `programaciones_onboarding.estado_<app>_<turno>`,
//     guardado con el código ('crear_cuenta', 'pendiente', 'confirmada').

export type AppCuenta = 'cabify' | 'didi'

export type EstadoCuentaApp = 'crear_cuenta' | 'pendiente' | 'confirmada'

export const ESTADOS_CUENTA_APP: ReadonlyArray<{ codigo: EstadoCuentaApp; label: string }> = [
  { codigo: 'crear_cuenta', label: 'Crear cuenta' },
  { codigo: 'pendiente', label: 'Pendiente' },
  { codigo: 'confirmada', label: 'Confirmada' },
]

/** Etiquetas en el orden del desplegable (lo que se guarda en el lead). */
export const LABELS_CUENTA_APP: string[] = ESTADOS_CUENTA_APP.map((e) => e.label)

export const LABEL_APP: Record<AppCuenta, string> = { cabify: 'Cabify', didi: 'DiDi' }

function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, ' ')
}

/**
 * Código a partir de lo guardado, venga como etiqueta del lead ("Crear cuenta")
 * o como código de la programación ('crear_cuenta'). null = sin dato o valor
 * que no es uno de los tres estados.
 */
export function codigoCuentaApp(valor: string | null | undefined): EstadoCuentaApp | null {
  if (!valor) return null
  const v = normalizar(valor)
  const encontrado = ESTADOS_CUENTA_APP.find(
    (e) => normalizar(e.label) === v || normalizar(e.codigo) === v
  )
  return encontrado ? encontrado.codigo : null
}

export function labelCuentaApp(codigo: EstadoCuentaApp): string {
  return ESTADOS_CUENTA_APP.find((e) => e.codigo === codigo)?.label || codigo
}
