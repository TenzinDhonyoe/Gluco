// supabase/functions/personal-insights/index.ts
// LLM-Powered Personal Insights with metabolic profile integration
// Supports both single conversational and bullet modes

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { isAiEnabled } from '../_shared/ai.ts';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// TYPES
// ============================================

type TrackingMode = 'manual_glucose_optional' | 'meals_only' | 'meals_wearables' | 'wearables_only';
type InsightMode = 'single_conversational' | 'bullets';

interface UserMetabolicProfile {
    baseline_resting_hr: number | null;
    baseline_steps: number | null;
    baseline_sleep_hours: number | null;
    baseline_hrv_ms: number | null;
    baseline_metabolic_score: number | null;
    sensitivity_sleep: 'low' | 'medium' | 'high' | 'unknown';
    sensitivity_steps: 'low' | 'medium' | 'high' | 'unknown';
    sensitivity_recovery: 'slow' | 'average' | 'fast' | 'unknown';
    pattern_weekend_disruption: boolean;
    pattern_sleep_sensitive: boolean;
    pattern_activity_sensitive: boolean;
    data_coverage_days: number;
}

interface RecentData {
    today: {
        resting_hr: number | null;
        steps: number | null;
        sleep_hours: number | null;
        metabolic_score: number | null;
    };
    recent_trend: 'up' | 'flat' | 'down';
}

interface BulletInsight {
    category: 'meals' | 'activity' | 'sleep' | 'wellness';
    title: string;
    description: string;
}

interface RequestBody {
    user_id: string;
    tracking_mode: TrackingMode;
    insight_mode?: InsightMode;
    range?: '7d' | '14d';
}

// ============================================
// SAFETY FILTERS (preserved from original)
// ============================================

const BANNED_TERMS = [
    'spike', 'risk', 'treat', 'prevent', 'diagnose', 'insulin', 'clinical',
    'prediabetes', 'diabetes', 'hypoglycemia', 'hyperglycemia',
    'blood sugar', 'therapy', 'treatment', 'disease', 'condition', 'medical',
    'insulin resistance', 'homa-ir',
];

function containsBannedTerms(text: string): boolean {
    const lowerText = text.toLowerCase();
    return BANNED_TERMS.some(term => lowerText.includes(term.toLowerCase()));
}

function sanitizeOutput(text: string): string {
    if (containsBannedTerms(text)) {
        console.warn('Banned terms detected in LLM output, using fallback');
        return "Based on your recent patterns, things look relatively stable. Keep tracking to build a clearer picture of what works for you.";
    }
    return text;
}

// ============================================
// FALLBACK INSIGHTS
// ============================================

const FALLBACK_CONVERSATIONAL = "You're building a picture of your personal patterns. Keep tracking to see how your daily habits connect to how you feel.";

const FALLBACK_BULLETS: BulletInsight[] = [
    { category: 'wellness', title: 'Keep Logging', description: 'Continue logging to build your patterns.' },
    { category: 'activity', title: 'Stay Active', description: 'Try a 10-minute walk today.' },
    { category: 'sleep', title: 'Rest Matters', description: 'Track your sleep to notice patterns.' },
];

// ============================================
// DATA FETCHING
// ============================================

async function fetchMetabolicProfile(
    supabase: ReturnType<typeof createClient>,
    userId: string
): Promise<UserMetabolicProfile | null> {
    const { data, error } = await supabase
        .from('user_metabolic_profile')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error || !data) return null;
    return data;
}

