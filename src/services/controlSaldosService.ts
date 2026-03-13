import { supabase } from '../lib/supabase';

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
  }
}
