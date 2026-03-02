// supabase/functions/_shared/user-context.ts
// Builds a unified user context object sent with every AI personalization call.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// ============================================
// Types
// ============================================

export type JourneyStage = 'week_0_2' | 'week_3_4' | 'week_5_plus' | 'week_8_plus' | 're_engagement';
export type ToneMode = 'warm_welcome' | 'pattern_reveal' | 'confident_coach' | 'trusted_partner' | 'gentle_return';

export interface UserContextObject {
    // Identity & Journey
    user_id: string;
    first_name: string | null;
    journey_stage: JourneyStage;
    tone_mode: ToneMode;
    days_since_signup: number;
    days_since_last_session: number;

    // Behavioral Profile
    com_b_barrier: string | null;
    readiness_level: string | null;
    coaching_style: string | null;
    primary_habit: string | null;
    prompt_window: string | null;
    tracking_mode: string;

    // Dietary Context
    dietary_preferences: string[];
    cultural_food_context: string | null;

    // 7-Day Behavioral Patterns
    patterns: {
        meals_logged: number;
        checkins_completed: number;
        avg_fibre_g_per_day: number | null;
        post_meal_walks: number;
        avg_steps_per_day: number | null;
        avg_active_minutes: number | null;
        avg_sleep_hours: number | null;
        weight_logs_count: number;
        weight_trend: 'up' | 'down' | 'stable' | null;
        glucose_logs_count: number;
        time_in_zone_pct: number | null;
        logging_by_day_of_week: number[];
    };

    // Metabolic Context
    metabolic_score: number | null;
    metabolic_trend: 'up' | 'down' | 'stable' | null;
    score_components: { rhr: number | null; steps: number | null; sleep: number | null; hrv: number | null } | null;

    // Active Programs
    active_pathway: { slug: string; title: string; day_number: number; total_days: number } | null;
    active_actions_count: number;
    completed_actions_today: string[];

    // Engagement State
    streak_days: number;
    actions_completed_7d: number;
    actions_started_7d: number;

    // Glucose Patterns
    glucose: {
        avg_fasting: number | null;
        avg_post_meal_peak: number | null;
        carb_sensitivity: number | null;
        exercise_effect: number | null;
        top_response_times: string[];
    } | null;

    // Food Response Patterns (from calibration)
    top_response_food_categories: string[];
    best_glucose_days: number[];
    worst_glucose_days: number[];

    // Suggestion Engagement
    suggestion_acceptance_rate: number | null;

    // App Usage Patterns
    typical_usage_hours: number[];

    // Trough Flag
    is_week_3_4_trough: boolean;

    // Repetition Avoidance
    recent_ai_action_types: string[];
    recent_ai_categories: string[];
    last_weekly_review_metric: string | null;
    recent_weekly_review_metrics: string[];

    // Time Context
    local_hour: number;
    day_of_week: number;
    is_weekend: boolean;

    // Raw daily features (for chat block sparklines)
    daily_features: DailyFeatureRow[];
}

// ============================================
// Journey & Tone Computation
// ============================================

function computeJourneyStage(daysSinceSignup: number, daysSinceLastSession: number): JourneyStage {
    if (daysSinceLastSession >= 7) return 're_engagement';
    if (daysSinceSignup <= 14) return 'week_0_2';
    if (daysSinceSignup <= 28) return 'week_3_4';
    if (daysSinceSignup <= 56) return 'week_5_plus';
    return 'week_8_plus';
}

function computeToneMode(stage: JourneyStage): ToneMode {
    const map: Record<JourneyStage, ToneMode> = {
        'week_0_2': 'warm_welcome',
        'week_3_4': 'pattern_reveal',
        'week_5_plus': 'confident_coach',
        'week_8_plus': 'trusted_partner',
        're_engagement': 'gentle_return',
    };
    return map[stage];
}

// ============================================
// Pattern Aggregation
// ============================================

export interface DailyFeatureRow {
    date: string;
    meal_count: number | null;
    meal_checkin_count: number | null;
    fibre_g_avg: number | null;
    steps: number | null;
    active_minutes: number | null;
    sleep_hours: number | null;
    glucose_logs_count: number | null;
    time_in_range_pct: number | null;
    interactions: Record<string, unknown>;
}

