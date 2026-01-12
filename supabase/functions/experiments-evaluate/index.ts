// supabase/functions/experiments-evaluate/index.ts
// Edge Function for evaluating experiment results and generating AI summaries

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';
import { isAiEnabled } from '../_shared/ai.ts';
import { sanitizeStringArray, sanitizeText } from '../_shared/safety.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Types
interface VariantMetrics {
    n_exposures: number;
    n_with_glucose_data: number;
    peak_deltas: number[];
    times_to_peak: number[];
    median_peak_delta: number | null;
    mean_peak_delta: number | null;
    median_time_to_peak: number | null;
    checkin_scores: {
        energy: number[];
        hunger: number[];
        cravings: number[];
        difficulty: number[];
    };
    avg_energy: number | null;
    avg_hunger: number | null;
    avg_cravings: number | null;
}

interface ComparisonResult {
    winner: string | null;
    delta: number | null;
    confidence: 'high' | 'moderate' | 'low' | 'insufficient';
    direction: 'better' | 'worse' | 'similar' | 'unknown';
}

interface AnalysisResult {
    metrics: Record<string, VariantMetrics>;
    comparison: ComparisonResult;
    summary: string | null;
    suggestions: string[];
    is_final: boolean;
}

// Utility functions
function median(arr: number[]): number | null {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(arr: number[]): number | null {
    if (arr.length === 0) return null;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function roundTo(val: number | null, decimals: number): number | null {
    if (val === null) return null;
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
}

// Fetch exposure events and link to glucose data
async function fetchExposureData(
    supabase: any,
    userExperimentId: string,
    userId: string
): Promise<{
    exposuresByVariant: Record<string, any[]>;
    checkinsByVariant: Record<string, any[]>;
}> {
    // Fetch all events for this experiment
    const { data: events, error } = await supabase
        .from('user_experiment_events')
        .select('*')
        .eq('user_experiment_id', userExperimentId)
        .order('occurred_at', { ascending: true });

    if (error) {
        throw new Error(`Failed to fetch events: ${error.message}`);
    }

    const exposuresByVariant: Record<string, any[]> = {};
    const checkinsByVariant: Record<string, any[]> = {};

    // Group events by variant
    (events || []).forEach((event: any) => {
        const variantKey = event.payload?.variant_key || 'unknown';

        if (event.type === 'exposure') {
            if (!exposuresByVariant[variantKey]) exposuresByVariant[variantKey] = [];
            exposuresByVariant[variantKey].push(event);
        } else if (event.type === 'checkin') {
            if (!checkinsByVariant[variantKey]) checkinsByVariant[variantKey] = [];
            checkinsByVariant[variantKey].push(event);
        }
    });

    // For each exposure with a meal_id, fetch the after-meal check-in data
    for (const variantKey of Object.keys(exposuresByVariant)) {
        const exposures = exposuresByVariant[variantKey];

        for (const exposure of exposures) {
            const mealId = exposure.payload?.meal_id;

            if (mealId) {
                // Try to get after-meal check-in for this meal
                const { data: review } = await supabase
                    .from('post_meal_reviews')
                    .select('actual_peak, actual_curve, baseline_glucose, peak_delta, time_to_peak_min, status_tag')
                    .eq('meal_id', mealId)
                    .eq('status', 'opened')
                    .single();

                if (review) {
                    exposure.review = review;
                }
            }

            // Fallback: Try to compute from glucose_logs if no review
            if (!exposure.review && exposure.occurred_at) {
                const mealTime = new Date(exposure.occurred_at);
                const windowStart = mealTime.toISOString();
                const windowEnd = new Date(mealTime.getTime() + 3 * 60 * 60 * 1000).toISOString();

                const { data: glucoseLogs } = await supabase
                    .from('glucose_logs')
                    .select('glucose_level, logged_at')
                    .eq('user_id', userId)
                    .gte('logged_at', windowStart)
                    .lte('logged_at', windowEnd)
                    .order('logged_at', { ascending: true });

                if (glucoseLogs && glucoseLogs.length >= 2) {
                    const values = glucoseLogs.map((l: any) => l.glucose_level);
                    const baseline = values[0];
                    const peak = Math.max(...values);
                    const peakIndex = values.indexOf(peak);
                    const peakTime = glucoseLogs[peakIndex]?.logged_at;

                    exposure.computed_glucose = {
                        baseline,
                        peak,
                        peak_delta: peak - baseline,
                        time_to_peak_min: peakTime
                            ? Math.round((new Date(peakTime).getTime() - mealTime.getTime()) / 60000)
                            : null,
                        n_points: glucoseLogs.length,
                    };
                }
            }
        }
    }

    return { exposuresByVariant, checkinsByVariant };
}

// Calculate metrics for each variant
function calculateVariantMetrics(
    exposures: any[],
    checkins: any[]
): VariantMetrics {
    const metrics: VariantMetrics = {
        n_exposures: exposures.length,
        n_with_glucose_data: 0,
        peak_deltas: [],
        times_to_peak: [],
        median_peak_delta: null,
        mean_peak_delta: null,
        median_time_to_peak: null,
        checkin_scores: {
            energy: [],
            hunger: [],
            cravings: [],
            difficulty: [],
        },
        avg_energy: null,
        avg_hunger: null,
        avg_cravings: null,
    };

    // Extract glucose metrics from exposures
    exposures.forEach((exposure: any) => {
        const review = exposure.review;
        const computed = exposure.computed_glucose;

        if (review) {
            if (review.peak_delta !== null) {
                metrics.peak_deltas.push(review.peak_delta);
                metrics.n_with_glucose_data++;
            } else if (review.actual_peak !== null && review.baseline_glucose !== null) {
                metrics.peak_deltas.push(review.actual_peak - review.baseline_glucose);
                metrics.n_with_glucose_data++;
            }
            if (review.time_to_peak_min !== null) {
                metrics.times_to_peak.push(review.time_to_peak_min);
            }
        } else if (computed) {
            if (computed.peak_delta !== null) {
                metrics.peak_deltas.push(computed.peak_delta);
                metrics.n_with_glucose_data++;
            }
            if (computed.time_to_peak_min !== null) {
                metrics.times_to_peak.push(computed.time_to_peak_min);
            }
        }
    });

    // Calculate aggregates
    metrics.median_peak_delta = roundTo(median(metrics.peak_deltas), 2);
    metrics.mean_peak_delta = roundTo(mean(metrics.peak_deltas), 2);
    metrics.median_time_to_peak = roundTo(median(metrics.times_to_peak), 0);

    // Extract checkin scores
    checkins.forEach((checkin: any) => {
        const payload = checkin.payload || {};
        if (payload.energy_1_5) metrics.checkin_scores.energy.push(payload.energy_1_5);
        if (payload.hunger_1_5) metrics.checkin_scores.hunger.push(payload.hunger_1_5);
        if (payload.cravings_1_5) metrics.checkin_scores.cravings.push(payload.cravings_1_5);
        if (payload.difficulty_1_5) metrics.checkin_scores.difficulty.push(payload.difficulty_1_5);
    });

    metrics.avg_energy = roundTo(mean(metrics.checkin_scores.energy), 1);
    metrics.avg_hunger = roundTo(mean(metrics.checkin_scores.hunger), 1);
    metrics.avg_cravings = roundTo(mean(metrics.checkin_scores.cravings), 1);

    return metrics;
}

// Compare variants and determine winner
function compareVariants(
    metricsA: VariantMetrics,
    metricsB: VariantMetrics,
    variantKeyA: string,
    variantKeyB: string
): ComparisonResult {
    const result: ComparisonResult = {
        winner: null,
        delta: null,
        confidence: 'insufficient',
        direction: 'unknown',
    };

    // Need at least 3 exposures with data for each variant
    const minDataPoints = 3;
    const hasEnoughDataA = metricsA.n_with_glucose_data >= minDataPoints;
    const hasEnoughDataB = metricsB.n_with_glucose_data >= minDataPoints;

    if (!hasEnoughDataA || !hasEnoughDataB) {
        result.confidence = 'insufficient';
        return result;
    }

    // Use median peak delta for comparison (lower is better)
    const deltaA = metricsA.median_peak_delta;
    const deltaB = metricsB.median_peak_delta;

    if (deltaA === null || deltaB === null) {
        result.confidence = 'insufficient';
        return result;
    }

    // Calculate difference
    const diff = deltaA - deltaB; // Positive means A is worse (higher spike)
    result.delta = roundTo(Math.abs(diff), 2);

    // Determine winner (lower peak delta is better)
    if (Math.abs(diff) < 0.3) {
        // Similar results
        result.direction = 'similar';
        result.winner = null;
    } else if (diff > 0) {
        // B is better (lower spike)
        result.winner = variantKeyB;
        result.direction = 'better';
    } else {
        // A is better
        result.winner = variantKeyA;
        result.direction = 'better';
    }

    // Determine confidence based on data quality
    const totalDataPoints = metricsA.n_with_glucose_data + metricsB.n_with_glucose_data;
    if (totalDataPoints >= 10 && Math.abs(diff) >= 0.5) {
        result.confidence = 'high';
    } else if (totalDataPoints >= 6) {
        result.confidence = 'moderate';
    } else {
        result.confidence = 'low';
    }

    return result;
}

// Generate AI summary using Gemini
async function generateSummary(
    template: any,
    variants: any[],
    metrics: Record<string, VariantMetrics>,
    comparison: ComparisonResult
): Promise<{ summary: string; suggestions: string[] }> {
    const apiKey = Deno.env.get('GEMINI_API_KEY');

    if (!apiKey) {
        return generateFallbackSummary(template, variants, metrics, comparison);
    }

    const variantNames = variants.reduce((acc: any, v: any) => {
        acc[v.key] = v.name;
        return acc;
    }, {});

    const metricsText = Object.entries(metrics)
        .map(([key, m]) =>
            `${variantNames[key] || key}: ${m.n_exposures} exposures, ${m.n_with_glucose_data} with data, median peak change +${m.median_peak_delta ?? 'N/A'} mmol/L, avg energy ${m.avg_energy ?? 'N/A'}/5`)
        .join('\n');

    const prompt = `You are analyzing a personal meal experiment for someone tracking their eating patterns and responses.

IMPORTANT: Use behavioral, wellness-focused language. Do NOT imply diagnosis, detection, or prediction of any disease. Avoid clinical terminology.

EXPERIMENT: ${template.title}
${template.description}

VARIANT RESULTS:
${metricsText}

COMPARISON:
- Winner: ${comparison.winner ? (variantNames[comparison.winner] || comparison.winner) : 'Similar/Unclear'}
- Difference: ${comparison.delta ?? 'N/A'} mmol/L
- Confidence: ${comparison.confidence}

Write:
1. A 2-3 sentence summary in plain English explaining what they learned. Be encouraging but honest.
2. 2-3 actionable next steps they could try.

Return ONLY valid JSON:
{
  "summary": "...",
  "suggestions": ["suggestion1", "suggestion2"]
}`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: 400,
                        responseMimeType: 'application/json',
                    },
                }),
            }
        );

        if (!response.ok) {
            console.error('Gemini API error:', response.status);
            return generateFallbackSummary(template, variants, metrics, comparison);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            return generateFallbackSummary(template, variants, metrics, comparison);
        }

        const parsed = JSON.parse(text);
        const summary = sanitizeText(parsed.summary || '') ?? null;
        const suggestions = sanitizeStringArray(parsed.suggestions || []);

        if (!summary || suggestions.length === 0) {
            return generateFallbackSummary(template, variants, metrics, comparison);
        }

        return { summary, suggestions };
    } catch (error) {
        console.error('Gemini call failed:', error);
        return generateFallbackSummary(template, variants, metrics, comparison);
    }
}

