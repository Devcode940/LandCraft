/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI, Type } from '@google/genai';
import { normalizePlan } from './src/utils/normalizePlan';
import {
  installCrashHandlers,
  installGracefulShutdown,
  installOperations,
  uptimeSeconds,
} from './server/operations';

dotenv.config();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Model IDs are pinned in ONE place.
 *
 * History: this file previously hardcoded `gemini-1.5-pro` / `gemini-1.5-flash`,
 * which Google shut down on 2025-09-29 -- four of six AI features were dead.
 * It also used `gemini-3.5-flash`, deprecated 2026-10-08 (requests are silently
 * auto-routed to 3.6). Do not hardcode model strings at call sites; extend this
 * map and let `MODEL` env vars override for experimentation.
 */
export const MODELS = {
  /** Text-to-floor-plan generation. High volume, latency sensitive. */
  generation: process.env.MODEL_GENERATION || 'gemini-3.8-flash',
  /** Image-to-floor-plan (land photo). Needs multimodal input. */
  vision: process.env.MODEL_VISION || 'gemini-3.8-flash',
  /** Blueprint audit. Wants deeper reasoning. */
  audit: process.env.MODEL_AUDIT || 'gemini-3.1-pro-preview',
  /** Conversational architect assistant with tool calling. */
  chat: process.env.MODEL_CHAT || 'gemini-3.1-pro-preview',
  /** Cost optimization suggestions. Small output, cheap is fine. */
  cost: process.env.MODEL_COST || 'gemini-3.5-flash-lite',
} as const;

/** Hard ceiling on a single upstream model call. */
const REQUEST_TIMEOUT_MS = 120_000;

/** Max accepted image payload (bytes, decoded). ~10 MB. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// Security headers, compression, request ids and structured request logging.
// Mounted first so even a rejected request is logged and carries a CSP.
installOperations(app, IS_PRODUCTION);

// 10 MB is generous for a base64 image plus a prompt; the previous 50 MB let a
// single request balloon the process heap.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

/**
 * Rate limit every mutating /api route. Each HTTP request fans out to up to 3
 * upstream model calls, so an unthrottled endpoint burns quota 3x per hit (and
 * 9x when the client asks for 3 variants of a photo).
 */
const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.RATE_LIMIT_PER_MIN) || 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please wait a moment before generating again.',
  },
});

app.use('/api/', apiLimiter);

// Initialize the server-side Gemini client with proper User-Agent header for tracking
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
    timeout: REQUEST_TIMEOUT_MS,
  },
});

// ---------------------------------------------------------------------------
// Input coercion helpers
//
// Every one of these previously crashed with an unhandled TypeError on
// malformed input (e.g. "Cannot read properties of undefined (reading 'total')").
// ---------------------------------------------------------------------------

function clampNum(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  return Math.round(clampNum(v, fallback, min, max));
}

/** Trim and cap a free-text field. Also strips NULs which upset some APIs. */
function cleanText(v: unknown, maxLen: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\0/g, '').trim().slice(0, maxLen);
}

/** Accept a string or an array of {role, text} parts. */
function normalizeMessages(v: unknown): { role: 'user' | 'model'; text: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 50)
    .map((m) => {
      if (typeof m === 'string') return { role: 'user' as const, text: cleanText(m, 8000) };
      if (typeof m === 'object' && m !== null) {
        const rec = m as Record<string, unknown>;
        const rawRole = typeof rec.role === 'string' ? rec.role.toLowerCase() : '';
        const role = rawRole === 'model' || rawRole === 'assistant' ? 'model' : 'user';
        const content =
          typeof rec.content === 'string' ? rec.content : typeof rec.text === 'string' ? rec.text : '';
        return { role: role as 'user' | 'model', text: cleanText(content, 8000) };
      }
      return null;
    })
    .filter((m): m is { role: 'user' | 'model'; text: string } => m !== null && m.text.length > 0);
}

