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
t('calcularHoras(): 09:00-12:30 = 3,50 h', () => calcularHoras() === '3,50 h');
_form = { hs:'22:00', hi:'01:00', reg:'CON' };
t('calcularHoras(): cruce de medianoche 22:00-01:00 = 3,00 h', () => calcularHoras() === '3,00 h');
_form = { hs:'09:00', hi:'12:30', reg:'SIN' };
t('calcularHoras(): sin regreso (DIA) 09:00 -> 8,00 h (hasta 17:00)', () => calcularHoras() === '8,00 h');
_form = { hs:'23:00', hi:'', reg:'SIN', turno:'TARDE' };
t('calcularHoras(): sin regreso (TARDE) 23:00 -> 2,00 h (hasta 01:00)', () => calcularHoras() === '2,00 h');
_form = { hs:'03:00', hi:'', reg:'SIN', turno:'NOCHE' };
t('calcularHoras(): sin regreso (NOCHE) 03:00 -> 2,50 h (hasta 05:30)', () => calcularHoras() === '2,50 h');
_form = { hs:'', hi:'10:00', reg:'ING', turno:'DIA' };
t('calcularHoras(): ingreso a planta (DIA) 10:00 -> 2,00 h (desde 08:00)', () => calcularHoras() === '2,00 h');
_form = { hs:'09:00', hi:'', reg:'CON' };
t('calcularHoras(): con regreso sin hora ingreso -> —', () => calcularHoras() === '—');
t('_horasTrabajadasDe: fórmula del sheet (9−L, tope 8,5 si >5)', () => _horasTrabajadasDe(4)===5 && _horasTrabajadasDe(0.67)===7.83 && _horasTrabajadasDe(7.25)===1.75 && _horasTrabajadasDe(0)===8.5);
t('calcularHorasTrabajadas: SIN DIA 14:00 -> 5,5 trabajadas', () => calcularHorasTrabajadas({turno:'DIA',tipo_regreso:'SIN',hora_salida:'14:00'})===5.5);
t('calcularHorasPermiso: redondea a 2 decimales (14:38 -> 2,37)', () => calcularHorasPermiso({turno:'DIA',tipo_regreso:'SIN',hora_salida:'14:38'})===2.37);
t('reporte media jornada: HORAS TRABAJADAS y subtotales solo con datos', () => {
  _SOLIC=[{id:'m1',tipo:'MEDIA_JORNADA',codigo:'M1',nombre:'X',inicio:'2026-10-01',turno:'DIA',tipo_regreso:'SIN',hora_salida:'11:20',estado:'APROBADO'}];
  _recAnio=''; _recMeses=[]; _recDesde=''; _recHasta=''; _recTipo=''; _recTurno=''; recQ=''; _diaExpand={};
  var h=renderPorDia('MEDIA_JORNADA','Registros media jornada','#1C8A5B',1);
  var ok=h.indexOf('HORAS TRABAJADAS')>=0 && h.indexOf('Subtotal HORAS DE PERMISO')>=0 && h.indexOf('Total TARDE')<0 && h.indexOf('Total NOCHE')<0 && h.indexOf('Suma total')<0;
  _SOLIC=[]; return ok;
});
t('reporte media jornada: con 2 turnos aparece Suma total', () => {
  _SOLIC=[
    {id:'m1',tipo:'MEDIA_JORNADA',codigo:'M1',nombre:'X',inicio:'2026-10-01',turno:'DIA',tipo_regreso:'SIN',hora_salida:'11:20',estado:'APROBADO'},
    {id:'m2',tipo:'MEDIA_JORNADA',codigo:'M2',nombre:'Y',inicio:'2026-10-01',turno:'TARDE',tipo_regreso:'SIN',hora_salida:'20:00',estado:'APROBADO'}
  ];
  _recAnio=''; _recMeses=[]; _recDesde=''; _recHasta=''; _recTipo=''; _recTurno=''; recQ=''; _diaExpand={};
  var h=renderPorDia('MEDIA_JORNADA','Registros media jornada','#1C8A5B',1);
  var ok=h.indexOf('Total DIA')>=0 && h.indexOf('Total TARDE')>=0 && h.indexOf('Total NOCHE')<0 && h.indexOf('Subtotal HORAS DE PERMISO')>=0;
  _SOLIC=[]; return ok;
});

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
t('recToggleEstado agrega/quita', () => {
  _page='home'; _SOLIC=[]; _recEstados=['EN CURSO','POR TOMAR'];
  recToggleEstado('FINALIZADAS'); var ok=_recEstados.length===3;
  recToggleEstado('FINALIZADAS'); ok=ok&&_recEstados.length===2;
  return ok;
});
t('recSetTodosEstados alterna; recEstadosLbl', () => {
  _page='home'; _SOLIC=[]; _recEstados=['EN CURSO','POR TOMAR'];
  var lbl=recEstadosLbl();
  recSetTodosEstados(); var ok=_recEstados.length===3;
  recSetTodosEstados(); ok=ok&&_recEstados.length===0;
  var vacio=recEstadosLbl();
  _recEstados=['EN CURSO','POR TOMAR'];
  return lbl==='2 estados' && vacio==='Estado' && ok;
});
t('setRecIdx(2): vacaciones sin filtro de fecha (todas)', () => {
  _page='home'; _SOLIC=[]; _recAnio=''; _recMeses=[]; _recDesde=''; _recHasta='';
  setRecIdx(2);
  var ok=_recMeses.length===0 && !_recDesde && !_recHasta && !_recAnio;
  recClearFilters(); return ok;
});
t('setRecIdx(0): dia completo usa mes actual + siguiente', () => {
  _page='home'; _SOLIC=[]; _recAnio=''; _recMeses=[]; _recDesde=''; _recHasta='';
  setRecIdx(0);
  var d=new Date(), m=d.getMonth()+1, m2=(m+1)>12?1:(m+1);
  var ok=_recMeses.length===2 && _recMeses.indexOf(m)>=0 && _recMeses.indexOf(m2)>=0;
  recClearFilters(); return ok;
});
t('recSetMesActualSiguiente: mes actual + siguiente', () => {
  _page='home'; _SOLIC=[];
  _recAnio='2020'; _recMeses=[5]; _recDesde='x'; _recHasta='x';
  recSetMesActualSiguiente();
  var d=new Date(), m=d.getMonth()+1, m2=(m+1)>12?1:(m+1);
  var ok=_recMeses.length===2 && _recMeses.indexOf(m)>=0 && _recMeses.indexOf(m2)>=0;
  recClearFilters();
  return ok;
});
t('recSetMesAnterior fija mes previo', () => { recSetMesAnterior(); var d=new Date(),m=d.getMonth()-1,a=d.getFullYear(); if(m<0){m=11;a--;} return _recMeses.length===1&&_recMeses[0]===m+1&&_recAnio===String(a); });
t('recSetTodo vacía filtros', () => { recSetTodo(); return !_recAnio&&!_recMeses.length&&!_recDesde&&!_recHasta&&!_recTipo; });
t('periodoLabel con tipo = "Todos los registros · Personal"', () => { recSetTodo(); _recTipo='PERSONAL'; return periodoLabel()==='Todos los registros · Personal'; });
t('recToggleMes agrega/quita meses', () => { recSetTodo(); recToggleMes(8); recToggleMes(9); var ok=_recMeses.length===2&&_recMeses.indexOf(8)>=0&&_recMeses.indexOf(9)>=0; recToggleMes(8); return ok&&_recMeses.length===1&&_recMeses.indexOf(8)<0; });
t('recMesesLbl sin meses = "Mes"', () => { recSetTodo(); return recMesesLbl()==='Mes'; });
t('calcularHorasPermiso: SIN DIA 14:00 -> 3 (17-14)', () => calcularHorasPermiso({turno:'DIA',tipo_regreso:'SIN',hora_salida:'14:00'})===3);
t('calcularHorasPermiso: CON 10:30-11:00 -> 0.5', () => calcularHorasPermiso({turno:'DIA',tipo_regreso:'CON',hora_salida:'10:30',hora_ingreso:'11:00'})===0.5);
t('calcularHorasPermiso: INGRESO 10:00 DIA -> 2 (10-8)', () => calcularHorasPermiso({turno:'DIA',tipo_regreso:'INGRESO',hora_ingreso:'10:00'})===2);
t('calcularHorasPermiso: usa horas_permiso si existe', () => calcularHorasPermiso({turno:'DIA',tipo_regreso:'SIN',hora_salida:'14:00',horas_permiso:3.5})===3.5);
t('abrirEditarModal/cerrarEditarModal definidos', () => typeof abrirEditarModal==='function' && typeof cerrarEditarModal==='function');
t('_tipoTexto mapea correctamente', () => _tipoTexto('MEDICO')==='Permiso Medico' && _tipoTexto('JUDICIAL')==='Permiso Judicial');
t('toggleDiaMJ alterna estado', () => { toggleDiaMJ('2026-08-12'); var a=_diaExpandMJ['2026-08-12']; toggleDiaMJ('2026-08-12'); var b=_diaExpandMJ['2026-08-12']; return a!==b; });
t('recSetTodosMeses selecciona 12', () => { recSetTodo(); recSetTodosMeses(); return _recMeses.length===12; });
t('recToggleAnio agrega/quita años', () => { _recAnios=[]; recToggleAnio('2026'); recToggleAnio('2027'); var ok=_recAnios.length===2; recToggleAnio('2026'); return ok&&_recAnios.length===1&&_recAnios[0]==='2027'; });
t('recClearFilters limpia años', () => { _recAnios=['2026']; recClearFilters(); return _recAnios.length===0; });
t('recToggleCC agrega/quita centros', () => { _recCC=[]; recToggleCC('1110'); recToggleCC('1111'); var ok=_recCC.length===2; recToggleCC('1110'); return ok&&_recCC.length===1&&_recCC[0]==='1111'; });
t('recClearFilters limpia centros', () => { _recCC=['1110']; recClearFilters(); return _recCC.length===0; });
t('recSetTodosMeses deselecciona al repetir', () => { recSetTodo(); recSetTodosMeses(); recSetTodosMeses(); return _recMeses.length===0; });
t('estadoDe: dias vacios -> POR TOMAR', () => estadoDe({dias_habiles:null,inicio:'2026-01-01'})==='POR TOMAR');
t('estadoDe: inicio futuro -> POR TOMAR', () => estadoDe({dias_habiles:10,inicio:'2099-01-01'})==='POR TOMAR');
t('estadoDe: inicio pasado -> EN CURSO', () => estadoDe({dias_habiles:10,inicio:'2020-01-01',termino:'2099-12-31'})==='EN CURSO');
t('estadoDe: termino pasado -> FINALIZADAS', () => estadoDe({dias_habiles:10,inicio:'2020-01-01',termino:'2020-02-01'})==='FINALIZADAS');
t('estadoDe: termino futuro -> EN CURSO', () => estadoDe({dias_habiles:10,inicio:'2026-01-01',termino:'2099-12-31'})==='EN CURSO');
t('recClearFilters limpia turno', () => { _recTurno='DIA'; recClearFilters(); return _recTurno===''; });
t('periodoLabel con turno = "... · Día"', () => { recSetTodo(); _recTurno='DIA'; return periodoLabel().indexOf('· Día')>=0; });
t('aplicarRangoMeses: agosto 2026 = 01-08 a 31-08', () => { recSetTodo(); _recFechaAuto=true; _recAnio='2026'; _recMeses=[8]; aplicarRangoMeses(); return _recDesde==='2026-08-01'&&_recHasta==='2026-08-31'; });
t('aplicarRangoMeses: febrero 2026 (bisiesto) = 01-02 a 28-02', () => { recSetTodo(); _recFechaAuto=true; _recAnio='2026'; _recMeses=[2]; aplicarRangoMeses(); return _recHasta==='2026-02-28'; });
t('aplicarRangoMeses: sin meses limpia fechas', () => { recSetTodo(); _recFechaAuto=true; _recMeses=[]; aplicarRangoMeses(); return !_recDesde&&!_recHasta; });

