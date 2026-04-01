// supabase/functions/personalized-tips/index.ts
// Edge Function for generating personalized tips using Gemini AI

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { isAiEnabled } from '../_shared/ai.ts';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { sanitizeText } from '../_shared/safety.ts';
import { callGenAI } from '../_shared/genai.ts';
import { buildUserContext, serializeContextForPrompt, type UserContextObject } from '../_shared/user-context.ts';
import { hashContent } from '../_shared/hash.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || Deno.env.get('SUPABASE_URL') || '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Curated article library - prevents AI URL hallucination by using verified URLs
 * AI returns a topic_tag, which maps to a pre-validated URL
 */
const ARTICLE_LIBRARY: Record<string, string> = {
    // Nutrition topics
    'fiber': 'https://www.healthline.com/nutrition/22-high-fiber-foods',
    'fibre': 'https://www.healthline.com/nutrition/22-high-fiber-foods',
    'protein': 'https://www.healthline.com/nutrition/10-reasons-to-eat-more-protein',
    'carbs': 'https://www.healthline.com/nutrition/good-carbs-bad-carbs',
    'sugar': 'https://www.healthline.com/nutrition/how-much-sugar-per-day',
    'hydration': 'https://www.healthline.com/nutrition/how-much-water-should-you-drink-per-day',
    'water': 'https://www.healthline.com/nutrition/how-much-water-should-you-drink-per-day',

    // Meal timing and habits
    'meal_timing': 'https://www.healthline.com/nutrition/meal-frequency',
    'meal_frequency': 'https://www.healthline.com/nutrition/meal-frequency',
    'portion_control': 'https://www.healthline.com/nutrition/portion-control',
    'mindful_eating': 'https://www.healthline.com/nutrition/mindful-eating-guide',
    'breakfast': 'https://www.healthline.com/nutrition/is-breakfast-good-for-you',

    // Activity and movement
    'walking': 'https://www.healthline.com/nutrition/walking-after-eating',
    'walking_after_eating': 'https://www.healthline.com/nutrition/walking-after-eating',
    'post_meal_walk': 'https://www.healthline.com/nutrition/walking-after-eating',
    'activity': 'https://www.healthline.com/health/fitness-exercise/benefits-of-walking',
    'exercise': 'https://www.healthline.com/nutrition/how-to-start-exercising',

    // Energy and metabolism
    'energy': 'https://www.healthline.com/nutrition/how-to-boost-energy',
    'fatigue': 'https://www.healthline.com/nutrition/how-to-boost-energy',
    'metabolism': 'https://www.healthline.com/nutrition/10-ways-to-boost-metabolism',

    // Sleep and recovery
    'sleep': 'https://www.sleepfoundation.org/nutrition',
    'sleep_nutrition': 'https://www.sleepfoundation.org/nutrition',

    // Cravings and hunger
    'cravings': 'https://www.healthline.com/nutrition/how-to-stop-food-cravings',
    'hunger': 'https://www.healthline.com/nutrition/18-ways-reduce-hunger-appetite',
    'satiety': 'https://www.healthline.com/nutrition/15-incredibly-filling-foods',

    // General wellness
    'wellness': 'https://www.healthline.com/nutrition/27-health-and-nutrition-tips',
    'general': 'https://www.healthline.com/nutrition/27-health-and-nutrition-tips',
    'glucose': 'https://www.healthline.com/nutrition/blood-sugar-after-eating',
    'blood_sugar': 'https://www.healthline.com/nutrition/blood-sugar-after-eating',

    // Fallback
    'default': 'https://www.healthline.com/nutrition/27-health-and-nutrition-tips',
};

/**
 * Map a topic tag to a verified article URL
 * Falls back to a general wellness article if topic not found
 */
function getArticleUrl(topicTag: string | undefined | null): string {
    if (!topicTag) return ARTICLE_LIBRARY['default'];

    const normalizedTag = topicTag.toLowerCase().trim().replace(/\s+/g, '_');
    return ARTICLE_LIBRARY[normalizedTag] || ARTICLE_LIBRARY['default'];
}

interface PersonalizedTip {
    id: string;
    category: 'glucose' | 'meal' | 'activity';
    title: string;
    description: string;
    articleUrl: string;
    metric?: string;
}

// Check-in breakdowns (not provided by buildUserContext at this granularity)
interface CheckinBreakdowns {
    totalCheckins: number;
    energyBreakdown: { low: number; steady: number; high: number };
    fullnessBreakdown: { low: number; okay: number; high: number };
    cravingsBreakdown: { low: number; medium: number; high: number };
    moodBreakdown: { low: number; okay: number; good: number };
    movementAfterPct: number | null;
    commonPatterns: string[];
}

