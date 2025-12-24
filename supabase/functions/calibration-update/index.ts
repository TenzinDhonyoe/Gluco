// supabase/functions/calibration-update/index.ts
// Edge Function to update user calibration after a post-meal review is completed
// Uses EMA (Exponential Moving Average) with adaptive learning rate

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// TYPES
// ============================================

interface CurvePoint {
    time: number;  // or t_min
    value: number; // or glucose_delta
}

interface ReviewMetrics {
    baseline_glucose: number;
    peak_glucose: number;
    peak_delta: number;
    time_to_peak_min: number | null;
    auc_0_180: number | null;
    is_quality: boolean;
}

interface ContextFeatures {
    activity_score: number;      // 0-1.5
    sleep_deficit: number;       // 0-1.5
    sleep_hours: number | null;
}

interface UserCalibration {
    baseline_glucose: number;
    carb_sensitivity: number;
    avg_peak_time_min: number;
    exercise_effect: number;
    sleep_penalty: number;
    n_observations: number;
    n_quality_observations: number;
    confidence: number;
}

// ============================================
// CONSTANTS & CLAMPS
// ============================================

const CLAMPS = {
    baseline_glucose: { min: 4.0, max: 9.0 },
    carb_sensitivity: { min: 0.1, max: 1.2 },
    avg_peak_time_min: { min: 25, max: 120 },
    exercise_effect: { min: 0.0, max: 0.35 },
    sleep_penalty: { min: 0.0, max: 0.45 },
    learning_rate: { min: 0.02, max: 0.12 },
};

const DEFAULT_CALIBRATION: UserCalibration = {
    baseline_glucose: 5.5,
    carb_sensitivity: 0.4,
    avg_peak_time_min: 45,
    exercise_effect: 0.0,
    sleep_penalty: 0.0,
    n_observations: 0,
    n_quality_observations: 0,
    confidence: 0.0,
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
    return Math.round(value * 10) / 10;
}

// ============================================
// METRICS EXTRACTION
// ============================================

/**
 * Extract glycaemic metrics from a glucose curve
 * @param curve Array of {time, value} points (time in minutes from meal)
 * @param fallbackBaseline Fallback if no pre-meal points
 */
function extractMetricsFromCurve(
    curve: CurvePoint[],
    fallbackBaseline: number
): ReviewMetrics {
    if (!curve || curve.length === 0) {
        return {
            baseline_glucose: fallbackBaseline,
            peak_glucose: fallbackBaseline,
            peak_delta: 0,
            time_to_peak_min: null,
            auc_0_180: null,
            is_quality: false,
        };
    }

    // Normalize curve format (handle t_min vs time, glucose_delta vs value)
    const normalized = curve.map(p => ({
        time: (p as any).t_min ?? (p as any).time ?? 0,
        value: (p as any).glucose_delta ?? (p as any).value ?? 0,
    })).sort((a, b) => a.time - b.time);

    // Calculate baseline (prefer pre-meal points, then t=0, then fallback)
    const preMealPoints = normalized.filter(p => p.time >= -15 && p.time <= 0);
    let baseline: number;
    if (preMealPoints.length > 0) {
        baseline = preMealPoints.reduce((s, p) => s + p.value, 0) / preMealPoints.length;
    } else {
        const t0 = normalized.find(p => p.time === 0);
        baseline = t0 ? t0.value : fallbackBaseline;
    }

    // Filter to analysis window [0, 180]
    const windowPoints = normalized.filter(p => p.time >= 0 && p.time <= 180);

    if (windowPoints.length === 0) {
        return {
            baseline_glucose: baseline,
            peak_glucose: baseline,
            peak_delta: 0,
            time_to_peak_min: null,
            auc_0_180: null,
            is_quality: false,
        };
    }

    // Find peak
    const peak_glucose = Math.max(...windowPoints.map(p => p.value));
    const peak_delta = Math.max(0, peak_glucose - baseline);

    // Time to peak (first occurrence within epsilon)
    const epsilon = 0.05;
    const peakPoint = windowPoints.find(p => Math.abs(p.value - peak_glucose) <= epsilon);
    const time_to_peak_min = peakPoint ? peakPoint.time : null;

    // AUC (trapezoidal integration)
    let auc = 0;
    for (let i = 0; i < windowPoints.length - 1; i++) {
        const p1 = windowPoints[i];
        const p2 = windowPoints[i + 1];
        const delta1 = Math.max(0, p1.value - baseline);
        const delta2 = Math.max(0, p2.value - baseline);
        auc += (delta1 + delta2) / 2 * (p2.time - p1.time);
    }

    // Quality check: >=4 points OR >=2 including peak-ish
    const hasPeakLikePoint = windowPoints.some(p => p.value >= baseline + 0.5);
    const is_quality = windowPoints.length >= 4 || (windowPoints.length >= 2 && hasPeakLikePoint);

    return {
        baseline_glucose: round1(baseline),
        peak_glucose: round1(peak_glucose),
        peak_delta: round1(peak_delta),
        time_to_peak_min: time_to_peak_min ? Math.round(time_to_peak_min) : null,
        auc_0_180: round1(auc),
        is_quality,
    };
}

