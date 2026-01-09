import { ExperimentComparison, supabase, UserExperiment, VariantMetrics } from './supabase';

/**
 * Local implementation of experiment analysis
 * Replaces the Edge Function logic which is currently failing due to schema mismatches
 */

// Types matching the Edge Function
export interface AnalysisResult {
    metrics: Record<string, VariantMetrics>;
    comparison: ExperimentComparison;
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

// Fetch exposure data locally
async function fetchExposureData(
    userExperimentId: string,
    userId: string
): Promise<{
    exposuresByVariant: Record<string, any[]>;
    checkinsByVariant: Record<string, any[]>;
}> {
    // 1. Fetch all events
    const { data: events, error } = await supabase
        .from('user_experiment_events')
        .select('*')
        .eq('user_experiment_id', userExperimentId)
        .order('occurred_at', { ascending: true });

    if (error) {
        console.error('Failed to fetch events:', error);
        return { exposuresByVariant: {}, checkinsByVariant: {} };
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
            // These are standalone checkins (linked to variant directly)
            if (!checkinsByVariant[variantKey]) checkinsByVariant[variantKey] = [];
            checkinsByVariant[variantKey].push(event);
        }
    });

    // 2. Enrich exposures with meal check-in data and glucose data
    for (const variantKey of Object.keys(exposuresByVariant)) {
        const exposures = exposuresByVariant[variantKey];

        for (const exposure of exposures) {
            const mealId = exposure.payload?.meal_id;
            const mealTimeStr = exposure.occurred_at;

            if (!mealTimeStr) continue;

            const mealTime = new Date(mealTimeStr);

            // Fetch Check-in (new table: meal_checkins)
            if (mealId) {
                const { data: checkin } = await supabase
                    .from('meal_checkins')
                    .select('*')
                    .eq('meal_id', mealId)
                    .single();

                if (checkin) {
                    exposure.checkin = checkin;
                }
            }

            // Fetch Glucose Data (compute metrics manually)
            // Window: 0 to 3 hours after meal
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
                // Simple baseline: first available reading
                const baseline = values[0];
                const peak = Math.max(...values);
                const peakIndex = values.indexOf(peak);
                const peakTime = glucoseLogs[peakIndex]?.logged_at;

                // Ensure peak is actually after baseline (should be, as it is max)
                // Delta cannot be negative for typical "spike" logic, but if glucose dropped, it is what it is.

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

    return { exposuresByVariant, checkinsByVariant };
}

// Calculate metrics
function calculateVariantMetrics(
    exposures: any[],
    standaloneCheckins: any[]
): VariantMetrics {
    const peak_deltas: number[] = [];
    const times_to_peak: number[] = [];
    const checkin_scores = {
        energy: [] as number[],
        hunger: [] as number[],
        cravings: [] as number[],
        difficulty: [] as number[],
    };
    let n_with_glucose_data = 0;

    // Process exposures (Glucose + Linked Checkins)
    exposures.forEach((exposure: any) => {
        const computed = exposure.computed_glucose;
        const checkin = exposure.checkin; // from meal_checkins

        // Glucose
        if (computed && computed.peak_delta !== null) {
            peak_deltas.push(computed.peak_delta);
            if (computed.time_to_peak_min !== null) {
                times_to_peak.push(computed.time_to_peak_min);
            }
            n_with_glucose_data++;
        }

        // Checkins (mapped from meal_checkins strings to 1-5)
        if (checkin) {
            // Energy: low=1, steady=3, high=5
            if (checkin.energy === 'low') checkin_scores.energy.push(1);
            else if (checkin.energy === 'steady') checkin_scores.energy.push(3);
            else if (checkin.energy === 'high') checkin_scores.energy.push(5);

            // Hunger: low=1 (not hungry), okay=3, high=5 (very hungry)
            if (checkin.fullness === 'low') checkin_scores.hunger.push(5); // "Still hungry"
            else if (checkin.fullness === 'okay') checkin_scores.hunger.push(3);
            else if (checkin.fullness === 'high') checkin_scores.hunger.push(1); // "Very full" -> low hunger

            // Cravings: low=1 (none), medium=3, high=5 (strong)
            if (checkin.cravings === 'low') checkin_scores.cravings.push(1);
            else if (checkin.cravings === 'medium') checkin_scores.cravings.push(3);
            else if (checkin.cravings === 'high') checkin_scores.cravings.push(5);
        }
    });

    // Process standalone checkins (from experiment event payload)
    standaloneCheckins.forEach((evt: any) => {
        const p = evt.payload;
        if (p.energy_1_5) checkin_scores.energy.push(p.energy_1_5);
        if (p.hunger_1_5) checkin_scores.hunger.push(p.hunger_1_5);
        if (p.cravings_1_5) checkin_scores.cravings.push(p.cravings_1_5);
    });

    const metrics: VariantMetrics = {
        n_exposures: exposures.length,
        n_with_glucose_data: n_with_glucose_data,
        median_peak_delta: roundTo(median(peak_deltas), 2),
        mean_peak_delta: roundTo(mean(peak_deltas), 2),
        median_time_to_peak: roundTo(median(times_to_peak), 0),
        avg_energy: roundTo(mean(checkin_scores.energy), 1),
        avg_hunger: roundTo(mean(checkin_scores.hunger), 1),
        avg_cravings: roundTo(mean(checkin_scores.cravings), 1),
    };

    return metrics;
}

// Compare variants
function compareVariants(
    metricsA: VariantMetrics,
    metricsB: VariantMetrics,
    variantKeyA: string,
    variantKeyB: string
): ExperimentComparison {
    const result: ExperimentComparison = {
        winner: null,
        delta: null,
        confidence: 'insufficient',
        direction: 'unknown',
    };

    const minDataPoints = 2; // Relaxed for local testing
    const hasEnoughDataA = metricsA.n_with_glucose_data >= minDataPoints;
    const hasEnoughDataB = metricsB.n_with_glucose_data >= minDataPoints;

    if (!hasEnoughDataA || !hasEnoughDataB) {
        return result;
    }

    const deltaA = metricsA.median_peak_delta;
    const deltaB = metricsB.median_peak_delta;

    if (deltaA === null || deltaB === null) return result;

    const diff = deltaA - deltaB;
    result.delta = roundTo(Math.abs(diff), 2);

    if (Math.abs(diff) < 0.3) {
        result.direction = 'similar';
        result.winner = null;
    } else if (diff > 0) {
        // B is better (A spiked more)
        result.winner = variantKeyB;
        result.direction = 'better';
    } else {
        // A is better
        result.winner = variantKeyA;
        result.direction = 'better';
    }

    const totalPoints = metricsA.n_with_glucose_data + metricsB.n_with_glucose_data;
    if (totalPoints >= 6 && Math.abs(diff) >= 0.5) result.confidence = 'high';
    else if (totalPoints >= 4) result.confidence = 'moderate';
    else result.confidence = 'low';

    return result;
}

// Fallback Summary Generator
function generateLocalSummary(
    templateTitle: string,
    metrics: Record<string, VariantMetrics>,
    comparison: ExperimentComparison
): { summary: string; suggestions: string[] } {
    const summaryParts: string[] = [];
    const suggestions: string[] = [];

    if (comparison.confidence === 'insufficient') {
        summaryParts.push('Keep logging meals to see which option works better for your metabolic health.');
        suggestions.push('Log more meals for each option');
    } else if (comparison.direction === 'similar') {
        summaryParts.push('Both options triggered a similar glucose response.');
        suggestions.push('Choose based on taste and convenience');
    } else if (comparison.winner) {
        summaryParts.push(`${comparison.winner === 'variant_a' ? 'Option A' : 'Option B'} resulted in a lower glucose rise.`);
        suggestions.push(`Prioritize ${comparison.winner === 'variant_a' ? 'Option A' : 'Option B'} for steadier energy`);
    }

    return {
        summary: summaryParts.join(' '),
        suggestions
    };
}

/**
 * Main analysis function
 */
export async function runLocalExperimentAnalysis(
    userId: string,
    userExperiment: UserExperiment,
    variants: any[]
): Promise<AnalysisResult> {
    const { exposuresByVariant, checkinsByVariant } = await fetchExposureData(userExperiment.id, userId);

    const metrics: Record<string, VariantMetrics> = {};
    const variantKeys = variants.map(v => v.key);

    variantKeys.forEach(key => {
        metrics[key] = calculateVariantMetrics(
            exposuresByVariant[key] || [],
            checkinsByVariant[key] || []
        );
    });

    let comparison: ExperimentComparison = {
        winner: null,
        delta: null,
        confidence: 'insufficient',
        direction: 'unknown'
    };

    if (variantKeys.length >= 2) {
        comparison = compareVariants(
            metrics[variantKeys[0]],
            metrics[variantKeys[1]],
            variantKeys[0],
            variantKeys[1]
        );
    }

    const { summary, suggestions } = generateLocalSummary(
        userExperiment.experiment_templates?.title || 'Experiment',
        metrics,
        comparison
    );

    // Check if final
    const required = (userExperiment.experiment_templates?.protocol?.exposures_per_variant || 5) * 2;
    const totalLogged = Object.values(metrics).reduce((sum, m) => sum + m.n_exposures, 0);
    const isFinal = totalLogged >= required;

    return {
        metrics,
        comparison,
        summary,
        suggestions,
        is_final: isFinal
    };
}
