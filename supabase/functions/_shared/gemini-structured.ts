// supabase/functions/_shared/gemini-structured.ts
// Gemini 2.5 Flash with structured JSON output for food detection only

import { GoogleGenAI, Type as SchemaType } from 'npm:@google/genai@1.38.0';
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

/**
 * Food category enum
 */
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

/**
 * Portion estimate type
 */
export type PortionEstimateType = 'none' | 'qualitative' | 'volume_ml' | 'weight_g';

/**
 * Portion unit type
 */
export type PortionUnit = 'ml' | 'g' | 'cup' | 'tbsp' | 'tsp' | 'piece' | 'slice' | 'serving';

/**
 * Detected food item from Gemini
 */
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

/**
 * Photo quality assessment
 */
export interface PhotoQuality {
    is_blurry: boolean;
    has_occlusion: boolean;
    has_reference_object: boolean;
    lighting_issue: boolean;
}

/**
 * Complete detection result from Gemini
 */
export interface FoodDetectionResult {
    items: DetectedFoodItem[];
    photo_quality: PhotoQuality;
}

/**
 * JSON Schema for Gemini structured output
 * This schema enforces the exact response format we need
 */
const FOOD_DETECTION_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        items: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    name: {
                        type: SchemaType.STRING,
                        description: 'The name of the food item (e.g., "Grilled Chicken Breast", "Apple")',
                    },
                    synonyms: {
                        type: SchemaType.ARRAY,
                        items: { type: SchemaType.STRING },
                        description: 'Alternative names for this food (e.g., ["chicken", "poultry"])',
                    },
                    category: {
                        type: SchemaType.STRING,
                        enum: ['fruit', 'vegetable', 'protein', 'grain', 'dairy', 'beverage', 'snack', 'dessert', 'prepared_meal', 'other'],
                        description: 'Food category',
                    },
                    visible_portion_descriptor: {
                        type: SchemaType.STRING,
                        description: 'Visual description of the portion (e.g., "medium-sized", "half plate", "small bowl")',
                    },
                    portion: {
                        type: SchemaType.OBJECT,
                        properties: {
                            estimate_type: {
                                type: SchemaType.STRING,
                                enum: ['none', 'qualitative', 'volume_ml', 'weight_g'],
                                description: 'Type of portion estimate',
                            },
                            value: {
                                type: SchemaType.NUMBER,
                                nullable: true,
                                description: 'Numeric portion value (null if qualitative)',
                            },
                            unit: {
                                type: SchemaType.STRING,
                                enum: ['ml', 'g', 'cup', 'tbsp', 'tsp', 'piece', 'slice', 'serving'],
                                description: 'Portion unit',
                            },
                            confidence: {
                                type: SchemaType.NUMBER,
                                description: 'Confidence in portion estimate (0-1)',
                            },
                        },
                        required: ['estimate_type', 'unit', 'confidence'],
                    },
                    preparation: {
                        type: SchemaType.STRING,
                        description: 'Preparation method if visible (e.g., "grilled", "fried", "raw")',
                    },
                    confidence: {
                        type: SchemaType.NUMBER,
                        description: 'Overall confidence in detection (0-1)',
                    },
                },
                required: ['name', 'category', 'portion', 'confidence'],
            },
        },
        photo_quality: {
            type: SchemaType.OBJECT,
            properties: {
                is_blurry: { type: SchemaType.BOOLEAN },
                has_occlusion: { type: SchemaType.BOOLEAN },
                has_reference_object: { type: SchemaType.BOOLEAN },
                lighting_issue: { type: SchemaType.BOOLEAN },
            },
            required: ['is_blurry', 'has_occlusion', 'has_reference_object', 'lighting_issue'],
        },
    },
    required: ['items', 'photo_quality'],
};

/**
 * System prompt for food detection (NO nutrition estimation)
 */
