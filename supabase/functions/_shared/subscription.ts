// Server-side subscription validation against RevenueCat.
//
// Client-side checks in SubscriptionContext can be bypassed (patched JS bundle,
// direct API calls with valid JWT). Premium AI features (Gemini Vision, chat) are
// expensive and unbounded calls = real financial damage. This helper hits RevenueCat's
// REST API to verify the user has an active 'premium' entitlement.
//
// Requires:
//   - REVENUECAT_SECRET_API_KEY env var in Supabase project secrets.
//     Get this from RevenueCat dashboard → Project Settings → API Keys → "Secret API Key (V1)".
//
// Behavior:
//   - If REVENUECAT_SECRET_API_KEY is not set, returns null (allow) and logs a warning.
//     This is deliberately lenient so the function still works during the rollout window;
//     once the secret is set in prod, gating activates automatically.
//   - Caches results for 60s per user to avoid hammering RevenueCat.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const ENTITLEMENT_ID = 'premium';
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
    isPro: boolean;
    cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

interface RevenueCatSubscriber {
    subscriber?: {
        entitlements?: Record<string, { expires_date?: string | null; product_identifier?: string }>;
    };
}

async function checkRevenueCatPro(userId: string): Promise<boolean | null> {
    const secret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
    if (!secret) {
        console.warn('[subscription] REVENUECAT_SECRET_API_KEY not set — skipping server-side gating');
        return null;
    }

    try {
        const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
            headers: {
                Authorization: `Bearer ${secret}`,
                Accept: 'application/json',
            },
        });

        if (!res.ok) {
            // 404 = no subscriber record yet (free user); other errors are operational.
            if (res.status === 404) return false;
            console.error(`[subscription] RevenueCat API ${res.status} for ${userId.substring(0, 8)}`);
            return null;
        }

        const body = (await res.json()) as RevenueCatSubscriber;
        const ent = body.subscriber?.entitlements?.[ENTITLEMENT_ID];
        if (!ent) return false;

        // Active if no expiration OR expiration is in the future.
        if (!ent.expires_date) return true;
        const expiresAt = Date.parse(ent.expires_date);
        if (Number.isNaN(expiresAt)) return false;
        return expiresAt > Date.now();
    } catch (e) {
        console.error('[subscription] RevenueCat fetch error:', e instanceof Error ? e.message : String(e));
        return null;
    }
}

/**
 * Returns true if the user has an active 'premium' entitlement.
 * Returns null if RevenueCat is unreachable or unconfigured — caller should
 * decide whether to allow (fail-open) or deny (fail-closed) based on the route.
 */
export async function isUserPro(userId: string): Promise<boolean | null> {
    const cached = cache.get(userId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return cached.isPro;
    }
    const result = await checkRevenueCatPro(userId);
    if (result !== null) {
        cache.set(userId, { isPro: result, cachedAt: Date.now() });
    }
    return result;
}

/**
 * Use at the top of premium AI edge functions. Returns a 402 response if the
 * user is not a paying subscriber, or null to continue.
 *
 * Fail-open (returns null) only when RevenueCat is unreachable or the secret
 * key is not configured — never on a confirmed "not pro" response.
 */
export async function requirePro(
    _supabase: SupabaseClient,
    userId: string,
    corsHeaders: Record<string, string>,
): Promise<Response | null> {
    const isPro = await isUserPro(userId);
    if (isPro === false) {
        return new Response(
            JSON.stringify({
                error: 'Premium subscription required',
                entitlement: ENTITLEMENT_ID,
            }),
            {
                status: 402,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
        );
    }
    return null;
}
