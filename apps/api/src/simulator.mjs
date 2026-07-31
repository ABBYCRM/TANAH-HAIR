// TANAH-HAIR parametric hair-transplant simulator.
// Pure SVG generator — no external API, always works.
// Output: a watermarked composite SVG of a stylized avatar with
// procedurally rendered hair based on the clinician's parameters.

import { randomId } from './security.mjs';

// ---------- Mulberry32 deterministic PRNG ----------
// (so a given seed + params always yields the same hair pattern)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stringSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

// ---------- Preset catalog ----------

export const HAIRLINE_PRESETS = {
  conservative: {
    id: 'conservative',
    label: 'Mature conservative',
    description: 'Slightly receded temples, no widow\'s peak. Respects age.',
    frontEdge: { cx: 360, cy: 232, rx: 138, ry: 28, peak: -6 }
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced natural',
    description: 'Soft central curve with mild temple recession.',
    frontEdge: { cx: 360, cy: 246, rx: 152, ry: 30, peak: -14 }
  },
  restorative: {
    id: 'restorative',
    label: 'Restorative youthful',
    description: 'Lower, even hairline. Higher graft count; reserved for stable loss.',
    frontEdge: { cx: 360, cy: 262, rx: 168, ry: 32, peak: -20 }
  },
  feminine: {
    id: 'feminine',
    label: 'Feminine rounded',
    description: 'Rounded front with central peak, low temple recession.',
    frontEdge: { cx: 360, cy: 254, rx: 158, ry: 36, peak: -28 }
  }
};

export const COVERAGE_ZONES = {
  frontal: { id: 'frontal', label: 'Frontal band', grafts: 1800, ring: [1, 0, 0, 0] },
  midscalp: { id: 'midscalp', label: 'Frontal + midscalp', grafts: 2600, ring: [1, 1, 0, 0] },
  crown: { id: 'crown', label: 'Frontal + crown', grafts: 2800, ring: [1, 0, 0, 1] },
  full: { id: 'full', label: 'Full scalp', grafts: 3400, ring: [1, 1, 1, 1] },
  temples: { id: 'temples', label: 'Temples + frontal', grafts: 1500, ring: [1, 0.4, 0, 0] }
};

export const HAIR_COLORS = {
  black: { id: 'black', label: 'Black', stroke: '#1A1A1A', root: '#2A2A2A' },
  darkBrown: { id: 'darkBrown', label: 'Dark brown', stroke: '#3D2817', root: '#52361F' },
  mediumBrown: { id: 'mediumBrown', label: 'Medium brown', stroke: '#5C3A22', root: '#72492A' },
  lightBrown: { id: 'lightBrown', label: 'Light brown', stroke: '#8B5A2B', root: '#A06D38' },
  blonde: { id: 'blonde', label: 'Blonde', stroke: '#C8A055', root: '#D8B56A' },
  saltPepper: { id: 'saltPepper', label: 'Salt & pepper', stroke: '#666', root: '#888' }
};

export const HAIR_LENGTHS = {
  buzz: { id: 'buzz', label: 'Buzz (3 mm)', px: 6 },
  short: { id: 'short', label: 'Short (15 mm)', px: 18 },
  medium: { id: 'medium', label: 'Medium (40 mm)', px: 42 },
  long: { id: 'long', label: 'Long (80 mm)', px: 76 }
};

export const SKIN_TONES = {
  light: { id: 'light', base: '#E8C9A8', shade: '#C8A884', blush: '#E5A38A', lip: '#B97A5E' },
  medium: { id: 'medium', base: '#C99A75', shade: '#A87852', blush: '#C77E5A', lip: '#94553C' },
  deep: { id: 'deep', base: '#8A5A3B', shade: '#6B4028', blush: '#9C5A45', lip: '#6B3528' }
};

// ---------- Geometry ----------

// The head is a 720x720 canvas. Face is in the lower half. Scalp is in the
// upper half. All coordinates are in user space (no scaling needed).

const CANVAS = { w: 720, h: 720 };