// ============================================
// CONTEXT FEATURES
// ============================================

async function fetchContextFeatures(
    supabase: any,
    userId: string,
    mealTime: Date
): Promise<ContextFeatures> {
    // Default context
    const context: ContextFeatures = {
        activity_score: 0,
        sleep_deficit: 0,
        sleep_hours: null,
    };

    // Fetch activity in [-6h, +3h] window
    const sixHoursAgo = new Date(mealTime.getTime() - 6 * 60 * 60 * 1000);
    const threeHoursAfter = new Date(mealTime.getTime() + 3 * 60 * 60 * 1000);
    const twoHoursAgo = new Date(mealTime.getTime() - 2 * 60 * 60 * 1000);
    const twoHoursAfter = new Date(mealTime.getTime() + 2 * 60 * 60 * 1000);

    try {
        const { data: activities } = await supabase
            .from('activity_logs')
            .select('duration_minutes, intensity, logged_at')
            .eq('user_id', userId)
            .gte('logged_at', sixHoursAgo.toISOString())
            .lte('logged_at', threeHoursAfter.toISOString());

        if (activities && activities.length > 0) {
            const intensityMap: Record<string, number> = { light: 1, moderate: 2, intense: 3 };
            let recentWeighted = 0;

            for (const a of activities) {
                const logTime = new Date(a.logged_at);
                const weight = intensityMap[a.intensity] || 1;
                const minutes = a.duration_minutes || 0;

                // Count if in [-2h, +2h] window
                if (logTime >= twoHoursAgo && logTime <= twoHoursAfter) {
                    recentWeighted += minutes * weight;
                }
            }

            // activity_score = clamp(recent_2h_weighted / 30, 0, 1.5)
            context.activity_score = clamp(recentWeighted / 30, 0, 1.5);
        }
    } catch (error) {
        console.warn('Failed to fetch activity context:', error);
    }

    // Fetch sleep from daily_context (yesterday or today based on meal time)
    try {
        const mealDate = new Date(mealTime);
        const yesterdayDate = new Date(mealDate);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);

        // Use yesterday's date for "last night's sleep"
        const dateStr = yesterdayDate.toISOString().split('T')[0];

        const { data: sleepData } = await supabase
            .from('daily_context')
            .select('sleep_hours')
            .eq('user_id', userId)
            .eq('date', dateStr)
            .single();

        if (sleepData?.sleep_hours != null) {
            context.sleep_hours = sleepData.sleep_hours;
            // sleep_deficit = clamp((7 - hours) / 3, 0, 1.5)
            context.sleep_deficit = clamp((7 - sleepData.sleep_hours) / 3, 0, 1.5);
        }
    } catch (error) {
        // No sleep data is fine
    }

    return context;
}

// ============================================
// EMA UPDATE RULES
// ============================================

/**
 * Update user calibration using EMA with adaptive learning rate
 */
