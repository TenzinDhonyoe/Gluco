// supabase/functions/personalized-tips/index.ts
// Edge Function for generating personalized tips using Gemini AI

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';
import { isAiEnabled } from '../_shared/ai.ts';
import { sanitizeText } from '../_shared/safety.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PersonalizedTip {
    id: string;
    category: 'glucose' | 'meal' | 'activity';
    title: string;
    description: string;
    articleUrl: string;
    metric?: string;
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
    };
}

async function generateTipsWithGemini(stats: UserStats): Promise<PersonalizedTip[]> {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
        console.log('GEMINI_API_KEY not configured, using fallback tips');
        return generateFallbackTips(stats);
    }

    const prompt = `You are a wellness coach helping someone understand their eating patterns and energy levels. Based on their week's data, generate 3 personalized tips (one for glucose patterns if tracked, one for meals, one for activity).

IMPORTANT: Use behavioral, wellness-focused language. Do NOT imply diagnosis, detection, or prediction of any disease. Avoid clinical terminology.

USER'S WEEK DATA:
- Glucose: ${stats.glucose.totalReadings} readings, avg ${stats.glucose.avgLevel ?? 'N/A'} mmol/L, ${stats.glucose.inRangePct ?? 0}% in range, ${stats.glucose.highReadingsCount} high readings
- Meals: ${stats.meal.totalMeals} meals logged, avg fibre ${stats.meal.avgFibrePerDay ?? 0} g/day
- Activity: ${stats.activity.totalMinutes} minutes total, ${stats.activity.sessionCount} sessions, ${stats.activity.activeDays} active days

For each tip, provide:
1. A short title (2-4 words)
2. A personalized description (1-2 sentences referencing their actual data)
3. A relevant article URL from a reputable wellness source (Healthline, Mayo Clinic, Harvard Health, etc.)

Return ONLY valid JSON in this exact format:
{
  "tips": [
    {"category": "glucose", "title": "...", "description": "...", "articleUrl": "https://..."},
    {"category": "meal", "title": "...", "description": "...", "articleUrl": "https://..."},
    {"category": "activity", "title": "...", "description": "...", "articleUrl": "https://..."}
  ]
}`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: 800,
                        responseMimeType: 'application/json',
                    },
                }),
            }
        );

        if (!response.ok) {
            console.error('Gemini API error:', response.status);
            return generateFallbackTips(stats);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            return generateFallbackTips(stats);
        }

        const parsed = JSON.parse(text);
        return (parsed.tips || []).map((tip: any, index: number) => ({
            id: String(index + 1),
            category: tip.category,
            title: tip.title,
            description: tip.description,
            articleUrl: tip.articleUrl,
            metric: tip.category === 'glucose' ? `${stats.glucose.avgLevel ?? '--'} mmol/L avg` :
                tip.category === 'meal' ? `${stats.meal.avgFibrePerDay ?? 0} g/day fibre` :
                    `${stats.activity.totalMinutes} min this week`,
        }));
    } catch (error) {
        console.error('Gemini call failed:', error);
        return generateFallbackTips(stats);
    }
}

function generateFallbackTips(stats: UserStats): PersonalizedTip[] {
    return [
        {
            id: '1',
            category: 'glucose',
            title: 'Track Your Trends',
            description: stats.glucose.totalReadings > 0
                ? `You logged ${stats.glucose.totalReadings} readings this week with ${stats.glucose.inRangePct}% in range.`
                : 'Start logging your glucose to see personalized insights.',
            articleUrl: 'https://www.healthline.com/nutrition/blood-sugar-after-eating',
            metric: stats.glucose.avgLevel ? `${stats.glucose.avgLevel} mmol/L avg` : undefined,
        },
        {
            id: '2',
            category: 'meal',
            title: 'Boost Your Fibre',
            description: stats.meal.avgFibrePerDay !== null
                ? `Your fibre intake is ${stats.meal.avgFibrePerDay} g/day. Aim for 25g+ daily.`
                : 'Log meals to track your fibre intake.',
            articleUrl: 'https://www.healthline.com/nutrition/fiber-and-blood-sugar',
            metric: stats.meal.avgFibrePerDay ? `${stats.meal.avgFibrePerDay} g/day` : undefined,
        },
        {
            id: '3',
            category: 'activity',
            title: 'Stay Active',
            description: stats.activity.totalMinutes > 0
                ? `Great work! You've logged ${stats.activity.totalMinutes} minutes across ${stats.activity.activeDays} days.`
                : 'A 10-min walk after meals can help keep energy steady.',
            articleUrl: 'https://www.healthline.com/nutrition/walking-after-eating',
            metric: `${stats.activity.totalMinutes} min`,
        },
    ];
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
