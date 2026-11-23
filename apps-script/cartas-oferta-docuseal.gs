/**
 * =====================================================================
 *  CARTAS OFERTA (DocuSeal) -> carpeta del conductor en Drive   (v4, 2026-11-23)
 * =====================================================================
 *
 * Cada 1 minuto, en la casilla de josue.caride@toshify.com.ar:
 *   1. Busca los correos de DocuSeal (info@docuseal.com) de Cartas Oferta
 *      completadas, por ejemplo:
 *        "Carta Oferta OCT-26 N° 000001 - Turno - Diurno - JUAN GUSTAVO KULCHYZKI
 *         ha sido completado por ..."
 *      Los "Tu copia del documento" se ignoran (son el mismo PDF).
 *   2. Le pregunta a Toshibase (API /api/carpeta-carta-oferta) cuál es el conductor
 *      y su carpeta: la MISMA que abre el botón "Ver historial contratos" de su ficha.
 *      Toshibase lo identifica por la carta generada (N° + turno + nombre), por el
 *      email de quien firmó o por el nombre exacto.
 *   3. Dentro de esa carpeta crea (si no existe) "Carta oferta completada" y guarda
 *      ahí los PDF del correo (la Carta Oferta y el Registro de Auditoría).
 *
 * CAMBIO RESPECTO DE LA v1: ya no busca la carpeta por nombre dentro de Documentación
 * (fallaba cuando había dos carpetas con el mismo nombre, p. ej. MARTIN SEBASTIAN
 * MARTINEZ). Ahora usa la carpeta vinculada en la ficha del conductor.
 * v4: la carpeta es la de contratos ("Ver historial contratos", la misma donde
 * Toshibase genera las cartas), ya no la de "Ver documentos". Se guarda en la
 * subcarpeta "Carta oferta completada" porque la carta firmada se llama igual que
 * el PDF que genera Toshibase (sin subcarpeta, no se guardaría por "ya existía").
 *
 * Si Toshibase no encuentra al conductor, encuentra varios posibles, o la ficha no
 * tiene carpeta, NO guarda nada: lo anota en el registro y lo vuelve a intentar en
 * cada vuelta (durante DIAS_REINTENTAR días). Se arregla completando la ficha en
 * Toshibase (por ejemplo, el link de "Ver historial contratos").
 *
 * PRIMERA VEZ: revisa TODAS las cartas oferta de la casilla, en tandas.
 * Después, solo las nuevas. Cada ejecución toma primero lo nuevo.
 *
 * AVISOS EN SLACK (canal it-log-bots, v3):
 *   ✅ cada carta guardada (conductor, carpeta, archivos).
 *   ⚠️ cada carta que no se pudo guardar, UNA vez (motivo y cómo se arregla); los
 *      reintentos no vuelven a avisar. Si después se guarda, llega el ✅.
 *   🛑 Toshibase no responde / clave rechazada / error del script (como mucho uno
 *      por hora del mismo tipo), y cartas que se dejaron de reintentar.
 *
 * NO MODIFICA EL CORREO: no pone etiquetas, no marca como leído, no archiva.
 * Un archivo con el mismo nombre en la carpeta "Carta oferta completada" no
 * se vuelve a guardar.
 *
 * INSTALACIÓN / ACTUALIZACIÓN (con la cuenta josue.caride@toshify.com.ar):
 *   a. Reemplazar TODO el código del proyecto por este archivo y guardar.
 *   b. Configuración del proyecto (engranaje) -> Propiedades del script -> Agregar:
 *        Propiedad: TOSHIFY_API_KEY   Valor: (la clave que te pasa el equipo de sistemas;
 *        es la misma CARTAS_OFERTA_API_KEY del servidor de Toshibase)
 *        Propiedad: SLACK_BOT_TOKEN   Valor: (token del bot de Slack de las alertas; xoxb-...)
 *      Las claves NO van en el código.
 *      (Opcional) Ejecutar "probarSlack": manda un mensaje de prueba al canal.
 *   c. Zona horaria del proyecto: (GMT-03:00) Buenos Aires.
 *   d. (Opcional) Ejecutar "probarUltimosCorreos": muestra en el registro qué haría
 *      con las últimas cartas oferta, SIN guardar nada.
 *   e. Ejecutar "instalar" y aceptar los permisos (pide uno nuevo: conectarse a un
 *      servicio externo, que es Toshibase).
 *   Si ya estaba instalada la v1, "instalar" reemplaza el disparador. Lo ya guardado
 *   no se duplica (se compara por nombre de archivo).
 */