function aggregatePatterns(rows: DailyFeatureRow[], weightLogs: { logged_at: string; weight_kg: number }[]) {
    const totalMeals = rows.reduce((sum, r) => sum + (r.meal_count ?? 0), 0);
    const totalCheckins = rows.reduce((sum, r) => sum + (r.meal_checkin_count ?? 0), 0);
    const totalGlucoseLogs = rows.reduce((sum, r) => sum + (r.glucose_logs_count ?? 0), 0);

    const fibreValues = rows.map(r => r.fibre_g_avg).filter((v): v is number => v !== null && v > 0);
    const stepsValues = rows.map(r => r.steps).filter((v): v is number => v !== null);
    const activeValues = rows.map(r => r.active_minutes).filter((v): v is number => v !== null);
    const sleepValues = rows.map(r => r.sleep_hours).filter((v): v is number => v !== null);
    const tirValues = rows.map(r => r.time_in_range_pct).filter((v): v is number => v !== null);

    // Post-meal walks from interactions
    const postMealWalks = rows.reduce((sum, r) => {
        const interactions = r.interactions as Record<string, unknown>;
        return sum + (typeof interactions?.post_meal_walk_count === 'number' ? interactions.post_meal_walk_count : 0);
    }, 0);

    // Logging by day of week
    const loggingByDow = [0, 0, 0, 0, 0, 0, 0]; // Sun=0..Sat=6
    for (const row of rows) {
        const dow = new Date(row.date).getDay();
        loggingByDow[dow] += row.meal_count ?? 0;
    }

    // Weight trend
    let weightTrend: 'up' | 'down' | 'stable' | null = null;
    if (weightLogs.length >= 2) {
        const sorted = [...weightLogs].sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
        const first = sorted[0].weight_kg;
        const last = sorted[sorted.length - 1].weight_kg;
        const diff = last - first;
        if (diff > 0.5) weightTrend = 'up';
        else if (diff < -0.5) weightTrend = 'down';
        else weightTrend = 'stable';
    }

    return {
        meals_logged: totalMeals,
        checkins_completed: totalCheckins,
        avg_fibre_g_per_day: fibreValues.length > 0 ? Math.round((fibreValues.reduce((s, v) => s + v, 0) / fibreValues.length) * 10) / 10 : null,
        post_meal_walks: postMealWalks,
        avg_steps_per_day: stepsValues.length > 0 ? Math.round(stepsValues.reduce((s, v) => s + v, 0) / stepsValues.length) : null,
        avg_active_minutes: activeValues.length > 0 ? Math.round(activeValues.reduce((s, v) => s + v, 0) / activeValues.length) : null,
        avg_sleep_hours: sleepValues.length > 0 ? Math.round((sleepValues.reduce((s, v) => s + v, 0) / sleepValues.length) * 10) / 10 : null,
        weight_logs_count: weightLogs.length,
        weight_trend: weightTrend,
        glucose_logs_count: totalGlucoseLogs,
        time_in_zone_pct: tirValues.length > 0 ? Math.round((tirValues.reduce((s, v) => s + v, 0) / tirValues.length) * 10) / 10 : null,
        logging_by_day_of_week: loggingByDow,
    };
}

// ============================================
// Streak Calculation
// ============================================

function computeStreak(sessions: { session_date: string }[]): number {
    if (!sessions.length) return 0;

    const dates = sessions.map(s => s.session_date).sort().reverse();
    const today = new Date().toISOString().slice(0, 10);

    // Must include today or yesterday to count as active streak
    if (dates[0] !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (dates[0] !== yesterday) return 0;
    }

    let streak = 1;
    for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1]);
        const curr = new Date(dates[i]);
        const diffDays = (prev.getTime() - curr.getTime()) / 86400000;
        if (Math.round(diffDays) === 1) {
            streak++;
        } else {
            break;
        }
    }
    return streak;
}

// ============================================
// Typical Usage Hours
// ============================================

function computeTypicalUsageHours(sessions: { session_date: string; first_opened_at?: string }[]): number[] {
    const hourCounts: Record<number, number> = {};
    for (const s of sessions) {
        if (!s.first_opened_at) continue;
        const hour = new Date(s.first_opened_at).getHours();
        hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
    }
    return Object.entries(hourCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([h]) => Number(h));
}

