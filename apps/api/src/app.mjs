import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cookie, parseCookies, readJson, sendJson, sendProblem, serveStatic } from './http.mjs';
import { decryptSecret, encryptSecret, randomId, signToken, verifyPassword, verifyToken } from './security.mjs';
import { GEMINI_MODELS, generateGeminiVisualization, publicGeminiSettings, testGeminiConnection } from './gemini.mjs';
import { COVERAGE_ZONES, HAIRLINE_PRESETS, TECHNIQUE_PRESETS, SESSION_PRESETS, CURL_PRESETS, FULLNESS_PRESETS, GRAFT_SCENARIOS, VIEW_CATALOG, BUNDLED_DEMO, getAvailableViews, renderSimulation, renderVariants, renderPhotoSimulation, renderPhotoVariants, DEMO_SCALP } from './simulator.mjs';
import { readFile } from 'node:fs/promises';

const here = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.resolve(here, '../assets');
const clinicRoot = path.resolve(here, '../../clinic-pwa/public');
const patientRoot = path.resolve(here, '../../patient-pwa/public');

const nowIso = () => new Date().toISOString();

function audit(store, event) {
  return store.mutate(data => {
    data.auditEvents.push({ id: randomId(), at: nowIso(), ...event });
    if (data.auditEvents.length > 5000) data.auditEvents.splice(0, data.auditEvents.length - 5000);
  });
}

function getSession(req, store, sessionSecret) {
  const token = parseCookies(req).tanah_session;
  const payload = verifyToken(token, sessionSecret);
  if (!payload || payload.type !== 'session') return null;
  const session = store.data.sessions.find(item => item.id === payload.sid && item.userId === payload.uid && item.expiresAt > Date.now());
  const user = session && store.data.users.find(item => item.id === session.userId && item.active);
  return session && user ? { session, user } : null;
}

function requireSession(req, res, ctx) {
  const auth = getSession(req, ctx.store, ctx.sessionSecret);
  if (!auth) {
    sendProblem(res, 401, 'AUTH_REQUIRED', 'Authentication required', 'Sign in to continue.');
    return null;
  }
  return auth;
}

function requireCsrf(req, res, auth) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return true;
  const supplied = req.headers['x-csrf-token'];
  if (!supplied || supplied !== auth.session.csrfToken) {
    sendProblem(res, 403, 'CSRF_REJECTED', 'Request rejected', 'The CSRF token is missing or invalid.');
    return false;
  }
  return true;
}

function requireAdmin(res, auth) {
  if (auth.user.role !== 'admin') {
    sendProblem(res, 403, 'ADMIN_REQUIRED', 'Administrator access required', 'This operation is restricted to tenant administrators.');
    return false;
  }
  return true;
}

function requireStepUp(req, res, auth, sessionSecret) {
  const payload = verifyToken(req.headers['x-step-up-token'], sessionSecret);
  if (!payload || payload.type !== 'step-up' || payload.uid !== auth.user.id || payload.sid !== auth.session.id) {
    sendProblem(res, 403, 'STEP_UP_REQUIRED', 'Step-up authentication required', 'Re-enter the administrator password and retry.');
    return false;
  }
  return true;
}

