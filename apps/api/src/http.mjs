import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png'
};

export function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    ...headers
  });
  res.end(payload);
}

export function sendProblem(res, status, code, title, detail, fieldErrors) {
  sendJson(res, status, {
    type: `https://tanah-hair.local/problems/${code.toLowerCase()}`,
    title,
    status,
    code,
    detail,
    correlationId: res.correlationId,
    ...(fieldErrors ? { fieldErrors } : {})
  });
}

export async function readJson(req, maxBytes = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Payload too large'), { status: 413, code: 'PAYLOAD_TOO_LARGE' });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON payload'), { status: 400, code: 'INVALID_JSON' });
  }
}

export function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
  }));
}

export function cookie(name, value, { maxAge, secure = false, httpOnly = true, sameSite = 'Strict', path: cookiePath = '/' } = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`, `Path=${cookiePath}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (typeof maxAge === 'number') parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

export async function serveStatic(res, root, relativePath, fallback = 'index.html') {
  const clean = decodeURIComponent(relativePath).replace(/^\/+/, '');
  const requested = path.resolve(root, clean || fallback);
  if (!requested.startsWith(path.resolve(root))) return false;
  let file = requested;
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = path.join(file, fallback);
  } catch {
    if (!path.extname(clean)) file = path.join(root, fallback);
    else return false;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': mimeTypes[path.extname(file)] || 'application/octet-stream',
      'content-length': data.length,
      'cache-control': path.basename(file) === 'service-worker.js' ? 'no-cache' : 'public, max-age=300',
      'x-content-type-options': 'nosniff'
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}
