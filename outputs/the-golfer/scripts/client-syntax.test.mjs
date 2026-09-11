import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const file of await readdir(root))if(file.endsWith('.js'))test(`browser script parses: ${file}`,async()=>{new vm.Script(await readFile(path.join(root,file),'utf8'),{filename:file})});
for(const route of ['','hub/','players/','settings/','company/','listing/','listings/','listings/edit/'])test(`inline browser scripts parse: ${route||'home'}`,async()=>{
 const html=await readFile(path.join(root,route,'index.html'),'utf8');
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1],{filename:route+'index.html'});
});
