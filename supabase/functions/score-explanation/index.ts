// supabase/functions/score-explanation/index.ts
// AI-powered Metabolic Score Explanation

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';
import { callGenAI } from '../_shared/genai.ts';
import { containsBannedTerms } from '../_shared/safety.ts';
import { buildUserContext } from '../_shared/user-context.ts';
import { assemblePrompt } from '../_shared/coaching-prompt.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const entry = { timestamp: new Date().toISOString(), level, message, ...data };
    if (level === 'ERROR') console.error(JSON.stringify(entry));
    else if (level === 'WARN') console.warn(JSON.stringify(entry));
    else console.log(JSON.stringify(entry));
}

// ============================================
// Deterministic fallback
// ============================================

interface ScoreComponents {
    rhr: number;
    steps: number;
    sleep: number;
    hrv: number;
}

function getDeterministicExplanation(score: number, components: ScoreComponents) {
    const componentEntries = Object.entries(components) as [keyof ScoreComponents, number][];
    const sorted = [...componentEntries].sort((a, b) => b[1] - a[1]);
    const highest = sorted[0];
    const lowest = sorted[sorted.length - 1];

    const labels: Record<keyof ScoreComponents, string> = {
        rhr: 'resting heart rate',
        steps: 'daily steps',
        sleep: 'sleep consistency',
        hrv: 'heart rate variability',
    };

    const actions: Record<keyof ScoreComponents, string> = {
        rhr: 'Try adding a short walk or breathing exercise to help your resting heart rate.',
        steps: 'Try adding 500 extra steps to your day — a short walk counts.',
        sleep: 'Try setting a consistent bedtime for the next few nights.',
        hrv: 'Gentle movement and stress management could support your HRV.',
    };

    let summary: string;
    if (score >= 70) summary = 'Your rhythm is strong this week.';
    else if (score >= 50) summary = 'Your rhythm is building — some areas are doing well.';
    else summary = 'Your rhythm has room to grow — focus on one area this week.';

    return {
        summary,
        top_contributor: `${labels[highest[0]].charAt(0).toUpperCase() + labels[highest[0]].slice(1)} is your strongest factor right now.`,
        biggest_opportunity: `A small improvement in ${labels[lowest[0]]} could make a noticeable difference.`,
        one_thing_this_week: actions[lowest[0]],
    };
}

// Behavioral sub-score labels and actions for deterministic fallback
const BEHAVIORAL_LABELS: Record<string, { label: string; action: string }> = {
    glucose_stability: {
        label: 'glucose stability',
        action: 'Try eating vegetables before carbs at one meal today.',
    },
    logging_consistency: {
        label: 'logging consistency',
        action: 'Log one extra meal this week to strengthen your data.',
    },
    program_adherence: {
        label: 'program progress',
        action: "Complete today's program step to keep your momentum.",
    },
};

function getDeterministicExplanationWithBehavioral(
    score: number,
    components: ScoreComponents,
    behavioral: { glucose_stability: number | null; logging_consistency: number; program_adherence: number | null }
) {
    const base = getDeterministicExplanation(score, components);

    // Find the lowest behavioral sub-score to add context
    const behavioralEntries: { key: string; value: number }[] = [];
    if (behavioral.glucose_stability !== null) {
        behavioralEntries.push({ key: 'glucose_stability', value: behavioral.glucose_stability });
    }
    behavioralEntries.push({ key: 'logging_consistency', value: behavioral.logging_consistency });
    if (behavioral.program_adherence !== null) {
        behavioralEntries.push({ key: 'program_adherence', value: behavioral.program_adherence });
    }

    if (behavioralEntries.length > 0) {
        const lowest = behavioralEntries.sort((a, b) => a.value - b.value)[0];
        if (lowest.value < 70) {
            const info = BEHAVIORAL_LABELS[lowest.key];
            if (info) {
                base.one_thing_this_week = info.action;
            }
        }
    }

    return base;
}

// ============================================
// Content hash
// ============================================

