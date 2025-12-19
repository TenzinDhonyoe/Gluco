// supabase/functions/food-barcode/index.ts
// Edge Function for looking up food by barcode using Open Food Facts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { barcode } = await req.json();

        if (!barcode || typeof barcode !== 'string') {
            return new Response(
                JSON.stringify({ error: 'Missing or invalid barcode' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Call Open Food Facts API
        const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,nutriments,serving_size,nutrition_data_per,image_url`;

        const response = await fetch(url);
        if (!response.ok) {
            return new Response(
                JSON.stringify({ error: 'Barcode lookup service unavailable' }),
                { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const data = await response.json();

        if (data.status !== 1 || !data.product) {
            return new Response(
                JSON.stringify({ error: 'Product not found', barcode }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
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

        const food: NormalizedFood = {
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

        // Cache the result
        try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseKey);

            await supabase.from('foods_cache').upsert({
                provider: 'off',
                external_id: barcode,
                normalized: food,
                last_fetched_at: new Date().toISOString(),
            }, { onConflict: 'provider,external_id' });
        } catch (cacheError) {
            console.error('Cache upsert failed:', cacheError);
        }

        return new Response(
            JSON.stringify({ food }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Barcode lookup error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
