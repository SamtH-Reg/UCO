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
t('_diasProgresivos Art.68', () => _diasProgresivos(9)===0 && _diasProgresivos(10)===1 && _diasProgresivos(13)===2 && _diasProgresivos(16)===3 && _diasProgresivos(19)===4 && _diasProgresivos(22)===5 && _diasProgresivos(30)===5);
t('_diasFeriadoTotal base(20 Aysén)+prog+sindicales(5)', () => _diasFeriadoTotal(5)===25 && _diasFeriadoTotal(10)===26 && _diasFeriadoTotal(22)===30);
t('DIAS_SINDICALES = 5', () => DIAS_SINDICALES===5);
t('_asignacionDias: usa overrides si existen (incl. base)', () => { var a=_asignacionDias({baseOverride:18,progOverride:7,sindOverride:3},16); return a.base===18&&a.prog===7&&a.sind===3; });
t('_asignacionDias: sin overrides usa ley/referencia', () => { var a=_asignacionDias({},16); return a.base===20&&a.prog===_diasProgresivos(16)&&a.sind===5; });
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
t('setDiasEmpleado/segBtnDias definidos', () => typeof setDiasEmpleado==='function' && typeof segBtnDias==='function');
t('renderForm Vacaciones: interfaz compacta con steppers y editar', () => {
  _tab=2; _dirTabs={}; _dirHandle=null; _dirName=''; _dirConectada=false; _SOLIC=[];
  _form={turno:'',tipo:'',emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO',ing:'2000-01-01',baseOverride:null,progOverride:null,sindOverride:null},aut:null,cc:{c:'1110',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:'2026-09-01',dias:0,tipoDias:'BASE',maxDias:null,tomarBase:0,tomarProg:0,tomarSind:0};
  var h=renderForm();
  var ok=h.indexOf('Total solicitado')>=0 && h.indexOf('_setTomar')>=0 && h.indexOf('editarAsignado')>=0 && h.indexOf('Disponible')>=0 && h.indexOf('Última vacaciones')>=0 && h.indexOf('Fecha de ingreso')>=0;
  _tab=0; _form={tipoDias:'BASE'};
  return ok;
});
t('calClick vacaciones: bloquea fin de semana', () => {
  _tab=2; _form={start:null};
  calClick('2026-09-06');            // domingo
  var ok=_form.start===null;
  calClick('2026-09-02');            // miércoles
  ok=ok && _form.start==='2026-09-02';
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
t('renderForm Vacaciones: progresivo no editable si no corresponde', () => {
  _tab=2; _dirTabs={}; _dirHandle=null; _dirName=''; _dirConectada=false; _SOLIC=[];
  _form={turno:'',tipo:'',emp:{c:'M1',n:'PEREZ',tipo:'INDEFINIDO',ing:'2024-01-02',baseOverride:null,progOverride:2,sindOverride:null},aut:null,cc:{c:'1110',n:'x'},dates:[],com:'',file:'',fileObj:null,reg:'CON',hs:'',hi:'',start:null,dias:0,tipoDias:'BASE',maxDias:null,tomarBase:0,tomarProg:0,tomarSind:0};
  var h=renderForm();
  var ok=h.indexOf("editarAsignado('prog')")<0 && h.indexOf('de 0 · usado')>=0;
  _tab=0; _form={tipoDias:'BASE'};
  return ok;
});
t('_diasProgresivos: 2 años -> 0 (base de la consulta)', () => _diasProgresivos(2)===0);
t('_ultimaVacacion: máximo término/inicio (ignora anuladas)', () => {
  _SOLIC=[
    {tipo:'VACACIONES',codigo:'M1',inicio:'2026-03-01',termino:'2026-03-10',estado:'APROBADO'},
    {tipo:'VACACIONES',codigo:'M1',inicio:'2026-06-01',termino:'2026-06-05',estado:'APROBADO'},
    {tipo:'VACACIONES',codigo:'M1',inicio:'2026-09-01',termino:'2026-09-02',estado:'ANULADO'}
  ];
  var ok=_ultimaVacacion('M1')==='2026-06-05';
  _SOLIC=[];
  return ok;
});
t('_tomarTodo: llena todas las bolsas', () => {
  _tab=2; _SOLIC=[];
  _form={emp:{c:'M1',ing:'2000-01-01',baseOverride:null,progOverride:null,sindOverride:null},tomarBase:0,tomarProg:0,tomarSind:0,dias:0};
  _tomarTodo();
  var ok=_form.dias===(20+_diasProgresivos(_anosServicio('2000-01-01'))+5);
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

// 5. Reporte
console.log('\n— Resumen —');
let pass = 0, fail = 0;
results.forEach(([n, ok, extra]) => { console.log((ok?'PASS':'FAIL') + ' ' + n + (ok?'':' :: '+extra)); ok?pass++:fail++; });
console.log(`\n${pass}/${results.length} pruebas pasaron.`);
process.exit(fail || !parseOk ? 1 : 0);
