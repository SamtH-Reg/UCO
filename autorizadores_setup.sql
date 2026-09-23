-- ============================================================
--  Autorizadores (responsables / jefatura directa) — permisos.html
--  Proyecto Supabase: qvtztwqbbbzortkodtla
--  Corre en: Dashboard -> SQL Editor -> New query -> Run
--
--  Lista editable de responsables que autorizan permisos. Se
--  gestiona desde la app (boton "Gestionar responsables").
-- ============================================================

create table if not exists public.autorizadores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists autorizadores_activo_idx on public.autorizadores (activo);

alter table public.autorizadores enable row level security;

drop policy if exists aut_sel on public.autorizadores;
create policy aut_sel on public.autorizadores
  for select to authenticated using (true);

drop policy if exists aut_ins on public.autorizadores;
create policy aut_ins on public.autorizadores
  for insert to authenticated with check (true);

drop policy if exists aut_upd on public.autorizadores;
create policy aut_upd on public.autorizadores
  for update to authenticated using (true);

drop policy if exists aut_del on public.autorizadores;
create policy aut_del on public.autorizadores
  for delete to authenticated using (true);
