/**
 * server-cresium-pagos.js
 * Depósitos de Cresium que entran solos al saldo de los conductores como pago.
 *
 * Desde DESDE_PAGOS (26/11/2026 12:00 hora Argentina), cada depósito que entra a Cresium (44 Dreams o Grupo CG) y
 * se cruza con un conductor se carga en su saldo igual que un pago manual de Saldos (abono +
 * saldos_conductores + historial control_saldos, tipo pago_manual):
 *   · referencia "Transferencia bancaria - B1" si ese día el conductor paga por día con la
 *     promoción de licencia B1 (mismo período que Facturación > Licencia B1);
 *   · "Transferencia bancaria" en cualquier otro caso.
 * Sin nombres: el vínculo con el depósito queda en cresium_movimientos.pago_*.
 *
 * Cruce con el conductor (mismo orden que Administración > Cresium conductores):
 *   0. depósito asignado a mano en Licencia B1 (promocion_b1_pagos origen 'cresium')
 *   1. CUIT/CUIL del depósito = CUIT del conductor
 *   2. DNI dentro del CUIL = DNI del conductor
 *   3. CBU/CVU del depósito = CBU del conductor
 *   4. quien paga por un conductor (cresium_pagadores_conductor)
 * Los CUIT de empresa (30, 33, 34) no son de conductores. Un depósito sin conductor queda
 * pendiente: entra en la vuelta en que se lo enlace a mano.
 *
 * Semana: la de la fecha de la transferencia; si esa semana ya está cerrada en la sede del
 * conductor, la semana actual. La fecha del abono es la hora real de la transferencia.
 *
 * Duplicados: hasta el 26/11 a las 12:00 las transferencias se cargaban a mano (lo de antes de
 * esa hora queda como se cargó, no se toca). Por las dudas, si el conductor ya tiene
 * un pago manual del mismo monto (±$1) cargado entre 2 días antes y 7 días después de la
 * transferencia, el depósito no entra (pago_omitido = 'ya_cargado_a_mano') y ese pago manual
 * queda emparejado con él (no se usa para otro depósito).
 *
 * Cada depósito se reserva con una sola escritura (solo si sigue pendiente): aunque dos
 * vueltas coincidan, entra una sola vez.
 *
 * Lo llama iniciarSyncAutomaticoCresium (server-cresium.js) después de traer los movimientos.
 * CRESIUM_PAGOS_AUTO=0 lo apaga. Necesita sql/cresium_pagos_conductores.sql.
 */

/** Transferencias hechas desde el 26/11/2026 a las 12:00 hora Argentina (15:00 UTC) */
const DESDE_PAGOS = '2026-11-26T15:00:00Z'
export const CONCEPTO_TRANSFERENCIA = 'Transferencia bancaria'
export const CONCEPTO_TRANSFERENCIA_B1 = 'Transferencia bancaria - B1'
const CLAVE_PROMO_B1 = 'CYBER_LICENCIA_B1'
// Usuario de los movimientos que carga solo: R2DT, el asistente de automatizaciones
const USUARIO = 'R2DT'
const TIMEOUT_MS = 30000

/* ----------------------------- Fechas (ART) ------------------------------ */

const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '')
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100

