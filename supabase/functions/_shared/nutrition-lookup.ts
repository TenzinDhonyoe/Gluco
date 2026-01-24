// supabase/functions/_shared/nutrition-lookup.ts
// Nutrition lookup pipeline: FatSecret → USDA FDC fallback

import {
    FatSecretFood,
    getFoodDetail,
    getBestServing,
    isFatSecretConfigured,
    NormalizedNutrition,
    normalizeServing,
    scoreFatSecretResult,
    searchFoods,
} from './fatsecret.ts';

/**
 * Food category for better matching
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
 * Detected item from Gemini with portion info
 */
export interface DetectedItem {
    name: string;
    synonyms?: string[];
    category: FoodCategory;
    portion: {
        estimate_type: 'none' | 'qualitative' | 'volume_ml' | 'weight_g';
        value: number | null;
        unit: string;
        confidence: number;
    };
    confidence: number;
}

/**
 * Result of nutrition lookup
 */
export interface NutritionLookupResult {
    item_id: string;
    name: string;
    category: FoodCategory;
    portion: DetectedItem['portion'];
    detection_confidence: number;

    // Nutrition data
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

    // Matched food details
    matched_food_name?: string;
    matched_food_brand?: string;
    serving_description?: string;
}

// USDA FDC nutrient ID mappings
const FDC_NUTRIENT_IDS = {
    ENERGY: [1008, 2047, 2048],
    CARBS: [1005, 2039],
    PROTEIN: [1003],
    FAT: [1004],
    FIBER: [1079, 2033],
    SUGAR: [2000, 1063],
    SODIUM: [1093],
};

/**
 * Find nutrient value from FDC nutrients array
 */
function findFdcNutrient(nutrients: any[], ids: number[]): number | null {
    for (const id of ids) {
        const nutrient = nutrients?.find((n: any) => n.nutrientId === id);
        if (nutrient && nutrient.value !== undefined) {
            return Math.round(nutrient.value * 10) / 10;
        }
    }
    return null;
}

/**
 * Search USDA FDC for a food
 */
