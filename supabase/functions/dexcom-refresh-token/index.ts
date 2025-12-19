// Dexcom Token Refresh Edge Function
// Refreshes expired access tokens using the stored refresh token

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

        // Get existing connection
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

        // Decrypt refresh token
        const encKey = Deno.env.get('DEXCOM_TOKEN_ENC_KEY')!;
        const refreshToken = await decryptToken(
            connection.refresh_token_ciphertext,
            connection.refresh_token_iv,
            encKey
        );

        // Refresh tokens with Dexcom
        const clientId = Deno.env.get('DEXCOM_CLIENT_ID')!;
        const clientSecret = Deno.env.get('DEXCOM_CLIENT_SECRET')!;
        const baseUrl = connection.dexcom_prod_base;

        const tokenResponse = await fetch(`${baseUrl}/v2/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('Dexcom token refresh failed:', errorText);
            return new Response(JSON.stringify({ error: 'Token refresh failed' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const tokens = await tokenResponse.json();
        const { access_token, refresh_token: newRefreshToken, expires_in } = tokens;

        // Encrypt new refresh token
        const { ciphertext, iv } = await encryptToken(newRefreshToken, encKey);
        const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

        // Update connection
        const { error: dbError } = await supabase
            .from('dexcom_connections')
            .update({
                access_token,
                access_expires_at: expiresAt,
                refresh_token_ciphertext: ciphertext,
                refresh_token_iv: iv,
                updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id);

        if (dbError) {
            console.error('Database error:', dbError);
            return new Response(JSON.stringify({ error: 'Failed to update connection' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ ok: true }), {
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
