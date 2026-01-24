// supabase/functions/_shared/fatsecret.ts
// FatSecret API client with OAuth 2.0 client credentials flow

/**
 * OAuth 2.0 token response from FatSecret
 */
interface OAuthTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

/**
 * FatSecret food search result
 */
export interface FatSecretFood {
    food_id: string;
    food_name: string;
    food_type: 'Generic' | 'Brand';
    brand_name?: string;
    food_url?: string;
    food_description: string;
}

/**
 * Detailed nutrition serving from FatSecret
 */
export interface FatSecretServing {
    serving_id: string;
    serving_description: string;
    serving_url?: string;
    metric_serving_amount?: string;
    metric_serving_unit?: string;
    number_of_units?: string;
    measurement_description?: string;
    calories?: string;
    carbohydrate?: string;
    protein?: string;
    fat?: string;
    saturated_fat?: string;
    polyunsaturated_fat?: string;
    monounsaturated_fat?: string;
    cholesterol?: string;
    sodium?: string;
    potassium?: string;
    fiber?: string;
    sugar?: string;
    vitamin_a?: string;
    vitamin_c?: string;
    calcium?: string;
    iron?: string;
}

/**
 * Detailed food response from FatSecret
 */
export interface FatSecretFoodDetail {
    food_id: string;
    food_name: string;
    food_type: string;
    brand_name?: string;
    food_url?: string;
    servings: {
        serving: FatSecretServing | FatSecretServing[];
    };
}

/**
 * Normalized nutrition data from FatSecret
 */
export interface NormalizedNutrition {
    calories: number | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    fibre_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
    serving_description: string;
    serving_amount: number | null;
    serving_unit: string | null;
}

// Token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get OAuth 2.0 access token using client credentials flow
 */
async function getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
        return cachedToken.token;
    }

    const clientId = Deno.env.get('FATSECRET_CLIENT_ID');
    const clientSecret = Deno.env.get('FATSECRET_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
        throw new Error('FatSecret credentials not configured');
    }

    const credentials = btoa(`${clientId}:${clientSecret}`);

    const response = await fetch('https://oauth.fatsecret.com/connect/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials&scope=basic',
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('FatSecret OAuth failed:', response.status, errorText);
        throw new Error(`FatSecret OAuth failed: ${response.status}`);
    }

    const data: OAuthTokenResponse = await response.json();

    // Cache the token
    cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in * 1000),
    };

    return data.access_token;
}

/**
 * Make an authenticated request to FatSecret API
 */
async function fatSecretRequest<T>(
    method: string,
    params: Record<string, string> = {}
): Promise<T> {
    const token = await getAccessToken();

    const url = new URL('https://platform.fatsecret.com/rest/server.api');
    url.searchParams.set('method', method);
    url.searchParams.set('format', 'json');

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('FatSecret API error:', response.status, errorText);
        throw new Error(`FatSecret API error: ${response.status}`);
    }

    return response.json();
}

/**
 * Search for foods by name
 */
export async function searchFoods(
    query: string,
    maxResults: number = 20,
    pageNumber: number = 0
): Promise<FatSecretFood[]> {
    interface SearchResponse {
        foods?: {
            food?: FatSecretFood | FatSecretFood[];
            max_results?: string;
            total_results?: string;
            page_number?: string;
        };
        error?: {
            code: number;
            message: string;
        };
    }

    const response = await fatSecretRequest<SearchResponse>('foods.search', {
        search_expression: query,
        max_results: maxResults.toString(),
        page_number: pageNumber.toString(),
    });

    if (response.error) {
        console.error('FatSecret search error:', response.error);
        return [];
    }

    if (!response.foods?.food) {
        return [];
    }

    // API returns single object if only one result, array if multiple
    const foods = Array.isArray(response.foods.food)
        ? response.foods.food
        : [response.foods.food];

    return foods;
}

/**
 * Get detailed food information including nutrition
 */
