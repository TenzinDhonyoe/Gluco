// supabase/functions/meal-adjustments/index.ts
// Edge Function for generating personalized meal adjustments using Gemini AI

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';
import { isAiEnabled } from '../_shared/ai.ts';
import { sanitizeText } from '../_shared/safety.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// TYPES
// ============================================

interface MealItem {
    display_name: string;
    calories_kcal: number | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    fibre_g: number | null;
    sugar_g: number | null;
    quantity: number;
}

interface MealAdjustment {
    id: string;
    action: string;           // e.g., "Swap banana for berries"
    impact: string;           // e.g., "-12% Risk" or "+15% Energy"
    description: string;      // Detailed explanation
    priority: 'high' | 'medium' | 'low';
}

interface UserContext {
    trackingMode: string;
    coachingStyle: string | null;
    avgGlucose: number | null;
    glucoseSpikesCount: number;
    lowEnergyMealsCount: number;
    highCravingsMealsCount: number;
    avgFibrePerDay: number | null;
    recentMealPatterns: string[];
}

interface RequestBody {
    user_id: string;
    meal_items: MealItem[];
    meal_type?: string;
}

// ============================================
// USER CONTEXT FETCHING
// ============================================

async function fetchUserContext(supabase: any, userId: string): Promise<UserContext> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDate = sevenDaysAgo.toISOString();

    // Fetch user profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('tracking_mode, coaching_style')
        .eq('id', userId)
        .single();

    // Fetch glucose logs for spike detection
    const { data: glucoseLogs } = await supabase
        .from('glucose_logs')
        .select('glucose_level, logged_at, context')
        .eq('user_id', userId)
        .gte('logged_at', startDate);

    // Fetch meal check-ins for pattern detection
    const { data: checkins } = await supabase
        .from('meal_checkins')
        .select('energy, cravings, created_at')
        .eq('user_id', userId)
        .gte('created_at', startDate);

    // Fetch recent meals for fibre calculation
    const { data: meals } = await supabase
        .from('meals')
        .select('id')
        .eq('user_id', userId)
        .gte('logged_at', startDate);

    let totalFibre = 0;
    if (meals && meals.length > 0) {
        const mealIds = meals.map((m: any) => m.id);
        const { data: mealItems } = await supabase
            .from('meal_items')
            .select('quantity, nutrients')
            .in('meal_id', mealIds);

        (mealItems || []).forEach((item: any) => {
            const fibreG = item.nutrients?.fibre_g ?? 0;
            const quantity = item.quantity ?? 1;
            totalFibre += fibreG * quantity;
        });
    }

    // Calculate glucose stats
    const readings = glucoseLogs || [];
    const avgGlucose = readings.length > 0
        ? readings.reduce((sum: number, r: any) => sum + r.glucose_level, 0) / readings.length
        : null;

    // Count post-meal spikes (glucose > 10 within 2 hours of meal)
    const postMealReadings = readings.filter((r: any) => r.context === 'post_meal');
    const glucoseSpikesCount = postMealReadings.filter((r: any) => r.glucose_level > 10).length;

    // Calculate check-in patterns
    const checkinsData = checkins || [];
    const lowEnergyMealsCount = checkinsData.filter((c: any) => c.energy === 'low').length;
    const highCravingsMealsCount = checkinsData.filter((c: any) => c.cravings === 'high').length;

    // Identify patterns
    const recentMealPatterns: string[] = [];
    if (glucoseSpikesCount >= 3) recentMealPatterns.push('frequent glucose spikes after meals');
    if (lowEnergyMealsCount >= 3) recentMealPatterns.push('often feels low energy after eating');
    if (highCravingsMealsCount >= 3) recentMealPatterns.push('experiences strong cravings frequently');
    if (totalFibre / 7 < 20) recentMealPatterns.push('low fiber intake');

    return {
        trackingMode: profile?.tracking_mode || 'meals_wearables',
        coachingStyle: profile?.coaching_style || 'balanced',
        avgGlucose: avgGlucose ? Math.round(avgGlucose * 10) / 10 : null,
        glucoseSpikesCount,
        lowEnergyMealsCount,
        highCravingsMealsCount,
        avgFibrePerDay: meals && meals.length > 0 ? Math.round((totalFibre / 7) * 10) / 10 : null,
        recentMealPatterns,
    };
}

// ============================================
// AI GENERATION
// ============================================

