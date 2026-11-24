#!/usr/bin/env python3
"""
Facturas y pagos de las herramientas leídos del correo (Administración › Consumo herramientas).

Lo que tiene API sigue por API (main.py: consumo de 2Chat y Google Cloud, licencias de Slack y
Google Workspace). Este script cubre lo que ninguna API entrega: si se pagó y la factura.
Dos veces por día (crontab, 14 y 17 hs) lee las casillas configuradas (info@ y techspec@) con la API
de Gmail, SOLO LECTURA, y busca los correos de los remitentes de cada herramienta
(herramientas.remitentes_factura, sql/herramientas_facturas_correo.sql):

  · Factura o recibo  -> marca el pago del mes como Pagado (fecha del correo) y le adjunta el PDF.
                         Si el monto del correo no coincide con el del pago, no toca nada y avisa.
  · Pago rechazado    -> no toca nada; avisa ("no pudimos renovar", "problema de pago"...).
  · Otra factura del mismo mes (recarga) -> la suma al pago del mes; si no tiene un monto claro, avisa.
  · Herramienta por uso sin pago ese mes -> crea el pago como Pagado con el monto del correo.
  · Lo que no se puede cruzar seguro (sin pago del mes en una mensual, monto distinto) -> avisa.

Cada correo queda registrado en herramientas_facturas_correo y no se vuelve a procesar.
No marca correos como leídos, no los mueve ni los borra, y no lee otros remitentes.

Permiso (una sola vez por casilla, desde una computadora con navegador):
  1. Google Cloud › APIs y servicios: habilitar Gmail API y crear un "ID de cliente de OAuth"
     de tipo "App de escritorio". Copiar el ID y el secreto.
  2. python3 facturas_correo.py autorizar info@toshify.com.ar
     Abre Google, se entra CON ESA CASILLA y se acepta "Ver tus mensajes de correo". El script
     guarda el token de esa casilla en HERRAMIENTAS_GMAIL_TOKENS. Repetir con techspec@toshify.com.ar.
  3. En el servidor, el archivo de tokens (permisos 600) y las variables de env.sh.

Variables (env.sh del servidor), además de SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y RESEND_API_KEY:
  HERRAMIENTAS_GMAIL_CLIENTE_JSON    ruta al JSON del cliente de OAuth (app de escritorio) que descarga
                                     Google Cloud; o en su lugar HERRAMIENTAS_GMAIL_CLIENT_ID y _SECRET
  HERRAMIENTAS_GMAIL_TOKENS          ruta al JSON {"info@toshify.com.ar": "<refresh token>", ...}
  HERRAMIENTAS_GMAIL_DIAS            días hacia atrás que revisa (por defecto 10)
  HERRAMIENTAS_GMAIL_DESDE           fecha de instalación (AAAA-MM-DD): no toma correos anteriores, que
                                     ya están cargados a mano (si no, sumaría dos veces las recargas)
  HERRAMIENTAS_ALERTAS_DESTINATARIOS los mismos destinatarios de main.py

Uso:
  python3 facturas_correo.py                       # procesa y avisa si hay algo
  python3 facturas_correo.py --dry-run             # muestra qué haría, sin escribir ni enviar
  python3 facturas_correo.py descubrir             # remitentes con PDF de los últimos 180 días
  python3 facturas_correo.py carpetas              # registra las carpetas AAAA-MM de HERRAMIENTAS (botón Ver)
  python3 facturas_correo.py autorizar <correo>    # obtiene el token de una casilla
  python3 facturas_correo.py autorizar <correo> --drive   # además, permiso para subir a Drive

Solo usa la biblioteca estándar de Python.
"""

import base64
import html
import json
import os
import re
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional

from main import REMITENTE, URL_MODULO, ZONA_AR, Supabase, env, log, pedir, plata

GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
DRIVE = "https://www.googleapis.com/drive/v3"
# Carpeta HERRAMIENTAS de Drive (de maria.f@, compartida con la contadora): una subcarpeta AAAA-MM por mes
DRIVE_RAIZ_DEFECTO = "17-IiBh9qIWLxFRcuvFwIK-3EnnVsPO4I"
DRIVE_CUENTA_DEFECTO = "maria.f@toshify.com.ar"
CARPETA = "application/vnd.google-apps.folder"
ALCANCE = "https://www.googleapis.com/auth/gmail.readonly"
# Solo para la casilla dueña de la carpeta HERRAMIENTAS (sube las facturas a Drive)
ALCANCE_DRIVE = "https://www.googleapis.com/auth/drive"
BUCKET = "herramientas-facturas"
PUERTO_AUTORIZAR = 8765
# Diferencia aceptada entre el monto del correo y el del pago (impuestos redondeados, etc.)
TOLERANCIA = 0.02

