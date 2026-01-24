// supabase/functions/premeal-analyze/index.ts
// Edge Function for AI-powered Pre Meal Check analysis
// Uses deterministic baseline predictor + LLM for explanations

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

// ============================================
// TYPES
// ============================================

interface MealItem {
    display_name: string;
    quantity: number;
    unit?: string;
    nutrients: {
        calories_kcal?: number;
        carbs_g?: number;
        protein_g?: number;
        fat_g?: number;
        fibre_g?: number;
    };
}

interface MealDraft {
    name: string;
    logged_at: string;
    items: MealItem[];
}

interface GlucoseLog {
    glucose_level: number;
    logged_at: string;
    context?: string;
}

interface CurvePoint {
    t_min: number;
    glucose_delta: number;
}

interface Driver {
    text: string;
    reason_code: string;
}

interface AdjustmentTip {
    title: string;
    detail: string;
    benefit_level: 'low' | 'medium' | 'high'; // Replaced risk_reduction_pct
    action_type: string;
}

interface BaselineResult {
    // spike_risk_pct removed
    predicted_curve: CurvePoint[]; // Kept internally for fallback logic but removed from final output if needed
    feature_reason_codes: string[];
    debug: {
        net_carbs: number;
        fibre_g: number;
        protein_g: number;
        fat_g: number;
        time_bucket: string;
        recent_spike_avg: number | null;
    };
}

interface PremealResult {
    // spike_risk_pct removed
    // predicted_curve removed
    drivers: Driver[];
    adjustment_tips: AdjustmentTip[];
    wellness_score?: number;
    debug: BaselineResult['debug'] & {
        personalization?: {
            carb_sensitivity: number;
            avg_peak_time: number;
            baseline_glucose: number;
            data_days: number;
        };
        // NEW: Similar meal memory
        similar_meals?: {
            k: number;
            avg_peak_delta: number;
            avg_peak_time_min: number | null;
            spike_rate: number;
            top_matches?: Array<{ meal_name: string; score: number; peak_delta: number }>;
        } | null;
        // NEW: Context signals
        context?: {
            activity_minutes_last_6h?: number;
            any_activity_last_2h?: boolean;
            recent_avg_glucose_24h?: number;
            recent_variability?: number;
        };
        // NEW: Calibration info
        calibration?: {
            confidence: number;
            n_observations: number;
            carb_sensitivity: number;
            exercise_effect: number;
            sleep_penalty: number;
            driftWeight: number;
        };
    };
}

// Personalized glucose profile derived from user's history
interface UserGlucoseProfile {
    carb_sensitivity: number;       // mmol/L rise per 10g net carbs
    avg_peak_time_min: number;      // typical minutes to glucose peak
    avg_peak_delta: number;         // typical glucose rise in mmol/L
    time_multipliers: Record<string, number>; // morning/midday/afternoon/evening/night
    baseline_glucose: number;       // typical fasting/pre-meal level
    data_quality: 'none' | 'low' | 'medium' | 'high'; // based on data quantity
    data_days: number;              // days of historical data
}

// Meal-glucose pair for correlation analysis
interface MealGlucosePair {
    meal_logged_at: string;
    net_carbs: number;
    pre_meal_glucose: number | null;
    peak_glucose: number | null;
    peak_time_min: number | null;
    time_bucket: string;
}

// Default profile for new users or insufficient data
const DEFAULT_PROFILE: UserGlucoseProfile = {
    carb_sensitivity: 0.4,      // conservative: 4 mmol/L rise per 100g carbs
    avg_peak_time_min: 45,
    avg_peak_delta: 2.5,
    time_multipliers: {
        morning: 1.1,           // Dawn phenomenon
        midday: 1.0,
        afternoon: 1.0,
        evening: 1.15,
        night: 1.25,
    },
    baseline_glucose: 5.5,
    data_quality: 'none',
    data_days: 0,
};

// ============================================
// USER CALIBRATION (Persistent EMA-updated)
// ============================================

interface UserCalibration {
    user_id: string;
    baseline_glucose: number;     // [4.0, 9.0] typical pre-meal
    carb_sensitivity: number;     // [0.1, 1.2] mmol/L per 10g carbs
    avg_peak_time_min: number;    // [25, 120] minutes to peak
    exercise_effect: number;      // [0.0, 0.35] peak reduction per activity unit
    sleep_penalty: number;        // [0.0, 0.45] peak increase per sleep deficit unit
    n_observations: number;
    n_quality_observations: number;
    confidence: number;           // [0, 1]
}

const DEFAULT_CALIBRATION: UserCalibration = {
    user_id: '',
    baseline_glucose: 5.5,
    carb_sensitivity: 0.4,
    avg_peak_time_min: 45,
    exercise_effect: 0.0,
    sleep_penalty: 0.0,
    n_observations: 0,
    n_quality_observations: 0,
    confidence: 0.0,
};

/**
 * Fetch user's persistent calibration from database
 */
async function fetchUserCalibration(
    supabase: any,
    userId: string
): Promise<UserCalibration> {
    try {
        const { data } = await supabase
            .from('user_calibration')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (data) {
            return data as UserCalibration;
        }
    } catch (error) {
        console.log('No calibration found, using defaults');
    }
    return { ...DEFAULT_CALIBRATION, user_id: userId };
}

/**
 * Blend calibration with 14-day rolling profile
 * driftWeight decreases as calibration confidence increases
 */
function blendCalibrationWithDrift(
    calibration: UserCalibration,
    rollingProfile: UserGlucoseProfile
): UserGlucoseProfile {
    // driftWeight = clamp(0.15 * (1 - confidence), 0.05, 0.2)
    const driftWeight = Math.max(0.05, Math.min(0.2, 0.15 * (1 - calibration.confidence)));

    // Blend baseline
    const baseline_glucose = calibration.confidence > 0
        ? (1 - driftWeight) * calibration.baseline_glucose + driftWeight * rollingProfile.baseline_glucose
        : rollingProfile.baseline_glucose;

    // Blend sensitivity
    const carb_sensitivity = calibration.confidence > 0
        ? (1 - driftWeight) * calibration.carb_sensitivity + driftWeight * rollingProfile.carb_sensitivity
        : rollingProfile.carb_sensitivity;

    // Blend peak time
    const avg_peak_time_min = calibration.confidence > 0
        ? Math.round((1 - driftWeight) * calibration.avg_peak_time_min + driftWeight * rollingProfile.avg_peak_time_min)
        : rollingProfile.avg_peak_time_min;

    return {
        ...rollingProfile,
        baseline_glucose: Math.round(baseline_glucose * 10) / 10,
        carb_sensitivity: Math.round(carb_sensitivity * 100) / 100,
        avg_peak_time_min,
        // Keep data quality from rolling profile
    };
}

