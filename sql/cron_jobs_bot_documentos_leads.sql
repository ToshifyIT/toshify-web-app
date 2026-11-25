-- Procesos automáticos: nombre y descripción del bot de documentos de leads (2026-11-24; descripción actualizada 2026-11-25).
-- La fila la crea sola /opt/toshify-sync/estado-cron.sh a partir del crontab.
BEGIN;
UPDATE public.cron_jobs
SET nombre = 'Bot documentos de leads',
    descripcion = 'Cada 30 minutos de 08:00 a 19:30 lee los documentos (DNI, licencia, antecedentes penales y certificado de domicilio) de las carpetas de Drive "Sellium Docs" de los leads de Buenos Aires (por teléfono). Lee primero con Python (sin costo) y usa Gemini solo cuando Python no alcanza, con presupuesto de USD 18 por mes repartido por día; sin saldo sigue solo con Python y lo pendiente queda para cuando haya saldo. Completa solo los campos vacíos, llena la pestaña "Verificación documentos", deja una línea en Observaciones y avanza el estado (Documentos pendientes / enviados) salvo que se haya cambiado a mano. Cada archivo leído queda en leads_documentos_lecturas y no se vuelve a leer. Avisa en Slack (it-log-bots) cuando hay novedades o error.',
    updated_at = now()
WHERE id = 'b00e661c-32a2-442a-8914-9e5e6ae28cb3';
COMMIT;
