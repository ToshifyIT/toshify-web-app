/**
 * ===================================================================
 * TOSHIFY - Generador Automático de Ofertas de Locación
 * ===================================================================
 *
 * INSTALACIÓN:
 * 1. Abrir el Google Sheet → Extensiones → Apps Script
 * 2. Borrar el contenido del archivo Code.gs
 * 3. Pegar este código completo
 * 4. Guardar (Ctrl+S)
 * 5. Volver al Sheet y recargar la página (F5)
 * 6. Aparecerá el menú "Automatización" en la barra superior
 * 7. La primera ejecución solicitará permisos de Google Drive y Docs
 *
 * OPCIONES DEL MENÚ:
 * - "Crear ofertas pendientes"         → procesa filas con estado "Pendiente"
 *                                        usa plantilla Autos del Pueblo
 *                                        nombre: "Oferta de Locación - TITULAR - PATENTE"
 *                                        marca columna BB con "GRUPO CG"
 *
 * - "Crear ofertas pendientes 44 Dream" → procesa filas con estado "Pendiente 44 Dream"
 *                                         usa plantilla 44 Dream
 *                                         nombre: "Oferta de Locación 44 Dream - TITULAR - PATENTE"
 *                                         marca columna BB con "44 DREAMS"
 *
 * REQUISITOS EN EL SHEET:
 * - Columna A (Crear Oferta Locación): poner el estado correspondiente
 *   ("Pendiente" o "Pendiente 44 Dream") en las filas a procesar
 * - Columna B (Detalle Error): se completa automáticamente si hay errores
 * - Columna BB: se completa automáticamente con el tenant al finalizar OK
 * - Encabezados en fila 1, datos desde fila 2
 * - Todos los campos del vehículo deben estar completos
 */

// ======================== CONFIGURACIÓN GENERAL ========================

var CONFIG = {
  SHEET_NAME: 'Base de datos- Autos del pueblo',
  HEADER_ROW: 1,
  DATA_START_ROW: 2
};

// ======================== CONFIGURACIÓN POR PLANTILLA ========================

var TENANT_AUTOS_DEL_PUEBLO = {
  NOMBRE:           'Grupo CG',
  TEMPLATE_DOC_ID:  '1R7XjF-Ko-IsyoiVgdvhd85iqriEf40OVQw216e87zk4',
  PARENT_FOLDER_ID: '1f4PMF-9GpUIdQuNk8yCF3Wm3-3eYhw18',
  STATUS_FILTER:    'Pendiente',
  PREFIJO_DOC:      'Oferta de Locación',
  ETIQUETA_BB:      'GRUPO CG'
};

var TENANT_44_DREAM = {
  NOMBRE:           '44 Dream',
  TEMPLATE_DOC_ID:  '1PBJ3mZ0xBsz4B2ZuxIMVdanz4INBGMhiQ7ZClTZmrk4',
  PARENT_FOLDER_ID: '1epZywKt7Pmcj988L65-BW2rkDu7mvJay',
  STATUS_FILTER:    'Pendiente 44 Dream',
  PREFIJO_DOC:      'Oferta de Locación 44 Dream',
  ETIQUETA_BB:      '44 DREAMS'
};

// ======================== COLUMNAS (por letra) ========================

/**
 * Convierte letra de columna a índice 0-based.
 * A=0, B=1, ..., Z=25, AA=26, AB=27, ...
 */
function colIndex(letra) {
  letra = letra.toUpperCase();
  var idx = 0;
  for (var i = 0; i < letra.length; i++) {
    idx = idx * 26 + (letra.charCodeAt(i) - 64);
  }
  return idx - 1;
}

// Columnas de control
var COL_STATUS = 'A';  // Crear Oferta Locación
var COL_ERROR  = 'B';  // Detalle Error
var COL_TENANT = 'BB'; // Etiqueta de tenant (Grupo CG / 44 DREAMS)