/**
 * Compute activity_score and sleep_deficit for prediction modifiers
 */
function computeContextScores(context: ContextFeatures): {
    activity_score: number;
    sleep_deficit: number;
} {
    // activity_score from recent weighted activity
    let activity_score = 0;
    if (context.any_activity_last_2h) {
        activity_score = 1.0;
    } else if (context.intensity_weighted_minutes) {
        activity_score = Math.min(1.5, context.intensity_weighted_minutes / 30);
    }

    // sleep_deficit from sleep hours
    let sleep_deficit = 0;
    if (context.sleep_hours_last_night != null && context.sleep_hours_last_night < 7) {
        sleep_deficit = Math.min(1.5, (7 - context.sleep_hours_last_night) / 3);
    }

    return { activity_score, sleep_deficit };
}

/**
 * Apply calibration modifiers (exercise, sleep) to peak delta
 */
function applyCalibrationModifiers(
    basePeakDelta: number,
    calibration: UserCalibration,
    activityScore: number,
    sleepDeficit: number
): number {
    // Apply sleep penalty: peak *= (1 + sleep_penalty * sleep_deficit)
    let peakDelta = basePeakDelta * (1 + calibration.sleep_penalty * sleepDeficit);

    // Apply exercise reduction: peak *= (1 - exercise_effect * activity_score)
    // Clamp multiplier to not go below 0.5
    const exerciseMultiplier = Math.max(0.5, 1 - calibration.exercise_effect * activityScore);
    peakDelta = peakDelta * exerciseMultiplier;

    // Clamp result
    return Math.max(0.5, Math.min(8, peakDelta));
}

// ============================================
// CONTEXT FEATURES (Future HealthKit Ready)
// ============================================

interface ContextFeatures {
    // Activity (available now)
    activity_minutes_last_6h?: number;
    intensity_weighted_minutes?: number;
    any_activity_last_2h?: boolean;

    // Sleep (MVP placeholder, future HealthKit)
    sleep_hours_last_night?: number;

    // Glucose state (available now)
    recent_avg_glucose_24h?: number;
    recent_variability?: number;
    recent_high_count?: number;

    // Future HealthKit signals
    resting_hr?: number;
    hrv?: number;
    steps_today?: number;
    stress_score?: number;
}

// ============================================
// SIMILAR MEAL MEMORY
// ============================================

interface SimilarMealStats {
    k: number;                    // Number of similar meals found
    avg_peak_delta: number;       // Average glucose rise
    avg_peak_time_min: number | null;
    spike_rate: number;           // % of similar meals that spiked
    matches: Array<{
        meal_name: string;
        score: number;
        peak_delta: number;
    }>;
}

// Stopwords to filter from meal tokens
const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'with', 'of', 'in', 'on', 'for',
    'to', 'from', 'by', 'at', 'as', 'is', 'it', 'no', 'not'
]);

function normalizeToken(token: string): string {
    return token.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

function buildMealTokens(mealDraft: MealDraft): string[] {
    const tokens: string[] = [];

    // Tokenize meal name
    for (const word of mealDraft.name.split(/\s+/)) {
        const normalized = normalizeToken(word);
        if (normalized.length >= 3 && !STOPWORDS.has(normalized)) {
            tokens.push(normalized);
        }
    }

    // Tokenize item names
    for (const item of mealDraft.items) {
        for (const word of item.display_name.split(/\s+/)) {
            const normalized = normalizeToken(word);
            if (normalized.length >= 3 && !STOPWORDS.has(normalized)) {
                tokens.push(normalized);
            }
        }
    }

    return [...new Set(tokens)]; // Dedupe
}

function jaccardSimilarity(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = [...setA].filter(x => setB.has(x)).length;
    const union = new Set([...a, ...b]).size;
    return intersection / union;
}

async function fetchSimilarMealStats(
    supabase: any,
    userId: string,
    mealTokens: string[]
): Promise<SimilarMealStats | null> {
    if (mealTokens.length === 0) return null;

    // Fetch last 200 completed reviews with tokens
    const { data: reviews } = await supabase
        .from('post_meal_reviews')
        .select('meal_name, peak_delta, time_to_peak_min, status_tag, meal_tokens')
        .eq('user_id', userId)
        .eq('status', 'opened')
        .not('peak_delta', 'is', null)
        .order('meal_time', { ascending: false })
        .limit(200);

    if (!reviews || reviews.length === 0) return null;

    // Calculate similarity scores
    const scored = reviews.map((r: any) => ({
        ...r,
        score: jaccardSimilarity(mealTokens, r.meal_tokens || []),
    }));

    // Filter by threshold and take top 5
    const THRESHOLD = 0.25;
    const matches = scored
        .filter((r: any) => r.score >= THRESHOLD)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 5);

    if (matches.length === 0) return null;

    // Calculate stats
    const avgPeakDelta = matches.reduce((s: number, m: any) => s + (m.peak_delta || 0), 0) / matches.length;
    const validPeakTimes = matches.filter((m: any) => m.time_to_peak_min != null);
    const avgPeakTime = validPeakTimes.length > 0
        ? validPeakTimes.reduce((s: number, m: any) => s + m.time_to_peak_min, 0) / validPeakTimes.length
        : null;
    const spikeCount = matches.filter((m: any) => m.status_tag === 'spike').length;

    return {
        k: matches.length,
        avg_peak_delta: Math.round(avgPeakDelta * 10) / 10,
        avg_peak_time_min: avgPeakTime ? Math.round(avgPeakTime) : null,
        spike_rate: Math.round((spikeCount / matches.length) * 100) / 100,
        matches: matches.slice(0, 3).map((m: any) => ({
            meal_name: m.meal_name || 'Unknown',
            score: Math.round(m.score * 100) / 100,
            peak_delta: Math.round((m.peak_delta || 0) * 10) / 10,
        })),
    };
}

