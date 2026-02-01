// supabase/functions/meals-from-photo/index.ts
// New meal photo analysis endpoint with separated concerns:
// - Gemini 2.5 Flash for food detection only
// - FatSecret/USDA for nutrition lookup
// - Inline followups for low confidence items

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';
import { detectFoodItems, FoodDetectionResult, validatePhotoUrl } from '../_shared/gemini-structured.ts';
import {
    cacheImageAnalysis,
    computeHashFromUrl,
    getCachedImageAnalysis,
    getInMemoryCache,
    setInMemoryCache,
} from '../_shared/image-cache.ts';
import {
    DetectedItem,
    lookupNutritionBatch,
    NutritionLookupResult,
} from '../_shared/nutrition-lookup.ts';
import { convertToGrams, DeviceDepthPayload } from '../_shared/portion-estimator.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || Deno.env.get('SUPABASE_URL') || '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// TYPES
// ============================================

interface RequestBody {
    user_id: string;
    photo_url: string;
    meal_type?: string;
    device_depth_payload?: DeviceDepthPayload;
    followup_responses?: Array<{
        question_id: string;
        answer: string | number;
    }>;
}

interface FollowupQuestion {
    id: string;
    item_id: string;
    type: 'choose_one' | 'enter_amount' | 'confirm_items';
    question: string;
    options?: string[];
}

interface AnalyzedItem {
    id: string;
    name: string;
    synonyms: string[];
    category: string;
    portion: {
        estimate_type: 'none' | 'qualitative' | 'volume_ml' | 'weight_g';
        value: number | null;
        unit: string;
        confidence: number;
    };
    detection_confidence: number;

    // From FatSecret/USDA
    nutrition: {
        calories: number | null;
        carbs_g: number | null;
        protein_g: number | null;
        fat_g: number | null;
        fibre_g: number | null;
        sugar_g: number | null;
        sodium_mg: number | null;
    } | null;
    nutrition_source: 'fatsecret' | 'usda_fdc' | 'fallback_estimate';
    nutrition_confidence: number;

    // Extra metadata
    matched_food_name?: string;
    matched_food_brand?: string;
    serving_description?: string;
}

interface AnalysisResponse {
    status: 'complete' | 'needs_followup' | 'failed';
    items: AnalyzedItem[];
    photo_quality: {
        is_blurry: boolean;
        has_occlusion: boolean;
        lighting_issue: boolean;
    };
    followups?: FollowupQuestion[];
    cache_hit: boolean;
}

// ============================================
// LOGGING
// ============================================

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, ...data };

    if (level === 'ERROR') {
        console.error(JSON.stringify(logEntry));
    } else if (level === 'WARN') {
        console.warn(JSON.stringify(logEntry));
    } else {
        console.log(JSON.stringify(logEntry));
    }
}

// ============================================
// FOLLOWUP GENERATION
// ============================================

const DETECTION_CONFIDENCE_THRESHOLD = 0.65;
const PORTION_CONFIDENCE_THRESHOLD = 0.5;

function generateFollowups(items: AnalyzedItem[]): FollowupQuestion[] {
    const followups: FollowupQuestion[] = [];

    for (const item of items) {
        // Low detection confidence - ask for confirmation
        if (item.detection_confidence < DETECTION_CONFIDENCE_THRESHOLD) {
            followups.push({
                id: `confirm_${item.id}`,
                item_id: item.id,
                type: 'choose_one',
                question: `Is this ${item.name}?`,
                options: ['Yes', 'No, remove it', 'Something else'],
            });
        }
        // Low portion confidence - ask for amount
        else if (item.portion.confidence < PORTION_CONFIDENCE_THRESHOLD ||
            item.portion.estimate_type === 'none') {
            followups.push({
                id: `portion_${item.id}`,
                item_id: item.id,
                type: 'enter_amount',
                question: `How much ${item.name}?`,
                options: ['Small', 'Medium', 'Large', 'Enter grams'],
            });
        }
    }

    return followups;
}

// ============================================
// APPLY FOLLOWUP RESPONSES
// ============================================