/** Validate + decode a data-URL or raw base64 image. Throws with a clear message. */
function parseImage(input: unknown, declaredMime: unknown): { data: string; mimeType: string } {
  if (typeof input !== 'string' || input.length === 0) {
    throw new ValidationError('No image data provided.');
  }

  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.*)$/s.exec(input);
  const data = match ? match[2] : input;
  const mimeType = match ? match[1] : typeof declaredMime === 'string' ? declaredMime : 'image/jpeg';

  if (!ALLOWED_IMAGE_MIME.has(mimeType.toLowerCase())) {
    throw new ValidationError(`Unsupported image type "${mimeType}". Use JPEG, PNG, or WebP.`);
  }
  if (!/^[A-Za-z0-9+/=\s]+$/.test(data)) {
    throw new ValidationError('Image data is not valid base64.');
  }

  // 4 base64 chars encode 3 bytes; padding adds at most 3.
  const decodedBytes = Math.floor((data.length * 3) / 4) - 2;
  if (decodedBytes > MAX_IMAGE_BYTES) {
    const mb = (decodedBytes / (1024 * 1024)).toFixed(1);
    throw new ValidationError(`Image is too large (${mb} MB). Please upload an image under 10 MB.`);
  }

  return { data, mimeType };
}

class ValidationError extends Error {}

// ---------------------------------------------------------------------------
// The system prompt for architectural design generation
// ---------------------------------------------------------------------------

const SYSTEM_INSTRUCTION = `
You are a licensed principal architect at LandCraft AI, specializing in converting user criteria into high-quality, code-compliant, and visually beautiful 2D floor plans.
Your output must be a fully coordinated architectural floor plan represented strictly in a structured JSON layout that is physically buildable.

CRITICAL MATHEMATICAL & GRID LAYOUT RULES:
1. SCALE: All coordinate math is based on 1 meter = 40 pixels.
   - A plot of 15m x 20m equals 600px x 800px.
   - A standard wall thickness is 12px for exterior/load-bearing walls and 8px for interior partitions.
2. CANVAS MARGIN: Start the layout boundaries at a comfortable offset (e.g., x = 80, y = 80) to avoid clipping.
3. CLOSED BOUNDARY ENVELOPE: All outer walls must form a perfect closed polygon (a rect or L-shape) that encapsulates the house.
   - For a rectangular layout of width W (e.g. 400px) and height H (e.g. 320px) starting at (80, 80):
     * Wall 1 (Top): (80, 80) to (480, 80) with thickness = 12
     * Wall 2 (Right): (480, 80) to (480, 400) with thickness = 12
     * Wall 3 (Bottom): (480, 400) to (80, 400) with thickness = 12
     * Wall 4 (Left): (80, 400) to (80, 80) with thickness = 12
4. ROOM PACKING: Every Room must be a rectangle defined by x, y, width, height.
   - Rooms must pack perfectly inside the outer wall boundary without gaps or overlaps.
   - Shared edges between rooms MUST be aligned. For example, if Room A is on the left (x: 80, y: 80, width: 200, height: 320) and Room B is on the right (x: 280, y: 80, width: 200, height: 320):
     * The interior partition wall MUST be placed precisely on the boundary line: from (280, 80) to (280, 400) with thickness = 8.
5. OPENINGS (DOORS & WINDOWS):
   - Every opening must sit EXACTLY on a wall segment.
   - Doors should be placed on interior walls (8px thickness) or exterior walls (12px thickness) for entry.
   - Windows must only be placed on exterior walls (12px thickness).
   - Set the rotation in degrees (0 for horizontal top wall, 90 for vertical right wall, 180 for horizontal bottom wall, 270 for vertical left wall).
   - Widths: standard door is 32px, front door is 36px, standard window is 40px, large window is 60px.
6. FURNITURE PLACEMENT:
   - x and y represent the CENTER of the furniture piece.
   - Furniture MUST fit completely within the bounding rectangle of its designated room. Do not intersect with any walls or float outside rooms!
   - Ensure clear path clearances (at least 24px) around beds, toilets, and doors.

ARCHITECTURAL PRINCIPLES BY STYLE:
- Modern: Large windows, open-concept living/kitchen space, minimal dividers, sleek zoning.
- Minimalist: Very clean, modular spaces, multipurpose furniture, generous negative circulation space.
- Scandinavian: Warm light accents, compact kitchenettes, separate cozy bedroom, efficient use of smaller areas.
- Traditional: Distinct hallway entrances, partitioned dining/kitchen areas, private separated bedrooms.
- Brutalist / Industrial: Heavy masonry feeling, linear layout segments, structured rectangular partitioning.

PLUMBING CO-LOCATION RULE:
- To minimize plumbing costs, the Kitchen and Bathrooms should share or sit near a common interior wet-wall.

COORDINATION DISCLAIMER:
- Keep the design strictly conceptual. Always respect the physical constraints of the requested plot dimensions.
`;

