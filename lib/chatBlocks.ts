// lib/chatBlocks.ts
// Client-side block attachment engine for the AI chat.
// Runs keyword matching against the AI reply text and builds rich inline blocks
// from locally available DB data (meals, daily context, metabolic features, weekly scores).
// Server-returned blocks take priority — this is the fallback when the edge function
// hasn't been redeployed or returns no blocks.

import {
    getMealsByDateRange,
    getDailyContextByRange,
    getMetabolicDailyFeaturesByRange,
    getMetabolicWeeklyScores,
    type Meal,
    type DailyContext,
    type MetabolicDailyFeature,
    type MetabolicWeeklyScore,
    type ChatBlock,
} from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface ChatBlockContext {
    todayHealthKit: DailyContext | null;
    todayMeals: Meal[];
    dailyFeatures: MetabolicDailyFeature[];
    metabolicScore: number | null;
    metabolicTrend: 'up' | 'down' | 'stable' | null;
    streakDays: number;
    mealsLoggedThisWeek: number;
}

// ============================================
// Keyword Triggers (ported from server chat-blocks.ts)
// ============================================

interface MetricTrigger {
    metric: string;
    label: string;
    unit: string;
    icon: string;
    color: string;
    todayKey: keyof DailyContext;
    historyKey: keyof MetabolicDailyFeature;
}

const METRIC_TRIGGERS: Record<string, MetricTrigger> = {
    steps: {
        metric: 'steps',
        label: 'Steps',
        unit: 'steps',
        icon: 'walk',
        color: '#60A5FA',
        todayKey: 'steps',
        historyKey: 'steps',
    },
    sleep: {
        metric: 'sleep',
        label: 'Sleep',
        unit: 'hrs',
        icon: 'moon',
        color: '#818CF8',
        todayKey: 'sleep_hours',
        historyKey: 'sleep_hours',
    },
    'heart rate': {
        metric: 'heart_rate',
        label: 'Resting HR',
        unit: 'bpm',
        icon: 'heart',
        color: '#F87171',
        todayKey: 'resting_hr',
        historyKey: 'steps', // no daily HR column — sparkline will be empty
    },
    'active min': {
        metric: 'active_minutes',
        label: 'Active Min',
        unit: 'min',
        icon: 'flame',
        color: '#22D3EE',
        todayKey: 'active_minutes',
        historyKey: 'active_minutes',
    },
};

const METRIC_ALIASES: Record<string, string> = {
    walking: 'steps',
    walked: 'steps',
    step: 'steps',
    sleeping: 'sleep',
    slept: 'sleep',
    'hours of sleep': 'sleep',
    'sleep quality': 'sleep',
    'resting heart rate': 'heart rate',
    'heart rate': 'heart rate',
    heartrate: 'heart rate',
    'active minutes': 'active min',
    exercise: 'active min',
    workout: 'active min',
    activity: 'active min',
};

const MEAL_KEYWORDS = ['meal', 'eat', 'ate', 'eaten', 'food', 'breakfast', 'lunch', 'dinner', 'snack'];
const SCORE_KEYWORDS = ['score', 'metabolic'];
const STREAK_KEYWORDS = ['streak', 'consistent', 'days in a row'];

// ============================================
// Date Helpers
// ============================================

function toDateString(d: Date): string {
    return d.toISOString().slice(0, 10);
}

// ============================================
// Fetch Context
// ============================================

export async function fetchChatBlockContext(userId: string): Promise<ChatBlockContext> {
    const now = new Date();
    const todayString = toDateString(now);

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const sevenDaysAgoString = toDateString(sevenDaysAgo);

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const [meals, dailyContextArr, dailyFeatures, weeklyScores] = await Promise.all([
        getMealsByDateRange(userId, todayStart, todayEnd),
        getDailyContextByRange(userId, todayString, todayString),
        getMetabolicDailyFeaturesByRange(userId, sevenDaysAgoString, todayString),
        getMetabolicWeeklyScores(userId, 2),
    ]);

    // Today's HealthKit = first item from daily context for today
    const todayHealthKit = dailyContextArr.length > 0 ? dailyContextArr[0] : null;

    // Metabolic score + trend from the two most recent weekly scores
    const metabolicScore = weeklyScores.length > 0 ? (weeklyScores[0].score7d ?? null) : null;
    let metabolicTrend: 'up' | 'down' | 'stable' | null = null;
    if (weeklyScores.length >= 2 && weeklyScores[0].score7d != null && weeklyScores[1].score7d != null) {
        const diff = weeklyScores[0].score7d - weeklyScores[1].score7d;
        metabolicTrend = diff > 2 ? 'up' : diff < -2 ? 'down' : 'stable';
    }

    // Streak: count consecutive recent days with any logged data
    const sortedFeatures = [...dailyFeatures].sort((a, b) => b.date.localeCompare(a.date));
    let streakDays = 0;
    for (const f of sortedFeatures) {
        if ((f.meal_count ?? 0) > 0 || (f.steps ?? 0) > 0) {
            streakDays++;
        } else {
            break;
        }
    }

    // Meals logged this week
    const mealsLoggedThisWeek = dailyFeatures.reduce((sum, f) => sum + (f.meal_count ?? 0), 0);

    return {
        todayHealthKit,
        todayMeals: meals,
        dailyFeatures,
        metabolicScore,
        metabolicTrend,
        streakDays,
        mealsLoggedThisWeek,
    };
}