function blendWithSimilarMeals(
    baseRisk: number,
    basePeakDelta: number,
    basePeakTime: number,
    similarStats: SimilarMealStats | null
): { risk: number; peakDelta: number; peakTime: number } {
    if (!similarStats || similarStats.k === 0) {
        return { risk: baseRisk, peakDelta: basePeakDelta, peakTime: basePeakTime };
    }

    // Weight increases with k (more similar meals = more confidence)
    const weight = Math.min(0.4, 0.1 * similarStats.k);

    // Blend peak delta
    let peakDelta = basePeakDelta * (1 - weight) + similarStats.avg_peak_delta * weight;
    peakDelta = Math.max(0.5, Math.min(8, peakDelta)); // Clamp

    // Blend peak time if available
    let peakTime = basePeakTime;
    if (similarStats.avg_peak_time_min != null) {
        peakTime = basePeakTime * (1 - weight) + similarStats.avg_peak_time_min * weight;
        peakTime = Math.max(25, Math.min(120, Math.round(peakTime)));
    }

    // Risk adjustment based on similar meal outcomes
    let riskAdjust = 0;
    if (similarStats.spike_rate >= 0.5) riskAdjust += 15;
    else if (similarStats.spike_rate >= 0.3) riskAdjust += 8;

    if (similarStats.avg_peak_delta >= 4.0) riskAdjust += 10;
    else if (similarStats.avg_peak_delta >= 3.0) riskAdjust += 5;

    // Clamp total adjustment to max +25
    const risk = Math.min(100, Math.max(0, baseRisk + Math.min(25, riskAdjust)));

    return { risk, peakDelta, peakTime };
}

// ============================================
// BASELINE PREDICTOR (Deterministic)
// ============================================

function getTimeBucket(date: Date): string {
    const hour = date.getHours();
    if (hour >= 5 && hour < 10) return 'morning';
    if (hour >= 10 && hour < 14) return 'midday';
    if (hour >= 14 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 22) return 'evening';
    return 'night';
}

function getTimeModifier(bucket: string): number {
    // Late evening/night meals tend to cause higher spikes
    switch (bucket) {
        case 'morning': return 0.9;
        case 'midday': return 1.0;
        case 'afternoon': return 1.0;
        case 'evening': return 1.15;
        case 'night': return 1.25;
        default: return 1.0;
    }
}

function calculateBaselineRisk(
    macros: { carbs: number; fibre: number; protein: number; fat: number },
    timeBucket: string,
    recentSpikeAvg: number | null
): number {
    // Net carbs = carbs - fibre (minimum 0)
    const netCarbs = Math.max(macros.carbs - macros.fibre, 0);

    // Base risk from net carbs (logarithmic scale, caps around 80%)
    // 0g = 0%, 20g = ~30%, 50g = ~50%, 100g = ~70%
    let baseRisk = Math.min(80, 15 * Math.log(netCarbs + 1));

    // Protein reduces risk (up to -15%)
    const proteinReduction = Math.min(15, macros.protein * 0.3);

    // Fat slows absorption, reduces spike (up to -10%)
    const fatReduction = Math.min(10, macros.fat * 0.2);

    // Fibre reduces risk (up to -15%, more realistic than previous 20%)
    // 10g fiber = 12% reduction (was 20% before, which was too aggressive)
    const fibreReduction = Math.min(15, macros.fibre * 1.2);

    // Time-of-day modifier
    const timeModifier = getTimeModifier(timeBucket);

    // Apply modifiers
    let risk = (baseRisk - proteinReduction - fatReduction - fibreReduction) * timeModifier;

    // Personalization: if user has recent spikes, increase risk
    if (recentSpikeAvg !== null && recentSpikeAvg > 9.0) {
        // User tends to spike - increase risk by 10-20%
        const spikeBonus = Math.min(20, (recentSpikeAvg - 9) * 5);
        risk += spikeBonus;
    }

    // Add baseline (minimum 10% for any meal with carbs)
    if (netCarbs > 5) {
        risk = Math.max(risk, 15);
    }

    // Clamp between 0-100
    return Math.round(Math.max(0, Math.min(100, risk)));
}

// ============================================
// PERSONALIZED CURVE GENERATION
// ============================================

/**
 * Calculate user's glucose profile from their historical meal-glucose data
 */
