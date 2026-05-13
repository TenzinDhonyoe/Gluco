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
 * Failure modes:
 *   - "function/table missing" (PG codes 42883, 42P01) → fail-open with warning.
 *     This only applies before the rate-limit migration is deployed.
 *   - All other errors (DB unavailable, RPC timeout) → fail-CLOSED with 429.
 *     Without this, a DB outage means unbounded paid-API calls.
 */

function isMissingObjectError(err: { code?: string; message?: string } | null | undefined): boolean {
    if (!err) return false;
    if (err.code === '42883' || err.code === '42P01' || err.code === 'PGRST202') return true;
    const msg = (err.message || '').toLowerCase();
    return (
        msg.includes('function') && msg.includes('does not exist') ||
        msg.includes('relation') && msg.includes('does not exist') ||
        msg.includes('could not find')
    );
}

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

        if (error) {
            if (isMissingObjectError(error)) {
                console.warn(`[rate-limit] migration not deployed for ${functionName}, allowing:`, error.message);
                return null;
            }
            // DB available but RPC failed (timeout, perms, etc) — fail closed to protect billing.
            console.error(`[rate-limit] check failed (fail-closed) for ${functionName}:`, error.message);
            return new Response(
                JSON.stringify({
                    error: 'Service temporarily unavailable',
                    retry_after_seconds: 30,
                }),
                {
                    status: 503,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                        'Retry-After': '30',
                    },
                },
            );
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
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[rate-limit] unexpected error (fail-closed) for ${functionName}:`, msg);
        return new Response(
            JSON.stringify({
                error: 'Service temporarily unavailable',
                retry_after_seconds: 30,
            }),
            {
                status: 503,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'Retry-After': '30',
                },
            },
        );
    }

    return null;
}
