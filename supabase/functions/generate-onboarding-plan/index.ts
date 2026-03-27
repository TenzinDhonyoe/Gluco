// supabase/functions/generate-onboarding-plan/index.ts
// Edge Function for generating a personalized onboarding wellness plan using Gemini AI

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { isAiEnabled } from '../_shared/ai.ts';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';
import { containsBannedTerms } from '../_shared/safety.ts';
import { callGenAI } from '../_shared/genai.ts';
import { sanitizeForPrompt, sanitizeArrayForPrompt } from '../_shared/sanitize-prompt.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || Deno.env.get('SUPABASE_URL') || '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface OnboardingPlanResult {
    plan_title: string;
    plan_sentences: string[];
    source: 'ai' | 'fallback';
}

interface ProfileData {
    first_name: string | null;
    goals: string[] | null;
    coaching_style: string | null;
    tracking_mode: string | null;
    com_b_barrier: string | null;
    readiness_level: string | null;
    dietary_preferences: string[] | null;
    cultural_food_context: string | null;
}

const GOAL_LABELS: Record<string, string> = {
    'manage_glucose': 'managing your glucose levels',
    'eat_healthier': 'eating healthier',
    'lose_weight': 'reaching a healthier weight',
    'more_energy': 'boosting your energy',
    'build_habits': 'building lasting habits',
    'understand_body': 'understanding how your body responds to food',
};

const TRACKING_LABELS: Record<string, string> = {
    'meals_wearables': 'meal logging and health data',
    'meals_only': 'meal tracking',
    'manual_glucose_optional': 'meal and glucose tracking',
    'wearables_only': 'health data tracking',
    'glucose_tracking': 'glucose tracking',
};

const COACHING_LABELS: Record<string, string> = {
    'light': 'gentle, low-frequency',
    'balanced': 'balanced',
    'structured': 'structured, detailed',
};

const BARRIER_LABELS: Record<string, string> = {
    'capability': 'knowing what to do',
    'opportunity': 'finding time and resources',
    'motivation': 'staying motivated',
    'unsure': 'getting started',
};

function getGoalBasedFallback(profile: ProfileData): OnboardingPlanResult {
    const goalKey = profile.goals?.[0] || 'eating healthier';
    const goalLabel = GOAL_LABELS[goalKey] || goalKey.toLowerCase();
    const firstName = sanitizeForPrompt(profile.first_name, 50);
    const nameClause = firstName ? `, ${firstName}` : '';
    const trackingLabel = profile.tracking_mode ? (TRACKING_LABELS[profile.tracking_mode] || 'meal tracking') : 'meal tracking';
    const coachingLabel = profile.coaching_style ? (COACHING_LABELS[profile.coaching_style] || 'balanced') : 'balanced';

    const sentences = [
        `Your goal of ${goalLabel} is a great place to start${nameClause} — we'll build a plan around what matters most to you.`,
        `This week, try logging your meals consistently using ${trackingLabel} to see how your choices connect to how you feel.`,
        `We'll use ${coachingLabel} coaching to share observations and small suggestions that fit your routine.`,
        `Each day brings a chance to notice something new about your patterns — you're already on the right path.`,
    ];

    return {
        plan_title: 'Your Wellness Plan',
        plan_sentences: sentences,
        source: 'fallback',
    };
}

