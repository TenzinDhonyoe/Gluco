// supabase/functions/meal-photo-analyze/index.ts
// AI Photo Meal Analysis with Google Gen AI SDK - Rebuilt for Reliable Food Detection

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { GoogleGenAI } from 'npm:@google/genai@1.38.0';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';
import { enforceNutrientLimits } from '../_shared/nutrition-validation.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// TYPES
// ============================================

interface RequestBody {
    user_id: string;
    meal_id?: string;
    photo_url: string;
    meal_time?: string;
    meal_type?: string;
    meal_name?: string;
    meal_notes?: string;
}

interface NutrientEstimate {
    calories_kcal: number | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    fibre_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
}

interface AnalyzedItem {
    display_name: string;
    quantity: number;
    unit: string;
    confidence: 'low' | 'medium' | 'high';
    nutrients: NutrientEstimate;
}

interface AnalysisResult {
    status: 'complete' | 'failed';
    disclaimer: string;
    items: AnalyzedItem[];
    totals: {
        calories_kcal: number | null;
        carbs_g: number | null;
        fat_g: number | null;
        fibre_g: number | null;
        protein_g: number | null;
    };
    debug?: {
        model: string;
        processingTimeMs: number;
        imageSize: number;
        rawResponse?: string;
        error?: string;
    };
}

// ============================================
// LOGGING UTILITIES
// ============================================

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        ...data,
    };

    if (level === 'ERROR') {
        console.error(JSON.stringify(logEntry));
    } else if (level === 'WARN') {
        console.warn(JSON.stringify(logEntry));
    } else {
        console.log(JSON.stringify(logEntry));
    }
}

// ============================================
// SAFETY FILTERS
// ============================================

const BANNED_TERMS = [
    'spike', 'risk', 'treat', 'prevent', 'diagnose', 'insulin', 'clinical',
    'prediabetes', 'diabetes', 'hypoglycemia', 'hyperglycemia',
    'blood sugar', 'therapy', 'treatment', 'disease', 'condition', 'medical',
    'cure', 'heal', 'monitor glucose', 'managing diabetes'
];

function containsBannedTerms(text: string): boolean {
    const lowerText = text.toLowerCase();
    return BANNED_TERMS.some(term => lowerText.includes(term.toLowerCase()));
}

const DEFAULT_DISCLAIMER = 'Estimates from a photo only. Edit to improve accuracy. Not medical advice.';

// ============================================
// NORMALIZATION UTILITIES
// ============================================

function toNumberOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const cleaned = value.trim();
    if (!cleaned) return null;
    const numeric = cleaned.replace(/[^0-9.+-]/g, '');
    if (!numeric) return null;
    const parsed = Number.parseFloat(numeric);
    return Number.isFinite(parsed) ? parsed : null;
}

function roundTo(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

function normalizeNutrientValue(value: unknown, decimals: number): number | null {
    const parsed = toNumberOrNull(value);
    if (parsed === null || parsed < 0) return null;
    return roundTo(parsed, decimals);
}

function normalizeConfidence(value: unknown): 'low' | 'medium' | 'high' {
    if (typeof value === 'string') {
        const normalized = value.toLowerCase().trim();
        if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
            return normalized;
        }
        // Map numeric confidence scores
        if (normalized.includes('0.') || normalized.includes('%')) {
            const num = parseFloat(normalized.replace('%', ''));
            if (num >= 80) return 'high';
            if (num >= 50) return 'medium';
            return 'low';
        }
    }
    if (typeof value === 'number') {
        if (value >= 0.8) return 'high';
        if (value >= 0.5) return 'medium';
        return 'low';
    }
    return 'medium';
}

function normalizeUnit(value: unknown): string {
    if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase();
    return 'serving';
}

function normalizeDisplayName(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return 'Food Item';
    const trimmed = value.trim();
    return containsBannedTerms(trimmed) ? 'Food Item' : trimmed;
}

