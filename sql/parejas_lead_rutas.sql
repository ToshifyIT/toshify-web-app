-- sql/parejas_lead_rutas.sql
-- Parejas por recorrido en auto para cada lead nuevo (2026-11-05).
--
-- Cada lead de los últimos 7 días se procesa UNA sola vez:
--   1. Filtro gratis en línea recta: conductores activos (con o sin compañero) y
--      leads recientes ya procesados que podrían estar a 40 min o menos.
--   2. Esos se confirman con Google (Distance Matrix, recorrido en auto).
--   3. Se guardan acá los que dan 40 min o menos. El tramo medido también va a
--      mediciones_rutas, así Distribución en mapa lo usa sin volver a pagarlo.
-- Lo usa src/modules/leads/rutasLeadsService.ts.
--
-- Se puede correr más de una vez.

-- 1. Parejas encontradas (40 min o menos por calle)
CREATE TABLE IF NOT EXISTS public.parejas_lead (
  lead_id        uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tipo           text        NOT NULL CHECK (tipo IN ('conductor', 'lead')),
  -- conductores.id o leads.id, según `tipo`
  otro_id        uuid        NOT NULL,
  distancia_km   numeric(7,2) NOT NULL,
  tiempo_minutos integer     NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, tipo, otro_id)
);

-- Para leer las parejas de un lead cuando él es el "otro" (lead ↔ lead)
CREATE INDEX IF NOT EXISTS parejas_lead_otro_idx ON public.parejas_lead (otro_id) WHERE tipo = 'lead';
CREATE INDEX IF NOT EXISTS parejas_lead_creado_idx ON public.parejas_lead (creado_en);

-- 2. Leads ya procesados (o tomados por un navegador que los está procesando)
CREATE TABLE IF NOT EXISTS public.leads_rutas_procesadas (
  lead_id      uuid        PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  estado       text        NOT NULL DEFAULT 'en_proceso' CHECK (estado IN ('en_proceso', 'listo')),
  candidatos   integer,
  medidos      integer,
  parejas      integer,
  procesado_en timestamptz NOT NULL DEFAULT now()
);

-- 3. Mediciones pedidas a Google por día (hora argentina), para el tope diario
CREATE TABLE IF NOT EXISTS public.rutas_consumo_diario (
  dia       date    PRIMARY KEY,
  elementos integer NOT NULL DEFAULT 0
);

ALTER TABLE public.parejas_lead ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_rutas_procesadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rutas_consumo_diario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parejas_lead_select ON public.parejas_lead;
CREATE POLICY parejas_lead_select ON public.parejas_lead FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS parejas_lead_insert ON public.parejas_lead;
CREATE POLICY parejas_lead_insert ON public.parejas_lead FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS leads_rutas_procesadas_select ON public.leads_rutas_procesadas;
CREATE POLICY leads_rutas_procesadas_select ON public.leads_rutas_procesadas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS leads_rutas_procesadas_update ON public.leads_rutas_procesadas;
CREATE POLICY leads_rutas_procesadas_update ON public.leads_rutas_procesadas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS leads_rutas_procesadas_delete ON public.leads_rutas_procesadas;
CREATE POLICY leads_rutas_procesadas_delete ON public.leads_rutas_procesadas FOR DELETE TO authenticated USING (estado = 'en_proceso');

DROP POLICY IF EXISTS rutas_consumo_diario_select ON public.rutas_consumo_diario;
CREATE POLICY rutas_consumo_diario_select ON public.rutas_consumo_diario FOR SELECT TO authenticated USING (true);

-- Toma leads para procesar, sin que dos navegadores midan el mismo (y paguen dos
-- veces). Devuelve los que quedaron tomados: los que no tenían fila, o los que
-- quedaron "en_proceso" hace más de 30 min (pestaña cerrada a mitad de camino).
CREATE OR REPLACE FUNCTION public.tomar_leads_para_rutas(p_ids uuid[])
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO leads_rutas_procesadas AS p (lead_id, estado, procesado_en)
  SELECT unnest(p_ids), 'en_proceso', now()
  ON CONFLICT (lead_id) DO UPDATE
    SET procesado_en = now()
    WHERE p.estado = 'en_proceso' AND p.procesado_en < now() - interval '30 minutes'
  RETURNING p.lead_id;
END;
$$;

-- Reserva mediciones dentro del tope MENSUAL. Devuelve cuántas se pueden pedir
-- (0 si ya se llegó al tope). El tope vive acá y no en el navegador.
--
-- Tope mensual y no diario (2026-11-05): Google regala 10.000 elementos por mes
-- de Distance Matrix básico (se usa sin tráfico = SKU básico) y el cupo se
-- reinicia el día 1. Se usan 9.000 para dejar margen: así no se paga nada.
-- Cuando se llega, los leads siguen con la estimación en línea recta y se
-- miden el mes siguiente. Google corta el mes en hora del Pacífico; acá se
-- cuenta por mes en hora argentina, el margen cubre esa diferencia.
CREATE OR REPLACE FUNCTION public.reservar_mediciones_rutas(p_cantidad integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tope  constant integer := 9000;
  v_dia   date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_usado integer;
  v_ok    integer;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RETURN 0; END IF;
  INSERT INTO rutas_consumo_diario (dia) VALUES (v_dia) ON CONFLICT (dia) DO NOTHING;
  -- Bloquea la fila de hoy: dos navegadores a la vez no pueden pasarse del tope
  PERFORM 1 FROM rutas_consumo_diario WHERE dia = v_dia FOR UPDATE;
  SELECT coalesce(sum(elementos), 0) INTO v_usado
    FROM rutas_consumo_diario
   WHERE dia >= date_trunc('month', v_dia)::date AND dia <= v_dia;
  v_ok := greatest(0, least(p_cantidad, v_tope - v_usado));
  UPDATE rutas_consumo_diario SET elementos = elementos + v_ok WHERE dia = v_dia;
  RETURN v_ok;
END;
$$;

-- Devuelve una reserva que no se usó (por ejemplo, si Google rechazó el pedido).
CREATE OR REPLACE FUNCTION public.devolver_mediciones_rutas(p_cantidad integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Tope por llamada: una devolución es de un solo lead (como mucho unos cientos de
  -- tramos). Evita que una llamada suelta deje el contador del día en cero.
  UPDATE rutas_consumo_diario
     SET elementos = greatest(0, elementos - least(500, greatest(0, coalesce(p_cantidad, 0))))
   WHERE dia = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
$$;

GRANT EXECUTE ON FUNCTION public.tomar_leads_para_rutas(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_mediciones_rutas(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.devolver_mediciones_rutas(integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.tomar_leads_para_rutas(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reservar_mediciones_rutas(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.devolver_mediciones_rutas(integer) FROM PUBLIC, anon;
