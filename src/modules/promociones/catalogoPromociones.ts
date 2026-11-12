// src/modules/promociones/catalogoPromociones.ts
// Catálogo de promociones (regla 2026-11-11). Las promociones se crean SOLO acá, en el
// código: la pantalla Parámetros > Promociones no permite crear ni borrar, solo
// activar / desactivar y editar el código, la descripción y el período desde / hasta (tabla
// `promociones`, sql/promociones.sql; cada cambio queda en promociones_historial).
//
// "Conductor nuevo" en las promociones = conductor que ingresa por primera vez o que
// reingresa (reincorporación) dentro del período de la promoción (regla 2026-11-12).
//
// Para agregar una promoción:
//   1. Sumarla a PROMOCIONES con una `clave` nueva (constante PROMO_*) y el código
//      visible siguiente (PRM03, PRM04...). La clave no se cambia ni se reutiliza nunca:
//      es lo que enlaza el catálogo con la base. El código visible se edita en pantalla.
//   2. La pantalla la da de alta sola en la base, desactivada.
//   3. Conectar su lógica (facturación, saldos, etc.) preguntando por
//      `promocionVigente(codigo, fecha)` (promocionesService.ts) y marcar `conectada: true`.

/**
 * Claves internas de las promociones (columna promociones.clave). Usar estas constantes en
 * la lógica (promocionVigente), nunca el código visible: ese se puede editar.
 */
export const PROMO_CYBER_DESCUENTO_10 = 'CYBER_DESCUENTO_10'
export const PROMO_CYBER_LICENCIA_B1 = 'CYBER_LICENCIA_B1'

export interface DefinicionPromocion {
  /** Identificador interno fijo. */
  clave: string
  /** Código visible con el que se da de alta (PRM01, PRM02...); después se edita en pantalla. */
  codigoInicial: string
  nombre: string
  /** Descripción con la que se da de alta; después se edita desde la pantalla (columna descripcion). */
  descripcionInicial: string
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
    clave: PROMO_CYBER_DESCUENTO_10,
    codigoInicial: 'PRM01',
    nombre: 'Cyber Toshi: 10% en turno y ToshiPass',
    descripcionInicial: 'Descuento del 10% en el turno y en ToshiPass para los conductores nuevos o que reingresan dentro del período, con licencia B1 o D1.',
    reglas: [
      'Aplica a los conductores nuevos: los que ingresan por primera vez o reingresan (reincorporación) dentro del período de la promoción.',
      'Vale para licencia B1 o D1.',
      '10% sobre el alquiler del turno ($422.290 → $380.061) y ToshiPass ($50.000 → $45.000), IVA incluido.',
      'Facturación: 10% del alquiler de cada día cobrado dentro del período (desde su ingreso) y 10% del ToshiPass en proporción a esos días. Sale como descuento con el código de la promoción.',
      'Cuando termina el período, el conductor pasa a la tarifa normal.',
    ],
    fechasSugeridas: { inicio: '2026-11-06', fin: '2026-11-30' },
    conectada: true,
  },
  {
    clave: PROMO_CYBER_LICENCIA_B1,
    codigoInicial: 'PRM02',
    nombre: 'Cyber Toshi: licencia B1 con pago diario',
    descripcionInicial: 'Habilita el ingreso de conductores nuevos o que reingresan con licencia B1 (provisorio). Pagan $15.000 por día como saldo a favor hasta tener la D1.',
    reglas: [
      'Los conductores nuevos (ingreso por primera vez o reingreso dentro del período) pueden ingresar con licencia B1.',
      'Mientras no tengan la D1 pagan $15.000 por día, que se acreditan como saldo a favor de su semana de alquiler.',
      'Al obtener la D1 (fecha de obtención D1 en el conductor) dejan de pagar por día y pasan a semana vencida.',
      'Facturación: se muestra el código y los días con B1 × $15.000 como dato informativo. Todavía no registra ni descuenta los pagos diarios.',
    ],
    fechasSugeridas: { inicio: '2026-11-06', fin: '2027-01-03' },
    conectada: false,
  },
]

export function definicionPromocion(clave: string): DefinicionPromocion | undefined {
  return PROMOCIONES.find(p => p.clave === clave)
}
