/**
 * Streak Business Logic
 *
 * Pure functions for streak computation — no side effects.
 * Database I/O lives in lib/supabase.ts; this module owns the rules.
 */

import type { UserStreak } from './supabase';

// ============================================
// MILESTONE DEFINITIONS
// ============================================

export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 90] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

// ============================================
// PURE STREAK COMPUTATION
// ============================================

export interface StreakUpdateResult {
    current_streak: number;
    longest_streak: number;
    last_active_date: string;
    shields_available: number;
    shields_used_this_week: number;
    shield_week_start: string | null;
    /** Non-null when a new milestone is reached */
    newMilestone: StreakMilestone | null;
    /** True if a shield was auto-consumed to save the streak */
    shieldUsed: boolean;
    /** True if the streak was reset (no shield available) */
    streakBroken: boolean;
}

function toDateKey(d: Date): string {
    return d.toISOString().split('T')[0];
}

function daysBetween(a: string, b: string): number {
    const msPerDay = 86_400_000;
    return Math.round(
        (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / msPerDay
    );
}

function getWeekStart(date: string): string {
    const d = new Date(date + 'T00:00:00');
    const day = d.getDay(); // 0 = Sunday
    d.setDate(d.getDate() - day);
    return toDateKey(d);
}

/**
 * Compute the next streak state.
 *
 * @param current  Current DB row (null for first-time users)
 * @param today    ISO date string (YYYY-MM-DD) of the active day
 */
export function computeStreakUpdate(
    current: UserStreak | null,
    today: string
): StreakUpdateResult {
    // First-time user
    if (!current || !current.last_active_date) {
        return {
            current_streak: 1,
            longest_streak: 1,
            last_active_date: today,
            shields_available: 1,
            shields_used_this_week: 0,
            shield_week_start: getWeekStart(today),
            newMilestone: null,
            shieldUsed: false,
            streakBroken: false,
        };
    }

    const gap = daysBetween(current.last_active_date, today);

    // Already checked in today — no change
    if (gap === 0) {
        return {
            current_streak: current.current_streak,
            longest_streak: current.longest_streak,
            last_active_date: current.last_active_date,
            shields_available: resetShieldIfNewWeek(current, today).shields_available,
            shields_used_this_week: resetShieldIfNewWeek(current, today).shields_used_this_week,
            shield_week_start: resetShieldIfNewWeek(current, today).shield_week_start,
            newMilestone: null,
            shieldUsed: false,
            streakBroken: false,
        };
    }

    // Reset shield weekly
    const shieldState = resetShieldIfNewWeek(current, today);

    // Yesterday — increment
    if (gap === 1) {
        const newStreak = current.current_streak + 1;
        const longest = Math.max(newStreak, current.longest_streak);
        const milestone = detectNewMilestone(newStreak, current.last_milestone_celebrated);
        return {
            current_streak: newStreak,
            longest_streak: longest,
            last_active_date: today,
            ...shieldState,
            newMilestone: milestone,
            shieldUsed: false,
            streakBroken: false,
        };
    }

    // Missed 1 day (gap === 2) and shield available — use shield
    if (gap === 2 && shieldState.shields_available > 0) {
        const newStreak = current.current_streak + 1;
        const longest = Math.max(newStreak, current.longest_streak);
        const milestone = detectNewMilestone(newStreak, current.last_milestone_celebrated);
        return {
            current_streak: newStreak,
            longest_streak: longest,
            last_active_date: today,
            shields_available: shieldState.shields_available - 1,
            shields_used_this_week: shieldState.shields_used_this_week + 1,
            shield_week_start: shieldState.shield_week_start,
            newMilestone: milestone,
            shieldUsed: true,
            streakBroken: false,
        };
    }

    // Streak broken — reset
    return {
        current_streak: 1,
        longest_streak: current.longest_streak,
        last_active_date: today,
        ...shieldState,
        newMilestone: null,
        shieldUsed: false,
        streakBroken: current.current_streak >= 2,
    };
}

// ============================================
// HELPERS
// ============================================

function resetShieldIfNewWeek(
    current: UserStreak,
    today: string
): { shields_available: number; shields_used_this_week: number; shield_week_start: string | null } {
    const currentWeekStart = getWeekStart(today);
    if (!current.shield_week_start || current.shield_week_start !== currentWeekStart) {
        return {
            shields_available: 1,
            shields_used_this_week: 0,
            shield_week_start: currentWeekStart,
        };
    }
    return {
        shields_available: current.shields_available,
        shields_used_this_week: current.shields_used_this_week,
        shield_week_start: current.shield_week_start,
    };
}

function detectNewMilestone(
    streak: number,
    lastCelebrated: number | null
): StreakMilestone | null {
    for (const m of STREAK_MILESTONES) {
        if (streak >= m && (lastCelebrated === null || lastCelebrated < m)) {
            // Return the highest newly-reached milestone
            continue;
        }
    }
    // Re-scan: find highest reached but uncelebrated
    let best: StreakMilestone | null = null;
    for (const m of STREAK_MILESTONES) {
        if (streak >= m && (lastCelebrated === null || lastCelebrated < m)) {
            best = m;
        }
    }
    return best;
}

// ============================================
// UI MESSAGING
// ============================================

export function getStreakResetMessage(previousStreak: number): string {
    if (previousStreak >= 14) {
        return 'That was an amazing run. Starting fresh today.';
    }
    if (previousStreak >= 7) {
        return 'Great week! Every streak starts with day one.';
    }
    return 'Welcome back — today is a fresh start.';
}

const MILESTONE_MESSAGES: Record<StreakMilestone, string> = {
    3: 'Three days in — you\'re building a pattern.',
    7: 'A full week! Consistency is your superpower.',
    14: 'Two weeks strong. This is becoming a habit.',
    30: 'One month! You\'re in the top 10% of users.',
    60: 'Sixty days. This is who you are now.',
    90: 'Ninety days — truly remarkable dedication.',
};

export function getMilestoneMessage(milestone: StreakMilestone): string {
    return MILESTONE_MESSAGES[milestone] ?? `${milestone}-day streak!`;
}

// ============================================
// STANDALONE ACTIVITY RECORDER
// ============================================

/**
 * Record a streak activity for the given user.
 * Call this after a real user action (meal log, check-in, action completion).
 * Safe to call from any screen — handles its own DB read/write.
 */
export async function recordStreakActivity(userId: string): Promise<void> {
    // Lazy import to avoid circular deps
    const { getUserStreak, upsertUserStreak } = await import('./supabase');

    try {
        const today = new Date().toISOString().split('T')[0];
        const current = await getUserStreak(userId);
        const update = computeStreakUpdate(current, today);

        await upsertUserStreak(userId, {
            current_streak: update.current_streak,
            longest_streak: update.longest_streak,
            last_active_date: update.last_active_date,
            shields_available: update.shields_available,
            shields_used_this_week: update.shields_used_this_week,
            shield_week_start: update.shield_week_start,
            last_milestone_celebrated: update.newMilestone
                ? update.newMilestone
                : current?.last_milestone_celebrated ?? null,
        });
    } catch (error) {
        console.error('[recordStreakActivity] error:', error);
    }
}
