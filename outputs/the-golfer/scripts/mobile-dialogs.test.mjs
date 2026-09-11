import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../mobile-ui.js',import.meta.url),'utf8');
function setup(){
 const overlays=[];
 function element(){
  return {listeners:{},children:new Map(),dataset:{},value:'answer',isConnected:true,
   addEventListener(k,f){this.listeners[k]=f},removeEventListener(k){delete this.listeners[k]},
   querySelector(k){if(!this.children.has(k))this.children.set(k,element());return this.children.get(k)},
   querySelectorAll(){return []},focus(){},select(){},remove(){this.removed=true},getClientRects(){return [1]}};
 }
 const context={document:{createElement:element,activeElement:element(),body:{append(e){overlays.push(e)},classList:{add(){},remove(){}}},addEventListener(){}},matchMedia:()=>({matches:true})};
 context.window=context;vm.runInNewContext(source,context);
 return {ui:context.golfolioUI,overlays};
}
for(const method of ['confirm','prompt','select','alert'])for(const action of ['backdrop','escape']){
 test(`${method} resolves cancellation on ${action}`,async()=>{
  const {ui,overlays}=setup();const pending=ui[method]('test');const overlay=overlays.at(-1);
  if(action==='backdrop')overlay.listeners.click({target:overlay});
  else overlay.querySelector('.mobile-dialog, .mobile-sheet').listeners.keydown({key:'Escape',preventDefault(){}});
  assert.equal(await pending,method==='confirm'?false:method==='alert'?undefined:null);
  assert.equal(ui.hasOpenSheet(),false);assert.equal(overlay.removed,true);
 });
}
test('confirm resolves true only on explicit confirmation',async()=>{
 const {ui,overlays}=setup();const pending=ui.confirm('test');overlays[0].querySelector('[data-mobile-confirm]').onclick();
 assert.equal(await pending,true);assert.equal(ui.hasOpenSheet(),false);
});
