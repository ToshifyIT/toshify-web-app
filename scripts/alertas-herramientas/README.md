# Alertas de Consumo herramientas

Script del servidor (toshify-sync) para **Administración › Consumo herramientas**.
Ejecución diaria a las 9 (hora Argentina). Avisa por correo (Resend) y, si hay
webhook, por Slack:

- a) cobros que vencen en los próximos N días,
- b) pagos vencidos sin marcar como pagados,
- c) herramientas activas sin facturación a GRUPO CG SAS o sin tarjeta cargada,
- d) saldos prepago a los que les quedan 7 días o menos al ritmo de gasto actual.

Antes de avisar trae el consumo real de las herramientas por uso (ver más abajo).

Si no hay nada para avisar, no envía nada. Solo usa la biblioteca estándar de
Python 3 (no hace falta entorno virtual ni dependencias).

## Requisitos

- `sql/consumo_herramientas.sql` ejecutado en Supabase.
- En `/opt/toshify-sync/env.sh` (además de `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  y `RESEND_API_KEY`, que ya existen):

```bash
export HERRAMIENTAS_ALERTAS_DESTINATARIOS="it@toshify.com.ar,admin@toshify.com.ar"
export HERRAMIENTAS_ALERTAS_DIAS=5
export HERRAMIENTAS_ALERTAS_SLACK_WEBHOOK=""   # opcional
```

## Consumo real (2Chat y Google Cloud)

Requiere `sql/consumo_herramientas_consumo.sql`. Se ve en Administración › Consumo
herramientas, en el panel "Consumo por uso".

- **2Chat**: no hay que configurar nada. Suma por día el costo de las llamadas que
  ya guarda la integración (`twochat_llamadas.costo_usd`). La suscripción, el alquiler
  de números y las recargas no salen por la API: no están incluidos.
- **Google Cloud (Maps, Gemini)**: Google no tiene una API de gasto; el costo se lee
  de la exportación de facturación a BigQuery. Una sola vez, en la consola de Google:
  1. BigQuery: crear un dataset (ej. `facturacion`) en la multirregión US, en un
     proyecto de la misma cuenta de facturación.
  2. Facturación › Exportación de facturación › BigQuery › habilitar la exportación
     estándar de costos de uso hacia ese dataset. La tabla aparece en unas horas y
     los datos llegan con hasta un día de atraso.
  3. Crear una cuenta de servicio con los roles "Usuario de trabajos de BigQuery"
     (en el proyecto) y "Visualizador de datos de BigQuery" (en el dataset), bajar
     su clave JSON y copiarla al servidor (permisos 600).
  4. En `env.sh`:

```bash
export HERRAMIENTAS_GCP_CREDENCIALES="/opt/toshify-sync/secretos/gcp-facturacion.json"
export HERRAMIENTAS_GCP_TABLA="mi-proyecto.facturacion.gcp_billing_export_v1_XXXXXX_XXXXXX_XXXXXX"
export HERRAMIENTAS_GCP_UBICACION="US"   # la del dataset
```

  Sin esas variables el script omite Google y sigue con lo demás. Los servicios se
  agrupan en "Gemini", "Google Maps" y "Otros de Google Cloud" (`concepto_google`).
- **Saldo prepago**: ninguna API lo entrega. Se carga a mano en el panel (saldo y
  fecha) y de ahí se descuenta el consumo. El prepago de Gemini (AI Studio) es un
  saldo aparte del de la cuenta donde se cobra Maps: al cargarlo se elige "Solo Gemini".

## Credenciales de Google

El script acepta la cuenta de servicio de dos formas:

- un archivo JSON, con su ruta en `HERRAMIENTAS_GCP_CREDENCIALES` (o `HERRAMIENTAS_GWS_CREDENCIALES`), o
- las mismas dos variables que usa la web para Drive, copiadas del `.env` de la web al
  `env.sh` del servidor: `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
  (la clave en una sola línea, entre comillas, con los saltos escritos como `\n`).

Si están las dos, gana el JSON. En cualquier caso a esa cuenta hay que darle los permisos
de cada sección (BigQuery para el consumo, delegación de dominio para las licencias).

## Cantidad de licencias (Slack y Google Workspace)

Para las herramientas que cobran por usuario, el script trae cuántas licencias se pagan
y recalcula el monto de la ficha: `licencias × precio por licencia`. El precio se carga
una vez en la ficha (Editar herramienta › Precio por licencia); ninguna API lo entrega.
Cuando la cantidad cambia, actualiza la ficha y los pagos pendientes que todavía no
vencieron, y lo avisa en el correo. Es una estimación: no incluye impuestos ni los
ajustes por altas o bajas a mitad de mes. Requiere `sql/consumo_herramientas_precio_licencia.sql`.

**Slack** (lo hace un administrador del espacio de trabajo):

1. En https://api.slack.com/apps crear una app en el espacio Toshify.
2. En OAuth & Permissions, agregar en *User Token Scopes* el alcance `admin` e instalar la app.
3. Copiar el *User OAuth Token* (empieza con `xoxp-`) al `env.sh` del servidor.

**Google Workspace** (lo hace un superadministrador):

1. En el proyecto de Google Cloud, habilitar la *Enterprise License Manager API*.
2. Usar la misma cuenta de servicio del consumo (o crear otra) y copiar su ID de cliente.
3. En admin.google.com › Seguridad › Controles de API › Delegación de todo el dominio,
   agregar ese ID de cliente con el alcance `https://www.googleapis.com/auth/apps.licensing`.

```bash
export HERRAMIENTAS_SLACK_TOKEN="xoxp-..."
export HERRAMIENTAS_GWS_ADMIN="administrador@toshify.com.ar"
export HERRAMIENTAS_GWS_DOMINIO="toshify.com.ar"
# export HERRAMIENTAS_GWS_CREDENCIALES="/ruta/otra-cuenta.json"   # si no es la de GCP
```

Sin estas variables el script saltea las licencias y sigue con el resto.

## Instalación

```bash
mkdir -p /opt/toshify-sync/alertas-herramientas
# copiar main.py a esa carpeta
cd /opt/toshify-sync/alertas-herramientas && . /opt/toshify-sync/env.sh && . /opt/toshify-sync/resolve-supabase.sh && python3 main.py --dry-run
```

`resolve-supabase.sh` va siempre después de `env.sh`: pone en `SUPABASE_URL` la IP actual
del contenedor de Supabase (sin eso da "Connection refused").

Línea del crontab (09:00 Argentina, mismo formato que los demás):

```cron
0 * * * * [ "$(TZ=America/Argentina/Buenos_Aires date +\%H)" = "09" ] && cd /opt/toshify-sync/alertas-herramientas && . /opt/toshify-sync/env.sh && . /opt/toshify-sync/resolve-supabase.sh && python3 main.py >> /var/log/alertas-herramientas.log 2>&1
```

`estado-cron.sh` la detecta sola (clave `alertas-herramientas/main.py`) y la muestra en
Configuración › Integraciones & Tokens con la descripción cargada por el SQL.

## Facturas y pagos leídos del correo (`facturas_correo.py`)

Lo que tiene API sigue por API (arriba). Lo que ninguna API entrega (si se pagó y la
factura) se cruza con el correo: dos veces por día, a las 14 y a las 17, el script lee **info@**, **maria.f@** (ex techspec) y **josue.caride@** (DocuSeal) con la API de Gmail (solo lectura) y revisa los correos de los remitentes de
cada herramienta (`herramientas.remitentes_factura`):

- **Factura o recibo**: marca el pago del mes como *Pagado* con la fecha del correo y le
  adjunta el PDF. Si el monto del correo no coincide con el del pago, no toca nada y avisa.
- **Pago rechazado** ("no pudimos renovar", "problema de pago"): no toca nada y avisa.
- **Otra factura del mismo mes** (recarga de créditos de 2Chat, cargo extra): la suma al
  pago del mes, deja la nota en observaciones y guarda el PDF. Si el correo no trae un
  monto claro (varios importes), avisa.
- **Herramienta por uso sin pago ese mes** (recarga de Anticaptcha, pack): crea el pago
  como Pagado con el monto del correo.
- **No se puede cruzar seguro** (sin pago del mes en una mensual, monto distinto): avisa.

Lo que cargó solo y lo que hay que revisar llega en un correo a los mismos destinatarios
(solo si hubo algo). Cada correo queda registrado en
`herramientas_facturas_correo` y no se vuelve a procesar. El script no marca correos como
leídos, no los mueve ni los borra, y no mira otros remitentes. Requiere
`sql/herramientas_facturas_correo.sql`.

**Permiso de cada casilla (una sola vez, desde una computadora con navegador):**

1. En Google Cloud › APIs y servicios: habilitar **Gmail API** y crear un *ID de cliente
   de OAuth* de tipo **App de escritorio** (si pide pantalla de consentimiento: interna).
2. Con las variables del cliente exportadas, correr y entrar con cada casilla:

```bash
export HERRAMIENTAS_GMAIL_CLIENT_ID="...apps.googleusercontent.com"
export HERRAMIENTAS_GMAIL_CLIENT_SECRET="..."
python3 facturas_correo.py autorizar info@toshify.com.ar
python3 facturas_correo.py autorizar maria.f@toshify.com.ar
python3 facturas_correo.py autorizar josue.caride@toshify.com.ar
```

3. Guardar los dos tokens en el servidor, en `/opt/toshify-sync/secretos/gmail-tokens.json`
   (permisos 600):

```json
{ "info@toshify.com.ar": "1//...", "techspec@toshify.com.ar": "1//..." }
```

4. En `env.sh`:

```bash
export HERRAMIENTAS_GMAIL_CLIENT_ID="...apps.googleusercontent.com"
export HERRAMIENTAS_GMAIL_CLIENT_SECRET="..."
export HERRAMIENTAS_GMAIL_TOKENS="/opt/toshify-sync/secretos/gmail-tokens.json"
export HERRAMIENTAS_GMAIL_DESDE="2026-11-25"   # día de instalación: lo anterior ya está cargado a mano
# export HERRAMIENTAS_GMAIL_DIAS=10   # días hacia atrás que revisa
```

Se pueden sumar más casillas agregando su token al mismo archivo: no hay que tocar el script.
Las facturas de **DocuSeal** llegan a josue.caride@ por Stripe. De info@docuseal.com llegan las
cartas oferta firmadas: por eso el remitente de DocuSeal es solo stripe.com con asunto "DocuSeal".
Cada herramienta se busca con su asunto en la misma búsqueda de Gmail: los correos de un remitente
compartido que no son de esa herramienta no se abren.

Cada token solo permite leer esa casilla. Se revoca desde la cuenta de Google de la casilla
(Seguridad › Conexiones con apps de terceros).

**Confirmar los remitentes** antes de dejarlo andar: lista quién mandó PDF en los últimos
180 días en cada casilla, para completar o corregir `remitentes_factura`:

```bash
python3 facturas_correo.py descubrir
python3 facturas_correo.py --dry-run     # muestra qué haría con cada correo, sin escribir
```

Líneas del crontab (14:00 y 17:00 Argentina; la segunda toma lo que llegó a la tarde):

```cron
0 * * * * H=$(TZ=America/Argentina/Buenos_Aires date +\%H); [ "$H" = "14" -o "$H" = "17" ] && cd /opt/toshify-sync/alertas-herramientas && . /opt/toshify-sync/env.sh && . /opt/toshify-sync/resolve-supabase.sh && python3 facturas_correo.py >> /var/log/facturas-correo.log 2>&1
```

`facturas_correo.py` usa funciones de `main.py`: copiar los dos archivos a la misma carpeta.

### Copia en Drive y botón "Ver"

Cada factura que adjunta el lector también se sube a Drive, en **HERRAMIENTAS/AAAA-MM** (la carpeta
de maria.f@ compartida con la contadora), con el mismo formato de nombre que las subidas a mano:
`2026-11 · Slack - <archivo>.pdf`. Si ya hay un archivo con ese nombre, no lo repite. Si falta la
carpeta del mes, la crea. En la pantalla, "Ver" abre la carpeta del mes del pago (ahí están todas las
facturas: plan, recargas, ajustes). Requiere `sql/herramientas_drive_carpetas.sql`.

La subida usa la casilla dueña de la carpeta, autorizada con Drive además de Gmail:

```bash
python3 facturas_correo.py autorizar maria.f@toshify.com.ar --drive
python3 facturas_correo.py carpetas      # una vez: registra las carpetas de meses que ya existen
```

```bash
# export HERRAMIENTAS_DRIVE_CUENTA="maria.f@toshify.com.ar"            # por defecto
# export HERRAMIENTAS_DRIVE_CARPETA="17-IiBh9qIWLxFRcuvFwIK-3EnnVsPO4I"  # HERRAMIENTAS, por defecto
```

La cuenta de servicio de la web no sirve para esto: la carpeta está en "Mi unidad" y Google no deja
que una cuenta de servicio cree archivos ahí.