function normalizeNutrients(input: unknown): NutrientEstimate {
    const raw = (input && typeof input === 'object') ? input as Record<string, unknown> : {};

    // Handle both camelCase and snake_case property names
    const carbs = normalizeNutrientValue(raw.carbs_g ?? raw.carbs ?? raw.carbsG, 1);
    const protein = normalizeNutrientValue(raw.protein_g ?? raw.protein ?? raw.proteinG, 1);
    const fat = normalizeNutrientValue(raw.fat_g ?? raw.fat ?? raw.fatG, 1);
    const fibre = normalizeNutrientValue(raw.fibre_g ?? raw.fibre ?? raw.fiber_g ?? raw.fiber ?? raw.fibreG ?? raw.fiberG, 1);
    const sugar = normalizeNutrientValue(raw.sugar_g ?? raw.sugar ?? raw.sugarG, 1);
    const sodium = normalizeNutrientValue(raw.sodium_mg ?? raw.sodium ?? raw.sodiumMg, 0);

    let calories = normalizeNutrientValue(raw.calories_kcal ?? raw.calories ?? raw.caloriesKcal ?? raw.kcal, 0);

    // Calculate calories from macros if not provided
    if (calories === null && (carbs !== null || protein !== null || fat !== null)) {
        const computed = (carbs || 0) * 4 + (protein || 0) * 4 + (fat || 0) * 9;
        calories = computed > 0 ? Math.round(computed) : null;
    }

    return {
        calories_kcal: calories,
        carbs_g: carbs,
        protein_g: protein,
        fat_g: fat,
        fibre_g: fibre,
        sugar_g: sugar,
        sodium_mg: sodium,
    };
}

function sumNutrients(items: AnalyzedItem[], key: keyof NutrientEstimate, decimals: number): number | null {
    let total = 0;
    let hasValue = false;
    for (const item of items) {
        const value = item.nutrients[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            // Multiply by quantity to get total
            total += value * (item.quantity || 1);
            hasValue = true;
        }
    }
    return hasValue ? roundTo(total, decimals) : null;
}

function validateNutrients(item: AnalyzedItem): AnalyzedItem {
    // Enforce nutrient limits using the shared validation module
    // Prevents AI hallucination of extreme values (e.g., 7500 cal coffee)
    const enforced = enforceNutrientLimits(
        item.display_name,
        {
            calories_kcal: item.nutrients.calories_kcal,
            carbs_g: item.nutrients.carbs_g,
            protein_g: item.nutrients.protein_g,
            fat_g: item.nutrients.fat_g,
            fibre_g: item.nutrients.fibre_g,
            sugar_g: item.nutrients.sugar_g,
            sodium_mg: item.nutrients.sodium_mg,
        },
        item.quantity
    );

    if (enforced._wasClamped) {
        log('WARN', 'Nutrient values clamped', {
            food: item.display_name,
            original: enforced._originalCalories,
            clamped: enforced.calories,
            reason: enforced._clampReason,
        });
    }

    return {
        ...item,
        nutrients: {
            calories_kcal: enforced.calories,
            carbs_g: enforced.carbs_g,
            protein_g: enforced.protein_g,
            fat_g: enforced.fat_g,
            fibre_g: enforced.fibre_g,
            sugar_g: enforced.sugar_g,
            sodium_mg: enforced.sodium_mg,
        },
    };
}

// ============================================
// RESPONSE NORMALIZATION
// ============================================

function normalizeAnalysisResult(raw: unknown, debug?: { model: string; processingTimeMs: number; imageSize: number; rawResponse?: string }): AnalysisResult {
    const source = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const rawItems = Array.isArray(source.items) ? source.items : [];

    const items: AnalyzedItem[] = rawItems.map((item: unknown) => {
        const itemObj = (item && typeof item === 'object') ? item as Record<string, unknown> : {};

        const normalized: AnalyzedItem = {
            display_name: normalizeDisplayName(itemObj.display_name ?? itemObj.name ?? itemObj.food_name ?? itemObj.foodName),
            quantity: normalizeNutrientValue(itemObj.quantity ?? itemObj.amount ?? 1, 2) || 1,
            unit: normalizeUnit(itemObj.unit ?? itemObj.serving_unit ?? itemObj.servingUnit),
            confidence: normalizeConfidence(itemObj.confidence ?? itemObj.confidence_score ?? itemObj.confidenceScore),
            nutrients: normalizeNutrients(itemObj.nutrients ?? itemObj.nutrition ?? itemObj),
        };

        return validateNutrients(normalized);
    });

    const validItems = items.filter(item => item.display_name !== 'Food Item' || items.length === 1);

    const status: 'complete' | 'failed' = source.status === 'failed' || validItems.length === 0
        ? 'failed'
        : 'complete';

    const disclaimer = typeof source.disclaimer === 'string' && source.disclaimer.trim()
        ? source.disclaimer.trim()
        : DEFAULT_DISCLAIMER;

    const result: AnalysisResult = {
        status,
        disclaimer,
        items: validItems,
        totals: {
            calories_kcal: sumNutrients(validItems, 'calories_kcal', 0),
            carbs_g: sumNutrients(validItems, 'carbs_g', 1),
            protein_g: sumNutrients(validItems, 'protein_g', 1),
            fat_g: sumNutrients(validItems, 'fat_g', 1),
            fibre_g: sumNutrients(validItems, 'fibre_g', 1),
        },
    };

    if (debug) {
        result.debug = debug;
    }

    log('INFO', 'Analysis result normalized', {
        status: result.status,
        itemCount: validItems.length,
        totalCalories: result.totals.calories_kcal
    });

    return result;
}