// Campos obligatorios: [columnaLetra, nombreDescriptivo]
var CAMPOS_REQUERIDOS = [
  ['C',  'Patente'],
  ['D',  'Titular'],
  ['F',  'DNI'],
  ['G',  'Domicilio'],
  ['H',  'Correo electrónico'],
  ['I',  'Cuit'],
  ['L',  'Fecha de inicio de alquiler'],
  ['M',  'Canon'],
  ['N',  'MOTOR'],
  ['O',  'CHASIS'],
  ['P',  'Kilometraje'],
  ['Q',  'Marca'],
  ['R',  'Modelo'],
  ['S',  'Año'],
  ['U',  'Nafta'],
  ['Z',  'Vto VTV'],
  ['AY', 'Costo patente'],
  ['AV', 'Gravámenes']
];

// ======================== MAPEO DE VARIABLES ========================

var MAPA_VARIABLES = {
  // --- Datos del titular ---
  'OWNER':             { col: 'D',  formato: 'mayusculas'  },
  'DNI':               { col: 'F',  formato: 'mayusculas'  },
  'ADDRESS':           { col: 'G',  formato: 'original'    },
  'EMAIL':             { col: 'H',  formato: 'original'    },
  'CUIT':              { col: 'I',  formato: 'mayusculas'  },
  'SPOUSE':            { col: 'E',  formato: 'conyugue'    },

  // --- Datos del contrato ---
  'RENTAL START DATE': { col: 'L',  formato: 'mayusculas'  },
  'AMMOUNT':           { col: 'M',  formato: 'monto'       },
  'AMMOUNT IN WORDS':  { col: 'M',  formato: 'montoLetras' },
  'PLATE AMMOUNT':     { col: 'AY', formato: 'monto'       },

  // --- Datos del vehículo ---
  'PLATE':             { col: 'C',  formato: 'mayusculas'  },
  'MARKE':             { col: 'Q',  formato: 'mayusculas'  },
  'MODEL':             { col: 'R',  formato: 'mayusculas'  },
  'YEAR CAR':          { col: 'S',  formato: 'mayusculas'  },
  'ENGINE NUMBER':     { col: 'N',  formato: 'mayusculas'  },
  'CHASSIS NUMBER':    { col: 'O',  formato: 'mayusculas'  },
  'KM':                { col: 'P',  formato: 'mayusculas'  },
  'NAFTA':             { col: 'U',  formato: 'fraccion'    },
  'DATE VTV':          { col: 'Z',  formato: 'mayusculas'  },

  // --- Limpieza ---
  'INSIDE CLEAN':      { col: 'AK', formato: 'limpieza'    },
  'OUTSIDE CLEAN':     { col: 'AL', formato: 'limpieza'    },

  // --- Elementos de seguridad ---
  'CRIQUET':           { col: 'AC', formato: 'siNo'        },
  'BUTTERFLY':         { col: 'AD', formato: 'siNo'        },
  'SPARE TIRE':        { col: 'AF', formato: 'siNo'        },
  'BEACONS':           { col: 'AG', formato: 'siNo'        },
  'REFLECTIVE VEST':   { col: 'AH', formato: 'siNo'        },
  'GLOVES':            { col: 'AI', formato: 'siNo'        },
  'KIT':               { col: 'AJ', formato: 'siNo'        },
  'FIREWORKS':         { col: 'AB', formato: 'matafuego'   },

  // --- Gravámenes ---
  'TAXES':             { col: 'AV', formato: 'gravamenes'  },

  // --- Relevamiento de daños ---
  'FRONT BUMPER':      { col: 'AM', formato: 'danio'       },
  'REAR BUMPER':       { col: 'AN', formato: 'danio'       },
  'RIGHT SIDE':        { col: 'AO', formato: 'danio'       },
  'LEFT SIDE':         { col: 'AP', formato: 'danio'       },
  'HOOD':              { col: 'AQ', formato: 'danio'       },
  'INSIDE':            { col: 'AR', formato: 'danio'       },
  'OTHERS':            { col: 'AS', formato: 'danio'       }
};