RE_RECHAZO = re.compile(
    r"no pudimos (renovar|procesar|cobrar)|no se pudo (procesar|cobrar|renovar)|no se ha podido|problema de pago|"
    r"pago (rechazado|fallido|pendiente|atrasado)|pago est(a|á) vencido|riesgo de suspensi|evite la suspensi|"
    r"payment (failed|declined|unsuccessful|issue)|was unsuccessful|could not (process|renew)|"
    r"card (was )?declined|tarjeta rechazada|actualiz(a|á) tus datos de pago",
    re.IGNORECASE)
RE_FACTURA = re.compile(
    r"factura|invoice|receipt|recibo|comprobante|pago (realizado|recibido|exitoso)|se realiz(o|ó) con (é|e)xito|"
    r"recibimos (el|tu) pago|se recibi(o|ó) (el|tu) pago|"
    r"payment (received|successful)|thanks for your payment|gracias por tu pago",
    re.IGNORECASE)
# Montos: "US$ 105,15", "USD 20.00", "$ 33.879", "150,00 US$", "€ 9"
RE_MONTO = re.compile(
    r"(?P<pre>US\$|U\$S|USD|ARS|AR\$|EUR|€|PEN|S/|\$)\s?(?P<n1>\d[\d.,]*)|(?P<n2>\d[\d.,]*)\s?(?P<pos>US\$|U\$S|USD|ARS|EUR|€|PEN)",
    re.IGNORECASE)


# ─────────────────────────────────────────────────────
# Google: token de cada casilla
# ─────────────────────────────────────────────────────
def form_post(url: str, datos: dict) -> dict:
    req = urllib.request.Request(url, data=urllib.parse.urlencode(datos).encode(), method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"POST {url} -> HTTP {e.code}: {e.read().decode()[:300]}") from e


def cliente_oauth() -> tuple:
    """ID y secreto del cliente de OAuth: del JSON que descarga Google Cloud o de dos variables."""
    ruta = env("HERRAMIENTAS_GMAIL_CLIENTE_JSON", False)
    if ruta:
        with open(os.path.expanduser(ruta), encoding="utf-8") as f:
            datos = json.load(f)
        c = datos.get("installed") or datos.get("web") or {}
        return c["client_id"], c["client_secret"]
    return env("HERRAMIENTAS_GMAIL_CLIENT_ID"), env("HERRAMIENTAS_GMAIL_CLIENT_SECRET")


