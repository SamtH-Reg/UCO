/* ============================================================================
   importar_media_jornada.js — planilla auxiliar (media jornada) → Supabase

   Uso:  node importar_media_jornada.js "<planilla auxiliar.csv>" [salida.sql]

   Genera el SQL que inserta los permisos de MEDIA JORNADA en
   public.solicitudes_permiso. Es IDEMPOTENTE: usa `where not exists` con la clave
   (código + fecha + hora de salida), así que se puede correr las veces que haga
   falta y sólo agrega los que faltan.

   Mapeos (según lo que ya usa permisos.html):
     CODIGO NOMBRE  -> código (primer token) + nombre
     DIA PERMISO    -> inicio            (acepta 26-12-2025 y 2025-12-26)
     REGRESO        -> CON REGRESO = CON · SIN REGRESO = SIN · INGRESO A PLANTA = INGRESO
                       (en SIN la hora de ingreso queda nula, como en la app)
     SIN TRABAJO    -> horas_permiso     (la columna "SIN TRABAJO" del sheet)
     AUTORIZA       -> autorizador
     centro_costo   -> nulo: lo completa la app con el centro de costo del empleado
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const entrada = args[0];
const salida = args[1] || 'media_jornada_import_auxiliar.sql';
if (!entrada) { console.error('Uso: node importar_media_jornada.js <planilla.csv> [salida.sql]'); process.exit(1); }

// ── CSV: cada fila viene entera entre comillas y los decimales con comillas dobles ──
function parsearLinea(l){
  let s = l;
  if(s.charCodeAt(0) === 34 && s.charCodeAt(s.length-1) === 34) s = s.slice(1,-1);
  s = s.replace(/""/g, '"');
  const out=[]; let campo='', q=false;
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(q){ if(c==='"'){ if(s[i+1]==='"'){ campo+='"'; i++; } else q=false; } else campo+=c; }
    else if(c==='"') q=true;
    else if(c===','){ out.push(campo); campo=''; }
    else campo+=c;
  }
  out.push(campo);
  return out.map(function(x){ return String(x).trim(); });
}
function aISO(v){
  const s=String(v||'').trim(); if(!s) return null;
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return m[1]+'-'+m[2]+'-'+m[3];
  m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if(m){ let d=m[1], mo=m[2], y=m[3];
    if(y.length===2) y=(parseInt(y,10)>70?'19':'20')+y;
    return y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0'); }
  return null;
}
function hora(v){ const m=String(v||'').trim().match(/^(\d{1,2}):(\d{2})/); return m? String(m[1]).padStart(2,'0')+':'+m[2] : null; }
function num(v){ const s=String(v||'').trim().replace(/\./g,'').replace(',','.'); const n=parseFloat(s); return isFinite(n)? n : null; }

const filas = fs.readFileSync(entrada,'utf8').split(/\r?\n/).filter(function(l){ return l.trim()!==''; });
const cab = parsearLinea(filas[0]).map(function(h){ return h.toUpperCase().replace(/\s+/g,' ').trim(); });
console.log('columnas:', cab.filter(Boolean).join(' | '));

// Columnas localizadas por NOMBRE (no por posición): la planilla puede traer
// columnas corridas o extra y así no se desalinean los datos.
function idxDe(){
  for(var a=0;a<arguments.length;a++){
    for(var i=0;i<cab.length;i++){ if(cab[i] && cab[i].indexOf(arguments[a])===0) return i; }
    for(var j=0;j<cab.length;j++){ if(cab[j] && cab[j].indexOf(arguments[a])>=0) return j; }
  }
  return -1;
}
const iTurno=idxDe('TURNO'), iResp=idxDe('AUTORIZA','RESPONSABLE'), iCod=idxDe('CODIGO'),
      iTipo=idxDe('TIPO DE PERMISO'), iDia=idxDe('DIA PERMISO','FECHA QUE REQUIERE'),
      iReg=idxDe('REGRESO'), iHs=idxDe('HORA SALIDA'), iHi=idxDe('HORA INGRESO'), iSin=idxDe('SIN TRABAJO','SIN TRAB');
const _req={'TURNO':iTurno,'AUTORIZA':iResp,'CODIGO NOMBRE':iCod,'TIPO DE PERMISO':iTipo,'DIA PERMISO':iDia,'REGRESO':iReg,'HORA SALIDA':iHs,'SIN TRABAJO':iSin};
const _falta=Object.keys(_req).filter(function(k){ return _req[k]<0; });
if(_falta.length){ console.error('No encuentro estas columnas en el CSV: '+_falta.join(', ')); console.error('Encabezados: '+cab.join(' | ')); process.exit(2); }
console.log('índices: turno='+iTurno+' autoriza='+iResp+' codigo='+iCod+' tipo='+iTipo+' dia='+iDia+' regreso='+iReg+' salida='+iHs+' ingreso='+iHi+' sinTrabajo='+iSin);
console.log('  (fila 2 → turno="'+parsearLinea(filas[1])[iTurno]+'" dia="'+parsearLinea(filas[1])[iDia]+'" regreso="'+parsearLinea(filas[1])[iReg]+'")');
const regs=[]; let descartadas=0, sinHoras=0;
for(let i=1;i<filas.length;i++){
  const f=parsearLinea(filas[i]);
  const m=String(f[iCod]||'').match(/^([A-Za-z]{0,3}\d{2,7})\b/);
  const fecha=aISO(f[iDia]);
  if(!m || !fecha){ descartadas++; continue; }
  const tipoTxt=String(f[iTipo]||'').toUpperCase();
  const regTxt=String(f[iReg]||'').toUpperCase();
  const resp=String(f[iResp]||'').trim();
  const hs=hora(f[iHs]), hi=hora(f[iHi]);
  const horas=num(f[iSin]);
  if(horas==null) sinHoras++;
  const reg = regTxt.indexOf('SIN')>=0 ? 'SIN' : (regTxt.indexOf('CON')>=0 ? 'CON' : (regTxt.indexOf('INGRESO')>=0||regTxt.indexOf('PLANTA')>=0 ? 'INGRESO' : null));
  const campos=[
    m[1].toUpperCase(),
    String(f[iCod]||'').replace(/^[A-Za-z]{0,3}\d{2,7}\s*/,'').replace(/\s*UN\s*\d+\s*$/i,'').trim(),
    (String(f[iTurno]||'').toUpperCase().trim()||'DIA'),
    (tipoTxt.indexOf('MEDICO')>=0||tipoTxt.indexOf('MÉDICO')>=0)?'MEDICO':(tipoTxt.indexOf('JUDICIAL')>=0?'JUDICIAL':'PERSONAL'),
    fecha,
    (reg||'SIN'),
    (hs||''),
    (reg==='SIN'? '' : (hi||'')),          // en SIN la hora de ingreso no existe
    (horas==null? '' : horas.toFixed(2)),
    resp
  ];
  if(campos.some(function(c){ return String(c).indexOf(';')>=0 || String(c).indexOf('$$')>=0; })){ descartadas++; continue; }
  regs.push(campos);
}

