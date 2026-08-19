function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function canonicalizeImageUrl(value, baseUrl) {
  try {
    const parsed = new URL(String(value || '').trim().replace(/^\/\//, 'https://'), baseUrl || undefined);
    parsed.hash = '';
    parsed.username = '';
    parsed.password = '';
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    let path = decodeURIComponent(parsed.pathname || '/');
    if (path.length > 1) path = path.replace(/\/+$/, '');
    return { href: parsed.href, host, path, file: path.split('/').pop() || '' };
  } catch {
    return null;
  }
}

export function extractPageImageUrls(html, baseUrl) {
  const raw = decodeHtmlEntities(String(html || ''));
  const found = [];
  const add = (value) => {
    const next = canonicalizeImageUrl(String(value || '').trim().replace(/^['"]|['"]$/g, ''), baseUrl);
    if (next) found.push(next);
  };
  const attr = (name) => new RegExp(`${name}\\s*=\\s*("([^"]+)"|'([^']+)'|([^\\s>]+))`, 'gi');
  for (const pattern of [
    /property=["']og:image(?::url|:secure_url)?["'][^>]*content=["']([^"']+)["']/gi,
    /content=["']([^"']+)["'][^>]*property=["']og:image(?::url|:secure_url)?["']/gi,
    /name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/gi,
    /rel=["']image_src["'][^>]*href=["']([^"']+)["']/gi
  ]) {
    for (const match of raw.matchAll(pattern)) add(match[1]);
  }
  for (const match of raw.matchAll(attr('(?:src|data-src|data-lazy-src|data-original|data-bg|href)'))) {
    add(match[2] || match[3] || match[4]);
  }
  for (const match of raw.matchAll(/\bsrcset\s*=\s*("([^"]+)"|'([^']+)')/gi)) {
    const list = match[2] || match[3] || '';
    list.split(',').forEach((part) => add(part.trim().split(/\s+/)[0]));
  }
  for (const match of raw.matchAll(/url\(\s*(['"]?)(https?:\/\/[^'")]+|(?:\/|\.\/)[^'")]+)\1\s*\)/gi)) {
    add(match[2]);
  }
  return found;
}

export function pageReferencesImage(html, imageUrl, baseUrl) {
  const target = canonicalizeImageUrl(imageUrl, baseUrl);
  if (!target) return false;
  const decoded = decodeHtmlEntities(String(html || ''));
  const snippets = [target.href, target.path].filter((item) => item && item.length > 8);
  if (snippets.some((item) => decoded.includes(item))) return true;
  return extractPageImageUrls(html, baseUrl).some((found) => {
    if (found.href === target.href) return true;
    if (found.host === target.host && (found.path === target.path || found.path.startsWith(target.path) || target.path.startsWith(found.path))) {
      return true;
    }
    if (
      found.host === target.host &&
      found.file &&
      target.file &&
      found.file.includes('.') &&
      target.file.includes('.') &&
      found.file.split('.')[0] === target.file.split('.')[0] &&
      found.file.length > 6 &&
      target.file.length > 6
    ) {
      return true;
    }
    return false;
  });
}