async function fetchRecentData(
    supabase: ReturnType<typeof createClient>,
    userId: string,
    profile: UserMetabolicProfile | null
): Promise<RecentData> {
    // Get last 7 days of daily_context
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const { data: dailyContext } = await supabase
        .from('daily_context')
        .select('date, steps, sleep_hours, resting_hr')
        .eq('user_id', userId)
        .gte('date', startDate.toISOString().split('T')[0])
        .order('date', { ascending: false })
        .limit(7);

    const today = dailyContext?.[0] || {};

    // Calculate trend based on recent vs baseline
    let recent_trend: 'up' | 'flat' | 'down' = 'flat';

    if (profile && dailyContext && dailyContext.length >= 3) {
        const recentScores = dailyContext.slice(0, 3);
        const avgRecentSleep = recentScores
            .filter((d: any) => d.sleep_hours !== null)
            .reduce((sum: number, d: any) => sum + d.sleep_hours, 0) /
            recentScores.filter((d: any) => d.sleep_hours !== null).length || 0;

        if (profile.baseline_sleep_hours) {
            const diff = avgRecentSleep - profile.baseline_sleep_hours;
            if (diff > 0.5) recent_trend = 'up';
            else if (diff < -0.5) recent_trend = 'down';
        }
    }

    return {
        today: {
            resting_hr: today.resting_hr ?? null,
            steps: today.steps ?? null,
            sleep_hours: today.sleep_hours ?? null,
            metabolic_score: null, // Would compute or fetch
        },
        recent_trend,
    };
}

// ============================================
// PERSONALIZED COACH PROMPT (User's Spec)
// ============================================

const COACH_SYSTEM_PROMPT = `You are a personalized wellness coach focused on metabolic efficiency and daily energy regulation.
You are NOT a medical provider.
You do NOT diagnose disease or reference medical conditions.

Your job is to generate calm, highly personalized insights based on a user's own historical patterns, not population averages.

Context You Will Receive:
- A user metabolic profile (baselines, sensitivities, patterns)
- Recent metrics (last 1-7 days)
- A trend direction (improving / stable / declining)

Treat this information as the source of truth.

How to Generate Insights:
1. Observation - Describe what changed or stayed stable
2. Personal Context - Compare today to this user's baseline
3. Interpretation - Explain what this usually means for them
4. Optional Gentle Action - Offer 1 low-pressure suggestion (never commands)

Language Rules (STRICT):
- Always say "for you", "your usual pattern", "compared to your normal"
- NEVER mention: insulin resistance, diabetes, prediabetes, disease risk, clinical thresholds
- NEVER give medical advice
- Avoid fear-based or urgent language
- Keep tone calm, reflective, and supportive
- Max 3-5 sentences total

Goal: Make the user feel understood, remembered, calmly guided, never judged or alarmed.
You are a long-term companion, not a one-time explainer.

OUTPUT FORMAT: Return ONLY the personalized insight text, nothing else.`;

const BULLETS_SYSTEM_PROMPT = `You are a wellness insights assistant. Generate 3-5 personalized insights based on the user's metrics.

CRITICAL RULES:
1. Use ONLY these verbs: noticed, logged, tended to, try, experiment, tracked, completed, averaged.
2. NEVER use: improve, reduce, increase, stabilize, control, manage, spike, risk, treat, prevent, diagnose, insulin, clinical.
3. Focus on behaviours, not outcomes.
4. Each insight MUST include at least one specific number from the data.
5. Do NOT make health claims.
6. Keep titles under 30 characters, descriptions under 150 characters.

OUTPUT FORMAT: Return ONLY a valid JSON array:
[{"category": "wellness", "title": "Your Title", "description": "Description with a number."}]`;

// ============================================
// LLM CALLS
// ============================================

