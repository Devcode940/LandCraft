/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize the server-side Gemini client with proper User-Agent header for tracking
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// The system prompt for architectural design generation
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
      description: "Descriptive name of this floor plan layout option (e.g., 'Modern Open-Concept 3-Bed Family Bungalow')"
    },
    rationale: {
      type: Type.OBJECT,
      description: "Detailed professional design rationale explaining the zoning, traffic flow, and lighting choice.",
      properties: {
        architecturalConcept: {
          type: Type.STRING,
          description: "Summary of the aesthetic and design style requested."
        },
        zoningRationale: {
          type: Type.STRING,
          description: "Explanation of public vs private separation (e.g., bedrooms placed on private side, living/dining combined for spacious feel)."
        },
        circulationFlow: {
          type: Type.STRING,
          description: "Explanation of entry points, door placements, and unobstructed corridor pathways."
        },
        naturalLightAndVents: {
          type: Type.STRING,
          description: "Explanation of windows placements relative to passive solar gain and cross-ventilation."
        }
      },
      required: ["architecturalConcept", "zoningRationale", "circulationFlow", "naturalLightAndVents"]
    },
    dimensions: {
      type: Type.OBJECT,
      properties: {
        widthMeters: { type: Type.NUMBER, description: "Requested plot width in meters" },
        lengthMeters: { type: Type.NUMBER, description: "Requested plot length in meters" },
        totalBuildAreaM2: { type: Type.NUMBER, description: "Calculated floor space area of indoor rooms in square meters" },
        scalePixelsPerMeter: { type: Type.NUMBER, description: "Scale constant: 40" }
      },
      required: ["widthMeters", "lengthMeters", "totalBuildAreaM2", "scalePixelsPerMeter"]
    },
    plan: {
      type: Type.OBJECT,
      properties: {
        walls: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: "Unique string id" },
              x1: { type: Type.NUMBER, description: "Start X in pixels (multiples of 10 or 20 preferred)" },
              y1: { type: Type.NUMBER, description: "Start Y in pixels" },
              x2: { type: Type.NUMBER, description: "End X in pixels" },
              y2: { type: Type.NUMBER, description: "End Y in pixels" },
              thickness: { type: Type.NUMBER, description: "Thickness in pixels: 12 for outer perimeter walls, 8 for internal room-divider walls" }
            },
            required: ["id", "x1", "y1", "x2", "y2", "thickness"]
          }
        },
        rooms: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: "Unique string id" },
              x: { type: Type.NUMBER, description: "Top-left X coordinate in pixels" },
              y: { type: Type.NUMBER, description: "Top-left Y coordinate in pixels" },
              width: { type: Type.NUMBER, description: "Width in pixels" },
              height: { type: Type.NUMBER, description: "Height in pixels" },
              label: { type: Type.STRING, description: "Room label: e.g. 'Master Bedroom', 'Living Area', 'Kitchen & Dining', 'Bathroom', 'Kids Bedroom', 'Entryway'" },
              color: { type: Type.STRING, description: "Translucent color string: 'rgba(59, 130, 246, 0.08)' for social, 'rgba(16, 185, 129, 0.08)' for personal, 'rgba(245, 158, 11, 0.08)' for bath, 'rgba(107, 114, 128, 0.08)' for entryway/service" }
            },
            required: ["id", "x", "y", "width", "height", "label", "color"]
          }
        },
        openings: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: "Unique string id" },
              type: { type: Type.STRING, description: "Must be 'door' or 'window'" },
              subType: { type: Type.STRING, description: "e.g., 'single', 'double', 'sliding' for doors, or 'standard', 'large', 'bay' for windows" },
              x: { type: Type.NUMBER, description: "Anchor X in pixels sitting exactly on the associated wall segment line" },
              y: { type: Type.NUMBER, description: "Anchor Y in pixels sitting exactly on the associated wall segment line" },
              width: { type: Type.NUMBER, description: "Width in pixels (e.g. 32px for standard doorway, 50px for standard window)" },
              rotation: { type: Type.NUMBER, description: "Rotation in degrees (0, 90, 180, or 270) matching the wall angle" },
              wallId: { type: Type.STRING, description: "ID of the wall this opening attaches to" },
              wallOffset: { type: Type.NUMBER, description: "Ratio along wall (e.g. 0.3 for 30% from start)" },
              flipSwing: { type: Type.BOOLEAN, description: "Door swing flip (default false)" }
            },
            required: ["id", "type", "subType", "x", "y", "width", "rotation"]
          }
        },
        furniture: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: "Unique string id" },
              subType: { type: Type.STRING, description: "One of: 'sofa', 'bed', 'table', 'chair', 'plant', 'toilet', 'tub', 'counter', 'fridge', 'tv-stand', 'vanity'" },
              label: { type: Type.STRING, description: "Readable label: e.g. 'King Bed', '3-Seater Sofa', 'Coffee Table', 'Dining Table', 'Toilet', 'Shower Tub', 'Sink Cabinet'" },
              x: { type: Type.NUMBER, description: "CENTER X pixel coordinate inside its parent room" },
              y: { type: Type.NUMBER, description: "CENTER Y pixel coordinate inside its parent room" },
              width: { type: Type.NUMBER, description: "Width in pixels" },
              height: { type: Type.NUMBER, description: "Height in pixels" },
              rotation: { type: Type.NUMBER, description: "Rotation angle in degrees (e.g., 0, 90, 180, 270)" },
              category: { type: Type.STRING, description: "One of: 'living', 'bedroom', 'kitchen', 'bathroom', 'outdoor'" }
            },
            required: ["id", "subType", "label", "x", "y", "width", "height", "rotation", "category"]
          }
        }
      },
      required: ["walls", "rooms", "openings", "furniture"]
    }
  },
  required: ["name", "rationale", "dimensions", "plan"]
};

