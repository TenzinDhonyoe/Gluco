/**
 * usePersonalizedTips Hook
 *
 * Fetches personalized tips with caching:
 * - 6-hour TTL cache (tips are based on recent activity)
 * - Cache key includes user ID for personalization
 * - Falls back to default tips on error
 * - Prevents redundant API calls on screen focus
 */

import { getPersonalizedTips, PersonalizedTipsResult } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CACHE_VERSION = 'v1';
const CACHE_KEY_PREFIX = 'personalized_tips';

interface CacheEntry {
    ts: number;
    data: PersonalizedTipsResult;
}

interface UsePersonalizedTipsParams {
    userId: string | undefined;
    aiEnabled: boolean;
}

interface UsePersonalizedTipsResult {
    tips: PersonalizedTipsResult | null;
    loading: boolean;
    source: 'cache' | 'api' | 'none';
    refetch: () => Promise<void>;
}

/**
 * Get cache key for a specific user
 */
function getCacheKey(userId: string): string {
    return `${CACHE_KEY_PREFIX}:${CACHE_VERSION}:${userId}`;
}

/**
 * Hook for fetching and caching personalized tips
 */
export function usePersonalizedTips({
    userId,
    aiEnabled,
}: UsePersonalizedTipsParams): UsePersonalizedTipsResult {
    const [tips, setTips] = useState<PersonalizedTipsResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [source, setSource] = useState<'cache' | 'api' | 'none'>('none');

    // Refs to prevent parallel fetches
    const inFlightRef = useRef(false);
    const mountedRef = useRef(true);

    /**
     * Fetch tips from API and update cache
     */
    const fetchFromApi = useCallback(async (cacheKey: string): Promise<PersonalizedTipsResult | null> => {
        try {
            const result = await getPersonalizedTips(userId!);

            if (result && result.tips.length > 0) {
                // Save to cache
                const entry: CacheEntry = { ts: Date.now(), data: result };
                await AsyncStorage.setItem(cacheKey, JSON.stringify(entry));
                return result;
            }

            return null;
        } catch (error) {
            console.error('[usePersonalizedTips] API error:', error);
            return null;
        }
    }, [userId]);

    /**
     * Main fetch function - checks cache first, then API
     */
    const fetchTips = useCallback(async () => {
        if (!userId || !aiEnabled) {
            setLoading(false);
            setSource('none');
            return;
        }

        // Prevent parallel fetches
        if (inFlightRef.current) {
            return;
        }

        inFlightRef.current = true;
        const cacheKey = getCacheKey(userId);

        try {
            // Step 1: Check cache
            const cachedRaw = await AsyncStorage.getItem(cacheKey);

            if (cachedRaw) {
                try {
                    const cached: CacheEntry = JSON.parse(cachedRaw);
                    const age = Date.now() - cached.ts;

                    if (age < CACHE_TTL_MS && cached.data?.tips?.length > 0) {
                        // Cache hit - use cached data
                        if (mountedRef.current) {
                            setTips(cached.data);
                            setSource('cache');
                            setLoading(false);
                        }
                        inFlightRef.current = false;
                        return;
                    }
                } catch (parseError) {
                    // Invalid cache, will fetch from API
                    console.warn('[usePersonalizedTips] Cache parse error, fetching fresh');
                }
            }

            // Step 2: Cache miss or expired - fetch from API
            if (mountedRef.current) {
                setLoading(true);
            }

            const result = await fetchFromApi(cacheKey);

            if (mountedRef.current) {
                if (result) {
                    setTips(result);
                    setSource('api');
                } else {
                    setSource('none');
                }
            }
        } catch (error) {
            console.error('[usePersonalizedTips] fetch error:', error);
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
            inFlightRef.current = false;
        }
    }, [userId, aiEnabled, fetchFromApi]);

    /**
     * Force refetch (bypasses cache)
     */
    const refetch = useCallback(async () => {
        if (!userId || !aiEnabled) return;

        const cacheKey = getCacheKey(userId);

        // Clear existing cache
        await AsyncStorage.removeItem(cacheKey);

        // Fetch fresh
        inFlightRef.current = false;
        await fetchTips();
    }, [userId, aiEnabled, fetchTips]);

    // Initial fetch on mount
    useEffect(() => {
        mountedRef.current = true;
        fetchTips();

        return () => {
            mountedRef.current = false;
        };
    }, [fetchTips]);

    return { tips, loading, source, refetch };
}

/**
 * Utility to clear tips cache for a user (e.g., on logout)
 */
export async function clearPersonalizedTipsCache(userId: string): Promise<void> {
    try {
        const cacheKey = getCacheKey(userId);
        await AsyncStorage.removeItem(cacheKey);
    } catch (error) {
        console.error('[usePersonalizedTips] clear cache error:', error);
    }
}

/**
 * Utility to check if cache exists and is valid
 */
export async function hasValidTipsCache(userId: string): Promise<boolean> {
    try {
        const cacheKey = getCacheKey(userId);
        const cachedRaw = await AsyncStorage.getItem(cacheKey);

        if (!cachedRaw) return false;

        const cached: CacheEntry = JSON.parse(cachedRaw);
        const age = Date.now() - cached.ts;

        return age < CACHE_TTL_MS && cached.data?.tips?.length > 0;
    } catch {
        return false;
    }
}
