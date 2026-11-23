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