async function fetchCheckinBreakdowns(supabase: any, userId: string): Promise<CheckinBreakdowns> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: mealCheckins } = await supabase
        .from('meal_checkins')
        .select('energy, fullness, cravings, mood, movement_after, created_at')
        .eq('user_id', userId)
        .gte('created_at', sevenDaysAgo.toISOString());

    const checkins = mealCheckins || [];
    const energyBreakdown = { low: 0, steady: 0, high: 0 };
    const fullnessBreakdown = { low: 0, okay: 0, high: 0 };
    const cravingsBreakdown = { low: 0, medium: 0, high: 0 };
    const moodBreakdown = { low: 0, okay: 0, good: 0 };
    let movementCount = 0;
    let movementTotal = 0;
    const commonPatterns: string[] = [];

    checkins.forEach((c: any) => {
        if (c.energy) energyBreakdown[c.energy as keyof typeof energyBreakdown]++;
        if (c.fullness) fullnessBreakdown[c.fullness as keyof typeof fullnessBreakdown]++;
        if (c.cravings) cravingsBreakdown[c.cravings as keyof typeof cravingsBreakdown]++;
        if (c.mood) moodBreakdown[c.mood as keyof typeof moodBreakdown]++;
        if (c.movement_after !== null) {
            movementTotal++;
            if (c.movement_after) movementCount++;
        }
    });

    // Identify common patterns from check-in data
    if (checkins.length >= 3) {
        const totalEnergy = energyBreakdown.low + energyBreakdown.steady + energyBreakdown.high;
        const totalMood = moodBreakdown.low + moodBreakdown.okay + moodBreakdown.good;
        const totalCravings = cravingsBreakdown.low + cravingsBreakdown.medium + cravingsBreakdown.high;

        if (totalEnergy > 0 && energyBreakdown.low / totalEnergy > 0.5) {
            commonPatterns.push('frequently reports low energy after meals');
        }
        if (totalEnergy > 0 && energyBreakdown.steady / totalEnergy > 0.6) {
            commonPatterns.push('maintains steady energy after most meals');
        }
        if (totalMood > 0 && moodBreakdown.low / totalMood > 0.4) {
            commonPatterns.push('mood often dips after eating');
        }
        if (totalMood > 0 && moodBreakdown.good / totalMood > 0.6) {
            commonPatterns.push('generally feels good after meals');
        }
        if (totalCravings > 0 && cravingsBreakdown.high / totalCravings > 0.4) {
            commonPatterns.push('experiences strong cravings frequently');
        }
        if (movementTotal > 0 && movementCount / movementTotal < 0.3) {
            commonPatterns.push('rarely moves after meals');
        }
        if (movementTotal > 0 && movementCount / movementTotal > 0.6) {
            commonPatterns.push('often walks or moves after eating');
        }
    }

    return {
        totalCheckins: checkins.length,
        energyBreakdown,
        fullnessBreakdown,
        cravingsBreakdown,
        moodBreakdown,
        movementAfterPct: movementTotal > 0 ? Math.round((movementCount / movementTotal) * 100) : null,
        commonPatterns,
    };
}

/**
 * Build a check-in summary string for the prompt
 */
function buildCheckinSummary(checkins: CheckinBreakdowns): string {
    if (checkins.totalCheckins === 0) {
        return '- Post-Meal Check-ins: No check-ins recorded this week';
    }

    let summary = `\n## Post-Meal Check-ins (${checkins.totalCheckins} this week)`;
    summary += `\nEnergy after meals: ${checkins.energyBreakdown.low} low, ${checkins.energyBreakdown.steady} steady, ${checkins.energyBreakdown.high} high`;
    summary += `\nFullness: ${checkins.fullnessBreakdown.low} still hungry, ${checkins.fullnessBreakdown.okay} just right, ${checkins.fullnessBreakdown.high} very full`;
    summary += `\nCravings: ${checkins.cravingsBreakdown.low} none, ${checkins.cravingsBreakdown.medium} some, ${checkins.cravingsBreakdown.high} strong`;
    summary += `\nMood after eating: ${checkins.moodBreakdown.low} low, ${checkins.moodBreakdown.okay} okay, ${checkins.moodBreakdown.good} good`;
    summary += `\nMoved after eating: ${checkins.movementAfterPct ?? 0}% of meals`;
    if (checkins.commonPatterns.length > 0) {
        summary += `\nPatterns noticed: ${checkins.commonPatterns.join('; ')}`;
    }

    return summary;
}

