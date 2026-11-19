-- sql/conductores_seguimiento_resumen.sql
-- Resumen de seguimiento de cada conductor (2026-11-19).
--
-- Gemini lee la Bitácora de seguimiento (notas de conductores_notas_cobranza + llamadas
-- de 2Chat desde su primera asignación) y deja:
--   · resumen: 2 o 3 oraciones sobre cómo es tratar con el conductor: comunicación, trato,
--     si es fácil coordinar y cumple, de qué se queja y cómo reacciona a la cobranza;
--   · nivel: 'bueno' | 'regular' | 'malo' (cómo viene el seguimiento: responde, cumple
--     lo que promete, paga lo acordado…);
--   · motivo: por qué ese nivel.
-- El nivel es el factor «Seguimiento» (5%) de la calificación de estrellas
-- (calificacionConductor.ts): bueno = 1, regular = 0,5, malo = 0.
--
-- Lo genera el servidor (server-2chat.js, con la service role) al abrir la pestaña
-- Seguimiento y en la actualización automática de cada hora. Se rehace solo si
-- cambió la bitácora (cantidad de entradas o la última).
--
-- Se puede correr más de una vez.

BEGIN;

CREATE TABLE IF NOT EXISTS public.conductores_seguimiento_resumen (
  conductor_id   uuid        PRIMARY KEY REFERENCES public.conductores(id) ON DELETE CASCADE,
  resumen        text        NOT NULL,
  nivel          text        NOT NULL CHECK (nivel IN ('bueno', 'regular', 'malo')),
  motivo         text,
  -- Con qué se generó: si cambian, se vuelve a generar
  entradas       integer     NOT NULL DEFAULT 0,
  ultima_entrada timestamptz,
  generado_en    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.conductores_seguimiento_resumen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conductores_seguimiento_resumen_select ON public.conductores_seguimiento_resumen;
CREATE POLICY conductores_seguimiento_resumen_select ON public.conductores_seguimiento_resumen
  FOR SELECT TO authenticated USING (true);

COMMIT;

NOTIFY pgrst, 'reload schema';