const FLOOR_PLAN_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: {
      type: Type.STRING,
      description:
        "Descriptive name of this floor plan layout option (e.g., 'Modern Open-Concept 3-Bed Family Bungalow')",
    },
    rationale: {
      type: Type.OBJECT,
      description:
        'Detailed professional design rationale explaining the zoning, traffic flow, and lighting choice.',
      properties: {
        architecturalConcept: {
          type: Type.STRING,
          description: 'Summary of the aesthetic and design style requested.',
        },
        zoningRationale: {
          type: Type.STRING,
          description:
            'Explanation of public vs private separation (e.g., bedrooms placed on private side, living/dining combined for spacious feel).',
        },
        circulationFlow: {
          type: Type.STRING,
          description: 'Explanation of entry points, door placements, and unobstructed corridor pathways.',
        },
        naturalLightAndVents: {
          type: Type.STRING,
          description:
            'Explanation of windows placements relative to passive solar gain and cross-ventilation.',
        },
      },
      required: ['architecturalConcept', 'zoningRationale', 'circulationFlow', 'naturalLightAndVents'],
    },
    dimensions: {
      type: Type.OBJECT,
      properties: {
        widthMeters: { type: Type.NUMBER, description: 'Requested plot width in meters' },
        lengthMeters: { type: Type.NUMBER, description: 'Requested plot length in meters' },
        totalBuildAreaM2: {
          type: Type.NUMBER,
          description: 'Calculated floor space area of indoor rooms in square meters',
        },
        scalePixelsPerMeter: { type: Type.NUMBER, description: 'Scale constant: 40' },
      },
      required: ['widthMeters', 'lengthMeters', 'totalBuildAreaM2', 'scalePixelsPerMeter'],
    },
    plan: {
      type: Type.OBJECT,
      properties: {
        walls: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: 'Unique string id' },
              x1: { type: Type.NUMBER, description: 'Start X in pixels (multiples of 10 or 20 preferred)' },
              y1: { type: Type.NUMBER, description: 'Start Y in pixels' },
              x2: { type: Type.NUMBER, description: 'End X in pixels' },
              y2: { type: Type.NUMBER, description: 'End Y in pixels' },
              thickness: {
                type: Type.NUMBER,
                description:
                  'Thickness in pixels: 12 for outer perimeter walls, 8 for internal room-divider walls',
              },
            },
            required: ['id', 'x1', 'y1', 'x2', 'y2', 'thickness'],
          },
        },
        rooms: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: 'Unique string id' },
              x: { type: Type.NUMBER, description: 'Top-left X coordinate in pixels' },
              y: { type: Type.NUMBER, description: 'Top-left Y coordinate in pixels' },
              width: { type: Type.NUMBER, description: 'Width in pixels' },
              height: { type: Type.NUMBER, description: 'Height in pixels' },
              label: {
                type: Type.STRING,
                description:
                  "Room label: e.g. 'Master Bedroom', 'Living Area', 'Kitchen & Dining', 'Bathroom', 'Kids Bedroom', 'Entryway'",
              },
              color: {
                type: Type.STRING,
                description:
                  "Translucent color string: 'rgba(59, 130, 246, 0.08)' for social, 'rgba(16, 185, 129, 0.08)' for personal, 'rgba(245, 158, 11, 0.08)' for bath, 'rgba(107, 114, 128, 0.08)' for entryway/service",
              },
            },
            required: ['id', 'x', 'y', 'width', 'height', 'label', 'color'],
          },
        },
        openings: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: 'Unique string id' },
              type: { type: Type.STRING, description: "Must be 'door' or 'window'" },
              subType: {
                type: Type.STRING,
                description:
                  "e.g., 'single', 'double', 'sliding' for doors, or 'standard', 'large', 'bay' for windows",
              },
              x: {
                type: Type.NUMBER,
                description: 'Anchor X in pixels sitting exactly on the associated wall segment line',
              },
              y: {
                type: Type.NUMBER,
                description: 'Anchor Y in pixels sitting exactly on the associated wall segment line',
              },
              width: {
                type: Type.NUMBER,
                description: 'Width in pixels (e.g. 32px for standard doorway, 50px for standard window)',
              },
              rotation: {
                type: Type.NUMBER,
                description: 'Rotation in degrees (0, 90, 180, or 270) matching the wall angle',
              },
              wallId: { type: Type.STRING, description: 'ID of the wall this opening attaches to' },
              wallOffset: {
                type: Type.NUMBER,
                description: 'Ratio along wall (e.g. 0.3 for 30% from start)',
              },
              flipSwing: { type: Type.BOOLEAN, description: 'Door swing flip (default false)' },
            },
            required: ['id', 'type', 'subType', 'x', 'y', 'width', 'rotation'],
          },
        },
        furniture: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: 'Unique string id' },
              subType: {
                type: Type.STRING,
                description:
                  "One of: 'sofa', 'bed', 'table', 'chair', 'plant', 'toilet', 'tub', 'counter', 'fridge', 'tv-stand', 'vanity'",
              },
              label: {
                type: Type.STRING,
                description:
                  "Readable label: e.g. 'King Bed', '3-Seater Sofa', 'Coffee Table', 'Dining Table', 'Toilet', 'Shower Tub', 'Sink Cabinet'",
              },
              x: { type: Type.NUMBER, description: 'CENTER X pixel coordinate inside its parent room' },
              y: { type: Type.NUMBER, description: 'CENTER Y pixel coordinate inside its parent room' },
              width: { type: Type.NUMBER, description: 'Width in pixels' },
              height: { type: Type.NUMBER, description: 'Height in pixels' },
              rotation: {
                type: Type.NUMBER,
                description: 'Rotation angle in degrees (e.g., 0, 90, 180, 270)',
              },
              category: {
                type: Type.STRING,
                description: "One of: 'living', 'bedroom', 'kitchen', 'bathroom', 'outdoor'",
              },
            },
            required: ['id', 'subType', 'label', 'x', 'y', 'width', 'height', 'rotation', 'category'],
          },
        },
      },
      required: ['walls', 'rooms', 'openings', 'furniture'],
    },
  },
  required: ['name', 'rationale', 'dimensions', 'plan'],
};

