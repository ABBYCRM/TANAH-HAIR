import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const b64url = (value) => Buffer.from(value).toString('base64url');
const fromB64url = (value) => Buffer.from(value, 'base64url');

export function randomId(bytes = 18) {
  return randomBytes(bytes).toString('base64url');
}

export function hashPassword(password, salt = randomBytes(16).toString('base64url')) {
  const digest = scryptSync(password, salt, 64).toString('base64url');
  return `scrypt$${salt}$${digest}`;
}

export function verifyPassword(password, encoded) {
  const [algorithm, salt, digest] = String(encoded).split('$');
  if (algorithm !== 'scrypt' || !salt || !digest) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function normalizeMasterKey(input) {
  if (!input) throw new Error('MASTER_ENCRYPTION_KEY is required');
  const decoded = Buffer.from(input, 'base64');
  if (decoded.length !== 32) throw new Error('MASTER_ENCRYPTION_KEY must decode to exactly 32 bytes');
  return decoded;
}

export function encryptSecret(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    algorithm: 'AES-256-GCM',
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
    ciphertext: ciphertext.toString('base64url')
  };
}

export function decryptSecret(envelope, key) {
  if (!envelope || envelope.version !== 1) throw new Error('Unsupported secret envelope');
  const decipher = createDecipheriv('aes-256-gcm', key, fromB64url(envelope.iv));
  decipher.setAuthTag(fromB64url(envelope.tag));
  return Buffer.concat([
    decipher.update(fromB64url(envelope.ciphertext)),
    decipher.final()
  ]).toString('utf8');
}

export function signToken(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'TANAH' }));
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token, secret) {
  const [header, body, signature] = String(token || '').split('.');
  if (!header || !body || !signature) return null;
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof payload.exp === 'number' && Date.now() >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