def tokens_casillas() -> dict:
    ruta = os.path.expanduser(env("HERRAMIENTAS_GMAIL_TOKENS"))
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def guardar_token(correo: str, token: str) -> str:
    """Agrega o reemplaza el token de una casilla en el archivo de tokens (permisos 600)."""
    ruta = os.path.expanduser(env("HERRAMIENTAS_GMAIL_TOKENS"))
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    datos = {}
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
    datos[correo] = token
    with open(os.open(ruta, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        json.dump(datos, f, indent=2)
    os.chmod(ruta, 0o600)
    return ruta


def acceso(refresh_token: str) -> str:
    cid, secreto = cliente_oauth()
    r = form_post("https://oauth2.googleapis.com/token", {
        "client_id": cid, "client_secret": secreto, "refresh_token": refresh_token, "grant_type": "refresh_token",
    })
    return r["access_token"]


def autorizar(correo: str, con_drive: bool = False) -> int:
    """Permiso de solo lectura del correo (y, con --drive, de Drive) para una casilla."""
    cid, secreto = cliente_oauth()
    redirect = f"http://127.0.0.1:{PUERTO_AUTORIZAR}"
    estado = secrets.token_urlsafe(16)
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": cid, "redirect_uri": redirect, "response_type": "code",
        "scope": f"{ALCANCE} {ALCANCE_DRIVE}" if con_drive else ALCANCE,
        "access_type": "offline", "prompt": "consent", "login_hint": correo, "state": estado,
    })
    recibido: dict = {}

    class Respuesta(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802 — nombre de http.server
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            recibido.update({k: v[0] for k, v in q.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("Listo: ya podés cerrar esta pestaña y volver a la terminal.".encode())

        def log_message(self, *args):
            return

    print(f"Abrí este enlace y entrá con {correo}:\n{url}\n")
    webbrowser.open(url)
    servidor = HTTPServer(("127.0.0.1", PUERTO_AUTORIZAR), Respuesta)
    while "code" not in recibido and "error" not in recibido:
        servidor.handle_request()
    if recibido.get("error") or recibido.get("state") != estado:
        print(f"No se dio el permiso: {recibido.get('error', 'respuesta inválida')}")
        return 1
    r = form_post("https://oauth2.googleapis.com/token", {
        "client_id": cid, "client_secret": secreto, "code": recibido["code"],
        "redirect_uri": redirect, "grant_type": "authorization_code",
    })
    if "refresh_token" not in r:
        print("Google no devolvió el token: revocá el acceso en la cuenta y volvé a intentar.")
        return 1
    # El token no se muestra: se guarda en el archivo de tokens (HERRAMIENTAS_GMAIL_TOKENS)
    print(f"Permiso de {correo} guardado en {guardar_token(correo, r['refresh_token'])}")
    return 0


# ─────────────────────────────────────────────────────
# Gmail
# ─────────────────────────────────────────────────────
def gmail(token: str, ruta: str, params: Optional[dict] = None):
    q = f"?{urllib.parse.urlencode(params, doseq=True)}" if params else ""
    return pedir(f"{GMAIL}/{ruta}{q}", encabezados={"Authorization": f"Bearer {token}"})


def buscar(token: str, consulta: str, maximo: int = 50) -> list:
    r = gmail(token, "messages", {"q": consulta, "maxResults": maximo}) or {}
    return [m["id"] for m in r.get("messages", [])]


def b64(datos: str) -> bytes:
    return base64.urlsafe_b64decode(datos + "=" * (-len(datos) % 4))


def partes(p: dict):
    yield p
    for h in p.get("parts", []) or []:
        yield from partes(h)


def leer_mensaje(token: str, mid: str) -> dict:
    m = gmail(token, f"messages/{mid}", {"format": "full"})
    cab = {h["name"].lower(): h["value"] for h in m["payload"].get("headers", [])}
    texto, adjuntos = [], []
    for p in partes(m["payload"]):
        nombre = p.get("filename") or ""
        cuerpo = p.get("body", {})
        if nombre.lower().endswith(".pdf") and cuerpo.get("attachmentId"):
            adjuntos.append({"nombre": nombre, "id": cuerpo["attachmentId"]})
        elif p.get("mimeType") in ("text/plain", "text/html") and cuerpo.get("data"):
            t = b64(cuerpo["data"]).decode("utf-8", "replace")
            if p["mimeType"] == "text/html":
                t = html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"(?is)<(style|script).*?</\1>", " ", t)))
            texto.append(t)
    fecha = datetime.fromtimestamp(int(m["internalDate"]) / 1000, ZONA_AR)
    return {
        "id": mid, "fecha": fecha, "remitente": cab.get("from", ""), "asunto": cab.get("subject", ""),
        "texto": re.sub(r"\s+", " ", " ".join(texto))[:20000], "adjuntos": adjuntos,
    }


def bajar_adjunto(token: str, mid: str, adjunto_id: str) -> bytes:
    r = gmail(token, f"messages/{mid}/attachments/{adjunto_id}")
    return b64(r["data"])


# ─────────────────────────────────────────────────────
# Drive: HERRAMIENTAS/<AAAA-MM>
# ─────────────────────────────────────────────────────
_drive: dict = {}


def token_drive() -> Optional[str]:
    """Token de la casilla dueña de HERRAMIENTAS (autorizada con --drive). None si no está."""
    if "token" not in _drive:
        cuenta = env("HERRAMIENTAS_DRIVE_CUENTA", False, DRIVE_CUENTA_DEFECTO)
        refresh = tokens_casillas().get(cuenta)
        _drive["token"] = acceso(refresh) if refresh else None
    return _drive["token"]


def drive_get(token: str, ruta: str, params: dict):
    q = urllib.parse.urlencode({**params, "supportsAllDrives": "true", "includeItemsFromAllDrives": "true"})
    return pedir(f"{DRIVE}/{ruta}?{q}", encabezados={"Authorization": f"Bearer {token}"})


def buscar_en_drive(token: str, padre: str, nombre: str, carpeta: bool) -> Optional[str]:
    nombre_q = nombre.replace("\\", "\\\\").replace("'", "\\'")
    tipo = f"mimeType='{CARPETA}'" if carpeta else f"mimeType!='{CARPETA}'"
    r = drive_get(token, "files", {"q": f"'{padre}' in parents and name='{nombre_q}' and {tipo} and trashed=false",
                                   "fields": "files(id)", "pageSize": 1})
    archivos = (r or {}).get("files", [])
    return archivos[0]["id"] if archivos else None


