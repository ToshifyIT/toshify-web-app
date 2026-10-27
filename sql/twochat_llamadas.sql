-- =====================================================
-- Integración 2Chat: historial de llamadas guardado en la base
-- =====================================================
-- La pestaña Llamadas (Integraciones > 2Chat) lee de esta tabla en vez de pedir
-- todo el historial a 2Chat cada vez. En cada consulta el servidor
-- (server-2chat.js) trae de 2Chat solo las llamadas nuevas y las guarda acá ya
-- cruzadas con su conductor o lead.
--
-- La primera vez trae todo el historial (puede tardar). Después solo lo nuevo.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Requiere sql/twochat_integracion.sql (submenú y tabla de contactos).

BEGIN;

CREATE TABLE IF NOT EXISTS twochat_llamadas (
  -- uuid del CDR en 2Chat: identifica la llamada y evita duplicados
  uuid TEXT PRIMARY KEY,
  fecha TIMESTAMPTZ NOT NULL,
  -- 'saliente' | 'entrante'
  direccion TEXT NOT NULL,
  agente_id TEXT,
  agente TEXT,
  numero TEXT,
  -- Últimos 10 dígitos del número, para cruzar con conductores y leads
  numero_clave TEXT,
  status_2chat TEXT,
  -- 'atendida' | 'no_atendida' | 'ocupado' | 'cancelada' | 'fallida'
  resultado TEXT NOT NULL,
  duracion INTEGER NOT NULL DEFAULT 0,
  por_whatsapp BOOLEAN NOT NULL DEFAULT false,
  costo_usd NUMERIC(12, 4) NOT NULL DEFAULT 0,
  grabacion TEXT,
  -- Cruce por teléfono: primero conductor, si no hay, lead
  conductor_id UUID REFERENCES conductores(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  sincronizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_twochat_llamadas_fecha ON twochat_llamadas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_twochat_llamadas_numero_clave ON twochat_llamadas(numero_clave);
CREATE INDEX IF NOT EXISTS idx_twochat_llamadas_conductor ON twochat_llamadas(conductor_id);
CREATE INDEX IF NOT EXISTS idx_twochat_llamadas_lead ON twochat_llamadas(lead_id);

ALTER TABLE twochat_llamadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "twochat_llamadas_select_autenticados" ON twochat_llamadas;
CREATE POLICY "twochat_llamadas_select_autenticados"
  ON twochat_llamadas FOR SELECT
  TO authenticated
  USING (true);

-- Sin políticas de escritura: solo la service role (servidor) escribe.

COMMIT;

-- Que la API de Supabase (PostgREST) vea la tabla nueva sin reiniciar
NOTIFY pgrst, 'reload schema';
