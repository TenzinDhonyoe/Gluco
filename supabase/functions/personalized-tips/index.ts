// supabase/functions/personalized-tips/index.ts
// Edge Function for generating personalized tips using Gemini AI

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

interface CheckinStats {
    totalCheckins: number;
    energyBreakdown: { low: number; steady: number; high: number };
    fullnessBreakdown: { low: number; okay: number; high: number };
    cravingsBreakdown: { low: number; medium: number; high: number };
    moodBreakdown: { low: number; okay: number; good: number };
    movementAfterPct: number | null;
    commonPatterns: string[];
}

interface UserStats {
    glucose: {
        avgLevel: number | null;
        inRangePct: number | null;
        highReadingsCount: number;
        totalReadings: number;
    };
    meal: {
        avgFibrePerDay: number | null;
        totalMeals: number;
        mealNamesLogged: string[];
    };
    activity: {
        totalMinutes: number;
        sessionCount: number;
        activeDays: number;
    };
    checkins: CheckinStats;
}

async function fetchUserStats(supabase: any, userId: string): Promise<UserStats> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDate = sevenDaysAgo.toISOString();

    // Fetch glucose logs
    const { data: glucoseLogs } = await supabase
        .from('glucose_logs')
        .select('glucose_level, logged_at')
        .eq('user_id', userId)
        .gte('logged_at', startDate)
        .order('logged_at', { ascending: false });

    // Fetch meals
    const { data: meals } = await supabase
        .from('meals')
        .select('id, name, logged_at')
        .eq('user_id', userId)
        .gte('logged_at', startDate);

    // Fetch meal items for fibre calculation
    let totalFibre = 0;
    if (meals && meals.length > 0) {
        const mealIds = meals.map((m: any) => m.id);
        const { data: mealItems } = await supabase
            .from('meal_items')
            .select('quantity, nutrients')
            .in('meal_id', mealIds);

        (mealItems || []).forEach((item: any) => {
            const fibreG = item.nutrients?.fibre_g ?? 0;
            const quantity = item.quantity ?? 1;
            totalFibre += fibreG * quantity;
        });
    }

    // Fetch activity logs
    const { data: activityLogs } = await supabase
        .from('activity_logs')
        .select('duration_minutes, logged_at')
        .eq('user_id', userId)
        .gte('logged_at', startDate);

    // Fetch meal check-ins from the last 7 days
    const { data: mealCheckins } = await supabase
        .from('meal_checkins')
        .select('energy, fullness, cravings, mood, movement_after, notes, created_at')
        .eq('user_id', userId)
        .gte('created_at', startDate);

    // Calculate glucose stats
    const glucoseReadings = glucoseLogs || [];
    const inRangeReadings = glucoseReadings.filter((l: any) => l.glucose_level >= 3.9 && l.glucose_level <= 10.0);
    const highReadings = glucoseReadings.filter((l: any) => l.glucose_level > 10.0);
    const avgGlucose = glucoseReadings.length > 0
        ? glucoseReadings.reduce((sum: number, l: any) => sum + l.glucose_level, 0) / glucoseReadings.length
        : null;

    // Calculate activity stats
    const activities = activityLogs || [];
    const totalMinutes = activities.reduce((sum: number, a: any) => sum + a.duration_minutes, 0);
    const uniqueDays = new Set(activities.map((a: any) => new Date(a.logged_at).toDateString())).size;

    // Calculate check-in stats
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
        glucose: {
            avgLevel: avgGlucose ? Math.round(avgGlucose * 10) / 10 : null,
            inRangePct: glucoseReadings.length > 0 ? Math.round((inRangeReadings.length / glucoseReadings.length) * 100) : null,
            highReadingsCount: highReadings.length,
            totalReadings: glucoseReadings.length,
        },
        meal: {
            avgFibrePerDay: meals && meals.length > 0 ? Math.round((totalFibre / 7) * 10) / 10 : null,
            totalMeals: meals?.length || 0,
            mealNamesLogged: (meals || []).slice(0, 5).map((m: any) => m.name),
        },
        activity: {
            totalMinutes,
            sessionCount: activities.length,
            activeDays: uniqueDays,
        },
        checkins: {
            totalCheckins: checkins.length,
            energyBreakdown,
            fullnessBreakdown,
            cravingsBreakdown,
            moodBreakdown,
            movementAfterPct: movementTotal > 0 ? Math.round((movementCount / movementTotal) * 100) : null,
            commonPatterns,
        },
    };
}

