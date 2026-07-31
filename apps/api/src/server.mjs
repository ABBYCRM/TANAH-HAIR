import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JsonStore } from './store.mjs';
import { createHandler } from './app.mjs';
import { normalizeMasterKey, randomId } from './security.mjs';

function loadEnvFile() {
  return readFile(path.resolve('.env'), 'utf8').then(text => {
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
    }
  }).catch(error => { if (error.code !== 'ENOENT') throw error; });
}

async function resolveMasterKey(dataDir) {
  if (process.env.MASTER_ENCRYPTION_KEY) return normalizeMasterKey(process.env.MASTER_ENCRYPTION_KEY);
  if (process.env.NODE_ENV === 'production') throw new Error('MASTER_ENCRYPTION_KEY is required in production');
  await mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, 'master.key');
  try {
    return normalizeMasterKey((await readFile(file, 'utf8')).trim());
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const generated = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
    await writeFile(file, generated, { mode: 0o600 });
    console.warn('Generated a development MASTER_ENCRYPTION_KEY in apps/api/data/master.key. Do not use this behavior in production.');
    return normalizeMasterKey(generated);
  }
}

await loadEnvFile();
const port = Number(process.env.PORT || 3000);
const dataDir = path.resolve(process.env.DATA_DIR || './apps/api/data');
const sessionSecret = process.env.SESSION_SECRET || `development-${randomId(32)}`;
if (!process.env.SESSION_SECRET) console.warn('Using an ephemeral development SESSION_SECRET. Configure it in .env for stable sessions.');
const masterKey = await resolveMasterKey(dataDir);
const store = await new JsonStore({
  dataDir,
  adminEmail: process.env.DEMO_ADMIN_EMAIL || 'admin@tanah.hair',
  adminPassword: process.env.DEMO_ADMIN_PASSWORD || 'ChangeMe!2026'
}).init();

const server = createServer(createHandler({
  store,
  sessionSecret,
  masterKey,
  secureCookies: process.env.NODE_ENV === 'production'
}));
server.listen(port, () => console.log(`TANAH-HAIR running at http://localhost:${port}/clinic/`));
