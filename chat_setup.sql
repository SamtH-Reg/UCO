-- ============================================================
--  Chat de proceso — tabla para el index.html de UCO (asistencia)
--  Proyecto Supabase: qvtztwqbbbzortkodtla  (org "josehuequen's Org")
--  Corre TODO esto en:  Dashboard -> SQL Editor -> New query -> Run
-- ============================================================

create table if not exists public.chat_mensajes (
  id         uuid primary key default gen_random_uuid(),
  autor      text        not null,
  tipo       text        not null default 'nota',   -- 'nota' | 'proceso'
  mensaje    text        not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_mensajes_created_idx
  on public.chat_mensajes (created_at);

-- Seguridad por fila: solo usuarios con sesion iniciada en el index
alter table public.chat_mensajes enable row level security;

drop policy if exists chat_sel on public.chat_mensajes;
create policy chat_sel on public.chat_mensajes
  for select to authenticated using (true);

drop policy if exists chat_ins on public.chat_mensajes;
create policy chat_ins on public.chat_mensajes
  for insert to authenticated with check (true);

drop policy if exists chat_del on public.chat_mensajes;
create policy chat_del on public.chat_mensajes
  for delete to authenticated using (true);

-- Realtime: para que los mensajes aparezcan en vivo en todas las tablets
do $$
begin
  alter publication supabase_realtime add table public.chat_mensajes;
exception
  when duplicate_object then null;  -- ya estaba agregada, sin problema
end $$;