async function generatePlanWithGemini(profile: ProfileData): Promise<OnboardingPlanResult | null> {
    const goalKey = profile.goals?.[0] || 'eating healthier';
    const goalLabel = GOAL_LABELS[goalKey] || goalKey.toLowerCase();
    const trackingLabel = profile.tracking_mode ? (TRACKING_LABELS[profile.tracking_mode] || 'meal tracking') : 'meal tracking';
    const coachingLabel = profile.coaching_style ? (COACHING_LABELS[profile.coaching_style] || 'balanced') : 'balanced';
    const barrierLabel = profile.com_b_barrier ? (BARRIER_LABELS[profile.com_b_barrier] || 'getting started') : null;
    const firstName = sanitizeForPrompt(profile.first_name, 50);

    const dietaryInfo = profile.dietary_preferences?.length
        ? `Dietary preferences: ${sanitizeArrayForPrompt(profile.dietary_preferences, 10, 100).join(', ')}.`
        : '';
    const culturalInfo = profile.cultural_food_context
        ? `Cultural food context: ${sanitizeForPrompt(profile.cultural_food_context, 200)}.`
        : '';
    const barrierInfo = barrierLabel
        ? `Their main challenge is ${barrierLabel}.`
        : '';

    const prompt = `You are a warm, supportive wellness coach creating a personalized first-week plan for someone starting their wellness journey.

SAFETY RULES (MUST follow):
- This is a wellness app, NOT a medical device
- NEVER use: "diagnose", "detect", "treat", "prevent", "reverse", "risk", "spike", "prediabetes", "diabetes", "insulin resistance", "hypoglycemia", "hyperglycemia", "clinical", "therapeutic", "prescription", "medical device", "blood sugar spike", "glucose spike"
- Use hedging language: "could", "might", "consider", "may help" — never "should", "must", "need to"
- Focus on observations, patterns, and gentle suggestions

USER PROFILE:
- Name: ${firstName || 'User'}
- Primary goal: ${goalLabel}
- Tracking approach: ${trackingLabel}
- Coaching style preference: ${coachingLabel}
${barrierInfo}
${dietaryInfo}
${culturalInfo}

Generate a personalized wellness plan with exactly 4 sentences:
1. A warm, personalized acknowledgment of their primary goal (reference their name if provided)
2. A concrete first-week suggestion tied to their tracking mode${dietaryInfo ? ' and dietary preferences' : ''}
3. A second first-week suggestion addressing their${barrierLabel ? ' challenge with ' + barrierLabel : ' wellness journey'}
4. An encouraging, forward-looking closing statement

Also generate a short plan title (2-4 words, e.g. "Your Energy Plan" or "Balanced Eating Plan").

Return ONLY valid JSON:
{
  "plan_title": "...",
  "plan_sentences": ["sentence1", "sentence2", "sentence3", "sentence4"]
}`;

    try {
        const text = await callGenAI(prompt, {
            temperature: 0.4,
            maxOutputTokens: 400,
            jsonOutput: true,
        });

        if (!text) return null;

        const parsed = JSON.parse(text);
        if (!parsed.plan_title || !Array.isArray(parsed.plan_sentences) || parsed.plan_sentences.length < 4) {
            console.error('Invalid AI response shape');
            return null;
        }

        // Safety check: verify no banned terms in output
        const fullText = [parsed.plan_title, ...parsed.plan_sentences].join(' ');
        if (containsBannedTerms(fullText)) {
            console.warn('AI output contained banned terms, falling back');
            return null;
        }

        return {
            plan_title: parsed.plan_title,
            plan_sentences: parsed.plan_sentences.slice(0, 4),
            source: 'ai',
        };
    } catch (error) {
        console.error('Gemini plan generation failed:', error);
        return null;
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { user_id: requestedUserId } = await req.json();

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

        const mismatch = requireMatchingUserId(requestedUserId, user!.id, corsHeaders);
        if (mismatch) return mismatch;

        // Rate limit check
        const rateLimitResponse = await checkRateLimit(supabase, user!.id, 'generate-onboarding-plan', corsHeaders);
        if (rateLimitResponse) return rateLimitResponse;

        const userId = user!.id;

        // Fetch profile data
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('first_name, goals, coaching_style, tracking_mode, com_b_barrier, readiness_level, dietary_preferences, cultural_food_context, ai_enabled')
            .eq('id', userId)
            .single();

        if (profileError || !profile) {
            // Return generic fallback if profile can't be read
            const fallback = getGoalBasedFallback({
                first_name: null, goals: null, coaching_style: null,
                tracking_mode: null, com_b_barrier: null, readiness_level: null,
                dietary_preferences: null, cultural_food_context: null,
            });
            return new Response(
                JSON.stringify(fallback),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const aiEnabled = profile.ai_enabled === true;
        let result: OnboardingPlanResult;

        if (aiEnabled) {
            const aiResult = await generatePlanWithGemini(profile as ProfileData);
            result = aiResult || getGoalBasedFallback(profile as ProfileData);
        } else {
            result = getGoalBasedFallback(profile as ProfileData);
        }

        // Store in ai_output_history (non-blocking, best effort)
        try {
            await supabase.from('ai_output_history').insert({
                user_id: userId,
                output_type: 'onboarding_plan',
                title: result.plan_title,
                body: result.plan_sentences.join('\n'),
                metadata: { source: result.source },
            });
        } catch (historyError) {
            console.warn('Failed to store onboarding plan in history:', historyError);
        }

        return new Response(
            JSON.stringify(result),
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
