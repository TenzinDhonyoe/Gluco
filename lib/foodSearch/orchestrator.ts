/**
 * Food Search Orchestrator
 * Main search function that coordinates normalization, caching, ranking, and Gemini fallback
 */

import { NormalizedFood, searchFoods } from '@/lib/supabase';
import {
    CACHE_TTL,
    generateSearchCacheKey,
    getCached,
    setCache,
} from './cache';
import { GeminiRewriteResult, getQueryRewrite, hasGeminiRewrite } from './geminiRewrite';
import { fixCommonTypos, getQueryVariants, normalizeQuery } from './normalize';
import { needsGeminiFallback, rankResults } from './rank';

// Configuration
const CONFIG = {
    MIN_QUERY_LENGTH: 2,
    MIN_RESULTS_FOR_GOOD_SEARCH: 8,
    MIN_SCORE_THRESHOLD: 50,
    MAX_RESULTS: 50,
    DEBOUNCE_MS: 400,
};

export interface SearchOptions {
    signal?: AbortSignal;
    skipCache?: boolean;
    skipGemini?: boolean;
}

export interface SearchResult {
    results: NormalizedFood[];
    correctedQuery: string | null;
    alternativeQueries: string[];
    isFromCache: boolean;
    geminiUsed: boolean;
}

/**
 * Main orchestrated search function
 * 
 * Flow:
 * 1. Normalize query, fix common typos
 * 2. Check cache, return if hit
 * 3. Call provider search
 * 4. If results < threshold, call Gemini rewrite
 * 5. Rerun search with alternatives if needed
 * 6. Merge, dedupe, rank results
 * 7. Cache and return
 */
export async function searchWithOrchestration(
    rawQuery: string,
    options: SearchOptions = {}
): Promise<SearchResult> {
    const { signal, skipCache = false, skipGemini = false } = options;

    // Early return for short queries
    if (rawQuery.trim().length < CONFIG.MIN_QUERY_LENGTH) {
        return {
            results: [],
            correctedQuery: null,
            alternativeQueries: [],
            isFromCache: false,
            geminiUsed: false,
        };
    }

    // Check abort signal
    if (signal?.aborted) {
        return {
            results: [],
            correctedQuery: null,
            alternativeQueries: [],
            isFromCache: false,
            geminiUsed: false,
        };
    }

    // Step 1: Normalize and fix common typos
    const normalizedQuery = normalizeQuery(rawQuery);
    const typoFixedQuery = fixCommonTypos(rawQuery);
    const queryVariants = getQueryVariants(rawQuery);

    // Determine if typo was corrected
    const typoWasCorrected = typoFixedQuery !== normalizedQuery;
    const correctedByTypoFix = typoWasCorrected ? typoFixedQuery : null;

    // Step 2: Check cache
    if (!skipCache) {
        const cacheKey = generateSearchCacheKey(typoFixedQuery);
        const cached = await getCached<SearchResult>(cacheKey);
        if (cached) {
            return { ...cached, isFromCache: true };
        }
    }

    // Step 3: Initial search with typo-fixed query
    let allResults: NormalizedFood[] = [];

    try {
        // Search with the main query (typo-fixed)
        const mainResults = await searchFoods(typoFixedQuery, CONFIG.MAX_RESULTS);
        allResults = [...mainResults];

        // Also search with variants if different
        for (const variant of queryVariants) {
            if (variant !== typoFixedQuery && allResults.length < CONFIG.MAX_RESULTS) {
                if (signal?.aborted) break;

                const variantResults = await searchFoods(variant, 15);
                allResults = [...allResults, ...variantResults];
            }
        }
    } catch (error) {
        console.error('Search provider error:', error);
    }

    // Check abort signal
    if (signal?.aborted) {
        return {
            results: [],
            correctedQuery: null,
            alternativeQueries: [],
            isFromCache: false,
            geminiUsed: false,
        };
    }

    // Step 4: Check if we need Gemini fallback
    let geminiResult: GeminiRewriteResult | null = null;
    let geminiUsed = false;

    if (
        !skipGemini &&
        needsGeminiFallback(allResults, typoFixedQuery, CONFIG.MIN_RESULTS_FOR_GOOD_SEARCH, CONFIG.MIN_SCORE_THRESHOLD)
    ) {
        geminiResult = await getQueryRewrite(typoFixedQuery, signal);
        geminiUsed = !!geminiResult;

        // Step 5: Search with Gemini alternatives
        if (geminiResult) {
            const queriesToTry = [
                geminiResult.corrected_query,
                ...geminiResult.alternative_queries,
                ...geminiResult.synonyms.slice(0, 2), // Only first 2 synonyms
            ].filter(q => q && q !== typoFixedQuery);

            for (const altQuery of queriesToTry) {
                if (signal?.aborted) break;
                if (allResults.length >= CONFIG.MAX_RESULTS) break;

                try {
                    const altResults = await searchFoods(altQuery, 10);
                    allResults = [...allResults, ...altResults];
                } catch (error) {
                    console.warn('Alternative query failed:', altQuery, error);
                }
            }
        }
    }

    // Step 6: Rank and dedupe all results
    const rankedResults = rankResults(allResults, typoFixedQuery);
    const finalResults = rankedResults.slice(0, CONFIG.MAX_RESULTS);

    // Determine corrected query for UI
    let correctedQuery: string | null = null;
    if (geminiResult && hasGeminiRewrite(geminiResult, rawQuery)) {
        correctedQuery = geminiResult.corrected_query;
    } else if (correctedByTypoFix) {
        correctedQuery = correctedByTypoFix;
    }

    // Build result
    const result: SearchResult = {
        results: finalResults,
        correctedQuery,
        alternativeQueries: geminiResult?.alternative_queries || [],
        isFromCache: false,
        geminiUsed,
    };

    // Step 7: Cache the result
    if (!skipCache && finalResults.length > 0) {
        const cacheKey = generateSearchCacheKey(typoFixedQuery);
        await setCache(cacheKey, result, CACHE_TTL.SEARCH_RESULTS);
    }

    return result;
}

/**
 * Create an abort controller for search cancellation
 */
export function createSearchAbortController(): AbortController {
    return new AbortController();
}

/**
 * Debounce helper for search input
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            func(...args);
        }, wait);
    };
}

// Export config for testing
export { CONFIG };