export function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function hoyART() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** "YYYY-MM-DD" en hora Argentina de un timestamp (o la fecha tal cual). */
export function fechaArg(valor) {
  if (!valor) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor
  return new Date(new Date(valor).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function lunesDe(fecha) {
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay()
  return sumarDias(fecha, -((dia + 6) % 7))
}

/** Semana ISO (lunes a domingo) de una fecha "YYYY-MM-DD". */
export function semanaISO(fecha) {
  const d = new Date(`${lunesDe(fecha)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 3) // jueves de esa semana: define el año ISO
  const anio = d.getUTCFullYear()
  const primerJueves = new Date(Date.UTC(anio, 0, 4, 12))
  primerJueves.setUTCDate(primerJueves.getUTCDate() + 3 - ((primerJueves.getUTCDay() + 6) % 7))
  const semana = 1 + Math.round((d - primerJueves) / (7 * 24 * 60 * 60 * 1000))
  return { semana, anio }
}

/* ------------------------------- Cruce ----------------------------------- */

export function esCuitEmpresa(cuit) {
  const d = soloDigitos(cuit)
  return d.length === 11 && ['30', '33', '34'].includes(d.slice(0, 2))
}

function dniDeCuit(cuit) {
  const d = soloDigitos(cuit)
  return d.length === 11 ? d.slice(2, 10).replace(/^0+/, '') : ''
}

export function indexarConductores(conductores, pagadores = []) {
  const porCuit = new Map()
  const porDni = new Map()
  const porCbu = new Map()
  for (const c of conductores) {
    const cuit = soloDigitos(c.numero_cuit)
    if (cuit.length === 11 && !porCuit.has(cuit)) porCuit.set(cuit, c)
    const dni = soloDigitos(c.numero_dni).replace(/^0+/, '')
    if (dni.length >= 6 && !porDni.has(dni)) porDni.set(dni, c)
    const cbu = soloDigitos(c.cbu)
    if (cbu.length === 22 && !porCbu.has(cbu)) porCbu.set(cbu, c)
  }
  const porId = new Map(conductores.map((c) => [c.id, c]))
  const pagadorPorCuit = new Map()
  const pagadorPorCbu = new Map()
  for (const p of pagadores) {
    const c = porId.get(p.conductor_id)
    if (!c) continue
    if (p.cuit) pagadorPorCuit.set(soloDigitos(p.cuit), c)
    else if (p.cbu) pagadorPorCbu.set(soloDigitos(p.cbu), c)
  }
  return { porId, porCuit, porDni, porCbu, pagadorPorCuit, pagadorPorCbu }
}

/** Conductor de un depósito (o null). asignadoB1: cresium movimiento id -> conductor id. */
export function conductorDelDeposito(mov, indice, asignadoB1 = new Map()) {
  const asignado = asignadoB1.get(mov.id)
  if (asignado && indice.porId.has(asignado)) return indice.porId.get(asignado)
  if (esCuitEmpresa(mov.cuit)) return null
  const cuit = soloDigitos(mov.cuit)
  const cbu = soloDigitos(mov.cuenta_contraparte)
  return (cuit && indice.porCuit.get(cuit))
    || (dniDeCuit(cuit) && indice.porDni.get(dniDeCuit(cuit)))
    || (cbu && indice.porCbu.get(cbu))
    || (cuit && indice.pagadorPorCuit.get(cuit))
    || (!cuit && cbu && indice.pagadorPorCbu.get(cbu))
    || null
}

/* ---------------------- Licencia B1 (como Facturación) -------------------- */

const ESTADOS_ASIGNACION = ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado', 'cancelado', 'cancelada']

/**
 * Fecha de ingreso (o reingreso) de cada conductor: primer día trabajado desde su último
 * reingreso. Mismas reglas que cargarIngresosConductores (promocionesFacturacion.ts).
 */
export function calcularIngresos(asignaciones, reingresos, conductores, hasta) {
  const ultimoReingreso = new Map()
  const anotar = (id, fecha) => {
    if (!fecha) return
    const actual = ultimoReingreso.get(id)
    if (!actual || fecha > actual) ultimoReingreso.set(id, fecha)
  }
  for (const c of conductores) anotar(c.id, fechaArg(c.fecha_reincorpoaracion))
  for (const h of reingresos) anotar(h.conductor_id, fechaArg(h.created_at))

  const ingresos = new Map()
  for (const ac of asignaciones) {
    const padre = ac.asignaciones
    if (!padre) continue
    const estadoPadre = String(padre.estado || '').toLowerCase()
    if (['programado', 'programada'].includes(estadoPadre)) continue
    if (['finalizada', 'cancelada', 'finalizado', 'cancelado'].includes(estadoPadre) && !padre.fecha_fin) continue
    const inicios = [fechaArg(ac.fecha_inicio), fechaArg(padre.fecha_inicio)].filter(Boolean).sort()
    if (inicios.length === 0) continue
    const finales = [fechaArg(ac.fecha_fin), fechaArg(padre.fecha_fin)].filter(Boolean).sort()
    const inicio = inicios[inicios.length - 1]
    const fin = finales.length > 0 ? finales[0] : hasta
    const tope = fin < hasta ? fin : hasta
    const reingreso = ultimoReingreso.get(ac.conductor_id)
    const primero = reingreso && reingreso > inicio ? reingreso : inicio
    if (primero > tope) continue
    const actual = ingresos.get(ac.conductor_id)
    if (!actual || primero < actual) ingresos.set(ac.conductor_id, primero)
  }
  return ingresos
}

/** Período en que paga por día con la promoción B1 (como periodoPagoB1), o null. */
export function periodoB1(promo, conductor, ingreso) {
  if (!promo || !ingreso) return null
  if (ingreso < promo.fecha_inicio || ingreso > promo.fecha_fin) return null
  const d1 = conductor.fecha_licencia_d1 ? String(conductor.fecha_licencia_d1).slice(0, 10) : null
  const tuvoB1 = conductor.categoria_licencia === 'B1' || (!!conductor.fecha_licencia_b1 && !!d1)
  if (!tuvoB1) return null
  const antesD1 = d1 ? sumarDias(d1, -1) : null
  const hasta = antesD1 && antesD1 < promo.fecha_fin ? antesD1 : promo.fecha_fin
  return hasta >= ingreso ? { desde: ingreso, hasta } : null
}

/* ------------------------------ Supabase --------------------------------- */

async function fetchConTimeout(url, opciones = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...opciones, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * En el servidor: clave de servicio. Para probar desde la app (sede Pruebas): cfg.apiKey (clave
 * pública) y cfg.token (sesión del usuario); ahí rigen los permisos de ese usuario.
 */
function headers(cfg, extra = {}) {
  return {
    apikey: cfg.apiKey || cfg.serviceKey,
    Authorization: `Bearer ${cfg.token || cfg.serviceKey}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function pedir(cfg, ruta, opciones = {}) {
  const res = await fetchConTimeout(`${cfg.url}/rest/v1/${ruta}`, {
    ...opciones,
    headers: headers(cfg, opciones.headers || {}),
  })
  const texto = await res.text()
  if (!res.ok) {
    const error = new Error(`Supabase ${res.status} en ${ruta.split('?')[0]}: ${texto.slice(0, 300)}`)
    error.faltaColumna = texto.includes('42703') || /column .* does not exist/i.test(texto)
    throw error
  }
  return texto ? JSON.parse(texto) : null
}

async function selectTodo(cfg, ruta) {
  const filas = []
  for (let desde = 0; desde < 200000; desde += 1000) {
    const pagina = await pedir(cfg, ruta, { headers: { Range: `${desde}-${desde + 999}` } })
    filas.push(...(pagina || []))
    if (!pagina || pagina.length < 1000) break
  }
  return filas
}

/** Lista para un filtro in.(...) de PostgREST */
const lista = (valores) => `(${valores.map((v) => `"${v}"`).join(',')})`

async function enLotes(valores, fn) {
  const filas = []
  for (let i = 0; i < valores.length; i += 150) filas.push(...await fn(valores.slice(i, i + 150)))
  return filas
}

/* ------------------------------ Carga ------------------------------------ */

let corriendo = false
let avisoSql = false

/**
 * Carga como pago los depósitos pendientes. Con simular = true no escribe nada y devuelve lo
 * que haría. Con sedeId, solo los depósitos de esa sede (para probar en la sede Pruebas).
 * Devuelve { cargados, omitidos, sinConductor, detalle }.
 */
export async function cargarPagosConductoresCresium(cfg, { simular = false, sedeId = null } = {}) {
  if (corriendo) return { cargados: 0, omitidos: 0, sinConductor: 0, detalle: [], omitido: 'en_curso' }
  corriendo = true
  try {
    return await cargar(cfg, simular, sedeId)
  } catch (err) {
    if (err.faltaColumna) {
      if (!avisoSql) console.error('[cresium-pagos] Falta correr sql/cresium_pagos_conductores.sql en Supabase')
      avisoSql = true
      return { cargados: 0, omitidos: 0, sinConductor: 0, detalle: [], omitido: 'falta_sql' }
    }
    throw err
  } finally {
    corriendo = false
  }
}

async function cargar(cfg, simular, sedeId) {
  const resumen = { cargados: 0, omitidos: 0, sinConductor: 0, detalle: [] }
  const movimientos = await selectTodo(
    cfg,
    'cresium_movimientos?select=id,empresa,cresium_id,fecha,procesado_en,cuit,cuenta_contraparte,importe' +
      `&direccion=eq.entrada&tipo=eq.DEPOSIT&estado=eq.SUCCESS&fecha=gte.${DESDE_PAGOS.slice(0, 10)}` +
      `&procesado_en=gte.${DESDE_PAGOS}` +
      '&pago_cargado_en=is.null&pago_omitido=is.null&order=procesado_en.asc' +
      (sedeId ? `&sede_id=eq.${sedeId}` : ''),
  )
  if (movimientos.length === 0) return resumen

  const [conductores, pagadores, asignadosB1, promos] = await Promise.all([
    selectTodo(cfg, 'conductores?select=id,nombres,apellidos,numero_dni,numero_cuit,cbu,sede_id,' +
      'categoria_licencia,fecha_licencia_b1,fecha_licencia_d1,fecha_reincorpoaracion&order=id'),
    selectTodo(cfg, 'cresium_pagadores_conductor?select=cuit,cbu,conductor_id'),
    enLotes(movimientos.map((m) => m.id), (ids) => selectTodo(
      cfg,
      `promocion_b1_pagos?select=conductor_id,cresium_movimiento_id&origen=eq.cresium&anulado_at=is.null&cresium_movimiento_id=in.${lista(ids)}`,
    )),
    selectTodo(cfg, `promociones?select=fecha_inicio,fecha_fin&clave=eq.${CLAVE_PROMO_B1}`),
  ])
  const indice = indexarConductores(conductores, pagadores)
  const asignadoB1 = new Map(asignadosB1.map((a) => [a.cresium_movimiento_id, a.conductor_id]))
  const promo = promos[0]?.fecha_inicio && promos[0]?.fecha_fin ? promos[0] : null

  // Conductor de cada depósito
  const conConductor = []
  for (const m of movimientos) {
    const c = conductorDelDeposito(m, indice, asignadoB1)
    if (c) conConductor.push({ m, c })
    else resumen.sinConductor++
  }
  if (conConductor.length === 0) return resumen

  // Ingreso de los que pueden pagar por día con B1 (para la referencia "- B1")
  const candidatosB1 = [...new Set(conConductor
    .filter(({ c }) => c.categoria_licencia === 'B1' || (c.fecha_licencia_b1 && c.fecha_licencia_d1))
    .map(({ c }) => c.id))]
  let ingresos = new Map()
  if (promo && candidatosB1.length > 0) {
    const [asigs, reingresos] = await Promise.all([
      enLotes(candidatosB1, (ids) => selectTodo(
        cfg,
        'asignaciones_conductores?select=conductor_id,fecha_inicio,fecha_fin,asignaciones!inner(estado,fecha_inicio,fecha_fin)' +
          `&conductor_id=in.${lista(ids)}&estado=in.(${ESTADOS_ASIGNACION.join(',')})`,
      )),
      enLotes(candidatosB1, (ids) => selectTodo(
        cfg,
        `historial_conductores?select=conductor_id,created_at&conductor_id=in.${lista(ids)}&estado_anterior=eq.BAJA&estado_nuevo=eq.ACTIVO`,
      )),
    ])
    ingresos = calcularIngresos(asigs, reingresos, conductores.filter((c) => candidatosB1.includes(c.id)), hoyART())
  }

  // Pagos manuales ya emparejados con otro depósito (no se usan dos veces)
  const yaEmparejados = new Set((await selectTodo(
    cfg,
    'cresium_movimientos?select=pago_control_saldo_id&pago_omitido=eq.ya_cargado_a_mano&pago_control_saldo_id=not.is.null',
  )).map((x) => x.pago_control_saldo_id))

  for (const { m, c } of conConductor) {
    const fecha = m.fecha
    const monto = redondear(m.importe)
    if (!(monto > 0)) continue
    const periodo = periodoB1(promo, c, ingresos.get(c.id))
    const esB1 = !!periodo && fecha >= periodo.desde && fecha <= periodo.hasta
    const concepto = esB1 ? CONCEPTO_TRANSFERENCIA_B1 : CONCEPTO_TRANSFERENCIA

    // ¿Ya se cargó a mano?
    const manuales = await selectTodo(
      cfg,
      `control_saldos?select=id,referencia&conductor_id=eq.${c.id}&tipo_movimiento=eq.pago_manual` +
        `&monto_movimiento=gte.${monto - 1}&monto_movimiento=lte.${monto + 1}` +
        `&created_at=gte.${sumarDias(fecha, -2)}T03:00:00Z&created_at=lte.${sumarDias(fecha, 8)}T02:59:59Z&order=created_at.asc`,
    )
    const manual = manuales.find((x) => !yaEmparejados.has(x.id) && !String(x.referencia || '').startsWith(CONCEPTO_TRANSFERENCIA))

    // Semana: la de la transferencia, o la actual si esa ya está cerrada en la sede
    let sem = semanaISO(fecha)
    if (c.sede_id) {
      const cerrados = await pedir(
        cfg,
        `periodos_facturacion?select=id&fecha_inicio=eq.${lunesDe(fecha)}&estado=eq.cerrado&sede_id=eq.${c.sede_id}&limit=1`,
      )
      if (cerrados && cerrados.length > 0) sem = semanaISO(hoyART())
    }

    const item = {
      cresium_id: m.cresium_id, empresa: m.empresa, fecha, monto, conductor_id: c.id,
      conductor: `${c.nombres || ''} ${c.apellidos || ''}`.trim(), concepto,
      semana: sem.semana, anio: sem.anio, accion: manual ? 'omitido_ya_cargado' : 'cargar',
    }
    resumen.detalle.push(item)
    if (simular) {
      if (manual) resumen.omitidos++
      else resumen.cargados++
      continue
    }

    if (manual) {
      const reservado = await pedir(
        cfg,
        `cresium_movimientos?id=eq.${m.id}&pago_cargado_en=is.null&pago_omitido=is.null`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ pago_omitido: 'ya_cargado_a_mano', pago_conductor_id: c.id, pago_control_saldo_id: manual.id }),
        },
      )
      if (reservado && reservado.length > 0) {
        yaEmparejados.add(manual.id)
        resumen.omitidos++
      }
      continue
    }

    if (await cargarUno(cfg, m, c, { monto, concepto, sem })) resumen.cargados++
  }
  return resumen
}

/** Carga un depósito como pago. false si otra vuelta ya lo tomó. */
async function cargarUno(cfg, m, c, { monto, concepto, sem }) {
  // Reservar el depósito (una sola escritura: solo si sigue pendiente)
  const ahora = new Date().toISOString()
  const reservado = await pedir(
    cfg,
    `cresium_movimientos?id=eq.${m.id}&pago_cargado_en=is.null&pago_omitido=is.null`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ pago_cargado_en: ahora, pago_conductor_id: c.id }),
    },
  )
  if (!reservado || reservado.length === 0) return false

  try {
    // Saldo del conductor (se crea en $0 si no tiene)
    let saldos = await pedir(cfg, `saldos_conductores?select=id,saldo_actual,ultima_actualizacion,conductor_nombre,conductor_dni,conductor_cuit&conductor_id=eq.${c.id}`)
    if (!saldos || saldos.length === 0) {
      saldos = await pedir(cfg, 'saldos_conductores', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          conductor_id: c.id,
          conductor_nombre: `${c.nombres || ''} ${c.apellidos || ''}`.trim(),
          conductor_dni: c.numero_dni,
          conductor_cuit: c.numero_cuit,
          saldo_actual: 0,
          dias_mora: 0,
          ultima_actualizacion: ahora,
          ...(c.sede_id ? { sede_id: c.sede_id } : {}),
        }),
      })
    }
    const saldoFila = saldos[0]

    const abono = await pedir(cfg, 'abonos_conductores', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        conductor_id: c.id, tipo: 'abono', monto, concepto, referencia: null,
        semana: sem.semana, anio: sem.anio,
        fecha_abono: m.procesado_en || `${m.fecha}T12:00:00-03:00`,
        created_by_name: USUARIO,
        ...(c.sede_id ? { sede_id: c.sede_id } : {}),
      }),
    })

    // Sumar al saldo sin pisar cambios de otro usuario (reintenta si cambió en el medio)
    let nuevoSaldo = null
    let fila = saldoFila
    for (let intento = 0; intento < 5 && nuevoSaldo === null; intento++) {
      const calculado = redondear((Number(fila.saldo_actual) || 0) + monto)
      const filtro = fila.ultima_actualizacion
        ? `&ultima_actualizacion=eq.${encodeURIComponent(fila.ultima_actualizacion)}`
        : '&ultima_actualizacion=is.null'
      const actualizado = await pedir(cfg, `saldos_conductores?id=eq.${fila.id}${filtro}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          saldo_actual: calculado,
          ultima_actualizacion: new Date().toISOString(),
          ...(calculado >= 0 ? { dias_mora: 0 } : {}),
        }),
      })
      if (actualizado && actualizado.length > 0) nuevoSaldo = calculado
      else fila = (await pedir(cfg, `saldos_conductores?select=id,saldo_actual,ultima_actualizacion&id=eq.${fila.id}`))[0]
    }
    if (nuevoSaldo === null) throw new Error('el saldo cambió 5 veces seguidas mientras se cargaba')

    const movimiento = await pedir(cfg, 'control_saldos', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        conductor_id: c.id,
        conductor_nombre: saldoFila.conductor_nombre || `${c.nombres || ''} ${c.apellidos || ''}`.trim(),
        conductor_dni: saldoFila.conductor_dni || c.numero_dni,
        conductor_cuit: saldoFila.conductor_cuit || c.numero_cuit,
        semana: sem.semana,
        anio: sem.anio,
        tipo_movimiento: 'pago_manual',
        monto_movimiento: monto,
        referencia: concepto,
        saldo_adeudado: nuevoSaldo < 0 ? Math.abs(nuevoSaldo) : 0,
        saldo_a_favor: nuevoSaldo > 0 ? nuevoSaldo : 0,
        saldo_pendiente: nuevoSaldo,
        created_by_name: USUARIO,
        ...(c.sede_id ? { sede_id: c.sede_id } : {}),
      }),
    })

    await pedir(cfg, `cresium_movimientos?id=eq.${m.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ pago_abono_id: abono[0].id, pago_control_saldo_id: movimiento[0].id }),
    })
    return true
  } catch (err) {
    // Queda reservado (no se vuelve a cargar solo): revisar a mano con este mensaje
    console.error(`[cresium-pagos] Depósito ${m.empresa} ${m.cresium_id} ($${monto}, conductor ${c.id}) quedó a medio cargar:`, err.message)
    throw err
  }
}
