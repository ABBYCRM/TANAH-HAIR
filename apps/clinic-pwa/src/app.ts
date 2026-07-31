// TANAH-HAIR clinic PWA - clinical skeuomorphism (HairPath §4)
// Renders: login, dashboard, patients, hairline lab (with paper canvas + ruler),
// procedure board (with graft counter + reconciliation), AI sandbox, settings.

type User = { id: string; email: string; displayName: string; role: string };
type GeminiSettings = { configured: boolean; maskedKey: string | null; enabled: boolean; model: string; sandboxAcknowledged: boolean; updatedAt: string | null; lastTestAt: string | null; lastTestStatus: string };
type Patient = { id: string; preferredName: string; initials: string; stage: string; nextAction: string; photoConsent: string; riskChips: string[] };

const state: { user: User | null; csrfToken: string; route: string } = {
  user: null,
  csrfToken: '',
  route: location.hash.slice(1) || 'dashboard'
};
const root = document.querySelector<HTMLElement>('#app')!;

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (state.csrfToken && options.method && options.method !== 'GET') headers.set('x-csrf-token', state.csrfToken);
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || body.title || `Request failed (${response.status})`);
  return body;
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]!));
}

function toast(message: string, kind: 'ok' | 'error' | 'warning' = 'ok') {
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 4200);
}