export function createHandler({ store, sessionSecret, masterKey, secureCookies = false, fetchImpl = fetch }) {
  const ctx = { store, sessionSecret, masterKey, secureCookies, fetchImpl };
  return async function handler(req, res) {
    res.correlationId = req.headers['x-correlation-id'] || randomId(10);
    res.setHeader('x-correlation-id', res.correlationId);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('permissions-policy', 'camera=(self), microphone=(), geolocation=()');
    res.setHeader('content-security-policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");

    try {
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/api/health') {
        return sendJson(res, 200, { status: 'ok', service: 'tanah-hair-api', time: nowIso() });
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/login') {
        const body = await readJson(req);
        const user = store.data.users.find(item => item.email === String(body.email || '').trim().toLowerCase() && item.active);
        if (!user || !verifyPassword(String(body.password || ''), user.passwordHash)) {
          await audit(store, { action: 'auth.login_failed', actorEmail: String(body.email || '').slice(0, 120), correlationId: res.correlationId });
          return sendProblem(res, 401, 'INVALID_CREDENTIALS', 'Invalid credentials', 'Email or password is incorrect.');
        }
        const session = { id: randomId(), userId: user.id, csrfToken: randomId(), expiresAt: Date.now() + 8 * 60 * 60 * 1000, createdAt: nowIso() };
        await store.mutate(data => {
          data.sessions = data.sessions.filter(item => item.expiresAt > Date.now() && item.userId !== user.id);
          data.sessions.push(session);
        });
        const token = signToken({ type: 'session', sid: session.id, uid: user.id, exp: session.expiresAt }, sessionSecret);
        await audit(store, { action: 'auth.login_succeeded', actorUserId: user.id, correlationId: res.correlationId });
        return sendJson(res, 200, { user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role }, csrfToken: session.csrfToken }, {
          'set-cookie': cookie('tanah_session', token, { maxAge: 8 * 60 * 60, secure: secureCookies })
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        if (!requireCsrf(req, res, auth)) return;
        await store.mutate(data => { data.sessions = data.sessions.filter(item => item.id !== auth.session.id); });
        await audit(store, { action: 'auth.logout', actorUserId: auth.user.id, correlationId: res.correlationId });
        return sendJson(res, 200, { ok: true }, { 'set-cookie': cookie('tanah_session', '', { maxAge: 0, secure: secureCookies }) });
      }

      if (req.method === 'GET' && url.pathname === '/api/auth/me') {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        return sendJson(res, 200, { user: { id: auth.user.id, email: auth.user.email, displayName: auth.user.displayName, role: auth.user.role }, csrfToken: auth.session.csrfToken });
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/step-up') {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        if (!requireCsrf(req, res, auth)) return;
        const body = await readJson(req);
        if (!verifyPassword(String(body.password || ''), auth.user.passwordHash)) {
          await audit(store, { action: 'auth.step_up_failed', actorUserId: auth.user.id, correlationId: res.correlationId });
          return sendProblem(res, 401, 'STEP_UP_FAILED', 'Password verification failed', 'The supplied password is incorrect.');
        }
        const exp = Date.now() + 5 * 60 * 1000;
        const token = signToken({ type: 'step-up', uid: auth.user.id, sid: auth.session.id, exp }, sessionSecret);
        await audit(store, { action: 'auth.step_up_succeeded', actorUserId: auth.user.id, correlationId: res.correlationId });
        return sendJson(res, 200, { stepUpToken: token, expiresAt: new Date(exp).toISOString() });
      }

      if (req.method === 'GET' && url.pathname === '/api/dashboard') {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        return sendJson(res, 200, {
          stats: { consultationsToday: 6, plansAwaitingSignature: 3, followUpsDue: 11, procedureRooms: 2 },
          recent: store.data.patients,
          ai: publicGeminiSettings(store.data.integrations.gemini)
        });
      }

      if (req.method === 'GET' && url.pathname === '/api/patients') {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        await audit(store, { action: 'patients.list_viewed', actorUserId: auth.user.id, purpose: 'care_operations', correlationId: res.correlationId });
        return sendJson(res, 200, { patients: store.data.patients });
      }

      if (req.method === 'GET' && url.pathname === '/api/settings/integrations/gemini') {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        if (!requireAdmin(res, auth)) return;
        return sendJson(res, 200, publicGeminiSettings(store.data.integrations.gemini));
      }

      if (req.method === 'PUT' && url.pathname === '/api/settings/integrations/gemini') {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        if (!requireCsrf(req, res, auth) || !requireAdmin(res, auth) || !requireStepUp(req, res, auth, sessionSecret)) return;
        const body = await readJson(req);
        const current = store.data.integrations.gemini || {};
        const model = String(body.model || current.model || GEMINI_MODELS[0]);
        if (!GEMINI_MODELS.includes(model)) return sendProblem(res, 400, 'INVALID_GEMINI_MODEL', 'Invalid model', 'Select an approved image-generation model.');
        const enabled = Boolean(body.enabled);
        const sandboxAcknowledged = Boolean(body.sandboxAcknowledged);
        const rawKey = String(body.apiKey || '').trim();
        if (enabled && !sandboxAcknowledged) return sendProblem(res, 409, 'SANDBOX_ACK_REQUIRED', 'Sandbox acknowledgement required', 'Acknowledge that Gemini is restricted to non-clinical hypothetical visualization.');
        if (enabled && !rawKey && !current.encryptedApiKey) return sendProblem(res, 409, 'GEMINI_KEY_REQUIRED', 'API key required', 'Configure a Gemini API key before enabling the integration.');
        const updated = {
          ...current,
          provider: 'gemini',
          enabled,
          model,
          sandboxAcknowledged,
          updatedAt: nowIso(),
          updatedBy: auth.user.id
        };
        if (rawKey) {
          if (rawKey.length < 20) return sendProblem(res, 400, 'GEMINI_KEY_INVALID', 'Invalid API key', 'The API key is too short.');
          updated.encryptedApiKey = encryptSecret(rawKey, masterKey);
          updated.apiKeyLast4 = rawKey.slice(-4);
          updated.lastTestStatus = 'not-tested-after-rotation';
          updated.lastTestAt = null;
        }
        await store.mutate(data => { data.integrations.gemini = updated; });
        await audit(store, { action: rawKey ? 'integration.gemini_key_rotated' : 'integration.gemini_settings_updated', actorUserId: auth.user.id, enabled, model, correlationId: res.correlationId });
        return sendJson(res, 200, publicGeminiSettings(updated));
      }

      if (req.method === 'POST' && url.pathname === '/api/settings/integrations/gemini/test') {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        if (!requireCsrf(req, res, auth) || !requireAdmin(res, auth) || !requireStepUp(req, res, auth, sessionSecret)) return;
        const record = store.data.integrations.gemini;
        try {
          const result = await testGeminiConnection({ record, masterKey, fetchImpl });
          await store.mutate(data => {
            data.integrations.gemini.lastTestAt = nowIso();
            data.integrations.gemini.lastTestStatus = result.modelVisible ? 'connected-model-visible' : 'connected-model-not-listed';
          });
          await audit(store, { action: 'integration.gemini_connection_tested', actorUserId: auth.user.id, outcome: 'success', correlationId: res.correlationId });
          return sendJson(res, 200, result);
        } catch (error) {
          await store.mutate(data => {
            if (data.integrations.gemini) {
              data.integrations.gemini.lastTestAt = nowIso();
              data.integrations.gemini.lastTestStatus = 'failed';
            }
          });
          await audit(store, { action: 'integration.gemini_connection_tested', actorUserId: auth.user.id, outcome: 'failure', correlationId: res.correlationId });
          throw error;
        }
      }

      if (req.method === 'POST' && url.pathname === '/api/visualizations') {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        if (!requireCsrf(req, res, auth)) return;
        const body = await readJson(req);
        const artifact = await generateGeminiVisualization({ record: store.data.integrations.gemini, masterKey, input: body, fetchImpl });
        await store.mutate(data => {
          data.visualizations.unshift({ ...artifact, createdBy: auth.user.id, outputDataUrl: artifact.outputDataUrl });
          data.visualizations = data.visualizations.slice(0, 50);
        });
        await audit(store, { action: 'visualization.generated', actorUserId: auth.user.id, visualizationId: artifact.id, model: artifact.model, purpose: 'non_clinical_education', correlationId: res.correlationId });
        return sendJson(res, 201, artifact);
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/visualizations/')) {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        const id = url.pathname.split('/').pop();
        const artifact = store.data.visualizations.find(item => item.id === id);
        if (!artifact) return sendProblem(res, 404, 'VISUALIZATION_NOT_FOUND', 'Visualization not found', 'No visualization exists with that identifier.');
        return sendJson(res, 200, artifact);
      }

      if (req.method === 'GET' && url.pathname === '/api/audit') {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        if (!requireAdmin(res, auth)) return;
        return sendJson(res, 200, { events: store.data.auditEvents.slice(-200).reverse() });
      }

      // ----- Parametric hair-transplant simulator -----
      // Always available, no external API. Returns a watermarked SVG.
      if (req.method === 'GET' && url.pathname === '/api/simulator/presets') {
        return sendJson(res, 200, {
          hairlines: Object.values(HAIRLINE_PRESETS).map(p => ({ id: p.id, label: p.label, description: p.description })),
          zones: Object.values(COVERAGE_ZONES).map(z => ({ id: z.id, label: z.label, grafts: z.grafts })),
          techniques: Object.values(TECHNIQUE_PRESETS).map(t => ({ id: t.id, label: t.label, note: t.note })),
          sessions: Object.values(SESSION_PRESETS).map(s => ({ id: s.id, label: s.label, note: s.note })),
          curls: Object.values(CURL_PRESETS).map(c => ({ id: c.id, label: c.label })),
          fullnesses: Object.values(FULLNESS_PRESETS).map(f => ({ id: f.id, label: f.label, note: f.note })),
          graftScenarios: Object.values(GRAFT_SCENARIOS).map(g => ({ id: g.id, label: g.label, range: g.range, session: g.session })),
          views: VIEW_CATALOG.map(v => ({ id: v.id, label: v.label, description: v.description }))
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/simulator/render') {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        if (!requireCsrf(req, res, auth)) return;
        const body = await readJson(req).catch(() => ({}));
        const safe = {
          hairline: HAIRLINE_PRESETS[body.hairline] ? body.hairline : 'balanced',
          zone: COVERAGE_ZONES[body.zone] ? body.zone : 'full',
          density: Math.max(0, Math.min(1, Number(body.density) || 0.55)),
          length: ['buzz','short','medium','long'].includes(body.length) ? body.length : 'short',
          color: ['black','darkBrown','mediumBrown','lightBrown','blonde','saltPepper'].includes(body.color) ? body.color : 'darkBrown',
          skinTone: ['light','medium','deep'].includes(body.skinTone) ? body.skinTone : 'medium'
        };
        const seed = Number.isInteger(body.seed) ? body.seed : undefined;
        const artifact = renderSimulation({ ...safe, seed });
        await audit(store, { action: 'simulator.rendered', actorUserId: auth.user.id, hairline: safe.hairline, zone: safe.zone, density: safe.density, length: safe.length, color: safe.color, correlationId: res.correlationId });
        return sendJson(res, 201, artifact);
      }

      if (req.method === 'POST' && url.pathname === '/api/simulator/variants') {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        if (!requireCsrf(req, res, auth)) return;
        const body = await readJson(req).catch(() => ({}));
        const safe = {
          zone: COVERAGE_ZONES[body.zone] ? body.zone : 'full',
          density: Math.max(0, Math.min(1, Number(body.density) || 0.55)),
          length: ['buzz','short','medium','long'].includes(body.length) ? body.length : 'short',
          color: ['black','darkBrown','mediumBrown','lightBrown','blonde','saltPepper'].includes(body.color) ? body.color : 'darkBrown',
          skinTone: ['light','medium','deep'].includes(body.skinTone) ? body.skinTone : 'medium',
          variants: ['conservative','balanced','restorative']
        };
        const artifacts = renderVariants(safe);
        await audit(store, { action: 'simulator.variants_rendered', actorUserId: auth.user.id, count: artifacts.length, correlationId: res.correlationId });
        return sendJson(res, 200, { variants: artifacts });
      }

      // ----- Photo-based simulator (takes the bundled demo patient photo) -----
      if (req.method === 'GET' && url.pathname === '/api/simulator/base-image') {
        try {
          const buf = await readFile(path.join(assetRoot, 'sample-patient.webp'));
          res.writeHead(200, { 'content-type': 'image/webp', 'cache-control': 'public, max-age=300' });
          return res.end(buf);
        } catch (error) {
          if (error.code === 'ENOENT') return sendProblem(res, 404, 'BASE_IMAGE_NOT_FOUND', 'Demo image missing', 'The bundled demo patient photo is not present in the build.');
          throw error;
        }
      }

      if (req.method === 'GET' && url.pathname === '/api/simulator/base-image-info') {
        return sendJson(res, 200, {
          id: 'sample-patient',
          width: DEMO_SCALP.width,
          height: DEMO_SCALP.height,
          description: 'Synthetic demo patient (Shutterstock-style balding male). No real patient data.',
          attribution: 'Bundled with the repository; not a real patient.',
          availableViews: getAvailableViews(),
          bundled: true
        });
      }

      // Returns the 6-view catalog and which views have a photo attached.
      if (req.method === 'GET' && url.pathname === '/api/simulator/case-photos') {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        const caseId = url.searchParams.get('caseId') || 'demo-001';
        return sendJson(res, 200, {
          caseId,
          views: getAvailableViews(),
          bundled: true
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/simulator/apply') {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        if (!requireCsrf(req, res, auth)) return;
        const body = await readJson(req).catch(() => ({}));
        const safe = {
          hairline: HAIRLINE_PRESETS[body.hairline] ? body.hairline : 'balanced',
          zone: COVERAGE_ZONES[body.zone] ? body.zone : 'full',
          density: Math.max(0, Math.min(1, Number(body.density) || 0.6)),
          length: ['buzz','short','medium','long'].includes(body.length) ? body.length : 'short',
          color: ['black','darkBrown','mediumBrown','lightBrown','blonde','saltPepper'].includes(body.color) ? body.color : 'darkBrown',
          curl: CURL_PRESETS[body.curl] ? body.curl : 'straight',
          fullness: FULLNESS_PRESETS[body.fullness] ? body.fullness : 'moderate',
          technique: TECHNIQUE_PRESETS[body.technique] ? body.technique : 'fue',
          sessions: SESSION_PRESETS[body.sessions] ? body.sessions : 'single',
          graftScenario: GRAFT_SCENARIOS[body.graftScenario] ? body.graftScenario : 'moderate',
          view: VIEW_CATALOG.some(v => v.id === body.view) ? body.view : 'front',
          caseId: typeof body.caseId === 'string' ? body.caseId : 'demo-001'
        };
        const seed = Number.isInteger(body.seed) ? body.seed : undefined;
        let photoBase64 = null;
        try {
          const buf = await readFile(path.join(assetRoot, 'sample-patient.webp'));
          photoBase64 = buf.toString('base64');
        } catch {}
        const artifact = renderPhotoSimulation({ ...safe, photoBase64, seed });
        await audit(store, { action: 'simulator.photo_applied', actorUserId: auth.user.id, hairline: safe.hairline, zone: safe.zone, density: safe.density, length: safe.length, color: safe.color, technique: safe.technique, sessions: safe.sessions, curl: safe.curl, fullness: safe.fullness, view: safe.view, caseId: safe.caseId, correlationId: res.correlationId });
        return sendJson(res, 201, artifact);
      }

      if (req.method === 'POST' && url.pathname === '/api/simulator/photo-variants') {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        if (!requireCsrf(req, res, auth)) return;
        const body = await readJson(req).catch(() => ({}));
        const safe = {
          zone: COVERAGE_ZONES[body.zone] ? body.zone : 'full',
          density: Math.max(0, Math.min(1, Number(body.density) || 0.6)),
          length: ['buzz','short','medium','long'].includes(body.length) ? body.length : 'short',
          color: ['black','darkBrown','mediumBrown','lightBrown','blonde','saltPepper'].includes(body.color) ? body.color : 'darkBrown',
          curl: CURL_PRESETS[body.curl] ? body.curl : 'straight',
          fullness: FULLNESS_PRESETS[body.fullness] ? body.fullness : 'moderate',
          technique: TECHNIQUE_PRESETS[body.technique] ? body.technique : 'fue',
          sessions: SESSION_PRESETS[body.sessions] ? body.sessions : 'single',
          view: VIEW_CATALOG.some(v => v.id === body.view) ? body.view : 'front',
          caseId: typeof body.caseId === 'string' ? body.caseId : 'demo-001'
        };
        let photoBase64 = null;
        try {
          const buf = await readFile(path.join(assetRoot, 'sample-patient.webp'));
          photoBase64 = buf.toString('base64');
        } catch {}
        const artifacts = renderPhotoVariants({ ...safe, photoBase64 });
        await audit(store, { action: 'simulator.photo_variants', actorUserId: auth.user.id, count: artifacts.length, view: safe.view, caseId: safe.caseId, correlationId: res.correlationId });
        return sendJson(res, 200, { variants: artifacts, baseImage: `/api/simulator/base-image`, view: safe.view, caseId: safe.caseId });
      }

      // Multi-view: render the same parameters on every available view.
      // For the bundled demo, only the FRONT view is available; for a real
      // case, the patient's intake photos would be added and all 6 would
      // render in parallel. The UI shows one view at a time; this endpoint
      // powers the "synchronized before/after across perspectives" feature.
      if (req.method === 'POST' && url.pathname === '/api/simulator/multi-view') {
        const auth = requireSession(req, res, ctx); if (!auth) return;
        if (!requireCsrf(req, res, auth)) return;
        const body = await readJson(req).catch(() => ({}));
        const safe = {
          hairline: HAIRLINE_PRESETS[body.hairline] ? body.hairline : 'balanced',
          zone: COVERAGE_ZONES[body.zone] ? body.zone : 'full',
          density: Math.max(0, Math.min(1, Number(body.density) || 0.6)),
          length: ['buzz','short','medium','long'].includes(body.length) ? body.length : 'short',
          color: ['black','darkBrown','mediumBrown','lightBrown','blonde','saltPepper'].includes(body.color) ? body.color : 'darkBrown',
          curl: CURL_PRESETS[body.curl] ? body.curl : 'straight',
          fullness: FULLNESS_PRESETS[body.fullness] ? body.fullness : 'moderate',
          technique: TECHNIQUE_PRESETS[body.technique] ? body.technique : 'fue',
          sessions: SESSION_PRESETS[body.sessions] ? body.sessions : 'single',
          caseId: typeof body.caseId === 'string' ? body.caseId : 'demo-001'
        };
        let photoBase64 = null;
        try {
          const buf = await readFile(path.join(assetRoot, 'sample-patient.webp'));
          photoBase64 = buf.toString('base64');
        } catch {}
        const available = getAvailableViews().filter(v => v.available);
        const renders = available.map(v => renderPhotoSimulation({ ...safe, photoBase64, view: v.id }));
        await audit(store, { action: 'simulator.multi_view', actorUserId: auth.user.id, count: renders.length, caseId: safe.caseId, correlationId: res.correlationId });
        return sendJson(res, 200, { renders, availableViews: available.map(v => v.id), baseImage: `/api/simulator/base-image`, caseId: safe.caseId });
      }

      if (url.pathname === '/') {
        res.writeHead(302, { location: '/clinic/' });
        return res.end();
      }
      if (url.pathname.startsWith('/clinic')) {
        if (await serveStatic(res, clinicRoot, url.pathname.replace(/^\/clinic\/?/, ''))) return;
      }
      if (url.pathname.startsWith('/patient')) {
        if (await serveStatic(res, patientRoot, url.pathname.replace(/^\/patient\/?/, ''))) return;
      }
      return sendProblem(res, 404, 'NOT_FOUND', 'Not found', 'The requested resource does not exist.');
    } catch (error) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error(`[${res.correlationId}]`, error?.stack || error);
      const code = error?.code || 'INTERNAL_ERROR';
      return sendProblem(res, status, code, status >= 500 ? 'Request failed' : 'Request rejected', status >= 500 ? 'The server could not complete the request.' : error.message);
    }
  };
}
