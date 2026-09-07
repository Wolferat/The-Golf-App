// Isolated local visual QA only. Never connects to live APIs or creates records.
// Run: node scripts/preview-design.mjs, then http://127.0.0.1:8766/hub
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const pages=['','hub','players','settings','company','listings','listings/edit','listing','review','account'];
const bootstrap=`
window.fetch=async (url,options={})=>{
 if(options.method && options.method!=='GET')return {ok:false,status:405,json:async()=>({error:'Design preview only. Changes are disabled.'})};
 await new Promise(resolve=>setTimeout(resolve,650));
 const pathname=new URL(url,location.href).pathname;
 const blank={id:'layout-only',title:'Venue layout preview',kind:'course',status:'approved',description:'Layout review only. No venue, photos, pricing, or reviews are represented here.'};
 const data={profile:{role:'admin'},settings:{},players:[],rounds:[],stats:{},listings:[],proposals:[],photos:[],reviews:[],listing:blank,reviewable:true,roundable:true};
 if(pathname==='/api/config')return {ok:false,status:503,json:async()=>({error:'Offline design review'})};
 return {ok:true,status:200,json:async()=>data};
};`;
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  const pathname=decodeURIComponent(url.pathname);
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; form-action 'none'; frame-ancestors 'self'");
  if(req.method!=='GET'||pathname.startsWith('/api/')){res.writeHead(405);res.end('Design preview only');return;}
  let name=pathname.replace(/^\//,'').replace(/\/$/,'');
  if(pages.includes(name))name=(name?name+'/':'')+'index.html';
  if(name.includes('..')||!(/^[\w/-]+\.html$/.test(name)&&pages.includes(name.replace(/\/?index.html$/,''))||/^[\w-]+\.(css|js)$/.test(name))){res.writeHead(404);res.end();return;}
  let content=await readFile(path.join(root,name),'utf8');
  if(name.endsWith('.html')){
   content=content.replace('<head>','<head><script>'+bootstrap+'</script>');
   content=content.replace(/(<body[^>]*>)/,'$1<div style="padding:8px 16px;color:#e2cfaa;background:#252b20;font:12px system-ui;text-align:center">LOCAL DESIGN REVIEW · Empty layout fixtures · Changes disabled</div>');
  }
  if(name==='player-pages.js'){
   content=content.replace(/try\{session=JSON.parse\(localStorage.getItem\('golfolio_session'\)\|\|'null'\)\}catch\{\}/,'session={};');
   content=content.replace(/if\(!session\?\.access_token\)\{location.replace\([^\n]+;return\}/,'');
  }
  if(name==='listing-page.js')content=content.replaceAll('session?.access_token','true').replace(/try\{session=JSON.parse\(localStorage.getItem\('golfolio_session'\)\|\|'null'\)\}catch\{\}/,'session={};');
  const type=name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html';
  res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(content);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(8766,'127.0.0.1',()=>console.log('Isolated design review: http://127.0.0.1:8766/hub — no live API access'));
