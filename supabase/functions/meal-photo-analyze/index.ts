// supabase/functions/meal-photo-analyze/index.ts
// AI Photo Meal Analysis with Wellness Guardrails (Vertex AI Gemini)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';
// Note: AI enabled check removed - food scanning is available to all users

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

function toNumberOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const cleaned = value.trim().toLowerCase();
    if (!cleaned) return null;

    const mixedMatch = cleaned.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
    if (mixedMatch) {
        const whole = Number(mixedMatch[1]);
        const numerator = Number(mixedMatch[2]);
        const denominator = Number(mixedMatch[3]);
        if (denominator) return whole + numerator / denominator;
    }

    const fractionMatch = cleaned.match(/^(\d+)\s*\/\s*(\d+)/);
    if (fractionMatch) {
        const numerator = Number(fractionMatch[1]);
        const denominator = Number(fractionMatch[2]);
        if (denominator) return numerator / denominator;
    }

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
    }
    return 'medium';
}

function normalizeUnit(value: unknown): string {
    if (typeof value === 'string' && value.trim()) return value.trim();
    return 'serving';
}

function normalizeDisplayName(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return 'Food Item';
    const trimmed = value.trim();
    return containsBannedTerms(trimmed) ? 'Food Item' : trimmed;
}

function normalizeNutrients(input: unknown): NutrientEstimate {
    const raw = (input && typeof input === 'object') ? input as Record<string, unknown> : {};
    const carbs = normalizeNutrientValue(raw.carbs_g, 1);
    const protein = normalizeNutrientValue(raw.protein_g, 1);
    const fat = normalizeNutrientValue(raw.fat_g, 1);

    let calories = normalizeNutrientValue(raw.calories_kcal, 0);
    if (calories === null && (carbs !== null || protein !== null || fat !== null)) {
        const computed = (carbs || 0) * 4 + (protein || 0) * 4 + (fat || 0) * 9;
        calories = computed > 0 ? Math.round(computed) : null;
    }

    return {
        calories_kcal: calories,
        carbs_g: carbs,
        protein_g: protein,
        fat_g: fat,
        fibre_g: normalizeNutrientValue(raw.fibre_g, 1),
        sugar_g: normalizeNutrientValue(raw.sugar_g, 1),
        sodium_mg: normalizeNutrientValue(raw.sodium_mg, 0),
    };
}

function sumNutrients(items: AnalyzedItem[], key: keyof NutrientEstimate, decimals: number): number | null {
    let total = 0;
    let hasValue = false;
    for (const item of items) {
        const value = item.nutrients[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            total += value;
            hasValue = true;
        }
    }
    return hasValue ? roundTo(total, decimals) : null;
}

function normalizeAnalysisResult(raw: unknown): AnalysisResult {
    const source = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const rawItems = Array.isArray(source.items) ? source.items : [];

    const items: AnalyzedItem[] = rawItems.map((item: any) => ({
        display_name: normalizeDisplayName(item?.display_name),
        quantity: normalizeNutrientValue(item?.quantity, 2) || 1,
        unit: normalizeUnit(item?.unit),
        confidence: normalizeConfidence(item?.confidence),
        nutrients: normalizeNutrients(item?.nutrients),
    }));

    const status: 'complete' | 'failed' = source.status === 'failed' || items.length === 0
        ? 'failed'
        : 'complete';

    const disclaimer = typeof source.disclaimer === 'string' && source.disclaimer.trim()
        ? source.disclaimer.trim()
        : DEFAULT_DISCLAIMER;

    return {
        status,
        disclaimer,
        items,
        totals: {
            calories_kcal: sumNutrients(items, 'calories_kcal', 0),
            carbs_g: sumNutrients(items, 'carbs_g', 1),
            protein_g: sumNutrients(items, 'protein_g', 1),
            fat_g: sumNutrients(items, 'fat_g', 1),
            fibre_g: sumNutrients(items, 'fibre_g', 1),
        },
    };
}

// ============================================
// VERTEX AI (GEMINI) CALL
// ============================================

const VERTEX_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const DEFAULT_VERTEX_MODEL = 'gemini-1.5-pro';

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
        throw new Error(`Failed to get access token: ${text}`);
    }

    const data = await res.json();
    if (!data?.access_token) {
        throw new Error('Access token missing from response');
    }

    return { token: data.access_token as string, model, projectId, region };
}

async function fetchImageAsBase64(photoUrl: string): Promise<{ data: string; mimeType: string }> {
    console.log('Fetching image from:', photoUrl.substring(0, 100) + '...');

    const response = await fetch(photoUrl);
    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('Failed to fetch image:', response.status, errorText);
        throw new Error(`Failed to fetch image: ${response.status} - ${errorText.substring(0, 100)}`);
    }

    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    console.log('Image fetched successfully:', bytes.length, 'bytes, type:', mimeType);

    if (bytes.length < 1000) {
        console.warn('Image is very small, might be empty or corrupted');
    }

    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return { data: btoa(binary), mimeType };
}

