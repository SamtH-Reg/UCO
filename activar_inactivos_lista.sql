-- ═══════════════════════════════════════════════════════════════════════════
--  Reactivar a las personas del listado (coincidencias del cruce con inactivos)
--  25 personas. M5358 (VARGAS TARUMAN MARIA EDUVINA) queda FUERA a propósito:
--  entró solo por parecido con "Marta Vargas"; la correcta es M7860 (MARTA PASCUALA).
--  Las que ya estaban activas no se tocan.
--  Pegar en el SQL Editor de Supabase y ejecutar (primero el SELECT, después el UPDATE).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Ver cómo están ANTES (deben salir las 25 con activo = false)
select codigo, nombre, centro_costo, turno, activo
from empleados
where codigo in ('M0180','M0843','M0890','M1044','M1070','M1071','M2284','M3104','M3270','M3287',
                 'M3809','M4126','M5783','M6024','M6310','M6460','M7386','M7574','M7788','M7791',
                 'M7860','M8391','M9001','M9813','M9934')
order by codigo;

-- 2) Reactivar (activo = true y se limpian licencias previas). El turno de cada uno se mantiene.
update empleados
   set activo = true,
       licencia_inicio = null,
       licencia_fin = null
 where codigo in ('M0180','M0843','M0890','M1044','M1070','M1071','M2284','M3104','M3270','M3287',
                  'M3809','M4126','M5783','M6024','M6310','M6460','M7386','M7574','M7788','M7791',
                  'M7860','M8391','M9001','M9813','M9934')
   and coalesce(activo, false) = false;

-- 3) Verificar DESPUÉS (deben quedar 25 filas con activo = true)
select codigo, nombre, centro_costo, turno, activo
from empleados
where codigo in ('M0180','M0843','M0890','M1044','M1070','M1071','M2284','M3104','M3270','M3287',
                 'M3809','M4126','M5783','M6024','M6310','M6460','M7386','M7574','M7788','M7791',
                 'M7860','M8391','M9001','M9813','M9934')
order by codigo;

-- Si además quieres reactivar a M5358 (VARGAS TARUMAN MARIA EDUVINA), agrégalo a las dos listas
-- del UPDATE y del SELECT de verificación.