const AUDIT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    issues: {
      type: Type.ARRAY,
      description: "List of architectural issues, violations, or suggestions.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: { type: Type.STRING, description: "Severity level: 'error', 'warning', 'info', or 'success'" },
          category: { type: Type.STRING, description: "Category: 'safety', 'accessibility', 'flow', or 'structure'" },
          title: { type: Type.STRING, description: "Short summary of the issue or insight" },
          message: { type: Type.STRING, description: "Detailed explanation and suggestion" },
          elementId: { type: Type.STRING, description: "ID of the specific floor plan element causing the issue, if applicable" }
        },
        required: ["id", "type", "category", "title", "message"]
      }
    },
    optimizedPlan: {
      type: Type.OBJECT,
      description: "An optimized version of the input floor plan that resolves the identified issues.",
      properties: FLOOR_PLAN_RESPONSE_SCHEMA.properties.plan.properties,
      required: ["walls", "rooms", "openings", "furniture"]
    }
  },
  required: ["issues", "optimizedPlan"]
};

// POST route to handle prompt engineering and generate floor plan variants
app.post("/api/generate-floor-plan", async (req, res) => {
  try {
    const { 
      prompt, 
      plotWidth = 15, 
      plotLength = 20, 
      bedrooms = 3, 
      bathrooms = 2, 
      floors = 1, 
      style = "Modern",
      variantsCount = 2 
    } = req.body;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
      return res.status(400).json({ 
        error: "Missing API Key", 
        message: "Gemini API key is not configured. Please add your GEMINI_API_KEY in the Settings > Secrets panel." 
      });
    }

    // Structure a highly targeted prompt using form parameters & natural language instructions
    const userPromptText = `
Generate a beautiful architectural floor plan based on the following specifications:
- Plot Dimensions: ${plotWidth}m width x ${plotLength}m length (at 40px/meter scale, this is ${plotWidth * 40}px width by ${plotLength * 40}px height).
- Intended Bedrooms: ${bedrooms}
- Intended Bathrooms: ${bathrooms}
- Number of floors: ${floors}
- Architectural Style: ${style}
- User Natural Language Request: "${prompt || 'Generate a highly optimized layout fitting the space.'}"

Create a highly detailed, aligned, and buildable plan with walls, labeled rooms, doors/windows, and appropriate furniture matching the style.
Ensure that all coordinates form closed boundaries and there are NO isolated or overlapping walls/rooms.
All coordinates MUST be integers and align to a 10px or 20px grid spacing where possible to make editing easy.
`;

    const variantPrompts = [];
    const count = Math.min(Math.max(Number(variantsCount), 1), 3); // clamp to 1-3 variants

    for (let i = 0; i < count; i++) {
      let variationDirection = "Option A: Highly functional layout maximizing living spaces and passive light flow.";
      if (i === 1) {
        variationDirection = "Option B: Creative layout featuring open-plan social zones and segmented private bedroom wings.";
      } else if (i === 2) {
        variationDirection = "Option C: Space-saving ultra-compact layout prioritizing extra storage or garden flow.";
      }

      variantPrompts.push(
        ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: `${userPromptText}\n\nVariation Requirement for this variant: ${variationDirection}`,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: FLOOR_PLAN_RESPONSE_SCHEMA,
            temperature: 0.7 + (i * 0.1) // slightly vary the temperatures for diverse variants
          }
        })
      );
    }

    // Resolve variants in parallel for maximum performance
    const results = await Promise.all(variantPrompts);
    const variants = results.map((resObj, idx) => {
      try {
        const textStr = resObj.text || "{}";
        const parsedData = JSON.parse(textStr.trim());
        return {
          id: `variant-${idx}-${Date.now()}`,
          title: parsedData.name || `Variant ${idx + 1}`,
          ...parsedData
        };
      } catch (err: any) {
        console.error(`Failed to parse variant ${idx} output:`, err);
        return {
          id: `variant-${idx}-${Date.now()}`,
          title: `Variant ${idx + 1} (Generation Failure)`,
          error: "JSON Parsing Error",
          message: "The model generated an invalid format. Please try again with a refined prompt.",
          plan: { walls: [], rooms: [], openings: [], furniture: [] },
          rationale: {
            architecturalConcept: "Generation failed due to formatting issues.",
            zoningRationale: "Failed to coordinate rooms.",
            circulationFlow: "Failed to coordinate hallways.",
            naturalLightAndVents: "No window placements."
          },
          dimensions: {
            widthMeters: plotWidth,
            lengthMeters: plotLength,
            totalBuildAreaM2: 0,
            scalePixelsPerMeter: 40
          }
        };
      }
    });

    res.json({ success: true, variants });
  } catch (error: any) {
    console.error("Floor plan generation error:", error);
    res.status(500).json({ 
      success: false, 
      error: "AI Generation Error", 
      message: error?.message || "An unexpected error occurred during design generation. Please verify your prompt and try again." 
    });
  }
});