async function hashContent(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================
// AI check helper
// ============================================

async function isAiEnabled(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
    const { data } = await supabase
        .from('profiles')
        .select('ai_enabled')
        .eq('id', userId)
        .single();
    return data?.ai_enabled !== false;
}

// ============================================
// Main handler
// ============================================

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const requestId = crypto.randomUUID();
    log('INFO', 'score-explanation request', { requestId });

    try {
        const body = await req.json();
        const { user_id, score, components } = body;

        if (!user_id || score === undefined || !components) {
            return new Response(
                JSON.stringify({ error: 'Missing user_id, score, or components' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Auth
        const { user, errorResponse } = await requireUser(req, supabase, corsHeaders);
        if (errorResponse) return errorResponse;
        const mismatch = requireMatchingUserId(user_id, user!.id, corsHeaders);
        if (mismatch) return mismatch;

        // Check AI consent
        const aiEnabled = await isAiEnabled(supabase, user_id);

        // Build context (needed for both AI and fallback paths)
        const ctx = await buildUserContext(supabase, user_id, new Date().getHours());

        // Compute behavioral sub-scores
        const glucoseStability = ctx.patterns.time_in_zone_pct; // 0-100 already
        const loggingConsistency = Math.min(100, Math.round((ctx.patterns.meals_logged / 21) * 100));
        const programAdherence = ctx.active_pathway
            ? Math.min(100, Math.round((ctx.active_pathway.day_number / ctx.active_pathway.total_days) * 100))
            : null;

        const behavioral = { glucose_stability: glucoseStability, logging_consistency: loggingConsistency, program_adherence: programAdherence };

        if (!aiEnabled) {
            const fallback = getDeterministicExplanationWithBehavioral(score, components, behavioral);
            return new Response(
                JSON.stringify({ explanation: fallback, source: 'fallback' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Build behavioral context for prompt
        const behavioralLines: string[] = [];
        if (glucoseStability !== null) behavioralLines.push(`Glucose stability: ${glucoseStability}%`);
        behavioralLines.push(`Logging consistency: ${loggingConsistency}%`);
        if (programAdherence !== null) behavioralLines.push(`Program adherence: ${programAdherence}%`);

        const scoreInstruction = `
## Score Data
Current metabolic score: ${score}/100
Components: RHR=${components.rhr}, Steps=${components.steps}, Sleep=${components.sleep}, HRV=${components.hrv}
${ctx.metabolic_trend ? `Trend: ${ctx.metabolic_trend}` : ''}

## Behavioral Components
${behavioralLines.join('\n')}

Explain this score in terms the user can understand and act on.
Consider both the HealthKit components and behavioral components.
Focus on what they can DO, not on the numbers themselves.`;

        const prompt = assemblePrompt(ctx, 'score_explanation', scoreInstruction);
        const aiResponse = await callGenAI(prompt, {
            temperature: 0.3,
            maxOutputTokens: 300,
            jsonOutput: true,
        });

        if (aiResponse) {
            try {
                const parsed = JSON.parse(aiResponse);
                const allText = [parsed.summary, parsed.top_contributor, parsed.biggest_opportunity, parsed.one_thing_this_week]
                    .filter(Boolean)
                    .join(' ');

                if (!containsBannedTerms(allText) && parsed.summary && parsed.top_contributor) {
                    // Store in history
                    const contentHash = await hashContent(parsed.summary);
                    await supabase.from('ai_output_history').insert({
                        user_id,
                        output_type: 'score_explanation',
                        content_hash: contentHash,
                        title: `Score: ${score}`,
                        body: parsed.summary,
                        metadata: {
                            score,
                            components,
                            journey_stage: ctx.journey_stage,
                        },
                    });

                    log('INFO', 'AI score explanation generated', { requestId, score });

                    return new Response(
                        JSON.stringify({ explanation: parsed, source: 'ai' }),
                        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }
                log('WARN', 'Score explanation failed safety check', { requestId });
            } catch (parseErr) {
                log('WARN', 'Failed to parse score explanation', { requestId, error: String(parseErr) });
            }
        }

        // Fallback
        const fallback = getDeterministicExplanationWithBehavioral(score, components, behavioral);
        return new Response(
            JSON.stringify({ explanation: fallback, source: 'fallback' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log('ERROR', 'score-explanation failed', { requestId, error: errorMessage });

        return new Response(
            JSON.stringify({ error: 'Internal server error', message: errorMessage, requestId }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