const AUDIT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    issues: {
      type: Type.ARRAY,
      description: 'List of architectural issues, violations, or suggestions.',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: {
            type: Type.STRING,
            description: "Severity level: 'error', 'warning', 'info', or 'success'",
          },
          category: {
            type: Type.STRING,
            description: "Category: 'safety', 'accessibility', 'flow', or 'structure'",
          },
          title: { type: Type.STRING, description: 'Short summary of the issue or insight' },
          message: { type: Type.STRING, description: 'Detailed explanation and suggestion' },
          elementId: {
            type: Type.STRING,
            description: 'ID of the specific floor plan element causing the issue, if applicable',
          },
        },
        required: ['id', 'type', 'category', 'title', 'message'],
      },
    },
    optimizedPlan: {
      type: Type.OBJECT,
      description: 'An optimized version of the input floor plan that resolves the identified issues.',
      properties: FLOOR_PLAN_RESPONSE_SCHEMA.properties.plan.properties,
      required: ['walls', 'rooms', 'openings', 'furniture'],
    },
  },
  required: ['issues', 'optimizedPlan'],
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Returns an error response when the key is absent, or null when configured. */
function missingKey(): { status: number; body: Record<string, unknown> } | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY') {
    return {
      status: 400,
      body: {
        error: 'Missing API Key',
        message:
          'Gemini API key is not configured. Please add your GEMINI_API_KEY in the Settings > Secrets panel.',
      },
    };
  }
  return null;
}

/** Shared shape of the numeric design brief sent by every generation form. */
function readBrief(body: Record<string, unknown>) {
  return {
    plotWidth: clampNum(body.plotWidth, 15, 2, 200),
    plotLength: clampNum(body.plotLength, 20, 2, 200),
    bedrooms: clampInt(body.bedrooms, 3, 0, 20),
    bathrooms: clampNum(body.bathrooms, 2, 0, 20),
    floors: clampInt(body.floors, 1, 1, 10),
    style: cleanText(body.style, 40) || 'Modern',
    prompt: cleanText(body.prompt, 4000),
    variantsCount: clampInt(body.variantsCount, 2, 1, 3),
  };
}

const VARIATION_DIRECTIONS = [
  'Option A: Highly functional layout maximizing living spaces and passive light flow.',
  'Option B: Creative layout featuring open-plan social zones and segmented private bedroom wings.',
  'Option C: Space-saving ultra-compact layout prioritizing extra storage or garden flow.',
];