// POST route to analyze land photo and generate layout
app.post("/api/analyze-land-photo", async (req, res) => {
  try {
    const { 
      imageBase64,
      mimeType,
      prompt, 
      plotWidth = 15, 
      plotLength = 20, 
      bedrooms = 3, 
      bathrooms = 2, 
      floors = 1, 
      style = "Modern",
      variantsCount = 2 
    } = req.body;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
      return res.status(400).json({ 
        error: "Missing API Key", 
        message: "Gemini API key is not configured. Please add your GEMINI_API_KEY in the Settings > Secrets panel." 
      });
    }
    
    if (!imageBase64) {
      return res.status(400).json({
        error: "Missing Image",
        message: "No image data provided for analysis."
      });
    }

    // Determine the base64 string safely whether it has data URL prefix or not
    const base64Data = imageBase64.includes('base64,') 
      ? imageBase64.split('base64,')[1] 
      : imageBase64;

    const userPromptText = `
Analyze the provided land/plot photo and generate an optimal architectural floor plan.
Consider terrain hints, boundaries, vegetation, and likely sun direction if inferable.
- Plot Dimensions: ${plotWidth}m width x ${plotLength}m length (at 40px/meter scale, this is ${plotWidth * 40}px width by ${plotLength * 40}px height).
- Intended Bedrooms: ${bedrooms}
- Intended Bathrooms: ${bathrooms}
- Number of floors: ${floors}
- Architectural Style: ${style}
- User Specific Requests: "${prompt || 'Optimize layout for the specific plot terrain and boundaries.'}"

Ensure the generated layout is strictly coordinated inside the boundaries and addresses any contextual constraints visible in the image.
`;

    const variantPrompts = [];
    const count = Math.min(Math.max(Number(variantsCount), 1), 3); // clamp to 1-3 variants

    for (let i = 0; i < count; i++) {
      let variationDirection = "Option A: Direct layout optimizing for the most prominent site features and sunlight.";
      if (i === 1) {
        variationDirection = "Option B: Alternative layout offering a different living zone orientation based on site constraints.";
      } else if (i === 2) {
        variationDirection = "Option C: Unique architectural approach integrating tightly with the site's natural boundaries.";
      }

      variantPrompts.push(
        ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: base64Data,
                    mimeType: mimeType || "image/jpeg"
                  }
                },
                { text: `${userPromptText}\n\nVariation Requirement for this variant: ${variationDirection}` }
              ]
            }
          ],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: FLOOR_PLAN_RESPONSE_SCHEMA,
            temperature: 0.7 + (i * 0.1) // slightly vary the temperatures
          }
        })
      );
    }

    const results = await Promise.all(variantPrompts);
    const variants = results.map((resObj, idx) => {
      try {
        const textStr = resObj.text || "{}";
        const parsedData = JSON.parse(textStr.trim());
        return {
          id: `variant-photo-${idx}-${Date.now()}`,
          title: parsedData.name || `Variant ${idx + 1}`,
          ...parsedData
        };
      } catch (err: any) {
        console.error(`Failed to parse photo variant ${idx} output:`, err);
        return {
          id: `variant-photo-${idx}-${Date.now()}`,
          title: `Variant ${idx + 1} (Generation Failure)`,
          error: "JSON Parsing Error",
          message: "The model generated an invalid format.",
          plan: { walls: [], rooms: [], openings: [], furniture: [] },
          rationale: {
            architecturalConcept: "Generation failed.",
            zoningRationale: "N/A",
            circulationFlow: "N/A",
            naturalLightAndVents: "N/A"
          },
          dimensions: {
            widthMeters: plotWidth,
            lengthMeters: plotLength,
            totalBuildAreaM2: 0,
            scalePixelsPerMeter: 40
          }
        };
      }
    });

    res.json({ success: true, variants });
  } catch (error: any) {
    console.error("Photo analysis generation error:", error);
    res.status(500).json({ 
      success: false, 
      error: "AI Generation Error", 
      message: error?.message || "An unexpected error occurred during photo analysis." 
    });
  }
});

