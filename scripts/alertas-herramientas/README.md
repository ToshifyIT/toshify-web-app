# Alertas de Consumo herramientas

Script del servidor (toshify-sync) para **Administración › Consumo herramientas**.
Ejecución diaria a las 9 (hora Argentina). Avisa por correo (Resend) y, si hay
webhook, por Slack:

- a) cobros que vencen en los próximos N días,
- b) pagos vencidos sin marcar como pagados,
- c) herramientas activas sin facturación a GRUPO CG SAS o sin tarjeta cargada.

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

## Instalación

```bash
mkdir -p /opt/toshify-sync/alertas-herramientas
# copiar main.py a esa carpeta
cd /opt/toshify-sync/alertas-herramientas && . /opt/toshify-sync/env.sh && python3 main.py --dry-run
```

Línea del crontab (09:00 Argentina, mismo formato que los demás):

```cron
0 * * * * [ "$(TZ=America/Argentina/Buenos_Aires date +\%H)" = "09" ] && cd /opt/toshify-sync/alertas-herramientas && . /opt/toshify-sync/env.sh && python3 main.py >> /var/log/alertas-herramientas.log 2>&1
```

`estado-cron.sh` la detecta sola (clave `alertas-herramientas/main.py`) y la muestra en
Configuración › Integraciones & Tokens con la descripción cargada por el SQL.