// ============================================
// GOOGLE GEN AI SDK
// ============================================

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

async function fetchImageAsBase64(photoUrl: string): Promise<{ data: string; mimeType: string; size: number }> {
    log('INFO', 'Fetching image', { url: photoUrl.substring(0, 100) + '...' });

    const response = await fetch(photoUrl);
    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        log('ERROR', 'Failed to fetch image', { status: response.status, error: errorText.substring(0, 200) });
        throw new Error(`Failed to fetch image: ${response.status} - ${errorText.substring(0, 100)}`);
    }

    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    log('INFO', 'Image fetched successfully', { size: bytes.length, mimeType });

    if (bytes.length < 1000) {
        log('WARN', 'Image is very small, might be empty or corrupted', { size: bytes.length });
    }

    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return { data: btoa(binary), mimeType, size: bytes.length };
}

// ============================================
// ENHANCED FOOD DETECTION PROMPT
// ============================================

function buildSystemPrompt(): string {
    return `You are an expert food recognition and nutrition estimation assistant. Your primary goal is to accurately identify ALL visible food items in photos and provide reliable nutrition estimates.

## CRITICAL CALORIE CONSTRAINTS (MUST FOLLOW):

- Single food items should NEVER exceed 2500 calories
- Beverages (coffee, tea, juice, smoothies, lattes) should NEVER exceed 800 calories
- A plain black coffee is 2-5 calories
- A large latte with syrup is 200-400 calories
- If you're uncertain, estimate LOWER rather than higher
- Reference ranges for single items:
  - Small snack: 50-200 cal
  - Medium meal item: 200-500 cal
  - Large meal item: 500-1000 cal
  - Full meal plate (multiple items): 800-1500 cal total

## CRITICAL RULES FOR FOOD DETECTION:

1. **ALWAYS IDENTIFY FOODS** - Even if image quality is imperfect, ALWAYS attempt to identify foods. Identify foods confidently, but estimate portions conservatively.

2. **COMMON FOODS TO RECOGNIZE** (you MUST be able to identify these):
   - Fruits: apple, banana, orange, grapes, strawberry, blueberry, mango, pineapple, watermelon
   - Vegetables: salad, lettuce, tomato, cucumber, carrot, broccoli, spinach
   - Proteins: chicken, beef, pork, fish, salmon, tuna, egg, tofu
   - Grains: rice, pasta, bread, noodles, quinoa, oats
   - Dairy: milk, cheese, yogurt
   - Prepared: sandwich, burger, pizza, soup, stir-fry, curry
   - Snacks: chips, crackers, cookies, nuts
   - Drinks: coffee, tea, juice, smoothie, soda

3. **PORTION ESTIMATION**:
   - Use visual cues (plate size, hand size if visible, other objects)
   - Default to MEDIUM portions if unclear (not large)
   - Use appropriate units: "piece" for whole fruits, "cup" for rice/pasta, "oz" for meats, "slice" for bread
   - When in doubt, estimate smaller portions - users can adjust up if needed

4. **CONFIDENCE LEVELS**:
   - "high": Clear view, easily identifiable food (e.g., whole apple, banana)
   - "medium": Reasonable certainty, standard prepared foods
   - "low": Partial view, mixed dishes, or uncertainty

5. **WHEN TO USE EACH STATUS**:
   - "complete": ANY food is visible, even if only partially or unclear
   - "failed": ONLY if the image contains absolutely NO food (person's face, landscape, text document, blank image)

6. **NUTRITION ESTIMATION**:
   - Provide realistic estimates based on typical serving sizes
   - For common foods like apples: ~95 calories, 25g carbs, 0.5g protein, 0.3g fat
   - For common foods like bananas: ~105 calories, 27g carbs, 1.3g protein, 0.4g fat
   - Scale nutrition values based on estimated portion size
   - VERIFY: Calories should roughly equal (carbs * 4) + (protein * 4) + (fat * 9)

## OUTPUT FORMAT (STRICT JSON):

{
  "status": "complete",
  "disclaimer": "${DEFAULT_DISCLAIMER}",
  "items": [
    {
      "display_name": "Food Name",
      "quantity": 1,
      "unit": "piece",
      "confidence": "high",
      "nutrients": {
        "calories_kcal": 95,
        "carbs_g": 25,
        "protein_g": 0.5,
        "fat_g": 0.3,
        "fibre_g": 4.4,
        "sugar_g": 19,
        "sodium_mg": 2
      }
    }
  ]
}

## EXAMPLES OF CORRECT RESPONSES:

**Photo of an apple:**
{
  "status": "complete",
  "items": [{
    "display_name": "Apple",
    "quantity": 1,
    "unit": "piece",
    "confidence": "high",
    "nutrients": {"calories_kcal": 95, "carbs_g": 25, "protein_g": 0.5, "fat_g": 0.3, "fibre_g": 4.4, "sugar_g": 19, "sodium_mg": 2}
  }]
}

**Photo of chicken and rice:**
{
  "status": "complete",
  "items": [
    {"display_name": "Grilled Chicken Breast", "quantity": 4, "unit": "oz", "confidence": "medium", "nutrients": {"calories_kcal": 140, "carbs_g": 0, "protein_g": 26, "fat_g": 3, "fibre_g": 0, "sugar_g": 0, "sodium_mg": 60}},
    {"display_name": "White Rice", "quantity": 1, "unit": "cup", "confidence": "medium", "nutrients": {"calories_kcal": 205, "carbs_g": 45, "protein_g": 4, "fat_g": 0.4, "fibre_g": 0.6, "sugar_g": 0, "sodium_mg": 2}}
  ]
}

REMEMBER:
- Your goal is RELIABLE DETECTION with CONSERVATIVE estimates
- When in doubt about portions, estimate SMALLER
- NEVER output calories over 2500 for a single item or 800 for beverages
- When in doubt, IDENTIFY the food with appropriate confidence level`;
}

