const fs = require('fs');
const path = require('path');
const tsv = fs.readFileSync(path.join(process.env.TEMP, 'opencode', 'pvac_ocr.tsv'), 'utf8');
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

function num(s, fallback) {
  if (s == null) return fallback;
  var t = String(s).trim().toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  var map = { g: 0, o: 0, q: 0, l: 1, i: 1, '|': 1, z: 2, s: 5, b: 6, e: 8 };
  if (map[t] != null) return map[t];
  return fallback;
}
function fixAno(s) { return /^\d{4}$/.test(s) ? s : null; }
function pad(n) { return String(n).padStart(2, '0'); }
function iso(t) { return t && t.dia && t.mes && t.ano ? (t.ano + '-' + pad(t.mes) + '-' + pad(t.dia)) : null; }

// Todas las apariciones de "DIA n MES n AÑO nnnn" (con tolerancia a errores OCR)
function allFechas(text) {
  var re = /D[Il1EA][Aa]?\.?[^0-9]{0,18}(\d{1,2})[^0-9]{0,18}(\d{1,2})[^0-9]{0,18}(\d{4})/gi;
  var out = [], m;
  while ((m = re.exec(text)) !== null) {
    var t = { dia: num(m[1], null), mes: num(m[2], null), ano: fixAno(m[3]) };
    var anioOk = t.ano && +t.ano >= 2015 && +t.ano <= 2030;
    if (t.dia >= 1 && t.dia <= 31 && t.mes >= 1 && t.mes <= 12 && anioOk) {
      t.ctx = text.slice(Math.max(0, m.index - 18), m.index).toLowerCase();
      out.push(t);
    }
  }
  return out;
}
function habilesEnd(isoStr, n) {
  var d = new Date(isoStr + 'T12:00:00'), count = 0, guard = 0;
  while (guard++ < 900) {
    var w = d.getDay();
    if (w !== 0 && w !== 6) { count++; if (count >= n) break; }
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}
function habilesSpan(aIso, bIso) {
  var d = new Date(aIso + 'T12:00:00'), f = new Date(bIso + 'T12:00:00'), n = 0, guard = 0;
  if (isNaN(d) || isNaN(f) || d > f) return 0;
  while (d <= f && guard++ < 600) { var w = d.getDay(); if (w !== 0 && w !== 6) n++; d.setDate(d.getDate() + 1); }
  return n;
}
function habilesStart(isoStr, n) {
  var d = new Date(isoStr + 'T12:00:00'), count = 0, guard = 0;
  while (guard++ < 900) {
    var w = d.getDay();
    if (w !== 0 && w !== 6) { count++; if (count >= n) break; }
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

function parseFile(rel, text) {
  var base = path.basename(rel).replace(/\.(jpg|jpeg)$/i, '');
  var mcode = base.match(/^([A-Za-z])\s?(\d{3,4})/);
  var code = mcode ? (mcode[1].toUpperCase() + mcode[2]) : base.toUpperCase();
  var carpeta = rel.split(path.sep)[0].replace(/^Scan Solicitud de vacaciones /i, '');
  var r = { carpeta: carpeta, archivo: path.basename(rel), codigo: code, fecha_sol: null, desde: null, hasta: null, dias_legal: null, dias_prog: null, dias_total: null, ok: '', notas: '' };

  var mf = text.match(/Con fecha\s+(\d{1,2})\s+de\s+([a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1]+)\s+de\s+(\d{4})/i);
  if (mf) { var mes = MESES[mf[2].toLowerCase()]; if (mes) r.fecha_sol = mf[3] + '-' + pad(mes) + '-' + pad(parseInt(mf[1], 10)); }

  var md = text.match(/contempla\s+(\d{1,2}|[goli])?\s*d[i\u00ed]as?\s*h[\u00e1a]biles\s*de\s*feriado\s*legal\s*y\s*(\d{1,2}|[goli])?\s*d[i\u00ed]as?\s*h[\u00e1a]biles\s*de\s*feriado\s*progresivo[^.]*?total\s*de\s*(\d{1,3})\s*d[i\u00ed]as?/i);
  if (md) { r.dias_legal = num(md[1], null); r.dias_prog = md[2] ? num(md[2], 0) : 0; r.dias_total = num(md[3], null); }
  if (r.dias_total == null) {
    var mv = text.match(/de\s+(\d{1,2})\s*d[i\u00ed]as?\s*h[\u00e1a]biles\s*de\s*vacaciones/i);
    if (mv) r.dias_total = num(mv[1], null);
  }

  var fechas = allFechas(text);
  var fD = null, fH = null;
  if (fechas.length >= 2) { fD = fechas[0]; fH = fechas[1]; }        // bloque legal = primeras dos
  else if (fechas.length === 1) {                                    // una sola: ¿es la de "Hasta"?
    if (/hasta/.test(fechas[0].ctx)) fH = fechas[0]; else fD = fechas[0];
  }
  r.desde = iso(fD); r.hasta = iso(fH);

  // Fecha suelta tras "fechas: el 14 8 AÑO 2026" (sin la palabra DIA)
  if (!r.desde) {
    var ml = text.match(/(?:fechas:[^0-9]{0,14}|Desde\s*(?:el\s+)?)\s*(\d{1,2})\s*(?:MES\s*)?(\d{1,2})\s*(?:A[\u00d1N]?[XO]?O\s*)?(\d{4})/i);
    if (ml) { var tt = { dia: num(ml[1], null), mes: num(ml[2], null), ano: fixAno(ml[3]) }; if (tt.dia >= 1 && tt.mes >= 1 && tt.mes <= 12) r.desde = iso(tt); }
  }

  // Sin días en el texto: calcular hábiles (L-V) del rango
  if (r.dias_total == null && r.desde && r.hasta) { r.dias_total = habilesSpan(r.desde, r.hasta); r.notas += 'dias≈calc '; }
  var nD = r.dias_total || ((r.dias_legal || 0) + (r.dias_prog || 0));
  if (r.desde && !r.hasta && nD > 0) { r.hasta = habilesEnd(r.desde, nD); r.notas += 'hasta≈calc '; }
  if (!r.desde && r.hasta && nD > 0) { r.desde = habilesStart(r.hasta, nD); r.notas += 'desde≈calc '; }

  r.ok = (r.desde && r.hasta) ? 'OK' : 'REVISAR';
  if (r.desde && r.hasta) {
    var d = new Date(r.hasta + 'T12:00:00') - new Date(r.desde + 'T12:00:00');
    r.notas += 'span=' + Math.round(d / 86400000) + 'd';
  }
  return r;
}

var rows = [];
tsv.split(/\r?\n/).forEach(function (line) {
  if (!line.trim()) return;
  var parts = line.split('\t');
  var rel = parts[0], text = parts.slice(1).join(' ').trim();
  rows.push(parseFile(rel, text));
});

var cols = ['carpeta', 'archivo', 'codigo', 'fecha_sol', 'desde', 'hasta', 'dias_legal', 'dias_prog', 'dias_total', 'ok', 'notas'];
var csv = cols.join(';') + '\n' + rows.map(function (r) { return cols.map(function (c) { return r[c] == null ? '' : r[c]; }).join(';'); }).join('\n');
var out = path.join(process.env.TEMP, 'opencode', 'pvac_papeletas.csv');
fs.writeFileSync(out, csv, 'utf8');

var ok = rows.filter(function (r) { return r.ok === 'OK'; }).length;
console.log('Total:', rows.length, '| con ambas fechas:', ok, '| a revisar:', rows.length - ok);
var cods = {};
rows.forEach(function (r) { cods[r.codigo] = (cods[r.codigo] || 0) + 1; });
console.log('Empleados distintos:', Object.keys(cods).length);
console.log('CSV ->', out);
console.log('\n--- A revisar ---');
rows.filter(function (r) { return r.ok !== 'OK'; }).forEach(function (r) { console.log(r.archivo, '| cod:', r.codigo, '| desde:', r.desde, '| hasta:', r.hasta, '| dias:', r.dias_total, '| fecha:', r.fecha_sol); });
