/**
 * useStreak Hook
 *
 * Reads streak state on mount/foreground (read-only).
 * Only increments the streak when recordActivity() is called
 * after a real user action (check-in, meal log, or action).
 */

import { useAuth } from '@/context/AuthContext';
import { getUserStreak, upsertUserStreak } from '@/lib/supabase';
import { computeStreakUpdate, type StreakMilestone } from '@/lib/streaks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

interface UseStreakResult {
    streak: number;
    longestStreak: number;
    shieldAvailable: boolean;
    /** Non-null when a new milestone should be celebrated */
    milestone: StreakMilestone | null;
    /** True if a shield was just used to save the streak */
    shieldUsed: boolean;
    /** True if the streak was broken this session */
    streakBroken: boolean;
    loading: boolean;
    /** Clear the milestone after celebration */
    clearMilestone: () => void;
    /** Call after a real user action (check-in, log, action) to record the streak */
    recordActivity: () => Promise<void>;
}

function toDateKey(d: Date): string {
    return d.toISOString().split('T')[0];
}

function daysBetweenKeys(a: string, b: string): number {
    const msPerDay = 86_400_000;
    return Math.round(
        (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / msPerDay
    );
}

export function useStreak(): UseStreakResult {
    const { user } = useAuth();
    const [streak, setStreak] = useState(0);
    const [longestStreak, setLongestStreak] = useState(0);
    const [shieldAvailable, setShieldAvailable] = useState(false);
    const [milestone, setMilestone] = useState<StreakMilestone | null>(null);
    const [shieldUsed, setShieldUsed] = useState(false);
    const [streakBroken, setStreakBroken] = useState(false);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);
    const fetchedRef = useRef(false);

    const today = toDateKey(new Date());

    /**
     * Read-only: fetch current streak from DB and compute display state
     * WITHOUT writing last_active_date = today.
     */
    const fetchStreak = useCallback(async () => {
        if (!user?.id) return;

        try {
            const current = await getUserStreak(user.id);
            if (!mountedRef.current) return;

            if (!current || !current.last_active_date) {
                // No streak record — show 0
                setStreak(0);
                setLongestStreak(0);
                setShieldAvailable(true);
                setShieldUsed(false);
                setStreakBroken(false);
                return;
            }

            const gap = daysBetweenKeys(current.last_active_date, today);

            if (gap === 0) {
                // Already active today
                setStreak(current.current_streak);
                setLongestStreak(current.longest_streak);
                setShieldAvailable(current.shields_available > 0);
                setShieldUsed(false);
                setStreakBroken(false);
            } else if (gap === 1) {
                // Yesterday — streak alive, waiting for today's action
                setStreak(current.current_streak);
                setLongestStreak(current.longest_streak);
                setShieldAvailable(current.shields_available > 0);
                setShieldUsed(false);
                setStreakBroken(false);
            } else if (gap === 2 && current.shields_available > 0) {
                // Missed 1 day, shield will save on next action
                setStreak(current.current_streak);
                setLongestStreak(current.longest_streak);
                setShieldAvailable(true);
                setShieldUsed(false);
                setStreakBroken(false);
            } else {
                // Streak broken
                setStreak(0);
                setLongestStreak(current.longest_streak);
                setShieldAvailable(current.shields_available > 0);
                setShieldUsed(false);
                setStreakBroken(current.current_streak >= 2);
            }

            fetchedRef.current = true;
        } catch (error) {
            console.error('[useStreak] fetch error:', error);
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [user?.id, today]);

    /**
     * Write: called after a real user action to record activity for today.
     * This is what actually increments the streak.
     */
    const recordActivity = useCallback(async () => {
        if (!user?.id) return;

        try {
            const current = await getUserStreak(user.id);
            const update = computeStreakUpdate(current, today);

            await upsertUserStreak(user.id, {
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

            if (!mountedRef.current) return;

            setStreak(update.current_streak);
            setLongestStreak(update.longest_streak);
            setShieldAvailable(update.shields_available > 0);
            setShieldUsed(update.shieldUsed);
            setStreakBroken(update.streakBroken);

            if (update.newMilestone) {
                setMilestone(update.newMilestone);
            }
        } catch (error) {
            console.error('[useStreak] recordActivity error:', error);
        }
    }, [user?.id, today]);

    // Read-only fetch on mount
    useEffect(() => {
        mountedRef.current = true;
        fetchStreak();
        return () => { mountedRef.current = false; };
    }, [fetchStreak]);

    // Read-only refetch when app comes to foreground
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') fetchStreak();
        });
        return () => subscription.remove();
    }, [fetchStreak]);

    const clearMilestone = useCallback(() => setMilestone(null), []);

    return {
        streak,
        longestStreak,
        shieldAvailable,
        milestone,
        shieldUsed,
        streakBroken,
        loading,
        clearMilestone,
        recordActivity,
    };
}