function updateCalibration(
    current: UserCalibration,
    metrics: ReviewMetrics,
    netCarbs: number,
    context: ContextFeatures
): UserCalibration {
    // Increment observation counts
    const n_observations = current.n_observations + 1;
    const n_quality_observations = metrics.is_quality
        ? current.n_quality_observations + 1
        : current.n_quality_observations;

    // Calculate confidence: 1 - exp(-n_quality / 20)
    const confidence = round1(1 - Math.exp(-n_quality_observations / 20));

    // Adaptive learning rate
    const alpha_base = metrics.is_quality ? 0.12 : 0.06;
    const alpha = clamp(alpha_base * (1 - 0.7 * confidence), CLAMPS.learning_rate.min, CLAMPS.learning_rate.max);
    const alpha_context = alpha * 0.5; // Slower for context effects

    // Update baseline_glucose
    const baseline_glucose = clamp(
        (1 - alpha) * current.baseline_glucose + alpha * metrics.baseline_glucose,
        CLAMPS.baseline_glucose.min,
        CLAMPS.baseline_glucose.max
    );

    // Update avg_peak_time_min (if observed)
    let avg_peak_time_min = current.avg_peak_time_min;
    if (metrics.time_to_peak_min != null) {
        avg_peak_time_min = clamp(
            Math.round((1 - alpha) * current.avg_peak_time_min + alpha * metrics.time_to_peak_min),
            CLAMPS.avg_peak_time_min.min,
            CLAMPS.avg_peak_time_min.max
        );
    }

    // Prepare for sensitivity update
    let carb_sensitivity = current.carb_sensitivity;
    let exercise_effect = current.exercise_effect;
    let sleep_penalty = current.sleep_penalty;

    // Only update sensitivity if net_carbs >= 8g
    if (netCarbs >= 8) {
        // Deconfound peak_delta by removing current estimated modifiers
        const denom_sleep = Math.max(0.5, 1 + current.sleep_penalty * context.sleep_deficit);
        const denom_exercise = Math.max(0.5, 1 - current.exercise_effect * context.activity_score);
        const peak_delta_adj = metrics.peak_delta / denom_sleep / denom_exercise;

        // Compute observed sensitivity
        const carbs10 = Math.max(netCarbs / 10, 0.5);
        const sensitivity_obs = peak_delta_adj / carbs10;

        // EMA update
        carb_sensitivity = clamp(
            (1 - alpha) * current.carb_sensitivity + alpha * sensitivity_obs,
            CLAMPS.carb_sensitivity.min,
            CLAMPS.carb_sensitivity.max
        );

        // Update exercise_effect (only if activity_score >= 0.3)
        if (context.activity_score >= 0.3) {
            // Predicted peak without exercise
            const pred_sleep = carbs10 * current.carb_sensitivity * denom_sleep;

            if (pred_sleep > 0.3) {
                // Implied reduction fraction
                const implied_reduction = clamp(1 - (metrics.peak_delta / pred_sleep), -0.3, 0.5);
                const per_unit = implied_reduction / context.activity_score;

                exercise_effect = clamp(
                    (1 - alpha_context) * current.exercise_effect + alpha_context * per_unit,
                    CLAMPS.exercise_effect.min,
                    CLAMPS.exercise_effect.max
                );
            }
        }

        // Update sleep_penalty (only if sleep_deficit >= 0.2 and sleep is known)
        if (context.sleep_deficit >= 0.2 && context.sleep_hours != null) {
            // Predicted peak without sleep penalty
            const pred_no_sleep = carbs10 * current.carb_sensitivity * denom_exercise;

            if (pred_no_sleep > 0.3) {
                // Implied increase fraction
                const implied_increase = clamp((metrics.peak_delta / pred_no_sleep) - 1, -0.2, 0.6);
                const per_unit = implied_increase / context.sleep_deficit;

                sleep_penalty = clamp(
                    (1 - alpha_context) * current.sleep_penalty + alpha_context * per_unit,
                    CLAMPS.sleep_penalty.min,
                    CLAMPS.sleep_penalty.max
                );
            }
        }
    }

    return {
        baseline_glucose: round1(baseline_glucose),
        carb_sensitivity: round1(carb_sensitivity),
        avg_peak_time_min,
        exercise_effect: round1(exercise_effect),
        sleep_penalty: round1(sleep_penalty),
        n_observations,
        n_quality_observations,
        confidence,
    };
}