const PHOTO_VARIATION_DIRECTIONS = [
  'Option A: Direct layout optimizing for the most prominent site features and sunlight.',
  'Option B: Alternative layout offering a different living zone orientation based on site constraints.',
  "Option C: Unique architectural approach integrating tightly with the site's natural boundaries.",
];

/**
 * Turn N parallel model calls into variant objects.
 *
 * `Promise.all` previously meant one flaky call rejected the whole batch and
 * the user lost every variant. `allSettled` keeps the successes.
 */
async function resolveVariants(
  calls: Promise<{ text?: string }>[],
  directions: string[],
  idPrefix: string,
  brief: ReturnType<typeof readBrief>,
) {
  const results = await Promise.allSettled(calls);

  return results.map((res, idx) => {
    const fallback = {
      id: `${idPrefix}-${idx}-${Date.now()}`,
      title: `Variant ${idx + 1} (Generation Failure)`,
      error: 'Generation Failed',
      message:
        res.status === 'rejected'
          ? 'This variant could not be generated. The other options are still available.'
          : 'The model returned an invalid format. Please try again with a refined prompt.',
      plan: { walls: [], rooms: [], openings: [], furniture: [] },
      rationale: {
        architecturalConcept: 'Generation failed.',
        zoningRationale: 'N/A',
        circulationFlow: 'N/A',
        naturalLightAndVents: 'N/A',
      },
      dimensions: {
        widthMeters: brief.plotWidth,
        lengthMeters: brief.plotLength,
        totalBuildAreaM2: 0,
        scalePixelsPerMeter: 40,
      },
      _direction: directions[idx] ?? directions[directions.length - 1],
    };

    if (res.status === 'rejected') {
      console.error(`Variant ${idx} rejected:`, res.reason);
      return fallback;
    }

    try {
      const parsed = JSON.parse((res.value.text || '{}').trim());
      return {
        id: `${idPrefix}-${idx}-${Date.now()}`,
        title: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : `Variant ${idx + 1}`,
        ...parsed,
        // normalizePlan guarantees all four arrays exist and every field is a
        // finite number -- the canvas renders these directly.
        plan: normalizePlan(parsed.plan),
      };
    } catch (err) {
      console.error(`Failed to parse variant ${idx} output:`, err);
      return fallback;
    }
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Lightweight readiness probe: is a key set, and which models are targeted? */
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    apiKeyConfigured: missingKey() === null,
    models: MODELS,
  });
});

/**
 * Readiness probe, distinct from liveness.
 *
 * Kubernetes needs two answers: "is this process alive?" (restart it if not)
 * and "should it receive traffic?" (take it out of rotation if not). A missing
 * API key means the process is healthy but the AI features would 400, so the
 * orchestrator should keep it out of rotation. Liveness stays unconditional so
 * a misconfigured deployment is not crash-looped.
 */
app.get('/api/ready', (_req, res) => {
  const configured = missingKey() === null;
  res.status(configured ? 200 : 503).json({
    ready: configured,
    uptimeSeconds: uptimeSeconds(),
    apiKeyConfigured: configured,
    // Build metadata for support triage. Never include secrets.
    version: process.env.npm_package_version || '0.1.0',
    commit: process.env.GIT_COMMIT || 'unknown',
    node: process.version,
    models: MODELS,
  });
});

// POST route to handle prompt engineering and generate floor plan variants
app.post('/api/generate-floor-plan', async (req, res) => {
  let brief: ReturnType<typeof readBrief>;
  try {
    const noKey = missingKey();
    if (noKey) return res.status(noKey.status).json(noKey.body);

    brief = readBrief((req.body ?? {}) as Record<string, unknown>);

    const userPromptText = `
Generate a beautiful architectural floor plan based on the following specifications:
- Plot Dimensions: ${brief.plotWidth}m width x ${brief.plotLength}m length (at 40px/meter scale, this is ${brief.plotWidth * 40}px width by ${brief.plotLength * 40}px height).
- Intended Bedrooms: ${brief.bedrooms}
- Intended Bathrooms: ${brief.bathrooms}
- Number of floors: ${brief.floors}
- Architectural Style: ${brief.style}
- User Natural Language Request: "${brief.prompt || 'Generate a highly optimized layout fitting the space.'}"

Create a highly detailed, aligned, and buildable plan with walls, labeled rooms, doors/windows, and appropriate furniture matching the style.
Ensure that all coordinates form closed boundaries and there are NO isolated or overlapping walls/rooms.
All coordinates MUST be integers and align to a 10px or 20px grid spacing where possible to make editing easy.
`;

    const calls = Array.from({ length: brief.variantsCount }, (_, i) =>
      ai.models.generateContent({
        model: MODELS.generation,
        contents: `${userPromptText}\n\nVariation Requirement for this variant: ${VARIATION_DIRECTIONS[i]}`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: FLOOR_PLAN_RESPONSE_SCHEMA,
          temperature: 0.7 + i * 0.1, // slightly vary the temperatures for diverse variants
        },
      }),
    );

    const variants = await resolveVariants(calls, VARIATION_DIRECTIONS, 'variant', brief);
    res.json({ success: true, variants });
  } catch (error) {
    console.error('Floor plan generation error:', error);
    res.status(500).json({
      success: false,
      error: 'AI Generation Error',
      message:
        'An unexpected error occurred during design generation. Please verify your prompt and try again.',
    });
  }
});

