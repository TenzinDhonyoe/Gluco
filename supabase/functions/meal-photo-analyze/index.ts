// supabase/functions/meal-photo-analyze/index.ts
// AI Photo Meal Analysis with Vertex AI Gemini - Rebuilt for Reliable Food Detection

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';

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
    const cleaned = value.trim().toLowerCase();
    if (!cleaned) return null;

    // Handle mixed fractions like "1 1/2"
    const mixedMatch = cleaned.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
    if (mixedMatch) {
        const whole = Number(mixedMatch[1]);
        const numerator = Number(mixedMatch[2]);
        const denominator = Number(mixedMatch[3]);
        if (denominator) return whole + numerator / denominator;
    }

    // Handle simple fractions like "1/2"
    const fractionMatch = cleaned.match(/^(\d+)\s*\/\s*(\d+)/);
    if (fractionMatch) {
        const numerator = Number(fractionMatch[1]);
        const denominator = Number(fractionMatch[2]);
        if (denominator) return numerator / denominator;
    }

    // Handle regular numbers
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

// ============================================
// FOOD REFERENCE DATA (for validation)
// ============================================

// Common food items with typical nutrition per serving for validation
const COMMON_FOODS: Record<string, { calories: [number, number]; carbs: [number, number]; protein: [number, number]; fat: [number, number] }> = {
    'apple': { calories: [80, 120], carbs: [20, 30], protein: [0, 1], fat: [0, 1] },
    'banana': { calories: [90, 130], carbs: [22, 35], protein: [1, 2], fat: [0, 1] },
    'orange': { calories: [60, 90], carbs: [12, 22], protein: [1, 2], fat: [0, 1] },
    'salad': { calories: [50, 300], carbs: [5, 20], protein: [2, 15], fat: [2, 25] },
    'sandwich': { calories: [250, 600], carbs: [25, 50], protein: [10, 30], fat: [8, 35] },
    'pasta': { calories: [200, 600], carbs: [35, 80], protein: [7, 20], fat: [3, 25] },
    'rice': { calories: [150, 350], carbs: [30, 60], protein: [3, 8], fat: [0, 5] },
    'chicken': { calories: [150, 400], carbs: [0, 10], protein: [25, 45], fat: [3, 25] },
    'steak': { calories: [200, 500], carbs: [0, 5], protein: [25, 45], fat: [10, 35] },
    'fish': { calories: [100, 350], carbs: [0, 5], protein: [20, 40], fat: [2, 20] },
    'egg': { calories: [70, 100], carbs: [0, 2], protein: [6, 8], fat: [5, 8] },
    'bread': { calories: [60, 120], carbs: [10, 25], protein: [2, 5], fat: [1, 3] },
    'milk': { calories: [80, 150], carbs: [10, 15], protein: [6, 10], fat: [2, 8] },
    'cheese': { calories: [80, 150], carbs: [0, 3], protein: [5, 10], fat: [6, 12] },
    'yogurt': { calories: [80, 200], carbs: [10, 30], protein: [5, 15], fat: [0, 10] },
};

function validateNutrients(item: AnalyzedItem): AnalyzedItem {
    // Find if this is a common food type
    const lowerName = item.display_name.toLowerCase();
    let foodType: string | null = null;

    for (const food of Object.keys(COMMON_FOODS)) {
        if (lowerName.includes(food)) {
            foodType = food;
            break;
        }
    }

    if (!foodType) return item;

    const ref = COMMON_FOODS[foodType];
    const nutrients = item.nutrients;

    // Flag extremely out-of-range values but don't change them - just log
    if (nutrients.calories_kcal !== null) {
        const cal = nutrients.calories_kcal;
        if (cal < ref.calories[0] * 0.3 || cal > ref.calories[1] * 3) {
            log('WARN', 'Unusual calorie value detected', {
                food: item.display_name,
                value: cal,
                expectedRange: ref.calories
            });
        }
    }

    return item;
}

// ============================================
// RESPONSE NORMALIZATION
// ============================================