async function searchUsdaFdc(
    query: string,
    pageSize: number = 10
): Promise<Array<{
    fdcId: string;
    description: string;
    brandOwner?: string;
    nutrition: NormalizedNutrition;
    score: number;
}>> {
    const apiKey = Deno.env.get('FDC_API_KEY');
    if (!apiKey) {
        console.warn('FDC_API_KEY not configured');
        return [];
    }

    const searchUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`;

    try {
        const response = await fetch(searchUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query,
                pageSize: Math.min(pageSize, 50),
                dataType: ['Foundation', 'SR Legacy', 'Branded'],
            }),
        });

        if (!response.ok) {
            console.error('FDC API error:', response.status);
            return [];
        }

        const data = await response.json();
        const foods = data.foods || [];

        return foods.map((food: any) => {
            const nutrients = food.foodNutrients || [];

            let calories = findFdcNutrient(nutrients, FDC_NUTRIENT_IDS.ENERGY);
            const carbs = findFdcNutrient(nutrients, FDC_NUTRIENT_IDS.CARBS);
            const protein = findFdcNutrient(nutrients, FDC_NUTRIENT_IDS.PROTEIN);
            const fat = findFdcNutrient(nutrients, FDC_NUTRIENT_IDS.FAT);

            // Calculate calories from macros if missing
            if (calories === null && (carbs !== null || protein !== null || fat !== null)) {
                calories = Math.round(((carbs || 0) * 4) + ((protein || 0) * 4) + ((fat || 0) * 9));
            }

            const nutrition: NormalizedNutrition = {
                calories,
                carbs_g: carbs,
                protein_g: protein,
                fat_g: fat,
                fibre_g: findFdcNutrient(nutrients, FDC_NUTRIENT_IDS.FIBER),
                sugar_g: findFdcNutrient(nutrients, FDC_NUTRIENT_IDS.SUGAR),
                sodium_mg: findFdcNutrient(nutrients, FDC_NUTRIENT_IDS.SODIUM),
                serving_description: food.servingSize ? `${food.servingSize} ${food.servingSizeUnit || 'g'}` : '100g',
                serving_amount: food.servingSize || 100,
                serving_unit: food.servingSizeUnit || 'g',
            };

            // Calculate match score
            const score = scoreUsdaResult(food, query, nutrition);

            return {
                fdcId: String(food.fdcId),
                description: food.description || food.lowercaseDescription || 'Unknown',
                brandOwner: food.brandOwner || food.brandName,
                nutrition,
                score,
            };
        });
    } catch (error) {
        console.error('USDA FDC search failed:', error);
        return [];
    }
}

/**
 * Score a USDA FDC result for ranking
 */
function scoreUsdaResult(
    food: any,
    query: string,
    nutrition: NormalizedNutrition
): number {
    let score = 0;
    const queryLower = query.toLowerCase().trim();
    const nameLower = (food.description || '').toLowerCase();

    // Exact name match: +100
    if (nameLower === queryLower) {
        score += 100;
    }
    // Name contains query: +50
    else if (nameLower.includes(queryLower)) {
        score += 50;
    }
    // Query contains name: +40
    else if (queryLower.includes(nameLower)) {
        score += 40;
    }

    // Token overlap: +10 per matching token
    const queryTokens = queryLower.split(/\s+/);
    const nameTokens = nameLower.split(/\s+/);
    for (const qt of queryTokens) {
        if (qt.length > 2 && nameTokens.some((nt: string) => nt.includes(qt) || qt.includes(nt))) {
            score += 10;
        }
    }

    // Complete nutrition data: +20
    const hasCompleteData = nutrition.calories !== null &&
        nutrition.carbs_g !== null &&
        nutrition.protein_g !== null &&
        nutrition.fat_g !== null;
    if (hasCompleteData) {
        score += 20;
    }

    // Branded item: +5
    if (food.brandOwner || food.brandName) {
        score += 5;
    }

    // Short name preference: +10
    if ((food.description || '').length < 40) {
        score += 10;
    }

    // Foundation/SR Legacy data type bonus: +15 (more reliable)
    if (food.dataType === 'Foundation' || food.dataType === 'SR Legacy') {
        score += 15;
    }

    return score;
}

/**
 * Normalize query for cache key
 */
export function normalizeQueryKey(query: string, category?: FoodCategory): string {
    return `${query.toLowerCase().trim().replace(/\s+/g, '_')}${category ? `_${category}` : ''}`;
}

/**
 * Look up nutrition for a detected item
 * Pipeline: FatSecret → USDA FDC fallback
 */
export async function lookupNutrition(
    item: DetectedItem,
    itemId: string
): Promise<NutritionLookupResult> {
    const baseResult: NutritionLookupResult = {
        item_id: itemId,
        name: item.name,
        category: item.category,
        portion: item.portion,
        detection_confidence: item.confidence,
        nutrition: null,
        nutrition_source: 'fallback_estimate',
        nutrition_confidence: 0,
    };

    const queriesToTry = [item.name];
    if (item.synonyms && item.synonyms.length > 0) {
        queriesToTry.push(...item.synonyms.slice(0, 2));
    }

    // Try FatSecret first
    if (isFatSecretConfigured()) {
        for (const query of queriesToTry) {
            try {
                const fsResults = await searchFoods(query, 10);

                if (fsResults.length > 0) {
                    // Score and rank results
                    const scoredResults: Array<{ food: FatSecretFood; score: number }> = [];

                    for (const food of fsResults) {
                        const detail = await getFoodDetail(food.food_id);
                        const serving = detail ? getBestServing(detail) : null;
                        const nutrition = serving ? normalizeServing(serving) : undefined;
                        const score = scoreFatSecretResult(food, query, nutrition);
                        scoredResults.push({ food, score });
                    }

                    // Sort by score descending
                    scoredResults.sort((a, b) => b.score - a.score);

                    // Check if best match is good enough (score >= 70)
                    const best = scoredResults[0];
                    if (best && best.score >= 70) {
                        const detail = await getFoodDetail(best.food.food_id);
                        if (detail) {
                            const serving = getBestServing(detail);
                            if (serving) {
                                const nutrition = normalizeServing(serving);

                                return {
                                    ...baseResult,
                                    nutrition: {
                                        calories: nutrition.calories,
                                        carbs_g: nutrition.carbs_g,
                                        protein_g: nutrition.protein_g,
                                        fat_g: nutrition.fat_g,
                                        fibre_g: nutrition.fibre_g,
                                        sugar_g: nutrition.sugar_g,
                                        sodium_mg: nutrition.sodium_mg,
                                    },
                                    nutrition_source: 'fatsecret',
                                    nutrition_confidence: Math.min(best.score / 100, 0.95),
                                    matched_food_name: best.food.food_name,
                                    matched_food_brand: best.food.brand_name,
                                    serving_description: nutrition.serving_description,
                                };
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('FatSecret lookup error:', error);
            }
        }
    }

    // Fallback to USDA FDC
    for (const query of queriesToTry) {
        try {
            const usdaResults = await searchUsdaFdc(query, 10);

            if (usdaResults.length > 0) {
                // Sort by score descending
                usdaResults.sort((a, b) => b.score - a.score);

                // Check if best match is acceptable (score >= 50)
                const best = usdaResults[0];
                if (best && best.score >= 50) {
                    return {
                        ...baseResult,
                        nutrition: {
                            calories: best.nutrition.calories,
                            carbs_g: best.nutrition.carbs_g,
                            protein_g: best.nutrition.protein_g,
                            fat_g: best.nutrition.fat_g,
                            fibre_g: best.nutrition.fibre_g,
                            sugar_g: best.nutrition.sugar_g,
                            sodium_mg: best.nutrition.sodium_mg,
                        },
                        nutrition_source: 'usda_fdc',
                        nutrition_confidence: Math.min(best.score / 100, 0.9),
                        matched_food_name: best.description,
                        matched_food_brand: best.brandOwner,
                        serving_description: best.nutrition.serving_description,
                    };
                }
            }
        } catch (error) {
            console.error('USDA FDC lookup error:', error);
        }
    }

    // No matches found - return with fallback estimates
    return {
        ...baseResult,
        nutrition: getFallbackEstimate(item.name, item.category),
        nutrition_source: 'fallback_estimate',
        nutrition_confidence: 0.3,
    };
}

/**
 * Get fallback nutrition estimate based on category
 */
function getFallbackEstimate(
    name: string,
    category: FoodCategory
): NutritionLookupResult['nutrition'] {
    // Common foods reference values (per serving)
    const commonFoods: Record<string, NutritionLookupResult['nutrition']> = {
        'apple': { calories: 95, carbs_g: 25, protein_g: 0.5, fat_g: 0.3, fibre_g: 4.4, sugar_g: 19, sodium_mg: 2 },
        'banana': { calories: 105, carbs_g: 27, protein_g: 1.3, fat_g: 0.4, fibre_g: 3.1, sugar_g: 14, sodium_mg: 1 },
        'orange': { calories: 62, carbs_g: 15, protein_g: 1.2, fat_g: 0.2, fibre_g: 3.1, sugar_g: 12, sodium_mg: 0 },
        'chicken breast': { calories: 165, carbs_g: 0, protein_g: 31, fat_g: 3.6, fibre_g: 0, sugar_g: 0, sodium_mg: 74 },
        'rice': { calories: 205, carbs_g: 45, protein_g: 4.3, fat_g: 0.4, fibre_g: 0.6, sugar_g: 0, sodium_mg: 2 },
        'bread': { calories: 79, carbs_g: 15, protein_g: 2.7, fat_g: 1, fibre_g: 0.6, sugar_g: 1.4, sodium_mg: 147 },
        'egg': { calories: 78, carbs_g: 0.6, protein_g: 6, fat_g: 5, fibre_g: 0, sugar_g: 0.6, sodium_mg: 62 },
        'milk': { calories: 149, carbs_g: 12, protein_g: 8, fat_g: 8, fibre_g: 0, sugar_g: 12, sodium_mg: 105 },
        'salad': { calories: 20, carbs_g: 3.5, protein_g: 1.5, fat_g: 0.2, fibre_g: 2, sugar_g: 1.5, sodium_mg: 20 },
    };

    // Check common foods
    const nameLower = name.toLowerCase();
    for (const [food, nutrition] of Object.entries(commonFoods)) {
        if (nameLower.includes(food)) {
            return nutrition;
        }
    }

    // Category-based defaults
    const categoryDefaults: Record<FoodCategory, NutritionLookupResult['nutrition']> = {
        fruit: { calories: 60, carbs_g: 15, protein_g: 1, fat_g: 0.3, fibre_g: 2.5, sugar_g: 12, sodium_mg: 1 },
        vegetable: { calories: 30, carbs_g: 6, protein_g: 2, fat_g: 0.3, fibre_g: 2, sugar_g: 2, sodium_mg: 30 },
        protein: { calories: 180, carbs_g: 0, protein_g: 25, fat_g: 8, fibre_g: 0, sugar_g: 0, sodium_mg: 70 },
        grain: { calories: 150, carbs_g: 30, protein_g: 4, fat_g: 1, fibre_g: 2, sugar_g: 1, sodium_mg: 100 },
        dairy: { calories: 120, carbs_g: 10, protein_g: 8, fat_g: 6, fibre_g: 0, sugar_g: 8, sodium_mg: 80 },
        beverage: { calories: 100, carbs_g: 25, protein_g: 0, fat_g: 0, fibre_g: 0, sugar_g: 20, sodium_mg: 10 },
        snack: { calories: 150, carbs_g: 20, protein_g: 2, fat_g: 7, fibre_g: 1, sugar_g: 8, sodium_mg: 150 },
        dessert: { calories: 200, carbs_g: 30, protein_g: 3, fat_g: 8, fibre_g: 1, sugar_g: 20, sodium_mg: 100 },
        prepared_meal: { calories: 400, carbs_g: 45, protein_g: 20, fat_g: 15, fibre_g: 4, sugar_g: 5, sodium_mg: 600 },
        other: { calories: 150, carbs_g: 20, protein_g: 5, fat_g: 6, fibre_g: 2, sugar_g: 5, sodium_mg: 200 },
    };

    return categoryDefaults[category] || categoryDefaults.other;
}

/**
 * Look up nutrition for multiple detected items in parallel
 */
export async function lookupNutritionBatch(
    items: DetectedItem[]
): Promise<NutritionLookupResult[]> {
    const results = await Promise.all(
        items.map((item, index) =>
            lookupNutrition(item, `item_${index}_${Date.now()}`)
        )
    );

    return results;
}
