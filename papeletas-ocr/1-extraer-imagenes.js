const fs = require('fs');
const path = require('path');
const base = 'C:\\Users\\jhuequen\\Documents\\Default Project\\pdf vacaciones';
const outBase = path.join(process.env.TEMP, 'opencode', 'pvac_img');

function extractImg(buf) {
  const s = buf.toString('latin1');
  const i = s.indexOf('/Subtype /Image');
  if (i < 0) return null;
  const st = s.indexOf('stream', i);
  if (st < 0) return null;
  let p = st + 6;
  if (buf[p] === 13) p++;
  if (buf[p] === 10) p++;
  let en = s.indexOf('endstream', p);
  if (en < 0) return null;
  let end = en;
  if (buf[end - 1] === 10) end--;
  if (buf[end - 1] === 13) end--;
  return { data: buf.slice(p, end), jpeg: buf[p] === 0xFF && buf[p + 1] === 0xD8 };
}

function walk(dir, rel, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const r = rel ? path.join(rel, e.name) : e.name;
    if (e.isDirectory()) walk(p, r, out);
    else if (/\.(pdf|jpe?g)$/i.test(e.name)) out.push({ full: p, rel: r });
  }
  return out;
}

const files = walk(base, '', []);
console.log('Archivos:', files.length);
let ok = 0, fail = 0, copied = 0;
for (const f of files) {
  const dest = path.join(outBase, f.rel.replace(/\.pdf$/i, '.jpg'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (/\.jpe?g$/i.test(f.rel)) { fs.copyFileSync(f.full, dest); copied++; ok++; continue; }
  const buf = fs.readFileSync(f.full);
  const img = extractImg(buf);
  if (!img || !img.jpeg) { console.log('SKIP no-jpeg', f.rel); fail++; continue; }
  fs.writeFileSync(dest, img.data);
  ok++;
}
console.log('Extraídos:', ok, '| copiados:', copied, '| fallidos:', fail, '->', outBase);
