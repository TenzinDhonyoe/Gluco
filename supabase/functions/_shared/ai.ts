import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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

export async function isAiEnabled(
    supabase: SupabaseClient,
    userId: string
): Promise<boolean> {
    const { data, error } = await supabase
        .from('profiles')
        .select('ai_enabled')
        .eq('id', userId)
        .single();

    if (error) {
        console.error('AI preference lookup failed:', error);
        return false;
    }

    return data?.ai_enabled === true;
}

export async function requireAiEnabled(
    supabase: SupabaseClient,
    userId: string,
    corsHeaders: Record<string, string>
): Promise<Response | null> {
    const enabled = await isAiEnabled(supabase, userId);
    if (!enabled) {
        return buildJsonResponse({ error: 'AI insights are disabled' }, 403, corsHeaders);
    }
    return null;
}
