import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * Per-user, per-function rate limits.
 * Key = function name, value = max requests per minute.
 */
const LIMITS: Record<string, number> = {
    // Most expensive: 3 parallel Gemini calls per request
    'meals-from-photo': 10,
    'meal-photo-analyze': 10,
    // Chat & insights
    'chat-wellness': 20,
    'personal-insights': 15,
    'personalized-tips': 15,
    'premeal-analyze': 15,
    'next-best-action': 15,
    'meal-adjustments': 15,
    // Weekly/batch (already infrequent, but cap anyway)
    'weekly-review': 5,
    'weekly-meal-comparison': 5,
    'score-explanation': 15,
    // Other AI-powered
    'generate-onboarding-plan': 5,
    'food-query-rewrite': 30,
    'label-parse': 15,
    'exercise-analyze': 15,
    'experiments-suggest': 10,
    'experiments-evaluate': 10,
    'calibration-update': 10,
    'compute-metabolic-profile': 10,
    'metabolic-score': 15,
};

const DEFAULT_LIMIT = 20;

/**
 * Check per-user rate limit. Call after auth, before expensive operations.
 * Returns a 429 Response if rate limit exceeded, or null if OK.
 *
 * Uses an atomic SQL function (check_rate_limit) that upserts a counter
 * per (user, function, 1-minute window) and returns the current count.
 *
 * If the rate_limits table doesn't exist yet (migration not applied),
 * silently allows the request through (fail-open).
 */
export async function checkRateLimit(
    supabase: SupabaseClient,
    userId: string,
    functionName: string,
    corsHeaders: Record<string, string>,
): Promise<Response | null> {
    const limit = LIMITS[functionName] ?? DEFAULT_LIMIT;

    try {
        const { data, error } = await supabase.rpc('check_rate_limit', {
            p_user_id: userId,
            p_function_name: functionName,
            p_window_minutes: 1,
        });

        // Fail-open: if table/function doesn't exist, allow request
        if (error) {
            console.warn(`[rate-limit] check failed for ${functionName}:`, error.message);
            return null;
        }

        const count = typeof data === 'number' ? data : 0;
        if (count > limit) {
            return new Response(
                JSON.stringify({
                    error: 'Rate limit exceeded',
                    limit,
                    retry_after_seconds: 60,
                }),
                {
                    status: 429,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                        'Retry-After': '60',
                    },
                },
            );
        }
    } catch (e) {
        // Fail-open on unexpected errors
        console.warn(`[rate-limit] unexpected error for ${functionName}:`, e);
    }

    return null;
}