/**
 * Derive a backwards-compatible stats object from UserContextObject
 */
function deriveStats(ctx: UserContextObject) {
    return {
        glucose: {
            avgLevel: ctx.glucose?.avg_fasting ?? null,
            inRangePct: ctx.patterns.time_in_zone_pct,
            highReadingsCount: 0,
            totalReadings: ctx.patterns.glucose_logs_count,
        },
        meal: {
            avgFibrePerDay: ctx.patterns.avg_fibre_g_per_day,
            totalMeals: ctx.patterns.meals_logged,
            mealNamesLogged: [] as string[],
        },
        activity: {
            totalMinutes: (ctx.patterns.avg_active_minutes ?? 0) * 7,
            sessionCount: 0,
            activeDays: 0,
        },
    };
}

async function generateTipsWithGemini(
    ctx: UserContextObject,
    checkins: CheckinBreakdowns,
): Promise<PersonalizedTip[]> {
    const serializedContext = serializeContextForPrompt(ctx);
    const checkinSummary = buildCheckinSummary(checkins);

    // Dedup: avoid repeating recent tip topics
    const recentTopics = ctx.recent_ai_categories;
    const dedupInstruction = recentTopics.length > 0
        ? `\nAvoid these recently suggested topics/angles: ${recentTopics.join(', ')}. Try different advice or a fresh perspective.`
        : '';

    const isMealsOnly = ctx.tracking_mode === 'meals_only';
    const glucoseSlotInstruction = isMealsOnly
        ? 'The user does not track glucose. For the "glucose" category tip, generate a general wellness tip instead (sleep, stress management, hydration, or recovery). Do NOT mention glucose tracking.'
        : 'For the "glucose" category tip, reference their glucose patterns and trends.';

    const prompt = `You are a wellness coach helping someone understand their eating patterns and energy levels. Based on their profile and this week's data, generate 3 personalized tips.

IMPORTANT RULES:
- Use behavioral, wellness-focused language
- Do NOT imply diagnosis, detection, or prediction of any disease
- Avoid clinical terminology
- Reference the user's specific goals and primary habit by name when available
- If they have dietary preferences or cultural food context, ground meal suggestions in their food culture (e.g., suggest dal or lentils for fiber if South Asian context, suggest Mediterranean-style meals if Mediterranean context)
- Match coaching style: light = brief encouraging nudge, balanced = moderate guidance, structured = specific actionable steps with detail
- If they report low energy or mood after meals, suggest ways to improve (meal composition, timing, walking after)
- If they have strong cravings, suggest balanced meals with protein and fiber
- If sleep data shows poor sleep, incorporate sleep-related tips
- If they're on an active wellness plan, align tips with that plan's focus
- Use their first name naturally if available (e.g., "Based on your week, Sarah...")
${glucoseSlotInstruction}${dedupInstruction}

${serializedContext}

${checkinSummary}

Generate exactly 3 tips (one per category: glucose, meal, activity). For each tip, provide:
1. A short title (2-4 words)
2. A personalized description (1-2 sentences referencing their actual data, goals, and how they feel after meals)
3. A topic_tag from this list: fiber, protein, carbs, sugar, hydration, meal_timing, portion_control, mindful_eating, walking, activity, exercise, energy, sleep, cravings, hunger, glucose, wellness, general

Return ONLY valid JSON in this exact format:
{
  "tips": [
    {"category": "glucose", "title": "...", "description": "...", "topic_tag": "glucose"},
    {"category": "meal", "title": "...", "description": "...", "topic_tag": "fiber"},
    {"category": "activity", "title": "...", "description": "...", "topic_tag": "walking"}
  ]
}`;

    const stats = deriveStats(ctx);

    try {
        const text = await callGenAI(prompt, {
            temperature: 0.4,
            maxOutputTokens: 800,
            jsonOutput: true,
        });

        if (!text) {
            return generateFallbackTips(ctx, checkins);
        }

        const parsed = JSON.parse(text);
        return (parsed.tips || []).map((tip: any, index: number) => ({
            id: String(index + 1),
            category: tip.category,
            title: tip.title,
            description: tip.description,
            articleUrl: getArticleUrl(tip.topic_tag || tip.articleUrl),
            metric: tip.category === 'glucose' ? `${stats.glucose.avgLevel ?? '--'} mmol/L avg` :
                tip.category === 'meal' ? `${stats.meal.avgFibrePerDay ?? 0} g/day fibre` :
                    `${stats.activity.totalMinutes} min this week`,
        }));
    } catch (error) {
        console.error('Vertex AI call failed:', error);
        return generateFallbackTips(ctx, checkins);
    }
}

