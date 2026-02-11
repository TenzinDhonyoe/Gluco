// supabase/functions/food-search/index.ts
// Edge Function for searching foods using USDA FoodData Central + Open Food Facts APIs
// Supports batched variant searches in a single call for reduced network round trips

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireUser } from '../_shared/auth.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || Deno.env.get('SUPABASE_URL') || '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Nutrient ID mappings for USDA FDC
const NUTRIENT_IDS = {
    ENERGY: [1008, 2047, 2048],
    CARBS: [1005, 2039],
    PROTEIN: [1003],
    FAT: [1004],
    FIBER: [1079, 2033],
    SUGAR: [2000, 1063],
    SODIUM: [1093],
};

// Max concurrent searches per request
const MAX_CONCURRENCY = 2;  // Reduced from 3 for faster response

// Fetch timeout for external API calls (ms)
const FETCH_TIMEOUT_MS = 2000;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 50;
const MAX_VARIANTS = 8;
const MAX_QUERY_LENGTH = 120;

interface NormalizedFood {
    provider: 'fdc' | 'off';
    external_id: string;
    display_name: string;
    brand: string | null;
    serving_size: number | null;
    serving_unit: string | null;
    calories_kcal: number | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    fibre_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
    categories?: string | null;
}

function getServiceRoleClient() {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    return createClient(supabaseUrl, supabaseKey);
}

// =============== FDC (USDA) Helpers ===============

function findNutrient(nutrients: any[], ids: number[]): number | null {
    for (const id of ids) {
        const nutrient = nutrients?.find((n: any) => n.nutrientId === id);
        if (nutrient && nutrient.value !== undefined) {
            return Math.round(nutrient.value * 10) / 10;
        }
    }
    return null;
}

function normalizeFdcFood(food: any): NormalizedFood {
    const nutrients = food.foodNutrients || [];

    let calories = findNutrient(nutrients, NUTRIENT_IDS.ENERGY);
    const carbs = findNutrient(nutrients, NUTRIENT_IDS.CARBS);
    const protein = findNutrient(nutrients, NUTRIENT_IDS.PROTEIN);
    const fat = findNutrient(nutrients, NUTRIENT_IDS.FAT);

    if (calories === null && (carbs !== null || protein !== null || fat !== null)) {
        calories = Math.round(
            ((carbs || 0) * 4) + ((protein || 0) * 4) + ((fat || 0) * 9)
        );
    }

    return {
        provider: 'fdc',
        external_id: String(food.fdcId),
        display_name: food.description || food.lowercaseDescription || 'Unknown',
        brand: food.brandOwner || food.brandName || null,
        serving_size: food.servingSize || null,
        serving_unit: food.servingSizeUnit || null,
        calories_kcal: calories,
        carbs_g: carbs,
        protein_g: protein,
        fat_g: fat,
        fibre_g: findNutrient(nutrients, NUTRIENT_IDS.FIBER),
        sugar_g: findNutrient(nutrients, NUTRIENT_IDS.SUGAR),
        sodium_mg: findNutrient(nutrients, NUTRIENT_IDS.SODIUM),
        categories: food.foodCategory || null,
    };
}

async function searchFdc(query: string, pageSize: number, apiKey: string): Promise<NormalizedFood[]> {
    const searchUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(searchUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query,
                pageSize: Math.min(pageSize, 50),
                dataType: ['Foundation', 'SR Legacy', 'Branded'],
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            console.error('FDC API error:', response.status);
            return [];
        }

        const data = await response.json();
        return (data.foods || []).map(normalizeFdcFood);
    } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.warn('FDC search timed out');
        } else {
            console.error('FDC search failed:', error);
        }
        return [];
    } finally {
        clearTimeout(timeoutId);
    }
}

// =============== Open Food Facts Helpers ===============

function normalizeOffFood(product: any): NormalizedFood | null {
    if (!product || !product.code) return null;

    const nutriments = product.nutriments || {};
    const productName = product.product_name || product.product_name_en || '';

    if (!productName) return null;

    return {
        provider: 'off',
        external_id: String(product.code),
        display_name: productName,
        brand: product.brands || null,
        serving_size: nutriments.serving_size ? parseFloat(nutriments.serving_size) : null,
        serving_unit: 'g',
        calories_kcal: nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal'] ?? null,
        carbs_g: nutriments.carbohydrates_100g ?? nutriments.carbohydrates ?? null,
        protein_g: nutriments.proteins_100g ?? nutriments.proteins ?? null,
        fat_g: nutriments.fat_100g ?? nutriments.fat ?? null,
        fibre_g: nutriments.fiber_100g ?? nutriments.fiber ?? null,
        sugar_g: nutriments.sugars_100g ?? nutriments.sugars ?? null,
        sodium_mg: nutriments.sodium_100g ? nutriments.sodium_100g * 1000 : null,
        categories: product.categories || null,
    };
}

