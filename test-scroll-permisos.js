// Test en bucle: scroll al día actual en "Registros día completo".
// Simula la ventana con scroll real (scrollY, scrollTo, innerHeight) y
// elementos posicionados en el documento, para que scrollIntoView funcione.
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'permisos.html');
const html = fs.readFileSync(FILE, 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// ── Simulación de ventana con scroll ─────────────────────────
// Cada elemento tiene una posición Y en el documento (offsetTop).
// scrollIntoView({block:'center'}) desplaza window.scrollY para centrar.
const win = global;
win.innerHeight = 800;
win.pageYOffset = 0;
win.scrollX = 0;
let __docActual = 0;      // posición del documento bajo el todo
const topMap = {};        // id -> offsetTop (posición en el documento)
function refreshTops(){ __docActual = 0; }

function makeEl(id){
  const el = {
    id: id || '',
    innerHTML:'', textContent:'', value:'', style:{},
    classList:{add(){},remove(){},toggle(){}},
    offsetTop: 1000,
    getBoundingClientRect(){ return { top: this.offsetTop - win.pageYOffset, height: 40, bottom: this.offsetTop - win.pageYOffset + 40, left:0, width:100 }; },
    scrollIntoView(opts){
      // centrar: scrollY = offsetTop - innerHeight/2
      win.pageYOffset = Math.max(0, this.offsetTop - win.innerHeight/2);
      win.__scrolledTo = (opts && opts.block) || 'auto';
      win.__scrollCount = (win.__scrollCount||0)+1;
    },
  };
  return el;
}
function getEl(id){ if(!topMap[id]){ topMap[id]=makeEl(id); } return topMap[id]; }
const contentBox = makeEl('contentBox');
// Registrar ids de elementos cuando se asigna innerHTML y asignar posición
Object.defineProperty(contentBox, 'innerHTML', {
  get(){ return this._html||''; },
  set(v){
    this._html=v;
    const re=/id="([^"]+)"/g; let m;
    while((m=re.exec(v))){ if(!topMap[m[1]]) topMap[m[1]]=makeEl(m[1]); }
  },
});
win.__scrollCount = 0; win.__scrolledTo = null;

global.window = win;
['tbKicker','tbTitle'].forEach(function(id){ topMap[id]=makeEl(id); });
global.document = {
  getElementById(id){ return id==='contentBox' ? contentBox : (topMap[id]||null); },
  querySelectorAll(){ return []; },
  querySelector(){ return contentBox; },
  addEventListener(){},
  createElement(){ return makeEl(); },
  documentElement:{ scrollTop:0 },
  body:{ setAttribute(){}, getBoundingClientRect(){ return {top:0,height:800}; } },
};
global.localStorage = { getItem:()=>null,setItem:()=>{},removeItem:()=>{} };
global.supabase = { createClient:()=>({ from:()=>({ select:()=>({ eq:()=>({ single:()=>({}) }), order:()=>({ limit:()=>({}) }) })() }) }) };
global.navigator = { onLine:true };
global.confirm = function(){ return true; };
global.XLSX = { utils:{ json_to_sheet:()=>({}), book_new:()=>({}) }, book_append_sheet:()=>{}, writeFile:()=>{} };
win.scrollTo = function(o){ win.pageYOffset = (o&&o.top)||0; win.__scrolledTo='scrollTo'; win.__scrollCount=(win.__scrollCount||0)+1; };
// getBoundingClientRect debe reflejar la posición actual (considerar scrollY)
['fechaRef'].forEach(function(id){ /* offsetTop fijo para el ancla referencia */ });

(0,eval)(code);

// ── Ayuda para avanzar timers (sin esperar tiempo real) ─────
function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }

(async function(){
  let fallos = 0;
  const TOTAL = 12;

  for(let i=0;i<TOTAL;i++){
    // Reiniciar estado
    const hoyS = hoy();
    _SOLIC = [
      { tipo:'COMPLETO', estado:'APROBADO', codigo:'H1', nombre:'ZULUAGA', centro_costo:'1110', inicio:hoyS, tipo_permiso:'PERSONAL' },
      { tipo:'COMPLETO', estado:'APROBADO', codigo:'H2', nombre:'ALVAREZ', centro_costo:'1110', inicio:'2026-05-11', tipo_permiso:'MEDICO' },
    ];
    _recIdx=0; recQ=''; _recAnio=''; _recMes=''; _recDesde=''; _recHasta='';
    _diaExpand={}; _scrollRefIntentos=0; win.__scrollCount=0; win.__scrolledTo=null;
    win.pageYOffset = 0;   // resetear scroll de la ventana entre iteraciones
    // Fecha de referencia MUY abajo en el documento (2000px) para que nunca esté "ya visible"
    topMap['fechaRef'] && (topMap['fechaRef'].offsetTop = 2000);

    // Posiciones: el grupo HOY está "en medio" del documento
    // Simular navegación real a la vista
    _page='home';
    go('rec');

    // Esperar a que el setTimeout de scrollAReferencia dispare (200ms + reintentos)
    await wait(900);

    const scrolled = win.__scrollCount > 0;
    const scrolledToFecha = topMap['fechaRef'] && (win.pageYOffset > 0 || win.__scrollCount>0);
    const mesHoyExpandido = _diaExpand[hoyS] === true;

    const ok = scrolled && mesHoyExpandido;
    if(!ok) fallos++;

    console.log(
      (ok?'PASS':'FAIL') +
      ' iter '+(i+1)+' | scroll:'+scrolled+' ('+win.__scrollCount+') | mesHOY:'+mesHoyExpandido +
      ' | fechaRefExiste:'+!!topMap['fechaRef'] +
      ' | scrollY:'+Math.round(win.pageYOffset)
    );
  }

  console.log('\nResultado: '+fallos+' fallos de ' + TOTAL);
  process.exit(fallos ? 1 : 0);
})();
