import { supabase } from '../lib/supabase';

const MAX_REINTENTOS_SALDO = 3;

/**
 * Suma `delta` a saldos_conductores.saldo_actual partiendo del valor REAL en la BD
 * (no del que tiene la pantalla, que puede estar desactualizado si hay otra pestana
 * o usuario operando sobre el mismo conductor).
 *
 * Usa ultima_actualizacion como control de concurrencia: el update solo se aplica si
 * nadie modifico el saldo desde que se leyo; si no, relee y reintenta.
 * Devuelve el saldo resultante.
 */
export async function aplicarMovimientoSaldo(params: {
  saldoId: string;
  delta: number;
  camposExtra?: (nuevoSaldo: number) => Record<string, unknown>;
}): Promise<number> {
  const { saldoId, delta, camposExtra } = params;

  for (let intento = 0; intento < MAX_REINTENTOS_SALDO; intento++) {
    const { data: actual, error: errorLectura } = await (supabase.from('saldos_conductores') as any)
      .select('saldo_actual, ultima_actualizacion')
      .eq('id', saldoId)
      .single();
    if (errorLectura) throw errorLectura;

    const nuevoSaldo = Math.round(((Number(actual.saldo_actual) || 0) + delta) * 100) / 100;

    let query = (supabase.from('saldos_conductores') as any)
      .update({
        ...(camposExtra ? camposExtra(nuevoSaldo) : {}),
        saldo_actual: nuevoSaldo,
        ultima_actualizacion: new Date().toISOString(),
      })
      .eq('id', saldoId);
    query = actual.ultima_actualizacion
      ? query.eq('ultima_actualizacion', actual.ultima_actualizacion)
      : query.is('ultima_actualizacion', null);

    const { data: actualizados, error: errorUpdate } = await query.select('id');
    if (errorUpdate) throw errorUpdate;
    if (actualizados && actualizados.length > 0) return nuevoSaldo;
  }

  throw new Error('El saldo fue modificado por otro usuario al mismo tiempo. Intente nuevamente.');
}

/**
 * Inserta un movimiento en el kardex (control_saldos).
 * Se llama despues de cada update a saldos_conductores.
 */
export async function insertControlSaldo(params: {
  conductorId: string;
  semana: number;
  anio: number;
  tipoMovimiento: string;
  montoMovimiento: number;
  saldoPendiente: number;
  referencia: string;
  userName?: string;
}) {
  const {
    conductorId,
    semana,
    anio,
    tipoMovimiento,
    montoMovimiento,
    saldoPendiente,
    referencia,
    userName,
  } = params;

  // Buscar nombre/dni/cuit desde saldos_conductores
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: saldo } = await (supabase.from('saldos_conductores') as any)
    .select('conductor_nombre, conductor_dni, conductor_cuit')
    .eq('conductor_id', conductorId)
    .maybeSingle();

  const conductorNombre = saldo?.conductor_nombre || 'Desconocido';
  const conductorDni = saldo?.conductor_dni || null;
  const conductorCuit = saldo?.conductor_cuit || null;

  // Calcular adeudado y a_favor a partir del saldo pendiente
  const saldoAdeudado = saldoPendiente < 0 ? Math.abs(saldoPendiente) : 0;
  const saldoAFavor = saldoPendiente > 0 ? saldoPendiente : 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('control_saldos') as any).insert({
    conductor_id: conductorId,
    conductor_nombre: conductorNombre,
    conductor_dni: conductorDni,
    conductor_cuit: conductorCuit,
    semana,
    anio,
    tipo_movimiento: tipoMovimiento,
    monto_movimiento: montoMovimiento,
    referencia,
    saldo_adeudado: saldoAdeudado,
    saldo_a_favor: saldoAFavor,
    saldo_pendiente: saldoPendiente,
    created_by_name: userName || 'Sistema',
  });

  if (error) {
    console.error('Error insertando control_saldos:', error);
    throw new Error(`Error registrando movimiento en kardex: ${error.message || 'desconocido'}`)
  }

  // FIX 2026-05-27: sincronizar saldos_conductores.saldo_actual con el kardex
  // para que el campo resumen siempre refleje el último movimiento registrado.
  // Los flujos de pago ya llaman a upsertSaldoConductor antes, pero el doble
  // update al mismo valor es inocuo y garantiza consistencia en todos los flujos.
  if (saldo) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('saldos_conductores') as any)
      .update({
        saldo_actual: saldoPendiente,
        ultima_actualizacion: new Date().toISOString(),
      })
      .eq('conductor_id', conductorId);
  }
}
