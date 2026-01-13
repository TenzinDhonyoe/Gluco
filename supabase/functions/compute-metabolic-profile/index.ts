// supabase/functions/compute-metabolic-profile/index.ts
// Computes and caches user metabolic profile (baselines, sensitivities, patterns)
// Called daily or on-demand when profile is stale

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// TYPES
// ============================================

interface DailyContextRow {
    date: string;
    steps: number | null;
    sleep_hours: number | null;
    resting_hr: number | null;
    hrv_ms: number | null;
}

interface MetabolicScoreRow {
    date: string;
    score: number;
}

interface UserMetabolicProfile {
    baselines: {
        resting_hr: number | null;
        steps: number | null;
        sleep_hours: number | null;
        hrv_ms: number | null;
        metabolic_score: number | null;
    };
    sensitivities: {
        sleep: 'low' | 'medium' | 'high' | 'unknown';
        steps: 'low' | 'medium' | 'high' | 'unknown';
        recovery: 'slow' | 'average' | 'fast' | 'unknown';
    };
    patterns: {
        weekend_disruption: boolean;
        sleep_sensitive: boolean;
        activity_sensitive: boolean;
    };
    data_coverage_days: number;
    valid_days_for_sensitivity: number;
}

// ============================================
// MATH HELPERS
// ============================================

function filterValid(values: (number | null | undefined)[]): number[] {
    return values.filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
}