async function generateAdjustmentsWithGemini(
    mealItems: MealItem[],
    mealType: string,
    context: UserContext
): Promise<MealAdjustment[]> {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
        console.log('GEMINI_API_KEY not configured, using fallback');
        return generateFallbackAdjustments(mealItems, context);
    }

    // Calculate meal totals
    const totals = mealItems.reduce((acc, item) => ({
        calories: acc.calories + ((item.calories_kcal ?? 0) * item.quantity),
        carbs: acc.carbs + ((item.carbs_g ?? 0) * item.quantity),
        protein: acc.protein + ((item.protein_g ?? 0) * item.quantity),
        fat: acc.fat + ((item.fat_g ?? 0) * item.quantity),
        fibre: acc.fibre + ((item.fibre_g ?? 0) * item.quantity),
        sugar: acc.sugar + ((item.sugar_g ?? 0) * item.quantity),
    }), { calories: 0, carbs: 0, protein: 0, fat: 0, fibre: 0, sugar: 0 });

    const itemsList = mealItems.map(item =>
        `- ${item.display_name} (${item.quantity}x): ${item.calories_kcal ?? '?'} cal, ${item.carbs_g ?? '?'}g carbs, ${item.protein_g ?? '?'}g protein, ${item.fibre_g ?? '?'}g fiber`
    ).join('\n');

    const prompt = `You are a wellness nutrition coach. Analyze this meal and suggest 2-3 specific adjustments that could improve it for better energy and metabolic health.

MEAL (${mealType}):
${itemsList}

MEAL TOTALS: ${Math.round(totals.calories)} cal, ${Math.round(totals.carbs)}g carbs, ${Math.round(totals.protein)}g protein, ${Math.round(totals.fat)}g fat, ${Math.round(totals.fibre)}g fiber, ${Math.round(totals.sugar)}g sugar

USER CONTEXT:
- Coaching preference: ${context.coachingStyle || 'balanced'}
- Recent patterns: ${context.recentMealPatterns.length > 0 ? context.recentMealPatterns.join(', ') : 'No specific patterns'}
- Glucose spikes this week: ${context.glucoseSpikesCount}
- Low energy meals this week: ${context.lowEnergyMealsCount}
- Avg daily fiber: ${context.avgFibrePerDay ?? 'unknown'}g

IMPORTANT RULES:
1. Suggest SPECIFIC food swaps or additions based on the actual items in this meal
2. Focus on practical changes (not complete meal replacements)
3. Prioritize: fiber additions, sugar reduction, protein balance, portion adjustments
4. Express impact as risk reduction percentage (e.g., "-12% Risk") or benefit (e.g., "+15% Energy")
5. Keep descriptions to 1-2 sentences explaining the benefit
6. Use wellness language, avoid medical/clinical terms
7. If the meal is already well-balanced, suggest smaller optimizations

Return ONLY valid JSON:
{
  "adjustments": [
    {
      "action": "Swap X for Y",
      "impact": "-X% Risk",
      "description": "Brief explanation of benefit",
      "priority": "high"
    }
  ]
}`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.5,
                        maxOutputTokens: 600,
                        responseMimeType: 'application/json',
                    },
                }),
            }
        );

        if (!response.ok) {
            console.error('Gemini API error:', response.status);
            return generateFallbackAdjustments(mealItems, context);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            return generateFallbackAdjustments(mealItems, context);
        }

        const parsed = JSON.parse(text);
        return (parsed.adjustments || []).slice(0, 3).map((adj: any, index: number) => ({
            id: String(index + 1),
            action: adj.action || 'Consider adjusting this meal',
            impact: adj.impact || '-5% Risk',
            description: adj.description || 'This change may help improve your energy levels.',
            priority: adj.priority || 'medium',
        }));
    } catch (error) {
        console.error('Gemini call failed:', error);
        return generateFallbackAdjustments(mealItems, context);
    }
}

// ============================================
// FALLBACK RULES
// ============================================