async function callLLMConversational(
    profile: UserMetabolicProfile | null,
    recentData: RecentData
): Promise<string> {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
        console.error('OPENAI_API_KEY not set');
        return FALLBACK_CONVERSATIONAL;
    }

    // Build personalized context
    const profileContext = profile ? `
USER METABOLIC PROFILE:
- Baselines (your normal): RHR ${profile.baseline_resting_hr ?? 'unknown'} bpm, ${profile.baseline_steps ?? 'unknown'} steps/day, ${profile.baseline_sleep_hours ?? 'unknown'}h sleep
- Sensitivities: Sleep impact on score is ${profile.sensitivity_sleep}, Activity impact is ${profile.sensitivity_steps}
- Patterns: ${profile.pattern_weekend_disruption ? 'Weekends tend to disrupt your rhythm. ' : ''}${profile.pattern_sleep_sensitive ? 'You seem sensitive to sleep changes. ' : ''}${profile.pattern_activity_sensitive ? 'Activity levels affect how you feel. ' : ''}
- Data coverage: ${profile.data_coverage_days} days of tracking
` : `USER METABOLIC PROFILE: Limited data available. Focus on general encouragement.`;

    const recentContext = `
RECENT DATA:
- Today: RHR ${recentData.today.resting_hr ?? 'not recorded'}, Steps ${recentData.today.steps ?? 'not recorded'}, Sleep ${recentData.today.sleep_hours ?? 'not recorded'}h
- Trend: ${recentData.recent_trend === 'up' ? 'improving' : recentData.recent_trend === 'down' ? 'declining' : 'stable'}
`;

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
                    { role: 'system', content: COACH_SYSTEM_PROMPT },
                    { role: 'user', content: profileContext + recentContext + '\n\nGenerate a personalized insight based on this context.' },
                ],
                temperature: 0.7,
                max_tokens: 250,
            }),
        });

        if (!response.ok) {
            console.error('OpenAI API error:', response.status);
            return FALLBACK_CONVERSATIONAL;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim() || '';

        return sanitizeOutput(content) || FALLBACK_CONVERSATIONAL;
    } catch (error) {
        console.error('LLM call failed:', error);
        return FALLBACK_CONVERSATIONAL;
    }
}

async function callLLMBullets(
    profile: UserMetabolicProfile | null,
    recentData: RecentData
): Promise<BulletInsight[]> {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) return FALLBACK_BULLETS;

    const metricsContext = `
USER METRICS:
- Baseline steps: ${profile?.baseline_steps ?? 'unknown'}
- Recent steps: ${recentData.today.steps ?? 'not recorded'}
- Baseline sleep: ${profile?.baseline_sleep_hours ?? 'unknown'}h
- Recent sleep: ${recentData.today.sleep_hours ?? 'not recorded'}h
- Data coverage: ${profile?.data_coverage_days ?? 0} days
- Trend: ${recentData.recent_trend}
`;

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
                    { role: 'system', content: BULLETS_SYSTEM_PROMPT },
                    { role: 'user', content: metricsContext },
                ],
                temperature: 0.7,
                max_tokens: 400,
            }),
        });

        if (!response.ok) return FALLBACK_BULLETS;

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return FALLBACK_BULLETS;

        const parsed = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(parsed)) return FALLBACK_BULLETS;

        // Filter out any with banned terms
        return parsed
            .filter((i: any) =>
                typeof i.title === 'string' &&
                typeof i.description === 'string' &&
                !containsBannedTerms(i.title) &&
                !containsBannedTerms(i.description)
            )
            .slice(0, 5);
    } catch (error) {
        console.error('LLM bullets call failed:', error);
        return FALLBACK_BULLETS;
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
        const {
            user_id: requestedUserId,
            tracking_mode,
            insight_mode = 'single_conversational',
        } = body;

        if (!requestedUserId || !tracking_mode) {
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

        const userId = user.id;
        const aiEnabled = await isAiEnabled(supabase, userId);

        // Fetch user's metabolic profile and recent data
        const profile = await fetchMetabolicProfile(supabase, userId);
        const recentData = await fetchRecentData(supabase, userId, profile);

        if (insight_mode === 'single_conversational') {
            // Single conversational insight (default)
            let insight = FALLBACK_CONVERSATIONAL;

            if (aiEnabled) {
                insight = await callLLMConversational(profile, recentData);
            }

            return new Response(
                JSON.stringify({
                    insight,
                    mode: 'single_conversational',
                    profile_exists: profile !== null,
                    recent_trend: recentData.recent_trend,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        } else {
            // Bullet insights
            let insights = FALLBACK_BULLETS;

            if (aiEnabled) {
                insights = await callLLMBullets(profile, recentData);
            }

            if (insights.length === 0) {
                insights = FALLBACK_BULLETS;
            }

            return new Response(
                JSON.stringify({
                    insights,
                    mode: 'bullets',
                    profile_exists: profile !== null,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }
    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({
                error: 'Internal server error',
                insight: FALLBACK_CONVERSATIONAL,
                insights: FALLBACK_BULLETS,
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