def carpeta_del_mes(sb: Supabase, token: str, periodo: str, dry: bool) -> Optional[str]:
    """ID de HERRAMIENTAS/<periodo>; la crea si no existe y la guarda para el botón Ver."""
    raiz = env("HERRAMIENTAS_DRIVE_CARPETA", False, DRIVE_RAIZ_DEFECTO)
    cid = buscar_en_drive(token, raiz, periodo, carpeta=True)
    if not cid:
        if dry:
            return None
        r = pedir(f"{DRIVE}/files?supportsAllDrives=true&fields=id", "POST",
                  {"name": periodo, "mimeType": CARPETA, "parents": [raiz]},
                  {"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        cid = r["id"]
        log(f"Drive: carpeta {periodo} creada")
    if not dry:
        sb.upsert("herramientas_drive_carpetas", "periodo",
                  [{"periodo": periodo, "carpeta_id": cid, "actualizado_en": datetime.now(timezone.utc).isoformat()}])
    return cid


def subir_a_drive(sb: Supabase, periodo: str, nombre: str, datos: bytes, dry: bool) -> Optional[str]:
    """Sube el PDF a HERRAMIENTAS/<periodo>. Si ya hay uno con ese nombre, no lo repite."""
    token = token_drive()
    if not token:
        return None
    carpeta = carpeta_del_mes(sb, token, periodo, dry)
    if not carpeta:
        return None
    if buscar_en_drive(token, carpeta, nombre, carpeta=False):
        return carpeta
    if dry:
        return carpeta
    limite = f"toshify{secrets.token_hex(8)}"
    meta = json.dumps({"name": nombre, "parents": [carpeta]}).encode()
    cuerpo = (f"--{limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".encode() + meta
              + f"\r\n--{limite}\r\nContent-Type: application/pdf\r\n\r\n".encode() + datos
              + f"\r\n--{limite}--".encode())
    req = urllib.request.Request(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id",
        data=cuerpo, method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": f"multipart/related; boundary={limite}"})
    try:
        urllib.request.urlopen(req, timeout=60).read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Drive: no se pudo subir {nombre} ({e.code}): {e.read().decode()[:200]}") from e
    log(f"Drive: {periodo}/{nombre}")
    return carpeta


def cargar_carpetas() -> int:
    """Registra las carpetas AAAA-MM que ya existen en HERRAMIENTAS (para el botón Ver)."""
    sb = Supabase()
    token = token_drive()
    if not token:
        print("Falta el permiso de Drive: python3 facturas_correo.py autorizar maria.f@toshify.com.ar --drive")
        return 1
    raiz = env("HERRAMIENTAS_DRIVE_CARPETA", False, DRIVE_RAIZ_DEFECTO)
    r = drive_get(token, "files", {"q": f"'{raiz}' in parents and mimeType='{CARPETA}' and trashed=false",
                                   "fields": "files(id,name)", "pageSize": 200})
    filas = [{"periodo": f["name"], "carpeta_id": f["id"]} for f in (r or {}).get("files", [])
             if re.fullmatch(r"\d{4}-\d{2}", f["name"])]
    if filas:
        sb.upsert("herramientas_drive_carpetas", "periodo", filas)
    print(f"{len(filas)} carpetas registradas")
    return 0


# ─────────────────────────────────────────────────────
# Cruce
# ─────────────────────────────────────────────────────
def numero(txt: str) -> Optional[float]:
    """'33.879' -> 33879, '105,15' -> 105.15, '1,234.50' -> 1234.5"""
    t = txt.strip(".,")
    if not t:
        return None
    if "," in t and "." in t:
        t = t.replace(".", "").replace(",", ".") if t.rfind(",") > t.rfind(".") else t.replace(",", "")
    elif "," in t:
        t = t.replace(",", ".") if len(t.split(",")[-1]) <= 2 else t.replace(",", "")
    elif "." in t and len(t.split(".")[-1]) == 3:
        t = t.replace(".", "")
    try:
        return float(t)
    except ValueError:
        return None


def montos(texto: str) -> list:
    """Montos con moneda que aparecen en el correo: [(monto, 'USD'|'ARS'|'EUR'|None)]."""
    out = []
    for m in RE_MONTO.finditer(texto):
        cod = (m.group("pre") or m.group("pos") or "").upper()
        n = numero(m.group("n1") or m.group("n2") or "")
        if n is None or n <= 0:
            continue
        moneda = ("USD" if cod in ("US$", "U$S", "USD") else "EUR" if cod in ("EUR", "€") else
                  "ARS" if cod in ("ARS", "AR$") else "PEN" if cod in ("PEN", "S/") else None)
        out.append((n, moneda))
    return out


def coincide(esperado, moneda_pago: Optional[str], encontrados: list) -> Optional[float]:
    """Monto del correo que coincide con el del pago (el "$" suelto vale para cualquier moneda)."""
    if esperado is None:
        return None
    e = float(esperado)
    for n, mon in encontrados:
        if mon and moneda_pago and mon != moneda_pago:
            continue
        if abs(n - e) <= max(0.5, e * TOLERANCIA):
            return n
    return None


def monto_unico(encontrados: list, moneda: Optional[str]) -> Optional[float]:
    """El monto del correo cuando hay uno solo (en la moneda de la herramienta o sin moneda)."""
    distintos = {round(n, 2) for n, mon in encontrados if not (mon and moneda and mon != moneda)}
    return distintos.pop() if len(distintos) == 1 else None


def guardar_pdf(sb: Supabase, token: str, h: dict, msg: dict, periodo: str, dry: bool) -> Optional[str]:
    """Sube el primer PDF del correo al bucket de facturas. Devuelve la ruta."""
    if not msg["adjuntos"]:
        return None
    adj = msg["adjuntos"][0]
    limpio = re.sub(r"[^\w.-]+", "_", adj["nombre"])
    ruta = f"{h['id']}/{periodo}/{int(msg['fecha'].timestamp() * 1000)}_{limpio}"
    datos = b"" if dry else bajar_adjunto(token, msg["id"], adj["id"])
    if not dry:
        subir_pdf(sb, ruta, datos)
    # Copia en Drive, en la carpeta del mes del correo (como las que se suben a mano)
    mes = f"{msg['fecha']:%Y-%m}"
    try:
        subir_a_drive(sb, mes, f"{mes} · {h['nombre']} - {adj['nombre']}", datos, dry)
    except Exception as e:  # noqa: BLE001 — si Drive falla, el PDF igual queda adjunto al pago
        log(f"aviso: {e}")
    return ruta


def periodo_de(h: dict, fecha: datetime) -> str:
    return f"{fecha:%Y}" if h.get("periodicidad") == "Anual" else f"{fecha:%Y-%m}"


def subir_pdf(sb: Supabase, ruta: str, datos: bytes) -> None:
    req = urllib.request.Request(
        f"{sb.url}/storage/v1/object/{BUCKET}/{urllib.parse.quote(ruta)}", data=datos, method="POST",
        headers={"apikey": sb.h["apikey"], "Authorization": sb.h["Authorization"],
                 "Content-Type": "application/pdf", "x-upsert": "false"})
    try:
        urllib.request.urlopen(req, timeout=60).read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"no se pudo subir el PDF ({e.code}): {e.read().decode()[:200]}") from e


def herramienta_del_correo(herramientas: list, msg: dict) -> Optional[dict]:
    correo = parseaddr(msg["remitente"])[1].lower()
    asunto = msg["asunto"].lower()
    # Primero las que filtran por asunto (ej. «2Chat – Créditos» antes que «2Chat»)
    for h in sorted(herramientas, key=lambda x: not x.get("asunto_factura")):
        # asunto_factura admite alternativas separadas por "|" (ej. "pago|renovar")
        if h.get("asunto_factura") and not any(a.strip().lower() in asunto for a in h["asunto_factura"].split("|")):
            continue
        for r in h.get("remitentes_factura") or []:
            r = r.lower().strip()
            if correo == r or correo.endswith("@" + r) or correo.endswith("." + r):
                return h
    return None


def procesar(sb: Supabase, cuenta: str, token: str, herramientas: list, dias: int, dry: bool, hechos: list,
             rechazos: dict) -> list:
    """Procesa los correos nuevos de una casilla. Devuelve los avisos; lo que se cargó solo va a `hechos`."""
    # Una búsqueda por herramienta, con el asunto incluido: los correos de un remitente compartido
    # (Stripe, Google) que no son de esa herramienta ni se abren
    desde = env("HERRAMIENTAS_GMAIL_DESDE", False)
    ids: list = []
    for h in herramientas:
        remitentes = h.get("remitentes_factura") or []
        if not remitentes:
            continue
        consulta = f"from:({' OR '.join(remitentes)}) newer_than:{dias}d"
        if h.get("asunto_factura"):
            alternativas = [a.strip() for a in h["asunto_factura"].split("|") if a.strip()]
            consulta += " subject:(" + " OR ".join(f'"{a}"' for a in alternativas) + ")"
        if desde:
            # Gmail toma "after:" como el comienzo de ese día
            consulta += f" after:{desde.replace('-', '/')}"
        ids += [i for i in buscar(token, consulta, 100) if i not in ids]
    if not ids:
        return []
    vistos = {f["mensaje_id"] for f in sb.select("herramientas_facturas_correo", {
        "select": "mensaje_id", "cuenta": f"eq.{cuenta}", "mensaje_id": f"in.({','.join(ids)})"})}
    avisos = []
    for mid in ids:
        if mid in vistos:
            continue
        msg = leer_mensaje(token, mid)
        h = herramienta_del_correo(herramientas, msg)
        if not h:
            continue
        texto = f"{msg['asunto']} {msg['texto']}"
        fila = {"cuenta": cuenta, "mensaje_id": mid, "herramienta_id": h["id"], "fecha": msg["fecha"].isoformat(),
                "remitente": parseaddr(msg["remitente"])[1], "asunto": msg["asunto"][:300]}
        cuando = f"{msg['fecha']:%d/%m}"
        # 1) Pago rechazado: solo aviso (va antes porque esos correos a veces traen la factura)
        if RE_RECHAZO.search(texto):
            fila.update(tipo="rechazo", resultado="aviso", detalle="Pago rechazado")
            # Se agrupan por herramienta al final (el mismo rechazo llega varias veces y a las dos casillas)
            r = rechazos.setdefault(h["nombre"], {"n": 0, "ultimo": msg["fecha"], "asunto": msg["asunto"]})
            r["n"] += 1
            if msg["fecha"] >= r["ultimo"]:
                r.update(ultimo=msg["fecha"], asunto=msg["asunto"])
        # 2) Factura o recibo
        elif msg["adjuntos"] or RE_FACTURA.search(msg["asunto"]):
            fila.update(_resultado_factura(sb, h, msg, token, cuenta, avisos, hechos, dry))
        else:
            fila.update(tipo="otro", resultado="ignorado")
        if dry:
            log(f"[dry-run] {cuenta} · {h['nombre']} · {cuando} · {msg['asunto'][:70]} -> {fila['resultado']}"
                + (f" ({fila.get('detalle')})" if fila.get("detalle") else ""))
        else:
            sb.upsert("herramientas_facturas_correo", "cuenta,mensaje_id", [fila])
    return avisos


def _resultado_factura(sb: Supabase, h: dict, msg: dict, token: str, cuenta: str, avisos: list, hechos: list,
                       dry: bool) -> dict:
    periodo = periodo_de(h, msg["fecha"])
    cuando = f"{msg['fecha']:%d/%m}"
    encontrados = montos(f"{msg['asunto']} {msg['texto']}")
    pagos = sb.select("herramientas_pagos", {
        "select": "id,periodo,monto,moneda,estado,fecha_pago,factura_path,observaciones",
        "herramienta_id": f"eq.{h['id']}", "periodo": f"eq.{periodo}"})
    pago = pagos[0] if pagos else None
    base = {"tipo": "factura"}

    moneda_h = h.get("moneda")
    unico = monto_unico(encontrados, (pago or {}).get("moneda") or moneda_h)

    if not pago:
        # Herramienta por uso (recargas, packs): se crea el pago del mes con el monto del correo
        if h.get("periodicidad") == "Por uso" and unico is not None:
            ruta = guardar_pdf(sb, token, h, msg, periodo, dry)
            nuevo = {"herramienta_id": h["id"], "periodo": periodo, "fecha_vencimiento": f"{msg['fecha']:%Y-%m-%d}",
                     "monto": unico, "moneda": moneda_h, "estado": "Pagado", "fecha_pago": f"{msg['fecha']:%Y-%m-%d}",
                     "pagado_en": datetime.now(timezone.utc).isoformat(), "factura_path": ruta,
                     "factura_nombre": msg["adjuntos"][0]["nombre"] if ruta else None,
                     "observaciones": f"{plata(unico, moneda_h)} ({cuando}) · cargado solo desde el correo de {cuenta}"}
            if not dry:
                sb.upsert("herramientas_pagos", "herramienta_id,periodo", [nuevo])
            hechos.append(f"{h['nombre']} {periodo}: pago de {plata(unico, moneda_h)} del {cuando} cargado.")
            return {**base, "factura_path": ruta, "monto": unico, "moneda": moneda_h, "resultado": "creado"}
        avisos.append(f"{h['nombre']}: llegó una factura el {cuando} y no hay pago de {periodo}. Cargarlo a mano.")
        return {**base, "resultado": "revisar", "detalle": f"Sin pago de {periodo}"}

    if pago["estado"] == "Pagado":
        # El mismo pago que ya está cargado (recibo del mismo monto, o anterior a la fecha de pago
        # registrada: ya se cargó a mano): solo se adjunta el PDF si faltaba
        ya_incluido = (coincide(pago.get("monto"), pago.get("moneda"), encontrados) is not None
                       or (pago.get("fecha_pago") and f"{msg['fecha']:%Y-%m-%d}" <= pago["fecha_pago"]))
        if ya_incluido or not pago.get("factura_path"):
            ruta = guardar_pdf(sb, token, h, msg, periodo, dry) if not pago.get("factura_path") else None
            if ruta and not dry:
                sb.patch("herramientas_pagos", {"id": f"eq.{pago['id']}"},
                         {"factura_path": ruta, "factura_nombre": msg["adjuntos"][0]["nombre"]})
            if ruta:
                hechos.append(f"{h['nombre']} {periodo}: factura adjuntada.")
            return {**base, "pago_id": pago["id"], "factura_path": ruta, "resultado": "adjuntada" if ruta else "ya_estaba"}

    if pago["estado"] == "Pagado" and pago.get("factura_path"):
        # Otra factura del mismo mes (recarga de créditos, cargo extra): se suma al pago del mes
        # si el correo trae un solo monto; si no, se avisa para cargarlo a mano.
        if unico is None:
            avisos.append(f"{h['nombre']}: otra factura en {periodo} ({cuando}, «{msg['asunto'][:60]}») sin un monto claro. "
                          "Sumarla a mano.")
            return {**base, "pago_id": pago["id"], "resultado": "revisar", "detalle": "Segunda factura sin monto claro"}
        ruta = guardar_pdf(sb, token, h, msg, periodo, dry)
        total = round(float(pago.get("monto") or 0) + unico, 2)
        nota = f"+ {plata(unico, pago.get('moneda'))} ({cuando}, «{msg['asunto'][:60]}»), sumado solo desde el correo"
        if not dry:
            sb.patch("herramientas_pagos", {"id": f"eq.{pago['id']}"}, {
                "monto": total,
                "observaciones": f"{pago['observaciones']} {nota}" if pago.get("observaciones") else nota})
        hechos.append(f"{h['nombre']} {periodo}: se sumó {plata(unico, pago.get('moneda'))} del {cuando}; "
                      f"el mes queda en {plata(total, pago.get('moneda'))}.")
        return {**base, "pago_id": pago["id"], "factura_path": ruta, "monto": unico, "moneda": pago.get("moneda"),
                "resultado": "sumada"}

    monto = coincide(pago.get("monto"), pago.get("moneda"), encontrados)
    if pago.get("monto") is not None and encontrados and monto is None:
        leidos = ", ".join(plata(n, m or pago.get("moneda")) for n, m in encontrados[:4])
        avisos.append(f"{h['nombre']} {periodo}: el correo del {cuando} dice {leidos} y el pago está en "
                      f"{plata(pago['monto'], pago.get('moneda'))}. No se marcó.")
        return {**base, "pago_id": pago["id"], "resultado": "revisar", "detalle": f"Montos del correo: {leidos}"}

    # Adjuntar el PDF (el primero) si el pago todavía no tiene factura
    ruta = guardar_pdf(sb, token, h, msg, periodo, dry) if not pago.get("factura_path") else None

    cambios: dict = {}
    if ruta:
        cambios.update(factura_path=ruta, factura_nombre=msg["adjuntos"][0]["nombre"])
    if pago["estado"] != "Pagado":
        nota = f"Pagado según correo del {cuando} a {cuenta}"
        cambios.update(estado="Pagado", fecha_pago=f"{msg['fecha']:%Y-%m-%d}", pagado_en=datetime.now(timezone.utc).isoformat(),
                       observaciones=(f"{pago['observaciones']} · {nota}" if pago.get("observaciones") else nota))
        if pago.get("monto") is None and monto is None and len({n for n, _ in encontrados}) == 1:
            cambios["monto"] = encontrados[0][0]
    if cambios and not dry:
        sb.patch("herramientas_pagos", {"id": f"eq.{pago['id']}"}, cambios)
    resultado = "pagado" if "estado" in cambios else "adjuntada" if ruta else "ya_estaba"
    if resultado == "pagado":
        hechos.append(f"{h['nombre']} {periodo}: marcado como pagado ({cuando})" + (" con la factura adjunta." if ruta else "."))
    elif resultado == "adjuntada":
        hechos.append(f"{h['nombre']} {periodo}: factura adjuntada.")
    return {**base, "pago_id": pago["id"], "factura_path": ruta, "monto": monto,
            "moneda": pago.get("moneda") if monto is not None else None, "resultado": resultado}


# ─────────────────────────────────────────────────────
# Modos
# ─────────────────────────────────────────────────────
def descubrir() -> int:
    """Remitentes con PDF de los últimos 180 días en cada casilla, para completar remitentes_factura."""
    for cuenta, refresh in tokens_casillas().items():
        token = acceso(refresh)
        ids = buscar(token, "has:attachment filename:pdf newer_than:180d", 300)
        cuenta_rem: dict = {}
        for mid in ids:
            m = gmail(token, f"messages/{mid}", {"format": "metadata", "metadataHeaders": ["From", "Subject"]})
            cab = {h["name"].lower(): h["value"] for h in m["payload"].get("headers", [])}
            rem = parseaddr(cab.get("from", ""))[1].lower()
            c = cuenta_rem.setdefault(rem, {"n": 0, "asunto": cab.get("subject", "")})
            c["n"] += 1
        print(f"\n{cuenta}: {len(ids)} correos con PDF")
        for rem, c in sorted(cuenta_rem.items(), key=lambda x: -x[1]["n"]):
            print(f"  {c['n']:>3}  {rem:<45} {c['asunto'][:70]}")
    return 0


def main() -> int:
    if len(sys.argv) >= 3 and sys.argv[1] == "autorizar":
        return autorizar(sys.argv[2], "--drive" in sys.argv)
    if len(sys.argv) >= 2 and sys.argv[1] == "descubrir":
        return descubrir()
    if len(sys.argv) >= 2 and sys.argv[1] == "carpetas":
        return cargar_carpetas()
    dry = "--dry-run" in sys.argv
    dias = int(env("HERRAMIENTAS_GMAIL_DIAS", False, "10") or 10)
    sb = Supabase()
    herramientas = sb.select("herramientas", {
        "select": "id,nombre,periodicidad,moneda,remitentes_factura,asunto_factura",
        "estado": "eq.Activa", "remitentes_factura": "not.is.null"})
    avisos, hechos, rechazos = [], [], {}
    for cuenta, refresh in tokens_casillas().items():
        try:
            avisos += procesar(sb, cuenta, acceso(refresh), herramientas, dias, dry, hechos, rechazos)
        except Exception as e:  # noqa: BLE001 — una casilla que falla no frena la otra
            log(f"aviso: no se pudo leer {cuenta} ({e})")
            avisos.append(f"No se pudo leer {cuenta}: revisar el permiso ({str(e)[:120]}).")
    for nombre, r in sorted(rechazos.items()):
        veces = f" ({r['n']} avisos)" if r["n"] > 1 else ""
        avisos.insert(0, f"{nombre}: no se pudo cobrar{veces}, el último el {r['ultimo']:%d/%m} "
                         f"(«{r['asunto'][:70]}»). Revisar la tarjeta.")
    log(f"facturas por correo: {len(hechos)} cargadas solas, {len(avisos)} para revisar")
    if not avisos and not hechos:
        return 0
    asunto = "Consumo herramientas: " + ", ".join(x for x in [
        f"{len(hechos)} " + ("pago cargado" if len(hechos) == 1 else "pagos cargados") if hechos else "",
        f"{len(avisos)} para revisar" if avisos else ""] if x)
    secciones = [("Se cargó solo", hechos), ("Para revisar", avisos)]
    texto = f"{asunto}\n\n" + "\n\n".join(f"*{t}*\n" + "\n".join(f"• {a}" for a in l) for t, l in secciones if l) \
        + f"\n\nVer en Toshibase: {URL_MODULO}"
    if dry:
        log("--dry-run: no se envía nada\n" + texto)
        return 0
    destinatarios = [d.strip() for d in env("HERRAMIENTAS_ALERTAS_DESTINATARIOS").split(",") if d.strip()]
    cuerpo = ("<div style='font-family:Arial,sans-serif;color:#111;font-size:13px'>"
              "<p>Facturas y pagos leídos del correo (info@ y techspec@).</p>"
              + "".join(f"<h3 style='font-size:14px;margin:14px 0 6px'>{t}</h3><ul>"
                        + "".join(f"<li>{html.escape(a)}</li>" for a in l) + "</ul>" for t, l in secciones if l)
              + f"<p><a href='{URL_MODULO}'>Abrir en Toshibase</a></p></div>")
    pedir("https://api.resend.com/emails", "POST",
          {"from": REMITENTE, "to": destinatarios, "subject": asunto, "html": cuerpo, "text": texto},
          {"Authorization": f"Bearer {env('RESEND_API_KEY')}", "Content-Type": "application/json"})
    log(f"correo enviado a {len(destinatarios)} destinatarios: {asunto}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 — el log tiene que mostrar el error para estado-cron.sh
        log(f"ERROR {e}")
        sys.exit(1)