function generateFallbackTips(ctx: UserContextObject, checkins: CheckinBreakdowns): PersonalizedTip[] {
    const tips: PersonalizedTip[] = [];
    const isMealsOnly = ctx.tracking_mode === 'meals_only';

    // Glucose tip (or wellness tip for meals_only users)
    if (isMealsOnly) {
        // General wellness tip for users who don't track glucose
        const sleepHours = ctx.patterns.avg_sleep_hours;
        if (sleepHours !== null && sleepHours < 7) {
            tips.push({
                id: '1',
                category: 'glucose',
                title: 'Improve Your Sleep',
                description: `You're averaging ${sleepHours} hours of sleep. Aim for 7-9 hours to support your energy and wellness goals.`,
                articleUrl: ARTICLE_LIBRARY['sleep'],
                metric: `${sleepHours}h avg sleep`,
            });
        } else {
            tips.push({
                id: '1',
                category: 'glucose',
                title: 'Stay Hydrated',
                description: ctx.primary_habit
                    ? `While working on "${ctx.primary_habit}", staying hydrated helps with energy and focus.`
                    : 'Drinking enough water throughout the day supports energy and digestion.',
                articleUrl: ARTICLE_LIBRARY['hydration'],
            });
        }
    } else {
        tips.push({
            id: '1',
            category: 'glucose',
            title: 'Track Your Trends',
            description: ctx.patterns.glucose_logs_count > 0
                ? `You logged ${ctx.patterns.glucose_logs_count} readings this week${ctx.patterns.time_in_zone_pct !== null ? ` with ${ctx.patterns.time_in_zone_pct}% in range` : ''}.`
                : ctx.primary_habit
                    ? `Start logging your glucose to support your habit of "${ctx.primary_habit}".`
                    : 'Start logging your glucose to see personalized insights.',
            articleUrl: ARTICLE_LIBRARY['glucose'],
            metric: ctx.glucose?.avg_fasting ? `${ctx.glucose.avg_fasting} mmol/L avg` : undefined,
        });
    }

    // Meal tip — personalized based on check-in data and profile
    let mealTip: PersonalizedTip;

    if (checkins.totalCheckins >= 3) {
        const totalEnergy = checkins.energyBreakdown.low + checkins.energyBreakdown.steady + checkins.energyBreakdown.high;
        const totalCravings = checkins.cravingsBreakdown.low + checkins.cravingsBreakdown.medium + checkins.cravingsBreakdown.high;

        if (totalEnergy > 0 && checkins.energyBreakdown.low / totalEnergy > 0.4) {
            const culturalHint = ctx.cultural_food_context
                ? ` Try adding more protein-rich foods from your ${ctx.cultural_food_context} food traditions.`
                : '';
            mealTip = {
                id: '2',
                category: 'meal',
                title: 'Boost Your Energy',
                description: `You reported low energy after ${checkins.energyBreakdown.low} meals. Try adding more protein and fiber to sustain your energy.${culturalHint}`,
                articleUrl: ARTICLE_LIBRARY['energy'],
                metric: `${checkins.energyBreakdown.low} low energy meals`,
            };
        } else if (totalCravings > 0 && checkins.cravingsBreakdown.high / totalCravings > 0.3) {
            mealTip = {
                id: '2',
                category: 'meal',
                title: 'Manage Cravings',
                description: `Strong cravings after ${checkins.cravingsBreakdown.high} meals this week. Balanced meals with protein can help.`,
                articleUrl: ARTICLE_LIBRARY['cravings'],
                metric: `${checkins.cravingsBreakdown.high} meals with cravings`,
            };
        } else if (checkins.movementAfterPct !== null && checkins.movementAfterPct < 30) {
            mealTip = {
                id: '2',
                category: 'meal',
                title: 'Walk After Eating',
                description: `You moved after only ${checkins.movementAfterPct}% of meals. A short walk can help with digestion and energy.`,
                articleUrl: ARTICLE_LIBRARY['walking'],
                metric: `${checkins.movementAfterPct}% post-meal walks`,
            };
        } else {
            mealTip = {
                id: '2',
                category: 'meal',
                title: 'Great Meal Habits',
                description: `You've completed ${checkins.totalCheckins} check-ins. Keep tracking how you feel after meals!`,
                articleUrl: ARTICLE_LIBRARY['mindful_eating'],
                metric: `${checkins.totalCheckins} check-ins`,
            };
        }
    } else {
        // Few or no check-ins — use profile data
        const fibre = ctx.patterns.avg_fibre_g_per_day;
        if (fibre !== null && fibre > 0) {
            const dietaryContext = ctx.dietary_preferences && ctx.dietary_preferences.length > 0
                ? ` Great options for your ${ctx.dietary_preferences[0].toLowerCase()} diet include beans, lentils, and whole grains.`
                : '';
            mealTip = {
                id: '2',
                category: 'meal',
                title: 'Boost Your Fibre',
                description: `Your fibre intake is ${fibre} g/day. Aim for 25g+ daily.${dietaryContext}`,
                articleUrl: ARTICLE_LIBRARY['fiber'],
                metric: `${fibre} g/day`,
            };
        } else {
            mealTip = {
                id: '2',
                category: 'meal',
                title: 'Track How You Feel',
                description: 'Check in after meals to get personalized tips based on how you feel.',
                articleUrl: ARTICLE_LIBRARY['mindful_eating'],
            };
        }
    }
    tips.push(mealTip);

    // Activity tip — reference primary habit if available
    const totalMinutes = (ctx.patterns.avg_active_minutes ?? 0) * 7;
    if (ctx.primary_habit) {
        tips.push({
            id: '3',
            category: 'activity',
            title: 'Keep It Going',
            description: totalMinutes > 0
                ? `You've been active for ${totalMinutes} minutes this week while working on "${ctx.primary_habit}". Keep building that habit!`
                : `A 10-min walk after meals is a great way to build your habit of "${ctx.primary_habit}".`,
            articleUrl: ARTICLE_LIBRARY['walking'],
            metric: `${totalMinutes} min`,
        });
    } else {
        tips.push({
            id: '3',
            category: 'activity',
            title: 'Stay Active',
            description: totalMinutes > 0
                ? `Great work! You've logged ${totalMinutes} minutes of activity this week.`
                : 'A 10-min walk after meals can help keep energy steady.',
            articleUrl: ARTICLE_LIBRARY['walking'],
            metric: `${totalMinutes} min`,
        });
    }

    return tips;
}

