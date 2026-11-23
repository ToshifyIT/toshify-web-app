#!/usr/bin/env python3
"""
Alertas de Consumo herramientas (Administración › Consumo herramientas).

Ejecución diaria desde el crontab del servidor (toshify-sync). Avisa por correo
(Resend) y, si está configurado, por Slack:
  0) actualiza las cotizaciones del día (ARS / EUR / PEN contra USD),
  0b) trae el consumo real de las herramientas por uso: llamadas de 2Chat (ya están
      en la base) y Google Cloud (Maps, Gemini) desde la exportación de facturación
      a BigQuery, si está configurada,
  0c) trae la cantidad de licencias de Slack y Google Workspace y recalcula el monto
      (licencias × precio por licencia) si están configurados; avisa cuando cambia,
  - Todos los días: saldos prepago que se terminan en 7 días o menos (o ya agotados).
  - Lunes: agenda de la semana (pagos ordenados por fecha), resto del mes,
    pagos vencidos y herramientas activas sin facturación al grupo (SAS o INC.) o sin tarjeta.
  - Resto de los días: recordatorio de los pagos que vencen en N días (por defecto 2) u hoy.
    Si no hay ninguno, no se envía nada.
Antes de revisar, genera los pagos que falten (herramientas_generar_pagos).
Si no hay nada para avisar, no manda nada.

Variables de entorno (env.sh del servidor):
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (las mismas que el resto de los scripts)
  RESEND_API_KEY                            (la misma del correo semanal de Cabify)
  HERRAMIENTAS_ALERTAS_DESTINATARIOS        correos separados por coma (obligatoria)
  HERRAMIENTAS_ALERTAS_DIAS                 días de anticipación del recordatorio (por defecto 2)
  HERRAMIENTAS_ALERTAS_SLACK_WEBHOOK        webhook de Slack (opcional)
  HERRAMIENTAS_GCP_CREDENCIALES             ruta al JSON de la cuenta de servicio de Google (opcional)
  HERRAMIENTAS_GCP_TABLA                    proyecto.dataset.gcp_billing_export_v1_XXXXXX (opcional);
                                            varias separadas por coma, una por cuenta de facturación
  HERRAMIENTAS_GCP_UBICACION                ubicación del dataset de BigQuery (por defecto US)
  HERRAMIENTAS_SLACK_TOKEN                  token de usuario administrador de Slack, alcance admin (opcional)
  HERRAMIENTAS_GWS_ADMIN                    correo del administrador de Google Workspace (opcional)
  HERRAMIENTAS_GWS_DOMINIO                  dominio de Google Workspace, ej. toshify.com.ar (opcional)
  HERRAMIENTAS_GWS_CREDENCIALES             JSON de la cuenta de servicio (por defecto, la de GCP)
  GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
                                            la cuenta de servicio que ya usa la web para Drive; se usa
                                            si no hay ningún JSON en las variables de arriba

Uso:
  python3 main.py              # ejecución normal
  python3 main.py --dry-run    # muestra el aviso sin enviar nada
  python3 main.py --resumen    # fuerza la agenda semanal (aunque no sea lunes)

Solo usa la biblioteca estándar de Python (no hace falta instalar nada). Para firmar
el acceso a Google usa el comando openssl del servidor.
No lee ni guarda contraseñas ni datos de tarjetas (solo los últimos 4 dígitos).
"""

import base64
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Optional

ZONA_AR = timezone(timedelta(hours=-3))
CUIT_OBJETIVO = "30718340000"
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]
RAZON_OBJETIVO = "GRUPO CG SAS"
REMITENTE = "Toshify <no-reply@toshify.com.ar>"
URL_MODULO = "https://app.toshify.com.ar/administracion/consumo-herramientas"


def log(msg: str) -> None:
    print(f"{datetime.now(ZONA_AR):%Y-%m-%d %H:%M:%S} {msg}", flush=True)