// Head outline (front view, slightly elongated). Symmetric around x=360.
function headOutlinePath() {
  return "M 360 70 \
    C 460 70 540 130 555 220 \
    C 565 290 555 350 555 410 \
    C 555 470 540 530 510 575 \
    C 480 615 430 645 360 660 \
    C 290 645 240 615 210 575 \
    C 180 530 165 470 165 410 \
    C 165 350 155 290 165 220 \
    C 180 130 260 70 360 70 Z";
}

// Scalp area — everything above the hairline. Defined as a closed path that
// follows the head outline on the sides/top and the hairline shape at the bottom.
function scalpPath(preset, zone) {
  const fe = preset.frontEdge;
  // The hairline front edge is an ellipse-like curve at (cx,cy) with rx,ry, peak.
  // We trace: from left temple, along the upper head outline, to right temple,
  // then back along the hairline.
  return "M 175 245 \
    C 175 130 260 80 360 80 \
    C 460 80 545 130 545 245 \
    C 520 " + (fe.cy + 4) + " \
    Q " + (fe.cx) + " " + (fe.cy - fe.ry + fe.peak) + " " + (fe.cx - fe.rx) + " " + (fe.cy + 8) + " \
    Q " + (fe.cx) + " " + (fe.cy + 6) + " " + (fe.cx + fe.rx) + " " + (fe.cy + 8) + " \
    C 540 250 200 250 175 245 Z";
}

// ---------- Avatar (neutral, gender-neutral) ----------

function avatarSvg(skinTone) {
  const s = SKIN_TONES[skinTone] || SKIN_TONES.light;
  return `<!-- face base -->
  <path d="${headOutlinePath()}" fill="${s.base}" />
  <!-- subtle shading on sides -->
  <path d="M 200 230 C 190 320 195 420 220 510 C 230 480 215 380 220 280 Z" fill="${s.shade}" opacity="0.45" />
  <path d="M 520 230 C 530 320 525 420 500 510 C 490 480 505 380 500 280 Z" fill="${s.shade}" opacity="0.45" />
  <!-- cheek blush -->
  <ellipse cx="245" cy="430" rx="32" ry="18" fill="${s.blush}" opacity="0.18" />
  <ellipse cx="475" cy="430" rx="32" ry="18" fill="${s.blush}" opacity="0.18" />
  <!-- ears -->
  <path d="M 170 360 C 158 358 152 380 158 410 C 162 430 170 438 178 432 Z" fill="${s.base}" />
  <path d="M 165 385 C 161 395 163 408 168 418 C 168 408 167 396 168 388 Z" fill="${s.shade}" opacity="0.5" />
  <path d="M 550 360 C 562 358 568 380 562 410 C 558 430 550 438 542 432 Z" fill="${s.base}" />
  <path d="M 555 385 C 559 395 557 408 552 418 C 552 408 553 396 552 388 Z" fill="${s.shade}" opacity="0.5" />
  <!-- eyebrows (will be covered by hair if dense) -->
  <path d="M 268 348 Q 305 340 345 348" stroke="#3a2a20" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85" />
  <path d="M 375 348 Q 415 340 452 348" stroke="#3a2a20" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85" />
  <!-- eyes (closed-soft, neutral expression) -->
  <path d="M 275 395 Q 305 388 335 395" stroke="#2a1a14" stroke-width="2" fill="none" stroke-linecap="round" />
  <path d="M 385 395 Q 415 388 445 395" stroke="#2a1a14" stroke-width="2" fill="none" stroke-linecap="round" />
  <ellipse cx="305" cy="395" rx="3" ry="1.5" fill="#1a0e08" opacity="0.6" />
  <ellipse cx="415" cy="395" rx="3" ry="1.5" fill="#1a0e08" opacity="0.6" />
  <!-- nose -->
  <path d="M 350 410 C 348 440 345 465 355 480 C 360 488 370 488 375 480 C 385 465 380 440 378 410" fill="${s.shade}" opacity="0.35" />
  <path d="M 355 480 Q 360 484 365 480" stroke="${s.shade}" stroke-width="1.2" fill="none" />
  <!-- nostrils hint -->
  <ellipse cx="354" cy="478" rx="2" ry="1.5" fill="${s.shade}" opacity="0.55" />
  <ellipse cx="366" cy="478" rx="2" ry="1.5" fill="${s.shade}" opacity="0.55" />
  <!-- mouth (neutral, slight smile) -->
  <path d="M 325 535 Q 360 545 395 535" stroke="${s.lip}" stroke-width="2.2" fill="none" stroke-linecap="round" />
  <path d="M 330 535 Q 360 542 390 535" fill="${s.lip}" opacity="0.45" />
  <!-- jaw shadow -->
  <path d="M 245 540 C 260 595 310 645 360 660 C 410 645 460 595 475 540" stroke="${s.shade}" stroke-width="0" fill="${s.shade}" opacity="0.18" />
  <!-- neck -->
  <path d="M 310 650 L 310 720 L 410 720 L 410 650 C 380 670 340 670 310 650 Z" fill="${s.base}" />
  <path d="M 310 650 C 340 668 380 668 410 650" stroke="${s.shade}" stroke-width="1" fill="${s.shade}" opacity="0.25" />`;
}