// ======================== MENÚ ========================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Automatización')
    .addItem('Crear ofertas pendientes', 'crearOfertasPendientes')
    .addItem('Crear ofertas pendientes 44 Dream', 'crearOfertasPendientes44Dream')
    .addToUi();
}


// ======================== TRIGGERS DEL MENÚ ========================

function crearOfertasPendientes() {
  procesarOfertas(TENANT_AUTOS_DEL_PUEBLO);
}

function crearOfertasPendientes44Dream() {
  procesarOfertas(TENANT_44_DREAM);
}


// ======================== FUNCIÓN PRINCIPAL ========================

function procesarOfertas(tenant) {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    ui.alert('Error', 'No se encontró la pestaña: "' + CONFIG.SHEET_NAME + '"', ui.ButtonSet.OK);
    return;
  }

  var statusIdx = colIndex(COL_STATUS);
  var errorIdx  = colIndex(COL_ERROR);

  var lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) {
    ui.alert('Sin datos', 'No hay filas de datos para procesar.', ui.ButtonSet.OK);
    return;
  }

  var lastCol = sheet.getLastColumn();
  var dataRange = sheet.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, lastCol);
  var data = dataRange.getValues();

  // Verificar acceso a carpeta madre
  var parentFolder;
  try {
    parentFolder = DriveApp.getFolderById(tenant.PARENT_FOLDER_ID);
  } catch (e) {
    ui.alert('Error de permisos',
      'No se puede acceder a la carpeta madre de ' + tenant.NOMBRE + '.\n' + e.message,
      ui.ButtonSet.OK);
    return;
  }

  // Verificar acceso a la plantilla
  try {
    DriveApp.getFileById(tenant.TEMPLATE_DOC_ID);
  } catch (e) {
    ui.alert('Error de permisos',
      'No se puede acceder a la plantilla de ' + tenant.NOMBRE + '.\n' + e.message,
      ui.ButtonSet.OK);
    return;
  }

  // Contar pendientes con el estado correspondiente
  var pendientes = data.filter(function(row) {
    return String(row[statusIdx]).trim() === tenant.STATUS_FILTER;
  }).length;

  if (pendientes === 0) {
    ui.alert('Sin pendientes',
      'No hay filas con estado "' + tenant.STATUS_FILTER + '" para procesar.',
      ui.ButtonSet.OK);
    return;
  }

  // Procesar cada fila pendiente
  var procesados = 0;
  var errores = 0;

  ss.toast('Iniciando generación de ofertas ' + tenant.NOMBRE + '...', 'Automatización', 5);

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var status = String(row[statusIdx]).trim();

    if (status !== tenant.STATUS_FILTER) continue;

    var rowNum = CONFIG.DATA_START_ROW + i;

    try {
      // Validar campos requeridos
      var faltantes = validarCamposRequeridos(row);
      if (faltantes.length > 0) {
        actualizarEstado(sheet, rowNum, statusIdx, errorIdx, 'Error',
          'Faltan datos obligatorios: ' + faltantes.join(', '));
        errores++;
        continue;
      }

      // Construir mapa de reemplazos
      var reemplazos = construirMapaReemplazos(row);

      // Obtener nombre del cónyuge (columna E) para el bloque de firma
      var nombreConyugue = obtenerValorTexto(row[colIndex('E')]);

      // Datos para nombres de archivo y carpeta
      var patente   = obtenerValorTexto(row[colIndex('C')]).toUpperCase();
      var titular   = obtenerValorTexto(row[colIndex('D')]).toUpperCase();
      var nombreDoc = tenant.PREFIJO_DOC + ' - ' + titular + ' - ' + patente;

      ss.toast('Procesando: ' + patente + '...', 'Automatización', 3);

      // Crear subcarpeta (o reutilizar si existe)
      var subFolder = obtenerOCrearCarpeta(parentFolder, patente);

      // Crear Google Doc desde la plantilla
      var docFile = crearDocumentoDesdeTemplate(
        tenant.TEMPLATE_DOC_ID,
        reemplazos,
        nombreDoc,
        subFolder,
        nombreConyugue
      );

      // Exportar como PDF
      exportarComoPdf(docFile, subFolder, nombreDoc);

      // Marcar como completado
      actualizarEstado(sheet, rowNum, statusIdx, errorIdx, 'Completado', '');
      marcarTenantEnColumnaBB(sheet, rowNum, tenant);
      procesados++;

    } catch (e) {
      var mensajeError = e.message || String(e);

      if (mensajeError.indexOf('permission') !== -1 || mensajeError.indexOf('Access') !== -1) {
        mensajeError = 'Error de permisos: ' + mensajeError;
      } else if (mensajeError.indexOf('not found') !== -1) {
        mensajeError = 'Recurso no encontrado: ' + mensajeError;
      }

      actualizarEstado(sheet, rowNum, statusIdx, errorIdx, 'Error', mensajeError);
      errores++;
    }

    SpreadsheetApp.flush();
  }

  // Resumen final
  ui.alert(
    'Proceso finalizado (' + tenant.NOMBRE + ')',
    'Ofertas creadas: ' + procesados + '\nErrores: ' + errores,
    ui.ButtonSet.OK
  );
}