function applyFollowupResponses(
    items: AnalyzedItem[],
    responses: RequestBody['followup_responses']
): AnalyzedItem[] {
    if (!responses || responses.length === 0) {
        return items;
    }

    const responseMap = new Map(responses.map(r => [r.question_id, r.answer]));

    return items.filter(item => {
        // Check if item was removed
        const confirmKey = `confirm_${item.id}`;
        const confirmAnswer = responseMap.get(confirmKey);
        if (confirmAnswer === 'No, remove it') {
            return false;
        }
        return true;
    }).map(item => {
        // Apply portion adjustments
        const portionKey = `portion_${item.id}`;
        const portionAnswer = responseMap.get(portionKey);

        if (portionAnswer) {
            const multipliers: Record<string, number> = {
                'Small': 0.7,
                'Medium': 1.0,
                'Large': 1.5,
            };

            if (typeof portionAnswer === 'string' && multipliers[portionAnswer]) {
                const multiplier = multipliers[portionAnswer];
                return {
                    ...item,
                    portion: {
                        ...item.portion,
                        value: item.portion.value ? item.portion.value * multiplier : null,
                        confidence: 0.9, // User confirmed
                    },
                    nutrition: item.nutrition ? {
                        calories: item.nutrition.calories ? Math.round(item.nutrition.calories * multiplier) : null,
                        carbs_g: item.nutrition.carbs_g ? Math.round(item.nutrition.carbs_g * multiplier * 10) / 10 : null,
                        protein_g: item.nutrition.protein_g ? Math.round(item.nutrition.protein_g * multiplier * 10) / 10 : null,
                        fat_g: item.nutrition.fat_g ? Math.round(item.nutrition.fat_g * multiplier * 10) / 10 : null,
                        fibre_g: item.nutrition.fibre_g ? Math.round(item.nutrition.fibre_g * multiplier * 10) / 10 : null,
                        sugar_g: item.nutrition.sugar_g ? Math.round(item.nutrition.sugar_g * multiplier * 10) / 10 : null,
                        sodium_mg: item.nutrition.sodium_mg ? Math.round(item.nutrition.sodium_mg * multiplier) : null,
                    } : null,
                };
            } else if (typeof portionAnswer === 'number') {
                // User entered specific grams
                return {
                    ...item,
                    portion: {
                        ...item.portion,
                        estimate_type: 'weight_g' as const,
                        value: portionAnswer,
                        unit: 'g' as const,
                        confidence: 0.95,
                    },
                };
            }
        }

        return item;
    });
}

// ============================================
// CONVERT DETECTION TO LOOKUP FORMAT
// ============================================

function detectionToLookupItem(
    item: FoodDetectionResult['items'][0]
): DetectedItem {
    const portion = {
        estimate_type: item.portion.estimate_type,
        value: item.portion.value,
        unit: item.portion.unit,
        confidence: item.portion.confidence,
    };

    // Safety net: if Gemini returned qualitative/none, convert to weight_g
    if (portion.estimate_type !== 'weight_g' || portion.value === null || portion.value <= 0) {
        portion.estimate_type = 'weight_g';
        portion.value = convertToGrams(item.name, item.category, portion);
        portion.unit = 'g';
        portion.confidence = Math.min(portion.confidence, 0.5);
    }

    return {
        name: item.name,
        synonyms: item.synonyms,
        category: item.category,
        portion,
        confidence: item.confidence,
    };
}

function nutritionResultToAnalyzedItem(
    result: NutritionLookupResult
): AnalyzedItem {
    return {
        id: result.item_id,
        name: result.name,
        synonyms: [],
        category: result.category,
        portion: result.portion,
        detection_confidence: result.detection_confidence,
        nutrition: result.nutrition,
        nutrition_source: result.nutrition_source,
        nutrition_confidence: result.nutrition_confidence,
        matched_food_name: result.matched_food_name,
        matched_food_brand: result.matched_food_brand,
        serving_description: result.serving_description,
    };
}

// ============================================
// MAIN ANALYSIS PIPELINE
// ============================================

