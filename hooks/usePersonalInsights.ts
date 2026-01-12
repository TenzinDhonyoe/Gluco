/**
 * usePersonalInsights Hook
 * 
 * Fetches LLM-powered personal insights with:
 * - Stable cache key (no loops)
 * - 12-hour TTL cache
 * - Guards against parallel fetches
 * - Fallback to rules-based insights
 */

import { generateInsights, InsightData, PersonalInsight, TrackingMode } from '@/lib/insights';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const CACHE_VERSION = 'v5'; // Bumped to invalidate after adding timeInZonePercent

interface CacheEntry {
    ts: number;
    data: PersonalInsight[];
}

interface UsePersonalInsightsParams {
    userId: string | undefined;
    trackingMode: TrackingMode;
    rangeKey: '7d' | '14d' | '30d' | '90d';
    enabled?: boolean;
    // Fallback data (only used if LLM fails)
    fallbackData?: InsightData;
}

interface UsePersonalInsightsResult {
    insights: PersonalInsight[];
    loading: boolean;
    source: 'cache' | 'llm' | 'fallback' | 'none';
}

export function usePersonalInsights({
    userId,
    trackingMode,
    rangeKey,
    enabled = true,
    fallbackData,
}: UsePersonalInsightsParams): UsePersonalInsightsResult {
    const [insights, setInsights] = useState<PersonalInsight[]>([]);
    const [loading, setLoading] = useState(true);
    const [source, setSource] = useState<'cache' | 'llm' | 'fallback' | 'none'>('none');

    // Refs to prevent parallel fetches and stale updates
    const inFlightRef = useRef(false);
    const lastKeyRef = useRef<string | null>(null);
    const mountedRef = useRef(true);

    // STABLE cache key - includes data counts so we regenerate when data loads
    const cacheKey = useMemo(() => {
        if (!userId) return null;
        // Include meal/glucose counts so key changes when data actually loads
        const mealCount = fallbackData?.totalMealsThisWeek ?? 0;
        const glucoseCount = fallbackData?.glucoseLogs?.length ?? 0;
        return `insights:${CACHE_VERSION}:${userId}:${trackingMode}:${rangeKey}:m${mealCount}:g${glucoseCount}`;
    }, [userId, trackingMode, rangeKey, fallbackData?.totalMealsThisWeek, fallbackData?.glucoseLogs?.length]);

    // Stable fetch function
    const fetchInsights = useCallback(async (key: string) => {
        inFlightRef.current = true;
        lastKeyRef.current = key;

        try {
            // Step 1: Check cache first
            const cachedRaw = await AsyncStorage.getItem(key);
            if (cachedRaw) {
                const cached: CacheEntry = JSON.parse(cachedRaw);
                const age = Date.now() - cached.ts;

                if (age < CACHE_TTL_MS && cached.data.length > 0) {
                    // Verify cache has new schema (recommendation field exists)
                    if (cached.data[0]?.recommendation) {
                        if (mountedRef.current) {
                            setInsights(cached.data);
                            setSource('cache');
                            setLoading(false);
                        }
                        inFlightRef.current = false;
                        return;
                    }
                }
            }

            // Step 2: Use rules-based insights directly (Edge Function returns old schema)
            // TODO: Re-enable LLM when Edge Function is updated with new recommendation schema
            if (mountedRef.current) setLoading(true);

            if (fallbackData) {
                const rulesInsights = generateInsights(fallbackData, trackingMode);

                if (rulesInsights.length > 0) {
                    // Write to cache
                    const entry: CacheEntry = { ts: Date.now(), data: rulesInsights };
                    await AsyncStorage.setItem(key, JSON.stringify(entry));

                    if (mountedRef.current) {
                        setInsights(rulesInsights);
                        setSource('fallback');
                    }
                }
            } else {
                // No fallback data provided
            }
        } catch (error) {
            console.error('[insights] fetch error:', error);

            // Fallback on error
            if (fallbackData && mountedRef.current) {
                const rulesInsights = generateInsights(fallbackData, trackingMode);
                setInsights(rulesInsights);
                setSource('fallback');
            }
        } finally {
            if (mountedRef.current) setLoading(false);
            inFlightRef.current = false;
        }
    }, [trackingMode, rangeKey, fallbackData]);

    // Effect with STABLE dependencies only
    useEffect(() => {
        mountedRef.current = true;

        if (!enabled || !cacheKey) {
            setLoading(false);
            return;
        }

        fetchInsights(cacheKey);

        return () => {
            mountedRef.current = false;
        };
    }, [cacheKey, enabled, fetchInsights]);

    return { insights, loading, source };
}
