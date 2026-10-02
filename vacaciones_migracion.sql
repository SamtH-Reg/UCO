-- ============================================================
--  Migracion: tabla `vacaciones` (origen formulario Google Sheets)
--             -> `solicitudes_permiso` (gestion autonoma en la app)
--  Proyecto Supabase: qvtztwqbbbzortkodtla
--  Corre en: Dashboard -> SQL Editor -> New query -> Run
--
--  - NO borra la tabla `vacaciones`: los datos originales se conservan.
--  - Idempotente: evita duplicar por codigo + solapamiento de fechas.
--  - Marca el origen con comentario = 'Migrado desde vacaciones (Google)'.
--
--  Ejecuta esto ANTES de dejar de leer la tabla en la app.
-- ============================================================

insert into public.solicitudes_permiso
  (tipo, estado, codigo, nombre, inicio, termino, dias_habiles, tipo_dias, comentario)
select
  'VACACIONES',
  'APROBADO',
  v.codigo,
  v.nombre,
  v.fecha_inicio::date,
  v.fecha_fin::date,
  null,                       -- los dias habiles se calculan en la app (rango)
  'BASE',
  'Migrado desde vacaciones (Google)'
from public.vacaciones v
where v.codigo is not null
  and v.fecha_inicio is not null
  and coalesce(upper(v.estado),'') not in ('ANULADO','RECHAZADO')
  and not exists (
    select 1
    from public.solicitudes_permiso sp
    where sp.tipo = 'VACACIONES'
      and sp.codigo = v.codigo
      and sp.inicio <= coalesce(v.fecha_fin::date, v.fecha_inicio::date)
      and coalesce(sp.termino, sp.inicio) >= v.fecha_inicio::date
  );
