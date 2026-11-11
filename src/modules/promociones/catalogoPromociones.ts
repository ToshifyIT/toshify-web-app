// src/modules/promociones/catalogoPromociones.ts
// Catálogo de promociones (regla 2026-11-11). Las promociones se crean SOLO acá, en el
// código: la pantalla Parámetros > Promociones no permite crear ni borrar, solo
// activar / desactivar y programar desde / hasta (tabla `promociones`, sql/promociones.sql).
//
// Para agregar una promoción:
//   1. Sumarla a PROMOCIONES con un `codigo` nuevo (no cambiar el de una existente).
//   2. La pantalla la da de alta sola en la base, desactivada.
//   3. Conectar su lógica (facturación, saldos, etc.) preguntando por
//      `promocionVigente(codigo, fecha)` (promocionesService.ts) y marcar `conectada: true`.

export interface DefinicionPromocion {
  codigo: string
  nombre: string
  descripcion: string
  /** Qué hace la promoción, para mostrar en el detalle. */
  reglas: string[]
  /** Fechas con las que se da de alta en la base (después se cambian desde la pantalla). */
  fechasSugeridas: { inicio: string; fin: string }
  /**
   * true cuando el sistema ya aplica la promoción (facturación, saldos...). Mientras sea
   * false, activarla solo deja registrado el período: no cambia ningún cálculo.
   */
  conectada: boolean
}

export const PROMOCIONES: DefinicionPromocion[] = [
  {
    codigo: 'CYBER_TOSHI_DESCUENTO_10',
    nombre: 'Cyber Toshi: 10% en turno y ToshiPass',
    descripcion: 'Descuento del 10% en el turno y en ToshiPass para los conductores nuevos, con licencia B1 o D1.',
    reglas: [
      'Aplica a los conductores nuevos: primera asignación dentro del período de la promoción.',
      'Vale para licencia B1 o D1.',
      '10% sobre el alquiler del turno ($422.290 → $380.061) y ToshiPass ($50.000 → $45.000), IVA incluido.',
      'Cuando termina el período, el conductor pasa a la tarifa normal.',
    ],
    fechasSugeridas: { inicio: '2026-11-06', fin: '2026-11-30' },
    conectada: false,
  },
  {
    codigo: 'CYBER_TOSHI_LICENCIA_B1',
    nombre: 'Cyber Toshi: licencia B1 con pago diario',
    descripcion: 'Habilita el ingreso de conductores con licencia B1 (provisorio). Pagan $15.000 por día como saldo a favor hasta tener la D1.',
    reglas: [
      'Los conductores nuevos pueden ingresar con licencia B1.',
      'Mientras no tengan la D1 pagan $15.000 por día, que se acreditan como saldo a favor de su semana de alquiler.',
      'Al obtener la D1 (fecha de obtención D1 en el conductor) dejan de pagar por día y pasan a semana vencida.',
    ],
    fechasSugeridas: { inicio: '2026-11-06', fin: '2027-01-03' },
    conectada: false,
  },
]

export function definicionPromocion(codigo: string): DefinicionPromocion | undefined {
  return PROMOCIONES.find(p => p.codigo === codigo)
}