// =====================================================================
// CONFIGURACIÓN
// =====================================================================

const CONFIG = {
  // Toshibase: devuelve la carpeta de contratos del conductor ("Ver historial contratos").
  API_URL: 'https://app.toshify.com.ar/api/carpeta-carta-oferta',

  // Carpeta que se crea dentro de la del conductor.
  NOMBRE_SUBCARPETA: 'Carta oferta completada',

  // Correos de DocuSeal de cartas oferta completadas, con adjunto.
  BUSQUEDA: 'from:info@docuseal.com subject:"carta oferta" subject:"ha sido completado" has:attachment',

  // Adjuntos que se guardan.
  EXTENSIONES: ['pdf'],

  // Conversaciones por ejecución, y tiempo máximo (Apps Script corta a los 6 minutos).
  MAX_CORREOS: 20,
  MAX_SEGUNDOS: 270,

  // Cada cuántos minutos revisa (1, 5, 10, 15 o 30).
  MINUTOS: 1,

  // Slack: canal it-log-bots (el token va en la propiedad del script SLACK_BOT_TOKEN).
  SLACK_CANAL: 'C0A7C2U5ABY',
};

// Avisos de "Toshibase no responde" / error del script: como mucho uno por hora del mismo tipo.
const MINUTOS_ENTRE_ALERTAS = 60;

const BUSQUEDA_RECIENTES = `${CONFIG.BUSQUEDA} newer_than:7d`;

// Correos ya guardados: se olvidan cuando el correo tiene más de estos días.
const DIAS_RECORDAR_PROCESADOS = 15;

// Fuera de la primera revisión, los correos más viejos que esto se saltean.
const DIAS_RECIENTES = 8;

// Conductores no encontrados: se reintentan durante estos días.
const DIAS_REINTENTAR = 30;

// Respuestas de Toshibase que se reintentan más tarde (se pueden arreglar en la ficha).
const MOTIVOS_REINTENTAR = ['no_encontrado', 'ambiguo', 'sin_carpeta', 'carpeta_invalida'];

// =====================================================================
// INSTALACIÓN
// =====================================================================

/** Ejecutar UNA vez. Verifica permisos y la conexión con Toshibase, y crea el disparador. */
function instalar() {
  // Verificaciones ANTES de crear el disparador
  GmailApp.search(CONFIG.BUSQUEDA, 0, 1);
  const prueba = consultarToshibase('prueba de conexión');
  if (prueba.motivo === 'no_autorizado' || prueba.motivo === 'sin_configurar' || prueba.motivo === 'sin_clave') {
    throw new Error('No se pudo conectar con Toshibase: ' + (prueba.detalle || prueba.motivo) +
      '. Revisá la propiedad del script TOSHIFY_API_KEY.');
  }
  if (prueba.motivo === 'error_conexion') throw new Error('Toshibase no responde: ' + prueba.detalle);

  desinstalar();
  ScriptApp.newTrigger('procesarCartas').timeBased().everyMinutes(CONFIG.MINUTOS).create();
  Logger.log(`Listo: revisa las cartas oferta de DocuSeal cada ${CONFIG.MINUTOS} minuto(s). ` +
    (revisionCompletaTerminada() ? '' : 'Primero revisa todas las anteriores, en tandas. ') +
    'Los resultados se ven en "Ejecuciones" (menú de la izquierda).');
}

/** Apaga la automatización. */
function desinstalar() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'procesarCartas')
    .forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('Disparador eliminado.');
}

// =====================================================================
// PROCESO PRINCIPAL
// =====================================================================

function procesarCartas() {
  ejecutar(false);
}

/**
 * Prueba: muestra en el Registro de ejecución qué haría con las últimas
 * cartas oferta (de cualquier fecha), SIN guardar nada ni crear carpetas.
 */
function probarUltimosCorreos() {
  ejecutar(true);
}