function buildUserPrompt(mealType?: string, mealTime?: string, mealName?: string, mealNotes?: string): string {
    const hints: string[] = [];
    if (mealType) hints.push(`Meal type: ${mealType}`);
    if (mealTime) hints.push(`Time: ${mealTime}`);
    if (mealName) hints.push(`User labeled this as: ${mealName}`);
    if (mealNotes) hints.push(`User notes: ${mealNotes}`);

    const hintsText = hints.length > 0 ? `\n\nContext provided by user:\n${hints.join('\n')}` : '';

    return `Analyze this food photo and identify ALL visible food items.

For each item, provide:
1. Name (be specific: "Grilled Chicken" not just "meat")
2. Estimated portion size and unit
3. Confidence level (high/medium/low)
4. Nutrition estimates (calories, carbs, protein, fat, fiber, sugar, sodium)

Return valid JSON with status "complete" and the items array.${hintsText}`;
}

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================

async function analyzePhotoWithGemini(
    photoUrl: string,
    mealType?: string,
    mealTime?: string,
    mealName?: string,
    mealNotes?: string
): Promise<AnalysisResult> {
    const startTime = Date.now();
    let imageSize = 0;
    let rawResponseText = '';

    try {
        const ai = getGenAIClient();
        const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;
        const { data: imageBase64, mimeType, size } = await fetchImageAsBase64(photoUrl);
        imageSize = size;

        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt(mealType, mealTime, mealName, mealNotes);

        log('INFO', 'Sending request to Google Gen AI', { model, imageSize: size });

        const response = await ai.models.generateContent({
            model,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: systemPrompt },
                        { text: userPrompt },
                        { inlineData: { mimeType, data: imageBase64 } },
                    ],
                },
            ],
            config: {
                temperature: 0.2,
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 2048,
                responseMimeType: 'application/json',
            },
        });

        const content = response.text || '';
        rawResponseText = content.substring(0, 2000); // Store for debugging

        if (!content) {
            log('WARN', 'Empty response from Gen AI');
            throw new Error('Empty response from AI');
        }

        // Parse JSON response with multiple fallback strategies
        let parsed: unknown = null;
        const parseStrategies = [
            // Strategy 1: Direct parse (if response is pure JSON)
            () => JSON.parse(content),
            // Strategy 2: Extract from markdown code blocks
            () => {
                const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (match) return JSON.parse(match[1].trim());
                throw new Error('No markdown block');
            },
            // Strategy 3: Find JSON object with balanced braces
            () => {
                let start = content.indexOf('{');
                if (start === -1) throw new Error('No opening brace');
                let depth = 0;
                let end = -1;
                for (let i = start; i < content.length; i++) {
                    if (content[i] === '{') depth++;
                    else if (content[i] === '}') {
                        depth--;
                        if (depth === 0) {
                            end = i + 1;
                            break;
                        }
                    }
                }
                if (end === -1) throw new Error('No balanced braces');
                return JSON.parse(content.substring(start, end));
            },
            // Strategy 4: Clean common issues and try again
            () => {
                let cleaned = content
                    .replace(/^[^{]*/, '') // Remove leading non-JSON
                    .replace(/[^}]*$/, '') // Remove trailing non-JSON
                    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
                    .trim();
                return JSON.parse(cleaned);
            },
        ];

        for (let i = 0; i < parseStrategies.length; i++) {
            try {
                parsed = parseStrategies[i]();
                break;
            } catch (e) {
                if (i === parseStrategies.length - 1) {
                    log('ERROR', 'All JSON parsing strategies failed', {
                        content: content.substring(0, 500),
                        lastError: e instanceof Error ? e.message : 'Unknown'
                    });
                    throw new Error('Could not parse AI response as JSON');
                }
            }
        }

        const processingTimeMs = Date.now() - startTime;
        const result = normalizeAnalysisResult(parsed, {
            model,
            processingTimeMs,
            imageSize,
            rawResponse: rawResponseText,
        });

        log('INFO', 'Photo analysis completed', {
            status: result.status,
            itemCount: result.items.length,
            processingTimeMs
        });

        return result;

    } catch (error) {
        const processingTimeMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        log('ERROR', 'Photo analysis failed', {
            error: errorMessage,
            processingTimeMs,
            imageSize
        });

        return {
            status: 'failed',
            disclaimer: 'Could not analyze photo. Try taking a clearer picture or add items manually.',
            items: [],
            totals: { calories_kcal: null, carbs_g: null, protein_g: null, fat_g: null, fibre_g: null },
            debug: {
                model: Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL,
                processingTimeMs,
                imageSize,
                error: errorMessage,
                rawResponse: rawResponseText,
            }
        };
    }
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const requestId = crypto.randomUUID();
    log('INFO', 'Request received', { requestId, method: req.method });

    try {
        const body: RequestBody = await req.json();
        const { user_id: requestedUserId, meal_id, photo_url, meal_time, meal_type, meal_name, meal_notes } = body;

        log('INFO', 'Processing meal photo analysis', {
            requestId,
            hasMealId: !!meal_id,
            hasMealType: !!meal_type,
            hasMealName: !!meal_name
        });

        if (!requestedUserId || !photo_url) {
            log('WARN', 'Missing required fields', { requestId, hasUserId: !!requestedUserId, hasPhotoUrl: !!photo_url });
            return new Response(
                JSON.stringify({ error: 'Missing required fields: user_id and photo_url are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { user, errorResponse } = await requireUser(req, supabase, corsHeaders);
        if (errorResponse) {
            log('WARN', 'Auth failed', { requestId });
            return errorResponse;
        }

        const mismatch = requireMatchingUserId(requestedUserId, user.id, corsHeaders);
        if (mismatch) {
            log('WARN', 'User ID mismatch', { requestId });
            return mismatch;
        }

        const userId = user.id;

        // Verify meal ownership if meal_id provided
        if (meal_id) {
            const { data: meal, error: mealError } = await supabase
                .from('meals')
                .select('id')
                .eq('id', meal_id)
                .eq('user_id', userId)
                .single();

            if (mealError || !meal) {
                log('WARN', 'Meal not found', { requestId, mealId: meal_id });
                return new Response(
                    JSON.stringify({ error: 'Meal not found or access denied' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        // Run Analysis
        const result = await analyzePhotoWithGemini(photo_url, meal_type, meal_time, meal_name, meal_notes);

        // Store result in DB if meal_id provided
        if (meal_id) {
            const { error: dbError } = await supabase
                .from('meal_photo_analysis')
                .upsert({
                    user_id: userId,
                    meal_id,
                    photo_path: photo_url,
                    status: result.status,
                    result: result,
                    model: Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL,
                }, { onConflict: 'meal_id' });

            if (dbError) {
                log('ERROR', 'Failed to store analysis result', { requestId, error: dbError.message });
            }
        }

        log('INFO', 'Request completed', {
            requestId,
            status: result.status,
            itemCount: result.items.length
        });

        return new Response(
            JSON.stringify(result),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log('ERROR', 'Request failed', { requestId, error: errorMessage });

        return new Response(
            JSON.stringify({
                error: 'Internal server error',
                message: errorMessage,
                requestId
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
