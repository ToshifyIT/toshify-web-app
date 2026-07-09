-- ============================================================================
-- Módulo "Prompt - Chatbot" (Administración, solo rol admin)
--  1. Submenú en Administración
--  2. Permiso solo para el rol admin
--  3. Tabla de historial de cambios (ediciones y restauraciones)
--  4. RLS del historial
-- Idempotente: se puede correr más de una vez sin duplicar.
-- ============================================================================

-- 1) Submenú "Prompt - Chatbot" dentro del menú Administración
insert into public.submenus (menu_id, parent_id, name, label, route, order_index, level, is_active)
select 'ff4eb347-b2e1-46ac-8321-28fd31495f1b',  -- menú Administración
       null, 'prompt-chatbot', 'Prompt - Chatbot',
       '/administracion/prompt-chatbot', 3, 1, true
where not exists (select 1 from public.submenus where name = 'prompt-chatbot');

-- 2) Permiso: SOLO el rol admin puede ver/editar este submenú
insert into public.role_submenu_permissions (role_id, submenu_id, can_view, can_create, can_edit, can_delete)
select '0eea6ce8-cf07-47c9-82c0-8f0672446b27',  -- rol admin
       (select id from public.submenus where name = 'prompt-chatbot'),
       true, false, true, false
where not exists (
  select 1 from public.role_submenu_permissions
  where role_id = '0eea6ce8-cf07-47c9-82c0-8f0672446b27'
    and submenu_id = (select id from public.submenus where name = 'prompt-chatbot')
);

-- 3) Tabla de historial de cambios del prompt
--    Cada edición y cada restauración deja una fila. Se guarda el texto completo
--    (anterior y nuevo) para poder ver y restaurar cualquier versión.
create table if not exists public.mynos_prompts_historial (
  id               bigserial primary key,
  prompt_id        bigint not null references public.mynos_prompts(id) on delete cascade,
  tipo_evento      text   not null default 'edicion',   -- 'edicion' | 'restauracion'
  prompt_anterior  text,
  prompt_nuevo     text   not null,
  restaurado_de_id bigint references public.mynos_prompts_historial(id), -- si es restauración, de qué versión
  usuario_id       uuid,
  usuario_nombre   text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_mynos_prompts_historial_prompt
  on public.mynos_prompts_historial (prompt_id, created_at desc);

-- 4) RLS del historial: lectura e inserción para usuarios autenticados
alter table public.mynos_prompts_historial enable row level security;

drop policy if exists "hist_prompt_select" on public.mynos_prompts_historial;
create policy "hist_prompt_select" on public.mynos_prompts_historial
  for select to authenticated using (true);

drop policy if exists "hist_prompt_insert" on public.mynos_prompts_historial;
create policy "hist_prompt_insert" on public.mynos_prompts_historial
  for insert to authenticated with check (true);

-- ============================================================================
-- 5) (OPCIONAL) Solo si al guardar el prompt falla por RLS.
--    Corré este bloque únicamente si la edición del prompt da error de permisos.
-- ============================================================================
-- alter table public.mynos_prompts enable row level security;
-- drop policy if exists "mynos_prompts_select" on public.mynos_prompts;
-- create policy "mynos_prompts_select" on public.mynos_prompts
--   for select to authenticated using (true);
-- drop policy if exists "mynos_prompts_update" on public.mynos_prompts;
-- create policy "mynos_prompts_update" on public.mynos_prompts
--   for update to authenticated using (true) with check (true);
