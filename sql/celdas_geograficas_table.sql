-- sql/celdas_geograficas_table.sql
--
-- Caché de geocodificación inversa por celda geográfica (~1,1 km).
-- La usa src/modules/onboarding/distribucion-mapa-v2/celdasGeograficasService.ts
--
-- Por qué existe: Geocoding se cobra por llamada (US$5 / 1.000). Como los
-- leads y conductores se concentran en pocas zonas, muchos comparten la misma
-- celda: se le pregunta a Google una sola vez por celda y todos los demás
-- salen de acá, sin costo.
--
-- `celda` es "lat,lng" redondeado a 2 decimales (ej: '-34.60,-58.38').

create table if not exists public.celdas_geograficas (
  celda      text primary key,
  pais       text,
  provincia  text,
  ciudad     text,
  creado_en  timestamptz not null default now()
);

create index if not exists celdas_geograficas_ciudad_idx
  on public.celdas_geograficas (ciudad);

alter table public.celdas_geograficas enable row level security;

-- Lectura: cualquier usuario autenticado consulta el caché.
drop policy if exists celdas_geograficas_select on public.celdas_geograficas;
create policy celdas_geograficas_select
  on public.celdas_geograficas
  for select
  to authenticated
  using (true);

-- Escritura: solo alta. No se actualiza ni se borra desde la app
-- (el upsert usa ignoreDuplicates -> insert ... on conflict do nothing).
drop policy if exists celdas_geograficas_insert on public.celdas_geograficas;
create policy celdas_geograficas_insert
  on public.celdas_geograficas
  for insert
  to authenticated
  with check (true);