function calculateUserGlucoseProfile(
    glucoseLogs: GlucoseLog[],
    meals: Array<{ logged_at: string; net_carbs: number }>,
): UserGlucoseProfile {
    if (glucoseLogs.length < 10 || meals.length < 3) {
        return { ...DEFAULT_PROFILE, data_quality: 'none', data_days: 0 };
    }

    // Calculate data coverage in days
    const dates = glucoseLogs.map(l => new Date(l.logged_at).toDateString());
    const uniqueDays = new Set(dates).size;

    // Determine data quality
    let dataQuality: 'none' | 'low' | 'medium' | 'high' = 'none';
    if (uniqueDays >= 14 && glucoseLogs.length >= 50) dataQuality = 'high';
    else if (uniqueDays >= 7 && glucoseLogs.length >= 20) dataQuality = 'medium';
    else if (uniqueDays >= 3) dataQuality = 'low';

    // Calculate baseline glucose (average of pre-meal/fasting readings)
    // Handle both old ('fasting', 'before_meal') and new ('pre_meal') contexts
    const baselineReadings = glucoseLogs.filter(
        log => ['fasting', 'pre_meal', 'before_meal'].includes(log.context || '')
    );
    const baselineGlucose = baselineReadings.length >= 3
        ? baselineReadings.reduce((sum, l) => sum + l.glucose_level, 0) / baselineReadings.length
        : DEFAULT_PROFILE.baseline_glucose;

    // Calculate peak analysis from post-meal readings
    const postMealReadings = glucoseLogs.filter(log => log.context === 'post_meal');
    const avgPeakDelta = postMealReadings.length >= 3
        ? Math.max(0, (postMealReadings.reduce((sum, l) => sum + l.glucose_level, 0) / postMealReadings.length) - baselineGlucose)
        : DEFAULT_PROFILE.avg_peak_delta;

    // Calculate time-of-day multipliers
    const timeBuckets: Record<string, number[]> = {
        morning: [], midday: [], afternoon: [], evening: [], night: []
    };

    postMealReadings.forEach(log => {
        const hour = new Date(log.logged_at).getHours();
        const delta = log.glucose_level - baselineGlucose;
        if (hour >= 5 && hour < 10) timeBuckets.morning.push(delta);
        else if (hour >= 10 && hour < 14) timeBuckets.midday.push(delta);
        else if (hour >= 14 && hour < 18) timeBuckets.afternoon.push(delta);
        else if (hour >= 18 && hour < 22) timeBuckets.evening.push(delta);
        else timeBuckets.night.push(delta);
    });

    const overallAvgDelta = avgPeakDelta || 2.5;
    const timeMultipliers: Record<string, number> = {};

    for (const [bucket, deltas] of Object.entries(timeBuckets)) {
        if (deltas.length >= 2) {
            const bucketAvg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
            timeMultipliers[bucket] = Math.max(0.5, Math.min(1.5, bucketAvg / overallAvgDelta));
        } else {
            timeMultipliers[bucket] = DEFAULT_PROFILE.time_multipliers[bucket];
        }
    }

    // Calculate carb sensitivity (if we have meal-glucose pairs)
    // Simplified: use average post-meal spike / average carb intake
    const avgNetCarbs = meals.length > 0
        ? meals.reduce((sum, m) => sum + m.net_carbs, 0) / meals.length
        : 30;

    const carbSensitivity = avgNetCarbs > 0
        ? (avgPeakDelta / (avgNetCarbs / 10)) // per 10g carbs
        : DEFAULT_PROFILE.carb_sensitivity;

    return {
        carb_sensitivity: Math.max(0.1, Math.min(1.0, carbSensitivity)),
        avg_peak_time_min: 45, // Default for now, would need timestamped meal+glucose pairs
        avg_peak_delta: Math.round(avgPeakDelta * 10) / 10,
        time_multipliers: timeMultipliers,
        baseline_glucose: Math.round(baselineGlucose * 10) / 10,
        data_quality: dataQuality,
        data_days: uniqueDays,
    };
}

/**
 * Generate personalized glucose curve based on user's profile and meal
 */
function generatePersonalizedCurve(
    profile: UserGlucoseProfile,
    netCarbs: number,
    timeBucket: string,
    riskPct: number
): CurvePoint[] {
    const points: CurvePoint[] = [];

    // Use personalized parameters
    const peakTime = profile.avg_peak_time_min;
    const timeMultiplier = profile.time_multipliers[timeBucket] || 1.0;

    // Calculate peak delta based on carb sensitivity and meal carbs
    // peakDelta = (carbs / 10) * sensitivity * time_multiplier
    let peakDelta = (netCarbs / 10) * profile.carb_sensitivity * timeMultiplier;

    // Blend with risk-based estimate for robustness
    const riskBasedPeak = (riskPct / 100) * 4 + (netCarbs / 50) * 2;

    // Weight: more trust in personalized if data quality is high
    const personalWeight = profile.data_quality === 'high' ? 0.8
        : profile.data_quality === 'medium' ? 0.6
            : profile.data_quality === 'low' ? 0.4
                : 0.2;

    peakDelta = (peakDelta * personalWeight) + (riskBasedPeak * (1 - personalWeight));

    // Cap peak at reasonable values (1-8 mmol/L rise)
    peakDelta = Math.max(0.5, Math.min(8, peakDelta));

    // Generate curve points with actual glucose values (baseline + delta)
    for (let t = 0; t <= 180; t += 10) {
        let delta: number;
        if (t <= peakTime) {
            // Rising phase (smooth quadratic)
            delta = peakDelta * Math.pow(t / peakTime, 1.5);
        } else {
            // Falling phase (exponential decay - faster return for healthy response)
            const decayRate = 0.015 + (profile.data_quality === 'high' ? 0.005 : 0);
            delta = peakDelta * Math.exp(-decayRate * (t - peakTime));
        }

        // Store as actual glucose value (baseline + delta)
        const glucoseValue = profile.baseline_glucose + delta;
        points.push({
            t_min: t,
            glucose_delta: Math.round(glucoseValue * 10) / 10
        });
    }

    return points;
}

function getFeatureReasonCodes(
    macros: { carbs: number; fibre: number; protein: number; fat: number },
    timeBucket: string,
    recentSpikeAvg: number | null
): string[] {
    const codes: string[] = [];
    const netCarbs = Math.max(macros.carbs - macros.fibre, 0);

    if (netCarbs > 50) codes.push('HIGH_NET_CARBS');
    else if (netCarbs > 30) codes.push('MODERATE_NET_CARBS');

    if (macros.fibre < 5) codes.push('LOW_FIBRE');
    else if (macros.fibre >= 10) codes.push('GOOD_FIBRE');

    if (macros.protein >= 20) codes.push('GOOD_PROTEIN');
    else if (macros.protein < 10) codes.push('LOW_PROTEIN');

    if (macros.fat >= 15) codes.push('GOOD_FAT');

    if (timeBucket === 'evening' || timeBucket === 'night') codes.push('LATE_MEAL');

    if (recentSpikeAvg !== null && recentSpikeAvg > 9.0) codes.push('RECENT_SPIKES');

    return codes;
}