// centro de costo automático desde el empleado
t('pickChooseFrom: centro de costo automático (match _CC)', () => {
  _page='home'; _SOLIC=[];
  _CC=[{c:'1110',n:'1110 -PRODUCCIÓN (FS)'}];
  _form={turno:'',tipo:'',emp:null,aut:null,cc:null,dates:[],com:'',file:'',reg:'CON',hs:'',hi:'',start:null,dias:5};
  _tab=0; _pickerType='emp';
  pickChooseFrom([{c:'M1',n:'PEREZ SOTO JUAN',cc:'1110 -PRODUCCIÓN (FS)',tipo:'INDEFINIDO'}],0);
  return !!_form.emp && _form.emp.c==='M1' && !!_form.cc && _form.cc.n==='1110 -PRODUCCIÓN (FS)';
});
t('pickChooseFrom: centro de costo cae al valor del empleado si no está en _CC', () => {
  _page='home'; _SOLIC=[];
  _CC=[];
  _form={turno:'',tipo:'',emp:null,aut:null,cc:null,dates:[],com:'',file:'',reg:'CON',hs:'',hi:'',start:null,dias:5};
  _tab=0; _pickerType='emp';
  pickChooseFrom([{c:'M2',n:'LOPEZ',cc:'1118 -RECEPCIÓN MATERIA PRIMA(FS)',tipo:'INDEFINIDO'}],0);
  return !!_form.cc && _form.cc.n==='1118 -RECEPCIÓN MATERIA PRIMA(FS)';
});
t('fieldStatic: muestra el valor y no es clickeable', () => {
  var s=fieldStatic('Se completa al elegir el empleado',{c:'1110',n:'1110 -PRODUCCIÓN (FS)'},'Centro de costo',true);
  return s.indexOf('1110 -PRODUCCIÓN (FS)')>=0 && s.indexOf('onclick')<0;
});

// documentos locales
t('_docNombre: codigo + nombre + extension original', () => _docNombre('M9380','CHIGUAY MARIO ANITA MARIA','certificado.pdf')==='M9380 CHIGUAY MARIO ANITA MARIA.pdf');
t('_docNombre: sin extension', () => _docNombre('M1','PEREZ','doc')==='M1 PEREZ');
t('_docNombre: limpia caracteres invalidos', () => _docNombre('M1','A/B:C*D?E"F<G>H|I','x.pdf')==='M1 A B C D E F G H I.pdf');
t('_uuid: formato uuid', () => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(_uuid()));
t('verDocumento definido', () => typeof verDocumento==='function' && typeof guardarDocumentoLocal==='function');
t('imprimirDocumento definido', () => typeof imprimirDocumento==='function');
t('onFormFileChange: guarda nombre y objeto', () => {
  _form={file:'',fileObj:null};
  onFormFileChange({files:[{name:'cert.pdf'}]});
  return _form.file==='cert.pdf' && !!_form.fileObj && _form.fileObj.name==='cert.pdf';
});
t('onFormFileChange: limpia si no hay archivo', () => {
  _form={file:'x.pdf',fileObj:{name:'x.pdf'}};
  onFormFileChange({files:[]});
  return _form.file==='' && _form.fileObj===null;
});
t('_attr escapa comillas y signos', () => _attr('a"b<c>&d')==='a&quot;b&lt;c&gt;&amp;d');
t('_cuerpoCompletoHTML: muestra el item si hay documento local', () => {
  recSetTodo(); _page='home';
  _SOLIC=[{tipo:'COMPLETO',estado:'APROBADO',id:'abc',codigo:'M1',nombre:'X',inicio:hoy(),tipo_permiso:'PERSONAL',archivo:null}];
  _docIds={'abc':true};
  return _cuerpoCompletoHTML().indexOf('verDocumento')>=0;
});
t('_cuerpoCompletoHTML: muestra el item si el registro tiene archivo (no local)', () => {
  recSetTodo(); _page='home';
  _SOLIC=[{tipo:'COMPLETO',estado:'APROBADO',id:'xyz',codigo:'M2',nombre:'Y',inicio:hoy(),tipo_permiso:'PERSONAL',archivo:'cert.pdf'}];
  _docIds={};
  return _cuerpoCompletoHTML().indexOf('verDocumento')>=0;
});
t('_cuerpoCompletoHTML: sin documento no muestra el item', () => {
  recSetTodo(); _page='home';
  _SOLIC=[{tipo:'COMPLETO',estado:'APROBADO',id:'n1',codigo:'M3',nombre:'Z',inicio:hoy(),tipo_permiso:'PERSONAL',archivo:null}];
  _docIds={};
  return _cuerpoCompletoHTML().indexOf('verDocumento')<0;
});

