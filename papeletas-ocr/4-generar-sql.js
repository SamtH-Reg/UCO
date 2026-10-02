const fs = require('fs');
const path = require('path');
const csv = fs.readFileSync(path.join(process.env.TEMP, 'opencode', 'pvac_papeletas.csv'), 'utf8').split(/\r?\n/);
const cols = csv.shift().split(';');
const rows = csv.filter(l => l.trim()).map(l => { const p = l.split(';'); const o = {}; cols.forEach((c, i) => o[c] = p[i]); return o; })
  .filter(r => /^[A-Z]\d{3,4}$/.test(r.codigo) && r.desde && r.hasta);

const seen = {};
const uniq = [];
rows.forEach(r => {
  const k = r.codigo + '|' + r.desde;
  if (seen[k]) return;
  seen[k] = 1;
  uniq.push(r);
});
uniq.sort((a, b) => (a.codigo + a.desde).localeCompare(b.codigo + b.desde));

function q(v) { return v == null || v === '' ? 'null' : "'" + String(v).replace(/'/g, "''") + "'"; }
function n(v) { return v == null || v === '' ? 'null' : String(parseInt(v, 10)); }

let sql = `-- ============================================================\n`;
sql += `--  Importacion de PAPELETAS DE VACACIONES (OCR de PDFs escaneados)\n`;
sql += `--  Proyecto Supabase: qvtztwqbbbzortkodtla\n`;
sql += `--  Corre en: Dashboard -> SQL Editor -> New query -> Run\n`;
sql += `--\n`;
sql += `--  Generado desde 'pdf vacaciones' (275 papeletas de 105 trabajadores).\n`;
sql += `--  Idempotente: no duplica si ya existe (codigo + inicio + tipo VACACIONES).\n`;
sql += `--  Origen identificable por comentario = 'Papeleta OCR'.\n`;
sql += `-- ============================================================\n\n`;
sql += `insert into public.solicitudes_permiso\n`;
sql += `  (tipo, estado, codigo, nombre, inicio, termino, dias_habiles, dias_base, dias_progresivo, dias_sindical, tipo_dias, comentario)\n`;
sql += `select * from (values\n`;
const vals = uniq.map(r => {
  const legal = (r.dias_legal === '' || r.dias_legal == null) ? null : parseInt(r.dias_legal, 10);
  const progRaw = (r.dias_prog === '' || r.dias_prog == null) ? null : parseInt(r.dias_prog, 10);
  const tot = (r.dias_total === '' || r.dias_total == null) ? null : parseInt(r.dias_total, 10);
  let base = legal;
  if (base == null) base = (progRaw != null && tot != null) ? Math.max(0, tot - progRaw) : tot;
  const prog = progRaw == null ? 0 : progRaw;
  const tipoDias = prog > 0 ? 'MIXTO' : 'BASE';
  return `  ('VACACIONES', 'APROBADO', ${q(r.codigo)}, null, ${q(r.desde)}::date, ${q(r.hasta)}::date, ${n(tot)}, ${n(base)}, ${prog}, 0, ${q(tipoDias)}, 'Papeleta OCR')`;
});
sql += vals.join(',\n');
sql += `\n) as v(tipo, estado, codigo, nombre, inicio, termino, dias_habiles, dias_base, dias_progresivo, dias_sindical, tipo_dias, comentario)\n`;
sql += `where not exists (\n`;
sql += `  select 1 from public.solicitudes_permiso sp\n`;
sql += `  where sp.tipo = 'VACACIONES' and sp.codigo = v.codigo and sp.inicio = v.inicio\n`;
sql += `);\n`;

const outRepo = 'C:\\Users\\jhuequen\\Documents\\Default Project\\UCO\\papeletas_vacaciones_import.sql';
fs.writeFileSync(outRepo, sql, 'utf8');
console.log('Registros unicos:', uniq.length);
console.log('SQL ->', outRepo);
console.log(sql.slice(0, 900));
