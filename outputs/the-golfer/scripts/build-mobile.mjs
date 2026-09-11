import { readdir, readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'mobile-dist');
const backend = new URL(process.env.GOLFOLIO_MOBILE_API_URL || 'https://www.whakfukgolf.com');
if (backend.protocol !== 'https:' || backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash) throw Error('GOLFOLIO_MOBILE_API_URL must be an HTTPS origin without credentials, path, query, or fragment.');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Explicit client asset allowlist: never package APIs, SQL, environment files or dependencies.
const pages = ['account', 'admin', 'company', 'hub', 'listing', 'listings', 'listings/edit', 'players', 'review', 'saved', 'settings'];
const assets = (await readdir(root)).filter(name => /\.(html|css|js)$/.test(name));
for (const file of [...assets, ...pages.map(p => `${p}/index.html`)]) {
  let content = await readFile(path.join(root, file), 'utf8');
  if (/\.(html|js)$/.test(file)) {
    content = content.replace(/location\.origin/g, 'window.golfolioMobileOrigin');
    // WKWebView serves bundled files; resolve web directory routes explicitly.
    for (const route of [...pages].sort((a,b) => b.length-a.length)) {
      content = content.replace(new RegExp(`(["'\x60])/${route}/?(?=["'\x60?#])`, 'g'), `$1/${route}/index.html`);
    }
  }
  if (file.endsWith('.html')) content = content.replace(/<head>/i, '<head><script src="/capacitor.js"></script><script src="/capacitor-core.js"></script><script src="/mobile-config.js"></script><script src="/mobile-runtime.js"></script>');
  if (file.endsWith('.html')) {
    content = content.replace(/(<meta name="viewport" content=")([^"]*)"/i, '$1$2, viewport-fit=cover"');
    content = content.replace('</head>', '<link rel="stylesheet" href="/native.css"></head>');
  }
  await mkdir(path.dirname(path.join(output, file)), { recursive: true });
  await writeFile(path.join(output, file), content);
}
await writeFile(path.join(output, 'mobile-config.js'), `window.golfolioMobileOrigin = ${JSON.stringify(backend.origin)};\n`);
await copyFile(path.join(root, 'node_modules/@capacitor/core/dist/capacitor.js'), path.join(output, 'capacitor-core.js'));
await copyFile(path.join(root, 'mobile/runtime.js'), path.join(output, 'mobile-runtime.js'));
await copyFile(path.join(root, 'mobile/native.css'), path.join(output, 'native.css'));
console.log(`Bundled client screens. Backend: ${backend.origin}`);

await copyFile(path.join(root,'golf-placeholder.webp'),path.join(output,'golf-placeholder.webp'));