function generateFallbackAdjustments(mealItems: MealItem[], context: UserContext): MealAdjustment[] {
    const adjustments: MealAdjustment[] = [];

    // Calculate totals
    const totals = mealItems.reduce((acc, item) => ({
        calories: acc.calories + ((item.calories_kcal ?? 0) * item.quantity),
        carbs: acc.carbs + ((item.carbs_g ?? 0) * item.quantity),
        protein: acc.protein + ((item.protein_g ?? 0) * item.quantity),
        fat: acc.fat + ((item.fat_g ?? 0) * item.quantity),
        fibre: acc.fibre + ((item.fibre_g ?? 0) * item.quantity),
        sugar: acc.sugar + ((item.sugar_g ?? 0) * item.quantity),
    }), { calories: 0, carbs: 0, protein: 0, fat: 0, fibre: 0, sugar: 0 });

    // Find specific items to target
    const highSugarItems = mealItems.filter(item => (item.sugar_g ?? 0) > 15);
    const highCarbItems = mealItems.filter(item => (item.carbs_g ?? 0) > 40);
    const lowFiberMeal = totals.fibre < 5;
    const lowProteinMeal = totals.protein < 15;

    // Rule 1: High sugar items - suggest swaps
    if (highSugarItems.length > 0) {
        const item = highSugarItems[0];
        const isJuice = item.display_name.toLowerCase().includes('juice');
        const isBanana = item.display_name.toLowerCase().includes('banana');
        const isSoda = item.display_name.toLowerCase().includes('soda') || item.display_name.toLowerCase().includes('cola');

        if (isBanana) {
            adjustments.push({
                id: '1',
                action: 'Swap banana for berries',
                impact: '-12% Risk',
                description: 'Berries have less sugar and more fiber, helping maintain steadier energy levels.',
                priority: 'high',
            });
        } else if (isJuice) {
            adjustments.push({
                id: '1',
                action: 'Swap juice for whole fruit',
                impact: '-15% Risk',
                description: 'Whole fruit has fiber that slows sugar absorption, preventing energy crashes.',
                priority: 'high',
            });
        } else if (isSoda) {
            adjustments.push({
                id: '1',
                action: 'Swap soda for sparkling water',
                impact: '-20% Risk',
                description: 'Eliminating liquid sugar helps maintain stable energy throughout the day.',
                priority: 'high',
            });
        } else {
            adjustments.push({
                id: '1',
                action: `Reduce ${item.display_name} portion`,
                impact: '-8% Risk',
                description: 'Smaller portions of high-sugar foods help prevent energy dips.',
                priority: 'medium',
            });
        }
    }

    // Rule 2: Low fiber - suggest additions
    if (lowFiberMeal && adjustments.length < 3) {
        adjustments.push({
            id: String(adjustments.length + 1),
            action: 'Add 10g more fiber',
            impact: '-4% Risk',
            description: 'Adding vegetables or whole grains improves digestion and helps you feel fuller longer.',
            priority: 'medium',
        });
    }

    // Rule 3: Suggest post-meal walk if user has glucose spikes
    if (context.glucoseSpikesCount >= 2 && adjustments.length < 3) {
        adjustments.push({
            id: String(adjustments.length + 1),
            action: 'Take a 10 min post meal walk',
            impact: '-4% Risk',
            description: 'A short walk after eating helps your body use glucose more efficiently.',
            priority: 'low',
        });
    }

    // Rule 4: Low protein suggestion
    if (lowProteinMeal && adjustments.length < 3) {
        adjustments.push({
            id: String(adjustments.length + 1),
            action: 'Add a protein source',
            impact: '+10% Energy',
            description: 'Protein helps maintain steady energy and reduces cravings between meals.',
            priority: 'medium',
        });
    }

    // Rule 5: High carb meal
    if (highCarbItems.length > 0 && adjustments.length < 3) {
        const item = highCarbItems[0];
        const isRice = item.display_name.toLowerCase().includes('rice');
        const isPasta = item.display_name.toLowerCase().includes('pasta');
        const isBread = item.display_name.toLowerCase().includes('bread');

        if (isRice) {
            adjustments.push({
                id: String(adjustments.length + 1),
                action: 'Try cauliflower rice blend',
                impact: '-10% Risk',
                description: 'Mixing cauliflower rice reduces carbs while keeping the meal satisfying.',
                priority: 'medium',
            });
        } else if (isPasta) {
            adjustments.push({
                id: String(adjustments.length + 1),
                action: 'Switch to whole grain pasta',
                impact: '-8% Risk',
                description: 'Whole grain pasta has more fiber for slower energy release.',
                priority: 'medium',
            });
        } else if (isBread) {
            adjustments.push({
                id: String(adjustments.length + 1),
                action: 'Choose whole grain bread',
                impact: '-6% Risk',
                description: 'Whole grains provide sustained energy compared to refined options.',
                priority: 'medium',
            });
        }
    }

    // Ensure we have at least one adjustment
    if (adjustments.length === 0) {
        adjustments.push({
            id: '1',
            action: 'Take a 10 min post meal walk',
            impact: '+5% Energy',
            description: 'A gentle walk after eating aids digestion and helps maintain energy.',
            priority: 'low',
        });
    }

    return adjustments.slice(0, 3);
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
        const { user_id: requestedUserId, meal_items, meal_type = 'meal' } = body;

        if (!requestedUserId || !meal_items || !Array.isArray(meal_items)) {
            return new Response(
                JSON.stringify({ error: 'Missing user_id or meal_items' }),
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

        const userId = user.id;
        const aiEnabled = await isAiEnabled(supabase, userId);

        // Fetch user context for personalization
        const userContext = await fetchUserContext(supabase, userId);

        // Generate adjustments
        let adjustments: MealAdjustment[];
        if (aiEnabled) {
            adjustments = await generateAdjustmentsWithGemini(meal_items, meal_type, userContext);
        } else {
            adjustments = generateFallbackAdjustments(meal_items, userContext);
        }

        // Sanitize outputs
        adjustments = adjustments.filter(adj =>
            sanitizeText(adj.action) !== null && sanitizeText(adj.description) !== null
        );

        return new Response(
            JSON.stringify({ adjustments, context: { patterns: userContext.recentMealPatterns } }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