// ---------- Hair renderer ----------

// Generate a single hair strand as an SVG path. Direction is from the root
// outward, with a slight S-curve for naturalness.
function hairPath(x, y, angleDeg, length, jitter) {
  const rad = (angleDeg - 90) * Math.PI / 180; // 0deg = down
  const tipX = x + Math.cos(rad) * length;
  const tipY = y + Math.sin(rad) * length;
  // Control points for a slight S-curve
  const midX = (x + tipX) / 2 + (jitter - 0.5) * 3;
  const midY = (y + tipY) / 2 + (jitter - 0.5) * 3;
  return `M ${x.toFixed(2)} ${y.toFixed(2)} Q ${midX.toFixed(2)} ${midY.toFixed(2)} ${tipX.toFixed(2)} ${tipY.toFixed(2)}`;
}

// Sample points within a region using a simple stratified grid with jitter.
// Returns a function that yields (x, y) for each hair root.
function* sampleScalpPoints(preset, zone, density, rng) {
  const fe = preset.frontEdge;
  // Scalp bounding box (front view).
  const minX = 178;
  const maxX = 542;
  const baseY = fe.cy + 6; // start just behind the hairline
  const maxY = 80;        // top of scalp

  // Density 0-1 → grid resolution (higher density = more points).
  // We compute total point count first.
  const targetCount = Math.floor(180 + density * 1820); // 180-2000
  // Compute grid size based on target count.
  const gridN = Math.max(6, Math.round(Math.sqrt(targetCount * 1.6)));
  const cellW = (maxX - minX) / gridN;
  const cellH = (baseY - maxY) / gridN;

  // Sample one point per cell with rejection sampling.
  for (let gy = 0; gy < gridN; gy++) {
    for (let gx = 0; gx < gridN; gx++) {
      const x = minX + (gx + rng()) * cellW;
      const y = maxY + (gy + rng()) * cellH;
      // Reject if in the temple recess.
      const fe2 = preset.frontEdge;
      const templeX = (x < 220 || x > 500) && y > fe2.cy - 30;
      if (templeX && rng() < 0.45) continue;
      // For coverage zones, reject based on Y position.
      if (zone === 'frontal' && y > 200) continue;
      if (zone === 'midscalp' && (y < 130 || y > 250)) continue;
      if (zone === 'crown' && y > 170) continue;
      if (zone === 'temples' && !(x < 240 || x > 480)) continue;
      yield [x, y];
    }
  }
}

