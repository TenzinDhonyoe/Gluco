// supabase/functions/next-best-action/index.ts
// AI-powered Next Best Action recommendation

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';
import { callGenAI } from '../_shared/genai.ts';
import { containsBannedTerms } from '../_shared/safety.ts';
import { buildUserContext, type UserContextObject } from '../_shared/user-context.ts';
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
// Time-aware fallback actions
// ============================================

interface FallbackAction {
    title: string;
    description: string;
    action_type: string;
    time_context: string;
    because: string;
    cta: { label: string; route: string };
}

function getTimeAwareFallback(localHour: number): FallbackAction {
    if (localHour >= 5 && localHour < 10) {
        return {
            title: 'Log your first meal',
            description: 'Starting your day with a logged meal builds your data foundation.',
            action_type: 'log_meal',
            time_context: 'This morning',
            because: 'Morning meals set the tone for the rest of your day.',
            cta: { label: 'Log meal', route: '/meal-scanner' },
        };
    }
    if (localHour >= 10 && localHour < 14) {
        return {
            title: 'Take a 10-minute walk',
            description: 'A short midday walk supports your energy and glucose balance.',
            action_type: 'post_meal_walk',
            time_context: 'After your next meal',
            because: 'Midday movement supports afternoon energy levels.',
            cta: { label: 'Log activity', route: '/log-activity' },
        };
    }
    if (localHour >= 14 && localHour < 19) {
        return {
            title: 'Add fiber to dinner',
            description: 'A serving of vegetables or legumes with dinner supports glucose stability.',
            action_type: 'fiber_boost',
            time_context: 'With your evening meal',
            because: 'Fiber with dinner supports overnight glucose balance.',
            cta: { label: 'Log meal', route: '/meal-scanner' },
        };
    }
    if (localHour >= 19 && localHour < 22) {
        return {
            title: 'Reflect on today',
            description: 'A quick check-in helps you see what worked today.',
            action_type: 'checkin',
            time_context: 'Before winding down',
            because: 'Evening reflection reinforces positive habits.',
            cta: { label: 'View insights', route: '/(tabs)/insights' },
        };
    }
    return {
        title: 'Rest well tonight',
        description: 'Quality sleep is one of the strongest factors in your wellness score.',
        action_type: 'sleep_window',
        time_context: 'Tonight',
        because: 'Consistent sleep supports all your other health habits.',
        cta: { label: 'View insights', route: '/(tabs)/insights' },
    };
}

// ============================================
// Rules-based action (deterministic fallback)
// ============================================

