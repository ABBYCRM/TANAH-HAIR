"use strict";
const state = { user: null, csrfToken: '', route: location.hash.slice(1) || 'dashboard' };
const root = document.querySelector('#app');
async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has('content-type'))
        headers.set('content-type', 'application/json');
    if (state.csrfToken && options.method && options.method !== 'GET')
        headers.set('x-csrf-token', state.csrfToken);
    const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new Error(body.detail || body.title || `Request failed (${response.status})`);
    return body;
}
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function toast(message, kind = 'ok') {
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.textContent = message;
    document.body.append(node);
    setTimeout(() => node.remove(), 4200);
}
function loginView() {
    root.innerHTML = `<main class="login-shell"><section class="login-panel instrument-panel"><div class="brand-mark">TH</div><p class="eyebrow">CLÍNICA TANAH</p><h1>TANAH-HAIR</h1><p class="subtle">Hair-transplant planning, procedure operations and patient journey.</p><form id="login-form" class="stack"><label>Email<input name="email" type="email" value="admin@tanah.hair" autocomplete="username" required></label><label>Password<input name="password" type="password" value="ChangeMe!2026" autocomplete="current-password" required></label><button class="primary" type="submit">Enter clinical workspace</button><p id="login-error" class="form-error" role="alert"></p></form><div class="safety-note"><strong>Clinical boundary</strong><span>No autonomous diagnosis, treatment recommendation or guaranteed outcome.</span></div></section></main>`;
    document.querySelector('#login-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        try {
            const result = await api('/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
            state.user = result.user;
            state.csrfToken = result.csrfToken;
            render();
        }
        catch (error) {
            document.querySelector('#login-error').textContent = error.message;
        }
    });
}
const navItems = [
    ['dashboard', 'Overview', '⌂'], ['patients', 'Patients', '◉'], ['planning', 'Hairline Lab', '⌁'], ['procedures', 'Procedure Board', '▦'], ['visualization', 'AI Sandbox', '✦'], ['settings', 'Settings', '⚙']
];
function shell(content, title, subtitle) {
    root.innerHTML = `<div class="app-shell"><aside class="sidebar"><div class="sidebar-brand"><div class="brand-mark small">TH</div><div><strong>TANAH-HAIR</strong><span>Clinical workspace</span></div></div><nav>${navItems.map(([route, label, icon]) => `<a href="#${route}" class="${state.route === route ? 'active' : ''}"><span>${icon}</span>${label}</a>`).join('')}</nav><div class="sidebar-footer"><span class="status-dot"></span> Medical-grade controls<div class="user-card"><strong>${escapeHtml(state.user?.displayName)}</strong><span>${escapeHtml(state.user?.role)}</span></div><button id="logout" class="ghost">Sign out</button></div></aside><main class="workspace"><header class="topbar"><div><p class="eyebrow">TANAH-HAIR / ${escapeHtml(title)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div><div class="context-pills"><span>Clinical record</span><span>PT-BR</span></div></header><section class="content">${content}</section></main></div>`;
    document.querySelector('#logout')?.addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }); state.user = null; state.csrfToken = ''; loginView(); });
}
async function dashboardView() {
    const data = await api('/dashboard');
    shell(`<div class="metric-grid">${[
        ['Consultations today', data.stats.consultationsToday, 'Scheduled and confirmed'],
        ['Plans awaiting signature', data.stats.plansAwaitingSignature, 'Surgeon action required'],
        ['Follow-ups due', data.stats.followUpsDue, 'Day 2 through Month 18'],
        ['Procedure rooms', data.stats.procedureRooms, 'Readiness checks active']
    ].map(([label, value, meta]) => `<article class="metric-card instrument-panel"><span>${label}</span><strong>${value}</strong><small>${meta}</small></article>`).join('')}</div><div class="two-column"><article class="instrument-panel"><div class="section-heading"><div><p class="eyebrow">ACTIVE JOURNEYS</p><h2>Patient action queue</h2></div><a href="#patients">Open queue</a></div>${data.recent.map((patient) => `<div class="patient-row"><div class="avatar">${escapeHtml(patient.initials)}</div><div><strong>${escapeHtml(patient.preferredName)}</strong><span>${escapeHtml(patient.stage)} · ${escapeHtml(patient.nextAction)}</span></div><span class="chip">${escapeHtml(patient.photoConsent)}</span></div>`).join('')}</article><article class="instrument-panel"><div class="section-heading"><div><p class="eyebrow">INTEGRATION HEALTH</p><h2>Gemini Image Gen</h2></div><a href="#settings">Configure</a></div><div class="integration-gauge"><div class="gauge-ring ${data.ai.enabled ? 'enabled' : ''}"><span>${data.ai.enabled ? 'ON' : 'OFF'}</span></div><div><strong>${data.ai.configured ? 'Key configured' : 'Not configured'}</strong><p>${escapeHtml(data.ai.model)}</p><p>Last test: ${escapeHtml(data.ai.lastTestStatus)}</p></div></div><div class="safety-note"><strong>Sandbox-only</strong><span>Generated concepts are hypothetical, watermarked and isolated from the clinical record.</span></div></article></div>`, 'Overview', 'Operational status, clinical queues and integration health.');
}
async function patientsView() {
    const { patients } = await api('/patients');
    shell(`<article class="instrument-panel"><div class="section-heading"><div><p class="eyebrow">CARE OPERATIONS</p><h2>Patient journey queue</h2></div><button class="secondary">New patient</button></div><div class="table-wrap"><table><thead><tr><th>Patient</th><th>Stage</th><th>Next action</th><th>Risk context</th><th>Photo consent</th></tr></thead><tbody>${patients.map((patient) => `<tr><td><div class="patient-cell"><span class="avatar">${escapeHtml(patient.initials)}</span><strong>${escapeHtml(patient.preferredName)}</strong></div></td><td>${escapeHtml(patient.stage)}</td><td>${escapeHtml(patient.nextAction)}</td><td>${patient.riskChips.length ? patient.riskChips.map((chip) => `<span class="chip warning">${escapeHtml(chip)}</span>`).join(' ') : '<span class="muted">No active flags</span>'}</td><td><span class="chip">${escapeHtml(patient.photoConsent)}</span></td></tr>`).join('')}</tbody></table></div></article>`, 'Patients', 'Purpose-limited access to synthetic demonstration records.');
}
function planningView() {
    shell(`<div class="two-column planning-grid"><article class="instrument-panel clinical-paper"><div class="section-heading"><div><p class="eyebrow">VECTOR CANVAS</p><h2>Hairline Lab</h2></div><span class="chip">Unsigned draft</span></div><div class="head-canvas"><div class="head-outline"><div class="midline"></div><div class="hairline-curve"></div><span class="measure">72 mm</span></div></div><div class="tool-rack"><button>Midline</button><button>Central height</button><button>Temporal peaks</button><button>Irregularity</button></div></article><article class="instrument-panel"><p class="eyebrow">PLANNING INVARIANTS</p><h2>Clinician-authored only</h2><ul class="check-list"><li>All measurements require calibration.</li><li>Alternatives are named and versioned.</li><li>Patient review cannot alter a signed plan.</li><li>Final graft totals require surgeon signature.</li></ul><div class="safety-note"><strong>Next implementation package</strong><span>Immutable source-image overlays, donor mapping, graft worksheet and signed plan addenda.</span></div></article></div>`, 'Hairline Lab', 'Manual vector planning over immutable clinical photography.');
}
function proceduresView() {
    shell(`<div class="procedure-board">${['Pre-op time-out', 'Harvesting', 'Graft preparation', 'Implantation', 'Closure'].map((stage, index) => `<article class="procedure-stage instrument-panel"><span class="stage-number">${index + 1}</span><h2>${stage}</h2><p>${['Identity, consent, allergies and signed plan.', 'Device, punch, donor zones and extraction count.', '1/2/3/4+ hair units, solution, temperature and time.', 'Recipient-zone count, direction and angle notes.', 'Reconciliation, adverse events and discharge.'][index]}</p><div class="stage-status">Foundation scaffold</div></article>`).join('')}</div><div class="reconciliation instrument-panel"><strong>Required accounting invariant</strong><code>extracted = implanted + discarded + damaged + remaining</code><span>Procedure closure must block until reconciled or a surgeon records break-glass evidence.</span></div>`, 'Procedure Board', 'Auditable phase controls and graft reconciliation.');
}
async function visualizationView() {
    const settings = await api('/settings/integrations/gemini');
    shell(`<div class="two-column"><article class="instrument-panel"><div class="section-heading"><div><p class="eyebrow">NON-CLINICAL SANDBOX</p><h2>Generate a synthetic concept</h2></div><span class="chip ${settings.enabled ? '' : 'warning'}">${settings.enabled ? 'Enabled' : 'Disabled'}</span></div><form id="visual-form" class="stack"><label>Hair style concept<input name="style" placeholder="Short textured dark hair" required></label><label>Coverage concept<select name="coverage"><option>Conservative frontal coverage</option><option>Balanced frontal and midscalp coverage</option><option>Educational crown coverage concept</option></select></label><label>Hairline concept<select name="hairline"><option>Mature conservative hairline</option><option>Balanced natural irregularity</option><option>High-density-looking style without clinical claim</option></select></label><label>Neutral design notes<textarea name="notes" rows="4" placeholder="No patient name, CPF, diagnosis or expected result."></textarea></label><button class="primary" ${settings.enabled ? '' : 'disabled'}>Generate watermarked concept</button></form><div class="safety-note"><strong>Hard boundary</strong><span>Synthetic concept only. No patient photograph upload, diagnosis, prediction or guaranteed outcome.</span></div></article><article class="instrument-panel result-panel"><p class="eyebrow">OUTPUT</p><h2>Hypothetical visualization</h2><div id="visual-output" class="visual-placeholder"><span>✦</span><p>The generated image will appear here with a permanent watermark.</p></div></article></div>`, 'AI Sandbox', 'Optional, server-side Gemini image generation with strict guardrails.');
    document.querySelector('#visual-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const button = formElement.querySelector('button');
        button.disabled = true;
        button.textContent = 'Generating…';
        try {
            const body = Object.fromEntries(new FormData(formElement));
            const result = await api('/visualizations', { method: 'POST', body: JSON.stringify(body) });
            document.querySelector('#visual-output').innerHTML = `<img src="${result.outputDataUrl}" alt="Watermarked hypothetical synthetic hair concept"><p class="muted">${escapeHtml(result.model)} · ${escapeHtml(result.createdAt)}</p>`;
        }
        catch (error) {
            toast(error.message, 'error');
        }
        finally {
            button.disabled = false;
            button.textContent = 'Generate watermarked concept';
        }
    });
}
async function settingsView() {
    const settings = await api('/settings/integrations/gemini');
    shell(`<div class="settings-layout"><aside class="settings-nav instrument-panel"><strong>Settings</strong><a class="active">Gemini Image Gen</a><a>Security</a><a>Roles and access</a><a>Audit</a><a>Retention</a></aside><article class="instrument-panel"><div class="section-heading"><div><p class="eyebrow">SERVER-SIDE INTEGRATION</p><h2>Gemini Image Gen API</h2></div><span class="chip ${settings.configured ? '' : 'warning'}">${settings.configured ? 'Configured' : 'Not configured'}</span></div><p class="lede">The key is encrypted by the API and never exposed to the browser after save. Changing or testing it requires step-up authentication.</p><form id="gemini-form" class="stack"><label>API key<input name="apiKey" type="password" autocomplete="new-password" placeholder="${escapeHtml(settings.maskedKey || 'Paste a new Gemini API key')}"><small>Leave blank to retain the existing encrypted key.</small></label><label>Image model<select name="model"><option value="gemini-3.1-flash-image" ${settings.model === 'gemini-3.1-flash-image' ? 'selected' : ''}>Gemini 3.1 Flash Image</option><option value="gemini-3.1-flash-lite-image" ${settings.model === 'gemini-3.1-flash-lite-image' ? 'selected' : ''}>Gemini 3.1 Flash Lite Image</option><option value="gemini-3-pro-image" ${settings.model === 'gemini-3-pro-image' ? 'selected' : ''}>Gemini 3 Pro Image</option></select></label><label class="toggle-row"><input name="enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}><span><strong>Enable Gemini visualization</strong><small>Tenant kill switch. Clinical workflows remain functional when off.</small></span></label><label class="toggle-row"><input name="sandboxAcknowledged" type="checkbox" ${settings.sandboxAcknowledged ? 'checked' : ''}><span><strong>Restrict to non-clinical hypothetical visualization</strong><small>No identifiable patient images, diagnosis, advice, prediction or marketing result.</small></span></label><label>Administrator password for step-up<input name="password" type="password" autocomplete="current-password" required></label><div class="button-row"><button class="primary" type="submit">Save encrypted settings</button><button id="test-gemini" class="secondary" type="button">Test connection</button></div></form><dl class="metadata"><div><dt>Stored key</dt><dd>${escapeHtml(settings.maskedKey || 'None')}</dd></div><div><dt>Last test</dt><dd>${escapeHtml(settings.lastTestStatus)}${settings.lastTestAt ? ` · ${escapeHtml(settings.lastTestAt)}` : ''}</dd></div><div><dt>Last update</dt><dd>${escapeHtml(settings.updatedAt || 'Never')}</dd></div></dl><div class="safety-note"><strong>Secret handling</strong><span>No VITE_ variable, no frontend SDK, no logging, no plaintext read-back. Production should replace local encrypted storage with a managed secret service.</span></div></article></div>`, 'Settings', 'Tenant integrations, secrets and safety controls.');
    async function stepUp(password) {
        const result = await api('/auth/step-up', { method: 'POST', body: JSON.stringify({ password }) });
        return result.stepUpToken;
    }
    const form = document.querySelector('#gemini-form');
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        try {
            const token = await stepUp(String(data.get('password') || ''));
            const body = { apiKey: data.get('apiKey'), model: data.get('model'), enabled: data.get('enabled') === 'on', sandboxAcknowledged: data.get('sandboxAcknowledged') === 'on' };
            await api('/settings/integrations/gemini', { method: 'PUT', headers: { 'x-step-up-token': token }, body: JSON.stringify(body) });
            toast('Gemini settings encrypted and saved.');
            await settingsView();
        }
        catch (error) {
            toast(error.message, 'error');
        }
    });
    document.querySelector('#test-gemini').addEventListener('click', async () => {
        const data = new FormData(form);
        try {
            const token = await stepUp(String(data.get('password') || ''));
            const result = await api('/settings/integrations/gemini/test', { method: 'POST', headers: { 'x-step-up-token': token }, body: '{}' });
            toast(result.modelVisible ? 'Connected and selected model is visible.' : 'Connected, but selected model was not listed for this key.');
            await settingsView();
        }
        catch (error) {
            toast(error.message, 'error');
        }
    });
}
async function render() {
    if (!state.user)
        return loginView();
    try {
        if (state.route === 'dashboard')
            return await dashboardView();
        if (state.route === 'patients')
            return await patientsView();
        if (state.route === 'planning')
            return planningView();
        if (state.route === 'procedures')
            return proceduresView();
        if (state.route === 'visualization')
            return await visualizationView();
        if (state.route === 'settings')
            return await settingsView();
        state.route = 'dashboard';
        await dashboardView();
    }
    catch (error) {
        if (error.message.toLowerCase().includes('sign in')) {
            state.user = null;
            return loginView();
        }
        root.innerHTML = `<main class="fatal"><h1>Unable to load workspace</h1><p>${escapeHtml(error.message)}</p><button onclick="location.reload()">Retry</button></main>`;
    }
}
window.addEventListener('hashchange', () => { state.route = location.hash.slice(1) || 'dashboard'; render(); });
if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('/clinic/service-worker.js').catch(console.error);
api('/auth/me').then(result => { state.user = result.user; state.csrfToken = result.csrfToken; render(); }).catch(() => loginView());
