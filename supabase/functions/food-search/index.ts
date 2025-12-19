// supabase/functions/food-search/index.ts
// Edge Function for searching foods using USDA FoodData Central + Open Food Facts APIs

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
        return (data.foods || []).map(normalizeFdcFood);
    } catch (error) {
        console.error('FDC search failed:', error);
        return [];
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

    try {
        const response = await fetch(searchUrl.toString(), {
            headers: {
                'User-Agent': 'GlucoFigma/1.0 (food logging app)',
            },
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
    } catch (error) {
        console.error('OFF search failed:', error);
        return [];
    }
}

// =============== Main Handler ===============

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { query, pageSize = 25 } = await req.json();

        if (!query || typeof query !== 'string') {
            return new Response(
                JSON.stringify({ error: 'Missing or invalid query parameter' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const fdcApiKey = Deno.env.get('FDC_API_KEY');

        // Run both providers in parallel
        const perProvider = Math.ceil(pageSize / 2);

        const [fdcResults, offResults] = await Promise.all([
            fdcApiKey ? searchFdc(query, perProvider, fdcApiKey) : Promise.resolve([]),
            searchOff(query, perProvider),
        ]);

        // Merge results - FDC first, then OFF
        const results: NormalizedFood[] = [...fdcResults, ...offResults];

        return new Response(
            JSON.stringify({
                results,
                totalHits: results.length,
                providers: {
                    fdc: fdcResults.length,
                    off: offResults.length,
                },
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