// POST route to analyze land photo and generate layout
app.post('/api/design-from-photo', async (req, res) => {
  try {
    const noKey = missingKey();
    if (noKey) return res.status(noKey.status).json(noKey.body);

    const body = (req.body ?? {}) as Record<string, unknown>;
    // Defaults match the photo tab's form (previously 20x30 here vs 15x20 in
    // the generator, with no reason for the difference).
    const brief = readBrief({ plotWidth: 15, plotLength: 20, ...body });
    const { data, mimeType } = parseImage(body.imageBase64, body.mimeType);

    const userPromptText = `
Analyze this land plot photo. Identify boundaries, potential natural light paths, terrain features, and optimal areas for construction.
Based on your analysis of this specific site, generate a beautiful architectural floor plan matching these specifications:
- Plot Dimensions: ${brief.plotWidth}m width x ${brief.plotLength}m length (at 40px/meter scale, this is ${brief.plotWidth * 40}px width by ${brief.plotLength * 40}px height).
- Intended Bedrooms: ${brief.bedrooms}
- Intended Bathrooms: ${brief.bathrooms}
- Number of floors: ${brief.floors}
- Architectural Style: ${brief.style}
- User Notes: "${brief.prompt || 'Optimize layout for the visible terrain and views.'}"

In your rationale, explicitly mention how you optimized the design based on the visual features in the provided photo (e.g., placing windows towards a nice view, or aligning the driveway to the street).
Create a highly detailed, aligned, and buildable plan with walls, labeled rooms, doors/windows, and appropriate furniture matching the style.
Ensure that all coordinates form closed boundaries and there are NO isolated or overlapping walls/rooms.
All coordinates MUST be integers and align to a 10px or 20px grid spacing.
`;

    const calls = Array.from({ length: brief.variantsCount }, (_, i) =>
      ai.models.generateContent({
        model: MODELS.vision,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data, mimeType } },
              {
                text: `${userPromptText}\n\nVariation Requirement for this variant: ${PHOTO_VARIATION_DIRECTIONS[i]}`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: FLOOR_PLAN_RESPONSE_SCHEMA,
          temperature: 0.7 + i * 0.1,
        },
      }),
    );

    const variants = await resolveVariants(calls, PHOTO_VARIATION_DIRECTIONS, 'variant-photo', brief);
    res.json({ success: true, variants });
  } catch (error) {
    // ValidationError carries a message that is safe and useful to show a user.
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: 'Invalid Image', message: error.message });
    }
    console.error('Photo design generation error:', error);
    res.status(500).json({
      success: false,
      error: 'AI Generation Error',
      message: 'Failed to process image and generate design.',
    });
  }
});

