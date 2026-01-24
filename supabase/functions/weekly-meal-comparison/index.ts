// supabase/functions/weekly-meal-comparison/index.ts
// Edge Function for generating AI-powered meal comparison drivers using Gemini

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { isAiEnabled } from '../_shared/ai.ts';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';
import { sanitizeText } from '../_shared/safety.ts';
import { callGenAI } from '../_shared/genai.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CurvePoint {
    time: number;
    value: number;
}

interface MealReview {
    id: string;
    meal_name: string | null;
    meal_time: string | null;
    actual_peak: number | null;
    actual_curve: CurvePoint[] | null;
    predicted_curve: CurvePoint[] | null;
    predicted_peak: number | null;
    status_tag: string | null;
    baseline_glucose: number | null;
    peak_delta: number | null;
    time_to_peak_min: number | null;
    total_carbs: number | null;
    total_protein: number | null;
    total_fibre: number | null;
}

interface DriversResponse {
    highest: { drivers: string[] };
    lowest: { drivers: string[] };
}

// Downsample curve to key points (every 15-30 minutes)
function downsampleCurve(curve: CurvePoint[] | null, interval: number = 30): string {
    if (!curve || curve.length === 0) return 'No data';

    const sorted = [...curve].sort((a, b) => a.time - b.time);
    const sampled: string[] = [];

    for (let t = 0; t <= 120; t += interval) {
        // Find closest point to this time
        const closest = sorted.reduce((prev, curr) =>
            Math.abs(curr.time - t) < Math.abs(prev.time - t) ? curr : prev
        );
        if (Math.abs(closest.time - t) <= interval / 2) {
            sampled.push(`${t}min: ${closest.value.toFixed(1)}`);
        }
    }

    return sampled.join(', ') || 'No data';
}