// carpeta de guardado
t('cargarCarpetaConfig/conectarCarpeta definidos', () => typeof cargarCarpetaConfig==='function' && typeof conectarCarpeta==='function');
t('renderForm: muestra la carpeta configurada y su estado', () => {
  _dirTabs={}; _dirHandle={name:'Permisos'}; _dirName='Permisos'; _dirConectada=true; _tab=0;
  _form={turno:'DIA',tipo:'PERSONAL',emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO'},aut:null,cc:{c:'1110',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:null,dias:5};
  var h=renderForm();
  var ok=h.indexOf('Carpeta: Permisos')>=0 && h.indexOf('✅')>=0;
  _dirHandle=null; _dirName=''; _dirConectada=false;
  return ok;
});
t('renderForm: sin carpeta muestra "Elegir carpeta"', () => {
  _dirTabs={}; _dirHandle=null; _dirName=''; _dirConectada=false; _tab=0;
  _form={turno:'DIA',tipo:'PERSONAL',emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO'},aut:null,cc:{c:'1110',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:null,dias:5};
  return renderForm().indexOf('Elegir carpeta de guardado')>=0;
});
t('renderForm: carpeta por pestaña se marca en verde', () => {
  _dirName='Global'; _dirConectada=true; _tab=0;
  _dirTabs={'0':{handle:{name:'Permisos'},name:'Permisos',conectada:true}};
  _form={turno:'DIA',tipo:'PERSONAL',emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO'},aut:null,cc:{c:'1110',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:null,dias:5};
  var h=renderForm();
  var ok=h.indexOf('Carpeta: Permisos')>=0 && h.indexOf('color:var(--green)')>=0;
  _dirTabs={};
  return ok;
});
t('_carpetaObligatoriaOk: requiere carpeta configurada', () => {
  _dirHandle=null; _dirConectada=false; _dirTabs={};
  var a=_carpetaObligatoriaOk();
  _dirHandle={name:'x'}; _dirConectada=true;
  var b=_carpetaObligatoriaOk();
  _dirHandle=null; _dirConectada=false; _dirTabs={'0':{handle:{},conectada:true}};
  var c=_carpetaObligatoriaOk();
  _dirTabs={}; _dirHandle=null; _dirConectada=false;
  return a===false && b===true && c===true;
});
t('dirDeTab: cada pestaña tiene su propia carpeta', () => {
  _dirTabs={'0':{handle:{name:'A'},name:'A',conectada:true},'2':{handle:{name:'B'},name:'B',conectada:true}};
  var a=dirDeTab(0), b=dirDeTab(2);
  var ok=!!a && !!b && a.name==='A' && b.name==='B';
  _dirTabs={};
  return ok;
});
t('dirDeTab: sin carpeta de pestaña usa la predeterminada', () => {
  _dirTabs={}; _dirHandle={name:'Def'}; _dirName='Def'; _dirConectada=true;
  var d=dirDeTab(2);
  var ok=!!d && d.name==='Def' && d.esDefault===true;
  _dirHandle=null; _dirName=''; _dirConectada=false;
  return ok;
});
t('guardarDocumentoLocal acepta handle por solicitud', () => guardarDocumentoLocal.length>=6);
t('elegirCarpetaSolicitud definido', () => typeof elegirCarpetaSolicitud==='function');
t('_iniciales: primeras letras del nombre', () => _iniciales('ALFREDO VILLARROEL')==='AV');
t('editor responsables definido', () => typeof abrirEditorResponsables==='function' && typeof agregarResponsable==='function' && typeof quitarResponsable==='function');
t('editar responsable definido', () => typeof editarResponsable==='function' && typeof guardarEdicionResponsable==='function' && typeof cancelarEditarResponsable==='function');
t('_unidadVac: valida 1110-1114', () => _unidadVac('1110 -PRODUCCIÓN')===true && _unidadVac('1115 -OTRA')===false && _unidadVac('UN 1113')===true);
t('_fetchAll definido', () => typeof _fetchAll==='function');
t('_anosServicio: null sin fecha', () => _anosServicio(null)===null);
t('_anosServicio: fecha futura -> 0', () => _anosServicio('2999-01-01')===0);
t('_anosServicio: >=25 para 2000', () => _anosServicio('2000-01-01')>=25);
t('_diasProgresivos Art.68: base 10 años, primer día adicional a los 13', () => _diasProgresivos(9)===0 && _diasProgresivos(10)===0 && _diasProgresivos(12)===0 && _diasProgresivos(13)===1 && _diasProgresivos(16)===2 && _diasProgresivos(19)===3 && _diasProgresivos(22)===4 && _diasProgresivos(25)===5 && _diasProgresivos(30)===5);
t('_diasFeriadoTotal base(20 Aysén)+prog+sindicales(5)', () => _diasFeriadoTotal(5)===25 && _diasFeriadoTotal(12)===25 && _diasFeriadoTotal(13)===26 && _diasFeriadoTotal(25)===30);
t('DIAS_SINDICALES = 5', () => DIAS_SINDICALES===5);
t('_asignacionDias: base/sind usan override; prog por ley salvo acreditado > 0', () => {
  var a=_asignacionDias({baseOverride:18,progOverride:7,sindOverride:3},16);
  var b=_asignacionDias({progOverride:0},16);      // 0 = usar el automático
  var c=_asignacionDias({},16);
  return a.base===18 && a.prog===7 && a.sind===3 && b.prog===_diasProgresivos(16) && c.prog===_diasProgresivos(16);
});
t('_asignacionDias: sin overrides usa ley/referencia', () => { var a=_asignacionDias({},16); return a.base===20&&a.prog===_diasProgresivos(16)&&a.sind===5; });
t('_asignacionDias: 2 años -> progresivo 0 por ley (o el acreditado si es > 0)', () => {
  return _asignacionDias({progOverride:9},2).prog===9 && _asignacionDias({progOverride:0},2).prog===0 && _asignacionDias({},2).prog===0;
});
t('_usoDias: suma por bolsa del año en curso e ignora otros años', () => {
  var y=String(new Date().getFullYear());
  _SOLIC=[
    {tipo:'VACACIONES',codigo:'M1',dias_habiles:3,tipo_dias:'BASE',estado:'APROBADO',inicio:y+'-03-01'},
    {tipo:'VACACIONES',codigo:'M1',dias_habiles:2,tipo_dias:'PROGRESIVO',estado:'APROBADO',inicio:y+'-04-01'},
    {tipo:'VACACIONES',codigo:'M1',dias_habiles:1,tipo_dias:'SINDICAL',estado:'APROBADO',inicio:y+'-05-01'},
    {tipo:'VACACIONES',codigo:'M1',dias_habiles:9,tipo_dias:'BASE',estado:'ANULADO',inicio:y+'-06-01'},
    {tipo:'VACACIONES',codigo:'M1',dias_habiles:7,tipo_dias:'BASE',estado:'APROBADO',inicio:(+y-1)+'-06-01'},
    {tipo:'COMPLETO',codigo:'M1',dias_habiles:5,tipo_dias:'BASE',inicio:y+'-06-01'}
  ];
  var u=_usoDias('M1');
  var ok=u.base===3&&u.prog===2&&u.sind===1;
  _SOLIC=[];
  return ok;
});
t('_usoDias: usa desglose dias_base/progresivo/sindical', () => {
  var y=String(new Date().getFullYear());
  _SOLIC=[
    {tipo:'VACACIONES',codigo:'M2',dias_habiles:6,dias_base:4,dias_progresivo:0,dias_sindical:2,estado:'PENDIENTE',inicio:y+'-07-01'}
  ];
  var u=_usoDias('M2');
  var ok=u.base===4&&u.prog===0&&u.sind===2;
  _SOLIC=[];
  return ok;
});
t('_usoDias: reparte vacaciones a caballo de año', () => {
  _SOLIC=[{tipo:'VACACIONES',codigo:'M1',inicio:'2025-12-29',termino:'2026-01-05',dias_habiles:5,dias_base:5,dias_progresivo:0,dias_sindical:0,estado:'APROBADO'}];
  var u25=_usoDias('M1',null,'2025');
  var u26=_usoDias('M1',null,'2026');
  var ok=(u25.base+u26.base)===5 && u25.base>0 && u26.base>0;
  _SOLIC=[]; return ok;
});
t('_usoDias: usa dias_habiles si el desglose viene en 0', () => {
  var y=String(new Date().getFullYear());
  _SOLIC=[{tipo:'VACACIONES',codigo:'M1',inicio:y+'-09-16',dias_habiles:1,dias_base:0,dias_progresivo:0,dias_sindical:0,estado:'APROBADO'}];
  var u=_usoDias('M1');
  var ok=u.base===1 && u.prog===0 && u.sind===0;
  _SOLIC=[]; return ok;
});
t('setDiasEmpleado/segBtnDias definidos', () => typeof setDiasEmpleado==='function' && typeof segBtnDias==='function');
t('_fechaPapeleta: fecha larga en español', () => _fechaPapeleta('2026-09-25')==='25 de septiembre de 2026');
t('_diaSemana: 2026-09-29 -> martes', () => _diaSemana('2026-09-29')==='martes');
t('_siguienteHabil: viernes -> lunes', () => _siguienteHabil('2026-09-04')==='2026-09-07');
t('vacEnd: sindicales incluyen sábado; normales no', () => vacEnd('2026-09-03',3,true)==='2026-09-05' && vacEnd('2026-09-03',3,false)==='2026-09-07');
t('_finVacaciones: solo sindicales incluyen sábado', () => _finVacaciones({start:'2026-09-03',tomarBase:0,tomarProg:0,tomarSind:3})==='2026-09-05');
t('_finVacaciones: legal L-V + sindicales L-S (sindical puede iniciar sábado)', () => _finVacaciones({start:'2026-09-03',tomarBase:2,tomarProg:0,tomarSind:3})==='2026-09-08');
t('_finVacaciones: sindicales pueden iniciar sábado', () => _finVacaciones({start:'2026-09-05',tomarBase:0,tomarProg:0,tomarSind:2})==='2026-09-07');
t('generarPapeletas/_generarDocx/_papeletaBaseMap definidos', () => typeof generarPapeletas==='function' && typeof _generarDocx==='function' && typeof _papeletaBaseMap==='function');
t('_guardarSolicitud definido', () => typeof _guardarSolicitud==='function');
t('iniciarEdicionVacacion/_empDeCodigo definidos', () => typeof iniciarEdicionVacacion==='function' && typeof _empDeCodigo==='function');
t('_empDeCodigo encuentra por código', () => { _EMP=[{c:'M1',n:'A',ing:'2000-01-01'}]; var e=_empDeCodigo('m1'); var ok=!!e&&e.c==='M1'; _EMP=[]; return ok; });
t('resumenVacaciones: agrupado por AÑO (colapsable) + meses al expandir', () => {
  _resInit=true; _resAnios=['2026']; _resCC=[]; _resVacExpand={}; _resAnioExpand={};
  var items=[{tipo:'VACACIONES',inicio:'2026-03-10',termino:'2026-03-15',dias_habiles:5,centro_costo:'1110',nombre:'X',codigo:'M1'}];
  var colapsado=resumenVacaciones(items);
  _resAnioExpand={ '2026': true };
  var expandido=resumenVacaciones(items);
  var ok = colapsado.indexOf('Año 2026')>=0 && colapsado.indexOf('2026-mar')<0
        && expandido.indexOf('2026-mar')>=0 && expandido.indexOf('días')>=0 && expandido.indexOf('registros')>=0;
  _resAnios=[]; _resCC=[]; _resInit=false; _resAnioExpand={}; _resVacExpand={};
  return ok;
});
t('recTotal(2): cuenta vacaciones (no días)', () => {
  _SOLIC=[{tipo:'VACACIONES',dias_habiles:10},{tipo:'VACACIONES',dias_habiles:5},{tipo:'COMPLETO'}];
  var ok=recTotal(2)==='Total: 2 vacaciones';
  _SOLIC=[]; return ok;
});
t('renderForm en edición muestra "Edición de vacaciones"', () => {
  _tab=2; _dirTabs={}; _dirHandle=null; _dirName=''; _dirConectada=false; _SOLIC=[];
  _editSolId='rec1';
  _form={turno:'',tipo:'',emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO',ing:'2000-01-01',baseOverride:null,progOverride:null,sindOverride:null},aut:null,cc:{c:'1',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:'2026-09-01',dias:0,tipoDias:'BASE',maxDias:null,tomarBase:0,tomarProg:0,tomarSind:0};
  var h=renderForm();
  var ok=h.indexOf('Edición de vacaciones')>=0 && h.indexOf('Guardar cambios')>=0;
  _editSolId=null; _tab=0; _form={};
  return ok;
});
t('_papeletaBaseMap arma días y fechas', () => {
  var f={start:'2026-09-01',tomarBase:2,tomarProg:1,tomarSind:0,emp:{c:'M1',n:'PEREZ'},cc:{n:'1110 -X'}};
  var m=_papeletaBaseMap(f);
  return m.F5==='2' && m.F6==='1' && m.F7==='3' && m.Inicio==='01' && m.F11==='09' && m.F12==='2026' && m.Fin==='03';
});
t('_papeletaBaseMap: con progresivos (sin legales) sí pone fechas', () => {
  var f={start:'2026-09-01',tomarBase:0,tomarProg:2,tomarSind:3,emp:{c:'M1',n:'PEREZ'},cc:{n:'x'}};
  var m=_papeletaBaseMap(f);
  return m.F5==='0' && m.F6==='2' && m.F7==='2' && m.Inicio==='01' && m.F12==='2026' && m.Fin==='02';
});
t('_papeletaBaseMap: solo sindicales -> 1er cuadro de fechas en blanco', () => {
  var f={start:'2026-09-01',tomarBase:0,tomarProg:0,tomarSind:3,emp:{c:'M1',n:'PEREZ'},cc:{n:'x'}};
  var m=_papeletaBaseMap(f);
  return m.F7==='0' && m.Inicio==='' && m.F12==='' && m.Fin==='';
});
t('_usoDias: excluye el registro en edición', () => {
  var y=String(new Date().getFullYear());
  _SOLIC=[{id:'x',tipo:'VACACIONES',codigo:'M1',dias_habiles:5,dias_base:5,estado:'APROBADO',inicio:y+'-03-01'}];
  var u=_usoDias('M1','x');
  var ok=u.base===0 && u.prog===0 && u.sind===0;
  _SOLIC=[]; return ok;
});
t('_proximaVacacionRec: devuelve el registro futuro más cercano', () => {
  _SOLIC=[
    {id:'a',tipo:'VACACIONES',codigo:'M1',inicio:'2000-01-01',estado:'APROBADO'},
    {id:'c',tipo:'VACACIONES',codigo:'M1',inicio:'2999-01-01',estado:'APROBADO'},
    {id:'b',tipo:'VACACIONES',codigo:'M1',inicio:'2500-01-01',estado:'APROBADO'}
  ];
  var r=_proximaVacacionRec('M1');
  var ok=!!r && r.id==='b';
  _SOLIC=[];
  return ok;
});
t('renderForm Vacaciones: aviso de programadas + botón editar', () => {
  _tab=2; _dirTabs={}; _dirHandle=null; _dirName=''; _dirConectada=false;
  _SOLIC=[{id:'v1',tipo:'VACACIONES',codigo:'M1',inicio:'2999-01-01',termino:'2999-01-10',dias_habiles:8,estado:'APROBADO'}];
  _form={turno:'',tipo:'',emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO',ing:'2000-01-01',baseOverride:null,progOverride:null,sindOverride:null},aut:null,cc:{c:'1110',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:null,dias:0,tipoDias:'BASE',maxDias:null,tomarBase:0,tomarProg:0,tomarSind:0};
  var h=renderForm();
  var ok=h.indexOf('Vacaciones programadas')>=0 && h.indexOf("editarRegistroPermiso('v1')")>=0;
  _tab=0; _form={}; _SOLIC=[];
  return ok;
});
t('renderForm Vacaciones: interfaz compacta con steppers y editar', () => {
  _tab=2; _dirTabs={}; _dirHandle=null; _dirName=''; _dirConectada=false; _SOLIC=[];
  _form={turno:'',tipo:'',emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO',ing:'2000-01-01',baseOverride:null,progOverride:null,sindOverride:null},aut:null,cc:{c:'1110',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:'2026-09-01',dias:0,tipoDias:'BASE',maxDias:null,tomarBase:0,tomarProg:0,tomarSind:0};
  var h=renderForm();
  var ok=h.indexOf('Total solicitado')>=0 && h.indexOf('_setTomar')>=0 && h.indexOf('editarAsignado')>=0 && h.indexOf('Disponible')>=0 && h.indexOf('Última vacaciones')>=0 && h.indexOf('Fecha de ingreso')>=0;
  _tab=0; _form={tipoDias:'BASE'};
  return ok;
});
t('_calIrHoy: vuelve al mes actual', () => {
  _page='home'; _SOLIC=[]; _cal={y:2000,m:5};
  _calIrHoy();
  var d=new Date();
  return _cal.y===d.getFullYear() && _cal.m===d.getMonth();
});
t('resetForm: deja el calendario en el mes actual', () => {
  _cal={y:2000,m:5}; _form=null;
  resetForm();
  var d=new Date();
  return _cal.y===d.getFullYear() && _cal.m===d.getMonth();
});
t('calClick dia completo: bloquea domingo y feriado', () => {
  _tab=0; _form={dates:[],tipo:'PERSONAL'}; _SOLIC=[];
  calClick('2026-09-06');   // domingo -> bloqueado
  var ok=_form.dates.length===0;
  calClick('2026-09-18');   // feriado -> bloqueado
  ok = ok && _form.dates.length===0;
  calClick('2026-09-01');   // martes -> permitido
  ok = ok && _form.dates.indexOf('2026-09-01')>=0;
  _tab=0; return ok;
});
t('calClick media jornada: bloquea domingo', () => {
  _tab=1; _form={dates:[]}; _SOLIC=[];
  calClick('2026-09-06');   // domingo -> bloqueado
  var ok=_form.dates.length===0;
  calClick('2026-09-02');   // miércoles -> permitido
  ok = ok && _form.dates[0]==='2026-09-02';
  _tab=0; return ok;
});
t('calClick vacaciones: bloquea domingo, permite sábado', () => {
  _tab=2; _form={start:null};
  calClick('2026-09-06');            // domingo -> bloqueado
  var ok=_form.start===null;
  calClick('2026-09-05');            // sábado -> permitido
  ok=ok && _form.start==='2026-09-05';
  _tab=0; return ok;
});
t('_diasRow: muestra "automático" cuando el asignado difiere', () => {
  var h=_diasRow('prog','Progresivo','#16794E',2,0,2,0,0,true);
  return h.indexOf('automático 0')>=0;
});
t('_diasRow: sin ✎ cuando no es editable', () => {
  var h=_diasRow('prog','Progresivo','#16794E',0,0,0,0,0,false);
  return h.indexOf('editarAsignado')<0 && h.indexOf('✎')<0;
});
t('renderForm Vacaciones: progresivo en 0 si no corresponde, y respeta el acreditado', () => {
  _tab=2; _dirTabs={}; _dirHandle=null; _dirName=''; _dirConectada=false; _SOLIC=[];
  var base={turno:'',tipo:'',aut:null,cc:{c:'1110',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:null,dias:0,tipoDias:'BASE',maxDias:null,tomarBase:0,tomarProg:0,tomarSind:0};
  var fD=function(n){ return String(Math.round(n*100)/100).replace('.',','); };
  _form=Object.assign({},base,{emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO',ing:'2024-01-02',baseOverride:null,progOverride:null,sindOverride:null}});
  var hSin=renderForm(), dSin=_dispPorBolsa();
  _form=Object.assign({},base,{emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO',ing:'2024-01-02',baseOverride:null,progOverride:3,sindOverride:null}});
  var hCon=renderForm(), dCon=_dispPorBolsa();
  var ok=dSin.prog===0 && hSin.indexOf('Disponible 0 de 0')>=0
      && dCon.prog>0 && hCon.indexOf('Disponible '+fD(dCon.prog)+' de '+fD(dCon.prog))>=0;
  _tab=0; _form={tipoDias:'BASE'};
  return ok;
});
t('_diasProgresivos: 2 años -> 0 (base de la consulta)', () => _diasProgresivos(2)===0);
t('_ultimaVacacion: última tomada (ignora futuras y anuladas)', () => {
  _SOLIC=[
    {tipo:'VACACIONES',codigo:'M1',inicio:'2000-01-01',termino:'2000-01-10',estado:'APROBADO'},
    {tipo:'VACACIONES',codigo:'M1',inicio:'2999-01-01',termino:'2999-01-10',estado:'APROBADO'},
    {tipo:'VACACIONES',codigo:'M1',inicio:'2050-05-01',termino:'2050-05-10',estado:'ANULADO'}
  ];
  var ok=_ultimaVacacion('M1')==='2000-01-10';
  _SOLIC=[];
  return ok;
});
t('_proximaVacacion: la futura más cercana (ignora pasadas y anuladas)', () => {
  _SOLIC=[
    {tipo:'VACACIONES',codigo:'M1',inicio:'2000-01-01',termino:'2000-01-10',estado:'APROBADO'},
    {tipo:'VACACIONES',codigo:'M1',inicio:'2999-01-01',termino:'2999-01-10',estado:'APROBADO'},
    {tipo:'VACACIONES',codigo:'M1',inicio:'2050-05-01',termino:'2050-05-10',estado:'ANULADO'},
    {tipo:'VACACIONES',codigo:'M1',inicio:'2500-01-01',termino:'2500-01-10',estado:'APROBADO'}
  ];
  var ok=_proximaVacacion('M1')==='2500-01-01';
  _SOLIC=[];
  return ok;
});
t('_tomarTodo: llena todas las bolsas con el saldo del ledger', () => {
  _tab=2; _SOLIC=[]; _editSolId=null;
  _form={emp:{c:'M1',ing:'2000-01-01',baseOverride:null,progOverride:null,sindOverride:null},tomarBase:0,tomarProg:0,tomarSind:0,dias:0};
  var d=_dispPorBolsa();
  _tomarTodo();
  var ok=_form.tomarBase===d.base && _form.tomarProg===d.prog && _form.tomarSind===d.sind && _form.dias===d.base+d.prog+d.sind
    && Math.abs(_form.dias-_periodosVacaciones(_form.emp).saldoDisponible)<0.011;
  _tab=0; _form={}; return ok;
});
t('renderCalendar: colorea días de vacaciones por bolsa', () => {
  _tab=2; _cal={y:2026,m:8}; _SOLIC=[];
  _form={turno:'',tipo:'',emp:null,aut:null,cc:null,dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:'2026-09-01',dias:3,tipoDias:'MIXTO',maxDias:null,tomarBase:2,tomarProg:1,tomarSind:0};
  var h=renderCalendar();
  var ok=h.indexOf('#E7E5FB')>=0 && h.indexOf('#DFF3E9')>=0 && h.indexOf('Sindicales')>=0;
  _tab=0; _form={};
  return ok;
});
t('cargarSolicitudes es async', () => cargarSolicitudes && cargarSolicitudes.constructor && cargarSolicitudes.constructor.name==='AsyncFunction');
t('_empListaPicker vacaciones: +unidades excluidas 1110-1114 INDEFINIDO', () => {
  _tab=2;
  _EMP=[{c:'M1',n:'A',cc:'1110 -X',tipo:'INDEFINIDO'},{c:'M2',n:'B',cc:'1110 -X',tipo:'PLAZO FIJO'}];
  _EMP_EXCL=[{c:'M3',n:'C',cc:'1112 -SUPERVISORES(FS)',tipo:'INDEFINIDO'},{c:'M4',n:'D',cc:'1115 -GERENCIA(FS)',tipo:'INDEFINIDO'},{c:'M5',n:'E',cc:'1113 -CONTROL(FS)',tipo:'PLAZO FIJO'}];
  var cs=_empListaPicker().map(function(e){return e.c;});
  var ok=cs.indexOf('M1')>=0 && cs.indexOf('M3')>=0 && cs.indexOf('M2')<0 && cs.indexOf('M4')<0 && cs.indexOf('M5')<0;
  _tab=0; _EMP=[]; _EMP_EXCL=[];
  return ok;
});
t('_empListaPicker no-vacaciones usa solo empleados', () => {
  _tab=0; _EMP=[{c:'M1',n:'A',cc:'x',tipo:'X'}]; _EMP_EXCL=[{c:'M3',n:'C',cc:'y',tipo:'INDEFINIDO'}];
  var list=_empListaPicker();
  var ok=list.length===1 && list[0].c==='M1';
  _EMP=[]; _EMP_EXCL=[];
  return ok;
});
// ——— Lógica del formulario de Vacaciones ———
t('_dispPorBolsa: descuenta lo usado y coincide con el ledger', () => {
  var y=String(new Date().getFullYear());
  _tab=2; _editSolId=null;
  _form={emp:{c:'M1',ing:'2000-01-01',baseOverride:null,progOverride:null,sindOverride:null}};
  _SOLIC=[];
  var sin=_dispPorBolsa();
  _SOLIC=[{id:'u1',tipo:'VACACIONES',codigo:'M1',dias_base:2,estado:'APROBADO',inicio:y+'-02-01'}];
  var con=_dispPorBolsa();
  var led=_periodosVacaciones(_form.emp);
  var ok=!!con && Math.abs((sin.base-con.base)-2)<0.01
    && Math.abs((sin.base+sin.prog+sin.sind)-(con.base+con.prog+con.sind)-2)<0.01
    && Math.round((con.base+con.prog+con.sind)*100)/100===led.saldoDisponible;   // el formulario y el modal muestran el mismo número
  _form={}; _SOLIC=[]; _tab=0; return ok;
});
t('_dispPorBolsa: null sin fecha de ingreso', () => {
  _tab=2; _form={emp:{c:'M1',ing:null}};
  var ok=_dispPorBolsa()===null;
  _form={}; _tab=0; return ok;
});
t('_dispPorBolsa: nunca devuelve días negativos, ni con sobreuso enorme', () => {
  var y=String(new Date().getFullYear());
  _tab=2; _editSolId=null;
  _form={emp:{c:'M1',ing:'2000-01-01',baseOverride:2,progOverride:null,sindOverride:null}};
  _SOLIC=[];
  var sin=_dispPorBolsa();
  _SOLIC=[{id:'u1',tipo:'VACACIONES',codigo:'M1',dias_base:9999,estado:'APROBADO',inicio:y+'-02-01'}];
  var con=_dispPorBolsa();
  var ok=!!con && con.base>=0 && con.prog>=0 && con.sind>=0 && con.base<sin.base
    && con.prog===sin.prog && con.sind===sin.sind;   // el sobreuso de BASE no toca las otras bolsas
  _form={}; _SOLIC=[]; _tab=0; return ok;
});
t('_recalcTomar: recorta a lo disponible y fija maxDias', () => {
  var y=String(new Date().getFullYear());
  _tab=2; _editSolId=null;
  _form={emp:{c:'M1',ing:'2000-01-01',baseOverride:null,progOverride:null,sindOverride:null},tomarBase:999,tomarProg:999,tomarSind:999,dias:0};
  _SOLIC=[{id:'u1',tipo:'VACACIONES',codigo:'M1',dias_base:3,estado:'APROBADO',inicio:y+'-02-01'}];
  _recalcTomar();
  var d=_dispPorBolsa();
  var ok=_form.tomarBase===d.base && _form.tomarProg===d.prog && _form.tomarSind===d.sind && _form.maxDias===d.base+d.prog && _form.dias===d.base+d.prog+d.sind;
  _form={}; _SOLIC=[]; _tab=0; return ok;
});
t('_setTomar: recorta negativos y excedentes al saldo disponible', () => {
  _tab=2; _editSolId=null; _SOLIC=[];
  _form={emp:{c:'M1',ing:'2000-01-01',baseOverride:2,progOverride:1,sindOverride:0},tomarBase:0,tomarProg:0,tomarSind:0,dias:0};
  var d=_dispPorBolsa();
  _setTomar('base',-5); var ok=_form.tomarBase===0;
  _setTomar('base',99); ok=ok && _form.tomarBase===d.base;
  _setTomar('prog',99); ok=ok && _form.tomarProg===d.prog;
  _setTomar('sind',99); ok=ok && _form.tomarSind===d.sind;
  ok=ok && _form.dias===d.base+d.prog+d.sind && d.sind===0;
  _form={}; _tab=0; return ok;
});
t('_tomarTodo: llena lo disponible (descontando lo usado)', () => {
  var y=String(new Date().getFullYear());
  _tab=2; _editSolId=null;
  _form={emp:{c:'M1',ing:'2000-01-01',baseOverride:null,progOverride:null,sindOverride:null},tomarBase:0,tomarProg:0,tomarSind:0,dias:0};
  _SOLIC=[];
  var sinBase=_dispPorBolsa().base;
  _SOLIC=[{id:'u1',tipo:'VACACIONES',codigo:'M1',dias_base:5,estado:'APROBADO',inicio:y+'-02-01'}];
  var d=_dispPorBolsa();
  _tomarTodo();
  var ok=_form.tomarBase===d.base && _form.dias===d.base+d.prog+d.sind && Math.abs((sinBase-d.base)-5)<0.01;
  _form={}; _SOLIC=[]; _tab=0; return ok;
});
t('_papeletaInputDeRegistro: usa el desglose guardado', () => {
  var f=_papeletaInputDeRegistro({codigo:'M1',nombre:'PEREZ',centro_costo:'1110 -X',inicio:'2026-09-01T00:00:00',dias_habiles:4,dias_base:2,dias_progresivo:1,dias_sindical:1});
  return f.tomarBase===2 && f.tomarProg===1 && f.tomarSind===1 && f.dias===4 && f.start==='2026-09-01' && f.emp.c==='M1' && f.cc.n==='1110 -X';
});
t('_papeletaInputDeRegistro: fallback por tipo_dias (sin desglose)', () => {
  var a=_papeletaInputDeRegistro({codigo:'M1',inicio:'2026-09-01',dias_habiles:5,tipo_dias:'SINDICAL'});
  var b=_papeletaInputDeRegistro({codigo:'M1',inicio:'2026-09-01',dias_habiles:5});
  return a.tomarSind===5 && a.tomarBase===0 && b.tomarBase===5 && b.tomarSind===0;
});
t('generarPapeletaRegistro/_generarPapeletasDe definidos', () => typeof generarPapeletaRegistro==='function' && typeof _generarPapeletasDe==='function');
t('ficha de vacaciones: botón Generar papeleta + Editar', () => {
  _tab=2; _dirTabs={}; _dirHandle=null; _dirName=''; _dirConectada=false;
  _SOLIC=[{id:'v1',tipo:'VACACIONES',codigo:'M1',inicio:'2999-01-01',termino:'2999-01-10',dias_habiles:8,estado:'APROBADO'}];
  _form={turno:'',tipo:'',emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO',ing:'2000-01-01',baseOverride:null,progOverride:null,sindOverride:null},aut:null,cc:{c:'1110',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:null,dias:0,tipoDias:'BASE',maxDias:null,tomarBase:0,tomarProg:0,tomarSind:0};
  var h=renderForm();
  var ok=h.indexOf("generarPapeletaRegistro('v1')")>=0 && h.indexOf("editarRegistroPermiso('v1')")>=0;
  _tab=0; _form={}; _SOLIC=[]; return ok;
});
t('iniciarEdicionVacacion: mapea el calendario al mes de inicio', () => {
  _tab=0; _cal={y:2000,m:0}; _SOLIC=[];
  _EMP=[{c:'M1',n:'PEREZ',tipo:'INDEFINIDO',ing:'2000-01-01',cc:'1110 -X'}];
  iniciarEdicionVacacion({id:'s1',tipo:'VACACIONES',codigo:'M1',nombre:'PEREZ',centro_costo:'1110 -X',inicio:'2026-10-01T00:00:00',termino:'2026-10-09',dias_habiles:7,estado:'APROBADO'});
  var ok=_cal.y===2026 && _cal.m===9 && _form.start==='2026-10-01' && _form.dias===7 && _form.tomarBase===7;
  _tab=0; _form={}; _EMP=[]; _SOLIC=[]; _cal={y:new Date().getFullYear(),m:new Date().getMonth()};
  return ok;
});
t('iniciarEdicionVacacion: calcula días desde inicio/fin si faltan', () => {
  _tab=0; _cal={y:2000,m:0}; _SOLIC=[];
  _EMP=[{c:'M1',n:'PEREZ',tipo:'INDEFINIDO',ing:'2000-01-01',cc:'1110 -X'}];
  iniciarEdicionVacacion({id:'s2',tipo:'VACACIONES',codigo:'M1',nombre:'PEREZ',inicio:'2026-10-01',termino:'2026-10-07',dias_habiles:null,estado:'APROBADO'});
  var ok=_form.dias===contarHabiles('2026-10-01','2026-10-07') && _form.dias>0;
  _tab=0; _form={}; _EMP=[]; _cal={y:new Date().getFullYear(),m:new Date().getMonth()};
  return ok;
});
t('edición: conserva los días guardados aunque el saldo esté sobregirado', () => {
  var y=String(new Date().getFullYear());
  _tab=2; _dirTabs={}; _dirHandle=null; _dirName=''; _dirConectada=false;
  _SOLIC=[
    {id:'o1',tipo:'VACACIONES',codigo:'M1',dias_base:30,estado:'APROBADO',inicio:y+'-01-05'},
    {id:'s1',tipo:'VACACIONES',codigo:'M1',dias_base:8,tipo_dias:'BASE',estado:'APROBADO',inicio:y+'-10-01'}
  ];
  _editSolId='s1';
  _form={turno:'',tipo:'',emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO',ing:'2000-01-01',baseOverride:null,progOverride:null,sindOverride:null},aut:null,cc:{c:'1110',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:y+'-10-01',dias:8,tipoDias:'BASE',maxDias:null,tomarBase:8,tomarProg:0,tomarSind:0};
  var h=renderForm();
  var ok=_form.tomarBase===8 && _form.dias===8 && h.indexOf('Falta inicio')<0;
  _editSolId=null; _tab=0; _form={}; _SOLIC=[]; return ok;
});
t('_setTomar: al editar nunca baja del valor guardado', () => {
  var y=String(new Date().getFullYear());
  _tab=2; _editSolId='s1';
  _SOLIC=[{id:'o1',tipo:'VACACIONES',codigo:'M1',dias_base:30,estado:'APROBADO',inicio:y+'-01-05'}];
  // sin saldo disponible (base negociada 0) el valor guardado se conserva y no se puede subir
  _form={emp:{c:'M1',ing:'2000-01-01',baseOverride:0,progOverride:0,sindOverride:0},tomarBase:8,tomarProg:0,tomarSind:0,dias:8};
  _setTomar('base',8); var ok=_form.tomarBase===8;
  _setTomar('base',99); ok=ok && _form.tomarBase===8;
  _setTomar('base',3);  ok=ok && _form.tomarBase===3;
  // con saldo de sobra: sube hasta el disponible y puede bajar
  _form={emp:{c:'M1',ing:'2000-01-01',baseOverride:null,progOverride:null,sindOverride:null},tomarBase:8,tomarProg:0,tomarSind:0,dias:8};
  var d=_dispPorBolsa();
  _setTomar('base',99); ok=ok && _form.tomarBase===99;                      // 99 cabe en el saldo
  _setTomar('base',d.base+1000); ok=ok && _form.tomarBase===d.base;         // sobre el saldo se recorta
  _setTomar('base',3);  ok=ok && _form.tomarBase===3;
  _editSolId=null; _form={}; _SOLIC=[]; _tab=0; return ok;
});
t('renderForm Vacaciones: base y progresivo editables (progresivo para años previos)', () => {
  _tab=2; _dirTabs={}; _dirHandle=null; _dirName=''; _dirConectada=false; _SOLIC=[];
  _form={turno:'',tipo:'',emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO',ing:'2000-01-01',baseOverride:null,progOverride:9,sindOverride:null},aut:null,cc:{c:'1110',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:null,dias:0,tipoDias:'BASE',maxDias:null,tomarBase:0,tomarProg:0,tomarSind:0};
  var d=_dispPorBolsa();
  var h=renderForm();
  var fD=function(n){ return String(Math.round(n*100)/100).replace('.',','); };
  var ok=h.indexOf("editarAsignado('prog')")>=0 && h.indexOf("editarAsignado('base')")>=0
      && d.prog>9                                                  // el acreditado se aplica a cada período
      && h.indexOf('Disponible '+fD(d.prog)+' de '+fD(d.prog))>=0;
  _tab=0; _form={tipoDias:'BASE'}; return ok;
});
t('edición: progresivo se recalcula por ley (2 años -> 0)', () => {
  var y=String(new Date().getFullYear());
  _tab=2; _dirTabs={}; _dirHandle=null; _dirName=''; _dirConectada=false;
  _SOLIC=[{id:'s1',tipo:'VACACIONES',codigo:'M1',dias_base:20,dias_progresivo:2,dias_sindical:1,tipo_dias:'MIXTO',estado:'APROBADO',inicio:y+'-10-21'}];
  _editSolId='s1';
  _form={turno:'',tipo:'',emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO',ing:'2024-01-02',baseOverride:null,progOverride:null,sindOverride:null},aut:null,cc:{c:'1110',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:y+'-10-21',dias:23,tipoDias:'MIXTO',maxDias:null,tomarBase:20,tomarProg:2,tomarSind:1};
  renderForm();
  var ok=_form.tomarProg===0 && _form.dias===21;
  _editSolId=null; _tab=0; _form={}; _SOLIC=[]; return ok;
});
t('CSS: .btn-secondary definido (evita botones en blanco)', () => /\.btn-secondary\s*\{/.test(html));
t('CSS: .btn base define fondo y color', () => /\.btn\{[^}]*background:var\(--surface\)/.test(html));
t('sidebar moderno: toggleSb + botón colapsar + íconos + rail', () => typeof toggleSb==='function' && /class="sb-collapse"/.test(html) && /\.sb-item \.ico\s*\{/.test(html) && /\.sidebar\.collapsed\s*\{/.test(html));
t('_respAgg: agrupa por responsable, suma y ordena desc', () => {
  var a=_respAgg([{autorizador:'ANA'},{autorizador:'ANA'},{autorizador:'LUIS'},{autorizador:''}], function(){return 1;});
  return a[0].label==='ANA' && a[0].value===2 && a.some(function(p){return p.label==='Sin responsable' && p.value===1;});
});
t('_donutSVG: genera svg con porcentajes', () => {
  var h=_donutSVG([{label:'A',value:3},{label:'B',value:1}]);
  return h.indexOf('<svg')>=0 && h.indexOf('75,0%')>=0 && h.indexOf('25,0%')>=0;
});
t('panel: incluye los dos gráficos por responsable', () => {
  var y=new Date().getFullYear(), m=String(new Date().getMonth()+1).padStart(2,'0');
  _SOLIC=[
    {tipo:'COMPLETO',estado:'APROBADO',inicio:y+'-'+m+'-05',autorizador:'ANA'},
    {tipo:'MEDIA_JORNADA',estado:'APROBADO',inicio:y+'-'+m+'-06',turno:'DIA',tipo_regreso:'SIN',hora_salida:'11:20',autorizador:'LUIS'}
  ];
  var h=renderHome();
  var ok=h.indexOf('Permisos día completo por responsable')>=0 && h.indexOf('Horas de media jornada por responsable')>=0 && h.indexOf('class="dn-svg"')>=0;
  _SOLIC=[]; return ok;
});
t('registros día completo: agrupa por MES (colapsable)', () => {
  _SOLIC=[{tipo:'COMPLETO',id:'c1',codigo:'H1',nombre:'X',inicio:'2026-05-11',tipo_permiso:'PERSONAL',autorizador:'A',estado:'APROBADO'}];
  _recAnio=''; _recMeses=[]; _recDesde=''; _recHasta=''; _recTipo=''; _recTurno=''; recQ=''; _diaExpandC={}; _diaExpandMes={};
  var hCol=renderDiaCompletoVista();
  var okCol=hCol.indexOf('Mayo 2026')>=0 && hCol.indexOf("toggleDiaC('2026-05-11')")<0;
  _diaExpandMes={'2026-05':true};
  var hExp=renderDiaCompletoVista();
  var okExp=hExp.indexOf('Mayo 2026')>=0 && hExp.indexOf("toggleDiaC('2026-05-11')")>=0;
  _SOLIC=[]; _diaExpandMes={}; return okCol && okExp;
});
t('registros día completo: columna RESPONSABLE (autorizador)', () => {
  _SOLIC=[{tipo:'COMPLETO',codigo:'C1',nombre:'PEREZ',inicio:'2026-10-01',tipo_permiso:'PERSONAL',autorizador:'HUGO MILLANERI',estado:'APROBADO'}];
  _recAnio=''; _recMeses=[]; _recDesde=''; _recHasta=''; _recTipo=''; _recTurno=''; recQ=''; _diaExpandC={}; _docIds={};
  var h=renderDiaCompletoVista();
  var ok=h.indexOf('RESPONSABLE')>=0 && h.indexOf('HUGO MILLANERI')>=0 && h.indexOf('FECHA PERMISO')>=0;
  _SOLIC=[]; return ok;
});
t('registros media jornada: acciones editar/eliminar por fila', () => {
  _SOLIC=[{tipo:'MEDIA_JORNADA',id:'x1',codigo:'M1',nombre:'X',inicio:'2026-10-01',turno:'DIA',tipo_regreso:'SIN',hora_salida:'11:20',autorizador:'ANA',estado:'APROBADO'}];
  _recAnio=''; _recMeses=[]; _recDesde=''; _recHasta=''; _recTipo=''; _recTurno=''; recQ=''; _diaExpand={}; _docIds={};
  var h=renderPorDia('MEDIA_JORNADA','Registros media jornada','#1C8A5B',1);
  var ok=h.indexOf("editarRegistroPermiso('x1')")>=0 && h.indexOf("eliminarRegistroPermiso('x1')")>=0;
  _SOLIC=[]; return ok;
});
t('_docBtn: siempre visible (deshabilitado sin documento)', () => {
  _docIds={};
  var a=_docBtn({id:'x1'});
  _docIds={'x2':true};
  var b=_docBtn({id:'x2'});
  var c=_docBtn({id:'x3',archivo:'http://x'});
  var ok=a.indexOf('disabled')>=0 && a.indexOf('Sin documento')>=0
    && b.indexOf("verDocumento('x2')")>=0 && b.indexOf('disabled')<0
    && c.indexOf("verDocumento('x3')")>=0;
  _docIds={}; return ok;
});
t('registros media jornada: columna RESPONSABLE', () => {
  _SOLIC=[{tipo:'MEDIA_JORNADA',codigo:'M1',nombre:'X',inicio:'2026-10-01',turno:'DIA',tipo_regreso:'SIN',hora_salida:'11:20',autorizador:'ANA PEREZ',estado:'APROBADO'}];
  _recAnio=''; _recMeses=[]; _recDesde=''; _recHasta=''; _recTipo=''; _recTurno=''; recQ=''; _diaExpand={};
  var h=renderPorDia('MEDIA_JORNADA','Registros media jornada','#1C8A5B',1);
  var ok=h.indexOf('RESPONSABLE')>=0 && h.indexOf('ANA PEREZ')>=0;
  _SOLIC=[]; return ok;
});
t('registros: NO muestran gráficos (solo en el panel)', () => {
  _SOLIC=[{tipo:'MEDIA_JORNADA',codigo:'M1',nombre:'X',inicio:'2026-10-01',turno:'DIA',tipo_regreso:'SIN',hora_salida:'11:20',autorizador:'ANA',estado:'APROBADO'}];
  _recAnio=''; _recMeses=[]; _recDesde=''; _recHasta=''; _recTipo=''; _recTurno=''; recQ=''; _diaExpand={};
  var h=renderPorDia('MEDIA_JORNADA','Registros media jornada','#1C8A5B',1);
  var ok=h.indexOf('dn-svg')<0 && h.indexOf('por responsable')<0;
  _SOLIC=[]; return ok;
});
t('header: badge de carpeta conectada (verificador)', () => {
  var box={innerHTML:''};
  var orig=document.getElementById;
  document.getElementById=function(id){ if(id==='tbActions') return box; return { classList:{add(){},remove(){},toggle(){}}, style:{}, innerHTML:'', textContent:'', value:'', querySelectorAll:function(){return[];}, querySelector:function(){return null;} }; };
  var okTxt=typeof actualizarFolderBadge==='function';
  _page='home'; _dirHandle={name:'x'}; _dirName='Documentos'; _dirConectada=true;
  actualizarFolderBadge();
  var on=box.innerHTML.indexOf('Carpeta conectada')>=0 && box.innerHTML.indexOf('Documentos')>=0;
  _dirConectada=false; box.innerHTML='';
  actualizarFolderBadge();
  var off=box.innerHTML.indexOf('Reconectar carpeta')>=0;
  document.getElementById=orig;
  _dirHandle=null; _dirName=''; _dirConectada=false; _page='home';
  return okTxt && on && off;
});
t('_anosEntre y _addAnios', () => _anosEntre('2024-01-02','2026-10-01')===2 && _anosEntre('2024-01-02','2026-01-01')===1 && _addAnios('2024-01-02',3)==='2027-01-02');
t('_periodosVacaciones: estructura y próximo aniversario', () => {
  _SOLIC=[];
  var emp={c:'M1',n:'X',ing:'2024-01-02',baseOverride:null,progOverride:null,sindOverride:null};
  var N=_anosServicio('2024-01-02');
  var d=_periodosVacaciones(emp);
  var ok=!!d && d.periodos.length===N+1 && d.proximo===((2024+N+1)+'-01-02') && d.periodos[0].desde==='2024-01-02' && d.periodos[0].hasta==='2025-01-02';
  return ok;
});
t('_periodosVacaciones: atribuye tomados por período y calcula saldo', () => {
  _SOLIC=[{tipo:'VACACIONES',codigo:'M1',inicio:'2025-03-03',termino:'2025-03-28',dias_habiles:20,estado:'APROBADO'}];
  var emp={c:'M1',n:'X',ing:'2024-01-02',baseOverride:null,progOverride:null,sindOverride:null};
  var d=_periodosVacaciones(emp);
  var ok=d.periodos[0].tomados===20 && d.periodos[0].saldo===5 && d.totalTomado===20;
  _SOLIC=[]; return ok;
});
t('verPeriodosVacaciones definido', () => typeof verPeriodosVacaciones==='function' && typeof cerrarPeriodos==='function');
t('contarHabiles: tolera timestamps', () => contarHabiles('2025-02-03T00:00:00','2025-02-17T00:00:00')===11);
t('estadoDe: vacación pasada -> FINALIZADAS', () => estadoDe({inicio:'2025-03-03',termino:'2025-03-17',dias_habiles:11})==='FINALIZADAS');
t('estadoDe: sin días -> POR TOMAR', () => estadoDe({inicio:'2025-03-03',termino:'2025-03-17',dias_habiles:0})==='POR TOMAR');
t('panel: dos filas de KPIs (resumen del mes y del día)', () => {
  _SOLIC=[
    {tipo:'COMPLETO',estado:'APROBADO',inicio:hoy()},
    {tipo:'MEDIA_JORNADA',estado:'APROBADO',inicio:hoy(),turno:'DIA',tipo_regreso:'SIN',hora_salida:'11:20'}
  ];
  var h=renderHome();
  // El KPI cuenta personas: el valor va seguido de una nota con el detalle por tipo
  var ok=h.indexOf('Resumen del mes')>=0 && h.indexOf('Resumen de hoy')>=0
      && h.indexOf('Permisos del día')>=0 && h.indexOf('Permisos del mes')>=0
      && /Permisos del día<\/div><div class="v">2/.test(h);
  _SOLIC=[]; return ok;
});
t('panel: KPIs del mes presente + vacaciones EN CURSO', () => {
  var y=new Date().getFullYear(), m=String(new Date().getMonth()+1).padStart(2,'0');
  var other=(m==='01'?'02':'01');
  _SOLIC=[
    {tipo:'COMPLETO',estado:'APROBADO',inicio:y+'-'+m+'-05'},
    {tipo:'COMPLETO',estado:'APROBADO',inicio:(y-1)+'-'+m+'-05'},
    {tipo:'MEDIA_JORNADA',estado:'APROBADO',inicio:y+'-'+m+'-06',turno:'DIA',tipo_regreso:'SIN',hora_salida:'11:20'},
    {tipo:'MEDIA_JORNADA',estado:'APROBADO',inicio:y+'-'+other+'-06',turno:'DIA',tipo_regreso:'SIN',hora_salida:'11:20'},
    {tipo:'VACACIONES',estado:'APROBADO',inicio:hoy(),termino:hoy(),dias_habiles:1},
    {tipo:'VACACIONES',estado:'APROBADO',inicio:(y-3)+'-01-01',termino:(y-3)+'-01-05',dias_habiles:5}
  ];
  var h=renderHome();
  var ok=/Permisos del mes<\/div><div class="v">2/.test(h)
      && /Medias jornadas<\/div><div class="v">1/.test(h)
      && /Vacaciones en curso<\/div><div class="v">1/.test(h);
  _SOLIC=[]; return ok;
});
t('_recFilterAnios: incluye año actual y próximo (2027)', () => {
  var y=new Date().getFullYear();
  _SOLIC=[];
  var a=_recFilterAnios();
  var ok=a.indexOf(String(y))>=0 && a.indexOf(String(y+1))>=0;
  _SOLIC=[]; return ok;
});
t('_diasProgramadosPorBolsa: cuenta solo futuras', () => {
  var y=String(new Date().getFullYear());
  var d1=new Date(hoy()+'T12:00:00'); d1.setDate(d1.getDate()+1);
  var fut=d1.toISOString().slice(0,10);
  _SOLIC=[
    {tipo:'VACACIONES',codigo:'M1',inicio:fut,termino:fut,dias_habiles:5,dias_base:5,estado:'APROBADO'},
    {tipo:'VACACIONES',codigo:'M1',inicio:y+'-01-10',termino:y+'-01-11',dias_habiles:2,dias_base:2,estado:'APROBADO'}
  ];
  var u=_diasProgramadosPorBolsa('M1',y);
  var ok=(fut.slice(0,4)!==y) || (u.base===5);
  _SOLIC=[]; return ok;
});
t('_diasProporcionales: devengo del período en curso (Art. 67/68)', () => {
  var emp={c:'M1',n:'X',ing:'2000-01-01',baseOverride:null,progOverride:null,sindOverride:null};
  var p=_diasProporcionales(emp);
  var N=_anosServicio('2000-01-01');
  var ok=!!p && p.ini===((2000+N)+'-01-01') && p.fin===((2000+N+1)+'-01-01') && p.total===25 && p.dias>0 && p.dias<=25;
  return ok;
});
t('_diasProporcionales: null sin fecha de ingreso', () => _diasProporcionales({c:'M1'})===null);
t('renderForm Vacaciones: sindicales no cuentan en el saldo (maxDias)', () => {
  _tab=2; _dirTabs={}; _dirHandle=null; _dirName=''; _dirConectada=false; _SOLIC=[];
  _form={turno:'',tipo:'',emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO',ing:'2024-01-02',baseOverride:null,progOverride:null,sindOverride:null},aut:null,cc:{c:'1110',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:null,dias:0,tipoDias:'BASE',maxDias:null,tomarBase:0,tomarProg:0,tomarSind:0};
  var d=_dispPorBolsa();
  renderForm();
  var ok=_form.maxDias===Math.round((d.base+d.prog)*100)/100
    && d.sind>0 && _form.maxDias!==Math.round((d.base+d.prog+d.sind)*100)/100;   // sindicales fuera del saldo legal
  _tab=0; _form={tipoDias:'BASE'}; return ok;
});
t('renderForm Vacaciones: el saldo legal acumula lo anterior + el devengo en curso', () => {
  _tab=2; _dirTabs={}; _dirHandle=null; _dirName=''; _dirConectada=false; _SOLIC=[];
  _form={turno:'',tipo:'',emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO',ing:'2024-01-02',baseOverride:null,progOverride:null,sindOverride:null},aut:null,cc:{c:'1110',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:null,dias:0,tipoDias:'BASE',maxDias:null,tomarBase:0,tomarProg:0,tomarSind:0};
  var p=_diasProporcionales(_form.emp);
  var d=_dispPorBolsa();
  var h=renderForm();
  var fD=function(n){ return String(Math.round(n*100)/100).replace('.',','); };
  // 2 períodos de aniversario cerrados y completos (20 c/u) + lo devengado del período en curso
  var ok=Math.abs(d.base-(40+p.base))<0.05 && p.base>0 && p.base<20
    && h.indexOf('Disponible '+fD(d.base)+' de '+fD(d.base)+' · usado 0')>0;
  _tab=0; _form={tipoDias:'BASE'}; return ok;
});
t('renderForm Vacaciones: muestra Programadas, Devengado y Quedan', () => {
  var d1=new Date(hoy()+'T12:00:00'); d1.setDate(d1.getDate()+1);
  var fut=d1.toISOString().slice(0,10);
  _tab=2; _dirTabs={}; _dirHandle=null; _dirName=''; _dirConectada=false;
  _SOLIC=[{tipo:'VACACIONES',codigo:'M1',inicio:fut,termino:fut,dias_habiles:5,dias_base:5,estado:'APROBADO'}];
  _form={turno:'',tipo:'',emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO',ing:'2000-01-01',baseOverride:null,progOverride:null,sindOverride:null},aut:null,cc:{c:'1110',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:null,dias:0,tipoDias:'BASE',maxDias:null,tomarBase:0,tomarProg:0,tomarSind:0};
  var h=renderForm();
  var ok=h.indexOf('Programadas')>=0 && h.indexOf('Devengado')>=0 && h.indexOf('Quedan')>=0 && h.indexOf('Proporcional')>=0;
  _tab=0; _form={tipoDias:'BASE'}; _SOLIC=[]; return ok;
});
t('renderForm: boton gestionar responsables junto al autorizador', () => {
  _tab=0;
  _form={turno:'DIA',tipo:'PERSONAL',emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO'},aut:null,cc:{c:'1110',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:null,dias:5};
  return renderForm().indexOf('abrirEditorResponsables()')>=0;
});

// selección de calendario (calClick con stubs minimalistas)
// reprovisionar _form para tab 0
_tab = 0; _form = { dates:[], tipo:'', emp:null, aut:null, cc:null, start:null, dias:5, reg:'', hs:'', hi:'' };
_SOLIC = [];
t('calClick() añade día a arreglo', () => { calClick('2026-08-10'); return _form.dates.includes('2026-08-10'); });
t('calClick() alterna (quita si ya estaba)', () => { calClick('2026-08-10'); return _form.dates.length === 0; });

// ── Autorizador: no se hereda entre solicitudes ──
t('resetForm() limpia el autorizador al enviar una solicitud nueva', () => {
  _form={aut:{c:'A1',n:'PATRICIA HERNANDEZ'}};
  resetForm();
  return _form.aut === null;
});
t('resetForm(true) conserva el autorizador al cambiar de pestaña del formulario', () => {
  _form={aut:{c:'A1',n:'PATRICIA HERNANDEZ'}};
  resetForm(true);
  return !!(_form.aut && _form.aut.c==='A1');
});
t('resetForm() sin formulario previo no falla', () => {
  _form=null; resetForm();
  var ok = !!(_form && _form.aut===null);
  _form={turno:'',tipo:'',emp:null,aut:null,cc:null,dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:null,dias:5,tipoDias:'BASE',maxDias:null,tomarBase:0,tomarProg:0,tomarSind:0};
  return ok;
});

// ── KPI del panel: cuentan PERSONAS con permiso, no registros ──
function _mockPermisosHoy(){
  var h=hoy();
  return [
    {tipo:'COMPLETO',codigo:'M1',nombre:'UNO',inicio:h,termino:h,estado:'APROBADO',tipo_permiso:'PERSONAL'},
    {tipo:'MEDIA_JORNADA',codigo:'M1',nombre:'UNO',inicio:h,termino:h,estado:'APROBADO',tipo_permiso:'PERSONAL',turno:'DIA',hora_salida:'13:00',hora_ingreso:'14:00',tipo_regreso:'CON'},
    {tipo:'COMPLETO',codigo:'M2',nombre:'DOS',inicio:h,termino:h,estado:'APROBADO',tipo_permiso:'PERSONAL'},
    {tipo:'MEDIA_JORNADA',codigo:'M2',nombre:'DOS',inicio:h,termino:h,estado:'APROBADO',tipo_permiso:'PERSONAL',turno:'DIA',hora_salida:'13:00',hora_ingreso:'14:00',tipo_regreso:'CON'}
  ];
}
function _kpi(titulo, html){
  var m=html.match(new RegExp(titulo+'</div><div class="v">(\\d+)'));
  return m? m[1] : null;
}
t('renderHome: 2 personas con 2 registros cada una = 2 en "permisos del día"', () => {
  _SOLIC=_mockPermisosHoy();
  var h=renderHome();
  return _kpi('Permisos del día', h)==='2' && _kpi('Permisos del mes', h)==='2';
});
t('renderHome: los KPI no llevan textos de detalle', () => {
  _SOLIC=_mockPermisosHoy();
  var html=renderHome();
  return html.indexOf('kpi-nota')<0 && html.indexOf('registros')<0;
});
t('renderHome: permisos médicos y judiciales NO cuentan como permisos del día', () => {
  var h=hoy();
  _SOLIC=[
    {tipo:'COMPLETO',codigo:'M1',nombre:'UNO',inicio:h,termino:h,estado:'APROBADO',tipo_permiso:'PERSONAL'},
    {tipo:'COMPLETO',codigo:'M2',nombre:'DOS',inicio:h,termino:h,estado:'APROBADO',tipo_permiso:'MEDICO'},
    {tipo:'COMPLETO',codigo:'M3',nombre:'TRES',inicio:h,termino:h,estado:'APROBADO',tipo_permiso:'JUDICIAL'}
  ];
  var html=renderHome();
  return _kpi('Permisos del día',html)==='1' && _kpi('Permisos del mes',html)==='1';
});
t('renderHome: media jornada médica no cuenta, pero sus horas sí se suman', () => {
  var h=hoy();
  _SOLIC=[
    {tipo:'MEDIA_JORNADA',codigo:'M4',nombre:'CUATRO',inicio:h,termino:h,estado:'APROBADO',tipo_permiso:'MEDICO',turno:'DIA',hora_salida:'13:00',hora_ingreso:'15:00',tipo_regreso:'CON'},
    {tipo:'MEDIA_JORNADA',codigo:'M5',nombre:'CINCO',inicio:h,termino:h,estado:'APROBADO',tipo_permiso:'PERSONAL',turno:'DIA',hora_salida:'13:00',hora_ingreso:'15:00',tipo_regreso:'CON'}
  ];
  var html=renderHome();
  var horas=(html.match(/Horas de permiso<\/div><div class="v">([^<]+)</)||[])[1]||'';
  return _kpi('Medias jornadas',html)==='1' && _kpi('Permisos del día',html)==='1' && horas.indexOf('4')===0;
});
t('renderHome: 1 persona con 1 permiso hoy = 1 y sin nota de registros', () => {
  var h=hoy();
  _SOLIC=[{tipo:'COMPLETO',codigo:'M1',nombre:'UNO',inicio:h,termino:h,estado:'APROBADO'}];
  var html=renderHome();
  return _kpi('Permisos del día', html)==='1' && html.indexOf('registros')<0;
});
t('renderHome: dos personas en el mismo día = 2', () => {
  var h=hoy();
  _SOLIC=[
    {tipo:'COMPLETO',codigo:'M1',nombre:'UNO',inicio:h,termino:h,estado:'APROBADO'},
    {tipo:'MEDIA_JORNADA',codigo:'M2',nombre:'DOS',inicio:h,termino:h,estado:'APROBADO',tipo_permiso:'PERSONAL',turno:'DIA',hora_salida:'13:00',hora_ingreso:'14:00',tipo_regreso:'CON'}
  ];
  var html=renderHome();
  return _kpi('Permisos del día', html)==='2' && _kpi('Medias jornadas', html)==='1';
});

// 5. Reporte
console.log('\n— Resumen —');
let pass = 0, fail = 0;
results.forEach(([n, ok, extra]) => { console.log((ok?'PASS':'FAIL') + ' ' + n + (ok?'':' :: '+extra)); ok?pass++:fail++; });
console.log(`\n${pass}/${results.length} pruebas pasaron.`);
process.exit(fail || !parseOk ? 1 : 0);
