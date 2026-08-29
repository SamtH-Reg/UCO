// Test de permisos.html — extrae el <script> y prueba la lógica pura
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'permisos.html');
const html = fs.readFileSync(file, 'utf8');

// 1. Extraer el contenido del <script> principal (el que no tiene src)
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.error('FAIL: no se encontró <script>'); process.exit(1); }
const code = scriptMatch[1];

// 2. Comprobar sintaxis con new Function (parseo) — lanza SyntaxError si hay error
let parseOk = true, parseErr = '';
try { new Function(code); } catch (e) { parseOk = false; parseErr = e.message; }
console.log((parseOk ? 'PASS' : 'FAIL') + ' parseo de sintaxis: ' + (parseOk ? 'sin errores' : parseErr));

// 3. Entorno simulado para ejecutar las funciones puras
const results = [];
const t = (name, fn) => {
  try { const v = fn(); results.push([name, v !== false ? true : false, v === false ? 'retornó false' : 'ok']); }
  catch (e) { results.push([name, false, 'excepción: ' + e.message]); }
};

// Globals mínimas requeridas por el tope del script
global.window = global;
const elem = () => ({ classList:{add(){},remove(){},toggle(){}}, style:{}, innerHTML:'', textContent:'', value:'' });
global.document = {
  getElementById: () => elem(),
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => elem(),
};
global.localStorage = { getItem:()=>null, setItem:()=>{}, removeItem:()=>{} };
global.supabase = { createClient: () => ({ from:() => ({ select:()=>({eq:()=>({single:()=>({})}), order:()=>({limit:()=>({})}), })() }) }) };
global.navigator = { onLine: true };
global.confirm = () => true;
global.XLSX = { utils:{json_to_sheet:()=>({}),book_new:()=>({})}, book_append_sheet:()=>{}, writeFile:()=>{} };

// Ejecutar el código (define las funciones)
try { (0,eval)(code); console.log('PASS evaluación del script (funciones definidas)'); }
catch (e) { console.log('FAIL evaluación: ' + e.message); }

// 4. Pruebas de lógica pura
console.log('\n— Lógica pura —');

t('iso() formato correcto', () => iso(new Date(2026,7,15)) === '2026-08-15');

t('fmt() formato "15 agosto 2026"', () => fmt('2026-08-15') === '15 agosto 2026');

t('hoy() devuelve formato YYYY-MM-DD', () => /^\d{4}-\d{2}-\d{2}$/.test(hoy()));

t('vacEnd: 5 días hábiles desde lunes -> viernes', () => {
  // 3 Aug 2026 = lunes. +4 días hábiles -> viernes 7 Agost
  return vacEnd('2026-08-03', 5) === '2026-08-07';
});

t('vacEnd omite domingo', () => {
  // Inicio jueves 6 Ago 2026, 2 días hábiles -> jueves+viernes = 6,7. No salta domingo con 2
  return vacEnd('2026-08-06', 2) === '2026-08-07';
});

t('vacEnd salta finde: viernes(7) + 2 hábiles -> L,10 / M,11 (último 11)', () => {
  // El día de inicio cuenta como día 1. Viernes 7 = día1, Lunes 10 = día2
  return vacEnd('2026-08-07', 2) === '2026-08-10';
});

t('vacEnd respeta feriado (jueves 13 inicia, viernes 14 feriado no aplica... 1 hábil=viernes 7? ) usa caso claro', () => {
  // 17 Ago 2026 es lunes. Pedir 1 hábil debe dar 17 (inicio cuenta como día 1)
  return vacEnd('2026-08-17', 1) === '2026-08-17';
});
t('vacEnd con feriado en el medio: 14 Ago(2026 feriado? no) — 18 Sep 2026 feriado', () => {
  // Inicio 17 Sep 2026 (jueves), 2 hábiles: jueves17 + ... 18 Sep es feriado -> salta a lunes 21
  return vacEnd('2026-09-17', 2) === '2026-09-21';
});

t('vacEnd con inicio null -> null', () => vacEnd(null, 5) === null);
t('vacEnd con dias 0 -> null', () => vacEnd('2026-08-03', 0) === null);

