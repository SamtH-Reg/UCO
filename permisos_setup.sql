-- ============================================================
--  Sistema de Permisos — tablas para permisos.html de UCO
--  Proyecto Supabase: qvtztwqbbbzortkodtla  (org "josehuequen's Org")
--  Corre TODO esto en:  Dashboard -> SQL Editor -> New query -> Run
--
--  Modelo unificado: solicitudes_permiso cubre los 3 tipos
--    tipo = 'COMPLETO' | 'MEDIA_JORNADA' | 'VACACIONES'
-- ============================================================

-- ── 1. Solicitudes de permiso ─────────────────────────────────
create table if not exists public.solicitudes_permiso (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null,                      -- COMPLETO | MEDIA_JORNADA | VACACIONES
  estado         text not null default 'PENDIENTE',   -- PENDIENTE | APROBADO | RECHAZADO | ANULADO

  -- Empleado (se guarda copia del dato para conservar historial)
  codigo         text,
  nombre         text,
  centro_costo   text,

  -- Datos comunes día completo / media jornada
  turno          text,                                -- DIA | TARDE | NOCHE
  tipo_permiso   text,                                -- PERSONAL | MEDICO | JUDICIAL
  autorizador    text,
  autorizador_sub text,

  -- Fechas de permiso / inicio de vacaciones
  inicio         date,
  termino        date,
  dias_habiles   integer,

  -- Media jornada: regreso y horas
  tipo_regreso   text,                                -- CON | SIN | INGRESO
  hora_salida    time,
  hora_ingreso   time,
  horas_permiso  numeric(6,2),

  -- Adjunto / comentario
  archivo        text,
  comentario     text,

  -- Quién creó la solicitud y metadatos
  creado_por     uuid,
  creado_por_email text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists solicitudes_permiso_tipo_idx  on public.solicitudes_permiso (tipo);
create index if not exists solicitudes_permiso_estado_idx on public.solicitudes_permiso (estado);
create index if not exists solicitudes_permiso_codigo_idx on public.solicitudes_permiso (codigo);
create index if not exists solicitudes_permiso_inicio_idx on public.solicitudes_permiso (inicio);

-- ── 2. Auditoría de cupos por día (para tope de permisos personales) ──
--   Útil para validar cupos sin recalcular sobre toda la tabla.
--   Se alimenta con un trigger o puede calcularse on-the-fly; se deja
--   como vista de conveniencia.
create or replace view public.vista_cupos_permiso as
select
  to_char(inicio, 'YYYY-MM-DD') as fecha,
  count(*) filter (where tipo_permiso = 'PERSONAL') as personales,
  count(*) as total
from public.solicitudes_permiso
where estado in ('PENDIENTE','APROBADO')
  and tipo in ('COMPLETO','MEDIA_JORNADA')
group by inicio;

-- ── 3. Seguridad por fila ────────────────────────────────────
alter table public.solicitudes_permiso enable row level security;

drop policy if exists sp_sel on public.solicitudes_permiso;
create policy sp_sel on public.solicitudes_permiso
  for select to authenticated using (true);

drop policy if exists sp_ins on public.solicitudes_permiso;
create policy sp_ins on public.solicitudes_permiso
  for insert to authenticated with check (true);

drop policy if exists sp_upd on public.solicitudes_permiso;
create policy sp_upd on public.solicitudes_permiso
  for update to authenticated using (true);

drop policy if exists sp_del on public.solicitudes_permiso;
create policy sp_del on public.solicitudes_permiso
  for delete to authenticated using (true);

-- ── 4. Realtime: para ver nuevas solicitudes en vivo ─────────
do $$
begin
  alter publication supabase_realtime add table public.solicitudes_permiso;
exception
  when duplicate_object then null;  -- ya estaba agregada, sin problema
end $$;

-- ── 5. MIGRACIÓN: permisos existentes (tabla simple) ───────────
--   Lleva los registros de la tabla "permisos" (codigo, nombre, fecha, tipo)
--   hacia solicitudes_permiso como tipo='COMPLETO', conservando historial.
--   Idempotente: no duplica si ya se ejecutó (misma codigo+fecha+tipo).
insert into public.solicitudes_permiso
  (tipo, estado, codigo, nombre, inicio, tipo_permiso, creado_por_email, created_at)
select
  'COMPLETO',
  'APROBADO',
  p.codigo,
  p.nombre,
  p.fecha::date,
  case
    when lower(p.tipo) like '%m%edico%'    then 'MEDICO'
    when lower(p.tipo) like '%personal%'   then 'PERSONAL'
    when lower(p.tipo) like '%judicial%'   then 'JUDICIAL'
    else 'PERSONAL'
  end,
  null,
  coalesce(p.updated_at, now())
from public.permisos p
where p.fecha is not null
  and p.fecha ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'   -- solo fechas con formato válido
  and not exists (
    select 1 from public.solicitudes_permiso sp
    where sp.codigo = p.codigo
      and sp.inicio = p.fecha::date
      and sp.tipo = 'COMPLETO'
      and sp.tipo_permiso = case
        when lower(p.tipo) like '%m%edico%'    then 'MEDICO'
        when lower(p.tipo) like '%personal%'   then 'PERSONAL'
        when lower(p.tipo) like '%judicial%'   then 'JUDICIAL'
        else 'PERSONAL'
      end
  );
