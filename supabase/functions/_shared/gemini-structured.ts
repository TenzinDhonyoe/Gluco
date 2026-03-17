// supabase/functions/_shared/gemini-structured.ts
// Two-step Gemini prompting for food detection:
// Step 1: Identify foods with dimensional analysis
// Step 2: Estimate weights using dimensional reasoning (run 3x, take median)

import { GoogleGenAI } from 'npm:@google/genai@1.38.0';
import { convertToGrams } from './portion-estimator.ts';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

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

// ============================================
// TYPES
// ============================================

export type FoodCategory =
    | 'fruit'
    | 'vegetable'
    | 'protein'
    | 'grain'
    | 'dairy'
    | 'beverage'
    | 'snack'
    | 'dessert'
    | 'prepared_meal'
    | 'other';

export type PortionEstimateType = 'none' | 'qualitative' | 'volume_ml' | 'weight_g';

export type PortionUnit = 'ml' | 'g' | 'cup' | 'tbsp' | 'tsp' | 'piece' | 'slice' | 'serving';

export interface DetectedFoodItem {
    name: string;
    synonyms: string[];
    category: FoodCategory;
    visible_portion_descriptor: string;
    portion: {
        estimate_type: PortionEstimateType;
        value: number | null;
        unit: PortionUnit;
        confidence: number;
    };
    preparation?: string;
    confidence: number;
}

export interface PhotoQuality {
    is_blurry: boolean;
    has_occlusion: boolean;
    has_reference_object: boolean;
    lighting_issue: boolean;
}

// Step 1 raw output from Gemini
interface Step1FoodItem {
    food_name: string;
    food_category: 'protein' | 'grain' | 'vegetable' | 'fruit' | 'dairy' | 'fat' | 'beverage' | 'mixed_dish' | 'condiment' | 'dessert';
    plate_reference: number;
    food_dimensions: {
        height_cm: number;
        spread_fraction_of_plate: number;
        shape: 'mound' | 'flat' | 'liquid' | 'pieces' | 'layered';
    };
    visual_cues: string;
    hidden_ingredients_likely: boolean;
    confidence: 'low' | 'medium' | 'high';
}

// Step 2 raw output from Gemini
interface Step2WeightEstimate {
    food_name: string;
    min_grams: number;
    best_grams: number;
    max_grams: number;
    volume_ml: number;
    density_used: number;
    reasoning: string;
}

// Debug info for the two-step process
export interface TwoStepDebug {
    step1_output: Step1FoodItem[];
    step2_runs: Step2WeightEstimate[][];
    step2_median: Step2WeightEstimate[];
}

export interface FoodDetectionResult {
    items: DetectedFoodItem[];
    photo_quality: PhotoQuality;
    two_step_debug?: TwoStepDebug;
}

// ============================================
// PROMPTS
// ============================================

const STEP_1_PROMPT = `Analyze this food image. For each distinct food item visible, provide:
1. food_name: specific name including cooking method (e.g., "grilled chicken breast" not just "chicken")
2. food_category: one of [protein, grain, vegetable, fruit, dairy, fat, beverage, mixed_dish, condiment, dessert]
3. plate_reference: estimate the plate/bowl diameter in cm. Standard dinner plate = 26cm, salad plate = 20cm, bowl = 15cm. Use visible utensils if no plate (fork length ~19cm, knife ~22cm)
4. food_dimensions: { height_cm, spread_fraction_of_plate (0.0-1.0), shape: "mound"|"flat"|"liquid"|"pieces"|"layered" }
5. visual_cues: any observable details about density, thickness, layering
6. hidden_ingredients_likely: boolean — are sauces, oils, cheese, butter likely present but not fully visible?
7. confidence: "low"|"medium"|"high"

Respond ONLY with valid JSON array. No markdown, no explanation.`;

const STEP_2_PROMPT_TEMPLATE = `Using the food analysis below AND the original image, estimate the weight in grams for each food item.

For each item, show your dimensional reasoning:
1. Estimate volume in mL based on the dimensions (height × area, using plate as reference)
2. Apply food-type density: proteins ~1.1g/mL, grains/rice ~0.9g/mL, vegetables ~0.6g/mL, liquids ~1.0g/mL, mixed dishes ~0.9g/mL
3. Convert volume to grams
4. Provide three estimates: { min_grams, best_grams, max_grams }

CRITICAL: Most AI models systematically underestimate portions. If anything, bias slightly high rather than low.

Food analysis from Step 1:
{step1_output}

Respond ONLY with valid JSON array matching this schema:
[{ "food_name": string, "min_grams": number, "best_grams": number, "max_grams": number, "volume_ml": number, "density_used": number, "reasoning": string }]`;

// ============================================
// HELPERS
// ============================================

/**
 * Parse raw JSON from Gemini response text.
 * Handles markdown fences, object wrappers like { "items": [...] }, etc.
 */