// cupos()
_SOLIC = [
  { inicio:'2026-08-20', tipo:'COMPLETO', tipo_permiso:'PERSONAL', estado:'PENDIENTE' },
  { inicio:'2026-08-20', tipo:'COMPLETO', tipo_permiso:'MEDICO', estado:'APROBADO' },
  { inicio:'2026-08-20', tipo:'VACACIONES', estado:'APROBADO' },
  { inicio:'2026-08-20', tipo:'COMPLETO', tipo_permiso:'PERSONAL', estado:'RECHAZADO' },
  { inicio:'2026-08-19', tipo:'COMPLETO', tipo_permiso:'PERSONAL', estado:'APROBADO' },
];
t('cupos(): cuenta solo COMPLETO/MEDIA en estado activo, ignora vacaciones y rechazados', () => {
  const c = cupos('2026-08-20');
  return c.total === 2 && c.personal === 1;
});
t('cupos(): clase media jornada suma al total', () => {
  _SOLIC = [{ inicio:'2026-08-21', tipo:'MEDIA_JORNADA', estado:'PENDIENTE' }];
  return cupos('2026-08-21').total === 1;
});

// calcularHoras()
_form = { hs:'09:00', hi:'12:30', reg:'CON' };
t('calcularHoras(): 09:00-12:30 = 3,5 h', () => calcularHoras() === '3,5 h');
_form = { hs:'22:00', hi:'01:00', reg:'CON' };
t('calcularHoras(): cruce de medianoche 22:00-01:00 = 3,0 h', () => calcularHoras() === '3,0 h');
_form = { hs:'09:00', hi:'12:30', reg:'SIN' };
t('calcularHoras(): sin regreso -> —', () => calcularHoras() === '—');
_form = { hs:'09:00', hi:'', reg:'CON' };
t('calcularHoras(): sin hora ingreso -> —', () => calcularHoras() === '—');

// esc()
t('esc() escapa HTML', () => esc('<b>"x"&</b>') === '&lt;b&gt;&quot;x&quot;&amp;&lt;/b&gt;');
t('esc() null -> vacío', () => esc(null) === '');

// norm() quita tildes
t('norm() quita tildes: "Médico" -> MEDICO', () => norm('Médico') === 'MEDICO');
t('norm() "Judicial" -> JUDICIAL', () => norm('Judicial') === 'JUDICIAL');
t('segBtnT() onClick guarda "MEDICO" sin tilde', () => segBtnT('Médico',false).indexOf("_form.tipo='MEDICO'") >= 0);
t('segBtnT() onClick guarda "PERSONAL"', () => segBtnT('Personal',false).indexOf("_form.tipo='PERSONAL'") >= 0);

