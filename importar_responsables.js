/* ============================================================================
   importar_responsables.js — trae el RESPONSABLE (columna AUTORIZA, "E") de la
   planilla de Google a las tablas de permisos.

   Uso:
     1) En la planilla: Archivo → Descargar → CSV  (o "Publicar en la web" y bajar el CSV)
     2) node importar_responsables.js planilla_permisos.csv [salida.sql]

   Genera salida.sql (por defecto responsables_import.sql) con:
     - update de public.solicitudes_permiso  (lo que muestra permisos.html)
     - update de public.permisos             (tabla cargada desde la planilla)
   Solo RELLENA casillas vacías: nunca pisa un responsable ya guardado por la app.

   Cómo reconoce las columnas (por el encabezado, sin importar el orden):
     - responsable : AUTORIZA | AUTORIZADOR | RESPONSABLE            (en la planilla: E)
     - código      : CODIGO NOMBRE | CÓDIGO NOMBRE | CODIGO          (en la planilla: F)
                     del texto "M7758 CAYUN MILLAO MIRIAM SOLEDAD UN 1110" usa el 1er token
     - fecha       : encabezados que contengan "REQUIERE", "PERMISO" o empiecen con "DIA"/"DÍA"
                     (en la planilla: I "FECHA QUE REQUIERE PERMISO", J "DIA 2", ...)
                     La columna C "FECHA" (fecha de la solicitud) NO se usa a propósito:
                     el permiso se registra en la fecha que se requiere.
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const entrada = args[0];
const salida = args[1] || 'responsables_import.sql';

if (!entrada) {
  console.error('Uso: node importar_responsables.js <planilla.csv> [salida.sql]');
  process.exit(1);
}

// ── lector CSV (comillas, comas y saltos dentro de comillas) ────────────────
function leerCSV(txt) {
  txt = txt.replace(/^\uFEFF/, '');
  const filas = []; let fila = [], campo = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) {
      if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else q = false; }
      else campo += c;
    } else if (c === '"') q = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter(f => f.some(v => String(v).trim() !== ''));
}

// ── utilidades ──────────────────────────────────────────────────────────────
const norm = s => String(s || '').trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');   // sin tildes

function aISO(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);                       // 2025-03-04
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);         // 04-03-2025 / 4/3/25
  if (m) {
    let [_, d, mo, y] = m;
    if (y.length === 2) y = (parseInt(y, 10) > 70 ? '19' : '20') + y;
    if (parseInt(mo, 10) > 12) { const t = d; d = mo; mo = t; }       // por si viene M/D
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  return null;
}
const esc = s => "'" + String(s).replace(/'/g, "''") + "'";         // SQL literal
const clave = (cod, fecha) => String(cod).trim().toUpperCase() + '|' + fecha;

// ── columnas ────────────────────────────────────────────────────────────────
const filas = leerCSV(fs.readFileSync(entrada, 'utf8'));
if (!filas.length) { console.error('CSV vacío'); process.exit(1); }

const cab = filas[0].map(norm);
let iResp = cab.findIndex(h => h === 'autoriza' || h === 'autorizador' || h === 'responsable');
let iCod  = cab.findIndex(h => h.indexOf('codigo nombre') >= 0 || h.indexOf('codigo') === 0);
let fechas = [];
cab.forEach((h, i) => {
  if (i === iCod || i === iResp) return;
  if (h.indexOf('tipo') >= 0) return;                 // "TIPO DE PERMISO" no es fecha
  if (/^dias?\s*de/.test(h)) return;                  // "DIAS DE PERMISOS" es la cantidad, no una fecha
  if (h.indexOf('requiere') >= 0) { fechas.push(i); return; }        // "FECHA QUE REQUIERE PERMISO"
  if (/^dias?\s*\d/.test(h)) { fechas.push(i); return; }             // "DIA 2", "DIA 3"...
  if (/^fecha\s*permiso/.test(h)) { fechas.push(i); return; }        // "FECHA PERMISO"
});
if (!fechas.length) {                       // plan B: cualquier columna cuya fila 2 sea una fecha
  filas[1].forEach((v, i) => { if (i !== iCod && i !== iResp && aISO(v) && cab[i].indexOf('fecha') < 0) fechas.push(i); });
}
if (iResp < 0 || iCod < 0 || !fechas.length) {
  console.error('No pude reconocer las columnas. Encabezados leídos:');
  console.error(filas[0].join(' | '));
  console.error('\nSe necesita: una columna de responsable (AUTORIZA/RESPONSABLE), una de código ' +
                '(CODIGO NOMBRE) y al menos una de fecha de permiso (FECHA QUE REQUIERE PERMISO / DIA 2...).');
  process.exit(2);
}

console.log('Columnas usadas:');
console.log('  responsable : ' + filas[0][iResp] + '  (columna ' + colLetra(iResp) + ')');
console.log('  código      : ' + filas[0][iCod] + '  (columna ' + colLetra(iCod) + ')');
console.log('  fechas      : ' + fechas.map(i => filas[0][i] + ' (' + colLetra(i) + ')').join(', '));

// ── triples (código, fecha, responsable) ────────────────────────────────────
const mapa = new Map();   // clave -> {cod,fecha,aut,nombre}
let salteadas = 0, sinResp = 0, sinFecha = 0;
for (let r = 1; r < filas.length; r++) {
  const f = filas[r];
  const resp = String(f[iResp] || '').trim();
  const texto = String(f[iCod] || '').trim();
  const m = texto.match(/^([A-Za-z]{0,3}\d{2,7})\b/);        // "M7758 ..." / "H2364 ..."
  if (!m) { salteadas++; continue; }
  const cod = m[1].toUpperCase();
  const nombre = texto.replace(/^[A-Za-z]{0,3}\d{2,7}\s*/, '').replace(/\s*UN\s*\d+\s*$/i, '').trim();
  const fs = fechas.map(i => aISO(f[i])).filter(Boolean);
  if (!fs.length) { sinFecha++; continue; }
  if (!resp) { sinResp++; }
  fs.forEach(fecha => {
    const k = clave(cod, fecha);
    if (!mapa.has(k) && resp) mapa.set(k, { cod, fecha, aut: resp, nombre });
  });
}
const triples = [...mapa.values()];
console.log('\nFilas leídas      : ' + (filas.length - 1));
console.log('Permisos con fecha: ' + triples.length);
console.log('Sin responsable   : ' + sinResp + ' fila(s) (se omiten)');
console.log('Sin fecha válida  : ' + sinFecha + ' fila(s) (se omiten)');
if (salteadas) console.log('Sin código legible: ' + salteadas + ' fila(s) (se omiten)');

