/**
 * Gemini-powered query rewrite fallback
 * Calls Edge Function to get corrected/alternative queries
 */

import { supabase } from '@/lib/supabase';
import {
    CACHE_TTL,
    generateGeminiCacheKey,
    getCached,
    setCache,
} from './cache';

export interface GeminiRewriteResult {
    corrected_query: string;
    alternative_queries: string[];
    synonyms: string[];
}

// Track in-flight requests to prevent duplicate calls
const inFlightRequests = new Map<string, Promise<GeminiRewriteResult | null>>();

/**
 * Get query rewrite suggestions from Gemini via Edge Function
 * - Cached for 7 days
 * - Never called more than once per unique query
 * - Returns null on error (graceful degradation)
 */
export async function getQueryRewrite(
    query: string,
    signal?: AbortSignal
): Promise<GeminiRewriteResult | null> {
    const normalizedQuery = query.toLowerCase().trim();

    if (normalizedQuery.length < 2) {
        return null;
    }

    const cacheKey = generateGeminiCacheKey(normalizedQuery);

    // Check cache first
    const cached = await getCached<GeminiRewriteResult>(cacheKey);
    if (cached) {
        return cached;
    }

    // Check if request is already in flight
    const inFlight = inFlightRequests.get(normalizedQuery);
    if (inFlight) {
        return inFlight;
    }

    // Create the request promise
    const requestPromise = (async (): Promise<GeminiRewriteResult | null> => {
        try {
            // Check abort signal
            if (signal?.aborted) {
                return null;
            }

            const { data, error } = await supabase.functions.invoke('food-query-rewrite', {
                body: { query: normalizedQuery },
            });

            if (error) {
                console.warn('Gemini rewrite error:', error);
                return null;
            }

            if (!data || !data.corrected_query) {
                console.warn('Gemini rewrite: invalid response');
                return null;
            }

            const result: GeminiRewriteResult = {
                corrected_query: data.corrected_query || normalizedQuery,
                alternative_queries: data.alternative_queries || [],
                synonyms: data.synonyms || [],
            };

            // Cache the result
            await setCache(cacheKey, result, CACHE_TTL.GEMINI_REWRITE);

            return result;
        } catch (err) {
            console.warn('Gemini rewrite failed:', err);
            return null;
        } finally {
            // Remove from in-flight map
            inFlightRequests.delete(normalizedQuery);
        }
    })();

    // Store in in-flight map
    inFlightRequests.set(normalizedQuery, requestPromise);

    return requestPromise;
}

/**
 * Check if Gemini rewrite is available (for UI display)
 */
export function hasGeminiRewrite(result: GeminiRewriteResult | null, originalQuery: string): boolean {
    if (!result) return false;

    const normalizedOriginal = originalQuery.toLowerCase().trim();
    const normalizedCorrected = result.corrected_query.toLowerCase().trim();

    return normalizedCorrected !== normalizedOriginal;
}