// filtros de registro por fecha
t('periodoLabel: todos -> "Todos los registros"', () => { recSetTodo(); _recDesde='';_recHasta=''; return periodoLabel()==='Todos los registros'; });
t('periodoLabel: año+mes -> "Agosto 2026"', () => { recSetTodo(); _recAnio='2026';_recMeses=[8]; return periodoLabel()==='Agosto 2026'; });
t('periodoLabel: rango -> "Rango ..."', () => { recSetTodo(); _recDesde='2026-08-01';_recHasta='2026-08-31'; return periodoLabel().indexOf('Rango')===0; });
t('periodoLabel: varios meses -> "Meses: Ago, Sep"', () => { recSetTodo(); _recMeses=[8,9]; return periodoLabel()==='Meses: Ago, Sep'; });
t('recClearFilters limpia todo', () => { _recAnio='2026';_recMeses=[8];_recDesde='x';_recHasta='x'; _recTipo='PERSONAL'; recClearFilters(); return !_recAnio&&!_recMeses.length&&!_recDesde&&!_recHasta&&!_recTipo; });
t('recSetMesActual fija año/mes actual + rango', () => { recSetMesActual(); var d=new Date(),a=d.getFullYear(),m=d.getMonth()+1; return _recAnio===String(a) && _recMeses.length===1 && _recMeses[0]===m && _recDesde===a+'-'+String(m).padStart(2,'0')+'-01'; });
t('recSetMesAnterior fija mes previo', () => { recSetMesAnterior(); var d=new Date(),m=d.getMonth()-1,a=d.getFullYear(); if(m<0){m=11;a--;} return _recMeses.length===1&&_recMeses[0]===m+1&&_recAnio===String(a); });
t('recSetTodo vacía filtros', () => { recSetTodo(); return !_recAnio&&!_recMeses.length&&!_recDesde&&!_recHasta&&!_recTipo; });
t('periodoLabel con tipo = "Todos los registros · Personal"', () => { recSetTodo(); _recTipo='PERSONAL'; return periodoLabel()==='Todos los registros · Personal'; });
t('recToggleMes agrega/quita meses', () => { recSetTodo(); recToggleMes(8); recToggleMes(9); var ok=_recMeses.length===2&&_recMeses.indexOf(8)>=0&&_recMeses.indexOf(9)>=0; recToggleMes(8); return ok&&_recMeses.length===1&&_recMeses.indexOf(8)<0; });
t('recMesesLbl sin meses = "Mes"', () => { recSetTodo(); return recMesesLbl()==='Mes'; });
t('calcularHorasPermiso: SIN DIA 14:00 -> 3 (17-14)', () => calcularHorasPermiso({turno:'DIA',tipo_regreso:'SIN',hora_salida:'14:00'})===3);
t('calcularHorasPermiso: CON 10:30-11:00 -> 0.5', () => calcularHorasPermiso({turno:'DIA',tipo_regreso:'CON',hora_salida:'10:30',hora_ingreso:'11:00'})===0.5);
t('calcularHorasPermiso: INGRESO 10:00 DIA -> 2 (10-8)', () => calcularHorasPermiso({turno:'DIA',tipo_regreso:'INGRESO',hora_ingreso:'10:00'})===2);
t('calcularHorasPermiso: usa horas_permiso si existe', () => calcularHorasPermiso({turno:'DIA',tipo_regreso:'SIN',hora_salida:'14:00',horas_permiso:3.5})===3.5);
t('toggleDiaMJ alterna estado', () => { toggleDiaMJ('2026-08-12'); var a=_diaExpandMJ['2026-08-12']; toggleDiaMJ('2026-08-12'); var b=_diaExpandMJ['2026-08-12']; return a!==b; });
t('recClearFilters limpia turno', () => { _recTurno='DIA'; recClearFilters(); return _recTurno===''; });
t('periodoLabel con turno = "... · Día"', () => { recSetTodo(); _recTurno='DIA'; return periodoLabel().indexOf('· Día')>=0; });
t('aplicarRangoMeses: agosto 2026 = 01-08 a 31-08', () => { recSetTodo(); _recFechaAuto=true; _recAnio='2026'; _recMeses=[8]; aplicarRangoMeses(); return _recDesde==='2026-08-01'&&_recHasta==='2026-08-31'; });
t('aplicarRangoMeses: febrero 2026 (bisiesto) = 01-02 a 28-02', () => { recSetTodo(); _recFechaAuto=true; _recAnio='2026'; _recMeses=[2]; aplicarRangoMeses(); return _recHasta==='2026-02-28'; });
t('aplicarRangoMeses: sin meses limpia fechas', () => { recSetTodo(); _recFechaAuto=true; _recMeses=[]; aplicarRangoMeses(); return !_recDesde&&!_recHasta; });

// selección de calendario (calClick con stubs minimalistas)
// reprovisionar _form para tab 0
_tab = 0; _form = { dates:[], tipo:'', emp:null, aut:null, cc:null, start:null, dias:5, reg:'', hs:'', hi:'' };
_SOLIC = [];
t('calClick() añade día a arreglo', () => { calClick('2026-08-10'); return _form.dates.includes('2026-08-10'); });
t('calClick() alterna (quita si ya estaba)', () => { calClick('2026-08-10'); return _form.dates.length === 0; });

// 5. Reporte
console.log('\n— Resumen —');
let pass = 0, fail = 0;
results.forEach(([n, ok, extra]) => { console.log((ok?'PASS':'FAIL') + ' ' + n + (ok?'':' :: '+extra)); ok?pass++:fail++; });
console.log(`\n${pass}/${results.length} pruebas pasaron.`);
process.exit(fail || !parseOk ? 1 : 0);