// Render all hair strands for a given configuration.
function renderHair({ preset, zone, density, length, color, seed, rng }) {
  const len = HAIR_LENGTHS[length] || HAIR_LENGTHS.short;
  const col = HAIR_COLORS[color] || HAIR_COLORS.darkBrown;
  const strands = [];
  let count = 0;

  for (const [x, y] of sampleScalpPoints(preset, zone, density, rng)) {
    // Angle depends on position: at hairline, hair grows forward/down;
    // at crown, hair grows outward radially.
    const cx = 360, cy = 80;
    const dx = x - cx;
    const dy = y - cy;
    let angle;
    if (Math.abs(dx) > Math.abs(dy)) {
      // Side: hair grows outward
      angle = dx > 0 ? 30 : 150;
      // Add a small forward tilt
      angle += dx > 0 ? -10 : 10;
    } else {
      // Top: hair grows mostly down/forward
      angle = 95 + (rng() - 0.5) * 30;
    }
    // Hairline edge hairs lean forward more
    if (y > 220) angle = 110 + (rng() - 0.5) * 25;
    // Hair near temples leans outward
    if (x < 200) angle = 50 + (rng() - 0.5) * 20;
    if (x > 520) angle = 130 + (rng() - 0.5) * 20;
    // Add jitter
    angle += (rng() - 0.5) * 12;
    const thisLen = len.px * (0.85 + rng() * 0.35);
    const path = hairPath(x, y, angle, thisLen, rng());
    // Two-tone stroke: base + a darker root
    const opacity = 0.55 + rng() * 0.35;
    const strokeW = 0.6 + rng() * 0.5;
    strands.push(`<path d="${path}" stroke="${col.stroke}" stroke-width="${strokeW.toFixed(2)}" stroke-linecap="round" fill="none" opacity="${opacity.toFixed(2)}"/>`);
    count++;
    if (count > 2400) break; // safety cap
  }
  return strands.join('');
}

// ---------- Watermark ----------

function watermark(label) {
  return `<rect x="0" y="660" width="720" height="60" fill="#0F172A" fill-opacity="0.92" />
    <text x="360" y="687" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="700" fill="#fff" letter-spacing="1.2">SIMULAÇÃO HIPOTÉTICA</text>
    <text x="360" y="704" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="12" fill="#5EEAD4" letter-spacing="0.6">NÃO É PREVISÃO DE RESULTADO · TANAH-HAIR</text>`;
}

// ---------- Main render ----------

