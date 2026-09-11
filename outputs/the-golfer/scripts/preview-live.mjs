// Local refreshed UI with the existing HTTPS API. No server keys are needed.
// Only client assets are served; API authentication remains on the live server.
import http from 'node:http';
import https from 'node:https';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const localOrigin='http://127.0.0.1:8767';
const backend='https://www.whakfukgolf.com';
const routes=new Set(['','account','admin','saved','company','hub','listing','listings','listings/edit','players','review','settings']);
const sendError=(res,status,message)=>{if(!res.headersSent)res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:message}));};
http.createServer(async(req,res)=>{
 try{
  if(req.headers.host!=='127.0.0.1:8767'){sendError(res,403,'Use the local preview address.');return;}
  const url=new URL(req.url,localOrigin);
  if(url.origin!==localOrigin||req.headers.origin&&req.headers.origin!==localOrigin||req.headers['sec-fetch-site']==='cross-site'){sendError(res,403,'Cross-site requests are not allowed.');return;}
  if(/^\/api\/[a-z-]+$/.test(url.pathname)){
   const headers={accept:'application/json'};
   for(const key of ['authorization','content-type'])if(req.headers[key])headers[key]=req.headers[key];
   const upstream=https.request(backend+url.pathname+url.search,{method:req.method,headers},response=>{
    // Never redirect bearer credentials or local UI navigation to another host.
    if(response.statusCode>=300&&response.statusCode<400){response.resume();sendError(res,502,'Unexpected API redirect.');return;}
    res.writeHead(response.statusCode||502,{'Content-Type':response.headers['content-type']||'application/json','Cache-Control':'no-store'});
    response.on('error',()=>res.destroy());response.pipe(res);
   });
   upstream.setTimeout(60000,()=>upstream.destroy(Error('API timeout')));
   upstream.on('error',()=>sendError(res,502,'Could not reach the app server. Please try again.'));
   req.on('aborted',()=>upstream.destroy());
   res.on('close',()=>{if(!res.writableFinished)upstream.destroy();});
   req.pipe(upstream);return;
  }
  if(!['GET','HEAD'].includes(req.method)){sendError(res,405,'Method not allowed.');return;}
  let name=decodeURIComponent(url.pathname).replace(/^\//,'').replace(/\/$/,'');
  if(routes.has(name))name=(name?name+'/':'')+'index.html';
  const routeFile=name.endsWith('/index.html')&&routes.has(name.slice(0,-11));
  if(!(name==='index.html'||routeFile||/^[a-zA-Z0-9_-]+\.(css|js|webp)$/.test(name))){sendError(res,404,'Not found.');return;}
  const content=await readFile(path.join(root,name));
  res.writeHead(200,{'Content-Type':name.endsWith('.webp')?'image/webp':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?undefined:content);
 }catch{sendError(res,404,'Not found.');}
}).listen(8767,'127.0.0.1',()=>console.log('Refreshed local app: '+localOrigin+' — connected to the existing app API.'));