def env(nombre: str, obligatoria: bool = True, defecto: str = "") -> str:
    valor = os.environ.get(nombre, defecto).strip()
    if obligatoria and not valor:
        raise SystemExit(f"ERROR falta la variable de entorno {nombre}")
    return valor


def pedir(url: str, metodo: str = "GET", datos=None, encabezados=None):
    cuerpo = json.dumps(datos).encode() if datos is not None else None
    # User-Agent propio: Cloudflare bloquea el de urllib (error 1010)
    h = {"User-Agent": "toshify-sync/alertas-herramientas", **(encabezados or {})}
    req = urllib.request.Request(url, data=cuerpo, method=metodo, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = r.read().decode()
            try:
                return json.loads(txt) if txt else None
            except ValueError:
                return txt
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{metodo} {url.split('?')[0]} -> HTTP {e.code}: {e.read().decode()[:300]}") from e


class Supabase:
    def __init__(self) -> None:
        self.url = env("SUPABASE_URL").rstrip("/")
        clave = env("SUPABASE_SERVICE_ROLE_KEY")
        self.h = {"apikey": clave, "Authorization": f"Bearer {clave}", "Content-Type": "application/json"}

    def select(self, tabla: str, params: dict) -> list:
        q = urllib.parse.urlencode(params, safe="(),.*:")
        return pedir(f"{self.url}/rest/v1/{tabla}?{q}", encabezados=self.h) or []

    def patch(self, tabla: str, filtro: dict, datos: dict):
        q = urllib.parse.urlencode(filtro, safe="(),.*:")
        return pedir(f"{self.url}/rest/v1/{tabla}?{q}", "PATCH", datos, {**self.h, "Prefer": "return=minimal"})

    def upsert(self, tabla: str, conflicto: str, filas: list):
        return pedir(f"{self.url}/rest/v1/{tabla}?on_conflict={conflicto}", "POST", filas,
                     {**self.h, "Prefer": "resolution=merge-duplicates,return=minimal"})

    def rpc(self, funcion: str, args: dict):
        return pedir(f"{self.url}/rest/v1/rpc/{funcion}", "POST", args, self.h)


def fecha_ar(iso: Optional[str]) -> str:
    if not iso:
        return "a confirmar"
    a, m, d = iso[:10].split("-")
    return f"{d}/{m}/{a}"


def plata(monto, moneda: Optional[str]) -> str:
    if monto is None:
        return "-"
    n = float(monto)
    cod = (moneda or "ARS").upper()
    dec = 0 if cod == "ARS" else 2
    txt = f"{n:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    prefijo = {"ARS": "$", "USD": "US$", "EUR": "€"}.get(cod, cod)
    return f"{prefijo} {txt}"


def actualizar_cotizaciones(sb: "Supabase") -> None:
    """Unidades de ARS / EUR / PEN por 1 USD (open.er-api.com). Una corrección hecha a mano
    en la pantalla se respeta durante 7 días."""
    try:
        tasas = pedir("https://open.er-api.com/v6/latest/USD")["rates"]
    except Exception as e:  # noqa: BLE001 — sin cotización nueva igual se mandan las alertas
        log(f"aviso: no se pudieron traer las cotizaciones ({e}); quedan las anteriores")
        return
    actuales = {c["moneda"]: c for c in sb.select("herramientas_cotizaciones", {"select": "moneda,fuente,actualizada_en"})}
    limite = datetime.now(timezone.utc) - timedelta(days=7)
    for moneda in ("ARS", "EUR", "PEN"):
        if moneda not in tasas or moneda not in actuales:
            continue
        c = actuales[moneda]
        if c.get("fuente") == "manual" and datetime.fromisoformat(c["actualizada_en"].replace("Z", "+00:00")) > limite:
            continue
        sb.patch("herramientas_cotizaciones", {"moneda": f"eq.{moneda}"}, {
            "unidades_por_usd": round(float(tasas[moneda]), 6),
            "fuente": "open.er-api.com",
            "actualizada_en": datetime.now(timezone.utc).isoformat(),
        })
    log("cotizaciones actualizadas: " + ", ".join(f"{m} {tasas[m]:.4f}" for m in ("ARS", "EUR", "PEN") if m in tasas))


# ── Consumo real de las herramientas por uso ─────────────────────────────────

DIAS_RITMO = 14        # días que se miran para el ritmo de gasto del prepago
DIAS_AVISO_SALDO = 7   # con menos días de saldo que estos, se avisa

# Servicios de la facturación de Google Cloud agrupados en los conceptos de la pantalla
PALABRAS_GEMINI = ("gemini", "generative language")
PALABRAS_MAPS = ("maps", "places", "geocoding", "routes", "directions", "distance matrix", "geolocation",
                 "roads", "street view", "address validation", "time zone", "elevation")


def concepto_google(servicio: str) -> str:
    s = (servicio or "").lower()
    if any(p in s for p in PALABRAS_GEMINI):
        return "Gemini"
    if any(p in s for p in PALABRAS_MAPS):
        return "Google Maps"
    return "Otros de Google Cloud"


def b64url(datos: bytes) -> str:
    return base64.urlsafe_b64encode(datos).rstrip(b"=").decode()


def credenciales_google(*variables_ruta: str) -> Optional[dict]:
    """Credenciales de la cuenta de servicio: el JSON de la primera variable de ruta cargada o,
    si no hay ninguna, las mismas dos variables que usa la web para Drive
    (GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY). None si no hay nada."""
    for variable in variables_ruta:
        ruta = env(variable, False)
        if ruta:
            with open(ruta, encoding="utf-8") as f:
                return json.load(f)
    correo = env("GOOGLE_SERVICE_ACCOUNT_EMAIL", False)
    clave = env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", False)
    if correo and clave:
        # En el .env la clave va en una sola línea, con los saltos escritos como \n
        return {"client_email": correo, "private_key": clave.replace("\\n", "\n")}
    return None


def token_google(credenciales: dict, alcance: str = "https://www.googleapis.com/auth/bigquery.readonly",
                 en_nombre_de: str = "") -> str:
    """Token de acceso de la cuenta de servicio (JWT RS256 firmado con openssl).
    en_nombre_de: correo del administrador de Workspace (delegación de todo el dominio)."""
    ahora = int(time.time())
    cabecera = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    cuerpo = b64url(json.dumps({
        "iss": credenciales["client_email"],
        "scope": alcance,
        "aud": "https://oauth2.googleapis.com/token",
        "iat": ahora, "exp": ahora + 600,
        **({"sub": en_nombre_de} if en_nombre_de else {}),
    }).encode())
    a_firmar = f"{cabecera}.{cuerpo}".encode()
    with tempfile.NamedTemporaryFile("w", suffix=".pem") as clave:
        os.chmod(clave.name, 0o600)
        clave.write(credenciales["private_key"])
        clave.flush()
        firma = subprocess.run(["openssl", "dgst", "-sha256", "-sign", clave.name],
                               input=a_firmar, capture_output=True, check=True).stdout
    datos = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": f"{cabecera}.{cuerpo}.{b64url(firma)}",
    }).encode()
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=datos, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())["access_token"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Google no dio el token: HTTP {e.code}: {e.read().decode()[:300]}") from e


def consumo_google(desde) -> list:
    """Costo neto (con créditos) por día y concepto desde la exportación de facturación a BigQuery.
    HERRAMIENTAS_GCP_TABLA admite varias tablas separadas por coma (una por cuenta de facturación).
    Devuelve [] si no está configurado."""
    tablas = [t.strip() for t in env("HERRAMIENTAS_GCP_TABLA", False).split(",") if t.strip()]
    credenciales = credenciales_google("HERRAMIENTAS_GCP_CREDENCIALES")
    if not credenciales or not tablas:
        log("consumo de Google Cloud omitido: faltan las credenciales de Google o HERRAMIENTAS_GCP_TABLA")
        return []
    for tabla in tablas:
        if not re.fullmatch(r"[\w-]+\.\w+\.\w+", tabla):
            raise RuntimeError("HERRAMIENTAS_GCP_TABLA tiene que ser proyecto.dataset.tabla")
    token = token_google(credenciales)
    suma: dict = {}
    leidas = 0
    for tabla in tablas:
        consulta = f"""
            SELECT FORMAT_DATE('%F', DATE(usage_start_time, 'America/Argentina/Buenos_Aires')) AS fecha,
                   service.description AS servicio, currency AS moneda,
                   SUM(CAST(cost AS NUMERIC))
                     + SUM(IFNULL((SELECT SUM(CAST(c.amount AS NUMERIC)) FROM UNNEST(credits) c), 0)) AS neto
            FROM `{tabla}`
            WHERE usage_start_time >= TIMESTAMP('{desde:%Y-%m-%d}', 'America/Argentina/Buenos_Aires')
            GROUP BY 1, 2, 3"""
        try:
            res = pedir(f"https://bigquery.googleapis.com/bigquery/v2/projects/{tabla.split('.')[0]}/queries", "POST", {
                "query": consulta, "useLegacySql": False, "timeoutMs": 60000, "maxResults": 10000,
                "location": env("HERRAMIENTAS_GCP_UBICACION", False, "US"),
                # Tope de lo que puede leer la consulta (1 GB): no puede generar un costo por error
                "maximumBytesBilled": "1000000000",
            }, {"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        except Exception as e:  # noqa: BLE001 — una tabla que falla (o que Google todavía no creó) no frena las demás
            log(f"aviso: no se pudo leer {tabla} ({e})")
            continue
        if not res.get("jobComplete"):
            log(f"aviso: la consulta de {tabla} no terminó a tiempo")
            continue
        leidas += 1
        for fila in res.get("rows", []):
            fecha, servicio, moneda, neto = (c["v"] for c in fila["f"])
            clave = (fecha, concepto_google(servicio), moneda)
            suma[clave] = suma.get(clave, 0.0) + float(neto or 0)
    log(f"Google Cloud: {leidas} de {len(tablas)} tablas de facturación leídas")
    return [{"fecha": f, "concepto": c, "moneda": m, "monto": round(v, 4)} for (f, c, m), v in suma.items()]


def actualizar_consumo(sb: "Supabase", hoy) -> None:
    """2Chat: suma las llamadas por día (función de la base). Google Cloud: BigQuery.
    Rehace desde el primer día del mes anterior (la facturación llega con hasta un día de atraso)."""
    desde = (hoy.replace(day=1) - timedelta(days=1)).replace(day=1)
    try:
        n = sb.rpc("herramientas_actualizar_consumo_2chat", {})
        log(f"consumo de 2Chat: {n} días actualizados")
    except Exception as e:  # noqa: BLE001 — sin el consumo igual se mandan las alertas
        log(f"aviso: no se pudo actualizar el consumo de 2Chat ({e})")
    try:
        filas = consumo_google(desde)
        if not filas:
            return
        herramienta = sb.select("herramientas", {"select": "id", "fuente_consumo": "eq.google_cloud", "limit": "1"})
        if not herramienta:
            log("aviso: no hay ninguna herramienta con fuente_consumo = google_cloud")
            return
        monedas = {"USD", "ARS", "EUR", "PEN"}
        ahora = datetime.now(timezone.utc).isoformat()
        validas = [{**f, "herramienta_id": herramienta[0]["id"], "fuente": "bigquery", "actualizado_en": ahora}
                   for f in filas if f["moneda"] in monedas]
        if len(validas) < len(filas):
            log(f"aviso: {len(filas) - len(validas)} filas de Google en una moneda no contemplada")
        for i in range(0, len(validas), 500):
            sb.upsert("herramientas_consumo", "herramienta_id,fecha,concepto", validas[i:i + 500])
        log(f"consumo de Google Cloud: {len(validas)} filas (día y concepto) desde {desde:%d/%m}")
    except Exception as e:  # noqa: BLE001
        log(f"aviso: no se pudo traer el consumo de Google Cloud ({e})")


def saldos_por_agotarse(sb: "Supabase", hoy) -> list:
    """Herramientas con saldo prepago cargado al que le quedan DIAS_AVISO_SALDO días o menos.
    Misma cuenta que la pantalla (consumo.ts)."""
    try:
        herramientas = sb.select("herramientas", {
            "select": "id,nombre,moneda,saldo_prepago,saldo_prepago_fecha,saldo_prepago_concepto",
            "estado": "eq.Activa", "saldo_prepago": "not.is.null", "saldo_prepago_fecha": "not.is.null",
        })
        if not herramientas:
            return []
        tasas = {c["moneda"]: float(c["unidades_por_usd"]) for c in sb.select("herramientas_cotizaciones", {"select": "moneda,unidades_por_usd"})}
        avisos = []
        for h in herramientas:
            moneda = h.get("moneda") or "USD"
            filas = sb.select("herramientas_consumo", {
                "select": "fecha,concepto,monto,moneda", "herramienta_id": f"eq.{h['id']}",
                "fecha": f"gte.{min(h['saldo_prepago_fecha'], (hoy - timedelta(days=DIAS_RITMO)).isoformat())}",
            })
            if h.get("saldo_prepago_concepto"):
                filas = [f for f in filas if f["concepto"] == h["saldo_prepago_concepto"]]

            def en_moneda(f, moneda=moneda):
                m = float(f["monto"])
                if f["moneda"] == moneda or f["moneda"] not in tasas or moneda not in tasas:
                    return m
                return m / tasas[f["moneda"]] * tasas[moneda]

            usado = sum(en_moneda(f) for f in filas if f["fecha"] > h["saldo_prepago_fecha"])
            queda = float(h["saldo_prepago"]) - usado
            desde = (hoy - timedelta(days=DIAS_RITMO)).isoformat()
            ritmo = sum(en_moneda(f) for f in filas if desde <= f["fecha"] < hoy.isoformat()) / DIAS_RITMO
            dias = int(max(0, queda) // ritmo) if ritmo > 0 else None
            if queda <= 0 or (dias is not None and dias <= DIAS_AVISO_SALDO):
                nombre = h["nombre"] + (f" ({h['saldo_prepago_concepto']})" if h.get("saldo_prepago_concepto") else "")
                if queda <= 0:
                    avisos.append(f"{nombre}: saldo agotado según el consumo desde el {fecha_ar(h['saldo_prepago_fecha'])}")
                else:
                    avisos.append(f"{nombre}: quedan {plata(queda, moneda)}, alcanza hasta el "
                                  f"{(hoy + timedelta(days=dias)):%d/%m} ({dias} {'día' if dias == 1 else 'días'} al ritmo actual)")
        return avisos
    except Exception as e:  # noqa: BLE001 — sin la tabla de consumo no hay avisos de saldo
        log(f"aviso: no se pudieron revisar los saldos prepago ({e})")
        return []


# ── Cantidad de licencias (herramientas que cobran por usuario) ──────────────

def licencias_slack() -> Optional[int]:
    """Usuarios que Slack cobra hoy (team.billableInfo). None si no está configurado."""
    token = env("HERRAMIENTAS_SLACK_TOKEN", False)
    if not token:
        log("licencias de Slack omitidas: falta HERRAMIENTAS_SLACK_TOKEN")
        return None
    total, cursor = 0, ""
    for _ in range(50):
        q = urllib.parse.urlencode({"limit": 1000, **({"cursor": cursor} if cursor else {})})
        res = pedir(f"https://slack.com/api/team.billableInfo?{q}", encabezados={"Authorization": f"Bearer {token}"})
        if not res.get("ok"):
            raise RuntimeError(f"Slack respondió {res.get('error')}")
        total += sum(1 for u in (res.get("billable_info") or {}).values() if u.get("billing_active"))
        cursor = (res.get("response_metadata") or {}).get("next_cursor") or ""
        if not cursor:
            return total
    raise RuntimeError("Slack devolvió demasiadas páginas")


def licencias_google_workspace() -> Optional[int]:
    """Licencias de Google Workspace asignadas (API de licencias). None si no está configurado."""
    admin = env("HERRAMIENTAS_GWS_ADMIN", False)
    dominio = env("HERRAMIENTAS_GWS_DOMINIO", False)
    credenciales = credenciales_google("HERRAMIENTAS_GWS_CREDENCIALES", "HERRAMIENTAS_GCP_CREDENCIALES")
    if not credenciales or not admin or not dominio:
        log("licencias de Google Workspace omitidas: faltan las credenciales de Google, HERRAMIENTAS_GWS_ADMIN o _DOMINIO")
        return None
    token = token_google(credenciales, "https://www.googleapis.com/auth/apps.licensing", admin)
    total, pagina = 0, ""
    for _ in range(50):
        q = urllib.parse.urlencode({"customerId": dominio, "maxResults": 1000, **({"pageToken": pagina} if pagina else {})})
        res = pedir(f"https://licensing.googleapis.com/apps/licensing/v1/product/Google-Apps/users?{q}",
                    encabezados={"Authorization": f"Bearer {token}"}) or {}
        total += len(res.get("items") or [])
        pagina = res.get("nextPageToken") or ""
        if not pagina:
            return total
    raise RuntimeError("Google devolvió demasiadas páginas")


FUENTES_LICENCIAS = {"slack": licencias_slack, "google_workspace": licencias_google_workspace}


def actualizar_licencias(sb: "Supabase", hoy) -> list:
    """Trae la cantidad de licencias de cada herramienta con fuente_licencias. Si cambió, actualiza
    licencias, el monto (licencias × precio_licencia) y los pagos pendientes que todavía no vencieron.
    Devuelve los cambios para avisar."""
    try:
        herramientas = sb.select("herramientas", {
            "select": "id,nombre,moneda,licencias,precio_licencia,monto,fuente_licencias",
            "estado": "eq.Activa", "fuente_licencias": "not.is.null",
        })
    except Exception as e:  # noqa: BLE001 — sin la columna (falta correr el SQL) no hay nada que traer
        log(f"aviso: no se pudieron revisar las licencias ({e})")
        return []
    cambios = []
    for h in herramientas:
        try:
            cantidad = FUENTES_LICENCIAS[h["fuente_licencias"]]()
            if cantidad is None:
                continue
            if cantidad <= 0:
                log(f"aviso: {h['nombre']} devolvió {cantidad} licencias; no se toca la ficha")
                continue
            datos = {"licencias_actualizadas_en": datetime.now(timezone.utc).isoformat()}
            precio = h.get("precio_licencia")
            monto = round(cantidad * float(precio), 2) if precio is not None else None
            if cantidad != h.get("licencias"):
                datos["licencias"] = cantidad
                texto = f"{h['nombre']}: de {h.get('licencias') if h.get('licencias') is not None else 'sin dato'} a {cantidad} licencias"
                if monto is not None:
                    texto += f", el próximo cobro pasa a {plata(monto, h.get('moneda'))} (estimado, sin impuestos)"
                cambios.append(texto)
            if monto is not None and (h.get("monto") is None or abs(float(h["monto"]) - monto) > 0.005):
                datos["monto"] = monto
                sb.patch("herramientas_pagos", {"herramienta_id": f"eq.{h['id']}", "estado": "eq.Pendiente",
                                                "fecha_vencimiento": f"gte.{hoy.isoformat()}"}, {"monto": monto})
            sb.patch("herramientas", {"id": f"eq.{h['id']}"}, datos)
            log(f"licencias de {h['nombre']}: {cantidad}")
        except Exception as e:  # noqa: BLE001 — una herramienta que falla no frena las demás
            log(f"aviso: no se pudieron traer las licencias de {h['nombre']} ({e})")
    return cambios


def factura_a_grupo_cg(h: dict) -> bool:
    cuit = "".join(c for c in (h.get("cuit_facturado") or "") if c.isdigit())
    razon = " ".join((h.get("razon_social_facturada") or "").upper().replace(".", " ").split())
    if "GRUPO CG" not in razon:
        return False
    # GRUPO CG SAS con CUIT, o Grupo CG, INC. (EE. UU., va con la tarjeta 7825)
    return cuit == CUIT_OBJETIVO or "INC" in razon.replace(",", " ").replace(".", " ").split()


def main() -> int:
    dry = "--dry-run" in sys.argv
    # Días de anticipación del recordatorio (por defecto 2)
    dias = int(env("HERRAMIENTAS_ALERTAS_DIAS", False, "2") or 2)
    destinatarios = [d.strip() for d in env("HERRAMIENTAS_ALERTAS_DESTINATARIOS", not dry).split(",") if d.strip()]
    webhook = env("HERRAMIENTAS_ALERTAS_SLACK_WEBHOOK", False)

    sb = Supabase()
    hoy = datetime.now(ZONA_AR).date()
    # Lunes (o --resumen): agenda de la semana. Resto de los días: solo recordatorios.
    es_resumen = hoy.weekday() == 0 or "--resumen" in sys.argv

    if not dry:
        actualizar_cotizaciones(sb)
        actualizar_consumo(sb, hoy)
    cambios_licencias = [] if dry else actualizar_licencias(sb, hoy)
    saldos = saldos_por_agotarse(sb, hoy)

    # Genera los pagos que falten y marca vencidos (misma función que la pantalla)
    creados = sb.rpc("herramientas_generar_pagos", {})
    log(f"pagos generados: {creados}")

    pagos = sb.select("herramientas_pagos", {
        "select": "periodo,fecha_vencimiento,monto,moneda,estado,herramientas(nombre,url_facturacion,estado)",
        "estado": "in.(Pendiente,Vencido)",
        "order": "fecha_vencimiento.asc",
    })
    herramientas = sb.select("herramientas", {
        "select": "nombre,periodicidad,razon_social_facturada,cuit_facturado,tarjeta_ultimos4",
        "estado": "eq.Activa",
        "order": "nombre.asc",
    })

    def venc(p):
        f = p.get("fecha_vencimiento")
        return datetime.strptime(f, "%Y-%m-%d").date() if f else None

    activos = [p for p in pagos if (p.get("herramientas") or {}).get("estado") == "Activa"]
    pendientes = sorted([p for p in activos if p["estado"] == "Pendiente" and venc(p) and venc(p) >= hoy], key=venc)
    vencidos = [p for p in activos if p["estado"] == "Vencido" or (venc(p) and venc(p) < hoy)]
    fin_semana = hoy + timedelta(days=6 - hoy.weekday())
    fin_mes = (hoy.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    semana = [p for p in pendientes if venc(p) <= fin_semana]
    resto_mes = [p for p in pendientes if fin_semana < venc(p) <= fin_mes]
    recordatorio = [p for p in pendientes if venc(p) in (hoy, hoy + timedelta(days=dias))]
    sin_datos = []
    for h in herramientas:
        if h.get("periodicidad") in ("Gratis", "N/A"):
            continue
        faltas = []
        if not factura_a_grupo_cg(h):
            faltas.append(f"no factura a {RAZON_OBJETIVO}")
        if not h.get("tarjeta_ultimos4"):
            faltas.append("sin tarjeta cargada")
        if faltas:
            sin_datos.append((h["nombre"], ", ".join(faltas)))

    if es_resumen:
        hay_algo = semana or resto_mes or vencidos or sin_datos or saldos or cambios_licencias
    else:
        hay_algo = bool(recordatorio or saldos or cambios_licencias)
    if not hay_algo:
        log("sin novedades: no se envía nada")
        return 0

    # ── Texto (Slack / consola) y HTML (correo)
    def linea_pago(p):
        h = p.get("herramientas") or {}
        return f"{fecha_ar(p.get('fecha_vencimiento'))} · {h.get('nombre', '-')} · {plata(p.get('monto'), p.get('moneda'))} ({p['periodo']})"

    partes_txt, partes_html = [], []

    def seccion(titulo, filas_txt, filas_html):
        partes_txt.append(f"*{titulo}*\n" + "\n".join(f"• {f}" for f in filas_txt))
        partes_html.append(
            f"<h3 style='margin:18px 0 6px;font-size:14px'>{html.escape(titulo)}</h3>"
            "<ul style='margin:0;padding-left:18px;font-size:13px;line-height:1.6'>"
            + "".join(f"<li>{f}</li>" for f in filas_html) + "</ul>"
        )

    def enlace(p):
        h = p.get("herramientas") or {}
        txt = html.escape(linea_pago(p))
        url = h.get("url_facturacion")
        return f"{txt} · <a href='{html.escape(url)}'>ir a facturación</a>" if url else txt

    def lista(titulo, items):
        if items:
            seccion(f"{titulo} ({len(items)})", [linea_pago(p) for p in items], [enlace(p) for p in items])

    if saldos:
        seccion(f"Saldos prepago por agotarse ({len(saldos)})", saldos, [html.escape(s) for s in saldos])
    if cambios_licencias:
        seccion(f"Cambios en las licencias ({len(cambios_licencias)})", cambios_licencias,
                [html.escape(c) for c in cambios_licencias])
    if es_resumen:
        # Agenda del lunes: semana, resto del mes, vencidos y datos pendientes (ordenado por fecha)
        lista(f"Esta semana (hasta el {fin_semana:%d/%m})", semana)
        lista(f"Resto de {MESES[hoy.month - 1]}", resto_mes)
        lista("Vencidos sin pagar", vencidos)
        if sin_datos:
            seccion(f"Herramientas activas con datos pendientes ({len(sin_datos)})",
                    [f"{n}: {f}" for n, f in sin_datos], [html.escape(f"{n}: {f}") for n, f in sin_datos])
        asunto = f"Consumo herramientas · semana del {hoy:%d/%m}: {len(semana)} pagos esta semana" + (
            f", {len(vencidos)} vencidos" if vencidos else "")
        intro = f"Agenda de pagos de la semana del {hoy:%d/%m/%Y}."
    else:
        lista(f"Vencen el {(hoy + timedelta(days=dias)):%d/%m} o hoy", recordatorio)
        if recordatorio:
            asunto = f"Consumo herramientas: {len(recordatorio)} " + ("pago vence" if len(recordatorio) == 1 else "pagos vencen") + f" en {dias} días o menos"
        elif saldos:
            asunto = f"Consumo herramientas: {len(saldos)} " + ("saldo prepago por agotarse" if len(saldos) == 1 else "saldos prepago por agotarse")
        else:
            asunto = "Consumo herramientas: cambió la cantidad de licencias"
        intro = f"Recordatorio del {hoy:%d/%m/%Y}."
    texto = f"{asunto}\n\n" + "\n\n".join(partes_txt) + f"\n\nVer en Toshibase: {URL_MODULO}"
    cuerpo_html = (
        "<div style='font-family:Arial,sans-serif;color:#111'>"
        f"<p style='font-size:13px'>{intro} Administración › Consumo herramientas.</p>"
        + "".join(partes_html)
        + f"<p style='margin-top:18px;font-size:12px'><a href='{URL_MODULO}'>Abrir en Toshibase</a></p></div>"
    )

    if dry:
        log("--dry-run: no se envía nada\n" + texto)
        return 0

    resend = env("RESEND_API_KEY")
    pedir("https://api.resend.com/emails", "POST",
          {"from": REMITENTE, "to": destinatarios, "subject": asunto, "html": cuerpo_html, "text": texto},
          {"Authorization": f"Bearer {resend}", "Content-Type": "application/json"})
    log(f"correo enviado a {len(destinatarios)} destinatarios: {asunto}")

    if webhook:
        pedir(webhook, "POST", {"text": texto}, {"Content-Type": "application/json"})
        log("aviso enviado a Slack")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 — el log tiene que mostrar el error para estado-cron.sh
        log(f"ERROR {e}")
        sys.exit(1)