// Format meal summary for the prompt
function formatMealSummary(review: MealReview, label: string): string {
    const baseline = review.baseline_glucose?.toFixed(1) ?? 'unknown';
    const actualPeak = review.actual_peak?.toFixed(1) ?? 'unknown';
    const predictedPeak = review.predicted_peak?.toFixed(1) ?? 'unknown';
    const peakDelta = review.peak_delta?.toFixed(1) ?? 'unknown';
    const timeToPeak = review.time_to_peak_min ?? 'unknown';

    const mealTime = review.meal_time
        ? new Date(review.meal_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : 'unknown time';

    const macros = [
        review.total_carbs ? `${review.total_carbs}g carbs` : null,
        review.total_protein ? `${review.total_protein}g protein` : null,
        review.total_fibre ? `${review.total_fibre}g fibre` : null,
    ].filter(Boolean).join(', ') || 'unknown macros';

    return `${label}:
- Meal: "${review.meal_name || 'Unknown meal'}" at ${mealTime}
- Macros: ${macros}
- Baseline level: ${baseline} mmol/L
- Peak level: ${actualPeak} mmol/L (predicted: ${predictedPeak} mmol/L)
- Peak change (peak_delta): +${peakDelta} mmol/L
- Time to peak: ${timeToPeak} minutes
- Status: ${review.status_tag || 'unknown'}
- Response curve: ${downsampleCurve(review.actual_curve)}`;
}

async function generateDriversWithGemini(
    highest: MealReview | null,
    lowest: MealReview | null
): Promise<DriversResponse> {
    const highestSummary = highest ? formatMealSummary(highest, 'HIGHEST RESPONSE MEAL') : 'No high response meal data';
    const lowestSummary = lowest ? formatMealSummary(lowest, 'LOWEST RESPONSE MEAL') : 'No low response meal data';

    const prompt = `You are a wellness coach analyzing a user's weekly meal responses. Based on their two meals with the highest and lowest responses, generate 2-3 short, actionable "driver" insights for each meal explaining why it may have caused that response.

IMPORTANT: Use behavioral, wellness-focused language. Do NOT imply diagnosis, detection, or prediction of any disease. Avoid clinical terminology.

${highestSummary}

${lowestSummary}

CRITICAL: Only reference numbers and foods that were provided in the meal data above. Do not invent or assume additional details.

For each meal, provide 2-3 bullet-point drivers (short phrases, not sentences). Focus on:
- Composition (carbs, fibre, protein ratios)
- Meal timing effects
- Portion considerations
- What worked well (for lower response) or what to adjust (for higher response)

Be encouraging and practical. Avoid medical jargon. Use the actual data provided.

Return ONLY valid JSON in this exact format:
{
  "highest": {
    "drivers": ["Driver 1 for higher response meal", "Driver 2", "Driver 3"]
  },
  "lowest": {
    "drivers": ["Driver 1 for lower response meal", "Driver 2", "Driver 3"]
  }
}`;

    try {
        const text = await callGenAI(prompt, {
            temperature: 0.4,
            maxOutputTokens: 500,
            jsonOutput: true,
        });

        if (!text) {
            return generateFallbackDrivers(highest, lowest);
        }

        const parsed = JSON.parse(text);

        // Validate structure
        if (!parsed.highest?.drivers || !parsed.lowest?.drivers) {
            console.error('Invalid response structure from Vertex AI');
            return generateFallbackDrivers(highest, lowest);
        }

        const safeHighest = (parsed.highest.drivers || [])
            .filter((driver: string) => sanitizeText(driver) !== null)
            .slice(0, 3);
        const safeLowest = (parsed.lowest.drivers || [])
            .filter((driver: string) => sanitizeText(driver) !== null)
            .slice(0, 3);

        if (safeHighest.length === 0 || safeLowest.length === 0) {
            return generateFallbackDrivers(highest, lowest);
        }

        return {
            highest: { drivers: safeHighest },
            lowest: { drivers: safeLowest },
        };
    } catch (error) {
        console.error('Vertex AI call failed:', error);
        return generateFallbackDrivers(highest, lowest);
    }
}

function generateFallbackDrivers(
    highest: MealReview | null,
    lowest: MealReview | null
): DriversResponse {
    const highestDrivers: string[] = [];
    const lowestDrivers: string[] = [];

    // Generate heuristic drivers for highest response
    if (highest) {
        if (highest.total_carbs && highest.total_carbs > 50) {
            highestDrivers.push('Higher carbohydrate content likely drove a stronger response');
        }
        if (highest.total_fibre && highest.total_fibre < 5) {
            highestDrivers.push('Low fibre may have made this meal digest faster');
        }
        if (highest.peak_delta && highest.peak_delta > 3) {
            highestDrivers.push('Consider pairing with protein or healthy fats next time');
        }
        if (highestDrivers.length === 0) {
            highestDrivers.push('Meal composition led to a stronger response');
        }
    } else {
        highestDrivers.push('No high response meal data available');
    }

    // Generate heuristic drivers for lowest response
    if (lowest) {
        if (lowest.total_fibre && lowest.total_fibre >= 5) {
            lowestDrivers.push('Good fibre content helped slow digestion');
        }
        if (lowest.total_protein && lowest.total_protein >= 15) {
            lowestDrivers.push('Adequate protein supported steadier energy');
        }
        if (lowest.peak_delta && lowest.peak_delta < 2) {
            lowestDrivers.push('Well-balanced meal composition');
        }
        if (lowestDrivers.length === 0) {
            lowestDrivers.push('Meal felt steady overall');
        }
    } else {
        lowestDrivers.push('No low response meal data available');
    }

    return {
        highest: { drivers: highestDrivers },
        lowest: { drivers: lowestDrivers },
    };
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { user_id: requestedUserId, highest_review, lowest_review } = await req.json();

        if (!requestedUserId) {
            return new Response(
                JSON.stringify({ error: 'Missing user_id' }),
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

        const aiEnabled = await isAiEnabled(supabase, user.id);

        // Generate drivers with Gemini (or fallback)
        const drivers = aiEnabled
            ? await generateDriversWithGemini(
                highest_review as MealReview | null,
                lowest_review as MealReview | null
            )
            : generateFallbackDrivers(
                highest_review as MealReview | null,
                lowest_review as MealReview | null
            );

        return new Response(
            JSON.stringify(drivers),
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