// ============================================
// Suggestion Acceptance Rate
// ============================================

function computeAcceptanceRate(events: { event_type: string }[]): number | null {
    const shown = events.filter(e => e.event_type === 'shown').length;
    const tapped = events.filter(e => e.event_type === 'tapped').length;
    if (shown === 0) return null;
    return Math.round((tapped / shown) * 100);
}

// ============================================
// Main Builder
// ============================================

export async function buildUserContext(
    supabase: SupabaseClient,
    userId: string,
    localHour: number
): Promise<UserContextObject> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const todayDate = now.toISOString().slice(0, 10);
    const dayOfWeek = now.getDay();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    // Run 6 parallel queries (core tables that are guaranteed to exist)
    const [
        profileResult,
        sessionsResult,
        featuresResult,
        actionsResult,
        aiHistoryResult,
        calibrationResult,
    ] = await Promise.all([
        // 1. Profile
        supabase.from('profiles').select('*').eq('id', userId).single(),

        // 2. App sessions (last 30 days) — include first_opened_at for usage hours
        supabase
            .from('user_app_sessions')
            .select('session_date, first_opened_at')
            .eq('user_id', userId)
            .gte('session_date', thirtyDaysAgo)
            .order('session_date', { ascending: false }),

        // 3. Daily features (7 days)
        supabase
            .from('metabolic_daily_features')
            .select('*')
            .eq('user_id', userId)
            .gte('date', sevenDaysAgo)
            .lte('date', todayDate)
            .order('date', { ascending: false }),

        // 4. User actions (7 days)
        supabase
            .from('user_actions')
            .select('*')
            .eq('user_id', userId)
            .gte('created_at', new Date(now.getTime() - 7 * 86400000).toISOString())
            .order('created_at', { ascending: false }),

        // 5. AI output history (last 5)
        supabase
            .from('ai_output_history')
            .select('output_type, action_type, metadata')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(5),

        // 6. User calibration
        supabase.from('user_calibration').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    // Also fetch weight logs for trend (separate due to potential missing table)
    let weightLogs: { logged_at: string; weight_kg: number }[] = [];
    try {
        const { data } = await supabase
            .from('weight_logs')
            .select('logged_at, weight_kg')
            .eq('user_id', userId)
            .gte('logged_at', new Date(now.getTime() - 14 * 86400000).toISOString())
            .order('logged_at', { ascending: true });
        weightLogs = data || [];
    } catch {
        // weight_logs table may not exist yet
    }

    // Also fetch active pathway
    let activePathway: UserContextObject['active_pathway'] = null;
    try {
        const { data: pathwayData } = await supabase
            .from('user_care_pathways')
            .select('*, template:care_pathway_templates(slug, title, duration_days)')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('start_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (pathwayData?.template) {
            const startAt = new Date(pathwayData.start_at);
            const dayNumber = Math.max(1, Math.ceil((now.getTime() - startAt.getTime()) / 86400000));
            activePathway = {
                slug: pathwayData.template.slug,
                title: pathwayData.template.title,
                day_number: dayNumber,
                total_days: pathwayData.template.duration_days,
            };
        }
    } catch {
        // Pathway tables may not exist yet
    }

    // Also fetch metabolic score
    let metabolicScore: number | null = null;
    let metabolicTrend: 'up' | 'down' | 'stable' | null = null;
    let scoreComponents: UserContextObject['score_components'] = null;
    try {
        const { data: scoreData } = await supabase
            .from('metabolic_weekly_scores')
            .select('*')
            .eq('user_id', userId)
            .order('week_start', { ascending: false })
            .limit(2);

        if (scoreData && scoreData.length > 0) {
            metabolicScore = scoreData[0].score;
            scoreComponents = {
                rhr: scoreData[0].rhr_score ?? null,
                steps: scoreData[0].steps_score ?? null,
                sleep: scoreData[0].sleep_score ?? null,
                hrv: scoreData[0].hrv_score ?? null,
            };
            if (scoreData.length >= 2 && scoreData[1].score !== null) {
                const diff = (scoreData[0].score ?? 0) - scoreData[1].score;
                if (diff > 3) metabolicTrend = 'up';
                else if (diff < -3) metabolicTrend = 'down';
                else metabolicTrend = 'stable';
            }
        }
    } catch {
        // Score table may not exist
    }

    // Fetch AI suggestion events for acceptance rate (table may not exist yet)
    let suggestionEvents: { event_type: string }[] = [];
    try {
        const { data } = await supabase
            .from('ai_suggestion_events')
            .select('event_type')
            .eq('user_id', userId)
            .eq('output_type', 'next_best_action')
            .gte('created_at', new Date(now.getTime() - 30 * 86400000).toISOString());
        suggestionEvents = data || [];
    } catch {
        // ai_suggestion_events table may not exist yet
    }

    // Fetch recent weekly review metrics for dedup (table may not exist yet)
    let recentReviewRows: { key_metric: string }[] = [];
    try {
        const { data } = await supabase
            .from('weekly_reviews')
            .select('key_metric')
            .eq('user_id', userId)
            .order('week_start', { ascending: false })
            .limit(2);
        recentReviewRows = data || [];
    } catch {
        // weekly_reviews table may not exist yet
    }

    const profile = profileResult.data;
    const sessions = sessionsResult.data || [];
    const features = (featuresResult.data || []) as DailyFeatureRow[];
    const allActions = actionsResult.data || [];
    const aiHistory = aiHistoryResult.data || [];
    const calibration = calibrationResult.data;

    // Compute derived values
    const createdAt = profile?.created_at ? new Date(profile.created_at) : now;
    const daysSinceSignup = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 86400000));

    const lastSessionDate = sessions.length > 0 ? sessions[0].session_date : todayDate;
    const daysSinceLastSession = Math.max(0, Math.floor((now.getTime() - new Date(lastSessionDate).getTime()) / 86400000));

    const journeyStage = computeJourneyStage(daysSinceSignup, daysSinceLastSession);
    const toneMode = computeToneMode(journeyStage);

    const patterns = aggregatePatterns(features, weightLogs);
    const streak = computeStreak(sessions);

    // Action stats
    const activeActionsCount = allActions.filter((a: { status: string }) => a.status === 'active').length;
    const todayStr = todayDate;
    const completedToday = allActions
        .filter((a: { status: string; completed_at: string | null }) =>
            a.status === 'completed' && a.completed_at && a.completed_at.startsWith(todayStr))
        .map((a: { action_type: string }) => a.action_type);

    const actionsCompleted7d = allActions.filter((a: { status: string }) => a.status === 'completed').length;
    const actionsStarted7d = allActions.length;

    // AI history for dedup
    const recentAiActionTypes = aiHistory
        .map((h: { action_type: string | null }) => h.action_type)
        .filter((t: string | null): t is string => !!t);
    const recentAiCategories = aiHistory
        .map((h: { metadata: Record<string, unknown> }) => (h.metadata as Record<string, string>)?.category)
        .filter((c: string | undefined): c is string => !!c);

    // Weekly review metrics for dedup (last 2)
    const recentWeeklyReviewMetrics = recentReviewRows
        .map((r: { key_metric: string }) => r.key_metric)
        .filter(Boolean);
    const lastWeeklyReviewMetric = recentWeeklyReviewMetrics[0] ?? null;

    // Glucose patterns from calibration
    let glucosePatterns: UserContextObject['glucose'] = null;
    if (calibration) {
        glucosePatterns = {
            avg_fasting: calibration.avg_fasting_glucose ?? null,
            avg_post_meal_peak: calibration.avg_post_meal_peak ?? null,
            carb_sensitivity: calibration.carb_sensitivity ?? null,
            exercise_effect: calibration.exercise_effect ?? null,
            top_response_times: calibration.top_spike_times ?? [],
        };
    }

    // Food response patterns from calibration
    const topResponseFoodCategories: string[] = calibration?.top_response_food_categories ?? [];
    const bestGlucoseDays: number[] = calibration?.best_glucose_days ?? [];
    const worstGlucoseDays: number[] = calibration?.worst_glucose_days ?? [];

    // Suggestion acceptance rate (tapped / shown, last 30 days)
    const suggestionAcceptanceRate = computeAcceptanceRate(suggestionEvents);

    // Typical usage hours (top 3)
    const typicalUsageHours = computeTypicalUsageHours(sessions);

    // Week 3-4 trough detection
    const isWeek34Trough = journeyStage === 'week_3_4' &&
        patterns.meals_logged >= 10 &&
        patterns.time_in_zone_pct !== null &&
        patterns.time_in_zone_pct < 70;

    return {
        user_id: userId,
        first_name: profile?.first_name ?? null,
        journey_stage: journeyStage,
        tone_mode: toneMode,
        days_since_signup: daysSinceSignup,
        days_since_last_session: daysSinceLastSession,

        com_b_barrier: profile?.com_b_barrier ?? null,
        readiness_level: profile?.readiness_level ?? null,
        coaching_style: profile?.coaching_style ?? null,
        primary_habit: profile?.primary_habit ?? null,
        prompt_window: profile?.prompt_window ?? null,
        tracking_mode: profile?.tracking_mode ?? 'meals_only',

        dietary_preferences: profile?.dietary_preferences ?? [],
        cultural_food_context: profile?.cultural_food_context ?? null,

        patterns,

        metabolic_score: metabolicScore,
        metabolic_trend: metabolicTrend,
        score_components: scoreComponents,

        active_pathway: activePathway,
        active_actions_count: activeActionsCount,
        completed_actions_today: completedToday,

        streak_days: streak,
        actions_completed_7d: actionsCompleted7d,
        actions_started_7d: actionsStarted7d,

        glucose: glucosePatterns,

        top_response_food_categories: topResponseFoodCategories,
        best_glucose_days: bestGlucoseDays,
        worst_glucose_days: worstGlucoseDays,

        suggestion_acceptance_rate: suggestionAcceptanceRate,
        typical_usage_hours: typicalUsageHours,
        is_week_3_4_trough: isWeek34Trough,

        recent_ai_action_types: recentAiActionTypes,
        recent_ai_categories: recentAiCategories,
        last_weekly_review_metric: lastWeeklyReviewMetric,
        recent_weekly_review_metrics: recentWeeklyReviewMetrics,

        local_hour: localHour,
        day_of_week: dayOfWeek,
        is_weekend: dayOfWeek === 0 || dayOfWeek === 6,

        daily_features: features,
    };
}