function ejecutar(soloPrueba) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log('Hay otra ejecución en curso (probablemente la automática). Esta no hizo nada.');
    return;
  }

  const inicio = Date.now();
  const props = PropertiesService.getScriptProperties();
  const completa = !soloPrueba && !revisionCompletaTerminada();
  const desde = completa ? Number(props.getProperty('REVISION_DESDE') || 0) : 0;

  const resumen = {
    completa, desde, terminadas: 0, correos: 0, yaProcesados: 0, viejos: 0, sinNombre: 0,
    guardadas: 0, noEncontrados: [], ambiguos: [], sinCarpeta: [], erroresApi: 0,
    archivos: 0, yaExistian: 0, reintentos: 0, cortado: false, revisionTerminada: false,
  };

  let procesados = null;
  let pendientes = null;
  let alertados = null;
  try {
    procesados = leerProcesados();
    pendientes = leerPendientes();
    alertados = leerAlertados();
    const ctx = { procesados, pendientes, alertados, soloPrueba, resumen, inicio, nuevosPendientes: {} };

    if (soloPrueba) {
      // Las últimas cartas, de cualquier fecha
      recorrerHilos(GmailApp.search(CONFIG.BUSQUEDA, 0, 30), false, ctx);
      return;
    }

    // 1. Lo nuevo (últimos 7 días)
    recorrerHilos(GmailApp.search(BUSQUEDA_RECIENTES, 0, CONFIG.MAX_CORREOS), true, ctx);

    // 2. Cartas que antes no se pudieron guardar
    reintentarPendientes(ctx);

    // 3. Primera revisión completa, con el tiempo que queda
    if (completa && !resumen.cortado) {
      const hilos = GmailApp.search(CONFIG.BUSQUEDA, desde, CONFIG.MAX_CORREOS);
      resumen.terminadas = recorrerHilos(hilos, false, ctx);
      if (!resumen.cortado && hilos.length < CONFIG.MAX_CORREOS) {
        props.setProperty('REVISION_COMPLETA', 'si');
        props.deleteProperty('REVISION_DESDE');
        resumen.revisionTerminada = true;
      } else {
        props.setProperty('REVISION_DESDE', String(desde + resumen.terminadas));
      }
    }
  } catch (e) {
    Logger.log('Error: ' + e.message);
    if (!soloPrueba) {
      alertarGeneral('script', '🛑 *Error en el script de Cartas Oferta*', [
        `❌ *Error:* ${e.message}`,
        '🛠️ *Qué hacer:* revisar "Ejecuciones" en el Apps Script (cuenta josue.caride). ' +
          'Lo que no se llegó a guardar se vuelve a intentar en la próxima ejecución.',
      ]);
    }
    throw e; // queda en "Ejecuciones"; Google avisa por mail si falla seguido
  } finally {
    if (!soloPrueba && procesados) guardarProcesados(procesados);
    if (!soloPrueba && pendientes) guardarPendientes(pendientes);
    if (!soloPrueba && alertados && pendientes) guardarAlertados(alertados, pendientes);
    lock.releaseLock();
    logResumen(resumen, soloPrueba);
  }
}

/** Procesa los correos de las conversaciones. Devuelve cuántas terminó. */
function recorrerHilos(hilos, soloRecientes, ctx) {
  const r = ctx.resumen;
  const limiteRecientes = Date.now() - DIAS_RECIENTES * 24 * 60 * 60 * 1000;
  let terminadas = 0;
  for (const hilo of hilos) {
    if (seAcaboElTiempo(ctx)) break;
    for (const mensaje of hilo.getMessages()) {
      if (!esCartaCompletada(mensaje)) continue; // otras respuestas de la conversación
      r.correos++;
      if (soloRecientes && mensaje.getDate().getTime() < limiteRecientes) {
        r.viejos++;
        continue;
      }
      if (!ctx.soloPrueba && (ctx.procesados[mensaje.getId()] || ctx.pendientes[mensaje.getId()])) {
        r.yaProcesados++;
        continue;
      }
      procesarMensaje(mensaje, ctx);
    }
    terminadas++;
  }
  return terminadas;
}