function runBaselinePredictor(
    items: MealItem[],
    loggedAt: string,
    recentGlucoseLogs: GlucoseLog[],
    userProfile: UserGlucoseProfile
): BaselineResult {
    // Sum up macros
    const macros = items.reduce(
        (acc, item) => ({
            carbs: acc.carbs + ((item.nutrients?.carbs_g || 0) * item.quantity),
            fibre: acc.fibre + ((item.nutrients?.fibre_g || 0) * item.quantity),
            protein: acc.protein + ((item.nutrients?.protein_g || 0) * item.quantity),
            fat: acc.fat + ((item.nutrients?.fat_g || 0) * item.quantity),
        }),
        { carbs: 0, fibre: 0, protein: 0, fat: 0 }
    );

    // Get time bucket
    const mealDate = new Date(loggedAt);
    const timeBucket = getTimeBucket(mealDate);

    // Calculate recent spike average (post-meal readings above user's baseline + typical post-meal rise)
    // Using user-relative threshold instead of hardcoded clinical value
    const spikeThreshold = userProfile.baseline_glucose + 2.0; // User's baseline plus typical rise
    let recentSpikeAvg: number | null = null;
    const postMealReadings = recentGlucoseLogs.filter(
        log => log.context === 'post_meal' && log.glucose_level > spikeThreshold
    );
    if (postMealReadings.length >= 3) {
        recentSpikeAvg = postMealReadings.reduce((sum, log) => sum + log.glucose_level, 0) / postMealReadings.length;
    }

    // Calculate risk
    const riskPct = calculateBaselineRisk(macros, timeBucket, recentSpikeAvg);

    // Generate PERSONALIZED curve using user's profile
    const netCarbs = Math.max(macros.carbs - macros.fibre, 0);
    const curve = generatePersonalizedCurve(userProfile, netCarbs, timeBucket, riskPct);

    // Get reason codes
    const reasonCodes = getFeatureReasonCodes(macros, timeBucket, recentSpikeAvg);

    return {
        // spike_risk_pct removed
        predicted_curve: curve,
        feature_reason_codes: reasonCodes,
        debug: {
            net_carbs: Math.round(netCarbs * 10) / 10,
            fibre_g: Math.round(macros.fibre * 10) / 10,
            protein_g: Math.round(macros.protein * 10) / 10,
            fat_g: Math.round(macros.fat * 10) / 10,
            time_bucket: timeBucket,
            recent_spike_avg: recentSpikeAvg ? Math.round(recentSpikeAvg * 10) / 10 : null,
        },
    };
}

// ============================================
// LLM EXPLANATION GENERATOR
// ============================================

function buildLLMPrompt(
    baseline: BaselineResult,
    mealName: string,
    topItems: string[]
): string {
    const { feature_reason_codes, debug } = baseline;

    return `You are a nutrition assistant helping users understand their meal's wellness balance.
    
Given this meal analysis, generate helpful explanations:

MEAL: "${mealName}"
TOP ITEMS: ${topItems.join(', ')}
MACROS: Net Carbs ${debug.net_carbs}g, Fibre ${debug.fibre_g}g, Protein ${debug.protein_g}g, Fat ${debug.fat_g}g
TIME: ${debug.time_bucket}
REASON CODES: ${feature_reason_codes.join(', ')}
${debug.recent_spike_avg ? `RECENT TREND: ${debug.recent_spike_avg} mmol/L rise` : ''}

Generate JSON with:
1. "drivers": 3-5 bullet points explaining the meal's balance. Each must reference a specific measurable input (net carbs, fibre, protein, time, etc). Be concise and encouraging or neutral.
2. "adjustment_tips": 3-4 practical tips to improve balance. Each needs:
   - "title": short action (e.g., "Add more fiber")
   - "detail": one-liner explanation (under 100 chars)
   - "benefit_level": one of "low", "medium", "high"
   - "action_type": one of ADD_FIBRE, ADD_PROTEIN, PORTION_DOWN, POST_MEAL_WALK, SWAP_ITEM

RULES:
- Be practical, not alarming. Use positive reinforcement.
- No medical claims or medication advice.
- Avoid clinical terms like "diagnose", "treat", "risk", "spike", "diabetes".
- Reference actual numbers from the meal.
- Output ONLY valid JSON, no markdown or prose.

Example output format:
{
  "drivers": [
    {"text": "Moderate net carbs (45g) provides steady energy", "reason_code": "MODERATE_NET_CARBS"},
    {"text": "Low fiber (3g) might mean faster digestion", "reason_code": "LOW_FIBRE"}
  ],
  "adjustment_tips": [
    {"title": "Add a side salad", "detail": "Extra fiber supports steady glucose", "benefit_level": "medium", "action_type": "ADD_FIBRE"},
    {"title": "Take a 10-min walk after eating", "detail": "Movement helps muscles use energy", "benefit_level": "high", "action_type": "POST_MEAL_WALK"}
  ]
}`;
}

async function callGeminiForPremeal(prompt: string): Promise<{ drivers: Driver[]; adjustment_tips: AdjustmentTip[] } | null> {
    try {
        const text = await callGenAI(prompt, {
            temperature: 0.3,
            maxOutputTokens: 600,
            jsonOutput: true,
        });

        if (!text) {
            console.error('Vertex AI returned empty response');
            return null;
        }

        // Parse JSON from response
        const parsed = JSON.parse(text);
        return {
            drivers: parsed.drivers || [],
            adjustment_tips: parsed.adjustment_tips || [],
        };
    } catch (error) {
        console.error('Vertex AI call failed:', error);
        return null;
    }
}

async function callOpenAI(prompt: string): Promise<{ drivers: Driver[]; adjustment_tips: AdjustmentTip[] } | null> {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
        console.log('OPENAI_API_KEY not configured');
        return null;
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are a nutrition assistant. Output only valid JSON.' },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.3,
                max_tokens: 600,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('OpenAI API error:', response.status, error);
            return null;
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;

        if (!text) {
            console.error('OpenAI returned empty response');
            return null;
        }

        const parsed = JSON.parse(text);
        return {
            drivers: parsed.drivers || [],
            adjustment_tips: parsed.adjustment_tips || [],
        };
    } catch (error) {
        console.error('OpenAI call failed:', error);
        return null;
    }
}

