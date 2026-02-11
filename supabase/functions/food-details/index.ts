// supabase/functions/food-details/index.ts
// Edge Function for fetching detailed food info from FDC or Open Food Facts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUser } from '../_shared/auth.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || Deno.env.get('SUPABASE_URL') || '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getServiceRoleClient() {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    return createClient(supabaseUrl, supabaseKey);
}

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
    per_100g?: {
        calories_kcal: number | null;
        carbs_g: number | null;
        protein_g: number | null;
        fat_g: number | null;
    };
}

function findNutrient(nutrients: any[], ids: number[]): number | null {
    for (const id of ids) {
        const nutrient = nutrients?.find((n: any) => n.nutrient?.id === id || n.nutrientId === id);
        if (nutrient && (nutrient.amount !== undefined || nutrient.value !== undefined)) {
            return Math.round((nutrient.amount ?? nutrient.value) * 10) / 10;
        }
    }
    return null;
}

async function fetchFDCFood(fdcId: string, apiKey: string): Promise<NormalizedFood | null> {
    const url = `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
        console.error('FDC API error:', response.status);
        return null;
    }

    const food = await response.json();
    const nutrients = food.foodNutrients || [];

    let calories = findNutrient(nutrients, NUTRIENT_IDS.ENERGY);
    const carbs = findNutrient(nutrients, NUTRIENT_IDS.CARBS);
    const protein = findNutrient(nutrients, NUTRIENT_IDS.PROTEIN);
    const fat = findNutrient(nutrients, NUTRIENT_IDS.FAT);

    if (calories === null && (carbs !== null || protein !== null || fat !== null)) {
        calories = Math.round(((carbs || 0) * 4) + ((protein || 0) * 4) + ((fat || 0) * 9));
    }

    return {
        provider: 'fdc',
        external_id: String(food.fdcId),
        display_name: food.description || 'Unknown',
        brand: food.brandOwner || food.brandName || null,
        serving_size: food.servingSize || 100,
        serving_unit: food.servingSizeUnit || 'g',
        calories_kcal: calories,
        carbs_g: carbs,
        protein_g: protein,
        fat_g: fat,
        fibre_g: findNutrient(nutrients, NUTRIENT_IDS.FIBER),
        sugar_g: findNutrient(nutrients, NUTRIENT_IDS.SUGAR),
        sodium_mg: findNutrient(nutrients, NUTRIENT_IDS.SODIUM),
        per_100g: { calories_kcal: calories, carbs_g: carbs, protein_g: protein, fat_g: fat },
    };
}

async function fetchOFFFood(barcode: string): Promise<NormalizedFood | null> {
    const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,nutriments,serving_size,nutrition_data_per`;

    const response = await fetch(url);
    if (!response.ok) {
        console.error('OFF API error:', response.status);
        return null;
    }

    const data = await response.json();
    if (data.status !== 1 || !data.product) {
        return null;
    }

    const product = data.product;
    const n = product.nutriments || {};

    // Parse serving size
    let servingSize: number | null = null;
    let servingUnit: string | null = null;
    if (product.serving_size) {
        const match = product.serving_size.match(/(\d+(?:\.\d+)?)\s*(\w+)?/);
        if (match) {
            servingSize = parseFloat(match[1]);
            servingUnit = match[2] || 'g';
        }
    }

    return {
        provider: 'off',
        external_id: barcode,
        display_name: product.product_name || 'Unknown Product',
        brand: product.brands || null,
        serving_size: servingSize,
        serving_unit: servingUnit,
        calories_kcal: n['energy-kcal_serving'] ?? n['energy-kcal_100g'] ?? null,
        carbs_g: n.carbohydrates_serving ?? n.carbohydrates_100g ?? null,
        protein_g: n.proteins_serving ?? n.proteins_100g ?? null,
        fat_g: n.fat_serving ?? n.fat_100g ?? null,
        fibre_g: n.fiber_serving ?? n.fiber_100g ?? null,
        sugar_g: n.sugars_serving ?? n.sugars_100g ?? null,
        sodium_mg: n.sodium_serving ? n.sodium_serving * 1000 : (n.sodium_100g ? n.sodium_100g * 1000 : null),
        per_100g: {
            calories_kcal: n['energy-kcal_100g'] ?? null,
            carbs_g: n.carbohydrates_100g ?? null,
            protein_g: n.proteins_100g ?? null,
            fat_g: n.fat_100g ?? null,
        },
    };
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabase = getServiceRoleClient();
        const { errorResponse } = await requireUser(req, supabase, corsHeaders);
        if (errorResponse) return errorResponse;

        const { provider, externalId } = await req.json();

        if (!provider || !externalId || typeof provider !== 'string' || typeof externalId !== 'string') {
            return new Response(
                JSON.stringify({ error: 'Missing provider or externalId' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const normalizedProvider = provider.trim().toLowerCase();
        const normalizedExternalId = externalId.trim();

        if (!normalizedExternalId || normalizedExternalId.length > 128) {
            return new Response(
                JSON.stringify({ error: 'Invalid externalId' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        let food: NormalizedFood | null = null;

        if (normalizedProvider === 'fdc') {
            const apiKey = Deno.env.get('FDC_API_KEY');
            if (!apiKey) {
                return new Response(
                    JSON.stringify({ error: 'FDC API key not configured' }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            food = await fetchFDCFood(normalizedExternalId, apiKey);
        } else if (normalizedProvider === 'off') {
            food = await fetchOFFFood(normalizedExternalId);
        } else {
            return new Response(
                JSON.stringify({ error: 'Invalid provider' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!food) {
            return new Response(
                JSON.stringify({ error: 'Food not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Cache the result
        try {
            await supabase.from('foods_cache').upsert({
                provider: food.provider,
                external_id: food.external_id,
                normalized: food,
                last_fetched_at: new Date().toISOString(),
            }, { onConflict: 'provider,external_id' });
        } catch (cacheError) {
            console.error('Cache upsert failed:', cacheError);
            // Don't fail the request if caching fails
        }

        return new Response(
            JSON.stringify({ food }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Food details error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