async function generateTipsWithGemini(stats: UserStats): Promise<PersonalizedTip[]> {
    // Build check-in summary for the prompt
    const checkinSummary = stats.checkins.totalCheckins > 0
        ? `
- Post-Meal Check-ins (${stats.checkins.totalCheckins} this week):
  * Energy after meals: ${stats.checkins.energyBreakdown.low} low, ${stats.checkins.energyBreakdown.steady} steady, ${stats.checkins.energyBreakdown.high} high
  * Fullness: ${stats.checkins.fullnessBreakdown.low} still hungry, ${stats.checkins.fullnessBreakdown.okay} just right, ${stats.checkins.fullnessBreakdown.high} very full
  * Cravings: ${stats.checkins.cravingsBreakdown.low} none, ${stats.checkins.cravingsBreakdown.medium} some, ${stats.checkins.cravingsBreakdown.high} strong
  * Mood after eating: ${stats.checkins.moodBreakdown.low} low, ${stats.checkins.moodBreakdown.okay} okay, ${stats.checkins.moodBreakdown.good} good
  * Moved after eating: ${stats.checkins.movementAfterPct ?? 0}% of meals
  ${stats.checkins.commonPatterns.length > 0 ? `* Patterns noticed: ${stats.checkins.commonPatterns.join('; ')}` : ''}`
        : '- Post-Meal Check-ins: No check-ins recorded this week';

    const prompt = `You are a wellness coach helping someone understand their eating patterns and energy levels. Based on their week's data, generate 3 personalized tips (one for glucose patterns if tracked, one for meals/how they feel after eating, one for activity).

IMPORTANT:
- Use behavioral, wellness-focused language
- Do NOT imply diagnosis, detection, or prediction of any disease
- Avoid clinical terminology
- PAY SPECIAL ATTENTION to their post-meal check-in data - this tells you how they actually FEEL after eating
- If they report low energy or mood after meals, suggest ways to improve (meal composition, timing, walking after)
- If they have strong cravings, suggest balanced meals with protein and fiber

USER'S WEEK DATA:
- Glucose: ${stats.glucose.totalReadings} readings, avg ${stats.glucose.avgLevel ?? 'N/A'} mmol/L, ${stats.glucose.inRangePct ?? 0}% in range, ${stats.glucose.highReadingsCount} high readings
- Meals: ${stats.meal.totalMeals} meals logged, avg fibre ${stats.meal.avgFibrePerDay ?? 0} g/day
- Activity: ${stats.activity.totalMinutes} minutes total, ${stats.activity.sessionCount} sessions, ${stats.activity.activeDays} active days
${checkinSummary}

For each tip, provide:
1. A short title (2-4 words)
2. A personalized description (1-2 sentences referencing their actual data, especially how they feel after meals)
3. A topic_tag from this list: fiber, protein, carbs, sugar, hydration, meal_timing, portion_control, mindful_eating, walking, activity, exercise, energy, sleep, cravings, hunger, glucose, wellness, general

Return ONLY valid JSON in this exact format:
{
  "tips": [
    {"category": "glucose", "title": "...", "description": "...", "topic_tag": "glucose"},
    {"category": "meal", "title": "...", "description": "...", "topic_tag": "fiber"},
    {"category": "activity", "title": "...", "description": "...", "topic_tag": "walking"}
  ]
}`;

    try {
        const text = await callGenAI(prompt, {
            temperature: 0.4,
            maxOutputTokens: 800,
            jsonOutput: true,
        });

        if (!text) {
            return generateFallbackTips(stats);
        }

        const parsed = JSON.parse(text);
        return (parsed.tips || []).map((tip: any, index: number) => ({
            id: String(index + 1),
            category: tip.category,
            title: tip.title,
            description: tip.description,
            // Map topic_tag to verified URL instead of using AI-generated URL
            articleUrl: getArticleUrl(tip.topic_tag || tip.articleUrl),
            metric: tip.category === 'glucose' ? `${stats.glucose.avgLevel ?? '--'} mmol/L avg` :
                tip.category === 'meal' ? `${stats.meal.avgFibrePerDay ?? 0} g/day fibre` :
                    `${stats.activity.totalMinutes} min this week`,
        }));
    } catch (error) {
        console.error('Vertex AI call failed:', error);
        return generateFallbackTips(stats);
    }
}