/** Vuelve a intentar los correos que antes no se pudieron guardar. */
function reintentarPendientes(ctx) {
  const limite = Date.now() - DIAS_REINTENTAR * 24 * 60 * 60 * 1000;
  for (const id of Object.keys(ctx.pendientes)) {
    if (seAcaboElTiempo(ctx)) break;
    if (ctx.nuevosPendientes[id]) continue; // recién anotado en esta ejecución
    if (ctx.pendientes[id] < limite) {
      delete ctx.pendientes[id]; // ya no se reintenta
      let asunto = id;
      try { asunto = GmailApp.getMessageById(id).getSubject(); } catch (e) { /* el correo ya no existe */ }
      avisarSlack(mensajeSlack('🛑 *Carta oferta: se dejó de reintentar*', [
        `👤 *Conductor:* ${nombreDelConductor(asunto) || '?'}`,
        `📄 *Carta:* ${asunto}`,
        `❌ *Motivo:* pasaron ${DIAS_REINTENTAR} días sin poder guardarla.`,
        '🛠️ *Qué hacer:* guardar el PDF a mano en la carpeta del conductor, o corregir la ficha ' +
          'y ejecutar "revisarTodoDeNuevo" en el Apps Script.',
      ]));
      continue;
    }
    let mensaje = null;
    try { mensaje = GmailApp.getMessageById(id); } catch (e) { mensaje = null; }
    if (!mensaje) {
      delete ctx.pendientes[id];
      continue;
    }
    ctx.resumen.reintentos++;
    delete ctx.pendientes[id];
    procesarMensaje(mensaje, ctx);
  }
}

/** Pregunta a Toshibase la carpeta del conductor y guarda los PDF del correo. */
function procesarMensaje(mensaje, ctx) {
  const r = ctx.resumen;
  const asunto = mensaje.getSubject();
  const prefijo = `${ctx.soloPrueba ? '[PRUEBA] ' : ''}"${asunto}"`;
  const nombre = nombreDelConductor(asunto) || '?';

  const resp = consultarToshibase(asunto);

  if (!resp.ok) {
    if (resp.motivo === 'sin_nombre') {
      r.sinNombre++;
      Logger.log(`${prefijo} -> no se pudo sacar el nombre del conductor del asunto`);
      if (!ctx.soloPrueba) {
        ctx.procesados[mensaje.getId()] = diaDe(mensaje.getDate());
        avisarSlack(mensajeSlack('⚠️ *Atención:* Carta oferta NO guardada', [
          `📄 *Carta:* ${asunto}`,
          `📬 *Correo del:* ${fechaHora(mensaje.getDate())}`,
          '❌ *Error:* no se pudo leer el nombre del conductor en el asunto del correo ' +
            '(se esperaba "... - NOMBRE ha sido completado por ...").',
          '🛠️ *Qué hacer:* guardar el PDF a mano en la carpeta del conductor. Esta carta no se reintenta.',
        ]));
      }
      return;
    }
    const lista = resp.motivo === 'ambiguo' ? r.ambiguos
      : resp.motivo === 'sin_carpeta' || resp.motivo === 'carpeta_invalida' ? r.sinCarpeta
        : r.noEncontrados;
    const reintentable = MOTIVOS_REINTENTAR.includes(resp.motivo);
    if (reintentable) {
      if (!lista.includes(nombre)) lista.push(nombre);
    } else {
      r.erroresApi++; // Toshibase caído, clave mal, etc.: también se reintenta
    }
    Logger.log(`${prefijo} -> ${nombre}: ${resp.detalle || resp.motivo}. No se guarda, se reintenta más tarde.`);
    if (!ctx.soloPrueba) {
      ctx.pendientes[mensaje.getId()] = mensaje.getDate().getTime();
      ctx.nuevosPendientes[mensaje.getId()] = true;
      if (!reintentable) {
        alertarErrorToshibase(resp);
      } else if (!ctx.alertados[mensaje.getId()]) {
        // Una sola vez por carta: los reintentos no vuelven a avisar
        if (avisarSlack(mensajeSlack('⚠️ *Atención:* Carta oferta NO guardada', [
          `👤 *Conductor:* ${resp.conductor ? `${resp.conductor.nombre} (DNI ${resp.conductor.dni || '?'})` : nombre}`,
          `📄 *Carta:* ${asunto}`,
          `📬 *Correo del:* ${fechaHora(mensaje.getDate())}`,
          `❌ *Error:* ${explicarMotivo(resp)}`,
          `🛠️ *Cómo se arregla:* ${comoSeArregla(resp)}`,
          `🔁 Se reintenta sola cada ${CONFIG.MINUTOS} minuto(s) durante ${DIAS_REINTENTAR} días: ` +
            'apenas se corrija, se guarda y llega el aviso ✅.',
        ]))) {
          ctx.alertados[mensaje.getId()] = Date.now();
        }
      }
    }
    return;
  }

  const adjuntos = mensaje.getAttachments({ includeInlineImages: false })
    .filter(a => CONFIG.EXTENSIONES.includes(extension(a.getName())));
  r.guardadas++;
  Logger.log(`${prefijo} -> ${resp.carpeta} / ${CONFIG.NOMBRE_SUBCARPETA} ` +
    `(${resp.conductor.nombre}, DNI ${resp.conductor.dni || '?'}; ${resp.motivo}; ${adjuntos.length} PDF)`);
  if (ctx.soloPrueba) return;

  const destino = subcarpeta(DriveApp.getFolderById(resp.folderId), CONFIG.NOMBRE_SUBCARPETA);
  const nuevos = [];
  const existian = [];
  adjuntos.forEach(a => {
    if (guardarSiNoExiste(destino, a)) {
      r.archivos++;
      nuevos.push(a.getName());
    } else {
      r.yaExistian++;
      existian.push(a.getName());
    }
  });
  ctx.procesados[mensaje.getId()] = diaDe(mensaje.getDate());

  // Solo si guardó algo (si todo ya existía, ya se avisó antes)
  if (nuevos.length) {
    const habiaFallado = !!ctx.alertados[mensaje.getId()];
    avisarSlack(mensajeSlack('✅ *Carta oferta guardada*' + (habiaFallado ? ' (antes había fallado, ya está resuelto)' : ''), [
      `👤 *Conductor:* ${resp.conductor.nombre} (DNI ${resp.conductor.dni || '?'})`,
      `📄 *Carta:* ${asunto}`,
      `📁 *Carpeta:* <${destino.getUrl()}|${resp.carpeta} / ${CONFIG.NOMBRE_SUBCARPETA}>`,
      `📎 *Archivos guardados (${nuevos.length}):* ${nuevos.join(', ')}`,
      existian.length ? `📎 *Ya estaban:* ${existian.join(', ')}` : null,
      `🔎 *Cómo se identificó al conductor:* ${resp.motivo}`,
    ]));
  }
  delete ctx.alertados[mensaje.getId()];
}

