// Dexcom Sync EGVs Edge Function
// Fetches glucose readings from Dexcom and inserts into glucose_logs

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Decrypt refresh token
async function decryptToken(ciphertext: string, iv: string, keyBase64: string): Promise<string> {
    const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);

    const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
    const ciphertextBytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, ciphertextBytes);
    return new TextDecoder().decode(decrypted);
}

// Encrypt refresh token
async function encryptToken(token: string, keyBase64: string): Promise<{ ciphertext: string; iv: string }> {
    const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(token);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

    return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
        iv: btoa(String.fromCharCode(...iv)),
    };
}

// Refresh tokens if needed
async function ensureValidToken(
    supabase: ReturnType<typeof createClient>,
    connection: Record<string, unknown>,
    userId: string
): Promise<string | null> {
    const expiresAt = new Date(connection.access_expires_at as string);
    const now = new Date();
    const twoMinutesFromNow = new Date(now.getTime() + 2 * 60 * 1000);

    // If token is still valid for more than 2 minutes, use it
    if (expiresAt > twoMinutesFromNow) {
        return connection.access_token as string;
    }

    // Need to refresh
    console.log('Access token expired or expiring soon, refreshing...');

    const encKey = Deno.env.get('DEXCOM_TOKEN_ENC_KEY')!;
    const refreshToken = await decryptToken(
        connection.refresh_token_ciphertext as string,
        connection.refresh_token_iv as string,
        encKey
    );

    const clientId = Deno.env.get('DEXCOM_CLIENT_ID')!;
    const clientSecret = Deno.env.get('DEXCOM_CLIENT_SECRET')!;
    const baseUrl = connection.dexcom_prod_base as string;

    const tokenResponse = await fetch(`${baseUrl}/v2/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });

    if (!tokenResponse.ok) {
        console.error('Token refresh failed:', await tokenResponse.text());
        return null;
    }

    const tokens = await tokenResponse.json();
    const { access_token, refresh_token: newRefreshToken, expires_in } = tokens;

    // Update stored tokens
    const { ciphertext, iv } = await encryptToken(newRefreshToken, encKey);
    const newExpiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    await supabase
        .from('dexcom_connections')
        .update({
            access_token,
            access_expires_at: newExpiresAt,
            refresh_token_ciphertext: ciphertext,
            refresh_token_iv: iv,
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

    return access_token;
}

// Convert mg/dL to mmol/L
function mgdlToMmol(mgdl: number): number {
    return Math.round((mgdl / 18.0182) * 10) / 10; // Round to 1 decimal
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Verify user
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Parse request body
        const body = await req.json().catch(() => ({}));
        const hours = body.hours || 24;

        // Get connection
        const { data: connection, error: connError } = await supabase
            .from('dexcom_connections')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (connError || !connection) {
            return new Response(JSON.stringify({ error: 'No Dexcom connection found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Ensure valid access token
        const accessToken = await ensureValidToken(supabase, connection, user.id);
        if (!accessToken) {
            return new Response(JSON.stringify({ error: 'Failed to get valid access token' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - hours * 60 * 60 * 1000);
        const baseUrl = connection.dexcom_prod_base;

        // Fetch EGVs from Dexcom (v3 API)
        const egvUrl = `${baseUrl}/v3/users/self/egvs?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;

        const egvResponse = await fetch(egvUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (!egvResponse.ok) {
            const errorText = await egvResponse.text();
            console.error('EGV fetch failed:', errorText);
            return new Response(JSON.stringify({ error: 'Failed to fetch EGVs', details: errorText }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const egvData = await egvResponse.json();
        const records = egvData.records || [];

        let inserted = 0;
        let skipped = 0;

        // Insert records
        for (const record of records) {
            // v3 API provides recordId, displayTime, value (in mg/dL by default)
            const { recordId, displayTime, systemTime, value, unit } = record;

            // Convert to mmol/L if needed
            let glucoseLevel = value;
            let finalUnit = 'mmol/L';

            if (unit === 'mg/dL' || !unit) {
                glucoseLevel = mgdlToMmol(value);
            } else {
                glucoseLevel = value;
            }

            const loggedAt = displayTime || systemTime;

            // Upsert to avoid duplicates
            const { error: insertError } = await supabase
                .from('glucose_logs')
                .upsert({
                    user_id: user.id,
                    glucose_level: glucoseLevel,
                    unit: finalUnit,
                    logged_at: loggedAt,
                    context: null,
                    notes: null,
                    source: 'dexcom',
                    external_id: recordId,
                    device: 'dexcom',
                }, {
                    onConflict: 'user_id,source,external_id',
                    ignoreDuplicates: true,
                });

            if (insertError) {
                console.error('Insert error for record:', recordId, insertError);
                skipped++;
            } else {
                inserted++;
            }
        }

        return new Response(JSON.stringify({
            ok: true,
            inserted,
            skipped,
            total: records.length,
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
