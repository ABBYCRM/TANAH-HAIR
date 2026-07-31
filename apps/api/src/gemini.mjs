import { decryptSecret, randomId } from './security.mjs';

export const GEMINI_MODELS = [
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-lite-image',
  'gemini-3-pro-image'
];

export function publicGeminiSettings(record) {
  return {
    provider: 'gemini',
    configured: Boolean(record?.encryptedApiKey),
    maskedKey: record?.apiKeyLast4 ? `••••••••••••${record.apiKeyLast4}` : null,
    enabled: Boolean(record?.enabled),
    model: record?.model || GEMINI_MODELS[0],
    sandboxAcknowledged: Boolean(record?.sandboxAcknowledged),
    updatedAt: record?.updatedAt || null,
    lastTestAt: record?.lastTestAt || null,
    lastTestStatus: record?.lastTestStatus || 'never'
  };
}

export async function testGeminiConnection({ record, masterKey, fetchImpl = fetch }) {
  if (!record?.encryptedApiKey) throw Object.assign(new Error('Gemini API key is not configured'), { status: 409, code: 'GEMINI_NOT_CONFIGURED' });
  const apiKey = decryptSecret(record.encryptedApiKey, masterKey);
  const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models', {
    headers: { 'x-goog-api-key': apiKey, 'accept': 'application/json' },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw Object.assign(new Error(`Gemini rejected the credentials (${response.status}): ${detail.slice(0, 240)}`), { status: 502, code: 'GEMINI_CONNECTION_FAILED' });
  }
  const payload = await response.json();
  const names = Array.isArray(payload.models) ? payload.models.map(model => String(model.name || '')) : [];
  return { ok: true, modelVisible: names.some(name => name.endsWith(record.model)) };
}

const prohibitedPatterns = [
  /guarantee(?:d)?\s+(?:result|growth|density|success)/i,
  /diagnos(?:e|is|tic)/i,
  /prescrib(?:e|ing|ed)/i,
  /expected\s+result/i,
  /patient\s+(?:name|cpf|email|phone)/i,
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/,
  /@[a-z0-9.-]+\.[a-z]{2,}/i
];

export function buildSafeVisualizationPrompt(input) {
  const style = String(input.style || '').trim().slice(0, 120);
  const coverage = String(input.coverage || '').trim().slice(0, 120);
  const hairline = String(input.hairline || '').trim().slice(0, 120);
  const notes = String(input.notes || '').trim().slice(0, 300);
  const combined = `${style} ${coverage} ${hairline} ${notes}`;
  if (!style || !coverage || !hairline) throw Object.assign(new Error('Style, coverage and hairline concept are required'), { status: 400, code: 'VISUALIZATION_FIELDS_REQUIRED' });
  if (prohibitedPatterns.some(pattern => pattern.test(combined))) {
    throw Object.assign(new Error('The request contains clinical claims, identifying data or prohibited instructions'), { status: 422, code: 'UNSAFE_VISUALIZATION_REQUEST' });
  }
  return [
    'Create a synthetic adult head-and-scalp educational concept image for a hair-restoration consultation interface.',
    'This is not a real patient and must not resemble a public figure or identifiable person.',
    `Hair style concept: ${style}.`,
    `Coverage concept: ${coverage}.`,
    `Hairline concept: ${hairline}.`,
    notes ? `Additional neutral design notes: ${notes}.` : '',
    'Use a neutral clinical studio background and realistic but non-glamorized lighting.',
    'Do not smooth skin, reshape the face, change age or ethnicity, hide scars, imply surgical success, or include medical claims.',
    'Leave clear lower margin space for a permanent Portuguese hypothetical-simulation watermark.'
  ].filter(Boolean).join(' ');
}

function outputImageFromPayload(payload) {
  if (payload?.output_image?.data) return { data: payload.output_image.data, mimeType: payload.output_image.mime_type || 'image/png' };
  for (const step of payload?.steps || []) {
    for (const block of step?.content || []) {
      if (block?.type === 'image' && block.data) return { data: block.data, mimeType: block.mime_type || 'image/png' };
    }
  }
  for (const candidate of payload?.candidates || []) {
    for (const part of candidate?.content?.parts || []) {
      if (part?.inlineData?.data) return { data: part.inlineData.data, mimeType: part.inlineData.mimeType || 'image/png' };
    }
  }
  return null;
}

export function watermarkedSvgDataUrl(image) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><image href="data:${image.mimeType};base64,${image.data}" width="1024" height="1024" preserveAspectRatio="xMidYMid slice"/><rect x="0" y="918" width="1024" height="106" fill="#0f172a" fill-opacity="0.90"/><text x="512" y="962" text-anchor="middle" font-family="Arial,sans-serif" font-size="27" font-weight="700" fill="white">SIMULAÇÃO HIPOTÉTICA</text><text x="512" y="997" text-anchor="middle" font-family="Arial,sans-serif" font-size="21" fill="#ccfbf1">NÃO É PREVISÃO DE RESULTADO</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export async function generateGeminiVisualization({ record, masterKey, input, fetchImpl = fetch }) {
  if (!record?.enabled) throw Object.assign(new Error('Gemini visualization is disabled by the tenant kill switch'), { status: 409, code: 'GEMINI_DISABLED' });
  if (!record?.sandboxAcknowledged) throw Object.assign(new Error('Sandbox-only acknowledgement is required'), { status: 409, code: 'SANDBOX_ACK_REQUIRED' });
  const prompt = buildSafeVisualizationPrompt(input);
  const apiKey = decryptSecret(record.encryptedApiKey, masterKey);
  const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify({
      model: record.model,
      input: prompt,
      response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '1:1', image_size: '1K' }
    }),
    signal: AbortSignal.timeout(90_000)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw Object.assign(new Error(`Gemini generation failed (${response.status}): ${detail.slice(0, 300)}`), { status: 502, code: 'GEMINI_GENERATION_FAILED' });
  }
  const payload = await response.json();
  const image = outputImageFromPayload(payload);
  if (!image) throw Object.assign(new Error('Gemini returned no image'), { status: 502, code: 'GEMINI_NO_IMAGE' });
  return {
    id: randomId(),
    model: record.model,
    prompt,
    outputDataUrl: watermarkedSvgDataUrl(image),
    createdAt: new Date().toISOString(),
    label: 'SIMULAÇÃO HIPOTÉTICA - NÃO É PREVISÃO DE RESULTADO'
  };
}