// ======================== VALIDACIÓN ========================

function validarCamposRequeridos(row) {
  var faltantes = [];

  CAMPOS_REQUERIDOS.forEach(function(campo) {
    var letra  = campo[0];
    var nombre = campo[1];
    var idx = colIndex(letra);
    var valor = obtenerValorTexto(row[idx]);

    if (!valor || valor === 'undefined' || valor === 'null') {
      faltantes.push(nombre + ' (col ' + letra + ')');
    }
  });

  return faltantes;
}


// ======================== MAPA DE REEMPLAZOS ========================

function construirMapaReemplazos(row) {
  var reemplazos = {};

  for (var variable in MAPA_VARIABLES) {
    var config = MAPA_VARIABLES[variable];
    var idx = colIndex(config.col);
    var valorCrudo = row[idx];
    var valor = obtenerValorTexto(valorCrudo);

    switch (config.formato) {

      case 'mayusculas':
        valor = valor.toUpperCase();
        break;

      case 'minusculas':
        valor = valor.toLowerCase();
        break;

      case 'original':
        break;

      case 'fraccion':
        if (valorCrudo instanceof Date) {
          var mes = valorCrudo.getMonth() + 1;
          var dia = valorCrudo.getDate();
          valor = dia + '/' + mes;
        } else if (typeof valorCrudo === 'number' && valorCrudo > 0 && valorCrudo < 1) {
          var fracciones = {0.25: '1/4', 0.5: '1/2', 0.75: '3/4', 1: 'Full'};
          valor = fracciones[valorCrudo] || String(valorCrudo);
        }
        break;

      case 'conyugue':
        if (valor && valor.length > 0) {
          valor = 'Se declara el cónyuge ' + valor.toUpperCase();
        } else {
          valor = 'No se declara cónyuge';
        }
        break;

      case 'monto':
        var numMonto = parsearMonto(valorCrudo);
        valor = '$' + formatearNumero(numMonto);
        break;

      case 'montoLetras':
        var numLetras = parsearMonto(valorCrudo);
        valor = numeroALetras(numLetras).toUpperCase();
        break;

      case 'siNo':
        var upper = valor.toUpperCase().trim();
        valor = (upper === 'SI' || upper === 'SÍ') ? 'Sí' : 'No';
        break;

      case 'limpieza':
        var upperL = valor.toUpperCase().trim();
        valor = (upperL === 'SI' || upperL === 'SÍ') ? 'OK' : 'observado';
        break;

      case 'matafuego':
        if (valor && valor.length > 0 && valor.toUpperCase() !== 'SIN GNC') {
          valor = 'Sí';
        } else {
          valor = 'No';
        }
        break;

      case 'danio':
        valor = valor
          .replace(/\r\n/g, ' ')
          .replace(/\n/g, ' ')
          .replace(/\r/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim()
          .replace(/\.$/, '');
        if (!valor || valor.length === 0) {
          valor = 'Sin detalles';
        }
        break;

      case 'gravamenes':
        if (valor.toUpperCase().trim() === 'LIBRE') {
          valor = 'Libre de prendas y embargos';
        } else {
          valor = 'Posee Prenda a favor de: ' + valor;
        }
        break;
    }

    reemplazos[variable] = valor || '';
  }

  return reemplazos;
}


// ======================== CREACIÓN DE DOCUMENTOS ========================

function crearDocumentoDesdeTemplate(templateId, reemplazos, nombreDoc, folder, nombreConyugue) {
  var templateFile = DriveApp.getFileById(templateId);
  var copiedFile = templateFile.makeCopy(nombreDoc, folder);

  var doc = DocumentApp.openById(copiedFile.getId());
  var body = doc.getBody();

  // 1) Procesar bloque {{SPOUSE SIGN}} ANTES de los reemplazos de texto plano
  procesarBloqueConyugue(body, nombreConyugue);

  // 2) Reemplazar cada variable en el cuerpo del documento
  for (var variable in reemplazos) {
    var patron = '\\{\\{' + escapeRegex(variable) + '\\}\\}';
    body.replaceText(patron, reemplazos[variable]);
  }

  // 3) Reemplazar también en headers y footers
  var headerSection = doc.getHeader();
  var footerSection = doc.getFooter();

  if (headerSection) {
    for (var v in reemplazos) {
      headerSection.replaceText('\\{\\{' + escapeRegex(v) + '\\}\\}', reemplazos[v]);
    }
  }

  if (footerSection) {
    for (var v2 in reemplazos) {
      footerSection.replaceText('\\{\\{' + escapeRegex(v2) + '\\}\\}', reemplazos[v2]);
    }
  }

  doc.saveAndClose();
  return copiedFile;
}


// ======================== BLOQUE FIRMA CÓNYUGE ========================

function procesarBloqueConyugue(body, nombreConyugue) {
  var searchResult = body.findText('\\{\\{SPOUSE SIGN\\}\\}');
  if (!searchResult) return;

  var element = searchResult.getElement();
  var paragraph = element.getParent();
  var paragraphIndex = body.getChildIndex(paragraph);

  body.removeChild(paragraph);

  if (!nombreConyugue || nombreConyugue.trim().length === 0) return;

  var nombre = nombreConyugue.toUpperCase();
  var idx = paragraphIndex;

  var pTitulo = body.insertParagraph(idx++, '');
  pTitulo.appendText('POR EL CÓNYUGE (CÓNYUGE):').setBold(true);

  body.insertParagraph(idx++, '');

  var pFirma = body.insertParagraph(idx++, '');
  pFirma.appendText('Firma: ________________________').setBold(false);

  body.insertParagraph(idx++, '');

  var pAclaracion = body.insertParagraph(idx++, '');
  pAclaracion.appendText('Aclaración: ').setBold(false);
  pAclaracion.appendText(nombre).setBold(true);

  body.insertParagraph(idx++, '');

  var pDni = body.insertParagraph(idx++, '');
  pDni.appendText('DNI: ________________________').setBold(false);
}


// ======================== EXPORTAR PDF ========================

function exportarComoPdf(docFile, folder, nombrePdf) {
  var url = 'https://docs.google.com/document/d/' + docFile.getId() + '/export?format=pdf';

  var response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('Error al exportar PDF (HTTP ' + response.getResponseCode() + ')');
  }

  var pdfBlob = response.getBlob().setName(nombrePdf + '.pdf');
  folder.createFile(pdfBlob);
}