async function searchOff(query: string, pageSize: number): Promise<NormalizedFood[]> {
    // Open Food Facts search API
    const searchUrl = new URL('https://world.openfoodfacts.org/cgi/search.pl');
    searchUrl.searchParams.set('search_terms', query);
    searchUrl.searchParams.set('search_simple', '1');
    searchUrl.searchParams.set('action', 'process');
    searchUrl.searchParams.set('json', '1');
    searchUrl.searchParams.set('page_size', String(Math.min(pageSize, 50)));
    searchUrl.searchParams.set('fields', 'code,product_name,product_name_en,brands,categories,nutriments');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(searchUrl.toString(), {
            headers: {
                'User-Agent': 'GlucoFigma/1.0 (food logging app)',
            },
            signal: controller.signal,
        });

        if (!response.ok) {
            console.error('OFF API error:', response.status);
            return [];
        }

        const data = await response.json();
        const products = data.products || [];

        return products
            .map(normalizeOffFood)
            .filter((food: NormalizedFood | null): food is NormalizedFood => food !== null);
    } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.warn('OFF search timed out');
        } else {
            console.error('OFF search failed:', error);
        }
        return [];
    } finally {
        clearTimeout(timeoutId);
    }
}

// =============== Search Both Providers ===============

async function searchBothProviders(
    query: string,
    pageSize: number,
    fdcApiKey: string | undefined
): Promise<NormalizedFood[]> {
    // Skip OFF for very short queries (<=3 chars) - reduces latency on initial keystrokes
    const skipOff = query.trim().length <= 3;
    const perProvider = skipOff ? pageSize : Math.ceil(pageSize / 2);

    const [fdcResults, offResults] = await Promise.all([
        fdcApiKey ? searchFdc(query, perProvider, fdcApiKey) : Promise.resolve([]),
        skipOff ? Promise.resolve([]) : searchOff(query, perProvider),
    ]);

    return [...fdcResults, ...offResults];
}

// =============== Deduplication ===============

function dedupeResults(results: NormalizedFood[]): NormalizedFood[] {
    const seen = new Set<string>();
    const deduped: NormalizedFood[] = [];

    for (const food of results) {
        // Create unique key from provider + external_id
        const key = `${food.provider}-${food.external_id}`;
        if (!seen.has(key)) {
            seen.add(key);
            deduped.push(food);
        }
    }

    return deduped;
}

// =============== Concurrent Search with Variants ===============

async function searchWithVariants(
    mainQuery: string,
    variants: string[],
    pageSize: number,
    fdcApiKey: string | undefined
): Promise<NormalizedFood[]> {
    // Build all unique queries to search
    const allQueries = [mainQuery];
    for (const variant of variants) {
        if (variant && variant !== mainQuery && !allQueries.includes(variant)) {
            allQueries.push(variant);
        }
    }

    // Limit total queries
    const queriesToSearch = allQueries.slice(0, 4);

    // Calculate page size per query (main gets more)
    const mainSize = Math.ceil(pageSize * 0.6);
    const variantSize = Math.ceil((pageSize * 0.4) / Math.max(1, queriesToSearch.length - 1));

    // Search with concurrency limit
    const results: NormalizedFood[] = [];

    for (let i = 0; i < queriesToSearch.length; i += MAX_CONCURRENCY) {
        const batch = queriesToSearch.slice(i, i + MAX_CONCURRENCY);

        const batchPromises = batch.map((query, batchIndex) => {
            const size = i === 0 && batchIndex === 0 ? mainSize : variantSize;
            return searchBothProviders(query, size, fdcApiKey);
        });

        const batchResults = await Promise.allSettled(batchPromises);

        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                results.push(...result.value);
            }
        }
    }

    // Dedupe results
    return dedupeResults(results);
}

// =============== Main Handler ===============

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabase = getServiceRoleClient();
        const { errorResponse } = await requireUser(req, supabase, corsHeaders);
        if (errorResponse) return errorResponse;

        const { query, pageSize = 25, variants = [] } = await req.json();

        if (!query || typeof query !== 'string') {
            return new Response(
                JSON.stringify({ error: 'Missing or invalid query parameter' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const normalizedQuery = query.trim();
        if (normalizedQuery.length < 2 || normalizedQuery.length > MAX_QUERY_LENGTH) {
            return new Response(
                JSON.stringify({ error: `Query length must be 2-${MAX_QUERY_LENGTH} characters` }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const parsedPageSize = Number(pageSize);
        if (!Number.isFinite(parsedPageSize) || parsedPageSize < MIN_PAGE_SIZE || parsedPageSize > MAX_PAGE_SIZE) {
            return new Response(
                JSON.stringify({ error: `pageSize must be between ${MIN_PAGE_SIZE} and ${MAX_PAGE_SIZE}` }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const fdcApiKey = Deno.env.get('FDC_API_KEY');

        // Check if variants are provided
        const variantsArray = Array.isArray(variants) ? variants : [];
        if (variantsArray.length > MAX_VARIANTS) {
            return new Response(
                JSON.stringify({ error: `Too many variants. Max allowed is ${MAX_VARIANTS}` }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        let results: NormalizedFood[];

        if (variantsArray.length > 0) {
            // Use batched search with variants
            const safeVariants = variantsArray
                .filter((variant) => typeof variant === 'string')
                .map((variant: string) => variant.trim())
                .filter((variant: string) => variant.length > 0 && variant.length <= MAX_QUERY_LENGTH);

            results = await searchWithVariants(normalizedQuery, safeVariants, parsedPageSize, fdcApiKey);
        } else {
            // Single query search (backward compatible)
            results = await searchBothProviders(normalizedQuery, parsedPageSize, fdcApiKey);
        }

        return new Response(
            JSON.stringify({
                results,
                totalHits: results.length,
                query: normalizedQuery,
                variantsUsed: variantsArray.length > 0,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Food search error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