function sanitizeTips(tips: PersonalizedTip[], fallback: PersonalizedTip[]): PersonalizedTip[] {
    const safeTips = tips.filter(tip =>
        sanitizeText(tip.title) !== null && sanitizeText(tip.description) !== null
    );
    return safeTips.length > 0 ? safeTips : fallback;
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

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { user, errorResponse } = await requireUser(req, supabase, corsHeaders);
        if (errorResponse) return errorResponse;

        const mismatch = requireMatchingUserId(requestedUserId, user.id, corsHeaders);
        if (mismatch) return mismatch;

        // Rate limit check
        const rateLimitResponse = await checkRateLimit(supabase, user.id, 'personalized-tips', corsHeaders);
        if (rateLimitResponse) return rateLimitResponse;

        const userId = user.id;
        const aiEnabled = await isAiEnabled(supabase, userId);

        // Fetch user context and check-in breakdowns in parallel
        const serverHour = new Date().getUTCHours();
        const [ctx, checkins] = await Promise.all([
            buildUserContext(supabase, userId, serverHour),
            fetchCheckinBreakdowns(supabase, userId),
        ]);

        // Generate tips with Gemini (or fallback)
        const fallback = generateFallbackTips(ctx, checkins);
        const tips = aiEnabled ? await generateTipsWithGemini(ctx, checkins) : fallback;
        const safeTips = sanitizeTips(tips, fallback);

        // Derive backwards-compatible stats from context
        const stats = deriveStats(ctx);

        // Log tips to ai_output_history for rotation/dedup (non-blocking)
        try {
            for (const tip of safeTips) {
                await supabase.from('ai_output_history').insert({
                    user_id: userId,
                    output_type: 'personalized_tips',
                    content_hash: await hashContent(`${tip.title}:${tip.category}`),
                    title: tip.title,
                    body: tip.description,
                    action_type: tip.category,
                    metadata: { category: tip.category },
                });
            }
        } catch {
            // Non-blocking: tips still return even if history write fails
        }

        return new Response(
            JSON.stringify({ tips: safeTips, stats }),
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
