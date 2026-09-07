import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
test('bundle contains client pages without server files or secrets', async () => {
  execFileSync(process.execPath, ['scripts/build-mobile.mjs'], {cwd: root});
  const files = await readdir(new URL('mobile-dist/', root), {recursive:true});
  assert(!files.some(p => /(^|\/)(api|supabase|node_modules|\.env)/.test(p)));
  const page = await readFile(new URL('mobile-dist/index.html', root), 'utf8');
  assert(page.indexOf('/mobile-runtime.js') < page.indexOf("fetch('/api/"));
  assert(page.includes("window.golfolioMobileOrigin+'/?reset=1'"));
  assert(files.includes('hub/index.html'));
  assert(page.includes('/listing/index.html?id='));
});
test('native requests route only local APIs to configured HTTPS backend', async () => {
  const calls=[];
  const context={URL,Request,location:{href:'capacitor://localhost/',origin:'capacitor://localhost'},navigator:{},document:{addEventListener(){}},window:{golfolioMobileOrigin:'https://example.com',fetch:(...args)=>{calls.push(args);return Promise.resolve();},Capacitor:{isNativePlatform:()=>true,registerPlugin:()=>({})}}};
  vm.runInNewContext(await readFile(new URL('mobile/runtime.js',root),'utf8'),context);
  const options={headers:{Authorization:'Bearer test-token'}};
  await context.window.fetch('/api/listings?kind=course',options);
  assert.equal(calls[0][0],'https://example.com/api/listings?kind=course');
  assert.equal(calls[0][1],options);
  await context.window.fetch('https://auth.example.com/auth/v1/token', options);
  assert.equal(calls[1][0],'https://auth.example.com/auth/v1/token');
});

test('shipped Capacitor core initializes plugin registration before native runtime', async () => {
  const context = { console, URL, Request, navigator:{}, location:{href:'capacitor://localhost/',origin:'capacitor://localhost'}, document:{addEventListener(){}}, fetch:()=>Promise.resolve(), webkit:{messageHandlers:{bridge:{}}} };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(await readFile(new URL('node_modules/@capacitor/core/dist/capacitor.js',root),'utf8'),context);
  assert.equal(typeof context.Capacitor.registerPlugin,'function');
  vm.runInContext(await readFile(new URL('mobile/runtime.js',root),'utf8'),context);
  assert.equal(typeof context.navigator.geolocation.getCurrentPosition,'function');
  const html=await readFile(new URL('mobile-dist/index.html',root),'utf8');
  assert(html.indexOf('/capacitor-core.js') < html.indexOf('/mobile-runtime.js'));
});
