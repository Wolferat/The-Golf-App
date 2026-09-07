import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../experience.js',import.meta.url),'utf8');
function setup({native=false,reduced=false}={}){
 const handlers={},windowHandlers={},timers=new Map(),nodes=[],calls=[],navigations=[];let seq=0;
 const classes=()=>({add(){},remove(){}});
 const make=()=>({hidden:false,dataset:{},classList:classes(),setAttribute(){},append(){},querySelector(){return make();},getContext(){return null;}});
 const document={readyState:'loading',hidden:false,body:{append(n){nodes.push(n);}},addEventListener(k,v){handlers[k]=v;},querySelectorAll(){return[];},querySelector(){return null;}};
 const location={href:(native?'capacitor://localhost':'http://localhost:8765')+'/',pathname:'/',search:'',assign(v){navigations.push(v);}};
 const window={fetch:(...args)=>new Promise((resolve,reject)=>calls.push({args,resolve,reject}))};
 const context={window,document,location,URL,Request,matchMedia:()=>({matches:reduced,addEventListener(){}}),requestAnimationFrame:()=>1,cancelAnimationFrame(){},MutationObserver:class{observe(){}},addEventListener(k,v){windowHandlers[k]=v;},setTimeout(fn,delay){const id=++seq;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);}};
 document.createElement=make;
 vm.runInNewContext(source,context);
 const fire=delay=>{for(const [id,t] of [...timers])if(t.delay===delay){timers.delete(id);t.fn();}};
 return{window,handlers,windowHandlers,nodes,calls,timers,navigations,fire,mount:()=>handlers.DOMContentLoaded()};
}
for(const native of [false,true])test(`loading observes initial and concurrent ${native?'native':'web'} requests without altering responses`,async()=>{
 const s=setup({native}),options={headers:{'X-Test':'preserved'}};
 const first=s.window.fetch('/api/listings',options); // Starts before DOM is mounted.
 s.mount();s.fire(450);assert.equal(s.nodes[0].hidden,false);
 const second=s.window.fetch('/api/settings');
 assert.equal(s.calls[0].args[0],'/api/listings');assert.equal(s.calls[0].args[1],options);
 const response={ok:true};s.calls[0].resolve(response);assert.equal(await first,response);assert.equal(s.nodes[0].hidden,false);
 s.calls[1].resolve(response);await second;assert.equal(s.nodes[0].hidden,true);
});
test('failed requests dismiss the loader and preserve the error',async()=>{
 const s=setup();s.mount();const p=s.window.fetch('/api/settings');s.fire(450);
 const failure=Error('offline');s.calls[0].reject(failure);await assert.rejects(p,e=>e===failure);assert.equal(s.nodes[0].hidden,true);
});
test('external requests never display a first-party loading state',async()=>{
 const s=setup();s.mount();const p=s.window.fetch('https://example.com/auth');s.fire(450);assert.equal(s.nodes[0].hidden,true);s.calls[0].resolve({});await p;
});
test('navigation animates once, and bfcache restoration cancels a pending drive',()=>{
 const s=setup();s.mount();s.window.golfolioNavigate('/hub');s.window.golfolioNavigate('/players');assert.equal(s.navigations.length,0);s.fire(190);assert.deepEqual(s.navigations,['http://localhost:8765/hub']);
 s.window.golfolioNavigate('/settings');s.windowHandlers.pageshow();s.fire(190);assert.equal(s.navigations.length,1);assert.equal(s.nodes[1].hidden,true);
});
test('reduced motion and external navigation are immediate',()=>{
 const s=setup({reduced:true});s.mount();s.window.golfolioNavigate('/hub');assert.deepEqual(s.navigations,['http://localhost:8765/hub']);assert.equal(s.timers.size,0);
 const other=setup();other.mount();other.window.golfolioNavigate('https://example.com/');assert.deepEqual(other.navigations,['https://example.com/']);
});
test('modified, external, same-page, and download links keep browser behavior',()=>{
 const s=setup();s.mount();
 for(const overrides of [{ctrlKey:true},{href:'https://example.com/'},{href:'http://localhost:8765/#help'},{download:true},{target:'_blank'}]){
  let prevented=false;const link={href:overrides.href||'http://localhost:8765/hub',target:overrides.target||'',hasAttribute:()=>!!overrides.download};
  s.handlers.click({button:0,...overrides,target:{closest:()=>link},preventDefault(){prevented=true;}});assert.equal(prevented,false);
 }
});