function loginView() {
  root.innerHTML = `
    <main class="login-shell">
      <section class="login-panel">
        <div class="brand-mark">TH</div>
        <p class="eyebrow-block">CLÍNICA TANAH</p>
        <h1>TANAH-HAIR</h1>
        <p class="subtle">Hair-transplant planning, procedure operations and patient journey.</p>
        <form id="login-form" class="stack">
          <label>Email<input name="email" type="email" value="admin@tanah.hair" autocomplete="username" required></label>
          <label>Password<input name="password" type="password" value="1234" autocomplete="current-password" required></label>
          <button class="primary" type="submit">Enter clinical workspace</button>
          <p id="login-error" class="form-error" role="alert"></p>
        </form>
        <div class="safety-note mt-16">
          <strong>Clinical boundary</strong>
          <span>No autonomous diagnosis, treatment recommendation or guaranteed outcome.</span>
        </div>
      </section>
    </main>
  `;
  document.querySelector<HTMLFormElement>('#login-form')!.addEventListener('submit', async event => {
    event.preventDefault();
    const formElement = event.currentTarget as HTMLFormElement;
    const form = new FormData(formElement);
    try {
      const result = await api<{ user: User; csrfToken: string }>('/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      state.user = result.user; state.csrfToken = result.csrfToken; render();
    } catch (error) {
      document.querySelector<HTMLElement>('#login-error')!.textContent = (error as Error).message;
    }
  });
}

const navItems: [string, string, string][] = [
  ['dashboard', 'Overview', '⌂'],
  ['patients', 'Patients', '◉'],
  ['planning', 'Hairline Lab', '⌁'],
  ['procedures', 'Procedure Board', '▦'],
  ['visualization', 'AI Sandbox', '✦'],
  ['settings', 'Settings', '⚙']
];

function shell(content: string, title: string, subtitle: string) {
  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand-mark small">TH</div>
          <div>
            <strong>TANAH-HAIR</strong>
            <span>Clinical workspace</span>
          </div>
        </div>
        <nav>${navItems.map(([route, label, icon]) => `<a href="#${route}" class="${state.route === route ? 'active' : ''}"><span class="nav-icon">${icon}</span>${label}</a>`).join('')}</nav>
        <div class="sidebar-footer">
          <span><span class="status-dot"></span>Medical-grade controls</span>
          <div class="user-card">
            <strong>${escapeHtml(state.user?.displayName)}</strong>
            <span>${escapeHtml(state.user?.role)}</span>
          </div>
          <button id="logout" class="ghost">Sign out</button>
        </div>
      </aside>
      <main class="workspace">
        <header class="topbar">
          <div>
            <p class="eyebrow">TANAH-HAIR / ${escapeHtml(title)}</p>
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(subtitle)}</p>
          </div>
          <div class="context-pills">
            <span>Clinical record</span>
            <span>PT-BR</span>
          </div>
        </header>
        <section class="content">${content}</section>
      </main>
    </div>
  `;
  document.querySelector('#logout')?.addEventListener('click', async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    state.user = null; state.csrfToken = ''; loginView();
  });
}

// ----- Signature components -----

function hairlineLabCanvas() {
  // Vector hairline overlay: midline, glabella, central height, temporal peaks
  // Symmetry markers on either side; scale in mm. All SVG; no raster paint.
  return `
    <div class="head-canvas">
      <div class="head-outline">
        <svg viewBox="0 0 500 400" preserveAspectRatio="xMidYMid meet" aria-label="Hairline planning vector canvas">
          <!-- gridded paper background (already on container) -->
          <!-- head silhouette -->
          <ellipse cx="250" cy="200" rx="140" ry="170" fill="none" stroke="#1F2A3A" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.5"/>
          <!-- glabella reference -->
          <line x1="250" y1="60" x2="250" y2="340" stroke="#1F2A3A" stroke-width="0.6" stroke-dasharray="2 4" opacity="0.5"/>
          <text x="254" y="68" font-family="JetBrains Mono, monospace" font-size="9" fill="#1F2A3A" opacity="0.7">midline</text>
          <!-- proposed central height -->
          <line x1="250" y1="120" x2="250" y2="180" stroke="#BE123C" stroke-width="1.4"/>
          <text x="256" y="135" font-family="JetBrains Mono, monospace" font-size="9" fill="#BE123C">central 72 mm</text>
          <!-- macro hairline (red — proposed) -->
          <path d="M 110 200 Q 160 150 220 130 Q 250 122 280 130 Q 340 150 390 200" fill="none" stroke="#BE123C" stroke-width="1.8" stroke-linecap="round"/>
          <!-- micro irregularity (proposed) -->
          <path d="M 130 210 Q 145 195 160 205 Q 175 192 190 207 Q 205 195 220 200 Q 235 188 250 195 Q 265 188 280 200 Q 295 195 310 207 Q 325 192 340 205 Q 355 195 370 210" fill="none" stroke="#BE123C" stroke-width="1" stroke-linecap="round" opacity="0.7"/>
          <!-- temporal peaks -->
          <circle cx="115" cy="205" r="4" fill="none" stroke="#0284C7" stroke-width="1.4"/>
          <circle cx="385" cy="205" r="4" fill="none" stroke="#0284C7" stroke-width="1.4"/>
          <text x="100" y="225" font-family="JetBrains Mono, monospace" font-size="9" fill="#0284C7">L peak</text>
          <text x="388" y="225" font-family="JetBrains Mono, monospace" font-size="9" fill="#0284C7">R peak</text>
          <!-- frontotemporal angle -->
          <path d="M 115 205 L 220 130" stroke="#0D9488" stroke-width="0.8" stroke-dasharray="2 2" opacity="0.8"/>
          <text x="130" y="160" font-family="JetBrains Mono, monospace" font-size="9" fill="#0D9488" transform="rotate(-32 130 160)">frontotemporal ∠ 78°</text>
          <!-- symmetry markers (centered, no measurement, just presence) -->
          <line x1="240" y1="340" x2="260" y2="340" stroke="#1F2A3A" stroke-width="1"/>
          <line x1="250" y1="332" x2="250" y2="348" stroke="#1F2A3A" stroke-width="1"/>
        </svg>
      </div>
      <span class="measure">72 mm · 78°</span>
      <div class="scale-legend">
        <span>0</span><span class="bar"></span><span>50 mm</span>
      </div>
    </div>
  `;
}

function graftCounter(value: number, label = 'Total grafts') {
  const digits = String(value).padStart(4, '0').split('');
  return `
    <div>
      <p class="eyebrow">${escapeHtml(label)}</p>
      <div class="graft-counter" role="status" aria-label="${escapeHtml(label)} ${value}">
        ${digits.map(d => `<div class="segment">${d}</div>`).join('')}
      </div>
    </div>
  `;
}

function timelineDial(active: 'pre' | 'd0' | 'd1-3' | 'd7-14' | 'm1' | 'm3' | 'm6' | 'm9' | 'm12' | 'm18') {
  const ticks = [
    { id: 'd0', label: 'D 0' },
    { id: 'd1-3', label: 'D 1-3' },
    { id: 'd7-14', label: 'D 7-14' },
    { id: 'm1', label: 'M 1' },
    { id: 'm3', label: 'M 3' },
    { id: 'm6', label: 'M 6' },
    { id: 'm9', label: 'M 9' },
    { id: 'm12', label: 'M 12' },
    { id: 'm18', label: 'M 18' }
  ] as const;
  const order = ['d0', 'd1-3', 'd7-14', 'm1', 'm3', 'm6', 'm9', 'm12', 'm18'];
  const activeIndex = order.indexOf(active);
  return `
    <div class="timeline-dial" role="list" aria-label="Postoperative timeline">
      ${ticks.map((t, i) => {
        const cls = i < activeIndex ? 'done' : i === activeIndex ? 'active' : '';
        return `<div class="tick ${cls}" role="listitem"><span>${t.label}</span></div>`;
      }).join('')}
    </div>
  `;
}

function patientHeader(p: Patient) {
  const risks = p.riskChips?.length
    ? p.riskChips.map(c => `<span class="chip ${c.toLowerCase().includes('alerg') || c.toLowerCase().includes('anticoag') || c.toLowerCase().includes('smok') ? 'warning' : ''}">${escapeHtml(c)}</span>`).join(' ')
    : `<span class="chip muted">No active flags</span>`;
  return `
    <div class="instrument-panel grid-auto">
      <div class="avatar avatar-lg">${escapeHtml(p.initials)}</div>
      <div>
        <div class="flex items-center gap-12 flex-wrap">
          <strong class="name-lg">${escapeHtml(p.preferredName)}</strong>
          <span class="chip">${escapeHtml(p.stage)}</span>
          <span class="chip">${escapeHtml(p.photoConsent)}</span>
        </div>
        <p class="muted mt-4 mb-8">Next: ${escapeHtml(p.nextAction)}</p>
        <div class="flex gap-6 flex-wrap">${risks}</div>
      </div>
    </div>
  `;
}

// ----- Routes -----

async function dashboardView() {
  const data = await api<{ stats: any; recent: Patient[]; ai: GeminiSettings }>('/dashboard');
  shell(`
    <div class="metric-grid">
      ${[
        ['Consultations today', data.stats.consultationsToday, 'Scheduled and confirmed', ''],
        ['Plans awaiting signature', data.stats.plansAwaitingSignature, 'Surgeon action required', 'warning'],
        ['Follow-ups due', data.stats.followUpsDue, 'Day 2 through Month 18', ''],
        ['Procedure rooms', data.stats.procedureRooms, 'Readiness checks active', '']
      ].map(([label, value, meta, mod]) => `<article class="metric-card ${mod}"><span>${label}</span><strong>${value}</strong><small>${meta}</small></article>`).join('')}
    </div>
    <div class="two-column">
      <article class="instrument-panel">
        <div class="section-heading">
          <div><p class="eyebrow">ACTIVE JOURNEYS</p><h2>Patient action queue</h2></div>
          <a href="#patients">Open queue</a>
        </div>
        ${data.recent.slice(0, 6).map(patient => `
          <div class="patient-row">
            <div class="avatar">${escapeHtml(patient.initials)}</div>
            <div>
              <strong>${escapeHtml(patient.preferredName)}</strong>
              <span>${escapeHtml(patient.stage)} · ${escapeHtml(patient.nextAction)}</span>
            </div>
            <span class="chip">${escapeHtml(patient.photoConsent)}</span>
          </div>
        `).join('')}
      </article>
      <article class="instrument-panel">
        <div class="section-heading">
          <div><p class="eyebrow">INTEGRATION HEALTH</p><h2>Gemini Image Gen</h2></div>
          <a href="#settings">Configure</a>
        </div>
        <div class="integration-gauge">
          <div class="gauge-ring ${data.ai.enabled ? 'enabled' : ''}"><span>${data.ai.enabled ? 'ON' : 'OFF'}</span></div>
          <div>
            <strong>${data.ai.configured ? 'Key configured' : 'Not configured'}</strong>
            <p>${escapeHtml(data.ai.model)}</p>
            <p>Last test: ${escapeHtml(data.ai.lastTestStatus)}</p>
          </div>
        </div>
        <div class="safety-note">
          <strong>Sandbox-only</strong>
          <span>Generated concepts are hypothetical, watermarked and isolated from the clinical record.</span>
        </div>
      </article>
    </div>
  `, 'Overview', 'Operational status, clinical queues and integration health.');
}

async function patientsView() {
  const { patients } = await api<{ patients: Patient[] }>('/patients');
  const first = patients[0];
  shell(`
    ${first ? patientHeader(first) : ''}
    <article class="instrument-panel">
      <div class="section-heading">
        <div><p class="eyebrow">CARE OPERATIONS</p><h2>Patient journey queue</h2></div>
        <button class="secondary">New patient</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Stage</th>
              <th>Next action</th>
              <th>Risk context</th>
              <th>Photo consent</th>
            </tr>
          </thead>
          <tbody>
            ${patients.map(patient => `
              <tr>
                <td>
                  <div class="patient-cell">
                    <span class="avatar">${escapeHtml(patient.initials)}</span>
                    <strong>${escapeHtml(patient.preferredName)}</strong>
                  </div>
                </td>
                <td>${escapeHtml(patient.stage)}</td>
                <td>${escapeHtml(patient.nextAction)}</td>
                <td>${patient.riskChips.length
                  ? patient.riskChips.map(c => `<span class="chip warning">${escapeHtml(c)}</span>`).join(' ')
                  : '<span class="muted">No active flags</span>'}</td>
                <td><span class="chip">${escapeHtml(patient.photoConsent)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </article>
    <article class="instrument-panel">
      <div class="section-heading">
        <div><p class="eyebrow">POSTOPERATIVE TIMELINE</p><h2>Active follow-up dial</h2></div>
        <span class="chip muted">Demo data</span>
      </div>
      ${timelineDial('d1-3')}
      <p class="muted timeline-note">Checkpoint status is based on actual photos, not generated progress.</p>
    </article>
  `, 'Patients', 'Purpose-limited access to synthetic demonstration records.');
}

function planningView() {
  shell(`
    <div class="two-column planning-grid">
      <article class="instrument-panel clinical-paper">
        <div class="section-heading">
          <div><p class="eyebrow">VECTOR CANVAS</p><h2>Hairline Lab</h2></div>
          <span class="chip chip-paper">Unsigned draft</span>
        </div>
        ${hairlineLabCanvas()}
        <div class="tool-rack">
          <button class="active">Midline</button>
          <button>Central height</button>
          <button>Temporal peaks</button>
          <button>Frontotemporal ∠</button>
          <button>Macro</button>
          <button>Micro</button>
          <button>Symmetry</button>
        </div>
        <div class="safety-note mt-14">
          <strong>Vector-only</strong>
          <span>The source image is immutable. All overlays are vectors and the original is preserved by hash.</span>
        </div>
      </article>
      <article class="instrument-panel">
        <p class="eyebrow">PLANNING INVARIANTS</p>
        <h2 class="section-h2-tight">Clinician-authored only</h2>
        <ul class="check-list">
          <li>All measurements require calibration.</li>
          <li>Alternatives are named and versioned.</li>
          <li>Patient review cannot alter a signed plan.</li>
          <li>Final graft totals require surgeon signature.</li>
        </ul>
        <div class="safety-note mt-14">
          <strong>Next implementation package</strong>
          <span>Immutable source-image overlays, donor mapping, graft worksheet and signed plan addenda.</span>
        </div>
      </article>
    </div>
  `, 'Hairline Lab', 'Manual vector planning over immutable clinical photography.');
}

function proceduresView() {
  shell(`
    <div class="two-column">
      <article class="instrument-panel">
        <div class="section-heading">
          <div><p class="eyebrow">PROCEDURE DAY</p><h2>Operating phases</h2></div>
          <span class="chip muted">Foundation scaffold</span>
        </div>
        <div class="procedure-board">
          ${[
            ['Pre-op time-out', 'Identity, consent, allergies and signed plan.'],
            ['Harvesting', 'Device, punch, donor zones and extraction count.'],
            ['Graft preparation', '1/2/3/4+ hair units, solution, temperature and time.'],
            ['Implantation', 'Recipient-zone count, direction and angle notes.'],
            ['Closure', 'Reconciliation, adverse events and discharge.']
          ].map(([stage, desc], i) => `
            <article class="procedure-stage">
              <span class="stage-number">${i + 1}</span>
              <h2>${stage}</h2>
              <p>${desc}</p>
              <div class="stage-status">Awaiting live data</div>
            </article>
          `).join('')}
        </div>
      </article>
      <div class="flex-col gap-20">
        <article class="instrument-panel">
          <p class="eyebrow">GRAFT COUNTER</p>
          <h2 class="section-h2-tight">Mechanical tally</h2>
          ${graftCounter(2148, 'Session 1 — running total')}
          <p class="muted mt-8">Every adjustment logs the previous value, new value, author and reason.</p>
        </article>
        <article class="instrument-panel reconciliation">
          <strong class="reconciliation-title">Required accounting invariant</strong>
          <code>extracted = implanted + discarded + damaged + remaining</code>
          <span class="reconciliation-note">Procedure closure must block until reconciled or a surgeon records break-glass evidence.</span>
        </article>
      </div>
    </div>
  `, 'Procedure Board', 'Auditable phase controls and graft reconciliation.');
}

async function visualizationView() {
  const settings = await api<GeminiSettings>('/settings/integrations/gemini');
  shell(`
    <div class="two-column">
      <article class="instrument-panel">
        <div class="section-heading">
          <div><p class="eyebrow">NON-CLINICAL SANDBOX</p><h2>Generate a synthetic concept</h2></div>
          <span class="chip ${settings.enabled ? '' : 'warning'}">${settings.enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <form id="visual-form" class="stack">
          <label>Hair style concept<input name="style" placeholder="Short textured dark hair" required></label>
          <label>Coverage concept
            <select name="coverage">
              <option>Conservative frontal coverage</option>
              <option>Balanced frontal and midscalp coverage</option>
              <option>Educational crown coverage concept</option>
            </select>
          </label>
          <label>Hairline concept
            <select name="hairline">
              <option>Mature conservative hairline</option>
              <option>Balanced natural irregularity</option>
              <option>High-density-looking style without clinical claim</option>
            </select>
          </label>
          <label>Neutral design notes<textarea name="notes" rows="4" placeholder="No patient name, CPF, diagnosis or expected result."></textarea></label>
          <button class="primary" ${settings.enabled ? '' : 'disabled'}>Generate watermarked concept</button>
        </form>
        <div class="safety-note mt-14">
          <strong>Hard boundary</strong>
          <span>Synthetic concept only. No patient photograph upload, diagnosis, prediction or guaranteed outcome.</span>
        </div>
      </article>
      <article class="instrument-panel result-panel">
        <p class="eyebrow">OUTPUT</p>
        <h2 class="section-h2-tight">Hypothetical visualization</h2>
        <div id="visual-output" class="visual-placeholder">
          <span>✦</span>
          <p>The generated image will appear here with a permanent watermark.</p>
        </div>
      </article>
    </div>
  `, 'AI Sandbox', 'Optional, server-side Gemini image generation with strict guardrails.');
  document.querySelector<HTMLFormElement>('#visual-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const formElement = event.currentTarget as HTMLFormElement;
    const button = formElement.querySelector<HTMLButtonElement>('button')!;
    button.disabled = true; button.textContent = 'Generating…';
    try {
      const body = Object.fromEntries(new FormData(formElement));
      const result = await api<any>('/visualizations', { method: 'POST', body: JSON.stringify(body) });
      const out = document.querySelector<HTMLElement>('#visual-output')!;
      out.innerHTML = `<img src="${result.outputDataUrl}" alt="Watermarked hypothetical synthetic hair concept"><p class="muted">${escapeHtml(result.model)} · ${escapeHtml(result.createdAt)}</p>`;
    } catch (error) { toast((error as Error).message, 'error'); }
    finally { button.disabled = false; button.textContent = 'Generate watermarked concept'; }
  });
}

