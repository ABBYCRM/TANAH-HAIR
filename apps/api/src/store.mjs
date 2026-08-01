import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashPassword, randomId } from './security.mjs';

export class JsonStore {
  constructor({ dataDir, adminEmail, adminPassword }) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'tanah-hair.json');
    this.adminEmail = adminEmail;
    this.adminPassword = adminPassword;
    this.data = null;
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true });
    try {
      this.data = JSON.parse(await readFile(this.file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.data = this.seed();
      await this.persist();
    }
    return this;
  }

  seed() {
    const now = new Date().toISOString();
    return {
      schemaVersion: 1,
      users: [
        {
          id: randomId(),
          email: this.adminEmail.toLowerCase(),
          displayName: 'Administrator TANAH-HAIR',
          role: 'admin',
          passwordHash: hashPassword(this.adminPassword),
          active: true,
          createdAt: now
        },
        {
          id: randomId(),
          email: 'juliana@tanah.hair',
          displayName: 'Dra. Juliana Ribeiro',
          role: 'clinician',
          passwordHash: hashPassword('1234'),
          active: true,
          createdAt: now
        },
        {
          id: randomId(),
          email: 'assistant@tanah.hair',
          displayName: 'Care assistant',
          role: 'assistant',
          passwordHash: hashPassword('1234'),
          active: true,
          createdAt: now
        }
      ],
      sessions: [],
      integrations: {},
      patients: [
        { id: 'pt-demo-001', initials: 'MR', preferredName: 'Marcos', stage: 'Consultation', nextAction: 'Standardized photo set', riskChips: ['Allergy review'], photoConsent: 'care-only' },
        { id: 'pt-demo-002', initials: 'AL', preferredName: 'Ana', stage: 'Planning', nextAction: 'Surgeon plan signature', riskChips: ['Smoking'], photoConsent: 'care-only' },
        { id: 'pt-demo-003', initials: 'JP', preferredName: 'João', stage: 'Day 7 follow-up', nextAction: 'Upload donor and recipient photos', riskChips: [], photoConsent: 'care-only' },
        { id: 'pt-sim-001', initials: 'LP', preferredName: 'Luis Pereira', stage: 'Simulation review', nextAction: 'AI simulator — review 3 alternative looks', riskChips: ['None'], photoConsent: 'care-only' }
      ],
      visualizations: [],
      auditEvents: []
    };
  }

  snapshot() {
    return structuredClone(this.data);
  }

  async mutate(mutator) {
    let result;
    this.writeQueue = this.writeQueue.then(async () => {
      result = await mutator(this.data);
      await this.persist();
    });
    await this.writeQueue;
    return result;
  }

  async persist() {
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    await rename(tmp, this.file);
  }
}