// ── SQL ─────────────────────────────────────────────────────────────────────
const VALUES = triples.map(t => "(" + esc(t.cod) + "," + esc(t.fecha) + "," + esc(t.aut) + ")").join(",\n    ");

// Una sola sentencia (WITH ... = sirve igual pegado en el SQL Editor de Supabase
// que ejecutado por API, sin tablas temporales).
const sql = `-- ============================================================
--  Responsables de permisos — planilla de Google, columna AUTORIZA (E)
--  Permisos leídos de la planilla: ${triples.length}
--  Generado por importar_responsables.js
--
--  Solo RELLENA casillas vacías: no pisa el responsable que ya
--  guardó la app. Pegar todo en Supabase → SQL Editor → New query.
-- ============================================================
with planilla(codigo, fecha, autorizador) as (values
    ${VALUES}
),
app as (                       -- permisos de la app (solicitudes_permiso)
  update public.solicitudes_permiso s
     set autorizador = pl.autorizador, updated_at = now()
    from planilla pl
   where upper(trim(s.codigo)) = upper(trim(pl.codigo))
     and s.inicio = pl.fecha::date
     and (s.autorizador is null or trim(s.autorizador) = '')
  returning 1
),
planilla_tabla as (            -- tabla cargada desde la planilla
  update public.permisos p
     set autorizador = pl.autorizador, updated_at = now()
    from planilla pl
   where upper(trim(p.codigo)) = upper(trim(pl.codigo))
     and p.fecha::text like pl.fecha || '%'
     and (p.autorizador is null or trim(p.autorizador) = '')
  returning 1
)
select 1 as ok;   -- fin del update (el resumen va en la sentencia siguiente)

-- ── Resumen ─────────────────────────────────────────────────────────────
-- OJO: va en sentencia aparte. Un SELECT dentro de la misma sentencia ve la
-- foto ANTERIOR a los updates (las CTE que escriben no le son visibles).
select 'permisos (planilla)' as tabla, '(todas las filas)' as tipo,
       count(*) filter (where autorizador is not null and trim(autorizador) <> '') as con_responsable,
       count(*) as filas
  from public.permisos
union all
select 'solicitudes_permiso', tipo,
       count(*) filter (where autorizador is not null and trim(autorizador) <> ''),
       count(*)
  from public.solicitudes_permiso
 group by tipo
 order by 1, 2;
`;
fs.writeFileSync(path.resolve(salida), sql, 'utf8');
console.log('\n✔ Escrito ' + salida + ' (' + (sql.length / 1024).toFixed(0) + ' KB)');
console.log('  Ejecútalo en Supabase → SQL Editor.');

function colLetra(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
