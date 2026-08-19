import { lookup } from 'dns/promises';
import { isIP } from 'net';

export const FETCH_TIMEOUT_MS = 5000;
export const FETCH_MAX_BYTES = 350000;
export const FETCH_MAX_REDIRECTS = 2;

export function isPrivateOrLocalIp(ip) {
  const value = String(ip || '').trim().toLowerCase();
  if (!value) return true;
  if (value.includes(':')) {
    if (value === '::1' || value === '::') return true;
    if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80')) return true;
    if (value.startsWith('::ffff:')) return isPrivateOrLocalIp(value.slice(7));
    return false;
  }
  const parts = value.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

export function hostnameLooksUnsafe(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (isIP(bare) || isIP(host)) return true;
  return false;
}

export function parsePublicHttpsUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (hostnameLooksUnsafe(parsed.hostname)) return null;
  return parsed;
}

export function hostMatchesAllowlist(hostname, allowedHosts = []) {
  const host = String(hostname || '').replace(/^www\./i, '').toLowerCase();
  return (allowedHosts || []).some((allowed) => {
    const next = String(allowed || '').replace(/^www\./i, '').toLowerCase();
    return host === next || host.endsWith('.' + next);
  });
}

export async function assertSafePublicHttpsUrl(value, { allowedHosts = null } = {}) {
  const parsed = parsePublicHttpsUrl(value);
  if (!parsed) {
    const err = new Error('Only public HTTPS URLs can be fetched.');
    err.code = 'unsafe_url';
    throw err;
  }
  if (allowedHosts && allowedHosts.length && !hostMatchesAllowlist(parsed.hostname, allowedHosts)) {
    const err = new Error('That URL is not on the official website domain.');
    err.code = 'off_official_host';
    throw err;
  }
  let address;
  try {
    ({ address } = await lookup(parsed.hostname, { family: 0 }));
  } catch {
    const err = new Error('Could not resolve that host.');
    err.code = 'dns';
    throw err;
  }
  if (isPrivateOrLocalIp(address)) {
    const err = new Error('Private or local network URLs are not allowed.');
    err.code = 'private_ip';
    throw err;
  }
  return parsed;
}

async function readLimited(response, maxBytes) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) {
    const err = new Error('That response is too large.');
    err.code = 'too_large';
    throw err;
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) {
      const err = new Error('That response is too large.');
      err.code = 'too_large';
      throw err;
    }
    return text;
  }
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      try { reader.cancel(); } catch { /* ignore */ }
      const err = new Error('That response is too large.');
      err.code = 'too_large';
      throw err;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchHttpsText(url, {
  allowedHosts = null,
  timeoutMs = FETCH_TIMEOUT_MS,
  maxBytes = FETCH_MAX_BYTES,
  maxRedirects = FETCH_MAX_REDIRECTS
} = {}) {
  let current = String(url);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertSafePublicHttpsUrl(current, { allowedHosts });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'User-Agent': 'GolfolioOfficialPhotoVerifier/1.0'
        }
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location || hop === maxRedirects) {
          const err = new Error('Could not follow that official page safely.');
          err.code = 'redirect';
          throw err;
        }
        current = new URL(location, current).href;
        continue;
      }
      if (!response.ok) {
        const err = new Error('Could not load that official page.');
        err.code = 'http';
        throw err;
      }
      return await readLimited(response, maxBytes);
    } finally {
      clearTimeout(timer);
    }
  }
  const err = new Error('Could not load that official page.');
  err.code = 'redirect';
  throw err;
}