export function renderSimulation({
  hairline = 'balanced',
  zone = 'full',
  density = 0.55,
  length = 'short',
  color = 'darkBrown',
  skinTone = 'medium',
  seed,
  label
} = {}) {
  const preset = HAIRLINE_PRESETS[hairline] || HAIRLINE_PRESETS.balanced;
  const rng = mulberry32((seed !== undefined ? seed : stringSeed(`${hairline}-${zone}-${density}-${length}-${color}-${skinTone}`)) >>> 0);
  const id = randomId();
  const createdAt = new Date().toISOString();
  const grafts = COVERAGE_ZONES[zone]?.grafts || 2000;

  const hair = renderHair({
    preset, zone, density,
    length: HAIR_LENGTHS[length] ? length : 'short',
    color: HAIR_COLORS[color] ? color : 'darkBrown',
    seed, rng
  });

  const wm = label || 'SIMULAÇÃO HIPOTÉTICA - NÃO É PREVISÃO DE RESULTADO';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 720" width="720" height="720">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#F4F0E8"/>
      <stop offset="100%" stop-color="#D7CFBF"/>
    </radialGradient>
    <clipPath id="scalpClip">
      <path d="${scalpPath(preset, zone)}"/>
    </clipPath>
  </defs>
  <rect width="720" height="720" fill="url(#bg)"/>
  <!-- capture frame (matte black) -->
  <rect x="20" y="20" width="680" height="680" fill="none" stroke="#0A0A0C" stroke-width="3" rx="4"/>
  <!-- horizon line (capture alignment) -->
  <line x1="60" y1="380" x2="660" y2="380" stroke="#0D9488" stroke-width="0.5" stroke-dasharray="2 4" opacity="0.4"/>
  <!-- avatar -->
  ${avatarSvg(skinTone)}
  <!-- hair: rendered inside the scalp clip -->
  <g clip-path="url(#scalpClip)">
    ${hair}
  </g>
  <!-- hairline drawn explicitly on top of the avatar's forehead so the
       boundary is visible regardless of clip precision -->
  <path d="M ${preset.frontEdge.cx - preset.frontEdge.rx} ${preset.frontEdge.cy + 8} \
           Q ${preset.frontEdge.cx} ${preset.frontEdge.cy - preset.frontEdge.ry + preset.frontEdge.peak} \
             ${preset.frontEdge.cx + preset.frontEdge.rx} ${preset.frontEdge.cy + 8}" \
        fill="none" stroke="${(HAIR_COLORS[color] || HAIR_COLORS.darkBrown).stroke}" stroke-width="1" opacity="0.7"/>
  <!-- watermark -->
  ${watermark(wm)}
</svg>`;

  return {
    id,
    createdAt,
    svg,
    outputDataUrl: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
    width: 720,
    height: 720,
    hairline: preset.id,
    zone,
    density,
    length,
    color,
    skinTone,
    grafts,
    seed: seed !== undefined ? seed : stringSeed(`${hairline}-${zone}-${density}-${length}-${color}-${skinTone}`),
    label: wm
  };
}

/**
 * Render N alternative looks for the same base configuration. Used by the
 * front-end to show a variant gallery (conservative / balanced / restorative).
 */
export function renderVariants({
  hairline = 'balanced',
  zone = 'full',
  density = 0.55,
  length = 'short',
  color = 'darkBrown',
  skinTone = 'medium',
  variants = ['conservative', 'balanced', 'restorative']
} = {}) {
  return variants.map(v => renderSimulation({
    hairline: v, zone, density, length, color, skinTone
  }));
}

// ============================================================================
// PHOTO-BASED SIMULATOR
// ----------------------------------------------------------------------------
// Takes a real photograph and overlays procedural hair on the bald area. This
// is the "what-if" mode used by every commercial hair-transplant simulator —
// the photo provides the patient's actual head/face; the overlay provides the
// hypothetical restored hairline. The result is a single self-contained SVG.
//
// All coordinates are relative to the photo's pixel space; the front-end can
// scale by adjusting the rendered <svg> width/height.
// ============================================================================

/**
 * Scalp area in the bundled demo photo (Shutterstock-style balding male, top
 * of head visible). Coordinates are calibrated for a 347x280 image. The
 * "current" receded hairline traces an M shape with receded temples; the
 * simulated hairline is drawn forward of that boundary inside the bald area.
 */
const DEMO_SCALP = {
  width: 347,
  height: 280,
  // Outline of the entire scalp/hair-bearing region (above the receded
  // hairline, around the top of the head, and back to the right temple).
  outline: "M 88 132 \
    C 80 110 78 80 92 50 \
    C 110 22 145 12 173 12 \
    C 201 12 236 22 254 50 \
    C 268 80 266 110 258 132 \
    Q 245 124 230 120 \
    Q 215 116 200 120 \
    Q 188 124 173 124 \
    Q 158 124 146 120 \
    Q 131 116 116 120 \
    Q 101 124 88 132 Z",
  // The current receded hairline (existing bald boundary) in the demo photo.
  recededHairline: { leftTemple: [88, 132], center: [173, 105], rightTemple: [258, 132] }
};

/**
 * Adjusts the hairline forward of the receded edge by the preset amount.
 * Returns 3 points (left-temple, center, right-temple) for the new hairline.
 */
function shiftedHairline(preset, density) {
  // density also nudges the hairline slightly forward at higher density
  const forward = { conservative: -8, balanced: 4, restorative: 18, feminine: 6 }[preset.id] || 0;
  const adjust = forward + Math.round(density * 6);
  const d = DEMO_SCALP.recededHairline;
  return {
    leftTemple: [d.leftTemple[0], Math.max(40, d.leftTemple[1] - adjust)],
    center:     [d.center[0],     Math.max(30, d.center[1] - adjust)],
    rightTemple:[d.rightTemple[0],Math.max(40, d.rightTemple[1] - adjust)]
  };
}

/**
 * Generates the "simulated hair zone" path: the bald area minus the area in
 * front of the new hairline. Hair will be drawn only inside this region.
 */
function simulatedZonePath(preset, density) {
  const h = shiftedHairline(preset, density);
  const [lx, ly] = h.leftTemple;
  const [cx, cy] = h.center;
  const [rx, ry] = h.rightTemple;
  // Close the zone by following the existing scalp outline on the sides/top
  // and the new hairline across the bottom.
  return "M " + lx + " " + ly + " \
    C 80 110 78 80 92 50 \
    C 110 22 145 12 173 12 \
    C 201 12 236 22 254 50 \
    C 268 80 266 110 258 132 \
    L " + rx + " " + ry + " \
    Q " + cx + " " + (cy - 6) + " " + lx + " " + ly + " Z";
}

/**
 * Draws hair strands in the simulated zone. Same procedural approach as the
 * avatar version but calibrated for a 347x280 coordinate system.
 */
function renderPhotoHair(preset, zone, density, length, color, rng) {
  const len = HAIR_LENGTHS[length] || HAIR_LENGTHS.short;
  const col = HAIR_COLORS[color] || HAIR_COLORS.darkBrown;
  const strands = [];
  const h = shiftedHairline(preset, density);
  const minX = 92, maxX = 254;
  const baseY = h.center[1] - 4;     // just behind the new hairline
  const maxY = 14;                    // top of scalp
  const targetCount = Math.floor(80 + density * 820); // 80–900 strands
  const gridN = Math.max(6, Math.round(Math.sqrt(targetCount * 1.8)));
  const cellW = (maxX - minX) / gridN;
  const cellH = (baseY - maxY) / gridN;
  let count = 0;

  for (let gy = 0; gy < gridN; gy++) {
    for (let gx = 0; gx < gridN; gx++) {
      const x = minX + (gx + rng()) * cellW;
      const y = maxY + (gy + rng()) * cellH;
      // Skip points in front of the new hairline
      if (y > h.center[1] - 4) continue;
      // Reject points outside the rounded scalp silhouette
      const nx = (x - 173) / 82;
      const ny = (y - 75) / 65;
      if (nx * nx + ny * ny > 1.05) continue;
      // Direction: front of hairline = down/forward, top = down, sides = outward
      let angle;
      const distFromCenter = Math.abs(x - 173);
      if (y > h.center[1] - 20) {
        // Front edge: hair grows down
        angle = 95 + (rng() - 0.5) * 30;
      } else if (distFromCenter > 55) {
        // Sides: outward
        angle = x < 173 ? 55 + (rng() - 0.5) * 25 : 125 + (rng() - 0.5) * 25;
      } else {
        // Top: down/forward
        angle = 90 + (rng() - 0.5) * 30;
      }
      angle += (rng() - 0.5) * 8;
      // Scale hair length for the 347-wide photo canvas (avatar was 720-wide).
      // Short hair on a 720 canvas = 18px; on a 347 canvas that's ~30px to be
      // visible. We use a 0.65x scale relative to the avatar (slightly larger
      // because individual hairs need to read at this resolution).
      const thisLen = len.px * (0.55 + rng() * 0.4) * (347 / 720);
      // Convert angle to dx/dy in image space
      const rad = (angle - 90) * Math.PI / 180;
      const tipX = x + Math.cos(rad) * thisLen;
      const tipY = y + Math.sin(rad) * thisLen;
      // Slight curve
      const midX = (x + tipX) / 2 + (rng() - 0.5) * 1.5;
      const midY = (y + tipY) / 2 + (rng() - 0.5) * 1.5;
      const path = `M ${x.toFixed(2)} ${y.toFixed(2)} Q ${midX.toFixed(2)} ${midY.toFixed(2)} ${tipX.toFixed(2)} ${tipY.toFixed(2)}`;
      // Slightly more opaque and thicker so the strokes read at this scale.
      const opacity = 0.7 + rng() * 0.25;
      const strokeW = 0.5 + rng() * 0.4;
      strands.push(`<path d="${path}" stroke="${col.stroke}" stroke-width="${strokeW.toFixed(2)}" stroke-linecap="round" fill="none" opacity="${opacity.toFixed(2)}"/>`);
      count++;
      if (count > 1800) break;
    }
  }
  return strands.join('');
}

/**
 * Renders a hair-transplant simulation on top of a real photo.
 * Returns an SVG that includes the photo as a base64 <image> plus the hair
 * overlay plus the watermark.
 */
export function renderPhotoSimulation({
  photoBase64,
  photoMime = 'image/webp',
  photoWidth = 347,
  photoHeight = 280,
  hairline = 'balanced',
  zone = 'full',
  density = 0.55,
  length = 'short',
  color = 'darkBrown',
  seed,
  label
} = {}) {
  const preset = HAIRLINE_PRESETS[hairline] || HAIRLINE_PRESETS.balanced;
  const rng = mulberry32((seed !== undefined ? seed : stringSeed(`${hairline}-${zone}-${density}-${length}-${color}`)) >>> 0);
  const id = randomId();
  const createdAt = new Date().toISOString();
  const grafts = COVERAGE_ZONES[zone]?.grafts || 2000;
  const h = shiftedHairline(preset, density);
  const hair = renderPhotoHair(preset, zone, density, length, color, rng);
  const zonePath = simulatedZonePath(preset, density);
  const wm = label || 'SIMULAÇÃO HIPOTÉTICA - NÃO É PREVISÃO DE RESULTADO';
  const col = HAIR_COLORS[color] || HAIR_COLORS.darkBrown;

  // Build the new hairline as a small Q-curve for visual reference
  const hairlinePath = `M ${h.leftTemple[0]} ${h.leftTemple[1]} Q ${h.center[0]} ${h.center[1] - 8} ${h.rightTemple[0]} ${h.rightTemple[1]}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${photoWidth} ${photoHeight}" width="${photoWidth}" height="${photoHeight}">
  <defs>
    <clipPath id="zoneClip">
      <path d="${zonePath}"/>
    </clipPath>
  </defs>
  <!-- original photo -->
  ${photoBase64 ? `<image href="data:${photoMime};base64,${photoBase64}" x="0" y="0" width="${photoWidth}" height="${photoHeight}" preserveAspectRatio="xMidYMid slice"/>` : ''}
  <!-- subtle darken on the bald area so the hair reads on top of the skin tone -->
  <path d="${zonePath}" fill="#000" opacity="0.04" clip-path="url(#zoneClip)"/>
  <!-- hair overlay -->
  <g clip-path="url(#zoneClip)">
    ${hair}
  </g>
  <!-- hairline trace -->
  <path d="${hairlinePath}" fill="none" stroke="${col.stroke}" stroke-width="0.6" opacity="0.55"/>
  <!-- watermark -->
  <rect x="0" y="${photoHeight - 26}" width="${photoWidth}" height="26" fill="#0F172A" fill-opacity="0.92"/>
  <text x="${photoWidth / 2}" y="${photoHeight - 14}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="700" fill="#fff" letter-spacing="0.6">SIMULAÇÃO HIPOTÉTICA</text>
  <text x="${photoWidth / 2}" y="${photoHeight - 4}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="6.5" fill="#5EEAD4" letter-spacing="0.4">NÃO É PREVISÃO DE RESULTADO · TANAH-HAIR</text>
</svg>`;

  return {
    id,
    createdAt,
    svg,
    outputDataUrl: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
    width: photoWidth,
    height: photoHeight,
    hairline: preset.id,
    zone,
    density,
    length,
    color,
    grafts,
    seed: seed !== undefined ? seed : stringSeed(`${hairline}-${zone}-${density}-${length}-${color}`),
    label: wm
  };
}

export function renderPhotoVariants(opts = {}) {
  return ['conservative', 'balanced', 'restorative'].map(h => renderPhotoSimulation({ ...opts, hairline: h }));
}

export { DEMO_SCALP };