app.post('/api/analyze-blueprint', async (req, res) => {
  try {
    const noKey = missingKey();
    if (noKey) return res.status(noKey.status).json(noKey.body);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const plan = normalizePlan(body.plan);

    const analyzePrompt = `
      You are an expert architectural reviewer.
      Analyze the following floor plan JSON data for:
      1. Structural issues (e.g., floating walls, unclosed rooms, missing doors).
      2. Flow and circulation issues (e.g., blocked pathways, awkward door swings, inefficient zoning).
      3. Safety, Universal Design, and accessibility (e.g., tight clearances around beds/toilets/doors, wheelchair turning radiuses, grab bar placement suggestions).
      4. Lighting and ventilation (e.g., missing windows in living spaces).

      Floor Plan JSON:
      ${JSON.stringify(plan)}

      Provide a list of detailed issues and suggestions. Incorporate universal design and smart space optimization principles.
      For 'type', use 'error' for critical code/safety issues, 'warning' for flow/accessibility, 'info' for suggestions, and 'success' for well-designed elements.
      Also, provide an 'optimizedPlan' which is a complete, modified version of the floor plan that attempts to resolve these issues (e.g. moving furniture, adjusting walls to improve space utilization and flow). Ensure all mathematical constraints and coordinates are valid.
      Do not cite specific building-code section numbers; describe requirements in plain language.
    `;

    const result = await ai.models.generateContent({
      model: MODELS.audit,
      contents: analyzePrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: AUDIT_RESPONSE_SCHEMA,
        temperature: 0.2, // Lower temperature for analytical task
      },
    });

    const parsed = (() => {
      try {
        return JSON.parse(result.text || '{}');
      } catch {
        return {};
      }
    })();

    const issues = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 100) : [];

    res.json({
      success: true,
      issues,
      optimizedPlan: parsed.optimizedPlan ? normalizePlan(parsed.optimizedPlan) : null,
    });
  } catch (error) {
    console.error('Audit generation error:', error);
    res.status(500).json({
      success: false,
      error: 'AI Audit Error',
      message: 'Failed to analyze the blueprint.',
    });
  }
});

app.post('/api/optimize-costs', async (req, res) => {
  try {
    const noKey = missingKey();
    if (noKey) return res.status(noKey.status).json(noKey.body);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const qualityLevel = cleanText(body.qualityLevel, 40) || 'standard';
    const region = cleanText(body.region, 40) || 'global-average';

    const metrics = (body.metrics ?? {}) as Record<string, unknown>;
    const costs = (body.costs ?? {}) as Record<string, unknown>;

    const m = {
      areaM2: clampNum(metrics.areaM2, 0, 0, 1e6),
      wallLengthM: clampNum(metrics.wallLengthM, 0, 0, 1e6),
      doors: clampInt(metrics.doors, 0, 0, 10000),
      windows: clampInt(metrics.windows, 0, 0, 10000),
    };
    const c = {
      total: clampNum(costs.total, 0, 0, 1e12),
      subtotal: clampNum(costs.subtotal, 0, 0, 1e12),
    };

    const prompt = `
      You are an expert construction cost estimator and value engineer.
      Review the following project metrics and floor plan data to suggest cost optimizations.

      Project Parameters:
      - Quality Level: ${qualityLevel}
      - Region: ${region}
      - Total Cost Estimate: $${c.total.toFixed(0)}
      - Subtotal Cost: $${c.subtotal.toFixed(0)}

      Quantities:
      - Area: ${m.areaM2.toFixed(1)} m2
      - Walls: ${m.wallLengthM.toFixed(1)} linear meters
      - Doors: ${m.doors}
      - Windows: ${m.windows}

      Floor Plan Context:
      ${JSON.stringify(normalizePlan(body.plan))}

      Provide 3 to 4 actionable, high-value suggestions to optimize the construction costs or material selections for this specific design and quality level. Focus on spatial efficiency, material rationalization, and structural simplification. Return only a JSON array of strings.
    `;

    const result = await ai.models.generateContent({
      model: MODELS.cost,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        temperature: 0.4,
      },
    });

    let suggestions: unknown;
    try {
      suggestions = JSON.parse(result.text || '[]');
    } catch {
      suggestions = [];
    }

    res.json({
      success: true,
      suggestions: Array.isArray(suggestions)
        ? suggestions.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 10)
        : [],
    });
  } catch (error) {
    console.error('Cost optimization error:', error);
    res.status(500).json({
      success: false,
      error: 'AI Optimization Error',
      message: 'Failed to generate cost optimizations.',
    });
  }
});

