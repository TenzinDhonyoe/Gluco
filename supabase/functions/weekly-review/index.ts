// supabase/functions/weekly-review/index.ts
// AI-powered Weekly Pattern Review

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
// Week date helpers
// ============================================

function getWeekStart(date: Date): string {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().slice(0, 10);
}

// ============================================
// Deterministic fallback
// ============================================

interface WeeklyMetrics {
    meals_logged: number;
    avg_steps: number | null;
    avg_sleep: number | null;
    avg_fiber: number | null;
    glucose_logs: number;
    time_in_zone: number | null;
    checkins: number;
}

function computeMetrics(rows: any[]): WeeklyMetrics {
    const days = rows.length || 1;
    const totalMeals = rows.reduce((s: number, r: any) => s + (r.meal_count ?? 0), 0);
    const totalCheckins = rows.reduce((s: number, r: any) => s + (r.meal_checkin_count ?? 0), 0);
    const totalGlucose = rows.reduce((s: number, r: any) => s + (r.glucose_logs_count ?? 0), 0);

    const steps = rows.map((r: any) => r.steps).filter((v: any): v is number => v !== null);
    const sleep = rows.map((r: any) => r.sleep_hours).filter((v: any): v is number => v !== null);
    const fiber = rows.map((r: any) => r.fibre_g_avg).filter((v: any): v is number => v !== null && v > 0);
    const tir = rows.map((r: any) => r.time_in_range_pct).filter((v: any): v is number => v !== null);

    return {
        meals_logged: totalMeals,
        avg_steps: steps.length > 0 ? Math.round(steps.reduce((s: number, v: number) => s + v, 0) / steps.length) : null,
        avg_sleep: sleep.length > 0 ? Math.round((sleep.reduce((s: number, v: number) => s + v, 0) / sleep.length) * 10) / 10 : null,
        avg_fiber: fiber.length > 0 ? Math.round((fiber.reduce((s: number, v: number) => s + v, 0) / fiber.length) * 10) / 10 : null,
        glucose_logs: totalGlucose,
        time_in_zone: tir.length > 0 ? Math.round((tir.reduce((s: number, v: number) => s + v, 0) / tir.length) * 10) / 10 : null,
        checkins: totalCheckins,
    };
}