/**
 * POST a Toshibase con el asunto del correo. Devuelve:
 *   { ok: true, folderId, carpeta, conductor: { nombre, dni }, motivo }
 *   { ok: false, motivo: 'no_encontrado' | 'ambiguo' | 'sin_carpeta' | 'carpeta_invalida' |
 *                        'sin_nombre' | 'no_autorizado' | 'error_conexion' | ..., detalle }
 */
function consultarToshibase(asunto) {
  const clave = PropertiesService.getScriptProperties().getProperty('TOSHIFY_API_KEY');
  if (!clave) return { ok: false, motivo: 'sin_clave', detalle: 'Falta la propiedad del script TOSHIFY_API_KEY' };
  try {
    const res = UrlFetchApp.fetch(CONFIG.API_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': clave },
      payload: JSON.stringify({ asunto }),
      muteHttpExceptions: true,
    });
    const codigo = res.getResponseCode();
    let cuerpo = {};
    try { cuerpo = JSON.parse(res.getContentText()); } catch (e) { cuerpo = {}; }
    if (codigo === 200) return cuerpo;
    return { ok: false, motivo: cuerpo.motivo || 'error_http', detalle: cuerpo.detalle || `Toshibase respondió ${codigo}` };
  } catch (e) {
    return { ok: false, motivo: 'error_conexion', detalle: e.message };
  }
}

function seAcaboElTiempo(ctx) {
  if (Date.now() - ctx.inicio > CONFIG.MAX_SEGUNDOS * 1000) ctx.resumen.cortado = true;
  return ctx.resumen.cortado;
}

function revisionCompletaTerminada() {
  return PropertiesService.getScriptProperties().getProperty('REVISION_COMPLETA') === 'si';
}

