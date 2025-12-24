/**
 * Telemetry for Food Search
 * Provides timing instrumentation for search operations.
 * All logs are gated behind __DEV__ flag.
 */

export interface SearchTiming {
    requestId: number;
    query: string;
    total_ms: number;
    cache_hit: boolean;
    cache_ms?: number;
    edge_ms?: number;
    gemini_ms?: number;
    rank_ms?: number;
    results_count: number;
    stage: 'cache' | 'edge' | 'gemini';
}

/**
 * Log search timing information in development mode only
 */
export function logSearchTiming(timing: SearchTiming): void {
    if (__DEV__) {
        console.log(
            `[FoodSearch] requestId=${timing.requestId} stage=${timing.stage} ` +
            `total=${timing.total_ms}ms cache_hit=${timing.cache_hit} ` +
            `results=${timing.results_count} query="${timing.query}"`
        );

        if (timing.cache_ms !== undefined) {
            console.log(`  └─ cache: ${timing.cache_ms}ms`);
        }
        if (timing.edge_ms !== undefined) {
            console.log(`  └─ edge: ${timing.edge_ms}ms`);
        }
        if (timing.gemini_ms !== undefined) {
            console.log(`  └─ gemini: ${timing.gemini_ms}ms`);
        }
        if (timing.rank_ms !== undefined) {
            console.log(`  └─ rank: ${timing.rank_ms}ms`);
        }
    }
}

/**
 * Create a timer for measuring operation durations
 */
export function createTimer(): { elapsed: () => number } {
    const start = Date.now();
    return {
        elapsed: () => Date.now() - start,
    };
}
