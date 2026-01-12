import type { SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

function buildJsonResponse(
    payload: Record<string, unknown>,
    status: number,
    corsHeaders: Record<string, string>
): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

export function getBearerToken(req: Request): string | null {
    const authHeader = req.headers.get('Authorization') || '';
    const [type, token] = authHeader.split(' ');
    if (!type || type.toLowerCase() !== 'bearer' || !token) {
        return null;
    }
    return token.trim();
}

export async function requireUser(
    req: Request,
    supabase: SupabaseClient,
    corsHeaders: Record<string, string>
): Promise<{ user: User | null; errorResponse: Response | null }> {
    const token = getBearerToken(req);
    if (!token) {
        return {
            user: null,
            errorResponse: buildJsonResponse({ error: 'Missing authorization token' }, 401, corsHeaders),
        };
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
        return {
            user: null,
            errorResponse: buildJsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders),
        };
    }

    return { user: data.user, errorResponse: null };
}

export function requireMatchingUserId(
    requestedUserId: string | undefined,
    actualUserId: string,
    corsHeaders: Record<string, string>
): Response | null {
    if (requestedUserId && requestedUserId !== actualUserId) {
        return buildJsonResponse({ error: 'User mismatch' }, 403, corsHeaders);
    }
    return null;
}