const DETECTION_SYSTEM_PROMPT = `You are an expert food recognition assistant. Your ONLY job is to identify food items and estimate their portion weight in grams.

## CRITICAL RULES:

1. **IDENTIFY FOODS ONLY** - Do NOT estimate calories or nutrition. Your job is identification and weight estimation.

2. **VISIBLE ITEMS ONLY** - Only identify foods you can clearly see. Do not guess hidden ingredients.

3. **PORTION WEIGHT IN GRAMS** - You MUST always estimate weight in grams for every item:
   - ALWAYS set estimate_type to 'weight_g' and unit to 'g'
   - Provide your best numeric estimate in the value field
   - Use these reference weights when estimating:
     * Apple/orange/pear: 150-200g
     * Banana: 100-130g
     * Chicken breast: 120-200g
     * Steak/beef portion: 150-250g
     * Fish fillet: 120-180g
     * Egg: 50g
     * Cooked rice (bowl): 150-250g
     * Cooked pasta (plate): 180-300g
     * Bread slice: 25-40g
     * Sandwich: 180-280g
     * Burger patty + bun: 180-250g
     * Pizza slice: 100-150g
     * Potato (medium): 170-220g
     * Broccoli (serving): 100-180g
     * Salad (bowl): 120-250g
     * Soup (bowl): 250-400g
     * Curry (serving): 250-350g
     * Cookie: 30-50g
     * Cup of liquid: ~240g
   - Use plate, bowl, hand, or utensils in the image as size references
   - If truly unable to estimate, set value to null (but try your best)

4. **CONFIDENCE LEVELS** (0-1 scale):
   - 0.9-1.0: Crystal clear, easily identifiable
   - 0.7-0.89: Reasonable certainty
   - 0.5-0.69: Some uncertainty, could be similar foods
   - Below 0.5: Significant uncertainty

5. **SYNONYMS** - Provide 1-3 alternative names that could help with database lookup

6. **CATEGORIES**:
   - fruit: Fresh or processed fruits
   - vegetable: Fresh or cooked vegetables
   - protein: Meat, fish, eggs, tofu, legumes
   - grain: Rice, bread, pasta, cereals
   - dairy: Milk, cheese, yogurt
   - beverage: Drinks, smoothies, coffee
   - snack: Chips, crackers, nuts
   - dessert: Sweets, cakes, ice cream
   - prepared_meal: Mixed dishes, meals
   - other: Anything that doesn't fit above

7. **PHOTO QUALITY**:
   - is_blurry: Image focus issues
   - has_occlusion: Foods partially hidden
   - has_reference_object: Plate, hand, utensil visible (helps portion estimation)
   - lighting_issue: Too dark or overexposed

Remember: You are NOT a nutritionist. Your job is identification and gram-weight estimation only.`;

/**
 * Validate that a photo URL is safe to fetch (SSRF prevention).
 * Only allows HTTPS URLs from trusted Supabase storage domains.
 * Blocks private/internal IP ranges and metadata endpoints.
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

    // Block private/internal IP ranges and cloud metadata endpoints
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

    // Only allow Supabase storage domains
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

/**
 * Fetch an image from URL and convert to base64.
 * Validates URL safety, enforces size limits, and checks content type.
 */
async function fetchImageAsBase64(
    photoUrl: string
): Promise<{ data: string; mimeType: string; size: number }> {
    validatePhotoUrl(photoUrl);

    const response = await fetch(photoUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
    }

    // Validate content type is an actual image
    const contentType = response.headers.get('content-type') || '';
    const mimeType = ALLOWED_IMAGE_TYPES.find(t => contentType.startsWith(t));
    if (!mimeType) {
        throw new Error('Response is not a valid image type');
    }

    // Check content-length header before downloading
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(`Image too large (max ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB)`);
    }

    const buffer = await response.arrayBuffer();

    // Double-check actual size after download
    if (buffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(`Image too large (max ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB)`);
    }

    const bytes = new Uint8Array(buffer);

    // Convert to base64
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

/**
 * Detect food items in an image using Gemini with structured output
 */
