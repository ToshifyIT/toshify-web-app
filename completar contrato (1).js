{\rtf1\ansi\ansicpg1252\cocoartf2868
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fnil\fcharset0 Menlo-Regular;}
{\colortbl;\red255\green255\blue255;\red20\green67\blue174;\red246\green247\blue249;\red46\green49\blue51;
\red0\green0\blue0;\red186\green6\blue115;\red162\green0\blue16;\red77\green80\blue85;\red18\green115\blue126;
\red97\green3\blue173;}
{\*\expandedcolortbl;;\cssrgb\c9412\c35294\c73725;\cssrgb\c97255\c97647\c98039;\cssrgb\c23529\c25098\c26275;
\cssrgb\c0\c0\c0;\cssrgb\c78824\c15294\c52549;\cssrgb\c70196\c7843\c7059;\cssrgb\c37255\c38824\c40784;\cssrgb\c3529\c52157\c56863;
\cssrgb\c46275\c15294\c73333;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\deftab720
\pard\pardeftab720\partightenfactor0

\f0\fs26 \cf2 \cb3 \expnd0\expndtw0\kerning0
\outl0\strokewidth0 \strokec2 function\cf4 \strokec4  \strokec5 onOpen\strokec4 () \{\cb1 \
\pard\pardeftab720\partightenfactor0
\cf4 \cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 ui\strokec4  = \cf6 \strokec6 SpreadsheetApp\cf4 \strokec4 .\strokec5 getUi\strokec4 ();\cb1 \
\cb3   \strokec5 ui\strokec4 .\strokec5 createMenu\strokec4 (\cf7 \strokec7 'Automatizacion'\cf4 \strokec4 )\cb1 \
\cb3     .\strokec5 addItem\strokec4 (\cf7 \strokec7 'Actualizar y Generar PDF - BSAS'\cf4 \strokec4 , \cf7 \strokec7 'actualizarDocumentosPendientes'\cf4 \strokec4 )\cb1 \
\cb3     .\strokec5 addItem\strokec4 (\cf7 \strokec7 'Actualizar Contratos Pedidos Ya'\cf4 \strokec4 , \cf7 \strokec7 'actualizarContratosPendientes'\cf4 \strokec4 )\cb1 \
\cb3     .\strokec5 addItem\strokec4 (\cf7 \strokec7 'Actualizar y Generar PDF - BRC'\cf4 \strokec4 , \cf7 \strokec7 'actualizarContratosBariloche'\cf4 \strokec4 )\cb1 \
\cb3     .\strokec5 addToUi\strokec4 ();\cb1 \
\cb3 \}\cb1 \
\
\pard\pardeftab720\partightenfactor0
\cf8 \cb3 \strokec8 // =====================================================\cf4 \cb1 \strokec4 \
\cf8 \cb3 \strokec8 // CONFIGURACI\'d3N DE COLUMNAS (0-based)\cf4 \cb1 \strokec4 \
\cf8 \cb3 \strokec8 // =====================================================\cf4 \cb1 \strokec4 \
\cf8 \cb3 \strokec8 // B(1)=Nombre, D(3)=KM, E(4)=LTNAFTA, F(5)=OBSERVATIONS\cf4 \cb1 \strokec4 \
\cf8 \cb3 \strokec8 // G(6)=Cristales, H(7)=Carter, I(8)=Neum\'e1ticos\cf4 \cb1 \strokec4 \
\cf8 \cb3 \strokec8 // J(9)=Otros Docs, K(10)=Otros Accesorios\cf4 \cb1 \strokec4 \
\cf8 \cb3 \strokec8 // L(11)=Marca Cadenas, M(12)=Estado Cadenas, N(13)=Tensores Cadenas\cf4 \cb1 \strokec4 \
\cf8 \cb3 \strokec8 // O(14)=Kit Otros, P(15)=Estado, Q(16)=Detalle\cf4 \cb1 \strokec4 \
\
\pard\pardeftab720\partightenfactor0
\cf2 \cb3 \strokec2 const\cf4 \strokec4  \cf6 \strokec6 COL\cf4 \strokec4  = \{\cb1 \
\pard\pardeftab720\partightenfactor0
\cf4 \cb3   \cf6 \strokec6 NOMBRE\cf4 \strokec4 : \cf9 \strokec9 1\cf4 \strokec4 ,\cb1 \
\cb3   \cf6 \strokec6 KM\cf4 \strokec4 : \cf9 \strokec9 3\cf4 \strokec4 ,\cb1 \
\cb3   \cf6 \strokec6 LTNAFTA\cf4 \strokec4 : \cf9 \strokec9 4\cf4 \strokec4 ,\cb1 \
\cb3   \cf6 \strokec6 OBSERVATIONS\cf4 \strokec4 : \cf9 \strokec9 5\cf4 \strokec4 ,\cb1 \
\cb3   \cf6 \strokec6 CRISTAL_STATUS\cf4 \strokec4 : \cf9 \strokec9 7\cf4 \strokec4 ,\cb1 \
\cb3   \cf6 \strokec6 CARTER\cf4 \strokec4 : \cf9 \strokec9 8\cf4 \strokec4 ,\cb1 \
\cb3   \cf6 \strokec6 TIRES\cf4 \strokec4 : \cf9 \strokec9 9\cf4 \strokec4 ,\cb1 \
\cb3   \cf6 \strokec6 OTHERS_DOCS\cf4 \strokec4 : \cf9 \strokec9 10\cf4 \strokec4 ,\cb1 \
\cb3   \cf6 \strokec6 OTHER_ACCESORY\cf4 \strokec4 : \cf9 \strokec9 11\cf4 \strokec4 ,\cb1 \
\cb3   \cf6 \strokec6 MAKE_CHAINS\cf4 \strokec4 : \cf9 \strokec9 12\cf4 \strokec4 ,\cb1 \
\cb3   \cf6 \strokec6 STATUS_CHAINS\cf4 \strokec4 : \cf9 \strokec9 13\cf4 \strokec4 ,\cb1 \
\cb3   \cf6 \strokec6 TENSIONERS_CHAINS\cf4 \strokec4 : \cf9 \strokec9 14\cf4 \strokec4 ,\cb1 \
\cb3   \cf6 \strokec6 OTHERS_KIT\cf4 \strokec4 : \cf9 \strokec9 15\cf4 \strokec4 ,\cb1 \
\cb3   \cf6 \strokec6 ESTADO\cf4 \strokec4 : \cf9 \strokec9 6\cf4 \strokec4 ,       \cf8 \strokec8 // Columna P\cf4 \cb1 \strokec4 \
\cb3   \cf6 \strokec6 DETALLE\cf4 \strokec4 : \cf9 \strokec9 16\cf4 \strokec4         \cf8 \strokec8 // Columna Q\cf4 \cb1 \strokec4 \
\cb3 \};\cb1 \
\
\pard\pardeftab720\partightenfactor0
\cf8 \cb3 \strokec8 // 1-based para escritura con getRange(fila, col)\cf4 \cb1 \strokec4 \
\pard\pardeftab720\partightenfactor0
\cf2 \cb3 \strokec2 const\cf4 \strokec4  \cf6 \strokec6 COL_ESTADO_1B\cf4 \strokec4  = \cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 ESTADO\cf4 \strokec4  + \cf9 \strokec9 1\cf4 \strokec4 ;   \cf8 \strokec8 // 16\cf4 \cb1 \strokec4 \
\cf2 \cb3 \strokec2 const\cf4 \strokec4  \cf6 \strokec6 COL_DETALLE_1B\cf4 \strokec4  = \cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 DETALLE\cf4 \strokec4  + \cf9 \strokec9 1\cf4 \strokec4 ; \cf8 \strokec8 // 17\cf4 \cb1 \strokec4 \
\
\pard\pardeftab720\partightenfactor0
\cf8 \cb3 \strokec8 // =====================================================\cf4 \cb1 \strokec4 \
\cf8 \cb3 \strokec8 // FUNCIONES PRINCIPALES\cf4 \cb1 \strokec4 \
\cf8 \cb3 \strokec8 // =====================================================\cf4 \cb1 \strokec4 \
\
\pard\pardeftab720\partightenfactor0
\cf2 \cb3 \strokec2 function\cf4 \strokec4  \strokec5 actualizarDocumentosPendientes\strokec4 () \{\cb1 \
\pard\pardeftab720\partightenfactor0
\cf4 \cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 sheetId\strokec4  = \cf7 \strokec7 '1CtXo2rSGAkdIcFZ0HD7RxaY4QyQOzc8t6i60gbH0FDU'\cf4 \strokec4 ;\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 sheetName\strokec4  = \cf7 \strokec7 'Datos'\cf4 \strokec4 ;\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 folderId\strokec4  = \cf7 \strokec7 '1qQCnLb5OB1RioLcZOK8s5nKqaIhA7Kt7'\cf4 \strokec4 ;\cb1 \
\cb3   \cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 ss\strokec4  = \cf6 \strokec6 SpreadsheetApp\cf4 \strokec4 .\strokec5 openById\strokec4 (\strokec5 sheetId\strokec4 );\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 sheet\strokec4  = \strokec5 ss\strokec4 .\strokec5 getSheetByName\strokec4 (\strokec5 sheetName\strokec4 );\cb1 \
\cb3   \cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 range\strokec4  = \strokec5 sheet\strokec4 .\strokec5 getDataRange\strokec4 ();\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 data\strokec4  = \strokec5 range\strokec4 .\strokec5 getDisplayValues\strokec4 ();\cb1 \
\
\cb3   \cf2 \strokec2 for\cf4 \strokec4  (\cf2 \strokec2 let\cf4 \strokec4  \strokec5 i\strokec4  = \cf9 \strokec9 1\cf4 \strokec4 ; \strokec5 i\strokec4  < \strokec5 data\strokec4 .\strokec5 length\strokec4 ; \strokec5 i\strokec4 ++) \{\cb1 \
\cb3     \cf2 \strokec2 const\cf4 \strokec4  \strokec5 fila\strokec4  = \strokec5 i\strokec4  + \cf9 \strokec9 1\cf4 \strokec4 ;\cb1 \
\cb3     \cb1 \
\cb3     \cf2 \strokec2 try\cf4 \strokec4  \{\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 estado\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 ESTADO\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 ();\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (\strokec5 estado\strokec4  !== \cf7 \strokec7 'Pendiente'\cf4 \strokec4 ) \cf2 \strokec2 continue\cf4 \strokec4 ;\cb1 \
\
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 nombre\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 NOMBRE\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 ();\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 km\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 KM\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 ();\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 ltNafta\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 LTNAFTA\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 ();\cb1 \
\cb3       \cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 erroresValidacion\strokec4  = [];\cb1 \
\cb3       \cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 nombre\strokec4 ) \strokec5 erroresValidacion\strokec4 .\strokec5 push\strokec4 (\cf7 \strokec7 'Falta nombre en columna B'\cf4 \strokec4 );\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 km\strokec4 ) \strokec5 erroresValidacion\strokec4 .\strokec5 push\strokec4 (\cf7 \strokec7 'Falta KM en columna D'\cf4 \strokec4 );\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 ltNafta\strokec4 ) \strokec5 erroresValidacion\strokec4 .\strokec5 push\strokec4 (\cf7 \strokec7 'Falta LT NAFTA en columna E'\cf4 \strokec4 );\cb1 \
\cb3       \cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (\strokec5 erroresValidacion\strokec4 .\strokec5 length\strokec4  > \cf9 \strokec9 0\cf4 \strokec4 ) \{\cb1 \
\cb3         \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_ESTADO_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'Error'\cf4 \strokec4 );\cb1 \
\cb3         \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_DETALLE_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'Datos faltantes: '\cf4 \strokec4  + \strokec5 erroresValidacion\strokec4 .\strokec5 join\strokec4 (\cf7 \strokec7 ', '\cf4 \strokec4 ));\cb1 \
\cb3         \cf2 \strokec2 continue\cf4 \strokec4 ;\cb1 \
\cb3       \}\cb1 \
\
\cb3       \cf2 \strokec2 let\cf4 \strokec4  \strokec5 observacionesRaw\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 OBSERVATIONS\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 ();\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 observacionesRaw\strokec4 ) \{\cb1 \
\cb3         \strokec5 observacionesRaw\strokec4  = \cf7 \strokec7 'Sin observaciones'\cf4 \strokec4 ;\cb1 \
\cb3         \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 OBSERVATIONS\cf4 \strokec4  + \cf9 \strokec9 1\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\strokec5 observacionesRaw\strokec4 );\cb1 \
\cb3       \}\cb1 \
\
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 observaciones\strokec4  = \strokec5 observacionesRaw\strokec4 .\strokec5 charAt\strokec4 (\cf9 \strokec9 0\cf4 \strokec4 ).\strokec5 toUpperCase\strokec4 () + \strokec5 observacionesRaw\strokec4 .\strokec5 slice\strokec4 (\cf9 \strokec9 1\cf4 \strokec4 ).\strokec5 replace\strokec4 (\cf10 \strokec10 /\\.*$/\cf4 \strokec4 , \cf7 \strokec7 ''\cf4 \strokec4 ) + \cf7 \strokec7 '.'\cf4 \strokec4 ;\cb1 \
\
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 resultado\strokec4  = \strokec5 encontrarDocumentoEnCarpeta\strokec4 (\strokec5 nombre\strokec4 , \strokec5 folderId\strokec4 );\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 resultado\strokec4 ) \{\cb1 \
\cb3         \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_ESTADO_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'Error'\cf4 \strokec4 );\cb1 \
\cb3         \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_DETALLE_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'No se encontro carpeta con el nombre: '\cf4 \strokec4  + \strokec5 nombre\strokec4 );\cb1 \
\cb3         \cf2 \strokec2 continue\cf4 \strokec4 ;\cb1 \
\cb3       \}\cb1 \
\
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 archivo\strokec4  = \strokec5 resultado\strokec4 .\strokec5 archivo\strokec4 ;\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 carpeta\strokec4  = \strokec5 resultado\strokec4 .\strokec5 carpeta\strokec4 ;\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 doc\strokec4  = \cf6 \strokec6 DocumentApp\cf4 \strokec4 .\strokec5 openById\strokec4 (\strokec5 archivo\strokec4 .\strokec5 getId\strokec4 ());\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 body\strokec4  = \strokec5 doc\strokec4 .\strokec5 getBody\strokec4 ();\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 texto\strokec4  = \strokec5 body\strokec4 .\strokec5 getText\strokec4 ();\cb1 \
\
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 variablesFaltantes\strokec4  = [];\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 texto\strokec4 .\strokec5 match\strokec4 (\cf10 \strokec10 /\\\{\\\{KM\\\}\\\}/\cf2 \strokec2 i\cf4 \strokec4 )) \strokec5 variablesFaltantes\strokec4 .\strokec5 push\strokec4 (\cf7 \strokec7 '\{\{KM\}\}'\cf4 \strokec4 );\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 texto\strokec4 .\strokec5 match\strokec4 (\cf10 \strokec10 /\\\{\\\{LTNAFTA\\\}\\\}/\cf2 \strokec2 i\cf4 \strokec4 )) \strokec5 variablesFaltantes\strokec4 .\strokec5 push\strokec4 (\cf7 \strokec7 '\{\{LTNAFTA\}\}'\cf4 \strokec4 );\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 texto\strokec4 .\strokec5 match\strokec4 (\cf10 \strokec10 /\\\{\\\{OBSERVATIONS\\\}\\\}/\cf2 \strokec2 i\cf4 \strokec4 )) \strokec5 variablesFaltantes\strokec4 .\strokec5 push\strokec4 (\cf7 \strokec7 '\{\{OBSERVATIONS\}\}'\cf4 \strokec4 );\cb1 \
\
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (\strokec5 variablesFaltantes\strokec4 .\strokec5 length\strokec4  > \cf9 \strokec9 0\cf4 \strokec4 ) \{\cb1 \
\cb3         \cf2 \strokec2 throw\cf4 \strokec4  \cf2 \strokec2 new\cf4 \strokec4  \cf6 \strokec6 Error\cf4 \strokec4 (\cf7 \strokec7 'Variables no encontradas en documento: '\cf4 \strokec4  + \strokec5 variablesFaltantes\strokec4 .\strokec5 join\strokec4 (\cf7 \strokec7 ', '\cf4 \strokec4 ));\cb1 \
\cb3       \}\cb1 \
\
\cb3       \strokec5 reemplazarVariableRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{KM\}\}'\cf4 \strokec4 , \cf6 \strokec6 Number\cf4 \strokec4 (\strokec5 km\strokec4 ).\strokec5 toLocaleString\strokec4 () + \cf7 \strokec7 ' km'\cf4 \strokec4 );\cb1 \
\cb3       \strokec5 reemplazarVariableRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{LTNAFTA\}\}'\cf4 \strokec4 , \strokec5 ltNafta\strokec4 );\cb1 \
\cb3       \strokec5 reemplazarObservacionesRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{OBSERVATIONS\}\}'\cf4 \strokec4 , \strokec5 observaciones\strokec4 );\cb1 \
\cb3       \cb1 \
\cb3       \strokec5 doc\strokec4 .\strokec5 saveAndClose\strokec4 ();\cb1 \
\
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 nombrePDF\strokec4  = \strokec5 archivo\strokec4 .\strokec5 getName\strokec4 () + \cf7 \strokec7 ' - Actualizado'\cf4 \strokec4 ;\cb1 \
\cb3       \strokec5 exportarComoPDF\strokec4 (\strokec5 archivo\strokec4 .\strokec5 getId\strokec4 (), \strokec5 carpeta\strokec4 , \strokec5 nombrePDF\strokec4 );\cb1 \
\
\cb3       \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_ESTADO_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'Actualizado'\cf4 \strokec4 );\cb1 \
\cb3       \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_DETALLE_1B\cf4 \strokec4 ).\strokec5 clearContent\strokec4 ();\cb1 \
\
\cb3     \} \cf2 \strokec2 catch\cf4 \strokec4  (\strokec5 e\strokec4 ) \{\cb1 \
\cb3       \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_ESTADO_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'Error'\cf4 \strokec4 );\cb1 \
\cb3       \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_DETALLE_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\strokec5 e\strokec4 .\strokec5 message\strokec4 );\cb1 \
\cb3     \}\cb1 \
\cb3   \}\cb1 \
\cb3 \}\cb1 \
\
\pard\pardeftab720\partightenfactor0
\cf2 \cb3 \strokec2 function\cf4 \strokec4  \strokec5 actualizarContratosPendientes\strokec4 () \{\cb1 \
\pard\pardeftab720\partightenfactor0
\cf4 \cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 sheetId\strokec4  = \cf7 \strokec7 '1CtXo2rSGAkdIcFZ0HD7RxaY4QyQOzc8t6i60gbH0FDU'\cf4 \strokec4 ;\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 sheetName\strokec4  = \cf7 \strokec7 'Datos'\cf4 \strokec4 ;\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 folderId\strokec4  = \cf7 \strokec7 '1UkINzRmBvmwEVZRtoa61V4EtNl3dRNRY'\cf4 \strokec4 ;\cb1 \
\cb3   \cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 ss\strokec4  = \cf6 \strokec6 SpreadsheetApp\cf4 \strokec4 .\strokec5 openById\strokec4 (\strokec5 sheetId\strokec4 );\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 sheet\strokec4  = \strokec5 ss\strokec4 .\strokec5 getSheetByName\strokec4 (\strokec5 sheetName\strokec4 );\cb1 \
\cb3   \cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 range\strokec4  = \strokec5 sheet\strokec4 .\strokec5 getDataRange\strokec4 ();\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 data\strokec4  = \strokec5 range\strokec4 .\strokec5 getDisplayValues\strokec4 ();\cb1 \
\
\cb3   \cf2 \strokec2 for\cf4 \strokec4  (\cf2 \strokec2 let\cf4 \strokec4  \strokec5 i\strokec4  = \cf9 \strokec9 1\cf4 \strokec4 ; \strokec5 i\strokec4  < \strokec5 data\strokec4 .\strokec5 length\strokec4 ; \strokec5 i\strokec4 ++) \{\cb1 \
\cb3     \cf2 \strokec2 const\cf4 \strokec4  \strokec5 fila\strokec4  = \strokec5 i\strokec4  + \cf9 \strokec9 1\cf4 \strokec4 ;\cb1 \
\cb3     \cb1 \
\cb3     \cf2 \strokec2 try\cf4 \strokec4  \{\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 estado\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 ESTADO\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 ();\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (\strokec5 estado\strokec4  !== \cf7 \strokec7 'Pendiente PedidosYa'\cf4 \strokec4 ) \cf2 \strokec2 continue\cf4 \strokec4 ;\cb1 \
\
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 nombre\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 NOMBRE\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 ();\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 km\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 KM\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 ();\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 ltNafta\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 LTNAFTA\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 ();\cb1 \
\cb3       \cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 erroresValidacion\strokec4  = [];\cb1 \
\cb3       \cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 nombre\strokec4 ) \strokec5 erroresValidacion\strokec4 .\strokec5 push\strokec4 (\cf7 \strokec7 'Falta nombre en columna B'\cf4 \strokec4 );\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 km\strokec4 ) \strokec5 erroresValidacion\strokec4 .\strokec5 push\strokec4 (\cf7 \strokec7 'Falta KM en columna D'\cf4 \strokec4 );\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 ltNafta\strokec4 ) \strokec5 erroresValidacion\strokec4 .\strokec5 push\strokec4 (\cf7 \strokec7 'Falta LT NAFTA en columna E'\cf4 \strokec4 );\cb1 \
\cb3       \cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (\strokec5 erroresValidacion\strokec4 .\strokec5 length\strokec4  > \cf9 \strokec9 0\cf4 \strokec4 ) \{\cb1 \
\cb3         \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_ESTADO_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'Error'\cf4 \strokec4 );\cb1 \
\cb3         \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_DETALLE_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'Datos faltantes: '\cf4 \strokec4  + \strokec5 erroresValidacion\strokec4 .\strokec5 join\strokec4 (\cf7 \strokec7 ', '\cf4 \strokec4 ));\cb1 \
\cb3         \cf2 \strokec2 continue\cf4 \strokec4 ;\cb1 \
\cb3       \}\cb1 \
\
\cb3       \cf2 \strokec2 let\cf4 \strokec4  \strokec5 observacionesRaw\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 OBSERVATIONS\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 ();\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 observacionesRaw\strokec4 ) \{\cb1 \
\cb3         \strokec5 observacionesRaw\strokec4  = \cf7 \strokec7 'Sin observaciones'\cf4 \strokec4 ;\cb1 \
\cb3         \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 OBSERVATIONS\cf4 \strokec4  + \cf9 \strokec9 1\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\strokec5 observacionesRaw\strokec4 );\cb1 \
\cb3       \}\cb1 \
\
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 observaciones\strokec4  = \strokec5 observacionesRaw\strokec4 .\strokec5 charAt\strokec4 (\cf9 \strokec9 0\cf4 \strokec4 ).\strokec5 toUpperCase\strokec4 () + \strokec5 observacionesRaw\strokec4 .\strokec5 slice\strokec4 (\cf9 \strokec9 1\cf4 \strokec4 ).\strokec5 replace\strokec4 (\cf10 \strokec10 /\\.*$/\cf4 \strokec4 , \cf7 \strokec7 ''\cf4 \strokec4 ) + \cf7 \strokec7 '.'\cf4 \strokec4 ;\cb1 \
\
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 archivo\strokec4  = \strokec5 encontrarContratoEnCarpeta\strokec4 (\strokec5 nombre\strokec4 , \strokec5 folderId\strokec4 );\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 archivo\strokec4 ) \{\cb1 \
\cb3         \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_ESTADO_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'Error'\cf4 \strokec4 );\cb1 \
\cb3         \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_DETALLE_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'No se encontro contrato para: '\cf4 \strokec4  + \strokec5 nombre\strokec4 );\cb1 \
\cb3         \cf2 \strokec2 continue\cf4 \strokec4 ;\cb1 \
\cb3       \}\cb1 \
\
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 doc\strokec4  = \cf6 \strokec6 DocumentApp\cf4 \strokec4 .\strokec5 openById\strokec4 (\strokec5 archivo\strokec4 .\strokec5 getId\strokec4 ());\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 body\strokec4  = \strokec5 doc\strokec4 .\strokec5 getBody\strokec4 ();\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 texto\strokec4  = \strokec5 body\strokec4 .\strokec5 getText\strokec4 ();\cb1 \
\
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 variablesFaltantes\strokec4  = [];\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 texto\strokec4 .\strokec5 match\strokec4 (\cf10 \strokec10 /\\\{\\\{KM\\\}\\\}/\cf2 \strokec2 i\cf4 \strokec4 )) \strokec5 variablesFaltantes\strokec4 .\strokec5 push\strokec4 (\cf7 \strokec7 '\{\{KM\}\}'\cf4 \strokec4 );\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 texto\strokec4 .\strokec5 match\strokec4 (\cf10 \strokec10 /\\\{\\\{LTNAFTA\\\}\\\}/\cf2 \strokec2 i\cf4 \strokec4 )) \strokec5 variablesFaltantes\strokec4 .\strokec5 push\strokec4 (\cf7 \strokec7 '\{\{LTNAFTA\}\}'\cf4 \strokec4 );\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 texto\strokec4 .\strokec5 match\strokec4 (\cf10 \strokec10 /\\\{\\\{OBSERVATIONS\\\}\\\}/\cf2 \strokec2 i\cf4 \strokec4 )) \strokec5 variablesFaltantes\strokec4 .\strokec5 push\strokec4 (\cf7 \strokec7 '\{\{OBSERVATIONS\}\}'\cf4 \strokec4 );\cb1 \
\
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (\strokec5 variablesFaltantes\strokec4 .\strokec5 length\strokec4  > \cf9 \strokec9 0\cf4 \strokec4 ) \{\cb1 \
\cb3         \cf2 \strokec2 throw\cf4 \strokec4  \cf2 \strokec2 new\cf4 \strokec4  \cf6 \strokec6 Error\cf4 \strokec4 (\cf7 \strokec7 'Variables no encontradas en documento: '\cf4 \strokec4  + \strokec5 variablesFaltantes\strokec4 .\strokec5 join\strokec4 (\cf7 \strokec7 ', '\cf4 \strokec4 ));\cb1 \
\cb3       \}\cb1 \
\
\cb3       \strokec5 reemplazarVariableRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{KM\}\}'\cf4 \strokec4 , \cf6 \strokec6 Number\cf4 \strokec4 (\strokec5 km\strokec4 ).\strokec5 toLocaleString\strokec4 () + \cf7 \strokec7 ' km'\cf4 \strokec4 );\cb1 \
\cb3       \strokec5 reemplazarVariableRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{LTNAFTA\}\}'\cf4 \strokec4 , \strokec5 ltNafta\strokec4 );\cb1 \
\cb3       \strokec5 reemplazarObservacionesRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{OBSERVATIONS\}\}'\cf4 \strokec4 , \strokec5 observaciones\strokec4 );\cb1 \
\cb3       \cb1 \
\cb3       \strokec5 doc\strokec4 .\strokec5 saveAndClose\strokec4 ();\cb1 \
\
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 nombrePDF\strokec4  = \cf7 \strokec7 'Carta Oferta - Pedidos Ya - '\cf4 \strokec4  + \strokec5 nombre\strokec4  + \cf7 \strokec7 ' - Actualizado'\cf4 \strokec4 ;\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 carpeta\strokec4  = \cf6 \strokec6 DriveApp\cf4 \strokec4 .\strokec5 getFolderById\strokec4 (\strokec5 folderId\strokec4 );\cb1 \
\cb3       \strokec5 exportarComoPDF\strokec4 (\strokec5 archivo\strokec4 .\strokec5 getId\strokec4 (), \strokec5 carpeta\strokec4 , \strokec5 nombrePDF\strokec4 );\cb1 \
\
\cb3       \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_ESTADO_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'Actualizado'\cf4 \strokec4 );\cb1 \
\cb3       \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_DETALLE_1B\cf4 \strokec4 ).\strokec5 clearContent\strokec4 ();\cb1 \
\
\cb3     \} \cf2 \strokec2 catch\cf4 \strokec4  (\strokec5 e\strokec4 ) \{\cb1 \
\cb3       \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_ESTADO_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'Error'\cf4 \strokec4 );\cb1 \
\cb3       \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_DETALLE_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\strokec5 e\strokec4 .\strokec5 message\strokec4 );\cb1 \
\cb3     \}\cb1 \
\cb3   \}\cb1 \
\cb3 \}\cb1 \
\
\pard\pardeftab720\partightenfactor0
\cf8 \cb3 \strokec8 // =====================================================\cf4 \cb1 \strokec4 \
\cf8 \cb3 \strokec8 // NUEVA FUNCI\'d3N: ACTUALIZAR CONTRATOS BARILOCHE\cf4 \cb1 \strokec4 \
\cf8 \cb3 \strokec8 // =====================================================\cf4 \cb1 \strokec4 \
\
\pard\pardeftab720\partightenfactor0
\cf2 \cb3 \strokec2 function\cf4 \strokec4  \strokec5 actualizarContratosBariloche\strokec4 () \{\cb1 \
\pard\pardeftab720\partightenfactor0
\cf4 \cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 sheetId\strokec4  = \cf7 \strokec7 '1CtXo2rSGAkdIcFZ0HD7RxaY4QyQOzc8t6i60gbH0FDU'\cf4 \strokec4 ;\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 sheetName\strokec4  = \cf7 \strokec7 'Datos'\cf4 \strokec4 ;\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 folderId\strokec4  = \cf7 \strokec7 '1RZfsv-xU_zJSBX26Vwj3-0hHuI9qV1M4'\cf4 \strokec4 ;\cb1 \
\cb3   \cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 ss\strokec4  = \cf6 \strokec6 SpreadsheetApp\cf4 \strokec4 .\strokec5 openById\strokec4 (\strokec5 sheetId\strokec4 );\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 sheet\strokec4  = \strokec5 ss\strokec4 .\strokec5 getSheetByName\strokec4 (\strokec5 sheetName\strokec4 );\cb1 \
\cb3   \cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 range\strokec4  = \strokec5 sheet\strokec4 .\strokec5 getDataRange\strokec4 ();\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 data\strokec4  = \strokec5 range\strokec4 .\strokec5 getDisplayValues\strokec4 ();\cb1 \
\
\cb3   \cf2 \strokec2 let\cf4 \strokec4  \strokec5 procesados\strokec4  = \cf9 \strokec9 0\cf4 \strokec4 ;\cb1 \
\cb3   \cf2 \strokec2 let\cf4 \strokec4  \strokec5 errores\strokec4  = \cf9 \strokec9 0\cf4 \strokec4 ;\cb1 \
\
\cb3   \cf2 \strokec2 for\cf4 \strokec4  (\cf2 \strokec2 let\cf4 \strokec4  \strokec5 i\strokec4  = \cf9 \strokec9 1\cf4 \strokec4 ; \strokec5 i\strokec4  < \strokec5 data\strokec4 .\strokec5 length\strokec4 ; \strokec5 i\strokec4 ++) \{\cb1 \
\cb3     \cf2 \strokec2 const\cf4 \strokec4  \strokec5 fila\strokec4  = \strokec5 i\strokec4  + \cf9 \strokec9 1\cf4 \strokec4 ;\cb1 \
\cb3     \cb1 \
\cb3     \cf2 \strokec2 try\cf4 \strokec4  \{\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 estado\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 ESTADO\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 ();\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (\strokec5 estado\strokec4  !== \cf7 \strokec7 'Pendiente Bariloche'\cf4 \strokec4 ) \cf2 \strokec2 continue\cf4 \strokec4 ;\cb1 \
\
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 nombre\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 NOMBRE\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 ();\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 km\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 KM\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 ();\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 ltNafta\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 LTNAFTA\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 ();\cb1 \
\cb3       \cb1 \
\cb3       \cf8 \strokec8 // Validaciones obligatorias\cf4 \cb1 \strokec4 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 erroresValidacion\strokec4  = [];\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 nombre\strokec4 ) \strokec5 erroresValidacion\strokec4 .\strokec5 push\strokec4 (\cf7 \strokec7 'Falta nombre en columna B'\cf4 \strokec4 );\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 km\strokec4 ) \strokec5 erroresValidacion\strokec4 .\strokec5 push\strokec4 (\cf7 \strokec7 'Falta KM en columna D'\cf4 \strokec4 );\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 ltNafta\strokec4 ) \strokec5 erroresValidacion\strokec4 .\strokec5 push\strokec4 (\cf7 \strokec7 'Falta LT NAFTA en columna E'\cf4 \strokec4 );\cb1 \
\cb3       \cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (\strokec5 erroresValidacion\strokec4 .\strokec5 length\strokec4  > \cf9 \strokec9 0\cf4 \strokec4 ) \{\cb1 \
\cb3         \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_ESTADO_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'Error'\cf4 \strokec4 );\cb1 \
\cb3         \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_DETALLE_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'Datos faltantes: '\cf4 \strokec4  + \strokec5 erroresValidacion\strokec4 .\strokec5 join\strokec4 (\cf7 \strokec7 ', '\cf4 \strokec4 ));\cb1 \
\cb3         \strokec5 errores\strokec4 ++;\cb1 \
\cb3         \cf2 \strokec2 continue\cf4 \strokec4 ;\cb1 \
\cb3       \}\cb1 \
\
\cb3       \cf8 \strokec8 // Leer todas las variables de Bariloche\cf4 \cb1 \strokec4 \
\cb3       \cf2 \strokec2 let\cf4 \strokec4  \strokec5 observacionesRaw\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 OBSERVATIONS\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 ();\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 observacionesRaw\strokec4 ) \{\cb1 \
\cb3         \strokec5 observacionesRaw\strokec4  = \cf7 \strokec7 'Sin observaciones'\cf4 \strokec4 ;\cb1 \
\cb3         \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 OBSERVATIONS\cf4 \strokec4  + \cf9 \strokec9 1\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\strokec5 observacionesRaw\strokec4 );\cb1 \
\cb3       \}\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 observaciones\strokec4  = \strokec5 observacionesRaw\strokec4 .\strokec5 charAt\strokec4 (\cf9 \strokec9 0\cf4 \strokec4 ).\strokec5 toUpperCase\strokec4 () + \strokec5 observacionesRaw\strokec4 .\strokec5 slice\strokec4 (\cf9 \strokec9 1\cf4 \strokec4 ).\strokec5 replace\strokec4 (\cf10 \strokec10 /\\.*$/\cf4 \strokec4 , \cf7 \strokec7 ''\cf4 \strokec4 ) + \cf7 \strokec7 '.'\cf4 \strokec4 ;\cb1 \
\
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 cristalStatus\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 CRISTAL_STATUS\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 () || \cf7 \strokec7 '-'\cf4 \strokec4 ;\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 carter\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 CARTER\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 () || \cf7 \strokec7 '-'\cf4 \strokec4 ;\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 tires\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 TIRES\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 () || \cf7 \strokec7 '-'\cf4 \strokec4 ;\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 othersDocs\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 OTHERS_DOCS\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 () || \cf7 \strokec7 '-'\cf4 \strokec4 ;\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 otherAccesory\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 OTHER_ACCESORY\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 () || \cf7 \strokec7 '-'\cf4 \strokec4 ;\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 makeChains\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 MAKE_CHAINS\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 () || \cf7 \strokec7 '-'\cf4 \strokec4 ;\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 statusChains\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 STATUS_CHAINS\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 () || \cf7 \strokec7 '-'\cf4 \strokec4 ;\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 tensionersChains\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 TENSIONERS_CHAINS\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 () || \cf7 \strokec7 '-'\cf4 \strokec4 ;\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 othersKit\strokec4  = (\strokec5 data\strokec4 [\strokec5 i\strokec4 ][\cf6 \strokec6 COL\cf4 \strokec4 .\cf6 \strokec6 OTHERS_KIT\cf4 \strokec4 ] || \cf7 \strokec7 ''\cf4 \strokec4 ).\strokec5 toString\strokec4 ().\strokec5 trim\strokec4 () || \cf7 \strokec7 '-'\cf4 \strokec4 ;\cb1 \
\
\cb3       \cf8 \strokec8 // Buscar documento en carpeta del conductor\cf4 \cb1 \strokec4 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 resultado\strokec4  = \strokec5 encontrarDocumentoEnCarpeta\strokec4 (\strokec5 nombre\strokec4 , \strokec5 folderId\strokec4 );\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 resultado\strokec4 ) \{\cb1 \
\cb3         \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_ESTADO_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'Error'\cf4 \strokec4 );\cb1 \
\cb3         \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_DETALLE_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'No se encontro carpeta con el nombre: '\cf4 \strokec4  + \strokec5 nombre\strokec4 );\cb1 \
\cb3         \strokec5 errores\strokec4 ++;\cb1 \
\cb3         \cf2 \strokec2 continue\cf4 \strokec4 ;\cb1 \
\cb3       \}\cb1 \
\
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 archivo\strokec4  = \strokec5 resultado\strokec4 .\strokec5 archivo\strokec4 ;\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 carpeta\strokec4  = \strokec5 resultado\strokec4 .\strokec5 carpeta\strokec4 ;\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 doc\strokec4  = \cf6 \strokec6 DocumentApp\cf4 \strokec4 .\strokec5 openById\strokec4 (\strokec5 archivo\strokec4 .\strokec5 getId\strokec4 ());\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 body\strokec4  = \strokec5 doc\strokec4 .\strokec5 getBody\strokec4 ();\cb1 \
\
\cb3       \cf8 \strokec8 // Reemplazar variables\cf4 \cb1 \strokec4 \
\cb3       \strokec5 reemplazarVariableRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{KM\}\}'\cf4 \strokec4 , \cf6 \strokec6 Number\cf4 \strokec4 (\strokec5 km\strokec4 ).\strokec5 toLocaleString\strokec4 () + \cf7 \strokec7 ' km'\cf4 \strokec4 );\cb1 \
\cb3       \strokec5 reemplazarVariableRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{LTNAFTA\}\}'\cf4 \strokec4 , \strokec5 ltNafta\strokec4 );\cb1 \
\cb3       \strokec5 reemplazarObservacionesRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{OBSERVATIONS\}\}'\cf4 \strokec4 , \strokec5 observaciones\strokec4 );\cb1 \
\cb3       \strokec5 reemplazarVariableRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{CRISTAL STATUS\}\}'\cf4 \strokec4 , \strokec5 cristalStatus\strokec4 );\cb1 \
\cb3       \strokec5 reemplazarVariableRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{CARTER\}\}'\cf4 \strokec4 , \strokec5 carter\strokec4 );\cb1 \
\cb3       \strokec5 reemplazarVariableRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{TIRES\}\}'\cf4 \strokec4 , \strokec5 tires\strokec4 );\cb1 \
\cb3       \strokec5 reemplazarVariableRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{OTHERS DOCS\}\}'\cf4 \strokec4 , \strokec5 othersDocs\strokec4 );\cb1 \
\cb3       \strokec5 reemplazarVariableRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{OTHER ACCESORY\}\}'\cf4 \strokec4 , \strokec5 otherAccesory\strokec4 );\cb1 \
\cb3       \strokec5 reemplazarVariableRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{MAKE CHAINS\}\}'\cf4 \strokec4 , \strokec5 makeChains\strokec4 );\cb1 \
\cb3       \strokec5 reemplazarVariableRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{STATUS CAHINS\}\}'\cf4 \strokec4 , \strokec5 statusChains\strokec4 );\cb1 \
\cb3       \strokec5 reemplazarVariableRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{TENSIONERS CHAINS\}\}'\cf4 \strokec4 , \strokec5 tensionersChains\strokec4 );\cb1 \
\cb3       \strokec5 reemplazarVariableRobusto\strokec4 (\strokec5 body\strokec4 , \cf7 \strokec7 '\{\{OTHERS KIT\}\}'\cf4 \strokec4 , \strokec5 othersKit\strokec4 );\cb1 \
\cb3       \cb1 \
\cb3       \strokec5 doc\strokec4 .\strokec5 saveAndClose\strokec4 ();\cb1 \
\
\cb3       \cf8 \strokec8 // Exportar PDF\cf4 \cb1 \strokec4 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 nombrePDF\strokec4  = \cf7 \strokec7 'Carta Oferta - Auto a Cargo Bariloche - '\cf4 \strokec4  + \strokec5 nombre\strokec4  + \cf7 \strokec7 ' - Actualizado'\cf4 \strokec4 ;\cb1 \
\cb3       \strokec5 exportarComoPDF\strokec4 (\strokec5 archivo\strokec4 .\strokec5 getId\strokec4 (), \strokec5 carpeta\strokec4 , \strokec5 nombrePDF\strokec4 );\cb1 \
\
\cb3       \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_ESTADO_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'Actualizado'\cf4 \strokec4 );\cb1 \
\cb3       \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_DETALLE_1B\cf4 \strokec4 ).\strokec5 clearContent\strokec4 ();\cb1 \
\cb3       \strokec5 procesados\strokec4 ++;\cb1 \
\
\cb3     \} \cf2 \strokec2 catch\cf4 \strokec4  (\strokec5 e\strokec4 ) \{\cb1 \
\cb3       \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_ESTADO_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\cf7 \strokec7 'Error'\cf4 \strokec4 );\cb1 \
\cb3       \strokec5 sheet\strokec4 .\strokec5 getRange\strokec4 (\strokec5 fila\strokec4 , \cf6 \strokec6 COL_DETALLE_1B\cf4 \strokec4 ).\strokec5 setValue\strokec4 (\strokec5 e\strokec4 .\strokec5 message\strokec4 );\cb1 \
\cb3       \strokec5 errores\strokec4 ++;\cb1 \
\cb3     \}\cb1 \
\cb3   \}\cb1 \
\
\cb3   \cf6 \strokec6 SpreadsheetApp\cf4 \strokec4 .\strokec5 getUi\strokec4 ().\strokec5 alert\strokec4 (\cb1 \
\cb3     \cf7 \strokec7 'Proceso Bariloche completado.\\nActualizados: '\cf4 \strokec4  + \strokec5 procesados\strokec4  + \cf7 \strokec7 '\\nErrores: '\cf4 \strokec4  + \strokec5 errores\cb1 \strokec4 \
\cb3   );\cb1 \
\cb3 \}\cb1 \
\
\pard\pardeftab720\partightenfactor0
\cf8 \cb3 \strokec8 // =====================================================\cf4 \cb1 \strokec4 \
\cf8 \cb3 \strokec8 // FUNCIONES AUXILIARES\cf4 \cb1 \strokec4 \
\cf8 \cb3 \strokec8 // =====================================================\cf4 \cb1 \strokec4 \
\
\pard\pardeftab720\partightenfactor0
\cf2 \cb3 \strokec2 function\cf4 \strokec4  \strokec5 encontrarDocumentoEnCarpeta\strokec4 (\strokec5 nombreCarpeta\strokec4 , \strokec5 folderId\strokec4 ) \{\cb1 \
\pard\pardeftab720\partightenfactor0
\cf4 \cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 nombreBuscado\strokec4  = \strokec5 nombreCarpeta\strokec4 .\strokec5 trim\strokec4 ().\strokec5 toLowerCase\strokec4 ();\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 carpetaRaiz\strokec4  = \cf6 \strokec6 DriveApp\cf4 \strokec4 .\strokec5 getFolderById\strokec4 (\strokec5 folderId\strokec4 );\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 carpetas\strokec4  = \strokec5 carpetaRaiz\strokec4 .\strokec5 getFolders\strokec4 ();\cb1 \
\
\cb3   \cf2 \strokec2 while\cf4 \strokec4  (\strokec5 carpetas\strokec4 .\strokec5 hasNext\strokec4 ()) \{\cb1 \
\cb3     \cf2 \strokec2 const\cf4 \strokec4  \strokec5 carpeta\strokec4  = \strokec5 carpetas\strokec4 .\strokec5 next\strokec4 ();\cb1 \
\cb3     \cf2 \strokec2 if\cf4 \strokec4  (\strokec5 carpeta\strokec4 .\strokec5 getName\strokec4 ().\strokec5 trim\strokec4 ().\strokec5 toLowerCase\strokec4 () === \strokec5 nombreBuscado\strokec4 ) \{\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 archivos\strokec4  = \strokec5 carpeta\strokec4 .\strokec5 getFiles\strokec4 ();\cb1 \
\cb3       \cf2 \strokec2 let\cf4 \strokec4  \strokec5 documentoMasReciente\strokec4  = \cf2 \strokec2 null\cf4 \strokec4 ;\cb1 \
\cb3       \cf2 \strokec2 let\cf4 \strokec4  \strokec5 fechaMasReciente\strokec4  = \cf2 \strokec2 null\cf4 \strokec4 ;\cb1 \
\
\cb3       \cf2 \strokec2 while\cf4 \strokec4  (\strokec5 archivos\strokec4 .\strokec5 hasNext\strokec4 ()) \{\cb1 \
\cb3         \cf2 \strokec2 const\cf4 \strokec4  \strokec5 archivo\strokec4  = \strokec5 archivos\strokec4 .\strokec5 next\strokec4 ();\cb1 \
\cb3         \cf2 \strokec2 if\cf4 \strokec4  (\strokec5 archivo\strokec4 .\strokec5 getMimeType\strokec4 () === \cf7 \strokec7 'application/vnd.google-apps.document'\cf4 \strokec4 ) \{\cb1 \
\cb3           \cf2 \strokec2 const\cf4 \strokec4  \strokec5 fecha\strokec4  = \strokec5 archivo\strokec4 .\strokec5 getLastUpdated\strokec4 ();\cb1 \
\cb3           \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 fechaMasReciente\strokec4  || \strokec5 fecha\strokec4  > \strokec5 fechaMasReciente\strokec4 ) \{\cb1 \
\cb3             \strokec5 documentoMasReciente\strokec4  = \strokec5 archivo\strokec4 ;\cb1 \
\cb3             \strokec5 fechaMasReciente\strokec4  = \strokec5 fecha\strokec4 ;\cb1 \
\cb3           \}\cb1 \
\cb3         \}\cb1 \
\cb3       \}\cb1 \
\
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (\strokec5 documentoMasReciente\strokec4 ) \{\cb1 \
\cb3         \cf2 \strokec2 return\cf4 \strokec4  \{ \strokec5 archivo\strokec4 : \strokec5 documentoMasReciente\strokec4 , \strokec5 carpeta\strokec4 : \strokec5 carpeta\strokec4  \};\cb1 \
\cb3       \}\cb1 \
\cb3     \}\cb1 \
\cb3   \}\cb1 \
\
\cb3   \cf2 \strokec2 return\cf4 \strokec4  \cf2 \strokec2 null\cf4 \strokec4 ;\cb1 \
\cb3 \}\cb1 \
\
\pard\pardeftab720\partightenfactor0
\cf2 \cb3 \strokec2 function\cf4 \strokec4  \strokec5 encontrarContratoEnCarpeta\strokec4 (\strokec5 nombreCliente\strokec4 , \strokec5 folderId\strokec4 ) \{\cb1 \
\pard\pardeftab720\partightenfactor0
\cf4 \cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 nombreBuscado\strokec4  = \strokec5 nombreCliente\strokec4 .\strokec5 trim\strokec4 ().\strokec5 toLowerCase\strokec4 ();\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 carpeta\strokec4  = \cf6 \strokec6 DriveApp\cf4 \strokec4 .\strokec5 getFolderById\strokec4 (\strokec5 folderId\strokec4 );\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 archivos\strokec4  = \strokec5 carpeta\strokec4 .\strokec5 getFiles\strokec4 ();\cb1 \
\cb3   \cf2 \strokec2 let\cf4 \strokec4  \strokec5 contratoMasReciente\strokec4  = \cf2 \strokec2 null\cf4 \strokec4 ;\cb1 \
\cb3   \cf2 \strokec2 let\cf4 \strokec4  \strokec5 fechaMasReciente\strokec4  = \cf2 \strokec2 null\cf4 \strokec4 ;\cb1 \
\
\cb3   \cf2 \strokec2 while\cf4 \strokec4  (\strokec5 archivos\strokec4 .\strokec5 hasNext\strokec4 ()) \{\cb1 \
\cb3     \cf2 \strokec2 const\cf4 \strokec4  \strokec5 archivo\strokec4  = \strokec5 archivos\strokec4 .\strokec5 next\strokec4 ();\cb1 \
\cb3     \cf2 \strokec2 const\cf4 \strokec4  \strokec5 nombreArchivo\strokec4  = \strokec5 archivo\strokec4 .\strokec5 getName\strokec4 ().\strokec5 toLowerCase\strokec4 ();\cb1 \
\cb3     \cf2 \strokec2 if\cf4 \strokec4  (\strokec5 archivo\strokec4 .\strokec5 getMimeType\strokec4 () === \cf7 \strokec7 'application/vnd.google-apps.document'\cf4 \strokec4  && \cb1 \
\cb3         \strokec5 nombreArchivo\strokec4 .\strokec5 includes\strokec4 (\strokec5 nombreBuscado\strokec4 )) \{\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 fecha\strokec4  = \strokec5 archivo\strokec4 .\strokec5 getLastUpdated\strokec4 ();\cb1 \
\cb3       \cf2 \strokec2 if\cf4 \strokec4  (!\strokec5 fechaMasReciente\strokec4  || \strokec5 fecha\strokec4  > \strokec5 fechaMasReciente\strokec4 ) \{\cb1 \
\cb3         \strokec5 contratoMasReciente\strokec4  = \strokec5 archivo\strokec4 ;\cb1 \
\cb3         \strokec5 fechaMasReciente\strokec4  = \strokec5 fecha\strokec4 ;\cb1 \
\cb3       \}\cb1 \
\cb3     \}\cb1 \
\cb3   \}\cb1 \
\
\cb3   \cf2 \strokec2 return\cf4 \strokec4  \strokec5 contratoMasReciente\strokec4 ;\cb1 \
\cb3 \}\cb1 \
\
\pard\pardeftab720\partightenfactor0
\cf2 \cb3 \strokec2 function\cf4 \strokec4  \strokec5 reemplazarVariableRobusto\strokec4 (\strokec5 body\strokec4 , \strokec5 marcador\strokec4 , \strokec5 nuevoTexto\strokec4 ) \{\cb1 \
\pard\pardeftab720\partightenfactor0
\cf4 \cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 parrafos\strokec4  = \strokec5 body\strokec4 .\strokec5 getParagraphs\strokec4 ();\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 regex\strokec4  = \cf2 \strokec2 new\cf4 \strokec4  \cf6 \strokec6 RegExp\cf4 \strokec4 (\strokec5 marcador\strokec4 .\strokec5 replace\strokec4 (\cf10 \strokec10 /[\{\}]/\cf2 \strokec2 g\cf4 \strokec4 , \cf7 \strokec7 '\\\\$&'\cf4 \strokec4 ), \cf7 \strokec7 'i'\cf4 \strokec4 );\cb1 \
\
\cb3   \cf2 \strokec2 for\cf4 \strokec4  (\cf2 \strokec2 const\cf4 \strokec4  \strokec5 p\strokec4  \cf2 \strokec2 of\cf4 \strokec4  \strokec5 parrafos\strokec4 ) \{\cb1 \
\cb3     \cf2 \strokec2 const\cf4 \strokec4  \strokec5 textElement\strokec4  = \strokec5 p\strokec4 .\strokec5 editAsText\strokec4 ();\cb1 \
\cb3     \cf2 \strokec2 let\cf4 \strokec4  \strokec5 index\strokec4  = \strokec5 textElement\strokec4 .\strokec5 getText\strokec4 ().\strokec5 search\strokec4 (\strokec5 regex\strokec4 );\cb1 \
\cb3     \cf2 \strokec2 while\cf4 \strokec4  (\strokec5 index\strokec4  !== -\cf9 \strokec9 1\cf4 \strokec4 ) \{\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 matchLength\strokec4  = \strokec5 marcador\strokec4 .\strokec5 length\strokec4 ;\cb1 \
\cb3       \strokec5 textElement\strokec4 .\strokec5 deleteText\strokec4 (\strokec5 index\strokec4 , \strokec5 index\strokec4  + \strokec5 matchLength\strokec4  - \cf9 \strokec9 1\cf4 \strokec4 );\cb1 \
\cb3       \strokec5 textElement\strokec4 .\strokec5 insertText\strokec4 (\strokec5 index\strokec4 , \strokec5 nuevoTexto\strokec4 );\cb1 \
\cb3       \strokec5 index\strokec4  = \strokec5 textElement\strokec4 .\strokec5 getText\strokec4 ().\strokec5 search\strokec4 (\strokec5 regex\strokec4 );\cb1 \
\cb3     \}\cb1 \
\cb3   \}\cb1 \
\cb3 \}\cb1 \
\
\pard\pardeftab720\partightenfactor0
\cf2 \cb3 \strokec2 function\cf4 \strokec4  \strokec5 reemplazarObservacionesRobusto\strokec4 (\strokec5 body\strokec4 , \strokec5 marcador\strokec4 , \strokec5 nuevoTexto\strokec4 ) \{\cb1 \
\pard\pardeftab720\partightenfactor0
\cf4 \cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 parrafos\strokec4  = \strokec5 body\strokec4 .\strokec5 getParagraphs\strokec4 ();\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 regex\strokec4  = \cf2 \strokec2 new\cf4 \strokec4  \cf6 \strokec6 RegExp\cf4 \strokec4 (\strokec5 marcador\strokec4 .\strokec5 replace\strokec4 (\cf10 \strokec10 /[\{\}]/\cf2 \strokec2 g\cf4 \strokec4 , \cf7 \strokec7 '\\\\$&'\cf4 \strokec4 ), \cf7 \strokec7 'i'\cf4 \strokec4 );\cb1 \
\
\cb3   \cf2 \strokec2 for\cf4 \strokec4  (\cf2 \strokec2 const\cf4 \strokec4  \strokec5 p\strokec4  \cf2 \strokec2 of\cf4 \strokec4  \strokec5 parrafos\strokec4 ) \{\cb1 \
\cb3     \cf2 \strokec2 const\cf4 \strokec4  \strokec5 textElement\strokec4  = \strokec5 p\strokec4 .\strokec5 editAsText\strokec4 ();\cb1 \
\cb3     \cf2 \strokec2 let\cf4 \strokec4  \strokec5 index\strokec4  = \strokec5 textElement\strokec4 .\strokec5 getText\strokec4 ().\strokec5 search\strokec4 (\strokec5 regex\strokec4 );\cb1 \
\cb3     \cf2 \strokec2 while\cf4 \strokec4  (\strokec5 index\strokec4  !== -\cf9 \strokec9 1\cf4 \strokec4 ) \{\cb1 \
\cb3       \cf2 \strokec2 const\cf4 \strokec4  \strokec5 matchLength\strokec4  = \strokec5 marcador\strokec4 .\strokec5 length\strokec4 ;\cb1 \
\cb3       \strokec5 textElement\strokec4 .\strokec5 deleteText\strokec4 (\strokec5 index\strokec4 , \strokec5 index\strokec4  + \strokec5 matchLength\strokec4  - \cf9 \strokec9 1\cf4 \strokec4 );\cb1 \
\cb3       \strokec5 textElement\strokec4 .\strokec5 insertText\strokec4 (\strokec5 index\strokec4 , \strokec5 nuevoTexto\strokec4 );\cb1 \
\cb3       \strokec5 textElement\strokec4 .\strokec5 setUnderline\strokec4 (\strokec5 index\strokec4 , \strokec5 index\strokec4  + \strokec5 nuevoTexto\strokec4 .\strokec5 length\strokec4  - \cf9 \strokec9 1\cf4 \strokec4 , \cf2 \strokec2 true\cf4 \strokec4 );\cb1 \
\cb3       \strokec5 index\strokec4  = \strokec5 textElement\strokec4 .\strokec5 getText\strokec4 ().\strokec5 search\strokec4 (\strokec5 regex\strokec4 );\cb1 \
\cb3     \}\cb1 \
\cb3   \}\cb1 \
\cb3 \}\cb1 \
\
\pard\pardeftab720\partightenfactor0
\cf2 \cb3 \strokec2 function\cf4 \strokec4  \strokec5 exportarComoPDF\strokec4 (\strokec5 docId\strokec4 , \strokec5 carpetaDestino\strokec4 , \strokec5 nuevoNombre\strokec4 ) \{\cb1 \
\pard\pardeftab720\partightenfactor0
\cf4 \cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 url\strokec4  = \cf7 \strokec7 'https://docs.google.com/document/d/'\cf4 \strokec4  + \strokec5 docId\strokec4  + \cf7 \strokec7 '/export?format=pdf'\cf4 \strokec4 ;\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 token\strokec4  = \cf6 \strokec6 ScriptApp\cf4 \strokec4 .\strokec5 getOAuthToken\strokec4 ();\cb1 \
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 response\strokec4  = \cf6 \strokec6 UrlFetchApp\cf4 \strokec4 .\strokec5 fetch\strokec4 (\strokec5 url\strokec4 , \{\cb1 \
\cb3     \strokec5 headers\strokec4 : \{ \cf7 \strokec7 'Authorization'\cf4 \strokec4 : \cf7 \strokec7 'Bearer '\cf4 \strokec4  + \strokec5 token\strokec4  \}\cb1 \
\cb3   \});\cb1 \
\
\cb3   \cf2 \strokec2 const\cf4 \strokec4  \strokec5 blob\strokec4  = \strokec5 response\strokec4 .\strokec5 getBlob\strokec4 ().\strokec5 setName\strokec4 (\strokec5 nuevoNombre\strokec4  + \cf7 \strokec7 '.pdf'\cf4 \strokec4 );\cb1 \
\cb3   \strokec5 carpetaDestino\strokec4 .\strokec5 createFile\strokec4 (\strokec5 blob\strokec4 );\cb1 \
\cb3 \}\cb1 \
}