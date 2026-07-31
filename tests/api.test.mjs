import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { JsonStore } from '../apps/api/src/store.mjs';
import { createHandler } from '../apps/api/src/app.mjs';

async function setup(fetchImpl = fetch) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'tanah-hair-test-'));
  const store = await new JsonStore({ dataDir, adminEmail: 'admin@test.local', adminPassword: 'CorrectHorseBatteryStaple!' }).init();
  const masterKey = Buffer.alloc(32, 7);
  const server = createServer(createHandler({ store, sessionSecret: 'test-session-secret-that-is-long-enough', masterKey, fetchImpl }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  async function close() { await new Promise(resolve => server.close(resolve)); await rm(dataDir, { recursive: true, force: true }); }
  return { base, store, dataDir, close };
}

async function login(base) {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@test.local', password: 'CorrectHorseBatteryStaple!' }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.csrfToken };
}

async function stepUp(base, auth) {
  const response = await fetch(`${base}/api/auth/step-up`, { method: 'POST', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ password: 'CorrectHorseBatteryStaple!' }) });
  assert.equal(response.status, 200);
  return (await response.json()).stepUpToken;
}

test('login rejects invalid credentials', async () => {
  const app = await setup();
  try {
    const response = await fetch(`${app.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@test.local', password: 'wrong' }) });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'INVALID_CREDENTIALS');
  } finally { await app.close(); }
});

test('Gemini settings require admin step-up and encrypt the key at rest', async () => {
  const app = await setup();
  try {
    const auth = await login(app.base);
    const noStep = await fetch(`${app.base}/api/settings/integrations/gemini`, { method: 'PUT', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 'AIza-test-key-abcdefghijklmnopqrstuvwxyz', model: 'gemini-3.1-flash-image', enabled: true, sandboxAcknowledged: true }) });
    assert.equal(noStep.status, 403);
    assert.equal((await noStep.json()).code, 'STEP_UP_REQUIRED');

    const token = await stepUp(app.base, auth);
    const save = await fetch(`${app.base}/api/settings/integrations/gemini`, { method: 'PUT', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'x-step-up-token': token, 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 'AIza-test-key-abcdefghijklmnopqrstuvwxyz', model: 'gemini-3.1-flash-image', enabled: true, sandboxAcknowledged: true }) });
    assert.equal(save.status, 200);
    const publicRecord = await save.json();
    assert.equal(publicRecord.configured, true);
    assert.match(publicRecord.maskedKey, /wxyz$/);
    assert.equal(JSON.stringify(publicRecord).includes('AIza-test-key'), false);

    const storedText = await readFile(path.join(app.dataDir, 'tanah-hair.json'), 'utf8');
    assert.equal(storedText.includes('AIza-test-key-abcdefghijklmnopqrstuvwxyz'), false);
    assert.equal(storedText.includes('ciphertext'), true);
  } finally { await app.close(); }
});

test('Gemini connection test uses the encrypted server-side key', async () => {
  let receivedKey = '';
  const fakeFetch = async (_url, options) => {
    receivedKey = options.headers['x-goog-api-key'];
    return new Response(JSON.stringify({ models: [{ name: 'models/gemini-3.1-flash-image' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const app = await setup(fakeFetch);
  try {
    const auth = await login(app.base); const token = await stepUp(app.base, auth);
    await fetch(`${app.base}/api/settings/integrations/gemini`, { method: 'PUT', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'x-step-up-token': token, 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 'AIza-test-key-abcdefghijklmnopqrstuvwxyz', model: 'gemini-3.1-flash-image', enabled: true, sandboxAcknowledged: true }) });
    const token2 = await stepUp(app.base, auth);
    const response = await fetch(`${app.base}/api/settings/integrations/gemini/test`, { method: 'POST', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'x-step-up-token': token2, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).modelVisible, true);
    assert.equal(receivedKey, 'AIza-test-key-abcdefghijklmnopqrstuvwxyz');
  } finally { await app.close(); }
});

test('visualization kill switch and prompt guardrails are enforced', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ output_image: { data: Buffer.from('fake-image').toString('base64'), mime_type: 'image/png' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  const app = await setup(fakeFetch);
  try {
    const auth = await login(app.base);
    const disabled = await fetch(`${app.base}/api/visualizations`, { method: 'POST', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ style: 'short hair', coverage: 'frontal', hairline: 'conservative' }) });
    assert.equal(disabled.status, 409);
    assert.equal((await disabled.json()).code, 'GEMINI_DISABLED');

    const token = await stepUp(app.base, auth);
    await fetch(`${app.base}/api/settings/integrations/gemini`, { method: 'PUT', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'x-step-up-token': token, 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 'AIza-test-key-abcdefghijklmnopqrstuvwxyz', model: 'gemini-3.1-flash-image', enabled: true, sandboxAcknowledged: true }) });
    const unsafe = await fetch(`${app.base}/api/visualizations`, { method: 'POST', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ style: 'short hair', coverage: 'guaranteed result', hairline: 'conservative' }) });
    assert.equal(unsafe.status, 422);
    assert.equal((await unsafe.json()).code, 'UNSAFE_VISUALIZATION_REQUEST');

    const safe = await fetch(`${app.base}/api/visualizations`, { method: 'POST', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ style: 'short textured hair', coverage: 'conservative frontal concept', hairline: 'mature natural irregularity' }) });
    assert.equal(safe.status, 201);
    const output = await safe.json();
    assert.match(output.outputDataUrl, /^data:image\/svg\+xml;base64,/);
    const svg = Buffer.from(output.outputDataUrl.split(',')[1], 'base64').toString('utf8');
    assert.match(svg, /SIMULAÇÃO HIPOTÉTICA/);
    assert.match(svg, /NÃO É PREVISÃO DE RESULTADO/);
  } finally { await app.close(); }
});