async function settingsView() {
  const settings = await api<GeminiSettings>('/settings/integrations/gemini');
  shell(`
    <div class="settings-layout">
      <aside class="settings-nav instrument-panel flat">
        <strong>Settings</strong>
        <a class="active">Gemini Image Gen</a>
        <a>Security</a>
        <a>Roles and access</a>
        <a>Audit</a>
        <a>Retention</a>
      </aside>
      <article class="instrument-panel">
        <div class="section-heading">
          <div><p class="eyebrow">SERVER-SIDE INTEGRATION</p><h2>Gemini Image Gen API</h2></div>
          <span class="chip ${settings.configured ? '' : 'warning'}">${settings.configured ? 'Configured' : 'Not configured'}</span>
        </div>
        <p class="lede-paragraph">The key is encrypted by the API and never exposed to the browser after save. Changing or testing it requires step-up authentication.</p>
        <form id="gemini-form" class="stack">
          <label>API key
            <input name="apiKey" type="password" autocomplete="new-password" placeholder="${escapeHtml(settings.maskedKey || 'Paste a new Gemini API key')}">
            <small>Leave blank to retain the existing encrypted key.</small>
          </label>
          <label>Image model
            <select name="model">
              <option value="gemini-3.1-flash-image" ${settings.model === 'gemini-3.1-flash-image' ? 'selected' : ''}>Gemini 3.1 Flash Image</option>
              <option value="gemini-3.1-flash-lite-image" ${settings.model === 'gemini-3.1-flash-lite-image' ? 'selected' : ''}>Gemini 3.1 Flash Lite Image</option>
              <option value="gemini-3-pro-image" ${settings.model === 'gemini-3-pro-image' ? 'selected' : ''}>Gemini 3 Pro Image</option>
            </select>
          </label>
          <label class="toggle-row">
            <input name="enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}>
            <span>
              <strong>Enable Gemini visualization</strong>
              <small>Tenant kill switch. Clinical workflows remain functional when off.</small>
            </span>
          </label>
          <label class="toggle-row">
            <input name="sandboxAcknowledged" type="checkbox" ${settings.sandboxAcknowledged ? 'checked' : ''}>
            <span>
              <strong>Restrict to non-clinical hypothetical visualization</strong>
              <small>No identifiable patient images, diagnosis, advice, prediction or marketing result.</small>
            </span>
          </label>
          <label>Administrator password for step-up
            <input name="password" type="password" autocomplete="current-password" required>
          </label>
          <div class="button-row">
            <button class="primary" type="submit">Save encrypted settings</button>
            <button id="test-gemini" class="secondary" type="button">Test connection</button>
          </div>
        </form>
        <dl class="metadata">
          <div><dt>Stored key</dt><dd>${escapeHtml(settings.maskedKey || 'None')}</dd></div>
          <div><dt>Last test</dt><dd>${escapeHtml(settings.lastTestStatus)}${settings.lastTestAt ? ` · ${escapeHtml(settings.lastTestAt)}` : ''}</dd></div>
          <div><dt>Last update</dt><dd>${escapeHtml(settings.updatedAt || 'Never')}</dd></div>
        </dl>
        <div class="safety-note mt-14">
          <strong>Secret handling</strong>
          <span>No VITE_ variable, no frontend SDK, no logging, no plaintext read-back. Production should replace local encrypted storage with a managed secret service.</span>
        </div>
      </article>
    </div>
  `, 'Settings', 'Tenant integrations, secrets and safety controls.');

  async function stepUp(password: string) {
    const result = await api<{ stepUpToken: string }>('/auth/step-up', { method: 'POST', body: JSON.stringify({ password }) });
    return result.stepUpToken;
  }
  const form = document.querySelector<HTMLFormElement>('#gemini-form')!;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    try {
      const token = await stepUp(String(data.get('password') || ''));
      const body = { apiKey: data.get('apiKey'), model: data.get('model'), enabled: data.get('enabled') === 'on', sandboxAcknowledged: data.get('sandboxAcknowledged') === 'on' };
      await api('/settings/integrations/gemini', { method: 'PUT', headers: { 'x-step-up-token': token }, body: JSON.stringify(body) });
      toast('Gemini settings encrypted and saved.'); await settingsView();
    } catch (error) { toast((error as Error).message, 'error'); }
  });
  document.querySelector<HTMLButtonElement>('#test-gemini')!.addEventListener('click', async () => {
    const data = new FormData(form);
    try {
      const token = await stepUp(String(data.get('password') || ''));
      const result = await api<any>('/settings/integrations/gemini/test', { method: 'POST', headers: { 'x-step-up-token': token }, body: '{}' });
      toast(result.modelVisible ? 'Connected and selected model is visible.' : 'Connected, but selected model was not listed for this key.', result.modelVisible ? 'ok' : 'warning');
      await settingsView();
    } catch (error) { toast((error as Error).message, 'error'); }
  });
}

async function render() {
  if (!state.user) return loginView();
  try {
    if (state.route === 'dashboard') return await dashboardView();
    if (state.route === 'patients') return await patientsView();
    if (state.route === 'planning') return planningView();
    if (state.route === 'procedures') return proceduresView();
    if (state.route === 'visualization') return await visualizationView();
    if (state.route === 'settings') return await settingsView();
    state.route = 'dashboard'; await dashboardView();
  } catch (error) {
    if ((error as Error).message.toLowerCase().includes('sign in')) { state.user = null; return loginView(); }
    root.innerHTML = `<main class="fatal"><h1>Unable to load workspace</h1><p>${escapeHtml((error as Error).message)}</p><button class="primary" onclick="location.reload()">Retry</button></main>`;
  }
}

window.addEventListener('hashchange', () => { state.route = location.hash.slice(1) || 'dashboard'; render(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/clinic/service-worker.js').catch(console.error);
api<{ user: User; csrfToken: string }>('/auth/me').then(result => { state.user = result.user; state.csrfToken = result.csrfToken; render(); }).catch(() => loginView());
