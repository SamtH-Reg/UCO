-- ============================================================
--  Unidades Excluidas — admin.html
--  Proyecto Supabase: qvtztwqbbbzortkodtla  (org "josehuequen's Org")
--  Corre en: Dashboard -> SQL Editor -> New query -> Run
--
--  Empleados cuyos centros de costo NO deben entrar a la lista
--  maestra "empleados" (ni al control de ausencias). Al importar
--  se mueven a esta tabla y se muestran en la pestaña
--  "Unidades Excluidas" del panel de administración.
-- ============================================================

create table if not exists public.unidades_excluidas (
  id           uuid primary key default gen_random_uuid(),
  codigo       text,
  nombre       text,
  centro_costo text,
  contrato     text,
  turno        text,
  created_at   timestamptz not null default now()
);

create index if not exists unidades_excluidas_codigo_idx on public.unidades_excluidas (codigo);
create index if not exists unidades_excluidas_cc_idx     on public.unidades_excluidas (centro_costo);

-- Seguridad por fila
alter table public.unidades_excluidas enable row level security;

drop policy if exists ue_sel on public.unidades_excluidas;
create policy ue_sel on public.unidades_excluidas
  for select to authenticated using (true);

drop policy if exists ue_ins on public.unidades_excluidas;
create policy ue_ins on public.unidades_excluidas
  for insert to authenticated with check (true);

drop policy if exists ue_del on public.unidades_excluidas;
create policy ue_del on public.unidades_excluidas
  for delete to authenticated using (true);
