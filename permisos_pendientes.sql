-- ============================================================
--  Sistema de Permisos — PASO 6: pendientes (post-migración)
--  Proyecto Supabase: qvtztwqbbbzortkodtla  (org "josehuequen's Org")
--  Corre en: Dashboard -> SQL Editor -> New query -> Run
--
--  1) Rellenar centro_costo y turno de los permisos migrados
--     (la tabla simple "permisos" no tenía esos campos, así que
--      vinieron vacíos; aquí se completan desde "empleados").
--  2) Crear un usuario ADMINISTRADOR para poder iniciar sesión
--     (la tabla "usuarios" está vacía, por lo que hoy nadie
--      puede autenticarse en permisos.html).
-- ============================================================

-- ── 1. Completar centro_costo y turno desde empleados ──────
--     Vincula por codigo; solo actualiza donde falta el dato.
update public.solicitudes_permiso sp
set centro_costo = e.centro_costo,
    turno        = case
                     when upper(e.turno) like '%TARDE%'  then 'TARDE'
                     when upper(e.turno) like '%NOCHE%'  then 'NOCHE'
                     else 'DIA'
                   end
from public.empleados e
where sp.codigo = e.codigo
  and (sp.centro_costo is null or sp.centro_costo = '');

-- Verificar cuántos quedaron con centro_costo tras el update
select
  count(*) filter (where centro_costo is not null and centro_costo <> '') as con_centro,
  count(*) filter (where centro_costo is null or centro_costo = '')        as sin_centro,
  count(*)                                                                 as total
from public.solicitudes_permiso;

-- ── 2. Usuario administrador (usa un email y clave de prueba) ──
--     CAMBIA el email y la clave antes de ejecutar.
--     El id se genera y se inserta la fila en "usuarios" para
--     respetar el esquema de login de index/admin/permisos.
insert into public.usuarios (id, email, nombre, rol, activo)
select
  u.id,
  u.email,
  coalesce(nullif(raw_user_meta_data->>'nombre',''), split_part(u.email,'@',1)) as nombre,
  'admin',
  true
from auth.users u
where u.email = 'admin@friosur.cl'   -- ← CAMBIA el email si quieres
  and not exists (select 1 from public.usuarios us where us.email = u.email);
