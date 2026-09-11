import { readdir, mkdir, rm, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'web-dist');
const pages=['account','admin','company','hub','listing','listings','listings/edit','players','review','saved','settings'];
// Static output is client-only. Vercel bundles api/ and its imports separately.
const assets=(await readdir(root)).filter(name=>/\.(html|css|js)$/.test(name));
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const file of [...assets,...pages.map(page=>`${page}/index.html`)]){
 await mkdir(path.dirname(path.join(output,file)),{recursive:true});
 await copyFile(path.join(root,file),path.join(output,file));
}
console.log(`Built ${assets.length+pages.length} client assets and pages for Vercel.`);