async function analyzePhoto(
    photoUrl: string,
    mealType?: string,
    followupResponses?: RequestBody['followup_responses']
): Promise<AnalysisResponse> {
    const startTime = Date.now();
    let cacheHit = false;
    let detectionTimeMs = 0;
    let nutritionLookupTimeMs = 0;

    try {
        // Step 1: Check image cache
        const imageHash = await computeHashFromUrl(photoUrl);

        // Try in-memory cache first (fastest)
        let detection = getInMemoryCache(imageHash);

        if (!detection) {
            // Try database cache
            detection = await getCachedImageAnalysis(imageHash);

            if (detection) {
                cacheHit = true;
                setInMemoryCache(imageHash, detection);
            }
        } else {
            cacheHit = true;
        }

        // Step 2: Run detection if not cached
        if (!detection) {
            const detectionStart = Date.now();
            detection = await detectFoodItems(photoUrl, mealType);
            detectionTimeMs = Date.now() - detectionStart;

            // Cache the result
            setInMemoryCache(imageHash, detection);
            await cacheImageAnalysis(imageHash, detection);

            log('INFO', 'Food detection completed', {
                itemCount: detection.items.length,
                detectionTimeMs,
            });
        }

        // Check for empty detection
        if (!detection.items || detection.items.length === 0) {
            log('INFO', 'Empty detection result', {
                processingTimeMs: Date.now() - startTime,
                detectionTimeMs,
            });
            return {
                status: 'failed',
                items: [],
                photo_quality: {
                    is_blurry: detection.photo_quality?.is_blurry ?? false,
                    has_occlusion: detection.photo_quality?.has_occlusion ?? false,
                    lighting_issue: detection.photo_quality?.lighting_issue ?? false,
                },
                cache_hit: cacheHit,
            };
        }

        // Step 3: Look up nutrition for each detected item
        const nutritionStart = Date.now();
        const lookupItems = detection.items.map(detectionToLookupItem);
        const nutritionResults = await lookupNutritionBatch(lookupItems);
        nutritionLookupTimeMs = Date.now() - nutritionStart;

        log('INFO', 'Nutrition lookup completed', {
            itemCount: nutritionResults.length,
            nutritionLookupTimeMs,
        });

        // Step 4: Convert to analyzed items
        let analyzedItems = nutritionResults.map(nutritionResultToAnalyzedItem);

        // Step 5: Apply any followup responses
        if (followupResponses && followupResponses.length > 0) {
            analyzedItems = applyFollowupResponses(analyzedItems, followupResponses);
        }

        // Step 6: Generate followups for low confidence items
        const followups = generateFollowups(analyzedItems);

        // Determine status
        const status = followups.length > 0 ? 'needs_followup' : 'complete';

        log('INFO', 'Analysis pipeline timing', {
            processingTimeMs: Date.now() - startTime,
            detectionTimeMs,
            nutritionLookupTimeMs,
        });

        return {
            status,
            items: analyzedItems,
            photo_quality: {
                is_blurry: detection.photo_quality?.is_blurry ?? false,
                has_occlusion: detection.photo_quality?.has_occlusion ?? false,
                lighting_issue: detection.photo_quality?.lighting_issue ?? false,
            },
            followups: followups.length > 0 ? followups : undefined,
            cache_hit: cacheHit,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log('ERROR', 'Photo analysis failed', { error: errorMessage });

        return {
            status: 'failed',
            items: [],
            photo_quality: {
                is_blurry: false,
                has_occlusion: false,
                lighting_issue: false,
            },
            cache_hit: false,
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
        const { user_id: requestedUserId, photo_url, meal_type, followup_responses } = body;

        log('INFO', 'Processing meal photo', {
            requestId,
            hasMealType: !!meal_type,
            hasFollowups: !!followup_responses?.length,
        });

        // Validate required fields
        if (!requestedUserId || !photo_url) {
            log('WARN', 'Missing required fields', { requestId });
            return new Response(
                JSON.stringify({ error: 'Missing required fields: user_id and photo_url are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate photo URL is safe (SSRF prevention)
        try {
            validatePhotoUrl(photo_url);
        } catch (urlError) {
            log('WARN', 'Invalid photo URL', { requestId });
            return new Response(
                JSON.stringify({ error: 'Invalid photo URL' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate input sizes
        if (followup_responses && followup_responses.length > 20) {
            return new Response(
                JSON.stringify({ error: 'Too many followup responses (max 20)' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Auth check
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

        // Run analysis
        const result = await analyzePhoto(photo_url, meal_type, followup_responses);

        log('INFO', 'Request completed', {
            requestId,
            status: result.status,
            itemCount: result.items.length,
            cacheHit: result.cache_hit,
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
                requestId,
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