function getRulesBasedAction(ctx: UserContextObject): FallbackAction | null {
    const h = ctx.local_hour;

    // Re-engagement: always suggest low-friction
    if (ctx.journey_stage === 're_engagement') {
        return {
            title: 'Log one thing today',
            description: 'A single meal log is all it takes to get back on track.',
            action_type: 'log_meal',
            time_context: 'Whenever you are ready',
            because: 'One log restarts your momentum.',
            cta: { label: 'Log meal', route: '/meal-scanner' },
        };
    }

    // If enrolled in a pathway, bias toward pathway-relevant actions
    if (ctx.active_pathway) {
        const slug = ctx.active_pathway.slug;
        if (slug === 'move-after-meals' && h >= 10 && h < 20) {
            return {
                title: 'Take your post-meal walk',
                description: `Day ${ctx.active_pathway.day_number} of your Move After Meals program.`,
                action_type: 'post_meal_walk',
                time_context: 'After your next meal',
                because: `You're on day ${ctx.active_pathway.day_number} — keep the streak going.`,
                cta: { label: 'Log activity', route: '/log-activity' },
            };
        }
        if (slug === 'fiber-first' && h >= 6 && h < 19) {
            return {
                title: 'Add fiber to your next meal',
                description: `Day ${ctx.active_pathway.day_number} of your Fiber First program.`,
                action_type: 'fiber_boost',
                time_context: 'At your next meal',
                because: `Fiber First day ${ctx.active_pathway.day_number} — every meal with fiber counts.`,
                cta: { label: 'Log meal', route: '/meal-scanner' },
            };
        }
    }

    // Worst glucose day: suggest a walk
    if (ctx.worst_glucose_days.includes(todayDow) && h >= 10 && h <= 18) {
        return {
            title: 'Take a walk today',
            description: 'Your glucose tends to be higher on this day — a walk could help.',
            action_type: 'post_meal_walk',
            time_context: 'After your next meal',
            because: `This day of the week tends to be tougher for your glucose balance.`,
            cta: { label: 'Log activity', route: '/log-activity' },
        };
    }

    // Low activity day detection
    const todayDow = ctx.day_of_week;
    const todayMeals = ctx.patterns.logging_by_day_of_week[todayDow] ?? 0;
    const avgDailyMeals = ctx.patterns.meals_logged / 7;
    if (todayMeals < avgDailyMeals * 0.5 && h >= 10) {
        return {
            title: 'Log a meal to keep your streak',
            description: 'Your logging tends to dip on this day — one meal keeps momentum.',
            action_type: 'log_meal',
            time_context: 'At your next meal',
            because: 'This day of the week is usually quieter for you.',
            cta: { label: 'Log meal', route: '/meal-scanner' },
        };
    }

    // Process praise for consistent loggers
    if (ctx.patterns.meals_logged >= 14 && ctx.patterns.post_meal_walks < 2) {
        return {
            title: 'Try a post-meal walk today',
            description: 'You have been logging consistently — adding movement could amplify your progress.',
            action_type: 'post_meal_walk',
            time_context: 'After your largest meal',
            because: `With ${ctx.patterns.meals_logged} meals logged this week, you have a strong foundation.`,
            cta: { label: 'Log activity', route: '/log-activity' },
        };
    }

    return null;
}