// POST route to handle multimodal generation from a land photo
app.post("/api/design-from-photo", async (req, res) => {
  try {
    const {
      imageBase64,
      prompt,
      plotWidth = 20,
      plotLength = 30,
      bedrooms = 3,
      bathrooms = 2,
      floors = 1,
      style = "Modern",
      variantsCount = 2
    } = req.body;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
      return res.status(400).json({ 
        error: "Missing API Key", 
        message: "Gemini API key is not configured." 
      });
    }

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing Image", message: "No image provided." });
    }

    // Extract base64 part
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const mimeType = imageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || "image/jpeg";

    const userPromptText = `
Analyze this land plot photo. Identify boundaries, potential natural light paths, terrain features, and optimal areas for construction.
Based on your analysis of this specific site, generate a beautiful architectural floor plan matching these specifications:
- Plot Dimensions: ${plotWidth}m width x ${plotLength}m length (at 40px/meter scale, this is ${plotWidth * 40}px width by ${plotLength * 40}px height).
- Intended Bedrooms: ${bedrooms}
- Intended Bathrooms: ${bathrooms}
- Number of floors: ${floors}
- Architectural Style: ${style}
- User Notes: "${prompt || 'Optimize layout for the visible terrain and views.'}"

In your rationale, explicitly mention how you optimized the design based on the visual features in the provided photo (e.g., placing windows towards a nice view, or aligning the driveway to the street).
Create a highly detailed, aligned, and buildable plan with walls, labeled rooms, doors/windows, and appropriate furniture matching the style.
Ensure that all coordinates form closed boundaries and there are NO isolated or overlapping walls/rooms.
All coordinates MUST be integers and align to a 10px or 20px grid spacing.
`;

    const variantPrompts = [];
    const count = Math.min(Math.max(Number(variantsCount), 1), 3);

    for (let i = 0; i < count; i++) {
      let variationDirection = "Option A: Primary optimal layout balancing site features and functional space.";
      if (i === 1) {
        variationDirection = "Option B: Alternative layout emphasizing views and outdoor integration with the landscape shown in the photo.";
      } else if (i === 2) {
        variationDirection = "Option C: Space-maximizing layout oriented for privacy from neighbors or roads visible in the photo.";
      }

      variantPrompts.push(
        ai.models.generateContent({
          model: "gemini-1.5-pro",
          contents: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType
              }
            },
            `${userPromptText}\n\nVariation Requirement for this variant: ${variationDirection}`
          ],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: FLOOR_PLAN_RESPONSE_SCHEMA,
            temperature: 0.7 + (i * 0.1)
          }
        })
      );
    }

    const results = await Promise.all(variantPrompts);
    const variants = results.map((resObj, idx) => {
      try {
        const textStr = resObj.text || "{}";
        const parsedData = JSON.parse(textStr.trim());
        return {
          id: `variant-photo-${idx}-${Date.now()}`,
          title: parsedData.name || `Site Variant ${idx + 1}`,
          ...parsedData
        };
      } catch (err: any) {
        console.error(`Failed to parse photo variant ${idx} output:`, err);
        return {
          id: `variant-photo-${idx}-${Date.now()}`,
          title: `Variant ${idx + 1} (Generation Failure)`,
          error: "JSON Parsing Error",
          message: "The model generated an invalid format.",
          plan: { walls: [], rooms: [], openings: [], furniture: [] },
          rationale: {
            architecturalConcept: "Generation failed.",
            zoningRationale: "N/A",
            circulationFlow: "N/A",
            naturalLightAndVents: "N/A"
          },
          dimensions: {
            widthMeters: plotWidth,
            lengthMeters: plotLength,
            totalBuildAreaM2: 0,
            scalePixelsPerMeter: 40
          }
        };
      }
    });

    res.json({ success: true, variants });
  } catch (error: any) {
    console.error("Photo design generation error:", error);
    res.status(500).json({ 
      success: false, 
      error: "AI Generation Error", 
      message: error?.message || "Failed to process image and generate design." 
    });
  }
});