const unicas={}, dup=[];
regs.forEach(function(r){ const k=r[0]+'|'+r[4]+'|'+r[6]; if(unicas[k]) dup.push(r); unicas[k]=1; });
const finales = regs.filter(function(r,i){ const k=r[0]+'|'+r[4]+'|'+r[6]; return dup.length===0 || regs.findIndex(function(x){ return x[0]+'|'+x[4]+'|'+x[6]===k; })===i; });

console.log('\nfilas leídas       : ' + (filas.length-1));
console.log('media jornada      : ' + regs.length);
console.log('descartadas        : ' + descartadas + ' (vacías o sin código/fecha)');
console.log('repetidas en archivo: ' + dup.length);
console.log('sin horas (SIN TRABAJO vacío): ' + sinHoras);
const tipo={}, reg2={};
regs.forEach(function(r){ tipo[r[3]]=(tipo[r[3]]||0)+1; reg2[r[5]]=(reg2[r[5]]||0)+1; });
console.log('tipo de permiso    : ' + Object.keys(tipo).map(function(k){ return k+':'+tipo[k]; }).join('  '));
console.log('tipo de regreso    : ' + Object.keys(reg2).map(function(k){ return k+':'+reg2[k]; }).join('  '));
console.log('desde / hasta      : ' + regs.map(function(r){return r[4];}).sort()[0] + ' → ' + regs.map(function(r){return r[4];}).sort().slice(-1)[0]);

const lineas = finales.map(function(r){ return '  ($$' + r.join(';') + '$$)'; }).join(',\n');
const sql = `-- ============================================================
--  Permisos MEDIA JORNADA — planilla auxiliar (Google Sheet)
--  Registros leídos: ${finales.length}   ·   generado por importar_media_jornada.js
--
--  IDEMPOTENTE: sólo inserta los que no estén ya (misma código+fecha+hora de
--  salida). Se puede correr varias veces sin duplicar. Pegar en
--  Supabase → SQL Editor → New query → Run.
-- ============================================================
with d(l) as (values
${lineas}
)
insert into public.solicitudes_permiso
  (tipo,estado,codigo,nombre,centro_costo,turno,tipo_permiso,inicio,termino,tipo_regreso,hora_salida,hora_ingreso,horas_permiso,autorizador)
select
  'MEDIA_JORNADA','APROBADO',
  split_part(d.l,';',1), split_part(d.l,';',2), null,
  nullif(split_part(d.l,';',3),''), nullif(split_part(d.l,';',4),''),
  split_part(d.l,';',5)::date, null, split_part(d.l,';',6),
  nullif(split_part(d.l,';',7),'')::time,
  case when split_part(d.l,';',6)='SIN' then null else nullif(split_part(d.l,';',8),'')::time end,
  nullif(split_part(d.l,';',9),'')::numeric, nullif(split_part(d.l,';',10),'')
 from d
 where not exists (
   select 1 from public.solicitudes_permiso x
    where x.tipo='MEDIA_JORNADA'
      and upper(trim(x.codigo)) = upper(trim(split_part(d.l,';',1)))
      and x.inicio = split_part(d.l,';',5)::date
      and coalesce(to_char(x.hora_salida,'HH24:MI'),'') = coalesce(split_part(d.l,';',7),'')
 );

-- ── Resumen (sentencia aparte: un SELECT no ve los cambios de la misma sentencia) ──
select tipo_regreso, count(*) as filas, round(sum(horas_permiso),2) as horas
  from public.solicitudes_permiso where tipo='MEDIA_JORNADA'
 group by tipo_regreso order by filas desc;
select count(*) as total_media_jornada, min(inicio) as desde, max(inicio) as hasta
  from public.solicitudes_permiso where tipo='MEDIA_JORNADA';
`;
fs.writeFileSync(path.resolve(salida), sql, 'utf8');
console.log('\n✔ Escrito ' + salida + ' (' + (sql.length/1024).toFixed(0) + ' KB, ' + finales.length + ' registros)');