function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number | null {
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

// ============================================
// BASELINE CALCULATION (28-day rolling median)
// ============================================

function calculateBaselines(dailyContext: DailyContextRow[]): UserMetabolicProfile['baselines'] {
    const last28Days = dailyContext.slice(0, 28);

    return {
        resting_hr: median(filterValid(last28Days.map(d => d.resting_hr))),
        steps: median(filterValid(last28Days.map(d => d.steps))),
        sleep_hours: median(filterValid(last28Days.map(d => d.sleep_hours))),
        hrv_ms: median(filterValid(last28Days.map(d => d.hrv_ms))),
        metabolic_score: null, // Computed separately from score history
    };
}

// ============================================
// SENSITIVITY DETECTION (slope-based)
// Threshold: |slope| >= 4 = high, 2-4 = medium, <2 = low
// ============================================

interface DayDelta {
    date: string;
    delta_sleep: number | null;
    delta_steps: number | null;
    delta_rhr: number | null;
    delta_score: number | null;
}

function calculateDeltas(
    dailyContext: DailyContextRow[],
    baselines: UserMetabolicProfile['baselines'],
    scoreHistory: MetabolicScoreRow[]
): DayDelta[] {
    const scoreMap = new Map(scoreHistory.map(s => [s.date, s.score]));
    const baselineScore = baselines.metabolic_score;

    return dailyContext.map(day => ({
        date: day.date,
        delta_sleep: day.sleep_hours !== null && baselines.sleep_hours !== null
            ? day.sleep_hours - baselines.sleep_hours
            : null,
        delta_steps: day.steps !== null && baselines.steps !== null
            ? day.steps - baselines.steps
            : null,
        delta_rhr: day.resting_hr !== null && baselines.resting_hr !== null
            ? day.resting_hr - baselines.resting_hr
            : null,
        delta_score: scoreMap.has(day.date) && baselineScore !== null
            ? scoreMap.get(day.date)! - baselineScore
            : null,
    }));
}

function calculateSensitivity(
    deltas: DayDelta[],
    factorKey: 'delta_sleep' | 'delta_steps' | 'delta_rhr',
    thresholds: { high: number; medium: number }
): 'low' | 'medium' | 'high' | 'unknown' {
    // Filter days where both factor and score moved meaningfully
    const validDays = deltas.filter(d => {
        const factorDelta = d[factorKey];
        const scoreDelta = d.delta_score;
        return factorDelta !== null &&
            scoreDelta !== null &&
            Math.abs(factorDelta) > 0.1; // Factor changed meaningfully
    });

    if (validDays.length < 14) {
        return 'unknown'; // Need minimum 14 days
    }

    // Calculate slopes (delta_score / delta_factor)
    const slopes = validDays.map(d => {
        const factorDelta = d[factorKey]!;
        const scoreDelta = d.delta_score!;
        return factorDelta !== 0 ? scoreDelta / factorDelta : 0;
    });

    // Use median slope for robustness
    const medianSlope = Math.abs(median(slopes) || 0);

    if (medianSlope >= thresholds.high) return 'high';
    if (medianSlope >= thresholds.medium) return 'medium';
    return 'low';
}

function calculateSensitivities(
    deltas: DayDelta[]
): UserMetabolicProfile['sensitivities'] {
    return {
        // Sleep: 4 points per 1hr change = high
        sleep: calculateSensitivity(deltas, 'delta_sleep', { high: 4, medium: 2 }),
        // Steps: 4 points per 1000 steps = high (normalized)
        steps: calculateSensitivity(deltas, 'delta_steps', { high: 0.004, medium: 0.002 }),
        // Recovery: Based on RHR variability (slower recovery = worse)
        recovery: 'unknown', // Need day-over-day recovery analysis
    };
}

// ============================================
// PATTERN DETECTION
// ============================================

function detectPatterns(
    dailyContext: DailyContextRow[],
    baselines: UserMetabolicProfile['baselines']
): UserMetabolicProfile['patterns'] {
    // Weekend disruption: Sleep/steps differ significantly on weekends
    const weekdays = dailyContext.filter(d => {
        const day = new Date(d.date).getDay();
        return day !== 0 && day !== 6;
    });
    const weekends = dailyContext.filter(d => {
        const day = new Date(d.date).getDay();
        return day === 0 || day === 6;
    });

    const weekdaySleep = mean(filterValid(weekdays.map(d => d.sleep_hours)));
    const weekendSleep = mean(filterValid(weekends.map(d => d.sleep_hours)));

    const weekend_disruption = weekdaySleep !== null && weekendSleep !== null
        ? Math.abs(weekendSleep - weekdaySleep) > 1.0 // 1hr difference
        : false;

    // Sleep sensitive: Low sleep correlates with low scores
    const sleep_sensitive = baselines.sleep_hours !== null && baselines.sleep_hours < 7;

    // Activity sensitive: Low steps correlates with low scores
    const activity_sensitive = baselines.steps !== null && baselines.steps < 5000;

    return {
        weekend_disruption,
        sleep_sensitive,
        activity_sensitive,
    };
}

// ============================================
// MAIN COMPUTATION
// ============================================

async function computeProfile(
    supabase: ReturnType<typeof createClient>,
    userId: string
): Promise<UserMetabolicProfile> {
    // Fetch last 90 days of daily_context (for sensitivity calc)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    const { data: dailyContextData } = await supabase
        .from('daily_context')
        .select('date, steps, sleep_hours, resting_hr, hrv_ms')
        .eq('user_id', userId)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
        .order('date', { ascending: false });

    const dailyContext: DailyContextRow[] = dailyContextData || [];

    // Calculate baselines from last 28 days
    const baselines = calculateBaselines(dailyContext);

    // Get score history for sensitivity calculation
    // Note: We'll compute scores on-the-fly or use cached values
    // For now, use the metabolic score from the daily_context pattern
    const scoreHistory: MetabolicScoreRow[] = []; // TODO: Add score history table

    // Calculate median baseline score from recent data
    baselines.metabolic_score = 65; // Placeholder - would compute from actual scores

    // Calculate deltas and sensitivities
    const deltas = calculateDeltas(dailyContext, baselines, scoreHistory);
    const sensitivities = calculateSensitivities(deltas);

    // Detect patterns
    const patterns = detectPatterns(dailyContext, baselines);

    // Count days with valid data
    const data_coverage_days = dailyContext.filter(d =>
        d.steps !== null || d.sleep_hours !== null || d.resting_hr !== null
    ).length;

    const valid_days_for_sensitivity = deltas.filter(d =>
        d.delta_score !== null && (d.delta_sleep !== null || d.delta_steps !== null)
    ).length;

    return {
        baselines,
        sensitivities,
        patterns,
        data_coverage_days,
        valid_days_for_sensitivity,
    };
}

async function upsertProfile(
    supabase: ReturnType<typeof createClient>,
    userId: string,
    profile: UserMetabolicProfile
): Promise<void> {
    const { error } = await supabase
        .from('user_metabolic_profile')
        .upsert({
            user_id: userId,
            baseline_resting_hr: profile.baselines.resting_hr,
            baseline_steps: profile.baselines.steps,
            baseline_sleep_hours: profile.baselines.sleep_hours,
            baseline_hrv_ms: profile.baselines.hrv_ms,
            baseline_metabolic_score: profile.baselines.metabolic_score,
            sensitivity_sleep: profile.sensitivities.sleep,
            sensitivity_steps: profile.sensitivities.steps,
            sensitivity_recovery: profile.sensitivities.recovery,
            pattern_weekend_disruption: profile.patterns.weekend_disruption,
            pattern_sleep_sensitive: profile.patterns.sleep_sensitive,
            pattern_activity_sensitive: profile.patterns.activity_sensitive,
            data_coverage_days: profile.data_coverage_days,
            valid_days_for_sensitivity: profile.valid_days_for_sensitivity,
            last_updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

    if (error) {
        console.error('Error upserting profile:', error);
        throw error;
    }
}

// ============================================
// EDGE FUNCTION HANDLER
// ============================================

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { user_id: requestedUserId, force_refresh } = await req.json();

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

        const userId = user.id;

        // Check if profile exists and is fresh (< 24h old)
        if (!force_refresh) {
            const { data: existingProfile } = await supabase
                .from('user_metabolic_profile')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (existingProfile) {
                const lastUpdated = new Date(existingProfile.last_updated_at);
                const hoursSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);

                if (hoursSinceUpdate < 24) {
                    return new Response(
                        JSON.stringify({
                            profile: existingProfile,
                            cached: true,
                            hours_since_update: Math.round(hoursSinceUpdate)
                        }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }
            }
        }

        // Compute fresh profile
        const profile = await computeProfile(supabase, userId);

        // Store in database
        await upsertProfile(supabase, userId, profile);

        return new Response(
            JSON.stringify({
                profile,
                cached: false,
                message: 'Profile computed and cached'
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
