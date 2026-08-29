// Verificar agrupación por semana en la vista Día completo
const fs=require('fs');
const FILE='C:/Users/jhuequen/Documents/Default Project/UCO/permisos.html';
const html=fs.readFileSync(FILE,'utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elem=()=>({classList:{add(){},remove(){},toggle(){}},style:{},innerHTML:'',textContent:'',value:'',getBoundingClientRect(){return{top:0,height:40,bottom:40}},scrollIntoView(){}});
global.window=global;
const byId={};
['tbKicker','tbTitle','contentBox'].forEach(function(id){ byId[id]={classList:{add(){},remove(){},toggle(){}},style:{},innerHTML:'',textContent:'',value:'',getBoundingClientRect(){return{top:0,height:40,bottom:40}},scrollIntoView(){}}; });
var _cb=byId['contentBox'];
Object.defineProperty(_cb,'innerHTML',{get(){return this._h||'';},set(v){this._h=v; var re=/id="([^"]+)"/g,m; while((m=re.exec(v))){ if(!byId[m[1]]) byId[m[1]]=elem(); }}});
global.document={getElementById:function(id){return byId[id]||null;},querySelectorAll:function(){return[];},querySelector:function(){return byId['contentBox'];},addEventListener:function(){},createElement:function(){return elem();},documentElement:{scrollTop:0},body:{setAttribute:function(){},getBoundingClientRect:function(){return{top:0,height:800};}}};
global.localStorage={getItem:function(){return null;},setItem:function(){},removeItem:function(){}};
global.supabase = { createClient: () => ({ from:()=>({ select:()=>({ eq:()=>({ single:()=>({}) }), order:()=>({ limit:()=>({}) }) })() }) }) };
global.navigator={onLine:true};global.confirm=function(){return true;};global.scrollTo=function(){};
global.XLSX={utils:{json_to_sheet:function(){return{};},book_new:function(){return{};}},book_append_sheet:function(){},writeFile:function(){}};
(0,eval)(code);

var hoyS=hoy();
// Semana del HOY: crear datos en una semana (2 días) y en otra semana distinta del mismo mes
// Días del mes de hoy
var y=+hoyS.slice(0,4), m=+hoyS.slice(5,7);
var dBase=new Date(y,m-1,1);
// semana 1: dias 01 y 03 del mes actual (pueden caer en la misma semana o no; usaremos una amplia)
var d1=iso(new Date(y,m-1,1));
var d2=iso(new Date(y,m-1,3));
_SOLIC=[
 {tipo:'COMPLETO',estado:'APROBADO',codigo:'H1',nombre:'ZULUAGA',centro_costo:'1110',inicio:d1,tipo_permiso:'PERSONAL'},
 {tipo:'COMPLETO',estado:'APROBADO',codigo:'H2',nombre:'ALVAREZ',centro_costo:'1110',inicio:d2,tipo_permiso:'MEDICO'},
];
_recIdx=0;recQ='';_recAnio='';_recMes='';_recDesde='';_recHasta='';_mesExpand={};_semExpand={};_page='home';
go('rec');
var out=byId['contentBox'].innerHTML;
console.log('d1='+d1+' d2='+d2+' hoy='+hoyS);
console.log('existe semana-total:', out.indexOf('class="semana-total"')>=0);
console.log('existe "Sem"',(/Sem \d+/).test(out));
console.log('toggleSem onclick:', out.indexOf('toggleSem(')>=0);
console.log('muestra ALVAREZ (dia 3):', out.indexOf('ALVAREZ')>=0);
console.log('Resumen html (primeros 600 de la tabla):');
var i=out.indexOf('semana-total');
console.log(out.slice(i-5, i+400));
