// supabase/functions/premeal-analyze/index.ts
// Edge Function for AI-powered Pre Meal Check analysis
// Uses deterministic baseline predictor + LLM for explanations

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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
    risk_reduction_pct: number;
    action_type: string;
}

interface BaselineResult {
    spike_risk_pct: number;
    predicted_curve: CurvePoint[];
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
    spike_risk_pct: number;
    predicted_curve: CurvePoint[];
    drivers: Driver[];
    adjustment_tips: AdjustmentTip[];
    debug: BaselineResult['debug'] & {
        personalization?: {
            carb_sensitivity: number;
            avg_peak_time: number;
            baseline_glucose: number;
            data_days: number;
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

    // Fibre reduces risk (up to -20%)
    const fibreReduction = Math.min(20, macros.fibre * 2);

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
    const baselineReadings = glucoseLogs.filter(
        log => log.context === 'fasting' || log.context === 'before_meal'
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

    // Calculate recent spike average (post-meal readings above threshold)
    let recentSpikeAvg: number | null = null;
    const postMealReadings = recentGlucoseLogs.filter(
        log => log.context === 'post_meal' && log.glucose_level > 7.8
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
        spike_risk_pct: riskPct,
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
    const { spike_risk_pct, feature_reason_codes, debug } = baseline;

    return `You are a nutrition assistant helping users understand their meal's glucose impact.

Given this meal analysis, generate helpful explanations:

MEAL: "${mealName}"
TOP ITEMS: ${topItems.join(', ')}
RISK: ${spike_risk_pct}%
MACROS: Net Carbs ${debug.net_carbs}g, Fibre ${debug.fibre_g}g, Protein ${debug.protein_g}g, Fat ${debug.fat_g}g
TIME: ${debug.time_bucket}
REASON CODES: ${feature_reason_codes.join(', ')}
${debug.recent_spike_avg ? `RECENT AVG SPIKE: ${debug.recent_spike_avg} mmol/L` : ''}

Generate JSON with:
1. "drivers": 3-5 bullet points explaining WHY this risk level. Each must reference a specific measurable input (net carbs, fibre, protein, time, etc). Be concise.
2. "adjustment_tips": 3-4 practical tips to reduce risk. Each needs:
   - "title": short action (e.g., "Add more fiber")
   - "detail": one-liner explanation (under 100 chars)
   - "risk_reduction_pct": integer 3-20
   - "action_type": one of ADD_FIBRE, ADD_PROTEIN, PORTION_DOWN, POST_MEAL_WALK, SWAP_ITEM

RULES:
- Be practical, not alarming
- No medical claims or medication advice
- Reference actual numbers from the meal
- Output ONLY valid JSON, no markdown or prose

Example output format:
{
  "drivers": [
    {"text": "High net carbs (45g) will cause a moderate glucose rise", "reason_code": "HIGH_NET_CARBS"},
    {"text": "Low fiber (3g) means faster carb absorption", "reason_code": "LOW_FIBRE"}
  ],
  "adjustment_tips": [
    {"title": "Add a side salad", "detail": "Extra fiber slows carb absorption", "risk_reduction_pct": 8, "action_type": "ADD_FIBRE"},
    {"title": "Take a 10-min walk after eating", "detail": "Movement helps muscles use glucose", "risk_reduction_pct": 12, "action_type": "POST_MEAL_WALK"}
  ]
}`;
}

async function callGemini(prompt: string): Promise<{ drivers: Driver[]; adjustment_tips: AdjustmentTip[] } | null> {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
        console.log('GEMINI_API_KEY not configured');
        return null;
    }

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 600,
                        responseMimeType: 'application/json',
                    },
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error('Gemini API error:', response.status, error);
            return null;
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            console.error('Gemini returned empty response');
            return null;
        }

        // Parse JSON from response
        const parsed = JSON.parse(text);
        return {
            drivers: parsed.drivers || [],
            adjustment_tips: parsed.adjustment_tips || [],
        };
    } catch (error) {
        console.error('Gemini call failed:', error);
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
    let result = await callGemini(prompt);

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

    return result;
}

function generateFallbackExplanations(baseline: BaselineResult): { drivers: Driver[]; adjustment_tips: AdjustmentTip[] } {
    const { feature_reason_codes, debug } = baseline;
    const drivers: Driver[] = [];
    const tips: AdjustmentTip[] = [];

    // Generate drivers from reason codes
    if (feature_reason_codes.includes('HIGH_NET_CARBS')) {
        drivers.push({ text: `High net carbs (${debug.net_carbs}g) will cause a significant glucose rise`, reason_code: 'HIGH_NET_CARBS' });
    }
    if (feature_reason_codes.includes('MODERATE_NET_CARBS')) {
        drivers.push({ text: `Moderate net carbs (${debug.net_carbs}g) may cause a mild glucose rise`, reason_code: 'MODERATE_NET_CARBS' });
    }
    if (feature_reason_codes.includes('LOW_FIBRE')) {
        drivers.push({ text: `Low fiber (${debug.fibre_g}g) means faster carb absorption`, reason_code: 'LOW_FIBRE' });
    }
    if (feature_reason_codes.includes('LATE_MEAL')) {
        drivers.push({ text: `Late ${debug.time_bucket} meals tend to cause higher spikes`, reason_code: 'LATE_MEAL' });
    }
    if (feature_reason_codes.includes('RECENT_SPIKES')) {
        drivers.push({ text: `Your recent post-meal readings have been elevated`, reason_code: 'RECENT_SPIKES' });
    }
    if (feature_reason_codes.includes('GOOD_PROTEIN')) {
        drivers.push({ text: `Good protein content (${debug.protein_g}g) helps moderate the response`, reason_code: 'GOOD_PROTEIN' });
    }

    // Default drivers if none matched
    if (drivers.length === 0) {
        drivers.push({ text: 'This meal has a balanced macronutrient profile', reason_code: 'BALANCED' });
    }

    // Generate tips
    if (debug.fibre_g < 10) {
        tips.push({ title: 'Add more fiber', detail: 'A side salad or vegetables can slow absorption', risk_reduction_pct: 8, action_type: 'ADD_FIBRE' });
    }
    tips.push({ title: 'Take a post-meal walk', detail: '10-15 minutes of walking helps use glucose', risk_reduction_pct: 12, action_type: 'POST_MEAL_WALK' });
    if (debug.net_carbs > 40) {
        tips.push({ title: 'Consider a smaller portion', detail: 'Reducing portion size lowers total carbs', risk_reduction_pct: 15, action_type: 'PORTION_DOWN' });
    }
    if (debug.protein_g < 15) {
        tips.push({ title: 'Add protein', detail: 'Protein slows digestion and reduces spikes', risk_reduction_pct: 10, action_type: 'ADD_PROTEIN' });
    }

    return { drivers, adjustment_tips: tips.slice(0, 4) };
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
        const { user_id, meal_draft } = await req.json() as { user_id: string; meal_draft: MealDraft };

        if (!user_id || !meal_draft) {
            return new Response(
                JSON.stringify({ error: 'Missing user_id or meal_draft' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Check cache first
        const inputHash = generateInputHash(user_id, meal_draft);
        const { data: cached } = await supabase
            .from('premeal_checks')
            .select('result')
            .eq('user_id', user_id)
            .eq('input_hash', inputHash)
            .single();

        if (cached?.result) {
            console.log('Returning cached result');
            return new Response(
                JSON.stringify(cached.result),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Fetch recent glucose logs for personalization
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

        const { data: glucoseLogs } = await supabase
            .from('glucose_logs')
            .select('glucose_level, logged_at, context')
            .eq('user_id', user_id)
            .gte('logged_at', twoWeeksAgo.toISOString())
            .order('logged_at', { ascending: false })
            .limit(100);

        // Fetch recent meals with macros for carb sensitivity calculation
        const { data: recentMeals } = await supabase
            .from('meals')
            .select('logged_at, calories_kcal, carbs_g, fibre_g')
            .eq('user_id', user_id)
            .gte('logged_at', twoWeeksAgo.toISOString())
            .order('logged_at', { ascending: false })
            .limit(50);

        // Calculate user's personalized glucose profile
        const mealHistory = (recentMeals || []).map(m => ({
            logged_at: m.logged_at,
            net_carbs: Math.max((m.carbs_g || 0) - (m.fibre_g || 0), 0),
        }));

        const userProfile = calculateUserGlucoseProfile(
            glucoseLogs || [],
            mealHistory
        );

        console.log('User profile calculated:', {
            data_quality: userProfile.data_quality,
            data_days: userProfile.data_days,
            carb_sensitivity: userProfile.carb_sensitivity,
        });

        // Run baseline predictor with personalized profile
        const baseline = runBaselinePredictor(
            meal_draft.items,
            meal_draft.logged_at,
            glucoseLogs || [],
            userProfile
        );

        // Generate LLM explanations
        const topItems = meal_draft.items
            .slice(0, 3)
            .map(i => i.display_name);

        const { drivers, adjustment_tips } = await generateLLMExplanations(
            baseline,
            meal_draft.name,
            topItems
        );

        // Build result with personalization debug info
        const result: PremealResult = {
            spike_risk_pct: baseline.spike_risk_pct,
            predicted_curve: baseline.predicted_curve,
            drivers,
            adjustment_tips,
            debug: {
                ...baseline.debug,
                personalization: {
                    carb_sensitivity: userProfile.carb_sensitivity,
                    avg_peak_time: userProfile.avg_peak_time_min,
                    baseline_glucose: userProfile.baseline_glucose,
                    data_days: userProfile.data_days,
                },
            },
        };

        // Cache result
        await supabase
            .from('premeal_checks')
            .upsert({
                user_id,
                input_hash: inputHash,
                result,
            }, { onConflict: 'user_id,input_hash' });

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
