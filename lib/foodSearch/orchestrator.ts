/**
 * Food Search Orchestrator
 * Main search function that coordinates normalization, caching, ranking, and Gemini fallback
 * 
 * Features:
 * - Progressive results (cache → edge → gemini)
 * - Request cancellation with stale response protection
 * - Batched variant searches in single Edge call
 * - Telemetry instrumentation
 */

import { NormalizedFood, searchFoodsWithVariants } from '@/lib/supabase';
import {
    CACHE_TTL,
    generateSearchCacheKey,
    getCached,
    setCache,
} from './cache';
import { getQueryRewrite, hasGeminiRewrite } from './geminiRewrite';
import { fixCommonTypos, getQueryVariants, normalizeQuery } from './normalize';
import { needsGeminiFallback, rankResults } from './rank';
import { generateRequestId, isStaleRequest } from './requestManager';
import { createTimer, logSearchTiming } from './telemetry';

// Configuration
const CONFIG = {
    MIN_QUERY_LENGTH: 2,
    MIN_RESULTS_FOR_GOOD_SEARCH: 5,
    MIN_SCORE_THRESHOLD: 50,
    MAX_RESULTS: 50,
    DEBOUNCE_MS: 250,
    MAX_VARIANTS: 3,
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
 * Metadata for progressive search stages
 */
export interface ProgressiveSearchMeta {
    stage: 'cache' | 'edge' | 'gemini';
    requestId: number;
    timing: {
        total_ms: number;
        cache_ms?: number;
        edge_ms?: number;
        gemini_ms?: number;
    };
    isComplete: boolean;
}

/**
 * Extended options for progressive search
 */
export interface SearchOptionsProgressive extends SearchOptions {
    /** Callback invoked for each stage of results */
    onPartialResults?: (results: SearchResult, meta: ProgressiveSearchMeta) => void;
}

/**
 * Check if a query change is meaningful enough to trigger a new search
 * Prevents excessive searches on every keystroke
 */
export function shouldTriggerSearch(
    newQuery: string,
    lastQuery: string | null
): boolean {
    const normalized = normalizeQuery(newQuery.trim());
    const lastNormalized = lastQuery ? normalizeQuery(lastQuery.trim()) : '';

    // Skip whitespace-only
    if (!normalized) return false;

    // Skip if unchanged
    if (normalized === lastNormalized) return false;

    // Skip if only 1 char added (wait for more intent) - unless it's short
    if (
        lastNormalized.length >= 3 &&
        normalized.length === lastNormalized.length + 1 &&
        normalized.startsWith(lastNormalized)
    ) {
        return false;
    }

    return true;
}

/**
 * Create an empty search result
 */
function emptyResult(): SearchResult {
    return {
        results: [],
        correctedQuery: null,
        alternativeQueries: [],
        isFromCache: false,
        geminiUsed: false,
    };
}

/**
 * Main orchestrated search function with progressive results
 * 
 * Flow:
 * 1. Normalize query, fix common typos
 * 2. Check cache → emit Stage 1 if hit
 * 3. Call Edge with variants → emit Stage 2
 * 4. If results < threshold, run Gemini in background → emit Stage 3
 * 5. Cache final results
 */
export async function searchWithProgressiveResults(
    rawQuery: string,
    options: SearchOptionsProgressive = {}
): Promise<SearchResult> {
    const { signal, skipCache = false, skipGemini = false, onPartialResults } = options;
    const requestId = generateRequestId();
    const totalTimer = createTimer();

    // Early return for short queries
    if (rawQuery.trim().length < CONFIG.MIN_QUERY_LENGTH) {
        return emptyResult();
    }

    // Check abort signal
    if (signal?.aborted) {
        return emptyResult();
    }

    // Step 1: Normalize and fix common typos
    const normalizedQuery = normalizeQuery(rawQuery);
    const typoFixedQuery = fixCommonTypos(rawQuery);
    const queryVariants = getQueryVariants(rawQuery)
        .filter(v => v !== typoFixedQuery)
        .slice(0, CONFIG.MAX_VARIANTS);

    const typoWasCorrected = typoFixedQuery !== normalizedQuery;
    const correctedByTypoFix = typoWasCorrected ? typoFixedQuery : null;

    // Step 2: Check cache - STAGE 1
    const cacheTimer = createTimer();
    if (!skipCache) {
        const cacheKey = generateSearchCacheKey(typoFixedQuery);
        const cached = await getCached<SearchResult>(cacheKey);

        if (cached && !isStaleRequest(requestId)) {
            const cacheResult = { ...cached, isFromCache: true };

            // Emit cache results immediately
            if (onPartialResults) {
                onPartialResults(cacheResult, {
                    stage: 'cache',
                    requestId,
                    timing: { total_ms: totalTimer.elapsed(), cache_ms: cacheTimer.elapsed() },
                    isComplete: true,
                });
            }

            logSearchTiming({
                requestId,
                query: rawQuery,
                total_ms: totalTimer.elapsed(),
                cache_hit: true,
                cache_ms: cacheTimer.elapsed(),
                results_count: cached.results.length,
                stage: 'cache',
            });

            return cacheResult;
        }
    }
    const cache_ms = cacheTimer.elapsed();

    // Check stale before network call
    if (isStaleRequest(requestId) || signal?.aborted) {
        return emptyResult();
    }

    // Step 3: Edge search with variants - STAGE 2
    const edgeTimer = createTimer();
    let allResults: NormalizedFood[] = [];
    let correctedQuery: string | null = correctedByTypoFix;

    try {
        // Single Edge call with variants
        allResults = await searchFoodsWithVariants(
            typoFixedQuery,
            queryVariants,
            CONFIG.MAX_RESULTS
        );
    } catch (error) {
        console.error('Search provider error:', error);
    }
    const edge_ms = edgeTimer.elapsed();

    // Check stale after network call
    if (isStaleRequest(requestId) || signal?.aborted) {
        return emptyResult();
    }

    // Rank and dedupe
    const rankTimer = createTimer();
    const rankedResults = rankResults(allResults, typoFixedQuery);
    const edgeResults = rankedResults.slice(0, CONFIG.MAX_RESULTS);
    const rank_ms = rankTimer.elapsed();

    // Build Stage 2 result
    const edgeResult: SearchResult = {
        results: edgeResults,
        correctedQuery,
        alternativeQueries: [],
        isFromCache: false,
        geminiUsed: false,
    };

    // Emit Edge results
    const needsGemini = !skipGemini && needsGeminiFallback(
        edgeResults,
        typoFixedQuery,
        CONFIG.MIN_RESULTS_FOR_GOOD_SEARCH,
        CONFIG.MIN_SCORE_THRESHOLD
    );

    if (onPartialResults) {
        onPartialResults(edgeResult, {
            stage: 'edge',
            requestId,
            timing: { total_ms: totalTimer.elapsed(), cache_ms, edge_ms },
            isComplete: !needsGemini,
        });
    }

    logSearchTiming({
        requestId,
        query: rawQuery,
        total_ms: totalTimer.elapsed(),
        cache_hit: false,
        cache_ms,
        edge_ms,
        rank_ms,
        results_count: edgeResults.length,
        stage: 'edge',
    });

    // Cache Edge results
    if (edgeResults.length > 0) {
        const cacheKey = generateSearchCacheKey(typoFixedQuery);
        await setCache(cacheKey, edgeResult, CACHE_TTL.SEARCH_RESULTS);
    }

    // If no Gemini needed, we're done
    if (!needsGemini) {
        return edgeResult;
    }

    // Step 4: Gemini fallback in background - STAGE 3
    // Fire Gemini but don't block - return Edge results immediately
    runGeminiEnhancement(
        rawQuery,
        typoFixedQuery,
        edgeResults,
        requestId,
        totalTimer,
        cache_ms,
        edge_ms,
        signal,
        onPartialResults
    );

    return edgeResult;
}

/**
 * Run Gemini enhancement in background and emit updated results
 */
async function runGeminiEnhancement(
    rawQuery: string,
    typoFixedQuery: string,
    currentResults: NormalizedFood[],
    requestId: number,
    totalTimer: { elapsed: () => number },
    cache_ms: number,
    edge_ms: number,
    signal: AbortSignal | undefined,
    onPartialResults: SearchOptionsProgressive['onPartialResults']
): Promise<void> {
    const geminiTimer = createTimer();

    try {
        const geminiResult = await getQueryRewrite(typoFixedQuery, signal);

        if (!geminiResult || isStaleRequest(requestId) || signal?.aborted) {
            return;
        }

        // Search with Gemini alternatives
        const altQueries = [
            geminiResult.corrected_query,
            ...geminiResult.alternative_queries,
            ...geminiResult.synonyms.slice(0, 2),
        ].filter(q => q && q !== typoFixedQuery);

        if (altQueries.length === 0) {
            return;
        }

        // Search with Gemini suggestions
        const altResults = await searchFoodsWithVariants(
            altQueries[0],
            altQueries.slice(1, 3),
            15
        );

        if (isStaleRequest(requestId) || signal?.aborted) {
            return;
        }

        // Merge and rank
        const mergedResults = [...currentResults, ...altResults];
        const rankedResults = rankResults(mergedResults, typoFixedQuery);
        const finalResults = rankedResults.slice(0, CONFIG.MAX_RESULTS);

        // Determine corrected query for UI
        let correctedQuery: string | null = null;
        if (hasGeminiRewrite(geminiResult, rawQuery)) {
            correctedQuery = geminiResult.corrected_query;
        }

        const geminiSearchResult: SearchResult = {
            results: finalResults,
            correctedQuery,
            alternativeQueries: geminiResult.alternative_queries,
            isFromCache: false,
            geminiUsed: true,
        };

        const gemini_ms = geminiTimer.elapsed();

        // Emit Gemini-enhanced results
        if (onPartialResults && !isStaleRequest(requestId)) {
            onPartialResults(geminiSearchResult, {
                stage: 'gemini',
                requestId,
                timing: { total_ms: totalTimer.elapsed(), cache_ms, edge_ms, gemini_ms },
                isComplete: true,
            });
        }

        logSearchTiming({
            requestId,
            query: rawQuery,
            total_ms: totalTimer.elapsed(),
            cache_hit: false,
            cache_ms,
            edge_ms,
            gemini_ms,
            results_count: finalResults.length,
            stage: 'gemini',
        });

        // Update cache with enhanced results
        const cacheKey = generateSearchCacheKey(typoFixedQuery);
        await setCache(cacheKey, geminiSearchResult, CACHE_TTL.SEARCH_RESULTS);

    } catch (error) {
        console.warn('Gemini enhancement failed:', error);
    }
}

/**
 * Legacy search function - maintains backward compatibility
 * Calls progressive search but only returns final result
 */
export async function searchWithOrchestration(
    rawQuery: string,
    options: SearchOptions = {}
): Promise<SearchResult> {
    return searchWithProgressiveResults(rawQuery, options);
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