async function generateLLMExplanations(
    baseline: BaselineResult,
    mealName: string,
    topItems: string[]
): Promise<{ drivers: Driver[]; adjustment_tips: AdjustmentTip[] }> {
    const prompt = buildLLMPrompt(baseline, mealName, topItems);

    // Try Gemini first (free tier)
    let result = await callGeminiForPremeal(prompt);

    // Fallback to OpenAI if Gemini fails
    if (!result) {
        console.log('Falling back to OpenAI...');
        result = await callOpenAI(prompt);
    }

    // If both fail, return default explanations based on reason codes
    if (!result) {
        console.log('Both LLMs failed, using fallback explanations');
        return generateFallbackExplanations(baseline);
    }

    const safeDrivers = result.drivers.filter(driver => sanitizeText(driver.text) !== null);
    const safeTips = result.adjustment_tips.filter(
        tip => sanitizeText(tip.title) !== null && sanitizeText(tip.detail) !== null
    );

    if (safeDrivers.length === 0 || safeTips.length === 0) {
        return generateFallbackExplanations(baseline);
    }

    return { drivers: safeDrivers, adjustment_tips: safeTips };
}

function generateFallbackExplanations(baseline: BaselineResult): { drivers: Driver[]; adjustment_tips: AdjustmentTip[] } {
    const { feature_reason_codes, debug } = baseline;
    const drivers: Driver[] = [];
    const tips: AdjustmentTip[] = [];

    // Generate drivers from reason codes
    if (feature_reason_codes.includes('HIGH_NET_CARBS')) {
        drivers.push({ text: `Higher net carbs (${debug.net_carbs}g) can make this meal feel heavier`, reason_code: 'HIGH_NET_CARBS' });
    }
    if (feature_reason_codes.includes('MODERATE_NET_CARBS')) {
        drivers.push({ text: `Moderate net carbs (${debug.net_carbs}g) can support steadier energy`, reason_code: 'MODERATE_NET_CARBS' });
    }
    if (feature_reason_codes.includes('LOW_FIBRE')) {
        drivers.push({ text: `Low fiber (${debug.fibre_g}g) can make this meal digest faster`, reason_code: 'LOW_FIBRE' });
    }
    if (feature_reason_codes.includes('LATE_MEAL')) {
        drivers.push({ text: `Later ${debug.time_bucket} meals can feel different than earlier ones`, reason_code: 'LATE_MEAL' });
    }
    if (feature_reason_codes.includes('RECENT_SPIKES')) {
        drivers.push({ text: `Recent meals have felt less steady than usual`, reason_code: 'RECENT_SPIKES' });
    }
    if (feature_reason_codes.includes('GOOD_PROTEIN')) {
        drivers.push({ text: `Good protein content (${debug.protein_g}g) supports balance`, reason_code: 'GOOD_PROTEIN' });
    }

    // Default drivers if none matched
    if (drivers.length === 0) {
        drivers.push({ text: 'This meal has a balanced macronutrient profile', reason_code: 'BALANCED' });
    }

    // Generate tips
    if (debug.fibre_g < 10) {
        tips.push({ title: 'Add more fiber', detail: 'A side salad can help meals feel steadier', benefit_level: 'medium', action_type: 'ADD_FIBRE' });
    }
    tips.push({ title: 'Take a post-meal walk', detail: '10-15 minutes of walking supports energy use', benefit_level: 'high', action_type: 'POST_MEAL_WALK' });
    if (debug.net_carbs > 40) {
        tips.push({ title: 'Consider a smaller portion', detail: 'Reducing portion size manages carb load', benefit_level: 'high', action_type: 'PORTION_DOWN' });
    }
    if (debug.protein_g < 15) {
        tips.push({ title: 'Add protein', detail: 'Protein supports steadier energy', benefit_level: 'medium', action_type: 'ADD_PROTEIN' });
    }

    return { drivers, adjustment_tips: tips.slice(0, 4) };
}

// ============================================
// CONTEXT SIGNAL FETCHING
// ============================================

async function fetchActivityContext(
    supabase: any,
    userId: string,
    mealTime: Date
): Promise<Partial<ContextFeatures>> {
    const sixHoursAgo = new Date(mealTime.getTime() - 6 * 60 * 60 * 1000);
    const twoHoursAgo = new Date(mealTime.getTime() - 2 * 60 * 60 * 1000);

    try {
        const { data: activities } = await supabase
            .from('activity_logs')
            .select('duration_minutes, intensity, logged_at')
            .eq('user_id', userId)
            .gte('logged_at', sixHoursAgo.toISOString())
            .lte('logged_at', mealTime.toISOString());

        if (!activities || activities.length === 0) {
            return { activity_minutes_last_6h: 0, any_activity_last_2h: false };
        }

        const intensityMap: Record<string, number> = { light: 1, moderate: 2, intense: 3 };
        let totalMinutes = 0;
        let weightedMinutes = 0;
        let recentActivity = false;

        for (const a of activities) {
            totalMinutes += a.duration_minutes || 0;
            weightedMinutes += (a.duration_minutes || 0) * (intensityMap[a.intensity] || 1);
            if (new Date(a.logged_at) >= twoHoursAgo) {
                recentActivity = true;
            }
        }

        return {
            activity_minutes_last_6h: totalMinutes,
            intensity_weighted_minutes: weightedMinutes,
            any_activity_last_2h: recentActivity,
        };
    } catch (error) {
        console.warn('Failed to fetch activity context:', error);
        return {};
    }
}

function fetchGlucoseContext(
    glucoseLogs: GlucoseLog[],
    mealTime: Date
): Partial<ContextFeatures> {
    const oneDayAgo = mealTime.getTime() - 24 * 60 * 60 * 1000;
    const recentLogs = glucoseLogs.filter(
        g => new Date(g.logged_at).getTime() >= oneDayAgo
    );

    if (recentLogs.length === 0) return {};

    const values = recentLogs.map(g => g.glucose_level);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const highCount = values.filter(v => v >= 9.0).length;

    return {
        recent_avg_glucose_24h: Math.round(avg * 10) / 10,
        recent_variability: Math.round(stdDev * 10) / 10,
        recent_high_count: highCount,
    };
}