// ============================================
// MEAL TOKENIZATION
// ============================================

const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'with', 'of', 'in', 'on', 'for',
    'to', 'from', 'by', 'at', 'as', 'is', 'it', 'no', 'not'
]);

function buildMealTokens(mealName: string, itemNames: string[]): string[] {
    const tokens: string[] = [];

    const allText = [mealName, ...itemNames].join(' ');
    for (const word of allText.split(/\s+/)) {
        const normalized = word.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        if (normalized.length >= 3 && !STOPWORDS.has(normalized)) {
            tokens.push(normalized);
        }
    }

    return [...new Set(tokens)];
}

// ============================================
// MAIN HANDLER
// ============================================

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { user_id, review_id } = await req.json();

        if (!user_id || !review_id) {
            return new Response(
                JSON.stringify({ error: 'Missing user_id or review_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Load the review
        const { data: review, error: reviewError } = await supabase
            .from('post_meal_reviews')
            .select('*, meals(carbs_g, fibre_g)')
            .eq('id', review_id)
            .eq('user_id', user_id)
            .single();

        if (reviewError || !review) {
            return new Response(
                JSON.stringify({ error: 'Review not found', details: reviewError?.message }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Get current calibration (or create default)
        let { data: calibration } = await supabase
            .from('user_calibration')
            .select('*')
            .eq('user_id', user_id)
            .single();

        if (!calibration) {
            calibration = { ...DEFAULT_CALIBRATION, user_id };
        }

        // Extract metrics from actual curve
        const actualCurve = review.actual_curve || [];
        const metrics = extractMetricsFromCurve(actualCurve, calibration.baseline_glucose);

        // Use manual glucose if no curve but actual_peak exists
        if (actualCurve.length === 0 && review.actual_peak != null) {
            metrics.peak_glucose = review.actual_peak;
            metrics.peak_delta = Math.max(0, review.actual_peak - metrics.baseline_glucose);
            metrics.is_quality = false; // Single point is low quality
        }

        // Calculate net carbs from meal
        const mealCarbs = review.meals?.carbs_g ?? review.total_carbs ?? 0;
        const mealFibre = review.meals?.fibre_g ?? review.total_fibre ?? 0;
        const netCarbs = Math.max(0, mealCarbs - mealFibre);

        // Fetch context features
        const mealTime = new Date(review.meal_time);
        const context = await fetchContextFeatures(supabase, user_id, mealTime);

        console.log('Calibration update context:', {
            metrics,
            netCarbs,
            context,
            currentCalibration: {
                carb_sensitivity: calibration.carb_sensitivity,
                n_observations: calibration.n_observations,
            },
        });

        // Run EMA update
        const updatedCalibration = updateCalibration(calibration, metrics, netCarbs, context);

        console.log('Updated calibration:', updatedCalibration);

        // Store updated calibration
        const { error: upsertError } = await supabase
            .from('user_calibration')
            .upsert({
                user_id,
                ...updatedCalibration,
            }, { onConflict: 'user_id' });

        if (upsertError) {
            console.error('Failed to upsert calibration:', upsertError);
        }

        // Generate meal tokens
        const mealTokens = buildMealTokens(
            review.meal_name || '',
            [] // Would need meal_items for full tokenization
        );

        // Store metrics back on the review
        const { error: updateError } = await supabase
            .from('post_meal_reviews')
            .update({
                baseline_glucose: metrics.baseline_glucose,
                peak_delta: metrics.peak_delta,
                time_to_peak_min: metrics.time_to_peak_min,
                net_carbs_g: netCarbs,
                auc_0_180: metrics.auc_0_180,
                meal_tokens: mealTokens.length > 0 ? mealTokens : null,
            })
            .eq('id', review_id);

        if (updateError) {
            console.warn('Failed to update review metrics:', updateError);
        }

        return new Response(
            JSON.stringify({
                success: true,
                metrics,
                calibration: updatedCalibration,
                context,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Calibration update error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error', details: String(error) }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