export async function getFoodDetail(foodId: string): Promise<FatSecretFoodDetail | null> {
    interface FoodDetailResponse {
        food?: FatSecretFoodDetail;
        error?: {
            code: number;
            message: string;
        };
    }

    const response = await fatSecretRequest<FoodDetailResponse>('food.get.v2', {
        food_id: foodId,
    });

    if (response.error) {
        console.error('FatSecret food detail error:', response.error);
        return null;
    }

    return response.food || null;
}

/**
 * Parse a numeric string value, returning null if invalid
 */
function parseNumeric(value: string | undefined): number | null {
    if (!value) return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
}

/**
 * Normalize a FatSecret serving to standard nutrition format
 */
export function normalizeServing(serving: FatSecretServing): NormalizedNutrition {
    return {
        calories: parseNumeric(serving.calories),
        carbs_g: parseNumeric(serving.carbohydrate),
        protein_g: parseNumeric(serving.protein),
        fat_g: parseNumeric(serving.fat),
        fibre_g: parseNumeric(serving.fiber),
        sugar_g: parseNumeric(serving.sugar),
        sodium_mg: parseNumeric(serving.sodium),
        serving_description: serving.serving_description || 'serving',
        serving_amount: parseNumeric(serving.metric_serving_amount),
        serving_unit: serving.metric_serving_unit || null,
    };
}

/**
 * Get the best serving from a food detail (prefer "per 100g" or first available)
 */
export function getBestServing(detail: FatSecretFoodDetail): FatSecretServing | null {
    if (!detail.servings?.serving) {
        return null;
    }

    const servings = Array.isArray(detail.servings.serving)
        ? detail.servings.serving
        : [detail.servings.serving];

    if (servings.length === 0) {
        return null;
    }

    // Prefer "per 100g" serving if available (more standardized)
    const per100g = servings.find(s =>
        s.serving_description?.toLowerCase().includes('100g') ||
        s.metric_serving_amount === '100' && s.metric_serving_unit?.toLowerCase() === 'g'
    );

    if (per100g) {
        return per100g;
    }

    // Otherwise return the first serving
    return servings[0];
}

/**
 * Search and get nutrition for a food query
 * Returns the best match with full nutrition data
 */
export async function searchFoodWithNutrition(
    query: string
): Promise<{ food: FatSecretFood; nutrition: NormalizedNutrition } | null> {
    const foods = await searchFoods(query, 5);

    if (foods.length === 0) {
        return null;
    }

    // Get detail for first (best) match
    const detail = await getFoodDetail(foods[0].food_id);

    if (!detail) {
        return null;
    }

    const serving = getBestServing(detail);

    if (!serving) {
        return null;
    }

    return {
        food: foods[0],
        nutrition: normalizeServing(serving),
    };
}

/**
 * Score a FatSecret result for ranking
 * Higher score = better match
 */
export function scoreFatSecretResult(
    food: FatSecretFood,
    query: string,
    nutrition?: NormalizedNutrition
): number {
    let score = 0;
    const queryLower = query.toLowerCase().trim();
    const nameLower = food.food_name.toLowerCase();

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
        if (qt.length > 2 && nameTokens.some(nt => nt.includes(qt) || qt.includes(nt))) {
            score += 10;
        }
    }

    // Complete nutrition data: +20
    if (nutrition) {
        const hasCompleteData = nutrition.calories !== null &&
            nutrition.carbs_g !== null &&
            nutrition.protein_g !== null &&
            nutrition.fat_g !== null;
        if (hasCompleteData) {
            score += 20;
        }
    }

    // Branded item: +5 (more specific)
    if (food.food_type === 'Brand') {
        score += 5;
    }

    // Short name preference: +10 (less noise)
    if (food.food_name.length < 30) {
        score += 10;
    }

    // Penalty for supplement patterns: -30
    const supplementPatterns = ['supplement', 'vitamin', 'capsule', 'tablet', 'powder', 'pill'];
    if (supplementPatterns.some(p => nameLower.includes(p))) {
        score -= 30;
    }

    return score;
}

/**
 * Check if FatSecret credentials are configured
 */
export function isFatSecretConfigured(): boolean {
    return !!(Deno.env.get('FATSECRET_CLIENT_ID') && Deno.env.get('FATSECRET_CLIENT_SECRET'));
}