// ============================================
// DAILY CONTEXT (HealthKit Data) FETCHING
// ============================================

interface DailyContextData {
    sleep_hours: number | null;
    steps: number | null;
    active_minutes: number | null;
    resting_hr: number | null;
    hrv_ms: number | null;
}

async function fetchDailyContext(
    supabase: any,
    userId: string,
    mealDate: Date
): Promise<DailyContextData | null> {
    try {
        const dateStr = mealDate.toISOString().split('T')[0];
        const yesterdayStr = new Date(mealDate.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Try today first, fallback to yesterday
        let { data } = await supabase
            .from('daily_context')
            .select('sleep_hours, steps, active_minutes, resting_hr, hrv_ms')
            .eq('user_id', userId)
            .eq('date', dateStr)
            .single();

        if (!data) {
            const yesterday = await supabase
                .from('daily_context')
                .select('sleep_hours, steps, active_minutes, resting_hr, hrv_ms')
                .eq('user_id', userId)
                .eq('date', yesterdayStr)
                .single();
            data = yesterday.data;
        }

        return data || null;
    } catch (error) {
        console.warn('Failed to fetch daily context:', error);
        return null;
    }
}

/**
 * Generate behavioral drivers based on daily context (sleep, activity)
 * Uses non-medical, behavior-focused language
 */
function getDailyContextDrivers(context: DailyContextData | null): Driver[] {
    if (!context) return [];

    const drivers: Driver[] = [];

    // Sleep-based behavioral drivers (non-medical language)
    if (context.sleep_hours !== null) {
        if (context.sleep_hours < 6) {
            drivers.push({
                text: 'Lower sleep last night may make meals feel harder to handle',
                reason_code: 'LOW_SLEEP_CONTEXT'
            });
        } else if (context.sleep_hours >= 8) {
            drivers.push({
                text: 'Good rest last night supports better meal responses',
                reason_code: 'GOOD_SLEEP_CONTEXT'
            });
        }
    }

    // Activity-based behavioral drivers (non-medical language)
    if (context.active_minutes !== null) {
        if (context.active_minutes >= 30) {
            drivers.push({
                text: 'Being more active today may help your body respond better',
                reason_code: 'HIGH_ACTIVITY_CONTEXT'
            });
        } else if (context.active_minutes < 10) {
            drivers.push({
                text: 'Less movement today may affect how your body handles meals',
                reason_code: 'LOW_ACTIVITY_CONTEXT'
            });
        }
    }

    // Steps-based context
    if (context.steps !== null && context.steps >= 8000) {
        drivers.push({
            text: 'Great step count today supports healthy responses',
            reason_code: 'HIGH_STEPS_CONTEXT'
        });
    }

    return drivers;
}

function applyContextAdjustments(
    baseRisk: number,
    context: ContextFeatures
): { risk: number; reasons: string[] } {
    let risk = baseRisk;
    const reasons: string[] = [];

    // Activity reduces risk
    if (context.any_activity_last_2h) {
        risk -= 8;
        reasons.push('RECENT_ACTIVITY');
    } else if ((context.intensity_weighted_minutes || 0) >= 60) {
        risk -= 5;
        reasons.push('RECENT_ACTIVITY');
    } else if ((context.activity_minutes_last_6h || 0) === 0) {
        risk += 3;
        reasons.push('RECENT_INACTIVITY');
    }

    // Elevated baseline increases risk
    if ((context.recent_avg_glucose_24h || 0) >= 7.5) {
        risk += 8;
        reasons.push('RECENT_HIGH_BASELINE');
    }

    // High variability increases risk
    if ((context.recent_variability || 0) >= 2.0) {
        risk += 5;
        reasons.push('HIGH_VARIABILITY');
    }

    // Graduated sleep penalty based on severity (when available)
    if (context.sleep_hours_last_night != null) {
        const sleepHours = context.sleep_hours_last_night;
        if (sleepHours < 5) {
            // Very poor sleep: significant impact
            risk += 10;
            reasons.push('VERY_LOW_SLEEP');
        } else if (sleepHours < 6) {
            // Poor sleep: moderate impact
            risk += 6;
            reasons.push('LOW_SLEEP');
        } else if (sleepHours < 7) {
            // Suboptimal sleep: minor impact
            risk += 3;
            reasons.push('SUBOPTIMAL_SLEEP');
        }
        // 7+ hours: no penalty
    }

    return { risk: Math.max(0, Math.min(100, risk)), reasons };
}

// ============================================
// CACHING
// ============================================

function generateInputHash(userId: string, mealDraft: MealDraft): string {
    // Create a deterministic hash of the meal inputs
    const inputStr = JSON.stringify({
        userId,
        name: mealDraft.name,
        logged_at: mealDraft.logged_at.substring(0, 13), // Hour precision
        items: mealDraft.items.map(i => ({
            name: i.display_name,
            qty: i.quantity,
            carbs: i.nutrients?.carbs_g,
            fibre: i.nutrients?.fibre_g,
        })).sort((a, b) => a.name.localeCompare(b.name)),
    });

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < inputStr.length; i++) {
        const char = inputStr.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { user_id: requestedUserId, meal_draft } = await req.json() as { user_id?: string; meal_draft: MealDraft };

        if (!meal_draft) {
            return new Response(
                JSON.stringify({ error: 'Missing user_id or meal_draft' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { user, errorResponse } = await requireUser(req, supabase, corsHeaders);
        if (errorResponse) return errorResponse;

        const mismatch = requireMatchingUserId(requestedUserId, user.id, corsHeaders);
        if (mismatch) return mismatch;

        const userId = user.id;
        const aiEnabled = await isAiEnabled(supabase, userId);

        // Check cache first (AI-enabled only)
        const inputHash = generateInputHash(userId, meal_draft);
        if (aiEnabled) {
            const { data: cached } = await supabase
                .from('premeal_checks')
                .select('result')
                .eq('user_id', userId)
                .eq('input_hash', inputHash)
                .single();

            if (cached?.result) {
                console.log('Returning cached result');
                return new Response(
                    JSON.stringify(cached.result),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        // Fetch recent glucose logs for personalization
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

        const { data: glucoseLogs } = await supabase
            .from('glucose_logs')
            .select('glucose_level, logged_at, context')
            .eq('user_id', userId)
            .gte('logged_at', twoWeeksAgo.toISOString())
            .order('logged_at', { ascending: false })
            .limit(100);

        // Fetch recent meals with macros for carb sensitivity calculation
        const { data: recentMeals } = await supabase
            .from('meals')
            .select('logged_at, calories_kcal, carbs_g, fibre_g')
            .eq('user_id', userId)
            .gte('logged_at', twoWeeksAgo.toISOString())
            .order('logged_at', { ascending: false })
            .limit(50);

        // ============================================
        // USER CALIBRATION (Persistent EMA-learned)
        // ============================================
        const calibration = await fetchUserCalibration(supabase, userId);


        // Calculate 14-day rolling profile
        const mealHistory = (recentMeals || []).map((m: any) => ({
            logged_at: m.logged_at,
            net_carbs: Math.max((m.carbs_g || 0) - (m.fibre_g || 0), 0),
        }));

        const rollingProfile = calculateUserGlucoseProfile(
            glucoseLogs || [],
            mealHistory
        );

        // Blend calibration with rolling profile (drift-adjusted)
        const userProfile = blendCalibrationWithDrift(calibration, rollingProfile);
        const driftWeight = Math.max(0.05, Math.min(0.2, 0.15 * (1 - calibration.confidence)));


        // Run baseline predictor with blended profile
        const baseline = runBaselinePredictor(
            meal_draft.items,
            meal_draft.logged_at,
            glucoseLogs || [],
            userProfile
        );

        // ============================================
        // SIMILAR MEAL MEMORY
        // ============================================
        const mealTokens = buildMealTokens(meal_draft);
        const similarStats = await fetchSimilarMealStats(supabase, userId, mealTokens);


        // Blend baseline with similar meal outcomes
        // Context signals (kept for reasons)
        const mealTime = new Date(meal_draft.logged_at);
        const [activityContext, glucoseContext] = await Promise.all([
            fetchActivityContext(supabase, userId, mealTime),
            Promise.resolve(fetchGlucoseContext(glucoseLogs || [], mealTime)),
        ]);

        const contextFeatures: ContextFeatures = {
            ...activityContext,
            ...glucoseContext,
        };

        // Get context reasons (ignoring risk values)
        const { reasons: contextReasons } = applyContextAdjustments(
            50, // Dummy value
            contextFeatures
        );

        // Combine reason codes
        const allReasonCodes = [...baseline.feature_reason_codes, ...contextReasons];

        // ============================================
        // LLM EXPLANATIONS
        // ============================================
        const topItems = meal_draft.items
            .slice(0, 3)
            .map(i => i.display_name);

        // Build enhanced baseline for LLM
        const enhancedBaseline: BaselineResult = {
            ...baseline,
            feature_reason_codes: allReasonCodes,
        };

        const fallback = generateFallbackExplanations(enhancedBaseline);
        const { drivers, adjustment_tips } = aiEnabled
            ? await generateLLMExplanations(enhancedBaseline, meal_draft.name, topItems)
            : fallback;

        // Add context drivers
        const enhancedDrivers = [...drivers];
        if (contextReasons.includes('RECENT_ACTIVITY')) {
            enhancedDrivers.push({ text: 'Recent physical activity will help moderate glucose', reason_code: 'RECENT_ACTIVITY' });
        }
        if (contextReasons.includes('RECENT_INACTIVITY')) {
            enhancedDrivers.push({ text: 'No recent activity – consider a post-meal walk', reason_code: 'RECENT_INACTIVITY' });
        }
        if (contextReasons.includes('RECENT_HIGH_BASELINE')) {
            enhancedDrivers.push({ text: 'Your recent glucose levels have been elevated', reason_code: 'RECENT_HIGH_BASELINE' });
        }
        if (contextReasons.includes('HIGH_VARIABILITY')) {
            enhancedDrivers.push({ text: 'Your glucose has been variable – response may be less predictable', reason_code: 'HIGH_VARIABILITY' });
        }

        // ============================================
        // BUILD RESULT
        // ============================================
        const result: PremealResult = {
            // predicted_curve: baseline.predicted_curve (removed from final output),
            drivers: enhancedDrivers.slice(0, 5), // Limit to 5 drivers
            adjustment_tips,
            debug: {
                ...baseline.debug,
                personalization: {
                    carb_sensitivity: userProfile.carb_sensitivity,
                    avg_peak_time: userProfile.avg_peak_time_min,
                    baseline_glucose: userProfile.baseline_glucose,
                    data_days: userProfile.data_days,
                },
                // NEW: Similar meal memory debug info
                similar_meals: similarStats ? {
                    k: similarStats.k,
                    avg_peak_delta: similarStats.avg_peak_delta,
                    avg_peak_time_min: similarStats.avg_peak_time_min,
                    spike_rate: similarStats.spike_rate,
                    top_matches: similarStats.matches,
                } : null,
                // NEW: Context signals debug info
                context: {
                    activity_minutes_last_6h: contextFeatures.activity_minutes_last_6h,
                    any_activity_last_2h: contextFeatures.any_activity_last_2h,
                    recent_avg_glucose_24h: contextFeatures.recent_avg_glucose_24h,
                    recent_variability: contextFeatures.recent_variability,
                },
                // Risk breakdown removed
                // NEW: Calibration info
                calibration: {
                    confidence: calibration.confidence,
                    n_observations: calibration.n_observations,
                    carb_sensitivity: calibration.carb_sensitivity,
                    exercise_effect: calibration.exercise_effect,
                    sleep_penalty: calibration.sleep_penalty,
                    driftWeight,
                },
            },
        };

        // Cache result (AI-enabled only)
        if (aiEnabled) {
            await supabase
                .from('premeal_checks')
                .upsert({
                    user_id: userId,
                    input_hash: inputHash,
                    result,
                }, { onConflict: 'user_id,input_hash' });
        }

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Premeal analyze error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error', details: String(error) }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