// ======================== UTILIDADES DRIVE ========================

function obtenerOCrearCarpeta(parentFolder, nombre) {
  var folders = parentFolder.getFoldersByName(nombre);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parentFolder.createFolder(nombre);
}


// ======================== ACTUALIZACIÓN DE ESTADO ========================

function actualizarEstado(sheet, rowNum, statusIdx, errorIdx, estado, detalle) {
  sheet.getRange(rowNum, statusIdx + 1).setValue(estado);
  sheet.getRange(rowNum, errorIdx + 1).setValue(detalle);
}


// ======================== MARCAR TENANT EN COLUMNA BB ========================

function marcarTenantEnColumnaBB(sheet, rowNum, tenant) {
  if (!tenant.ETIQUETA_BB) return;
  sheet.getRange(rowNum, colIndex(COL_TENANT) + 1).setValue(tenant.ETIQUETA_BB);
}


// ======================== UTILIDADES DE FORMATO ========================

function obtenerValorTexto(valor) {
  if (valor === null || valor === undefined) return '';

  if (valor instanceof Date) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }

  if (typeof valor === 'number') {
    if (Number.isInteger(valor) && valor >= 1900 && valor <= 2100) {
      return String(valor);
    }
    return String(valor);
  }

  return String(valor).trim();
}