app.post('/api/architect-chat', async (req, res) => {
  try {
    const noKey = missingKey();
    if (noKey) return res.status(noKey.status).json(noKey.body);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const messages = normalizeMessages(body.messages);
    if (messages.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid Request', message: 'No message content provided.' });
    }

    const plan = normalizePlan(body.plan);

    const systemPrompt = `
      You are an expert architect AI assistant for LandCraft AI.
      You answer user questions about architecture, space planning, building codes, and floor plan design.
      If the user asks you to generate, modify, or create a floor plan based on their requirements, use the \`generate_floor_plan\` function.

      Current Floor Plan Context (if any):
      ${JSON.stringify(plan)}

      Keep your answers concise, professional, and helpful. Use markdown for formatting.
      Do not invent building-code section numbers; describe requirements in plain language.
    `;

    const formattedMessages = messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    const result = await ai.models.generateContent({
      model: MODELS.chat,
      contents: formattedMessages,
      config: {
        systemInstruction: systemPrompt,
        tools: [
          {
            functionDeclarations: [
              {
                name: 'generate_floor_plan',
                description:
                  "Generates a new floor plan based on the user's request. Call this when the user explicitly asks to generate, create, or update the floor plan.",
                parameters: FLOOR_PLAN_RESPONSE_SCHEMA,
              },
            ],
          },
        ],
        temperature: 0.7,
      },
    });

    let generatedPlan: unknown = null;
    let responseText = result.text || '';

    const functionCalls = result.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      if (call.name === 'generate_floor_plan' && call.args) {
        const args = call.args as Record<string, unknown>;
        // Normalize so the client can load this straight onto the canvas.
        generatedPlan = { ...args, plan: normalizePlan(args.plan) };
        if (!responseText) {
          responseText = "I've generated a new floor plan based on your request. Check it out!";
        }
      }
    }

    res.json({ success: true, text: responseText, generatedPlan });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      success: false,
      error: 'AI Chat Error',
      message: 'Failed to process chat.',
    });
  }
});

// ---------------------------------------------------------------------------
// Error handling
//
// Without these two handlers Express replies with an HTML page for body-parser
// failures (413, malformed JSON), so `response.json()` on the client throws and
// the user sees a generic message instead of the real one.
// ---------------------------------------------------------------------------

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Express hands this an arbitrary thrown value, including non-Error objects.
  const detail = (err ?? {}) as { type?: string; status?: number };
  const isBodyTooLarge = detail.type === 'entity.too.large' || detail.status === 413;
  const isBadJson = detail.type === 'entity.parse.failed';

  if (isBodyTooLarge) {
    return res.status(413).json({
      success: false,
      error: 'Payload Too Large',
      message: 'That upload is too big. Please use an image under 10 MB.',
    });
  }
  if (isBadJson) {
    return res
      .status(400)
      .json({ success: false, error: 'Invalid JSON', message: 'Request body is not valid JSON.' });
  }

  console.error('Unhandled error:', err);
  res
    .status(500)
    .json({ success: false, error: 'Server Error', message: 'An unexpected server error occurred.' });
});

// ---------------------------------------------------------------------------
// Start server Vite middleware integration
// ---------------------------------------------------------------------------

async function startServer() {
  // Integrate Vite for asset bundling in development.
  //
  // Imported dynamically, not at module scope: `vite` is a devDependency, so a
  // top-level `import { createServer } from 'vite'` is a require() of a package
  // that does not exist in a production image -- the bundled server would
  // crash before it could serve a single request.
  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production.
    //
    // Vite fingerprints every file in dist/assets, so those are immutable and
    // can be cached for a year. index.html must not be cached at all, or a
    // deploy leaves clients pinned to a stale bundle referencing deleted
    // chunks.
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        immutable: true,
        maxAge: '1y',
      }),
    );
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    /* eslint-disable no-console -- startup banner: the one place console is right */
    console.log(`[LandCraft AI] Server booting up on port ${PORT}`);
    console.log(`[LandCraft AI] Models: ${JSON.stringify(MODELS)}`);
    console.log(`[LandCraft AI] Environment: ${IS_PRODUCTION ? 'production' : 'development'}`);
    if (missingKey()) {
      console.warn('[LandCraft AI] GEMINI_API_KEY is not set -- AI routes will return 400.');
    }
    /* eslint-enable no-console */
  });

  // Drain in-flight requests on SIGTERM/SIGINT instead of dropping connections
  // mid-response. Essential for rolling deploys.
  installGracefulShutdown(server, {
    timeoutMs: Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10_000,
    onDrained: () => {
      // Hook for closing database pools / flushing telemetry in future.
    },
  });

  // Without this, a port conflict throws an unhandled 'error' event and kills
  // the process with an opaque stack trace.
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[LandCraft AI] Port ${PORT} is already in use. Set PORT to a different value.`);
    } else {
      console.error('[LandCraft AI] Server error:', err);
    }
    process.exit(1);
  });
}

installCrashHandlers();
startServer();