function generateFallbackTips(stats: UserStats): PersonalizedTip[] {
    const tips: PersonalizedTip[] = [];

    // Glucose tip
    tips.push({
        id: '1',
        category: 'glucose',
        title: 'Track Your Trends',
        description: stats.glucose.totalReadings > 0
            ? `You logged ${stats.glucose.totalReadings} readings this week with ${stats.glucose.inRangePct}% in range.`
            : 'Start logging your glucose to see personalized insights.',
        articleUrl: 'https://www.healthline.com/nutrition/blood-sugar-after-eating',
        metric: stats.glucose.avgLevel ? `${stats.glucose.avgLevel} mmol/L avg` : undefined,
    });

    // Meal tip - personalized based on check-in data
    let mealTip: PersonalizedTip;
    const checkins = stats.checkins;

    if (checkins.totalCheckins >= 3) {
        const totalEnergy = checkins.energyBreakdown.low + checkins.energyBreakdown.steady + checkins.energyBreakdown.high;
        const totalCravings = checkins.cravingsBreakdown.low + checkins.cravingsBreakdown.medium + checkins.cravingsBreakdown.high;

        if (totalEnergy > 0 && checkins.energyBreakdown.low / totalEnergy > 0.4) {
            mealTip = {
                id: '2',
                category: 'meal',
                title: 'Boost Your Energy',
                description: `You reported low energy after ${checkins.energyBreakdown.low} meals. Try adding more protein and fiber to sustain your energy.`,
                articleUrl: 'https://www.healthline.com/nutrition/how-to-boost-energy',
                metric: `${checkins.energyBreakdown.low} low energy meals`,
            };
        } else if (totalCravings > 0 && checkins.cravingsBreakdown.high / totalCravings > 0.3) {
            mealTip = {
                id: '2',
                category: 'meal',
                title: 'Manage Cravings',
                description: `Strong cravings after ${checkins.cravingsBreakdown.high} meals this week. Balanced meals with protein can help.`,
                articleUrl: 'https://www.healthline.com/nutrition/how-to-stop-food-cravings',
                metric: `${checkins.cravingsBreakdown.high} meals with cravings`,
            };
        } else if (checkins.movementAfterPct !== null && checkins.movementAfterPct < 30) {
            mealTip = {
                id: '2',
                category: 'meal',
                title: 'Walk After Eating',
                description: `You moved after only ${checkins.movementAfterPct}% of meals. A short walk can help with digestion and energy.`,
                articleUrl: 'https://www.healthline.com/nutrition/walking-after-eating',
                metric: `${checkins.movementAfterPct}% post-meal walks`,
            };
        } else {
            mealTip = {
                id: '2',
                category: 'meal',
                title: 'Great Meal Habits',
                description: `You've completed ${checkins.totalCheckins} check-ins. Keep tracking how you feel after meals!`,
                articleUrl: 'https://www.healthline.com/nutrition/mindful-eating-guide',
                metric: `${checkins.totalCheckins} check-ins`,
            };
        }
    } else {
        mealTip = {
            id: '2',
            category: 'meal',
            title: stats.meal.avgFibrePerDay !== null ? 'Boost Your Fibre' : 'Track How You Feel',
            description: stats.meal.avgFibrePerDay !== null
                ? `Your fibre intake is ${stats.meal.avgFibrePerDay} g/day. Aim for 25g+ daily.`
                : 'Check in after meals to get personalized tips based on how you feel.',
            articleUrl: 'https://www.healthline.com/nutrition/fiber-and-blood-sugar',
            metric: stats.meal.avgFibrePerDay ? `${stats.meal.avgFibrePerDay} g/day` : undefined,
        };
    }
    tips.push(mealTip);

    // Activity tip
    tips.push({
        id: '3',
        category: 'activity',
        title: 'Stay Active',
        description: stats.activity.totalMinutes > 0
            ? `Great work! You've logged ${stats.activity.totalMinutes} minutes across ${stats.activity.activeDays} days.`
            : 'A 10-min walk after meals can help keep energy steady.',
        articleUrl: 'https://www.healthline.com/nutrition/walking-after-eating',
        metric: `${stats.activity.totalMinutes} min`,
    });

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

        const userId = user.id;
        const aiEnabled = await isAiEnabled(supabase, userId);

        // Fetch user stats
        const stats = await fetchUserStats(supabase, userId);

        // Generate tips with Gemini
        const fallback = generateFallbackTips(stats);
        const tips = aiEnabled ? await generateTipsWithGemini(stats) : fallback;
        const safeTips = sanitizeTips(tips, fallback);

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