function parsearMonto(valor) {
  if (typeof valor === 'number') return Math.round(valor);
  if (!valor) return 0;

  var clean = String(valor).replace(/[\$\s]/g, '').trim();

  if (clean.match(/,\d{2}$/)) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.match(/\.\d{2}$/)) {
    clean = clean.replace(/,/g, '');
  } else {
    clean = clean.replace(/[.,]/g, '');
  }

  return Math.round(parseFloat(clean) || 0);
}

function formatearNumero(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// ======================== NÚMERO A LETRAS (ESPAÑOL) ========================

function numeroALetras(numero) {
  if (numero === 0) return 'cero';
  if (numero < 0) return 'menos ' + numeroALetras(-numero);

  var unidades   = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  var especiales = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince'];
  var decenas    = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta',
                    'sesenta', 'setenta', 'ochenta', 'noventa'];
  var centenas   = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos',
                    'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  function convertirGrupo(n) {
    if (n === 0) return '';
    if (n === 100) return 'cien';

    var resultado = '';

    if (n >= 100) {
      resultado += centenas[Math.floor(n / 100)] + ' ';
      n = n % 100;
    }

    if (n >= 1 && n <= 9) {
      resultado += unidades[n];
    } else if (n >= 10 && n <= 15) {
      resultado += especiales[n - 10];
    } else if (n >= 16 && n <= 19) {
      resultado += 'dieci' + unidades[n - 10];
    } else if (n === 20) {
      resultado += 'veinte';
    } else if (n >= 21 && n <= 29) {
      resultado += 'veinti' + unidades[n - 20];
    } else if (n >= 30) {
      resultado += decenas[Math.floor(n / 10)];
      if (n % 10 !== 0) {
        resultado += ' y ' + unidades[n % 10];
      }
    }

    return resultado.trim();
  }

  var resultado = '';

  if (numero >= 1000000) {
    var millones = Math.floor(numero / 1000000);
    if (millones === 1) {
      resultado += 'un millón ';
    } else {
      resultado += convertirGrupo(millones) + ' millones ';
    }
    numero = numero % 1000000;
  }

  if (numero >= 1000) {
    var miles = Math.floor(numero / 1000);
    if (miles === 1) {
      resultado += 'mil ';
    } else {
      resultado += convertirGrupo(miles) + ' mil ';
    }
    numero = numero % 1000;
  }

  if (numero > 0) {
    resultado += convertirGrupo(numero);
  }

  return resultado.trim();
}