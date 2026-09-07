// Bounded official-site fetcher. Resolve once and pin the connection to the
// checked address, including each redirect; never disable TLS verification.
import http from 'node:http';
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {hostnameLooksUnsafe,hostMatchesAllowlist,isPrivateOrLocalIp} from './safe-fetch.js';

export const importError=(code,message)=>Object.assign(new Error(message),{code});
export function parseImportUrl(value,allowedHosts=null){
 let u;try{u=new URL(value);}catch{throw importError('unsafe_url','Invalid source URL.');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||hostnameLooksUnsafe(u.hostname))throw importError('unsafe_url','Only public website URLs on standard ports are allowed.');
 if(allowedHosts&&!hostMatchesAllowlist(u.hostname,allowedHosts))throw importError('source_not_official','The source is outside the official website.');
 return u;
}
export function publicImportAddress(address){
 if(!isIP(address)||isPrivateOrLocalIp(address))return false;
 if(address.includes(':'))return /^[23][0-9a-f]{3}:/i.test(address)&&!/^2001:(?:db8|0):/i.test(address);
 const [a,b]=address.split('.').map(Number);
 return a<224&&!(a===192&&b===0)&&!(a===198&&b===51)&&!(a===203&&b===0);
}
export async function fetchImportResource(url,{allowedHosts=null,maxBytes=350000,timeoutMs=7000,maxRedirects=2}={}){
 const deadline=Date.now()+timeoutMs;
 let current=String(url);
 for(let hop=0;hop<=maxRedirects;hop++){
  const u=parseImportUrl(current,allowedHosts);
  const remaining=deadline-Date.now();if(remaining<=0)throw importError('timeout','Official site timed out.');
  let timer;
  const addresses=await Promise.race([lookup(u.hostname,{all:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(importError('timeout','Official site timed out.')),remaining);})]).finally(()=>clearTimeout(timer));
  if(!addresses.length||addresses.some(x=>!publicImportAddress(x.address)))throw importError('private_ip','Private network destinations are blocked.');
  const pinned=addresses[0];
  const result=await new Promise((resolve,reject)=>{
   const request=(u.protocol==='https:'?https:http).get(u,{
    agent:false,
    lookup:(_host,options,callback)=>options.all?callback(null,[pinned]):callback(null,pinned.address,pinned.family),
    headers:{Accept:'text/html,image/jpeg,image/png,image/webp','Accept-Encoding':'identity','User-Agent':'GolfolioOfficialPhotoImporter/1.0'}
   },response=>{
    if([301,302,303,307,308].includes(response.statusCode)){
     response.resume();resolve({redirect:response.headers.location});return;
    }
    if(response.statusCode!==200){response.resume();reject(importError('http','Official site returned an error.'));return;}
    if(Number(response.headers['content-length'])>maxBytes){response.destroy();reject(importError('too_large','Source exceeds the import size limit.'));return;}
    let size=0;const chunks=[];
    response.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){reject(importError('too_large','Source exceeds the import size limit.'));response.destroy();}else chunks.push(chunk);});
    response.on('end',()=>resolve({buffer:Buffer.concat(chunks),contentType:String(response.headers['content-type']||''),url:u.href}));
    response.on('error',reject);
   });
   const timeout=setTimeout(()=>request.destroy(importError('timeout','Official site timed out.')),Math.max(1,deadline-Date.now()));
   request.on('error',reject);request.on('close',()=>clearTimeout(timeout));
  });
  if(result.buffer)return result;
  if(!result.redirect||hop===maxRedirects)throw importError('redirect','Official site redirected too many times.');
  current=new URL(result.redirect,u).href;
 }
}

// Site-builder HTML includes large embedded layouts; it has a separate budget
// from downloaded image bytes and optimized stored copies.
export const OFFICIAL_PAGE_MAX_BYTES=2*1024*1024;
export async function fetchOfficialPage(url,options={},readResource=fetchImportResource){
 try{return await readResource(url,{...options,maxBytes:OFFICIAL_PAGE_MAX_BYTES});}
 catch(error){if(error.code==='too_large')throw importError('source_page_too_large','The official source page exceeds the 2 MB page-reading limit.');throw error;}
}