// ============================================
// Content hash for dedup
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
    log('INFO', 'next-best-action request', { requestId });

    try {
        const body = await req.json();
        const { user_id, local_hour } = body;

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

        const hour = typeof local_hour === 'number' ? local_hour : new Date().getHours();

        // Check AI consent
        const aiEnabled = await isAiEnabled(supabase, user_id);

        if (!aiEnabled) {
            // Rules-based fallback
            log('INFO', 'AI disabled, using rules-based fallback', { requestId, user_id });
            const ctx = await buildUserContext(supabase, user_id, hour);
            const rulesAction = getRulesBasedAction(ctx) || getTimeAwareFallback(hour);
            return new Response(
                JSON.stringify({ action: rulesAction, source: 'rules' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Build user context
        const ctx = await buildUserContext(supabase, user_id, hour);
        log('INFO', 'User context built', { requestId, journey_stage: ctx.journey_stage, tone: ctx.tone_mode });

        // Time filtering instruction
        let timeInstruction = '';
        if (hour >= 5 && hour < 10) timeInstruction = 'Suggest a MORNING action. Do not suggest evening or nighttime activities.';
        else if (hour >= 10 && hour < 14) timeInstruction = 'Suggest a MIDDAY action appropriate for lunchtime.';
        else if (hour >= 14 && hour < 19) timeInstruction = 'Suggest an AFTERNOON or early EVENING action.';
        else if (hour >= 19 && hour < 22) timeInstruction = 'Suggest an EVENING wind-down action. No exercise suggestions.';
        else timeInstruction = 'Suggest a SLEEP or REST related action only.';

        // Repetition avoidance instruction
        let dedupInstruction = '';
        if (ctx.recent_ai_action_types.length > 0) {
            dedupInstruction = `\nDo NOT suggest these action types (recently suggested): ${ctx.recent_ai_action_types.join(', ')}`;
        }

        // Program awareness
        let programInstruction = '';
        if (ctx.active_pathway) {
            programInstruction = `\nThe user is enrolled in "${ctx.active_pathway.title}" (day ${ctx.active_pathway.day_number}/${ctx.active_pathway.total_days}). Bias toward actions that complement this program.`;
        }

        // Day-of-week glucose pattern awareness
        let dowInstruction = '';
        if (ctx.worst_glucose_days.includes(ctx.day_of_week)) {
            dowInstruction = `\nToday is one of this user's worst glucose days. Bias toward glucose-supportive actions (fiber, walks, meal timing).`;
        }

        // Engagement gap instruction
        let engagementGapInstruction = '';
        if (ctx.days_since_last_session >= 2 && ctx.days_since_last_session < 7) {
            engagementGapInstruction = `\nThe user hasn't opened the app in ${ctx.days_since_last_session} days. Suggest ONE low-friction action only. No guilt.`;
        }

        // Week 3-4 trough instruction
        let troughInstruction = '';
        if (ctx.is_week_3_4_trough) {
            troughInstruction = `\nThis user is in the week 3-4 trough. Focus on PROCESS praise, not outcome metrics. Celebrate consistency.`;
        }

        // Dietary preferences passthrough
        let dietaryInstruction = '';
        if (ctx.dietary_preferences.length > 0) {
            dietaryInstruction = `\nRespect dietary preferences: ${ctx.dietary_preferences.join(', ')}. Do not suggest foods that conflict with these.`;
        }

        const extraInstructions = [timeInstruction, dedupInstruction, programInstruction, dowInstruction, engagementGapInstruction, troughInstruction, dietaryInstruction].filter(Boolean).join('\n');

        // Call Gemini
        const prompt = assemblePrompt(ctx, 'next_best_action', extraInstructions);
        const aiResponse = await callGenAI(prompt, {
            temperature: 0.3,
            maxOutputTokens: 300,
            jsonOutput: true,
        });

        if (aiResponse) {
            try {
                const parsed = JSON.parse(aiResponse);

                // Safety check all string fields
                const allText = [parsed.title, parsed.description, parsed.because, parsed.time_context]
                    .filter(Boolean)
                    .join(' ');

                if (containsBannedTerms(allText)) {
                    log('WARN', 'AI output contained banned terms, falling back to rules', { requestId });
                } else {
                    // Validate required fields
                    if (parsed.title && parsed.description && parsed.action_type) {
                        // Ensure CTA exists with defaults
                        if (!parsed.cta || !parsed.cta.label) {
                            parsed.cta = { label: 'Take action', route: '/(tabs)/insights' };
                        }

                        // Store in history
                        const contentForHash = `${parsed.title}:${parsed.action_type}`;
                        const contentHash = await hashContent(contentForHash);

                        await supabase.from('ai_output_history').insert({
                            user_id,
                            output_type: 'next_best_action',
                            content_hash: contentHash,
                            title: parsed.title,
                            body: parsed.description,
                            action_type: parsed.action_type,
                            metadata: {
                                journey_stage: ctx.journey_stage,
                                tone_mode: ctx.tone_mode,
                                local_hour: hour,
                            },
                        });

                        log('INFO', 'AI action generated successfully', { requestId, action_type: parsed.action_type });

                        return new Response(
                            JSON.stringify({ action: parsed, source: 'ai' }),
                            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                        );
                    }
                    log('WARN', 'AI response missing required fields', { requestId, parsed });
                }
            } catch (parseErr) {
                log('WARN', 'Failed to parse AI response', { requestId, error: String(parseErr) });
            }
        } else {
            log('WARN', 'AI returned null', { requestId });
        }

        // Fallback: rules-based → time-aware generic
        const rulesAction = getRulesBasedAction(ctx) || getTimeAwareFallback(hour);
        const fallbackSource = getRulesBasedAction(ctx) ? 'rules' : 'fallback';

        return new Response(
            JSON.stringify({ action: rulesAction, source: fallbackSource }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log('ERROR', 'next-best-action failed', { requestId, error: errorMessage });

        // Even on error, return a usable fallback
        const fallback = getTimeAwareFallback(new Date().getHours());
        return new Response(
            JSON.stringify({ action: fallback, source: 'fallback', error: errorMessage }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
