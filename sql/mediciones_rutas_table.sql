-- sql/mediciones_rutas_table.sql
--
-- Caché persistente de mediciones de Distance Matrix.
-- La usa src/modules/onboarding/distribucion-mapa-v2/medicionesCacheService.ts
--
-- Por qué existe: Distance Matrix se cobra por elemento (US$5 / 1.000).
-- Se pide sin `drivingOptions`, así que el tiempo devuelto es el típico y no
-- depende del momento de la consulta: el mismo tramo siempre da lo mismo y
-- por eso se puede guardar y reusar.
--
-- `clave` es el par de coordenadas redondeado a 3 decimales (~110 m) y
-- ordenado de forma simétrica, para que A->B y B->A compartan fila.
-- La vigencia (6 meses) se aplica en el código con un filtro sobre creado_en.

create table if not exists public.mediciones_rutas (
  clave          text primary key,
  distancia_km   numeric(7,2) not null,
  tiempo_minutos integer      not null,
  creado_en      timestamptz  not null default now()
);

create index if not exists mediciones_rutas_creado_en_idx
  on public.mediciones_rutas (creado_en);

alter table public.mediciones_rutas enable row level security;

drop policy if exists mediciones_rutas_select on public.mediciones_rutas;
create policy mediciones_rutas_select
  on public.mediciones_rutas
  for select
  to authenticated
  using (true);

drop policy if exists mediciones_rutas_insert on public.mediciones_rutas;
create policy mediciones_rutas_insert
  on public.mediciones_rutas
  for insert
  to authenticated
  with check (true);
