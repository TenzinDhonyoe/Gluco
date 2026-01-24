import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GoogleGenAI } from 'npm:@google/genai@1.38.0';
import { requireUser } from '../_shared/auth.ts';
import { enforceNutrientLimits, NUTRIENT_LIMITS } from '../_shared/nutrition-validation.ts';
// Note: AI enabled check removed - label scanning is available to all users

/**
 * Label Parse Edge Function
 * Uses Gemini Vision to extract nutrition information from food label images
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LabelParseRequest {
    image_base64: string;
    locale?: string;
    units?: 'metric' | 'us';
}

interface ParsedLabel {
    display_name: string;
    brand?: string;
    serving: {
        amount?: number;
        unit?: string;
        description?: string;
    };
    per_serving: {
        calories?: number;
        carbs_g?: number;
        fibre_g?: number;
        sugars_g?: number;
        protein_g?: number;
        fat_g?: number;
        sat_fat_g?: number;
        sodium_mg?: number;
    };
    confidence: number;
    warnings: string[];
    raw_extracted: Record<string, string>;
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function parseNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const match = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
        if (!match) return null;
        const parsed = Number(match[0]);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function extractCodeFence(text: string): string | null {
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    return fenceMatch ? fenceMatch[1] : null;
}

function findFirstJsonObject(text: string): string | null {
    const start = text.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
        const char = text[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }
        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return text.slice(start, i + 1);
            }
        }
    }
    return null;
}

function parseJsonFromText(text: string): { parsed: Record<string, any> | null; warnings: string[] } {
    const warnings: string[] = [];
    const attempts: string[] = [];
    const trimmed = text.trim();

    if (trimmed) attempts.push(trimmed);

    const fenced = extractCodeFence(trimmed);
    if (fenced && fenced.trim() !== trimmed) attempts.push(fenced.trim());

    const firstObject = findFirstJsonObject(trimmed);
    if (firstObject && firstObject.trim() !== trimmed) attempts.push(firstObject.trim());

    for (const attempt of attempts) {
        const cleaned = attempt.replace(/^\uFEFF/, '').trim();
        try {
            return { parsed: JSON.parse(cleaned), warnings };
        } catch {
            const repaired = cleaned.replace(/,\s*([}\]])/g, '$1');
            try {
                warnings.push('Model response contained trailing commas; cleaned.');
                return { parsed: JSON.parse(repaired), warnings };
            } catch {
                // Continue to next attempt
            }
        }
    }

    return { parsed: null, warnings };
}

const GEMINI_PROMPT = `You are a nutrition label parser. Analyze this food label image and extract the nutrition information.

IMPORTANT RULES:
1. Extract values PER SERVING, not per 100g (unless the serving IS 100g)
2. If values are shown "per 100g" AND "per serving", prefer per serving
3. Look for serving size description (e.g., "1 cup (240ml)", "2 cookies (30g)")
4. Handle bilingual labels - extract the English values when both languages present
5. Return null for any value you cannot find or are uncertain about
6. Include warnings for any ambiguity

CALORIE SANITY CHECK:
- If a value seems impossibly high (e.g., >2500 calories per serving), double-check the serving size
- A single serving is typically:
  - Drinks: 240-500ml (100-400 calories)
  - Snacks: 30-50g (100-250 calories)
  - Meals/Entrees: 200-400g (300-800 calories)
- If calories > 1000 per serving, add a warning about unusual serving size

Return a JSON object with this EXACT structure:
{
  "display_name": "Product name from the label",
  "brand": "Brand name if visible, or null",
  "serving": {
    "amount": number or null (e.g., 30 for "30g"),
    "unit": "g" or "ml" or "oz" etc,
    "description": "human readable like '1 cup' or '2 cookies'"
  },
  "per_serving": {
    "calories": number or null,
    "carbs_g": number or null (total carbohydrates in grams),
    "fibre_g": number or null (dietary fiber in grams),
    "sugars_g": number or null,
    "protein_g": number or null,
    "fat_g": number or null (total fat),
    "sat_fat_g": number or null (saturated fat),
    "sodium_mg": number or null (in milligrams)
  },
  "confidence": 0-100 (your confidence in the accuracy),
  "warnings": ["array of any warnings or ambiguities"],
  "raw_extracted": {"key": "value" pairs of everything you could read}
}

ONLY return valid JSON. No markdown, no explanations.`;

const DEFAULT_MODEL = 'gemini-2.5-flash';

let aiClient: GoogleGenAI | null = null;

function getGenAIClient(): GoogleGenAI {
    if (!aiClient) {
        const apiKey = Deno.env.get('GEMINI_API_KEY');
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY environment variable is not set');
        }
        aiClient = new GoogleGenAI({ apiKey });
    }
    return aiClient;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { image_base64, locale = 'en', units = 'metric' } = await req.json() as LabelParseRequest;

        if (!image_base64) {
            return new Response(
                JSON.stringify({ error: 'Missing image_base64' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { user, errorResponse } = await requireUser(req, supabase, corsHeaders);
        if (errorResponse) return errorResponse;

        // Note: AI enabled check removed - label scanning is available to all users

        const ai = getGenAIClient();
        const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;

        const dataUriMatch = image_base64.match(/^data:(image\/\w+);base64,(.+)$/);
        const mimeType = dataUriMatch?.[1] || 'image/jpeg';
        const cleanBase64 = dataUriMatch?.[2] || image_base64;

        let textContent: string;
        try {
            const response = await ai.models.generateContent({
                model,
                contents: [{
                    role: 'user',
                    parts: [
                        { text: GEMINI_PROMPT },
                        {
                            inlineData: {
                                mimeType,
                                data: cleanBase64,
                            },
                        },
                    ],
                }],
                config: {
                    temperature: 0.1,
                    topP: 0.8,
                    topK: 10,
                    maxOutputTokens: 1024,
                    responseMimeType: 'application/json',
                },
            });

            textContent = response.text || '';
        } catch (error) {
            console.error('Gen AI error:', error);

            return new Response(
                JSON.stringify({
                    error: 'Failed to analyze label',
                    details: 'Vision service unavailable, please try again',
                }),
                { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!textContent) {
            console.error('No text content in Gemini response');
            return new Response(
                JSON.stringify({
                    error: 'Could not read the label',
                    details: 'Try better lighting or flatten the package',
                }),
                { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Parse JSON from response with fallbacks
        const { parsed, warnings: parseWarnings } = parseJsonFromText(textContent);
        if (!parsed) {
            console.error('Label parse error: Could not parse JSON from response', {
                textExcerpt: textContent.slice(0, 400),
            });
            return new Response(
                JSON.stringify({
                    error: 'Could not parse the label',
                    details: 'The model response was malformed. Try retaking the photo with better lighting.',
                }),
                { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Parse raw values first
        const rawPerServing = {
            calories: parseNumber(parsed.per_serving?.calories),
            carbs_g: parseNumber(parsed.per_serving?.carbs_g),
            fibre_g: parseNumber(parsed.per_serving?.fibre_g),
            sugars_g: parseNumber(parsed.per_serving?.sugars_g),
            protein_g: parseNumber(parsed.per_serving?.protein_g),
            fat_g: parseNumber(parsed.per_serving?.fat_g),
            sat_fat_g: parseNumber(parsed.per_serving?.sat_fat_g),
            sodium_mg: parseNumber(parsed.per_serving?.sodium_mg),
        };

        // Apply nutrient limits to prevent extreme values from label parsing
        const productName = parsed.display_name || 'Unknown Product';
        const enforced = enforceNutrientLimits(
            productName,
            {
                calories: rawPerServing.calories,
                carbs_g: rawPerServing.carbs_g,
                protein_g: rawPerServing.protein_g,
                fat_g: rawPerServing.fat_g,
                fibre_g: rawPerServing.fibre_g,
                sugar_g: rawPerServing.sugars_g,
                sodium_mg: rawPerServing.sodium_mg,
            },
            1 // quantity = 1 for per-serving values
        );

        // Add warning if values were clamped
        const enforcementWarnings: string[] = [];
        if (enforced._wasClamped) {
            enforcementWarnings.push(
                `Nutrient values were adjusted to safe limits (original calories: ${enforced._originalCalories}, reason: ${enforced._clampReason || 'limit exceeded'})`
            );
        }

        // Validate and sanitize response
        const result: ParsedLabel = {
            display_name: productName,
            brand: parsed.brand || undefined,
            serving: {
                amount: parseNumber(parsed.serving?.amount),
                unit: parsed.serving?.unit || 'g',
                description: parsed.serving?.description || undefined,
            },
            per_serving: {
                calories: enforced.calories,
                carbs_g: enforced.carbs_g,
                fibre_g: enforced.fibre_g,
                sugars_g: enforced.sugar_g,
                protein_g: enforced.protein_g,
                fat_g: enforced.fat_g,
                sat_fat_g: rawPerServing.sat_fat_g !== null
                    ? clampNumber(rawPerServing.sat_fat_g, 0, NUTRIENT_LIMITS.fat.max)
                    : null,
                sodium_mg: enforced.sodium_mg,
            },
            confidence: clampNumber(parseNumber(parsed.confidence) ?? 50, 0, 100),
            warnings: [
                ...(Array.isArray(parsed.warnings) ? parsed.warnings : []),
                ...parseWarnings,
                ...enforcementWarnings,
            ],
            raw_extracted: parsed.raw_extracted && typeof parsed.raw_extracted === 'object'
                ? parsed.raw_extracted
                : {},
        };

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Label parse error:', error);

        return new Response(
            JSON.stringify({
                error: 'Failed to parse label',
                details: 'Could not extract nutrition information',
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
