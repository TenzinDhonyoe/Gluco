// supabase/functions/meal-photo-analyze/index.ts
// AI Photo Meal Analysis with Wellness Guardrails

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';
import { requireAiEnabled } from '../_shared/ai.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// TYPES
// ============================================

interface RequestBody {
    user_id: string;
    meal_id: string;
    photo_url: string;
    meal_time?: string;
    meal_type?: string;
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
        protein_g: number | null;
        fat_g: number | null;
        fibre_g: number | null;
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

// ============================================
// OPENAI CALL
// ============================================

async function analyzePhotoWithLLM(photoUrl: string, mealType?: string): Promise<AnalysisResult> {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
        throw new Error('OPENAI_API_KEY not set');
    }

    const systemPrompt = `You are a nutrition estimation assistant focused on general wellness.
    
CRITICAL RULES:
1. Estimate portion sizes and nutritional content based on the image.
2. Use ONLY wellness language (e.g., "energy", "nutrients", "fuel").
3. NEVER use medical/clinical terms (spike, risk, diabetes, insulin, treat, cure, etc.).
4. Do NOT make health claims.
5. If the image is unclear or not food, return an empty item list with a status of "failed".
6. Output MUST be valid JSON only.

OUTPUT FORMAT:
{
  "status": "complete",
  "disclaimer": "Estimates from a photo only. Edit to improve accuracy. Not medical advice.",
  "items": [
    {
      "display_name": "Grilled Salmon",
      "quantity": 1,
      "unit": "fillet",
      "confidence": "high",
      "nutrients": {
        "calories_kcal": 350,
        "carbs_g": 0,
        "protein_g": 35,
        "fat_g": 20,
        "fibre_g": 0,
        "sugar_g": 0,
        "sodium_mg": 150
      }
    }
  ],
  "totals": {
    "calories_kcal": 350,
    "carbs_g": 0,
    "protein_g": 35,
    "fat_g": 20,
    "fibre_g": 0
  }
}`;

    const userPrompt = `Analyze this food image${mealType ? ` (Meal Type: ${mealType})` : ''}.
    Provide a wellness-focused estimation of the items and nutrition.`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openaiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    {
                        role: 'user',
                        content: [
                            { type: "text", text: userPrompt },
                            { type: "image_url", image_url: { url: photoUrl } }
                        ]
                    },
                ],
                max_tokens: 800,
            }),
        });

        if (!response.ok) {
            console.error('OpenAI API error:', await response.text());
            throw new Error('Failed to analyze image');
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // Extract JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }

        const result = JSON.parse(jsonMatch[0]);

        // Validation & Safety Check
        if (result.items) {
            for (const item of result.items) {
                if (containsBannedTerms(item.display_name)) {
                    item.display_name = "Food Item"; // Redact banned term
                }
            }
        }

        return result;

    } catch (error) {
        console.error('LLM Analysis failed:', error);
        return {
            status: 'failed',
            disclaimer: "Could not analyze photo. Please add items manually.",
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
        const { user_id: requestedUserId, meal_id, photo_url, meal_time, meal_type } = body;

        if (!requestedUserId || !meal_id || !photo_url) {
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

        const aiBlocked = await requireAiEnabled(supabase, user.id, corsHeaders);
        if (aiBlocked) return aiBlocked;

        const userId = user.id;

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

        // Run Analysis
        const result = await analyzePhotoWithLLM(photo_url, meal_type);

        // Store result in DB
        const { error: dbError } = await supabase
            .from('meal_photo_analysis')
            .upsert({
                user_id: userId,
                meal_id,
                photo_path: photo_url, // Storing raw URL/path used for reference
                status: result.status,
                result: result, // Store the full JSON result
                model: 'gpt-4o-mini'
            }, { onConflict: 'meal_id' });

        if (dbError) {
            console.error('DB Update Error:', dbError);
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
