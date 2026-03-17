// supabase/functions/_shared/chat-blocks.ts
// Deterministic block attachment pass: inspects the AI reply text + loaded context
// to decide which rich data cards to attach inline.

import type { TodayContextObject } from './today-context.ts';
import type { UserContextObject } from './user-context.ts';

// ============================================
// Types
// ============================================

export type ChatBlockType = 'metric_card' | 'meal_summary' | 'score_ring' | 'streak';

export interface ChatBlock {
    type: ChatBlockType;
    data: Record<string, unknown>;
    fallback_text: string;
}

interface DailyFeatureRow {
    date: string;
    steps: number | null;
    active_minutes: number | null;
    sleep_hours: number | null;
    meal_count: number | null;
}

// ============================================
// Keyword Triggers
// ============================================

const METRIC_TRIGGERS: Record<string, {
    metric: string;
    label: string;
    unit: string;
    icon: string;
    color: string;
    todayKey: keyof NonNullable<TodayContextObject['healthkit_today']>;
    historyKey: keyof DailyFeatureRow;
}> = {
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

// Additional trigger words that map to the same metric
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
// Block Builders
// ============================================

function buildMetricBlock(
    trigger: typeof METRIC_TRIGGERS[string],
    todayCtx: TodayContextObject,
    dailyFeatures: DailyFeatureRow[]
): ChatBlock | null {
    const hk = todayCtx.healthkit_today;
    const value = hk ? (hk[trigger.todayKey] as number | null) : null;

    if (value === null) return null;

    // Build 7-day history array (oldest to newest)
    const sorted = [...dailyFeatures].sort(
        (a, b) => a.date.localeCompare(b.date)
    );
    const history: (number | null)[] = sorted.map(
        row => (row[trigger.historyKey] as number | null) ?? null
    );

    // Pad to 7 if fewer
    while (history.length < 7) history.unshift(null);
    // Trim to 7 if more
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

function buildMealSummaryBlock(todayCtx: TodayContextObject): ChatBlock | null {
    if (todayCtx.meals.length === 0) return null;

    const meals = todayCtx.meals.map(m => ({
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

function buildScoreRingBlock(userCtx: UserContextObject): ChatBlock | null {
    if (userCtx.metabolic_score === null) return null;

    return {
        type: 'score_ring',
        data: {
            score: userCtx.metabolic_score,
            trend: userCtx.metabolic_trend,
            components: userCtx.score_components,
        },
        fallback_text: `Metabolic Score: ${userCtx.metabolic_score}/100`,
    };
}

function buildStreakBlock(userCtx: UserContextObject): ChatBlock | null {
    if (userCtx.streak_days < 3) return null;

    return {
        type: 'streak',
        data: {
            days: userCtx.streak_days,
            meals_logged: userCtx.patterns.meals_logged,
        },
        fallback_text: `${userCtx.streak_days}-day streak`,
    };
}

// ============================================
// Main Attachment Function
// ============================================

export function attachBlocks(
    replyText: string,
    todayCtx: TodayContextObject,
    userCtx: UserContextObject,
    dailyFeatures: DailyFeatureRow[]
): ChatBlock[] {
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
        const block = buildMetricBlock(trigger, todayCtx, dailyFeatures);
        if (block) blocks.push(block);
        if (blocks.length >= 2) break;
    }

    // 2. Check meal triggers
    if (blocks.length < 2 && MEAL_KEYWORDS.some(kw => lower.includes(kw))) {
        const block = buildMealSummaryBlock(todayCtx);
        if (block) blocks.push(block);
    }

    // 3. Check score triggers
    if (blocks.length < 2 && SCORE_KEYWORDS.some(kw => lower.includes(kw))) {
        const block = buildScoreRingBlock(userCtx);
        if (block) blocks.push(block);
    }

    // 4. Check streak triggers
    if (blocks.length < 2 && STREAK_KEYWORDS.some(kw => lower.includes(kw))) {
        const block = buildStreakBlock(userCtx);
        if (block) blocks.push(block);
    }

    return blocks.slice(0, 2); // Hard cap
}