// ============================================
// Context Serializer (for prompt injection)
// ============================================

export function serializeContextForPrompt(ctx: UserContextObject): string {
    const lines: string[] = [];

    lines.push(`## User Profile`);
    if (ctx.first_name) lines.push(`Name: ${ctx.first_name}`);
    lines.push(`Journey: ${ctx.journey_stage} (day ${ctx.days_since_signup})`);
    lines.push(`Tone: ${ctx.tone_mode}`);
    if (ctx.days_since_last_session > 1) lines.push(`Days since last session: ${ctx.days_since_last_session}`);
    lines.push(`Tracking mode: ${ctx.tracking_mode}`);
    if (ctx.com_b_barrier) lines.push(`COM-B barrier: ${ctx.com_b_barrier}`);
    if (ctx.readiness_level) lines.push(`Readiness: ${ctx.readiness_level}`);
    if (ctx.coaching_style) lines.push(`Coaching style: ${ctx.coaching_style}`);
    if (ctx.primary_habit) lines.push(`Primary habit: ${ctx.primary_habit}`);
    if (ctx.prompt_window) lines.push(`Preferred prompt window: ${ctx.prompt_window}`);

    if (ctx.dietary_preferences.length > 0) {
        lines.push(`\n## Dietary Preferences`);
        lines.push(`Preferences: ${ctx.dietary_preferences.join(', ')}`);
        if (ctx.cultural_food_context) lines.push(`Cultural context: ${ctx.cultural_food_context}`);
    }

    lines.push(`\n## 7-Day Patterns`);
    lines.push(`Meals logged: ${ctx.patterns.meals_logged}`);
    if (ctx.patterns.checkins_completed > 0) lines.push(`Check-ins: ${ctx.patterns.checkins_completed}`);
    if (ctx.patterns.avg_fibre_g_per_day !== null) lines.push(`Avg fiber: ${ctx.patterns.avg_fibre_g_per_day}g/day`);
    if (ctx.patterns.post_meal_walks > 0) lines.push(`Post-meal walks: ${ctx.patterns.post_meal_walks}`);
    if (ctx.patterns.avg_steps_per_day !== null) lines.push(`Avg steps: ${ctx.patterns.avg_steps_per_day}/day`);
    if (ctx.patterns.avg_active_minutes !== null) lines.push(`Avg active minutes: ${ctx.patterns.avg_active_minutes}/day`);
    if (ctx.patterns.avg_sleep_hours !== null) lines.push(`Avg sleep: ${ctx.patterns.avg_sleep_hours}h/night`);
    if (ctx.patterns.glucose_logs_count > 0) lines.push(`Glucose logs: ${ctx.patterns.glucose_logs_count}`);
    if (ctx.patterns.time_in_zone_pct !== null) lines.push(`Time in zone: ${ctx.patterns.time_in_zone_pct}%`);
    if (ctx.patterns.weight_logs_count > 0) {
        lines.push(`Weight logs: ${ctx.patterns.weight_logs_count} (trend: ${ctx.patterns.weight_trend ?? 'unknown'})`);
    }

    if (ctx.metabolic_score !== null) {
        lines.push(`\n## Metabolic Score`);
        lines.push(`Score: ${ctx.metabolic_score}/100 (trend: ${ctx.metabolic_trend ?? 'new'})`);
        if (ctx.score_components) {
            const c = ctx.score_components;
            const parts: string[] = [];
            if (c.rhr !== null) parts.push(`RHR: ${c.rhr}`);
            if (c.steps !== null) parts.push(`Steps: ${c.steps}`);
            if (c.sleep !== null) parts.push(`Sleep: ${c.sleep}`);
            if (c.hrv !== null) parts.push(`HRV: ${c.hrv}`);
            if (parts.length > 0) lines.push(`Components: ${parts.join(', ')}`);
        }
    }

    if (ctx.glucose) {
        lines.push(`\n## Glucose`);
        if (ctx.glucose.avg_fasting !== null) lines.push(`Avg fasting: ${ctx.glucose.avg_fasting} mmol/L`);
        if (ctx.glucose.avg_post_meal_peak !== null) lines.push(`Avg post-meal peak: ${ctx.glucose.avg_post_meal_peak} mmol/L`);
        if (ctx.glucose.top_response_times.length > 0) lines.push(`Top response times: ${ctx.glucose.top_response_times.join(', ')}`);
    }

    if (ctx.top_response_food_categories.length > 0) {
        lines.push(`\n## Food Response Patterns`);
        lines.push(`Top response foods: ${ctx.top_response_food_categories.join(', ')}`);
        if (ctx.best_glucose_days.length > 0) {
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            lines.push(`Best glucose days: ${ctx.best_glucose_days.map(d => dayNames[d]).join(', ')}`);
        }
        if (ctx.worst_glucose_days.length > 0) {
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            lines.push(`Worst glucose days: ${ctx.worst_glucose_days.map(d => dayNames[d]).join(', ')}`);
        }
    }

    if (ctx.active_pathway) {
        lines.push(`\n## Active Program`);
        lines.push(`${ctx.active_pathway.title}: day ${ctx.active_pathway.day_number}/${ctx.active_pathway.total_days}`);
    }

    lines.push(`\n## Engagement`);
    lines.push(`Streak: ${ctx.streak_days} days`);
    lines.push(`Active actions: ${ctx.active_actions_count}`);
    if (ctx.completed_actions_today.length > 0) lines.push(`Completed today: ${ctx.completed_actions_today.join(', ')}`);
    lines.push(`Actions completed (7d): ${ctx.actions_completed_7d}/${ctx.actions_started_7d}`);
    if (ctx.suggestion_acceptance_rate !== null) lines.push(`Suggestion acceptance rate (30d): ${ctx.suggestion_acceptance_rate}%`);
    if (ctx.is_week_3_4_trough) lines.push(`Status: Week 3-4 trough (consistent logging, glucose patterns still emerging)`);

    if (ctx.recent_ai_action_types.length > 0) {
        lines.push(`\n## Recent AI Suggestions (avoid repeating)`);
        lines.push(`Action types: ${ctx.recent_ai_action_types.join(', ')}`);
    }

    lines.push(`\n## Time Context`);
    lines.push(`Local hour: ${ctx.local_hour}, ${ctx.is_weekend ? 'Weekend' : 'Weekday'}`);
    if (ctx.typical_usage_hours.length > 0) lines.push(`Typical usage hours: ${ctx.typical_usage_hours.join(', ')}`);

    return lines.join('\n');
}