function normalizeAnalysisResult(raw: unknown, debug?: { model: string; processingTimeMs: number; imageSize: number; rawResponse?: string }): AnalysisResult {
    const source = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const rawItems = Array.isArray(source.items) ? source.items : [];

    log('DEBUG', 'Normalizing analysis result', {
        itemCount: rawItems.length,
        rawSource: typeof source === 'object' ? Object.keys(source) : 'not object'
    });

    const items: AnalyzedItem[] = rawItems.map((item: unknown, index: number) => {
        const itemObj = (item && typeof item === 'object') ? item as Record<string, unknown> : {};

        log('DEBUG', `Processing item ${index}`, {
            rawItem: JSON.stringify(item).substring(0, 200)
        });

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
// VERTEX AI (GEMINI) CALL
// ============================================

const VERTEX_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const DEFAULT_VERTEX_MODEL = 'gemini-2.5-flash';

interface ServiceAccountKey {
    client_email: string;
    private_key: string;
    token_uri?: string;
}

function base64UrlEncode(input: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < input.length; i += chunkSize) {
        binary += String.fromCharCode(...input.subarray(i, i + chunkSize));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
    const cleaned = pem
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s+/g, '');
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

async function getAccessToken(): Promise<{ token: string; model: string; projectId: string; region: string }> {
    const raw = Deno.env.get('VERTEX_AI_SERVICE_ACCOUNT_JSON');
    const projectId = Deno.env.get('VERTEX_AI_PROJECT_ID');
    const region = Deno.env.get('VERTEX_AI_REGION');
    const model = Deno.env.get('VERTEX_AI_MODEL') || DEFAULT_VERTEX_MODEL;

    if (!raw) throw new Error('VERTEX_AI_SERVICE_ACCOUNT_JSON not set');
    if (!projectId) throw new Error('VERTEX_AI_PROJECT_ID not set');
    if (!region) throw new Error('VERTEX_AI_REGION not set');

    log('DEBUG', 'Getting Vertex AI access token', { projectId, region, model });

    const key = JSON.parse(raw) as ServiceAccountKey;
    const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token';
    const now = Math.floor(Date.now() / 1000);

    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
        iss: key.client_email,
        sub: key.client_email,
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
        scope: VERTEX_SCOPE,
    };

    const headerBytes = new TextEncoder().encode(JSON.stringify(header));
    const claimsBytes = new TextEncoder().encode(JSON.stringify(claims));
    const headerEncoded = base64UrlEncode(headerBytes);
    const claimsEncoded = base64UrlEncode(claimsBytes);
    const toSign = `${headerEncoded}.${claimsEncoded}`;

    const keyData = pemToArrayBuffer(key.private_key);
    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        keyData,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        new TextEncoder().encode(toSign)
    );
    const signatureEncoded = base64UrlEncode(new Uint8Array(signature));
    const jwt = `${toSign}.${signatureEncoded}`;

    const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
    });

    const res = await fetch(tokenUri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });

    if (!res.ok) {
        const text = await res.text();
        log('ERROR', 'Failed to get access token', { status: res.status, error: text });
        throw new Error(`Failed to get access token: ${text}`);
    }

    const data = await res.json();
    if (!data?.access_token) {
        throw new Error('Access token missing from response');
    }

    log('DEBUG', 'Access token obtained successfully');
    return { token: data.access_token as string, model, projectId, region };
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

## CRITICAL RULES FOR FOOD DETECTION:

1. **ALWAYS IDENTIFY FOODS** - Even if image quality is imperfect, ALWAYS attempt to identify foods. Be generous in detection.

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
   - Default to medium portions if unclear
   - Use appropriate units: "piece" for whole fruits, "cup" for rice/pasta, "oz" for meats, "slice" for bread

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

REMEMBER: Your goal is RELIABLE DETECTION. When in doubt, IDENTIFY the food with appropriate confidence level.`;
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
        const { token, model, projectId, region } = await getAccessToken();
        const { data: imageBase64, mimeType, size } = await fetchImageAsBase64(photoUrl);
        imageSize = size;

        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt(mealType, mealTime, mealName, mealNotes);

        log('INFO', 'Sending request to Vertex AI', { model, imageSize: size });

        const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:generateContent`;

        const requestBody = {
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
            generationConfig: {
                temperature: 0.2, // Lower temperature for more consistent results
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 2048,
                responseMimeType: 'application/json',
            },
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ],
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            log('ERROR', 'Vertex AI request failed', { status: response.status, error: errorText.substring(0, 500) });
            throw new Error(`Vertex AI request failed: ${response.status}`);
        }

        const data = await response.json();

        // Log the full response structure for debugging
        log('DEBUG', 'Vertex AI response received', {
            hasCandidate: !!data?.candidates?.[0],
            finishReason: data?.candidates?.[0]?.finishReason
        });

        // Check for blocked content
        if (data?.candidates?.[0]?.finishReason === 'SAFETY') {
            log('WARN', 'Response blocked by safety filters');
            throw new Error('Content was blocked by safety filters');
        }

        const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        rawResponseText = content.substring(0, 2000); // Store for debugging

        log('DEBUG', 'Raw AI response', { content: content.substring(0, 500) });

        if (!content) {
            log('WARN', 'Empty response from Vertex AI');
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
                log('DEBUG', `JSON parsed successfully with strategy ${i + 1}`);
                break;
            } catch (e) {
                if (i === parseStrategies.length - 1) {
                    log('ERROR', 'All JSON parsing strategies failed', {
                        content: content.substring(0, 1000),
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
                model: Deno.env.get('VERTEX_AI_MODEL') || DEFAULT_VERTEX_MODEL,
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
                    model: Deno.env.get('VERTEX_AI_MODEL') || DEFAULT_VERTEX_MODEL,
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
