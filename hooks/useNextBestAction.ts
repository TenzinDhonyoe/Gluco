import { invokeNextBestAction, NextBestActionResponse, trackAiSuggestionEvent } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function getHourBucket(hour: number): number {
    return Math.floor(hour / 4) * 4;
}

interface UseNextBestActionResult {
    action: NextBestActionResponse['action'] | null;
    source: NextBestActionResponse['source'] | null;
    loading: boolean;
    refresh: () => Promise<void>;
    trackTap: () => void;
}

export function useNextBestAction(userId: string | undefined, enabled = true): UseNextBestActionResult {
    const [action, setAction] = useState<NextBestActionResponse['action'] | null>(null);
    const [source, setSource] = useState<NextBestActionResponse['source'] | null>(null);
    const [loading, setLoading] = useState(false);
    const cacheRef = useRef<{ bucket: number; ts: number; data: NextBestActionResponse } | null>(null);
    const shownTrackedRef = useRef<string | null>(null);

    const fetchAction = useCallback(async () => {
        if (!userId || !enabled) return;

        const now = Date.now();
        const currentHour = new Date().getHours();
        const bucket = getHourBucket(currentHour);

        // Check cache
        if (cacheRef.current &&
            cacheRef.current.bucket === bucket &&
            now - cacheRef.current.ts < CACHE_TTL_MS) {
            setAction(cacheRef.current.data.action);
            setSource(cacheRef.current.data.source);
            return;
        }

        setLoading(true);
        try {
            const result = await invokeNextBestAction(userId, currentHour);
            if (result) {
                cacheRef.current = { bucket, ts: now, data: result };
                setAction(result.action);
                setSource(result.source);

                // Track 'shown' event (deduplicate by action title within cache window)
                const actionKey = result.action?.title ?? '';
                if (actionKey && shownTrackedRef.current !== actionKey) {
                    shownTrackedRef.current = actionKey;
                    trackAiSuggestionEvent(userId, 'next_best_action', 'shown', null, {
                        action_type: result.action?.action_type,
                        source: result.source,
                    });
                }
            }
        } catch (error) {
            console.error('Error fetching next best action:', error);
        } finally {
            setLoading(false);
        }
    }, [userId, enabled]);

    useFocusEffect(
        useCallback(() => {
            fetchAction();
        }, [fetchAction])
    );

    const trackTap = useCallback(() => {
        if (!userId || !action) return;
        trackAiSuggestionEvent(userId, 'next_best_action', 'tapped', null, {
            action_type: action.action_type,
            source,
        });
    }, [userId, action, source]);

    return { action, source, loading, refresh: fetchAction, trackTap };
}