export async function detectFoodItems(
    photoUrl: string,
    mealType?: string,
    mealTime?: string
): Promise<FoodDetectionResult> {
    const ai = getGenAIClient();
    const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;

    // Fetch and encode image
    const { data: imageBase64, mimeType, size } = await fetchImageAsBase64(photoUrl);

    console.log(`Detecting food items in image (${size} bytes)`);

    // Build context hints
    const contextHints: string[] = [];
    if (mealType) contextHints.push(`Meal type: ${mealType}`);
    if (mealTime) contextHints.push(`Time: ${mealTime}`);

    const userPrompt = `Analyze this food photo and identify ALL visible food items.

For each item, provide:
1. A specific name (e.g., "Grilled Chicken Breast" not just "meat")
2. Synonyms for database lookup
3. Category
4. Visual portion description
5. Estimated weight in grams (estimate_type: 'weight_g', unit: 'g')
6. Your confidence level

${contextHints.length > 0 ? `\nContext: ${contextHints.join(', ')}` : ''}

Identify foods confidently. ALWAYS estimate weight in grams for each item.`;

    try {
        const response = await ai.models.generateContent({
            model,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: DETECTION_SYSTEM_PROMPT },
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
                responseSchema: FOOD_DETECTION_SCHEMA,
            },
        });

        const content = response.text || '';

        if (!content) {
            throw new Error('Empty response from Gemini');
        }

        // Parse JSON response
        const parsed = JSON.parse(content) as FoodDetectionResult;

        // Validate and normalize
        return normalizeDetectionResult(parsed);
    } catch (error) {
        console.error('Food detection failed:', error);

        // Return empty result on failure
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
        // Normalize category
        const category = validCategories.includes(item.category as FoodCategory)
            ? item.category as FoodCategory
            : 'other';

        // Normalize portion
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

        // Normalize confidence
        const confidence = Math.max(0, Math.min(1, item.confidence ?? 0.5));

        // Safety net: convert non-weight_g portions to grams
        const name = item.name?.trim() || 'Unknown food';
        if (portion.estimate_type !== 'weight_g' || portion.value === null || portion.value <= 0) {
            const gramsEstimate = convertToGrams(name, category, portion);
            portion.estimate_type = 'weight_g';
            portion.value = gramsEstimate;
            portion.unit = 'g';
            // Lower confidence since this is a fallback conversion
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

    // Normalize photo quality
    const photo_quality: PhotoQuality = {
        is_blurry: Boolean(raw.photo_quality?.is_blurry),
        has_occlusion: Boolean(raw.photo_quality?.has_occlusion),
        has_reference_object: Boolean(raw.photo_quality?.has_reference_object),
        lighting_issue: Boolean(raw.photo_quality?.lighting_issue),
    };

    return { items, photo_quality };
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
    const ai = getGenAIClient();
    const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;

    // Build context hints
    const contextHints: string[] = [];
    if (mealType) contextHints.push(`Meal type: ${mealType}`);
    if (mealTime) contextHints.push(`Time: ${mealTime}`);

    const userPrompt = `Analyze this food photo and identify ALL visible food items.

For each item, provide:
1. A specific name (e.g., "Grilled Chicken Breast" not just "meat")
2. Synonyms for database lookup
3. Category
4. Visual portion description
5. Estimated weight in grams (estimate_type: 'weight_g', unit: 'g')
6. Your confidence level

${contextHints.length > 0 ? `\nContext: ${contextHints.join(', ')}` : ''}

Identify foods confidently. ALWAYS estimate weight in grams for each item.`;

    try {
        const response = await ai.models.generateContent({
            model,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: DETECTION_SYSTEM_PROMPT },
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
                responseSchema: FOOD_DETECTION_SCHEMA,
            },
        });

        const content = response.text || '';

        if (!content) {
            throw new Error('Empty response from Gemini');
        }

        const parsed = JSON.parse(content) as FoodDetectionResult;
        return normalizeDetectionResult(parsed);
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