// Generate fallback summary without AI
function generateFallbackSummary(
    template: any,
    variants: any[],
    metrics: Record<string, VariantMetrics>,
    comparison: ComparisonResult
): { summary: string; suggestions: string[] } {
    const variantNames = variants.reduce((acc: any, v: any) => {
        acc[v.key] = v.name;
        return acc;
    }, {});

    let summary = '';
    const suggestions: string[] = [];

    if (comparison.confidence === 'insufficient') {
        summary = `You need more data to draw conclusions from this experiment. Keep logging meals and completing after-meal check-ins.`;
        suggestions.push('Continue the experiment for more data points');
        suggestions.push('Make sure to complete after-meal check-ins for each test meal');
    } else if (comparison.direction === 'similar') {
        summary = `Both options showed similar meal responses. This means you can choose based on preference or other factors like taste and convenience.`;
        suggestions.push('Choose whichever option you enjoy more');
        suggestions.push('Consider testing a different variable');
    } else if (comparison.winner) {
        const winnerName = variantNames[comparison.winner] || comparison.winner;
        const loserKey = Object.keys(metrics).find(k => k !== comparison.winner);
        const winnerMetrics = metrics[comparison.winner];
        const loserMetrics = loserKey ? metrics[loserKey] : null;

        summary = `"${winnerName}" resulted in a smaller response (${winnerMetrics.median_peak_delta ?? '--'} mmol/L vs ${loserMetrics?.median_peak_delta ?? '--'} mmol/L). ${comparison.confidence === 'high' ? 'This is a reliable finding!' : 'Consider collecting more data to confirm.'}`;
        suggestions.push(`Try ${winnerName} more often for similar meals`);
        suggestions.push('Log how you feel with each option to track energy and satisfaction');
    } else {
        summary = `Experiment completed. Review your results to see which option works better for you.`;
        suggestions.push('Continue tracking to build confidence in the results');
    }

    return { summary, suggestions };
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { user_id: requestedUserId, user_experiment_id, save_snapshot = true } = await req.json();

        if (!requestedUserId || !user_experiment_id) {
            return new Response(
                JSON.stringify({ error: 'Missing user_id or user_experiment_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Initialize Supabase client with service role
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { user, errorResponse } = await requireUser(req, supabase, corsHeaders);
        if (errorResponse) return errorResponse;

        const mismatch = requireMatchingUserId(requestedUserId, user.id, corsHeaders);
        if (mismatch) return mismatch;

        const userId = user.id;
        const aiEnabled = await isAiEnabled(supabase, userId);

        // Fetch the user experiment
        const { data: userExperiment, error: expError } = await supabase
            .from('user_experiments')
            .select('*, experiment_templates(*)')
            .eq('id', user_experiment_id)
            .eq('user_id', userId)
            .single();

        if (expError || !userExperiment) {
            return new Response(
                JSON.stringify({ error: 'Experiment not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const template = userExperiment.experiment_templates;

        // Fetch variants for this template
        const { data: variants } = await supabase
            .from('experiment_variants')
            .select('*')
            .eq('template_id', template.id)
            .order('sort_order');

        // Fetch exposure and checkin data
        const { exposuresByVariant, checkinsByVariant } = await fetchExposureData(
            supabase,
            user_experiment_id,
            userId
        );

        // Calculate metrics for each variant
        const metricsResult: Record<string, VariantMetrics> = {};
        const variantKeys = Object.keys(exposuresByVariant);

        for (const key of variantKeys) {
            metricsResult[key] = calculateVariantMetrics(
                exposuresByVariant[key] || [],
                checkinsByVariant[key] || []
            );
        }

        // Compare variants (assuming A/B comparison)
        let comparison: ComparisonResult = {
            winner: null,
            delta: null,
            confidence: 'insufficient',
            direction: 'unknown',
        };

        if (variantKeys.length >= 2) {
            const [keyA, keyB] = variantKeys.slice(0, 2);
            comparison = compareVariants(
                metricsResult[keyA],
                metricsResult[keyB],
                keyA,
                keyB
            );
        }

        // Determine if experiment is complete
        const protocol = template.protocol || {};
        const requiredExposures = (protocol.exposures_per_variant || 5) * 2;
        const totalExposures = variantKeys.reduce(
            (sum, key) => sum + (metricsResult[key]?.n_exposures || 0),
            0
        );
        const isFinal = totalExposures >= requiredExposures;

        // Generate summary
        const { summary, suggestions } = aiEnabled
            ? await generateSummary(template, variants || [], metricsResult, comparison)
            : generateFallbackSummary(template, variants || [], metricsResult, comparison);

        const analysisResult: AnalysisResult = {
            metrics: metricsResult,
            comparison,
            summary,
            suggestions,
            is_final: isFinal,
        };

        // Save snapshot if requested
        if (save_snapshot) {
            const { error: insertError } = await supabase
                .from('user_experiment_analysis')
                .insert({
                    user_id: userId,
                    user_experiment_id,
                    metrics: metricsResult,
                    comparison,
                    summary,
                    suggestions,
                    is_final: isFinal,
                });

            if (insertError) {
                console.error('Failed to save analysis snapshot:', insertError);
            }

            // Update experiment status if complete
            if (isFinal && userExperiment.status === 'active') {
                await supabase
                    .from('user_experiments')
                    .update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                        exposures_logged: totalExposures,
                    })
                    .eq('id', user_experiment_id);
            } else {
                // Just update progress
                await supabase
                    .from('user_experiments')
                    .update({
                        exposures_logged: totalExposures,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', user_experiment_id);
            }
        }

        return new Response(
            JSON.stringify({
                analysis: analysisResult,
                experiment: {
                    id: userExperiment.id,
                    status: isFinal ? 'completed' : userExperiment.status,
                    template_title: template.title,
                    total_exposures: totalExposures,
                    required_exposures: requiredExposures,
                    completion_pct: Math.round((totalExposures / requiredExposures) * 100),
                },
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error', details: String(error) }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
