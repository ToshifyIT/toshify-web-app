-- Diagnóstico (solo lectura, 2026-11-25): por qué toda la base anda lenta.
-- No modifica nada. Correr y copiar el resultado de cada parte.

-- 1. ¿Realtime está atrasado? Historial de cambios retenido por cada slot de replicación
SELECT slot_name, active,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retenido
FROM pg_replication_slots;

-- 2. Qué tablas transmite Realtime
SELECT pubname, schemaname, tablename FROM pg_publication_tables ORDER BY 1, 3;

-- 3. Cuánto se escribe en las tablas más movidas desde el último reinicio
SELECT relname, n_tup_upd AS actualizaciones, n_tup_ins AS altas, n_dead_tup AS filas_muertas,
       last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_tup_upd + n_tup_ins DESC
LIMIT 8;

-- 4. Las consultas que más tiempo total consumen (si pg_stat_statements está instalado;
--    si da error, ignorar esta parte)
SELECT round(total_exec_time / 1000) AS segundos_total, calls AS llamadas,
       round(mean_exec_time) AS ms_promedio,
       left(regexp_replace(query, '\s+', ' ', 'g'), 160) AS consulta
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
