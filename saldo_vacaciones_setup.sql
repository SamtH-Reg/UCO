-- ============================================================
--  Saldos de vacaciones: base / progresivo / sindicales
--  Proyecto Supabase: qvtztwqbbbzortkodtla
--  Corre en: Dashboard -> SQL Editor -> New query -> Run
--
--  - dias_progresivos / dias_sindicales: valores negociables por
--    trabajador (si son NULL se calculan por ley/referencia).
--  - tipo_dias: de qué bolsa se descuenta cada solicitud de
--    vacaciones (BASE / PROGRESIVO / SINDICAL).
-- ============================================================

alter table public.empleados           add column if not exists dias_progresivos integer;
alter table public.empleados           add column if not exists dias_sindicales  integer;
alter table public.unidades_excluidas  add column if not exists dias_progresivos integer;
alter table public.unidades_excluidas  add column if not exists dias_sindicales  integer;
alter table public.solicitudes_permiso add column if not exists tipo_dias        text;