app.post("/api/analyze-blueprint", async (req, res) => {
  try {
    const { plan } = req.body;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
      return res.status(400).json({ 
        error: "Missing API Key", 
        message: "Gemini API key is not configured." 
      });
    }

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
    `;

    const result = await ai.models.generateContent({
      model: "gemini-1.5-pro",
      contents: analyzePrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: AUDIT_RESPONSE_SCHEMA,
        temperature: 0.2 // Lower temperature for analytical task
      }
    });

    const parsedData = JSON.parse(result.text || "{}");
    
    res.json({
      success: true,
      issues: parsedData.issues || [],
      optimizedPlan: parsedData.optimizedPlan || plan
    });

  } catch (error: any) {
    console.error("Audit generation error:", error);
    res.status(500).json({ 
      success: false, 
      error: "AI Audit Error", 
      message: error?.message || "Failed to analyze the blueprint." 
    });
  }
});

app.post("/api/optimize-costs", async (req, res) => {
  try {
    const { plan, metrics, costs, qualityLevel, region } = req.body;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
      return res.status(400).json({ 
        error: "Missing API Key", 
        message: "Gemini API key is not configured." 
      });
    }

    const prompt = `
      You are an expert construction cost estimator and value engineer.
      Review the following project metrics and floor plan data to suggest cost optimizations.

      Project Parameters:
      - Quality Level: ${qualityLevel}
      - Region: ${region}
      - Total Cost Estimate: $${costs.total.toFixed(0)}
      - Subtotal Cost: $${costs.subtotal.toFixed(0)}
      
      Quantities:
      - Area: ${metrics.areaM2.toFixed(1)} m2
      - Walls: ${metrics.wallLengthM.toFixed(1)} linear meters
      - Doors: ${metrics.doors}
      - Windows: ${metrics.windows}

      Floor Plan Context:
      ${JSON.stringify(plan)}

      Provide 3 to 4 actionable, high-value suggestions to optimize the construction costs or material selections for this specific design and quality level. Focus on spatial efficiency, material rationalization, and structural simplification. Return only a JSON array of strings.
    `;

    const result = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        temperature: 0.4
      }
    });

    const suggestions = JSON.parse(result.text || "[]");
    
    res.json({
      success: true,
      suggestions: suggestions
    });

  } catch (error: any) {
    console.error("Cost optimization error:", error);
    res.status(500).json({ 
      success: false, 
      error: "AI Optimization Error", 
      message: error?.message || "Failed to generate cost optimizations." 
    });
  }
});

app.post("/api/architect-chat", async (req, res) => {
  try {
    const { messages, plan } = req.body;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
      return res.status(400).json({ 
        error: "Missing API Key", 
        message: "Gemini API key is not configured." 
      });
    }

    const systemPrompt = `
      You are an expert architect AI assistant for LandCraft AI.
      You answer user questions about architecture, space planning, building codes, and floor plan design.
      If the user asks you to generate, modify, or create a floor plan based on their requirements, use the \`generate_floor_plan\` function.
      
      Current Floor Plan Context (if any):
      ${JSON.stringify(plan)}

      Keep your answers concise, professional, and helpful. Use markdown for formatting.
    `;

    // Map messages to Gemini format
    const formattedMessages = messages.map((m: any) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }]
    }));

    const result = await ai.models.generateContent({
      model: "gemini-1.5-pro",
      contents: formattedMessages,
      config: {
        systemInstruction: systemPrompt,
        tools: [{
          functionDeclarations: [
            {
              name: "generate_floor_plan",
              description: "Generates a new floor plan based on the user's request. Call this when the user explicitly asks to generate, create, or update the floor plan.",
              parameters: FLOOR_PLAN_RESPONSE_SCHEMA
            }
          ]
        }],
        temperature: 0.7
      }
    });

    let generatedPlan = null;
    let responseText = result.text || "";

    const functionCalls = result.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
       const call = functionCalls[0];
       if (call.name === "generate_floor_plan") {
          generatedPlan = call.args;
          if (!responseText) {
             responseText = "I've generated a new floor plan based on your request. Check it out!";
          }
       }
    }

    res.json({
      success: true,
      text: responseText,
      generatedPlan
    });

  } catch (error: any) {
    console.error("Chat error:", error);
    res.status(500).json({ 
      success: false, 
      error: "AI Chat Error", 
      message: error?.message || "Failed to process chat" 
    });
  }
});

// Start server Vite middleware integration
async function startServer() {
  // Integrate Vite for asset bundling in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[LandCraft AI] Server booting up on port ${PORT}`);
  });
}

startServer();