async function analyzePhotoWithGemini(
    photoUrl: string,
    mealType?: string,
    mealTime?: string,
    mealName?: string,
    mealNotes?: string
): Promise<AnalysisResult> {
    const { token, model, projectId, region } = await getAccessToken();
    const { data: imageBase64, mimeType } = await fetchImageAsBase64(photoUrl);

    const systemPrompt = `You are a nutrition estimation assistant that helps people track what they eat.

YOUR TASK: Analyze this food photo and identify all visible food items with their estimated nutrition.

RULES:
1. ALWAYS try to identify food items, even if the image quality is not perfect.
2. List each distinct food item separately (e.g., "Grilled Chicken Breast", "Steamed Rice", "Mixed Vegetables").
3. For each item, estimate the portion size and macronutrients.
4. Use common serving units: "piece", "cup", "oz", "g", "slice", "serving".
5. Set confidence to "low" if uncertain, "medium" if reasonably sure, "high" if very clear.
6. If you can see ANY food at all, return status "complete" with your best estimates.
7. ONLY return status "failed" if the image contains NO food whatsoever (e.g., a blank wall, a person, text only).
8. Use wellness language. Avoid medical terms.
9. Output MUST be valid JSON.

EXAMPLES OF WHAT TO IDENTIFY:
- A plate with rice and chicken → list "Rice" and "Grilled Chicken" separately
- A sandwich → list "Sandwich" or break down into "Bread", "Deli Meat", "Cheese", etc.
- A salad → list main components like "Mixed Greens", "Tomatoes", "Dressing"
- A smoothie or drink → list "Smoothie" or "Coffee with Milk", etc.

OUTPUT FORMAT:
{
  "status": "complete",
  "disclaimer": "${DEFAULT_DISCLAIMER}",
  "items": [
    {
      "display_name": "Grilled Chicken Breast",
      "quantity": 1,
      "unit": "piece",
      "confidence": "medium",
      "nutrients": {
        "calories_kcal": 165,
        "carbs_g": 0,
        "protein_g": 31,
        "fat_g": 3.6,
        "fibre_g": 0,
        "sugar_g": 0,
        "sodium_mg": 74
      }
    }
  ],
  "totals": {
    "calories_kcal": 165,
    "carbs_g": 0,
    "protein_g": 31,
    "fat_g": 3.6,
    "fibre_g": 0
  }
}`;

    const timeNote = mealTime ? ` Meal time: ${mealTime}.` : '';
    const nameNote = mealName ? ` Meal name hint: ${mealName}.` : '';
    const notesNote = mealNotes ? ` User notes: ${mealNotes}.` : '';
    const userPrompt = `Please analyze this food photo and identify all the food items you can see.${mealType ? ` This appears to be a ${mealType} meal.` : ''}${timeNote}${nameNote}${notesNote}

List each food item with estimated portion size and nutrition values. Even if the image is not perfect, please provide your best estimates with appropriate confidence levels.`;

    try {
        const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:generateContent`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
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
                    temperature: 0.4,
                    topP: 0.9,
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
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Vertex AI error:', response.status, errorText);
            throw new Error(`Vertex AI request failed: ${response.status}`);
        }

        const data = await response.json();
        console.log('Vertex AI raw response:', JSON.stringify(data, null, 2));

        // Check for blocked content or other issues
        if (data?.candidates?.[0]?.finishReason === 'SAFETY') {
            console.warn('Response was blocked by safety filters');
            throw new Error('Content was blocked by safety filters');
        }

        const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log('Extracted content:', content);

        if (!content) {
            console.warn('No content in Vertex AI response');
            throw new Error('Empty response from AI');
        }

        let parsed: unknown = null;
        try {
            parsed = JSON.parse(content);
        } catch {
            // Try to extract JSON from the response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('No JSON found in response:', content);
                throw new Error('Could not parse AI response');
            }
            parsed = JSON.parse(jsonMatch[0]);
        }

        const result = normalizeAnalysisResult(parsed);
        console.log('Normalized result:', JSON.stringify(result, null, 2));
        return result;

    } catch (error) {
        console.error('Gemini Analysis failed:', error);
        return {
            status: 'failed',
            disclaimer: 'Could not analyze photo. Try taking a clearer picture or add items manually.',
            items: [],
            totals: { calories_kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0, fibre_g: 0 }
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

    try {
        const body: RequestBody = await req.json();
        const { user_id: requestedUserId, meal_id, photo_url, meal_time, meal_type, meal_name, meal_notes } = body;

        if (!requestedUserId || !photo_url) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { user, errorResponse } = await requireUser(req, supabase, corsHeaders);
        if (errorResponse) return errorResponse;

        const mismatch = requireMatchingUserId(requestedUserId, user.id, corsHeaders);
        if (mismatch) return mismatch;

        // Note: AI enabled check removed - food scanning is available to all users

        const userId = user.id;

        if (meal_id) {
            const { data: meal, error: mealError } = await supabase
                .from('meals')
                .select('id')
                .eq('id', meal_id)
                .eq('user_id', userId)
                .single();

            if (mealError || !meal) {
                return new Response(
                    JSON.stringify({ error: 'Meal not found' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        // Run Analysis
        const result = await analyzePhotoWithGemini(photo_url, meal_type, meal_time, meal_name, meal_notes);

        // Store result in DB
        if (meal_id) {
            const { error: dbError } = await supabase
                .from('meal_photo_analysis')
                .upsert({
                    user_id: userId,
                    meal_id,
                    photo_path: photo_url, // Storing raw URL/path used for reference
                    status: result.status,
                    result: result, // Store the full JSON result
                    model: Deno.env.get('VERTEX_AI_MODEL') || DEFAULT_VERTEX_MODEL,
                }, { onConflict: 'meal_id' });

            if (dbError) {
                console.error('DB Update Error:', dbError);
            }
        }

        return new Response(
            JSON.stringify(result),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