function logResumen(r, soloPrueba) {
  let revision = null;
  if (r.completa) {
    revision = r.cortado && r.terminadas === 0
      ? 'Primera revisión completa: esta vez no quedó tiempo (sigue en la próxima ejecución)'
      : `Primera revisión completa: conversaciones ${r.desde + 1} a ${r.desde + r.terminadas}` +
        (r.revisionTerminada ? ' (TERMINADA: desde ahora solo las nuevas)' : ' (sigue en la próxima ejecución)');
  }
  Logger.log([
    `===== ${soloPrueba ? 'RESUMEN DE LA PRUEBA (no se guardó nada)' : 'RESUMEN'} =====`,
    revision,
    `Cartas oferta revisadas: ${r.correos}`,
    r.cortado ? 'Se cortó por tiempo; sigue en la próxima ejecución.' : null,
    soloPrueba ? null : `Ya guardadas o pendientes antes: ${r.yaProcesados}`,
    r.reintentos ? `Reintentos: ${r.reintentos}` : null,
    `Con carpeta del conductor: ${r.guardadas}`,
    r.noEncontrados.length ? `Conductor no encontrado en Toshibase (${r.noEncontrados.length}): ${r.noEncontrados.join(', ')}` : null,
    r.ambiguos.length ? `Varios conductores posibles (${r.ambiguos.length}): ${r.ambiguos.join(', ')}` : null,
    r.sinCarpeta.length ? `Ficha sin carpeta en "Ver historial contratos" (${r.sinCarpeta.length}): ${r.sinCarpeta.join(', ')}` : null,
    r.erroresApi ? `No se pudo consultar Toshibase: ${r.erroresApi} (se reintenta)` : null,
    r.sinNombre ? `Sin nombre en el asunto: ${r.sinNombre}` : null,
    soloPrueba ? null : `PDF guardados: ${r.archivos}`,
    soloPrueba ? null : `PDF que ya existían: ${r.yaExistian}`,
  ].filter(Boolean).join('\n'));
}

// =====================================================================
// SLACK
// =====================================================================

/** Manda un mensaje de prueba al canal. */
function probarSlack() {
  const ok = avisarSlack(mensajeSlack('🧪 *Prueba de avisos de Cartas Oferta*', [
    'Si ves este mensaje, los avisos del script de Cartas Oferta (DocuSeal) llegan bien a este canal.',
  ]));
  Logger.log(ok ? 'Mensaje enviado a Slack.' : 'No se pudo enviar (ver el detalle arriba).');
}

/** Arma el mensaje con el estilo de las otras alertas. Las líneas null se omiten. */
function mensajeSlack(titulo, lineas) {
  return [titulo, ...lineas.filter(Boolean), `📅 *Fecha y Hora:* ${fechaHora(new Date())}`].join('\n');
}

/** Publica en el canal. Devuelve true si Slack lo aceptó. Nunca corta el proceso. */
function avisarSlack(texto) {
  const token = PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN');
  if (!token) {
    Logger.log('Slack: falta la propiedad del script SLACK_BOT_TOKEN (no se avisó).');
    return false;
  }
  try {
    const res = UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
      method: 'post',
      contentType: 'application/json; charset=utf-8',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ channel: CONFIG.SLACK_CANAL, text: texto, unfurl_links: false }),
      muteHttpExceptions: true,
    });
    const cuerpo = JSON.parse(res.getContentText() || '{}');
    if (!cuerpo.ok) Logger.log('Slack rechazó el mensaje: ' + (cuerpo.error || res.getResponseCode()));
    return !!cuerpo.ok;
  } catch (e) {
    Logger.log('Slack: no se pudo enviar: ' + e.message);
    return false;
  }
}

/** Aviso general (no de una carta): como mucho uno por hora del mismo tipo. */
function alertarGeneral(tipo, titulo, lineas) {
  const props = PropertiesService.getScriptProperties();
  const clave = 'ALERTA_' + tipo;
  const ultima = Number(props.getProperty(clave) || 0);
  if (Date.now() - ultima < MINUTOS_ENTRE_ALERTAS * 60 * 1000) return;
  if (avisarSlack(mensajeSlack(titulo, lineas))) props.setProperty(clave, String(Date.now()));
}