function parseRawJsonArray<T>(text: string): T[] {
    let cleaned = text.trim();

    // Strip markdown code fences
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(cleaned);

    // If it's already an array, return it
    if (Array.isArray(parsed)) {
        return parsed as T[];
    }

    // If it's an object with an array field, extract it
    if (typeof parsed === 'object' && parsed !== null) {
        const keys = Object.keys(parsed);
        for (const key of keys) {
            if (Array.isArray(parsed[key])) {
                return parsed[key] as T[];
            }
        }
    }

    throw new Error('Response is not a JSON array');
}

/**
 * Map Step 1 food_category to FoodCategory
 */
function mapStep1Category(cat: Step1FoodItem['food_category']): FoodCategory {
    switch (cat) {
        case 'fat':
        case 'condiment':
            return 'other';
        case 'mixed_dish':
            return 'prepared_meal';
        default:
            return cat;
    }
}

/**
 * Map confidence label to numeric value
 */
function mapConfidence(conf: 'low' | 'medium' | 'high'): number {
    switch (conf) {
        case 'high': return 0.9;
        case 'medium': return 0.7;
        case 'low': return 0.4;
        default: return 0.5;
    }
}

/**
 * Compute median estimates from multiple Step 2 runs.
 * Groups by food_name (normalized lowercase), takes median of numeric fields.
 */
function computeMedianEstimates(runs: Step2WeightEstimate[][]): Step2WeightEstimate[] {
    // Collect all unique food names across runs
    const allNames = new Set<string>();
    for (const run of runs) {
        for (const item of run) {
            allNames.add(item.food_name.toLowerCase().trim());
        }
    }

    const results: Step2WeightEstimate[] = [];

    for (const normalizedName of allNames) {
        // Gather all estimates for this food across runs
        const estimates: Step2WeightEstimate[] = [];
        for (const run of runs) {
            const match = run.find(
                item => item.food_name.toLowerCase().trim() === normalizedName
            );
            if (match) estimates.push(match);
        }

        if (estimates.length === 0) continue;

        const medianOf = (arr: number[]): number => {
            const sorted = [...arr].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            if (sorted.length % 2 === 1) return sorted[mid];
            return (sorted[mid - 1] + sorted[mid]) / 2;
        };

        results.push({
            food_name: estimates[0].food_name, // Use original casing from first run
            min_grams: Math.round(medianOf(estimates.map(e => e.min_grams))),
            best_grams: Math.round(medianOf(estimates.map(e => e.best_grams))),
            max_grams: Math.round(medianOf(estimates.map(e => e.max_grams))),
            volume_ml: Math.round(medianOf(estimates.map(e => e.volume_ml))),
            density_used: medianOf(estimates.map(e => e.density_used)),
            reasoning: estimates[0].reasoning, // Use reasoning from first run
        });
    }

    return results;
}

// ============================================
// URL VALIDATION
// ============================================

/**
 * Validate that a photo URL is safe to fetch (SSRF prevention).
 */
export function validatePhotoUrl(url: string): void {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error('Invalid photo URL');
    }

    if (parsed.protocol !== 'https:') {
        throw new Error('Only HTTPS photo URLs are allowed');
    }

    const hostname = parsed.hostname.toLowerCase();

    if (
        hostname === 'localhost' ||
        hostname === '[::1]' ||
        hostname.startsWith('127.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('169.254.') ||
        hostname.startsWith('0.') ||
        hostname.includes('metadata.google') ||
        hostname.includes('metadata.aws') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
        throw new Error('Photo URL points to a restricted address');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    let supabaseHost = '';
    try {
        supabaseHost = new URL(supabaseUrl).hostname;
    } catch { /* ignore */ }

    const allowedHostSuffixes = ['.supabase.co', '.supabase.in'];
    if (supabaseHost) {
        allowedHostSuffixes.push(supabaseHost);
    }

    const isAllowed = allowedHostSuffixes.some(suffix => {
        const domain = suffix.startsWith('.') ? suffix.slice(1) : suffix;
        return hostname === domain || hostname.endsWith(suffix);
    });

    if (!isAllowed) {
        throw new Error('Photo URL must be from a trusted storage domain');
    }
}

// ============================================
// IMAGE FETCHING
// ============================================

async function fetchImageAsBase64(
    photoUrl: string
): Promise<{ data: string; mimeType: string; size: number }> {
    validatePhotoUrl(photoUrl);

    const response = await fetch(photoUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const mimeType = ALLOWED_IMAGE_TYPES.find(t => contentType.startsWith(t));
    if (!mimeType) {
        throw new Error('Response is not a valid image type');
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(`Image too large (max ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB)`);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(`Image too large (max ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB)`);
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    return {
        data: btoa(binary),
        mimeType,
        size: bytes.length,
    };
}

// ============================================
// TWO-STEP GEMINI CALLS
// ============================================

/**
 * Step 1: Identify foods with dimensional analysis
 */
async function step1FoodAnalysis(
    imageBase64: string,
    mimeType: string,
    mealType?: string,
    mealTime?: string
): Promise<Step1FoodItem[]> {
    const ai = getGenAIClient();
    const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;

    const contextHints: string[] = [];
    if (mealType) contextHints.push(`Meal type: ${mealType}`);
    if (mealTime) contextHints.push(`Time: ${mealTime}`);

    const prompt = contextHints.length > 0
        ? `${STEP_1_PROMPT}\n\nContext: ${contextHints.join(', ')}`
        : STEP_1_PROMPT;

    const response = await ai.models.generateContent({
        model,
        contents: [
            {
                role: 'user',
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType, data: imageBase64 } },
                ],
            },
        ],
        config: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
        },
    });

    const content = response.text || '';
    if (!content) {
        throw new Error('Empty response from Gemini Step 1');
    }

    return parseRawJsonArray<Step1FoodItem>(content);
}