// ============================================
// Block Builders
// ============================================

function buildMetricBlock(
    trigger: MetricTrigger,
    ctx: ChatBlockContext
): ChatBlock | null {
    const hk = ctx.todayHealthKit;
    const value = hk ? (hk[trigger.todayKey] as number | null) : null;
    if (value == null) return null;

    // Build 7-day history (oldest → newest) from daily features
    const sorted = [...ctx.dailyFeatures].sort((a, b) => a.date.localeCompare(b.date));
    const history: (number | null)[] = sorted.map(
        row => (row[trigger.historyKey] as number | null) ?? null
    );

    // Pad to 7 if fewer, trim to 7 if more
    while (history.length < 7) history.unshift(null);
    const last7 = history.slice(-7);

    const displayValue = trigger.metric === 'sleep'
        ? value.toFixed(1)
        : String(Math.round(value));

    return {
        type: 'metric_card',
        data: {
            metric: trigger.metric,
            icon: trigger.icon,
            label: trigger.label,
            value: displayValue,
            unit: trigger.unit,
            color: trigger.color,
            history: last7,
        },
        fallback_text: `${trigger.label}: ${displayValue} ${trigger.unit}`,
    };
}

function buildMealSummaryBlock(ctx: ChatBlockContext): ChatBlock | null {
    if (ctx.todayMeals.length === 0) return null;

    const meals = ctx.todayMeals.map(m => ({
        name: m.name,
        meal_type: m.meal_type,
        logged_at: m.logged_at,
        calories: m.calories,
        protein_g: m.protein_g,
        carbs_g: m.carbs_g,
        fiber_g: m.fiber_g,
    }));

    const totalCals = meals.reduce((sum, m) => sum + (m.calories ?? 0), 0);

    return {
        type: 'meal_summary',
        data: { meals },
        fallback_text: `${meals.length} meal${meals.length !== 1 ? 's' : ''} today (${Math.round(totalCals)} cal)`,
    };
}

function buildScoreRingBlock(ctx: ChatBlockContext): ChatBlock | null {
    if (ctx.metabolicScore == null) return null;

    return {
        type: 'score_ring',
        data: {
            score: ctx.metabolicScore,
            trend: ctx.metabolicTrend,
            components: null, // Components not available client-side from weekly scores
        },
        fallback_text: `Metabolic Score: ${ctx.metabolicScore}/100`,
    };
}

function buildStreakBlock(ctx: ChatBlockContext): ChatBlock | null {
    if (ctx.streakDays < 3) return null;

    return {
        type: 'streak',
        data: {
            days: ctx.streakDays,
            meals_logged: ctx.mealsLoggedThisWeek,
        },
        fallback_text: `${ctx.streakDays}-day streak`,
    };
}

// ============================================
// Main Attachment Function
// ============================================

export function attachBlocksClient(replyText: string, ctx: ChatBlockContext): ChatBlock[] {
    const lower = replyText.toLowerCase();
    const blocks: ChatBlock[] = [];

    // 1. Check metric triggers (resolve aliases first)
    const matchedMetrics = new Set<string>();
    for (const [alias, canonical] of Object.entries(METRIC_ALIASES)) {
        if (lower.includes(alias)) matchedMetrics.add(canonical);
    }
    for (const keyword of Object.keys(METRIC_TRIGGERS)) {
        if (lower.includes(keyword)) matchedMetrics.add(keyword);
    }
    for (const metricKey of matchedMetrics) {
        const trigger = METRIC_TRIGGERS[metricKey];
        if (!trigger) continue;
        const block = buildMetricBlock(trigger, ctx);
        if (block) blocks.push(block);
        if (blocks.length >= 2) break;
    }

    // 2. Check meal triggers
    if (blocks.length < 2 && MEAL_KEYWORDS.some(kw => lower.includes(kw))) {
        const block = buildMealSummaryBlock(ctx);
        if (block) blocks.push(block);
    }

    // 3. Check score triggers
    if (blocks.length < 2 && SCORE_KEYWORDS.some(kw => lower.includes(kw))) {
        const block = buildScoreRingBlock(ctx);
        if (block) blocks.push(block);
    }

    // 4. Check streak triggers
    if (blocks.length < 2 && STREAK_KEYWORDS.some(kw => lower.includes(kw))) {
        const block = buildStreakBlock(ctx);
        if (block) blocks.push(block);
    }

    return blocks.slice(0, 2); // Hard cap
}
