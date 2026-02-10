/**
 * Sanitized API base URL.
 * Fixes mangled env (e.g. prod + localhost concatenated, comma/space separated).
 */
function sanitizeApiBase(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return 'http://localhost:8000/api';
  // Take first URL if comma/space separated (e.g. "https://prod/api, http://localhost/api")
  let first = s.split(/[\s,]+/)[0]?.trim() || s;
  // Fix concatenation: "apihttp://" or "api,http://" → cut at second URL
  if (first.includes('apihttp://') || first.includes('api,http')) {
    const idx = first.search(/api[,]?http:\/\//i);
    if (idx !== -1) first = first.substring(0, idx + 3); // keep "api"
  }
  // If concatenated without separator (e.g. "https://prod/apihttp://localhost/api"), take first URL only
  const firstHttp = first.indexOf('http');
  const secondHttp = first.indexOf('http', firstHttp + 5);
  if (secondHttp !== -1) {
    return first.substring(0, secondHttp).replace(/[,/]+$/, '') || first;
  }
  return first.replace(/[,/]+$/, '');
}

const RAW = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : '';
export const API_BASE = sanitizeApiBase(RAW || 'http://localhost:8000/api');

/**
 * Build API URL from a path. Path must be relative (e.g. /engine/status).
 * Throws if an absolute URL is passed to prevent accidental double-prefixing.
 */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    throw new Error(`apiUrl() received absolute URL (use relative path): ${path.substring(0, 80)}`);
  }
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${p}`;
}