/**
 * Step 2: Estimate weights using dimensional reasoning
 */
async function step2WeightEstimation(
    imageBase64: string,
    mimeType: string,
    step1Output: Step1FoodItem[]
): Promise<Step2WeightEstimate[]> {
    const ai = getGenAIClient();
    const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;

    const prompt = STEP_2_PROMPT_TEMPLATE.replace(
        '{step1_output}',
        JSON.stringify(step1Output, null, 2)
    );

    const response = await ai.models.generateContent({
        model,
        contents: [
            {
                role: 'user',
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType, data: imageBase64 } },
                ],
            },
        ],
        config: {
            temperature: 0.4,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
        },
    });

    const content = response.text || '';
    if (!content) {
        throw new Error('Empty response from Gemini Step 2');
    }

    return parseRawJsonArray<Step2WeightEstimate>(content);
}

// ============================================
// CORE TWO-STEP PIPELINE
// ============================================

/**
 * Internal two-step detection pipeline.
 * Used by both detectFoodItems() and detectFoodItemsFromBase64().
 */
async function twoStepDetection(
    imageBase64: string,
    mimeType: string,
    mealType?: string,
    mealTime?: string
): Promise<FoodDetectionResult> {
    const ai = getGenAIClient();

    // Step 1: Identify foods
    const step1Start = Date.now();
    const step1Output = await step1FoodAnalysis(imageBase64, mimeType, mealType, mealTime);
    console.log(`Step 1 completed in ${Date.now() - step1Start}ms, found ${step1Output.length} items`);

    if (step1Output.length === 0) {
        return {
            items: [],
            photo_quality: {
                is_blurry: false,
                has_occlusion: false,
                has_reference_object: false,
                lighting_issue: false,
            },
        };
    }

    // Step 2: Run 3x in parallel for median estimation
    const step2Start = Date.now();
    const step2Promises = [
        step2WeightEstimation(imageBase64, mimeType, step1Output).catch(err => {
            console.error('Step 2 run 1 failed:', err);
            return null;
        }),
        step2WeightEstimation(imageBase64, mimeType, step1Output).catch(err => {
            console.error('Step 2 run 2 failed:', err);
            return null;
        }),
    ];

    const step2Results = await Promise.all(step2Promises);
    const successfulRuns = step2Results.filter((r): r is Step2WeightEstimate[] => r !== null);
    console.log(`Step 2 completed in ${Date.now() - step2Start}ms, ${successfulRuns.length}/2 runs succeeded`);

    // Compute median estimates (or empty if all failed)
    const medianEstimates = successfulRuns.length > 0
        ? computeMedianEstimates(successfulRuns)
        : [];

    // Build FoodDetectionResult from Step 1 + Step 2 median
    const items: DetectedFoodItem[] = step1Output.map(s1Item => {
        const name = s1Item.food_name?.trim() || 'Unknown food';
        const category = mapStep1Category(s1Item.food_category);
        const confidence = mapConfidence(s1Item.confidence);

        // Find matching median estimate by normalized name
        const normalizedName = name.toLowerCase().trim();
        const median = medianEstimates.find(
            m => m.food_name.toLowerCase().trim() === normalizedName
        );

        let portionValue: number | null;
        let portionConfidence: number;

        if (median) {
            portionValue = median.best_grams;
            portionConfidence = confidence;
        } else {
            // Fallback: use convertToGrams from portion-estimator
            const fallbackPortion = {
                estimate_type: 'qualitative' as const,
                value: null as number | null,
                unit: 'serving' as const,
            };
            portionValue = convertToGrams(name, category, fallbackPortion);
            portionConfidence = Math.min(confidence, 0.5);
        }

        return {
            name,
            synonyms: [],
            category,
            visible_portion_descriptor: s1Item.visual_cues || '',
            portion: {
                estimate_type: 'weight_g' as PortionEstimateType,
                value: portionValue,
                unit: 'g' as PortionUnit,
                confidence: portionConfidence,
            },
            confidence,
        };
    });

    // Synthesize photo quality from Step 1 data
    const photo_quality: PhotoQuality = {
        is_blurry: false,
        has_occlusion: step1Output.some(item => item.hidden_ingredients_likely),
        has_reference_object: step1Output.length > 0 && step1Output[0].plate_reference > 0,
        lighting_issue: false,
    };

    const result: FoodDetectionResult = {
        items,
        photo_quality,
        two_step_debug: {
            step1_output: step1Output,
            step2_runs: successfulRuns,
            step2_median: medianEstimates,
        },
    };

    // Still run normalization for validation/safety-net
    return normalizeDetectionResult(result);
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Detect food items in an image using two-step Gemini prompting
 */
export async function detectFoodItems(
    photoUrl: string,
    mealType?: string,
    mealTime?: string
): Promise<FoodDetectionResult> {
    const { data: imageBase64, mimeType, size } = await fetchImageAsBase64(photoUrl);
    console.log(`Detecting food items in image (${size} bytes)`);

    try {
        return await twoStepDetection(imageBase64, mimeType, mealType, mealTime);
    } catch (error) {
        console.error('Food detection failed:', error);
        return {
            items: [],
            photo_quality: {
                is_blurry: false,
                has_occlusion: false,
                has_reference_object: false,
                lighting_issue: false,
            },
        };
    }
}

/**
 * Detect food items from base64 image data directly
 */
export async function detectFoodItemsFromBase64(
    imageBase64: string,
    mimeType: string = 'image/jpeg',
    mealType?: string,
    mealTime?: string
): Promise<FoodDetectionResult> {
    try {
        return await twoStepDetection(imageBase64, mimeType, mealType, mealTime);
    } catch (error) {
        console.error('Food detection failed:', error);
        return {
            items: [],
            photo_quality: {
                is_blurry: false,
                has_occlusion: false,
                has_reference_object: false,
                lighting_issue: false,
            },
        };
    }
}

// ============================================
// NORMALIZATION
// ============================================

/**
 * Normalize and validate detection result
 */
function normalizeDetectionResult(raw: FoodDetectionResult): FoodDetectionResult {
    const validCategories: FoodCategory[] = [
        'fruit', 'vegetable', 'protein', 'grain', 'dairy',
        'beverage', 'snack', 'dessert', 'prepared_meal', 'other'
    ];

    const validUnits: PortionUnit[] = [
        'ml', 'g', 'cup', 'tbsp', 'tsp', 'piece', 'slice', 'serving'
    ];

    const validEstimateTypes: PortionEstimateType[] = [
        'none', 'qualitative', 'volume_ml', 'weight_g'
    ];

    const items = (raw.items || []).map((item): DetectedFoodItem => {
        const category = validCategories.includes(item.category as FoodCategory)
            ? item.category as FoodCategory
            : 'other';

        const portion = {
            estimate_type: validEstimateTypes.includes(item.portion?.estimate_type as PortionEstimateType)
                ? item.portion.estimate_type as PortionEstimateType
                : 'qualitative',
            value: typeof item.portion?.value === 'number' ? item.portion.value : null,
            unit: validUnits.includes(item.portion?.unit as PortionUnit)
                ? item.portion.unit as PortionUnit
                : 'serving',
            confidence: Math.max(0, Math.min(1, item.portion?.confidence ?? 0.5)),
        };

        const confidence = Math.max(0, Math.min(1, item.confidence ?? 0.5));

        const name = item.name?.trim() || 'Unknown food';
        if (portion.estimate_type !== 'weight_g' || portion.value === null || portion.value <= 0) {
            const gramsEstimate = convertToGrams(name, category, portion);
            portion.estimate_type = 'weight_g';
            portion.value = gramsEstimate;
            portion.unit = 'g';
            portion.confidence = Math.min(portion.confidence, 0.5);
        }

        return {
            name,
            synonyms: Array.isArray(item.synonyms) ? item.synonyms.filter(s => typeof s === 'string') : [],
            category,
            visible_portion_descriptor: item.visible_portion_descriptor || '',
            portion,
            preparation: item.preparation,
            confidence,
        };
    });

    const photo_quality: PhotoQuality = {
        is_blurry: Boolean(raw.photo_quality?.is_blurry),
        has_occlusion: Boolean(raw.photo_quality?.has_occlusion),
        has_reference_object: Boolean(raw.photo_quality?.has_reference_object),
        lighting_issue: Boolean(raw.photo_quality?.lighting_issue),
    };

    return { items, photo_quality, two_step_debug: raw.two_step_debug };
}