/** Toshibase caído, clave rechazada, etc. Las cartas quedan pendientes y se reintentan. */
function alertarErrorToshibase(resp) {
  const porMotivo = {
    no_autorizado: 'Toshibase rechazó la clave: la propiedad TOSHIFY_API_KEY del script no coincide con ' +
      'CARTAS_OFERTA_API_KEY del servidor.',
    sin_clave: 'Falta la propiedad del script TOSHIFY_API_KEY.',
    sin_configurar: 'Al servidor de Toshibase le falta la variable CARTAS_OFERTA_API_KEY (Dokploy).',
    error_conexion: 'No se pudo conectar con Toshibase (app.toshify.com.ar caído o sin red).',
  };
  alertarGeneral('toshibase_' + resp.motivo, '🛑 *Cartas Oferta: no se pudo consultar Toshibase*', [
    `❌ *Error:* ${porMotivo[resp.motivo] || 'Toshibase respondió con un error.'}`,
    resp.detalle ? `🧾 *Detalle técnico:* ${resp.detalle}` : null,
    '🔁 Las cartas quedan pendientes y se guardan solas cuando Toshibase vuelva a responder. ' +
      `(Este aviso se repite como mucho cada ${MINUTOS_ENTRE_ALERTAS} minutos.)`,
  ]);
}

/** Por qué no se pudo guardar, en palabras. */
function explicarMotivo(resp) {
  switch (resp.motivo) {
    case 'no_encontrado':
      return 'no hay ningún conductor en Toshibase que coincida con esta carta ' +
        '(ni por N° de carta generada, ni por el email de quien firmó, ni por nombre exacto).';
    case 'ambiguo':
      return `hay más de un conductor posible en Toshibase. ${resp.detalle || ''}`.trim();
    case 'sin_carpeta':
      return 'la ficha del conductor en Toshibase no tiene link en "Ver historial contratos".';
    case 'carpeta_invalida':
      return 'el link de "Ver historial contratos" de la ficha no abre una carpeta válida ' +
        `(fue borrada, está en la papelera o no hay acceso). Detalle: ${resp.detalle || resp.motivo}`;
    default:
      return resp.detalle || resp.motivo;
  }
}

/** Qué hay que hacer para que se guarde. */
function comoSeArregla(resp) {
  switch (resp.motivo) {
    case 'no_encontrado':
      return 'revisar que el conductor esté cargado en Toshibase con el mismo nombre que figura en la carta.';
    case 'ambiguo':
      return 'revisar si el conductor está duplicado en Toshibase y dejar una sola ficha.';
    case 'sin_carpeta':
    case 'carpeta_invalida':
      return 'en la ficha del conductor, corregir el link de "Ver historial contratos" con el de su carpeta de contratos en Drive (Carta Oferta - Buenos Aires).';
    default:
      return 'avisar a sistemas.';
  }
}

