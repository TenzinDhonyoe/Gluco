/**
 * useDailyCheckin Hook
 *
 * Manages today's daily check-in state.
 * Auto-fetches on mount and focus.
 */

import { useAuth } from '@/context/AuthContext';
import { recordStreakActivity } from '@/lib/streaks';
import {
    DailyCheckin,
    DailyCheckinInput,
    getTodayCheckin,
    saveDailyCheckin,
} from '@/lib/supabase';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

interface UseDailyCheckinResult {
    todayCheckin: DailyCheckin | null;
    isCompleted: boolean;
    loading: boolean;
    saving: boolean;
    submit: (input: DailyCheckinInput) => Promise<DailyCheckin | null>;
    refresh: () => Promise<void>;
}

export function useDailyCheckin(): UseDailyCheckinResult {
    const { user } = useAuth();
    const [todayCheckin, setTodayCheckin] = useState<DailyCheckin | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const mountedRef = useRef(true);

    const fetchToday = useCallback(async () => {
        if (!user?.id) {
            setLoading(false);
            return;
        }

        try {
            const checkin = await getTodayCheckin(user.id);
            if (mountedRef.current) {
                setTodayCheckin(checkin);
            }
        } catch (error) {
            console.error('[useDailyCheckin] fetch error:', error);
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [user?.id]);

    // Fetch on mount
    useEffect(() => {
        mountedRef.current = true;
        fetchToday();
        return () => { mountedRef.current = false; };
    }, [fetchToday]);

    // Refetch when app comes to foreground
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') fetchToday();
        });
        return () => subscription.remove();
    }, [fetchToday]);

    const submit = useCallback(async (input: DailyCheckinInput): Promise<DailyCheckin | null> => {
        if (!user?.id) return null;

        setSaving(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const result = await saveDailyCheckin(user.id, today, input);
            if (mountedRef.current && result) {
                setTodayCheckin(result);
            }
            // Record streak activity on successful check-in
            if (result) {
                recordStreakActivity(user.id).catch(() => {});
            }
            return result;
        } catch (error) {
            console.error('[useDailyCheckin] save error:', error);
            return null;
        } finally {
            if (mountedRef.current) setSaving(false);
        }
    }, [user?.id]);

    const isCompleted = todayCheckin?.completed_at != null;

    return {
        todayCheckin,
        isCompleted,
        loading,
        saving,
        submit,
        refresh: fetchToday,
    };
}
