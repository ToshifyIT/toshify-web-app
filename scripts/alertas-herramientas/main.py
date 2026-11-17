#!/usr/bin/env python3
"""
Alertas de Consumo herramientas (Administración › Consumo herramientas).

Ejecución diaria desde el crontab del servidor (toshify-sync). Avisa por correo
(Resend) y, si está configurado, por Slack:
  0) actualiza las cotizaciones del día (ARS / EUR / PEN contra USD),
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

Uso:
  python3 main.py              # ejecución normal
  python3 main.py --dry-run    # muestra el aviso sin enviar nada
  python3 main.py --resumen    # fuerza la agenda semanal (aunque no sea lunes)

Solo usa la biblioteca estándar de Python (no hace falta instalar nada).
No lee ni guarda contraseñas ni datos de tarjetas (solo los últimos 4 dígitos).
"""

import html
import json
import os
import sys
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
        hay_algo = semana or resto_mes or vencidos or sin_datos
    else:
        hay_algo = bool(recordatorio)
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
        asunto = f"Consumo herramientas: {len(recordatorio)} " + ("pago vence" if len(recordatorio) == 1 else "pagos vencen") + f" en {dias} días o menos"
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