function fechaHora(fecha) {
  return Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

// =====================================================================
// CORREO
// =====================================================================

/** Es una carta oferta completada de DocuSeal (no "Tu copia del documento"). */
function esCartaCompletada(mensaje) {
  const asunto = normalizar(mensaje.getSubject());
  return /CARTA\s+OFERTA/.test(asunto) && /HA\s+SIDO\s+COMPLETAD/.test(asunto) &&
    String(mensaje.getFrom()).toLowerCase().includes('docuseal');
}

/**
 * Solo para el registro: "... - JUAN GUSTAVO KULCHYZKI ha sido completado por ..."
 * -> "JUAN GUSTAVO KULCHYZKI". Quién es el conductor lo decide Toshibase.
 */
function nombreDelConductor(asunto) {
  const m = String(asunto).match(/-\s*([^-]+?)\s+ha\s+sido\s+completad[oa]/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

// =====================================================================
// MEMORIA
// =====================================================================

/** Correos ya guardados: { idCorreo: 'yyyy-MM-dd' }, agrupados por día (P_yyyy-MM-dd). */
function leerProcesados() {
  const todas = PropertiesService.getScriptProperties().getProperties();
  const procesados = {};
  Object.keys(todas).filter(k => k.startsWith('P_')).forEach(k => {
    JSON.parse(todas[k]).forEach(id => { procesados[id] = k.slice(2); });
  });
  return procesados;
}

function guardarProcesados(procesados) {
  const props = PropertiesService.getScriptProperties();
  const limite = diaDe(new Date(Date.now() - DIAS_RECORDAR_PROCESADOS * 24 * 60 * 60 * 1000));
  const porDia = {};
  Object.keys(procesados).forEach(id => {
    const dia = procesados[id];
    if (dia >= limite) (porDia['P_' + dia] = porDia['P_' + dia] || []).push(id);
  });
  Object.keys(props.getProperties())
    .filter(k => k.startsWith('P_') && !porDia[k])
    .forEach(k => props.deleteProperty(k));
  const valores = {};
  Object.keys(porDia).forEach(k => { valores[k] = JSON.stringify(porDia[k]); });
  props.setProperties(valores);
}

/** Correos que no se pudieron guardar todavía: { idCorreo: fecha del correo (ms) }. */
function leerPendientes() {
  const raw = PropertiesService.getScriptProperties().getProperty('PENDIENTES');
  return raw ? JSON.parse(raw) : {};
}

function guardarPendientes(pendientes) {
  PropertiesService.getScriptProperties().setProperty('PENDIENTES', JSON.stringify(pendientes));
}

/** Cartas pendientes que ya se avisaron en Slack: { idCorreo: cuándo (ms) }. */
function leerAlertados() {
  const raw = PropertiesService.getScriptProperties().getProperty('ALERTADOS');
  return raw ? JSON.parse(raw) : {};
}

/** Solo se recuerdan las que siguen pendientes (las guardadas o descartadas se olvidan). */
function guardarAlertados(alertados, pendientes) {
  const vigentes = {};
  Object.keys(alertados).filter(id => pendientes[id]).forEach(id => { vigentes[id] = alertados[id]; });
  PropertiesService.getScriptProperties().setProperty('ALERTADOS', JSON.stringify(vigentes));
}

/** Muestra las cartas que todavía no se pudieron guardar y por qué. */
function verPendientes() {
  const pendientes = leerPendientes();
  const ids = Object.keys(pendientes);
  if (ids.length === 0) Logger.log('No hay cartas pendientes.');
  ids.forEach(id => {
    try {
      const m = GmailApp.getMessageById(id);
      const resp = consultarToshibase(m.getSubject());
      Logger.log(`${nombreDelConductor(m.getSubject()) || '?'}  |  ` +
        (resp.ok ? `ya tiene carpeta (${resp.carpeta}): se guarda en la próxima vuelta` : (resp.detalle || resp.motivo)));
    } catch (e) {
      Logger.log(`${id} (ya no existe)`);
    }
  });
}

/** Vuelve a hacer la revisión de TODAS las cartas (lo ya guardado no se duplica). */
function revisarTodoDeNuevo() {
  const props = PropertiesService.getScriptProperties();
  Object.keys(props.getProperties())
    .filter(k => k.startsWith('P_') || k === 'REVISION_COMPLETA' || k === 'REVISION_DESDE')
    .forEach(k => props.deleteProperty(k));
  Logger.log('Listo: la próxima ejecución vuelve a revisar todas las cartas oferta, en tandas.');
}

// =====================================================================
// DRIVE Y UTILIDADES
// =====================================================================

/** Subcarpeta por nombre (sin importar mayúsculas ni tildes); la crea si no existe. */
function subcarpeta(padre, nombre) {
  const clave = normalizar(nombre).trim();
  const it = padre.getFolders();
  while (it.hasNext()) {
    const c = it.next();
    if (normalizar(c.getName()).trim() === clave) return c;
  }
  Logger.log(`   Carpeta nueva: ${padre.getName()} / ${nombre}`);
  return padre.createFolder(nombre);
}

/** Guarda el adjunto si no hay otro con el mismo nombre. Devuelve true si lo guardó. */
function guardarSiNoExiste(carpeta, adjunto) {
  const nombre = adjunto.getName();
  if (carpeta.getFilesByName(nombre).hasNext()) {
    Logger.log(`   Ya existía: ${nombre}`);
    return false;
  }
  carpeta.createFile(adjunto.copyBlob()).setName(nombre);
  Logger.log(`   Guardado: ${nombre}`);
  return true;
}

function diaDe(fecha) {
  return Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function extension(nombre) {
  return (String(nombre).split('.').pop() || '').toLowerCase();
}

function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}