function getDeterministicReview(
    thisWeek: WeeklyMetrics,
    lastWeek: WeeklyMetrics,
    recentReviewMetrics: string[]
): { text: string; experiment_suggestion: string | null; key_metric: string; metric_direction: 'up' | 'down' | 'stable' } {
    // Compare metrics and pick the one with the biggest relative change (avoiding recent review metrics)
    const comparisons: { metric: string; thisVal: number; lastVal: number; label: string }[] = [];

    comparisons.push({ metric: 'meals_logged', thisVal: thisWeek.meals_logged, lastVal: lastWeek.meals_logged, label: 'meal logging' });
    if (thisWeek.avg_steps !== null && lastWeek.avg_steps !== null) {
        comparisons.push({ metric: 'steps', thisVal: thisWeek.avg_steps, lastVal: lastWeek.avg_steps, label: 'daily steps' });
    }
    if (thisWeek.avg_sleep !== null && lastWeek.avg_sleep !== null) {
        comparisons.push({ metric: 'sleep', thisVal: thisWeek.avg_sleep, lastVal: lastWeek.avg_sleep, label: 'sleep hours' });
    }
    if (thisWeek.avg_fiber !== null && lastWeek.avg_fiber !== null) {
        comparisons.push({ metric: 'fiber', thisVal: thisWeek.avg_fiber, lastVal: lastWeek.avg_fiber, label: 'fiber intake' });
    }
    if (thisWeek.time_in_zone !== null && lastWeek.time_in_zone !== null) {
        comparisons.push({ metric: 'glucose_stability', thisVal: thisWeek.time_in_zone, lastVal: lastWeek.time_in_zone, label: 'glucose stability' });
    }

    // Filter out recently used review metrics to avoid repetition
    const recentSet = new Set(recentReviewMetrics);
    const filtered = comparisons.filter(c => !recentSet.has(c.metric));
    const candidates = filtered.length > 0 ? filtered : comparisons;

    // Find biggest relative change
    let best = candidates[0];
    let bestChange = 0;
    for (const c of candidates) {
        const base = Math.max(c.lastVal, 1);
        const change = Math.abs(c.thisVal - c.lastVal) / base;
        if (change > bestChange) {
            bestChange = change;
            best = c;
        }
    }

    if (!best) {
        return {
            text: 'Your data is building week by week. Keep logging to unlock richer patterns.',
            experiment_suggestion: 'Try logging one extra meal this week.',
            key_metric: 'meals_logged',
            metric_direction: 'stable',
        };
    }

    const direction: 'up' | 'down' | 'stable' = best.thisVal > best.lastVal ? 'up' : best.thisVal < best.lastVal ? 'down' : 'stable';
    const pctChange = best.lastVal > 0 ? Math.round(((best.thisVal - best.lastVal) / best.lastVal) * 100) : 0;
    const absPctChange = Math.abs(pctChange);

    let text: string;
    if (direction === 'up') {
        text = `Your ${best.label} increased by ${absPctChange}% compared to last week. That consistency is building your foundation.`;
    } else if (direction === 'down') {
        text = `Your ${best.label} was ${absPctChange}% lower than last week. That is okay — some weeks naturally vary.`;
    } else {
        text = `Your ${best.label} held steady this week. Consistency is a powerful signal.`;
    }

    const experiments: Record<string, string> = {
        meals_logged: 'Try logging one extra meal this week.',
        steps: 'Try adding a 10-minute walk after one meal each day.',
        sleep: 'Try setting a consistent bedtime for 3 nights this week.',
        fiber: 'Try adding one fiber-rich food to a meal you already log.',
        glucose_stability: 'Try eating vegetables before carbs at one meal a day.',
    };

    return {
        text,
        experiment_suggestion: experiments[best.metric] ?? null,
        key_metric: best.metric,
        metric_direction: direction,
    };
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
    log('INFO', 'weekly-review request', { requestId });

    try {
        const body = await req.json();
        const { user_id } = body;

        if (!user_id) {
            return new Response(
                JSON.stringify({ error: 'Missing user_id' }),
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

        const now = new Date();
        const weekStart = getWeekStart(now);

        // Check if review already exists this week
        const { data: existingReview } = await supabase
            .from('weekly_reviews')
            .select('*')
            .eq('user_id', user_id)
            .eq('week_start', weekStart)
            .maybeSingle();

        if (existingReview) {
            log('INFO', 'Review already exists for this week', { requestId, weekStart });
            return new Response(
                JSON.stringify({
                    review: {
                        text: existingReview.review_text,
                        experiment_suggestion: existingReview.experiment_suggestion,
                        key_metric: existingReview.key_metric,
                        metric_direction: existingReview.metric_direction,
                        week_start: existingReview.week_start,
                    },
                    source: 'ai',
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Fetch this week's and last week's daily features
        const lastWeekStart = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10);
        const thisWeekStartDate = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);

        const [thisWeekResult, lastWeekResult] = await Promise.all([
            supabase
                .from('metabolic_daily_features')
                .select('*')
                .eq('user_id', user_id)
                .gte('date', thisWeekStartDate)
                .order('date', { ascending: false }),
            supabase
                .from('metabolic_daily_features')
                .select('*')
                .eq('user_id', user_id)
                .gte('date', lastWeekStart)
                .lt('date', thisWeekStartDate)
                .order('date', { ascending: false }),
        ]);

        const thisWeekRows = thisWeekResult.data || [];
        const lastWeekRows = lastWeekResult.data || [];

        const thisWeekMetrics = computeMetrics(thisWeekRows);
        const lastWeekMetrics = computeMetrics(lastWeekRows);

        // Check AI consent
        const aiEnabled = await isAiEnabled(supabase, user_id);

        let reviewResult: {
            text: string;
            experiment_suggestion: string | null;
            key_metric: string;
            metric_direction: 'up' | 'down' | 'stable';
        };
        let source: 'ai' | 'fallback' = 'fallback';

        // Build user context (needed for both AI and fallback paths)
        const ctx = await buildUserContext(supabase, user_id, new Date().getHours());

        if (aiEnabled) {

            // Build dedup instruction from recent metrics
            const recentMetrics = ctx.recent_weekly_review_metrics;
            const dedupLine = recentMetrics.length > 0
                ? `Do NOT repeat these key_metrics (recently used): ${recentMetrics.join(', ')} — pick a different metric.`
                : '';

            // Program-aware experiment instruction
            const programLine = ctx.active_pathway
                ? `The user is enrolled in "${ctx.active_pathway.title}" (day ${ctx.active_pathway.day_number}/${ctx.active_pathway.total_days}). Tie the experiment suggestion to this program when possible.`
                : '';

            const weekComparison = `
## Week-Over-Week Comparison
This week: ${JSON.stringify(thisWeekMetrics)}
Last week: ${JSON.stringify(lastWeekMetrics)}

Surface ONE pattern — the metric with the most meaningful change.
${dedupLine}
${programLine}
Frame as curiosity, not judgment. Include one experiment suggestion.`;

            const prompt = assemblePrompt(ctx, 'weekly_review', weekComparison);
            const aiResponse = await callGenAI(prompt, {
                temperature: 0.4,
                maxOutputTokens: 400,
                jsonOutput: true,
            });

            if (aiResponse) {
                try {
                    const parsed = JSON.parse(aiResponse);
                    const allText = [parsed.text, parsed.experiment_suggestion].filter(Boolean).join(' ');

                    if (!containsBannedTerms(allText) && parsed.text && parsed.key_metric && parsed.metric_direction) {
                        reviewResult = {
                            text: parsed.text,
                            experiment_suggestion: parsed.experiment_suggestion ?? null,
                            key_metric: parsed.key_metric,
                            metric_direction: parsed.metric_direction,
                        };
                        source = 'ai';
                        log('INFO', 'AI review generated', { requestId, key_metric: parsed.key_metric });
                    } else {
                        log('WARN', 'AI review failed safety check or missing fields', { requestId });
                        reviewResult = getDeterministicReview(thisWeekMetrics, lastWeekMetrics, ctx.recent_weekly_review_metrics);
                    }
                } catch (parseErr) {
                    log('WARN', 'Failed to parse AI review response', { requestId, error: String(parseErr) });
                    reviewResult = getDeterministicReview(thisWeekMetrics, lastWeekMetrics, []);
                }
            } else {
                log('WARN', 'AI returned null for weekly review', { requestId });
                reviewResult = getDeterministicReview(thisWeekMetrics, lastWeekMetrics, ctx.recent_weekly_review_metrics);
            }
        } else {
            reviewResult = getDeterministicReview(thisWeekMetrics, lastWeekMetrics, ctx.recent_weekly_review_metrics);
        }

        // Store in weekly_reviews table
        const { error: insertError } = await supabase
            .from('weekly_reviews')
            .insert({
                user_id,
                week_start: weekStart,
                review_text: reviewResult.text,
                experiment_suggestion: reviewResult.experiment_suggestion,
                key_metric: reviewResult.key_metric,
                metric_direction: reviewResult.metric_direction,
                journey_stage: aiEnabled ? ctx.journey_stage : null,
            });

        if (insertError) {
            log('WARN', 'Failed to store weekly review', { requestId, error: insertError.message });
        }

        // Store in ai_output_history
        const contentHash = await hashContent(reviewResult.text);
        await supabase.from('ai_output_history').insert({
            user_id,
            output_type: 'weekly_review',
            content_hash: contentHash,
            title: `Weekly Review: ${reviewResult.key_metric}`,
            body: reviewResult.text,
            action_type: reviewResult.key_metric,
            metadata: {
                metric_direction: reviewResult.metric_direction,
                week_start: weekStart,
                source,
            },
        });

        return new Response(
            JSON.stringify({
                review: { ...reviewResult, week_start: weekStart },
                source,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log('ERROR', 'weekly-review failed', { requestId, error: errorMessage });

        return new Response(
            JSON.stringify({ error: 'Internal server error', message: errorMessage, requestId }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
