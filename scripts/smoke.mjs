import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const port = 3137;
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'tanah-hair-smoke-'));
const root = new URL('..', import.meta.url);
const child = spawn(process.execPath, ['apps/api/src/server.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: dataDir,
    SESSION_SECRET: 'smoke-session-secret-that-is-long-enough'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await sleep(150);
    try {
      const health = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (health.ok) { ready = true; break; }
    } catch {}
  }
  if (!ready) throw new Error('API did not become ready');
  const clinic = await fetch(`http://127.0.0.1:${port}/clinic/`);
  const patient = await fetch(`http://127.0.0.1:${port}/patient/`);
  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  if (!clinic.ok || !patient.ok || !health.ok) {
    throw new Error(`Smoke failed: clinic=${clinic.status} patient=${patient.status} health=${health.status}`);
  }
  console.log('Smoke verification passed: clinic PWA, patient PWA and API are reachable.');
} finally {
  child.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
}
