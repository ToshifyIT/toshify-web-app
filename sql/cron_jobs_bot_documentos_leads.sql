-- Procesos automáticos: nombre y descripción del bot de documentos de leads (2026-11-24).
-- La fila la crea sola /opt/toshify-sync/estado-cron.sh a partir del crontab.
BEGIN;
UPDATE public.cron_jobs
SET nombre = 'Bot documentos de leads',
    descripcion = 'Cada 30 minutos de 08:00 a 19:30 lee con Gemini los documentos (DNI, licencia, antecedentes penales y certificado de domicilio) de las carpetas de Drive "Sellium Docs" de los leads de Buenos Aires (por teléfono). Completa solo los campos vacíos, llena la pestaña "Verificación documentos", deja una línea en Observaciones y avanza el estado (Documentos pendientes / enviados) salvo que se haya cambiado a mano. Solo lee archivos nuevos. Avisa en Slack (it-log-bots) cuando hay novedades o error.',
    updated_at = now()
WHERE id = 'b00e661c-32a2-442a-8914-9e5e6ae28cb3';
COMMIT;
